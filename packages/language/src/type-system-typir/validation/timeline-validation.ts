/**
 * Timeline Configuration Validation Rules for Typir Integration (US5)
 *
 * Registers validation rules for Timeline configurations:
 * - Video/audio providers require source (error if missing)
 * - RAF/custom providers should not have source (warning if present)
 * - Container selector must be valid CSS syntax (error if invalid)
 * - Timeline should not be empty (warning if no events)
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
 * Validate CSS selector syntax (basic character-set check)
 *
 * Accepts the common selector shapes: IDs (`#id`), classes (`.class`),
 * elements, the universal selector (`*`), attribute selectors (`[attr="x"]`),
 * pseudo-classes/functions (`:hover`, `:nth-child(2)`), compound selectors
 * (`.button.primary`), descendant/child/sibling combinators
 * (`#app .container`, `.a > .b`, `.a + .b`, `.a ~ .b`) and selector lists
 * (`.a, .b`).
 *
 * This is a permissive allowed-character check, not a full CSS parser: it
 * rejects clearly-invalid characters (`!`, `@`, `{`, `}`, etc.) and empty
 * selectors, but does not verify structural correctness.
 *
 * @param selector - CSS selector string
 * @returns true if valid, false otherwise
 */
function isValidCSSSelector(selector: string): boolean {
  // Reject empty / whitespace-only selectors (the quantifier below would
  // otherwise match a string of pure whitespace).
  if (selector.trim().length === 0) {
    return false;
  }
  // Allowed characters: identifiers (`\w`, `-`), `#`/`.` prefixes, `*`,
  // attribute selectors (`[ ] = " ' | ^ $ ~ *`), pseudo selectors (`:` and
  // function parens), combinators (`> + ~` and whitespace), and selector
  // list separators (`,`).
  const cssSelectorPattern = /^[#.\w\-:[\]=~|^$*"'()\s,>+]+$/;
  return cssSelectorPattern.test(selector);
}

/**
 * Register timeline configuration validation rules with Typir
 *
 * Registers validation rules for Timeline AST nodes:
 * 1. Provider-source consistency (video/audio require source, raf/custom should not)
 * 2. Container selector syntax validation
 * 3. Empty timeline detection
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
 * // ERROR: Invalid CSS selector
 * timeline "Demo" in "not a valid selector!!!" using raf {
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
     * - Container selector must be valid CSS syntax (error)
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

      // Rule 2: Container selector syntax
      // Guard against incomplete parses: `containerSelector` is mandatory in the
      // grammar (so the generated type is `string`), but Langium error-recovery
      // yields partial Timeline nodes with an undefined selector while the
      // document is mid-edit. The missing token is already a syntax error, so we
      // skip the CSS check here instead of throwing inside the validation rule
      // (which would abort the remaining Timeline diagnostics for this node).
      if (node.containerSelector !== undefined && !isValidCSSSelector(node.containerSelector)) {
        accept({
          severity: 'error',
          message: `Invalid CSS selector: '${node.containerSelector}'. Expected a CSS selector such as #id, .class, element, or a combination (e.g. '#app .container')`,
          languageNode: node,
          languageProperty: 'containerSelector',
        });
      }

      // Rule 3: Empty timeline detection
      if (!node.events || node.events.length === 0) {
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
