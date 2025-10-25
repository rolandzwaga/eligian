/**
 * HTML Validator Implementation
 *
 * Validates HTML syntax using htmlparser2.
 */

import { Parser } from 'htmlparser2';
import type { IHtmlValidator } from './interfaces.js';
import type { HtmlValidationError, HtmlValidationResult } from './types.js';

/**
 * HTML validator implementation using htmlparser2
 *
 * Validates HTML syntax by checking:
 * - Empty or non-HTML content
 * - Parser errors (truly malformed HTML)
 *
 * Note: htmlparser2 mimics browser behavior and is forgiving with many HTML quirks.
 * It auto-closes optional closing tags (like <p>, <li>, etc.), which is acceptable
 * for compile-time validation. We only flag truly malformed HTML that would cause
 * runtime issues.
 */
export class HtmlValidator implements IHtmlValidator {
  /**
   * Validate HTML content
   *
   * @param html - HTML content as string
   * @returns Validation result with errors if any
   */
  validate(html: string): HtmlValidationResult {
    // Check for empty HTML
    if (!html || html.trim().length === 0) {
      return {
        valid: false,
        errors: [
          {
            message: 'HTML content is empty',
            line: 0,
            column: 0,
            hint: 'Provide valid HTML content',
          },
        ],
      };
    }

    // Check for non-HTML content (no HTML tags at all)
    if (!/<[a-zA-Z][\s\S]*>/.test(html)) {
      return {
        valid: false,
        errors: [
          {
            message: 'Content does not appear to be valid HTML (no HTML tags found)',
            line: 0,
            column: 0,
            hint: 'HTML content must include at least one HTML tag',
          },
        ],
      };
    }

    const errors: HtmlValidationError[] = [];

    const parser = new Parser(
      {
        onerror(error) {
          // Catch parser errors (truly malformed HTML)
          errors.push({
            message: `HTML parsing error: ${error.message}`,
            line: 0,
            column: 0,
            hint: 'Check for malformed HTML syntax (missing angle brackets, invalid characters)',
          });
        },
      },
      {
        lowerCaseTags: false,
        lowerCaseAttributeNames: false,
        recognizeSelfClosing: true,
        decodeEntities: true,
      }
    );

    try {
      parser.write(html);
      parser.end();
    } catch (err) {
      // Catch any exceptions during parsing
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      errors.push({
        message: `Failed to parse HTML: ${errorMessage}`,
        line: 0,
        column: 0,
        hint: 'Check HTML syntax for critical errors',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
