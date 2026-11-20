/**
 * Spec 058 (Phase 1 FR-018, FR-026; Phase 2 FR-003, FR-066, I-1; plan C8, D6; Phase 3 FR-050,
 * FR-051, I-8; plan C4): the server
 * `instructions` and the `AGENTS.md` block. Both are built from the same parts (preamble,
 * tool workflow, engine rules), so the block repeats the instructions; the block adds the
 * docs pointer and the docs index.
 *
 * Each phase has its own instructions string naming only the tools and chunk ids that
 * phase ships; `server.ts` picks it by `MCP_PHASE`. String 4 is spec 059 Phase 3's (FR-001
 * to FR-006): the brief interview comes first.
 */
import type { IndexEntry } from './knowledge/types.js';

/** The build-time phase constant: which tools and instructions this server ships. */
export const MCP_PHASE = 4 as const;

const PREAMBLE = `Eligian: a DSL compiled to Eligius presentation JSON (timelines of timed actions; an action is a
chain of operations over one shared operationData bag). No model was trained on Eligian. Do not
write it from memory. If a construct is not in \`syntax-cheatsheet\`, Eligian does not have it: read
\`not-eligian\` for the alternative, or ask.`;

const WORKFLOW_INTRO = `Use these tools whenever a task touches .eligian files, layout HTML, CSS, locales.json or a host
module of an Eligius presentation:`;

const OPERATIONS_LINE = `- \`eligian_operations\`: BEFORE calling any operation not in your session so far; batch with
  names:[...]. Cards lead with NEEDS / PROVIDES / ERASES.`;

const DOCS_LINE = `- \`eligian_docs\`: FIRST for a new presentation: ids \`storyboard\`, \`decisions\`, \`project-layout\`,
  then write STORYBOARD.md. Before each construct you have not written this session: its map-*
  card (index) or body (detail:true). Read \`operations-index\` once.
${OPERATIONS_LINE}
- \`eligian_init\`: scaffold a new project from a starter (writes files; next steps in the reply).`;

const CHECK_LINE = `- \`eligian_check\`: after EVERY edit until 0 errors and 0 warnings. Each diagnostic carries its fix.
- \`eligian_fmt\`: write:true once check is clean.`;

const WORKFLOW_PHASE_1 = `${WORKFLOW_INTRO}\n${DOCS_LINE}\n${CHECK_LINE}`;

/** §3.5's final workflow; I-1: the `eligian_compile` line has no `explain` (Phase 3). */
const WORKFLOW_PHASE_2 = `${WORKFLOW_INTRO}
${DOCS_LINE}
- \`eligian_project\`: the ids, classes, locale keys, asset files and host names you may reference.
  Call before writing selectors; layout + CSS come before timelines.
${CHECK_LINE}
- \`eligian_smoke\`: after fmt; pass a scenario for every interaction you wrote (click, key, seek).
- \`eligian_compile\`: once after your first timeline passes check (select it), and
  whenever behaviour surprises you.`;

/** §3.5's final workflow verbatim (I-8), plus the determinism step on the smoke line. */
const PROJECT_LINE = `- \`eligian_project\`: the ids, classes, locale keys, asset files and host names you may reference.
  Call before writing selectors; layout + CSS come before timelines.`;

const SMOKE_LINE_3 = `- \`eligian_smoke\`: after fmt; pass a scenario for every interaction you wrote (click, key, seek), then determinism:true.`;

const COMPILE_LINE_3 = `- \`eligian_compile\`: once after your first timeline passes check (select it, explain:true), and whenever behaviour surprises you.`;

const WORKFLOW_PHASE_3 = `${WORKFLOW_INTRO}
${DOCS_LINE}
${PROJECT_LINE}
${CHECK_LINE}
${SMOKE_LINE_3}
${COMPILE_LINE_3}`;

/**
 * Spec 059 Phase 3 (FR-002): the brief comes first, for a new presentation and for an
 * addition; nothing is written before it is approved.
 */
const BRIEF_LINE = `- \`eligian_brief\`: FIRST for a new presentation and for an addition (a new view, a new
  language or a first host module). Ask its rounds, confirm the brief, then draft STORYBOARD.md
  from it and approve it. Nothing is written before the brief is approved; the generation tools
  refuse until then.`;

/**
 * FR-004: the storyboard ids are read once the brief is confirmed. An action sits inside a
 * span holding a space, never backticked alone (plan P8).
 */
const DOCS_LINE_4 = `- \`eligian_docs\`: \`interview\` before the first round. Once the brief is confirmed:
  \`storyboard\`, \`decisions\`, \`project-layout\`, then draft STORYBOARD.md and call \`action: approve-storyboard\`.
  Before each construct you have not written this session: its map-* card (index) or body
  (detail:true). Read \`operations-index\` once.
${OPERATIONS_LINE}
- \`eligian_init\`: scaffold from a starter once the brief is approved (writes files; next steps in the reply).`;

const WORKFLOW_PHASE_4 = `${WORKFLOW_INTRO}
${BRIEF_LINE}
${DOCS_LINE_4}
${PROJECT_LINE}
${CHECK_LINE}
${SMOKE_LINE_3}
${COMPILE_LINE_3}`;

const ENGINE_RULES = `Rules the engine imposes:
1. A fired block has nothing selected. Timeline, lifecycle and init blocks start with {};
   event actions start with {eventArgs}; listener actions get the controller's data plus
   eventTarget/eventKey; a called action gets a copy plus its arguments. Select before you mutate.
2. Nothing flows back from a called action. Start and end blocks are independent runs.
3. The DOM is a function of the position: every visible state belongs to a range that covers it,
   an end block is the exact inverse of its start, and skipped ranges never run on seek.
4. A selector must exist in layout.html or the imported CSS; check rejects the rest.
5. Every controller added in on enter is removed in on leave. Durations live on the timeline,
   not in wait()/animate() milliseconds.`;

const RULES_PHASE_1 = `${ENGINE_RULES}
Review STORYBOARD.md against the timelines you wrote before declaring done.`;

const RULES_PHASE_2 = `${ENGINE_RULES}
Review STORYBOARD.md against the compiled timelines before declaring done.`;

/** Spec 059 FR-003: the one new rule, after the five engine rules and not numbered among them. */
const USER_RULE = `Decisions are the user's, facts are yours: look up what \`eligian_project\` or the files
answer (ids, classes, assets, languages, versions) and ask the user only decisions, each with your
recommendation, so that yes accepts it.`;

const RULES_PHASE_4 = `${ENGINE_RULES}
${USER_RULE}
Review STORYBOARD.md against the compiled timelines before declaring done.`;

/** The Phase 1 server instructions (FR-018: ≤ 4,096 chars, tools and ids backticked). */
export const INSTRUCTIONS_PHASE_1: string = `${PREAMBLE}\n\n${WORKFLOW_PHASE_1}\n\n${RULES_PHASE_1}\n`;

/** The Phase 2 server instructions (FR-003): §3.5's final text with I-1. */
const INSTRUCTIONS_PHASE_2 = `${PREAMBLE}\n\n${WORKFLOW_PHASE_2}\n\n${RULES_PHASE_2}\n`;

/** The Phase 3 server instructions (FR-050): §3.5's final text with `explain:true`. */
const INSTRUCTIONS_PHASE_3 = `${PREAMBLE}\n\n${WORKFLOW_PHASE_3}\n\n${RULES_PHASE_2}\n`;

/** The spec 059 Phase 3 server instructions (FR-001 to FR-005): the brief first. */
const INSTRUCTIONS_PHASE_4 = `${PREAMBLE}\n\n${WORKFLOW_PHASE_4}\n\n${RULES_PHASE_4}\n`;

/** The instructions per phase; `server.ts` reads `INSTRUCTIONS[MCP_PHASE]`. */
export const INSTRUCTIONS: Readonly<Record<1 | 2 | 3 | 4, string>> = {
  1: INSTRUCTIONS_PHASE_1,
  2: INSTRUCTIONS_PHASE_2,
  3: INSTRUCTIONS_PHASE_3,
  4: INSTRUCTIONS_PHASE_4,
};

/** The workflow and rules of each phase, for the AGENTS.md block of `MCP_PHASE`. */
const BLOCK_PARTS: Readonly<Record<1 | 2 | 3 | 4, { workflow: string; rules: string }>> = {
  1: { workflow: WORKFLOW_PHASE_1, rules: RULES_PHASE_1 },
  2: { workflow: WORKFLOW_PHASE_2, rules: RULES_PHASE_2 },
  3: { workflow: WORKFLOW_PHASE_3, rules: RULES_PHASE_2 },
  4: { workflow: WORKFLOW_PHASE_4, rules: RULES_PHASE_4 },
};

/** The generated directory of each kind whose ids are `<kind>/<name>`. */
const NAMED_KIND_DIRS: Readonly<Record<string, string>> = {
  operation: 'generated/operations',
  example: 'generated/examples',
  starter: 'generated/starters',
};

/**
 * The file of a chunk, relative to the docs directory, as the generator writes it
 * (`generate-knowledge.ts` checks every chunk against it): `<kind>/<name>` ids live in
 * their kind's generated directory, `reference` chunks in `generated/`, the hand-written
 * ones in `curriculum/`.
 */
export function chunkFile(entry: Pick<IndexEntry, 'id' | 'kind'>): string {
  const dir = NAMED_KIND_DIRS[entry.kind];
  if (dir !== undefined) return `${dir}/${entry.id.slice(entry.id.indexOf('/') + 1)}.md`;
  return entry.kind === 'reference' ? `generated/${entry.id}.md` : `curriculum/${entry.id}.md`;
}

const DOCS_POINTER = `The Eligian docs live on disk in \`node_modules/eligian/dist/docs/\`; the paths below are relative
to it (\`index.json\` lists every chunk with its card; the \`eligian_docs\` tool serves the same files).`;

/** The kinds the index lists by name only, after their path pattern (FR-066). */
const BY_NAME: ReadonlySet<string> = new Set(['operation', 'example']);

/** The names of the `<kind>/<name>` ids of one kind, comma-separated (`none` when empty). */
const namesOf = (index: readonly IndexEntry[], kind: string): string => {
  const names = index
    .filter(entry => entry.kind === kind)
    .map(entry => entry.id.slice(entry.id.indexOf('/') + 1));
  return names.length === 0 ? 'none' : names.join(', ');
};

/**
 * The AGENTS.md block between <!-- eligian:begin --> and <!-- eligian:end --> (FR-066): the
 * workflow and rules of `MCP_PHASE`, the docs pointer naming `node_modules/eligian/dist/docs/` once,
 * then the index: one `- <id>: <title> (<path>)` line per chunk that is neither an operation
 * nor an example, and the operations and examples by name after their path patterns.
 */
export function agentsMdBlock(index: readonly IndexEntry[]): string {
  const listed = index
    .filter(entry => !BY_NAME.has(entry.kind))
    .map(entry => `- ${entry.id}: ${entry.title} (${chunkFile(entry)})`);
  const { workflow, rules } = BLOCK_PARTS[MCP_PHASE];
  return `<!-- eligian:begin -->

## Eligian

${PREAMBLE}

${workflow}

${rules}

${DOCS_POINTER}

${listed.join('\n')}

Operations (generated/operations/<name>.md; overview: operations-index): ${namesOf(index, 'operation')}

Examples (generated/examples/<id>.md): ${namesOf(index, 'example')}

<!-- eligian:end -->
`;
}
