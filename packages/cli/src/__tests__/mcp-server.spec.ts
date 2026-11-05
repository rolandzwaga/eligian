/**
 * Spec 058 Phase 1 (FR-002, FR-003, FR-005, FR-016–FR-018; SC-003, SC-004, SC-029; plan C10):
 * the composed MCP server, in-process through `mcp-test-client.ts`: the tool surface, the
 * description and instruction budgets, the protocol list and the FR-005 payload shape of one
 * valid call per tool.
 *
 * The docs are generated into a temp dir once (`docsRoot`); every test gets a fresh project
 * root (`cwd`) holding one formatted program, and a fresh server, closed in `afterEach`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompilerVersion } from '@eligian/language';
import { Effect } from 'effect';
import type { McpSchema } from 'effect/ai';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import { INSTRUCTIONS, MCP_PHASE } from '../mcp/instructions.js';
import type { IndexEntry } from '../mcp/knowledge/types.js';
import { serverProtocols } from '../mcp/server.js';
import * as check from '../mcp/tools/check.js';
import * as docs from '../mcp/tools/docs.js';
import * as fmt from '../mcp/tools/fmt.js';
import * as init from '../mcp/tools/init.js';
import * as operations from '../mcp/tools/operations.js';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = path.join(HERE, '__fixtures__', 'mcp', 'fmt', 'formatted.eligian');

const TOOL_NAMES: readonly string[] = [docs.NAME, operations.NAME, check.NAME, fmt.NAME, init.NAME];
const UPFRONT: readonly string[] = [docs.NAME, operations.NAME, check.NAME];
const DEFERRED = { [fmt.NAME]: fmt.KEYWORDS, [init.NAME]: init.KEYWORDS };

const versions = getCompilerVersion();
const headerOf = (tool: string, resolved: string): string =>
  `eligian ${versions.compiler} · eligius ${versions.eligius} · ${tool} · ${resolved}`;

const initializeParams = (protocolVersion: string) => ({
  protocolVersion,
  capabilities: {},
  clientInfo: { name: 'mcp-server.spec', version: '0' },
});

describe('the MCP server', () => {
  let docsRoot: string;
  let indexIds: ReadonlySet<string>;
  let cwd: string;
  const servers: InMemoryServer[] = [];

  const start = async (): Promise<InMemoryServer> => {
    const server = await startInMemoryServer({ cwd, docsRoot });
    servers.push(server);
    return server;
  };

  const listTools = async (): Promise<readonly McpSchema.Tool[]> => {
    const client = await (await start()).client();
    return Effect.runPromise(client.listTools());
  };

  beforeAll(async () => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-server-docs-'));
    await generateKnowledge({ outDir: docsRoot });
    const index = JSON.parse(
      fs.readFileSync(path.join(docsRoot, 'index.json'), 'utf8')
    ) as IndexEntry[];
    indexIds = new Set(index.map(entry => entry.id));
  }, 300_000);

  afterAll(() => {
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-server-')));
    fs.copyFileSync(PROGRAM, path.join(cwd, 'main.eligian'));
  });

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  describe('tool surface', () => {
    it('lists exactly five tools with their annotations', async () => {
      const tools = await listTools();

      expect(tools.map(tool => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
      const alwaysLoad = tools
        .filter(tool => tool._meta?.['anthropic/alwaysLoad'] === true)
        .map(tool => tool.name)
        .sort();
      expect(alwaysLoad).toEqual([...UPFRONT].sort());
      for (const tool of tools) {
        if (UPFRONT.includes(tool.name)) {
          expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
        } else {
          expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
          expect(tool.annotations?.idempotentHint, tool.name).toBe(true);
        }
      }
    });
  });

  describe('budgets', () => {
    it('instructions ≤ 4096', async () => {
      const server = await start();
      const answer = await server.request('initialize', initializeParams('2025-11-25'));

      const instructions = (answer.result as { instructions?: string }).instructions;
      expect(instructions).toBe(INSTRUCTIONS[MCP_PHASE]);
      expect(instructions?.length).toBeLessThanOrEqual(4096);
    });

    it('upfront descriptions ≤ 1000', async () => {
      const tools = await listTools();
      const upfront = tools.filter(tool => UPFRONT.includes(tool.name));

      expect(upfront).toHaveLength(3);
      for (const tool of upfront) {
        expect(tool.description?.length, tool.name).toBeLessThanOrEqual(1000);
      }
    });

    it('deferred ≤ 16384, KEYWORDS in the first 200 chars', async () => {
      const tools = await listTools();

      for (const [name, keywords] of Object.entries(DEFERRED)) {
        const description = tools.find(tool => tool.name === name)?.description ?? '';
        expect(description.length, name).toBeGreaterThan(0);
        expect(description.length, name).toBeLessThanOrEqual(16384);
        for (const keyword of keywords) {
          expect(description.slice(0, 200).toLowerCase(), `${name}: ${keyword}`).toContain(
            keyword.toLowerCase()
          );
        }
      }
    });

    // Planned red until the curriculum ships its chunks (Group 22; T053 confirms green).
    it('backticked tokens are tools or index ids', () => {
      const tokens = [...INSTRUCTIONS[MCP_PHASE].matchAll(/`([^`]+)`/g)]
        .map(match => match[1])
        .filter(token => /^[a-z0-9_/-]+$/.test(token));

      expect(tokens.length).toBeGreaterThan(0);
      const unknown = tokens.filter(token => !TOOL_NAMES.includes(token) && !indexIds.has(token));
      expect(unknown).toEqual([]);
    });

    it('says check defaults are stricter', async () => {
      const tools = await listTools();
      const description = tools.find(tool => tool.name === check.NAME)?.description ?? '';

      expect(description).toMatch(/defaults are stricter than the CLI/);
    });
  });

  describe('protocols', () => {
    it('serverProtocols lists 2025-11-25 then 2025-06-18', async () => {
      const ai = await import('effect/ai');
      const listed: string[] = serverProtocols(ai).map(protocol => protocol.protocolVersion);

      expect(listed).toEqual(['2025-11-25', '2025-06-18']);
      expect(listed).not.toContain('2026-07-28');
    });

    it('initialize echoes 2025-11-25 and 2025-06-18 exactly', async () => {
      for (const version of ['2025-11-25', '2025-06-18']) {
        const server = await start();
        const answer = await server.request('initialize', initializeParams(version));

        expect(answer.error).toBeUndefined();
        expect((answer.result as { protocolVersion: string }).protocolVersion).toBe(version);
      }
    });

    it('the McpClient connects', async () => {
      const client = await (await start()).client();

      expect(client.protocolVersion).toBe('2025-11-25');
      expect(client.serverInfo?.name).toBe('eligian');
      expect(client.serverInfo?.version).toBe(versions.compiler);
      expect(client.instructions).toBe(INSTRUCTIONS[MCP_PHASE]);
    });
  });

  describe('payload shape', () => {
    const expectShape = async (tool: string, args: unknown, resolved: () => string) => {
      const server = await start();
      const { payload, isError, raw } = await server.callTool(tool, args);
      const text = (raw as { content: { type: string; text: string }[] }).content[0].text;

      expect(isError).toBe(false);
      expect(text.startsWith('{"header":')).toBe(true);
      expect(JSON.parse(text)).toEqual((raw as { structuredContent: unknown }).structuredContent);
      expect(payload.header).toBe(headerOf(tool, resolved()));
    };

    it('eligian_docs', async () => {
      await expectShape(docs.NAME, {}, () => '-');
    });

    it('eligian_operations', async () => {
      await expectShape(operations.NAME, { names: ['addClass'] }, () => '-');
    });

    it('eligian_check', async () => {
      await expectShape(check.NAME, { paths: ['main.eligian'] }, () =>
        path.join(cwd, 'main.eligian')
      );
    });

    it('eligian_fmt', async () => {
      await expectShape(fmt.NAME, { paths: ['main.eligian'] }, () =>
        path.join(cwd, 'main.eligian')
      );
    });

    it('eligian_init', async () => {
      await expectShape(init.NAME, { directory: 'project', template: 'blank' }, () =>
        path.join(cwd, 'project')
      );
    });
  });
});
