/**
 * Label Editor CRUD Operations Tests (Feature 036, User Story 2)
 *
 * Tests verify CRUD operations by testing the ACTUAL production code
 * exported from label-editor-core.ts:
 * - T027: Add new label group
 * - T028: Delete label group
 * - T029: Edit group ID
 * - T030: Add translation to group
 * - T031: Edit translation content
 * - T032: Delete translation from group
 */

import { describe, expect, it } from 'vitest';
import {
  addLabelGroup,
  addTranslation,
  addTranslationToAllGroups,
  createInitialState,
  deleteGroup,
  deleteTranslation,
  type LabelGroup,
  reorderGroups,
  selectGroup,
  selectGroupByLabelId,
  type Translation,
  updateGroupId,
  updateTranslation,
  validateGroupId,
  validateLabelText,
  validateLanguageCode,
  validateNewLanguageCode,
} from '../../../../media/label-editor-core.js';

describe('Label Editor CRUD Operations (Feature 036, User Story 2)', () => {
  describe('T027: Add new label group', () => {
    it('should add new label group with empty ID', () => {
      const state = createInitialState();
      const newState = addLabelGroup(state);

      expect(newState.labels).toHaveLength(1);
      expect(newState.labels[0].id).toBe('');
    });

    it('should add new label group with empty labels array', () => {
      const state = createInitialState();
      const newState = addLabelGroup(state);

      expect(newState.labels[0].labels).toEqual([]);
    });

    it('should select newly added group', () => {
      const state = createInitialState();
      const newState = addLabelGroup(state);

      expect(newState.selectedGroupIndex).toBe(0);
    });

    it('should mark state as dirty after adding group', () => {
      const state = createInitialState();
      expect(state.isDirty).toBe(false);

      const newState = addLabelGroup(state);
      expect(newState.isDirty).toBe(true);
    });

    it('should append to existing groups', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'first');
      state = addLabelGroup(state);
      state = updateGroupId(state, 1, 'second');

      expect(state.labels).toHaveLength(2);
      expect(state.labels[0].id).toBe('first');
      expect(state.labels[1].id).toBe('second');
      expect(state.selectedGroupIndex).toBe(1);
    });
  });

  describe('T028: Delete label group', () => {
    it('should remove group from labels array', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'to-delete');
      state = addLabelGroup(state);
      state = updateGroupId(state, 1, 'to-keep');
      state = deleteGroup(state, 0);

      expect(state.labels).toHaveLength(1);
      expect(state.labels[0].id).toBe('to-keep');
    });

    it('should clear selection when deleting selected group', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      expect(state.selectedGroupIndex).toBe(0);

      state = deleteGroup(state, 0);
      expect(state.selectedGroupIndex).toBeNull();
    });

    it('should adjust selection index when deleting group before selected', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addLabelGroup(state);
      state = addLabelGroup(state);
      // Select the last group
      state = selectGroup(state, 2);

      // Delete the first group
      state = deleteGroup(state, 0);

      expect(state.selectedGroupIndex).toBe(1);
    });

    it('should mark state as dirty after deleting group', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = { ...state, isDirty: false };
      state = deleteGroup(state, 0);

      expect(state.isDirty).toBe(true);
    });
  });

  describe('T029: Edit group ID', () => {
    it('should update group ID', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'welcome-message');

      expect(state.labels[0].id).toBe('welcome-message');
    });

    it('should mark state as dirty after updating group ID', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = { ...state, isDirty: false };
      state = updateGroupId(state, 0, 'new-id');

      expect(state.isDirty).toBe(true);
    });

    it('should preserve other groups when updating one', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'first');
      state = addLabelGroup(state);
      state = updateGroupId(state, 1, 'second');
      state = updateGroupId(state, 0, 'updated-first');

      expect(state.labels[0].id).toBe('updated-first');
      expect(state.labels[1].id).toBe('second');
    });
  });

  describe('T030: Add translation to group', () => {
    it('should add translation with provided UUID', () => {
      let state = createInitialState();
      state = addLabelGroup(state);

      const translation: Translation = {
        id: 'test-uuid-12345',
        languageCode: 'en-US',
        label: 'Welcome',
      };

      state = addTranslation(state, 0, translation);

      expect(state.labels[0].labels).toHaveLength(1);
      expect(state.labels[0].labels[0].id).toBe('test-uuid-12345');
      expect(state.labels[0].labels[0].languageCode).toBe('en-US');
      expect(state.labels[0].labels[0].label).toBe('Welcome');
    });

    it('should mark state as dirty after adding translation', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = { ...state, isDirty: false };

      const translation: Translation = {
        id: 'uuid',
        languageCode: 'en-US',
        label: 'Test',
      };

      state = addTranslation(state, 0, translation);
      expect(state.isDirty).toBe(true);
    });

    it('should append to existing translations', () => {
      let state = createInitialState();
      state = addLabelGroup(state);

      state = addTranslation(state, 0, { id: 'uuid1', languageCode: 'en-US', label: 'English' });
      state = addTranslation(state, 0, { id: 'uuid2', languageCode: 'nl-NL', label: 'Dutch' });

      expect(state.labels[0].labels).toHaveLength(2);
      expect(state.labels[0].labels[0].languageCode).toBe('en-US');
      expect(state.labels[0].labels[1].languageCode).toBe('nl-NL');
    });
  });

  describe('T031: Edit translation content', () => {
    it('should update translation language code', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addTranslation(state, 0, { id: 'uuid', languageCode: 'en-US', label: 'Test' });
      state = updateTranslation(state, 0, 0, { languageCode: 'nl-NL' });

      expect(state.labels[0].labels[0].languageCode).toBe('nl-NL');
      expect(state.labels[0].labels[0].label).toBe('Test');
    });

    it('should update translation label text', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addTranslation(state, 0, { id: 'uuid', languageCode: 'en-US', label: 'Original' });
      state = updateTranslation(state, 0, 0, { label: 'Updated' });

      expect(state.labels[0].labels[0].label).toBe('Updated');
      expect(state.labels[0].labels[0].languageCode).toBe('en-US');
    });

    it('should preserve UUID when updating translation', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addTranslation(state, 0, {
        id: 'original-uuid',
        languageCode: 'en-US',
        label: 'Test',
      });
      state = updateTranslation(state, 0, 0, { label: 'Updated', languageCode: 'fr-FR' });

      expect(state.labels[0].labels[0].id).toBe('original-uuid');
    });
  });

  describe('T032: Delete translation from group', () => {
    it('should delete translation from group', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addTranslation(state, 0, { id: 'uuid1', languageCode: 'en-US', label: 'Keep' });
      state = addTranslation(state, 0, { id: 'uuid2', languageCode: 'nl-NL', label: 'Delete' });
      state = deleteTranslation(state, 0, 1);

      expect(state.labels[0].labels).toHaveLength(1);
      expect(state.labels[0].labels[0].languageCode).toBe('en-US');
    });

    it('should mark state as dirty after deleting translation', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addTranslation(state, 0, { id: 'uuid', languageCode: 'en-US', label: 'Test' });
      state = { ...state, isDirty: false };
      state = deleteTranslation(state, 0, 0);

      expect(state.isDirty).toBe(true);
    });
  });

  describe('Add Translation to All Groups', () => {
    it('should add translation with same language code to all groups', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'group1');
      state = addLabelGroup(state);
      state = updateGroupId(state, 1, 'group2');
      state = addLabelGroup(state);
      state = updateGroupId(state, 2, 'group3');

      let idCounter = 0;
      state = addTranslationToAllGroups(state, 'nl-NL', () => `uuid-${idCounter++}`);

      expect(state.labels[0].labels).toHaveLength(1);
      expect(state.labels[1].labels).toHaveLength(1);
      expect(state.labels[2].labels).toHaveLength(1);

      expect(state.labels[0].labels[0].languageCode).toBe('nl-NL');
      expect(state.labels[1].labels[0].languageCode).toBe('nl-NL');
      expect(state.labels[2].labels[0].languageCode).toBe('nl-NL');

      expect(state.labels[0].labels[0].label).toBe('');
    });

    it('should generate unique IDs for each translation', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addLabelGroup(state);

      let idCounter = 0;
      state = addTranslationToAllGroups(state, 'nl-NL', () => `uuid-${idCounter++}`);

      const id1 = state.labels[0].labels[0].id;
      const id2 = state.labels[1].labels[0].id;

      expect(id1).toBe('uuid-0');
      expect(id2).toBe('uuid-1');
      expect(id1).not.toBe(id2);
    });

    it('should mark state as dirty', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = { ...state, isDirty: false };

      state = addTranslationToAllGroups(state, 'nl-NL', () => 'uuid');
      expect(state.isDirty).toBe(true);
    });
  });

  describe('Group Selection', () => {
    it('should select group by index', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addLabelGroup(state);
      state = { ...state, selectedGroupIndex: null };

      state = selectGroup(state, 1);
      expect(state.selectedGroupIndex).toBe(1);
    });

    it('should select group by label ID', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'first');
      state = addLabelGroup(state);
      state = updateGroupId(state, 1, 'second');
      state = { ...state, selectedGroupIndex: null };

      state = selectGroupByLabelId(state, 'second');
      expect(state.selectedGroupIndex).toBe(1);
    });

    it('should not change selection for unknown label ID', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'first');
      state = { ...state, selectedGroupIndex: 0 };

      state = selectGroupByLabelId(state, 'unknown');
      expect(state.selectedGroupIndex).toBe(0);
    });
  });

  describe('Drag-reorder groups', () => {
    it('should reorder groups when dragging forward', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'first');
      state = addLabelGroup(state);
      state = updateGroupId(state, 1, 'second');
      state = addLabelGroup(state);
      state = updateGroupId(state, 2, 'third');

      // Drag first to last position
      state = reorderGroups(state, 0, 2);

      expect(state.labels.map(g => g.id)).toEqual(['second', 'third', 'first']);
    });

    it('should reorder groups when dragging backward', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = updateGroupId(state, 0, 'first');
      state = addLabelGroup(state);
      state = updateGroupId(state, 1, 'second');
      state = addLabelGroup(state);
      state = updateGroupId(state, 2, 'third');

      // Drag last to first position
      state = reorderGroups(state, 2, 0);

      expect(state.labels.map(g => g.id)).toEqual(['third', 'first', 'second']);
    });

    it('should update selection when dragging selected group', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addLabelGroup(state);
      state = addLabelGroup(state);
      state = selectGroup(state, 0);

      // Drag first to last position
      state = reorderGroups(state, 0, 2);

      expect(state.selectedGroupIndex).toBe(2);
    });

    it('should mark state as dirty after reordering', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addLabelGroup(state);
      state = { ...state, isDirty: false };
      state = reorderGroups(state, 0, 1);

      expect(state.isDirty).toBe(true);
    });
  });

  describe('Validation Functions', () => {
    describe('validateGroupId', () => {
      it('should reject empty group ID', () => {
        const labels: LabelGroup[] = [{ id: '', labels: [] }];
        expect(validateGroupId('', 0, labels)).toBe('Group ID cannot be empty');
      });

      it('should reject invalid characters', () => {
        const labels: LabelGroup[] = [];
        expect(validateGroupId('invalid id!', 0, labels)).toContain('letters, numbers');
      });

      it('should reject duplicate group ID', () => {
        const labels: LabelGroup[] = [
          { id: 'duplicate', labels: [] },
          { id: 'other', labels: [] },
        ];
        expect(validateGroupId('duplicate', 1, labels)).toContain('already exists');
      });

      it('should accept valid group ID', () => {
        const labels: LabelGroup[] = [{ id: 'other', labels: [] }];
        expect(validateGroupId('valid-id_123', 1, labels)).toBeNull();
      });
    });

    describe('validateLanguageCode', () => {
      it('should reject empty language code', () => {
        expect(validateLanguageCode('')).toContain('cannot be empty');
      });

      it('should reject invalid format', () => {
        expect(validateLanguageCode('invalid')).toContain('en-US');
      });

      it('should accept valid format', () => {
        expect(validateLanguageCode('en-US')).toBeNull();
        expect(validateLanguageCode('nl-NL')).toBeNull();
      });
    });

    describe('validateLabelText', () => {
      it('should reject empty label text', () => {
        expect(validateLabelText('')).toContain('cannot be empty');
      });

      it('should accept non-empty text', () => {
        expect(validateLabelText('Hello')).toBeNull();
      });
    });

    describe('validateNewLanguageCode', () => {
      it('should reject empty language code', () => {
        expect(validateNewLanguageCode('', [])).toContain('cannot be empty');
      });

      it('should reject invalid format', () => {
        expect(validateNewLanguageCode('invalid', [])).toContain('en-US');
      });

      it('should reject duplicate language code across groups', () => {
        const labels: LabelGroup[] = [
          { id: 'group1', labels: [{ id: 'uuid', languageCode: 'en-US', label: 'Hello' }] },
        ];
        expect(validateNewLanguageCode('en-US', labels)).toContain('already exists');
      });

      it('should accept new unique language code', () => {
        const labels: LabelGroup[] = [
          { id: 'group1', labels: [{ id: 'uuid', languageCode: 'en-US', label: 'Hello' }] },
        ];
        expect(validateNewLanguageCode('nl-NL', labels)).toBeNull();
      });
    });
  });

  describe('State immutability', () => {
    it('should not mutate original state when adding group', () => {
      const state = createInitialState();
      const originalLabelsRef = state.labels;
      addLabelGroup(state);

      expect(state.labels).toBe(originalLabelsRef);
      expect(state.labels).toHaveLength(0);
    });

    it('should not mutate original state when deleting group', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      const labelsBeforeDelete = state.labels;

      deleteGroup(state, 0);

      expect(state.labels).toBe(labelsBeforeDelete);
      expect(state.labels).toHaveLength(1);
    });

    it('should not mutate original state when updating translation', () => {
      let state = createInitialState();
      state = addLabelGroup(state);
      state = addTranslation(state, 0, { id: 'uuid', languageCode: 'en-US', label: 'Original' });
      const originalLabel = state.labels[0].labels[0].label;

      updateTranslation(state, 0, 0, { label: 'Updated' });

      expect(state.labels[0].labels[0].label).toBe(originalLabel);
    });
  });
});
