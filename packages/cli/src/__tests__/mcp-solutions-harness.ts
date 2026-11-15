/**
 * Spec 058 Phase 3 (FR-020–FR-022; SC-004, SC-010(6), SC-011(1) solutions half, SC-020(5)): every
 * reference solution under `__fixtures__/mcp-solutions/<id>/` passes gate steps 1–5, materialised
 * as the gate does (a fresh temp copy, then the case's `fixtures`). The steps, the fixture copy and
 * the assertions are the harness's own, imported from the source (`../mcp/evals/assert.js`).
 *
 * The gate steps spawn the CLI one after another (`spawnSync`), so the solutions are spread over
 * `mcp-solutions-{1,2,3}.spec.ts` (one file was 205 s, the floor of the cli tests in CI). The
 * parts are balanced by measured time; `mcp-solutions-1.spec.ts` checks that together they name
 * every case exactly once.
 *
 * The steps spawn `packages/cli/bin/cli.js`, the bundle: a fresh build first.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type GateCase,
  materialiseFixtures,
  runGateSteps,
  type StepsResult,
} from '../mcp/evals/assert.js';
import { requireFreshBundle } from './fresh-bundle.js';

export const REPO = path.resolve(__dirname, '..', '..', '..', '..');
export const CLI = path.join(REPO, 'packages', 'cli', 'bin', 'cli.js');
/** evals/mcp/cases: the case files, their scenarios and start dirs; fixtures are `../fixtures/…` */
export const CASES_DIR = path.join(REPO, 'evals', 'mcp', 'cases');
/** The port-from-json reference project (plan F4): it passes the gate steps with case 12's scenario */
export const PORT_SOURCE = path.join(REPO, 'evals', 'mcp', 'fixtures', 'port-from-json', 'source');
export const SOLUTIONS = path.join(__dirname, '__fixtures__', 'mcp-solutions');

/** The case ids, from evals/mcp/cases/*.json (the scenarios beside them excluded). */
export const CASE_IDS = fs
  .readdirSync(CASES_DIR)
  .filter(file => file.endsWith('.json') && !file.endsWith('.scenario.json'))
  .map(file => file.slice(0, -'.json'.length))
  .sort();

/**
 * The solutions per spec file, balanced by measured time (2026-11-15, local, cli suite under
 * load): part 1 also runs the port-from-json source (43 s), part 3 the negative controls (26 s).
 */
export const SOLUTION_PARTS: readonly (readonly string[])[] = [
  ['audio-lyrics'],
  [
    'fix-dataflow',
    'fix-selectors',
    'host-module',
    'keyboard-deck',
    'library-reuse',
    'port-from-json',
    'replay-safe',
    'scrollytelling',
  ],
  ['staggered-list', 'three-chapters', 'title-card', 'typewriter-counter', 'video-subtitles'],
];

export const readCase = (id: string): GateCase =>
  JSON.parse(fs.readFileSync(path.join(CASES_DIR, `${id}.json`), 'utf8')) as GateCase;

export interface SolutionsHarness {
  /** A fresh copy of a solution in the temp dir; edit it before {@link gate} materialises fixtures */
  readonly copySolution: (id: string, name?: string) => string;
  /** Steps 1–5 over `dir` for case `id`, the fixtures materialised first unless `media` is false */
  readonly gate: (id: string, dir: string, options?: { media?: boolean }) => StepsResult;
  /** The temp dir of this spec file */
  readonly tmp: () => string;
}

/** One temp dir per spec file (created in `beforeAll`, removed in `afterAll`). */
export function useSolutionsHarness(): SolutionsHarness {
  let tmp = '';
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-solutions-'));
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const copySolution = (id: string, name: string = id): string => {
    const dir = path.join(tmp, name);
    fs.cpSync(path.join(SOLUTIONS, id), dir, { recursive: true });
    return dir;
  };
  const gate = (id: string, dir: string, { media = true } = {}): StepsResult => {
    const evalCase = readCase(id);
    const fixtureFailures = media ? materialiseFixtures(evalCase, CASES_DIR, dir) : [];
    const result = runGateSteps({ dir, cli: CLI, casesDir: CASES_DIR, evalCase });
    return { ...result, failures: [...fixtureFailures, ...result.failures] };
  };
  return { copySolution, gate, tmp: () => tmp };
}

/**
 * The per-case test for each solution of `ids`: gate steps 1–5 pass, and every operation of its
 * step-4 map has an origin (was one test over all 14 maps).
 */
export function describeSolutions(ids: readonly string[], harness: SolutionsHarness): void {
  describe('reference solutions', () => {
    beforeAll(() => requireFreshBundle());

    it.each(ids)(
      '%s passes gate steps 1–5, every step-4 operation has an origin',
      id => {
        const result = harness.gate(id, harness.copySolution(id));

        expect(result.failures).toEqual([]);
        expect(result.assertions).toHaveLength(readCase(id).assertions.length);
        for (const assertion of result.assertions) {
          expect(assertion.pass, `${assertion.kind}: ${assertion.detail}`).toBe(true);
        }

        const { map } = result;
        expect(map, `${id}: no step-4 map`).toBeDefined();
        let operations = 0;
        const missing: string[] = [];
        for (const [actionId, action] of Object.entries(map?.actions ?? {})) {
          for (const [list, ops] of [
            ['start', action.start],
            ['end', action.end],
          ] as const) {
            ops.forEach((operation, i) => {
              operations++;
              if (operation.origin === undefined) {
                missing.push(`${action.name} (${actionId}) ${list}[${i}] ${operation.systemName}`);
              }
            });
          }
        }
        expect(operations).toBeGreaterThan(0);
        expect(missing).toEqual([]);
      },
      120_000
    );
  });
}
