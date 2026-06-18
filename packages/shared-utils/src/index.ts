// Shared utilities for Eligian DSL
// Main export file

// Error types (Phase 2)
export * from './errors.js';
// File loading utilities (Phase 4 - US2)
export * from './file-loader.js';
// Locale type guards (inlined from eligius to keep its runtime out of Node bundles)
export * from './locale-guards.js';
// Path resolution utilities (Phase 3 - US1)
export * from './path-resolver.js';
// Shared `_tag` discriminator guard
export * from './tag-guard.js';
