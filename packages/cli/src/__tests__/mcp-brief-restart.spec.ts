/**
 * Spec 059 Phase 1 (SC-013, the restart half): a brief's rounds survive a real server restart.
 * A client may start the server again for every call (`spikes.md` §4.1), so nothing about a
 * brief may live in server memory. Two spawned `bin/cli.js mcp` processes work on one temp
 * project: process A records rounds 1 and 2 and exits, process B records round 3 and reports
 * `status`. The file must carry rounds 1, 2, 3, and B's `status` must equal an in-process
 * evaluation of that file. Needs the built CLI, like the spawned runs of `mcp-stdout.spec.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { BRIEF_FILE, parseBrief } from '../mcp/brief/brief-file.js';
import { type AnswerInput, EMPTY_BRIEF, evaluate, pickRound } from '../mcp/brief/engine.js';
import { TREE } from '../mcp/brief/tree.js';
import { makeFacts } from '../mcp/tools/brief.js';
import { loadPersona } from './brief-persona-driver.js';
import { type SpawnedServer, spawnServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const built = fs.existsSync(path.resolve(HERE, '..', '..', 'dist', 'cli.mjs'));

const INITIALIZE = {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'mcp-brief-restart-spec', version: '0' },
};

/** The terse persona: one value per id (the first of a sequence). */
const TERSE = loadPersona('terse');
const answerFor = (id: string): AnswerInput => {
  const entry = TERSE.answers[id];
  if (entry === undefined) throw new Error(`the terse persona has no answer for ${id}`);
  const one = 'values' in entry ? entry.values[0] : entry;
  return { id, value: one.value, ...(one.delegated === true ? { delegated: true } : {}) };
};

interface BriefReply {
  readonly file: string;
  readonly state: string;
  readonly round: readonly { readonly id: string }[];
  readonly counts: unknown;
  readonly rejected: readonly unknown[];
}

let root: string;
const servers: SpawnedServer[] = [];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-brief-restart-')));
});

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

/** A spawned server in the temp project, initialized. */
async function start(): Promise<SpawnedServer> {
  const server = spawnServer({ cwd: root });
  servers.push(server);
  const initialize = await server.request('initialize', INITIALIZE);
  expect(initialize.error, server.stderr()).toBeUndefined();
  server.notify('notifications/initialized');
  return server;
}

/** One successful `eligian_brief` call. */
async function brief(server: SpawnedServer, args: Record<string, unknown>): Promise<BriefReply> {
  const response = await server.request('tools/call', { name: 'eligian_brief', arguments: args });
  expect(response.error, server.stderr()).toBeUndefined();
  const result = response.result as {
    content: { text: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  };
  const payload = JSON.parse(result.content[0].text) as BriefReply;
  expect(result.isError, result.content[0].text).not.toBe(true);
  expect(payload).toEqual(result.structuredContent);
  return payload;
}

/** Answers every item of a round with the terse persona's values; none may be rejected. */
async function answerRound(
  server: SpawnedServer,
  ids: readonly string[],
  extra: Record<string, unknown> = {}
): Promise<BriefReply> {
  expect(ids.length).toBeGreaterThan(0);
  const reply = await brief(server, { action: 'answer', answers: ids.map(answerFor), ...extra });
  expect(reply.rejected).toEqual([]);
  return reply;
}

const idsOf = (round: readonly { readonly id: string }[]) => round.map(item => item.id);

test.skipIf(!built)(
  'rounds survive a server restart',
  async () => {
    const file = path.join(root, BRIEF_FILE);
    const firstRound = idsOf(pickRound(TREE, evaluate(TREE, EMPTY_BRIEF, makeFacts(root, root))));

    // Process A: rounds 1 and 2, then exit.
    const a = await start();
    const afterOne = await answerRound(a, firstRound, { idea: TERSE.idea });
    expect(afterOne.file).toBe(file);
    const afterTwo = await answerRound(a, idsOf(afterOne.round));
    const exitA = await a.close();
    servers.splice(servers.indexOf(a), 1);
    expect(exitA.signal, a.stderr()).toBeNull();

    // Process B: a fresh process on the same project records round 3, then reports status.
    const b = await start();
    expect(b.child.pid).not.toBe(a.child.pid);
    await answerRound(b, idsOf(afterTwo.round));
    const status = await brief(b, { action: 'status' });

    const parsed = parseBrief(fs.readFileSync(file, 'utf8'));
    expect(
      [...new Set(parsed.brief.answers.map(answer => answer.round))].sort((x, y) => x - y)
    ).toEqual([1, 2, 3]);
    expect(parsed.brief.idea).toBe(TERSE.idea);

    const evaluation = evaluate(TREE, parsed.brief, makeFacts(root, path.dirname(file)));
    expect({
      state: status.state,
      round: idsOf(status.round),
      counts: status.counts,
    }).toEqual({
      state: evaluation.state,
      round: idsOf(pickRound(TREE, evaluation)),
      // The reply always carries fromCode (Phase 2 FR-045); the engine only when above 0.
      counts: { ...evaluation.counts, fromCode: evaluation.counts.fromCode ?? 0 },
    });
  },
  120_000
);
