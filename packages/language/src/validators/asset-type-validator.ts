/**
 * Asset Type Validator
 *
 * Provides pure validation function for asset type inference.
 * Ensures named imports either have inferrable extensions or explicit type overrides.
 *
 * Constitution Principle X: Compiler-First Validation
 * - Pure function returning typed errors
 * - Langium validator is thin adapter calling this function
 *
 * @module asset-type-validator
 */

import type { NamedImport } from '../generated/ast.js';
import { inferAssetType } from '../utils/asset-type-inference.js';
import { createValidationError } from '../utils/error-builder.js';
import { getFileExtension } from '../utils/path-utils.js';
import { AMBIGUOUS_EXTENSIONS } from './validation-constants.js';
import { ERROR_MESSAGES, type TypeInferenceError } from './validation-errors.js';

/**
 * Validates that a named import has either an inferrable extension or explicit type
 *
 * @param importStmt - NamedImport AST node
 * @returns TypeInferenceError if invalid, undefined if valid
 *
 * **Validation Rules**:
 * 1. If explicit `as type` provided → VALID (always)
 * 2. If extension is inferrable (.html, .css, .mp4, etc.) → VALID
 * 3. If extension is ambiguous (.ogg) → AMBIGUOUS_EXTENSION error
 * 4. If extension is unknown (.tmpl, .scss, .json, etc.) → UNKNOWN_EXTENSION error
 *
 * **Examples**:
 * ```typescript
 * // VALID: Inferrable extension
 * validateAssetType({ path: './page.html', assetType: undefined })
 * // → undefined (valid)
 *
 * // VALID: Explicit type override
 * validateAssetType({ path: './page.tmpl', assetType: 'html' })
 * // → undefined (valid)
 *
 * // ERROR: Unknown extension, no explicit type
 * validateAssetType({ path: './page.tmpl', assetType: undefined })
 * // → TypeInferenceError { code: 'UNKNOWN_EXTENSION', extension: 'tmpl', ... }
 *
 * // ERROR: Ambiguous extension, no explicit type
 * validateAssetType({ path: './audio.ogg', assetType: undefined })
 * // → TypeInferenceError { code: 'AMBIGUOUS_EXTENSION', extension: 'ogg', ... }
 * ```
 */
export function validateAssetType(importStmt: NamedImport): TypeInferenceError | undefined {
  // If explicit type provided, always valid
  if (importStmt.assetType) {
    return undefined;
  }

  // Extract extension from path
  const extension = getFileExtension(importStmt.path);

  // Check if extension is ambiguous (like .ogg)
  if (extension && AMBIGUOUS_EXTENSIONS.has(extension)) {
    return createValidationError(
      'AMBIGUOUS_EXTENSION',
      ERROR_MESSAGES.AMBIGUOUS_EXTENSION,
      [extension],
      { extension }
    );
  }

  // Try to infer type from extension
  const inferredType = inferAssetType(importStmt.path);

  // If inference fails, extension is unknown
  // If inference fails, extension is unknown
  if (!inferredType) {
    return createValidationError(
      'UNKNOWN_EXTENSION',
      ERROR_MESSAGES.UNKNOWN_EXTENSION,
      [extension || ''],
      { extension: extension || '' }
    );
  }
  // Inference succeeded - valid
  return undefined;
}
