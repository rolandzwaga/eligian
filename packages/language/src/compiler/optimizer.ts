/**
 * Optimizer: IR → Optimized IR
 *
 * This module performs optimization passes on the Eligius IR to:
 * - Remove unreachable/dead code (events that will never trigger)
 * - Fold constants at compile time
 * - Merge adjacent/overlapping events where possible
 *
 * Design principles (Constitution VI):
 * - External API is immutable (Effect types, readonly IR)
 * - Internal mutation allowed for performance (building optimized arrays)
 * - Document all internal mutations with comments
 * - Optimizations never fail (returns Effect<EligiusIR, never>)
 */

import { Effect } from 'effect';
import type { EligiusIR, TimelineActionIR, TimelineConfigIR } from './types/eligius-ir.js';

/**
 * SA005c: Main optimization function (Updated for new IR structure)
 *
 * Orchestrates all optimization passes and returns optimized IR.
 * Note: Optimizations cannot fail, so error type is `never`.
 */
export const optimize = (ir: EligiusIR): Effect.Effect<EligiusIR, never> =>
  Effect.gen(function* (_) {
    // Run optimization passes in sequence
    let optimizedIR = ir;

    // SA005c: Dead code elimination for timeline actions
    optimizedIR = yield* _(eliminateDeadCode(optimizedIR));

    // SA005c: Constant folding (durations are already numbers, so this is a no-op for now)
    // Future: Could optimize operation data, merge adjacent actions, etc.

    return optimizedIR;
  });

/**
 * SA005c: Dead code elimination (Updated for new IR structure)
 *
 * Removes timeline actions that will never be triggered:
 * - Actions with end <= start (zero or negative duration)
 * - Actions with unreachable time ranges (start < 0)
 *
 * T068: Internal mutation for performance
 * We build new timeline arrays by filtering, which is more efficient than
 * immutable operations for large action lists.
 */
const eliminateDeadCode = (ir: EligiusIR): Effect.Effect<EligiusIR, never> =>
  Effect.sync(() => {
    // Internal mutation: Build new timelines array with optimized actions
    const optimizedTimelines: TimelineConfigIR[] = [];

    for (const timeline of ir.timelines) {
      // Filter out dead timeline actions
      const reachableActions: TimelineActionIR[] = [];

      for (const action of timeline.timelineActions) {
        const duration = action.duration;

        // Check if duration is valid (start and end are numbers in new IR)
        if (typeof duration.start !== 'number' || typeof duration.end !== 'number') {
          // Keep action if we can't determine (shouldn't happen after type-checking)
          reachableActions.push(action);
          continue;
        }

        // Remove actions with zero or negative duration
        if (duration.end <= duration.start) {
          // Dead code: action will never trigger
          continue;
        }

        // Remove actions that start at negative time
        if (duration.start < 0) {
          // Dead code: negative time is invalid
          continue;
        }

        // Action is reachable
        reachableActions.push(action);
      }

      // Add optimized timeline
      optimizedTimelines.push({
        ...timeline,
        timelineActions: reachableActions,
      });
    }

    // Return new IR with optimized timelines (external immutability)
    return {
      ...ir,
      timelines: optimizedTimelines,
    };
  });

/**
 * SA005c: Note on constant folding
 *
 * In the new IR structure, durations are already concrete numbers (not TimeExpressions).
 * The ast-transformer evaluates time expressions during transformation, so there's no
 * need for a separate constant folding pass here.
 *
 * Future optimizations could include:
 * - Merging adjacent timeline actions with the same operations
 * - Deduplicating identical operations
 * - Optimizing operation data (e.g., removing no-op animations)
 */
