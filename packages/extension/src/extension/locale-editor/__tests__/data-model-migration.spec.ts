/**
 * Data Model Migration Tests (Feature 045, Phase 4B)
 *
 * Tests for the migration from LabelGroup/Translation to ILocalesConfiguration format.
 * Tests cover:
 * - KeyTreeNode interface and structure
 * - buildKeyTree() - converts ILocalesConfiguration to KeyTreeNode[]
 * - serializeToLocalesConfiguration() - converts KeyTreeNode[] back to ILocalesConfiguration
 *
 * These tests follow TDD approach - written before implementation.
 */

import type { ILocalesConfiguration } from 'eligius';
import { describe, expect, it } from 'vitest';
import { buildKeyTree, serializeToLocalesConfiguration } from '../key-tree-builder.js';
import { keyTreeToLocaleData, localeDataToKeyTree } from '../locale-serializer.js';
import type { KeyTreeNode } from '../types.js';

describe('Data Model Migration (Feature 045, Phase 4B)', () => {
  describe('KeyTreeNode Structure', () => {
    it('should have required properties for leaf nodes', () => {
      const leafNode: KeyTreeNode = {
        name: 'home',
        fullKey: 'nav.home',
        isLeaf: true,
        children: [],
        translations: new Map([
          ['en-US', 'Home'],
          ['nl-NL', 'Thuis'],
        ]),
      };

      expect(leafNode.name).toBe('home');
      expect(leafNode.fullKey).toBe('nav.home');
      expect(leafNode.isLeaf).toBe(true);
      expect(leafNode.children).toHaveLength(0);
      expect(leafNode.translations?.get('en-US')).toBe('Home');
      expect(leafNode.translations?.get('nl-NL')).toBe('Thuis');
    });

    it('should have required properties for branch nodes', () => {
      const branchNode: KeyTreeNode = {
        name: 'nav',
        fullKey: 'nav',
        isLeaf: false,
        children: [
          {
            name: 'home',
            fullKey: 'nav.home',
            isLeaf: true,
            children: [],
            translations: new Map([['en-US', 'Home']]),
          },
        ],
      };

      expect(branchNode.name).toBe('nav');
      expect(branchNode.fullKey).toBe('nav');
      expect(branchNode.isLeaf).toBe(false);
      expect(branchNode.children).toHaveLength(1);
      expect(branchNode.translations).toBeUndefined();
    });
  });

  describe('buildKeyTree() - ILocalesConfiguration to KeyTreeNode[]', () => {
    it('should convert simple flat locale data to tree', () => {
      const locales: ILocalesConfiguration = {
        'en-US': {
          home: 'Home',
          about: 'About',
        },
        'nl-NL': {
          home: 'Thuis',
          about: 'Over Ons',
        },
      };

      const tree = buildKeyTree(locales);

      expect(tree).toHaveLength(2);

      const homeNode = tree.find(n => n.name === 'home');
      expect(homeNode).toBeDefined();
      expect(homeNode?.isLeaf).toBe(true);
      expect(homeNode?.fullKey).toBe('home');
      expect(homeNode?.translations?.get('en-US')).toBe('Home');
      expect(homeNode?.translations?.get('nl-NL')).toBe('Thuis');

      const aboutNode = tree.find(n => n.name === 'about');
      expect(aboutNode).toBeDefined();
      expect(aboutNode?.translations?.get('en-US')).toBe('About');
      expect(aboutNode?.translations?.get('nl-NL')).toBe('Over Ons');
    });

    it('should convert nested locale data to tree', () => {
      const locales: ILocalesConfiguration = {
        'en-US': {
          nav: {
            home: 'Home',
            about: 'About Us',
          },
        },
        'nl-NL': {
          nav: {
            home: 'Thuis',
            about: 'Over Ons',
          },
        },
      };

      const tree = buildKeyTree(locales);

      expect(tree).toHaveLength(1);

      const navNode = tree[0];
      expect(navNode.name).toBe('nav');
      expect(navNode.fullKey).toBe('nav');
      expect(navNode.isLeaf).toBe(false);
      expect(navNode.children).toHaveLength(2);

      const homeNode = navNode.children.find(n => n.name === 'home');
      expect(homeNode).toBeDefined();
      expect(homeNode?.fullKey).toBe('nav.home');
      expect(homeNode?.isLeaf).toBe(true);
      expect(homeNode?.translations?.get('en-US')).toBe('Home');
      expect(homeNode?.translations?.get('nl-NL')).toBe('Thuis');
    });

    it('should handle deeply nested keys', () => {
      const locales: ILocalesConfiguration = {
        'en-US': {
          app: {
            ui: {
              buttons: {
                submit: 'Submit',
                cancel: 'Cancel',
              },
            },
          },
        },
      };

      const tree = buildKeyTree(locales);

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('app');
      expect(tree[0].fullKey).toBe('app');
      expect(tree[0].isLeaf).toBe(false);

      const uiNode = tree[0].children[0];
      expect(uiNode.name).toBe('ui');
      expect(uiNode.fullKey).toBe('app.ui');

      const buttonsNode = uiNode.children[0];
      expect(buttonsNode.name).toBe('buttons');
      expect(buttonsNode.fullKey).toBe('app.ui.buttons');

      const submitNode = buttonsNode.children.find(n => n.name === 'submit');
      expect(submitNode?.fullKey).toBe('app.ui.buttons.submit');
      expect(submitNode?.isLeaf).toBe(true);
      expect(submitNode?.translations?.get('en-US')).toBe('Submit');
    });

    it('should handle missing translations in some locales', () => {
      const locales: ILocalesConfiguration = {
        'en-US': {
          nav: {
            home: 'Home',
            about: 'About',
          },
        },
        'nl-NL': {
          nav: {
            home: 'Thuis',
            // 'about' is missing in nl-NL
          },
        },
      };

      const tree = buildKeyTree(locales);

      const navNode = tree[0];
      const aboutNode = navNode.children.find(n => n.name === 'about');

      expect(aboutNode?.translations?.get('en-US')).toBe('About');
      expect(aboutNode?.translations?.has('nl-NL')).toBe(false);
    });

    it('should handle empty locale configuration', () => {
      const locales: ILocalesConfiguration = {};

      const tree = buildKeyTree(locales);

      expect(tree).toHaveLength(0);
    });

    it('should handle locale with empty data', () => {
      const locales: ILocalesConfiguration = {
        'en-US': {},
      };

      const tree = buildKeyTree(locales);

      expect(tree).toHaveLength(0);
    });

    it('should extract all locale codes', () => {
      const locales: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
        'nl-NL': { home: 'Thuis' },
        'fr-FR': { home: 'Accueil' },
      };

      const tree = buildKeyTree(locales);

      const homeNode = tree[0];
      expect(homeNode.translations?.size).toBe(3);
      expect(homeNode.translations?.get('en-US')).toBe('Home');
      expect(homeNode.translations?.get('nl-NL')).toBe('Thuis');
      expect(homeNode.translations?.get('fr-FR')).toBe('Accueil');
    });

    it('should sort keys alphabetically at each level', () => {
      const locales: ILocalesConfiguration = {
        'en-US': {
          zebra: 'Zebra',
          apple: 'Apple',
          mango: 'Mango',
        },
      };

      const tree = buildKeyTree(locales);

      expect(tree[0].name).toBe('apple');
      expect(tree[1].name).toBe('mango');
      expect(tree[2].name).toBe('zebra');
    });
  });

  describe('serializeToLocalesConfiguration() - KeyTreeNode[] to ILocalesConfiguration', () => {
    it('should convert flat tree back to locale configuration', () => {
      const tree: KeyTreeNode[] = [
        {
          name: 'home',
          fullKey: 'home',
          isLeaf: true,
          children: [],
          translations: new Map([
            ['en-US', 'Home'],
            ['nl-NL', 'Thuis'],
          ]),
        },
      ];

      const locales = serializeToLocalesConfiguration(tree);

      expect(locales['en-US']).toEqual({ home: 'Home' });
      expect(locales['nl-NL']).toEqual({ home: 'Thuis' });
    });

    it('should convert nested tree back to locale configuration', () => {
      const tree: KeyTreeNode[] = [
        {
          name: 'nav',
          fullKey: 'nav',
          isLeaf: false,
          children: [
            {
              name: 'home',
              fullKey: 'nav.home',
              isLeaf: true,
              children: [],
              translations: new Map([
                ['en-US', 'Home'],
                ['nl-NL', 'Thuis'],
              ]),
            },
            {
              name: 'about',
              fullKey: 'nav.about',
              isLeaf: true,
              children: [],
              translations: new Map([
                ['en-US', 'About'],
                ['nl-NL', 'Over Ons'],
              ]),
            },
          ],
        },
      ];

      const locales = serializeToLocalesConfiguration(tree);

      expect(locales['en-US']).toEqual({
        nav: {
          home: 'Home',
          about: 'About',
        },
      });
      expect(locales['nl-NL']).toEqual({
        nav: {
          home: 'Thuis',
          about: 'Over Ons',
        },
      });
    });

    it('should handle deeply nested tree', () => {
      const tree: KeyTreeNode[] = [
        {
          name: 'app',
          fullKey: 'app',
          isLeaf: false,
          children: [
            {
              name: 'ui',
              fullKey: 'app.ui',
              isLeaf: false,
              children: [
                {
                  name: 'submit',
                  fullKey: 'app.ui.submit',
                  isLeaf: true,
                  children: [],
                  translations: new Map([['en-US', 'Submit']]),
                },
              ],
            },
          ],
        },
      ];

      const locales = serializeToLocalesConfiguration(tree);

      expect(locales['en-US']).toEqual({
        app: {
          ui: {
            submit: 'Submit',
          },
        },
      });
    });

    it('should handle empty tree', () => {
      const tree: KeyTreeNode[] = [];

      const locales = serializeToLocalesConfiguration(tree);

      expect(Object.keys(locales)).toHaveLength(0);
    });

    it('should preserve missing translations as absent (not empty string)', () => {
      const tree: KeyTreeNode[] = [
        {
          name: 'home',
          fullKey: 'home',
          isLeaf: true,
          children: [],
          translations: new Map([
            ['en-US', 'Home'],
            // nl-NL missing
          ]),
        },
        {
          name: 'about',
          fullKey: 'about',
          isLeaf: true,
          children: [],
          translations: new Map([
            ['en-US', 'About'],
            ['nl-NL', 'Over Ons'],
          ]),
        },
      ];

      const locales = serializeToLocalesConfiguration(tree);

      expect(locales['en-US']).toEqual({ home: 'Home', about: 'About' });
      expect(locales['nl-NL']).toEqual({ about: 'Over Ons' });
      // nl-NL should NOT have 'home' key at all
      expect(Object.hasOwn(locales['nl-NL'], 'home')).toBe(false);
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve data through buildKeyTree -> serializeToLocalesConfiguration', () => {
      const original: ILocalesConfiguration = {
        'en-US': {
          nav: {
            home: 'Home',
            about: 'About Us',
          },
          button: {
            submit: 'Submit',
            cancel: 'Cancel',
          },
        },
        'nl-NL': {
          nav: {
            home: 'Thuis',
            about: 'Over Ons',
          },
          button: {
            submit: 'Verzenden',
            cancel: 'Annuleren',
          },
        },
      };

      const tree = buildKeyTree(original);
      const roundTripped = serializeToLocalesConfiguration(tree);

      expect(roundTripped).toEqual(original);
    });

    it('should preserve deeply nested data through round-trip', () => {
      const original: ILocalesConfiguration = {
        'en-US': {
          app: {
            ui: {
              forms: {
                login: {
                  title: 'Login',
                  submit: 'Sign In',
                },
              },
            },
          },
        },
        'fr-FR': {
          app: {
            ui: {
              forms: {
                login: {
                  title: 'Connexion',
                  submit: "S'identifier",
                },
              },
            },
          },
        },
      };

      const tree = buildKeyTree(original);
      const roundTripped = serializeToLocalesConfiguration(tree);

      expect(roundTripped).toEqual(original);
    });
  });

  describe('localeDataToKeyTree() - Single locale conversion', () => {
    it('should convert single locale data to tree with specified locale', () => {
      const localeData = {
        nav: {
          home: 'Home',
        },
      };

      const tree = localeDataToKeyTree(localeData, 'en-US');

      expect(tree).toHaveLength(1);
      const navNode = tree[0];
      expect(navNode.name).toBe('nav');
      expect(navNode.children[0].translations?.get('en-US')).toBe('Home');
    });
  });

  describe('keyTreeToLocaleData() - Single locale extraction', () => {
    it('should extract single locale data from tree', () => {
      const tree: KeyTreeNode[] = [
        {
          name: 'nav',
          fullKey: 'nav',
          isLeaf: false,
          children: [
            {
              name: 'home',
              fullKey: 'nav.home',
              isLeaf: true,
              children: [],
              translations: new Map([
                ['en-US', 'Home'],
                ['nl-NL', 'Thuis'],
              ]),
            },
          ],
        },
      ];

      const enData = keyTreeToLocaleData(tree, 'en-US');
      const nlData = keyTreeToLocaleData(tree, 'nl-NL');

      expect(enData).toEqual({ nav: { home: 'Home' } });
      expect(nlData).toEqual({ nav: { home: 'Thuis' } });
    });

    it('should return empty object for locale with no translations', () => {
      const tree: KeyTreeNode[] = [
        {
          name: 'home',
          fullKey: 'home',
          isLeaf: true,
          children: [],
          translations: new Map([['en-US', 'Home']]),
        },
      ];

      const frData = keyTreeToLocaleData(tree, 'fr-FR');

      expect(frData).toEqual({});
    });
  });
});
