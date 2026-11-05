/**
 * Spec 058 Phase 1 (FR-025, FR-026; plan C9, C11): `eligian_init` scaffolds a project from a
 * starter through `runInit` (the files from `starterFiles`), then writes the agent files
 * `.mcp.json`, `AGENTS.md` and `CLAUDE.md`, each only when absent. A refusal (starter files
 * exist, no `force`) and a failed write are `ToolIoError`.
 *
 * `effect/ai`'s `Tool` is `@stability unstable` (roadmap §2, decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { STARTER_ENTRY, type StarterName, starterFiles } from '@eligian/language';
import { Effect, Schema } from 'effect';
import { runInit, titleFromDirectory } from '../../init.js';
import { type ToolError, ToolFailure, ToolIoError, toToolError } from '../errors.js';
import { agentsMdBlock } from '../instructions.js';
import { type EffectAi, projectRoot, resolveInputPath } from '../paths.js';

export const NAME = 'eligian_init' as const;

export const KEYWORDS: readonly string[] = ['scaffold', 'new', 'project', 'starter', 'template'];

export const DESCRIPTION = `Scaffold a new Eligian presentation project from a starter template (blank, chapters, video, library) in a directory: main.eligian, layout, CSS, locales, package.json, plus .mcp.json, AGENTS.md and CLAUDE.md for agents. Existing starter files are refused unless force: true; an existing agent file is never touched and is reported as skipped with the content it would get. The reply lists the files written and the next steps (npm install first).`;

const TEMPLATES = [
  'blank',
  'chapters',
  'video',
  'library',
] as const satisfies readonly StarterName[];

export const Parameters = Schema.Struct({
  directory: Schema.String,
  template: Schema.Literals(TEMPLATES),
  title: Schema.optionalKey(Schema.String),
  force: Schema.optionalKey(Schema.Boolean),
  agents: Schema.optionalKey(Schema.Boolean),
});
export type InitParameters = typeof Parameters.Type;

const Skipped = Schema.Struct({
  file: Schema.String,
  reason: Schema.String,
  content: Schema.String,
});

export const Success = Schema.Struct({
  header: Schema.String,
  directory: Schema.String,
  template: Schema.String,
  written: Schema.Array(Schema.String),
  skipped: Schema.Array(Skipped),
  nextSteps: Schema.Array(Schema.String),
});
export type InitSuccess = typeof Success.Type;

/** What every tool handler gets from the server (plan C9). */
export interface ToolContext {
  readonly ai: EffectAi;
  readonly cwd: string;
  readonly docsRoot: URL | string;
  readonly versions: { readonly compiler: string; readonly eligius: string };
  readonly requestId: string;
}

export const summarizeArgs = (params: InitParameters): Readonly<Record<string, unknown>> => ({
  directory: params.directory,
  template: params.template,
  force: params.force ?? false,
  agents: params.agents ?? true,
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

/** The agent files by name, with the content each gets (FR-026). */
const agentFiles = (target: string): ReadonlyArray<readonly [string, string]> => [
  [
    '.mcp.json',
    `${JSON.stringify(
      {
        mcpServers: {
          eligian: {
            command: 'node',
            args: [path.join(target, 'node_modules', 'eligian', 'bin', 'cli.js'), 'mcp'],
          },
        },
      },
      null,
      2
    )}\n`,
  ],
  ['AGENTS.md', agentsMdBlock()],
  ['CLAUDE.md', '@AGENTS.md\n'],
];

const isAlreadyThere = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && Reflect.get(cause, 'code') === 'EEXIST';

/** Creates `file` only when it does not exist yet ('wx'): whether it was written. */
const writeIfAbsent = (file: string, content: string): Effect.Effect<boolean, ToolError> =>
  Effect.tryPromise({
    try: () =>
      fs.writeFile(file, content, { encoding: 'utf-8', flag: 'wx' }).then(
        () => true,
        (cause: unknown) => (isAlreadyThere(cause) ? false : Promise.reject(cause))
      ),
    catch: toToolError('write', file),
  });

const nextSteps = (target: string): string[] => [
  `Run npm install in ${target}: it installs eligian, and the server path in .mcp.json exists only afterwards (restart the MCP client to load it).`,
  'Read eligian_docs ids storyboard and decisions, then write STORYBOARD.md.',
  `Run eligian_check on ${STARTER_ENTRY} after every edit, until 0 errors and 0 warnings.`,
  'Run eligian_fmt with write: true once check is clean.',
  `Look at it: npx eligian dev ${STARTER_ENTRY} (npm run check / npm run build for the CLI).`,
];

export const handle = (
  params: InitParameters,
  context: ToolContext
): Effect.Effect<InitSuccess, ToolError> =>
  Effect.gen(function* () {
    const root = yield* projectRoot(context.ai, context.cwd);
    const target = yield* resolveInputPath(root, params.directory);
    const title = params.title?.trim() || titleFromDirectory(target);
    const starter = Object.keys(starterFiles(params.template, { title }));

    const outcome = yield* Effect.tryPromise({
      try: () =>
        runInit(target, {
          template: params.template,
          title: params.title,
          force: params.force ?? false,
          cwd: root.root,
        }),
      catch: toToolError('write', target),
    });
    if (outcome.exitCode !== 0) {
      const refusal = outcome.output.split('\n')[0];
      return yield* new ToolIoError({
        message: `${refusal}\nPass force: true to overwrite them.`,
        path: target,
      });
    }

    const written = [...starter];
    const skipped: Array<typeof Skipped.Type> = [];
    if (params.agents ?? true) {
      for (const [file, content] of agentFiles(target)) {
        if (yield* writeIfAbsent(path.join(target, file), content)) {
          written.push(file);
        } else {
          skipped.push({
            file,
            reason: 'already exists; left untouched (add the content below by hand)',
            content,
          });
        }
      }
    }

    return {
      header: header(context, target),
      directory: target,
      template: params.template,
      written,
      skipped,
      nextSteps: nextSteps(target),
    };
  });
