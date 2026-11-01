/**
 * From CSS and HTML files to the .eligian uses of their classes and ids
 * (audit idea #22): the identifier under the cursor, the "Find Eligian
 * References" command and the CSS CodeLens.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeCommand = vi.fn();
const showInformationMessage = vi.fn();
let editor: unknown;
let lensesEnabled = true;

vi.mock('vscode', () => {
  class Range {
    constructor(
      public startLine: number,
      public startCharacter: number,
      public endLine: number,
      public endCharacter: number
    ) {}
    get start() {
      return { line: this.startLine, character: this.startCharacter };
    }
  }
  class CodeLens {
    constructor(
      public range: unknown,
      public command: unknown
    ) {}
  }
  class EventEmitter {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }
  return {
    Range,
    CodeLens,
    EventEmitter,
    window: {
      get activeTextEditor() {
        return editor;
      },
      showInformationMessage: (...a: unknown[]) => showInformationMessage(...a),
    },
    workspace: {
      getConfiguration: () => ({ get: () => lensesEnabled }),
    },
    commands: {
      executeCommand: (...a: unknown[]) => executeCommand(...a),
      registerCommand: vi.fn(),
    },
    languages: { registerCodeLensProvider: vi.fn(), onDidChangeDiagnostics: vi.fn() },
  };
});

import { identifierInCss, identifierInHtml } from '../css-references/css-identifier.js';
import {
  CssReferenceLensProvider,
  findEligianReferences,
} from '../css-references/css-reference-features.js';

describe('the identifier under the cursor', () => {
  it('in CSS: the part of a selector, not a colour', () => {
    const line = '.card.on, #stage > p { color: #fff; }';
    expect(identifierInCss(line, 2)).toEqual({ kind: 'class', name: 'card' });
    expect(identifierInCss(line, 7)).toEqual({ kind: 'class', name: 'on' });
    expect(identifierInCss(line, 12)).toEqual({ kind: 'id', name: 'stage' });
    expect(identifierInCss(line, 32)).toBeUndefined();
    expect(identifierInCss(line, 18)).toBeUndefined();
  });

  it('in HTML: a word of class="…", the value of id="…"', () => {
    const line = '<div id="a" class="card on" data-x="y">';
    expect(identifierInHtml(line, 9)).toEqual({ kind: 'id', name: 'a' });
    expect(identifierInHtml(line, 21)).toEqual({ kind: 'class', name: 'card' });
    expect(identifierInHtml(line, 25)).toEqual({ kind: 'class', name: 'on' });
    expect(identifierInHtml(line, 2)).toBeUndefined();
    expect(identifierInHtml(line, 35)).toBeUndefined();
  });
});

const uri = { toString: () => 'file:///talk/styles.css' };
const location = (line: number) => ({
  uri: 'file:///talk/main.eligian',
  range: { start: { line, character: 2 }, end: { line, character: 5 } },
});
const client = (response: unknown) => ({
  sendRequest: vi.fn().mockResolvedValue(response),
  protocol2CodeConverter: { asLocation: (l: unknown) => ({ converted: l }) },
});

describe('Find Eligian References', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editor = {
      document: {
        uri,
        languageId: 'css',
        lineAt: () => ({ text: '.card.on { color: red; }' }),
      },
      selection: { active: { line: 3, character: 7 } },
    };
  });

  it('asks the server for the uses of the class under the cursor and shows them', async () => {
    const c = client([location(4), location(9)]);
    await findEligianReferences(c as never);
    expect(c.sendRequest).toHaveBeenCalledWith('eligian/cssReferences', {
      uri: 'file:///talk/styles.css',
      kind: 'class',
      name: 'on',
    });
    expect(executeCommand).toHaveBeenCalledWith(
      'editor.action.showReferences',
      uri,
      { line: 3, character: 7 },
      [{ converted: location(4) }, { converted: location(9) }]
    );
  });

  it('says so when no .eligian file uses it, or the cursor is on no class / id', async () => {
    await findEligianReferences(client([]) as never);
    expect(showInformationMessage).toHaveBeenCalledWith('Eligian: no .eligian file uses .on.');
    (editor as { selection: unknown }).selection = { active: { line: 3, character: 20 } };
    await findEligianReferences(client([]) as never);
    expect(showInformationMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('put the cursor on a class or id')
    );
  });
});

describe('the CSS CodeLens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lensesEnabled = true;
  });

  const lens = (kind: string, name: string, line: number, refs: number) => ({
    kind,
    name,
    range: { start: { line, character: 0 }, end: { line, character: 10 } },
    references: Array.from({ length: refs }, (_, i) => location(i)),
  });

  it('one lens per rule line with uses, its count and the names', async () => {
    const provider = new CssReferenceLensProvider(
      client([
        lens('class', 'on', 1, 3),
        lens('class', 'card', 2, 1),
        lens('class', 'on2', 2, 1),
        lens('id', 'x', 5, 0),
      ]) as never
    );
    const lenses = (await provider.provideCodeLenses({ uri } as never)) as unknown as {
      command: { title: string; arguments: unknown[] };
    }[];
    expect(lenses.map(l => l.command.title)).toEqual([
      '3 Eligian references',
      '2 Eligian references (.card, .on2)',
    ]);
    expect(lenses[0].command.arguments[2]).toHaveLength(3);
  });

  it('can be switched off', async () => {
    lensesEnabled = false;
    const c = client([lens('class', 'on', 1, 3)]);
    expect(
      await new CssReferenceLensProvider(c as never).provideCodeLenses({ uri } as never)
    ).toEqual([]);
    expect(c.sendRequest).not.toHaveBeenCalled();
  });
});
