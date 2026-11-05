/**
 * The eval case start states (spec 058, FR-052; plan C13): under the strict
 * check (`--selector-not-in-layout ids`, lint, review) each start state yields
 * exactly its planted codes, and case 14 hides a controller imbalance behind
 * its two errors.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CheckFileResult } from '@eligian/language';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPaths } from '../check/check-command.js';

const CASES = path.resolve(__dirname, '../../../../evals/mcp/cases');
const startOf = (id: string) => path.join(CASES, id, 'start');

const strictCheck = (files: readonly string[]) =>
  checkPaths(files, { selectorNotInLayout: 'ids', lint: true, review: true });

/** The sorted set of codes of one file's result. */
const codesOf = (result: CheckFileResult): string[] =>
  [...new Set(result.diagnostics.map(d => d.code))].sort();

/** A pinned model id (`claude-sonnet-5-5`), not an alias such as `sonnet` (FR-050). */
const PINNED_MODEL = /^claude-(opus|sonnet|haiku)-\d+(-\d+)*$/;

describe('eval case definitions', () => {
  it.each(['fix-dataflow', 'fix-selectors'])('%s pins its model id', id => {
    const definition = JSON.parse(fs.readFileSync(path.join(CASES, `${id}.json`), 'utf-8')) as {
      model: string;
    };

    expect(definition.model).toMatch(PINNED_MODEL);
  });
});

describe('eval case start states', () => {
  const temps: string[] = [];

  afterAll(() => {
    for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fix-dataflow yields exactly its codes', async () => {
    const results = await strictCheck([path.join(startOf('fix-dataflow'), 'main.eligian')]);

    expect(results).toHaveLength(1);
    for (const result of results) {
      expect(codesOf(result)).toEqual(['erased-property-access', 'missing-action-dependency']);
    }
  });

  it('fix-selectors yields exactly its codes', async () => {
    const results = await strictCheck([path.join(startOf('fix-selectors'), 'main.eligian')]);

    expect(results).toHaveLength(1);
    for (const result of results) {
      expect(codesOf(result)).toEqual([
        'import-duplicate-default',
        'selector_not_in_layout',
        'syntax-error',
      ]);
    }
  });

  it('fix-selectors hides a controller imbalance behind its errors', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-eval-case-'));
    temps.push(tmp);
    fs.cpSync(startOf('fix-selectors'), tmp, { recursive: true });
    const main = path.join(tmp, 'main.eligian');
    const source = fs.readFileSync(main, 'utf-8');
    const lines = source.split(/\r?\n/);
    const kept = lines.filter(line => !line.trimEnd().endsWith('// eval:defect'));
    expect(lines.length - kept.length).toBe(2);
    fs.writeFileSync(main, kept.join('\n'));

    const results = await strictCheck([main]);

    const codes = results.flatMap(codesOf);
    expect(codes).not.toContain('syntax-error');
    expect(codes).not.toContain('import-duplicate-default');
    expect(codes).toContain('controller-imbalance');
  });
});
