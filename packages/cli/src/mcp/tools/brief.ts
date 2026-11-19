/**
 * Spec 059 Phase 1 (FR-024 to FR-031, FR-042; plan §5, P1, P2, P5, P8, P16, P19): `eligian_brief`,
 * the brief interview. The I/O shell around the pure brief modules: it reads
 * `<directory>/BRIEF.md` (absent is an empty brief), parses it (a parser throw is a defect that
 * the tool boundary answers as `internal`, before any write), applies the action, evaluates the
 * result, writes the file when something changed (temp file and rename) and returns the reply
 * with the next round. Every call re-reads the file and recomputes the facts (`makeFacts`, the
 * probes): nothing about a brief is kept in server memory.
 *
 * It touches neither the Langium services nor the compiler lock (FR-032), so the server wraps
 * it in `boundary`, not `call` (P5). Calls on one `BRIEF.md` run one at a time under a per-brief
 * semaphore (FR-033); the acquired section is uninterruptible, so a cancelled call finishes its
 * write before the next call on that brief reads the file (P18). Before the rename the file is
 * re-read: a change since this call read it fails the call and keeps the change (FR-034).
 * No `console`, no stdout (FR-035).
 *
 * `effect/ai`'s `Tool` is `@stability unstable` (roadmap §2, decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import {
  findPackageManager,
  type PackageManager,
  readPackageManifest,
} from '@eligian/shared-utils';
import { Effect, Schema, Semaphore } from 'effect';
import { writeFileAtomic } from '../../atomic-write.js';
import {
  BRIEF_FILE,
  EMPTY_PARSED,
  type FactsSnapshot,
  parseBrief,
  writeBrief,
} from '../brief/brief-file.js';
import {
  applyAnswers,
  type BriefState,
  type BriefStateName,
  confirm,
  type Evaluation,
  evaluate,
  type Facts,
  nextRound,
  pickRound,
  type Rejection,
  recordedTreeVersion,
  textDirection,
} from '../brief/engine.js';
import { TREE, TREE_VERSION } from '../brief/tree.js';
import { type ToolError, ToolFailure, ToolIoError, toToolError } from '../errors.js';
import { type EffectAi, isInside, projectRoot, resolveInputPath } from '../paths.js';
import type { ToolContext } from './check.js';

export const NAME = 'eligian_brief' as const;

export const DESCRIPTION =
  'Start here for a new Eligian presentation, before writing any file: the brief interview. action status with the user\'s idea verbatim (idea) returns the next round, at most 7 questions (max 1–20). Ask them in one message, each with your recommended answer worded so that yes accepts it, then record the replies with action answer: answers [{ id, value, delegated? }], value in the canonical JSON form of the item\'s shape; delegated: true when the user said "you decide" (value = your choice). Look facts up yourself (eligian_project, the files); ask only decisions. When state is complete, show the user the delegated answers and BRIEF.md, then call action confirm with their reply verbatim as confirmation. Only this tool writes <directory>/BRIEF.md: never edit it yourself. directory defaults to the project root.';

export const Parameters = Schema.Struct({
  directory: Schema.optionalKey(Schema.String),
  action: Schema.Literals(['status', 'answer', 'confirm']),
  idea: Schema.optionalKey(Schema.String),
  answers: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        value: Schema.Unknown,
        delegated: Schema.optionalKey(Schema.Boolean),
      })
    )
  ),
  // P2: a max outside 1–20 is a parameter decode failure, JSON-RPC -32602; the handler never runs.
  max: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
  confirmation: Schema.optionalKey(Schema.String),
});
export type BriefParameters = typeof Parameters.Type;

const CELL_KINDS = ['text', 'choice', 'yes-no', 'duration', 'view', 'path', 'language'] as const;
const SHAPE_KINDS = [
  'text',
  'choice',
  'set',
  'yes-no',
  'duration',
  'view',
  'path',
  'record',
  'table',
] as const;

/** `tree.ts`'s `Column`. */
const ColumnSchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(CELL_KINDS),
  options: Schema.optionalKey(Schema.Array(Schema.String)),
  dash: Schema.optionalKey(Schema.Literal(true)),
  none: Schema.optionalKey(Schema.Literal(true)),
});

/** `tree.ts`'s `Shape`. */
const ShapeSchema = Schema.Struct({
  kind: Schema.Literals(SHAPE_KINDS),
  options: Schema.optionalKey(Schema.Array(Schema.String)),
  columns: Schema.optionalKey(Schema.Array(ColumnSchema)),
  none: Schema.optionalKey(Schema.Literal(true)),
  alternatives: Schema.optionalKey(Schema.Array(Schema.String)),
  rows: Schema.optionalKey(Schema.Literal('one-per-view')),
});

/** `engine.ts`'s `RoundItem`. */
const RoundItemSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  ask: Schema.String,
  shape: ShapeSchema,
  docs: Schema.Array(Schema.String),
  facts: Schema.Array(Schema.String),
  previous: Schema.optionalKey(Schema.Unknown),
  reason: Schema.optionalKey(Schema.String),
});

const REJECTION_REASONS = [
  'unknown-question',
  'duplicate',
  'waiting',
  'not-applicable',
  'invalid-value',
  'invalid-reference',
] as const satisfies readonly Rejection['reason'][];

export const Success = Schema.Struct({
  header: Schema.String,
  file: Schema.String,
  state: Schema.Literals(['open', 'complete', 'confirmed']),
  round: Schema.Array(RoundItemSchema),
  counts: Schema.Struct({
    answered: Schema.Int,
    delegated: Schema.Int,
    open: Schema.Int,
    waiting: Schema.Int,
    notApplicable: Schema.Int,
  }),
  rejected: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      reason: Schema.Literals(REJECTION_REASONS),
      message: Schema.String,
    })
  ),
  ignored: Schema.Array(Schema.Struct({ line: Schema.Int, reason: Schema.String })),
  delegated: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, value: Schema.Unknown }))
  ),
  refused: Schema.optionalKey(
    Schema.Struct({ code: Schema.Literals(['frontier-not-empty', 'confirmation-missing']) })
  ),
  next: Schema.String,
});
export type BriefSuccess = typeof Success.Type;

/** The test seams of the tool (FR-034), modelled on `smoke?`; wired by the per-brief write. */
export interface BriefToolOptions {
  /** Called after the temp file is written, before the changed-file re-read. */
  readonly beforeRename?: (target: string) => Promise<void>;
}

/** FR-033: one semaphore with one permit per `BRIEF.md`, created once per server. */
export interface BriefLocks {
  readonly forFile: (file: string) => Semaphore.Semaphore;
}

/** The per-brief locks of one server: lazy, keyed by the resolved path (lower-cased on Windows). */
export const makeBriefLocks = (): BriefLocks => {
  const locks = new Map<string, Semaphore.Semaphore>();
  return {
    forFile: file => {
      const key = process.platform === 'win32' ? file.toLowerCase() : file;
      const known = locks.get(key);
      if (known !== undefined) return known;
      const lock = Semaphore.makeUnsafe(1);
      locks.set(key, lock);
      return lock;
    },
  };
};

/** What the brief handler receives: the tool context, the server's locks and its test seams. */
export type BriefToolContext = ToolContext & {
  readonly briefLocks: BriefLocks;
  readonly options?: BriefToolOptions;
};

export const summarizeArgs = (params: BriefParameters): Readonly<Record<string, unknown>> => ({
  action: params.action,
  answers: params.answers?.length ?? 0,
  max: params.max,
  idea: params.idea !== undefined,
});

export const summarizeResult = (
  value: Pick<BriefSuccess, 'state' | 'counts' | 'rejected'>
): Readonly<Record<string, unknown>> => ({
  state: value.state,
  counts: value.counts,
  rejected: value.rejected.length,
});

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
  })
    .annotate(ai.Tool.Meta, { 'anthropic/alwaysLoad': true })
    .annotate(ai.Tool.Destructive, false)
    .annotate(ai.Tool.Idempotent, true);

/** A memoized predicate: the first answer per key is kept for this call only (FR-012). */
const memoize = (test: (key: string) => boolean): ((key: string) => boolean) => {
  const seen = new Map<string, boolean>();
  return key => {
    const known = seen.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    try {
      result = test(key);
    } catch {
      result = false;
    }
    seen.set(key, result);
    return result;
  };
};

/**
 * The facts of one call (P16): `exists` and `inside` over the brief's directory, synchronous,
 * memoized for this call only; any error is `false`, so evaluation never throws.
 */
export const makeFacts = (root: string, briefDir: string): Facts => {
  const relative = path.relative(root, briefDir).split(path.sep).join('/');
  return {
    briefDir: relative === '' ? '.' : relative,
    exists: memoize(
      p => fs.statSync(path.resolve(briefDir, p), { throwIfNoEntry: false })?.isFile() === true
    ),
    inside: memoize(p => isInside(root, path.resolve(briefDir, p))),
  };
};

/**
 * FR-042: the installed `eligian` version (`<root>/node_modules/eligian/package.json`, a string
 * `version` only) and the package manager at the root. Never rejects; a failed probe is absent.
 */
export async function probeFacts(
  root: string
): Promise<{ eligianInstalled?: string; packageManager?: PackageManager }> {
  const [manifest, packageManager] = await Promise.all([
    readPackageManifest(path.join(root, 'node_modules', 'eligian')).catch(() => undefined),
    findPackageManager(root).catch(() => undefined),
  ]);
  const version = manifest?.version;
  return {
    ...(typeof version === 'string' ? { eligianInstalled: version } : {}),
    ...(packageManager === undefined ? {} : { packageManager }),
  };
}

const errnoCode = (cause: unknown): unknown =>
  typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : undefined;

/** The file's text, `undefined` when it does not exist; other errors reject. */
async function readOrUndefined(file: string): Promise<string | undefined> {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch (cause) {
    if (errnoCode(cause) === 'ENOENT') return undefined;
    throw cause;
  }
}

/** FR-026: ENOENT is an empty brief; any other failure (EISDIR included) is `ToolIoError`. */
const readBriefText = (file: string): Effect.Effect<string | undefined, ToolError> =>
  Effect.tryPromise({ try: () => readOrUndefined(file), catch: toToolError('write', file) });

const CHANGED_WHILE_WRITING = 'BRIEF.md changed while writing; call again';

/**
 * FR-026, FR-034: the directory is created on the first write; then temp file and rename. Before
 * the rename the seam runs and the file is re-read: a text other than `read` (what this call
 * parsed; `undefined` = absent) aborts the write and keeps the file as it is.
 */
const writeBriefFile = (
  file: string,
  out: string,
  read: string | undefined,
  seam: BriefToolOptions['beforeRename']
): Effect.Effect<void, ToolError> =>
  Effect.tryPromise({
    try: async () => {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      return writeFileAtomic(file, out, {
        beforeRename: async () => {
          await seam?.(file);
          return (await readOrUndefined(file)) === read;
        },
      });
    },
    catch: toToolError('write', file),
  }).pipe(
    Effect.flatMap(result =>
      result === 'aborted'
        ? Effect.fail(new ToolIoError({ message: CHANGED_WHILE_WRITING, path: file }))
        : Effect.void
    )
  );

/** P8: the first idea is stored, CRLF as LF; a stored idea is never replaced. */
const withIdea = (brief: BriefState, idea: string | undefined): BriefState =>
  brief.idea !== undefined || idea === undefined || idea.trim() === ''
    ? brief
    : { ...brief, idea: idea.replace(/\r\n?/g, '\n') };

type Refusal = 'frontier-not-empty' | 'confirmation-missing';

interface Outcome {
  readonly brief: BriefState;
  readonly rejected: readonly Rejection[];
  readonly refused?: Refusal;
}

/** Step 5 of plan §5: the action on the parsed brief, pure. */
function act(params: BriefParameters, brief: BriefState, facts: Facts, now: Date): Outcome {
  switch (params.action) {
    case 'status':
      return { brief: withIdea(brief, params.idea), rejected: [] };
    case 'answer': {
      const result = applyAnswers(TREE, brief, facts, params.answers ?? [], nextRound(brief));
      return { brief: withIdea(result.brief, params.idea), rejected: result.rejected };
    }
    case 'confirm': {
      const evaluation = evaluate(TREE, brief, facts);
      if (evaluation.state === 'open') {
        return { brief, rejected: [], refused: 'frontier-not-empty' };
      }
      const message = params.confirmation;
      if (message === undefined || message.trim() === '') {
        return { brief, rejected: [], refused: 'confirmation-missing' };
      }
      if (evaluation.state === 'confirmed') return { brief, rejected: [] };
      return { brief: confirm(brief, message, now, evaluation), rejected: [] };
    }
  }
}

/** The L1 codes with their text directions once L1 is answered (FR-019), else undefined. */
const directionsOf = (evaluation: Evaluation): FactsSnapshot['textDirection'] => {
  const l1 = evaluation.instances.find(i => i.id === 'L1');
  if (l1?.status !== 'answered' || !Array.isArray(l1.value)) return undefined;
  return l1.value.flatMap((row: unknown) => {
    const code = typeof row === 'object' && row !== null ? Reflect.get(row, 'code') : undefined;
    return typeof code === 'string' ? [{ code, direction: textDirection(code) }] : [];
  });
};

const IDEA_NEXT =
  'Ask the user for their idea in their own words, then call `eligian_brief` with `action: status` and the idea verbatim as `idea`.';

/** The FR-030 `next` instruction. */
const nextOf = (state: BriefStateName, questions: number, file: string): string => {
  switch (state) {
    case 'open':
      return `Ask the user these ${questions} questions in one message, each with your recommended answer worded so that yes accepts it; then call \`eligian_brief\` with \`action: answer\`.`;
    case 'complete':
      return `Show the user the counts, the delegated answers and ${file}, then call \`eligian_brief\` with \`action: confirm\` and their reply verbatim as \`confirmation\`.`;
    case 'confirmed':
      return 'Draft STORYBOARD.md from the brief (`eligian_docs` id `storyboard`).';
  }
};

export const handle = (
  params: BriefParameters,
  context: BriefToolContext
): Effect.Effect<BriefSuccess, ToolError> =>
  Effect.gen(function* () {
    // 1. Paths: outside the root fails before any I/O (FR-026).
    const root = yield* projectRoot(context.ai, context.cwd);
    const dir = yield* resolveInputPath(root, params.directory ?? '.');
    const file = path.join(dir, BRIEF_FILE);

    // 2. One call at a time per brief (FR-033). Waiting for the permit stays interruptible; once
    // acquired, the section runs to its end, so the permit is released only after the write
    // settled (P18, the compiler lock's pattern).
    return yield* context.briefLocks.forFile(file).withPermits(1)(
      Effect.uninterruptible(section(params, context, root.root, dir, file))
    );
  });

/** Steps 3–8 of plan §5, under the brief's permit. */
const section = (
  params: BriefParameters,
  context: BriefToolContext,
  root: string,
  dir: string,
  file: string
): Effect.Effect<BriefSuccess, ToolError> =>
  Effect.gen(function* () {
    // 3. Read and parse; a parser throw is a defect, answered `internal` before any write (P19).
    const text = yield* readBriefText(file);
    const parsed = text === undefined ? EMPTY_PARSED : yield* Effect.sync(() => parseBrief(text));

    // 4. Facts and probes, recomputed on every call (FR-012, FR-042).
    const facts = makeFacts(root, dir);
    const probes = yield* Effect.promise(() => probeFacts(root));

    // 5–6. The action, then the evaluation of the resulting brief.
    const outcome = act(params, parsed.brief, facts, new Date());
    const evaluation = evaluate(TREE, outcome.brief, facts);

    // 7. Write only when the brief changed (FR-028).
    const written = outcome.brief !== parsed.brief;
    if (written) {
      const snapshot: FactsSnapshot = {
        state: evaluation.state,
        serverEligian: context.versions.compiler,
        eligianInstalled: probes.eligianInstalled,
        packageManager: probes.packageManager,
        textDirection: directionsOf(evaluation),
        assets: evaluation.assets,
      };
      // FR-018: a brief not confirmed under its recorded version records the current one.
      const treeVersion = recordedTreeVersion(TREE, outcome.brief, facts, TREE_VERSION);
      yield* writeBriefFile(
        file,
        writeBrief(TREE, { ...parsed, brief: { ...outcome.brief, treeVersion } }, snapshot),
        text,
        context.options?.beforeRename
      );
    }

    // 8. The reply (FR-030).
    const round = pickRound(TREE, evaluation, params.max ?? 7);
    const noIdeaYet = text === undefined && !written && outcome.brief.idea === undefined;
    return {
      header: `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${file}`,
      file,
      state: evaluation.state,
      round,
      counts: evaluation.counts,
      rejected: outcome.rejected,
      ignored: parsed.ignored,
      ...(evaluation.state === 'open' ? {} : { delegated: evaluation.delegated }),
      ...(outcome.refused === undefined ? {} : { refused: { code: outcome.refused } }),
      next: noIdeaYet ? IDEA_NEXT : nextOf(evaluation.state, round.length, file),
    };
  });
