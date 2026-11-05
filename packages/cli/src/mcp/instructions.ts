/**
 * Spec 058 Phase 1 (FR-018, FR-026; plan C8): the server `instructions` and the
 * `AGENTS.md` block `eligian_init` writes. Both are built from the same three parts
 * (preamble, tool workflow, engine rules), so the block repeats the instructions.
 *
 * Each phase has its own instructions string naming only the tools and chunk ids that
 * phase ships; `server.ts` picks it by `MCP_PHASE`.
 */

/** The build-time phase constant: which tools and instructions this server ships. */
export const MCP_PHASE = 1 as const;

const PREAMBLE = `Eligian: a DSL compiled to Eligius presentation JSON (timelines of timed actions; an action is a
chain of operations over one shared operationData bag). No model was trained on Eligian. Do not
write it from memory. If a construct is not in \`syntax-cheatsheet\`, Eligian does not have it: read
\`not-eligian\` for the alternative, or ask.`;

const WORKFLOW_PHASE_1 = `Use these tools whenever a task touches .eligian files, layout HTML, CSS, locales.json or a host
module of an Eligius presentation:
- \`eligian_docs\`: FIRST for a new presentation: ids \`storyboard\`, \`decisions\`, \`project-layout\`,
  then write STORYBOARD.md. Before each construct you have not written this session: its map-*
  card (index) or body (detail:true). Read \`operations-index\` once.
- \`eligian_operations\`: BEFORE calling any operation not in your session so far; batch with
  names:[...]. Cards lead with NEEDS / PROVIDES / ERASES.
- \`eligian_init\`: scaffold a new project from a starter (writes files; next steps in the reply).
- \`eligian_check\`: after EVERY edit until 0 errors and 0 warnings. Each diagnostic carries its fix.
- \`eligian_fmt\`: write:true once check is clean.`;

const RULES = `Rules the engine imposes:
1. A fired block has nothing selected. Timeline, lifecycle and init blocks start with {};
   event actions start with {eventArgs}; listener actions get the controller's data plus
   eventTarget/eventKey; a called action gets a copy plus its arguments. Select before you mutate.
2. Nothing flows back from a called action. Start and end blocks are independent runs.
3. The DOM is a function of the position: every visible state belongs to a range that covers it,
   an end block is the exact inverse of its start, and skipped ranges never run on seek.
4. A selector must exist in layout.html or the imported CSS; check rejects the rest.
5. Every controller added in on enter is removed in on leave. Durations live on the timeline,
   not in wait()/animate() milliseconds.
Review STORYBOARD.md against the timelines you wrote before declaring done.`;

/** The Phase 1 server instructions (FR-018: ≤ 4,096 chars, tools and ids backticked). */
export const INSTRUCTIONS_PHASE_1: string = `${PREAMBLE}\n\n${WORKFLOW_PHASE_1}\n\n${RULES}\n`;

/** The instructions per phase; `server.ts` reads `INSTRUCTIONS[MCP_PHASE]`. */
export const INSTRUCTIONS: Readonly<Record<typeof MCP_PHASE, string>> = {
  1: INSTRUCTIONS_PHASE_1,
};

const DOCS_POINTER = `The Eligian docs live on disk in \`node_modules/eligian/dist/docs\` (\`index.json\` lists
every chunk with its card; the \`eligian_docs\` tool serves the same files). The \`eligian\`
MCP server (\`.mcp.json\`) provides the tools below.`;

/**
 * The AGENTS.md block between <!-- eligian:begin --> and <!-- eligian:end -->: workflow + rules,
 * and the docs pointer `node_modules/eligian/dist/docs` (FR-026).
 */
export function agentsMdBlock(): string {
  return `<!-- eligian:begin -->

## Eligian

${PREAMBLE}

${DOCS_POINTER}

${WORKFLOW_PHASE_1}

${RULES}

<!-- eligian:end -->
`;
}
