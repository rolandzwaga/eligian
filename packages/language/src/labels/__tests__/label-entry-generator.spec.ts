import type { ILocalesConfiguration } from 'eligius';
import { describe, expect, it } from 'vitest';
import { mergeLocaleEntry, mergeLocaleEntryWithSkipped } from '../label-entry-generator.js';

describe('mergeLocaleEntry $ref handling (audit #33)', () => {
  const existing = {
    'en-US': { $ref: './en-US.json' },
    'nl-NL': { greeting: 'Hallo' },
  } as unknown as ILocalesConfiguration;

  it('preserves a $ref locale entry untouched', () => {
    const result = mergeLocaleEntry(existing, 'nav.home', ['en-US', 'nl-NL']);

    expect((result as Record<string, unknown>)['en-US']).toEqual({ $ref: './en-US.json' });
    expect((result as Record<string, unknown>)['nl-NL']).toEqual({
      greeting: 'Hallo',
      nav: { home: '' },
    });
  });

  it('reports the skipped $ref locales and does not mutate the input', () => {
    const snapshot = JSON.stringify(existing);
    const { config, skipped } = mergeLocaleEntryWithSkipped(existing, 'nav.home', [
      'en-US',
      'nl-NL',
      'de-DE',
    ]);

    expect(skipped).toEqual(['en-US']);
    expect((config as Record<string, unknown>)['de-DE']).toEqual({ nav: { home: '' } });
    expect(JSON.stringify(existing)).toBe(snapshot);
  });

  it('returns no skipped locales when nothing is a $ref', () => {
    const { skipped } = mergeLocaleEntryWithSkipped(
      { 'en-US': { a: 'b' } } as unknown as ILocalesConfiguration,
      'x.y',
      ['en-US']
    );
    expect(skipped).toEqual([]);
  });
});
