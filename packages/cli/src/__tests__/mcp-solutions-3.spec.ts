/**
 * Reference solutions, part 3 of 3 (see `mcp-solutions-harness.ts`): `SOLUTION_PARTS[2]` and the
 * negative controls (a broken solution must fail the gate step that should catch it).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { smokeStepArgs } from '../mcp/evals/assert.js';
import { requireFreshBundle } from './fresh-bundle.js';
import {
  CASE_IDS,
  CASES_DIR,
  CLI,
  describeSolutions,
  readCase,
  SOLUTION_PARTS,
  useSolutionsHarness,
} from './mcp-solutions-harness.js';

const harness = useSolutionsHarness();
const { copySolution, gate } = harness;

/** Replace exactly one occurrence of `from` in `file`. */
function replaceOnce(file: string, from: string, to: string): void {
  const text = fs.readFileSync(file, 'utf8');
  expect(text.split(from)).toHaveLength(2);
  fs.writeFileSync(file, text.replace(from, to));
}

describeSolutions(SOLUTION_PARTS[2], harness);

describe('negative controls', () => {
  beforeAll(() => requireFreshBundle());
  it('smokeStepArgs contains --determinism', () => {
    for (const id of CASE_IDS) {
      expect(smokeStepArgs(readCase(id), CASES_DIR)).toContain('--determinism');
    }
  });

  it('a deleted beat fails storyboard.beatsCovered', () => {
    const dir = copySolution('staggered-list', 'staggered-list-deleted-beat');
    replaceOnce(
      path.join(dir, 'main.eligian'),
      '  at 2s..6s target "#cards" [ addClass("is-complete") ] [ removeClass("is-complete") ]\n',
      ''
    );

    const result = gate('staggered-list', dir);

    const covered = result.assertions.find(a => a.kind === 'storyboard.beatsCovered');
    expect(covered?.pass).toBe(false);
    expect(covered?.detail).toContain("beat 'features 2..6 #cards'");
    expect(result.failures.some(f => f.includes('storyboard.beatsCovered'))).toBe(true);
  }, 120_000);

  it('case 4 without its media fails step 1 with media-file-missing', () => {
    const dir = copySolution('video-subtitles', 'video-subtitles-no-media');

    const result = gate('video-subtitles', dir, { media: false });

    expect(fs.existsSync(path.join(dir, 'media', 'intro.mp4'))).toBe(false);
    expect(result.checkCodes).toContain('media-file-missing');
    const step1 = result.failures.find(f => f.startsWith('step 1 (check)'));
    expect(step1).toContain('media-file-missing');
  }, 120_000);

  it('a range that adds a class nothing removes fails step 3 with position-nondeterministic', () => {
    const dir = copySolution('title-card', 'title-card-no-end-block');
    replaceOnce(
      path.join(dir, 'main.eligian'),
      'at 1s..8s target "#headline" [ addClass("in") ] [ removeClass("in") ]',
      'at 1s..8s target "#headline" [ addClass("in") ]'
    );
    const evalCase = readCase('title-card');

    const result = gate('title-card', dir);

    const step3 = result.failures.find(f => f.startsWith('step 3 (smoke'));
    expect(step3).toContain('element #headline');
    // The step-3 failure line carries the messages; the codes are in the smoke report it read
    const smoke = spawnSync(
      process.execPath,
      [CLI, 'smoke', evalCase.entry, ...smokeStepArgs(evalCase, CASES_DIR)],
      { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    const report = JSON.parse(smoke.stdout) as { problems?: { code?: string }[] }[];
    const codes = report.flatMap(file => (file.problems ?? []).map(p => p.code));
    expect(codes).toContain('position-nondeterministic');
  }, 120_000);
});
