/**
 * TimelineEventType Factory for Typir Integration
 *
 * Creates a CustomKind type factory for timeline events that provides:
 * - Type name calculation for hover display ("TimedEvent: 0s → 5s")
 * - Type properties (eventKind, startTime, endTime, duration, delay)
 * - Integration with Typir's type system
 *
 * @module type-system-typir/types/timeline-event-type
 */

import { CustomKind } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Properties for TimelineEventType CustomKind
 *
 * Note: The index signature is required by Typir's CustomTypeProperties constraint.
 */
export interface TimelineEventTypeProperties {
  /**
   * Kind of timeline event
   * - 'timed': TimedEvent (at 0s..5s)
   * - 'sequence': SequenceBlock (sequence { ... for 2s })
   * - 'stagger': StaggerBlock (stagger 200ms items with ...)
   */
  eventKind: 'timed' | 'sequence' | 'stagger';

  /**
   * Start time in seconds (TimedEvent only)
   * Optional: undefined for sequence/stagger events
   */
  startTime?: number;

  /**
   * End time in seconds (TimedEvent only)
   * Optional: undefined for sequence/stagger events
   */
  endTime?: number;

  /**
   * Duration in seconds (SequenceBlock, StaggerBlock)
   * Optional: undefined for timed events
   */
  duration?: number;

  /**
   * Stagger delay in seconds (StaggerBlock only)
   * Optional: undefined for timed/sequence events
   */
  delay?: number;

  /**
   * Index signature required by Typir CustomTypeProperties
   * Must be: string | number | boolean | bigint | symbol | Type | arrays/maps/sets of these
   */
  [key: string]: string | number | undefined;
}

/**
 * Calculate type name for hover display
 *
 * @param props - TimelineEventType properties
 * @returns Type name string
 *
 * @example
 * ```typescript
 * calculateEventTypeName({ eventKind: 'timed', startTime: 0, endTime: 5 })
 * // Returns: "TimedEvent: 0s → 5s"
 *
 * calculateEventTypeName({ eventKind: 'sequence', duration: 2 })
 * // Returns: "SequenceEvent: 2s duration"
 *
 * calculateEventTypeName({ eventKind: 'stagger', delay: 0.2, duration: 1 })
 * // Returns: "StaggerEvent: 200ms delay, 1s duration"
 * ```
 */
function calculateEventTypeName(props: TimelineEventTypeProperties): string {
  switch (props.eventKind) {
    case 'timed':
      return `TimedEvent: ${props.startTime}s → ${props.endTime}s`;
    case 'sequence':
      return `SequenceEvent: ${props.duration}s duration`;
    case 'stagger': {
      // Format delay: show ms if < 1s, otherwise show s
      const delayStr =
        props.delay !== undefined && props.delay < 1
          ? `${props.delay * 1000}ms`
          : `${props.delay}s`;
      return `StaggerEvent: ${delayStr} delay, ${props.duration}s duration`;
    }
    default:
      return 'TimelineEvent';
  }
}

/**
 * Calculate unique type identifier for caching
 *
 * @param props - TimelineEventType properties
 * @returns Unique identifier string
 *
 * @example
 * ```typescript
 * calculateEventTypeIdentifier({ eventKind: 'timed', startTime: 0, endTime: 5 })
 * // Returns: "TimelineEvent:timed:0:5"
 * ```
 */
function calculateEventTypeIdentifier(props: TimelineEventTypeProperties): string {
  switch (props.eventKind) {
    case 'timed':
      return `TimelineEvent:timed:${props.startTime}:${props.endTime}`;
    case 'sequence':
      return `TimelineEvent:sequence:${props.duration}`;
    case 'stagger':
      return `TimelineEvent:stagger:${props.delay}:${props.duration}`;
    default:
      return 'TimelineEvent:unknown';
  }
}

/**
 * Create TimelineEventType CustomKind factory
 *
 * This factory creates Typir types for timeline events that can be used
 * for type inference, validation, and hover information.
 *
 * @param typir - Typir services for type creation
 * @returns CustomKind factory for TimelineEventType
 *
 * @example
 * ```typescript
 * const eventFactory = createEventTypeFactory(typir);
 * // Factory is now registered and can infer types from AST nodes
 * ```
 */
export function createEventTypeFactory(
  typir: TypirLangiumServices<EligianSpecifics>
): CustomKind<TimelineEventTypeProperties, EligianSpecifics> {
  return new CustomKind<TimelineEventTypeProperties, EligianSpecifics>(typir, {
    name: 'TimelineEvent',
    calculateTypeName: calculateEventTypeName,
    calculateTypeIdentifier: calculateEventTypeIdentifier,
  });
}
