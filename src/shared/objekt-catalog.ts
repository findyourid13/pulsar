// Static catalog facets (artists, members, seasons, classes) that Cosmo's
// credential-free API doesn't expose directly — /bff/v3/artists needs a
// Bearer token (off-limits per §9's "never ask for Cosmo credentials"),
// and there's no endpoint at all for "every season/class that exists."
//
// Sourced from public references, then cross-checked byte-for-byte against
// objekt.top's own live hydration payload (their actual DB records —
// `alias`/`order`/`artistId` per member, `seasonsMap`/`classesMap` per
// artist — embedded in the page on load, 2026-08-14). Every entry matched
// what had already been compiled from cosmo-web's MIT-licensed search-
// synonym data (tripleS) and MODHAUS's public per-unit reveals (idntt).
//
// This is catalog *metadata* only — the shape of the three groups' known
// rosters/seasons/classes, not individual objekt records. It doesn't
// change §14 M4's conclusion that a full, live, browsable objekt catalog
// needs an indexer Pulsar doesn't run.

export const ALL_ARTISTS = ['tripleS', 'ARTMS', 'idntt'];

// S1–S24 / id1–id21 — each group's own public numbering. idntt only has
// id1–id21 revealed so far (checked against objekt.top directly); id22–24
// render with no prefix until they're public. ARTMS members get no
// numeric prefix at all — their alias is just their own name.
export const TRIPLE_S_MEMBER_ALIASES: Record<string, string> = {
  SeoYeon: 'S1',
  HyeRin: 'S2',
  JiWoo: 'S3',
  ChaeYeon: 'S4',
  YooYeon: 'S5',
  SooMin: 'S6',
  NaKyoung: 'S7',
  YuBin: 'S8',
  Kaede: 'S9',
  DaHyun: 'S10',
  Kotone: 'S11',
  YeonJi: 'S12',
  Nien: 'S13',
  SoHyun: 'S14',
  Xinyu: 'S15',
  Mayu: 'S16',
  Lynn: 'S17',
  JooBin: 'S18',
  HaYeon: 'S19',
  ShiOn: 'S20',
  ChaeWon: 'S21',
  Sullin: 'S22',
  SeoAh: 'S23',
  JiYeon: 'S24',
};

export const IDNTT_MEMBER_ALIASES: Record<string, string> = {
  DoHun: 'id1',
  HeeJu: 'id2',
  MinGyeol: 'id3',
  TaeIn: 'id4',
  JaeYoung: 'id5',
  JuHo: 'id6',
  JiWoon: 'id7',
  HwanHee: 'id8',
  CheongMyeong: 'id9',
  Towa: 'id10',
  KyuHyuk: 'id11',
  NuRi: 'id12',
  SeongJun: 'id13',
  YeJoon: 'id14',
  GyeongBeen: 'id15',
  EunSoo: 'id16',
  GiWoong: 'id17',
  JooHeon: 'id18',
  GyungHo: 'id19',
  EunChan: 'id20',
  EunSung: 'id21',
};

const ARTMS_MEMBERS = ['HeeJin', 'HaSeul', 'KimLip', 'JinSoul', 'Choerry'];

export const ARTIST_MEMBERS: Record<string, string[]> = {
  tripleS: Object.keys(TRIPLE_S_MEMBER_ALIASES),
  ARTMS: ARTMS_MEMBERS,
  idntt: Object.keys(IDNTT_MEMBER_ALIASES),
};

export const ARTIST_SEASONS: Record<string, string[]> = {
  tripleS: ['Atom01', 'Binary01', 'Cream01', 'Divine01', 'Ever01', 'Atom02', 'Binary02', 'Cream02'],
  ARTMS: ['Atom01', 'Binary01', 'Cream01', 'Divine01', 'Ever01', 'Atom02'],
  idntt: ['Spring25', 'Summer25', 'Autumn25', 'Winter26', 'Spring26', 'Summer26'],
};

export const ARTIST_CLASSES: Record<string, string[]> = {
  tripleS: ['First', 'Double', 'Motion', 'Unit', 'Special', 'Premier', 'Welcome', 'Zero'],
  ARTMS: ['First', 'Double', 'Motion', 'Special', 'Premier', 'Welcome'],
  idntt: ['Basic', 'Event', 'Motion', 'Special', 'Unit', 'Welcome'],
};

// Cosmo's own casing is inconsistent per group (v3's "Artist" trait has
// been observed as plain "tripleS" already, matching the display form —
// this table only fixes cases known to differ). Verified against
// objekt.top's own live data: id "tripleS" title "tripleS", id "artms"
// title "ARTMS", id "idntt" title "idntt".
const ARTIST_DISPLAY_LABELS: Record<string, string> = {
  artms: 'ARTMS',
  ARTMS: 'ARTMS',
  triples: 'tripleS',
  tripleS: 'tripleS',
  idntt: 'idntt',
};

export function artistDisplayName(artist: string | undefined): string {
  if (!artist) return '';
  return ARTIST_DISPLAY_LABELS[artist] ?? artist;
}

export function memberDisplayName(artist: string | undefined, member: string | undefined): string {
  if (!member) return '';
  const displayArtist = artistDisplayName(artist);
  const aliases =
    displayArtist === 'tripleS' ? TRIPLE_S_MEMBER_ALIASES : displayArtist === 'idntt' ? IDNTT_MEMBER_ALIASES : null;
  const alias = aliases?.[member];
  return alias ? `${alias} ${member}` : member;
}

// A "Unit" objekt pairs two members, but `member` only ever names one of
// them — Cosmo's own collectionId is the only place the pairing shows up,
// e.g. "Summer25 id5 X id8 401Z" (verified against real cached collectionId
// values, both artists — casing of "x" varies in their own data, hence the
// case-insensitive match; always normalized to " X " on the way out).
const UNIT_PAIR_PATTERN = /\b((?:S|id)\d+)\s*x\s*((?:S|id)\d+)\b/i;

export function objektMemberLabel(objekt: {
  artist?: string;
  member?: string;
  class?: string;
  collectionId?: string;
}): string {
  if (objekt.class === 'Unit' && objekt.collectionId) {
    const match = UNIT_PAIR_PATTERN.exec(objekt.collectionId);
    if (match) return `${match[1]} X ${match[2]}`;
  }
  return memberDisplayName(objekt.artist, objekt.member);
}
