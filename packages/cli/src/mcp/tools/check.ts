/**
 * Spec 058 Phase 1 (FR-015, FR-017, FR-023, SC-006; plan C9): `eligian_check`, the check as an
 * MCP tool.
 *
 * Paths and globs resolve under the project root (`resolveInputPatterns`); `checkPaths` (the
 * check `eligian check` runs: every diagnostic, then Eligius' lint and the review pass over each
 * program without errors) runs under the compiler lock, since it uses the shared Langium
 * services. Each finding becomes an `McpDiagnostic` carrying its suggestions or quick fix, the
 * source lines of its range and its overlay (`toMcpDiagnostics`). The defaults are stricter than
 * the CLI's: lint and review on, layout ids checked, no warnings allowed.
 *
 * `Tool` is `@stability unstable`; the server is built on it (roadmap §2, decision 1: `effect` is
 * pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import fs from 'node:fs';
import { Effect, Schema } from 'effect';
import { checkPaths } from '../../check/check-command.js';
import { summarize } from '../../check/reporters.js';
import { CompilerLock } from '../compiler-lock.js';
import { McpDiagnosticSchema, toMcpDiagnostics } from '../diagnostics.js';
import { type ToolError, ToolFailure, toToolError } from '../errors.js';
import { loadKnowledge } from '../knowledge/load.js';
import { type EffectAi, projectRoot, resolveInputPatterns } from '../paths.js';

/** What every tool handler receives from the server (plan C9). */
export interface ToolContext {
  readonly ai: EffectAi;
  readonly cwd: string;
  readonly docsRoot: URL | string;
  readonly versions: { readonly compiler: string; readonly eligius: string };
  readonly requestId: string;
}

export const NAME = 'eligian_check' as const;

export const DESCRIPTION =
  'Check Eligian (.eligian) files: every diagnostic of the compiler, Eligius lint and the review ' +
  'pass (controllers never removed, classes never removed). Run it after EVERY edit until it ' +
  'reports 0 errors and 0 warnings (`ok: true`). Each diagnostic carries its fix: `suggestions`, ' +
  'a `quickFix` (replace the 1-based range with `newText`), the source `excerpt`, and the cause + ' +
  'fix text of its `docs` overlay (inlined once per code). `paths` takes files, directories and ' +
  'globs under the project root. The defaults are stricter than the CLI `eligian check`: ' +
  "`lint: true`, `review: true`, `selectorNotInLayout: 'ids'` (an id in the CSS but not in the " +
  'layout HTML is reported) and `maxWarnings: 0`.';

export const KEYWORDS: readonly string[] = ['check', 'diagnostic', 'eligian', 'lint'];

export const Parameters = Schema.Struct({
  paths: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  selectorNotInLayout: Schema.optionalKey(Schema.Literals(['off', 'ids', 'all'])),
  lint: Schema.optionalKey(Schema.Boolean),
  review: Schema.optionalKey(Schema.Boolean),
  maxWarnings: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});

const CheckedFile = Schema.Struct({
  file: Schema.String,
  errors: Schema.Int,
  warnings: Schema.Int,
});

export const Success = Schema.Struct({
  header: Schema.String,
  ok: Schema.Boolean,
  root: Schema.String,
  files: Schema.Array(CheckedFile),
  diagnostics: Schema.Array(McpDiagnosticSchema),
  summary: Schema.String,
});

/** The options with the tool's defaults applied (FR-023). */
const optionsOf = (params: typeof Parameters.Type) => ({
  selectorNotInLayout: params.selectorNotInLayout ?? 'ids',
  lint: params.lint ?? true,
  review: params.review ?? true,
  maxWarnings: params.maxWarnings ?? 0,
});

export const summarizeArgs = (
  params: typeof Parameters.Type
): Readonly<Record<string, unknown>> => ({ paths: params.paths.length, ...optionsOf(params) });

export type CheckSuccess = typeof Success.Type;

/**
 * Phase 3 (FR-007; plan C2): the telemetry `result` of a check, each distinct diagnostic code
 * with its count; a diagnostic without a code is counted under its source.
 */
export const summarizeResult = (
  success: Pick<CheckSuccess, 'diagnostics'>
): Readonly<Record<string, unknown>> => {
  const codes: Record<string, number> = {};
  for (const d of success.diagnostics) {
    const key = d.code === '' ? d.source : d.code;
    codes[key] = (codes[key] ?? 0) + 1;
  }
  return { codes };
};

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
  })
    .annotate(ai.Tool.Meta, { 'anthropic/alwaysLoad': true })
    .annotate(ai.Tool.Readonly, true);

const header = (context: ToolContext, resolvedPath: string): string =>
  `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${resolvedPath}`;

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export const handle = (
  params: typeof Parameters.Type,
  context: ToolContext
): Effect.Effect<typeof Success.Type, ToolError, CompilerLock> =>
  Effect.gen(function* () {
    const options = optionsOf(params);
    const root = yield* projectRoot(context.ai, context.cwd);
    const files = yield* resolveInputPatterns(root, params.paths);
    const knowledge = yield* loadKnowledge(context.docsRoot);
    const lock = yield* CompilerLock;
    const results = yield* lock.run(
      context.requestId,
      Effect.tryPromise({
        try: () =>
          checkPaths(files, {
            selectorNotInLayout: options.selectorNotInLayout,
            lint: options.lint,
            review: options.review,
          }),
        catch: toToolError('read'),
      })
    );
    const diagnostics = toMcpDiagnostics(results, knowledge.overlays, file =>
      fs.readFileSync(file, 'utf8')
    );
    const summary = summarize(results);
    return {
      header: header(context, files.length === 1 ? files[0] : root.root),
      ok: summary.errors === 0 && summary.warnings <= options.maxWarnings,
      root: root.root,
      files: results.map(result => ({
        file: result.file,
        errors: result.diagnostics.filter(d => d.severity === 'error').length,
        warnings: result.diagnostics.filter(d => d.severity === 'warning').length,
      })),
      diagnostics,
      summary:
        `${plural(summary.files, 'file')}: ${plural(summary.errors, 'error')}, ` +
        `${plural(summary.warnings, 'warning')} (max ${options.maxWarnings})`,
    };
  });
