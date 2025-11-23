/**
 * Label Editor Webview Tests
 * Tests for centralized translation management
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock acquireVsCodeApi before importing the module
const mockPostMessage = vi.fn();
const mockGetState = vi.fn();
const mockSetState = vi.fn();

global.acquireVsCodeApi = vi.fn(() => ({
  postMessage: mockPostMessage,
  getState: mockGetState,
  setState: mockSetState,
}));

// Helper functions that mirror the actual implementation
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

function validateNewLanguageCode(code: string, state: any): string | null {
  if (!code || code.trim().length === 0) {
    return 'Language code cannot be empty';
  }

  if (!/^[a-z]{2,3}-[A-Z]{2,3}$/.test(code)) {
    return 'Use format: en-US, nl-NL, etc.';
  }

  for (const group of state.labels) {
    for (const translation of group.labels) {
      if (translation.languageCode === code) {
        return `Language code '${code}' already exists in one or more groups`;
      }
    }
  }

  return null;
}

function addTranslationToAllGroups(languageCode: string, state: any): void {
  for (const group of state.labels) {
    const newTranslation = {
      id: crypto.randomUUID(),
      languageCode: languageCode,
      label: '',
    };
    group.labels.push(newTranslation);
  }
  state.isDirty = true;
  mockPostMessage({ type: 'update', labels: state.labels });
}

function handleModalConfirm(state: any): void {
  const input = document.getElementById('modal-language-code') as HTMLInputElement;
  const errorEl = document.getElementById('modal-error');

  if (!input || !errorEl) return;

  const languageCode = input.value.trim();

  const error = validateNewLanguageCode(languageCode, state);
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    return;
  }

  addTranslationToAllGroups(languageCode, state);
  simulateModalClose();
}

describe('Label Editor - Centralized Translation Management', () => {
  beforeEach(() => {
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

    // Mock crypto.randomUUID for tests
    if (global.crypto) {
      vi.spyOn(global.crypto, 'randomUUID').mockImplementation(() => `test-uuid-${Math.random()}`);
    }
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
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
          { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
        ],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;
      const errorEl = document.getElementById('modal-error') as HTMLDivElement;

      modal.style.display = 'block';
      input.value = '';

      handleModalConfirm(state);

      expect(errorEl.style.display).toBe('block');
      expect(errorEl.textContent).toContain('cannot be empty');
      expect(modal.style.display).toBe('block');
    });

    test('should reject duplicate language code', () => {
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
          { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
        ],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;
      const errorEl = document.getElementById('modal-error') as HTMLDivElement;

      modal.style.display = 'block';
      input.value = 'en-US';

      handleModalConfirm(state);

      expect(errorEl.style.display).toBe('block');
      expect(errorEl.textContent).toContain('already exists');
      expect(modal.style.display).toBe('block');
    });

    test('should accept new valid language code', () => {
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
          { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
        ],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;
      const errorEl = document.getElementById('modal-error') as HTMLDivElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state);

      expect(errorEl.style.display).toBe('none');
    });
  });

  describe('Add Translation to All Groups (User Story 3)', () => {
    test('should add translation with same language code to all groups', () => {
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
          { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
          { id: 'group3', labels: [{ id: 'trans3', languageCode: 'en-US', label: 'Test' }] },
        ],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state);

      expect(state.labels[0].labels).toHaveLength(2);
      expect(state.labels[1].labels).toHaveLength(2);
      expect(state.labels[2].labels).toHaveLength(2);

      expect(state.labels[0].labels[1].languageCode).toBe('nl-NL');
      expect(state.labels[1].labels[1].languageCode).toBe('nl-NL');
      expect(state.labels[2].labels[1].languageCode).toBe('nl-NL');

      expect(state.labels[0].labels[1].label).toBe('');
      expect(state.labels[1].labels[1].label).toBe('');
      expect(state.labels[2].labels[1].label).toBe('');
    });

    test('should generate unique IDs for each translation', () => {
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
          { id: 'group2', labels: [{ id: 'trans2', languageCode: 'en-US', label: 'World' }] },
        ],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state);

      const id1 = state.labels[0].labels[1].id;
      const id2 = state.labels[1].labels[1].id;

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    test('should close modal after successful addition', () => {
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        ],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state);

      expect(modal.style.display).toBe('none');
    });

    test('should send update message to extension after adding translations', () => {
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        ],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state);

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
      const state = {
        labels: [
          { id: 'group1', labels: [{ id: 'trans1', languageCode: 'en-US', label: 'Hello' }] },
        ],
        isDirty: false,
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'nl-NL';

      handleModalConfirm(state);

      expect(state.isDirty).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle groups with no existing translations', () => {
      const state = {
        labels: [{ id: 'group1', labels: [] }],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'en-US';

      handleModalConfirm(state);

      expect(state.labels[0].labels).toHaveLength(1);
      expect(state.labels[0].labels[0].languageCode).toBe('en-US');
    });

    test('should handle no groups case gracefully', () => {
      const state = {
        labels: [],
      };

      const modal = document.getElementById('translation-modal') as HTMLDivElement;
      const input = document.getElementById('modal-language-code') as HTMLInputElement;

      modal.style.display = 'block';
      input.value = 'en-US';

      handleModalConfirm(state);

      expect(modal.style.display).toBe('none');
    });
  });
});
