/**
 * Regression (#54): typing the second '*' of a doc-comment opener must only insert the
 * closing delimiter for a fresh, unterminated comment. Converting an existing block
 * comment (or typing inside a string / line comment) must not add a duplicate closer.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  changeHandler: undefined as undefined | ((e: unknown) => Promise<void>),
  executeCommand: undefined as unknown,
  editor: undefined as unknown,
}));

vi.mock('vscode', () => {
  class Position {
    constructor(
      public line: number,
      public character: number
    ) {}
    translate(dLine: number, dChar: number) {
      return new Position(this.line + dLine, this.character + dChar);
    }
  }
  class Selection {
    constructor(
      public anchor: Position,
      public active: Position
    ) {}
  }
  return {
    Position,
    Selection,
    Range: class {
      constructor(
        public start: unknown,
        public end: unknown
      ) {}
    },
    commands: {
      registerCommand: () => ({ dispose: () => {} }),
      executeCommand: (...a: unknown[]) =>
        (state.executeCommand as (...x: unknown[]) => unknown)(...a),
    },
    window: {
      get activeTextEditor() {
        return state.editor;
      },
    },
    workspace: {
      onDidChangeTextDocument: (cb: (e: unknown) => Promise<void>) => {
        state.changeHandler = cb;
        return { dispose: () => {} };
      },
    },
  };
});

import { registerJSDocAutoCompletion, shouldAutoCloseJSDoc } from '../commands/jsdoc.js';

describe('shouldAutoCloseJSDoc', () => {
  test('closes a fresh opener at the end of the line', () => {
    expect(shouldAutoCloseJSDoc('/**', 3, '\naction foo() [ ]')).toBe(true);
    expect(shouldAutoCloseJSDoc('  /**', 5, '\naction foo() [ ]')).toBe(true);
  });

  test('does not close when the opener is not directly before the cursor', () => {
    expect(shouldAutoCloseJSDoc('/* x', 4, '')).toBe(false);
    expect(shouldAutoCloseJSDoc('/**x', 4, '')).toBe(false);
  });

  test('does not duplicate the closer when turning a one-line block comment into a doc comment', () => {
    const line = '/** note */';
    expect(shouldAutoCloseJSDoc(line, 3, '\nnext')).toBe(false);
  });

  test('does not duplicate the closer of a multi-line block comment', () => {
    expect(shouldAutoCloseJSDoc('/**', 3, '\n  note\n*/\naction foo() [ ]')).toBe(false);
  });

  test('still closes when the next comment further down opens before it closes', () => {
    expect(shouldAutoCloseJSDoc('/**', 3, '\naction a() [ ]\n/** doc */\naction b() [ ]')).toBe(
      true
    );
  });

  test('does not close inside a line comment', () => {
    expect(shouldAutoCloseJSDoc('// see /**', 10, '')).toBe(false);
  });

  test('does not close inside a string literal', () => {
    expect(shouldAutoCloseJSDoc('const s = "/**', 14, '')).toBe(false);
    expect(shouldAutoCloseJSDoc("const s = '/**", 14, '')).toBe(false);
  });

  test('closes after a string that was already terminated', () => {
    expect(shouldAutoCloseJSDoc('x("a") /**', 10, '')).toBe(true);
    expect(shouldAutoCloseJSDoc('x("a\\"b") /**', 13, '')).toBe(true);
  });
});

describe('registerJSDocAutoCompletion handler', () => {
  const edits: { position: unknown; text: string }[] = [];

  function setup(documentText: string, line: number, typedAt: number) {
    const lines = documentText.split('\n');
    const lineStarts: number[] = [];
    let offset = 0;
    for (const l of lines) {
      lineStarts.push(offset);
      offset += l.length + 1;
    }
    const document = {
      languageId: 'eligian',
      getText: () => documentText,
      lineAt: (n: number) => ({ text: lines[n] }),
      offsetAt: (p: { line: number; character: number }) => lineStarts[p.line] + p.character,
    };
    state.editor = {
      document,
      selection: undefined,
      edit: async (cb: (b: { insert: (p: unknown, t: string) => void }) => void) => {
        cb({ insert: (position, text) => edits.push({ position, text }) });
        return true;
      },
    };
    const range = { start: { line, character: typedAt }, end: { line, character: typedAt } };
    return { document, event: { document, contentChanges: [{ text: '*', range }] } };
  }

  beforeEach(() => {
    edits.length = 0;
    state.executeCommand = vi.fn().mockResolvedValue(undefined);
    registerJSDocAutoCompletion();
  });

  test('inserts the closer and triggers generation for a fresh opener', async () => {
    const { event } = setup('/**\naction foo() [ ]', 0, 2);
    await state.changeHandler?.(event);
    expect(edits).toHaveLength(1);
    expect(edits[0].text).toBe(' */');
    expect(state.executeCommand).toHaveBeenCalledWith('eligian.generateJSDoc');
  });

  test('does nothing when the comment is already closed on the line', async () => {
    const { event } = setup('/** note */', 0, 2);
    await state.changeHandler?.(event);
    expect(edits).toHaveLength(0);
    expect(state.executeCommand).not.toHaveBeenCalled();
  });

  test('does nothing when the comment is closed on a later line', async () => {
    const { event } = setup('/**\n note\n*/\naction foo() [ ]', 0, 2);
    await state.changeHandler?.(event);
    expect(edits).toHaveLength(0);
    expect(state.executeCommand).not.toHaveBeenCalled();
  });

  test('ignores non-eligian documents', async () => {
    const { document, event } = setup('/**', 0, 2);
    (document as { languageId: string }).languageId = 'typescript';
    await state.changeHandler?.(event);
    expect(edits).toHaveLength(0);
  });
});
