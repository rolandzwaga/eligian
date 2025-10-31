/**
 * Control Flow Validation Rules for Typir Integration (US4)
 *
 * Registers validation rules for control flow statements:
 * - IfStatement: Validates condition is boolean (warning if not)
 * - IfStatement: Warns on empty then branch
 * - ForStatement: Validates collection is array (error if not)
 * - ForStatement: Warns on empty body
 *
 * Note: Empty else branch validation is not implemented because the Langium AST
 * always includes the elseOps array even when no else clause exists, making it
 * impossible to distinguish between `if (x) {}` and `if (x) {} else {}`.
 *
 * @module type-system-typir/validation/control-flow-validation
 */

import type { ValidationProblemAcceptor } from 'typir';
import { isType } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { ForStatement, IfStatement } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Register control flow validation rules with Typir
 *
 * Registers validation rules for:
 * 1. IfStatement: Validate condition is boolean type
 * 2. IfStatement: Warn on empty then/else branches
 * 3. ForStatement: Validate collection is array type
 * 4. ForStatement: Warn on empty body
 *
 * @param typir - Typir services for validation rule registration
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * registerControlFlowValidation(typirServices);
 * ```
 */
export function registerControlFlowValidation(typir: TypirLangiumServices<EligianSpecifics>): void {
  typir.validation.Collector.addValidationRulesForAstNodes({
    /**
     * Validate IfStatement
     *
     * Rules:
     * - Condition should be boolean type (warning if not)
     * - Then branch should not be empty (warning if empty)
     *
     * Note: Empty else branch validation is disabled because we cannot reliably
     * detect if the 'else' keyword was present in the source (Langium AST always
     * includes elseOps array even when no else clause exists).
     *
     * @example
     * ```eligian
     * if ("string") { ... }     // WARNING: condition should be boolean
     * if (count > 5) { ... }    // OK: comparison expression is boolean
     * if (true) { }             // WARNING: empty then branch
     * if (true) { ... }         // OK: no else clause
     * ```
     */
    IfStatement: (node: IfStatement, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Check condition type
      const conditionTypeResult = typir.Inference.inferType(node.condition);
      if (isType(conditionTypeResult)) {
        const typeName = conditionTypeResult.getName();
        // Warn if condition is not boolean type
        if (typeName !== 'boolean') {
          accept({
            severity: 'warning',
            message: `If condition should be boolean type, got '${typeName}'`,
            languageNode: node,
            languageProperty: 'condition',
          });
        }
      }

      // Check for empty then branch
      if (!node.thenOps || node.thenOps.length === 0) {
        accept({
          severity: 'warning',
          message: 'If statement has empty then branch',
          languageNode: node,
          languageProperty: 'thenOps',
        });
      }

      // Check for empty else branch (only if else keyword was present)
      // Note: We only warn if elseOps exists AND is non-empty but then becomes empty,
      // or if we can detect the else keyword. For now, we check if elseOps has length > 0
      // which means the else clause was parsed. If it's empty and was parsed, that's intentional.
      // Actually, the grammar makes elseOps always present as an array, so we need to check
      // if it was explicitly written. For now, disable this check to avoid false positives.
      // TODO: Use CST to detect if 'else' keyword was actually present in source
      // if (node.elseOps.length === 0 && hasElseKeyword(node)) {
      //   accept({
      //     severity: 'warning',
      //     message: 'If statement has empty else branch',
      //     languageNode: node,
      //     languageProperty: 'elseOps',
      //   });
      // }
    },

    /**
     * Validate ForStatement
     *
     * Rules:
     * - Collection must be array type (error if not)
     * - Body should not be empty (warning if empty)
     *
     * @example
     * ```eligian
     * for (item in "string") { ... }  // ERROR: collection must be array
     * for (item in [1, 2, 3]) { ... } // OK: array literal
     * for (item in items) { ... }     // OK if items is array type
     * for (item in items) { }         // WARNING: empty body
     * ```
     */
    ForStatement: (node: ForStatement, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Check collection type
      const collectionTypeResult = typir.Inference.inferType(node.collection);
      if (isType(collectionTypeResult)) {
        const typeName = collectionTypeResult.getName();
        // Error if collection is not array type
        if (typeName !== 'array') {
          accept({
            severity: 'error',
            message: `For loop collection must be array type, got '${typeName}'`,
            languageNode: node,
            languageProperty: 'collection',
          });
        }
      }

      // Check for empty body
      if (!node.body || node.body.length === 0) {
        accept({
          severity: 'warning',
          message: 'For loop has empty body',
          languageNode: node,
          languageProperty: 'body',
        });
      }
    },
  });
}
