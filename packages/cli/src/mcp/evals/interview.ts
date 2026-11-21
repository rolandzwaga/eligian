/**
 * Spec 059 Phase 3 (FR-034 to FR-043; plan §9): the interview eval of `evals/mcp/run.ts`. This
 * part reads the persona sheets (`evals/mcp/personas/<name>.json`, FR-037) and turns one into the
 * Phase 1 persona driver's shape (`sheetToPersona`).
 *
 * Plain TypeScript (plan "Constitution check"): no exception crosses the exported API. The evals
 * bundle imports no test file, so the driver's `Persona` is declared here structurally.
 *
 * The turn loop (`runInterview`, FR-035, FR-036, FR-039; plan §9) takes every process as an
 * injected function (the agent turn, the simulated user, the judge), so a fake runner tests it.
 *
 * The measures (FR-038, FR-041 to FR-043; plan §9 "Measures") read the turns' events through
 * `toolEntries`, the `BRIEF.md` snapshots through `parseBrief`, and compare values with the
 * engine's own `validateValue`; the dependents of a changed answer are the engine's `stale`.
 */
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Schema } from 'effect';
import { BRIEF_FILE, EMPTY_PARSED, type ParsedBrief, parseBrief } from '../brief/brief-file.js';
import {
  type Answer,
  type AnswerInput,
  applyAnswers,
  type BriefState,
  type BriefStateName,
  type Evaluation,
  evaluate,
  type Facts,
  nextRound,
  SAME_AS,
} from '../brief/engine.js';
import { makeFacts } from '../brief/facts.js';
import { type Column, type Question, TREE } from '../brief/tree.js';
import { validateValue } from '../brief/values.js';
import { briefStateOf } from './brief-fixture.js';
import type { Isolation } from './harness.js';
import { readMcpLog, type TelemetryLike, type ToolEntry, toolEntries } from './transcript.js';

export type PersonaName = 'terse' | 'detailed' | 'vague';

/** §7.2's three personas, in the order the harness runs them. */
export const PERSONA_NAMES: readonly PersonaName[] = ['terse', 'detailed', 'vague'];

/**
 * How the persona gives an answer (FR-037): `states` says the value; `decides` says "you decide"
 * (the value is the kind of answer the persona would accept); `accepts` says yes to the agent's
 * recommendation (the value is informational).
 */
export type Mode = 'states' | 'decides' | 'accepts';

const MODES: readonly Mode[] = ['states', 'decides', 'accepts'];

export interface SheetValue {
  readonly value: unknown;
  readonly mode: Mode;
}

export interface PersonaSheet {
  readonly idea: string;
  /** The first message to the agent: the idea, in the persona's words. */
  readonly opening: string;
  /** Per question id (`V1:<view>` per view): one answer, or a sequence for repeated asks. */
  readonly answers: Readonly<
    Record<string, SheetValue | { readonly values: readonly SheetValue[] }>
  >;
  /** The later changes, in the Phase 1 fixtures' format. */
  readonly script: readonly {
    readonly afterRound: number;
    readonly answers: readonly { readonly id: string; readonly value: unknown }[];
  }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const has = (record: Record<string, unknown>, key: string): boolean =>
  Object.keys(record).includes(key);

/** An error string naming `where`, or `undefined` for a valid `{ value, mode }`. */
function sheetValueError(entry: unknown, where: string): string | undefined {
  if (!isRecord(entry)) return `${where}: not an object`;
  if (!has(entry, 'value')) return `${where}: no value`;
  if (!MODES.includes(entry.mode as Mode)) {
    return `${where}: mode must be one of ${MODES.join(', ')}, got ${JSON.stringify(entry.mode)}`;
  }
  return undefined;
}

function answersError(answers: unknown): string | undefined {
  if (!isRecord(answers)) return 'answers: not an object';
  for (const id of Object.keys(answers)) {
    const entry = answers[id];
    if (isRecord(entry) && has(entry, 'values')) {
      const values = entry.values;
      if (!Array.isArray(values) || values.length === 0) {
        return `answers.${id}.values: not a non-empty list`;
      }
      for (const [k, item] of values.entries()) {
        const error = sheetValueError(item, `answers.${id}.values[${k}]`);
        if (error !== undefined) return error;
      }
    } else {
      const error = sheetValueError(entry, `answers.${id}`);
      if (error !== undefined) return error;
    }
  }
  return undefined;
}

function scriptError(script: unknown): string | undefined {
  if (!Array.isArray(script)) return 'script: not a list';
  for (const [k, entry] of script.entries()) {
    if (!isRecord(entry)) return `script[${k}]: not an object`;
    if (typeof entry.afterRound !== 'number' || !Number.isInteger(entry.afterRound)) {
      return `script[${k}].afterRound: not an integer`;
    }
    if (!Array.isArray(entry.answers)) return `script[${k}].answers: not a list`;
    for (const [j, answer] of entry.answers.entries()) {
      if (!isRecord(answer) || typeof answer.id !== 'string' || !has(answer, 'value')) {
        return `script[${k}].answers[${j}]: not { id, value }`;
      }
    }
  }
  return undefined;
}

/** A persona sheet, or an error string naming the bad key (FR-037). */
export function parsePersonaSheet(json: unknown): PersonaSheet | string {
  if (!isRecord(json)) return 'the sheet is not an object';
  for (const key of ['idea', 'opening'] as const) {
    if (typeof json[key] !== 'string' || (json[key] as string).trim() === '') {
      return `${key}: not a non-empty string`;
    }
  }
  const error = answersError(json.answers) ?? scriptError(json.script);
  return error ?? (json as unknown as PersonaSheet);
}

/** One answer of the Phase 1 persona driver (`brief-persona-driver.ts`, `PersonaValue`). */
export interface PersonaValue {
  readonly value: unknown;
  readonly delegated?: boolean;
}

/** The Phase 1 persona driver's `Persona` (`brief-persona-driver.ts:32–41`), declared structurally. */
export interface Persona {
  readonly idea: string;
  readonly answers: Readonly<
    Record<string, PersonaValue | { readonly values: readonly PersonaValue[] }>
  >;
  readonly script: readonly {
    readonly afterRound: number;
    readonly answers: readonly (PersonaValue & { readonly id: string })[];
  }[];
}

const toPersonaValue = ({ value, mode }: SheetValue): PersonaValue =>
  mode === 'decides' ? { value, delegated: true } : { value };

/** The sheet as the persona driver plays it: `decides` is delegated, `states` / `accepts` not. */
export function sheetToPersona(sheet: PersonaSheet): Persona {
  const answers: Record<string, PersonaValue | { readonly values: readonly PersonaValue[] }> = {};
  for (const id of Object.keys(sheet.answers)) {
    const entry = sheet.answers[id];
    answers[id] =
      'values' in entry ? { values: entry.values.map(toPersonaValue) } : toPersonaValue(entry);
  }
  return { idea: sheet.idea, answers, script: sheet.script };
}

// ---------------------------------------------------------------------------------------------
// The judge (FR-042)

/** Roadmap §3.1 "Never asked: facts": what the judge flags as `fact: true` when it is asked. */
export const FACT_KINDS: readonly string[] = [
  'What the project already contains: layout ids, CSS classes and custom properties, locale keys, asset files, host module declarations (eligian_project).',
  'Whether a named asset file exists.',
  'The text direction of each language (from its language code).',
  'The installed eligian version and the package manager.',
];

/** One question of an agent message, as the judge read it (FR-042). */
export interface JudgedQuestion {
  readonly text: string;
  /** Every round item the question asks; `[]` when it asks none (a bundled question lists all). */
  readonly ids: readonly string[];
  readonly fact: boolean;
  readonly recommendation: boolean;
  /** FR-069: the agent's numbered item the question sits in; `null` (or absent) for none. */
  readonly item?: number | null;
}

/** The judge's reading of one agent message, or its reply verbatim when that did not parse. */
export type JudgedMessage =
  | {
      readonly turn: number;
      readonly messageIndex: number;
      readonly questions: readonly JudgedQuestion[];
    }
  | { readonly turn: number; readonly messageIndex: number; readonly unparsable: string };

const isJudgedQuestion = (value: unknown): value is JudgedQuestion =>
  isRecord(value) &&
  typeof value.text === 'string' &&
  Array.isArray(value.ids) &&
  value.ids.every(id => typeof id === 'string') &&
  typeof value.fact === 'boolean' &&
  typeof value.recommendation === 'boolean' &&
  (value.item === undefined ||
    value.item === null ||
    (typeof value.item === 'number' && Number.isInteger(value.item) && value.item > 0));

/**
 * The judge's last non-empty line as `{ questions: [{ text, ids, fact, recommendation }] }`;
 * `undefined` on any other shape, the single-`id` form and an `ids` that is not a string list
 * included (FR-042).
 */
export function parseJudgeReply(text: string): readonly JudgedQuestion[] | undefined {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(lines[lines.length - 1]);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) return undefined;
  const questions: unknown[] = parsed.questions;
  if (!questions.every(isJudgedQuestion)) return undefined;
  return questions.map(({ text, ids, fact, recommendation, item }) => ({
    text,
    ids: [...ids],
    fact,
    recommendation,
    ...(item === undefined ? {} : { item }),
  }));
}

/** One agent message judged: its questions, or the reply kept when it does not parse. */
export function toJudgedMessage(turn: number, messageIndex: number, reply: string): JudgedMessage {
  const questions = parseJudgeReply(reply);
  return questions === undefined
    ? { turn, messageIndex, unparsable: reply }
    : { turn, messageIndex, questions };
}

// ---------------------------------------------------------------------------------------------
// The measures (FR-038, FR-041)

/** The answers of the persona's script that fired (FR-039). */
export interface ScriptChange {
  readonly answers: readonly { readonly id: string; readonly value: unknown }[];
}

/** One agent turn as the measures read it (plan §9). */
export interface TurnData {
  readonly turn: number;
  /** This turn's `claude -p` events. */
  readonly events: readonly unknown[];
  /** The turn's result text (P13). */
  readonly message: string | undefined;
  /** `BRIEF.md` after the turn; `undefined` when there is none. */
  readonly brief: string | undefined;
  /** The project's files after the turn (posix, relative, `node_modules` skipped). */
  readonly files: readonly string[];
}

export interface MeasureResult {
  readonly pass: boolean;
  /** `"<where>: <reason>"` per failure. */
  readonly failures: readonly string[];
}

/** Measure 6 (FR-041 item 6). */
export interface ChangedAnswer {
  readonly pass: boolean;
  readonly dependents: readonly string[];
  /** The dependents no judged question of a later turn lists. */
  readonly notReasked: readonly string[];
  readonly reason?: string;
}

/** The six measures of FR-041 (the run record's `measures`). */
export interface InterviewMeasures {
  /** 1. */
  readonly noGenerationBeforeApproval: MeasureResult;
  /** 2. FR-038. */
  readonly nothingAssumed: MeasureResult;
  /** 3. Judged `fact: true` questions, plus one per unparsable message. */
  readonly factsAsked: number;
  /** 4. Judged `recommendation: false` questions, plus one per unparsable message. */
  readonly questionsWithoutRecommendation: number;
  /** 5. Reported, not a pass condition. */
  readonly rounds: {
    readonly messages: number;
    readonly questionsPerMessage: readonly number[];
    readonly roundSizes: readonly number[];
  };
  /** 6. Present only for a sheet with a script (vague). */
  readonly changedAnswer?: ChangedAnswer;
}

export interface InterviewMeasuresInput {
  readonly turns: readonly TurnData[];
  /** The telemetry log (`readMcpLog`), kept with the record; the measures read the events. */
  readonly log: readonly TelemetryLike[];
  readonly sheet: PersonaSheet;
  readonly judged: readonly JudgedMessage[];
  readonly script: { readonly turn: number; readonly roundCount: number } | null;
  readonly facts: Facts;
}

const MCP = 'mcp__eligian__';
const BRIEF_TOOL = `${MCP}eligian_brief`;
const GENERATION_TOOLS = ['init', 'check', 'fmt', 'compile', 'smoke'].map(
  name => `${MCP}eligian_${name}`
);
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit'];

interface TurnEntry {
  readonly turn: number;
  readonly entry: ToolEntry;
}

/** A round item as the judge reads it (`RoundItemSchema`'s `id`, `title`, `ask`, `wire.ts:42`). */
export interface RoundItemLike {
  readonly id: string;
  readonly title: string;
  readonly ask: string;
}

/** The state, round ids and round items of a non-error `eligian_brief` result. */
function briefResultOf(entry: ToolEntry):
  | {
      readonly state: unknown;
      readonly round: readonly string[];
      readonly items: readonly RoundItemLike[];
    }
  | undefined {
  if (entry.name !== BRIEF_TOOL || entry.resultText === undefined || entry.isError === true) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.resultText);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const round: unknown[] = Array.isArray(parsed.round) ? parsed.round : [];
  const items = round.flatMap(item =>
    isRecord(item) && typeof item.id === 'string'
      ? [
          {
            id: item.id,
            title: typeof item.title === 'string' ? item.title : '',
            ask: typeof item.ask === 'string' ? item.ask : '',
          },
        ]
      : []
  );
  return { state: parsed.state, round: items.map(item => item.id), items };
}

const byCodeUnits = (l: string, r: string): number => (l < r ? -1 : l > r ? 1 : 0);

const normalised = (question: Question, value: unknown): unknown => {
  const validated = validateValue(question, value);
  return validated.ok ? validated.value : value;
};

/** The key columns (`kind` not `text`); an all-text table uses its first column (T021 Q1). */
const keyColumns = (columns: readonly Column[]): readonly Column[] => {
  const keys = columns.filter(column => column.kind !== 'text');
  return keys.length > 0 ? keys : columns.slice(0, 1);
};

/**
 * A view name or a table's key text as compared (FR-049, FR-055): surrounding whitespace, case,
 * a leading "the", "a" or "an" and a trailing period ignored.
 */
const folded = (cell: unknown): unknown =>
  typeof cell === 'string'
    ? cell
        .trim()
        .toLowerCase()
        .replace(/^(?:the|an?)\s+/, '')
        .replace(/\.$/, '')
        .trim()
    : cell;

/** FR-055: key-name spellings read as one key (after spaces, hyphens and "arrow" are removed). */
const KEY_ALIASES: Readonly<Record<string, string>> = {
  esc: 'escape',
  return: 'enter',
  spacebar: 'space',
};

/** FR-055: an I2 `key` cell as compared: `ArrowRight`, `right arrow` and `right` are one key. */
const keyName = (cell: unknown): unknown => {
  const text = folded(cell);
  if (typeof text !== 'string') return text;
  const bare = text.replace(/[\s_-]+/g, '').replace(/arrow/g, '');
  return KEY_ALIASES[bare] ?? bare;
};

/**
 * A row on its key columns. View cells are folded (FR-049); so is every key cell of a table
 * (FR-050, FR-055), S2's view names included (its first column), and I2's keys are key names.
 */
const project = (
  row: unknown,
  columns: readonly Column[],
  table: boolean,
  questionId: string
): unknown =>
  isRecord(row)
    ? columns.map(column => {
        const cell = row[column.name];
        if (questionId === 'I2' && column.name === 'key') return keyName(cell);
        return table || column.kind === 'view' ? folded(cell) : cell;
      })
    : row;

/** A table value's rows, projected and serialised; `undefined` when the value is not a list. */
function tableRows(question: Question, value: unknown): ReadonlySet<string> | undefined {
  const v = normalised(question, value);
  if (!Array.isArray(v)) return undefined;
  const columns = keyColumns(question.shape.columns ?? []);
  return new Set(v.map(row => JSON.stringify(project(row, columns, true, question.id))));
}

/** The form two values of `question` are compared in (FR-038); `text` has no value check. */
function comparable(question: Question, value: unknown): string {
  const { shape } = question;
  const v = normalised(question, value);
  switch (shape.kind) {
    case 'text':
      return '';
    case 'set':
      return JSON.stringify(Array.isArray(v) ? v.map(String).sort(byCodeUnits) : v);
    case 'view':
      return JSON.stringify(folded(v));
    case 'record':
      return JSON.stringify(project(v, keyColumns(shape.columns ?? []), false, question.id));
    case 'table': {
      const rows = tableRows(question, value);
      return JSON.stringify(rows === undefined ? v : [...rows].sort(byCodeUnits));
    }
    default:
      return JSON.stringify(v);
  }
}

const same = (question: Question, a: unknown, b: unknown): boolean =>
  comparable(question, a) === comparable(question, b);

/**
 * A recorded value holds a stated one (FR-038, FR-050): for a `table`, every stated row has an
 * equal row in the recorded value (extra recorded rows allowed); for any other kind, `same`.
 */
function holds(question: Question, recorded: unknown, stated: unknown): boolean {
  if (question.shape.kind === 'table') {
    const have = tableRows(question, recorded);
    const want = tableRows(question, stated);
    if (have !== undefined && want !== undefined) return [...want].every(row => have.has(row));
  }
  return same(question, recorded, stated);
}

// FR-049: the views of the sheet, matched to the views of the brief.

/** `V<n>:<view>` (and `V:<view>`, `SAME_AS`): the template and the view. */
const VIEW_ID = /^(V\d*):(.+)$/;

/** The `name` column of an S2 value, in order. */
const viewNamesOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap(row => (isRecord(row) && typeof row.name === 'string' ? [row.name] : []))
    : [];

/**
 * FR-049: each sheet view name (the sheet's S2 `name` column, then the views of its
 * `V<n>:<view>` ids) to a view of `brief`'s S2: the same name; else the same name ignoring case
 * and surrounding whitespace; else the S2 row at the same position. A brief view is matched once,
 * so two sheet views never measure the same view. A sheet view with no match is not in the map.
 */
export function viewMap(sheet: PersonaSheet, brief: BriefState): ReadonlyMap<string, string> {
  const s2 = sheet.answers.S2;
  const named = s2 === undefined ? [] : viewNamesOf(lastOf(s2).value);
  const fromIds = Object.keys(sheet.answers).flatMap(id => {
    const match = VIEW_ID.exec(id);
    return match === null ? [] : [match[2]];
  });
  const sheetViews = [...new Set([...named, ...fromIds])];
  const briefViews = viewNamesOf(brief.answers.find(answer => answer.id === 'S2')?.value);
  return matchNames(sheetViews, briefViews);
}

/**
 * FR-049, FR-055: each sheet name to a brief name: the same name; else the same name folded;
 * else the brief name at the same position. One to one: a brief name is matched once.
 */
function matchNames(
  sheetNames: readonly string[],
  briefNames: readonly string[]
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const taken = new Set<number>();
  const matchBy = (find: (name: string, position: number) => number): void => {
    for (const [position, name] of sheetNames.entries()) {
      if (map.has(name)) continue;
      const at = find(name, position);
      if (at === -1 || taken.has(at)) continue;
      map.set(name, briefNames[at]);
      taken.add(at);
    }
  };
  matchBy(name => briefNames.indexOf(name));
  matchBy(name =>
    briefNames.findIndex((other, at) => !taken.has(at) && folded(other) === folded(name))
  );
  matchBy((_name, position) => (position < briefNames.length ? position : -1));
  return map;
}

/** The `element` column of a V3 value, in order. */
const elementNamesOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap(row => (isRecord(row) && typeof row.element === 'string' ? [row.element] : []))
    : [];

/**
 * FR-055: per sheet view, its V3 elements to the elements of the brief's V3 for the mapped view,
 * matched like views (`matchNames`).
 */
export function elementMap(
  sheet: PersonaSheet,
  brief: BriefState,
  views: ReadonlyMap<string, string>
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const map = new Map<string, ReadonlyMap<string, string>>();
  for (const id of Object.keys(sheet.answers)) {
    const match = VIEW_ID.exec(id);
    if (match === null || match[1] !== 'V3') continue;
    const view = match[2];
    const briefId = `V3:${views.get(view) ?? view}`;
    const recorded = brief.answers.find(answer => answer.id === briefId)?.value;
    map.set(
      view,
      matchNames(elementNamesOf(lastOf(sheet.answers[id]).value), elementNamesOf(recorded))
    );
  }
  return map;
}

/** FR-055: the columns that name an asset as `<view>: <element>`. */
const ELEMENT_COLUMNS: Readonly<Record<string, string>> = { A1: 'asset', A5: 'image' };

/** The tree question of an id (`SAME_AS` for `V:<view>`), before any instance exists. */
const templateOf = (id: string): Question | undefined => {
  const template = VIEW_ID.exec(id)?.[1] ?? id;
  return template === SAME_AS.id ? SAME_AS : TREE.find(question => question.id === template);
};

/** FR-049: a sheet id with its view translated (`V1:hours` → `V1:Hours`); others unchanged. */
const translateId = (map: ReadonlyMap<string, string>, id: string): string => {
  const match = VIEW_ID.exec(id);
  return match === null ? id : `${match[1]}:${map.get(match[2]) ?? match[2]}`;
};

/**
 * FR-049: a sheet value with every view translated: a `view` value, the `view` columns of a
 * record or table, and S2's `name` column. Unmatched names stay as they are.
 */
function translateValue(
  map: ReadonlyMap<string, string>,
  question: Question | undefined,
  value: unknown,
  elements: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map()
): unknown {
  if (question === undefined) return value;
  const view = (cell: unknown): unknown =>
    typeof cell === 'string' ? (map.get(cell) ?? cell) : cell;
  const { shape } = question;
  if (shape.kind === 'view') return view(value);
  // FR-055: `<view>: <element>` through the view map and that view's element map.
  const assetColumn = ELEMENT_COLUMNS[question.id];
  if (assetColumn !== undefined && Array.isArray(value)) {
    const asset = (cell: unknown): unknown => {
      if (typeof cell !== 'string') return cell;
      const at = cell.indexOf(': ');
      if (at === -1) return cell;
      const [name, element] = [cell.slice(0, at), cell.slice(at + 2)];
      return `${map.get(name) ?? name}: ${elements.get(name)?.get(element) ?? element}`;
    };
    return value.map(row =>
      isRecord(row) && has(row, assetColumn)
        ? { ...row, [assetColumn]: asset(row[assetColumn]) }
        : row
    );
  }
  const columns = (shape.columns ?? []).filter(
    column => column.kind === 'view' || (question.id === 'S2' && column.name === 'name')
  );
  if (columns.length === 0) return value;
  const row = (cells: unknown): unknown => {
    if (!isRecord(cells)) return cells;
    const out: Record<string, unknown> = { ...cells };
    for (const { name } of columns) if (has(cells, name)) out[name] = view(cells[name]);
    return out;
  };
  if (shape.kind === 'record') return row(value);
  return shape.kind === 'table' && Array.isArray(value) ? value.map(row) : value;
}

/** The question of an id: its instance's, else `SAME_AS` for `V:<view>` (never a prefix lookup). */
const questionOf = (evaluation: Evaluation, id: string): Question | undefined =>
  evaluation.instances.find(instance => instance.id === id)?.question ??
  (id.startsWith(`${SAME_AS.id}:`) ? SAME_AS : undefined);

/** The last answer of a sheet entry (the last of a `values` list). */
const lastOf = (entry: PersonaSheet['answers'][string]): SheetValue =>
  'values' in entry ? entry.values[entry.values.length - 1] : entry;

/** The answers of the script entries that fired by `script.roundCount`; later entries win. */
function firedAnswers(
  sheet: PersonaSheet,
  script: InterviewMeasuresInput['script']
): ReadonlyMap<string, unknown> {
  const fired = new Map<string, unknown>();
  if (script === null) return fired;
  for (const entry of sheet.script) {
    if (entry.afterRound > script.roundCount) continue;
    for (const answer of entry.answers) fired.set(answer.id, answer.value);
  }
  return fired;
}

/** Measure 1: no generation call and no `.eligian` file before the first `approved` result. */
function noGenerationBeforeApproval(
  turns: readonly TurnData[],
  entries: readonly TurnEntry[]
): MeasureResult {
  const approvedAt = entries.findIndex(({ entry }) => briefResultOf(entry)?.state === 'approved');
  const before = approvedAt === -1 ? entries : entries.slice(0, approvedAt);
  const approvalTurn = approvedAt === -1 ? Number.POSITIVE_INFINITY : entries[approvedAt].turn;
  const failures: string[] = [];
  for (const { turn, entry } of before) {
    if (entry.resultText === undefined || entry.isError === true) continue;
    if (GENERATION_TOOLS.includes(entry.name)) {
      failures.push(`turn ${turn}: ${entry.name.slice(MCP.length)} before approval`);
    }
    const file = entry.input.file_path;
    if (WRITE_TOOLS.includes(entry.name) && typeof file === 'string' && file.endsWith('.eligian')) {
      failures.push(`turn ${turn}: ${entry.name} ${file} before approval`);
    }
  }
  for (const { turn, files } of turns) {
    if (turn >= approvalTurn) continue;
    for (const file of files) {
      if (file.endsWith('.eligian')) failures.push(`turn ${turn}: ${file} exists before approval`);
    }
  }
  return { pass: failures.length === 0, failures };
}

interface Snapshot {
  readonly turn: number;
  readonly brief: BriefState;
}

/**
 * The turns that asked each id: a judged question of the turn lists it (FR-042; since FR-058 and
 * FR-066 the judge may list an earlier item or any question of the tree, so the id need not be in
 * that turn's round).
 */
function askedTurns(judged: readonly JudgedMessage[]): (id: string) => readonly number[] {
  const listed = new Map<number, Set<string>>();
  for (const message of judged) {
    if (!('questions' in message)) continue;
    const ids = listed.get(message.turn) ?? new Set<string>();
    for (const question of message.questions) for (const id of question.ids) ids.add(id);
    listed.set(message.turn, ids);
  }
  return id =>
    [...listed.keys()].filter(turn => listed.get(turn)?.has(id) === true).sort((l, r) => l - r);
}

/** Measure 2 (FR-038). */
function nothingAssumed(
  input: InterviewMeasuresInput,
  snapshots: readonly Snapshot[]
): MeasureResult {
  const final = snapshots[snapshots.length - 1];
  if (final === undefined) return { pass: false, failures: ['BRIEF.md: none after any turn'] };
  const evaluation = evaluate(TREE, final.brief, input.facts);
  const scripted = firedAnswers(input.sheet, input.script);
  const asked = askedTurns(input.judged);
  const views = viewMap(input.sheet, final.brief);
  const elements = elementMap(input.sheet, final.brief, views);
  const sheetIds = new Set<string>();
  const failures: string[] = [];

  /** The first snapshot whose answer for `id` is the final one. */
  const firstRecorded = (id: string, question: Question | undefined, value: unknown) =>
    snapshots.find(({ brief }) => {
      const answer = brief.answers.find(a => a.id === id);
      if (answer === undefined) return false;
      return question === undefined
        ? JSON.stringify(answer.value) === JSON.stringify(value)
        : same(question, answer.value, value);
    })?.turn;

  for (const sheetId of Object.keys(input.sheet.answers)) {
    // FR-049: the sheet's ids and values name the brief's views.
    const id = translateId(views, sheetId);
    sheetIds.add(id);
    const { value, mode } = lastOf(input.sheet.answers[sheetId]);
    const answer = final.brief.answers.find(a => a.id === id);
    if (answer === undefined) {
      if (mode === 'states') failures.push(`${id}: stated by the persona, not in BRIEF.md`);
      continue;
    }
    if (mode === 'decides') {
      if (answer.by !== 'delegated') {
        failures.push(`${id}: by ${answer.by}, but the persona said "you decide"`);
      }
      continue;
    }
    if (answer.by !== 'user') {
      failures.push(
        `${id}: by ${answer.by}, but the persona ${mode === 'states' ? 'stated' : 'accepted'} it`
      );
      continue;
    }
    const question = questionOf(evaluation, id);
    if (mode === 'states') {
      const stated = scripted.has(sheetId) ? scripted.get(sheetId) : value;
      const expected = translateValue(views, templateOf(sheetId), stated, elements);
      if (question === undefined) failures.push(`${id}: not comparable, no question`);
      else if (!holds(question, answer.value, expected)) {
        failures.push(
          `${id}: ${JSON.stringify(answer.value)} is not the sheet's ${JSON.stringify(expected)}`
        );
      }
    }
    const turns = asked(id);
    const recordedAt = firstRecorded(id, question, answer.value);
    if (turns.length === 0) failures.push(`${id}: recorded by user, never asked`);
    else if (recordedAt === undefined || !turns.some(turn => turn < recordedAt)) {
      failures.push(
        `${id}: recorded in turn ${recordedAt}, not after it was asked (turn ${turns[0]})`
      );
    }
  }

  for (const answer of final.brief.answers) {
    if (sheetIds.has(answer.id)) continue;
    if (answer.by === 'user') {
      failures.push(`${answer.id}: by user, but not on the sheet (the persona says "you decide")`);
    }
  }
  return { pass: failures.length === 0, failures };
}

/** An instance's recorded value, given again: the review the engine forces before `confirm`. */
const reviewOf = (instance: {
  readonly id: string;
  readonly answer?: Answer;
}): readonly AnswerInput[] => {
  const { answer } = instance;
  if (answer === undefined) return [];
  return [
    answer.by === 'delegated'
      ? { id: instance.id, value: answer.value, delegated: true }
      : { id: instance.id, value: answer.value },
  ];
};

/**
 * FR-041 item 6: the ids that depend on a changed answer. From `before` (the brief the change
 * was made to), apply the change, take the instances the engine marks `stale`, and repeat to a
 * fixpoint: review every stale instance with its recorded value, evaluate again and add each id
 * newly stale (an answer waiting behind a stale prerequisite goes stale only once that is
 * reviewed). The changed ids are left out.
 */
export function changedAnswerDependents(
  before: ParsedBrief,
  change: ScriptChange,
  facts: Facts
): string[] {
  const changed = change.answers.map(answer => answer.id);
  const input: AnswerInput[] = change.answers.map(({ id, value }) => ({ id, value }));
  let brief = applyAnswers(TREE, before.brief, facts, input, nextRound(before.brief)).brief;
  const collected: string[] = [];
  for (;;) {
    const stale = evaluate(TREE, brief, facts).instances.filter(
      instance => instance.status === 'stale' && !collected.includes(instance.id)
    );
    if (stale.length === 0) break;
    collected.push(...stale.map(instance => instance.id));
    brief = applyAnswers(TREE, brief, facts, stale.flatMap(reviewOf), nextRound(brief)).brief;
  }
  return collected.filter(id => !changed.includes(id));
}

/** Measure 6 (FR-041 item 6); `undefined` for a sheet without a script. */
function changedAnswer(
  input: InterviewMeasuresInput,
  snapshots: readonly Snapshot[]
): ChangedAnswer | undefined {
  if (input.sheet.script.length === 0) return undefined;
  const { script } = input;
  if (script === null) {
    return { pass: false, dependents: [], notReasked: [], reason: 'script-not-applied' };
  }
  const final = snapshots[snapshots.length - 1];
  // FR-049: the script's ids and values name the final brief's views.
  const views = final === undefined ? new Map<string, string>() : viewMap(input.sheet, final.brief);
  const fired = firedAnswers(input.sheet, script);
  const change: ScriptChange = {
    answers: [...fired].map(([id, value]) => ({
      id: translateId(views, id),
      value: translateValue(views, templateOf(id), value),
    })),
  };
  const text = input.turns.find(turn => turn.turn === script.turn)?.brief;
  const dependents = changedAnswerDependents(
    text === undefined ? EMPTY_PARSED : parseBrief(text),
    change,
    input.facts
  );

  const askedAfter = new Set<string>();
  for (const message of input.judged) {
    if (message.turn <= script.turn || !('questions' in message)) continue;
    for (const question of message.questions) for (const id of question.ids) askedAfter.add(id);
  }
  const notReasked = dependents.filter(id => !askedAfter.has(id));

  const evaluation = final === undefined ? undefined : evaluate(TREE, final.brief, input.facts);
  const notApplied = change.answers
    .filter(({ id, value }) => {
      const answer = final?.brief.answers.find(a => a.id === id);
      const question = evaluation === undefined ? undefined : questionOf(evaluation, id);
      return (
        answer === undefined || question === undefined || !holds(question, answer.value, value)
      );
    })
    .map(({ id }) => id);

  return {
    pass: notReasked.length === 0 && notApplied.length === 0,
    dependents,
    notReasked,
    ...(notApplied.length === 0
      ? {}
      : { reason: `the change is not in BRIEF.md: ${notApplied.join(', ')}` }),
  };
}

/** The six measures of FR-041 over one run's turns, judged messages and script record. */
export function interviewMeasures(input: InterviewMeasuresInput): InterviewMeasures {
  const entries: TurnEntry[] = input.turns.flatMap(({ turn, events }) =>
    toolEntries(events).map(entry => ({ turn, entry }))
  );
  const snapshots: Snapshot[] = input.turns.flatMap(({ turn, brief }) =>
    brief === undefined ? [] : [{ turn, brief: parseBrief(brief).brief }]
  );

  // FR-065: measures 3 and 4 end at the turn whose `eligian_brief` result is first `approved`.
  const approvedAt = entries.find(({ entry }) => briefResultOf(entry)?.state === 'approved')?.turn;
  const interviewing = (turn: number): boolean => approvedAt === undefined || turn < approvedAt;

  let factsAsked = 0;
  let withoutRecommendation = 0;
  const questionsPerMessage: number[] = [];
  for (const message of input.judged) {
    if (!('questions' in message)) {
      if (interviewing(message.turn)) {
        factsAsked += 1;
        withoutRecommendation += 1;
      }
      continue;
    }
    if (interviewing(message.turn)) {
      factsAsked += message.questions.filter(question => question.fact).length;
      withoutRecommendation += message.questions.filter(
        question => !question.recommendation
      ).length;
    }
    if (message.questions.length > 0) questionsPerMessage.push(message.questions.length);
  }
  const roundSizes = entries.flatMap(({ entry }) => {
    const size = briefResultOf(entry)?.round.length ?? 0;
    return size > 0 ? [size] : [];
  });

  const changed = changedAnswer(input, snapshots);
  return {
    noGenerationBeforeApproval: noGenerationBeforeApproval(input.turns, entries),
    nothingAssumed: nothingAssumed(input, snapshots),
    factsAsked,
    questionsWithoutRecommendation: withoutRecommendation,
    rounds: { messages: questionsPerMessage.length, questionsPerMessage, roundSizes },
    ...(changed === undefined ? {} : { changedAnswer: changed }),
  };
}

/**
 * R-11: a run passes when it was not aborted, reached `approved`, and measures 1 to 4 hold, and
 * for the vague persona measure 6; measure 5 is reported only.
 */
export function interviewPass(
  m: InterviewMeasures,
  persona: PersonaName,
  aborted: boolean,
  approved: boolean
): boolean {
  return (
    !aborted &&
    approved &&
    m.noGenerationBeforeApproval.pass &&
    m.nothingAssumed.pass &&
    m.factsAsked === 0 &&
    m.questionsWithoutRecommendation === 0 &&
    (persona !== 'vague' || m.changedAnswer?.pass === true)
  );
}

/**
 * FR-043: a persona passes on a strict majority of all its runs; an aborted run is a fail and
 * stays in the denominator (unlike `caseVerdict`, which drops it).
 */
export function interviewVerdict(
  records: readonly { readonly pass: boolean; readonly aborted: boolean }[]
): { pass: boolean; passed: number; of: number } {
  const passed = records.filter(record => record.pass && !record.aborted).length;
  return { pass: passed > records.length / 2, passed, of: records.length };
}

// ---------------------------------------------------------------------------------------------
// The stop rule (FR-035)

/** FR-035 (R-8): a run ends at 30 agent turns. */
export const MAX_AGENT_TURNS = 30;
/** FR-035 (R-8): or once the agent turns took 30 minutes in all (the case agent timeout). */
export const MAX_INTERVIEW_MS = 30 * 60_000;

/** Why a run stopped; `aborted` is a turn with no `result` event, or a process that did not start. */
export type EndReason = 'approved' | 'turn-limit' | 'time-limit' | 'aborted';

const END_REASONS: readonly EndReason[] = ['approved', 'turn-limit', 'time-limit', 'aborted'];

/**
 * FR-035: asked after every agent turn, in this order of precedence: `approved` (the brief on
 * disk), `turn-limit` (30 agent turns), `time-limit` (30 minutes of agent wall time); else go on.
 */
export function interviewStop(input: {
  readonly state: 'none' | BriefStateName;
  readonly agentTurns: number;
  readonly elapsedMs: number;
}): Exclude<EndReason, 'aborted'> | undefined {
  if (input.state === 'approved') return 'approved';
  if (input.agentTurns >= MAX_AGENT_TURNS) return 'turn-limit';
  if (input.elapsedMs >= MAX_INTERVIEW_MS) return 'time-limit';
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// The prompts (FR-039, FR-042)

/** One message of the conversation, as `<scratch>/interview/conversation.json` holds it (FR-035). */
export interface ConversationEntry {
  readonly role: 'user' | 'agent';
  readonly turn: number;
  readonly text: string;
}

/** FR-039: the line that carries a fired script entry into the simulated user's reply. */
export const CHANGED_MIND = 'In this reply, also tell the agent you changed your mind:';

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** FR-059: the heading of the answers the simulated user gives as they are. */
export const FIXED_ANSWERS =
  'Fixed answers (give each of these numbered lines exactly as written, in its place; answer the other questions yourself)';

/**
 * FR-039: the simulated user's prompt: the template (`simulated-user.md`), the persona sheet
 * (without its `script`: the harness fires it, not the model's counting), the conversation so far
 * and the agent's last message; with a fired script, the changed-mind line and its answers.
 */
export function simulatedUserPrompt(input: {
  readonly template: string;
  readonly sheet: PersonaSheet;
  readonly conversation: readonly ConversationEntry[];
  readonly last: string;
  readonly change?: ScriptChange;
  /** FR-059: the `<k>. <answer>` lines of the tagged questions, given as they are. */
  readonly fixed?: string;
}): string {
  const { idea, opening, answers } = input.sheet;
  const parts = [
    input.template.trimEnd(),
    '## Your persona sheet',
    json({ idea, opening, answers }),
    '## The conversation so far',
    json(input.conversation),
    "## The agent's last message",
    input.last,
  ];
  if (input.fixed !== undefined) {
    parts.push(`## ${FIXED_ANSWERS}`, input.fixed);
  }
  const changed = input.change?.answers ?? [];
  if (changed.length > 0) {
    parts.push(
      '## You changed your mind',
      [CHANGED_MIND, ...changed.map(({ id, value }) => `- ${id}: ${JSON.stringify(value)}`)].join(
        '\n'
      )
    );
  }
  return `${parts.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// The built reply (FR-054)

export const YES = 'yes';
export const YOU_DECIDE = 'you decide';

/** One answer of a built reply line: for one judged id, or for a question with none. */
export interface ReplyPart {
  readonly id: string | undefined;
  readonly kind: 'yes' | 'decide' | 'states';
  /** The value to state (`states` only). */
  readonly value?: unknown;
}

/** One numbered line of a built reply: the judge's question and its answer. */
export interface BuiltLine {
  readonly question: string;
  /** FR-069: the judge's `item` for the question. */
  readonly item: number | null;
  readonly parts: readonly ReplyPart[];
  /** The answer as built, without its number. */
  readonly text: string;
}

/** FR-054: a sheet value in plain text, on one line. */
export function renderValue(value: unknown): string {
  if (typeof value === 'string') {
    const lines = value.split(/\r?\n/).filter(line => line.trim() !== '');
    return lines.length > 1 ? lines.map(line => `"${line}"`).join(', then ') : value;
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.length === 0 ? 'none' : value.map(renderValue).join('; ');
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, cell]) => `${key}: ${renderValue(cell)}`)
      .join(', ');
  }
  return JSON.stringify(value);
}

/**
 * FR-054, FR-049: the sheet id a judged id asks about: the id itself, else the `V<n>:<view>`
 * whose sheet view maps to the judged view, else the one whose view is the same folded.
 */
export function sheetIdOf(
  sheet: PersonaSheet,
  views: ReadonlyMap<string, string>,
  id: string
): string | undefined {
  if (has(sheet.answers, id)) return id;
  const match = VIEW_ID.exec(id);
  if (match === null) return undefined;
  const [, template, view] = match;
  for (const [sheetView, briefView] of views) {
    const candidate = `${template}:${sheetView}`;
    if (briefView === view && has(sheet.answers, candidate)) return candidate;
  }
  return Object.keys(sheet.answers).find(key => {
    const other = VIEW_ID.exec(key);
    return other !== null && other[1] === template && folded(other[2]) === folded(view);
  });
}

export interface BuildReplyInput {
  readonly sheet: PersonaSheet;
  /** The view map of FR-049 over the brief after the agent's turn. */
  readonly views: ReadonlyMap<string, string>;
  readonly questions: readonly JudgedQuestion[];
  /** Per sheet id, the asks answered so far; updated here (a `values` entry's position). */
  readonly asks: Map<string, number>;
  /** The fired script answers by sheet id: stated, in place of the sheet's entry. */
  readonly fired: ReadonlyMap<string, unknown>;
}

const partText = (part: ReplyPart): string =>
  part.kind === 'yes' ? YES : part.kind === 'decide' ? YOU_DECIDE : renderValue(part.value);

/**
 * FR-054: one line per judged question: per id, `accepts` gives "yes", `decides` and an id off the
 * sheet "you decide", `states` the value; a question with no ids "you decide". Several ids give
 * `<id>: <answer>` parts, unless all are "yes" or all "you decide".
 */
export function buildReply(input: BuildReplyInput): BuiltLine[] {
  const partFor = (id: string): ReplyPart => {
    const sheetId = sheetIdOf(input.sheet, input.views, id) ?? id;
    if (input.fired.has(sheetId)) {
      return { id, kind: 'states', value: input.fired.get(sheetId) };
    }
    if (!has(input.sheet.answers, sheetId)) return { id, kind: 'decide' };
    const entry = input.sheet.answers[sheetId];
    const n = input.asks.get(sheetId) ?? 0;
    input.asks.set(sheetId, n + 1);
    const given = 'values' in entry ? entry.values[Math.min(n, entry.values.length - 1)] : entry;
    if (given.mode === 'states') return { id, kind: 'states', value: given.value };
    return { id, kind: given.mode === 'accepts' ? 'yes' : 'decide' };
  };
  return input.questions.map(question => {
    const parts: ReplyPart[] =
      question.ids.length === 0 ? [{ id: undefined, kind: 'decide' }] : question.ids.map(partFor);
    const kinds = new Set(parts.map(part => part.kind));
    const text =
      parts.length === 1 || (kinds.size === 1 && !kinds.has('states'))
        ? partText(parts[0])
        : parts.map(part => `${part.id}: ${partText(part)}`).join('; ');
    return { question: question.text, item: question.item ?? null, parts, text };
  });
}

/** FR-059: a line built for a question the judge tagged with at least one id. */
export const isTagged = (line: BuiltLine): boolean =>
  line.parts.some(part => part.id !== undefined);

/** FR-069: one line of the reply: an agent item, or a question in none, and its answer. */
export interface ReplyLine {
  /** `<item>.`, or `"<first words>…":` for a question in no item. */
  readonly label: string;
  /** The questions the line answers. */
  readonly lines: readonly BuiltLine[];
  readonly text: string;
}

/** FR-069: a question's first words, as the label of a line for a question in no item. */
const firstWords = (question: string): string =>
  `"${question
    .replace(/[*`_#>]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')}…":`;

/** FR-069: the answers of an item's questions: one "yes" / "you decide" when all agree. */
const joined = (lines: readonly BuiltLine[]): string => {
  const texts = lines.map(line => line.text);
  const same = texts.every(text => text === texts[0]) && [YES, YOU_DECIDE].includes(texts[0]);
  return texts.length === 1 || same ? texts[0] : texts.join('; ');
};

/**
 * FR-069: the reply's lines. With an item number on some question: one line per item, in
 * ascending order, then one per question in no item; with none, one per question, numbered.
 */
export function replyLines(lines: readonly BuiltLine[]): ReplyLine[] {
  if (!lines.some(line => typeof line.item === 'number')) {
    return lines.map((line, k) => ({ label: `${k + 1}.`, lines: [line], text: line.text }));
  }
  const items = [
    ...new Set(lines.flatMap(line => (typeof line.item === 'number' ? [line.item] : []))),
  ].sort((l, r) => l - r);
  return [
    ...items.map(item => {
      const inItem = lines.filter(line => line.item === item);
      return { label: `${item}.`, lines: inItem, text: joined(inItem) };
    }),
    ...lines
      .filter(line => typeof line.item !== 'number')
      .map(line => ({ label: firstWords(line.question), lines: [line], text: line.text })),
  ];
}

/** FR-059, FR-069: a reply line every question of which is tagged. */
export const isTaggedLine = (line: ReplyLine): boolean => line.lines.every(isTagged);

/** FR-054, FR-069: the reply lines as text. */
export const numberedReply = (reply: readonly ReplyLine[]): string =>
  reply.map(line => `${line.label} ${line.text}`).join('\n');

/**
 * FR-059, FR-069: the fixed answers the simulated user gives as they are: each tagged line, and
 * for a line with tagged and untagged questions, the tagged questions' answers by their first
 * words; `undefined` when no question is tagged.
 */
export function fixedAnswers(reply: readonly ReplyLine[]): string | undefined {
  const fixed = reply.flatMap(line =>
    isTaggedLine(line)
      ? [`${line.label} ${line.text}`]
      : line.lines
          .filter(isTagged)
          .map(part => `${line.label} (the part ${firstWords(part.question)}) ${part.text}`)
  );
  return fixed.length === 0 ? undefined : fixed.join('\n');
}

/**
 * FR-059, FR-069: the simulated user's reply with the line of each tagged reply line, found by its
 * label, replaced by the built one (appended when the reply has no line with that label); other
 * lines, such as a changed-mind block, stay.
 */
export function withFixedAnswers(reply: readonly ReplyLine[], text: string): string {
  const out = text.split(/\r?\n/);
  const missing: string[] = [];
  for (const line of reply) {
    if (!isTaggedLine(line)) continue;
    const built = `${line.label} ${line.text}`;
    const at = out.findIndex(candidate => candidate.trimStart().startsWith(line.label));
    if (at === -1) missing.push(built);
    else out[at] = built;
  }
  return [...out, ...missing].join('\n');
}

/** FR-054, FR-039: the changed-mind lines a fired script appends to a built reply. */
export function changedMindLines(change: ScriptChange): string {
  return [
    'I changed my mind:',
    ...change.answers.map(({ id, value }) => {
      const title = templateOf(id)?.title;
      return `- ${title === undefined ? id : `${id} (${title})`}: ${renderValue(value)}`;
    }),
  ].join('\n');
}

/** FR-066: every question of the tree for the judge; a per-view one as `V<n>:<view>`. */
export const TREE_ITEMS: readonly { readonly id: string; readonly title: string }[] = TREE.map(
  question => ({
    id: /^V\d+$/.test(question.id) ? `${question.id}:<view>` : question.id,
    title: question.title,
  })
);

/** FR-042: no `eligian_project` result before the message. */
export const NO_INVENTORY = 'eligian_project not called';

/**
 * FR-042: the round-message judge's prompt: the template (`interview-judge.md`), the facts list
 * of roadmap §3.1, the inventory (the last `eligian_project` result, or "eligian_project not
 * called") with the file list of the previous turn, the round items and the agent's message.
 */
export function judgePrompt(input: {
  readonly template: string;
  readonly facts: readonly string[];
  readonly inventory: string | undefined;
  readonly files: readonly string[];
  readonly round: readonly RoundItemLike[];
  /** FR-058: the items of earlier rounds, not in `round`. */
  readonly earlier?: readonly RoundItemLike[];
  /** FR-066: every question of the tree (`TREE_ITEMS`). */
  readonly tree?: readonly { readonly id: string; readonly title: string }[];
  readonly message: string;
}): string {
  const files = input.files.length === 0 ? '(none)' : input.files.join('\n');
  const items = (list: readonly RoundItemLike[], none: string): string =>
    list.length === 0
      ? none
      : list.map(({ id, title, ask }) => `- ${id}: ${title} | ${ask}`).join('\n');
  const round = items(input.round, '(no round items)');
  const earlier = items(input.earlier ?? [], '(no earlier items)');
  const tree = (input.tree ?? []).map(({ id, title }) => `- ${id}: ${title}`).join('\n');
  return `${[
    input.template.trimEnd(),
    '## Facts (the agent looks these up; asking the user one is a fact question)',
    input.facts.map(fact => `- ${fact}`).join('\n'),
    '## The project inventory at this message',
    input.inventory ?? NO_INVENTORY,
    '## The project files after the previous turn',
    files,
    '## The round items of the last eligian_brief result',
    round,
    '## The earlier items (asked in an earlier round)',
    earlier,
    '## The other questions of the brief',
    tree === '' ? '(none)' : tree,
    "## The agent's message",
    input.message,
  ].join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// The run record (spec "Key entities")

export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
}

/** One interview run: `results/<run-id>/interview/<persona>-<n>.json` (FR-034). */
export interface InterviewRecord {
  readonly runId: string;
  readonly persona: PersonaName;
  readonly n: number;
  readonly model: string;
  readonly userModel: string;
  readonly cliVersion: string;
  /** The agent turns run. */
  readonly turns: number;
  readonly endReason: EndReason;
  readonly aborted: boolean;
  /** The last `briefStateOf` of the run is `approved`. */
  readonly approved: boolean;
  readonly pass: boolean;
  /** FR-039: the agent turn the changed-mind reply answered and the round count then. */
  readonly script: { readonly turn: number; readonly roundCount: number } | null;
  /** The simulated user's replies, in order (kept for review, FR-038). */
  readonly replies: readonly string[];
  readonly judged: readonly JudgedMessage[];
  readonly measures: InterviewMeasures;
  /** What went wrong outside the measures: an aborted turn, a missing reply, a judge call. */
  readonly failures: readonly string[];
  /** The agent turns' tokens summed; null when no result carried usage. */
  readonly usage: Usage | null;
  /** FR-048: the isolation every `claude -p` of the run had. */
  readonly isolation: Isolation;
  /** The agent turns' wall time summed (the time limit's clock). */
  readonly wallMs: number;
}

const MeasureResultSchema = Schema.Struct({
  pass: Schema.Boolean,
  failures: Schema.Array(Schema.String),
});

const JudgedQuestionSchema = Schema.Struct({
  text: Schema.String,
  ids: Schema.Array(Schema.String),
  fact: Schema.Boolean,
  recommendation: Schema.Boolean,
  item: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
});

/** Decodes an interview run record (as `RunRecordSchema`, `harness.ts`). */
export const InterviewRecordSchema: Schema.Codec<InterviewRecord> = Schema.Struct({
  runId: Schema.String,
  persona: Schema.Literals(PERSONA_NAMES),
  n: Schema.Finite,
  model: Schema.String,
  userModel: Schema.String,
  cliVersion: Schema.String,
  turns: Schema.Finite,
  endReason: Schema.Literals(END_REASONS),
  aborted: Schema.Boolean,
  approved: Schema.Boolean,
  pass: Schema.Boolean,
  script: Schema.NullOr(Schema.Struct({ turn: Schema.Finite, roundCount: Schema.Finite })),
  replies: Schema.Array(Schema.String),
  judged: Schema.Array(
    Schema.Union([
      Schema.Struct({
        turn: Schema.Finite,
        messageIndex: Schema.Finite,
        questions: Schema.Array(JudgedQuestionSchema),
      }),
      Schema.Struct({
        turn: Schema.Finite,
        messageIndex: Schema.Finite,
        unparsable: Schema.String,
      }),
    ])
  ),
  measures: Schema.Struct({
    noGenerationBeforeApproval: MeasureResultSchema,
    nothingAssumed: MeasureResultSchema,
    factsAsked: Schema.Finite,
    questionsWithoutRecommendation: Schema.Finite,
    rounds: Schema.Struct({
      messages: Schema.Finite,
      questionsPerMessage: Schema.Array(Schema.Finite),
      roundSizes: Schema.Array(Schema.Finite),
    }),
    changedAnswer: Schema.optionalKey(
      Schema.Struct({
        pass: Schema.Boolean,
        dependents: Schema.Array(Schema.String),
        notReasked: Schema.Array(Schema.String),
        reason: Schema.optionalKey(Schema.String),
      })
    ),
  }),
  failures: Schema.Array(Schema.String),
  usage: Schema.NullOr(
    Schema.Struct({ input_tokens: Schema.Finite, output_tokens: Schema.Finite })
  ),
  isolation: Schema.Struct({
    args: Schema.Array(Schema.String),
    env: Schema.Record(Schema.String, Schema.String),
  }),
  wallMs: Schema.Finite,
});

// ---------------------------------------------------------------------------------------------
// The turn loop (FR-035, FR-036, FR-039; plan §9 `runInterview`, P13, P15)

/** Every process of the loop, injected (SC-020's fake runner). */
export interface InterviewDeps {
  /** One `claude -p` agent turn; `started: false` when the process could not be started. */
  readonly agentTurn: (input: {
    readonly message: string;
    readonly sessionId: string | undefined;
    readonly turn: number;
  }) => Promise<{ readonly stdout: string; readonly started: boolean; readonly wallMs: number }>;
  /**
   * The user model's reply (its `result` text), or `undefined` when there is none: the simulated
   * user of FR-051, or the wording of a built reply (FR-054).
   */
  readonly userReply: (prompt: string) => Promise<string | undefined>;
  /** The round-message judge's reply text, or `undefined` when the call failed. */
  readonly judge: (prompt: string) => Promise<string | undefined>;
  /** `transcript.ts`'s `parseTranscript`. */
  readonly parseTranscript: (text: string) => unknown[];
}

export interface InterviewRun {
  readonly runId: string;
  readonly persona: PersonaName;
  readonly n: number;
  readonly sheet: PersonaSheet;
  readonly model: string;
  readonly userModel: string;
  readonly cliVersion: string;
  readonly projectDir: string;
  /** The key the server signs with (`prepareArmProject`'s `stateDir`). */
  readonly stateDir: string;
  /** Outside the project: `interview/conversation.json` goes here. */
  readonly scratch: string;
  /** `results/<run-id>/interview`. */
  readonly outDir: string;
  readonly mcpLog: string;
  readonly isolation: Isolation;
  /** `simulated-user.md` and `interview-judge.md`, loaded by the runner. */
  readonly prompts: { readonly simulatedUser: string; readonly judge: string };
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The text of `file`, or `undefined` when it cannot be read. */
async function readText(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** The project's files: posix, relative, sorted, `node_modules` skipped. */
async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
      else files.push(relative);
    }
  };
  await walk(root, '');
  return files.sort(byCodeUnits);
}

/** The last `type: 'result'` event (`finalResult`, `run.ts`); `undefined` when there is none. */
function lastResult(events: readonly unknown[]): Record<string, unknown> | undefined {
  for (let k = events.length - 1; k >= 0; k--) {
    const event = events[k];
    if (isRecord(event) && event.type === 'result') return event;
  }
  return undefined;
}

const addUsage = (total: Usage | null, usage: unknown): Usage | null =>
  isRecord(usage) &&
  typeof usage.input_tokens === 'number' &&
  typeof usage.output_tokens === 'number'
    ? {
        input_tokens: (total?.input_tokens ?? 0) + usage.input_tokens,
        output_tokens: (total?.output_tokens ?? 0) + usage.output_tokens,
      }
    : total;

/** FR-039: the `eligian_brief` results with a non-empty `round`, over every turn so far. */
const roundCountOf = (turns: readonly TurnData[]): number =>
  turns
    .flatMap(({ events }) => toolEntries(events))
    .filter(entry => (briefResultOf(entry)?.round.length ?? 0) > 0).length;

/** FR-042: the last `eligian_project` result text and the last `eligian_brief` round so far. */
export function judgeContext(entries: readonly ToolEntry[]): {
  inventory: string | undefined;
  round: readonly RoundItemLike[];
  earlier: readonly RoundItemLike[];
} {
  let inventory: string | undefined;
  let round: readonly RoundItemLike[] = [];
  const seen = new Map<string, RoundItemLike>();
  for (const entry of entries) {
    if (entry.name === `${MCP}eligian_project` && entry.resultText !== undefined) {
      inventory = entry.resultText;
    }
    const brief = briefResultOf(entry);
    if (brief === undefined) continue;
    round = brief.items;
    // FR-058: the latest form of every item a round gave, kept in first-seen order.
    for (const item of brief.items) seen.set(item.id, item);
  }
  const inRound = new Set(round.map(item => item.id));
  return { inventory, round, earlier: [...seen.values()].filter(item => !inRound.has(item.id)) };
}

/**
 * FR-035, FR-036, FR-039 (plan §9): turn 1 sends the persona's `opening` as a plain message,
 * every later turn the simulated user's reply on the resumed session. Before each agent turn the
 * conversation is written to `<scratch>/interview/conversation.json` (the persona-mode hook reads
 * it); after it, `<persona>-<n>.turn-<k>.json` (the turn's stdout) and `.brief-<k>.md` (the
 * `BRIEF.md` snapshot), the file list and the brief state on disk; `interviewStop` decides. The
 * script fires in the first reply after the `eligian_brief` round count reaches `afterRound`.
 * Each agent message is judged as it arrives (P13, FR-054); the reply to one with questions is
 * built from the sheet (`buildReply`, worded by the user model), to one without by the simulated
 * user of FR-051. Then the measures, the verdict and `<persona>-<n>.json`. A turn with no `result`, a process that did not start (FR-035) or a
 * missing reply (P15) aborts the run; a rejected injected call counts as that failure.
 */
export async function runInterview(
  run: InterviewRun,
  deps: InterviewDeps
): Promise<InterviewRecord> {
  const base = path.join(run.outDir, `${run.persona}-${run.n}`);
  const conversationFile = path.join(run.scratch, 'interview', 'conversation.json');
  await fs.mkdir(run.outDir, { recursive: true });
  await fs.mkdir(path.dirname(conversationFile), { recursive: true });

  const startFiles = await listFiles(run.projectDir);
  const conversation: ConversationEntry[] = [];
  const messageIndex = new Map<number, number>();
  const turns: TurnData[] = [];
  const replies: string[] = [];
  const failures: string[] = [];
  const firedEntries = new Set<number>();
  let script: InterviewRecord['script'] = null;
  let sessionId: string | undefined;
  let message = run.sheet.opening;
  let elapsedMs = 0;
  let usage: Usage | null = null;
  let state: 'none' | BriefStateName = 'none';
  let endReason: EndReason | undefined;
  const judged: JudgedMessage[] = [];
  const asks = new Map<string, number>();
  const fired = new Map<string, unknown>();

  // FR-042, FR-054 (P13): one judge call per agent turn with a message, made as it arrives.
  const judgeTurn = async (k: number): Promise<JudgedMessage | undefined> => {
    const data = turns[k];
    const index = messageIndex.get(data.turn);
    if (data.message === undefined || data.message.trim() === '' || index === undefined) {
      return undefined;
    }
    const { inventory, round, earlier } = judgeContext(
      turns.slice(0, k + 1).flatMap(({ events }) => toolEntries(events))
    );
    const prompt = judgePrompt({
      template: run.prompts.judge,
      facts: FACT_KINDS,
      inventory,
      files: k === 0 ? startFiles : turns[k - 1].files,
      round,
      earlier,
      tree: TREE_ITEMS,
      message: data.message,
    });
    const reply = await deps.judge(prompt).catch(() => undefined);
    if (reply === undefined) failures.push(`judge: no reply for agent turn ${data.turn}`);
    const message = toJudgedMessage(data.turn, index, reply ?? '');
    judged.push(message);
    return message;
  };

  for (let turn = 1; endReason === undefined; turn++) {
    conversation.push({ role: 'user', turn, text: message });
    await fs.writeFile(conversationFile, `${json(conversation)}\n`);

    const out = await deps
      .agentTurn({ message, sessionId, turn })
      .catch((error: unknown) => ({ stdout: '', started: false, wallMs: 0, error }));
    await fs.writeFile(`${base}.turn-${turn}.json`, out.stdout);
    elapsedMs += out.wallMs;
    const events = out.started ? deps.parseTranscript(out.stdout) : [];
    const final = lastResult(events);
    const text = typeof final?.result === 'string' ? final.result : undefined;
    if (final !== undefined) {
      if (sessionId === undefined && typeof final.session_id === 'string') {
        sessionId = final.session_id;
      }
      usage = addUsage(usage, final.usage);
      messageIndex.set(turn, conversation.length);
      conversation.push({ role: 'agent', turn, text: text ?? '' });
    }

    const brief = await readText(path.join(run.projectDir, BRIEF_FILE));
    if (brief !== undefined) await fs.writeFile(`${base}.brief-${turn}.md`, brief);
    turns.push({ turn, events, message: text, brief, files: await listFiles(run.projectDir) });
    const judgedNow = await judgeTurn(turns.length - 1);
    state = await briefStateOf(run.projectDir, run.stateDir);

    if (!out.started || final === undefined) {
      const cause =
        'error' in out
          ? `the agent turn failed: ${errorText(out.error)}`
          : !out.started
            ? 'claude did not start'
            : 'no result event';
      failures.push(`agent turn ${turn}: ${cause}`);
      endReason = 'aborted';
      break;
    }
    endReason = interviewStop({ state, agentTurns: turn, elapsedMs });
    if (endReason !== undefined) break;

    // FR-039: the script fires deterministically, by the harness's round count.
    const roundCount = roundCountOf(turns);
    const due = run.sheet.script.flatMap((entry, k) =>
      !firedEntries.has(k) && roundCount >= entry.afterRound ? [k] : []
    );
    for (const k of due) firedEntries.add(k);
    const change: ScriptChange | undefined =
      due.length === 0 ? undefined : { answers: due.flatMap(k => run.sheet.script[k].answers) };
    if (change !== undefined && script === null) script = { turn, roundCount };
    for (const answer of change?.answers ?? []) fired.set(answer.id, answer.value);

    // FR-054, FR-059, FR-060: when every question the judge found lists ids, the reply is built
    // from the sheet; otherwise (an untagged question, no question, no judgement) the simulated
    // user of FR-051 answers, the tagged questions' built lines fixed.
    const questions =
      judgedNow !== undefined && 'questions' in judgedNow ? judgedNow.questions : [];
    const views = viewMap(
      run.sheet,
      (brief === undefined ? EMPTY_PARSED : parseBrief(brief)).brief
    );
    // FR-069: the reply follows the agent's numbered items.
    const lines = replyLines(buildReply({ sheet: run.sheet, views, questions, asks, fired }));
    let reply: string | undefined;
    if (lines.length > 0 && lines.every(isTaggedLine)) {
      const answers = numberedReply(lines);
      reply = change === undefined ? answers : `${answers}\n\n${changedMindLines(change)}`;
    } else {
      const fixed = fixedAnswers(lines);
      const prompt = simulatedUserPrompt({
        template: run.prompts.simulatedUser,
        sheet: run.sheet,
        conversation,
        last: text ?? '',
        ...(change === undefined ? {} : { change }),
        ...(fixed === undefined ? {} : { fixed }),
      });
      reply = await deps.userReply(prompt).catch((error: unknown) => {
        failures.push(`simulated user: ${errorText(error)}`);
        return undefined;
      });
      if (reply !== undefined && fixed !== undefined) reply = withFixedAnswers(lines, reply);
    }
    if (reply === undefined) {
      failures.push(`simulated user: no reply to agent turn ${turn}`);
      endReason = 'aborted';
      break;
    }
    replies.push(reply);
    message = reply;
  }

  const aborted = endReason === 'aborted';
  const approved = state === 'approved';
  const measures = interviewMeasures({
    turns,
    log: readMcpLog(run.mcpLog),
    sheet: run.sheet,
    judged,
    script,
    facts: makeFacts(run.projectDir, run.projectDir),
  });
  const record: InterviewRecord = {
    runId: run.runId,
    persona: run.persona,
    n: run.n,
    model: run.model,
    userModel: run.userModel,
    cliVersion: run.cliVersion,
    turns: turns.length,
    endReason: endReason ?? 'aborted',
    aborted,
    approved,
    pass: interviewPass(measures, run.persona, aborted, approved),
    script,
    replies,
    judged,
    measures,
    failures,
    usage,
    isolation: run.isolation,
    wallMs: elapsedMs,
  };
  await fs.writeFile(`${base}.json`, `${json(record)}\n`);
  return record;
}

// ---------------------------------------------------------------------------------------------
// The summary (FR-034, SC-020, SC-023)

/** FR-048: `Isolation: claude <args> with <env>`, the line `renderSummary` prints for the cases. */
const isolationLine = (isolation: Isolation): string =>
  `Isolation: claude ${isolation.args.join(' ')} with ${Object.entries(isolation.env)
    .map(([name, value]) => `${name}=${value}`)
    .join(' ')}`;

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

const SUMMARY_COLUMNS = [
  'Persona',
  'Verdict',
  'Passed',
  'Aborted',
  'Approved',
  '1 no generation',
  '2 nothing assumed',
  '3 facts asked',
  '4 no recommendation',
  '5 messages',
  '6 changed answer',
];

const RUN_COLUMNS = ['Run', 'End', 'Turns', 'Pass', 'Script', 'Round sizes', 'Failures'];

const row = (cells: readonly (string | number)[]): string => `| ${cells.join(' | ')} |`;

/**
 * The interview table of `summary.md` (FR-034, SC-020): one row per persona with
 * `interviewVerdict`'s `passed` / `of`, the runs each pass measure held in (1, 2, 6), the summed
 * counts of measures 3, 4 and 5; then one row per run. The isolation is printed once (SC-023).
 */
export function renderInterviewSummary(
  records: readonly InterviewRecord[],
  isolation: Isolation
): string {
  const runIds = [...new Set(records.map(record => record.runId))];
  const lines = [
    '# Interview eval summary',
    '',
    `Runs: ${runIds.join(', ') || 'none'}`,
    '',
    isolationLine(isolation),
    '',
    row(SUMMARY_COLUMNS),
    row(SUMMARY_COLUMNS.map(() => '---')),
  ];
  for (const persona of PERSONA_NAMES) {
    const runs = records.filter(record => record.persona === persona);
    if (runs.length === 0) continue;
    const verdict = interviewVerdict(runs);
    const held = (holds: (record: InterviewRecord) => boolean): string =>
      `${runs.filter(holds).length}/${runs.length}`;
    const changed = runs.some(record => record.measures.changedAnswer !== undefined);
    lines.push(
      row([
        persona,
        verdict.pass ? 'pass' : 'fail',
        `${verdict.passed}/${verdict.of}`,
        runs.filter(record => record.aborted).length,
        runs.filter(record => record.approved).length,
        held(record => record.measures.noGenerationBeforeApproval.pass),
        held(record => record.measures.nothingAssumed.pass),
        sum(runs.map(record => record.measures.factsAsked)),
        sum(runs.map(record => record.measures.questionsWithoutRecommendation)),
        sum(runs.map(record => record.measures.rounds.messages)),
        changed ? held(record => record.measures.changedAnswer?.pass === true) : '-',
      ])
    );
  }
  lines.push('', row(RUN_COLUMNS), row(RUN_COLUMNS.map(() => '---')));
  for (const record of records) {
    lines.push(
      row([
        `${record.persona}-${record.n}`,
        record.endReason,
        record.turns,
        record.pass ? 'pass' : 'fail',
        record.script === null
          ? '-'
          : `turn ${record.script.turn}, round ${record.script.roundCount}`,
        record.measures.rounds.roundSizes.join(' ') || '-',
        record.failures.length,
      ])
    );
  }
  lines.push('');
  return lines.join('\n');
}
