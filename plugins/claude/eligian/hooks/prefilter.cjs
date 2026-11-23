'use strict';
/**
 * The eligian plugin's PreToolUse hook (spec 059 phase 3, FR-047). It runs on every Write, Edit
 * and MultiEdit in every project, so it decides nothing itself: it exits 0 at once unless the
 * target is one of the four kinds `eligian brief gate` guards, and otherwise pipes the hook input
 * unchanged to `npx -y eligian@^1.2 brief gate`, passing its exit code and stderr through.
 * Dependency-free: `node:` builtins only. Nothing is written to stdout.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** The plugin's package spec (the one of its `.mcp.json` server entry, FR-024). */
const NPX_GATE_ARGS = ['-y', 'eligian@^1.2', 'brief', 'gate'];

const GUARDED_TOOLS = ['Write', 'Edit', 'MultiEdit'];
const SETTINGS_FILES = ['settings.json', 'settings.local.json'];

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The last two segments of `file`, lower-cased, split on either separator. */
function lastTwo(file) {
  const segments = file
    .toLowerCase()
    .split(/[\\/]/)
    .filter(s => s !== '' && s !== '.');
  return [segments[segments.length - 2], segments[segments.length - 1]];
}

/**
 * FR-047: one of the four kinds, case-insensitively, either separator, on every platform. The path
 * is read as written and as both path flavours resolve it against the input's cwd (as the CLI
 * does), so the prefilter forwards a superset of what `hookDecision` can block.
 */
function guarded(input) {
  if (!isRecord(input) || !GUARDED_TOOLS.includes(input.tool_name)) return false;
  const toolInput = input.tool_input;
  if (!isRecord(toolInput) || typeof toolInput.file_path !== 'string') return false;
  const file = toolInput.file_path;
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const forms = [file, path.posix.resolve(cwd, file), path.win32.resolve(cwd, file)];
  return forms.some(form => {
    const [parent, base] = lastTwo(form);
    if (base === undefined) return false;
    return (
      base === 'brief.md' ||
      (input.tool_name === 'Write' && base.endsWith('.eligian')) ||
      (parent === '.claude' && SETTINGS_FILES.includes(base)) ||
      (parent === '.eligian' && base === 'programs.json')
    );
  });
}

/** `env[name]` with the key matched case-insensitively (Windows spells it `Path`). */
function envValue(env, name) {
  const key = Object.keys(env).find(k => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/**
 * P17: the first PATH × PATHEXT match on win32 (PATH key matched case-insensitively); undefined if
 * none. Only called on win32.
 */
function findOnPath(name, env, platform, exists = fs.existsSync) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const dirs = (envValue(env, 'PATH') ?? '')
    .split(';')
    .map(dir => dir.replace(/^"(.*)"$/, '$1'))
    .filter(dir => dir !== '');
  const exts = (envValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(ext => ext !== '');
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = p.join(dir, name + ext);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * P3: { command, args, shell } per platform. On win32 `npx` is a `.cmd` shim started through
 * `cmd.exe`, which reads an unquoted `^` as its escape character, so the caret and the found path
 * are quoted into one command line.
 */
function npxInvocation(platform, npxPath) {
  if (platform === 'win32') {
    const args = NPX_GATE_ARGS.map(arg => (arg.includes('^') ? `"${arg}"` : arg));
    return { command: [`"${npxPath}"`, ...args].join(' '), args: [], shell: true };
  }
  return { command: 'npx', args: NPX_GATE_ARGS, shell: false };
}

/**
 * P17: the invocation, or the one-line cannot-start message. On win32 a missing `npx` is found
 * before the spawn (`cmd.exe` always starts); elsewhere a missing `npx` is `ENOENT` on 'error'.
 */
function startGate(platform, env, which = findOnPath) {
  if (platform !== 'win32') return npxInvocation(platform);
  const found = which('npx', env, 'win32');
  return found === undefined
    ? { error: 'eligian hook: cannot start npx (not found on PATH)' }
    : npxInvocation('win32', found);
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function main() {
  const stdin = await readAll(process.stdin);
  let input;
  try {
    input = JSON.parse(stdin.toString('utf8'));
  } catch {
    process.exit(0);
  }
  if (!guarded(input)) process.exit(0);
  let settled = false;
  const finish = code => {
    if (settled) return;
    settled = true;
    process.exit(code);
  };
  const cannotStart = line => {
    if (settled) return;
    settled = true;
    process.stderr.write(`${line}\n`, () => process.exit(1));
  };
  const start = startGate(process.platform, process.env);
  if ('error' in start) return cannotStart(start.error);
  const child = spawn(start.command, start.args, {
    shell: start.shell,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  child.on('error', error => cannotStart(`eligian hook: cannot start npx (${error.message})`));
  child.on('close', code => finish(code ?? 1));
  // A gate that exits before reading all of stdin must not crash the hook (EPIPE).
  child.stdin.on('error', () => {});
  child.stdin.end(stdin);
}

module.exports = { NPX_GATE_ARGS, guarded, findOnPath, npxInvocation, startGate };

if (require.main === module) main();
