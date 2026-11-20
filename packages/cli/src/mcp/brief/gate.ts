/**
 * Spec 059 Phase 2 (FR-009 to FR-017, FR-032 to FR-034, FR-053 to FR-056; plan §8): the gate of
 * the generation tools.
 *
 * Part 1, the pure verdict: `gateVerdict` (the FR-012 matrix with the FR-032/FR-033 triggers),
 * `approvedDirectory` (P21), `classifyKnownChange` (FR-009, R-15) and the governance rules of
 * FR-011 over a parsed brief. No fs, no Effect: the whole matrix is tested without a server
 * (SC-001).
 *
 * Part 2, the reads around it: `checkPrograms` (the Effect the five generation tools run first,
 * FR-010, FR-014 to FR-017), `briefStatusOf` (`eligian_project`'s brief section, FR-056) and
 * `cliBriefWarnings` (the CLI's stderr line, FR-053 to FR-055). They read the record, `BRIEF.md`,
 * `STORYBOARD.md` and the key; they never write, never create the key and never load
 * `@eligian/language` (SC-003).
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Effect } from 'effect';
import { expandPatterns, toGlobPath } from '../../check/files.js';
import { type ToolError, ToolGateRefused, toToolError } from '../errors.js';
import { isInside, type ProjectRoot } from '../paths.js';
import { readStoryboard } from '../storyboard.js';
import { BRIEF_FILE, type ParsedBrief, parseBrief } from './brief-file.js';
import {
  type AdditionKind,
  type AdditionState,
  type BriefState,
  type BriefStateName,
  type Counts,
  EMPTY_BRIEF,
  type Evaluation,
  evaluate,
  type Facts,
  pickRound,
  type RoundItem,
} from './engine.js';
import { makeFacts } from './facts.js';
import {
  entryFor,
  findRecordFile,
  type ProgramRecord,
  type ProgramScan,
  parseRecord,
  type RecordEntry,
  type RecordStore,
  scanProgram,
  type Via,
} from './known-programs.js';
import { type AdditionScope, additionHeading, type ScopeContext, scopedTree } from './scoped.js';
import { makeSigner, readKey, stateDirectory } from './signature.js';
import { type AnswerValue, type Question, TREE } from './tree.js';
import type { GateRefusal } from './wire.js';

/** The six refusal codes of the gate (FR-012, FR-034). */
export type GateCode =
  | 'brief-required'
  | 'brief-incomplete'
  | 'brief-not-confirmed'
  | 'storyboard-not-approved'
  | 'brief-changed'
  | 'addition-not-briefed';

/** What a program may contain without an addition interview (FR-032). */
export interface ApprovedSet {
  readonly timelines: readonly string[];
  readonly languages: readonly string[];
  readonly extensions: boolean;
}

/** One addition found in a program or its storyboard (FR-032 to FR-034); `name` is `''` for a host module. */
export interface Trigger {
  readonly addition: AdditionKind;
  readonly name: string;
}

/** The main brief that governs a program (FR-011), as the verdict needs it. */
export interface GoverningBrief {
  readonly state: BriefStateName;
  readonly confirmation: 'none' | 'valid' | 'invalid';
  readonly changed: Evaluation['changed'];
  /** S2 names, L1 codes, H1 ≠ none. */
  readonly approvedSet: ApprovedSet;
}

export interface GateInput {
  /** `undefined`: `eligian_init`'s target, about to be replaced (P16: no trigger check). */
  readonly scan: ProgramScan | undefined;
  /** `undefined`: the program is not known. */
  readonly entry: RecordEntry | undefined;
  /** FR-011: a main brief, never an adopted one that is not approved. */
  readonly brief: GoverningBrief | undefined;
  /** The approved addition sections of the directory's `BRIEF.md` (FR-032, FR-040). */
  readonly additions: ApprovedSet;
  /** FR-033: the storyboard's views, set only in a briefed, approved directory (P21). */
  readonly storyboardViews?: readonly string[];
}

export type KnownChange =
  | { readonly change: 'unchanged' }
  | { readonly change: 'rename' }
  | { readonly change: 'addition'; readonly triggers: readonly Trigger[] };

export type Verdict =
  | { readonly verdict: 'runs' }
  | {
      readonly verdict: 'refused';
      readonly code: GateCode;
      readonly triggers?: readonly Trigger[];
    };

export const EMPTY_SET: ApprovedSet = { timelines: [], languages: [], extensions: false };

const union = (...sets: readonly ApprovedSet[]): ApprovedSet => ({
  timelines: sets.flatMap(s => s.timelines),
  languages: sets.flatMap(s => s.languages),
  extensions: sets.some(s => s.extensions),
});

/** The names of `names` not in `known`, each once, in their order. */
const newNames = (names: readonly string[], known: readonly string[]): string[] => {
  const seen = new Set(known);
  const found: string[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
};

/**
 * FR-032 to FR-034: new timelines, then new language codes, then a new `extensions` block, then
 * storyboard views outside the set (a view already listed as a timeline is not listed again).
 */
function triggersOf(
  scan: ProgramScan,
  known: ApprovedSet,
  storyboardViews: readonly string[] = []
): Trigger[] {
  const timelines = newNames(scan.timelines, known.timelines);
  return [
    ...timelines.map(name => ({ addition: 'view' as const, name })),
    ...newNames(scan.languages, known.languages).map(name => ({
      addition: 'language' as const,
      name,
    })),
    ...(scan.extensions && !known.extensions
      ? [{ addition: 'host-module' as const, name: '' }]
      : []),
    ...newNames(storyboardViews, [...known.timelines, ...timelines]).map(name => ({
      addition: 'view' as const,
      name,
    })),
  ];
}

const RUNS: Verdict = { verdict: 'runs' };

const refused = (code: GateCode): Verdict => ({ verdict: 'refused', code });

/** Runs unless the program (or, with `storyboardViews`, its storyboard) has an addition. */
function unlessAddition(
  scan: ProgramScan | undefined,
  known: ApprovedSet,
  storyboardViews?: readonly string[]
): Verdict {
  if (scan === undefined) return RUNS;
  const triggers = triggersOf(scan, known, storyboardViews);
  return triggers.length === 0
    ? RUNS
    : { verdict: 'refused', code: 'addition-not-briefed', triggers };
}

const setOf = (entry: RecordEntry): ApprovedSet => ({
  timelines: entry.timelines,
  languages: entry.languages,
  extensions: entry.extensions,
});

/** FR-012 rows 1 to 9, the first that matches; pure. */
export function gateVerdict(input: GateInput): Verdict {
  const { scan, entry, brief, additions, storyboardViews } = input;
  if (brief === undefined) {
    // Row 1 (known) or row 2.
    return entry === undefined
      ? refused('brief-required')
      : unlessAddition(scan, union(setOf(entry), additions));
  }
  if (entry !== undefined) {
    // Rows 3 and 4, every `via`, whatever the brief's state: measured against the entry.
    return unlessAddition(scan, union(setOf(entry), additions), storyboardViews);
  }
  // Rows 5 to 9: a governed program that is not known.
  if (brief.state === 'open') return refused('brief-incomplete');
  if (brief.confirmation === 'invalid' && brief.changed.length > 0) return refused('brief-changed');
  if (brief.state === 'complete') return refused('brief-not-confirmed');
  if (brief.state === 'confirmed') return refused('storyboard-not-approved');
  return unlessAddition(scan, union(brief.approvedSet, additions), storyboardViews);
}

/** The vias an approval writes (FR-031, FR-040, FR-049). */
const APPROVED_VIAS: ReadonlySet<Via> = new Set<Via>(['brief', 'addition', 'adopted']);

/** Case-insensitive on Windows only, as `isInside` compares (`paths.ts`). */
const comparable = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

/**
 * P21 / FR-033: the directory counts as briefed and approved for storyboard-view triggers when
 * its brief computes `approved`, or when the record holds a program of that directory written by
 * an approval (`via` brief, addition or adopted), whatever later edits did to the brief. Pure.
 */
export function approvedDirectory(
  record: ProgramRecord,
  root: string,
  dir: string,
  state: BriefStateName
): boolean {
  if (state === 'approved') return true;
  if ('invalid' in record) return false;
  const target = comparable(path.resolve(dir));
  return record.programs.some(
    entry =>
      APPROVED_VIAS.has(entry.via) &&
      comparable(path.dirname(path.resolve(root, entry.path))) === target
  );
}

/**
 * FR-009 / R-15: a known program's scan against its entry ∪ the directory's approved additions.
 * A rename is every new timeline name matched by a disappeared one, and nothing else new;
 * anything more is an addition, with the triggers in the gate's order. Pure.
 */
export function classifyKnownChange(
  scan: ProgramScan,
  entry: RecordEntry,
  additions: ApprovedSet
): KnownChange {
  const known = union(setOf(entry), additions);
  const present = new Set(scan.timelines);
  const added = newNames(scan.timelines, known.timelines);
  const removed = entry.timelines.filter(name => !present.has(name));
  const newLanguages = newNames(scan.languages, known.languages);
  const newExtensions = scan.extensions && !known.extensions;
  if (newLanguages.length === 0 && !newExtensions) {
    if (added.length === 0 && removed.length === 0) return { change: 'unchanged' };
    if (added.length <= removed.length) return { change: 'rename' };
  }
  return { change: 'addition', triggers: triggersOf(scan, known) };
}

/** FR-011: a main brief has an idea, an answer outside the addition sections, or a confirmation line. */
export function isMainBrief(brief: BriefState): boolean {
  return brief.idea !== undefined || brief.answers.length > 0 || brief.confirmation !== undefined;
}

/** FR-011: a main brief governs; an adopted one (FR-041) only once it is approved. */
export function governs(brief: BriefState, state: BriefStateName): boolean {
  return isMainBrief(brief) && (brief.scope !== 'adopt' || state === 'approved');
}

/** FR-032, FR-040: the approved set of a directory's approved addition sections. */
export function approvedAdditionSet(
  additions: readonly AdditionState[],
  stateOf: (addition: AdditionState) => BriefStateName
): ApprovedSet {
  const approved = additions.filter(addition => stateOf(addition) === 'approved');
  return {
    timelines: approved.filter(a => a.kind === 'view').map(a => a.name),
    languages: approved.filter(a => a.kind === 'language').map(a => a.name),
    extensions: approved.some(a => a.kind === 'host-module'),
  };
}

// ---------------------------------------------------------------------------------------------
// Part 2: the reads (plan §8 "checkPrograms", "cliBriefWarnings", "ProjectBrief").

/** The brief state a gated call notes for its telemetry line (FR-057, P13). */
export interface BriefNote {
  readonly state: 'none' | BriefStateName;
  readonly gate?: GateCode;
}

/** One program's evaluated inputs. */
export interface ProgramGate {
  readonly file: string;
  readonly dir: string;
  readonly briefFile: string;
  /** The governing brief's computed state, `none` when no brief governs. */
  readonly state: 'none' | BriefStateName;
  readonly input: GateInput;
  readonly verdict: Verdict;
  readonly parsed: ParsedBrief | undefined;
  readonly evaluation: Evaluation | undefined;
}

export interface GateContext {
  readonly record: RecordStore;
  readonly stateDir: string;
  readonly noteBrief: (brief: BriefNote) => void;
}

/** FR-056: the brief section of one program in `eligian_project`. */
export interface ProjectBrief {
  readonly file: string | null;
  readonly state: 'none' | BriefStateName;
  readonly counts?: Counts;
  readonly next: string;
  readonly known: boolean;
  readonly gate: 'runs' | GateCode;
}

/** The value of an answered instance (a settled answer or a code fact), else `undefined`. */
const answeredValue = (evaluation: Evaluation, id: string): AnswerValue | undefined => {
  const instance = evaluation.instances.find(i => i.id === id);
  return instance?.status === 'answered' ? instance.value : undefined;
};

const rowsOf = (value: AnswerValue | undefined): readonly Readonly<Record<string, string>>[] =>
  Array.isArray(value)
    ? (value as readonly unknown[]).filter(
        (row): row is Readonly<Record<string, string>> =>
          typeof row === 'object' && row !== null && !Array.isArray(row)
      )
    : [];

/** FR-032: the approved set of a brief: S2's names, L1's codes, H1 ≠ `none`. */
function approvedSetOf(evaluation: Evaluation): ApprovedSet {
  const h1 = answeredValue(evaluation, 'H1');
  return {
    timelines: evaluation.views,
    languages: rowsOf(answeredValue(evaluation, 'L1'))
      .map(row => row.code)
      .filter((code): code is string => typeof code === 'string'),
    extensions: Array.isArray(h1) && h1.length > 0,
  };
}

/**
 * The context of an addition's scoped tree (FR-036, R-8): the main brief's settled answers and
 * code facts, and the timelines the record knows for the directory's programs.
 */
export function scopeContextOf(main: Evaluation, timelines: readonly string[]): ScopeContext {
  return { get: id => answeredValue(main, id), timelines };
}

/**
 * An addition section evaluated over its scoped tree (P11): its own answers and signed lines, the
 * fixed view list of a view addition and its heading as the HMAC section.
 */
export function evaluateAddition(
  brief: BriefState,
  addition: AdditionState,
  facts: Facts,
  context: ScopeContext
): { readonly tree: readonly Question[]; readonly evaluation: Evaluation } {
  const scope: AdditionScope = { addition: addition.kind, name: addition.name };
  const tree = scopedTree(scope, context);
  const section: BriefState = {
    treeVersion: brief.treeVersion,
    answers: addition.answers,
    additions: [],
    ...(addition.confirmation === undefined ? {} : { confirmation: addition.confirmation }),
    ...(addition.approval === undefined ? {} : { approval: addition.approval }),
  };
  const scopedFacts: Facts = {
    ...facts,
    section: additionHeading(scope),
    ...(scope.addition === 'view' ? { views: [scope.name] } : {}),
  };
  return { tree, evaluation: evaluate(tree, section, scopedFacts) };
}

/** The timelines the record lists for the programs of `dir`. */
function timelinesIn(record: ProgramRecord | undefined, root: string, dir: string): string[] {
  if (record === undefined || 'invalid' in record) return [];
  const target = comparable(path.resolve(dir));
  return record.programs
    .filter(entry => comparable(path.dirname(path.resolve(root, entry.path))) === target)
    .flatMap(entry => entry.timelines);
}

/**
 * How the reads treat a failure: `strict` (the gate fails closed: any errno other than a missing
 * file rejects) or `lenient` (the CLI and `eligian_project`: unreadable or unparsable is absent).
 */
type Reading = 'strict' | 'lenient';

const errnoOf = (cause: unknown): unknown =>
  typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : undefined;

/** The file's text; `undefined` when it is missing (or unreadable, when lenient). */
async function readText(file: string, reading: Reading): Promise<string | undefined> {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch (cause) {
    const code = errnoOf(cause);
    if (code === 'ENOENT' || code === 'ENOTDIR' || reading === 'lenient') return undefined;
    throw cause;
  }
}

/** `parseBrief`; a throw is a defect when strict and no brief when lenient. */
function parseWith(text: string, reading: Reading): ParsedBrief | undefined {
  if (reading === 'strict') return parseBrief(text);
  try {
    return parseBrief(text);
  } catch {
    return undefined;
  }
}

/** What a directory's `BRIEF.md` (and `STORYBOARD.md`) mean for its programs (FR-011). */
interface Governance {
  readonly dir: string;
  readonly briefFile: string;
  readonly parsed: ParsedBrief | undefined;
  readonly facts: Facts;
  /** The main brief's evaluation; an absent file is the empty brief. */
  readonly evaluation: Evaluation;
  readonly governing: GoverningBrief | undefined;
  readonly additions: ApprovedSet;
  readonly context: ScopeContext;
  readonly storyboardViews: readonly string[] | undefined;
}

/**
 * The governance of `dir` (FR-011, FR-032, FR-040, P21). `record` is `undefined` for the CLI,
 * which ignores storyboard views (they are addition triggers only, FR-053).
 */
async function governanceOf(
  root: string,
  dir: string,
  key: Buffer | undefined,
  record: ProgramRecord | undefined,
  reading: Reading
): Promise<Governance> {
  const briefFile = path.join(dir, BRIEF_FILE);
  const text = await readText(briefFile, reading);
  const parsed = text === undefined ? undefined : parseWith(text, reading);
  const plain = makeFacts(root, dir);
  const facts: Facts = key === undefined ? plain : { ...plain, signer: makeSigner(key) };
  const brief = parsed?.brief ?? EMPTY_BRIEF;
  const evaluation = evaluate(TREE, brief, facts);
  const governing: GoverningBrief | undefined = governs(brief, evaluation.state)
    ? {
        state: evaluation.state,
        confirmation: evaluation.confirmationStatus,
        changed: evaluation.changed,
        approvedSet: approvedSetOf(evaluation),
      }
    : undefined;
  const context = scopeContextOf(evaluation, timelinesIn(record, root, dir));
  const additions = approvedAdditionSet(
    brief.additions ?? [],
    addition => evaluateAddition(brief, addition, facts, context).evaluation.state
  );
  let storyboardViews: readonly string[] | undefined;
  if (
    record !== undefined &&
    isMainBrief(brief) &&
    approvedDirectory(record, root, dir, evaluation.state)
  ) {
    const storyboard = await readText(path.join(dir, 'STORYBOARD.md'), reading);
    storyboardViews = storyboard === undefined ? undefined : readStoryboard(storyboard).views;
  }
  return {
    dir,
    briefFile,
    parsed,
    facts,
    evaluation,
    governing,
    additions,
    context,
    storyboardViews,
  };
}

/** A program's gate with the governance it was decided under (module-internal). */
interface Gated extends ProgramGate {
  readonly governance: Governance;
}

/**
 * One program's gate, or `undefined` for a library. `init`: `eligian_init`'s target, not read and
 * not checked for triggers (P16). One governance per directory per call (`cache`).
 */
async function gateOf(
  root: string,
  file: string,
  record: ProgramRecord,
  key: Buffer | undefined,
  cache: Map<string, Promise<Governance>>,
  reading: Reading,
  init: boolean
): Promise<Gated | undefined> {
  let scan: ProgramScan | undefined;
  if (!init) {
    // Strict: a matched program that cannot be read fails the call (`io`).
    const source =
      reading === 'strict' ? await fsp.readFile(file, 'utf8') : await readText(file, reading);
    scan = source === undefined ? undefined : scanProgram(source);
    if (scan?.library === true) return undefined;
  }
  const dir = path.dirname(path.resolve(file));
  const dirKey = comparable(dir);
  let pending = cache.get(dirKey);
  if (pending === undefined) {
    pending = governanceOf(root, dir, key, record, reading);
    cache.set(dirKey, pending);
  }
  const governance = await pending;
  const input: GateInput = {
    scan,
    entry: entryFor(record, root, file),
    brief: governance.governing,
    additions: governance.additions,
    ...(governance.storyboardViews === undefined
      ? {}
      : { storyboardViews: governance.storyboardViews }),
  };
  return {
    file,
    dir,
    briefFile: governance.briefFile,
    state: governance.governing === undefined ? 'none' : governance.evaluation.state,
    input,
    verdict: gateVerdict(input),
    parsed: governance.parsed,
    evaluation: governance.evaluation,
    governance,
  };
}

/** Every program of `files` (libraries skipped), in order. */
async function gatesOf(
  root: string,
  files: readonly string[],
  record: ProgramRecord,
  key: Buffer | undefined,
  reading: Reading,
  init: boolean
): Promise<readonly Gated[]> {
  const cache = new Map<string, Promise<Governance>>();
  const gates: Gated[] = [];
  for (const file of files) {
    const gate = await gateOf(root, file, record, key, cache, reading, init);
    if (gate !== undefined) gates.push(gate);
  }
  return gates;
}

const codeOf = (verdict: Verdict): GateCode | undefined =>
  verdict.verdict === 'refused' ? verdict.code : undefined;

/** The FR-017 `next` instruction of a refusal. */
function nextOf(code: GateCode, dir: string, scope: Trigger | undefined): string {
  const call = (action: string) =>
    `call \`eligian_brief\` with \`action: ${action}\` and \`directory: ${dir}\``;
  switch (code) {
    case 'brief-required':
      return `Ask the user for their idea and call \`eligian_brief\` with \`action: status\`, \`directory: ${dir}\` and the idea verbatim. If this program did not come from you, ask the user and call \`eligian_brief\` with \`action: accept-existing\`.`;
    case 'brief-incomplete':
      return `Ask the user the questions of \`round\` in one message, each with your recommended answer, then ${call('answer')}.`;
    case 'brief-not-confirmed':
      return `Show the user the counts, the delegated answers and the brief, then ${call('confirm')}.`;
    case 'brief-changed':
      return `Show the user the answers in \`changed\`, then ${call('confirm')} to confirm them again.`;
    case 'storyboard-not-approved':
      return `Draft STORYBOARD.md beside the brief (\`eligian_docs\` id \`storyboard\`), then ${call('approve-storyboard')}.`;
    case 'addition-not-briefed':
      return `The program adds what \`additions\` lists. Ask the user the questions of \`round\` in one message, then call \`eligian_brief\` with \`action: answer\`, \`directory: ${dir}\` and \`scope: ${JSON.stringify(scope ?? {})}\`.`;
  }
}

/** FR-017: the payload of a refusal, for its first refused program; reads nothing. */
function refusalOf(refused: readonly Gated[]): GateRefusal {
  const first = refused[0];
  const code = codeOf(first.verdict) as GateCode;
  const { governance } = first;
  const triggers = first.verdict.verdict === 'refused' ? (first.verdict.triggers ?? []) : [];
  const scope = code === 'addition-not-briefed' ? triggers[0] : undefined;
  let round: readonly RoundItem[];
  if (code === 'brief-required') {
    round = pickRound(TREE, evaluate(TREE, EMPTY_BRIEF, governance.facts), 7);
  } else if (scope !== undefined) {
    // FR-015: the addition's section as it is, or an empty one; nothing is created.
    const brief = governance.parsed?.brief ?? EMPTY_BRIEF;
    const heading = additionHeading(scope);
    const section: AdditionState = brief.additions?.find(a => a.heading === heading) ?? {
      kind: scope.addition,
      name: scope.name,
      heading,
      answers: [],
    };
    const scoped = evaluateAddition(brief, section, governance.facts, governance.context);
    round = pickRound(scoped.tree, scoped.evaluation, 7);
  } else {
    round = pickRound(TREE, governance.evaluation, 7);
  }
  return {
    code,
    program: first.file,
    refused: refused.map(gate => ({ program: gate.file, code: codeOf(gate.verdict) as GateCode })),
    brief: first.briefFile,
    directory: first.dir,
    state: first.state,
    round,
    ...(scope === undefined
      ? {}
      : {
          scope: { addition: scope.addition, name: scope.name },
          additions: triggers.map(t => ({ addition: t.addition, name: t.name })),
        }),
    ...(code === 'brief-changed' ? { changed: governance.evaluation.changed } : {}),
    next: nextOf(code, first.dir, scope),
  };
}

const keyFileOf = (stateDir: string): string => path.join(stateDir, 'brief-key');

/**
 * FR-010, FR-014 to FR-017: the gate of a generation tool, before anything else. Reads the record
 * (after the first-run scan), the key, each program and each directory's `BRIEF.md` once; notes
 * the first refused (else first) program's brief state; fails `ToolGateRefused` listing every
 * refused program when any is. Never writes (FR-015).
 */
export const checkPrograms = (
  root: ProjectRoot,
  files: readonly string[],
  context: GateContext,
  options: { readonly init?: true } = {}
): Effect.Effect<readonly ProgramGate[], ToolError> =>
  Effect.gen(function* () {
    yield* context.record.ensureScanned(root.root);
    const record = yield* context.record.read(root.root);
    const key = yield* Effect.tryPromise({
      try: () => readKey(context.stateDir),
      catch: toToolError('write', keyFileOf(context.stateDir)),
    });
    const gates = yield* Effect.tryPromise({
      // A program the gate reads is a tool input: ENOENT is not-found, naming the file (T028 ruling)
      try: () => gatesOf(root.root, files, record, key, 'strict', options.init === true),
      catch: toToolError('read'),
    });
    const refused = gates.filter(gate => gate.verdict.verdict === 'refused');
    const noted = refused.length > 0 ? refused[0] : gates[0];
    if (noted !== undefined) {
      const code = codeOf(noted.verdict);
      yield* Effect.sync(() =>
        context.noteBrief({ state: noted.state, ...(code === undefined ? {} : { gate: code }) })
      );
    }
    if (refused.length === 0) return gates;
    const gate = refusalOf(refused);
    const problem = 'invalid' in record ? ` (${record.invalid})` : '';
    return yield* new ToolGateRefused({
      message: `${gate.code}: ${gate.program}${problem}`,
      path: gate.program,
      gate,
    });
  });

/**
 * FR-056: the brief section of one program, from the same functions as the gate. Lenient: an
 * unreadable `BRIEF.md` is no brief, so `eligian_project` always succeeds.
 */
export async function briefStatusOf(
  root: string,
  file: string,
  record: ProgramRecord,
  key: Buffer | undefined
): Promise<ProjectBrief> {
  const gate = await gateOf(root, file, record, key, new Map(), 'lenient', false);
  if (gate === undefined) {
    return {
      file: null,
      state: 'none',
      next: 'A library is not gated.',
      known: entryFor(record, root, file) !== undefined,
      gate: 'runs',
    };
  }
  const code = codeOf(gate.verdict);
  const governed = gate.input.brief !== undefined;
  const scope = gate.verdict.verdict === 'refused' ? (gate.verdict.triggers ?? [])[0] : undefined;
  return {
    file: governed ? gate.briefFile : null,
    state: gate.state,
    ...(governed ? { counts: gate.governance.evaluation.counts } : {}),
    next:
      code === undefined
        ? 'The generation tools run on this program.'
        : nextOf(code, gate.dir, scope),
    known: gate.input.entry !== undefined,
    gate: code ?? 'runs',
  };
}

/** A path relative to `cwd` with `/`; `.` for `cwd` itself (FR-054). */
const relativeTo = (cwd: string, p: string): string => {
  const relative = toGlobPath(path.relative(path.resolve(cwd), p));
  return relative === '' ? '.' : relative;
};

/** The record nearest to `dir` for the CLI: an unparsable or unreadable one is none (FR-055). */
async function cliRecordOf(
  dir: string
): Promise<{ readonly record: ProgramRecord; readonly root: string } | undefined> {
  const file = findRecordFile(dir);
  if (file === undefined) return undefined;
  const text = await readText(file, 'lenient');
  if (text === undefined) return undefined;
  const record = parseRecord(text);
  return 'invalid' in record ? undefined : { record, root: path.dirname(path.dirname(file)) };
}

/** One program's FR-054 line, or `undefined`. Throws on a read failure (the caller drops it). */
async function cliWarningOf(
  file: string,
  cwd: string,
  key: Buffer | undefined
): Promise<string | undefined> {
  const scan = scanProgram(await fsp.readFile(file, 'utf8'));
  if (scan.library) return undefined;
  const dir = path.dirname(path.resolve(file));
  const found = await cliRecordOf(dir);
  const root = found?.root ?? (isInside(cwd, dir) ? path.resolve(cwd) : dir);
  const governance = await governanceOf(root, dir, key, undefined, 'lenient');
  // FR-053: with no record, an ungoverned program counts as known (no line) and a governed one
  // as not known.
  if (found === undefined && governance.governing === undefined) return undefined;
  const verdict = gateVerdict({
    scan,
    entry: found === undefined ? undefined : entryFor(found.record, found.root, file),
    brief: governance.governing,
    additions: governance.additions,
  });
  const code = codeOf(verdict);
  if (code === undefined || code === 'addition-not-briefed') return undefined;
  const state = governance.governing === undefined ? 'none' : governance.evaluation.state;
  const call = JSON.stringify({ action: 'status', directory: relativeTo(cwd, dir) });
  return `eligian: ${relativeTo(cwd, file)} — BRIEF.md is ${state}; the open questions: eligian_brief ${call}`;
}

/**
 * FR-053 to FR-055: the CLI's warning lines for `files`, in order. Reads the record, `BRIEF.md`
 * and the key only (`readKey`, never `ensureKey`); a failure for one program prints nothing for
 * it. Never throws, never writes.
 */
export async function cliBriefWarnings(
  files: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string[]> {
  let key: Buffer | undefined;
  try {
    key = await readKey(stateDirectory(env));
  } catch {
    key = undefined;
  }
  const lines: string[] = [];
  for (const file of files) {
    try {
      const line = await cliWarningOf(file, cwd, key);
      if (line !== undefined) lines.push(line);
    } catch {
      // FR-055: a failure to read or parse prints nothing extra.
    }
  }
  return lines;
}

/** `cliBriefWarnings` over the files `patterns` match under `cwd`. */
export async function cliBriefWarningsFor(
  patterns: readonly string[],
  cwd: string
): Promise<string[]> {
  let files: readonly string[];
  try {
    files = await expandPatterns(patterns, cwd);
  } catch {
    return [];
  }
  return cliBriefWarnings(files, cwd);
}
