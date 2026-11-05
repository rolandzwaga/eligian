/**
 * Spec 058 Phase 3 (FR-020–FR-022; SC-004, SC-010(6), SC-011(1) solutions half, SC-020(5)): every
 * reference solution under `__fixtures__/mcp-solutions/<id>/` passes gate steps 1–5, materialised
 * as the gate does (a fresh temp copy, then the case's `fixtures`). The steps, the fixture copy and
 * the assertions are the harness's own, imported from the source (`../mcp/evals/assert.js`).
 *
 * The steps spawn `packages/cli/bin/cli.js`, the bundle: a fresh build first.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type GateCase,
  materialiseFixtures,
  runGateSteps,
  type StepsResult,
  smokeStepArgs,
} from '../mcp/evals/assert.js';
import { requireFreshBundle } from './fresh-bundle.js';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const CLI = path.join(REPO, 'packages', 'cli', 'bin', 'cli.js');
/** evals/mcp/cases: the case files, their scenarios and start dirs; fixtures are `../fixtures/…` */
const CASES_DIR = path.join(REPO, 'evals', 'mcp', 'cases');
const CASE_FILES = CASES_DIR;
/** The port-from-json reference project (plan F4): it passes the gate steps with case 12's scenario */
const PORT_SOURCE = path.join(REPO, 'evals', 'mcp', 'fixtures', 'port-from-json', 'source');
const SOLUTIONS = path.join(__dirname, '__fixtures__', 'mcp-solutions');

/** The case ids, from evals/mcp/cases/*.json (the scenarios beside them excluded). */
const CASE_IDS = fs
  .readdirSync(CASE_FILES)
  .filter(file => file.endsWith('.json') && !file.endsWith('.scenario.json'))
  .map(file => file.slice(0, -'.json'.length))
  .sort();

const readCase = (id: string): GateCase =>
  JSON.parse(fs.readFileSync(path.join(CASE_FILES, `${id}.json`), 'utf8')) as GateCase;

let tmp: string;

/** A fresh copy of a solution in the temp dir; `edit` changes it before the fixtures go in. */
function copySolution(id: string, name: string = id): string {
  const dir = path.join(tmp, name);
  fs.cpSync(path.join(SOLUTIONS, id), dir, { recursive: true });
  return dir;
}

/** Steps 1–5 over `dir` for case `id`, the fixtures materialised first unless `media` is false. */
function gate(id: string, dir: string, { media = true } = {}): StepsResult {
  const evalCase = readCase(id);
  const fixtureFailures = media ? materialiseFixtures(evalCase, CASES_DIR, dir) : [];
  const result = runGateSteps({ dir, cli: CLI, casesDir: CASES_DIR, evalCase });
  return { ...result, failures: [...fixtureFailures, ...result.failures] };
}

/** One gate run per solution, shared by the per-case tests and the origin test. */
const results = new Map<string, StepsResult>();
function solutionResult(id: string): StepsResult {
  let result = results.get(id);
  if (result === undefined) {
    result = gate(id, copySolution(id));
    results.set(id, result);
  }
  return result;
}

/** Replace exactly one occurrence of `from` in `file`. */
function replaceOnce(file: string, from: string, to: string): void {
  const text = fs.readFileSync(file, 'utf8');
  expect(text.split(from)).toHaveLength(2);
  fs.writeFileSync(file, text.replace(from, to));
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-solutions-'));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('reference solutions', () => {
  beforeAll(() => requireFreshBundle());

  it('the solution count is 14', () => {
    expect(CASE_IDS).toHaveLength(14);
    const solutions = fs
      .readdirSync(SOLUTIONS, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
    expect(solutions).toEqual(CASE_IDS);
  });

  it('the port-from-json source passes the gate steps with its scenario (plan F4)', () => {
    const dir = path.join(tmp, 'port-source');
    fs.cpSync(PORT_SOURCE, dir, { recursive: true });
    const result = gate('port-from-json', dir);
    expect(result.failures).toEqual([]);
    for (const assertion of result.assertions) {
      expect(assertion.pass, `${assertion.kind}: ${assertion.detail}`).toBe(true);
    }
  }, 120_000);

  it.each(CASE_IDS)(
    '%s passes gate steps 1–5',
    id => {
      const result = solutionResult(id);

      expect(result.failures).toEqual([]);
      expect(result.assertions).toHaveLength(readCase(id).assertions.length);
      for (const assertion of result.assertions) {
        expect(assertion.pass, `${assertion.kind}: ${assertion.detail}`).toBe(true);
      }
    },
    120_000
  );

  it(
    "every operation of every solution's step-4 map has an origin",
    () => {
      let operations = 0;
      const missing: string[] = [];
      for (const id of CASE_IDS) {
        const { map } = solutionResult(id);
        expect(map, `${id}: no step-4 map`).toBeDefined();
        for (const [actionId, action] of Object.entries(map?.actions ?? {})) {
          for (const [list, ops] of [
            ['start', action.start],
            ['end', action.end],
          ] as const) {
            ops.forEach((operation, i) => {
              operations++;
              if (operation.origin === undefined) {
                missing.push(
                  `${id}: ${action.name} (${actionId}) ${list}[${i}] ${operation.systemName}`
                );
              }
            });
          }
        }
      }

      expect(results.size).toBe(14);
      expect(operations).toBeGreaterThan(0);
      expect(missing).toEqual([]);
    },
    14 * 120_000
  );
});

describe('negative controls', () => {
  beforeAll(() => requireFreshBundle());

  it('smokeStepArgs contains --determinism', () => {
    for (const id of CASE_IDS) {
      expect(smokeStepArgs(readCase(id), CASES_DIR)).toContain('--determinism');
    }
  });

  it('a deleted beat fails storyboard.beatsCovered', () => {
    const dir = copySolution('staggered-list', 'staggered-list-deleted-beat');
    replaceOnce(
      path.join(dir, 'main.eligian'),
      '  at 2s..6s target "#cards" [ addClass("is-complete") ] [ removeClass("is-complete") ]\n',
      ''
    );

    const result = gate('staggered-list', dir);

    const covered = result.assertions.find(a => a.kind === 'storyboard.beatsCovered');
    expect(covered?.pass).toBe(false);
    expect(covered?.detail).toContain("beat 'features 2..6 #cards'");
    expect(result.failures.some(f => f.includes('storyboard.beatsCovered'))).toBe(true);
  }, 120_000);

  it('case 4 without its media fails step 1 with media-file-missing', () => {
    const dir = copySolution('video-subtitles', 'video-subtitles-no-media');

    const result = gate('video-subtitles', dir, { media: false });

    expect(fs.existsSync(path.join(dir, 'media', 'intro.mp4'))).toBe(false);
    expect(result.checkCodes).toContain('media-file-missing');
    const step1 = result.failures.find(f => f.startsWith('step 1 (check)'));
    expect(step1).toContain('media-file-missing');
  }, 120_000);

  it('a range that adds a class nothing removes fails step 3 with position-nondeterministic', () => {
    const dir = copySolution('title-card', 'title-card-no-end-block');
    replaceOnce(
      path.join(dir, 'main.eligian'),
      'at 1s..8s target "#headline" [ addClass("in") ] [ removeClass("in") ]',
      'at 1s..8s target "#headline" [ addClass("in") ]'
    );
    const evalCase = readCase('title-card');

    const result = gate('title-card', dir);

    const step3 = result.failures.find(f => f.startsWith('step 3 (smoke'));
    expect(step3).toContain('element #headline');
    // The step-3 failure line carries the messages; the codes are in the smoke report it read
    const smoke = spawnSync(
      process.execPath,
      [CLI, 'smoke', evalCase.entry, ...smokeStepArgs(evalCase, CASES_DIR)],
      { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    const report = JSON.parse(smoke.stdout) as { problems?: { code?: string }[] }[];
    const codes = report.flatMap(file => (file.problems ?? []).map(p => p.code));
    expect(codes).toContain('position-nondeterministic');
  }, 120_000);
});
