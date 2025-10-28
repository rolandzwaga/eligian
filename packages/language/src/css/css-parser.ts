import postcss, { type CssSyntaxError, type Root, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

/**
 * CSS source location with start/end line/column information
 *
 * NOTE: This is distinct from the unified SourceLocation type which only has
 * a single line/column. This type is needed for CSS rule locations.
 */
export interface CSSSourceLocation {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * CSS parse error (old format)
 *
 * @deprecated This interface format is deprecated.
 * For new code, use CssParseError from @eligian/language/errors instead.
 * This interface is maintained for backwards compatibility with CSS registry.
 */
export interface CSSParseError {
  message: string;
  filePath: string;
  line: number;
  column: number;
  source?: string;
}

export interface CSSParseResult {
  classes: Set<string>;
  ids: Set<string>;
  classLocations: Map<string, CSSSourceLocation>;
  idLocations: Map<string, CSSSourceLocation>;
  classRules: Map<string, string>;
  idRules: Map<string, string>;
  errors: CSSParseError[];
}

/**
 * Parse CSS content and extract classes, IDs, locations, and rules.
 *
 * Uses PostCSS to parse CSS files and postcss-selector-parser to extract
 * individual class names and ID names from selectors.
 *
 * @param cssContent - CSS file content as string
 * @param filePath - Absolute file path or URI (for error reporting)
 * @returns Parsed CSS metadata including classes, IDs, locations, rules, and errors
 *
 * @example
 * const result = parseCSS('.button { color: blue; }', 'styles.css');
 * // result.classes = Set { 'button' }
 * // result.classLocations.get('button') = { filePath: 'styles.css', startLine: 1, ... }
 */
export function parseCSS(cssContent: string, filePath: string): CSSParseResult {
  const classes = new Set<string>();
  const ids = new Set<string>();
  const classLocations = new Map<string, CSSSourceLocation>();
  const idLocations = new Map<string, CSSSourceLocation>();
  const classRules = new Map<string, string>();
  const idRules = new Map<string, string>();
  const errors: CSSParseError[] = [];

  try {
    // Parse CSS using PostCSS
    const root: Root = postcss.parse(cssContent, { from: filePath });

    // Walk through all CSS rules
    root.walkRules((rule: Rule) => {
      // Get source location for this rule
      const ruleLocation: CSSSourceLocation = {
        filePath,
        startLine: rule.source?.start?.line ?? 0,
        startColumn: rule.source?.start?.column ?? 0,
        endLine: rule.source?.end?.line ?? 0,
        endColumn: rule.source?.end?.column ?? 0,
      };

      // Get full rule text (selector + declarations)
      const ruleText = rule.toString();

      // Parse selector to extract individual classes and IDs
      try {
        const processor = selectorParser(selectors => {
          selectors.walkClasses(classNode => {
            const className = classNode.value;

            // Add to classes set
            classes.add(className);

            // Store location of first occurrence only
            if (!classLocations.has(className)) {
              classLocations.set(className, ruleLocation);
            }

            // Store rule of first occurrence only
            if (!classRules.has(className)) {
              classRules.set(className, ruleText);
            }
          });

          selectors.walkIds(idNode => {
            const idName = idNode.value;

            // Add to IDs set
            ids.add(idName);

            // Store location of first occurrence only
            if (!idLocations.has(idName)) {
              idLocations.set(idName, ruleLocation);
            }

            // Store rule of first occurrence only
            if (!idRules.has(idName)) {
              idRules.set(idName, ruleText);
            }
          });
        });

        processor.processSync(rule.selector);
      } catch (selectorError) {
        // Selector parsing error - log but continue with other rules
        // These errors are typically caused by invalid CSS selectors
        // We'll still parse what we can from the rest of the CSS
        const errorMessage =
          selectorError instanceof Error ? selectorError.message : 'Invalid selector syntax';

        errors.push({
          message: `Selector parsing error: ${errorMessage}`,
          filePath,
          line: ruleLocation.startLine,
          column: ruleLocation.startColumn,
        });
      }
    });
  } catch (error) {
    // CSS syntax error - capture details
    if (isCssSyntaxError(error)) {
      errors.push({
        message: error.reason || error.message,
        filePath: error.file ?? filePath,
        line: error.line ?? 0,
        column: error.column ?? 0,
        source: error.showSourceCode ? error.showSourceCode() : undefined,
      });
    } else {
      // Unexpected error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        message: errorMessage,
        filePath,
        line: 0,
        column: 0,
      });
    }
  }

  return {
    classes,
    ids,
    classLocations,
    idLocations,
    classRules,
    idRules,
    errors,
  };
}

/**
 * Type guard to check if error is a PostCSS CssSyntaxError
 */
function isCssSyntaxError(error: unknown): error is CssSyntaxError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'CssSyntaxError'
  );
}
