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
import type { EligiusIR } from './types/eligius-ir.js';

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
 * T284: Dead code elimination for new EligiusIR structure
 *
 * Removes timeline actions that will never be triggered:
 * - Actions with end <= start (zero or negative duration)
 * - Actions with unreachable time ranges (start < 0)
 *
 * Note: Now operates on ir.config.timelines (ITimelineConfiguration[])
 * since the transformer builds IEngineConfiguration directly (T281).
 *
 * Constitution VI: Internal mutation for performance
 * We build new timeline arrays by filtering, which is more efficient than
 * immutable operations for large action lists.
 */
const eliminateDeadCode = (ir: EligiusIR): Effect.Effect<EligiusIR, never> =>
  Effect.sync(() => {
    // T284: Access timelines from ir.config.timelines
    const optimizedTimelines = ir.config.timelines.map(timeline => {
      // Filter out dead timeline actions
      const reachableActions = timeline.timelineActions.filter(action => {
        const duration = action.duration;

        // Check if duration is valid (should always be true after transformer)
        if (typeof duration.start !== 'number' || typeof duration.end !== 'number') {
          // Keep action if we can't determine (shouldn't happen)
          return true;
        }

        // Remove actions with zero or negative duration
        if (duration.end <= duration.start) {
          // Dead code: action will never trigger
          return false;
        }

        // Remove actions that start at negative time
        if (duration.start < 0) {
          // Dead code: negative time is invalid
          return false;
        }

        // Action is reachable
        return true;
      });

      // Return optimized timeline with filtered actions
      return {
        ...timeline,
        timelineActions: reachableActions,
      };
    });

    // Return new IR with optimized config (external immutability)
    return {
      ...ir,
      config: {
        ...ir.config,
        timelines: optimizedTimelines,
      },
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
