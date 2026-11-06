/**
 * Spec 058 Phase 1 (SC-003; plan "Test client"): clients for the MCP server in tests.
 *
 * `startInMemoryServer` runs `makeServerLayer` in-process over a `Stdio.make` service: its
 * `stdin` is a `Stream` over a `Queue` this helper offers request lines to, its `stdout` a
 * recording `Sink` that resolves pending requests by id. Each call builds a new server, with
 * its own lock (unless `options.lock` is given) and its own call counter.
 *
 * `client()` is `effect/ai`'s `McpClient` over a hand-built in-memory `Transport` (protocol
 * 2025-11-25); `McpClient` has no in-memory transport of its own (spec Difference 18).
 *
 * `spawnServer` starts `bin/cli.js mcp` (or `bin/cli.js <options.args>`) as a child process and
 * speaks newline-delimited JSON-RPC to it, with the line-buffered parser of `package-bin.spec.ts`.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Cause, Effect, Exit, Fiber, Layer, Queue, Scope, Sink, Stdio, Stream } from 'effect';
import type { McpClient, McpSchema } from 'effect/ai';
import { expect } from 'vitest';
import { makeServerLayer, type ServerOptions } from '../mcp/server.js';

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

export interface ToolCallResult {
  /** `JSON.parse(content[0].text)` */
  readonly payload: any;
  readonly isError: boolean;
  /** The `tools/call` result as sent */
  readonly raw: unknown;
}

export interface InMemoryServer {
  /** Sends a request (ids count from 1 unless given) and waits for its response. */
  readonly request: (method: string, params?: unknown, id?: number) => Promise<JsonRpcResponse>;
  readonly notify: (method: string, params?: unknown) => Promise<void>;
  /** Every frame the server wrote, parsed; a line that is not JSON is kept as its string. */
  readonly frames: () => readonly unknown[];
  /** `tools/call`, after `initialize` (2025-11-25) unless the session is initialized already. */
  readonly callTool: (name: string, args: unknown) => Promise<ToolCallResult>;
  /** `effect/ai`'s McpClient over an in-memory Transport (connected, 2025-11-25). */
  readonly client: () => Promise<McpClient.McpClient>;
  readonly close: () => Promise<void>;
}

const CLIENT_INFO = { name: 'mcp-test-client', version: '0' };

/** Splits chunks into lines; calls `onLine` for every complete line. */
function lineBuffer(onLine: (line: string) => void): (chunk: string | Uint8Array) => void {
  const decoder = new TextDecoder();
  let buffered = '';
  return chunk => {
    buffered += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() !== '') onLine(line);
    }
  };
}

const parseFrame = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return line;
  }
};

const isResponse = (frame: unknown): frame is JsonRpcResponse =>
  typeof frame === 'object' &&
  frame !== null &&
  'id' in frame &&
  !('method' in frame) &&
  ('result' in frame || 'error' in frame);

/** Pending requests by id, resolved by the response frames. */
function correlator() {
  const pending = new Map<string | number, (response: JsonRpcResponse) => void>();
  return {
    wait: (id: string | number): Promise<JsonRpcResponse> =>
      new Promise(resolve => {
        pending.set(id, resolve);
      }),
    deliver: (frame: unknown): void => {
      if (!isResponse(frame)) return;
      const resolve = pending.get(frame.id);
      pending.delete(frame.id);
      resolve?.(frame);
    },
  };
}

/** The payload of a `tools/call` result; on success it must equal `structuredContent` (FR-005). */
function toolCallResult(name: string, response: JsonRpcResponse): ToolCallResult {
  if (response.error !== undefined) {
    throw new Error(
      `tools/call ${name}: JSON-RPC error ${response.error.code}: ${response.error.message}`
    );
  }
  const raw = response.result as {
    content: { type: string; text: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  };
  const payload = JSON.parse(raw.content[0].text);
  const isError = raw.isError === true;
  if (!isError) expect(payload).toEqual(raw.structuredContent);
  return { payload, isError, raw };
}

export async function startInMemoryServer(options: ServerOptions): Promise<InMemoryServer> {
  const ai = await import('effect/ai');
  const encoder = new TextEncoder();
  const stdin = await Effect.runPromise(Queue.unbounded<Uint8Array, Cause.Done>());
  const frames: unknown[] = [];
  const responses = correlator();
  const onStdout = lineBuffer(line => {
    const frame = parseFrame(line);
    frames.push(frame);
    responses.deliver(frame);
  });

  const stdio = Stdio.make({
    args: Effect.succeed([]),
    stdin: Stream.fromQueue(stdin),
    // biome-ignore lint/suspicious/useIterableCallbackReturn: Sink.forEach, not Array#forEach
    stdout: () => Sink.forEach((chunk: string | Uint8Array) => Effect.sync(() => onStdout(chunk))),
    stderr: () =>
      // biome-ignore lint/suspicious/useIterableCallbackReturn: Sink.forEach, not Array#forEach
      Sink.forEach((chunk: string | Uint8Array) =>
        Effect.sync(() => {
          process.stderr.write(chunk);
        })
      ),
  });
  const layer = await makeServerLayer(options);
  const fiber = Effect.runFork(
    Layer.launch(layer.pipe(Layer.provide(Layer.succeed(Stdio.Stdio, stdio))))
  );

  const send = (message: unknown): void => {
    Queue.offerUnsafe(stdin, encoder.encode(`${JSON.stringify(message)}\n`));
  };

  let nextId = 1;
  let initialized = false;
  const scopes: Scope.Closeable[] = [];

  const rawRequest = (
    method: string,
    params: unknown,
    id: string | number
  ): Promise<JsonRpcResponse> => {
    const answer = responses.wait(id);
    send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    return answer;
  };

  const request = async (
    method: string,
    params?: unknown,
    id: number = nextId++
  ): Promise<JsonRpcResponse> => {
    const response = await rawRequest(method, params, id);
    if (method === 'initialize' && response.result !== undefined) initialized = true;
    return response;
  };

  const notify = async (method: string, params?: unknown): Promise<void> => {
    send({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
  };

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    const response = await request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    if (response.error !== undefined) {
      throw new Error(`initialize failed: ${response.error.message}`);
    }
    await notify('notifications/initialized');
  };

  let clientIds = 0;
  const transport: McpClient.Transport = {
    '~effect/ai/McpClient/Transport': '~effect/ai/McpClient/Transport',
    protocol: ai.McpProtocol.v2025_11_25,
    // Own ids, so the client's never collide with raw requests; the answer gets the client's id back.
    request: message =>
      Effect.promise(() =>
        rawRequest(message.method, message.params, `client-${++clientIds}`)
      ).pipe(
        Effect.map(response => ({ ...response, id: message.id }) as McpSchema.JsonRpcResponse)
      ),
    notify: message => Effect.sync(() => send(message)),
    isCallable: () => true,
  };

  const client = async (): Promise<McpClient.McpClient> => {
    const scope = await Effect.runPromise(Scope.make());
    scopes.push(scope);
    const connected = await Effect.runPromise(
      ai.McpClient.make(CLIENT_INFO).pipe(
        Effect.provideService(ai.McpClient.Transport, transport),
        Scope.provide(scope)
      )
    );
    initialized = true;
    return connected;
  };

  const callTool = async (name: string, args: unknown): Promise<ToolCallResult> => {
    await ensureInitialized();
    return toolCallResult(name, await request('tools/call', { name, arguments: args }));
  };

  const close = async (): Promise<void> => {
    for (const scope of scopes.splice(0)) await Effect.runPromise(Scope.close(scope, Exit.void));
    Queue.endUnsafe(stdin);
    await Effect.runPromise(Fiber.interrupt(fiber));
  };

  return { request, notify, frames: () => frames, callTool, client, close };
}

export interface SpawnedServer {
  readonly child: ChildProcessWithoutNullStreams;
  /** Sends a request (ids count from 1 unless given) and waits for its response. */
  readonly request: (method: string, params?: unknown, id?: number) => Promise<JsonRpcResponse>;
  readonly notify: (method: string, params?: unknown) => void;
  /** Writes one raw frame (for example the answer to a server request such as `roots/list`). */
  readonly send: (message: unknown) => void;
  /** Calls `listener` for every frame from now on (requests and notifications included). */
  readonly onFrame: (listener: (frame: unknown) => void) => void;
  /** Every stdout line, as written */
  readonly stdoutLines: () => readonly string[];
  /** Every stdout line, parsed; a line that is not JSON is kept as its string. */
  readonly frames: () => readonly unknown[];
  readonly stderr: () => string;
  readonly exited: Promise<{ readonly code: number | null; readonly signal: string | null }>;
  /** Ends stdin and waits for the exit (kills the process after 5 s). */
  readonly close: () => Promise<{ readonly code: number | null; readonly signal: string | null }>;
}

/** The repo launcher `bin/cli.js`, or `ELIGIAN_BIN` (an installed package's). */
export const BIN =
  process.env.ELIGIAN_BIN ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'cli.js');

export function spawnServer(
  options: {
    env?: NodeJS.ProcessEnv;
    preload?: string;
    cwd?: string;
    /** The arguments after the launcher (default ['mcp']): server.json's packageArguments (FR-012) */
    args?: readonly string[];
  } = {}
): SpawnedServer {
  const args = [
    ...(options.preload === undefined ? [] : ['--import', pathToFileURL(options.preload).href]),
    BIN,
    ...(options.args ?? ['mcp']),
  ];
  const child = spawn(process.execPath, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
  });
  const lines: string[] = [];
  const frames: unknown[] = [];
  const listeners: ((frame: unknown) => void)[] = [];
  const responses = correlator();
  let stderr = '';

  child.stdout.setEncoding('utf-8');
  child.stdout.on(
    'data',
    lineBuffer(line => {
      lines.push(line);
      const frame = parseFrame(line);
      frames.push(frame);
      responses.deliver(frame);
      for (const listener of listeners) listener(frame);
    })
  );
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<{ code: number | null; signal: string | null }>(resolve => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });

  const send = (message: unknown): void => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  let nextId = 1;

  return {
    child,
    request: (method, params, id = nextId++) => {
      const answer = responses.wait(id);
      send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
      return Promise.race([
        answer,
        exited.then(({ code }) => {
          throw new Error(`mcp exited (${code}) before answering ${method}; stderr:\n${stderr}`);
        }),
      ]);
    },
    notify: (method, params) => {
      send({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
    },
    send,
    onFrame: listener => {
      listeners.push(listener);
    },
    stdoutLines: () => lines,
    frames: () => frames,
    stderr: () => stderr,
    exited,
    close: async () => {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 5000);
      try {
        return await exited;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
