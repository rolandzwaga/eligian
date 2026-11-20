/**
 * Spec 058 Phase 4 (FR-025, FR-026, SC-012): the `new-presentation` prompt, its text and its
 * `prompts/list` / `prompts/get` answers over an in-memory server. Spec 059 Phase 3 (FR-007,
 * FR-008, SC-005): `new-presentation` starts with the brief interview (fourteen steps), and the
 * `add-to-presentation` prompt.
 *
 * The doc ids and tool names are checked against each prompt's `.docIds` / `.tools`, the one
 * source the text is built from, and the doc ids against a freshly generated `index.json`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import type { IndexEntry } from '../mcp/knowledge/types.js';
import { ADD_TO_PRESENTATION, NEW_PRESENTATION } from '../mcp/prompts.js';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

const TOOLS = [
  'eligian_brief',
  'eligian_docs',
  'eligian_init',
  'eligian_project',
  'eligian_operations',
  'eligian_check',
  'eligian_compile',
  'eligian_fmt',
  'eligian_smoke',
];

/** The lines that open a numbered step, with their number. */
const steps = (text: string): { n: number; line: string }[] =>
  text
    .split('\n')
    .map(line => ({ match: /^\s*(\d+)\./.exec(line), line }))
    .filter(({ match }) => match !== null)
    .map(({ match, line }) => ({ n: Number(match![1]), line }));

let docsRoot: string;
let indexIds: Set<string>;

beforeAll(async () => {
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-prompts-docs-'));
  await generateKnowledge({ outDir: docsRoot });
  const index = JSON.parse(
    fs.readFileSync(path.join(docsRoot, 'index.json'), 'utf8')
  ) as IndexEntry[];
  indexIds = new Set(index.map(entry => entry.id));
}, 300_000);

afterAll(() => {
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

describe('NEW_PRESENTATION', () => {
  it('names only existing doc ids and tools, from one source', () => {
    const text = NEW_PRESENTATION.text('x');
    expect([...NEW_PRESENTATION.docIds]).toEqual([
      'interview',
      'storyboard',
      'decisions',
      'project-layout',
      'runtime-state-pitfalls',
    ]);
    for (const id of NEW_PRESENTATION.docIds) {
      expect(indexIds.has(id), `index.json has ${id}`).toBe(true);
      expect(text).toContain(id);
    }
    expect([...NEW_PRESENTATION.tools]).toEqual(TOOLS);
    for (const tool of NEW_PRESENTATION.tools) {
      expect(text).toContain(tool);
    }
    const named = text.match(/eligian_[a-z_]+/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      expect(NEW_PRESENTATION.tools as readonly string[]).toContain(name);
    }
  });

  it('has fourteen numbered steps in order', () => {
    const text = NEW_PRESENTATION.text('x');
    const numbered = steps(text);
    expect(numbered.map(step => step.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const first = numbered[0].line;
    expect(first).toContain('eligian_brief');
    expect(first).toContain('action: status');
    expect(text).toContain('action: answer');
    expect(text).toContain('action: confirm');
    expect(text).toContain('confirmation');
    const approve = text.indexOf('approve-storyboard');
    expect(approve).toBeGreaterThan(-1);
    expect(text.indexOf('eligian_init')).toBeGreaterThan(approve);
    const fourth = numbered[3].line;
    expect(fourth).toContain('storyboard');
    expect(fourth).toContain('decisions');
    expect(fourth).toContain('project-layout');
    expect(fourth).toContain('approve-storyboard');
    expect(text).toContain('explain: true');
    expect(text).toContain('write: true');
    expect(text).toContain('determinism: true');
    expect(text).toContain('.eligian/dev-errors.json');
    expect(text).toContain('npx eligian dev main.eligian');
    const last = numbered[13].line;
    expect(last).toContain('STORYBOARD.md');
    expect(last).toContain('eligian_project');
    expect(last).toContain('runtime-state-pitfalls');
  });

  it('puts the idea first', () => {
    const text = NEW_PRESENTATION.text('a title card');
    expect(text.startsWith('Build an Eligius presentation with Eligian for this idea:\n')).toBe(
      true
    );
    expect(text.split('\n')[1]).toContain('a title card');
  });

  it('is at most 4,096 chars without the idea', () => {
    const length = NEW_PRESENTATION.text('').length;
    console.info(`new-presentation prompt text without the idea: ${length} chars`);
    expect(length).toBeLessThanOrEqual(4096);
  });
});

describe('ADD_TO_PRESENTATION', () => {
  it('names only existing doc ids and tools, from one source', () => {
    const text = ADD_TO_PRESENTATION.text('x');
    expect(ADD_TO_PRESENTATION.docIds.length).toBeGreaterThan(0);
    for (const id of ADD_TO_PRESENTATION.docIds) {
      expect(indexIds.has(id), `index.json has ${id}`).toBe(true);
      expect(text).toContain(`"${id}"`);
    }
    for (const tool of ADD_TO_PRESENTATION.tools) {
      expect(TOOLS).toContain(tool);
      expect(text).toContain(tool);
    }
    const named = text.match(/eligian_[a-z_]+/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      expect(ADD_TO_PRESENTATION.tools as readonly string[]).toContain(name);
    }
  });

  it('has four numbered steps in order', () => {
    const numbered = steps(ADD_TO_PRESENTATION.text('x'));
    expect(numbered.map(step => step.n)).toEqual([1, 2, 3, 4]);
    expect(numbered[0].line).toContain('eligian_project');
    expect(numbered[2].line).toContain('eligian_brief');
    expect(numbered[2].line).toContain('action: status');
    expect(numbered[3].line).toContain('eligian_check');
    expect(numbered[3].line).toContain('eligian_fmt');
    expect(numbered[3].line).toContain('eligian_smoke');
  });

  it('names scope, eligian_project and approve-storyboard', () => {
    const text = ADD_TO_PRESENTATION.text('x');
    expect(text).toContain('scope');
    expect(text).toContain('eligian_project');
    expect(text).toContain('approve-storyboard');
  });

  it('puts the addition first', () => {
    const text = ADD_TO_PRESENTATION.text('a closing view called Outro');
    expect(text.startsWith('Add to an existing Eligius presentation:\n')).toBe(true);
    expect(text.split('\n')[1]).toContain('a closing view called Outro');
  });

  it('is at most 4,096 chars without the addition', () => {
    const length = ADD_TO_PRESENTATION.text('').length;
    console.info(`add-to-presentation prompt text without the addition: ${length} chars`);
    expect(length).toBeLessThanOrEqual(4096);
  });
});

describe('prompts over MCP', () => {
  let server: InMemoryServer;

  beforeAll(async () => {
    server = await startInMemoryServer({ cwd: process.cwd(), docsRoot });
    const answer = await server.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'mcp-prompts-spec', version: '0' },
    });
    expect(answer.error).toBeUndefined();
    await server.notify('notifications/initialized');
  });

  afterAll(async () => {
    await server.close();
  });

  it('prompts/list has exactly the two prompts', async () => {
    const answer = await server.request('prompts/list', {});
    expect(answer.error).toBeUndefined();
    const { prompts } = answer.result as {
      prompts: { name: string; title?: string; arguments?: unknown[] }[];
    };
    expect(prompts.map(prompt => prompt.name).sort()).toEqual([
      'add-to-presentation',
      'new-presentation',
    ]);
    const byName = (name: string) => prompts.find(prompt => prompt.name === name)!;
    expect(byName('new-presentation')).toMatchObject({
      name: 'new-presentation',
      title: 'New Eligian presentation',
      arguments: [{ name: 'idea', required: true }],
    });
    expect(byName('new-presentation').arguments).toHaveLength(1);
    expect(byName('add-to-presentation')).toMatchObject({
      name: 'add-to-presentation',
      title: 'Add to an Eligian presentation',
      arguments: [{ name: 'addition', required: true }],
    });
    expect(byName('add-to-presentation').arguments).toHaveLength(1);
  });

  it('prompts/get returns one user message with the idea', async () => {
    const answer = await server.request('prompts/get', {
      name: 'new-presentation',
      arguments: { idea: 'a title card' },
    });
    expect(answer.error).toBeUndefined();
    const { messages } = answer.result as {
      messages: { role: string; content: { type: string; text: string } }[];
    };
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content.text).toContain('a title card');
    expect(messages[0].content.text).toBe(NEW_PRESENTATION.text('a title card'));
  });

  it('a missing or empty idea is invalid params', async () => {
    for (const args of [{}, { idea: '' }]) {
      const answer = await server.request('prompts/get', {
        name: 'new-presentation',
        arguments: args,
      });
      expect(answer.error?.code, JSON.stringify(args)).toBe(-32602);
    }
  });

  it('prompts/get add-to-presentation returns one user message with the addition', async () => {
    const answer = await server.request('prompts/get', {
      name: 'add-to-presentation',
      arguments: { addition: 'a closing view called Outro' },
    });
    expect(answer.error).toBeUndefined();
    const { messages } = answer.result as {
      messages: { role: string; content: { type: string; text: string } }[];
    };
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content.text).toContain('a closing view called Outro');
    expect(messages[0].content.text).toBe(ADD_TO_PRESENTATION.text('a closing view called Outro'));
  });

  it('a missing or empty addition is invalid params', async () => {
    for (const args of [{}, { addition: '' }]) {
      const answer = await server.request('prompts/get', {
        name: 'add-to-presentation',
        arguments: args,
      });
      expect(answer.error?.code, JSON.stringify(args)).toBe(-32602);
    }
  });
});
