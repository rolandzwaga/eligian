/**
 * Spec 058 Phase 3 (FR-040–FR-043, SC-011): every emitted operation carries the
 * construct that generated it (`origin`) in the Eligian map, never in the
 * compiled config, and the compiled configs of the FR-043 corpus are unchanged
 * by the provenance change (the committed `__fixtures__/configs-before/` baseline).
 *
 * `__fixtures__/origins/*.eligian` holds one program per origin value.
 */

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Exit } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EligianMap } from '../eligian-map.js';
import { compileWithMap, OPERATION_ORIGINS, type OperationOrigin } from '../index.js';
import { compileForBaseline } from './config-baseline.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const BASELINE_DIR = path.join(FIXTURES, 'configs-before');
const ORIGINS_DIR = path.join(FIXTURES, 'origins');
// The tour (1,400 lines) compiles in ~2.5 s alone, over 5 s under the full suite's load
const COMPILE_TIMEOUT = 30_000;
const CORPUS_TIMEOUT = 180_000;

function listJson(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJson(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

/** The committed baseline files, as [repo-relative source path, baseline file]. */
const BASELINES: [string, string][] = listJson(BASELINE_DIR)
  .map((file): [string, string] => [
    path
      .relative(BASELINE_DIR, file)
      .split(path.sep)
      .join('/')
      .replace(/\.json$/, ''),
    file,
  ])
  .sort(([a], [b]) => a.localeCompare(b));

/** The origin fixtures (top level only: `lib/` holds a library they import). */
const ORIGIN_FIXTURES: string[] = readdirSync(ORIGINS_DIR)
  .filter(name => name.endsWith('.eligian'))
  .sort();

type Compiled = { readonly config: IEngineConfiguration; readonly map: EligianMap };

/** compileWithMap from disk; a compile failure fails the test with its error. */
async function compiled(file: string): Promise<Compiled> {
  const exit = await Effect.runPromiseExit(
    compileWithMap(readFileSync(file, 'utf-8'), { sourceUri: file })
  );
  if (Exit.isFailure(exit)) {
    throw new Error(`${file} does not compile: ${JSON.stringify(exit.cause)}`);
  }
  return exit.value;
}

/** Every operation of a map, with the action that holds it. */
function mapOperations(map: EligianMap) {
  return Object.entries(map.actions).flatMap(([id, action]) =>
    (['start', 'end'] as const).flatMap(phase =>
      action[phase].map((op, index) => ({ id, name: action.name, phase, index, op }))
    )
  );
}

describe('origin', () => {
  const origins = new Map<string, Compiled>();

  beforeAll(async () => {
    // Sequential: the compiler shares one Langium workspace
    for (const name of ORIGIN_FIXTURES) {
      origins.set(name, await compiled(path.join(ORIGINS_DIR, name)));
    }
  }, CORPUS_TIMEOUT);

  it(
    'every operation of every example and compiler fixture has an origin',
    async () => {
      const misses: string[] = [];
      const check = (label: string, map: EligianMap) => {
        for (const { name, phase, index, op } of mapOperations(map)) {
          if (op.origin === undefined)
            misses.push(`${label}: ${name} ${phase}[${index}] ${op.systemName}`);
        }
      };
      for (const [source] of BASELINES) {
        check(source, (await compiled(path.join(REPO_ROOT, source))).map);
      }
      for (const [name, { map }] of origins) check(`origins/${name}`, map);

      expect(BASELINES.length).toBeGreaterThan(0);
      expect(misses).toEqual([]);
    },
    CORPUS_TIMEOUT
  );

  it.each(OPERATION_ORIGINS)('origin %s occurs', origin => {
    const seen = new Set<OperationOrigin | undefined>(
      [...origins.values()].flatMap(({ map }) => mapOperations(map).map(({ op }) => op.origin))
    );

    expect(seen.has(origin)).toBe(true);
  });

  it('lifecycle re-tags only source operations', () => {
    const { map } = origins.get('lifecycle.eligian')!;
    const lifecycle = Object.values(map.actions).filter(
      action => action.name === 'timeline-lifecycle'
    );

    expect(lifecycle).toHaveLength(1);
    expect(lifecycle[0].start.map(op => [op.systemName, op.origin])).toEqual([
      ['selectElement', 'lifecycle'],
      ['addClass', 'lifecycle'],
      ['selectElement', 'interaction'],
      ['getControllerInstance', 'interaction'],
      ['addControllerToElement', 'interaction'],
    ]);
  });

  it('the origin never reaches the compiled config', () => {
    for (const { config } of origins.values()) {
      expect(JSON.stringify(config)).not.toContain('"origin"');
    }
  });
});

describe('config baseline', () => {
  it.each(BASELINES)(
    '%s compiles to the committed config',
    async (source, baselineFile) => {
      expect(await compileForBaseline(path.join(REPO_ROOT, source))).toBe(
        readFileSync(baselineFile, 'utf8')
      );
    },
    COMPILE_TIMEOUT
  );
});
