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
  const extension = extractExtension(importStmt.path);

  // Check if extension is ambiguous (like .ogg)
  if (extension && AMBIGUOUS_EXTENSIONS.has(extension)) {
    const { message, hint } = ERROR_MESSAGES.AMBIGUOUS_EXTENSION(extension);
    return {
      code: 'AMBIGUOUS_EXTENSION',
      message,
      hint,
      extension,
    };
  }

  // Try to infer type from extension
  const inferredType = inferAssetType(importStmt.path);

  // If inference fails, extension is unknown
  if (!inferredType) {
    const { message, hint } = ERROR_MESSAGES.UNKNOWN_EXTENSION(extension || '');
    return {
      code: 'UNKNOWN_EXTENSION',
      message,
      hint,
      extension: extension || '',
    };
  }

  // Inference succeeded - valid
  return undefined;
}

/**
 * Extracts the file extension from a path (last extension, case-insensitive)
 *
 * @param path - File path
 * @returns Lowercase extension without dot, or empty string if no extension
 *
 * **Examples**:
 * ```typescript
 * extractExtension('./file.html')         // → 'html'
 * extractExtension('./file.min.css')      // → 'css' (last extension)
 * extractExtension('./file')              // → ''
 * extractExtension('./file.HTML')         // → 'html' (lowercased)
 * extractExtension('../../dir.v2/file.js') // → 'js' (ignores dots in directories)
 * ```
 */
function extractExtension(path: string): string {
  if (!path) return '';

  const match = path.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}
