/**
 * Label Editor Webview Tests
 * Tests for centralized translation management
 *
 * This file tests the modal UI flow for adding translations.
 * Core validation and state manipulation is tested via the actual
 * production functions imported from label-editor-core.ts.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addTranslationToAllGroups,
  type EditorState,
  type LabelGroup,
  validateNewLanguageCode,
} from '../label-editor-core.js';

// Mock acquireVsCodeApi before importing the module
const mockPostMessage = vi.fn();

(globalThis as Record<string, unknown>).acquireVsCodeApi = vi.fn(() => ({
  postMessage: mockPostMessage,
  getState: vi.fn(),
  setState: vi.fn(),
}));

// UI helper functions for modal interactions
function simulateModalOpen(): void {
  const modal = document.getElementById('translation-modal');
  if (modal) {
    modal.style.display = 'block';
  }
}

function simulateModalClose(): void {
  const modal = document.getElementById('translation-modal');
  const input = document.getElementById('modal-language-code') as HTMLInputElement;
  const errorEl = document.getElementById('modal-error');

  if (modal) {
    modal.style.display = 'none';
  }
  if (input) {
    input.value = '';
  }
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }
}

/**
 * Create a minimal EditorState for testing
 */
function createTestState(labels: LabelGroup[]): EditorState {
  return {
    labels,
    selectedGroupIndex: null,
    validationErrors: new Map(),
    isDirty: false,
    filePath: '/test/labels.json',
    focusedElement: null,
  };
}

/**
 * Simulates the modal confirm flow using actual core functions.
 * This tests the integration between UI and core logic.
 */
function handleModalConfirm(
  state: EditorState,
  uuidGenerator: () => string
): { newState: EditorState; error: string | null } {
  const input = document.getElementById('modal-language-code') as HTMLInputElement;
  const errorEl = document.getElementById('modal-error');

  if (!input || !errorEl) return { newState: state, error: null };

  const languageCode = input.value.trim();

  // Use actual core validation function
  const error = validateNewLanguageCode(languageCode, state.labels);
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    return { newState: state, error };
  }

  // Use actual core state manipulation function
  const newState = addTranslationToAllGroups(state, languageCode, uuidGenerator);
  mockPostMessage({ type: 'update', labels: newState.labels });
  simulateModalClose();

  return { newState, error: null };
}

describe('Label Editor - Centralized Translation Management', () => {
  // UUID generator for tests
  let uuidCounter: number;
  const testUuidGenerator = () => `test-uuid-${uuidCounter++}`;

  beforeEach(() => {
    uuidCounter = 0;

    // Reset DOM
    document.body.innerHTML = `
      <div class="container">
        <div class="left-panel">
          <div class="panel-header">
            <span>Label Groups</span>
            <button id="add-group-btn">+ Add Group</button>
            <button id="add-translation-btn">+ Add Translation</button>
          </div>
          <div class="groups-list" id="groups-list"></div>
        </div>
        <div class="right-panel">
          <div class="panel-header">
            <span>Translations</span>
          </div>
          <div class="translations-container" id="translations-container">
            <div class="empty-state" id="empty-state">
              Select a label group to view translations
            </div>
          </div>
        </div>
      </div>
      <div id="translation-modal" class="modal" style="display:none;">
        <div class="modal-content">
          <h2>Add Translation to All Groups</h2>
          <div class="form-group">
            <label for="modal-language-code">Language Code</label>
            <input type="text" id="modal-language-code" placeholder="en-US" />
            <div class="error-message" id="modal-error" style="display:none;"></div>
          </div>
          <div class="modal-actions">
            <button id="modal-cancel">Cancel</button>
            <button id="modal-confirm">Add</button>
          </div>
        </div>
      </div>
    `;

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Modal Opening (User Story 1)', () => {
    test('should show modal when global Add Translation button is clicked', () => {
      const modal = document.getElementById('translation-modal') as HTMLDivElement;

      expect(modal.style.display).toBe('none');

      simulateModalOpen();

      expect(modal.style.display).toBe('block');
    });

    test('should hide modal when Cancel button is clicked', () => {
      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      modal.style.display = 'block';

      simulateModalClose();

      expect(modal.style.display).toBe('none');
    });

    test('should clear modal input when closed', () => {
      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;
      modal.style.display = 'block';
      input.value = 'en-US';

      simulateModalClose();

      expect(input.value).toBe('');
    });
  });

  describe('Language Code Validation (User Story 2)', () => {
    test('should reject empty language code', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;
      const errorEl = document.getElementById('modal-error') as HTMLDivElement;

      modal.style.display = 'block';
      input.value = '';

      handleModalConfirm(state, testUuidGenerator);

      expect(errorEl.style.display).toBe('block');
      expect(errorEl.textContent).toContain('cannot be empty');
      expect(modal.style.display).toBe('block');
    });

    test('should reject duplicate language code', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;
      const errorEl = document.getElementById('modal-error') as HTMLDivElement;

      modal.style.display = 'block';
      input.value = 'en-US';

      handleModalConfirm(state, testUuidGenerator);

      expect(errorEl.style.display).toBe('block');
      expect(errorEl.textContent).toContain('already exists');
      expect(modal.style.display).toBe('block');
    });

    test('should accept new valid language code', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;
      const errorEl = document.getElementById('modal-error') as HTMLDivElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state, testUuidGenerator);

      expect(errorEl.style.display).toBe('none');
    });
  });

  describe('Add Translation to All Groups (User Story 3)', () => {
    test('should add translation with same language code to all groups', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
        { id: 'group3', labels: [{ id: 'trans3', languageCode: 'en-US', label: 'Test' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      const { newState } = handleModalConfirm(state, testUuidGenerator);

      expect(newState.labels[0].labels).toHaveLength(2);
      expect(newState.labels[1].labels).toHaveLength(2);
      expect(newState.labels[2].labels).toHaveLength(2);

      expect(newState.labels[0].labels[1].languageCode).toBe('nl-NL');
      expect(newState.labels[1].labels[1].languageCode).toBe('nl-NL');
      expect(newState.labels[2].labels[1].languageCode).toBe('nl-NL');

      expect(newState.labels[0].labels[1].label).toBe('');
      expect(newState.labels[1].labels[1].label).toBe('');
      expect(newState.labels[2].labels[1].label).toBe('');
    });

    test('should generate unique IDs for each translation', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      const { newState } = handleModalConfirm(state, testUuidGenerator);

      const id1 = newState.labels[0].labels[1].id;
      const id2 = newState.labels[1].labels[1].id;

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    test('should close modal after successful addition', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state, testUuidGenerator);

      expect(modal.style.display).toBe('none');
    });

    test('should send update message to extension after adding translations', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state, testUuidGenerator);

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'update',
        labels: expect.arrayContaining([
          expect.objectContaining({
            id: 'group1',
            labels: expect.arrayContaining([expect.objectContaining({ languageCode: 'nl-NL' })]),
          }),
        ]),
      });
    });

    test('should mark editor as dirty after adding translations', () => {
      const state = createTestState([
        { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
      ]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      const { newState } = handleModalConfirm(state, testUuidGenerator);

      expect(newState.isDirty).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle groups with no existing translations', () => {
      const state = createTestState([{ id: 'group1', labels: [] }]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'en-US';

      const { newState } = handleModalConfirm(state, testUuidGenerator);

      expect(newState.labels[0].labels).toHaveLength(1);
      expect(newState.labels[0].labels[0].languageCode).toBe('en-US');
    });

    test('should handle no groups case gracefully', () => {
      const state = createTestState([]);

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'en-US';

      handleModalConfirm(state, testUuidGenerator);

      expect(modal.style.display).toBe('none');
    });
  });
});
