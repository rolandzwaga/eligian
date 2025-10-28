/**
 * CSS Service Tests
 *
 * Tests for unified CSS operations module (Feature 017 - Phase 2)
 */

import { describe, expect, it } from 'vitest';
import type { LoadedCSS, Uri, WebviewUriConverter } from '../css-service.js';

// Mock WebviewUriConverter for testing
class MockWebviewUriConverter implements WebviewUriConverter {
  convertToWebviewUri(fileUri: Uri): Uri {
    return {
      scheme: 'vscode-webview',
      path: fileUri.path,
      toString: () => `vscode-webview://authority${fileUri.path}`,
    };
  }
}

describe('CSS Service', () => {
  describe('parseCSS() availability', () => {
    it('should be available from css-parser module', async () => {
      // T009: parseCSS() is available from css-parser (no re-export from css-service to avoid naming conflict)
      const { parseCSS } = await import('../css-parser.js');
      const css = '.button { color: red; } #header { display: flex; }';
      const result = parseCSS(css, '/workspace/styles.css');

      expect(result.classes).toContain('button');
      expect(result.ids).toContain('header');
      expect(result.errors).toEqual([]);
    });
  });

  describe('loadCSS()', () => {
    it('should return LoadedCSS with content and id', async () => {
      // T010: loadCSS() should return { content, id }
      const { loadCSS } = await import('../css-service.js');
      const converter = new MockWebviewUriConverter();
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');

      // Get absolute path to test fixture
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const fixturePath = path.resolve(__dirname, '__fixtures__', 'test.css');

      const result: LoadedCSS = await loadCSS(fixturePath, converter);

      expect(result.content).toBeDefined();
      expect(result.id).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(typeof result.id).toBe('string');
      expect(result.id).toHaveLength(16); // SHA-256 truncated to 16 chars
      expect(result.content).toContain('.button'); // Verify content loaded
    });
  });

  describe('rewriteUrls()', () => {
    it('should convert relative paths to webview URIs', async () => {
      // T011: rewriteUrls() should transform url() paths
      const { rewriteUrls } = await import('../css-service.js');
      const converter = new MockWebviewUriConverter();
      const css = ".bg { background: url('./image.png'); }";
      const cssFilePath = '/workspace/styles/main.css';

      const result = rewriteUrls(css, cssFilePath, converter);

      expect(result).toContain('vscode-webview://');
      expect(result).toContain('image.png');
      expect(result).not.toContain('./image.png');
    });

    it('should skip absolute URLs (http://, https://, data:)', async () => {
      // T013: rewriteUrls() should not modify absolute URLs
      const { rewriteUrls } = await import('../css-service.js');
      const converter = new MockWebviewUriConverter();
      const css = `
        .bg1 { background: url('http://example.com/image.png'); }
        .bg2 { background: url('https://example.com/image.png'); }
        .bg3 { background: url('data:image/png;base64,abc'); }
      `;
      const cssFilePath = '/workspace/styles/main.css';

      const result = rewriteUrls(css, cssFilePath, converter);

      // Absolute URLs should remain unchanged
      expect(result).toContain('http://example.com/image.png');
      expect(result).toContain('https://example.com/image.png');
      expect(result).toContain('data:image/png;base64,abc');
      expect(result).not.toContain('vscode-webview://');
    });

    it('should normalize Windows backslashes', async () => {
      // T014: rewriteUrls() should handle Windows paths
      const { rewriteUrls } = await import('../css-service.js');
      const converter = new MockWebviewUriConverter();
      const css = ".bg { background: url('./image.png'); }";
      const cssFilePath = 'C:\\workspace\\styles\\main.css'; // Windows path

      const result = rewriteUrls(css, cssFilePath, converter);

      // Should not contain backslashes (CSS doesn't accept them)
      expect(result).not.toContain('\\');
      expect(result).toContain('/');
    });
  });

  describe('generateCSSId()', () => {
    it('should return stable 16-char hex string', async () => {
      // T012: generateCSSId() should return SHA-256 hash (truncated)
      const { generateCSSId } = await import('../css-service.js');
      const filePath = '/workspace/styles/main.css';

      const id1 = generateCSSId(filePath);
      const id2 = generateCSSId(filePath);

      expect(id1).toBe(id2); // Stable (same input → same output)
      expect(id1).toHaveLength(16); // 16 hex chars
      expect(id1).toMatch(/^[0-9a-f]{16}$/); // Hex string
    });
  });

  describe('loadCSS() error handling', () => {
    it('should handle file read errors gracefully', async () => {
      // T015: loadCSS() should throw typed errors for missing files
      const { loadCSS } = await import('../css-service.js');
      const converter = new MockWebviewUriConverter();

      await expect(loadCSS('/nonexistent/file.css', converter)).rejects.toThrow();
    });
  });
});
