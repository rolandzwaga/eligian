// Language core exports

// Re-export shared-utils error types for convenience (Feature 017 - Phase 2)
export type {
  FileNotFoundError,
  FileOperationError,
  PermissionError,
  ReadError,
  SecurityError,
} from '@eligian/shared-utils';
export {
  createFileNotFoundError,
  createPermissionError,
  createReadError,
  createSecurityError,
  isFileNotFoundError,
  isPermissionError,
  isReadError,
  isSecurityError,
} from '@eligian/shared-utils';
// Asset loading exports (only for CLI use - minimal exports)
export { hasImports, loadProgramAssets } from './asset-loading/compiler-integration.js';
// Compiler exports (all compiler functionality is now part of language package)
export * from './compiler/index.js';
export { isCssImport } from './css/css-import-paths.js';
export * from './css/css-parser.js';
export * from './css/css-registry.js';
// CSS service exports (Feature 017 - Phase 2)
export * from './css/css-service.js';
export * from './css/levenshtein.js';
export * from './css/selector-parser.js';
// LSP/Langium exports (only needed for extension language server)
export * from './eligian-module.js';
export * from './eligian-validator.js';
// Error type exports (Feature 018 - US3)
// All error types from unified namespace
// Old error locations have @deprecated warnings and re-export from here
// Migration complete - all old locations re-export from unified namespace
export * from './errors/index.js';
export {
  type EndableActionDefinition,
  type InlineEndableAction,
  isEndableActionDefinition,
  isInlineEndableAction,
  isProgram,
  type Program,
} from './generated/ast.js';
// JSDoc exports (for template generation)
export { generateJSDocContent } from './jsdoc/jsdoc-template-generator.js';
// Labels exports (for label entry quick fix - Feature 041)
export {
  generateLocaleEntry,
  isSafeTranslationKey,
  mergeLocaleEntry,
  mergeLocaleEntryWithSkipped,
} from './labels/label-entry-generator.js';
export { extractTranslationKeys } from './locales/translation-key-extractor.js';
// Shared asset notification base types (D7)
export * from './lsp/asset-notifications.js';
// Block-label detection (parse-free core + LSP request contract)
export * from './lsp/block-labels.js';
// CSS validation exports
export * from './lsp/css-notifications.js';
// Idea #15: format .eligian text headlessly (`eligian fmt`)
export {
  type FormatSourceOptions,
  type FormatSourceResult,
  formatSource,
} from './lsp/format-source.js';
// HTML validation exports
export * from './lsp/html-notifications.js';
// Locales validation exports (Feature 045: renamed from labels)
export * from './lsp/labels-notifications.js';
export { extractLocaleMetadata } from './type-system-typir/utils/locale-metadata-extractor.js';
// AST helper exports (for language server)
export { isDefaultImport } from './utils/ast-helpers.js';
// AST navigation exports (for JSDoc generation)
export { findActionBelow } from './utils/ast-navigation.js';
// Path resolution utilities (shared import-path resolution - D4)
export {
  resolveImportPathToUri,
  resolveImportRelativePath,
  stripImportQuotes,
} from './utils/path-utils.js';
export { validateLocalesJSON } from './validators/locale-import-validator.js';
// Idea #18: `eligian.validation.selectorNotInLayout` / `eligian check --selector-not-in-layout`
export {
  parseSelectorNotInLayout,
  type SelectorNotInLayout,
} from './validators/validation-settings.js';

// Re-export everything from AST except TimeExpression to avoid conflict
// Export AstTimeExpression explicitly to avoid conflict with compiler's TimeExpression
