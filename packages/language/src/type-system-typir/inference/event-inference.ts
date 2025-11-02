/**
 * Timeline Event Inference Rules for Typir Integration
 *
 * Registers inference rules for timeline events that automatically
 * infer TimelineEventType from TimedEvent, SequenceBlock, and StaggerBlock AST nodes.
 *
 * @module type-system-typir/inference/event-inference
 */

import type { TypirLangiumServices } from 'typir-langium';
import type { SequenceBlock, StaggerBlock, TimedEvent } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Extract time value from TimeExpression AST node
 *
 * For now, only handles TimeLiteral. BinaryTimeExpression and other
 * complex time expressions are not supported yet.
 *
 * @param timeExpr - TimeExpression AST node (TimeLiteral, BinaryTimeExpression, etc.)
 * @returns Time value in seconds
 */
function extractTimeValue(timeExpr: any): number {
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
function parseTimeRange(timeRange: any): [number, number] {
  const startTime = extractTimeValue(timeRange.start);
  const endTime = extractTimeValue(timeRange.end);
  return [startTime, endTime];
}

/**
 * Register timeline event inference rules with Typir
 *
 * Registers three inference rules:
 * 1. TimedEvent: Infers startTime and endTime from TimeRange
 * 2. SequenceBlock: Infers duration from SequenceItem durations
 * 3. StaggerBlock: Infers delay and duration from time expressions
 *
 * @param typir - Typir services for inference rule registration
 * @param eventFactory - CustomKind factory for creating TimelineEventType instances
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * const eventFactory = createEventTypeFactory(typir);
 * registerEventInference(typir, eventFactory);
 * ```
 */
export function registerEventInference(
  typir: TypirLangiumServices<EligianSpecifics>,
  eventFactory: any // CustomKind<TimelineEventTypeProperties, EligianSpecifics>
): void {
  // Register inference rules using the helper method
  typir.Inference.addInferenceRulesForAstNodes({
    /**
     * Infer TimelineEventType from TimedEvent AST node
     *
     * Timed events use TimeRange syntax (at 0s..5s) which specifies
     * explicit start and end times.
     *
     * @example
     * ```eligian
     * at 0s..5s selectElement("#box")
     * // => TimelineEventType { eventKind: 'timed', startTime: 0, endTime: 5 }
     * ```
     */
    TimedEvent: (node: TimedEvent) => {
      const [startTime, endTime] = parseTimeRange(node.timeRange);

      // Create TimelineEventType using the factory
      return eventFactory.create({
        eventKind: 'timed',
        startTime,
        endTime,
        duration: 0,
        delay: 0,
      });
    },

    /**
     * Infer TimelineEventType from SequenceBlock AST node
     *
     * Sequence blocks contain multiple items, each with a duration.
     * We infer a representative duration (could be first item, average, etc.)
     * For now, we use the first item's duration as representative.
     *
     * @example
     * ```eligian
     * sequence {
     *   fadeIn() for 2s
     *   fadeOut() for 1s
     * }
     * // => TimelineEventType { eventKind: 'sequence', duration: 2 }
     * ```
     */
    SequenceBlock: (node: SequenceBlock) => {
      // Get first item's duration as representative
      const firstItem = node.items[0];
      const duration = firstItem ? extractTimeValue(firstItem.duration) : 0;

      // Create TimelineEventType using the factory
      return eventFactory.create({
        eventKind: 'sequence',
        duration,
        startTime: 0,
        endTime: 0,
        delay: 0,
      });
    },

    /**
     * Infer TimelineEventType from StaggerBlock AST node
     *
     * Stagger blocks specify a delay between iterations and a duration
     * for each iteration.
     *
     * @example
     * ```eligian
     * stagger 200ms items with fadeIn() for 1s
     * // => TimelineEventType { eventKind: 'stagger', delay: 0.2, duration: 1 }
     * ```
     */
    StaggerBlock: (node: StaggerBlock) => {
      const delay = extractTimeValue(node.delay);
      const duration = extractTimeValue(node.duration);

      // Create TimelineEventType using the factory
      return eventFactory.create({
        eventKind: 'stagger',
        delay,
        duration,
        startTime: 0,
        endTime: 0,
      });
    },
  });
}
