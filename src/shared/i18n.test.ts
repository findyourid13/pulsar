import { describe, expect, it } from 'vitest';
import { collectionStatusNoneSelected, lastCachedAt, normalizeLocale, shuffleEveryMinutes, t } from './i18n';

describe('normalizeLocale', () => {
  it.each(['ko', 'ko-KR', 'KO-kr'])('maps %s to ko', (raw) => {
    expect(normalizeLocale(raw)).toBe('ko');
  });

  it.each(['en', 'en-US', 'fr-FR', 'ja-JP', ''])('falls back to en for %s', (raw) => {
    expect(normalizeLocale(raw)).toBe('en');
  });
});

describe('t', () => {
  it('returns the English string for the en locale', () => {
    expect(t('trayQuit', 'en')).toBe('Quit');
  });

  it('returns the Korean string for the ko locale', () => {
    expect(t('trayQuit', 'ko')).toBe('종료');
  });
});

describe('templated strings', () => {
  it('interpolates the count into both locales for shuffleEveryMinutes', () => {
    expect(shuffleEveryMinutes(15, 'en')).toBe('Every 15 min');
    expect(shuffleEveryMinutes(15, 'ko')).toContain('15');
  });

  it('interpolates the date into lastCachedAt', () => {
    expect(lastCachedAt('9/17/2026', 'en')).toContain('9/17/2026');
    expect(lastCachedAt('9/17/2026', 'ko')).toContain('9/17/2026');
  });

  it('interpolates both counts into collectionStatusNoneSelected', () => {
    const result = collectionStatusNoneSelected(5, 20, 'en');
    expect(result).toContain('5');
    expect(result).toContain('20');
  });
});
