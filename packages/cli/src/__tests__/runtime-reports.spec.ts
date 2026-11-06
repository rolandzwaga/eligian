/**
 * The pure runtime-report module of `eligian dev` (FR-014, FR-018, FR-037,
 * FR-038): report shape checks, the merge key, the capped error list, the
 * atomic `dev-errors.json` writer and the self-ignoring `.eligian/` dir.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addError,
  type DevErrorsFile,
  ensureEligianDir,
  MAX_ENTRIES,
  mergeKey,
  parseRuntimeReport,
  writeDevErrors,
} from '../dev/runtime-reports.js';

const emptyFile = (): DevErrorsFile => ({
  version: 1,
  entry: path.join(os.tmpdir(), 'main.eligian'),
  url: 'http://localhost:4000/',
  buildId: 'b1',
  updated: '2026-11-06T00:00:00.000Z',
  errors: [],
});

describe('parseRuntimeReport', () => {
  it('accepts an engine-error with an operation path', () => {
    const body = {
      kind: 'engine-error',
      buildId: 'b1',
      message: 'boom',
      actionId: 'a-1',
      actionName: 'intro',
      phase: 'start',
      operationSystemName: 'selectElement',
      operationIndex: 0,
      operationPath: [{ systemName: 'selectElement', index: 0 }],
      timelineUri: 'Intro',
      position: 0,
    };
    expect(parseRuntimeReport(body)).toEqual(body);
  });

  it('accepts an engine-error without the optional fields', () => {
    const body = {
      kind: 'engine-error',
      buildId: 'b1',
      message: 'boom',
      actionId: 'a-1',
      phase: 'end',
    };
    expect(parseRuntimeReport(body)).toEqual(body);
  });

  it.each(['console-error', 'console-warn', 'window-error', 'unhandled-rejection'] as const)(
    'accepts a %s with and without a source position',
    kind => {
      const bare = { kind, buildId: 'b1', message: 'oops' };
      expect(parseRuntimeReport(bare)).toEqual(bare);
      const located = { ...bare, source: 'http://localhost:4000/bundle.js', line: 12, column: 3 };
      expect(parseRuntimeReport(located)).toEqual(located);
    }
  );

  it('accepts a selector-miss', () => {
    const body = {
      kind: 'selector-miss',
      buildId: 'b1',
      message: "selector '#nope' wasn't found!",
      selector: '#nope',
    };
    expect(parseRuntimeReport(body)).toEqual(body);
  });

  it.each([
    ['a missing buildId', { kind: 'console-error', message: 'x' }],
    ['an unknown kind', { kind: 'nope', buildId: 'b1', message: 'x' }],
    [
      'an engine-error without actionId',
      { kind: 'engine-error', buildId: 'b1', message: 'x', phase: 'start' },
    ],
    [
      "phase: 'middle'",
      { kind: 'engine-error', buildId: 'b1', message: 'x', actionId: 'a', phase: 'middle' },
    ],
    ['a selector-miss without selector', { kind: 'selector-miss', buildId: 'b1', message: 'x' }],
    ['a non-object', 'console-error'],
    ['null', null],
    ['an array', [{ kind: 'console-error', buildId: 'b1', message: 'x' }]],
    ['a non-string message', { kind: 'console-error', buildId: 'b1', message: 42 }],
  ])('rejects %s', (_name, body) => {
    expect(parseRuntimeReport(body)).toBeUndefined();
  });

  it('truncates strings over 4,000 chars to 4,000', () => {
    const report = parseRuntimeReport({
      kind: 'selector-miss',
      buildId: 'b1',
      message: 'm'.repeat(5000),
      selector: 's'.repeat(4001),
    });
    expect(report).toBeDefined();
    expect(report!.message).toHaveLength(4000);
    expect(report!.kind === 'selector-miss' && report!.selector).toHaveLength(4000);
  });

  it('drops unknown extra keys', () => {
    const report = parseRuntimeReport({
      kind: 'console-warn',
      buildId: 'b1',
      message: 'w',
      extra: 'dropped',
      __proto__x: 1,
    });
    expect(report).toEqual({ kind: 'console-warn', buildId: 'b1', message: 'w' });
    expect(Object.keys(report!)).toEqual(['kind', 'buildId', 'message']);
  });
});

describe('mergeKey / addError', () => {
  const error = {
    kind: 'engine-error' as const,
    message: 'boom',
    file: path.join(os.tmpdir(), 'main.eligian'),
    line: 3,
    column: 5,
  };

  it('merges the same kind, message and location into one entry', () => {
    const once = addError(emptyFile(), error, 't1');
    const twice = addError(once, { ...error }, 't2');
    expect(mergeKey(error)).toBe(mergeKey({ ...error }));
    expect(twice.errors).toHaveLength(1);
    expect(twice.errors[0]).toMatchObject({ count: 2, first: 't1', last: 't2' });
  });

  it('keeps a different location or kind apart', () => {
    const base = addError(emptyFile(), error, 't1');
    const otherLocation = addError(base, { ...error, column: 6 }, 't2');
    expect(otherLocation.errors).toHaveLength(2);
    const otherKind = addError(base, { ...error, kind: 'console-error' }, 't2');
    expect(otherKind.errors).toHaveLength(2);
    expect(mergeKey(error)).not.toBe(mergeKey({ ...error, column: 6 }));
  });

  it('keeps at most MAX_ENTRIES, dropping the oldest', () => {
    let file = emptyFile();
    for (let i = 0; i < 120; i++) {
      file = addError(file, { kind: 'console-error', message: `e${i}` }, `t${i}`);
    }
    expect(MAX_ENTRIES).toBe(100);
    expect(file.errors.length).toBe(MAX_ENTRIES);
    expect(file.errors[0].message).toBe('e20');
    expect(file.errors.some(e => e.message === 'e19')).toBe(false);
    expect(file.errors.at(-1)!.message).toBe('e119');
  });

  it('does not mutate its input', () => {
    const input = addError(emptyFile(), error, 't1');
    const before = structuredClone(input);
    addError(input, error, 't2');
    addError(input, { ...error, message: 'other' }, 't3');
    expect(input).toEqual(before);
  });
});

describe('writeDevErrors', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-reports-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes dev-errors.json atomically, as 2-space JSON with a newline', async () => {
    const file = addError(emptyFile(), { kind: 'console-error', message: 'x' }, 't1');
    await writeDevErrors(dir, file);
    const text = fs.readFileSync(path.join(dir, 'dev-errors.json'), 'utf8');
    expect(text).toBe(`${JSON.stringify(file, null, 2)}\n`);
    expect(JSON.parse(text)).toEqual(file);
    await writeDevErrors(dir, addError(file, { kind: 'console-error', message: 'x' }, 't2'));
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'dev-errors.json'), 'utf8')).errors[0].count
    ).toBe(2);
    expect(fs.readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('ensureEligianDir', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-reports-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates .eligian/ with a self-ignoring .gitignore', async () => {
    const dir = await ensureEligianDir(root);
    expect(dir).toBe(path.join(root, '.eligian'));
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('leaves an existing dir and its user-edited .gitignore alone', async () => {
    const dir = path.join(root, '.eligian');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'keep\n');
    const before = fs.readFileSync(path.join(dir, '.gitignore'));
    expect(await ensureEligianDir(root)).toBe(dir);
    expect(fs.readFileSync(path.join(dir, '.gitignore')).equals(before)).toBe(true);
  });

  it('never touches the root .gitignore', async () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
    const before = fs.readFileSync(path.join(root, '.gitignore'));
    await ensureEligianDir(root);
    await ensureEligianDir(root);
    expect(fs.readFileSync(path.join(root, '.gitignore')).equals(before)).toBe(true);
  });
});
