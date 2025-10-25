/**
 * CSS Validator Implementation
 *
 * Validates CSS syntax using PostCSS for strict syntax validation.
 * css-tree is kept as a dependency for future class name extraction features.
 */

import postcss from 'postcss';
import type { ICssValidator } from './interfaces.js';
import type { CssValidationError, CssValidationResult } from './types.js';

/**
 * CSS validator implementation using PostCSS
 *
 * Validates CSS syntax by attempting to parse with PostCSS and catching CssSyntaxError.
 * PostCSS is stricter than css-tree and catches unclosed braces, missing brackets, etc.
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
      // Parse CSS with PostCSS
      // PostCSS will throw CssSyntaxError for invalid CSS
      postcss.parse(css, {
        from: undefined, // No source file (in-memory validation)
      });
    } catch (err) {
      // Handle CSS syntax errors
      if (err instanceof Error && err.name === 'CssSyntaxError') {
        // PostCSS CssSyntaxError has line, column, and reason properties
        const syntaxError = err as any; // Type as any to access PostCSS error properties

        // Extract line and column from error
        const line = syntaxError.line || 0;
        const column = syntaxError.column || 0;

        // Use PostCSS's reason property for the error message
        const message = syntaxError.reason || syntaxError.message || 'CSS syntax error';

        // Generate helpful hint based on error message
        const hint = this.generateHint(message);

        errors.push({
          message,
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
   * Generate helpful hint based on error message
   *
   * @param errorMessage - Error message from PostCSS
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
