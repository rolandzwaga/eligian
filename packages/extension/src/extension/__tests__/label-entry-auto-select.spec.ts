/**
 * Feature 041 - Missing Label Entry Quick Fix
 * Tests for label editor auto-open and selection feature
 *
 * This tests the pending selection mechanism that allows the label entry creator
 * to communicate with the LabelEditorProvider which label should be selected
 * after the editor opens.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
// Import the actual exported function to test the real implementation
import { consumePendingSelection } from '../label-entry-creator.js';

// We need to test the pending selection store directly
// Since we can't easily mock vscode commands, we'll test the store mechanism

/**
 * Pending selection store (mirrors label-entry-creator.ts implementation)
 * This is extracted for testing without VS Code dependencies
 */
class PendingSelectionStore {
  private pendingSelections = new Map<string, string>();

  /**
   * Set a pending selection for a file URI
   */
  setPendingSelection(fileUri: string, labelId: string): void {
    this.pendingSelections.set(fileUri, labelId);
  }

  /**
   * Get and clear the pending selection for a file URI
   * Called by LabelEditorProvider when resolving a custom editor
   */
  consumePendingSelection(fileUri: string): string | undefined {
    const labelId = this.pendingSelections.get(fileUri);
    if (labelId) {
      this.pendingSelections.delete(fileUri);
    }
    return labelId;
  }

  /**
   * Check if a pending selection exists (for testing)
   */
  hasPendingSelection(fileUri: string): boolean {
    return this.pendingSelections.has(fileUri);
  }

  /**
   * Clear all pending selections (for test isolation)
   */
  clear(): void {
    this.pendingSelections.clear();
  }
}

describe('Label Editor Auto-Select Feature (Feature 041)', () => {
  let store: PendingSelectionStore;

  beforeEach(() => {
    store = new PendingSelectionStore();
  });

  afterEach(() => {
    store.clear();
  });

  describe('Pending Selection Store', () => {
    test('should store pending selection for a file URI', () => {
      const fileUri = 'file:///test/labels.json';
      const labelId = 'welcome-message';

      store.setPendingSelection(fileUri, labelId);

      expect(store.hasPendingSelection(fileUri)).toBe(true);
    });

    test('should return undefined for file URI with no pending selection', () => {
      const fileUri = 'file:///test/labels.json';

      const result = store.consumePendingSelection(fileUri);

      expect(result).toBeUndefined();
    });

    test('should return and clear pending selection when consumed', () => {
      const fileUri = 'file:///test/labels.json';
      const labelId = 'welcome-message';

      store.setPendingSelection(fileUri, labelId);
      const result = store.consumePendingSelection(fileUri);

      expect(result).toBe(labelId);
      expect(store.hasPendingSelection(fileUri)).toBe(false);
    });

    test('should return undefined on second consume (one-time use)', () => {
      const fileUri = 'file:///test/labels.json';
      const labelId = 'welcome-message';

      store.setPendingSelection(fileUri, labelId);

      // First consume returns the label ID
      expect(store.consumePendingSelection(fileUri)).toBe(labelId);

      // Second consume returns undefined (already consumed)
      expect(store.consumePendingSelection(fileUri)).toBeUndefined();
    });

    test('should handle multiple file URIs independently', () => {
      const fileUri1 = 'file:///test/labels1.json';
      const fileUri2 = 'file:///test/labels2.json';
      const labelId1 = 'label-one';
      const labelId2 = 'label-two';

      store.setPendingSelection(fileUri1, labelId1);
      store.setPendingSelection(fileUri2, labelId2);

      // Consume first - should not affect second
      expect(store.consumePendingSelection(fileUri1)).toBe(labelId1);
      expect(store.hasPendingSelection(fileUri1)).toBe(false);
      expect(store.hasPendingSelection(fileUri2)).toBe(true);

      // Consume second
      expect(store.consumePendingSelection(fileUri2)).toBe(labelId2);
    });

    test('should allow overwriting pending selection for same file URI', () => {
      const fileUri = 'file:///test/labels.json';
      const labelId1 = 'first-label';
      const labelId2 = 'second-label';

      store.setPendingSelection(fileUri, labelId1);
      store.setPendingSelection(fileUri, labelId2);

      // Should return the latest selection
      expect(store.consumePendingSelection(fileUri)).toBe(labelId2);
    });

    test('should handle label IDs with special characters', () => {
      const fileUri = 'file:///test/labels.json';
      const labelId = 'welcome-message_v2';

      store.setPendingSelection(fileUri, labelId);

      expect(store.consumePendingSelection(fileUri)).toBe(labelId);
    });

    test('should handle file URIs with special characters', () => {
      const fileUri = 'file:///test/path%20with%20spaces/labels.json';
      const labelId = 'my-label';

      store.setPendingSelection(fileUri, labelId);

      expect(store.consumePendingSelection(fileUri)).toBe(labelId);
    });

    test('should handle Windows-style file URIs', () => {
      const fileUri = 'file:///C:/Users/test/labels.json';
      const labelId = 'windows-label';

      store.setPendingSelection(fileUri, labelId);

      expect(store.consumePendingSelection(fileUri)).toBe(labelId);
    });
  });

  describe('Integration Scenarios', () => {
    test('should simulate quick fix workflow: create label → open editor → select label', () => {
      // Simulate workflow:
      // 1. Quick fix creates label entry
      // 2. Quick fix sets pending selection
      // 3. Quick fix opens label editor (mocked)
      // 4. Editor provider consumes pending selection
      // 5. Editor initializes with selected label

      const fileUri = 'file:///project/labels.json';
      const newLabelId = 'new-label-from-quickfix';

      // Step 1-2: Quick fix creates label and sets pending selection
      store.setPendingSelection(fileUri, newLabelId);

      // Step 3: VS Code opens the editor (mocked - we just verify state)
      expect(store.hasPendingSelection(fileUri)).toBe(true);

      // Step 4: Editor provider consumes pending selection
      const selectedLabelId = store.consumePendingSelection(fileUri);

      // Step 5: Verify editor would receive correct label ID
      expect(selectedLabelId).toBe(newLabelId);

      // After consumption, selection should be cleared
      expect(store.hasPendingSelection(fileUri)).toBe(false);
    });

    test('should handle case when editor was already open (no pending selection)', () => {
      // If user opens editor without using quick fix, there should be no selection
      const fileUri = 'file:///project/labels.json';

      const selectedLabelId = store.consumePendingSelection(fileUri);

      expect(selectedLabelId).toBeUndefined();
    });

    test('should handle rapid consecutive quick fix invocations', () => {
      // If user somehow triggers quick fix twice before editor opens
      const fileUri = 'file:///project/labels.json';
      const labelId1 = 'first-quick-label';
      const labelId2 = 'second-quick-label';

      store.setPendingSelection(fileUri, labelId1);
      store.setPendingSelection(fileUri, labelId2);

      // Editor should select the most recent label
      expect(store.consumePendingSelection(fileUri)).toBe(labelId2);
    });
  });
});

describe('selectLabelById Function Logic (Feature 041)', () => {
  /**
   * Test the logic of finding a label by ID in an array
   * This mirrors the selectLabelById function in label-editor.ts
   */
  interface LabelGroup {
    id: string;
    labels: Array<{ id: string; languageCode: string; label: string }>;
  }

  function findLabelIndex(labels: LabelGroup[], labelId: string): number {
    return labels.findIndex(g => g.id === labelId);
  }

  test('should find label at beginning of array', () => {
    const labels: LabelGroup[] = [
      { id: 'first-label', labels: [] },
      { id: 'second-label', labels: [] },
      { id: 'third-label', labels: [] },
    ];

    expect(findLabelIndex(labels, 'first-label')).toBe(0);
  });

  test('should find label in middle of array', () => {
    const labels: LabelGroup[] = [
      { id: 'first-label', labels: [] },
      { id: 'target-label', labels: [] },
      { id: 'third-label', labels: [] },
    ];

    expect(findLabelIndex(labels, 'target-label')).toBe(1);
  });

  test('should find label at end of array', () => {
    const labels: LabelGroup[] = [
      { id: 'first-label', labels: [] },
      { id: 'second-label', labels: [] },
      { id: 'last-label', labels: [] },
    ];

    expect(findLabelIndex(labels, 'last-label')).toBe(2);
  });

  test('should return -1 for non-existent label', () => {
    const labels: LabelGroup[] = [
      { id: 'first-label', labels: [] },
      { id: 'second-label', labels: [] },
    ];

    expect(findLabelIndex(labels, 'non-existent')).toBe(-1);
  });

  test('should handle empty labels array', () => {
    const labels: LabelGroup[] = [];

    expect(findLabelIndex(labels, 'any-label')).toBe(-1);
  });

  test('should find label with special characters in ID', () => {
    const labels: LabelGroup[] = [
      { id: 'welcome-message_v2', labels: [] },
      { id: 'button.text', labels: [] },
    ];

    expect(findLabelIndex(labels, 'welcome-message_v2')).toBe(0);
    expect(findLabelIndex(labels, 'button.text')).toBe(1);
  });

  test('should be case-sensitive when finding labels', () => {
    const labels: LabelGroup[] = [
      { id: 'MyLabel', labels: [] },
      { id: 'mylabel', labels: [] },
    ];

    expect(findLabelIndex(labels, 'MyLabel')).toBe(0);
    expect(findLabelIndex(labels, 'mylabel')).toBe(1);
    expect(findLabelIndex(labels, 'MYLABEL')).toBe(-1);
  });
});

describe('Real consumePendingSelection Function (Feature 041)', () => {
  /**
   * Tests for the actual exported consumePendingSelection function
   * from label-entry-creator.ts
   *
   * Note: The pendingSelections Map is module-level state, so these tests
   * verify the actual implementation behavior. Since we can't directly
   * set pending selections without the vscode-dependent setPendingSelection
   * function, we test the "no selection" path and document expected behavior.
   */

  test('should return undefined when no pending selection exists', () => {
    // The real function should return undefined for unknown file URIs
    const result = consumePendingSelection('file:///nonexistent/path.json');
    expect(result).toBeUndefined();
  });

  test('should return undefined for empty string file URI', () => {
    const result = consumePendingSelection('');
    expect(result).toBeUndefined();
  });

  test('should handle various URI formats without crashing', () => {
    // These should all return undefined (no pending selection) without throwing
    expect(() => consumePendingSelection('file:///test.json')).not.toThrow();
    expect(() => consumePendingSelection('file:///C:/test.json')).not.toThrow();
    expect(() => consumePendingSelection('file:///path/with spaces/test.json')).not.toThrow();
    expect(() => consumePendingSelection('invalid-uri')).not.toThrow();
  });
});

describe('ToWebviewMessage Type Validation (Feature 041)', () => {
  /**
   * Type-level tests to ensure message types are correctly defined
   * These tests verify the shape of messages sent to the webview
   */

  interface InitializeMessage {
    type: 'initialize';
    labels: Array<{ id: string }>;
    filePath: string;
    selectedLabelId?: string;
  }

  interface SelectLabelMessage {
    type: 'select-label';
    labelId: string;
  }

  test('initialize message should support optional selectedLabelId', () => {
    const msgWithSelection: InitializeMessage = {
      type: 'initialize',
      labels: [{ id: 'test' }],
      filePath: '/test/labels.json',
      selectedLabelId: 'test',
    };

    const msgWithoutSelection: InitializeMessage = {
      type: 'initialize',
      labels: [{ id: 'test' }],
      filePath: '/test/labels.json',
    };

    expect(msgWithSelection.selectedLabelId).toBe('test');
    expect(msgWithoutSelection.selectedLabelId).toBeUndefined();
  });

  test('select-label message should require labelId', () => {
    const msg: SelectLabelMessage = {
      type: 'select-label',
      labelId: 'target-label',
    };

    expect(msg.type).toBe('select-label');
    expect(msg.labelId).toBe('target-label');
  });
});
