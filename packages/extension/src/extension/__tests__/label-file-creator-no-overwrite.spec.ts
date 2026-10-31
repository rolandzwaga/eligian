/**
 * Regression: createLabelsFile must never overwrite an existing locale file.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const stat = vi.fn();
const writeFile = vi.fn();
const createDirectory = vi.fn();
const executeCommand = vi.fn();
const showInformationMessage = vi.fn();
const showErrorMessage = vi.fn();

vi.mock('vscode', () => ({
  Uri: {
    file: (path: string) => ({ scheme: 'file', path, fsPath: path }),
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      scheme: 'file',
      path: [base.path, ...parts].join('/'),
    }),
  },
  workspace: {
    fs: {
      stat: (...a: unknown[]) => stat(...a),
      writeFile: (...a: unknown[]) => writeFile(...a),
      createDirectory: (...a: unknown[]) => createDirectory(...a),
    },
  },
  commands: { executeCommand: (...a: unknown[]) => executeCommand(...a) },
  window: {
    showInformationMessage: (...a: unknown[]) => showInformationMessage(...a),
    showErrorMessage: (...a: unknown[]) => showErrorMessage(...a),
    showTextDocument: vi.fn(),
  },
}));

import { createLabelsFile } from '../label-file-creator.js';

const args = { filePath: 'C:/proj/locales.json', content: '{"en-US":{}}' } as Parameters<
  typeof createLabelsFile
>[0];

describe('createLabelsFile existing-file protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeCommand.mockResolvedValue(undefined);
  });

  it('does not overwrite an existing file; opens it instead', async () => {
    stat.mockResolvedValue({ type: 1 });

    const result = await createLabelsFile(args);

    expect(writeFile).not.toHaveBeenCalled();
    expect(createDirectory).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('eligian.openLabelEditor', expect.anything());
    expect(showInformationMessage).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.editorOpened).toBe(true);
  });

  it('creates the file when it does not exist', async () => {
    stat.mockRejectedValue(Object.assign(new Error('not found'), { code: 'FileNotFound' }));

    const result = await createLabelsFile(args);

    expect(createDirectory).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('fails without writing when existence cannot be determined', async () => {
    stat.mockRejectedValue(Object.assign(new Error('denied'), { code: 'NoPermissions' }));

    const result = await createLabelsFile(args);

    expect(writeFile).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});
