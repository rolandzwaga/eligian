/**
 * Regression: the compile command derived its output path with a case-sensitive
 * `.replace(/\.eligian$/, '.json')`, so a source without a lowercase `.eligian`
 * extension (language mode switch, files.associations, `.ELIGIAN`) was overwritten
 * with the compiled JSON.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const registered = vi.hoisted(() => ({
  handler: undefined as undefined | (() => Promise<void>),
  errors: [] as string[],
  editor: undefined as unknown,
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (_id: string, handler: () => Promise<void>) => {
      registered.handler = handler;
      return { dispose: () => {} };
    },
  },
  window: {
    get activeTextEditor() {
      return registered.editor;
    },
    showErrorMessage: (msg: string) => {
      registered.errors.push(msg);
    },
    showInformationMessage: () => {},
    showTextDocument: async () => {},
    createOutputChannel: () => ({
      clear() {},
      appendLine() {},
      show() {},
      dispose() {},
    }),
    withProgress: async (_opts: unknown, task: (p: unknown) => Promise<void>) => task({}),
  },
  workspace: { openTextDocument: async () => ({}) },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Beside: 2 },
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
}));

vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(async () => {}) }));

import { registerCompileCommand, resolveCompileOutputPath } from '../commands/compile.js';

describe('resolveCompileOutputPath', () => {
  test('replaces the .eligian extension with .json', () => {
    const input = path.join('proj', 'tour.eligian');
    expect(resolveCompileOutputPath(input)).toBe(path.join('proj', 'tour.json'));
  });

  test('replaces an upper-case extension instead of leaving the path unchanged', () => {
    const input = path.join('proj', 'TOUR.ELIGIAN');
    expect(resolveCompileOutputPath(input)).toBe(path.join('proj', 'TOUR.json'));
  });

  test('appends .json for sources with a foreign extension', () => {
    const input = path.join('proj', 'notes.txt');
    expect(resolveCompileOutputPath(input)).toBe(path.join('proj', 'notes.json'));
  });

  test('refuses when the output would be the source file', () => {
    expect(resolveCompileOutputPath(path.join('proj', 'tour.json'))).toBeUndefined();
  });

  test('never returns the input path', () => {
    for (const name of ['a.eligian', 'a.ELIGIAN', 'a.eli', 'a', 'a.json', 'A.JSON']) {
      const input = path.join('dir', name);
      expect(resolveCompileOutputPath(input)).not.toBe(input);
    }
  });
});

describe('eligian.compile command guards', () => {
  const writeFile = fs.writeFile as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registered.errors.length = 0;
    writeFile.mockClear();
    registerCompileCommand();
  });

  const makeEditor = (scheme: string, fsPath: string) => ({
    document: {
      languageId: 'eligian',
      getText: () => 'this is not valid eligian !!!',
      uri: { scheme, fsPath },
    },
  });

  test('refuses untitled documents without writing anything', async () => {
    registered.editor = makeEditor('untitled', 'Untitled-1');
    await registered.handler?.();
    expect(registered.errors.length).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('refuses when the output would overwrite the source', async () => {
    registered.editor = makeEditor('file', path.join('proj', 'tour.json'));
    await registered.handler?.();
    expect(registered.errors[0]).toMatch(/overwrite the source/);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
