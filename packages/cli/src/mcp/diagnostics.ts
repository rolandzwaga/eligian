/**
 * Spec 058 Phase 1 (FR-015; plan C6): the diagnostics `eligian_check` returns.
 *
 * A pure builder from the check layer's `CheckDiagnostic`s: each gets the stage
 * that emitted it (the Phase 0 registry for registry codes), the source lines of
 * its range, the suggestions and quick fix of its `data`, and its overlay: the
 * docs id on every diagnostic, the fix text inline on the first one of each code
 * in a response, so the agent needs no `eligian_docs` call to fix it.
 *
 * Spec 058 Phase 2 (FR-045; plan D5): the `smoke` source, the step fields of a
 * smoke problem, and `smokeToMcpDiagnostics` for `eligian_smoke`.
 */
import * as path from 'node:path';
import {
  type CheckDiagnostic,
  type CheckFileResult,
  type CheckSeverity,
  DIAGNOSTIC_CODES,
  type QuickFix,
} from '@eligian/language';
import { Schema } from 'effect';
import { REVIEW_CODES } from '../check/review.js';
import { SMOKE_CODES, type SmokeProblem } from '../smoke/smoke-runner.js';
import type { Overlay, Overlays } from './knowledge/types.js';

export type McpDiagnosticSource =
  | 'parser'
  | 'validator'
  | 'type'
  | 'linker'
  | 'compiler'
  | 'eligius-lint'
  | 'review'
  | 'fmt'
  | 'smoke';

export interface McpDiagnostic {
  readonly source: McpDiagnosticSource;
  readonly severity: CheckSeverity;
  readonly code: string;
  readonly message: string;
  /** Absolute path */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  /** The source line(s) of the range, at most 3 */
  readonly excerpt: string;
  readonly suggestions?: readonly string[];
  readonly quickFix?: QuickFix;
  /** The overlay id */
  readonly docs?: string;
  /** The overlay's cause + fix text */
  readonly fix?: string;
  /** Smoke: the timeline it happened in (its name) */
  readonly timeline?: string;
  /** Smoke: the position (seconds) it happened at */
  readonly time?: number;
  /** Smoke: the scenario step index */
  readonly step?: number;
  /** Smoke: a failed assertion's expected value, as JSON text */
  readonly expected?: string;
  /** Smoke: a failed assertion's actual value, as JSON text */
  readonly actual?: string;
}

const MCP_DIAGNOSTIC_SOURCES = [
  'parser',
  'validator',
  'type',
  'linker',
  'compiler',
  'eligius-lint',
  'review',
  'fmt',
  'smoke',
] as const;

const QuickFixSchema = Schema.Struct({
  line: Schema.Int,
  column: Schema.Int,
  endLine: Schema.Int,
  endColumn: Schema.Int,
  newText: Schema.String,
});

/** One diagnostic in `eligian_check`'s success schema. */
export const McpDiagnosticSchema = Schema.Struct({
  source: Schema.Literals(MCP_DIAGNOSTIC_SOURCES),
  severity: Schema.Literals(['error', 'warning', 'info', 'hint']),
  code: Schema.String,
  message: Schema.String,
  file: Schema.String,
  line: Schema.Int,
  column: Schema.Int,
  endLine: Schema.optionalKey(Schema.Int),
  endColumn: Schema.optionalKey(Schema.Int),
  excerpt: Schema.String,
  suggestions: Schema.optionalKey(Schema.Array(Schema.String)),
  quickFix: Schema.optionalKey(QuickFixSchema),
  docs: Schema.optionalKey(Schema.String),
  fix: Schema.optionalKey(Schema.String),
  timeline: Schema.optionalKey(Schema.String),
  time: Schema.optionalKey(Schema.Finite),
  step: Schema.optionalKey(Schema.Int),
  expected: Schema.optionalKey(Schema.String),
  actual: Schema.optionalKey(Schema.String),
});

const REGISTRY_SOURCES: ReadonlyMap<string, McpDiagnosticSource> = new Map(
  DIAGNOSTIC_CODES.map(entry => [entry.code, entry.source])
);

const REVIEW: ReadonlySet<string> = new Set(REVIEW_CODES);

const SMOKE: ReadonlySet<string> = new Set(SMOKE_CODES);

/**
 * The stage that emitted a code: the registry's source for registry codes, then
 * the CLI-layer codes (`eligius-<rule>`, `compile-failed`, the review codes,
 * the smoke codes); anything else (such as `uncoded`) is `validator`.
 */
export function sourceOf(code: string): McpDiagnosticSource {
  const registered = REGISTRY_SOURCES.get(code);
  if (registered) return registered;
  if (code.startsWith('eligius-')) return 'eligius-lint';
  if (code === 'compile-failed') return 'compiler';
  if (REVIEW.has(code)) return 'review';
  if (SMOKE.has(code)) return 'smoke';
  return 'validator';
}

/**
 * Lines `line … min(endLine, line + 2)` (1-based) of `source`, split CRLF-safe
 * and joined with `\n`.
 */
export function excerptOf(source: string, line: number, endLine: number): string {
  const last = Math.max(line, Math.min(endLine, line + 2));
  return source
    .split(/\r?\n/)
    .slice(line - 1, last)
    .join('\n');
}

/**
 * The `McpDiagnostic`s of a check, in file then document order. `readSource` is
 * called once per file that has diagnostics; a file that cannot be read gets an
 * empty excerpt.
 */
export function toMcpDiagnostics(
  results: readonly CheckFileResult[],
  overlays: Overlays,
  readSource: (file: string) => string
): McpDiagnostic[] {
  const withFix = new Set<string>();
  const out: McpDiagnostic[] = [];
  for (const result of results) {
    if (result.diagnostics.length === 0) continue;
    const text = readOrEmpty(readSource, result.file);
    for (const d of result.diagnostics) {
      const source = sourceOf(d.code);
      const overlay: Overlay | undefined = overlays.byCode[d.code] ?? overlays.bySource[source];
      const firstOfCode = !withFix.has(d.code);
      withFix.add(d.code);
      out.push({
        source,
        severity: d.severity,
        code: d.code,
        message: d.message,
        file: path.resolve(d.file),
        line: d.line,
        column: d.column,
        endLine: d.endLine,
        endColumn: d.endColumn,
        excerpt: excerptOf(text, d.line, d.endLine),
        ...(d.data?.suggestions ? { suggestions: d.data.suggestions } : {}),
        ...(d.data?.quickFix ? { quickFix: d.data.quickFix } : {}),
        ...(overlay ? { docs: overlay.docs } : {}),
        ...(overlay && firstOfCode ? { fix: overlay.fix } : {}),
      });
    }
  }
  return out;
}

/** A smoke problem of a program file (the file it was played from). */
export type FileSmokeProblem = SmokeProblem & { readonly file: string };

/**
 * The `McpDiagnostic`s of smoke problems, in problem order: located at their
 * `location` (the failing operation, possibly in a library), else at line 1,
 * column 1 of their program file (FR-045); built with `toMcpDiagnostics`, then
 * given the problem's `timeline`, `time`, `step`, `expected` and `actual`.
 * `readSource` is called once per file.
 */
export function smokeToMcpDiagnostics(
  problems: readonly FileSmokeProblem[],
  overlays: Overlays,
  readSource: (file: string) => string
): McpDiagnostic[] {
  // One CheckFileResult per run of problems in the same file keeps problem order
  const results: { file: string; diagnostics: CheckDiagnostic[] }[] = [];
  for (const problem of problems) {
    const file = problem.location?.file ?? problem.file;
    const line = problem.location?.line ?? 1;
    const column = problem.location?.column ?? 1;
    let run = results[results.length - 1];
    if (run?.file !== file) {
      run = { file, diagnostics: [] };
      results.push(run);
    }
    run.diagnostics.push({
      file,
      severity: problem.severity,
      message: problem.message,
      line,
      column,
      endLine: line,
      endColumn: column,
      code: problem.code,
    });
  }
  const sources = new Map<string, string>();
  const readOnce = (file: string): string => {
    let text = sources.get(file);
    if (text === undefined) {
      text = readSource(file);
      sources.set(file, text);
    }
    return text;
  };
  return toMcpDiagnostics(results, overlays, readOnce).map((d, i) => ({
    ...d,
    ...stepFields(problems[i]),
  }));
}

function stepFields(problem: SmokeProblem): Partial<McpDiagnostic> {
  return {
    ...(problem.timeline !== undefined ? { timeline: problem.timeline } : {}),
    ...(problem.time !== undefined ? { time: problem.time } : {}),
    ...(problem.step !== undefined ? { step: problem.step } : {}),
    ...(problem.expected !== undefined ? { expected: problem.expected } : {}),
    ...(problem.actual !== undefined ? { actual: problem.actual } : {}),
  };
}

function readOrEmpty(readSource: (file: string) => string, file: string): string {
  try {
    return readSource(file);
  } catch {
    return '';
  }
}
