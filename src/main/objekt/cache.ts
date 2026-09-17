import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { app, net } from 'electron';
import { toObjektFileUrl } from './file-protocol';

// §9 Caching: images and metadata cache to userData/cache. Metadata TTL is
// 6 hours; images are content-addressed by URL hash, so they're effectively
// permanent — the same URL always maps to the same file and is never
// re-fetched once present.
const METADATA_TTL_MS = 6 * 60 * 60 * 1000;

function cacheRoot(): string {
  return join(app.getPath('userData'), 'cache');
}

function imagesDir(): string {
  return join(cacheRoot(), 'images');
}

function metadataDir(): string {
  return join(cacheRoot(), 'metadata');
}

function listDir(): string {
  return join(cacheRoot(), 'lists');
}

function hashOf(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

// Downloads and caches a remote image by content-addressed URL hash,
// returning a pulsar-objekt:// URL the renderer can load like any other
// local file. Never re-downloads a URL that's already on disk.
export async function cacheImage(url: string): Promise<string> {
  const dir = imagesDir();
  await ensureDir(dir);
  const ext = extname(new URL(url).pathname) || '.bin';
  const filePath = join(dir, `${hashOf(url)}${ext}`);

  try {
    await readFile(filePath);
    return toObjektFileUrl(filePath);
  } catch {
    // Not cached yet — fall through to fetch.
  }

  const response = await net.fetch(url, {
    headers: { 'User-Agent': 'pulsar-desktop-pet (github.com/teamreflex/cosmo-web reference)' },
  });
  if (!response.ok) {
    throw new Error(`image fetch failed: ${response.status} ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
  return toObjektFileUrl(filePath);
}

type CachedMetadataEnvelope<T> = { cachedAt: number; value: T };

export async function getCachedMetadata<T>(tokenId: string): Promise<T | null> {
  try {
    const raw = await readFile(join(metadataDir(), `${tokenId}.json`), 'utf8');
    const envelope = JSON.parse(raw) as CachedMetadataEnvelope<T>;
    if (Date.now() - envelope.cachedAt > METADATA_TTL_MS) return null;
    return envelope.value;
  } catch {
    return null;
  }
}

export async function setCachedMetadata<T>(tokenId: string, value: T): Promise<void> {
  await ensureDir(metadataDir());
  const envelope: CachedMetadataEnvelope<T> = { cachedAt: Date.now(), value };
  await writeFile(join(metadataDir(), `${tokenId}.json`), JSON.stringify(envelope));
}

// The last successfully resolved objekt list for a given remote-source key
// (the signed-in account's wallet address), kept with no TTL of its own.
// This is the "fall back to cache" tier of §14 M3's degradation chain — it's
// only ever replaced by a fresh successful resolve, never expired on its
// own, so a stale-but-real collection outlives a temporary Cosmo/RPC outage.
type CachedListEnvelope<T> = { cachedAt: number; value: T };

function isListEnvelope<T>(parsed: unknown): parsed is CachedListEnvelope<T> {
  return typeof parsed === 'object' && parsed !== null && 'cachedAt' in parsed && 'value' in parsed;
}

async function readListEnvelope<T>(key: string): Promise<CachedListEnvelope<T> | null> {
  try {
    const raw = await readFile(join(listDir(), `${hashOf(key)}.json`), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isListEnvelope<T>(parsed)) return parsed;
    // Written before list caches tracked a timestamp — still a valid cached
    // list, just with no known cache time (see getCachedListCachedAt).
    return { cachedAt: 0, value: parsed as T };
  } catch {
    return null;
  }
}

export async function getCachedList<T>(key: string): Promise<T | null> {
  const envelope = await readListEnvelope<T>(key);
  return envelope?.value ?? null;
}

// null means "never cached" or "cached before this was tracked" — both
// render the same way in the tray (see menu-sections.ts's lastCachedLabel).
export async function getCachedListCachedAt(key: string): Promise<number | null> {
  const envelope = await readListEnvelope(key);
  return envelope && envelope.cachedAt > 0 ? envelope.cachedAt : null;
}

export async function setCachedList<T>(key: string, value: T): Promise<void> {
  await ensureDir(listDir());
  const envelope: CachedListEnvelope<T> = { cachedAt: Date.now(), value };
  await writeFile(join(listDir(), `${hashOf(key)}.json`), JSON.stringify(envelope));
}

// Dev/debug escape hatch — not wired to any UI, but useful when iterating on
// the remote-source mapping without waiting out the metadata TTL.
export async function clearCache(): Promise<void> {
  await rm(cacheRoot(), { recursive: true, force: true });
}

// Called on every startup (see index.ts) so each launch re-derives every
// objekt's card back — backImage/backgroundColor/textColor, i.e. everything
// synthesized-or-composited card back rendering depends on — from a fresh
// fetch instead of trusting up to 6h of on-disk staleness. This matters
// because that fetch can go through different paths run to run (v1 directly,
// or v3 + the objekt.top textColor fallback when v1 is down — see
// remote-source.ts), so a cached entry can freeze in a worse result than a
// fresh fetch would produce right now. Only the metadata dir: images are
// content-addressed by URL and genuinely permanent, and the list cache is
// left alone so primeFromCache can still paint instantly on startup before
// the live re-fetch (using this now-empty metadata cache) lands.
export async function clearMetadataCache(): Promise<void> {
  await rm(metadataDir(), { recursive: true, force: true });
}
