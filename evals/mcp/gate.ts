/**
 * The Phase 1 eval gate (spec 058 phase 1, FR-051): runs the shipped CLI that is installed in a
 * produced project (`<dir>/node_modules/eligian/bin/cli.js`) and the case's own pass checks.
 *
 *   tsx evals/mcp/gate.ts <project dir> --case <id> [--transcript <file>] [--wall-ms <n>]
 *
 * Steps: 1 check (strict), 2 fmt --check, 3 smoke --strict (`--scenario` when the case has one,
 * phase 2 FR-091), 4 compile --eligian-map, 5 budget (rounds, wall clock, tokens-from-tools); then
 * the case checks over `out/config.json` (for the phase 2 cases, the §6.2 Structural column).
 * Prints one JSON line `{ pass, failures }`; exit 0 = pass, 1 = fail, 2 = usage error.
 *
 * Runs under tsx, outside Biome and every tsconfig, and imports nothing from `packages/**`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = path.join(HERE, 'cases');

/** FR-051 step 5 budget. */
export const BUDGET = { rounds: 2, wallMs: 15 * 60 * 1000, toolChars: 80_000 } as const;

export interface EvalCase {
  readonly id: string;
  readonly prompt: string;
  readonly entry: string;
  readonly model: string;
  /** Phase 2 (FR-090): the scenario file beside the case, `<id>.scenario.json` */
  readonly scenario?: string;
}

export interface ToolCall {
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface GateMetrics {
  /** `eligian_check` lines in ELIGIAN_MCP_LOG */
  readonly checkToolCalls: number;
  /** Bash tool calls in the transcript whose command runs `eligian check` or `cli.js check` */
  readonly checkBashCalls: number;
  /** checkToolCalls + checkBashCalls - 1 (FR-051: a check invocation after the first one) */
  readonly rounds: number;
  /** Sum of `chars` over the lines of ELIGIAN_MCP_LOG */
  readonly toolChars: number;
  readonly wallMs: number | undefined;
}

export interface GateResult {
  readonly pass: boolean;
  readonly failures: readonly string[];
  readonly metrics: GateMetrics;
}

export function loadCase(id: string): EvalCase {
  const file = path.join(CASES_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`no eval case '${id}' (${file})`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as EvalCase;
}

// ---------------------------------------------------------------------------------------------
// Transcript (claude -p --output-format json: one array; stream-json: one event per line)

export function parseTranscript(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(line => line.trim() !== '')
      .flatMap(line => {
        try {
          return [JSON.parse(line) as unknown];
        } catch {
          return [];
        }
      });
  }
}

/** The tool calls of the agent, in order (assistant `message.content[]` items of type tool_use). */
export function toolCalls(events: readonly unknown[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const event of events) {
    const e = event as { type?: string; message?: { content?: unknown } };
    if (e?.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const item of e.message.content as { type?: string; name?: string; input?: unknown }[]) {
      if (item?.type === 'tool_use' && typeof item.name === 'string') {
        calls.push({ name: item.name, input: (item.input ?? {}) as Record<string, unknown> });
      }
    }
  }
  return calls;
}

const CHECK_COMMAND = /(?:\beligian|cli\.js)["']?\s+check\b/;

export function isCheckBashCall(call: ToolCall): boolean {
  return call.name === 'Bash' && CHECK_COMMAND.test(String(call.input.command ?? ''));
}

/** The JSON lines of ELIGIAN_MCP_LOG (`{ t, tool, ms, chars, ok, args }`); other lines skipped. */
export function readMcpLog(file: string): { tool?: unknown; chars?: unknown }[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap(line => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return parsed !== null && typeof parsed === 'object' ? [parsed as { tool?: unknown }] : [];
      } catch {
        return [];
      }
    });
}

export function measure(
  dir: string,
  calls: readonly ToolCall[],
  wallMs: number | undefined
): GateMetrics {
  const log = readMcpLog(path.join(dir, 'mcp.log'));
  const checkToolCalls = log.filter(line => line.tool === 'eligian_check').length;
  const checkBashCalls = calls.filter(isCheckBashCall).length;
  const toolChars = log.reduce(
    (sum, line) => sum + (typeof line.chars === 'number' ? line.chars : 0),
    0
  );
  return {
    checkToolCalls,
    checkBashCalls,
    rounds: checkToolCalls + checkBashCalls - 1,
    toolChars,
    wallMs,
  };
}

// ---------------------------------------------------------------------------------------------
// Compiled configuration helpers

interface Operation {
  readonly systemName: string;
  readonly operationData?: Record<string, unknown>;
}
interface ActionLike {
  readonly name: string;
  readonly startOperations?: readonly Operation[];
  readonly endOperations?: readonly Operation[];
  /** timeline actions only */
  readonly duration?: { readonly start: number; readonly end?: number };
}
interface Config {
  readonly actions?: readonly ActionLike[];
  readonly eventActions?: readonly ActionLike[];
  readonly initActions?: readonly ActionLike[];
  readonly timelines?: readonly {
    readonly uri: string;
    readonly type?: string;
    readonly duration?: number;
    readonly timelineActions: readonly ActionLike[];
  }[];
  readonly availableLanguages?: readonly { readonly languageCode: string }[];
  readonly cssFiles?: readonly string[];
}

/** Every operation list of the config with the action (if any) that owns it. */
function operationLists(config: Config): { owner?: string; operations: readonly Operation[] }[] {
  const lists: { owner?: string; operations: readonly Operation[] }[] = [];
  const add = (action: ActionLike, owner?: string) => {
    lists.push({ owner, operations: action.startOperations ?? [] });
    lists.push({ owner, operations: action.endOperations ?? [] });
  };
  for (const action of [...(config.actions ?? []), ...(config.eventActions ?? [])]) {
    add(action, action.name);
  }
  for (const timeline of config.timelines ?? []) {
    for (const action of timeline.timelineActions) add(action);
  }
  return lists;
}

// copy of packages/language/src/compiler/controller-balance.ts (harness imports no src)
type OperationData = Record<string, unknown>;
function resolveOperationData(value: unknown, data: OperationData): unknown {
  if (typeof value === 'string' && value.startsWith('$operationdata.')) {
    return data[value.slice('$operationdata.'.length)];
  }
  if (Array.isArray(value)) return value.map(item => resolveOperationData(item, data));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as OperationData).map(([k, v]) => [k, resolveOperationData(v, data)])
    );
  }
  return value;
}
interface Use {
  added: string[];
  removed: string[];
  unresolved: string[];
}
function walk(
  operations: readonly Operation[],
  actions: ReadonlyMap<string, readonly Operation[]>,
  start: { data: OperationData; selector: unknown },
  use: Use,
  depth = 0
): void {
  const data: OperationData = { ...start.data };
  let selector = start.selector;
  let controller: unknown;
  let requested: string | undefined;
  for (const operation of operations) {
    const own = operation.operationData ?? {};
    switch (operation.systemName) {
      case 'selectElement':
        selector = resolveOperationData(own.selector, data);
        break;
      case 'setOperationData':
        Object.assign(data, resolveOperationData(own.properties ?? {}, data) as OperationData);
        break;
      case 'getControllerInstance':
        controller = resolveOperationData(own.systemName, data);
        break;
      case 'addControllerToElement':
        use.added.push(`${String(selector)} ${String(controller)}`);
        break;
      case 'removeControllerFromElement':
        use.removed.push(
          `${String(selector)} ${String(resolveOperationData(own.controllerName, data))}`
        );
        break;
      case 'requestAction':
        requested = String(resolveOperationData(own.systemName, data));
        break;
      case 'startAction': {
        const name = requested;
        requested = undefined;
        const body = name === undefined ? undefined : actions.get(name);
        if (body === undefined || depth >= 20) {
          use.unresolved.push(String(name));
          break;
        }
        const args = (own.actionOperationData ?? data.actionOperationData ?? {}) as OperationData;
        const callee = { ...data, ...(resolveOperationData(args, data) as OperationData) };
        delete callee.actionOperationData;
        walk(body, actions, { data: callee, selector }, use, depth + 1);
        break;
      }
    }
  }
}
/** Per timeline: the controllers its lifecycle action adds (start) and removes (end), sorted. */
function controllerBalance(config: Config) {
  const actions = new Map<string, readonly Operation[]>(
    (config.actions ?? []).map(action => [action.name, action.startOperations ?? []])
  );
  return (config.timelines ?? []).map(timeline => {
    const lifecycle = timeline.timelineActions.find(a => a.name === 'timeline-lifecycle');
    const enter: Use = { added: [], removed: [], unresolved: [] };
    const leave: Use = { added: [], removed: [], unresolved: [] };
    if (lifecycle) {
      walk(lifecycle.startOperations ?? [], actions, { data: {}, selector: undefined }, enter);
      walk(lifecycle.endOperations ?? [], actions, { data: {}, selector: undefined }, leave);
    }
    return {
      timeline: timeline.uri,
      added: enter.added.sort(),
      removed: leave.removed.sort(),
      unresolved: [...enter.unresolved, ...leave.unresolved],
    };
  });
}
// end of copy

// ---------------------------------------------------------------------------------------------
// Start-state source (the start states have errors, so they are read as text, not compiled)

/** Source without comments; string contents kept. */
function stripComments(source: string): string {
  return source.replace(/("(?:[^"\\\n]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) =>
    str !== undefined ? str : m.startsWith('/*') ? m.replace(/[^\n]/g, ' ') : ''
  );
}

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
/** DSL sugar compiled to another operation name (operations/index.ts SYNTHETIC_ADD_CONTROLLER). */
const COMPILED_AS: Record<string, string> = {
  addController: 'addControllerToElement',
  removeController: 'removeControllerFromElement',
};

/** Declared actions → the operation names their bodies call (action calls left out). */
export function startActions(source: string): Map<string, string[]> {
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

/** Timeline actions the start state would compile to: `at` events, plus one for on enter / leave. */
export function startTimelineActionCount(source: string): number {
  const text = stripComments(source);
  const events = (text.match(/^\s*at\s/gm) ?? []).length;
  return events + (/\bon\s+(enter|leave)\b/.test(text) ? 1 : 0);
}

function htmlIds(html: string): Set<string> {
  return new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
}

function importPath(source: string, keyword: 'layout'): string | undefined {
  const m = new RegExp(`^\\s*${keyword}\\s+"([^"]+)"`, 'm').exec(stripComments(source));
  return m?.[1];
}

// ---------------------------------------------------------------------------------------------
// Case checks (§6.2; compiled output compared by action name and timeline uri, never by id)

/**
 * The source call a compiled operation came from. The compiler rewrites a bare
 * `clearOperationData()` whose block still uses an action parameter into
 * `setOperationData({ properties: { <parameter>: … }, override: true })`
 * (`erased-parameters.ts`), so that form counts as the `clearOperationData` call.
 */
const sourceCall = (op: { systemName: string; operationData?: Record<string, unknown> }): string =>
  op.systemName === 'setOperationData' && op.operationData?.override === true
    ? 'clearOperationData'
    : op.systemName;

function checkFixDataflow(startDir: string, entry: string, config: Config): string[] {
  const failures: string[] = [];
  const source = fs.readFileSync(path.join(startDir, entry), 'utf8');
  const declared = new Map<string, ActionLike>(
    [...(config.actions ?? []), ...(config.eventActions ?? [])].map(a => [a.name, a])
  );
  const lists = operationLists(config);
  for (const [name, calls] of startActions(source)) {
    if (!calls.includes('addClass')) continue;
    const action = declared.get(name);
    if (!action) {
      failures.push(`case fix-dataflow: action '${name}' (it held an addClass) is gone`);
      continue;
    }
    const own = [action.startOperations ?? [], action.endOperations ?? []];
    const compiled = own.flat().map(sourceCall);
    // No code deleted: every operation the start body called is still called (as a multiset),
    // which keeps the addClass and the operation that read the erased property.
    const remaining = [...compiled];
    for (const call of calls) {
      const at = remaining.indexOf(call);
      if (at === -1) failures.push(`case fix-dataflow: action '${name}' lost its '${call}'`);
      else remaining.splice(at, 1);
    }
    // Each addClass has a selection: earlier in its own list a selectElement or a save/restore
    // setOperationData (`__eligian_param_<name>`, preservedParameterKey), or else every list that
    // calls the action selects before the call (`target` / `with` at the call site).
    const calledSelected = lists.every(({ operations }) =>
      operations.every(
        (op, i) =>
          op.systemName !== 'requestAction' ||
          op.operationData?.systemName !== name ||
          operations.slice(0, i).some(prev => prev.systemName === 'selectElement')
      )
    );
    for (const operations of own) {
      operations.forEach((op, i) => {
        if (op.systemName !== 'addClass') return;
        const selected = operations
          .slice(0, i)
          .some(
            prev =>
              prev.systemName === 'selectElement' ||
              (prev.systemName === 'setOperationData' &&
                Object.keys(
                  (prev.operationData?.properties ?? {}) as Record<string, unknown>
                ).some(key => key.startsWith('__eligian_param_')))
          );
        if (!selected && !calledSelected) {
          failures.push(
            `case fix-dataflow: addClass #${i} of action '${name}' has no selectElement or __eligian_param_ save before it, nor a selecting caller`
          );
        }
      });
    }
  }
  const before = startTimelineActionCount(source);
  const after = (config.timelines ?? []).reduce((n, t) => n + t.timelineActions.length, 0);
  if (after < before) {
    failures.push(`case fix-dataflow: ${after} timeline actions, the start state has ${before}`);
  }
  return failures;
}

function checkFixSelectors(
  dir: string,
  startDir: string,
  entry: string,
  config: Config,
  checkCodes: readonly string[] | undefined
): string[] {
  const failures: string[] = [];
  const startSource = fs.readFileSync(path.join(startDir, entry), 'utf8');
  const startLayout = importPath(startSource, 'layout') ?? 'layout.html';
  const startIds = htmlIds(fs.readFileSync(path.join(startDir, startLayout), 'utf8'));
  const css = fs
    .readdirSync(startDir)
    .filter(file => file.endsWith('.css'))
    .map(file => fs.readFileSync(path.join(startDir, file), 'utf8'))
    .join('\n');
  const used = new Set(
    [...stripComments(startSource).matchAll(/"[^"]*"/g)].flatMap(m =>
      [...m[0].matchAll(/#([A-Za-z_][\w-]*)/g)].map(id => id[1])
    )
  );
  const cssOnly = [...used].filter(
    id => !startIds.has(id) && new RegExp(`#${id}(?![\\w-])`).test(css)
  );
  const source = fs.readFileSync(path.join(dir, entry), 'utf8');
  const layoutFile = path.join(dir, importPath(source, 'layout') ?? startLayout);
  const ids = fs.existsSync(layoutFile) ? htmlIds(fs.readFileSync(layoutFile, 'utf8')) : new Set<string>();
  for (const id of cssOnly) {
    if (!ids.has(id)) failures.push(`case fix-selectors: the layout has no element with id '${id}'`);
  }
  for (const balance of controllerBalance(config)) {
    if (JSON.stringify(balance.added) !== JSON.stringify(balance.removed)) {
      failures.push(
        `case fix-selectors: timeline '${balance.timeline}' adds [${balance.added.join(', ')}] but removes [${balance.removed.join(', ')}]`
      );
    }
    if (balance.unresolved.length > 0) {
      failures.push(
        `case fix-selectors: timeline '${balance.timeline}' calls unresolved actions: ${balance.unresolved.join(', ')}`
      );
    }
  }
  if (checkCodes?.includes('controller-imbalance')) {
    failures.push('case fix-selectors: check reports controller-imbalance');
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------
// Phase 2 structural checks (spec 058 phase 2, FR-091, I-7): the §6.2 Structural column of
// cases 1, 2, 3, 6 and 8, over out/config.json and the produced files.

/** Every operation of the config: actions, event actions, init actions and timeline actions. */
function everyOperation(config: Config): Operation[] {
  const init = (config.initActions ?? []).flatMap(a => [
    ...(a.startOperations ?? []),
    ...(a.endOperations ?? []),
  ]);
  return [...operationLists(config).flatMap(list => list.operations), ...init];
}

/** The ids of the layout the entry imports (`layout "…"`); empty when there is none. */
function layoutIds(dir: string, entry: string): Set<string> {
  const source = fs.readFileSync(path.join(dir, entry), 'utf8');
  const layout = importPath(source, 'layout');
  const file = layout === undefined ? undefined : path.resolve(path.dirname(path.join(dir, entry)), layout);
  return file !== undefined && fs.existsSync(file)
    ? htmlIds(fs.readFileSync(file, 'utf8'))
    : new Set<string>();
}

function missingIds(caseId: string, dir: string, entry: string, ids: readonly string[]): string[] {
  const present = layoutIds(dir, entry);
  return ids
    .filter(id => !present.has(id))
    .map(id => `case ${caseId}: the layout has no element with id '${id}'`);
}

/** Does the config add `controller` anywhere (a literal getControllerInstance or via a call)? */
function addsController(config: Config, controller: string): boolean {
  return (
    everyOperation(config).some(
      op => op.systemName === 'getControllerInstance' && op.operationData?.systemName === controller
    ) || controllerBalance(config).some(b => b.added.some(use => use.endsWith(` ${controller}`)))
  );
}

/** Case 1: 1 raf timeline of duration 10; play / pause actions; ids; CSS state classes. */
function checkTitleCard(dir: string, entry: string, config: Config): string[] {
  const failures: string[] = [];
  const timelines = config.timelines ?? [];
  if (timelines.length !== 1) {
    failures.push(`case title-card: ${timelines.length} timelines, expected 1`);
  }
  for (const timeline of timelines) {
    if (timeline.type !== 'animation') {
      failures.push(`case title-card: timeline '${timeline.uri}' is '${timeline.type}', not a raf (animation) timeline`);
    }
    if (timeline.duration !== 10) {
      failures.push(`case title-card: timeline '${timeline.uri}' lasts ${timeline.duration}, expected 10`);
    }
  }
  const actions = new Set((config.actions ?? []).map(a => a.name));
  for (const name of ['__on__play', '__on__pause']) {
    if (!actions.has(name)) failures.push(`case title-card: no '${name}' action (on click … play / pause)`);
  }
  failures.push(...missingIds('title-card', dir, entry, ['headline', 'subtitle']));
  // The state classes: `in` (the prompt) and every literal class the program adds or toggles.
  const classes = new Set(['in']);
  for (const op of everyOperation(config)) {
    const className = op.operationData?.className;
    if (
      (op.systemName === 'addClass' || op.systemName === 'toggleClass') &&
      typeof className === 'string' &&
      !className.startsWith('$')
    ) {
      classes.add(className);
    }
  }
  const entryDir = path.dirname(path.join(dir, entry));
  const css = (config.cssFiles ?? [])
    .map(file => path.resolve(entryDir, file))
    .filter(file => fs.existsSync(file))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');
  for (const className of classes) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\.${escaped}(?![\\w-])`).test(css)) {
      failures.push(`case title-card: the CSS defines no rule for the state class '${className}'`);
    }
  }
  return failures;
}

/** Case 2: ≥ 4 timelines; navigate actions; en-US + nl-NL; a LabelController; chapter lifecycles. */
function checkThreeChapters(config: Config): string[] {
  const failures: string[] = [];
  const timelines = config.timelines ?? [];
  if (timelines.length < 4) {
    failures.push(`case three-chapters: ${timelines.length} timelines, expected at least 4`);
  }
  if (!(config.actions ?? []).some(a => a.name.startsWith('__nav__'))) {
    failures.push('case three-chapters: no __nav__* action (on click … navigate)');
  }
  const languages = new Set((config.availableLanguages ?? []).map(l => l.languageCode));
  for (const code of ['en-US', 'nl-NL']) {
    if (!languages.has(code)) failures.push(`case three-chapters: the languages block has no '${code}'`);
  }
  if (!addsController(config, 'LabelController')) {
    failures.push('case three-chapters: no LabelController is added');
  }
  for (const chapter of ['Problem', 'Solution', 'Results']) {
    const timeline = timelines.find(t => t.uri === chapter);
    if (timeline === undefined) {
      failures.push(`case three-chapters: no timeline '${chapter}'`);
      continue;
    }
    const lifecycle = timeline.timelineActions.find(a => a.name === 'timeline-lifecycle');
    if ((lifecycle?.startOperations ?? []).length === 0) {
      failures.push(`case three-chapters: timeline '${chapter}' has no on enter`);
    }
    if ((lifecycle?.endOperations ?? []).length === 0) {
      failures.push(`case three-chapters: timeline '${chapter}' has no on leave`);
    }
  }
  return failures;
}

/** Case 3: one stagger whose 6 timeline actions start 0.4 s apart; the 6 card ids. */
function checkStaggeredList(dir: string, entry: string, config: Config): string[] {
  const failures: string[] = [];
  const source = stripComments(fs.readFileSync(path.join(dir, entry), 'utf8'));
  const staggers = (source.match(/^\s*stagger\b/gm) ?? []).length;
  if (staggers !== 1) failures.push(`case staggered-list: ${staggers} stagger blocks, expected 1`);
  const runs = (config.timelines ?? []).map(timeline =>
    timeline.timelineActions
      .filter(a => a.name.startsWith('stagger-'))
      .map(a => a.duration?.start ?? Number.NaN)
      .sort((a, b) => a - b)
  );
  const spaced = (starts: readonly number[]) =>
    starts.length === 6 && starts.every((s, i) => i === 0 || Math.abs(s - starts[i - 1] - 0.4) < 1e-6);
  if (!runs.some(spaced)) {
    failures.push(
      `case staggered-list: no timeline has 6 stagger actions 0.4 s apart (stagger starts: ${runs.map(r => `[${r.join(', ')}]`).join(' ')})`
    );
  }
  failures.push(
    ...missingIds('staggered-list', dir, entry, [1, 2, 3, 4, 5, 6].map(n => `card-${n}`))
  );
  return failures;
}

/** Case 6: 12 slide timelines, each adding a KeyboardController on enter and removing it on leave. */
function checkKeyboardDeck(config: Config): string[] {
  const failures: string[] = [];
  const timelines = config.timelines ?? [];
  if (timelines.length !== 12) {
    failures.push(`case keyboard-deck: ${timelines.length} timelines, expected 12`);
  }
  const balances = new Map(controllerBalance(config).map(b => [b.timeline, b]));
  const keyboard = (uses: readonly string[]) =>
    uses.filter(use => use.endsWith(' KeyboardController')).sort();
  for (let n = 1; n <= 12; n++) {
    const uri = `slide-${n}`;
    const balance = balances.get(uri);
    if (balance === undefined) {
      failures.push(`case keyboard-deck: no timeline '${uri}'`);
      continue;
    }
    const added = keyboard(balance.added);
    const removed = keyboard(balance.removed);
    if (added.length === 0) {
      failures.push(`case keyboard-deck: timeline '${uri}' adds no KeyboardController in on enter`);
    } else if (JSON.stringify(added) !== JSON.stringify(removed)) {
      failures.push(
        `case keyboard-deck: timeline '${uri}' adds [${added.join(', ')}] but removes [${removed.join(', ')}] in on leave`
      );
    }
  }
  return failures;
}

/** Case 8: a `library` file under lib/; fadeIn, fadeOut and slideIn imported from it and used. */
function checkLibraryReuse(dir: string, entry: string, config: Config): string[] {
  const failures: string[] = [];
  const libDir = path.join(dir, 'lib');
  const libraries = fs.existsSync(libDir)
    ? (fs.readdirSync(libDir, { recursive: true }) as string[])
        .filter(file => file.endsWith('.eligian'))
        .filter(file =>
          /^\s*library\s+[A-Za-z_]/.test(stripComments(fs.readFileSync(path.join(libDir, file), 'utf8')))
        )
    : [];
  if (libraries.length === 0) failures.push('case library-reuse: no `library` file under lib/');
  const source = stripComments(fs.readFileSync(path.join(dir, entry), 'utf8'));
  const imported = new Set(
    [...source.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)]
      .filter(m => /^(\.\/)?lib\//.test(m[2]))
      .flatMap(m => m[1].split(',').map(name => name.trim().split(/\s+/)[0]))
  );
  const requested = new Set(
    everyOperation(config)
      .filter(op => op.systemName === 'requestAction')
      .map(op => op.operationData?.systemName)
  );
  for (const name of ['fadeIn', 'fadeOut', 'slideIn']) {
    if (!imported.has(name)) failures.push(`case library-reuse: '${name}' is not imported from lib/`);
    if (!requested.has(name)) failures.push(`case library-reuse: '${name}' is never called`);
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------

export interface GateOptions {
  readonly dir: string;
  readonly caseId: string;
  readonly transcript?: readonly unknown[];
  readonly wallMs?: number;
}

export function runGate(options: GateOptions): GateResult {
  const dir = path.resolve(options.dir);
  const evalCase = loadCase(options.caseId);
  const entry = evalCase.entry;
  const cli = path.join(dir, 'node_modules', 'eligian', 'bin', 'cli.js');
  const failures: string[] = [];
  const eligian = (args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const tail = (text: string | null) => (text ?? '').trim().split(/\r?\n/).slice(-5).join(' | ');
  /** The problems of a `smoke --format json` report, one per line; undefined when it is not one. */
  const smokeProblems = (text: string | null): string | undefined => {
    try {
      const report = JSON.parse(text ?? '') as {
        problems?: { severity: string; message: string; location?: { line?: number } }[];
      }[];
      const problems = report.flatMap(file => file.problems ?? []);
      if (problems.length === 0) return undefined;
      return problems
        .map(p => `${p.severity}: ${p.message}${p.location?.line === undefined ? '' : ` (line ${p.location.line})`}`)
        .join(' | ');
    } catch {
      return undefined;
    }
  };

  if (!fs.existsSync(cli)) failures.push(`setup: ${cli} does not exist (tarball not installed)`);

  // Step 1: check, strict (lint and review are the 1.1.0 defaults).
  const check = eligian([
    'check',
    entry,
    '--max-warnings',
    '0',
    '--selector-not-in-layout',
    'ids',
    '--format',
    'json',
  ]);
  let checkCodes: string[] | undefined;
  try {
    const report = JSON.parse(check.stdout) as {
      files: { diagnostics: { code?: string; severity: string }[] }[];
    };
    checkCodes = report.files.flatMap(file => file.diagnostics.map(d => d.code ?? d.severity));
  } catch {
    checkCodes = undefined;
  }
  if (check.status !== 0) {
    const detail = checkCodes ? `codes: ${checkCodes.join(', ')}` : tail(check.stderr || check.stdout);
    failures.push(`step 1 (check): exit ${check.status}; ${detail}`);
  }

  // Step 2: fmt --check.
  const fmt = eligian(['fmt', '--check', '**/*.eligian']);
  if (fmt.status !== 0) {
    failures.push(`step 2 (fmt --check): exit ${fmt.status}; ${tail(fmt.stdout || fmt.stderr)}`);
  }

  // Step 3: smoke --strict, with the case's scenario when it has one (FR-091; no determinism
  // before Phase 3). A failed assertion is a problem of the json report.
  const scenario =
    evalCase.scenario === undefined ? [] : ['--scenario', path.join(CASES_DIR, evalCase.scenario)];
  const smoke = eligian(['smoke', entry, '--strict', '--format', 'json', ...scenario]);
  if (smoke.status !== 0) {
    failures.push(`step 3 (smoke --strict): exit ${smoke.status}; ${smokeProblems(smoke.stdout) ?? tail(smoke.stdout || smoke.stderr)}`);
  }

  // Step 4: compile with the Eligian map.
  const output = path.join(dir, 'out', 'config.json');
  // A fresh out/ (compile writes the file but does not create its directory).
  fs.rmSync(path.join(dir, 'out'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'out'));
  const compile = eligian(['compile', entry, '--eligian-map', '-o', 'out/config.json']);
  if (compile.status !== 0) {
    failures.push(`step 4 (compile): exit ${compile.status}; ${tail(compile.stderr || compile.stdout)}`);
  }

  // Step 5: budget.
  const metrics = measure(dir, toolCalls(options.transcript ?? []), options.wallMs);
  if (metrics.rounds > BUDGET.rounds) {
    failures.push(
      `step 5 (budget): ${metrics.rounds} self-correction rounds (${metrics.checkToolCalls} eligian_check + ${metrics.checkBashCalls} CLI checks - 1) > ${BUDGET.rounds}`
    );
  }
  if (metrics.wallMs !== undefined && metrics.wallMs > BUDGET.wallMs) {
    failures.push(`step 5 (budget): wall clock ${metrics.wallMs} ms > ${BUDGET.wallMs} ms`);
  }
  if (metrics.toolChars > BUDGET.toolChars) {
    failures.push(`step 5 (budget): tokens-from-tools ${metrics.toolChars} chars > ${BUDGET.toolChars}`);
  }

  // Case checks over out/config.json.
  if (compile.status === 0 && fs.existsSync(output)) {
    const config = JSON.parse(fs.readFileSync(output, 'utf8')) as Config;
    const startDir = path.join(CASES_DIR, evalCase.id, 'start');
    if (evalCase.id === 'fix-dataflow') {
      failures.push(...checkFixDataflow(startDir, entry, config));
    } else if (evalCase.id === 'fix-selectors') {
      failures.push(...checkFixSelectors(dir, startDir, entry, config, checkCodes));
    } else if (evalCase.id === 'title-card') {
      failures.push(...checkTitleCard(dir, entry, config));
    } else if (evalCase.id === 'three-chapters') {
      failures.push(...checkThreeChapters(config));
    } else if (evalCase.id === 'staggered-list') {
      failures.push(...checkStaggeredList(dir, entry, config));
    } else if (evalCase.id === 'keyboard-deck') {
      failures.push(...checkKeyboardDeck(config));
    } else if (evalCase.id === 'library-reuse') {
      failures.push(...checkLibraryReuse(dir, entry, config));
    } else {
      failures.push(`case ${evalCase.id}: no case checks are defined`);
    }
  } else {
    failures.push(`case ${evalCase.id}: not checked, out/config.json was not compiled`);
  }

  return { pass: failures.length === 0, failures, metrics };
}

const USAGE = `usage: tsx evals/mcp/gate.ts <project dir> --case <id> [--transcript <file>] [--wall-ms <n>]

  <project dir>       a produced project with the eligian tarball installed (node_modules/eligian)
  --case <id>         the eval case (evals/mcp/cases/<id>.json)
  --transcript <file> the claude -p output (json or stream-json), for the CLI check count
  --wall-ms <n>       the agent's wall clock, for the 15 min budget

Prints one JSON line { pass, failures }; exit 0 = pass, 1 = fail, 2 = usage error.`;

function main(argv: readonly string[]): number {
  let dir: string | undefined;
  let caseId: string | undefined;
  let transcriptFile: string | undefined;
  let wallMs: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      return 0;
    }
    if (arg === '--case') caseId = argv[++i];
    else if (arg === '--transcript') transcriptFile = argv[++i];
    else if (arg === '--wall-ms') wallMs = Number(argv[++i]);
    else if (dir === undefined && !arg.startsWith('--')) dir = arg;
    else {
      console.error(`unknown argument: ${arg}\n\n${USAGE}`);
      return 2;
    }
  }
  if (dir === undefined || caseId === undefined || (wallMs !== undefined && !(wallMs >= 0))) {
    console.error(USAGE);
    return 2;
  }
  try {
    const transcript = transcriptFile
      ? parseTranscript(fs.readFileSync(transcriptFile, 'utf8'))
      : undefined;
    const result = runGate({ dir, caseId, transcript, wallMs });
    console.log(JSON.stringify({ pass: result.pass, failures: result.failures }));
    return result.pass ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
