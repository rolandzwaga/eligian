/**
 * The review pass of `eligian check` and `eligian_check` (spec 058, FR-030):
 * warnings over one compiled program that the language validation cannot
 * see, located at source through the Eligian map.
 *
 * - `controller-imbalance`: a timeline's `on enter` adds controllers that its
 *   `on leave` does not remove (or the other way round). The engine never
 *   detaches controllers on a timeline switch, so they pile up. A quick fix
 *   inserts the missing removals.
 * - `class-never-removed`: an `addClass` that nothing removes afterwards in
 *   the same timeline: not the same action's end block, a later range or
 *   `on leave`.
 *
 * Both follow `requestAction` / `startAction` (and `endAction`, into the
 * action's end block) with the call's arguments substituted (`walkOperations`, shared with `controllerBalance`).
 *
 * Phase 2 (FR-050, FR-056):
 * - the five timeline checks (`timelineFindings`, shared with the MCP
 *   server's `assets.problems`), at the reported property;
 * - `host-operation-in-block-without-select`: a host operation with no
 *   `selectElement` before it in a list whose operation data starts fresh
 *   (timeline, init and event actions; named-action bodies inherit their
 *   caller's selection and are exempt). `target` and `with` compile to a
 *   leading `selectElement`; a declared `selector` parameter exempts it;
 * - `lottie-web-not-installed`: a `LottieController` where no
 *   `node_modules/lottie-web` is found from the program's directory upward.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type CheckDiagnostic,
  type EligianMapAction,
  hostOperations,
  type QuickFix,
} from '@eligian/language';
import {
  type ControllerBalance,
  controllerBalance,
  type LifecycleInsertionPoint,
  lifecycleInsertionPoints,
  TIMELINE_REVIEW_CODES,
  type TimelineFinding,
  timelineFindings,
  type WalkEvent,
  walkOperations,
} from '@eligian/language/mcp';
import type { CompileResult } from '../compile-file.js';

export const REVIEW_CODES = [
  'controller-imbalance',
  'class-never-removed',
  ...TIMELINE_REVIEW_CODES,
  'host-operation-in-block-without-select',
  'lottie-web-not-installed',
] as const;
export type ReviewCode = (typeof REVIEW_CODES)[number];

type Compiled = Pick<CompileResult, 'config' | 'map' | 'program'>;
type Timeline = Compiled['config']['timelines'][number];
type MapLocation = NonNullable<EligianMapAction['location']>;

/** The name of the timeline action `on enter` / `on leave` compile to. */
const LIFECYCLE_ACTION = 'timeline-lifecycle';
/** A value the engine resolves at runtime: not a compile-time literal. */
const RUNTIME_CHAIN = /\$(?:operationdata|globaldata|scope)\./;

/** Review warnings over one compiled program, located at source. */
export function reviewConfig(compiled: Compiled, file: string): CheckDiagnostic[] {
  // The config's timelines, the balances and the insertion points are all in
  // document order. They are matched by index, not by uri: a video timeline's
  // uri is its source path, not its name.
  const points = lifecycleInsertionPoints(compiled.program);
  const text = compiled.program.$cstNode?.root.fullText ?? '';
  const balances = controllerBalance(compiled.config);
  const perTimeline = compiled.config.timelines.flatMap((timeline, index) => {
    const balance = balances[index];
    const point = points[index];
    const name = point?.timeline ?? timeline.uri;
    return [
      ...(balance ? controllerImbalance(compiled, file, timeline, name, balance, point, text) : []),
      ...classesNeverRemoved(compiled, file, timeline, name),
    ];
  });
  return [
    ...perTimeline,
    ...timelineFindings(compiled.program, file).map(finding => timelineWarning(file, finding)),
    ...hostOperationsWithoutSelect(compiled, file),
    ...lottieNotInstalled(compiled, file),
  ];
}

function diagnostic(
  file: string,
  code: ReviewCode,
  message: string,
  location: MapLocation | undefined,
  quickFix?: QuickFix
): CheckDiagnostic {
  const line = location?.line ?? 1;
  const column = location?.column ?? 1;
  return {
    file: location?.file ?? file,
    severity: 'warning',
    message,
    line,
    column,
    endLine: line,
    endColumn: column + (location?.length ?? 1),
    code,
    ...(quickFix ? { data: { quickFix } } : {}),
  };
}

// --- controller-imbalance ---------------------------------------------------

/** The items of `a` not matched one for one by an item of `b`. */
function multisetMinus(a: readonly string[], b: readonly string[]): string[] {
  const rest = [...b];
  return a.filter(item => {
    const index = rest.indexOf(item);
    if (index === -1) return true;
    rest.splice(index, 1);
    return false;
  });
}

/** A `controllerBalance` entry (`${selector} ${controller}`) split in two. */
function splitControllerKey(key: string): { readonly selector: string; readonly name: string } {
  const space = key.lastIndexOf(' ');
  return { selector: key.slice(0, space), name: key.slice(space + 1) };
}

const describeControllers = (keys: readonly string[]): string =>
  keys
    .map(splitControllerKey)
    .map(({ selector, name }) => `${name} on "${selector}"`)
    .join(', ');

function controllerImbalance(
  compiled: Compiled,
  file: string,
  timeline: Timeline,
  name: string,
  balance: ControllerBalance,
  point: LifecycleInsertionPoint | undefined,
  text: string
): CheckDiagnostic[] {
  const missing = multisetMinus(balance.added, balance.removed);
  const extra = multisetMinus(balance.removed, balance.added);
  if (missing.length === 0 && extra.length === 0) return [];
  const parts = [
    ...(missing.length > 0
      ? [`on leave does not remove controllers that on enter adds: ${describeControllers(missing)}`]
      : []),
    ...(extra.length > 0
      ? [`on leave removes controllers that on enter does not add: ${describeControllers(extra)}`]
      : []),
  ];
  const lifecycle = timeline.timelineActions.find(action => action.name === LIFECYCLE_ACTION);
  const location =
    (lifecycle && compiled.map.actions[lifecycle.id]?.location) ??
    timeline.timelineActions
      .map(action => compiled.map.actions[action.id]?.location)
      .find(found => found !== undefined);
  return [
    diagnostic(
      file,
      'controller-imbalance',
      `Timeline "${name}": ${parts.join('; ')}`,
      location,
      missing.length > 0 && point ? removalFix(missing, point, text) : undefined
    ),
  ];
}

/**
 * The quick fix for controllers added and never removed: the removal lines
 * before the `on leave` block's `]`, or a whole `on leave` block before the
 * timeline's `}`. Undefined when a selector is not a literal.
 */
function removalFix(
  missing: readonly string[],
  point: LifecycleInsertionPoint,
  text: string
): QuickFix | undefined {
  const controllers = missing.map(splitControllerKey);
  if (controllers.some(({ selector }) => selector === 'undefined' || RUNTIME_CHAIN.test(selector)))
    return undefined;
  const { indent } = point;
  const removals = controllers.flatMap(({ selector, name }) => [
    `${indent}    selectElement(${JSON.stringify(selector)})`,
    `${indent}    removeControllerFromElement(${JSON.stringify(name)})`,
  ]);
  const position = point.leaveClose ?? point.bodyClose;
  const [lines, closeIndent] = point.leaveClose
    ? [removals, `${indent}  `]
    : [[`${indent}  on leave [`, ...removals, `${indent}  ]`], indent];
  const block = [...lines, closeIndent].join('\n');
  // What precedes the `]` / `}` on its line: usually just its indentation
  const before = (text.split('\n')[position.line] ?? '').slice(0, position.character);
  const newText =
    /^[ \t]*$/.test(before) && block.startsWith(before) ? block.slice(before.length) : `\n${block}`;
  const line = position.line + 1;
  const column = position.character + 1;
  return { line, column, endLine: line, endColumn: column, newText };
}

// --- class-never-removed ----------------------------------------------------

type ClassEvent = Extract<WalkEvent, { readonly className: unknown }>;

const isClassEvent = (event: WalkEvent): event is ClassEvent => 'className' in event;
const isLiteral = (value: unknown): value is string =>
  typeof value === 'string' && !RUNTIME_CHAIN.test(value);
/** The selector + class of a class event, when both are literals. */
const classKey = (event: ClassEvent): string | undefined =>
  isLiteral(event.selector) && isLiteral(event.className)
    ? `${event.selector}\u0000${event.className}`
    : undefined;

interface WalkedAction {
  readonly id: string;
  readonly index: number;
  readonly startTime: number;
  readonly lifecycle: boolean;
  readonly start: readonly ClassEvent[];
  readonly end: readonly ClassEvent[];
}

/** The keys removed or toggled by `events`, from position `from` on. */
const removedKeys = (events: readonly ClassEvent[], from = 0): Set<string> =>
  new Set(
    events
      .slice(from)
      .filter(event => event.kind !== 'class-added')
      .map(classKey)
      .filter((key): key is string => key !== undefined)
  );

function classesNeverRemoved(
  compiled: Compiled,
  file: string,
  timeline: Timeline,
  name: string
): CheckDiagnostic[] {
  // Both lists: a ranged call of an endable action ends it (`endAction`) in the event's end ops
  const actions = new Map((compiled.config.actions ?? []).map(action => [action.name, action]));
  const classEvents = (operations: Parameters<typeof walkOperations>[0]) =>
    walkOperations(operations, actions).events.filter(isClassEvent);
  const walked: WalkedAction[] = timeline.timelineActions.map((action, index) => ({
    id: action.id,
    index,
    startTime: action.duration.start,
    lifecycle: action.name === LIFECYCLE_ACTION,
    start: classEvents(action.startOperations),
    end: classEvents(action.endOperations),
  }));

  // A non-literal selector (or class) on an add or a removal suppresses that class
  const suppressed = new Set(
    walked
      .flatMap(action => [...action.start, ...action.end])
      .filter(event => typeof event.className === 'string' && classKey(event) === undefined)
      .map(event => event.className as string)
  );
  const leaveRemovals = removedKeys(walked.find(action => action.lifecycle)?.end ?? []);
  const isLater = (other: WalkedAction, action: WalkedAction) =>
    other.startTime > action.startTime ||
    (other.startTime === action.startTime && other.index > action.index);
  const laterRemovals = (action: WalkedAction): Set<string> =>
    action.lifecycle
      ? leaveRemovals
      : new Set([
          ...removedKeys(action.end),
          ...walked
            .filter(other => !other.lifecycle && isLater(other, action))
            .flatMap(other => [...removedKeys(other.start), ...removedKeys(other.end)]),
          ...leaveRemovals,
        ]);

  const findings: CheckDiagnostic[] = [];
  const reported = new Set<string>();
  for (const action of walked) {
    const later = laterRemovals(action);
    action.start.forEach((event, position) => {
      const key = classKey(event);
      if (event.kind !== 'class-added' || key === undefined) return;
      if (suppressed.has(event.className as string)) return;
      // Removed further down the same list (add, wait, remove), or later in the timeline
      if (removedKeys(action.start, position + 1).has(key) || later.has(key)) return;
      const id = `${action.id}\u0000${event.at}\u0000${key}`;
      if (reported.has(id)) return;
      reported.add(id);
      const mapped = compiled.map.actions[action.id];
      findings.push(
        diagnostic(
          file,
          'class-never-removed',
          `addClass("${event.className}") on "${event.selector}" is never removed in timeline "${name}": remove it in the end block, a later range or on leave`,
          mapped?.start[event.at]?.location ?? mapped?.location
        )
      );
    });
  }
  return findings;
}

// --- timeline checks (FR-050) -------------------------------------------------

/** A `timelineFindings` entry as a warning at the reported property. */
const timelineWarning = (file: string, finding: TimelineFinding): CheckDiagnostic => ({
  file,
  severity: 'warning',
  message: finding.message,
  line: finding.line,
  column: finding.column,
  endLine: finding.endLine,
  endColumn: finding.endColumn,
  code: finding.code,
});

// --- operation lists ----------------------------------------------------------

type Operations = Timeline['timelineActions'][number]['startOperations'];
type Operation = Operations[number];

interface OperationList {
  readonly id: string;
  readonly phase: 'start' | 'end';
  readonly operations: Operations;
  /** A named action's body: it runs on a copy of its caller's operation data */
  readonly named: boolean;
}

interface ListedAction {
  readonly id: string;
  readonly startOperations: Operations;
  readonly endOperations?: Operations;
}

/** Every operation list of the compiled config, start and end. */
function operationLists(config: Compiled['config']): OperationList[] {
  const lists = (actions: readonly ListedAction[] | undefined, named: boolean) =>
    (actions ?? []).flatMap((action): OperationList[] => [
      { id: action.id, phase: 'start', operations: action.startOperations, named },
      ...(action.endOperations
        ? [{ id: action.id, phase: 'end' as const, operations: action.endOperations, named }]
        : []),
    ]);
  return [
    ...lists(config.initActions, false),
    ...lists(config.eventActions, false),
    ...config.timelines.flatMap(timeline => lists(timeline.timelineActions, false)),
    ...lists(config.actions, true),
  ];
}

/** The source location of operation `index` of `list`, or of its action. */
function locationOf(compiled: Compiled, list: OperationList, index: number) {
  const mapped = compiled.map.actions[list.id];
  return mapped?.[list.phase][index]?.location ?? mapped?.location;
}

// --- host-operation-in-block-without-select ---------------------------------

function hostOperationsWithoutSelect(compiled: Compiled, file: string): CheckDiagnostic[] {
  // A declared `selector` parameter: the operation selects for itself (I-3)
  const unselected = new Set(
    hostOperations(compiled.program)
      .filter(operation => !operation.parameters.some(parameter => parameter.name === 'selector'))
      .map(operation => operation.name)
  );
  if (unselected.size === 0) return [];
  return operationLists(compiled.config)
    .filter(list => !list.named)
    .flatMap(list => {
      const firstSelect = list.operations.findIndex(op => op.systemName === 'selectElement');
      return list.operations.flatMap((op, index) =>
        unselected.has(op.systemName) && (firstSelect === -1 || firstSelect > index)
          ? [
              diagnostic(
                file,
                'host-operation-in-block-without-select',
                `Host operation "${op.systemName}" runs with no selectElement before it in this block: select an element first (selectElement, target or with), or declare a "selector" parameter`,
                locationOf(compiled, list, index)
              ),
            ]
          : []
      );
    });
}

// --- lottie-web-not-installed -------------------------------------------------

const LOTTIE_CONTROLLER = 'LottieController';

const isLottieInstance = (op: Operation): boolean =>
  op.systemName === 'getControllerInstance' &&
  (op.operationData as { systemName?: unknown } | undefined)?.systemName === LOTTIE_CONTROLLER;

/** Whether `lottie-web` is installed in a node_modules at or above `fromDir` (P9). */
export function lottieInstalled(
  fromDir: string,
  exists: (p: string) => boolean = fs.existsSync
): boolean {
  let dir = path.resolve(fromDir);
  for (;;) {
    if (exists(path.join(dir, 'node_modules', 'lottie-web', 'package.json'))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function lottieNotInstalled(compiled: Compiled, file: string): CheckDiagnostic[] {
  // `addController("LottieController", …)` compiles to getControllerInstance + addControllerToElement
  const calls = operationLists(compiled.config).flatMap(list =>
    list.operations.flatMap((op, index) => (isLottieInstance(op) ? [{ list, index }] : []))
  );
  if (calls.length === 0 || lottieInstalled(path.dirname(file))) return [];
  return calls.map(({ list, index }) =>
    diagnostic(
      file,
      'lottie-web-not-installed',
      `${LOTTIE_CONTROLLER} needs lottie-web, which is not installed in this project: run "npm install lottie-web" next to the presentation`,
      locationOf(compiled, list, index)
    )
  );
}
