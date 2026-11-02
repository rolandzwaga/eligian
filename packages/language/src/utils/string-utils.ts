/**
 * String manipulation utilities
 *
 * This module provides utilities for string operations including detecting
 * if a document offset falls within a string literal.
 */

/**
 * Determines if a given document offset falls within a string literal.
 *
 * The line containing the offset is tokenized from its start, so quotes are paired
 * (opening with closing) in source order: the closing quote of one string is never
 * mistaken for the opening quote of the next. Backslash escapes inside strings are
 * honoured, and the rest of the line after a `//` comment marker (or inside a
 * single-line block comment) is ignored. Strings never span lines, and a string
 * without a closing quote on its line does not count.
 *
 * The offset is a cursor position (between two characters): it is inside a string when
 * it is after the opening quote and at or before the closing quote.
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
  const isNewline = (char: string | undefined) => char === '\n' || char === '\r';

  let lineStart = offset;
  while (lineStart > 0 && !isNewline(text[lineStart - 1])) {
    lineStart--;
  }
  let lineEnd = offset;
  while (lineEnd < text.length && !isNewline(text[lineEnd])) {
    lineEnd++;
  }

  let i = lineStart;
  while (i < lineEnd) {
    const char = text[i];
    if (char === '"' || char === "'") {
      const open = i;
      let close = -1;
      for (let j = open + 1; j < lineEnd; j++) {
        if (text[j] === '\\') {
          j++; // skip the escaped character
        } else if (text[j] === char) {
          close = j;
          break;
        }
      }
      if (close === -1) {
        return false; // Unclosed string: nothing after it can be paired reliably
      }
      if (offset > open && offset <= close) {
        return true;
      }
      if (offset <= open) {
        return false; // Passed the offset without entering a string
      }
      i = close + 1;
    } else if (char === '/' && text[i + 1] === '/') {
      return false; // Rest of the line is a comment
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1 || end >= lineEnd) {
        return false; // Comment runs past the line
      }
      if (offset > i && offset < end + 2) {
        return false; // Inside the comment
      }
      i = end + 2;
    } else {
      i++;
    }
  }
  return false;
}
