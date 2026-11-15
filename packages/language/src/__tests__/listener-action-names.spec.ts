/**
 * Listener action names (spec 058, Phase 2: FR-055, Q3; SC-010 (1)–(3)).
 *
 * `addController("DOMEventListenerController" | "KeyboardController", …, [ … ])` names actions by
 * string; each name (an `end:` prefix stripped) must be an action the program can reach. Checked
 * through `checkFiles`, since the fixtures import a real layout file. `checkFiles` shares one
 * Langium workspace, so every call is awaited before the next.
 */

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { CheckDiagnostic } from '../compiler/pipeline/check.js';
import { checkFiles } from '../compiler/pipeline.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../../..');
const fixturesDir = path.join(testDir, '__fixtures__', 'listener-actions');
const tourDir = path.join(repoRoot, 'examples', 'eligian-tour');

const CODE = 'unknown-listener-action';

async function diagnosticsOf(fixture: string): Promise<readonly CheckDiagnostic[]> {
  const [result] = await Effect.runPromise(checkFiles([path.join(fixturesDir, fixture)]));
  return result.diagnostics;
}

/** The 1-based `[line, column]` of the first occurrence of `text` in a fixture. */
function positionOf(fixture: string, text: string): [number, number] {
  const lines = readFileSync(path.join(fixturesDir, fixture), 'utf-8').split(/\r?\n/);
  const line = lines.findIndex(l => l.includes(text));
  expect(line, text).toBeGreaterThanOrEqual(0);
  return [line + 1, lines[line].indexOf(text) + 1];
}

describe('unknown-listener-action', () => {
  it('unknown names: exactly 2, one per string', async () => {
    const diags = await diagnosticsOf('unknown-names.eligian');

    expect(diags.map(d => [d.code, d.line, d.column])).toEqual([
      [CODE, ...positionOf('unknown-names.eligian', '"nope"')],
      [CODE, ...positionOf('unknown-names.eligian', '"end:greet2"')],
    ]);
    expect(diags.map(d => d.severity)).toEqual(['error', 'error']);
    expect(diags[0].message).toBe(
      'Unknown action "nope" in the DOMEventListenerController action list: no action with that name is declared or imported'
    );
    expect(diags[1].message).toContain('Unknown action "greet2"');
    expect(diags[1].data?.suggestions).toContain('greet');
  });

  it('known names (end: stripped): 0', async () => {
    const diags = await diagnosticsOf('known-names.eligian');

    expect(diags).toEqual([]);
  });

  it('reported with an unrelated error present', async () => {
    const diags = await diagnosticsOf('with-error.eligian');

    const listener = diags.filter(d => d.code === CODE);
    expect(listener.map(d => [d.line, d.column])).toEqual([
      positionOf('with-error.eligian', '"nope"'),
      positionOf('with-error.eligian', '"end:greet2"'),
    ]);
    const others = diags.filter(d => d.code !== CODE);
    expect(others.length).toBeGreaterThan(0);
    expect(others.some(d => d.severity === 'error')).toBe(true);
  });

  it('tour stays clean', async () => {
    const files = readdirSync(tourDir)
      .filter(name => name.endsWith('.eligian'))
      .map(name => path.join(tourDir, name));
    expect(files.length).toBeGreaterThan(0);

    const results = await Effect.runPromise(checkFiles(files));

    const found = results.flatMap(r => r.diagnostics).filter(d => d.code === CODE);
    expect(found).toEqual([]);
  }, 120_000);
});
