/**
 * LocaleEditorProvider Tests (Feature 045, Phase 4C)
 *
 * Tests for the refactored LocaleEditorProvider that handles ILocalesConfiguration format.
 * Tests cover:
 * - T037: loadDocument() parsing ILocalesConfiguration
 * - T038: saveDocument() serializing back to ILocalesConfiguration
 * - T039: 'initialize' message handler sending KeyTreeNode[]
 * - T040: 'add-key' message handler
 * - T041: 'update-translation' message handler
 * - T042: 'delete-key' message handler
 * - T043: 'rename-key' message handler
 */

import type { ILocalesConfiguration } from 'eligius';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addKeyToConfig,
  deleteKeyFromConfig,
  keyTreeToSerializable,
  parseLocalesConfiguration,
  renameKeyInConfig,
  serializableToKeyTree,
  updateTranslationInConfig,
} from '../locale-editor-utils.js';
import type { KeyTreeNode, SerializableKeyTreeNode } from '../types.js';

// Mock vscode module
vi.mock('vscode', () => ({
  Uri: {
    file: (path: string) => ({ scheme: 'file', path, fsPath: path }),
    joinPath: (...parts: unknown[]) => ({ fsPath: parts.join('/') }),
  },
  workspace: {
    applyEdit: vi.fn().mockResolvedValue(true),
  },
  WorkspaceEdit: vi.fn().mockImplementation(() => ({
    replace: vi.fn(),
  })),
  Range: vi.fn(),
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
}));

describe('LocaleEditorProvider (Feature 045, Phase 4C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('T037: parseLocalesConfiguration()', () => {
    it('should parse valid ILocalesConfiguration JSON', () => {
      const json = JSON.stringify({
        'en-US': { nav: { home: 'Home' } },
        'nl-NL': { nav: { home: 'Thuis' } },
      });

      const result = parseLocalesConfiguration(json);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config!['en-US']).toEqual({ nav: { home: 'Home' } });
    });

    it('should return error for invalid JSON', () => {
      const json = '{ invalid json }';

      const result = parseLocalesConfiguration(json);

      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON');
    });

    it('should return error for non-object JSON', () => {
      const json = JSON.stringify(['array', 'not', 'object']);

      const result = parseLocalesConfiguration(json);

      expect(result.success).toBe(false);
      expect(result.error).toContain('object');
    });

    it('should handle empty object', () => {
      const json = JSON.stringify({});

      const result = parseLocalesConfiguration(json);

      expect(result.success).toBe(true);
      expect(result.config).toEqual({});
    });

    it('should handle deeply nested translations', () => {
      const json = JSON.stringify({
        'en-US': {
          app: {
            ui: {
              buttons: {
                submit: 'Submit',
              },
            },
          },
        },
      });

      const result = parseLocalesConfiguration(json);

      expect(result.success).toBe(true);
      expect((result.config!['en-US'] as any).app.ui.buttons.submit).toBe('Submit');
    });
  });

  describe('T039: keyTreeToSerializable()', () => {
    it('should convert KeyTreeNode[] to SerializableKeyTreeNode[]', () => {
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

      const serializable = keyTreeToSerializable(tree);

      expect(serializable[0].translations).toEqual({
        'en-US': 'Home',
        'nl-NL': 'Thuis',
      });
      expect(serializable[0].translations).not.toBeInstanceOf(Map);
    });

    it('should handle nested nodes', () => {
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
              translations: new Map([['en-US', 'Home']]),
            },
          ],
        },
      ];

      const serializable = keyTreeToSerializable(tree);

      expect(serializable[0].children[0].translations).toEqual({ 'en-US': 'Home' });
    });

    it('should handle branch nodes without translations', () => {
      const tree: KeyTreeNode[] = [
        {
          name: 'nav',
          fullKey: 'nav',
          isLeaf: false,
          children: [],
        },
      ];

      const serializable = keyTreeToSerializable(tree);

      expect(serializable[0].translations).toBeUndefined();
    });
  });

  describe('serializableToKeyTree()', () => {
    it('should convert SerializableKeyTreeNode[] back to KeyTreeNode[]', () => {
      const serializable: SerializableKeyTreeNode[] = [
        {
          name: 'home',
          fullKey: 'home',
          isLeaf: true,
          children: [],
          translations: { 'en-US': 'Home', 'nl-NL': 'Thuis' },
        },
      ];

      const tree = serializableToKeyTree(serializable);

      expect(tree[0].translations).toBeInstanceOf(Map);
      expect(tree[0].translations?.get('en-US')).toBe('Home');
      expect(tree[0].translations?.get('nl-NL')).toBe('Thuis');
    });
  });

  describe('T041: updateTranslationInConfig()', () => {
    it('should update existing translation', () => {
      const config: ILocalesConfiguration = {
        'en-US': { nav: { home: 'Home' } },
        'nl-NL': { nav: { home: 'Thuis' } },
      };

      const updated = updateTranslationInConfig(config, 'nav.home', 'en-US', 'Welcome');

      expect((updated['en-US'] as any).nav.home).toBe('Welcome');
      expect((updated['nl-NL'] as any).nav.home).toBe('Thuis'); // Unchanged
    });

    it('should add translation to new locale', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
      };

      const updated = updateTranslationInConfig(config, 'home', 'nl-NL', 'Thuis');

      expect((updated['nl-NL'] as any).home).toBe('Thuis');
    });

    it('should create nested path if not exists', () => {
      const config: ILocalesConfiguration = {
        'en-US': {},
      };

      const updated = updateTranslationInConfig(config, 'nav.home', 'en-US', 'Home');

      expect((updated['en-US'] as any).nav.home).toBe('Home');
    });

    it('should not mutate original config', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
      };

      const updated = updateTranslationInConfig(config, 'home', 'en-US', 'Welcome');

      expect((config['en-US'] as any).home).toBe('Home'); // Original unchanged
      expect((updated['en-US'] as any).home).toBe('Welcome');
    });
  });

  describe('T040: addKeyToConfig()', () => {
    it('should add key to all locales with empty value', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
        'nl-NL': { home: 'Thuis' },
      };

      const updated = addKeyToConfig(config, 'about');

      expect((updated['en-US'] as any).about).toBe('');
      expect((updated['nl-NL'] as any).about).toBe('');
    });

    it('should add nested key to all locales', () => {
      const config: ILocalesConfiguration = {
        'en-US': { nav: { home: 'Home' } },
        'nl-NL': { nav: { home: 'Thuis' } },
      };

      const updated = addKeyToConfig(config, 'nav.about');

      expect((updated['en-US'] as any).nav.about).toBe('');
      expect((updated['nl-NL'] as any).nav.about).toBe('');
    });

    it('should create parent path if not exists', () => {
      const config: ILocalesConfiguration = {
        'en-US': {},
      };

      const updated = addKeyToConfig(config, 'nav.home');

      expect((updated['en-US'] as any).nav.home).toBe('');
    });

    it('should not overwrite existing key', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
      };

      const updated = addKeyToConfig(config, 'home');

      expect((updated['en-US'] as any).home).toBe('Home'); // Preserved
    });
  });

  describe('T042: deleteKeyFromConfig()', () => {
    it('should delete key from all locales', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home', about: 'About' },
        'nl-NL': { home: 'Thuis', about: 'Over' },
      };

      const updated = deleteKeyFromConfig(config, 'about');

      expect((updated['en-US'] as any).about).toBeUndefined();
      expect((updated['nl-NL'] as any).about).toBeUndefined();
      expect((updated['en-US'] as any).home).toBe('Home'); // Preserved
    });

    it('should delete nested key from all locales', () => {
      const config: ILocalesConfiguration = {
        'en-US': { nav: { home: 'Home', about: 'About' } },
      };

      const updated = deleteKeyFromConfig(config, 'nav.about');

      expect((updated['en-US'] as any).nav.about).toBeUndefined();
      expect((updated['en-US'] as any).nav.home).toBe('Home'); // Preserved
    });

    it('should clean up empty parent objects', () => {
      const config: ILocalesConfiguration = {
        'en-US': { nav: { home: 'Home' } },
      };

      const updated = deleteKeyFromConfig(config, 'nav.home');

      // nav should be removed since it's now empty
      expect((updated['en-US'] as any).nav).toBeUndefined();
    });

    it('should handle non-existent key gracefully', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
      };

      const updated = deleteKeyFromConfig(config, 'nonexistent');

      expect(updated).toEqual(config);
    });
  });

  describe('T043: renameKeyInConfig()', () => {
    it('should rename key in all locales preserving translations', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
        'nl-NL': { home: 'Thuis' },
      };

      const updated = renameKeyInConfig(config, 'home', 'welcome');

      expect((updated['en-US'] as any).welcome).toBe('Home');
      expect((updated['nl-NL'] as any).welcome).toBe('Thuis');
      expect((updated['en-US'] as any).home).toBeUndefined();
      expect((updated['nl-NL'] as any).home).toBeUndefined();
    });

    it('should rename nested key preserving translations', () => {
      const config: ILocalesConfiguration = {
        'en-US': { nav: { home: 'Home' } },
        'nl-NL': { nav: { home: 'Thuis' } },
      };

      const updated = renameKeyInConfig(config, 'nav.home', 'nav.welcome');

      expect((updated['en-US'] as any).nav.welcome).toBe('Home');
      expect((updated['nl-NL'] as any).nav.welcome).toBe('Thuis');
      expect((updated['en-US'] as any).nav.home).toBeUndefined();
    });

    it('should move key to different parent', () => {
      const config: ILocalesConfiguration = {
        'en-US': { nav: { home: 'Home' }, footer: {} },
      };

      const updated = renameKeyInConfig(config, 'nav.home', 'footer.home');

      expect((updated['en-US'] as any).footer.home).toBe('Home');
      // nav gets cleaned up since it's now empty
      expect((updated['en-US'] as any).nav).toBeUndefined();
    });

    it('should handle non-existent old key gracefully', () => {
      const config: ILocalesConfiguration = {
        'en-US': { home: 'Home' },
      };

      const updated = renameKeyInConfig(config, 'nonexistent', 'newkey');

      expect(updated).toEqual(config);
    });
  });
});
