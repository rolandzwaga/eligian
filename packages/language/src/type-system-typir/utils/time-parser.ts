/**
 * Time Expression Parser
 *
 * Parses time expressions like "5s" or "500ms" to seconds.
 *
 * @module utils/time-parser
 */

/**
 * Parse time expression to seconds
 *
 * Supports two formats:
 * - Seconds: "5s", "1.5s", "0.5s"
 * - Milliseconds: "500ms", "1000ms", "500.5ms"
 *
 * @param expr - Time expression (e.g., "5s", "500ms")
 * @returns Time in seconds, or 0 if format is invalid
 *
 * @example
 * ```typescript
 * parseTimeExpression('5s')     // Returns: 5
 * parseTimeExpression('500ms')  // Returns: 0.5
 * parseTimeExpression('1.5s')   // Returns: 1.5
 * parseTimeExpression('invalid') // Returns: 0
 * ```
 */
export function parseTimeExpression(expr: string): number {
  // Match format: number (integer or decimal) followed by "s" or "ms"
  // ^ = start of string, $ = end of string (no extra characters allowed)
  const match = expr.match(/^(\d+(?:\.\d+)?)(s|ms)$/);

  if (!match) {
    return 0; // Invalid format
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2];

  // Convert milliseconds to seconds
  return unit === 'ms' ? value / 1000 : value;
}
