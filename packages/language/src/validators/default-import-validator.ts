/**
 * Default Import Validator
 *
 * Provides pure validation function for default import uniqueness.
 * Ensures only one default import per type (layout, styles, provider).
 *
 * Constitution Principle X: Compiler-First Validation
 * - Pure function returning typed errors
 * - Langium validator is thin adapter calling this function
 *
 * @module default-import-validator
 */

import type { DefaultImport } from '../generated/ast.js';
import { createValidationError } from '../utils/error-builder.js';
import type { DuplicateDefaultImportError } from './validation-errors.js';
import { ERROR_MESSAGES } from './validation-errors.js';

/**
 * Validates that default imports are not duplicated
 *
 * Only ONE of each default import type is allowed per document:
 * - One `layout` import
 * - One `styles` import
 * - One `provider` import
 *
 * @param imports - Array of all default imports in document
 * @returns Map of imports to errors (empty map if all valid)
 *
 * **Examples**:
 * ```typescript
 * const imports = [layout1, layout2];
 * const errors = validateDefaultImports(imports);
 * // → Map { layout2 → DuplicateDefaultImportError }
 *
 * const imports = [layout1, styles1, provider1];
 * const errors = validateDefaultImports(imports);
 * // → Map {} (all valid)
 * ```
 */
export function validateDefaultImports(
  imports: DefaultImport[]
): Map<DefaultImport, DuplicateDefaultImportError> {
  const errors = new Map<DefaultImport, DuplicateDefaultImportError>();
  const seen = new Map<string, DefaultImport>();

  for (const importStmt of imports) {
    const existing = seen.get(importStmt.type);

    if (existing) {
      errors.set(
        importStmt,
        createValidationError(
          'DUPLICATE_DEFAULT_IMPORT',
          ERROR_MESSAGES.DUPLICATE_DEFAULT_IMPORT,
          [importStmt.type],
          { importType: importStmt.type }
        )
      );
    } else {
      // First occurrence - track it
      seen.set(importStmt.type, importStmt);
    }
  }

  return errors;
}
