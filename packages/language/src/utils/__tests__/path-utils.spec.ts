import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { URI } from 'vscode-uri';
import {
  getFileExtension,
  resolveImportPathToUri,
  resolveImportRelativePath,
  stripImportQuotes,
} from '../path-utils.js';

describe('Path Utilities', () => {
  describe('getFileExtension', () => {
    test('should extract extension from simple filename', () => {
      expect(getFileExtension('file.txt')).toBe('txt');
      expect(getFileExtension('file.html')).toBe('html');
      expect(getFileExtension('file.css')).toBe('css');
    });

    test('should extract extension from path with directories', () => {
      expect(getFileExtension('./styles/main.css')).toBe('css');
      expect(getFileExtension('../../assets/image.png')).toBe('png');
      expect(getFileExtension('/absolute/path/file.js')).toBe('js');
    });

    test('should extract last extension for multi-dot filenames', () => {
      expect(getFileExtension('file.min.js')).toBe('js');
      expect(getFileExtension('style.min.css')).toBe('css');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    test('should normalize extension to lowercase', () => {
      expect(getFileExtension('File.HTML')).toBe('html');
      expect(getFileExtension('File.CSS')).toBe('css');
      expect(getFileExtension('File.Js')).toBe('js');
      expect(getFileExtension('file.PNG')).toBe('png');
    });

    test('should ignore dots in directory names', () => {
      expect(getFileExtension('../dir.v2/file.js')).toBe('js');
      expect(getFileExtension('./node_modules/pkg.1.0.0/file.ts')).toBe('ts');
      expect(getFileExtension('/path.to.dir/file.css')).toBe('css');
    });

    test('should return empty string for paths without extension', () => {
      expect(getFileExtension('file')).toBe('');
      expect(getFileExtension('./path/file')).toBe('');
      expect(getFileExtension('/absolute/path/file')).toBe('');
    });

    test('should return empty string for empty path', () => {
      expect(getFileExtension('')).toBe('');
    });

    test('should return empty string for path ending with dot', () => {
      // Node.js path.extname() returns '.' for trailing dot, we normalize to ''
      expect(getFileExtension('file.')).toBe('');
      expect(getFileExtension('./path/file.')).toBe('');
    });

    test('should handle hidden files (dotfiles)', () => {
      // Node.js path.extname() returns '' for dotfiles without extension
      expect(getFileExtension('.gitignore')).toBe('');
      expect(getFileExtension('.env')).toBe('');
      expect(getFileExtension('.config.js')).toBe('js');
    });

    test('should handle Windows-style paths', () => {
      expect(getFileExtension('C:\\\\Users\\\\file.txt')).toBe('txt');
      expect(getFileExtension('D:\\\\Projects\\\\file.css')).toBe('css');
    });

    test('should handle various common extensions', () => {
      expect(getFileExtension('script.ts')).toBe('ts');
      expect(getFileExtension('script.js')).toBe('js');
      expect(getFileExtension('style.css')).toBe('css');
      expect(getFileExtension('page.html')).toBe('html');
      expect(getFileExtension('image.png')).toBe('png');
      expect(getFileExtension('image.jpg')).toBe('jpg');
      expect(getFileExtension('data.json')).toBe('json');
      expect(getFileExtension('doc.md')).toBe('md');
    });

    test('should handle edge cases', () => {
      expect(getFileExtension('.')).toBe('');
      expect(getFileExtension('..')).toBe('');
      expect(getFileExtension('...')).toBe('');
      expect(getFileExtension('file..css')).toBe('css');
    });
  });

  describe('stripImportQuotes', () => {
    test('should strip double quotes', () => {
      expect(stripImportQuotes('"./styles.css"')).toBe('./styles.css');
    });

    test('should strip single quotes', () => {
      expect(stripImportQuotes("'./styles.css'")).toBe('./styles.css');
    });

    test('should leave unquoted input unchanged (idempotent)', () => {
      expect(stripImportQuotes('./styles.css')).toBe('./styles.css');
      expect(stripImportQuotes(stripImportQuotes('"./a.css"'))).toBe('./a.css');
    });
  });

  describe('resolveImportRelativePath', () => {
    const docDir = join('proj', 'sub');

    test('should strip quotes and resolve relative to docDir', () => {
      expect(resolveImportRelativePath('"./styles.css"', docDir)).toBe(join(docDir, 'styles.css'));
      expect(resolveImportRelativePath("'./styles.css'", docDir)).toBe(join(docDir, 'styles.css'));
    });

    test('should resolve a path without a leading ./', () => {
      expect(resolveImportRelativePath('styles.css', docDir)).toBe(join(docDir, 'styles.css'));
    });

    test('should normalize parent-relative (../) segments', () => {
      // B35/B53: path.join normalizes '..' instead of naive concatenation.
      expect(resolveImportRelativePath('../shared/a.css', docDir)).toBe(
        join('proj', 'shared', 'a.css')
      );
    });

    test("should resolve '.' to the document directory itself", () => {
      // B53: previously the manual './' strip mishandled '.'.
      expect(resolveImportRelativePath('.', docDir)).toBe(join(docDir));
    });

    test('result never contains surrounding quotes', () => {
      expect(resolveImportRelativePath('"./a.css"', docDir)).not.toContain('"');
    });
  });

  describe('resolveImportPathToUri', () => {
    const docDir = join('proj', 'sub');
    const documentUri = URI.file(join(docDir, 'main.eligian')).toString();

    test('should return an already-absolute file:// URI unchanged', () => {
      const absolute = URI.file(join('other', 'a.css')).toString();
      expect(resolveImportPathToUri(documentUri, absolute)).toBe(absolute);
    });

    test('should strip quotes before the file:// check', () => {
      const absolute = URI.file(join('other', 'a.css')).toString();
      expect(resolveImportPathToUri(documentUri, `"${absolute}"`)).toBe(absolute);
    });

    test('should resolve a relative path to an absolute file:// URI', () => {
      const expected = URI.file(join(docDir, 'styles.css')).toString();
      expect(resolveImportPathToUri(documentUri, '"./styles.css"')).toBe(expected);
      expect(resolveImportPathToUri(documentUri, './styles.css')).toBe(expected);
    });

    test('should normalize parent-relative (../) segments', () => {
      const expected = URI.file(join('proj', 'shared', 'a.css')).toString();
      expect(resolveImportPathToUri(documentUri, '../shared/a.css')).toBe(expected);
    });
  });
});
