/**
 * Constant Folding - Build constant map from AST
 *
 * This module implements the constant detection phase of constant folding optimization.
 * It traverses the AST to identify VariableDeclaration nodes with literal values
 * and builds a map that will be used during transformation to inline constant references.
 *
 * Design principles:
 * - Only handle literal values in this initial implementation (User Story 1)
 * - Expression evaluation is deferred to User Story 3 (expression-evaluator.ts)
 * - External API is immutable (no mutation of input AST)
 * - Internal mutation allowed for building the constant map (performance)
 *
 * Related: quickstart.md Step 1, data-model.md
 */

import path from 'node:path';
import type { NamedImport, Program, VariableDeclaration } from '../generated/ast.js';
import { getElements, getHTMLImports } from '../utils/program-helpers.js';
import { constantValueType, evaluateExpression } from './expression-evaluator.js';
import { loadHTMLFile, resolveHTMLPath } from './html-import-utils.js';
import type { ConstantMap, ConstantValue } from './types/constant-folding.js';

/**
 * Build a map of all global constants from the AST
 *
 * Traverses the Program AST and identifies VariableDeclaration nodes
 * with literal values. For each literal constant, creates a ConstantValue
 * entry in the map with the constant's name, value, type, and source location.
 *
 * **Capabilities** (User Stories 1 & 3):
 * - Processes literal values (string, number, boolean)
 * - Evaluates compile-time expressions (e.g., `const SUM = 10 + 20` → 30)
 * - Supports transitive constants (e.g., `const B = A + 3` where A is known)
 * - Gracefully skips unevaluable expressions (logs warning)
 *
 * **Scope**: Only global scope (program-level declarations)
 * - Action-scoped variables (@varName) are not constants
 *
 * @param program - The Eligian program AST
 * @returns Map of constant names to their resolved values
 *
 * @example
 * ```typescript
 * const program = await parseEligian('const MESSAGE = "hello";');
 * const map = buildConstantMap(program);
 * // map.get('MESSAGE') → { name: 'MESSAGE', value: 'hello', type: 'string', ... }
 * ```
 */
export function buildConstantMap(program: Program): ConstantMap {
  return buildConstantMapWithFailures(program).constants;
}

/**
 * An HTML import that could not be resolved or read.
 */
export interface HtmlImportFailure {
  /** The import's binding name (`import page from "./x.html"` -> `page`) */
  readonly name: string;
  /** Why the import failed (missing file, unreadable, ...) */
  readonly message: string;
  /** The import node, for source-location reporting */
  readonly node: NamedImport;
}

/** Result of building the constant map, including HTML import load failures. */
export interface ConstantMapResult {
  readonly constants: ConstantMap;
  readonly failures: HtmlImportFailure[];
}

/**
 * Like {@link buildConstantMap}, but also reports HTML imports that failed to
 * load instead of swallowing them. Callers that can fail (transformAST) must
 * turn the failures into errors: otherwise `@page` silently compiles to a
 * `$globaldata.page` reference that nothing ever sets.
 */
export function buildConstantMapWithFailures(program: Program): ConstantMapResult {
  const map: ConstantMap = new Map();
  const failures: HtmlImportFailure[] = [];

  // FEATURE 015: Add HTML imports as constants (they get inlined like const)
  const htmlImports = getHTMLImports(program);
  for (const htmlImport of htmlImports) {
    try {
      // Resolve path relative to source .eligian file
      const sourceUri = program.$document?.uri?.fsPath || process.cwd();
      // Use the .eligian file's directory as the project root
      // HTML imports are resolved relative to the .eligian file that contains them
      const sourceDir = path.dirname(sourceUri);
      const absolutePath = resolveHTMLPath(htmlImport.path, sourceUri, sourceDir);

      // Load HTML content
      const htmlContent = loadHTMLFile(absolutePath);

      // Add to constant map (will be inlined wherever @variableName is used)
      const constantValue: ConstantValue = {
        name: htmlImport.name,
        value: htmlContent,
        type: 'string',
        declaration: htmlImport,
        sourceLocation: extractSourceLocation(htmlImport),
      };

      map.set(htmlImport.name, constantValue);
    } catch (error: unknown) {
      // Reported to the caller: the transformer fails with a TransformError
      failures.push({
        name: htmlImport.name,
        message: error instanceof Error ? error.message : String(error),
        node: htmlImport,
      });
    }
  }

  // Traverse all global declarations (getElements(program))
  for (const element of getElements(program)) {
    if (element.$type !== 'VariableDeclaration') {
      continue; // Skip timelines, action definitions, etc.
    }

    const constDecl = element as VariableDeclaration;

    // USER STORY 3 (T020): Use expression evaluator to handle both literals and expressions
    const evalResult = evaluateExpression(constDecl.value, map);

    if (evalResult.canEvaluate) {
      // Successfully evaluated - add to constant map
      const constantValue: ConstantValue = {
        name: constDecl.name,
        value: evalResult.value!,
        type: constantValueType(evalResult.value!),
        declaration: constDecl,
        sourceLocation: extractSourceLocation(constDecl),
      };

      map.set(constDecl.name, constantValue);
    }
    // Cannot evaluate - skip (this constant will be treated as a regular variable)
  }

  return { constants: map, failures };
}

/**
 * Extract source location from an AST node
 *
 * Extracts line, column, and file information from the node's CST
 * for error reporting and debugging.
 *
 * @param node - The AST node
 * @returns Source location object, or undefined if unavailable
 */
function extractSourceLocation(node: {
  $cstNode?: { range: { start: { line: number; character: number } } };
  $document?: { uri: { fsPath: string } };
}): ConstantValue['sourceLocation'] {
  if (!node.$cstNode) {
    return undefined;
  }

  return {
    line: node.$cstNode.range.start.line,
    column: node.$cstNode.range.start.character,
    file: node.$document?.uri.fsPath ?? 'unknown',
  };
}
