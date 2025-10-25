/**
 * CSS Validator Implementation
 *
 * Validates CSS syntax using css-tree.
 */

import { parse, type SyntaxParseError } from 'css-tree';
import type { ICssValidator } from './interfaces.js';
import type { CssValidationError, CssValidationResult } from './types.js';

/**
 * CSS validator implementation using css-tree
 *
 * Validates CSS syntax by attempting to parse with css-tree and catching errors.
 */
export class CssValidator implements ICssValidator {
  /**
   * Validate CSS content
   *
   * @param css - CSS content as string
   * @returns Validation result with errors if any
   */
  validate(css: string): CssValidationResult {
    // Empty CSS is valid (no rules)
    if (!css || css.trim().length === 0) {
      return {
        valid: true,
        errors: [],
      };
    }

    const errors: CssValidationError[] = [];

    try {
      // Parse CSS with css-tree
      // css-tree will throw CssSyntaxError for invalid CSS
      parse(css, {
        positions: true, // Include line/column positions
        parseAtrulePrelude: true, // Parse @ rule preludes
        parseCustomProperty: true, // Parse CSS custom properties (--var)
      });
    } catch (err) {
      // Handle CSS syntax errors
      if (err instanceof Error && 'name' in err && err.name === 'SyntaxError') {
        const syntaxError = err as SyntaxParseError;

        // Calculate line and column from offset
        const { line, column } = this.offsetToLineColumn(css, syntaxError.offset);

        // Generate helpful hint based on error message
        const hint = this.generateHint(syntaxError.message);

        errors.push({
          message: syntaxError.message || 'CSS syntax error',
          line,
          column,
          hint,
        });
      } else {
        // Generic parse error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push({
          message: `Failed to parse CSS: ${errorMessage}`,
          line: 0,
          column: 0,
          hint: 'Check CSS syntax for errors',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert byte offset to line and column numbers
   *
   * @param text - The CSS text
   * @param offset - Byte offset in the text
   * @returns Line and column numbers (1-indexed)
   */
  private offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let column = 1;

    for (let i = 0; i < offset && i < text.length; i++) {
      if (text[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }

    return { line, column };
  }

  /**
   * Generate helpful hint based on error message
   *
   * @param errorMessage - Error message from css-tree
   * @returns Helpful hint for the user
   */
  private generateHint(errorMessage: string): string {
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('unclosed') || lowerMessage.includes('expected')) {
      if (lowerMessage.includes('string')) {
        return 'Check for unclosed string literals (missing closing quote)';
      }
      if (lowerMessage.includes('comment')) {
        return 'Check for unclosed comments (missing */)';
      }
      if (lowerMessage.includes('}') || lowerMessage.includes('brace')) {
        return 'Check for missing closing braces in rule blocks';
      }
      return 'Check for unclosed or missing syntax elements';
    }

    if (lowerMessage.includes('property') || lowerMessage.includes('declaration')) {
      return 'Check property declarations (format: property: value;)';
    }

    if (lowerMessage.includes('selector')) {
      return 'Check CSS selector syntax';
    }

    if (lowerMessage.includes('value')) {
      return 'Check property values for correct syntax';
    }

    // Default hint
    return 'Check CSS syntax according to CSS specification';
  }
}
