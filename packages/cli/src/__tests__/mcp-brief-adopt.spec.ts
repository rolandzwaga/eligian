/**
 * Spec 059 Phase 2 (FR-042, FR-046, FR-047, readings R-9, R-10, R-11; plan §9; T032): the code
 * facts of adoption (`brief/adopt.ts`), read under the compiler lock, and the conflict rules.
 *
 * The tour is read from a temp copy of `examples/eligian-tour/` (its library, layout, styles,
 * locales and host module included); the two adopt fixtures are read in place (nothing writes).
 *
 * T034 adds `scope: 'adopt'` through the in-memory server (FR-041 to FR-049, SC-009): each
 * describe adopts its own temp copy (the tour, `examples/demo.eligian` with its layout, styles,
 * labels and libraries, or an adopt fixture) with a client that announces elicitation and accepts
 * every dialog, so no signed line is written by hand.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileFile } from '../compile-file.js';
import { type CodeFacts, conflictsOf, factAnswers, readCodeFacts } from '../mcp/brief/adopt.js';
import { BRIEF_FILE, parseBrief } from '../mcp/brief/brief-file.js';
import {
  type Answer,
  type BriefState,
  evaluate,
  type Facts,
  nextRound,
} from '../mcp/brief/engine.js';
import { verifyBriefFile } from '../mcp/brief/signature.js';
import { TREE, TREE_VERSION } from '../mcp/brief/tree.js';
import { validateValue } from '../mcp/brief/values.js';
import { compilerLockLayer } from '../mcp/compiler-lock.js';
import { evaluateBriefFile, storyboardFor } from './brief-helpers.js';
import {
  type ElicitAnswer,
  type ElicitRequest,
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const HERE = import.meta.dirname;
const EXAMPLES = path.resolve(HERE, '..', '..', '..', '..', 'examples');
const TOUR = path.join(EXAMPLES, 'eligian-tour');
const DOCS = path.join(HERE, '__fixtures__', 'mcp', 'docs-mini');
const ADOPT = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'adopt');
const ACTION_NAV = path.join(ADOPT, 'action-nav');
const REMOTE_VIDEO = path.join(ADOPT, 'remote-video');

/** Loading the tour and compiling it takes a few seconds. */
const SLOW = 60_000;

let tmp: string;
let stateDir: string;
let tourRoot: string;
let tourFile: string;

/** `readCodeFacts` under a fresh lock that counts its queued sections. */
async function read(
  file: string,
  root: string
): Promise<{ readonly facts: CodeFacts; readonly queued: number }> {
  let queued = 0;
  const facts = await Effect.runPromise(
    readCodeFacts(file, root, 'r1').pipe(
      Effect.provide(compilerLockLayer({ onQueued: () => queued++ }))
    )
  );
  return { facts, queued };
}

let tour: { readonly facts: CodeFacts; readonly queued: number };
let actionNav: CodeFacts;
let remoteVideo: CodeFacts;

beforeAll(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-adopt-')));
  stateDir = path.join(tmp, 'state');
  tourRoot = path.join(tmp, 'tour');
  fs.cpSync(TOUR, tourRoot, {
    recursive: true,
    filter: source => !['dist', 'storyboards'].includes(path.basename(source)),
  });
  tourFile = path.join(tourRoot, 'tour.eligian');
  tour = await read(tourFile, tourRoot);
  actionNav = (await read(path.join(ACTION_NAV, 'main.eligian'), ACTION_NAV)).facts;
  remoteVideo = (await read(path.join(REMOTE_VIDEO, 'main.eligian'), REMOTE_VIDEO)).facts;
}, SLOW);

afterAll(async () => {
  for (const server of servers.splice(0)) await server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** The timeline names of the tour in source order, read from its text. */
const tourTimelines = (): string[] =>
  [...fs.readFileSync(tourFile, 'utf8').matchAll(/^timeline "([^"]+)"/gm)].map(m => m[1]);

describe('readCodeFacts', () => {
  it('tour: views are the 9 timeline names of tour.eligian in order; providers 9 raf with source -; languages en-US (default) and nl-NL; keys include Escape and space; host names non-empty; program tour.eligian', () => {
    const { facts } = tour;
    const names = tourTimelines();
    expect(names).toHaveLength(9);
    expect(facts.views).toEqual(names);
    expect(facts.providers).toEqual(names.map(view => ({ view, provider: 'raf', source: '-' })));
    expect(facts.languages).toEqual([
      { code: 'en-US', default: 'yes' },
      { code: 'nl-NL', default: 'no' },
    ]);
    const keys = facts.keys.map(row => row.key);
    expect(keys).toContain('Escape');
    expect(keys).toContain('space');
    expect(facts.host?.length ?? 0).toBeGreaterThan(0);
    expect(facts.program).toBe('tour.eligian');
    expect(facts.badNames).toEqual([]);
  });

  it('navigation: for each of the 8 chapters a Hub row with trigger click #card-… and one with key <n>, and one Escape → Hub row per chapter', () => {
    const { navigation, views } = tour.facts;
    const chapters = views.slice(1);
    expect(chapters).toHaveLength(8);
    for (const chapter of chapters) {
      const toChapter = navigation.filter(row => row.view === 'Hub' && row.target === chapter);
      expect(toChapter.some(row => /^click #card-/.test(row.trigger))).toBe(true);
      expect(toChapter.some(row => /^key \d$/.test(row.trigger))).toBe(true);
      const escapes = navigation.filter(
        row => row.view === chapter && row.target === 'Hub' && row.trigger === 'key Escape'
      );
      expect(escapes).toHaveLength(1);
    }
  });

  it('transport is not empty (the on key "space" toggle rows)', () => {
    expect(tour.facts.transport.length).toBeGreaterThan(0);
    expect(tour.facts.transport.some(line => line.endsWith('on key "space" toggle'))).toBe(true);
  });

  it(
    'perView seconds equals the compiled duration of each timeline',
    async () => {
      const compiled = await compileFile(tourFile, { optimize: true });
      tour.facts.views.forEach((view, index) => {
        expect(tour.facts.perView.get(view)?.seconds).toBe(
          compiled.config.timelines[index].duration
        );
      });
    },
    SLOW
  );

  it('action-nav: navigation rows for A and for C', () => {
    expect(actionNav.views).toEqual(['A', 'B', 'C']);
    expect(actionNav.navigation).toEqual([
      { view: 'A', target: 'B', trigger: 'click #next' },
      { view: 'C', target: 'B', trigger: 'click #next' },
    ]);
  });

  it("remote-video: the provider row's source is the https URL", () => {
    expect(remoteVideo.providers).toEqual([
      { view: 'Clip', provider: 'video', source: 'https://example.com/v.mp4' },
    ]);
    expect(remoteVideo.perView.get('Clip')?.media).toBe('https://example.com/v.mp4');
  });

  it(
    'badNames lists a timeline named a:b',
    async () => {
      const dir = path.join(tmp, 'bad-name');
      fs.mkdirSync(dir);
      const file = path.join(dir, 'main.eligian');
      fs.writeFileSync(
        file,
        [
          'timeline "ok" in "body" using raf {',
          '  at 0s..1s selectElement("h1")',
          '}',
          'timeline "a:b" in "body" using raf {',
          '  at 0s..1s selectElement("h1")',
          '}',
          '',
        ].join('\n')
      );
      const { facts } = await read(file, dir);
      expect(facts.views).toEqual(['ok', 'a:b']);
      expect(facts.badNames).toEqual(['a:b']);
    },
    SLOW
  );

  it(
    'one lock run per call',
    async () => {
      expect(tour.queued).toBe(1);
      const again = await read(path.join(ACTION_NAV, 'main.eligian'), ACTION_NAV);
      expect(again.queued).toBe(1);
    },
    SLOW
  );

  it(
    'a missing program fails not-found',
    async () => {
      const missing = path.join(tmp, 'nowhere', 'main.eligian');
      const exit = await Effect.runPromiseExit(
        readCodeFacts(missing, tmp, 'r1').pipe(Effect.provide(compilerLockLayer({})))
      );
      expect(exit._tag).toBe('Failure');
      expect(JSON.stringify(exit)).toContain('ToolNotFound');
    },
    SLOW
  );
});

/** The template question of an answer id (`V3:Hub` → V3). */
const questionOf = (id: string) => TREE.find(q => q.id === id.split(':')[0]);

describe('factAnswers', () => {
  it("S2, S3 (first timeline, only when more than one), S4, S6, L1, I1, I2, H1, R3, V2 (in the code: <file>), V3, V5, V6 in the tree's canonical shapes, all by: code, round = the given round", () => {
    const answers = factAnswers(tour.facts, 7);
    const views = tour.facts.views;
    expect(answers.map(a => a.id)).toEqual([
      'S2',
      'S3',
      'S4',
      'S6',
      'L1',
      'I1',
      'I2',
      'H1',
      'R3',
      ...views.flatMap(view => [`V2:${view}`, `V3:${view}`, `V5:${view}`, `V6:${view}`]),
    ]);
    for (const answer of answers) {
      expect(answer.by).toBe('code');
      expect(answer.round).toBe(7);
      const question = questionOf(answer.id);
      expect(question, answer.id).toBeDefined();
      if (question === undefined) continue;
      const validated = validateValue(question, answer.value);
      expect(validated, answer.id).toEqual({ ok: true, value: answer.value });
    }
    const byId = new Map(answers.map(a => [a.id, a.value]));
    expect(byId.get('S3')).toBe('Hub');
    expect(byId.get('R3')).toBe('tour.eligian');
    expect(byId.get('V2:Hub')).toBe('in the code: tour.eligian');
    expect(byId.get('I1')).not.toBe('none');
    expect(byId.get('H1')).not.toBe('none');
    for (const view of views) {
      const seconds = tour.facts.perView.get(view)?.seconds ?? 0;
      expect(byId.get(`V5:${view}`)).toEqual(
        seconds > 0
          ? { duration: String(seconds), pacing: 'fixed', 'cues-from': '-' }
          : { duration: 'none', pacing: 'none', 'cues-from': '-' }
      );
    }
    expect(byId.get('V6:Hub')).toContain('on click "#card-ch1" navigate "Timeline & Time"');
  });

  it('no L1 fact when there is no languages block; no I2 fact when there is no key interaction', () => {
    const ids = factAnswers(actionNav, 1).map(a => a.id);
    expect(ids).not.toContain('L1');
    expect(ids).not.toContain('I2');
    expect(ids).toContain('S3');
    const single = factAnswers(remoteVideo, 1);
    expect(single.map(a => a.id)).not.toContain('S3');
    expect(single.find(a => a.id === 'V3:Clip')?.value).toEqual([
      { element: 'video', kind: 'video', file: 'https://example.com/v.mp4' },
    ]);
    expect(single.find(a => a.id === 'H1')?.value).toBe('none');
  });
});

const FACTS: Facts = { briefDir: '.', exists: () => true, inside: () => true };

const user = (id: string, value: Answer['value']): Answer => ({ id, value, by: 'user', round: 1 });
const code = (id: string, value: Answer['value']): Answer => ({ id, value, by: 'code', round: 1 });

const conflictIds = (answers: readonly Answer[]) => {
  const brief: BriefState = { treeVersion: TREE_VERSION, answers, additions: [] };
  return conflictsOf(evaluate(TREE, brief, FACTS)).map(conflict => conflict.ids);
};

describe('conflictsOf', () => {
  it('C3 [mouse] + an I2 fact → ids C3, I2', () => {
    expect(
      conflictIds([user('C3', ['mouse']), code('I2', [{ key: 'Escape', action: 'navigate Hub' }])])
    ).toEqual([['C3', 'I2']]);
  });

  it('C3 [keyboard] + a non-key S4 trigger → ids C3, S4', () => {
    expect(
      conflictIds([
        user('C3', ['keyboard']),
        code('S4', [{ view: 'A', target: 'B', trigger: 'click #next' }]),
      ])
    ).toEqual([['C3', 'S4']]);
  });

  it('C5 offline + an https S6 source → ids C5, S6', () => {
    expect(
      conflictIds([
        user('C5', 'offline'),
        code('S6', [{ view: 'Clip', provider: 'video', source: 'https://example.com/v.mp4' }]),
      ])
    ).toEqual([['C5', 'S6']]);
  });

  it('no conflict when the answers agree with the facts', () => {
    expect(
      conflictIds([
        user('C3', ['mouse', 'keyboard']),
        user('C5', 'online'),
        code('I2', [{ key: 'Escape', action: 'navigate Hub' }]),
        code('S4', [{ view: 'A', target: 'B', trigger: 'click #next' }]),
        code('S6', [{ view: 'Clip', provider: 'video', source: 'https://example.com/v.mp4' }]),
      ])
    ).toEqual([]);
  });

  it('each conflict carries a message naming both sides', () => {
    const brief: BriefState = {
      treeVersion: TREE_VERSION,
      answers: [user('C3', ['mouse']), code('I2', [{ key: 'Escape', action: 'navigate Hub' }])],
      additions: [],
    };
    const [conflict] = conflictsOf(evaluate(TREE, brief, FACTS));
    expect(conflict.message).toContain('C3');
    expect(conflict.message).toContain('I2');
  });
});

// ---------------------------------------------------------------------------------------------
// T034: `scope: 'adopt'` in `eligian_brief` (FR-041 to FR-049, SC-009).

const servers: InMemoryServer[] = [];

/** A served temp project and the dialog messages its client saw, in order. */
interface Project {
  readonly root: string;
  readonly server: InMemoryServer;
  readonly messages: string[];
}

/** The client's dialog accepts: its one boolean field is `true`. */
const accept = (request: ElicitRequest): ElicitAnswer => {
  const schema = request.requestedSchema as { readonly properties: Record<string, unknown> };
  const [field] = Object.keys(schema.properties);
  return { action: 'accept', content: { [field]: true } };
};

/** A server on `root` (its cwd) whose client announces elicitation and accepts every dialog. */
async function serve(root: string, lock?: ReturnType<typeof compilerLockLayer>): Promise<Project> {
  const messages: string[] = [];
  const server = await startInMemoryServer(
    { cwd: root, docsRoot: DOCS, brief: { stateDir }, ...(lock === undefined ? {} : { lock }) },
    {
      elicitation: true,
      onElicit: request => {
        messages.push(request.message);
        return accept(request);
      },
    }
  );
  servers.push(server);
  return { root, server, messages };
}

let copies = 0;

/** A fresh temp copy of the tour (no `dist/`, no `storyboards/`, so no `STORYBOARD.md`). */
function tourCopy(): string {
  const root = path.join(tmp, `tour-${++copies}`);
  fs.cpSync(TOUR, root, {
    recursive: true,
    filter: source => !['dist', 'storyboards'].includes(path.basename(source)),
  });
  expect(fs.existsSync(path.join(root, 'STORYBOARD.md'))).toBe(false);
  return root;
}

/** A temp copy of `examples/demo.eligian` with its layout, styles, labels and libraries. */
function demoCopy(): string {
  const root = path.join(tmp, `demo-${++copies}`);
  for (const name of [
    'demo.eligian',
    'demo-layout.html',
    'demo-styles.css',
    'demo-labels.json',
    path.join('libraries', 'animations.eligian'),
    path.join('libraries', 'utils.eligian'),
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.copyFileSync(path.join(EXAMPLES, name), path.join(root, name));
  }
  return root;
}

/** `eligian_brief` on `dir` (default the root); a tool failure throws. */
async function brief(
  project: Project,
  args: Readonly<Record<string, unknown>>,
  dir: string = project.root
): Promise<any> {
  const result = await project.server.callTool('eligian_brief', { directory: dir, ...args });
  if (result.isError) throw new Error(`eligian_brief failed: ${JSON.stringify(result.payload)}`);
  return result.payload;
}

const adopt = (project: Project): Promise<any> =>
  brief(project, { action: 'status', scope: 'adopt' });

const check = (project: Project, program: string): Promise<ToolCallResult> =>
  project.server.callTool('eligian_check', { paths: [program] });

/** The call ran: not refused by the gate. */
function expectRuns(result: ToolCallResult): void {
  expect(result.payload.error?.gate).toBeUndefined();
  expect(result.isError).toBe(false);
}

/** The gate payload of a refused call. */
function gateOf(result: ToolCallResult): any {
  expect(result.isError).toBe(true);
  expect(result.payload.error.kind).toBe('gate');
  return result.payload.error.gate;
}

const briefText = (root: string): string => fs.readFileSync(path.join(root, BRIEF_FILE), 'utf8');

/** The answers of `<root>/BRIEF.md`, by id. */
const answersOf = (root: string): ReadonlyMap<string, Answer> =>
  new Map(parseBrief(briefText(root)).brief.answers.map(answer => [answer.id, answer]));

type Row = Readonly<Record<string, string>>;
const rows = (value: unknown): readonly Row[] => (Array.isArray(value) ? (value as Row[]) : []);

const OUTRO =
  '\ntimeline "Outro" in "#stage" using raf {\n  at 0s..2s selectElement("#stage")\n}\n';

/**
 * Fixed values for every question an adopted brief can ask, by template id; the per-view tables
 * have one row per view, L2 one row per language.
 */
function fixedValue(id: string, views: readonly string[], languages: readonly string[]): unknown {
  const [template] = id.split(':');
  const values: Readonly<Record<string, unknown>> = {
    P1: 'Viewers know how Eligian works.',
    P2: 'none',
    P3: 'Developers. They know HTML and CSS.',
    P4: 'plain',
    P5: 'viewer-paced',
    C1: 'self-paced',
    C2: [{ device: 'desktop', primary: 'yes' }],
    C3: ['mouse', 'keyboard'],
    C4: 'off',
    C5: 'online',
    S1: 'hub-and-chapters',
    S5: views.map(view => ({ view, end: 'stay' })),
    S7: false,
    S8: 'stay',
    V1: 'This view says one thing.',
    V4: 'The title, then the text.',
    I2: [{ key: 'Escape', action: 'stop' }],
    I3: 'none',
    I4: 'restart',
    I5: false,
    D1: 'none',
    D2: 'White background, dark text, blue accent; light only.',
    D3: [{ font: 'Arial', source: 'system', file: '-', licence: '-' }],
    D4: { choice: 'fluid', detail: 'one column below 600px' },
    D5: views.map(view => ({ view, layout: 'title' })),
    D6: 'A short fade.',
    D7: 'remove',
    D8: 'none',
    L2: languages.map(language => ({ language, supplier: 'The team', when: 'week 1' })),
    L3: 'A menu in the corner.',
    L4: 'none',
    A3: 'none',
    A6: 'project',
    X1: 'best-effort',
    X2: true,
    X3: { focus: 'yes', announce: 'yes' },
    X4: 'none',
    X5: false,
    R1: { choice: 'standalone', detail: 'a page' },
    R2: 'Current Chrome, Edge, Firefox and Safari.',
    R4: false,
    W1: 'Colours, spacing and timing.',
    W2: 'end',
    W3: 'The presentation plays end to end.',
  };
  if (!Object.keys(values).includes(template)) throw new Error(`no fixed value for ${id}`);
  return values[template];
}

/**
 * Answers every asked question with its fixed value (no `scope`: the facts are read from the
 * file) until the brief is complete; `onRound` sees the ids of every round asked.
 */
async function drive(
  project: Project,
  first: any,
  onRound: (ids: readonly string[]) => void = () => undefined
): Promise<any> {
  let reply = first;
  for (let n = 0; n < 20 && reply.state === 'open'; n++) {
    const ids: string[] = reply.round.map((item: { id: string }) => item.id);
    onRound(ids);
    const evaluation = await evaluateBriefFile(project.root, { stateDir });
    const languages = rows(
      evaluation.instances.find(i => i.id === 'L1' && i.status === 'answered')?.value
    ).map(row => row.code);
    reply = await brief(project, {
      action: 'answer',
      answers: ids.map(id => ({ id, value: fixedValue(id, evaluation.views, languages) })),
    });
    expect(reply.rejected).toEqual([]);
  }
  expect(reply.state).toBe('complete');
  return reply;
}

describe('tour', () => {
  let project: Project;
  let adopted: any;
  let keyboardConflict: { readonly ids: readonly string[]; readonly message: string };

  beforeAll(async () => {
    project = await serve(tourCopy());
    adopted = await adopt(project);
  }, SLOW);

  it('status with scope adopt: BRIEF.md has - scope: adopt; S2 9 names in order, S6 9 raf, L1 en-US default + nl-NL, S3 Hub, I2 has Escape and space, H1 not none, R3 tour.eligian, all by: code', () => {
    expect(adopted.refused).toBeUndefined();
    const text = briefText(project.root);
    expect(text).toMatch(/^- tree: 1\n- scope: adopt$/m);
    expect(parseBrief(text).brief.scope).toBe('adopt');
    const answers = answersOf(project.root);
    const names = tourTimelines();
    expect(rows(answers.get('S2')?.value).map(row => row.name)).toEqual(names);
    expect(rows(answers.get('S6')?.value)).toEqual(
      names.map(view => ({ view, provider: 'raf', source: '-' }))
    );
    expect(answers.get('L1')?.value).toEqual([
      { code: 'en-US', default: 'yes' },
      { code: 'nl-NL', default: 'no' },
    ]);
    expect(answers.get('S3')?.value).toBe('Hub');
    const keys = rows(answers.get('I2')?.value).map(row => row.key);
    expect(keys).toContain('Escape');
    expect(keys).toContain('space');
    expect(answers.get('H1')?.value).not.toBe('none');
    expect(answers.get('R3')?.value).toBe('tour.eligian');
    for (const fact of factAnswers(tour.facts, 1)) {
      expect(answers.get(fact.id)?.by, fact.id).toBe('code');
      expect(answers.get(fact.id)?.value, fact.id).toEqual(fact.value);
    }
  });

  it('I1 not none; V2 "in the code: tour.eligian"; V5 per FR-042; V6 of Hub lists its click interactions; counts.fromCode > 0', () => {
    const answers = answersOf(project.root);
    expect(answers.get('I1')?.value).not.toBe('none');
    for (const view of tourTimelines()) {
      expect(answers.get(`V2:${view}`)?.value).toBe('in the code: tour.eligian');
      const seconds = tour.facts.perView.get(view)?.seconds ?? 0;
      expect(answers.get(`V5:${view}`)?.value).toEqual(
        seconds > 0
          ? { duration: String(seconds), pacing: 'fixed', 'cues-from': '-' }
          : { duration: 'none', pacing: 'none', 'cues-from': '-' }
      );
    }
    expect(answers.get('V6:Hub')?.value).toContain('on click "#card-ch1"');
    expect(adopted.counts.fromCode).toBeGreaterThan(0);
  });

  it(
    'no round from the adopting call until complete contains a fact-settled id (answering every asked question with fixed values); an answer for S2 is rejected fact',
    async () => {
      const facts = new Set(
        [...answersOf(project.root).values()].filter(a => a.by === 'code').map(a => a.id)
      );
      expect(facts.size).toBeGreaterThan(0);
      const rejected = await brief(project, {
        action: 'answer',
        answers: [{ id: 'S2', value: [{ name: 'Other', purpose: 'x' }] }],
      });
      expect(
        rejected.rejected.map((r: { id: string; reason: string }) => [r.id, r.reason])
      ).toEqual([['S2', 'fact']]);
      const asked: string[] = [];
      const complete = await drive(project, adopted, ids => asked.push(...ids));
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.filter(id => facts.has(id))).toEqual([]);
      expect(complete.conflicts).toBeUndefined();
    },
    SLOW
  );

  it(
    'C3 [mouse] → conflicts has one entry with ids C3 and I2',
    async () => {
      const reply = await brief(project, {
        action: 'answer',
        answers: [{ id: 'C3', value: ['mouse'] }],
      });
      expect(reply.rejected).toEqual([]);
      expect(reply.conflicts).toEqual([{ ids: ['C3', 'I2'], message: expect.any(String) }]);
    },
    SLOW
  );

  it(
    'C3 [keyboard] → a conflict with ids C3 and S4',
    async () => {
      const reply = await brief(project, {
        action: 'answer',
        answers: [{ id: 'C3', value: ['keyboard'] }],
      });
      expect(reply.rejected).toEqual([]);
      const found = (reply.conflicts ?? []).find(
        (conflict: { ids: string[] }) => conflict.ids.includes('C3') && conflict.ids.includes('S4')
      );
      expect(found).toBeDefined();
      keyboardConflict = found;
    },
    SLOW
  );

  it(
    "confirm's dialog message contains the conflict's message",
    async () => {
      await drive(project, await brief(project, { action: 'status' }));
      const before = project.messages.length;
      const confirmed = await brief(project, { action: 'confirm' });
      expect(confirmed.state).toBe('confirmed');
      expect(project.messages).toHaveLength(before + 1);
      expect(project.messages[before]).toContain(keyboardConflict.message);
      // Conflicts never block the confirmation (FR-046); the reply still lists them.
      expect(confirmed.conflicts).toContainEqual(keyboardConflict);
      // FR-019 as ruled: a re-confirmation shows only the changed answers (new values), no conflicts
      const changed = await brief(project, {
        action: 'answer',
        answers: [{ id: 'P1', value: 'Learn the tour, changed.' }],
      });
      expect(changed.rejected).toEqual([]);
      // P1's dependents went stale; the agent answers them again
      await drive(project, changed);
      const again = await brief(project, { action: 'confirm' });
      expect(again.state).toBe('confirmed');
      const message = project.messages[project.messages.length - 1];
      expect(message).toContain('Changed since the last confirmation:');
      expect(message).toContain('Learn the tour, changed.');
      expect(message).not.toContain(keyboardConflict.message);
    },
    SLOW
  );
});

describe('lock', () => {
  it(
    'status, answer and confirm without scope adopt leave queued at 0; one scope adopt call raises it to 1',
    async () => {
      let queued = 0;
      const root = tourCopy();
      const other = path.join(root, 'other');
      fs.mkdirSync(other);
      const project = await serve(root, compilerLockLayer({ onQueued: () => queued++ }));
      await brief(project, { action: 'status', idea: 'A short talk.' }, other);
      await brief(project, { action: 'answer', answers: [{ id: 'P1', value: 'Learn.' }] }, other);
      const confirmed = await brief(project, { action: 'confirm' }, other);
      expect(confirmed.refused?.code).toBe('frontier-not-empty');
      expect(queued).toBe(0);
      await adopt(project);
      expect(queued).toBe(1);
    },
    SLOW
  );
});

describe('facts re-read', () => {
  it(
    "rename Logic (and its navigate targets) in the copy, status with scope adopt: the S2 fact is updated, its round equals the call's round, the renamed view's V questions are in the frontier",
    async () => {
      const project = await serve(tourCopy());
      await adopt(project);
      const callRound = nextRound(parseBrief(briefText(project.root)).brief);
      const program = path.join(project.root, 'tour.eligian');
      const source = fs.readFileSync(program, 'utf8');
      expect(source).toContain('"Logic"');
      fs.writeFileSync(program, source.split('"Logic"').join('"Logic 2"'));
      const reply = await adopt(project);
      expect(reply.refused).toBeUndefined();
      const s2 = answersOf(project.root).get('S2');
      const names = rows(s2?.value).map(row => row.name);
      expect(names).toContain('Logic 2');
      expect(names).not.toContain('Logic');
      expect(s2?.by).toBe('code');
      expect(s2?.round).toBe(callRound);
      const evaluation = await evaluateBriefFile(project.root, { stateDir });
      const frontier = evaluation.frontier.map(instance => instance.id);
      expect(frontier).toContain('V1:Logic 2');
      expect(frontier).toContain('V4:Logic 2');
    },
    SLOW
  );
});

describe('gate', () => {
  let project: Project;
  const program = (): string => path.join(project.root, 'tour.eligian');

  beforeAll(async () => {
    project = await serve(tourCopy());
    expectRuns(await check(project, program()));
  }, SLOW);

  it(
    'before approval eligian_check on tour.eligian runs',
    async () => {
      const adopted = await adopt(project);
      expect(adopted.state).toBe('open');
      expectRuns(await check(project, program()));
    },
    SLOW
  );

  it(
    'after confirmation (no STORYBOARD.md in the tour root) approve-storyboard with a matching fixture storyboard approves; then a timeline outside S2 is addition-not-briefed',
    async () => {
      await drive(project, await brief(project, { action: 'status' }));
      const confirmed = await brief(project, { action: 'confirm' });
      expect(confirmed.state).toBe('confirmed');
      expect(briefText(project.root)).toMatch(/^- approval: none$/m);
      const evaluation = await evaluateBriefFile(project.root, { stateDir });
      fs.writeFileSync(path.join(project.root, 'STORYBOARD.md'), storyboardFor(evaluation));
      const approved = await brief(project, { action: 'approve-storyboard' });
      expect(approved.refused).toBeUndefined();
      expect(approved.state).toBe('approved');
      const record = JSON.parse(
        fs.readFileSync(path.join(project.root, '.eligian', 'programs.json'), 'utf8')
      );
      const entry = record.programs.find((e: { path: string }) => e.path === 'tour.eligian');
      expect(entry.via).toBe('adopted');
      expectRuns(await check(project, program()));
      fs.appendFileSync(program(), OUTRO);
      const gate = gateOf(await check(project, program()));
      expect(gate.code).toBe('addition-not-briefed');
      expect(gate.scope).toEqual({ addition: 'view', name: 'Outro' });
    },
    SLOW
  );

  it(
    "an addition during adoption: a fresh copy with Outro appended → addition-not-briefed; status with the refusal's scope is accepted (not brief-not-approved) and returns the Outro round",
    async () => {
      const fresh = await serve(tourCopy());
      const file = path.join(fresh.root, 'tour.eligian');
      expectRuns(await check(fresh, file));
      const adopted = await adopt(fresh);
      expect(adopted.state).toBe('open');
      fs.appendFileSync(file, OUTRO);
      const gate = gateOf(await check(fresh, file));
      expect(gate.code).toBe('addition-not-briefed');
      const reply = await brief(fresh, { action: 'status', scope: gate.scope });
      expect(reply.refused).toBeUndefined();
      expect(reply.scope).toEqual({ addition: 'view', name: 'Outro' });
      const ids = (round: readonly { id: string }[]) => round.map(item => item.id);
      expect(ids(reply.round).length).toBeGreaterThan(0);
      expect(ids(reply.round)).toEqual(ids(gate.round));
      expect(fs.readFileSync(path.join(fresh.root, BRIEF_FILE), 'utf8')).toContain(
        '## Addition: view Outro'
      );
    },
    SLOW
  );
});

describe('fixtures', () => {
  it(
    'remote-video: C5 offline → conflict ids C5, S6',
    async () => {
      const root = path.join(tmp, `remote-video-${++copies}`);
      fs.cpSync(REMOTE_VIDEO, root, { recursive: true });
      const project = await serve(root);
      const adopted = await adopt(project);
      expect(adopted.refused).toBeUndefined();
      const reply = await brief(project, {
        action: 'answer',
        answers: [{ id: 'C5', value: 'offline' }],
      });
      expect(reply.rejected).toEqual([]);
      expect(reply.conflicts).toHaveLength(1);
      expect(reply.conflicts[0].ids.slice(0, 2)).toEqual(['C5', 'S6']);
    },
    SLOW
  );
});

describe('demo', () => {
  let project: Project;

  beforeAll(async () => {
    project = await serve(demoCopy());
  }, SLOW);

  it(
    'one view: S3 and S4 not applicable; L1 is a fact',
    async () => {
      const adopted = await adopt(project);
      expect(adopted.refused).toBeUndefined();
      const ids = (reply: any): string[] => reply.round.map((item: { id: string }) => item.id);
      expect(ids(adopted)).not.toContain('S3');
      expect(ids(adopted)).not.toContain('S4');
      // S4 also needs C3 (Phase 1 engine: whether a question applies is decided once its
      // prerequisites are settled), so it is not applicable from the moment C3 is answered.
      const answered = await brief(project, {
        action: 'answer',
        answers: [{ id: 'C3', value: ['mouse', 'keyboard'] }],
      });
      expect(answered.rejected).toEqual([]);
      expect(ids(answered)).not.toContain('S4');
      const evaluation = await evaluateBriefFile(project.root, { stateDir });
      expect(evaluation.views).toHaveLength(1);
      const status = (id: string) => evaluation.instances.find(i => i.id === id)?.status;
      expect(status('S3')).toBe('not-applicable');
      expect(status('S4')).toBe('not-applicable');
      const l1 = answersOf(project.root).get('L1');
      expect(l1?.by).toBe('code');
      expect(rows(l1?.value).map(row => row.code)).toEqual(['nl-NL', 'en-US', 'fr-FR']);
    },
    SLOW
  );

  it(
    'an existing STORYBOARD.md beside the program before confirm: the confirming call writes - approval: existing-storyboard <ISO> hmac-sha256:…, verifyBriefFile reports approval valid, the record entry becomes via adopted',
    async () => {
      await drive(project, await brief(project, { action: 'status' }));
      fs.writeFileSync(
        path.join(project.root, 'STORYBOARD.md'),
        '# Storyboard\n\nWritten before the brief.\n'
      );
      const confirmed = await brief(project, { action: 'confirm' });
      expect(confirmed.refused).toBeUndefined();
      expect(confirmed.state).toBe('approved');
      expect(briefText(project.root)).toMatch(
        /^- approval: existing-storyboard \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z hmac-sha256:[0-9a-f]{64}$/m
      );
      expect(await verifyBriefFile(project.root, stateDir)).toEqual({
        confirmation: 'valid',
        approval: 'valid',
      });
      const record = JSON.parse(
        fs.readFileSync(path.join(project.root, '.eligian', 'programs.json'), 'utf8')
      );
      const entry = record.programs.find((e: { path: string }) => e.path === 'demo.eligian');
      expect(entry.via).toBe('adopted');
      expectRuns(await check(project, path.join(project.root, 'demo.eligian')));
    },
    SLOW
  );
});
