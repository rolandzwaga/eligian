/**
 * Spec 058 Phase 4 (FR-021–FR-024; plan C1, C2, C4, P7, P8, P9, P18): the MCP docs resources.
 * `loadIndex` reads `index.json` only (no bodies, no overlays), so the server can list the
 * resources at start; the bodies are read on the first `resources/read`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import { ToolInternal } from '../mcp/errors.js';
import { loadIndex, loadKnowledge } from '../mcp/knowledge/load.js';
import type { IndexEntry } from '../mcp/knowledge/types.js';
import {
  type InMemoryServer,
  type JsonRpcResponse,
  startInMemoryServer,
} from './mcp-test-client.js';

const tempDirs: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-resources-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const ENTRY: IndexEntry = {
  id: 'lonely',
  title: 'Lonely',
  kind: 'reference',
  use_cases: ['testing'],
  words: 3,
  see: [],
  card: 'A lonely chunk.',
};

describe('loadIndex', () => {
  it('reads the index without bodies or overlays', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify([ENTRY]));

    await expect(Effect.runPromise(loadIndex(dir))).resolves.toEqual([ENTRY]);
    const knowledge = await Effect.runPromiseExit(loadKnowledge(dir));
    expect(Exit.isFailure(knowledge)).toBe(true);
  });

  it('fails with ToolInternal naming the directory', async () => {
    const dir = tempDir();

    const exit = await Effect.runPromiseExit(loadIndex(dir));
    expect(Exit.isFailure(exit)).toBe(true);
    const error = await Effect.runPromise(Effect.flip(loadIndex(dir)));
    expect(error).toBeInstanceOf(ToolInternal);
    expect(`${error.message} ${error.path ?? ''}`).toContain(path.resolve(dir));
  });

  it('matches loadKnowledge.index on the generated docs', async () => {
    const outDir = tempDir();
    await generateKnowledge({ outDir });

    const index = await Effect.runPromise(loadIndex(outDir));
    const knowledge = await Effect.runPromise(loadKnowledge(outDir));
    expect(index).toEqual(knowledge.index);
  }, 120_000);
});

const INITIALIZE = {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'mcp-resources-spec', version: '0' },
};

interface ResourceEntry {
  readonly uri: string;
  readonly name: string;
  readonly mimeType?: string;
  readonly description?: string;
}

/** `initialize` + `notifications/initialized`; the initialize result's capabilities. */
const initialize = async (server: InMemoryServer): Promise<Record<string, unknown>> => {
  const answer = await server.request('initialize', INITIALIZE);
  expect(answer.error).toBeUndefined();
  await server.notify('notifications/initialized');
  return (answer.result as { capabilities: Record<string, unknown> }).capabilities;
};

const listResources = async (server: InMemoryServer): Promise<readonly ResourceEntry[]> => {
  const answer = await server.request('resources/list', {});
  expect(answer.error).toBeUndefined();
  return (answer.result as { resources: ResourceEntry[] }).resources;
};

const readResource = (server: InMemoryServer, uri: string): Promise<JsonRpcResponse> =>
  server.request('resources/read', { uri });

const expectToolsAnswer = async (server: InMemoryServer): Promise<void> => {
  const tools = await server.request('tools/list', {});
  expect(tools.error).toBeUndefined();
  expect((tools.result as { tools: unknown[] }).tools).toHaveLength(8);
};

/** A docs root holding `index.json` with ENTRY only, plus `overlays.json` `{}` when asked. */
const lonelyRoot = (withOverlays: boolean): string => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify([ENTRY]));
  if (withOverlays) fs.writeFileSync(path.join(dir, 'overlays.json'), '{}');
  return dir;
};

/** A fresh server over `root`, closed after `run` whatever it does. */
const withServer = async (
  root: string,
  run: (server: InMemoryServer) => Promise<void>
): Promise<void> => {
  const server = await startInMemoryServer({ cwd: process.cwd(), docsRoot: root });
  try {
    await run(server);
  } finally {
    await server.close();
  }
};

describe('docs resources', () => {
  let docsRoot: string;
  let index: readonly IndexEntry[];

  beforeAll(async () => {
    docsRoot = tempDir();
    await generateKnowledge({ outDir: docsRoot });
    index = JSON.parse(fs.readFileSync(path.join(docsRoot, 'index.json'), 'utf8')) as IndexEntry[];
  }, 300_000);

  it('lists one resource per index entry, every kind', async () => {
    await withServer(docsRoot, async server => {
      await initialize(server);
      const resources = await listResources(server);
      expect(resources).toHaveLength(index.length);

      const kindOf = new Map(index.map(entry => [`eligian://docs/${entry.id}`, entry.kind]));
      const count = (kinds: readonly string[]) => {
        const counts = new Map<string, number>();
        for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
        return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
      };
      expect(count(resources.map(r => kindOf.get(r.uri) ?? 'unlisted'))).toEqual(
        count(index.map(entry => entry.kind))
      );

      const byUri = new Map(resources.map(r => [r.uri, r]));
      for (const entry of index) {
        // effect/ai adds `annotations: {}` to every listed resource
        expect(byUri.get(`eligian://docs/${entry.id}`)).toMatchObject({
          uri: `eligian://docs/${entry.id}`,
          name: entry.id,
          mimeType: 'text/markdown',
          description: entry.card,
        });
      }
      expect(byUri.has('eligian://docs/operation/addClass')).toBe(true);
    });
  });

  it('reads a chunk as # title + body', async () => {
    const knowledge = await Effect.runPromise(loadKnowledge(docsRoot));
    await withServer(docsRoot, async server => {
      await initialize(server);
      for (const id of ['map-dataflow', 'operation/addClass']) {
        const entry = index.find(e => e.id === id);
        expect(entry, `index has ${id}`).toBeDefined();
        const answer = await readResource(server, `eligian://docs/${id}`);
        expect(answer.error).toBeUndefined();
        const contents = (answer.result as { contents: { uri: string; text: string }[] }).contents;
        const text = contents[0].text;
        expect(text.startsWith(`# ${entry!.title}\n\n`)).toBe(true);
        const body = knowledge.body(id);
        expect(body).toBeDefined();
        expect(text).toContain(body!);
      }
    });
  });

  it('an unknown URI is a JSON-RPC error and the server keeps answering', async () => {
    // effect/ai 4.0.7 answers ResourceNotFound with the MCP resource-not-found code -32002, under
    // both protocols (`internal/mcpProtocol.js:11` LEGACY_RESOURCE_NOT_FOUND_ERROR_CODE and
    // `ProtocolError.fromFeature`, `:185-189`), not the -32602 of `McpServer.js:359-361` (P8).
    for (const protocolVersion of ['2025-11-25', '2025-06-18']) {
      await withServer(docsRoot, async server => {
        const init = await server.request('initialize', { ...INITIALIZE, protocolVersion });
        expect(init.error).toBeUndefined();
        await server.notify('notifications/initialized');
        const answer = await readResource(server, 'eligian://docs/nope');
        expect(answer.error?.code, protocolVersion).toBe(-32002);
        expect(answer.error?.message).toContain('eligian://docs/nope');
        await expectToolsAnswer(server);
      });
    }
  });

  it('the list is at most 50,000 chars', async () => {
    await withServer(docsRoot, async server => {
      await initialize(server);
      const answer = await server.request('resources/list', {});
      expect(answer.error).toBeUndefined();
      const length = JSON.stringify(answer.result).length;
      console.info(`resources/list result: ${length} chars`);
      expect(length).toBeLessThanOrEqual(50_000);
    });
  });

  it('without index.json the server starts with no resources', async () => {
    const empty = tempDir();
    const stderr = vi.spyOn(process.stderr, 'write');
    try {
      await withServer(empty, async server => {
        const capabilities = await initialize(server);
        expect(capabilities).not.toHaveProperty('resources');
        expect(capabilities).toHaveProperty('prompts');
        // RESOURCES_LIST_ANSWER
        expect(await listResources(server)).toEqual([]);
        const line = /^eligian mcp: no docs at .+; resources disabled\n$/;
        const writes = stderr.mock.calls.filter(
          ([chunk]) => typeof chunk === 'string' && line.test(chunk)
        );
        expect(writes).toHaveLength(1);
        expect(String(writes[0]?.[0])).toContain(path.resolve(empty));
        await expectToolsAnswer(server);
      });
    } finally {
      stderr.mockRestore();
    }
  });

  it('bodies are read lazily: a missing body fails only the read', async () => {
    await withServer(lonelyRoot(true), async server => {
      await initialize(server);
      expect((await listResources(server)).map(r => r.uri)).toContain('eligian://docs/lonely');
      const answer = await readResource(server, 'eligian://docs/lonely');
      expect(answer.error).toBeDefined();
      expect(answer.error?.message).toContain('lonely');
      await expectToolsAnswer(server);
    });
  });

  it('bodies are read lazily: no overlays.json still lists the id', async () => {
    await withServer(lonelyRoot(false), async server => {
      const capabilities = await initialize(server);
      expect(capabilities).toHaveProperty('resources');
      expect((await listResources(server)).map(r => r.uri)).toContain('eligian://docs/lonely');
      const answer = await readResource(server, 'eligian://docs/lonely');
      expect(answer.error).toBeDefined();
      await expectToolsAnswer(server);
    });
  });

  it('initialize advertises resources and prompts', async () => {
    await withServer(docsRoot, async server => {
      const capabilities = await initialize(server);
      expect(capabilities).toHaveProperty('resources');
      expect(capabilities).toHaveProperty('prompts');
      expect(capabilities).toHaveProperty('tools');
    });
  });

  it('an initialize sent at once reports the resources capability', async () => {
    for (let iteration = 0; iteration < 20; iteration++) {
      const server = await startInMemoryServer({ cwd: process.cwd(), docsRoot });
      try {
        const answer = await server.request('initialize', INITIALIZE);
        expect(answer.error, `iteration ${iteration}`).toBeUndefined();
        const result = answer.result as { capabilities: Record<string, unknown> };
        expect(result.capabilities, `iteration ${iteration}`).toHaveProperty('resources');
      } finally {
        await server.close();
      }
    }
  }, 60_000);
});
