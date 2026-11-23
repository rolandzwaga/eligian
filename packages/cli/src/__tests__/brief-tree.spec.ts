/**
 * Spec 059 Phase 1 (FR-002, FR-003, FR-004, FR-006, FR-008, FR-038; SC-004): the question tree of
 * the presentation assistant's brief interview, `mcp/brief/tree.ts`. Pure data, no server; the
 * first frontier and first round (FR-017) go through the engine.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import { EMPTY_BRIEF, evaluate, type Facts, pickRound, rankFrontier } from '../mcp/brief/engine.js';
import {
  ALWAYS,
  type AnswerValue,
  type AnswerView,
  type AssetEntry,
  BRANCHES,
  effectivePrerequisites,
  type Question,
  TREE,
  TREE_VERSION,
} from '../mcp/brief/tree.js';
import type { IndexEntry } from '../mcp/knowledge/types.js';

const byId = new Map(TREE.map(q => [q.id, q]));

function question(id: string): Question {
  const q = byId.get(id);
  if (q === undefined) throw new Error(`no question ${id}`);
  return q;
}

const isTemplateV = (id: string) => /^V[1-6]$/.test(id);

/**
 * An `AnswerView` that serves only `q.reads` (FR-008) and throws on any other id, so evaluating a
 * rule also proves it reads only its reads (SC-004). A V template id is served through `copies`
 * (an array of the copies' values), every other id through `get`.
 */
function restrictedView(q: Question, values: Readonly<Record<string, unknown>>): AnswerView {
  const guard = (id: string) => {
    if (!q.reads.includes(id)) throw new Error(`${q.id} read ${id}, outside its reads`);
  };
  return {
    get(id) {
      guard(id);
      if (isTemplateV(id)) throw new Error(`${q.id} read the V template ${id} with get`);
      return values[id] as AnswerValue | undefined;
    },
    copies(id) {
      guard(id);
      if (!isTemplateV(id)) throw new Error(`${q.id} read the non-V id ${id} with copies`);
      return (values[id] ?? []) as readonly AnswerValue[];
    },
  };
}

interface ExpectedShape {
  readonly kind: string;
  readonly options?: readonly string[];
  readonly columns?: readonly string[];
  readonly none?: true;
  readonly rows?: 'one-per-view';
  readonly alternatives?: readonly string[];
}

// FR-006: kind; options for a choice or set; column names for a record or table; none; rows.
const SHAPES: [string, ExpectedShape][] = [
  ['P1', { kind: 'text' }],
  ['P2', { kind: 'text', none: true }],
  ['P3', { kind: 'text' }],
  ['P4', { kind: 'text' }],
  ['P5', { kind: 'duration', alternatives: ['viewer-paced'] }],
  ['C1', { kind: 'choice', options: ['self-paced', 'presenter', 'loop', 'embedded'] }],
  ['C2', { kind: 'table', columns: ['device', 'primary'] }],
  ['C3', { kind: 'set', options: ['mouse', 'touch', 'keyboard', 'clicker'] }],
  ['C4', { kind: 'choice', options: ['on', 'off', 'both'] }],
  ['C5', { kind: 'choice', options: ['online', 'offline'] }],
  [
    'S1',
    {
      kind: 'choice',
      options: [
        'slide-deck',
        'hub-and-chapters',
        'media-annotation',
        'scrollytelling',
        'timed-piece',
      ],
    },
  ],
  ['S2', { kind: 'table', columns: ['name', 'purpose'] }],
  ['S3', { kind: 'view' }],
  ['S4', { kind: 'table', columns: ['view', 'target', 'trigger'] }],
  ['S5', { kind: 'table', columns: ['view', 'end'], rows: 'one-per-view' }],
  ['S6', { kind: 'table', columns: ['view', 'provider', 'source'], rows: 'one-per-view' }],
  ['S7', { kind: 'yes-no' }],
  ['S8', { kind: 'choice', options: ['stay', 'restart', 'loop'] }],
  ['V1', { kind: 'text' }],
  ['V2', { kind: 'text' }],
  ['V3', { kind: 'table', columns: ['element', 'kind', 'file'], none: true }],
  ['V4', { kind: 'text' }],
  ['V5', { kind: 'record', columns: ['duration', 'pacing', 'cues-from'] }],
  ['V6', { kind: 'text', none: true }],
  ['I1', { kind: 'text', none: true }],
  ['I2', { kind: 'table', columns: ['key', 'action'] }],
  ['I3', { kind: 'set', options: ['bar', 'counter', 'chapter-menu'], none: true }],
  ['I4', { kind: 'choice', options: ['restart', 'resume'] }],
  ['I5', { kind: 'yes-no' }],
  ['D1', { kind: 'text', none: true }],
  ['D2', { kind: 'text' }],
  ['D3', { kind: 'table', columns: ['font', 'source', 'file', 'licence'] }],
  ['D4', { kind: 'record', columns: ['choice', 'detail'] }],
  ['D5', { kind: 'table', columns: ['view', 'layout'], rows: 'one-per-view' }],
  ['D6', { kind: 'text' }],
  ['D7', { kind: 'choice', options: ['shorten', 'remove', 'keep'] }],
  ['D8', { kind: 'text', none: true }],
  ['L1', { kind: 'table', columns: ['code', 'default'] }],
  ['L2', { kind: 'table', columns: ['language', 'supplier', 'when'] }],
  ['L3', { kind: 'text' }],
  ['L4', { kind: 'text', none: true }],
  ['L5', { kind: 'record', columns: ['choice', 'source'] }],
  ['A1', { kind: 'table', columns: ['asset', 'who', 'when'] }],
  ['A2', { kind: 'record', columns: ['choice', 'kind'] }],
  ['A3', { kind: 'text', none: true }],
  ['A4', { kind: 'table', columns: ['file', 'poster', 'captions', 'loop', 'muted'] }],
  ['A5', { kind: 'table', columns: ['image', 'alt'] }],
  ['A6', { kind: 'choice', options: ['project', 'remote'] }],
  ['H1', { kind: 'table', columns: ['need', 'detail'], none: true }],
  ['H2', { kind: 'text' }],
  ['H3', { kind: 'text' }],
  ['X1', { kind: 'choice', options: ['wcag-2.2-aa', 'best-effort', 'none'] }],
  ['X2', { kind: 'yes-no' }],
  ['X3', { kind: 'record', columns: ['focus', 'announce'] }],
  ['X4', { kind: 'choice', options: ['captions', 'transcript', 'none'] }],
  ['X5', { kind: 'yes-no' }],
  ['R1', { kind: 'record', columns: ['choice', 'detail'] }],
  ['R2', { kind: 'text' }],
  ['R3', { kind: 'path' }],
  ['R4', { kind: 'yes-no' }],
  ['W1', { kind: 'text' }],
  ['W2', { kind: 'choice', options: ['first-view', 'end'] }],
  ['W3', { kind: 'text' }],
];

describe('the tree', () => {
  it('has 63 questions in P C S V I D L A H X R W of sizes 5 5 8 6 5 8 5 6 3 5 4 3', () => {
    expect(TREE.length).toBe(63);
    const sequence: string[] = [];
    const sizes: number[] = [];
    for (const q of TREE) {
      if (sequence[sequence.length - 1] !== q.branch) {
        sequence.push(q.branch);
        sizes.push(0);
      }
      sizes[sizes.length - 1] += 1;
    }
    expect(sequence.join(' ')).toBe('P C S V I D L A H X R W');
    expect(sizes).toEqual([5, 5, 8, 6, 5, 8, 5, 6, 3, 5, 4, 3]);
    expect(BRANCHES.map(b => b.id).join(' ')).toBe('P C S V I D L A H X R W');
    expect(BRANCHES.map(b => b.name)).toEqual([
      'Purpose',
      'Context of use',
      'Structure',
      'One copy per view',
      'Interaction',
      'Visual design',
      'Languages',
      'Assets',
      'Custom behaviour',
      'Accessibility',
      'Delivery',
      'Working agreement',
    ]);
    expect(TREE_VERSION).toBe(1);
  });

  it('ids are unique', () => {
    expect(new Set(TREE.map(q => q.id)).size).toBe(TREE.length);
  });

  it('every id is its branch letter and its number in the branch', () => {
    const seen = new Map<string, number>();
    for (const q of TREE) {
      const n = (seen.get(q.branch) ?? 0) + 1;
      seen.set(q.branch, n);
      expect(q.id).toBe(`${q.branch}${n}`);
    }
  });

  it('every needs and reads id is a template id', () => {
    for (const q of TREE) {
      for (const id of [...q.needs, ...q.reads]) {
        expect(byId.has(id), `${q.id} → ${id}`).toBe(true);
        expect(id, `${q.id} names itself`).not.toBe(q.id);
      }
    }
  });

  it('W1 needs every other template id', () => {
    expect([...question('W1').needs].sort()).toEqual(
      TREE.map(q => q.id)
        .filter(id => id !== 'W1')
        .sort()
    );
  });

  it('effectivePrerequisites is needs ∪ reads, without duplicates', () => {
    for (const q of TREE) {
      const expected = new Set([...q.needs, ...q.reads]);
      const actual = effectivePrerequisites(q);
      expect(new Set(actual)).toEqual(expected);
      expect(actual.length).toBe(expected.size);
    }
    expect([...effectivePrerequisites(question('A4'))].sort()).toEqual(['S6', 'V3']);
    expect([...effectivePrerequisites(question('L4'))].sort()).toEqual(['D3', 'L1', 'S6', 'V3']);
  });

  it('the effective graph is acyclic', () => {
    const state = new Map<string, 'visiting' | 'done'>();
    const backEdges: string[] = [];
    const visit = (id: string) => {
      state.set(id, 'visiting');
      for (const next of effectivePrerequisites(question(id))) {
        const s = state.get(next);
        if (s === 'visiting') backEdges.push(`${id} → ${next}`);
        else if (s === undefined) visit(next);
      }
      state.set(id, 'done');
    };
    for (const q of TREE) if (!state.has(q.id)) visit(q.id);
    expect(backEdges).toEqual([]);
  });

  it('every since ≤ TREE_VERSION', () => {
    for (const q of TREE) {
      expect(q.since).toBeLessThanOrEqual(TREE_VERSION);
      expect(q.since).toBe(1);
    }
  });

  it('S2 says timeline name and case-sensitive', () => {
    const s2 = question('S2');
    expect(s2.ask).toContain('timeline name');
    expect(s2.ask).toContain('case-sensitive');
    expect(
      s2.ask.endsWith(
        'Each name is the timeline name the program will use, matched exactly (case-sensitive).'
      )
    ).toBe(true);
    expect(s2.title).toBe(
      'Which views are there: a name and a one-line purpose for each, in order?'
    );
    expect(s2.shape.columns?.map(c => c.name)).toEqual(['name', 'purpose']);
  });

  // The `### <id>: <title>` headings of the golden fixture (spec.md SC-006).
  it.each([
    ['P1', 'What should a viewer know, feel or do afterwards?'],
    ['P5', 'How long should it take to watch?'],
    [
      'C1',
      'How is it used: self-paced on a web page, led by a presenter, an unattended loop, or embedded in an app?',
    ],
    ['C4', 'Is sound heard, or must it work muted?'],
    [
      'S1',
      'Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece?',
    ],
    ['S2', 'Which views are there: a name and a one-line purpose for each, in order?'],
    ['S6', "What drives each view's time: `raf`, `video`, `audio`, `scroll`?"],
    ['V3', 'What is on screen besides text: images, video, lists, figures, buttons?'],
  ])('titles equal the roadmap text: %s', (id, title) => {
    expect(question(id).title).toBe(title);
  });

  it('no title carries a (doc …) parenthetical, and every ask starts with its title', () => {
    for (const q of TREE) {
      expect(q.title).not.toMatch(/\(docs? /);
      expect(q.ask.startsWith(q.title), q.id).toBe(true);
    }
  });

  it('reads follow FR-003 and FR-008', () => {
    const expected: Record<string, readonly string[]> = {
      V6: ['C3'],
      D8: ['V3'],
      A5: ['V3'],
      A4: ['S6', 'V3'],
      A1: ['V3', 'S6', 'D3'],
      A2: ['V3', 'S6', 'D3'],
      A3: ['V3', 'S6', 'D3'],
      A6: ['V3', 'S6', 'D3'],
      L4: ['L1', 'V3', 'S6', 'D3'],
      L5: ['L4'],
      S3: ['S2'],
      S4: ['S2'],
      I4: ['S2'],
      X3: ['S2'],
      S7: ['S6', 'C4'],
      I1: ['V5'],
      I2: ['C3'],
      I5: ['C3'],
      L2: ['L1'],
      L3: ['L1'],
      H2: ['H1'],
      H3: ['H1'],
      X4: ['S6'],
      X5: ['S5'],
    };
    for (const q of TREE) {
      expect([...q.reads].sort(), q.id).toEqual([...(expected[q.id] ?? [])].sort());
    }
  });

  it.each(SHAPES)('the shapes follow FR-006: %s', (id, expected) => {
    const shape = question(id).shape;
    expect({
      kind: shape.kind,
      options: shape.options,
      columns: shape.columns?.map(c => c.name),
      none: shape.none,
      rows: shape.rows,
      alternatives: shape.alternatives,
    }).toEqual(expected);
  });

  it('the shape table covers all 63 questions', () => {
    expect(SHAPES.map(([id]) => id)).toEqual(TREE.map(q => q.id));
  });

  it('column kinds: options on choice cells, L2 language, key cells text (plan §1)', () => {
    for (const q of TREE) {
      for (const c of q.shape.columns ?? []) {
        expect(c.kind === 'choice', `${q.id}.${c.name}`).toBe(c.options !== undefined);
      }
    }
    const column = (id: string, name: string) =>
      question(id).shape.columns?.find(c => c.name === name);
    expect(column('L2', 'language')?.kind).toBe('language');
    expect(column('A1', 'asset')?.kind).toBe('text');
    expect(column('A4', 'file')?.kind).toBe('text');
    expect(column('A5', 'image')?.kind).toBe('text');
    expect(column('S4', 'view')?.kind).toBe('view');
    expect(column('S4', 'target')?.kind).toBe('view');
    expect(column('C2', 'primary')?.kind).toBe('yes-no');
    expect(column('V5', 'duration')).toMatchObject({ kind: 'duration', none: true });
    expect(column('S6', 'source')).toMatchObject({ kind: 'path', dash: true });
    expect(column('V3', 'file')).toMatchObject({ kind: 'path', dash: true });
    expect(column('D3', 'file')).toMatchObject({ kind: 'path', dash: true });
  });
});

const oneView = [{ name: 'intro', purpose: 'The promise' }];
const twoViews = [...oneView, { name: 'demo', purpose: 'The product at work' }];
const s6Video = [
  { view: 'intro', provider: 'raf', source: '-' },
  { view: 'demo', provider: 'video', source: 'media/demo.mp4' },
];
const s6Raf = [{ view: 'intro', provider: 'raf', source: '-' }];
const oneCode = [{ code: 'en-US', default: 'yes' }];
const twoCodes = [...oneCode, { code: 'nl-NL', default: 'no' }];
const imageRow = { element: 'Logo', kind: 'image', file: 'img/logo.png' };
const listRow = { element: 'Feature list', kind: 'list', file: '-' };
const asset = (kind: AssetEntry['kind'], state: AssetEntry['state']): AssetEntry => ({
  key: `x.${kind}`,
  kind,
  state,
});
const imageExists = asset('image', 'exists');
const imageMissing = asset('image', 'missing');
const videoExists = asset('video', 'exists');

type RuleCase = [string, string, Readonly<Record<string, unknown>>, readonly AssetEntry[], boolean];

const RULE_CASES: RuleCase[] = [
  ...(['S3', 'S4', 'I4', 'X3'] as const).flatMap((id): RuleCase[] => [
    [id, 'two S2 rows', { S2: twoViews }, [], true],
    [id, 'one S2 row', { S2: oneView }, [], false],
  ]),
  ['S7', 'a video view and C4 on', { S6: s6Video, C4: 'on' }, [], true],
  ['S7', 'a video view and C4 both', { S6: s6Video, C4: 'both' }, [], true],
  ['S7', 'a video view and C4 off', { S6: s6Video, C4: 'off' }, [], false],
  ['S7', 'raf views only and C4 on', { S6: s6Raf, C4: 'on' }, [], false],
  ['V6', "C3 ['mouse']", { C3: ['mouse'] }, [], true],
  ['V6', "C3 ['touch']", { C3: ['touch'] }, [], true],
  ['V6', "C3 ['keyboard']", { C3: ['keyboard'] }, [], false],
  [
    'I1',
    'a V5 copy with duration 30',
    {
      V5: [
        { duration: 'none', pacing: 'none', 'cues-from': '-' },
        { duration: '30', pacing: 'fixed', 'cues-from': '-' },
      ],
    },
    [],
    true,
  ],
  [
    'I1',
    'every V5 copy with duration none',
    { V5: [{ duration: 'none', pacing: 'none', 'cues-from': '-' }] },
    [],
    false,
  ],
  ['I2', "C3 ['mouse', 'keyboard']", { C3: ['mouse', 'keyboard'] }, [], true],
  ['I2', "C3 ['mouse']", { C3: ['mouse'] }, [], false],
  ['I5', "C3 ['touch']", { C3: ['touch'] }, [], true],
  ['I5', "C3 ['mouse']", { C3: ['mouse'] }, [], false],
  ['D8', 'a V3 copy with an image row', { V3: ['none', [listRow, imageRow]] }, [], true],
  ['D8', 'V3 copies without an image row', { V3: ['none', [listRow]] }, [], false],
  ...(['L2', 'L3'] as const).flatMap((id): RuleCase[] => [
    [id, 'two L1 rows', { L1: twoCodes }, [], true],
    [id, 'one L1 row', { L1: oneCode }, [], false],
  ]),
  ['L4', 'two codes and one asset', { L1: twoCodes }, [imageExists], true],
  ['L4', 'two codes and no asset', { L1: twoCodes }, [], false],
  ['L4', 'one code and one asset', { L1: oneCode }, [imageExists], false],
  ['L5', 'L4 lists assets', { L4: 'the narration audio' }, [], true],
  ['L5', 'L4 none', { L4: 'none' }, [], false],
  ['L5', 'L4 not applicable', {}, [], false],
  ...(['A1', 'A2'] as const).flatMap((id): RuleCase[] => [
    [id, 'a missing entry', {}, [imageExists, imageMissing], true],
    [id, 'only exists entries', {}, [imageExists, videoExists], false],
  ]),
  ...(['A3', 'A6'] as const).flatMap((id): RuleCase[] => [
    [id, 'a non-empty asset list', {}, [imageExists], true],
    [id, 'an empty asset list', {}, [], false],
  ]),
  ['A4', 'a video entry', {}, [imageExists, videoExists], true],
  ['A4', 'an audio entry', {}, [asset('audio', 'missing')], true],
  ['A4', 'only image entries', {}, [imageExists], false],
  ['A5', 'a V3 copy with an image row', { V3: [[imageRow]] }, [imageExists], true],
  ['A5', 'no V3 image row', { V3: [[listRow], 'none'] }, [], false],
  ['H2', 'H1 has external-data', { H1: [{ need: 'external-data', detail: 'prices' }] }, [], true],
  ['H2', 'H1 none', { H1: 'none' }, [], false],
  ['H3', 'H1 has analytics', { H1: [{ need: 'analytics', detail: 'views' }] }, [], true],
  ['H3', 'H1 has charts only', { H1: [{ need: 'charts', detail: 'a bar chart' }] }, [], false],
  ['X4', 'a video view', { S6: s6Video }, [], true],
  ['X4', 'raf views only', { S6: s6Raf }, [], false],
  ['X5', 'an S5 row advance', { S5: [{ view: 'intro', end: 'advance' }] }, [], true],
  ['X5', 'an S5 row loop', { S5: [{ view: 'intro', end: 'loop' }] }, [], true],
  ['X5', 'S5 rows stay', { S5: [{ view: 'intro', end: 'stay' }] }, [], false],
];

describe('applies-when (FR-008)', () => {
  it.each(RULE_CASES)('%s is %s → %s', (id, _case, values, assets, expected) => {
    const q = question(id);
    expect(q.appliesWhen(restrictedView(q, values), assets)).toBe(expected);
  });

  it('every rule of FR-008 has a true and a false case, and every other id is ALWAYS', () => {
    const ruled = new Set(RULE_CASES.map(c => c[0]));
    for (const id of ruled) {
      const outcomes = new Set(RULE_CASES.filter(c => c[0] === id).map(c => c[4]));
      expect(outcomes, id).toEqual(new Set([true, false]));
      expect(question(id).appliesWhen, id).not.toBe(ALWAYS);
    }
    for (const q of TREE) {
      if (!ruled.has(q.id)) expect(q.appliesWhen, q.id).toBe(ALWAYS);
    }
    // FR-008: S3 S4 I4 X3, S7, V6, I1, I2, I5, D8, L2–L5, A1–A6, H2, H3, X4, X5.
    expect(ruled.size).toBe(24);
  });

  it.each(TREE.filter(q => q.appliesWhen === ALWAYS).map(q => q.id))(
    '%s (ALWAYS) is true for an empty brief',
    id => {
      const q = question(id);
      expect(q.appliesWhen(restrictedView(q, {}), [])).toBe(true);
      expect(q.when).toBe('always');
    }
  );

  it('when is the roadmap applies-when text for the ruled ids', () => {
    expect(question('S3').when).toBe('more than one view');
    expect(question('S7').when).toBe('a view uses `video` or `audio` and C4 is not off');
    expect(question('V6').when).toBe('C3 has mouse or touch');
    expect(question('L4').when).toBe('more than one language and any asset');
    expect(question('X5').when).toBe('an S5 answer is advance or loop');
    for (const q of TREE) {
      if (q.appliesWhen !== ALWAYS) expect(q.when, q.id).not.toBe('always');
    }
  });
});

describe('docs and facts (FR-004)', () => {
  const DOCS: [string, string][] = [
    ['S1', 'decisions'],
    ['S6', 'provider-choice'],
    ['H1', 'assets-and-host-modules'],
    ['H1', 'not-eligian'],
    ...['S2', 'S5', 'S8'].map((id): [string, string] => [id, 'presentation-patterns']),
    ...['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].map((id): [string, string] => [
      id,
      'css-conventions',
    ]),
    ...['S4', 'V6', 'I1', 'I2', 'I3', 'I4', 'I5'].map((id): [string, string] => [
      id,
      'map-events-and-interactions',
    ]),
    ...['L1', 'L2', 'L3', 'L4', 'L5'].map((id): [string, string] => [
      id,
      'map-locales-and-languages',
    ]),
    ...['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((id): [string, string] => [
      id,
      'map-imports-and-assets',
    ]),
  ];

  it.each(DOCS)('%s docs contain %s', (id, doc) => {
    expect(question(id).docs).toContain(doc);
  });

  it.each(['D1', 'D2', 'D3', 'L1', 'V3', 'A1', 'A6', 'R1', 'R3', 'H1'])(
    '%s has non-empty facts',
    id => {
      const facts = question(id).facts;
      expect(facts.length).toBeGreaterThan(0);
      for (const f of facts) expect(f.trim()).not.toBe('');
    }
  );

  it('R1 facts name the eligian-installed and package-manager lines (FR-042)', () => {
    const text = question('R1').facts.join('\n');
    expect(text).toContain('eligian-installed');
    expect(text).toContain('package-manager');
  });
});

describe('docs', () => {
  let docsRoot: string;
  let indexIds: ReadonlySet<string>;

  beforeAll(async () => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-brief-tree-docs-'));
    await generateKnowledge({ outDir: docsRoot });
    const index = JSON.parse(
      fs.readFileSync(path.join(docsRoot, 'index.json'), 'utf8')
    ) as IndexEntry[];
    indexIds = new Set(index.map(entry => entry.id));
  }, 300_000);

  afterAll(() => {
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  it('every docs id is in the generated index.json', () => {
    const ids = [...new Set(TREE.flatMap(q => q.docs))];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(indexIds.has(id), id).toBe(true);
  });
});

describe('the first frontier', () => {
  const facts: Facts = { briefDir: '.', exists: () => false, inside: () => true };
  const ev = evaluate(TREE, EMPTY_BRIEF, facts);

  it('the first frontier is P1–P5, C1–C5, R2, R3, R4, W3', () => {
    const ids = ev.frontier.map(i => i.id);
    expect(new Set(ids)).toEqual(
      new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'C1', 'C2', 'C3', 'C4', 'C5', 'R2', 'R3', 'R4', 'W3'])
    );
    expect(ids).toHaveLength(14);
  });

  it('the first round is C1, P5, C4, P4, C3, C5, P3', () => {
    expect(pickRound(TREE, ev, 7).map(i => i.id)).toEqual([
      'C1',
      'P5',
      'C4',
      'P4',
      'C3',
      'C5',
      'P3',
    ]);
    expect(rankFrontier(TREE, ev).slice(0, 7)).toEqual([
      { id: 'C1', dependents: 39 },
      { id: 'P5', dependents: 37 },
      { id: 'C4', dependents: 24 },
      { id: 'P4', dependents: 13 },
      { id: 'C3', dependents: 11 },
      { id: 'C5', dependents: 9 },
      { id: 'P3', dependents: 6 },
    ]);
  });
});

describe('purity (SC-012, FR-035)', () => {
  const BRIEF_DIR = path.join(import.meta.dirname, '..', 'mcp', 'brief');
  // The modules of spec 059 phase 2 that read the disk (SC-018, Phase 1 edit list entry 6); every
  // other file in brief/, a new one included, stays pure
  const IO_MODULES = ['facts.ts', 'known-programs.ts', 'signature.ts', 'gate.ts', 'hook-gate.ts'];
  const sources = fs
    .readdirSync(BRIEF_DIR)
    .filter(name => name.endsWith('.ts'))
    .map(name => ({ name, text: fs.readFileSync(path.join(BRIEF_DIR, name), 'utf8') }));

  it('brief/* import neither effect/ai nor node:fs', () => {
    expect(sources.map(s => s.name)).toContain('engine.ts');
    for (const { name, text } of sources.filter(s => !IO_MODULES.includes(s.name))) {
      expect(text, name).not.toMatch(/from ['"](effect\/ai|node:fs|fs)(\/promises)?['"]/);
    }
  });

  it('no console in brief/* and tools/brief.ts', () => {
    expect(sources.length).toBeGreaterThan(0);
    const tool = path.join(import.meta.dirname, '..', 'mcp', 'tools', 'brief.ts');
    const checked = [...sources, { name: 'tools/brief.ts', text: fs.readFileSync(tool, 'utf8') }];
    for (const { name, text } of checked) {
      expect(text, name).not.toMatch(/\bconsole\./);
    }
  });
});
