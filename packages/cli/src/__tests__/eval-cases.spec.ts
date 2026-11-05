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
import { parseScenario } from '../smoke/scenario.js';

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

/** The Phase 2 positive cases (spec 058 phase 2, FR-090): no start state, a scenario beside each. */
const PHASE_2_CASES = [
  'title-card',
  'three-chapters',
  'staggered-list',
  'keyboard-deck',
  'library-reuse',
] as const;

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf-8'));

describe('phase 2 cases', () => {
  it.each(PHASE_2_CASES)('%s parses and its scenario decodes with parseScenario', id => {
    const definition = readJson(path.join(CASES, `${id}.json`)) as {
      id: string;
      prompt: string;
      entry: string;
      scenario: string;
    };

    expect(definition.id).toBe(id);
    expect(definition.prompt.length).toBeGreaterThan(0);
    expect(definition.entry).toBe('main.eligian');
    expect(definition.scenario).toBe(`${id}.scenario.json`);
    expect(fs.existsSync(startOf(id))).toBe(false);
    const parsed = parseScenario(readJson(path.join(CASES, definition.scenario)));
    expect(parsed).toMatchObject({ ok: true });
  });

  it('every case pins claude-sonnet-5-5', () => {
    const cases = fs
      .readdirSync(CASES)
      .filter(file => file.endsWith('.json') && !file.endsWith('.scenario.json'));

    expect(cases).toEqual(
      expect.arrayContaining(
        [...PHASE_2_CASES, 'fix-dataflow', 'fix-selectors'].map(id => `${id}.json`)
      )
    );
    for (const file of cases) {
      expect((readJson(path.join(CASES, file)) as { model: string }).model, file).toBe(
        'claude-sonnet-5-5'
      );
    }
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
