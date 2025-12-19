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
interface LabelIDValidationError {
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
      message: 'Translation key parameter used but no locales imported',
      hint: "Add a locales import statement: locales './locales.json'",
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
      : `Available translation keys: ${availableLabelIDs.slice(0, 5).join(', ')}${availableLabelIDs.length > 5 ? '...' : ''}`;

  return {
    code: 'unknown_label_id',
    message: `Unknown translation key: '${labelId}'`,
    hint,
    labelId,
    suggestions,
  };
}
