/**
 * Constant Declaration Validation Rules for Typir Integration
 *
 * Registers validation rules for constant declarations that detect:
 * - Reserved keyword collisions (const if = 5, const timeline = "test", etc.)
 *
 * @module type-system-typir/validation/constant-validation
 */

import type { ValidationProblemAcceptor } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { VariableDeclaration } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';
import { RESERVED_KEYWORDS } from '../types/typir-types.js';

/**
 * Register constant validation rules with Typir
 *
 * Registers validation rules for:
 * 1. VariableDeclaration: Check constant name against RESERVED_KEYWORDS set
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
    },
  });
}
