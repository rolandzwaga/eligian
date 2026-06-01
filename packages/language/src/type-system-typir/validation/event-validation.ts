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
import type { SequenceBlock, StaggerBlock, TimedEvent } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';
import { extractTimeValue, parseTimeRange } from '../utils/time-expression.js';

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
      const [startTime, endTime] = parseTimeRange(node.timeRange);

      // Check for negative start time
      if (startTime < 0) {
        accept({
          severity: 'error',
          message: `Timeline event start time cannot be negative (got ${startTime}s)`,
          languageNode: node,
          languageProperty: 'timeRange',
        });
      }

      // Check for end time before start time
      if (endTime <= startTime) {
        accept({
          severity: 'error',
          message: `Timeline event end time (${endTime}s) must be greater than start time (${startTime}s)`,
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

        if (duration <= 0) {
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

      // Check for non-positive delay
      if (delay <= 0) {
        accept({
          severity: 'error',
          message: `Stagger delay must be greater than 0 (got ${delay}s)`,
          languageNode: node,
          languageProperty: 'delay',
        });
      }

      // Check for non-positive duration
      if (duration <= 0) {
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
