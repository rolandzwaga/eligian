/**
 * Timeline Event Validation Rules for Typir Integration
 *
 * Registers validation rules for timeline events that check:
 * - TimedEvent: startTime ≥ 0, endTime > startTime
 * - SequenceBlock: duration > 0
 * - StaggerBlock: delay > 0
 *
 * NOTE: Overlap detection is NOT implemented - overlapping events are intentionally allowed per spec.
 *
 * @module type-system-typir/validation/event-validation
 */

import type { ValidationProblemAcceptor } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type {
  SequenceBlock,
  StaggerBlock,
  TimedEvent,
  TimeExpression,
} from '../../generated/ast.js';
import { RELATIVE_DURATION_MESSAGE } from '../../utils/time-units.js';
import type { EligianSpecifics } from '../eligian-specifics.js';
import {
  containsRelativeTime,
  extractTimeValue,
  parseTimeRange,
} from '../utils/time-expression.js';

/**
 * Register timeline event validation rules with Typir
 *
 * Registers validation rules for:
 * 1. TimedEvent: Validate time range constraints
 * 2. SequenceBlock: Validate duration is positive
 * 3. StaggerBlock: Validate delay is positive
 *
 * @param typir - Typir services for validation rule registration
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * registerEventValidation(typirServices);
 * ```
 */
export function registerEventValidation(typir: TypirLangiumServices<EligianSpecifics>): void {
  typir.validation.Collector.addValidationRulesForAstNodes({
    /**
     * Validate TimedEvent time range
     *
     * Rules:
     * - startTime must be >= 0 (no negative times)
     * - endTime must be > startTime (positive duration)
     *
     * @example
     * ```eligian
     * at -1s..5s selectElement("#box")  // ERROR: negative start time
     * at 5s..2s selectElement("#box")   // ERROR: end before start
     * at 0s..5s selectElement("#box")   // OK
     * ```
     */
    TimedEvent: (node: TimedEvent, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      const { start, end, duration } = parseTimeRange(node.timeRange);

      // Check for negative start time (only when statically known)
      if (start !== undefined && start < 0) {
        accept({
          severity: 'error',
          message: `Timeline event start time cannot be negative (got ${start}s)`,
          languageNode: node,
          languageProperty: 'timeRange',
        });
      }

      // `at <start> for <duration>`: the duration must be a positive length
      if (node.timeRange?.duration) {
        if (containsRelativeTime(node.timeRange.duration)) {
          accept({
            severity: 'error',
            message: RELATIVE_DURATION_MESSAGE,
            languageNode: node,
            languageProperty: 'timeRange',
          });
        } else if (duration !== undefined && duration <= 0) {
          accept({
            severity: 'error',
            message: `Timeline event duration must be greater than 0 (got ${duration}s)`,
            languageNode: node,
            languageProperty: 'timeRange',
          });
        }
        return;
      }

      // Check for end time not after start time. `duration` is known for absolute
      // ranges and for ranges whose ends are both relative (`+0s..+5s`); ranges with
      // a property-chain or mixed absolute/relative end are left to runtime.
      if (duration !== undefined && duration <= 0) {
        const endText = describeTime(end, node.timeRange?.end);
        const startText = describeTime(start, node.timeRange?.start);
        accept({
          severity: 'error',
          message: `Timeline event end time (${endText}) must be greater than start time (${startText})`,
          languageNode: node,
          languageProperty: 'timeRange',
        });
      }
    },

    /**
     * Validate SequenceBlock duration
     *
     * Rules:
     * - Each sequence item duration must be > 0
     *
     * @example
     * ```eligian
     * sequence {
     *   fadeIn() for -2s  // ERROR: negative duration
     *   fadeIn() for 0s   // ERROR: zero duration
     *   fadeIn() for 2s   // OK
     * }
     * ```
     */
    SequenceBlock: (node: SequenceBlock, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Validate each sequence item's duration
      for (const item of node.items) {
        const duration = extractTimeValue(item.duration);

        // Skip durations that are not statically known (relative / property chain)
        if (duration !== undefined && duration <= 0) {
          accept({
            severity: 'error',
            message: `Sequence item duration must be positive (got ${duration}s)`,
            languageNode: item,
            languageProperty: 'duration',
          });
        }
      }
    },

    /**
     * Validate StaggerBlock delay
     *
     * Rules:
     * - delay must be > 0 (no instant stagger)
     * - duration must be > 0
     *
     * @example
     * ```eligian
     * stagger 0s items with fadeIn() for 1s   // ERROR: zero delay
     * stagger 200ms items with fadeIn() for -1s  // ERROR: negative duration
     * stagger 200ms items with fadeIn() for 1s   // OK
     * ```
     */
    StaggerBlock: (node: StaggerBlock, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      const delay = extractTimeValue(node.delay);
      const duration = extractTimeValue(node.duration);

      // Check for non-positive delay (skipped when not statically known)
      if (delay !== undefined && delay <= 0) {
        accept({
          severity: 'error',
          message: `Stagger delay must be greater than 0 (got ${delay}s)`,
          languageNode: node,
          languageProperty: 'delay',
        });
      }

      // Check for non-positive duration (skipped when not statically known)
      if (duration !== undefined && duration <= 0) {
        accept({
          severity: 'error',
          message: `Stagger duration must be positive (got ${duration}s)`,
          languageNode: node,
          languageProperty: 'duration',
        });
      }
    },
  });
}

/**
 * Render a time for a diagnostic: seconds when statically known, otherwise the
 * source text (e.g. `+5s` for a relative time).
 */
function describeTime(seconds: number | undefined, expr: TimeExpression | undefined): string {
  if (seconds !== undefined) {
    return `${seconds}s`;
  }
  return expr?.$cstNode?.text ?? 'unknown';
}
