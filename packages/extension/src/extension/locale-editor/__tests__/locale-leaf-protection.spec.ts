/**
 * Regression: adding/updating/renaming a key beneath an existing leaf translation
 * must not replace that translation with an empty object in any locale.
 */

import type { ILocalesConfiguration } from 'eligius';
import { describe, expect, it } from 'vitest';
import {
  addKeyToConfig,
  findKeyConflict,
  renameKeyInConfig,
  updateTranslationInConfig,
} from '../locale-editor-utils.js';

const config = (): ILocalesConfiguration =>
  ({
    'en-US': { nav: { home: 'Home' } },
    'nl-NL': { nav: { home: 'Thuis' } },
  }) as unknown as ILocalesConfiguration;

describe('leaf translation protection', () => {
  it('addKeyToConfig keeps every locale intact when the key nests under a leaf', () => {
    const updated = addKeyToConfig(config(), 'nav.home.title');
    expect(updated).toEqual(config());
  });

  it('addKeyToConfig still adds a sibling key', () => {
    const updated = addKeyToConfig(config(), 'nav.about') as unknown as Record<string, any>;
    expect(updated['en-US'].nav).toEqual({ home: 'Home', about: '' });
    expect(updated['nl-NL'].nav).toEqual({ home: 'Thuis', about: '' });
  });

  it('updateTranslationInConfig does not replace a leaf with an object', () => {
    const updated = updateTranslationInConfig(config(), 'nav.home.title', 'en-US', 'Title');
    expect(updated).toEqual(config());
  });

  it('renameKeyInConfig does not move a value beneath an existing leaf', () => {
    const cfg = {
      'en-US': { nav: { home: 'Home' }, about: 'About' },
    } as unknown as ILocalesConfiguration;
    expect(renameKeyInConfig(cfg, 'about', 'nav.home.about')).toEqual(cfg);
  });

  it('findKeyConflict reports the blocking leaf', () => {
    expect(findKeyConflict(config(), 'nav.home.title')).toBe('nav.home');
    expect(findKeyConflict(config(), 'nav.home.title', 'en-US')).toBe('nav.home');
    expect(findKeyConflict(config(), 'nav.other.title')).toBeUndefined();
    expect(findKeyConflict(config(), 'nav.home')).toBeUndefined();
  });
});
