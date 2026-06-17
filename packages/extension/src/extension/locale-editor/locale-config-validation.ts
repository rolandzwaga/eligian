/**
 * Locale editor validation + legacy parsing helpers.
 *
 * Pure functions extracted verbatim from {@link LocaleEditorProvider} (W3
 * decomposition): legacy label parsing (with UUID auto-fix), legacy label
 * validation, and recursive ILocalesConfiguration validation.
 */

import type { ILocalesConfiguration } from 'eligius';
import {
  generateUUID,
  validateGroupId,
  validateLabelText,
  validateLanguageCode,
  validateUUID,
} from './LocaleValidation.js';
import type { LabelGroup, LocaleValidationError, ValidationError } from './types.js';

/**
 * Parse JSON text into LabelGroup array.
 * Handles malformed JSON gracefully.
 * Auto-fixes missing or invalid UUIDs on translations.
 *
 * @param text - Raw JSON text from TextDocument
 * @returns Parsed label groups or empty array on error
 */
export function parseLabels(text: string): LabelGroup[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const labels = parsed as LabelGroup[];

      // Auto-fix missing or invalid UUIDs (User Story 3)
      for (const group of labels) {
        if (group.labels && Array.isArray(group.labels)) {
          for (const translation of group.labels) {
            // Check if UUID is missing or invalid
            if (!translation.id || !validateUUID(translation.id)) {
              translation.id = generateUUID();
            }
          }
        }
      }

      // If we auto-fixed UUIDs, the webview will receive updated data
      // and send an 'update' message to sync the document
      return labels;
    }
    return [];
  } catch (error) {
    console.error('Failed to parse label JSON:', error);
    return [];
  }
}

/**
 * Validate ILocalesConfiguration.
 */
export function validateLocaleConfig(config: ILocalesConfiguration): LocaleValidationError[] {
  const errors: LocaleValidationError[] = [];

  for (const [locale, data] of Object.entries(config)) {
    // Validate locale code format
    const langError = validateLanguageCode(locale);
    if (langError) {
      errors.push({
        locale,
        field: 'locale',
        message: langError.message,
        code: langError.code,
      });
    }

    // Validate translation values recursively
    validateLocaleData(data, locale, '', errors);
  }

  return errors;
}

/**
 * Recursively validate locale data.
 */
function validateLocaleData(
  data: unknown,
  locale: string,
  keyPath: string,
  errors: LocaleValidationError[]
): void {
  if (typeof data === 'object' && data !== null && !('$ref' in data)) {
    for (const [key, value] of Object.entries(data)) {
      const fullKey = keyPath ? `${keyPath}.${key}` : key;

      if (typeof value === 'string') {
        const labelError = validateLabelText(value);
        if (labelError) {
          errors.push({
            key: fullKey,
            locale,
            field: 'label',
            message: labelError.message,
            code: labelError.code,
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        validateLocaleData(value, locale, fullKey, errors);
      }
    }
  }
}

/**
 * Validate labels array
 */
export function validateLabels(labels: LabelGroup[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const groupIds = labels.map(g => g.id);

  for (const group of labels) {
    // Validate group ID (pass current group ID to exclude from duplicate check)
    const groupIdError = validateGroupId(group.id, groupIds, group.id);
    if (groupIdError) {
      errors.push({ ...groupIdError, groupId: group.id });
    }

    // Validate translations
    for (const translation of group.labels) {
      const langError = validateLanguageCode(translation.languageCode);
      if (langError) {
        errors.push({
          ...langError,
          groupId: group.id,
          translationId: translation.id,
        });
      }

      const labelError = validateLabelText(translation.label);
      if (labelError) {
        errors.push({
          ...labelError,
          groupId: group.id,
          translationId: translation.id,
        });
      }
    }
  }

  return errors;
}
