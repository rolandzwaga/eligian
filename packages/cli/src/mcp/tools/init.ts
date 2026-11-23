/**
 * Spec 058 Phase 1 (FR-025, FR-026; plan C9, C11): `eligian_init` scaffolds a project from a
 * starter through `runInit` (the files from `starterFiles`). A refusal (starter files exist, no
 * `force`) and a failed write are `ToolIoError`.
 *
 * Phase 2 (FR-065, Q7, I-1; plan D8, P12): `runInit` also writes the agent files of each
 * `client` through `setupAgents` (merged into existing files, always the `node` form); the reply
 * lists each with its status (`agentFiles`), replacing Phase 1's write-if-absent `skipped`.
 *
 * `effect/ai`'s `Tool` is `@stability unstable` (roadmap §2, decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import path from 'node:path';
import { STARTER_ENTRY, type StarterName, starterFiles } from '@eligian/language';
import { Effect, Schema } from 'effect';
import type { AgentClient } from '../../agents.js';
import { toGlobPath } from '../../check/files.js';
import { runInit, titleFromDirectory } from '../../init.js';
import { type ApprovedSet, checkPrograms, type GateContext } from '../brief/gate.js';
import { type RecordEntry, scanProgram } from '../brief/known-programs.js';
import { type ToolError, ToolFailure, ToolIoError, toToolError } from '../errors.js';
import { type EffectAi, projectRoot, resolveInputPath } from '../paths.js';

export const NAME = 'eligian_init' as const;

export const KEYWORDS: readonly string[] = ['scaffold', 'new', 'project', 'starter', 'template'];

export const DESCRIPTION = `Scaffold a new Eligian presentation project from a starter template (blank, chapters, video, library) in a directory: main.eligian, layout, CSS, locales, package.json, plus the agent files of each client. client: claude, cursor, vscode, codex (default ["claude"]): claude gets .mcp.json and CLAUDE.md, cursor .cursor/mcp.json and .cursor/rules/eligian.mdc, vscode .vscode/mcp.json and .github/copilot-instructions.md, codex .codex/config.toml, and every client the AGENTS.md block; agents: false writes none. Existing agent files are merged: only the eligian server entry and the marked eligian block change. Each agent file is reported as written, updated, unchanged or refused (invalid JSON is left untouched). Existing starter files are refused unless force: true. The reply lists the files written and the next steps (npm install first).`;

const TEMPLATES = [
  'blank',
  'chapters',
  'video',
  'library',
] as const satisfies readonly StarterName[];

const CLIENTS = ['claude', 'cursor', 'vscode', 'codex'] as const satisfies readonly AgentClient[];

export const Parameters = Schema.Struct({
  directory: Schema.String,
  template: Schema.Literals(TEMPLATES),
  title: Schema.optionalKey(Schema.String),
  force: Schema.optionalKey(Schema.Boolean),
  agents: Schema.optionalKey(Schema.Boolean),
  client: Schema.optionalKey(Schema.Array(Schema.Literals(CLIENTS))),
});
export type InitParameters = typeof Parameters.Type;

const AgentFile = Schema.Struct({
  file: Schema.String,
  status: Schema.Literals(['written', 'updated', 'unchanged', 'refused']),
  message: Schema.optionalKey(Schema.String),
});

export const Success = Schema.Struct({
  header: Schema.String,
  directory: Schema.String,
  template: Schema.String,
  written: Schema.Array(Schema.String),
  agentFiles: Schema.Array(AgentFile),
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
  /** Spec 059 Phase 2 (FR-013, FR-014, FR-061): the brief gate's record, key and telemetry note. */
  readonly gate: GateContext;
}

export const summarizeArgs = (params: InitParameters): Readonly<Record<string, unknown>> => ({
  directory: params.directory,
  template: params.template,
  force: params.force ?? false,
  agents: params.agents ?? true,
  client: params.client ?? ['claude'],
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

/** §4's next steps (Phase 3 FR-051). */
const nextSteps = (target: string): string[] => [
  `Run npm install in ${target}: it installs eligian, and the server path in the agent config exists only afterwards (restart the MCP client to load it).`,
  'Read eligian_docs ids storyboard and decisions, then write STORYBOARD.md.',
  'Call eligian_project before writing selectors: the ids, classes, locale keys and asset files you may reference.',
  `Run eligian_check on ${STARTER_ENTRY} after every edit, until 0 errors and 0 warnings.`,
  'After the first timeline passes check, call eligian_compile(select, explain:true).',
  'Run eligian_fmt with write: true once check is clean.',
  `Look at it: npx eligian dev ${STARTER_ENTRY} (npm run check / npm run build for the CLI).`,
];

/** The names of `a`, then those of `b` not in `a`, each once. */
const unionOf = (a: readonly string[], b: readonly string[]): string[] => [
  ...new Set([...a, ...b]),
];

/**
 * FR-061: the record entry of the program `eligian_init` wrote under an approved brief: the
 * approved set (S2 names, L1 codes, H1 not `none`) plus the starter's own names, `via: brief`.
 */
const writtenEntry = (
  root: string,
  program: string,
  approved: ApprovedSet,
  text: string
): RecordEntry => {
  const scan = scanProgram(text);
  return {
    path: toGlobPath(path.relative(root, program)),
    timelines: unionOf(approved.timelines, scan.timelines),
    languages: unionOf(approved.languages, scan.languages),
    extensions: approved.extensions || scan.extensions,
    via: 'brief',
  };
};

export const handle = (
  params: InitParameters,
  context: ToolContext
): Effect.Effect<InitSuccess, ToolError> =>
  Effect.gen(function* () {
    const root = yield* projectRoot(context.ai, context.cwd);
    const target = yield* resolveInputPath(root, params.directory);
    // FR-013, FR-014: the program the starter would write is gated before any file is written;
    // it is about to be replaced, so no trigger check (P16).
    const program = path.join(target, STARTER_ENTRY);
    const [gate] = yield* checkPrograms(root, [program], context.gate, { init: true });
    const title = params.title?.trim() || titleFromDirectory(target);
    const files = starterFiles(params.template, { title });
    const starter = Object.keys(files);

    const outcome = yield* Effect.tryPromise({
      try: () =>
        runInit(target, {
          template: params.template,
          title: params.title,
          force: params.force ?? false,
          cwd: root.root,
          agents: params.agents === false ? [] : (params.client ?? ['claude']),
          docsRoot: context.docsRoot,
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

    // FR-061: under an approved brief the written program enters the record (P16: a forced
    // re-init of work no approved brief governs leaves its entry as it is).
    const approved = gate?.input.brief;
    if (approved?.state === 'approved') {
      const entry = writtenEntry(root.root, program, approved.approvedSet, files[STARTER_ENTRY]);
      yield* context.gate.record.update(root.root, [entry]);
    }

    return {
      header: header(context, target),
      directory: target,
      template: params.template,
      written: starter,
      agentFiles: [...(outcome.agentFiles ?? [])],
      nextSteps: nextSteps(target),
    };
  });
