/**
 * createLabelEntry unit tests (#68) plus regressions for:
 * - #62: the entry is merged onto the open (possibly dirty) document, not the stale disk file
 * - #67: the pending selection reaches an already-open locale editor and never lingers
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openTextDocument: vi.fn(),
  applyEdit: vi.fn(),
  executeCommand: vi.fn(),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  edits: [] as { uri: unknown; range: unknown; text: string }[],
  fsReadFile: vi.fn(),
  fsWriteFile: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ scheme: 'file', fsPath: p, toString: () => `file:///${p}` }),
  },
  Range: class {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number
    ) {}
  },
  WorkspaceEdit: class {
    replace(uri: unknown, range: unknown, text: string) {
      mocks.edits.push({ uri, range, text });
    }
  },
  workspace: {
    openTextDocument: (...a: unknown[]) => mocks.openTextDocument(...a),
    applyEdit: (...a: unknown[]) => mocks.applyEdit(...a),
    fs: {
      readFile: (...a: unknown[]) => mocks.fsReadFile(...a),
      writeFile: (...a: unknown[]) => mocks.fsWriteFile(...a),
    },
  },
  window: {
    showErrorMessage: (...a: unknown[]) => mocks.showErrorMessage(...a),
    showWarningMessage: (...a: unknown[]) => mocks.showWarningMessage(...a),
    showInformationMessage: (...a: unknown[]) => mocks.showInformationMessage(...a),
  },
  commands: { executeCommand: (...a: unknown[]) => mocks.executeCommand(...a) },
}));

import { LabelEntryErrorCode } from '../../../../language/src/types/code-actions.js';
import {
  clearPendingSelections,
  consumePendingSelection,
  createLabelEntry,
  hasPendingSelection,
  registerLocalePanel,
  setPendingSelection,
} from '../label-entry-creator.js';

const FILE = 'F:\\proj\\locales.json';
const FILE_URI = `file:///${FILE}`;

function makeDocument(text: string, saveResult = true) {
  return {
    getText: () => text,
    lineCount: text.split('\n').length,
    save: vi.fn().mockResolvedValue(saveResult),
  };
}

const args = (labelId = 'intro.title', languageCodes = ['en-US', 'nl-NL']) =>
  ({ labelId, labelsFilePath: FILE, languageCodes }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.edits.length = 0;
  mocks.applyEdit.mockResolvedValue(true);
  mocks.executeCommand.mockResolvedValue(undefined);
  clearPendingSelections();
});

afterEach(() => {
  clearPendingSelections();
  vi.useRealTimers();
});

describe('createLabelEntry', () => {
  test('merges the entry into every language and saves through the document', async () => {
    const doc = makeDocument(JSON.stringify({ 'en-US': { a: 'A' }, 'nl-NL': { a: 'B' } }));
    mocks.openTextDocument.mockResolvedValue(doc);

    const result = await createLabelEntry(args());

    expect(result).toEqual({ success: true, labelId: 'intro.title', labelsFilePath: FILE });
    expect(mocks.edits).toHaveLength(1);
    expect(JSON.parse(mocks.edits[0].text)).toEqual({
      'en-US': { a: 'A', intro: { title: '' } },
      'nl-NL': { a: 'B', intro: { title: '' } },
    });
    expect(mocks.edits[0].text).toContain('\n  "en-US"'); // 2-space indentation
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(mocks.fsWriteFile).not.toHaveBeenCalled();
  });

  test('#62: builds on the dirty buffer content rather than the stale file on disk', async () => {
    // openTextDocument returns the in-memory model, which includes the unsaved key
    const dirty = makeDocument(JSON.stringify({ 'en-US': { unsaved: 'U' } }));
    mocks.openTextDocument.mockResolvedValue(dirty);
    mocks.fsReadFile.mockResolvedValue(Buffer.from(JSON.stringify({ 'en-US': { onDisk: 'D' } })));

    await createLabelEntry(args('intro.title', ['en-US']));

    const written = JSON.parse(mocks.edits[0].text);
    expect(written['en-US'].unsaved).toBe('U');
    expect(written['en-US'].onDisk).toBeUndefined();
    expect(written['en-US'].intro).toEqual({ title: '' });
    expect(mocks.fsReadFile).not.toHaveBeenCalled();
  });

  test('replaces the whole document range', async () => {
    const doc = makeDocument('{\n  "en-US": {}\n}');
    mocks.openTextDocument.mockResolvedValue(doc);
    await createLabelEntry(args('k', ['en-US']));
    const range = mocks.edits[0].range as { startLine: number; endLine: number };
    expect(range.startLine).toBe(0);
    expect(range.endLine).toBe(doc.lineCount);
  });

  test('reports a read failure', async () => {
    mocks.openTextDocument.mockRejectedValue(new Error('gone'));
    const result = await createLabelEntry(args());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(LabelEntryErrorCode.FileReadError);
    expect(mocks.showErrorMessage).toHaveBeenCalled();
    expect(mocks.applyEdit).not.toHaveBeenCalled();
  });

  test.each([
    ['not json', 'Invalid JSON'],
    ['[]', 'JSON object'],
    ['null', 'JSON object'],
  ])('rejects invalid locale content %s', async text => {
    mocks.openTextDocument.mockResolvedValue(makeDocument(text));
    const result = await createLabelEntry(args());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(LabelEntryErrorCode.InvalidJson);
    expect(mocks.applyEdit).not.toHaveBeenCalled();
  });

  test('refuses a key that already exists', async () => {
    mocks.openTextDocument.mockResolvedValue(
      makeDocument(JSON.stringify({ 'en-US': { intro: { title: 'T' } } }))
    );
    const result = await createLabelEntry(args('intro.title', ['en-US']));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(LabelEntryErrorCode.LabelExists);
    expect(mocks.showWarningMessage).toHaveBeenCalled();
    expect(mocks.applyEdit).not.toHaveBeenCalled();
  });

  test('an inherited name such as toString is not an existing key', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
    const result = await createLabelEntry(args('toString', ['en-US']));
    expect(result.success).toBe(true);
    expect(JSON.parse(mocks.edits[0].text)).toEqual({ 'en-US': { toString: '' } });
  });

  test.each(['__proto__.x', 'a..b', 'constructor'])(
    'refuses the unsafe key %s without writing or reporting success',
    async key => {
      mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
      const result = await createLabelEntry(args(key, ['en-US']));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(LabelEntryErrorCode.InvalidKey);
      expect(mocks.showErrorMessage).toHaveBeenCalled();
      expect(mocks.showInformationMessage).not.toHaveBeenCalled();
      expect(mocks.applyEdit).not.toHaveBeenCalled();
    }
  );

  test('ignores a __proto__ language code and warns about it', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
    const result = await createLabelEntry(args('polluted', ['en-US', '__proto__']));
    expect(result.success).toBe(true);
    expect(JSON.parse(mocks.edits[0].text)).toEqual({ 'en-US': { polluted: '' } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('__proto__'));
  });

  test('reports a rejected edit as a write error', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
    mocks.applyEdit.mockResolvedValue(false);
    const result = await createLabelEntry(args('k', ['en-US']));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(LabelEntryErrorCode.FileWriteError);
  });

  test('reports a failed save as a write error', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}', false));
    const result = await createLabelEntry(args('k', ['en-US']));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(LabelEntryErrorCode.FileWriteError);
    expect(hasPendingSelection(FILE_URI)).toBe(false);
  });

  test('warns about $ref locales that were left untouched', async () => {
    mocks.openTextDocument.mockResolvedValue(
      makeDocument(JSON.stringify({ 'en-US': {}, 'nl-NL': { $ref: './nl.json' } }))
    );
    const result = await createLabelEntry(args('k', ['en-US', 'nl-NL']));
    expect(result.success).toBe(true);
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('nl-NL'));
  });
});

describe('selecting the new key (#67)', () => {
  test('stores a pending selection and opens the editor when no editor is open', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));

    await createLabelEntry(args('intro.title', ['en-US']));

    expect(mocks.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      expect.anything(),
      'eligian.localeEditor'
    );
    expect(consumePendingSelection(FILE_URI)).toBe('intro.title');
  });

  test('posts select-key to an already open editor instead of leaving a pending entry', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
    const panel = { reveal: vi.fn(), webview: { postMessage: vi.fn().mockResolvedValue(true) } };
    const unregisterPanel = registerLocalePanel(FILE_URI, panel as never);

    await createLabelEntry(args('intro.title', ['en-US']));

    expect(panel.reveal).toHaveBeenCalled();
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'select-key',
      key: 'intro.title',
    });
    expect(hasPendingSelection(FILE_URI)).toBe(false);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    unregisterPanel();
  });

  test('falls back to the pending selection after the panel is unregistered', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
    const panel = { reveal: vi.fn(), webview: { postMessage: vi.fn() } };
    const unregister = registerLocalePanel(FILE_URI, panel as never);
    unregister();

    await createLabelEntry(args('k', ['en-US']));

    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(consumePendingSelection(FILE_URI)).toBe('k');
  });

  test('a replaced panel is not unregistered by the stale disposer', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
    const first = { reveal: vi.fn(), webview: { postMessage: vi.fn() } };
    const second = { reveal: vi.fn(), webview: { postMessage: vi.fn().mockResolvedValue(true) } };
    const unregisterFirst = registerLocalePanel(FILE_URI, first as never);
    const unregisterSecond = registerLocalePanel(FILE_URI, second as never);
    unregisterFirst();

    await createLabelEntry(args('k', ['en-US']));

    expect(first.webview.postMessage).not.toHaveBeenCalled();
    expect(second.webview.postMessage).toHaveBeenCalledWith({ type: 'select-key', key: 'k' });
    unregisterSecond();
  });

  test('clears the pending selection when opening the editor fails', async () => {
    mocks.openTextDocument.mockResolvedValue(makeDocument('{"en-US":{}}'));
    mocks.executeCommand.mockRejectedValue(new Error('no editor'));

    const result = await createLabelEntry(args('k', ['en-US']));

    expect(result.success).toBe(false);
    expect(hasPendingSelection(FILE_URI)).toBe(false);
  });

  test('a stale pending selection expires instead of firing on a much later open', () => {
    vi.useFakeTimers();
    setPendingSelection(FILE_URI, 'stale');
    expect(hasPendingSelection(FILE_URI)).toBe(true);

    vi.advanceTimersByTime(60_000);

    expect(consumePendingSelection(FILE_URI)).toBeUndefined();
    expect(hasPendingSelection(FILE_URI)).toBe(false);
  });
});
