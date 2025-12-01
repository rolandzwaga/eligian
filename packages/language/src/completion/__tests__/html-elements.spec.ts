/**
 * HTML Element Completion Tests (Feature 043, Phase 3)
 *
 * Tests for HTML element name completion in createElement calls.
 * Following TDD approach per constitution principle V.
 *
 * NOTE: These tests use createTestContext() per TESTING_GUIDE.md
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import { HTML_ELEMENT_NAMES } from '../html-elements.generated.js';
import { HTMLElementCompletionProvider } from '../html-elements.js';

describe('HTML Element Name Completion (Feature 043, US1)', () => {
  let _ctx: TestContext;
  let provider: HTMLElementCompletionProvider;

  beforeAll(() => {
    _ctx = createTestContext();
    provider = new HTMLElementCompletionProvider();
  });

  describe('Element Name Completions (T011-T015)', () => {
    test('should provide all 112 HTML elements when cursor in empty string (T012)', () => {
      const completions = provider.getElementNameCompletions('');

      // Verify we get all 112 elements
      expect(completions.length).toBe(HTML_ELEMENT_NAMES.length);
      expect(completions.length).toBe(112);
    });

    test('should filter elements by partial text (T013)', () => {
      // "bu" should filter to "button"
      const completions = provider.getElementNameCompletions('bu');

      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some(c => c.label === 'button')).toBe(true);

      // Should not include non-matching elements
      expect(completions.every(c => c.label.includes('bu'))).toBe(true);
    });

    test('should sort completions alphabetically (T014)', () => {
      const completions = provider.getElementNameCompletions('');

      // Extract labels
      const labels = completions.map(c => c.label);
      const sortedLabels = [...labels].sort();

      expect(labels).toEqual(sortedLabels);
    });

    test('should include "HTML element" in detail text (T015)', () => {
      const completions = provider.getElementNameCompletions('');

      // Every completion should have detail text
      for (const completion of completions) {
        expect(completion.detail).toContain('HTML');
      }
    });

    test('should include common elements like div, span, button (T011)', () => {
      const completions = provider.getElementNameCompletions('');
      const labels = completions.map(c => c.label);

      // Verify common elements are present
      expect(labels).toContain('div');
      expect(labels).toContain('span');
      expect(labels).toContain('button');
      expect(labels).toContain('input');
      expect(labels).toContain('a');
      expect(labels).toContain('img');
      expect(labels).toContain('form');
      expect(labels).toContain('table');
    });

    test('should handle case-insensitive filtering', () => {
      const lowerCompletions = provider.getElementNameCompletions('div');
      const upperCompletions = provider.getElementNameCompletions('DIV');

      // Both should find "div"
      expect(lowerCompletions.some(c => c.label === 'div')).toBe(true);
      expect(upperCompletions.some(c => c.label === 'div')).toBe(true);
    });

    test('should return empty array for non-matching filter', () => {
      const completions = provider.getElementNameCompletions('xyz123');

      expect(completions).toHaveLength(0);
    });
  });

  describe('Completion Item Structure', () => {
    test('should have correct completion item kind', () => {
      const completions = provider.getElementNameCompletions('');

      // All completions should have a kind set
      for (const completion of completions) {
        expect(completion.kind).toBeDefined();
      }
    });

    test('should provide insert text for completions', () => {
      const completions = provider.getElementNameCompletions('');

      // Each completion should have label and insertText
      for (const completion of completions) {
        expect(completion.label).toBeDefined();
        expect(completion.insertText || completion.label).toBeDefined();
      }
    });
  });
});

describe('HTML Attribute Name Completion (Feature 043, US2)', () => {
  let provider: HTMLElementCompletionProvider;

  beforeAll(() => {
    provider = new HTMLElementCompletionProvider();
  });

  describe('Attribute Name Completions (T023-T028)', () => {
    test('should provide anchor attributes (href, target) for "a" element (T024)', () => {
      const completions = provider.getAttributeNameCompletions('a');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('href');
      expect(labels).toContain('target');
      expect(labels).toContain('download');
    });

    test('should provide image attributes (src, alt) for "img" element (T025)', () => {
      const completions = provider.getAttributeNameCompletions('img');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('src');
      expect(labels).toContain('alt');
      expect(labels).toContain('width');
      expect(labels).toContain('height');
    });

    test('should provide input attributes (type, value) for "input" element (T026)', () => {
      const completions = provider.getAttributeNameCompletions('input');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('type');
      expect(labels).toContain('value');
      expect(labels).toContain('placeholder');
      expect(labels).toContain('disabled');
    });

    test('should provide common attributes (id, className) for all elements (T027)', () => {
      // Check common attributes appear for different elements
      for (const element of ['div', 'span', 'button', 'input', 'a']) {
        const completions = provider.getAttributeNameCompletions(element);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('id');
        expect(labels).toContain('className');
        expect(labels).toContain('style');
      }
    });

    test('should filter attributes by partial text (T028)', () => {
      const completions = provider.getAttributeNameCompletions('input', 'val');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('value');
      // Should only include attributes containing "val"
      expect(completions.every(c => c.label.toLowerCase().includes('val'))).toBe(true);
    });

    test('should sort attributes alphabetically', () => {
      const completions = provider.getAttributeNameCompletions('div');
      const labels = completions.map(c => c.label);
      const sortedLabels = [...labels].sort();

      expect(labels).toEqual(sortedLabels);
    });

    test('should return common attributes for unknown elements (T033)', () => {
      // Unknown element should still get common HTML attributes
      const completions = provider.getAttributeNameCompletions('my-custom-element');
      const labels = completions.map(c => c.label);

      // Should have common attributes
      expect(labels).toContain('id');
      expect(labels).toContain('className');
    });
  });
});

describe('HTML Attribute Value Completion (Feature 043, US3)', () => {
  let provider: HTMLElementCompletionProvider;

  beforeAll(() => {
    provider = new HTMLElementCompletionProvider();
  });

  describe('Attribute Value Completions (T036-T041)', () => {
    test('should provide input type values (text, password, checkbox) (T037)', () => {
      const completions = provider.getAttributeValueCompletions('input', 'type');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('text');
      expect(labels).toContain('password');
      expect(labels).toContain('checkbox');
      expect(labels).toContain('submit');
      expect(labels).toContain('button');
    });

    test('should provide anchor target values (_self, _blank, _parent, _top) (T038)', () => {
      const completions = provider.getAttributeValueCompletions('a', 'target');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('_self');
      expect(labels).toContain('_blank');
      expect(labels).toContain('_parent');
      expect(labels).toContain('_top');
    });

    test('should provide img loading values (eager, lazy) (T039)', () => {
      const completions = provider.getAttributeValueCompletions('img', 'loading');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('eager');
      expect(labels).toContain('lazy');
    });

    test('should return empty for non-enum attributes (id, src) (T040)', () => {
      // Non-enum attributes should return empty
      const idCompletions = provider.getAttributeValueCompletions('div', 'id');
      const srcCompletions = provider.getAttributeValueCompletions('img', 'src');

      expect(idCompletions).toHaveLength(0);
      expect(srcCompletions).toHaveLength(0);
    });

    test('should filter values by partial text (T041)', () => {
      const completions = provider.getAttributeValueCompletions('input', 'type', 'che');
      const labels = completions.map(c => c.label);

      expect(labels).toContain('checkbox');
      // Should only include values containing "che"
      expect(completions.every(c => c.label.toLowerCase().includes('che'))).toBe(true);
    });

    test('should sort values alphabetically', () => {
      const completions = provider.getAttributeValueCompletions('input', 'type');
      const labels = completions.map(c => c.label);
      const sortedLabels = [...labels].sort();

      expect(labels).toEqual(sortedLabels);
    });
  });
});
