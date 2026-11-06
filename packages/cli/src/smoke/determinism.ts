/**
 * `smoke --determinism` (spec 058 phase 3, FR-030–FR-032; plan B2, P8): the DOM of a program
 * whose timeline is a function of the position is the same at every boundary t, however the
 * engine got there. Per played timeline three fresh engines each run `init`, then
 * `switchTimeline(uri, 0)`, then one path over the boundaries:
 * - linear: ascending seeks (Interpretation I-2)
 * - fresh: for each t, a seek to 0, then to t
 * - end-back: for each t, a seek to the end, then back to t
 * and the state of every layout id (classes, text, style, visible) is compared at each t.
 *
 * The two jump paths visit the boundaries in DESCENDING order (ruling of 2026-11-05 on T015): a
 * seek never resets the DOM, so what an earlier visit left behind is still there at a later one.
 * Visiting the latest t first, each t is reached before any visit that could leave something on
 * the elements the ranges before t touch, and a difference is reported at the first boundary the
 * jump paths visit (the latest), where FR-031's location rule finds the range that ends before it.
 *
 * Import constraint (plan B1, P19): no module-scope side effects, `window` is a parameter, and no
 * value import of jsdom, eligius or jquery.
 */
import type { EligianMap, SourceLocation } from '@eligian/language';
import type { IEligiusEngine, IEngineConfiguration, ITimelineConfiguration } from 'eligius';
import { injectStyles } from './dom-environment.js';
import { inFile } from './engine-error-format.js';
import { elementSnapshot } from './scenario.js';
import { boundaries, type SmokeProblem } from './smoke-runner.js';
import { touchedSelectors } from './touched-selectors.js';

export type PathKind = 'linear' | 'fresh' | 'end-back';

/** The compared state of one element (FR-031): ElementSnapshot without `exists` and `controllers`. */
export interface ComparedState {
  readonly classes: readonly string[];
  readonly text: string;
  readonly style: string;
  readonly visible: boolean;
}
export type LayoutState = Readonly<Record<string, ComparedState>>;

export interface DeterminismEnvironment {
  readonly window: Window & typeof globalThis;
  /** A fresh, not started engine over the runnable config (smokeConfig's createEngine) */
  readonly createEngine: () => IEligiusEngine;
  readonly step: (what: string, run: () => unknown) => Promise<void>;
  /** Every id of config.layoutTemplate (scanLayoutElements(...).ids, as runScenario reads them) */
  readonly layoutIds: readonly string[];
  /** The program's CSS texts (readCssFiles) */
  readonly css: readonly string[];
  readonly resetBody: () => void;
}

/** P8: before a compared snapshot, one every this many ms until two consecutive ones are equal */
const QUIESCE_INTERVAL_MS = 25;
/** P8: … for at most this long; then the last one is compared */
const QUIESCE_MAX_MS = 1000;

const OTHER_PATHS = ['fresh', 'end-back'] as const;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function layoutState(env: DeterminismEnvironment): LayoutState {
  const state: Record<string, ComparedState> = {};
  for (const id of env.layoutIds) {
    const { classes, text, style, visible } = elementSnapshot(env.window, id, () => []);
    state[id] = { classes, text, style, visible };
  }
  return state;
}

/** P8: the state once two snapshots QUIESCE_INTERVAL_MS apart agree (at most QUIESCE_MAX_MS). */
async function quiescentState(env: DeterminismEnvironment): Promise<LayoutState> {
  let previous = layoutState(env);
  for (let waited = 0; waited < QUIESCE_MAX_MS; waited += QUIESCE_INTERVAL_MS) {
    await delay(QUIESCE_INTERVAL_MS);
    const next = layoutState(env);
    if (JSON.stringify(next) === JSON.stringify(previous)) return next;
    previous = next;
  }
  return previous;
}

/** The state at each of `positions`, reached on one fresh engine by `kind`: init, switchTimeline(uri, 0), the path. */
export async function pathStates(
  env: DeterminismEnvironment,
  timeline: ITimelineConfiguration,
  kind: PathKind,
  positions: readonly number[]
): Promise<ReadonlyMap<number, LayoutState>> {
  const { step } = env;
  const name = timeline.uri;
  const walk = boundaries(timeline);
  const end = walk[walk.length - 1] ?? 0;
  const wanted = [...new Set(positions)].sort((a, b) => a - b);
  // Linear play passes every boundary up to the last wanted position; the jump paths visit the
  // wanted positions latest first (see the header)
  const visits =
    kind === 'linear'
      ? [...new Set([...walk.filter(t => t <= (wanted[wanted.length - 1] ?? 0)), ...wanted])].sort(
          (a, b) => a - b
        )
      : [...wanted].reverse();

  env.resetBody();
  const removeStyles = injectStyles(env.window, env.css);
  const engine = env.createEngine();
  const states = new Map<number, LayoutState>();
  try {
    await step(`determinism (${kind}) init`, () => engine.init());
    await step(`determinism (${kind}) switch to '${name}'`, () =>
      engine.switchTimeline(timeline.uri, 0)
    );
    for (const t of visits) {
      if (kind === 'fresh')
        await step(`determinism (fresh) seek 0s in '${name}'`, () => engine.seek(0));
      if (kind === 'end-back')
        await step(`determinism (end-back) seek ${end}s in '${name}'`, () => engine.seek(end));
      await step(`determinism (${kind}) seek ${t}s in '${name}'`, () => engine.seek(t));
      if (wanted.includes(t)) states.set(t, await quiescentState(env));
    }
    await step(`determinism (${kind}) stop`, () => engine.stop());
    await step(`determinism (${kind}) destroy`, () => engine.destroy());
  } catch (error) {
    // A started engine keeps playing until it is destroyed
    engine.destroy().catch(() => {});
    throw error;
  } finally {
    removeStyles();
  }
  return states;
}

type PathValues<T> = { readonly linear: T; readonly fresh: T; readonly 'end-back': T };

/** One difference at one boundary: its FR-032 key (without the timeline) and the three values. */
interface Difference {
  readonly key: string;
  readonly id: string;
  /** `class '<c>'`, `text`, `style` or `visible` */
  readonly what: string;
  readonly className?: string;
  readonly values: PathValues<string | boolean>;
}

function differences(id: string, states: PathValues<ComparedState>): Difference[] {
  const found: Difference[] = [];
  const differs = (values: PathValues<string | boolean>) =>
    OTHER_PATHS.some(kind => values[kind] !== values.linear);
  const classes = new Set([
    ...states.linear.classes,
    ...states.fresh.classes,
    ...states['end-back'].classes,
  ]);
  for (const className of [...classes].sort()) {
    const values = {
      linear: states.linear.classes.includes(className),
      fresh: states.fresh.classes.includes(className),
      'end-back': states['end-back'].classes.includes(className),
    };
    if (differs(values))
      found.push({
        key: `class ${className}`,
        id,
        what: `class '${className}'`,
        className,
        values,
      });
  }
  for (const property of ['text', 'style', 'visible'] as const) {
    const values = {
      linear: states.linear[property],
      fresh: states.fresh[property],
      'end-back': states['end-back'][property],
    };
    if (differs(values)) found.push({ key: property, id, what: property, values });
  }
  return found;
}

/** FR-031's message: every differing path named, `<n>` the further boundaries (FR-032). */
function message(difference: Difference, at: number, recurs: number): string {
  const { id, what, className, values } = difference;
  const show = (value: string | boolean) =>
    className !== undefined ? (value ? 'present' : 'absent') : JSON.stringify(value);
  const differing = OTHER_PATHS.filter(kind => values[kind] !== values.linear);
  // Paths that agree with each other are named together
  const groups = new Map<string, string[]>();
  for (const kind of differing) {
    const shown = show(values[kind]);
    groups.set(shown, [...(groups.get(shown) ?? []), kind]);
  }
  const others = [...groups].map(
    ([shown, kinds]) => `${shown} after the ${kinds.join(' and ')} path`
  );
  const subject = className !== undefined ? what : `${what} `;
  const linear = `${className !== undefined ? ' ' : ''}${show(values.linear)}`;
  const more = `recurs at ${recurs} more ${recurs === 1 ? 'boundary' : 'boundaries'}`;
  return `element #${id}: ${subject}${linear} after linear play to ${at}s, ${others.join(', ')} (${more})`;
}

/**
 * FR-031 location: among the timeline's ranged actions whose operations touch `#<id>`, the one
 * whose start or end is the latest ≤ t.
 */
function rangeLocation(
  timeline: ITimelineConfiguration,
  config: IEngineConfiguration,
  map: EligianMap,
  id: string,
  at: number
): SmokeProblem['location'] {
  const actions = new Map((config.actions ?? []).map(action => [action.name, action]));
  let best: { time: number; actionId: string } | undefined;
  for (const action of timeline.timelineActions) {
    const { start, end } = action.duration;
    if (end === undefined) continue;
    const touched = new Set([
      ...touchedSelectors(action.startOperations, actions),
      ...touchedSelectors(action.endOperations ?? [], actions),
    ]);
    if (!touched.has(`#${id}`)) continue;
    const times = [start, end].filter(time => time <= at);
    if (times.length === 0) continue;
    const time = Math.max(...times);
    if (best === undefined || time > best.time) best = { time, actionId: action.id };
  }
  return best ? inFile(map.actions[best.actionId]?.location, map) : undefined;
}

/**
 * FR-030–FR-032: one problem per (timeline, element, class | property), at the first boundary the
 * jump paths visit (the latest), with the recurrence count over the others. A timeline's problems
 * are reported once its three paths are compared, before the next timeline's engines are built
 * (FR-033: `ndjson` streams each one as soon as it is found).
 */
export async function checkDeterminism(
  env: DeterminismEnvironment,
  config: IEngineConfiguration,
  map: EligianMap,
  options: {
    readonly names: readonly string[];
    readonly timelines: readonly ITimelineConfiguration[];
    /** Each timeline's declaration, by config index: FR-031's fallback location */
    readonly timelineLocations?: readonly (SourceLocation | undefined)[];
    readonly report: (problem: SmokeProblem) => void;
  }
): Promise<void> {
  for (const timeline of options.timelines) {
    const index = config.timelines.indexOf(timeline);
    const name = options.names[index] ?? timeline.uri;
    const positions = boundaries(timeline);
    const states: PathValues<ReadonlyMap<number, LayoutState>> = {
      linear: await pathStates(env, timeline, 'linear', positions),
      fresh: await pathStates(env, timeline, 'fresh', positions),
      'end-back': await pathStates(env, timeline, 'end-back', positions),
    };
    const found = new Map<string, { difference: Difference; at: number; recurs: number }>();
    for (const at of [...positions].reverse()) {
      const linear = states.linear.get(at);
      const fresh = states.fresh.get(at);
      const endBack = states['end-back'].get(at);
      if (!linear || !fresh || !endBack) continue;
      for (const id of env.layoutIds) {
        const element = { linear: linear[id], fresh: fresh[id], 'end-back': endBack[id] };
        for (const difference of differences(id, element)) {
          const key = `${id}\u0000${difference.key}`;
          const seen = found.get(key);
          if (seen) found.set(key, { ...seen, recurs: seen.recurs + 1 });
          else found.set(key, { difference, at, recurs: 0 });
        }
      }
    }
    for (const { difference, at, recurs } of found.values()) {
      const { values } = difference;
      // FR-031: the range, otherwise the timeline's declaration
      const location =
        rangeLocation(timeline, config, map, difference.id, at) ??
        inFile(options.timelineLocations?.[index], map);
      options.report({
        code: 'position-nondeterministic',
        severity: 'error',
        message: message(difference, at, recurs),
        timeline: name,
        time: at,
        ...(location ? { location } : {}),
        expected: JSON.stringify(values.linear),
        actual: JSON.stringify({ fresh: values.fresh, 'end-back': values['end-back'] }),
      });
    }
  }
}
