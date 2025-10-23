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

import type { Program, VariableDeclaration } from '../generated/ast.js';
import { evaluateExpression } from './expression-evaluator.js';
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
  const map: ConstantMap = new Map();

  // Traverse all global declarations (program.elements)
  for (const element of program.elements) {
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
        type: typeof evalResult.value as 'string' | 'number' | 'boolean',
        sourceLocation: extractSourceLocation(constDecl),
      };

      map.set(constDecl.name, constantValue);
    } else {
      // Cannot evaluate - log warning and skip
      // This constant will be treated as a regular variable (no folding)
      console.warn(
        `[Constant Folding] Cannot evaluate constant '${constDecl.name}': ${evalResult.error?.reason}`
      );
    }
  }

  return map;
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
