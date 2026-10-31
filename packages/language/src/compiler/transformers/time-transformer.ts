/**
 * Time-expression transformation and evaluation.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import type { TimeExpression as AstTimeExpression } from '../../generated/ast.js';
import { convertTimeToSeconds } from '../../utils/time-units.js';
import type { TimeExpression } from '../types/eligius-ir.js';
import { getSourceLocation } from './source-location.js';

/**
 * Message for a property chain (`$scope.x`) used as a time. Shared by the
 * compiler (below) and the IDE validator (validators/timeline-validator.ts) so
 * both report the same wording.
 */
export function propertyChainTimeMessage(chain: { scope: string; properties: string[] }): string {
  const name = `$${chain.scope}.${chain.properties.join('.')}`;
  return `Property references are not supported in time expressions: ${name}. Use a literal time (e.g. 2s) or a constant expression.`;
}

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
        // The grammar accepts a property chain as a time, but Eligius needs
        // numeric start/end times at configuration time, so it cannot be
        // compiled. Fail with a located TransformError here: the former
        // `{ kind: 'variable' }` IR node made evaluateTimeExpression throw a raw
        // Error, which escaped the Effect pipeline as a defect.
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: propertyChainTimeMessage(expr),
          location: getSourceLocation(expr),
        });
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
 * Helper: Evaluate TimeExpression to a numeric value
 *
 * Performs constant folding for binary expressions (e.g., 10 + 5 → 15).
 *
 * `variable` nodes are never produced: {@link transformTimeExpression} rejects
 * property chains with a TransformError before any evaluation happens. The
 * guard below is an internal invariant (a compiler bug if reached), not a user
 * error path.
 */
export function evaluateTimeExpression(expr: TimeExpression): number {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'variable':
      throw new Error(
        `Internal compiler error: unresolved variable '${expr.name}' in a time expression (transformTimeExpression should have rejected it)`
      );
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
