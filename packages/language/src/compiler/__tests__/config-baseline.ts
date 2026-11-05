/**
 * FR-043 / plan A6: the config baseline. The compiled Eligius config of every
 * program in the corpus (examples/** and the compiler fixtures), ids
 * normalised, captured before the provenance change and checked by
 * origin.spec.ts after it.
 *
 * Capture: `pnpm exec tsx packages/language/src/compiler/__tests__/config-baseline.ts --write`
 * writes `__fixtures__/configs-before/<repo-relative path>.json` for each
 * candidate that compiles and lists the rest in `__fixtures__/configs-before/skipped.txt`.
 * It fails (P15) when a captured config holds the repo root, since the baseline
 * is captured on Windows and checked on ubuntu.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect, Exit } from 'effect';
import { compile } from '../pipeline.js';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every UUID-shaped string value (keys excluded) becomes '<id>'. */
export function normaliseIds(value: unknown): Json {
  if (typeof value === 'string') return UUID_SHAPE.test(value) ? '<id>' : value;
  if (Array.isArray(value)) return value.map(normaliseIds);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normaliseIds(entry)])
    );
  }
  return value as Json;
}

/** compile(source, { sourceUri: file }), normalised, as JSON.stringify(value, null, 2) + '\n'; undefined when it fails. */
export async function compileForBaseline(file: string): Promise<string | undefined> {
  const absolute = path.resolve(file);
  const exit = await Effect.runPromiseExit(
    compile(readFileSync(absolute, 'utf-8'), { sourceUri: absolute })
  );
  if (Exit.isFailure(exit)) return undefined;
  return `${JSON.stringify(normaliseIds(exit.value), null, 2)}\n`;
}

function listEligianFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listEligianFiles(full);
    return entry.name.endsWith('.eligian') ? [full] : [];
  });
}

const FIXTURES_DIR = 'packages/language/src/compiler/__tests__/__fixtures__';

/** Every .eligian under examples/** and packages/language/src/compiler/__tests__/__fixtures__/**, sorted. */
export function baselineCandidates(repoRoot: string): string[] {
  return [path.join(repoRoot, 'examples'), path.join(repoRoot, FIXTURES_DIR)]
    .flatMap(listEligianFiles)
    .map(file => path.relative(repoRoot, file).split(path.sep).join('/'))
    .sort();
}

/** The strings of a config that contain the repo root, with either separator (P15). */
function repoRootStrings(json: Json, repoRoot: string): string[] {
  const root = repoRoot.replace(/[\\/]+$/, '').toLowerCase();
  const forms = [root.split('\\').join('/'), root.split('/').join('\\')];
  const found: string[] = [];
  const visit = (value: Json): void => {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (forms.some(form => lower.includes(form))) found.push(value);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(json);
  return found;
}

async function writeBaseline(repoRoot: string): Promise<number> {
  const outDir = path.join(repoRoot, FIXTURES_DIR, 'configs-before');
  const written: { file: string; json: string }[] = [];
  const skipped: string[] = [];
  const leaks: string[] = [];
  // Sequential: the compiler shares one Langium workspace
  for (const file of baselineCandidates(repoRoot)) {
    const json = await compileForBaseline(path.join(repoRoot, file));
    if (json === undefined) {
      skipped.push(file);
      continue;
    }
    for (const leak of repoRootStrings(JSON.parse(json), repoRoot)) {
      leaks.push(`${file}: config string contains the repo root: ${JSON.stringify(leak)}`);
    }
    written.push({ file, json });
  }
  if (leaks.length > 0) {
    for (const leak of leaks) console.error(leak);
    console.error('config baseline NOT written (P15)');
    return 1;
  }
  rmSync(outDir, { recursive: true, force: true });
  for (const { file, json } of written) {
    const target = path.join(outDir, `${file}.json`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, json);
    console.log(`wrote ${file}.json`);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'skipped.txt'), skipped.map(file => `${file}\n`).join(''));
  for (const file of skipped) console.log(`skipped ${file}`);
  console.log(`${written.length} written, ${skipped.length} skipped`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--write')) {
    const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
    process.exitCode = await writeBaseline(repoRoot);
  } else {
    console.error('usage: tsx config-baseline.ts --write');
    process.exitCode = 2;
  }
}
