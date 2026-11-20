/**
 * Spec 059 Phase 3 (FR-027, SC-012; plan Test plan row SC-012, R1): the reference solution of each
 * case with a brief fixture passes the brief gate under that fixture. Per case: the case's fixtures
 * materialised in a temp project, `cases/<id>/brief.md` signed as a confirmed `BRIEF.md` with a
 * temp state dir, a `STORYBOARD.md` built from it, `approve-storyboard` through an accepting
 * elicitation responder, then the solution copied in and `eligian_check` on `main.eligian` is not
 * refused by the gate. A red case means its `brief.md` is wrong (T017's data), not this spec.
 *
 * One in-process server per case, the cases one after another in this file (Langium, R1).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { materialiseFixtures } from '../mcp/evals/assert.js';
import { briefStateOf, confirmBriefFixture } from '../mcp/evals/brief-fixture.js';
import { evaluateBriefFile, storyboardFor, tempProject } from './brief-helpers.js';
import { CASE_IDS, CASES_DIR, readCase, SOLUTIONS } from './mcp-solutions-harness.js';
import { startInMemoryServer } from './mcp-test-client.js';

const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');
const NOW = new Date('2026-11-20T00:00:00Z');

/** The cases with a brief fixture (every case without a `start/` state). */
const BRIEF_CASES = CASE_IDS.filter(id => fs.existsSync(path.join(CASES_DIR, id, 'brief.md')));

const temps: string[] = [];

afterAll(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the reference solution passes the gate under its fixture (SC-012)', () => {
  it('twelve cases have a brief fixture', () => {
    expect(BRIEF_CASES).toHaveLength(12);
  });

  it.each(BRIEF_CASES)(
    '%s',
    async id => {
      const cwd = tempProject();
      const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-sc012-')));
      temps.push(cwd, scratch);
      const stateDir = path.join(scratch, 'state');

      const evalCase = readCase(id);
      expect(materialiseFixtures(evalCase, CASES_DIR, cwd)).toEqual([]);
      const fixture = fs.readFileSync(path.join(CASES_DIR, id, 'brief.md'), 'utf8');
      const confirmed = await confirmBriefFixture(fixture, cwd, stateDir, NOW);
      if (!('text' in confirmed)) throw new Error(`${id}: ${confirmed.error}`);
      fs.writeFileSync(path.join(cwd, 'BRIEF.md'), confirmed.text);
      expect(await briefStateOf(cwd, stateDir)).toBe('confirmed');
      fs.writeFileSync(
        path.join(cwd, 'STORYBOARD.md'),
        storyboardFor(await evaluateBriefFile(cwd, { stateDir }))
      );

      const server = await startInMemoryServer(
        { cwd, docsRoot: DOCS, brief: { stateDir } },
        { elicitation: true, onElicit: () => ({ action: 'accept', content: { approved: true } }) }
      );
      try {
        const approved = await server.callTool('eligian_brief', { action: 'approve-storyboard' });
        expect(approved.isError, JSON.stringify(approved.payload)).toBe(false);
        expect(approved.payload.state).toBe('approved');

        fs.cpSync(path.join(SOLUTIONS, id), cwd, { recursive: true });
        const checked = await server.callTool('eligian_check', { paths: [evalCase.entry] });

        const refusal = checked.isError ? checked.payload?.error?.kind : undefined;
        expect(refusal, JSON.stringify(checked.payload)).not.toBe('gate');
      } finally {
        await server.close();
      }
    },
    120_000
  );
});
