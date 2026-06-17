/**
 * Configuration builders and IR→Eligius converters.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS). Pure functions that build default configuration values,
 * generate layout/provider settings, build the source map, and strip/convert IR
 * types into their Eligius equivalents.
 */
import type { LanguagesBlock } from '../../generated/ast.js';
import type { SourceLocation } from '../types/common.js';
import type {
  EndableActionIR,
  EventActionIR,
  IEndableActionConfiguration,
  IEngineInfo,
  ILabel,
  IOperationConfiguration,
  ITimelineActionConfiguration,
  ITimelineConfiguration,
  OperationConfigIR,
  SourceMap,
  TimelineActionIR,
  TimelineConfigIR,
  TimelineProviderSettingIR,
  TimelineProviderSettingsIR,
  TLanguageCode,
  TOperationData,
} from '../types/eligius-ir.js';
import { evaluateTimeExpression } from './time-transformer.js';

/**
 * Transform LanguagesBlock AST to Eligius language configuration
 *
 * Extracts language declarations and converts them to:
 * - `language: TLanguageCode` - Default language code
 * - `availableLanguages: ILabel[]` - Array of available languages
 *
 * Rules:
 * - Single language (1 entry): First entry becomes default (implicit)
 * - Multiple languages (2+ entries): Entry with isDefault=true becomes default (explicit * marker)
 * - Each ILabel gets a UUID v4 via crypto.randomUUID()
 *
 * @param block - LanguagesBlock AST node (if present)
 * @returns Object with language and availableLanguages properties
 *
 * Feature 037: Languages Declaration Syntax
 * Research Decision: RT-005 (Default language behavior)
 * Task: T006 (Stub), T011 (Full implementation)
 */
export function transformLanguagesBlock(block: LanguagesBlock | undefined): {
  language: TLanguageCode;
  availableLanguages: ILabel[];
} {
  // T013: Backward compatibility - if no languages block, default to en-US
  if (!block || block.entries.length === 0) {
    return {
      language: 'en-US',
      availableLanguages: [{ id: crypto.randomUUID(), languageCode: 'en-US', label: 'English' }],
    };
  }

  // T011: Full implementation for single language case
  // Single language (1 entry): First entry becomes default (implicit)
  // Multiple languages (2+ entries): Entry with isDefault=true becomes default (explicit * marker)

  // Find default language
  let defaultLanguageCode: string;
  if (block.entries.length === 1) {
    // Single language - implicit default (first entry)
    defaultLanguageCode = block.entries[0].code;
  } else {
    // Multiple languages - explicit default (entry with isDefault=true)
    const defaultEntry = block.entries.find(entry => entry.isDefault);
    defaultLanguageCode = defaultEntry!.code; // Validator ensures exactly one * marker
  }

  // T011: Map all entries to ILabel array with UUID v4 generation
  const availableLanguages: ILabel[] = block.entries.map(entry => ({
    id: crypto.randomUUID(), // UUID v4 for globally unique IDs
    languageCode: entry.code as TLanguageCode,
    label: entry.label,
  }));

  return {
    language: defaultLanguageCode as TLanguageCode,
    availableLanguages,
  };
}

/**
 * Create default configuration values for required Eligius fields
 *
 * Constitution VII: Uses crypto.randomUUID() for globally unique configuration ID.
 * UUIDs ensure no conflicts when merging configs or running concurrently.
 */
export function createDefaultConfiguration() {
  return {
    // Constitution VII: UUID v4 for globally unique configuration ID
    id: crypto.randomUUID(),
    engine: {
      systemName: 'EligiusEngine',
    } as IEngineInfo,
    containerSelector: '#eligius-container',
    language: 'en-US' as TLanguageCode,
    layoutTemplate: 'default',
    // T275: ILabel requires id property
    // T278: TLanguageCode format is `${Lowercase}-${Uppercase}` (e.g., 'en-US')
    availableLanguages: [
      { id: crypto.randomUUID(), languageCode: 'en-US' as TLanguageCode, label: 'English' },
    ] as ILabel[],
  };
}

/**
 * Generate HTML layout template with container divs for all timeline selectors.
 *
 * Eligius sets containerSelector.html(layoutTemplate) during initialization,
 * so we need to provide HTML that includes divs for all timeline selectors.
 *
 * @param timelines - All timeline configurations
 * @returns HTML string with container divs
 *
 * @example
 * Input: [{ selector: '.timeline1' }, { selector: '#timeline2' }]
 * Output: '<div class="timeline1"></div><div id="timeline2"></div>'
 */
export function generateLayoutTemplate(timelines: TimelineConfigIR[]): string {
  const containerDivs = timelines.map(timeline => {
    const selector = timeline.selector;

    // Parse selector to create appropriate HTML
    if (selector.startsWith('.')) {
      // Class selector: .timeline → <div class="timeline"></div>
      const className = selector.slice(1);
      return `<div class="${className}"></div>`;
    }
    if (selector.startsWith('#')) {
      // ID selector: #timeline → <div id="timeline"></div>
      const id = selector.slice(1);
      return `<div id="${id}"></div>`;
    }

    // For other selectors, use as class name (simplified)
    const safeClass = selector.replace(/[^a-zA-Z0-9-_]/g, '');
    return `<div class="${safeClass}"></div>`;
  });

  // Return only the timeline container divs
  // UI controls are kept separate in the webview HTML (outside #eligius-container)
  return containerDivs.join('');
}

/**
 * T280: Build SourceMap - parallel structure tracking source locations
 *
 * Maps entity IDs to their source locations for error reporting.
 * This allows us to strip sourceLocation from Eligius types while maintaining traceability.
 */
export function buildSourceMap(
  rootLocation: SourceLocation,
  initActions: EndableActionIR[],
  actions: EndableActionIR[],
  eventActions: EventActionIR[],
  timelines: TimelineConfigIR[]
): SourceMap {
  const actionMap = new Map<string, SourceLocation>();
  const operationMap = new Map<string, SourceLocation>();
  const timelineMap = new Map<string, SourceLocation>();
  const timelineActionMap = new Map<string, SourceLocation>();

  // Map init actions
  for (const action of initActions) {
    actionMap.set(action.id, action.sourceLocation);
    for (const op of action.startOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
    for (const op of action.endOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
  }

  // Map actions
  for (const action of actions) {
    actionMap.set(action.id, action.sourceLocation);
    for (const op of action.startOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
    for (const op of action.endOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
  }

  // Map event actions
  for (const action of eventActions) {
    actionMap.set(action.id, action.sourceLocation);
    for (const op of action.startOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
  }

  // Map timelines and timeline actions
  for (const timeline of timelines) {
    timelineMap.set(timeline.id, timeline.sourceLocation);
    for (const timelineAction of timeline.timelineActions) {
      timelineActionMap.set(timelineAction.id, timelineAction.sourceLocation);
      for (const op of timelineAction.startOperations) {
        operationMap.set(op.id, op.sourceLocation);
      }
      for (const op of timelineAction.endOperations) {
        operationMap.set(op.id, op.sourceLocation);
      }
    }
  }

  return {
    root: rootLocation,
    actions: actionMap,
    operations: operationMap,
    timelines: timelineMap,
    timelineActions: timelineActionMap,
  };
}

/**
 * T281: Strip sourceLocation from EndableActionIR → IEndableActionConfiguration
 */
export function stripSourceLocation(action: EndableActionIR): IEndableActionConfiguration {
  return {
    id: action.id,
    name: action.name,
    startOperations: action.startOperations.map(stripOperationSourceLocation),
    endOperations: action.endOperations.map(stripOperationSourceLocation),
  };
}

/**
 * T281: Strip sourceLocation from OperationConfigIR → IOperationConfiguration
 */
export function stripOperationSourceLocation(
  op: OperationConfigIR
): IOperationConfiguration<TOperationData> {
  return {
    id: op.id,
    systemName: op.systemName,
    operationData: op.operationData,
  };
}

/**
 * T281: Convert TimelineConfigIR → ITimelineConfiguration
 */
export function convertTimelineConfigToEligius(timeline: TimelineConfigIR): ITimelineConfiguration {
  return {
    id: timeline.id,
    uri: timeline.uri,
    type: timeline.type,
    duration: timeline.duration,
    loop: timeline.loop,
    selector: timeline.selector,
    timelineActions: timeline.timelineActions.map(convertTimelineActionToEligius),
  };
}

/**
 * T281: Convert TimelineActionIR → ITimelineActionConfiguration
 */
export function convertTimelineActionToEligius(
  action: TimelineActionIR
): ITimelineActionConfiguration {
  // Convert DurationIR to IDuration (evaluate TimeExpression to numbers)
  const start =
    typeof action.duration.start === 'number'
      ? action.duration.start
      : evaluateTimeExpression(action.duration.start);
  const end =
    typeof action.duration.end === 'number'
      ? action.duration.end
      : evaluateTimeExpression(action.duration.end);

  return {
    id: action.id,
    name: action.name,
    startOperations: action.startOperations.map(stripOperationSourceLocation),
    endOperations: action.endOperations.map(stripOperationSourceLocation),
    duration: { start, end },
  };
}

/**
 * T271: Map DSL provider name to Eligius timeline type
 * T278: Returns only Eligius TimelineTypes ('animation' | 'mediaplayer')
 *
 * DSL uses provider names (raf, video, audio) while Eligius uses type names.
 * Mapping:
 * - raf → animation (requestAnimationFrame-based timeline)
 * - video → mediaplayer (HTML5 video timeline)
 * - audio → mediaplayer (HTML5 audio timeline)
 */
export function mapProviderToTimelineType(provider: string): 'animation' | 'mediaplayer' {
  switch (provider) {
    case 'raf':
      return 'animation';
    case 'video':
    case 'audio':
      return 'mediaplayer';
    default:
      return 'animation'; // Default to animation for unknown providers
  }
}

/**
 * T273: Generate timelineProviderSettings based on timeline types used
 *
 * Creates provider settings for each unique timeline type in the program.
 * Eligius 2.0.0 API: Uses positionSource configuration with systemName
 * - animation: RafPositionSource
 * - mediaplayer: VideoPositionSource (for video/audio)
 *
 * Each provider setting includes:
 * - positionSource.systemName: Eligius position source class name
 * - positionSource.selector: CSS selector (only for mediaplayer)
 */
export function generateTimelineProviderSettings(
  timelines: TimelineConfigIR[]
): TimelineProviderSettingsIR {
  const settings: Record<string, TimelineProviderSettingIR> = {};

  // Collect unique timeline types
  const timelineTypes = new Set<string>();
  for (const timeline of timelines) {
    // Only include 'animation' and 'mediaplayer' (not legacy types)
    if (timeline.type === 'animation' || timeline.type === 'mediaplayer') {
      timelineTypes.add(timeline.type);
    }
  }

  // Generate provider settings for each type (Eligius 2.0.0 API)
  for (const type of timelineTypes) {
    if (type === 'animation') {
      settings.animation = {
        positionSource: {
          systemName: 'RafPositionSource',
        },
      };
    } else if (type === 'mediaplayer') {
      settings.mediaplayer = {
        positionSource: {
          systemName: 'VideoPositionSource',
          selector: '', // TODO: Could extract from timeline selector field
        },
      };
    }
  }

  return settings as TimelineProviderSettingsIR;
}
