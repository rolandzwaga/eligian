/**
 * `eligian smoke <patterns...> [--strict] [--format pretty|github|json]`
 * (audit idea #21): compile each program and play its timelines headlessly
 * (see smoke-runner.ts); exit code 1 when something failed at runtime or did
 * not compile, 2 when no file matched.
 */
import * as fs from 'node:fs/promises';
import { expandPatterns, isLibrary } from '../check/check-command.js';
import { displayPath, escapeData, escapeProperty } from '../check/reporters.js';
import { compileFile } from '../compile-file.js';
import { type SmokeProblem, type SmokeResult, smokeConfig } from './smoke-runner.js';

export { isLibrary };

export type SmokeFormat = 'pretty' | 'github' | 'json';
export const SMOKE_FORMATS: readonly SmokeFormat[] = ['pretty', 'github', 'json'];

export interface SmokeCommandOptions {
  readonly format: SmokeFormat;
  readonly strict: boolean;
  readonly cwd: string;
  /** Longest a single engine step may take */
  readonly stepTimeoutMs?: number;
}

export interface SmokeOutcome {
  readonly output: string;
  readonly exitCode: number;
}

interface FileResult extends SmokeResult {
  readonly file: string;
  /** A library file: only actions, nothing to play */
  readonly library?: boolean;
}

export function parseSmokeFormat(value: string): SmokeFormat | undefined {
  return SMOKE_FORMATS.includes(value as SmokeFormat) ? (value as SmokeFormat) : undefined;
}

export async function runSmoke(
  patterns: readonly string[],
  options: SmokeCommandOptions
): Promise<SmokeOutcome> {
  const files = await expandPatterns(patterns, options.cwd);
  if (files.length === 0) {
    return { output: `No .eligian files match ${patterns.join(' ')}`, exitCode: 2 };
  }
  const results: FileResult[] = [];
  for (const file of files) {
    if (isLibrary(await fs.readFile(file, 'utf-8'))) {
      results.push({ file, library: true, timelines: [], problems: [] });
      continue;
    }
    results.push({ file, ...(await smokeFile(file, options)) });
  }
  const failed = results.some(r => r.problems.some(p => p.severity === 'error'));
  return { output: format(results, options), exitCode: failed ? 1 : 0 };
}

async function smokeFile(file: string, options: SmokeCommandOptions): Promise<SmokeResult> {
  try {
    const { config, map, host } = await compileFile(file);
    return await smokeConfig(config, map, { ...options, host });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = (error as { errors?: { message: string }[] }).errors
      ?.map(e => e.message)
      .join('; ');
    return {
      timelines: [],
      problems: [
        {
          severity: 'error',
          message: `does not compile: ${details ? `${message}: ${details}` : message}`,
        },
      ],
    };
  }
}

function format(results: readonly FileResult[], options: SmokeCommandOptions): string {
  switch (options.format) {
    case 'json':
      return JSON.stringify(
        results.map(r => ({ ...r, file: displayPath(r.file, options.cwd) })),
        null,
        2
      );
    case 'github':
      return [
        ...results.flatMap(r => r.problems.map(p => githubLine(p, r.file, options.cwd))),
        summary(results),
      ].join('\n');
    default:
      return [...results.flatMap(r => prettyFile(r, options.cwd)), summary(results)].join('\n');
  }
}

/** Where and when: `tour.eligian:44:7`, `'Logic' at 9s`. */
function where(problem: SmokeProblem, file: string, cwd: string): string {
  const at = problem.location
    ? `${displayPath(problem.location.file, cwd)}:${problem.location.line}:${problem.location.column}`
    : displayPath(file, cwd);
  const when =
    problem.timeline !== undefined
      ? ` — '${problem.timeline}'${problem.time !== undefined ? ` at ${problem.time}s` : ''}`
      : '';
  return `${at}${when}`;
}

function prettyFile(result: FileResult, cwd: string): string[] {
  const lines = [
    `${displayPath(result.file, cwd)}${result.library ? ' (library: nothing to play)' : ''}`,
  ];
  for (const timeline of result.timelines) {
    const errors = result.problems.filter(
      p => p.timeline === timeline.name && p.severity === 'error'
    ).length;
    lines.push(
      timeline.skipped
        ? `  timeline '${timeline.name}' skipped (${timeline.skipped})`
        : `  timeline '${timeline.name}': ${timeline.boundaries} position${timeline.boundaries === 1 ? '' : 's'} ${errors > 0 ? `FAIL (${errors})` : 'ok'}`
    );
  }
  for (const problem of result.problems) {
    lines.push(`  ${problem.severity}  ${problem.message}`);
    lines.push(`         ${where(problem, result.file, cwd)}`);
  }
  return lines;
}

function githubLine(problem: SmokeProblem, file: string, cwd: string): string {
  const properties = [
    `file=${escapeProperty(displayPath(problem.location?.file ?? file, cwd))}`,
    ...(problem.location
      ? [`line=${problem.location.line}`, `col=${problem.location.column}`]
      : []),
    'title=eligian smoke',
  ].join(',');
  const when =
    problem.timeline !== undefined
      ? ` ('${problem.timeline}'${problem.time !== undefined ? ` at ${problem.time}s` : ''})`
      : '';
  return `::${problem.severity} ${properties}::${escapeData(`${problem.message}${when}`)}`;
}

function summary(results: readonly FileResult[]): string {
  const timelines = results.reduce((n, r) => n + r.timelines.filter(t => !t.skipped).length, 0);
  const errors = results.reduce(
    (n, r) => n + r.problems.filter(p => p.severity === 'error').length,
    0
  );
  const warnings = results.reduce(
    (n, r) => n + r.problems.filter(p => p.severity === 'warning').length,
    0
  );
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(results.length, 'file')}, ${plural(timelines, 'timeline')} played, ${plural(errors, 'error')}, ${plural(warnings, 'warning')}`;
}
