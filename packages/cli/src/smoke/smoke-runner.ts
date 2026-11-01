/**
 * `eligian smoke` runner (audit idea #21): plays every timeline of a compiled
 * presentation on the real Eligius engine in jsdom and collects what fails at
 * runtime, located in the .eligian source through the Eligian map (#14).
 *
 * Per timeline: switch to it (its `on enter` runs), seek to every distinct
 * start and end time and to its end (each event's start and end operations
 * run), then switch to the next (its `on leave` runs; the last one is
 * stopped). Collected:
 * - the engine's `error` events (a failing start or end operation, also inside
 *   called actions), located with `locateEngineError`
 * - unhandled promise rejections and `console.error` output while it runs
 * - with `strict`: `selectElement` selectors that match no element
 *
 * Media timelines (video / audio) are skipped: jsdom plays no media.
 */
import {
  type EligianMap,
  type EngineErrorInfo,
  type HostModule,
  locateEngineError,
  type SourceLocation,
} from '@eligian/language';
import type { IEngineConfiguration } from 'eligius';
import { loadHostModule } from '../dev/host-module.js';
import { loadEligius, smokeWindow } from './dom-environment.js';

export interface SmokeProblem {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  /** The timeline it happened in (its name), when known */
  readonly timeline?: string;
  /** The position (seconds) it happened at, when known */
  readonly time?: number;
  /** Where in the source: the failing operation, else its action */
  readonly location?: SourceLocation & { readonly file: string };
}

export interface SmokeTimeline {
  readonly name: string;
  /** The positions the timeline was seeked to */
  readonly boundaries: number;
  /** Why it was not played (media timelines) */
  readonly skipped?: string;
}

export interface SmokeResult {
  readonly timelines: readonly SmokeTimeline[];
  readonly problems: readonly SmokeProblem[];
}

export interface SmokeOptions {
  /** Also report selectors that match no element */
  readonly strict?: boolean;
  /** Idea #24: the program's host module, registered with the engine */
  readonly host?: HostModule;
  /** Longest a single step (init, seek, switch) may take (default 10 s) */
  readonly stepTimeoutMs?: number;
}

type TimelineConfig = IEngineConfiguration['timelines'][number];

/** The id of the element the presentation is rendered into. */
const ROOT_ID = 'eligian-smoke-root';

/** Time for the operations a step started (most are synchronous) to finish. */
const SETTLE_MS = 5;

/**
 * Play every timeline of `config` (compiled from the file `map.source`) and
 * report what fails.
 */
export async function smokeConfig(
  config: IEngineConfiguration,
  map: EligianMap,
  options: SmokeOptions = {}
): Promise<SmokeResult> {
  const { EngineFactory, EligiusResourceImporter } = await loadEligius();
  const window = smokeWindow();
  window.document.body.innerHTML = `<div id="${ROOT_ID}"></div>`;

  const playable = config.timelines.filter(t => t.type !== 'mediaplayer');
  const timelines: SmokeTimeline[] = config.timelines
    .filter(t => t.type === 'mediaplayer')
    .map(t => ({ name: t.uri, boundaries: 0, skipped: 'media timelines need a browser' }));
  const problems: SmokeProblem[] = [];
  if (playable.length === 0) return { timelines, problems };

  const context: { timeline?: string; time?: number } = {};
  const report = (problem: SmokeProblem) => problems.push({ ...context, ...problem });

  const runnable = {
    ...config,
    containerSelector: `#${ROOT_ID}`,
    cssFiles: [],
    timelines: playable,
  } as IEngineConfiguration;

  const restore = captureRuntime(report, config, map, options.strict === true);
  const timeout = options.stepTimeoutMs ?? 10000;
  try {
    // Idea #24: the declared host operations, controllers and functions
    let registrations = {};
    if (options.host) {
      const loaded = await loadHostModule(options.host);
      registrations = loaded.registrations;
      for (const name of loaded.missing) {
        report({
          severity: 'error',
          message: `the extensions module ${options.host.path} does not export ${name}`,
        });
      }
    }
    const { engine } = new EngineFactory(new EligiusResourceImporter(registrations), window, {
      input: { playToggle: false, resize: false },
    }).createEngine(runnable);
    engine.on('error', error => {
      const info = error as unknown as EngineErrorInfo & { message: string; cause?: unknown };
      const located = locateEngineError(map, info);
      const timelineUri = located?.action.timelineUri;
      problems.push({
        severity: 'error',
        message: errorMessage(info, located?.operation?.systemName, located?.via),
        ...context,
        // A raf timeline's uri is its name
        ...(timelineUri !== undefined ? { timeline: timelineUri } : {}),
        location: inFile(located?.location, map),
      });
    });

    const step = async (what: string, run: () => unknown) => {
      await withTimeout(Promise.resolve(run()), timeout, what);
      await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
    };

    await step('init', () => engine.init());
    for (const [index, timeline] of playable.entries()) {
      const name = timeline.uri;
      Object.assign(context, { timeline: name, time: 0 });
      if (index > 0)
        await step(`switch to '${name}'`, () => engine.switchTimeline(timeline.uri, 0));
      const positions = boundaries(timeline);
      for (const position of positions) {
        context.time = position;
        await step(`seek ${position}s in '${name}'`, () => engine.seek(position));
      }
      timelines.push({ name, boundaries: positions.length });
    }
    // The last timeline's on leave
    await step('stop', () => engine.stop());
    await step('destroy', () => engine.destroy());
  } catch (error) {
    report({ severity: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    restore();
  }
  return { timelines, problems };
}

/** 0, every start and end of the timeline's events, and its end, in order. */
export function boundaries(timeline: TimelineConfig): number[] {
  const times = new Set<number>([0]);
  for (const action of timeline.timelineActions) {
    const { start, end } = action.duration;
    if (start >= 0) times.add(start);
    if (end !== undefined && end >= 0) times.add(end);
  }
  if (timeline.duration > 0) times.add(timeline.duration);
  return [...times].sort((a, b) => a - b);
}

function errorMessage(
  error: { message: string; cause?: unknown; phase?: string; operationSystemName?: string },
  operation: string | undefined,
  via: readonly string[] | undefined
): string {
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? '');
  const op = operation ?? error.operationSystemName;
  const where = `${error.phase ?? 'start'} operation${op ? ` ${op}` : ''}`;
  const path = via && via.length > 0 ? ` (in ${via.join(' → ')})` : '';
  return `${where}${path}: ${cause || error.message}`;
}

/** A location with its file (the compiled file when the map does not name one). */
function inFile(
  location: SourceLocation | undefined,
  map: EligianMap
): (SourceLocation & { file: string }) | undefined {
  if (!location) return undefined;
  const file = location.file ?? map.source;
  return file ? { ...location, file } : undefined;
}

/**
 * Collect `console.error`, unhandled rejections and (strict) `selectElement`
 * misses while the presentation runs, and mute its `console.log` output;
 * returns the function that stops it.
 */
function captureRuntime(
  report: (problem: SmokeProblem) => void,
  config: IEngineConfiguration,
  map: EligianMap,
  strict: boolean
): () => void {
  const { error, warn, log, info, debug } = console;
  // The presentation's log() operations are not part of the report
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.error = (...args: unknown[]) => {
    const text = args.map(describe).join(' ');
    // Node's own runtime warnings (`(node:1234) TimeoutNegativeWarning: …`) are not the presentation's
    if (/^\(node:\d+\)/.test(text)) return;
    report({ severity: 'error', message: text });
  };
  console.warn = (...args: unknown[]) => {
    const text = args.map(describe).join(' ');
    const miss = /^selector '(.+)' wasn't found!$/.exec(text);
    if (miss) {
      if (strict) {
        report({
          severity: 'error',
          message: `selectElement("${miss[1]}") matched no element`,
          location: inFile(selectorLocation(config, map, miss[1]), map),
        });
      }
      return;
    }
    report({ severity: 'warning', message: text });
  };
  const onRejection = (reason: unknown) => {
    report({ severity: 'error', message: `unhandled rejection: ${describe(reason)}` });
  };
  process.on('unhandledRejection', onRejection);
  return () => {
    Object.assign(console, { error, warn, log, info, debug });
    process.off('unhandledRejection', onRejection);
  };
}

function describe(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The source of the first `selectElement` with this literal selector. */
function selectorLocation(
  config: IEngineConfiguration,
  map: EligianMap,
  selector: string
): SourceLocation | undefined {
  type Ops = readonly { systemName: string; operationData?: Record<string, unknown> }[];
  const actions: { id: string; startOperations: Ops; endOperations?: Ops }[] = [
    ...(config.actions as never[]),
    ...(config.initActions as never[]),
    ...config.timelines.flatMap(t => t.timelineActions as never[]),
  ];
  for (const action of actions) {
    for (const phase of ['start', 'end'] as const) {
      const ops = phase === 'start' ? action.startOperations : (action.endOperations ?? []);
      const index = ops.findIndex(
        op => op.systemName === 'selectElement' && op.operationData?.selector === selector
      );
      if (index >= 0) return map.actions[action.id]?.[phase][index]?.location;
    }
  }
  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
