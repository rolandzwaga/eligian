/**
 * Emitter: IR → Eligius JSON Configuration
 *
 * This module transforms the optimized Eligius IR into the final
 * JSON configuration format that the Eligius runtime engine expects.
 *
 * The emitter is the final stage in the compilation pipeline and
 * produces the actual output that users will load into Eligius.
 */

import { Effect } from 'effect';
// Import Eligius types (we installed eligius@1.1.4 in compiler package)
import type { IEngineConfiguration } from 'eligius';
import type { EligiusIR } from './types/eligius-ir.js';
import type { EmitError } from './types/errors.js';

/**
 * T282: Simplified emission function - EligiusIR → IEngineConfiguration (JSON)
 *
 * Now that the transformer builds IEngineConfiguration directly (T281),
 * the emitter just needs to add $schema and return the config.
 * No transformation needed - just serialization!
 *
 * Constitution VII: UUIDs are preserved from transformer (no regeneration).
 */
export const emitJSON = (ir: EligiusIR): Effect.Effect<IEngineConfiguration, EmitError> =>
  Effect.gen(function* (_) {
    // T282: The transformer already built IEngineConfiguration for us!
    // Just add $schema for JSON Schema validation and IDE support
    const config = {
      $schema: 'https://rolandzwaga.github.io/eligius/jsonschema/eligius-configuration.json',
      ...ir.config,
    };

    return config;
  });

// T282: All helper functions removed - emitter now just serializes ir.config
// The transformer builds IEngineConfiguration directly, so no transformation needed!
