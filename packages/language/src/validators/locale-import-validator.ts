/**
 * Locale Import Validator
 *
 * Pure validation functions for locales JSON files using AJV schema validation.
 * Follows Constitution Principle X (Compiler-First validation): Business logic in
 * pure functions, Langium integration is thin adapter layer.
 *
 * Feature 045: Refactored from label-import-validator.ts to use ILocalesConfiguration.
 *
 * @module validators/locale-import-validator
 */

import type { AnySchema, ErrorObject } from 'ajv';
import { Ajv } from 'ajv';
import localesSchema from '../schemas/locales-schema.json' with { type: 'json' };

/**
 * Validation error structure for locales import failures
 */
export interface LocaleValidationError {
  code: 'invalid_locales_json' | 'invalid_locales_schema' | 'locales_file_not_found';
  message: string;
  hint: string;
  path?: string;
  details?: string;
}

// Initialize AJV with optimal settings for locales validation
const ajv = new Ajv({
  allErrors: false, // Stop on first error (faster, simpler messages)
  coerceTypes: false, // No type coercion
  useDefaults: false, // No default values
  removeAdditional: false, // Don't remove extra properties
  validateSchema: false, // Skip meta-schema validation (performance optimization)
});

// Compile schema once at module initialization (performance optimization)
// Note: We cast to AnySchema since JSONSchemaType doesn't handle patternProperties well
const compiledLocalesSchema = ajv.compile(localesSchema as AnySchema);

/**
 * Format AJV validation error into user-friendly message
 *
 * Maps AJV error keywords to actionable error messages.
 *
 * @param error - AJV error object
 * @param data - Original data for context extraction
 * @returns Formatted error message
 */
function formatValidationError(error: ErrorObject, _data: unknown): string {
  const path = error.instancePath || 'root';

  switch (error.keyword) {
    case 'type':
      return `Property "${path}" must be a ${error.params.type}`;

    case 'required':
      return `Missing required property "${error.params.missingProperty}" at ${path}`;

    case 'minProperties':
      return 'Locales file must contain at least one locale (e.g., "en-US")';

    case 'pattern':
      return `Invalid locale code format at "${path}". Use format like "en-US" or "nl-NL"`;

    case 'additionalProperties':
      return `Invalid locale code "${error.params.additionalProperty}". Use format like "en-US" or "nl-NL"`;

    default:
      return error.message || 'Validation error';
  }
}

/**
 * Validate locales JSON against schema
 *
 * Pure function that validates parsed JSON data against the locales schema.
 * Returns error object if validation fails, undefined if valid.
 *
 * @param data - Parsed JSON data to validate
 * @returns LocaleValidationError if invalid, undefined if valid
 */
export function validateSchema(data: unknown): LocaleValidationError | undefined {
  const isValid = compiledLocalesSchema(data);

  if (isValid) {
    return undefined;
  }

  // Get first error (allErrors: false means only one error)
  const errors = compiledLocalesSchema.errors || [];
  if (errors.length === 0) {
    return {
      code: 'invalid_locales_schema',
      message: 'Locales file does not match required structure',
      hint: 'Check the schema documentation for correct format',
    };
  }

  const firstError = errors[0];
  const formattedMessage = formatValidationError(firstError, data);

  return {
    code: 'invalid_locales_schema',
    message: formattedMessage,
    hint: 'See schema documentation for required fields and types',
    details: JSON.stringify(firstError, null, 2),
  };
}

/**
 * Validate locales JSON content (parse + schema validation)
 *
 * Parses JSON string, catches syntax errors, and validates against schema.
 * This is the primary validation function used by the compiler pipeline.
 *
 * @param jsonContent - Raw JSON string content
 * @param filePath - File path for error reporting
 * @returns LocaleValidationError if invalid, undefined if valid
 */
export function validateLocalesJSON(
  jsonContent: string,
  filePath: string
): LocaleValidationError | undefined {
  // Step 1: Parse JSON (catch syntax errors)
  let data: unknown;
  try {
    data = JSON.parse(jsonContent);
  } catch (error) {
    const parseError = error as SyntaxError;
    return {
      code: 'invalid_locales_json',
      message: `Invalid JSON syntax in '${filePath}': ${parseError.message}`,
      hint: 'Check for missing commas, unclosed brackets, or trailing commas',
      path: filePath,
    };
  }

  // Step 2: Validate against schema
  const schemaError = validateSchema(data);
  if (schemaError) {
    return {
      ...schemaError,
      path: filePath,
    };
  }

  return undefined;
}
