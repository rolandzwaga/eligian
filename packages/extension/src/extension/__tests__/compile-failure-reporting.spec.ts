/**
 * Regression (#55): the compile command rendered defects (a throwing transformer) as
 * "Unknown Error: {}" and let post-write failures escape as unhandled command errors.
 */

import { Cause, Effect } from 'effect';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handler: undefined as undefined | (() => Promise<void>),
  output: [] as string[],
  errors: [] as string[],
  warnings: [] as string[],
  infos: [] as string[],
  compileImpl: undefined as unknown,
  openTextDocument: undefined as unknown,
  writeFile: undefined as unknown,
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (_id: string, handler: () => Promise<void>) => {
      h.handler = handler;
      return { dispose: () => {} };
    },
  },
  window: {
    activeTextEditor: {
      document: {
        languageId: 'eligian',
        getText: () => 'source',
        uri: { scheme: 'file', fsPath: 'proj/tour.eligian' },
      },
    },
    showErrorMessage: (m: string) => h.errors.push(m),
    showWarningMessage: (m: string) => h.warnings.push(m),
    showInformationMessage: (m: string) => h.infos.push(m),
    showTextDocument: async () => {},
    createOutputChannel: () => ({
      clear: () => {
        h.output.length = 0;
      },
      appendLine: (l: string) => h.output.push(l),
      show: () => {},
      dispose: () => {},
    }),
    withProgress: async (_o: unknown, task: (p: unknown) => Promise<void>) => task({}),
  },
  workspace: {
    openTextDocument: (...a: unknown[]) =>
      (h.openTextDocument as (...x: unknown[]) => unknown)(...a),
  },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Beside: 2 },
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
}));

vi.mock('node:fs/promises', () => ({
  writeFile: (...a: unknown[]) => (h.writeFile as (...x: unknown[]) => unknown)(...a),
}));

vi.mock('@eligian/language', () => ({
  compile: (...a: unknown[]) => (h.compileImpl as (...x: unknown[]) => unknown)(...a),
  formatErrors: (errors: { _tag: string; message: string }[]) =>
    errors.map(e => ({ message: `formatted:${e._tag}:${e.message}` })),
}));

import { causeToCompilerError, registerCompileCommand } from '../commands/compile.js';

beforeEach(() => {
  h.output.length = 0;
  h.errors.length = 0;
  h.warnings.length = 0;
  h.infos.length = 0;
  h.writeFile = vi.fn(async () => {});
  h.openTextDocument = vi.fn(async () => ({}));
  registerCompileCommand();
});

describe('causeToCompilerError', () => {
  test('returns a tagged typed failure', () => {
    const error = { _tag: 'ParseError', message: 'bad' };
    expect(causeToCompilerError(Cause.fail(error))).toBe(error);
  });

  test('returns undefined for a defect', () => {
    expect(causeToCompilerError(Cause.die(new TypeError('boom')))).toBeUndefined();
  });

  test('returns undefined for an untagged failure', () => {
    expect(causeToCompilerError(Cause.fail(new Error('x')))).toBeUndefined();
  });
});

describe('eligian.compile failure reporting', () => {
  test('formats a tagged compiler error through the shared formatter', async () => {
    h.compileImpl = () => Effect.fail({ _tag: 'ParseError', message: 'bad syntax' });
    await h.handler?.();
    expect(h.output.join('\n')).toContain('formatted:ParseError:bad syntax');
    expect(h.output.join('\n')).not.toContain('Unknown Error');
  });

  test('reports a defect with its message and stack instead of "Unknown Error: {}"', async () => {
    h.compileImpl = () => Effect.die(new TypeError('transformer exploded'));
    await h.handler?.();
    const text = h.output.join('\n');
    expect(text).toContain('Internal compiler error');
    expect(text).toContain('transformer exploded');
    expect(text).not.toContain('Unknown Error');
    expect(h.errors).toHaveLength(1);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  test('a failure to open the output after a successful write is only a warning', async () => {
    h.compileImpl = () => Effect.succeed({ id: 'x' });
    h.openTextDocument = vi.fn(async () => {
      throw new Error('cannot open');
    });

    await expect(h.handler?.()).resolves.toBeUndefined();

    expect(h.writeFile).toHaveBeenCalled();
    expect(h.warnings).toHaveLength(1);
    expect(h.warnings[0]).toContain('cannot open');
  });
});
