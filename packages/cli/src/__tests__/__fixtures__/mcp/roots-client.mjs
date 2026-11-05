/**
 * Spec 058 Phase 1 (SC-021, mcp-paths.spec.ts): a raw newline-delimited JSON-RPC client for the
 * roots cases. `effect/ai`'s McpClient cannot be used: it sends `capabilities: {}` and declines
 * every server request but ping.
 *
 * Spawns `node <bin> mcp` in this process's cwd, advertises `capabilities.roots` in `initialize`,
 * and answers every `roots/list` the server sends according to `--roots`:
 *   ok      `{ roots: [{ uri: <file: URL of --root> }] }`
 *   error   a JSON-RPC error -32603
 *   silent  no answer (the server waits out its 2 s timeout)
 * then calls `eligian_check({ paths: [--path] })` and prints one JSON line on stdout:
 * `{ rootsRequests, ms, result }` (`ms`: the tools/call round trip, `result`: as sent).
 * Any failure goes to stderr with exit code 1.
 *
 * Usage: node roots-client.mjs --bin <cli.js> --roots ok|error|silent [--root <dir>] --path <p>
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    bin: { type: 'string' },
    roots: { type: 'string' },
    root: { type: 'string' },
    path: { type: 'string' },
  },
});
const mode = values.roots;
if (!values.bin || !values.path || !['ok', 'error', 'silent'].includes(mode ?? '')) {
  process.stderr.write('usage: roots-client.mjs --bin <cli.js> --roots ok|error|silent [--root <dir>] --path <p>\n');
  process.exit(2);
}
if (mode === 'ok' && !values.root) {
  process.stderr.write('roots-client: --roots ok needs --root\n');
  process.exit(2);
}

const child = spawn(process.execPath, [values.bin, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.setEncoding('utf-8');
child.stderr.on('data', chunk => {
  stderr += chunk;
});

const fail = message => {
  process.stderr.write(`roots-client: ${message}\nserver stderr:\n${stderr}\n`);
  child.kill();
  process.exit(1);
};
const timer = setTimeout(() => fail('no answer within 60 s'), 60_000);
child.on('exit', code => fail(`the server exited (${code}) before the check answered`));

const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
const pending = new Map();
const request = (id, method, params) =>
  new Promise(resolve => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });

let rootsRequests = 0;
const onFrame = frame => {
  if (frame.method === 'roots/list' && frame.id !== undefined) {
    rootsRequests += 1;
    if (mode === 'ok') {
      send({ jsonrpc: '2.0', id: frame.id, result: { roots: [{ uri: pathToFileURL(values.root).href }] } });
    } else if (mode === 'error') {
      send({ jsonrpc: '2.0', id: frame.id, error: { code: -32603, message: 'roots-client: no roots' } });
    }
    return;
  }
  if (frame.method === undefined && frame.id !== undefined) {
    const resolve = pending.get(frame.id);
    pending.delete(frame.id);
    resolve?.(frame);
  }
};

let buffered = '';
child.stdout.setEncoding('utf-8');
child.stdout.on('data', chunk => {
  buffered += chunk;
  const lines = buffered.split('\n');
  buffered = lines.pop() ?? '';
  for (const line of lines) {
    if (line.trim() === '') continue;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      fail(`a stdout line that is not JSON: ${line}`);
    }
    onFrame(frame);
  }
});

const initialized = await request(1, 'initialize', {
  protocolVersion: '2025-11-25',
  capabilities: { roots: { listChanged: false } },
  clientInfo: { name: 'roots-client', version: '0' },
});
if (initialized.error !== undefined) fail(`initialize: ${initialized.error.message}`);
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

const start = Date.now();
const called = await request(2, 'tools/call', {
  name: 'eligian_check',
  arguments: { paths: [values.path] },
});
const ms = Date.now() - start;
if (called.error !== undefined) fail(`tools/call: ${called.error.message}`);

clearTimeout(timer);
child.removeAllListeners('exit');
child.stdin.end();
process.stdout.write(`${JSON.stringify({ rootsRequests, ms, result: called.result })}\n`);
