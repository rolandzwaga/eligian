/**
 * Locale Editor Core Module
 *
 * Contains pure, testable functions extracted from the webview script.
 * This module has no DOM dependencies and can be imported directly in tests.
 *
 * Supports both:
 * - New ILocalesConfiguration format with SerializableKeyTreeNode[] (Feature 045)
 * - Legacy LabelGroup[] format for backward compatibility
 */

// ============================================================================
// Type Definitions (Legacy Format)
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

// ============================================================================
// Type Definitions (New Format - Feature 045)
// ============================================================================

/**
 * Serializable version of KeyTreeNode for JSON messages.
 */
export interface SerializableKeyTreeNode {
  name: string;
  fullKey: string;
  isLeaf: boolean;
  children: SerializableKeyTreeNode[];
  translations?: Record<string, string>;
}

/**
 * Validation error for new locale format
 */
export interface LocaleValidationError {
  key?: string;
  locale?: string;
  field: string;
  message: string;
  code: string;
}

/**
 * State for new ILocalesConfiguration format
 */
export interface LocaleEditorState {
  locales: string[];
  keyTree: SerializableKeyTreeNode[];
  selectedKey: string | null;
  filePath: string;
  isDirty: boolean;
  expandedKeys: Set<string>;
  isNewFormat: boolean;
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

// ============================================================================
// New Format: State Factory (Feature 045)
// ============================================================================

/**
 * Create initial state for new locale editor format
 */
export function createInitialLocaleState(): LocaleEditorState {
  return {
    locales: [],
    keyTree: [],
    selectedKey: null,
    filePath: '',
    isDirty: false,
    expandedKeys: new Set(),
    isNewFormat: true,
  };
}

/**
 * Initialize locale state from extension message
 */
export function initializeLocaleState(
  locales: string[],
  keyTree: SerializableKeyTreeNode[],
  filePath: string,
  selectedKey?: string
): LocaleEditorState {
  const state = createInitialLocaleState();
  state.locales = locales;
  state.keyTree = keyTree;
  state.filePath = filePath;
  state.selectedKey = selectedKey || null;

  // Auto-expand parent keys if selectedKey is set
  if (selectedKey) {
    const parts = selectedKey.split('.');
    for (let i = 1; i < parts.length; i++) {
      state.expandedKeys.add(parts.slice(0, i).join('.'));
    }
  }

  return state;
}

// ============================================================================
// New Format: Validation Functions (Feature 045)
// ============================================================================

/**
 * Validate translation key segment
 * @returns Error message or null if valid
 */
export function validateKeySegment(segment: string): string | null {
  if (!segment || segment.trim().length === 0) {
    return 'Key segment cannot be empty';
  }

  // Alphanumeric, underscores, hyphens only
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
    return 'Key segment can only contain letters, numbers, underscores, and hyphens';
  }

  return null;
}

/**
 * Validate locale code format (xx-XX)
 * @returns Error message or null if valid
 */
export function validateLocaleCode(locale: string): string | null {
  if (!locale || locale.trim().length === 0) {
    return 'Locale code cannot be empty';
  }

  // xx-XX pattern (e.g., en-US, nl-NL)
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
    return 'Locale must be in format xx-XX (e.g., en-US, nl-NL)';
  }

  return null;
}

/**
 * Check if a locale already exists in the state
 */
export function localeExists(state: LocaleEditorState, locale: string): boolean {
  return state.locales.includes(locale);
}

/**
 * Check if a key already exists in the tree
 */
export function keyExists(tree: SerializableKeyTreeNode[], fullKey: string): boolean {
  for (const node of tree) {
    if (node.fullKey === fullKey) return true;
    if (node.children.length > 0 && keyExists(node.children, fullKey)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// New Format: Tree Manipulation Functions (Feature 045)
// ============================================================================

/**
 * Find a node by key in the tree
 */
export function findNodeByKey(
  tree: SerializableKeyTreeNode[],
  key: string
): SerializableKeyTreeNode | undefined {
  for (const node of tree) {
    if (node.fullKey === key) return node;
    if (node.children.length > 0) {
      const found = findNodeByKey(node.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Update a translation value in the tree
 */
export function updateTranslationValue(
  state: LocaleEditorState,
  key: string,
  locale: string,
  value: string
): LocaleEditorState {
  const node = findNodeByKey(state.keyTree, key);
  if (node?.translations) {
    node.translations[locale] = value;
  }
  return {
    ...state,
    isDirty: true,
  };
}

/**
 * Add a new key to the tree
 */
export function addKeyToTree(
  state: LocaleEditorState,
  parentKey: string | null,
  newSegment: string
): LocaleEditorState {
  const fullKey = parentKey ? `${parentKey}.${newSegment}` : newSegment;

  // Create new node
  const newNode: SerializableKeyTreeNode = {
    name: newSegment,
    fullKey,
    isLeaf: true,
    children: [],
    translations: Object.fromEntries(state.locales.map(l => [l, ''])),
  };

  if (!parentKey) {
    // Add to root
    return {
      ...state,
      keyTree: [...state.keyTree, newNode],
      isDirty: true,
    };
  }

  // Find parent and add child
  const parent = findNodeByKey(state.keyTree, parentKey);
  if (parent) {
    parent.isLeaf = false;
    parent.children.push(newNode);
  }

  return {
    ...state,
    isDirty: true,
  };
}

/**
 * Remove a key from the tree
 */
export function removeKeyFromTree(
  tree: SerializableKeyTreeNode[],
  key: string
): SerializableKeyTreeNode[] {
  return tree
    .filter(node => node.fullKey !== key)
    .map(node => ({
      ...node,
      children: node.children.length > 0 ? removeKeyFromTree(node.children, key) : [],
    }))
    .filter(node => node.isLeaf || node.children.length > 0);
}

/**
 * Add a new locale to the state and all translations
 */
export function addLocaleToState(state: LocaleEditorState, locale: string): LocaleEditorState {
  // Add to locales list
  const newLocales = [...state.locales, locale];

  // Add empty translation to all leaf nodes
  const addLocaleToTree = (nodes: SerializableKeyTreeNode[]): SerializableKeyTreeNode[] => {
    return nodes.map(node => ({
      ...node,
      translations: node.isLeaf ? { ...node.translations, [locale]: '' } : node.translations,
      children: node.children.length > 0 ? addLocaleToTree(node.children) : [],
    }));
  };

  return {
    ...state,
    locales: newLocales,
    keyTree: addLocaleToTree(state.keyTree),
    isDirty: true,
  };
}

/**
 * Select a key in the state
 */
export function selectKey(state: LocaleEditorState, key: string | null): LocaleEditorState {
  const newState = {
    ...state,
    selectedKey: key,
  };

  // Expand parent keys
  if (key) {
    const parts = key.split('.');
    for (let i = 1; i < parts.length; i++) {
      newState.expandedKeys.add(parts.slice(0, i).join('.'));
    }
  }

  return newState;
}

/**
 * Toggle expanded state of a key
 */
export function toggleExpanded(state: LocaleEditorState, key: string): LocaleEditorState {
  const newExpanded = new Set(state.expandedKeys);
  if (newExpanded.has(key)) {
    newExpanded.delete(key);
  } else {
    newExpanded.add(key);
  }
  return {
    ...state,
    expandedKeys: newExpanded,
  };
}

/**
 * Mark locale state as dirty
 */
export function markLocaleDirty(state: LocaleEditorState): LocaleEditorState {
  return {
    ...state,
    isDirty: true,
  };
}

/**
 * Mark locale save as complete
 */
export function markLocaleSaveComplete(state: LocaleEditorState): LocaleEditorState {
  return {
    ...state,
    isDirty: false,
  };
}
