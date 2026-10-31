/**
 * CompilationService unit tests (2026-10-22 audit, low finding #68):
 * the timeout branch, compiler errors with and without a source location,
 * generic errors and file-read failures were untested.
 */

import { createEmitError, createParseError, formatError } from '@eligian/language/errors';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  compile: undefined as undefined | ((source: string, options: unknown) => unknown),
  readFile: undefined as undefined | ((uri: unknown) => Promise<Uint8Array>),
}));

vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: (uri: unknown) => h.readFile!(uri),
    },
  },
}));

vi.mock('@eligian/language', () => ({
  // Idea #14: the preview compiles with the Eligian map
  compileWithMap: (source: string, options: unknown) =>
    (h.compile!(source, options) as Effect.Effect<unknown, unknown>).pipe(
      Effect.map(config => ({ config, map: { version: 1, actions: {} } }))
    ),
}));

import type * as vscode from 'vscode';
import { CompilationService } from '../CompilationService.js';

const documentUri = { fsPath: 'F:\\project\\story.eligian' } as unknown as vscode.Uri;

beforeEach(() => {
  h.readFile = async () => new TextEncoder().encode('timeline "t" in "#app" using raf {}');
  h.compile = () => Effect.succeed({ id: 'cfg' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CompilationService.compile', () => {
  test('returns the compiled config and passes the source file for asset resolution', async () => {
    const calls: Array<[string, unknown]> = [];
    h.compile = (source, options) => {
      calls.push([source, options]);
      return Effect.succeed({ id: 'cfg' });
    };

    const result = await new CompilationService().compile(documentUri);

    expect(result.success).toBe(true);
    expect(result.config).toEqual({ id: 'cfg' });
    expect(result.errors).toEqual([]);
    expect(typeof result.timestamp).toBe('number');
    expect(calls).toEqual([
      ['timeline "t" in "#app" using raf {}', { sourceUri: 'F:\\project\\story.eligian' }],
    ]);
  });

  test('converts a compiler error with a location (formatted message, line, column, tag)', async () => {
    const error = createParseError({
      message: 'Unexpected token',
      location: { file: 'story.eligian', line: 4, column: 9, length: 2 },
      expected: '}',
      actual: 'EOF',
    });
    h.compile = () => Effect.fail(error);

    const result = await new CompilationService().compile(documentUri);

    expect(result.success).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toEqual([
      {
        message: formatError(error),
        line: 4,
        column: 9,
        code: 'ParseError',
        severity: 'error',
      },
    ]);
  });

  test('converts a compiler error without a location', async () => {
    const error = createEmitError({ message: 'Cannot emit config' });
    h.compile = () => Effect.fail(error);

    const result = await new CompilationService().compile(documentUri);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      message: formatError(error),
      code: 'EmitError',
      severity: 'error',
    });
    expect(result.errors[0].line).toBeUndefined();
    expect(result.errors[0].column).toBeUndefined();
  });

  test('converts an untagged error', async () => {
    h.compile = () => Effect.die(new Error('kaboom'));

    const result = await new CompilationService().compile(documentUri);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: 'UNKNOWN_ERROR', severity: 'error' });
    expect(result.errors[0].message).toContain('kaboom');
  });

  test('reports a file read failure as an unexpected error', async () => {
    h.readFile = async () => {
      throw new Error('ENOENT: story.eligian');
    };

    const result = await new CompilationService().compile(documentUri);

    expect(result).toMatchObject({
      success: false,
      config: null,
      errors: [{ message: 'ENOENT: story.eligian', code: 'UNEXPECTED_ERROR', severity: 'error' }],
    });
  });

  test('times out a compilation that does not finish', async () => {
    h.compile = () => Effect.never;

    const result = await new CompilationService().compile(documentUri, 20);

    expect(result).toMatchObject({
      success: false,
      config: null,
      errors: [{ message: 'Compilation timed out after 20ms', code: 'TIMEOUT', severity: 'error' }],
    });
  });

  test('a finished compile does not leave its timeout timer pending', async () => {
    vi.useFakeTimers();

    const result = await new CompilationService().compile(documentUri);

    expect(result.success).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
