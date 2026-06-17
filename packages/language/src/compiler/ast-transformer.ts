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
import type { TransformError } from '../errors/index.js';
import type { Program } from '../generated/ast.js';
import {
  getActions,
  getEventActions,
  getTimelines,
  getVariables,
} from '../utils/program-helpers.js';
import { buildConstantMap } from './constant-folder.js';
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
import { resolveImports } from './transformers/library-imports.js';
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
    const constantMap = buildConstantMap(program);

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
    const variableDeclarations = getVariables(program).filter(el => !constantMap.has(el.name));

    // Transform program-level variables to initActions
    // T274: initActions must be IEndableActionConfiguration[], not IOperationConfiguration[]
    const initActions: EndableActionIR[] = [];
    if (variableDeclarations.length > 0) {
      const properties: Record<string, JsonValue> = {};

      // Add regular variable declarations (non-constants)
      for (const varDecl of variableDeclarations) {
        const value = yield* transformExpression(varDecl.value, createEmptyScope(constantMap));
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
    const importedActions = yield* resolveImports(program);

    // Merge imported and local actions - imported actions come first, then local actions
    // This ensures local actions can override imported ones if there are name conflicts
    // (though validation should prevent this)
    const actionDefinitions = [...importedActions, ...localActions];

    // Transform action definitions to Eligius EndableActionIR format
    const actions: EndableActionIR[] = [];
    for (const actionDef of actionDefinitions) {
      const action = yield* transformActionDefinition(
        actionDef,
        program,
        actionDefinitions,
        constantMap
      );
      actions.push(action);
    }
    // T011: Extract and transform event action definitions (Feature 028 - User Story 1)
    const eventActionNodes = getEventActions(program);
    const eventActions: IEventActionConfiguration[] = [];
    for (const eventActionDef of eventActionNodes) {
      const eventAction = yield* transformEventAction(eventActionDef, constantMap);
      eventActions.push(eventAction);
    }

    // Build TimelineConfigIR from all timeline nodes
    const timelines: TimelineConfigIR[] = [];
    for (const timelineNode of timelineNodes) {
      const timelineConfig = yield* buildTimelineConfig(
        timelineNode,
        program,
        actionDefinitions,
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
