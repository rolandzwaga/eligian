/**
 * Label Import Validator
 *
 * Pure validation functions for labels JSON files using AJV schema validation.
 * Follows Constitution Principle X (Compiler-First validation): Business logic in
 * pure functions, Langium integration is thin adapter layer.
 *
 * @module validators/label-import-validator
 */

import type { ErrorObject, JSONSchemaType } from 'ajv';
import { Ajv } from 'ajv';
import type { ILanguageLabel } from 'eligius';
import labelsSchema from '../schemas/labels-schema.json' with { type: 'json' };

/**
 * Validation error structure for labels import failures
 */
export interface LabelValidationError {
  code: 'invalid_labels_json' | 'invalid_labels_schema' | 'labels_file_not_found';
  message: string;
  hint: string;
  path?: string;
  details?: string;
}

// Initialize AJV with optimal settings for labels validation
const ajv = new Ajv({
  allErrors: false, // Stop on first error (faster, simpler messages)
  coerceTypes: false, // No type coercion
  useDefaults: false, // No default values
  removeAdditional: false, // Don't remove extra properties
  validateSchema: false, // Skip meta-schema validation (performance optimization)
});

// Compile schema once at module initialization (performance optimization)
const validateLabelsSchema = ajv.compile(labelsSchema as JSONSchemaType<ILanguageLabel[]>);

/**
 * Format AJV validation error into user-friendly message
 *
 * Maps AJV error keywords to actionable error messages per research.md mapping table.
 *
 * @param error - AJV error object
 * @param data - Original data for context extraction
 * @returns Formatted error message
 */
function formatValidationError(error: ErrorObject, data: unknown): string {
  const path = error.instancePath || 'root';

  switch (error.keyword) {
    case 'type':
      return `Property "${path}" must be a ${error.params.type}`;

    case 'required':
      return `Missing required property "${error.params.missingProperty}" at ${path}`;

    case 'minLength':
      return `Property "${path}" cannot be empty`;

    case 'minItems':
      if (path.includes('labels')) {
        const groupId = getGroupIdFromPath(data, path);
        if (groupId) {
          return `Label group "${groupId}" must have at least one translation`;
        }
        return `Array at "${path}" must have at least ${error.params.limit} items`;
      }
      return `Array at "${path}" must have at least ${error.params.limit} items`;

    default:
      return error.message || 'Validation error';
  }
}

/**
 * Extract label group ID from JSON pointer path
 *
 * @param data - Original JSON data
 * @param path - JSON pointer path (e.g., "/0/labels")
 * @returns Label group ID if found, undefined otherwise
 */
function getGroupIdFromPath(data: unknown, path: string): string | undefined {
  if (!path || !Array.isArray(data)) return undefined;

  const segments = path.split('/').slice(1); // Remove leading ""
  if (segments.length === 0) return undefined;

  // Extract array index (e.g., "0" from "/0/labels")
  const groupIndex = Number.parseInt(segments[0], 10);
  if (Number.isNaN(groupIndex) || groupIndex >= data.length) return undefined;

  const group = data[groupIndex];
  return (group as { id?: string })?.id;
}

/**
 * Validate labels JSON against schema
 *
 * Pure function that validates parsed JSON data against the labels schema.
 * Returns error object if validation fails, undefined if valid.
 *
 * @param data - Parsed JSON data to validate
 * @returns LabelValidationError if invalid, undefined if valid
 */
export function validateSchema(data: unknown): LabelValidationError | undefined {
  const isValid = validateLabelsSchema(data);

  if (isValid) {
    return undefined;
  }

  // Get first error (allErrors: false means only one error)
  const errors = validateLabelsSchema.errors || [];
  if (errors.length === 0) {
    return {
      code: 'invalid_labels_schema',
      message: 'Labels file does not match required structure',
      hint: 'Check the schema documentation for correct format',
    };
  }

  const firstError = errors[0];
  const formattedMessage = formatValidationError(firstError, data);

  return {
    code: 'invalid_labels_schema',
    message: formattedMessage,
    hint: 'See schema documentation for required fields and types',
    details: JSON.stringify(firstError, null, 2),
  };
}

/**
 * Validate labels JSON content (parse + schema validation)
 *
 * Parses JSON string, catches syntax errors, and validates against schema.
 * This is the primary validation function used by the compiler pipeline.
 *
 * @param jsonContent - Raw JSON string content
 * @param filePath - File path for error reporting
 * @returns LabelValidationError if invalid, undefined if valid
 */
export function validateLabelsJSON(
  jsonContent: string,
  filePath: string
): LabelValidationError | undefined {
  // Step 1: Parse JSON (catch syntax errors)
  let data: unknown;
  try {
    data = JSON.parse(jsonContent);
  } catch (error) {
    const parseError = error as SyntaxError;
    return {
      code: 'invalid_labels_json',
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
