/**
 * The language server's Eligius lint findings in their own diagnostic
 * collection: replaced per program, merged per file (a library two programs
 * use), cleared when a program has none.
 */
import type { EligiusLintParams } from '@eligian/language';
import { describe, expect, test, vi } from 'vitest';

const collection = vi.hoisted(() => ({
  set: vi.fn(),
  delete: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('vscode', () => ({
  languages: { createDiagnosticCollection: vi.fn(() => collection) },
  Uri: { parse: (uri: string) => ({ toString: () => uri }) },
  Range: class {
    constructor(
      public startLine: number,
      public startCharacter: number,
      public endLine: number,
      public endCharacter: number
    ) {}
  },
  Diagnostic: class {
    source?: string;
    code?: string | number;
    constructor(
      public range: unknown,
      public message: string,
      public severity: number
    ) {}
  },
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  Disposable: {
    from: (...items: Array<{ dispose(): void }>) => ({
      dispose: () => {
        for (const item of items) item.dispose();
      },
    }),
  },
}));

const { EligiusLintStore, registerEligiusLintDiagnostics } = await import(
  '../eligius-lint-diagnostics.js'
);

const finding = (line: number, code = 'E120', severity: 1 | 2 = 1) => ({
  range: { start: { line, character: 2 }, end: { line, character: 9 } },
  severity,
  source: 'Eligius lint',
  code,
  message: `${code} at ${line}`,
});

const params = (programUri: string, files: Record<string, number[]>): EligiusLintParams => ({
  programUri,
  files: Object.entries(files).map(([uri, lines]) => ({
    uri,
    diagnostics: lines.map(line => finding(line)),
  })),
});

describe('EligiusLintStore', () => {
  test("a program's findings replace its earlier ones", () => {
    const store = new EligiusLintStore();
    expect(store.update(params('a', { a: [1], lib: [3] }))).toEqual(['a', 'lib']);
    // The library finding went away: both files may have changed
    expect(store.update(params('a', { a: [2] }))).toEqual(['a', 'lib']);
    expect(store.get('a').map(d => d.range.start.line)).toEqual([2]);
    expect(store.get('lib')).toEqual([]);
    expect(store.update(params('a', {}))).toEqual(['a']);
    expect(store.get('a')).toEqual([]);
  });

  test('a library two programs use: the findings of both, a shared one once', () => {
    const store = new EligiusLintStore();
    store.update(params('a', { lib: [3, 5] }));
    store.update(params('b', { lib: [3, 7] }));
    expect(store.get('lib').map(d => d.range.start.line)).toEqual([3, 5, 7]);
    store.update(params('a', {}));
    expect(store.get('lib').map(d => d.range.start.line)).toEqual([3, 7]);
  });
});

describe('registerEligiusLintDiagnostics', () => {
  test('sets the findings of each file, deletes a file without any', () => {
    let listener: (params: EligiusLintParams) => void = () => {};
    const client = {
      onNotification: vi.fn((_type: string, handler: typeof listener) => {
        listener = handler;
        return { dispose: vi.fn() };
      }),
    };
    const registration = registerEligiusLintDiagnostics(client as any);
    expect(client.onNotification).toHaveBeenCalledWith('eligian/eligiusLint', expect.any(Function));

    listener({ programUri: 'a', files: [{ uri: 'a', diagnostics: [finding(4, 'W151', 2)] }] });
    expect(collection.set).toHaveBeenCalledWith(expect.objectContaining({}), [
      expect.objectContaining({
        message: 'W151 at 4',
        severity: 1, // DiagnosticSeverity.Warning
        source: 'Eligius lint',
        code: 'W151',
        range: { startLine: 4, startCharacter: 2, endLine: 4, endCharacter: 9 },
      }),
    ]);

    listener({ programUri: 'a', files: [] });
    expect(collection.delete).toHaveBeenCalledTimes(1);
    expect(String(collection.delete.mock.calls[0]?.[0])).toBe('a');

    registration.dispose();
    expect(collection.dispose).toHaveBeenCalled();
  });
});
