/**
 * Regression: "Eligian: Edit Locales" from the editor context menu receives the
 * editor's own (.eligian) URI and must not open it in the locale editor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeCommand = vi.fn();
const showErrorMessage = vi.fn();
const windowState: { activeTextEditor: unknown } = { activeTextEditor: undefined };

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      path: [base.path, ...parts].join('/'),
    }),
  },
  commands: { executeCommand: (...args: unknown[]) => executeCommand(...args) },
  window: {
    get activeTextEditor() {
      return windowState.activeTextEditor;
    },
    showErrorMessage: (...args: unknown[]) => showErrorMessage(...args),
  },
}));

import type * as vscode from 'vscode';
import { isLocaleFileUri, openLocaleEditor } from '../commands/locale.js';

const uri = (path: string) => ({ path, scheme: 'file' }) as unknown as vscode.Uri;

function eligianEditor(lineText: string) {
  return {
    document: {
      languageId: 'eligian',
      uri: uri('/proj/doc.eligian'),
      lineAt: () => ({ text: lineText }),
    },
    selection: { active: { line: 0, character: 0 } },
  };
}

describe('openLocaleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    windowState.activeTextEditor = undefined;
  });

  it('classifies only .json URIs as locale files', () => {
    expect(isLocaleFileUri(uri('/proj/locales.json'))).toBe(true);
    expect(isLocaleFileUri(uri('/proj/LOCALES.JSON'))).toBe(true);
    expect(isLocaleFileUri(uri('/proj/doc.eligian'))).toBe(false);
  });

  it('opens an explicit .json URI directly', async () => {
    const target = uri('/proj/locales.json');
    await openLocaleEditor(target);
    expect(executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'eligian.localeEditor');
  });

  it('ignores the editor own .eligian URI and resolves the locales import under the cursor', async () => {
    windowState.activeTextEditor = eligianEditor('locales "./locales.json"');

    await openLocaleEditor(uri('/proj/doc.eligian'));

    expect(executeCommand).toHaveBeenCalledTimes(1);
    const [command, opened, viewType] = executeCommand.mock.calls[0];
    expect(command).toBe('vscode.openWith');
    expect((opened as { path: string }).path).toContain('locales.json');
    expect((opened as { path: string }).path.endsWith('.eligian')).toBe(false);
    expect(viewType).toBe('eligian.localeEditor');
  });

  it('reports an error instead of opening the .eligian file when the cursor is off the import', async () => {
    windowState.activeTextEditor = eligianEditor('const x = 1');

    await openLocaleEditor(uri('/proj/doc.eligian'));

    expect(executeCommand).not.toHaveBeenCalled();
    expect(showErrorMessage).toHaveBeenCalledWith('Cursor is not on a locales import statement');
  });
});
