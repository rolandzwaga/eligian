/**
 * Public exports for language block quick fix module
 */

export { FilePositionHelper } from './file-position-helper.js';
export {
  generateLabelEntry,
  type LabelEntry,
  type TranslationEntry,
} from './label-entry-generator.js';
export { LabelsParser } from './labels-parser.js';
export { LanguageBlockCodeActionProvider } from './language-block-code-actions.js';
export { LanguageBlockGenerator } from './language-block-generator.js';

export type {
  InsertionPosition,
  LanguageBlockGenerationResult,
  LanguageBlockQuickFixContext,
  LanguageCodeInfo,
  ParsedLabelsFile,
} from './types.js';

export {
  DEFAULT_LABEL_TEXT,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_LANGUAGE_MARKER,
  extractLanguageCodes,
  isValidLanguageCode,
  LANGUAGE_BLOCK_TRAILING_NEWLINES,
  LANGUAGE_ENTRY_INDENT,
} from './types.js';
