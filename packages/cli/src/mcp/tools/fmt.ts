/**
 * Spec 058 Phase 1 (FR-024, SC-009; plan C9): `eligian_fmt`, the formatter as an MCP tool.
 *
 * Paths and globs resolve under the project root (`resolveInputPatterns`); `fmtFiles` checks
 * them or, with `write`, rewrites them, under the compiler lock (it uses the shared Langium
 * services). Files with syntax errors are reported and never written. A failed read or write is
 * `ToolIoError` naming the file (the fs error's `path`).
 *
 * `Tool` is `@stability unstable`; the server is built on it (roadmap §2, decision 1: `effect` is
 * pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import { Effect, Schema } from 'effect';
import { fmtFiles } from '../../fmt.js';
import { CompilerLock } from '../compiler-lock.js';
import { type ToolError, ToolFailure, toToolError } from '../errors.js';
import { type EffectAi, projectRoot, resolveInputPatterns } from '../paths.js';

/** What every tool handler receives from the server (plan C9). */
export interface ToolContext {
  readonly ai: EffectAi;
  readonly cwd: string;
  readonly docsRoot: URL | string;
  readonly versions: { readonly compiler: string; readonly eligius: string };
  readonly requestId: string;
}

export const NAME = 'eligian_fmt' as const;

export const DESCRIPTION =
  'Format Eligian (.eligian) files with the rules of the editor and `eligian fmt`. ' +
  'By default this only checks: each file reports `formatted` and, when it is not, a `lineDiff` ' +
  'of the lines that would change; nothing is written. With `write: true` the unformatted files ' +
  'are rewritten in place and `written` lists their absolute paths (files already formatted are ' +
  'left alone and not listed). A file with syntax errors gets `error` and is never written: fix it ' +
  'first (`eligian_check` names the problem). `paths` takes files, directories and globs under ' +
  'the project root; formatting changes whitespace only, so running it twice is a no-op.';

export const KEYWORDS: readonly string[] = ['format', 'fmt', 'eligian'];

export const Parameters = Schema.Struct({
  paths: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  write: Schema.optionalKey(Schema.Boolean),
});

const FmtFile = Schema.Struct({
  file: Schema.String,
  formatted: Schema.Boolean,
  lineDiff: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
});

export const Success = Schema.Struct({
  header: Schema.String,
  files: Schema.Array(FmtFile),
  written: Schema.Array(Schema.String),
});

export const summarizeArgs = (
  params: typeof Parameters.Type
): Readonly<Record<string, unknown>> => ({
  paths: params.paths.length,
  write: params.write ?? false,
});

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
  })
    .annotate(ai.Tool.Destructive, false)
    .annotate(ai.Tool.Idempotent, true);

const header = (context: ToolContext, resolvedPath: string): string =>
  `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${resolvedPath}`;

export const handle = (
  params: typeof Parameters.Type,
  context: ToolContext
): Effect.Effect<typeof Success.Type, ToolError, CompilerLock> =>
  Effect.gen(function* () {
    const root = yield* projectRoot(context.ai, context.cwd);
    const files = yield* resolveInputPatterns(root, params.paths);
    const lock = yield* CompilerLock;
    const results = yield* lock.run(
      context.requestId,
      Effect.tryPromise({
        try: () => fmtFiles(files, { write: params.write ?? false }),
        catch: toToolError('write'),
      })
    );
    return {
      header: header(context, files.length === 1 ? files[0] : root.root),
      files: results.map(result => ({
        file: result.file,
        formatted: result.formatted,
        ...(result.lineDiff === undefined ? {} : { lineDiff: result.lineDiff }),
        ...(result.error === undefined ? {} : { error: result.error }),
      })),
      written: results.filter(result => result.written === true).map(result => result.file),
    };
  });
