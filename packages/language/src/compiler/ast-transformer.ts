/**
 * AST Transformer: Langium AST → Eligius IR
 *
 * This module transforms the parsed Langium AST into our internal
 * Intermediate Representation (IR) which is optimized for further
 * compilation stages (type checking, optimization, emission).
 *
 * Design principles (per DSL_DESIGN_DECISIONS.md):
 * - External API is immutable (Effect types)
 * - Internal mutation allowed for performance (building IR arrays)
 * - All transformations include source location mapping for error reporting
 * - Type-safe error handling with TransformError
 * - Support function-style operation calls with positional parameters
 * - Handle property chain references ($scope.*, $operationdata.*, $globaldata.*)
 * - Flatten wrapper objects (properties, attributes) automatically
 */

import { Effect } from 'effect';
import { AstUtils, type URI } from 'langium';
import { getController, isController } from '../completion/metadata/controllers.generated.js';
import type { TransformError } from '../errors/index.js';
import type {
  ActionDefinition,
  TimeExpression as AstTimeExpression,
  BreakStatement,
  ContinueStatement,
  EndableActionDefinition,
  EventActionDefinition,
  Expression,
  ForStatement,
  IfStatement,
  Library,
  OperationCall,
  OperationStatement,
  Program,
  RegularActionDefinition,
  SequenceBlock,
  StaggerBlock,
  TimedEvent,
  Timeline,
  VariableDeclaration,
} from '../generated/ast.js';
import { isLibrary, isLibraryImport } from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import {
  getActions,
  getEventActions,
  getLibraryImports,
  getTimelines,
  getVariables,
} from '../utils/program-helpers.js';
import { buildConstantMap } from './constant-folder.js';
import { evaluateExpression } from './expression-evaluator.js';
import { findActionByName } from './name-resolver.js';
import { getOperationSignature } from './operations/index.js';
import { mapParameters } from './operations/mapper.js';
import { trackOutputs, validateDependencies, validateOperation } from './operations/validator.js';
import { getOrCreateServices, resolveLibraryPath } from './pipeline.js';
import type { SourceLocation } from './types/common.js';
import type { ConstantMap } from './types/constant-folding.js';
import type {
  EligiusIR,
  EndableActionIR,
  EventActionIR,
  IEndableActionConfiguration,
  IEngineConfiguration,
  IEngineInfo,
  IEventActionConfiguration,
  ILabel,
  IOperationConfiguration,
  ITimelineActionConfiguration,
  ITimelineConfiguration,
  JsonValue,
  OperationConfigIR,
  SourceMap,
  TimeExpression,
  TimelineActionIR,
  TimelineConfigIR,
  TimelineProviderSettingIR,
  TimelineProviderSettingsIR,
  TLanguageCode,
  TOperationData,
  TTimelineProviderSettings,
} from './types/eligius-ir.js';

/**
 * Scope Context - Track transformation context for reference resolution
 *
 * Used to determine how to resolve references:
 * - Bare identifiers → action parameters (when inActionBody=true)
 * - @@identifier → system context properties (with loop variable aliasing)
 * - @identifier → user variables (context.variables.*)
 *
 * Also tracks action-scoped constants for inlining optimization.
 */
interface ScopeContext {
  /** Are we currently inside an action body? */
  inActionBody: boolean;
  /** Available action parameters (for bare identifier resolution) */
  actionParameters: string[];
  /** Current loop variable name (for aliasing @@varName → @@currentItem) */
  loopVariableName?: string;
  /** Action-scoped constants (for inlining within the current scope) */
  scopedConstants: ConstantMap;
  /** Event action parameter indices (Feature 028 - T019) */
  eventActionParameters?: Map<string, number>;
}

/**
 * Module-level constant map for the current program being transformed.
 * Set at the start of transformAST and used throughout transformation.
 *
 * Note: This is safe because transformAST is called sequentially per program.
 * For concurrent compilation, this would need to be thread-local or passed through context.
 */
let currentConstantMap: ConstantMap = new Map();

/**
 * Create an empty scope context
 */
function createEmptyScope(): ScopeContext {
  return {
    inActionBody: false,
    actionParameters: [],
    loopVariableName: undefined,
    scopedConstants: new Map(),
  };
}

/**
 * T044: Resolve library imports and collect imported actions (Feature 023 - User Story 2)
 *
 * This function processes all LibraryImport statements in a program and collects the imported actions.
 * It handles aliasing - if an action is imported with an alias, it returns the action with the alias name
 * applied so that downstream compilation uses the alias.
 *
 * Note: This relies on Langium's cross-reference resolution to already have resolved ActionImport.action
 * references to actual ActionDefinition nodes from library files. If references are unresolved,
 * those imports will be skipped (validation should have caught these errors).
 *
 * @param program - Program AST node with potential library imports
 * @returns Array of ActionDefinition nodes (with aliases applied where necessary)
 */
function resolveImports(
  program: Program,
  visited: Set<string> = new Set()
): Effect.Effect<ActionDefinition[], TransformError, never> {
  return Effect.gen(function* (_) {
    const libraryImports = getLibraryImports(program);
    const importedActions: ActionDefinition[] = [];

    // Track visited libraries to prevent infinite recursion
    const currentUri = AstUtils.getDocument(program).uri;
    if (currentUri) {
      visited.add(currentUri.fsPath);
    }

    for (const libraryImport of libraryImports) {
      // Feature 032 US3: Get the library document to recursively collect its imports
      const libraryUri = currentUri
        ? resolveLibraryPath(currentUri, libraryImport.path)
        : undefined;

      if (libraryUri && !visited.has(libraryUri.fsPath)) {
        // Recursively collect actions from this library's imports
        const services = getOrCreateServices();
        const libraryDoc = services.shared.workspace.LangiumDocuments.getDocument(libraryUri);

        if (libraryDoc?.parseResult.value && isLibrary(libraryDoc.parseResult.value)) {
          const library = libraryDoc.parseResult.value;

          // Recursively collect actions from library's imports
          const nestedActions = yield* _(resolveLibraryImports(library, visited, libraryUri));
          importedActions.push(...nestedActions);
        }
      }

      for (const actionImport of libraryImport.actions) {
        // Get the resolved ActionDefinition from the reference
        // If the reference is unresolved (undefined), skip it - validation should have caught this
        const actionDef = actionImport.action.ref;
        if (!actionDef) {
          // Reference not resolved - skip (validation error should exist)
          continue;
        }

        // T045: Handle aliasing - if action has alias, create a modified action with alias name
        if (actionImport.alias) {
          // Create a new action object with the alias name
          // We need to preserve all other properties but change the name
          const aliasedAction: ActionDefinition = {
            ...actionDef,
            name: actionImport.alias,
          };
          importedActions.push(aliasedAction);
        } else {
          importedActions.push(actionDef);
        }
      }
    }

    return importedActions;
  });
}

/**
 * Feature 032 US3: Recursively resolve library imports
 *
 * Collects all actions from a library's imports, including nested library imports.
 * This ensures that actions defined in libraries can call actions from libraries
 * that those libraries import.
 */
function resolveLibraryImports(
  library: Library,
  visited: Set<string>,
  libraryUri: URI
): Effect.Effect<ActionDefinition[], TransformError, never> {
  return Effect.gen(function* (_) {
    const importedActions: ActionDefinition[] = [];

    // Mark this library as visited
    visited.add(libraryUri.fsPath);

    // Get library's imports
    const libraryImports = library.imports || [];

    for (const libraryImport of libraryImports) {
      if (!isLibraryImport(libraryImport)) continue;

      // Resolve nested library
      const nestedLibraryUri = resolveLibraryPath(libraryUri, libraryImport.path);

      // Skip if already visited (circular dependency)
      if (visited.has(nestedLibraryUri.fsPath)) {
        continue;
      }

      // Get nested library document
      const services = getOrCreateServices();
      const nestedLibraryDoc =
        services.shared.workspace.LangiumDocuments.getDocument(nestedLibraryUri);

      if (!nestedLibraryDoc?.parseResult.value) continue;
      if (!isLibrary(nestedLibraryDoc.parseResult.value)) continue;

      const nestedLibrary = nestedLibraryDoc.parseResult.value;

      // Recursively collect actions from nested library's imports
      const transitiveActions = yield* _(
        resolveLibraryImports(nestedLibrary, visited, nestedLibraryUri)
      );
      importedActions.push(...transitiveActions);

      // Feature 032 US3: Add ALL actions from the nested library
      // This ensures library A can use actions from library B (like slideAndFade)
      // Library A's actions are transformed with access to all of B's actions
      for (const action of nestedLibrary.actions || []) {
        importedActions.push(action);
      }
    }

    return importedActions;
  });
}

/**
 * Main transformation function - orchestrates all transformations
 *
 * Transforms a complete Langium Program AST into EligiusIR aligned with IEngineConfiguration.
 * Supports multiple timelines for complex scenarios (e.g., synchronized video+audio).
 *
 * @param program - Parsed Langium AST
 * @param assets - Optional loaded assets (layout HTML, CSS files) from asset-loading pipeline
 */
export const transformAST = (
  program: Program,
  assets?: import('../asset-loading/compiler-integration.js').AssetLoadingResult
): Effect.Effect<EligiusIR, TransformError> =>
  Effect.gen(function* (_) {
    // CONSTANT FOLDING (T008): Build constant map FIRST
    // This map will be used throughout transformation to inline constant values
    currentConstantMap = buildConstantMap(program);

    // Find all timelines (validation ensures at least one exists)
    const timelineNodes = getTimelines(program);
    if (timelineNodes.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidTimeline' as const,
          message: 'No timeline found in program',
          location: getSourceLocation(program),
        })
      );
    }

    // Extract program-level variable declarations (T182: Global variables)
    // CONSTANT FOLDING (T008): Filter out constants - they will be inlined, not stored in globalData
    // FEATURE 015: HTML imports are treated as constants (loaded in buildConstantMap, inlined during transformation)
    const variableDeclarations = getVariables(program).filter(
      el => !currentConstantMap.has(el.name)
    );

    // Transform program-level variables to initActions
    // T274: initActions must be IEndableActionConfiguration[], not IOperationConfiguration[]
    const initActions: EndableActionIR[] = [];
    if (variableDeclarations.length > 0) {
      const properties: Record<string, JsonValue> = {};

      // Add regular variable declarations (non-constants)
      for (const varDecl of variableDeclarations) {
        const value = yield* _(transformExpression(varDecl.value));
        properties[`globaldata.${varDecl.name}`] = value;
      }

      // Create single setData operation wrapped in an IEndableActionConfiguration
      const firstSource = variableDeclarations[0];
      const setDataOperation: OperationConfigIR = {
        id: crypto.randomUUID(),
        systemName: 'setData',
        operationData: { properties },
        sourceLocation: firstSource
          ? getSourceLocation(firstSource)
          : {
              file: undefined,
              line: 1,
              column: 1,
              length: 0,
            },
      };

      // Wrap operation in proper IEndableActionConfiguration structure
      initActions.push({
        id: crypto.randomUUID(),
        name: 'init-globaldata',
        startOperations: [setDataOperation],
        endOperations: [], // No end operations for init actions
        sourceLocation: getSourceLocation(firstSource),
      });
    }

    // T046: Extract local action definitions (both regular and endable)
    const localActions = getActions(program);

    // T044/T045: Resolve library imports and collect imported actions (with aliases applied)
    const importedActions = yield* _(resolveImports(program));

    // Merge imported and local actions - imported actions come first, then local actions
    // This ensures local actions can override imported ones if there are name conflicts
    // (though validation should prevent this)
    const actionDefinitions = [...importedActions, ...localActions];

    // Transform action definitions to Eligius EndableActionIR format
    const actions: EndableActionIR[] = [];
    for (const actionDef of actionDefinitions) {
      const action = yield* _(transformActionDefinition(actionDef, program, actionDefinitions));
      actions.push(action);
    }
    // T011: Extract and transform event action definitions (Feature 028 - User Story 1)
    const eventActionNodes = getEventActions(program);
    const eventActions: IEventActionConfiguration[] = [];
    for (const eventActionDef of eventActionNodes) {
      const eventAction = transformEventAction(eventActionDef);
      eventActions.push(eventAction);
    }

    // Build TimelineConfigIR from all timeline nodes
    const timelines: TimelineConfigIR[] = [];
    for (const timelineNode of timelineNodes) {
      const timelineConfig = yield* _(
        buildTimelineConfig(timelineNode, program, actionDefinitions)
      );
      timelines.push(timelineConfig);
    }

    // Generate default configuration values
    const defaults = createDefaultConfiguration();

    // Use loaded layout template if available, otherwise generate default
    const layoutTemplate = assets?.layoutTemplate ?? generateLayoutTemplate(timelines);

    // T273: Generate timelineProviderSettings based on timeline types used
    const providerSettings = generateTimelineProviderSettings(timelines);

    // T279/T280/T281: Build IEngineConfiguration and SourceMap separately
    // Convert IR types to Eligius types (strip sourceLocation)
    const eligiusInitActions: IEndableActionConfiguration[] = initActions.map(stripSourceLocation);
    const eligiusActions: IEndableActionConfiguration[] = actions.map(stripSourceLocation);
    const eligiusEventActions: IEventActionConfiguration[] = eventActions; // T011: Use transformed event actions
    const eligiusTimelines: ITimelineConfiguration[] = timelines.map(
      convertTimelineConfigToEligius
    );

    // Build SourceMap (T280): Track all entity IDs → source locations
    const sourceMap: SourceMap = buildSourceMap(
      getSourceLocation(program),
      initActions,
      actions,
      [],
      timelines
    );

    // T012: Transform languages block (Feature 037)
    const languagesConfig = transformLanguagesBlock(program.languages);

    // Build complete IEngineConfiguration (T281)
    const config: IEngineConfiguration = {
      id: defaults.id,
      engine: defaults.engine,
      containerSelector: defaults.containerSelector,
      language: languagesConfig.language, // T012: Use transformed language
      layoutTemplate,
      cssFiles: assets?.cssFiles ?? [], // Use loaded CSS files from asset imports
      availableLanguages: languagesConfig.availableLanguages, // T012: Use transformed availableLanguages
      locales: assets?.locales, // Use loaded locales from locales import
      initActions: eligiusInitActions,
      actions: eligiusActions,
      eventActions: eligiusEventActions,
      timelines: eligiusTimelines,
      timelineFlow: undefined,
      timelineProviderSettings: providerSettings as TTimelineProviderSettings,
    };

    // Return new EligiusIR wrapper (T279)
    const result = {
      config,
      sourceMap,
      metadata: {
        dslVersion: '1.0.0',
        compilerVersion: '0.0.1',
        compiledAt: new Date().toISOString(),
        sourceFile: undefined,
      },
    };
    return result;
  });

// ============================================================================
// Languages Block Transformation (Feature 037)
// ============================================================================

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
function transformLanguagesBlock(block: import('../generated/ast.js').LanguagesBlock | undefined): {
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
function createDefaultConfiguration() {
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
function generateLayoutTemplate(timelines: TimelineConfigIR[]): string {
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
function buildSourceMap(
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
function stripSourceLocation(action: EndableActionIR): IEndableActionConfiguration {
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
function stripOperationSourceLocation(
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
function convertTimelineConfigToEligius(timeline: TimelineConfigIR): ITimelineConfiguration {
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
function convertTimelineActionToEligius(action: TimelineActionIR): ITimelineActionConfiguration {
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
function mapProviderToTimelineType(provider: string): 'animation' | 'mediaplayer' {
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
function generateTimelineProviderSettings(
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

/**
 * Build TimelineConfigIR from timeline node
 *
 * This creates the full Eligius TimelineConfiguration structure.
 *
 * Constitution VII: Generates UUID for timeline ID to ensure global uniqueness
 * when configs are merged or multiple timelines exist.
 */
const buildTimelineConfig = (
  timeline: Timeline,
  program: Program,
  allActions: ActionDefinition[]
): Effect.Effect<TimelineConfigIR, TransformError> =>
  Effect.gen(function* (_) {
    // T189/T190: Transform timeline events to TimelineActionIR with relative time support
    // Track previous event end time for relative time expressions and sequence blocks
    const timelineActions: TimelineActionIR[] = [];
    let previousEventEndTime = 0;

    for (const event of timeline.events) {
      // T190/T192: Check event type (sequence, stagger, or timed)
      if (event.$type === 'SequenceBlock') {
        // Transform sequence block into multiple timeline actions
        const sequenceActions = yield* _(
          transformSequenceBlock(event, previousEventEndTime, program, allActions)
        );
        timelineActions.push(...sequenceActions);

        // Update previousEventEndTime to the end of the last sequence item
        if (sequenceActions.length > 0) {
          const lastAction = sequenceActions[sequenceActions.length - 1];
          previousEventEndTime =
            typeof lastAction.duration.end === 'number'
              ? lastAction.duration.end
              : evaluateTimeExpression(lastAction.duration.end);
        }
      } else if (event.$type === 'StaggerBlock') {
        // T192: Transform stagger block into multiple timeline actions with incremental delays
        const staggerActions = yield* _(
          transformStaggerBlock(event, previousEventEndTime, program, allActions)
        );
        timelineActions.push(...staggerActions);

        // Update previousEventEndTime to the end of the last stagger item
        if (staggerActions.length > 0) {
          const lastAction = staggerActions[staggerActions.length - 1];
          previousEventEndTime =
            typeof lastAction.duration.end === 'number'
              ? lastAction.duration.end
              : evaluateTimeExpression(lastAction.duration.end);
        }
      } else {
        // TimedEvent: regular "at start..end { ... }" event
        const timelineAction = yield* _(
          transformTimedEvent(event, previousEventEndTime, program, allActions)
        );
        timelineActions.push(timelineAction);

        // Update previous event end time for next event
        previousEventEndTime =
          typeof timelineAction.duration.end === 'number'
            ? timelineAction.duration.end
            : evaluateTimeExpression(timelineAction.duration.end);
      }
    }

    // T188: Calculate total duration from events (duration inference)
    let maxDuration = 0;
    for (const action of timelineActions) {
      const endTime = typeof action.duration.end === 'number' ? action.duration.end : 0;
      if (endTime > maxDuration) {
        maxDuration = endTime;
      }
    }

    // T271: Map provider to Eligius timeline type
    // T272: Generate uri (timeline name for animation, source path for mediaplayer)
    const timelineType = mapProviderToTimelineType(timeline.provider);
    const uri = timeline.provider === 'raf' ? timeline.name : timeline.source || timeline.name;

    return {
      // Constitution VII: UUID v4 for globally unique timeline ID
      id: crypto.randomUUID(),
      uri,
      type: timelineType,
      duration: maxDuration,
      loop: false, // TODO: Could add DSL support for loop
      selector: timeline.containerSelector,
      timelineActions,
      sourceLocation: getSourceLocation(timeline),
    };
  });

/**
 * Transform SequenceBlock → TimelineActionIR[] (T190)
 *
 * Transforms:
 *   sequence {
 *     intro() for 5s
 *     main() for 10s
 *     outro() for 3s
 *   }
 *
 * Into timeline actions with calculated times:
 *   at 0s..5s { intro() }
 *   at 5s..15s { main() }
 *   at 15s..18s { outro() }
 *
 * previousEventEndTime is the starting point for the first sequence item.
 */
const transformSequenceBlock = (
  sequence: SequenceBlock,
  previousEventEndTime: number,
  _program: Program,
  allActions: ActionDefinition[]
): Effect.Effect<TimelineActionIR[], TransformError> =>
  Effect.gen(function* (_) {
    const actions: TimelineActionIR[] = [];
    let currentTime = previousEventEndTime;

    for (const item of sequence.items) {
      // Transform duration expression to number
      const durationExpr = yield* _(transformTimeExpression(item.duration, currentTime));
      const duration = evaluateTimeExpression(durationExpr);

      // Calculate time range: start at currentTime, end at currentTime + duration
      const start = currentTime;
      const end = currentTime + duration;

      // Get action name and arguments
      const actionCall = item.actionCall;
      const actionName = getOperationCallName(actionCall);
      const actionRef = findActionByName(actionName, allActions);

      // Check if this is an endable action or regular action
      const isEndableAction = actionRef?.$type === 'EndableActionDefinition';

      // Transform action arguments to actionOperationData
      let actionOperationData: Record<string, JsonValue> | undefined;
      if (actionCall?.args && actionCall.args.length > 0 && actionRef) {
        const parameters = actionRef.parameters || [];
        const args = actionCall.args;

        if (args.length !== parameters.length) {
          return yield* _(
            Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'ValidationError' as const,
              message: `Action '${actionName}' expects ${parameters.length} arguments but got ${args.length}`,
              location: getSourceLocation(item),
            })
          );
        }

        actionOperationData = {};
        for (let i = 0; i < parameters.length; i++) {
          const paramName = parameters[i].name;
          const argValue = yield* _(transformExpression(args[i]));
          actionOperationData[paramName] = argValue;
        }
      }

      // Build start and end operations for this sequence item
      const startOperations: OperationConfigIR[] = [
        {
          id: crypto.randomUUID(),
          systemName: 'requestAction',
          operationData: { systemName: actionName },
          sourceLocation: getSourceLocation(item),
        },
        {
          id: crypto.randomUUID(),
          systemName: 'startAction',
          operationData: actionOperationData ? { actionOperationData } : {},
          sourceLocation: getSourceLocation(item),
        },
      ];

      // End operations: Only generate for endable actions
      const endOperations: OperationConfigIR[] = [];
      if (isEndableAction) {
        endOperations.push(
          {
            id: crypto.randomUUID(),
            systemName: 'requestAction',
            operationData: { systemName: actionName },
            sourceLocation: getSourceLocation(item),
          },
          {
            id: crypto.randomUUID(),
            systemName: 'endAction',
            operationData: actionOperationData ? { actionOperationData } : {},
            sourceLocation: getSourceLocation(item),
          }
        );
      }

      // Create timeline action for this sequence item
      actions.push({
        id: crypto.randomUUID(),
        name: `sequence-${actionName}-${start}-${end}`,
        duration: { start, end },
        startOperations,
        endOperations,
        sourceLocation: getSourceLocation(item),
      });

      // Update currentTime for next item
      currentTime = end;
    }

    return actions;
  });

/**
 * Transform StaggerBlock → TimelineActionIR[] (T192)
 *
 * Transforms:
 *   stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn for 2s
 *
 * Into timeline actions with staggered start times:
 *   at 0s..2s { fadeIn(".item-1") }        // starts at 0s
 *   at 0.2s..2.2s { fadeIn(".item-2") }    // starts at 0.2s (0 + 200ms)
 *   at 0.4s..2.4s { fadeIn(".item-3") }    // starts at 0.4s (0 + 400ms)
 *
 * previousEventEndTime is the starting point (baseTime) for the first stagger item.
 */
const transformStaggerBlock = (
  stagger: StaggerBlock,
  previousEventEndTime: number,
  program: Program,
  allActions: ActionDefinition[]
): Effect.Effect<TimelineActionIR[], TransformError> =>
  Effect.gen(function* (_) {
    const actions: TimelineActionIR[] = [];

    // Transform delay expression to milliseconds
    const delayExpr = yield* _(transformTimeExpression(stagger.delay, previousEventEndTime));
    const delay = evaluateTimeExpression(delayExpr);

    // Transform duration expression to milliseconds
    const durationExpr = yield* _(transformTimeExpression(stagger.duration, previousEventEndTime));
    const duration = evaluateTimeExpression(durationExpr);

    // Transform items array
    const itemsValue = yield* _(transformExpression(stagger.items));

    // Items must be an array
    if (!Array.isArray(itemsValue)) {
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `Stagger items must be an array, got ${typeof itemsValue}`,
          location: getSourceLocation(stagger),
        })
      );
    }

    // Check which form: action call or inline operations
    const hasActionCall = !!stagger.actionCall;

    if (hasActionCall) {
      // Form 1: stagger delay items with actionCall for duration
      const actionCall = stagger.actionCall!;
      const actionName = getOperationCallName(actionCall);
      const actionRef = findActionByName(actionName, allActions);

      // Check if this is an endable action or regular action
      const isEndableAction = actionRef?.$type === 'EndableActionDefinition';

      // Generate one timeline action per item
      for (let i = 0; i < itemsValue.length; i++) {
        const item = itemsValue[i];
        const startTime = previousEventEndTime + i * delay;
        const endTime = startTime + duration;

        // Build actionOperationData with the item as first argument
        let actionOperationData: Record<string, JsonValue> | undefined;
        if (actionRef) {
          const parameters = actionRef.parameters || [];

          // First parameter gets the item value
          // Additional parameters come from actionCall args
          if (parameters.length > 0) {
            actionOperationData = {};
            actionOperationData[parameters[0].name] = item;

            // Map remaining parameters from actionCall args
            const args = actionCall.args || [];
            for (let j = 0; j < args.length && j + 1 < parameters.length; j++) {
              const paramName = parameters[j + 1].name;
              const argValue = yield* _(transformExpression(args[j]));
              actionOperationData[paramName] = argValue;
            }
          }
        }

        // Build start and end operations
        const startOperations: OperationConfigIR[] = [
          {
            id: crypto.randomUUID(),
            systemName: 'requestAction',
            operationData: { systemName: actionName },
            sourceLocation: getSourceLocation(stagger),
          },
          {
            id: crypto.randomUUID(),
            systemName: 'startAction',
            operationData: actionOperationData ? { actionOperationData } : {},
            sourceLocation: getSourceLocation(stagger),
          },
        ];

        // End operations: Only generate for endable actions
        const endOperations: OperationConfigIR[] = [];
        if (isEndableAction) {
          endOperations.push(
            {
              id: crypto.randomUUID(),
              systemName: 'requestAction',
              operationData: { systemName: actionName },
              sourceLocation: getSourceLocation(stagger),
            },
            {
              id: crypto.randomUUID(),
              systemName: 'endAction',
              operationData: actionOperationData ? { actionOperationData } : {},
              sourceLocation: getSourceLocation(stagger),
            }
          );
        }

        actions.push({
          id: crypto.randomUUID(),
          name: `stagger-${actionName}-${i}-${startTime}-${endTime}`,
          duration: { start: startTime, end: endTime },
          startOperations,
          endOperations,
          sourceLocation: getSourceLocation(stagger),
        });
      }
    } else {
      // Form 2: stagger delay items for duration [ startOps ] [ endOps ]
      // Generate one timeline action per item with inline operations
      for (let i = 0; i < itemsValue.length; i++) {
        const startTime = previousEventEndTime + i * delay;
        const endTime = startTime + duration;

        // Transform inline operations with stagger scope
        // Inside stagger blocks, @item resolves to @@currentItem
        const staggerScope: ScopeContext = {
          inActionBody: false,
          actionParameters: [],
          loopVariableName: 'item', // Default variable name for stagger items
          scopedConstants: new Map(), // No scoped constants in stagger blocks
        };

        const startOperations: OperationConfigIR[] = [];
        const endOperations: OperationConfigIR[] = [];

        for (const opStmt of stagger.startOps || []) {
          const ops = yield* _(
            transformOperationStatement(opStmt, staggerScope, false, program, allActions)
          );
          startOperations.push(...ops);
        }

        for (const opStmt of stagger.endOps || []) {
          const ops = yield* _(
            transformOperationStatement(opStmt, staggerScope, true, program, allActions)
          );
          endOperations.push(...ops);
        }

        actions.push({
          id: crypto.randomUUID(),
          name: `stagger-inline-${i}-${startTime}-${endTime}`,
          duration: { start: startTime, end: endTime },
          startOperations,
          endOperations,
          sourceLocation: getSourceLocation(stagger),
        });
      }
    }

    return actions;
  });

/**
 * Transform TimedEvent → TimelineActionIR
 *
 * Timed events are regular timeline events with explicit time ranges:
 * 1. Named action invocation: at 0s..5s { fadeIn() }
 * 2. Inline endable action: at 0s..5s [ ... ] [ ... ]
 *
 * T189: Supports relative time expressions (+2s means offset from previousEventEndTime)
 *
 * Constitution VII: Generates UUID for action ID to prevent conflicts when multiple
 * actions exist or configs are merged.
 */
const transformTimedEvent = (
  event: TimedEvent,
  previousEventEndTime: number,
  program: Program,
  allActions: ActionDefinition[]
): Effect.Effect<TimelineActionIR, TransformError> =>
  Effect.gen(function* (_) {
    const timeRange = event.timeRange;
    if (!timeRange) {
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidEvent' as const,
          message: 'Timeline event missing time range',
          location: getSourceLocation(event),
        })
      );
    }

    // Transform start and end times to numbers
    // T189: Pass previousEventEndTime for relative time resolution
    const startExpr = yield* _(transformTimeExpression(timeRange.start, previousEventEndTime));
    const endExpr = yield* _(transformTimeExpression(timeRange.end, previousEventEndTime));
    const start = evaluateTimeExpression(startExpr);
    const end = evaluateTimeExpression(endExpr);

    // Transform the action (either named invocation or inline)
    const action = event.action;
    const startOperations: OperationConfigIR[] = [];
    const endOperations: OperationConfigIR[] = [];

    if (action.$type === 'InlineEndableAction') {
      // Inline endable action: [ ... ] [ ... ]
      for (const opStmt of action.startOperations) {
        const ops = yield* _(
          transformOperationStatement(opStmt, createEmptyScope(), false, program, allActions)
        );
        startOperations.push(...ops);
      }
      for (const opStmt of action.endOperations) {
        const ops = yield* _(
          transformOperationStatement(opStmt, createEmptyScope(), true, program, allActions)
        );
        endOperations.push(...ops);
      }
    } else if (action.$type === 'OperationCall') {
      // T024-T027: Unified syntax - direct action call without braces
      // Example: at 0s..5s fadeIn(".box", 1000)
      // This OperationCall should resolve to an action (validated in validator)

      const callName = getOperationCallName(action);

      // Find the action definition in all actions (includes imported ones)
      const actionDef = findActionByName(callName, allActions);

      if (!actionDef) {
        // Validation should have caught this, but handle defensively
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'ValidationError' as const,
            message: `Action '${callName}' not found. This should have been caught by validation.`,
            location: getSourceLocation(action),
          })
        );
      }

      const isEndableAction = actionDef.$type === 'EndableActionDefinition';

      // Transform arguments to actionOperationData
      let actionOperationData: Record<string, JsonValue> | undefined;
      if (action.args && action.args.length > 0) {
        const parameters = actionDef.parameters || [];

        if (action.args.length !== parameters.length) {
          return yield* _(
            Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'ValidationError' as const,
              message: `Action '${callName}' expects ${parameters.length} arguments but got ${action.args.length}`,
              location: getSourceLocation(action),
            })
          );
        }

        actionOperationData = {};
        for (let i = 0; i < parameters.length; i++) {
          const paramName = parameters[i].name;
          const argValue = yield* _(transformExpression(action.args[i]));
          actionOperationData[paramName] = argValue;
        }
      }

      // Step 1: Request the action instance
      startOperations.push({
        id: crypto.randomUUID(),
        systemName: 'requestAction',
        operationData: {
          systemName: callName,
        },
        sourceLocation: getSourceLocation(action),
      });

      // Step 2: Start the action
      startOperations.push({
        id: crypto.randomUUID(),
        systemName: 'startAction',
        operationData: actionOperationData ? { actionOperationData } : {},
        sourceLocation: getSourceLocation(action),
      });

      // End operations: Only for endable actions
      if (isEndableAction) {
        endOperations.push({
          id: crypto.randomUUID(),
          systemName: 'requestAction',
          operationData: {
            systemName: callName,
          },
          sourceLocation: getSourceLocation(action),
        });

        endOperations.push({
          id: crypto.randomUUID(),
          systemName: 'endAction',
          operationData: actionOperationData ? { actionOperationData } : {},
          sourceLocation: getSourceLocation(action),
        });
      }
    } else if (action.$type === 'ForStatement') {
      // T056: US3 - ForStatement in timeline context
      // Transform the for loop body and add to startOperations
      const forOps = yield* _(
        transformForStatement(action, createEmptyScope(), program, allActions)
      );
      startOperations.push(...forOps);
    } else if (action.$type === 'IfStatement') {
      // T057: US3 - IfStatement in timeline context
      // Transform the if/else branches and add to startOperations
      const ifOps = yield* _(transformIfStatement(action, createEmptyScope(), program, allActions));
      startOperations.push(...ifOps);
    }

    // T173: Validate dependencies in timeline event operations
    yield* _(
      validateOperationSequence(
        startOperations,
        `timeline event at ${start}s..${end}s start operations`
      )
    );
    if (endOperations.length > 0) {
      yield* _(
        validateOperationSequence(
          endOperations,
          `timeline event at ${start}s..${end}s end operations`
        )
      );
    }

    return {
      // Constitution VII: UUID v4 for globally unique action ID
      id: crypto.randomUUID(),
      name: `timeline-action-${start}-${end}`, // Generate name from time range
      duration: {
        start,
        end,
      },
      startOperations,
      endOperations,
      sourceLocation: getSourceLocation(event),
    };
  });

/**
 * Validate operation dependencies in a sequence (T173: Dependency Tracking)
 *
 * Checks that each operation's required dependencies are available from previous operations.
 * Tracks outputs as operations are processed to maintain dependency chain.
 */
const validateOperationSequence = (
  operations: OperationConfigIR[],
  contextName: string
): Effect.Effect<void, TransformError> =>
  Effect.gen(function* (_) {
    const availableOutputs = new Set<string>();

    for (const op of operations) {
      const signature = getOperationSignature(op.systemName);
      if (!signature) {
        continue; // Already validated in transformOperationCall
      }

      // Validate dependencies
      const depErrors = validateDependencies(signature, availableOutputs);
      if (depErrors.length > 0) {
        const firstError = depErrors[0];
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'ValidationError' as const,
            message: `In ${contextName}: ${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
            location: op.sourceLocation || {
              file: undefined,
              line: 1,
              column: 1,
              length: 0,
            },
          })
        );
      }

      // Track outputs for next operation
      trackOutputs(signature, availableOutputs);
    }

    return undefined;
  });

/**
 * Transform Action Definition → EndableActionIR
 *
 * Handles both:
 * - Regular actions: action foo [ ... ]
 * - Endable actions: endable action foo [ ... ] [ ... ]
 *
 * Constitution VII: Generates UUID for action ID
 * T173: Validates operation dependencies
 */
const transformActionDefinition = (
  actionDef: EndableActionDefinition | RegularActionDefinition,
  program: Program,
  allActions: ActionDefinition[]
): Effect.Effect<EndableActionIR, TransformError> =>
  Effect.gen(function* (_) {
    const startOperations: OperationConfigIR[] = [];
    const endOperations: OperationConfigIR[] = [];

    // T230: Create action scope with parameters
    const actionScope: ScopeContext = {
      inActionBody: true,
      actionParameters: (actionDef.parameters || []).map(p => p.name),
      loopVariableName: undefined,
      scopedConstants: new Map(), // Start with empty map for action-scoped constants
    };

    if (actionDef.$type === 'EndableActionDefinition') {
      // Endable action: has start and end operations
      for (const opStmt of actionDef.startOperations) {
        const ops = yield* _(
          transformOperationStatement(opStmt, actionScope, false, program, allActions)
        );
        startOperations.push(...ops);
      }
      for (const opStmt of actionDef.endOperations) {
        const ops = yield* _(
          transformOperationStatement(opStmt, actionScope, false, program, allActions)
        );
        endOperations.push(...ops);
      }
    } else {
      // Regular action: only has operations (treated as start operations)
      for (const opStmt of actionDef.operations) {
        const ops = yield* _(
          transformOperationStatement(opStmt, actionScope, false, program, allActions)
        );
        startOperations.push(...ops);
      }
    }

    // T173: Validate dependencies in operation sequences
    yield* _(
      validateOperationSequence(startOperations, `action '${actionDef.name}' start operations`)
    );
    if (endOperations.length > 0) {
      yield* _(
        validateOperationSequence(endOperations, `action '${actionDef.name}' end operations`)
      );
    }

    return {
      // Constitution VII: UUID v4 for globally unique action ID
      id: crypto.randomUUID(),
      name: actionDef.name,
      startOperations,
      endOperations,
      sourceLocation: getSourceLocation(actionDef),
    };
  });

/**
 * Transform OperationCall → OperationConfigIR
 *
 * Handles function-style operation calls with positional parameters:
 *   selectElement("#title")
 *   animate({ opacity: 1 }, 500, "ease")
 *   setData({ "operationdata.name": $scope.currentItem })
 *
 * Per DSL_DESIGN_DECISIONS.md Q3: Flattens wrapper objects automatically.
 * Constitution VII: Generates UUID for operation ID
 */
const transformOperationCall = (
  opCall: OperationCall,
  scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR, TransformError> =>
  Effect.gen(function* (_) {
    const operationName = getOperationCallName(opCall);
    const args = opCall.args || [];

    // Feature 035 T011: Transform addController into getControllerInstance + addControllerToElement
    // This is handled in transformOperationStatement which can return multiple operations
    // Here we just validate that addController is not called directly (it should be caught by validation)
    if (operationName === 'addController') {
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message:
            'addController is syntactic sugar and should be transformed by transformOperationStatement',
          location: getSourceLocation(opCall),
        })
      );
    }

    // T218: Validate operation before transforming
    const validationResult = validateOperation(operationName, args.length);
    if (!validationResult.success) {
      // Collect all validation errors and fail with first error
      const firstError = validationResult.errors[0];
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
          location: getSourceLocation(opCall),
        })
      );
    }

    // T223: Use parameter mapper to transform arguments to operationData
    const signature = getOperationSignature(operationName);
    if (!signature) {
      // This should never happen after validation, but handle defensively
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `Unknown operation: ${operationName}`,
          location: getSourceLocation(opCall),
        })
      );
    }

    // BUG-001 FIX (T322): Transform Expression arguments to JsonValue before mapping
    // This ensures reference expressions (@@varName, @varName, paramName) are properly
    // transformed to their string representations ($scope.*, $operationdata.*)
    const transformedArgs: JsonValue[] = [];
    for (const arg of args) {
      const value = yield* _(transformExpression(arg, scope));
      transformedArgs.push(value);
    }

    // Map positional arguments to named parameters using operation signature
    const mappingResult = mapParameters(signature, transformedArgs);
    if (!mappingResult.success) {
      // Mapping failed - return first error
      const firstError = mappingResult.errors[0];
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
          location: getSourceLocation(opCall),
        })
      );
    }

    let operationData = mappingResult.operationData as Record<string, JsonValue>;

    // Inside action bodies, parameters that are just forwarding action arguments
    // (i.e., $operationdata.* references) should be omitted from operationData.
    // Eligius already provides these via startAction's actionOperationData.
    if (scope.inActionBody) {
      const filteredData: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(operationData)) {
        // Keep only non-forwarded parameters (literals, expressions, etc.)
        if (typeof value !== 'string' || !value.startsWith('$operationdata.')) {
          filteredData[key] = value;
        }
      }
      operationData = filteredData;
    }

    return {
      // Constitution VII: UUID v4 for operation ID
      id: crypto.randomUUID(),
      systemName: operationName,
      operationData: Object.keys(operationData).length > 0 ? operationData : undefined,
      sourceLocation: getSourceLocation(opCall),
    };
  });

/**
 * Transform OperationStatement → OperationConfigIR[]
 *
 * Handles all operation statement types:
 * - OperationCall: Direct operation invocation
 * - IfStatement: Syntactic sugar for when/otherwise/endWhen
 * - ForStatement: Syntactic sugar for forEach/endForEach
 *
 * Returns an array because control flow statements expand into multiple operations.
 *
 * Constitution VII: Generates UUIDs for all generated operations
 * T177, T180: Implements control flow transformations
 * T230: Accepts scope context for reference resolution
 */
const transformOperationStatement = (
  stmt: OperationStatement,
  scope: ScopeContext = createEmptyScope(),
  isEndOperation: boolean = false,
  program?: Program,
  allActions?: ActionDefinition[]
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    switch (stmt.$type) {
      case 'OperationCall': {
        // Feature 035 T011: Transform addController calls
        // addController('LabelController', "nav.home") →
        //   getControllerInstance({ systemName: 'LabelController' })
        //   addControllerToElement({ translationKey: "nav.home" })
        const operationName = getOperationCallName(stmt);

        if (operationName === 'addController') {
          const args = stmt.args || [];

          // First argument must be controller name (string literal)
          if (args.length === 0 || args[0].$type !== 'StringLiteral') {
            return yield* _(
              Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'ValidationError' as const,
                message:
                  'addController requires controller name as first argument (string literal)',
                location: getSourceLocation(stmt),
              })
            );
          }

          const controllerName = args[0].value;

          // Validate controller exists
          if (!isController(controllerName)) {
            return yield* _(
              Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'ValidationError' as const,
                message: `Unknown controller: '${controllerName}'`,
                location: getSourceLocation(stmt),
              })
            );
          }

          const controller = getController(controllerName);
          if (!controller) {
            return yield* _(
              Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'InvalidAction' as const,
                message: `Failed to get controller metadata for '${controllerName}'`,
                location: getSourceLocation(stmt),
              })
            );
          }

          // Transform remaining arguments (args[1+]) to parameter object
          const paramArgs = args.slice(1);
          const parameterData: Record<string, JsonValue> = {};

          for (let i = 0; i < paramArgs.length; i++) {
            const param = controller.parameters[i];
            if (!param) {
              return yield* _(
                Effect.fail({
                  _tag: 'TransformError' as const,
                  kind: 'ValidationError' as const,
                  message: `Too many parameters for controller '${controllerName}'`,
                  location: getSourceLocation(stmt),
                })
              );
            }

            const argValue = yield* _(transformExpression(paramArgs[i], scope));
            parameterData[param.name] = argValue;
          }

          // Generate two operations: getControllerInstance + addControllerToElement
          const operations: OperationConfigIR[] = [];

          // 1. getControllerInstance
          operations.push({
            id: crypto.randomUUID(),
            systemName: 'getControllerInstance',
            operationData: { systemName: controllerName },
            sourceLocation: getSourceLocation(stmt),
          });

          // 2. addControllerToElement
          operations.push({
            id: crypto.randomUUID(),
            systemName: 'addControllerToElement',
            operationData: parameterData,
            sourceLocation: getSourceLocation(stmt),
          });

          return operations;
        }

        // T058: US3 - Check if this is an action call (for control flow in timelines)
        // If allActions is provided, search there (includes imported actions)
        // Otherwise, if program is passed, use it; otherwise walk up container chain
        const actionDef = allActions
          ? findActionByName(operationName, allActions)
          : findActionByName(operationName, program ?? (yield* _(getProgram(stmt))));

        if (actionDef) {
          // This is an action call - expand to requestAction + startAction/endAction
          // If isEndOperation is true and action is endable, use endAction instead of startAction

          // Transform arguments to actionOperationData
          let actionOperationData: Record<string, JsonValue> | undefined;
          if (stmt.args && stmt.args.length > 0) {
            const parameters = actionDef.parameters || [];

            // Check argument count matches parameter count
            if (stmt.args.length !== parameters.length) {
              return yield* _(
                Effect.fail({
                  _tag: 'TransformError' as const,
                  kind: 'ValidationError' as const,
                  message: `Action '${operationName}' expects ${parameters.length} argument(s) but got ${stmt.args.length}. Expected: ${parameters.map(p => p.name).join(', ')}`,
                  location: getSourceLocation(stmt),
                })
              );
            }

            actionOperationData = {};
            for (let i = 0; i < parameters.length; i++) {
              const paramName = parameters[i].name;
              const argValue = yield* _(transformExpression(stmt.args[i], scope));
              actionOperationData[paramName] = argValue;
            }
          }

          const operations: OperationConfigIR[] = [];

          // requestAction
          operations.push({
            id: crypto.randomUUID(),
            systemName: 'requestAction',
            operationData: { systemName: operationName },
            sourceLocation: getSourceLocation(stmt),
          });

          // startAction or endAction (depending on context and action type)
          const isEndableAction = actionDef.$type === 'EndableActionDefinition';
          const actionOperation = isEndOperation && isEndableAction ? 'endAction' : 'startAction';

          operations.push({
            id: crypto.randomUUID(),
            systemName: actionOperation,
            operationData: actionOperationData ? { actionOperationData } : {},
            sourceLocation: getSourceLocation(stmt),
          });

          return operations;
        }

        // Not an action - treat as normal operation
        const op = yield* _(transformOperationCall(stmt, scope));
        return [op];
      }

      case 'IfStatement':
        // If/else → when/otherwise/endWhen sequence
        return yield* _(transformIfStatement(stmt, scope, program, allActions));

      case 'ForStatement':
        // For loop → forEach/endForEach sequence
        return yield* _(transformForStatement(stmt, scope, program, allActions));

      case 'VariableDeclaration':
        // Action-scoped variable → setVariable operation
        return yield* _(transformVariableDeclaration(stmt, scope));

      case 'BreakStatement':
        // break → breakForEach operation
        return yield* _(transformBreakStatement(stmt, scope));

      case 'ContinueStatement':
        // continue → continueForEach operation
        return yield* _(transformContinueStatement(stmt, scope));

      default:
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Unknown operation statement type: ${(stmt as any).$type}`,
            location: getSourceLocation(stmt),
          })
        );
    }
  });

/**
 * Transform IfStatement → when/otherwise/endWhen operations (T177)
 *
 * Transforms:
 *   if (condition) {
 *     thenOps
 *   } else {
 *     elseOps
 *   }
 *
 * Into:
 *   when(condition)
 *   [thenOps...]
 *   otherwise()
 *   [elseOps...]
 *   endWhen()
 *
 * For if-without-else, the otherwise() operation is omitted.
 */
const transformIfStatement = (
  stmt: IfStatement,
  scope: ScopeContext = createEmptyScope(),
  program?: Program,
  allActions?: ActionDefinition[]
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    const operations: OperationConfigIR[] = [];

    // Transform condition expression
    const condition = yield* _(transformExpression(stmt.condition, scope));

    // 1. when(condition)
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'when',
      operationData: {
        condition,
      },
      sourceLocation: getSourceLocation(stmt),
    });

    // 2. Transform then operations (recursively handle nested control flow)
    // Create a new scope for the then block (constants don't leak to else)
    const thenScope: ScopeContext = {
      ...scope,
      scopedConstants: new Map(scope.scopedConstants), // Clone the map
    };
    for (const thenOp of stmt.thenOps) {
      const ops = yield* _(
        transformOperationStatement(thenOp, thenScope, false, program, allActions)
      );
      operations.push(...ops);
    }

    // 3. otherwise() and else operations (if present)
    if (stmt.elseOps.length > 0) {
      operations.push({
        id: crypto.randomUUID(),
        systemName: 'otherwise',
        operationData: {},
        sourceLocation: getSourceLocation(stmt),
      });

      // Create a new scope for the else block (separate from then block)
      const elseScope: ScopeContext = {
        ...scope,
        scopedConstants: new Map(scope.scopedConstants), // Clone the map
      };
      for (const elseOp of stmt.elseOps) {
        const ops = yield* _(
          transformOperationStatement(elseOp, elseScope, false, program, allActions)
        );
        operations.push(...ops);
      }
    }

    // 4. endWhen()
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'endWhen',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    });

    return operations;
  });

/**
 * Transform ForStatement → forEach/endForEach operations (T180)
 *
 * Transforms:
 *   for (item in collection) {
 *     body
 *   }
 *
 * Into:
 *   forEach(collection, "item")
 *   [body operations...]
 *   endForEach()
 *
 * The item variable name is passed to forEach so Eligius can set it in the operation data context.
 */
const transformForStatement = (
  stmt: ForStatement,
  scope: ScopeContext = createEmptyScope(),
  program?: Program,
  allActions?: ActionDefinition[]
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    const operations: OperationConfigIR[] = [];

    // Transform collection expression
    const collection = yield* _(transformExpression(stmt.collection, scope));

    // 1. forEach(collection, itemName)
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'forEach',
      operationData: {
        collection,
        itemName: stmt.itemName,
      },
      sourceLocation: getSourceLocation(stmt),
    });

    // 2. Transform loop body (recursively handle nested control flow)
    // T232: Create loop scope with variable aliasing
    // Inside the loop, @@itemName resolves to @@currentItem
    // Also clone scopedConstants so loop-scoped constants don't leak out
    const loopScope: ScopeContext = {
      ...scope,
      loopVariableName: stmt.itemName, // e.g., "item" in for (item in items)
      scopedConstants: new Map(scope.scopedConstants), // Clone the map
    };

    for (const bodyOp of stmt.body) {
      const ops = yield* _(
        transformOperationStatement(bodyOp, loopScope, false, program, allActions)
      );
      operations.push(...ops);
    }

    // 3. endForEach()
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'endForEach',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    });

    return operations;
  });

/**
 * Transform BreakStatement → breakForEach operation
 *
 * Transforms:
 *   break
 *
 * Into:
 *   { systemName: 'breakForEach', operationData: {} }
 */
const transformBreakStatement = (
  stmt: BreakStatement,
  _scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.succeed([
    {
      id: crypto.randomUUID(),
      systemName: 'breakForEach',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    },
  ]);

/**
 * Transform ContinueStatement → continueForEach operation
 *
 * Transforms:
 *   continue
 *
 * Into:
 *   { systemName: 'continueForEach', operationData: {} }
 */
const transformContinueStatement = (
  stmt: ContinueStatement,
  _scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.succeed([
    {
      id: crypto.randomUUID(),
      systemName: 'continueForEach',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    },
  ]);

/**
 * Transform VariableDeclaration → setVariable operation (T184)
 *
 * Transforms:
 *   const duration = 500
 *
 * Into:
 *   setVariable("duration", 500)
 *
 * This creates an action-scoped variable that can be referenced with @varName.
 */
const transformVariableDeclaration = (
  stmt: VariableDeclaration,
  scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    // ACTION-SCOPED CONSTANT FOLDING: Try to evaluate at compile time
    // Build a combined constant map: global constants + action-scoped constants
    const combinedConstants = new Map([
      ...currentConstantMap.entries(),
      ...scope.scopedConstants.entries(),
    ]);

    const evalResult = evaluateExpression(stmt.value, combinedConstants);

    if (evalResult.canEvaluate) {
      // This is a constant that can be inlined!
      // Add it to the scope's constant map for later references
      scope.scopedConstants.set(stmt.name, {
        name: stmt.name,
        value: evalResult.value!,
        type: typeof evalResult.value as 'string' | 'number' | 'boolean',
        sourceLocation: {
          line: stmt.$cstNode?.range.start.line ?? 0,
          column: stmt.$cstNode?.range.start.character ?? 0,
          file: stmt.$document?.uri.fsPath ?? 'unknown',
        },
      });

      // Don't generate setVariable operation - constant will be inlined
      return [];
    }

    // Cannot evaluate - treat as regular variable
    // Transform the value expression normally
    const value = yield* _(transformExpression(stmt.value, scope));

    // Create setVariable operation
    const operation: OperationConfigIR = {
      id: crypto.randomUUID(),
      systemName: 'setVariable',
      operationData: {
        name: stmt.name,
        value,
      },
      sourceLocation: getSourceLocation(stmt),
    };

    return [operation];
  });

/**
 * Transform Expression → JsonValue
 *
 * Handles all expression types:
 * - Literals: strings, numbers, booleans, null
 * - Object literals: { key: value, ... }
 * - Array literals: [value1, value2, ...]
 * - Property chain references: $scope.currentItem
 * - System property references: @@currentItem (T229-T232)
 * - Variable references: @varName (T233)
 * - Parameter references: paramName (T231)
 * - Binary expressions: 10 + 5
 */
const transformExpression = (
  expr: Expression,
  scope: ScopeContext = createEmptyScope()
): Effect.Effect<JsonValue, TransformError> =>
  Effect.gen(function* (_) {
    switch (expr.$type) {
      case 'StringLiteral':
        return expr.value;

      case 'NumberLiteral':
        return expr.value;

      case 'BooleanLiteral':
        return expr.value;

      case 'NullLiteral':
        return null;

      case 'ObjectLiteral': {
        const obj: Record<string, JsonValue> = {};
        for (const prop of expr.properties) {
          const key = typeof prop.key === 'string' ? prop.key : prop.key;
          const value = yield* _(transformExpression(prop.value, scope));
          obj[key] = value;
        }
        return obj;
      }

      case 'ArrayLiteral': {
        const arr: JsonValue[] = [];
        for (const element of expr.elements) {
          const value = yield* _(transformExpression(element, scope));
          arr.push(value);
        }
        return arr;
      }

      case 'PropertyChainReference': {
        // Property chain reference: $scope.currentItem
        // For now, serialize to string format that Eligius understands
        const scope = expr.scope;
        const properties = expr.properties.join('.');
        return `${scope}.${properties}`;
      }

      case 'VariableReference': {
        // Variable reference: @varName (T233)
        // CONSTANT FOLDING: Check if this is a constant first
        if (!expr.variable?.ref) {
          return yield* _(
            Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'InvalidExpression' as const,
              message: `Undefined variable reference (linking failed)`,
              location: getSourceLocation(expr),
            })
          );
        }

        const varName = expr.variable.ref.name;

        // Check action-scoped constants first (more specific scope)
        if (scope.scopedConstants.has(varName)) {
          const constant = scope.scopedConstants.get(varName)!;
          return constant.value; // Inline action-scoped constant
        }

        // Check global constants
        if (currentConstantMap.has(varName)) {
          const constant = currentConstantMap.get(varName)!;
          return constant.value; // Inline global constant
        }

        // Otherwise, it's a runtime scope variable
        return `$scope.variables.${varName}`;
      }

      case 'SystemPropertyReference': {
        // System property reference: @@varName (T232)
        // Compiles to $scope.varName
        // Special case: @@loopVar → @@currentItem (aliased)
        let propertyName = expr.name;

        // If this matches the current loop variable name, alias to currentItem
        if (scope.loopVariableName && expr.name === scope.loopVariableName) {
          propertyName = 'currentItem';
        }

        return `$scope.${propertyName}`;
      }

      case 'ParameterReference': {
        // Parameter reference: bare identifier (T231)
        // Compiles to $operationdata.paramName OR $operationdata.eventArgs[n] (Feature 028 - T020)
        // Now uses cross-reference to Parameter
        if (!expr.parameter?.ref) {
          return yield* _(
            Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'InvalidExpression' as const,
              message: `Undefined parameter reference (linking failed)`,
              location: getSourceLocation(expr),
            })
          );
        }

        // Validation: parameter references only valid inside actions
        // (This is now enforced by ScopeProvider, but double-check here)
        if (!scope.inActionBody) {
          return yield* _(
            Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'InvalidExpression' as const,
              message: `Parameter reference '${expr.parameter.ref.name}' is only valid inside action bodies`,
              location: getSourceLocation(expr),
            })
          );
        }

        const paramName = expr.parameter.ref.name;

        // T020: Check if this is an event action parameter (use index instead of name)
        if (scope.eventActionParameters?.has(paramName)) {
          const index = scope.eventActionParameters.get(paramName)!;
          return `$operationData.eventArgs[${index}]`;
        }

        // Regular action parameter (use name)
        return `$operationdata.${paramName}`;
      }

      case 'BinaryExpression': {
        // Binary expression: 10 + 5
        // Evaluate at compile time if both sides are literals
        const left = yield* _(transformExpression(expr.left, scope));
        const right = yield* _(transformExpression(expr.right, scope));

        // If both are numbers, evaluate
        if (typeof left === 'number' && typeof right === 'number') {
          switch (expr.op) {
            case '+':
              return left + right;
            case '-':
              return left - right;
            case '*':
              return left * right;
            case '/':
              return left / right;
            case '%':
              return left % right;
            case '**':
              return left ** right;
            case '>':
              return left > right;
            case '<':
              return left < right;
            case '>=':
              return left >= right;
            case '<=':
              return left <= right;
            case '==':
              return left === right;
            case '!=':
              return left !== right;
          }
        }

        // Otherwise, serialize as expression string
        return `(${JSON.stringify(left)} ${expr.op} ${JSON.stringify(right)})`;
      }

      case 'UnaryExpression': {
        // Unary expression: !flag, -value
        const operand = yield* _(transformExpression(expr.operand, scope));

        switch (expr.op) {
          case '!':
            return !operand;
          case '-':
            if (typeof operand === 'number') {
              return -operand;
            }
            return `(-${JSON.stringify(operand)})`;
          default:
            return yield* _(
              Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'InvalidExpression' as const,
                message: `Unknown unary operator: ${(expr as any).op}`,
                location: getSourceLocation(expr),
              })
            );
        }
      }

      default:
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Unknown expression type: ${(expr as any).$type}`,
            location: getSourceLocation(expr),
          })
        );
    }
  });

/**
 * Transform TimeExpression → TimeExpression IR
 *
 * T189: Supports relative time expressions (+2s) by adding offset to previousEventEndTime
 */
/**
 * Event Action Parameter Context (Feature 028 - T017)
 *
 * Maps parameter names to their indices in the eventArgs array.
 * Used during event action transformation to resolve parameter references.
 */
export interface EventActionContext {
  parameters: Map<string, number>;
}

/**
 * Create Parameter Context (Feature 028 - T017)
 *
 * Builds a parameter index map from an array of parameter names.
 * Each parameter is assigned its zero-based index in the array.
 *
 * @param params - Array of parameter names
 * @returns EventActionContext with parameter→index mapping
 */
export function createParameterContext(params: string[]): EventActionContext {
  const parameters = new Map<string, number>();
  params.forEach((name, index) => {
    parameters.set(name, index);
  });
  return { parameters };
}

/**
 * Transform Event Action Definition → IEventActionConfiguration (Feature 028 - T010, T021)
 *
 * Transforms an EventActionDefinition AST node into an Eligius IEventActionConfiguration.
 * This is a public API function used by tests and is synchronous (not wrapped in Effect).
 *
 * T021: Uses full transformation pipeline with event action parameter context.
 * Event action parameters are mapped to $operationData.eventArgs[n] by index.
 *
 * Event actions have:
 * - name: Action name
 * - id: UUID v4 (Constitution Principle VII)
 * - eventName: Event to listen for
 * - eventTopic: Optional topic namespace (undefined if not present)
 * - startOperations: Transformed operations array
 * - NO endOperations (event actions don't have end operations)
 *
 * @param eventAction - EventActionDefinition AST node
 * @returns IEventActionConfiguration JSON
 */
export function transformEventAction(
  eventAction: EventActionDefinition
): IEventActionConfiguration {
  // Guard: eventName is required for transformation (grammar allows optional for completion)
  if (!eventAction.eventName) {
    throw new Error(`Event action "${eventAction.name}" is missing event name`);
  }

  // T021: Create parameter context for this event action
  const parameterNames = eventAction.parameters.map(p => p.name);
  const parameterContext = createParameterContext(parameterNames);

  // Create scope with event action parameter indices
  const eventActionScope: ScopeContext = {
    inActionBody: true,
    actionParameters: parameterNames,
    loopVariableName: undefined,
    scopedConstants: new Map(),
    eventActionParameters: parameterContext.parameters, // T021: Pass parameter indices
  };

  // Transform each operation using the full pipeline
  const startOperations: IOperationConfiguration<TOperationData>[] = [];
  for (const opStmt of eventAction.operations) {
    const operationIRs = Effect.runSync(
      transformOperationStatement(opStmt, eventActionScope, false, undefined, undefined)
    );

    // Convert OperationConfigIR[] to IOperationConfiguration[]
    for (const opIR of operationIRs) {
      startOperations.push({
        id: opIR.id,
        systemName: opIR.systemName,
        operationData: opIR.operationData,
      });
    }
  }

  // Build IEventActionConfiguration
  return {
    id: crypto.randomUUID(), // UUID v4 per Constitution Principle VII
    name: eventAction.name,
    eventName: eventAction.eventName, // Safe: guarded above
    eventTopic: eventAction.eventTopic, // undefined if not present
    startOperations,
    // Note: No endOperations property - event actions don't have end operations
  };
}

export const transformTimeExpression = (
  expr: AstTimeExpression,
  previousEventEndTime: number = 0
): Effect.Effect<TimeExpression, TransformError> =>
  Effect.gen(function* (_) {
    switch (expr.$type) {
      case 'TimeLiteral': {
        // Convert time value to seconds based on unit
        const valueInSeconds = convertTimeToSeconds(expr.value, expr.unit);
        return {
          kind: 'literal' as const,
          value: valueInSeconds,
        };
      }
      case 'RelativeTimeLiteral': {
        // T189: Relative time expression: +2s means previousEventEndTime + 2
        // Convert to absolute time by adding to previous event's end
        const offsetInSeconds = convertTimeToSeconds(expr.value, expr.unit);
        return {
          kind: 'literal' as const,
          value: previousEventEndTime + offsetInSeconds,
        };
      }
      case 'PropertyChainReference': {
        // Property reference in time expression
        const scope = expr.scope;
        const properties = expr.properties.join('.');
        return {
          kind: 'variable' as const,
          name: `${scope}.${properties}`,
        };
      }
      case 'BinaryTimeExpression': {
        const left = yield* _(transformTimeExpression(expr.left, previousEventEndTime));
        const right = yield* _(transformTimeExpression(expr.right, previousEventEndTime));
        return {
          kind: 'binary' as const,
          op: expr.op as '+' | '-' | '*' | '/',
          left,
          right,
        };
      }
      default:
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Unknown time expression type: ${(expr as any).$type}`,
            location: getSourceLocation(expr),
          })
        );
    }
  });

/**
 * Helper: Convert time value to seconds based on unit
 *
 * Supports: ms (milliseconds), s (seconds), m (minutes), h (hours)
 * Default unit is seconds if not specified.
 */
function convertTimeToSeconds(value: number, unit?: string): number {
  if (!unit || unit === 's') {
    return value;
  }
  switch (unit) {
    case 'ms':
      return value / 1000;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    default:
      return value; // Default to seconds
  }
}

/**
 * Helper: Evaluate TimeExpression to a numeric value
 *
 * Performs constant folding for binary expressions (e.g., 10 + 5 → 15).
 * Variables are not supported yet and will throw an error.
 */
function evaluateTimeExpression(expr: TimeExpression): number {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'variable':
      // TODO: Variable support requires a symbol table/environment
      throw new Error(`Variables not yet supported in time expressions: ${expr.name}`);
    case 'binary': {
      const left = evaluateTimeExpression(expr.left);
      const right = evaluateTimeExpression(expr.right);
      switch (expr.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
      }
    }
  }
}

/**
 * Helper to extract source location from any AST node
 */
function getSourceLocation(node: any): SourceLocation {
  const cstNode = node.$cstNode;
  if (cstNode) {
    return {
      file: undefined,
      line: cstNode.range.start.line + 1, // Langium uses 0-based, we use 1-based
      column: cstNode.range.start.character + 1,
      length: cstNode.range.end.offset - cstNode.range.start.offset,
    };
  }

  // Fallback if CST node not available
  return {
    file: undefined,
    line: 1,
    column: 1,
    length: 0,
  };
}

/**
 * T024: Helper to get Program from any AST node
 */
function getProgram(node: any): Effect.Effect<Program, TransformError> {
  let current = node;
  while (current) {
    if (current.$type === 'Program') {
      return Effect.succeed(current as Program);
    }
    current = current.$container;
  }

  return Effect.fail({
    _tag: 'TransformError' as const,
    kind: 'ValidationError' as const,
    message: 'Could not find Program root',
    location: getSourceLocation(node),
  });
}
