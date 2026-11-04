/**
 * Timeline Configuration Validation Rules for Typir Integration (US5)
 *
 * Registers validation rules for Timeline configurations:
 * - Timeline should not be empty (warning if no events)
 *
 * Provider-source consistency (video/audio require a source, raf/custom do not use one) is
 * checked once, by the Langium timeline validator (`checkSourceRequired` in
 * `validators/timeline-validator.ts`), not here.
 *
 * Container selector syntax is deliberately NOT checked here. The Langium timeline
 * validator (`checkTimelineContainerSelector` in `validators/timeline-validator.ts`)
 * parses the selector with the PostCSS-based selector parser and reports
 * "Invalid CSS selector syntax", so one real parser decides validity. A former
 * ASCII-only character whitelist here rejected valid selectors such as `#café`,
 * Tailwind escapes (`.sm\:flex`) and `a[href='/x']`, which blocked compilation.
 *
 * These validation rules complement existing Langium validators during
 * the migration period (parallel validation strategy per plan.md).
 *
 * @module type-system-typir/validation/timeline-validation
 */

import type { ValidationProblemAcceptor } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { Timeline } from '../../generated/ast.js';
import { diagnosticCode } from '../../validators/codes.js';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Register timeline configuration validation rules with Typir
 *
 * Registers validation rules for Timeline AST nodes: empty timeline detection.
 *
 * @param typir - Typir services for validation rule registration
 *
 * @example
 * ```eligian
 * // WARNING: Empty timeline
 * timeline "Demo" in "#app" using raf {
 * }
 * ```
 */
export function registerTimelineValidation(typir: TypirLangiumServices<EligianSpecifics>): void {
  typir.validation.Collector.addValidationRulesForAstNodes({
    /**
     * Validate Timeline configuration
     *
     * Rule: a timeline should not be empty (warning)
     */
    Timeline: (node: Timeline, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Empty timeline detection
      // A timeline with only `on enter` / `on leave` blocks (e.g. a hub) is not empty
      if ((node.events?.length ?? 0) === 0 && (node.lifecycle?.length ?? 0) === 0) {
        accept({
          severity: 'warning',
          message: 'Timeline has no events. Add at least one event inside the timeline block.',
          languageNode: node,
          languageProperty: 'events',
          code: diagnosticCode('timeline-empty'),
        });
      }
    },
  });
}
