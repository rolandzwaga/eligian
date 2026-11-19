/**
 * Spec 059 spike server (not shipped): what a client announces and how it answers an elicitation.
 * A stdio MCP server; it appends one JSON line per event to $SPIKE_LOG. Run it with tsx:
 *   node packages/cli/node_modules/tsx/dist/cli.mjs specs/059-presentation-assistant/spikes/brief-spike-server.ts
 * Results: ../spikes.md
 *
 * - spike_info: cwd, the seconds since the server process started, the client's capabilities and
 *   the roots it announces.
 * - spike_confirm: one `McpServer.elicit` with a single checkbox; reports accepted / declined /
 *   failed / timed out.
 */
import fs from 'node:fs';
import { Cause, Effect, Exit, Layer, Option, Schema } from 'effect';
import { layerNodeStdio, redirectConsoleToStderr } from '../../../packages/cli/src/mcp/stdio.js';

const STARTED = Date.now();
const LOG = process.env.SPIKE_LOG ?? 'spike-brief.log';
const log = (entry: Record<string, unknown>): void => {
  fs.appendFileSync(LOG, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`);
};

async function main(): Promise<void> {
  const out = redirectConsoleToStderr();
  const ai = await import('effect/ai');
  log({ event: 'process-start', cwd: process.cwd(), argv: process.argv.slice(2) });

  const Result = Schema.Struct({ report: Schema.String });
  const Failure = Schema.Struct({ message: Schema.String });

  const info = ai.Tool.make('spike_info', {
    description: 'Spike: report the server cwd, the client capabilities and the announced roots.',
    parameters: ai.Tool.EmptyParams,
    success: Result,
    failure: Failure,
  });
  const confirm = ai.Tool.make('spike_confirm', {
    description: 'Spike: ask the user to confirm through an MCP elicitation and report the outcome.',
    parameters: ai.Tool.EmptyParams,
    success: Result,
    failure: Failure,
  });

  const toolkit = ai.Toolkit.make(info, confirm);
  const handlers = toolkit.toLayer({
    spike_info: () =>
      Effect.gen(function* () {
        const client = yield* Effect.serviceOption(ai.McpSchema.McpServerClient);
        let capabilities: unknown = 'no McpServerClient';
        let roots: unknown = 'not asked';
        if (Option.isSome(client)) {
          capabilities = client.value.clientCapabilities;
          roots = yield* Effect.scoped(
            Effect.flatMap(client.value.getClient, reverse => reverse.listRoots({}))
          ).pipe(
            Effect.timeoutOption('5 seconds'),
            Effect.map(result => Option.getOrElse(result, () => 'timeout')),
            Effect.catch(error => Effect.succeed(`error: ${String(error)}`))
          );
        }
        const entry = {
          event: 'spike_info',
          secondsSinceStart: (Date.now() - STARTED) / 1000,
          cwd: process.cwd(),
          capabilities,
          roots,
        };
        log(entry);
        return { report: JSON.stringify(entry) };
      }),
    spike_confirm: () =>
      Effect.gen(function* () {
        const client = yield* Effect.serviceOption(ai.McpSchema.McpServerClient);
        if (Option.isNone(client)) return { report: 'no McpServerClient' };
        const started = Date.now();
        const exit = yield* ai.McpServer.elicit({
          message: 'Spike: is this brief complete and correct? (12 answers, 2 delegated)',
          schema: Schema.Struct({ confirmed: Schema.Boolean }),
        }).pipe(
          Effect.provideService(ai.McpSchema.McpServerClient, client.value),
          Effect.timeoutOption('60 seconds'),
          Effect.exit
        );
        const outcome = Exit.isSuccess(exit)
          ? Option.match(exit.value, {
              onNone: () => 'timed out after 60 s',
              onSome: value => `accepted: ${JSON.stringify(value)}`,
            })
          : `failed: ${Cause.pretty(exit.cause).slice(0, 600)}`;
        const entry = {
          event: 'spike_confirm',
          outcome,
          seconds: (Date.now() - started) / 1000,
          elicitationCapability: client.value.clientCapabilities.elicitation ?? null,
        };
        log(entry);
        return { report: JSON.stringify(entry) };
      }),
  });

  const layer = ai.McpServer.toolkit(toolkit).pipe(
    Layer.provide(handlers),
    Layer.provide(
      ai.McpServer.layerStdio({
        name: 'spike',
        version: '0.0.0',
        instructions: 'Spike server.',
        protocols: [ai.McpProtocol.v2025_11_25, ai.McpProtocol.v2025_06_18],
      })
    ),
    Layer.provide(layerNodeStdio(out))
  );
  const exit = await Effect.runPromiseExit(Layer.launch(layer as never));
  log({
    event: 'process-end',
    failure: Exit.isFailure(exit) ? Cause.pretty(exit.cause).slice(0, 1500) : null,
  });
}

main().catch(error => {
  log({ event: 'crash', error: String(error) });
  process.exitCode = 1;
});
