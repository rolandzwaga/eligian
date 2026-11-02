/**
 * Timeline Configuration Validation Rules for Typir Integration (US5)
 *
 * Registers validation rules for Timeline configurations:
 * - Video/audio providers require source (error if missing)
 * - RAF/custom providers should not have source (warning if present)
 * - Timeline should not be empty (warning if no events)
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
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Register timeline configuration validation rules with Typir
 *
 * Registers validation rules for Timeline AST nodes:
 * 1. Provider-source consistency (video/audio require source, raf/custom should not)
 * 2. Empty timeline detection
 *
 * @param typir - Typir services for validation rule registration
 *
 * @example
 * ```eligian
 * // ERROR: Video without source
 * timeline "Demo" in "#app" using video {
 *   at 0s..5s fadeIn()
 * }
 *
 * // WARNING: RAF with source
 * timeline "Demo" in "#app" using raf from "./video.mp4" {
 *   at 0s..5s fadeIn()
 * }
 *
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
     * Rules:
     * - Video/audio providers MUST have source (error)
     * - RAF/custom providers should NOT have source (warning)
     * - Timeline should not be empty (warning)
     */
    Timeline: (node: Timeline, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Rule 1: Provider-source consistency
      const requiresSource = node.provider === 'video' || node.provider === 'audio';
      const hasSource = node.source !== undefined && node.source !== '';

      if (requiresSource && !hasSource) {
        // ERROR: Video/audio without source
        accept({
          severity: 'error',
          message: `Timeline provider '${node.provider}' requires a source file. Add: from "<file path>"`,
          languageNode: node,
          languageProperty: 'provider',
        });
      } else if (!requiresSource && hasSource) {
        // WARNING: RAF/custom with source
        accept({
          severity: 'warning',
          message: `Timeline provider '${node.provider}' does not use a source file. Remove: from "${node.source}"`,
          languageNode: node,
          languageProperty: 'source',
        });
      }

      // Rule 2: Empty timeline detection
      // A timeline with only `on enter` / `on leave` blocks (e.g. a hub) is not empty
      if ((node.events?.length ?? 0) === 0 && (node.lifecycle?.length ?? 0) === 0) {
        accept({
          severity: 'warning',
          message: 'Timeline has no events. Add at least one event inside the timeline block.',
          languageNode: node,
          languageProperty: 'events',
        });
      }
    },
  });
}
