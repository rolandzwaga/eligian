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
// CSS validation exports
export * from './lsp/css-notifications.js';
// AST helper exports (for language server)
export { isDefaultImport } from './utils/ast-helpers.js';

// Re-export everything from AST except TimeExpression to avoid conflict
// Export AstTimeExpression explicitly to avoid conflict with compiler's TimeExpression
