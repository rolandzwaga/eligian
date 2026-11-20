/**
 * Spec 058 Phase 2 (FR-060–FR-063; SC-011 (1)–(4), (6); plan E1): `agents.ts` builds every agent
 * file from one source and merges into existing files: JSON (only the `eligian` server key),
 * TOML (only the `[mcp_servers.eligian]` table), the marked Markdown block and the `@AGENTS.md`
 * import line. A second run changes no byte; invalid JSON is refused and left untouched.
 *
 * SC-011 (4)–(6), (8); plan E3: the commands `agents setup [dir]`, `mcp --print-config <client>`
 * and `init --client / --no-agents`, in-process through `runAgentsSetup` and spawned against
 * the built bundle (`bin/cli.js`).
 *
 * SC-019 (FR-066): the real generated `dist/docs/agents-block.md` stays within 8,192 bytes and
 * indexes every chunk of the real `dist/docs/index.json`.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_CLIENTS,
  type AgentClient,
  detectServerCommand,
  mergeImportLine,
  mergeJsonServers,
  mergeMarkedBlock,
  mergeTomlTable,
  printConfig,
  runAgentsSetup,
  type ServerCommand,
  serverEntry,
  setupAgents,
} from '../agents.js';
import { agentsMdBlock, chunkFile } from '../mcp/instructions.js';
import type { IndexEntry } from '../mcp/knowledge/types.js';
import { requireFreshBundle } from './fresh-bundle.js';

const FIXTURES = path.join(import.meta.dirname, '__fixtures__', 'agents');
const DOCS_ROOT = path.join(FIXTURES, 'docs');
const lf = (text: string): string => text.replace(/\r\n/g, '\n');
const fixture = (name: string): string => lf(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));
const BLOCK = lf(fs.readFileSync(path.join(DOCS_ROOT, 'agents-block.md'), 'utf-8'));
const NPX = ['-y', 'eligian@^1.2', 'mcp'];

/**
 * A ~20-line TOML table reader: `[table]` headers and `key = <JSON-compatible value>` lines;
 * keys before the first header go to the table `''`.
 */
function readTomlTables(text: string): Record<string, Record<string, unknown>> {
  const tables: Record<string, Record<string, unknown>> = {};
  let current: Record<string, unknown> | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = {};
      tables[header[1].trim()] = current;
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) throw new Error(`not a TOML table line: ${raw}`);
    current ??= tables[''] = {};
    current[pair[1]] = JSON.parse(pair[2]);
  }
  return tables;
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-agents-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const NODE_ENTRY = { command: 'node', args: ['/p/node_modules/eligian/bin/cli.js', 'mcp'] };

describe('merge', () => {
  it('json keeps other servers (4-space CRLF)', () => {
    const original = {
      $schema: 'https://example.com/mcp.json',
      mcpServers: {
        other: { command: 'other-server', args: ['--port', '4000'] },
        eligian: { command: 'npx', args: ['-y', 'eligian@^1.0', 'mcp'] },
      },
      extra: [1, 2, 3],
    };
    const file = path.join(tmp, '.mcp.json');
    fs.writeFileSync(file, JSON.stringify(original, null, 4).replace(/\n/g, '\r\n'));
    const result = mergeJsonServers(fs.readFileSync(file, 'utf-8'), 'mcpServers', NODE_ENTRY);
    expect(result.status).toBe('updated');
    const expected = structuredClone(original);
    expected.mcpServers.eligian = NODE_ENTRY;
    expect(JSON.parse(result.content!)).toEqual(expected);
    expect(result.content).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });

  it('json absent → written', () => {
    const result = mergeJsonServers(undefined, 'servers', { type: 'stdio', ...NODE_ENTRY });
    expect(result.status).toBe('written');
    expect(result.content).toBe(
      `${JSON.stringify({ servers: { eligian: { type: 'stdio', ...NODE_ENTRY } } }, null, 2)}\n`
    );
  });

  it('json with the same entry → unchanged, no content', () => {
    const existing = JSON.stringify(
      { mcpServers: { other: { command: 'x' }, eligian: NODE_ENTRY } },
      null,
      4
    ).replace(/\n/g, '\r\n');
    const result = mergeJsonServers(existing, 'mcpServers', NODE_ENTRY);
    expect(result).toEqual({ status: 'unchanged' });
  });

  it('invalid json refused', () => {
    for (const existing of ['{ "mcpServers": ', '[1, 2]', '{"mcpServers": 3}']) {
      const result = mergeJsonServers(existing, 'mcpServers', NODE_ENTRY);
      expect(result.status).toBe('refused');
      expect(result.content).toBeUndefined();
      expect(result.message).toMatch(/\S/);
    }
  });

  it('toml replaces only the eligian table', () => {
    const existing = fixture('config-other.toml');
    const cliPath = path.win32.join(
      'C:\\Users\\me\\talk',
      'node_modules',
      'eligian',
      'bin',
      'cli.js'
    );
    const table = `[mcp_servers.eligian]\ncommand = "node"\nargs = [${JSON.stringify(cliPath)}, "mcp"]\n`;
    const result = mergeTomlTable(existing, table);
    expect(result.status).toBe('updated');

    const header = existing.indexOf('[mcp_servers.eligian]');
    const next = existing.indexOf('[profiles.fast]');
    expect(result.content.slice(0, header)).toBe(existing.slice(0, header));
    expect(result.content.endsWith(existing.slice(next))).toBe(true);
    expect(result.content).not.toContain('[mcp_servers.eligian.env]');
    expect(result.content).not.toContain('ELIGIAN_MCP_LOG');
    expect(result.content).toContain('args = ["C:\\\\Users\\\\me\\\\talk\\\\node_modules');

    const tables = readTomlTables(result.content);
    expect(tables['mcp_servers.eligian']).toEqual({ command: 'node', args: [cliPath, 'mcp'] });
    expect(tables['mcp_servers.other']).toEqual({
      command: 'other-server',
      args: ['--port', '4000'],
    });
    expect(tables['profiles.fast']).toEqual({ model: 'o4-mini' });
    expect(tables['']).toEqual({ model: 'o4-mini' });

    // appended after one blank line when absent
    const other = '[mcp_servers.other]\ncommand = "x"\n';
    expect(mergeTomlTable(other, table)).toEqual({
      content: `${other}\n${table}`,
      status: 'updated',
    });
    expect(mergeTomlTable(undefined, table)).toEqual({ content: table, status: 'written' });

    // CRLF bytes outside the table are kept
    const crlf = existing.replace(/\n/g, '\r\n');
    const merged = mergeTomlTable(crlf, table).content;
    expect(merged.slice(0, crlf.indexOf('[mcp_servers.eligian]'))).toBe(
      crlf.slice(0, crlf.indexOf('[mcp_servers.eligian]'))
    );
    expect(merged.endsWith(crlf.slice(crlf.indexOf('[profiles.fast]')))).toBe(true);

    // a second merge is a no-op
    expect(mergeTomlTable(result.content, table)).toEqual({
      content: result.content,
      status: 'unchanged',
    });
  });

  it('marked block replaced or appended', () => {
    const existing = fixture('agents-other.md');
    const result = mergeMarkedBlock(existing, BLOCK);
    expect(result.status).toBe('updated');
    const begin = existing.indexOf('<!-- eligian:begin -->');
    const end = existing.indexOf('<!-- eligian:end -->') + '<!-- eligian:end -->'.length;
    expect(result.content).toBe(
      `${existing.slice(0, begin)}${BLOCK.trimEnd()}${existing.slice(end)}`
    );
    expect(result.content).not.toContain('An outdated block.');
    expect(mergeMarkedBlock(result.content, BLOCK)).toEqual({
      content: result.content,
      status: 'unchanged',
    });

    expect(mergeMarkedBlock('# Notes\n\nKeep it short.\n', BLOCK)).toEqual({
      content: `# Notes\n\nKeep it short.\n\n${BLOCK}`,
      status: 'updated',
    });
    expect(mergeMarkedBlock('# Notes', BLOCK).content).toBe(`# Notes\n\n${BLOCK}`);
    expect(mergeMarkedBlock(undefined, BLOCK)).toEqual({ content: BLOCK, status: 'written' });
  });

  it('import line added once', () => {
    expect(mergeImportLine(undefined, '@AGENTS.md')).toEqual({
      content: '@AGENTS.md\n',
      status: 'written',
    });
    const added = mergeImportLine('# Claude\n\nBe brief.\n', '@AGENTS.md');
    expect(added).toEqual({ content: '# Claude\n\nBe brief.\n@AGENTS.md\n', status: 'updated' });
    expect(mergeImportLine(added.content, '@AGENTS.md')).toEqual({
      content: added.content,
      status: 'unchanged',
    });
    expect(mergeImportLine('# Claude\r\n@AGENTS.md\r\n', '@AGENTS.md').status).toBe('unchanged');
  });
});

describe('serverEntry', () => {
  it('node form', () => {
    for (const join of [path.win32.join, path.posix.join]) {
      const cliPath = join('/talk', 'node_modules', 'eligian', 'bin', 'cli.js');
      for (const client of AGENT_CLIENTS) {
        expect(serverEntry(client, { form: 'node', cliPath })).toEqual({
          command: 'node',
          args: [cliPath, 'mcp'],
        });
      }
    }
    expect(path.win32.join('C:\\talk', 'node_modules', 'eligian', 'bin', 'cli.js')).toBe(
      'C:\\talk\\node_modules\\eligian\\bin\\cli.js'
    );
  });

  it('npx form; win32 uses cmd for cursor, vscode, codex', () => {
    const win: ServerCommand = { form: 'npx', platform: 'win32' };
    for (const client of ['cursor', 'vscode', 'codex'] as const) {
      expect(serverEntry(client, win)).toEqual({ command: 'cmd', args: ['/c', 'npx', ...NPX] });
    }
    expect(serverEntry('claude', win)).toEqual({ command: 'npx', args: NPX });
    for (const client of AGENT_CLIENTS) {
      expect(serverEntry(client, { form: 'npx', platform: 'linux' })).toEqual({
        command: 'npx',
        args: NPX,
      });
    }
  });
});

describe('detectServerCommand', () => {
  it('node when <cwd>/node_modules/eligian/bin/cli.js exists, else npx', () => {
    const cwd = path.resolve(tmp, 'talk');
    const cliPath = path.join(cwd, 'node_modules', 'eligian', 'bin', 'cli.js');
    const seen: string[] = [];
    const present = (p: string) => {
      seen.push(p);
      return p === cliPath;
    };
    expect(detectServerCommand(cwd, 'win32', present)).toEqual({ form: 'node', cliPath });
    expect(seen).toEqual([cliPath]);
    expect(detectServerCommand(cwd, 'win32', () => false)).toEqual({
      form: 'npx',
      platform: 'win32',
    });
    expect(detectServerCommand(cwd, 'linux', () => false)).toEqual({
      form: 'npx',
      platform: 'linux',
    });
  });
});

describe('printConfig', () => {
  const entryOf = (client: AgentClient, text: string): unknown =>
    client === 'codex'
      ? readTomlTables(text)['mcp_servers.eligian']
      : client === 'vscode'
        ? JSON.parse(text).servers.eligian
        : JSON.parse(text).mcpServers.eligian;

  it.each(AGENT_CLIENTS)('%s parses', client => {
    const linux = printConfig(client, tmp, 'linux');
    const win = printConfig(client, tmp, 'win32');
    if (client !== 'codex') {
      expect(Object.keys(JSON.parse(linux))).toEqual([
        client === 'vscode' ? 'servers' : 'mcpServers',
      ]);
    } else {
      expect(Object.keys(readTomlTables(linux))).toEqual(['mcp_servers.eligian']);
    }
    const typed = client === 'vscode' ? { type: 'stdio' } : {};
    expect(entryOf(client, linux)).toEqual({ ...typed, command: 'npx', args: NPX });
    expect(entryOf(client, win)).toEqual(
      client === 'claude'
        ? { command: 'npx', args: NPX }
        : { ...typed, command: 'cmd', args: ['/c', 'npx', ...NPX] }
    );
  });

  it('node form when installed', () => {
    const cliPath = path.join(tmp, 'node_modules', 'eligian', 'bin', 'cli.js');
    fs.mkdirSync(path.dirname(cliPath), { recursive: true });
    fs.writeFileSync(cliPath, '');
    for (const client of AGENT_CLIENTS) {
      const typed = client === 'vscode' ? { type: 'stdio' } : {};
      expect(entryOf(client, printConfig(client, tmp, 'win32'))).toEqual({
        ...typed,
        command: 'node',
        args: [path.resolve(cliPath), 'mcp'],
      });
    }
  });
});

describe('setupAgents', () => {
  const cliPath = (dir: string) => path.join(dir, 'node_modules', 'eligian', 'bin', 'cli.js');
  const setup = (clients: readonly AgentClient[]) =>
    setupAgents(tmp, clients, {
      command: { form: 'node', cliPath: cliPath(tmp) },
      docsRoot: DOCS_ROOT,
    });
  const read = (file: string) => fs.readFileSync(path.join(tmp, file), 'utf-8');
  const node = () => ({ command: 'node', args: [cliPath(tmp), 'mcp'] });

  it('claude writes .mcp.json, CLAUDE.md, AGENTS.md', async () => {
    expect(await setup(['claude'])).toEqual([
      { file: '.mcp.json', status: 'written' },
      { file: 'CLAUDE.md', status: 'written' },
      { file: 'AGENTS.md', status: 'written' },
    ]);
    expect(JSON.parse(read('.mcp.json'))).toEqual({ mcpServers: { eligian: node() } });
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(read('AGENTS.md')).toBe(BLOCK);
  });

  it('cursor writes .cursor/mcp.json, .cursor/rules/eligian.mdc (frontmatter alwaysApply: true), AGENTS.md', async () => {
    expect(await setup(['cursor'])).toEqual([
      { file: '.cursor/mcp.json', status: 'written' },
      { file: '.cursor/rules/eligian.mdc', status: 'written' },
      { file: 'AGENTS.md', status: 'written' },
    ]);
    expect(JSON.parse(read('.cursor/mcp.json'))).toEqual({ mcpServers: { eligian: node() } });
    const rule = read('.cursor/rules/eligian.mdc');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(rule);
    expect(frontmatter?.[1].split('\n')).toContain('alwaysApply: true');
    expect(frontmatter?.[1].split('\n')).toContain('description: Eligian presentation workflow');
    expect(rule.endsWith(BLOCK)).toBe(true);
    expect(read('AGENTS.md')).toBe(BLOCK);
    expect(fs.existsSync(path.join(tmp, 'CLAUDE.md'))).toBe(false);
  });

  it('vscode writes .vscode/mcp.json and the copilot block', async () => {
    expect(await setup(['vscode'])).toEqual([
      { file: '.vscode/mcp.json', status: 'written' },
      { file: '.github/copilot-instructions.md', status: 'written' },
      { file: 'AGENTS.md', status: 'written' },
    ]);
    expect(JSON.parse(read('.vscode/mcp.json'))).toEqual({
      servers: { eligian: { type: 'stdio', ...node() } },
    });
    expect(read('.github/copilot-instructions.md')).toBe(BLOCK);
  });

  it('codex writes .codex/config.toml', async () => {
    expect(await setup(['codex'])).toEqual([
      { file: '.codex/config.toml', status: 'written' },
      { file: 'AGENTS.md', status: 'written' },
    ]);
    expect(readTomlTables(read('.codex/config.toml'))).toEqual({
      'mcp_servers.eligian': node(),
    });
  });

  it('second run: every file unchanged and byte-identical', async () => {
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), fixture('agents-other.md'));
    fs.mkdirSync(path.join(tmp, '.codex'));
    fs.writeFileSync(path.join(tmp, '.codex', 'config.toml'), fixture('config-other.toml'));
    const first = await setup(AGENT_CLIENTS);
    expect(first.map(r => r.file)).toEqual([
      '.mcp.json',
      'CLAUDE.md',
      '.cursor/mcp.json',
      '.cursor/rules/eligian.mdc',
      '.vscode/mcp.json',
      '.github/copilot-instructions.md',
      '.codex/config.toml',
      'AGENTS.md',
    ]);
    expect(first.find(r => r.file === 'AGENTS.md')?.status).toBe('updated');
    expect(first.find(r => r.file === '.codex/config.toml')?.status).toBe('updated');
    const bytes = first.map(r => fs.readFileSync(path.join(tmp, r.file)));

    const second = await setup(AGENT_CLIENTS);
    expect(second).toEqual(first.map(r => ({ file: r.file, status: 'unchanged' })));
    expect(second.map(r => fs.readFileSync(path.join(tmp, r.file)))).toEqual(bytes);
  });

  it('an invalid .mcp.json is refused and untouched; the other files are still written', async () => {
    fs.writeFileSync(path.join(tmp, '.mcp.json'), '{ "mcpServers": {\r\n');
    const results = await setup(['claude']);
    expect(results.map(r => [r.file, r.status])).toEqual([
      ['.mcp.json', 'refused'],
      ['CLAUDE.md', 'written'],
      ['AGENTS.md', 'written'],
    ]);
    expect(results[0].message).toMatch(/\S/);
    expect(read('.mcp.json')).toBe('{ "mcpServers": {\r\n');
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('no clients: no files', async () => {
    expect(await setup([])).toEqual([]);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });
});

describe('agents setup', () => {
  const linux = { platform: 'linux' as const, exists: () => false };
  const run = (clients: readonly string[] | undefined, dir = '.', cwd = tmp) =>
    runAgentsSetup(dir, clients, { cwd, docsRoot: DOCS_ROOT, ...linux });
  const read = (file: string) => fs.readFileSync(path.join(tmp, file), 'utf-8');

  it('exit 0 when every file is written', async () => {
    const outcome = await run(['claude']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.output.split('\n')).toEqual([
      'Agent file .mcp.json: written',
      'Agent file CLAUDE.md: written',
      'Agent file AGENTS.md: written',
    ]);
    expect(JSON.parse(read('.mcp.json'))).toEqual({
      mcpServers: { eligian: { command: 'npx', args: NPX } },
    });
    expect(read('AGENTS.md')).toBe(BLOCK);
  });

  it('absent clients mean claude; a relative dir resolves against cwd', async () => {
    const outcome = await run(undefined, 'talk');
    expect(outcome.exitCode).toBe(0);
    expect(fs.readdirSync(path.join(tmp, 'talk')).sort()).toEqual(
      ['.mcp.json', 'AGENTS.md', 'CLAUDE.md'].sort()
    );
  });

  it('exit 1 when an invalid JSON file is refused', async () => {
    fs.mkdirSync(path.join(tmp, '.cursor'));
    fs.writeFileSync(path.join(tmp, '.cursor', 'mcp.json'), '{ "mcpServers": ');
    const outcome = await run(['cursor', 'claude']);
    expect(outcome.exitCode).toBe(1);
    const lines = outcome.output.split('\n');
    expect(lines).toContain('Agent file .mcp.json: written');
    expect(lines[0]).toMatch(/^Agent file \.cursor\/mcp\.json: refused \(.+\)$/);
    expect(read('.cursor/mcp.json')).toBe('{ "mcpServers": ');
    expect(fs.existsSync(path.join(tmp, '.cursor', 'rules', 'eligian.mdc'))).toBe(true);
  });

  it('exit 2 on an unknown client', async () => {
    const outcome = await run(['claude', 'copilot']);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.output).toContain("'copilot'");
    expect(outcome.output).toContain(AGENT_CLIENTS.join(', '));
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('node form when <cwd>/node_modules/eligian/bin/cli.js exists, else npx (win32: cmd for cursor, vscode, codex)', async () => {
    const cwd = path.join(tmp, 'workspace');
    const cliPath = path.resolve(cwd, 'node_modules', 'eligian', 'bin', 'cli.js');
    const entries = (dir: string) => ({
      claude: JSON.parse(read(`${dir}/.mcp.json`)).mcpServers.eligian,
      cursor: JSON.parse(read(`${dir}/.cursor/mcp.json`)).mcpServers.eligian,
      vscode: JSON.parse(read(`${dir}/.vscode/mcp.json`)).servers.eligian,
      codex: readTomlTables(read(`${dir}/.codex/config.toml`))['mcp_servers.eligian'],
    });

    const installed = await runAgentsSetup(path.join(tmp, 'a'), AGENT_CLIENTS, {
      cwd,
      docsRoot: DOCS_ROOT,
      platform: 'win32',
      exists: p => p === cliPath,
    });
    expect(installed.exitCode).toBe(0);
    const node = { command: 'node', args: [cliPath, 'mcp'] };
    expect(entries('a')).toEqual({
      claude: node,
      cursor: node,
      vscode: { type: 'stdio', ...node },
      codex: node,
    });

    const win = await runAgentsSetup(path.join(tmp, 'b'), AGENT_CLIENTS, {
      cwd,
      docsRoot: DOCS_ROOT,
      platform: 'win32',
      exists: () => false,
    });
    expect(win.exitCode).toBe(0);
    const cmd = { command: 'cmd', args: ['/c', 'npx', ...NPX] };
    expect(entries('b')).toEqual({
      claude: { command: 'npx', args: NPX },
      cursor: cmd,
      vscode: { type: 'stdio', ...cmd },
      codex: cmd,
    });

    expect((await run(AGENT_CLIENTS, path.join(tmp, 'c'), cwd)).exitCode).toBe(0);
    const npx = { command: 'npx', args: NPX };
    expect(entries('c')).toEqual({
      claude: npx,
      cursor: npx,
      vscode: { type: 'stdio', ...npx },
      codex: npx,
    });
  });
});

describe('AGENTS.md block', () => {
  const DIST_DOCS = path.resolve(import.meta.dirname, '..', '..', 'dist', 'docs');
  let block: string;
  let lines: string[];
  let index: IndexEntry[];
  /** The comma-separated names after `<prefix>` on its line. */
  const namesAfter = (prefix: string): string[] => {
    const line = lines.find(candidate => candidate.startsWith(prefix));
    expect(line, prefix).toBeDefined();
    return (line ?? '').slice(prefix.length).split(', ');
  };
  const namesOf = (kind: string): string[] =>
    index.filter(entry => entry.kind === kind).map(entry => entry.id.slice(kind.length + 1));

  // The block and the index are written by the build (`generate-knowledge`, run by esbuild.mjs)
  beforeAll(() => {
    requireFreshBundle();
    block = fs.readFileSync(path.join(DIST_DOCS, 'agents-block.md'), 'utf-8');
    lines = block.split('\n');
    index = JSON.parse(fs.readFileSync(path.join(DIST_DOCS, 'index.json'), 'utf-8'));
  });

  it('≤ 8192 bytes', () => {
    expect(block).toBe(agentsMdBlock(index));
    expect(Buffer.byteLength(block, 'utf8')).toBeLessThanOrEqual(8192);
  });

  // Phase 3 FR-051, SC-013: the block carries the instructions' compile line with explain.
  it('the block is ≤ 8192 bytes and names explain', () => {
    expect(block).toBe(agentsMdBlock(index));
    expect(Buffer.byteLength(block, 'utf8')).toBeLessThanOrEqual(8192);
    expect(block).toContain(
      '- `eligian_compile`: once after your first timeline passes check (select it, explain:true), and whenever behaviour surprises you.'
    );
  });

  it('every non-operation, non-example id with title and path', () => {
    const listed = index.filter(entry => entry.kind !== 'operation' && entry.kind !== 'example');
    expect(listed.length).toBeGreaterThan(0);
    for (const entry of listed) {
      const file = chunkFile(entry);
      expect(lines, entry.id).toContain(`- ${entry.id}: ${entry.title} (${file})`);
      expect(fs.existsSync(path.join(DIST_DOCS, file)), file).toBe(true);
    }
    expect(block).not.toMatch(/^- (operation|example)\//m);
  });

  it('every operation and example by name', () => {
    const operations = namesOf('operation');
    const examples = namesOf('example');
    expect(operations.length).toBeGreaterThan(0);
    expect(examples.length).toBeGreaterThan(0);
    expect(
      namesAfter('Operations (generated/operations/<name>.md; overview: operations-index): ')
    ).toEqual(operations);
    expect(namesAfter('Examples (generated/examples/<id>.md): ')).toEqual(examples);
  });

  it('both path patterns', () => {
    expect(block).toContain('generated/operations/<name>.md');
    expect(block).toContain('generated/examples/<id>.md');
    // The patterns resolve to the generated files
    const files = [
      ...namesOf('operation').map(name => `generated/operations/${name}.md`),
      ...namesOf('example').map(id => `generated/examples/${id}.md`),
    ];
    expect(files.filter(file => !fs.existsSync(path.join(DIST_DOCS, file)))).toEqual([]);
  });
});

describe('spawned', () => {
  const BIN = path.resolve(import.meta.dirname, '..', '..', 'bin', 'cli.js');
  const cli = (args: readonly string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: tmp, encoding: 'utf-8' });
  const exists = (file: string) => fs.existsSync(path.join(tmp, file));

  beforeAll(() => requireFreshBundle());

  it('agents setup --client cursor placed before [dir] writes into dir', () => {
    const result = cli(['agents', 'setup', '--client', 'cursor', 'talk']);
    expect(result.status).toBe(0);
    expect(exists('talk/.cursor/mcp.json')).toBe(true);
    expect(exists('talk/.cursor/rules/eligian.mdc')).toBe(true);
    expect(exists('talk/AGENTS.md')).toBe(true);
    expect(exists('talk/.mcp.json')).toBe(false);
    expect(exists('.cursor')).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(tmp, 'talk', '.cursor', 'mcp.json'), 'utf-8'))
    ).toEqual({
      mcpServers: { eligian: serverEntry('cursor', { form: 'npx', platform: process.platform }) },
    });
    expect(result.stdout).toContain('Agent file .cursor/mcp.json: written');
  });

  it('agents setup: exit 2 on an unknown client, nothing written', () => {
    const result = cli(['agents', 'setup', '--client', 'copilot', 'talk']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("'copilot'");
    expect(exists('talk')).toBe(false);
  });

  it('init --client cursor <dir> writes into dir', () => {
    const result = cli(['init', '--client', 'cursor', 'talk']);
    expect(result.status).toBe(0);
    expect(exists('talk/package.json')).toBe(true);
    expect(exists('talk/.cursor/mcp.json')).toBe(true);
    expect(exists('talk/.cursor/rules/eligian.mdc')).toBe(true);
    expect(exists('talk/AGENTS.md')).toBe(true);
    expect(exists('talk/.mcp.json')).toBe(false);
    expect(exists('talk/CLAUDE.md')).toBe(false);
    expect(exists('cursor')).toBe(false);
  });

  it('init --no-agents writes no agent file', () => {
    const result = cli(['init', '--no-agents', 'talk']);
    expect(result.status).toBe(0);
    expect(exists('talk/package.json')).toBe(true);
    for (const file of ['.mcp.json', 'CLAUDE.md', 'AGENTS.md', '.cursor', '.vscode', '.codex']) {
      expect(exists(`talk/${file}`)).toBe(false);
    }
  });

  it('init: exit 2 on an unknown client', () => {
    const result = cli(['init', '--client', 'copilot', 'talk']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("'copilot'");
    expect(exists('talk')).toBe(false);
  });

  describe('mcp --print-config', () => {
    it.each(['claude', 'cursor', 'vscode', 'codex'] as const)(
      '%s: exit 0 and the whole stdout parses',
      client => {
        const result = cli(['mcp', '--print-config', client]);
        expect(result.status).toBe(0);
        const expected = serverEntry(client, { form: 'npx', platform: process.platform });
        if (client === 'codex') {
          expect(readTomlTables(result.stdout)).toEqual({ 'mcp_servers.eligian': expected });
        } else {
          const key = client === 'vscode' ? 'servers' : 'mcpServers';
          const typed = client === 'vscode' ? { type: 'stdio' } : {};
          expect(JSON.parse(result.stdout)).toEqual({
            [key]: { eligian: { ...typed, ...expected } },
          });
        }
        expect(result.stdout).toBe(`${printConfig(client, tmp)}\n`);
      }
    );

    it('unknown client: exit 2 and empty stdout', () => {
      const result = cli(['mcp', '--print-config', 'copilot']);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain("'copilot'");
    });
  });
});
