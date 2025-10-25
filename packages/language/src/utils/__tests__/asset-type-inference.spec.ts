/**
 * Unit tests for asset type inference
 *
 * Tests the inferAssetType() function which determines asset type from file extensions.
 *
 * @see asset-type-inference.ts
 */

import { describe, expect, test } from 'vitest';
import { inferAssetType } from '../asset-type-inference.js';

describe('inferAssetType() - T054-T056', () => {
  describe('T054: All supported extensions', () => {
    test('should infer html from .html extension', () => {
      expect(inferAssetType('./template.html')).toBe('html');
    });

    test('should infer css from .css extension', () => {
      expect(inferAssetType('./styles.css')).toBe('css');
    });

    test('should infer media from .mp4 extension', () => {
      expect(inferAssetType('./video.mp4')).toBe('media');
    });

    test('should infer media from .webm extension', () => {
      expect(inferAssetType('./video.webm')).toBe('media');
    });

    test('should infer media from .mp3 extension', () => {
      expect(inferAssetType('./audio.mp3')).toBe('media');
    });

    test('should infer media from .wav extension', () => {
      expect(inferAssetType('./audio.wav')).toBe('media');
    });

    test('should return undefined for unknown extension', () => {
      expect(inferAssetType('./document.pdf')).toBeUndefined();
    });

    test('should return undefined for ambiguous .ogg extension', () => {
      expect(inferAssetType('./audio.ogg')).toBeUndefined();
    });

    test('should return undefined for file without extension', () => {
      expect(inferAssetType('./README')).toBeUndefined();
    });

    test('should return undefined for empty string', () => {
      expect(inferAssetType('')).toBeUndefined();
    });
  });

  describe('T055: Case-insensitive extension matching', () => {
    test('should infer html from .HTML (uppercase)', () => {
      expect(inferAssetType('./template.HTML')).toBe('html');
    });

    test('should infer css from .CSS (uppercase)', () => {
      expect(inferAssetType('./styles.CSS')).toBe('css');
    });

    test('should infer media from .MP4 (uppercase)', () => {
      expect(inferAssetType('./video.MP4')).toBe('media');
    });

    test('should infer html from .HtMl (mixed case)', () => {
      expect(inferAssetType('./template.HtMl')).toBe('html');
    });

    test('should infer css from .CsS (mixed case)', () => {
      expect(inferAssetType('./styles.CsS')).toBe('css');
    });
  });

  describe('T056: Multiple extensions (use last)', () => {
    test('should infer html from .min.html', () => {
      expect(inferAssetType('./bundle.min.html')).toBe('html');
    });

    test('should infer css from .min.css', () => {
      expect(inferAssetType('./styles.min.css')).toBe('css');
    });

    test('should infer media from .backup.mp4', () => {
      expect(inferAssetType('./video.backup.mp4')).toBe('media');
    });

    test('should return undefined when last extension is unknown', () => {
      expect(inferAssetType('./file.html.bak')).toBeUndefined();
    });

    test('should handle complex multi-dot filenames', () => {
      expect(inferAssetType('./my.component.template.html')).toBe('html');
    });
  });

  describe('Edge cases', () => {
    test('should handle paths with directories', () => {
      expect(inferAssetType('../../shared/template.html')).toBe('html');
    });

    test('should handle paths with dots in directory names', () => {
      expect(inferAssetType('./v2.0/template.html')).toBe('html');
    });

    test('should handle hidden files with extensions', () => {
      expect(inferAssetType('./.config.css')).toBe('css');
    });

    test('should return undefined for hidden files without extension', () => {
      expect(inferAssetType('./.gitignore')).toBeUndefined();
    });
  });
});
