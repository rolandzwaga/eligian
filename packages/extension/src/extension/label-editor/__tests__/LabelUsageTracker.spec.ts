/**
 * LabelUsageTracker Unit Tests
 *
 * Feature 036 T066: User Story 7 - Label Usage Tracking
 *
 * Tests the searchWorkspace function that finds label usage in .eligian files.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { searchWorkspace } from '../LabelUsageTracker.js';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    findFiles: vi.fn(),
    openTextDocument: vi.fn(),
  },
  Uri: {
    file: (path: string) => ({
      scheme: 'file',
      path,
      fsPath: path,
      toString: () => `file:///${path}`,
    }),
  },
}));

describe('LabelUsageTracker (Feature 036, User Story 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array for empty workspace (T066)', async () => {
    // ARRANGE: No files in workspace
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

    // ACT
    const result = await searchWorkspace('test-label');

    // ASSERT
    expect(result).toEqual([]);
    expect(vscode.workspace.findFiles).toHaveBeenCalledWith('**/*.eligian', '**/node_modules/**');
  });

  it('should find label used in single file (T066)', async () => {
    // ARRANGE: One file with the label
    const mockUri = { scheme: 'file', path: '/test.eligian', fsPath: '/test.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([mockUri as vscode.Uri]);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => 'setElementContent(@{welcome-title})',
    } as vscode.TextDocument);

    // ACT
    const result = await searchWorkspace('welcome-title');

    // ASSERT
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(mockUri);
  });

  it('should find label used in multiple files (T066)', async () => {
    // ARRANGE: Multiple files with the label
    const mockUri1 = { scheme: 'file', path: '/test1.eligian', fsPath: '/test1.eligian' };
    const mockUri2 = { scheme: 'file', path: '/test2.eligian', fsPath: '/test2.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      mockUri1 as vscode.Uri,
      mockUri2 as vscode.Uri,
    ]);
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation(() => {
      return Promise.resolve({
        getText: () => `content with @{my-label} reference`,
      } as vscode.TextDocument);
    });

    // ACT
    const result = await searchWorkspace('my-label');

    // ASSERT
    expect(result).toHaveLength(2);
  });

  it('should return empty array when label not used (T066)', async () => {
    // ARRANGE: File exists but doesn't contain the label
    const mockUri = { scheme: 'file', path: '/test.eligian', fsPath: '/test.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([mockUri as vscode.Uri]);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => 'timeline "test" using raf {}',
    } as vscode.TextDocument);

    // ACT
    const result = await searchWorkspace('nonexistent-label');

    // ASSERT
    expect(result).toEqual([]);
  });

  it('should escape special regex characters in group ID (T066)', async () => {
    // ARRANGE: Group ID with special regex characters
    const mockUri = { scheme: 'file', path: '/test.eligian', fsPath: '/test.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([mockUri as vscode.Uri]);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => 'content with @{test.label+special} reference',
    } as vscode.TextDocument);

    // ACT - should not throw and should find the label
    const result = await searchWorkspace('test.label+special');

    // ASSERT
    expect(result).toHaveLength(1);
  });

  it('should handle file read errors gracefully (T066)', async () => {
    // ARRANGE: File exists but throws on read
    const mockUri1 = { scheme: 'file', path: '/readable.eligian', fsPath: '/readable.eligian' };
    const mockUri2 = { scheme: 'file', path: '/unreadable.eligian', fsPath: '/unreadable.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      mockUri1 as vscode.Uri,
      mockUri2 as vscode.Uri,
    ]);
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation((uri: vscode.Uri) => {
      if (uri.path === '/unreadable.eligian') {
        return Promise.reject(new Error('Permission denied'));
      }
      return Promise.resolve({
        getText: () => 'content with @{my-label} reference',
      } as vscode.TextDocument);
    });

    // ACT - should not throw
    const result = await searchWorkspace('my-label');

    // ASSERT - should return only the readable file
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/readable.eligian');
  });

  it('should return empty array for empty group ID (T066)', async () => {
    // ACT
    const result1 = await searchWorkspace('');
    const result2 = await searchWorkspace('   ');

    // ASSERT
    expect(result1).toEqual([]);
    expect(result2).toEqual([]);
    // Should not call findFiles for empty IDs
    expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
  });
});
