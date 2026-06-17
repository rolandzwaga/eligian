/**
 * Time-expression transformation and evaluation.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import type { TimeExpression as AstTimeExpression } from '../../generated/ast.js';
import type { TimeExpression } from '../types/eligius-ir.js';
import { getSourceLocation } from './source-location.js';

/**
 * Transform TimeExpression → TimeExpression IR
 *
 * T189: Supports relative time expressions (+2s) by adding offset to previousEventEndTime
 */
export const transformTimeExpression = (
  expr: AstTimeExpression,
  previousEventEndTime: number = 0
): Effect.Effect<TimeExpression, TransformError> =>
  Effect.gen(function* () {
    switch (expr.$type) {
      case 'TimeLiteral': {
        // Convert time value to seconds based on unit
        const valueInSeconds = convertTimeToSeconds(expr.value, expr.unit);
        return {
          kind: 'literal' as const,
          value: valueInSeconds,
        };
      }
      case 'RelativeTimeLiteral': {
        // T189: Relative time expression: +2s means previousEventEndTime + 2
        // Convert to absolute time by adding to previous event's end
        const offsetInSeconds = convertTimeToSeconds(expr.value, expr.unit);
        return {
          kind: 'literal' as const,
          value: previousEventEndTime + offsetInSeconds,
        };
      }
      case 'PropertyChainReference': {
        // Property reference in time expression
        const scope = expr.scope;
        const properties = expr.properties.join('.');
        return {
          kind: 'variable' as const,
          name: `${scope}.${properties}`,
        };
      }
      case 'BinaryTimeExpression': {
        const left = yield* transformTimeExpression(expr.left, previousEventEndTime);
        const right = yield* transformTimeExpression(expr.right, previousEventEndTime);
        return {
          kind: 'binary' as const,
          op: expr.op as '+' | '-' | '*' | '/',
          left,
          right,
        };
      }
      default:
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: `Unknown time expression type: ${(expr as any).$type}`,
          location: getSourceLocation(expr),
        });
    }
  });

/**
 * Helper: Convert time value to seconds based on unit
 *
 * Supports: ms (milliseconds), s (seconds), m (minutes), h (hours)
 * Default unit is seconds if not specified.
 */
function convertTimeToSeconds(value: number, unit?: string): number {
  if (!unit || unit === 's') {
    return value;
  }
  switch (unit) {
    case 'ms':
      return value / 1000;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    default:
      return value; // Default to seconds
  }
}

/**
 * Helper: Evaluate TimeExpression to a numeric value
 *
 * Performs constant folding for binary expressions (e.g., 10 + 5 → 15).
 * Variables are not supported yet and will throw an error.
 */
export function evaluateTimeExpression(expr: TimeExpression): number {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'variable':
      // TODO: Variable support requires a symbol table/environment
      throw new Error(`Variables not yet supported in time expressions: ${expr.name}`);
    case 'binary': {
      const left = evaluateTimeExpression(expr.left);
      const right = evaluateTimeExpression(expr.right);
      switch (expr.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
      }
    }
  }
}
