/**
 * Spec 058 Phase 1 (FR-007, FR-058; plan C4): the project root and the path policy.
 *
 * The project root is the first root the client announces (`roots/list`), else the server cwd.
 * Tool inputs (paths and globs) resolve against it and must lie under it; anything outside is
 * `ToolNotFound` naming the root, and nothing outside is read. The files a program imports are
 * never inspected here: the compiler resolves them under the language's own rules (FR-058).
 *
 * `McpServerClient` is `@stability unstable`; the roots need it (roadmap §2, decision 1: `effect`
 * is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Option } from 'effect';
import { expandPatterns } from '../check/check-command.js';
import { ToolNotFound } from './errors.js';

/** The `effect/ai` module; files under `src/mcp/` take it as a parameter (lazy import, FR-003). */
export type EffectAi = typeof import('effect/ai');

export interface ProjectRoot {
  readonly root: string;
  readonly from: 'roots' | 'cwd';
}

type ServerClient = EffectAi['McpSchema']['McpServerClient']['Service'];

/** How long `projectRoot` waits for the client's `roots/list` answer. */
const ROOTS_TIMEOUT = '2 seconds';

/** Asking for the roots failed: the caller falls back to cwd. */
interface NoAnnouncedRoot {
  readonly _tag: 'NoAnnouncedRoot';
}
const noAnnouncedRoot: NoAnnouncedRoot = { _tag: 'NoAnnouncedRoot' };

/** `expandPatterns` rejected: a bug, answered as kind internal by `catchDefects`. */
interface ExpandFailed {
  readonly _tag: 'ExpandFailed';
  readonly cause: unknown;
}

/**
 * The first announced root as a path. `listRoots({})`, never `listRoots()`: without a request
 * the frame carries `"params": null`, which real clients drop (spike S1, `baseline/spike.md`).
 */
const announcedRoot = (client: ServerClient): Effect.Effect<string, NoAnnouncedRoot> =>
  Effect.scoped(Effect.flatMap(client.getClient, reverse => reverse.listRoots({}))).pipe(
    Effect.timeoutOption(ROOTS_TIMEOUT),
    Effect.mapError(() => noAnnouncedRoot),
    Effect.flatMap(result => {
      const uri = Option.getOrUndefined(result)?.roots[0]?.uri;
      if (uri === undefined) return Effect.fail(noAnnouncedRoot);
      return Effect.try({
        try: () => path.resolve(fileURLToPath(uri)),
        catch: () => noAnnouncedRoot,
      });
    })
  );

/** The first announced root when the client advertises roots, else cwd. Never fails. */
export const projectRoot = (ai: EffectAi, cwd: string): Effect.Effect<ProjectRoot> => {
  const fallback: ProjectRoot = { root: cwd, from: 'cwd' };
  return Effect.serviceOption(ai.McpSchema.McpServerClient).pipe(
    Effect.flatMap(client =>
      Option.isSome(client) && client.value.clientCapabilities.roots !== undefined
        ? announcedRoot(client.value).pipe(
            Effect.map((root): ProjectRoot => ({ root, from: 'roots' })),
            Effect.orElseSucceed(() => fallback)
          )
        : Effect.succeed(fallback)
    )
  );
};

/** Case-insensitive on Windows, where the file system is. */
const comparable = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

/** Whether `file` is `root` or lies below it. */
export const isInside = (root: string, file: string): boolean => {
  const relative = path.relative(comparable(path.resolve(root)), comparable(path.resolve(file)));
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
};

const outsideRoot = (root: ProjectRoot, file: string): ToolNotFound =>
  new ToolNotFound({ message: `${file} is outside the project root ${root.root}`, path: file });

/** Absolute path for a tool input (backslashes, either drive-letter case); ToolNotFound outside the root. */
export const resolveInputPath = (
  root: ProjectRoot,
  input: string
): Effect.Effect<string, ToolNotFound> => {
  const file = path.resolve(root.root, input);
  return isInside(root.root, file) ? Effect.succeed(file) : Effect.fail(outsideRoot(root, file));
};

/**
 * Paths/globs through expandPatterns, all under the root; ToolNotFound when nothing matches.
 * An input that resolves outside the root fails before any glob runs; `!` exclusions read nothing
 * and are passed through.
 */
export const resolveInputPatterns = (
  root: ProjectRoot,
  inputs: readonly string[]
): Effect.Effect<readonly string[], ToolNotFound> => {
  const outside = inputs
    .filter(input => !input.startsWith('!'))
    .map(input => path.resolve(root.root, input))
    .find(file => !isInside(root.root, file));
  if (outside !== undefined) return Effect.fail(outsideRoot(root, outside));
  return Effect.tryPromise({
    try: () => expandPatterns(inputs, root.root),
    catch: (cause): ExpandFailed => ({ _tag: 'ExpandFailed', cause }),
  }).pipe(
    Effect.orDie,
    Effect.flatMap(files => {
      const inside = files.filter(file => isInside(root.root, file));
      return inside.length > 0
        ? Effect.succeed(inside)
        : Effect.fail(
            new ToolNotFound({
              message: `no .eligian files match ${inputs.join(', ')} under the project root ${root.root}`,
            })
          );
    })
  );
};
