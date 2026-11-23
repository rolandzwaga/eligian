/**
 * Spec 059 Phase 2, `brief/known-programs.ts` part 1 (FR-001, FR-002, FR-062 predicate, FR-064,
 * SC-003, SC-020, SC-024 record half): the text scan equals the parser on every program in the
 * repo, the record format, `entryFor`, `findRecordFile`, `skipStartScan`, `collectFirstRun`, and
 * the purity of the record code (no `@eligian/language`, no `check-command`, no stdout).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  hostModuleOf,
  isValidLanguageCode,
  type Program,
  STARTERS,
  starterFiles,
  withLoadedDocuments,
} from '@eligian/language';
import { timelineNames } from '@eligian/language/mcp';
import { Effect, Exit, Scope } from 'effect';
import { glob } from 'tinyglobby';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLibrary } from '../check/files.js';
import { runInit } from '../init.js';
import {
  collectFirstRun,
  entryFor,
  findRecordFile,
  makeRecordStore,
  type ProgramRecord,
  parseRecord,
  RECORD_FILE,
  type RecordEntry,
  scanProgram,
  skipStartScan,
  writeFirstRecord,
  writeRecordText,
} from '../mcp/brief/known-programs.js';
import { LANGUAGE_CODE } from '../mcp/brief/references.js';
import type { TelemetryLine } from '../mcp/telemetry.js';
import * as brief from '../mcp/tools/brief.js';
import { approvedBrief } from './brief-helpers.js';
import { type SpawnedServer, spawnServer, startInMemoryServer } from './mcp-test-client.js';

const win32 = process.platform === 'win32';
const SRC = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(SRC, '..', '..', '..');

const tempDir = (prefix: string): string =>
  fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

const write = (root: string, relative: string, text: string): string => {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

describe('scanProgram equals the parser', () => {
  let starters: string;

  beforeEach(() => {
    starters = tempDir('eligian-scan-starters-');
  });

  afterEach(() => {
    fs.rmSync(starters, { recursive: true, force: true });
  });

  it('every .eligian under examples/, cli fixtures, language fixtures and every starter', async () => {
    const repoFiles = await glob(
      [
        'examples/**/*.eligian',
        'packages/cli/src/__tests__/__fixtures__/**/*.eligian',
        'packages/language/src/__tests__/**/*.eligian',
      ],
      { cwd: REPO, absolute: true, onlyFiles: true, ignore: ['**/node_modules/**'] }
    );
    const starterEligian: string[] = [];
    for (const starter of STARTERS) {
      for (const [relative, text] of Object.entries(starterFiles(starter.name))) {
        if (relative.endsWith('.eligian')) {
          starterEligian.push(write(starters, `${starter.name}/${relative}`, text));
        }
      }
    }
    const files = [...repoFiles.map(file => path.resolve(file)), ...starterEligian];
    console.log(`scanProgram equals the parser: ${files.length} files`);
    expect(files.length).toBeGreaterThan(20);

    // One load: each document's parse result is its own, whatever else is loaded beside it
    const parsed = await withLoadedDocuments(files, loaded =>
      files.map(file => {
        const root = loaded.documentOf(file)?.parseResult.value;
        if (root === undefined) return { file, expected: undefined };
        const library = root.$type === 'Library';
        if (library) return { file, expected: { library: true } };
        const program = root as Program;
        return {
          file,
          expected: {
            library: false,
            timelines: timelineNames(program),
            languages: (program.languages?.entries ?? []).map(entry => entry.code),
            extensions: hostModuleOf(program) !== undefined,
          },
        };
      })
    );

    for (const { file, expected } of parsed) {
      expect(expected, file).toBeDefined();
      const source = fs.readFileSync(file, 'utf-8');
      const scan = scanProgram(source);
      if (expected?.library) {
        expect(scan.library, file).toBe(true);
        expect(isLibrary(source), file).toBe(true);
      } else {
        expect(scan, file).toEqual(expected);
        expect(isLibrary(source), file).toBe(false);
      }
    }
  }, 120_000);

  it('a URL string is a string, not a line comment', () => {
    const scan = scanProgram('timeline "https://x" in "#s" using raf {}\n');
    expect(scan.timelines).toEqual(['https://x']);
  });

  it('a timeline inside a comment is no timeline', () => {
    const scan = scanProgram('// timeline "Hidden" in "#s" using raf {}\n');
    expect(scan.timelines).toEqual([]);
    expect(scanProgram('/* timeline "Hidden" */').timelines).toEqual([]);
  });

  it('a block comment between timeline and its name', () => {
    const scan = scanProgram('timeline /* c */ "Named" in "#s" using raf {}\n');
    expect(scan.timelines).toEqual(['Named']);
  });

  it('the contrived file: the scan follows the parser where isLibrary does not', () => {
    const source = '// a /*\nlibrary x\naction f() [\n  log("*/")\n]\n';
    expect(scanProgram(source).library).toBe(true);
    expect(isLibrary(source)).toBe(false);
  });

  it('an unterminated string ends the scan with what was read, without throwing', () => {
    const source = 'timeline "A" in "#s" using raf {}\ntimeline "B in #t using raf {}\n';
    expect(() => scanProgram(source)).not.toThrow();
    expect(scanProgram(source).timelines).toEqual(['A']);
    expect(scanProgram('timeline "A" in "#s" using raf {}\n/* open').timelines).toEqual(['A']);
  });

  it('the languages block gives each entry its code', () => {
    const scan = scanProgram(
      'languages { * "en-US" "English" "nl-NL" "Nederlands" }\ntimeline "A" in "#s" using raf {}\n'
    );
    expect(scan.languages).toEqual(['en-US', 'nl-NL']);
    expect(scan.timelines).toEqual(['A']);
  });

  it('an extensions block', () => {
    const scan = scanProgram(
      'extensions "./host.ts" {\n  operation trackEvent(eventName: string)\n}\n'
    );
    expect(scan.extensions).toBe(true);
    expect(scanProgram('timeline "A" in "#s" using raf {}\n').extensions).toBe(false);
  });

  it('escapes in names are read as the parser reads them', () => {
    const scan = scanProgram(
      'timeline "a \\"b\\"" in "#s" using raf {}\ntimeline \'c\' in "#s" using raf {}'
    );
    expect(scan.timelines).toEqual(['a "b"', 'c']);
  });
});

describe('record format', () => {
  const entries: RecordEntry[] = [
    {
      path: 'talk/main.eligian',
      timelines: ['Intro'],
      languages: ['en-US'],
      extensions: false,
      via: 'first-run',
    },
    {
      path: 'a.eligian',
      timelines: ['A', 'B'],
      languages: [],
      extensions: true,
      via: 'accepted',
      mode: 'agent-reported',
    },
    { path: 'B.eligian', timelines: [], languages: [], extensions: false, via: 'brief' },
  ];

  it('parseRecord(writeRecordText(entries)) round-trips', () => {
    const record = parseRecord(writeRecordText(entries));
    expect(record).toEqual({ version: 1, programs: [entries[2], entries[1], entries[0]] });
  });

  it('sorted by path in code-unit order, 2-space, LF, one trailing LF, exactly the keys', () => {
    const text = writeRecordText([
      ...entries,
      // a mode outside `accepted` is not written
      {
        path: 'c.eligian',
        timelines: [],
        languages: [],
        extensions: false,
        via: 'adopted',
        mode: 'elicitation',
      },
    ]);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('\r');
    expect(text.split('\n')[1]).toBe('  "version": 1,');
    const json = JSON.parse(text) as { programs: Record<string, unknown>[] };
    expect(Object.keys(json)).toEqual(['version', 'programs']);
    expect(json.programs.map(entry => entry.path)).toEqual([
      'B.eligian',
      'a.eligian',
      'c.eligian',
      'talk/main.eligian',
    ]);
    for (const entry of json.programs) {
      const keys = ['path', 'timelines', 'languages', 'extensions', 'via'];
      expect(Object.keys(entry)).toEqual(entry.via === 'accepted' ? [...keys, 'mode'] : keys);
    }
    // FR-064, SC-024: no signature field anywhere
    expect(text).not.toMatch(/hmac|signature|sha256/i);
  });

  it.each([
    ['invalid JSON', '{ "version": 1, '],
    ['version 2', '{ "version": 2, "programs": [] }'],
    ['a non-array programs', '{ "version": 1, "programs": {} }'],
    [
      'a non-string path',
      '{ "version": 1, "programs": [{ "path": 3, "timelines": [], "languages": [], "extensions": false, "via": "brief" }] }',
    ],
    [
      'an unknown via',
      '{ "version": 1, "programs": [{ "path": "a.eligian", "timelines": [], "languages": [], "extensions": false, "via": "starter" }] }',
    ],
    ['not an object', '[]'],
  ])('parseRecord: %s → { invalid }', (_name, text) => {
    const record = parseRecord(text);
    expect('invalid' in record).toBe(true);
    if ('invalid' in record) expect(record.invalid.length).toBeGreaterThan(0);
  });

  describe('entryFor (SC-020)', () => {
    const root = path.resolve('/projects/app');
    const record: ProgramRecord = parseRecord(writeRecordText(entries));

    it('matches a native-separator path and a forward-slash path', () => {
      expect(entryFor(record, root, path.join(root, 'talk', 'main.eligian'))?.path).toBe(
        'talk/main.eligian'
      );
      expect(entryFor(record, root, `${root}/talk/main.eligian`)?.path).toBe('talk/main.eligian');
      expect(entryFor(record, root, path.join(root, 'nope.eligian'))).toBeUndefined();
      expect(entryFor(record, root, path.resolve(root, '..', 'talk', 'main.eligian'))).toBe(
        undefined
      );
      expect(entryFor({ invalid: 'x' }, root, path.join(root, 'a.eligian'))).toBeUndefined();
    });

    it.runIf(win32)('matches a backslash path and the other drive-letter case on win32', () => {
      expect(entryFor(record, root, `${root}\\talk\\main.eligian`)?.path).toBe('talk/main.eligian');
      const drive = root.charAt(0);
      const other = drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase();
      expect(
        entryFor(record, `${other}${root.slice(1)}`, `${root}\\talk\\main.eligian`)?.path
      ).toBe('talk/main.eligian');
      expect(entryFor(record, root, `${other}${root.slice(1)}\\TALK\\main.eligian`)?.path).toBe(
        'talk/main.eligian'
      );
    });

    it.skipIf(win32)('does not match case-insensitively on Linux', () => {
      expect(entryFor(record, root, path.join(root, 'TALK', 'main.eligian'))).toBeUndefined();
      expect(entryFor(record, root, path.join(root, 'b.eligian'))).toBeUndefined();
    });
  });

  describe('findRecordFile', () => {
    let root: string;

    beforeEach(() => {
      root = tempDir('eligian-record-find-');
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('the nearest .eligian/programs.json walking up', () => {
      const outer = write(root, '.eligian/programs.json', writeRecordText([]));
      const inner = write(root, 'talk/.eligian/programs.json', writeRecordText([]));
      fs.mkdirSync(path.join(root, 'talk', 'deep', 'er'), { recursive: true });
      fs.mkdirSync(path.join(root, 'other'), { recursive: true });
      expect(findRecordFile(path.join(root, 'talk', 'deep', 'er'))).toBe(inner);
      expect(findRecordFile(path.join(root, 'other'))).toBe(outer);
      expect(findRecordFile(root)).toBe(outer);
      expect(RECORD_FILE).toBe(path.join('.eligian', 'programs.json'));
    });

    it('a .eligian directory without programs.json is not a record', () => {
      const outer = write(root, '.eligian/programs.json', writeRecordText([]));
      fs.mkdirSync(path.join(root, 'talk', '.eligian'), { recursive: true });
      expect(findRecordFile(path.join(root, 'talk'))).toBe(outer);
    });
  });
});

describe('skipStartScan (FR-062)', () => {
  let project: string;

  beforeEach(() => {
    project = tempDir('eligian-skip-scan-');
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('true for path.parse(cwd).root', () => {
    expect(skipStartScan(path.parse(process.cwd()).root)).toBe(true);
    expect(skipStartScan(path.parse(project).root, project)).toBe(true);
  });

  it('true for the home dir passed as home', () => {
    expect(skipStartScan(project, project)).toBe(true);
    expect(skipStartScan(os.homedir())).toBe(true);
  });

  it.runIf(win32)('true for the home dir in another case on win32', () => {
    expect(skipStartScan(project.toUpperCase(), project.toLowerCase())).toBe(true);
  });

  it('false for a temp project', () => {
    expect(skipStartScan(project)).toBe(false);
    expect(skipStartScan(path.join(project, 'sub'), project)).toBe(false);
  });
});

describe('collectFirstRun', () => {
  let root: string;

  beforeEach(() => {
    root = tempDir('eligian-first-run-');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('a.eligian (program) and lib.eligian (library) → exactly a.eligian via first-run', async () => {
    write(
      root,
      'a.eligian',
      'languages { "en-US" "English" }\ntimeline "Intro" in "#s" using raf {}\n'
    );
    write(root, 'lib.eligian', '/** shared */\nlibrary lib\naction f() [\n]\n');
    expect(await collectFirstRun(root)).toEqual([
      {
        path: 'a.eligian',
        timelines: ['Intro'],
        languages: ['en-US'],
        extensions: false,
        via: 'first-run',
      },
    ]);
  });

  it('node_modules is skipped', async () => {
    write(root, 'a.eligian', 'timeline "A" in "#s" using raf {}\n');
    write(root, 'node_modules/pkg/x.eligian', 'timeline "X" in "#s" using raf {}\n');
    const entries = await collectFirstRun(root);
    expect(entries.map(entry => entry.path)).toEqual(['a.eligian']);
  });

  it('paths are root-relative with /', async () => {
    write(root, 'talk/deep/main.eligian', 'timeline "T" in "#s" using raf {}\n');
    write(root, 'b.eligian', 'timeline "B" in "#s" using raf {}\n');
    const entries = await collectFirstRun(root);
    expect(entries.map(entry => entry.path)).toEqual(['b.eligian', 'talk/deep/main.eligian']);
  });
});

/** A seam that holds until `release()`; `entered` resolves when it is first called. */
interface HeldSeam {
  readonly seam: () => Promise<void>;
  readonly entered: Promise<void>;
  readonly release: () => void;
  readonly calls: () => number;
}

function holdSeam(): HeldSeam {
  let enter = () => {};
  let release = () => {};
  const entered = new Promise<void>(resolve => {
    enter = resolve;
  });
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  let calls = 0;
  return {
    seam: () => {
      calls++;
      enter();
      return released;
    },
    entered,
    release,
    calls: () => calls,
  };
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Whether `promise` is still pending after `ms`. */
async function pendingAfter(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await sleep(ms);
  return !settled;
}

const firstRun = (file: string, timeline: string): RecordEntry => ({
  path: file,
  timelines: [timeline],
  languages: [],
  extensions: false,
  via: 'first-run',
});

describe('record store', () => {
  let root: string;
  const scopes: Scope.Closeable[] = [];

  beforeEach(() => {
    root = tempDir('eligian-record-store-');
  });

  afterEach(async () => {
    for (const scope of scopes.splice(0)) await Effect.runPromise(Scope.close(scope, Exit.void));
    fs.rmSync(root, { recursive: true, force: true });
  });

  const recordFile = (): string => path.join(root, RECORD_FILE);
  const recordJson = (): unknown => JSON.parse(fs.readFileSync(recordFile(), 'utf-8'));
  const program = (file: string, timeline: string): string =>
    write(root, file, `timeline "${timeline}" in "#s" using raf {}\n`);
  const library = (file: string): string =>
    write(root, file, '/** shared */\nlibrary lib\naction f() [\n]\n');
  const writeRecord = (programs: readonly RecordEntry[]): string =>
    write(root, '.eligian/programs.json', writeRecordText(programs));
  const newScope = (): Scope.Closeable => {
    const scope = Scope.makeUnsafe();
    scopes.push(scope);
    return scope;
  };

  it('start(cwd) scans a.eligian and lib.eligian: programs.json lists exactly a.eligian via first-run; .eligian/.gitignore is "*\\n"', async () => {
    program('a.eligian', 'A');
    library('lib.eligian');
    const store = makeRecordStore();
    await Effect.runPromise(Scope.provide(newScope())(store.start(root)));
    await Effect.runPromise(store.ensureScanned(root));
    expect(recordJson()).toEqual({ version: 1, programs: [firstRun('a.eligian', 'A')] });
    expect(fs.readFileSync(path.join(root, '.eligian', '.gitignore'), 'utf-8')).toBe('*\n');
  });

  it('start returns before beforeScan resolves', async () => {
    program('a.eligian', 'A');
    const held = holdSeam();
    const store = makeRecordStore({ beforeScan: held.seam });
    await Effect.runPromise(Scope.provide(newScope())(store.start(root)));
    await held.entered;
    expect(fs.existsSync(recordFile())).toBe(false);
    held.release();
    await Effect.runPromise(store.ensureScanned(root));
    expect(fs.existsSync(recordFile())).toBe(true);
  });

  it('ensureScanned waits for the running scan', async () => {
    program('a.eligian', 'A');
    const held = holdSeam();
    const store = makeRecordStore({ beforeScan: held.seam });
    await Effect.runPromise(Scope.provide(newScope())(store.start(root)));
    await held.entered;
    const scanned = Effect.runPromise(store.ensureScanned(root));
    expect(await pendingAfter(scanned, 300)).toBe(true);
    held.release();
    await scanned;
    expect(recordJson()).toEqual({ version: 1, programs: [firstRun('a.eligian', 'A')] });
    expect(held.calls()).toBe(1);
  });

  it('a beforeScan that rejects once: ensureScanned fails ToolIoError; the next ensureScanned scans again and succeeds', async () => {
    program('a.eligian', 'A');
    let calls = 0;
    const store = makeRecordStore({
      beforeScan: async () => {
        calls++;
        if (calls === 1) throw new Error('scan held up');
      },
    });
    const error = await Effect.runPromise(Effect.flip(store.ensureScanned(root)));
    expect(error._tag).toBe('ToolIoError');
    expect(error.message).toContain('scan held up');
    expect(fs.existsSync(recordFile())).toBe(false);
    await Effect.runPromise(store.ensureScanned(root));
    expect(calls).toBe(2);
    expect(recordJson()).toEqual({ version: 1, programs: [firstRun('a.eligian', 'A')] });
  });

  it('a file named .eligian in the root: ensureScanned fails ToolIoError, no unhandled rejection', async () => {
    program('a.eligian', 'A');
    write(root, '.eligian', 'not a directory');
    const rejections: unknown[] = [];
    const spy = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', spy);
    try {
      const store = makeRecordStore();
      await Effect.runPromise(Scope.provide(newScope())(store.start(root)));
      const error = await Effect.runPromise(Effect.flip(store.ensureScanned(root)));
      expect(error._tag).toBe('ToolIoError');
      await sleep(0);
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', spy);
    }
  });

  it('closing the scope while beforeScan holds the scan: after release, no .eligian/programs.json appears', async () => {
    program('a.eligian', 'A');
    const held = holdSeam();
    const store = makeRecordStore({ beforeScan: held.seam });
    const scope = Scope.makeUnsafe();
    await Effect.runPromise(Scope.provide(scope)(store.start(root)));
    await held.entered;
    await Effect.runPromise(Scope.close(scope, Exit.void));
    held.release();
    await sleep(300);
    expect(fs.existsSync(recordFile())).toBe(false);
  });

  it('first-run never merges (P10)', async () => {
    program('a.eligian', 'A');
    const foreign = writeRecordText([firstRun('x.eligian', 'X')]);
    const store = makeRecordStore({
      beforeScan: async () => {
        // another process writes the first record after this scan started, before its rename
        write(root, '.eligian/programs.json', foreign);
      },
    });
    await Effect.runPromise(store.ensureScanned(root));
    expect(fs.readFileSync(recordFile(), 'utf-8')).toBe(foreign);
    expect(await Effect.runPromise(store.read(root))).toEqual({
      version: 1,
      programs: [firstRun('x.eligian', 'X')],
    });
  });

  it('read: ENOENT after this store saw the record returns the last copy; update writes that copy back plus the new entry', async () => {
    const seen = [firstRun('a.eligian', 'A')];
    writeRecord(seen);
    const store = makeRecordStore();
    expect(await Effect.runPromise(store.read(root))).toEqual({ version: 1, programs: seen });
    fs.rmSync(recordFile());
    expect(await Effect.runPromise(store.read(root))).toEqual({ version: 1, programs: seen });
    await Effect.runPromise(store.ensureScanned(root));
    expect(fs.existsSync(recordFile())).toBe(false);
    const added: RecordEntry = { ...firstRun('b.eligian', 'B'), via: 'brief' };
    await Effect.runPromise(store.update(root, [added]));
    expect(recordJson()).toEqual({ version: 1, programs: [...seen, added] });
  });

  it('read: invalid JSON → { invalid }, file unchanged', async () => {
    const text = '{ "version": 1, "programs": [';
    write(root, '.eligian/programs.json', text);
    const store = makeRecordStore();
    const record = await Effect.runPromise(store.read(root));
    expect('invalid' in record && record.invalid).toMatch(/not valid JSON/);
    await Effect.runPromise(store.ensureScanned(root));
    expect(fs.readFileSync(recordFile(), 'utf-8')).toBe(text);
  });

  it('read: programs.json is a directory → ToolIoError naming the path', async () => {
    fs.mkdirSync(recordFile(), { recursive: true });
    const store = makeRecordStore();
    const error = await Effect.runPromise(Effect.flip(store.read(root)));
    expect(error._tag).toBe('ToolIoError');
    expect(error.path).toBe(recordFile());
  });

  it("update (a): a recordBeforeRename that writes a foreign x.eligian once → both entries, the call's values win for its own path", async () => {
    writeRecord([firstRun('a.eligian', 'A')]);
    let calls = 0;
    const store = makeRecordStore({
      recordBeforeRename: async target => {
        calls++;
        if (calls === 1) {
          fs.writeFileSync(
            target,
            writeRecordText([firstRun('a.eligian', 'Foreign'), firstRun('x.eligian', 'X')])
          );
        }
      },
    });
    const mine: RecordEntry = { ...firstRun('a.eligian', 'Mine'), via: 'brief' };
    await Effect.runPromise(store.update(root, [mine]));
    expect(calls).toBe(2);
    expect(recordJson()).toEqual({ version: 1, programs: [mine, firstRun('x.eligian', 'X')] });
  });

  it('update (b): a seam that rewrites the file before every rename → ToolIoError "programs.json changed while writing; call again" after the seam ran exactly 6 times; the foreign file is on disk', async () => {
    writeRecord([firstRun('a.eligian', 'A')]);
    let calls = 0;
    let foreign = '';
    const store = makeRecordStore({
      recordBeforeRename: async target => {
        calls++;
        foreign = writeRecordText([firstRun(`x${calls}.eligian`, 'X')]);
        fs.writeFileSync(target, foreign);
      },
    });
    const error = await Effect.runPromise(
      Effect.flip(store.update(root, [{ ...firstRun('b.eligian', 'B'), via: 'brief' }]))
    );
    expect(error._tag).toBe('ToolIoError');
    expect(error.message).toBe('programs.json changed while writing; call again');
    expect(error.path).toBe(recordFile());
    expect(calls).toBe(6);
    expect(fs.readFileSync(recordFile(), 'utf-8')).toBe(foreign);
    expect(fs.readdirSync(path.join(root, '.eligian')).filter(f => f.endsWith('.tmp'))).toEqual([]);
  });

  it('peek never writes (P17)', async () => {
    program('a.eligian', 'A');
    library('lib.eligian');
    const store = makeRecordStore();
    expect(await Effect.runPromise(store.peek(root))).toEqual({
      version: 1,
      programs: await collectFirstRun(root),
    });
    expect(fs.existsSync(path.join(root, '.eligian'))).toBe(false);

    const fsRoot = path.parse(root).root;
    expect(skipStartScan(fsRoot)).toBe(true);
    expect(await Effect.runPromise(store.peek(fsRoot))).toEqual({ version: 1, programs: [] });
  });

  it('peek waits for a running scan', async () => {
    program('a.eligian', 'A');
    const held = holdSeam();
    const store = makeRecordStore({ beforeScan: held.seam });
    await Effect.runPromise(Scope.provide(newScope())(store.start(root)));
    await held.entered;
    const peeked = Effect.runPromise(store.peek(root));
    expect(await pendingAfter(peeked, 300)).toBe(true);
    held.release();
    expect(await peeked).toEqual({ version: 1, programs: [firstRun('a.eligian', 'A')] });
    expect(held.calls()).toBe(1);
  });

  it('500 programs are recorded whole', async () => {
    for (let i = 0; i < 500; i++) {
      program(`p/${String(i).padStart(3, '0')}.eligian`, `T${i}`);
    }
    const store = makeRecordStore();
    await Effect.runPromise(store.ensureScanned(root));
    const record = await Effect.runPromise(store.read(root));
    expect('programs' in record && record.programs.length).toBe(500);
  }, 30_000);
});

describe('writeFirstRecord (FR-060)', () => {
  let root: string;

  beforeEach(() => {
    root = tempDir('eligian-first-record-');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const recordFile = (): string => path.join(root, RECORD_FILE);

  it('an empty dir → { version: 1, programs: [] } and .gitignore', async () => {
    await writeFirstRecord(root, ['main.eligian']);
    expect(fs.readFileSync(recordFile(), 'utf-8')).toBe(writeRecordText([]));
    expect(JSON.parse(fs.readFileSync(recordFile(), 'utf-8'))).toEqual({
      version: 1,
      programs: [],
    });
    expect(fs.readFileSync(path.join(root, '.eligian', '.gitignore'), 'utf-8')).toBe('*\n');
  });

  it('a.eligian + lib.eligian + main.eligian (excluded) → exactly a.eligian via first-run', async () => {
    write(root, 'a.eligian', 'timeline "A" in "#s" using raf {}\n');
    write(root, 'lib.eligian', 'library lib\naction f() [\n]\n');
    write(root, 'main.eligian', 'timeline "Main" in "#s" using raf {}\n');
    await writeFirstRecord(root, ['main.eligian']);
    expect(JSON.parse(fs.readFileSync(recordFile(), 'utf-8'))).toEqual({
      version: 1,
      programs: [firstRun('a.eligian', 'A')],
    });
  });

  it('an existing programs.json is byte-identical afterwards', async () => {
    write(root, 'a.eligian', 'timeline "A" in "#s" using raf {}\n');
    const text = '{"version":1,"programs":[]}';
    write(root, '.eligian/programs.json', text);
    await writeFirstRecord(root, ['main.eligian']);
    expect(fs.readFileSync(recordFile(), 'utf-8')).toBe(text);
  });
});

/** T037 (FR-060, FR-003, P9, SC-022): the record `eligian init` writes, then a server in that dir. */
describe('server after eligian init', () => {
  const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');
  const AGENT_DOCS = path.join(import.meta.dirname, '__fixtures__', 'agents', 'docs');
  let root: string;
  let stateDir: string;

  beforeEach(() => {
    root = tempDir('eligian-init-record-');
    stateDir = tempDir('eligian-init-record-state-');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it('a server started in that dir does not scan (beforeScan: vi.fn() never called); eligian_check on main.eligian fails brief-required and on a.eligian runs', async () => {
    write(root, 'a.eligian', 'timeline "A" in "#s" using raf {}\n');
    const outcome = await runInit('.', {
      template: 'blank',
      force: false,
      cwd: root,
      agents: [],
      docsRoot: AGENT_DOCS,
      firstRecord: true,
    });
    expect(outcome.exitCode).toBe(0);
    const record = fs.readFileSync(path.join(root, RECORD_FILE), 'utf-8');
    expect(JSON.parse(record)).toEqual({ version: 1, programs: [firstRun('a.eligian', 'A')] });

    const beforeScan = vi.fn(async () => {});
    const server = await startInMemoryServer({
      cwd: root,
      docsRoot: DOCS,
      brief: { stateDir, beforeScan },
    });
    try {
      const refused = await server.callTool('eligian_check', { paths: ['main.eligian'] });
      expect(refused.isError, JSON.stringify(refused.payload)).toBe(true);
      expect(refused.payload.error.gate.code).toBe('brief-required');
      const runs = await server.callTool('eligian_check', { paths: ['a.eligian'] });
      expect(runs.isError, JSON.stringify(runs.payload)).toBe(false);
    } finally {
      await server.close();
    }
    expect(beforeScan).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(root, RECORD_FILE), 'utf-8')).toBe(record);
  });

  it('eligian_init through the MCP tool never writes a first record (only the CLI passes firstRecord)', async () => {
    const server = await startInMemoryServer({
      cwd: root,
      docsRoot: AGENT_DOCS,
      brief: { stateDir },
    });
    try {
      await approvedBrief(server, root, { stateDir });
      // The record is gone (the server keeps its last copy, FR-005) and a.eligian arrived: a
      // first record written by runInit would list a.eligian via first-run, and the FR-061
      // update would merge it in.
      fs.rmSync(path.join(root, RECORD_FILE));
      write(root, 'a.eligian', 'timeline "A" in "#s" using raf {}\n');
      const result = await server.callTool('eligian_init', { directory: root, template: 'blank' });
      expect(result.isError, JSON.stringify(result.payload)).toBe(false);
      expect(fs.existsSync(path.join(root, 'main.eligian'))).toBe(true);
      const record = parseRecord(fs.readFileSync(path.join(root, RECORD_FILE), 'utf-8'));
      if ('invalid' in record) throw new Error(record.invalid);
      expect(record.programs.map(entry => [entry.path, entry.via])).toEqual([
        ['main.eligian', 'brief'],
      ]);
    } finally {
      await server.close();
    }
  });
});

/** T021 (FR-003, FR-005, SC-015 in process): the server's record store and its start-time scan. */
describe('server', () => {
  const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');
  let root: string;
  let stateDir: string;

  beforeEach(() => {
    root = tempDir('eligian-record-server-');
    stateDir = tempDir('eligian-record-state-');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  const recordFile = (): string => path.join(root, RECORD_FILE);
  const initialize = {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'record-server-spec', version: '0' },
  };
  const projectFiles = (): void => {
    write(root, 'a.eligian', 'timeline "A" in "#s" using raf {}\n');
    write(root, 'lib.eligian', '/** shared */\nlibrary lib\naction f() [\n]\n');
  };

  it('first run: the first server in a project with a.eligian and lib.eligian writes programs.json with exactly a.eligian via first-run after an eligian_brief status', async () => {
    projectFiles();
    const server = await startInMemoryServer({ cwd: root, docsRoot: DOCS, brief: { stateDir } });
    try {
      const result = await server.callTool(brief.NAME, { action: 'status' });
      expect(result.isError).toBe(false);
      expect(JSON.parse(fs.readFileSync(recordFile(), 'utf-8'))).toEqual({
        version: 1,
        programs: [firstRun('a.eligian', 'A')],
      });
    } finally {
      await server.close();
    }
  });

  it('beforeScan holds the scan: initialize is answered while it is pending; an eligian_check and an eligian_brief status sent then are both still pending 300 ms later; after release the check runs on a program that existed at start and the status returns', async () => {
    projectFiles();
    const held = holdSeam();
    const server = await startInMemoryServer({
      cwd: root,
      docsRoot: DOCS,
      brief: { stateDir, beforeScan: held.seam },
    });
    try {
      await held.entered;
      const init = await server.request('initialize', initialize);
      expect(init.error).toBeUndefined();
      await server.notify('notifications/initialized');
      const check = server.callTool('eligian_check', { paths: ['a.eligian'] });
      const status = server.callTool(brief.NAME, { action: 'status' });
      const [checkPending, statusPending] = await Promise.all([
        pendingAfter(check, 300),
        pendingAfter(status, 300),
      ]);
      expect(checkPending).toBe(true);
      expect(statusPending).toBe(true);
      expect(fs.existsSync(recordFile())).toBe(false);
      held.release();
      const checked = await check;
      // Not brief-required: a.eligian existed at start, so the scan records it via first-run.
      expect(checked.isError, JSON.stringify(checked.payload)).toBe(false);
      const result = await status;
      expect(result.isError).toBe(false);
      expect(JSON.parse(fs.readFileSync(recordFile(), 'utf-8'))).toEqual({
        version: 1,
        programs: [firstRun('a.eligian', 'A')],
      });
      expect(held.calls()).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('beforeScan rejects once: the server stays up, the first eligian_brief call fails kind io, the second scans and succeeds', async () => {
    projectFiles();
    let calls = 0;
    const server = await startInMemoryServer({
      cwd: root,
      docsRoot: DOCS,
      brief: {
        stateDir,
        beforeScan: async () => {
          calls++;
          if (calls === 1) throw new Error('scan held up');
        },
      },
    });
    try {
      const first = await server.callTool(brief.NAME, { action: 'status' });
      expect(first.isError).toBe(true);
      expect(first.payload.error.kind).toBe('io');
      expect(fs.existsSync(recordFile())).toBe(false);
      const second = await server.callTool(brief.NAME, { action: 'status' });
      expect(second.isError).toBe(false);
      expect(calls).toBe(2);
      expect(JSON.parse(fs.readFileSync(recordFile(), 'utf-8'))).toEqual({
        version: 1,
        programs: [firstRun('a.eligian', 'A')],
      });
    } finally {
      await server.close();
    }
  });

  it('a file named .eligian in the cwd: initialize answered, no unhandled rejection, eligian_brief fails io, eligian_docs succeeds', async () => {
    projectFiles();
    write(root, '.eligian', 'not a directory');
    const rejections: unknown[] = [];
    const spy = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', spy);
    const server = await startInMemoryServer({ cwd: root, docsRoot: DOCS, brief: { stateDir } });
    try {
      const init = await server.request('initialize', initialize);
      expect(init.error).toBeUndefined();
      await server.notify('notifications/initialized');
      const failed = await server.callTool(brief.NAME, { action: 'status' });
      expect(failed.isError).toBe(true);
      expect(failed.payload.error.kind).toBe('io');
      const docs = await server.callTool('eligian_docs', {});
      expect(docs.isError).toBe(false);
      await sleep(0);
      expect(rejections).toEqual([]);
      expect(fs.readFileSync(path.join(root, '.eligian'), 'utf-8')).toBe('not a directory');
    } finally {
      process.off('unhandledRejection', spy);
      await server.close();
    }
  });

  it('close() while beforeScan holds the scan: after release, no .eligian/programs.json appears', async () => {
    projectFiles();
    const held = holdSeam();
    const server = await startInMemoryServer({
      cwd: root,
      docsRoot: DOCS,
      brief: { stateDir, beforeScan: held.seam },
    });
    await held.entered;
    await server.close();
    held.release();
    await sleep(300);
    expect(fs.existsSync(recordFile())).toBe(false);
  });

  it('the eligian_brief telemetry line carries its reply state (noteBrief, FR-057)', async () => {
    projectFiles();
    const chunks: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk, ...rest) => {
      chunks.push(String(chunk));
      return original(chunk, ...(rest as []));
    });
    const server = await startInMemoryServer({ cwd: root, docsRoot: DOCS, brief: { stateDir } });
    try {
      const result = await server.callTool(brief.NAME, { action: 'status' });
      expect(result.isError).toBe(false);
      await server.callTool('eligian_docs', {});
    } finally {
      await server.close();
      spy.mockRestore();
    }
    const lines = chunks
      .flatMap(chunk => chunk.split('\n'))
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line) as Partial<TelemetryLine>)
      .filter(line => typeof line.tool === 'string');
    expect(lines.find(line => line.tool === brief.NAME)?.brief).toEqual({ state: 'open' });
    expect(lines.find(line => line.tool === 'eligian_docs')).not.toHaveProperty('brief');
  });

  it('20 concurrent accept-existing on 20 programs (Promise.all, no-capability client with confirmation) leave all 20 in the record', async () => {
    const server = await startInMemoryServer({ cwd: root, docsRoot: DOCS, brief: { stateDir } });
    try {
      // the first-run scan of the empty project, then 20 programs that arrive without the agent
      expect((await server.callTool(brief.NAME, { action: 'status' })).isError).toBe(false);
      const names = Array.from({ length: 20 }, (_, n) => `p${String(n).padStart(2, '0')}.eligian`);
      for (const [n, name] of names.entries()) {
        write(root, name, `timeline "T${n}" in "#s" using raf {}\n`);
      }
      const results = await Promise.all(
        names.map(name =>
          server.callTool(brief.NAME, {
            action: 'accept-existing',
            paths: [name],
            confirmation: 'Yes, these are mine.',
          })
        )
      );
      for (const result of results) {
        expect(result.isError, JSON.stringify(result.payload)).toBe(false);
        expect(result.payload.signoff).toEqual({ mode: 'agent-reported' });
      }
      const record = parseRecord(fs.readFileSync(recordFile(), 'utf-8'));
      expect(record).toEqual({
        version: 1,
        programs: names.map((name, n) => ({
          path: name,
          timelines: [`T${n}`],
          languages: [],
          extensions: false,
          via: 'accepted',
          mode: 'agent-reported',
        })),
      });
    } finally {
      await server.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// T030 (SC-002 server half, SC-020): the record across processes, announced roots and restarts.

const BUILT = fs.existsSync(path.resolve(SRC, '..', 'dist', 'cli.mjs'));
const DOCS_MINI = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');
const SPAWNED = 60_000;

const programText = (timeline: string): string => `timeline "${timeline}" in "#s" using raf {}\n`;

interface CallOutcome {
  readonly isError: boolean;
  readonly payload: any;
}

/** `initialize` (with `capabilities`) and `notifications/initialized` on a spawned server. */
async function initializeSpawned(
  server: SpawnedServer,
  capabilities: Record<string, unknown> = {}
): Promise<void> {
  const init = await server.request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities,
    clientInfo: { name: 'record-spawned-spec', version: '0' },
  });
  expect(init.error, server.stderr()).toBeUndefined();
  server.notify('notifications/initialized');
}

/** `tools/call` on a spawned server: the JSON payload and `isError`. */
async function callSpawned(
  server: SpawnedServer,
  name: string,
  args: Record<string, unknown>
): Promise<CallOutcome> {
  const response = await server.request('tools/call', { name, arguments: args });
  expect(response.error, server.stderr()).toBeUndefined();
  const result = response.result as { content: { text: string }[]; isError?: boolean };
  return { isError: result.isError === true, payload: JSON.parse(result.content[0].text) };
}

/** As `roots-client.mjs` (`mcp-paths.spec.ts:234`): every `roots/list` answers `roots`. */
function answerRoots(server: SpawnedServer, roots: readonly string[]): void {
  server.onFrame(frame => {
    const request = frame as { readonly method?: string; readonly id?: string | number };
    if (request.method === 'roots/list' && request.id !== undefined) {
      server.send({
        jsonrpc: '2.0',
        id: request.id,
        result: { roots: roots.map(root => ({ uri: pathToFileURL(root).href })) },
      });
    }
  });
}

const gateCodeOf = (outcome: CallOutcome): string | undefined =>
  outcome.isError ? outcome.payload.error?.gate?.code : undefined;

describe('the record across processes, roots and restarts (T030)', () => {
  const dirs: string[] = [];
  let stateDir: string;

  const dir = (prefix: string): string => {
    const made = tempDir(prefix);
    dirs.push(made);
    return made;
  };

  beforeEach(() => {
    stateDir = dir('eligian-t030-state-');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const made of dirs.splice(0)) fs.rmSync(made, { recursive: true, force: true });
  });

  const recordOf = (root: string): string => path.join(root, RECORD_FILE);
  /** SC-002 as ruled (FR-003 wins): the empty cwd's start scan may write an empty record, never more. */
  const expectEmptyRecordOrNone = (root: string): void => {
    if (!fs.existsSync(recordOf(root))) return;
    expect(parseRecord(fs.readFileSync(recordOf(root), 'utf-8'))).toEqual({
      version: 1,
      programs: [],
    });
  };
  const spawnedEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    ...process.env,
    ELIGIAN_STATE_DIR: stateDir,
    ...extra,
  });

  describe('across processes', () => {
    it.skipIf(!BUILT)(
      "A answers initialize and one eligian_check on a.eligian, programs.json exists before A's stdin closes; b.eligian is written; B's check on b.eligian fails brief-required and on a.eligian runs",
      async () => {
        const root = dir('eligian-t030-across-');
        write(root, 'a.eligian', programText('A'));
        const a = spawnServer({ cwd: root, env: spawnedEnv() });
        try {
          await initializeSpawned(a);
          const first = await callSpawned(a, 'eligian_check', { paths: ['a.eligian'] });
          expect(first.isError, JSON.stringify(first.payload)).toBe(false);
          expect(fs.existsSync(recordOf(root))).toBe(true);
        } finally {
          await a.close();
        }
        expect(parseRecord(fs.readFileSync(recordOf(root), 'utf-8'))).toEqual({
          version: 1,
          programs: [firstRun('a.eligian', 'A')],
        });

        write(root, 'b.eligian', programText('B'));
        const b = spawnServer({ cwd: root, env: spawnedEnv() });
        try {
          await initializeSpawned(b);
          const refused = await callSpawned(b, 'eligian_check', { paths: ['b.eligian'] });
          expect(gateCodeOf(refused), JSON.stringify(refused.payload)).toBe('brief-required');
          expect(refused.payload.error.gate.program).toBe(path.join(root, 'b.eligian'));
          const runs = await callSpawned(b, 'eligian_check', { paths: ['a.eligian'] });
          expect(runs.isError, JSON.stringify(runs.payload)).toBe(false);
        } finally {
          await b.close();
        }
      },
      SPAWNED
    );
  });

  describe('announced roots', () => {
    it.skipIf(!BUILT)(
      'cwd empty dir A, roots [B, C]: the first check on b.eligian runs, B/.eligian/programs.json lists b.eligian via first-run, neither C/.eligian nor A/.eligian/programs.json exists',
      async () => {
        const a = dir('eligian-t030-cwd-');
        const b = dir('eligian-t030-root-b-');
        const c = dir('eligian-t030-root-c-');
        write(b, 'b.eligian', programText('B'));
        write(c, 'c.eligian', programText('C'));
        const server = spawnServer({ cwd: a, env: spawnedEnv() });
        answerRoots(server, [b, c]);
        try {
          await initializeSpawned(server, { roots: { listChanged: false } });
          const check = await callSpawned(server, 'eligian_check', { paths: ['b.eligian'] });
          expect(check.isError, JSON.stringify(check.payload)).toBe(false);
          expect(check.payload.root).toBe(b);
          expect(parseRecord(fs.readFileSync(recordOf(b), 'utf-8'))).toEqual({
            version: 1,
            programs: [firstRun('b.eligian', 'B')],
          });
          expect(fs.existsSync(path.join(c, '.eligian'))).toBe(false);
          expectEmptyRecordOrNone(a);
        } finally {
          await server.close();
        }
        expect(fs.existsSync(path.join(c, '.eligian'))).toBe(false);
        expectEmptyRecordOrNone(a);
      },
      SPAWNED
    );
  });

  describe('deleted record', () => {
    it('a program written after start is brief-required; the record is written back on the next record write', async () => {
      const root = dir('eligian-t030-deleted-');
      write(root, 'a.eligian', programText('A'));
      const server = await startInMemoryServer({
        cwd: root,
        docsRoot: DOCS_MINI,
        brief: { stateDir },
      });
      try {
        const first = await server.callTool('eligian_check', { paths: ['a.eligian'] });
        expect(first.isError, JSON.stringify(first.payload)).toBe(false);
        fs.rmSync(recordOf(root));
        write(root, 'b.eligian', programText('B'));

        const refused = await server.callTool('eligian_check', { paths: ['b.eligian'] });
        expect(refused.isError).toBe(true);
        expect(refused.payload.error.gate.code).toBe('brief-required');
        // FR-005: no rescan; the last copy still knows a.eligian
        const runs = await server.callTool('eligian_check', { paths: ['a.eligian'] });
        expect(runs.isError, JSON.stringify(runs.payload)).toBe(false);
        expect(fs.existsSync(recordOf(root))).toBe(false);

        const accepted = await server.callTool(brief.NAME, {
          action: 'accept-existing',
          paths: ['b.eligian'],
          confirmation: 'Yes, this one is mine.',
        });
        expect(accepted.isError, JSON.stringify(accepted.payload)).toBe(false);
        expect(parseRecord(fs.readFileSync(recordOf(root), 'utf-8'))).toEqual({
          version: 1,
          programs: [
            firstRun('a.eligian', 'A'),
            { ...firstRun('b.eligian', 'B'), via: 'accepted', mode: 'agent-reported' },
          ],
        });
      } finally {
        await server.close();
      }
    });
  });

  describe('invalid record', () => {
    it("a known program's eligian_check is brief-required naming the problem; the file is unchanged", async () => {
      const root = dir('eligian-t030-invalid-');
      write(root, 'a.eligian', programText('A'));
      const text = `{ "version": 1, "programs": [{ "path": "a.eligian", "timelines": ["A"], `;
      write(root, '.eligian/programs.json', text);
      const server = await startInMemoryServer({
        cwd: root,
        docsRoot: DOCS_MINI,
        brief: { stateDir },
      });
      try {
        const refused = await server.callTool('eligian_check', { paths: ['a.eligian'] });
        expect(refused.isError).toBe(true);
        expect(refused.payload.error.kind).toBe('gate');
        expect(refused.payload.error.gate.code).toBe('brief-required');
        expect(refused.payload.error.message).toMatch(/programs\.json is not valid JSON/);
      } finally {
        await server.close();
      }
      expect(fs.readFileSync(recordOf(root), 'utf-8')).toBe(text);
    });

    it('programs.json is a directory → the gated call fails kind io naming the path', async () => {
      const root = dir('eligian-t030-record-dir-');
      write(root, 'a.eligian', programText('A'));
      fs.mkdirSync(recordOf(root), { recursive: true });
      const server = await startInMemoryServer({
        cwd: root,
        docsRoot: DOCS_MINI,
        brief: { stateDir },
      });
      try {
        for (let call = 0; call < 2; call++) {
          const failed = await server.callTool('eligian_check', { paths: ['a.eligian'] });
          expect(failed.isError).toBe(true);
          expect(failed.payload.error.kind).toBe('io');
          expect(failed.payload.error.path).toBe(recordOf(root));
        }
      } finally {
        await server.close();
      }
      expect(fs.statSync(recordOf(root)).isDirectory()).toBe(true);
      expect(fs.readdirSync(recordOf(root))).toEqual([]);
    });
  });

  describe('no start scan (FR-062)', () => {
    it('home cwd (vi.stubEnv HOME/USERPROFILE to a temp dir holding a program): no .eligian, every program brief-required', async () => {
      const home = dir('eligian-t030-home-');
      write(home, 'a.eligian', programText('A'));
      write(home, 'talk/b.eligian', programText('B'));
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      expect(os.homedir()).toBe(home);
      const server = await startInMemoryServer({
        cwd: home,
        docsRoot: DOCS_MINI,
        brief: { stateDir },
      });
      try {
        const refused = await server.callTool('eligian_check', { paths: ['**/*.eligian'] });
        expect(refused.isError).toBe(true);
        expect(refused.payload.error.gate.code).toBe('brief-required');
        expect(
          refused.payload.error.gate.refused.map((r: { program: string }) => r.program).sort()
        ).toEqual([path.join(home, 'a.eligian'), path.join(home, 'talk', 'b.eligian')].sort());
        const status = await server.callTool(brief.NAME, { action: 'status' });
        expect(status.isError, JSON.stringify(status.payload)).toBe(false);
        // the status writes nothing either: no idea yet
        expect(fs.existsSync(path.join(home, '.eligian'))).toBe(false);
        const again = await server.callTool('eligian_check', { paths: ['a.eligian'] });
        expect(again.payload.error?.gate?.code).toBe('brief-required');
      } finally {
        await server.close();
      }
      expect(fs.existsSync(path.join(home, '.eligian'))).toBe(false);
    });

    it.skipIf(!BUILT)(
      'announced root B scanned at first call (spawned)',
      async () => {
        const home = dir('eligian-t030-home-spawned-');
        const b = dir('eligian-t030-home-root-b-');
        write(home, 'a.eligian', programText('A'));
        write(b, 'b.eligian', programText('B'));
        write(b, 'talk/c.eligian', programText('C'));
        const server = spawnServer({
          cwd: home,
          env: spawnedEnv({ HOME: home, USERPROFILE: home }),
        });
        answerRoots(server, [b]);
        try {
          await initializeSpawned(server, { roots: { listChanged: false } });
          const check = await callSpawned(server, 'eligian_check', { paths: ['b.eligian'] });
          expect(check.isError, JSON.stringify(check.payload)).toBe(false);
          expect(parseRecord(fs.readFileSync(recordOf(b), 'utf-8'))).toEqual({
            version: 1,
            programs: [firstRun('b.eligian', 'B'), firstRun('talk/c.eligian', 'C')],
          });
        } finally {
          await server.close();
        }
        expect(fs.existsSync(path.join(home, '.eligian'))).toBe(false);
      },
      SPAWNED
    );
  });

  describe('paths (SC-020)', () => {
    it.runIf(win32)(
      'a program named with backslashes, forward slashes and the other drive case gets the same verdict',
      async () => {
        const root = dir('eligian-t030-paths-');
        write(root, 'talk/a.eligian', programText('A'));
        const server = await startInMemoryServer({
          cwd: root,
          docsRoot: DOCS_MINI,
          brief: { stateDir },
        });
        try {
          // the first-run scan records talk/a.eligian; b.eligian arrives after it
          const first = await server.callTool('eligian_check', { paths: ['talk/a.eligian'] });
          expect(first.isError, JSON.stringify(first.payload)).toBe(false);
          write(root, 'talk/b.eligian', programText('B'));
          const drive = root.charAt(0);
          const other = drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase();
          const otherRoot = `${other}${root.slice(1)}`;
          for (const [name, verdict] of [
            ['a', 'runs'],
            ['b', 'brief-required'],
          ] as const) {
            for (const input of [
              `talk\\${name}.eligian`,
              `talk/${name}.eligian`,
              `${otherRoot}\\talk\\${name}.eligian`,
              `${otherRoot}/talk/${name}.eligian`,
            ]) {
              const result = await server.callTool('eligian_check', { paths: [input] });
              expect(
                gateCodeOf(result) ?? 'runs',
                `${input}: ${JSON.stringify(result.payload)}`
              ).toBe(verdict);
            }
          }
          expect(JSON.parse(fs.readFileSync(recordOf(root), 'utf-8')).programs[0].path).toBe(
            'talk/a.eligian'
          );
        } finally {
          await server.close();
        }
      }
    );

    /** A `talk/brief.md` (lower case) holding an open brief, then `talk/main.eligian` written. */
    async function lowerCaseBrief(): Promise<CallOutcome> {
      const root = dir('eligian-t030-brief-case-');
      fs.mkdirSync(path.join(root, 'talk'), { recursive: true });
      const server = await startInMemoryServer({
        cwd: root,
        docsRoot: DOCS_MINI,
        brief: { stateDir },
      });
      try {
        const status = await server.callTool(brief.NAME, {
          action: 'status',
          directory: 'talk',
          idea: 'A one-screen overview of our support hours.',
        });
        expect(status.isError, JSON.stringify(status.payload)).toBe(false);
        expect(status.payload.state).toBe('open');
        const upper = path.join(root, 'talk', 'BRIEF.md');
        const lower = path.join(root, 'talk', 'brief.md');
        fs.renameSync(upper, lower);
        expect(fs.readdirSync(path.join(root, 'talk'))).toEqual(['brief.md']);
        write(root, 'talk/main.eligian', programText('hours'));
        return await server.callTool('eligian_check', { paths: ['talk/main.eligian'] });
      } finally {
        await server.close();
      }
    }

    it.runIf(win32)('brief.md governs on Windows', async () => {
      expect(gateCodeOf(await lowerCaseBrief())).toBe('brief-incomplete');
    });

    it.skipIf(win32)('brief.md does not govern on Linux', async () => {
      expect(gateCodeOf(await lowerCaseBrief())).toBe('brief-required');
    });
  });
});

/** The modules whose relative imports `reachableModules` walks (SC-003, P1). */
const PURE_MODULES = [
  path.join(SRC, 'check', 'files.ts'),
  path.join(SRC, 'mcp', 'brief', 'known-programs.ts'),
  path.join(SRC, 'mcp', 'brief', 'gate.ts'),
  path.join(SRC, 'mcp', 'brief', 'signature.ts'),
];

/** Every module reached through relative `from '…'` imports, and every bare specifier seen. */
function reachableModules(entries: readonly string[]): {
  readonly modules: ReadonlySet<string>;
  readonly specifiers: ReadonlySet<string>;
} {
  const modules = new Set<string>();
  const specifiers = new Set<string>();
  const pending = [...entries];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (modules.has(file)) continue;
    modules.add(file);
    const source = fs.readFileSync(file, 'utf-8');
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        pending.push(path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts')));
      } else {
        specifiers.add(specifier);
      }
    }
  }
  return { modules, specifiers };
}

describe('purity', () => {
  it('files.ts, known-programs.ts, gate.ts and signature.ts reach no @eligian/language and no check-command', () => {
    const { modules, specifiers } = reachableModules(PURE_MODULES);
    expect(modules.size).toBeGreaterThanOrEqual(PURE_MODULES.length);
    expect([...specifiers].filter(s => s.startsWith('@eligian/language'))).toEqual([]);
    expect([...modules].filter(m => path.basename(m) === 'check-command.ts')).toEqual([]);
  });

  it('LANGUAGE_CODE agrees with isValidLanguageCode', () => {
    for (const code of [
      'en-US',
      'nl-NL',
      'eng-USA',
      'en',
      'EN-us',
      'en_US',
      'en-US-x',
      '',
      'zh-Hant',
    ]) {
      expect(LANGUAGE_CODE.test(code), code).toBe(isValidLanguageCode(code));
    }
  });

  it.each(['known-programs.ts', 'gate.ts', 'signature.ts', 'adopt.ts'])(
    'no console / process.stdout in %s',
    name => {
      const source = fs.readFileSync(path.join(SRC, 'mcp', 'brief', name), 'utf-8');
      expect(source).not.toMatch(/\bconsole\.|process\.stdout/);
    }
  );
});
