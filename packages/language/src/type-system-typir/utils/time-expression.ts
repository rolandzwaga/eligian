/**
 * Time Expression Utilities for Typir Integration
 *
 * Shared helpers for extracting numeric time values (in seconds) from
 * TimeExpression AST nodes and for parsing TimeRange nodes. These were
 * previously copy-pasted character-for-character between the event
 * inference and event validation modules (analysis finding D14); this is
 * the single source of truth.
 *
 * @module type-system-typir/utils/time-expression
 */

/**
 * Extract time value from TimeExpression AST node
 *
 * For now, only handles TimeLiteral and BinaryTimeExpression. Other
 * complex time expressions are not supported yet.
 *
 * @param timeExpr - TimeExpression AST node (TimeLiteral, BinaryTimeExpression, etc.)
 * @returns Time value in seconds
 */
export function extractTimeValue(timeExpr: any): number {
  // Handle null/undefined
  if (!timeExpr) {
    return 0;
  }

  // Handle TimeLiteral (simple case: "5s", "500ms")
  if (timeExpr.$type === 'TimeLiteral') {
    const value = timeExpr.value;
    const unit = timeExpr.unit || 's'; // Default to seconds
    return unit === 'ms' ? value / 1000 : value;
  }

  // Handle BinaryTimeExpression (handles "-1s", "5s + 2s", etc.)
  if (timeExpr.$type === 'BinaryTimeExpression') {
    const leftValue = timeExpr.left ? extractTimeValue(timeExpr.left) : 0;
    const rightValue = extractTimeValue(timeExpr.right);

    switch (timeExpr.op) {
      case '+':
        return leftValue + rightValue;
      case '-':
        return leftValue - rightValue;
      case '*':
        return leftValue * rightValue;
      case '/':
        return rightValue !== 0 ? leftValue / rightValue : 0;
      default:
        return 0;
    }
  }

  // TODO: Handle RelativeTimeLiteral, PropertyChainReference
  // For now, return 0 for unsupported types
  return 0;
}

/**
 * Parse start and end times from TimeRange
 *
 * @param timeRange - TimeRange AST node with start/end time expressions
 * @returns Tuple of [startTime, endTime] in seconds
 */
export function parseTimeRange(timeRange: any): [number, number] {
  const startTime = extractTimeValue(timeRange.start);
  const endTime = extractTimeValue(timeRange.end);
  return [startTime, endTime];
}
