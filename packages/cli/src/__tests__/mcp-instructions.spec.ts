/**
 * Spec 058 (Phase 1 FR-018, FR-026; Phase 2 FR-003, FR-066, I-1; plan D6; Phase 3 FR-050,
 * FR-051, I-8, SC-013; plan C4): the server `instructions` of each phase and the `AGENTS.md`
 * block, built from the same text.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import {
  agentsMdBlock,
  chunkFile,
  INSTRUCTIONS,
  INSTRUCTIONS_PHASE_1,
  MCP_PHASE,
} from '../mcp/instructions.js';
import type { ChunkKind, IndexEntry } from '../mcp/knowledge/types.js';

const PHASE_2_TOOLS = [
  'eligian_docs',
  'eligian_operations',
  'eligian_init',
  'eligian_project',
  'eligian_check',
  'eligian_fmt',
  'eligian_smoke',
  'eligian_compile',
] as const;

/** §3.5 "Final (Phase 2+) instructions", with the Phase 1 backtick convention and I-1. */
const EXPECTED_PHASE_2 = `Eligian: a DSL compiled to Eligius presentation JSON (timelines of timed actions; an action is a
chain of operations over one shared operationData bag). No model was trained on Eligian. Do not
write it from memory. If a construct is not in \`syntax-cheatsheet\`, Eligian does not have it: read
\`not-eligian\` for the alternative, or ask.

Use these tools whenever a task touches .eligian files, layout HTML, CSS, locales.json or a host
module of an Eligius presentation:
- \`eligian_docs\`: FIRST for a new presentation: ids \`storyboard\`, \`decisions\`, \`project-layout\`,
  then write STORYBOARD.md. Before each construct you have not written this session: its map-*
  card (index) or body (detail:true). Read \`operations-index\` once.
- \`eligian_operations\`: BEFORE calling any operation not in your session so far; batch with
  names:[...]. Cards lead with NEEDS / PROVIDES / ERASES.
- \`eligian_init\`: scaffold a new project from a starter (writes files; next steps in the reply).
- \`eligian_project\`: the ids, classes, locale keys, asset files and host names you may reference.
  Call before writing selectors; layout + CSS come before timelines.
- \`eligian_check\`: after EVERY edit until 0 errors and 0 warnings. Each diagnostic carries its fix.
- \`eligian_fmt\`: write:true once check is clean.
- \`eligian_smoke\`: after fmt; pass a scenario for every interaction you wrote (click, key, seek).
- \`eligian_compile\`: once after your first timeline passes check (select it), and
  whenever behaviour surprises you.

Rules the engine imposes:
1. A fired block has nothing selected. Timeline, lifecycle and init blocks start with {};
   event actions start with {eventArgs}; listener actions get the controller's data plus
   eventTarget/eventKey; a called action gets a copy plus its arguments. Select before you mutate.
2. Nothing flows back from a called action. Start and end blocks are independent runs.
3. The DOM is a function of the position: every visible state belongs to a range that covers it,
   an end block is the exact inverse of its start, and skipped ranges never run on seek.
4. A selector must exist in layout.html or the imported CSS; check rejects the rest.
5. Every controller added in on enter is removed in on leave. Durations live on the timeline,
   not in wait()/animate() milliseconds.
Review STORYBOARD.md against the compiled timelines before declaring done.
`;

/** The numbered engine rules of the instructions, one entry per rule (continuations joined). */
const rulesOf = (text: string): string[] => {
  const start = text.indexOf('Rules the engine imposes:');
  const end = text.indexOf('Review STORYBOARD.md');
  const rules: string[] = [];
  for (const line of text.slice(start, end).split('\n').slice(1)) {
    if (/^\d\. /.test(line)) {
      rules.push(line);
    } else if (line.trim() !== '' && rules.length > 0) {
      rules[rules.length - 1] += `\n${line}`;
    }
  }
  return rules;
};

const occurrences = (text: string, part: string): number => text.split(part).length - 1;

/** The index ids of the real generated docs, for the backtick convention. */
let docsRoot: string;
let ids: ReadonlySet<string>;

beforeAll(async () => {
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-instructions-'));
  await generateKnowledge({ outDir: docsRoot });
  const index = JSON.parse(
    fs.readFileSync(path.join(docsRoot, 'index.json'), 'utf8')
  ) as IndexEntry[];
  ids = new Set(index.map(entry => entry.id));
}, 300_000);

afterAll(() => {
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

/** The backticked tokens of `text` that are neither a Phase 2+ tool nor an index id. */
const unknownTokens = (text: string): string[] => {
  const tokens = [...text.matchAll(/`([^`]+)`/g)]
    .map(match => match[1])
    .filter(token => /^[a-z0-9_/-]+$/.test(token));
  expect(tokens.length).toBeGreaterThan(0);
  const allowed = new Set<string>([...PHASE_2_TOOLS, ...ids]);
  return tokens.filter(token => !allowed.has(token));
};

/** §3.5's `eligian_compile` line, verbatim (FR-050). */
const COMPILE_LINE =
  'once after your first timeline passes check (select it, explain:true), and whenever behaviour surprises you';

describe('mcp instructions', () => {
  it('phase 1 text is within 4096 chars', () => {
    expect(INSTRUCTIONS_PHASE_1.length).toBeGreaterThan(0);
    expect(INSTRUCTIONS_PHASE_1.length).toBeLessThanOrEqual(4096);
    expect(INSTRUCTIONS[1]).toBe(INSTRUCTIONS_PHASE_1);
  });
});

describe('phase 2 instructions', () => {
  const text = INSTRUCTIONS[2];

  it('≤ 4096 chars', () => {
    expect(text.length).toBeLessThanOrEqual(4096);
  });

  it('equals the §3.5 text with I-1', () => {
    expect(text).toBe(EXPECTED_PHASE_2);
  });

  it('backticked tokens are tools or ids', () => {
    expect(unknownTokens(text)).toEqual([]);
  });

  it('names all eight tools', () => {
    for (const tool of PHASE_2_TOOLS) {
      expect(text).toContain(`\`${tool}\``);
    }
  });

  it('has no explain', () => {
    expect(text).not.toContain('explain');
  });
});

describe('phase 3 instructions', () => {
  const text = INSTRUCTIONS[3];

  it('INSTRUCTIONS[3] ≤ 4096, the compile line verbatim, backticked tokens exist', () => {
    expect(INSTRUCTIONS[3]).toBe(text);
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain(`- \`eligian_compile\`: ${COMPILE_LINE}.`);
    expect(unknownTokens(text)).toEqual([]);
  });

  it('is the Phase 2 text with the compile line and the determinism smoke step', () => {
    const expected = EXPECTED_PHASE_2.replace(
      '(click, key, seek).',
      '(click, key, seek), then determinism:true.'
    ).replace(
      'once after your first timeline passes check (select it), and\n  whenever behaviour surprises you.',
      `${COMPILE_LINE}.`
    );
    expect(expected).toContain(COMPILE_LINE);
    expect(text).toBe(expected);
    for (const tool of PHASE_2_TOOLS) expect(text).toContain(`\`${tool}\``);
  });
});

/** Spec 059 Phase 3 (FR-001 to FR-005, SC-004): the brief-first instructions. */
describe('phase 4 instructions', () => {
  const text = INSTRUCTIONS[4];
  const PHASE_4_TOOLS = ['eligian_brief', ...PHASE_2_TOOLS] as const;

  it('MCP_PHASE is 4 and INSTRUCTIONS[4] ≤ 4096', () => {
    expect(MCP_PHASE).toBe(4);
    expect(INSTRUCTIONS[MCP_PHASE]).toBe(text);
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(4096);
  });

  it('the brief line comes first and says approved and addition', () => {
    const intro =
      'Use these tools whenever a task touches .eligian files, layout HTML, CSS, locales.json or a host\nmodule of an Eligius presentation:\n';
    const at = text.indexOf(intro);
    expect(at).toBeGreaterThan(-1);
    const rest = text.slice(at + intro.length);
    expect(rest.startsWith('- `eligian_brief`')).toBe(true);
    // The brief entry: up to the next workflow line.
    const briefEntry = rest.slice(0, rest.indexOf('\n- `', 1));
    expect(briefEntry).toContain('approved');
    expect(briefEntry).toContain('addition');
    expect(rest.indexOf('- `eligian_brief`')).toBeLessThan(rest.indexOf('- `eligian_docs`'));
  });

  it('has the decisions rule', () => {
    expect(text).toContain("Decisions are the user's, facts are yours");
    // After the five engine rules.
    expect(text.indexOf("Decisions are the user's, facts are yours")).toBeGreaterThan(
      text.indexOf('5. Every controller added in on enter')
    );
  });

  it('no storyboard-first docs line', () => {
    expect(text).not.toContain('FIRST for a new presentation: ids');
  });

  it('backticked tokens are tools or ids', () => {
    const unknown = unknownTokens(text).filter(token => token !== 'eligian_brief');
    expect(unknown).toEqual([]);
  });

  it('names all nine tools', () => {
    expect(PHASE_4_TOOLS).toHaveLength(9);
    for (const tool of PHASE_4_TOOLS) expect(text).toContain(`\`${tool}\``);
  });
});

describe('agentsMdBlock', () => {
  // `example` joins ChunkKind with the example chunks (T034); the block already lists them.
  const exampleKind = 'example' as string as ChunkKind;
  const entry = (id: string, title: string, kind: ChunkKind): IndexEntry => ({
    id,
    title,
    kind,
    use_cases: [],
    words: 1,
    see: [],
    card: `${title} card`,
  });
  const index: readonly IndexEntry[] = [
    entry('config-shape', 'The compiled config shape', 'reference'),
    entry('example/click-to-navigate', 'Click to navigate', exampleKind),
    entry('example/staggered-list', 'A staggered list', exampleKind),
    entry('map-timelines', 'Timelines in Eligian', 'mapping'),
    entry('operation/addClass', 'addClass', 'operation'),
    entry('operation/selectElement', 'selectElement', 'operation'),
    entry('starter/blank', 'The blank starter', 'starter'),
    entry('storyboard', 'Write the storyboard first', 'workflow'),
  ];

  it('lists non-operation, non-example ids with title and path; operations and examples by name; both path patterns; names node_modules/eligian/dist/docs/ once', () => {
    const block = agentsMdBlock(index);

    expect(block.startsWith('<!-- eligian:begin -->')).toBe(true);
    expect(block.trimEnd().endsWith('<!-- eligian:end -->')).toBe(true);
    expect(occurrences(block, '<!-- eligian:begin -->')).toBe(1);
    expect(occurrences(block, '<!-- eligian:end -->')).toBe(1);

    // The workflow and the five rules of the current instructions (058 FR-051; 059 FR-006).
    for (const tool of PHASE_2_TOOLS) expect(block).toContain(`\`${tool}\``);
    expect(block).toContain(`- \`eligian_compile\`: ${COMPILE_LINE}.`);
    const rules = rulesOf(INSTRUCTIONS[4]);
    expect(rules.map(rule => rule.slice(0, 2))).toEqual(['1.', '2.', '3.', '4.', '5.']);
    for (const rule of rules) expect(block).toContain(rule);
    expect(block).toContain(
      'Review STORYBOARD.md against the compiled timelines before declaring done.'
    );

    // The docs pointer, once.
    expect(occurrences(block, 'node_modules/eligian/dist/docs')).toBe(1);
    expect(block).toContain('node_modules/eligian/dist/docs/');

    // Every non-operation, non-example id: one line with title and path.
    const lines = block.split('\n');
    expect(lines).toContain(
      '- config-shape: The compiled config shape (generated/config-shape.md)'
    );
    expect(lines).toContain('- map-timelines: Timelines in Eligian (curriculum/map-timelines.md)');
    expect(lines).toContain('- starter/blank: The blank starter (generated/starters/blank.md)');
    expect(lines).toContain('- storyboard: Write the storyboard first (curriculum/storyboard.md)');
    expect(block).not.toMatch(/^- (operation|example)\//m);

    // Operations and examples by name, after their path patterns.
    expect(lines).toContain(
      'Operations (generated/operations/<name>.md; overview: operations-index): addClass, selectElement'
    );
    expect(lines).toContain(
      'Examples (generated/examples/<id>.md): click-to-navigate, staggered-list'
    );
  });

  it('carries the brief line and the decisions rule', () => {
    const block = agentsMdBlock(index);
    const text = INSTRUCTIONS[4];
    const briefLine = text.slice(
      text.indexOf('- `eligian_brief`'),
      text.indexOf('- `eligian_docs`')
    );
    expect(briefLine.startsWith('- `eligian_brief`')).toBe(true);
    expect(block).toContain(briefLine);
    const rule = text.slice(text.indexOf("Decisions are the user's, facts are yours"));
    expect(block).toContain(rule.slice(0, rule.indexOf('\nReview STORYBOARD.md')));
  });

  it('chunkFile gives the generator paths', () => {
    expect(chunkFile(index[1])).toBe('generated/examples/click-to-navigate.md');
    expect(chunkFile(index[4])).toBe('generated/operations/addClass.md');
  });
});
