import { describe, expect, it, vi } from 'vitest';

// remote-source.ts imports `net` from 'electron' at module scope, and
// transitively (via cache.ts -> file-protocol.ts) calls
// protocol.registerSchemesAsPrivileged at that same module's load time —
// none of the functions under test here exercise either, but both imports
// still have to resolve outside the real Electron runtime.
vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  protocol: { registerSchemesAsPrivileged: vi.fn() },
}));

const { padHex32, mapWithConcurrency, apolloMemberSegment, normalizeV3 } = await import('./remote-source');
type Objekt = Awaited<ReturnType<typeof normalizeV3>>['objekt'];

// apolloMemberSegment only reads collectionId/season/member/collectionNo —
// this fills in the rest with harmless placeholders so fixtures below only
// have to spell out what the test actually varies.
function objekt(overrides: Partial<Objekt>): Objekt {
  return {
    collectionId: '',
    season: '',
    member: '',
    artists: [],
    collectionNo: '',
    class: '',
    thumbnailImage: '',
    frontImage: '',
    backImage: '',
    accentColor: '',
    backgroundColor: '',
    textColor: '',
    tokenId: '',
    objektNo: 0,
    tokenAddress: '',
    transferable: true,
    frontMedia: null,
    ...overrides,
  };
}

describe('padHex32', () => {
  it('left-pads to 64 hex chars for ABI encoding', () => {
    expect(padHex32('1a')).toBe('0'.repeat(62) + '1a');
  });

  it('leaves an already-64-char value untouched', () => {
    const full = 'a'.repeat(64);
    expect(padHex32(full)).toBe(full);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 10, 20, 0];
    const results = await mapWithConcurrency(delays, 4, (ms) => new Promise((r) => setTimeout(() => r(ms), ms)));
    expect(results).toEqual(delays);
  });

  it('never runs more than `limit` callbacks concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async (i) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return i;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('handles an empty input without hanging', async () => {
    const results = await mapWithConcurrency<number, number>([], 4, async (i) => i);
    expect(results).toEqual([]);
  });

  it('propagates a rejection from the mapper', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (i) => {
        if (i === 2) throw new Error('boom');
        return i;
      }),
    ).rejects.toThrow('boom');
  });
});

describe('apolloMemberSegment', () => {
  const base = { season: 'Summer25', member: 'JaeYoung', collectionNo: '401Z' };

  it('extracts a single-member segment from collectionId', () => {
    expect(apolloMemberSegment(objekt({ ...base, collectionId: 'Summer25 JaeYoung 401Z' }))).toBe('JaeYoung');
  });

  it('extracts a Unit pairing segment intact, not just `member`', () => {
    expect(apolloMemberSegment(objekt({ ...base, collectionId: 'Summer25 id5 X id8 401Z' }))).toBe('id5 X id8');
  });

  it('falls back to `member` when collectionId does not match season/collectionNo framing', () => {
    expect(apolloMemberSegment(objekt({ ...base, collectionId: 'something unrelated' }))).toBe('JaeYoung');
  });

  it('returns null when both the parsed segment and member are empty', () => {
    expect(apolloMemberSegment(objekt({ ...base, collectionId: 'something unrelated', member: '' }))).toBeNull();
  });
});

describe('normalizeV3', () => {
  it('maps v3 nft-metadata traits onto the v1 Objekt shape with known gaps left empty', () => {
    const result = normalizeV3({
      name: 'Summer25 JaeYoung 401Z #12',
      description: '',
      image: 'https://example.com/front.png',
      background_color: '#ffffff',
      attributes: [
        { trait_type: 'Season', value: 'Summer25' },
        { trait_type: 'Member', value: 'JaeYoung' },
        { trait_type: 'Artist', value: 'idntt' },
        { trait_type: 'Collection', value: '401Z' },
        { trait_type: 'Class', value: 'Basic' },
      ],
    });

    expect(result.objekt.collectionId).toBe('Summer25 JaeYoung 401Z'); // trailing " #12" stripped
    expect(result.objekt.season).toBe('Summer25');
    expect(result.objekt.member).toBe('JaeYoung');
    expect(result.objekt.artists).toEqual(['idntt']);
    expect(result.objekt.frontImage).toBe('https://example.com/front.png');
    expect(result.objekt.backImage).toBe(''); // not recoverable from v3 — the whole reason objekt-summaries exists
    expect(result.objekt.frontMedia).toBeNull();
  });

  it('defaults every missing trait to an empty string rather than throwing', () => {
    const result = normalizeV3({ name: 'Untitled', description: '', image: '', background_color: '', attributes: [] });
    expect(result.objekt.season).toBe('');
    expect(result.objekt.member).toBe('');
    expect(result.objekt.class).toBe('');
  });
});
