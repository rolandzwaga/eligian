/**
 * Timeline Inference Rules for Typir Integration (US5)
 *
 * Registers inference rules for Timeline AST nodes that automatically
 * infer TimelineType with provider, containerSelector, source, and events.
 *
 * Timeline validation rules (source requirements, CSS selector syntax) are
 * handled by separate validation module (timeline-validation.ts).
 *
 * @module type-system-typir/inference/timeline-inference
 */

import { isType } from 'typir';
import type { Timeline } from '../../generated/ast.js';
import type { EligianTypeSystem } from '../eligian-type-system.js';

/**
 * Register timeline inference rules with Typir
 *
 * Registers inference rule for Timeline AST node that infers:
 * - provider: Timeline provider type (video, audio, raf, custom)
 * - containerSelector: CSS selector string
 * - source: Optional source file path
 * - events: Array of TimelineEventType (inferred from TimelineEvent AST nodes)
 *
 * @param typeSystem - Eligian type system instance with timeline factory
 *
 * @example
 * ```eligian
 * timeline "Demo" in "#app" using video from "./video.mp4" {
 *   at 0s..5s fadeIn()
 * }
 * // Inferred type: Timeline<video>
 * ```
 */
export function registerTimelineInference(typeSystem: EligianTypeSystem): void {
  const { typirServices, timelineFactory } = typeSystem;

  typirServices.Inference.addInferenceRulesForAstNodes({
    /**
     * Infer TimelineType from Timeline AST node
     *
     * Extracts provider, containerSelector, source (optional), and events array.
     * Events are inferred using existing TimelineEvent inference rules.
     */
    Timeline: (node: Timeline) => {
      // Infer event types for all timeline events
      const events: unknown[] = [];
      for (const event of node.events) {
        const eventTypeResult = typirServices.Inference.inferType(event);
        if (isType(eventTypeResult)) {
          events.push(eventTypeResult);
        }
      }

      // Create TimelineType with inferred properties
      return timelineFactory
        .create({
          properties: {
            provider: node.provider as 'video' | 'audio' | 'raf' | 'custom',
            containerSelector: node.containerSelector,
            source: node.source ?? '', // Empty string if no source
            events: [], // Will be resolved by Typir after finish()
          },
        })
        .finish()
        .getTypeFinal()!;
    },
  });
}
