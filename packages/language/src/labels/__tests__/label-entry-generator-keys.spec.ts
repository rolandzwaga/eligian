/**
 * generateLocaleEntry / mergeLocaleEntry key handling (audit findings #38, #43).
 */

import type { ILocalesConfiguration } from 'eligius';
import { afterEach, describe, expect, it } from 'vitest';
import {
  generateLocaleEntry,
  isSafeTranslationKey,
  mergeLocaleEntry,
  mergeLocaleEntryWithSkipped,
} from '../label-entry-generator.js';

const cfg = (value: unknown) => value as ILocalesConfiguration;
const asRecord = (value: unknown) => value as Record<string, any>;

describe('generateLocaleEntry', () => {
  it('creates a top-level key in every language', () => {
    expect(generateLocaleEntry('title', ['en-US', 'nl-NL'])).toEqual({
      'en-US': { title: '' },
      'nl-NL': { title: '' },
    });
  });

  it('creates nested objects for dotted keys', () => {
    expect(generateLocaleEntry('nav.menu.home', ['en-US'])).toEqual({
      'en-US': { nav: { menu: { home: '' } } },
    });
  });

  it('returns an empty configuration for no languages', () => {
    expect(generateLocaleEntry('a.b', [])).toEqual({});
  });
});

describe('mergeLocaleEntry', () => {
  it('adds a new top-level key without touching siblings', () => {
    const result = mergeLocaleEntry(cfg({ 'en-US': { a: 'A' } }), 'b', ['en-US']);
    expect(result).toEqual({ 'en-US': { a: 'A', b: '' } });
  });

  it('merges into an existing nested object without clobbering siblings', () => {
    const existing = cfg({ 'en-US': { nav: { home: 'Home', deep: { x: 'X' } } } });
    const result = mergeLocaleEntry(existing, 'nav.about', ['en-US']);
    expect(result).toEqual({ 'en-US': { nav: { home: 'Home', deep: { x: 'X' }, about: '' } } });
  });

  it('creates a language that is missing from the existing configuration', () => {
    const result = mergeLocaleEntry(cfg({ 'en-US': { a: 'A' } }), 'nav.home', ['en-US', 'nl-NL']);
    expect(result).toEqual({
      'en-US': { a: 'A', nav: { home: '' } },
      'nl-NL': { nav: { home: '' } },
    });
  });

  it('works on an empty configuration', () => {
    expect(mergeLocaleEntry(cfg({}), 'a.b', ['en-US'])).toEqual({ 'en-US': { a: { b: '' } } });
  });

  it('does not mutate the input', () => {
    const existing = cfg({ 'en-US': { a: 'A' } });
    const snapshot = JSON.stringify(existing);
    mergeLocaleEntry(existing, 'x.y', ['en-US', 'nl-NL']);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });

  it('never overwrites an existing translation with an empty string', () => {
    const existing = cfg({ 'en-US': { nav: { home: 'Home' } } });
    expect(mergeLocaleEntry(existing, 'nav.home', ['en-US'])).toEqual(existing);
  });

  it('does not replace a leaf string that collides with a parent segment', () => {
    const existing = cfg({ 'en-US': { nav: 'Navigation' } });
    expect(mergeLocaleEntry(existing, 'nav.home', ['en-US'])).toEqual(existing);
  });

  it('does not nest below arrays', () => {
    const existing = cfg({ 'en-US': { list: ['a'] } });
    expect(mergeLocaleEntry(existing, 'list.x', ['en-US'])).toEqual(existing);
  });

  it('replaces a null parent with a nested object', () => {
    const result = mergeLocaleEntry(cfg({ 'en-US': { nav: null } }), 'nav.home', ['en-US']);
    expect(result).toEqual({ 'en-US': { nav: { home: '' } } });
  });

  it('leaves $ref locale entries intact and reports them', () => {
    const existing = cfg({ 'en-US': { $ref: './en.json' }, 'nl-NL': {} });
    const { config, skipped, invalidKey } = mergeLocaleEntryWithSkipped(existing, 'a.b', [
      'en-US',
      'nl-NL',
    ]);
    expect(skipped).toEqual(['en-US']);
    expect(invalidKey).toBe(false);
    expect(config).toEqual({ 'en-US': { $ref: './en.json' }, 'nl-NL': { a: { b: '' } } });
  });

  it('treats inherited property names as ordinary keys', () => {
    const result = asRecord(mergeLocaleEntry(cfg({ 'en-US': {} }), 'toString.valueOf', ['en-US']));
    expect(Object.keys(result['en-US']).includes('toString')).toBe(true);
    expect(result['en-US'].toString.valueOf).toBe('');
  });
});

describe('prototype pollution guard (audit #38)', () => {
  afterEach(() => {
    delete asRecord(Object.prototype).polluted;
  });

  it.each([
    '__proto__.polluted',
    'a.__proto__.polluted',
    'constructor.prototype.polluted',
    'prototype.polluted',
    '__proto__',
  ])('rejects the key %s and leaves Object.prototype untouched', key => {
    const { config, skipped, invalidKey } = mergeLocaleEntryWithSkipped(
      cfg({ 'en-US': { a: 'A' } }),
      key,
      ['en-US']
    );

    expect(invalidKey).toBe(true);
    expect(skipped).toEqual([]);
    expect(config).toEqual({ 'en-US': { a: 'A' } });
    expect(asRecord({}).polluted).toBeUndefined();
  });

  it('generateLocaleEntry does not pollute either', () => {
    const result = generateLocaleEntry('__proto__.polluted', ['en-US']);
    expect(result).toEqual({ 'en-US': {} });
    expect(asRecord({}).polluted).toBeUndefined();
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'ignores the language code %s and leaves Object.prototype untouched',
    code => {
      const { config, skipped, invalidKey, invalidLanguageCodes } = mergeLocaleEntryWithSkipped(
        cfg({ 'en-US': {} }),
        'polluted',
        ['en-US', code]
      );

      expect(invalidKey).toBe(false);
      expect(skipped).toEqual([]);
      expect(invalidLanguageCodes).toEqual([code]);
      expect(config).toEqual({ 'en-US': { polluted: '' } });
      expect(Object.keys(config)).toEqual(['en-US']);
      expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
      expect(asRecord({}).polluted).toBeUndefined();
    }
  );

  it('generateLocaleEntry ignores a __proto__ language code', () => {
    const result = generateLocaleEntry('polluted', ['en-US', '__proto__']);
    expect(result).toEqual({ 'en-US': { polluted: '' } });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(asRecord({}).polluted).toBeUndefined();
  });

  it('isSafeTranslationKey accepts normal keys and rejects empty segments', () => {
    expect(isSafeTranslationKey('nav.home')).toBe(true);
    expect(isSafeTranslationKey('title')).toBe(true);
    expect(isSafeTranslationKey('')).toBe(false);
    expect(isSafeTranslationKey('a..b')).toBe(false);
    expect(isSafeTranslationKey('.a')).toBe(false);
    expect(isSafeTranslationKey('a.')).toBe(false);
    expect(isSafeTranslationKey('a.constructor')).toBe(false);
  });
});
