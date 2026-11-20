/**
 * Spec 059 Phase 1 (FR-008 to FR-012, FR-016 basis, FR-018, FR-022, FR-023; plan §3, P11–P13): the brief
 * engine, `mcp/brief/engine.ts`. Pure, no server: the facts come from `fakeFacts`.
 */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBrief, writeBrief } from '../mcp/brief/brief-file.js';
import {
  type Answer,
  type AnswerInput,
  applyAnswers,
  type BriefState,
  type Confirmation,
  canonicalAnswers,
  confirm,
  digest,
  EMPTY_BRIEF,
  type Evaluation,
  evaluate,
  type Facts,
  type Instance,
  type InstanceStatus,
  nextRound,
  pickRound,
  rankFrontier,
  recordedTreeVersion,
  textDirection,
  viewBasis,
} from '../mcp/brief/engine.js';
import { makeSigner, type Signer } from '../mcp/brief/signature.js';
import { type AnswerValue, type Question, TREE, TREE_VERSION } from '../mcp/brief/tree.js';
import { expectedForm } from '../mcp/brief/values.js';
import { TREE_V2 } from './__fixtures__/mcp/brief/tree-v2.js';

// ---------------------------------------------------------------------------------------------
// Shared helpers (reused by the later engine tasks).

/**
 * A fake `Facts`: `exists` is true for the listed brief-relative paths; `inside` is false for the
 * listed `outside` paths and for any path starting with `../`.
 */
function fakeFacts(
  options: {
    readonly exists?: readonly string[];
    readonly outside?: readonly string[];
    readonly briefDir?: string;
    readonly signer?: Signer;
  } = {}
): Facts {
  const exists = new Set(options.exists ?? []);
  const outside = new Set(options.outside ?? []);
  return {
    briefDir: options.briefDir ?? '.',
    exists: p => exists.has(p),
    inside: p => !outside.has(p) && !p.startsWith('../'),
    ...(options.signer === undefined ? {} : { signer: options.signer }),
  };
}

/** The test key's signer: a confirmation verifies only with it (Phase 2 FR-024, P4). */
const SIGNER = makeSigner(Buffer.alloc(32, 5));

/** An agent-reported confirmation with watermark `round`, signed with SIGNER over `signed`. */
function signedConfirmation(
  signed: readonly Answer[],
  round: number,
  message = 'Yes, build it.'
): Confirmation {
  const at = '2026-11-19T10:00:00.000Z';
  const payload = canonicalAnswers(signed);
  const hmac = SIGNER.sign([
    'eligian-brief/1',
    'confirmation',
    'brief',
    'agent-reported',
    at,
    round,
    payload,
  ]);
  return { mode: 'agent-reported', at, round, hmac, message };
}

function brief(...answers: Answer[]): BriefState {
  return { treeVersion: TREE_VERSION, answers };
}

function a(
  id: string,
  value: AnswerValue,
  round = 1,
  extra?: Partial<Pick<Answer, 'by' | 'reviewed' | 'basis'>>
): Answer {
  return { id, value, by: 'user', round, ...extra };
}

const isVAnswer = (id: string) => /^V[1-6]?:/.test(id);

/** Each V answer (`Vn:<view>`, `V:<view>`) gets the current basis of its view (FR-016). */
function withBasis(b: BriefState): BriefState {
  return {
    ...b,
    answers: b.answers.map(answer =>
      isVAnswer(answer.id)
        ? { ...answer, basis: viewBasis(b, answer.id.slice(answer.id.indexOf(':') + 1)) }
        : answer
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// A fully answered single-view, one-language brief (FR-023 `complete`).

const COMPLETE_ANSWERS: readonly Answer[] = [
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
  a('S1', 'timed-piece'),
  a('S2', [{ name: 'main', purpose: 'The whole piece' }]),
  a('S5', [{ view: 'main', end: 'stay' }]),
  a('S6', [{ view: 'main', provider: 'raf', source: '-' }]),
  a('S8', 'stay'),
  a('V1:main', 'One idea.'),
  a('V2:main', 'Hello.', 1, { by: 'delegated' }),
  a('V3:main', 'none'),
  a('V4:main', 'The title fades in.'),
  a('V5:main', { duration: '30', pacing: 'fixed', 'cues-from': '-' }),
  a('V6:main', 'none'),
  a('I1', 'none'),
  a('I2', [{ key: 'Space', action: 'pause' }]),
  a('I3', 'none'),
  a('D1', 'none'),
  a('D2', 'Dark background, white text.'),
  a('D3', [{ font: 'Inter', source: 'system', file: '-', licence: 'OFL' }]),
  a('D4', { choice: 'fluid', detail: 'two breakpoints' }),
  a('D5', [{ view: 'main', layout: 'title' }]),
  a('D6', 'Short fades.'),
  a('D7', 'shorten'),
  a('L1', [{ code: 'en-US', default: 'yes' }]),
  a('H1', 'none'),
  a('X1', 'best-effort'),
  a('X2', true),
  a('R1', { choice: 'standalone', detail: 'a page' }),
  a('R2', 'evergreen'),
  a('R3', 'main.eligian'),
  a('R4', false),
  a('W1', 'nothing'),
  a('W2', 'end'),
  a('W3', 'It plays.'),
];

const COMPLETE = withBasis(brief(...COMPLETE_ANSWERS));

/**
 * COMPLETE with `overrides` replacing (or adding) answers by id and `remove` dropping ids; the V
 * answers get the current basis afterwards.
 */
function variant(overrides: readonly Answer[], remove: readonly string[] = []): BriefState {
  const replaced = new Map(overrides.map(o => [o.id, o]));
  const kept = COMPLETE_ANSWERS.filter(x => !remove.includes(x.id)).map(
    x => replaced.get(x.id) ?? x
  );
  const added = overrides.filter(o => !COMPLETE_ANSWERS.some(x => x.id === o.id));
  return withBasis(brief(...kept, ...added));
}

function instance(evaluation: Evaluation, id: string): Instance {
  const found = evaluation.instances.find(i => i.id === id);
  if (found === undefined) throw new Error(`no instance ${id}`);
  return found;
}

const statusOf = (b: BriefState, id: string, facts: Facts = fakeFacts()): InstanceStatus =>
  instance(evaluate(TREE, b, facts), id).status;

const frontierIds = (evaluation: Evaluation) => evaluation.frontier.map(i => i.id);

// Reusable answer sets.
const TWO_VIEWS: readonly Answer[] = [
  a('S2', [
    { name: 'main', purpose: 'The whole piece' },
    { name: 'second', purpose: 'More' },
  ]),
  a('S4', [{ view: 'main', target: 'second', trigger: 'click' }]),
  a('S5', [
    { view: 'main', end: 'stay' },
    { view: 'second', end: 'stay' },
  ]),
  a('S6', [
    { view: 'main', provider: 'raf', source: '-' },
    { view: 'second', provider: 'raf', source: '-' },
  ]),
  a('D5', [
    { view: 'main', layout: 'title' },
    { view: 'second', layout: 'title' },
  ]),
];
const TWO_LANGUAGES = a('L1', [
  { code: 'en-US', default: 'yes' },
  { code: 'nl-NL', default: 'no' },
]);
const VIDEO_VIEW = a('S6', [{ view: 'main', provider: 'video', source: 'media/a.mp4' }]);
const IMAGE_V3 = a('V3:main', [{ element: 'Logo', kind: 'image', file: 'img/logo.png' }]);
const MISSING_IMAGE_V3 = a('V3:main', [{ element: 'Logo', kind: 'image', file: '-' }]);
const A1_FOR_LOGO = a('A1', [{ asset: 'main: Logo', who: 'design', when: 'May' }]);

const FIRST_FRONTIER = [
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'R2',
  'R3',
  'R4',
  'W3',
];

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------

describe('frontier and counts', () => {
  it('the empty brief has the 14 first-frontier ids', () => {
    const ev = evaluate(TREE, EMPTY_BRIEF, fakeFacts());
    expect(new Set(frontierIds(ev))).toEqual(new Set(FIRST_FRONTIER));
    expect(frontierIds(ev)).toHaveLength(14);
  });

  it('counts of the empty brief', () => {
    const ev = evaluate(TREE, EMPTY_BRIEF, fakeFacts());
    // 63 template questions; branch V is one template copy of 6 instances (FR-010).
    expect(ev.counts).toEqual({
      answered: 0,
      delegated: 0,
      open: 14,
      waiting: 49,
      notApplicable: 0,
    });
    expect(ev.instances.filter(i => i.counted)).toHaveLength(63);
  });
});

describe('applies-when through evaluate', () => {
  const cases: readonly [
    string,
    string,
    readonly Answer[],
    readonly string[],
    readonly string[],
    InstanceStatus,
  ][] = [
    ['S3 applies with two views', 'S3', TWO_VIEWS, [], [], 'open'],
    ['S3 is not-applicable with one view', 'S3', [], [], [], 'not-applicable'],
    ['S4 applies with two views', 'S4', TWO_VIEWS.filter(x => x.id !== 'S4'), [], [], 'open'],
    ['S4 is not-applicable with one view', 'S4', [], [], [], 'not-applicable'],
    ['I4 applies with two views', 'I4', TWO_VIEWS, [], [], 'open'],
    ['I4 is not-applicable with one view', 'I4', [], [], [], 'not-applicable'],
    ['X3 applies with two views', 'X3', TWO_VIEWS, [], [], 'open'],
    ['X3 is not-applicable with one view', 'X3', [], [], [], 'not-applicable'],
    ['S7 applies with a video view and C4 on', 'S7', [VIDEO_VIEW, a('C4', 'on')], [], [], 'open'],
    [
      'S7 is not-applicable with a video view and C4 off',
      'S7',
      [VIDEO_VIEW],
      [],
      [],
      'not-applicable',
    ],
    [
      'S7 is not-applicable with no media view and C4 on',
      'S7',
      [a('C4', 'on')],
      [],
      [],
      'not-applicable',
    ],
    ['V6 applies when C3 has mouse', 'V6:main', [a('C3', ['mouse'])], [], [], 'answered'],
    [
      'V6 is not-applicable when C3 has only keyboard',
      'V6:main',
      [a('C3', ['keyboard'])],
      [],
      [],
      'not-applicable',
    ],
    ['I1 applies when a V5 copy has a duration', 'I1', [], [], [], 'answered'],
    [
      'I1 is not-applicable when every V5 duration is none',
      'I1',
      [a('V5:main', { duration: 'none', pacing: 'none', 'cues-from': '-' })],
      [],
      [],
      'not-applicable',
    ],
    ['I2 applies when C3 has keyboard', 'I2', [], [], [], 'answered'],
    [
      'I2 is not-applicable when C3 has no keyboard',
      'I2',
      [a('C3', ['mouse'])],
      [],
      [],
      'not-applicable',
    ],
    ['I5 applies when C3 has touch', 'I5', [a('C3', ['touch'])], [], [], 'open'],
    ['I5 is not-applicable when C3 has no touch', 'I5', [], [], [], 'not-applicable'],
    ['D8 applies when a V3 row is an image', 'D8', [IMAGE_V3], [], [], 'open'],
    ['D8 is not-applicable when no V3 row is an image', 'D8', [], [], [], 'not-applicable'],
    ['L2 applies with two L1 rows', 'L2', [TWO_LANGUAGES], [], [], 'open'],
    ['L2 is not-applicable with one L1 row', 'L2', [], [], [], 'not-applicable'],
    ['L3 applies with two L1 rows', 'L3', [TWO_LANGUAGES], [], [], 'open'],
    ['L3 is not-applicable with one L1 row', 'L3', [], [], [], 'not-applicable'],
    ['L4 applies with two codes and an asset', 'L4', [TWO_LANGUAGES, IMAGE_V3], [], [], 'open'],
    [
      'L4 is not-applicable with two codes and no asset',
      'L4',
      [TWO_LANGUAGES],
      [],
      [],
      'not-applicable',
    ],
    [
      'L5 applies when L4 is not none',
      'L5',
      [TWO_LANGUAGES, IMAGE_V3, a('L4', 'the voice-over')],
      [],
      [],
      'open',
    ],
    [
      'L5 is not-applicable when L4 is none',
      'L5',
      [TWO_LANGUAGES, IMAGE_V3, a('L4', 'none')],
      [],
      [],
      'not-applicable',
    ],
    ['A1 applies when an asset is missing', 'A1', [MISSING_IMAGE_V3], [], [], 'open'],
    [
      'A1 is not-applicable when every asset exists',
      'A1',
      [IMAGE_V3],
      [],
      ['img/logo.png'],
      'not-applicable',
    ],
    ['A2 applies when an asset is missing', 'A2', [MISSING_IMAGE_V3, A1_FOR_LOGO], [], [], 'open'],
    [
      'A2 is not-applicable when every asset exists',
      'A2',
      [IMAGE_V3],
      [],
      ['img/logo.png'],
      'not-applicable',
    ],
    ['A3 applies with an asset', 'A3', [IMAGE_V3], [], [], 'open'],
    ['A3 is not-applicable with no asset', 'A3', [], [], [], 'not-applicable'],
    ['A6 applies with an asset', 'A6', [IMAGE_V3], [], [], 'open'],
    ['A6 is not-applicable with no asset', 'A6', [], [], [], 'not-applicable'],
    ['A4 applies with a video entry', 'A4', [VIDEO_VIEW], [], [], 'open'],
    ['A4 is not-applicable with only an image entry', 'A4', [IMAGE_V3], [], [], 'not-applicable'],
    ['A5 applies when a V3 row is an image', 'A5', [IMAGE_V3], [], [], 'open'],
    ['A5 is not-applicable when no V3 row is an image', 'A5', [], [], [], 'not-applicable'],
    [
      'H2 applies when H1 lists external-data',
      'H2',
      [a('H1', [{ need: 'external-data', detail: 'prices' }])],
      [],
      [],
      'open',
    ],
    ['H2 is not-applicable when H1 is none', 'H2', [], [], [], 'not-applicable'],
    [
      'H3 applies when H1 lists analytics',
      'H3',
      [a('H1', [{ need: 'analytics', detail: 'views' }])],
      [],
      [],
      'open',
    ],
    ['H3 is not-applicable when H1 is none', 'H3', [], [], [], 'not-applicable'],
    ['X4 applies with a video view', 'X4', [VIDEO_VIEW], [], [], 'open'],
    ['X4 is not-applicable with no media view', 'X4', [], [], [], 'not-applicable'],
    [
      'X5 applies with an advance row',
      'X5',
      [a('S5', [{ view: 'main', end: 'advance' }])],
      [],
      [],
      'open',
    ],
    ['X5 is not-applicable with only stay rows', 'X5', [], [], [], 'not-applicable'],
  ];

  it.each(cases)('%s', (_name, id, overrides, remove, exists, expected) => {
    const b = variant(overrides, remove);
    expect(statusOf(b, id, fakeFacts({ exists }))).toBe(expected);
  });

  it('every other question applies always (the empty brief has no not-applicable instance)', () => {
    const ev = evaluate(TREE, EMPTY_BRIEF, fakeFacts());
    expect(ev.instances.filter(i => i.status === 'not-applicable')).toEqual([]);
  });

  it('an answer to a question that does not apply is dormant', () => {
    const ev = evaluate(TREE, variant([a('C3', ['mouse'])]), fakeFacts());
    const i2 = instance(ev, 'I2');
    expect(i2.status).toBe('not-applicable');
    expect(i2.dormant).toBe(true);
    expect(instance(ev, 'S3').dormant).toBe(false);
  });
});

describe('single view', () => {
  const ONE_VIEW_START = brief(
    a('P5', 90),
    a('C1', 'self-paced'),
    a('C3', ['mouse', 'keyboard']),
    a('S1', 'timed-piece'),
    a('S2', [{ name: 'main', purpose: 'The whole piece' }])
  );

  it('S3, S4, I4, X3 are not applicable', () => {
    for (const b of [ONE_VIEW_START, COMPLETE]) {
      const ev = evaluate(TREE, b, fakeFacts());
      for (const id of ['S3', 'S4', 'I4', 'X3']) {
        // S4 needs C3; I4 and X3 need S4: all settled, all not applicable.
        expect(instance(ev, id).status, `${id}`).toBe('not-applicable');
        expect(frontierIds(ev)).not.toContain(id);
      }
    }
  });
});

describe('per-view copies', () => {
  const VIEWS = ['intro', 'mid', 'end'];
  const THREE = brief(
    a('P5', 90),
    a('C1', 'self-paced'),
    a('C4', 'off'),
    a('S1', 'slide-deck'),
    a(
      'S2',
      VIEWS.map(name => ({ name, purpose: `The ${name}` }))
    ),
    a(
      'S6',
      VIEWS.map(view => ({ view, provider: 'raf', source: '-' }))
    )
  );

  it('ids V1:intro … V6:end in S2 order, titles prefixed "<name>: "', () => {
    const ev = evaluate(TREE, THREE, fakeFacts());
    const vInstances = ev.instances.filter(i => i.question.branch === 'V');
    const expected = [1, 2, 3, 4, 5, 6].flatMap(n => VIEWS.map(v => `V${n}:${v}`));
    expect(new Set(vInstances.map(i => i.id))).toEqual(new Set(expected));
    expect(vInstances).toHaveLength(18);
    for (let n = 1; n <= 6; n++) {
      const ofTemplate = vInstances.filter(i => i.question.id === `V${n}`);
      expect(ofTemplate.map(i => i.view)).toEqual(VIEWS);
    }
    const v1 = TREE.find(q => q.id === 'V1');
    expect(instance(ev, 'V1:mid').title).toBe(`mid: ${v1?.title}`);
    expect(ev.views).toEqual(VIEWS);
    // V1–V5 apply always; V6 waits for C3.
    expect(instance(ev, 'V1:intro').status).toBe('open');
    expect(instance(ev, 'V6:end').status).toBe('waiting');
  });

  it('before S2 branch V is 6 waiting template instances', () => {
    const ev = evaluate(TREE, EMPTY_BRIEF, fakeFacts());
    const vInstances = ev.instances.filter(i => i.question.branch === 'V');
    expect(vInstances.map(i => i.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
    expect(vInstances.every(i => i.status === 'waiting' && i.counted)).toBe(true);
    expect(ev.views).toEqual([]);
  });

  it('S2 recorded but not settled keeps every copy waiting (P12)', () => {
    // S1 is unanswered, so S2 waits; the views still come from its recorded answer.
    const b = brief(a('S2', [{ name: 'intro', purpose: 'x' }]));
    const ev = evaluate(TREE, b, fakeFacts());
    expect(ev.views).toEqual(['intro']);
    const vInstances = ev.instances.filter(i => i.question.branch === 'V');
    expect(vInstances.map(i => i.id)).toEqual(
      ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'].map(id => `${id}:intro`)
    );
    expect(vInstances.every(i => i.status === 'waiting')).toBe(true);
  });
});

describe('a not-applicable prerequisite counts as settled (R-1)', () => {
  it('X2 is on the frontier when C3 has no keyboard', () => {
    const ev = evaluate(TREE, variant([a('C3', ['mouse'])], ['X2']), fakeFacts());
    expect(instance(ev, 'I2').status).toBe('not-applicable');
    expect(instance(ev, 'X2').status).toBe('open');
    expect(frontierIds(ev)).toContain('X2');
  });
});

describe('asset list (FR-012)', () => {
  const assetsOf = (b: BriefState, facts: Facts = fakeFacts()) => evaluate(TREE, b, facts).assets;

  it('a V3 image row with file - is missing, keyed "<view>: <element>"', () => {
    expect(assetsOf(variant([MISSING_IMAGE_V3]))).toEqual([
      { key: 'main: Logo', kind: 'image', state: 'missing' },
    ]);
  });

  it('it makes A1, A2, A3, A5, A6 apply, and L4 with two L1 codes', () => {
    const ev = evaluate(TREE, variant([MISSING_IMAGE_V3, A1_FOR_LOGO, TWO_LANGUAGES]), fakeFacts());
    expect(instance(ev, 'A1').status).toBe('answered');
    for (const id of ['A2', 'A3', 'A5', 'A6', 'L4']) {
      expect(instance(ev, id).status, id).toBe('open');
    }
    // No video or audio entry: A4 does not apply.
    expect(instance(ev, 'A4').status).toBe('not-applicable');
  });

  it('a system D3 row is not an entry', () => {
    expect(assetsOf(COMPLETE)).toEqual([]);
  });

  it('a cdn D3 row is remote, keyed by its URL or "font: <font>"', () => {
    const b = variant([
      a('D3', [
        { font: 'Inter', source: 'cdn', file: 'https://fonts.example/inter.css', licence: 'OFL' },
        { font: 'Lato', source: 'cdn', file: '-', licence: 'OFL' },
      ]),
    ]);
    expect(assetsOf(b)).toEqual([
      { key: 'https://fonts.example/inter.css', kind: 'font', state: 'remote' },
      { key: 'font: Lato', kind: 'font', state: 'remote' },
    ]);
  });

  it('a V3 video row media/demo.mp4 and an S6 video source media/demo.mp4 are one entry with kind video', () => {
    const b = variant([
      a('S6', [{ view: 'main', provider: 'video', source: 'media/demo.mp4' }]),
      a('V3:main', [{ element: 'Clip', kind: 'video', file: 'media/demo.mp4' }]),
    ]);
    expect(assetsOf(b)).toEqual([{ key: 'media/demo.mp4', kind: 'video', state: 'missing' }]);
  });

  it('a V3 image, an S6 audio and a D3 project font are listed in V3, S6, D3 order', () => {
    const b = variant([
      a('D3', [{ font: 'Brand', source: 'project', file: 'fonts/brand.woff2', licence: 'own' }]),
      a('S6', [{ view: 'main', provider: 'audio', source: 'media/voice.mp3' }]),
      a('V3:main', [
        { element: 'Logo', kind: 'image', file: 'img/logo.png' },
        { element: 'Notes', kind: 'list', file: '-' },
        { element: 'Handout', kind: 'other', file: 'docs/handout.pdf' },
      ]),
    ]);
    expect(assetsOf(b, fakeFacts({ exists: ['docs/handout.pdf'] }))).toEqual([
      { key: 'img/logo.png', kind: 'image', state: 'missing' },
      { key: 'docs/handout.pdf', kind: 'other', state: 'exists' },
      { key: 'media/voice.mp3', kind: 'audio', state: 'missing' },
      { key: 'fonts/brand.woff2', kind: 'font', state: 'missing' },
    ]);
  });

  it('an https:// V3 file is remote', () => {
    const b = variant([
      a('V3:main', [{ element: 'Logo', kind: 'image', file: 'https://cdn.example/logo.png' }]),
    ]);
    expect(assetsOf(b)).toEqual([
      { key: 'https://cdn.example/logo.png', kind: 'image', state: 'remote' },
    ]);
  });

  it('an existing relative file is exists', () => {
    expect(assetsOf(variant([IMAGE_V3]), fakeFacts({ exists: ['img/logo.png'] }))).toEqual([
      { key: 'img/logo.png', kind: 'image', state: 'exists' },
    ]);
  });
});

describe('states (FR-023)', () => {
  it('open while the frontier is non-empty', () => {
    expect(evaluate(TREE, EMPTY_BRIEF, fakeFacts()).state).toBe('open');
    expect(evaluate(TREE, variant([], ['W3']), fakeFacts()).state).toBe('open');
  });

  it('complete when the frontier is empty and there is no confirmation', () => {
    const ev = evaluate(TREE, COMPLETE, fakeFacts());
    expect(ev.frontier).toEqual([]);
    expect(ev.state).toBe('complete');
    expect(ev.counts).toEqual({
      answered: 42,
      delegated: 1,
      open: 0,
      waiting: 0,
      notApplicable: 21,
    });
    expect(ev.delegated).toEqual([
      {
        id: 'V2:main',
        title: `main: ${TREE.find(q => q.id === 'V2')?.title}`,
        value: 'Hello.',
      },
    ]);
  });

  it('confirmed when the confirmation HMAC verifies over the canonical answers and the frontier is empty', () => {
    const confirmed: BriefState = {
      ...COMPLETE,
      confirmation: signedConfirmation(COMPLETE.answers, nextRound(COMPLETE) - 1),
    };
    expect(evaluate(TREE, confirmed, fakeFacts({ signer: SIGNER })).state).toBe('confirmed');
  });

  it('a confirmation with another HMAC is complete', () => {
    const confirmed: BriefState = {
      ...COMPLETE,
      confirmation: {
        mode: 'agent-reported',
        at: '2026-11-19T10:00:00.000Z',
        round: nextRound(COMPLETE) - 1,
        hmac: `hmac-sha256:${'0'.repeat(64)}`,
        message: 'Yes.',
      },
    };
    expect(evaluate(TREE, confirmed, fakeFacts({ signer: SIGNER })).state).toBe('complete');
  });
});

describe('digest (FR-022)', () => {
  const expectedDigest = (answers: readonly Answer[]) => {
    const entries = answers
      .map(x => [x.id, x.value, x.by] as const)
      .sort(([l], [r]) => (l < r ? -1 : l > r ? 1 : 0));
    return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  };

  it('is the sha256 hex of JSON [[id, value, by]] sorted by id, ignoring round, reviewed and basis', () => {
    expect(digest(COMPLETE.answers)).toBe(expectedDigest(COMPLETE.answers));
    expect(digest(COMPLETE.answers)).toMatch(/^[0-9a-f]{64}$/);
    const moved = COMPLETE.answers.map(x => ({
      ...x,
      round: 9,
      reviewed: 12,
      basis: 'ffffffffffffffff',
    }));
    expect(digest([...moved].reverse())).toBe(digest(COMPLETE.answers));
    const byChanged = COMPLETE.answers.map(x =>
      x.id === 'P1' ? { ...x, by: 'delegated' as const } : x
    );
    expect(digest(byChanged)).not.toBe(digest(COMPLETE.answers));
  });

  it("the evaluation's digest leaves dormant answers out", () => {
    expect(evaluate(TREE, COMPLETE, fakeFacts()).digest).toBe(digest(COMPLETE.answers));
    const b = variant([a('C3', ['mouse'])]);
    const ev = evaluate(TREE, b, fakeFacts());
    expect(ev.digest).toBe(digest(b.answers.filter(x => x.id !== 'I2')));
  });
});

describe('viewBasis (FR-016)', () => {
  it('demo is 4a3055a743c8484e and signup is 23a0aa8fc1af8ff6', () => {
    const golden = brief(
      a(
        'S2',
        [
          { name: 'intro', purpose: 'The promise' },
          { name: 'demo', purpose: 'The product at work' },
          { name: 'signup', purpose: 'The call to action' },
        ],
        3
      ),
      a(
        'S6',
        [
          { view: 'intro', provider: 'raf', source: '-' },
          { view: 'demo', provider: 'video', source: 'media/demo.mp4' },
          { view: 'signup', provider: 'raf', source: '-' },
        ],
        4
      )
    );
    expect(viewBasis(golden, 'demo')).toBe('4a3055a743c8484e');
    expect(viewBasis(golden, 'signup')).toBe('23a0aa8fc1af8ff6');
  });

  it('a view with no S6 row hashes null for it', () => {
    const b = brief(a('S2', [{ name: 'intro', purpose: 'x' }]));
    const expected = createHash('sha256')
      .update(JSON.stringify([{ name: 'intro', purpose: 'x' }, null]))
      .digest('hex')
      .slice(0, 16);
    expect(viewBasis(b, 'intro')).toBe(expected);
  });
});

describe('nextRound (FR-015)', () => {
  it('1 for an empty brief; 1 + max(round, reviewed) otherwise', () => {
    expect(nextRound(EMPTY_BRIEF)).toBe(1);
    expect(nextRound(brief(a('P1', 'x', 1), a('P2', 'none', 3)))).toBe(4);
    expect(nextRound(brief(a('P1', 'x', 1), a('P2', 'none', 3, { reviewed: 5 })))).toBe(6);
  });
});

describe('textDirection', () => {
  it('ar-EG is rtl', () => {
    expect(textDirection('ar-EG')).toBe('rtl');
  });

  it('nl-NL is ltr', () => {
    expect(textDirection('nl-NL')).toBe('ltr');
  });

  it('an invalid code (xx-!!) gives ltr', () => {
    expect(textDirection('xx-!!')).toBe('ltr');
  });

  it('a throwing Intl.Locale gives ltr', () => {
    vi.spyOn(Intl, 'Locale').mockImplementation(function (this: unknown) {
      throw new Error('no locale');
    } as never);
    expect(textDirection('ar-EG')).toBe('ltr');
  });

  it('without getTextInfo the textInfo getter is used', () => {
    vi.spyOn(Intl, 'Locale').mockImplementation(function (this: unknown) {
      return { textInfo: { direction: 'rtl' } };
    } as never);
    expect(textDirection('nl-NL')).toBe('rtl');
  });
});

describe('a defect in a rule', () => {
  it('a rule reading an id outside its reads throws', () => {
    const q: Question = {
      id: 'Q1',
      branch: 'P',
      title: 'A question',
      ask: 'A question',
      shape: { kind: 'text' },
      needs: [],
      reads: [],
      appliesWhen: view => view.get('P1') !== undefined,
      when: 'P1 is answered',
      docs: [],
      facts: [],
      since: 1,
    };
    expect(() => evaluate([q], EMPTY_BRIEF, fakeFacts())).toThrow(/P1/);
  });
});

describe('round selection', () => {
  const FIRST_ROUND = ['C1', 'P5', 'C4', 'P4', 'C3', 'C5', 'P3'];
  const empty = () => evaluate(TREE, EMPTY_BRIEF, fakeFacts());

  it('max 1 returns C1', () => {
    expect(pickRound(TREE, empty(), 1).map(i => i.id)).toEqual(['C1']);
  });

  it('max 7 returns the seven ids above', () => {
    expect(pickRound(TREE, empty(), 7).map(i => i.id)).toEqual(FIRST_ROUND);
    expect(pickRound(TREE, empty()).map(i => i.id)).toEqual(FIRST_ROUND);
  });

  it('max 20 returns all 14 frontier ids', () => {
    const ids = pickRound(TREE, empty(), 20).map(i => i.id);
    expect(ids).toHaveLength(14);
    expect(new Set(ids)).toEqual(new Set(FIRST_FRONTIER));
    expect(ids.slice(0, 7)).toEqual(FIRST_ROUND);
  });

  it('ties are broken by tree order, then S2 view order', () => {
    // S2 order (zeta before alpha) is not the alphabetical order.
    const VIEWS = ['zeta', 'alpha'];
    const b = brief(
      a('P5', 90),
      a('C1', 'self-paced'),
      a('C4', 'off'),
      a('S1', 'slide-deck'),
      a(
        'S2',
        VIEWS.map(name => ({ name, purpose: `The ${name}` }))
      ),
      a(
        'S6',
        VIEWS.map(view => ({ view, provider: 'raf', source: '-' }))
      )
    );
    const ev = evaluate(TREE, b, fakeFacts());
    const ranked = rankFrontier(TREE, ev);
    expect(ranked.map(r => r.id)).toHaveLength(ev.frontier.length);
    const counts = ranked.map(r => r.dependents);
    expect(counts).toEqual([...counts].sort((l, r) => r - l));
    expect(ranked.find(r => r.id === 'V1:zeta')?.dependents).toBe(
      ranked.find(r => r.id === 'V1:alpha')?.dependents
    );
    const treeIndex = (id: string) => TREE.findIndex(q => q.id === id.split(':')[0]);
    for (let n = 1; n < ranked.length; n++) {
      const [l, r] = [ranked[n - 1], ranked[n]];
      if (l.dependents !== r.dependents) continue;
      expect(treeIndex(l.id), `${l.id} before ${r.id}`).toBeLessThanOrEqual(treeIndex(r.id));
    }
    const ids = ranked.map(r => r.id);
    expect(ids.indexOf('V1:zeta')).toBe(ids.indexOf('V1:alpha') - 1);
    expect(ids.indexOf('V2:zeta')).toBe(ids.indexOf('V2:alpha') - 1);
    expect(ids.indexOf('V1:alpha')).toBeLessThan(ids.indexOf('V2:zeta'));
    expect(pickRound(TREE, ev, 20).map(i => i.id)).toEqual(ids.slice(0, 20));
    // The ranking does not lean on the frontier's own order.
    const reversed: Evaluation = { ...ev, frontier: [...ev.frontier].reverse() };
    expect(rankFrontier(TREE, reversed)).toEqual(ranked);
  });

  it('round items carry shape, docs, facts (arrays), and previous/reason only for stale instances', () => {
    const ev = empty();
    for (const item of pickRound(TREE, ev, 20)) {
      const q = TREE.find(x => x.id === item.id);
      expect(item.title).toBe(q?.title);
      expect(item.ask).toBe(q?.ask);
      expect(item.shape).toEqual(q?.shape);
      expect(Array.isArray(item.docs)).toBe(true);
      expect(Array.isArray(item.facts)).toBe(true);
      expect(item.docs).toEqual(q?.docs);
      expect(item.facts).toEqual(q?.facts);
      expect('previous' in item).toBe(false);
      expect('reason' in item).toBe(false);
    }
    // A stale C1 carries its previous value and reason; an open one with the same fields does not.
    const mark = (status: InstanceStatus) => (i: Instance) =>
      i.id === 'C1' ? { ...i, status, previous: 'timed', reason: 'C1 changed' } : i;
    const withC1 = (status: InstanceStatus): Evaluation => ({
      ...ev,
      instances: ev.instances.map(mark(status)),
      frontier: ev.frontier.map(mark(status)),
    });
    const stale = pickRound(TREE, withC1('stale'), 1);
    expect(stale).toEqual([
      expect.objectContaining({ id: 'C1', previous: 'timed', reason: 'C1 changed' }),
    ]);
    const open = pickRound(TREE, withC1('open'), 1);
    expect(open[0].id).toBe('C1');
    expect('previous' in open[0]).toBe(false);
    expect('reason' in open[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// applyAnswers and crossCheck (FR-007, FR-011 to FR-015; plan §3).

const question = (id: string): Question => {
  const found = TREE.find(q => q.id === id);
  if (found === undefined) throw new Error(`no question ${id}`);
  return found;
};

function apply(
  b: BriefState,
  input: readonly AnswerInput[],
  facts: Facts = fakeFacts(),
  round = nextRound(b)
) {
  return applyAnswers(TREE, b, facts, input, round);
}

const recorded = (b: BriefState, id: string): Answer | undefined =>
  b.answers.find(x => x.id === id);

/** The single rejection of a call (the call rejected exactly `id`). */
function rejectionOf(result: ReturnType<typeof apply>, id: string) {
  expect(result.rejected.map(r => r.id)).toEqual([id]);
  return result.rejected[0];
}

const TWO = variant(TWO_VIEWS);

describe('rejections (FR-007)', () => {
  it('an unknown template id (Z9) is unknown-question', () => {
    const result = apply(EMPTY_BRIEF, [{ id: 'Z9', value: 'x' }]);
    expect(result.rejected).toEqual([
      { id: 'Z9', reason: 'unknown-question', message: expect.any(String) },
    ]);
    expect(result.changed).toBe(false);
    expect(result.brief).toEqual(EMPTY_BRIEF);
  });

  it('V2:nosuch is waiting before S2 is settled and unknown-question after', () => {
    // S2 recorded, but S1 is unanswered: S2 is not settled.
    const unsettled = brief(a('S2', [{ name: 'intro', purpose: 'x' }]));
    const before = rejectionOf(apply(unsettled, [{ id: 'V2:nosuch', value: 'x' }]), 'V2:nosuch');
    expect(before.reason).toBe('waiting');
    const settled = brief(
      a('P5', 90),
      a('C1', 'self-paced'),
      a('S1', 'timed-piece'),
      a('S2', [{ name: 'intro', purpose: 'x' }])
    );
    expect(statusOf(settled, 'S2')).toBe('answered');
    const after = rejectionOf(apply(settled, [{ id: 'V2:nosuch', value: 'x' }]), 'V2:nosuch');
    expect(after.reason).toBe('unknown-question');
    expect(after.message).toContain('nosuch');
  });

  it('P1 twice in one call: the first is recorded, the second is rejected duplicate', () => {
    const result = apply(EMPTY_BRIEF, [
      { id: 'P1', value: 'First.' },
      { id: 'P1', value: 'Second.' },
    ]);
    expect(recorded(result.brief, 'P1')).toEqual(a('P1', 'First.'));
    expect(result.rejected).toEqual([
      { id: 'P1', reason: 'duplicate', message: expect.any(String) },
    ]);
    expect(result.changed).toBe(true);
  });

  it('one invalid and one valid answer in one call: the valid one is recorded', () => {
    const result = apply(EMPTY_BRIEF, [
      { id: 'P5', value: '90' },
      { id: 'P1', value: 'Know the product.' },
    ]);
    expect(rejectionOf(result, 'P5').reason).toBe('invalid-value');
    expect(result.brief.answers).toEqual([a('P1', 'Know the product.')]);
    expect(result.changed).toBe(true);
  });

  it('a waiting answer is rejected waiting', () => {
    const result = apply(EMPTY_BRIEF, [{ id: 'S2', value: [{ name: 'main', purpose: 'x' }] }]);
    const rejection = rejectionOf(result, 'S2');
    expect(rejection.reason).toBe('waiting');
    expect(rejection.message).toContain('S1');
    expect(result.changed).toBe(false);
  });

  it('a not-applicable answer is rejected not-applicable', () => {
    const result = apply(COMPLETE, [{ id: 'S3', value: 'main' }]);
    expect(rejectionOf(result, 'S3').reason).toBe('not-applicable');
    expect(result.brief).toEqual(COMPLETE);
  });
});

describe('wire forms through applyAnswers (SC-020)', () => {
  // S7 applies: a video view and C4 on.
  const BASE = variant([VIDEO_VIEW, a('C4', 'on')]);
  const cases: readonly [string, string, unknown][] = [
    ['"yes"', 'S7', 'yes'],
    ['"90"', 'P5', '90'],
    ['"90s"', 'P5', '90s'],
    ['"1m30s"', 'P5', '1m30s'],
    ['"mouse, touch"', 'C3', 'mouse, touch'],
    ['a record', 'C2', { device: 'desktop', primary: 'yes' }],
    ['"Self-Paced"', 'C1', 'Self-Paced'],
    ['a number cell', 'S2', [{ name: 1, purpose: 'x' }]],
    ['a boolean cell', 'C2', [{ device: 'desktop', primary: true }]],
  ];

  it.each(cases)('%s for %s is rejected invalid-value and nothing is recorded', (_l, id, value) => {
    expect(statusOf(BASE, id)).not.toBe('waiting');
    const result = apply(BASE, [{ id, value }]);
    expect(result.rejected).toEqual([
      {
        id,
        reason: 'invalid-value',
        message: expect.stringContaining(expectedForm(question(id).shape)),
      },
    ]);
    expect(result.changed).toBe(false);
    expect(result.brief.answers).toEqual(BASE.answers);
  });

  it('one wrong value per FR-006 shape is rejected invalid-value', () => {
    const wrong: readonly [string, string, unknown][] = [
      ['text', 'P1', 42],
      ['choice', 'C1', 'deck'],
      ['set', 'C3', 'mouse'],
      ['yes-no', 'R4', 'no'],
      ['duration', 'P5', -1],
      ['view', 'S3', 42],
      ['path', 'R3', 'src\\main.eligian'],
      ['record', 'D4', 'fluid'],
      ['table', 'C2', { device: 'desktop', primary: 'yes' }],
    ];
    for (const [kind, id, value] of wrong) {
      expect(question(id).shape.kind, id).toBe(kind);
      const result = apply(TWO, [{ id, value }]);
      expect(result.rejected, `${kind} ${id}`).toEqual([
        {
          id,
          reason: 'invalid-value',
          message: expect.stringContaining(expectedForm(question(id).shape)),
        },
      ]);
      expect(result.brief).toEqual(TWO);
    }
  });

  it('an FR-006 extra-validation failure is invalid-value, a cross-reference failure is invalid-reference', () => {
    const twoPrimaries = apply(COMPLETE, [
      {
        id: 'C2',
        value: [
          { device: 'desktop', primary: 'yes' },
          { device: 'phone', primary: 'yes' },
        ],
      },
    ]);
    expect(rejectionOf(twoPrimaries, 'C2').reason).toBe('invalid-value');
    expect(rejectionOf(twoPrimaries, 'C2').message).toContain('exactly one');
    const noView = apply(TWO, [{ id: 'S3', value: 'nowhere' }]);
    expect(rejectionOf(noView, 'S3').reason).toBe('invalid-reference');
  });
});

describe('cross-references', () => {
  /** The call is rejected invalid-reference, changes nothing, and the message names `needle`. */
  function expectReference(
    b: BriefState,
    id: string,
    value: unknown,
    needle: string,
    facts: Facts = fakeFacts()
  ) {
    expect(statusOf(b, id, facts), `${id} is answerable`).not.toMatch(/waiting|not-applicable/);
    const result = apply(b, [{ id, value }], facts);
    const rejection = rejectionOf(result, id);
    expect(rejection.reason).toBe('invalid-reference');
    expect(rejection.message).toContain(needle);
    expect(result.changed).toBe(false);
    expect(result.brief).toEqual(b);
  }

  const accepts = (b: BriefState, id: string, value: unknown, facts: Facts = fakeFacts()) => {
    const result = apply(b, [{ id, value }], facts);
    expect(result.rejected).toEqual([]);
    expect(recorded(result.brief, id)?.value).toEqual(value);
  };

  it('S3 names a view of S2', () => {
    expectReference(TWO, 'S3', 'nowhere', 'nowhere');
    accepts(TWO, 'S3', 'second');
  });

  it('S4 view and target name views of S2', () => {
    expectReference(TWO, 'S4', [{ view: 'main', target: 'ghost', trigger: 'click' }], 'ghost');
    expectReference(TWO, 'S4', [{ view: 'ghost', target: 'main', trigger: 'click' }], 'ghost');
  });

  it.each([
    ['S5', { end: 'stay' }],
    ['S6', { provider: 'raf', source: '-' }],
    ['D5', { layout: 'title' }],
  ] as const)('%s with a missing row and with an extra row', (id, cells) => {
    expectReference(TWO, id, [{ view: 'main', ...cells }], 'second');
    expectReference(
      TWO,
      id,
      ['main', 'second', 'ghost'].map(view => ({ view, ...cells })),
      'ghost'
    );
    expectReference(
      TWO,
      id,
      ['main', 'second', 'main'].map(view => ({ view, ...cells })),
      'main'
    );
    accepts(
      TWO,
      id,
      ['second', 'main'].map(view => ({ view, ...cells }))
    );
  });

  it('L1 an invalid code (en_US), a duplicate code, two defaults', () => {
    expectReference(COMPLETE, 'L1', [{ code: 'en_US', default: 'yes' }], 'en_US');
    expectReference(
      COMPLETE,
      'L1',
      [
        { code: 'en-US', default: 'yes' },
        { code: 'en-US', default: 'no' },
      ],
      'en-US'
    );
    expectReference(
      COMPLETE,
      'L1',
      [
        { code: 'en-US', default: 'yes' },
        { code: 'nl-NL', default: 'yes' },
      ],
      'default'
    );
    accepts(COMPLETE, 'L1', TWO_LANGUAGES.value);
  });

  it('L2 rows are exactly the L1 codes', () => {
    const b = variant([TWO_LANGUAGES]);
    const row = (language: string) => ({ language, supplier: 'agency', when: 'May' });
    expectReference(b, 'L2', [row('en-US')], 'nl-NL');
    expectReference(b, 'L2', [row('en-US'), row('nl-NL'), row('fr-FR')], 'fr-FR');
    accepts(b, 'L2', [row('nl-NL'), row('en-US')]);
  });

  it('A1 rows are one per missing entry', () => {
    const b = variant([MISSING_IMAGE_V3]);
    expectReference(
      b,
      'A1',
      [{ asset: 'img/other.png', who: 'design', when: 'May' }],
      'img/other.png'
    );
    expectReference(b, 'A1', [], 'main: Logo');
    accepts(b, 'A1', A1_FOR_LOGO.value);
  });

  it('A4 rows are one per video or audio entry', () => {
    const b = variant([VIDEO_VIEW]);
    const row = (file: string) => ({ file, poster: '-', captions: '-', loop: 'no', muted: 'no' });
    expectReference(b, 'A4', [row('media/b.mp4')], 'media/b.mp4');
    accepts(b, 'A4', [row('media/a.mp4')]);
  });

  it('A5 rows are one per image entry', () => {
    const b = variant([IMAGE_V3]);
    expectReference(b, 'A5', [{ image: 'img/other.png', alt: 'x' }], 'img/other.png');
    accepts(b, 'A5', [{ image: 'img/logo.png', alt: 'The logo' }]);
  });

  it('a V3 file ../x.png that lies outside the project is invalid-reference (FR-012)', () => {
    expectReference(
      COMPLETE,
      'V3:main',
      [{ element: 'Logo', kind: 'image', file: '../x.png' }],
      '../x.png'
    );
    expectReference(
      COMPLETE,
      'V3:main',
      [{ element: 'Logo', kind: 'image', file: 'img/link.png' }],
      'img/link.png',
      fakeFacts({ outside: ['img/link.png'] })
    );
    accepts(COMPLETE, 'V3:main', [
      { element: 'Logo', kind: 'image', file: 'https://cdn.example/x.png' },
    ]);
  });

  it('an S6 source and a D3 file outside the project are invalid-reference', () => {
    expectReference(
      COMPLETE,
      'S6',
      [{ view: 'main', provider: 'video', source: '../film.mp4' }],
      '../film.mp4'
    );
    expectReference(
      COMPLETE,
      'D3',
      [{ font: 'Brand', source: 'project', file: '../fonts/brand.woff2', licence: 'own' }],
      '../fonts/brand.woff2'
    );
  });

  it('R3 sub/main.eligian while briefDir is . names directory: "sub" (FR-013)', () => {
    expectReference(COMPLETE, 'R3', 'sub/main.eligian', 'directory: "sub"');
    accepts(COMPLETE, 'R3', 'sub/main.eligian', fakeFacts({ briefDir: 'sub' }));
  });

  it.each([
    './main.eligian',
    '/abs/main.eligian',
    'main.txt',
    '../main.eligian',
    'C:/main.eligian',
  ])('R3 %s is invalid-reference (FR-013)', value => {
    expectReference(COMPLETE, 'R3', value, value);
  });
});

describe('one call', () => {
  const S2_VALUE = [{ name: 'main', purpose: 'The whole piece' }];

  it('a question and its prerequisite given in reverse order are both accepted', () => {
    const result = apply(EMPTY_BRIEF, [
      { id: 'S2', value: S2_VALUE },
      { id: 'S1', value: 'timed-piece' },
      { id: 'P5', value: 90 },
      { id: 'C1', value: 'self-paced' },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.changed).toBe(true);
    for (const id of ['S2', 'S1', 'P5', 'C1']) {
      expect(recorded(result.brief, id)?.round, id).toBe(1);
    }
    expect(statusOf(result.brief, 'S2')).toBe('answered');
  });

  it('a rejected prerequisite leaves its dependent waiting', () => {
    const result = apply(EMPTY_BRIEF, [
      { id: 'S2', value: S2_VALUE },
      { id: 'S1', value: 'deck' },
      { id: 'P5', value: 90 },
      { id: 'C1', value: 'self-paced' },
    ]);
    expect(result.rejected.map(r => [r.id, r.reason])).toEqual([
      ['S2', 'waiting'],
      ['S1', 'invalid-value'],
    ]);
    expect(result.brief.answers.map(x => x.id).sort()).toEqual(['C1', 'P5']);
    expect(statusOf(result.brief, 'S2')).toBe('waiting');
  });

  it('P5, C1, S1, S2 in one call are accepted in dependency order', () => {
    const result = apply(EMPTY_BRIEF, [
      { id: 'P5', value: 90 },
      { id: 'C1', value: 'self-paced' },
      { id: 'S1', value: 'timed-piece' },
      { id: 'S2', value: S2_VALUE },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.brief.answers).toEqual([
      a('P5', 90),
      a('C1', 'self-paced'),
      a('S1', 'timed-piece'),
      a('S2', S2_VALUE),
    ]);
    expect(evaluate(TREE, result.brief, fakeFacts()).views).toEqual(['main']);
  });
});

describe('round numbers', () => {
  it('the first answer call is round 1 and the next round 2', () => {
    const first = apply(EMPTY_BRIEF, [{ id: 'P1', value: 'Know it.' }]);
    expect(recorded(first.brief, 'P1')?.round).toBe(1);
    expect(nextRound(first.brief)).toBe(2);
    const second = apply(first.brief, [{ id: 'P2', value: 'none' }]);
    expect(recorded(second.brief, 'P2')?.round).toBe(2);
    expect(recorded(second.brief, 'P1')?.round).toBe(1);
  });

  it('a call that changes nothing consumes no round', () => {
    const b = brief(a('P1', 'Know it.', 1));
    const result = apply(b, [
      { id: 'P1', value: 'Know it.' },
      { id: 'Z9', value: 'x' },
      { id: 'P5', value: '90s' },
    ]);
    expect(result.changed).toBe(false);
    expect(result.brief).toEqual(b);
    expect(nextRound(result.brief)).toBe(nextRound(b));
  });
});

describe('no-op and by-only', () => {
  const b = variant([
    a('P1', 'Know it.', 3),
    a('D4', { choice: 'fluid', detail: 'two breakpoints' }, 2),
  ]);

  it('the same value and by is a no-op: changed false, round kept', () => {
    const result = apply(
      b,
      [
        { id: 'P1', value: 'Know it.' },
        // The same record with its keys in another order (canonical comparison).
        { id: 'D4', value: { detail: 'two breakpoints', choice: 'fluid' } },
      ],
      fakeFacts(),
      5
    );
    expect(result.rejected).toEqual([]);
    expect(result.changed).toBe(false);
    expect(result.brief).toEqual(b);
  });

  it('only by differs: by updated, round kept, changed true', () => {
    const result = apply(b, [{ id: 'P1', value: 'Know it.', delegated: true }], fakeFacts(), 5);
    expect(result.changed).toBe(true);
    expect(recorded(result.brief, 'P1')).toEqual(a('P1', 'Know it.', 3, { by: 'delegated' }));
  });

  it('a changed value takes the call round and keeps its place', () => {
    const result = apply(b, [{ id: 'P1', value: 'Know it well.' }], fakeFacts(), 5);
    expect(result.changed).toBe(true);
    expect(recorded(result.brief, 'P1')).toEqual(a('P1', 'Know it well.', 5));
    expect(result.brief.answers.map(x => x.id)).toEqual(b.answers.map(x => x.id));
  });
});

describe('same as (acceptance)', () => {
  const start = (...names: readonly string[]) => [
    a('P5', 90),
    a('C1', 'self-paced'),
    a('C4', 'off'),
    a('S1', 'slide-deck'),
    a(
      'S2',
      names.map(name => ({ name, purpose: `The ${name}` }))
    ),
    a(
      'S6',
      names.map(view => ({ view, provider: 'raf', source: '-' }))
    ),
  ];
  const AB = brief(...start('a', 'b'));

  it('V:b = "same as a" is accepted once S2 is answered', () => {
    const before = brief(a('P5', 90), a('C1', 'self-paced'), a('C4', 'off'), a('S1', 'slide-deck'));
    const early = rejectionOf(apply(before, [{ id: 'V:b', value: 'same as a' }]), 'V:b');
    expect(early.reason).toBe('waiting');
    const result = apply(AB, [{ id: 'V:b', value: 'same as a' }]);
    expect(result.rejected).toEqual([]);
    expect(recorded(result.brief, 'V:b')).toEqual(
      a('V:b', 'same as a', 2, { basis: viewBasis(AB, 'b') })
    );
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'V:b').status).toBe('answered');
    // The copies wait for a's answers and are never on the frontier.
    expect(instance(ev, 'V1:b').status).toBe('waiting');
    expect(frontierIds(ev)).toContain('V1:a');
    expect(frontierIds(ev)).not.toContain('V1:b');
  });

  it('an explicit V2:b overrides the copy', () => {
    const b = withBasis(brief(...start('a', 'b'), a('V:b', 'same as a')));
    const result = apply(b, [{ id: 'V2:b', value: 'Hello b.' }]);
    expect(result.rejected).toEqual([]);
    expect(recorded(result.brief, 'V2:b')).toEqual(
      a('V2:b', 'Hello b.', 2, { basis: viewBasis(b, 'b') })
    );
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'V2:b').status).toBe('answered');
    expect(instance(ev, 'V2:b').value).toBe('Hello b.');
    expect(instance(ev, 'V2:a').status).toBe('open');
  });

  it('a chain (a is same as c) is invalid-reference', () => {
    const b = withBasis(brief(...start('a', 'b', 'c'), a('V:a', 'same as c')));
    const rejection = rejectionOf(apply(b, [{ id: 'V:b', value: 'same as a' }]), 'V:b');
    expect(rejection.reason).toBe('invalid-reference');
    expect(rejection.message).toContain('same as c');
  });

  it('a self-reference is invalid-reference', () => {
    const rejection = rejectionOf(apply(AB, [{ id: 'V:b', value: 'same as b' }]), 'V:b');
    expect(rejection.reason).toBe('invalid-reference');
  });

  it('a target not in S2 is invalid-reference', () => {
    const rejection = rejectionOf(apply(AB, [{ id: 'V:b', value: 'same as zz' }]), 'V:b');
    expect(rejection.reason).toBe('invalid-reference');
    expect(rejection.message).toContain('zz');
  });

  it('a value that is not "same as <view>" is invalid-value', () => {
    const rejection = rejectionOf(apply(AB, [{ id: 'V:b', value: 'like a' }]), 'V:b');
    expect(rejection.reason).toBe('invalid-value');
  });
});

// ---------------------------------------------------------------------------------------------
// Staleness, review, re-validation, dormant answers and the live `same as` (FR-014 to FR-016,
// FR-039, FR-040; plan §3 steps 4a–4h).

/**
 * `b` with each of `changes` in place of the recorded answer of its id (appended when new): a hand
 * edit, so rounds and V bases are exactly as given.
 */
function edit(b: BriefState, ...changes: Answer[]): BriefState {
  const byId = new Map(changes.map(c => [c.id, c]));
  return {
    ...b,
    answers: [
      ...b.answers.map(x => byId.get(x.id) ?? x),
      ...changes.filter(c => !b.answers.some(x => x.id === c.id)),
    ],
  };
}

const valueOf = (b: BriefState, id: string): AnswerValue => {
  const found = recorded(b, id);
  if (found === undefined) throw new Error(`no answer ${id}`);
  return found.value;
};

describe('staleness by round (FR-016)', () => {
  it('a prerequisite with a later round makes its dependent stale with previous', () => {
    const ev = evaluate(TREE, edit(COMPLETE, a('C1', 'presenter', 2)), fakeFacts());
    const s1 = instance(ev, 'S1');
    expect(s1.status).toBe('stale');
    expect(s1.previous).toBe('timed-piece');
    expect(s1.reason).toBeUndefined();
    expect(frontierIds(ev)).toContain('S1');
    // S2 waits for the stale S1; it is not stale itself.
    expect(instance(ev, 'S2').status).toBe('waiting');
  });

  it("a prerequisite's reviewed never reopens a dependent", () => {
    const b = edit(COMPLETE, a('C1', 'presenter', 2), a('S1', 'timed-piece', 1, { reviewed: 5 }));
    const ev = evaluate(TREE, b, fakeFacts());
    expect(instance(ev, 'S1').status).toBe('answered');
    // S1's round is 1: S2 (round 1) is not reopened by S1's reviewed 5.
    expect(instance(ev, 'S2').status).toBe('answered');
  });

  it('S2 and S6 rounds do not reopen V answers', () => {
    const b = edit(
      COMPLETE,
      a('S2', valueOf(COMPLETE, 'S2'), 5),
      a('S6', valueOf(COMPLETE, 'S6'), 5)
    );
    const ev = evaluate(TREE, b, fakeFacts());
    expect(instance(ev, 'S6').status).toBe('answered');
    for (let n = 1; n <= 6; n++) {
      expect(instance(ev, `V${n}:main`).status, `V${n}:main`).toBe('answered');
    }
    // S2's round does reopen a non-V dependent.
    expect(instance(ev, 'S5').status).toBe('stale');
  });
});

const IE_VIEWS = ['intro', 'end'];
const IE_S2 = [
  { name: 'intro', purpose: 'The promise' },
  { name: 'end', purpose: 'The close' },
];
const IE_S6 = IE_VIEWS.map(view => ({ view, provider: 'raf', source: '-' }));
const vAnswers = (view: string): Answer[] => [
  a(`V1:${view}`, 'One idea.'),
  a(`V2:${view}`, 'Hello.'),
  a(`V3:${view}`, 'none'),
  a(`V4:${view}`, 'The title fades in.'),
  a(`V5:${view}`, { duration: '30', pacing: 'fixed', 'cues-from': '-' }),
  a(`V6:${view}`, 'none'),
];
/** Views `intro` and `end`, every V question answered with the current basis. */
const INTRO_END = withBasis(
  brief(
    a('P5', 90),
    a('C1', 'self-paced'),
    a('C3', ['mouse', 'keyboard']),
    a('C4', 'off'),
    a('S1', 'slide-deck'),
    a('S2', IE_S2),
    a('S6', IE_S6),
    ...IE_VIEWS.flatMap(vAnswers)
  )
);
const NEW_END_S2 = [IE_S2[0], { name: 'end', purpose: 'The new close' }];

describe('per-view basis (in memory)', () => {
  it("changing S2's end row makes V copies of end stale and keeps intro answered", () => {
    // S6 was already reviewed after the S2 change, so only the bases decide.
    const b = edit(INTRO_END, a('S2', NEW_END_S2, 2), a('S6', IE_S6, 1, { reviewed: 2 }));
    const ev = evaluate(TREE, b, fakeFacts());
    expect(instance(ev, 'S6').status).toBe('answered');
    for (let n = 1; n <= 6; n++) {
      const end = instance(ev, `V${n}:end`);
      expect(end.status, `V${n}:end`).toBe('stale');
      expect(end.previous).toEqual(valueOf(INTRO_END, `V${n}:end`));
      expect(instance(ev, `V${n}:intro`).status, `V${n}:intro`).toBe('answered');
    }
  });

  it('a V answer without a basis line is stale', () => {
    const ev = evaluate(TREE, edit(INTRO_END, a('V1:intro', 'One idea.')), fakeFacts());
    expect(instance(ev, 'V1:intro').status).toBe('stale');
    expect(instance(ev, 'V1:intro').previous).toBe('One idea.');
    expect(instance(ev, 'V2:intro').status).toBe('answered');
  });

  it('S6 re-sent unchanged keeps intro settled', () => {
    const changed = apply(INTRO_END, [{ id: 'S2', value: NEW_END_S2 }]);
    expect(changed.rejected).toEqual([]);
    const reopened = evaluate(TREE, changed.brief, fakeFacts());
    expect(instance(reopened, 'S6').status).toBe('stale');
    expect(instance(reopened, 'V1:intro').status).toBe('waiting');
    const kept = apply(changed.brief, [{ id: 'S6', value: IE_S6 }]);
    expect(kept.rejected).toEqual([]);
    expect(recorded(kept.brief, 'S6')).toEqual(a('S6', IE_S6, 1, { reviewed: 3 }));
    const ev = evaluate(TREE, kept.brief, fakeFacts());
    for (let n = 1; n <= 6; n++) {
      expect(instance(ev, `V${n}:intro`).status, `V${n}:intro`).toBe('answered');
      expect(instance(ev, `V${n}:end`).status, `V${n}:end`).toBe('stale');
    }
  });
});

describe('per-view basis, re-parsed from text (SC-005)', () => {
  /** `b` written to `BRIEF.md` text and parsed again: nothing carries over in memory. */
  const reparse = (b: BriefState): BriefState => {
    const evaluation = evaluate(TREE, b, fakeFacts());
    const text = writeBrief(
      TREE,
      { brief: b, ignored: [], kept: [] },
      {
        state: evaluation.state,
        serverEligian: '1.1.0',
        eligianInstalled: undefined,
        packageManager: undefined,
        textDirection: undefined,
        assets: evaluation.assets,
      }
    );
    const parsed = parseBrief(text);
    expect(parsed.ignored).toEqual([]);
    return parsed.brief;
  };

  it("with intro and end fully answered, written and parsed again, changing S2's end row makes end's V copies stale and keeps intro's; S6 re-sent unchanged keeps intro settled", () => {
    const start = reparse(INTRO_END);
    const settled = evaluate(TREE, start, fakeFacts());
    for (const view of IE_VIEWS) {
      for (let n = 1; n <= 6; n++) {
        expect(instance(settled, `V${n}:${view}`).status, `V${n}:${view}`).toBe('answered');
      }
    }

    const changed = apply(start, [{ id: 'S2', value: NEW_END_S2 }]);
    expect(changed.rejected).toEqual([]);
    const afterS2 = reparse(changed.brief);
    const reopened = evaluate(TREE, afterS2, fakeFacts());
    expect(instance(reopened, 'S6').status).toBe('stale');
    expect(instance(reopened, 'V1:intro').status).toBe('waiting');

    const kept = apply(afterS2, [{ id: 'S6', value: IE_S6 }]);
    expect(kept.rejected).toEqual([]);
    const afterS6 = reparse(kept.brief);
    expect(recorded(afterS6, 'S6')).toEqual(a('S6', IE_S6, 1, { reviewed: 3 }));
    const ev = evaluate(TREE, afterS6, fakeFacts());
    expect(instance(ev, 'S6').status).toBe('answered');
    for (let n = 1; n <= 6; n++) {
      expect(instance(ev, `V${n}:intro`).status, `V${n}:intro`).toBe('answered');
      const end = instance(ev, `V${n}:end`);
      expect(end.status, `V${n}:end`).toBe('stale');
      expect(end.previous).toEqual(valueOf(INTRO_END, `V${n}:end`));
    }
  });
});

describe('review (SC-016)', () => {
  /** C1 changed in round 2, after S1 and S2 were answered in round 1. */
  const c1Changed = () => apply(COMPLETE, [{ id: 'C1', value: 'presenter' }]).brief;
  /** S1 then re-sent unchanged in round 3. */
  const s1Reviewed = () => apply(c1Changed(), [{ id: 'S1', value: 'timed-piece' }]);

  it('C1 changed after S1 and S2: S1 is on the frontier with previous, S2 is not stale', () => {
    const b = c1Changed();
    expect(recorded(b, 'C1')?.round).toBe(2);
    const ev = evaluate(TREE, b, fakeFacts());
    expect(instance(ev, 'S1').status).toBe('stale');
    expect(instance(ev, 'S1').previous).toBe('timed-piece');
    expect(frontierIds(ev)).toContain('S1');
    expect(instance(ev, 'S2').status).not.toBe('stale');
    expect(frontierIds(ev)).not.toContain('S2');
  });

  it('S1 re-sent unchanged gets reviewed: n, keeps its round, is not in the next round, S2 stays answered', () => {
    const result = s1Reviewed();
    expect(result.rejected).toEqual([]);
    expect(result.changed).toBe(true);
    expect(recorded(result.brief, 'S1')).toEqual(a('S1', 'timed-piece', 1, { reviewed: 3 }));
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'S1').status).toBe('answered');
    expect(pickRound(TREE, ev, 20).map(i => i.id)).not.toContain('S1');
    for (const id of ['S2', 'S6', 'V1:main', 'V3:main', 'I1']) {
      expect(instance(ev, id).status, id).toBe('answered');
    }
  });

  it('S1 re-sent changed takes the round, loses reviewed, S2 is on the frontier with previous', () => {
    const reviewed = s1Reviewed().brief;
    const result = apply(reviewed, [{ id: 'S1', value: 'slide-deck' }]);
    expect(result.rejected).toEqual([]);
    expect(recorded(result.brief, 'S1')).toEqual(a('S1', 'slide-deck', 4));
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'S2').status).toBe('stale');
    expect(instance(ev, 'S2').previous).toEqual(valueOf(COMPLETE, 'S2'));
    expect(frontierIds(ev)).toContain('S2');
  });

  it('the reviewing call consumes a round: the next answer is n + 1', () => {
    const reviewed = s1Reviewed().brief;
    expect(nextRound(reviewed)).toBe(4);
    const next = apply(reviewed, [{ id: 'P1', value: 'Know it well.' }]);
    expect(recorded(next.brief, 'P1')?.round).toBe(4);
  });

  it('a reviewed V answer gets the current basis', () => {
    const b = edit(INTRO_END, a('S2', NEW_END_S2, 2), a('S6', IE_S6, 1, { reviewed: 2 }));
    expect(statusOf(b, 'V1:end')).toBe('stale');
    const oldBasis = recorded(b, 'V1:end')?.basis;
    const result = apply(b, [{ id: 'V1:end', value: 'One idea.' }]);
    expect(result.rejected).toEqual([]);
    const reviewed = recorded(result.brief, 'V1:end');
    expect(reviewed).toEqual(
      a('V1:end', 'One idea.', 1, { reviewed: 3, basis: viewBasis(b, 'end') })
    );
    expect(reviewed?.basis).not.toBe(oldBasis);
    expect(statusOf(result.brief, 'V1:end')).toBe('answered');
  });

  it('a reviewed answer is stale again when its prerequisite changes after the review', () => {
    const reviewed = s1Reviewed().brief;
    const result = apply(reviewed, [{ id: 'C1', value: 'loop' }]);
    expect(recorded(result.brief, 'C1')?.round).toBe(4);
    const s1 = instance(evaluate(TREE, result.brief, fakeFacts()), 'S1');
    expect(s1.status).toBe('stale');
    expect(s1.previous).toBe('timed-piece');
  });

  it('C4 changed reopens S6; S6 re-sent unchanged is reviewed and not in the next round (SC-005)', () => {
    const changed = apply(COMPLETE, [{ id: 'C4', value: 'on' }]).brief;
    expect(statusOf(changed, 'S6')).toBe('stale');
    const result = apply(changed, [{ id: 'S6', value: valueOf(COMPLETE, 'S6') }]);
    expect(result.rejected).toEqual([]);
    expect(recorded(result.brief, 'S6')).toEqual(
      a('S6', valueOf(COMPLETE, 'S6'), 1, { reviewed: 3 })
    );
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'S6').status).toBe('answered');
    expect(pickRound(TREE, ev, 20).map(i => i.id)).not.toContain('S6');
    expect(instance(ev, 'V1:main').status).toBe('answered');
  });
});

describe('re-validation (SC-018)', () => {
  it('after S2 drops a view that S3 names, S3 is stale with previous and reason', () => {
    const views = (...names: readonly string[]) =>
      a(
        'S2',
        names.map(name => ({ name, purpose: `The ${name}` }))
      );
    const three = brief(
      a('P5', 90),
      a('C1', 'self-paced'),
      a('S1', 'slide-deck'),
      views('main', 'second', 'third'),
      a('S3', 'third')
    );
    expect(statusOf(three, 'S3')).toBe('answered');
    // A hand edit drops `third`; no round moves.
    const dropped = edit(three, views('main', 'second'));
    const s3 = instance(evaluate(TREE, dropped, fakeFacts()), 'S3');
    expect(s3.status).toBe('stale');
    expect(s3.previous).toBe('third');
    expect(s3.reason).toContain('third');
  });

  const TWO_MISSING = variant([
    a('V3:main', [
      { element: 'Logo', kind: 'image', file: 'img/a.png' },
      { element: 'Photo', kind: 'image', file: 'img/b.png' },
    ]),
    a('A1', [
      { asset: 'img/a.png', who: 'design', when: 'May' },
      { asset: 'img/b.png', who: 'design', when: 'June' },
    ]),
  ]);
  const A_APPEARS = fakeFacts({ exists: ['img/a.png'] });

  it("after a missing asset file appears (fakeFacts exists), A1's rows are stale with a reason", () => {
    expect(statusOf(TWO_MISSING, 'A1')).toBe('answered');
    const a1 = instance(evaluate(TREE, TWO_MISSING, A_APPEARS), 'A1');
    expect(a1.status).toBe('stale');
    expect(a1.previous).toEqual(valueOf(TWO_MISSING, 'A1'));
    expect(a1.reason).toContain('img/a.png');
  });

  it('re-sending the same invalid value is rejected with that reason', () => {
    const reason = instance(evaluate(TREE, TWO_MISSING, A_APPEARS), 'A1').reason;
    expect(reason).toEqual(expect.any(String));
    const result = apply(TWO_MISSING, [{ id: 'A1', value: valueOf(TWO_MISSING, 'A1') }], A_APPEARS);
    expect(result.rejected).toEqual([{ id: 'A1', reason: 'invalid-reference', message: reason }]);
    expect(result.changed).toBe(false);
  });

  it('a corrected value settles it', () => {
    const corrected = [{ asset: 'img/b.png', who: 'design', when: 'June' }];
    const result = apply(TWO_MISSING, [{ id: 'A1', value: corrected }], A_APPEARS);
    expect(result.rejected).toEqual([]);
    expect(recorded(result.brief, 'A1')?.value).toEqual(corrected);
    expect(statusOf(result.brief, 'A1', A_APPEARS)).toBe('answered');
  });

  it('the stale answer is kept in brief.answers unchanged', () => {
    expect(evaluate(TREE, TWO_MISSING, A_APPEARS).instances).toContainEqual(
      expect.objectContaining({ id: 'A1', status: 'stale' })
    );
    const result = apply(TWO_MISSING, [{ id: 'A1', value: valueOf(TWO_MISSING, 'A1') }], A_APPEARS);
    expect(result.brief).toEqual(TWO_MISSING);
    expect(recorded(result.brief, 'A1')).toEqual(recorded(TWO_MISSING, 'A1'));
  });
});

describe('dormant (SC-019 engine half)', () => {
  const WITH_S3 = edit(COMPLETE, a('S3', 'main', 1, { by: 'delegated' }));

  it("after S2 drops to one view S3's answer is dormant: counted notApplicable, not answered, not delegated, not in the digest", () => {
    const ev = evaluate(TREE, WITH_S3, fakeFacts());
    const complete = evaluate(TREE, COMPLETE, fakeFacts());
    const s3 = instance(ev, 'S3');
    expect(s3.status).toBe('not-applicable');
    expect(s3.dormant).toBe(true);
    expect(ev.counts).toEqual(complete.counts);
    expect(ev.delegated).toEqual(complete.delegated);
    expect(ev.digest).toBe(complete.digest);
    expect(ev.digest).not.toBe(digest(WITH_S3.answers));
    // A confirmation made while S3 applied no longer matches: the state is complete.
    const confirmed: BriefState = {
      ...WITH_S3,
      confirmation: signedConfirmation(WITH_S3.answers, nextRound(WITH_S3) - 1, 'Yes.'),
    };
    expect(evaluate(TREE, confirmed, fakeFacts({ signer: SIGNER })).state).toBe('complete');
  });

  it('an answer for S3 is rejected not-applicable', () => {
    const result = apply(WITH_S3, [{ id: 'S3', value: 'main' }]);
    expect(rejectionOf(result, 'S3').reason).toBe('not-applicable');
    expect(result.brief).toEqual(WITH_S3);
  });

  it('C3 loses and regains keyboard: I2 is on the frontier with its old value as previous', () => {
    const lost = apply(COMPLETE, [{ id: 'C3', value: ['mouse'] }]).brief;
    const i2Lost = instance(evaluate(TREE, lost, fakeFacts()), 'I2');
    expect(i2Lost.status).toBe('not-applicable');
    expect(i2Lost.dormant).toBe(true);
    const regained = apply(lost, [{ id: 'C3', value: ['mouse', 'keyboard'] }]).brief;
    expect(recorded(regained, 'C3')?.round).toBe(3);
    const ev = evaluate(TREE, regained, fakeFacts());
    const i2 = instance(ev, 'I2');
    expect(i2.status).toBe('stale');
    expect(i2.dormant).toBe(false);
    expect(i2.previous).toEqual(valueOf(COMPLETE, 'I2'));
    expect(i2.reason).toBeUndefined();
    expect(frontierIds(ev)).toContain('I2');
  });

  it('a restored value with no round change is answered again', () => {
    const lost = edit(COMPLETE, a('C3', ['mouse'], 1));
    expect(statusOf(lost, 'I2')).toBe('not-applicable');
    const restored = edit(lost, a('C3', ['mouse', 'keyboard'], 1));
    expect(statusOf(restored, 'I2')).toBe('answered');
  });
});

describe('same as is live (SC-017)', () => {
  const start = (...names: readonly string[]) =>
    withBasis(
      brief(
        a('P5', 90),
        a('C1', 'self-paced'),
        a('C3', ['mouse']),
        a('C4', 'off'),
        a('S1', 'slide-deck'),
        a(
          'S2',
          names.map(name => ({ name, purpose: `The ${name}` }))
        ),
        a(
          'S6',
          names.map(view => ({ view, provider: 'raf', source: '-' }))
        )
      )
    );
  const sameAs = () => apply(start('a', 'b'), [{ id: 'V:b', value: 'same as a' }]).brief;
  const LOGO = [{ element: 'Logo', kind: 'image', file: '-' }];
  const answeredA = () =>
    apply(sameAs(), [
      { id: 'V1:a', value: 'One idea.' },
      { id: 'V3:a', value: LOGO },
    ]);

  it("V:b accepted while a has no V answers: V1:b…V6:b waiting, a's on the frontier", () => {
    const result = apply(start('a', 'b'), [{ id: 'V:b', value: 'same as a' }]);
    expect(result.rejected).toEqual([]);
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'V:b').status).toBe('answered');
    for (let n = 1; n <= 6; n++) {
      expect(instance(ev, `V${n}:b`).status, `V${n}:b`).toBe('waiting');
      expect(frontierIds(ev)).not.toContain(`V${n}:b`);
      expect(frontierIds(ev), `V${n}:a`).toContain(`V${n}:a`);
    }
  });

  it("once a's Vn is answered Vn:b is settled and counts as answered; a V3 copied from a puts its entries in the asset list under b", () => {
    const before = evaluate(TREE, sameAs(), fakeFacts());
    const result = answeredA();
    expect(result.rejected).toEqual([]);
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'V1:b').status).toBe('answered');
    expect(instance(ev, 'V1:b').value).toBe('One idea.');
    expect(instance(ev, 'V3:b').status).toBe('answered');
    expect(instance(ev, 'V2:b').status).toBe('waiting');
    expect(ev.counts.answered).toBe(before.counts.answered + 4);
    expect(recorded(result.brief, 'V1:b')).toBeUndefined();
    expect(ev.assets).toEqual([
      { key: 'a: Logo', kind: 'image', state: 'missing' },
      { key: 'b: Logo', kind: 'image', state: 'missing' },
    ]);
  });

  it("a's Vn changed: Vn:b follows and neither V:b nor Vn:b is stale or on the frontier", () => {
    const result = apply(answeredA().brief, [{ id: 'V1:a', value: 'Another idea.' }]);
    expect(result.rejected).toEqual([]);
    // start: round 1, V:b: round 2, a's answers: round 3, this change: round 4.
    expect(recorded(result.brief, 'V1:a')?.round).toBe(4);
    const ev = evaluate(TREE, result.brief, fakeFacts());
    expect(instance(ev, 'V1:b').value).toBe('Another idea.');
    for (const id of ['V:b', 'V1:b']) {
      expect(instance(ev, id).status, id).toBe('answered');
      expect(frontierIds(ev)).not.toContain(id);
    }
  });

  it('a hand-made chain (a is same as c in the brief) makes V:b stale with a reason', () => {
    const accepted = apply(start('a', 'b', 'c'), [{ id: 'V:b', value: 'same as a' }]);
    expect(accepted.rejected).toEqual([]);
    const chained = withBasis(edit(accepted.brief, a('V:a', 'same as c')));
    const ev = evaluate(TREE, chained, fakeFacts());
    const declaration = instance(ev, 'V:b');
    expect(declaration.status).toBe('stale');
    expect(declaration.previous).toBe('same as a');
    expect(declaration.reason).toContain('same as c');
    expect(frontierIds(ev)).toContain('V:b');
    expect(instance(ev, 'V1:b').status).toBe('waiting');
    expect(instance(ev, 'V:a').status).toBe('answered');
  });
});

// ---------------------------------------------------------------------------------------------
// Tree versions and confirm (FR-018, FR-022, FR-029 engine half; plan P11).

/** `b` with a confirmation signed over the canonical answers of `signed` (Phase 2 P4). */
const confirmedWith = (b: BriefState, signed: readonly Answer[]): BriefState => ({
  ...b,
  confirmation: signedConfirmation(signed, nextRound(b) - 1),
});

const SIGNED = fakeFacts({ signer: SIGNER });

describe('tree versions (FR-018)', () => {
  it('a brief confirmed under version 1 stays confirmed under TREE_V2 and P6 is not applicable', () => {
    expect(COMPLETE.treeVersion).toBe(1);
    const confirmed = confirmedWith(COMPLETE, COMPLETE.answers);
    const ev = evaluate(TREE_V2, confirmed, SIGNED);
    expect(ev.state).toBe('confirmed');
    expect(instance(ev, 'P6').status).toBe('not-applicable');
    expect(instance(ev, 'P6').dormant).toBe(false);
    expect(ev.frontier).toEqual([]);
    expect(ev.digest).toBe(digest(COMPLETE.answers));
  });

  it('an unconfirmed version-1 brief is evaluated against TREE_V2: P6 is on the frontier', () => {
    const ev = evaluate(TREE_V2, COMPLETE, fakeFacts());
    expect(instance(ev, 'P6').status).toBe('open');
    expect(frontierIds(ev)).toEqual(['P6']);
    expect(ev.state).toBe('open');
    expect(frontierIds(evaluate(TREE_V2, EMPTY_BRIEF, fakeFacts()))).toContain('P6');
  });

  it('a confirmed brief whose HMAC no longer verifies is evaluated against the full tree (pass 2)', () => {
    const stale = evaluate(TREE_V2, confirmedWith(COMPLETE, []), SIGNED);
    expect(instance(stale, 'P6').status).toBe('open');
    expect(frontierIds(stale)).toEqual(['P6']);
    expect(stale.state).toBe('open');

    // Confirmed under TREE_V2 with P6 answered, the version line still 1: pass 1 leaves P6 out of
    // the canonical answers, so the HMAC does not verify; pass 2 counts P6 and verifies.
    const withP6 = brief(...COMPLETE.answers, a('P6', 'Sign up.'));
    const confirmed = confirmedWith(withP6, withP6.answers);
    expect(confirmed.treeVersion).toBe(1);
    const ev = evaluate(TREE_V2, confirmed, SIGNED);
    expect(instance(ev, 'P6').status).toBe('answered');
    expect(ev.state).toBe('confirmed');
    expect(ev.digest).toBe(digest(withP6.answers));
  });

  it('the next write of an unconfirmed version-1 brief records the current version', () => {
    expect(COMPLETE.treeVersion).toBe(1);
    expect(recordedTreeVersion(TREE_V2, COMPLETE, fakeFacts(), 2)).toBe(2);
    expect(recordedTreeVersion(TREE_V2, EMPTY_BRIEF, fakeFacts(), 2)).toBe(2);
  });

  it('a brief confirmed under version 1 keeps version 1; a confirmation that no longer matches does not', () => {
    const confirmed = confirmedWith(COMPLETE, COMPLETE.answers);
    expect(recordedTreeVersion(TREE_V2, confirmed, SIGNED, 2)).toBe(1);
    const mismatched = confirmedWith(COMPLETE, []);
    expect(recordedTreeVersion(TREE_V2, mismatched, SIGNED, 2)).toBe(2);
    // Confirmed against the full version-2 tree (pass 2): it records version 2.
    const withP6 = brief(...COMPLETE.answers, a('P6', 'Sign up.'));
    expect(recordedTreeVersion(TREE_V2, confirmedWith(withP6, withP6.answers), SIGNED, 2)).toBe(2);
  });
});

describe('confirm', () => {
  const NOW = new Date('2026-11-19T10:30:00.000Z');
  const MESSAGE = 'Yes, "build" it.\nAll of it.';

  it('confirm(brief, mode, message, now, evaluation, signer, section) sets mode agent-reported, at = now.toISOString(), round and hmac over evaluation.canonical, message verbatim', () => {
    const ev = evaluate(TREE, COMPLETE, SIGNED);
    const confirmed = confirm(COMPLETE, 'agent-reported', MESSAGE, NOW, ev, SIGNER, 'brief');
    const round = nextRound(COMPLETE) - 1;
    expect(confirmed.confirmation).toEqual({
      mode: 'agent-reported',
      at: NOW.toISOString(),
      round,
      hmac: SIGNER.sign([
        'eligian-brief/1',
        'confirmation',
        'brief',
        'agent-reported',
        NOW.toISOString(),
        round,
        ev.canonical,
      ]),
      message: MESSAGE,
    });
    expect(confirmed.answers).toBe(COMPLETE.answers);
    expect(confirmed.treeVersion).toBe(COMPLETE.treeVersion);
    expect(COMPLETE.confirmation).toBeUndefined();
  });

  it('the state becomes confirmed', () => {
    const ev = evaluate(TREE, COMPLETE, SIGNED);
    expect(ev.state).toBe('complete');
    const confirmed = confirm(COMPLETE, 'agent-reported', MESSAGE, NOW, ev, SIGNER, 'brief');
    expect(evaluate(TREE, confirmed, SIGNED).state).toBe('confirmed');
  });

  it('a later answer change drops the state to complete or open', () => {
    const ev = evaluate(TREE, COMPLETE, SIGNED);
    const confirmed = confirm(COMPLETE, 'agent-reported', MESSAGE, NOW, ev, SIGNER, 'brief');
    // W1 has no dependents: the frontier stays empty, the HMAC no longer verifies.
    const w1 = apply(confirmed, [{ id: 'W1', value: 'only the end' }]);
    expect(w1.changed).toBe(true);
    expect(evaluate(TREE, w1.brief, SIGNED).state).toBe('complete');
    // P1 reopens W1 (W1 needs every other question): the frontier is not empty.
    const p1 = apply(confirmed, [{ id: 'P1', value: 'Try the product.' }]);
    expect(p1.changed).toBe(true);
    expect(evaluate(TREE, p1.brief, SIGNED).state).toBe('open');
  });
});
