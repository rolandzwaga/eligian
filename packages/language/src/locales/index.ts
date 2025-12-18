/**
 * Locale management module for Eligian DSL.
 * Provides parsing, validation, and registry services for ILocalesConfiguration.
 *
 * @module locales
 */

// Type exports from Eligius
export type {
  ILocaleReference,
  ILocalesConfiguration,
  TLanguageCode,
  TLocaleData,
  TLocaleEntry,
} from 'eligius';

// Re-export type guard from Eligius
export { isLocaleReference } from 'eligius';
// Translation key extraction
export { extractTranslationKeys } from './translation-key-extractor.js';
// Local type exports
export {
  isLocaleData,
  isValidLocaleCode,
  type LocaleFileMetadata,
  type LocaleParseError,
  type LocaleParseOptions,
  type LocaleParseResult,
  type LocaleSourceLocation,
  type TranslationKeyMetadata,
} from './types.js';
