/**
 * Pure validation functions for locale editor
 * No VSCode dependencies - can be tested in isolation
 */

export interface ValidationError {
  groupId?: string;
  translationId?: string;
  field: string;
  message: string;
  code: string;
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
const LANGUAGE_CODE_REGEX = /^[a-z]{2,3}-[A-Z]{2,3}$/;
// Translation key segment: alphanumeric, underscore, hyphen (no dots - dots are separators)
const KEY_SEGMENT_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate group ID for uniqueness, emptiness, and invalid characters
 */
export function validateGroupId(
  id: string,
  existingIds: string[],
  currentGroupId?: string
): ValidationError | null {
  // Check for empty string
  if (!id || id.trim().length === 0) {
    return {
      field: 'id',
      message: 'Group ID cannot be empty',
      code: 'empty_id',
    };
  }

  // Check for invalid characters
  if (!GROUP_ID_REGEX.test(id)) {
    return {
      field: 'id',
      message: 'Group ID can only contain alphanumeric characters, hyphens, underscores, and dots',
      code: 'invalid_characters',
    };
  }

  // Check for duplicates (excluding current group if editing)
  const isDuplicate = existingIds.some(
    existingId => existingId === id && existingId !== currentGroupId
  );
  if (isDuplicate) {
    return {
      field: 'id',
      message: `Group ID '${id}' already exists`,
      code: 'duplicate_id',
    };
  }

  return null;
}

/**
 * Validate language code matches xx-XX pattern
 */
export function validateLanguageCode(code: string): ValidationError | null {
  if (!code || code.trim().length === 0) {
    return {
      field: 'languageCode',
      message: 'Language code cannot be empty',
      code: 'empty_language_code',
    };
  }

  if (!LANGUAGE_CODE_REGEX.test(code)) {
    return {
      field: 'languageCode',
      message: 'Language code must match pattern xx-XX (e.g., en-US, nl-NL)',
      code: 'invalid_language_code',
    };
  }

  return null;
}

/**
 * Validate translation key format for ILocalesConfiguration format (FR-015)
 * Keys can be nested with dots (e.g., "nav.home.button")
 * Each segment must contain only alphanumeric characters, underscores, or hyphens
 */
export function validateTranslationKey(
  key: string,
  existingKeys?: string[],
  currentKey?: string
): ValidationError | null {
  // Check for empty string
  if (!key || key.trim().length === 0) {
    return {
      field: 'key',
      message: 'Translation key cannot be empty',
      code: 'empty_key',
    };
  }

  // Check for leading/trailing dots
  if (key.startsWith('.') || key.endsWith('.')) {
    return {
      field: 'key',
      message: 'Translation key cannot start or end with a dot',
      code: 'invalid_key_format',
    };
  }

  // Split by dots and validate each segment
  const segments = key.split('.');

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Check for empty segments (consecutive dots)
    if (segment.length === 0) {
      return {
        field: 'key',
        message: 'Translation key cannot contain empty segments (consecutive dots)',
        code: 'empty_key_segment',
      };
    }

    // Check segment characters
    if (!KEY_SEGMENT_REGEX.test(segment)) {
      return {
        field: 'key',
        message: `Key segment '${segment}' contains invalid characters. Only alphanumeric characters, underscores, and hyphens are allowed`,
        code: 'invalid_key_characters',
      };
    }
  }

  // Check for duplicates if existingKeys provided
  if (existingKeys) {
    const isDuplicate = existingKeys.some(
      existingKey => existingKey === key && existingKey !== currentKey
    );
    if (isDuplicate) {
      return {
        field: 'key',
        message: `Translation key '${key}' already exists`,
        code: 'duplicate_key',
      };
    }
  }

  return null;
}

/**
 * Validate label text is non-empty
 */
export function validateLabelText(text: string): ValidationError | null {
  if (!text || text.trim().length === 0) {
    return {
      field: 'label',
      message: 'Label text cannot be empty',
      code: 'empty_label',
    };
  }

  return null;
}

/**
 * Validate UUID is in valid v4 format
 */
export function validateUUID(uuid: string): boolean {
  return UUID_V4_REGEX.test(uuid);
}

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Validate label file schema structure (T056 - User Story 6)
 * Returns error message if invalid, null if valid
 */
export function validateLabelFileSchema(data: unknown): string | null {
  // Check if data is an array
  if (!Array.isArray(data)) {
    return 'Label file must be a JSON array';
  }

  // Check if array is empty
  if (data.length === 0) {
    // Empty array is valid (no labels yet)
    return null;
  }

  // Validate each group
  for (let i = 0; i < data.length; i++) {
    const group = data[i];

    // Check if group is an object
    if (typeof group !== 'object' || group === null) {
      return `Label group at index ${i} must be an object`;
    }

    // Check required fields: id and labels
    if (!('id' in group)) {
      return `Label group at index ${i} is missing required field 'id'`;
    }

    if (!('labels' in group)) {
      return `Label group at index ${i} is missing required field 'labels'`;
    }

    // Validate id is a string
    if (typeof group.id !== 'string') {
      return `Label group at index ${i}: 'id' must be a string`;
    }

    // Validate labels is an array
    if (!Array.isArray(group.labels)) {
      return `Label group at index ${i}: 'labels' must be an array`;
    }

    // Validate each translation in the group
    for (let j = 0; j < group.labels.length; j++) {
      const translation = group.labels[j];

      // Check if translation is an object
      if (typeof translation !== 'object' || translation === null) {
        return `Translation at index ${j} in group '${group.id}' must be an object`;
      }

      // Check required fields: id, languageCode, label
      if (!('id' in translation)) {
        return `Translation at index ${j} in group '${group.id}' is missing required field 'id'`;
      }

      if (!('languageCode' in translation)) {
        return `Translation at index ${j} in group '${group.id}' is missing required field 'languageCode'`;
      }

      if (!('label' in translation)) {
        return `Translation at index ${j} in group '${group.id}' is missing required field 'label'`;
      }

      // Validate field types
      if (typeof translation.id !== 'string') {
        return `Translation at index ${j} in group '${group.id}': 'id' must be a string`;
      }

      if (typeof translation.languageCode !== 'string') {
        return `Translation at index ${j} in group '${group.id}': 'languageCode' must be a string`;
      }

      if (typeof translation.label !== 'string') {
        return `Translation at index ${j} in group '${group.id}': 'label' must be a string`;
      }
    }
  }

  return null;
}
