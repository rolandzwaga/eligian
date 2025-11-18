/**
 * DOM Reconciliation Utilities
 *
 * Prevents focus loss by updating only changed elements instead of recreating the entire DOM.
 * Based on Microsoft's CustomTextEditorProvider pattern.
 */

/**
 * Focus state capture for preservation across DOM updates
 */
interface FocusState {
  elementId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
}

/**
 * Capture the current focus state (element ID and cursor position)
 */
export function captureFocusState(): FocusState {
  const activeElement = document.activeElement;

  if (!activeElement || activeElement === document.body) {
    return {
      elementId: null,
      selectionStart: null,
      selectionEnd: null,
    };
  }

  const elementId = activeElement.id;
  const selectionStart =
    activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement.selectionStart
      : null;
  const selectionEnd =
    activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement.selectionEnd
      : null;

  return {
    elementId,
    selectionStart,
    selectionEnd,
  };
}

/**
 * Restore focus state to a previously focused element
 */
export function restoreFocusState(focusState: FocusState): void {
  if (!focusState.elementId) {
    return;
  }

  const element = document.getElementById(focusState.elementId);
  if (!element) {
    return;
  }

  element.focus();

  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    focusState.selectionStart !== null &&
    focusState.selectionEnd !== null
  ) {
    element.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
  }
}

/**
 * Update input value without recreating the element (preserves focus)
 */
export function reconcileInputValue(input: HTMLInputElement, newValue: string): void {
  // Skip update if value is unchanged (optimization)
  if (input.value === newValue) {
    return;
  }

  // Preserve cursor position if input is focused
  const hasFocus = document.activeElement === input;
  const cursorPosition = hasFocus ? input.selectionStart : null;

  input.value = newValue;

  // Restore cursor position
  if (hasFocus && cursorPosition !== null) {
    input.setSelectionRange(cursorPosition, cursorPosition);
  }
}

/**
 * Reconcile label groups by adding/updating/removing elements as needed
 */
export function reconcileLabelGroups(
  container: HTMLElement,
  oldGroups: any[],
  newGroups: any[]
): void {
  // Capture focus before making changes
  const focusState = captureFocusState();

  // Build a map of existing group elements by data-group-id
  const existingGroups = new Map<string, HTMLElement>();
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement) {
      const groupId = child.getAttribute('data-group-id');
      if (groupId) {
        existingGroups.set(groupId, child);
      }
    }
  }

  // Process groups by index (position-based reconciliation)
  const maxLength = Math.max(oldGroups.length, newGroups.length);

  for (let i = 0; i < maxLength; i++) {
    const oldGroup = oldGroups[i];
    const newGroup = newGroups[i];

    if (oldGroup && newGroup) {
      // Update existing group at this position
      const element = existingGroups.get(oldGroup.id);
      if (element) {
        element.setAttribute('data-group-id', newGroup.id);
        existingGroups.delete(oldGroup.id); // Mark as processed
      }
    } else if (newGroup) {
      // Add new group (no old group at this position)
      const element = document.createElement('div');
      element.setAttribute('data-group-id', newGroup.id);
      container.appendChild(element);
    }
    // If oldGroup but no newGroup, element will be removed below
  }

  // Remove any remaining elements that weren't updated (they were removed)
  for (const element of existingGroups.values()) {
    container.removeChild(element);
  }

  // Restore focus after changes
  restoreFocusState(focusState);
}
