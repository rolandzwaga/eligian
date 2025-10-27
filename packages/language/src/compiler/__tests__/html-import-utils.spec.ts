/**
 * Tests for HTML Import Utilities
 *
 * Tests path resolution, file loading, and security validation
 * for HTML imports (Feature 015).
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePath } from '@eligian/shared-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadHTMLFile, resolveHTMLPath, validateHTMLSize } from '../html-import-utils.js';

// Test fixture directory
const FIXTURES_DIR = normalizePath(join(process.cwd(), '__test-fixtures-html-utils__'));

beforeEach(() => {
  // Clean up and recreate fixtures directory
  try {
    rmSync(FIXTURES_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
  mkdirSync(FIXTURES_DIR, { recursive: true });
});

describe('resolveHTMLPath', () => {
  it('should resolve relative path from source file', () => {
    const sourceFile = `${FIXTURES_DIR}/test.eligian`;
    const projectRoot = FIXTURES_DIR;
    const importPath = './snippet.html';

    const result = resolveHTMLPath(importPath, sourceFile, projectRoot);

    // Build expected path with forward slashes (Unix-style)
    expect(result).toBe(`${FIXTURES_DIR}/snippet.html`);
  });

  it('should resolve nested relative path', () => {
    const sourceFile = `${FIXTURES_DIR}/test.eligian`;
    const projectRoot = FIXTURES_DIR;
    const importPath = './components/header.html';

    const result = resolveHTMLPath(importPath, sourceFile, projectRoot);

    // Build expected path with forward slashes (Unix-style)
    expect(result).toBe(`${FIXTURES_DIR}/components/header.html`);
  });

  it('should normalize Windows backslashes', () => {
    const sourceFile = `${FIXTURES_DIR}/test.eligian`;
    const projectRoot = FIXTURES_DIR;
    const importPath = '.\\components\\header.html';

    const result = resolveHTMLPath(importPath, sourceFile, projectRoot);

    // Build expected path with forward slashes (Unix-style)
    expect(result).toBe(`${FIXTURES_DIR}/components/header.html`);
  });

  it('should reject paths that escape project root with ..', () => {
    const sourceFile = join(FIXTURES_DIR, 'test.eligian');
    const projectRoot = FIXTURES_DIR;
    const importPath = '../outside.html';

    // Updated: error message now says "source file directory" not "project directory"
    expect(() => resolveHTMLPath(importPath, sourceFile, projectRoot)).toThrow(
      /Security violation.*escapes source file directory/
    );
  });

  it('should reject paths that navigate to parent', () => {
    const sourceFile = join(FIXTURES_DIR, 'test.eligian');
    const projectRoot = FIXTURES_DIR;
    const importPath = '../../../outside.html';

    expect(() => resolveHTMLPath(importPath, sourceFile, projectRoot)).toThrow(
      /Security violation/
    );
  });

  it('should include import path and source file in error message', () => {
    const sourceFile = `${FIXTURES_DIR}/test.eligian`;
    const projectRoot = FIXTURES_DIR;
    const importPath = '../escape.html';

    // Updated: error now includes source file instead of project root
    expect(() => resolveHTMLPath(importPath, sourceFile, projectRoot)).toThrow(
      `Import path: '${importPath}'`
    );
    expect(() => resolveHTMLPath(importPath, sourceFile, projectRoot)).toThrow(
      `Source file: '${sourceFile}'`
    );
  });
});

describe('loadHTMLFile', () => {
  it('should load HTML file content', () => {
    const htmlFile = join(FIXTURES_DIR, 'test.html');
    const content = '<div>Hello World</div>';
    writeFileSync(htmlFile, content, 'utf-8');

    const result = loadHTMLFile(htmlFile);

    expect(result).toBe(content);
  });

  it('should load multiline HTML content', () => {
    const htmlFile = join(FIXTURES_DIR, 'multiline.html');
    const content = `<div>
  <h1>Title</h1>
  <p>Content</p>
</div>`;
    writeFileSync(htmlFile, content, 'utf-8');

    const result = loadHTMLFile(htmlFile);

    expect(result).toBe(content);
  });

  it('should throw FileNotFoundError if file does not exist', () => {
    const htmlFile = join(FIXTURES_DIR, 'nonexistent.html');

    // Updated: shared-utils error message says "File not found" not "HTML file not found"
    expect(() => loadHTMLFile(htmlFile)).toThrow(/File not found/);
  });

  it('should include file path in FileNotFoundError', () => {
    const htmlFile = join(FIXTURES_DIR, 'missing.html');

    expect(() => loadHTMLFile(htmlFile)).toThrow(htmlFile);
  });

  it('should throw PermissionError if file is not readable', () => {
    // Skip on Windows (chmod doesn't work the same way)
    if (process.platform === 'win32') {
      return;
    }

    const htmlFile = join(FIXTURES_DIR, 'unreadable.html');
    writeFileSync(htmlFile, '<div>Test</div>', 'utf-8');
    // Remove read permissions
    const fs = require('node:fs');
    fs.chmodSync(htmlFile, 0o000);

    try {
      expect(() => loadHTMLFile(htmlFile)).toThrow(/Permission denied/);
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(htmlFile, 0o644);
    }
  });
});

describe('validateHTMLSize', () => {
  it('should return undefined for small HTML files', () => {
    const content = '<div>Small content</div>';

    const result = validateHTMLSize(content);

    expect(result).toBeUndefined();
  });

  it('should return undefined for files under 1MB', () => {
    const content = 'x'.repeat(1024 * 1024 - 1); // 1MB - 1 byte

    const result = validateHTMLSize(content);

    expect(result).toBeUndefined();
  });

  it('should return warning for files over 1MB', () => {
    const content = 'x'.repeat(1024 * 1024 + 1); // 1MB + 1 byte

    const result = validateHTMLSize(content);

    expect(result).toContain('Warning');
    expect(result).toContain('1048577 bytes');
  });

  it('should use custom size limit', () => {
    const content = 'x'.repeat(1001); // 1001 bytes
    const maxSize = 1000; // 1000 byte limit

    const result = validateHTMLSize(content, maxSize);

    expect(result).toContain('Warning');
    expect(result).toContain('1001 bytes');
    expect(result).toContain('1000 bytes');
  });

  it('should handle empty content', () => {
    const content = '';

    const result = validateHTMLSize(content);

    expect(result).toBeUndefined();
  });

  it('should handle multi-byte UTF-8 characters', () => {
    // Unicode characters can be multiple bytes
    const content = '🎉'.repeat(300000); // Emoji is 4 bytes each = ~1.2MB

    const result = validateHTMLSize(content);

    expect(result).toContain('Warning');
  });
});
