/**
 * Spec 059 Phase 3 (FR-037, SC-013; plan §9, "Data and generation"): the interview eval's persona
 * sheets (`evals/mcp/personas/<name>.json`) and their reader (`../mcp/evals/interview.ts`). Each
 * sheet carries its Phase 1 fixture's ids, values and script (`brief-persona-driver.ts`); only the
 * modes are the sheet's own, by FR-037's rules. A sheet also plays to `complete` through
 * `eligian_brief` on an in-process server (the `mcp-brief-interview.spec.ts` pattern).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Schema } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FactsSnapshot, parseBrief, writeBrief } from '../mcp/brief/brief-file.js';
import {
  type Answer,
  type AnswerInput,
  applyAnswers,
  type BriefState,
  EMPTY_BRIEF,
  evaluate,
  type Facts,
  nextRound,
  pickRound,
} from '../mcp/brief/engine.js';
import { TREE } from '../mcp/brief/tree.js';
import { briefStateOf, confirmBriefFixture } from '../mcp/evals/brief-fixture.js';
import { agentIsolation } from '../mcp/evals/harness.js';
import {
  type ConversationEntry,
  changedAnswerDependents,
  FACT_KINDS,
  type InterviewDeps,
  type InterviewMeasures,
  type InterviewRecord,
  InterviewRecordSchema,
  type InterviewRun,
  interviewMeasures,
  interviewPass,
  interviewStop,
  interviewVerdict,
  type JudgedMessage,
  type JudgedQuestion,
  judgePrompt,
  type Mode,
  PERSONA_NAMES,
  type PersonaName,
  type PersonaSheet,
  parseJudgeReply,
  parsePersonaSheet,
  renderInterviewSummary,
  runInterview,
  type SheetValue,
  sheetToPersona,
  simulatedUserPrompt,
  type TurnData,
  toJudgedMessage,
  viewMap,
} from '../mcp/evals/interview.js';
import { parseTranscript } from '../mcp/evals/transcript.js';
import { approvedBrief } from './brief-helpers.js';
import { loadPersona, type PersonaValue, runPersona, type Step } from './brief-persona-driver.js';
import { startInMemoryServer } from './mcp-test-client.js';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const SHEETS = path.join(REPO, 'evals', 'mcp', 'personas');
const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');

const readJson = (name: PersonaName): unknown =>
  JSON.parse(fs.readFileSync(path.join(SHEETS, `${name}.json`), 'utf8'));

const readSheet = (name: PersonaName): PersonaSheet => {
  const sheet = parsePersonaSheet(readJson(name));
  if (typeof sheet === 'string') throw new Error(`${name}.json: ${sheet}`);
  return sheet;
};

/** Every entry of a sheet as a list (one item, or the `values` list). */
const entriesOf = (sheet: PersonaSheet): [string, readonly SheetValue[]][] =>
  Object.keys(sheet.answers).map(id => {
    const entry = sheet.answers[id];
    return [id, 'values' in entry ? entry.values : [entry]];
  });

const modesOf = (sheet: PersonaSheet): Map<string, readonly Mode[]> =>
  new Map(entriesOf(sheet).map(([id, values]) => [id, values.map(v => v.mode)]));

const KEY_COUNTS: Readonly<Record<PersonaName, number>> = { terse: 40, detailed: 71, vague: 50 };

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const tempDir = (prefix: string): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(dir);
  return dir;
};

describe('PERSONA_NAMES', () => {
  it('is the three personas', () => {
    expect([...PERSONA_NAMES]).toEqual(['terse', 'detailed', 'vague']);
  });
});

describe('sheets', () => {
  describe.each(['terse', 'detailed', 'vague'] as const)('%s', name => {
    it('decodes', () => {
      const json = readJson(name) as Record<string, unknown>;
      const sheet = parsePersonaSheet(json);
      expect(typeof sheet, String(sheet)).toBe('object');

      const { opening: _opening, ...withoutOpening } = json;
      const noOpening = parsePersonaSheet(withoutOpening);
      expect(typeof noOpening).toBe('string');
      expect(noOpening).toContain('opening');

      const answers = json.answers as Record<string, unknown>;
      const badMode = parsePersonaSheet({
        ...json,
        answers: { ...answers, P1: { value: 'x', mode: 'maybe' } },
      });
      expect(typeof badMode).toBe('string');
      expect(badMode).toContain('P1');
    });

    it('keys, values and script equal the Phase 1 fixture', () => {
      const sheet = readSheet(name);
      const fixture = loadPersona(name);
      const keys = Object.keys(sheet.answers).sort();
      expect(keys).toEqual(Object.keys(fixture.answers).sort());
      expect(keys).toHaveLength(KEY_COUNTS[name]);
      for (const id of keys) {
        const own = sheet.answers[id];
        const theirs = fixture.answers[id];
        if ('values' in theirs) {
          expect('values' in own, id).toBe(true);
          const list = 'values' in own ? own.values : [];
          expect(list.length, id).toBe(theirs.values.length);
          theirs.values.forEach((item: PersonaValue, k: number) => {
            expect(list[k].value, `${id}[${k}]`).toEqual(item.value);
          });
        } else {
          expect('values' in own, id).toBe(false);
          expect((own as SheetValue).value, id).toEqual(theirs.value);
        }
      }
      expect(sheet.script).toEqual(fixture.script);
    });

    it('delegated ids of sheetToPersona', () => {
      const persona = sheetToPersona(readSheet(name));
      const delegated = Object.keys(persona.answers)
        .filter(id => {
          const entry = persona.answers[id];
          const list = 'values' in entry ? entry.values : [entry];
          return list.some(v => v.delegated === true);
        })
        .sort();
      const expected: Readonly<Record<PersonaName, string[]>> = {
        terse: [],
        detailed: [],
        vague: ['D2', 'D3', 'D4', 'D6'],
      };
      expect(delegated).toEqual(expected[name]);
    });

    it('modes', () => {
      const sheet = readSheet(name);
      const modes = modesOf(sheet);
      for (const [id, list] of modes) {
        if (name === 'terse') expect(list, id).toEqual(['accepts']);
        else if (name === 'detailed') expect(list, id).toEqual(['states']);
        else if (['D2', 'D3', 'D4', 'D6'].includes(id)) expect(list, id).toEqual(['decides']);
        else if (id === 'S3') expect(list, id).toEqual(['states', 'states']);
        else expect(list, id).toEqual(['states']);
      }
      if (name === 'vague') {
        const s3 = sheet.answers.S3;
        expect('values' in s3).toBe(true);
        expect('values' in s3 ? s3.values.map(v => v.value) : []).toEqual(['nowhere', 'overview']);
      }
    });

    it('content', () => {
      const sheet = readSheet(name);
      expect(sheet.idea).toBe(loadPersona(name).idea);
      expect(sheet.opening.trim()).not.toBe('');
      const value = (id: string): unknown => (sheet.answers[id] as SheetValue).value;
      if (name === 'detailed') {
        expect((value('L1') as { code: string }[]).map(row => row.code)).toHaveLength(2);
        expect((value('S6') as { provider: string }[]).some(row => row.provider === 'video')).toBe(
          true
        );
        expect(value('D1')).not.toBe('none');
      }
      if (name === 'vague') {
        expect(sheet.script).toHaveLength(1);
        expect(sheet.script[0].afterRound).toBe(8);
        expect(sheet.script[0].answers.map(a => a.id)).toEqual(['S2', 'C4']);
      }
    });

    it('plays to complete through eligian_brief', async () => {
      const sheet = readSheet(name);
      const cwd = tempDir(`eligian-sheet-${name}-`);
      const stateDir = path.join(tempDir(`eligian-sheet-state-${name}-`), 'state');
      const server = await startInMemoryServer({ cwd, docsRoot: DOCS, brief: { stateDir } });
      const brief = async (args: Record<string, unknown>): Promise<Step> => {
        const { payload, isError } = await server.callTool('eligian_brief', args);
        expect(isError, JSON.stringify(payload)).toBe(false);
        return payload as Step;
      };
      try {
        const run = await runPersona(
          sheetToPersona(sheet),
          answers => brief({ action: 'answer', answers }),
          () => brief({ action: 'status', idea: sheet.idea })
        );
        expect(run.final.state).toBe('complete');
        const keys = Object.keys(sheet.answers);
        for (const item of run.rounds.flat()) expect(keys, item.id).toContain(item.id);
      } finally {
        await server.close();
      }
    }, 120_000);
  });
});

// ---------------------------------------------------------------------------------------------
// T021 (FR-038, FR-041 to FR-043, SC-014): the measures over synthetic turns, the judge reply
// and the verdict. Events have the shapes `toolEntries` reads (`transcript.ts:108`).

/** No asset file exists in the persona's project; every relative path is inside it. */
const FACTS: Facts = {
  briefDir: '.',
  exists: () => false,
  inside: p => !p.startsWith('../') && !p.startsWith('/'),
};

const SNAPSHOT: FactsSnapshot = {
  state: 'open',
  serverEligian: '1.2.0',
  eligianInstalled: undefined,
  packageManager: undefined,
  textDirection: undefined,
  assets: [],
};

const textOf = (brief: BriefState): string =>
  writeBrief(TREE, { brief, ignored: [], kept: [] }, SNAPSHOT);

const briefOf = (answers: readonly Answer[]): string => textOf({ ...EMPTY_BRIEF, answers });

const ans = (id: string, value: Answer['value'], by: Answer['by'] = 'user', round = 1): Answer => ({
  id,
  value,
  by,
  round,
});

let toolId = 0;

/** One tool call and its result: an assistant `tool_use` and a user `tool_result`. */
const call = (
  name: string,
  input: Record<string, unknown>,
  result: string,
  isError = false
): unknown[] => {
  toolId += 1;
  const id = `toolu_${toolId}`;
  return [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } },
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: [{ type: 'text', text: result }],
            ...(isError ? { is_error: true } : {}),
          },
        ],
      },
    },
  ];
};

const BRIEF_TOOL = 'mcp__eligian__eligian_brief';

/** An `eligian_brief` result with that state and a round of those ids. */
const briefCall = (state: string, ids: readonly string[] = []): unknown[] =>
  call(
    BRIEF_TOOL,
    { action: 'answer' },
    JSON.stringify({ state, round: ids.map(id => ({ id, title: id, ask: id })) })
  );

const turnOf = (
  turn: number,
  parts: { events?: readonly unknown[]; brief?: string; files?: readonly string[] } = {}
): TurnData => ({
  turn,
  events: parts.events ?? [],
  message: `message ${turn}`,
  brief: parts.brief,
  files: parts.files ?? [],
});

const q = (ids: readonly string[], fact = false, recommendation = true): JudgedQuestion => ({
  text: `about ${ids.join(', ')}`,
  ids,
  fact,
  recommendation,
});

const judgedAt = (turn: number, ...questions: JudgedQuestion[]): JudgedMessage => ({
  turn,
  messageIndex: turn,
  questions,
});

const sheetOf = (
  answers: PersonaSheet['answers'],
  script: PersonaSheet['script'] = []
): PersonaSheet => ({ idea: 'An idea.', opening: 'Hello.', answers, script });

const measure = (input: {
  turns: readonly TurnData[];
  sheet?: PersonaSheet;
  judged?: readonly JudgedMessage[];
  script?: { turn: number; roundCount: number } | null;
}): InterviewMeasures =>
  interviewMeasures({
    turns: input.turns,
    log: [],
    sheet: input.sheet ?? sheetOf({}),
    judged: input.judged ?? [],
    script: input.script ?? null,
    facts: FACTS,
  });

/**
 * Measure 2 over one asked-then-recorded exchange: turn 1 returns a round of `ids` and its
 * message asks them; turn 2's `BRIEF.md` records `answers`.
 */
const exchange = (
  sheet: PersonaSheet,
  ids: readonly string[],
  answers: readonly Answer[]
): InterviewMeasures['nothingAssumed'] =>
  measure({
    sheet,
    turns: [
      turnOf(1, { events: briefCall('open', ids) }),
      turnOf(2, { events: briefCall('complete'), brief: briefOf(answers) }),
    ],
    judged: [judgedAt(1, q(ids))],
  }).nothingAssumed;

describe('measure 1: no generation before approval', () => {
  it('a successful eligian_check before the first approved result fails, after does not', () => {
    const check = () => call('mcp__eligian__eligian_check', { file: 'main.eligian' }, '{}');
    const before = measure({
      turns: [turnOf(1, { events: [...check(), ...briefCall('approved')] })],
    });
    expect(before.noGenerationBeforeApproval.pass).toBe(false);
    expect(before.noGenerationBeforeApproval.failures.join()).toContain('eligian_check');

    const after = measure({
      turns: [turnOf(1, { events: [...briefCall('approved'), ...check()] })],
    });
    expect(after.noGenerationBeforeApproval).toEqual({ pass: true, failures: [] });
  });

  it('a successful Write of x.eligian before approval fails; an isError one does not', () => {
    const write = (isError: boolean) =>
      call('Write', { file_path: '/p/x.eligian', content: 'x' }, 'ok', isError);
    const ok = measure({
      turns: [turnOf(1, { events: write(false) }), turnOf(2, { events: briefCall('approved') })],
    });
    expect(ok.noGenerationBeforeApproval.pass).toBe(false);
    expect(ok.noGenerationBeforeApproval.failures.join()).toContain('x.eligian');

    const refused = measure({
      turns: [turnOf(1, { events: write(true) }), turnOf(2, { events: briefCall('approved') })],
    });
    expect(refused.noGenerationBeforeApproval.pass).toBe(true);
  });

  it('a pre-approval turn whose file list holds x.eligian fails with no Write', () => {
    const m = measure({
      turns: [
        turnOf(1, { files: ['BRIEF.md', 'x.eligian'] }),
        turnOf(2, { events: briefCall('approved'), files: ['BRIEF.md', 'x.eligian'] }),
      ],
    });
    expect(m.noGenerationBeforeApproval.pass).toBe(false);
    expect(m.noGenerationBeforeApproval.failures.join()).toContain('x.eligian');

    const afterApproval = measure({
      turns: [
        turnOf(1, { files: ['BRIEF.md'] }),
        turnOf(2, { events: briefCall('approved'), files: ['BRIEF.md', 'x.eligian'] }),
      ],
    });
    expect(afterApproval.noGenerationBeforeApproval.pass).toBe(true);
  });
});

describe('measure 2: nothing assumed', () => {
  it('a choice states value that differs fails, an equal one passes', () => {
    const sheet = sheetOf({ C4: { value: 'on', mode: 'states' } });
    expect(exchange(sheet, ['C4'], [ans('C4', 'on')])).toEqual({ pass: true, failures: [] });
    const differs = exchange(sheet, ['C4'], [ans('C4', 'off')]);
    expect(differs.pass).toBe(false);
    expect(differs.failures.join()).toContain('C4');
  });

  it('a set states value in another order passes', () => {
    const sheet = sheetOf({ C3: { value: ['mouse', 'keyboard'], mode: 'states' } });
    expect(exchange(sheet, ['C3'], [ans('C3', ['keyboard', 'mouse'])]).pass).toBe(true);
    expect(exchange(sheet, ['C3'], [ans('C3', ['mouse'])]).pass).toBe(false);
  });

  it('a record states value with its keys in another order passes', () => {
    const value = { detail: '16:9', choice: 'fixed-ratio' };
    const sheet = sheetOf({ D4: { value, mode: 'states' } });
    const reordered = { choice: 'fixed-ratio', detail: '16:9' };
    expect(exchange(sheet, ['D4'], [ans('D4', reordered)]).pass).toBe(true);
    const other = { choice: 'fluid', detail: '16:9' };
    expect(exchange(sheet, ['D4'], [ans('D4', other)]).pass).toBe(false);
  });

  it('a table (S2) compares its first column: a reworded purpose passes, a missing view fails', () => {
    const sheet = sheetOf({
      S2: {
        value: [
          { name: 'overview', purpose: 'The office' },
          { name: 'details', purpose: 'Some details' },
        ],
        mode: 'states',
      },
    });
    const reworded = [
      { name: 'overview', purpose: 'The office at a glance' },
      { name: 'details', purpose: 'Where the desks are' },
    ];
    expect(exchange(sheet, ['S2'], [ans('S2', reworded)]).pass).toBe(true);
    // FR-049: a view the agent named itself is the sheet's view at the same S2 position.
    const renamed = [
      { name: 'overview', purpose: 'The office' },
      { name: 'rooms', purpose: 'Some details' },
    ];
    expect(exchange(sheet, ['S2'], [ans('S2', renamed)]).pass).toBe(true);
    const missing = [{ name: 'overview', purpose: 'The office' }];
    const failed = exchange(sheet, ['S2'], [ans('S2', missing)]);
    expect(failed.pass).toBe(false);
    expect(failed.failures.join()).toContain('S2');
  });

  it('a text states value worded differently, by user and tied to an exchange, passes', () => {
    const sheet = sheetOf({ P1: { value: 'People like the new office.', mode: 'states' } });
    const m = exchange(sheet, ['P1'], [ans('P1', 'Viewers come away liking the office.')]);
    expect(m).toEqual({ pass: true, failures: [] });
  });

  it('a V:<view> answer "same as <view>" resolves to SAME_AS and compares', () => {
    const views = [
      { name: 'slide-1', purpose: 'One' },
      { name: 'slide-2', purpose: 'Two' },
    ];
    const sheet = sheetOf({
      S2: { value: views, mode: 'states' },
      'V:slide-2': { value: 'same as slide-1', mode: 'states' },
    });
    const m = exchange(
      sheet,
      ['S2', 'V:slide-2'],
      [ans('S2', views), ans('V:slide-2', 'same as slide-1')]
    );
    expect(m).toEqual({ pass: true, failures: [] });
  });

  it('a decides entry recorded by user fails', () => {
    const sheet = sheetOf({ D2: { value: 'Something light.', mode: 'decides' } });
    expect(exchange(sheet, ['D2'], [ans('D2', 'Light', 'delegated')]).pass).toBe(true);
    const m = exchange(sheet, ['D2'], [ans('D2', 'Light', 'user')]);
    expect(m.pass).toBe(false);
    expect(m.failures.join()).toContain('D2');
  });

  it('an accepts answer by user with no judged message asking its id fails (invented)', () => {
    const sheet = sheetOf({ C1: { value: 'self-paced', mode: 'accepts' } });
    const m = measure({
      sheet,
      turns: [
        turnOf(1, { events: briefCall('open', ['C1']) }),
        turnOf(2, { brief: briefOf([ans('C1', 'self-paced')]) }),
      ],
      judged: [judgedAt(1, q([]))],
    }).nothingAssumed;
    expect(m.pass).toBe(false);
    expect(m.failures.join()).toContain('C1');
  });

  it('an accepts answer recorded in the same turn its question was first asked fails', () => {
    const sheet = sheetOf({ C1: { value: 'self-paced', mode: 'accepts' } });
    const recorded = briefOf([ans('C1', 'self-paced')]);
    const m = measure({
      sheet,
      turns: [
        turnOf(1, { events: briefCall('open', ['C1']), brief: recorded }),
        turnOf(2, { brief: recorded }),
      ],
      judged: [judgedAt(1, q(['C1']))],
    }).nothingAssumed;
    expect(m.pass).toBe(false);
    expect(m.failures.join()).toContain('C1');
  });

  it('an off-sheet id recorded by user fails, recorded by delegated passes', () => {
    const sheet = sheetOf({ C4: { value: 'on', mode: 'states' } });
    const delegated = exchange(sheet, ['C4'], [ans('C4', 'on'), ans('C5', 'online', 'delegated')]);
    expect(delegated.pass).toBe(true);
    const m = exchange(sheet, ['C4'], [ans('C4', 'on'), ans('C5', 'online', 'user')]);
    expect(m.pass).toBe(false);
    expect(m.failures.join()).toContain('C5');
  });
});

describe('measures 3 and 4: facts and recommendations', () => {
  const sheet = sheetOf({ C1: { value: 'self-paced', mode: 'accepts' } });
  const turns = [
    turnOf(1, { events: briefCall('open', ['C1']) }),
    turnOf(2, { brief: briefOf([ans('C1', 'self-paced')]) }),
  ];

  it('a fact: true question fails measure 3', () => {
    const m = measure({ sheet, turns, judged: [judgedAt(1, q(['C1']), q([], true))] });
    expect(m.factsAsked).toBe(1);
    expect(m.questionsWithoutRecommendation).toBe(0);
  });

  it('a recommendation: false question fails measure 4', () => {
    const m = measure({ sheet, turns, judged: [judgedAt(1, q(['C1'], false, false))] });
    expect(m.factsAsked).toBe(0);
    expect(m.questionsWithoutRecommendation).toBe(1);
  });

  it('an unparsable reply fails both for its message, maps no ids and keeps the reply', () => {
    const reply = 'I could not decide.\nno json here';
    const judged = toJudgedMessage(1, 0, reply);
    expect(judged).toEqual({ turn: 1, messageIndex: 0, unparsable: reply });
    const m = measure({ sheet, turns, judged: [judged] });
    expect(m.factsAsked).toBe(1);
    expect(m.questionsWithoutRecommendation).toBe(1);
    expect(m.nothingAssumed.pass).toBe(false);
    expect(m.nothingAssumed.failures.join()).toContain('C1');
  });

  it('a parsable reply becomes the message questions', () => {
    const line = JSON.stringify({ questions: [q(['C1'])] });
    expect(toJudgedMessage(1, 0, `Judged.\n${line}\n`)).toEqual({
      turn: 1,
      messageIndex: 0,
      questions: [q(['C1'])],
    });
  });

  it('measure 5 reports the rounds and questions per message', () => {
    const m = measure({
      sheet,
      turns: [
        turnOf(1, { events: briefCall('open', ['C1', 'C2']) }),
        turnOf(2, { events: [...briefCall('open', ['C3']), ...briefCall('complete')] }),
      ],
      judged: [judgedAt(1, q(['C1']), q(['C2'])), judgedAt(2, q(['C3'])), judgedAt(3)],
    });
    expect(m.rounds).toEqual({ messages: 2, questionsPerMessage: [2, 1], roundSizes: [2, 1] });
  });

  it('FACT_KINDS lists the four kinds of roadmap §3.1', () => {
    expect(FACT_KINDS).toHaveLength(4);
    expect(FACT_KINDS.join(' ')).toContain('eligian_project');
  });
});

describe('bundled questions', () => {
  const ids = ['V3:intro', 'V3:details', 'V3:outro'];
  const views = [
    { name: 'intro', purpose: 'In' },
    { name: 'details', purpose: 'Facts' },
    { name: 'outro', purpose: 'Out' },
  ];
  const sheet = sheetOf(
    Object.fromEntries(ids.map(id => [id, { value: 'none', mode: 'accepts' as const }]))
  );
  const recorded = [ans('S2', views, 'delegated'), ...ids.map(id => ans(id, 'none'))];

  it('one question listing three ids ties all three for measure 2', () => {
    const m = measure({
      sheet,
      turns: [
        turnOf(1, { events: briefCall('open', ids) }),
        turnOf(2, { brief: briefOf(recorded) }),
      ],
      judged: [judgedAt(1, q(ids))],
    });
    expect(m.nothingAssumed).toEqual({ pass: true, failures: [] });
    expect(m.rounds.questionsPerMessage).toEqual([1]);
  });

  it('an id listed by no question of any message fails measure 2', () => {
    const m = measure({
      sheet,
      turns: [
        turnOf(1, { events: briefCall('open', ids) }),
        turnOf(2, { brief: briefOf(recorded) }),
      ],
      judged: [judgedAt(1, q(['V3:intro', 'V3:details']))],
    });
    expect(m.nothingAssumed.pass).toBe(false);
    expect(m.nothingAssumed.failures).toHaveLength(1);
    expect(m.nothingAssumed.failures[0]).toContain('V3:outro');
  });
});

describe('parseJudgeReply', () => {
  const question = { text: 'Which views?', ids: ['S2'], fact: false, recommendation: true };
  const reply = (questions: unknown): string => JSON.stringify({ questions });

  it('reads the last non-empty line as { questions }, ids an array (empty allowed)', () => {
    const empty = { ...question, ids: [] };
    expect(parseJudgeReply(`Some reasoning.\n${reply([question, empty])}\n\n`)).toEqual([
      question,
      empty,
    ]);
    expect(parseJudgeReply(reply([]))).toEqual([]);
  });

  it('is undefined for a single id or an ids that is not an array of strings', () => {
    const { ids: _ids, ...rest } = question;
    expect(parseJudgeReply(reply([{ ...rest, id: 'S2' }]))).toBeUndefined();
    expect(parseJudgeReply(reply([{ ...rest, ids: 'S2' }]))).toBeUndefined();
    expect(parseJudgeReply(reply([{ ...rest, ids: [2] }]))).toBeUndefined();
    expect(parseJudgeReply(reply([{ ...question, fact: 'no' }]))).toBeUndefined();
    expect(parseJudgeReply(JSON.stringify({ questions: 'none' }))).toBeUndefined();
    expect(parseJudgeReply(JSON.stringify([question]))).toBeUndefined();
    expect(parseJudgeReply('not json')).toBeUndefined();
    expect(parseJudgeReply('')).toBeUndefined();
  });
});

describe('measure 6: the changed answer', () => {
  /** vague's sheet played through the engine for `rounds` rounds (the driver's rules 1 and 2). */
  const playVague = (sheet: PersonaSheet, rounds: number): BriefState => {
    const persona = sheetToPersona(sheet);
    const cursors = new Map<string, number>();
    const valueOf = (id: string): { value: unknown; delegated?: boolean } => {
      const entry = persona.answers[id];
      if (entry === undefined) throw new Error(`vague has no answer for ${id}`);
      if (!('values' in entry)) return entry;
      const at = cursors.get(id) ?? 0;
      cursors.set(id, at + 1);
      return entry.values[Math.min(at, entry.values.length - 1)];
    };
    let brief: BriefState = { ...EMPTY_BRIEF, idea: persona.idea };
    for (let n = 0; n < rounds; n++) {
      const round = pickRound(TREE, evaluate(TREE, brief, FACTS), 7);
      const input: AnswerInput[] = round.map(item => {
        const { value, delegated } = valueOf(item.id);
        return delegated === true ? { id: item.id, value, delegated } : { id: item.id, value };
      });
      brief = applyAnswers(TREE, brief, FACTS, input, nextRound(brief)).brief;
    }
    return brief;
  };

  /** FR-041 item 6 written out: the change, then review-and-evaluate to a fixpoint. */
  const fixpoint = (
    before: BriefState,
    change: readonly { id: string; value: unknown }[]
  ): { collected: string[]; changedBrief: BriefState; finalBrief: BriefState } => {
    const changedBrief = applyAnswers(TREE, before, FACTS, change, nextRound(before)).brief;
    let brief = changedBrief;
    const collected: string[] = [];
    for (;;) {
      const stale = evaluate(TREE, brief, FACTS).instances.filter(
        i => i.status === 'stale' && !collected.includes(i.id)
      );
      if (stale.length === 0) break;
      collected.push(...stale.map(i => i.id));
      const review: AnswerInput[] = stale.flatMap(i =>
        i.answer === undefined
          ? []
          : [
              i.answer.by === 'delegated'
                ? { id: i.id, value: i.answer.value, delegated: true }
                : { id: i.id, value: i.answer.value },
            ]
      );
      brief = applyAnswers(TREE, brief, FACTS, review, nextRound(brief)).brief;
    }
    const changed = change.map(c => c.id);
    return {
      collected: collected.filter(id => !changed.includes(id)),
      changedBrief,
      finalBrief: brief,
    };
  };

  /** The dependents of vague's script, measured on 2026-11-20 (FR-041 item 6). */
  const MEASURED = [
    'S3',
    'S4',
    'S5',
    'S6',
    'S8',
    'I3',
    'D5',
    'W2',
    'V1:details',
    'V2:details',
    'V3:details',
    'V4:details',
    'V5:details',
    'V6:details',
    'I4',
    'X3',
  ];

  const setup = () => {
    const sheet = readSheet('vague');
    const script = sheet.script[0];
    expect(script.afterRound).toBe(8);
    const beforeText = textOf(playVague(sheet, 8));
    const before = parseBrief(beforeText);
    expect(before.ignored).toEqual([]);
    const loop = fixpoint(before.brief, script.answers);
    return { sheet, script, beforeText, before, loop };
  };

  it('changedAnswerDependents is the review-and-evaluate fixpoint of FR-041 item 6', () => {
    const { script, before, loop } = setup();
    const dependents = changedAnswerDependents(before, { answers: script.answers }, FACTS);
    expect(dependents).toEqual(loop.collected);
    expect(dependents).toEqual(MEASURED);
    // The details view's V answers wait behind S6 and go stale only on the second pass.
    const first = evaluate(TREE, loop.changedBrief, FACTS).instances;
    expect(first.find(i => i.id === 'V1:details')?.status).toBe('waiting');
    for (let n = 1; n <= 6; n++) expect(dependents).toContain(`V${n}:details`);
  });

  /** Turn 5 received round 8 (the script's turn); 6 records the change; 7 the reviews. */
  const turnsFor = (beforeText: string, changed: BriefState, final: BriefState): TurnData[] => [
    turnOf(5, { brief: beforeText }),
    turnOf(6, { brief: textOf(changed) }),
    turnOf(7, { brief: textOf(final) }),
  ];

  it('passes when every dependent is asked after script.turn and S2, C4 hold the script', () => {
    const { sheet, beforeText, loop } = setup();
    const views = MEASURED.filter(id => id.startsWith('V'));
    const others = MEASURED.filter(id => !id.startsWith('V'));
    const m = measure({
      sheet,
      turns: turnsFor(beforeText, loop.changedBrief, loop.finalBrief),
      judged: [judgedAt(4, q(MEASURED)), judgedAt(6, q(others)), judgedAt(7, q(views))],
      script: { turn: 5, roundCount: 8 },
    });
    expect(m.changedAnswer).toEqual({ pass: true, dependents: MEASURED, notReasked: [] });
  });

  it('fails with only a reviewed mark and no message asking again', () => {
    const { sheet, beforeText, loop } = setup();
    const changeRound = nextRound(parseBrief(beforeText).brief);
    const finalAnswers = parseBrief(textOf(loop.finalBrief)).brief.answers;
    for (const id of MEASURED) {
      expect(finalAnswers.find(a => a.id === id)?.reviewed, id).toBeGreaterThan(changeRound);
    }
    const m = measure({
      sheet,
      turns: turnsFor(beforeText, loop.changedBrief, loop.finalBrief),
      judged: [judgedAt(5, q(MEASURED))],
      script: { turn: 5, roundCount: 8 },
    });
    expect(m.changedAnswer?.pass).toBe(false);
    expect(m.changedAnswer?.notReasked).toEqual(MEASURED);
  });

  it('fails when a changed answer does not hold the script value', () => {
    const { sheet, beforeText, loop } = setup();
    const m = measure({
      sheet,
      turns: turnsFor(beforeText, loop.changedBrief, parseBrief(beforeText).brief),
      judged: [judgedAt(6, q(MEASURED))],
      script: { turn: 5, roundCount: 8 },
    });
    expect(m.changedAnswer?.pass).toBe(false);
    expect(m.changedAnswer?.reason).toContain('C4');
  });

  /** vague's sheet with its views named as the agent of run 1 named them (keys and values). */
  const capitalised = (sheet: PersonaSheet): PersonaSheet => {
    const rename = new Map([
      ['overview', 'Overview'],
      ['details', 'Details'],
    ]);
    const walk = (value: unknown): unknown => {
      if (typeof value === 'string') return rename.get(value) ?? value;
      if (Array.isArray(value)) return value.map(walk);
      if (typeof value !== 'object' || value === null) return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key.replace(/:(overview|details)$/, (_, view: string) => `:${rename.get(view)}`),
          walk(item),
        ])
      );
    };
    return walk(sheet) as PersonaSheet;
  };

  it('SC-026: the script S2 [overview, details] holds against a recorded [Overview, Details]', () => {
    const sheet = readSheet('vague');
    const named = capitalised(sheet);
    const beforeText = textOf(playVague(named, 8));
    const loop = fixpoint(parseBrief(beforeText).brief, named.script[0].answers);
    const finalS2 = loop.finalBrief.answers.find(a => a.id === 'S2')?.value;
    expect(finalS2).toEqual([
      { name: 'Overview', purpose: 'The office' },
      { name: 'Details', purpose: 'Where the rooms and desks are' },
    ]);
    const dependents = MEASURED.map(id => id.replace(/:details$/, ':Details'));
    expect(loop.collected).toEqual(dependents);
    const m = measure({
      sheet,
      turns: turnsFor(beforeText, loop.changedBrief, loop.finalBrief),
      judged: [judgedAt(6, q(dependents))],
      script: { turn: 5, roundCount: 8 },
    });
    expect(m.changedAnswer).toEqual({ pass: true, dependents, notReasked: [] });
  });

  it('fails script-not-applied when the record has script: null', () => {
    const { sheet, beforeText } = setup();
    const m = measure({ sheet, turns: [turnOf(5, { brief: beforeText })], script: null });
    expect(m.changedAnswer).toEqual({
      pass: false,
      dependents: [],
      notReasked: [],
      reason: 'script-not-applied',
    });
  });

  it('is absent for a persona without a script', () => {
    expect(measure({ turns: [] }).changedAnswer).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// SC-026 (FR-049, FR-050): the run-1 measure fixes. View names are matched, not spelled; a stated
// table holds when the sheet's rows are among the recorded ones.

describe('SC-026: view names matched, stated tables as a subset', () => {
  const views = (...names: string[]) => names.map(name => ({ name, purpose: `The ${name} view` }));
  const briefWith = (...names: string[]): BriefState => ({
    ...EMPTY_BRIEF,
    answers: [ans('S2', views(...names), 'delegated')],
  });

  it('viewMap: the same name, else ignoring case, else the same S2 position', () => {
    const sheet = sheetOf({
      S2: { value: views('hours'), mode: 'states' },
      'V1:hours': { value: 'When we are open.', mode: 'states' },
    });
    expect(viewMap(sheet, briefWith('hours'))).toEqual(new Map([['hours', 'hours']]));
    expect(viewMap(sheet, briefWith('Hours'))).toEqual(new Map([['hours', 'Hours']]));
    expect(viewMap(sheet, briefWith('SupportHours'))).toEqual(new Map([['hours', 'SupportHours']]));
    expect(viewMap(sheet, EMPTY_BRIEF)).toEqual(new Map());

    // Name and case matches come first; a brief view is taken once; no row left, no match.
    const two = sheetOf({ S2: { value: views('intro', 'hours'), mode: 'states' } });
    expect(viewMap(two, briefWith(' Hours', 'Intro'))).toEqual(
      new Map([
        ['intro', 'Intro'],
        ['hours', ' Hours'],
      ])
    );
    expect(viewMap(two, briefWith('hours', 'Start'))).toEqual(new Map([['hours', 'hours']]));
    expect(viewMap(two, briefWith('Start'))).toEqual(new Map([['intro', 'Start']]));

    // Without S2 on the sheet, the views are the names in its `V<n>:<view>` ids.
    const idsOnly = sheetOf({
      'V1:hours': { value: 'When we are open.', mode: 'states' },
      'V2:hours': { value: 'Hours', mode: 'states' },
    });
    expect(viewMap(idsOnly, briefWith('SupportHours'))).toEqual(
      new Map([['hours', 'SupportHours']])
    );
  });

  it('a sheet keyed V1:hours measures V1:Hours (case) and V1:SupportHours (position)', () => {
    const sheet = sheetOf({
      S2: { value: views('hours'), mode: 'states' },
      'V1:hours': { value: 'When we are open.', mode: 'states' },
    });
    for (const name of ['Hours', 'SupportHours']) {
      const id = `V1:${name}`;
      const m = exchange(sheet, ['S2', id], [ans('S2', views(name)), ans(id, 'Our hours.')]);
      expect(m, name).toEqual({ pass: true, failures: [] });
    }
    // An unmatched sheet view keeps its own name and fails as before.
    const m = exchange(sheet, ['V1:Hours'], [ans('V1:Hours', 'Our hours.')]);
    expect(m.pass).toBe(false);
    expect(m.failures.join()).toContain('V1:hours');
  });

  it('an S5 row { view: "hours" } equals a recorded { view: "Hours" }', () => {
    const sheet = sheetOf({
      S2: { value: views('hours'), mode: 'states' },
      S5: { value: [{ view: 'hours', end: 'stay' }], mode: 'states' },
    });
    const recorded = (end: string) => [
      ans('S2', views('Hours')),
      ans('S5', [{ view: 'Hours', end }]),
    ];
    expect(exchange(sheet, ['S2', 'S5'], recorded('stay'))).toEqual({ pass: true, failures: [] });
    const other = exchange(sheet, ['S2', 'S5'], recorded('loop'));
    expect(other.pass).toBe(false);
    expect(other.failures.join()).toContain('S5');
  });

  it('a stated S4 holds against its rows plus a back link, and fails with one missing', () => {
    const rows = [
      { view: 'intro', target: 'hours', trigger: 'a Next button' },
      { view: 'hours', target: 'contact', trigger: 'a Next button' },
      { view: 'contact', target: 'intro', trigger: 'a Restart button' },
    ];
    const sheet = sheetOf({ S4: { value: rows, mode: 'states' } });
    const s2 = ans('S2', views('intro', 'hours', 'contact'), 'delegated');
    const back = { view: 'hours', target: 'intro', trigger: 'a Back button' };
    const plusBack = exchange(sheet, ['S4'], [s2, ans('S4', [...rows, back])]);
    expect(plusBack).toEqual({ pass: true, failures: [] });
    // Key text ignores case (the trigger is a text column: not compared).
    const recased = rows.map(row => ({ ...row, target: row.target.toUpperCase(), trigger: 'x' }));
    expect(exchange(sheet, ['S4'], [s2, ans('S4', [...recased, back])]).pass).toBe(true);
    const missing = exchange(sheet, ['S4'], [s2, ans('S4', [rows[0], rows[1], back])]);
    expect(missing.pass).toBe(false);
    expect(missing.failures.join()).toContain('S4');
  });

  it('a stated record and the other kinds stay exact', () => {
    const value = { choice: 'fixed-ratio', detail: '16:9' };
    const sheet = sheetOf({ D4: { value, mode: 'states' } });
    const recased = { choice: 'Fixed-Ratio', detail: '16:9' };
    expect(exchange(sheet, ['D4'], [ans('D4', recased)]).pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// SC-027, the simulated-user half (FR-051): the prompt keeps the simulated user on its sheet.

describe('simulated-user.md (FR-051)', () => {
  const text = fs.readFileSync(path.join(REPO, 'evals', 'mcp', 'simulated-user.md'), 'utf8');
  /** The prompt's sentences: paragraphs and list items split at a sentence end. */
  const sentences = text
    .split(/\n\s*\n|\n- /)
    .flatMap(block => block.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/))
    .map(sentence => sentence.trim())
    .filter(sentence => sentence !== '');

  it('says "anything else" only in one sentence, which forbids it', () => {
    const containing = sentences.filter(sentence => /anything else/i.test(sentence));
    expect(containing).toHaveLength(1);
    expect(containing[0]).toMatch(/\b(never|forbidden)\b/i);
  });

  it('names the four answer forms, in order of the numbered questions', () => {
    const line = (mode: string): string =>
      sentences.find(sentence => sentence.includes(`\`${mode}\``)) ?? '';
    expect(line('states')).toMatch(/whole value/);
    expect(line('decides')).toContain('exactly "you decide"');
    expect(line('accepts')).toContain('"yes"');
    expect(line('accepts')).toMatch(/even when|also when/);
    expect(text).toMatch(/not on the sheet[^.]*"you decide"/);
    expect(text).toMatch(/each numbered question[^.]*in order/i);
  });

  it('allows no remark after the answers but the changed-mind block and the confirm line', () => {
    expect(text).toMatch(/no remark/i);
    expect(text).toContain('changed your mind');
    expect(text).toContain('{"confirm": true}');
    expect(text).toContain('{"confirm": false}');
    expect(text).toMatch(/never volunteer/i);
  });
});

describe('interviewPass (R-11)', () => {
  const passing: InterviewMeasures = {
    noGenerationBeforeApproval: { pass: true, failures: [] },
    nothingAssumed: { pass: true, failures: [] },
    factsAsked: 0,
    questionsWithoutRecommendation: 0,
    rounds: { messages: 3, questionsPerMessage: [2, 2, 1], roundSizes: [3, 2] },
  };
  const failed = { pass: false, failures: ['x'] };
  const passes = (m: InterviewMeasures, persona: PersonaName = 'terse'): boolean =>
    interviewPass(m, persona, false, true);

  it('passes when not aborted, approved and measures 1 to 4 hold', () => {
    expect(passes(passing)).toBe(true);
    expect(passes(passing, 'detailed')).toBe(true);
  });

  it('fails when aborted or not approved', () => {
    expect(interviewPass(passing, 'terse', true, true)).toBe(false);
    expect(interviewPass(passing, 'terse', false, false)).toBe(false);
  });

  it('fails on each of measures 1 to 4', () => {
    expect(passes({ ...passing, noGenerationBeforeApproval: failed })).toBe(false);
    expect(passes({ ...passing, nothingAssumed: failed })).toBe(false);
    expect(passes({ ...passing, factsAsked: 1 })).toBe(false);
    expect(passes({ ...passing, questionsWithoutRecommendation: 1 })).toBe(false);
  });

  it('needs measure 6 for vague only; measure 5 is reported, not a condition', () => {
    const changed = { pass: true, dependents: ['S3'], notReasked: [] };
    const notApplied = {
      pass: false,
      dependents: [],
      notReasked: [],
      reason: 'script-not-applied',
    };
    expect(passes(passing, 'vague')).toBe(false);
    expect(passes({ ...passing, changedAnswer: changed }, 'vague')).toBe(true);
    expect(passes({ ...passing, changedAnswer: notApplied }, 'vague')).toBe(false);
    expect(passes({ ...passing, changedAnswer: notApplied }, 'terse')).toBe(true);
    const many = { ...passing, rounds: { messages: 30, questionsPerMessage: [], roundSizes: [] } };
    expect(passes(many)).toBe(true);
  });
});

describe('interviewVerdict (FR-043)', () => {
  const PASS = { pass: true, aborted: false };
  const FAIL = { pass: false, aborted: false };
  const ABORTED = { pass: false, aborted: true };

  it('(pass, fail, pass) passes', () => {
    expect(interviewVerdict([PASS, FAIL, PASS])).toEqual({ pass: true, passed: 2, of: 3 });
  });

  it('(fail, fail, pass) fails', () => {
    expect(interviewVerdict([FAIL, FAIL, PASS])).toEqual({ pass: false, passed: 1, of: 3 });
  });

  it('(pass, aborted, aborted) fails: aborted runs stay in the denominator', () => {
    expect(interviewVerdict([PASS, ABORTED, ABORTED])).toEqual({ pass: false, passed: 1, of: 3 });
  });

  it('(pass, pass, aborted) passes', () => {
    expect(interviewVerdict([PASS, PASS, ABORTED])).toEqual({ pass: true, passed: 2, of: 3 });
  });
});

// ---------------------------------------------------------------------------------------------
// T022 (FR-034 to FR-036, FR-039, FR-043, SC-020, SC-023 record; plan §9 `runInterview`, P13,
// P15): the stop rule, the two prompts, the turn loop with a fake runner, the record and the
// summary. The fake agent turn writes real `BRIEF.md` texts: the terse brief at `complete`,
// signed `confirmed` by `confirmBriefFixture`, and `approved` by the server (`approvedBrief`).

describe('interviewStop (SC-020)', () => {
  const MIN = 60_000;

  it('approved at turn 3 is approved', () => {
    expect(interviewStop({ state: 'approved', agentTurns: 3, elapsedMs: MIN })).toBe('approved');
  });

  it('complete at 30 turns is turn-limit', () => {
    expect(interviewStop({ state: 'complete', agentTurns: 30, elapsedMs: 10 * MIN })).toBe(
      'turn-limit'
    );
  });

  it('open at 12 turns and 30 min is time-limit', () => {
    expect(interviewStop({ state: 'open', agentTurns: 12, elapsedMs: 30 * MIN })).toBe(
      'time-limit'
    );
  });

  it('approved at 30 turns and 30 min is approved (precedence)', () => {
    expect(interviewStop({ state: 'approved', agentTurns: 30, elapsedMs: 30 * MIN })).toBe(
      'approved'
    );
  });

  it('open at 29 turns and 29 min goes on', () => {
    expect(interviewStop({ state: 'open', agentTurns: 29, elapsedMs: 29 * MIN })).toBeUndefined();
    expect(interviewStop({ state: 'none', agentTurns: 1, elapsedMs: 0 })).toBeUndefined();
  });
});

describe('the prompts are pure', () => {
  const sheet = sheetOf({ C4: { value: 'on', mode: 'states' } }, [
    { afterRound: 1, answers: [{ id: 'C4', value: 'off' }] },
  ]);
  const conversation: ConversationEntry[] = [
    { role: 'user', turn: 1, text: 'Hello.' },
    { role: 'agent', turn: 1, text: 'Should the menu be on?' },
  ];

  it('simulatedUserPrompt holds the template, the sheet, the conversation and the last message', () => {
    const input = {
      template: 'USER TEMPLATE',
      sheet,
      conversation,
      last: 'Should the menu be on?',
    };
    const text = simulatedUserPrompt(input);
    expect(text).toBe(simulatedUserPrompt(input));
    expect(text.startsWith('USER TEMPLATE')).toBe(true);
    expect(text).toContain('"C4"');
    expect(text).toContain('"mode": "states"');
    expect(text).toContain('Hello.');
    expect(text).toContain('Should the menu be on?');
    expect(text).not.toContain('In this reply, also tell the agent you changed your mind:');
    // the script is the harness's to fire, never the model's to count (FR-039)
    expect(text).not.toContain('afterRound');
  });

  it('a fired script adds the changed-mind line and its answers', () => {
    const text = simulatedUserPrompt({
      template: 'USER TEMPLATE',
      sheet,
      conversation,
      last: 'Anything else?',
      change: { answers: [{ id: 'C4', value: 'off' }] },
    });
    expect(text).toContain('In this reply, also tell the agent you changed your mind:');
    const after = text.slice(text.indexOf('changed your mind:'));
    expect(after).toContain('C4');
    expect(after).toContain('"off"');
  });

  it('judgePrompt holds FACT_KINDS, the inventory, the round items and the message', () => {
    const round = [{ id: 'C1', title: 'Pacing', ask: 'Self-paced or timed?' }];
    const input = {
      template: 'JUDGE TEMPLATE',
      facts: FACT_KINDS,
      inventory: 'INVENTORY: #stage, .title',
      files: ['BRIEF.md', 'styles.css'],
      round,
      message: 'Should it be self-paced? I recommend self-paced.',
    };
    const text = judgePrompt(input);
    expect(text).toBe(judgePrompt(input));
    expect(text.startsWith('JUDGE TEMPLATE')).toBe(true);
    for (const kind of FACT_KINDS) expect(text).toContain(kind);
    expect(text).toContain('INVENTORY: #stage, .title');
    expect(text).toContain('styles.css');
    expect(text).toContain('C1');
    expect(text).toContain('Self-paced or timed?');
    expect(text).toContain('Should it be self-paced? I recommend self-paced.');
    expect(text).not.toContain('eligian_project not called');
  });

  it('judgePrompt says eligian_project not called without an inventory', () => {
    const text = judgePrompt({
      template: 'JUDGE TEMPLATE',
      facts: FACT_KINDS,
      inventory: undefined,
      files: [],
      round: [],
      message: 'Hello.',
    });
    expect(text).toContain('eligian_project not called');
  });
});

describe('runInterview with a fake runner', () => {
  const SIGNED_AT = new Date('2026-11-20T00:00:00Z');
  /** The signing state dir, the three texts of the terse brief, and its storyboard. */
  let stateDir: string;
  let COMPLETE: string;
  let CONFIRMED: string;
  let APPROVED: string;
  let STORYBOARD: string;
  const kept: string[] = [];

  const keptDir = (prefix: string): string => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    kept.push(dir);
    return dir;
  };

  beforeAll(async () => {
    const dir = keptDir('eligian-interview-approved-');
    stateDir = path.join(keptDir('eligian-interview-state-'), 'state');
    const server = await startInMemoryServer({ cwd: dir, docsRoot: DOCS, brief: { stateDir } });
    try {
      await approvedBrief(server, dir, { stateDir });
    } finally {
      await server.close();
    }
    APPROVED = fs.readFileSync(path.join(dir, 'BRIEF.md'), 'utf8');
    STORYBOARD = fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8');
    const { confirmation: _c, approval: _a, ...unsigned } = parseBrief(APPROVED).brief;
    COMPLETE = textOf(unsigned);
    const confirmed = await confirmBriefFixture(COMPLETE, dir, stateDir, SIGNED_AT);
    if (!('text' in confirmed)) throw new Error(confirmed.error);
    CONFIRMED = confirmed.text;
  }, 120_000);

  afterAll(() => {
    for (const dir of kept.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  interface FakeTurn {
    readonly events?: readonly unknown[];
    /** `null`: no `result` event. */
    readonly result?: string | null;
    readonly brief?: string;
    readonly started?: boolean;
    readonly wallMs?: number;
  }

  interface Seen {
    readonly message: string;
    readonly sessionId: string | undefined;
    readonly turn: number;
    readonly conversation: ConversationEntry[];
  }

  const setupRun = (
    turns: readonly FakeTurn[],
    options: {
      sheet?: PersonaSheet;
      persona?: PersonaName;
      reply?: (prompt: string) => string | undefined;
      judge?: (prompt: string) => string | undefined;
    } = {}
  ) => {
    const projectDir = tempDir('eligian-interview-project-');
    fs.writeFileSync(path.join(projectDir, 'STORYBOARD.md'), STORYBOARD);
    const scratch = tempDir('eligian-interview-scratch-');
    const outDir = path.join(tempDir('eligian-interview-results-'), 'interview');
    const sheet = options.sheet ?? sheetOf({}, []);
    const run: InterviewRun = {
      runId: 'run-22',
      persona: options.persona ?? 'terse',
      n: 1,
      sheet: { ...sheet, opening: 'I want a short deck about our new office.' },
      model: 'claude-agent',
      userModel: 'claude-user',
      cliVersion: '1.2.0',
      projectDir,
      stateDir,
      scratch,
      outDir,
      mcpLog: path.join(scratch, 'mcp.log'),
      isolation: agentIsolation(['p@q']),
      prompts: { simulatedUser: 'SIMULATED USER TEMPLATE', judge: 'JUDGE TEMPLATE' },
    };
    const conversationFile = path.join(scratch, 'interview', 'conversation.json');
    const seen: Seen[] = [];
    const userPrompts: string[] = [];
    const judgePrompts: string[] = [];
    const stdouts: string[] = [];
    const deps: InterviewDeps = {
      agentTurn: async ({ message, sessionId, turn }) => {
        seen.push({
          message,
          sessionId,
          turn,
          conversation: JSON.parse(fs.readFileSync(conversationFile, 'utf8')),
        });
        const fake = turns[Math.min(turn, turns.length) - 1];
        if (fake.brief !== undefined) {
          fs.writeFileSync(path.join(projectDir, 'BRIEF.md'), fake.brief);
        }
        if (fake.started === false) return { stdout: '', started: false, wallMs: 0 };
        const result = {
          type: 'result',
          result: fake.result ?? `agent message ${turn}`,
          session_id: 'session-22',
          usage: { input_tokens: 10, output_tokens: 5 },
        };
        const events = [...(fake.events ?? []), ...(fake.result === null ? [] : [result])];
        const stdout = JSON.stringify(events);
        stdouts.push(stdout);
        return { stdout, started: true, wallMs: fake.wallMs ?? 1000 };
      },
      userReply: async prompt => {
        userPrompts.push(prompt);
        return options.reply === undefined
          ? `user reply ${userPrompts.length}`
          : options.reply(prompt);
      },
      judge: async prompt => {
        judgePrompts.push(prompt);
        return options.judge === undefined
          ? JSON.stringify({ questions: [] })
          : options.judge(prompt);
      },
      parseTranscript,
    };
    return { run, deps, seen, userPrompts, judgePrompts, stdouts, outDir };
  };

  it('the fixture texts are complete, confirmed and approved with the key', async () => {
    const project = tempDir('eligian-interview-states-');
    fs.writeFileSync(path.join(project, 'STORYBOARD.md'), STORYBOARD);
    for (const [text, state] of [
      [COMPLETE, 'complete'],
      [CONFIRMED, 'confirmed'],
      [APPROVED, 'approved'],
    ] as const) {
      fs.writeFileSync(path.join(project, 'BRIEF.md'), text);
      expect(await briefStateOf(project, stateDir)).toBe(state);
    }
  });

  it('turn 1 sends the opening verbatim as a plain message; later turns resume with the reply', async () => {
    const { run, deps, seen } = setupRun([
      { brief: COMPLETE },
      { brief: CONFIRMED },
      { brief: APPROVED },
    ]);
    await runInterview(run, deps);
    expect(seen[0].message).toBe(run.sheet.opening);
    expect(seen[0].message.startsWith('/')).toBe(false);
    expect(seen[0].sessionId).toBeUndefined();
    expect(seen[0].turn).toBe(1);
    expect(seen[1]).toMatchObject({ message: 'user reply 1', sessionId: 'session-22', turn: 2 });
  });

  it('stops at the first approved turn', async () => {
    const { run, deps, seen, userPrompts } = setupRun([
      { brief: COMPLETE },
      { brief: CONFIRMED },
      { brief: APPROVED },
      { brief: COMPLETE },
    ]);
    const record = await runInterview(run, deps);
    expect(seen).toHaveLength(3);
    expect(userPrompts).toHaveLength(2);
    expect(record).toMatchObject({
      turns: 3,
      endReason: 'approved',
      aborted: false,
      approved: true,
      replies: ['user reply 1', 'user reply 2'],
    });
    expect(record.wallMs).toBe(3000);
    expect(record.usage).toEqual({ input_tokens: 30, output_tokens: 15 });
    // one judge call per agent turn with a message (P13)
    expect(record.judged.map(judged => judged.turn)).toEqual([1, 2, 3]);
  });

  it('a turn without a result aborts', async () => {
    const { run, deps, seen } = setupRun([{ brief: COMPLETE }, { result: null }]);
    const record = await runInterview(run, deps);
    expect(seen).toHaveLength(2);
    expect(record).toMatchObject({ aborted: true, endReason: 'aborted', pass: false, turns: 2 });
    expect(record.failures.join('\n')).toContain('turn 2');
  });

  it('a turn whose claude did not start aborts', async () => {
    const { run, deps } = setupRun([{ started: false }]);
    const record = await runInterview(run, deps);
    expect(record).toMatchObject({ aborted: true, endReason: 'aborted', pass: false, turns: 1 });
    expect(record.failures.join('\n')).toContain('did not start');
  });

  it('a missing user reply aborts (P15, the cause in failures)', async () => {
    const { run, deps, seen } = setupRun([{ brief: COMPLETE }], { reply: () => undefined });
    const record = await runInterview(run, deps);
    expect(seen).toHaveLength(1);
    expect(record).toMatchObject({ aborted: true, endReason: 'aborted', pass: false });
    expect(record.failures.join('\n')).toContain('simulated user');
  });

  it('time-limit ends the run once the agent turns took 30 minutes', async () => {
    const { run, deps, seen } = setupRun([{ brief: COMPLETE, wallMs: 30 * 60_000 }]);
    const record = await runInterview(run, deps);
    expect(seen).toHaveLength(1);
    expect(record).toMatchObject({ endReason: 'time-limit', aborted: false, pass: false });
  });

  it('writes conversation.json before each turn and the result files', async () => {
    const { run, deps, seen, stdouts, outDir } = setupRun([
      { brief: COMPLETE },
      { brief: CONFIRMED },
      { brief: APPROVED },
    ]);
    await runInterview(run, deps);
    expect(seen[0].conversation).toEqual([{ role: 'user', turn: 1, text: run.sheet.opening }]);
    expect(seen[1].conversation).toEqual([
      { role: 'user', turn: 1, text: run.sheet.opening },
      { role: 'agent', turn: 1, text: 'agent message 1' },
      { role: 'user', turn: 2, text: 'user reply 1' },
    ]);
    expect(seen[2].conversation).toHaveLength(5);
    for (const k of [1, 2, 3]) {
      expect(fs.readFileSync(path.join(outDir, `terse-1.turn-${k}.json`), 'utf8')).toBe(
        stdouts[k - 1]
      );
    }
    expect(fs.readFileSync(path.join(outDir, 'terse-1.brief-1.md'), 'utf8')).toBe(COMPLETE);
    expect(fs.readFileSync(path.join(outDir, 'terse-1.brief-2.md'), 'utf8')).toBe(CONFIRMED);
    expect(fs.readFileSync(path.join(outDir, 'terse-1.brief-3.md'), 'utf8')).toBe(APPROVED);
    expect(fs.existsSync(path.join(outDir, 'terse-1.json'))).toBe(true);
  });

  it('fires the script after the round count reaches afterRound', async () => {
    const sheet = sheetOf({ C4: { value: 'on', mode: 'states' } }, [
      { afterRound: 2, answers: [{ id: 'C4', value: 'off' }] },
    ]);
    const { run, deps, userPrompts } = setupRun(
      [
        { brief: COMPLETE, events: briefCall('open', ['C4']) },
        { brief: COMPLETE, events: [...briefCall('open', ['C5']), ...briefCall('complete')] },
        { brief: CONFIRMED, events: briefCall('open', ['C6']) },
        { brief: APPROVED },
      ],
      { sheet, persona: 'vague' }
    );
    const record = await runInterview(run, deps);
    const line = 'In this reply, also tell the agent you changed your mind:';
    expect(userPrompts).toHaveLength(3);
    expect(userPrompts[0]).not.toContain(line);
    expect(userPrompts[1]).toContain(line);
    expect(userPrompts[1].slice(userPrompts[1].indexOf(line))).toContain('C4');
    expect(userPrompts[2]).not.toContain(line);
    expect(record.script).toEqual({ turn: 2, roundCount: 2 });
    expect(record.measures.changedAnswer).toBeDefined();
  });

  it('a run whose count never reaches afterRound records script: null', async () => {
    const sheet = sheetOf({}, [{ afterRound: 8, answers: [{ id: 'C4', value: 'off' }] }]);
    const { run, deps } = setupRun(
      [{ brief: COMPLETE, events: briefCall('open', ['C4']) }, { brief: APPROVED }],
      { sheet, persona: 'vague' }
    );
    const record = await runInterview(run, deps);
    expect(record.script).toBeNull();
    expect(record.measures.changedAnswer?.reason).toBe('script-not-applied');
    expect(record.pass).toBe(false);
  });

  it('the judge reads the inventory, the files, the round and the message of each turn', async () => {
    const { run, deps, judgePrompts } = setupRun(
      [
        {
          brief: COMPLETE,
          events: briefCall('open', ['C1']),
          result: 'Self-paced? I recommend it.',
        },
        {
          brief: APPROVED,
          events: call('mcp__eligian__eligian_project', {}, 'INVENTORY: #stage'),
        },
      ],
      {
        judge: prompt =>
          prompt.includes('Self-paced?')
            ? `ok\n${JSON.stringify({ questions: [q(['C1'])] })}`
            : undefined,
      }
    );
    const record = await runInterview(run, deps);
    expect(judgePrompts).toHaveLength(2);
    expect(judgePrompts[0].startsWith('JUDGE TEMPLATE')).toBe(true);
    expect(judgePrompts[0]).toContain('eligian_project not called');
    expect(judgePrompts[0]).toContain('C1');
    expect(judgePrompts[0]).toContain('Self-paced? I recommend it.');
    expect(judgePrompts[1]).toContain('INVENTORY: #stage');
    // the file list taken after turn 1
    expect(judgePrompts[1]).toContain('BRIEF.md');
    expect(record.judged[0]).toEqual({ turn: 1, messageIndex: 1, questions: [q(['C1'])] });
    expect(record.judged[1]).toEqual({ turn: 2, messageIndex: 3, unparsable: '' });
    expect(record.failures.join('\n')).toContain('judge');
    expect(record.measures.factsAsked).toBe(1);
  });

  it('the record carries run.isolation, and decodes from <persona>-<n>.json', async () => {
    const { run, deps, outDir } = setupRun([{ brief: APPROVED }]);
    const record = await runInterview(run, deps);
    expect(record.isolation).toEqual(run.isolation);
    expect(record).toMatchObject({
      runId: 'run-22',
      persona: 'terse',
      n: 1,
      model: 'claude-agent',
      userModel: 'claude-user',
      cliVersion: '1.2.0',
    });
    const file: unknown = JSON.parse(fs.readFileSync(path.join(outDir, 'terse-1.json'), 'utf8'));
    const decoded = Schema.decodeUnknownSync(InterviewRecordSchema)(file);
    expect(decoded.isolation).toEqual(run.isolation);
    expect(decoded).toEqual(record);
  });

  it('a rejected agent turn aborts with its error in failures', async () => {
    const { run, deps } = setupRun([{ brief: COMPLETE }]);
    const record = await runInterview(run, {
      ...deps,
      agentTurn: async () => {
        throw new Error('spawn exploded');
      },
    });
    expect(record).toMatchObject({ aborted: true, endReason: 'aborted', turns: 1, judged: [] });
    expect(record.failures.join('\n')).toContain('spawn exploded');
  });

  it('a rejected simulated user aborts with its error in failures', async () => {
    const { run, deps } = setupRun([{ brief: COMPLETE }]);
    const record = await runInterview(run, {
      ...deps,
      userReply: async () => {
        throw new Error('user model gone');
      },
    });
    expect(record).toMatchObject({ aborted: true, endReason: 'aborted', turns: 1 });
    expect(record.failures.join('\n')).toContain('simulated user: user model gone');
  });

  it('a rejected judge call is an unparsable message', async () => {
    const { run, deps } = setupRun([{ brief: APPROVED }]);
    const record = await runInterview(run, {
      ...deps,
      judge: async () => {
        throw new Error('judge gone');
      },
    });
    expect(record.judged).toEqual([{ turn: 1, messageIndex: 1, unparsable: '' }]);
    expect(record.failures.join('\n')).toContain('judge: no reply for agent turn 1');
  });

  it('a result without text is an empty agent message, not judged; node_modules is not listed', async () => {
    const noText = { type: 'result', subtype: 'error_max_turns', session_id: 'session-22' };
    const { run, deps, seen, judgePrompts } = setupRun([
      { brief: COMPLETE, events: [noText], result: null },
      { brief: APPROVED },
    ]);
    fs.mkdirSync(path.join(run.projectDir, 'node_modules', 'eligian'), { recursive: true });
    fs.writeFileSync(path.join(run.projectDir, 'node_modules', 'eligian', 'package.json'), '{}');
    fs.mkdirSync(path.join(run.projectDir, 'media'));
    fs.writeFileSync(path.join(run.projectDir, 'media', 'intro.mp4'), '');
    const record = await runInterview(run, deps);
    expect(record).toMatchObject({ aborted: false, endReason: 'approved', turns: 2 });
    expect(seen[1].conversation[1]).toEqual({ role: 'agent', turn: 1, text: '' });
    expect(record.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(record.judged.map(judged => judged.turn)).toEqual([2]);
    expect(judgePrompts[0]).toContain('media/intro.mp4');
    expect(judgePrompts[0]).not.toContain('node_modules');
  });
});

describe('parsePersonaSheet names the bad key', () => {
  const valid = {
    idea: 'An idea.',
    opening: 'Hello.',
    answers: {
      C4: { value: 'on', mode: 'states' },
      S3: { values: [{ value: 'nowhere', mode: 'states' }] },
    },
    script: [{ afterRound: 2, answers: [{ id: 'C4', value: 'off' }] }],
  };

  it.each([
    ['the sheet', null, 'the sheet is not an object'],
    ['answers', { ...valid, answers: [] }, 'answers: not an object'],
    ['an entry', { ...valid, answers: { C4: 'on' } }, 'answers.C4: not an object'],
    ['a value', { ...valid, answers: { C4: { mode: 'states' } } }, 'answers.C4: no value'],
    ['values', { ...valid, answers: { S3: { values: [] } } }, 'answers.S3.values'],
    [
      'a values item',
      { ...valid, answers: { S3: { values: [{ value: 'x', mode: 'perhaps' }] } } },
      'answers.S3.values[0]',
    ],
    ['script', { ...valid, script: {} }, 'script: not a list'],
    ['a script entry', { ...valid, script: [1] }, 'script[0]: not an object'],
    [
      'afterRound',
      { ...valid, script: [{ afterRound: 1.5, answers: [] }] },
      'script[0].afterRound',
    ],
    ['script answers', { ...valid, script: [{ afterRound: 1 }] }, 'script[0].answers'],
    [
      'a script answer',
      { ...valid, script: [{ afterRound: 1, answers: [{ id: 'C4' }] }] },
      'script[0].answers[0]',
    ],
  ])('%s', (_name, json, expected) => {
    const result = parsePersonaSheet(json);
    expect(typeof result).toBe('string');
    expect(result).toContain(expected);
    expect(typeof parsePersonaSheet(valid)).toBe('object');
  });
});

/** A record whose run passed (every measure holds) or failed (one fact asked, measure 2 failed). */
function recordOf(
  persona: PersonaName,
  n: number,
  pass: boolean,
  aborted = false
): InterviewRecord {
  const measures: InterviewMeasures = {
    noGenerationBeforeApproval: { pass: true, failures: [] },
    nothingAssumed: pass ? { pass: true, failures: [] } : { pass: false, failures: ['C1: x'] },
    factsAsked: pass ? 0 : 1,
    questionsWithoutRecommendation: 0,
    rounds: { messages: 4, questionsPerMessage: [2, 2, 1, 1], roundSizes: [3, 3] },
    ...(persona === 'vague'
      ? { changedAnswer: { pass, dependents: ['S3'], notReasked: pass ? [] : ['S3'] } }
      : {}),
  };
  return {
    runId: 'run-22',
    persona,
    n,
    model: 'claude-agent',
    userModel: 'claude-user',
    cliVersion: '1.2.0',
    turns: 6,
    endReason: aborted ? 'aborted' : pass ? 'approved' : 'turn-limit',
    aborted,
    approved: pass,
    pass,
    script: persona === 'vague' ? { turn: 4, roundCount: 8 } : null,
    replies: ['yes'],
    judged: [{ turn: 1, messageIndex: 1, questions: [q(['C1'])] }],
    measures,
    failures: [],
    usage: { input_tokens: 1, output_tokens: 2 },
    isolation: agentIsolation(['p@q']),
    wallMs: 1000,
  };
}

describe('InterviewRecordSchema', () => {
  it('decodes a record; rejects one without isolation or with another endReason', () => {
    const decode = (value: unknown) => Schema.decodeUnknownResult(InterviewRecordSchema)(value);
    const record = recordOf('vague', 1, true);
    expect(decode(record)._tag).toBe('Success');
    const { isolation: _i, ...noIsolation } = record;
    expect(decode(noIsolation)._tag).toBe('Failure');
    expect(decode({ ...record, endReason: 'tired' })._tag).toBe('Failure');
  });
});

describe('renderInterviewSummary', () => {
  const isolation = agentIsolation(['p@q']);
  const cells = (row: string): string[] => row.split('|').map(cell => cell.trim());

  it('one row per persona with passed / of and each measure count', () => {
    const records = [
      recordOf('terse', 1, true),
      recordOf('terse', 2, false),
      recordOf('terse', 3, true),
      recordOf('vague', 1, false, true),
      recordOf('vague', 2, false),
      recordOf('vague', 3, true),
    ];
    const lines = renderInterviewSummary(records, isolation).split('\n');
    const header = lines.find(line => line.startsWith('| Persona'));
    expect(header).toBeDefined();
    const columns = cells(header ?? '');
    const rows = lines.filter(line => /^\| (terse|detailed|vague) \|/.test(line));
    expect(rows.map(row => cells(row)[1])).toEqual(['terse', 'vague']);
    const at = (row: string, column: string): string => cells(row)[columns.indexOf(column)];
    const [terse, vague] = rows;
    expect(at(terse, 'Verdict')).toBe('pass');
    expect(at(terse, 'Passed')).toBe('2/3');
    expect(at(terse, '1 no generation')).toBe('3/3');
    expect(at(terse, '2 nothing assumed')).toBe('2/3');
    expect(at(terse, '3 facts asked')).toBe('1');
    expect(at(terse, '4 no recommendation')).toBe('0');
    expect(at(terse, '5 messages')).toBe('12');
    expect(at(terse, '6 changed answer')).toBe('-');
    expect(at(vague, 'Verdict')).toBe('fail');
    expect(at(vague, 'Passed')).toBe('1/3');
    expect(at(vague, 'Aborted')).toBe('1');
    expect(at(vague, '6 changed answer')).toBe('1/3');
  });

  it('prints the isolation once over three records', () => {
    const records = [
      recordOf('detailed', 1, true),
      recordOf('detailed', 2, true),
      recordOf('detailed', 3, false),
    ];
    const text = renderInterviewSummary(records, isolation);
    expect(text.split('Isolation:').length - 1).toBe(1);
    expect(text).toContain('--setting-sources project,local');
    expect(text).toContain('CLAUDE_CODE_DISABLE_AUTO_MEMORY=1');
  });

  it('one row per run, and no persona row without records', () => {
    const empty = renderInterviewSummary([], isolation);
    expect(empty).toContain('Runs: none');
    expect(empty.split('\n').filter(line => /^\| (terse|detailed|vague) \|/.test(line))).toEqual(
      []
    );
    const noRounds = {
      ...recordOf('vague', 2, false),
      measures: {
        ...recordOf('vague', 2, false).measures,
        rounds: { messages: 0, questionsPerMessage: [], roundSizes: [] },
      },
    };
    const lines = renderInterviewSummary([recordOf('vague', 1, true), noRounds], isolation).split(
      '\n'
    );
    const runRow = (name: string) => lines.find(line => line.startsWith(`| ${name} |`)) ?? '';
    expect(runRow('vague-1')).toContain('turn 4, round 8');
    expect(runRow('vague-1')).toContain('3 3');
    expect(
      runRow('vague-2')
        .split('|')
        .map(cell => cell.trim())
    ).toContain('-');
  });
});
