/**
 * Eligian map (audit feature idea #14): from the compiled Eligius JSON back to
 * the .eligian source, for runtime errors and the live playhead.
 *
 * The IR's SourceMap is keyed by the ids the emitted configuration keeps, so
 * the map is built from the optimized IR: every action (init, named, event and
 * timeline) with its source location and, per phase, each operation's system
 * name, location and the action it calls (requestAction). The CLI writes it as
 * `<out>.eligian-map.json` (`--eligian-map`); the preview uses it directly.
 *
 * Eligius reports a failing timeline action as (actionId, phase, operation
 * system name, operation index), where the operation is the innermost one:
 * when it failed inside an action the timeline action called, the index is
 * that action's. {@link locateEngineError} follows those calls.
 */
import type { IEngineConfiguration, IOperationConfiguration, TOperationData } from 'eligius';
import type { SourceLocation } from './types/common.js';
import type { EligiusIR } from './types/eligius-ir.js';

export interface EligianMapOperation {
  readonly systemName: string;
  readonly location?: SourceLocation;
  /** For requestAction: the name of the requested action */
  readonly calls?: string;
}

export type EligianMapActionKind = 'init' | 'action' | 'event' | 'timeline';

export interface EligianMapAction {
  readonly name: string;
  readonly kind: EligianMapActionKind;
  readonly location?: SourceLocation;
  readonly start: readonly EligianMapOperation[];
  readonly end: readonly EligianMapOperation[];
  /** Timeline actions: the timeline's uri (as compiled) */
  readonly timelineUri?: string;
  /** Timeline actions: the time range in seconds; no end for an open-ended action */
  readonly duration?: { readonly start: number; readonly end?: number };
}

export interface EligianMap {
  readonly version: 1;
  /** The compiled .eligian file; locations without a `file` are in it (set by the CLI) */
  readonly source?: string;
  /** By action id (the ids in the compiled configuration) */
  readonly actions: Readonly<Record<string, EligianMapAction>>;
}

/** Build the map for a compiled (optimized) IR. */
export function buildEligianMap(ir: EligiusIR): EligianMap {
  const { config, sourceMap } = ir;
  const actions: Record<string, EligianMapAction> = {};
  const operations = (ops: readonly IOperationConfiguration<TOperationData>[] | undefined) =>
    (ops ?? []).map(
      (op): EligianMapOperation => ({
        systemName: op.systemName,
        location: sourceMap.operations.get(op.id),
        ...(op.systemName === 'requestAction' &&
        typeof (op.operationData as { systemName?: unknown } | undefined)?.systemName === 'string'
          ? { calls: (op.operationData as { systemName: string }).systemName }
          : {}),
      })
    );
  const add = (
    kind: EligianMapActionKind,
    list: IEngineConfiguration['actions'] | undefined,
    location: (id: string) => SourceLocation | undefined
  ) => {
    for (const action of list ?? []) {
      actions[action.id] = {
        name: action.name,
        kind,
        location: location(action.id),
        start: operations(action.startOperations),
        end: operations(action.endOperations),
      };
    }
  };

  add('init', config.initActions, id => sourceMap.actions.get(id));
  add('action', config.actions, id => sourceMap.actions.get(id));
  for (const action of config.eventActions ?? []) {
    actions[action.id] = {
      name: action.name,
      kind: 'event',
      location: sourceMap.actions.get(action.id),
      start: operations(action.startOperations),
      end: [],
    };
  }
  for (const timeline of config.timelines ?? []) {
    for (const action of timeline.timelineActions ?? []) {
      actions[action.id] = {
        name: action.name,
        kind: 'timeline',
        location: sourceMap.timelineActions.get(action.id),
        start: operations(action.startOperations),
        end: operations(action.endOperations),
        timelineUri: timeline.uri,
        duration:
          action.duration.end === undefined || action.duration.end < 0
            ? { start: action.duration.start }
            : { start: action.duration.start, end: action.duration.end },
      };
    }
  }
  return { version: 1, actions };
}

/** What Eligius' `error` event says about a failing action (IEngineActionError). */
export interface EngineErrorInfo {
  readonly actionId: string;
  readonly phase: 'start' | 'end';
  readonly operationSystemName?: string;
  readonly operationIndex?: number;
}

export interface LocatedEngineError {
  /** The failing timeline action */
  readonly action: EligianMapAction;
  /** The failing operation, when it could be identified */
  readonly operation?: EligianMapOperation;
  /** Names of the actions the timeline action called on the way to the operation */
  readonly via: readonly string[];
  /** Where to report: the operation, else the action */
  readonly location?: SourceLocation;
}

const MAX_CALL_DEPTH = 8;

/**
 * Find the source of an engine error: the operation at the reported index in
 * the action's phase when its system name matches, otherwise the first action
 * it calls (through requestAction + startAction / endAction, recursively)
 * whose operation at that index matches. Falls back to the action itself.
 */
export function locateEngineError(
  map: EligianMap,
  error: EngineErrorInfo
): LocatedEngineError | undefined {
  const action = map.actions[error.actionId];
  if (!action) return undefined;
  const byName = new Map<string, EligianMapAction>();
  for (const candidate of Object.values(map.actions)) {
    if (candidate.kind === 'action' && !byName.has(candidate.name)) {
      byName.set(candidate.name, candidate);
    }
  }

  const { operationIndex: index, operationSystemName: systemName } = error;
  const search = (
    ops: readonly EligianMapOperation[],
    via: readonly string[],
    depth: number
  ): { operation: EligianMapOperation; via: readonly string[] } | undefined => {
    if (index === undefined) return undefined;
    const direct = ops[index];
    if (direct && (systemName === undefined || direct.systemName === systemName)) {
      return { operation: direct, via };
    }
    if (depth >= MAX_CALL_DEPTH) return undefined;
    for (let i = 0; i < ops.length; i++) {
      const called = ops[i].calls ? byName.get(ops[i].calls!) : undefined;
      if (!called) continue;
      // requestAction is followed by startAction (its start ops) or endAction (its end ops)
      const phase = ops[i + 1]?.systemName === 'endAction' ? called.end : called.start;
      const found = search(phase, [...via, called.name], depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  const found = search(error.phase === 'end' ? action.end : action.start, [], 0);
  return {
    action,
    operation: found?.operation,
    via: found?.via ?? [],
    location: found?.operation.location ?? action.location,
  };
}

/** The timeline actions of `timelineUri` running at `position` (seconds), closed ranges excluded. */
export function activeTimelineActions(
  map: EligianMap,
  timelineUri: string,
  position: number
): EligianMapAction[] {
  return Object.values(map.actions).filter(
    action =>
      action.kind === 'timeline' &&
      action.timelineUri === timelineUri &&
      action.duration?.end !== undefined &&
      action.duration.start <= position &&
      position < action.duration.end
  );
}
