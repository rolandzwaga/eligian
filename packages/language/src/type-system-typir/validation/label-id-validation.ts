/**
 * Label ID Validation
 *
 * Pure validation functions for label ID parameters using registry lookup
 * and Levenshtein-based suggestions for typos.
 *
 * @module type-system-typir/validation/label-id-validation
 */

import { findSimilarClasses } from '../../css/levenshtein.js';
import type { LabelRegistryService } from '../utils/label-registry.js';

/**
 * Validation error for unknown label ID
 */
export interface LabelIDValidationError {
  code: 'unknown_label_id' | 'no_labels_import';
  message: string;
  hint: string;
  labelId?: string;
  suggestions?: string[];
}

/**
 * Validate that a label ID exists in the registry for a document
 *
 * Pure function that checks registry and generates Levenshtein suggestions.
 *
 * @param documentUri - Absolute URI of the Eligian document
 * @param labelId - Label ID to validate
 * @param registry - Label registry service
 * @returns Validation error if invalid, undefined if valid
 *
 * @example
 * ```typescript
 * const error = validateLabelID('file:///program.eligian', 'welcome-titel', registry);
 * // Returns: {
 * //   code: 'unknown_label_id',
 * //   message: "Unknown label ID: 'welcome-titel'",
 * //   hint: "Did you mean: 'welcome-title'?",
 * //   labelId: 'welcome-titel',
 * //   suggestions: ['welcome-title']
 * // }
 * ```
 */
export function validateLabelID(
  documentUri: string,
  labelId: string,
  registry: LabelRegistryService
): LabelIDValidationError | undefined {
  // Check if document has any labels imported
  const availableLabelIDs = Array.from(registry.getLabelIDsForDocument(documentUri));

  if (availableLabelIDs.length === 0) {
    return {
      code: 'no_labels_import',
      message: 'Label ID parameter used but no labels imported',
      hint: "Add a labels import statement: labels './labels.json'",
    };
  }

  // Check if label ID exists
  if (registry.hasLabelID(documentUri, labelId)) {
    return undefined; // Valid
  }

  // Generate suggestions using Levenshtein distance (threshold: ≤2)
  const suggestions = findSimilarClasses(labelId, new Set(availableLabelIDs), 2);

  const hint =
    suggestions.length > 0
      ? `Did you mean: '${suggestions[0]}'?`
      : `Available label IDs: ${availableLabelIDs.slice(0, 5).join(', ')}${availableLabelIDs.length > 5 ? '...' : ''}`;

  return {
    code: 'unknown_label_id',
    message: `Unknown label ID: '${labelId}'`,
    hint,
    labelId,
    suggestions,
  };
}

/**
 * Validate array of label IDs
 *
 * Validates each element in an array parameter, collecting all errors.
 *
 * @param documentUri - Absolute URI of the Eligian document
 * @param labelIds - Array of label IDs to validate
 * @param registry - Label registry service
 * @returns Array of validation errors (empty if all valid)
 *
 * @example
 * ```typescript
 * const errors = validateLabelIDArray('file:///program.eligian', ['valid-id', 'invalid-id'], registry);
 * // Returns: [
 * //   {
 * //     code: 'unknown_label_id',
 * //     message: "Unknown label ID: 'invalid-id'",
 * //     hint: "Did you mean: 'valid-id'?",
 * //     labelId: 'invalid-id',
 * //     suggestions: ['valid-id']
 * //   }
 * // ]
 * ```
 */
export function validateLabelIDArray(
  documentUri: string,
  labelIds: string[],
  registry: LabelRegistryService
): LabelIDValidationError[] {
  const errors: LabelIDValidationError[] = [];

  for (const labelId of labelIds) {
    const error = validateLabelID(documentUri, labelId, registry);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
}
