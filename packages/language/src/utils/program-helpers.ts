/**
 * Program Helper Functions
 *
 * Utility functions for working with Program AST nodes after grammar refactoring.
 * The grammar now uses a unified `statements` array that can contain both imports
 * and program elements (actions, timelines, variables) in any order.
 *
 * These helpers provide backward-compatible access to imports and elements.
 */

import type {
  ActionDefinition,
  ImportStatement,
  Program,
  ProgramElement,
  Timeline,
  VariableDeclaration,
} from '../generated/ast.js';
import { isActionDefinition, isImportStatement, isProgramElement } from './ast-helpers.js';

/**
 * Get all import statements from a program
 *
 * @param program - Program AST node
 * @returns Array of import statements in document order
 */
export function getImports(program: Program): ImportStatement[] {
  return program.statements.filter(isImportStatement);
}

/**
 * Get all program elements (actions, timelines, variables) from a program
 *
 * @param program - Program AST node
 * @returns Array of program elements in document order
 */
export function getElements(program: Program): ProgramElement[] {
  return program.statements.filter(isProgramElement);
}

/**
 * Get all timelines from a program
 *
 * @param program - Program AST node
 * @returns Array of timeline nodes
 */
export function getTimelines(program: Program): Timeline[] {
  return getElements(program).filter(el => el.$type === 'Timeline') as Timeline[];
}

/**
 * Get all action definitions from a program
 *
 * @param program - Program AST node
 * @returns Array of action definition nodes
 */
export function getActions(program: Program): ActionDefinition[] {
  return getElements(program).filter(isActionDefinition);
}

/**
 * Get all variable declarations from a program
 *
 * @param program - Program AST node
 * @returns Array of variable declaration nodes
 */
export function getVariables(program: Program): VariableDeclaration[] {
  return getElements(program).filter(
    el => el.$type === 'VariableDeclaration'
  ) as VariableDeclaration[];
}
