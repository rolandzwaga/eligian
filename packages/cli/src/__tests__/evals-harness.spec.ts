/**
 * Spec 058 Phase 3 (FR-001, FR-003–FR-009, FR-023; SC-006(1)–(5); plan D4): the eval harness's
 * arguments, arm setup, verdicts, budgets, summary and result-record schema, over recorded run
 * records (`__fixtures__/evals/records/`). The metrics themselves are `evals-transcript.spec.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Arm,
  type Budget,
  budgetFailures,
  caseVerdict,
  HARNESS_USAGE,
  MODELS,
  medianBudget,
  parseHarnessArgs,
  prepareArmProject,
  type RunRecord,
  RunRecordSchema,
  renderSummary,
  writeBudgets,
} from '../mcp/evals/harness.js';
import type { RunMetrics } from '../mcp/evals/transcript.js';

const RECORDS = path.join(__dirname, '__fixtures__', 'evals', 'records');
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(RECORDS, `${name}.json`), 'utf8')) as Record<
    string,
    unknown
  >;
const A1_PASS = fixture('a1-pass') as unknown as RunRecord;

const record = (
  overrides: Partial<Omit<RunRecord, 'metrics'>> & { metrics?: Partial<RunMetrics> } = {}
): RunRecord => ({
  ...A1_PASS,
  ...overrides,
  metrics: { ...A1_PASS.metrics, ...overrides.metrics },
});

const decode = (value: unknown) => Schema.decodeUnknownResult(RunRecordSchema)(value);

const KNOWN = ['title-card', 'fix-dataflow', 'keyboard-deck'];

describe('parseHarnessArgs', () => {
  it('defaults: every case, arm A1, 1 run, no model, call budget enforce', () => {
    expect(parseHarnessArgs([], KNOWN)).toEqual({
      cases: KNOWN,
      arms: ['A1'],
      runs: 1,
      callBudget: 'enforce',
    });
  });

  it('--case and --arm are repeatable', () => {
    const args = parseHarnessArgs(
      ['--case', 'title-card', '--arm', 'A0', '--case', 'fix-dataflow', '--arm', 'A-none'],
      KNOWN
    );
    expect(args).toMatchObject({ cases: ['title-card', 'fix-dataflow'], arms: ['A0', 'A-none'] });
  });

  it('--runs takes a positive integer', () => {
    expect(parseHarnessArgs(['--runs', '3'], KNOWN)).toMatchObject({ runs: 3 });
    expect(typeof parseHarnessArgs(['--runs', '0'], KNOWN)).toBe('string');
    expect(typeof parseHarnessArgs(['--runs', 'two'], KNOWN)).toBe('string');
  });

  it('--model sonnet maps to MODELS.sonnet, opus to MODELS.opus, a pinned id passes through', () => {
    expect(parseHarnessArgs(['--model', 'sonnet'], KNOWN)).toMatchObject({
      model: MODELS.sonnet,
    });
    expect(parseHarnessArgs(['--model', 'opus'], KNOWN)).toMatchObject({ model: MODELS.opus });
    expect(parseHarnessArgs(['--model', 'claude-haiku-5-0'], KNOWN)).toMatchObject({
      model: 'claude-haiku-5-0',
    });
  });

  it('--call-budget off|enforce (default enforce)', () => {
    expect(parseHarnessArgs(['--call-budget', 'off'], KNOWN)).toMatchObject({ callBudget: 'off' });
    expect(parseHarnessArgs(['--call-budget', 'enforce'], KNOWN)).toMatchObject({
      callBudget: 'enforce',
    });
    expect(parseHarnessArgs(['--call-budget', 'maybe'], KNOWN)).toContain('--call-budget');
  });

  it('--write-budgets <run-id>', () => {
    expect(parseHarnessArgs(['--write-budgets', '2026-11-05T10-00-00'], KNOWN)).toMatchObject({
      writeBudgets: '2026-11-05T10-00-00',
    });
  });

  it('an unknown case, an unknown arm, a missing value and an unknown flag are error strings', () => {
    expect(parseHarnessArgs(['--case', 'nope'], KNOWN)).toContain('nope');
    expect(parseHarnessArgs(['--arm', 'A2'], KNOWN)).toContain('A2');
    expect(typeof parseHarnessArgs(['--case'], KNOWN)).toBe('string');
    expect(parseHarnessArgs(['--frobnicate'], KNOWN)).toContain('--frobnicate');
  });

  it('--help → help', () => {
    expect(parseHarnessArgs(['--help'], KNOWN)).toBe('help');
    expect(parseHarnessArgs(['--case', 'title-card', '-h'], KNOWN)).toBe('help');
  });

  it('HARNESS_USAGE names --case, --arm A0|A1|A-none, --runs and --model (SC-006(1))', () => {
    for (const flag of ['--case', '--arm A0|A1|A-none', '--runs', '--model']) {
      expect(HARNESS_USAGE).toContain(flag);
    }
  });
});

describe('caseVerdict', () => {
  const runs = (...outcomes: ('pass' | 'fail' | 'aborted')[]): RunRecord[] =>
    outcomes.map((outcome, i) =>
      record({ n: i + 1, pass: outcome === 'pass', aborted: outcome === 'aborted' })
    );

  it('2 of 3 → pass', () => {
    expect(caseVerdict(runs('pass', 'fail', 'pass'))).toEqual({
      pass: true,
      passed: 2,
      denominator: 3,
    });
  });

  it('1 of 3 → fail', () => {
    expect(caseVerdict(runs('fail', 'pass', 'fail'))).toEqual({
      pass: false,
      passed: 1,
      denominator: 3,
    });
  });

  it('1 of 2 → fail', () => {
    expect(caseVerdict(runs('pass', 'fail'))).toEqual({ pass: false, passed: 1, denominator: 2 });
  });

  it('pass, aborted, fail → fail on a denominator of 2', () => {
    expect(caseVerdict(runs('pass', 'aborted', 'fail'))).toEqual({
      pass: false,
      passed: 1,
      denominator: 2,
    });
  });
});

describe('budgetFailures', () => {
  const budget: Budget = { toolCalls: 40, fromRun: '2026-11-05T10-00-00', model: MODELS.sonnet };
  const metrics = (overrides: Partial<RunMetrics>): RunMetrics => ({
    ...A1_PASS.metrics,
    ...overrides,
  });
  const ARMS: readonly Arm[] = ['A0', 'A1', 'A-none'];

  it('61 > ⌊1.5 × 40⌋ fails with "tool calls 61 > 60", for an A0, an A1 and an A-none record', () => {
    for (const arm of ARMS) {
      const run = record({ arm, metrics: { toolCalls: 61 } });
      expect(budgetFailures(run.metrics, budget, 'enforce')).toEqual(['tool calls 61 > 60']);
    }
  });

  it('60 passes', () => {
    expect(budgetFailures(metrics({ toolCalls: 60 }), budget, 'enforce')).toEqual([]);
  });

  it('off skips the call check', () => {
    expect(budgetFailures(metrics({ toolCalls: 61 }), budget, 'off')).toEqual([]);
    expect(budgetFailures(metrics({ toolCalls: 61 }), undefined, 'off')).toEqual([]);
  });

  it('enforce without a budget fails with "no tool-call budget"', () => {
    expect(budgetFailures(metrics({ toolCalls: 1 }), undefined, 'enforce')).toEqual([
      'no tool-call budget',
    ]);
  });

  it('rounds > 2', () => {
    expect(budgetFailures(metrics({ rounds: 2 }), budget, 'enforce')).toEqual([]);
    const failures = budgetFailures(metrics({ rounds: 3 }), budget, 'enforce');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('rounds 3 > 2');
  });

  it('wall clock > 15 min', () => {
    const limit = 15 * 60 * 1000;
    expect(budgetFailures(metrics({ wallMs: limit }), budget, 'enforce')).toEqual([]);
    expect(budgetFailures(metrics({ wallMs: limit + 1 }), budget, 'enforce')).toEqual([
      `wall clock ${limit + 1} ms > ${limit} ms`,
    ]);
  });

  it('channelChars > 80000', () => {
    expect(budgetFailures(metrics({ channelChars: 80_000 }), budget, 'enforce')).toEqual([]);
    expect(budgetFailures(metrics({ channelChars: 80_001 }), budget, 'off')).toEqual([
      'channelChars 80001 > 80000',
    ]);
  });
});

describe('medianBudget', () => {
  const RUN = '2026-11-05T10-00-00';
  const calls = (toolCalls: number, overrides: Partial<Omit<RunRecord, 'metrics'>> = {}) =>
    record({ ...overrides, metrics: { toolCalls } });

  it('lower median for an even count', () => {
    const runs = [calls(30), calls(50), calls(40), calls(20)];
    expect(medianBudget(runs, RUN)).toEqual({ toolCalls: 30, fromRun: RUN, model: MODELS.sonnet });
  });

  it('the middle value for an odd count', () => {
    expect(medianBudget([calls(40), calls(10), calls(30)], RUN)?.toolCalls).toBe(30);
  });

  it('only passing, non-aborted, pinned-Sonnet A1 runs count', () => {
    const runs = [
      calls(10),
      calls(1, { arm: 'A0' }),
      calls(2, { arm: 'A-none' }),
      calls(3, { pass: false }),
      calls(4, { aborted: true }),
      calls(5, { model: MODELS.opus }),
    ];
    expect(medianBudget(runs, RUN)?.toolCalls).toBe(10);
  });

  it('none → undefined', () => {
    expect(medianBudget([], RUN)).toBeUndefined();
    expect(medianBudget([calls(9, { pass: false }), calls(9, { arm: 'A0' })], RUN)).toBeUndefined();
  });
});

describe('writeBudgets', () => {
  const RUN = '2026-11-05T10-00-00';
  let dir: string;
  const file = (id: string) => path.join(dir, `${id}.json`);
  const TITLE = {
    id: 'title-card',
    prompt: 'Make a title card.',
    entry: 'main.eligian',
    model: 'claude-sonnet-5-5',
    scenario: 'title-card.scenario.json',
  };
  /** Deliberately not in JSON.stringify's layout, so a rewrite would show. */
  const FIX_DATAFLOW = '{"id": "fix-dataflow",   "prompt": "Fix it.", "entry": "main.eligian"}';
  const records = (): RunRecord[] => [
    record({ case: 'title-card', n: 1, metrics: { toolCalls: 12 } }),
    record({ case: 'title-card', n: 2, metrics: { toolCalls: 18 } }),
    record({ case: 'title-card', n: 3, metrics: { toolCalls: 15 } }),
    record({ case: 'fix-dataflow', arm: 'A0', metrics: { toolCalls: 7 } }),
    record({ case: 'fix-dataflow', pass: false, metrics: { toolCalls: 9 } }),
  ];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-evals-budgets-'));
    fs.writeFileSync(file('title-card'), `${JSON.stringify(TITLE, null, 2)}\n`);
    fs.writeFileSync(file('fix-dataflow'), FIX_DATAFLOW);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sets budget with other keys in order and a trailing newline', () => {
    writeBudgets(records(), dir, RUN);
    const text = fs.readFileSync(file('title-card'), 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toBe(
      `${JSON.stringify({ ...TITLE, budget: { toolCalls: 15, fromRun: RUN, model: MODELS.sonnet } }, null, 2)}\n`
    );
    expect(Object.keys(JSON.parse(text) as object)).toEqual([...Object.keys(TITLE), 'budget']);
  });

  it('an existing budget is replaced in place', () => {
    const { scenario, ...rest } = TITLE;
    const old = { ...rest, budget: { toolCalls: 99, fromRun: 'older', model: MODELS.sonnet } };
    fs.writeFileSync(file('title-card'), `${JSON.stringify({ ...old, scenario }, null, 2)}\n`);
    writeBudgets(records(), dir, RUN);
    const written = JSON.parse(fs.readFileSync(file('title-card'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(written)).toEqual([...Object.keys(rest), 'budget', 'scenario']);
    expect(written.budget).toEqual({ toolCalls: 15, fromRun: RUN, model: MODELS.sonnet });
  });

  it('a case without a qualifying run stays byte-identical', () => {
    writeBudgets(records(), dir, RUN);
    expect(fs.readFileSync(file('fix-dataflow'), 'utf8')).toBe(FIX_DATAFLOW);
  });

  it('a second call gives the same bytes', () => {
    writeBudgets(records(), dir, RUN);
    const first = fs.readFileSync(file('title-card'));
    writeBudgets(records(), dir, RUN);
    expect(fs.readFileSync(file('title-card')).equals(first)).toBe(true);
  });

  it('returns only the changed files', () => {
    expect(writeBudgets(records(), dir, RUN)).toEqual([file('title-card')]);
    expect(writeBudgets(records(), dir, RUN)).toEqual([]);
  });
});

describe('prepareArmProject', () => {
  let root: string;
  let dir: string;
  let scratch: string;
  let project: { dir: string; cli: string; mcpLog: string; scratch: string };
  const DOCS = () => path.join(dir, 'node_modules', 'eligian', 'dist', 'docs');
  const AGENTS_BLOCK = '<!-- eligian -->\nUse the eligian MCP server.\n';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-evals-arm-'));
    dir = path.join(root, 'project');
    scratch = path.join(root, 'scratch');
    fs.mkdirSync(path.join(DOCS(), 'generated'), { recursive: true });
    fs.writeFileSync(path.join(DOCS(), 'agents-block.md'), AGENTS_BLOCK);
    fs.writeFileSync(path.join(DOCS(), 'generated', 'operations-index.md'), '# operations\n');
    project = {
      dir,
      cli: path.join(dir, 'node_modules', 'eligian', 'bin', 'cli.js'),
      mcpLog: path.join(dir, 'mcp.log'),
      scratch,
    };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
  const outside = (file: string) => path.relative(dir, file).startsWith('..');

  it('A1: .mcp.json and AGENTS.md, docs kept', () => {
    const setup = prepareArmProject('A1', project);
    expect(setup.mcpConfig).toBe(path.join(dir, '.mcp.json'));
    expect(readJson(setup.mcpConfig)).toEqual({
      mcpServers: {
        eligian: {
          command: 'node',
          args: [project.cli, 'mcp'],
          env: { ELIGIAN_MCP_LOG: project.mcpLog },
        },
      },
    });
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toBe(AGENTS_BLOCK);
    expect(fs.existsSync(path.join(DOCS(), 'generated', 'operations-index.md'))).toBe(true);
    expect(setup.allowedTools).toContain('mcp__eligian__');
  });

  it('A0: AGENTS.md, no .mcp.json in the project, docs kept, mcpConfig outside dir', () => {
    const setup = prepareArmProject('A0', project);
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toBe(AGENTS_BLOCK);
    expect(fs.existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(DOCS(), 'generated', 'operations-index.md'))).toBe(true);
    expect(outside(setup.mcpConfig)).toBe(true);
    expect(readJson(setup.mcpConfig)).toEqual({ mcpServers: {} });
    expect(setup.allowedTools).not.toContain('mcp__eligian__');
  });

  it('A-none: no AGENTS.md, no .mcp.json, no node_modules/eligian/dist/docs', () => {
    const setup = prepareArmProject('A-none', project);
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(DOCS())).toBe(false);
    expect(fs.existsSync(path.join(dir, 'node_modules', 'eligian'))).toBe(true);
    expect(outside(setup.mcpConfig)).toBe(true);
    expect(readJson(setup.mcpConfig)).toEqual({ mcpServers: {} });
    expect(setup.allowedTools).not.toContain('mcp__eligian__');
  });

  it('a scratch dir inside the project is refused', () => {
    expect(() => prepareArmProject('A0', { ...project, scratch: path.join(dir, 'tmp') })).toThrow(
      /outside/
    );
  });
});

describe('RunRecordSchema', () => {
  it('a complete record decodes', () => {
    for (const name of ['a1-pass', 'a0-no-judge']) {
      const decoded = decode(fixture(name));
      expect(Result.isSuccess(decoded), name).toBe(true);
    }
  });

  it('removing any one key fails', () => {
    const complete = fixture('a1-pass');
    const keys = Object.keys(complete);
    expect(keys).toHaveLength(15);
    for (const key of keys) {
      const { [key]: _removed, ...rest } = complete;
      expect(Result.isFailure(decode(rest)), key).toBe(true);
    }
  });

  it('usage: null and rubric: null decode', () => {
    const decoded = decode({ ...fixture('a1-pass'), usage: null, rubric: null });
    expect(Result.isSuccess(decoded)).toBe(true);
  });

  it('metrics: null does not', () => {
    expect(Result.isFailure(decode({ ...fixture('a1-pass'), metrics: null }))).toBe(true);
  });

  it('an unknown arm or assertion kind does not', () => {
    expect(Result.isFailure(decode({ ...fixture('a1-pass'), arm: 'A2' }))).toBe(true);
    const assertions = [{ kind: 'no.such.kind', pass: true, detail: '' }];
    expect(Result.isFailure(decode({ ...fixture('a1-pass'), assertions }))).toBe(true);
  });
});

it('the rubric score does not change the verdict', () => {
  const runs = (score: number) => [
    record({ n: 1, pass: true, rubric: { score, model: MODELS.opus } }),
    record({ n: 2, pass: false, rubric: { score, model: MODELS.opus } }),
    record({ n: 3, pass: true, rubric: { score, model: MODELS.opus } }),
  ];
  expect(caseVerdict(runs(1))).toEqual(caseVerdict(runs(5)));
  for (const run of runs(1)) {
    expect(budgetFailures(run.metrics, undefined, 'off')).toEqual([]);
  }
  const casesPassed = (summary: string) => summary.match(/cases passed: .*/)?.[0];
  expect(casesPassed(renderSummary(runs(1)))).toBe('cases passed: 1 of 14');
  expect(casesPassed(renderSummary(runs(1)))).toBe(casesPassed(renderSummary(runs(5))));
});

describe('renderSummary', () => {
  const rubric = (score: number) => ({ score, model: MODELS.opus });
  const RECORDS_SET: RunRecord[] = [
    record({
      case: 'title-card',
      n: 1,
      rubric: rubric(4),
      metrics: {
        rounds: 0,
        toolCalls: 10,
        transcriptToolChars: 1000,
        toolChars: 800,
        channelChars: 800,
        operationsBeforeFirstUnknown: true,
        hitUnknown: true,
        fmtCalled: true,
        explainCalled: true,
      },
    }),
    record({
      case: 'title-card',
      n: 2,
      rubric: rubric(5),
      metrics: {
        rounds: 2,
        toolCalls: 20,
        transcriptToolChars: 3000,
        toolChars: 1200,
        channelChars: 1200,
        operationsBeforeFirstUnknown: true,
        hitUnknown: false,
        fmtCalled: false,
        explainCalled: false,
      },
    }),
    record({
      case: 'title-card',
      n: 3,
      aborted: true,
      pass: false,
      rubric: null,
      metrics: { rounds: 50, toolCalls: 999, transcriptToolChars: 99_999 },
    }),
    record({
      case: 'fix-dataflow',
      n: 1,
      pass: false,
      rubric: rubric(3),
      metrics: {
        rounds: 4,
        toolCalls: 30,
        transcriptToolChars: 5000,
        toolChars: 2000,
        channelChars: 2000,
        operationsBeforeFirstUnknown: false,
        hitUnknown: true,
        fmtCalled: false,
        explainCalled: false,
      },
    }),
    record({
      case: 'title-card',
      arm: 'A0',
      n: 1,
      rubric: rubric(2),
      metrics: {
        rounds: 1,
        toolCalls: 40,
        transcriptToolChars: 9000,
        toolChars: 0,
        channelChars: 7000,
        operationsBeforeFirstUnknown: false,
        hitUnknown: false,
        fmtCalled: false,
        explainCalled: false,
      },
    }),
  ];
  const section = (summary: string, arm: Arm): string => {
    const parts = summary.split(/^## /m);
    const found = parts.find(part => part.startsWith(`${arm}\n`));
    expect(found, `section ${arm}`).toBeDefined();
    return found!;
  };

  it('one section per arm, A1 first', () => {
    const summary = renderSummary(RECORDS_SET);
    expect(summary.indexOf('## A1')).toBeGreaterThan(-1);
    expect(summary.indexOf('## A1')).toBeLessThan(summary.indexOf('## A0'));
    expect(summary).not.toContain('## A-none');
  });

  it('A1: cases passed out of 14, the all-runs and passing-runs means, aborted excluded', () => {
    const a1 = section(renderSummary(RECORDS_SET), 'A1');
    expect(a1).toContain('- runs: 4, aborted 1');
    expect(a1).toContain('- cases passed: 1 of 14');
    expect(a1).toContain(
      '- means over all runs (aborted excluded, n = 3): rounds 2.0, tool calls 20.0, transcriptToolChars 3000.0'
    );
    expect(a1).toContain(
      '- means over passing runs (n = 2): rounds 1.0, tool calls 15.0, transcriptToolChars 2000.0'
    );
    expect(a1).toContain('- means of toolChars 1333.3, channelChars 1333.3');
  });

  it('A1: the SC-003 fraction with its denominator, the hitUnknown fraction, fmtCalled, rubric', () => {
    const a1 = section(renderSummary(RECORDS_SET), 'A1');
    expect(a1).toContain(
      '- operationsBeforeFirstUnknown: 2 of 3 (67%); over the hitUnknown runs: 1 of 2 (50%)'
    );
    expect(a1).toContain('- fmtCalled: 1 of 3 (33%)');
    expect(a1).toContain('- explainCalled: 1 of 3 (33%)');
    expect(a1).toContain('- rubric mean: 4.0 (3 scored)');
  });

  it('A0: its own numbers, n/a where nothing counts', () => {
    const a0 = section(renderSummary(RECORDS_SET), 'A0');
    expect(a0).toContain('- cases passed: 1 of 14');
    expect(a0).toContain(
      '- means over all runs (aborted excluded, n = 1): rounds 1.0, tool calls 40.0, transcriptToolChars 9000.0'
    );
    expect(a0).toContain('- means of toolChars 0.0, channelChars 7000.0');
    expect(a0).toContain(
      '- operationsBeforeFirstUnknown: 0 of 1 (0%); over the hitUnknown runs: 0 of 0 (n/a)'
    );
    expect(a0).toContain('- rubric mean: 2.0 (1 scored)');
  });

  it('a per-case table with the majority verdict', () => {
    const a1 = section(renderSummary(RECORDS_SET), 'A1');
    expect(a1).toContain('| title-card | 2 of 2 | pass |');
    expect(a1).toContain('| fix-dataflow | 0 of 1 | fail |');
  });

  it('no non-aborted runs → n/a means', () => {
    const a1 = section(renderSummary([record({ aborted: true, pass: false })]), 'A1');
    expect(a1).toContain('- cases passed: 0 of 14');
    expect(a1).toContain(
      '- means over all runs (aborted excluded, n = 0): rounds n/a, tool calls n/a, transcriptToolChars n/a'
    );
    expect(a1).toContain('- rubric mean: n/a (0 scored)');
  });
});
