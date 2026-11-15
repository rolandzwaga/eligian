/**
 * The smoke output baseline (spec 058 phase 3, FR-033, SC-009(4); plan P16).
 * Captures `node packages/cli/bin/cli.js smoke <file> --format json` for every
 * file of the corpus, so a later smoke change can prove that programs without
 * a media timeline produce byte-identical output.
 *
 * The corpus: the `smoke:examples` patterns (root `package.json`), plus every
 * `.eligian` under `__fixtures__/mcp/smoke/` and `__fixtures__/mcp/scenario/`
 * without a media timeline (`using video`, `using audio`, `mediaplayer`).
 *
 * Every JSON key named `ms`, `elapsedMs` or `durationMs` is normalised to 0.
 * Each file's capture is `{ exit, stdout }`, written as 2-space JSON to
 * `<out>/<repo-relative path>.json`.
 *
 * Modes (one required):
 * - `--write`: writes the captures;
 * - `--diff`: compares with the written captures, prints `same <file>` or
 *   `DIFF <file>` plus a unified line diff, exits 1 on any difference; a corpus
 *   file with no capture (a fixture added later) prints `new <file>` and passes.
 * `--out <dir>` overrides the output directory (default
 * `specs/058-mcp-server/phase-3-evals-provenance/baseline/smoke-before`).
 *
 * Sequential, sorted, `\n` line endings, no timestamps.
 *
 * Run with tsx: `pnpm exec tsx packages/cli/scripts/capture-smoke-baseline.ts --write`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandPatterns } from '../src/check/check-command.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const cliBin = path.join(repoRoot, 'packages/cli/bin/cli.js');

const DEFAULT_OUT = 'specs/058-mcp-server/phase-3-evals-provenance/baseline/smoke-before';

/** The `smoke:examples` patterns (root `package.json`). */
const SMOKE_EXAMPLES = [
  'examples/**/*.eligian',
  '!examples/libraries/errors/**',
  '!examples/libraries/nested/cycle-*.eligian',
];

/** Fixture directories whose non-media programs join the corpus (P16). */
const FIXTURE_DIRS = [
  'packages/cli/src/__tests__/__fixtures__/mcp/smoke',
  'packages/cli/src/__tests__/__fixtures__/mcp/scenario',
];

const MEDIA = /using\s+(video|audio)\b|mediaplayer/;

const TIME_KEYS = new Set(['ms', 'elapsedMs', 'durationMs']);

const toPosix = (p: string) => p.split(path.sep).join('/');

/** The corpus, repo-relative with `/` separators, sorted, without duplicates. */
async function corpus(): Promise<string[]> {
  const examples = await expandPatterns(SMOKE_EXAMPLES, repoRoot);
  const fixtures = (await expandPatterns(FIXTURE_DIRS, repoRoot)).filter(
    file => !MEDIA.test(fs.readFileSync(file, 'utf8'))
  );
  const relative = [...examples, ...fixtures].map(file => toPosix(path.relative(repoRoot, file)));
  return [...new Set(relative)].sort();
}

/** Replaces the value of every time key, at any depth, by 0. */
function normaliseTimes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normaliseTimes);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, TIME_KEYS.has(key) ? 0 : normaliseTimes(v)])
    );
  }
  return value;
}

/**
 * Normalises the time keys of JSON stdout. Stdout without a time key, and
 * stdout that is not JSON, is kept byte for byte (line endings as `\n`), so
 * the comparison stays byte-level wherever no normalisation is needed.
 */
function normaliseStdout(stdout: string): string {
  const raw = stdout.replace(/\r\n/g, '\n');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const normalised = normaliseTimes(parsed);
  return JSON.stringify(normalised) === JSON.stringify(parsed)
    ? raw
    : `${JSON.stringify(normalised, null, 2)}\n`;
}

/** One file's capture, as the text that goes on disk. */
function capture(file: string): string {
  const result = spawnSync(process.execPath, [cliBin, 'smoke', file, '--format', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  const record = { exit: result.status, stdout: normaliseStdout(result.stdout) };
  return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * A capture as readable lines for the diff: `exit <n>`, then the stdout lines
 * (the record keeps stdout as one JSON string). Text that is not a capture
 * record is shown as is.
 */
function displayLines(text: string): string {
  try {
    const record = JSON.parse(text) as { exit?: unknown; stdout?: unknown };
    if (typeof record.stdout === 'string') return `exit ${String(record.exit)}\n${record.stdout}`;
  } catch {
    // not a capture record
  }
  return text;
}

/** A unified line diff (LCS) of two texts, `-` lines before `+` lines. */
function unifiedDiff(before: string, after: string, label: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const lines: string[] = [`--- ${label} (baseline)`, `+++ ${label} (now)`];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      lines.push(`- ${a[i]}`);
      i++;
    } else {
      lines.push(`+ ${b[j]}`);
      j++;
    }
  }
  return lines.join('\n');
}

function parseArgs(argv: readonly string[]): { mode: 'write' | 'diff'; out: string } {
  const write = argv.includes('--write');
  const diff = argv.includes('--diff');
  if (write === diff) {
    throw new Error('usage: capture-smoke-baseline.ts (--write | --diff) [--out <dir>]');
  }
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : DEFAULT_OUT;
  if (!out) throw new Error('--out needs a directory');
  return { mode: write ? 'write' : 'diff', out: path.resolve(repoRoot, out) };
}

async function main(): Promise<number> {
  const { mode, out } = parseArgs(process.argv.slice(2));
  const files = await corpus();
  let failures = 0;
  for (const file of files) {
    const target = path.join(out, `${file}.json`);
    const text = capture(file);
    if (mode === 'write') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
      console.log(`wrote ${file}`);
      continue;
    }
    if (!fs.existsSync(target)) {
      // A fixture added after the capture has nothing to drift from (ruling of 2026-11-05 on T020)
      console.log(`new ${file} (no baseline at ${toPosix(path.relative(repoRoot, target))})`);
      continue;
    }
    const before = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    if (before === text) {
      console.log(`same ${file}`);
    } else {
      console.log(`DIFF ${file}`);
      console.log(unifiedDiff(displayLines(before), displayLines(text), file));
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
