/**
 * `eligian smoke <patterns...> [--strict] [--determinism] [--format pretty|github|json|ndjson]`
 * (audit idea #21): compile each program and play its timelines headlessly
 * (see smoke-runner.ts); exit code 1 when something failed at runtime or did
 * not compile, 2 when no file matched.
 *
 * `ndjson` (spec 058 FR-030) writes one JSON object per line as the run goes, through
 * `writeLine`: a `file` line before each file, its `timeline`, `problem` and `step` lines,
 * then one `summary` line. File paths are absolute (the MCP tool reads them).
 *
 * A scenario (`--scenario`, FR-034) applies to one program file: patterns that resolve to more
 * than one (libraries do not count) are a usage error, exit 2, and nothing is played.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Program, SourceLocation } from '@eligian/language';
import { timelineNamed, timelineNames } from '@eligian/language/mcp';
import { expandPatterns, isLibrary } from '../check/check-command.js';
import { displayPath, escapeData, escapeProperty } from '../check/reporters.js';
import { compileFile } from '../compile-file.js';
import type { Scenario } from './scenario.js';
import {
  type SmokeListener,
  type SmokeProblem,
  type SmokeResult,
  smokeConfig,
} from './smoke-runner.js';

export { isLibrary };

export type SmokeFormat = 'pretty' | 'github' | 'json' | 'ndjson';
export const SMOKE_FORMATS: readonly SmokeFormat[] = ['pretty', 'github', 'json', 'ndjson'];

export interface SmokeCommandOptions {
  readonly format: SmokeFormat;
  readonly strict: boolean;
  readonly cwd: string;
  /** Longest a single engine step may take */
  readonly stepTimeoutMs?: number;
  /** Play only these timelines (source names); an unknown one is a problem (FR-035) */
  readonly timelines?: readonly string[];
  readonly scenario?: Scenario;
  /**
   * `--determinism` (FR-033): also compare linear play, a straight seek and a seek back from the
   * end at every boundary (`position-nondeterministic`)
   */
  readonly determinism?: boolean;
  /** ndjson: called with each line as it is produced (without one, the lines are the output) */
  readonly writeLine?: (line: string) => void;
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
  const libraries = new Set<string>();
  for (const file of files) {
    if (isLibrary(await fs.readFile(file, 'utf-8'))) libraries.add(file);
  }
  // A scenario applies to one program file (FR-034 Q5): more is a usage error, nothing runs
  const programs = files.filter(file => !libraries.has(file));
  if (options.scenario && programs.length > 1) {
    const named = programs.map(file => displayPath(file, options.cwd)).join(', ');
    return {
      output: `eligian smoke: --scenario applies to one program file; these patterns match: ${named}`,
      exitCode: 2,
    };
  }
  // ndjson without a writer: the lines are the output
  const buffered: string[] = [];
  const ndjson =
    options.format === 'ndjson'
      ? { ...options, writeLine: options.writeLine ?? (line => void buffered.push(line)) }
      : undefined;
  const results: FileResult[] = [];
  for (const file of files) {
    ndjson?.writeLine(JSON.stringify({ type: 'file', file }));
    if (libraries.has(file)) {
      results.push({ file, library: true, timelines: [], problems: [] });
      continue;
    }
    results.push({ file, ...(await smokeFile(file, ndjson ?? options)) });
  }
  const failed = results.some(r => r.problems.some(p => p.severity === 'error'));
  if (ndjson) {
    ndjson.writeLine(JSON.stringify({ type: 'summary', ...totals(results) }));
    return { output: buffered.join('\n'), exitCode: failed ? 1 : 0 };
  }
  return { output: format(results, options), exitCode: failed ? 1 : 0 };
}

/** Each timeline's declaration (its 1-based start), by config index: FR-031's fallback location. */
export function timelineLocations(program: Program): (SourceLocation | undefined)[] {
  return timelineNames(program).map(name => {
    const node = timelineNamed(program, name)?.$cstNode;
    return node
      ? {
          line: node.range.start.line + 1,
          column: node.range.start.character + 1,
          length: node.length,
        }
      : undefined;
  });
}

/**
 * Compile one program and play it (spec 058 FR-031). With the `ndjson` format and a
 * `writeLine`, its `timeline`, `problem` and `step` lines are written as they happen.
 */
export async function smokeFile(file: string, options: SmokeCommandOptions): Promise<SmokeResult> {
  const listener = options.format === 'ndjson' ? ndjsonListener(file, options.writeLine) : {};
  try {
    const { config, map, host, program } = await compileFile(file);
    return await smokeConfig(config, map, {
      strict: options.strict,
      stepTimeoutMs: options.stepTimeoutMs,
      timelines: options.timelines,
      scenario: options.scenario,
      determinism: options.determinism,
      host,
      names: timelineNames(program),
      timelineLocations: timelineLocations(program),
      sourceDir: path.dirname(file),
      listener,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = (error as { errors?: { message: string }[] }).errors
      ?.map(e => e.message)
      .join('; ');
    const problem: SmokeProblem = {
      code: 'smoke-compile-failed',
      severity: 'error',
      message: `does not compile: ${details ? `${message}: ${details}` : message}`,
    };
    listener.problem?.(problem);
    return { timelines: [], problems: [problem] };
  }
}

/** The ndjson lines of one file's run, each with the file's absolute path. */
function ndjsonListener(
  file: string,
  writeLine: ((line: string) => void) | undefined
): SmokeListener {
  if (!writeLine) return {};
  const absolute = path.resolve(file);
  const write = (type: 'timeline' | 'problem' | 'step', value: object) =>
    writeLine(JSON.stringify({ type, file: absolute, ...value }));
  return {
    timeline: timeline => write('timeline', timeline),
    problem: problem => write('problem', problem),
    step: step => write('step', step),
  };
}

function format(results: readonly FileResult[], options: SmokeCommandOptions): string {
  switch (options.format) {
    case 'json':
      // Unchanged but for the problem codes (FR-031): step results reach the tool by ndjson only
      return JSON.stringify(
        results.map(({ steps: _steps, ...r }) => ({
          ...r,
          file: displayPath(r.file, options.cwd),
        })),
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
      `  timeline '${timeline.name}': ${timeline.boundaries} position${timeline.boundaries === 1 ? '' : 's'} ${errors > 0 ? `FAIL (${errors})` : 'ok'}`
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

/** The files, the timelines played, the errors and the warnings. */
function totals(results: readonly FileResult[]) {
  const count = (severity: SmokeProblem['severity']) =>
    results.reduce((n, r) => n + r.problems.filter(p => p.severity === severity).length, 0);
  return {
    files: results.length,
    timelines: results.reduce((n, r) => n + r.timelines.length, 0),
    errors: count('error'),
    warnings: count('warning'),
  };
}

function summary(results: readonly FileResult[]): string {
  const { files, timelines, errors, warnings } = totals(results);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(files, 'file')}, ${plural(timelines, 'timeline')} played, ${plural(errors, 'error')}, ${plural(warnings, 'warning')}`;
}
