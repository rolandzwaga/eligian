/**
 * Label Editor Core Module
 *
 * Contains pure, testable functions extracted from the webview script.
 * This module has no DOM dependencies and can be imported directly in tests.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface LabelGroup {
  id: string;
  labels: Translation[];
}

export interface Translation {
  id: string;
  languageCode: string;
  label: string;
}

export interface ValidationError {
  groupId?: string;
  translationId?: string;
  field: string;
  message: string;
  code: string;
}

export interface EditorState {
  labels: LabelGroup[];
  selectedGroupIndex: number | null;
  validationErrors: Map<string, ValidationError[]>;
  isDirty: boolean;
  filePath: string;
  focusedElement: {
    groupIndex?: number;
    translationIndex?: number;
    field?: 'groupId' | 'languageCode' | 'labelText';
    cursorPosition?: number;
  } | null;
}

// ============================================================================
// State Factory
// ============================================================================

export function createInitialState(): EditorState {
  return {
    labels: [],
    selectedGroupIndex: null,
    validationErrors: new Map(),
    isDirty: false,
    filePath: '',
    focusedElement: null,
  };
}

// ============================================================================
// Validation Functions (Pure)
// ============================================================================

/**
 * Validate group ID
 * @returns Error message or null if valid
 */
export function validateGroupId(
  groupId: string,
  currentIndex: number,
  allLabels: LabelGroup[]
): string | null {
  // Check for empty
  if (!groupId || groupId.trim().length === 0) {
    return 'Group ID cannot be empty';
  }

  // Check for invalid characters
  if (!/^[a-zA-Z0-9._-]+$/.test(groupId)) {
    return 'Group ID can only contain letters, numbers, dots, hyphens, and underscores';
  }

  // Check for duplicates
  for (let i = 0; i < allLabels.length; i++) {
    if (i !== currentIndex && allLabels[i].id === groupId) {
      return `Group ID '${groupId}' already exists`;
    }
  }

  return null;
}

/**
 * Validate language code format (xx-XX pattern)
 * @returns Error message or null if valid
 */
export function validateLanguageCode(code: string): string | null {
  if (!code || code.trim().length === 0) {
    return 'Language code cannot be empty';
  }

  // xx-XX pattern (e.g., en-US, nl-NL)
  if (!/^[a-z]{2,3}-[A-Z]{2,3}$/.test(code)) {
    return 'Use format: en-US, nl-NL, etc.';
  }

  return null;
}

/**
 * Validate label text
 * @returns Error message or null if valid
 */
export function validateLabelText(text: string): string | null {
  if (!text || text.trim().length === 0) {
    return 'Label text cannot be empty';
  }

  return null;
}

/**
 * Validate new language code for "add to all groups" modal
 * Checks format and duplicates across all groups
 * @returns Error message or null if valid
 */
export function validateNewLanguageCode(code: string, allLabels: LabelGroup[]): string | null {
  // Check for empty
  if (!code || code.trim().length === 0) {
    return 'Language code cannot be empty';
  }

  // Check format (xx-XX pattern)
  if (!/^[a-z]{2,3}-[A-Z]{2,3}$/.test(code)) {
    return 'Use format: en-US, nl-NL, etc.';
  }

  // Check for duplicates across all groups
  for (const group of allLabels) {
    for (const translation of group.labels) {
      if (translation.languageCode === code) {
        return `Language code '${code}' already exists in one or more groups`;
      }
    }
  }

  return null;
}

// ============================================================================
// State Mutation Functions (Pure - return new state)
// ============================================================================

/**
 * Add a new empty label group
 */
export function addLabelGroup(state: EditorState): EditorState {
  const newGroup: LabelGroup = {
    id: '',
    labels: [],
  };

  const newLabels = [...state.labels, newGroup];

  return {
    ...state,
    labels: newLabels,
    selectedGroupIndex: newLabels.length - 1,
    isDirty: true,
  };
}

/**
 * Delete a label group by index
 */
export function deleteGroup(state: EditorState, index: number): EditorState {
  const newLabels = [...state.labels];
  newLabels.splice(index, 1);

  let newSelectedIndex = state.selectedGroupIndex;
  if (state.selectedGroupIndex === index) {
    newSelectedIndex = null;
  } else if (state.selectedGroupIndex !== null && state.selectedGroupIndex > index) {
    newSelectedIndex = state.selectedGroupIndex - 1;
  }

  return {
    ...state,
    labels: newLabels,
    selectedGroupIndex: newSelectedIndex,
    isDirty: true,
  };
}

/**
 * Update a group's ID
 */
export function updateGroupId(state: EditorState, index: number, newId: string): EditorState {
  const newLabels = [...state.labels];
  newLabels[index] = { ...newLabels[index], id: newId };

  return {
    ...state,
    labels: newLabels,
    isDirty: true,
  };
}

/**
 * Select a group by index
 */
export function selectGroup(state: EditorState, index: number): EditorState {
  return {
    ...state,
    selectedGroupIndex: index,
  };
}

/**
 * Select a group by label ID
 * @returns New state with selectedGroupIndex set, or unchanged if not found
 */
export function selectGroupByLabelId(state: EditorState, labelId: string): EditorState {
  const index = state.labels.findIndex(g => g.id === labelId);
  if (index >= 0) {
    return {
      ...state,
      selectedGroupIndex: index,
    };
  }
  return state;
}

/**
 * Add a translation to a specific group
 */
export function addTranslation(
  state: EditorState,
  groupIndex: number,
  translation: Translation
): EditorState {
  const newLabels = [...state.labels];
  const group = { ...newLabels[groupIndex] };
  group.labels = [...group.labels, translation];
  newLabels[groupIndex] = group;

  return {
    ...state,
    labels: newLabels,
    isDirty: true,
  };
}

/**
 * Update a translation's properties
 */
export function updateTranslation(
  state: EditorState,
  groupIndex: number,
  translationIndex: number,
  updates: Partial<Translation>
): EditorState {
  const newLabels = [...state.labels];
  const group = { ...newLabels[groupIndex] };
  const translations = [...group.labels];
  translations[translationIndex] = { ...translations[translationIndex], ...updates };
  group.labels = translations;
  newLabels[groupIndex] = group;

  return {
    ...state,
    labels: newLabels,
    isDirty: true,
  };
}

/**
 * Delete a translation from a group
 */
export function deleteTranslation(
  state: EditorState,
  groupIndex: number,
  translationIndex: number
): EditorState {
  const newLabels = [...state.labels];
  const group = { ...newLabels[groupIndex] };
  const translations = [...group.labels];
  translations.splice(translationIndex, 1);
  group.labels = translations;
  newLabels[groupIndex] = group;

  return {
    ...state,
    labels: newLabels,
    isDirty: true,
  };
}

/**
 * Add a translation with the same language code to all groups
 * @param generateId Function to generate unique IDs (e.g., crypto.randomUUID)
 */
export function addTranslationToAllGroups(
  state: EditorState,
  languageCode: string,
  generateId: () => string
): EditorState {
  const newLabels = state.labels.map(group => ({
    ...group,
    labels: [
      ...group.labels,
      {
        id: generateId(),
        languageCode,
        label: '',
      },
    ],
  }));

  return {
    ...state,
    labels: newLabels,
    isDirty: true,
  };
}

/**
 * Reorder groups via drag and drop
 */
export function reorderGroups(state: EditorState, fromIndex: number, toIndex: number): EditorState {
  const newLabels = [...state.labels];
  const [removed] = newLabels.splice(fromIndex, 1);
  newLabels.splice(toIndex, 0, removed);

  let newSelectedIndex = state.selectedGroupIndex;
  if (state.selectedGroupIndex === fromIndex) {
    newSelectedIndex = toIndex;
  } else if (state.selectedGroupIndex !== null) {
    if (fromIndex < state.selectedGroupIndex && toIndex >= state.selectedGroupIndex) {
      newSelectedIndex = state.selectedGroupIndex - 1;
    } else if (fromIndex > state.selectedGroupIndex && toIndex <= state.selectedGroupIndex) {
      newSelectedIndex = state.selectedGroupIndex + 1;
    }
  }

  return {
    ...state,
    labels: newLabels,
    selectedGroupIndex: newSelectedIndex,
    isDirty: true,
  };
}

/**
 * Initialize state from extension message
 */
export function initializeState(labels: LabelGroup[], filePath: string): EditorState {
  return {
    labels,
    selectedGroupIndex: null,
    validationErrors: new Map(),
    isDirty: false,
    filePath,
    focusedElement: null,
  };
}

/**
 * Mark state as dirty
 */
export function markDirty(state: EditorState): EditorState {
  return {
    ...state,
    isDirty: true,
  };
}

/**
 * Mark save as complete
 */
export function markSaveComplete(state: EditorState): EditorState {
  return {
    ...state,
    isDirty: false,
  };
}

/**
 * Check if there are any validation errors in the state
 */
export function hasValidationErrors(state: EditorState): boolean {
  // Check client-side validation errors in state
  if (state.validationErrors.size > 0) {
    return true;
  }

  // Check for structural errors
  for (let i = 0; i < state.labels.length; i++) {
    const group = state.labels[i];

    // Check group ID
    if (validateGroupId(group.id, i, state.labels) !== null) {
      return true;
    }

    // Check group has at least one translation
    if (!group.labels || group.labels.length === 0) {
      return true;
    }

    // Check each translation
    for (const translation of group.labels) {
      if (validateLanguageCode(translation.languageCode) !== null) {
        return true;
      }
      if (validateLabelText(translation.label) !== null) {
        return true;
      }
    }
  }

  return false;
}
