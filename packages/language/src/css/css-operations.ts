/**
 * Shared CSS operation-name sets.
 *
 * These identify the built-in operations whose string arguments carry CSS
 * semantics — either a bare class name (`className` parameter) or a CSS
 * selector. Both completion ([context-detection.ts](./context-detection.ts))
 * and hover ([hover-detection.ts](./hover-detection.ts)) consume these, so they
 * live here as a single source of truth.
 */

/**
 * Operations that accept className parameters
 */
export const CLASS_NAME_OPERATIONS = new Set([
  'addClass',
  'removeClass',
  'toggleClass',
  'hasClass',
]);

/**
 * Operations that accept selector parameters
 */
export const SELECTOR_OPERATIONS = new Set([
  'selectElement',
  'selectElements',
  'querySelector',
  'querySelectorAll',
]);
