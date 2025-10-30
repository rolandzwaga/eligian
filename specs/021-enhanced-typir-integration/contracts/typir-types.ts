/**
 * Custom Typir Types for Eligian DSL Constructs
 *
 * These TypeScript type definitions specify the structure of custom Typir types
 * used for type inference, validation, and hover information in the Eligian DSL.
 *
 * @module contracts/typir-types
 */

import type { Type } from 'typir';

/**
 * ImportType - Represents an imported asset with type information
 *
 * Used for:
 * - Import statement hover display: "Import<css>"
 * - Duplicate default import detection
 * - Asset type mismatch warnings (file extension vs explicit type)
 *
 * @example
 * ```eligian
 * styles './main.css'  // ImportType { assetType: 'css', path: './main.css', isDefault: true }
 * ```
 */
export type ImportType = {
  /**
   * Asset type inferred from import keyword or file extension
   * - 'html': HTML layouts, content snippets
   * - 'css': CSS stylesheets, class definitions
   * - 'media': Video/audio files (timeline providers)
   */
  assetType: 'html' | 'css' | 'media';

  /**
   * Relative file path to the asset
   * Must start with './' or '../'
   */
  path: string;

  /**
   * Whether this is a default import (layout/styles/provider)
   * - true: Default import (only one per type per document)
   * - false: Named import (multiple allowed)
   */
  isDefault: boolean;
};

/**
 * TimelineEventType - Represents a timeline event with timing information
 *
 * Used for:
 * - Event hover display: "TimedEvent: 0s → 5s"
 * - Time range validation (start < end, non-negative)
 * - Overlap detection (multiple events in same timeline)
 *
 * @example
 * ```eligian
 * at 0s..5s fadeIn()  // TimelineEventType { eventKind: 'timed', startTime: 0, endTime: 5 }
 * ```
 */
export type TimelineEventType = {
  /**
   * Event type
   * - 'timed': Time range event (at startTime..endTime)
   * - 'sequence': Sequential operation block (for duration)
   * - 'stagger': Staggered iteration (delay between items)
   */
  eventKind: 'timed' | 'sequence' | 'stagger';

  /**
   * Start time in seconds
   * - Timed events: Actual start time (must be ≥ 0)
   * - Sequences/staggers: Set to 0 (placeholder)
   */
  startTime: number;

  /**
   * End time in seconds (optional)
   * - Timed events: Must be > startTime
   * - Sequences: undefined (uses duration instead)
   * - Staggers: undefined (uses duration instead)
   */
  endTime?: number;

  /**
   * Duration in seconds (optional)
   * - Timed events: undefined (implicit from start/end)
   * - Sequences: Must be > 0
   * - Staggers: Must be > 0
   */
  duration?: number;
};

/**
 * TimelineType - Represents a timeline configuration
 *
 * Used for:
 * - Timeline hover display: "Timeline<video>"
 * - Provider-source consistency validation
 * - Container selector validation
 * - Empty timeline warnings
 *
 * @example
 * ```eligian
 * timeline "main" in "#app" using video from "./video.mp4" { ... }
 * // TimelineType { provider: 'video', containerSelector: '#app', source: './video.mp4', events: [...] }
 * ```
 */
export type TimelineType = {
  /**
   * Timeline provider type
   * - 'video': HTML5 video element
   * - 'audio': HTML5 audio element
   * - 'raf': requestAnimationFrame loop
   * - 'custom': User-defined provider
   */
  provider: 'video' | 'audio' | 'raf' | 'custom';

  /**
   * CSS selector for timeline container element
   * Must be valid CSS selector syntax
   */
  containerSelector: string;

  /**
   * Optional source file path
   * - Video/audio: REQUIRED (source file for media)
   * - RAF/custom: Should NOT be specified (warning if present)
   */
  source?: string;

  /**
   * Array of timeline events
   * Recursive type reference to TimelineEventType
   * Warning if empty
   */
  events: TimelineEventType[];
};

/**
 * Type name calculator function type
 * Used for hover display in IDE
 */
export type TypeNameCalculator<T> = (properties: T) => string;

/**
 * Calculate Import type name for hover display
 *
 * @param props - ImportType properties
 * @returns Type name string: "Import<assetType>"
 *
 * @example
 * ```typescript
 * importTypeName({ assetType: 'css', path: './main.css', isDefault: true })
 * // Returns: "Import<css>"
 * ```
 */
export const importTypeName: TypeNameCalculator<ImportType> = (props) =>
  `Import<${props.assetType}>`;

/**
 * Calculate TimelineEvent type name for hover display
 *
 * @param props - TimelineEventType properties
 * @returns Type name string: "eventKind + 'Event'"
 *
 * @example
 * ```typescript
 * eventTypeName({ eventKind: 'timed', startTime: 0, endTime: 5 })
 * // Returns: "TimedEvent"
 * ```
 */
export const eventTypeName: TypeNameCalculator<TimelineEventType> = (props) =>
  `${props.eventKind}Event`;

/**
 * Calculate Timeline type name for hover display
 *
 * @param props - TimelineType properties
 * @returns Type name string: "Timeline<provider>"
 *
 * @example
 * ```typescript
 * timelineTypeName({ provider: 'video', containerSelector: '#app', source: './video.mp4', events: [] })
 * // Returns: "Timeline<video>"
 * ```
 */
export const timelineTypeName: TypeNameCalculator<TimelineType> = (props) =>
  `Timeline<${props.provider}>`;

/**
 * Reserved keywords that cannot be used as constant names
 *
 * These keywords are part of Eligian DSL syntax and cannot be used
 * as identifiers for constants.
 */
export const RESERVED_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'in',
  'break',
  'continue',
  'const',
  'action',
  'endable',
  'timeline',
  'at',
  'sequence',
  'stagger',
  'import',
  'from',
  'as',
  'layout',
  'styles',
  'provider',
  'using',
]);

/**
 * Asset type inference from file extension
 *
 * @param path - File path
 * @returns Inferred asset type
 *
 * @example
 * ```typescript
 * inferAssetTypeFromExtension('./styles.css')  // Returns: 'css'
 * inferAssetTypeFromExtension('./video.mp4')   // Returns: 'media'
 * inferAssetTypeFromExtension('./layout.html') // Returns: 'html'
 * ```
 */
export function inferAssetTypeFromExtension(path: string): 'html' | 'css' | 'media' {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'css':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'mp4':
    case 'webm':
    case 'ogg':
    case 'mp3':
    case 'wav':
      return 'media';
    default:
      // Default to html for unknown extensions
      return 'html';
  }
}

/**
 * Check if two timeline events overlap in time.
 *
 * Events overlap if their time ranges intersect:
 * - [0s → 5s] and [3s → 7s] overlap (from 3s to 5s)
 * - [0s → 5s] and [5s → 10s] do NOT overlap (adjacent, not overlapping)
 *
 * Algorithm: !(end1 <= start2 OR end2 <= start1)
 *
 * @param event1 - First timeline event (must be timed event with endTime)
 * @param event2 - Second timeline event (must be timed event with endTime)
 * @returns true if events overlap, false if adjacent or separate
 *
 * @example
 * ```typescript
 * const e1 = { eventKind: 'timed', startTime: 0, endTime: 5 };
 * const e2 = { eventKind: 'timed', startTime: 3, endTime: 7 };
 * eventsOverlap(e1, e2)  // Returns: true (overlap from 3s to 5s)
 *
 * const e3 = { eventKind: 'timed', startTime: 0, endTime: 5 };
 * const e4 = { eventKind: 'timed', startTime: 5, endTime: 10 };
 * eventsOverlap(e3, e4)  // Returns: false (adjacent, NOT overlapping)
 * ```
 */
export function eventsOverlap(
  event1: TimelineEventType,
  event2: TimelineEventType
): boolean {
  if (event1.eventKind !== 'timed' || event2.eventKind !== 'timed') {
    return false;
  }
  if (event1.endTime === undefined || event2.endTime === undefined) {
    return false;
  }

  // Check if intervals overlap: [start1, end1] and [start2, end2]
  // No overlap if: end1 <= start2 OR end2 <= start1
  // Overlap if: NOT (end1 <= start2 OR end2 <= start1)
  return !(event1.endTime <= event2.startTime || event2.endTime <= event1.startTime);
}

/**
 * Parse time expression to seconds
 *
 * @param expr - Time expression (e.g., "5s", "500ms")
 * @returns Time in seconds
 *
 * @example
 * ```typescript
 * parseTimeExpression('5s')     // Returns: 5
 * parseTimeExpression('500ms')  // Returns: 0.5
 * parseTimeExpression('1.5s')   // Returns: 1.5
 * ```
 */
export function parseTimeExpression(expr: string): number {
  const match = expr.match(/^(\d+(?:\.\d+)?)(s|ms)$/);
  if (!match) {
    return 0; // Invalid format
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2];

  return unit === 'ms' ? value / 1000 : value;
}
