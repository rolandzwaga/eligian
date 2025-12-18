/**
 * LocaleUsageTracker Unit Tests
 *
 * Feature 036 T066: User Story 7 - Translation Key Usage Tracking
 *
 * Tests the searchWorkspace function that finds translation key usage in .eligian files.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  formatUsageCount,
  formatUsageTooltip,
  getKeyUsageDetails,
  searchWorkspace,
} from '../LocaleUsageTracker.js';

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

describe('LocaleUsageTracker (Feature 036, User Story 7)', () => {
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

  it('should find LabelController usage pattern (T057)', async () => {
    // ARRANGE: File with LabelController pattern
    const mockUri = { scheme: 'file', path: '/test.eligian', fsPath: '/test.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([mockUri as vscode.Uri]);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => 'addController("LabelController", "nav.home", { selector: "#title" })',
    } as vscode.TextDocument);

    // ACT
    const result = await searchWorkspace('nav.home');

    // ASSERT
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(mockUri);
  });
});

describe('getKeyUsageDetails (Feature 045, T057)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty result for empty key', async () => {
    const result = await getKeyUsageDetails('');
    expect(result.count).toBe(0);
    expect(result.files).toEqual([]);
  });

  it('should return detailed location info for matches', async () => {
    // ARRANGE
    const mockUri = { scheme: 'file', path: '/test.eligian', fsPath: '/test.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([mockUri as vscode.Uri]);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => 'line1\naddController("LabelController", "nav.home", {})\nline3',
    } as vscode.TextDocument);

    // ACT
    const result = await getKeyUsageDetails('nav.home');

    // ASSERT
    expect(result.count).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].line).toBe(2);
    expect(result.files[0].preview).toContain('addController');
  });

  it('should find multiple usages in same file', async () => {
    // ARRANGE
    const mockUri = { scheme: 'file', path: '/test.eligian', fsPath: '/test.eligian' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([mockUri as vscode.Uri]);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => '@{nav.home}\n@{nav.home}\naddController("LabelController", "nav.home", {})',
    } as vscode.TextDocument);

    // ACT
    const result = await getKeyUsageDetails('nav.home');

    // ASSERT
    expect(result.count).toBe(3);
    expect(result.files).toHaveLength(3);
  });
});

describe('formatUsageCount (Feature 045, T058)', () => {
  it('should return empty string for zero', () => {
    expect(formatUsageCount(0)).toBe('');
  });

  it('should return count as string for small numbers', () => {
    expect(formatUsageCount(1)).toBe('1');
    expect(formatUsageCount(50)).toBe('50');
    expect(formatUsageCount(99)).toBe('99');
  });

  it('should return 99+ for large numbers', () => {
    expect(formatUsageCount(100)).toBe('99+');
    expect(formatUsageCount(1000)).toBe('99+');
  });
});

describe('formatUsageTooltip (Feature 045, T059)', () => {
  it('should return "Not used" message for undefined', () => {
    expect(formatUsageTooltip(undefined)).toBe('Not used in any .eligian files');
  });

  it('should return "Not used" message for zero count', () => {
    expect(formatUsageTooltip({ count: 0, files: [] })).toBe('Not used in any .eligian files');
  });

  it('should format single usage correctly', () => {
    const usage = {
      count: 1,
      files: [
        {
          filePath: '/path/demo.eligian',
          fileName: 'demo.eligian',
          line: 10,
          column: 5,
          preview: '',
        },
      ],
    };
    expect(formatUsageTooltip(usage)).toBe('Used 1 time in demo.eligian');
  });

  it('should format multiple usages across files', () => {
    const usage = {
      count: 3,
      files: [
        { filePath: '/path/a.eligian', fileName: 'a.eligian', line: 1, column: 1, preview: '' },
        { filePath: '/path/b.eligian', fileName: 'b.eligian', line: 2, column: 2, preview: '' },
        { filePath: '/path/a.eligian', fileName: 'a.eligian', line: 3, column: 3, preview: '' },
      ],
    };
    expect(formatUsageTooltip(usage)).toBe('Used 3 times across 2 files');
  });
});
