/**
 * Spec 058 Phase 3 (FR-030–FR-032; SC-009(1), (2), (3), (7), (8); plan B2, B3, P8): `smoke
 * --determinism`. Each played timeline runs on three fresh engines (linear play, a straight seek
 * from 0, a seek back from the end) and the DOM of every layout id is compared at every boundary.
 * In-process: `compileFile` of a fixture under `__fixtures__/mcp/determinism/`, then
 * `smokeConfig(config, map, { determinism: true, … })`; the engines are counted through the
 * test-only `onReferenceEngine` hook.
 *
 * `describe('the CLI')` (FR-033; SC-009(1), (2), (5)) spawns the built CLI (`bin/cli.js` imports
 * `dist/cli.mjs`; `requireFreshBundle()` first) with `--determinism`.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timelineNames } from '@eligian/language/mcp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileFile } from '../compile-file.js';
import { timelineLocations } from '../smoke/smoke-command.js';
import {
  type SmokeOptions,
  type SmokeProblem,
  type SmokeResult,
  smokeConfig,
} from '../smoke/smoke-runner.js';
import { requireFreshBundle } from './fresh-bundle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '..', '..', 'bin', 'cli.js');
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'determinism');
const fixture = (name: string) => path.join(FIXTURES, name, 'main.eligian');

/** Compile a fixture and smoke it with `determinism: true` (unless overridden); counts the engines. */
const smoke = async (
  name: string,
  options: SmokeOptions = {}
): Promise<SmokeResult & { readonly engines: number }> => {
  const file = fixture(name);
  const { config, map, program } = await compileFile(file);
  let engines = 0;
  const result = await smokeConfig(config, map, {
    determinism: true,
    names: timelineNames(program),
    timelineLocations: timelineLocations(program),
    sourceDir: path.dirname(file),
    onReferenceEngine: () => {
      engines++;
    },
    ...options,
  });
  return { ...result, engines };
};

const nondeterministic = (result: SmokeResult): SmokeProblem[] =>
  result.problems.filter(problem => problem.code === 'position-nondeterministic');

/** The 1-based line of the first source line of `name`'s fixture that contains `text`. */
const lineOf = (name: string, text: string): number =>
  fs
    .readFileSync(fixture(name), 'utf-8')
    .split(/\r?\n/)
    .findIndex(line => line.includes(text)) + 1;

describe('smoke --determinism', () => {
  it('a class nothing removes → one problem at the range', async () => {
    const result = await smoke('never-removed');
    expect(result.problems).toHaveLength(1);
    const [problem] = result.problems;
    expect(problem).toMatchObject({
      code: 'position-nondeterministic',
      severity: 'error',
      timeline: 'main',
    });
    expect(problem.message).toContain('#box');
    expect(problem.message).toContain("class 'in'");
    expect(['true', 'false']).toContain(problem.expected);
    const actual = JSON.parse(problem.actual as string) as Record<string, unknown>;
    expect(Object.keys(actual).sort()).toEqual(['end-back', 'fresh']);
    // Every differing path is named
    const linear = JSON.parse(problem.expected as string) as boolean;
    const differing = (['fresh', 'end-back'] as const).filter(kind => actual[kind] !== linear);
    expect(differing.length).toBeGreaterThan(0);
    expect(problem.message).toContain(`the ${differing.join(' and ')} path`);
    expect(problem.location?.line).toBe(lineOf('never-removed', 'at 1s..3s'));
    expect(problem.location?.file).toBe(fixture('never-removed'));
  });

  it('an inverse end block → none', async () => {
    const result = await smoke('inverse');
    expect(result.problems).toEqual([]);
  });

  it('an addClass in a click handler does not flag the timeline ranges', async () => {
    const result = await smoke('click-handler');
    expect(nondeterministic(result)).toEqual([]);
  });

  it('two classes → two problems', async () => {
    const result = await smoke('two-classes');
    const problems = nondeterministic(result);
    expect(problems).toHaveLength(2);
    expect(problems.map(problem => /class '(\w+)'/.exec(problem.message)?.[1]).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('three engines per non-first timeline; an element outside the container is compared', async () => {
    const second = await smoke('two-timelines', { timelines: ['second'] });
    expect(second.engines).toBe(3);

    const outside = await smoke('outside-container');
    const problems = nondeterministic(outside);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('#outside');
    expect(problems[0].location?.line).toBe(
      lineOf('outside-container', 'selectElement("#outside")') - 1
    );
  });

  it('no range selects the element by id → located at the timeline (FR-031 fallback)', async () => {
    const result = await smoke('by-class');
    const problems = nondeterministic(result);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('#box');
    expect(problems[0].location?.line).toBe(lineOf('by-class', 'timeline "main"'));
    expect(problems[0].location?.file).toBe(fixture('by-class'));
  });

  it("a timeline's problems are reported before the next timeline's engines are built (FR-033)", async () => {
    const file = fixture('two-timelines');
    const { config, map, program } = await compileFile(file);
    let engines = 0;
    const reportedAt: { timeline?: string; engines: number }[] = [];
    await smokeConfig(config, map, {
      determinism: true,
      names: timelineNames(program),
      sourceDir: path.dirname(file),
      onReferenceEngine: () => {
        engines++;
      },
      listener: {
        problem: problem => {
          if (problem.code === 'position-nondeterministic') {
            reportedAt.push({ timeline: problem.timeline, engines });
          }
        },
      },
    });
    expect(reportedAt).toEqual([
      { timeline: 'first', engines: 3 },
      { timeline: 'second', engines: 6 },
    ]);
  });

  it('wait(300) in a start block reports nothing', async () => {
    const result = await smoke('wait-in-start');
    expect(result.problems).toEqual([]);
  });

  it('--timeline subset reports only that timeline and builds engines only for it', async () => {
    const all = await smoke('two-timelines');
    expect(
      nondeterministic(all)
        .map(problem => problem.timeline)
        .sort()
    ).toEqual(['first', 'second']);
    expect(all.engines).toBe(6);

    const subset = await smoke('two-timelines', { timelines: ['second'] });
    const problems = nondeterministic(subset);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ timeline: 'second' });
    expect(problems[0].message).toContain('#second-box');
    expect(subset.engines).toBe(3);
  });

  it('without determinism nothing changes', async () => {
    const result = await smoke('never-removed', { determinism: false });
    expect(nondeterministic(result)).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.engines).toBe(0);
  });
});

describe('the CLI', () => {
  beforeAll(() => requireFreshBundle());

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-determinism-cli-'));
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** Run `eligian smoke <args>` on the built CLI to its exit: stdout, stderr and the exit code. */
  const cli = (args: readonly string[]) =>
    new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, 'smoke', ...args], { cwd: FIXTURES });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf-8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf-8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', exitCode => resolve({ stdout, stderr, exitCode }));
    });

  /** The number of `position-nondeterministic` mentions in `text`. */
  const mentions = (text: string): number => text.split('position-nondeterministic').length - 1;

  it('--determinism exits 1 on never-removed and names position-nondeterministic', async () => {
    const result = await cli([fixture('never-removed'), '--determinism', '--format', 'json']);
    expect(result.exitCode, result.stderr).toBe(1);
    expect(mentions(result.stdout)).toBe(1);

    // Without the flag the same program is clean
    const plain = await cli([fixture('never-removed'), '--format', 'json']);
    expect(plain.exitCode, plain.stderr).toBe(0);
    expect(mentions(plain.stdout)).toBe(0);
  });

  it('locates a difference no range selects by id at the timeline (FR-031 fallback)', async () => {
    const result = await cli([fixture('by-class'), '--determinism', '--format', 'json']);
    expect(result.exitCode, result.stderr).toBe(1);
    const [file] = JSON.parse(result.stdout) as SmokeResult[];
    const problems = nondeterministic(file);
    expect(problems).toHaveLength(1);
    expect(problems[0].location).toMatchObject({
      file: fixture('by-class'),
      line: lineOf('by-class', 'timeline "main"'),
    });
  });

  it('--determinism exits 0 on inverse', async () => {
    const result = await cli([fixture('inverse'), '--determinism', '--format', 'json']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(mentions(result.stdout)).toBe(0);
  });

  it('--format ndjson emits the problem as a problem line before summary', async () => {
    const result = await cli([fixture('never-removed'), '--determinism', '--format', 'ndjson']);
    expect(result.exitCode, result.stderr).toBe(1);
    const lines = result.stdout
      .split('\n')
      .filter(line => line !== '')
      .map(line => JSON.parse(line) as { type: string; code?: string });
    const problem = lines.findIndex(
      line => line.type === 'problem' && line.code === 'position-nondeterministic'
    );
    const summary = lines.findIndex(line => line.type === 'summary');
    expect(problem).toBeGreaterThanOrEqual(0);
    expect(summary).toBe(lines.length - 1);
    expect(problem).toBeLessThan(summary);
  });

  // pretty and github print no problem codes (FR-033 keeps them byte-identical to Phase 2), so
  // they are checked by the FR-031 message; json and ndjson carry the code. One test per format:
  // each spawns the CLI (~4 s alone), four in one test ran past the 30 s limit under load
  it.each(['pretty', 'github', 'json', 'ndjson'])('every format reports it: %s', async format => {
    const result = await cli([fixture('never-removed'), '--determinism', '--format', format]);
    expect(result.exitCode, `${format}: ${result.stderr}`).toBe(1);
    expect(result.stdout, format).toContain(
      format === 'pretty' || format === 'github'
        ? "element #box: class 'in' present after linear play to"
        : 'position-nondeterministic'
    );
  });

  it('--determinism --scenario runs both', async () => {
    const scenario = path.join(tmp, 'absent-class.json');
    fs.writeFileSync(
      scenario,
      JSON.stringify({
        steps: [{ seek: 2 }],
        assertions: [{ after: 0, selector: '#box', hasClass: 'absent' }],
      })
    );
    const result = await cli([
      fixture('never-removed'),
      '--determinism',
      '--scenario',
      scenario,
      '--format',
      'json',
    ]);
    expect(result.exitCode, result.stderr).toBe(1);
    expect(result.stdout).toContain('scenario-assertion-failed');
    expect(mentions(result.stdout)).toBe(1);
  });

  it('--determinism --strict exits 1', async () => {
    const result = await cli([
      fixture('never-removed'),
      '--determinism',
      '--strict',
      '--format',
      'json',
    ]);
    expect(result.exitCode, result.stderr).toBe(1);
    expect(mentions(result.stdout)).toBe(1);
  });

  it('--determinism --timeline <name> reports only that timeline', async () => {
    const result = await cli([
      fixture('two-timelines'),
      '--determinism',
      '--timeline',
      'second',
      '--format',
      'json',
    ]);
    expect(result.exitCode, result.stderr).toBe(1);
    const [file] = JSON.parse(result.stdout) as SmokeResult[];
    expect(file.timelines.map(timeline => timeline.name)).toEqual(['second']);
    const problems = nondeterministic(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ timeline: 'second' });
    expect(problems[0].message).toContain('#second-box');
  });
});
