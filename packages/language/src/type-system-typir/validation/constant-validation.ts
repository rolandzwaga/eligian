/**
 * Constant Declaration Validation Rules for Typir Integration
 *
 * Registers validation rules for constant declarations that detect:
 * - Reserved keyword collisions (const if = 5, const timeline = "test", etc.)
 * - Reference cycles (const a = @a, const a = @b + const b = @a)
 *
 * @module type-system-typir/validation/constant-validation
 */

import type { ValidationProblemAcceptor } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { VariableDeclaration } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';
import { RESERVED_KEYWORDS } from '../types/typir-types.js';
import { findConstCycle, formatConstCycle } from '../utils/const-cycles.js';

/**
 * Register constant validation rules with Typir
 *
 * Registers validation rules for:
 * 1. VariableDeclaration: Check constant name against RESERVED_KEYWORDS set
 * 2. VariableDeclaration: Report a const whose value refers back to itself
 *
 * @param typir - Typir services for validation rule registration
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * registerConstantValidation(this.typirServices);
 * ```
 */
export function registerConstantValidation(typir: TypirLangiumServices<EligianSpecifics>): void {
  typir.validation.Collector.addValidationRulesForAstNodes({
    /**
     * Validate VariableDeclaration for reserved keyword collisions
     *
     * Checks that the constant name is not a reserved keyword like 'if', 'else', 'for', etc.
     *
     * @example
     * ```eligian
     * // ❌ Error: Reserved keyword collision
     * const if = 5
     *
     * // ❌ Error: Reserved keyword collision
     * const timeline = "test"
     *
     * // ✅ Valid: Not a reserved keyword
     * const duration = 100
     * ```
     */
    VariableDeclaration: (
      node: VariableDeclaration,
      accept: ValidationProblemAcceptor<EligianSpecifics>
    ) => {
      const constantName = node.name;

      // Check if the constant name is a reserved keyword
      // Note: Most reserved keywords are grammar literals and will cause parser errors
      // This validation serves as defense-in-depth for future keywords
      if (RESERVED_KEYWORDS.has(constantName)) {
        accept({
          severity: 'error',
          message: `'${constantName}' is a reserved keyword and cannot be used as a constant name`,
          languageNode: node,
          languageProperty: 'name',
        });
      }

      // A const whose value (transitively) refers to itself has no value. Typir's inference
      // opts out for it (see the VariableDeclaration rule in eligian-type-system.ts), so this
      // is the diagnostic the user sees, reported on every const that is part of the cycle.
      const cycle = findConstCycle(node);
      if (cycle) {
        accept({
          severity: 'error',
          message: `Constant '${constantName}' refers to itself (${formatConstCycle(cycle)})`,
          languageNode: node,
          languageProperty: 'value',
        });
      }
    },
  });
}
