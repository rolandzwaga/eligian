/**
 * Spec 058 Phase 3 (FR-014, FR-022; Edge cases "Missing files"; plan D2): the gate steps 1–5 and
 * the fixture materialising shared by `evals/mcp/gate.ts` and `mcp-solutions.spec.ts`. Imported
 * through `assert.ts`, the entry of the eval bundle, so its re-exports are covered too.
 *
 * The `runGateSteps` cases spawn `packages/cli/bin/cli.js`, the bundle: a fresh build first.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type GateCase,
  materialiseFixtures,
  runGateSteps,
  smokeStepArgs,
} from '../mcp/evals/assert.js';
import { requireFreshBundle } from './fresh-bundle.js';

const CLI = path.resolve(__dirname, '..', '..', 'bin', 'cli.js');

const LAYOUT = '<div id="stage"><div id="a"></div></div>\n';
const STYLES = '#stage {}\n#a {}\n.on {}\n';
const CLEAN = `layout "./layout.html"
styles "./styles.css"

timeline "Clean" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") addClass("on") ] [ selectElement("#a") removeClass("on") ]
}
`;
/** A `timeline-source-unused` warning (step 1) and a `smoke-engine-error` (step 3). */
const BROKEN = `layout "./layout.html"
styles "./styles.css"

action boom() [ selectElement($globaldata.nothing) addClass("on") ]

timeline "Broken" in "#stage" using raf from "x.mp4" {
  at 0s..1s boom()
}
`;

const gateCase = (overrides: Partial<GateCase> = {}): GateCase => ({
  id: 'probe',
  entry: 'main.eligian',
  assertions: [],
  ...overrides,
});

describe('gate steps', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-gate-steps-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** A project dir with `main.eligian` = `program`, its layout and styles. */
  const project = (program: string): string => {
    const dir = path.join(tmp, 'project');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'layout.html'), LAYOUT);
    fs.writeFileSync(path.join(dir, 'styles.css'), STYLES);
    fs.writeFileSync(path.join(dir, 'main.eligian'), program);
    return dir;
  };

  it('smokeStepArgs contains --strict --format json --determinism, and --scenario only when the case has one', () => {
    const casesDir = path.join(tmp, 'cases');
    expect(smokeStepArgs(gateCase(), casesDir)).toEqual([
      '--strict',
      '--format',
      'json',
      '--determinism',
    ]);
    expect(smokeStepArgs(gateCase({ scenario: 'probe.scenario.json' }), casesDir)).toEqual([
      '--strict',
      '--format',
      'json',
      '--scenario',
      path.join(casesDir, 'probe.scenario.json'),
      '--determinism',
    ]);
  });

  it('materialiseFixtures copies each from → to and names a missing file', () => {
    const casesDir = path.join(tmp, 'cases');
    fs.mkdirSync(path.join(casesDir, 'fixtures', 'media'), { recursive: true });
    fs.writeFileSync(path.join(casesDir, 'fixtures', 'media', 'song.mp3'), 'mp3 bytes');
    const dir = path.join(tmp, 'project');
    fs.mkdirSync(dir);

    const present = gateCase({
      fixtures: [{ from: 'fixtures/media/song.mp3', to: 'media/deep/song.mp3' }],
    });
    expect(materialiseFixtures(present, casesDir, dir)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, 'media', 'deep', 'song.mp3'), 'utf8')).toBe('mp3 bytes');

    const absent = gateCase({
      fixtures: [
        { from: 'fixtures/media/intro.mp4', to: 'media/intro.mp4' },
        { from: 'fixtures/media/song.mp3', to: 'media/song.mp3' },
      ],
    });
    expect(materialiseFixtures(absent, casesDir, dir)).toEqual([
      'missing fixture: fixtures/media/intro.mp4',
    ]);
    expect(fs.existsSync(path.join(dir, 'media', 'intro.mp4'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'media', 'song.mp3'))).toBe(true);

    expect(materialiseFixtures(gateCase(), casesDir, dir)).toEqual([]);
  });

  describe('runGateSteps (spawns the bundle)', () => {
    beforeAll(() => requireFreshBundle());

    it('a case whose scenario file is missing fails with a named message', () => {
      const dir = project(CLEAN);
      const casesDir = path.join(tmp, 'cases');
      fs.mkdirSync(casesDir);
      let result: ReturnType<typeof runGateSteps> | undefined;
      expect(() => {
        result = runGateSteps({
          dir,
          cli: CLI,
          casesDir,
          evalCase: gateCase({ scenario: 'nope.scenario.json' }),
        });
      }).not.toThrow();
      expect(result?.failures).toContain('scenario file not found: nope.scenario.json');
    }, 120_000);

    it('every step runs: a step-1 failure does not hide a step-3 failure', () => {
      const dir = project(BROKEN);
      const casesDir = path.join(tmp, 'cases');
      fs.mkdirSync(casesDir);
      const result = runGateSteps({
        dir,
        cli: CLI,
        casesDir,
        evalCase: gateCase({ assertions: [{ kind: 'timelines.count', equals: 1 }] }),
      });

      expect(result.checkCodes).toEqual(['timeline-source-unused']);
      expect(result.failures.some(f => f.startsWith('step 1 (check)'))).toBe(true);
      // the program is formatted: step 2 passes
      expect(result.failures.some(f => f.startsWith('step 2'))).toBe(false);
      const step3 = result.failures.find(f => f.startsWith('step 3 (smoke'));
      expect(step3).toBeDefined();
      expect(step3).toContain('selectElement');
      // step 4 compiles (a warning is not an error) and its assertions run over out/config.json
      expect(result.failures.some(f => f.startsWith('step 4'))).toBe(false);
      expect(result.assertions).toEqual([
        expect.objectContaining({ kind: 'timelines.count', pass: true }),
      ]);
      expect(result.map?.timelineNames).toEqual(['Broken']);
    }, 120_000);
  });
});

describe('evals/mcp/gate.ts --call-budget (FR-008: the gate defaults to enforce)', () => {
  const REPO = path.resolve(__dirname, '..', '..', '..', '..');
  const CASE = 'title-card';
  const NO_BUDGET = 'step 6 (budget): no tool-call budget';
  let dir: string;

  beforeAll(() => requireFreshBundle());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-gate-budget-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The gate's `{ pass, failures }` line for a project dir without an installed CLI. */
  const gate = (...args: string[]): { pass: boolean; failures: string[] } => {
    const run = spawnSync(
      `pnpm exec tsx evals/mcp/gate.ts "${dir}" --case ${CASE} ${args.join(' ')}`,
      { cwd: REPO, encoding: 'utf-8', shell: true }
    );
    expect(run.status, run.stderr).toBe(1);
    return JSON.parse(run.stdout.trim().split('\n').pop() ?? '');
  };

  it('without --call-budget the tool-call check applies, as under enforce', () => {
    const caseFile = path.join(REPO, 'evals', 'mcp', 'cases', `${CASE}.json`);
    const hasBudget = 'budget' in JSON.parse(fs.readFileSync(caseFile, 'utf-8'));

    const byDefault = gate();
    expect(byDefault.failures).toEqual(gate('--call-budget', 'enforce').failures);
    expect(byDefault.failures.includes(NO_BUDGET)).toBe(!hasBudget);
    expect(gate('--call-budget', 'off').failures).not.toContain(NO_BUDGET);
  }, 120_000);

  it('the usage names enforce as the default', () => {
    const run = spawnSync('pnpm exec tsx evals/mcp/gate.ts --help', {
      cwd: REPO,
      encoding: 'utf-8',
      shell: true,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('enforce (default)');
  }, 60_000);
});
