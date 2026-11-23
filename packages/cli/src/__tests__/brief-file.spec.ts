/**
 * Spec 059 Phase 1 (FR-010 unknown view, FR-019 to FR-021, SC-006; plan §4, P1, P17, P19): the
 * `BRIEF.md` file, `mcp/brief/brief-file.ts`. Pure: fixtures are read, nothing is written.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type FactsSnapshot,
  type ParsedBrief,
  parseBrief,
  writeBrief,
} from '../mcp/brief/brief-file.js';
import {
  type AdditionState,
  type Answer,
  applyAnswers,
  type BriefState,
  canonicalAnswers,
  digest,
  EMPTY_BRIEF,
  type Evaluation,
  evaluate,
  type Facts,
  nextRound,
  pickRound,
  textDirection,
} from '../mcp/brief/engine.js';
import { makeSigner } from '../mcp/brief/signature.js';
import { TREE } from '../mcp/brief/tree.js';
import { loadPersona, type PersonaName, runPersona, type Step } from './brief-persona-driver.js';

const FIXTURES = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'brief');
const readFixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const example = readFixture('example.md');

/** The SC-006 facts snapshot of the golden file. */
const GOLDEN_FACTS: FactsSnapshot = {
  state: 'open',
  serverEligian: '1.1.0',
  eligianInstalled: '1.1.0',
  packageManager: 'pnpm',
  textDirection: undefined,
  assets: [{ key: 'media/demo.mp4', kind: 'video', state: 'missing' }],
};

const PLAIN_FACTS: FactsSnapshot = { ...GOLDEN_FACTS, assets: [] };

const parsedOf = (brief: BriefState): ParsedBrief => ({ brief, ignored: [], kept: [] });

const byId = (answers: readonly Answer[]): readonly Answer[] =>
  [...answers].sort((l, r) => (l.id < r.id ? -1 : l.id > r.id ? 1 : 0));

const answer = (parsed: ParsedBrief, id: string): Answer | undefined =>
  parsed.brief.answers.find(a => a.id === id);

/** The 1-based line number of the first line of `text` equal to `line`. */
const lineOf = (text: string, line: string): number => text.split('\n').indexOf(line) + 1;

const allShapes = JSON.parse(readFixture('all-shapes.json')) as {
  readonly brief: BriefState;
  readonly facts: FactsSnapshot;
};

describe('golden', () => {
  it('write(parse(example)) is byte-identical', () => {
    const written = writeBrief(TREE, parseBrief(example), GOLDEN_FACTS);
    expect(written).toBe(example);
    expect(Buffer.from(written, 'utf8').equals(Buffer.from(example, 'utf8'))).toBe(true);
  });

  it('parse(example) returns idea (two lines), P1, P5 = 90, C1, C4, S1, S2 (3 rows), S6 (3 rows), V3:demo (2 rows, basis 4a3055a743c8484e), V:signup (same as intro, basis 23a0aa8fc1af8ff6), no ignored', () => {
    const parsed = parseBrief(example);
    expect(parsed.ignored).toEqual([]);
    expect(parsed.kept).toEqual([]);
    expect(parsed.brief.idea).toBe(
      'A short product tour in English and Dutch,\nthree screens, with a video on the second.'
    );
    expect(parsed.brief.treeVersion).toBe(1);
    expect(parsed.brief.confirmation).toBeUndefined();
    expect(parsed.brief.answers.map(a => a.id)).toEqual([
      'P1',
      'P5',
      'C1',
      'C4',
      'S1',
      'S2',
      'S6',
      'V3:demo',
      'V:signup',
    ]);
    expect(answer(parsed, 'P1')).toEqual({
      id: 'P1',
      value: 'Know the three features and sign up for the trial.',
      by: 'user',
      round: 1,
    });
    expect(answer(parsed, 'P5')).toEqual({ id: 'P5', value: 90, by: 'delegated', round: 1 });
    expect(answer(parsed, 'C1')?.value).toBe('self-paced');
    expect(answer(parsed, 'C4')?.value).toBe('on');
    expect(answer(parsed, 'S1')).toEqual({ id: 'S1', value: 'slide-deck', by: 'user', round: 2 });
    expect(answer(parsed, 'S2')?.value).toEqual([
      { name: 'intro', purpose: 'The promise' },
      { name: 'demo', purpose: 'The product at work' },
      { name: 'signup', purpose: 'The call to action' },
    ]);
    expect(answer(parsed, 'S2')?.round).toBe(3);
    expect(answer(parsed, 'S6')?.value).toEqual([
      { view: 'intro', provider: 'raf', source: '-' },
      { view: 'demo', provider: 'video', source: 'media/demo.mp4' },
      { view: 'signup', provider: 'raf', source: '-' },
    ]);
    expect(answer(parsed, 'V3:demo')).toEqual({
      id: 'V3:demo',
      value: [
        { element: 'Product video', kind: 'video', file: 'media/demo.mp4' },
        { element: 'Feature list', kind: 'list', file: '-' },
      ],
      by: 'user',
      round: 5,
      basis: '4a3055a743c8484e',
    });
    expect(answer(parsed, 'V:signup')).toEqual({
      id: 'V:signup',
      value: 'same as intro',
      by: 'user',
      round: 5,
      basis: '23a0aa8fc1af8ff6',
    });
  });
});

describe('round trip (FR-021)', () => {
  it('all-shapes: parse(write(b)) returns the same idea, tree, confirmation and answers; write(parse(write(b))) is byte-identical', () => {
    const b = allShapes.brief;
    const written = writeBrief(TREE, parsedOf(b), allShapes.facts);
    const parsed = parseBrief(written);
    expect(parsed.ignored).toEqual([]);
    expect(parsed.kept).toEqual([]);
    expect(parsed.brief.idea).toBe(b.idea);
    expect(parsed.brief.treeVersion).toBe(b.treeVersion);
    expect(parsed.brief.confirmation).toEqual(b.confirmation);
    expect(byId(parsed.brief.answers)).toEqual(byId(b.answers));
    expect(writeBrief(TREE, parsed, allShapes.facts)).toBe(written);
  });

  it('all-shapes output matches the file snapshot', async () => {
    const written = writeBrief(TREE, parsedOf(allShapes.brief), allShapes.facts);
    await expect(written).toMatchFileSnapshot('./__snapshots__/brief-all-shapes.md.snap');
  });

  it('a CRLF copy of example parses the same', () => {
    expect(parseBrief(example.replace(/\n/g, '\r\n'))).toEqual(parseBrief(example));
  });

  it('the reviewed line round-trips and the digest ignores it', () => {
    const written = writeBrief(TREE, parsedOf(allShapes.brief), allShapes.facts);
    expect(written).toContain(
      '### S1: Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece?\n\n- by: user\n- round: 2\n- reviewed: 5\n\nhub-and-chapters\n'
    );
    const parsed = parseBrief(written);
    expect(answer(parsed, 'S1')).toEqual({
      id: 'S1',
      value: 'hub-and-chapters',
      by: 'user',
      round: 2,
      reviewed: 5,
    });
    const unreviewed = parsed.brief.answers.map(({ reviewed: _reviewed, ...rest }) => rest);
    expect(digest(parsed.brief.answers)).toBe(digest(unreviewed));
  });

  /** No asset file exists in the persona's project; every relative path is inside it. */
  const personaFacts: Facts = {
    briefDir: '.',
    exists: () => false,
    inside: p => !p.startsWith('../') && !p.startsWith('/'),
  };

  /** The facts snapshot of a write of the evaluated brief (the L1 codes and the asset list). */
  const snapshotOf = (b: BriefState, evaluation: Evaluation): FactsSnapshot => {
    const l1 = b.answers.find(x => x.id === 'L1')?.value as
      | readonly Readonly<Record<string, string>>[]
      | undefined;
    const codes = l1?.map(row => row.code);
    return {
      ...PLAIN_FACTS,
      state: evaluation.state,
      textDirection: codes?.map(code => ({ code, direction: textDirection(code) })),
      assets: evaluation.assets,
    };
  };

  it.each<PersonaName>(['terse', 'detailed', 'vague'])(
    'the %s persona brief round-trips',
    async name => {
      const persona = loadPersona(name);
      let b: BriefState = { ...EMPTY_BRIEF, idea: persona.idea };
      const stepOf = (rejected: Step['rejected']): Step => {
        const evaluation = evaluate(TREE, b, personaFacts);
        return {
          state: evaluation.state,
          round: pickRound(TREE, evaluation, 7),
          rejected,
          counts: evaluation.counts,
        };
      };
      const run = await runPersona(
        persona,
        async input => {
          const result = applyAnswers(TREE, b, personaFacts, input, nextRound(b));
          b = result.brief;
          return stepOf(result.rejected);
        },
        async () => stepOf([])
      );
      expect(run.final.state).toBe('complete');
      expect(b.answers.some(x => x.basis !== undefined)).toBe(true);

      const facts = snapshotOf(b, evaluate(TREE, b, personaFacts));
      const written = writeBrief(TREE, parsedOf(b), facts);
      const parsed = parseBrief(written);
      expect(parsed.ignored).toEqual([]);
      expect(parsed.kept).toEqual([]);
      expect(parsed.brief.idea).toBe(b.idea);
      expect(parsed.brief.treeVersion).toBe(b.treeVersion);
      expect(parsed.brief.confirmation).toEqual(b.confirmation);
      expect(byId(parsed.brief.answers)).toEqual(byId(b.answers));
      expect(writeBrief(TREE, parsed, facts)).toBe(written);
    }
  );

  it('four-views.md parses clean, has four views and is a fixed point of write', () => {
    const fourViews = readFixture('four-views.md');
    const parsed = parseBrief(fourViews);
    expect(parsed.ignored).toEqual([]);
    const s2 = answer(parsed, 'S2')?.value as readonly { readonly name: string }[];
    expect(s2).toHaveLength(4);
    expect(parsed.brief.answers.filter(a => a.id.startsWith('V'))).toEqual([]);
    expect(writeBrief(TREE, parsed, PLAIN_FACTS)).toBe(fourViews);
  });
});

describe('kept content', () => {
  const IGNORED_C2 = [
    '### C2: On which devices, and which is the main one?',
    '',
    '- by: user',
    '- round: 1',
    '',
    'all of them',
  ].join('\n');

  it('a ## Notes section and an ignored answer block survive a parse and a write byte for byte and are reported in ignored', () => {
    const input = `${example.replace('on\n\n## S: Structure', `on\n\n${IGNORED_C2}\n\n## S: Structure`)}\n## Notes\n\nKeep this note.\n`;
    expect(input).toContain(IGNORED_C2);
    const parsed = parseBrief(input);
    expect(parsed.ignored).toEqual([
      { line: lineOf(input, IGNORED_C2.split('\n')[0]), reason: 'value does not fit its shape' },
      { line: lineOf(input, '## Notes'), reason: 'unknown section' },
    ]);
    expect(parsed.kept).toEqual([
      { section: '## C: Context of use', text: IGNORED_C2, kind: 'answer' },
      { section: '## Notes', text: '## Notes\n\nKeep this note.', kind: 'section' },
    ]);
    expect(answer(parsed, 'C2')).toBeUndefined();
    expect(writeBrief(TREE, parsed, GOLDEN_FACTS)).toBe(input);
  });

  it('a hand-edited ## Facts is dropped and rewritten from the given facts', () => {
    const edited = example.replace(
      '- server-eligian: 1.1.0',
      '- server-eligian: 9.9.9\n- added-by-hand: yes'
    );
    expect(edited).not.toBe(example);
    const parsed = parseBrief(edited);
    expect(parsed.ignored).toEqual([]);
    expect(parsed.kept).toEqual([]);
    expect(writeBrief(TREE, parsed, GOLDEN_FACTS)).toBe(example);
  });

  it('a ## View: gone section when S2 lists only intro is in ignored with unknown-view and is written back verbatim after ## Facts', () => {
    const base = writeBrief(
      TREE,
      parsedOf({
        treeVersion: 1,
        answers: [
          { id: 'S2', value: [{ name: 'intro', purpose: 'Only' }], by: 'user', round: 3 },
          {
            id: 'V1:intro',
            value: 'One view.',
            by: 'user',
            round: 4,
            basis: '0123456789abcdef',
          },
        ],
      }),
      PLAIN_FACTS
    );
    const gone = [
      '## View: gone',
      '',
      '### V1: What is the one thing this view says?',
      '',
      '- by: user',
      '- round: 4',
      '- basis: fedcba9876543210',
      '',
      'Gone.',
    ].join('\n');
    const input = base.replace('## I: Interaction', `${gone}\n\n## I: Interaction`);
    const parsed = parseBrief(input);
    expect(parsed.ignored).toEqual([
      { line: lineOf(input, '## View: gone'), reason: 'unknown-view' },
    ]);
    expect(parsed.brief.answers.map(a => a.id)).toEqual(['S2', 'V1:intro']);
    expect(parsed.kept).toEqual([{ section: '## View: gone', text: gone, kind: 'section' }]);
    const written = writeBrief(TREE, parsed, PLAIN_FACTS);
    expect(written).toBe(`${base}\n${gone}\n`);
    expect(written.indexOf('## View: gone')).toBeGreaterThan(written.indexOf('## Facts'));
  });

  it('a malformed header line (- colour: red) is in ignored with malformed header line', () => {
    const input = example.replace('- approval: none', '- approval: none\n- colour: red');
    const parsed = parseBrief(input);
    expect(parsed.ignored).toEqual([
      { line: lineOf(input, '- colour: red'), reason: 'malformed header line' },
    ]);
    expect(parsed.brief.answers).toEqual(parseBrief(example).brief.answers);
  });

  it('an answer with an unknown id (### Z9: …) is ignored and kept', () => {
    const z9 = ['### Z9: Something new', '', '- by: user', '- round: 1', '', 'A value.'].join('\n');
    const input = example.replace(
      '90s\n\n## C: Context of use',
      `90s\n\n${z9}\n\n## C: Context of use`
    );
    expect(input).toContain(z9);
    const parsed = parseBrief(input);
    expect(parsed.ignored).toEqual([
      { line: lineOf(input, '### Z9: Something new'), reason: 'unknown question' },
    ]);
    expect(parsed.kept).toEqual([{ section: '## P: Purpose', text: z9, kind: 'answer' }]);
    expect(parsed.brief.answers.map(a => a.id)).not.toContain('Z9');
    expect(writeBrief(TREE, parsed, GOLDEN_FACTS)).toBe(input);
  });
});

describe('explicit FR-019 lines', () => {
  const P1: Answer = { id: 'P1', value: 'Know it.', by: 'user', round: 1 };

  it('a confirmed brief has /^- confirmation: agent-reported <ISO> round \\d+ hmac-sha256:[0-9a-f]{64}$/m and a - confirmation-message: line whose value JSON.parses to the message', () => {
    const message = 'The user said "yes, build it"\nand nothing else.';
    const at = new Date(Date.UTC(2026, 10, 19, 12, 30, 5, 120)).toISOString();
    const hmac = makeSigner(Buffer.alloc(32, 6)).sign([
      'eligian-brief/1',
      'confirmation',
      'brief',
      'agent-reported',
      at,
      1,
      canonicalAnswers([P1]),
    ]);
    const written = writeBrief(
      TREE,
      parsedOf({
        treeVersion: 1,
        answers: [P1],
        confirmation: { mode: 'agent-reported', at, round: 1, hmac, message },
      }),
      { ...PLAIN_FACTS, state: 'confirmed' }
    );
    expect(written).toMatch(
      /^- confirmation: agent-reported \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z round \d+ hmac-sha256:[0-9a-f]{64}$/m
    );
    expect(written).toContain(`\n- confirmation: agent-reported ${at} round 1 ${hmac}\n`);
    const line = written.split('\n').find(l => l.startsWith('- confirmation-message: '));
    expect(line).toBeDefined();
    expect(JSON.parse((line as string).slice('- confirmation-message: '.length))).toBe(message);
    expect(written).toContain('\n- state: confirmed\n');
  });

  it('an unconfirmed brief has - confirmation: none and no confirmation-message line', () => {
    const written = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [P1] }), PLAIN_FACTS);
    expect(written).toMatch(/^- confirmation: none$/m);
    expect(written).not.toContain('confirmation-message');
  });

  it('L1 en-US, ar-EG gives - text-direction: en-US ltr, ar-EG rtl', () => {
    const codes = ['en-US', 'ar-EG'];
    const written = writeBrief(
      TREE,
      parsedOf({
        treeVersion: 1,
        answers: [
          {
            id: 'L1',
            value: [
              { code: 'en-US', default: 'yes' },
              { code: 'ar-EG', default: 'no' },
            ],
            by: 'user',
            round: 1,
          },
        ],
      }),
      {
        ...PLAIN_FACTS,
        textDirection: codes.map(code => ({ code, direction: textDirection(code) })),
      }
    );
    expect(written).toMatch(/^- text-direction: en-US ltr, ar-EG rtl$/m);
  });

  it('L1 unanswered gives - text-direction: -', () => {
    const written = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [P1] }), PLAIN_FACTS);
    expect(written).toMatch(/^- text-direction: -$/m);
  });

  it('an empty asset list gives - assets: none and no asset table', () => {
    const written = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [P1] }), PLAIN_FACTS);
    expect(written).toMatch(/^- assets: none$/m);
    expect(written).not.toContain('| asset |');
  });

  it('a non-empty asset list gives the header | asset | kind | state |', () => {
    const written = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [P1] }), GOLDEN_FACTS);
    expect(written).toMatch(/^\| asset \| kind \| state \|$/m);
    expect(written).toMatch(/^\| media\/demo\.mp4 \| video \| missing \|$/m);
    expect(written).not.toContain('- assets: none');
  });

  it('the comment line and - approval: none are verbatim', () => {
    const written = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [P1] }), PLAIN_FACTS);
    expect(written).toMatch(
      /^<!-- Written by eligian_brief\. Agents: change answers only through eligian_brief\. People may edit by hand; the tool re-reads this file on every call\. -->$/m
    );
    expect(written).toMatch(/^- approval: none$/m);
    expect(written).toMatch(
      /^<!-- Computed by eligian_brief when it writes this file; never read back\. -->$/m
    );
  });

  it('eligianInstalled undefined writes - eligian-installed: -', () => {
    const written = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [P1] }), {
      ...PLAIN_FACTS,
      eligianInstalled: undefined,
    });
    expect(written).toMatch(/^- eligian-installed: -$/m);
  });
});

describe('scope line', () => {
  const P1: Answer = { id: 'P1', value: 'Know it.', by: 'user', round: 1 };

  it("- scope: adopt is written directly after - tree: and only when set; a file without it is byte-identical to Phase 1's writer", () => {
    const plain = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [P1] }), PLAIN_FACTS);
    expect(plain).not.toContain('- scope:');
    const adopted = writeBrief(
      TREE,
      parsedOf({ treeVersion: 1, scope: 'adopt', answers: [P1] }),
      PLAIN_FACTS
    );
    const lines = adopted.split('\n');
    expect(lines.indexOf('- scope: adopt')).toBe(lines.indexOf('- tree: 1') + 1);
    expect(adopted.replace('- scope: adopt\n', '')).toBe(plain);
    const parsed = parseBrief(adopted);
    expect(parsed.ignored).toEqual([]);
    expect(parsed.brief.scope).toBe('adopt');
    expect(writeBrief(TREE, parsed, PLAIN_FACTS)).toBe(adopted);
    expect(parseBrief(plain).brief.scope).toBeUndefined();
    expect(writeBrief(TREE, parseBrief(example), GOLDEN_FACTS)).toBe(example);
  });

  it('- by: code round-trips', () => {
    const s2: Answer = {
      id: 'S2',
      value: [{ name: 'Hub', purpose: 'The start' }],
      by: 'code',
      round: 1,
    };
    const written = writeBrief(
      TREE,
      parsedOf({ treeVersion: 1, scope: 'adopt', answers: [P1, s2] }),
      PLAIN_FACTS
    );
    expect(written).toContain('\n- by: code\n');
    const parsed = parseBrief(written);
    expect(parsed.ignored).toEqual([]);
    expect(answer(parsed, 'S2')).toEqual(s2);
    expect(writeBrief(TREE, parsed, PLAIN_FACTS)).toBe(written);
  });
});

describe('addition sections', () => {
  const noBrief = readFixture('addition-no-brief.md');
  const HMAC = (c: string): string => `hmac-sha256:${c.repeat(64)}`;
  const S6: Answer = { id: 'S6', value: { provider: 'raf', source: '-' }, by: 'user', round: 1 };
  const V1: Answer = {
    id: 'V1:Outro',
    value: 'Where to go next.',
    by: 'user',
    round: 2,
    basis: '1e64e7b9d3246844',
  };
  const OUTRO: AdditionState = {
    kind: 'view',
    name: 'Outro',
    heading: 'Addition: view Outro',
    answers: [S6, V1],
  };
  const SIGNED_OUTRO: AdditionState = {
    ...OUTRO,
    confirmation: {
      mode: 'agent-reported',
      at: '2026-11-20T09:14:02.120Z',
      round: 2,
      hmac: HMAC('a'),
      message: 'Yes, that is the outro.',
    },
    approval: { mode: 'elicitation', at: '2026-11-20T09:31:45.003Z', hmac: HMAC('b') },
  };
  const GERMAN: AdditionState = {
    kind: 'language',
    name: 'de-DE',
    heading: 'Addition: language de-DE',
    answers: [],
  };
  const HOST: AdditionState = {
    kind: 'host-module',
    name: '',
    heading: 'Addition: host-module',
    answers: [],
  };
  const OPEN_FACTS: FactsSnapshot = {
    ...PLAIN_FACTS,
    additionStates: new Map([['Addition: view Outro', 'open']]),
  };

  it('addition-no-brief.md parses and writes byte-identically', () => {
    const parsed = parseBrief(noBrief);
    expect(parsed.ignored).toEqual([]);
    expect(parsed.kept).toEqual([]);
    expect(parsed.brief.answers).toEqual([]);
    expect(parsed.brief.idea).toBeUndefined();
    expect(parsed.brief.additions).toEqual([OUTRO]);
    expect(writeBrief(TREE, parsed, OPEN_FACTS)).toBe(noBrief);
    const built = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [], additions: [OUTRO] }), {
      ...OPEN_FACTS,
    });
    expect(built).toBe(noBrief);
  });

  it('a main brief plus an addition: ## Addition: view Outro comes after the last view section and before ## Facts; its header lines are - state:, - confirmation:, - approval: in that order, then its ### answer blocks', () => {
    const main = parseBrief(example);
    const parsed: ParsedBrief = {
      ...main,
      brief: { ...main.brief, additions: [SIGNED_OUTRO] },
    };
    const facts: FactsSnapshot = {
      ...GOLDEN_FACTS,
      additionStates: new Map([['Addition: view Outro', 'approved']]),
    };
    const written = writeBrief(TREE, parsed, facts);
    const lines = written.split('\n');
    const at = (line: string): number => lines.indexOf(line);
    const heading = at('## Addition: view Outro');
    expect(heading).toBeGreaterThan(at('## View: signup'));
    expect(heading).toBeGreaterThan(at('## W: Working agreement'));
    expect(heading).toBeLessThan(at('## Facts'));
    expect(lines.slice(heading, heading + 9)).toEqual([
      '## Addition: view Outro',
      '',
      '- state: approved',
      `- confirmation: agent-reported 2026-11-20T09:14:02.120Z round 2 ${HMAC('a')}`,
      '- confirmation-message: "Yes, that is the outro."',
      `- approval: elicitation 2026-11-20T09:31:45.003Z ${HMAC('b')}`,
      '',
      "### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?",
      '',
    ]);
    expect(at('### V1: Outro: What is the one thing this view says?')).toBeGreaterThan(heading);
    expect(at('### V1: Outro: What is the one thing this view says?')).toBeLessThan(at('## Facts'));
    // The main brief's header is untouched: its state is the snapshot's own.
    expect(lines.indexOf('- state: open')).toBeLessThan(at('## P: Purpose'));
    const reparsed = parseBrief(written);
    expect(reparsed.ignored).toEqual([]);
    expect(reparsed.kept).toEqual([]);
    expect(reparsed.brief.answers).toEqual(main.brief.answers);
    expect(reparsed.brief.additions).toEqual([SIGNED_OUTRO]);
    expect(writeBrief(TREE, reparsed, facts)).toBe(written);
  });

  it('two additions keep their creation order', () => {
    const facts: FactsSnapshot = {
      ...PLAIN_FACTS,
      additionStates: new Map([
        ['Addition: language de-DE', 'complete'],
        ['Addition: view Outro', 'open'],
        ['Addition: host-module', 'open'],
      ]),
    };
    for (const additions of [
      [GERMAN, OUTRO, HOST],
      [HOST, OUTRO, GERMAN],
    ]) {
      const written = writeBrief(TREE, parsedOf({ treeVersion: 1, answers: [], additions }), facts);
      const headings = written.split('\n').filter(l => l.startsWith('## '));
      expect(headings).toEqual([...additions.map(a => `## ${a.heading}`), '## Facts']);
      const parsed = parseBrief(written);
      expect(parsed.ignored).toEqual([]);
      expect(parsed.brief.additions).toEqual(additions);
      expect(writeBrief(TREE, parsed, facts)).toBe(written);
    }
  });

  it('an unknown ## section stays after ## Facts', () => {
    const withNotes = noBrief.replace('## Facts', '## Notes\n\nKeep the outro short.\n\n## Facts');
    const parsed = parseBrief(withNotes);
    expect(parsed.ignored).toEqual([
      { line: lineOf(withNotes, '## Notes'), reason: 'unknown section' },
    ]);
    expect(parsed.brief.additions).toEqual([OUTRO]);
    const written = writeBrief(TREE, parsed, OPEN_FACTS);
    const lines = written.split('\n');
    expect(lines.indexOf('## Addition: view Outro')).toBeLessThan(lines.indexOf('## Facts'));
    expect(lines.indexOf('## Notes')).toBeGreaterThan(lines.indexOf('## Facts'));
    expect(written).toBe(`${noBrief}\n## Notes\n\nKeep the outro short.\n`);
  });

  it('the no-brief file has the Phase 1 header lines, no idea paragraph, no branch or view section', () => {
    const lines = writeBrief(
      TREE,
      parsedOf({ treeVersion: 1, answers: [], additions: [OUTRO] }),
      OPEN_FACTS
    ).split('\n');
    const heading = lines.indexOf('## Addition: view Outro');
    expect(lines.slice(0, heading + 1)).toEqual([
      '# Brief',
      '',
      '<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->',
      '',
      '- tree: 1',
      '- state: open',
      '- confirmation: none',
      '- approval: none',
      '',
      '## Addition: view Outro',
    ]);
    expect(lines.some(l => l.startsWith('>'))).toBe(false);
    expect(lines.some(l => /^## ([A-Z]): /.test(l) || l.startsWith('## View: '))).toBe(false);
  });

  it('the Phase 1 golden example.md is byte-identical (SC-018)', () => {
    const parsed = parseBrief(example);
    expect(parsed.brief.additions).toBeUndefined();
    expect(writeBrief(TREE, parsed, GOLDEN_FACTS)).toBe(example);
    expect(writeBrief(TREE, parsed, { ...GOLDEN_FACTS, additionStates: new Map() })).toBe(example);
  });
});

describe('robustness', () => {
  /** mulberry32: a small seeded PRNG, so every run mutates the same way. */
  const mulberry32 = (seed: number) => {
    let a = seed >>> 0;
    return (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  it('500 seeded mutations never throw (seed 0x5eed)', () => {
    const random = mulberry32(0x5eed);
    const pick = (n: number): number => Math.floor(random() * n);
    const randomBytes = (): string => {
      let s = '';
      const length = 1 + pick(12);
      for (let i = 0; i < length; i++) {
        // Mostly the characters the parser cares about, sometimes any code unit.
        const special = '#|\\-:>`_ \r\n\t{}"';
        s +=
          random() < 0.6
            ? special.charAt(pick(special.length))
            : String.fromCharCode(pick(0x10000));
      }
      return s;
    };
    const baseLines = example.split('\n');
    for (let n = 0; n < 500; n++) {
      const lines = [...baseLines];
      const operations = 1 + pick(6);
      for (let k = 0; k < operations; k++) {
        const at = pick(lines.length);
        switch (pick(4)) {
          case 0:
            lines.splice(at, 1);
            break;
          case 1:
            lines.splice(at, 0, lines[at] ?? '');
            break;
          case 2:
            lines[at] = (lines[at] ?? '').slice(0, pick((lines[at] ?? '').length + 1));
            break;
          default: {
            const line = lines[at] ?? '';
            const cut = pick(line.length + 1);
            lines[at] = line.slice(0, cut) + randomBytes() + line.slice(cut);
          }
        }
      }
      const mutated = lines.join('\n');
      // Unwrapped on purpose (P19): a throw is a real failure.
      const parsed = parseBrief(mutated);
      expect(Array.isArray(parsed.ignored)).toBe(true);
      expect(typeof writeBrief(TREE, parsed, GOLDEN_FACTS)).toBe('string');
    }
  });
});
