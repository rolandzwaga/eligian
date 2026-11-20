/**
 * Spec 058 phase 2 (FR-010–FR-016, FR-005; plan D2): `eligian_compile`, the compiled Eligius
 * JSON of a program as an MCP tool.
 *
 * One compile path: `compileFile(path, { optimize: true })` under the compiler lock. The views:
 * `summary` (timelines, action names, operation counts, controllers), `fragment` (one timeline,
 * action or the innermost action around a source line, without ids, each action with its source
 * location; the shared `fragmentOf`) and `full` (the config verbatim). `includeMap` adds the
 * Eligian map entries of the returned actions. A program that does not compile answers with the
 * error diagnostics `eligian_check` reports for it (same `checkPaths` options, same
 * `toMcpDiagnostics`), still under the lock; a library answers `{ ok: false, library: true }`.
 *
 * Phase 3 (FR-045–FR-047, I-5; plan C1): `explain: true` adds each returned operation's origin
 * (read from the Eligian map) and, once per present origin, its rule from `ORIGIN_RULES`; the
 * summary view gets the per-origin counts instead of the operation list.
 *
 * `Tool` is `@stability unstable`; the server is built on it (roadmap §2, decision 1: `effect` is
 * pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import fs from 'node:fs';
import path from 'node:path';
import type {
  EligianMap,
  EligianMapAction,
  IEngineConfiguration,
  OperationOrigin,
} from '@eligian/language';
import { timelineNames } from '@eligian/language/mcp';
import { Effect, Schema } from 'effect';
import { checkPaths, isLibrary } from '../../check/check-command.js';
import { type CompileResult, compileFile } from '../../compile-file.js';
import { checkPrograms, type GateContext } from '../brief/gate.js';
import { CompilerLock } from '../compiler-lock.js';
import { type FragmentSelection, fragmentOf } from '../config-fragment.js';
import { McpDiagnosticSchema, toMcpDiagnostics } from '../diagnostics.js';
import { type ToolError, ToolFailure, ToolNotFound, toToolError } from '../errors.js';
import { loadKnowledge } from '../knowledge/load.js';
import { ORIGIN_RULES, type OriginRule } from '../origin-rules.js';
import { type EffectAi, projectRoot, resolveInputPath } from '../paths.js';

/** What every tool handler receives from the server (plan C9). */
export interface ToolContext {
  readonly ai: EffectAi;
  readonly cwd: string;
  readonly docsRoot: URL | string;
  readonly versions: { readonly compiler: string; readonly eligius: string };
  readonly requestId: string;
  /** Spec 059 Phase 2 (FR-010, FR-014): the brief gate's record, key and telemetry note. */
  readonly gate: GateContext;
}

export const NAME = 'eligian_compile' as const;

export const DESCRIPTION =
  'Compile an Eligian (.eligian) program and inspect the Eligius JSON config it produces, with ' +
  'the Eligian map back to the source. `view`: `summary` (default without `select`: timelines ' +
  'with their source names, durations and action counts, the named / event action names, the ' +
  'operation counts, the controllers, the JSON size), `fragment` (default with `select`: one ' +
  'timeline by name, one named or event action by name, or the innermost action around a source ' +
  '`line`; no ids, each action with its `source` file / line / column) or `full` (the whole ' +
  'config, ids kept). `includeMap: true` adds the Eligian map entries of the returned actions ' +
  '(each operation with its source location). A program with errors returns `ok: false` and the ' +
  'same error diagnostics as `eligian_check`; a library file returns `ok: false, library: true`. ' +
  "`response_format: 'detailed'` adds the config's `cssFiles` and `languages` to the summary. " +
  '`explain: true` adds, per returned operation, its JSON `path` and `origin` (the construct that ' +
  'generated it: source, call, target, erased-save, …) and, once per origin, the rule with the ' +
  '`eligian_docs` id to read; with `summary` only the operation counts per origin.';

export const KEYWORDS: readonly string[] = ['compile', 'json', 'config', 'eligius', 'map'];

export const Parameters = Schema.Struct({
  path: Schema.String,
  select: Schema.optionalKey(
    Schema.Struct({
      timeline: Schema.optionalKey(Schema.String),
      action: Schema.optionalKey(Schema.String),
      line: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
    })
  ),
  view: Schema.optionalKey(Schema.Literals(['summary', 'fragment', 'full'])),
  includeMap: Schema.optionalKey(Schema.Boolean),
  explain: Schema.optionalKey(Schema.Boolean),
  response_format: Schema.optionalKey(Schema.Literals(['concise', 'detailed'])),
});
type CompileParameters = typeof Parameters.Type;

const TimelineSummary = Schema.Struct({
  name: Schema.String,
  uri: Schema.String,
  type: Schema.String,
  duration: Schema.Finite,
  loop: Schema.optionalKey(Schema.Boolean),
  timelineActions: Schema.Int,
});

const Summary = Schema.Struct({
  timelines: Schema.Array(TimelineSummary),
  actions: Schema.Array(Schema.String),
  eventActions: Schema.Array(Schema.String),
  initActions: Schema.Int,
  operations: Schema.Record(Schema.String, Schema.Int),
  controllers: Schema.Array(Schema.String),
  chars: Schema.Int,
});

const ExplainedOperation = Schema.Struct({
  /** locateConfigPath notation: timelines[0].timelineActions[2].startOperations[1] */
  path: Schema.String,
  action: Schema.String,
  systemName: Schema.String,
  origin: Schema.String,
  location: Schema.optionalKey(Schema.Unknown),
});

const Explain = Schema.Struct({
  operations: Schema.optionalKey(Schema.Array(ExplainedOperation)),
  counts: Schema.optionalKey(Schema.Record(Schema.String, Schema.Int)),
  rules: Schema.Record(Schema.String, Schema.Struct({ rule: Schema.String, docs: Schema.String })),
});

const Language = Schema.Struct({ languageCode: Schema.String, label: Schema.String });

export const Success = Schema.Struct({
  header: Schema.String,
  ok: Schema.Boolean,
  library: Schema.optionalKey(Schema.Boolean),
  view: Schema.optionalKey(Schema.Literals(['summary', 'fragment', 'full'])),
  summary: Schema.optionalKey(Summary),
  /** Detailed summary only: the config's `cssFiles` */
  cssFiles: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Detailed summary only: the config's `availableLanguages`, without ids */
  languages: Schema.optionalKey(Schema.Array(Language)),
  fragment: Schema.optionalKey(Schema.Unknown),
  config: Schema.optionalKey(Schema.Unknown),
  map: Schema.optionalKey(Schema.Unknown),
  diagnostics: Schema.optionalKey(Schema.Array(McpDiagnosticSchema)),
  explain: Schema.optionalKey(Explain),
});
type CompileSuccess = typeof Success.Type;

type View = NonNullable<CompileParameters['view']>;

/**
 * The compiled config and map as plain JSON: the compiler leaves `undefined` properties
 * (`duration.end`, `eventTopic`, …) which the MCP result schema rejects on the wire (a JSON-RPC
 * -32603 after a successful handler; found by the Phase 2 T032 probe).
 */
const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** FR-010: `fragment` when something is selected, else `summary`. */
const viewOf = (params: CompileParameters): View =>
  params.view ?? (params.select === undefined ? 'summary' : 'fragment');

export const summarizeArgs = (params: CompileParameters): Readonly<Record<string, unknown>> => ({
  view: viewOf(params),
  ...(params.select === undefined ? {} : { select: Object.keys(params.select) }),
  ...(params.includeMap === undefined ? {} : { includeMap: params.includeMap }),
  ...(params.response_format === undefined ? {} : { response_format: params.response_format }),
  ...(params.explain === undefined ? {} : { explain: params.explain }),
});

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
  })
    .annotate(ai.Tool.Readonly, true)
    .annotate(ai.Tool.Meta, { 'anthropic/maxResultSizeChars': 200000 });

const header = (context: ToolContext, resolvedPath: string): string =>
  `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${resolvedPath}`;

// --- summary -----------------------------------------------------------------

type Config = IEngineConfiguration;
type Operation = Config['actions'][number]['startOperations'][number];

/** Every operation list of the config: init, named, event and timeline actions, start and end. */
const operationLists = (config: Config): (readonly Operation[])[] => {
  const actions: { startOperations: readonly Operation[]; endOperations?: readonly Operation[] }[] =
    [
      ...(config.initActions ?? []),
      ...config.actions,
      ...(config.eventActions ?? []),
      ...config.timelines.flatMap(timeline => timeline.timelineActions),
    ];
  return actions.flatMap(action => [action.startOperations, action.endOperations ?? []]);
};

/** FR-012: the controllers, as the `systemName` of every getControllerInstance (P11), once each. */
const controllersOf = (operations: readonly Operation[]): string[] => [
  ...new Set(
    operations.flatMap(op => {
      const name = (op.operationData as { systemName?: unknown } | undefined)?.systemName;
      return op.systemName === 'getControllerInstance' && typeof name === 'string' ? [name] : [];
    })
  ),
];

const summaryOf = (compiled: CompileResult): typeof Summary.Type => {
  const { config } = compiled;
  const names = timelineNames(compiled.program);
  const operations = operationLists(config).flat();
  const counts: Record<string, number> = {};
  for (const op of operations) counts[op.systemName] = (counts[op.systemName] ?? 0) + 1;
  return {
    // By config index, never by uri: a media timeline's uri is its `from` path
    timelines: config.timelines.map((timeline, index) => ({
      name: names[index] ?? timeline.uri,
      uri: timeline.uri,
      type: timeline.type,
      duration: timeline.duration,
      ...(timeline.loop === undefined ? {} : { loop: timeline.loop }),
      timelineActions: timeline.timelineActions.length,
    })),
    actions: config.actions.map(action => action.name),
    eventActions: (config.eventActions ?? []).map(action => action.name),
    initActions: (config.initActions ?? []).length,
    operations: counts,
    controllers: controllersOf(operations),
    chars: compiled.json.length,
  };
};

// --- fragment ----------------------------------------------------------------

/** Map locations come from document URIs (a lower-case drive on Windows; relative ignores case there). */
const samePath = (a: string, b: string): boolean => path.relative(a, b) === '';

/** A map action of `file` with its 1-based line range. */
interface LineRange {
  readonly id: string;
  readonly action: EligianMapAction;
  readonly line: number;
  readonly endLine: number;
  readonly length: number;
}

/**
 * The map actions located in `file`, with their end lines: map locations span the whole node,
 * so the end is the line of `offset + length` over the source text.
 */
const lineRanges = (map: EligianMap, file: string, source: string): LineRange[] => {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  const lineAt = (offset: number): number => {
    let line = 1;
    while (line < lineStarts.length && lineStarts[line]! <= offset) line++;
    return line;
  };
  return Object.entries(map.actions).flatMap(([id, action]): LineRange[] => {
    const location = action.location;
    if (location === undefined) return [];
    if (location.file !== undefined && !samePath(location.file, file)) return [];
    const start = (lineStarts[location.line - 1] ?? source.length) + location.column - 1;
    const length = location.length ?? 0;
    return [
      {
        id,
        action,
        line: location.line,
        endLine: lineAt(start + Math.max(length - 1, 0)),
        length,
      },
    ];
  });
};

const describeRange = (range: LineRange): string =>
  `${range.action.name}${range.action.timelineUri === undefined ? '' : ` (timeline ${range.action.timelineUri})`}: lines ${range.line}-${range.endLine}`;

/** The selection of `select`: timeline, then action, then line. */
const selectionOf = (
  compiled: CompileResult,
  select: NonNullable<CompileParameters['select']>,
  file: string,
  source: string
): Effect.Effect<FragmentSelection, ToolNotFound> => {
  const { config } = compiled;
  if (select.timeline !== undefined) {
    const names = timelineNames(compiled.program);
    const index = names.indexOf(select.timeline);
    return index >= 0 && index < config.timelines.length
      ? Effect.succeed({ timeline: index })
      : Effect.fail(
          new ToolNotFound({
            message: `no timeline named "${select.timeline}"; the timelines: ${names.join(', ')}`,
            path: file,
          })
        );
  }
  if (select.action !== undefined) {
    const name = select.action;
    const known = [
      ...config.actions.map(action => action.name),
      ...(config.eventActions ?? []).map(action => action.name),
    ];
    return known.includes(name)
      ? Effect.succeed({ action: name })
      : Effect.fail(
          new ToolNotFound({
            message: `no action or event action named "${name}"; the actions: ${known.join(', ')}`,
            path: file,
          })
        );
  }
  const ranges = lineRanges(compiled.map, file, source);
  if (select.line !== undefined) {
    const line = select.line;
    const containing = ranges
      .filter(range => range.line <= line && line <= range.endLine)
      .sort((a, b) => a.length - b.length);
    const innermost = containing[0];
    if (innermost !== undefined) return Effect.succeed({ mapActionId: innermost.id });
    const distance = (range: LineRange) =>
      line < range.line ? range.line - line : line - range.endLine;
    const nearest = [...ranges].sort((a, b) => distance(a) - distance(b)).slice(0, 2);
    return Effect.fail(
      new ToolNotFound({
        message:
          `line ${line} is inside no action` +
          (nearest.length > 0 ? `; the nearest: ${nearest.map(describeRange).join('; ')}` : ''),
        path: file,
      })
    );
  }
  return Effect.fail(
    new ToolNotFound({
      message:
        'select a timeline, an action or a line; the timelines: ' +
        `${timelineNames(compiled.program).join(', ')}; the actions: ` +
        [...config.actions, ...(config.eventActions ?? [])].map(action => action.name).join(', '),
      path: file,
    })
  );
};

/** FR-015: the map entries of the actions `fragmentOf` returns for `selection`, keyed like it. */
const mapOf = (compiled: CompileResult, selection: FragmentSelection): unknown => {
  const { config, map } = compiled;
  const entry = (id: string) => map.actions[id];
  if ('timeline' in selection) {
    const timeline = config.timelines[selection.timeline]!;
    return { timelines: { [timeline.uri]: timeline.timelineActions.map(a => entry(a.id)) } };
  }
  if ('action' in selection) {
    const action = config.actions.find(candidate => candidate.name === selection.action);
    if (action) return { actions: { [action.name]: entry(action.id) } };
    const event = config.eventActions?.find(candidate => candidate.name === selection.action);
    return event ? { eventActions: { [event.name]: entry(event.id) } } : undefined;
  }
  const action = entry(selection.mapActionId);
  if (action === undefined) return undefined;
  const key = { init: 'initActions', action: 'actions', event: 'eventActions' } as const;
  return action.kind === 'timeline'
    ? { timelines: { [action.timelineUri ?? '']: [action] } }
    : { [key[action.kind]]: { [action.name]: action } };
};

// --- explain -----------------------------------------------------------------

type ExplainedOperationType = typeof ExplainedOperation.Type;

/** An explained operation with the id of the action it is in (for the selection filter). */
interface Located {
  readonly actionId: string;
  readonly operation: ExplainedOperationType;
}

/** The shape every action of the config shares (an event action has no end operations). */
interface AnyAction {
  readonly id: string;
  readonly name: string;
  readonly startOperations: readonly Operation[];
  readonly endOperations?: readonly Operation[];
}

/**
 * Every operation of the config in `operationLists` order, with its `locateConfigPath` path and
 * its origin from the map entry at the same phase and index. The map is built from the same
 * optimized IR, so the lists line up; a map read back from JSON may lack an origin (`source`).
 */
const explainedOperations = (compiled: CompileResult): Located[] => {
  const { config, map } = compiled;
  const groups: [string, readonly AnyAction[]][] = [
    ['initActions', config.initActions ?? []],
    ['actions', config.actions],
    ['eventActions', config.eventActions ?? []],
    ...config.timelines.map((timeline, t): [string, readonly AnyAction[]] => [
      `timelines[${t}].timelineActions`,
      timeline.timelineActions,
    ]),
  ];
  return groups.flatMap(([prefix, actions]) =>
    actions.flatMap((action, a) => {
      const entry = map.actions[action.id];
      const phase = (key: 'startOperations' | 'endOperations', ops: readonly Operation[]) =>
        ops.map((op, i): Located => {
          const mapped = (key === 'startOperations' ? entry?.start : entry?.end)?.[i];
          const origin: OperationOrigin = mapped?.origin ?? 'source';
          return {
            actionId: action.id,
            operation: {
              path: `${prefix}[${a}].${key}[${i}]`,
              action: action.name,
              systemName: op.systemName,
              origin,
              ...(mapped?.location === undefined ? {} : { location: mapped.location }),
            },
          };
        });
      return [
        ...phase('startOperations', action.startOperations),
        ...phase('endOperations', action.endOperations ?? []),
      ];
    })
  );
};

/** The action ids `fragmentOf` returns for `selection` (the ids `mapOf` reads). */
const selectedActionIds = (compiled: CompileResult, selection: FragmentSelection): Set<string> => {
  const { config } = compiled;
  if ('timeline' in selection) {
    return new Set(config.timelines[selection.timeline]?.timelineActions.map(a => a.id) ?? []);
  }
  if ('action' in selection) {
    const action =
      config.actions.find(candidate => candidate.name === selection.action) ??
      config.eventActions?.find(candidate => candidate.name === selection.action);
    return new Set(action === undefined ? [] : [action.id]);
  }
  return new Set([selection.mapActionId]);
};

/** Each present origin once, with its rule (FR-045). */
const rulesOf = (origins: Iterable<string>): Record<string, OriginRule> =>
  Object.fromEntries(
    [...new Set(origins)].map(origin => [origin, ORIGIN_RULES[origin as OperationOrigin]])
  );

/**
 * FR-045 / I-5: `summary` → the per-origin counts; `full` → every operation by path; `fragment`
 * → the operations of the selected actions. Pure.
 */
const explainOf = (
  compiled: CompileResult,
  view: View,
  selection?: FragmentSelection
): typeof Explain.Type => {
  const all = explainedOperations(compiled);
  if (view === 'summary') {
    const counts: Record<string, number> = {};
    for (const { operation } of all) counts[operation.origin] = (counts[operation.origin] ?? 0) + 1;
    return { counts, rules: rulesOf(Object.keys(counts)) };
  }
  const ids = view === 'fragment' && selection ? selectedActionIds(compiled, selection) : undefined;
  const operations = all
    .filter(located => ids === undefined || ids.has(located.actionId))
    .map(located => located.operation);
  return { operations, rules: rulesOf(operations.map(op => op.origin)) };
};

// --- handler -----------------------------------------------------------------

/** compileFile rejected: the program has errors (answered with check's diagnostics). */
interface CompileRejected {
  readonly _tag: 'CompileRejected';
}
const compileRejected: CompileRejected = { _tag: 'CompileRejected' };

type Outcome =
  | { readonly compiled: CompileResult }
  | { readonly results: Awaited<ReturnType<typeof checkPaths>> };

export const handle = (
  params: CompileParameters,
  context: ToolContext
): Effect.Effect<CompileSuccess, ToolError, CompilerLock> =>
  Effect.gen(function* () {
    const root = yield* projectRoot(context.ai, context.cwd);
    const file = yield* resolveInputPath(root, params.path);
    // FR-014: the gate first, before the read and the lock; a library passes it.
    yield* checkPrograms(root, [file], context.gate);
    const source = yield* Effect.tryPromise({
      try: () => fs.promises.readFile(file, 'utf8'),
      catch: toToolError('read', file),
    });
    const head = header(context, file);
    if (isLibrary(source)) return { header: head, ok: false, library: true };

    const lock = yield* CompilerLock;
    const outcome = yield* lock.run(
      context.requestId,
      Effect.tryPromise({
        try: () => compileFile(file, { optimize: true }),
        catch: (): CompileRejected => compileRejected,
      }).pipe(
        Effect.map((compiled): Outcome => ({ compiled })),
        // FR-016: eligian_check's defaults; lint and review on, or a program that validates
        // clean but does not compile would not get its compile-failed error
        Effect.catch(() =>
          Effect.tryPromise({
            try: () => checkPaths([file], { selectorNotInLayout: 'ids', lint: true, review: true }),
            catch: toToolError('read', file),
          }).pipe(Effect.map((results): Outcome => ({ results })))
        )
      )
    );

    if ('results' in outcome) {
      const knowledge = yield* loadKnowledge(context.docsRoot);
      const diagnostics = toMcpDiagnostics(outcome.results, knowledge.overlays, f =>
        fs.readFileSync(f, 'utf8')
      ).filter(d => d.severity === 'error');
      return { header: head, ok: false, diagnostics };
    }

    const { compiled } = outcome;
    const view = viewOf(params);
    if (view === 'full') {
      return {
        header: head,
        ok: true,
        view,
        config: asJson(compiled.config),
        ...(params.includeMap === true ? { map: asJson(compiled.map.actions) } : {}),
        ...(params.explain === true ? { explain: asJson(explainOf(compiled, view)) } : {}),
      };
    }
    if (view === 'summary') {
      const { config } = compiled;
      return {
        header: head,
        ok: true,
        view,
        summary: summaryOf(compiled),
        ...(params.response_format === 'detailed'
          ? {
              cssFiles: [...(config.cssFiles ?? [])],
              languages: (config.availableLanguages ?? []).map(language => ({
                languageCode: language.languageCode,
                label: language.label,
              })),
            }
          : {}),
        ...(params.explain === true ? { explain: asJson(explainOf(compiled, view)) } : {}),
      };
    }
    const selection = yield* selectionOf(compiled, params.select ?? {}, file, source);
    const fragment = fragmentOf(compiled.config, selection, compiled.map);
    if (fragment === undefined) {
      return yield* new ToolNotFound({ message: 'the selection matched nothing', path: file });
    }
    return {
      header: head,
      ok: true,
      view,
      fragment: asJson(fragment),
      ...(params.includeMap === true ? { map: asJson(mapOf(compiled, selection)) } : {}),
      ...(params.explain === true ? { explain: asJson(explainOf(compiled, view, selection)) } : {}),
    };
  });
