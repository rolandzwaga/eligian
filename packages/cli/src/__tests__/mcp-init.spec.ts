/**
 * Spec 058 Phase 1 (FR-025, FR-026, SC-012; plan C9, C11): `eligian_init` writes a starter
 * plus the agent files (`.mcp.json`, `AGENTS.md`, `CLAUDE.md`), refuses to overwrite starter
 * files without `force`, never touches an existing agent file, and every template it writes
 * checks clean with the 1.1.0 defaults (the check runs test-side; the tool carries none).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCompilerVersion, STARTER_ENTRY, starterFiles } from '@eligian/language';
import { Effect } from 'effect';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../check/check-command.js';
import { agentsMdBlock } from '../mcp/instructions.js';
import type { EffectAi } from '../mcp/paths.js';
import { handle, type InitParameters, NAME, type ToolContext } from '../mcp/tools/init.js';
import {
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

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

describe('eligian_init', () => {
  let ai: EffectAi;
  let tmp: string;
  const versions = getCompilerVersion();

  beforeAll(async () => {
    ai = await import('effect/ai');
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const context = (): ToolContext => ({
    ai,
    cwd: tmp,
    docsRoot: tmp,
    versions,
    requestId: 'test-1',
  });
  const run = (params: InitParameters) => Effect.runPromise(handle(params, context()));
  const fail = (params: InitParameters) =>
    Effect.runPromise(Effect.flip(handle(params, context())));
  const read = (file: string) => fs.readFileSync(path.join(tmp, file), 'utf-8');

  it.each(['blank', 'chapters', 'video', 'library'] as const)('template %s', async template => {
    const payload = await run({ directory: tmp, template });

    expect(Object.keys(payload)[0]).toBe('header');
    expect(payload.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${tmp}`
    );
    expect(payload.directory).toBe(tmp);
    expect(payload.template).toBe(template);
    expect(payload.skipped).toEqual([]);

    const starter = Object.keys(starterFiles(template, { title: 'x' }));
    for (const file of [...starter, '.mcp.json', 'AGENTS.md', 'CLAUDE.md']) {
      expect(fs.existsSync(path.join(tmp, file)), file).toBe(true);
      expect(payload.written).toContain(file);
    }

    const agents = read('AGENTS.md');
    expect(agents).toContain('<!-- eligian:begin -->');
    expect(agents).toContain('<!-- eligian:end -->');
    expect(agents).toContain('node_modules/eligian/dist/docs');
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');

    const mcp = JSON.parse(read('.mcp.json')) as {
      mcpServers: { eligian: { command: string; args: string[] } };
    };
    expect(mcp.mcpServers.eligian.command).toBe('node');
    const [server, command] = mcp.mcpServers.eligian.args;
    expect(path.isAbsolute(server)).toBe(true);
    expect(server.endsWith(path.join('node_modules', 'eligian', 'bin', 'cli.js'))).toBe(true);
    expect(command).toBe('mcp');

    expect(payload.nextSteps.length).toBeGreaterThan(0);
    expect(payload.nextSteps[0]).toContain('npm install');

    const outcome = await runCheck([path.join(tmp, STARTER_ENTRY)], {
      format: 'json',
      warningsAsErrors: false,
      maxWarnings: 0,
      selectorNotInLayout: 'ids',
      lint: true,
      review: true,
      cwd: tmp,
      version: versions.compiler,
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.exitCode, outcome.output).toBe(0);
  });

  it('refuses existing starter files', async () => {
    fs.writeFileSync(path.join(tmp, STARTER_ENTRY), 'keep me');
    const error = await fail({ directory: tmp, template: 'blank' });
    expect(error._tag).toBe('ToolIoError');
    expect(error.message).toContain(STARTER_ENTRY);
    expect(error.message).toContain('force: true');
    expect(read(STARTER_ENTRY)).toBe('keep me');
    expect(fs.existsSync(path.join(tmp, '.mcp.json'))).toBe(false);
  });

  it('skips existing agent files', async () => {
    fs.writeFileSync(path.join(tmp, '.mcp.json'), '{ "mine": true }\n');
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# my agents\n');
    const payload = await run({ directory: tmp, template: 'blank' });

    expect(read('.mcp.json')).toBe('{ "mine": true }\n');
    expect(read('AGENTS.md')).toBe('# my agents\n');
    expect(payload.written).not.toContain('.mcp.json');
    expect(payload.written).not.toContain('AGENTS.md');
    expect(payload.written).toContain('CLAUDE.md');

    const skipped = new Map(payload.skipped.map(entry => [entry.file, entry]));
    expect([...skipped.keys()].sort()).toEqual(['.mcp.json', 'AGENTS.md']);
    expect(skipped.get('AGENTS.md')?.content).toBe(agentsMdBlock());
    const mcp = JSON.parse(skipped.get('.mcp.json')?.content ?? '{}') as {
      mcpServers: { eligian: { args: string[] } };
    };
    expect(mcp.mcpServers.eligian.args).toEqual([
      path.join(tmp, 'node_modules', 'eligian', 'bin', 'cli.js'),
      'mcp',
    ]);
    for (const entry of payload.skipped) expect(entry.reason).not.toBe('');
  });

  it('writes no agent files with agents: false', async () => {
    const payload = await run({ directory: tmp, template: 'blank', agents: false });
    expect(fs.existsSync(path.join(tmp, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'CLAUDE.md'))).toBe(false);
    expect(payload.written).toEqual(Object.keys(starterFiles('blank', { title: 'x' })));
  });

  it('a write failure is ToolIoError', async () => {
    fs.writeFileSync(path.join(tmp, 'file.txt'), 'a file');
    const directory = path.join(tmp, 'file.txt', 'sub');
    const error = await fail({ directory, template: 'blank' });
    expect(error._tag).toBe('ToolIoError');
    expect(error.path).toBe(directory);
  });

  describe('eligian_init on the wire', () => {
    let server: InMemoryServer | undefined;

    afterEach(async () => {
      await server?.close();
      server = undefined;
    });

    it('a write failure is kind io', async () => {
      fs.writeFileSync(path.join(tmp, 'file.txt'), 'a file');
      const directory = path.join(tmp, 'file.txt', 'sub');
      server = await startInMemoryServer({ cwd: tmp, docsRoot: tmp });

      const error = expectFailure(
        await server.callTool(NAME, { directory, template: 'blank' }),
        'io'
      );

      expect(error.path).toBe(directory);
      expect(fs.statSync(path.join(tmp, 'file.txt')).isFile()).toBe(true);
    });
  });
});
