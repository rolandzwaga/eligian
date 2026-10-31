/**
 * extractTranslationKeys robustness against malformed locale entries (audit finding #39).
 */

import type { ILocalesConfiguration } from 'eligius';
import { describe, expect, it } from 'vitest';
import { extractTranslationKeys } from '../translation-key-extractor.js';

const cfg = (value: unknown) => value as ILocalesConfiguration;

describe('extractTranslationKeys with malformed entries', () => {
  it('ignores a string locale entry (no per-character keys)', () => {
    expect(extractTranslationKeys(cfg({ 'en-US': 'Hello' }))).toEqual([]);
  });

  it('ignores a null locale entry instead of throwing', () => {
    expect(() => extractTranslationKeys(cfg({ 'en-US': null }))).not.toThrow();
    expect(extractTranslationKeys(cfg({ 'en-US': null }))).toEqual([]);
  });

  it('ignores array, number and boolean locale entries', () => {
    expect(extractTranslationKeys(cfg({ a: ['x', 'y'], b: 42, c: true }))).toEqual([]);
  });

  it('skips arrays nested inside valid locale data', () => {
    const result = extractTranslationKeys(cfg({ 'en-US': { list: ['a', 'b'], ok: 'fine' } }));
    expect(result.map(r => r.id)).toEqual(['ok']);
  });

  it('still extracts keys from the valid locales next to malformed ones', () => {
    const result = extractTranslationKeys(
      cfg({ 'en-US': { nav: { home: 'Home' } }, 'nl-NL': 'oops', 'de-DE': null })
    );
    expect(result).toEqual([{ id: 'nav.home', translationCount: 1, languageCodes: ['en-US'] }]);
  });
});
