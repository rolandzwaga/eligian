/**
 * T217: Control flow pairing validation.
 *
 * Extracted verbatim from `operations/validator.ts` (W3 decomposition).
 */

import type { ControlFlowError } from './errors.js';

/**
 * Validate control flow pairing for a sequence of operations.
 * Checks that when/endWhen and forEach/endForEach are properly paired.
 * Validates that otherwise appears only between when and endWhen.
 *
 * @param operations - Array of operation names in sequence
 * @returns Array of ControlFlowError for any pairing issues, empty if valid
 *
 * @example
 * const operations = ['when', 'addClass', 'endWhen'];
 * const errors = validateControlFlowPairing(operations);
 * // errors = [] (valid pairing)
 *
 * @example
 * const operations = ['when', 'addClass']; // Missing endWhen
 * const errors = validateControlFlowPairing(operations);
 * // errors[0].issue = 'unclosed'
 *
 * @example
 * const operations = ['addClass', 'endWhen']; // Unmatched endWhen
 * const errors = validateControlFlowPairing(operations);
 * // errors[0].issue = 'unmatched'
 *
 * @example
 * const operations = ['addClass', 'otherwise']; // otherwise outside when block
 * const errors = validateControlFlowPairing(operations);
 * // errors[0].issue = 'invalid_otherwise'
 */
export function validateControlFlowPairing(operations: string[]): ControlFlowError[] {
  const errors: ControlFlowError[] = [];
  const whenStack: number[] = []; // Track indices of unclosed 'when'
  const forEachStack: number[] = []; // Track indices of unclosed 'forEach'

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];

    switch (op) {
      case 'when':
        whenStack.push(i);
        break;

      case 'endWhen':
        if (whenStack.length === 0) {
          // Unmatched endWhen
          errors.push({
            code: 'CONTROL_FLOW',
            operationName: 'endWhen',
            message: `Unmatched 'endWhen' at position ${i}: no corresponding 'when' found`,
            blockType: 'when',
            issue: 'unmatched',
            hint: `Add a 'when' operation before this 'endWhen'`,
          });
        } else {
          whenStack.pop(); // Matched - remove from stack
        }
        break;

      case 'otherwise':
        // otherwise is only valid inside a when block
        if (whenStack.length === 0) {
          errors.push({
            code: 'CONTROL_FLOW',
            operationName: 'otherwise',
            message: `'otherwise' at position ${i} appears outside a 'when' block`,
            blockType: 'when',
            issue: 'invalid_otherwise',
            hint: `'otherwise' can only appear between 'when' and 'endWhen'`,
          });
        }
        break;

      case 'forEach':
        forEachStack.push(i);
        break;

      case 'endForEach':
        if (forEachStack.length === 0) {
          // Unmatched endForEach
          errors.push({
            code: 'CONTROL_FLOW',
            operationName: 'endForEach',
            message: `Unmatched 'endForEach' at position ${i}: no corresponding 'forEach' found`,
            blockType: 'forEach',
            issue: 'unmatched',
            hint: `Add a 'forEach' operation before this 'endForEach'`,
          });
        } else {
          forEachStack.pop(); // Matched - remove from stack
        }
        break;
    }
  }

  // Check for unclosed blocks at end of sequence
  for (const whenIndex of whenStack) {
    errors.push({
      code: 'CONTROL_FLOW',
      operationName: 'when',
      message: `Unclosed 'when' block starting at position ${whenIndex}: missing 'endWhen'`,
      blockType: 'when',
      issue: 'unclosed',
      hint: `Add 'endWhen' to close this 'when' block`,
    });
  }

  for (const forEachIndex of forEachStack) {
    errors.push({
      code: 'CONTROL_FLOW',
      operationName: 'forEach',
      message: `Unclosed 'forEach' block starting at position ${forEachIndex}: missing 'endForEach'`,
      blockType: 'forEach',
      issue: 'unclosed',
      hint: `Add 'endForEach' to close this 'forEach' block`,
    });
  }

  return errors;
}
