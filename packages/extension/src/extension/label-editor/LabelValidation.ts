/**
 * Pure validation functions for label editor
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
