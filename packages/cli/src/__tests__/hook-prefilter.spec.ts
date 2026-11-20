/**
 * Spec 059 Phase 3 (FR-022, FR-047, SC-022; plan §6, P3, P17, Q1): the Claude Code plugin's hook.
 *
 * `plugins/claude/eligian/hooks/prefilter.cjs` runs on every `Write` / `Edit` / `MultiEdit` in
 * every project. It starts `npx -y eligian@^1.2 brief gate` only for the four guarded kinds of
 * target and must never let through a write that `hookDecision` blocks: (a) runs it over every
 * blocking case of the shared `HOOK_CASES` table with a stub `npx` first on `PATH`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hookDecision } from '../mcp/brief/hook-gate.js';
import { HOOK_CASES, type HookCase, prepareHookCase } from './hook-cases.js';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const HOOKS = path.join(REPO, 'plugins', 'claude', 'eligian', 'hooks');
const PREFILTER = path.join(HOOKS, 'prefilter.cjs');
const GATE_ARGV = ['-y', 'eligian@^1.2', 'brief', 'gate'];
const SLOW = 120_000;

const pre = createRequire(import.meta.url)(PREFILTER);

const temps: string[] = [];

const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Appends `{ argv, stdin }` to `STUB_MARKER`, writes `STUB_STDERR`, exits `STUB_EXIT`. */
const STUB = `'use strict';
const fs = require('node:fs');
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const stdin = Buffer.concat(chunks).toString('utf8');
  fs.appendFileSync(process.env.STUB_MARKER, JSON.stringify({ argv: process.argv.slice(2), stdin }) + '\\n');
  process.stderr.write(process.env.STUB_STDERR ?? '', () => process.exit(Number(process.env.STUB_EXIT ?? 0)));
});
`;

interface Stub {
  readonly bin: string;
  readonly marker: string;
}

/** A temp `bin/` holding a stub `npx` (`npx.cmd` on Windows) and the marker file it appends to. */
function stubNpx(): Stub {
  const root = tempDir('eligian-prefilter-');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'stub.cjs'), STUB);
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(bin, 'npx.cmd'), '@node "%~dp0stub.cjs" %*\r\n');
  } else {
    const npx = path.join(bin, 'npx');
    fs.writeFileSync(npx, '#!/bin/sh\nexec node "$(dirname "$0")/stub.cjs" "$@"\n');
    fs.chmodSync(npx, 0o755);
  }
  return { bin, marker: path.join(root, 'marker.ndjson') };
}

/** The key the OS spells `PATH` with (`Path` on Windows), kept so the child sees one key. */
const PATH_KEY = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';

/** `process.env` with `PATH` replaced by `dirs` and the stub's variables set. */
function envWith(
  dirs: readonly string[],
  extra: Readonly<Record<string, string>> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() !== 'PATH' && !key.startsWith('STUB_')) env[key] = value;
  }
  env[PATH_KEY] = dirs.join(path.delimiter);
  return { ...env, ...extra };
}

const NODE_DIR = path.dirname(process.execPath);

/** The stub first on `PATH`, then the node directory (the stub runs `node`). */
const stubEnv = (stub: Stub, extra: Readonly<Record<string, string>> = {}) =>
  envWith([stub.bin, NODE_DIR], { STUB_MARKER: stub.marker, ...extra });

const runPrefilter = (stdin: string, env: NodeJS.ProcessEnv, cwd?: string) =>
  spawnSync(process.execPath, [PREFILTER], { input: stdin, env, cwd, encoding: 'utf8' });

const invocations = (stub: Stub): { argv: string[]; stdin: string }[] =>
  fs.existsSync(stub.marker)
    ? fs
        .readFileSync(stub.marker, 'utf8')
        .split('\n')
        .filter(line => line !== '')
        .map(line => JSON.parse(line))
    : [];

const stdinOf = (input: unknown): string =>
  typeof input === 'string' ? input : JSON.stringify(input);

/** A guarded input (rule 1's target), for the pass-through cases. */
const FORWARDED = JSON.stringify({
  tool_name: 'Write',
  tool_input: { file_path: '/proj/talk/BRIEF.md', content: '# x\n' },
});

describe('(a) forwards every blocked input of HOOK_CASES byte-identical to npx -y eligian@^1.2 brief gate', () => {
  it.each(HOOK_CASES.map(hookCase => [hookCase.name, hookCase] as const))(
    '%s',
    async (_name: string, hookCase: HookCase) => {
      const prepared = await prepareHookCase(hookCase);
      try {
        const decision = await hookDecision(
          prepared.input,
          prepared.env,
          hookCase.platform ?? process.platform
        );
        if (!decision.block) return;
        const stub = stubNpx();
        const stdin = stdinOf(prepared.input);
        const result = runPrefilter(stdin, stubEnv(stub), prepared.project);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toBe('');
        expect(invocations(stub)).toEqual([{ argv: GATE_ARGV, stdin }]);
      } finally {
        prepared.cleanup();
      }
    },
    SLOW
  );
});

describe('(b) exits 0 at once on none of the four kinds', () => {
  const write = (file: string) => ({
    tool_name: 'Write',
    tool_input: { file_path: file, content: 'x' },
  });
  const cases: readonly (readonly [string, string])[] = [
    [
      'Read',
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/proj/talk/BRIEF.md' } }),
    ],
    ['Write of notes.txt', JSON.stringify(write('/proj/notes.txt'))],
    ['settings.json outside .claude', JSON.stringify(write('/proj/settings.json'))],
    ['.claude/other.json', JSON.stringify(write('/proj/.claude/other.json'))],
    ['other/programs.json', JSON.stringify(write('/proj/other/programs.json'))],
    [
      'Edit of x.eligian',
      JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: '/proj/x.eligian', old_string: 'a', new_string: 'b' },
      }),
    ],
    ['stdin not json', 'not json'],
    ['a missing file_path', JSON.stringify({ tool_name: 'Write', tool_input: { content: 'x' } })],
  ];

  it.each(cases)('%s', (_name, stdin) => {
    const stub = stubNpx();
    const result = runPrefilter(stdin, stubEnv(stub));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(fs.existsSync(stub.marker)).toBe(false);
  });
});

describe("(c) passes the CLI's exit code and stderr through", () => {
  it('the gate exits 2 with a reason: exit 2, the same stderr, empty stdout', () => {
    const stub = stubNpx();
    const result = runPrefilter(
      FORWARDED,
      stubEnv(stub, { STUB_EXIT: '2', STUB_STDERR: 'blocked: x' })
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toBe('blocked: x');
    expect(result.stdout).toBe('');
    expect(invocations(stub)).toEqual([{ argv: GATE_ARGV, stdin: FORWARDED }]);
  });

  it('the gate exits 0: exit 0', () => {
    const stub = stubNpx();
    const result = runPrefilter(FORWARDED, stubEnv(stub, { STUB_EXIT: '0' }));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');
  });
});

describe('(d) exits 1 with one line when npx cannot start', () => {
  it('no npx on PATH: exit 1, one stderr line, empty stdout', () => {
    // Only an empty directory: the node directory itself holds a real `npx` on most installs.
    const empty = tempDir('eligian-prefilter-empty-');
    const result = runPrefilter(FORWARDED, envWith([empty]));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n').filter(line => line !== '');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^eligian hook: cannot start npx/);
  });

  it('(d, win32 branch on every OS) startGate with a which that finds nothing returns the one-line error', () => {
    expect(pre.startGate('win32', { PATH: 'C:\\x' }, () => undefined)).toEqual({
      error: 'eligian hook: cannot start npx (not found on PATH)',
    });
  });

  it('(d, win32 branch on every OS) startGate with a which that finds C:\\x\\npx.cmd returns the quoted command line', () => {
    expect(pre.startGate('win32', { PATH: 'C:\\x' }, () => 'C:\\x\\npx.cmd')).toEqual({
      command: '"C:\\x\\npx.cmd" -y "eligian@^1.2" brief gate',
      args: [],
      shell: true,
    });
  });

  it('startGate off win32 makes no lookup', () => {
    const which = () => {
      throw new Error('looked up');
    };
    expect(pre.startGate('linux', {}, which)).toEqual({
      command: 'npx',
      args: GATE_ARGV,
      shell: false,
    });
  });
});

describe('findOnPath', () => {
  const recorder = (found: readonly string[]) => {
    const calls: string[] = [];
    const exists = (file: string) => {
      calls.push(file);
      return found.includes(file);
    };
    return { calls, exists };
  };

  it('walks PATH × PATHEXT in order', () => {
    const { calls, exists } = recorder(['C:\\b\\npx.EXE', 'C:\\b\\npx.CMD']);
    const env = { PATH: 'C:\\a;C:\\b', PATHEXT: '.EXE;.CMD' };
    expect(pre.findOnPath('npx', env, 'win32', exists)).toBe('C:\\b\\npx.EXE');
    expect(calls).toEqual(['C:\\a\\npx.EXE', 'C:\\a\\npx.CMD', 'C:\\b\\npx.EXE']);
  });

  it('matches the Path key case-insensitively', () => {
    const { exists } = recorder(['C:\\a\\npx.CMD']);
    expect(pre.findOnPath('npx', { Path: 'C:\\a', PathExt: '.CMD' }, 'win32', exists)).toBe(
      'C:\\a\\npx.CMD'
    );
  });

  it('defaults PATHEXT to .COM;.EXE;.BAT;.CMD', () => {
    const { calls, exists } = recorder([]);
    pre.findOnPath('npx', { PATH: 'C:\\a' }, 'win32', exists);
    expect(calls).toEqual(['C:\\a\\npx.COM', 'C:\\a\\npx.EXE', 'C:\\a\\npx.BAT', 'C:\\a\\npx.CMD']);
  });

  it('undefined when nothing exists', () => {
    const { exists } = recorder([]);
    expect(pre.findOnPath('npx', { PATH: 'C:\\a;C:\\b' }, 'win32', exists)).toBeUndefined();
  });
});

describe('npxInvocation', () => {
  it('NPX_GATE_ARGS is -y eligian@^1.2 brief gate', () => {
    expect(pre.NPX_GATE_ARGS).toEqual(GATE_ARGV);
  });

  it('win32 quotes the caret and the npx path (P3)', () => {
    expect(pre.npxInvocation('win32', 'C:\\Program Files\\nodejs\\npx.cmd')).toEqual({
      command: '"C:\\Program Files\\nodejs\\npx.cmd" -y "eligian@^1.2" brief gate',
      args: [],
      shell: true,
    });
  });

  it('linux runs npx with the args and no shell', () => {
    expect(pre.npxInvocation('linux')).toEqual({
      command: 'npx',
      args: GATE_ARGV,
      shell: false,
    });
  });
});

describe('(e) requires only node: builtins', () => {
  it('every require(…) in prefilter.cjs names a node: module', () => {
    const text = fs.readFileSync(PREFILTER, 'utf8');
    const literal = [...text.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)].map(m => m[2]);
    expect(literal.length).toBeGreaterThan(0);
    expect(literal.length).toBe((text.match(/\brequire\(/g) ?? []).length);
    for (const name of literal) expect(name).toMatch(/^node:/);
  });
});

describe('hooks.json (FR-022)', () => {
  it('is exactly one PreToolUse entry running the prefilter in the args form (P4)', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(HOOKS, 'hooks.json'), 'utf8'));
    expect(hooks).toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write|Edit|MultiEdit',
            hooks: [
              {
                type: 'command',
                command: 'node',
                // biome-ignore lint/suspicious/noTemplateCurlyInString: Claude Code's literal variable
                args: ['${CLAUDE_PLUGIN_ROOT}/hooks/prefilter.cjs'],
              },
            ],
          },
        ],
      },
    });
  });
});
