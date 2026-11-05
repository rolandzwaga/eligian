/**
 * Spec 058 Phase 1 (FR-015; plan C6): the diagnostics `eligian_check` returns.
 *
 * A pure builder from the check layer's `CheckDiagnostic`s: each gets the stage
 * that emitted it (the Phase 0 registry for registry codes), the source lines of
 * its range, the suggestions and quick fix of its `data`, and its overlay: the
 * docs id on every diagnostic, the fix text inline on the first one of each code
 * in a response, so the agent needs no `eligian_docs` call to fix it.
 */
import * as path from 'node:path';
import {
  type CheckFileResult,
  type CheckSeverity,
  DIAGNOSTIC_CODES,
  type QuickFix,
} from '@eligian/language';
import { Schema } from 'effect';
import { REVIEW_CODES } from '../check/review.js';
import type { Overlay, Overlays } from './knowledge/types.js';

export type McpDiagnosticSource =
  | 'parser'
  | 'validator'
  | 'type'
  | 'linker'
  | 'compiler'
  | 'eligius-lint'
  | 'review'
  | 'fmt';

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
});

const REGISTRY_SOURCES: ReadonlyMap<string, McpDiagnosticSource> = new Map(
  DIAGNOSTIC_CODES.map(entry => [entry.code, entry.source])
);

const REVIEW: ReadonlySet<string> = new Set(REVIEW_CODES);

/**
 * The stage that emitted a code: the registry's source for registry codes, then
 * the CLI-layer codes (`eligius-<rule>`, `compile-failed`, the review codes);
 * anything else (such as `uncoded`) is `validator`.
 */
export function sourceOf(code: string): McpDiagnosticSource {
  const registered = REGISTRY_SOURCES.get(code);
  if (registered) return registered;
  if (code.startsWith('eligius-')) return 'eligius-lint';
  if (code === 'compile-failed') return 'compiler';
  if (REVIEW.has(code)) return 'review';
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

function readOrEmpty(readSource: (file: string) => string, file: string): string {
  try {
    return readSource(file);
  } catch {
    return '';
  }
}
