/**
 * Unit tests for asset type inference from file extensions
 * Test-First Development: Tests written BEFORE implementation
 */
import { describe, expect, it } from 'vitest';
import { inferAssetTypeFromExtension } from '../asset-type-inferrer.js';

describe('inferAssetTypeFromExtension', () => {
  describe('CSS files', () => {
    it('should identify .css extension', () => {
      expect(inferAssetTypeFromExtension('./styles.css')).toBe('css');
      expect(inferAssetTypeFromExtension('../main.css')).toBe('css');
      expect(inferAssetTypeFromExtension('/path/to/style.css')).toBe('css');
    });

    it('should be case insensitive', () => {
      expect(inferAssetTypeFromExtension('./styles.CSS')).toBe('css');
      expect(inferAssetTypeFromExtension('./styles.Css')).toBe('css');
    });
  });

  describe('HTML files', () => {
    it('should identify .html extension', () => {
      expect(inferAssetTypeFromExtension('./layout.html')).toBe('html');
      expect(inferAssetTypeFromExtension('../index.html')).toBe('html');
    });

    it('should identify .htm extension', () => {
      expect(inferAssetTypeFromExtension('./layout.htm')).toBe('html');
      expect(inferAssetTypeFromExtension('../index.htm')).toBe('html');
    });

    it('should be case insensitive', () => {
      expect(inferAssetTypeFromExtension('./layout.HTML')).toBe('html');
      expect(inferAssetTypeFromExtension('./layout.HTM')).toBe('html');
    });
  });

  describe('media files', () => {
    it('should identify video formats', () => {
      expect(inferAssetTypeFromExtension('./video.mp4')).toBe('media');
      expect(inferAssetTypeFromExtension('./video.webm')).toBe('media');
      expect(inferAssetTypeFromExtension('./video.ogg')).toBe('media');
    });

    it('should identify audio formats', () => {
      expect(inferAssetTypeFromExtension('./audio.mp3')).toBe('media');
      expect(inferAssetTypeFromExtension('./audio.wav')).toBe('media');
    });

    it('should be case insensitive for media', () => {
      expect(inferAssetTypeFromExtension('./video.MP4')).toBe('media');
      expect(inferAssetTypeFromExtension('./audio.MP3')).toBe('media');
    });
  });

  describe('unknown extensions', () => {
    it('should default to html for unknown extensions', () => {
      expect(inferAssetTypeFromExtension('./file.txt')).toBe('html');
      expect(inferAssetTypeFromExtension('./file.json')).toBe('html');
      expect(inferAssetTypeFromExtension('./file.xyz')).toBe('html');
    });

    it('should default to html for no extension', () => {
      expect(inferAssetTypeFromExtension('./file')).toBe('html');
      expect(inferAssetTypeFromExtension('')).toBe('html');
    });
  });

  describe('edge cases', () => {
    it('should handle paths with multiple dots', () => {
      expect(inferAssetTypeFromExtension('./my.file.css')).toBe('css');
      expect(inferAssetTypeFromExtension('./my.file.html')).toBe('html');
      expect(inferAssetTypeFromExtension('./my.file.mp4')).toBe('media');
    });

    it('should handle paths with no directory', () => {
      expect(inferAssetTypeFromExtension('styles.css')).toBe('css');
      expect(inferAssetTypeFromExtension('layout.html')).toBe('html');
      expect(inferAssetTypeFromExtension('video.mp4')).toBe('media');
    });
  });
});
