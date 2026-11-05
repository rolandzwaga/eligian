/**
 * Spec 058 Phase 1 (FR-006; plan C2, C3): the MCP tool errors. Handlers fail with tagged
 * errors, the tool boundary maps them to the plain declared-failure object, and a defect
 * is logged and answered as `kind: 'internal'`.
 */
import { Cause, Effect, Exit, Logger, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  catchDefects,
  type ToolError,
  ToolInternal,
  ToolIoError,
  ToolNotFound,
  toToolError,
  toToolFailure,
} from '../mcp/errors.js';

/** A Node fs error: an `Error` with an errno `code` and the `path` it concerns. */
const fsError = (code: string, path: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`${code}: failed, open '${path}'`), { code, path });

describe('toToolError', () => {
  it('read: ENOENT is not-found', () => {
    const error = toToolError('read')(fsError('ENOENT', '/p/a.eligian'));
    expect(error).toBeInstanceOf(ToolNotFound);
    expect(error._tag).toBe('ToolNotFound');
    expect(error.message).toBe("ENOENT: failed, open '/p/a.eligian'");
  });

  it('read: EACCES is io', () => {
    const error = toToolError('read')(fsError('EACCES', '/p/a.eligian'));
    expect(error).toBeInstanceOf(ToolIoError);
    expect(error._tag).toBe('ToolIoError');
  });

  it('write: ENOENT is io', () => {
    const error = toToolError('write')(fsError('ENOENT', '/p/a.eligian'));
    expect(error).toBeInstanceOf(ToolIoError);
  });

  it('no errno code is internal', () => {
    const fromError = toToolError('read', '/p/a.eligian')(new Error('boom'));
    expect(fromError).toBeInstanceOf(ToolInternal);
    expect(fromError.message).toBe('boom');
    const fromString = toToolError('write')('not an error');
    expect(fromString).toBeInstanceOf(ToolInternal);
    expect(fromString.message).toBe('not an error');
  });

  it('path: given, else the fs error path', () => {
    expect(toToolError('read', '/given.eligian')(fsError('ENOENT', '/fs.eligian')).path).toBe(
      '/given.eligian'
    );
    expect(toToolError('read')(fsError('ENOENT', '/fs.eligian')).path).toBe('/fs.eligian');
    expect(toToolError('read')(new Error('no path')).path).toBeUndefined();
  });
});

describe('toToolFailure', () => {
  it('a plain object, header first', () => {
    const header = 'eligian 1.1.0 · eligius 4.2.0 · eligian_check · /p';
    const cases: ReadonlyArray<readonly [ToolError, string]> = [
      [new ToolNotFound({ message: 'missing', path: '/p/a.eligian' }), 'not-found'],
      [new ToolIoError({ message: 'denied' }), 'io'],
      [new ToolInternal({ message: 'internal error: boom' }), 'internal'],
    ];
    for (const [error, kind] of cases) {
      const failure = toToolFailure(header)(error);
      expect(Object.keys(failure)[0]).toBe('header');
      expect(failure).not.toBeInstanceOf(Error);
      expect(failure.header).toBe(header);
      expect(failure.error.kind).toBe(kind);
      expect(failure.error.message).toBe(error.message);
    }
    const withPath = toToolFailure(header)(cases[0][0]);
    expect(withPath).toEqual({
      header,
      error: { kind: 'not-found', message: 'missing', path: '/p/a.eligian' },
    });
    const withoutPath = toToolFailure(header)(cases[1][0]);
    expect('path' in withoutPath.error).toBe(false);
    expect(JSON.stringify(withPath).startsWith('{"header":')).toBe(true);
  });
});

describe('catchDefects', () => {
  it('a defect becomes ToolInternal and is logged', async () => {
    const entries: unknown[] = [];
    const recorder = Logger.make(options => {
      entries.push(options.message);
    });
    const exit = await Effect.runPromiseExit(
      Effect.die(new Error('boom')).pipe(catchDefects, Effect.provide(Logger.layer([recorder])))
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
    expect(error).toBeInstanceOf(ToolInternal);
    expect(error?.message).toBe('internal error: boom');
    expect(entries).toHaveLength(1);
  });

  it('a declared failure passes unchanged', async () => {
    const declared = new ToolNotFound({ message: 'missing' });
    const exit = await Effect.runPromiseExit(Effect.fail(declared).pipe(catchDefects));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    expect(Option.getOrUndefined(Cause.findErrorOption(exit.cause))).toBe(declared);
  });

  it('interruption passes through', async () => {
    const exit = await Effect.runPromiseExit(Effect.interrupt.pipe(catchDefects));
    expect(Exit.hasInterrupts(exit)).toBe(true);
  });
});
