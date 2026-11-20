/**
 * Spec 058 Phase 2 (FR-060–FR-063; plan E1): the agent files of a project, built from one
 * source and merged into what is already there.
 *
 * - JSON (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`): only the `eligian` server key
 *   changes; invalid JSON is refused and left untouched.
 * - TOML (`.codex/config.toml`): only the `[mcp_servers.eligian]` table (and its sub-tables).
 * - Markdown (`AGENTS.md`, `.github/copilot-instructions.md`): only the marked block.
 * - `CLAUDE.md`: the `@AGENTS.md` import line, once.
 *
 * A second run changes no byte. The block text is the generated `agents-block.md` under
 * `docsRoot` (plan P13). Used by `eligian init`, `eligian agents setup` (`runAgentsSetup`),
 * `eligian mcp --print-config` and `eligian_init`; this module prints nothing.
 */
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export type AgentClient = 'claude' | 'cursor' | 'vscode' | 'codex';
export const AGENT_CLIENTS: readonly AgentClient[] = ['claude', 'cursor', 'vscode', 'codex'];
export type ServerCommand =
  | { readonly form: 'node'; readonly cliPath: string } // <project>/node_modules/eligian/bin/cli.js
  | { readonly form: 'npx'; readonly platform: NodeJS.Platform };
export type AgentFileStatus = 'written' | 'updated' | 'unchanged' | 'refused';
export interface AgentFileResult {
  readonly file: string;
  readonly status: AgentFileStatus;
  readonly message?: string;
}

const NPX_ARGS = ['-y', 'eligian@^1.2', 'mcp'] as const;
const BEGIN = '<!-- eligian:begin -->';
const END = '<!-- eligian:end -->';
const TOML_TABLE = 'mcp_servers.eligian';

/** { command, args } of the eligian server per client (FR-060, FR-063) */
export function serverEntry(
  client: AgentClient,
  command: ServerCommand
): { readonly command: string; readonly args: readonly string[] } {
  if (command.form === 'node') return { command: 'node', args: [command.cliPath, 'mcp'] };
  // `npx` is a .cmd script on Windows: clients that spawn without a shell need `cmd /c`
  // (packages/cli/README.md, "Without a local install"); Claude Code starts plain npx.
  if (command.platform === 'win32' && client !== 'claude') {
    return { command: 'cmd', args: ['/c', 'npx', ...NPX_ARGS] };
  }
  return { command: 'npx', args: [...NPX_ARGS] };
}

/** The command rule of --print-config and agents setup: node when <cwd>/node_modules/eligian/bin/cli.js exists, else npx */
export function detectServerCommand(
  cwd: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync
): ServerCommand {
  const cliPath = path.resolve(cwd, 'node_modules', 'eligian', 'bin', 'cli.js');
  return exists(cliPath) ? { form: 'node', cliPath } : { form: 'npx', platform };
}

const jsonKey = (client: AgentClient): 'mcpServers' | 'servers' =>
  client === 'vscode' ? 'servers' : 'mcpServers';

const jsonEntry = (client: AgentClient, command: ServerCommand): object =>
  client === 'vscode'
    ? { type: 'stdio', ...serverEntry(client, command) }
    : serverEntry(client, command);

/** The codex table; strings use JSON escapes, which TOML basic strings share (Windows paths). */
const tomlTable = (entry: { readonly command: string; readonly args: readonly string[] }) =>
  `[${TOML_TABLE}]\ncommand = ${JSON.stringify(entry.command)}\nargs = [${entry.args
    .map(arg => JSON.stringify(arg))
    .join(', ')}]\n`;

export function printConfig(
  client: AgentClient,
  cwd: string,
  platform: NodeJS.Platform = process.platform
): string {
  const command = detectServerCommand(cwd, platform);
  if (client === 'codex') return tomlTable(serverEntry(client, command)).trimEnd();
  return JSON.stringify({ [jsonKey(client)]: { eligian: jsonEntry(client, command) } }, null, 2);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** The line ending of `text`: CRLF when it holds one, else LF. */
const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

const withEol = (text: string, eol: string): string => text.replace(/\r?\n/g, eol);

/** `existing`, then one blank line, then `addition` (no blank line is added twice). */
const appendAfterBlankLine = (existing: string, addition: string, eol: string): string => {
  if (existing === '') return addition;
  const base = existing.endsWith('\n') ? existing : existing + eol;
  return /(?:^|\n)\r?\n$/.test(base) ? base + addition : base + eol + addition;
};

/** Pure merges (FR-061) */
export function mergeJsonServers(
  existing: string | undefined,
  key: 'mcpServers' | 'servers',
  entry: object
): { content?: string; status: AgentFileStatus; message?: string } {
  const eligian: unknown = JSON.parse(JSON.stringify(entry));
  if (existing === undefined) return { content: toJson({ [key]: { eligian } }), status: 'written' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { status: 'refused', message: `not valid JSON (${reason}); left untouched` };
  }
  if (!isRecord(parsed)) {
    return { status: 'refused', message: 'not a JSON object; left untouched' };
  }
  const servers = parsed[key];
  if (servers !== undefined && !isRecord(servers)) {
    return { status: 'refused', message: `"${key}" is not an object; left untouched` };
  }
  if (servers !== undefined && isDeepStrictEqual(servers.eligian, eligian)) {
    return { status: 'unchanged' };
  }
  return { content: toJson({ ...parsed, [key]: { ...servers, eligian } }), status: 'updated' };
}

/** A TOML table header line (`[a.b]` or `[[a.b]]`, optionally commented); group 1 = the name. */
const TOML_HEADER = /^\s*\[\[?\s*([^[\]]+?)\s*\]\]?\s*(?:#.*)?$/;

const isEligianTable = (name: string): boolean => {
  const normalized = name.replace(/\s*\.\s*/g, '.').replace(/["']/g, '');
  return normalized === TOML_TABLE || normalized.startsWith(`${TOML_TABLE}.`);
};

const isBlank = (line: string): boolean => line.trim() === '';

export function mergeTomlTable(
  existing: string | undefined,
  table: string
): { content: string; status: AgentFileStatus } {
  if (existing === undefined) return { content: table, status: 'written' };
  const eol = eolOf(existing);
  const replacement = withEol(table, eol);
  const lines = existing.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  // A line belongs to the eligian table from its header (or a sub-table header) to the line
  // before the next other header; the blank lines that end it stay with the file.
  const inTable: boolean[] = [];
  let inside = false;
  for (const line of lines) {
    const header = TOML_HEADER.exec(line.replace(/\r?\n$/, ''));
    if (header) inside = isEligianTable(header[1]);
    inTable.push(inside);
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (inTable[i] && isBlank(lines[i]) && !inTable[i + 1]) inTable[i] = false;
  }
  let content = '';
  let replaced = false;
  lines.forEach((line, i) => {
    if (!inTable[i]) content += line;
    else if (!replaced) {
      content += replacement;
      replaced = true;
    }
  });
  if (!replaced) content = appendAfterBlankLine(existing, replacement, eol);
  return { content, status: content === existing ? 'unchanged' : 'updated' };
}

export function mergeMarkedBlock(
  existing: string | undefined,
  block: string
): { content: string; status: AgentFileStatus } {
  const marked = block.includes(BEGIN) ? block : `${BEGIN}\n${block.trimEnd()}\n${END}\n`;
  if (existing === undefined) return { content: marked, status: 'written' };
  const eol = eolOf(existing);
  const text = withEol(marked, eol);
  const begin = existing.indexOf(BEGIN);
  const end = begin < 0 ? -1 : existing.indexOf(END, begin);
  const content =
    end >= 0
      ? existing.slice(0, begin) +
        (text.endsWith(eol) ? text.slice(0, -eol.length) : text) +
        existing.slice(end + END.length)
      : appendAfterBlankLine(existing, text, eol);
  return { content, status: content === existing ? 'unchanged' : 'updated' };
}

export function mergeImportLine(
  existing: string | undefined,
  line: '@AGENTS.md'
): { content: string; status: AgentFileStatus } {
  if (existing === undefined) return { content: `${line}\n`, status: 'written' };
  if (existing.split(/\r?\n/).includes(line)) return { content: existing, status: 'unchanged' };
  const eol = eolOf(existing);
  const base = existing === '' || existing.endsWith('\n') ? existing : existing + eol;
  return { content: `${base}${line}${eol}`, status: 'updated' };
}

/** A file this module owns as a whole (the Cursor rule). */
const wholeFile = (
  existing: string | undefined,
  content: string
): { content: string; status: AgentFileStatus } => ({
  content,
  status: existing === undefined ? 'written' : existing === content ? 'unchanged' : 'updated',
});

const cursorRule = (block: string): string =>
  `---\ndescription: Eligian presentation workflow\nalwaysApply: true\n---\n\n${block}`;

type Merge = (existing: string | undefined) => {
  content?: string;
  status: AgentFileStatus;
  message?: string;
};

/** The files of one client, by project-relative POSIX path (FR-060). */
const clientFiles = (
  client: AgentClient,
  command: ServerCommand,
  block: string
): ReadonlyArray<readonly [string, Merge]> => {
  const json: Merge = existing =>
    mergeJsonServers(existing, jsonKey(client), jsonEntry(client, command));
  switch (client) {
    case 'claude':
      return [
        ['.mcp.json', json],
        ['CLAUDE.md', existing => mergeImportLine(existing, '@AGENTS.md')],
      ];
    case 'cursor':
      return [
        ['.cursor/mcp.json', json],
        ['.cursor/rules/eligian.mdc', existing => wholeFile(existing, cursorRule(block))],
      ];
    case 'vscode':
      return [
        ['.vscode/mcp.json', json],
        ['.github/copilot-instructions.md', existing => mergeMarkedBlock(existing, block)],
      ];
    case 'codex':
      return [
        [
          '.codex/config.toml',
          existing => mergeTomlTable(existing, tomlTable(serverEntry(client, command))),
        ],
      ];
  }
};

const readIfPresent = (file: string): Promise<string | undefined> =>
  fs.readFile(file, 'utf-8').catch((cause: unknown) => {
    if (isRecord(cause) && cause.code === 'ENOENT') return undefined;
    throw cause;
  });

/** The generated AGENTS.md block under `docsRoot` (a directory path or a directory URL; P13). */
const blockFile = (docsRoot: URL | string): string =>
  typeof docsRoot === 'string'
    ? path.join(docsRoot, 'agents-block.md')
    : fileURLToPath(new URL('agents-block.md', docsRoot));

/**
 * The `--client` values of a command (plan E3): absent → `['claude']`; an unknown name gives
 * the usage message of exit 2.
 */
export function parseAgentClients(
  values: readonly string[] | undefined
): { readonly clients: readonly AgentClient[] } | { readonly error: string } {
  if (values === undefined) return { clients: ['claude'] };
  const unknown = values.find(value => !(AGENT_CLIENTS as readonly string[]).includes(value));
  return unknown === undefined
    ? { clients: values as readonly AgentClient[] }
    : { error: `Unknown client '${unknown}'. Use one of: ${AGENT_CLIENTS.join(', ')}` };
}

/** One output line per agent file (the same wording as `eligian init`'s). */
const agentFileLine = ({ file, status, message }: AgentFileResult): string =>
  `Agent file ${file}: ${status}${message === undefined ? '' : ` (${message})`}`;

export interface AgentsSetupOptions {
  /** Resolves `dir`, and where the installed CLI is looked for (`detectServerCommand`) */
  readonly cwd: string;
  /** The generated docs (`agents-block.md`); default: `docs/` next to the bundle */
  readonly docsRoot?: URL | string;
  readonly platform?: NodeJS.Platform;
  readonly exists?: (p: string) => boolean;
}

/**
 * `eligian agents setup [dir] [--client <client>]...` (plan E3): exit 0, 1 when a file was
 * refused, 2 for an unknown client (nothing written).
 */
export async function runAgentsSetup(
  dir: string,
  clients: readonly string[] | undefined,
  options: AgentsSetupOptions
): Promise<{ readonly output: string; readonly exitCode: number }> {
  const parsed = parseAgentClients(clients);
  if ('error' in parsed) return { output: parsed.error, exitCode: 2 };
  const results = await setupAgents(path.resolve(options.cwd, dir), parsed.clients, {
    command: detectServerCommand(options.cwd, options.platform, options.exists),
    docsRoot: options.docsRoot ?? new URL('./docs/', import.meta.url),
  });
  return {
    output: results.map(agentFileLine).join('\n'),
    exitCode: results.some(result => result.status === 'refused') ? 1 : 0,
  };
}

/** Writes every agent file of `clients` into `projectDir` (FR-060, FR-061) */
export async function setupAgents(
  projectDir: string,
  clients: readonly AgentClient[],
  options: { readonly command: ServerCommand; readonly docsRoot: URL | string }
): Promise<readonly AgentFileResult[]> {
  const unique = [...new Set(clients)];
  if (unique.length === 0) return [];
  const block = withEol(await fs.readFile(blockFile(options.docsRoot), 'utf-8'), '\n');
  const files: ReadonlyArray<readonly [string, Merge]> = [
    ...unique.flatMap(client => clientFiles(client, options.command, block)),
    ['AGENTS.md', existing => mergeMarkedBlock(existing, block)],
  ];
  const results: AgentFileResult[] = [];
  for (const [file, merge] of files) {
    const target = path.join(projectDir, ...file.split('/'));
    const { content, status, message } = merge(await readIfPresent(target));
    if (content !== undefined && (status === 'written' || status === 'updated')) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf-8');
    }
    results.push(message === undefined ? { file, status } : { file, status, message });
  }
  return results;
}
