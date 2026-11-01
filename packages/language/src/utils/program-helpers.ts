/**
 * Program Helper Functions
 *
 * Utility functions for working with Program AST nodes after grammar refactoring.
 * The grammar now uses a unified `statements` array that can contain both imports
 * and program elements (actions, timelines, variables) in any order.
 *
 * These helpers provide backward-compatible access to imports and elements.
 */

import { type AstNode, AstUtils } from 'langium';
import type {
  ActionDefinition,
  EventActionDefinition,
  ImportStatement,
  InteractionStatement,
  LibraryImport,
  NamedImport,
  Program,
  ProgramElement,
  Timeline,
  VariableDeclaration,
} from '../generated/ast.js';
import { isInteractionStatement, isTimeline, isVariableDeclaration } from '../generated/ast.js';
import { inferAssetType } from './asset-type-inference.js';
import {
  isActionDefinition,
  isEventActionDefinition,
  isImportStatement,
  isLibraryImport,
  isNamedImport,
  isProgramElement,
} from './ast-helpers.js';

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
  return getElements(program).filter(isTimeline);
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
  return getElements(program).filter(isVariableDeclaration);
}

/**
 * Whether a named import is an HTML asset.
 *
 * An explicit `as <type>` always wins; otherwise the (case-insensitive) file extension decides,
 * exactly like `inferAssetType`. So `./a.html as css` is NOT html and `./Page.HTML` is.
 * Single source of truth shared by the constant folder and the scope provider.
 *
 * @param imp - NamedImport node
 */
export function isHtmlImport(imp: NamedImport): boolean {
  return (imp.assetType ?? inferAssetType(imp.path)) === 'html';
}

/**
 * Get all HTML named imports from a program
 *
 * @param program - Program AST node
 * @returns Array of NamedImport nodes whose effective asset type is 'html'
 */
export function getHTMLImports(program: Program): NamedImport[] {
  return getImports(program).filter(isNamedImport).filter(isHtmlImport);
}

/**
 * Get all library imports from a program (Feature 023 - User Story 2)
 *
 * @param program - Program AST node
 * @returns Array of LibraryImport nodes
 */
export function getLibraryImports(program: Program): LibraryImport[] {
  return program.statements.filter(isLibraryImport);
}
/**
 * Get all event action definitions from a program (Feature 028)
 *
 * @param program - Program AST node
 * @returns Array of event action definition nodes
 */
export function getEventActions(program: Program): EventActionDefinition[] {
  return getElements(program).filter(isEventActionDefinition);
}

/**
 * Get all interaction statements (`on click "#sel" navigate "Hub"`, `on click
 * "#play" toggle`, …) anywhere in a program or library (navigate sugar, idea #19).
 *
 * They nest arbitrarily deep (inside timelines, inline endable blocks, actions,
 * if/for bodies), so this streams the entire AST rather than only the
 * top-level elements.
 *
 * @param root - Program or library AST node (or an action of one)
 * @returns Array of interaction statement nodes
 */
export function getInteractionStatements(root: AstNode): InteractionStatement[] {
  return [...AstUtils.streamAllContents(root)].filter(isInteractionStatement);
}

/** The `navigate` interaction statements of a program (see {@link getInteractionStatements}). */
export function getNavigateStatements(program: Program): InteractionStatement[] {
  return getInteractionStatements(program).filter(statement => statement.verb === 'navigate');
}
