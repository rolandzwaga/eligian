/**
 * Pipeline: Shared Langium service management
 *
 * Creating Langium services is expensive. We reuse a single instance across
 * all parse calls for better performance and to prevent memory exhaustion
 * when running many tests. The singleton is stateful (CSS registry, document
 * cache); callers must clear document-specific state before each compilation.
 */

import { EmptyFileSystem } from 'langium';
import { createEligianServices } from '../../eligian-module.js';

/**
 * Singleton Langium service instance
 *
 * Creating Langium services is expensive. We reuse a single instance across
 * all parse calls for better performance and to prevent memory exhaustion
 * when running many tests.
 *
 * STATE MANAGEMENT:
 * - CSS registry state persists across compilations (singleton retains state)
 * - Each parseSource() call MUST clear document-specific state via clearDocument()
 * - See explicit state reset in parseSource() before parsing
 * - This ensures compilation isolation and prevents state pollution
 */
let sharedServices: ReturnType<typeof createEligianServices> | undefined;

/**
 * Get or create singleton Langium service instance
 *
 * NOTE: Services are stateful (CSS registry, document cache). Callers must
 * explicitly clear document state via services.Eligian.css.CSSRegistry.clearDocument()
 * before each compilation to ensure independence.
 *
 * Exported for testing purposes (parity-helpers.ts needs access to shared services)
 */
export function getOrCreateServices() {
  if (!sharedServices) {
    sharedServices = createEligianServices(EmptyFileSystem);

    // Seed the CSS registry with the fixture classes/IDs used across the test
    // suite ONLY when running under Vitest. In production these phantom classes
    // would be injected into the shared singleton and make real user documents
    // pass CSS-class validation against classes their stylesheets never define
    // (a false negative). Tests rely on this seeding, so it is gated, not removed.
    if (process.env.VITEST) {
      registerTestCSSFixtures(sharedServices);
    }
  }
  return sharedServices;
}

/**
 * Seed the shared CSS registry with the class/ID names referenced by test
 * fixtures so they don't trip CSS-class validation. Test-only — gated behind
 * the Vitest environment in {@link getOrCreateServices}.
 *
 * Registered under both `file:///styles.css` and `file:///memory/styles.css`
 * because `ensureCSSImportsRegistered` resolves test documents
 * (`file:///memory/source-N.eligian`) such that `"./styles.css"` becomes
 * `file:///memory/styles.css`.
 */
function registerTestCSSFixtures(services: ReturnType<typeof createEligianServices>): void {
  const cssRegistry = services.Eligian.css.CSSRegistry;
  const cssMetadata = {
    classes: new Set([
      'test-container',
      'presentation-container',
      'infographic-container',
      'chart',
      'content',
      'details',
      'visible',
      'annotation',
      'highlight',
      'container',
      'button',
      'parent',
      'child',
      'new-class',
      'temp-class',
      'invalid1',
      'invalid2',
      'invalid3',
    ]),
    ids: new Set(['title', 'subtitle', 'content', 'credits', 'box', 'test', 'container', 'header']),
    classLocations: new Map(),
    idLocations: new Map(),
    classRules: new Map(),
    idRules: new Map(),
    errors: [],
  };
  cssRegistry.updateCSSFile('file:///styles.css', cssMetadata);
  cssRegistry.updateCSSFile('file:///memory/styles.css', cssMetadata);
}
