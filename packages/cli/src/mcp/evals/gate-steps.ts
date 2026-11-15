/**
 * Spec 058 Phase 3 (FR-014, FR-022; plan D2): the gate steps 1–5 of roadmap §6.1 over a produced
 * project, and the fixture materialising that precedes them. Shared by `evals/mcp/gate.ts` (through
 * the build output `dist/evals/assert.mjs`, with the installed tarball's CLI) and
 * `mcp-solutions.spec.ts` (through the source, with the repo's `bin/cli.js`).
 *
 * Every step runs and its failures are collected, so a step-1 failure does not hide a step-3 one.
 * Failures are data: a missing file is a named failure, never a throw. Plain synchronous
 * TypeScript (plan D).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { EligianMap, IEngineConfiguration } from '@eligian/language';
import { readStoryboard } from '../storyboard.js';
import { type Assertion, type AssertionResult, evaluateAssertions } from './assert.js';
import type { Budget } from './harness.js';

export interface GateCase {
  readonly id: string;
  readonly entry: string;
  readonly scenario?: string;
  readonly assertions: readonly Assertion[];
  readonly fixtures?: readonly { readonly from: string; readonly to: string }[];
  readonly budget?: Budget;
}

export interface StepOptions {
  readonly dir: string;
  /** The bin/cli.js to run: the installed tarball's (gate.ts) or the repo's (solutions spec) */
  readonly cli: string;
  readonly casesDir: string;
  readonly evalCase: GateCase;
}

export interface StepsResult {
  readonly failures: readonly string[];
  readonly checkCodes?: readonly string[];
  readonly assertions: readonly AssertionResult[];
  /** Step 4's --eligian-map file (eligianMapPath('out/config.json') = out/config.eligian-map.json, cli-options.ts:50-52), read back; SC-011(1)'s solutions half */
  readonly map?: EligianMap;
}

interface SmokeReportProblem {
  readonly code?: string;
  readonly severity: string;
  readonly message: string;
  readonly location?: { readonly line?: number };
}

/** Step 3's argv after `smoke <entry>`: --strict --format json [--scenario <file>] --determinism (FR-014 step 3) */
export function smokeStepArgs(evalCase: GateCase, casesDir: string): readonly string[] {
  const scenario =
    evalCase.scenario === undefined ? [] : ['--scenario', path.join(casesDir, evalCase.scenario)];
  return ['--strict', '--format', 'json', ...scenario, '--determinism'];
}

/** Copy every `fixtures` entry ({ from: relative to casesDir, e.g. `../fixtures/media/song.mp3`; to: relative to dir }); a missing file is a named failure. */
export function materialiseFixtures(
  evalCase: GateCase,
  casesDir: string,
  dir: string
): readonly string[] {
  const failures: string[] = [];
  for (const fixture of evalCase.fixtures ?? []) {
    const source = path.join(casesDir, fixture.from);
    if (!fs.existsSync(source)) {
      failures.push(`missing fixture: ${fixture.from}`);
      continue;
    }
    const target = path.join(dir, fixture.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  return failures;
}

/** The last five lines of a step's output, on one line. */
function tail(text: string | null): string {
  return (text ?? '').trim().split(/\r?\n/).slice(-5).join(' | ');
}

/** The problems of a `smoke --format json` report; undefined when the text is not one. */
function smokeReportProblems(text: string | null): readonly SmokeReportProblem[] | undefined {
  try {
    const report = JSON.parse(text ?? '') as { problems?: SmokeReportProblem[] }[];
    return Array.isArray(report) ? report.flatMap(file => file.problems ?? []) : undefined;
  } catch {
    return undefined;
  }
}

function describeProblems(problems: readonly SmokeReportProblem[]): string {
  return problems
    .map(
      p =>
        `${p.severity}: ${p.message}${p.location?.line === undefined ? '' : ` (line ${p.location.line})`}`
    )
    .join(' | ');
}

/** The JSON of a CLI step's stdout; undefined when it does not parse. */
function readJsonText<T>(text: string | null): T | undefined {
  try {
    return JSON.parse(text ?? '') as T;
  } catch {
    return undefined;
  }
}

/** The JSON of a file; undefined when it is absent or does not parse. */
function readJson<T>(file: string): T | undefined {
  return fs.existsSync(file) ? readJsonText<T>(fs.readFileSync(file, 'utf8')) : undefined;
}

/** Steps 1–5: check, fmt --check, smoke --strict --scenario --determinism, compile --eligian-map + assertions, the scenario's results. */
export function runGateSteps(options: StepOptions): StepsResult {
  const { dir, cli, casesDir, evalCase } = options;
  const entry = evalCase.entry;
  const failures: string[] = [];
  const eligian = (args: readonly string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

  if (!fs.existsSync(cli)) failures.push(`setup: ${cli} does not exist (tarball not installed)`);
  if (evalCase.scenario !== undefined && !fs.existsSync(path.join(casesDir, evalCase.scenario))) {
    failures.push(`scenario file not found: ${evalCase.scenario}`);
  }

  // Step 1: check, strict.
  const check = eligian([
    'check',
    entry,
    '--max-warnings',
    '0',
    '--selector-not-in-layout',
    'ids',
    '--format',
    'json',
  ]);
  const checkReport = readJsonText<{
    files: { diagnostics: { code?: string; severity: string }[] }[];
  }>(check.stdout);
  const checkCodes = checkReport?.files.flatMap(file =>
    file.diagnostics.map(d => d.code ?? d.severity)
  );
  if (check.status !== 0) {
    const detail = checkCodes
      ? `codes: ${checkCodes.join(', ')}`
      : tail(check.stderr || check.stdout);
    failures.push(`step 1 (check): exit ${check.status}; ${detail}`);
  }

  // Step 2: fmt --check.
  const fmt = eligian(['fmt', '--check', '**/*.eligian']);
  if (fmt.status !== 0) {
    failures.push(`step 2 (fmt --check): exit ${fmt.status}; ${tail(fmt.stdout || fmt.stderr)}`);
  }

  // Step 3: smoke --strict --determinism, with the case's scenario when it has one.
  const smoke = eligian(['smoke', entry, ...smokeStepArgs(evalCase, casesDir)]);
  const problems = smokeReportProblems(smoke.stdout);
  const scenarioProblems = (problems ?? []).filter(p => p.code?.startsWith('scenario-'));
  const otherProblems = (problems ?? []).filter(p => !p.code?.startsWith('scenario-'));
  if (smoke.status !== 0 && (otherProblems.length > 0 || scenarioProblems.length === 0)) {
    const detail =
      otherProblems.length > 0
        ? describeProblems(otherProblems)
        : tail(smoke.stderr || smoke.stdout);
    failures.push(`step 3 (smoke --strict --determinism): exit ${smoke.status}; ${detail}`);
  }

  // Step 4: compile with the Eligian map, into a fresh out/ (compile does not create it).
  const out = path.join(dir, 'out');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out);
  const compile = eligian(['compile', entry, '--eligian-map', '-o', 'out/config.json']);
  if (compile.status !== 0) {
    failures.push(
      `step 4 (compile): exit ${compile.status}; ${tail(compile.stderr || compile.stdout)}`
    );
  }
  const config =
    compile.status === 0
      ? readJson<IEngineConfiguration>(path.join(out, 'config.json'))
      : undefined;
  const map = readJson<EligianMap>(path.join(out, 'config.eligian-map.json'));
  let assertions: readonly AssertionResult[];
  if (config === undefined) {
    assertions = evalCase.assertions.map(assertion => ({
      kind: assertion.kind,
      pass: false,
      detail: 'no compiled config (step 4 failed)',
    }));
  } else {
    const storyboardFile = path.join(dir, 'STORYBOARD.md');
    const startDir = path.join(casesDir, evalCase.id, 'start');
    assertions = evaluateAssertions(
      {
        projectDir: dir,
        entry,
        config,
        map,
        storyboard: fs.existsSync(storyboardFile)
          ? readStoryboard(fs.readFileSync(storyboardFile, 'utf8'))
          : undefined,
        checkCodes,
        startDir: fs.existsSync(startDir) ? startDir : undefined,
        casesDir,
        eligian: args => {
          const run = eligian(args);
          return { status: run.status, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
        },
      },
      evalCase.assertions
    );
  }
  for (const result of assertions) {
    if (!result.pass) failures.push(`step 4 (assertion ${result.kind}): ${result.detail}`);
  }

  // Step 5: the scenario's behavioural assertions, from step 3's report.
  if (scenarioProblems.length > 0) {
    failures.push(`step 5 (scenario): ${describeProblems(scenarioProblems)}`);
  }

  return { failures, checkCodes, assertions, map };
}
