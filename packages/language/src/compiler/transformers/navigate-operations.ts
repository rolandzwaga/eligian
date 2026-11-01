/**
 * Interaction statement expansion helpers (`on <event> "<sel>" <verb>`;
 * `navigate` for hub ↔ chapter timeline switching, audit idea #19 for the
 * other verbs).
 *
 * An `InteractionStatement` (`on click "#sel" navigate "Target" at 5s`) expands
 * to two cooperating pieces:
 *
 *  1. Three call-site operations that attach a DOM event listener:
 *       selectElement(selector)
 *       getControllerInstance("DOMEventListenerController")
 *       addControllerToElement({ eventName, actions: [<action name>] })
 *
 *  2. For every verb but `run`, one synthetic action per DISTINCT verb (and
 *     target, position) that the listener invokes, broadcasting the engine
 *     request: `request-timeline-uri` [uri, position] for navigate (the engine
 *     switches by timeline `uri`, see {@link timelineUri}),
 *     `timeline-play-request`, `timeline-pause-request`,
 *     `timeline-play-toggle-request`, `timeline-stop-request` and
 *     `timeline-seek-request` [position]. `run` names the called action itself
 *     and passes its arguments as the listener's `actionOperationData`.
 *
 * The synthetic action name must match between the call-site expansion
 * (operation-transformer) and the central action generator (ast-transformer),
 * which never share state — so it is derived purely from the verb, target and
 * position via {@link interactionActionName}.
 */
import { Effect } from 'effect';
import { AstUtils } from 'langium';
import type { TransformError } from '../../errors/index.js';
import {
  type TimeExpression as AstTimeExpression,
  type InteractionStatement,
  isProgram,
  isSequenceItem,
  isTimeline,
  type LabeledEvent,
  type Program,
  type Timeline,
} from '../../generated/ast.js';
import { getTimelines } from '../../utils/program-helpers.js';
import { labeledEvents } from '../../utils/time-constants.js';
import type { SourceLocation } from '../types/common.js';
import type { EndableActionIR, JsonValue, OperationConfigIR } from '../types/eligius-ir.js';
import { getSourceLocation } from './source-location.js';
import { resolveTimelineTimes } from './time-resolver.js';
import {
  type EventLabelTimes,
  evaluateTimeExpression,
  transformTimeExpression,
} from './time-transformer.js';

/** Eligius eventbus event the engine listens on to switch timelines. */
const REQUEST_TIMELINE_URI = 'request-timeline-uri';

/** A verb that broadcasts a playback request for the current timeline (idea #19). */
export type PlaybackVerb = 'play' | 'pause' | 'toggle' | 'stop' | 'seek';

/** The eventbus event each playback verb broadcasts (handled by the engine). */
const PLAYBACK_REQUESTS: Record<PlaybackVerb, string> = {
  play: 'timeline-play-request',
  pause: 'timeline-pause-request',
  toggle: 'timeline-play-toggle-request',
  stop: 'timeline-stop-request',
  seek: 'timeline-seek-request',
};

/** The controller used to attach a DOM event listener to an element. */
const DOM_EVENT_LISTENER_CONTROLLER = 'DOMEventListenerController';

/** The controller of `on key "<keys>"` (Eligius 3.1). */
export const KEYBOARD_CONTROLLER = 'KeyboardController';

/**
 * The listener an interaction attaches: the element it is attached to, the
 * controller and its operation data (besides the actions).
 */
export interface InteractionListener {
  readonly selector: string;
  readonly controller: string;
  readonly data: Record<string, JsonValue>;
}

/**
 * The listener of an interaction: a DOMEventListenerController for
 * `on <event> "<sel>"`; a KeyboardController for `on key "<keys>"`, on the
 * `in "<sel>"` element (scope 'element') or else, with the default scope
 * 'document', on the container of the timeline the statement is in, or of the
 * program's first timeline (any element of the presentation will do: the
 * controller listens on the engine root). Undefined when a key listener has
 * no element (in a library action compiled without a program).
 */
export function interactionListener(
  statement: InteractionStatement,
  program?: Program
): InteractionListener | undefined {
  if (statement.keys === undefined) {
    return {
      selector: statement.selector ?? '',
      controller: DOM_EVENT_LISTENER_CONTROLLER,
      data: { eventName: statement.event ?? 'click' },
    };
  }
  if (statement.selector !== undefined) {
    return {
      selector: statement.selector,
      controller: KEYBOARD_CONTROLLER,
      data: { keys: statement.keys, scope: 'element' },
    };
  }
  const owner = program ?? AstUtils.getContainerOfType(statement, isProgram);
  const timeline =
    AstUtils.getContainerOfType(statement, isTimeline) ??
    (owner ? getTimelines(owner)[0] : undefined);
  return timeline
    ? {
        selector: timeline.containerSelector,
        controller: KEYBOARD_CONTROLLER,
        data: { keys: statement.keys },
      }
    : undefined;
}

/**
 * The engine `uri` of a timeline (T272): its name for an animation (`raf`)
 * timeline, its media source for a media timeline (falling back to the name
 * when it has none). Eligius looks timelines up by this uri when switching, so
 * every `request-timeline-uri` broadcast must carry it.
 */
export function timelineUri(timeline: Pick<Timeline, 'name' | 'provider' | 'source'>): string {
  return timeline.provider === 'raf' ? timeline.name : timeline.source || timeline.name;
}

/**
 * FNV-1a 32-bit hash of a string's UTF-16 code units, as 8 lowercase hex digits.
 * Stable across runs and platforms, so the call site and the generator agree.
 */
function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Encode a numeric position as an identifier fragment without collisions.
 * `String(number)` is canonical, and each of its non-alphanumeric characters
 * maps to its own letter (`.` → `p`, `-` → `m`, `+` dropped), so `1e+21` and
 * `1e-21` stay distinct (`1e21` / `1em21`).
 */
function encodePosition(position: number): string {
  return String(position).replace(/\./g, 'p').replace(/-/g, 'm').replace(/\+/g, '');
}

/**
 * Deterministic synthetic action name for a navigate target + position.
 *
 * Pure function of its inputs so the call site and the central generator agree
 * without sharing state. Distinct positions produce distinct names so two
 * navigates to the same timeline at different positions don't collide.
 *
 * The readable slug is lossy (case and punctuation are folded), so a hash of
 * the EXACT target is appended: "Chapter 1" and "chapter-1" share the slug
 * `chapter_1` but get different names, and therefore different broadcast
 * actions (the generator dedupes by this name).
 */
export function syntheticNavActionName(target: string, position: number): string {
  const slug =
    target
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'timeline';
  const posSuffix = position === 0 ? '' : `__${encodePosition(position)}`;
  return `__nav__${slug}_${fnv1aHex(target)}${posSuffix}`;
}

/**
 * Deterministic synthetic action name of an interaction verb (all but `run`):
 * {@link syntheticNavActionName} for navigate, `__on__<verb>` for the playback
 * verbs, with the position for seek.
 */
export function interactionActionName(
  verb: 'navigate' | PlaybackVerb,
  target: string | undefined,
  position: number
): string {
  if (verb === 'navigate') return syntheticNavActionName(target ?? '', position);
  return verb === 'seek' ? `__on__seek__${encodePosition(position)}` : `__on__${verb}`;
}

/**
 * The labels a position may use, with their times: for `seek` those of the
 * timeline the statement is in (the engine seeks the current timeline), for
 * `navigate` those of the target timeline. Labels whose time cannot be
 * resolved at compile time are left out.
 */
export function interactionLabelTimes(statement: InteractionStatement): EventLabelTimes {
  const timeline = labelTimeline(statement);
  const times = new Map<LabeledEvent, { start: number; end: number }>();
  if (!timeline) return times;
  const resolved = resolveTimelineTimes(timeline);
  for (const label of labeledEvents(timeline)) {
    const span = isSequenceItem(label)
      ? resolved.sequenceItems.get(label)
      : resolved.events.get(label)?.[0];
    if (span) times.set(label, span);
  }
  return times;
}

/** The timeline whose labels an interaction position refers to (see {@link interactionLabelTimes}). */
export function labelTimeline(statement: InteractionStatement): Timeline | undefined {
  if (statement.verb === 'seek') return AstUtils.getContainerOfType(statement, isTimeline);
  if (statement.verb !== 'navigate' || statement.target === undefined) return undefined;
  const program = AstUtils.getContainerOfType(statement, isProgram);
  return program && getTimelines(program).find(timeline => timeline.name === statement.target);
}

/**
 * The position (seconds) of a navigate or seek: its constant time expression,
 * or 0 when there is none.
 */
export const resolveInteractionPosition = (
  statement: InteractionStatement
): Effect.Effect<number, TransformError> =>
  resolveNavPosition(statement.position, interactionLabelTimes(statement), statement.verb);

/**
 * Resolve the optional `at <time>` position of a navigate (or a seek position)
 * to a numeric (seconds) value. Absent → 0. Must be a constant time expression;
 * `labels` gives the times of the labels it may use.
 */
export const resolveNavPosition = (
  position: AstTimeExpression | undefined,
  labels: EventLabelTimes = new Map(),
  verb = 'navigate'
): Effect.Effect<number, TransformError> =>
  Effect.gen(function* () {
    if (!position) {
      return 0;
    }
    const ir = yield* transformTimeExpression(position, 0, labels);
    return yield* Effect.try({
      try: () => evaluateTimeExpression(ir),
      catch: () =>
        ({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: `${verb} position must be a constant time expression`,
          location: getSourceLocation(position),
        }) satisfies TransformError,
    });
  });

/**
 * The three call-site operations a DOM-event interaction expands to: a DOM
 * `eventName` listener on `selector` that runs `actionName` (with
 * `actionOperationData`, the arguments of a `run` call).
 */
export function buildNavigateOperations(
  selector: string,
  actionName: string,
  sourceLocation: SourceLocation,
  eventName = 'click',
  actionOperationData?: Record<string, JsonValue>
): OperationConfigIR[] {
  return buildInteractionOperations(
    { selector, controller: DOM_EVENT_LISTENER_CONTROLLER, data: { eventName } },
    actionName,
    sourceLocation,
    actionOperationData
  );
}

/**
 * The three call-site operations an interaction expands to: `selectElement`,
 * `getControllerInstance` and `addControllerToElement` with the listener's
 * data and `actions: [actionName]` (and `actionOperationData`, the arguments
 * of a `run` call).
 */
export function buildInteractionOperations(
  listener: InteractionListener,
  actionName: string,
  sourceLocation: SourceLocation,
  actionOperationData?: Record<string, JsonValue>
): OperationConfigIR[] {
  return [
    {
      id: crypto.randomUUID(),
      systemName: 'selectElement',
      operationData: { selector: listener.selector },
      sourceLocation,
    },
    {
      id: crypto.randomUUID(),
      systemName: 'getControllerInstance',
      operationData: { systemName: listener.controller },
      sourceLocation,
    },
    {
      id: crypto.randomUUID(),
      systemName: 'addControllerToElement',
      operationData: {
        ...listener.data,
        actions: [actionName],
        ...(actionOperationData && Object.keys(actionOperationData).length > 0
          ? { actionOperationData }
          : {}),
      },
      sourceLocation,
    },
  ];
}

/**
 * The synthetic broadcast action that performs the timeline switch.
 *
 * Named after the DSL `target` (so the call sites can derive the name), but
 * broadcasts `uri`, the target timeline's engine uri ({@link timelineUri}).
 * `uri` defaults to `target`, which is the uri of a `raf` timeline.
 */
export function buildNavTargetAction(
  target: string,
  position: number,
  sourceLocation: SourceLocation,
  uri: string = target
): EndableActionIR {
  return {
    id: crypto.randomUUID(),
    name: syntheticNavActionName(target, position),
    startOperations: [
      {
        id: crypto.randomUUID(),
        systemName: 'broadcastEvent',
        operationData: { eventName: REQUEST_TIMELINE_URI, eventArgs: [uri, position] },
        sourceLocation,
      },
    ],
    endOperations: [],
    sourceLocation,
  };
}

/**
 * The synthetic action of a playback verb (idea #19): broadcasts the engine
 * request, with the position for `seek`.
 */
export function buildPlaybackAction(
  verb: PlaybackVerb,
  position: number,
  sourceLocation: SourceLocation
): EndableActionIR {
  return {
    id: crypto.randomUUID(),
    name: interactionActionName(verb, undefined, position),
    startOperations: [
      {
        id: crypto.randomUUID(),
        systemName: 'broadcastEvent',
        // broadcastEvent requires eventArgs
        operationData: {
          eventName: PLAYBACK_REQUESTS[verb],
          eventArgs: verb === 'seek' ? [position] : [],
        },
        sourceLocation,
      },
    ],
    endOperations: [],
    sourceLocation,
  };
}
