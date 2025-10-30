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
 * AssetType - Type of asset being imported
 * - 'html': HTML layouts, content snippets
 * - 'css': CSS stylesheets, class definitions
 * - 'media': Video/audio files (timeline providers)
 */
export type AssetType = 'html' | 'css' | 'media';

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
  assetType: AssetType;

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
 * NOTE: This is a Typir CustomKind type, requiring 'kind' and 'astNode' properties
 * for integration with Typir type system infrastructure.
 *
 * @example
 * ```eligian
 * at 0s..5s fadeIn()  // TimelineEventType { eventType: 'timed', startTime: 0, endTime: 5 }
 * ```
 */
export type TimelineEventType = Type & {
  /**
   * Typir kind identifier (always 'TimelineEvent')
   * Required by Typir for type discrimination
   */
  kind: 'TimelineEvent';

  /**
   * Event type
   * - 'timed': Time range event (at startTime..endTime)
   * - 'sequence': Sequential operation block (for duration)
   * - 'stagger': Staggered iteration (delay between items)
   */
  eventType: 'timed' | 'sequence' | 'stagger';

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

  /**
   * Reference to source AST node
   * Required by Typir for error reporting and hover
   */
  astNode: unknown;
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
export const importTypeName: TypeNameCalculator<ImportType> = props => `Import<${props.assetType}>`;

/**
 * Calculate TimelineEvent type name for hover display
 *
 * @param props - TimelineEventType properties
 * @returns Type name string: "eventType + 'Event'"
 *
 * @example
 * ```typescript
 * eventTypeName({ eventType: 'timed', startTime: 0, endTime: 5 })
 * // Returns: "TimedEvent"
 * ```
 */
export const eventTypeName: TypeNameCalculator<TimelineEventType> = props =>
  `${props.eventType}Event`;

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
export const timelineTypeName: TypeNameCalculator<TimelineType> = props =>
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
