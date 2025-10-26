/**
 * AST Helper Utilities
 *
 * Provides type guards and helper functions for working with Eligian AST nodes.
 *
 * @module ast-helpers
 */

import type { AstNode } from 'langium';
import type {
  ActionDefinition,
  DefaultImport,
  ImportStatement,
  NamedImport,
  ProgramElement,
} from '../generated/ast.js';

/**
 * Type guard for DefaultImport AST nodes
 *
 * @param node - AST node to check
 * @returns true if node is a DefaultImport, false otherwise
 *
 * @example
 * ```typescript
 * if (isDefaultImport(node)) {
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
 * }
 * ```
 */
export function isNamedImport(node: AstNode | undefined): node is NamedImport {
  return node?.$type === 'NamedImport';
}

/**
 * Type guard for ImportStatement AST nodes
 *
 * @param node - AST node to check
 * @returns true if node is an ImportStatement (DefaultImport or NamedImport), false otherwise
 *
 * @example
 * ```typescript
 * if (isImportStatement(node)) {
 *   // node is either DefaultImport or NamedImport
 * }
 * ```
 */
export function isImportStatement(node: AstNode | undefined): node is ImportStatement {
  return isDefaultImport(node) || isNamedImport(node);
}

/**
 * Type guard for ProgramElement AST nodes
 *
 * @param node - AST node to check
 * @returns true if node is a ProgramElement (ActionDefinition, Timeline, or VariableDeclaration), false otherwise
 *
 * @example
 * ```typescript
 * if (isProgramElement(node)) {
 *   // node is ActionDefinition, Timeline, or VariableDeclaration
 * }
 * ```
 */
export function isProgramElement(node: AstNode | undefined): node is ProgramElement {
  return (
    node?.$type === 'RegularActionDefinition' ||
    node?.$type === 'EndableActionDefinition' ||
    node?.$type === 'Timeline' ||
    node?.$type === 'VariableDeclaration'
  );
}

/**
 * Type guard for ActionDefinition AST nodes
 *
 * @param node - AST node to check
 * @returns true if node is an ActionDefinition (RegularActionDefinition or EndableActionDefinition), false otherwise
 *
 * @example
 * ```typescript
 * if (isActionDefinition(node)) {
 * }
 * ```
 */
export function isActionDefinition(node: AstNode | undefined): node is ActionDefinition {
  return node?.$type === 'RegularActionDefinition' || node?.$type === 'EndableActionDefinition';
}
