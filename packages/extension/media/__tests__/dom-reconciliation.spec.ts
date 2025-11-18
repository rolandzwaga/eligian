/**
 * DOM Reconciliation Tests
 *
 * Tests for the DOM reconciliation pattern that prevents focus loss
 * by updating only changed elements instead of recreating the entire DOM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  reconcileInputValue,
  reconcileLabelGroups,
  captureFocusState,
  restoreFocusState,
} from '../dom-reconciliation.js';

// Mock DOM APIs
const createMockInput = (id: string, value: string): HTMLInputElement => {
  const input = document.createElement('input');
  input.id = id;
  input.value = value;
  input.type = 'text';
  return input;
};

describe('DOM Reconciliation', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('reconcileGroupInput', () => {
    it('should update input value without recreating element', () => {
      // ARRANGE
      const input = createMockInput('group-0-id', 'old-value');
      container.appendChild(input);
      const initialElement = input;

      // ACT
      reconcileInputValue(input, 'new-value');

      // ASSERT
      expect(input.value).toBe('new-value');
      expect(input).toBe(initialElement); // Same element reference
    });

    it('should preserve focus when updating focused input', () => {
      // ARRANGE
      const input = createMockInput('group-0-id', 'old-value');
      container.appendChild(input);
      input.focus();
      const cursorPosition = 5;
      input.setSelectionRange(cursorPosition, cursorPosition);

      // ACT
      reconcileInputValue(input, 'old-value-modified');

      // ASSERT
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(cursorPosition);
    });

    it('should skip update if value unchanged', () => {
      // ARRANGE
      const input = createMockInput('group-0-id', 'same-value');
      container.appendChild(input);
      const valueSetter = vi.spyOn(input, 'value', 'set');

      // ACT
      reconcileInputValue(input, 'same-value');

      // ASSERT
      expect(valueSetter).not.toHaveBeenCalled();
    });

    it('should not lose focus if input is not focused', () => {
      // ARRANGE
      const input1 = createMockInput('group-0-id', 'value-1');
      const input2 = createMockInput('group-1-id', 'value-2');
      container.appendChild(input1);
      container.appendChild(input2);
      input2.focus(); // Focus different input

      // ACT
      reconcileInputValue(input1, 'new-value-1');

      // ASSERT
      expect(document.activeElement).toBe(input2); // Focus stayed on input2
    });
  });

  describe('reconcileLabelGroups', () => {
    it('should add new group elements', () => {
      // ARRANGE
      const newGroups = [
        { id: 'group-1', labels: [] }
      ];

      // ACT
      reconcileLabelGroups(container, [], newGroups);

      // ASSERT
      const groupEl = container.querySelector('[data-group-id="group-1"]');
      expect(groupEl).toBeTruthy();
    });

    it('should update existing group elements without recreating', () => {
      // ARRANGE
      const oldGroups = [{ id: 'group-1', labels: [] }];
      reconcileLabelGroups(container, [], oldGroups);
      const originalGroupEl = container.querySelector('[data-group-id="group-1"]');

      // ACT
      const updatedGroups = [{ id: 'group-1-updated', labels: [] }];
      reconcileLabelGroups(container, oldGroups, updatedGroups);

      // ASSERT
      const groupEl = container.querySelector('[data-group-id="group-1-updated"]');
      // Both should be the same DOM element (reference equality)
      expect(groupEl).toBe(originalGroupEl);
      // Verify the attribute was actually updated
      expect(originalGroupEl?.getAttribute('data-group-id')).toBe('group-1-updated');
    });

    it('should remove deleted group elements', () => {
      // ARRANGE
      const oldGroups = [
        { id: 'group-1', labels: [] },
        { id: 'group-2', labels: [] }
      ];
      reconcileLabelGroups(container, [], oldGroups);

      // ACT
      const newGroups = [{ id: 'group-1', labels: [] }];
      reconcileLabelGroups(container, oldGroups, newGroups);

      // ASSERT
      expect(container.querySelector('[data-group-id="group-1"]')).toBeTruthy();
      expect(container.querySelector('[data-group-id="group-2"]')).toBeFalsy();
    });

    it('should preserve focus across reconciliation', () => {
      // ARRANGE
      const oldGroups = [{ id: 'group-1', labels: [] }];
      reconcileLabelGroups(container, [], oldGroups);

      // Manually add an input to the group (simulating real label group UI)
      const groupEl = container.querySelector('[data-group-id="group-1"]') as HTMLElement;
      const input = document.createElement('input');
      input.id = 'test-input';
      input.type = 'text';
      input.value = 'test';
      groupEl.appendChild(input);

      input.focus();
      const cursorPos = 3;
      input.setSelectionRange(cursorPos, cursorPos);

      // ACT
      const newGroups = [{ id: 'group-1-modified', labels: [] }];
      reconcileLabelGroups(container, oldGroups, newGroups);

      // ASSERT
      const updatedInput = document.getElementById('test-input') as HTMLInputElement;
      expect(document.activeElement).toBe(updatedInput);
      expect(updatedInput.selectionStart).toBe(cursorPos);
    });
  });

  describe('Focus Preservation Utilities', () => {
    it('should capture focus state', () => {
      // ARRANGE
      const input = createMockInput('test-input', 'test-value');
      container.appendChild(input);
      input.focus();
      input.setSelectionRange(5, 5);

      // ACT
      const focusState = captureFocusState();

      // ASSERT
      expect(focusState.elementId).toBe('test-input');
      expect(focusState.selectionStart).toBe(5);
      expect(focusState.selectionEnd).toBe(5);
    });

    it('should restore focus state', () => {
      // ARRANGE
      const input = createMockInput('test-input', 'test');
      container.appendChild(input);
      const focusState = {
        elementId: 'test-input',
        selectionStart: 3,
        selectionEnd: 3
      };

      // ACT
      restoreFocusState(focusState);

      // ASSERT
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(3);
    });

    it('should handle missing element gracefully', () => {
      // ARRANGE
      const focusState = {
        elementId: 'non-existent',
        selectionStart: 0,
        selectionEnd: 0
      };

      // ACT & ASSERT (should not throw)
      expect(() => restoreFocusState(focusState)).not.toThrow();
    });
  });
});
