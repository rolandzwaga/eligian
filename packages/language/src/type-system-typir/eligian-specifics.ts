import type { TypirLangiumSpecifics } from 'typir-langium';
import type { EligianAstType } from '../generated/ast.js';

/**
 * Eligian-specific type definitions for Typir integration.
 *
 * This interface extends TypirLangiumSpecifics to provide Eligian's AST types
 * to the Typir type system, enabling type checking and inference for Eligian programs.
 */
export interface EligianSpecifics extends TypirLangiumSpecifics {
  AstTypes: EligianAstType;
}

// Re-export enhanced type definitions
export type {
  AssetType,
  ImportType,
  TimelineEventType,
  TimelineType,
} from './types/typir-types.js';

// Re-export utility functions
export { inferAssetTypeFromExtension } from './utils/asset-type-inferrer.js';
export { parseTimeExpression } from './utils/time-parser.js';
