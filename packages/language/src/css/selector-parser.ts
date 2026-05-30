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
/**
 * A class or ID found in a selector, with its character span in the source string.
 */
export interface SelectorIdentifier {
  type: 'class' | 'id';
  /** Identifier name without the leading '.'/'#' prefix */
  name: string;
  /** Offset of the prefix character ('.'/'#') within the selector string */
  start: number;
  /** Offset one past the last character of the identifier */
  end: number;
}

/**
 * Parse a CSS selector and return every class/ID with its source character span.
 *
 * Uses postcss-selector-parser node `sourceIndex` values, which point at the
 * leading prefix character ('.' for classes, '#' for IDs). This enables precise,
 * cursor-position-aware hover detection in compound selectors like `.button.primary`.
 *
 * @param selector - CSS selector string
 * @returns Identifiers in source order; empty array on parse failure
 */
export function parseSelectorIdentifiers(selector: string): SelectorIdentifier[] {
  const identifiers: SelectorIdentifier[] = [];

  try {
    const processor = selectorParser(root => {
      root.walkClasses(node => {
        identifiers.push({
          type: 'class',
          name: node.value,
          start: node.sourceIndex,
          end: node.sourceIndex + 1 + node.value.length,
        });
      });
      root.walkIds(node => {
        identifiers.push({
          type: 'id',
          name: node.value,
          start: node.sourceIndex,
          end: node.sourceIndex + 1 + node.value.length,
        });
      });
    });

    processor.processSync(selector);
  } catch {
    return [];
  }

  return identifiers;
}

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
