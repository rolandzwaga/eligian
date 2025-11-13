/**
 * Error Builder Utilities
 *
 * This module provides utilities for constructing validation error objects
 * from error message definitions, eliminating duplicated error construction patterns.
 */

/**
 * Creates a validation error object from an error message definition function.
 *
 * This utility consolidates the repeated pattern of:
 * ```typescript
 * const { message, hint } = ERROR_MESSAGES.ERROR_CODE(...args);
 * return {
 *   code: 'ERROR_CODE',
 *   message,
 *   hint,
 *   ...additionalProps
 * };
 * ```
 *
 * @param code - The error code string
 * @param errorDefinition - Error message definition function from ERROR_MESSAGES
 * @param args - Arguments to pass to the error definition function
 * @returns Error object with code, message, hint, and additional properties
 *
 * @example
 * ```typescript
 * // Before:
 * const { message, hint } = ERROR_MESSAGES.DUPLICATE_IMPORT_NAME(name);
 * return {
 *   code: 'DUPLICATE_IMPORT_NAME',
 *   message,
 *   hint,
 * };
 *
 * // After:
 * return createValidationError('DUPLICATE_IMPORT_NAME', ERROR_MESSAGES.DUPLICATE_IMPORT_NAME, name);
 * ```
 *
 * @example
 * ```typescript
 * // With additional properties:
 * return createValidationError(
 *   'UNKNOWN_EXTENSION',
 *   ERROR_MESSAGES.UNKNOWN_EXTENSION,
 *   extension,
 *   { extension }
 * );
 * ```
 */
export function createValidationError<
  TCode extends string,
  TDefinition extends (...args: any[]) => { message: string; hint: string },
  TAdditional extends Record<string, unknown> = Record<string, never>,
>(
  code: TCode,
  errorDefinition: TDefinition,
  args: Parameters<TDefinition>,
  additionalProps?: TAdditional
): { code: TCode; message: string; hint: string } & TAdditional {
  const { message, hint } = errorDefinition(...args);

  return {
    code,
    message,
    hint,
    ...(additionalProps || ({} as TAdditional)),
  };
}
