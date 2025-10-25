/**
 * Import Name Validator
 *
 * Provides pure validation function for import name validation.
 * Enforces uniqueness and prevents conflicts with reserved keywords and operations.
 *
 * Constitution Principle X: Compiler-First Validation
 * - Pure function returning typed errors
 * - Langium validator is thin adapter calling this function
 *
 * @module import-name-validator
 */

import type { ImportNameError } from './validation-errors.js';
import { ERROR_MESSAGES } from './validation-errors.js';

/**
 * Validates that an import name is unique and doesn't conflict with language constructs
 *
 * @param name - Import name from named import statement
 * @param existingNames - Set of already-used import names in the document
 * @param reservedKeywords - Set of reserved keywords (if, else, for, import, etc.)
 * @param operationNames - Set of built-in operation names (selectElement, addClass, etc.)
 * @returns ImportNameError if invalid, undefined if valid
 *
 * **Validation Rules** (priority order):
 * 1. Name MUST NOT duplicate existing import name (DUPLICATE_IMPORT_NAME)
 * 2. Name MUST NOT match reserved keyword (RESERVED_KEYWORD)
 * 3. Name MUST NOT match built-in operation name (OPERATION_NAME_CONFLICT)
 *
 * **Examples**:
 * ```typescript
 * validateImportName('tooltip', new Set(), new Set(['if']), new Set(['selectElement']))
 * // → undefined (valid)
 *
 * validateImportName('tooltip', new Set(['tooltip']), new Set(['if']), new Set(['selectElement']))
 * // → ImportNameError { code: 'DUPLICATE_IMPORT_NAME', ... }
 *
 * validateImportName('if', new Set(), new Set(['if']), new Set(['selectElement']))
 * // → ImportNameError { code: 'RESERVED_KEYWORD', ... }
 *
 * validateImportName('selectElement', new Set(), new Set(['if']), new Set(['selectElement']))
 * // → ImportNameError { code: 'OPERATION_NAME_CONFLICT', ... }
 * ```
 */
export function validateImportName(
  name: string,
  existingNames: Set<string>,
  reservedKeywords: Set<string>,
  operationNames: Set<string>
): ImportNameError | undefined {
  // Priority 1: Check for duplicate names
  if (existingNames.has(name)) {
    const { message, hint } = ERROR_MESSAGES.DUPLICATE_IMPORT_NAME(name);
    return {
      code: 'DUPLICATE_IMPORT_NAME',
      message,
      hint,
    };
  }

  // Priority 2: Check for reserved keywords
  if (reservedKeywords.has(name)) {
    const { message, hint } = ERROR_MESSAGES.RESERVED_KEYWORD(name, reservedKeywords);
    return {
      code: 'RESERVED_KEYWORD',
      message,
      hint,
    };
  }

  // Priority 3: Check for operation name conflicts
  if (operationNames.has(name)) {
    const { message, hint } = ERROR_MESSAGES.OPERATION_NAME_CONFLICT(name);
    return {
      code: 'OPERATION_NAME_CONFLICT',
      message,
      hint,
    };
  }

  // Valid name
  return undefined;
}
