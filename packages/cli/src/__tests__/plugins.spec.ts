/**
 * Spec 058 Phase 5 (FR-016–FR-020a; SC-008; plan C1–C2): the Claude Code marketplace and its one
 * plugin cannot drift from the CLI. The plugin's server entry is what `serverEntry('claude', npx)`
 * produces (on Windows and on POSIX), its version is the CLI's, the plugin directory holds only
 * `plugin.json`, `.mcp.json` and the hook (`hooks/hooks.json`, `hooks/prefilter.cjs`), and no
 * Cursor or Codex plugin exists. `claude plugin validate --strict` (SC-007) runs locally; these
 * structural checks back it in CI.
 * Spec 059 Phase 3 (FR-022 to FR-025, SC-010): one PreToolUse hook runs the prefilter, whose
 * package spec is the server entry's; the marketplace and the README name `eligian@^1.2`.
 */
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { serverEntry } from '../agents.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const PLUGIN = path.join(REPO, 'plugins', 'claude', 'eligian');
const MARKETPLACE_DIR = path.join(REPO, '.claude-plugin');

const readJson = (file: string): any => JSON.parse(fs.readFileSync(file, 'utf8'));
const PREFILTER = path.join(PLUGIN, 'hooks', 'prefilter.cjs');
const README = path.join(REPO, 'packages', 'cli', 'README.md');

/** Every file under `dir`, recursive, POSIX-relative, dot-files included, sorted. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, '');
  return out.sort();
}

describe('the Claude Code plugin (FR-016, FR-019, SC-008)', () => {
  it('starts the server as serverEntry(claude, npx) on Windows and POSIX', () => {
    const mcp = readJson(path.join(PLUGIN, '.mcp.json'));
    const entry = mcp.mcpServers.eligian;
    expect(entry).toEqual({ ...serverEntry('claude', { form: 'npx', platform: 'win32' }) });
    expect(entry).toEqual({ ...serverEntry('claude', { form: 'npx', platform: 'linux' }) });
    expect(entry.command).not.toBe('node');
    expect(JSON.stringify(entry)).not.toContain('CLAUDE_PROJECT_DIR');
    expect(Object.keys(mcp.mcpServers)).toEqual(['eligian']);
  });

  it('carries the CLI version', () => {
    const plugin = readJson(path.join(PLUGIN, '.claude-plugin', 'plugin.json'));
    const cliPkg = readJson(path.join(REPO, 'packages', 'cli', 'package.json'));
    expect(plugin.version).toBe(cliPkg.version);
  });

  it('holds exactly plugin.json, .mcp.json, hooks/hooks.json and hooks/prefilter.cjs', () => {
    expect(listFiles(PLUGIN)).toEqual([
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'hooks/hooks.json',
      'hooks/prefilter.cjs',
    ]);
  });

  it('hooks.json has one PreToolUse entry with the prefilter command', () => {
    expect(readJson(path.join(PLUGIN, 'hooks', 'hooks.json'))).toEqual({
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

  it("the prefilter's package spec is the server entry's", () => {
    const mcp = readJson(path.join(PLUGIN, '.mcp.json'));
    const prefilter = createRequire(import.meta.url)(PREFILTER) as {
      readonly NPX_GATE_ARGS: readonly string[];
    };
    expect(prefilter.NPX_GATE_ARGS[1]).toBe(mcp.mcpServers.eligian.args[1]);
    expect(prefilter.NPX_GATE_ARGS[1]).toBe('eligian@^1.2');
  });

  it('the prefilter requires only node: builtins', () => {
    const source = fs.readFileSync(PREFILTER, 'utf8');
    const required = [...source.matchAll(/require\(\s*(['"`])([^'"`]+)\1\s*\)/g)].map(m => m[2]);
    expect(required.length).toBeGreaterThan(0);
    for (const id of required) expect(id.startsWith('node:'), id).toBe(true);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it('the marketplace description names eligian@^1.2 and eligian_brief', () => {
    const marketplace = readJson(path.join(MARKETPLACE_DIR, 'marketplace.json'));
    const [entry] = marketplace.plugins;
    expect(entry.description).toContain('eligian@^1.2');
    expect(entry.description).toContain('eligian_brief');
  });

  it('has the marketplace keys and a ./ source that resolves', () => {
    const marketplace = readJson(path.join(MARKETPLACE_DIR, 'marketplace.json'));
    expect(marketplace.name).toBe('eligian');
    expect(marketplace.owner.name).toBe('Roland Zwaga');
    expect(typeof marketplace.description).toBe('string');
    expect(marketplace.plugins).toHaveLength(1);
    const [entry] = marketplace.plugins;
    expect(entry.name).toBe('eligian');
    expect(entry.source.startsWith('./')).toBe(true);
    expect(fs.statSync(path.resolve(REPO, entry.source)).isDirectory()).toBe(true);
    expect(entry.version).toBeUndefined();

    const plugin = readJson(path.join(PLUGIN, '.claude-plugin', 'plugin.json'));
    expect(plugin.name).toBe('eligian');
    expect(plugin.displayName).toBe('Eligian');
    expect(plugin.license).toBe('MIT');
    expect(plugin.author.name).toBe('Roland Zwaga');
    expect(() => new URL(plugin.homepage)).not.toThrow();
    expect(typeof plugin.repository).toBe('string');

    expect(listFiles(MARKETPLACE_DIR)).toEqual(['marketplace.json']);
  });

  it('ships no Cursor or Codex plugin', () => {
    for (const absent of [
      path.join(REPO, '.cursor-plugin'),
      path.join(REPO, '.agents', 'plugins'),
      path.join(REPO, '.codex-plugin'),
      path.join(REPO, 'plugins', 'cursor'),
      path.join(REPO, 'plugins', 'codex'),
      path.join(PLUGIN, '.cursor-plugin'),
      path.join(PLUGIN, '.codex-plugin'),
      path.join(PLUGIN, 'plugin.json'),
      path.join(PLUGIN, 'mcp.json'),
    ]) {
      expect(fs.existsSync(absent), absent).toBe(false);
    }
    expect(fs.readdirSync(path.join(REPO, 'plugins'))).toEqual(['claude']);
  });

  it('the README names the per-project route and the plugin install', () => {
    const readme = fs.readFileSync(README, 'utf8');
    for (const text of [
      '/plugin marketplace add rolandzwaga/eligian',
      '/plugin install eligian@eligian',
      'npx -y eligian@^1.2 mcp',
      'eligian agents setup',
      'eligian init',
      'io.github.rolandzwaga/eligian',
      '/mcp',
    ]) {
      expect(readme, text).toContain(text);
    }
  });

  // A regex, so `grep -rn "eligian@^1\.1"` over the sources finds no stale pin, this test included
  const STALE_PIN = /eligian@\^1\.1/;
  it(`the README names no ${STALE_PIN.source.replace(/\\/g, '')}`, () => {
    expect(fs.readFileSync(README, 'utf8')).not.toMatch(STALE_PIN);
  });
});
