/**
 * The workspace-local `eligian` install and what the MCP registration needs to know about a
 * folder (spec 058 phase 4, plan A2): the version gate (FR-002 (c)(d)), a server the user
 * configured (FR-004, FR-034), and the Install command (FR-035, FR-036). No `vscode` import.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  findPackageManager,
  type PackageManager,
  readPackageManifest,
} from '@eligian/shared-utils';
import { intersects, validRange } from 'semver';

export type { PackageManager };

export const MIN_MAJOR = 1;
export const MIN_MINOR = 1;

const VERSION = /^(\d+)\.(\d+)\./;

/** major.minor ≥ 1.1, numeric; a prerelease of 1.1.0+ counts; missing / unparsable → false (P10). */
export function meetsMinimum(version: unknown): boolean {
  if (typeof version !== 'string') return false;
  const match = VERSION.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > MIN_MAJOR || (major === MIN_MAJOR && minor >= MIN_MINOR);
}

export type EligianInstall =
  | { readonly ok: true; readonly version: string; readonly cliPath: string }
  | {
      readonly ok: false;
      readonly problem: 'missing' | 'bad-version' | 'too-old' | 'no-bin';
      readonly version?: string;
    };

const readText = async (file: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
};

const isFile = async (file: string): Promise<boolean> => {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads <folder>/node_modules/eligian/package.json and checks bin/cli.js (fs.stat).
 *  'missing': no package.json file; 'bad-version': the file exists but is not JSON, or its
 *  `version` is missing or does not match /^(\d+)\.(\d+)\./ (`version` set when it is a string);
 *  'too-old': parsable and below 1.1; 'no-bin': ≥ 1.1 without bin/cli.js. */
export async function readEligianInstall(folderPath: string): Promise<EligianInstall> {
  const packageDir = path.join(folderPath, 'node_modules', 'eligian');
  const text = await readText(path.join(packageDir, 'package.json'));
  if (text === undefined) return { ok: false, problem: 'missing' };
  const manifest = parseJson(text);
  const version = isRecord(manifest) ? manifest.version : undefined;
  if (typeof version !== 'string') return { ok: false, problem: 'bad-version' };
  if (!VERSION.test(version)) return { ok: false, problem: 'bad-version', version };
  if (!meetsMinimum(version)) return { ok: false, problem: 'too-old', version };
  const cliPath = path.join(packageDir, 'bin', 'cli.js');
  if (!(await isFile(cliPath))) return { ok: false, problem: 'no-bin', version };
  return { ok: true, version, cliPath };
}

/** JSON with comments and trailing commas; undefined when it does not parse (P10). */
export function parseJsonc(text: string): unknown | undefined {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      // a string, copied as is (escapes included)
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      out += ' ';
    } else if (ch === '}' || ch === ']') {
      // drop a trailing comma: the last non-blank character written outside a string
      const trimmed = out.trimEnd();
      if (trimmed.endsWith(',')) out = trimmed.slice(0, -1);
      out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return parseJson(out);
}

const CLI_PATH = /(^|[\\/])eligian[\\/]bin[\\/]cli\.js$/;
const NPX_NAME = /^eligian(@.*)?$/;

/** FR-004 (a)/(b) over a `servers` object: key `eligian`, or a stdio server whose args hold
 *  `…eligian/bin/cli.js` (either separator) then `mcp`, or `eligian` / `eligian@…` then `mcp`. */
export function hasEligianServer(servers: unknown): boolean {
  if (!isRecord(servers)) return false;
  if (Object.keys(servers).includes('eligian')) return true;
  return Object.values(servers).some(server => {
    if (!isRecord(server)) return false;
    if (server.type !== undefined && server.type !== 'stdio') return false;
    const args = server.args;
    if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string')) return false;
    for (let i = 0; i + 1 < args.length; i++) {
      if (args[i + 1] === 'mcp' && (CLI_PATH.test(args[i]) || NPX_NAME.test(args[i]))) {
        return true;
      }
    }
    return false;
  });
}

/** <folder>/.vscode/mcp.json: 'configured' | 'none' | 'unparsable' (missing file → 'none'). */
export async function vscodeMcpJsonState(
  folderPath: string
): Promise<'configured' | 'none' | 'unparsable'> {
  const text = await readText(path.join(folderPath, '.vscode', 'mcp.json'));
  if (text === undefined) return 'none';
  const parsed = parseJsonc(text);
  if (parsed === undefined) return 'unparsable';
  return isRecord(parsed) && hasEligianServer(parsed.servers) ? 'configured' : 'none';
}

/** FR-036: a range in the folder's own package.json that admits ≥ 1.1.0 (P10). */
export function admitsMinimum(range: unknown): boolean {
  if (typeof range !== 'string') return false;
  if (range === 'latest') return true;
  if (/^(workspace|file|link):/.test(range)) return false;
  return validRange(range) !== null && intersects(range, `>=${MIN_MAJOR}.${MIN_MINOR}.0`);
}

const PLAIN_INSTALL: Record<PackageManager, string> = {
  pnpm: 'pnpm install',
  yarn: 'yarn install',
  bun: 'bun install',
  npm: 'npm install',
};

const ADD_ELIGIAN: Record<PackageManager, string> = {
  pnpm: 'pnpm add -D eligian@^1.1',
  yarn: 'yarn add -D eligian@^1.1',
  bun: 'bun add -d eligian@^1.1',
  npm: 'npm install --save-dev eligian@^1.1',
};

const declaredRange = (manifest: Record<string, unknown> | undefined, field: string): unknown => {
  const deps = manifest?.[field];
  return isRecord(deps) ? deps.eligian : undefined;
};

/** FR-035 + FR-036: the one line the Install terminal sends. */
export async function installCommand(folderPath: string): Promise<string> {
  const manager = await findPackageManager(folderPath);
  const manifest = await readPackageManifest(folderPath);
  const admits =
    admitsMinimum(declaredRange(manifest, 'devDependencies')) ||
    admitsMinimum(declaredRange(manifest, 'dependencies'));
  return admits ? PLAIN_INSTALL[manager] : ADD_ELIGIAN[manager];
}
