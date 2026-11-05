/**
 * Spec 058 Phase 1 (FR-019, SC-011; plan C9 "docs"): the `eligian_docs` tool, through
 * `handle` over freshly generated docs (the generator's real output as `docsRoot`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCompilerVersion } from '@eligian/language';
import { Effect } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import { loadKnowledge } from '../mcp/knowledge/load.js';
import type { IndexEntry, Knowledge } from '../mcp/knowledge/types.js';
import type { EffectAi } from '../mcp/paths.js';
import { handle, NAME, type Parameters, type ToolContext } from '../mcp/tools/docs.js';
import {
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const BODY_WORD_CAP = 6000;

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

describe('eligian_docs', () => {
  let docsRoot: string;
  let ai: EffectAi;
  let knowledge: Knowledge;
  let index: readonly IndexEntry[];
  const versions = getCompilerVersion();

  const context = (): ToolContext => ({
    ai,
    cwd: process.cwd(),
    docsRoot,
    versions,
    requestId: '1',
  });
  const call = (params: typeof Parameters.Type) => Effect.runPromise(handle(params, context()));
  const entry = (id: string): IndexEntry => {
    const found = index.find(e => e.id === id);
    if (found === undefined) throw new Error(`no index entry '${id}'`);
    return found;
  };

  beforeAll(async () => {
    ai = await import('effect/ai');
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-docs-'));
    await generateKnowledge({ outDir: docsRoot });
    index = JSON.parse(fs.readFileSync(path.join(docsRoot, 'index.json'), 'utf8')) as IndexEntry[];
    knowledge = await Effect.runPromise(loadKnowledge(docsRoot));
  }, 300_000);

  afterAll(() => {
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  it('no arguments: the index', async () => {
    const payload = await call({});

    expect(payload.index?.map(e => e.id)).toEqual(index.map(e => e.id));
    for (const [i, item] of (payload.index ?? []).entries()) {
      const source = index[i];
      if (source.kind === 'operation') {
        expect(item).toEqual({ id: source.id, title: source.title });
      } else {
        expect(item).toEqual(source);
      }
    }
    expect(index.some(e => e.kind === 'operation')).toBe(true);
    expect(index.some(e => e.kind !== 'operation')).toBe(true);
    expect(payload.cards).toBeUndefined();
    expect(payload.bodies).toBeUndefined();
    expect(payload.hits).toBeUndefined();
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(12000);
  });

  it('ids: cards', async () => {
    const payload = await call({ ids: ['operation/addClass'] });
    const addClass = entry('operation/addClass');

    expect(payload.cards).toEqual([
      { id: addClass.id, title: addClass.title, card: addClass.card },
    ]);
    expect(payload.cards?.[0].card.startsWith('NEEDS: ')).toBe(true);
    expect(payload.bodies).toBeUndefined();
    expect(payload.index).toBeUndefined();
    expect(payload.unknown).toBeUndefined();
  });

  it('detail: bodies, overflow in notReturned', async () => {
    const largest = index
      .filter(e => e.kind !== 'operation')
      .sort((a, b) => b.words - a.words)
      .slice(0, 6);
    const ids = largest.map(e => e.id);
    expect(largest.reduce((sum, e) => sum + e.words, 0)).toBeGreaterThan(BODY_WORD_CAP);

    const payload = await call({ ids, detail: true });
    const bodies = payload.bodies ?? [];
    const notReturned = payload.notReturned ?? [];

    expect(bodies.length).toBeGreaterThan(0);
    expect(notReturned.length).toBeGreaterThan(0);
    expect(bodies.reduce((sum, b) => sum + entry(b.id).words, 0)).toBeLessThanOrEqual(
      BODY_WORD_CAP
    );
    expect([...bodies.map(b => b.id), ...notReturned].sort()).toEqual([...ids].sort());
    for (const body of bodies) {
      expect(body.title).toBe(entry(body.id).title);
      expect(body.body).toBe(knowledge.body(body.id));
    }
    expect(payload.cards).toBeUndefined();
  });

  it('diagnostics returned whole with detail', async () => {
    const payload = await call({ ids: ['diagnostics'], detail: true });

    expect(payload.bodies).toEqual([
      { id: 'diagnostics', title: entry('diagnostics').title, body: knowledge.body('diagnostics') },
    ]);
    expect(payload.notReturned ?? []).toEqual([]);
  });

  it('query: at most 8 hits, operations-index among them', async () => {
    const payload = await call({ query: 'selectElement' });
    const hits = payload.hits ?? [];

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(8);
    expect(hits.map(h => h.id)).toContain('operations-index');
    expect(hits.map(h => h.id)).toContain('operation/selectElement');
    for (const hit of hits) {
      expect(hit.card).toBe(entry(hit.id).card);
      expect(hit.title).toBe(entry(hit.id).title);
      expect(Object.keys(hit)).not.toContain('body');
    }
    expect(payload.bodies).toBeUndefined();
  });

  it('unknown ids get the 3 closest', async () => {
    const payload = await call({ ids: ['operation/addClas', 'diagnostic', 'diagnostics'] });

    expect(payload.cards?.map(c => c.id)).toEqual(['diagnostics']);
    expect(payload.unknown?.map(u => u.id)).toEqual(['operation/addClas', 'diagnostic']);
    for (const unknown of payload.unknown ?? []) {
      expect(unknown.closest).toHaveLength(3);
      for (const id of unknown.closest) expect(index.some(e => e.id === id)).toBe(true);
    }
    expect(payload.unknown?.[0].closest[0]).toBe('operation/addClass');
    expect(payload.unknown?.[1].closest[0]).toBe('diagnostics');
  });

  it('header first', async () => {
    for (const params of [{}, { ids: ['diagnostics'] }, { query: 'timeline' }]) {
      const payload = await call(params);
      expect(Object.keys(payload)[0]).toBe('header');
      expect(payload.header).toBe(
        `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · -`
      );
      expect(payload.header.endsWith(' · eligian_docs · -')).toBe(true);
    }
  });

  describe('eligian_docs on the wire', () => {
    const servers: InMemoryServer[] = [];
    const emptyDirs: string[] = [];

    const start = async (root: string): Promise<InMemoryServer> => {
      const server = await startInMemoryServer({ cwd: process.cwd(), docsRoot: root });
      servers.push(server);
      return server;
    };

    afterEach(async () => {
      for (const server of servers.splice(0)) await server.close();
      for (const dir of emptyDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('7 ids are refused by the schema (2025-06-18)', async () => {
      const server = await start(docsRoot);
      const initialized = await server.request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'mcp-docs.spec', version: '0' },
      });
      expect(initialized.error).toBeUndefined();
      expect((initialized.result as { protocolVersion: string }).protocolVersion).toBe(
        '2025-06-18'
      );
      await server.notify('notifications/initialized');
      const ids = index.slice(0, 7).map(e => e.id);
      expect(ids).toHaveLength(7);

      const response = await server.request('tools/call', { name: NAME, arguments: { ids } });

      expect(response.error?.code).toBe(-32602);
      expect(response).not.toHaveProperty('result');
    });

    it('7 ids are refused by the schema (2025-11-25)', async () => {
      const server = await start(docsRoot);
      const initialized = await server.request('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'mcp-docs.spec', version: '0' },
      });
      expect(initialized.error).toBeUndefined();
      await server.notify('notifications/initialized');
      const ids = index.slice(0, 7).map(e => e.id);
      expect(ids).toHaveLength(7);

      const response = await server.request('tools/call', { name: NAME, arguments: { ids } });

      expect(response).not.toHaveProperty('error');
      const result = response.result as {
        content: { type: string; text: string }[];
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      expect(result.content[0].text.startsWith(`Invalid parameters for tool '${NAME}'`)).toBe(true);
      expect(result).not.toHaveProperty('structuredContent');
      expect(result.content[0].text).not.toContain('"cards"');
      expect(result.content[0].text).not.toContain('"bodies"');
    });

    it('a missing docsRoot is kind internal naming it', async () => {
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-docs-empty-'));
      emptyDirs.push(empty);
      const server = await start(empty);

      const error = expectFailure(await server.callTool(NAME, {}), 'internal');

      expect(error.message).toContain(path.resolve(empty));
      expect(error.path).toBe(path.resolve(empty));
    });
  });
});
