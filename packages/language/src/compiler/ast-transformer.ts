/**
 * AST Transformer: Langium AST → Eligius IR
 *
 * This module orchestrates the transformation of a parsed Langium AST into our
 * internal Intermediate Representation (IR), which is optimized for further
 * compilation stages (type checking, optimization, emission).
 *
 * The per-construct transformers live under `transformers/` (W2 decomposition,
 * CODE_ANALYSIS); this file is the composition root that wires them together via
 * the public {@link transformAST} entry point. `transformEventAction` and
 * `createParameterContext` are re-exported here so existing importers keep
 * working unchanged.
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
import { AstUtils } from 'langium';
import { OperationDataflow } from '../dataflow/operation-dataflow.js';
import type { TransformError } from '../errors/index.js';
import type { Program } from '../generated/ast.js';
import {
  getEventActions,
  getInteractionStatements,
  getTimelines,
  getVariables,
} from '../utils/program-helpers.js';
import { isTimeConstant } from '../utils/time-constants.js';
import { buildConstantMapWithFailures } from './constant-folder.js';
import {
  transformActionDefinition,
  transformEventAction,
} from './transformers/action-transformer.js';
import {
  buildSourceMap,
  convertTimelineConfigToEligius,
  createDefaultConfiguration,
  generateLayoutTemplate,
  generateTimelineProviderSettings,
  stripSourceLocation,
  transformLanguagesBlock,
} from './transformers/config-builder.js';
import { transformExpression } from './transformers/expression-transformer.js';
import { resolveActionScopes, resolveCompilerAction } from './transformers/library-imports.js';
import {
  buildNavTargetAction,
  buildPlaybackAction,
  interactionActionName,
  resolveInteractionPosition,
  timelineUri,
} from './transformers/navigate-operations.js';
import { createEmptyScope, createParameterContext } from './transformers/scope.js';
import { getSourceLocation } from './transformers/source-location.js';
import { buildTimelineConfig } from './transformers/timeline-transformer.js';
import type {
  EligiusIR,
  EndableActionIR,
  IEndableActionConfiguration,
  IEngineConfiguration,
  IEventActionConfiguration,
  ITimelineConfiguration,
  JsonValue,
  OperationConfigIR,
  SourceMap,
  TimelineConfigIR,
  TTimelineProviderSettings,
} from './types/eligius-ir.js';

// Re-exported for backward compatibility: these were defined in this module
// before the W2 decomposition and are imported from here by tests and callers.
export { createParameterContext, transformEventAction };

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
  Effect.gen(function* () {
    // CONSTANT FOLDING (T008): Build constant map FIRST
    // This map will be used throughout transformation to inline constant values.
    // B3: kept local and threaded through scopes (no module-level state) so
    // concurrent compilations cannot clobber each other.
    const { constants: constantMap, failures: htmlImportFailures } =
      buildConstantMapWithFailures(program);

    // An HTML import that cannot be loaded must fail the compile: otherwise
    // `@name` falls through to a `$globaldata.name` that nothing ever sets.
    const failedImport = htmlImportFailures[0];
    if (failedImport) {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'InvalidImport' as const,
        message: `Cannot load HTML import '${failedImport.name}' (${failedImport.node.path}): ${failedImport.message}`,
        location: getSourceLocation(failedImport.node),
      });
    }

    // Find all timelines (validation ensures at least one exists)
    const timelineNodes = getTimelines(program);
    if (timelineNodes.length === 0) {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'InvalidTimeline' as const,
        message: 'No timeline found in program',
        location: getSourceLocation(program),
      });
    }

    // Extract program-level variable declarations (T182: Global variables)
    // CONSTANT FOLDING (T008): Filter out constants - they will be inlined, not stored in globalData
    // FEATURE 015: HTML imports are treated as constants (loaded in buildConstantMap, inlined during transformation)
    // Idea #10: time constants (`const beat = 7s`) only exist at compile time, in times
    const variableDeclarations = getVariables(program).filter(
      el => !constantMap.has(el.name) && !isTimeConstant(el)
    );

    // Transform program-level variables to initActions
    // T274: initActions must be IEndableActionConfiguration[], not IOperationConfiguration[]
    const initActions: EndableActionIR[] = [];
    if (variableDeclarations.length > 0) {
      const properties: Record<string, JsonValue> = {};

      // Add regular variable declarations (non-constants)
      for (const varDecl of variableDeclarations) {
        const value = yield* transformExpression(varDecl.value, createEmptyScope(constantMap));
        // Eligius setData targets need the dollar prefix ($globaldata.x): it
        // reads the target as the first key segment minus its first character
        properties[`$globaldata.${varDecl.name}`] = value;
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

    // T044-T046 (Feature 023 FR-010, Feature 032 US3): resolve the local and
    // imported actions the program can call, plus every library action they
    // reach. Each action body is compiled against the scope of the document
    // that defines it, so library actions can call their own (private)
    // helpers and the actions their library imports.
    const { programScope, actionsToEmit } = yield* resolveActionScopes(program);

    // Transform action definitions to Eligius EndableActionIR format
    const actions: EndableActionIR[] = [];
    for (const { definition, scope, systemNames } of actionsToEmit) {
      const action = yield* transformActionDefinition(
        definition,
        program,
        scope,
        constantMap,
        systemNames
      );
      actions.push(action);
    }

    // Interaction sugar (navigate, idea #19): emit one synthetic broadcast
    // action per DISTINCT verb (+ target, position). Each `on <event> … <verb>`
    // call site expands to a DOMEventListenerController whose `actions`
    // reference these by name (derived purely from verb, target and position so
    // both sites agree). The engine resolves them via request-action at runtime.
    // A navigate broadcast carries the target timeline's uri: the engine
    // switches timelines by uri, which for a video/audio timeline is its media
    // source, not its name. `run` needs none: it names the called action.
    // Library actions the program reaches can hold interactions too.
    const programDocument = AstUtils.getDocument(program);
    const interactions = new Set(getInteractionStatements(program));
    for (const { definition } of actionsToEmit) {
      if (AstUtils.getDocument(definition) === programDocument) continue;
      for (const statement of getInteractionStatements(definition)) interactions.add(statement);
    }
    const seenInteractionActions = new Set<string>();
    for (const interaction of interactions) {
      if (interaction.verb === 'run') continue;
      const position = yield* resolveInteractionPosition(interaction);
      const name = interactionActionName(interaction.verb, interaction.target, position);
      if (seenInteractionActions.has(name)) {
        continue;
      }
      seenInteractionActions.add(name);
      const location = getSourceLocation(interaction);
      if (interaction.verb !== 'navigate') {
        actions.push(buildPlaybackAction(interaction.verb, position, location));
        continue;
      }
      // An unknown target is reported by the navigate validator
      const target = interaction.target ?? '';
      const targetTimeline = timelineNodes.find(timeline => timeline.name === target);
      const uri = targetTimeline ? timelineUri(targetTimeline) : target;
      actions.push(buildNavTargetAction(target, position, location, uri));
    }

    // T011: Extract and transform event action definitions (Feature 028 - User Story 1)
    // Event actions call actions from the program's scope (local + imported).
    const eventActionNodes = getEventActions(program);
    const eventActions: IEventActionConfiguration[] = [];
    for (const eventActionDef of eventActionNodes) {
      const eventAction = yield* transformEventAction(
        eventActionDef,
        constantMap,
        program,
        programScope
      );
      eventActions.push(eventAction);
    }

    // Build TimelineConfigIR from all timeline nodes
    const timelines: TimelineConfigIR[] = [];
    for (const timelineNode of timelineNodes) {
      const timelineConfig = yield* buildTimelineConfig(
        timelineNode,
        program,
        programScope,
        constantMap
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

    // Operation-data dependencies (spec 047): the same analysis the IDE runs,
    // after transformation so transform errors are reported first
    const [dependencyProblem] = new OperationDataflow({
      resolveAction: resolveCompilerAction,
    }).analyzeDocument(program);
    if (dependencyProblem) {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'ValidationError' as const,
        message: dependencyProblem.message,
        location: getSourceLocation(dependencyProblem.node),
      });
    }

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
