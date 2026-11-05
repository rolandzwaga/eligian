/**
 * Spec 058 Phase 1 (FR-020–FR-022, FR-037, SC-010; plan C5, C9): `eligian_operations`.
 * The handler is tested directly (D2) with the production lock; the wire-level cases
 * come with the server (Group 18).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findOperationsWithDependency,
  getAllOperations,
  getCompilerVersion,
  getOperationsByCategory,
} from '@eligian/language';
import { getOrCreateServices } from '@eligian/language/mcp';
import { Effect } from 'effect';
import { URI } from 'langium';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CompilerLockLive } from '../mcp/compiler-lock.js';
import type { ToolError } from '../mcp/errors.js';
import type { EffectAi } from '../mcp/paths.js';
import { handle, NAME, type Parameters, type ToolContext } from '../mcp/tools/operations.js';
import {
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const HOST_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'mcp',
  'host'
);
const FIXTURE = path.join(HOST_DIR, 'main.eligian');

/** A declared failure on the wire (FR-005, FR-006): its `error`, after the shape checks. */
const expectFailure = (result: ToolCallResult, kind: string) => {
  const raw = result.raw as { content: { type: string; text: string }[] };
  const text = raw.content[0].text;
  expect(result.isError).toBe(true);
  expect(text.startsWith('{"header":')).toBe(true);
  expect(JSON.parse(text).error.kind).toBe(kind);
  expect(raw).not.toHaveProperty('structuredContent');
  return result.payload.error as { kind: string; message: string; path?: string };
};

describe('eligian_operations', () => {
  let context: ToolContext;

  beforeAll(async () => {
    const ai: EffectAi = await import('effect/ai');
    context = {
      ai,
      cwd: HOST_DIR,
      docsRoot: HOST_DIR,
      versions: getCompilerVersion(),
      requestId: '1',
    };
  });

  const run = (params: typeof Parameters.Type) =>
    Effect.runPromise(handle(params, context).pipe(Effect.provide(CompilerLockLive)));

  const fail = (params: typeof Parameters.Type): Promise<ToolError> =>
    Effect.runPromise(handle(params, context).pipe(Effect.flip, Effect.provide(CompilerLockLive)));

  it('names: two cards and one unknown', async () => {
    const result = await run({ names: ['addClass', 'selectElement', 'adClass'] });
    expect(result.cards.map(card => card.name)).toEqual(['addClass', 'selectElement']);
    for (const card of result.cards) {
      expect(card.kind).toBe('operation');
      const lines = card.text.split('\n');
      expect(lines[0]).toMatch(/^NEEDS: /);
      expect(lines[1]).toMatch(/^PROVIDES: /);
      expect(lines[2]).toMatch(/^ERASES: /);
    }
    expect(result.unknown).toHaveLength(1);
    expect(result.unknown[0].name).toBe('adClass');
    expect(result.unknown[0].suggestions).toContain('addClass');
    expect(result.header).toBe(
      `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · eligian_operations · -`
    );
  });

  it('kind controller: 9 with statuses', async () => {
    const result = await run({ kind: 'controller' });
    expect(result.entries).toHaveLength(9);
    const description = (name: string) =>
      result.entries?.find(entry => entry.name === name)?.description ?? '';
    expect(description('RoutingController')).toMatch(/^STATUS: do-not-use/);
    expect(description('LottieController')).toMatch(/^STATUS: constrained/);
    expect(description('LabelController')).not.toMatch(/^STATUS:/);
    expect(result.cards).toEqual([]);
  });

  it('kind event: 46', async () => {
    const result = await run({ kind: 'event' });
    expect(result.entries).toHaveLength(46);
    expect(result.entries?.map(entry => entry.name)).toContain('before-request-timeline-uri');
    for (const entry of result.entries ?? []) expect(entry.name).not.toContain('\n');
  });

  it('kind dom-event and key: non-empty', async () => {
    const domEvents = await run({ kind: 'dom-event' });
    expect(domEvents.entries?.map(entry => entry.name)).toContain('click');
    const keys = await run({ kind: 'key' });
    expect(keys.entries?.map(entry => entry.name)).toContain('ArrowRight');
  });

  it('needs selectedElement equals findOperationsWithDependency', async () => {
    const result = await run({ needs: 'selectedElement' });
    const returned = [...result.cards.map(card => card.name), ...(result.notReturned ?? [])];
    expect(returned).toEqual(
      findOperationsWithDependency('selectedElement').map(signature => signature.systemName)
    );
  });

  it('no argument: categories', async () => {
    const result = await run({});
    const expected = Object.fromEntries(
      Object.entries(getOperationsByCategory()).map(([category, signatures]) => [
        category,
        signatures.map(signature => signature.systemName),
      ])
    );
    expect(result.categories).toEqual(expected);
    expect(result.cards).toEqual([]);
    expect(result.see).toContain('operations-index');
  });

  it('30 names: 25 cards, 5 in notReturned', async () => {
    const names = getAllOperations()
      .slice(0, 30)
      .map(signature => signature.systemName);
    const result = await run({ names });
    expect(result.cards.map(card => card.name)).toEqual(names.slice(0, 25));
    expect(result.notReturned).toEqual(names.slice(25));
  });

  it('path: the host operation card', async () => {
    const result = await run({ names: ['score'], path: 'main.eligian' });
    expect(result.unknown).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].name).toBe('score');
    expect(result.cards[0].kind).toBe('host-operation');
    const lines = result.cards[0].text.split('\n');
    expect(lines[0]).toBe('NEEDS: none declared (host operations declare no needs)');
    expect(lines[1]).toBe('PROVIDES: none declared');
    expect(result.cards[0].text).toContain('CALL: score(answer)');
    expect(result.header.endsWith(` · ${FIXTURE}`)).toBe(true);
  });

  it('path: a host function card (FR-022)', async () => {
    const result = await run({ names: ['formatScore'], path: 'main.eligian' });
    expect(result.unknown).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].kind).toBe('host-function');
    expect(result.cards[0].text).toContain('extensions "./host.ts"');
    expect(result.cards[0].text).toContain('not an operation');
    // Without the program it is unknown
    const without = await run({ names: ['formatScore'] });
    expect(without.cards).toEqual([]);
    expect(without.unknown.map(u => u.name)).toEqual(['formatScore']);
  });

  it('path leaves the workspace as it was', async () => {
    const documents = getOrCreateServices().shared.workspace.LangiumDocuments;
    const before = documents.all.count();
    await run({ names: ['score', 'addClass'], path: FIXTURE });
    expect(documents.all.count()).toBe(before);
    expect(documents.hasDocument(URI.file(FIXTURE))).toBe(false);
  });

  it('missing path is ToolNotFound naming it', async () => {
    const error = await fail({ names: ['addClass'], path: 'missing.eligian' });
    expect(error._tag).toBe('ToolNotFound');
    expect(error.path).toBe(path.join(HOST_DIR, 'missing.eligian'));
  });
});

describe('eligian_operations on the wire', () => {
  const servers: InMemoryServer[] = [];

  const start = async (): Promise<InMemoryServer> => {
    const server = await startInMemoryServer({ cwd: HOST_DIR, docsRoot: HOST_DIR });
    servers.push(server);
    return server;
  };

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
  });

  it('missing path is kind not-found, path absolute', async () => {
    const server = await start();

    const error = expectFailure(
      await server.callTool(NAME, { names: ['addClass'], path: 'missing.eligian' }),
      'not-found'
    );

    expect(error.path).toBeDefined();
    expect(path.isAbsolute(error.path!)).toBe(true);
    expect(error.path).toBe(path.join(HOST_DIR, 'missing.eligian'));
  });

  it('a path outside the root is kind not-found', async () => {
    const server = await start();
    // an existing program, so the refusal is the root's
    const outside = path.join(path.dirname(HOST_DIR), 'fmt', 'formatted.eligian');

    const error = expectFailure(
      await server.callTool(NAME, { names: ['addClass'], path: outside }),
      'not-found'
    );

    expect(error.message).toContain('outside the project root');
  });
});
