/**
 * The `eligian.generateJSDoc` command (audit #58: the handler had no tests).
 *
 * It asks the language server for a JSDoc template at the cursor and puts it
 * between the `/**` at or before the cursor and the first closing delimiter
 * after that opener on the same line.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  command: undefined as undefined | (() => Promise<void>),
  editor: undefined as unknown,
}));

vi.mock('vscode', () => {
  class Position {
    constructor(
      public line: number,
      public character: number
    ) {}
  }
  class Range {
    constructor(
      public start: Position,
      public end: Position
    ) {}
  }
  return {
    Position,
    Range,
    commands: {
      registerCommand: (_name: string, callback: () => Promise<void>) => {
        state.command = callback;
        return { dispose: () => {} };
      },
    },
    window: {
      get activeTextEditor() {
        return state.editor;
      },
    },
  };
});

import { registerGenerateJSDocCommand } from '../commands/jsdoc.js';

interface Replacement {
  start: { line: number; character: number };
  end: { line: number; character: number };
  text: string;
}

/** A fake editor on `lines`, with the cursor at `line`/`character`. */
function fakeEditor(lines: string[], line: number, character: number, languageId = 'eligian') {
  const replacements: Replacement[] = [];
  const editor = {
    document: {
      languageId,
      uri: { toString: () => 'file:///test.eligian' },
      lineAt: (n: number) => ({ text: lines[n] }),
    },
    selection: { active: { line, character } },
    edit: async (callback: (builder: unknown) => void) => {
      callback({
        replace: (range: { start: Replacement['start']; end: Replacement['end'] }, text: string) =>
          replacements.push({ start: range.start, end: range.end, text }),
      });
      return true;
    },
  };
  return { editor, replacements };
}

function fakeClient(response: unknown) {
  const sendRequest = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { client: { sendRequest } as never, sendRequest };
}

describe('eligian.generateJSDoc command', () => {
  beforeEach(() => {
    state.command = undefined;
    state.editor = undefined;
  });

  test('requests a template at the cursor and fills the doc comment with it', async () => {
    const { editor, replacements } = fakeEditor(['/***/', 'action fade() []'], 0, 3);
    state.editor = editor;
    const { client, sendRequest } = fakeClient(' * Fades.\n * @param x');
    registerGenerateJSDocCommand(client);

    await state.command!();

    expect(sendRequest).toHaveBeenCalledWith('eligian/generateJSDoc', {
      textDocument: { uri: 'file:///test.eligian' },
      position: { line: 0, character: 3 },
    });
    expect(replacements).toEqual([
      {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 3 },
        text: '\n * Fades.\n * @param x\n ',
      },
    ]);
  });

  test("uses the opener at the cursor, not an earlier comment's delimiters", async () => {
    const line = '/* note */ /***/';
    const { editor, replacements } = fakeEditor([line], 0, line.length - 2);
    state.editor = editor;
    registerGenerateJSDocCommand(fakeClient(' * Doc').client);

    await state.command!();

    const opener = line.lastIndexOf('/**');
    expect(replacements).toHaveLength(1);
    expect(replacements[0].start.character).toBe(opener + 3);
    expect(replacements[0].end.character).toBe(line.indexOf('*/', opener + 3));
  });

  test('does nothing when the opener is not closed on the line', async () => {
    const { editor, replacements } = fakeEditor(['/**'], 0, 3);
    state.editor = editor;
    registerGenerateJSDocCommand(fakeClient(' * Doc').client);

    await state.command!();

    expect(replacements).toEqual([]);
  });

  test.each([
    ['an empty response', ''],
    ['a non-string response', { template: 'x' }],
    ['a failed request', new Error('server not ready')],
  ])('leaves the document unchanged on %s', async (_name, response) => {
    const { editor, replacements } = fakeEditor(['/***/'], 0, 3);
    state.editor = editor;
    registerGenerateJSDocCommand(fakeClient(response).client);

    await expect(state.command!()).resolves.toBeUndefined();

    expect(replacements).toEqual([]);
  });

  test('does not ask the server without an Eligian editor', async () => {
    const { client, sendRequest } = fakeClient(' * Doc');
    registerGenerateJSDocCommand(client);

    state.editor = undefined;
    await state.command!();
    state.editor = fakeEditor(['/***/'], 0, 3, 'typescript').editor;
    await state.command!();

    expect(sendRequest).not.toHaveBeenCalled();
  });
});
