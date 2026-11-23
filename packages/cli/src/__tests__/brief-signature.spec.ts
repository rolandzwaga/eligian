/**
 * Spec 059 Phase 2 (FR-020 ticket, FR-023, FR-024, FR-026, SC-006 key half; plan §3, §4, §5, P4,
 * P15): the brief's state directory, its key, the signer and the sign-off ticket,
 * `mcp/brief/signature.ts`; the signed confirmation and approval lines and the states they give
 * (`engine.ts`, `brief-file.ts`).
 */
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FactsSnapshot, parseBrief, writeBrief } from '../mcp/brief/brief-file.js';
import {
  type Answer,
  type AnswerInput,
  applyAnswers,
  approve,
  type BriefState,
  confirm,
  digest,
  EMPTY_BRIEF,
  evaluate,
  type Facts,
  nextRound,
} from '../mcp/brief/engine.js';
import { makeFacts } from '../mcp/brief/facts.js';
import { cliBriefWarnings } from '../mcp/brief/gate.js';
import {
  ensureKey,
  makeSigner,
  makeTicket,
  readKey,
  type SignaturePayload,
  type Signer,
  sha256Hex,
  stateDirectory,
  type TicketParts,
  ticketValid,
  type Verification,
  verifyBrief,
  verifyBriefFile,
} from '../mcp/brief/signature.js';
import { ALWAYS, type Question, TREE } from '../mcp/brief/tree.js';
import { approvedBrief } from './brief-helpers.js';
import { loadPersona, runPersona, type Step } from './brief-persona-driver.js';
import {
  type ElicitAnswer,
  type ElicitRequest,
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const KEY_LINE = /^[0-9a-f]{64}\n$/;

const temps: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-signature-'));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

it('vitest sets ELIGIAN_STATE_DIR (P15)', () => {
  const dir = process.env.ELIGIAN_STATE_DIR;
  expect(dir).toBeTypeOf('string');
  const relative = path.relative(os.tmpdir(), dir ?? '');
  expect(relative).not.toBe('');
  expect(relative.startsWith('..')).toBe(false);
  expect(path.isAbsolute(relative)).toBe(false);
});

describe('stateDirectory (FR-023)', () => {
  const WIN_HOME = 'C:\\Users\\ada';
  const POSIX_HOME = '/home/ada';

  it.each([
    ['win32', WIN_HOME, { ELIGIAN_STATE_DIR: 'D:\\state' }, 'D:\\state'],
    ['darwin', POSIX_HOME, { ELIGIAN_STATE_DIR: '/var/state' }, '/var/state'],
    [
      'linux',
      POSIX_HOME,
      { ELIGIAN_STATE_DIR: '/var/state', XDG_STATE_HOME: '/xdg' },
      '/var/state',
    ],
    ['win32', WIN_HOME, { LOCALAPPDATA: 'E:\\Local' }, path.win32.join('E:\\Local', 'eligian')],
    ['win32', WIN_HOME, {}, 'C:\\Users\\ada\\AppData\\Local\\eligian'],
    ['darwin', POSIX_HOME, {}, '/home/ada/Library/Application Support/eligian'],
    ['linux', POSIX_HOME, { XDG_STATE_HOME: '/xdg/state' }, '/xdg/state/eligian'],
    ['linux', POSIX_HOME, {}, '/home/ada/.local/state/eligian'],
  ] as const)('%s, home %s, env %o → %s', (platform, home, env, expected) => {
    expect(stateDirectory(env, platform, home)).toBe(expected);
  });

  it('defaults to the process env, platform and home dir', () => {
    expect(stateDirectory()).toBe(process.env.ELIGIAN_STATE_DIR);
  });
});

describe('the key', () => {
  it('readKey on an empty dir is undefined', async () => {
    const dir = await tempDir();
    expect(await readKey(dir)).toBeUndefined();
    expect(await readKey(path.join(dir, 'missing'))).toBeUndefined();
  });

  it('ensureKey creates the state dir and a key of 64 hex + LF', async () => {
    const dir = path.join(await tempDir(), 'nested', 'state');
    const key = await ensureKey(dir);
    expect(key.length).toBe(32);
    const text = await fs.readFile(path.join(dir, 'brief-key'), 'utf8');
    expect(text).toMatch(KEY_LINE);
    expect(text).toBe(`${key.toString('hex')}\n`);
    expect((await readKey(dir))?.equals(key)).toBe(true);
    expect((await ensureKey(dir)).equals(key)).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('ensureKey writes the key with mode 0o600', async () => {
    const dir = await tempDir();
    await ensureKey(dir);
    expect((await fs.stat(path.join(dir, 'brief-key'))).mode & 0o777).toBe(0o600);
  });

  it('two ensureKey in Promise.all on one empty dir resolve to the same key; one brief-key file', async () => {
    const dir = await tempDir();
    const [a, b] = await Promise.all([ensureKey(dir), ensureKey(dir)]);
    expect(a.equals(b)).toBe(true);
    expect(await fs.readdir(dir)).toEqual(['brief-key']);
  });

  it('20 ensureKey in Promise.all all resolve to the same key; no *.tmp left', async () => {
    const dir = await tempDir();
    const keys = await Promise.all(Array.from({ length: 20 }, () => ensureKey(dir)));
    const hex = new Set(keys.map(key => key.toString('hex')));
    expect(hex.size).toBe(1);
    const entries = await fs.readdir(dir);
    expect(entries.filter(entry => entry.endsWith('.tmp'))).toEqual([]);
    expect(entries).toEqual(['brief-key']);
  });

  it('a readKey racing an ensureKey sees undefined or the whole key, never an empty or partial one', async () => {
    for (let i = 0; i < 100; i++) {
      const dir = await tempDir();
      const reads = Array.from({ length: 5 }, () => readKey(dir));
      const ensured = ensureKey(dir);
      const later = Array.from({ length: 5 }, () => readKey(dir));
      const [key, ...seen] = await Promise.all([ensured, ...reads, ...later]);
      for (const value of seen) {
        if (value !== undefined) {
          expect(value.equals(key)).toBe(true);
        }
      }
    }
  });

  it('a malformed brief-key: readKey undefined, ensureKey rejects with code EINVAL, the file is unchanged', async () => {
    for (const content of ['', 'abc\n', `${'a'.repeat(64)}`, `${'A'.repeat(64)}\n`]) {
      const dir = await tempDir();
      const file = path.join(dir, 'brief-key');
      await fs.writeFile(file, content);
      expect(await readKey(dir)).toBeUndefined();
      await expect(ensureKey(dir)).rejects.toMatchObject({ code: 'EINVAL' });
      expect(await fs.readFile(file, 'utf8')).toBe(content);
      expect(await fs.readdir(dir)).toEqual(['brief-key']);
    }
  });
});

const ANSWERS = [
  ['idea.audience', 'students', 'user'],
  ['idea.length', 90, 'delegated'],
] as const;

const PAYLOAD: SignaturePayload = [
  'eligian-brief/1',
  'confirmation',
  'idea',
  'elicitation',
  '2026-11-20T10:00:00.000Z',
  1,
  ANSWERS,
];

describe('makeSigner', () => {
  const key = Buffer.alloc(32, 1);

  it('sign returns hmac-sha256:<64 hex>', () => {
    expect(makeSigner(key).sign(PAYLOAD)).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    const approval: SignaturePayload = [
      'eligian-brief/1',
      'approval',
      'idea',
      'existing-storyboard',
      '2026-11-20T10:00:00.000Z',
      2,
      ANSWERS,
      makeSigner(key).sign(PAYLOAD),
    ];
    expect(makeSigner(key).sign(approval)).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
  });

  it('the same payload and key give the same value; another key gives another', () => {
    const a = makeSigner(key).sign(PAYLOAD);
    expect(makeSigner(Buffer.alloc(32, 1)).sign(PAYLOAD)).toBe(a);
    expect(makeSigner(Buffer.alloc(32, 2)).sign(PAYLOAD)).not.toBe(a);
  });

  it('sha256Hex hashes strings and bytes alike', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(sha256Hex(Buffer.from('abc'))).toBe(sha256Hex('abc'));
  });
});

describe('ticketValid', () => {
  const key = Buffer.alloc(32, 7);
  const PARTS: TicketParts = [
    'eligian-signoff-ticket/1',
    'accept-existing',
    'accept-existing',
    null,
    null,
    ['a.eligian', 'b/c.eligian'],
    [
      [['main'], ['en-US'], false],
      [['intro', 'outro'], [], true],
    ],
  ];

  it('makeTicket returns hmac-sha256:<64 hex>', () => {
    expect(makeTicket(key, PARTS)).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
  });

  it('a ticket of the wrong length, a non-hex ticket, an empty ticket, a ticket without the hmac-sha256: prefix → false, no throw', () => {
    const ticket = makeTicket(key, PARTS);
    const hex = ticket.slice('hmac-sha256:'.length);
    for (const bad of [
      `${ticket}0`,
      ticket.slice(0, -1),
      `hmac-sha256:${'z'.repeat(64)}`,
      `hmac-sha256:${hex.toUpperCase()}`,
      '',
      hex,
      `sha256:${hex}`,
      `hmac-sha256:${hex.slice(0, 62)}é`,
    ]) {
      expect(() => ticketValid(key, bad, PARTS)).not.toThrow();
      expect(ticketValid(key, bad, PARTS)).toBe(false);
    }
  });

  it('no key → false', () => {
    expect(ticketValid(undefined, makeTicket(key, PARTS), PARTS)).toBe(false);
  });

  it('another key → false', () => {
    expect(ticketValid(Buffer.alloc(32, 8), makeTicket(key, PARTS), PARTS)).toBe(false);
  });

  it('the right ticket → true; one changed part (each of the 7 positions in turn) → false', () => {
    const ticket = makeTicket(key, PARTS);
    expect(ticketValid(key, ticket, PARTS)).toBe(true);
    expect(ticketValid(key, ticket, [...PARTS] as unknown as TicketParts)).toBe(true);
    const replacements: unknown[] = [
      'eligian-signoff-ticket/2',
      'confirm',
      'idea',
      sha256Hex('brief'),
      sha256Hex('storyboard'),
      ['a.eligian'],
      [
        [['main'], ['en-US'], true],
        [['intro', 'outro'], [], true],
      ],
    ];
    expect(replacements.length).toBe(PARTS.length);
    replacements.forEach((value, index) => {
      const changed = [...PARTS];
      changed[index] = value as never;
      expect(ticketValid(key, ticket, changed as unknown as TicketParts)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The signed lines and the states they give (FR-024, FR-026; plan §4, §5, P4).

const TEST_KEY = Buffer.alloc(32, 3);
const SIGNER: Signer = makeSigner(TEST_KEY);
const OTHER_SIGNER: Signer = makeSigner(Buffer.alloc(32, 4));
const NOW = new Date('2026-11-20T09:15:00.000Z');
const HMAC_LINE = /^hmac-sha256:[0-9a-f]{64}$/;

/** Facts with no files, everything inside the root, and the given signer and section. */
const factsWith = (signer?: Signer, section?: string): Facts => ({
  briefDir: '.',
  exists: () => false,
  inside: () => true,
  ...(signer === undefined ? {} : { signer }),
  ...(section === undefined ? {} : { section }),
});

/** A text question of branch P that always applies and has no prerequisites. */
const textQuestion = (id: string): Question => ({
  id,
  branch: 'P',
  title: `Question ${id}`,
  ask: `Ask ${id}`,
  shape: { kind: 'text' },
  needs: [],
  reads: [],
  appliesWhen: ALWAYS,
  when: 'always',
  docs: [],
  facts: [],
  since: 1,
});

/** Two independent questions: answering both completes the brief, a change reopens nothing. */
const MINI: readonly Question[] = [textQuestion('P1'), textQuestion('P2')];

describe('state (FR-026)', () => {
  const facts = factsWith(SIGNER);
  const answered = applyAnswers(
    MINI,
    EMPTY_BRIEF,
    facts,
    [
      { id: 'P1', value: 'Know it.' },
      { id: 'P2', value: 'Two.' },
    ],
    1
  ).brief;
  const confirmedWith = (signer: Signer, at = NOW): BriefState =>
    confirm(
      answered,
      'agent-reported',
      'Yes.',
      at,
      evaluate(MINI, answered, facts),
      signer,
      'brief'
    );
  const confirmed = confirmedWith(SIGNER);

  it('frontier empty, no confirmation → complete', () => {
    const ev = evaluate(MINI, answered, facts);
    expect(ev.frontier).toEqual([]);
    expect(ev.state).toBe('complete');
    expect(ev.confirmationStatus).toBe('none');
    expect(ev.approvalStatus).toBe('none');
    expect(ev.changed).toEqual([]);
    expect(ev.canonical).toEqual([
      ['P1', 'Know it.', 'user'],
      ['P2', 'Two.', 'user'],
    ]);
  });

  it('a valid confirmation → confirmed', () => {
    expect(confirmed.confirmation).toEqual({
      mode: 'agent-reported',
      at: NOW.toISOString(),
      round: 1,
      hmac: expect.stringMatching(HMAC_LINE),
      message: 'Yes.',
    });
    const ev = evaluate(MINI, confirmed, facts);
    expect(ev.state).toBe('confirmed');
    expect(ev.confirmationStatus).toBe('valid');
    expect(ev.approvalStatus).toBe('none');
    expect(ev.changed).toEqual([]);
  });

  it('the confirmation HMAC is over ["eligian-brief/1", "confirmation", section, mode, at, n, canonical]', () => {
    expect(confirmed.confirmation?.hmac).toBe(
      SIGNER.sign([
        'eligian-brief/1',
        'confirmation',
        'brief',
        'agent-reported',
        NOW.toISOString(),
        1,
        evaluate(MINI, answered, facts).canonical,
      ])
    );
  });

  it('a confirmation signed for the brief does not verify in another section', () => {
    const ev = evaluate(MINI, confirmed, factsWith(SIGNER, 'Addition: view Outro'));
    expect(ev.confirmationStatus).toBe('invalid');
    expect(ev.state).toBe('complete');
  });

  it('valid confirmation + valid approval → approved', () => {
    const approved = approve(
      confirmed,
      'elicitation',
      undefined,
      NOW,
      evaluate(MINI, confirmed, facts),
      SIGNER,
      'brief'
    );
    expect(approved.approval).toEqual({
      mode: 'elicitation',
      at: NOW.toISOString(),
      hmac: SIGNER.sign([
        'eligian-brief/1',
        'approval',
        'brief',
        'elicitation',
        NOW.toISOString(),
        1,
        evaluate(MINI, confirmed, facts).canonical,
        confirmed.confirmation?.hmac ?? '',
      ]),
    });
    const ev = evaluate(MINI, approved, facts);
    expect(ev.state).toBe('approved');
    expect(ev.confirmationStatus).toBe('valid');
    expect(ev.approvalStatus).toBe('valid');
  });

  it('an approval whose payload names another confirmation hmac → confirmed (the approval does not verify)', () => {
    const other = confirmedWith(SIGNER, new Date('2026-11-21T09:15:00.000Z'));
    expect(other.confirmation?.hmac).not.toBe(confirmed.confirmation?.hmac);
    const otherApproved = approve(
      other,
      'agent-reported',
      'Approved.',
      NOW,
      evaluate(MINI, other, facts),
      SIGNER,
      'brief'
    );
    expect(evaluate(MINI, otherApproved, facts).state).toBe('approved');
    const transplanted: BriefState = { ...confirmed, approval: otherApproved.approval };
    const ev = evaluate(MINI, transplanted, facts);
    expect(ev.state).toBe('confirmed');
    expect(ev.approvalStatus).toBe('invalid');
  });

  it('a confirmation signed with another key → complete, changed []', () => {
    const ev = evaluate(MINI, confirmedWith(OTHER_SIGNER), facts);
    expect(ev.state).toBe('complete');
    expect(ev.confirmationStatus).toBe('invalid');
    expect(ev.changed).toEqual([]);
  });

  it('no signer (no key): a confirmation does not verify', () => {
    const ev = evaluate(MINI, confirmed, factsWith());
    expect(ev.state).toBe('complete');
    expect(ev.confirmationStatus).toBe('invalid');
  });

  it('an answer changed through applyAnswers after confirmation (higher round) → complete, changed lists exactly that id (with title and value)', () => {
    const result = applyAnswers(
      MINI,
      confirmed,
      facts,
      [{ id: 'P2', value: 'Changed.' }],
      nextRound(confirmed)
    );
    expect(result.changed).toBe(true);
    const ev = evaluate(MINI, result.brief, facts);
    expect(ev.frontier).toEqual([]);
    expect(ev.state).toBe('complete');
    expect(ev.confirmationStatus).toBe('invalid');
    expect(ev.changed).toEqual([{ id: 'P2', title: 'Question P2', value: 'Changed.' }]);
  });

  it('a Phase 1 sha256 line → complete, changed []', () => {
    const legacy: BriefState = {
      ...answered,
      confirmation: {
        mode: 'agent-reported',
        at: '2026-11-19T10:00:00.000Z',
        hmac: `sha256:${digest(answered.answers)}`,
        message: 'Yes.',
      },
    };
    const ev = evaluate(MINI, legacy, facts);
    expect(ev.state).toBe('complete');
    expect(ev.confirmationStatus).toBe('invalid');
    expect(ev.changed).toEqual([]);
  });
});

describe('signed lines (FR-024)', () => {
  const SNAPSHOT: FactsSnapshot = {
    state: 'confirmed',
    serverEligian: '1.1.0',
    eligianInstalled: undefined,
    packageManager: undefined,
    textDirection: undefined,
    assets: [],
  };
  const P1: Answer = { id: 'P1', value: 'Know it.', by: 'user', round: 1 };
  const B: BriefState = { treeVersion: 1, answers: [P1] };
  const facts = factsWith(SIGNER);
  const write = (b: BriefState, state = SNAPSHOT.state) =>
    writeBrief(TREE, { brief: b, ignored: [], kept: [] }, { ...SNAPSHOT, state });
  const message = 'The user said "yes, build it"\nand nothing else.';
  const agentConfirmed = confirm(
    B,
    'agent-reported',
    message,
    NOW,
    evaluate(TREE, B, facts),
    SIGNER,
    'brief'
  );
  const elicited = confirm(
    B,
    'elicitation',
    undefined,
    NOW,
    evaluate(TREE, B, facts),
    SIGNER,
    'brief'
  );
  const approvedBy = (mode: 'agent-reported' | 'existing-storyboard') =>
    approve(
      agentConfirmed,
      mode,
      mode === 'agent-reported' ? 'Approved, "as drafted".' : undefined,
      NOW,
      evaluate(TREE, agentConfirmed, facts),
      SIGNER,
      'brief'
    );

  it('writeBrief writes "- confirmation: <mode> <ISO> round <n> hmac-sha256:<64 hex>" and, for agent-reported, "- confirmation-message: <JSON>"', () => {
    const written = write(agentConfirmed);
    const hmac = agentConfirmed.confirmation?.hmac ?? '';
    expect(hmac).toMatch(HMAC_LINE);
    expect(written).toMatch(
      /^- confirmation: agent-reported \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z round \d+ hmac-sha256:[0-9a-f]{64}$/m
    );
    expect(written).toContain(
      `\n- confirmation: agent-reported ${NOW.toISOString()} round 1 ${hmac}\n`
    );
    const line = written.split('\n').find(l => l.startsWith('- confirmation-message: '));
    expect(JSON.parse((line as string).slice('- confirmation-message: '.length))).toBe(message);

    const elicitedText = write(elicited);
    expect(elicitedText).toContain(
      `\n- confirmation: elicitation ${NOW.toISOString()} round 1 ${elicited.confirmation?.hmac}\n`
    );
    expect(elicitedText).not.toContain('confirmation-message');
    expect(elicitedText).toMatch(/^- approval: none$/m);
  });

  it('"- approval: <mode> <ISO> hmac-sha256:<64 hex>" and "- approval-message:"', () => {
    const agent = approvedBy('agent-reported');
    expect(agent.approval?.hmac).toMatch(HMAC_LINE);
    const written = write(agent, 'approved');
    expect(written).toContain(
      `\n- approval: agent-reported ${NOW.toISOString()} ${agent.approval?.hmac}\n- approval-message: "Approved, \\"as drafted\\"."\n`
    );
    const lines = written.split('\n');
    const at = (prefix: string) => lines.findIndex(l => l.startsWith(prefix));
    expect(at('- tree: ')).toBeLessThan(at('- state: '));
    expect(at('- state: ')).toBeLessThan(at('- confirmation: '));
    expect(at('- confirmation: ')).toBeLessThan(at('- confirmation-message: '));
    expect(at('- confirmation-message: ')).toBeLessThan(at('- approval: '));
    expect(at('- approval: ')).toBeLessThan(at('- approval-message: '));

    const storyboard = approvedBy('existing-storyboard');
    const storyboardText = write(storyboard, 'approved');
    expect(storyboardText).toContain(
      `\n- approval: existing-storyboard ${NOW.toISOString()} ${storyboard.approval?.hmac}\n`
    );
    expect(storyboardText).not.toContain('approval-message');
  });

  it('parse(write(x)) round-trips both lines', () => {
    for (const b of [
      agentConfirmed,
      elicited,
      approvedBy('agent-reported'),
      approvedBy('existing-storyboard'),
    ]) {
      const written = write(b);
      const parsed = parseBrief(written);
      expect(parsed.ignored).toEqual([]);
      expect(parsed.kept).toEqual([]);
      expect(parsed.brief.confirmation).toEqual(b.confirmation);
      expect(parsed.brief.approval).toEqual(b.approval);
      expect(write(parsed.brief)).toBe(written);
      expect(evaluate(TREE, parsed.brief, facts).confirmationStatus).toBe('valid');
    }
  });

  it('a Phase 1 "- confirmation: agent-reported <ISO> sha256:<hex>" line parses (no round, hmac "sha256:<hex>") and writes back byte-identically', () => {
    const hex = digest([P1]);
    const text = write(B, 'complete').replace(
      '\n- confirmation: none\n',
      `\n- confirmation: agent-reported 2026-11-19T10:00:00.000Z sha256:${hex}\n- confirmation-message: "Yes."\n`
    );
    expect(text).toContain(`sha256:${hex}\n`);
    const parsed = parseBrief(text);
    expect(parsed.ignored).toEqual([]);
    expect(parsed.brief.confirmation).toEqual({
      mode: 'agent-reported',
      at: '2026-11-19T10:00:00.000Z',
      hmac: `sha256:${hex}`,
      message: 'Yes.',
    });
    expect(writeBrief(TREE, parsed, { ...SNAPSHOT, state: 'complete' })).toBe(text);
  });

  it('n is the highest round or reviewed at signing', () => {
    const b: BriefState = {
      treeVersion: 1,
      answers: [
        { ...P1, round: 2, reviewed: 5 },
        { id: 'P4', value: 'plain', by: 'user', round: 3 },
      ],
    };
    const c = confirm(b, 'agent-reported', 'Yes.', NOW, evaluate(TREE, b, facts), SIGNER, 'brief');
    expect(c.confirmation?.round).toBe(5);
    expect(nextRound(b) - 1).toBe(5);
    expect(write(c)).toContain(`\n- confirmation: agent-reported ${NOW.toISOString()} round 5 `);
  });
});

// ---------------------------------------------------------------------------------------------
// Verification (FR-025, SC-006 pure half; plan §3).

/** The terse persona over the full tree: a complete single-view brief, answered in two rounds. */
const completeBrief = (): BriefState => {
  const terse = loadPersona('terse');
  const answers: readonly AnswerInput[] = Object.entries(terse.answers).map(([id, entry]) => {
    const one = 'values' in entry ? entry.values[0] : entry;
    return { id, value: one.value, ...(one.delegated === true ? { delegated: true } : {}) };
  });
  const facts = factsWith(SIGNER);
  const start: BriefState = { ...EMPTY_BRIEF, idea: terse.idea };
  const first = applyAnswers(TREE, start, facts, answers, 1);
  const waiting = first.rejected.filter(r => r.reason === 'waiting').map(r => r.id);
  expect(first.rejected.length).toBe(waiting.length);
  const second = applyAnswers(
    TREE,
    first.brief,
    facts,
    answers.filter(a => waiting.includes(a.id)),
    2
  );
  expect(second.rejected).toEqual([]);
  expect(evaluate(TREE, second.brief, facts).state).toBe('complete');
  return second.brief;
};

describe('verification (FR-025)', () => {
  const COMPLETE = completeBrief();
  const facts = factsWith(SIGNER);
  const SNAPSHOT: FactsSnapshot = {
    state: 'approved',
    serverEligian: '1.1.0',
    eligianInstalled: undefined,
    packageManager: undefined,
    textDirection: undefined,
    assets: [],
  };
  const write = (b: BriefState) => writeBrief(TREE, { brief: b, ignored: [], kept: [] }, SNAPSHOT);
  /** `b` confirmed and approved with the test key at `at`. */
  const signedOff = (b: BriefState, at: Date): BriefState => {
    const confirmed = confirm(
      b,
      'agent-reported',
      'Yes.',
      at,
      evaluate(TREE, b, facts),
      SIGNER,
      'brief'
    );
    return approve(
      confirmed,
      'elicitation',
      undefined,
      at,
      evaluate(TREE, confirmed, facts),
      SIGNER,
      'brief'
    );
  };
  const lineOf = (text: string, prefix: string): string =>
    text.split('\n').find(l => l.startsWith(prefix)) as string;

  const APPROVED = write(signedOff(COMPLETE, NOW));
  const n = nextRound(COMPLETE) - 1;
  const FORGED = write(COMPLETE)
    .replace(
      '\n- confirmation: none\n',
      `\n- confirmation: agent-reported ${NOW.toISOString()} round ${n} hmac-sha256:${'ab'.repeat(32)}\n- confirmation-message: "Yes."\n`
    )
    .replace(
      '\n- approval: none\n',
      `\n- approval: elicitation ${NOW.toISOString()} hmac-sha256:${'cd'.repeat(32)}\n`
    );
  /** Another brief (P1 reads otherwise), signed off a day later with the same key. */
  const OTHER = write(
    signedOff(
      {
        ...COMPLETE,
        answers: COMPLETE.answers.map(a =>
          a.id === 'P1' ? { ...a, value: 'Something else.' } : a
        ),
      },
      new Date('2026-11-21T09:15:00.000Z')
    )
  );
  const COPIED = APPROVED.replace(lineOf(APPROVED, '- approval: '), lineOf(OTHER, '- approval: '));
  const PHASE_1 = write(COMPLETE).replace(
    '\n- confirmation: none\n',
    `\n- confirmation: agent-reported 2026-11-19T10:00:00.000Z sha256:${digest(COMPLETE.answers)}\n- confirmation-message: "Yes."\n`
  );
  const UNSIGNED = write(COMPLETE);

  /** The in-memory verdict: parse, evaluate with the key's signer (when given), verify. */
  const verified = (text: string, key: Buffer | undefined): Verification => {
    const parsed = parseBrief(text);
    expect(parsed.ignored).toEqual([]);
    const evaluation = evaluate(
      TREE,
      parsed.brief,
      factsWith(key === undefined ? undefined : makeSigner(key))
    );
    return verifyBrief(parsed, evaluation, key);
  };

  const CASES: readonly (readonly [string, string, Buffer | undefined, Verification])[] = [
    ['signed off', APPROVED, TEST_KEY, { confirmation: 'valid', approval: 'valid' }],
    ['forged', FORGED, TEST_KEY, { confirmation: 'invalid', approval: 'invalid' }],
    ['copied approval', COPIED, TEST_KEY, { confirmation: 'valid', approval: 'invalid' }],
    ['phase 1', PHASE_1, TEST_KEY, { confirmation: 'invalid', approval: 'none' }],
    ['unsigned', UNSIGNED, TEST_KEY, { confirmation: 'none', approval: 'none' }],
    ['no key, signed off', APPROVED, undefined, { confirmation: 'invalid', approval: 'invalid' }],
    ['no key, forged', FORGED, undefined, { confirmation: 'invalid', approval: 'invalid' }],
    ['no key, phase 1', PHASE_1, undefined, { confirmation: 'invalid', approval: 'none' }],
    ['no key, unsigned', UNSIGNED, undefined, { confirmation: 'none', approval: 'none' }],
  ];

  describe('verifyBrief', () => {
    it('a BRIEF.md with "- state: approved" and a hand-typed hmac-sha256 line of 64 hex → confirmation invalid; the evaluation\'s state is complete', () => {
      expect(FORGED).toMatch(/^- state: approved$/m);
      expect(FORGED).toMatch(
        /^- confirmation: agent-reported \S+ round \d+ hmac-sha256:[0-9a-f]{64}$/m
      );
      const parsed = parseBrief(FORGED);
      expect(parsed.ignored).toEqual([]);
      expect(parsed.brief.confirmation?.hmac).toBe(`hmac-sha256:${'ab'.repeat(32)}`);
      const evaluation = evaluate(TREE, parsed.brief, facts);
      expect(evaluation.state).toBe('complete');
      expect(verifyBrief(parsed, evaluation, TEST_KEY)).toEqual({
        confirmation: 'invalid',
        approval: 'invalid',
      });
    });

    it('the signed-off brief verifies (the cases below differ from it in one line)', () => {
      expect(verified(APPROVED, TEST_KEY)).toEqual({ confirmation: 'valid', approval: 'valid' });
      expect(evaluate(TREE, parseBrief(APPROVED).brief, facts).state).toBe('approved');
    });

    it('an approval line copied from another brief does not verify', () => {
      expect(lineOf(OTHER, '- approval: ')).toMatch(/^- approval: elicitation \S+ hmac-sha256:/);
      expect(lineOf(COPIED, '- approval: ')).not.toBe(lineOf(APPROVED, '- approval: '));
      expect(verified(COPIED, TEST_KEY)).toEqual({ confirmation: 'valid', approval: 'invalid' });
      expect(evaluate(TREE, parseBrief(COPIED).brief, facts).state).toBe('confirmed');
    });

    it('a Phase 1 sha256 line → invalid', () => {
      expect(parseBrief(PHASE_1).brief.confirmation?.hmac).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(verified(PHASE_1, TEST_KEY)).toEqual({ confirmation: 'invalid', approval: 'none' });
    });

    it('no key → every present line invalid, absent lines none', () => {
      expect(verified(APPROVED, undefined)).toEqual({
        confirmation: 'invalid',
        approval: 'invalid',
      });
      expect(verified(UNSIGNED, undefined)).toEqual({ confirmation: 'none', approval: 'none' });
      // with no key, an evaluation made with a signer does not make a line valid
      const parsed = parseBrief(APPROVED);
      expect(verifyBrief(parsed, evaluate(TREE, parsed.brief, facts), undefined)).toEqual({
        confirmation: 'invalid',
        approval: 'invalid',
      });
    });

    it.each(CASES)('%s', (_name, text, key, expected) => {
      expect(verified(text, key)).toEqual(expected);
    });
  });

  describe('verifyBriefFile', () => {
    it.each(CASES)(
      'equals verifyBrief over the same file and key: %s',
      async (_name, text, key, expected) => {
        const dir = await tempDir();
        const stateDir = await tempDir();
        await fs.writeFile(path.join(dir, 'BRIEF.md'), text);
        if (key !== undefined) {
          await fs.writeFile(path.join(stateDir, 'brief-key'), `${key.toString('hex')}\n`);
        }
        const parsed = parseBrief(text);
        const evaluation = evaluate(TREE, parsed.brief, {
          ...makeFacts(dir, dir),
          ...(key === undefined ? {} : { signer: makeSigner(key) }),
        });
        const fromFile = await verifyBriefFile(dir, stateDir);
        expect(fromFile).toEqual(verifyBrief(parsed, evaluation, key));
        expect(fromFile).toEqual(expected);
      }
    );

    it('writes nothing and creates no key', async () => {
      const dir = await tempDir();
      const stateDir = path.join(await tempDir(), 'state');
      await fs.writeFile(path.join(dir, 'BRIEF.md'), APPROVED);
      expect(await verifyBriefFile(dir, stateDir)).toEqual({
        confirmation: 'invalid',
        approval: 'invalid',
      });
      expect(await fs.readdir(dir)).toEqual(['BRIEF.md']);
      expect(await fs.readFile(path.join(dir, 'BRIEF.md'), 'utf8')).toBe(APPROVED);
      await expect(fs.stat(stateDir)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('a directory without BRIEF.md has no lines', async () => {
      const dir = await tempDir();
      expect(await verifyBriefFile(dir, await tempDir())).toEqual({
        confirmation: 'none',
        approval: 'none',
      });
    });
  });
});

// ---------------------------------------------------------------------------------------------
// T030 (SC-006 server half): the signature in the server, through the in-memory client. Signed
// lines come only from the server (`eligian_brief`, `approvedBrief`): never a hand-made HMAC.

const HERE = import.meta.dirname;
const PROGRAM = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'gate', 'program');
const DOCS = path.join(HERE, '__fixtures__', 'mcp', 'docs-mini');
const MAIN = fsSync.readFileSync(path.join(PROGRAM, 'main.eligian'), 'utf8');
const TERSE = loadPersona('terse');
/** Driving the terse persona through the server takes a few seconds per brief. */
const SLOW = 120_000;
/** A terse answer the hand edits rewrite. */
const P1_TEXT = 'Viewers know when support is open.';

/** A temp project: the gate fixture's layout and styles, and `main.eligian` when `program`. */
async function project(program: boolean): Promise<string> {
  const dir = await fs.realpath(await tempDir());
  for (const name of ['layout.html', 'styles.css', ...(program ? ['main.eligian'] : [])]) {
    await fs.copyFile(path.join(PROGRAM, name), path.join(dir, name));
  }
  return dir;
}

/** The client's dialog accepts: its one boolean field (`confirmed`, `approved`) is `true`. */
const accept = (request: ElicitRequest): ElicitAnswer => {
  const schema = request.requestedSchema as { readonly properties: Record<string, unknown> };
  const [field] = Object.keys(schema.properties);
  return { action: 'accept', content: { [field]: true } };
};

const servers: InMemoryServer[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) await server.close();
});

/** A server on `cwd` signing with `stateDir`; `elicitation`: the client accepts every dialog. */
async function serve(cwd: string, stateDir: string, elicitation = false): Promise<InMemoryServer> {
  const server = await startInMemoryServer(
    { cwd, docsRoot: DOCS, brief: { stateDir } },
    elicitation ? { elicitation: true, onElicit: accept } : {}
  );
  servers.push(server);
  return server;
}

/** `eligian_brief` on `dir`; a tool failure throws. */
async function briefOn(
  server: InMemoryServer,
  dir: string,
  args: Readonly<Record<string, unknown>>
): Promise<any> {
  const result = await server.callTool('eligian_brief', { directory: dir, ...args });
  if (result.isError) throw new Error(`eligian_brief failed: ${JSON.stringify(result.payload)}`);
  return result.payload;
}

/** The terse persona to `complete` through the tool. */
async function toComplete(server: InMemoryServer, dir: string): Promise<void> {
  const run = await runPersona(
    TERSE,
    async answers => (await briefOn(server, dir, { action: 'answer', answers })) as Step,
    async () => (await briefOn(server, dir, { action: 'status', idea: TERSE.idea })) as Step
  );
  expect(run.final.state).toBe('complete');
}

const gateOf = (result: ToolCallResult): any => {
  expect(result.isError, JSON.stringify(result.payload)).toBe(true);
  expect(result.payload.error.kind).toBe('gate');
  return result.payload.error.gate;
};

const expectRuns = (result: ToolCallResult): void => {
  expect(result.isError, JSON.stringify(result.payload)).toBe(false);
};

const check = (server: InMemoryServer) =>
  server.callTool('eligian_check', { paths: ['main.eligian'] });

/** A hand edit to `BRIEF.md`: one answer's text, the signed lines left as they are. */
async function handEdit(dir: string): Promise<void> {
  const file = path.join(dir, 'BRIEF.md');
  const text = await fs.readFile(file, 'utf8');
  expect(text).toContain(P1_TEXT);
  await fs.writeFile(file, text.replace(P1_TEXT, 'Viewers know when support opens.'));
}

const idsOf = (answers: readonly { readonly id: string }[] | undefined): string[] =>
  (answers ?? []).map(answer => answer.id);

/** The ids the `confirm` dialog lists under "Changed since the last confirmation:". */
function changedIdsOf(message: string): string[] {
  const lines = message.split('\n');
  const start = lines.indexOf('Changed since the last confirmation:');
  if (start < 0) return [];
  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^- (\S+) \(/.exec(line);
    if (match === null) break;
    ids.push(match[1]);
  }
  return ids;
}

/** Every answer a dialog message names (`- <id> (<title>): …`), in any section. */
const answerIdsOf = (message: string): string[] =>
  message.split('\n').flatMap(line => {
    const match = /^- (\S+) \(/.exec(line);
    return match === null ? [] : [match[1]];
  });

/** One brief the server evaluated, kept for the `verifyBriefFile` case at the end. */
interface ServerVerdict {
  readonly name: string;
  readonly dir: string;
  readonly stateDir: string;
  readonly state: string;
}

const serverVerdicts: ServerVerdict[] = [];

let kept: Promise<string> | undefined;
/** One directory for the copies `noteVerdict` keeps until the end of the file. */
const keptDir = (): Promise<string> => {
  kept ??= fs.mkdtemp(path.join(os.tmpdir(), 'eligian-signature-verdicts-'));
  return kept;
};

/**
 * Records the server's `status` state of `dir`, with a copy of its `BRIEF.md` and its key (the
 * case's temp dirs are removed after it), for the `verifyBriefFile` case.
 */
async function noteVerdict(
  name: string,
  server: InMemoryServer,
  dir: string,
  stateDir: string
): Promise<void> {
  const status = await briefOn(server, dir, { action: 'status' });
  expect(status.state).not.toBe('open');
  const copy = path.join(await keptDir(), `${serverVerdicts.length}`);
  const copyState = `${copy}-state`;
  await fs.mkdir(copy, { recursive: true });
  await fs.mkdir(copyState, { recursive: true });
  await fs.copyFile(path.join(dir, 'BRIEF.md'), path.join(copy, 'BRIEF.md'));
  const key = path.join(stateDir, 'brief-key');
  if (fsSync.existsSync(key)) await fs.copyFile(key, path.join(copyState, 'brief-key'));
  serverVerdicts.push({ name, dir: copy, stateDir: copyState, state: status.state });
}

interface Approved {
  readonly brief: string;
  readonly storyboard: string;
}

let elsewhere: Promise<Approved> | undefined;
/** A brief approved on "another machine" (its own state dir): its BRIEF.md and STORYBOARD.md. */
const approvedElsewhere = (): Promise<Approved> => {
  elsewhere ??= (async () => {
    const stateA = await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-signature-elsewhere-'));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-signature-elsewhere-'));
    try {
      for (const name of ['layout.html', 'styles.css']) {
        await fs.copyFile(path.join(PROGRAM, name), path.join(dir, name));
      }
      const server = await startInMemoryServer({
        cwd: dir,
        docsRoot: DOCS,
        brief: { stateDir: stateA },
      });
      try {
        await approvedBrief(server, dir, { stateDir: stateA });
      } finally {
        await server.close();
      }
      return {
        brief: await fs.readFile(path.join(dir, 'BRIEF.md'), 'utf8'),
        storyboard: await fs.readFile(path.join(dir, 'STORYBOARD.md'), 'utf8'),
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      await fs.rm(stateA, { recursive: true, force: true });
    }
  })();
  return elsewhere;
};

/** The approved brief of another machine copied into `dir`. */
async function copyElsewhere(dir: string): Promise<void> {
  const { brief, storyboard } = await approvedElsewhere();
  await fs.writeFile(path.join(dir, 'BRIEF.md'), brief);
  await fs.writeFile(path.join(dir, 'STORYBOARD.md'), storyboard);
}

const EXTRA_TIMELINE =
  '\ntimeline "Extra" in "#stage" using raf {\n  at 0s..1s [\n    selectElement("#title")\n    addClass("lit")\n  ] [\n    selectElement("#title")\n    removeClass("lit")\n  ]\n}\n';

describe('the signature in the server (T030)', () => {
  describe('another key', () => {
    it(
      '(a) no program: a brief approved with state dir A is complete with state dir B; eligian_init into it and eligian_check on a main.eligian written after the record both fail brief-not-confirmed; the re-confirm is one dialog over the whole brief',
      async () => {
        const stateB = await tempDir();
        const dir = await project(false);
        await copyElsewhere(dir);
        const server = await serve(dir, stateB, true);
        const status = await briefOn(server, dir, { action: 'status' });
        expect(status.state).toBe('complete');
        expect(status.changed ?? []).toEqual([]);
        expect(fsSync.existsSync(path.join(dir, '.eligian', 'programs.json'))).toBe(true);

        const init = await server.callTool('eligian_init', {
          directory: '.',
          template: 'blank',
          title: 'Tea',
          force: true,
          agents: false,
        });
        expect(gateOf(init).code).toBe('brief-not-confirmed');
        expect(fsSync.existsSync(path.join(dir, 'main.eligian'))).toBe(false);

        await fs.writeFile(path.join(dir, 'main.eligian'), MAIN);
        const refused = gateOf(await check(server));
        expect(refused.code).toBe('brief-not-confirmed');
        expect(refused.changed).toBeUndefined();
        await noteVerdict('another key, no program', server, dir, stateB);

        const before = server.elicitations().length;
        const confirmed = await briefOn(server, dir, { action: 'confirm' });
        expect(confirmed.state).toBe('confirmed');
        expect(confirmed.signoff).toEqual({ mode: 'elicitation' });
        const dialogs = server.elicitations().slice(before) as ElicitRequest[];
        expect(dialogs.length).toBe(1);
        expect(dialogs[0].message).not.toContain('Changed since the last confirmation');
        expect(dialogs[0].message).toContain(`${status.counts.answered} answers`);
        expect(dialogs[0].message).toContain(path.join(dir, 'BRIEF.md'));
        await noteVerdict('another key, re-confirmed', server, dir, stateB);
      },
      SLOW
    );

    it(
      '(b) known first-run program: check, compile and fmt run; the CLI with state dir B prints no line with the record and one (complete) without',
      async () => {
        const stateB = await tempDir();
        const dir = await project(true);
        await copyElsewhere(dir);
        const bare = await project(true);
        await copyElsewhere(bare);
        const server = await serve(dir, stateB);
        expectRuns(await check(server));
        expect(
          JSON.parse(await fs.readFile(path.join(dir, '.eligian', 'programs.json'), 'utf8'))
        ).toEqual({
          version: 1,
          programs: [
            {
              path: 'main.eligian',
              timelines: ['hours'],
              languages: [],
              extensions: false,
              via: 'first-run',
            },
          ],
        });
        expectRuns(await server.callTool('eligian_compile', { path: 'main.eligian' }));
        expectRuns(await server.callTool('eligian_fmt', { paths: ['main.eligian'] }));
        expect((await briefOn(server, dir, { action: 'status' })).state).toBe('complete');
        await noteVerdict('another key, known program', server, dir, stateB);

        const env = { ELIGIAN_STATE_DIR: stateB };
        expect(await cliBriefWarnings([path.join(dir, 'main.eligian')], dir, env)).toEqual([]);
        const lines = await cliBriefWarnings([path.join(bare, 'main.eligian')], bare, env);
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain('BRIEF.md is complete');
      },
      SLOW
    );

    it(
      'row 4 for open, complete, hand-edited (in the server)',
      async () => {
        const stateDir = await tempDir();
        const dir = await project(true);
        const server = await serve(dir, stateDir);
        const env = { ELIGIAN_STATE_DIR: stateDir };
        const runsEverywhere = async (state: string): Promise<void> => {
          expect((await briefOn(server, dir, { action: 'status' })).state).toBe(state);
          expectRuns(await check(server));
          expect(await cliBriefWarnings([path.join(dir, 'main.eligian')], dir, env)).toEqual([]);
        };
        // the start-time scan records main.eligian via first-run before the brief exists
        expectRuns(await check(server));
        expect((await briefOn(server, dir, { action: 'status', idea: TERSE.idea })).state).toBe(
          'open'
        );
        await runsEverywhere('open');
        await toComplete(server, dir);
        await runsEverywhere('complete');
        const confirmed = await briefOn(server, dir, {
          action: 'confirm',
          confirmation: 'Yes, that is the brief.',
        });
        expect(confirmed.state).toBe('confirmed');
        await handEdit(dir);
        await runsEverywhere('complete');
        await noteVerdict('row 4, hand-edited', server, dir, stateDir);
      },
      SLOW
    );
  });

  describe('before approval', () => {
    it(
      'a tool change → brief-changed with exactly the changed ids; a hand edit → brief-not-confirmed; the re-confirm dialog names only the changed ids',
      async () => {
        const stateDir = await tempDir();
        const dir = await project(false);
        const server = await serve(dir, stateDir, true);
        await toComplete(server, dir);
        expect((await briefOn(server, dir, { action: 'confirm' })).state).toBe('confirmed');
        await noteVerdict('confirmed', server, dir, stateDir);

        const changed = await briefOn(server, dir, {
          action: 'answer',
          answers: [{ id: 'W1', value: 'Colours and spacing only.' }],
        });
        expect(changed.state).toBe('complete');
        expect(idsOf(changed.changed)).toEqual(['W1']);
        await fs.writeFile(path.join(dir, 'main.eligian'), MAIN);
        const refused = gateOf(await check(server));
        expect(refused.code).toBe('brief-changed');
        expect(idsOf(refused.changed)).toEqual(['W1']);
        await noteVerdict('changed through the tool', server, dir, stateDir);

        const before = server.elicitations().length;
        expect((await briefOn(server, dir, { action: 'confirm' })).state).toBe('confirmed');
        const dialogs = server.elicitations().slice(before) as ElicitRequest[];
        expect(dialogs.length).toBe(1);
        expect(changedIdsOf(dialogs[0].message)).toEqual(['W1']);
        // FR-019: a re-confirmation shows only the changed answers: no counts, no delegated list
        // (the persona delegates V2:hours and D2, unchanged), the path still named.
        expect(answerIdsOf(dialogs[0].message)).toEqual(['W1']);
        expect(dialogs[0].message).not.toMatch(/\d+ answers \(/);
        expect(dialogs[0].message).toContain(path.join(dir, 'BRIEF.md'));

        await handEdit(dir);
        const edited = gateOf(await check(server));
        expect(edited.code).toBe('brief-not-confirmed');
        expect(edited.changed).toBeUndefined();
        const status = await briefOn(server, dir, { action: 'status' });
        expect(status.state).toBe('complete');
        expect(status.changed ?? []).toEqual([]);
        await noteVerdict('hand-edited before approval', server, dir, stateDir);
      },
      SLOW
    );
  });

  describe('after approval', () => {
    it(
      'a tool change and a hand edit leave check running; status reports complete (+ changed); an appended timeline is addition-not-briefed; an S2 view added through the tool does not let that timeline pass',
      async () => {
        const stateDir = await tempDir();
        const dir = await project(false);
        const server = await serve(dir, stateDir, true);
        await approvedBrief(server, dir, { stateDir });
        await noteVerdict('approved', server, dir, stateDir);
        await fs.writeFile(path.join(dir, 'main.eligian'), MAIN);
        expectRuns(await check(server));

        const changed = await briefOn(server, dir, {
          action: 'answer',
          answers: [{ id: 'W1', value: 'Colours and spacing only.' }],
        });
        expect(changed.state).toBe('complete');
        expect(idsOf(changed.changed)).toContain('W1');
        expectRuns(await check(server));
        await noteVerdict('changed after approval', server, dir, stateDir);

        await handEdit(dir);
        expectRuns(await check(server));
        expect((await briefOn(server, dir, { action: 'status' })).state).toBe('complete');
        await noteVerdict('hand-edited after approval', server, dir, stateDir);

        await fs.appendFile(path.join(dir, 'main.eligian'), EXTRA_TIMELINE);
        const appended = gateOf(await check(server));
        expect(appended.code).toBe('addition-not-briefed');
        expect(appended.scope).toEqual({ addition: 'view', name: 'Extra' });

        const s2 = await briefOn(server, dir, {
          action: 'answer',
          answers: [
            {
              id: 'S2',
              value: [
                { name: 'hours', purpose: 'Shows the support hours' },
                { name: 'Extra', purpose: 'Shows more' },
              ],
            },
          ],
        });
        expect(s2.rejected).toEqual([]);
        const still = gateOf(await check(server));
        expect(still.code).toBe('addition-not-briefed');
        expect(still.scope).toEqual({ addition: 'view', name: 'Extra' });
      },
      SLOW
    );
  });

  describe('the key', () => {
    it('none after initialize (no signing)', async () => {
      const stateDir = path.join(await tempDir(), 'state');
      const dir = await project(true);
      const server = await serve(dir, stateDir);
      const init = await server.request('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'signature-spec', version: '0' },
      });
      expect(init.error).toBeUndefined();
      await server.notify('notifications/initialized');
      expect((await briefOn(server, dir, { action: 'status', idea: TERSE.idea })).state).toBe(
        'open'
      );
      expectRuns(await check(server));
      expect(fsSync.existsSync(path.join(stateDir, 'brief-key'))).toBe(false);
    });

    it(
      'two in-process servers on one state dir each sign a brief concurrently (agent-reported): one brief-key, both lines verify',
      async () => {
        const stateDir = path.join(await tempDir(), 'state');
        const dirs = [await project(false), await project(false)];
        const pair = [await serve(dirs[0], stateDir), await serve(dirs[1], stateDir)];
        await Promise.all(pair.map((server, n) => toComplete(server, dirs[n])));
        expect(fsSync.existsSync(stateDir)).toBe(false);
        const confirmed = await Promise.all(
          pair.map((server, n) =>
            briefOn(server, dirs[n], {
              action: 'confirm',
              confirmation: 'Yes, that is the brief.',
            })
          )
        );
        for (const reply of confirmed) {
          expect(reply.state).toBe('confirmed');
          expect(reply.signoff).toEqual({ mode: 'agent-reported' });
        }
        expect(await fs.readdir(stateDir)).toEqual(['brief-key']);
        expect(await fs.readFile(path.join(stateDir, 'brief-key'), 'utf8')).toMatch(KEY_LINE);
        if (process.platform !== 'win32') {
          expect((await fs.stat(path.join(stateDir, 'brief-key'))).mode & 0o777).toBe(0o600);
        }
        for (const dir of dirs) {
          expect(await verifyBriefFile(dir, stateDir)).toEqual({
            confirmation: 'valid',
            approval: 'none',
          });
        }
      },
      SLOW
    );

    it(
      'ServerOptions.brief.stateDir wins over ELIGIAN_STATE_DIR',
      async () => {
        const fromEnv = await tempDir();
        const fromOptions = path.join(await tempDir(), 'state');
        vi.stubEnv('ELIGIAN_STATE_DIR', fromEnv);
        expect(stateDirectory()).toBe(fromEnv);
        const dir = await project(false);
        const server = await serve(dir, fromOptions);
        await toComplete(server, dir);
        const confirmed = await briefOn(server, dir, {
          action: 'confirm',
          confirmation: 'Yes, that is the brief.',
        });
        expect(confirmed.state).toBe('confirmed');
        expect(await fs.readdir(fromOptions)).toEqual(['brief-key']);
        expect(await fs.readdir(fromEnv)).toEqual([]);
        expect((await verifyBriefFile(dir, fromOptions)).confirmation).toBe('valid');
        expect((await verifyBriefFile(dir, fromEnv)).confirmation).toBe('invalid');
      },
      SLOW
    );
  });

  describe('verifyBriefFile', () => {
    /** FR-026 over a brief with an empty frontier: the state the two signed lines give. */
    const stateOf = (verification: Verification): string =>
      verification.confirmation !== 'valid'
        ? 'complete'
        : verification.approval === 'valid'
          ? 'approved'
          : 'confirmed';

    it("equals the server's verdict for each case above", async () => {
      expect(serverVerdicts.map(verdict => verdict.name)).toEqual([
        'another key, no program',
        'another key, re-confirmed',
        'another key, known program',
        'row 4, hand-edited',
        'confirmed',
        'changed through the tool',
        'hand-edited before approval',
        'approved',
        'changed after approval',
        'hand-edited after approval',
      ]);
      try {
        for (const verdict of serverVerdicts) {
          const verification = await verifyBriefFile(verdict.dir, verdict.stateDir);
          expect(stateOf(verification), verdict.name).toBe(verdict.state);
        }
      } finally {
        if (kept !== undefined) await fs.rm(await kept, { recursive: true, force: true });
      }
    });
  });
});
