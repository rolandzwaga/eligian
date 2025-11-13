/**
 * String manipulation utilities
 *
 * This module provides utilities for string operations including detecting
 * if a document offset falls within a string literal.
 */

/**
 * Determines if a given document offset falls within a string literal.
 *
 * This function searches backwards from the offset to find an opening quote
 * (single or double), then searches forwards to find the matching closing quote.
 * The search stops at newline characters to avoid multi-line string confusion.
 *
 * @param text - The full document text content
 * @param offset - The document offset (0-based character position) to check
 * @returns true if offset is inside a string literal (between matching quotes), false otherwise
 *
 * @example
 * ```typescript
 * const text = 'selectElement(".button")';
 * isOffsetInStringLiteral(text, 17);  // true (inside ".button")
 * isOffsetInStringLiteral(text, 5);   // false (outside string)
 * ```
 */
export function isOffsetInStringLiteral(text: string, offset: number): boolean {
  // Simple approach: Look for nearest quote before and after cursor
  // Don't stop at structural characters - just find quotes
  let openQuote = -1;
  let closeQuote = -1;
  let quoteChar: string | null = null;

  // Search backwards for opening quote (stop at newline to avoid multi-line issues)
  for (let i = offset - 1; i >= 0; i--) {
    const char = text[i];
    if (char === '\n' || char === '\r') {
      break; // Don't search across lines
    }
    if (char === '"' || char === "'") {
      openQuote = i;
      quoteChar = char;
      break;
    }
  }

  if (openQuote === -1 || !quoteChar) {
    return false;
  }

  // Search forwards for closing quote (must match opening quote, stop at newline)
  for (let i = offset; i < text.length; i++) {
    const char = text[i];
    if (char === '\n' || char === '\r') {
      break; // Don't search across lines
    }
    if (char === quoteChar) {
      closeQuote = i;
      break;
    }
  }

  // Cursor is inside string if we found both quotes
  return openQuote !== -1 && closeQuote !== -1;
}
