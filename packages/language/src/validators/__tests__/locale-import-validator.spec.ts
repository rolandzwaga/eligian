/**
 * validateLocalesJSON schema tests
 *
 * Regression: `{ "$ref": "./x.json" }` locale entries matched both oneOf branches
 * (localeData and localeReference) and were rejected as invalid.
 */

import { describe, expect, test } from 'vitest';
import { validateLocalesJSON } from '../locale-import-validator.js';

const FILE = 'locales.json';

describe('validateLocalesJSON', () => {
  test('accepts inline locale data', () => {
    const json = JSON.stringify({ 'en-US': { nav: { home: 'Home' }, title: 'Hi' } });
    expect(validateLocalesJSON(json, FILE)).toBeUndefined();
  });

  test('accepts $ref-only locale entries', () => {
    const json = JSON.stringify({
      'en-US': { $ref: './locales/en-US.json' },
      'nl-NL': { $ref: './locales/nl-NL.json' },
    });
    expect(validateLocalesJSON(json, FILE)).toBeUndefined();
  });

  test('accepts a mix of inline and $ref entries', () => {
    const json = JSON.stringify({
      'en-US': { greeting: 'Hello' },
      'nl-NL': { $ref: './locales/nl-NL.json' },
    });
    expect(validateLocalesJSON(json, FILE)).toBeUndefined();
  });

  test('rejects a $ref entry with extra properties', () => {
    const json = JSON.stringify({ 'en-US': { $ref: './x.json', extra: 'nope' } });
    expect(validateLocalesJSON(json, FILE)?.code).toBe('invalid_locales_schema');
  });

  test('rejects a $ref entry that does not point to a .json file', () => {
    const json = JSON.stringify({ 'en-US': { $ref: './x.txt' } });
    expect(validateLocalesJSON(json, FILE)?.code).toBe('invalid_locales_schema');
  });

  test('still rejects non-string translation values', () => {
    const json = JSON.stringify({ 'en-US': { count: 3 } });
    expect(validateLocalesJSON(json, FILE)?.code).toBe('invalid_locales_schema');
  });
});
