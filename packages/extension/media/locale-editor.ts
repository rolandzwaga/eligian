/**
 * Locale Editor Webview Script
 * Runs in browser context, manages UI state and user interactions
 *
 * Supports both:
 * - New ILocalesConfiguration format with KeyTreeNode[] (tree view)
 * - Legacy LabelGroup[] format (flat list view) for backward compatibility
 */

// Import types and pure functions from core module
import {
  validateGroupId as coreValidateGroupId,
  validateLabelText as coreValidateLabelText,
  validateLanguageCode as coreValidateLanguageCode,
  validateNewLanguageCode as coreValidateNewLanguageCode,
  type EditorState,
  type LabelGroup,
  type Translation,
  type ValidationError,
} from './locale-editor-core.js';

// Re-export types for this module's use
export type { EditorState, LabelGroup, Translation, ValidationError };

// =============================================================================
// New ILocalesConfiguration Types (Feature 045)
// =============================================================================

/**
 * Serializable version of KeyTreeNode for JSON messages.
 * Uses Record instead of Map for JSON compatibility.
 */
interface SerializableKeyTreeNode {
  name: string;
  fullKey: string;
  isLeaf: boolean;
  children: SerializableKeyTreeNode[];
  translations?: Record<string, string>;
}

/**
 * Messages from Extension to Webview (new format)
 */
type LocaleToWebviewMessage =
  | {
      type: 'initialize';
      locales: string[];
      keyTree: SerializableKeyTreeNode[];
      filePath: string;
      selectedKey?: string;
    }
  | { type: 'select-key'; key: string }
  | { type: 'reload'; locales: string[]; keyTree: SerializableKeyTreeNode[] }
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
  | { type: 'save-complete'; success: boolean }
  | { type: 'usage-check-response'; key: string; usageFiles: string[] }
  | { type: 'delete-confirmed'; key: string };

/**
 * Messages from Webview to Extension (new format)
 */
type LocaleToExtensionMessage =
  | { type: 'ready' }
  | { type: 'update-translation'; key: string; locale: string; value: string }
  | { type: 'add-key'; parentKey: string | null; newSegment: string }
  | { type: 'delete-key'; key: string }
  | { type: 'rename-key'; oldKey: string; newKey: string }
  | { type: 'add-locale'; locale: string }
  | { type: 'request-save' }
  | { type: 'check-usage'; key: string }
  | { type: 'request-delete'; key: string; usageFiles: string[] };

/**
 * State for new ILocalesConfiguration format
 */
interface LocaleEditorState {
  /** All locale codes in this file */
  locales: string[];
  /** Tree structure for navigation */
  keyTree: SerializableKeyTreeNode[];
  /** Currently selected translation key */
  selectedKey: string | null;
  /** File path for display */
  filePath: string;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Set of expanded key paths */
  expandedKeys: Set<string>;
  /** Format detection: true = new format, false = legacy format */
  isNewFormat: boolean;
}

// Message types (webview-specific, not in core)
type ToWebviewMessage =
  | { type: 'initialize'; labels: LabelGroup[]; filePath: string; selectedLabelId?: string }
  | { type: 'select-label'; labelId: string }
  | { type: 'reload'; labels: LabelGroup[] }
  | { type: 'validation-error'; errors: ValidationError[] }
  | { type: 'save-complete'; success: boolean }
  | { type: 'usage-check-response'; groupId: string; usageFiles: string[] }
  | { type: 'delete-confirmed'; index: number };

type ToExtensionMessage =
  | { type: 'ready' }
  | { type: 'update'; labels: LabelGroup[] }
  | { type: 'request-save'; labels: LabelGroup[] }
  | { type: 'validate'; labels: LabelGroup[] }
  | { type: 'check-usage'; groupId: string }
  | { type: 'request-delete'; groupId: string; index: number; usageFiles: string[] };

const state: EditorState = {
  labels: [],
  selectedGroupIndex: null,
  validationErrors: new Map(),
  isDirty: false,
  filePath: '',
  focusedElement: null,
};

// New format state (Feature 045)
const localeState: LocaleEditorState = {
  locales: [],
  keyTree: [],
  selectedKey: null,
  filePath: '',
  isDirty: false,
  expandedKeys: new Set(),
  isNewFormat: false,
};

// Expose state for testing
(window as any).__localeEditorState = state;
(window as any).__localeEditorNewState = localeState;

// VSCode API - supports both legacy and new message formats
declare const acquireVsCodeApi: () => {
  postMessage(message: ToExtensionMessage | LocaleToExtensionMessage): void;
  getState(): EditorState | undefined;
  setState(state: EditorState): void;
};

const vscode = acquireVsCodeApi();

// =============================================================================
// New Format: Send Message Helper
// =============================================================================

/**
 * Send message to extension (new format)
 */
function sendLocaleMessage(message: LocaleToExtensionMessage): void {
  console.log('[webview] sendLocaleMessage:', message.type);
  vscode.postMessage(message);
}

/**
 * Save current focus state before re-render
 */
function saveFocusState(): void {
  const activeElement = document.activeElement as HTMLInputElement | null;
  if (!activeElement || activeElement.tagName !== 'INPUT') {
    state.focusedElement = null;
    return;
  }

  // Determine which field is focused based on data attributes or class names
  const groupElement = activeElement.closest('.group');
  const translationElement = activeElement.closest('.translation');

  if (groupElement) {
    const groupIndex = parseInt(groupElement.getAttribute('data-index') || '-1', 10);
    if (groupIndex < 0) {
      state.focusedElement = null;
      return;
    }

    if (translationElement) {
      const translationIndex = parseInt(translationElement.getAttribute('data-index') || '-1', 10);
      if (translationIndex < 0) {
        state.focusedElement = null;
        return;
      }

      // Determine field type by checking input's parent or sibling labels
      let field: 'languageCode' | 'labelText' = 'languageCode';
      const formGroup = activeElement.closest('.form-group');
      if (formGroup) {
        const label = formGroup.querySelector('label');
        if (label?.textContent === 'Label Text') {
          field = 'labelText';
        }
      }

      state.focusedElement = {
        groupIndex,
        translationIndex,
        field,
        cursorPosition: activeElement.selectionStart ?? undefined,
      };
    } else {
      // Group ID input
      state.focusedElement = {
        groupIndex,
        field: 'groupId',
        cursorPosition: activeElement.selectionStart ?? undefined,
      };
    }
  }
}

/**
 * Restore focus state after re-render
 */
function restoreFocusState(): void {
  console.log('[restoreFocusState] state.focusedElement:', state.focusedElement);

  if (!state.focusedElement) {
    console.log('[restoreFocusState] No focus state to restore');
    return;
  }

  const { groupIndex, translationIndex, field, cursorPosition } = state.focusedElement;

  if (groupIndex === undefined) {
    console.log('[restoreFocusState] groupIndex undefined, clearing state');
    state.focusedElement = null;
    return;
  }

  // Find the input element to focus
  let inputElement: HTMLInputElement | null = null;

  if (translationIndex !== undefined && field !== 'groupId') {
    console.log(`[restoreFocusState] Looking for translation[data-index="${translationIndex}"]`);
    // Find translation input by index
    const translationEl = document.querySelector(`.translation[data-index="${translationIndex}"]`);
    console.log('[restoreFocusState] translationEl found:', !!translationEl);
    if (translationEl) {
      if (field === 'languageCode') {
        inputElement = translationEl.querySelector('.form-group:nth-child(1) input');
      } else if (field === 'labelText') {
        inputElement = translationEl.querySelector('.form-group:nth-child(2) input');
      }
    }
  } else if (field === 'groupId') {
    console.log(`[restoreFocusState] Looking for group[data-index="${groupIndex}"]`);
    // Find group ID input by index
    const groupEl = document.querySelector(`.group[data-index="${groupIndex}"]`);
    console.log('[restoreFocusState] groupEl found:', !!groupEl);
    if (groupEl) {
      inputElement = groupEl.querySelector('.group-id input');
    }
  }

  console.log('[restoreFocusState] inputElement found:', !!inputElement);
  if (inputElement) {
    inputElement.focus();
    console.log('[restoreFocusState] Focused, setting cursor to:', cursorPosition);
    if (cursorPosition !== undefined) {
      inputElement.setSelectionRange(cursorPosition, cursorPosition);
    }
  }

  // Clear focus state after restoration
  state.focusedElement = null;
}

/**
 * Send message to extension
 */
function sendMessage(message: ToExtensionMessage): void {
  console.log('[webview] sendMessage:', message.type);
  vscode.postMessage(message);
}

/**
 * Handle messages from extension (supports both legacy and new format)
 */
window.addEventListener('message', event => {
  const message = event.data as ToWebviewMessage | LocaleToWebviewMessage;
  console.log('[webview] Received message from extension:', message.type);

  // Detect new format by checking for keyTree property
  if ('keyTree' in message && message.type === 'initialize') {
    // New format: ILocalesConfiguration
    handleNewFormatMessage(message as LocaleToWebviewMessage);
    return;
  }

  // Check for new format reload
  if ('keyTree' in message && message.type === 'reload') {
    handleNewFormatMessage(message as LocaleToWebviewMessage);
    return;
  }

  // Check for new format select-key
  if (message.type === 'select-key' && 'key' in message) {
    handleNewFormatMessage(message as LocaleToWebviewMessage);
    return;
  }

  // Check for new format delete-confirmed
  if (message.type === 'delete-confirmed' && 'key' in message) {
    handleNewFormatMessage(message as LocaleToWebviewMessage);
    return;
  }

  // Check for new format usage-check-response
  if (message.type === 'usage-check-response' && 'key' in message) {
    handleNewFormatMessage(message as LocaleToWebviewMessage);
    return;
  }

  // Legacy format: LabelGroup[]
  const legacyMessage = message as ToWebviewMessage;
  switch (legacyMessage.type) {
    case 'initialize':
      state.labels = legacyMessage.labels;
      state.filePath = legacyMessage.filePath;
      state.selectedGroupIndex = null;
      state.isDirty = false;
      localeState.isNewFormat = false;
      renderGroups();
      renderTranslations();
      // Auto-select label if specified
      if (legacyMessage.selectedLabelId) {
        selectLabelById(legacyMessage.selectedLabelId);
      }
      break;

    case 'select-label':
      selectLabelById(legacyMessage.labelId);
      break;

    case 'reload':
      console.log('[reload] START - saving focus');
      // Save focus state before updating
      saveFocusState();
      console.log('[reload] Focus saved, updating state and rendering');
      state.labels = legacyMessage.labels;
      renderGroups();
      renderTranslations();
      console.log('[reload] Render complete, restoring focus on next tick');
      // Restore focus after DOM updates (next tick)
      setTimeout(() => {
        restoreFocusState();
        console.log('[reload] COMPLETE');
      }, 0);
      break;

    case 'validation-error':
      displayValidationErrors(legacyMessage.errors);
      break;

    case 'save-complete':
      state.isDirty = false;
      localeState.isDirty = false;
      if (legacyMessage.success) {
        console.log('Save successful');
      }
      break;

    case 'usage-check-response':
      handleUsageCheckResponse(legacyMessage.groupId, legacyMessage.usageFiles);
      break;

    case 'delete-confirmed':
      performDelete(legacyMessage.index);
      break;
  }
});

/**
 * Handle new format messages (ILocalesConfiguration)
 */
function handleNewFormatMessage(message: LocaleToWebviewMessage): void {
  switch (message.type) {
    case 'initialize':
      localeState.locales = message.locales;
      localeState.keyTree = message.keyTree;
      localeState.filePath = message.filePath;
      localeState.selectedKey = message.selectedKey || null;
      localeState.isDirty = false;
      localeState.isNewFormat = true;
      // Expand parent keys if selectedKey provided
      if (message.selectedKey) {
        expandParentKeys(message.selectedKey);
      }
      renderKeyTree();
      renderLocaleTable();
      // Show new format UI, hide legacy
      showNewFormatUI();
      break;

    case 'select-key':
      localeState.selectedKey = message.key;
      expandParentKeys(message.key);
      renderKeyTree();
      renderLocaleTable();
      scrollToKey(message.key);
      break;

    case 'reload': {
      // Preserve expanded state
      const prevExpanded = new Set(localeState.expandedKeys);
      localeState.locales = message.locales;
      localeState.keyTree = message.keyTree;
      localeState.expandedKeys = prevExpanded;
      renderKeyTree();
      renderLocaleTable();
      break;
    }

    case 'validation-error':
      displayLocaleValidationErrors(message.errors);
      break;

    case 'save-complete':
      localeState.isDirty = false;
      if (message.success) {
        console.log('Save successful');
      }
      break;

    case 'usage-check-response':
      handleKeyUsageCheckResponse(message.key, message.usageFiles);
      break;

    case 'delete-confirmed':
      performKeyDelete(message.key);
      break;
  }
}

// Intercept Ctrl+S / Cmd+S to save
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (localeState.isNewFormat) {
      // New format: just request save (extension handles serialization)
      sendLocaleMessage({ type: 'request-save' });
    } else {
      // Legacy format
      sendMessage({ type: 'request-save', labels: state.labels });
    }
  }
});

/**
 * Render label groups in left panel
 */
function renderGroups(): void {
  console.log('[renderGroups] CALLED');
  console.trace('[renderGroups] Call stack:');
  const container = document.getElementById('groups-list');
  if (!container) return;

  container.innerHTML = '';

  for (let i = 0; i < state.labels.length; i++) {
    const group = state.labels[i];
    const isSelected = i === state.selectedGroupIndex;

    const groupElement = document.createElement('div');
    groupElement.className = `group group-item${isSelected ? ' selected' : ''}`;
    groupElement.draggable = true;
    groupElement.dataset.index = i.toString();
    groupElement.dataset.groupId = group.id; // For focus restoration
    // T050: Accessibility - ARIA attributes
    groupElement.setAttribute('role', 'listitem');
    groupElement.setAttribute('tabindex', '0');
    groupElement.setAttribute('aria-label', `Label group ${group.id || 'unnamed'}`);
    if (isSelected) {
      groupElement.setAttribute('aria-selected', 'true');
    }

    // Group ID (editable) with validation
    const idWrapper = document.createElement('div');
    idWrapper.className = 'group-id input-wrapper';

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.value = group.id;
    idInput.placeholder = 'group-id';
    // Stop click propagation to prevent re-rendering when clicking input
    idInput.addEventListener('click', e => {
      e.stopPropagation();
    });
    idInput.addEventListener('input', () => {
      group.id = idInput.value;
      markDirty();
      sendMessage({ type: 'update', labels: state.labels });
    });

    // Validate on blur
    idInput.addEventListener('blur', () => {
      const error = validateGroupId(group.id, i);
      const errorElement = groupElement.querySelector('.error-message');
      if (error) {
        idInput.classList.add('error');
        if (!errorElement) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'error-message';
          errorDiv.textContent = error;
          idWrapper.appendChild(errorDiv);
        } else {
          errorElement.textContent = error;
        }
      } else {
        idInput.classList.remove('error');
        if (errorElement) {
          errorElement.remove();
        }
      }
    });

    idWrapper.appendChild(idInput);

    // Group-level validation: Check for empty translations (T042)
    if (!group.labels || group.labels.length === 0) {
      const groupError = document.createElement('div');
      groupError.className = 'error-message';
      groupError.textContent = 'Group must have at least one translation';
      idWrapper.appendChild(groupError);
    }

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '🗑️';
    deleteButton.className = 'icon-button';
    deleteButton.title = 'Delete group';
    deleteButton.setAttribute('aria-label', `Delete group ${group.id || 'unnamed'}`);
    deleteButton.setAttribute('role', 'button');
    deleteButton.addEventListener('click', e => {
      e.stopPropagation();
      deleteGroup(i);
    });

    groupElement.appendChild(idWrapper);
    groupElement.appendChild(deleteButton);

    // Click to select
    groupElement.addEventListener('click', () => {
      selectGroup(i);
    });

    // T049: Keyboard navigation - Enter to select, Arrow keys to navigate
    groupElement.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectGroup(i);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextElement = groupElement.nextElementSibling as HTMLElement;
        if (nextElement) {
          nextElement.focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevElement = groupElement.previousElementSibling as HTMLElement;
        if (prevElement) {
          prevElement.focus();
        }
      }
    });

    // Drag and drop
    groupElement.addEventListener('dragstart', handleDragStart);
    groupElement.addEventListener('dragover', handleDragOver);
    groupElement.addEventListener('drop', handleDrop);
    groupElement.addEventListener('dragend', handleDragEnd);

    container.appendChild(groupElement);
  }
}

/**
 * Render translations for selected group in right panel
 * NOTE: UUIDs (translation.id) are NEVER displayed in the UI
 * Only languageCode and label fields are shown to users
 */
function renderTranslations(): void {
  const container = document.getElementById('translations-container');
  const emptyState = document.getElementById('empty-state');

  if (!container || !emptyState) return;

  // Clear previous content (except empty state)
  container.innerHTML = '';
  container.appendChild(emptyState);

  if (state.selectedGroupIndex === null) {
    // No group selected - show empty state
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  const group = state.labels[state.selectedGroupIndex];
  if (!group) return;

  for (let i = 0; i < group.labels.length; i++) {
    const translation = group.labels[i];

    const card = document.createElement('div');
    card.className = 'translation translation-card';
    card.dataset.translationId = translation.id; // For focus restoration (legacy)
    card.dataset.index = i.toString(); // For index-based focus restoration
    card.setAttribute('role', 'listitem');
    card.setAttribute(
      'aria-label',
      `Translation ${translation.languageCode || 'new'}: ${translation.label || 'empty'}`
    );

    // Language code input with validation
    const langGroup = document.createElement('div');
    langGroup.className = 'form-group';
    const langLabel = document.createElement('label');
    langLabel.textContent = 'Language Code';
    const langLabelId = `lang-label-${translation.id}`;
    langLabel.id = langLabelId;
    const langInput = document.createElement('input');
    langInput.type = 'text';
    langInput.value = translation.languageCode;
    langInput.placeholder = 'en-US';
    langInput.setAttribute('aria-labelledby', langLabelId);
    langInput.addEventListener('input', () => {
      translation.languageCode = langInput.value;
      markDirty();
      sendMessage({ type: 'update', labels: state.labels });
    });

    // Validate on blur
    langInput.addEventListener('blur', () => {
      const error = validateLanguageCode(translation.languageCode);
      let errorElement = langGroup.querySelector('.error-message');
      if (error) {
        langInput.classList.add('error');
        langInput.setAttribute('aria-invalid', 'true');
        if (!errorElement) {
          errorElement = document.createElement('div');
          errorElement.className = 'error-message';
          errorElement.setAttribute('role', 'alert');
          errorElement.setAttribute('aria-live', 'polite');
          langGroup.appendChild(errorElement);
        }
        errorElement.textContent = error;
      } else {
        langInput.classList.remove('error');
        langInput.removeAttribute('aria-invalid');
        if (errorElement) {
          errorElement.remove();
        }
      }
    });

    langGroup.appendChild(langLabel);
    langGroup.appendChild(langInput);

    // Label text input with validation
    const textGroup = document.createElement('div');
    textGroup.className = 'form-group';
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Label Text';
    const textLabelId = `text-label-${translation.id}`;
    textLabel.id = textLabelId;
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = translation.label;
    textInput.placeholder = 'Enter label text';
    textInput.setAttribute('aria-labelledby', textLabelId);
    textInput.addEventListener('input', () => {
      translation.label = textInput.value;
      markDirty();
      sendMessage({ type: 'update', labels: state.labels });
    });

    // Validate on blur
    textInput.addEventListener('blur', () => {
      const error = validateLabelText(translation.label);
      let errorElement = textGroup.querySelector('.error-message');
      if (error) {
        textInput.classList.add('error');
        textInput.setAttribute('aria-invalid', 'true');
        if (!errorElement) {
          errorElement = document.createElement('div');
          errorElement.className = 'error-message';
          errorElement.setAttribute('role', 'alert');
          errorElement.setAttribute('aria-live', 'polite');
          textGroup.appendChild(errorElement);
        }
        errorElement.textContent = error;
      } else {
        textInput.classList.remove('error');
        textInput.removeAttribute('aria-invalid');
        if (errorElement) {
          errorElement.remove();
        }
      }
    });

    textGroup.appendChild(textLabel);
    textGroup.appendChild(textInput);

    // Delete button (T050: ARIA attributes)
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'translation-actions';
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.className = 'secondary';
    deleteButton.setAttribute(
      'aria-label',
      `Delete translation ${translation.languageCode || 'new'}`
    );
    deleteButton.setAttribute('role', 'button');
    deleteButton.addEventListener('click', () => {
      group.labels.splice(i, 1);
      markDirty();
      sendMessage({ type: 'update', labels: state.labels });
      renderTranslations();
    });
    actionsDiv.appendChild(deleteButton);

    card.appendChild(langGroup);
    card.appendChild(textGroup);
    card.appendChild(actionsDiv);
    container.appendChild(card);
  }
}

/**
 * Select a group
 */
function selectGroup(index: number): void {
  state.selectedGroupIndex = index;
  renderGroups();
  renderTranslations();
}

/**
 * Select a label group by its ID and scroll it into view
 */
function selectLabelById(labelId: string): void {
  const index = state.labels.findIndex(g => g.id === labelId);
  if (index >= 0) {
    selectGroup(index);
    // Scroll the group into view after DOM update
    setTimeout(() => {
      const groupElement = document.querySelector(`.group[data-index="${index}"]`);
      if (groupElement) {
        groupElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a brief highlight effect
        groupElement.classList.add('highlight');
        setTimeout(() => {
          groupElement.classList.remove('highlight');
        }, 1500);
      }
    }, 0);
  }
}

/**
 * Add a new label group
 */
function addLabelGroup(): void {
  const newGroup: LabelGroup = {
    id: '',
    labels: [],
  };
  state.labels.push(newGroup);
  state.selectedGroupIndex = state.labels.length - 1;
  markDirty();
  sendMessage({ type: 'update', labels: state.labels });
  renderGroups();
  renderTranslations();

  // T051: Focus management - Focus new group's ID input
  setTimeout(() => {
    const groupsList = document.getElementById('groups-list');
    const newGroupElement = groupsList?.lastElementChild as HTMLElement;
    const idInput = newGroupElement?.querySelector('input');
    if (idInput) {
      idInput.focus();
    }
  }, 0);
}

/**
 * Delete a label group
 */
function deleteGroup(index: number): void {
  console.log('[deleteGroup] Called with index:', index);
  const group = state.labels[index];
  console.log('[deleteGroup] Group ID:', group.id);
  // Check if group is used in .eligian files
  sendMessage({ type: 'check-usage', groupId: group.id });

  // Store index for later deletion after confirmation
  (window as any).__pendingDeleteIndex = index;
  console.log('[deleteGroup] Stored pending delete index:', index);
}

/**
 * Handle usage check response and send delete request to extension
 */
function handleUsageCheckResponse(groupId: string, usageFiles: string[]): void {
  console.log('[handleUsageCheckResponse] Called for groupId:', groupId);
  console.log('[handleUsageCheckResponse] Usage files:', usageFiles);
  const index = (window as any).__pendingDeleteIndex;
  console.log('[handleUsageCheckResponse] Retrieved pending index:', index);
  if (index === undefined) {
    console.log('[handleUsageCheckResponse] No pending index, returning');
    return;
  }

  // Send delete request to extension (will show VS Code native dialog)
  console.log('[handleUsageCheckResponse] Sending request-delete message to extension');
  sendMessage({
    type: 'request-delete',
    groupId,
    index,
    usageFiles,
  });

  delete (window as any).__pendingDeleteIndex;
}

/**
 * Perform the actual deletion after user confirms
 */
function performDelete(index: number): void {
  console.log('[performDelete] Deleting group at index:', index);
  state.labels.splice(index, 1);
  if (state.selectedGroupIndex === index) {
    state.selectedGroupIndex = null;
  } else if (state.selectedGroupIndex !== null && state.selectedGroupIndex > index) {
    state.selectedGroupIndex--;
  }
  markDirty();
  sendMessage({ type: 'update', labels: state.labels });
  renderGroups();
  renderTranslations();
}

/**
 * Mark editor as dirty
 */
function markDirty(): void {
  state.isDirty = true;
}

/**
 * Display validation errors (from extension)
 */
function displayValidationErrors(errors: ValidationError[]): void {
  // Store errors in state
  state.validationErrors.clear();
  for (const error of errors) {
    const key = error.translationId
      ? `${error.groupId}:${error.translationId}:${error.field}`
      : `${error.groupId}:${error.field}`;
    const existingErrors = state.validationErrors.get(key) || [];
    existingErrors.push(error);
    state.validationErrors.set(key, existingErrors);
  }

  // Re-render ONLY if there are errors to display
  // (Don't destroy DOM unnecessarily when validation passes)
  if (errors.length > 0) {
    renderGroups();
    renderTranslations();
  }
}

/**
 * Validate group ID (client-side wrapper)
 * Returns error message or null if valid
 */
function validateGroupId(groupId: string, currentIndex: number): string | null {
  return coreValidateGroupId(groupId, currentIndex, state.labels);
}

/**
 * Validate language code (client-side wrapper)
 * Returns error message or null if valid
 */
function validateLanguageCode(code: string): string | null {
  return coreValidateLanguageCode(code);
}

/**
 * Validate label text (client-side wrapper)
 * Returns error message or null if valid
 */
function validateLabelText(text: string): string | null {
  return coreValidateLabelText(text);
}

/**
 * Check if there are any validation errors
 * Returns true if errors exist
 * @internal Reserved for future use (pre-save validation check)
 */
// @ts-expect-error - Reserved for future use
function _hasValidationErrors(): boolean {
  // Check client-side validation errors in state
  if (state.validationErrors.size > 0) {
    return true;
  }

  // Check for structural errors
  for (let i = 0; i < state.labels.length; i++) {
    const group = state.labels[i];

    // Check group ID
    if (validateGroupId(group.id, i) !== null) {
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

// Drag and drop state
let draggedIndex: number | null = null;

// Debounce timer for update-translation messages
let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const UPDATE_DEBOUNCE_MS = 100; // Debounce updates by 100ms

function handleDragStart(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement;
  draggedIndex = Number.parseInt(target.dataset.index || '-1', 10);
  target.classList.add('dragging');
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.classList.add('drop-target');
}

function handleDrop(e: DragEvent): void {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.classList.remove('drop-target');

  const dropIndex = Number.parseInt(target.dataset.index || '-1', 10);
  if (draggedIndex !== null && dropIndex !== -1 && draggedIndex !== dropIndex) {
    // Reorder array
    const [removed] = state.labels.splice(draggedIndex, 1);
    state.labels.splice(dropIndex, 0, removed);

    // Update selected index if needed
    if (state.selectedGroupIndex === draggedIndex) {
      state.selectedGroupIndex = dropIndex;
    } else if (state.selectedGroupIndex !== null) {
      if (draggedIndex < state.selectedGroupIndex && dropIndex >= state.selectedGroupIndex) {
        state.selectedGroupIndex--;
      } else if (draggedIndex > state.selectedGroupIndex && dropIndex <= state.selectedGroupIndex) {
        state.selectedGroupIndex++;
      }
    }

    markDirty();
    sendMessage({ type: 'update', labels: state.labels });
    renderGroups();
  }
}

function handleDragEnd(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement;
  target.classList.remove('dragging');
  draggedIndex = null;

  // Remove drop-target class from all elements
  const allGroups = document.querySelectorAll('.group-item');
  for (const group of allGroups) {
    group.classList.remove('drop-target');
  }
}

/**
 * Open the modal for adding translation to all groups
 */
function openTranslationModal(): void {
  const modal = document.getElementById('translation-modal');
  if (modal) {
    modal.style.display = 'block';
  }
}

/**
 * Close the modal and clear input
 */
function closeTranslationModal(): void {
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
 * Validate language code against existing translations (client-side wrapper)
 * Returns error message or null if valid
 */
function validateNewLanguageCode(code: string): string | null {
  return coreValidateNewLanguageCode(code, state.labels);
}

/**
 * Add translation with given language code to all groups
 */
function addTranslationToAllGroups(languageCode: string): void {
  // Add translation to each group
  for (const group of state.labels) {
    const newTranslation: Translation = {
      id: crypto.randomUUID(), // Unique ID for each group
      languageCode: languageCode,
      label: '', // User will fill in the label text
    };
    group.labels.push(newTranslation);
  }

  // Mark as dirty and send update
  markDirty();
  sendMessage({ type: 'update', labels: state.labels });

  // Re-render to show new translations
  renderGroups();
  renderTranslations();
}

/**
 * Handle modal confirm button click
 */
function handleModalConfirm(): void {
  const input = document.getElementById('modal-language-code') as HTMLInputElement;
  const errorEl = document.getElementById('modal-error');

  if (!input || !errorEl) return;

  const languageCode = input.value.trim();

  // Validate
  const error = validateNewLanguageCode(languageCode);
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    return; // Keep modal open
  }

  // Valid - add to all groups
  addTranslationToAllGroups(languageCode);

  // Close modal
  closeTranslationModal();
}

// =============================================================================
// New Format: Key Tree Rendering (Feature 045, T047)
// =============================================================================

/**
 * Show new format UI elements, hide legacy elements
 */
function showNewFormatUI(): void {
  // Hide legacy elements
  const legacyGroupsList = document.getElementById('groups-list');
  const legacyTranslationsContainer = document.getElementById('translations-container');
  if (legacyGroupsList) legacyGroupsList.style.display = 'none';
  if (legacyTranslationsContainer) legacyTranslationsContainer.style.display = 'none';

  // Show new format elements
  const keyTree = document.getElementById('key-tree');
  const localeTableContainer = document.getElementById('locale-table-container');
  if (keyTree) keyTree.style.display = 'block';
  if (localeTableContainer) localeTableContainer.style.display = 'block';
}

/**
 * Render the key tree in the navigation panel
 */
function renderKeyTree(): void {
  const container = document.getElementById('key-tree');
  if (!container) return;

  container.innerHTML = '';

  // Create root node "locale keys"
  const rootNode = document.createElement('div');
  rootNode.className = 'tree-node tree-branch';
  rootNode.dataset.key = '__root__';
  rootNode.dataset.depth = '0';

  const isRootExpanded = localeState.expandedKeys.has('__root__');

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'tree-toggle';
  toggleBtn.textContent = isRootExpanded ? '▼' : '▶';
  toggleBtn.setAttribute('aria-expanded', isRootExpanded.toString());
  toggleBtn.setAttribute('aria-label', `${isRootExpanded ? 'Collapse' : 'Expand'} locale keys`);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'tree-node-name';
  nameSpan.textContent = 'locale keys';

  rootNode.appendChild(toggleBtn);
  rootNode.appendChild(nameSpan);

  // Toggle expand/collapse for root
  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (isRootExpanded) {
      localeState.expandedKeys.delete('__root__');
    } else {
      localeState.expandedKeys.add('__root__');
    }
    renderKeyTree();
  });

  // Children container for root
  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'tree-children';
  childrenContainer.style.display = isRootExpanded ? 'block' : 'none';

  // Render tree nodes recursively under root
  for (const node of localeState.keyTree) {
    const nodeElement = createTreeNodeElement(node, 1);
    childrenContainer.appendChild(nodeElement);
  }

  rootNode.appendChild(childrenContainer);
  container.appendChild(rootNode);

  // Auto-expand root on first render if there are keys
  if (localeState.keyTree.length > 0 && !localeState.expandedKeys.has('__root__')) {
    localeState.expandedKeys.add('__root__');
    renderKeyTree();
  }
}

/**
 * Create a tree node element recursively
 */
function createTreeNodeElement(node: SerializableKeyTreeNode, depth: number): HTMLElement {
  const nodeElement = document.createElement('div');
  nodeElement.className = 'tree-node';
  nodeElement.dataset.key = node.fullKey;
  nodeElement.dataset.depth = depth.toString();
  nodeElement.style.paddingLeft = `${depth * 16}px`;

  const isExpanded = localeState.expandedKeys.has(node.fullKey);
  const isSelected = localeState.selectedKey === node.fullKey;

  if (node.isLeaf) {
    // Leaf node (translation key)
    nodeElement.classList.add('tree-leaf');
    if (isSelected) nodeElement.classList.add('selected');

    const leafIcon = document.createElement('span');
    leafIcon.className = 'tree-icon';
    leafIcon.textContent = '📝';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tree-node-name';
    nameSpan.textContent = node.name;

    nodeElement.appendChild(leafIcon);
    nodeElement.appendChild(nameSpan);

    // Click to select
    nodeElement.addEventListener('click', () => {
      localeState.selectedKey = node.fullKey;
      renderKeyTree();
      renderLocaleTable();
    });
  } else {
    // Branch node (namespace)
    nodeElement.classList.add('tree-branch');
    if (isExpanded) nodeElement.classList.add('expanded');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'tree-toggle';
    toggleBtn.textContent = isExpanded ? '▼' : '▶';
    toggleBtn.setAttribute('aria-expanded', isExpanded.toString());
    toggleBtn.setAttribute('aria-label', `${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tree-node-name';
    nameSpan.textContent = node.name;

    nodeElement.appendChild(toggleBtn);
    nodeElement.appendChild(nameSpan);

    // Toggle expand/collapse
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (isExpanded) {
        localeState.expandedKeys.delete(node.fullKey);
      } else {
        localeState.expandedKeys.add(node.fullKey);
      }
      renderKeyTree();
    });

    // Children container
    if (node.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = isExpanded ? 'block' : 'none';

      for (const child of node.children) {
        const childElement = createTreeNodeElement(child, depth + 1);
        childrenContainer.appendChild(childElement);
      }

      nodeElement.appendChild(childrenContainer);
    }
  }

  return nodeElement;
}

/**
 * Expand parent keys for a given key path
 */
function expandParentKeys(fullKey: string): void {
  const parts = fullKey.split('.');
  for (let i = 1; i < parts.length; i++) {
    const parentKey = parts.slice(0, i).join('.');
    localeState.expandedKeys.add(parentKey);
  }
}

/**
 * Scroll to a key in the tree view
 */
function scrollToKey(key: string): void {
  setTimeout(() => {
    const element = document.querySelector(`.tree-node[data-key="${key}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight');
      setTimeout(() => element.classList.remove('highlight'), 1500);
    }
  }, 0);
}

// =============================================================================
// New Format: Locale Table Rendering (Feature 045, T048)
// =============================================================================

/**
 * Render the locale table for the selected key
 */
function renderLocaleTable(): void {
  const container = document.getElementById('locale-table-container');
  const emptyState = document.getElementById('locale-empty-state');

  if (!container) return;

  // Clear previous content
  const table = container.querySelector('.locale-table');
  if (table) table.remove();

  // Find the selected node
  const selectedNode = localeState.selectedKey
    ? findNodeByKey(localeState.keyTree, localeState.selectedKey)
    : null;

  if (!selectedNode || !selectedNode.isLeaf) {
    // No leaf node selected - show empty state
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Create locale table
  const tableElement = document.createElement('table');
  tableElement.className = 'locale-table';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const keyHeader = document.createElement('th');
  keyHeader.textContent = 'Key';
  headerRow.appendChild(keyHeader);

  for (const locale of localeState.locales) {
    const localeHeader = document.createElement('th');
    localeHeader.textContent = locale;
    headerRow.appendChild(localeHeader);
  }

  thead.appendChild(headerRow);
  tableElement.appendChild(thead);

  // Body row for selected key
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');

  const keyCell = document.createElement('td');
  keyCell.className = 'key-cell';
  keyCell.textContent = selectedNode.fullKey;
  row.appendChild(keyCell);

  for (const locale of localeState.locales) {
    const translationCell = document.createElement('td');
    translationCell.className = 'translation-cell';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'translation-input';
    input.value = selectedNode.translations?.[locale] || '';
    input.placeholder = `Enter ${locale} translation`;
    input.dataset.key = selectedNode.fullKey;
    input.dataset.locale = locale;

    // Track last synced value to detect actual changes
    let lastSyncedValue = input.value;

    // Handle input changes - send update on every keystroke (debounced)
    // This ensures VS Code's dirty indicator works and undo/redo stays in sync
    input.addEventListener('input', () => {
      const hasChanged = input.value !== lastSyncedValue;
      if (!hasChanged) return; // No actual change

      markLocaleDirty();
      // Update local state optimistically
      if (selectedNode.translations) {
        selectedNode.translations[locale] = input.value;
      }

      // Debounce the update message to avoid excessive traffic
      if (updateDebounceTimer) {
        clearTimeout(updateDebounceTimer);
      }
      updateDebounceTimer = setTimeout(() => {
        sendLocaleMessage({
          type: 'update-translation',
          key: selectedNode.fullKey,
          locale: locale,
          value: input.value,
        });
        // Update last synced value after sending
        lastSyncedValue = input.value;
      }, UPDATE_DEBOUNCE_MS);
    });

    // Also send on blur to ensure final state is captured (only if changed)
    input.addEventListener('blur', () => {
      const hasChanged = input.value !== lastSyncedValue;
      if (!hasChanged) return; // No change, don't send

      // Clear any pending debounce and send immediately
      if (updateDebounceTimer) {
        clearTimeout(updateDebounceTimer);
        updateDebounceTimer = null;
      }
      sendLocaleMessage({
        type: 'update-translation',
        key: selectedNode.fullKey,
        locale: locale,
        value: input.value,
      });
      // Update last synced value after sending
      lastSyncedValue = input.value;
    });

    translationCell.appendChild(input);
    row.appendChild(translationCell);
  }

  tbody.appendChild(row);
  tableElement.appendChild(tbody);
  container.appendChild(tableElement);
}

/**
 * Find a node by key in the tree
 */
function findNodeByKey(
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
 * Mark locale editor as dirty
 */
function markLocaleDirty(): void {
  localeState.isDirty = true;
}

// =============================================================================
// New Format: Validation Error Display
// =============================================================================

/**
 * Display validation errors for locale format
 */
function displayLocaleValidationErrors(
  errors: Array<{ key?: string; locale?: string; field: string; message: string; code: string }>
): void {
  // Clear previous errors
  const allInputs = document.querySelectorAll('.translation-input');
  for (const input of allInputs) {
    input.classList.remove('error');
    const errorMsg = input.parentElement?.querySelector('.error-message');
    if (errorMsg) errorMsg.remove();
  }

  // Display new errors
  for (const error of errors) {
    if (error.key && error.locale) {
      const input = document.querySelector(
        `.translation-input[data-key="${error.key}"][data-locale="${error.locale}"]`
      );
      if (input) {
        input.classList.add('error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = error.message;
        input.parentElement?.appendChild(errorDiv);
      }
    }
  }
}

// =============================================================================
// New Format: Key Operations (Feature 045, T049-T050)
// =============================================================================

/**
 * Handle usage check response for key deletion
 */
function handleKeyUsageCheckResponse(key: string, usageFiles: string[]): void {
  // Send delete request to extension (will show VS Code native dialog)
  sendLocaleMessage({
    type: 'request-delete',
    key,
    usageFiles,
  });
}

/**
 * Perform key deletion after confirmation
 */
function performKeyDelete(key: string): void {
  // Remove from local tree (optimistic update)
  removeKeyFromTree(localeState.keyTree, key);

  // Clear selection if deleted key was selected
  if (localeState.selectedKey === key) {
    localeState.selectedKey = null;
  }

  markLocaleDirty();
  renderKeyTree();
  renderLocaleTable();
}

/**
 * Remove a key from the tree
 */
function removeKeyFromTree(tree: SerializableKeyTreeNode[], key: string): boolean {
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].fullKey === key) {
      tree.splice(i, 1);
      return true;
    }
    if (tree[i].children.length > 0) {
      if (removeKeyFromTree(tree[i].children, key)) {
        // Remove empty parent branches
        if (tree[i].children.length === 0 && !tree[i].isLeaf) {
          tree.splice(i, 1);
        }
        return true;
      }
    }
  }
  return false;
}

/**
 * Open the add key modal
 */
function openAddKeyModal(): void {
  const modal = document.getElementById('add-key-modal');
  const parentKeyInput = document.getElementById('add-key-parent') as HTMLInputElement;

  if (modal) {
    modal.style.display = 'block';
    // Pre-fill parent key if a branch is selected
    if (parentKeyInput && localeState.selectedKey) {
      const selectedNode = findNodeByKey(localeState.keyTree, localeState.selectedKey);
      if (selectedNode && !selectedNode.isLeaf) {
        parentKeyInput.value = selectedNode.fullKey;
      } else if (selectedNode) {
        // If leaf selected, use its parent
        const parts = localeState.selectedKey.split('.');
        if (parts.length > 1) {
          parentKeyInput.value = parts.slice(0, -1).join('.');
        } else {
          parentKeyInput.value = '';
        }
      }
    }
  }
}

/**
 * Close the add key modal
 */
function closeAddKeyModal(): void {
  const modal = document.getElementById('add-key-modal');
  const parentInput = document.getElementById('add-key-parent') as HTMLInputElement;
  const segmentInput = document.getElementById('add-key-segment') as HTMLInputElement;
  const errorEl = document.getElementById('add-key-error');

  if (modal) modal.style.display = 'none';
  if (parentInput) parentInput.value = '';
  if (segmentInput) segmentInput.value = '';
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }
}

/**
 * Handle add key confirm
 */
function handleAddKeyConfirm(): void {
  const parentInput = document.getElementById('add-key-parent') as HTMLInputElement;
  const segmentInput = document.getElementById('add-key-segment') as HTMLInputElement;
  const errorEl = document.getElementById('add-key-error');

  if (!segmentInput || !errorEl) return;

  const parentKey = parentInput?.value.trim() || null;
  const newSegment = segmentInput.value.trim();

  // Validate segment
  if (!newSegment) {
    errorEl.textContent = 'Key segment is required';
    errorEl.style.display = 'block';
    return;
  }

  // Validate format (alphanumeric, underscores, hyphens)
  if (!/^[a-zA-Z0-9_-]+$/.test(newSegment)) {
    errorEl.textContent = 'Key segment can only contain letters, numbers, underscores, and hyphens';
    errorEl.style.display = 'block';
    return;
  }

  // Send to extension
  sendLocaleMessage({
    type: 'add-key',
    parentKey,
    newSegment,
  });

  closeAddKeyModal();
}

/**
 * Open the add locale modal
 */
function openAddLocaleModal(): void {
  const modal = document.getElementById('add-locale-modal');
  if (modal) {
    modal.style.display = 'block';
  }
}

/**
 * Close the add locale modal
 */
function closeAddLocaleModal(): void {
  const modal = document.getElementById('add-locale-modal');
  const input = document.getElementById('add-locale-code') as HTMLInputElement;
  const errorEl = document.getElementById('add-locale-error');

  if (modal) modal.style.display = 'none';
  if (input) input.value = '';
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }
}

/**
 * Handle add locale confirm
 */
function handleAddLocaleConfirm(): void {
  const input = document.getElementById('add-locale-code') as HTMLInputElement;
  const errorEl = document.getElementById('add-locale-error');

  if (!input || !errorEl) return;

  const locale = input.value.trim();

  // Validate format (xx-XX)
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
    errorEl.textContent = 'Locale must be in format xx-XX (e.g., en-US, nl-NL)';
    errorEl.style.display = 'block';
    return;
  }

  // Check if already exists
  if (localeState.locales.includes(locale)) {
    errorEl.textContent = `Locale '${locale}' already exists`;
    errorEl.style.display = 'block';
    return;
  }

  // Send to extension
  sendLocaleMessage({
    type: 'add-locale',
    locale,
  });

  closeAddLocaleModal();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wire up button event listeners (legacy format)
  const addGroupBtn = document.getElementById('add-group-btn');
  const addTranslationBtn = document.getElementById('add-translation-btn');
  const modalCancelBtn = document.getElementById('modal-cancel');
  const modalConfirmBtn = document.getElementById('modal-confirm');

  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', addLabelGroup);
  }

  if (addTranslationBtn) {
    addTranslationBtn.addEventListener('click', openTranslationModal);
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeTranslationModal);
  }

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', handleModalConfirm);
  }

  // Wire up button event listeners (new format - Feature 045)
  const addKeyBtn = document.getElementById('add-key-btn');
  const addLocaleBtn = document.getElementById('add-locale-btn');
  const addKeyModalCancelBtn = document.getElementById('add-key-cancel');
  const addKeyModalConfirmBtn = document.getElementById('add-key-confirm');
  const addLocaleModalCancelBtn = document.getElementById('add-locale-cancel');
  const addLocaleModalConfirmBtn = document.getElementById('add-locale-confirm');

  if (addKeyBtn) {
    addKeyBtn.addEventListener('click', openAddKeyModal);
  }

  if (addLocaleBtn) {
    addLocaleBtn.addEventListener('click', openAddLocaleModal);
  }

  if (addKeyModalCancelBtn) {
    addKeyModalCancelBtn.addEventListener('click', closeAddKeyModal);
  }

  if (addKeyModalConfirmBtn) {
    addKeyModalConfirmBtn.addEventListener('click', handleAddKeyConfirm);
  }

  if (addLocaleModalCancelBtn) {
    addLocaleModalCancelBtn.addEventListener('click', closeAddLocaleModal);
  }

  if (addLocaleModalConfirmBtn) {
    addLocaleModalConfirmBtn.addEventListener('click', handleAddLocaleConfirm);
  }

  // Send ready message to extension
  sendMessage({ type: 'ready' });
});
