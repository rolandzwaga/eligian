import selectorParser from 'postcss-selector-parser';

export interface ParsedSelector {
  /**
   * All class names found in the selector (without leading '.')
   * - Preserves order (left-to-right in selector)
   * - May contain duplicates if class appears multiple times
   * - Example: ".button.primary > .button" → ['button', 'primary', 'button']
   */
  classes: string[];

  /**
   * All ID names found in the selector (without leading '#')
   * - Preserves order
   * - May contain duplicates
   */
  ids: string[];

  /**
   * Whether the selector syntax is valid
   * - true: Selector parsed successfully
   * - false: Selector has syntax errors
   */
  valid: boolean;

  /**
   * Error message (if invalid)
   * - undefined if valid === true
   * - String error message if valid === false
   */
  error?: string;
}

/**
 * Parse a CSS selector string and extract class names and IDs.
 *
 * Uses postcss-selector-parser to parse complex selectors, handling:
 * - Multiple classes: .button.primary.large
 * - IDs with classes: #header.active
 * - Combinators: .parent > .child (both validated)
 * - Pseudo-classes: .button:hover (pseudo ignored, .button extracted)
 * - Attribute selectors: .button[disabled] (attribute ignored)
 *
 * @param selector - CSS selector string (e.g., ".button.primary", "#header.active")
 * @returns Parsed selector with classes, IDs, validity, and error (if any)
 *
 * @example
 * parseSelector('.button.primary')
 * // { classes: ['button', 'primary'], ids: [], valid: true }
 *
 * parseSelector('#header.active > .menu')
 * // { classes: ['active', 'menu'], ids: ['header'], valid: true }
 *
 * parseSelector('.button[')
 * // { classes: [], ids: [], valid: false, error: "Unexpected '[' found" }
 */
export function parseSelector(selector: string): ParsedSelector {
  const classes: string[] = [];
  const ids: string[] = [];

  try {
    const processor = selectorParser(root => {
      // Walk through all class nodes in the selector
      root.walkClasses(classNode => {
        classes.push(classNode.value);
      });

      // Walk through all ID nodes in the selector
      root.walkIds(idNode => {
        ids.push(idNode.value);
      });
    });

    processor.processSync(selector);

    return { classes, ids, valid: true };
  } catch (error) {
    // Selector parsing error - return invalid result with error message
    return {
      classes: [],
      ids: [],
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid selector syntax',
    };
  }
}
