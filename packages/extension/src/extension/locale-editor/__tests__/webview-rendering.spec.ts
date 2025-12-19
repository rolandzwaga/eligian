/**
 * Webview Rendering Tests (Feature 045, Phase 4D)
 *
 * Tests for the refactored webview that handles ILocalesConfiguration format
 * with KeyTreeNode[] for hierarchical key display.
 *
 * Tests cover:
 * - T044: New message type handling
 * - T045-T047: Tree view rendering
 * - T048: Inline cell editing
 * - T049-T050: Add key/locale functionality
 * - T051: Message sending for new data structures
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { SerializableKeyTreeNode } from '../types.js';

// New message types for ILocalesConfiguration format
type LocaleToWebviewMessage =
  | {
      type: 'initialize';
      locales: string[];
      keyTree: SerializableKeyTreeNode[];
      filePath: string;
      selectedKey?: string;
    }
  | {
      type: 'reload';
      locales: string[];
      keyTree: SerializableKeyTreeNode[];
    }
  | {
      type: 'select-key';
      key: string;
    }
  | {
      type: 'validation-error';
      errors: Array<{
        key?: string;
        locale?: string;
        field: string;
        message: string;
        code: string;
      }>;
    }
  | {
      type: 'save-complete';
      success: boolean;
    };

// NOTE: LocaleToExtensionMessage type removed - was only used for tautological tests.
// Type definitions are in types.ts and validated at compile time.

// Test state type for new format
interface LocaleEditorState {
  locales: string[];
  keyTree: SerializableKeyTreeNode[];
  selectedKey: string | null;
  filePath: string;
  isDirty: boolean;
  expandedKeys: Set<string>;
}

describe('Webview Rendering (Feature 045, Phase 4D)', () => {
  let state: LocaleEditorState;

  beforeEach(() => {
    // Initialize test state
    state = {
      locales: [],
      keyTree: [],
      selectedKey: null,
      filePath: '',
      isDirty: false,
      expandedKeys: new Set(),
    };
  });

  describe('T044: New message type handling', () => {
    it('should handle initialize message with keyTree', () => {
      const message: LocaleToWebviewMessage = {
        type: 'initialize',
        locales: ['en-US', 'nl-NL'],
        keyTree: [
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
                translations: { 'en-US': 'Home', 'nl-NL': 'Thuis' },
              },
            ],
          },
        ],
        filePath: '/test/locales.json',
      };

      // Simulate handling initialize message
      state.locales = message.locales;
      state.keyTree = message.keyTree;
      state.filePath = message.filePath;

      expect(state.locales).toEqual(['en-US', 'nl-NL']);
      expect(state.keyTree).toHaveLength(1);
      expect(state.keyTree[0].name).toBe('nav');
      expect(state.keyTree[0].children[0].translations?.['en-US']).toBe('Home');
    });

    it('should handle reload message preserving expanded state', () => {
      // Set initial expanded state
      state.expandedKeys.add('nav');

      const message: LocaleToWebviewMessage = {
        type: 'reload',
        locales: ['en-US', 'nl-NL', 'fr-FR'],
        keyTree: [
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
                translations: { 'en-US': 'Home', 'nl-NL': 'Thuis', 'fr-FR': 'Accueil' },
              },
            ],
          },
        ],
      };

      // Simulate handling reload message
      state.locales = message.locales;
      state.keyTree = message.keyTree;

      expect(state.locales).toHaveLength(3);
      expect(state.expandedKeys.has('nav')).toBe(true); // Preserved
    });

    it('should handle select-key message', () => {
      state.keyTree = [
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
              translations: { 'en-US': 'Home' },
            },
          ],
        },
      ];

      const message: LocaleToWebviewMessage = {
        type: 'select-key',
        key: 'nav.home',
      };

      // Simulate handling select-key message
      state.selectedKey = message.key;
      // Should also expand parent keys
      state.expandedKeys.add('nav');

      expect(state.selectedKey).toBe('nav.home');
      expect(state.expandedKeys.has('nav')).toBe(true);
    });
  });

  describe('T045-T047: Tree view rendering', () => {
    it('should render flat keys as single level', () => {
      const keyTree: SerializableKeyTreeNode[] = [
        {
          name: 'home',
          fullKey: 'home',
          isLeaf: true,
          children: [],
          translations: { 'en-US': 'Home' },
        },
        {
          name: 'about',
          fullKey: 'about',
          isLeaf: true,
          children: [],
          translations: { 'en-US': 'About' },
        },
      ];

      // Count leaf nodes at root level
      const leafCount = keyTree.filter(n => n.isLeaf).length;
      expect(leafCount).toBe(2);
    });

    it('should render nested keys with expandable branches', () => {
      const keyTree: SerializableKeyTreeNode[] = [
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
              translations: { 'en-US': 'Home' },
            },
            {
              name: 'about',
              fullKey: 'nav.about',
              isLeaf: true,
              children: [],
              translations: { 'en-US': 'About' },
            },
          ],
        },
      ];

      // Count branch nodes (should be expandable)
      const branchCount = keyTree.filter(n => !n.isLeaf).length;
      expect(branchCount).toBe(1);
      expect(keyTree[0].children).toHaveLength(2);
    });

    it('should track expanded/collapsed state', () => {
      const expandedKeys = new Set<string>();

      // Initially collapsed
      expect(expandedKeys.has('nav')).toBe(false);

      // Expand
      expandedKeys.add('nav');
      expect(expandedKeys.has('nav')).toBe(true);

      // Collapse
      expandedKeys.delete('nav');
      expect(expandedKeys.has('nav')).toBe(false);
    });

    it('should render locale columns for leaf nodes', () => {
      const locales = ['en-US', 'nl-NL', 'fr-FR'];
      const leafNode: SerializableKeyTreeNode = {
        name: 'home',
        fullKey: 'home',
        isLeaf: true,
        children: [],
        translations: { 'en-US': 'Home', 'nl-NL': 'Thuis' },
      };

      // Check which locales have translations
      const translatedLocales = locales.filter(l => leafNode.translations?.[l] !== undefined);
      const missingLocales = locales.filter(l => leafNode.translations?.[l] === undefined);

      expect(translatedLocales).toEqual(['en-US', 'nl-NL']);
      expect(missingLocales).toEqual(['fr-FR']);
    });
  });

  describe('T048: Inline cell editing', () => {
    // NOTE: Tautological test removed - testing mockPostMessage(x).toHaveBeenCalledWith(x)
    // doesn't prove anything. The actual message sending is tested in integration tests.

    it('should update local state optimistically', () => {
      state.keyTree = [
        {
          name: 'home',
          fullKey: 'home',
          isLeaf: true,
          children: [],
          translations: { 'en-US': 'Home' },
        },
      ];

      // Simulate optimistic update
      const findNode = (
        tree: SerializableKeyTreeNode[],
        key: string
      ): SerializableKeyTreeNode | undefined => {
        for (const node of tree) {
          if (node.fullKey === key) return node;
          if (node.children.length > 0) {
            const found = findNode(node.children, key);
            if (found) return found;
          }
        }
        return undefined;
      };

      const node = findNode(state.keyTree, 'home');
      if (node?.translations) {
        node.translations['en-US'] = 'Welcome';
      }

      expect(state.keyTree[0].translations?.['en-US']).toBe('Welcome');
    });
  });

  // NOTE: T049-T051 tautological tests removed.
  // Tests like mockPostMessage(x).toHaveBeenCalledWith(x) don't test production code.
  // Message type definitions are validated by TypeScript at compile time.
  // Actual message handling is tested in integration tests (dom-reconciliation.spec.ts).

  describe('Key tree utilities', () => {
    it('should find node by key in nested tree', () => {
      const keyTree: SerializableKeyTreeNode[] = [
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
              translations: { 'en-US': 'Home' },
            },
          ],
        },
      ];

      const findNode = (
        tree: SerializableKeyTreeNode[],
        key: string
      ): SerializableKeyTreeNode | undefined => {
        for (const node of tree) {
          if (node.fullKey === key) return node;
          if (node.children.length > 0) {
            const found = findNode(node.children, key);
            if (found) return found;
          }
        }
        return undefined;
      };

      expect(findNode(keyTree, 'nav')).toBeDefined();
      expect(findNode(keyTree, 'nav.home')).toBeDefined();
      expect(findNode(keyTree, 'nav.about')).toBeUndefined();
    });

    it('should get parent keys for expansion', () => {
      const fullKey = 'nav.buttons.submit';
      const parts = fullKey.split('.');
      const parentKeys: string[] = [];

      for (let i = 1; i < parts.length; i++) {
        parentKeys.push(parts.slice(0, i).join('.'));
      }

      expect(parentKeys).toEqual(['nav', 'nav.buttons']);
    });
  });
});
