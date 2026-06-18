/**
 * Timeline-construct transformation (timed events, sequence/stagger blocks, and
 * the full timeline config).
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import type {
  ActionDefinition,
  Program,
  SequenceBlock,
  StaggerBlock,
  TimedEvent,
  Timeline,
} from '../../generated/ast.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { findActionByName } from '../name-resolver.js';
import type { ConstantMap } from '../types/constant-folding.js';
import type {
  JsonValue,
  OperationConfigIR,
  TimelineActionIR,
  TimelineConfigIR,
} from '../types/eligius-ir.js';
import { buildActionCallOperations } from './action-call-operations.js';
import { mapProviderToTimelineType } from './config-builder.js';
import { transformExpression } from './expression-transformer.js';
import {
  transformForStatement,
  transformIfStatement,
  transformOperationStatement,
  validateOperationSequence,
} from './operation-transformer.js';
import { createEmptyScope, type ScopeContext } from './scope.js';
import { getSourceLocation } from './source-location.js';
import { evaluateTimeExpression, transformTimeExpression } from './time-transformer.js';

/**
 * Build TimelineConfigIR from timeline node
 *
 * This creates the full Eligius TimelineConfiguration structure.
 *
 * Constitution VII: Generates UUID for timeline ID to ensure global uniqueness
 * when configs are merged or multiple timelines exist.
 */
export const buildTimelineConfig = (
  timeline: Timeline,
  program: Program,
  allActions: ActionDefinition[],
  programConstants: ConstantMap
): Effect.Effect<TimelineConfigIR, TransformError> =>
  Effect.gen(function* () {
    // T189/T190: Transform timeline events to TimelineActionIR with relative time support
    // Track previous event end time for relative time expressions and sequence blocks
    const timelineActions: TimelineActionIR[] = [];
    let previousEventEndTime = 0;

    for (const event of timeline.events) {
      // T190/T192: Check event type (sequence, stagger, or timed)
      if (event.$type === 'SequenceBlock') {
        // Transform sequence block into multiple timeline actions
        const sequenceActions = yield* transformSequenceBlock(
          event,
          previousEventEndTime,
          program,
          allActions,
          programConstants
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
        const staggerActions = yield* transformStaggerBlock(
          event,
          previousEventEndTime,
          program,
          allActions,
          programConstants
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
        const timelineAction = yield* transformTimedEvent(
          event,
          previousEventEndTime,
          program,
          allActions,
          programConstants
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
  allActions: ActionDefinition[],
  programConstants: ConstantMap
): Effect.Effect<TimelineActionIR[], TransformError> =>
  Effect.gen(function* () {
    const actions: TimelineActionIR[] = [];
    let currentTime = previousEventEndTime;

    for (const item of sequence.items) {
      // Transform duration expression to number
      const durationExpr = yield* transformTimeExpression(item.duration, currentTime);
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
          return yield* Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'ValidationError' as const,
            message: `Action '${actionName}' expects ${parameters.length} arguments but got ${args.length}`,
            location: getSourceLocation(item),
          });
        }

        actionOperationData = {};
        for (let i = 0; i < parameters.length; i++) {
          const paramName = parameters[i].name;
          const argValue = yield* transformExpression(args[i], createEmptyScope(programConstants));
          actionOperationData[paramName] = argValue;
        }
      }

      // Build start and end operations for this sequence item
      const itemLocation = getSourceLocation(item);
      const startOperations: OperationConfigIR[] = buildActionCallOperations(
        actionName,
        actionOperationData,
        itemLocation,
        'startAction'
      );

      // End operations: Only generate for endable actions
      const endOperations: OperationConfigIR[] = isEndableAction
        ? buildActionCallOperations(actionName, actionOperationData, itemLocation, 'endAction')
        : [];

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
  allActions: ActionDefinition[],
  programConstants: ConstantMap
): Effect.Effect<TimelineActionIR[], TransformError> =>
  Effect.gen(function* () {
    const actions: TimelineActionIR[] = [];

    // Transform delay expression to milliseconds
    const delayExpr = yield* transformTimeExpression(stagger.delay, previousEventEndTime);
    const delay = evaluateTimeExpression(delayExpr);

    // Transform duration expression to milliseconds
    const durationExpr = yield* transformTimeExpression(stagger.duration, previousEventEndTime);
    const duration = evaluateTimeExpression(durationExpr);

    // Transform items array
    const itemsValue = yield* transformExpression(
      stagger.items,
      createEmptyScope(programConstants)
    );

    // Items must be an array
    if (!Array.isArray(itemsValue)) {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'ValidationError' as const,
        message: `Stagger items must be an array, got ${typeof itemsValue}`,
        location: getSourceLocation(stagger),
      });
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
              const argValue = yield* transformExpression(
                args[j],
                createEmptyScope(programConstants)
              );
              actionOperationData[paramName] = argValue;
            }
          }
        }

        // Build start and end operations
        const staggerLocation = getSourceLocation(stagger);
        const startOperations: OperationConfigIR[] = buildActionCallOperations(
          actionName,
          actionOperationData,
          staggerLocation,
          'startAction'
        );

        // End operations: Only generate for endable actions
        const endOperations: OperationConfigIR[] = isEndableAction
          ? buildActionCallOperations(actionName, actionOperationData, staggerLocation, 'endAction')
          : [];

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
          programConstants,
        };

        const startOperations: OperationConfigIR[] = [];
        const endOperations: OperationConfigIR[] = [];

        for (const opStmt of stagger.startOps || []) {
          const ops = yield* transformOperationStatement(
            opStmt,
            staggerScope,
            false,
            program,
            allActions
          );
          startOperations.push(...ops);
        }

        for (const opStmt of stagger.endOps || []) {
          const ops = yield* transformOperationStatement(
            opStmt,
            staggerScope,
            true,
            program,
            allActions
          );
          endOperations.push(...ops);
        }

        // Bake the compile-time item / index / length into the inline ops.
        // Unlike a real `for`, a `stagger` emits independent timeline actions with
        // no runtime `forEach`, so `$scope.currentItem` (what `@@item` /
        // `@@currentItem` compile to) is never populated — references must be
        // resolved now. (Ops inside a nested forEach span are skipped: their
        // currentItem belongs to that inner loop, not the stagger item.)
        const item = itemsValue[i];
        bakeStaggerOps(startOperations, item, i, itemsValue.length);
        bakeStaggerOps(endOperations, item, i, itemsValue.length);

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
 * Substitute a stagger item's compile-time value for the `$scope.*` sentinels
 * that `@@currentItem` / `@@item` / `@@loopIndex` / `@@loopLength` compile to.
 *
 * Inline `stagger` blocks have no runtime `forEach`, so those scope properties
 * are never populated — but the item, index and length are known at compile time
 * (the items array must be a literal), so they're baked directly here, mirroring
 * how the action-call form bakes the item into `actionOperationData`.
 */
function bakeStaggerValue(
  value: JsonValue,
  item: JsonValue,
  index: number,
  length: number
): JsonValue {
  if (typeof value === 'string') {
    if (value === '$scope.currentItem') return item;
    if (value === '$scope.loopIndex') return index;
    if (value === '$scope.loopLength') return length;
    if (value.startsWith('$scope.currentItem.')) {
      // Property access on an object item, e.g. `@@currentItem.label`.
      const path = value.slice('$scope.currentItem.'.length).split('.');
      let cur: JsonValue = item;
      for (const key of path) {
        if (cur !== null && typeof cur === 'object' && !Array.isArray(cur) && key in cur) {
          cur = (cur as Record<string, JsonValue>)[key];
        } else {
          return value; // can't resolve at compile time — leave untouched
        }
      }
      return cur;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(v => bakeStaggerValue(v, item, index, length));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = bakeStaggerValue(v, item, index, length);
    }
    return out;
  }
  return value;
}

/**
 * Bake stagger item/index/length into a flat operation list, in place.
 *
 * Operations inside a nested `forEach … endForEach` span are skipped — their
 * `$scope.currentItem` belongs to that inner loop (which `forEach` populates at
 * runtime), not to the stagger item.
 */
function bakeStaggerOps(
  ops: OperationConfigIR[],
  item: JsonValue,
  index: number,
  length: number
): void {
  let forEachDepth = 0;
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.systemName === 'endForEach') {
      forEachDepth = Math.max(0, forEachDepth - 1);
      continue;
    }
    if (forEachDepth === 0 && op.operationData) {
      ops[k] = {
        ...op,
        operationData: bakeStaggerValue(
          op.operationData as JsonValue,
          item,
          index,
          length
        ) as Record<string, JsonValue>,
      };
    }
    if (op.systemName === 'forEach') forEachDepth++;
  }
}

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
  allActions: ActionDefinition[],
  programConstants: ConstantMap
): Effect.Effect<TimelineActionIR, TransformError> =>
  Effect.gen(function* () {
    const timeRange = event.timeRange;
    if (!timeRange) {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'InvalidEvent' as const,
        message: 'Timeline event missing time range',
        location: getSourceLocation(event),
      });
    }

    // Transform start and end times to numbers
    // T189: Pass previousEventEndTime for relative time resolution
    const startExpr = yield* transformTimeExpression(timeRange.start, previousEventEndTime);
    const endExpr = yield* transformTimeExpression(timeRange.end, previousEventEndTime);
    const start = evaluateTimeExpression(startExpr);
    const end = evaluateTimeExpression(endExpr);

    // Transform the action (either named invocation or inline)
    const action = event.action;
    const startOperations: OperationConfigIR[] = [];
    const endOperations: OperationConfigIR[] = [];

    if (action.$type === 'InlineEndableAction') {
      // Inline endable action: [ ... ] [ ... ]
      for (const opStmt of action.startOperations) {
        const ops = yield* transformOperationStatement(
          opStmt,
          createEmptyScope(programConstants),
          false,
          program,
          allActions
        );
        startOperations.push(...ops);
      }
      for (const opStmt of action.endOperations) {
        const ops = yield* transformOperationStatement(
          opStmt,
          createEmptyScope(programConstants),
          true,
          program,
          allActions
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
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `Action '${callName}' not found. This should have been caught by validation.`,
          location: getSourceLocation(action),
        });
      }

      const isEndableAction = actionDef.$type === 'EndableActionDefinition';

      // Transform arguments to actionOperationData
      let actionOperationData: Record<string, JsonValue> | undefined;
      if (action.args && action.args.length > 0) {
        const parameters = actionDef.parameters || [];

        if (action.args.length !== parameters.length) {
          return yield* Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'ValidationError' as const,
            message: `Action '${callName}' expects ${parameters.length} arguments but got ${action.args.length}`,
            location: getSourceLocation(action),
          });
        }

        actionOperationData = {};
        for (let i = 0; i < parameters.length; i++) {
          const paramName = parameters[i].name;
          const argValue = yield* transformExpression(
            action.args[i],
            createEmptyScope(programConstants)
          );
          actionOperationData[paramName] = argValue;
        }
      }

      // Expand to requestAction + startAction (and requestAction + endAction for
      // endable actions)
      const actionLocation = getSourceLocation(action);
      startOperations.push(
        ...buildActionCallOperations(callName, actionOperationData, actionLocation, 'startAction')
      );

      // End operations: Only for endable actions
      if (isEndableAction) {
        endOperations.push(
          ...buildActionCallOperations(callName, actionOperationData, actionLocation, 'endAction')
        );
      }
    } else if (action.$type === 'ForStatement') {
      // T056: US3 - ForStatement in timeline context
      // Transform the for loop body and add to startOperations
      const forOps = yield* transformForStatement(
        action,
        createEmptyScope(programConstants),
        program,
        allActions
      );
      startOperations.push(...forOps);
    } else if (action.$type === 'IfStatement') {
      // T057: US3 - IfStatement in timeline context
      // Transform the if/else branches and add to startOperations
      const ifOps = yield* transformIfStatement(
        action,
        createEmptyScope(programConstants),
        program,
        allActions
      );
      startOperations.push(...ifOps);
    }

    // T173: Validate dependencies in timeline event operations
    yield* validateOperationSequence(
      startOperations,
      `timeline event at ${start}s..${end}s start operations`
    );
    if (endOperations.length > 0) {
      yield* validateOperationSequence(
        endOperations,
        `timeline event at ${start}s..${end}s end operations`
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
