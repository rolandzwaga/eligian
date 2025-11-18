/**
 * Label Editor Webview Script
 * Runs in browser context, manages UI state and user interactions
 */

// Type definitions matching types.ts from extension side
interface LabelGroup {
  id: string;
  labels: Translation[];
}

interface Translation {
  id: string; // UUID v4
  languageCode: string;
  label: string;
}

interface ValidationError {
  groupId?: string;
  translationId?: string;
  field: string;
  message: string;
  code: string;
}

type ToWebviewMessage =
  | { type: 'initialize'; labels: LabelGroup[]; filePath: string }
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

// State management
interface EditorState {
  labels: LabelGroup[];
  selectedGroupIndex: number | null;
  validationErrors: Map<string, ValidationError[]>;
  isDirty: boolean;
  filePath: string;
  // Focus restoration state
  focusedElement: {
    groupIndex?: number;
    translationIndex?: number;
    field?: 'groupId' | 'languageCode' | 'labelText';
    cursorPosition?: number;
  } | null;
}

const state: EditorState = {
  labels: [],
  selectedGroupIndex: null,
  validationErrors: new Map(),
  isDirty: false,
  filePath: '',
  focusedElement: null,
};

// VSCode API
declare const acquireVsCodeApi: () => {
  postMessage(message: ToExtensionMessage): void;
  getState(): EditorState | undefined;
  setState(state: EditorState): void;
};

const vscode = acquireVsCodeApi();

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
 * Handle messages from extension
 */
window.addEventListener('message', event => {
  const message = event.data as ToWebviewMessage;
  console.log('[webview] Received message from extension:', message.type);

  switch (message.type) {
    case 'initialize':
      state.labels = message.labels;
      state.filePath = message.filePath;
      state.selectedGroupIndex = null;
      state.isDirty = false;
      renderGroups();
      renderTranslations();
      break;

    case 'reload':
      console.log('[reload] START - saving focus');
      // Save focus state before updating
      saveFocusState();
      console.log('[reload] Focus saved, updating state and rendering');
      state.labels = message.labels;
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
      displayValidationErrors(message.errors);
      break;

    case 'save-complete':
      state.isDirty = false;
      if (message.success) {
        console.log('Save successful');
      }
      break;

    case 'usage-check-response':
      handleUsageCheckResponse(message.groupId, message.usageFiles);
      break;

    case 'delete-confirmed':
      performDelete(message.index);
      break;
  }
});

// Intercept Ctrl+S / Cmd+S to save
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    sendMessage({ type: 'request-save', labels: state.labels });
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
  const addButton = document.getElementById('add-translation-btn');

  if (!container || !emptyState || !addButton) return;

  // Clear previous content (except empty state)
  container.innerHTML = '';
  container.appendChild(emptyState);

  if (state.selectedGroupIndex === null) {
    // No group selected - show empty state
    emptyState.style.display = 'block';
    addButton.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  addButton.style.display = 'block';

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
 * Add a new translation to selected group
 * UUIDs are auto-generated using Web Crypto API (UUID v4)
 */
function addTranslation(): void {
  if (state.selectedGroupIndex === null) return;

  const group = state.labels[state.selectedGroupIndex];
  const newTranslation: Translation = {
    id: crypto.randomUUID(), // Auto-generate UUID v4 (never shown in UI)
    languageCode: '',
    label: '',
  };
  group.labels.push(newTranslation);
  markDirty();
  sendMessage({ type: 'update', labels: state.labels });
  renderTranslations();

  // T051: Focus management - Focus new translation's language code input
  setTimeout(() => {
    const container = document.getElementById('translations-container');
    const cards = container?.querySelectorAll('.translation-card');
    if (cards && cards.length > 0) {
      const lastCard = cards[cards.length - 1];
      const langInput = lastCard.querySelector('input[placeholder="en-US"]');
      if (langInput instanceof HTMLInputElement) {
        langInput.focus();
      }
    }
  }, 0);
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
 * Validate group ID (client-side)
 * Returns error message or null if valid
 */
function validateGroupId(groupId: string, currentIndex: number): string | null {
  // Check for empty
  if (!groupId || groupId.trim().length === 0) {
    return 'Group ID cannot be empty';
  }

  // Check for invalid characters
  if (!/^[a-zA-Z0-9._-]+$/.test(groupId)) {
    return 'Group ID can only contain letters, numbers, dots, hyphens, and underscores';
  }

  // Check for duplicates
  for (let i = 0; i < state.labels.length; i++) {
    if (i !== currentIndex && state.labels[i].id === groupId) {
      return `Group ID '${groupId}' already exists`;
    }
  }

  return null;
}

/**
 * Validate language code (client-side)
 * Returns error message or null if valid
 */
function validateLanguageCode(code: string): string | null {
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
 * Validate label text (client-side)
 * Returns error message or null if valid
 */
function validateLabelText(text: string): string | null {
  if (!text || text.trim().length === 0) {
    return 'Label text cannot be empty';
  }

  return null;
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wire up button event listeners
  const addGroupBtn = document.getElementById('add-group-btn');
  const addTranslationBtn = document.getElementById('add-translation-btn');

  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', addLabelGroup);
  }

  if (addTranslationBtn) {
    addTranslationBtn.addEventListener('click', addTranslation);
  }

  // Send ready message to extension
  sendMessage({ type: 'ready' });
});
