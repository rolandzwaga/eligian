/**
 * The tour baseline (spec 059 phase 2, SC-008; plan "Data and generation"). Runs once, on the
 * tree before any Phase 2 change: refuses unless `git diff --quiet 5e47ea9 -- packages/cli/src`
 * exits 0.
 *
 * Copies `examples/eligian-tour/` to a fresh temp directory, starts an in-process MCP server on
 * that copy (`makeServerLayer` through `startInMemoryServer`, the smoke stub CLI of
 * `mcp-server.spec.ts` as `smoke.cliPath`, the docs from `generateKnowledge` in a second temp
 * directory, as `mcp-server.spec.ts` does) and sends exactly four calls:
 * `eligian_check { paths: ['tour.eligian'] }`, `eligian_compile { path: 'tour.eligian',
 * view: 'summary' }`, `eligian_fmt { paths: ['tour.eligian'] }` and
 * `eligian_smoke { paths: ['tour.eligian'] }`.
 *
 * Each whole `ToolCallResult` (`payload`, `isError`, `raw`) goes through `normalizeBaseline` and
 * is written as 2-space JSON, LF, one trailing LF, to
 * `src/__tests__/__fixtures__/mcp/brief/tour-baseline/{check,compile,fmt,smoke}.json`, then
 * `biome format --write` runs on that directory (it is in Biome's scope, so `pnpm check` would
 * otherwise rewrite it). The spec compares parsed values, so the layout never matters to it.
 * `mcp-brief-additions.spec.ts` imports `normalizeBaseline` and applies it to its own results.
 *
 * Run: `pnpm -C packages/language build && pnpm -C packages/cli exec tsx scripts/capture-tour-baseline.ts`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, '..');
const repoRoot = path.resolve(cliRoot, '../..');

/** The commit whose `packages/cli/src` the baseline is captured from (Phase 1). */
const BASE_COMMIT = '5e47ea9';
const TOUR = path.join(repoRoot, 'examples', 'eligian-tour');
const FIXTURES = path.join(cliRoot, 'src', '__tests__', '__fixtures__');
/** The smoke stub CLI of `mcp-server.spec.ts` */
const STUB = path.join(FIXTURES, 'mcp', 'smoke-tool', 'stub-cli.mjs');
const OUT = path.join(FIXTURES, 'mcp', 'brief', 'tour-baseline');
const BIOME = path.join(repoRoot, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');

/** The four calls, by baseline file name. */
export const BASELINE_CALLS: readonly (readonly [string, string, unknown])[] = [
  ['check', 'eligian_check', { paths: ['tour.eligian'] }],
  ['compile', 'eligian_compile', { path: 'tour.eligian', view: 'summary' }],
  ['fmt', 'eligian_fmt', { paths: ['tour.eligian'] }],
  ['smoke', 'eligian_smoke', { paths: ['tour.eligian'] }],
];

const TIME_KEYS = new Set(['ms', 'elapsedMs', 'durationMs']);

/** Every form of `tmp` a result can carry: its `file://` URL, native separators, forward slashes. */
const tmpForms = (tmp: string): string[] => {
  const forms = [pathToFileURL(tmp).href, tmp, tmp.split(path.sep).join('/')];
  // The URL first: it contains the forward-slash form
  return [...new Set(forms)];
};

/**
 * A path under `<TMP>` (up to whitespace, a quote or a separator of a list); its `\` become `/`,
 * so a baseline captured on Windows equals a run on POSIX (CI runs on ubuntu).
 */
const UNDER_TMP = /<TMP>[^\s"'`,;()<>|]*/g;

const replaceAll = (text: string, search: string, replacement: string): string =>
  text.split(search).join(replacement);

/**
 * A JSON text (a tool result's `content[].text`) parsed, if it is one, with the layout it was
 * written in, so it can be written back the same way after normalisation.
 */
const asJsonText = (text: string): { value: unknown; indent: 0 | 2 } | undefined => {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (JSON.stringify(value) === text) return { value, indent: 0 };
  if (JSON.stringify(value, null, 2) === text) return { value, indent: 2 };
  return undefined;
};

/**
 * The SC-008 normalisation, at any depth: every occurrence of the temp directory `tmp` in a
 * string (native separators, forward slashes and its `file://` URL) becomes `<TMP>`, and the
 * separators of the path that follows it become `/` (`UNDER_TMP`); the value
 * of every `header` key becomes `<HEADER>`; the value of every `ms`, `elapsedMs` or `durationMs`
 * key becomes `0` (as `capture-smoke-baseline.ts`). A string that is a JSON text (the
 * `content[].text` of a tool result) is normalised as JSON and written back in its own layout.
 */
export function normalizeBaseline(value: unknown, tmp: string): unknown {
  const forms = tmpForms(tmp);
  const visit = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const json = asJsonText(node);
      if (json !== undefined) {
        const normalised = visit(json.value);
        return json.indent === 0
          ? JSON.stringify(normalised)
          : JSON.stringify(normalised, null, json.indent);
      }
      return forms
        .reduce((text, form) => replaceAll(text, form, '<TMP>'), node)
        .replace(UNDER_TMP, under => under.replace(/\\/g, '/'));
    }
    if (Array.isArray(node)) return node.map(visit);
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([key, v]) => {
          if (key === 'header') return [key, '<HEADER>'];
          if (TIME_KEYS.has(key)) return [key, 0];
          return [key, visit(v)];
        })
      );
    }
    return node;
  };
  return visit(value);
}

/** The text of one baseline file: 2-space JSON, LF, one trailing LF. */
export const baselineText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

async function main(): Promise<number> {
  const diff = spawnSync('git', ['diff', '--quiet', BASE_COMMIT, '--', 'packages/cli/src'], {
    cwd: repoRoot,
  });
  if (diff.status !== 0) {
    process.stderr.write(
      `capture-tour-baseline: packages/cli/src differs from ${BASE_COMMIT} (git diff exit ${String(diff.status)}); the baseline is captured only on the tree before any Phase 2 change\n`
    );
    return 1;
  }

  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-tour-baseline-')));
  const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-tour-baseline-docs-'));
  // Loaded only here, so `normalizeBaseline` can be imported without the server and vitest.
  const { generateKnowledge } = await import('./generate-knowledge.js');
  const { startInMemoryServer } = await import('../src/__tests__/mcp-test-client.js');
  try {
    fs.cpSync(TOUR, tmp, { recursive: true });
    await generateKnowledge({ outDir: docsRoot });
    const server = await startInMemoryServer({ cwd: tmp, docsRoot, smoke: { cliPath: STUB } });
    try {
      fs.mkdirSync(OUT, { recursive: true });
      for (const [file, tool, args] of BASELINE_CALLS) {
        const result = await server.callTool(tool, args);
        const target = path.join(OUT, `${file}.json`);
        fs.writeFileSync(target, baselineText(normalizeBaseline(result, tmp)));
        process.stderr.write(
          `capture-tour-baseline: ${tool} isError=${String(result.isError)} → ${path.relative(repoRoot, target)}\n`
        );
      }
    } finally {
      await server.close();
    }
    // `__fixtures__` JSON is in Biome's scope (biome.json `files.includes`): written in its
    // layout, so `pnpm check` leaves the baseline byte for byte as captured.
    const biome = spawnSync(process.execPath, [BIOME, 'format', '--write', OUT], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (biome.status !== 0) {
      process.stderr.write(`capture-tour-baseline: biome format exited ${String(biome.status)}\n`);
      return 1;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
  }
  return 0;
}

const isMain = (): boolean => {
  const script = process.argv[1];
  if (script === undefined) return false;
  const self = fileURLToPath(import.meta.url);
  const same = (a: string, b: string): boolean =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  return same(path.resolve(script), self) || same(path.resolve(script), self.replace(/\.ts$/, ''));
};

if (isMain()) {
  main().then(
    code => process.exit(code),
    (error: unknown) => {
      process.stderr.write(
        `capture-tour-baseline: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
      );
      process.exit(2);
    }
  );
}
