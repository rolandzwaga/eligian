/**
 * Spec 058 Phase 1 (FR-025, FR-026, SC-012; plan C9, C11): `eligian_init` writes a starter
 * plus the agent files, refuses to overwrite starter files without `force`, and every template
 * it writes checks clean with the 1.1.0 defaults (the check runs test-side; the tool carries none).
 *
 * Phase 2 (FR-065, Q7, I-1; plan D8, P12; SC-011(7)): the agent files of each `client` go
 * through `setupAgents` (merged into existing files, always the `node` form) and the reply
 * lists each with its status.
 *
 * Spec 059 Phase 2 (FR-013, FR-058): `eligian_init` is gated. Without a brief it is refused
 * `brief-required` before any write; the cases that write a starter run under a brief approved
 * through `eligian_brief` (`approvedBrief`), signed with a test state dir.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCompilerVersion, STARTER_ENTRY, starterFiles } from '@eligian/language';
import { Effect } from 'effect';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../check/check-command.js';
import { makeRecordStore } from '../mcp/brief/known-programs.js';
import type { EffectAi } from '../mcp/paths.js';
import {
  DESCRIPTION,
  handle,
  type InitParameters,
  KEYWORDS,
  NAME,
  type ToolContext,
} from '../mcp/tools/init.js';
import { approvedBrief } from './brief-helpers.js';
import {
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

/** A stand-in for the generated `dist/docs/agents-block.md` (agents.spec.ts uses it too). */
const DOCS_ROOT = path.join(import.meta.dirname, '__fixtures__', 'agents', 'docs');
const BLOCK = fs
  .readFileSync(path.join(DOCS_ROOT, 'agents-block.md'), 'utf-8')
  .replace(/\r\n/g, '\n');
const cliPath = (dir: string) => path.join(dir, 'node_modules', 'eligian', 'bin', 'cli.js');

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
  let stateDir: string;
  const versions = getCompilerVersion();

  beforeAll(async () => {
    ai = await import('effect/ai');
    stateDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-init-state-')));
  });

  afterAll(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
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
    docsRoot: DOCS_ROOT,
    versions,
    requestId: 'test-1',
    gate: { record: makeRecordStore(), stateDir, noteBrief: () => {} },
  });
  /** FR-058 move (2): the brief of `tmp` approved through the tool, on a server of its own. */
  const approve = async () => {
    const server = await startInMemoryServer({
      cwd: tmp,
      docsRoot: DOCS_ROOT,
      brief: { stateDir },
    });
    try {
      await approvedBrief(server, tmp, { stateDir });
    } finally {
      await server.close();
    }
  };
  const run = (params: InitParameters) => Effect.runPromise(handle(params, context()));
  const fail = (params: InitParameters) =>
    Effect.runPromise(Effect.flip(handle(params, context())));
  const read = (file: string) => fs.readFileSync(path.join(tmp, file), 'utf-8');

  it.each(['blank', 'chapters', 'video', 'library'] as const)('template %s', async template => {
    await approve();
    const payload = await run({ directory: tmp, template });

    expect(Object.keys(payload)[0]).toBe('header');
    expect(payload.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${tmp}`
    );
    expect(payload.directory).toBe(tmp);
    expect(payload.template).toBe(template);
    expect(payload.agentFiles).toEqual([
      { file: '.mcp.json', status: 'written' },
      { file: 'CLAUDE.md', status: 'written' },
      { file: 'AGENTS.md', status: 'written' },
    ]);

    const starter = Object.keys(starterFiles(template, { title: 'x' }));
    expect(payload.written).toEqual(starter);
    for (const file of [...starter, '.mcp.json', 'AGENTS.md', 'CLAUDE.md']) {
      expect(fs.existsSync(path.join(tmp, file)), file).toBe(true);
    }

    expect(read('AGENTS.md')).toBe(BLOCK);
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
    if (template === 'video') {
      // The starter writes no media file: one warning until media/intro.mp4 exists (FR-051, Q1)
      const diagnostics = (
        JSON.parse(outcome.output) as {
          files: { diagnostics: { code?: string; message: string }[] }[];
        }
      ).files.flatMap(file => file.diagnostics);
      expect(diagnostics.map(diagnostic => diagnostic.code)).toEqual(['media-file-missing']);
      expect(diagnostics[0].message).toContain(path.join('media', 'intro.mp4'));
      expect(outcome.exitCode).toBe(1);
    } else {
      expect(outcome.error).toBeUndefined();
      expect(outcome.exitCode, outcome.output).toBe(0);
    }
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

  it('merges into existing agent files', async () => {
    const other = { command: 'other-server', args: ['--stdio'] };
    const original = JSON.stringify({ mcpServers: { other }, mine: true }, null, 4);
    fs.writeFileSync(path.join(tmp, '.mcp.json'), `${original.replace(/\n/g, '\r\n')}\r\n`);
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# my agents\n');
    await approve();
    const payload = await run({ directory: tmp, template: 'blank' });

    expect(payload.agentFiles).toEqual([
      { file: '.mcp.json', status: 'updated' },
      { file: 'CLAUDE.md', status: 'written' },
      { file: 'AGENTS.md', status: 'updated' },
    ]);
    expect(payload.written).not.toContain('.mcp.json');
    expect(payload.written).not.toContain('AGENTS.md');
    // The other server and key are kept; only mcpServers.eligian is set
    expect(JSON.parse(read('.mcp.json'))).toEqual({
      mcpServers: { other, eligian: { command: 'node', args: [cliPath(tmp), 'mcp'] } },
      mine: true,
    });
    expect(read('AGENTS.md')).toBe(`# my agents\n\n${BLOCK}`);
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');

    // A second run changes nothing
    const again = await run({ directory: tmp, template: 'blank', force: true });
    expect(again.agentFiles.map(entry => entry.status)).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
    ]);
  });

  it('client cursor reports .cursor/mcp.json, .cursor/rules/eligian.mdc and AGENTS.md with statuses', async () => {
    await approve();
    const payload = await run({ directory: tmp, template: 'blank', client: ['cursor'] });

    expect(payload.agentFiles).toEqual([
      { file: '.cursor/mcp.json', status: 'written' },
      { file: '.cursor/rules/eligian.mdc', status: 'written' },
      { file: 'AGENTS.md', status: 'written' },
    ]);
    expect(fs.existsSync(path.join(tmp, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'CLAUDE.md'))).toBe(false);
    const mcp = JSON.parse(read('.cursor/mcp.json')) as {
      mcpServers: { eligian: { command: string; args: string[] } };
    };
    // Always the node form, also without node_modules (Q7)
    expect(mcp.mcpServers.eligian).toEqual({ command: 'node', args: [cliPath(tmp), 'mcp'] });

    const again = await run({
      directory: tmp,
      template: 'blank',
      client: ['cursor'],
      force: true,
    });
    expect(again.agentFiles).toEqual([
      { file: '.cursor/mcp.json', status: 'unchanged' },
      { file: '.cursor/rules/eligian.mdc', status: 'unchanged' },
      { file: 'AGENTS.md', status: 'unchanged' },
    ]);
  });

  it('DESCRIPTION names client and the four statuses, without "never touched" or "skipped"', () => {
    expect(DESCRIPTION).toContain('client');
    for (const client of ['claude', 'cursor', 'vscode', 'codex']) {
      expect(DESCRIPTION).toContain(client);
    }
    for (const status of ['written', 'updated', 'unchanged', 'refused']) {
      expect(DESCRIPTION).toContain(status);
    }
    expect(DESCRIPTION).not.toContain('never touched');
    expect(DESCRIPTION).not.toContain('skipped');
    const head = DESCRIPTION.slice(0, 200).toLowerCase();
    for (const keyword of KEYWORDS) expect(head, keyword).toContain(keyword);
  });

  it('nextSteps names eligian_project', async () => {
    await approve();
    const payload = await run({ directory: tmp, template: 'blank' });
    const steps = payload.nextSteps.join('\n');
    expect(steps).toContain('eligian_project');
  });

  it('next steps contain explain:true', async () => {
    await approve();
    const payload = await run({ directory: tmp, template: 'blank' });
    expect(payload.nextSteps).toContain(
      'After the first timeline passes check, call eligian_compile(select, explain:true).'
    );
  });

  it('writes no agent files with agents: false', async () => {
    await approve();
    const payload = await run({ directory: tmp, template: 'blank', agents: false });
    expect(fs.existsSync(path.join(tmp, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'CLAUDE.md'))).toBe(false);
    expect(payload.written).toEqual(Object.keys(starterFiles('blank', { title: 'x' })));
    expect(payload.agentFiles).toEqual([]);
  });

  it('without a brief: refused brief-required before any write (FR-013)', async () => {
    fs.writeFileSync(path.join(tmp, 'file.txt'), 'a file');
    const directory = path.join(tmp, 'file.txt', 'sub');
    const error = await fail({ directory, template: 'blank' });
    expect(error._tag).toBe('ToolGateRefused');
    expect(error._tag === 'ToolGateRefused' ? error.gate.code : undefined).toBe('brief-required');
    expect(error.path).toBe(path.join(directory, STARTER_ENTRY));
    expect(fs.statSync(path.join(tmp, 'file.txt')).isFile()).toBe(true);
    expect(fs.existsSync(path.join(tmp, STARTER_ENTRY))).toBe(false);
    expect(fs.existsSync(path.join(tmp, '.mcp.json'))).toBe(false);
  });

  it('under an approved brief: a write failure is ToolIoError naming the directory (spec 058)', async () => {
    await approve();
    fs.mkdirSync(path.join(tmp, '.mcp.json'));
    const error = await fail({ directory: tmp, template: 'blank' });
    expect(error._tag).toBe('ToolIoError');
    expect(error.path).toBe(tmp);
  });

  describe('eligian_init on the wire', () => {
    let server: InMemoryServer | undefined;

    afterEach(async () => {
      await server?.close();
      server = undefined;
    });

    it('without a brief: kind gate, brief-required, nothing written (FR-013)', async () => {
      fs.writeFileSync(path.join(tmp, 'file.txt'), 'a file');
      const directory = path.join(tmp, 'file.txt', 'sub');
      server = await startInMemoryServer({ cwd: tmp, docsRoot: tmp, brief: { stateDir } });

      const error = expectFailure(
        await server.callTool(NAME, { directory, template: 'blank' }),
        'gate'
      ) as { kind: string; message: string; path?: string; gate: { code: string } };

      expect(error.gate.code).toBe('brief-required');
      expect(fs.statSync(path.join(tmp, 'file.txt')).isFile()).toBe(true);
      expect(fs.existsSync(path.join(tmp, '.mcp.json'))).toBe(false);
    });

    it('under an approved brief: a write failure is kind io (spec 058)', async () => {
      await approve();
      fs.mkdirSync(path.join(tmp, '.mcp.json'));
      server = await startInMemoryServer({ cwd: tmp, docsRoot: DOCS_ROOT, brief: { stateDir } });

      const error = expectFailure(
        await server.callTool(NAME, { directory: tmp, template: 'blank' }),
        'io'
      );

      expect(error.path).toBe(tmp);
    });
  });
});
