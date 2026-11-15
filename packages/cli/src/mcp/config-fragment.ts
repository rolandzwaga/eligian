/**
 * Spec 058 phase 2 (FR-013, SC-004(6); plan D1): the config fragment.
 *
 * One implementation of the id stripping and keying, shared by the docs
 * generator's literate probes (`configFragment`) and `eligian_compile`'s
 * `fragment` view (`fragmentOf`): actions keyed by name, timelines by uri, no
 * `id` at any depth (ids are random per compile). With an Eligian map, every
 * returned action carries its source `{ file, line, column }`.
 */
import type { EligianMap, IEngineConfiguration } from '@eligian/language';

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

/** `value` with every `id` key removed, at any depth: ids are random per compile. */
export function withoutIds(value: unknown): Json {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, nested]) => key !== 'id' && nested !== undefined)
        .map(([key, nested]) => [key, withoutIds(nested)])
    );
  }
  return value as Json;
}

type Timeline = IEngineConfiguration['timelines'][number];
type TimelineAction = Timeline['timelineActions'][number];
type Action = IEngineConfiguration['actions'][number];
type EventAction = NonNullable<IEngineConfiguration['eventActions']>[number];

/** The source of action `id` from the map, if it has a location. */
function sourceOf(id: string, map: EligianMap | undefined): { source?: Json } {
  const location = map?.actions[id]?.location;
  if (!location) return {};
  const file = location.file ?? map?.source;
  return {
    source: {
      ...(file !== undefined ? { file } : {}),
      line: location.line,
      column: location.column,
    },
  };
}

const actionPart = (action: Action, map?: EligianMap): Json =>
  withoutIds({
    startOperations: action.startOperations,
    endOperations: action.endOperations,
    ...sourceOf(action.id, map),
  });

const eventActionPart = (action: EventAction, map?: EligianMap): Json =>
  withoutIds({
    eventName: action.eventName,
    eventTopic: action.eventTopic,
    startOperations: action.startOperations,
    ...sourceOf(action.id, map),
  });

const timelinePart = (
  timeline: Timeline,
  actions: readonly TimelineAction[],
  map?: EligianMap
): Json =>
  withoutIds({
    type: timeline.type,
    duration: timeline.duration,
    timelineActions: actions.map(action => ({
      ...(action.name ? { name: action.name } : {}),
      duration: action.duration,
      startOperations: action.startOperations,
      endOperations: action.endOperations,
      ...sourceOf(action.id, map),
    })),
  });

/** The part of a compiled configuration a probe shows, keyed by action name / timeline uri. */
export function configFragment(config: IEngineConfiguration): Json {
  const actions = Object.fromEntries(
    config.actions.map(action => [action.name, actionPart(action)])
  );
  const timelines = Object.fromEntries(
    config.timelines.map(timeline => [
      timeline.uri,
      timelinePart(timeline, timeline.timelineActions),
    ])
  );
  const initActions = config.initActions ?? [];
  return {
    actions,
    timelines,
    ...(initActions.length > 0 ? { initActions: withoutIds(initActions) } : {}),
  };
}

export type FragmentSelection =
  /** A timeline by its config index */
  | { readonly timeline: number }
  /** A named action, else an event action, by name */
  | { readonly action: string }
  /** Any action (init, named, event or timeline) by its id: a line selection resolves to one */
  | { readonly mapActionId: string };

/**
 * One part of `config` in the probe shape: `{ timelines: { [uri]: … } }`,
 * `{ actions | eventActions | initActions: { [name]: … } }`; a timeline action
 * selected by id comes in its timeline, alone. With `map`, each action gains
 * `source: { file, line, column }`. `undefined` when nothing matches.
 */
export function fragmentOf(
  config: IEngineConfiguration,
  selection: FragmentSelection,
  map?: EligianMap
): Json | undefined {
  if ('timeline' in selection) {
    const timeline = config.timelines[selection.timeline];
    if (!timeline) return undefined;
    return { timelines: { [timeline.uri]: timelinePart(timeline, timeline.timelineActions, map) } };
  }
  if ('action' in selection) {
    const action = config.actions.find(candidate => candidate.name === selection.action);
    if (action) return { actions: { [action.name]: actionPart(action, map) } };
    const event = config.eventActions?.find(candidate => candidate.name === selection.action);
    if (event) return { eventActions: { [event.name]: eventActionPart(event, map) } };
    return undefined;
  }
  const id = selection.mapActionId;
  const init = config.initActions?.find(candidate => candidate.id === id);
  if (init) return { initActions: { [init.name]: actionPart(init, map) } };
  const action = config.actions.find(candidate => candidate.id === id);
  if (action) return { actions: { [action.name]: actionPart(action, map) } };
  const event = config.eventActions?.find(candidate => candidate.id === id);
  if (event) return { eventActions: { [event.name]: eventActionPart(event, map) } };
  for (const timeline of config.timelines) {
    const timelineAction = timeline.timelineActions.find(candidate => candidate.id === id);
    if (timelineAction) {
      return { timelines: { [timeline.uri]: timelinePart(timeline, [timelineAction], map) } };
    }
  }
  return undefined;
}
