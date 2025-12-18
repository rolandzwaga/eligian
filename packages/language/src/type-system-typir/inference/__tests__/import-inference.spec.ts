/**
 * Unit tests for import inference rules
 *
 * Tests verify that Typir inference rules correctly infer ImportType
 * from DefaultImport and NamedImport AST nodes.
 *
 * Test Coverage:
 * - T017-1: DefaultImport inference from keywords (layout/styles/provider)
 * - T017-2: NamedImport inference from file extension
 * - T017-3: NamedImport with explicit as clause
 * - T017-4: Edge cases for unknown/missing extensions
 */

import { describe, expect, it } from 'vitest';
import { inferAssetTypeFromExtension } from '../../utils/asset-type-inferrer.js';
import { inferAssetTypeFromKeyword } from '../import-inference.js';

describe('Import Inference Rules (Unit)', () => {
  describe('T017-1: DefaultImport inference from keywords', () => {
    it('should infer html type from layout keyword', () => {
      const result = inferAssetTypeFromKeyword('layout');
      expect(result).toBe('html');
    });

    it('should infer css type from styles keyword', () => {
      const result = inferAssetTypeFromKeyword('styles');
      expect(result).toBe('css');
    });

    it('should infer media type from provider keyword', () => {
      const result = inferAssetTypeFromKeyword('provider');
      expect(result).toBe('media');
    });

    it('should infer json type from locales keyword', () => {
      const result = inferAssetTypeFromKeyword('locales');
      expect(result).toBe('json');
    });
  });

  describe('T017-2: NamedImport inference from file extension', () => {
    it('should infer css type from .css extension', () => {
      const result = inferAssetTypeFromExtension('./styles/main.css');
      expect(result).toBe('css');
    });

    it('should infer html type from .html extension', () => {
      const result = inferAssetTypeFromExtension('./templates/layout.html');
      expect(result).toBe('html');
    });

    it('should infer html type from .htm extension', () => {
      const result = inferAssetTypeFromExtension('./old/page.htm');
      expect(result).toBe('html');
    });

    it('should infer media type from .mp4 extension', () => {
      const result = inferAssetTypeFromExtension('./videos/intro.mp4');
      expect(result).toBe('media');
    });

    it('should infer media type from .mp3 extension', () => {
      const result = inferAssetTypeFromExtension('./audio/background.mp3');
      expect(result).toBe('media');
    });

    it('should infer media type from .webm extension', () => {
      const result = inferAssetTypeFromExtension('./videos/clip.webm');
      expect(result).toBe('media');
    });

    it('should infer media type from .ogg extension', () => {
      const result = inferAssetTypeFromExtension('./audio/track.ogg');
      expect(result).toBe('media');
    });

    it('should infer media type from .wav extension', () => {
      const result = inferAssetTypeFromExtension('./audio/sound.wav');
      expect(result).toBe('media');
    });
  });

  describe('T017-3: NamedImport with explicit as clause', () => {
    // Note: These test the inferAssetTypeFromExtension behavior.
    // The actual 'as' clause handling is done in registerImportInference()
    // which prefers explicit type over inferred type.
    // Here we verify the extension inference that serves as fallback.

    it('should infer type from extension when no as clause', () => {
      // When NamedImport has no assetType, extension is used
      const cssResult = inferAssetTypeFromExtension('./theme.css');
      const htmlResult = inferAssetTypeFromExtension('./layout.html');
      const mediaResult = inferAssetTypeFromExtension('./video.mp4');

      expect(cssResult).toBe('css');
      expect(htmlResult).toBe('html');
      expect(mediaResult).toBe('media');
    });

    it('should handle case-insensitive extensions', () => {
      expect(inferAssetTypeFromExtension('./style.CSS')).toBe('css');
      expect(inferAssetTypeFromExtension('./page.HTML')).toBe('html');
      expect(inferAssetTypeFromExtension('./video.MP4')).toBe('media');
    });
  });

  describe('T017-4: Edge cases', () => {
    it('should handle unknown extensions gracefully', () => {
      // Unknown extensions default to 'html'
      const result = inferAssetTypeFromExtension('./data.txt');
      expect(result).toBe('html');
    });

    it('should handle .json extension as html (default fallback)', () => {
      // JSON files default to 'html' when inferred from extension
      const result = inferAssetTypeFromExtension('./data.json');
      expect(result).toBe('html');
    });

    it('should handle paths without extensions', () => {
      // No extension defaults to 'html'
      const result = inferAssetTypeFromExtension('./noextension');
      expect(result).toBe('html');
    });

    it('should handle empty paths', () => {
      const result = inferAssetTypeFromExtension('');
      expect(result).toBe('html');
    });

    it('should handle paths with multiple dots', () => {
      const result = inferAssetTypeFromExtension('./my.theme.styles.css');
      expect(result).toBe('css');
    });

    it('should handle absolute paths', () => {
      const result = inferAssetTypeFromExtension('/home/user/project/styles.css');
      expect(result).toBe('css');
    });

    it('should handle paths with query parameters preserved in extension', () => {
      // Note: This tests current behavior - extension includes everything after last dot
      // './style.css?v=1' has "css?v=1" as extension which won't match
      const result = inferAssetTypeFromExtension('./style.css?v=1');
      expect(result).toBe('html'); // Falls back to html
    });
  });
});
