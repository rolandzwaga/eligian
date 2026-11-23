/**
 * Spec 059 Phase 1 (FR-024 to FR-031, FR-042; plan §5, P1, P2, P5, P8, P16, P19): `eligian_brief`,
 * the brief interview. The I/O shell around the pure brief modules: it reads
 * `<directory>/BRIEF.md` (absent is an empty brief), parses it (a parser throw is a defect that
 * the tool boundary answers as `internal`, before any write), applies the action, evaluates the
 * result, writes the file when something changed (temp file and rename) and returns the reply
 * with the next round. Every call re-reads the file and recomputes the facts (`makeFacts`, the
 * probes): nothing about a brief is kept in server memory.
 *
 * It touches neither the Langium services nor the compiler lock (FR-032); Phase 2 FR-044 wires it
 * through the server's `call`, so adoption can take the lock. Calls on one `BRIEF.md` run one at
 * a time under a per-brief semaphore (FR-033); the acquired section is uninterruptible, so a
 * cancelled call finishes its write before the next call on that brief reads the file (P18). Before the rename the file is
 * re-read: a change since this call read it fails the call and keeps the change (FR-034).
 * No `console`, no stdout (FR-035).
 *
 * `effect/ai`'s `Tool` is `@stability unstable` (roadmap §2, decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import type { Dirent } from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import {
  findPackageManager,
  type PackageManager,
  readPackageManifest,
} from '@eligian/shared-utils';
import { Cause, Effect, Exit, Option, Schema, Semaphore } from 'effect';
import { writeFileAtomic } from '../../atomic-write.js';
import { toGlobPath } from '../../check/files.js';
import {
  type CodeFacts,
  type Conflict,
  conflictsOf,
  factAnswers,
  readCodeFacts,
} from '../brief/adopt.js';
import {
  BRIEF_FILE,
  EMPTY_PARSED,
  type FactsSnapshot,
  parseBrief,
  writeBrief,
} from '../brief/brief-file.js';
import {
  type AdditionState,
  applyAnswers,
  approve,
  type BriefState,
  type BriefStateName,
  confirm,
  EMPTY_BRIEF,
  type Evaluation,
  evaluate,
  type Facts,
  nextRound,
  pickRound,
  type Rejection,
  type RoundItem,
  recordedTreeVersion,
  textDirection,
} from '../brief/engine.js';
import { makeFacts } from '../brief/facts.js';
import {
  type ApprovedSet,
  approvedAdditionSet,
  classifyKnownChange,
  evaluateAddition,
  type GateContext,
  governs,
  isMainBrief,
  scopeContextOf,
} from '../brief/gate.js';
import {
  entryFor,
  type ProgramRecord,
  type ProgramScan,
  type RecordEntry,
  scanProgram,
} from '../brief/known-programs.js';
import { LANGUAGE_CODE } from '../brief/references.js';
import {
  type AdditionScope,
  additionHeading,
  type ScopeContext,
  scopedTree,
} from '../brief/scoped.js';
import {
  ensureKey,
  makeSigner,
  makeTicket,
  readKey,
  type Signer,
  sha256Hex,
  type TicketParts,
  ticketValid,
} from '../brief/signature.js';
import {
  checkAdditionStoryboard,
  checkStoryboard,
  type StoryboardProblem,
  type StoryboardProblemCode,
} from '../brief/storyboard-check.js';
import { type AnswerValue, type Question, TREE, TREE_VERSION } from '../brief/tree.js';
import { RoundItemSchema } from '../brief/wire.js';
import type { CompilerLock } from '../compiler-lock.js';
import { type ToolError, ToolFailure, ToolIoError, toToolError } from '../errors.js';
import {
  type EffectAi,
  type ProjectRoot,
  projectRoot,
  resolveInputPath,
  resolveInputPatterns,
} from '../paths.js';
import { readStoryboard, type Storyboard } from '../storyboard.js';
import type { ToolContext } from './check.js';

export { makeFacts } from '../brief/facts.js';

export const NAME = 'eligian_brief' as const;

/** Phase 2 FR-052: the five actions, `scope` and the gate, within the 1,000-character budget. */
export const DESCRIPTION =
  'Start here for a new Eligian presentation, before writing any file: the brief interview. Actions: status (the user\'s idea verbatim as idea) returns the next round, at most 7 questions (max 1–20). Ask them in one message, each with your recommended answer worded so that yes accepts it; record the replies with answer: answers [{ id, value, delegated? }], value as canonical JSON of the item\'s shape, delegated: true when the user said "you decide". Look facts up yourself; ask only decisions. When state is complete, confirm: the user signs off in a dialog, else pass their reply verbatim as confirmation (and any ticket). Then draft STORYBOARD.md and call approve-storyboard. accept-existing (paths) takes in programs the user wrote. scope: presentation (default), { addition, name } for a new view, language or host-module, or adopt (existing code). eligian_check, fmt, compile, smoke and init refuse until the brief is approved. Only this tool writes <directory>/BRIEF.md: never edit it yourself.';

/** An addition scope (Phase 2 FR-037): `name` is the view name or the language code. */
const AdditionScopeSchema = Schema.Struct({
  addition: Schema.Literals(['view', 'language', 'host-module']),
  name: Schema.String,
});

/** The section a call acts on (FR-037): the presentation (default), an addition, or adoption. */
const ScopeSchema = Schema.Union([Schema.Literals(['presentation', 'adopt']), AdditionScopeSchema]);

export const Parameters = Schema.Struct({
  directory: Schema.optionalKey(Schema.String),
  action: Schema.Literals(['status', 'answer', 'confirm', 'approve-storyboard', 'accept-existing']),
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
  // Phase 2 FR-050: the section acted on (FR-037), the programs of `accept-existing` (FR-009)
  // and the sign-off ticket of an earlier call (FR-020).
  scope: Schema.optionalKey(ScopeSchema),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
  ticket: Schema.optionalKey(Schema.String),
});
export type BriefParameters = typeof Parameters.Type;

const REJECTION_REASONS = [
  'unknown-question',
  'duplicate',
  'waiting',
  'not-applicable',
  'invalid-value',
  'invalid-reference',
  'fact',
] as const satisfies readonly Rejection['reason'][];

/** Phase 1 FR-029's two refusals and Phase 2 FR-051's eleven. */
const REFUSAL_CODES = [
  'frontier-not-empty',
  'confirmation-missing',
  'declined',
  'elicitation-unavailable',
  'brief-not-confirmed',
  'brief-not-approved',
  'storyboard-missing',
  'storyboard-mismatch',
  'governed-by-brief',
  'addition-not-briefed',
  'not-an-addition',
  'adopt-program',
  'adopt-briefed',
] as const;
type RefusalCode = (typeof REFUSAL_CODES)[number];

/** `storyboard-check.ts`'s problem codes (FR-029), in its order. */
const STORYBOARD_PROBLEMS = [
  'storyboard-ignored-rows',
  'storyboard-views',
  'storyboard-header',
  'storyboard-end-block',
  'storyboard-interactions',
] as const satisfies readonly StoryboardProblemCode[];

/** An answer as the reply lists it (`delegated`, `changed`). */
const ListedAnswerSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  value: Schema.Unknown,
});

export const Success = Schema.Struct({
  header: Schema.String,
  file: Schema.String,
  state: Schema.Literals(['open', 'complete', 'confirmed', 'approved']),
  round: Schema.Array(RoundItemSchema),
  counts: Schema.Struct({
    answered: Schema.Int,
    delegated: Schema.Int,
    open: Schema.Int,
    waiting: Schema.Int,
    notApplicable: Schema.Int,
    // Phase 2 FR-045: the answers settled by the code, always present (0 without facts).
    fromCode: Schema.Int,
  }),
  rejected: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      reason: Schema.Literals(REJECTION_REASONS),
      message: Schema.String,
    })
  ),
  ignored: Schema.Array(Schema.Struct({ line: Schema.Int, reason: Schema.String })),
  delegated: Schema.optionalKey(Schema.Array(ListedAnswerSchema)),
  refused: Schema.optionalKey(
    Schema.Struct({
      code: Schema.Literals(REFUSAL_CODES),
      // `elicitation-unavailable` (FR-020)
      outcome: Schema.optionalKey(Schema.Literals(['cancelled', 'no-answer'])),
      // `storyboard-mismatch` (FR-028, FR-029)
      problems: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({ code: Schema.Literals(STORYBOARD_PROBLEMS), message: Schema.String })
        )
      ),
      // `addition-not-briefed` from `accept-existing` (FR-009): the first trigger's interview
      scope: Schema.optionalKey(AdditionScopeSchema),
      round: Schema.optionalKey(Schema.Array(RoundItemSchema)),
    })
  ),
  // Phase 2 FR-051: the mode of the call that signs.
  signoff: Schema.optionalKey(
    Schema.Struct({
      mode: Schema.Literals(['elicitation', 'agent-reported', 'existing-storyboard']),
    })
  ),
  // With `elicitation-unavailable` (FR-020): the dialog's message and the ticket for the retry.
  summary: Schema.optionalKey(Schema.String),
  ticket: Schema.optionalKey(Schema.String),
  // The answers changed since an invalid confirmation (FR-026).
  changed: Schema.optionalKey(Schema.Array(ListedAnswerSchema)),
  // Facts and answers that disagree (FR-046).
  conflicts: Schema.optionalKey(
    Schema.Array(Schema.Struct({ ids: Schema.Array(Schema.String), message: Schema.String }))
  ),
  // `accept-existing` (FR-009): the programs written, and the libraries and unchanged programs.
  accepted: Schema.optionalKey(Schema.Array(Schema.String)),
  skipped: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({ path: Schema.String, reason: Schema.Literals(['library', 'unchanged']) })
    )
  ),
  // The section acted on (FR-037).
  scope: Schema.optionalKey(ScopeSchema),
  next: Schema.String,
});
export type BriefSuccess = typeof Success.Type;

/**
 * The test seams of the tool (FR-034), modelled on `smoke?`; wired by the per-brief write. Phase 2
 * (FR-059) adds the server's record seams and the elicitation limit; `ServerOptions.brief` is this.
 */
export interface BriefToolOptions {
  /** Called after the temp file is written, before the changed-file re-read. */
  readonly beforeRename?: (target: string) => Promise<void>;
  /** The state directory of the signing key (Phase 2 FR-023); default `stateDirectory()`. */
  readonly stateDir?: string;
  /** How long a sign-off dialog waits for the user (Phase 2 FR-021). */
  readonly elicitationTimeoutMs?: number;
  /** Awaited at the start of every first-run scan of the server's record store (Phase 2 FR-003). */
  readonly beforeScan?: () => Promise<void>;
  /** Awaited before each record update's re-read, before the rename (Phase 2 FR-007). */
  readonly recordBeforeRename?: (target: string) => Promise<void>;
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

/**
 * What the brief handler receives: the tool context, the server's locks, its record store and
 * state directory with this call's telemetry note (Phase 2 `GateContext`), and its test seams.
 */
export type BriefToolContext = ToolContext & {
  readonly briefLocks: BriefLocks;
  readonly gate: GateContext;
  readonly options?: BriefToolOptions;
};

/** Phase 2 FR-057: the scope's kind only, never the view name or the language code. */
const scopeSummary = (scope: BriefParameters['scope']): string =>
  scope === undefined || scope === 'presentation'
    ? 'presentation'
    : scope === 'adopt'
      ? 'adopt'
      : `addition:${scope.addition}`;

/** FR-031, Phase 2 FR-057: counts and kinds; never a name, code, path, value, idea or message. */
export const summarizeArgs = (params: BriefParameters): Readonly<Record<string, unknown>> => ({
  action: params.action,
  answers: params.answers?.length ?? 0,
  max: params.max,
  idea: params.idea !== undefined,
  scope: scopeSummary(params.scope),
  paths: params.paths?.length ?? 0,
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

/**
 * FR-026: ENOENT is an empty brief (and, Phase 2 FR-028, a missing `STORYBOARD.md`); any other
 * failure (EISDIR included) is `ToolIoError`.
 */
const readFileText = (file: string): Effect.Effect<string | undefined, ToolError> =>
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

interface Outcome {
  readonly brief: BriefState;
  readonly rejected: readonly Rejection[];
  readonly refused?: RefusalCode;
  /** With `storyboard-mismatch` (FR-028, FR-029). */
  readonly problems?: readonly StoryboardProblem[];
}

/**
 * A `confirm` or `approve-storyboard` that signs: the evaluation it signs, the mode and the
 * user's reply (FR-020, FR-027, FR-028).
 */
interface Signing {
  readonly sign: {
    readonly evaluation: Evaluation;
    readonly mode: 'elicitation' | 'agent-reported';
    readonly message: string | undefined;
  };
}

/**
 * A sign-off that asks the user (FR-018, FR-019): the dialog's message, its one boolean field,
 * what its fallback ticket binds (FR-020) and the bytes it summarises (`STORYBOARD.md`'s too for
 * `approve-storyboard`, FR-022).
 */
interface Asking {
  readonly ask: {
    readonly summary: string;
    readonly field: 'confirmed' | 'approved';
    readonly parts: TicketParts;
    readonly text: string;
    readonly storyboard?: string;
  };
}

/**
 * How a call's section runs: `plain` (Phase 1's flow, and a client without elicitation), `dialog`
 * (the pre-check before a dialog, FR-022) or `sign` (after an accepted dialog: the brief, and the
 * storyboard of an approval, must still be the bytes the dialog summarised).
 */
type SectionMode =
  | { readonly kind: 'plain' }
  | { readonly kind: 'dialog' }
  | { readonly kind: 'sign'; readonly expected: string; readonly storyboard?: string };

/** A section's reply; with `ask`, nothing was written and the call goes on to the dialog. */
interface SectionResult {
  readonly reply: BriefSuccess;
  readonly ask?: Asking['ask'];
}

const PLAIN: SectionMode = { kind: 'plain' };

/**
 * The section a call acts on (Phase 2 FR-037, FR-038): the main brief, or one addition with its
 * scoped tree (P11), its heading as the HMAC section and FR-039's storyboard checks.
 */
interface Target {
  readonly tree: readonly Question[];
  /** `brief`, or the addition's heading (`Addition: view Outro`). */
  readonly section: string;
  /** FR-029 for the brief, FR-039 for an addition. */
  readonly check: (storyboard: Storyboard, evaluation: Evaluation) => readonly StoryboardProblem[];
  /** The addition acted on; absent for the main brief. */
  readonly scope?: AdditionScope;
}

const MAIN: Target = { tree: TREE, section: 'brief', check: checkStoryboard };

/** FR-020 step 2: what a `confirm` ticket binds: the section and the `BRIEF.md` bytes. */
const confirmTicket = (text: string, section: string): TicketParts => [
  'eligian-signoff-ticket/1',
  'confirm',
  section,
  sha256Hex(text),
  null,
  null,
  null,
];

/** An answer's value as the dialog shows it: text verbatim, anything else as JSON. */
const shown = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/**
 * FR-019: the `confirm` dialog's message: the counts, the delegated answers with the agent's
 * choices, the conflicts and the absolute path. A re-confirmation after `brief-changed` (FR-026)
 * lists only the answers changed since the last confirmation, in place of the counts and the
 * delegated answers.
 */
function confirmSummary(evaluation: Evaluation, file: string, target: Target): string {
  const { counts } = evaluation;
  const lines = [
    target.scope === undefined
      ? 'This brief is complete and correct.'
      : `This addition (${target.section}) is complete and correct.`,
  ];
  if (evaluation.changed.length > 0) {
    lines.push('', 'Changed since the last confirmation:');
    for (const answer of evaluation.changed) {
      lines.push(`- ${answer.id} (${answer.title}): ${shown(answer.value)}`);
    }
  } else {
    lines.push(
      '',
      `${counts.answered} answers (${counts.delegated} delegated to the agent, ${counts.fromCode ?? 0} from the code), ${counts.notApplicable} not applicable.`
    );
  }
  if (evaluation.changed.length === 0 && evaluation.delegated.length > 0) {
    lines.push('', "Delegated answers (the agent's choices):");
    for (const answer of evaluation.delegated) {
      lines.push(`- ${answer.id} (${answer.title}): ${shown(answer.value)}`);
    }
  }
  // Phase 2 FR-046: the conflicts between the code and the answers; they do not block.
  // A re-confirmation shows only the changed answers (FR-019 as ruled), so no conflicts either.
  const conflicts =
    target.scope === undefined && evaluation.changed.length === 0 ? conflictsOf(evaluation) : [];
  if (conflicts.length > 0) {
    lines.push('', 'Where the code and the answers disagree (confirming keeps both as they are):');
    for (const conflict of conflicts) lines.push(`- ${conflict.message}`);
  }
  lines.push('', `The brief: ${file}`);
  return lines.join('\n');
}

/**
 * The `confirm` of a client that announced elicitation (FR-018 to FR-020, FR-027), pure.
 * `dialog`: a valid ticket with a non-blank `confirmation` signs `agent-reported`; otherwise the
 * user is asked (a same-call `confirmation` is ignored). `sign`: the dialog was accepted.
 */
function confirmByDialog(
  params: BriefParameters,
  brief: BriefState,
  facts: Facts,
  context: { readonly mode: 'dialog' | 'sign'; readonly key: Buffer | undefined },
  text: string,
  file: string,
  target: Target
): Outcome | Signing | Asking {
  const evaluation = evaluate(target.tree, brief, facts);
  if (evaluation.state === 'open') return { brief, rejected: [], refused: 'frontier-not-empty' };
  // A valid confirmation is a no-op (FR-027).
  if (evaluation.confirmationStatus === 'valid') return { brief, rejected: [] };
  if (context.mode === 'sign')
    return { sign: { evaluation, mode: 'elicitation', message: undefined } };
  const message = params.confirmation;
  const parts = confirmTicket(text, target.section);
  if (
    message !== undefined &&
    message.trim() !== '' &&
    params.ticket !== undefined &&
    ticketValid(context.key, params.ticket, parts)
  ) {
    return { sign: { evaluation, mode: 'agent-reported', message } };
  }
  return {
    ask: {
      summary: confirmSummary(evaluation, file, target),
      field: 'confirmed',
      parts,
      text,
    },
  };
}

const STORYBOARD_FILE = 'STORYBOARD.md';

/** FR-020 step 2: what an `approve-storyboard` ticket binds: the section and both files' bytes. */
const approveTicket = (text: string, storyboard: string, section: string): TicketParts => [
  'eligian-signoff-ticket/1',
  'approve-storyboard',
  section,
  sha256Hex(text),
  sha256Hex(storyboard),
  null,
  null,
];

const counted = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** FR-019: the `approve-storyboard` dialog's message: the counts and the absolute path. */
const approveSummary = (storyboard: Storyboard, file: string, target: Target): string =>
  [
    target.scope === undefined
      ? 'Approve this storyboard: generation starts from it.'
      : `Approve the storyboard section of this addition (${target.section}): generation of it starts from it.`,
    '',
    `${counted(storyboard.views.length, 'view')}, ${counted(storyboard.beats.length, 'beat')}, ${counted(storyboard.interactions, 'interaction')}.`,
    '',
    `The storyboard: ${file}`,
  ].join('\n');

/** `STORYBOARD.md` beside the brief (FR-028, reading R-5): its path and text (absent: undefined). */
interface StoryboardRead {
  readonly file: string;
  readonly text: string | undefined;
}

/**
 * FR-028, FR-029, P19: `approve-storyboard`, pure, in every section mode. An approved brief is a
 * no-op (the caller re-tries the record write); before a valid confirmation it is refused
 * `brief-not-confirmed`; then `storyboard-missing` and `storyboard-mismatch` (the FR-029 checks).
 * The sign-off itself follows `confirm` (FR-018 to FR-022): `plain` signs `agent-reported` with a
 * non-blank `confirmation` (else `confirmation-missing`), `dialog` signs with a valid ticket or
 * asks, `sign` signs `elicitation`.
 */
function approveStoryboard(
  params: BriefParameters,
  brief: BriefState,
  facts: Facts,
  context: { readonly mode: SectionMode['kind']; readonly key: Buffer | undefined },
  text: string,
  storyboard: StoryboardRead,
  target: Target
): Outcome | Signing | Asking {
  const evaluation = evaluate(target.tree, brief, facts);
  if (evaluation.state === 'approved') return { brief, rejected: [] };
  if (evaluation.state !== 'confirmed') {
    return { brief, rejected: [], refused: 'brief-not-confirmed' };
  }
  if (storyboard.text === undefined) return { brief, rejected: [], refused: 'storyboard-missing' };
  const read = readStoryboard(storyboard.text);
  const problems = target.check(read, evaluation);
  if (problems.length > 0) {
    return { brief, rejected: [], refused: 'storyboard-mismatch', problems };
  }
  if (context.mode === 'sign') {
    return { sign: { evaluation, mode: 'elicitation', message: undefined } };
  }
  const message = params.confirmation;
  const given = message !== undefined && message.trim() !== '';
  if (context.mode === 'plain') {
    return given
      ? { sign: { evaluation, mode: 'agent-reported', message } }
      : { brief, rejected: [], refused: 'confirmation-missing' };
  }
  const parts = approveTicket(text, storyboard.text, target.section);
  if (given && params.ticket !== undefined && ticketValid(context.key, params.ticket, parts)) {
    return { sign: { evaluation, mode: 'agent-reported', message } };
  }
  return {
    ask: {
      summary: approveSummary(read, storyboard.file, target),
      field: 'approved',
      parts,
      text,
      storyboard: storyboard.text,
    },
  };
}

/** The value of an answered instance, else `undefined`. */
const answered = (evaluation: Evaluation, id: string): AnswerValue | undefined => {
  const instance = evaluation.instances.find(i => i.id === id);
  return instance?.status === 'answered' ? instance.value : undefined;
};

/**
 * FR-031: the approved brief's program: R3 (root-relative), the S2 names, the L1 codes, H1 not
 * `none`, `via: brief`. `undefined` when R3 is not answered.
 */
function approvedEntry(evaluation: Evaluation): RecordEntry | undefined {
  const r3 = answered(evaluation, 'R3');
  if (typeof r3 !== 'string') return undefined;
  const l1 = answered(evaluation, 'L1');
  const h1 = answered(evaluation, 'H1');
  return {
    path: r3,
    timelines: evaluation.views,
    languages: (Array.isArray(l1) ? (l1 as readonly unknown[]) : []).flatMap(row => {
      const code = typeof row === 'object' && row !== null ? Reflect.get(row, 'code') : undefined;
      return typeof code === 'string' ? [code] : [];
    }),
    extensions: Array.isArray(h1) && h1.length > 0,
    via: 'brief',
  };
}

/**
 * Step 5 of plan §5: the action on the parsed brief, pure. A `confirm` that passes FR-029's
 * refusals and finds no valid confirmation returns `Signing`: the caller gets the key and signs.
 */
function act(
  params: BriefParameters,
  brief: BriefState,
  facts: Facts,
  target: Target
): Outcome | Signing {
  // The idea belongs to the main brief; an addition's section never stores one (FR-035).
  const idea = target.scope === undefined ? params.idea : undefined;
  switch (params.action) {
    case 'status':
      return { brief: withIdea(brief, idea), rejected: [] };
    case 'answer': {
      const result = applyAnswers(
        target.tree,
        brief,
        facts,
        params.answers ?? [],
        nextRound(brief)
      );
      return { brief: withIdea(result.brief, idea), rejected: result.rejected };
    }
    case 'confirm': {
      const evaluation = evaluate(target.tree, brief, facts);
      if (evaluation.state === 'open') {
        return { brief, rejected: [], refused: 'frontier-not-empty' };
      }
      const message = params.confirmation;
      if (message === undefined || message.trim() === '') {
        return { brief, rejected: [], refused: 'confirmation-missing' };
      }
      // A valid confirmation is a no-op (FR-027).
      if (evaluation.confirmationStatus === 'valid') return { brief, rejected: [] };
      return { sign: { evaluation, mode: 'agent-reported', message } };
    }
    // `section` routes `approve-storyboard` to `approveStoryboard` (it reads STORYBOARD.md), and
    // `handle` routes `accept-existing` to `acceptExisting` (it never reaches a section): neither
    // gets here; the brief stays as it is.
    case 'approve-storyboard':
    case 'accept-existing':
      return { brief, rejected: [] };
  }
}

/** Phase 2 FR-023: the key, `undefined` when absent or malformed; a read error is `io`. */
const readKeyOf = (stateDir: string): Effect.Effect<Buffer | undefined, ToolError> =>
  Effect.tryPromise({
    try: () => readKey(stateDir),
    catch: toToolError('write', path.join(stateDir, 'brief-key')),
  });

/** Phase 2 FR-023: the key, created on the first signing; a malformed key file is `io`. */
const ensureKeyOf = (stateDir: string): Effect.Effect<Buffer, ToolError> =>
  Effect.tryPromise({
    try: () => ensureKey(stateDir),
    catch: toToolError('write', path.join(stateDir, 'brief-key')),
  });

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
const nextOf = (state: BriefSuccess['state'], questions: number, file: string): string => {
  switch (state) {
    case 'open':
      return `Ask the user these ${questions} questions in one message, each with your recommended answer worded so that yes accepts it; then call \`eligian_brief\` with \`action: answer\`.`;
    case 'complete':
      return `Show the user the counts, the delegated answers and ${file}, then call \`eligian_brief\` with \`action: confirm\` and their reply verbatim as \`confirmation\`.`;
    case 'confirmed':
      return 'Draft STORYBOARD.md from the brief (`eligian_docs` id `storyboard`).';
    case 'approved':
      return 'The brief is approved: generation may start (`eligian_init`, then `eligian_check`).';
  }
};

const DECLINED_NEXT =
  'The user declined: ask them what to change, record it with `eligian_brief` `action: answer`, then call `action: confirm` again.';

const DECLINED_STORYBOARD_NEXT =
  'The user did not approve the storyboard: ask them what to change in STORYBOARD.md, change it, then call `eligian_brief` with `action: approve-storyboard` again.';

/** FR-051: the `next` of an `approve-storyboard` refusal, `undefined` for the state's own. */
const storyboardNext = (code: RefusalCode | undefined, file: string): string | undefined => {
  switch (code) {
    case 'storyboard-missing':
      return `Draft ${file} from the brief (\`eligian_docs\` id \`storyboard\`), then call \`eligian_brief\` with \`action: approve-storyboard\`.`;
    case 'storyboard-mismatch':
      return `Fix ${file} for each of \`refused.problems\`, then call \`eligian_brief\` with \`action: approve-storyboard\` again.`;
    case 'confirmation-missing':
      return `Show the user ${file}, then call \`eligian_brief\` with \`action: approve-storyboard\` and their reply verbatim as \`confirmation\`.`;
    default:
      return undefined;
  }
};

/** What an addition's storyboard section holds (FR-039), for its `next`. */
const storyboardPart = (scope: AdditionScope): string => {
  switch (scope.addition) {
    case 'view':
      return `a \`## view ${scope.name}\` section whose beats have end blocks, and an interactions row for each of its S4 rows`;
    case 'language':
      return `${scope.name} in the \`- languages:\` line`;
    case 'host-module':
      return 'a `- host module:` line naming the module';
  }
};

/** Phase 2 FR-037: the `next` of an addition's section; every call passes the same `scope`. */
function additionNext(
  state: BriefStateName,
  questions: number,
  file: string,
  storyboardFile: string,
  scope: AdditionScope
): string {
  const again = `\`scope: ${JSON.stringify(scope)}\``;
  switch (state) {
    case 'open':
      return `Ask the user these ${questions} questions in one message, each with your recommended answer worded so that yes accepts it; then call \`eligian_brief\` with \`action: answer\` and ${again}.`;
    case 'complete':
      return `Show the user the counts, the delegated answers and ${file}, then call \`eligian_brief\` with \`action: confirm\`, ${again} and their reply verbatim as \`confirmation\`.`;
    case 'confirmed':
      return `Add ${storyboardPart(scope)} to ${storyboardFile}, then call \`eligian_brief\` with \`action: approve-storyboard\` and ${again}.`;
    case 'approved':
      return 'The addition is approved: `eligian_check`, `eligian_fmt`, `eligian_compile` and `eligian_smoke` run on the programs of this directory that add it.';
  }
}

const NOT_APPROVED_NEXT =
  "This directory's BRIEF.md is a new presentation still in its interview: change it through its own answers, not an addition. Call `eligian_brief` with `action: status` and no `scope`, and record the new view, language or host module in its answers (S2, L1, H1).";

/** FR-037: the `next` of an addition scope whose name is already in the approved set. */
const alreadyApproved = (scope: AdditionScope): string =>
  scope.addition === 'host-module'
    ? 'The programs of this directory already have a host module: changing it is an edit, not an addition; no interview is needed.'
    : `"${scope.name}" is already a ${scope.addition} of this directory's approved set: changing it is an edit, not an addition; no interview is needed.`;

const UNAVAILABLE_NEXT =
  'No one answered the dialog: show the user `summary` in the conversation, then call `eligian_brief` with the same `action`, their reply verbatim as `confirmation` and this `ticket`.';

const CHANGED_WHILE_ASKING = 'BRIEF.md changed while asking; call again';
const STORYBOARD_CHANGED_WHILE_ASKING = 'STORYBOARD.md changed while asking; call again';

/** FR-021, reading R-2: how long a sign-off dialog waits by default. */
const ELICITATION_TIMEOUT_MS = 300_000;

type ServerClient = EffectAi['McpSchema']['McpServerClient']['Service'];

/** The outcome of a sign-off dialog (FR-020). */
type SignoffOutcome = 'accepted' | 'declined' | 'cancelled' | 'no-answer';

/** FR-018: the client, when it announced form elicitation (read as `paths.ts` reads the roots). */
const elicitingClient = (ai: EffectAi): Effect.Effect<ServerClient | undefined> =>
  Effect.serviceOption(ai.McpSchema.McpServerClient).pipe(
    Effect.map(client =>
      Option.isSome(client) && client.value.clientCapabilities.elicitation !== undefined
        ? client.value
        : undefined
    )
  );

/**
 * FR-019 to FR-021, P6, P7: one sign-off dialog, a form of one required boolean `field`. An
 * accept with `true` is `accepted`; `false`, a decline, and an accept whose content does not
 * decode (a `SchemaError` defect, logged) are `declined`; a cancel (an interrupt-only exit) and a
 * JSON-RPC error answer (a decline that carries a `cause`) are `cancelled`; the time limit is
 * `no-answer`. Any other defect stays a defect (`internal` at the tool boundary).
 */
const elicitSignoff = (
  ai: EffectAi,
  client: ServerClient,
  form: { readonly message: string; readonly field: 'confirmed' | 'approved' | 'accepted' },
  timeoutMs: number
): Effect.Effect<SignoffOutcome> =>
  ai.McpServer.elicit({
    message: form.message,
    schema: Schema.Struct({ [form.field]: Schema.Boolean }),
  }).pipe(
    Effect.map(
      (content): SignoffOutcome => (content[form.field] === true ? 'accepted' : 'declined')
    ),
    Effect.provideService(ai.McpSchema.McpServerClient, client),
    Effect.catchDefect(defect =>
      Schema.isSchemaError(defect)
        ? Effect.logError('eligian mcp: elicitation answer did not decode', defect).pipe(
            Effect.as<SignoffOutcome>('declined')
          )
        : Effect.die(defect)
    ),
    Effect.timeoutOption(timeoutMs),
    Effect.exit,
    Effect.flatMap((exit): Effect.Effect<SignoffOutcome> => {
      if (Exit.isSuccess(exit)) {
        return Effect.succeed(Option.getOrElse(exit.value, (): SignoffOutcome => 'no-answer'));
      }
      if (Cause.hasInterruptsOnly(exit.cause)) return Effect.succeed('cancelled');
      const declined = Cause.findErrorOption(exit.cause);
      if (Option.isSome(declined)) {
        return Effect.succeed(declined.value.cause === undefined ? 'declined' : 'cancelled');
      }
      return Effect.die(Cause.squash(exit.cause));
    })
  );

/**
 * Phase 2 FR-044: the handler requires the compiler lock (the server's `call` provides it), which
 * only adoption takes; every other call touches neither the lock nor the Langium services.
 */
export const handle = (
  params: BriefParameters,
  context: BriefToolContext
): Effect.Effect<BriefSuccess, ToolError, CompilerLock> =>
  Effect.gen(function* () {
    // 1. Paths: outside the root fails before any I/O (FR-026).
    const root = yield* projectRoot(context.ai, context.cwd);
    const dir = yield* resolveInputPath(root, params.directory ?? '.');
    const file = path.join(dir, BRIEF_FILE);
    // Phase 2 FR-003, FR-005: the root's record exists (or the root is never scanned, FR-062)
    // before the brief is read; a failed scan fails the call `io` and the next call scans again.
    yield* context.gate.record.ensureScanned(root.root);

    // 2. One call at a time per brief (FR-033). Waiting for the permit stays interruptible; once
    // acquired, the section runs to its end, so the permit is released only after the write
    // settled (P18, the compiler lock's pattern).
    const run = (mode: SectionMode, acting: BriefParameters, adoption?: CodeFacts) =>
      context.briefLocks.forFile(file).withPermits(1)(
        Effect.uninterruptible(section(acting, context, root.root, dir, file, mode, adoption))
      );
    // The main brief as a `status` reads it: the base of the replies that act on no section.
    const status: BriefParameters = {
      action: 'status',
      ...(params.max === undefined ? {} : { max: params.max }),
    };

    // FR-009: `accept-existing` writes the record, never `BRIEF.md`; its reply carries the
    // directory's brief as a `status` reads it.
    if (params.action === 'accept-existing') {
      const accepted = yield* acceptExisting(
        params,
        context,
        root,
        run(PLAIN, status).pipe(Effect.map(result => result.reply))
      );
      context.gate.noteBrief({ state: accepted.state });
      return accepted;
    }

    // Phase 2 FR-041, FR-044: `scope: 'adopt'` reads the code facts (under the compiler lock,
    // before the brief's permit) and applies them in a section of their own; a `status` ends
    // there, any other action then acts on the adopted brief with its facts read from the file.
    let acting = params;
    if (params.scope === 'adopt') {
      const adopted = yield* adoptCall(params, context, root, dir, file, status, run);
      if (params.action === 'status' || adopted.refused !== undefined) {
        context.gate.noteBrief({ state: adopted.state });
        return adopted;
      }
      const { scope: _adopt, ...rest } = params;
      acting = rest;
    }

    // 3. A `confirm` or `approve-storyboard` from a client that announced elicitation asks the
    // user (FR-018): the pre-check under the permit, the dialog outside every permit (FR-022),
    // then the sign section.
    const client =
      acting.action === 'confirm' || acting.action === 'approve-storyboard'
        ? yield* elicitingClient(context.ai)
        : undefined;
    const first = yield* run(client === undefined ? PLAIN : { kind: 'dialog' }, acting);
    const reply =
      client === undefined || first.ask === undefined
        ? first.reply
        : yield* afterDialog(context, client, first.reply, first.ask, mode => run(mode, acting));
    // Phase 2 FR-057: the call's telemetry line carries the reply state.
    context.gate.noteBrief({ state: reply.state });
    return reply;
  });

/** FR-020: the dialog, then its outcome; only an accepted dialog takes the permit again. */
const afterDialog = (
  context: BriefToolContext,
  client: ServerClient,
  unchanged: BriefSuccess,
  ask: Asking['ask'],
  run: (mode: SectionMode) => Effect.Effect<SectionResult, ToolError>
): Effect.Effect<BriefSuccess, ToolError> =>
  Effect.gen(function* () {
    const timeoutMs = context.options?.elicitationTimeoutMs ?? ELICITATION_TIMEOUT_MS;
    const outcome = yield* elicitSignoff(
      context.ai,
      client,
      { message: ask.summary, field: ask.field },
      timeoutMs
    );
    switch (outcome) {
      case 'accepted':
        return (yield* run({
          kind: 'sign',
          expected: ask.text,
          ...(ask.storyboard === undefined ? {} : { storyboard: ask.storyboard }),
        })).reply;
      case 'declined':
        return {
          ...unchanged,
          refused: { code: 'declined' },
          next: ask.field === 'approved' ? DECLINED_STORYBOARD_NEXT : DECLINED_NEXT,
        };
      case 'cancelled':
      case 'no-answer': {
        // FR-020 step 1, FR-023: the key exists for the ticket; nothing else is written.
        const key = yield* ensureKeyOf(context.gate.stateDir);
        return {
          ...unchanged,
          refused: { code: 'elicitation-unavailable', outcome },
          summary: ask.summary,
          ticket: makeTicket(key, ask.parts),
          next: UNAVAILABLE_NEXT,
        };
      }
    }
  });

// ---------------------------------------------------------------------------------------------
// `accept-existing` (FR-009, FR-020, FR-063, R-15; plan §14).

/** One program `accept-existing` would write: absolute file, root-relative path, its scan. */
interface AcceptedProgram {
  readonly file: string;
  readonly path: string;
  readonly scan: ProgramScan;
}

type Skipped = NonNullable<BriefSuccess['skipped']>[number];

/** The pre-check: the whole call refused (FR-009), or the programs to accept and those skipped. */
type AcceptCheck =
  | {
      readonly refused: NonNullable<BriefSuccess['refused']>;
    }
  | { readonly programs: readonly AcceptedProgram[]; readonly skipped: readonly Skipped[] };

/** What a directory's `BRIEF.md` means for `accept-existing` (FR-011, FR-032). */
interface DirectoryBrief {
  readonly brief: BriefState;
  readonly facts: Facts;
  readonly governed: boolean;
  readonly additions: ApprovedSet;
  readonly context: ScopeContext;
}

/** Case-insensitive on Windows only, as `isInside` compares (`paths.ts`). */
const comparable = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

/** The record's entries of the programs in `dir` (the known programs of a directory, FR-040). */
function entriesIn(record: ProgramRecord, root: string, dir: string): readonly RecordEntry[] {
  if ('invalid' in record) return [];
  const target = comparable(dir);
  return record.programs.filter(
    entry => comparable(path.dirname(path.resolve(root, entry.path))) === target
  );
}

/** The record's timelines of the programs in `dir` (I4's view count of a scoped tree). */
const timelinesIn = (record: ProgramRecord, root: string, dir: string): string[] =>
  entriesIn(record, root, dir).flatMap(entry => entry.timelines);

/**
 * The brief of `dir` as the gate reads it (FR-011: a main brief governs, an adopted one only once
 * approved; FR-032: the approved addition sections). An absent file is the empty brief.
 */
async function directoryBrief(
  root: string,
  dir: string,
  key: Buffer | undefined,
  record: ProgramRecord
): Promise<DirectoryBrief> {
  const text = await readOrUndefined(path.join(dir, BRIEF_FILE));
  const brief = text === undefined ? EMPTY_BRIEF : parseBrief(text).brief;
  const plain = makeFacts(root, dir);
  const facts: Facts = key === undefined ? plain : { ...plain, signer: makeSigner(key) };
  const evaluation = evaluate(TREE, brief, facts);
  const context = scopeContextOf(evaluation, timelinesIn(record, root, dir));
  const additions = approvedAdditionSet(
    brief.additions ?? [],
    addition => evaluateAddition(brief, addition, facts, context).evaluation.state
  );
  return { brief, facts, governed: governs(brief, evaluation.state), additions, context };
}

/** FR-009, FR-034: the next round of an addition's section as it is (or an empty one). */
function additionRound(
  directory: DirectoryBrief,
  scope: { readonly addition: AdditionState['kind']; readonly name: string }
): readonly RoundItem[] {
  const heading = additionHeading(scope);
  const section: AdditionState = directory.brief.additions?.find(a => a.heading === heading) ?? {
    kind: scope.addition,
    name: scope.name,
    heading,
    answers: [],
  };
  const scoped = evaluateAddition(directory.brief, section, directory.facts, directory.context);
  return pickRound(scoped.tree, scoped.evaluation, 7);
}

/**
 * FR-009, R-15: the pre-check of `accept-existing`, in file order. Libraries are skipped; a
 * program governed by a main brief refuses the whole call `governed-by-brief`; a known program
 * is compared with its entry and the directory's approved additions (`classifyKnownChange`):
 * unchanged is skipped, a rename is accepted, an addition refuses the whole call
 * `addition-not-briefed` with the first trigger's `scope` and `round`. Reads, never writes.
 */
async function checkAccept(
  root: string,
  files: readonly string[],
  record: ProgramRecord,
  key: Buffer | undefined
): Promise<AcceptCheck> {
  const directories = new Map<string, Promise<DirectoryBrief>>();
  const programs: AcceptedProgram[] = [];
  const skipped: Skipped[] = [];
  for (const file of files) {
    const relative = toGlobPath(path.relative(root, file));
    const scan = scanProgram(await fsp.readFile(file, 'utf8'));
    if (scan.library) {
      skipped.push({ path: relative, reason: 'library' });
      continue;
    }
    const dir = path.dirname(file);
    let pending = directories.get(comparable(dir));
    if (pending === undefined) {
      pending = directoryBrief(root, dir, key, record);
      directories.set(comparable(dir), pending);
    }
    const directory = await pending;
    if (directory.governed) return { refused: { code: 'governed-by-brief' } };
    const entry = entryFor(record, root, file);
    if (entry !== undefined) {
      const known = classifyKnownChange(scan, entry, directory.additions);
      if (known.change === 'unchanged') {
        skipped.push({ path: relative, reason: 'unchanged' });
        continue;
      }
      if (known.change === 'addition') {
        const first = known.triggers[0];
        const scope = { addition: first.addition, name: first.name };
        return {
          refused: {
            code: 'addition-not-briefed',
            scope,
            round: additionRound(directory, scope),
          },
        };
      }
    }
    programs.push({ file, path: relative, scan });
  }
  const byPath = (a: AcceptedProgram, b: AcceptedProgram) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  return { programs: [...programs].sort(byPath), skipped };
}

/** FR-020 step 2, FR-063: what an `accept-existing` ticket binds: the sorted paths and the scans. */
const acceptTicket = (programs: readonly AcceptedProgram[]): TicketParts => [
  'eligian-signoff-ticket/1',
  'accept-existing',
  'accept-existing',
  null,
  null,
  programs.map(p => p.path),
  programs.map(p => [p.scan.timelines, p.scan.languages, p.scan.extensions] as const),
];

const listed = (names: readonly string[]): string =>
  names.length === 0 ? 'none' : names.join(', ');

/** FR-019: the `accept-existing` dialog's message: each program with what its scan found. */
function acceptSummary(programs: readonly AcceptedProgram[]): string {
  const lines = [
    'Accept these programs as existing work: the generation tools then run on them without a brief.',
    '',
  ];
  for (const { file, scan } of programs) {
    lines.push(
      `- ${file}: timelines ${listed(scan.timelines)}; languages ${listed(scan.languages)}; extensions block ${scan.extensions ? 'yes' : 'no'}`
    );
  }
  return lines.join('\n');
}

const sameScan = (a: ProgramScan, b: ProgramScan): boolean =>
  JSON.stringify([a.timelines, a.languages, a.extensions]) ===
  JSON.stringify([b.timelines, b.languages, b.extensions]);

const PROGRAM_CHANGED_WHILE_ASKING = 'a program changed while asking; call again';

/** FR-063: after the dialog every program is scanned again; a changed scan writes nothing. */
const rescan = (programs: readonly AcceptedProgram[]): Effect.Effect<void, ToolError> =>
  Effect.forEach(
    programs,
    program =>
      Effect.tryPromise({
        try: () => fsp.readFile(program.file, 'utf8'),
        catch: toToolError('read', program.file),
      }).pipe(
        Effect.flatMap(source =>
          sameScan(scanProgram(source), program.scan)
            ? Effect.void
            : Effect.fail(
                new ToolIoError({ message: PROGRAM_CHANGED_WHILE_ASKING, path: program.file })
              )
        )
      ),
    { discard: true }
  );

const ACCEPTED_NEXT =
  'The programs are known now: `eligian_check`, `eligian_fmt`, `eligian_compile` and `eligian_smoke` run on them. A new view, language or host module in them still needs its interview (`scope`).';

const NOTHING_TO_ACCEPT_NEXT =
  'Nothing to accept: every matched program is a library or already known as it is.';

const ACCEPT_MISSING_NEXT =
  'Show the user `summary`, then call `eligian_brief` with `action: accept-existing`, the same `paths` and their reply verbatim as `confirmation`.';

const ACCEPT_DECLINED_NEXT =
  'The user did not accept these programs: ask them which programs are theirs, then call `eligian_brief` with `action: accept-existing` and those `paths`, or start a brief with `action: status`.';

const GOVERNED_NEXT =
  "A matched program is governed by its directory's BRIEF.md: its brief decides. Leave it out of `paths`, or continue that brief with `eligian_brief` `action: status` on its directory.";

const ADDITION_NEXT =
  "A known program adds what `refused.scope` names: ask the user the questions of `refused.round` in one message, then call `eligian_brief` with `action: answer` and that `scope` on the program's directory.";

/**
 * FR-009, FR-020, FR-063: `accept-existing`. The pre-check reads the programs and their briefs
 * (no permit: it writes nothing); a refusal refuses the whole call before the user is asked. Then
 * the sign-off as for `confirm`: a valid ticket with a `confirmation`, or the dialog (outside every
 * permit) followed by a re-scan, or, for a client without elicitation, the `confirmation`. Only
 * the record is written (`via: accepted` with the mode), under the record's own semaphore.
 */
const acceptExisting = (
  params: BriefParameters,
  context: BriefToolContext,
  root: ProjectRoot,
  status: Effect.Effect<BriefSuccess, ToolError>
): Effect.Effect<BriefSuccess, ToolError> =>
  Effect.gen(function* () {
    const base = yield* status;
    const files = yield* resolveInputPatterns(root, params.paths ?? []);
    const record = yield* context.gate.record.read(root.root);
    const key = yield* readKeyOf(context.gate.stateDir);
    const checked = yield* Effect.tryPromise({
      try: () => checkAccept(root.root, files, record, key),
      catch: toToolError('read'),
    });
    if ('refused' in checked) {
      return {
        ...base,
        refused: checked.refused,
        next: checked.refused.code === 'governed-by-brief' ? GOVERNED_NEXT : ADDITION_NEXT,
      };
    }
    const { programs, skipped } = checked;
    if (programs.length === 0) {
      return { ...base, accepted: [], skipped, next: NOTHING_TO_ACCEPT_NEXT };
    }

    const write = (mode: 'elicitation' | 'agent-reported') =>
      context.gate.record
        .update(
          root.root,
          programs.map(
            (program): RecordEntry => ({
              path: program.path,
              timelines: program.scan.timelines,
              languages: program.scan.languages,
              extensions: program.scan.extensions,
              via: 'accepted',
              mode,
            })
          )
        )
        .pipe(
          Effect.as<BriefSuccess>({
            ...base,
            accepted: programs.map(p => p.path),
            skipped,
            signoff: { mode },
            next: ACCEPTED_NEXT,
          })
        );

    const summary = acceptSummary(programs);
    const parts = acceptTicket(programs);
    const message = params.confirmation;
    const given = message !== undefined && message.trim() !== '';
    const client = yield* elicitingClient(context.ai);
    if (client === undefined) {
      // No elicitation: Phase 1's flow, the reply verbatim (FR-020's last paragraph).
      return given
        ? yield* write('agent-reported')
        : {
            ...base,
            refused: { code: 'confirmation-missing' },
            skipped,
            summary,
            next: ACCEPT_MISSING_NEXT,
          };
    }
    if (given && params.ticket !== undefined && ticketValid(key, params.ticket, parts)) {
      return yield* write('agent-reported');
    }
    const timeoutMs = context.options?.elicitationTimeoutMs ?? ELICITATION_TIMEOUT_MS;
    const outcome = yield* elicitSignoff(
      context.ai,
      client,
      { message: summary, field: 'accepted' },
      timeoutMs
    );
    switch (outcome) {
      case 'accepted':
        yield* rescan(programs);
        return yield* write('elicitation');
      case 'declined':
        return { ...base, refused: { code: 'declined' }, next: ACCEPT_DECLINED_NEXT };
      case 'cancelled':
      case 'no-answer': {
        const signing = yield* ensureKeyOf(context.gate.stateDir);
        return {
          ...base,
          refused: { code: 'elicitation-unavailable', outcome },
          summary,
          ticket: makeTicket(signing, parts),
          next: UNAVAILABLE_NEXT,
        };
      }
    }
  });

// ---------------------------------------------------------------------------------------------
// Adoption (Phase 2 FR-041 to FR-049; plan §14 step 2).

/** FR-041: the program files of `dir` (non-library `.eligian`, not recursive), sorted. */
async function programsIn(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (cause) {
    if (errnoCode(cause) === 'ENOENT') return [];
    throw cause;
  }
  const programs: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.eligian') continue;
    const file = path.join(dir, entry.name);
    if (!scanProgram(await fsp.readFile(file, 'utf8')).library) programs.push(file);
  }
  return programs.sort();
}

/** FR-041: a main brief that did not come from adoption is the brief of a new presentation. */
const holdsNewBrief = (brief: BriefState): boolean => isMainBrief(brief) && brief.scope !== 'adopt';

/** A value as JSON with object keys sorted, so a re-read fact compares by content. */
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([l], [r]) => (l < r ? -1 : l > r ? 1 : 0)))
      : v
  );

/**
 * FR-042, FR-044: the brief with the code facts as its `by: code` answers and `- scope: adopt`.
 * Every `by: code` answer is replaced (an answer of another `by` for a fact's id too); a fact
 * whose value is unchanged keeps its answer and round, a changed or new one gets the call's
 * round, so its dependents reopen (Phase 1 FR-015). Unchanged, the same object is returned.
 */
function adoptedBrief(brief: BriefState, facts: CodeFacts): BriefState {
  const previous = new Map(brief.answers.filter(a => a.by === 'code').map(a => [a.id, a]));
  const fresh = factAnswers(facts, nextRound(brief)).map(fact => {
    const known = previous.get(fact.id);
    return known !== undefined && stableJson(known.value) === stableJson(fact.value) ? known : fact;
  });
  const ids = new Set(fresh.map(answer => answer.id));
  const answers = [...brief.answers.filter(a => a.by !== 'code' && !ids.has(a.id)), ...fresh];
  const unchanged =
    brief.scope === 'adopt' &&
    answers.length === brief.answers.length &&
    answers.every(answer => brief.answers.includes(answer));
  return unchanged ? brief : { ...brief, scope: 'adopt', answers };
}

const relativeName = (root: string, file: string): string => toGlobPath(path.relative(root, file));

/** FR-041: why a directory has no program to adopt (none, or more than one). */
function programCountNext(root: string, dir: string, programs: readonly string[]): string {
  const where = relativeName(root, dir) || '.';
  return programs.length === 0
    ? `No program to adopt in ${where}: adoption needs exactly one program file (a .eligian file that is not a library) in the directory itself.`
    : `${programs.length} programs in ${where} (${programs.map(p => relativeName(root, p)).join(', ')}): adoption needs exactly one program file in the directory; adopt a directory that holds one.`;
}

/** FR-047: the timeline names that cannot be view names. */
const badNamesNext = (names: readonly string[]): string =>
  `${names.map(name => JSON.stringify(name)).join(', ')} cannot be view names: 1 to 64 characters, no ":", "|", line break, or leading or trailing space; rename the timeline${names.length === 1 ? '' : 's'}, then call \`eligian_brief\` with \`scope: adopt\` again.`;

const adoptBriefedNext = (file: string): string =>
  `${file} already holds the brief of a new presentation; adoption starts a brief from the code and never replaces one. Continue that brief with \`eligian_brief\` \`action: status\` and no \`scope\`.`;

/**
 * FR-041, FR-044, FR-047: a call with `scope: 'adopt'`. The directory must hold exactly one
 * program and no brief of a new presentation (`adopt-program`, `adopt-briefed`; the reply is the
 * main brief as `status` reads it, nothing written). The code facts are read under the compiler
 * lock before the brief's permit is taken, so the permit is never held while waiting for the
 * lock; a timeline name outside FR-047's rule refuses `adopt-program`. Then one section applies
 * the facts (and a `status`'s idea); its reply is the call's for a `status`.
 */
const adoptCall = (
  params: BriefParameters,
  context: BriefToolContext,
  root: ProjectRoot,
  dir: string,
  file: string,
  status: BriefParameters,
  run: (
    mode: SectionMode,
    acting: BriefParameters,
    adoption?: CodeFacts
  ) => Effect.Effect<SectionResult, ToolError>
): Effect.Effect<BriefSuccess, ToolError, CompilerLock> =>
  Effect.gen(function* () {
    const refuse = (code: RefusalCode, next: string) =>
      run(PLAIN, status).pipe(
        Effect.map((result): BriefSuccess => ({ ...result.reply, refused: { code }, next }))
      );
    const programs = yield* Effect.tryPromise({
      try: () => programsIn(dir),
      catch: toToolError('read', dir),
    });
    if (programs.length !== 1) {
      return yield* refuse('adopt-program', programCountNext(root.root, dir, programs));
    }
    // A cheap read first, so a directory that cannot be adopted never waits for the lock; the
    // section checks again under the permit.
    const text = yield* readFileText(file);
    const existing = text === undefined ? undefined : yield* Effect.sync(() => parseBrief(text));
    if (existing !== undefined && holdsNewBrief(existing.brief)) {
      return yield* refuse('adopt-briefed', adoptBriefedNext(file));
    }
    const facts = yield* readCodeFacts(programs[0], root.root, context.requestId);
    if (facts.badNames.length > 0) {
      return yield* refuse('adopt-program', badNamesNext(facts.badNames));
    }
    return (yield* run(PLAIN, params.action === 'status' ? params : status, facts)).reply;
  });

/**
 * FR-049: the adopted program's record entry, from its fresh scan, `via: adopted`; `undefined`
 * when R3 is not answered.
 */
const adoptedEntry = (
  evaluation: Evaluation,
  root: string
): Effect.Effect<RecordEntry | undefined, ToolError> => {
  const r3 = answered(evaluation, 'R3');
  if (typeof r3 !== 'string') return Effect.undefined;
  const program = path.resolve(root, r3);
  return Effect.tryPromise({
    try: () => fsp.readFile(program, 'utf8'),
    catch: toToolError('read', program),
  }).pipe(
    Effect.map((source): RecordEntry => {
      const scan = scanProgram(source);
      return {
        path: relativeName(root, program),
        timelines: scan.timelines,
        languages: scan.languages,
        extensions: scan.extensions,
        via: 'adopted',
      };
    })
  );
};

// ---------------------------------------------------------------------------------------------
// The section a call acts on (Phase 2 FR-035 to FR-040, P11; plan §14).

/**
 * The section of `BRIEF.md` a call acts on: its target, its state as a brief (the main brief, or
 * an addition's answers and signed lines), the facts it is evaluated with, and the whole brief
 * with a new state of the section put back. `created`: an addition's section that `status` or
 * `answer` creates on first use (FR-037).
 */
interface Frame {
  readonly target: Target;
  readonly brief: BriefState;
  readonly facts: (signer: Signer | undefined) => Facts;
  readonly whole: (brief: BriefState) => BriefState;
  readonly created: boolean;
}

const withSigner = (facts: Facts, signer: Signer | undefined): Facts =>
  signer === undefined ? facts : { ...facts, signer };

const mainFrame = (brief: BriefState, plain: Facts): Frame => ({
  target: MAIN,
  brief,
  facts: signer => withSigner(plain, signer),
  whole: next => next,
  created: false,
});

/** FR-037: the addition a call's `scope` names; a host module's `name` is ignored (`''`). */
const additionScopeOf = (scope: BriefParameters['scope']): AdditionScope | undefined =>
  typeof scope === 'object'
    ? { addition: scope.addition, name: scope.addition === 'host-module' ? '' : scope.name }
    : undefined;

/**
 * An addition's section (FR-035 to FR-038, P11): its scoped tree over `context`, its heading as
 * the HMAC section, its answers and signed lines evaluated as `evaluateAddition` (gate.ts) does,
 * so the gate and the tool agree on its state.
 */
function additionFrame(
  scope: AdditionScope,
  brief: BriefState,
  plain: Facts,
  context: ScopeContext,
  action: BriefParameters['action']
): Frame {
  const heading = additionHeading(scope);
  const additions = brief.additions ?? [];
  const existing = additions.find(addition => addition.heading === heading);
  const section: AdditionState = existing ?? {
    kind: scope.addition,
    name: scope.name,
    heading,
    answers: [],
  };
  const signed = (state: Pick<BriefState, 'confirmation' | 'approval'>) => ({
    ...(state.confirmation === undefined ? {} : { confirmation: state.confirmation }),
    ...(state.approval === undefined ? {} : { approval: state.approval }),
  });
  return {
    target: {
      tree: scopedTree(scope, context),
      section: heading,
      check: (storyboard, evaluation) => checkAdditionStoryboard(storyboard, scope, evaluation),
      scope,
    },
    brief: {
      treeVersion: brief.treeVersion,
      answers: section.answers,
      additions: [],
      ...signed(section),
    },
    facts: signer => ({
      ...withSigner(plain, signer),
      section: heading,
      ...(scope.addition === 'view' ? { views: [scope.name] } : {}),
    }),
    whole: next => {
      const updated: AdditionState = {
        kind: section.kind,
        name: section.name,
        heading,
        ...signed(next),
        answers: next.answers,
      };
      return {
        ...brief,
        additions:
          existing === undefined
            ? [...additions, updated]
            : additions.map(addition => (addition === existing ? updated : addition)),
      };
    },
    created: existing === undefined && (action === 'status' || action === 'answer'),
  };
}

/** The S2 name rule of FR-047 (tree.ts `checkS2` on one row): a message, or `undefined`. */
const viewNameProblem = (name: string): string | undefined =>
  TREE.find(q => q.id === 'S2')?.check?.([{ name, purpose: '-' }]);

/**
 * FR-036, FR-037, P20: why an addition scope is refused before its section is touched, else
 * `undefined`. A view name outside FR-047's rule or a language name that is not a code is
 * `not-an-addition`; so is a name already in the directory's approved set (its programs' record
 * entries, its approved additions and an approved main brief's S2/L1/H1), unless the addition's
 * own section exists. `brief-not-approved` only for a new presentation still in its interview: a
 * main brief, not adopted, not approved, and no program of the directory in the record.
 */
function additionRefusal(
  scope: AdditionScope,
  brief: BriefState,
  main: Evaluation,
  record: ProgramRecord,
  root: string,
  dir: string,
  facts: Facts,
  context: ScopeContext
): { readonly code: RefusalCode; readonly next: string } | undefined {
  if (scope.addition === 'view' && viewNameProblem(scope.name) !== undefined) {
    return {
      code: 'not-an-addition',
      next: `"${scope.name}" cannot be a view name: 1 to 64 characters, no ":", "|", line break, or leading or trailing space; rename the timeline`,
    };
  }
  if (scope.addition === 'language' && !LANGUAGE_CODE.test(scope.name)) {
    return {
      code: 'not-an-addition',
      next: `"${scope.name}" is not a language code like en-US`,
    };
  }
  const entries = entriesIn(record, root, dir);
  if (
    isMainBrief(brief) &&
    brief.scope !== 'adopt' &&
    main.state !== 'approved' &&
    entries.length === 0
  ) {
    return { code: 'brief-not-approved', next: NOT_APPROVED_NEXT };
  }
  const heading = additionHeading(scope);
  if ((brief.additions ?? []).some(addition => addition.heading === heading)) return undefined;
  const additions = approvedAdditionSet(
    brief.additions ?? [],
    addition => evaluateAddition(brief, addition, facts, context).evaluation.state
  );
  const approvedMain =
    governs(brief, main.state) && main.state === 'approved' ? approvedEntry(main) : undefined;
  const sets: readonly ApprovedSet[] = [
    ...entries,
    additions,
    ...(approvedMain === undefined ? [] : [approvedMain]),
  ];
  const known =
    scope.addition === 'view'
      ? sets.some(set => set.timelines.includes(scope.name))
      : scope.addition === 'language'
        ? sets.some(set => set.languages.includes(scope.name))
        : sets.some(set => set.extensions);
  return known ? { code: 'not-an-addition', next: alreadyApproved(scope) } : undefined;
}

/**
 * FR-040: every known program of the directory with the approved addition: the timeline name,
 * the language code or `extensions: true`, `via: addition`. Entries that hold it already are left.
 */
function additionEntries(
  record: ProgramRecord,
  root: string,
  dir: string,
  scope: AdditionScope
): readonly RecordEntry[] {
  return entriesIn(record, root, dir).flatMap((entry): RecordEntry[] => {
    const base: RecordEntry = {
      path: entry.path,
      timelines: entry.timelines,
      languages: entry.languages,
      extensions: entry.extensions,
      via: 'addition',
    };
    if (scope.addition === 'view') {
      return entry.timelines.includes(scope.name)
        ? []
        : [{ ...base, timelines: [...entry.timelines, scope.name] }];
    }
    if (scope.addition === 'language') {
      return entry.languages.includes(scope.name)
        ? []
        : [{ ...base, languages: [...entry.languages, scope.name] }];
    }
    return entry.extensions ? [] : [{ ...base, extensions: true }];
  });
}

/** FR-035: each addition section's `- state:` line, from its own evaluation. */
const additionStatesOf = (
  brief: BriefState,
  facts: Facts,
  context: ScopeContext
): ReadonlyMap<string, BriefStateName> =>
  new Map(
    (brief.additions ?? []).map(addition => [
      addition.heading,
      evaluateAddition(brief, addition, facts, context).evaluation.state,
    ])
  );

/** The reply of a section (FR-030, Phase 2 FR-051), in the reply's key order. */
const replyOf = (
  context: BriefToolContext,
  file: string,
  evaluation: Evaluation,
  round: readonly RoundItem[],
  outcome: Outcome,
  ignored: BriefSuccess['ignored'],
  next: string,
  extra: Pick<BriefSuccess, 'signoff' | 'scope'> = {},
  conflicts: readonly Conflict[] = []
): BriefSuccess => ({
  header: `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${file}`,
  file,
  state: evaluation.state,
  round,
  counts: { ...evaluation.counts, fromCode: evaluation.counts.fromCode ?? 0 },
  rejected: outcome.rejected,
  ignored,
  // Phase 3 FR-077: listed for the brief's sign-off only (`complete`); a confirmed or approved
  // brief has been signed off, so its replies keep the counts and leave the list out.
  ...(evaluation.state === 'complete' ? { delegated: evaluation.delegated } : {}),
  // FR-026, FR-051: the answers changed since an invalid confirmation.
  ...(evaluation.changed.length === 0 ? {} : { changed: evaluation.changed }),
  ...(outcome.refused === undefined
    ? {}
    : {
        refused: {
          code: outcome.refused,
          ...(outcome.problems === undefined ? {} : { problems: outcome.problems }),
        },
      }),
  ...(extra.signoff === undefined ? {} : { signoff: extra.signoff }),
  // FR-046: listed until one side changes; they never block.
  ...(conflicts.length === 0 ? {} : { conflicts }),
  ...(extra.scope === undefined ? {} : { scope: extra.scope }),
  next,
});

/**
 * Steps 3–8 of plan §5, under the brief's permit; Phase 2 adds the addition sections (FR-037)
 * and, with `adoption` (the code facts of a `scope: 'adopt'` call), applies the facts to the main
 * brief first (FR-044).
 */
const section = (
  params: BriefParameters,
  context: BriefToolContext,
  root: string,
  dir: string,
  file: string,
  mode: SectionMode,
  adoption?: CodeFacts
): Effect.Effect<SectionResult, ToolError> =>
  Effect.gen(function* () {
    // 3. Read and parse; a parser throw is a defect, answered `internal` before any write (P19).
    const text = yield* readFileText(file);
    // FR-022: after an accepted dialog, only the bytes the dialog summarised are signed.
    if (mode.kind === 'sign' && text !== mode.expected) {
      return yield* new ToolIoError({ message: CHANGED_WHILE_ASKING, path: file });
    }
    // FR-028 (reading R-5): `approve-storyboard` reads `STORYBOARD.md` beside the brief.
    const approving = params.action === 'approve-storyboard';
    const storyboardFile = path.join(dir, STORYBOARD_FILE);
    const storyboard: StoryboardRead = {
      file: storyboardFile,
      text: approving ? yield* readFileText(storyboardFile) : undefined,
    };
    if (approving && mode.kind === 'sign' && storyboard.text !== mode.storyboard) {
      return yield* new ToolIoError({
        message: STORYBOARD_CHANGED_WHILE_ASKING,
        path: storyboardFile,
      });
    }
    const parsed = text === undefined ? EMPTY_PARSED : yield* Effect.sync(() => parseBrief(text));

    // 4. Facts and probes, recomputed on every call (FR-012, FR-042); the signer over the key, so
    // a confirmation made with it verifies (Phase 2 P4). Only a signing creates the key (FR-023).
    const stateDir = context.gate.stateDir;
    const key = yield* readKeyOf(stateDir);
    const plain = makeFacts(root, dir);
    let signer = key === undefined ? undefined : makeSigner(key);
    const probes = yield* Effect.promise(() => probeFacts(root));

    // Phase 2 FR-037: an addition scope acts on that addition's section. Its context is the main
    // brief's settled answers and the record's timelines of the directory (P11, R-8); the record
    // is read only when the call or the file has an addition.
    const scope = additionScopeOf(params.scope);
    const record =
      scope !== undefined || (parsed.brief.additions ?? []).length > 0
        ? yield* context.gate.record.read(root)
        : undefined;
    const contextOf = (main: Evaluation): ScopeContext =>
      scopeContextOf(main, record === undefined ? [] : timelinesIn(record, root, dir));
    let frame = mainFrame(parsed.brief, plain);
    // FR-041, FR-044: adoption never replaces the brief of a new presentation; otherwise the
    // facts replace every `by: code` answer, and a change is written whatever the action does.
    let adopted = false;
    if (adoption !== undefined) {
      if (holdsNewBrief(parsed.brief)) {
        const main = evaluate(TREE, parsed.brief, withSigner(plain, signer));
        const refused: Outcome = { brief: parsed.brief, rejected: [], refused: 'adopt-briefed' };
        const round = pickRound(TREE, main, params.max ?? 7);
        const next = adoptBriefedNext(file);
        return { reply: replyOf(context, file, main, round, refused, parsed.ignored, next) };
      }
      const brief = adoptedBrief(parsed.brief, adoption);
      adopted = brief !== parsed.brief;
      frame = mainFrame(brief, plain);
    }
    if (scope !== undefined && record !== undefined) {
      const keyed = withSigner(plain, signer);
      const main = evaluate(TREE, parsed.brief, keyed);
      const scopeContext = contextOf(main);
      const refusal = additionRefusal(
        scope,
        parsed.brief,
        main,
        record,
        root,
        dir,
        keyed,
        scopeContext
      );
      if (refusal !== undefined) {
        // Nothing is created (P20); the reply carries the main brief as `status` reads it.
        const refused: Outcome = { brief: parsed.brief, rejected: [], refused: refusal.code };
        const round = pickRound(TREE, main, params.max ?? 7);
        return {
          reply: replyOf(context, file, main, round, refused, parsed.ignored, refusal.next),
        };
      }
      frame = additionFrame(scope, parsed.brief, plain, scopeContext, params.action);
    }
    const { target } = frame;
    const before = frame.facts(signer);

    // 5–6. The action, then the evaluation of the resulting section.
    const acted = approving
      ? approveStoryboard(
          params,
          frame.brief,
          before,
          { mode: mode.kind, key },
          text ?? '',
          storyboard,
          target
        )
      : mode.kind === 'plain'
        ? act(params, frame.brief, before, target)
        : confirmByDialog(
            params,
            frame.brief,
            before,
            { mode: mode.kind, key },
            text ?? '',
            file,
            target
          );
    let outcome: Outcome;
    let signoff: 'elicitation' | 'agent-reported' | undefined;
    let ask: Asking['ask'] | undefined;
    // FR-049: an adopted brief confirmed while STORYBOARD.md exists is approved in the same write.
    let storyboardApproved = false;
    if ('sign' in acted) {
      signer = makeSigner(yield* ensureKeyOf(stateDir));
      const { evaluation: signed, mode: signedMode, message } = acted.sign;
      const sign = approving ? approve : confirm;
      let brief = sign(
        frame.brief,
        signedMode,
        message,
        new Date(),
        signed,
        signer,
        target.section
      );
      if (
        !approving &&
        target.scope === undefined &&
        brief.scope === 'adopt' &&
        (yield* readFileText(storyboardFile)) !== undefined
      ) {
        brief = approve(
          brief,
          'existing-storyboard',
          undefined,
          new Date(),
          signed,
          signer,
          'brief'
        );
        storyboardApproved = true;
      }
      outcome = { brief, rejected: [] };
      signoff = signedMode;
    } else if ('ask' in acted) {
      outcome = { brief: frame.brief, rejected: [] };
      ask = acted.ask;
    } else {
      outcome = acted;
    }
    const evaluation = evaluate(target.tree, outcome.brief, frame.facts(signer));

    // 7. Write only when the brief changed (FR-028), an addition's section is created (FR-037),
    // or adoption changed the facts (FR-044).
    const written = frame.created || adopted || outcome.brief !== frame.brief;
    if (written) {
      const whole = frame.whole(outcome.brief);
      const mainFacts = withSigner(plain, signer);
      const main = target.scope === undefined ? evaluation : evaluate(TREE, whole, mainFacts);
      const snapshot: FactsSnapshot = {
        state: main.state,
        // FR-035: each addition's `- state:` from its own evaluation.
        ...(record === undefined
          ? {}
          : { additionStates: additionStatesOf(whole, mainFacts, contextOf(main)) }),
        serverEligian: context.versions.compiler,
        eligianInstalled: probes.eligianInstalled,
        packageManager: probes.packageManager,
        textDirection: directionsOf(main),
        assets: main.assets,
      };
      // FR-018: a brief not confirmed under its recorded version records the current one.
      const treeVersion = recordedTreeVersion(TREE, whole, mainFacts, TREE_VERSION);
      yield* writeBriefFile(
        file,
        writeBrief(TREE, { ...parsed, brief: { ...whole, treeVersion } }, snapshot),
        text,
        context.options?.beforeRename
      );
    }

    // FR-031, FR-040, P19: an approved brief's program, or the known programs of the directory
    // with an approved addition, enter the record under the brief's permit (the lock order: brief
    // permit, then the record's semaphore). A repeat approval writes nothing above and re-tries
    // this write; when it fails, the call fails `io` with the section approved. An adopted
    // brief's program enters with its fresh scan, `via: adopted` (FR-049).
    if (
      (approving || storyboardApproved) &&
      evaluation.state === 'approved' &&
      outcome.refused === undefined
    ) {
      if (target.scope === undefined) {
        const entry =
          outcome.brief.scope === 'adopt'
            ? yield* adoptedEntry(evaluation, root)
            : approvedEntry(evaluation);
        if (entry !== undefined) yield* context.gate.record.update(root, [entry]);
      } else {
        const fresh = yield* context.gate.record.read(root);
        const entries = additionEntries(fresh, root, dir, target.scope);
        if (entries.length > 0) yield* context.gate.record.update(root, entries);
      }
    }

    // 8. The reply (FR-030); an addition's names its scope (FR-051).
    const round = pickRound(target.tree, evaluation, params.max ?? 7);
    const refusalNext = approving ? storyboardNext(outcome.refused, storyboardFile) : undefined;
    let next: string;
    if (target.scope === undefined) {
      const noIdeaYet = text === undefined && !written && outcome.brief.idea === undefined;
      next = noIdeaYet ? IDEA_NEXT : (refusalNext ?? nextOf(evaluation.state, round.length, file));
    } else {
      next =
        refusalNext === undefined
          ? additionNext(evaluation.state, round.length, file, storyboardFile, target.scope)
          : `${refusalNext} Pass \`scope: ${JSON.stringify(target.scope)}\` again.`;
    }
    const reply = replyOf(
      context,
      file,
      evaluation,
      round,
      outcome,
      parsed.ignored,
      next,
      {
        ...(signoff === undefined ? {} : { signoff: { mode: signoff } }),
        ...(target.scope === undefined ? {} : { scope: target.scope }),
      },
      // FR-046: the main brief's conflicts between the code facts and the answers.
      target.scope === undefined ? conflictsOf(evaluation) : []
    );
    return ask === undefined ? { reply } : { reply, ask };
  });
