import { describe, expect, test } from 'vitest';
import { getFileExtension } from '../path-utils.js';

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
});
