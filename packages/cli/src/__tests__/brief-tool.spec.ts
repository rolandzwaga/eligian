/**
 * Spec 059 Phase 1 (FR-024 to FR-031, FR-042, SC-011, SC-013 in-process half, SC-016 and SC-019
 * tool halves, SC-022; plan §5, §6, P1, P2, P5, P8, P16): the `eligian_brief` tool through the
 * in-memory server. Each test gets a fresh temp project and server; payloads come from
 * `callTool('eligian_brief', …)`, the file is read back with `parseBrief`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBrief } from '../mcp/brief/brief-file.js';
import { type AnswerInput, evaluate, nextRound } from '../mcp/brief/engine.js';
import { makeSigner, readKey, stateDirectory } from '../mcp/brief/signature.js';
import { TREE } from '../mcp/brief/tree.js';
import { compilerLockLayer } from '../mcp/compiler-lock.js';
import type { ServerOptions } from '../mcp/server.js';
import { makeFacts, summarizeArgs, summarizeResult } from '../mcp/tools/brief.js';
import { loadPersona } from './brief-persona-driver.js';
import {
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');
const FOUR_VIEWS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'brief', 'four-views.md');

/** A promise opened by hand. */
const gate = () => {
  let open: () => void = () => {};
  const promise = new Promise<void>(resolve => {
    open = resolve;
  });
  return { promise, open };
};

/** The `*.tmp` entries of a directory (FR-034: none may outlive a call). */
const tempFiles = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.tmp')) : [];

const FIRST_ROUND = ['C1', 'P5', 'C4', 'P4', 'C3', 'C5', 'P3'];

const NEXT_IDEA =
  'Ask the user for their idea in their own words, then call `eligian_brief` with `action: status` and the idea verbatim as `idea`.';
const nextOpen = (n: number) =>
  `Ask the user these ${n} questions in one message, each with your recommended answer worded so that yes accepts it; then call \`eligian_brief\` with \`action: answer\`.`;
const nextComplete = (file: string) =>
  `Show the user the counts, the delegated answers and ${file}, then call \`eligian_brief\` with \`action: confirm\` and their reply verbatim as \`confirmation\`.`;
const NEXT_CONFIRMED = 'Draft STORYBOARD.md from the brief (`eligian_docs` id `storyboard`).';

/** The terse persona's answers: a complete single-view, one-language brief. */
const TERSE = loadPersona('terse');
const TERSE_ANSWERS: readonly AnswerInput[] = Object.entries(TERSE.answers).map(([id, entry]) => {
  const one = 'values' in entry ? entry.values[0] : entry;
  return { id, value: one.value, ...(one.delegated === true ? { delegated: true } : {}) };
});

/** `answers` with the given ids replaced or added. */
const withAnswers = (
  answers: readonly AnswerInput[],
  overrides: readonly AnswerInput[]
): AnswerInput[] => [...answers.filter(a => !overrides.some(o => o.id === a.id)), ...overrides];

const ONE_VIEW_TABLES: readonly AnswerInput[] = [
  { id: 'S2', value: [{ name: 'hours', purpose: 'Shows the support hours' }] },
  { id: 'S5', value: [{ view: 'hours', end: 'stay' }] },
  { id: 'S6', value: [{ view: 'hours', provider: 'raf', source: '-' }] },
  { id: 'D5', value: [{ view: 'hours', layout: 'title' }] },
];

/** Terse with a second view `faq`: S3 (delegated), S4, I4, X3 apply, V1–V6 for faq. */
const TWO_VIEWS = withAnswers(TERSE_ANSWERS, [
  {
    id: 'S2',
    value: [
      { name: 'hours', purpose: 'Shows the support hours' },
      { name: 'faq', purpose: 'Answers common questions' },
    ],
  },
  { id: 'S3', value: 'hours', delegated: true },
  { id: 'S4', value: [{ view: 'hours', target: 'faq', trigger: 'a link' }] },
  {
    id: 'S5',
    value: [
      { view: 'hours', end: 'stay' },
      { view: 'faq', end: 'stay' },
    ],
  },
  {
    id: 'S6',
    value: [
      { view: 'hours', provider: 'raf', source: '-' },
      { view: 'faq', provider: 'raf', source: '-' },
    ],
  },
  {
    id: 'D5',
    value: [
      { view: 'hours', layout: 'title' },
      { view: 'faq', layout: 'title' },
    ],
  },
  { id: 'I4', value: 'restart' },
  { id: 'X3', value: { focus: 'yes', announce: 'yes' } },
  { id: 'V1:faq', value: 'Most questions have short answers.' },
  { id: 'V2:faq', value: 'Questions\nWhen are you open? On weekdays.' },
  { id: 'V3:faq', value: 'none' },
  { id: 'V4:faq', value: 'The title, then the list.' },
  { id: 'V5:faq', value: { duration: 'none', pacing: 'none', 'cues-from': '-' } },
  { id: 'V6:faq', value: 'none' },
]);

/** The machine has a lockfile or a `packageManager` at or above os.tmpdir(): it decides the walk. */
const markerAboveTmpdir = (): string | undefined => {
  const markers = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'package-lock.json'];
  let d = fs.realpathSync(os.tmpdir());
  for (;;) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(d, marker))) return path.join(d, marker);
    }
    const manifest = path.join(d, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        if (JSON.parse(fs.readFileSync(manifest, 'utf8')).packageManager !== undefined) {
          return manifest;
        }
      } catch {
        // not a packageManager declaration
      }
    }
    const parent = path.dirname(d);
    if (parent === d) return undefined;
    d = parent;
  }
};

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** The text of the `### <id>:` block, up to the next heading. */
const blockOf = (text: string, id: string): string => {
  const start = text.indexOf(`### ${id}:`);
  expect(start, `### ${id}: in BRIEF.md`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('\n#', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

describe('eligian_brief', () => {
  let root: string;
  let server: InMemoryServer;
  let file: string;

  beforeEach(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-brief-')));
    file = path.join(root, 'BRIEF.md');
    server = await startInMemoryServer({ cwd: root, docsRoot: DOCS });
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const call = (args: Record<string, unknown>): Promise<ToolCallResult> =>
    server.callTool('eligian_brief', args);

  /** Replaces this test's server by one with the given options (closed in `afterEach`). */
  const restart = async (options: Omit<ServerOptions, 'cwd' | 'docsRoot'>) => {
    await server.close();
    server = await startInMemoryServer({ cwd: root, docsRoot: DOCS, ...options });
  };

  /** A successful reply's payload. */
  const ok = async (args: Record<string, unknown>) => {
    const result = await call(args);
    expect(result.isError, JSON.stringify(result.payload)).toBe(false);
    return result.payload;
  };

  const read = (at = file) => fs.readFileSync(at, 'utf8');
  const parsed = (at = file) => parseBrief(read(at));
  const recorded = (id: string, at = file) => parsed(at).brief.answers.find(a => a.id === id);
  const roundIds = (payload: { round: { id: string }[] }) => payload.round.map(i => i.id);

  /**
   * status with an idea, then every answer in one call, then the ones rejected `waiting` again
   * (a V copy is unknown until S2 is settled, so it is applied after the questions that need it,
   * FR-007): the brief must be complete.
   */
  const complete = async (answers: readonly AnswerInput[]) => {
    await ok({ action: 'status', idea: TERSE.idea });
    const first = await ok({ action: 'answer', answers });
    const waiting = (first.rejected as { id: string; reason: string }[]).filter(
      r => r.reason === 'waiting'
    );
    expect(first.rejected.length).toBe(waiting.length);
    const reply = await ok({
      action: 'answer',
      answers: answers.filter(a => waiting.some(w => w.id === a.id)),
    });
    expect({ state: reply.state, round: roundIds(reply), rejected: reply.rejected }).toEqual({
      state: 'complete',
      round: [],
      rejected: [],
    });
    return reply;
  };

  /** Re-sends the `previous` of every reopened round item until none is left (FR-015 review). */
  const reviewAll = async (reply: any) => {
    let current = reply;
    for (let n = 0; n < 5 && current.round.length > 0; n++) {
      const items = current.round as { id: string; previous?: unknown; reason?: string }[];
      expect(
        items.filter(i => i.previous === undefined || i.reason !== undefined).map(i => i.id)
      ).toEqual([]);
      current = await ok({
        action: 'answer',
        answers: items.map(i => ({
          id: i.id,
          value: i.previous,
          ...(recorded(i.id)?.by === 'delegated' ? { delegated: true } : {}),
        })),
      });
    }
    return current;
  };

  /** The two-view brief, confirmed, then S2 dropped to one view (with S5, S6, D5) and reviewed. */
  const twoViewsDropped = async () => {
    await complete(TWO_VIEWS);
    const confirmed = await ok({ action: 'confirm', confirmation: 'Yes' });
    expect(confirmed.state).toBe('confirmed');
    const before = read();
    const dropped = await ok({ action: 'answer', answers: ONE_VIEW_TABLES });
    expect(dropped.rejected).toEqual([]);
    const after = await reviewAll(dropped);
    return { before, confirmed, after };
  };

  describe('paths (SC-011)', () => {
    it('directory with forward slashes resolves to <dir>/BRIEF.md', async () => {
      const reply = await ok({ action: 'status', directory: 'sub/deck', idea: 'An idea' });
      const expected = path.join(root, 'sub', 'deck', 'BRIEF.md');
      expect(reply.file).toBe(expected);
      expect(parsed(expected).brief.idea).toBe('An idea');
    });

    it.runIf(process.platform === 'win32')(
      'backslashes and the other drive-letter case resolve to the same BRIEF.md',
      async () => {
        await ok({ action: 'status', directory: 'sub\\deck', idea: 'An idea' });
        const drive = root[0];
        const swapped =
          (drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase()) +
          root.slice(1);
        const reply = await ok({
          action: 'answer',
          directory: `${swapped}\\sub\\deck`,
          answers: [{ id: 'P4', value: 'plain' }],
        });
        const expected = path.join(root, 'sub', 'deck', 'BRIEF.md');
        expect(reply.file.toLowerCase()).toBe(expected.toLowerCase());
        expect(parsed(expected).brief.idea).toBe('An idea');
        expect(recorded('P4', expected)?.value).toBe('plain');
      }
    );

    it('../outside fails with kind not-found and creates nothing outside the root', async () => {
      const name = `${path.basename(root)}-outside`;
      const result = await call({
        action: 'answer',
        directory: `../${name}`,
        idea: 'An idea',
        answers: [{ id: 'P4', value: 'plain' }],
      });
      expect(result.isError).toBe(true);
      expect(result.payload.error.kind).toBe('not-found');
      expect(fs.existsSync(path.join(path.dirname(root), name))).toBe(false);
    });

    it('a missing nested directory is created on the first write', async () => {
      const reply = await ok({
        action: 'answer',
        directory: 'a/b/c',
        answers: [{ id: 'P4', value: 'plain' }],
      });
      expect(reply.file).toBe(path.join(root, 'a', 'b', 'c', 'BRIEF.md'));
      expect(recorded('P4', reply.file)?.value).toBe('plain');
    });
  });

  describe('status', () => {
    it('creates BRIEF.md with the idea, state open, round C1, P5, C4, P4, C3, C5, P3', async () => {
      const reply = await ok({ action: 'status', idea: 'A tour of the product' });
      expect(reply.file).toBe(file);
      expect(reply.state).toBe('open');
      expect(roundIds(reply)).toEqual(FIRST_ROUND);
      expect(parsed().brief.idea).toBe('A tour of the product');
      expect(read()).toContain('- state: open');
    });

    it('no file and no idea creates nothing and next asks for the idea', async () => {
      const reply = await ok({ action: 'status' });
      expect(fs.existsSync(file)).toBe(false);
      expect(reply.state).toBe('open');
      expect(roundIds(reply)).toEqual(FIRST_ROUND);
      expect(reply.next).toBe(NEXT_IDEA);
    });

    it('a second, different idea leaves the stored idea unchanged', async () => {
      await ok({ action: 'status', idea: 'The first idea' });
      await ok({ action: 'status', idea: 'Another idea' });
      expect(parsed().brief.idea).toBe('The first idea');
    });
  });

  describe('idea (P8)', () => {
    it('an answer call without an idea creates BRIEF.md with no blockquote; a later status with an idea stores it; a third idea is ignored', async () => {
      await ok({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] });
      expect(
        read()
          .split('\n')
          .some(line => line.startsWith('>'))
      ).toBe(false);
      expect(parsed().brief.idea).toBeUndefined();

      await ok({ action: 'status', idea: 'The idea' });
      expect(parsed().brief.idea).toBe('The idea');

      await ok({ action: 'status', idea: 'A third idea' });
      expect(parsed().brief.idea).toBe('The idea');
    });

    it('an idea with CRLF is stored with LF', async () => {
      await ok({ action: 'status', idea: 'Line one\r\nLine two' });
      expect(read()).not.toContain('\r');
      expect(read()).toContain('> Line one\n> Line two');
      expect(parsed().brief.idea).toBe('Line one\nLine two');
    });
  });

  describe('answer', () => {
    it('accepted answers are in BRIEF.md with by and round 1', async () => {
      const reply = await ok({
        action: 'answer',
        answers: [
          { id: 'P4', value: 'plain' },
          { id: 'P1', value: 'Know the hours.', delegated: true },
        ],
      });
      expect(reply.rejected).toEqual([]);
      expect(recorded('P4')).toMatchObject({ value: 'plain', by: 'user', round: 1 });
      expect(recorded('P1')).toMatchObject({ value: 'Know the hours.', by: 'delegated', round: 1 });
    });

    it('all rejected and all no-op calls leave bytes and mtimeMs unchanged', async () => {
      await ok({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] });
      const bytes = fs.readFileSync(file);
      const mtime = fs.statSync(file).mtimeMs;
      await delay(30);

      const rejected = await ok({
        action: 'answer',
        answers: [
          { id: 'Z9', value: 'x' },
          { id: 'C1', value: 'Self-Paced' },
        ],
      });
      expect(rejected.rejected.map((r: { reason: string }) => r.reason)).toEqual([
        'unknown-question',
        'invalid-value',
      ]);
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);
      expect(fs.statSync(file).mtimeMs).toBe(mtime);

      const noop = await ok({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] });
      expect(noop.rejected).toEqual([]);
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);
      expect(fs.statSync(file).mtimeMs).toBe(mtime);
    });

    it("an R3 whose directory is not the brief's is rejected invalid-reference", async () => {
      const reply = await ok({
        action: 'answer',
        answers: [{ id: 'R3', value: 'sub/main.eligian' }],
      });
      expect(reply.rejected).toEqual([
        { id: 'R3', reason: 'invalid-reference', message: expect.any(String) },
      ]);
      expect(fs.existsSync(file)).toBe(false);
    });
  });

  describe('review (SC-016 tool half)', () => {
    it('answer C1, S1, S2; change C1; re-send S1 unchanged: S1 is reviewed and keeps its round', async () => {
      await ok({
        action: 'answer',
        answers: [
          { id: 'P5', value: 90 },
          { id: 'C1', value: 'self-paced' },
          { id: 'S1', value: 'slide-deck' },
          { id: 'S2', value: [{ name: 'intro', purpose: 'Opens the deck' }] },
        ],
      });
      const changed = await ok({ action: 'answer', answers: [{ id: 'C1', value: 'presenter' }] });
      const s1 = changed.round.find((i: { id: string }) => i.id === 'S1');
      expect(s1?.previous).toBe('slide-deck');
      expect(roundIds(changed)).not.toContain('S2');

      const reviewed = await ok({ action: 'answer', answers: [{ id: 'S1', value: 'slide-deck' }] });
      const block = blockOf(read(), 'S1');
      expect(block).toContain('- round: 1');
      expect(block).toContain('- reviewed: 3');
      expect(recorded('S1')).toMatchObject({ round: 1, reviewed: 3 });
      expect(roundIds(reviewed)).not.toContain('S1');
      const evaluation = evaluate(TREE, parsed().brief, makeFacts(root, root));
      expect(evaluation.instances.find(i => i.id === 'S2')?.status).toBe('answered');

      await ok({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] });
      expect(recorded('P4')?.round).toBe(4);
    });
  });

  describe('dormant (SC-019 tool half)', () => {
    it("S2 drops to one view: S3's block stays byte for byte, counted notApplicable, not answered, not delegated", async () => {
      const { before, confirmed, after } = await twoViewsDropped();
      expect(blockOf(read(), 'S3')).toBe(blockOf(before, 'S3'));

      const evaluation = evaluate(TREE, parsed().brief, makeFacts(root, root));
      const s3 = evaluation.instances.find(i => i.id === 'S3');
      expect(s3).toMatchObject({ status: 'not-applicable', dormant: true });
      expect(after.counts).toEqual({
        ...evaluation.counts,
        fromCode: evaluation.counts.fromCode ?? 0,
      });
      const counted = evaluation.instances.filter(i => i.counted);
      const notApplicable = counted.filter(i => i.status === 'not-applicable').map(i => i.id);
      const answered = counted.filter(i => i.status === 'answered').map(i => i.id);
      expect(notApplicable).toContain('S3');
      expect(after.counts.notApplicable).toBe(notApplicable.length);
      expect(answered).not.toContain('S3');
      expect(after.counts.answered).toBe(answered.length);
      // S3 is delegated, besides terse's D2, V2:hours and W1
      expect(confirmed.counts.delegated).toBe(4);
      expect(after.counts.delegated).toBe(3);
      expect(after.state).toBe('complete');
      expect(after.delegated.map((d: { id: string }) => d.id)).not.toContain('S3');
    });

    it('a confirmed brief becomes complete after S2 drops to one view', async () => {
      const { before, after } = await twoViewsDropped();
      expect(before).toContain('- state: confirmed');
      expect(after.state).toBe('complete');
      const status = await ok({ action: 'status' });
      expect(status.state).toBe('complete');
    });

    it('answer S3 is rejected not-applicable and the bytes are unchanged', async () => {
      await twoViewsDropped();
      const bytes = fs.readFileSync(file);
      const reply = await ok({ action: 'answer', answers: [{ id: 'S3', value: 'hours' }] });
      expect(reply.rejected).toEqual([
        { id: 'S3', reason: 'not-applicable', message: expect.any(String) },
      ]);
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);
    });
  });

  describe('max', () => {
    const initialize = async (protocolVersion: string) => {
      const initialized = await server.request('initialize', {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: 'brief-tool.spec', version: '0' },
      });
      expect(initialized.error).toBeUndefined();
      await server.notify('notifications/initialized');
    };
    const callWithMax = (max: number) =>
      server.request('tools/call', {
        name: 'eligian_brief',
        arguments: { action: 'status', idea: 'An idea', max },
      });

    it.each([0, 21])(
      '%i gives JSON-RPC -32602 matching /between 1 and 20/ and no BRIEF.md (2025-06-18)',
      async max => {
        await initialize('2025-06-18');
        const response = await callWithMax(max);
        expect(response.error?.code).toBe(-32602);
        expect(response.error?.message).toMatch(/between 1 and 20/);
        expect(fs.existsSync(file)).toBe(false);
      }
    );

    it.each([0, 21])(
      '%i is refused by the schema naming 1 and 20 and no BRIEF.md (2025-11-25)',
      async max => {
        await initialize('2025-11-25');
        const response = await callWithMax(max);
        // 2025-11-25 answers a parameter decode failure as a tool error result (mcp-docs.spec.ts).
        expect(response).not.toHaveProperty('error');
        const result = response.result as { content: { text: string }[]; isError?: boolean };
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/^Invalid parameters for tool 'eligian_brief'/);
        expect(result.content[0].text).toMatch(/between 1 and 20/);
        expect(fs.existsSync(file)).toBe(false);
      }
    );
  });

  describe('io', () => {
    it('BRIEF.md as a directory gives kind io', async () => {
      fs.mkdirSync(file);
      const result = await call({ action: 'status', idea: 'An idea' });
      expect(result.isError).toBe(true);
      expect(result.payload.error.kind).toBe('io');
      expect(fs.statSync(file).isDirectory()).toBe(true);
    });
  });

  describe('confirm', () => {
    it('refused frontier-not-empty while open, with the round', async () => {
      await ok({ action: 'status', idea: 'An idea' });
      const bytes = fs.readFileSync(file);
      const reply = await ok({ action: 'confirm', confirmation: 'Yes' });
      expect(reply.refused).toEqual({ code: 'frontier-not-empty' });
      expect(reply.state).toBe('open');
      expect(roundIds(reply)).toEqual(FIRST_ROUND);
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);
    });

    it('a blank confirmation is refused confirmation-missing', async () => {
      await complete(TERSE_ANSWERS);
      const bytes = fs.readFileSync(file);
      for (const confirmation of [undefined, '', '   ']) {
        const reply = await ok({
          action: 'confirm',
          ...(confirmation === undefined ? {} : { confirmation }),
        });
        expect(reply.refused).toEqual({ code: 'confirmation-missing' });
        expect(reply.state).toBe('complete');
      }
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);
    });

    it('a successful confirm writes the agent-reported line with the HMAC and the message as JSON', async () => {
      await complete(TERSE_ANSWERS);
      const message = 'Yes, "go ahead".\nThanks';
      const reply = await ok({ action: 'confirm', confirmation: message });
      expect(reply.state).toBe('confirmed');
      expect(reply.refused).toBeUndefined();

      const text = read();
      const line =
        /^- confirmation: agent-reported (\S+) round (\d+) (hmac-sha256:[0-9a-f]{64})$/m.exec(text);
      expect(line).not.toBeNull();
      const [at, round, hmac] = [line?.[1] ?? '', Number(line?.[2]), line?.[3]];
      expect(new Date(at).toISOString()).toBe(at);
      expect(round).toBe(nextRound(parsed().brief) - 1);
      const key = await readKey(stateDirectory());
      expect(key).toBeDefined();
      const canonical = evaluate(TREE, parsed().brief, makeFacts(root, root)).canonical;
      expect(hmac).toBe(
        makeSigner(key as Buffer).sign([
          'eligian-brief/1',
          'confirmation',
          'brief',
          'agent-reported',
          at,
          round,
          canonical,
        ])
      );
      const messageLine = /^- confirmation-message: (.*)$/m.exec(text);
      expect(JSON.parse(messageLine?.[1] ?? 'null')).toBe(message);
      expect(parsed().brief.confirmation?.message).toBe(message);
    });

    it('re-confirming leaves the bytes unchanged', async () => {
      await complete(TERSE_ANSWERS);
      await ok({ action: 'confirm', confirmation: 'Yes' });
      const bytes = fs.readFileSync(file);
      const reply = await ok({ action: 'confirm', confirmation: 'Yes again' });
      expect(reply.state).toBe('confirmed');
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);
    });
  });

  describe('reply (FR-030)', () => {
    it('header names the tool and the absolute BRIEF.md path', async () => {
      const reply = await ok({ action: 'status', idea: 'An idea' });
      const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(reply.header).toMatch(
        new RegExp(`^eligian \\S+ · eligius \\S+ · eligian_brief · ${escaped}$`)
      );
      expect(path.isAbsolute(reply.file)).toBe(true);
    });

    it('next has the plan texts for open, complete and confirmed', async () => {
      const open = await ok({ action: 'status', idea: 'An idea' });
      expect(open.next).toBe(nextOpen(7));
      const few = await ok({ action: 'status', max: 2 });
      expect(few.next).toBe(nextOpen(2));

      const completed = await complete(TERSE_ANSWERS);
      expect(completed.next).toBe(nextComplete(file));
      const confirmed = await ok({ action: 'confirm', confirmation: 'Yes' });
      expect(confirmed.next).toBe(NEXT_CONFIRMED);
    });

    it('delegated is absent while open and present when complete or confirmed', async () => {
      const open = await ok({ action: 'status', idea: 'An idea' });
      expect(open).not.toHaveProperty('delegated');

      const completed = await complete(TERSE_ANSWERS);
      const expected = TERSE_ANSWERS.filter(a => a.delegated === true).map(a => a.id);
      expect(completed.delegated.map((d: { id: string }) => d.id).sort()).toEqual(
        [...expected].sort()
      );
      for (const d of completed.delegated) {
        expect(d.title).toEqual(expect.any(String));
        expect(d.value).toEqual(TERSE_ANSWERS.find(a => a.id === d.id)?.value);
      }
      const confirmed = await ok({ action: 'confirm', confirmation: 'Yes' });
      expect(confirmed.delegated).toEqual(completed.delegated);
    });

    it('a hand-edited ### Z9: block is in ignored with its line and reason and survives the next write', async () => {
      await ok({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] });
      const z9 = '### Z9: A question that does not exist\n\n- by: user\n- round: 1\n\nsomething';
      const original = read();
      const cut = original.indexOf('\n## C:');
      expect(cut).toBeGreaterThan(0);
      fs.writeFileSync(file, `${original.slice(0, cut)}\n${z9}\n${original.slice(cut)}`);
      const line = read().split('\n').indexOf('### Z9: A question that does not exist') + 1;

      const status = await ok({ action: 'status' });
      expect(status.ignored).toEqual([{ line, reason: expect.any(String) }]);

      await ok({ action: 'answer', answers: [{ id: 'P1', value: 'Know the hours.' }] });
      expect(read()).toContain(z9);
      expect(recorded('P1')?.value).toBe('Know the hours.');
    });
  });

  describe('telemetry (FR-031)', () => {
    it('the sentinel is absent from summarizeArgs and summarizeResult JSON', async () => {
      const SENTINEL = 'TELEMETRY-SENTINEL';
      const params = {
        action: 'answer' as const,
        idea: `An idea ${SENTINEL}`,
        answers: [{ id: 'P1', value: `Know ${SENTINEL}` }],
        confirmation: `Yes ${SENTINEL}`,
        max: 5,
      };
      const args = summarizeArgs(params);
      expect(JSON.stringify(args)).not.toContain(SENTINEL);
      expect(args).toEqual({
        action: 'answer',
        answers: 1,
        max: 5,
        idea: true,
        scope: 'presentation',
        paths: 0,
      });

      const reply = await ok(params);
      const result = summarizeResult(reply);
      expect(JSON.stringify(result)).not.toContain(SENTINEL);
      expect(result).toEqual({ state: 'open', counts: reply.counts, rejected: 0 });
    });
  });

  describe('stale state (SC-013 in-process)', () => {
    it('a hand-edited P4 on a confirmed brief gives complete on the next status', async () => {
      await complete(TERSE_ANSWERS);
      expect((await ok({ action: 'confirm', confirmation: 'Yes' })).state).toBe('confirmed');
      const text = read();
      const block = blockOf(text, 'P4');
      expect(block).toContain('\nplain');
      fs.writeFileSync(file, text.replace(block, block.replace('\nplain', '\nplayful')));

      const status = await ok({ action: 'status' });
      expect(status.state).toBe('complete');
      expect(recorded('P4')?.value).toBe('playful');
    });

    it('creating a missing V3 asset makes A1 not applicable on the next call, with no restart', async () => {
      await ok({ action: 'status', idea: TERSE.idea });
      const answers = withAnswers(TERSE_ANSWERS, [
        { id: 'V3:hours', value: [{ element: 'Logo', kind: 'image', file: 'img/logo.png' }] },
      ]);
      const before = await ok({ action: 'answer', answers, max: 20 });
      expect(roundIds(before)).toContain('A1');

      fs.mkdirSync(path.join(root, 'img'));
      fs.writeFileSync(path.join(root, 'img', 'logo.png'), 'png');
      const after = await ok({ action: 'status', max: 20 });
      expect(roundIds(after)).not.toContain('A1');
      const evaluation = evaluate(TREE, parsed().brief, makeFacts(root, root));
      expect(evaluation.instances.find(i => i.id === 'A1')?.status).toBe('not-applicable');
    });
  });

  describe('facts probes (SC-022)', () => {
    it('node_modules/eligian/package.json 1.1.0 and pnpm-lock.yaml give the installed version and pnpm', async () => {
      fs.mkdirSync(path.join(root, 'node_modules', 'eligian'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'node_modules', 'eligian', 'package.json'),
        JSON.stringify({ name: 'eligian', version: '1.1.0' })
      );
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
      await ok({ action: 'status', idea: 'An idea' });
      const text = read();
      expect(text).toMatch(/^- server-eligian: \S+$/m);
      expect(text).toContain('\n- eligian-installed: 1.1.0\n');
      expect(text).toContain('\n- package-manager: pnpm\n');
    });

    it('neither gives - eligian-installed: - and - package-manager: npm', async () => {
      await ok({ action: 'status', idea: 'An idea' });
      const text = read();
      expect(text).toContain('\n- eligian-installed: -\n');
      if (markerAboveTmpdir() === undefined) {
        expect(text).toContain('\n- package-manager: npm\n');
      } else {
        expect(text).toMatch(/^- package-manager: (pnpm|yarn|bun|npm)$/m);
      }
    });

    it('an invalid package.json gives - and the call succeeds', async () => {
      fs.mkdirSync(path.join(root, 'node_modules', 'eligian'), { recursive: true });
      fs.writeFileSync(path.join(root, 'node_modules', 'eligian', 'package.json'), '{ not json');
      await ok({ action: 'status', idea: 'An idea' });
      expect(read()).toContain('\n- eligian-installed: -\n');
    });
  });

  describe('concurrency', () => {
    const CHANGED = 'BRIEF.md changed while writing; call again';
    const framesWithId = (id: number) =>
      server
        .frames()
        .filter(f => typeof f === 'object' && f !== null && Reflect.get(f, 'id') === id);
    const callWithId = (args: Record<string, unknown>, id: number) =>
      server.request('tools/call', { name: 'eligian_brief', arguments: args }, id);

    it('20 parallel answers on four-views.md get 20 distinct consecutive rounds', async () => {
      fs.copyFileSync(FOUR_VIEWS, file);
      const k = Math.max(...parsed().brief.answers.map(a => a.round));
      // initializes the session once, before the parallel calls; no idea and no file change
      await ok({ action: 'status' });

      const views = ['intro', 'features', 'pricing', 'signup'];
      const answers: AnswerInput[] = views.flatMap((view, n) => [
        { id: `V1:${view}`, value: `The one thing of ${view}.` },
        { id: `V2:${view}`, value: `Every text of ${view}.` },
        { id: `V3:${view}`, value: [{ element: `Title of ${view}`, kind: 'text', file: '-' }] },
        { id: `V4:${view}`, value: `The order of ${view}.` },
        {
          id: `V5:${view}`,
          value: { duration: String(10 * (n + 1)), pacing: 'fixed', 'cues-from': '-' },
        },
      ]);
      expect(answers).toHaveLength(20);

      const replies = await Promise.all(
        answers.map(answer => call({ action: 'answer', answers: [answer] }))
      );
      for (const reply of replies) {
        expect(reply.isError, JSON.stringify(reply.payload)).toBe(false);
        expect(reply.payload.rejected).toEqual([]);
      }
      const rounds = answers.map(answer => {
        const stored = recorded(answer.id);
        expect(stored?.value, answer.id).toEqual(answer.value);
        return stored?.round ?? -1;
      });
      expect([...rounds].sort((x, y) => x - y)).toEqual(
        Array.from({ length: 20 }, (_, i) => k + 1 + i)
      );
      expect(tempFiles(root)).toEqual([]);
    });

    it('status completes while a latched lock holds a check', async () => {
      const hold = gate();
      const reached = gate();
      await ok({ action: 'status' });
      fs.writeFileSync(path.join(root, 'main.eligian'), 'timeline "main" in "#app" using raf {}\n');
      fs.rmSync(path.join(root, '.eligian'), { recursive: true, force: true });
      await restart({
        lock: compilerLockLayer({
          latch: () => {
            reached.open();
            return hold.promise;
          },
        }),
      });

      let checkSettled = false;
      const checking = server.callTool('eligian_check', { paths: ['main.eligian'] }).finally(() => {
        checkSettled = true;
      });
      await reached.promise;
      try {
        const reply = await ok({ action: 'status', idea: 'An idea' });
        expect(reply.state).toBe('open');
        expect(parsed().brief.idea).toBe('An idea');
        expect(checkSettled).toBe(false);
      } finally {
        hold.open();
      }
      await checking;
    });

    it('a hand edit in beforeRename gives io "BRIEF.md changed while writing; call again", keeps the edit byte for byte, leaves no *.tmp', async () => {
      let seam: ((target: string) => Promise<void>) | undefined;
      await restart({ brief: { beforeRename: target => seam?.(target) ?? Promise.resolve() } });
      await ok({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] });
      const edited = `${read()}\nA line written by hand.\n`;
      const targets: string[] = [];
      seam = async target => {
        targets.push(target);
        fs.writeFileSync(target, edited);
      };

      const result = await call({ action: 'answer', answers: [{ id: 'P1', value: 'Know it.' }] });
      expect(result.isError).toBe(true);
      expect(result.payload.error).toEqual({ kind: 'io', message: CHANGED, path: file });
      expect(targets).toEqual([file]);
      expect(read()).toBe(edited);
      expect(tempFiles(root)).toEqual([]);
    });

    it('a beforeRename that rejects gives kind io, BRIEF.md untouched, no *.tmp', async () => {
      let seam: ((target: string) => Promise<void>) | undefined;
      await restart({ brief: { beforeRename: target => seam?.(target) ?? Promise.resolve() } });
      await ok({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] });
      const bytes = fs.readFileSync(file);
      seam = async () => {
        throw Object.assign(new Error('EIO: the seam failed'), { code: 'EIO' });
      };

      const result = await call({ action: 'answer', answers: [{ id: 'P1', value: 'Know it.' }] });
      expect(result.isError).toBe(true);
      expect(result.payload.error.kind).toBe('io');
      expect(result.payload.error.path).toBe(file);
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);
      expect(tempFiles(root)).toEqual([]);
    });

    it('A held in the seam on directory a while B on directory b completes; then A completes', async () => {
      const fileA = path.join(root, 'a', 'BRIEF.md');
      const fileB = path.join(root, 'b', 'BRIEF.md');
      const hold = gate();
      const reached = gate();
      await restart({
        brief: {
          beforeRename: async target => {
            if (target !== fileA) return;
            reached.open();
            await hold.promise;
          },
        },
      });
      await ok({ action: 'status' });

      let settledA = false;
      const a = call({
        action: 'answer',
        directory: 'a',
        answers: [{ id: 'P4', value: 'plain' }],
      }).finally(() => {
        settledA = true;
      });
      await reached.promise;
      try {
        const b = await ok({
          action: 'answer',
          directory: 'b',
          answers: [{ id: 'P4', value: 'playful' }],
        });
        expect(b.file).toBe(fileB);
        expect(recorded('P4', fileB)).toMatchObject({ value: 'playful', round: 1 });
        expect(settledA).toBe(false);
        expect(fs.existsSync(fileA)).toBe(false);
      } finally {
        hold.open();
      }
      const resultA = await a;
      expect(resultA.isError, JSON.stringify(resultA.payload)).toBe(false);
      expect(recorded('P4', fileA)).toMatchObject({ value: 'plain', round: 1 });
      expect(tempFiles(path.dirname(fileA))).toEqual([]);
    });

    it('a cancelled call finishes its write before the next call on that brief starts', async () => {
      const hold = gate();
      const reached = gate();
      let seamCalls = 0;
      await restart({
        brief: {
          beforeRename: async () => {
            seamCalls += 1;
            if (seamCalls > 1) return;
            reached.open();
            await hold.promise;
          },
        },
      });
      // initializes the session (ids 1 and 2); no file and no idea writes nothing
      await ok({ action: 'status' });

      void callWithId({ action: 'answer', answers: [{ id: 'P4', value: 'plain' }] }, 11);
      await reached.promise;
      await server.notify('notifications/cancelled', { requestId: 11 });
      let second: Awaited<ReturnType<typeof callWithId>> | undefined;
      const pending = callWithId(
        { action: 'answer', answers: [{ id: 'P1', value: 'Know the hours.' }] },
        12
      ).then(response => {
        second = response;
        return response;
      });
      // a later request is answered only after the cancellation and B were read
      await server.request('ping', undefined, 13);
      await delay(100);
      try {
        expect(seamCalls).toBe(1);
        expect(second).toBeUndefined();
      } finally {
        hold.open();
      }
      const response = await pending;
      await delay(500);

      expect(response.error).toBeUndefined();
      expect((response.result as { isError?: boolean }).isError).not.toBe(true);
      expect(framesWithId(11)).toEqual([]);
      const a = recorded('P4');
      const b = recorded('P1');
      expect(a).toMatchObject({ value: 'plain' });
      expect(b).toMatchObject({ value: 'Know the hours.' });
      expect(b?.round).toBe((a?.round ?? Number.NaN) + 1);
      expect(tempFiles(root)).toEqual([]);
    });
  });
});
