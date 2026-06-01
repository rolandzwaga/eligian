/**
 * Timeline Event Inference Rules for Typir Integration
 *
 * Registers inference rules for timeline events that automatically
 * infer TimelineEventType from TimedEvent, SequenceBlock, and StaggerBlock AST nodes.
 *
 * @module type-system-typir/inference/event-inference
 */

import { type CustomKind, InferenceRuleNotApplicable } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { SequenceBlock, StaggerBlock, TimedEvent } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';
import type { TimelineEventTypeProperties } from '../types/timeline-event-type.js';
import { extractTimeValue, parseTimeRange } from '../utils/time-expression.js';

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
  eventFactory: CustomKind<TimelineEventTypeProperties, EligianSpecifics>
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

      // Create TimelineEventType using the factory and resolve it to a finished Type.
      // create() returns a configuration chain; the inference rule must return a resolved
      // Type (or InferenceRuleNotApplicable), not the chain itself.
      const type = eventFactory
        .create({
          properties: {
            eventKind: 'timed',
            startTime,
            endTime,
            duration: 0,
            delay: 0,
          },
        })
        .finish()
        .getTypeFinal();
      return type ?? InferenceRuleNotApplicable;
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

      // Create TimelineEventType using the factory and resolve it to a finished Type.
      const type = eventFactory
        .create({
          properties: {
            eventKind: 'sequence',
            duration,
            startTime: 0,
            endTime: 0,
            delay: 0,
          },
        })
        .finish()
        .getTypeFinal();
      return type ?? InferenceRuleNotApplicable;
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

      // Create TimelineEventType using the factory and resolve it to a finished Type.
      const type = eventFactory
        .create({
          properties: {
            eventKind: 'stagger',
            delay,
            duration,
            startTime: 0,
            endTime: 0,
          },
        })
        .finish()
        .getTypeFinal();
      return type ?? InferenceRuleNotApplicable;
    },
  });
}
