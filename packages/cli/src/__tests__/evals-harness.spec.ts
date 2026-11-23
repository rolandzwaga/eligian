/**
 * Spec 058 Phase 3 (FR-001, FR-003–FR-009, FR-023; SC-006(1)–(5); plan D4): the eval harness's
 * arguments, arm setup, verdicts, budgets, summary and result-record schema, over recorded run
 * records (`__fixtures__/evals/records/`). The metrics themselves are `evals-transcript.spec.ts`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseBrief } from '../mcp/brief/brief-file.js';
import { briefStateOf } from '../mcp/evals/brief-fixture.js';
import {
  type Arm,
  agentIsolation,
  type Budget,
  budgetFailures,
  caseAgentArgv,
  caseVerdict,
  elicitationHookCommand,
  HARNESS_USAGE,
  ISOLATION_ENV,
  interviewTurnArgv,
  MODELS,
  medianBudget,
  noToolsArgv,
  parseHarnessArgs,
  prepareArmProject,
  type RunRecord,
  RunRecordSchema,
  renderSummary,
  spawnEnv,
  writeBudgets,
} from '../mcp/evals/harness.js';
import { computeMetrics, type RunMetrics } from '../mcp/evals/transcript.js';
import { loadPersona, runPersona, type Step } from './brief-persona-driver.js';
import { startInMemoryServer } from './mcp-test-client.js';

const DOCS_MINI = path.join(__dirname, '__fixtures__', 'mcp', 'docs-mini');
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

  // Spec 059 phase 3 (FR-034, SC-020 arguments, P6)
  describe('persona mode', () => {
    it('--persona with --case is an error string', () => {
      expect(typeof parseHarnessArgs(['--persona', 'vague', '--case', 'title-card'], KNOWN)).toBe(
        'string'
      );
    });

    it('--persona with --write-budgets is an error string', () => {
      expect(typeof parseHarnessArgs(['--persona', 'vague', '--write-budgets', 'x'], KNOWN)).toBe(
        'string'
      );
    });

    it('--persona with an --arm other than A1 is an error string', () => {
      expect(typeof parseHarnessArgs(['--persona', 'vague', '--arm', 'A0'], KNOWN)).toBe('string');
      expect(parseHarnessArgs(['--persona', 'vague', '--arm', 'A1'], KNOWN)).toMatchObject({
        arms: ['A1'],
        personas: ['vague'],
      });
    });

    it('--persona alone sets the arms to A1 and the personas', () => {
      expect(parseHarnessArgs(['--persona', 'vague'], KNOWN)).toMatchObject({
        arms: ['A1'],
        personas: ['vague'],
      });
    });

    it('--persona is repeatable', () => {
      const args = parseHarnessArgs(
        ['--persona', 'terse', '--persona', 'detailed', '--persona', 'vague', '--persona', 'terse'],
        KNOWN
      );
      expect(args).toMatchObject({ personas: ['terse', 'detailed', 'vague'] });
    });

    it('--persona with an unknown name is an error string', () => {
      const args = parseHarnessArgs(['--persona', 'nobody'], KNOWN);
      expect(typeof args).toBe('string');
      expect(args).toContain('nobody');
    });

    it('--user-model without --persona is an error string', () => {
      expect(typeof parseHarnessArgs(['--user-model', 'm'], KNOWN)).toBe('string');
    });

    it('--user-model sonnet|opus maps through MODELS, a pinned id passes through', () => {
      const withModel = (value: string) =>
        parseHarnessArgs(['--persona', 'terse', '--user-model', value], KNOWN);
      expect(withModel('sonnet')).toMatchObject({ userModel: MODELS.sonnet });
      expect(withModel('opus')).toMatchObject({ userModel: MODELS.opus });
      expect(withModel('claude-haiku-5-0')).toMatchObject({ userModel: 'claude-haiku-5-0' });
    });

    it('persona mode without --user-model has no userModel key', () => {
      const args = parseHarnessArgs(['--persona', 'terse'], KNOWN);
      expect(typeof args).toBe('object');
      expect('userModel' in (args as object)).toBe(false);
    });

    it('HARNESS_USAGE names --persona and --user-model', () => {
      expect(HARNESS_USAGE).toContain('--persona');
      expect(HARNESS_USAGE).toContain('--user-model');
    });
  });
});

// Spec 059 phase 3 (FR-048, SC-023; plan "Isolation", P2)
describe('agentIsolation', () => {
  it('args and env as plan.md fixes them', () => {
    expect(agentIsolation()).toEqual({
      args: ['--setting-sources', 'project,local'],
      env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
    });
    expect(agentIsolation([])).toEqual(agentIsolation());
  });

  it('disables each installed plugin', () => {
    const isolation = agentIsolation(['eligian@eligian', 'x@y']);
    expect(isolation.args.slice(0, 2)).toEqual(['--setting-sources', 'project,local']);
    expect(isolation.args.slice(-2)).toEqual([
      '--settings',
      JSON.stringify({ enabledPlugins: { 'eligian@eligian': false, 'x@y': false } }),
    ]);
    expect(isolation.env).toEqual({ CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' });
  });

  it('ISOLATION_ENV is ELIGIAN_EVAL_ISOLATION', () => {
    expect(ISOLATION_ENV).toBe('ELIGIAN_EVAL_ISOLATION');
  });
});

describe('argv builders', () => {
  const isolation = agentIsolation(['p@q']);
  const setup = { mcpConfig: '/p/.mcp.json', allowedTools: 'mcp__eligian__*,Bash(node *)' };
  const startsWithIsolation = (argv: readonly string[]) =>
    expect(argv.slice(0, isolation.args.length)).toEqual(isolation.args);

  it('caseAgentArgv: the isolation args, then the flags of run.ts in their order', () => {
    const argv = caseAgentArgv({ prompt: 'Make a title card.', setup, model: 'm', isolation });
    startsWithIsolation(argv);
    expect(argv.slice(isolation.args.length)).toEqual([
      '-p',
      'Make a title card.',
      '--mcp-config',
      setup.mcpConfig,
      '--strict-mcp-config',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      setup.allowedTools,
      '--output-format',
      'json',
      '--model',
      'm',
    ]);
  });

  it('interviewTurnArgv: turn 1 without --resume', () => {
    const argv = interviewTurnArgv({
      message: 'Hello there',
      sessionId: undefined,
      setup,
      model: 'm',
      isolation,
    });
    startsWithIsolation(argv);
    expect(argv).not.toContain('--resume');
    expect(argv.slice(isolation.args.length)).toEqual(
      caseAgentArgv({ prompt: 'Hello there', setup, model: 'm', isolation }).slice(
        isolation.args.length
      )
    );
  });

  it('interviewTurnArgv: turn 2 with --resume <id>', () => {
    const argv = interviewTurnArgv({
      message: 'yes',
      sessionId: 'session-1',
      setup,
      model: 'm',
      isolation,
    });
    startsWithIsolation(argv);
    expect(argv).toContain('-p');
    expect(argv[argv.indexOf('-p') + 1]).toBe('yes');
    expect(argv[argv.indexOf('--resume') + 1]).toBe('session-1');
  });

  it('noToolsArgv: the isolation args, then the judge flags of run.ts', () => {
    const argv = noToolsArgv({ model: 'm', mcpConfig: '/s/mcp-empty.json', isolation });
    startsWithIsolation(argv);
    expect(argv.slice(isolation.args.length)).toEqual([
      '-p',
      '--output-format',
      'json',
      '--model',
      'm',
      '--strict-mcp-config',
      '--mcp-config',
      '/s/mcp-empty.json',
      '--tools',
      '',
    ]);
  });
});

describe('spawnEnv', () => {
  const isolation = agentIsolation(['p@q']);

  it('holds isolation.env, ELIGIAN_EVAL_ISOLATION (the JSON of the isolation) and setup.env over base', () => {
    const env = spawnEnv({
      base: { PATH: '/bin', ELIGIAN_MCP_LOG: 'old', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0' },
      setup: { env: { ELIGIAN_MCP_LOG: '/s/mcp.log', ELIGIAN_STATE_DIR: '/s/state' } },
      isolation,
    });
    expect(env).toEqual({
      PATH: '/bin',
      ELIGIAN_MCP_LOG: '/s/mcp.log',
      ELIGIAN_STATE_DIR: '/s/state',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      [ISOLATION_ENV]: JSON.stringify(isolation),
    });
    expect(JSON.parse(env[ISOLATION_ENV]!)).toEqual(isolation);
  });

  it('without a setup holds isolation.env and ELIGIAN_EVAL_ISOLATION', () => {
    const env = spawnEnv({ base: { PATH: '/bin' }, isolation });
    expect(env).toEqual({
      PATH: '/bin',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      [ISOLATION_ENV]: JSON.stringify(isolation),
    });
  });
});

// Spec 059 phase 3 (FR-032, SC-015)
describe('computeMetrics', () => {
  const pair = (id: string, name: string) => [
    {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id, name, input: {} }] },
    },
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: id, content: '{}' }] },
    },
  ];

  it('eligian_brief calls do not count', () => {
    const events = [
      ...pair('t1', 'Read'),
      ...pair('t2', 'mcp__eligian__eligian_check'),
      ...pair('t3', 'Write'),
    ];
    const withBrief = [
      ...pair('b1', 'mcp__eligian__eligian_brief'),
      ...events.slice(0, 2),
      ...pair('b2', 'mcp__eligian__eligian_brief'),
      ...events.slice(2),
      ...pair('b3', 'mcp__eligian__eligian_brief'),
    ];
    const log = [{ tool: 'eligian_check', chars: 10 }];
    expect(computeMetrics('A1', events, log).toolCalls).toBe(3);
    expect(computeMetrics('A1', withBrief, log).toolCalls).toBe(
      computeMetrics('A1', events, log).toolCalls
    );
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

  it('A1: .mcp.json and AGENTS.md, docs kept', async () => {
    const setup = await prepareArmProject('A1', project);
    expect(setup.mcpConfig).toBe(path.join(dir, '.mcp.json'));
    expect(readJson(setup.mcpConfig)).toEqual({
      mcpServers: {
        eligian: {
          command: 'node',
          args: [project.cli, 'mcp'],
          env: { ELIGIAN_MCP_LOG: project.mcpLog, ELIGIAN_STATE_DIR: path.join(scratch, 'state') },
        },
      },
    });
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toBe(AGENTS_BLOCK);
    expect(fs.existsSync(path.join(DOCS(), 'generated', 'operations-index.md'))).toBe(true);
    expect(setup.allowedTools).toContain('mcp__eligian__');
  });

  it('A0: AGENTS.md, no .mcp.json in the project, docs kept, mcpConfig outside dir', async () => {
    const setup = await prepareArmProject('A0', project);
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toBe(AGENTS_BLOCK);
    expect(fs.existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(DOCS(), 'generated', 'operations-index.md'))).toBe(true);
    expect(outside(setup.mcpConfig)).toBe(true);
    expect(readJson(setup.mcpConfig)).toEqual({ mcpServers: {} });
    expect(setup.allowedTools).not.toContain('mcp__eligian__');
  });

  it('A-none: no AGENTS.md, no .mcp.json, no node_modules/eligian/dist/docs', async () => {
    const setup = await prepareArmProject('A-none', project);
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(DOCS())).toBe(false);
    expect(fs.existsSync(path.join(dir, 'node_modules', 'eligian'))).toBe(true);
    expect(outside(setup.mcpConfig)).toBe(true);
    expect(readJson(setup.mcpConfig)).toEqual({ mcpServers: {} });
    expect(setup.allowedTools).not.toContain('mcp__eligian__');
  });

  it('a scratch dir inside the project is refused', async () => {
    await expect(
      prepareArmProject('A0', { ...project, scratch: path.join(dir, 'tmp') })
    ).rejects.toThrow(/outside/);
  });

  // Spec 059 phase 3 (FR-029 to FR-031, FR-040, SC-015; plan §10, P5)
  describe('the brief fixture and the Elicitation hook', () => {
    const NOW = new Date('2026-11-20T00:00:00Z');
    const SCRIPT = path.join(os.tmpdir(), 'evals', 'mcp', 'elicitation-hook.cjs');
    const log = () => path.join(scratch, 'elicitations.log');
    const settingsFile = () => path.join(dir, '.claude', 'settings.json');
    const accept = { mode: 'accept', script: SCRIPT } as const;
    /** The complete, unconfirmed `BRIEF.md` of the terse persona (built as in T005). */
    let briefText: string;
    const temps: string[] = [];

    beforeAll(async () => {
      const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-harness-brief-')));
      const stateA = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-harness-st-')));
      temps.push(cwd, stateA);
      const server = await startInMemoryServer({
        cwd,
        docsRoot: DOCS_MINI,
        brief: { stateDir: stateA },
      });
      try {
        const call = async (args: Record<string, unknown>): Promise<Step> => {
          const { payload, isError } = await server.callTool('eligian_brief', args);
          if (isError) throw new Error(`eligian_brief failed: ${JSON.stringify(payload)}`);
          return payload as Step;
        };
        const persona = loadPersona('terse');
        const run = await runPersona(
          persona,
          answers => call({ action: 'answer', answers }),
          () => call({ action: 'status', idea: persona.idea })
        );
        expect(run.final.state).toBe('complete');
      } finally {
        await server.close();
      }
      briefText = fs.readFileSync(path.join(cwd, 'BRIEF.md'), 'utf8');
    }, 60_000);

    afterAll(() => {
      for (const temp of temps.splice(0)) fs.rmSync(temp, { recursive: true, force: true });
    });

    const hookEntries = (): unknown[] => {
      const settings = readJson(settingsFile()) as { hooks: Record<string, unknown[]> };
      expect(Object.keys(settings.hooks)).toEqual(['Elicitation']);
      return settings.hooks.Elicitation!;
    };

    it('A1 with a fixture writes a confirmed BRIEF.md, the accept hook and ELIGIAN_STATE_DIR', async () => {
      const setup = await prepareArmProject('A1', {
        ...project,
        hook: accept,
        brief: { fixture: briefText, caseId: 'title-card', now: NOW },
      });
      const stateDir = path.join(scratch, 'state');
      expect(setup.stateDir).toBe(stateDir);
      expect(setup.briefFixture).toBe(true);
      expect(setup.env).toEqual({ ELIGIAN_MCP_LOG: project.mcpLog, ELIGIAN_STATE_DIR: stateDir });

      expect(await briefStateOf(dir, stateDir)).toBe('confirmed');
      const confirmation = parseBrief(fs.readFileSync(path.join(dir, 'BRIEF.md'), 'utf8')).brief
        .confirmation;
      expect(confirmation?.mode).toBe('agent-reported');
      expect(confirmation?.message).toBe('eval harness: the brief fixture of case title-card');

      const command = elicitationHookCommand(accept, log());
      expect(command).toBe(`node ${slashed(SCRIPT)} accept ${slashed(log())}`);
      expect(hookEntries()).toEqual([{ hooks: [{ type: 'command', command }] }]);

      const server = (readJson(setup.mcpConfig) as { mcpServers: { eligian: { env: unknown } } })
        .mcpServers.eligian;
      expect(server.env).toEqual({
        ELIGIAN_MCP_LOG: project.mcpLog,
        ELIGIAN_STATE_DIR: stateDir,
      });
    });

    it('the state dir is outside the project', async () => {
      const setup = await prepareArmProject('A1', {
        ...project,
        hook: accept,
        brief: { fixture: briefText, caseId: 'title-card', now: NOW },
      });
      expect(setup.stateDir).toBeDefined();
      expect(outside(setup.stateDir!)).toBe(true);
      expect(path.relative(scratch, setup.stateDir!)).toBe('state');
      expect(fs.existsSync(path.join(dir, 'state'))).toBe(false);
    });

    it('A1 without a fixture writes no BRIEF.md but keeps the state dir', async () => {
      const setup = await prepareArmProject('A1', { ...project, hook: accept });
      expect(setup.briefFixture).toBe(false);
      expect(setup.stateDir).toBe(path.join(scratch, 'state'));
      expect(fs.existsSync(path.join(dir, 'BRIEF.md'))).toBe(false);
      expect(hookEntries()).toHaveLength(1);
    });

    it('A0 and A-none write none of these', async () => {
      for (const arm of ['A0', 'A-none'] as const) {
        const setup = await prepareArmProject(arm, {
          ...project,
          hook: accept,
          brief: { fixture: briefText, caseId: 'title-card', now: NOW },
        });
        expect(fs.existsSync(path.join(dir, 'BRIEF.md')), arm).toBe(false);
        expect(fs.existsSync(path.join(dir, '.claude')), arm).toBe(false);
        expect(fs.existsSync(path.join(scratch, 'state')), arm).toBe(false);
        expect('stateDir' in setup, arm).toBe(false);
        expect(setup.briefFixture, arm).toBe(false);
        expect(setup.env, arm).toEqual({});
      }
    });

    it('the persona variant writes the persona hook with timeout 180', async () => {
      const sheet = path.join(os.tmpdir(), 'evals', 'mcp', 'personas', 'vague.json');
      const conversation = path.join(scratch, 'interview', 'conversation.json');
      const hook = {
        mode: 'persona',
        script: SCRIPT,
        sheet,
        conversation,
        userModel: MODELS.opus,
      } as const;
      const setup = await prepareArmProject('A1', { ...project, hook });
      expect(setup.briefFixture).toBe(false);
      expect(fs.existsSync(path.join(dir, 'BRIEF.md'))).toBe(false);
      const command = elicitationHookCommand(hook, log());
      expect(command).toBe(
        `node ${slashed(SCRIPT)} persona ${slashed(log())} --sheet ${slashed(sheet)} --conversation ${slashed(conversation)} --user-model ${MODELS.opus}`
      );
      expect(hookEntries()).toEqual([{ hooks: [{ type: 'command', command, timeout: 180 }] }]);
    });

    it('an invalid fixture throws "brief fixture of <id>: …"', async () => {
      const open = briefText.replace(/^### P1:[\s\S]*?(?=^### )/m, '');
      expect(open).not.toBe(briefText);
      await expect(
        prepareArmProject('A1', {
          ...project,
          hook: accept,
          brief: { fixture: open, caseId: 'title-card', now: NOW },
        })
      ).rejects.toThrow(/^brief fixture of title-card: the brief is open: .*P1/);
    });
  });
});

/** FR-076: a path as the hook command writes it. */
const slashed = (file: string): string => file.replace(/\\/g, '/');

describe('elicitationHookCommand', () => {
  const persona = {
    mode: 'persona',
    script: '/r/evals/mcp/elicitation-hook.cjs',
    sheet: '/r/evals/mcp/personas/terse.json',
    conversation: '/s/interview/conversation.json',
    userModel: 'claude-sonnet-5-5',
  } as const;

  it('the persona command carries --user-model <userModel>', () => {
    const command = elicitationHookCommand(persona, '/s/elicitations.log');
    expect(command).toBe(
      'node /r/evals/mcp/elicitation-hook.cjs persona /s/elicitations.log --sheet /r/evals/mcp/personas/terse.json --conversation /s/interview/conversation.json --user-model claude-sonnet-5-5'
    );
  });

  it('the accept command carries none', () => {
    const command = elicitationHookCommand(
      { mode: 'accept', script: persona.script },
      '/s/elicitations.log'
    );
    expect(command).toBe('node /r/evals/mcp/elicitation-hook.cjs accept /s/elicitations.log');
    expect(command).not.toContain('--user-model');
  });

  it('a path with a space is quoted, the others are not', () => {
    const command = elicitationHookCommand(
      { mode: 'accept', script: 'C:\\Program Files\\hook.cjs' },
      'C:\\tmp\\elicitations.log'
    );
    expect(command).toBe('node "C:/Program Files/hook.cjs" accept C:/tmp/elicitations.log');
  });

  it('SC-035 (FR-076): Windows paths are written with forward slashes, which bash keeps', () => {
    const command = elicitationHookCommand(
      { ...persona, script: 'F:\\r\\evals\\mcp\\elicitation-hook.cjs' },
      'C:\\Users\\me\\Temp\\scratch\\elicitations.log'
    );
    expect(command).toBe(
      'node F:/r/evals/mcp/elicitation-hook.cjs persona C:/Users/me/Temp/scratch/elicitations.log --sheet /r/evals/mcp/personas/terse.json --conversation /s/interview/conversation.json --user-model claude-sonnet-5-5'
    );
    expect(command).not.toContain('\\');
  });
});

/**
 * Spec 059 FR-030, FR-040, SC-015, SC-020, SC-023 (plan §12): the harness's `Elicitation` hook,
 * spawned as Claude Code runs it (`node <script> <mode> <log> …`, the hook input on stdin).
 */
describe('elicitation-hook.cjs', () => {
  const REPO = path.resolve(__dirname, '..', '..', '..', '..');
  const HOOK = path.join(REPO, 'evals', 'mcp', 'elicitation-hook.cjs');
  const SLOW = 60_000;
  const ACCEPT_APPROVED =
    '{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"accept","content":{"approved":true}}}';
  const DECLINE = '{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"decline"}}';
  const MESSAGE = 'Approve the storyboard? (4 beats, 1 interaction) marker-message-7f3a';
  const CONFIRM = 'End your reply with one line of JSON: {"confirm": true} or {"confirm": false}.';

  /** The `spikes.md` §4.2 input, from the `eligian` server, with `approved` required. */
  const hookInput = (over: Record<string, unknown> = {}) => ({
    hook_event_name: 'Elicitation',
    mcp_server_name: 'eligian',
    message: MESSAGE,
    mode: 'form',
    requested_schema: {
      type: 'object',
      properties: { approved: { type: 'boolean' } },
      required: ['approved'],
    },
    ...over,
  });

  let root: string;
  let log: string;
  let sheet: string;
  let conversation: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-elicit-hook-')));
    log = path.join(root, 'scratch', 'elicitations.log');
    sheet = path.join(root, 'terse.json');
    conversation = path.join(root, 'conversation.json');
    fs.writeFileSync(sheet, '{"idea":"marker-sheet-91c2"}\n');
    fs.writeFileSync(
      conversation,
      '[{"role":"user","text":"marker-conversation-4be8"},{"role":"agent","text":"Shall I?"}]\n'
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The key the OS spells `PATH` with (`Path` on Windows), kept so the child sees one key. */
  const PATH_KEY = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';

  /** `process.env` without the hook's and the stubs' variables, plus `extra`. */
  const envWith = (extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('STUB_') || key.startsWith('ELIGIAN_EVAL_')) continue;
      env[key] = value;
    }
    return { ...env, ...extra };
  };

  const runHook = (
    script: string,
    args: readonly string[],
    input: unknown,
    env: NodeJS.ProcessEnv = envWith()
  ) =>
    spawnSync(process.execPath, [script, ...args], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env,
      timeout: SLOW,
    });

  const logLines = (): Record<string, unknown>[] =>
    fs
      .readFileSync(log, 'utf8')
      .split('\n')
      .filter(line => line !== '')
      .map(line => JSON.parse(line) as Record<string, unknown>);

  /** Appends `{ argv, stdin, env }` to `STUB_MARKER`, prints `STUB_REPLY`, exits `STUB_EXIT`. */
  const STUB = `'use strict';
const fs = require('node:fs');
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const stdin = Buffer.concat(chunks).toString('utf8');
  const env = { CLAUDE_CODE_DISABLE_AUTO_MEMORY: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY };
  fs.appendFileSync(process.env.STUB_MARKER, JSON.stringify({ argv: process.argv.slice(2), stdin, env }) + '\\n');
  process.stdout.write(process.env.STUB_REPLY ?? '', () => process.exit(Number(process.env.STUB_EXIT ?? 0)));
});
`;

  const markerLines = (marker: string) =>
    fs
      .readFileSync(marker, 'utf8')
      .split('\n')
      .filter(line => line !== '')
      .map(
        line => JSON.parse(line) as { argv: string[]; stdin: string; env: Record<string, unknown> }
      );

  describe('accept', () => {
    it('accepts approved', () => {
      const result = runHook(HOOK, ['accept', log], hookInput());
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(ACCEPT_APPROVED);
    });

    it('takes the field name from requested_schema', () => {
      const input = hookInput({
        requested_schema: {
          type: 'object',
          properties: { confirmed: { type: 'boolean' } },
          required: ['confirmed'],
        },
      });
      const result = runHook(HOOK, ['accept', log], input);
      expect(JSON.parse(result.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: 'Elicitation',
          action: 'accept',
          content: { confirmed: true },
        },
      });
    });

    it('declines another server', () => {
      const result = runHook(HOOK, ['accept', log], hookInput({ mcp_server_name: 'other' }));
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).hookSpecificOutput.action).toBe('decline');
      expect(result.stdout).toBe(DECLINE);
    });

    it('declines a mode other than form', () => {
      const result = runHook(HOOK, ['accept', log], hookInput({ mode: 'url' }));
      expect(result.stdout).toBe(DECLINE);
    });

    it('appends to the log', () => {
      runHook(HOOK, ['accept', log], hookInput());
      runHook(HOOK, ['accept', log], hookInput({ mcp_server_name: 'other' }));
      const lines = logLines();
      expect(lines).toHaveLength(2);
      expect(lines[0].input).toEqual(hookInput());
      expect(lines[0].answer).toEqual(JSON.parse(ACCEPT_APPROVED));
      expect(lines[0]).toHaveProperty('raw');
      expect(lines[1].input).toEqual(hookInput({ mcp_server_name: 'other' }));
      expect(lines[1].answer).toEqual(JSON.parse(DECLINE));
    });
  });

  describe('persona with ELIGIAN_EVAL_USER_COMMAND', () => {
    let stub: string;
    let marker: string;

    beforeEach(() => {
      stub = path.join(root, 'user-stub.cjs');
      marker = path.join(root, 'marker.ndjson');
      fs.writeFileSync(stub, STUB);
    });

    const persona = (reply: string, exit = 0) =>
      runHook(
        HOOK,
        ['persona', log, '--sheet', sheet, '--conversation', conversation],
        hookInput(),
        envWith({
          ELIGIAN_EVAL_USER_COMMAND: JSON.stringify(['node', stub]),
          STUB_MARKER: marker,
          STUB_REPLY: reply,
          STUB_EXIT: String(exit),
        })
      );

    it('true → accept', () => {
      const result = persona('Yes, that is what I asked for.\n\n{"confirm": true}\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(ACCEPT_APPROVED);
      expect(logLines()[0].raw).toContain('{"confirm": true}');
    });

    it('false → decline', () => {
      const result = persona('No, the outro is missing.\n{"confirm": false}\n');
      expect(result.stdout).toBe(DECLINE);
    });

    it('garbage → decline', () => {
      const result = persona('garbage');
      expect(result.stdout).toBe(DECLINE);
    });

    it('non-zero → decline', () => {
      const result = persona('{"confirm": true}\n', 3);
      expect(result.stdout).toBe(DECLINE);
    });

    it('the stub reads the message, the sheet and the conversation', () => {
      persona('{"confirm": true}');
      const [call] = markerLines(marker);
      expect(call.stdin).toContain('marker-message-7f3a');
      expect(call.stdin).toContain('marker-sheet-91c2');
      expect(call.stdin).toContain('marker-conversation-4be8');
      expect(call.stdin).toContain(CONFIRM);
      const prompt = fs.readFileSync(path.join(REPO, 'evals', 'mcp', 'simulated-user.md'), 'utf8');
      expect(call.stdin).toContain(prompt.trim());
    });

    it('another server declines without running the user model', () => {
      runHook(
        HOOK,
        ['persona', log, '--sheet', sheet, '--conversation', conversation],
        hookInput({ mcp_server_name: 'other' }),
        envWith({
          ELIGIAN_EVAL_USER_COMMAND: JSON.stringify(['node', stub]),
          STUB_MARKER: marker,
          STUB_REPLY: '{"confirm": true}',
        })
      );
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('a missing simulated-user.md declines and logs its path', () => {
      const copy = path.join(root, 'bare', 'elicitation-hook.cjs');
      fs.mkdirSync(path.dirname(copy));
      fs.copyFileSync(HOOK, copy);
      const result = runHook(
        copy,
        ['persona', log, '--sheet', sheet, '--conversation', conversation],
        hookInput(),
        envWith({
          ELIGIAN_EVAL_USER_COMMAND: JSON.stringify(['node', stub]),
          STUB_MARKER: marker,
          STUB_REPLY: '{"confirm": true}',
        })
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(DECLINE);
      expect(String(logLines()[0].reason)).toContain(path.join(root, 'bare', 'simulated-user.md'));
      expect(fs.existsSync(marker)).toBe(false);
    });
  });

  describe('persona with a stub claude', () => {
    let bin: string;
    let marker: string;

    /** A temp `bin/` with a stub `claude` (`claude.cmd` on Windows), as `hook-prefilter.spec.ts`. */
    beforeEach(() => {
      bin = path.join(root, 'bin');
      marker = path.join(root, 'claude-marker.ndjson');
      fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, 'stub.cjs'), STUB);
      if (process.platform === 'win32') {
        fs.writeFileSync(path.join(bin, 'claude.cmd'), '@node "%~dp0stub.cjs" %*\r\n');
      } else {
        // Absolute paths, no `dirname`: claudeEnv's PATH holds only the stub and node directories.
        const claude = path.join(bin, 'claude');
        const stub = `'${path.join(bin, 'stub.cjs').replace(/'/g, `'\\''`)}'`;
        const node = `'${process.execPath.replace(/'/g, `'\\''`)}'`;
        fs.writeFileSync(claude, `#!/bin/sh\nexec ${node} ${stub} "$@"\n`);
        fs.chmodSync(claude, 0o755);
      }
    });

    const claudeEnv = (extra: Readonly<Record<string, string>> = {}) => {
      const env = envWith({
        STUB_MARKER: marker,
        STUB_REPLY: JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Looks right to me.\n{"confirm": true}',
        }),
        ...extra,
      });
      for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
      env[PATH_KEY] = [bin, path.dirname(process.execPath)].join(path.delimiter);
      return env;
    };

    it(
      'persona with a stub claude and no ELIGIAN_EVAL_USER_COMMAND passes the isolation args and --model <the --user-model argument>',
      () => {
        const isolation = agentIsolation(['p@q']);
        const result = runHook(
          HOOK,
          [
            'persona',
            log,
            '--sheet',
            sheet,
            '--conversation',
            conversation,
            '--user-model',
            'claude-opus-5-5',
          ],
          hookInput(),
          claudeEnv({ [ISOLATION_ENV]: JSON.stringify(isolation) })
        );
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(ACCEPT_APPROVED);
        const [call] = markerLines(marker);
        expect(call.argv.slice(0, isolation.args.length)).toEqual(isolation.args);
        const model = call.argv.indexOf('--model');
        expect(call.argv[model + 1]).toBe('claude-opus-5-5');
        expect(call.argv).toContain('-p');
        expect(call.argv).toContain('--strict-mcp-config');
        expect(call.argv.slice(-2)).toEqual(['--tools', '']);
        expect(call.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
        expect(call.stdin).toContain('marker-message-7f3a');
      },
      SLOW
    );

    it('persona without --user-model declines and logs the reason (no claude started)', () => {
      const result = runHook(
        HOOK,
        ['persona', log, '--sheet', sheet, '--conversation', conversation],
        hookInput(),
        claudeEnv()
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(DECLINE);
      expect(fs.existsSync(marker)).toBe(false);
      expect(String(logLines()[0].reason)).toContain('--user-model');
    });
  });

  it('DEFAULT_ISOLATION_ARGS equals agentIsolation().args', () => {
    const hook = createRequire(import.meta.url)(HOOK) as {
      DEFAULT_ISOLATION_ARGS: readonly string[];
    };
    expect(hook.DEFAULT_ISOLATION_ARGS).toEqual(agentIsolation().args);
  });

  describe('decide', () => {
    const decide = () =>
      (
        createRequire(import.meta.url)(HOOK) as {
          decide: (
            input: unknown,
            mode: string,
            reply?: { status: number | null; stdout: string }
          ) => unknown;
        }
      ).decide;

    it('reads the last non-empty line of the result text of claude -p JSON', () => {
      const stdout = JSON.stringify({ type: 'result', result: 'Fine.\n{"confirm": true}\n\n' });
      expect(decide()(hookInput(), 'persona', { status: 0, stdout })).toEqual(
        JSON.parse(ACCEPT_APPROVED)
      );
    });

    it('a confirm line with extra keys is not exactly {"confirm": true}', () => {
      const stdout = 'ok\n{"confirm": true, "why": "x"}';
      expect(decide()(hookInput(), 'persona', { status: 0, stdout })).toEqual(JSON.parse(DECLINE));
    });

    it('falls back to the first boolean property when required names none', () => {
      const input = hookInput({
        requested_schema: { type: 'object', properties: { accepted: { type: 'boolean' } } },
      });
      expect(decide()(input, 'accept')).toEqual({
        hookSpecificOutput: {
          hookEventName: 'Elicitation',
          action: 'accept',
          content: { accepted: true },
        },
      });
    });

    it('persona with no reply declines', () => {
      expect(decide()(hookInput(), 'persona')).toEqual(JSON.parse(DECLINE));
    });
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

  // Spec 059 phase 3 (FR-029 to FR-032, FR-048; P6): optional keys, so earlier runs still decode
  it('a record with brief and isolation decodes', () => {
    const decoded = decode({
      ...fixture('a1-pass'),
      brief: { fixture: true, approved: false },
      isolation: agentIsolation(['p@q']),
    });
    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.brief).toEqual({ fixture: true, approved: false });
      expect(decoded.success.isolation).toEqual(agentIsolation(['p@q']));
    }
  });

  it('a record without brief and isolation still decodes', () => {
    const complete = fixture('a1-pass');
    expect('brief' in complete).toBe(false);
    expect('isolation' in complete).toBe(false);
    expect(Result.isSuccess(decode(complete))).toBe(true);
  });

  it('a malformed brief or isolation does not', () => {
    expect(
      Result.isFailure(
        decode({ ...fixture('a1-pass'), brief: { fixture: 'yes', approved: false } })
      )
    ).toBe(true);
    expect(
      Result.isFailure(decode({ ...fixture('a1-pass'), isolation: { args: 'x', env: {} } }))
    ).toBe(true);
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

  // Spec 059 phase 3 (FR-048, SC-023)
  it('prints the isolation once', () => {
    const isolation = agentIsolation(['p@q']);
    const summary = renderSummary(RECORDS_SET.map(run => ({ ...run, isolation })));
    const line = `Isolation: claude ${isolation.args.join(' ')} with CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`;
    expect(summary).toContain(line);
    expect(summary.split('Isolation:')).toHaveLength(2);
    expect(renderSummary(RECORDS_SET)).not.toContain('Isolation:');
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
