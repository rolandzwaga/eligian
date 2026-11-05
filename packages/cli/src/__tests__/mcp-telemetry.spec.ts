/**
 * Spec 058 Phase 1 (FR-008; plan C5, C12): every tool call writes one JSON telemetry line to
 * stderr (and appends it to `ELIGIAN_MCP_LOG` when set), and assigns the per-server call id.
 *
 * `process.stderr.write` is spied and restored after each test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { makeTelemetry, type TelemetryLine } from '../mcp/telemetry.js';

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
});
