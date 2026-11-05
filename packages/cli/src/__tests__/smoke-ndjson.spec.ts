/**
 * Spec 058 Phase 2 (FR-030, FR-035; SC-006(2)(3)(6)): `eligian smoke --format ndjson`, run as
 * the MCP tool runs it: a child process of the built CLI (`bin/cli.js` imports `dist/cli.mjs`).
 * One JSON object per line, written as the run goes; `--timeline`, `--step-timeout-ms` and the
 * `step` lines of `--scenario` (FR-034).
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireFreshBundle } from './fresh-bundle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '..', '..', 'bin', 'cli.js');
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'smoke');
const TWO_TIMELINES = path.join(FIXTURES, 'two-timelines.eligian');
const SLOW = path.join(FIXTURES, 'slow.eligian');
/** A scenario that keeps the child alive for 3 s after the walk (SC-006(3)) */
const WAIT_3000 = path.join(FIXTURES, 'wait3000.json');

interface Line {
  readonly type: 'file' | 'timeline' | 'problem' | 'step' | 'summary';
  readonly [key: string]: unknown;
}

function start(args: readonly string[]): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [BIN, ...args], { cwd: FIXTURES });
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  return child;
}

/** Run the CLI to its exit: every stdout line parsed, and the exit code. */
function run(args: readonly string[]): Promise<{ lines: Line[]; exitCode: number | null }> {
  const child = start(args);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', exitCode => {
      try {
        expect(stdout.endsWith('\n'), `stdout: ${stdout}\nstderr: ${stderr}`).toBe(true);
        const lines = stdout
          .split('\n')
          .filter(line => line !== '')
          .map(line => JSON.parse(line) as Line);
        resolve({ lines, exitCode });
      } catch (error) {
        reject(error);
      }
    });
  });
}

describe('requireFreshBundle', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });

  /** A temp repo root: a bundle at `bundleTime`, one source file per [path, time]. */
  const root = (bundleTime: number | undefined, sources: readonly [string, number][]) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-fresh-'));
    roots.push(dir);
    const write = (file: string, time: number) => {
      const full = path.join(dir, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, '');
      fs.utimesSync(full, time, time);
    };
    if (bundleTime !== undefined) write('packages/cli/dist/cli.mjs', bundleTime);
    for (const [file, time] of sources) write(file, time);
    return dir;
  };

  it('requireFreshBundle names the build command when stale', () => {
    const stale = root(1000, [
      ['packages/cli/src/main.ts', 900],
      ['packages/language/src/compiler/x.ts', 2000],
    ]);
    expect(() => requireFreshBundle(stale)).toThrow('run `pnpm -C packages/cli build`');
    const missing = root(undefined, [['packages/cli/src/main.ts', 900]]);
    expect(() => requireFreshBundle(missing)).toThrow('run `pnpm -C packages/cli build`');
  });

  it('a bundle newer than every source passes; tests and fixtures do not count', () => {
    const fresh = root(1000, [
      ['packages/cli/src/main.ts', 900],
      ['packages/shared-utils/src/index.ts', 900],
      ['packages/cli/src/__tests__/a.spec.ts', 2000],
      ['packages/language/src/__fixtures__/b.eligian', 2000],
    ]);
    expect(() => requireFreshBundle(fresh)).not.toThrow();
  });
});

describe('eligian smoke --format ndjson (spawned)', () => {
  beforeAll(() => requireFreshBundle());

  it('ndjson lines parse in order', async () => {
    const { lines, exitCode } = await run(['smoke', TWO_TIMELINES, '--format', 'ndjson']);
    expect(exitCode).toBe(0);
    expect(lines.map(line => line.type)).toEqual(['file', 'timeline', 'timeline', 'summary']);
    expect(lines[0]).toEqual({ type: 'file', file: TWO_TIMELINES });
    expect(path.isAbsolute(lines[0].file as string)).toBe(true);
    expect(lines[1]).toEqual({ type: 'timeline', file: TWO_TIMELINES, name: 'A', boundaries: 2 });
    expect(lines[2]).toEqual(expect.objectContaining({ type: 'timeline', name: 'B' }));
    expect(lines[3]).toEqual({ type: 'summary', files: 1, timelines: 2, errors: 0, warnings: 0 });
  });

  it('--timeline A plays only A', async () => {
    const { lines, exitCode } = await run([
      'smoke',
      TWO_TIMELINES,
      '--format',
      'ndjson',
      '--timeline',
      'A',
    ]);
    expect(exitCode).toBe(0);
    expect(lines.filter(line => line.type === 'timeline').map(line => line.name)).toEqual(['A']);
  });

  it('--timeline A placed before the pattern still plays only A', async () => {
    const { lines, exitCode } = await run([
      'smoke',
      '--timeline',
      'A',
      TWO_TIMELINES,
      '--format',
      'ndjson',
    ]);
    expect(exitCode).toBe(0);
    expect(lines[0]).toEqual({ type: 'file', file: TWO_TIMELINES });
    expect(lines.filter(line => line.type === 'timeline').map(line => line.name)).toEqual(['A']);
  });

  it('--timeline nope: one smoke-unknown-timeline problem, exit 1', async () => {
    const { lines, exitCode } = await run([
      'smoke',
      TWO_TIMELINES,
      '--format',
      'ndjson',
      '--timeline',
      'nope',
    ]);
    expect(exitCode).toBe(1);
    const problems = lines.filter(line => line.type === 'problem');
    expect(problems).toEqual([
      expect.objectContaining({
        file: TWO_TIMELINES,
        code: 'smoke-unknown-timeline',
        severity: 'error',
      }),
    ]);
    expect(lines.filter(line => line.type === 'timeline')).toEqual([]);
  });

  it('--step-timeout-ms 1 gives smoke-step-timeout', async () => {
    const { lines, exitCode } = await run([
      'smoke',
      SLOW,
      '--format',
      'ndjson',
      '--step-timeout-ms',
      '1',
    ]);
    expect(exitCode).toBe(1);
    expect(lines.filter(line => line.type === 'problem').map(line => line.code)).toContain(
      'smoke-step-timeout'
    );
    expect(lines[lines.length - 1]?.type).toBe('summary');
  });

  it('step lines carry index, step, timeline, position, snapshot', async () => {
    const { lines, exitCode } = await run([
      'smoke',
      TWO_TIMELINES,
      '--format',
      'ndjson',
      '--scenario',
      WAIT_3000,
    ]);
    expect(exitCode).toBe(0);
    expect(lines.map(line => line.type)).toEqual([
      'file',
      'timeline',
      'timeline',
      'step',
      'summary',
    ]);
    const step = lines[3];
    expect(step).toMatchObject({
      type: 'step',
      file: TWO_TIMELINES,
      index: 0,
      step: { wait: 3000 },
      timeline: 'A',
    });
    expect(typeof step.position).toBe('number');
    expect(step.snapshot).toEqual(
      expect.objectContaining({
        stage: expect.any(Object),
        activeTimelineActions: expect.any(Array),
      })
    );
  });

  it('streams before the summary', async () => {
    const child = start(['smoke', TWO_TIMELINES, '--format', 'ndjson', '--scenario', WAIT_3000]);
    let stdout = '';
    const firstTimeline = await new Promise<{ exitCode: number | null; seen: Line[] }>(
      (resolve, reject) => {
        child.on('error', reject);
        child.on('close', () => reject(new Error(`exited before a timeline line: ${stdout}`)));
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
          const seen = stdout
            .split('\n')
            .slice(0, -1)
            .map(line => JSON.parse(line) as Line);
          if (seen.some(line => line.type === 'timeline')) {
            resolve({ exitCode: child.exitCode, seen });
          }
        });
      }
    );
    child.removeAllListeners('close');
    const closed = new Promise<void>(resolve => child.on('close', () => resolve()));
    child.kill();
    await closed;

    expect(firstTimeline.exitCode).toBeNull();
    expect(firstTimeline.seen.some(line => line.type === 'summary')).toBe(false);
    // Every complete line parses; at most the last one is cut off
    const complete = stdout.split('\n').slice(0, -1);
    for (const line of complete) expect(() => JSON.parse(line), line).not.toThrow();
    expect(complete.map(line => (JSON.parse(line) as Line).type)).not.toContain('summary');
  });
});
