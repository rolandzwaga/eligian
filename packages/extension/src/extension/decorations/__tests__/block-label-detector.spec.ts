/**
 * Tests for block label detection
 *
 * Verifies that we can find the positions of '[' brackets for:
 * 1. EndableActionDefinition - endable action ... [] []
 * 2. InlineEndableAction - at 0s..4s [] []
 */

import { describe, expect, it } from 'vitest';
import { createTestDocument } from '../../../language/test-helpers.js';
import { findBlockLabels } from '../block-label-detector.js';

describe('Block Label Detection', () => {
  describe('EndableActionDefinition', () => {
    it('should find start and end bracket positions for endable action', async () => {
      const source = `
endable action fadeIn(selector: string, duration) [
  selectElement(selector)
  setStyle({opacity: 0})
] [
  animate({opacity: 0}, duration)
]
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(1);
      expect(labels[0].type).toBe('action');

      // Start bracket should be at end of line 1 (after parameters)
      expect(labels[0].startBracketPosition.line).toBe(0);
      expect(labels[0].startBracketPosition.character).toBeGreaterThan(40);

      // End bracket should be on line 4 (after first ']')
      expect(labels[0].endBracketPosition.line).toBe(3);
      expect(labels[0].endBracketPosition.character).toBe(2);
    });

    it('should handle empty start and end blocks', async () => {
      const source = `endable action test() [] []`;

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(1);
      expect(labels[0].type).toBe('action');
      expect(labels[0].startBracketPosition.character).toBe(22);
      expect(labels[0].endBracketPosition.character).toBe(25);
    });

    it('should handle multiple endable actions', async () => {
      const source = `
endable action fadeIn() [] []
endable action fadeOut() [] []
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(2);
      expect(labels[0].type).toBe('action');
      expect(labels[1].type).toBe('action');
      expect(labels[0].startBracketPosition.line).toBe(0);
      expect(labels[1].startBracketPosition.line).toBe(1);
    });
  });

  describe('InlineEndableAction (Timeline blocks)', () => {
    it('should find start and end bracket positions for timeline event', async () => {
      const source = `
timeline "Test" in "#container" using raf {
  at 0s..4s [
    showSlide1()
  ] []
}
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(1);
      expect(labels[0].type).toBe('timeline');

      // Start bracket on line 1 (after time range)
      expect(labels[0].startBracketPosition.line).toBe(1);

      // End bracket on line 3 (empty block)
      expect(labels[0].endBracketPosition.line).toBe(3);
    });

    it('should handle timeline with empty blocks', async () => {
      const source = `
timeline "Test" in "#container" using raf {
  at 0s..4s [] []
}
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(1);
      expect(labels[0].type).toBe('timeline');
    });

    it('should handle multiple timeline events', async () => {
      const source = `
timeline "Test" in "#container" using raf {
  at 0s..2s [log("1")] []
  at 2s..4s [log("2")] []
}
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(2);
      expect(labels[0].type).toBe('timeline');
      expect(labels[1].type).toBe('timeline');
      expect(labels[0].startBracketPosition.line).toBe(1);
      expect(labels[1].startBracketPosition.line).toBe(2);
    });
  });

  describe('Mixed content', () => {
    it('should detect both endable actions and timeline blocks', async () => {
      const source = `
endable action fadeIn() [
  log("start")
] [
  log("end")
]

timeline "Test" in "#container" using raf {
  at 0s..4s [
    fadeIn()
  ] []
}
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(2);
      expect(labels[0].type).toBe('action');
      expect(labels[1].type).toBe('timeline');
    });
  });

  describe('Regular actions (should not be labeled)', () => {
    it('should NOT detect regular (non-endable) actions', async () => {
      const source = `
action regularAction() [
  log("regular")
]

endable action endableAction() [] []
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      // Should only find the endable action, not the regular one
      expect(labels).toHaveLength(1);
      expect(labels[0].type).toBe('action');
      expect(labels[0].startBracketPosition.line).toBe(4);
    });
  });

  describe('Edge cases', () => {
    it('should handle single-line endable actions', async () => {
      const source = `endable action test() [log("a")] [log("b")]`;

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(1);
      expect(labels[0].startBracketPosition.line).toBe(0);
      expect(labels[0].endBracketPosition.line).toBe(0);
    });

    it('should return empty array for document with no endable constructs', async () => {
      const source = `
action test() [
  log("test")
]

timeline "Test" in "#container" using raf {
  at 0s..4s log("hello")
}
      `.trim();

      const document = await createTestDocument(source);
      const labels = findBlockLabels(document);

      expect(labels).toHaveLength(0);
    });
  });
});
