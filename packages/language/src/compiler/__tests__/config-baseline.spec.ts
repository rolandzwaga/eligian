/**
 * FR-043 / plan A6: the config baseline helper. The capture (`--write`) and
 * origin.spec.ts compile the corpus with these functions, so the normalisation
 * and the candidate list are pinned here.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { baselineCandidates, compileForBaseline, normaliseIds } from './config-baseline.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// The tour (1,400 lines) compiles in ~2.5 s alone, over 5 s under the full suite's load
const COMPILE_TIMEOUT = 30_000;

describe('normaliseIds', () => {
  it('replaces every UUID-shaped string value with <id>, at any depth', () => {
    const input = {
      id: '3f2a9c1e-7b4d-4e8a-9f01-23456789abcd',
      a: [{ x: 'C0FFEE00-1234-5678-9ABC-DEF012345678' }],
      b: 'not-a-uuid',
      c: 'prefix-3f2a9c1e-7b4d-4e8a-9f01-23456789abcd',
      d: [1, true, null],
    };

    expect(normaliseIds(input)).toEqual({
      id: '<id>',
      a: [{ x: '<id>' }],
      b: 'not-a-uuid',
      c: 'prefix-3f2a9c1e-7b4d-4e8a-9f01-23456789abcd',
      d: [1, true, null],
    });
  });

  it('leaves keys untouched', () => {
    const key = '3f2a9c1e-7b4d-4e8a-9f01-23456789abcd';

    expect(normaliseIds({ [key]: { [key]: 1 } })).toEqual({ [key]: { [key]: 1 } });
  });
});

describe('baselineCandidates', () => {
  it('lists .eligian files under examples/** and the compiler fixtures, sorted', () => {
    const list = baselineCandidates(REPO_ROOT);

    expect(list).toContain('examples/eligian-tour/tour.eligian');
    expect(list).toContain('packages/language/src/compiler/__tests__/__fixtures__/simple.eligian');
    expect(list.every(file => file.endsWith('.eligian'))).toBe(true);
    expect(list.every(file => !file.includes('\\'))).toBe(true);
    expect(list).toEqual([...list].sort());
  });
});

describe('compileForBaseline', () => {
  it(
    'returns pretty JSON with a trailing newline, ids normalised',
    async () => {
      const json = await compileForBaseline(
        path.join(REPO_ROOT, 'examples/eligian-tour/tour.eligian')
      );

      expect(json).toBeDefined();
      expect(json!.endsWith('\n')).toBe(true);
      expect(json).not.toMatch(UUID);
      const parsed = JSON.parse(json!);
      expect(json).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
      expect(parsed.timelines.length).toBeGreaterThan(0);
    },
    COMPILE_TIMEOUT
  );

  it('returns undefined for a file that does not compile', async () => {
    expect(
      await compileForBaseline(path.join(REPO_ROOT, 'examples/libraries/errors/broken.eligian'))
    ).toBeUndefined();
  });
});
