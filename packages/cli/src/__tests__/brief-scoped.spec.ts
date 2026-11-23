/**
 * Spec 059 Phase 2 (FR-036, FR-045, P11, P12; plan §4, §7): the engine under facts read from the
 * code (`by: code`) and under a fixed view list (an addition's interview). Pure: no fs, no server.
 */
import { describe, expect, it } from 'vitest';
import {
  type Answer,
  applyAnswers,
  type BriefState,
  canonicalAnswers,
  confirm,
  EMPTY_BRIEF,
  evaluate,
  type Facts,
  type Instance,
} from '../mcp/brief/engine.js';
import {
  type AdditionScope,
  additionHeading,
  type ScopeContext,
  scopedTree,
} from '../mcp/brief/scoped.js';
import { makeSigner } from '../mcp/brief/signature.js';
import { type AnswerValue, type Question, TREE } from '../mcp/brief/tree.js';
import { validateValue } from '../mcp/brief/values.js';

const signer = makeSigner(Buffer.alloc(32, 7));

const facts = (extra: Partial<Facts> = {}): Facts => ({
  briefDir: '.',
  exists: () => false,
  inside: () => true,
  ...extra,
});

const briefOf = (...answers: readonly Answer[]): BriefState => ({ ...EMPTY_BRIEF, answers });

const instance = (brief: BriefState, id: string, f: Facts = facts()): Instance | undefined =>
  evaluate(TREE, brief, f).instances.find(i => i.id === id);

const ONE_VIEW = [{ name: 'main', purpose: 'The only view' }];
const TWO_VIEWS = [
  { name: 'Hub', purpose: 'The start' },
  { name: 'Logic', purpose: 'A chapter' },
];

const FACT_MESSAGE = 'settled by the code; change the code and call with scope adopt again';

describe('engine: by code (P12)', () => {
  it('an applicable by: code answer counts as answered although its prerequisites are open', () => {
    const brief = briefOf({ id: 'S2', value: ONE_VIEW, by: 'code', round: 1 });
    const evaluation = evaluate(TREE, brief, facts());
    const s2 = evaluation.instances.find(i => i.id === 'S2');
    expect(s2?.status).toBe('answered');
    expect(s2?.value).toEqual(ONE_VIEW);
    // Its prerequisite S1 (and S1's own) are still open or waiting.
    expect(evaluation.instances.find(i => i.id === 'S1')?.status).toBe('waiting');
    expect(evaluation.frontier.map(i => i.id)).not.toContain('S2');
    // The same answer by the user waits for S1.
    expect(
      instance(briefOf({ id: 'S2', value: ONE_VIEW, by: 'user', round: 1 }), 'S2')?.status
    ).toBe('waiting');
  });

  it('applyAnswers on a fact-settled id is rejected with reason fact ("settled by the code; change the code and call with scope adopt again")', () => {
    const brief = briefOf({ id: 'S2', value: ONE_VIEW, by: 'code', round: 1 });
    const result = applyAnswers(
      TREE,
      brief,
      facts(),
      [
        { id: 'S2', value: TWO_VIEWS },
        { id: 'P1', value: 'Know it.' },
      ],
      2
    );
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].id).toBe('S2');
    expect(result.rejected[0].reason).toBe('fact');
    expect(result.rejected[0].message).toContain(FACT_MESSAGE);
    expect(result.brief.answers.find(a => a.id === 'S2')).toEqual({
      id: 'S2',
      value: ONE_VIEW,
      by: 'code',
      round: 1,
    });
    expect(result.brief.answers.find(a => a.id === 'P1')?.value).toBe('Know it.');
  });

  it('a by: code answer is never stale by round', () => {
    const settled: readonly Answer[] = [
      { id: 'C1', value: 'self-paced', by: 'user', round: 1 },
      { id: 'P5', value: 90, by: 'user', round: 1 },
      { id: 'S1', value: 'slide-deck', by: 'user', round: 3 },
    ];
    // S1 changed at round 3, after S2's round 1: a user's S2 is stale, a fact is not.
    const asUser = briefOf(...settled, { id: 'S2', value: ONE_VIEW, by: 'user', round: 1 });
    expect(instance(asUser, 'S1')?.status).toBe('answered');
    expect(instance(asUser, 'S2')?.status).toBe('stale');
    const asCode = briefOf(...settled, { id: 'S2', value: ONE_VIEW, by: 'code', round: 1 });
    expect(instance(asCode, 'S2')?.status).toBe('answered');
  });

  it('a non-applicable by: code answer stays dormant', () => {
    // S3 applies with more than one view; S2 (a fact) names one.
    const brief = briefOf(
      { id: 'S2', value: ONE_VIEW, by: 'code', round: 1 },
      { id: 'S3', value: 'main', by: 'code', round: 1 }
    );
    const s3 = instance(brief, 'S3');
    expect(s3?.status).toBe('not-applicable');
    expect(s3?.dormant).toBe(true);
    expect(evaluate(TREE, brief, facts()).counts.fromCode).toBe(1);
  });

  it('by: code answers are in canonicalAnswers (a changed fact invalidates a confirmation)', () => {
    const s2: Answer = { id: 'S2', value: TWO_VIEWS, by: 'code', round: 1 };
    const brief = briefOf(s2);
    const signed = facts({ signer });
    const evaluation = evaluate(TREE, brief, signed);
    expect(evaluation.canonical).toEqual(canonicalAnswers([s2]));
    expect(evaluation.canonical).toContainEqual(['S2', TWO_VIEWS, 'code']);
    const confirmed = confirm(
      brief,
      'agent-reported',
      'yes',
      new Date(Date.UTC(2026, 10, 20)),
      evaluation,
      signer,
      'brief'
    );
    expect(evaluate(TREE, confirmed, signed).confirmationStatus).toBe('valid');
    const reread: BriefState = {
      ...confirmed,
      answers: [{ ...s2, value: [...TWO_VIEWS, { name: 'Outro', purpose: 'The end' }] }],
    };
    expect(evaluate(TREE, reread, signed).confirmationStatus).toBe('invalid');
  });

  it('counts.fromCode counts the fact-settled instances', () => {
    const brief = briefOf(
      { id: 'P1', value: 'Know it.', by: 'user', round: 1 },
      { id: 'S2', value: TWO_VIEWS, by: 'code', round: 1 },
      { id: 'S3', value: 'Hub', by: 'code', round: 1 }
    );
    const { counts } = evaluate(TREE, brief, facts());
    expect(counts.fromCode).toBe(2);
    // Fact-settled instances count as answered too (FR-045).
    expect(counts.answered).toBe(3);
    // A brief with no fact has no fromCode count (the Phase 1 counts are unchanged).
    expect(evaluate(TREE, EMPTY_BRIEF, facts()).counts.fromCode).toBeUndefined();
  });
});

describe('engine: fixed views (P11)', () => {
  it("with facts.views = ['Outro'], branch V expands over exactly Outro (ids V1:Outro … V6:Outro), ignoring S2", () => {
    const brief = briefOf({ id: 'S2', value: TWO_VIEWS, by: 'user', round: 1 });
    const evaluation = evaluate(TREE, brief, facts({ views: ['Outro'] }));
    expect(evaluation.views).toEqual(['Outro']);
    expect(evaluation.instances.filter(i => i.question.branch === 'V').map(i => i.id)).toEqual([
      'V1:Outro',
      'V2:Outro',
      'V3:Outro',
      'V4:Outro',
      'V5:Outro',
      'V6:Outro',
    ]);
    // Without the fixed list, the same brief expands over S2's views.
    const plain = evaluate(TREE, brief, facts());
    expect(plain.views).toEqual(['Hub', 'Logic']);
    expect(plain.instances.some(i => i.id === 'V1:Outro')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// scopedTree (FR-036, P11, R-8; plan §7)

/** A map-backed scope context: the main brief's settled answers and the code facts. */
const context = (
  entries: Readonly<Record<string, AnswerValue>> = {},
  timelines?: readonly string[]
): ScopeContext => {
  const values = new Map(Object.entries(entries));
  return { get: id => values.get(id), ...(timelines === undefined ? {} : { timelines }) };
};

const OUTRO: AdditionScope = { addition: 'view', name: 'Outro' };
const GERMAN: AdditionScope = { addition: 'language', name: 'de-DE' };
const HOST: AdditionScope = { addition: 'host-module', name: '' };

const viewFacts = facts({ views: ['Outro'] });

const ids = (tree: readonly Question[]) => tree.map(q => q.id);

const questionOf = (tree: readonly Question[], id: string): Question => {
  const question = tree.find(q => q.id === id);
  if (question === undefined) throw new Error(`${id} is not in the scoped tree`);
  return question;
};

const statusIn = (tree: readonly Question[], brief: BriefState, id: string, f: Facts) =>
  evaluate(tree, brief, f).instances.find(i => i.id === id)?.status;

const columnsOf = (q: Question) => (q.shape.columns ?? []).map(c => c.name);

/** Answers applied through the engine, every one accepted. */
const answered = (
  tree: readonly Question[],
  f: Facts,
  input: readonly { readonly id: string; readonly value: unknown }[]
): BriefState => {
  const result = applyAnswers(tree, EMPTY_BRIEF, f, input, 1);
  expect(result.rejected).toEqual([]);
  return result.brief;
};

describe('view', () => {
  it('V1–V6 are instantiated for <name> only (ids V1:Outro …)', () => {
    const tree = scopedTree(OUTRO, context({ S2: TWO_VIEWS }));
    expect(ids(tree)).toEqual([
      'S4',
      'S5',
      'S6',
      'V1',
      'V2',
      'V3',
      'V4',
      'V5',
      'V6',
      'I4',
      'D5',
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
    ]);
    const vs = tree.filter(q => q.branch === 'V');
    expect(vs.every(q => q.scoped === true && q.needs.join() === 'S6')).toBe(true);
    const evaluation = evaluate(tree, EMPTY_BRIEF, viewFacts);
    expect(evaluation.instances.filter(i => i.question.branch === 'V').map(i => i.id)).toEqual([
      'V1:Outro',
      'V2:Outro',
      'V3:Outro',
      'V4:Outro',
      'V5:Outro',
      'V6:Outro',
    ]);
    // The main brief's views (Hub, Logic) are not asked again.
    expect(evaluation.instances.some(i => i.id.endsWith(':Hub'))).toBe(false);
    // The copies wait for S6 alone, then open.
    expect(statusIn(tree, EMPTY_BRIEF, 'V1:Outro', viewFacts)).toBe('waiting');
    const brief = answered(tree, viewFacts, [
      { id: 'S6', value: { provider: 'raf', source: '-' } },
    ]);
    expect(statusIn(tree, brief, 'V1:Outro', viewFacts)).toBe('open');
  });

  it('S4 is a table with columns view/target/trigger; a row naming neither Outro as view nor as target is rejected; none is accepted', () => {
    const tree = scopedTree(OUTRO, context({ S2: TWO_VIEWS }));
    const s4 = questionOf(tree, 'S4');
    expect(s4.shape.kind).toBe('table');
    expect(columnsOf(s4)).toEqual(['view', 'target', 'trigger']);
    const into = { view: 'Hub', target: 'Outro', trigger: 'click #next' };
    const outOf = { view: 'Outro', target: 'Hub', trigger: 'key Escape' };
    expect(validateValue(s4, [into, outOf])).toEqual({ ok: true, value: [into, outOf] });
    const elsewhere = validateValue(s4, [into, { view: 'Hub', target: 'Logic', trigger: 'click' }]);
    expect(elsewhere.ok).toBe(false);
    expect(!elsewhere.ok && elsewhere.message).toContain('row 2');
    expect(!elsewhere.ok && elsewhere.message).toContain('"Outro"');
    expect(validateValue(s4, 'none')).toEqual({ ok: true, value: 'none' });
    expect(validateValue(s4, []).ok).toBe(false);
    // Through the engine: rows naming the main brief's views are accepted (not S2's check).
    const brief = answered(tree, viewFacts, [{ id: 'S4', value: [into, outOf] }]);
    expect(statusIn(tree, brief, 'S4', viewFacts)).toBe('answered');
    const rejected = applyAnswers(
      tree,
      EMPTY_BRIEF,
      viewFacts,
      [{ id: 'S4', value: [{ view: 'Hub', target: 'Logic', trigger: 'click' }] }],
      1
    ).rejected;
    expect(rejected.map(r => [r.id, r.reason])).toEqual([['S4', 'invalid-value']]);
  });

  it("S5, S6 and D5 are records with no view column; S6 keeps checkS6's per-row rule", () => {
    const tree = scopedTree(OUTRO, context({ S2: TWO_VIEWS }));
    const s5 = questionOf(tree, 'S5');
    const s6 = questionOf(tree, 'S6');
    const d5 = questionOf(tree, 'D5');
    for (const q of [s5, s6, d5]) {
      expect(q.shape.kind).toBe('record');
      expect(columnsOf(q)).not.toContain('view');
    }
    expect(columnsOf(s5)).toEqual(['end']);
    expect(columnsOf(s6)).toEqual(['provider', 'source']);
    expect(columnsOf(d5)).toEqual(['layout']);
    expect(validateValue(s6, { provider: 'video', source: '-' })).toEqual({
      ok: false,
      message: 'the view Outro uses video: its source names the file or URL',
    });
    expect(validateValue(s6, { provider: 'raf', source: 'media/outro.mp4' })).toEqual({
      ok: false,
      message: 'the view Outro uses raf: its source is -',
    });
    expect(validateValue(s6, { provider: 'video', source: 'media/outro.mp4' }).ok).toBe(true);
    expect(validateValue(s6, [{ view: 'Outro', provider: 'raf', source: '-' }]).ok).toBe(false);
    // Through the engine: the records are answered (the S2 one-row-per-view check reads them as
    // the addition's one row), and S6's source still lies inside the project.
    const brief = answered(tree, viewFacts, [
      { id: 'S5', value: { end: 'stay' } },
      { id: 'S6', value: { provider: 'video', source: 'media/outro.mp4' } },
      { id: 'D5', value: { layout: 'title' } },
    ]);
    for (const id of ['S5', 'S6', 'D5'])
      expect(statusIn(tree, brief, id, viewFacts)).toBe('answered');
    const outside = applyAnswers(
      tree,
      EMPTY_BRIEF,
      facts({ views: ['Outro'], inside: () => false }),
      [{ id: 'S6', value: { provider: 'video', source: '../outro.mp4' } }],
      1
    ).rejected;
    expect(outside.map(r => [r.id, r.reason])).toEqual([['S6', 'invalid-reference']]);
  });

  it('I4 is absent when the presentation has one view (context S2 has none and the record one timeline) and present when the addition makes it two', () => {
    // Nothing besides the addition, or the record's one timeline is the addition itself.
    expect(ids(scopedTree(OUTRO, context()))).not.toContain('I4');
    expect(ids(scopedTree(OUTRO, context({}, ['Outro'])))).not.toContain('I4');
    // The record's one other timeline, or the main brief's one view, plus the addition: two.
    expect(ids(scopedTree(OUTRO, context({}, ['Hub'])))).toContain('I4');
    expect(ids(scopedTree(OUTRO, context({ S2: ONE_VIEW })))).toContain('I4');
    const tree = scopedTree(OUTRO, context({ S2: ONE_VIEW }));
    const i4 = questionOf(tree, 'I4');
    expect(i4.needs).toEqual(['S4']);
    const brief = answered(tree, viewFacts, [{ id: 'S4', value: 'none' }]);
    expect(statusIn(tree, brief, 'I4', viewFacts)).toBe('open');
  });

  it("A1–A6 apply only to the assets the addition names (its V3 and S6), with Phase 1's applies-when", () => {
    // The main brief's font and Hub's video are not the addition's assets.
    const tree = scopedTree(
      OUTRO,
      context({
        S2: TWO_VIEWS,
        S6: [
          { view: 'Hub', provider: 'video', source: 'media/hub.mp4' },
          { view: 'Logic', provider: 'raf', source: '-' },
        ],
        D3: [{ font: 'Brand', source: 'project', file: 'fonts/brand.woff2', licence: 'OFL' }],
      })
    );
    const named = answered(tree, viewFacts, [
      { id: 'S6', value: { provider: 'video', source: 'media/outro.mp4' } },
      { id: 'V3:Outro', value: [{ element: 'Logo', kind: 'image', file: 'img/logo.png' }] },
    ]);
    const evaluation = evaluate(tree, named, viewFacts);
    expect(evaluation.assets).toEqual([
      { key: 'img/logo.png', kind: 'image', state: 'missing' },
      { key: 'media/outro.mp4', kind: 'video', state: 'missing' },
    ]);
    const status = (brief: BriefState, id: string, f: Facts = viewFacts) =>
      statusIn(tree, brief, id, f);
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map(id => status(named, id))).toEqual([
      'open',
      'waiting',
      'open',
      'open',
      'open',
      'open',
    ]);
    // The logo exists, Outro runs on raf: nothing missing, no media, one image.
    const present = facts({ views: ['Outro'], exists: file => file === 'img/logo.png' });
    const imageOnly = answered(tree, present, [
      { id: 'S6', value: { provider: 'raf', source: '-' } },
      { id: 'V3:Outro', value: [{ element: 'Logo', kind: 'image', file: 'img/logo.png' }] },
    ]);
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map(id => status(imageOnly, id, present))).toEqual([
      'not-applicable',
      'not-applicable',
      'open',
      'not-applicable',
      'open',
      'open',
    ]);
    // No asset at all: none of branch A applies.
    const bare = answered(tree, viewFacts, [
      { id: 'S6', value: { provider: 'raf', source: '-' } },
      { id: 'V3:Outro', value: 'none' },
    ]);
    expect(evaluate(tree, bare, viewFacts).assets).toEqual([]);
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map(id => status(bare, id))).toEqual(
      Array(6).fill('not-applicable')
    );
  });

  it("V6 applies when context.get('C3') is undefined (R-8) and follows C3 when it is set", () => {
    const s6 = [{ id: 'S6', value: { provider: 'raf', source: '-' } }];
    const unbriefed = scopedTree(OUTRO, context());
    const keyboard = scopedTree(OUTRO, context({ C3: ['keyboard'] }));
    const touch = scopedTree(OUTRO, context({ C3: ['keyboard', 'touch'] }));
    expect(statusIn(unbriefed, answered(unbriefed, viewFacts, s6), 'V6:Outro', viewFacts)).toBe(
      'open'
    );
    expect(statusIn(keyboard, answered(keyboard, viewFacts, s6), 'V6:Outro', viewFacts)).toBe(
      'not-applicable'
    );
    expect(statusIn(touch, answered(touch, viewFacts, s6), 'V6:Outro', viewFacts)).toBe('open');
    expect(questionOf(unbriefed, 'V6').reads).toEqual([]);
  });
});

describe('language', () => {
  it('L2 is a record with columns supplier and when; L3, L4, L5 present; no other question', () => {
    const tree = scopedTree(GERMAN, context());
    expect(ids(tree)).toEqual(['L2', 'L3', 'L4', 'L5']);
    const l2 = questionOf(tree, 'L2');
    expect(l2.shape.kind).toBe('record');
    expect(columnsOf(l2)).toEqual(['supplier', 'when']);
    expect(tree.every(q => q.scoped === true)).toBe(true);
    // R-8: no L1 and no asset to read, so L2 to L4 are asked; L5 waits for L4.
    const plain = facts();
    expect(['L2', 'L3', 'L4', 'L5'].map(id => statusIn(tree, EMPTY_BRIEF, id, plain))).toEqual([
      'open',
      'open',
      'open',
      'waiting',
    ]);
    const brief = answered(tree, plain, [
      { id: 'L2', value: { supplier: 'The agency', when: 'week 3' } },
      { id: 'L4', value: 'the narration' },
    ]);
    expect(statusIn(tree, brief, 'L2', plain)).toBe('answered');
    expect(statusIn(tree, brief, 'L5', plain)).toBe('open');
  });

  it('a one-language presentation gains a second: L2 and L3 apply; L4 follows the assets', () => {
    const english = [{ code: 'en-US', default: 'yes' }];
    const noAssets = scopedTree(
      GERMAN,
      context({
        L1: english,
        S2: ONE_VIEW,
        S6: [{ view: 'main', provider: 'raf', source: '-' }],
        D3: [{ font: 'Inter', source: 'system', file: '-', licence: 'OFL' }],
        'V3:main': 'none',
      })
    );
    const plain = facts();
    expect(['L2', 'L3', 'L4'].map(id => statusIn(noAssets, EMPTY_BRIEF, id, plain))).toEqual([
      'open',
      'open',
      'not-applicable',
    ]);
    const withVideo = scopedTree(
      GERMAN,
      context({ L1: english, S6: [{ view: 'main', provider: 'video', source: 'a.mp4' }] })
    );
    expect(statusIn(withVideo, EMPTY_BRIEF, 'L4', plain)).toBe('open');
    // Re-adding the only language makes no second one.
    const same = scopedTree({ addition: 'language', name: 'en-US' }, context({ L1: english }));
    expect(statusIn(same, EMPTY_BRIEF, 'L2', plain)).toBe('not-applicable');
  });
});

describe('host-module', () => {
  it('H1 rejects none; H2, H3 present', () => {
    const tree = scopedTree(HOST, context());
    expect(ids(tree)).toEqual(['H1', 'H2', 'H3']);
    const h1 = questionOf(tree, 'H1');
    expect(validateValue(h1, 'none').ok).toBe(false);
    expect(validateValue(h1, []).ok).toBe(false);
    const analytics = [{ need: 'analytics', detail: 'Plausible' }];
    expect(validateValue(h1, analytics)).toEqual({ ok: true, value: analytics });
    const plain = facts();
    // H1's Phase 1 prerequisites (V4, V6, I5) are outside the scope: it is asked at once.
    expect(statusIn(tree, EMPTY_BRIEF, 'H1', plain)).toBe('open');
    const brief = answered(tree, plain, [{ id: 'H1', value: analytics }]);
    expect(statusIn(tree, brief, 'H2', plain)).toBe('not-applicable');
    expect(statusIn(tree, brief, 'H3', plain)).toBe('open');
  });
});

describe('additionHeading', () => {
  it('Addition: view Outro, Addition: language de-DE, Addition: host-module', () => {
    expect(additionHeading(OUTRO)).toBe('Addition: view Outro');
    expect(additionHeading(GERMAN)).toBe('Addition: language de-DE');
    expect(additionHeading(HOST)).toBe('Addition: host-module');
  });
});
