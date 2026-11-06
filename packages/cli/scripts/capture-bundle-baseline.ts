/**
 * The bundle output baseline (spec 058 phase 4, FR-013 / FR-015, SC-010 (1);
 * plan P5, P6). Captures `node packages/cli/bin/cli.js compile <file> --bundle`
 * for every program of the corpus, so a later runtime-bundler change can prove
 * that `bundle.js` stays byte-identical apart from `DEV_HOOK_SNIPPET`.
 *
 * The corpus: every `.eligian` matched by the `smoke:examples` patterns (root
 * `package.json`) whose first statement is not `library <name>`.
 *
 * Normalisation (P6): the esbuild entry comment
 * (`// <tmp>/eligian-bundle-<rand>/entry-<ms>.js`) becomes `// <entry>`, and
 * every UUID becomes `<uuid>`. Each capture is written to
 * `<out>/<repo-relative path>.bundle.js`.
 *
 * Modes (one required):
 * - `--write`: writes the captures;
 * - `--diff`: when `packages/cli/src/bundler/runtime-bundler.ts` exports
 *   `DEV_HOOK_SNIPPET`, requires it exactly once in each new bundle and removes
 *   that occurrence; then normalises and compares with the written capture,
 *   printing `same <file>` or `DIFF <file>` with the first differing line
 *   (number and both lines); exits 1 on any difference or missing capture.
 * `--out <dir>` overrides the output directory (default
 * `specs/058-mcp-server/phase-4-editor-dev-polish/baseline/bundle-before`).
 *
 * Sequential, sorted, run from the repo root (the module-path comments of the
 * bundle are relative to it).
 *
 * Run with tsx: `pnpm exec tsx packages/cli/scripts/capture-bundle-baseline.ts --write`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandPatterns } from '../src/check/check-command.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const cliBin = path.join(repoRoot, 'packages/cli/bin/cli.js');

const DEFAULT_OUT = 'specs/058-mcp-server/phase-4-editor-dev-polish/baseline/bundle-before';

const ENTRY_COMMENT = /^\/\/ .*eligian-bundle-[^\\/]+[\\/]entry-\d+\.js$/m;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const toPosix = (p: string) => p.split(path.sep).join('/');

/** The `smoke:examples` patterns, read from the root `package.json`. */
function smokeExamplePatterns(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const script = pkg.scripts?.['smoke:examples'];
  if (!script) throw new Error('root package.json has no smoke:examples script');
  const patterns = [...script.matchAll(/"([^"]+)"/g)].map(match => match[1]);
  if (patterns.length === 0) throw new Error(`no patterns in smoke:examples: ${script}`);
  return patterns;
}

/** Whether the first statement (after comments and whitespace) is `library <name>`. */
function isLibrary(source: string): boolean {
  let rest = source.replace(/^﻿/, '');
  for (;;) {
    const trimmed = rest.replace(/^\s+/, '');
    if (trimmed.startsWith('//')) {
      const end = trimmed.indexOf('\n');
      rest = end < 0 ? '' : trimmed.slice(end + 1);
    } else if (trimmed.startsWith('/*')) {
      const end = trimmed.indexOf('*/');
      rest = end < 0 ? '' : trimmed.slice(end + 2);
    } else {
      return /^library\s+[A-Za-z_]/.test(trimmed);
    }
  }
}

/** The corpus, repo-relative with `/` separators, sorted, without duplicates. */
async function corpus(): Promise<string[]> {
  const files = (await expandPatterns(smokeExamplePatterns(), repoRoot)).filter(
    file => !isLibrary(fs.readFileSync(file, 'utf8'))
  );
  return [...new Set(files.map(file => toPosix(path.relative(repoRoot, file))))].sort();
}

/** P6: the entry comment and every UUID. */
function normalise(bundle: string): string {
  return bundle.replace(ENTRY_COMMENT, '// <entry>').replace(UUID, '<uuid>');
}

/** One file's raw `bundle.js`, compiled into a temp dir that is removed afterwards. */
function compileBundle(file: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-bundle-baseline-'));
  try {
    const result = spawnSync(
      process.execPath,
      [cliBin, 'compile', file, '--bundle', '-o', tmp, '--force'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`compile --bundle ${file} exited ${result.status}:\n${result.stderr}`);
    }
    return fs.readFileSync(path.join(tmp, 'bundle.js'), 'utf8');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** `DEV_HOOK_SNIPPET` when `runtime-bundler.ts` exports it, else undefined. */
async function devHookSnippet(): Promise<string | undefined> {
  const module = (await import('../src/bundler/runtime-bundler.js')) as Record<string, unknown>;
  const snippet = module.DEV_HOOK_SNIPPET;
  if (snippet === undefined) return undefined;
  if (typeof snippet !== 'string' || snippet === '') {
    throw new Error('DEV_HOOK_SNIPPET is exported but is not a non-empty string');
  }
  return snippet;
}

/** The number of non-overlapping occurrences of `needle` in `text`. */
function occurrences(text: string, needle: string): number {
  let count = 0;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
    count++;
  }
  return count;
}

/** The first differing line (1-based) of two texts, with both lines. */
function firstDifference(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const show = (line: string | undefined) => (line === undefined ? '<end of file>' : line);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `  line ${i + 1}\n  - baseline: ${show(a[i])}\n  + now:      ${show(b[i])}`;
    }
  }
  return '  (no line differs)';
}

function parseArgs(argv: readonly string[]): { mode: 'write' | 'diff'; out: string } {
  const write = argv.includes('--write');
  const diff = argv.includes('--diff');
  if (write === diff) {
    throw new Error('usage: capture-bundle-baseline.ts (--write | --diff) [--out <dir>]');
  }
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : DEFAULT_OUT;
  if (!out) throw new Error('--out needs a directory');
  return { mode: write ? 'write' : 'diff', out: path.resolve(repoRoot, out) };
}

async function main(): Promise<number> {
  const { mode, out } = parseArgs(process.argv.slice(2));
  const files = await corpus();
  const snippet = mode === 'diff' ? await devHookSnippet() : undefined;
  if (mode === 'diff') {
    console.log(
      snippet === undefined
        ? 'DEV_HOOK_SNIPPET: not exported, nothing removed'
        : `DEV_HOOK_SNIPPET: exported (${snippet.length} chars), removed once per bundle`
    );
  }
  let failures = 0;
  for (const file of files) {
    const target = path.join(out, `${file}.bundle.js`);
    let bundle = compileBundle(file);
    if (mode === 'write') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, normalise(bundle));
      console.log(`wrote ${file}`);
      continue;
    }
    if (snippet !== undefined) {
      const count = occurrences(bundle, snippet);
      if (count !== 1) {
        console.log(`DIFF ${file}\n  DEV_HOOK_SNIPPET occurs ${count} times (expected exactly 1)`);
        failures++;
        continue;
      }
      bundle = bundle.replace(snippet, () => '');
    }
    if (!fs.existsSync(target)) {
      console.log(`DIFF ${file}\n  no baseline at ${toPosix(path.relative(repoRoot, target))}`);
      failures++;
      continue;
    }
    const before = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    const now = normalise(bundle).replace(/\r\n/g, '\n');
    if (before === now) {
      console.log(`same ${file}`);
    } else {
      console.log(`DIFF ${file}\n${firstDifference(before, now)}`);
      failures++;
    }
  }
  console.error(`${files.length} files, ${mode === 'write' ? 'written' : `${failures} differ`}`);
  return failures === 0 ? 0 : 1;
}

main().then(
  code => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
);
