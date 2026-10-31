/**
 * LocaleLinkProvider unit tests (#68): locale import paths become clickable
 * links that open the file in the Locale Editor.
 */

import { describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => {
  class Position {
    constructor(
      public line: number,
      public character: number
    ) {}
  }
  class Range {
    start: Position;
    end: Position;
    constructor(sl: number, sc: number, el: number, ec: number) {
      this.start = new Position(sl, sc);
      this.end = new Position(el, ec);
    }
  }
  class DocumentLink {
    tooltip?: string;
    constructor(
      public range: Range,
      public target: unknown
    ) {}
  }
  const Uri = {
    parse: (value: string) => ({ value, toString: () => value }),
    joinPath: (base: { path: string }, ...parts: string[]) => {
      const segments = base.path.split('/');
      for (const part of parts.join('/').split('/')) {
        if (part === '..') segments.pop();
        else if (part !== '.') segments.push(part);
      }
      const path = segments.join('/');
      return { path, toString: () => `file://${path}` };
    },
  };
  return { Position, Range, DocumentLink, Uri };
});

import * as vscode from 'vscode';
import { LocaleLinkProvider } from '../locale-link-provider.js';

function makeDocument(text: string, path = '/proj/src/tour.eligian') {
  const lines = text.split('\n');
  return {
    uri: { path, toString: () => `file://${path}` },
    lineCount: lines.length,
    lineAt: (n: number) => ({ text: lines[n] }),
  } as unknown as vscode.TextDocument;
}

const token = {} as vscode.CancellationToken;

describe('LocaleLinkProvider', () => {
  test('creates a link covering exactly the quoted path (without quotes)', () => {
    const text = 'locales "./locales.json"';
    const [link] = new LocaleLinkProvider().provideDocumentLinks(makeDocument(text), token);

    expect(link.range.start.line).toBe(0);
    expect(text.slice(link.range.start.character, link.range.end.character)).toBe('./locales.json');
    expect(link.tooltip).toBe('Open in Locale Editor');
  });

  test('targets the open-locale-file command with the resolved file URI', () => {
    const [link] = new LocaleLinkProvider().provideDocumentLinks(
      makeDocument('locales "../data/locales.json"'),
      token
    );

    const target = String(link.target?.toString());
    expect(target.startsWith('command:eligian.openLocaleFile?')).toBe(true);
    const args = JSON.parse(decodeURIComponent(target.split('?')[1]));
    expect(args).toEqual(['file:///proj/data/locales.json']);
  });

  test('finds links on several lines with the right line numbers', () => {
    const text = 'languages { * "en-US" "English" }\n  locales "./a.json"\n\nlocales "./b.json"';
    const links = new LocaleLinkProvider().provideDocumentLinks(makeDocument(text), token);

    expect(links.map(l => l.range.start.line)).toEqual([1, 3]);
    const lines = text.split('\n');
    expect(lines[1].slice(links[0].range.start.character, links[0].range.end.character)).toBe(
      './a.json'
    );
  });

  test('ignores lines without a locales import', () => {
    const text = 'styles "./a.css"\nlayout "./a.html"\n// nothing here';
    expect(new LocaleLinkProvider().provideDocumentLinks(makeDocument(text), token)).toEqual([]);
  });

  test('returns an empty list for an empty document', () => {
    expect(new LocaleLinkProvider().provideDocumentLinks(makeDocument(''), token)).toEqual([]);
  });

  test('skips a link whose path cannot be resolved', () => {
    const joinPath = vi.spyOn(vscode.Uri, 'joinPath').mockImplementation(() => {
      throw new Error('bad path');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const links = new LocaleLinkProvider().provideDocumentLinks(
      makeDocument('locales "./x.json"'),
      token
    );

    expect(links).toEqual([]);
    expect(error).toHaveBeenCalled();
    joinPath.mockRestore();
    error.mockRestore();
  });
});
