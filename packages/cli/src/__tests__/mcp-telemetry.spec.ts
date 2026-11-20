/**
 * Spec 058 Phase 1 (FR-008; plan C5, C12): every tool call writes one JSON telemetry line to
 * stderr (and appends it to `ELIGIAN_MCP_LOG` when set), and assigns the per-server call id.
 * Phase 2 (FR-004; SC-002(3)): the same holds for `eligian_compile`, `eligian_project` and
 * `eligian_smoke` on the wire (in-process server; smoke runs the stub CLI of mcp-smoke.spec.ts).
 *
 * Phase 3 (FR-007; SC-012(3); plan C2, P10): `explain` is in the compile line's `args`, the
 * check line carries `result.codes`, and `telemetryText` keeps every line within 1,000 chars.
 *
 * `process.stderr.write` is spied and restored after each test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Exit } from 'effect';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { makeTelemetry, type TelemetryLine, telemetryText } from '../mcp/telemetry.js';
import * as brief from '../mcp/tools/brief.js';
import * as check from '../mcp/tools/check.js';
import * as compile from '../mcp/tools/compile.js';
import * as project from '../mcp/tools/project.js';
import * as smoke from '../mcp/tools/smoke.js';
import { approvedBrief } from './brief-helpers.js';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE_PROGRAM = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'gate', 'program');
const SMOKE_ROOT = path.join(HERE, '__fixtures__', 'mcp', 'smoke-tool');
const STUB = path.join(SMOKE_ROOT, 'stub-cli.mjs');
const DOCS = path.join(HERE, '__fixtures__', 'mcp', 'docs-mini');
const CHECK_CASES = path.join(HERE, '__fixtures__', 'mcp', 'check');

describe('telemetry', () => {
  let stderr: string[];
  let spy: MockInstance;
  let dir: string;

  beforeEach(() => {
    stderr = [];
    spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as typeof process.stderr.write);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-telemetry-'));
  });

  afterEach(() => {
    spy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The stderr chunks that parse as telemetry lines. */
  const telemetryLines = (): TelemetryLine[] =>
    stderr
      .filter(chunk => chunk.startsWith('{'))
      .map(chunk => JSON.parse(chunk.trimEnd()) as TelemetryLine);

  it('one JSON line per call with t, tool, ms, chars, ok, args', async () => {
    const telemetry = makeTelemetry(undefined);
    const result = { files: 2, diagnostics: [{ code: 'x' }] };

    const value = await Effect.runPromise(
      telemetry.withTelemetry('eligian_check', { files: 2 }, () => Effect.succeed(result))
    );

    expect(value).toBe(result);
    expect(stderr).toHaveLength(1);
    expect(stderr[0].endsWith('\n')).toBe(true);
    const [line] = telemetryLines();
    expect(Object.keys(line).sort()).toEqual(['args', 'chars', 'ms', 'ok', 't', 'tool']);
    expect(line.tool).toBe('eligian_check');
    expect(line.ok).toBe(true);
    expect(line.args).toEqual({ files: 2 });
    expect(line.chars).toBe(JSON.stringify(result).length);
    expect(typeof line.ms).toBe('number');
    expect(line.ms).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(line.t))).toBe(false);
  });

  it('request ids count 1, 2, … per instance', async () => {
    const first = makeTelemetry(undefined);
    const second = makeTelemetry(undefined);
    const ids: string[] = [];
    const record = (requestId: string) =>
      Effect.sync(() => {
        ids.push(requestId);
      });

    await Effect.runPromise(first.withTelemetry('a', {}, record));
    await Effect.runPromise(first.withTelemetry('a', {}, record));
    await Effect.runPromise(second.withTelemetry('a', {}, record));

    expect(ids).toEqual(['1', '2', '1']);
  });

  it('a failure is ok: false', async () => {
    const telemetry = makeTelemetry(undefined);
    const failure = { _tag: 'ToolNotFound', message: 'no such file' } as const;

    const exit = await Effect.runPromiseExit(
      telemetry.withTelemetry('eligian_operations', { names: 1 }, () => Effect.fail(failure))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const [line] = telemetryLines();
    expect(line.ok).toBe(false);
    expect(line.tool).toBe('eligian_operations');
    expect(line.chars).toBe(JSON.stringify(failure).length);
  });

  it('an interrupted call writes ok: false', async () => {
    const telemetry = makeTelemetry(undefined);

    const exit = await Effect.runPromiseExit(
      telemetry.withTelemetry('eligian_check', {}, () => Effect.interrupt)
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const lines = telemetryLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].ok).toBe(false);
  });

  it('appends to the log file', async () => {
    const logFile = path.join(dir, 'telemetry.log');
    const telemetry = makeTelemetry(logFile);

    await Effect.runPromise(
      telemetry.withTelemetry('eligian_docs', { q: 1 }, () => Effect.succeed({}))
    );
    await Effect.runPromise(telemetry.withTelemetry('eligian_fmt', {}, () => Effect.succeed({})));

    const fileLines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
    expect(fileLines).toHaveLength(2);
    expect(fileLines.map(l => (JSON.parse(l) as TelemetryLine).tool)).toEqual([
      'eligian_docs',
      'eligian_fmt',
    ]);
    expect(fileLines).toEqual(stderr.map(chunk => chunk.trimEnd()));
  });

  it('an unwritable log file warns once and changes no result', async () => {
    const logFile = path.join(dir, 'missing-dir', 'telemetry.log');
    const telemetry = makeTelemetry(logFile);
    const result = { ok: 'yes' };

    const first = await Effect.runPromise(
      telemetry.withTelemetry('eligian_check', {}, () => Effect.succeed(result))
    );
    const second = await Effect.runPromise(
      telemetry.withTelemetry('eligian_check', {}, () => Effect.succeed(result))
    );

    expect(first).toBe(result);
    expect(second).toBe(result);
    expect(fs.existsSync(logFile)).toBe(false);
    expect(telemetryLines()).toHaveLength(2);
    const warnings = stderr.filter(chunk => !chunk.startsWith('{'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(logFile);
  });

  it('one line per call for compile, project, smoke', async () => {
    const server = await startInMemoryServer({
      cwd: SMOKE_ROOT,
      docsRoot: DOCS,
      smoke: { cliPath: STUB },
    });
    try {
      const calls: [string, unknown][] = [
        [compile.NAME, { path: 'b/main.eligian' }],
        [project.NAME, { path: 'b/main.eligian' }],
        [smoke.NAME, { paths: ['b/main.eligian'] }],
      ];
      for (const [tool, args] of calls) {
        const result = await server.callTool(tool, args);
        expect(result.isError, tool).toBe(false);
      }
    } finally {
      await server.close();
    }

    // Only the telemetry lines: the logger and the smoke child's `smoke: ` lines are not JSON
    const tools = stderr
      .flatMap(chunk => chunk.split('\n'))
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line) as Partial<TelemetryLine>)
      .filter(line => typeof line.tool === 'string')
      .map(line => ({ tool: line.tool, ok: line.ok }));
    expect(tools).toEqual([
      { tool: compile.NAME, ok: true },
      { tool: project.NAME, ok: true },
      { tool: smoke.NAME, ok: true },
    ]);
  }, 60_000);

  /** The telemetry lines in the stderr chunks, split by line (other stderr output is not JSON). */
  const toolLines = (): Partial<TelemetryLine>[] =>
    stderr
      .flatMap(chunk => chunk.split('\n'))
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line) as Partial<TelemetryLine>)
      .filter(line => typeof line.tool === 'string');

  it('explain is in args', async () => {
    const server = await startInMemoryServer({ cwd: SMOKE_ROOT, docsRoot: DOCS });
    try {
      const result = await server.callTool(compile.NAME, { path: 'b/main.eligian', explain: true });
      expect(result.isError).toBe(false);
    } finally {
      await server.close();
    }

    const lines = toolLines().filter(line => line.tool === compile.NAME);
    expect(lines).toHaveLength(1);
    expect(lines[0].args?.explain).toBe(true);
  }, 60_000);

  it('check codes are in result', async () => {
    const server = await startInMemoryServer({ cwd: CHECK_CASES, docsRoot: DOCS });
    let diagnostics: readonly { readonly code: string; readonly source: string }[] = [];
    try {
      const result = await server.callTool(check.NAME, {
        paths: ['unknown-operation/main.eligian', 'warnings-only/main.eligian'],
      });
      expect(result.isError).toBe(false);
      diagnostics = (result.payload as unknown as check.CheckSuccess).diagnostics;
    } finally {
      await server.close();
    }

    const expected: Record<string, number> = {};
    for (const d of diagnostics) {
      const key = d.code === '' ? d.source : d.code;
      expected[key] = (expected[key] ?? 0) + 1;
    }
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(2);
    const lines = toolLines().filter(line => line.tool === check.NAME);
    expect(lines).toHaveLength(1);
    expect(lines[0].result).toEqual({ codes: expected });
    expect(lines[0]).not.toHaveProperty('truncated');
  }, 60_000);

  it('summarizeResult counts a codeless diagnostic under its source', () => {
    const diagnostic = (code: string, source: string) => ({ code, source });
    const success = {
      diagnostics: [
        diagnostic('unknown_operation', 'validator'),
        diagnostic('unknown_operation', 'validator'),
        diagnostic('', 'parser'),
        diagnostic('eligius-x', 'eligius-lint'),
      ],
    } as unknown as check.CheckSuccess;

    expect(check.summarizeResult(success)).toEqual({
      codes: { unknown_operation: 2, parser: 1, 'eligius-x': 1 },
    });
  });

  /** A synthetic eligian_check line with `n` distinct codes, code i counted i + 1 times. */
  const lineWithCodes = (n: number): TelemetryLine => ({
    t: new Date(0).toISOString(),
    tool: check.NAME,
    ms: 12,
    chars: 3456,
    ok: true,
    args: { paths: 1, selectorNotInLayout: 'ids', lint: true, review: true, maxWarnings: 0 },
    result: {
      codes: Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`some-diagnostic-code-${i}`, i + 1])
      ),
    },
  });

  it('50 codes → ≤ 1000 chars, truncated: true', () => {
    const line = lineWithCodes(50);
    expect(JSON.stringify(line).length).toBeGreaterThan(1000);

    const text = telemetryText(line);
    expect(text.length).toBeLessThanOrEqual(1000);
    const parsed = JSON.parse(text) as TelemetryLine;
    expect(parsed.truncated).toBe(true);
    const kept = parsed.result?.codes as Record<string, number>;
    const keptCounts = Object.values(kept);
    expect(keptCounts.length).toBeGreaterThan(0);
    expect(keptCounts.length).toBeLessThan(50);
    // the kept codes are the largest counts: every dropped count is below every kept one
    const dropped = Array.from({ length: 50 }, (_, i) => i + 1).filter(
      count => !keptCounts.includes(count)
    );
    expect(Math.max(...dropped)).toBeLessThan(Math.min(...keptCounts));
    for (const [code, count] of Object.entries(kept)) {
      expect(code).toBe(`some-diagnostic-code-${count - 1}`);
    }
    // the rest of the line is unchanged
    const { result: _r1, truncated: _t1, ...restParsed } = parsed;
    const { result: _r2, ...restLine } = line;
    expect(restParsed).toEqual(restLine);
  });

  it('a line that fits has no truncated key', () => {
    const line = lineWithCodes(3);
    const text = telemetryText(line);
    expect(text).toBe(JSON.stringify(line));
    expect(JSON.parse(text)).not.toHaveProperty('truncated');
  });

  it('withTelemetry adds the summarized result on success only', async () => {
    const telemetry = makeTelemetry(undefined);
    const summarize = (value: { n: number }) => ({ n: value.n });

    await Effect.runPromise(
      telemetry.withTelemetry('eligian_check', {}, () => Effect.succeed({ n: 3 }), summarize)
    );
    await Effect.runPromiseExit(
      telemetry.withTelemetry(
        'eligian_check',
        {},
        () => Effect.fail({ _tag: 'X' } as const) as Effect.Effect<{ n: number }, { _tag: 'X' }>,
        summarize
      )
    );

    const [success, failure] = telemetryLines();
    expect(success.result).toEqual({ n: 3 });
    expect(failure).not.toHaveProperty('result');
  });

  /**
   * Spec 059 Phase 2 (FR-057, SC-012 brief half): `eligian_brief`'s line carries `scope` and
   * `paths` as summaries (never a name or a path) and the reply state as `brief.state`.
   */
  describe('brief state', () => {
    const SENTINEL = 'TELEMETRY-SENTINEL-VIEW';

    /** One in-process server on `dir` (state dir inside it), `calls` in order; its brief lines. */
    const briefLines = async (calls: readonly unknown[]): Promise<string[]> => {
      const server = await startInMemoryServer({
        cwd: dir,
        docsRoot: DOCS,
        brief: { stateDir: path.join(dir, 'state') },
      });
      try {
        for (const args of calls) await server.callTool(brief.NAME, args);
      } finally {
        await server.close();
      }
      return stderr
        .flatMap(chunk => chunk.split('\n'))
        .filter(line => line.startsWith('{') && line.includes(`"tool":"${brief.NAME}"`));
    };

    it("eligian_brief with scope { addition: 'view', name: SENTINEL } and paths [a, b]: args.scope === 'addition:view', args.paths === 2, SENTINEL absent from the line", async () => {
      const lines = await briefLines([
        {
          action: 'status',
          scope: { addition: 'view', name: SENTINEL },
          paths: [`a-${SENTINEL}.eligian`, `b-${SENTINEL}.eligian`],
        },
      ]);

      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain(SENTINEL);
      const line = JSON.parse(lines[0]) as TelemetryLine;
      expect(line.args.scope).toBe('addition:view');
      expect(line.args.paths).toBe(2);
    }, 60_000);

    it("scope 'adopt' → args.scope === 'adopt'; no scope → 'presentation'", async () => {
      const lines = await briefLines([{ action: 'status', scope: 'adopt' }, { action: 'status' }]);

      expect(lines.map(text => (JSON.parse(text) as TelemetryLine).args.scope)).toEqual([
        'adopt',
        'presentation',
      ]);
    }, 60_000);

    it('an eligian_brief line has brief.state', async () => {
      const lines = await briefLines([{ action: 'status', idea: 'A tour of the opening hours.' }]);

      expect(lines).toHaveLength(1);
      const line = JSON.parse(lines[0]) as TelemetryLine;
      expect(line.ok).toBe(true);
      expect(line.brief).toEqual({ state: 'open' });
    }, 60_000);

    /*
     * FR-057, SC-012 (T029): the lines of the gated tools and `eligian_project` carry the noted
     * brief state, read from the `ELIGIAN_MCP_LOG` file; `eligian_docs` and `eligian_operations`
     * carry none; no line holds a name, a code, a path, an answer, the idea or a message.
     */
    describe('in the ELIGIAN_MCP_LOG file', () => {
      const BRIEF_TIMEOUT = 120_000;
      let root: string;
      let stateDir: string;
      let logFile: string;
      let server: InMemoryServer | undefined;

      beforeEach(() => {
        const real = fs.realpathSync(dir);
        root = path.join(real, 'project');
        stateDir = path.join(real, 'state');
        logFile = path.join(real, 'telemetry.log');
        fs.mkdirSync(root);
        vi.stubEnv('ELIGIAN_MCP_LOG', logFile);
      });

      afterEach(async () => {
        await server?.close();
        server = undefined;
        vi.unstubAllEnvs();
      });

      const serve = async (): Promise<InMemoryServer> => {
        server = await startInMemoryServer({ cwd: root, docsRoot: DOCS, brief: { stateDir } });
        return server;
      };

      /** The raw lines of the log file. */
      const logText = (): string[] =>
        fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean) : [];

      /** The parsed log lines of `tool`. */
      const logLines = (tool: string): TelemetryLine[] =>
        logText()
          .map(text => JSON.parse(text) as TelemetryLine)
          .filter(line => line.tool === tool);

      /** A server on a project whose open `BRIEF.md` governs a program written after the scan. */
      const openProject = async (): Promise<InMemoryServer> => {
        const running = await serve();
        const status = await running.callTool(brief.NAME, {
          action: 'status',
          idea: 'A one-screen overview of our support hours.',
        });
        expect(status.isError, JSON.stringify(status.payload)).toBe(false);
        expect(status.payload.state).toBe('open');
        fs.cpSync(GATE_PROGRAM, root, { recursive: true });
        return running;
      };

      it("a refused eligian_check: brief { state: 'open', gate: 'brief-incomplete' }, ok false", async () => {
        const running = await openProject();
        const result = await running.callTool(check.NAME, { paths: ['main.eligian'] });
        expect(result.isError).toBe(true);

        const lines = logLines(check.NAME);
        expect(lines).toHaveLength(1);
        expect(lines[0].ok).toBe(false);
        expect(lines[0].brief).toEqual({ state: 'open', gate: 'brief-incomplete' });
      }, 60_000);

      it("a successful check on a known unbriefed program: brief equals { state: 'none' } (no gate key), ok true", async () => {
        fs.cpSync(GATE_PROGRAM, root, { recursive: true });
        const running = await serve();
        const result = await running.callTool(check.NAME, { paths: ['main.eligian'] });
        expect(result.isError, JSON.stringify(result.payload)).toBe(false);

        const lines = logLines(check.NAME);
        expect(lines).toHaveLength(1);
        expect(lines[0].ok).toBe(true);
        expect(lines[0].brief).toEqual({ state: 'none' });
      }, 60_000);

      it(
        "a successful compile under an approved brief: brief equals { state: 'approved' }",
        async () => {
          const running = await serve();
          await approvedBrief(running, root, { stateDir });
          fs.cpSync(GATE_PROGRAM, root, { recursive: true });
          const result = await running.callTool(compile.NAME, { path: 'main.eligian' });
          expect(result.isError, JSON.stringify(result.payload)).toBe(false);

          const lines = logLines(compile.NAME);
          expect(lines).toHaveLength(1);
          expect(lines[0].ok).toBe(true);
          expect(lines[0].brief).toEqual({ state: 'approved' });
        },
        BRIEF_TIMEOUT
      );

      it("an eligian_project line on the open project: { state: 'open', gate: 'brief-incomplete' }", async () => {
        const running = await openProject();
        const result = await running.callTool(project.NAME, { path: 'main.eligian' });
        expect(result.isError, JSON.stringify(result.payload)).toBe(false);

        const lines = logLines(project.NAME);
        expect(lines).toHaveLength(1);
        expect(lines[0].ok).toBe(true);
        expect(lines[0].brief).toEqual({ state: 'open', gate: 'brief-incomplete' });
      }, 60_000);

      it('eligian_docs and eligian_operations lines have no brief field', async () => {
        const running = await openProject();
        const docs = await running.callTool('eligian_docs', {});
        expect(docs.isError, JSON.stringify(docs.payload)).toBe(false);
        const operations = await running.callTool('eligian_operations', { names: ['addClass'] });
        expect(operations.isError, JSON.stringify(operations.payload)).toBe(false);

        const lines = [...logLines('eligian_docs'), ...logLines('eligian_operations')];
        expect(lines).toHaveLength(2);
        for (const line of lines) expect(line).not.toHaveProperty('brief');
      }, 60_000);

      it('a sentinel used as a view name, a language code, a path, an answer value, the idea and a confirmation message is absent from every line', async () => {
        const SECRET = 'TELEMETRY-SENTINEL-T029';
        const directory = `dir-${SECRET}`;
        fs.mkdirSync(path.join(root, directory));
        const running = await serve();
        const calls: [string, unknown][] = [
          [brief.NAME, { action: 'status', directory, idea: `The idea ${SECRET}.` }],
          [
            brief.NAME,
            {
              action: 'answer',
              directory,
              answers: [
                { id: 'P1', value: `An answer ${SECRET}.` },
                { id: 'S2', value: [{ name: SECRET, purpose: 'The view.' }] },
                { id: 'L1', value: [{ code: SECRET, default: 'yes' }] },
              ],
            },
          ],
          [brief.NAME, { action: 'confirm', directory, confirmation: `Yes ${SECRET}.` }],
          [brief.NAME, { action: 'status', directory, scope: { addition: 'view', name: SECRET } }],
        ];
        for (const [tool, args] of calls) await running.callTool(tool, args);
        fs.cpSync(GATE_PROGRAM, path.join(root, directory), { recursive: true });
        await running.callTool(check.NAME, { paths: [`${directory}/main.eligian`] });
        await running.callTool(project.NAME, { path: `${directory}/main.eligian` });

        const lines = logText();
        expect(lines.map(text => (JSON.parse(text) as TelemetryLine).tool)).toEqual([
          brief.NAME,
          brief.NAME,
          brief.NAME,
          brief.NAME,
          check.NAME,
          project.NAME,
        ]);
        for (const text of lines) expect(text).not.toContain(SECRET);
      }, 60_000);
    });
  });
});
