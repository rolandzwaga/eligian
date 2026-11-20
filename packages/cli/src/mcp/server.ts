/**
 * Spec 058 Phase 1 (FR-002, FR-003, FR-018; plan C10): the Eligian MCP server.
 *
 * `effect/ai` is loaded here only, with a dynamic `import('effect/ai')` at server start (FR-003);
 * the tool modules get its values through their `makeTool(ai)`. The nine tools (spec 059 Phase 1 adds `eligian_brief`)
 * are registered with `McpServer.toolkit` over `McpServer.layerStdio`. Every handler runs inside the per-server
 * telemetry wrapper, with defects caught at the tool boundary and tagged errors mapped to the
 * declared `{ header, error }` failure (C3). The compiler lock is provided once per server, and
 * the stderr logger is the outermost provide, so the whole graph logs to stderr (C10).
 *
 * `McpServer` and `Stdio` are `@stability unstable` (roadmap decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import { getCompilerVersion } from '@eligian/language';
import { Array as Arr, Cause, Effect, Exit, Layer, Result, type Stdio } from 'effect';
import type { McpProtocol } from 'effect/ai';
import type { BriefNote, GateContext } from './brief/gate.js';
import { makeRecordStore } from './brief/known-programs.js';
import { stateDirectory } from './brief/signature.js';
import { CompilerLock, CompilerLockLive } from './compiler-lock.js';
import { catchDefects, type ToolError, toToolFailure } from './errors.js';
import { INSTRUCTIONS, MCP_PHASE } from './instructions.js';
import { loadIndex } from './knowledge/load.js';
import type { EffectAi } from './paths.js';
import { newPresentationPrompt } from './prompts.js';
import { docsResources } from './resources.js';
import { layerNodeStdio, redirectConsoleToStderr, stderrLoggerLayer } from './stdio.js';
import { makeTelemetry } from './telemetry.js';
import * as brief from './tools/brief.js';
import * as check from './tools/check.js';
import * as compile from './tools/compile.js';
import * as docs from './tools/docs.js';
import * as fmt from './tools/fmt.js';
import * as init from './tools/init.js';
import * as operations from './tools/operations.js';
import * as project from './tools/project.js';
import * as smoke from './tools/smoke.js';

export interface ServerOptions {
  readonly cwd: string;
  /** The generated docs; default `docs/` beside the bundle (`dist/docs`) */
  readonly docsRoot?: URL | string;
  /** The compiler lock of this server; default `CompilerLockLive` */
  readonly lock?: Layer.Layer<CompilerLock>;
  /** The `eligian_smoke` test seams (`cliPath`, `onSpawn`); default none (Phase 2 FR-041) */
  readonly smoke?: smoke.SmokeToolOptions;
  /**
   * The `eligian_brief` and record-store seams (`beforeRename`, `stateDir`, `elicitationTimeoutMs`,
   * `beforeScan`, `recordBeforeRename`); default none (spec 059 FR-034, Phase 2 FR-059)
   */
  readonly brief?: brief.BriefToolOptions;
}

/** The protocol versions the server negotiates, in preference order (SC-029). */
export const SERVER_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'] as const;

/** The adapters for SERVER_PROTOCOL_VERSIONS, in that order: exactly what makeServerLayer passes as `protocols`. */
export function serverProtocols(
  ai: EffectAi
): Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter> {
  const adapters = {
    '2025-11-25': ai.McpProtocol.v2025_11_25,
    '2025-06-18': ai.McpProtocol.v2025_06_18,
  } as const;
  return Arr.map(SERVER_PROTOCOL_VERSIONS, version => adapters[version]);
}

/** The FR-005 header of a declared failure: the error's absolute path, else "-". */
const failureHeader =
  (versions: { readonly compiler: string; readonly eligius: string }, tool: string) =>
  (error: ToolError) =>
    toToolFailure(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · ${tool} · ${error.path ?? '-'}`
    )(error);

/** The server as a Layer over a Stdio service (in-process tests provide `Stdio.make`). */
export async function makeServerLayer(
  options: ServerOptions
): Promise<Layer.Layer<never, Cause.IllegalArgumentError, Stdio.Stdio>> {
  const ai = await import('effect/ai');
  const versions = getCompilerVersion();
  const telemetry = makeTelemetry(process.env.ELIGIAN_MCP_LOG);
  const context = {
    ai,
    cwd: options.cwd,
    docsRoot: options.docsRoot ?? new URL('./docs/', import.meta.url),
    versions,
  };
  // Spec 059 FR-033: the per-brief locks, once per server.
  const briefLocks = brief.makeBriefLocks();
  // Spec 059 Phase 2 FR-003, FR-005: the record store of this server and the key's state
  // directory, resolved once; each call adds its own telemetry note (FR-057).
  const briefOptions = options.brief ?? {};
  const record = makeRecordStore({
    ...(briefOptions.beforeScan === undefined ? {} : { beforeScan: briefOptions.beforeScan }),
    ...(briefOptions.recordBeforeRename === undefined
      ? {}
      : { recordBeforeRename: briefOptions.recordBeforeRename }),
  });
  const stateDir = briefOptions.stateDir ?? stateDirectory();
  const callContext = (requestId: string) => ({
    ...context,
    requestId,
    gate: {
      record,
      stateDir,
      noteBrief: (note: BriefNote) => telemetry.noteBrief(requestId, note),
    } satisfies GateContext,
  });

  // Phase 4 C4, P18: the index is read before any layer is built, so the registrations below do
  // no I/O and an early `initialize` already sees the resources. No docs: no resources (FR-023).
  const index = await Effect.runPromise(Effect.result(loadIndex(context.docsRoot)));
  if (Result.isFailure(index)) {
    process.stderr.write(
      `eligian mcp: no docs at ${index.failure.path ?? String(context.docsRoot)}; resources disabled\n`
    );
  }
  const entries = Result.isSuccess(index) ? index.success : [];

  /**
   * One tool call: telemetry around the handler, defects caught, errors declared (C3, C5); the
   * optional `summarizeResult` adds a success's `result` to the telemetry line (Phase 3 C2).
   */
  const boundary = <A, R>(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    run: (requestId: string) => Effect.Effect<A, ToolError, R>,
    summarizeResult?: (value: A) => Readonly<Record<string, unknown>>
  ) =>
    telemetry.withTelemetry(
      tool,
      args,
      requestId =>
        run(requestId).pipe(catchDefects, Effect.mapError(failureHeader(versions, tool))),
      summarizeResult
    );

  const toolkit = ai.Toolkit.make(
    brief.makeTool(ai),
    docs.makeTool(ai),
    operations.makeTool(ai),
    check.makeTool(ai),
    fmt.makeTool(ai),
    init.makeTool(ai),
    compile.makeTool(ai),
    project.makeTool(ai),
    smoke.makeTool(ai)
  );
  // effect 4.1: the services a handler reads are request-level (`McpRequest<"Requires", …>`, met only
  // by MCP middleware) unless the handlers close over them. The server's one lock is taken when the
  // handlers are built and provided to every call.
  const handlers = toolkit.toLayer(
    Effect.gen(function* () {
      const lock = yield* CompilerLock;
      const call = <A, R>(
        tool: string,
        args: Readonly<Record<string, unknown>>,
        run: (requestId: string) => Effect.Effect<A, ToolError, R>,
        summarizeResult?: (value: A) => Readonly<Record<string, unknown>>
      ) =>
        boundary(
          tool,
          args,
          requestId => Effect.provideService(run(requestId), CompilerLock, lock),
          summarizeResult
        );
      return {
        // Spec 059 Phase 2 FR-044: `call`, so adoption can take the compiler lock; every other
        // brief call touches neither the lock nor the Langium services (FR-032).
        eligian_brief: params =>
          call(
            brief.NAME,
            brief.summarizeArgs(params),
            requestId =>
              brief.handle(params, {
                ...callContext(requestId),
                briefLocks,
                ...(options.brief === undefined ? {} : { options: options.brief }),
              }),
            brief.summarizeResult
          ),
        eligian_docs: params =>
          call(docs.NAME, docs.summarizeArgs(params), requestId =>
            docs.handle(params, callContext(requestId))
          ),
        eligian_operations: params =>
          call(operations.NAME, operations.summarizeArgs(params), requestId =>
            operations.handle(params, callContext(requestId))
          ),
        eligian_check: params =>
          call(
            check.NAME,
            check.summarizeArgs(params),
            requestId => check.handle(params, callContext(requestId)),
            check.summarizeResult
          ),
        eligian_fmt: params =>
          call(fmt.NAME, fmt.summarizeArgs(params), requestId =>
            fmt.handle(params, callContext(requestId))
          ),
        eligian_init: params =>
          call(init.NAME, init.summarizeArgs(params), requestId =>
            init.handle(params, callContext(requestId))
          ),
        eligian_compile: params =>
          call(compile.NAME, compile.summarizeArgs(params), requestId =>
            compile.handle(params, callContext(requestId))
          ),
        eligian_project: params =>
          call(project.NAME, project.summarizeArgs(params), requestId =>
            project.handle(params, callContext(requestId))
          ),
        eligian_smoke: params =>
          call(smoke.NAME, smoke.summarizeArgs(params), requestId =>
            smoke.handle(params, {
              ...callContext(requestId),
              ...(options.smoke === undefined ? {} : { smoke: options.smoke }),
            })
          ),
      };
    })
  );

  const tools = ai.McpServer.toolkit(toolkit).pipe(
    Layer.provide(handlers),
    // the one lock instance of this server
    Layer.provide(options.lock ?? CompilerLockLive)
  );
  return Layer.mergeAll(
    tools,
    docsResources(ai, context.docsRoot, entries),
    newPresentationPrompt(ai),
    // FR-003: the start-time scan of the cwd, forked into the server's scope: `initialize` does
    // not wait for it, it never fails the layer, and closing the server aborts it.
    Layer.effectDiscard(record.start(options.cwd))
  ).pipe(
    Layer.provide(
      ai.McpServer.layerStdio({
        name: 'eligian',
        version: versions.compiler,
        instructions: INSTRUCTIONS[MCP_PHASE],
        protocols: serverProtocols(ai),
      })
    ),
    // C1: provided to the whole graph, never merged (correction C10)
    Layer.provide(stderrLoggerLayer)
  );
}

/**
 * `eligian mcp`: stdout is captured for the transport and everything else goes to stderr.
 * The launch ends when stdin ends, as an interrupts-only failure (spike T008 item 7): that is a
 * normal end. Any other failure is printed to stderr and sets exit code 1.
 */
export async function runServer(options: ServerOptions): Promise<void> {
  const out = redirectConsoleToStderr();
  const layer = await makeServerLayer(options);
  const exit = await Effect.runPromiseExit(
    Layer.launch(layer.pipe(Layer.provide(layerNodeStdio(out))))
  );
  if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
    process.stderr.write(`eligian mcp: ${Cause.pretty(exit.cause)}\n`);
    process.exitCode = 1;
  }
}
