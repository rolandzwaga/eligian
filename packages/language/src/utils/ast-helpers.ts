/**
 * AST Helper Utilities
 *
 * Provides type guards and helper functions for working with Eligian AST nodes.
 *
 * @module ast-helpers
 */

import type { AstNode } from 'langium';
import type { DefaultImport, NamedImport } from '../generated/ast.js';

/**
 * Type guard for DefaultImport AST nodes
 *
 * @param node - AST node to check
 * @returns true if node is a DefaultImport, false otherwise
 *
 * @example
 * ```typescript
 * if (isDefaultImport(node)) {
 *   console.log(node.type);  // 'layout' | 'styles' | 'provider'
 *   console.log(node.path);  // './layout.html'
 * }
 * ```
 */
export function isDefaultImport(node: AstNode | undefined): node is DefaultImport {
  return node?.$type === 'DefaultImport';
}

/**
 * Type guard for NamedImport AST nodes
 *
 * @param node - AST node to check
 * @returns true if node is a NamedImport, false otherwise
 *
 * @example
 * ```typescript
 * if (isNamedImport(node)) {
 *   console.log(node.name);       // 'tooltip'
 *   console.log(node.path);       // './tooltip.html'
 *   console.log(node.assetType);  // 'html' | 'css' | 'media' | undefined
 * }
 * ```
 */
export function isNamedImport(node: AstNode | undefined): node is NamedImport {
  return node?.$type === 'NamedImport';
}
