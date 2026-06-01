/**
 * Tests for the new-format (Feature 045) tree manipulation functions in
 * locale-editor-core.ts.
 *
 * Focus: these functions are documented as pure (return new state). Regression
 * coverage for B64-B66 — they previously mutated the input state's keyTree in
 * place while returning a shallow-spread copy, so reference-equality consumers
 * missed the change.
 */

import { describe, expect, test } from 'vitest';
import {
  addKeyToTree,
  createInitialLocaleState,
  type LocaleEditorState,
  type SerializableKeyTreeNode,
  updateTranslationValue,
} from '../locale-editor-core.js';

function leaf(
  name: string,
  fullKey: string,
  translations: Record<string, string>
): SerializableKeyTreeNode {
  return { name, fullKey, isLeaf: true, children: [], translations };
}

function branch(
  name: string,
  fullKey: string,
  children: SerializableKeyTreeNode[]
): SerializableKeyTreeNode {
  return { name, fullKey, isLeaf: false, children };
}

function stateWith(keyTree: SerializableKeyTreeNode[], locales: string[]): LocaleEditorState {
  return { ...createInitialLocaleState(), locales, keyTree };
}

describe('locale-editor-core tree functions (Feature 045)', () => {
  describe('updateTranslationValue (B64 - immutability)', () => {
    test('returns a new state without mutating the original tree', () => {
      const original = stateWith(
        [branch('nav', 'nav', [leaf('home', 'nav.home', { 'en-US': 'Home', 'nl-NL': '' })])],
        ['en-US', 'nl-NL']
      );

      const next = updateTranslationValue(original, 'nav.home', 'nl-NL', 'Thuis');

      // Original untouched
      expect(original.keyTree[0].children[0].translations).toEqual({
        'en-US': 'Home',
        'nl-NL': '',
      });
      // New state reflects the change
      expect(next.keyTree[0].children[0].translations).toEqual({
        'en-US': 'Home',
        'nl-NL': 'Thuis',
      });
      // Reference equality: changed branch is a new object, state is dirty
      expect(next).not.toBe(original);
      expect(next.keyTree).not.toBe(original.keyTree);
      expect(next.keyTree[0]).not.toBe(original.keyTree[0]);
      expect(next.isDirty).toBe(true);
    });

    test('leaves unrelated nodes referentially equal', () => {
      const other = leaf('other', 'other', { 'en-US': 'Other' });
      const original = stateWith([leaf('home', 'home', { 'en-US': 'Home' }), other], ['en-US']);

      const next = updateTranslationValue(original, 'home', 'en-US', 'Updated');

      // Untouched sibling keeps its identity (structural sharing)
      expect(next.keyTree[1]).toBe(other);
    });

    test('no-op for an unknown key still returns a new dirty state', () => {
      const original = stateWith([leaf('home', 'home', { 'en-US': 'Home' })], ['en-US']);

      const next = updateTranslationValue(original, 'missing', 'en-US', 'x');

      expect(next).not.toBe(original);
      expect(next.keyTree[0].translations).toEqual({ 'en-US': 'Home' });
    });
  });

  describe('addKeyToTree (B65 - immutability)', () => {
    test('adds a root key without mutating the original', () => {
      const original = stateWith([], ['en-US', 'nl-NL']);

      const next = addKeyToTree(original, null, 'title');

      expect(original.keyTree).toHaveLength(0);
      expect(next.keyTree).toHaveLength(1);
      expect(next.keyTree[0]).toMatchObject({
        name: 'title',
        fullKey: 'title',
        isLeaf: true,
        translations: { 'en-US': '', 'nl-NL': '' },
      });
      expect(next.isDirty).toBe(true);
    });

    test('adds a nested key under a parent without mutating the original tree', () => {
      const original = stateWith([branch('nav', 'nav', [])], ['en-US']);

      const next = addKeyToTree(original, 'nav', 'home');

      // Original parent untouched
      expect(original.keyTree[0].children).toHaveLength(0);
      expect(original.keyTree[0].isLeaf).toBe(false);
      // New tree has the child attached under a fresh parent object
      expect(next.keyTree[0]).not.toBe(original.keyTree[0]);
      expect(next.keyTree[0].children).toHaveLength(1);
      expect(next.keyTree[0].children[0]).toMatchObject({
        fullKey: 'nav.home',
        isLeaf: true,
        translations: { 'en-US': '' },
      });
      expect(next.isDirty).toBe(true);
    });
  });
});
