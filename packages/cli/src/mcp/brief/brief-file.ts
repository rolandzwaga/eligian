/**
 * `BRIEF.md`, the file of the brief interview (spec 059 FR-010 unknown views, FR-019 to FR-021;
 * plan §4, P1, P17, P19).
 *
 * - `writeBrief`: the FR-019 layout exactly: `# Brief`, the comment line, the idea as a
 *   blockquote, the header list, the 12 branch sections (answers in tree order, then the kept
 *   answer blocks of that section, P17), one section per S2 view, `## Facts` from the given
 *   snapshot (P1: the state comes in as data), then the kept unknown sections. Blocks are joined
 *   by one blank line and the file ends with a single LF.
 * - `parseBrief`: the inverse. It accepts LF and CRLF and never throws by construction: every
 *   handler is total over its lines, and what it cannot read is reported in `ignored` and kept
 *   verbatim in `kept`, so a write gives it back (FR-020). There is no catch-all (P19): a throw
 *   would be a parser defect, which the tool boundary reports as `internal` before any write.
 *
 * Pure: no I/O, no `effect`. Values are formatted and parsed by `values.ts`.
 */
import type { PackageManager } from '@eligian/shared-utils';
import {
  type Answer,
  type BriefState,
  type BriefStateName,
  type By,
  type Confirmation,
  EMPTY_BRIEF,
  SAME_AS,
} from './engine.js';
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
const STRAY_TEXT = 'text outside an answer';

const CONFIRMATION =
  /^agent-reported (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) sha256:([0-9a-f]{64})$/;
const HEADER_LINE = /^- (tree|state|confirmation|confirmation-message|approval): (.*)$/;
const META_LINE = /^- (by|round|reviewed|basis): (.*)$/;
const ANSWER_HEADING = /^### ([^:\s]+):(?: .*)?$/;
const VIEW_HEADING = /^## View: (.+)$/;
const BRANCH_HEADING = /^## ([A-Z]): /;
const BASIS = /^[0-9a-f]{16}$/;

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

/** A section's identity: `branch:<letter>`, `view:<name>`, `facts`, or `undefined` (unknown). */
function sectionKey(heading: string): string | undefined {
  if (heading === FACTS_HEADING) return 'facts';
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
  readonly confirmation?: Confirmation;
  readonly ignored: readonly Ignored[];
  readonly kept: readonly RawBlock[];
}

/** The lines before the first `##` heading (FR-019 items 1 to 4). */
function parseHeader(lines: readonly Line[]): Header {
  const ignored: Ignored[] = [];
  const kept: RawBlock[] = [];
  const idea: string[] = [];
  let ideaState: 'before' | 'in' | 'done' = 'before';
  let titleSeen = false;
  let treeVersion = TREE_VERSION;
  let confirmed:
    | { readonly at: string; readonly digest: string; readonly line: number }
    | undefined;
  let message: { readonly text: string; readonly line: number } | undefined;
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
    const value = header[2];
    switch (header[1]) {
      case 'tree': {
        const version = positiveInt(value);
        if (version === undefined) malformed(line, false);
        else treeVersion = version;
        break;
      }
      case 'confirmation': {
        const match = CONFIRMATION.exec(value);
        if (match !== null) confirmed = { at: match[1], digest: match[2], line: line.number };
        else if (value === 'none') confirmed = undefined;
        else malformed(line, false);
        break;
      }
      case 'confirmation-message': {
        const parsed = jsonString(value);
        if (parsed === undefined) malformed(line, false);
        else message = { text: parsed, line: line.number };
        break;
      }
      default:
        // `state:` and `approval:` are for people; the server never reads them (FR-023).
        break;
    }
  }
  let confirmation: Confirmation | undefined;
  if (confirmed !== undefined && message !== undefined) {
    confirmation = {
      mode: 'agent-reported',
      at: confirmed.at,
      digest: confirmed.digest,
      message: message.text,
    };
  } else if (confirmed !== undefined) {
    ignored.push({ line: confirmed.line, reason: BAD_HEADER });
  } else if (message !== undefined) {
    ignored.push({ line: message.line, reason: BAD_HEADER });
  }
  return {
    ...(ideaState === 'before' ? {} : { idea: idea.join('\n') }),
    treeVersion,
    ...(confirmation === undefined ? {} : { confirmation }),
    ignored,
    kept,
  };
}

type AnswerResult = { readonly answer: Answer } | { readonly reason: string };

/** One `### <id>: …` block (heading, meta lines, value lines) in a branch or view section. */
function parseAnswer(
  lines: readonly string[],
  questions: ReadonlyMap<string, Question>,
  view: string | undefined
): AnswerResult {
  const heading = ANSWER_HEADING.exec(lines[0]);
  if (heading === null) return { reason: UNKNOWN_QUESTION };
  const templateId = heading[1];
  let id: string;
  let question: Question | undefined;
  if (view === undefined) {
    question = questions.get(templateId);
    if (question === undefined || question.branch === 'V') return { reason: UNKNOWN_QUESTION };
    id = templateId;
  } else if (templateId === 'V') {
    question = SAME_AS;
    id = `V:${view}`;
  } else {
    question = questions.get(templateId);
    if (question === undefined || question.branch !== 'V') return { reason: UNKNOWN_QUESTION };
    id = `${templateId}:${view}`;
  }
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
    (byText !== 'user' && byText !== 'delegated') ||
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

/** What a section holds, before the views of S2 are known. */
type SectionContent =
  | { readonly kind: 'unknown'; readonly section: Section }
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

function parseSection(
  section: Section,
  view: string | undefined,
  questions: ReadonlyMap<string, Question>
): SectionContent {
  const body = section.body;
  const firstAnswer = body.findIndex(l => l.text.startsWith('### '));
  const preambleEnd = firstAnswer === -1 ? body.length : firstAnswer;
  const stray = body
    .slice(0, preambleEnd)
    .filter(l => l.text !== NO_ANSWERS && l.text !== PER_VIEW);
  const preambleLines = trimBlank(stray.map(l => l.text));
  const firstStray = stray.find(l => l.text.trim() !== '');
  const preamble =
    preambleLines.length === 0 || firstStray === undefined
      ? undefined
      : { line: firstStray.number, text: preambleLines.join('\n') };
  const blocks: Block[] = [];
  let start = preambleEnd;
  while (start < body.length) {
    let end = start + 1;
    while (end < body.length && !body[end].text.startsWith('### ')) end++;
    const lines = withoutSeparator(body.slice(start, end).map(l => l.text));
    blocks.push({
      line: body[start].number,
      text: lines.join('\n'),
      ...parseAnswer(lines, questions, view),
    });
    start = end;
  }
  return { kind: 'answers', section, view, preamble, blocks };
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
  for (let i = headerEnd; i < lines.length; ) {
    let end = i + 1;
    while (end < lines.length && !lines[end].text.startsWith('## ')) end++;
    const key = sectionKey(lines[i].text);
    const section: Section = { heading: lines[i], key, body: lines.slice(i + 1, end) };
    i = end;
    if (key === 'facts') continue; // recomputed on every write (FR-020)
    if (key === undefined) {
      contents.push({ kind: 'unknown', section });
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
  const seen = new Set<string>();
  for (const content of contents) {
    const heading = content.section.heading;
    if (
      content.kind === 'unknown' ||
      (content.view !== undefined && !views.includes(content.view))
    ) {
      const reason = content.kind === 'unknown' ? UNKNOWN_SECTION : UNKNOWN_VIEW;
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
      ...(header.confirmation === undefined ? {} : { confirmation: header.confirmation }),
      answers,
    },
    ignored: [...ignored].sort((l, r) => l.line - r.line),
    kept,
  };
}

// ---------------------------------------------------------------------------------------------
// Writing.

function answerBlock(templateId: string, question: Question, answer: Answer): string {
  return [
    `### ${templateId}: ${question.title}`,
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
    const block = answerBlock(templateId, question, answer);
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

  const keptIn = (key: string, kind: RawBlock['kind']): readonly string[] =>
    kept.filter(b => b.kind === kind && sectionKey(b.section) === key).map(b => b.text);

  const section = (heading: string, key: string, marker?: string): readonly string[] => {
    const answers = [...(placed.get(key) ?? [])]
      .sort((l, r) => l.order - r.order)
      .map(p => p.block);
    const head = marker ?? (answers.length === 0 ? NO_ANSWERS : undefined);
    return [
      heading,
      ...(head === undefined ? [] : [head]),
      ...keptIn(key, 'text'),
      ...answers,
      ...keptIn(key, 'answer'),
    ];
  };

  const confirmation = brief.confirmation;
  const headerList = [
    `- tree: ${brief.treeVersion}`,
    `- state: ${facts.state}`,
    confirmation === undefined
      ? '- confirmation: none'
      : `- confirmation: agent-reported ${confirmation.at} sha256:${confirmation.digest}`,
    ...(confirmation === undefined
      ? []
      : [`- confirmation-message: ${JSON.stringify(confirmation.message)}`]),
    '- approval: none',
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
  for (const branch of BRANCHES) {
    const heading = `## ${branch.id}: ${branch.name}`;
    const key = `branch:${branch.id}`;
    if (branch.id !== 'V') {
      blocks.push(...section(heading, key));
      continue;
    }
    blocks.push(...section(heading, key, views.length === 0 ? NO_ANSWERS : PER_VIEW));
    for (const view of views) blocks.push(...section(`## View: ${view}`, `view:${view}`));
  }
  blocks.push(...factsBlocks(facts));
  // Answers of views no longer in S2 go where a parse will keep them: after the facts (FR-010).
  for (const view of orphanViews) blocks.push(...section(`## View: ${view}`, `view:${view}`));
  blocks.push(...kept.filter(b => b.kind === 'section').map(b => b.text));
  return `${blocks.join('\n\n')}\n`;
}
