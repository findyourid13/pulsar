import { randomUUID } from 'node:crypto';
import { net } from 'electron';
import type { Objekt, Settings } from '@shared/types';
import { cacheImage, getCachedList, getCachedListCachedAt, getCachedMetadata, setCachedList, setCachedMetadata } from './cache';
import { CosmoSessionExpiredError, refreshCosmoSession } from './cosmo-auth';
import { patchSettings } from '../settings';

// §9 remote-source (M3). Two paths to the same Objekt[], tried in order:
//
// 1. Authenticated (added 2026-09-15): one call to
//    `/bff/v3/objekt-summaries` per artist with the signed-in user's own
//    Cosmo accessToken. Returns their collection with real front/back
//    artwork and Cosmo's own colors already attached. See the section above
//    createRemoteSource.
// 2. Credential-free (the original, verified against packages/cosmo and
//    apps/indexer in teamreflex/cosmo-web, 2026-08-14): address -> owned
//    token IDs read straight off the objekt contract -> per-token metadata,
//    with apollo.cafe and objekt.top filling the gaps v1 can't. No session
//    cookie, no bearer token, so it still runs when path 1 can't.
//
// The address path 2 needs is *not* the auth provider's wallet address — confirmed
// 2026-09-14 that it differs from the actual on-chain owner (an Abstract
// smart-wallet address), so login-window.ts calls resolveAddressByNickname
// below, using the nickname the login prompt asks for right after the code.

const COSMO_ENDPOINT = 'https://api.cosmo.fans';
const ABSTRACT_RPC = 'https://api.mainnet.abs.xyz';
// The objekt contract on Abstract, per packages/util's Addresses.OBJEKT.
const OBJEKT_CONTRACT = '0x99Bb83AE9bb0C0A6be865CaCF67760947f91Cb70';
// Standard ERC721(Enumerable) selectors — fixed by the 4-byte function
// signature hash, not something specific to this contract.
const SELECTOR_BALANCE_OF = '0x70a08231'; // balanceOf(address)
const SELECTOR_TOKEN_OF_OWNER_BY_INDEX = '0x2f745c59'; // tokenOfOwnerByIndex(address,uint256)

const RPC_CONCURRENCY = 8;
const METADATA_CONCURRENCY = 8;

const USER_AGENT = 'pulsar-desktop-pet (github.com/teamreflex/cosmo-web reference)';

class RemoteSourceError extends Error {}

type CosmoByNickname = {
  nickname: string;
  address: string;
  profileImageUrl: string;
  guid: string;
};

export type CosmoObjektMetadataV1 = {
  objekt: {
    collectionId: string;
    season: string;
    member: string;
    artists: string[];
    collectionNo: string;
    class: string;
    thumbnailImage: string;
    frontImage: string;
    backImage: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    tokenId: string;
    objektNo: number;
    tokenAddress: string;
    transferable: boolean;
    // Motion-class objekts only (verified against packages/cosmo's
    // ObjektBaseFields in teamreflex/cosmo-web) — null for everything else.
    frontMedia: string | null;
  };
};

type CosmoObjektMetadataV3 = {
  name: string;
  description: string;
  image: string;
  background_color: string;
  attributes: { trait_type: string; value: string }[];
};

async function cosmoFetch<T>(path: string): Promise<T> {
  const response = await net.fetch(`${COSMO_ENDPOINT}${path}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new RemoteSourceError(`cosmo ${path} → ${response.status}`);
  }
  return (await response.json()) as T;
}

// The one lookup login-window.ts needs post-login: turns the Cosmo nickname
// the user types into the actual on-chain owner address. Unauthenticated —
// see the file-level comment above for why this, and not the auth provider's wallet, is
// the address remote-source resolves collections from.
export async function resolveAddressByNickname(nickname: string): Promise<string> {
  const { address } = await cosmoFetch<CosmoByNickname>(`/bff/v3/users/by-nickname/${encodeURIComponent(nickname)}`);
  return address;
}

export function padHex32(hex: string): string {
  return hex.padStart(64, '0');
}

async function ethCall(data: string): Promise<bigint> {
  const response = await net.fetch(ABSTRACT_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: OBJEKT_CONTRACT, data }, 'latest'],
    }),
  });
  const body = (await response.json()) as { result?: string; error?: { message: string } };
  if (body.error) {
    throw new RemoteSourceError(`abstract rpc error: ${body.error.message}`);
  }
  if (body.result === undefined) {
    throw new RemoteSourceError('abstract rpc: empty result');
  }
  return BigInt(body.result);
}

async function balanceOf(address: string): Promise<bigint> {
  const data = SELECTOR_BALANCE_OF + padHex32(address.slice(2).toLowerCase());
  return ethCall(data);
}

async function tokenOfOwnerByIndex(address: string, index: number): Promise<bigint> {
  const data =
    SELECTOR_TOKEN_OF_OWNER_BY_INDEX + padHex32(address.slice(2).toLowerCase()) + padHex32(index.toString(16));
  return ethCall(data);
}

// Runs `items` through `fn` with at most `limit` in flight at once.
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// objekt.top's own public collection list (a third-party indexer, not
// Cosmo) — used only to fill in textColor when v1 is down, since v3's own
// nft-metadata fallback doesn't expose it at all (see fetchMetadata). One
// bulk fetch (~15k collections, ~14MB) covers every collectionId at once,
// so it's cached to disk like any other metadata and memoized in-process
// for the rest of this run — never re-fetched per token.
type ObjektTopColors = Map<string, { backgroundColor: string; textColor: string }>;

let objektTopColorsPromise: Promise<ObjektTopColors> | null = null;

async function fetchObjektTopColors(): Promise<ObjektTopColors> {
  const cacheKey = 'objekt-top-colors';
  const cached = await getCachedMetadata<Record<string, { backgroundColor: string; textColor: string }>>(cacheKey);
  if (cached) return new Map(Object.entries(cached));

  const response = await net.fetch('https://objekt.top/api/collection', {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new RemoteSourceError(`objekt.top /api/collection → ${response.status}`);
  }
  const body = (await response.json()) as {
    collections: Array<{ collectionId: string; backgroundColor: string; textColor: string }>;
  };

  const record: Record<string, { backgroundColor: string; textColor: string }> = {};
  for (const collection of body.collections) {
    record[collection.collectionId] = { backgroundColor: collection.backgroundColor, textColor: collection.textColor };
  }
  await setCachedMetadata(cacheKey, record);
  return new Map(Object.entries(record));
}

function getObjektTopColors(): Promise<ObjektTopColors> {
  if (!objektTopColorsPromise) {
    objektTopColorsPromise = fetchObjektTopColors().catch((error: unknown) => {
      objektTopColorsPromise = null; // let the next v3 fallback retry instead of staying broken all run
      throw error;
    });
  }
  return objektTopColorsPromise;
}

// apollo.cafe (github.com/teamreflex, same authors as the cosmo-web
// reference) exposes a clean, unauthenticated, CDN-cached per-collection
// lookup (`Cache-Control: s-maxage=86400`) keyed by the same slug shape as
// its frontMedia CDN paths — verified directly (2026-08-19): no cookie/auth
// needed, 200 with frontMedia populated for a real Motion objekt, 200 with
// frontMedia: null for a non-Motion one, clean 404 for an unknown slug, and
// a real distinct backImage in both cases. Covers both frontMedia and
// backImage in one call since both are missing from v3 alike — textColor
// still comes from getObjektTopColors' single bulk fetch instead, which
// stays cheaper for accounts with many objekts than a per-token call here
// would be for a field only needed as a scalar, not a URL.
const APOLLO_BY_SLUG_ENDPOINT = 'https://apollo.cafe/api/objekts/by-slug';

type ApolloObjekt = { frontMedia: string | null; backImage: string | null };

function apolloSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

// A "Unit" objekt pairs two members, but Cosmo's own `member` field only
// ever names one of them (see objekt-catalog.ts's UNIT_PAIR_PATTERN comment)
// — the pairing only shows up in `collectionId`, e.g. "Winter26 id13 X id14
// 401Z". apollo's own slug wants that full pairing ("winter26-id13-x-id14-
// 401z" — verified directly, 2026-08-19), so this pulls the middle segment
// out of collectionId (between the known season prefix and collectionNo
// suffix) instead of trusting `member` directly, which covers both the
// single-member and paired-member shapes without needing a class check.
export function apolloMemberSegment(objekt: CosmoObjektMetadataV1['objekt']): string | null {
  const { collectionId, season, collectionNo, member } = objekt;
  if (collectionId.startsWith(season) && collectionId.endsWith(collectionNo)) {
    const middle = collectionId.slice(season.length, collectionId.length - collectionNo.length).trim();
    if (middle) return middle;
  }
  return member || null;
}

async function fetchApolloExtras(objekt: CosmoObjektMetadataV1['objekt']): Promise<ApolloObjekt | null> {
  if (!objekt.season || !objekt.collectionNo) return null;
  const memberSegment = apolloMemberSegment(objekt);
  if (!memberSegment) return null;

  const slug = `${apolloSlug(objekt.season)}-${apolloSlug(memberSegment)}-${apolloSlug(objekt.collectionNo)}`;
  const response = await net.fetch(`${APOLLO_BY_SLUG_ENDPOINT}/${slug}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) return null; // includes 404 "Collection not found" — not every slug apollo knows about
  return (await response.json()) as ApolloObjekt;
}

export function normalizeV3(metadata: CosmoObjektMetadataV3): CosmoObjektMetadataV1 {
  const trait = (name: string): string => metadata.attributes.find((a) => a.trait_type === name)?.value ?? '';
  return {
    objekt: {
      collectionId: metadata.name.replace(/ #\d+$/, ''),
      season: trait('Season'),
      member: trait('Member'),
      artists: [trait('Artist')],
      collectionNo: trait('Collection'),
      class: trait('Class'),
      thumbnailImage: metadata.image,
      frontImage: metadata.image,
      backImage: '', // not recoverable from v3 — falls back to front on both faces
      accentColor: metadata.background_color,
      backgroundColor: metadata.background_color,
      textColor: '#000000',
      tokenId: '',
      objektNo: 0,
      tokenAddress: '0x0000000000000000000000000000000000000000',
      transferable: true,
      frontMedia: null, // not exposed by the v3 fallback — falls back to frontImage
    },
  };
}

async function fetchMetadata(tokenId: string): Promise<CosmoObjektMetadataV1> {
  const cached = await getCachedMetadata<CosmoObjektMetadataV1>(tokenId);
  if (cached) return cached;

  let metadata: CosmoObjektMetadataV1;
  try {
    metadata = await cosmoFetch<CosmoObjektMetadataV1>(`/objekt/v1/token/${tokenId}`);
  } catch {
    // v1 has been observed down as a whole service while v3 stays healthy —
    // §9 calls this out explicitly as the fallback path, not just a
    // per-token edge case.
    const v3 = await cosmoFetch<CosmoObjektMetadataV3>(`/bff/v3/objekts/nft-metadata/${tokenId}`);
    metadata = normalizeV3(v3);

    // Best-effort fill for the one real field v3 can't provide at all —
    // doesn't fail the objekt if objekt.top is also unreachable, just
    // keeps normalizeV3's black-text default.
    try {
      const colors = await getObjektTopColors();
      const match = colors.get(metadata.objekt.collectionId);
      if (match) metadata.objekt.textColor = match.textColor;
    } catch {
      // objekt.top unreachable too — normalizeV3's default stands.
    }

    // Same best-effort spirit: v3 never exposes frontMedia, and sets
    // backImage to '' (which toObjekt then falls back to frontImage for —
    // showing the same art on both faces), so without this every objekt
    // shows a duplicated front/back for as long as v1 stays down, and Motion
    // ones also lose their video. A failed/unreachable lookup just leaves
    // both as normalizeV3 set them, same as if apollo.cafe didn't exist.
    try {
      const extras = await fetchApolloExtras(metadata.objekt);
      if (extras?.frontMedia) metadata.objekt.frontMedia = extras.frontMedia;
      if (extras?.backImage) metadata.objekt.backImage = extras.backImage;
    } catch {
      // apollo.cafe unreachable too — normalizeV3's defaults stand.
    }
  }

  await setCachedMetadata(tokenId, metadata);
  return metadata;
}

async function toObjekt(tokenId: string): Promise<Objekt> {
  const metadata = await fetchMetadata(tokenId);
  const { objekt } = metadata;
  const backSource = objekt.backImage || objekt.frontImage;

  const [frontImageUrl, backImageUrl, frontVideoUrl] = await Promise.all([
    cacheImage(objekt.frontImage),
    cacheImage(backSource),
    // Best-effort: a broken/unreachable video shouldn't fail the whole
    // objekt — falls back to the static frontImageUrl, same as when Cosmo
    // itself has no frontMedia for this token at all.
    objekt.frontMedia ? cacheImage(objekt.frontMedia).catch(() => undefined) : Promise.resolve(undefined),
  ]);

  return {
    id: tokenId,
    frontImageUrl,
    frontVideoUrl,
    backImageUrl,
    backgroundColor: objekt.backgroundColor || objekt.accentColor,
    textColor: objekt.textColor,
    artist: objekt.artists[0],
    collectionId: objekt.collectionId,
    member: objekt.member,
    season: objekt.season,
    collectionNo: objekt.collectionNo,
    class: objekt.class,
    source: 'remote',
  };
}

// --- Authenticated path (§9 Login, revised 2026-09-15) ---------------------
//
// With a real Cosmo session, one endpoint replaces the whole chain above:
// `/bff/v3/objekt-summaries` returns the signed-in user's own collection
// with real frontImage/backImage/frontMedia and Cosmo's own colors already
// on it — no per-token metadata call, no apollo.cafe or objekt.top fill-in,
// no on-chain walk. It is scoped to the caller by bearer token alone
// (confirmed: the same query returns a different collectionCount per
// account), so it needs no address and can't browse anyone else's
// collection.
//
// The on-chain path above stays as the fallback for when this one can't run
// — no session yet, the login proxy unreachable, or a refresh token that has
// finally died. It needs no credentials, so it still works signed out.

type CosmoSession = NonNullable<Settings['objekts']['cosmoSession']>;

type CosmoArtist = { id: string };

type ObjektSummariesResponse = {
  collectionCount: number;
  collections: Array<{
    collection: {
      season: string;
      collectionNo: string;
      class: string;
      member: string;
      thumbnailImage: string;
      frontImage: string;
      frontMedia: string | null;
      backImage: string;
      accentColor: string;
      backgroundColor: string;
      textColor: string;
      collectionId: string;
      artistName: string;
    };
    objekts: Array<{ metadata: { tokenId: number } }>;
  }>;
};

const SUMMARIES_PAGE_SIZE = 30;

// The same client headers the real app sends on api.cosmo.fans, minus the
// encryption ones — objekt-summaries is a plain GET, not an
// `x-cosmo-encrypted` body like login is.
function cosmoClientHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'cosmo/515 CFNetwork/3860.700.2 Darwin/25.6.0',
    deviceid: 'iPhone15,2',
    appversion: '2.48.0',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko',
    'x-client-trace-id': randomUUID(),
  };
}

class UnauthorizedError extends Error {}

// Which artists exist at all — public and unauthenticated, so it stays
// correct if MODHAUS adds a fourth rather than hardcoding today's three
// (idntt, tripleS, artms). A collection is queried per artist because
// objekt-summaries takes exactly one artistId; artists the user owns nothing
// from just answer with an empty list.
async function fetchArtistIds(): Promise<string[]> {
  const artists = await cosmoFetch<CosmoArtist[]>('/bff/v3/artists');
  return artists.map((artist) => artist.id);
}

async function fetchSummariesPage(artistId: string, page: number, accessToken: string): Promise<ObjektSummariesResponse> {
  const query = `artistId=${encodeURIComponent(artistId)}&order=newest&page=${page}&size=${SUMMARIES_PAGE_SIZE}`;
  const response = await net.fetch(`${COSMO_ENDPOINT}/bff/v3/objekt-summaries?${query}`, {
    headers: cosmoClientHeaders(accessToken),
  });
  if (response.status === 401) throw new UnauthorizedError('objekt-summaries → 401');
  if (!response.ok) throw new RemoteSourceError(`cosmo objekt-summaries → ${response.status}`);
  return (await response.json()) as ObjektSummariesResponse;
}

// One Objekt per owned token, but the artwork is per *collection* — every
// copy of a collection shares the same three URLs, so they're cached once
// here rather than once per token.
async function collectionToObjekts(entry: ObjektSummariesResponse['collections'][number]): Promise<Objekt[]> {
  const { collection } = entry;
  const [frontImageUrl, backImageUrl, frontVideoUrl] = await Promise.all([
    cacheImage(collection.frontImage),
    cacheImage(collection.backImage || collection.frontImage),
    // Best-effort, same as the on-chain path: a broken video falls back to
    // the static front image rather than failing the objekt.
    collection.frontMedia ? cacheImage(collection.frontMedia).catch(() => undefined) : Promise.resolve(undefined),
  ]);

  return entry.objekts.map((objekt) => ({
    id: objekt.metadata.tokenId.toString(),
    frontImageUrl,
    frontVideoUrl,
    backImageUrl,
    backgroundColor: collection.backgroundColor || collection.accentColor,
    textColor: collection.textColor,
    artist: collection.artistName,
    collectionId: collection.collectionId,
    member: collection.member,
    season: collection.season,
    collectionNo: collection.collectionNo,
    class: collection.class,
    source: 'remote' as const,
  }));
}

async function listOwnedObjektsWithToken(accessToken: string): Promise<Objekt[]> {
  const artistIds = await fetchArtistIds();
  const objekts: Objekt[] = [];

  for (const artistId of artistIds) {
    // Sequential: page N+1 only makes sense once page N came back short of a
    // full page, which is the only end-of-list signal this endpoint gives.
    for (let page = 1; ; page++) {
      const body = await fetchSummariesPage(artistId, page, accessToken);
      const entries = body.collections ?? [];
      const mapped = await mapWithConcurrency(entries, METADATA_CONCURRENCY, collectionToObjekts);
      for (const group of mapped) objekts.push(...group);
      if (entries.length < SUMMARIES_PAGE_SIZE) break;
    }
  }

  return objekts;
}

// Runs the authenticated path, refreshing the session once if the access
// token has expired mid-flight. A refresh that succeeds is written straight
// back to Settings so the next launch starts from the fresh pair.
async function listOwnedObjekts(session: CosmoSession): Promise<Objekt[]> {
  try {
    return await listOwnedObjektsWithToken(session.accessToken);
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;

    try {
      const credentials = await refreshCosmoSession(session.refreshToken);
      patchSettings({ objekts: { cosmoSession: credentials } });
      return await listOwnedObjektsWithToken(credentials.accessToken);
    } catch (refreshError) {
      // The refresh token itself is dead — no amount of retrying fixes that,
      // and leaving it in Settings means paying two doomed requests on every
      // refresh from here on. Drop it; cosmoAccount stays, so the fallback
      // path below still has an address to work with, and signing in again
      // restores this one.
      if (refreshError instanceof CosmoSessionExpiredError) {
        patchSettings({ objekts: { cosmoSession: null } });
      }
      throw refreshError;
    }
  }
}

export type RemoteSource = {
  list(): Promise<Objekt[]>;
  // Reflects the outcome of the most recent list() call: true if a live
  // fetch failed and the last-known-good cached list was served instead.
  lastServedFromCache(): boolean;
};

function listCacheKey(address: string): string {
  return `address:${address.toLowerCase()}`;
}

// Reads the last-known-good cached list without touching the network — for
// painting the real card on startup immediately, before the live fetch
// (which can take a few seconds) resolves. See state.ts's reloadObjekts.
export async function peekCachedObjekts(address: string): Promise<Objekt[] | null> {
  return getCachedList<Objekt[]>(listCacheKey(address));
}

// When the on-disk list cache for this address was last written — by a
// live resolve or a fallback-to-cache serve, either way it's whatever's
// actually on disk right now. null means never cached (or cached before
// this was tracked). See state.ts's getCollectionCachedAt.
export async function getListCachedAt(address: string): Promise<number | null> {
  return getCachedListCachedAt(listCacheKey(address));
}

export function createRemoteSource(address: string, session: CosmoSession | null): RemoteSource {
  let servedFromCache = false;

  return {
    async list() {
      servedFromCache = false;
      const cacheKey = listCacheKey(address);

      if (session) {
        try {
          const objekts = await listOwnedObjekts(session);
          await setCachedList(cacheKey, objekts);
          return objekts;
        } catch (error) {
          // Session dead, login proxy down, or Cosmo refusing — fall through
          // to the credential-free on-chain path, which needs neither. Logged
          // rather than swallowed: the fallback silently produces worse
          // artwork (duplicated front/back), and without this line that
          // degradation is invisible until someone goes digging in the cache.
          console.error('Authenticated objekt fetch failed, falling back to on-chain path:', error);
        }
      }

      try {
        const balance = await balanceOf(address);

        const indices = Array.from({ length: Number(balance) }, (_, i) => i);
        const tokenIds = await mapWithConcurrency(indices, RPC_CONCURRENCY, (index) =>
          tokenOfOwnerByIndex(address, index),
        );

        const objekts = await mapWithConcurrency(
          tokenIds.map((id) => id.toString()),
          METADATA_CONCURRENCY,
          toObjekt,
        );

        await setCachedList(cacheKey, objekts);
        return objekts;
      } catch (error) {
        // §14 M3: on failure, fall back to the last cached list for this
        // address rather than surfacing nothing. Falling back further, to
        // the local source, is provider.ts's job, not this one's.
        const cached = await getCachedList<Objekt[]>(cacheKey);
        if (cached) {
          servedFromCache = true;
          return cached;
        }
        throw error instanceof Error ? error : new RemoteSourceError(String(error));
      }
    },
    lastServedFromCache() {
      return servedFromCache;
    },
  };
}
