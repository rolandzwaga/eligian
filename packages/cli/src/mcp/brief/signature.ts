/**
 * The brief's signatures (spec 059 Phase 2, FR-020 ticket, FR-023; plan §3): the state directory
 * outside the project, the key in it, the HMAC signer of the confirmation and approval lines, and
 * the sign-off ticket, and the verification of a brief's signed lines (FR-025), in memory and from
 * disk. Plain promises and pure functions: no `effect` here, no `@eligian/language`.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { BRIEF_FILE, EMPTY_PARSED, type ParsedBrief, parseBrief } from './brief-file.js';
import { type By, type Evaluation, evaluate, type SignatureStatus } from './engine.js';
import { makeFacts } from './facts.js';
import { type AnswerValue, TREE } from './tree.js';

/** The recorded answers as `digest` hashes them: `[id, value, by]`, sorted by id. */
export type CanonicalAnswers = readonly (readonly [string, AnswerValue, By])[];

/** What a confirmation or approval line signs (FR-024). */
export type SignaturePayload =
  | readonly [
      'eligian-brief/1',
      'confirmation',
      string, // section
      'elicitation' | 'agent-reported',
      string, // at
      number, // n
      CanonicalAnswers,
    ]
  | readonly [
      'eligian-brief/1',
      'approval',
      string, // section
      'elicitation' | 'agent-reported' | 'existing-storyboard',
      string, // at
      number, // n
      CanonicalAnswers,
      string, // the confirmation's hmac
    ];

export interface Signer {
  /** `hmac-sha256:<64 hex>` over the payload's JSON. */
  readonly sign: (payload: SignaturePayload) => string;
}

/** What a sign-off ticket binds (FR-020 step 2). */
export type TicketParts = readonly [
  'eligian-signoff-ticket/1',
  'confirm' | 'approve-storyboard' | 'accept-existing',
  string, // section
  string | null, // sha256 of the BRIEF.md bytes
  string | null, // sha256 of the STORYBOARD.md bytes
  readonly string[] | null, // the sorted accepted paths
  readonly (readonly [readonly string[], readonly string[], boolean])[] | null, // their scans
];

const KEY_FILE = 'brief-key';
const KEY_TEXT = /^[0-9a-f]{64}\n$/;
const HMAC_TEXT = /^hmac-sha256:[0-9a-f]{64}$/;

function setting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value === '' ? undefined : value;
}

/**
 * The brief's state directory (FR-023): `ELIGIAN_STATE_DIR` when set, else the platform default.
 */
export function stateDirectory(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir()
): string {
  const explicit = setting(env, 'ELIGIAN_STATE_DIR');
  if (explicit !== undefined) {
    return explicit;
  }
  if (platform === 'win32') {
    const local = setting(env, 'LOCALAPPDATA') ?? path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(local, 'eligian');
  }
  if (platform === 'darwin') {
    return path.posix.join(home, 'Library', 'Application Support', 'eligian');
  }
  const state = setting(env, 'XDG_STATE_HOME') ?? path.posix.join(home, '.local', 'state');
  return path.posix.join(state, 'eligian');
}

type KeyRead = { readonly kind: 'absent' } | { readonly kind: 'malformed' } | Buffer;

async function readKeyFile(file: string): Promise<KeyRead> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { kind: 'absent' };
    }
    throw error;
  }
  return KEY_TEXT.test(text) ? Buffer.from(text.slice(0, 64), 'hex') : { kind: 'malformed' };
}

function malformed(file: string): Error {
  return Object.assign(
    new Error(`${file} is not a brief key (64 lower-case hex digits and a line feed)`),
    { code: 'EINVAL' }
  );
}

/** The key (FR-023), or `undefined` when its file is absent or malformed. */
export async function readKey(stateDir: string): Promise<Buffer | undefined> {
  const read = await readKeyFile(path.join(stateDir, KEY_FILE));
  return Buffer.isBuffer(read) ? read : undefined;
}

/**
 * The key, created on first need (FR-023). The key file appears complete in one step: the key is
 * written to a unique temp file, then hard-linked to `brief-key`, which fails with `EEXIST`
 * without replacing a key another process made first; that key is then read. A malformed key
 * file is never overwritten: the call fails with an `Error` whose `code` is `EINVAL`.
 */
export async function ensureKey(stateDir: string): Promise<Buffer> {
  const file = path.join(stateDir, KEY_FILE);
  const existing = await readKeyFile(file);
  if (Buffer.isBuffer(existing)) {
    return existing;
  }
  if (existing.kind === 'malformed') {
    throw malformed(file);
  }
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const key = randomBytes(32);
  const temp = path.join(
    stateDir,
    `${KEY_FILE}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  );
  await fs.writeFile(temp, `${key.toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  try {
    await fs.link(temp, file);
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    const winner = await readKeyFile(file);
    if (Buffer.isBuffer(winner)) {
      return winner;
    }
    throw winner.kind === 'malformed' ? malformed(file) : error;
  } finally {
    await fs.rm(temp, { force: true });
  }
}

function hmac(key: Buffer, value: unknown): string {
  return `hmac-sha256:${createHmac('sha256', key).update(JSON.stringify(value)).digest('hex')}`;
}

export function makeSigner(key: Buffer): Signer {
  return { sign: payload => hmac(key, payload) };
}

export function sha256Hex(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The sign-off ticket (FR-020 step 2): `hmac-sha256:<64 hex>` over the parts' JSON. */
export function makeTicket(key: Buffer, parts: TicketParts): string {
  return hmac(key, parts);
}

/** Whether an agent-supplied ticket verifies; never throws. */
export function ticketValid(key: Buffer | undefined, ticket: string, parts: TicketParts): boolean {
  if (key === undefined || typeof ticket !== 'string' || !HMAC_TEXT.test(ticket)) {
    return false;
  }
  const expected = makeTicket(key, parts);
  if (ticket.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(ticket, 'utf8'), Buffer.from(expected, 'utf8'));
}

/** Whether a brief's confirmation and approval lines verify (FR-025). */
export interface Verification {
  readonly confirmation: SignatureStatus;
  readonly approval: SignatureStatus;
}

/**
 * The verification of a parsed brief (FR-025), pure given the key: the evaluation's statuses,
 * where `evaluation` is `evaluate` of `parsed.brief` with `makeSigner(key)` as `Facts.signer` when
 * there is a key. With no key nothing verifies: every present line is `invalid`, an absent one
 * `none`. A forged, hand-typed, copied or foreign-key line, a line over changed answers and a
 * Phase 1 `sha256:` line are all `invalid`.
 */
export function verifyBrief(
  parsed: ParsedBrief,
  evaluation: Evaluation,
  key: Buffer | undefined
): Verification {
  if (key === undefined) {
    const { confirmation, approval } = parsed.brief;
    return {
      confirmation: confirmation === undefined ? 'none' : 'invalid',
      approval: approval === undefined ? 'none' : 'invalid',
    };
  }
  return { confirmation: evaluation.confirmationStatus, approval: evaluation.approvalStatus };
}

/** `<dir>/BRIEF.md`, or `undefined` when there is none. */
async function readBriefText(dir: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(dir, BRIEF_FILE), 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return undefined;
    }
    throw error;
  }
}

/**
 * The disk-only verification (FR-025; the Phase 3 hook's read): `<dir>/BRIEF.md` and the key in
 * `stateDir`, parsed and evaluated against the tree, then `verifyBrief`. It writes nothing and
 * never creates the key. A directory with no `BRIEF.md` has no lines (`none`, `none`).
 */
export async function verifyBriefFile(dir: string, stateDir: string): Promise<Verification> {
  const [text, key] = await Promise.all([readBriefText(dir), readKey(stateDir)]);
  const parsed = text === undefined ? EMPTY_PARSED : parseBrief(text);
  const facts = makeFacts(dir, dir);
  const evaluation = evaluate(
    TREE,
    parsed.brief,
    key === undefined ? facts : { ...facts, signer: makeSigner(key) }
  );
  return verifyBrief(parsed, evaluation, key);
}
