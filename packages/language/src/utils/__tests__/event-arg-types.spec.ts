import { describe, expect, test } from 'vitest';
import { DSL_TYPE_ANNOTATIONS, eligiusTypeToDslAnnotation } from '../event-arg-types.js';

describe('eligiusTypeToDslAnnotation', () => {
  test('keeps every DSL annotation unchanged', () => {
    for (const type of DSL_TYPE_ANNOTATIONS) {
      expect(eligiusTypeToDslAnnotation(type)).toBe(type);
    }
  });

  test('maps TLanguageCode to string', () => {
    expect(eligiusTypeToDslAnnotation('TLanguageCode')).toBe('string');
  });

  test('maps array types to array', () => {
    expect(eligiusTypeToDslAnnotation('string[]')).toBe('array');
    expect(eligiusTypeToDslAnnotation('number[]')).toBe('array');
    expect(eligiusTypeToDslAnnotation('Array<string>')).toBe('array');
    expect(eligiusTypeToDslAnnotation('ReadonlyArray<ILabel>')).toBe('array');
  });

  test('maps record and object literal types to object', () => {
    expect(eligiusTypeToDslAnnotation('Record<string, unknown>')).toBe('object');
    expect(eligiusTypeToDslAnnotation('{ id: string; name: string }')).toBe('object');
  });

  test('returns undefined for any, unknown and callbacks', () => {
    expect(eligiusTypeToDslAnnotation('any')).toBeUndefined();
    expect(eligiusTypeToDslAnnotation('unknown')).toBeUndefined();
    expect(eligiusTypeToDslAnnotation('(position: number) => void')).toBeUndefined();
    expect(eligiusTypeToDslAnnotation('(() => number) | undefined')).toBeUndefined();
    expect(eligiusTypeToDslAnnotation('TResultCallback<number>')).toBeUndefined();
    expect(eligiusTypeToDslAnnotation('HTMLElement')).toBeUndefined();
  });

  test('ignores surrounding whitespace', () => {
    expect(eligiusTypeToDslAnnotation('  number ')).toBe('number');
    expect(eligiusTypeToDslAnnotation(' string[] ')).toBe('array');
  });
});
