/**
 * Spec 059 Phase 2 (FR-001 to FR-008, FR-060, FR-062, FR-064; plan §2): the record of known
 * programs, `<project root>/.eligian/programs.json`.
 *
 * Part 1: the text scan (FR-002), the record format and its lookups. The scan reads a program
 * without the compiler, so this module (and everything it imports) never loads
 * `@eligian/language` (SC-003): the gate and the CLI warning use it on every call.
 *
 * Part 2: the server's record store (first-run scan, read, update; FR-003 to FR-008, P10, P17)
 * and the CLI's first record (`writeFirstRecord`, FR-060).
 */
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect, type Scope, Semaphore } from 'effect';
import { writeFileAtomic } from '../../atomic-write.js';
import { expandPatterns, toGlobPath } from '../../check/files.js';
import { ensureEligianDir } from '../../dev/runtime-reports.js';
import { type ToolError, ToolIoError, toToolError } from '../errors.js';
import { isInside } from '../paths.js';

/** What the text scan reads from a program (FR-002). */
export interface ProgramScan {
  readonly library: boolean;
  readonly timelines: readonly string[];
  readonly languages: readonly string[];
  readonly extensions: boolean;
}

interface Token {
  readonly kind: 'word' | 'string' | 'punct';
  readonly text: string;
}

/** Langium's `ValueConverter.convertString` escapes (the grammar's STRING has no converter of its own). */
const ESCAPES: Readonly<Record<string, string>> = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '0': '\0',
};

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isIdStart = (c: string): boolean => /[A-Za-z_]/.test(c);
const isIdPart = (c: string): boolean => /\w/.test(c);

/**
 * The grammar's tokens (`eligian.langium` terminals): `//` to the end of the line and `/* … *\/`
 * are hidden, strings are `"…"` or `'…'` with `\` escapes (they may span lines), words are IDs,
 * keywords and numbers; anything else is one punctuation character. An unterminated string or
 * block comment ends the token list with what was read.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source.charAt(i);
    const next = source.charAt(i + 1);
    if (c === '/' && next === '/') {
      while (i < n && source.charAt(i) !== '\n' && source.charAt(i) !== '\r') i++;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) return tokens;
      i = end + 2;
    } else if (c === '"' || c === "'") {
      let text = '';
      let j = i + 1;
      while (j < n && source.charAt(j) !== c) {
        const ch = source.charAt(j);
        if (ch === '\\') {
          j++;
          if (j >= n) return tokens;
          const escaped = source.charAt(j);
          text += ESCAPES[escaped] ?? escaped;
        } else {
          text += ch;
        }
        j++;
      }
      if (j >= n) return tokens;
      tokens.push({ kind: 'string', text });
      i = j + 1;
    } else if (isDigit(c)) {
      while (i < n && isDigit(source.charAt(i))) i++;
      if (source.charAt(i) === '.' && isDigit(source.charAt(i + 1))) {
        i++;
        while (i < n && isDigit(source.charAt(i))) i++;
      }
      tokens.push({ kind: 'word', text: '' });
    } else if (isIdStart(c)) {
      const start = i;
      while (i < n && isIdPart(source.charAt(i))) i++;
      tokens.push({ kind: 'word', text: source.slice(start, i) });
    } else if (/\s/.test(c)) {
      i++;
    } else {
      tokens.push({ kind: 'punct', text: c });
      i++;
    }
  }
  return tokens;
}

const isWord = (token: Token | undefined, text: string): boolean =>
  token?.kind === 'word' && token.text === text;
const isPunct = (token: Token | undefined, text: string): boolean =>
  token?.kind === 'punct' && token.text === text;

/**
 * FR-002: a string-aware, comment-aware text scan; pure, synchronous, never throws.
 *
 * The first token decides `library` (the parser's choice between `Library` and `Program`); a
 * `languages { … }` block as the first token gives each entry's code (an entry is `*`? code
 * label); `timeline` followed by a string records the name and `extensions` followed by a string
 * records the block. Neither is checked for nesting: the parser's error recovery resynchronises on
 * the `timeline` keyword after an unclosed block, and so does the scan (a property named
 * `timeline` is followed by `:`, never by a string).
 */
export function scanProgram(source: string): ProgramScan {
  const tokens = tokenize(source);
  const library = isWord(tokens[0], 'library');
  const timelines: string[] = [];
  const languages: string[] = [];
  let extensions = false;
  let i = 0;
  if (!library && isWord(tokens[0], 'languages') && isPunct(tokens[1], '{')) {
    let strings = 0;
    for (i = 2; i < tokens.length && !isPunct(tokens[i], '}'); i++) {
      if (tokens[i].kind !== 'string') continue;
      if (strings % 2 === 0) languages.push(tokens[i].text);
      strings++;
    }
    i++;
  }
  for (; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== 'word') continue;
    const name = tokens[i + 1];
    if (name?.kind !== 'string') continue;
    if (token.text === 'timeline') timelines.push(name.text);
    else if (token.text === 'extensions') extensions = true;
  }
  return { library, timelines, languages, extensions };
}

/** How a program came into the record (FR-001). There is no `starter` value. */
export type Via = 'first-run' | 'brief' | 'addition' | 'accepted' | 'adopted';

const VIAS: readonly Via[] = ['first-run', 'brief', 'addition', 'accepted', 'adopted'];
const MODES = ['elicitation', 'agent-reported'] as const;

export interface RecordEntry {
  /** Root-relative, forward slashes. */
  readonly path: string;
  readonly timelines: readonly string[];
  readonly languages: readonly string[];
  readonly extensions: boolean;
  readonly via: Via;
  /** `via: 'accepted'` only: how the user signed off (FR-009, FR-020). */
  readonly mode?: 'elicitation' | 'agent-reported';
}

/** A parsed record, or the parse problem (FR-006), for the refusal message. */
export type ProgramRecord =
  | { readonly version: 1; readonly programs: readonly RecordEntry[] }
  | { readonly invalid: string };

/** The record file, relative to the project root (FR-001). */
export const RECORD_FILE = path.join('.eligian', 'programs.json');

const byPath = (a: RecordEntry, b: RecordEntry): number =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

/** One entry of the file, or the reason it is not one. */
function entryOf(value: unknown, index: number): RecordEntry | string {
  const at = `programs[${index}]`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `${at} is not an object`;
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.path !== 'string') return `${at}.path is not a string`;
  if (!isStringArray(entry.timelines)) return `${at}.timelines is not a list of strings`;
  if (!isStringArray(entry.languages)) return `${at}.languages is not a list of strings`;
  if (typeof entry.extensions !== 'boolean') return `${at}.extensions is not a boolean`;
  const via = VIAS.find(v => v === entry.via);
  if (via === undefined) return `${at}.via is not one of ${VIAS.join(', ')}`;
  const mode = MODES.find(m => m === entry.mode);
  if (entry.mode !== undefined && mode === undefined) {
    return `${at}.mode is not one of ${MODES.join(', ')}`;
  }
  return {
    path: entry.path,
    timelines: entry.timelines,
    languages: entry.languages,
    extensions: entry.extensions,
    via,
    ...(via === 'accepted' && mode !== undefined ? { mode } : {}),
  };
}

/** FR-006: the record, or `{ invalid }` naming what is wrong (invalid JSON, version, field types). */
export function parseRecord(text: string): ProgramRecord {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { invalid: `programs.json is not valid JSON (${(error as Error).message})` };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { invalid: 'programs.json is not a JSON object' };
  }
  const record = json as Record<string, unknown>;
  if (record.version !== 1) {
    return { invalid: `programs.json has version ${JSON.stringify(record.version)}, not 1` };
  }
  if (!Array.isArray(record.programs)) return { invalid: 'programs.json has no programs list' };
  const programs: RecordEntry[] = [];
  for (const [index, value] of record.programs.entries()) {
    const entry = entryOf(value, index);
    if (typeof entry === 'string') return { invalid: `programs.json: ${entry}` };
    programs.push(entry);
  }
  return { version: 1, programs };
}

/** FR-001, FR-064: sorted by path (code units), 2-space indented, LF, one trailing LF; unsigned. */
export function writeRecordText(programs: readonly RecordEntry[]): string {
  const sorted = [...programs].sort(byPath).map(entry => ({
    path: entry.path,
    timelines: [...entry.timelines],
    languages: [...entry.languages],
    extensions: entry.extensions,
    via: entry.via,
    ...(entry.via === 'accepted' && entry.mode !== undefined ? { mode: entry.mode } : {}),
  }));
  return `${JSON.stringify({ version: 1, programs: sorted }, null, 2)}\n`;
}

/** Case-insensitive on Windows only, as `isInside` compares (`paths.ts`). */
const comparable = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

/** The record's entry for `file` (absolute, either separator), or undefined (SC-020). */
export function entryFor(
  record: ProgramRecord,
  root: string,
  file: string
): RecordEntry | undefined {
  if ('invalid' in record || !isInside(root, file)) return undefined;
  const relative = comparable(toGlobPath(path.relative(path.resolve(root), path.resolve(file))));
  return record.programs.find(entry => comparable(entry.path) === relative);
}

/** FR-053: the nearest `.eligian/programs.json` walking up from `fromDir`; the CLI only. */
export function findRecordFile(fromDir: string): string | undefined {
  let dir = path.resolve(fromDir);
  for (;;) {
    const file = path.join(dir, RECORD_FILE);
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** FR-062: no start-time scan at a filesystem root or the home directory. */
export function skipStartScan(cwd: string, home: string = os.homedir()): boolean {
  const resolved = path.resolve(cwd);
  return (
    path.parse(resolved).root === resolved || (isInside(home, resolved) && isInside(resolved, home))
  );
}

/**
 * FR-003: the non-library programs under `root` as `first-run` entries, sorted by path; reads
 * only. An aborted `signal` stops the reads; the caller discards what was collected.
 */
export async function collectFirstRun(
  root: string,
  signal?: AbortSignal
): Promise<readonly RecordEntry[]> {
  const base = path.resolve(root);
  const entries: RecordEntry[] = [];
  for (const file of await expandPatterns(['.'], base)) {
    if (signal?.aborted) break;
    const scan = scanProgram(await fsp.readFile(file, 'utf-8'));
    if (scan.library) continue;
    entries.push({
      path: toGlobPath(path.relative(base, file)),
      timelines: scan.timelines,
      languages: scan.languages,
      extensions: scan.extensions,
      via: 'first-run',
    });
  }
  return entries.sort(byPath);
}

/** The file's text, `undefined` when it does not exist; any other failure rejects. */
async function readOrUndefined(file: string): Promise<string | undefined> {
  try {
    return await fsp.readFile(file, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * FR-060: the CLI's first record (`eligian init`), written as the first-run scan writes it, minus
 * `exclude` (root-relative or absolute; the starter's `main.eligian`). Written even when it lists
 * no program; an existing record (or one that appears before the rename) is left untouched.
 */
export async function writeFirstRecord(root: string, exclude: readonly string[]): Promise<void> {
  const base = path.resolve(root);
  const file = path.join(base, RECORD_FILE);
  if (fs.existsSync(file)) return;
  const excluded = new Set(
    exclude.map(item => comparable(toGlobPath(path.relative(base, path.resolve(base, item)))))
  );
  const entries = (await collectFirstRun(base)).filter(
    entry => !excluded.has(comparable(entry.path))
  );
  await ensureEligianDir(base);
  await writeFileAtomic(file, writeRecordText(entries), {
    beforeRename: async () => (await readOrUndefined(file)) === undefined,
  });
}

/** The server's test seams (`ServerOptions.brief`). */
export interface RecordStoreOptions {
  /** FR-003: awaited at the start of every first-run scan. */
  readonly beforeScan?: () => Promise<void>;
  /** FR-007: awaited before each update's re-read of the record, before the rename. */
  readonly recordBeforeRename?: (target: string) => Promise<void>;
}

/** What a scan settles to; the stored promise never rejects. */
type ScanResult = { readonly ok: true } | { readonly ok: false; readonly error: unknown };

export interface RecordStore {
  /**
   * FR-003: the server's background part. Adds a finalizer to the scope that aborts every scan of
   * this store, then forks the cwd scan (unless skipStartScan) into that scope. Never fails; the
   * fork returns at once, so the layer build does not wait for the scan.
   */
  readonly start: (cwd: string) => Effect.Effect<void, never, Scope.Scope>;
  /** FR-003/FR-004/FR-062: resolves once `root` has a record, or `root` is never scanned (FR-062). */
  readonly ensureScanned: (root: string) => Effect.Effect<void, ToolError>;
  /** P17 (eligian_project): waits for a running scan, never starts one, never writes. */
  readonly peek: (root: string) => Effect.Effect<ProgramRecord, ToolError>;
  /** FR-005/FR-006: read from disk every call; the last copy when this process saw it and it is gone. */
  readonly read: (root: string) => Effect.Effect<ProgramRecord, ToolError>;
  /** FR-007: merge `entries` (theirs win per path) under the root's semaphore, re-read before rename, at most 5 retries. */
  readonly update: (
    root: string,
    entries: readonly RecordEntry[]
  ) => Effect.Effect<void, ToolError>;
}

const CHANGED_WHILE_WRITING = 'programs.json changed while writing; call again';
/** FR-007: the first write and at most 5 retries. */
const UPDATE_ATTEMPTS = 6;
const EMPTY_RECORD: ProgramRecord = { version: 1, programs: [] };

/** FR-003: a failed scan fails the call `io`, also when the failure carries no errno. */
const scanFailed = (root: string, error: unknown): ToolError => {
  const mapped = toToolError('write', root)(error);
  return mapped._tag === 'ToolIoError'
    ? mapped
    : new ToolIoError({ message: mapped.message, path: root });
};

/** FR-007: union by path; `entries` win for their own paths. */
function mergeEntries(
  base: readonly RecordEntry[],
  entries: readonly RecordEntry[]
): readonly RecordEntry[] {
  const merged = new Map<string, RecordEntry>();
  for (const entry of [...base, ...entries]) merged.set(comparable(entry.path), entry);
  return [...merged.values()].sort(byPath);
}

/**
 * The record store of one server (plan §2). Roots are keyed as `isInside` compares them
 * (lower-cased on win32). Scans are stored as promises that never reject; one store-wide
 * `AbortController` stops them all when the scope given to `start` closes.
 */
export function makeRecordStore(options: RecordStoreOptions = {}): RecordStore {
  const controller = new AbortController();
  const scans = new Map<string, Promise<ScanResult>>();
  const seen = new Set<string>();
  const lastCopies = new Map<string, readonly RecordEntry[]>();
  const locks = new Map<string, Semaphore.Semaphore>();

  const keyOf = (root: string): string => comparable(path.resolve(root));
  const recordFile = (root: string): string => path.join(path.resolve(root), RECORD_FILE);
  const remember = (root: string, programs: readonly RecordEntry[]): void => {
    seen.add(keyOf(root));
    lastCopies.set(keyOf(root), programs);
  };

  /** FR-003, P10: writes only when no record exists at rename time; never merges. */
  async function scanRoot(root: string): Promise<void> {
    const signal = controller.signal;
    // FR-003, SC-022: a root that already has a record (an `eligian init` project) starts no scan
    // at all, so the hook never runs for it; the check after the hook covers a record written
    // while it ran
    if (fs.existsSync(recordFile(root))) {
      seen.add(keyOf(root));
      return;
    }
    await options.beforeScan?.();
    if (signal.aborted) return;
    // FR-003, FR-006: a root that has a record is not scanned; a record that cannot be read (a
    // directory, EACCES) then fails the call's read, naming the file.
    if (fs.existsSync(recordFile(root))) {
      seen.add(keyOf(root));
      return;
    }
    const entries = await collectFirstRun(root, signal);
    if (signal.aborted) return;
    await ensureEligianDir(root);
    const file = recordFile(root);
    const outcome = await writeFileAtomic(file, writeRecordText(entries), {
      beforeRename: async () => !signal.aborted && (await readOrUndefined(file)) === undefined,
    });
    if (outcome === 'written') remember(root, entries);
    else if (fs.existsSync(file)) seen.add(keyOf(root));
  }

  /** The running scan of `root`, or a new one; the forked start scan and a first call share it. */
  const beginScan = (root: string): Promise<ScanResult> => {
    const key = keyOf(root);
    const running = scans.get(key);
    if (running !== undefined) return running;
    const scan = scanRoot(path.resolve(root)).then(
      (): ScanResult => ({ ok: true }),
      (error: unknown): ScanResult => ({ ok: false, error })
    );
    scans.set(key, scan);
    return scan;
  };

  /** A failed scan is dropped, so the next call scans again (the server stays up). */
  const awaitScan = (root: string, scan: Promise<ScanResult>): Effect.Effect<void, ToolError> =>
    Effect.flatMap(
      Effect.promise(() => scan),
      result => {
        if (result.ok) return Effect.void;
        if (scans.get(keyOf(root)) === scan) scans.delete(keyOf(root));
        return Effect.fail(scanFailed(root, result.error));
      }
    );

  const start = (cwd: string): Effect.Effect<void, never, Scope.Scope> =>
    Effect.addFinalizer(() => Effect.sync(() => controller.abort())).pipe(
      Effect.andThen(
        Effect.suspend(() =>
          skipStartScan(cwd)
            ? Effect.void
            : Effect.asVoid(Effect.forkScoped(Effect.promise(() => beginScan(cwd))))
        )
      )
    );

  const ensureScanned = (root: string): Effect.Effect<void, ToolError> =>
    Effect.suspend(() => {
      const key = keyOf(root);
      if (seen.has(key)) return Effect.void;
      const running = scans.get(key);
      if (running !== undefined) return awaitScan(root, running);
      if (fs.existsSync(recordFile(root))) {
        seen.add(key);
        return Effect.void;
      }
      if (skipStartScan(root)) return Effect.void;
      return awaitScan(root, beginScan(root));
    });

  /** FR-005, FR-006: ENOENT → the last copy (or none); invalid → `{ invalid }`, file kept. */
  async function readRecord(root: string): Promise<ProgramRecord> {
    const key = keyOf(root);
    const text = await readOrUndefined(recordFile(root));
    if (text === undefined) {
      return { version: 1, programs: seen.has(key) ? (lastCopies.get(key) ?? []) : [] };
    }
    const record = parseRecord(text);
    if ('invalid' in record) seen.add(key);
    else remember(root, record.programs);
    return record;
  }

  const read = (root: string): Effect.Effect<ProgramRecord, ToolError> =>
    Effect.tryPromise({
      try: () => readRecord(root),
      catch: toToolError('write', recordFile(root)),
    });

  const peek = (root: string): Effect.Effect<ProgramRecord, ToolError> =>
    Effect.suspend(() => {
      const running = scans.get(keyOf(root));
      return running === undefined ? Effect.void : Effect.asVoid(Effect.promise(() => running));
    }).pipe(
      Effect.andThen(
        Effect.suspend((): Effect.Effect<ProgramRecord, ToolError> => {
          if (seen.has(keyOf(root)) || fs.existsSync(recordFile(root))) return read(root);
          if (skipStartScan(root)) return Effect.succeed(EMPTY_RECORD);
          return Effect.tryPromise({
            try: async (): Promise<ProgramRecord> => ({
              version: 1,
              programs: await collectFirstRun(root),
            }),
            catch: toToolError('write', root),
          });
        })
      )
    );

  const lockFor = (root: string): Semaphore.Semaphore => {
    const key = keyOf(root);
    const known = locks.get(key);
    if (known !== undefined) return known;
    const lock = Semaphore.makeUnsafe(1);
    locks.set(key, lock);
    return lock;
  };

  /** FR-007: `true` when written, `false` when the file changed before every rename. */
  async function updateRecord(root: string, entries: readonly RecordEntry[]): Promise<boolean> {
    const file = recordFile(root);
    await ensureEligianDir(path.resolve(root));
    for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt++) {
      const baseText = await readOrUndefined(file);
      const parsed = baseText === undefined ? undefined : parseRecord(baseText);
      const base =
        parsed === undefined
          ? (lastCopies.get(keyOf(root)) ?? [])
          : 'invalid' in parsed
            ? []
            : parsed.programs;
      const merged = mergeEntries(base, entries);
      const outcome = await writeFileAtomic(file, writeRecordText(merged), {
        beforeRename: async () => {
          await options.recordBeforeRename?.(file);
          return (await readOrUndefined(file)) === baseText;
        },
      });
      if (outcome === 'written') {
        remember(root, merged);
        return true;
      }
    }
    return false;
  }

  const update = (
    root: string,
    entries: readonly RecordEntry[]
  ): Effect.Effect<void, ToolError> => {
    const file = recordFile(root);
    return lockFor(root).withPermits(1)(
      Effect.uninterruptible(
        Effect.tryPromise({
          try: () => updateRecord(root, entries),
          catch: toToolError('write', file),
        }).pipe(
          Effect.flatMap(written =>
            written
              ? Effect.void
              : Effect.fail(new ToolIoError({ message: CHANGED_WHILE_WRITING, path: file }))
          )
        )
      )
    );
  };

  return { start, ensureScanned, peek, read, update };
}
