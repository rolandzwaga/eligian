/**
 * Time Expression Utilities for Typir Integration
 *
 * Shared helpers for extracting numeric time values (in seconds) from
 * TimeExpression AST nodes and for parsing TimeRange nodes. This is the single
 * source of truth for the timeline event validation and inference rules; unit
 * conversion itself is delegated to `utils/time-units.ts`, which the compiler
 * uses too, so the IDE and the compiler agree on what `1m` or `500ms` means.
 *
 * @module type-system-typir/utils/time-expression
 */

import type { TimeExpression, TimeRange } from '../../generated/ast.js';
import { timeConstantValue } from '../../utils/time-constants.js';
import { convertTimeToSeconds } from '../../utils/time-units.js';

/**
 * A statically evaluated time, in seconds:
 *
 *   value = offset + relative * previousEventEnd
 *
 * Absolute times have `relative === 0`. A relative literal (`+2s`) is resolved
 * by the compiler against the previous event's end time, which is not known
 * here, so it is tracked symbolically as `relative === 1`.
 */
interface LinearTime {
  readonly offset: number;
  readonly relative: number;
}

/**
 * Evaluate a time expression to a {@link LinearTime}, or `undefined` when its
 * value cannot be known statically (property-chain references such as
 * `$globaldata.x`, division by zero, products of two relative times).
 */
function evaluateLinearTime(timeExpr: TimeExpression | undefined): LinearTime | undefined {
  if (!timeExpr) {
    return undefined;
  }

  switch (timeExpr.$type) {
    case 'TimeLiteral':
      return { offset: convertTimeToSeconds(timeExpr.value, timeExpr.unit), relative: 0 };

    case 'RelativeTimeLiteral':
      return { offset: convertTimeToSeconds(timeExpr.value, timeExpr.unit), relative: 1 };

    case 'BinaryTimeExpression': {
      const left = evaluateLinearTime(timeExpr.left);
      const right = evaluateLinearTime(timeExpr.right);
      if (!left || !right) {
        return undefined;
      }
      switch (timeExpr.op) {
        case '+':
          return { offset: left.offset + right.offset, relative: left.relative + right.relative };
        case '-':
          return { offset: left.offset - right.offset, relative: left.relative - right.relative };
        case '*':
          if (left.relative === 0) {
            return { offset: left.offset * right.offset, relative: left.offset * right.relative };
          }
          if (right.relative === 0) {
            return { offset: left.offset * right.offset, relative: left.relative * right.offset };
          }
          return undefined;
        case '/':
          if (right.relative !== 0 || right.offset === 0) {
            return undefined;
          }
          return { offset: left.offset / right.offset, relative: left.relative / right.offset };
        default:
          return undefined;
      }
    }

    case 'VariableReference': {
      // Idea #10: a time constant (`@beat`)
      const constant = timeConstantValue(timeExpr);
      return constant.error === undefined ? { offset: constant.seconds, relative: 0 } : undefined;
    }

    default:
      // PropertyChainReference: runtime value, not statically known.
      // EventTimeReference (`intro.end`): needs the times of earlier events
      // (resolved by compiler/transformers/time-resolver.ts), not known here.
      return undefined;
  }
}

/**
 * Extract the absolute time value (in seconds) of a TimeExpression AST node.
 *
 * Handles every unit (ms, s, m, h) and arithmetic between time expressions.
 *
 * @param timeExpr - TimeExpression AST node
 * @returns Time value in seconds, or `undefined` when it is not statically
 *          known (relative times like `+2s`, `$globaldata.x` references, or a
 *          missing node). Callers must skip their checks in that case.
 */
export function extractTimeValue(timeExpr: TimeExpression | undefined): number | undefined {
  const time = evaluateLinearTime(timeExpr);
  return time && time.relative === 0 ? time.offset : undefined;
}

/**
 * Statically known values of a TimeRange, all in seconds.
 */
export interface TimeRangeValues {
  /** Absolute start time, or `undefined` if not statically known */
  readonly start: number | undefined;
  /** Absolute end time, or `undefined` if not statically known */
  readonly end: number | undefined;
  /**
   * `end - start`, or `undefined` if not statically known. This is also known
   * when both ends are relative to the same previous event (`+0s..+5s` → 5).
   */
  readonly duration: number | undefined;
}

/**
 * Parse start, end and duration from a TimeRange.
 *
 * @param timeRange - TimeRange AST node with start/end time expressions
 */
export function parseTimeRange(timeRange: TimeRange | undefined): TimeRangeValues {
  const start = evaluateLinearTime(timeRange?.start);
  if (timeRange?.duration) {
    // `at <start> for <duration>`: end = start + duration. A relative duration
    // is invalid (reported separately), so it gives no known duration.
    const length = evaluateLinearTime(timeRange.duration);
    const duration = length && length.relative === 0 ? length.offset : undefined;
    const absoluteStart = start && start.relative === 0 ? start.offset : undefined;
    return {
      start: absoluteStart,
      end:
        absoluteStart !== undefined && duration !== undefined
          ? absoluteStart + duration
          : undefined,
      duration,
    };
  }
  const end = evaluateLinearTime(timeRange?.end);
  const duration =
    start && end && start.relative === end.relative ? end.offset - start.offset : undefined;
  return {
    start: start && start.relative === 0 ? start.offset : undefined,
    end: end && end.relative === 0 ? end.offset : undefined,
    duration,
  };
}

/** True when `timeExpr` contains a relative time literal (`+2s`). */
export function containsRelativeTime(timeExpr: TimeExpression | undefined): boolean {
  if (!timeExpr) return false;
  if (timeExpr.$type === 'RelativeTimeLiteral') return true;
  if (timeExpr.$type === 'BinaryTimeExpression') {
    return containsRelativeTime(timeExpr.left) || containsRelativeTime(timeExpr.right);
  }
  return false;
}
