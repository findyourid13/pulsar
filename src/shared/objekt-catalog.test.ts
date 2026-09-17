import { describe, expect, it } from 'vitest';
import { artistDisplayName, memberDisplayName, objektMemberLabel } from './objekt-catalog';

describe('artistDisplayName', () => {
  it('normalizes known casing variants to their canonical display form', () => {
    expect(artistDisplayName('artms')).toBe('ARTMS');
    expect(artistDisplayName('ARTMS')).toBe('ARTMS');
    expect(artistDisplayName('triples')).toBe('tripleS');
    expect(artistDisplayName('tripleS')).toBe('tripleS');
    expect(artistDisplayName('idntt')).toBe('idntt');
  });

  it('passes an unknown artist through unchanged rather than blanking it', () => {
    expect(artistDisplayName('someFutureGroup')).toBe('someFutureGroup');
  });

  it('returns empty string for a missing artist', () => {
    expect(artistDisplayName(undefined)).toBe('');
  });
});

describe('memberDisplayName', () => {
  it('prefixes tripleS members with their public alias', () => {
    expect(memberDisplayName('tripleS', 'SeoYeon')).toBe('S1 SeoYeon');
  });

  it('prefixes idntt members with their public alias', () => {
    expect(memberDisplayName('idntt', 'SeongJun')).toBe('id13 SeongJun');
  });

  it('leaves ARTMS members unprefixed — they have no numeric alias', () => {
    expect(memberDisplayName('ARTMS', 'HeeJin')).toBe('HeeJin');
  });

  it('falls back to the bare member name for an unrecognized alias', () => {
    expect(memberDisplayName('tripleS', 'SomeoneNew')).toBe('SomeoneNew');
  });

  it('returns empty string for a missing member', () => {
    expect(memberDisplayName('tripleS', undefined)).toBe('');
  });
});

describe('objektMemberLabel', () => {
  it('renders a Unit pairing from collectionId as "id13 X id14"', () => {
    expect(
      objektMemberLabel({ class: 'Unit', collectionId: 'Summer25 id5 X id8 401Z', artist: 'idntt', member: 'JaeYoung' }),
    ).toBe('id5 X id8');
  });

  it('matches the pairing case-insensitively and normalizes the separator to " X "', () => {
    expect(objektMemberLabel({ class: 'Unit', collectionId: 'Summer25 id5 x id8 401Z' })).toBe('id5 X id8');
  });

  it('matches tripleS-style S-prefixed pairings too', () => {
    expect(objektMemberLabel({ class: 'Unit', collectionId: 'Cream01 S1 X S4 201Z' })).toBe('S1 X S4');
  });

  it('falls back to the plain member label when class is Unit but collectionId has no pairing', () => {
    expect(objektMemberLabel({ class: 'Unit', collectionId: 'Summer25 401Z', artist: 'idntt', member: 'JaeYoung' })).toBe(
      'id5 JaeYoung',
    );
  });

  it('falls back to the plain member label for non-Unit classes even with a pairing-shaped collectionId', () => {
    expect(
      objektMemberLabel({ class: 'Basic', collectionId: 'Summer25 id5 X id8 401Z', artist: 'idntt', member: 'JaeYoung' }),
    ).toBe('id5 JaeYoung');
  });
});
