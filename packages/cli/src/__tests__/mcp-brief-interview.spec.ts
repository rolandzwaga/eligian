/**
 * Spec 059 Phase 1 (SC-002, SC-003, SC-021; plan "Persona fixtures"): the brief interview end to
 * end through the in-memory server. Each persona gets a fresh temp project and server; the
 * persona driver (`brief-persona-driver.ts`) answers every round through `eligian_brief`
 * `answer` until the brief is complete, then the test confirms it. "Not gated": the other tools
 * answer the same with an open `BRIEF.md` beside the program.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBrief } from '../mcp/brief/brief-file.js';
import { type AnswerInput, evaluate } from '../mcp/brief/engine.js';
import { type BranchId, TREE } from '../mcp/brief/tree.js';
import { type BriefSuccess, makeFacts } from '../mcp/tools/brief.js';
import { loadPersona, type PersonaName, runPersona, type Step } from './brief-persona-driver.js';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

const FIXTURES = path.join(import.meta.dirname, '__fixtures__', 'mcp');
const DOCS = path.join(FIXTURES, 'docs-mini');
const PROGRAM = path.join(FIXTURES, 'fmt', 'formatted.eligian');
/** Stands in for bin/cli.js in the smoke child (as `mcp-server.spec.ts:38`). */
const STUB = path.join(FIXTURES, 'smoke-tool', 'stub-cli.mjs');

const PERSONAS: readonly PersonaName[] = ['terse', 'detailed', 'vague'];

/** A reply of `eligian_brief`, as this spec reads it. */
type Reply = Step & Pick<BriefSuccess, 'file' | 'delegated' | 'refused' | 'next'>;

interface Interview {
  readonly root: string;
  readonly file: string;
  /** The rounds the driver answered, in order. */
  readonly rounds: readonly Step['round'][];
  /** `calls[k]` answered `rounds[k]`; `replies[k]` is the reply to it. */
  readonly calls: readonly AnswerInput[][];
  readonly replies: readonly Reply[];
  /** The last value and the last `delegated` mark actually sent per id. */
  readonly sent: ReadonlyMap<string, unknown>;
  readonly delegated: ReadonlyMap<string, boolean>;
  /** The reply and the file text at `complete`. */
  readonly complete: Reply;
  readonly completeText: string;
  /** The confirmation message, the reply to `confirm` and the file text after it. */
  readonly message: string;
  readonly confirmed: Reply;
  readonly confirmedText: string;
}

const roots: string[] = [];
const interviews = new Map<PersonaName, Promise<Interview>>();

afterAll(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const tempProject = (prefix: string): string => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(root);
  return root;
};

async function runInterview(name: PersonaName): Promise<Interview> {
  const persona = loadPersona(name);
  const root = tempProject(`eligian-interview-${name}-`);
  const server = await startInMemoryServer({ cwd: root, docsRoot: DOCS });
  const brief = async (args: Record<string, unknown>): Promise<Reply> => {
    const { payload, isError } = await server.callTool('eligian_brief', args);
    expect(isError, JSON.stringify(payload)).toBe(false);
    return payload as Reply;
  };
  try {
    const calls: AnswerInput[][] = [];
    const replies: Reply[] = [];
    const delegated = new Map<string, boolean>();
    const run = await runPersona(
      persona,
      async answers => {
        calls.push(answers);
        for (const answer of answers) delegated.set(answer.id, answer.delegated === true);
        const reply = await brief({ action: 'answer', answers });
        replies.push(reply);
        return reply;
      },
      () => brief({ action: 'status', idea: persona.idea })
    );
    const file = path.join(root, 'BRIEF.md');
    const completeText = fs.readFileSync(file, 'utf8');
    const message = `Yes, the ${name} brief is "right".\nGo ahead.`;
    const confirmed = await brief({ action: 'confirm', confirmation: message });
    const confirmedText = fs.readFileSync(file, 'utf8');
    console.info(`${name}: ${run.rounds.length} rounds`);
    return {
      root,
      file,
      rounds: run.rounds,
      calls,
      replies,
      sent: run.sent,
      delegated,
      complete: run.final as Reply,
      completeText,
      message,
      confirmed,
      confirmedText,
    };
  } finally {
    await server.close();
  }
}

/** One interview per persona, shared by the tests that read it. */
const interview = (name: PersonaName): Promise<Interview> => {
  let known = interviews.get(name);
  if (known === undefined) {
    known = runInterview(name);
    interviews.set(name, known);
  }
  return known;
};

const TIMEOUT = 120_000;

describe('interview', () => {
  it.each(PERSONAS)(
    '%s reaches complete then confirmed',
    async name => {
      const run = await interview(name);

      // 1. complete with an empty round, then confirmed with the message verbatim.
      expect(run.complete.state).toBe('complete');
      expect(run.complete.round).toEqual([]);
      expect(run.confirmed.state).toBe('confirmed');
      expect(run.confirmed.refused).toBeUndefined();
      expect(parseBrief(run.confirmedText).brief.confirmation?.message).toBe(run.message);

      // 2. At most 7 items per round, each with an ask, a shape, docs and facts.
      for (const [k, round] of run.rounds.entries()) {
        expect(round.length, `round ${k + 1}`).toBeGreaterThan(0);
        expect(round.length, `round ${k + 1}`).toBeLessThanOrEqual(7);
        for (const item of round) {
          expect(typeof item.ask, item.id).toBe('string');
          expect(item.ask.trim(), item.id).not.toBe('');
          expect(typeof item.shape?.kind, item.id).toBe('string');
          expect(Array.isArray(item.docs), item.id).toBe(true);
          expect(Array.isArray(item.facts), item.id).toBe(true);
        }
      }

      // 3. Every recorded answer is the last value sent, delegated exactly when marked.
      const parsed = parseBrief(run.completeText);
      expect(parsed.ignored).toEqual([]);
      expect(parsed.brief.answers.length).toBeGreaterThan(0);
      for (const answer of parsed.brief.answers) {
        expect(run.sent.has(answer.id), `${answer.id} was sent`).toBe(true);
        expect(answer.value, answer.id).toEqual(run.sent.get(answer.id));
        expect(answer.by, answer.id).toBe(run.delegated.get(answer.id) ? 'delegated' : 'user');
      }
      if (name === 'terse') {
        const by = new Set(parsed.brief.answers.map(a => a.by));
        expect([...by].sort()).toEqual(['delegated', 'user']);
        const marked = parsed.brief.answers
          .filter(a => a.by === 'delegated')
          .map(a => a.id)
          .sort();
        expect((run.complete.delegated ?? []).map(d => d.id).sort()).toEqual(marked);
      }

      // 4. No id asked twice, except a reopened one (previous = the value recorded before the
      // change) or one whose previous answer call rejected it (no previous; the ranking decides
      // which later round re-asks it, plan "Persona fixtures" rule 1).
      const asked = new Set<string>();
      const recorded = new Map<string, unknown>();
      const rejectedLast = new Set<string>();
      for (const [k, round] of run.rounds.entries()) {
        for (const item of round) {
          if (asked.has(item.id)) {
            if (item.previous !== undefined) {
              expect(item.previous, `${item.id} in round ${k + 1}`).toEqual(recorded.get(item.id));
            } else {
              expect([...rejectedLast], `${item.id} asked again in round ${k + 1}`).toContain(
                item.id
              );
            }
          }
          asked.add(item.id);
        }
        const rejected = new Set(run.replies[k].rejected.map(r => r.id));
        for (const answer of run.calls[k]) {
          if (rejected.has(answer.id)) {
            rejectedLast.add(answer.id);
          } else {
            rejectedLast.delete(answer.id);
            recorded.set(answer.id, answer.value);
          }
        }
      }

      // 5. No rejection but vague's planned S3.
      const rejections = run.replies.flatMap(r =>
        r.rejected.map(({ id, reason }) => ({ id, reason }))
      );
      expect(rejections).toEqual(
        name === 'vague' ? [{ id: 'S3', reason: 'invalid-reference' }] : []
      );
    },
    TIMEOUT
  );

  it(
    'detailed applies 71 instances in the FR split and needs at most 12 rounds',
    async () => {
      const run = await interview('detailed');
      const evaluation = evaluate(
        TREE,
        parseBrief(run.completeText).brief,
        makeFacts(run.root, run.root)
      );
      expect(evaluation.state).toBe('complete');

      const applicable = evaluation.instances.filter(
        i => i.counted && i.status !== 'not-applicable'
      );
      const APPLICABLE = 71;
      expect(applicable).toHaveLength(APPLICABLE);
      const split: Partial<Record<BranchId, number>> = {};
      for (const instance of applicable) {
        const branch = instance.question.branch;
        split[branch] = (split[branch] ?? 0) + 1;
      }
      expect(split).toEqual({
        P: 5,
        C: 5,
        S: 8,
        V: 18,
        I: 4,
        D: 8,
        L: 4,
        A: 6,
        H: 1,
        X: 5,
        R: 4,
        W: 3,
      });
      expect(run.rounds.length).toBeLessThanOrEqual(Math.ceil((APPLICABLE - 1) / 7) + 2);
    },
    TIMEOUT
  );

  it(
    'the first round item with id S2 has an ask containing "timeline name"',
    async () => {
      for (const name of PERSONAS) {
        const run = await interview(name);
        const s2 = run.rounds.flat().find(item => item.id === 'S2');
        expect(s2, name).toBeDefined();
        expect(s2?.ask, name).toContain('timeline name');
      }
    },
    TIMEOUT
  );
});

describe('not gated (SC-003)', () => {
  let root: string;
  let server: InMemoryServer;

  beforeEach(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-not-gated-')));
    fs.copyFileSync(PROGRAM, path.join(root, 'main.eligian'));
    server = await startInMemoryServer({ cwd: root, docsRoot: DOCS, smoke: { cliPath: STUB } });
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const CALLS: readonly (readonly [string, Record<string, unknown>])[] = [
    ['eligian_check', { paths: ['main.eligian'] }],
    ['eligian_compile', { path: 'main.eligian' }],
    ['eligian_fmt', { paths: ['main.eligian'] }],
    ['eligian_project', { path: 'main.eligian' }],
    ['eligian_smoke', { paths: ['main.eligian'] }],
  ];

  type ProjectPayload = { programs: { brief?: unknown }[] };

  /** The results with `programs[].brief` removed from the `eligian_project` payload. */
  const withoutProjectBrief = (results: { tool: string; isError: boolean; payload: unknown }[]) =>
    results.map(result => {
      if (result.tool !== 'eligian_project') return result;
      const payload = result.payload as ProjectPayload;
      return {
        ...result,
        payload: {
          ...payload,
          programs: payload.programs.map(({ brief: _brief, ...program }) => program),
        },
      };
    });

  const callAll = async () => {
    const results: { tool: string; isError: boolean; payload: unknown }[] = [];
    for (const [tool, args] of CALLS) {
      const { payload, isError } = await server.callTool(tool, args);
      results.push({ tool, isError, payload });
    }
    return results;
  };

  it(
    'check, compile, fmt, project and smoke return the same with an open BRIEF.md',
    async () => {
      const without = await callAll();
      for (const result of without) expect(result.isError, result.tool).toBe(false);

      const { payload, isError } = await server.callTool('eligian_brief', {
        action: 'status',
        idea: 'A one-screen overview of our support hours.',
      });
      expect(isError).toBe(false);
      expect((payload as Reply).state).toBe('open');
      expect(fs.existsSync(path.join(root, 'BRIEF.md'))).toBe(true);

      const withBrief = await callAll();
      // Phase 2 FR-056: eligian_project's brief section differs with the brief; the rest is equal
      const briefOf = (results: Awaited<ReturnType<typeof callAll>>) =>
        (results.find(r => r.tool === 'eligian_project')!.payload as ProjectPayload).programs[0]
          ?.brief;
      expect(briefOf(without)).toEqual({
        file: null,
        state: 'none',
        next: expect.any(String),
        known: true,
        gate: 'runs',
      });
      expect(briefOf(withBrief)).toMatchObject({ state: 'open', gate: 'runs' });
      expect(withoutProjectBrief(withBrief)).toEqual(withoutProjectBrief(without));
    },
    TIMEOUT
  );
});
