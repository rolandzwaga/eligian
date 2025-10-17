/**
 * Type Checker: Validates Eligius-specific type constraints
 *
 * T283: Simplified for new EligiusIR structure (wraps IEngineConfiguration).
 * Now that the transformer builds IEngineConfiguration directly (T281),
 * TypeScript enforces structure at compile time. This module performs
 * minimal runtime sanity checks.
 *
 * The transformer guarantees structure correctness, so we only validate:
 * - Configuration basics (id, containerSelector, language)
 * - At least one timeline exists
 */

import { Effect } from 'effect';
import type { EligiusIR } from './types/eligius-ir.js';
import type { TypeError } from './types/errors.js';

/**
 * T283: Simplified type-checking function for new EligiusIR structure
 *
 * Returns the IR unchanged if all checks pass, or fails with TypeError.
 */
export const typeCheck = (ir: EligiusIR): Effect.Effect<EligiusIR, TypeError> =>
  Effect.gen(function* (_) {
    // T283: Validate configuration basics
    // Access ir.config (IEngineConfiguration) and ir.sourceMap for locations

    // Validate configuration id
    if (typeof ir.config.id !== 'string' || ir.config.id.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Configuration id must be a non-empty string',
          location: ir.sourceMap.root,
          expected: 'string',
          actual: typeof ir.config.id,
        })
      );
    }

    // Validate containerSelector
    if (typeof ir.config.containerSelector !== 'string') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'containerSelector must be a string',
          location: ir.sourceMap.root,
          expected: 'string',
          actual: typeof ir.config.containerSelector,
        })
      );
    }

    // Validate language
    if (typeof ir.config.language !== 'string') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'language must be a string',
          location: ir.sourceMap.root,
          expected: 'string',
          actual: typeof ir.config.language,
        })
      );
    }

    // Validate timelines exist
    if (!Array.isArray(ir.config.timelines) || ir.config.timelines.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Configuration must have at least one timeline',
          location: ir.sourceMap.root,
          expected: 'non-empty array',
          actual: `array with ${ir.config.timelines?.length || 0} elements`,
        })
      );
    }

    // If all checks pass, return the IR unchanged
    return ir;
  });

// T283: All detailed validation functions removed - TypeScript enforces structure
// The transformer builds IEngineConfiguration directly, so runtime checking is minimal
