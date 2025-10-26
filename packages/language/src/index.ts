// Language core exports

// Asset loading exports (only for CLI use - minimal exports)
export { hasImports, loadProgramAssets } from './asset-loading/compiler-integration.js';

// Compiler exports (all compiler functionality is now part of language package)
export * from './compiler/index.js';
export * from './css/css-parser.js';
export * from './css/css-registry.js';
export * from './css/levenshtein.js';
export * from './css/selector-parser.js';
// LSP/Langium exports (only needed for extension language server)
export * from './eligian-module.js';
export * from './eligian-validator.js';
export { isProgram, type Program } from './generated/ast.js';
// CSS validation exports
export * from './lsp/css-notifications.js';
// AST helper exports (for language server)
export { isDefaultImport } from './utils/ast-helpers.js';

// Re-export everything from AST except TimeExpression to avoid conflict
// Export AstTimeExpression explicitly to avoid conflict with compiler's TimeExpression
