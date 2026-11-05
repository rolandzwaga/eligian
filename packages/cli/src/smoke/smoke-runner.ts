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
 *
 * With a scenario (spec 058 FR-034), a fresh engine then runs its steps after the walk, with the
 * program's CSS injected (scenario.ts).
 */
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import {
  type EligianMap,
  type EngineErrorCandidate,
  type EngineErrorInfo,
  type HostModule,
  locateEngineError,
  type SourceLocation,
} from '@eligian/language';
import type { IEngineConfiguration } from 'eligius';
import { type HostRegistrations, loadHostModule } from '../dev/host-module.js';
import { injectStyles, loadEligius, smokeWindow } from './dom-environment.js';
import {
  mediaOnlyProblem,
  runScenario,
  type Scenario,
  type ScenarioStepResult,
} from './scenario.js';

/** The code of every smoke problem (spec 058 FR-032; plan C1). */
export const SMOKE_CODES = [
  'smoke-compile-failed',
  'smoke-engine-error',
  'smoke-console-error',
  'smoke-console-warn',
  'smoke-unhandled-rejection',
  'smoke-selector-miss',
  'smoke-step-timeout',
  'smoke-run-failed',
  'smoke-host-export-missing',
  'host-operation-returned-non-object',
  'smoke-unknown-timeline',
  'scenario-selector-not-found',
  'scenario-unknown-timeline',
  'scenario-media-timeline',
  'scenario-assertion-failed',
  'smoke-timeout',
] as const;
export type SmokeCode = (typeof SMOKE_CODES)[number];

export interface SmokeProblem {
  readonly code: SmokeCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  /** The timeline it happened in (its name), when known */
  readonly timeline?: string;
  /** The position (seconds) it happened at, when known */
  readonly time?: number;
  /** Where in the source: the failing operation, else its action */
  readonly location?: SourceLocation & { readonly file: string };
  /** The scenario step index */
  readonly step?: number;
  /** Scenario assertions: the expected value, as JSON text */
  readonly expected?: string;
  /** Scenario assertions: the actual value, as JSON text */
  readonly actual?: string;
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
  /** The scenario's step results */
  readonly steps?: readonly ScenarioStepResult[];
}

/** Called as the run goes (streaming output). */
export interface SmokeListener {
  readonly timeline?: (timeline: SmokeTimeline) => void;
  readonly problem?: (problem: SmokeProblem) => void;
  readonly step?: (step: ScenarioStepResult) => void;
}

export interface SmokeOptions {
  /** Also report selectors that match no element */
  readonly strict?: boolean;
  /** Idea #24: the program's host module, registered with the engine */
  readonly host?: HostModule;
  /** Longest a single step (init, seek, switch) may take (default 10 s) */
  readonly stepTimeoutMs?: number;
  /** Source names by config timeline index (timelineNames) */
  readonly names?: readonly string[];
  /** Play only these timelines (source names); an unknown one is a smoke-unknown-timeline problem */
  readonly timelines?: readonly string[];
  readonly scenario?: Scenario;
  /** The directory the config's relative cssFiles resolve against (the program's directory) */
  readonly sourceDir?: string;
  readonly listener?: SmokeListener;
}

type TimelineConfig = IEngineConfiguration['timelines'][number];

/** The id of the element the presentation is rendered into. */
const ROOT_ID = 'eligian-smoke-root';

/** Time for the operations a step started (most are synchronous) to finish. */
const SETTLE_MS = 5;

/** A step that did not finish in time (smoke-step-timeout). */
class StepTimeoutError extends Error {}

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
  const window = await smokeWindow();
  window.document.body.innerHTML = `<div id="${ROOT_ID}"></div>`;

  const problems: SmokeProblem[] = [];
  // Where the walk is; the scenario starts from a clean one
  let context: { timeline?: string; time?: number } = {};
  // The one report path: every problem, also to the listener
  const report = (problem: SmokeProblem) => {
    const full = { ...context, ...problem };
    problems.push(full);
    options.listener?.problem?.(full);
  };
  const timelines: SmokeTimeline[] = [];
  const played = (timeline: SmokeTimeline) => {
    timelines.push(timeline);
    options.listener?.timeline?.(timeline);
  };

  // --timeline: only the listed timelines, by source name (a raf timeline's uri is its name)
  const nameOf = (index: number) => options.names?.[index] ?? config.timelines[index].uri;
  const selected = options.timelines;
  if (selected) {
    const declared = config.timelines.map((_, index) => nameOf(index));
    for (const name of selected.filter(name => !declared.includes(name))) {
      report({
        code: 'smoke-unknown-timeline',
        severity: 'error',
        message: `timeline '${name}' is not declared (declared: ${declared.map(n => `'${n}'`).join(', ')})`,
      });
    }
  }
  const walked = config.timelines.filter(
    (_, index) => selected === undefined || selected.includes(nameOf(index))
  );
  const playable = walked.filter(t => t.type !== 'mediaplayer');
  for (const t of walked.filter(t => t.type === 'mediaplayer')) {
    played({ name: t.uri, boundaries: 0, skipped: 'media timelines need a browser' });
  }
  // Skips the walk only: a scenario still runs
  if (playable.length === 0 && options.scenario === undefined) return { timelines, problems };

  // The provider settings of the timeline types left out (media) go too: Eligius refuses
  // provider settings without a timeline of their type
  const runnableWith = (timelines: TimelineConfig[]) =>
    ({
      ...config,
      containerSelector: `#${ROOT_ID}`,
      cssFiles: [],
      timelines,
      timelineProviderSettings: Object.fromEntries(
        Object.entries(config.timelineProviderSettings ?? {}).filter(([type]) =>
          timelines.some(timeline => timeline.type === type)
        )
      ),
    }) as IEngineConfiguration;
  const runnable = runnableWith(playable);

  const restore = captureRuntime(report, config, map, options.strict === true);
  const timeout = options.stepTimeoutMs ?? 10000;
  let steps: ScenarioStepResult[] | undefined;
  try {
    // Idea #24: the declared host operations, controllers and functions
    let registrations: Partial<HostRegistrations> = {};
    if (options.host) {
      const loaded = await loadHostModule(options.host);
      // FR-033: an operation that returns no object hands the next one an empty bag
      registrations = wrapHostOperations(loaded.registrations, name =>
        report({
          code: 'host-operation-returned-non-object',
          severity: 'error',
          message: `host operation ${name} returned no object: return the operation data, or the next operation gets an empty one`,
          location: inFile(operationLocation(map, name), map),
        })
      );
      for (const name of loaded.missing) {
        report({
          code: 'smoke-host-export-missing',
          severity: 'error',
          message: `the extensions module ${options.host.path} does not export ${name}`,
        });
      }
    }
    const createEngine = (configuration: IEngineConfiguration) => {
      const { engine } = new EngineFactory(new EligiusResourceImporter(registrations), window, {
        input: { playToggle: false, resize: false },
      }).createEngine(configuration);
      engine.on('error', error => {
        const info = error as unknown as EngineErrorInfo & { message: string; cause?: unknown };
        const located = locateEngineError(map, info);
        const timelineUri = located?.action.timelineUri;
        report({
          code: 'smoke-engine-error',
          severity: 'error',
          message:
            errorMessage(info, located?.operation?.systemName, located?.via) +
            alsoAt(located?.alternatives ?? [], map),
          // A raf timeline's uri is its name
          ...(timelineUri !== undefined ? { timeline: timelineUri } : {}),
          location: inFile(located?.location, map),
        });
      });
      return engine;
    };

    const step = async (what: string, run: () => unknown) => {
      await withTimeout(Promise.resolve(run()), timeout, what);
      await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
    };

    if (playable.length > 0) {
      const engine = createEngine(runnable);
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
        played({ name, boundaries: positions.length });
      }
      // The last timeline's on leave
      await step('stop', () => engine.stop());
      await step('destroy', () => engine.destroy());
    }

    // FR-034: the scenario, on a fresh engine after the walk (I-10)
    if (options.scenario) {
      context = {};
      const names = config.timelines.map((_, index) => nameOf(index));
      // Every non-media timeline, whatever --timeline says: a navigate step asks for its target
      const scenarioTimelines = config.timelines.filter(t => t.type !== 'mediaplayer');
      if (scenarioTimelines.length === 0) {
        steps = [];
        report(mediaOnlyProblem(names));
      } else {
        window.document.body.innerHTML = `<div id="${ROOT_ID}"></div>`;
        const removeStyles = injectStyles(
          window,
          await readCssFiles(config.cssFiles, options.sourceDir)
        );
        const engine = createEngine(runnableWith(scenarioTimelines));
        const collected: ScenarioStepResult[] = [];
        steps = collected;
        try {
          await runScenario(engine, window, {
            config,
            map,
            names,
            scenario: options.scenario,
            step,
            report,
            onStep: result => {
              collected.push(result);
              options.listener?.step?.(result);
            },
          });
          await step('scenario stop', () => engine.stop());
          await step('scenario destroy', () => engine.destroy());
        } catch (error) {
          // A started engine keeps playing until it is destroyed
          engine.destroy().catch(() => {});
          throw error;
        } finally {
          removeStyles();
        }
      }
    }
  } catch (error) {
    report({
      code: error instanceof StepTimeoutError ? 'smoke-step-timeout' : 'smoke-run-failed',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    restore();
  }
  return steps ? { timelines, problems, steps } : { timelines, problems };
}

/** The texts of the config's CSS files, read relative to the program's directory (FR-034 item 2). */
function readCssFiles(cssFiles: readonly string[], sourceDir = process.cwd()): Promise<string[]> {
  return Promise.all(cssFiles.map(file => fs.readFile(nodePath.resolve(sourceDir, file), 'utf-8')));
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

/**
 * The other operations that match the report: Eligius names only the
 * innermost operation (name and index), which can repeat in the call chain.
 */
function alsoAt(alternatives: readonly EngineErrorCandidate[], map: EligianMap): string {
  const places = alternatives.flatMap(alternative => {
    const at = inFile(alternative.operation.location, map);
    if (!at) return [];
    const path = alternative.via.length > 0 ? ` (in ${alternative.via.join(' → ')})` : '';
    return [`${nodePath.basename(at.file)}:${at.line}:${at.column}${path}`];
  });
  return places.length > 0 ? ` [or at ${places.join(', ')}]` : '';
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
    report({ code: 'smoke-console-error', severity: 'error', message: text });
  };
  console.warn = (...args: unknown[]) => {
    const text = args.map(describe).join(' ');
    const miss = /^selector '(.+)' wasn't found!$/.exec(text);
    if (miss) {
      if (strict) {
        report({
          code: 'smoke-selector-miss',
          severity: 'error',
          message: `selectElement("${miss[1]}") matched no element`,
          location: inFile(selectorLocation(config, map, miss[1]), map),
        });
      }
      return;
    }
    report({ code: 'smoke-console-warn', severity: 'warning', message: text });
  };
  const onRejection = (reason: unknown) => {
    report({
      code: 'smoke-unhandled-rejection',
      severity: 'error',
      message: `unhandled rejection: ${describe(reason)}`,
    });
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

/** The source of the first call of an operation (a host operation's name is its systemName). */
function operationLocation(map: EligianMap, systemName: string): SourceLocation | undefined {
  for (const action of Object.values(map.actions)) {
    for (const operation of [...action.start, ...action.end]) {
      if (operation.systemName === systemName && operation.location) return operation.location;
    }
  }
  return undefined;
}

type Operation = (this: unknown, operationData: unknown) => unknown;

/**
 * FR-033: each host operation, wrapped to report a result (or resolved value) that is not an
 * object, once per operation name; the value is passed on unchanged.
 */
function wrapHostOperations(
  registrations: HostRegistrations,
  onNonObject: (name: string) => void
): HostRegistrations {
  const reported = new Set<string>();
  const check = (name: string, value: unknown) => {
    if ((typeof value === 'object' && value !== null) || reported.has(name)) return;
    reported.add(name);
    onNonObject(name);
  };
  const operations: Record<string, never> = {};
  for (const [name, original] of Object.entries(registrations.operations)) {
    const operation = original as Operation;
    const wrapped: Operation = function (this: unknown, operationData) {
      const value = operation.call(this, operationData);
      if (isThenable(value)) {
        // A rejection is the engine's to report
        value.then(
          resolved => check(name, resolved),
          () => {}
        );
      } else check(name, value);
      return value;
    };
    operations[name] = wrapped as never;
  }
  return { ...registrations, operations };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new StepTimeoutError(`${what} did not finish within ${ms} ms`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
