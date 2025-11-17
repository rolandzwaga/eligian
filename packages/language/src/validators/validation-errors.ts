/**
 * Validation Error Types for Import Statements
 *
 * @deprecated Error type interfaces in this file are deprecated.
 * Use ValidationError from '@eligian/language/errors' for new code.
 * ERROR_MESSAGES is still maintained for backwards compatibility.
 *
 * All error types follow Constitution Principle X (Compiler-First Validation):
 * Pure, testable error types that are returned by validator functions.
 *
 * @module validation-errors
 */

/**
 * Base interface for all import validation errors
 */
export interface ImportValidationError {
  code: string;
  message: string;
  hint: string;
}

/**
 * Path validation error
 *
 * Returned when import path format is invalid (e.g., absolute paths)
 */
export interface PathError extends ImportValidationError {
  code: 'ABSOLUTE_PATH' | 'INVALID_PATH_FORMAT';
}

/**
 * Import name validation error
 *
 * Returned when import name conflicts with reserved keywords or operation names,
 * or when duplicate import names are detected
 */
export interface ImportNameError extends ImportValidationError {
  code: 'DUPLICATE_IMPORT_NAME' | 'RESERVED_KEYWORD' | 'OPERATION_NAME_CONFLICT';
}

/**
 * Type inference validation error
 *
 * Returned when asset type cannot be inferred from extension and no explicit
 * type override is provided
 */
export interface TypeInferenceError extends ImportValidationError {
  code: 'UNKNOWN_EXTENSION' | 'AMBIGUOUS_EXTENSION';
  extension: string;
}

/**
 * Duplicate default import error
 *
 * Returned when multiple default imports of the same type (layout, styles, provider)
 * are detected
 */
export interface DuplicateDefaultImportError extends ImportValidationError {
  code: 'DUPLICATE_DEFAULT_IMPORT';
  importType: 'layout' | 'styles' | 'provider' | 'labels';
}

/**
 * Error message templates for user-facing validation errors
 *
 * All messages must be:
 * - Clear and actionable
 * - Beginner-friendly (no jargon)
 * - Include helpful hints for fixing the issue
 */
export const ERROR_MESSAGES = {
  // Path errors
  ABSOLUTE_PATH: {
    message:
      "Import path must be relative (start with './' or '../'), absolute paths are not portable",
    hint: "Use './filename.ext' or '../folder/filename.ext' for relative paths",
  },

  INVALID_PATH_FORMAT: {
    message: 'Invalid path format',
    hint: "Paths must be quoted strings starting with './' or '../'",
  },

  // Name errors
  DUPLICATE_IMPORT_NAME: (name: string) => ({
    message: `Duplicate import name '${name}', import names must be unique`,
    hint: 'Choose a different name for this import',
  }),

  RESERVED_KEYWORD: (name: string, keywords: Set<string>) => ({
    message: `Cannot use reserved keyword '${name}' as import name`,
    hint: `Reserved keywords: ${Array.from(keywords).sort().join(', ')}`,
  }),

  OPERATION_NAME_CONFLICT: (name: string) => ({
    message: `Cannot use operation name '${name}' as import name`,
    hint: `'${name}' is a built-in operation. Choose a different import name`,
  }),

  // Type inference errors
  UNKNOWN_EXTENSION: (ext: string) => ({
    message: `Unknown file extension '.${ext}', please specify type: import foo from './file.${ext}' as html|css|media`,
    hint: "Add 'as html', 'as css', or 'as media' to specify the asset type",
  }),

  AMBIGUOUS_EXTENSION: (ext: string) => ({
    message: `Ambiguous file extension '.${ext}', please specify type explicitly`,
    hint: "Add 'as media' to clarify this is a media file",
  }),

  // Default import errors
  DUPLICATE_DEFAULT_IMPORT: (type: string) => ({
    message: `Duplicate '${type}' import, only one ${type} import is allowed`,
    hint: `Remove duplicate ${type} import statements`,
  }),
};
