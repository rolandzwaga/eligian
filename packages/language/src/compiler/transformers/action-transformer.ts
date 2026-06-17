/**
 * Action and event-action definition transformation.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import type {
  ActionDefinition,
  EndableActionDefinition,
  EventActionDefinition,
  Program,
  RegularActionDefinition,
} from '../../generated/ast.js';
import type { ConstantMap } from '../types/constant-folding.js';
import type {
  EndableActionIR,
  IEventActionConfiguration,
  IOperationConfiguration,
  OperationConfigIR,
  TOperationData,
} from '../types/eligius-ir.js';
import { transformOperationStatement, validateOperationSequence } from './operation-transformer.js';
import { createParameterContext, type ScopeContext } from './scope.js';
import { getSourceLocation } from './source-location.js';

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
export const transformActionDefinition = (
  actionDef: EndableActionDefinition | RegularActionDefinition,
  program: Program,
  allActions: ActionDefinition[],
  programConstants: ConstantMap
): Effect.Effect<EndableActionIR, TransformError> =>
  Effect.gen(function* () {
    const startOperations: OperationConfigIR[] = [];
    const endOperations: OperationConfigIR[] = [];

    // T230: Create action scope with parameters
    const actionScope: ScopeContext = {
      inActionBody: true,
      actionParameters: (actionDef.parameters || []).map(p => p.name),
      loopVariableName: undefined,
      scopedConstants: new Map(), // Start with empty map for action-scoped constants
      programConstants,
    };

    if (actionDef.$type === 'EndableActionDefinition') {
      // Endable action: has start and end operations
      for (const opStmt of actionDef.startOperations) {
        const ops = yield* transformOperationStatement(
          opStmt,
          actionScope,
          false,
          program,
          allActions
        );
        startOperations.push(...ops);
      }
      for (const opStmt of actionDef.endOperations) {
        const ops = yield* transformOperationStatement(
          opStmt,
          actionScope,
          false,
          program,
          allActions
        );
        endOperations.push(...ops);
      }
    } else {
      // Regular action: only has operations (treated as start operations)
      for (const opStmt of actionDef.operations) {
        const ops = yield* transformOperationStatement(
          opStmt,
          actionScope,
          false,
          program,
          allActions
        );
        startOperations.push(...ops);
      }
    }

    // T173: Validate dependencies in operation sequences
    yield* validateOperationSequence(
      startOperations,
      `action '${actionDef.name}' start operations`
    );
    if (endOperations.length > 0) {
      yield* validateOperationSequence(endOperations, `action '${actionDef.name}' end operations`);
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
export const transformEventAction = (
  eventAction: EventActionDefinition,
  programConstants: ConstantMap = new Map()
): Effect.Effect<IEventActionConfiguration, TransformError> =>
  Effect.gen(function* () {
    // Guard: eventName is required for transformation (grammar allows optional for completion).
    // B2: surfaced through the typed error channel instead of a synchronous throw, so a
    // missing eventName produces a structured TransformError rather than crashing the compiler.
    if (!eventAction.eventName) {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'InvalidEvent' as const,
        message: `Event action "${eventAction.name}" is missing event name`,
        location: getSourceLocation(eventAction),
      });
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
      programConstants,
      eventActionParameters: parameterContext.parameters, // T021: Pass parameter indices
    };

    // Transform each operation using the full pipeline.
    // B2: composed with `yield*` so inner failures propagate as TransformError through
    // the Effect channel instead of escaping `Effect.runSync` as an unhandled fiber crash.
    const startOperations: IOperationConfiguration<TOperationData>[] = [];
    for (const opStmt of eventAction.operations) {
      const operationIRs = yield* transformOperationStatement(
        opStmt,
        eventActionScope,
        false,
        undefined,
        undefined
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
  });
