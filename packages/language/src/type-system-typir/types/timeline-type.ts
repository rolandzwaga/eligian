/**
 * TimelineType Factory (US5)
 *
 * Custom Typir type for timeline configurations.
 * Represents a timeline with provider, container selector, optional source, and events.
 *
 * Properties:
 * - provider: 'video' | 'audio' | 'raf' | 'custom'
 * - containerSelector: CSS selector string for timeline container
 * - source: Optional source file path (required for video/audio, not for raf/custom)
 * - events: Array of TimelineEventType (circular dependency handled by Typir)
 *
 * Type Name Format: "Timeline<provider>"
 * Example: Timeline<video>, Timeline<raf>
 *
 * @module type-system-typir/types/timeline-type
 */

import type { TypirServices } from 'typir';
import { CustomKind } from 'typir';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * TimelineType properties
 *
 * Extends CustomTypeProperties to satisfy Typir's CustomKind requirements.
 * The index signature allows Typir to store additional metadata.
 *
 * Note: We use string for all properties to match the index signature.
 * For source, we use empty string to represent "no source" (RAF/custom providers).
 * The events array will be properly typed after Typir resolves circular dependencies.
 */
export interface TimelineType {
  /** Timeline provider type */
  provider: 'video' | 'audio' | 'raf' | 'custom';

  /** CSS selector for timeline container */
  containerSelector: string;

  /**
   * Source file path
   * - Required for video/audio: './video.mp4'
   * - Empty string for raf/custom: ''
   */
  source: string;

  /** Timeline events (circular reference to TimelineEventType) */
  events: never[]; // Empty array type to satisfy index signature

  /**
   * Index signature required by Typir CustomTypeProperties
   * Must be: string | number | boolean | bigint | symbol | arrays/maps/sets of these
   */
  [key: string]: string | never[];
}

/**
 * Create TimelineType factory
 *
 * Factory for creating TimelineType instances with hover support.
 * Type name format: "Timeline<provider>"
 *
 * @param typir - Typir services
 * @returns CustomKind factory for TimelineType
 *
 * @example
 * ```typescript
 * const factory = createTimelineTypeFactory(typir);
 * const type = factory.create({
 *   properties: {
 *     provider: 'video',
 *     containerSelector: '#app',
 *     source: './video.mp4',
 *     events: []
 *   }
 * }).finish().getTypeFinal();
 * // type.getName() => "Timeline<video>"
 * ```
 */
export function createTimelineTypeFactory(typir: TypirServices<EligianSpecifics>) {
  return new CustomKind<TimelineType, EligianSpecifics>(typir, {
    name: 'Timeline',
    calculateTypeName: props => `Timeline<${props.provider}>`,
  });
}
