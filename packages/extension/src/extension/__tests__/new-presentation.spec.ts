/**
 * "Eligian: New Presentation…" (audit idea #12): writes the starter picked in
 * the quick pick into the chosen folder, asks before overwriting, and opens
 * main.eligian and the preview.
 */

import { starterFiles } from '@eligian/language';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stat = vi.fn();
const writeFile = vi.fn();
const executeCommand = vi.fn();
const showQuickPick = vi.fn();
const showOpenDialog = vi.fn();
const showInputBox = vi.fn();
const showWarningMessage = vi.fn();
const showInformationMessage = vi.fn();
const showTextDocument = vi.fn();

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      scheme: 'file',
      path: [base.path, ...parts].join('/'),
      fsPath: [base.path, ...parts].join('/'),
    }),
  },
  workspace: {
    fs: {
      stat: (...a: unknown[]) => stat(...a),
      writeFile: (...a: unknown[]) => writeFile(...a),
    },
    workspaceFolders: undefined,
    getWorkspaceFolder: () => undefined,
  },
  commands: {
    executeCommand: (...a: unknown[]) => executeCommand(...a),
    registerCommand: vi.fn(),
  },
  window: {
    showQuickPick: (...a: unknown[]) => showQuickPick(...a),
    showOpenDialog: (...a: unknown[]) => showOpenDialog(...a),
    showInputBox: (...a: unknown[]) => showInputBox(...a),
    showWarningMessage: (...a: unknown[]) => showWarningMessage(...a),
    showInformationMessage: (...a: unknown[]) => showInformationMessage(...a),
    showErrorMessage: vi.fn(),
    showTextDocument: (...a: unknown[]) => showTextDocument(...a),
  },
}));

import { newPresentation, titleFromFolder } from '../commands/new-presentation.js';

const folder = { scheme: 'file', path: '/work/my-talk', fsPath: '/work/my-talk' };
const written = () =>
  Object.fromEntries(
    writeFile.mock.calls.map(([uri, bytes]) => [
      (uri as { path: string }).path.replace('/work/my-talk/', ''),
      new TextDecoder().decode(bytes as Uint8Array),
    ])
  );

describe('Eligian: New Presentation…', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showQuickPick.mockImplementation(async (items: { name: string }[]) =>
      items.find(i => i.name === 'chapters')
    );
    showOpenDialog.mockResolvedValue([folder]);
    showInputBox.mockResolvedValue('My Talk');
    stat.mockRejectedValue(new Error('missing'));
    executeCommand.mockResolvedValue(undefined);
  });

  it('writes the picked starter, opens main.eligian and the preview', async () => {
    await newPresentation();
    expect(written()).toEqual(starterFiles('chapters', { title: 'My Talk' }));
    expect(showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/work/my-talk/main.eligian' })
    );
    expect(executeCommand).toHaveBeenCalledWith('eligian.preview');
    // Outside the workspace: offers to open the folder
    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Created the Chapters presentation'),
      'Open Folder'
    );
  });

  it('asks before overwriting, and writes nothing when declined', async () => {
    stat.mockResolvedValue({ type: 1 });
    showWarningMessage.mockResolvedValue(undefined);
    await newPresentation();
    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('main.eligian'),
      { modal: true },
      'Overwrite'
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('stops when the picker is dismissed', async () => {
    showQuickPick.mockResolvedValue(undefined);
    await newPresentation();
    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('suggests a title from the folder name', () => {
    expect(titleFromFolder('/work/my-first-talk')).toBe('My First Talk');
  });
});
