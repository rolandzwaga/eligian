/**
 * `BRIEF.md`, the file of the brief interview (spec 059 FR-010 unknown views, FR-019 to FR-021;
 * plan §4, P1, P17, P19).
 *
 * - `writeBrief`: the FR-019 layout exactly: `# Brief`, the comment line, the idea as a
 *   blockquote, the header list, the 12 branch sections (answers in tree order, then the kept
 *   answer blocks of that section, P17), one section per S2 view, `## Facts` from the given
 *   snapshot (P1: the state comes in as data), then the kept unknown sections. Blocks are joined
 *   by one blank line and the file ends with a single LF. The header's confirmation and approval
 *   lines are the signed lines of Phase 2 FR-024; a Phase 1 `sha256:` line round-trips as is.
 *   Phase 2 FR-035: the `## Addition: …` sections come after the branch and view sections and
 *   before `## Facts`, in creation order, each with its own `- state:` and signed lines, then its
 *   answer blocks in the order of its scoped tree. A brief that holds only additions (the file an
 *   addition creates in a project with no brief) has no idea and no branch or view section.
 * - `parseBrief`: the inverse. It accepts LF and CRLF and never throws by construction: every
 *   handler is total over its lines, and what it cannot read is reported in `ignored` and kept
 *   verbatim in `kept`, so a write gives it back (FR-020). There is no catch-all (P19): a throw
 *   would be a parser defect, which the tool boundary reports as `internal` before any write.
 *
 * Pure: no I/O, no `effect`. Values are formatted and parsed by `values.ts`.
 */
import type { PackageManager } from '@eligian/shared-utils';
import {
  type AdditionKind,
  type AdditionState,
  type Answer,
  type Approval,
  type BriefState,
  type BriefStateName,
  type By,
  type Confirmation,
  EMPTY_BRIEF,
  SAME_AS,
} from './engine.js';
import { LANGUAGE_CODE } from './references.js';
import { additionHeading, type ScopeContext, scopedTree } from './scoped.js';
import {
  type AnswerValue,
  type AssetEntry,
  BRANCHES,
  type Question,
  TREE,
  TREE_VERSION,
} from './tree.js';
import { escapeCell, formatValue, parseValue } from './values.js';

/** Content the parser could not read, kept verbatim so a write gives it back (FR-020). */
export interface RawBlock {
  /** The `## …` heading it was found under, or `''` in the header. */
  readonly section: string;
  /** Verbatim, LF. */
  readonly text: string;
  /**
   * `answer`: an ignored answer block, written back at the end of its section (P17).
   * `section`: an unknown `##` section (or a view section for a view not in S2), written back
   * after `## Facts`. `text`: lines outside any answer (a malformed header line, text between a
   * section heading and its first answer), written back where they were found.
   */
  readonly kind: 'answer' | 'section' | 'text';
}

export interface Ignored {
  /** 1-based line of the input. */
  readonly line: number;
  readonly reason: string;
}

export interface ParsedBrief {
  readonly brief: BriefState;
  readonly ignored: readonly Ignored[];
  readonly kept: readonly RawBlock[];
}

/** The facts the tool computed for one write (FR-019 `## Facts`); never read back. */
export interface FactsSnapshot {
  /** P1: the state of the brief being written, from its evaluation. */
  readonly state: BriefStateName;
  /**
   * Phase 2 FR-035: the state of each addition section, by its heading (`Addition: view Outro`),
   * from its own evaluation; `open` for a heading it does not hold.
   */
  readonly additionStates?: ReadonlyMap<string, BriefStateName>;
  readonly serverEligian: string;
  /** `-` when undefined (FR-042). */
  readonly eligianInstalled: string | undefined;
  readonly packageManager: PackageManager | undefined;
  /** The L1 codes in L1 order; `-` when undefined (L1 not answered). */
  readonly textDirection:
    | readonly { readonly code: string; readonly direction: 'ltr' | 'rtl' }[]
    | undefined;
  readonly assets: readonly AssetEntry[];
}

export const BRIEF_FILE = 'BRIEF.md';

export const EMPTY_PARSED: ParsedBrief = { brief: EMPTY_BRIEF, ignored: [], kept: [] };

const TITLE = '# Brief';
const COMMENT =
  '<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->';
const FACTS_HEADING = '## Facts';
const FACTS_COMMENT =
  '<!-- Computed by eligian_brief when it writes this file; never read back. -->';
const NO_ANSWERS = '_No answers yet._';
const PER_VIEW = '_One section per view below._';

const UNKNOWN_QUESTION = 'unknown question';
const BAD_VALUE = 'value does not fit its shape';
const MISSING_META = 'missing by or round';
const BAD_META = 'malformed answer lines';
const DUPLICATE = 'duplicate answer';
const BAD_HEADER = 'malformed header line';
const UNKNOWN_VIEW = 'unknown-view';
const UNKNOWN_SECTION = 'unknown section';
const DUPLICATE_ADDITION = 'duplicate addition';
const STRAY_TEXT = 'text outside an answer';

const ISO = String.raw`\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z`;
/** Phase 2 FR-024: `<mode> <ISO> round <n> hmac-sha256:<64 hex>`. */
const CONFIRMATION = new RegExp(
  `^(elicitation|agent-reported) (${ISO}) round ([1-9]\\d{0,14}) (hmac-sha256:[0-9a-f]{64})$`
);
/** A Phase 1 line: parsed, written back as it was, never valid (Phase 2 FR-025). */
const PHASE_1_CONFIRMATION = new RegExp(`^agent-reported (${ISO}) (sha256:[0-9a-f]{64})$`);
const APPROVAL = new RegExp(
  `^(elicitation|agent-reported|existing-storyboard) (${ISO}) (hmac-sha256:[0-9a-f]{64})$`
);
const HEADER_LINE =
  /^- (tree|scope|state|confirmation|confirmation-message|approval|approval-message): (.*)$/;
const META_LINE = /^- (by|round|reviewed|basis): (.*)$/;
const ANSWER_HEADING = /^### ([^:\s]+):(?: .*)?$/;
const VIEW_HEADING = /^## View: (.+)$/;
const BRANCH_HEADING = /^## ([A-Z]): /;
/** Phase 2 FR-035: `## Addition: view <name>`, `## Addition: language <code>`, `## Addition: host-module`. */
const ADDITION_HEADING = /^## Addition: (?:view (\S(?:.*\S)?)|language (\S+)|host-module)$/;
const BASIS = /^[0-9a-f]{16}$/;

/**
 * The scope context an addition section is read and written with. A file holds the questions'
 * answers, not the presentation they are measured against, so every question a scope can ask is
 * known: I4 is in a view scope only when the presentation then has more than one view, and the
 * placeholder timeline `''` (never a view name) makes it so. The values are not checked here, so
 * the applies-when rules that read the context never run.
 */
const EVERY_QUESTION: ScopeContext = { get: () => undefined, timelines: [''] };

/** An addition section's identity (FR-035); `heading` is `additionHeading`'s, without `## `. */
interface AdditionHeading {
  readonly kind: AdditionKind;
  readonly name: string;
  readonly heading: string;
}

/** The addition a `##` heading names, or `undefined` (a language must be a language code). */
function additionOf(heading: string): AdditionHeading | undefined {
  const match = ADDITION_HEADING.exec(heading);
  if (match === null) return undefined;
  const of = (kind: AdditionKind, name: string): AdditionHeading => ({
    kind,
    name,
    heading: additionHeading({ addition: kind, name }),
  });
  if (match[1] !== undefined) return of('view', match[1]);
  if (match[2] !== undefined)
    return LANGUAGE_CODE.test(match[2]) ? of('language', match[2]) : undefined;
  return of('host-module', '');
}

/** The questions of an addition section, by id (`scopedTree`'s, FR-036). */
const additionQuestions = (addition: AdditionHeading): ReadonlyMap<string, Question> =>
  new Map(
    scopedTree({ addition: addition.kind, name: addition.name }, EVERY_QUESTION).map(q => [q.id, q])
  );

// ---------------------------------------------------------------------------------------------
// Small total helpers (P19: they return `undefined`, never throw).

/** A positive integer written canonically, or `undefined`. */
function positiveInt(text: string): number | undefined {
  return /^[1-9]\d{0,14}$/.test(text) ? Number(text) : undefined;
}

/** The string a JSON string literal holds, or `undefined`. */
function jsonString(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

type Row = Readonly<Record<string, string>>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The view names of an S2 value, in S2 order, each once. */
function viewsOf(s2: AnswerValue | undefined): readonly string[] {
  const names = Array.isArray(s2)
    ? (s2 as readonly unknown[]).filter(isRow).map(row => row.name)
    : [];
  return names.filter((name, i) => typeof name === 'string' && names.indexOf(name) === i);
}

/** `lines` without exactly one trailing blank line (the block separator). */
const withoutSeparator = (lines: readonly string[]): readonly string[] =>
  lines.length > 0 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;

/** `lines` without leading and trailing blank lines. */
function trimBlank(lines: readonly string[]): readonly string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

/**
 * A section's identity: `branch:<letter>`, `view:<name>`, `addition:<heading>`, `facts`, or
 * `undefined` (unknown).
 */
function sectionKey(heading: string): string | undefined {
  if (heading === FACTS_HEADING) return 'facts';
  const addition = additionOf(heading);
  if (addition !== undefined) return `addition:${addition.heading}`;
  const view = VIEW_HEADING.exec(heading);
  if (view !== null) return `view:${view[1]}`;
  const branch = BRANCH_HEADING.exec(heading);
  if (branch !== null && BRANCHES.some(b => b.id === branch[1])) return `branch:${branch[1]}`;
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Parsing.

interface Line {
  readonly text: string;
  /** 1-based. */
  readonly number: number;
}

interface Header {
  readonly idea?: string;
  readonly treeVersion: number;
  readonly scope?: 'adopt';
  readonly confirmation?: Confirmation;
  readonly approval?: Approval;
  readonly ignored: readonly Ignored[];
  readonly kept: readonly RawBlock[];
}

/** A signed line read from the header, with the line it came from. */
interface SignedLine<T extends Confirmation | Approval> {
  readonly value: Omit<T, 'message'>;
  readonly line: number;
}

interface MessageLine {
  readonly text: string;
  readonly line: number;
}

/** The `- confirmation:` value (Phase 2 FR-024; a Phase 1 line too), or `undefined`. */
function confirmationOf(value: string): Omit<Confirmation, 'message'> | undefined {
  const signed = CONFIRMATION.exec(value);
  if (signed !== null) {
    const mode = signed[1] === 'elicitation' ? 'elicitation' : 'agent-reported';
    return { mode, at: signed[2], round: Number(signed[3]), hmac: signed[4] };
  }
  const legacy = PHASE_1_CONFIRMATION.exec(value);
  return legacy === null ? undefined : { mode: 'agent-reported', at: legacy[1], hmac: legacy[2] };
}

/** The `- approval:` value (Phase 2 FR-024), or `undefined`. */
function approvalOf(value: string): Omit<Approval, 'message'> | undefined {
  const match = APPROVAL.exec(value);
  if (match === null) return undefined;
  const mode =
    match[1] === 'elicitation'
      ? 'elicitation'
      : match[1] === 'agent-reported'
        ? 'agent-reported'
        : 'existing-storyboard';
  return { mode, at: match[2], hmac: match[3] };
}

/**
 * A signed line with its message line: an `agent-reported` line needs one (without it the line
 * is ignored, as in Phase 1); any other mode has none (a message line beside it is ignored).
 */
function withMessage<T extends Confirmation | Approval>(
  signed: SignedLine<T> | undefined,
  message: MessageLine | undefined,
  ignored: Ignored[]
): T | undefined {
  if (signed === undefined) {
    if (message !== undefined) ignored.push({ line: message.line, reason: BAD_HEADER });
    return undefined;
  }
  if (signed.value.mode !== 'agent-reported') {
    if (message !== undefined) ignored.push({ line: message.line, reason: BAD_HEADER });
    return signed.value as T;
  }
  if (message === undefined) {
    ignored.push({ line: signed.line, reason: BAD_HEADER });
    return undefined;
  }
  return { ...signed.value, message: message.text } as T;
}

const SIGNED_NAMES = [
  'confirmation',
  'approval',
  'confirmation-message',
  'approval-message',
] as const;
type SignedName = (typeof SIGNED_NAMES)[number];

const isSignedName = (name: string): name is SignedName =>
  (SIGNED_NAMES as readonly string[]).includes(name);

/** The signed lines of one header list being read (the brief's or an addition's, FR-024). */
interface SignedReader {
  confirmed?: SignedLine<Confirmation>;
  message?: MessageLine;
  approved?: SignedLine<Approval>;
  approvalMessage?: MessageLine;
}

/**
 * Reads one `- confirmation:` / `- approval:` / message line into `reader`; `false` when its
 * value is malformed. `none` clears the line read before it.
 */
function readSigned(reader: SignedReader, name: SignedName, value: string, line: number): boolean {
  switch (name) {
    case 'confirmation': {
      const parsed = confirmationOf(value);
      if (parsed !== undefined) reader.confirmed = { value: parsed, line };
      else if (value === 'none') reader.confirmed = undefined;
      else return false;
      return true;
    }
    case 'approval': {
      const parsed = approvalOf(value);
      if (parsed !== undefined) reader.approved = { value: parsed, line };
      else if (value === 'none') reader.approved = undefined;
      else return false;
      return true;
    }
    default: {
      const parsed = jsonString(value);
      if (parsed === undefined) return false;
      if (name === 'confirmation-message') reader.message = { text: parsed, line };
      else reader.approvalMessage = { text: parsed, line };
      return true;
    }
  }
}

/** The confirmation and approval a reader holds, each with its message (see `withMessage`). */
function signedOf(
  reader: SignedReader,
  ignored: Ignored[]
): { readonly confirmation?: Confirmation; readonly approval?: Approval } {
  const confirmation = withMessage(reader.confirmed, reader.message, ignored);
  const approval = withMessage(reader.approved, reader.approvalMessage, ignored);
  return {
    ...(confirmation === undefined ? {} : { confirmation }),
    ...(approval === undefined ? {} : { approval }),
  };
}

/** The lines before the first `##` heading (FR-019 items 1 to 4). */
function parseHeader(lines: readonly Line[]): Header {
  const ignored: Ignored[] = [];
  const kept: RawBlock[] = [];
  const idea: string[] = [];
  let ideaState: 'before' | 'in' | 'done' = 'before';
  let titleSeen = false;
  let treeVersion = TREE_VERSION;
  let scope: 'adopt' | undefined;
  const reader: SignedReader = {};
  const malformed = (line: Line, keep: boolean) => {
    ignored.push({ line: line.number, reason: BAD_HEADER });
    if (keep) kept.push({ section: '', text: line.text, kind: 'text' });
  };
  for (const line of lines) {
    const text = line.text;
    if (text.startsWith('>') && ideaState !== 'done') {
      ideaState = 'in';
      idea.push(text.startsWith('> ') ? text.slice(2) : text.slice(1));
      continue;
    }
    if (ideaState === 'in') ideaState = 'done';
    if (text === '' || text === COMMENT) continue;
    if (text === TITLE && !titleSeen) {
      titleSeen = true;
      continue;
    }
    const header = HEADER_LINE.exec(text);
    if (header === null) {
      malformed(line, true);
      continue;
    }
    const name = header[1];
    const value = header[2];
    if (isSignedName(name)) {
      if (!readSigned(reader, name, value, line.number)) malformed(line, false);
      continue;
    }
    switch (name) {
      case 'tree': {
        const version = positiveInt(value);
        if (version === undefined) malformed(line, false);
        else treeVersion = version;
        break;
      }
      case 'scope': {
        // Phase 2 FR-041: `adopt` is the only scope a brief records.
        if (value === 'adopt') scope = 'adopt';
        else malformed(line, false);
        break;
      }
      default:
        // `state:` is for people; the server never reads it (FR-023).
        break;
    }
  }
  return {
    ...(ideaState === 'before' ? {} : { idea: idea.join('\n') }),
    treeVersion,
    ...(scope === undefined ? {} : { scope }),
    ...signedOf(reader, ignored),
    ignored,
    kept,
  };
}

type AnswerResult = { readonly answer: Answer } | { readonly reason: string };

/** The answer id and question of a `### <template id>:` heading in one section, or `undefined`. */
type Resolve = (
  templateId: string
) => { readonly id: string; readonly question: Question } | undefined;

/** A branch section: any question but a V template. */
const inBranch =
  (questions: ReadonlyMap<string, Question>): Resolve =>
  templateId => {
    const question = questions.get(templateId);
    return question === undefined || question.branch === 'V'
      ? undefined
      : { id: templateId, question };
  };

/** A view section: the V templates and `V` (same as), as copies of `view`. */
const inView =
  (questions: ReadonlyMap<string, Question>, view: string): Resolve =>
  templateId => {
    if (templateId === SAME_AS.id) return { id: `V:${view}`, question: SAME_AS };
    const question = questions.get(templateId);
    return question === undefined || question.branch !== 'V'
      ? undefined
      : { id: `${templateId}:${view}`, question };
  };

/**
 * An addition section (FR-035): its scoped tree's questions, the V templates (and, for a view,
 * `V`) as copies of the added view (P11), the others under their own ids.
 */
const inAddition =
  (questions: ReadonlyMap<string, Question>, addition: AdditionHeading): Resolve =>
  templateId => {
    if (templateId === SAME_AS.id) {
      return addition.kind === 'view' ? { id: `V:${addition.name}`, question: SAME_AS } : undefined;
    }
    const question = questions.get(templateId);
    if (question === undefined) return undefined;
    return question.branch === 'V'
      ? { id: `${templateId}:${addition.name}`, question }
      : { id: templateId, question };
  };

/** One `### <id>: …` block (heading, meta lines, value lines) of a section. */
function parseAnswer(lines: readonly string[], resolve: Resolve): AnswerResult {
  const heading = ANSWER_HEADING.exec(lines[0]);
  if (heading === null) return { reason: UNKNOWN_QUESTION };
  const resolved = resolve(heading[1]);
  if (resolved === undefined) return { reason: UNKNOWN_QUESTION };
  const { id, question } = resolved;
  if (lines.length < 2 || lines[1] !== '') return { reason: BAD_META };
  const meta = new Map<string, string>();
  let index = 2;
  for (; index < lines.length && lines[index] !== ''; index++) {
    const match = META_LINE.exec(lines[index]);
    if (match === null || meta.has(match[1])) return { reason: BAD_META };
    meta.set(match[1], match[2]);
  }
  const byText = meta.get('by');
  const roundText = meta.get('round');
  if (byText === undefined || roundText === undefined) return { reason: MISSING_META };
  const round = positiveInt(roundText);
  const reviewedText = meta.get('reviewed');
  const reviewed = reviewedText === undefined ? undefined : positiveInt(reviewedText);
  const basis = meta.get('basis');
  if (
    (byText !== 'user' && byText !== 'delegated' && byText !== 'code') ||
    round === undefined ||
    (reviewedText !== undefined && reviewed === undefined) ||
    (basis !== undefined && !BASIS.test(basis))
  ) {
    return { reason: BAD_META };
  }
  // The value starts after the blank line that ends the meta lines.
  const valueLines = lines.slice(index + 1);
  const value = parseValue(
    question.shape,
    question.shape.kind === 'text' ? valueLines : trimBlank(valueLines)
  );
  if (value === undefined) return { reason: BAD_VALUE };
  const by: By = byText;
  return {
    answer: {
      id,
      value,
      by,
      round,
      ...(reviewed === undefined ? {} : { reviewed }),
      ...(basis === undefined ? {} : { basis }),
    },
  };
}

interface Section {
  readonly heading: Line;
  readonly key: string | undefined;
  readonly body: readonly Line[];
}

/** One `### ` block of a section: the answer read, or the reason it was not. */
type Block = { readonly line: number; readonly text: string } & AnswerResult;

/** An addition section read (FR-035), with what it could not read. */
interface AdditionRead {
  readonly state: AdditionState;
  readonly ignored: readonly Ignored[];
  readonly kept: readonly RawBlock[];
}

/** What a section holds, before the views of S2 are known. */
type SectionContent =
  | { readonly kind: 'unknown'; readonly section: Section; readonly reason: string }
  | { readonly kind: 'addition'; readonly section: Section; readonly read: AdditionRead }
  | {
      readonly kind: 'answers';
      readonly section: Section;
      readonly view: string | undefined;
      /** Text before the first answer, markers dropped (FR-020). */
      readonly preamble: { readonly line: number; readonly text: string } | undefined;
      readonly blocks: readonly Block[];
    };

/** The text of a section as found, without its one trailing separator line. */
const sectionText = (section: Section): string =>
  withoutSeparator([section.heading.text, ...section.body.map(l => l.text)]).join('\n');

/** The index of a section body's first `### ` line, or its length. */
function firstAnswerOf(body: readonly Line[]): number {
  const index = body.findIndex(l => l.text.startsWith('### '));
  return index === -1 ? body.length : index;
}

/** The `### ` blocks of a section body from `start`, each read with `resolve`. */
function blocksOf(body: readonly Line[], start: number, resolve: Resolve): readonly Block[] {
  const blocks: Block[] = [];
  for (let at = start; at < body.length; ) {
    let end = at + 1;
    while (end < body.length && !body[end].text.startsWith('### ')) end++;
    const lines = withoutSeparator(body.slice(at, end).map(l => l.text));
    blocks.push({ line: body[at].number, text: lines.join('\n'), ...parseAnswer(lines, resolve) });
    at = end;
  }
  return blocks;
}

function parseSection(
  section: Section,
  view: string | undefined,
  questions: ReadonlyMap<string, Question>
): SectionContent {
  const body = section.body;
  const preambleEnd = firstAnswerOf(body);
  const stray = body
    .slice(0, preambleEnd)
    .filter(l => l.text !== NO_ANSWERS && l.text !== PER_VIEW);
  const preambleLines = trimBlank(stray.map(l => l.text));
  const firstStray = stray.find(l => l.text.trim() !== '');
  const preamble =
    preambleLines.length === 0 || firstStray === undefined
      ? undefined
      : { line: firstStray.number, text: preambleLines.join('\n') };
  const resolve = view === undefined ? inBranch(questions) : inView(questions, view);
  const blocks = blocksOf(body, preambleEnd, resolve);
  return { kind: 'answers', section, view, preamble, blocks };
}

/**
 * An addition section (FR-035): its header lines (`- state:` is for people and never read, the
 * signed lines and their messages as in the brief's header), then its answer blocks, read against
 * its scoped tree. What it cannot read is ignored and kept in the section, as in a branch section.
 */
function parseAddition(section: Section, addition: AdditionHeading): AdditionRead {
  const heading = section.heading.text;
  const ignored: Ignored[] = [];
  const kept: RawBlock[] = [];
  const body = section.body;
  const headerEnd = firstAnswerOf(body);
  const reader: SignedReader = {};
  for (const line of body.slice(0, headerEnd)) {
    if (line.text === '') continue;
    const header = HEADER_LINE.exec(line.text);
    // `- tree:` and `- scope:` belong to the brief's header: kept here as text.
    if (header === null || header[1] === 'tree' || header[1] === 'scope') {
      ignored.push({ line: line.number, reason: BAD_HEADER });
      kept.push({ section: heading, text: line.text, kind: 'text' });
      continue;
    }
    const name = header[1];
    if (isSignedName(name) && !readSigned(reader, name, header[2], line.number)) {
      ignored.push({ line: line.number, reason: BAD_HEADER });
    }
  }
  const signed = signedOf(reader, ignored);
  const answers: Answer[] = [];
  const seen = new Set<string>();
  const resolve = inAddition(additionQuestions(addition), addition);
  for (const block of blocksOf(body, headerEnd, resolve)) {
    if ('answer' in block && !seen.has(block.answer.id)) {
      seen.add(block.answer.id);
      answers.push(block.answer);
      continue;
    }
    ignored.push({ line: block.line, reason: 'reason' in block ? block.reason : DUPLICATE });
    kept.push({ section: heading, text: block.text, kind: 'answer' });
  }
  return {
    state: {
      kind: addition.kind,
      name: addition.name,
      heading: addition.heading,
      ...signed,
      answers,
    },
    ignored,
    kept,
  };
}

/**
 * The brief of a `BRIEF.md` text (FR-020). Never throws by construction (P19): what it cannot read
 * is in `ignored` and `kept`. `tree` is the question tree the answers belong to.
 */
export function parseBrief(text: string, tree: readonly Question[] = TREE): ParsedBrief {
  const raw = text.split(/\r?\n/);
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
  const lines: Line[] = raw.map((t, i) => ({ text: t, number: i + 1 }));
  const questions = new Map(tree.map(q => [q.id, q]));

  const firstSection = lines.findIndex(l => l.text.startsWith('## '));
  const headerEnd = firstSection === -1 ? lines.length : firstSection;
  const header = parseHeader(lines.slice(0, headerEnd));

  const contents: SectionContent[] = [];
  const additionsSeen = new Set<string>();
  for (let i = headerEnd; i < lines.length; ) {
    let end = i + 1;
    while (end < lines.length && !lines[end].text.startsWith('## ')) end++;
    const key = sectionKey(lines[i].text);
    const section: Section = { heading: lines[i], key, body: lines.slice(i + 1, end) };
    i = end;
    if (key === 'facts') continue; // recomputed on every write (FR-020)
    if (key === undefined) {
      contents.push({ kind: 'unknown', section, reason: UNKNOWN_SECTION });
      continue;
    }
    const addition = additionOf(section.heading.text);
    if (addition !== undefined) {
      // A second section of the same addition is kept as it was, after `## Facts`.
      if (additionsSeen.has(key)) {
        contents.push({ kind: 'unknown', section, reason: DUPLICATE_ADDITION });
      } else {
        additionsSeen.add(key);
        contents.push({ kind: 'addition', section, read: parseAddition(section, addition) });
      }
      continue;
    }
    const view = key.startsWith('view:') ? key.slice('view:'.length) : undefined;
    contents.push(parseSection(section, view, questions));
  }

  // The views come from the first S2 answer read in a branch section (FR-010).
  const s2 = contents
    .flatMap(c => (c.kind === 'answers' && c.view === undefined ? c.blocks : []))
    .flatMap(b => ('answer' in b && b.answer.id === 'S2' ? [b.answer.value] : []));
  const views = viewsOf(s2.length > 0 ? s2[0] : undefined);

  const ignored: Ignored[] = [...header.ignored];
  const kept: RawBlock[] = [...header.kept];
  const answers: Answer[] = [];
  const additions: AdditionState[] = [];
  const seen = new Set<string>();
  for (const content of contents) {
    const heading = content.section.heading;
    if (content.kind === 'addition') {
      additions.push(content.read.state);
      ignored.push(...content.read.ignored);
      kept.push(...content.read.kept);
      continue;
    }
    if (
      content.kind === 'unknown' ||
      (content.view !== undefined && !views.includes(content.view))
    ) {
      const reason = content.kind === 'unknown' ? content.reason : UNKNOWN_VIEW;
      ignored.push({ line: heading.number, reason });
      kept.push({ section: heading.text, text: sectionText(content.section), kind: 'section' });
      continue;
    }
    if (content.preamble !== undefined) {
      ignored.push({ line: content.preamble.line, reason: STRAY_TEXT });
      kept.push({ section: heading.text, text: content.preamble.text, kind: 'text' });
    }
    for (const block of content.blocks) {
      if ('answer' in block && !seen.has(block.answer.id)) {
        seen.add(block.answer.id);
        answers.push(block.answer);
        continue;
      }
      ignored.push({ line: block.line, reason: 'reason' in block ? block.reason : DUPLICATE });
      kept.push({ section: heading.text, text: block.text, kind: 'answer' });
    }
  }

  return {
    brief: {
      ...(header.idea === undefined ? {} : { idea: header.idea }),
      treeVersion: header.treeVersion,
      ...(header.scope === undefined ? {} : { scope: header.scope }),
      ...(header.confirmation === undefined ? {} : { confirmation: header.confirmation }),
      ...(header.approval === undefined ? {} : { approval: header.approval }),
      answers,
      // Absent when there is none, so a Phase 1 file parses as before (SC-018).
      ...(additions.length === 0 ? {} : { additions }),
    },
    ignored: [...ignored].sort((l, r) => l.line - r.line),
    kept,
  };
}

// ---------------------------------------------------------------------------------------------
// Writing.

function answerBlock(
  templateId: string,
  title: string,
  question: Question,
  answer: Answer
): string {
  return [
    `### ${templateId}: ${title}`,
    '',
    `- by: ${answer.by}`,
    `- round: ${answer.round}`,
    ...(answer.reviewed === undefined ? [] : [`- reviewed: ${answer.reviewed}`]),
    ...(answer.basis === undefined ? [] : [`- basis: ${answer.basis}`]),
    '',
    ...formatValue(question.shape, answer.value),
  ].join('\n');
}

interface Placed {
  readonly order: number;
  readonly block: string;
}

const tableLine = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;

function factsBlocks(facts: FactsSnapshot): readonly string[] {
  const directions =
    facts.textDirection === undefined || facts.textDirection.length === 0
      ? '-'
      : facts.textDirection.map(d => `${d.code} ${d.direction}`).join(', ');
  const list = [
    `- server-eligian: ${facts.serverEligian}`,
    `- eligian-installed: ${facts.eligianInstalled ?? '-'}`,
    `- package-manager: ${facts.packageManager ?? '-'}`,
    `- text-direction: ${directions}`,
    ...(facts.assets.length === 0 ? ['- assets: none'] : []),
  ].join('\n');
  const table =
    facts.assets.length === 0
      ? []
      : [
          [
            tableLine(['asset', 'kind', 'state']),
            tableLine(['---', '---', '---']),
            ...facts.assets.map(a => tableLine([escapeCell(a.key), a.kind, a.state])),
          ].join('\n'),
        ];
  return [FACTS_HEADING, FACTS_COMMENT, list, ...table];
}

/** A message line, present only for an `agent-reported` line (Phase 2 FR-024). */
const messageLine = (
  name: 'confirmation-message' | 'approval-message',
  signed: Confirmation | Approval
): readonly string[] =>
  signed.mode === 'agent-reported' && signed.message !== undefined
    ? [`- ${name}: ${JSON.stringify(signed.message)}`]
    : [];

/**
 * The confirmation and approval lines with their message lines (Phase 2 FR-024). A Phase 1 line
 * (no watermark) is written back in its own form: `agent-reported <ISO> sha256:<hex>`.
 */
function signedLines(signed: Pick<BriefState, 'confirmation' | 'approval'>): readonly string[] {
  const { confirmation, approval } = signed;
  const confirmationLines =
    confirmation === undefined
      ? ['- confirmation: none']
      : [
          confirmation.round === undefined
            ? `- confirmation: ${confirmation.mode} ${confirmation.at} ${confirmation.hmac}`
            : `- confirmation: ${confirmation.mode} ${confirmation.at} round ${confirmation.round} ${confirmation.hmac}`,
          ...messageLine('confirmation-message', confirmation),
        ];
  const approvalLines =
    approval === undefined
      ? ['- approval: none']
      : [
          `- approval: ${approval.mode} ${approval.at} ${approval.hmac}`,
          ...messageLine('approval-message', approval),
        ];
  return [...confirmationLines, ...approvalLines];
}

/** The kept blocks of one kind in the section of `key`. */
const keptIn = (
  kept: readonly RawBlock[],
  key: string,
  kind: RawBlock['kind']
): readonly string[] =>
  kept.filter(b => b.kind === kind && sectionKey(b.section) === key).map(b => b.text);

/**
 * An addition section (FR-035): the heading, its header list (`- state:` from the snapshot, the
 * signed lines, the kept header text), then its answers in scoped-tree order (`V` first, a V copy
 * titled `<view>: …` as the engine's instance), then its kept answer blocks. An answer a parse
 * would not read back under its own id is not written.
 */
function additionSection(
  addition: AdditionState,
  kept: readonly RawBlock[],
  facts: FactsSnapshot
): readonly string[] {
  const heading: AdditionHeading = {
    kind: addition.kind,
    name: addition.name,
    heading: addition.heading,
  };
  const questions = additionQuestions(heading);
  const order = new Map([...questions.keys()].map((id, i) => [id, i]));
  const resolve = inAddition(questions, heading);
  const answers = addition.answers
    .flatMap((answer): Placed[] => {
      const colon = answer.id.indexOf(':');
      const templateId = colon === -1 ? answer.id : answer.id.slice(0, colon);
      const resolved = resolve(templateId);
      if (resolved === undefined || resolved.id !== answer.id) return [];
      const { question } = resolved;
      const title = colon === -1 ? question.title : `${addition.name}: ${question.title}`;
      return [
        {
          order: question === SAME_AS ? -1 : (order.get(templateId) ?? order.size),
          block: answerBlock(templateId, title, question, answer),
        },
      ];
    })
    .sort((l, r) => l.order - r.order)
    .map(p => p.block);
  const key = `addition:${addition.heading}`;
  const headerList = [
    `- state: ${facts.additionStates?.get(addition.heading) ?? 'open'}`,
    ...signedLines(addition),
    ...keptIn(kept, key, 'text'),
  ].join('\n');
  return [`## ${addition.heading}`, headerList, ...answers, ...keptIn(kept, key, 'answer')];
}

/**
 * The `BRIEF.md` text of a parsed brief (FR-019): its answers, its kept content (FR-020, P17)
 * and the given facts. The views are the recorded S2's, whatever its status.
 */
export function writeBrief(
  tree: readonly Question[],
  parsed: ParsedBrief,
  facts: FactsSnapshot
): string {
  const { brief, kept } = parsed;
  const questions = new Map(tree.map(q => [q.id, q]));
  const treeOrder = new Map(tree.map((q, i) => [q.id, i]));
  const views = viewsOf(brief.answers.find(a => a.id === 'S2')?.value);

  // The answer blocks per section key, each with its tree position (`V:` first in a view).
  const placed = new Map<string, Placed[]>();
  const place = (key: string, order: number, block: string) => {
    const list = placed.get(key) ?? [];
    list.push({ order, block });
    placed.set(key, list);
  };
  const orphanViews: string[] = [];
  for (const answer of brief.answers) {
    const colon = answer.id.indexOf(':');
    const templateId = colon === -1 ? answer.id : answer.id.slice(0, colon);
    const view = colon === -1 ? undefined : answer.id.slice(colon + 1);
    const question = view !== undefined && templateId === 'V' ? SAME_AS : questions.get(templateId);
    if (question === undefined) continue;
    const order = question === SAME_AS ? -1 : (treeOrder.get(templateId) ?? tree.length);
    const block = answerBlock(templateId, question.title, question, answer);
    if (view === undefined) {
      place(`branch:${question.branch}`, order, block);
    } else {
      if (!views.includes(view) && !orphanViews.includes(view)) orphanViews.push(view);
      place(`view:${view}`, order, block);
    }
  }
  for (const block of kept) {
    const key = sectionKey(block.section);
    const view = key?.startsWith('view:') ? key.slice('view:'.length) : undefined;
    if (block.kind !== 'section' && view !== undefined && !views.includes(view)) {
      if (!orphanViews.includes(view)) orphanViews.push(view);
    }
  }

  const section = (heading: string, key: string, marker?: string): readonly string[] => {
    const answers = [...(placed.get(key) ?? [])]
      .sort((l, r) => l.order - r.order)
      .map(p => p.block);
    const head = marker ?? (answers.length === 0 ? NO_ANSWERS : undefined);
    return [
      heading,
      ...(head === undefined ? [] : [head]),
      ...keptIn(kept, key, 'text'),
      ...answers,
      ...keptIn(kept, key, 'answer'),
    ];
  };

  // FR-035: a brief that holds only additions has no idea and no branch or view section.
  const additions = brief.additions ?? [];
  const onlyAdditions =
    additions.length > 0 &&
    brief.idea === undefined &&
    brief.answers.length === 0 &&
    kept.every(
      b =>
        b.kind === 'section' ||
        b.section === '' ||
        sectionKey(b.section)?.startsWith('addition:') === true
    );

  const headerList = [
    `- tree: ${brief.treeVersion}`,
    // Phase 2 FR-041: only when set, so a file without it is Phase 1's (SC-018).
    ...(brief.scope === undefined ? [] : [`- scope: ${brief.scope}`]),
    `- state: ${facts.state}`,
    ...signedLines(brief),
    ...kept.filter(b => b.kind === 'text' && b.section === '').map(b => b.text),
  ].join('\n');

  const blocks: string[] = [TITLE, COMMENT];
  if (brief.idea !== undefined) {
    blocks.push(
      brief.idea
        .split('\n')
        .map(line => (line === '' ? '>' : `> ${line}`))
        .join('\n')
    );
  }
  blocks.push(headerList);
  for (const branch of onlyAdditions ? [] : BRANCHES) {
    const heading = `## ${branch.id}: ${branch.name}`;
    const key = `branch:${branch.id}`;
    if (branch.id !== 'V') {
      blocks.push(...section(heading, key));
      continue;
    }
    blocks.push(...section(heading, key, views.length === 0 ? NO_ANSWERS : PER_VIEW));
    for (const view of views) blocks.push(...section(`## View: ${view}`, `view:${view}`));
  }
  for (const addition of additions) blocks.push(...additionSection(addition, kept, facts));
  blocks.push(...factsBlocks(facts));
  // Answers of views no longer in S2 go where a parse will keep them: after the facts (FR-010).
  for (const view of orphanViews) blocks.push(...section(`## View: ${view}`, `view:${view}`));
  blocks.push(...kept.filter(b => b.kind === 'section').map(b => b.text));
  return `${blocks.join('\n\n')}\n`;
}
