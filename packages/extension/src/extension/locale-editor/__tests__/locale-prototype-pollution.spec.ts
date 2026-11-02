/**
 * Regression (#66): user-typed keys are split on '.' and walked with bracket access, so a
 * `__proto__` / `prototype` / `constructor` segment must never reach Object.prototype.
 */

import type { ILocalesConfiguration } from 'eligius';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addKeyToConfig,
  deleteKeyFromConfig,
  findKeyConflict,
  findUnsafeKeySegment,
  renameKeyInConfig,
  updateTranslationInConfig,
} from '../locale-editor-utils.js';

const config = (): ILocalesConfiguration =>
  ({
    'en-US': { nav: { home: 'Home' } },
    'nl-NL': { nav: { home: 'Thuis' } },
  }) as unknown as ILocalesConfiguration;

afterEach(() => {
  // Defensive cleanup so a failing assertion cannot poison other tests
  delete (Object.prototype as Record<string, unknown>).polluted;
  delete (Object.prototype as Record<string, unknown>).x;
});

describe('prototype pollution guard', () => {
  it.each([
    '__proto__.polluted',
    'constructor.prototype.polluted',
    'nav.__proto__.polluted',
    'prototype.polluted',
    '__proto__',
  ])('addKeyToConfig leaves everything untouched for key %s', key => {
    const updated = addKeyToConfig(config(), key);
    expect(updated).toEqual(config());
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted') !== undefined).toBe(false);
  });

  it('updateTranslationInConfig refuses an unsafe key', () => {
    const updated = updateTranslationInConfig(config(), '__proto__.polluted', 'en-US', 'x');
    expect(updated).toEqual(config());
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted') !== undefined).toBe(false);
  });

  it('updateTranslationInConfig refuses an unsafe locale', () => {
    const updated = updateTranslationInConfig(config(), 'nav.title', '__proto__', 'x');
    expect(updated).toEqual(config());
    expect(Object.getPrototypeOf(updated)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'nav') !== undefined).toBe(false);
  });

  it('renameKeyInConfig refuses an unsafe target and an unsafe source', () => {
    expect(renameKeyInConfig(config(), 'nav.home', '__proto__.x')).toEqual(config());
    expect(renameKeyInConfig(config(), '__proto__.x', 'nav.other')).toEqual(config());
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'x') !== undefined).toBe(false);
  });

  it('deleteKeyFromConfig does not delete inherited members', () => {
    const updated = deleteKeyFromConfig(config(), 'constructor');
    expect(updated).toEqual(config());
    expect(typeof ({} as Record<string, unknown>).constructor).toBe('function');
  });

  it('does not treat inherited members as existing keys', () => {
    // 'toString' is inherited, not an own translation: it can be added as a key
    const updated = addKeyToConfig(config(), 'nav.toString') as unknown as Record<string, any>;
    expect(Object.getOwnPropertyDescriptor(updated['en-US'].nav, 'toString') !== undefined).toBe(
      true
    );
    expect(updated['en-US'].nav.toString).toBe('');
  });

  it('findUnsafeKeySegment reports the reserved segment', () => {
    expect(findUnsafeKeySegment('a.__proto__.b')).toBe('__proto__');
    expect(findUnsafeKeySegment('a.constructor')).toBe('constructor');
    expect(findUnsafeKeySegment('prototype')).toBe('prototype');
    expect(findUnsafeKeySegment('nav.home')).toBeUndefined();
  });

  it('findKeyConflict ignores unsafe keys instead of walking the prototype chain', () => {
    expect(findKeyConflict(config(), '__proto__.x')).toBeUndefined();
  });
});
