/**
 * Reference solutions, part 1 of 3 (see `mcp-solutions-harness.ts`): the partition check, the
 * port-from-json source with its scenario (plan F4) and the solutions of `SOLUTION_PARTS[0]`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireFreshBundle } from './fresh-bundle.js';
import {
  CASE_IDS,
  describeSolutions,
  PORT_SOURCE,
  SOLUTION_PARTS,
  SOLUTIONS,
  useSolutionsHarness,
} from './mcp-solutions-harness.js';

const harness = useSolutionsHarness();

describe('the solution set', () => {
  it('the solution count is 14, the parts name every case exactly once', () => {
    expect(CASE_IDS).toHaveLength(14);
    const solutions = fs
      .readdirSync(SOLUTIONS, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
    expect(solutions).toEqual(CASE_IDS);
    expect(SOLUTION_PARTS.flat().sort()).toEqual(CASE_IDS);
  });
});

describe('the port-from-json source', () => {
  beforeAll(() => requireFreshBundle());

  it('passes the gate steps with its scenario (plan F4)', () => {
    const dir = path.join(harness.tmp(), 'port-source');
    fs.cpSync(PORT_SOURCE, dir, { recursive: true });
    const result = harness.gate('port-from-json', dir);
    expect(result.failures).toEqual([]);
    for (const assertion of result.assertions) {
      expect(assertion.pass, `${assertion.kind}: ${assertion.detail}`).toBe(true);
    }
  }, 120_000);
});

describeSolutions(SOLUTION_PARTS[0], harness);
