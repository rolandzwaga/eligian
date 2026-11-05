/**
 * Spec 058 Phase 3 (FR-011–FR-013, FR-028; plan D1): the eval assertion library.
 *
 * A case file's `assertions` are declarative `{ kind, ...parameters }` objects. `parseAssertions`
 * validates them (one Effect `Schema` per kind); `evaluateAssertions` checks them over a produced
 * project and its compiled config, and returns `{ kind, pass, detail }` per assertion. Failures
 * are data: an evaluator that cannot read a file reports it in `detail`, it never throws.
 *
 * Plain synchronous TypeScript (plan D). The walks are the language package's own
 * (`controllerBalance`, `walkOperations`, `interactionActionName`, `scanLayoutElements` from
 * `@eligian/language/mcp`); the source-scan kinds are ported from `evals/mcp/gate.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { EligianMap, IEngineConfiguration } from '@eligian/language';
import {
  type ActionBody,
  controllerBalance,
  interactionActionName,
  scanLayoutElements,
  type WalkedOperation,
  walkOperations,
} from '@eligian/language/mcp';
import { Result, Schema } from 'effect';
import { POSITION_TOLERANCE_S } from '../../smoke/scenario.js';
import { touchedSelectors } from '../../smoke/touched-selectors.js';
import { configFragment, type Json } from '../config-fragment.js';
import type { Storyboard, StoryboardBeat, StoryboardInteraction } from '../storyboard.js';

export interface AssertionInput {
  readonly projectDir: string;
  /** The entry, relative to `projectDir` */
  readonly entry: string;
  readonly config: IEngineConfiguration;
  readonly map?: EligianMap;
  /** readStoryboard(text) of STORYBOARD.md (storyboard.ts); undefined when the file is absent */
  readonly storyboard?: Storyboard;
  /** Gate step 1's diagnostic codes */
  readonly checkCodes?: readonly string[];
  /** Cases 13 and 14: the case's start/ directory */
  readonly startDir?: string;
  /** evals/mcp: the base of config.equivalent fixtures */
  readonly casesDir: string;
  /** library.checksClean: runs the CLI */
  readonly eligian?: (args: readonly string[]) => {
    status: number | null;
    stdout: string;
    stderr: string;
  };
}

export const ASSERTION_KINDS = [
  'timelines.count',
  'timeline',
  'timeline.rangedActions',
  'timelines.lifecycle',
  'timeline.addsController',
  'timeline.scrollSelectorInLayout',
  'timeline.rangeTouches',
  'actions.named',
  'actions.called',
  'operations.used',
  'controllers.used',
  'controllers.balanced',
  'interactions.keyboard',
  'interactions.listener',
  'interactions.seekTo',
  'interactions.noWait',
  'replay.resetThenSeek',
  'stagger.spaced',
  'origins.present',
  'check.codesAbsent',
  'files.exist',
  'layout.hasId',
  'layout.gainedCssOnlyIds',
  'css.definesStateClasses',
  'css.hasRule',
  'locales.languages',
  'source.blocks',
  'source.provider',
  'source.label',
  'source.labelSeek',
  'source.extensions',
  'library.file',
  'library.imports',
  'library.jsdoc',
  'library.checksClean',
  'dataflow.callsPreserved',
  'dataflow.selectedBeforeAddClass',
  'storyboard.exists',
  'storyboard.beatsCovered',
  'beats.min',
  'config.equivalent',
] as const;

export type AssertionKind = (typeof ASSERTION_KINDS)[number];
export type Assertion = { readonly kind: AssertionKind } & Readonly<Record<string, unknown>>;
export interface AssertionResult {
  readonly kind: AssertionKind;
  readonly pass: boolean;
  readonly detail: string;
}

// ---------------------------------------------------------------------------------------------
// Parameters

const Str = Schema.String;
const Strings = Schema.Array(Schema.String);
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const opt = Schema.optionalKey;

/** `timeline`-style selection: by config index, by source name, or the first of a type. */
const SELECTION = { at: opt(Count), name: opt(Str), type: opt(Str) };
const USED = { all: opt(Strings), anyOf: opt(Strings) };

const PARAMETERS: { readonly [K in AssertionKind]: Schema.Struct.Fields } = {
  'timelines.count': { equals: opt(Count), min: opt(Count), type: opt(Str) },
  timeline: {
    ...SELECTION,
    positionSource: opt(Str),
    duration: opt(Schema.Finite),
    loop: opt(Schema.Boolean),
    from: opt(Str),
    sourceType: opt(Str),
    hasDuration: opt(Schema.Boolean),
  },
  'timeline.rangedActions': { ...SELECTION, min: Count },
  'timelines.lifecycle': { names: Strings, enter: opt(Schema.Boolean), leave: opt(Schema.Boolean) },
  'timeline.addsController': { controller: Str, names: Strings },
  'timeline.scrollSelectorInLayout': SELECTION,
  'timeline.rangeTouches': { selector: Str },
  'actions.named': { names: opt(Strings), prefix: opt(Str) },
  'actions.called': { names: Strings },
  'operations.used': USED,
  'controllers.used': USED,
  'controllers.balanced': {},
  'interactions.keyboard': { keys: Strings },
  'interactions.listener': {
    controller: Str,
    event: opt(Str),
    runs: opt(Schema.Literal(true)),
  },
  'interactions.seekTo': { position: Schema.Finite },
  'interactions.noWait': { triggers: Strings },
  'replay.resetThenSeek': { trigger: Str },
  'stagger.spaced': { count: Count, gap: Schema.Finite },
  'origins.present': { all: Strings },
  'check.codesAbsent': { codes: Strings },
  'files.exist': { paths: Strings },
  'layout.hasId': { ids: Strings },
  'layout.gainedCssOnlyIds': {},
  'css.definesStateClasses': { classes: opt(Strings) },
  'css.hasRule': { selector: Str, anyProperty: Strings },
  'locales.languages': { codes: Strings },
  'source.blocks': { keyword: opt(Str), equals: opt(Count), anyOf: opt(Strings) },
  'source.provider': { name: Str },
  'source.label': { name: Str },
  'source.labelSeek': { label: Str, anchor: Schema.Literals(['start', 'end']) },
  'source.extensions': {
    module: Str,
    operations: Schema.Array(Schema.Struct({ name: Str, params: opt(Str) })),
  },
  'library.file': { dir: Str },
  'library.imports': { dir: Str, names: Strings },
  'library.jsdoc': { dir: Str, names: Strings },
  'library.checksClean': { dir: Str },
  'dataflow.callsPreserved': {},
  'dataflow.selectedBeforeAddClass': {},
  'storyboard.exists': {},
  'storyboard.beatsCovered': {},
  'beats.min': { n: Schema.Union([Count, Schema.Literals(['storyboard', 'start'])]) },
  'config.equivalent': { fixture: Str },
};

/** Kinds that need at least one of these (otherwise optional) parameters. */
const ONE_OF: Partial<Record<AssertionKind, readonly string[]>> = {
  'timelines.count': ['equals', 'min'],
  timeline: ['at', 'name', 'type'],
  'timeline.rangedActions': ['at', 'name', 'type'],
  'timeline.scrollSelectorInLayout': ['at', 'name', 'type'],
  'actions.named': ['names', 'prefix'],
  'operations.used': ['all', 'anyOf'],
  'controllers.used': ['all', 'anyOf'],
  'source.blocks': ['keyword', 'anyOf'],
};

const SCHEMAS = new Map<string, Schema.ConstraintDecoder<unknown>>(
  ASSERTION_KINDS.map(kind => [
    kind,
    Schema.Struct({ kind: Schema.Literal(kind), ...PARAMETERS[kind] }),
  ])
);

/** Unknown keys are refused, so a misspelt parameter is not silently ignored. */
const STRICT = { onExcessProperty: 'error' } as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The problem with one assertion, or undefined when it is valid. */
function assertionProblem(assertion: unknown): string | undefined {
  if (!isRecord(assertion)) return `${JSON.stringify(assertion)} is not an object`;
  const kind = assertion.kind;
  const schema = typeof kind === 'string' ? SCHEMAS.get(kind) : undefined;
  if (schema === undefined) return `unknown kind '${String(kind)}'`;
  const decoded = Schema.decodeResult(schema)(assertion, STRICT);
  if (Result.isFailure(decoded)) return `${kind}: ${decoded.failure.message}`;
  const oneOf = ONE_OF[kind as AssertionKind];
  if (oneOf !== undefined && !oneOf.some(key => key in assertion)) {
    return `${kind}: needs one of ${oneOf.join(', ')}`;
  }
  return undefined;
}

/** Validate a case's `assertions` (an array); the message names the first invalid one. */
export function parseAssertions(
  json: unknown
): { ok: true; assertions: readonly Assertion[] } | { ok: false; message: string } {
  if (!Array.isArray(json)) return { ok: false, message: 'assertions must be an array' };
  for (const [index, assertion] of json.entries()) {
    const problem = assertionProblem(assertion);
    if (problem !== undefined) {
      return { ok: false, message: `assertion ${index} ${JSON.stringify(assertion)}: ${problem}` };
    }
  }
  return { ok: true, assertions: json as readonly Assertion[] };
}

// ---------------------------------------------------------------------------------------------
// The compiled config, read loosely (fixtures and read-back JSON may be partial)

type Data = Readonly<Record<string, unknown>>;
interface Operation {
  readonly systemName: string;
  readonly operationData?: Data;
}
interface ActionLike {
  readonly name: string;
  readonly startOperations: readonly Operation[];
  readonly endOperations?: readonly Operation[];
}
interface TimelineActionLike extends ActionLike {
  readonly duration?: { readonly start?: number; readonly end?: number };
}
interface PositionSourceLike {
  readonly systemName?: string;
  readonly selector?: string;
  readonly duration?: number;
  readonly sources?: readonly { readonly src?: string; readonly type?: string }[];
}
interface TimelineLike {
  readonly uri: string;
  readonly type?: string;
  readonly duration?: number;
  readonly loop?: boolean;
  readonly positionSource?: PositionSourceLike;
  readonly timelineActions: readonly TimelineActionLike[];
}
interface ConfigLike {
  readonly actions?: readonly ActionLike[];
  readonly eventActions?: readonly ActionLike[];
  readonly initActions?: readonly ActionLike[];
  readonly timelines?: readonly TimelineLike[];
  readonly cssFiles?: readonly string[];
  readonly availableLanguages?: readonly { readonly languageCode?: string }[];
  readonly timelineProviderSettings?: Readonly<
    Record<string, { readonly positionSource?: PositionSourceLike } | undefined>
  >;
}

interface Context {
  readonly input: AssertionInput;
  readonly config: ConfigLike;
  readonly timelines: readonly TimelineLike[];
  /** config.actions by name, for the walkers */
  readonly actions: ReadonlyMap<string, ActionBody>;
  /** config.actions and config.eventActions by name */
  readonly declared: ReadonlyMap<string, ActionLike>;
  /** Source timeline names by config index (`map.timelineNames`), else the uris */
  readonly names: readonly string[];
}

interface Outcome {
  readonly pass: boolean;
  readonly detail: string;
}

const LIFECYCLE_ACTION = 'timeline-lifecycle';
const SEEK_REQUEST = 'timeline-seek-request';
const DOM_LISTENER = 'DOMEventListenerController';
const KEYBOARD = 'KeyboardController';
const MAX_DEPTH = 20;

const verdict = (problems: readonly string[], ok: string): Outcome =>
  problems.length === 0 ? { pass: true, detail: ok } : { pass: false, detail: problems.join('; ') };
const fail = (detail: string): Outcome => ({ pass: false, detail });

const str = (a: Assertion, key: string): string | undefined =>
  typeof a[key] === 'string' ? (a[key] as string) : undefined;
const num = (a: Assertion, key: string): number | undefined =>
  typeof a[key] === 'number' ? (a[key] as number) : undefined;
const strs = (a: Assertion, key: string): readonly string[] | undefined =>
  Array.isArray(a[key])
    ? (a[key] as unknown[]).filter((item): item is string => typeof item === 'string')
    : undefined;
const list = (values: Iterable<string>): string => [...values].join(', ');

const isRanged = (action: TimelineActionLike): boolean =>
  action.name !== LIFECYCLE_ACTION &&
  typeof action.duration?.end === 'number' &&
  action.duration.end >= 0;

/** Every operation list of the config. */
function operationLists(config: ConfigLike): (readonly Operation[])[] {
  const actions = [
    ...(config.actions ?? []),
    ...(config.eventActions ?? []),
    ...(config.initActions ?? []),
    ...(config.timelines ?? []).flatMap(timeline => timeline.timelineActions),
  ];
  return actions.flatMap(action => [action.startOperations ?? [], action.endOperations ?? []]);
}

const everyOperation = (config: ConfigLike): Operation[] => operationLists(config).flat();

const ranged = (timeline: TimelineLike): TimelineActionLike[] =>
  timeline.timelineActions.filter(isRanged);

const rangedCount = (timelines: readonly TimelineLike[]): number =>
  timelines.reduce((n, timeline) => n + ranged(timeline).length, 0);

/** The selectors a timeline action touches in its start or end operations. */
function touched(action: ActionLike, actions: ReadonlyMap<string, ActionBody>): Set<string> {
  return new Set([
    ...touchedSelectors(action.startOperations as readonly WalkedOperation[], actions),
    ...touchedSelectors((action.endOperations ?? []) as readonly WalkedOperation[], actions),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Listeners (A5: `controller-added` events carry the resolved operation data)

interface Listener {
  readonly controller: unknown;
  readonly selector: unknown;
  readonly data: Data;
}

function listenersOf(
  operations: readonly Operation[],
  actions: ReadonlyMap<string, ActionBody>
): Listener[] {
  return walkOperations(operations as readonly WalkedOperation[], actions).events.flatMap(event =>
    event.kind === 'controller-added'
      ? [{ controller: event.controller, selector: event.selector, data: event.data }]
      : []
  );
}

/** The listeners the start operations of a timeline's actions add, the lifecycle included. */
const timelineListeners = (ctx: Context, timeline: TimelineLike): Listener[] =>
  timeline.timelineActions.flatMap(action => listenersOf(action.startOperations, ctx.actions));

/** Every listener the config adds: timeline, init and event actions. */
const allListeners = (ctx: Context): Listener[] => [
  ...ctx.timelines.flatMap(timeline => timelineListeners(ctx, timeline)),
  ...[...(ctx.config.initActions ?? []), ...(ctx.config.eventActions ?? [])].flatMap(action =>
    listenersOf(action.startOperations, ctx.actions)
  ),
];

const actionsOf = (listener: Listener): string[] =>
  Array.isArray(listener.data.actions)
    ? listener.data.actions.filter((name): name is string => typeof name === 'string')
    : [];

/** `"ArrowRight"`, `"ctrl+s, Home"` → lower-cased key names. */
const keysOf = (listener: Listener): string[] =>
  typeof listener.data.keys === 'string'
    ? listener.data.keys
        .split(/[,+]/)
        .map(key => key.trim().toLowerCase())
        .filter(Boolean)
    : [];

const clickListeners = (ctx: Context, selector: string): Listener[] =>
  allListeners(ctx).filter(
    listener => listener.controller === DOM_LISTENER && listener.selector === selector
  );

/** The literal `requestAction` names of an operation list. */
const requestedNames = (operations: readonly Operation[]): string[] =>
  operations.flatMap(operation =>
    operation.systemName === 'requestAction' &&
    typeof operation.operationData?.systemName === 'string'
      ? [operation.operationData.systemName]
      : []
  );

/** An action's start operations with each requestAction + startAction replaced by the callee's. */
function inlined(ctx: Context, name: string, depth = 0): Operation[] {
  const action = ctx.declared.get(name);
  if (action === undefined || depth > MAX_DEPTH) return [];
  const result: Operation[] = [];
  let requested: string | undefined;
  for (const operation of action.startOperations) {
    if (operation.systemName === 'requestAction') {
      const callee = operation.operationData?.systemName;
      requested = typeof callee === 'string' ? callee : undefined;
    } else if (operation.systemName === 'startAction') {
      if (requested !== undefined) result.push(...inlined(ctx, requested, depth + 1));
      requested = undefined;
    } else {
      result.push(operation);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Files and source text

const readText = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** Source without comments; string contents kept (gate.ts `stripComments`). */
function stripComments(source: string): string {
  return source.replace(/("(?:[^"\\\n]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, text) =>
    text !== undefined ? text : m.startsWith('/*') ? m.replace(/[^\n]/g, ' ') : ''
  );
}

/** String contents replaced by spaces, so keywords inside strings do not count. */
const blankStrings = (text: string): string =>
  text.replace(/"(?:[^"\\\n]|\\.)*"/g, m => `"${' '.repeat(m.length - 2)}"`);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The `[ … ]` block starting at `open` (index of `[`), strings skipped; returns its end index. */
function blockEnd(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      for (i++; i < source.length && source[i] !== '"'; i++) if (source[i] === '\\') i++;
    } else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return i;
  }
  return source.length;
}

const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'with', 'at', 'break', 'continue']);
/** DSL sugar compiled to another operation name. */
const COMPILED_AS: Readonly<Record<string, string>> = {
  addController: 'addControllerToElement',
  removeController: 'removeControllerFromElement',
};

/** Declared actions of a (start-state) source → the operation names their bodies call. */
function startActions(source: string): Map<string, string[]> {
  const text = stripComments(source);
  const bodies = new Map<string, string>();
  const declaration = /\baction\s+([A-Za-z_]\w*)\s*\(/g;
  for (let m = declaration.exec(text); m !== null; m = declaration.exec(text)) {
    let i = text.indexOf(')', declaration.lastIndex);
    let body = '';
    for (let blocks = 0; blocks < 2; blocks++) {
      const open = text.slice(i + 1).search(/\S/) + i + 1;
      if (text[open] !== '[') break;
      i = blockEnd(text, open);
      body += `${text.slice(open + 1, i)}\n`;
    }
    bodies.set(m[1], body.replace(/"(?:[^"\\\n]|\\.)*"/g, '""'));
  }
  const result = new Map<string, string[]>();
  for (const [name, body] of bodies) {
    const calls = [...body.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)]
      .map(call => call[1])
      .filter(call => !KEYWORDS.has(call) && !bodies.has(call))
      .map(call => COMPILED_AS[call] ?? call);
    result.set(name, calls);
  }
  return result;
}

/** The start state's `at` events (P17: lifecycle blocks are not beats). */
const startAtEvents = (source: string): number =>
  (stripComments(source).match(/^\s*at\s/gm) ?? []).length;

function importPath(source: string, keyword: 'layout'): string | undefined {
  return new RegExp(`^\\s*${keyword}\\s+"([^"]+)"`, 'm').exec(stripComments(source))?.[1];
}

/** The ids of the layout the entry of `dir` imports; a string names why there are none. */
function layoutIds(dir: string, entry: string): ReadonlySet<string> | string {
  const source = readText(path.join(dir, entry));
  if (source === undefined) return `cannot read ${entry}`;
  const layout = importPath(source, 'layout');
  if (layout === undefined) return `${entry} imports no layout`;
  const html = readText(path.resolve(path.dirname(path.join(dir, entry)), layout));
  return html === undefined ? `cannot read the layout ${layout}` : scanLayoutElements(html).ids;
}

/** The CSS of the config's `cssFiles`, resolved against the entry's directory. */
function projectCss(ctx: Context): string {
  const entryDir = path.dirname(path.join(ctx.input.projectDir, ctx.input.entry));
  return (ctx.config.cssFiles ?? [])
    .map(file => readText(path.resolve(entryDir, file)) ?? '')
    .join('\n');
}

const definesClass = (css: string, className: string): boolean =>
  new RegExp(`\\.${escapeRegExp(className)}(?![\\w-])`).test(css);

/** The rules of a stylesheet as `{ selectors, properties }` (innermost blocks; comments removed). */
function cssRules(css: string): { selectors: string[]; properties: string[] }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
    selectors: m[1]
      .split(',')
      .map(selector => selector.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
    properties: m[2]
      .split(';')
      .map(declaration => declaration.split(':')[0].trim().toLowerCase())
      .filter(Boolean),
  }));
}

/** The `.eligian` files under `<projectDir>/<dir>` that declare a `library`, absolute. */
function libraryFiles(ctx: Context, dir: string): string[] {
  const root = path.join(ctx.input.projectDir, dir);
  if (!fs.existsSync(root)) return [];
  return (fs.readdirSync(root, { recursive: true }) as string[])
    .filter(file => file.endsWith('.eligian'))
    .map(file => path.join(root, file))
    .filter(file => /^\s*library\s+[A-Za-z_]/.test(stripComments(readText(file) ?? '')));
}

const normalizedPath = (file: string): string => file.replace(/\\/g, '/').replace(/^\.\//, '');

// ---------------------------------------------------------------------------------------------
// Timeline selection

function timelineLabel(ctx: Context, index: number): string {
  return `timeline '${ctx.names[index] ?? ctx.timelines[index]?.uri ?? index}'`;
}

/** The timeline an assertion selects (`at`, else `name`, else the first of `type`). */
function selectTimeline(ctx: Context, a: Assertion): number | string {
  const at = num(a, 'at');
  const name = str(a, 'name');
  const type = str(a, 'type');
  if (at !== undefined) {
    return at < ctx.timelines.length
      ? at
      : `no timeline at index ${at} (${ctx.timelines.length} timelines)`;
  }
  if (name !== undefined) {
    const index = ctx.names.indexOf(name);
    return index >= 0 ? index : `no timeline '${name}' (timelines: ${list(ctx.names)})`;
  }
  const index = ctx.timelines.findIndex(timeline => timeline.type === type);
  return index >= 0 ? index : `no '${type}' timeline`;
}

/** The position source's system name: the timeline's own, else its type's provider setting. */
const positionSourceName = (ctx: Context, timeline: TimelineLike): string | undefined =>
  timeline.positionSource?.systemName ??
  ctx.config.timelineProviderSettings?.[timeline.type ?? '']?.positionSource?.systemName;

/** Index of a timeline by source name; a string names the miss. */
function timelineNamed(ctx: Context, name: string): number | string {
  const index = ctx.names.indexOf(name);
  return index >= 0 ? index : `no timeline '${name}'`;
}

// ---------------------------------------------------------------------------------------------
// Storyboard rows (FR-012, P18)

const parseSeconds = (text: string): number | undefined => {
  const m = /^(\d+(?:\.\d+)?)\s*s?$/.exec(text.trim());
  return m === null ? undefined : Number(m[1]);
};

/** Why a beat row is not covered; undefined when it is. */
function beatProblem(ctx: Context, row: StoryboardBeat): string | undefined {
  const index = timelineNamed(ctx, row.timeline);
  if (typeof index === 'string') return index;
  const start = parseSeconds(row.start);
  const end = parseSeconds(row.end);
  if (start === undefined || end === undefined) return 'start / end are not seconds';
  const covering = ranged(ctx.timelines[index]).filter(
    action =>
      (action.duration?.start ?? 0) <= start + POSITION_TOLERANCE_S &&
      (action.duration?.end ?? Number.NEGATIVE_INFINITY) >= end - POSITION_TOLERANCE_S
  );
  if (covering.length === 0) return `no timeline action covers ${start}..${end}`;
  return covering.some(action => touched(action, ctx.actions).has(row.selector))
    ? undefined
    : `no timeline action covering ${start}..${end} touches ${row.selector}`;
}

type TriggerMatch = (listener: Listener) => boolean;

function triggerOf(trigger: string): TriggerMatch | string {
  const key = /^key\s+(.+)$/i.exec(trigger.trim());
  if (key !== null) {
    const wanted = key[1].trim().toLowerCase();
    return listener => listener.controller === KEYBOARD && keysOf(listener).includes(wanted);
  }
  const dom = /^(\S+)\s+(#\S+)$/.exec(trigger.trim());
  if (dom !== null) {
    return listener =>
      listener.controller === DOM_LISTENER &&
      listener.selector === dom[2] &&
      listener.data.eventName === dom[1];
  }
  return `trigger '${trigger}' is neither '<event> #<id>' nor 'key <Key>'`;
}

type ActionMatch = (name: string) => boolean;

function actionMatchOf(ctx: Context, row: StoryboardInteraction): ActionMatch | string {
  const verb = row.verb.trim().toLowerCase();
  switch (verb) {
    case 'navigate': {
      const name = interactionActionName('navigate', row.target.trim(), 0);
      return candidate => candidate === name || candidate.startsWith(`${name}__`);
    }
    case 'play':
    case 'pause':
    case 'toggle':
    case 'stop': {
      const name = interactionActionName(verb, undefined, 0);
      return candidate => candidate === name;
    }
    case 'seek': {
      const seconds = parseSeconds(row.target);
      if (seconds === undefined) return candidate => candidate.startsWith('__on__seek__');
      const name = interactionActionName('seek', undefined, seconds);
      return candidate => candidate === name;
    }
    case 'run': {
      const name = row.target.split('(')[0].trim();
      return candidate =>
        (candidate === name || candidate.endsWith(`.${name}`)) && ctx.declared.has(candidate);
    }
    default:
      return `unknown verb '${row.verb}'`;
  }
}

/** Why an interaction row has no listener of its own; undefined when it has one. */
function interactionProblem(ctx: Context, row: StoryboardInteraction): string | undefined {
  const index = timelineNamed(ctx, row.timeline);
  if (typeof index === 'string') return index;
  const trigger = triggerOf(row.trigger);
  if (typeof trigger === 'string') return trigger;
  const action = actionMatchOf(ctx, row);
  if (typeof action === 'string') return action;
  const listeners = timelineListeners(ctx, ctx.timelines[index]).filter(trigger);
  if (listeners.length === 0) {
    return `no listener for ${row.trigger} in timeline '${row.timeline}'`;
  }
  return listeners.some(listener => actionsOf(listener).some(action))
    ? undefined
    : `the ${row.trigger} listener runs ${list(listeners.flatMap(actionsOf))}, not this ${row.verb}`;
}

// ---------------------------------------------------------------------------------------------
// config.equivalent (FR-028)

const asRecord = (json: Json | undefined): Readonly<Record<string, Json>> =>
  json !== null && typeof json === 'object' && !Array.isArray(json)
    ? (json as Readonly<Record<string, Json>>)
    : {};
const asArray = (json: Json | undefined): readonly Json[] =>
  Array.isArray(json) ? (json as readonly Json[]) : [];

/** The operation names in order, with the `setOperationData` entries counted apart (a multiset). */
function sequenceOf(operations: Json | undefined): string {
  const names = asArray(operations).map(operation => String(asRecord(operation).systemName));
  const sets = names.filter(name => name === 'setOperationData').length;
  return `${names.filter(name => name !== 'setOperationData').join(',')} (+${sets} setOperationData)`;
}

const controllersIn = (operations: Json | undefined): string[] =>
  asArray(operations).flatMap(operation => {
    const record = asRecord(operation);
    const name = asRecord(record.operationData).systemName;
    return record.systemName === 'getControllerInstance' && typeof name === 'string' ? [name] : [];
  });

interface ConfigShape {
  readonly durations: ReadonlyMap<string, string>;
  readonly sequences: ReadonlyMap<string, string>;
  readonly controllers: readonly string[];
}

function shapeOf(config: IEngineConfiguration): ConfigShape {
  const fragment = asRecord(configFragment(config));
  const durations = new Map<string, string>();
  const sequences = new Map<string, string>();
  const controllers = new Set<string>();
  const add = (key: string, action: Readonly<Record<string, Json>>) => {
    sequences.set(
      key,
      `start ${sequenceOf(action.startOperations)} | end ${sequenceOf(action.endOperations)}`
    );
    for (const name of [
      ...controllersIn(action.startOperations),
      ...controllersIn(action.endOperations),
    ]) {
      controllers.add(name);
    }
  };
  for (const [name, action] of Object.entries(asRecord(fragment.actions))) {
    add(`action '${name}'`, asRecord(action));
  }
  for (const [uri, timeline] of Object.entries(asRecord(fragment.timelines))) {
    const record = asRecord(timeline);
    durations.set(uri, JSON.stringify(record.duration ?? null));
    const seen = new Map<string, number>();
    for (const action of asArray(record.timelineActions).map(asRecord)) {
      const name = String(action.name ?? '');
      const occurrence = seen.get(name) ?? 0;
      seen.set(name, occurrence + 1);
      add(`timeline '${uri}' action '${name}'#${occurrence}`, action);
    }
  }
  for (const action of asArray(fragment.initActions).map(asRecord)) {
    add(`init action '${String(action.name ?? '')}'`, action);
  }
  return { durations, sequences, controllers: [...controllers].sort() };
}

function shapeDifferences(actual: ConfigShape, expected: ConfigShape): string[] {
  const problems: string[] = [];
  const compare = (
    what: string,
    have: ReadonlyMap<string, string>,
    want: ReadonlyMap<string, string>
  ) => {
    for (const [key, value] of want) {
      const got = have.get(key);
      if (got === undefined) problems.push(`missing ${what} ${key}`);
      else if (got !== value) problems.push(`${key}: ${got}, expected ${value}`);
    }
    for (const key of have.keys()) {
      if (!want.has(key)) problems.push(`extra ${what} ${key}`);
    }
  };
  compare(
    'timeline',
    new Map([...actual.durations].map(([uri, d]) => [`'${uri}' duration`, d])),
    new Map([...expected.durations].map(([uri, d]) => [`'${uri}' duration`, d]))
  );
  compare('', actual.sequences, expected.sequences);
  if (JSON.stringify(actual.controllers) !== JSON.stringify(expected.controllers)) {
    problems.push(
      `controllers [${list(actual.controllers)}], expected [${list(expected.controllers)}]`
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The evaluators

type Evaluator = (ctx: Context, a: Assertion) => Outcome;

const SELECT_OR_CALL = new Set(['selectElement', 'requestAction', 'startAction', 'endAction']);

const EVALUATORS: { readonly [K in AssertionKind]: Evaluator } = {
  'timelines.count': (ctx, a) => {
    const type = str(a, 'type');
    const count = ctx.timelines.filter(t => type === undefined || t.type === type).length;
    const equals = num(a, 'equals');
    const min = num(a, 'min');
    const what = `${count} ${type === undefined ? '' : `'${type}' `}timelines`;
    const problems = [
      ...(equals !== undefined && count !== equals ? [`${what}, expected ${equals}`] : []),
      ...(min !== undefined && count < min ? [`${what}, expected at least ${min}`] : []),
    ];
    return verdict(problems, what);
  },

  timeline: (ctx, a) => {
    const index = selectTimeline(ctx, a);
    if (typeof index === 'string') return fail(index);
    const timeline = ctx.timelines[index];
    const label = timelineLabel(ctx, index);
    const source = timeline.positionSource?.sources?.[0];
    const actual: Record<string, unknown> = {
      type: timeline.type,
      positionSource: positionSourceName(ctx, timeline),
      duration: timeline.duration,
      loop: timeline.loop,
      from: source?.src === undefined ? undefined : normalizedPath(source.src),
      sourceType: source?.type,
      hasDuration: typeof timeline.duration === 'number' && timeline.duration > 0,
    };
    const problems = Object.keys(actual).flatMap(key => {
      if (!(key in a) || (key === 'type' && num(a, 'at') === undefined && !('name' in a))) {
        return [];
      }
      const expected = key === 'from' ? normalizedPath(String(a[key])) : a[key];
      return actual[key] === expected
        ? []
        : [`${label}: ${key} ${JSON.stringify(actual[key])}, expected ${JSON.stringify(a[key])}`];
    });
    return verdict(problems, `${label} matches`);
  },

  'timeline.rangedActions': (ctx, a) => {
    const index = selectTimeline(ctx, a);
    if (typeof index === 'string') return fail(index);
    const count = ranged(ctx.timelines[index]).length;
    const min = num(a, 'min') ?? 0;
    const what = `${timelineLabel(ctx, index)} has ${count} ranged actions`;
    return count >= min ? { pass: true, detail: what } : fail(`${what}, expected at least ${min}`);
  },

  'timelines.lifecycle': (ctx, a) => {
    const problems = (strs(a, 'names') ?? []).flatMap(name => {
      const index = timelineNamed(ctx, name);
      if (typeof index === 'string') return [index];
      const lifecycle = ctx.timelines[index].timelineActions.find(
        action => action.name === LIFECYCLE_ACTION
      );
      if (lifecycle === undefined) return [`timeline '${name}' has no on enter / on leave`];
      return [
        ...(a.enter === true && lifecycle.startOperations.length === 0
          ? [`timeline '${name}' has no on enter`]
          : []),
        ...(a.leave === true && (lifecycle.endOperations ?? []).length === 0
          ? [`timeline '${name}' has no on leave`]
          : []),
      ];
    });
    return verdict(problems, 'every timeline has its lifecycle blocks');
  },

  'timeline.addsController': (ctx, a) => {
    const controller = str(a, 'controller') ?? '';
    const balances = controllerBalance(ctx.input.config);
    const problems = (strs(a, 'names') ?? []).flatMap(name => {
      const index = timelineNamed(ctx, name);
      if (typeof index === 'string') return [index];
      return (balances[index]?.added ?? []).some(use => use.endsWith(` ${controller}`))
        ? []
        : [`timeline '${name}' adds no ${controller} in on enter`];
    });
    return verdict(problems, `every timeline adds a ${controller}`);
  },

  'timeline.scrollSelectorInLayout': (ctx, a) => {
    const index = selectTimeline(ctx, a);
    if (typeof index === 'string') return fail(index);
    const selector = ctx.timelines[index].positionSource?.selector;
    const label = timelineLabel(ctx, index);
    const id = selector === undefined ? undefined : /^#([A-Za-z_][\w-]*)$/.exec(selector)?.[1];
    if (id === undefined) return fail(`${label}: position source selector ${selector} is no #id`);
    const ids = layoutIds(ctx.input.projectDir, ctx.input.entry);
    if (typeof ids === 'string') return fail(ids);
    return ids.has(id)
      ? { pass: true, detail: `${label} scrolls ${selector}, a layout id` }
      : fail(`${label} scrolls ${selector}, which the layout does not have`);
  },

  'timeline.rangeTouches': (ctx, a) => {
    const selector = str(a, 'selector') ?? '';
    const hit = ctx.timelines.some(timeline =>
      ranged(timeline).some(action => touched(action, ctx.actions).has(selector))
    );
    return hit
      ? { pass: true, detail: `a ranged timeline action touches ${selector}` }
      : fail(`no ranged timeline action touches ${selector}`);
  },

  'actions.named': (ctx, a) => {
    const names = [...ctx.declared.keys()];
    const prefix = str(a, 'prefix');
    const problems = [
      ...(strs(a, 'names') ?? [])
        .filter(name => !ctx.declared.has(name))
        .map(name => `no action '${name}'`),
      ...(prefix !== undefined && !names.some(name => name.startsWith(prefix))
        ? [`no action name starts with '${prefix}'`]
        : []),
    ];
    return verdict(problems, 'the actions exist');
  },

  'actions.called': (ctx, a) => {
    const requested = new Set(requestedNames(everyOperation(ctx.config)));
    const problems = (strs(a, 'names') ?? [])
      .filter(name => !requested.has(name))
      .map(name => `'${name}' is never called (no requestAction)`);
    return verdict(problems, 'every action is called');
  },

  'operations.used': (ctx, a) => {
    const used = new Set(everyOperation(ctx.config).map(operation => operation.systemName));
    return usedVerdict('operation', used, a);
  },

  'controllers.used': (ctx, a) => {
    const used = new Set<string>();
    for (const operation of everyOperation(ctx.config)) {
      const name = operation.operationData?.systemName;
      if (operation.systemName === 'getControllerInstance' && typeof name === 'string') {
        used.add(name);
      }
    }
    for (const balance of controllerBalance(ctx.input.config)) {
      for (const use of balance.added) used.add(use.slice(use.lastIndexOf(' ') + 1));
    }
    return usedVerdict('controller', used, a);
  },

  'controllers.balanced': ctx => {
    const problems = controllerBalance(ctx.input.config).flatMap(balance => [
      ...(JSON.stringify(balance.added) !== JSON.stringify(balance.removed)
        ? [
            `timeline '${balance.timeline}' adds [${list(balance.added)}] but removes [${list(balance.removed)}]`,
          ]
        : []),
      ...(balance.unresolved.length > 0
        ? [`timeline '${balance.timeline}' calls unresolved actions: ${list(balance.unresolved)}`]
        : []),
    ]);
    return verdict(problems, 'every timeline removes what it adds');
  },

  'interactions.keyboard': (ctx, a) => {
    const bound = new Set(
      allListeners(ctx)
        .filter(listener => listener.controller === KEYBOARD)
        .flatMap(keysOf)
    );
    const problems = (strs(a, 'keys') ?? [])
      .filter(key => !bound.has(key.toLowerCase()))
      .map(key => `no KeyboardController binds '${key}'`);
    return verdict(problems, 'every key is bound');
  },

  'interactions.listener': (ctx, a) => {
    const controller = str(a, 'controller');
    const event = str(a, 'event');
    const found = allListeners(ctx).some(
      listener =>
        listener.controller === controller &&
        (event === undefined || listener.data.eventName === event) &&
        (a.runs !== true ||
          actionsOf(listener).some(
            name =>
              ctx.declared.has(name) && !name.startsWith('__nav__') && !name.startsWith('__on__')
          ))
    );
    const what = `a ${controller}${event === undefined ? '' : ` '${event}'`} listener${a.runs === true ? ' that runs a declared action' : ''}`;
    return found ? { pass: true, detail: `found ${what}` } : fail(`no ${what}`);
  },

  'interactions.seekTo': (ctx, a) => {
    const position = num(a, 'position');
    const found = everyOperation(ctx.config).some(
      operation =>
        operation.systemName === 'broadcastEvent' &&
        operation.operationData?.eventName === SEEK_REQUEST &&
        Array.isArray(operation.operationData.eventArgs) &&
        operation.operationData.eventArgs[0] === position
    );
    return found
      ? { pass: true, detail: `a ${SEEK_REQUEST} to ${position}` }
      : fail(`no ${SEEK_REQUEST} broadcast with [${position}]`);
  },

  'interactions.noWait': (ctx, a) => {
    const problems = (strs(a, 'triggers') ?? []).flatMap(trigger => {
      const listeners = clickListeners(ctx, trigger);
      if (listeners.length === 0) return [`trigger '${trigger}' has no ${DOM_LISTENER} listener`];
      const pending = listeners.flatMap(actionsOf);
      const visited = new Set<string>();
      const waits: string[] = [];
      while (pending.length > 0) {
        const name = pending.pop() as string;
        if (visited.has(name)) continue;
        visited.add(name);
        const action = ctx.declared.get(name);
        if (action === undefined) continue;
        const operations = [...action.startOperations, ...(action.endOperations ?? [])];
        if (operations.some(operation => operation.systemName === 'wait')) waits.push(name);
        pending.push(...requestedNames(operations));
      }
      return waits.length === 0
        ? []
        : [`trigger '${trigger}': action ${list(waits.map(w => `'${w}'`))} runs a wait`];
    });
    return verdict(problems, 'no listener runs a wait');
  },

  'replay.resetThenSeek': (ctx, a) => {
    const trigger = str(a, 'trigger') ?? '';
    const listeners = clickListeners(ctx, trigger);
    if (listeners.length === 0) return fail(`trigger '${trigger}' has no ${DOM_LISTENER} listener`);
    const resets = listeners.flatMap(actionsOf).some(name => {
      const operations = inlined(ctx, name);
      const seek = operations.findIndex(
        operation =>
          operation.systemName === 'broadcastEvent' &&
          operation.operationData?.eventName === SEEK_REQUEST &&
          Array.isArray(operation.operationData.eventArgs) &&
          operation.operationData.eventArgs[0] === 0
      );
      return (
        seek > 0 &&
        operations.slice(0, seek).some(operation => !SELECT_OR_CALL.has(operation.systemName))
      );
    });
    return resets
      ? { pass: true, detail: `'${trigger}' resets, then seeks to 0` }
      : fail(`'${trigger}' runs no reset before a ${SEEK_REQUEST} to [0]`);
  },

  'stagger.spaced': (ctx, a) => {
    const count = num(a, 'count') ?? 0;
    const gap = num(a, 'gap') ?? 0;
    const runs = ctx.timelines.map(timeline =>
      timeline.timelineActions
        .filter(action => action.name.startsWith('stagger-'))
        .map(action => action.duration?.start ?? Number.NaN)
        .sort((x, y) => x - y)
    );
    const spaced = (starts: readonly number[]) =>
      starts.length === count &&
      starts.every((s, i) => i === 0 || Math.abs(s - starts[i - 1] - gap) < 1e-6);
    return runs.some(spaced)
      ? { pass: true, detail: `${count} stagger actions ${gap} s apart` }
      : fail(
          `no timeline has ${count} stagger actions ${gap} s apart (stagger starts: ${runs.map(r => `[${r.join(', ')}]`).join(' ')})`
        );
  },

  'origins.present': (ctx, a) => {
    const map = ctx.input.map;
    if (map === undefined) return fail('no eligian map');
    const origins = new Set(
      Object.values(map.actions).flatMap(action =>
        [...action.start, ...action.end].flatMap(operation =>
          operation.origin === undefined ? [] : [operation.origin as string]
        )
      )
    );
    const problems = (strs(a, 'all') ?? [])
      .filter(origin => !origins.has(origin))
      .map(origin => `no operation of origin '${origin}'`);
    return verdict(problems, 'every origin occurs');
  },

  'check.codesAbsent': (ctx, a) => {
    const codes = ctx.input.checkCodes;
    if (codes === undefined) return fail('no check codes (gate step 1 did not run)');
    const problems = (strs(a, 'codes') ?? [])
      .filter(code => codes.includes(code))
      .map(code => `check reports ${code}`);
    return verdict(problems, 'none of the codes is reported');
  },

  'files.exist': (ctx, a) => {
    const problems = (strs(a, 'paths') ?? [])
      .filter(file => !fs.existsSync(path.join(ctx.input.projectDir, file)))
      .map(file => `missing ${file}`);
    return verdict(problems, 'every file exists');
  },

  'layout.hasId': (ctx, a) => {
    const ids = layoutIds(ctx.input.projectDir, ctx.input.entry);
    if (typeof ids === 'string') return fail(ids);
    const problems = (strs(a, 'ids') ?? [])
      .filter(id => !ids.has(id))
      .map(id => `the layout has no element with id '${id}'`);
    return verdict(problems, 'the layout has every id');
  },

  'layout.gainedCssOnlyIds': ctx => {
    const { startDir, entry, projectDir } = ctx.input;
    if (startDir === undefined) return fail('no start state (startDir)');
    const startSource = readText(path.join(startDir, entry));
    if (startSource === undefined) return fail(`cannot read the start state's ${entry}`);
    const startIds = layoutIds(startDir, entry);
    const startHas = (id: string) => typeof startIds !== 'string' && startIds.has(id);
    const css = fs
      .readdirSync(startDir)
      .filter(file => file.endsWith('.css'))
      .map(file => readText(path.join(startDir, file)) ?? '')
      .join('\n');
    const used = new Set(
      [...stripComments(startSource).matchAll(/"[^"]*"/g)].flatMap(m =>
        [...m[0].matchAll(/#([A-Za-z_][\w-]*)/g)].map(id => id[1])
      )
    );
    const cssOnly = [...used].filter(
      id => !startHas(id) && new RegExp(`#${escapeRegExp(id)}(?![\\w-])`).test(css)
    );
    const ids = layoutIds(projectDir, entry);
    const problems = cssOnly
      .filter(id => typeof ids === 'string' || !ids.has(id))
      .map(id => `the layout has no element with id '${id}'`);
    return verdict(problems, `the layout has the CSS-only ids [${list(cssOnly)}]`);
  },

  'css.definesStateClasses': (ctx, a) => {
    const classes = new Set(strs(a, 'classes') ?? []);
    for (const operation of everyOperation(ctx.config)) {
      const className = operation.operationData?.className;
      if (
        (operation.systemName === 'addClass' || operation.systemName === 'toggleClass') &&
        typeof className === 'string' &&
        !className.startsWith('$')
      ) {
        classes.add(className);
      }
    }
    const css = projectCss(ctx);
    const problems = [...classes]
      .filter(className => !definesClass(css, className))
      .map(className => `the CSS defines no rule for the state class '${className}'`);
    return verdict(problems, `the CSS defines [${list(classes)}]`);
  },

  'css.hasRule': (ctx, a) => {
    const selector = (str(a, 'selector') ?? '').trim().replace(/\s+/g, ' ');
    const wanted = (strs(a, 'anyProperty') ?? []).map(property => property.toLowerCase());
    const found = cssRules(projectCss(ctx)).some(
      rule =>
        rule.selectors.includes(selector) &&
        rule.properties.some(property => wanted.includes(property))
    );
    return found
      ? { pass: true, detail: `a ${selector} rule sets one of ${list(wanted)}` }
      : fail(`no ${selector} rule sets any of ${list(wanted)}`);
  },

  'locales.languages': (ctx, a) => {
    const languages = new Set((ctx.config.availableLanguages ?? []).map(l => l.languageCode));
    const problems = (strs(a, 'codes') ?? [])
      .filter(code => !languages.has(code))
      .map(code => `the languages block has no '${code}'`);
    return verdict(problems, 'every language is available');
  },

  'source.blocks': (ctx, a) => withSource(ctx, text => sourceBlocks(blankStrings(text), a)),

  'source.provider': (ctx, a) => {
    const name = str(a, 'name') ?? '';
    return sourceMatch(ctx, new RegExp(`\\busing\\s+${escapeRegExp(name)}\\b`), `using ${name}`);
  },

  'source.label': (ctx, a) => {
    const name = str(a, 'name') ?? '';
    return sourceMatch(ctx, new RegExp(`\\bas\\s+${escapeRegExp(name)}\\b`), `as ${name}`);
  },

  'source.labelSeek': (ctx, a) => {
    const target = `${str(a, 'label')}.${str(a, 'anchor')}`;
    return sourceMatch(ctx, new RegExp(`\\bseek\\s+${escapeRegExp(target)}\\b`), `seek ${target}`);
  },

  'source.extensions': (ctx, a) =>
    withSource(ctx, text => {
      const module = str(a, 'module') ?? '';
      const block = new RegExp(`\\bextensions\\s+"${escapeRegExp(module)}"\\s*\\{([^}]*)\\}`).exec(
        text
      );
      if (block === null) return fail(`no extensions "${module}" { … } declaration`);
      const operations = Array.isArray(a.operations) ? a.operations.filter(isRecord) : [];
      const problems = operations.flatMap(operation => {
        const name = String(operation.name);
        const declared = new RegExp(`\\boperation\\s+${escapeRegExp(name)}\\s*\\(([^)]*)\\)`).exec(
          block[1]
        );
        if (declared === null) return [`extensions "${module}" declares no operation ${name}`];
        const squash = (params: string) => params.replace(/\s+/g, '');
        return typeof operation.params === 'string' &&
          squash(declared[1]) !== squash(operation.params)
          ? [`operation ${name}(${declared[1].trim()}), expected (${operation.params})`]
          : [];
      });
      return verdict(problems, `extensions "${module}" declares every operation`);
    }),

  'library.file': (ctx, a) => {
    const dir = str(a, 'dir') ?? '';
    const files = libraryFiles(ctx, dir);
    return files.length > 0
      ? { pass: true, detail: `${files.length} library files under ${dir}/` }
      : fail(`no \`library\` file under ${dir}/`);
  },

  'library.imports': (ctx, a) =>
    withSource(ctx, text => {
      const dir = normalizedPath(str(a, 'dir') ?? '');
      const imported = new Set(
        [...text.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)]
          .filter(m => normalizedPath(m[2]).startsWith(`${dir}/`))
          .flatMap(m => m[1].split(',').map(name => name.trim().split(/\s+/)[0]))
      );
      const problems = (strs(a, 'names') ?? [])
        .filter(name => !imported.has(name))
        .map(name => `'${name}' is not imported from ${dir}/`);
      return verdict(problems, `every name is imported from ${dir}/`);
    }),

  'library.jsdoc': (ctx, a) => {
    const sources = libraryFiles(ctx, str(a, 'dir') ?? '').map(file => readText(file) ?? '');
    const problems = (strs(a, 'names') ?? [])
      .filter(name => {
        const documented = new RegExp(
          `/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/\\s*(?:\\b(?:private|endable)\\s+)*action\\s+${escapeRegExp(name)}\\b`
        );
        return !sources.some(source => documented.test(source));
      })
      .map(name => `action '${name}' has no JSDoc comment`);
    return verdict(problems, 'every action has a JSDoc comment');
  },

  'library.checksClean': (ctx, a) => {
    const dir = str(a, 'dir') ?? '';
    const files = libraryFiles(ctx, dir);
    if (files.length === 0) return fail(`no \`library\` file under ${dir}/`);
    if (ctx.input.eligian === undefined) return fail('no CLI to run (input.eligian)');
    const result = ctx.input.eligian(['check', ...files, '--max-warnings', '0']);
    const output = `${result.stdout}${result.stderr}`.trim();
    return result.status === 0
      ? { pass: true, detail: `eligian check ${dir}/ is clean` }
      : fail(`eligian check exited ${result.status}: ${output}`);
  },

  'dataflow.callsPreserved': ctx =>
    withStartActions(ctx, (name, calls, action) => {
      const compiled = [...action.startOperations, ...(action.endOperations ?? [])].map(sourceCall);
      const problems: string[] = [];
      for (const call of calls) {
        const at = compiled.indexOf(call);
        if (at === -1) problems.push(`action '${name}' lost its '${call}'`);
        else compiled.splice(at, 1);
      }
      return problems;
    }),

  'dataflow.selectedBeforeAddClass': ctx =>
    withStartActions(ctx, (name, _calls, action) => {
      const lists = operationLists(ctx.config);
      const calledSelected = lists.every(operations =>
        operations.every(
          (operation, i) =>
            operation.systemName !== 'requestAction' ||
            operation.operationData?.systemName !== name ||
            operations.slice(0, i).some(previous => previous.systemName === 'selectElement')
        )
      );
      return [action.startOperations, action.endOperations ?? []].flatMap(operations =>
        operations.flatMap((operation, i) => {
          if (operation.systemName !== 'addClass' || calledSelected) return [];
          const selected = operations
            .slice(0, i)
            .some(
              previous =>
                previous.systemName === 'selectElement' ||
                (previous.systemName === 'setOperationData' &&
                  Object.keys(
                    (previous.operationData?.properties ?? {}) as Readonly<Record<string, unknown>>
                  ).some(key => key.startsWith('__eligian_param_')))
            );
          return selected
            ? []
            : [
                `addClass #${i} of action '${name}' has no selectElement or __eligian_param_ save before it, nor a selecting caller`,
              ];
        })
      );
    }),

  'storyboard.exists': ctx => {
    const storyboard = ctx.input.storyboard;
    if (storyboard === undefined) return fail('no storyboard');
    return storyboard.beats.length > 0
      ? { pass: true, detail: `STORYBOARD.md has ${storyboard.beats.length} beat rows` }
      : fail('STORYBOARD.md has no beat rows');
  },

  'storyboard.beatsCovered': ctx => {
    const storyboard = ctx.input.storyboard;
    if (storyboard === undefined) return fail('no storyboard');
    const problems = [
      ...storyboard.beats.flatMap(row => {
        const problem = beatProblem(ctx, row);
        return problem === undefined
          ? []
          : [`beat '${row.timeline} ${row.start}..${row.end} ${row.selector}': ${problem}`];
      }),
      ...storyboard.interactionRows.flatMap(row => {
        const problem = interactionProblem(ctx, row);
        return problem === undefined
          ? []
          : [
              `interaction '${row.trigger} | ${row.target} | ${row.verb} | ${row.timeline}': ${problem}`,
            ];
      }),
    ];
    return verdict(
      problems,
      `${storyboard.beats.length} beat rows and ${storyboard.interactionRows.length} interaction rows covered`
    );
  },

  'beats.min': (ctx, a) => {
    let n: number;
    if (a.n === 'storyboard') {
      if (ctx.input.storyboard === undefined) return fail('no storyboard');
      n = ctx.input.storyboard.beats.length;
    } else if (a.n === 'start') {
      const { startDir, entry } = ctx.input;
      if (startDir === undefined) return fail('no start state (startDir)');
      const source = readText(path.join(startDir, entry));
      if (source === undefined) return fail(`cannot read the start state's ${entry}`);
      n = startAtEvents(source);
    } else {
      n = num(a, 'n') ?? 0;
    }
    const count = rangedCount(ctx.timelines);
    const what = `${count} ranged timeline actions, expected at least ${n}`;
    return count >= n ? { pass: true, detail: what } : fail(what);
  },

  'config.equivalent': (ctx, a) => {
    const fixture = str(a, 'fixture') ?? '';
    const text = readText(path.join(ctx.input.casesDir, fixture));
    if (text === undefined) return fail(`fixture not found: ${fixture}`);
    const expected = shapeOf(JSON.parse(text) as IEngineConfiguration);
    const problems = shapeDifferences(shapeOf(ctx.input.config), expected);
    return verdict(problems, `equivalent to ${fixture}`);
  },
};

function usedVerdict(what: string, used: ReadonlySet<string>, a: Assertion): Outcome {
  const anyOf = strs(a, 'anyOf');
  const problems = [
    ...(strs(a, 'all') ?? []).filter(name => !used.has(name)).map(name => `no ${what} '${name}'`),
    ...(anyOf !== undefined && !anyOf.some(name => used.has(name))
      ? [`none of the ${what}s ${list(anyOf)}`]
      : []),
  ];
  return verdict(problems, `the ${what}s are used`);
}

/** Runs `check` on the comment-stripped entry source. */
function withSource(ctx: Context, check: (text: string) => Outcome): Outcome {
  const source = readText(path.join(ctx.input.projectDir, ctx.input.entry));
  return source === undefined
    ? fail(`cannot read ${ctx.input.entry}`)
    : check(stripComments(source));
}

const sourceMatch = (ctx: Context, pattern: RegExp, what: string): Outcome =>
  withSource(ctx, text =>
    pattern.test(blankStrings(text))
      ? { pass: true, detail: `the source has ${what}` }
      : fail(`the source has no ${what}`)
  );

function sourceBlocks(text: string, a: Assertion): Outcome {
  const count = (keyword: string) =>
    (text.match(new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'g')) ?? []).length;
  const keyword = str(a, 'keyword');
  const equals = num(a, 'equals');
  const anyOf = strs(a, 'anyOf');
  const problems: string[] = [];
  if (keyword !== undefined) {
    const n = count(keyword);
    if (equals !== undefined ? n !== equals : n === 0) {
      problems.push(`${n} '${keyword}' blocks, expected ${equals ?? 'at least 1'}`);
    }
  }
  if (anyOf !== undefined && !anyOf.some(word => count(word) > 0)) {
    problems.push(`none of ${list(anyOf)} in the source`);
  }
  return verdict(problems, 'the source has the blocks');
}

/**
 * The source call a compiled operation came from: the compiler rewrites a bare
 * `clearOperationData()` whose block still uses an action parameter into a `setOperationData`
 * with `override` (`erased-parameters.ts`), so that form counts as the `clearOperationData` call.
 */
const sourceCall = (operation: Operation): string =>
  operation.systemName === 'setOperationData' && operation.operationData?.override === true
    ? 'clearOperationData'
    : operation.systemName;

/** Runs `check` on each start-state action that held an `addClass` and still exists. */
function withStartActions(
  ctx: Context,
  check: (name: string, calls: readonly string[], action: ActionLike) => string[]
): Outcome {
  const { startDir, entry } = ctx.input;
  if (startDir === undefined) return fail('no start state (startDir)');
  const source = readText(path.join(startDir, entry));
  if (source === undefined) return fail(`cannot read the start state's ${entry}`);
  const problems: string[] = [];
  for (const [name, calls] of startActions(source)) {
    if (!calls.includes('addClass')) continue;
    const action = ctx.declared.get(name);
    if (action === undefined) problems.push(`action '${name}' (it held an addClass) is gone`);
    else problems.push(...check(name, calls, action));
  }
  return verdict(problems, 'every start-state addClass action holds');
}

function contextOf(input: AssertionInput): Context {
  const config = input.config as unknown as ConfigLike;
  const timelines = config.timelines ?? [];
  const actions = new Map<string, ActionBody>(
    (config.actions ?? []).map(action => [
      action.name,
      {
        startOperations: action.startOperations as readonly WalkedOperation[],
        endOperations: (action.endOperations ?? []) as readonly WalkedOperation[],
      },
    ])
  );
  const declared = new Map<string, ActionLike>(
    [...(config.actions ?? []), ...(config.eventActions ?? [])].map(action => [action.name, action])
  );
  const names = input.map?.timelineNames ?? timelines.map(timeline => timeline.uri);
  return { input, config, timelines, actions, declared, names };
}

/** Evaluate each assertion over a produced project and its compiled config. Never throws. */
export function evaluateAssertions(
  input: AssertionInput,
  assertions: readonly Assertion[]
): readonly AssertionResult[] {
  const ctx = contextOf(input);
  return assertions.map(assertion => {
    const problem = assertionProblem(assertion);
    if (problem !== undefined) {
      return { kind: assertion.kind, pass: false, detail: `invalid assertion: ${problem}` };
    }
    try {
      return { kind: assertion.kind, ...EVALUATORS[assertion.kind](ctx, assertion) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: assertion.kind, pass: false, detail: `error: ${message}` };
    }
  });
}

export * from './gate-steps.js';
export * from './harness.js';
export * from './transcript.js';
