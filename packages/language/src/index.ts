// Language core exports

// Asset loading exports (only for CLI use - minimal exports)
export { hasImports, loadProgramAssets } from './asset-loading/compiler-integration.js';

// Compiler exports (all compiler functionality is now part of language package)
export * from './compiler/index.js';

// LSP/Langium exports (only needed for extension language server)
export * from './eligian-module.js';
export * from './eligian-validator.js';

// Re-export everything from AST except TimeExpression to avoid conflict
// Export AstTimeExpression explicitly to avoid conflict with compiler's TimeExpression
