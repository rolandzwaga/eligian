/**
 * Asset Loader Tests
 *
 * Tests for IAssetLoader interface and NodeAssetLoader implementation.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NodeAssetLoader } from '../node-asset-loader.js';

// Get current file's directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('IAssetLoader Interface', () => {
  describe('NodeAssetLoader', () => {
    const loader = new NodeAssetLoader();
    const fixturesDir = resolve(__dirname, '../__fixtures__/assets');
    const validHtmlPath = resolve(fixturesDir, 'valid.html');
    const validCssPath = resolve(fixturesDir, 'valid.css');

    describe('fileExists', () => {
      it('should return true for existing files', () => {
        expect(loader.fileExists(validHtmlPath)).toBe(true);
        expect(loader.fileExists(validCssPath)).toBe(true);
      });

      it('should return false for non-existent files', () => {
        const nonExistent = resolve(fixturesDir, 'does-not-exist.html');
        expect(loader.fileExists(nonExistent)).toBe(false);
      });

      it('should return false for directories', () => {
        expect(loader.fileExists(fixturesDir)).toBe(false);
      });

      it('should handle Windows absolute paths', () => {
        const windowsPath = 'C:\\Users\\test\\file.html';
        // Should not throw, just return false if it doesn't exist
        expect(() => loader.fileExists(windowsPath)).not.toThrow();
      });

      it('should handle Unix absolute paths', () => {
        const unixPath = '/home/test/file.html';
        // Should not throw, just return false if it doesn't exist
        expect(() => loader.fileExists(unixPath)).not.toThrow();
      });
    });

    describe('loadFile', () => {
      it('should load existing HTML file contents', () => {
        const content = loader.loadFile(validHtmlPath);
        expect(content).toContain('<!DOCTYPE html>');
        expect(content).toContain('<title>Test Layout</title>');
      });

      it('should load existing CSS file contents', () => {
        const content = loader.loadFile(validCssPath);
        expect(content).toContain(':root');
        expect(content).toContain('--primary-color');
      });

      it('should throw error for non-existent files', () => {
        const nonExistent = resolve(fixturesDir, 'does-not-exist.html');
        expect(() => loader.loadFile(nonExistent)).toThrow();
      });

      it('should throw error for directories', () => {
        expect(() => loader.loadFile(fixturesDir)).toThrow();
      });

      it('should preserve file encoding (UTF-8)', () => {
        const content = loader.loadFile(validHtmlPath);
        // Check for UTF-8 characters
        expect(content).toContain('©'); // Copyright symbol
      });
    });

    describe('resolvePath', () => {
      it('should resolve relative path from source file', () => {
        const sourcePath = '/project/src/main.eligian';
        const relativePath = './layout.html';
        const resolved = loader.resolvePath(sourcePath, relativePath);

        // Shared-utils returns Unix-style paths without platform-specific prefixes
        expect(resolved).toBe('/project/src/layout.html');
      });

      it('should resolve parent directory references', () => {
        const sourcePath = '/project/src/features/main.eligian';
        const relativePath = '../shared/layout.html';

        // Updated: ../ navigation is now BLOCKED (escapes source file directory)
        // Source file is in /project/src/features/, so ../ goes to /project/src/ which is outside
        expect(() => loader.resolvePath(sourcePath, relativePath)).toThrow(
          /Path resolution failed/
        );
      });

      it('should resolve nested relative paths', () => {
        const sourcePath = '/project/src/main.eligian';
        const relativePath = './assets/styles/main.css';
        const resolved = loader.resolvePath(sourcePath, relativePath);

        // Shared-utils returns Unix-style paths without platform-specific prefixes
        expect(resolved).toBe('/project/src/assets/styles/main.css');
      });

      it('should handle Windows paths', () => {
        const sourcePath = 'C:\\project\\src\\main.eligian';
        const relativePath = '.\\layout.html';
        const resolved = loader.resolvePath(sourcePath, relativePath);

        // Normalized to forward slashes on all platforms
        expect(resolved).toContain('layout.html');
      });

      it('should normalize path separators', () => {
        const sourcePath = '/project/src/main.eligian';
        const relativePath = '.\\layout.html'; // Windows-style separator
        const resolved = loader.resolvePath(sourcePath, relativePath);

        // Should work regardless of platform
        expect(resolved).toContain('layout.html');
      });

      it('should resolve to absolute path (cross-platform)', () => {
        const sourcePath = resolve(fixturesDir, 'test.eligian');
        const relativePath = './valid.html';
        const resolved = loader.resolvePath(sourcePath, relativePath);

        // Shared-utils returns Unix-style absolute paths
        // On Windows: starts with drive letter (e.g., F:/...)
        // On Unix: starts with / (e.g., /home/...)
        const isAbsolute = resolved.startsWith('/') || /^[A-Z]:/i.test(resolved);
        expect(isAbsolute).toBe(true);
        expect(loader.fileExists(resolved)).toBe(true); // Actually exists
      });
    });

    describe('Integration', () => {
      it('should resolve and load file in one workflow', () => {
        const sourcePath = resolve(fixturesDir, 'test.eligian');
        const relativePath = './valid.html';

        const absolutePath = loader.resolvePath(sourcePath, relativePath);
        expect(loader.fileExists(absolutePath)).toBe(true);

        const content = loader.loadFile(absolutePath);
        expect(content).toContain('<!DOCTYPE html>');
      });

      it('should handle multiple file types in same directory', () => {
        const sourcePath = resolve(fixturesDir, 'test.eligian');

        const htmlPath = loader.resolvePath(sourcePath, './valid.html');
        const cssPath = loader.resolvePath(sourcePath, './valid.css');

        expect(loader.fileExists(htmlPath)).toBe(true);
        expect(loader.fileExists(cssPath)).toBe(true);

        const htmlContent = loader.loadFile(htmlPath);
        const cssContent = loader.loadFile(cssPath);

        expect(htmlContent).toContain('<html');
        expect(cssContent).toContain('.btn');
      });
    });
  });
});
