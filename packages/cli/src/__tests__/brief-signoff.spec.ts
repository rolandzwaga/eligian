/**
 * Spec 059 Phase 2 (FR-028 to FR-031, FR-039, SC-007; plan §10): the storyboard sign-off.
 *
 * `checkStoryboard (pure)`: the five checks of FR-029 (and FR-039's subset for an addition) over
 * the `STORYBOARD.md` fixtures in `__fixtures__/mcp/brief/storyboards/`, against fixed
 * evaluations. No server, no fs beyond reading the fixtures.
 *
 * `confirm` (FR-018 to FR-022, FR-027, P6, P7; SC-004 and SC-005 confirm halves): the in-memory
 * server with the FR-059 client (announcing elicitation, answering through `onElicit`), a temp
 * project and state directory per test, the brief completed by the terse persona.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PARSED, writeBrief } from '../mcp/brief/brief-file.js';
import {
  type Answer,
  applyAnswers,
  type BriefState,
  EMPTY_BRIEF,
  type Evaluation,
  evaluate,
  type Facts,
  viewBasis,
} from '../mcp/brief/engine.js';
import { type AdditionScope, type ScopeContext, scopedTree } from '../mcp/brief/scoped.js';
import {
  checkAdditionStoryboard,
  checkStoryboard,
  type StoryboardProblem,
} from '../mcp/brief/storyboard-check.js';
import { type AnswerValue, TREE, TREE_VERSION } from '../mcp/brief/tree.js';
import { readStoryboard, type Storyboard } from '../mcp/storyboard.js';
import {
  approvedBrief,
  evaluateBriefFile,
  snapshotFiles,
  storyboardFor,
  tempProject,
} from './brief-helpers.js';
import { loadPersona, runPersona, type Step } from './brief-persona-driver.js';
import {
  type ElicitAnswer,
  type ElicitRequest,
  type InMemoryServer,
  startInMemoryServer,
} from './mcp-test-client.js';

const STORYBOARDS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'brief', 'storyboards');
const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');

const storyboardOf = (file: string): Storyboard =>
  readStoryboard(fs.readFileSync(path.join(STORYBOARDS, file), 'utf8'));

const facts = (extra: Partial<Facts> = {}): Facts => ({
  briefDir: '.',
  exists: () => false,
  inside: () => true,
  ...extra,
});

const a = (id: string, value: AnswerValue): Answer => ({ id, value, by: 'user', round: 1 });

const isVAnswer = (id: string) => /^V[1-6]?:/.test(id);

/** Each V answer gets the current basis of its view (Phase 1 FR-016), so none is stale. */
function withBasis(brief: BriefState): BriefState {
  return {
    ...brief,
    answers: brief.answers.map(answer =>
      isVAnswer(answer.id)
        ? { ...answer, basis: viewBasis(brief, answer.id.slice(answer.id.indexOf(':') + 1)) }
        : answer
    ),
  };
}

const VIEWS = ['Intro', 'Details'] as const;

/**
 * A completed brief: S2 two views (Intro, Details), S4 one navigate row, S6 raf, L1 en-US
 * (default) + nl-NL, I1 a play control, I2 one key, V6 one reaction (Intro), H1 none, no assets.
 */
const COMPLETE: BriefState = withBasis({
  treeVersion: TREE_VERSION,
  answers: [
    a('P1', 'Know the product.'),
    a('P2', 'none'),
    a('P3', 'Developers new to it.'),
    a('P4', 'friendly'),
    a('P5', 90),
    a('C1', 'self-paced'),
    a('C2', [{ device: 'desktop', primary: 'yes' }]),
    a('C3', ['mouse', 'keyboard']),
    a('C4', 'off'),
    a('C5', 'online'),
    a('S1', 'hub-and-chapters'),
    a('S2', [
      { name: 'Intro', purpose: 'The opening' },
      { name: 'Details', purpose: 'The points' },
    ]),
    a('S3', 'Intro'),
    a('S4', [{ view: 'Intro', target: 'Details', trigger: 'click #next' }]),
    a('S5', [
      { view: 'Intro', end: 'stay' },
      { view: 'Details', end: 'stay' },
    ]),
    a('S6', [
      { view: 'Intro', provider: 'raf', source: '-' },
      { view: 'Details', provider: 'raf', source: '-' },
    ]),
    a('S8', 'stay'),
    ...VIEWS.flatMap(view => [
      a(`V1:${view}`, `The ${view} idea.`),
      a(`V2:${view}`, `${view} text.`),
      a(`V3:${view}`, 'none'),
      a(`V4:${view}`, 'The points fade in.'),
      a(`V5:${view}`, { duration: '8', pacing: 'fixed', 'cues-from': '-' }),
    ]),
    a('V6:Intro', 'The #next button opens Details.'),
    a('V6:Details', 'none'),
    a('I1', 'A play button on Details.'),
    a('I2', [{ key: 'Escape', action: 'back to Intro' }]),
    a('I3', 'none'),
    a('I4', 'restart'),
    a('D1', 'none'),
    a('D2', 'Dark background, white text.'),
    a('D3', [{ font: 'Inter', source: 'system', file: '-', licence: 'OFL' }]),
    a('D4', { choice: 'fluid', detail: 'two breakpoints' }),
    a('D5', [
      { view: 'Intro', layout: 'title' },
      { view: 'Details', layout: 'two columns' },
    ]),
    a('D6', 'Short fades.'),
    a('D7', 'shorten'),
    a('L1', [
      { code: 'en-US', default: 'yes' },
      { code: 'nl-NL', default: 'no' },
    ]),
    a('L2', [
      { language: 'en-US', supplier: 'the author', when: 'now' },
      { language: 'nl-NL', supplier: 'a translator', when: 'before launch' },
    ]),
    a('L3', 'A switch in the top right corner.'),
    a('H1', 'none'),
    a('X1', 'best-effort'),
    a('X2', true),
    a('X3', { focus: 'yes', announce: 'yes' }),
    a('R1', { choice: 'standalone', detail: 'a page' }),
    a('R2', 'evergreen'),
    a('R3', 'main.eligian'),
    a('R4', false),
    a('W1', 'nothing'),
    a('W2', 'end'),
    a('W3', 'It plays.'),
  ],
});

const EVALUATION: Evaluation = evaluate(TREE, COMPLETE, facts());

const codes = (problems: readonly StoryboardProblem[]) => problems.map(p => p.code);

/** SC-007: one failing `STORYBOARD.md` per FR-029 problem, each against `EVALUATION`. */
const SC007_FIXTURES = [
  ['ignored-row.md', 'storyboard-ignored-rows'],
  ['missing-view.md', 'storyboard-views'],
  ['extra-view.md', 'storyboard-views'],
  ['wrong-case-view.md', 'storyboard-views'],
  ['beat-unknown-timeline.md', 'storyboard-views'],
  ['provider-set.md', 'storyboard-header'],
  ['languages.md', 'storyboard-header'],
  ['default-marker.md', 'storyboard-header'],
  ['assets.md', 'storyboard-header'],
  ['host-module.md', 'storyboard-header'],
  ['dash-end-block.md', 'storyboard-end-block'],
  ['missing-navigate-row.md', 'storyboard-interactions'],
  ['missing-key-row.md', 'storyboard-interactions'],
  ['i1-no-playback-row.md', 'storyboard-interactions'],
  ['v6-no-non-key-row.md', 'storyboard-interactions'],
] as const;

// The additions: a view Outro reached from Details, the language de-DE, a host module.
const OUTRO: AdditionScope = { addition: 'view', name: 'Outro' };
const GERMAN: AdditionScope = { addition: 'language', name: 'de-DE' };
const HOST: AdditionScope = { addition: 'host-module', name: '' };

const settled = (id: string): AnswerValue | undefined =>
  EVALUATION.instances.find(i => i.id === id && i.status === 'answered')?.value;

const CONTEXT: ScopeContext = { get: settled };

/** An addition's evaluation (P11: the scoped tree, the views fixed to the addition's). */
function additionEvaluation(
  scope: AdditionScope,
  input: readonly { readonly id: string; readonly value: unknown }[]
): Evaluation {
  const tree = scopedTree(scope, CONTEXT);
  const f = facts(scope.addition === 'view' ? { views: [scope.name] } : {});
  const result = applyAnswers(tree, EMPTY_BRIEF, f, input, 1);
  expect(result.rejected).toEqual([]);
  return evaluate(tree, result.brief, f);
}

describe('checkStoryboard (pure)', () => {
  it('the fixed evaluation is a completed brief', () => {
    expect(EVALUATION.frontier.map(i => i.id)).toEqual([]);
    expect(EVALUATION.state).toBe('complete');
    expect(EVALUATION.views).toEqual(['Intro', 'Details']);
  });

  it('pass.md → []', () => {
    expect(checkStoryboard(storyboardOf('pass.md'), EVALUATION)).toEqual([]);
  });

  it.each(SC007_FIXTURES)('%s → %s', (file, code) => {
    const problems = checkStoryboard(storyboardOf(file), EVALUATION);
    expect(codes(problems)).toEqual([code]);
    expect(problems[0].message.length).toBeGreaterThan(0);
  });

  it('the problems come in FR-029 order, one per check', () => {
    const text = fs
      .readFileSync(path.join(STORYBOARDS, 'pass.md'), 'utf8')
      .replace('- provider: raf', '- provider: video')
      .replace('## view Details', '## view details')
      .replace('| key Escape |', '| click #back |')
      .replace(
        '| Intro | 2 | 6 | #tagline | addClass is-visible | removeClass is-visible |',
        '| Intro | 2 | 6 | #tagline | addClass is-visible | - |\n| Intro | 6 | 7 |'
      );
    expect(codes(checkStoryboard(readStoryboard(text), EVALUATION))).toEqual([
      'storyboard-ignored-rows',
      'storyboard-views',
      'storyboard-header',
      'storyboard-end-block',
      'storyboard-interactions',
    ]);
  });

  it('languages: none is accepted when L1 has one code, and only then', () => {
    const one = evaluate(
      TREE,
      withBasis({
        ...COMPLETE,
        answers: COMPLETE.answers
          .filter(answer => answer.id !== 'L2' && answer.id !== 'L3')
          .map(answer =>
            answer.id === 'L1' ? a('L1', [{ code: 'en-US', default: 'yes' }]) : answer
          ),
      }),
      facts()
    );
    expect(one.frontier).toEqual([]);
    const text = fs.readFileSync(path.join(STORYBOARDS, 'pass.md'), 'utf8');
    const none = text.replace('- languages: en-US (default), nl-NL', '- languages: none');
    const listed = text.replace(
      '- languages: en-US (default), nl-NL',
      '- languages: en-US (default)'
    );
    expect(checkStoryboard(readStoryboard(none), one)).toEqual([]);
    expect(checkStoryboard(readStoryboard(listed), one)).toEqual([]);
    expect(codes(checkStoryboard(readStoryboard(none), EVALUATION))).toEqual(['storyboard-header']);
  });

  it('an absent header line is a storyboard-header problem', () => {
    const text = fs
      .readFileSync(path.join(STORYBOARDS, 'pass.md'), 'utf8')
      .replace('- host module: none\n', '');
    expect(codes(checkStoryboard(readStoryboard(text), EVALUATION))).toEqual(['storyboard-header']);
  });

  describe('checkAdditionStoryboard (FR-039)', () => {
    const outro = additionEvaluation(OUTRO, [
      { id: 'S4', value: [{ view: 'Details', target: 'Outro', trigger: 'click #more' }] },
      { id: 'S6', value: { provider: 'raf', source: '-' } },
    ]);
    const german = additionEvaluation(GERMAN, []);
    const host = additionEvaluation(HOST, [
      { id: 'H1', value: [{ need: 'analytics', detail: 'page views' }] },
    ]);
    const evaluationOf = (scope: AdditionScope) =>
      scope === OUTRO ? outro : scope === GERMAN ? german : host;

    it.each([
      ['addition-no-view-section.md', OUTRO, 'storyboard-views'],
      ['addition-no-end-block.md', OUTRO, 'storyboard-end-block'],
      ['addition-missing-s4-row.md', OUTRO, 'storyboard-interactions'],
      ['addition-language-missing.md', GERMAN, 'storyboard-header'],
      ['addition-host-module-none.md', HOST, 'storyboard-header'],
    ] as const)('%s → %s', (file, scope, code) => {
      const problems = checkAdditionStoryboard(storyboardOf(file), scope, evaluationOf(scope));
      expect(codes(problems)).toEqual([code]);
      expect(problems[0].message.length).toBeGreaterThan(0);
    });

    it('each fixture passes the checks of the other additions (controls)', () => {
      // addition-language-missing.md has the whole Outro view and a host module line.
      const languageMissing = storyboardOf('addition-language-missing.md');
      expect(checkAdditionStoryboard(languageMissing, OUTRO, outro)).toEqual([]);
      expect(checkAdditionStoryboard(languageMissing, HOST, host)).toEqual([]);
      // addition-host-module-none.md lists de-DE and has the whole Outro view.
      const hostNone = storyboardOf('addition-host-module-none.md');
      expect(checkAdditionStoryboard(hostNone, GERMAN, german)).toEqual([]);
      expect(checkAdditionStoryboard(hostNone, OUTRO, outro)).toEqual([]);
      // The view fixtures fail only the view addition.
      for (const file of [
        'addition-no-view-section.md',
        'addition-no-end-block.md',
        'addition-missing-s4-row.md',
      ]) {
        expect(checkAdditionStoryboard(storyboardOf(file), GERMAN, german)).toEqual([]);
        expect(checkAdditionStoryboard(storyboardOf(file), HOST, host)).toEqual([]);
      }
    });

    it('an addition checks only what it touches: ignored rows still count', () => {
      const ignored = storyboardOf('ignored-row.md');
      expect(codes(checkAdditionStoryboard(ignored, HOST, host))).toEqual([
        'storyboard-ignored-rows',
        'storyboard-header',
      ]);
      // The main views' problems are not the addition's.
      const extra = storyboardOf('extra-view.md');
      expect(codes(checkAdditionStoryboard(extra, GERMAN, german))).toEqual(['storyboard-header']);
    });

    it('an S4 of none needs no interactions row', () => {
      const none = additionEvaluation(OUTRO, [
        { id: 'S4', value: 'none' },
        { id: 'S6', value: { provider: 'raf', source: '-' } },
      ]);
      expect(
        checkAdditionStoryboard(storyboardOf('addition-missing-s4-row.md'), OUTRO, none)
      ).toEqual([]);
    });
  });
});

const TERSE = loadPersona('terse');
const CONFIRMED_LINE =
  /^- confirmation: (elicitation|agent-reported) \S+ round \d+ hmac-sha256:[0-9a-f]{64}$/m;
const TICKET = /^hmac-sha256:[0-9a-f]{64}$/;
const ACCEPT: ElicitAnswer = { action: 'accept', content: { confirmed: true } };
const CHANGED_WHILE_ASKING = 'BRIEF.md changed while asking; call again';

/** A promise resolved by hand. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(open => {
    resolve = open;
  });
  return { promise, resolve };
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Polls until `condition` holds (5 s at most). */
async function waitFor(condition: () => boolean): Promise<void> {
  for (let n = 0; n < 500 && !condition(); n++) await delay(10);
  expect(condition()).toBe(true);
}

describe('confirm by elicitation (FR-018 to FR-022)', () => {
  let root: string;
  let stateDir: string;
  let file: string;
  let server: InMemoryServer | undefined;
  /** This test's answer to every elicitation/create request. */
  let answer: (request: ElicitRequest) => ElicitAnswer | Promise<ElicitAnswer> | undefined;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-signoff-')));
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-signoff-state-'));
    file = path.join(root, 'BRIEF.md');
    answer = () => ACCEPT;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.close();
    server = undefined;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  /** A server whose client announces elicitation (unless `elicitation: false`). */
  const start = async (
    options: { readonly elicitation?: boolean; readonly elicitationTimeoutMs?: number } = {}
  ): Promise<void> => {
    await server?.close();
    const brief = {
      stateDir,
      ...(options.elicitationTimeoutMs === undefined
        ? {}
        : { elicitationTimeoutMs: options.elicitationTimeoutMs }),
    };
    server = await startInMemoryServer(
      { cwd: root, docsRoot: DOCS, brief },
      options.elicitation === false ? {} : { elicitation: true, onElicit: r => answer(r) }
    );
  };

  const running = (): InMemoryServer => {
    if (server === undefined) throw new Error('no server');
    return server;
  };

  const call = (args: Record<string, unknown>) => running().callTool('eligian_brief', args);

  const ok = async (args: Record<string, unknown>) => {
    const result = await call(args);
    expect(result.isError, JSON.stringify(result.payload)).toBe(false);
    return result.payload;
  };

  /** The terse persona's brief, complete (no elicitation on the way). */
  const complete = async () => {
    const run = await runPersona(
      TERSE,
      async answers => (await ok({ action: 'answer', answers })) as Step,
      async () => (await ok({ action: 'status', idea: TERSE.idea })) as Step
    );
    expect(run.final.state).toBe('complete');
    return run.final;
  };

  const elicitationFrames = () =>
    running()
      .frames()
      .filter(
        f =>
          typeof f === 'object' && f !== null && Reflect.get(f, 'method') === 'elicitation/create'
      );

  const lastMessage = (): string => {
    const all = running().elicitations() as ElicitRequest[];
    return all[all.length - 1].message;
  };

  const bytes = () => fs.readFileSync(file);

  describe('the form', () => {
    it('the elicitation/create request has one required boolean confirmed and no number, integer or array property', async () => {
      await start();
      await complete();
      await ok({ action: 'confirm' });
      const requests = running().elicitations() as ElicitRequest[];
      expect(requests).toHaveLength(1);
      const schema = requests[0].requestedSchema as {
        properties: Record<string, { type: string }>;
        required: string[];
      };
      expect(Object.keys(schema.properties)).toEqual(['confirmed']);
      expect(schema.properties.confirmed.type).toBe('boolean');
      expect(schema.required).toEqual(['confirmed']);
      const json = JSON.stringify(schema);
      for (const type of ['number', 'integer', 'array']) expect(json).not.toContain(`"${type}"`);
    });

    it('exactly one elicitation/create frame per confirm call', async () => {
      answer = () => ({ action: 'cancel' });
      await start();
      await complete();
      expect(elicitationFrames()).toHaveLength(0);
      await ok({ action: 'confirm' });
      expect(elicitationFrames()).toHaveLength(1);
      await ok({ action: 'confirm', confirmation: 'Yes' });
      expect(elicitationFrames()).toHaveLength(2);
    });
  });

  describe('outcomes', () => {
    it('accept { confirmed: true }: state confirmed, line mode elicitation, no confirmation-message', async () => {
      await start();
      await complete();
      const reply = await ok({ action: 'confirm' });
      expect(reply.state).toBe('confirmed');
      expect(reply.refused).toBeUndefined();
      expect(reply.signoff).toEqual({ mode: 'elicitation' });
      const text = fs.readFileSync(file, 'utf8');
      expect(CONFIRMED_LINE.exec(text)?.[1]).toBe('elicitation');
      expect(text).not.toContain('- confirmation-message:');
    });

    it('accept { confirmed: false } and decline, with and without confirmation: declined, nothing written', async () => {
      await start();
      await complete();
      const before = bytes();
      const answers: ElicitAnswer[] = [
        { action: 'accept', content: { confirmed: false } },
        { action: 'decline' },
      ];
      for (const given of answers) {
        answer = () => given;
        for (const confirmation of [undefined, 'Yes, go ahead.']) {
          const reply = await ok({
            action: 'confirm',
            ...(confirmation === undefined ? {} : { confirmation }),
          });
          expect(reply.state).toBe('complete');
          expect(reply.refused).toEqual({ code: 'declined' });
          expect(reply.signoff).toBeUndefined();
          expect(bytes().equals(before)).toBe(true);
        }
      }
      expect(elicitationFrames()).toHaveLength(4);
    });

    it('cancel, with and without confirmation: elicitation-unavailable cancelled, the summary, a ticket, nothing written', async () => {
      answer = () => ({ action: 'cancel' });
      await start();
      await complete();
      const before = bytes();
      for (const confirmation of [undefined, 'Yes, go ahead.']) {
        const reply = await ok({
          action: 'confirm',
          ...(confirmation === undefined ? {} : { confirmation }),
        });
        expect(reply.state).toBe('complete');
        expect(reply.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
        expect(reply.summary).toBe(lastMessage());
        expect(reply.ticket).toMatch(TICKET);
        expect(reply.next).toContain('ticket');
        expect(bytes().equals(before)).toBe(true);
      }
    });

    it('a later call with confirmation and that ticket signs agent-reported with the message verbatim, without eliciting', async () => {
      answer = () => ({ action: 'cancel' });
      await start();
      await complete();
      const cancelled = await ok({ action: 'confirm' });
      const frames = elicitationFrames().length;
      const message = 'Yes, "that is it".\nGo.';
      const reply = await ok({
        action: 'confirm',
        confirmation: message,
        ticket: cancelled.ticket,
      });
      expect(reply.state).toBe('confirmed');
      expect(reply.signoff).toEqual({ mode: 'agent-reported' });
      expect(elicitationFrames()).toHaveLength(frames);
      const text = fs.readFileSync(file, 'utf8');
      expect(CONFIRMED_LINE.exec(text)?.[1]).toBe('agent-reported');
      expect(JSON.parse(/^- confirmation-message: (.*)$/m.exec(text)?.[1] ?? 'null')).toBe(message);
    });

    it('a ticket made before a hand edit of BRIEF.md, and a hand-typed ticket, elicit again and sign nothing on cancel', async () => {
      answer = () => ({ action: 'cancel' });
      await start();
      await complete();
      const cancelled = await ok({ action: 'confirm' });
      // a hand edit that keeps the brief complete: one more blank line at the end
      fs.appendFileSync(file, '\n');
      const edited = bytes();
      const tickets = [cancelled.ticket, `hmac-sha256:${'0'.repeat(64)}`, 'typed by hand'];
      for (const [n, ticket] of tickets.entries()) {
        const reply = await ok({ action: 'confirm', confirmation: 'Yes', ticket });
        expect(reply.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
        expect(reply.ticket).not.toBe(cancelled.ticket);
        expect(elicitationFrames()).toHaveLength(n + 2);
        expect(bytes().equals(edited)).toBe(true);
      }
    });

    it('no answer (elicitationTimeoutMs: 200): outcome no-answer within 2 s, nothing written, a ticket', async () => {
      answer = () => undefined;
      await start({ elicitationTimeoutMs: 200 });
      await complete();
      const before = bytes();
      const started = Date.now();
      const reply = await ok({ action: 'confirm', confirmation: 'Yes' });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(reply.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'no-answer' });
      expect(reply.ticket).toMatch(TICKET);
      expect(reply.summary).toBe(lastMessage());
      expect(bytes().equals(before)).toBe(true);
    });

    it('a client without the capability: no elicitation/create frame; confirmation without a ticket signs agent-reported in that call', async () => {
      await start({ elicitation: false });
      await complete();
      const reply = await ok({ action: 'confirm', confirmation: 'Yes' });
      expect(reply.state).toBe('confirmed');
      expect(reply.signoff).toEqual({ mode: 'agent-reported' });
      expect(elicitationFrames()).toHaveLength(0);
      expect(CONFIRMED_LINE.exec(fs.readFileSync(file, 'utf8'))?.[1]).toBe('agent-reported');
    });

    it('accept with content {} is declined (P6), nothing written, one "elicitation answer did not decode" line on stderr', async () => {
      answer = () => ({ action: 'accept', content: {} });
      await start();
      await complete();
      const before = bytes();
      // stderr: the stream itself, and `console.error`, which the server's stderr logger writes
      // to (`stdio.ts` `stderrLoggerLayer`; in `eligian mcp` the console is redirected to stderr,
      // in process vitest owns it, as `mcp-stdout.spec.ts`'s tool-defect case reads it)
      const stderr: string[] = [];
      const write = process.stderr.write.bind(process.stderr);
      vi.spyOn(process.stderr, 'write').mockImplementation(((
        chunk: string | Uint8Array,
        ...rest: unknown[]
      ) => {
        stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return Reflect.apply(write, process.stderr, [chunk, ...rest]);
      }) as typeof process.stderr.write);
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        stderr.push(`${args.map(String).join(' ')}\n`);
      });
      const reply = await ok({ action: 'confirm' });
      expect(reply.refused).toEqual({ code: 'declined' });
      expect(bytes().equals(before)).toBe(true);
      const lines = stderr
        .join('')
        .split('\n')
        .filter(line => line.includes('elicitation answer did not decode'));
      expect(lines).toHaveLength(1);
    });

    it('a JSON-RPC error answer is cancelled (P6)', async () => {
      answer = () => ({ error: { code: -32603, message: 'x' } });
      await start();
      await complete();
      const before = bytes();
      const reply = await ok({ action: 'confirm' });
      expect(reply.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
      expect(reply.ticket).toMatch(TICKET);
      expect(bytes().equals(before)).toBe(true);
    });
  });

  describe('messages', () => {
    it("confirm's message contains the absolute BRIEF.md path and the delegated answer's id and value", async () => {
      await start();
      const final = (await complete()) as Step & {
        readonly delegated?: readonly { readonly id: string; readonly value: unknown }[];
      };
      await ok({ action: 'confirm' });
      const message = lastMessage();
      expect(path.isAbsolute(file)).toBe(true);
      expect(message).toContain(file);
      const delegated = final.delegated ?? [];
      expect(delegated.length).toBeGreaterThan(0);
      for (const { id, value } of delegated) {
        expect(message).toContain(id);
        expect(message).toContain(typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
  });

  describe('no permit during a dialog (SC-005)', () => {
    it('status resolves while the confirm dialog is pending', async () => {
      const dialog = deferred<ElicitAnswer>();
      answer = () => dialog.promise;
      await start();
      await complete();
      const confirming = ok({ action: 'confirm' });
      await waitFor(() => running().elicitations().length === 1);
      const status = await ok({ action: 'status' });
      expect(status.state).toBe('complete');
      dialog.resolve(ACCEPT);
      expect((await confirming).state).toBe('confirmed');
    });

    it('a hand edit during the dialog → kind io "BRIEF.md changed while asking; call again", the edit kept', async () => {
      const dialog = deferred<ElicitAnswer>();
      answer = () => dialog.promise;
      await start();
      await complete();
      const confirming = call({ action: 'confirm' });
      await waitFor(() => running().elicitations().length === 1);
      fs.appendFileSync(file, '\n');
      const edited = bytes();
      dialog.resolve(ACCEPT);
      const result = await confirming;
      expect(result.isError).toBe(true);
      expect(result.payload.error).toMatchObject({ kind: 'io', message: CHANGED_WHILE_ASKING });
      expect(bytes().equals(edited)).toBe(true);
    });

    it('notifications/cancelled during the dialog: no frame for that id, a later status within 2 s, a late answer changes nothing', async () => {
      const dialog = deferred<ElicitAnswer>();
      answer = () => dialog.promise;
      await start();
      await complete();
      const before = bytes();
      const id = 1000;
      void running().request(
        'tools/call',
        { name: 'eligian_brief', arguments: { action: 'confirm' } },
        id
      );
      await waitFor(() => running().elicitations().length === 1);
      await running().notify('notifications/cancelled', { requestId: id });
      const started = Date.now();
      const status = await ok({ action: 'status' });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(status.state).toBe('complete');
      dialog.resolve(ACCEPT);
      await delay(300);
      const framesForId = running()
        .frames()
        .filter(f => typeof f === 'object' && f !== null && Reflect.get(f, 'id') === id);
      expect(framesForId).toEqual([]);
      expect(bytes().equals(before)).toBe(true);
    });
  });
});

const APPROVAL_LINE =
  /^- approval: (elicitation|agent-reported|existing-storyboard) \S+ hmac-sha256:[0-9a-f]{64}$/m;
const STORYBOARD_CHANGED_WHILE_ASKING = 'STORYBOARD.md changed while asking; call again';

/** Accepts every form with its one boolean ticked (`confirmed`, `approved` or `accepted`). */
const acceptAll = (request: ElicitRequest): ElicitAnswer => ({
  action: 'accept',
  content: Object.fromEntries(
    Object.keys((request.requestedSchema as { properties: object }).properties).map(k => [k, true])
  ),
});

/** The form's one field, `approved` for `approve-storyboard`. */
const fieldOf = (request: ElicitRequest): string =>
  Object.keys((request.requestedSchema as { properties: object }).properties)[0];

describe('approve-storyboard (FR-028 to FR-031, P19, SC-007)', () => {
  let root: string;
  let stateDir: string;
  let briefFile: string;
  let storyboardFile: string;
  let server: InMemoryServer | undefined;
  let answer: (request: ElicitRequest) => ElicitAnswer | Promise<ElicitAnswer> | undefined;
  /** While true, the record update's seam rewrites programs.json, so every attempt aborts. */
  let failRecord: boolean;

  beforeEach(() => {
    root = tempProject();
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-approve-state-'));
    briefFile = path.join(root, 'BRIEF.md');
    storyboardFile = path.join(root, 'STORYBOARD.md');
    answer = acceptAll;
    failRecord = false;
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  const start = async (
    options: { readonly elicitation?: boolean; readonly elicitationTimeoutMs?: number } = {}
  ): Promise<void> => {
    let n = 0;
    const brief = {
      stateDir,
      recordBeforeRename: async (target: string) => {
        if (failRecord) {
          n++;
          fs.writeFileSync(
            target,
            `${JSON.stringify({ version: 1, programs: [] })}${' '.repeat(n)}`
          );
        }
      },
      ...(options.elicitationTimeoutMs === undefined
        ? {}
        : { elicitationTimeoutMs: options.elicitationTimeoutMs }),
    };
    server = await startInMemoryServer(
      { cwd: root, docsRoot: DOCS, brief },
      options.elicitation === false ? {} : { elicitation: true, onElicit: r => answer(r) }
    );
  };

  const running = (): InMemoryServer => {
    if (server === undefined) throw new Error('no server');
    return server;
  };

  const call = (args: Record<string, unknown>) => running().callTool('eligian_brief', args);

  const ok = async (args: Record<string, unknown>) => {
    const result = await call(args);
    expect(result.isError, JSON.stringify(result.payload)).toBe(false);
    return result.payload;
  };

  const approve = (extra: Record<string, unknown> = {}) =>
    ok({ action: 'approve-storyboard', ...extra });

  /** `COMPLETE` (the T016 evaluation's brief) as `BRIEF.md`. */
  const writeComplete = () =>
    fs.writeFileSync(
      briefFile,
      writeBrief(
        TREE,
        { ...EMPTY_PARSED, brief: COMPLETE },
        {
          state: 'complete',
          serverEligian: '0.0.0',
          eligianInstalled: undefined,
          packageManager: undefined,
          textDirection: undefined,
          assets: [],
        }
      )
    );

  /** `COMPLETE`, confirmed through the server (the dialog where the client elicits). */
  const confirmed = async () => {
    writeComplete();
    const reply = await ok({ action: 'confirm', confirmation: 'Yes, that is the brief.' });
    expect(reply.state).toBe('confirmed');
  };

  const useStoryboard = (fixture: string) =>
    fs.copyFileSync(path.join(STORYBOARDS, fixture), storyboardFile);

  const elicitations = () => running().elicitations() as ElicitRequest[];

  const recordPrograms = (): readonly Record<string, unknown>[] =>
    JSON.parse(fs.readFileSync(path.join(root, '.eligian', 'programs.json'), 'utf8')).programs;

  const R3_ENTRY = {
    path: 'main.eligian',
    timelines: ['Intro', 'Details'],
    languages: ['en-US', 'nl-NL'],
    extensions: false,
    via: 'brief',
  };

  it('refused brief-not-confirmed before confirmation', async () => {
    await start();
    writeComplete();
    useStoryboard('pass.md');
    await ok({ action: 'status' });
    const before = snapshotFiles(root);
    const reply = await approve({ confirmation: 'Yes' });
    expect(reply.state).toBe('complete');
    expect(reply.refused).toEqual({ code: 'brief-not-confirmed' });
    expect(elicitations()).toHaveLength(0);
    expect(snapshotFiles(root)).toEqual(before);
  });

  it('storyboard-missing', async () => {
    await start();
    await confirmed();
    const before = snapshotFiles(root);
    const reply = await approve({ confirmation: 'Yes' });
    expect(reply.state).toBe('confirmed');
    expect(reply.refused).toEqual({ code: 'storyboard-missing' });
    expect(reply.next).toContain('STORYBOARD.md');
    expect(elicitations()).toHaveLength(1);
    expect(snapshotFiles(root)).toEqual(before);
  });

  it.each(SC007_FIXTURES)(
    '%s beside the confirmed brief → storyboard-mismatch [%s], nothing written',
    async (fixture, code) => {
      await start();
      await confirmed();
      useStoryboard(fixture);
      const before = snapshotFiles(root);
      const reply = await approve({ confirmation: 'Yes' });
      expect(reply.state).toBe('confirmed');
      expect(reply.refused.code).toBe('storyboard-mismatch');
      expect(reply.refused.problems.map((p: { code: string }) => p.code)).toEqual([code]);
      expect(reply.refused.problems[0].message.length).toBeGreaterThan(0);
      // only the confirm dialog: a failing storyboard is never put to the user
      expect(elicitations()).toHaveLength(1);
      expect(snapshotFiles(root)).toEqual(before);
    }
  );

  it('a passing storyboard approves: state approved, line mode elicitation, the record lists R3 with via brief', async () => {
    await start();
    await confirmed();
    useStoryboard('pass.md');
    const reply = await approve();
    expect(reply.state).toBe('approved');
    expect(reply.refused).toBeUndefined();
    expect(reply.signoff).toEqual({ mode: 'elicitation' });
    expect(reply.next).toContain('eligian_init');
    expect(APPROVAL_LINE.exec(fs.readFileSync(briefFile, 'utf8'))?.[1]).toBe('elicitation');
    expect(recordPrograms()).toContainEqual(R3_ENTRY);
    expect((await ok({ action: 'status' })).state).toBe('approved');
  });

  it('approvedBrief (brief-helpers.ts) drives the terse persona to approved on a client without elicitation', async () => {
    await start({ elicitation: false });
    const evaluation = await approvedBrief(running(), root, { stateDir });
    expect(evaluation.state).toBe('approved');
    expect(elicitations()).toHaveLength(0);
    expect(recordPrograms()).toContainEqual({
      path: 'main.eligian',
      timelines: evaluation.views,
      languages: ['en-US'],
      extensions: false,
      via: 'brief',
    });
    const text = fs.readFileSync(storyboardFile, 'utf8');
    expect(checkStoryboard(readStoryboard(text), evaluation)).toEqual([]);
    expect(storyboardFor(await evaluateBriefFile(root, { stateDir }))).toBe(text);
  });

  describe('the four outcomes, field approved', () => {
    it('accept { approved: true } signs elicitation; the form has one required boolean approved', async () => {
      await start();
      await confirmed();
      useStoryboard('pass.md');
      const reply = await approve({ confirmation: 'ignored by the dialog' });
      expect(reply.state).toBe('approved');
      expect(reply.signoff).toEqual({ mode: 'elicitation' });
      const requests = elicitations();
      expect(requests).toHaveLength(2);
      const schema = requests[1].requestedSchema as {
        properties: Record<string, { type: string }>;
        required: string[];
      };
      expect(Object.keys(schema.properties)).toEqual(['approved']);
      expect(schema.properties.approved.type).toBe('boolean');
      expect(schema.required).toEqual(['approved']);
      expect(fs.readFileSync(briefFile, 'utf8')).not.toContain('- approval-message:');
    });

    it('accept { approved: false } and decline, with and without confirmation: declined, nothing written', async () => {
      await start();
      await confirmed();
      useStoryboard('pass.md');
      const before = snapshotFiles(root);
      const answers: ElicitAnswer[] = [
        { action: 'accept', content: { approved: false } },
        { action: 'decline' },
      ];
      for (const given of answers) {
        answer = () => given;
        for (const confirmation of [undefined, 'Yes, approve it.']) {
          const reply = await approve(confirmation === undefined ? {} : { confirmation });
          expect(reply.state).toBe('confirmed');
          expect(reply.refused).toEqual({ code: 'declined' });
          expect(reply.signoff).toBeUndefined();
          expect(reply.next).toContain('STORYBOARD.md');
          expect(snapshotFiles(root)).toEqual(before);
        }
      }
      expect(elicitations().slice(1).map(fieldOf)).toEqual([
        'approved',
        'approved',
        'approved',
        'approved',
      ]);
    });

    it('cancel: elicitation-unavailable cancelled, the summary, a ticket; a later call with the ticket signs agent-reported without eliciting', async () => {
      await start();
      await confirmed();
      useStoryboard('pass.md');
      answer = () => ({ action: 'cancel' });
      const before = snapshotFiles(root);
      const cancelled = await approve({ confirmation: 'Yes' });
      expect(cancelled.state).toBe('confirmed');
      expect(cancelled.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
      expect(cancelled.summary).toBe(elicitations()[1].message);
      expect(cancelled.ticket).toMatch(TICKET);
      expect(cancelled.next).toContain('ticket');
      expect(snapshotFiles(root)).toEqual(before);
      // a ticket made before a STORYBOARD.md edit does not verify: the call elicits again
      fs.appendFileSync(storyboardFile, '\n');
      const again = await approve({ confirmation: 'Yes', ticket: cancelled.ticket });
      expect(again.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
      expect(elicitations()).toHaveLength(3);
      const message = 'Yes, "approve" it.\nGo.';
      const reply = await approve({ confirmation: message, ticket: again.ticket });
      expect(reply.state).toBe('approved');
      expect(reply.signoff).toEqual({ mode: 'agent-reported' });
      expect(elicitations()).toHaveLength(3);
      const text = fs.readFileSync(briefFile, 'utf8');
      expect(APPROVAL_LINE.exec(text)?.[1]).toBe('agent-reported');
      expect(JSON.parse(/^- approval-message: (.*)$/m.exec(text)?.[1] ?? 'null')).toBe(message);
      expect(recordPrograms()).toContainEqual(R3_ENTRY);
    });

    it('no answer (elicitationTimeoutMs: 200): outcome no-answer within 2 s, nothing written, a ticket', async () => {
      await start({ elicitationTimeoutMs: 200 });
      await confirmed();
      useStoryboard('pass.md');
      answer = () => undefined;
      const before = snapshotFiles(root);
      const started = Date.now();
      const reply = await approve({ confirmation: 'Yes' });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(reply.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'no-answer' });
      expect(reply.ticket).toMatch(TICKET);
      expect(snapshotFiles(root)).toEqual(before);
    });

    it('a client without the capability: confirmation signs agent-reported in that call; none is confirmation-missing', async () => {
      await start({ elicitation: false });
      await confirmed();
      useStoryboard('pass.md');
      const before = snapshotFiles(root);
      const missing = await approve();
      expect(missing.refused).toEqual({ code: 'confirmation-missing' });
      expect(snapshotFiles(root)).toEqual(before);
      const reply = await approve({ confirmation: 'Approved.' });
      expect(reply.state).toBe('approved');
      expect(reply.signoff).toEqual({ mode: 'agent-reported' });
      expect(elicitations()).toHaveLength(0);
      expect(recordPrograms()).toContainEqual(R3_ENTRY);
    });
  });

  it("its message contains the absolute STORYBOARD.md path and the fixture's view, beat and interaction counts", async () => {
    await start();
    await confirmed();
    useStoryboard('pass.md');
    await approve();
    const message = elicitations()[1].message;
    expect(path.isAbsolute(storyboardFile)).toBe(true);
    expect(message).toContain(storyboardFile);
    // pass.md: 2 views, 4 beats, 3 interactions
    expect(message).toMatch(/\b2 views\b/);
    expect(message).toMatch(/\b4 beats\b/);
    expect(message).toMatch(/\b3 interactions\b/);
  });

  it('status resolves while the approve-storyboard dialog is pending; a hand edit to STORYBOARD.md during the dialog → io "STORYBOARD.md changed while asking; call again"', async () => {
    await start();
    await confirmed();
    useStoryboard('pass.md');
    const dialog = deferred<ElicitAnswer>();
    answer = () => dialog.promise;
    const brief = fs.readFileSync(briefFile);
    const approving = call({ action: 'approve-storyboard' });
    await waitFor(() => elicitations().length === 2);
    // SC-005 step 2: no permit is held while the dialog is open.
    const status = await ok({ action: 'status' });
    expect(status.state).toBe('confirmed');
    fs.appendFileSync(storyboardFile, '\n');
    const edited = fs.readFileSync(storyboardFile);
    dialog.resolve({ action: 'accept', content: { approved: true } });
    const result = await approving;
    expect(result.isError).toBe(true);
    expect(result.payload.error).toMatchObject({
      kind: 'io',
      message: STORYBOARD_CHANGED_WHILE_ASKING,
    });
    expect(fs.readFileSync(storyboardFile).equals(edited)).toBe(true);
    expect(fs.readFileSync(briefFile).equals(brief)).toBe(true);
  });

  it('a repeat approval is a no-op that re-tries the record write (P19)', async () => {
    await start();
    await confirmed();
    useStoryboard('pass.md');
    failRecord = true;
    const failed = await call({ action: 'approve-storyboard' });
    expect(failed.isError).toBe(true);
    expect(failed.payload.error).toMatchObject({ kind: 'io' });
    // the brief is approved, its program not recorded
    expect(APPROVAL_LINE.exec(fs.readFileSync(briefFile, 'utf8'))?.[1]).toBe('elicitation');
    expect(recordPrograms()).not.toContainEqual(R3_ENTRY);
    failRecord = false;
    const brief = fs.readFileSync(briefFile);
    const frames = elicitations().length;
    const reply = await approve();
    expect(reply.state).toBe('approved');
    expect(reply.refused).toBeUndefined();
    expect(reply.signoff).toBeUndefined();
    expect(elicitations()).toHaveLength(frames);
    expect(fs.readFileSync(briefFile).equals(brief)).toBe(true);
    expect(recordPrograms()).toContainEqual(R3_ENTRY);
  });
});

const PROGRAM_CHANGED_WHILE_ASKING = 'a program changed while asking; call again';

/** Two programs and a library, each with a copy string a copy edit can change. */
const ALPHA =
  'timeline "Alpha" in "#stage" using raf {\n  at 0s..1s addClass("#title", "copy-a")\n}\n';
const BETA =
  'languages {\n  * "en-US" "English"\n  "nl-NL" "Nederlands"\n}\n\ntimeline "Beta" in "#stage" using raf {\n  at 0s..1s addClass("#title", "copy-b")\n}\n';
const LIB = 'library shared\n\naction fade(selector) [\n  selectElement(selector)\n]\n';

describe('accept-existing (FR-009, FR-063, R-15)', () => {
  let root: string;
  let stateDir: string;
  let server: InMemoryServer | undefined;
  let answer: (request: ElicitRequest) => ElicitAnswer | Promise<ElicitAnswer> | undefined;

  beforeEach(() => {
    root = tempProject();
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-accept-state-'));
    answer = acceptAll;
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  const running = (): InMemoryServer => {
    if (server === undefined) throw new Error('no server');
    return server;
  };

  const call = (args: Record<string, unknown>) => running().callTool('eligian_brief', args);

  const ok = async (args: Record<string, unknown>) => {
    const result = await call(args);
    expect(result.isError, JSON.stringify(result.payload)).toBe(false);
    return result.payload;
  };

  /**
   * A server on the empty project; `status` waits for the first-run scan (an empty record), then
   * the programs arrive "without the agent": none of them is known.
   */
  const start = async (
    options: { readonly elicitation?: boolean; readonly elicitationTimeoutMs?: number } = {}
  ): Promise<void> => {
    const brief = {
      stateDir,
      ...(options.elicitationTimeoutMs === undefined
        ? {}
        : { elicitationTimeoutMs: options.elicitationTimeoutMs }),
    };
    server = await startInMemoryServer(
      { cwd: root, docsRoot: DOCS, brief },
      options.elicitation === false ? {} : { elicitation: true, onElicit: r => answer(r) }
    );
    await ok({ action: 'status' });
    fs.writeFileSync(path.join(root, 'a.eligian'), ALPHA);
    fs.mkdirSync(path.join(root, 'talk'));
    fs.writeFileSync(path.join(root, 'talk', 'b.eligian'), BETA);
    fs.writeFileSync(path.join(root, 'lib.eligian'), LIB);
  };

  const accept = (extra: Record<string, unknown> = {}) =>
    ok({ action: 'accept-existing', paths: ['.'], ...extra });

  const elicitations = () => running().elicitations() as ElicitRequest[];

  const recordFile = () => path.join(root, '.eligian', 'programs.json');

  const recordPrograms = (): readonly Record<string, unknown>[] =>
    JSON.parse(fs.readFileSync(recordFile(), 'utf8')).programs;

  const entries = (mode: string) => [
    {
      path: 'a.eligian',
      timelines: ['Alpha'],
      languages: [],
      extensions: false,
      via: 'accepted',
      mode,
    },
    {
      path: 'talk/b.eligian',
      timelines: ['Beta'],
      languages: ['en-US', 'nl-NL'],
      extensions: false,
      via: 'accepted',
      mode,
    },
  ];

  const appendTimeline = () =>
    fs.appendFileSync(
      path.join(root, 'a.eligian'),
      '\ntimeline "Gamma" in "#stage" using raf {}\n'
    );

  const copyEdit = () =>
    fs.writeFileSync(path.join(root, 'a.eligian'), ALPHA.replace('copy-a', 'copy-a-edited'));

  describe('the four outcomes, field accepted', () => {
    it('accept { accepted: true }: the programs are recorded via accepted, mode elicitation; the library is skipped', async () => {
      await start();
      const reply = await accept({ confirmation: 'ignored by the dialog' });
      expect(reply.refused).toBeUndefined();
      expect(reply.signoff).toEqual({ mode: 'elicitation' });
      expect(reply.accepted).toEqual(['a.eligian', 'talk/b.eligian']);
      expect(reply.skipped).toEqual([{ path: 'lib.eligian', reason: 'library' }]);
      expect(reply.state).toBe('open');
      const requests = elicitations();
      expect(requests).toHaveLength(1);
      const schema = requests[0].requestedSchema as {
        properties: Record<string, { type: string }>;
        required: string[];
      };
      expect(Object.keys(schema.properties)).toEqual(['accepted']);
      expect(schema.properties.accepted.type).toBe('boolean');
      expect(schema.required).toEqual(['accepted']);
      expect(recordPrograms()).toEqual(entries('elicitation'));
      // accept-existing never writes BRIEF.md
      expect(fs.existsSync(path.join(root, 'BRIEF.md'))).toBe(false);
    });

    it('accept { accepted: false } and decline, with and without confirmation: declined, nothing written', async () => {
      await start();
      const before = snapshotFiles(root);
      const answers: ElicitAnswer[] = [
        { action: 'accept', content: { accepted: false } },
        { action: 'decline' },
      ];
      for (const given of answers) {
        answer = () => given;
        for (const confirmation of [undefined, 'Yes, take them.']) {
          const reply = await accept(confirmation === undefined ? {} : { confirmation });
          expect(reply.refused).toEqual({ code: 'declined' });
          expect(reply.signoff).toBeUndefined();
          expect(reply.accepted).toBeUndefined();
          expect(snapshotFiles(root)).toEqual(before);
        }
      }
      expect(elicitations().map(fieldOf)).toEqual(['accepted', 'accepted', 'accepted', 'accepted']);
    });

    it('cancel, with and without confirmation: elicitation-unavailable cancelled, the summary, a ticket, nothing written', async () => {
      answer = () => ({ action: 'cancel' });
      await start();
      const before = snapshotFiles(root);
      for (const confirmation of [undefined, 'Yes, take them.']) {
        const reply = await accept(confirmation === undefined ? {} : { confirmation });
        expect(reply.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
        expect(reply.summary).toBe(elicitations()[elicitations().length - 1].message);
        expect(reply.ticket).toMatch(TICKET);
        expect(reply.next).toContain('ticket');
        expect(snapshotFiles(root)).toEqual(before);
      }
    });

    it('no answer (elicitationTimeoutMs: 200): outcome no-answer within 2 s, nothing written, a ticket', async () => {
      answer = () => undefined;
      await start({ elicitationTimeoutMs: 200 });
      const before = snapshotFiles(root);
      const started = Date.now();
      const reply = await accept({ confirmation: 'Yes' });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(reply.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'no-answer' });
      expect(reply.ticket).toMatch(TICKET);
      expect(snapshotFiles(root)).toEqual(before);
    });

    it('a client without the capability: confirmation signs agent-reported in that call; none is confirmation-missing', async () => {
      await start({ elicitation: false });
      const before = snapshotFiles(root);
      const missing = await accept();
      expect(missing.refused).toEqual({ code: 'confirmation-missing' });
      expect(missing.summary).toContain(path.join(root, 'a.eligian'));
      expect(snapshotFiles(root)).toEqual(before);
      const reply = await accept({ confirmation: 'Yes, they are mine.' });
      expect(reply.signoff).toEqual({ mode: 'agent-reported' });
      expect(reply.accepted).toEqual(['a.eligian', 'talk/b.eligian']);
      expect(elicitations()).toHaveLength(0);
      expect(recordPrograms()).toEqual(entries('agent-reported'));
    });
  });

  it("the message contains each program's path and its timeline names", async () => {
    await start();
    await accept();
    const message = elicitations()[0].message;
    expect(message).toContain(path.join(root, 'a.eligian'));
    expect(message).toContain(path.join(root, 'talk', 'b.eligian'));
    expect(message).toContain('Alpha');
    expect(message).toContain('Beta');
    expect(message).toContain('nl-NL');
    expect(message).not.toContain('lib.eligian');
  });

  it('the ticket verifies while the sorted paths and every scan are equal; a timeline appended to one program → the call elicits again; a copy edit → still verifies', async () => {
    answer = () => ({ action: 'cancel' });
    await start();
    const first = await accept();
    expect(first.ticket).toMatch(TICKET);
    // a copy edit leaves the scan equal: the ticket still verifies, no new dialog
    copyEdit();
    const frames = elicitations().length;
    const copied = await accept({ confirmation: 'Yes', ticket: first.ticket });
    expect(copied.signoff).toEqual({ mode: 'agent-reported' });
    expect(elicitations()).toHaveLength(frames);
    expect(recordPrograms()).toEqual(entries('agent-reported'));
    // other paths: the same ticket does not verify for c.eligian alone
    fs.writeFileSync(path.join(root, 'c.eligian'), 'timeline "Delta" in "#s" using raf {}\n');
    const other = await ok({
      action: 'accept-existing',
      paths: ['c.eligian'],
      confirmation: 'Yes',
      ticket: first.ticket,
    });
    expect(other.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
    expect(elicitations()).toHaveLength(frames + 1);
    // a timeline appended to c.eligian after its ticket: the scan changed, it elicits again
    fs.appendFileSync(path.join(root, 'c.eligian'), '\ntimeline "Epsilon" in "#s" using raf {}\n');
    const before = snapshotFiles(root);
    const again = await ok({
      action: 'accept-existing',
      paths: ['c.eligian'],
      confirmation: 'Yes',
      ticket: other.ticket,
    });
    expect(again.refused).toEqual({ code: 'elicitation-unavailable', outcome: 'cancelled' });
    expect(elicitations()).toHaveLength(frames + 2);
    expect(snapshotFiles(root)).toEqual(before);
  });

  it('an appended timeline during the dialog → io "a program changed while asking; call again", record unchanged', async () => {
    const dialog = deferred<ElicitAnswer>();
    answer = () => dialog.promise;
    await start();
    const record = fs.readFileSync(recordFile());
    const accepting = call({ action: 'accept-existing', paths: ['.'] });
    await waitFor(() => elicitations().length === 1);
    appendTimeline();
    const programs = {
      a: fs.readFileSync(path.join(root, 'a.eligian')),
      b: fs.readFileSync(path.join(root, 'talk', 'b.eligian')),
    };
    dialog.resolve({ action: 'accept', content: { accepted: true } });
    const result = await accepting;
    expect(result.isError).toBe(true);
    expect(result.payload.error).toMatchObject({
      kind: 'io',
      message: PROGRAM_CHANGED_WHILE_ASKING,
    });
    expect(fs.readFileSync(recordFile()).equals(record)).toBe(true);
    expect(fs.readFileSync(path.join(root, 'a.eligian')).equals(programs.a)).toBe(true);
    expect(fs.readFileSync(path.join(root, 'talk', 'b.eligian')).equals(programs.b)).toBe(true);
  });

  it('a copy edit during the dialog → accepted with the scans the user saw', async () => {
    const dialog = deferred<ElicitAnswer>();
    answer = () => dialog.promise;
    await start();
    const accepting = ok({ action: 'accept-existing', paths: ['.'] });
    await waitFor(() => elicitations().length === 1);
    // the open dialog holds no permit: status resolves
    expect((await ok({ action: 'status' })).state).toBe('open');
    copyEdit();
    dialog.resolve({ action: 'accept', content: { accepted: true } });
    const reply = await accepting;
    expect(reply.signoff).toEqual({ mode: 'elicitation' });
    expect(recordPrograms()).toEqual(entries('elicitation'));
  });

  it('accepted entries have via accepted and mode', async () => {
    await start();
    await accept();
    expect(recordPrograms()).toHaveLength(2);
    for (const entry of recordPrograms()) {
      expect(entry.via).toBe('accepted');
      expect(entry.mode).toBe('elicitation');
    }
  });

  describe('known programs (R-15) and governed ones', () => {
    it('an unchanged known program is skipped, not rewritten; with nothing left there is no dialog', async () => {
      await start();
      await accept();
      const before = snapshotFiles(root);
      const reply = await accept();
      expect(reply.accepted).toEqual([]);
      expect(reply.skipped).toEqual([
        { path: 'a.eligian', reason: 'unchanged' },
        { path: 'lib.eligian', reason: 'library' },
        { path: 'talk/b.eligian', reason: 'unchanged' },
      ]);
      expect(elicitations()).toHaveLength(1);
      expect(snapshotFiles(root)).toEqual(before);
    });

    it('a renamed timeline (Alpha → Alpha 2) is accepted and replaces the entry', async () => {
      await start();
      await accept();
      fs.writeFileSync(path.join(root, 'a.eligian'), ALPHA.replace('"Alpha"', '"Alpha 2"'));
      const reply = await ok({ action: 'accept-existing', paths: ['a.eligian'] });
      expect(reply.accepted).toEqual(['a.eligian']);
      expect(recordPrograms()).toContainEqual({
        path: 'a.eligian',
        timelines: ['Alpha 2'],
        languages: [],
        extensions: false,
        via: 'accepted',
        mode: 'elicitation',
      });
    });

    it('an appended timeline in a known program is refused addition-not-briefed with scope and round, no dialog, nothing written', async () => {
      await start();
      await accept();
      appendTimeline();
      const before = snapshotFiles(root);
      const frames = elicitations().length;
      const reply = await accept({ confirmation: 'Yes' });
      expect(reply.refused.code).toBe('addition-not-briefed');
      expect(reply.refused.scope).toEqual({ addition: 'view', name: 'Gamma' });
      // the view addition's scoped tree: its S4 / S6 rows first (V1:Gamma … need S6, plan §7)
      const ids = reply.refused.round.map((item: { id: string }) => item.id);
      expect(ids).toContain('S4');
      expect(ids).toContain('S6');
      expect(ids.some((id: string) => id.startsWith('P') || id.startsWith('C'))).toBe(false);
      expect(reply.accepted).toBeUndefined();
      expect(elicitations()).toHaveLength(frames);
      expect(snapshotFiles(root)).toEqual(before);
    });

    it('a program governed by a main BRIEF.md refuses the whole call governed-by-brief, nothing written', async () => {
      await start();
      await ok({ action: 'status', idea: 'A talk.', directory: 'talk' });
      const before = snapshotFiles(root);
      const reply = await accept({ confirmation: 'Yes' });
      expect(reply.refused).toEqual({ code: 'governed-by-brief' });
      expect(reply.accepted).toBeUndefined();
      expect(elicitations()).toHaveLength(0);
      expect(snapshotFiles(root)).toEqual(before);
    });
  });
});
