/**
 * Spec 059 Phase 3 (FR-029, FR-033; plan §8, R-6, P14): the eval harness signs a brief fixture
 * as a confirmed brief, and reads a project's brief state. The fixture text is the `BRIEF.md` a
 * real interview writes at `complete` (the terse persona through `eligian_brief`), so nothing
 * here is a hand-made brief.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, test } from 'vitest';
import { parseBrief } from '../mcp/brief/brief-file.js';
import { readKey } from '../mcp/brief/signature.js';
import {
  briefStateOf,
  confirmBriefFixture,
  FIXTURE_CONFIRMATION,
} from '../mcp/evals/brief-fixture.js';
import { loadPersona, runPersona, type Step } from './brief-persona-driver.js';
import { startInMemoryServer } from './mcp-test-client.js';

const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');
// FR-033: the evals bundle (`dist/evals/assert.mjs`) the harness and the runner import
const EVALS_BUNDLE = path.resolve(import.meta.dirname, '..', '..', 'dist', 'evals', 'assert.mjs');
const built = fs.existsSync(EVALS_BUNDLE);
const NOW = new Date('2026-11-20T00:00:00Z');

const temps: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
};

/** The complete, unconfirmed `BRIEF.md` of the terse persona. */
let fixture: string;

beforeAll(async () => {
  const cwd = tempDir('eligian-fixture-interview-');
  const stateA = tempDir('eligian-fixture-state-a-');
  const server = await startInMemoryServer({ cwd, docsRoot: DOCS, brief: { stateDir: stateA } });
  try {
    const call = async (args: Record<string, unknown>): Promise<Step> => {
      const { payload, isError } = await server.callTool('eligian_brief', args);
      if (isError) throw new Error(`eligian_brief failed: ${JSON.stringify(payload)}`);
      return payload as Step;
    };
    const persona = loadPersona('terse');
    const run = await runPersona(
      persona,
      answers => call({ action: 'answer', answers }),
      () => call({ action: 'status', idea: persona.idea })
    );
    expect(run.final.state).toBe('complete');
  } finally {
    await server.close();
  }
  fixture = fs.readFileSync(path.join(cwd, 'BRIEF.md'), 'utf8');
  const parsed = parseBrief(fixture);
  expect(parsed.brief.confirmation).toBeUndefined();
  expect(parsed.brief.approval).toBeUndefined();
}, 60_000);

afterAll(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A state dir path that does not exist yet. */
const freshStateDir = (): string => path.join(tempDir('eligian-fixture-state-'), 'state');

/** The fixture without its `### P1: …` answer block. */
const withoutP1 = (text: string): string => {
  const start = text.indexOf('### P1:');
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('\n### ', start + 1);
  return text.slice(0, start) + text.slice(end + 1);
};

describe('confirmBriefFixture', () => {
  it('confirms a complete fixture: { text } whose state with the key is confirmed, mode agent-reported, the message names the case', async () => {
    const project = tempDir('eligian-fixture-project-');
    const stateB = freshStateDir();
    const result = await confirmBriefFixture(
      fixture,
      project,
      stateB,
      NOW,
      FIXTURE_CONFIRMATION('title-card')
    );
    if (!('text' in result)) throw new Error(result.error);
    fs.writeFileSync(path.join(project, 'BRIEF.md'), result.text);
    expect(await briefStateOf(project, stateB)).toBe('confirmed');
    const confirmation = parseBrief(result.text).brief.confirmation;
    expect(confirmation?.mode).toBe('agent-reported');
    expect(confirmation?.message).toBe('eval harness: the brief fixture of case title-card');
    expect(confirmation?.at).toBe(NOW.toISOString());
  });

  it('creates the key in stateDir', async () => {
    const project = tempDir('eligian-fixture-project-');
    const stateB = freshStateDir();
    expect(fs.existsSync(stateB)).toBe(false);
    const result = await confirmBriefFixture(fixture, project, stateB, NOW);
    expect('text' in result).toBe(true);
    expect(await readKey(stateB)).toBeDefined();
  });

  it('an open fixture is { error } naming the frontier ids', async () => {
    const project = tempDir('eligian-fixture-project-');
    const result = await confirmBriefFixture(withoutP1(fixture), project, freshStateDir(), NOW);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('the brief is open');
      expect(result.error).toContain('P1');
    }
  });

  it('ignored content is { error } naming the line', async () => {
    const project = tempDir('eligian-fixture-project-');
    const at = fixture.indexOf('### P1:');
    const text = `${fixture.slice(0, at)}### Z9: Nothing\n\n- by: user\n- round: 1\n\nx\n\n${fixture.slice(at)}`;
    const line = text.slice(0, at).split('\n').length;
    expect(parseBrief(text).ignored.map(i => i.line)).toEqual([line]);
    const result = await confirmBriefFixture(text, project, freshStateDir(), NOW);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain(`line ${line}: `);
  });
});

describe('briefStateOf', () => {
  it("'none' without BRIEF.md", async () => {
    const project = tempDir('eligian-fixture-project-');
    expect(await briefStateOf(project, freshStateDir())).toBe('none');
  });

  it("'complete' for the unconfirmed text", async () => {
    const project = tempDir('eligian-fixture-project-');
    fs.writeFileSync(path.join(project, 'BRIEF.md'), fixture);
    expect(await briefStateOf(project, freshStateDir())).toBe('complete');
  });

  it("'complete' (not confirmed) when read with another state dir's key", async () => {
    const project = tempDir('eligian-fixture-project-');
    const stateB = freshStateDir();
    const result = await confirmBriefFixture(fixture, project, stateB, NOW);
    if (!('text' in result)) throw new Error(result.error);
    fs.writeFileSync(path.join(project, 'BRIEF.md'), result.text);
    const other = tempDir('eligian-fixture-other-');
    await confirmBriefFixture(fixture, project, other, NOW);
    expect(await readKey(other)).toBeDefined();
    expect(await briefStateOf(project, other)).toBe('complete');
    expect(await briefStateOf(project, stateB)).toBe('confirmed');
  });
});

describe('the evals bundle', () => {
  test.skipIf(!built)(
    'the evals bundle exports confirmBriefFixture, briefStateOf, sheetToPersona',
    async () => {
      const bundle = (await import(pathToFileURL(EVALS_BUNDLE).href)) as Record<string, unknown>;
      for (const name of [
        'confirmBriefFixture',
        'briefStateOf',
        'parsePersonaSheet',
        'sheetToPersona',
      ]) {
        expect(typeof bundle[name], name).toBe('function');
      }
    }
  );
});
