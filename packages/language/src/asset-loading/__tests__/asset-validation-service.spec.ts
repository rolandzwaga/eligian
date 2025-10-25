/**
 * Asset Validation Service Tests
 *
 * Integration tests for the AssetValidationService.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AssetValidationService } from '../asset-validation-service.js';
import { CssValidator } from '../css-validator.js';
import { HtmlValidator } from '../html-validator.js';
import { MediaValidator } from '../media-validator.js';
import { NodeAssetLoader } from '../node-asset-loader.js';

// Get current file's directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Asset Validation Service', () => {
  const assetLoader = new NodeAssetLoader();
  const htmlValidator = new HtmlValidator();
  const cssValidator = new CssValidator();
  const mediaValidator = new MediaValidator();

  const service = new AssetValidationService(
    assetLoader,
    htmlValidator,
    cssValidator,
    mediaValidator
  );

  const fixturesDir = resolve(__dirname, '../__fixtures__/assets');
  const sourcePath = resolve(fixturesDir, 'test.eligian');

  describe('HTML Asset Validation', () => {
    it('should validate existing valid HTML file', () => {
      const htmlPath = resolve(fixturesDir, 'valid.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './valid.html');

      expect(errors).toHaveLength(0);
    });

    it('should detect missing HTML file', () => {
      const htmlPath = resolve(fixturesDir, 'missing.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './missing.html');

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe('missing-file');
      expect(errors[0].filePath).toBe('./missing.html');
      expect(errors[0].absolutePath).toBe(htmlPath);
    });

    it('should provide source location in errors', () => {
      const htmlPath = resolve(fixturesDir, 'missing.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './missing.html');

      expect(errors[0].sourceLocation).toBeDefined();
      expect(errors[0].sourceLocation.file).toBe(sourcePath);
    });

    it('should provide helpful hints', () => {
      const htmlPath = resolve(fixturesDir, 'missing.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './missing.html');

      expect(errors[0].hint).toBeTruthy();
      expect(errors[0].hint.length).toBeGreaterThan(0);
    });
  });

  describe('CSS Asset Validation', () => {
    it('should validate existing valid CSS file', () => {
      const cssPath = resolve(fixturesDir, 'valid.css');
      const errors = service.validateAsset('css', cssPath, sourcePath, './valid.css');

      expect(errors).toHaveLength(0);
    });

    it('should detect missing CSS file', () => {
      const cssPath = resolve(fixturesDir, 'missing.css');
      const errors = service.validateAsset('css', cssPath, sourcePath, './missing.css');

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe('missing-file');
      expect(errors[0].filePath).toBe('./missing.css');
    });

    it('should include relative path in errors', () => {
      const cssPath = resolve(fixturesDir, 'missing.css');
      const errors = service.validateAsset('css', cssPath, sourcePath, './assets/missing.css');

      expect(errors[0].filePath).toBe('./assets/missing.css');
    });
  });

  describe('Media Asset Validation', () => {
    it('should validate existing media file (image)', () => {
      const imagePath = resolve(fixturesDir, 'test-image.png');
      const errors = service.validateAsset('media', imagePath, sourcePath, './test-image.png');

      expect(errors).toHaveLength(0);
    });

    it('should validate existing media file (video)', () => {
      const videoPath = resolve(fixturesDir, 'test-video.mp4');
      const errors = service.validateAsset('media', videoPath, sourcePath, './test-video.mp4');

      expect(errors).toHaveLength(0);
    });

    it('should validate existing media file (audio)', () => {
      const audioPath = resolve(fixturesDir, 'test-audio.mp3');
      const errors = service.validateAsset('media', audioPath, sourcePath, './test-audio.mp3');

      expect(errors).toHaveLength(0);
    });

    it('should detect missing media file', () => {
      const imagePath = resolve(fixturesDir, 'missing.png');
      const errors = service.validateAsset('media', imagePath, sourcePath, './missing.png');

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe('missing-file');
    });
  });

  describe('Error Structure', () => {
    it('should include all required error fields', () => {
      const htmlPath = resolve(fixturesDir, 'missing.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './missing.html');

      expect(errors[0]).toHaveProperty('type');
      expect(errors[0]).toHaveProperty('filePath');
      expect(errors[0]).toHaveProperty('absolutePath');
      expect(errors[0]).toHaveProperty('sourceLocation');
      expect(errors[0]).toHaveProperty('message');
      expect(errors[0]).toHaveProperty('hint');
    });

    it('should use correct error type for missing files', () => {
      const htmlPath = resolve(fixturesDir, 'missing.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './missing.html');

      expect(errors[0].type).toBe('missing-file');
    });

    it('should include clear error messages', () => {
      const htmlPath = resolve(fixturesDir, 'missing.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './missing.html');

      expect(errors[0].message.toLowerCase()).toContain('not found');
    });
  });

  describe('Cross-Asset-Type Validation', () => {
    it('should handle HTML, CSS, and media files in sequence', () => {
      const htmlPath = resolve(fixturesDir, 'valid.html');
      const cssPath = resolve(fixturesDir, 'valid.css');
      const imagePath = resolve(fixturesDir, 'test-image.png');

      const htmlErrors = service.validateAsset('html', htmlPath, sourcePath, './valid.html');
      const cssErrors = service.validateAsset('css', cssPath, sourcePath, './valid.css');
      const mediaErrors = service.validateAsset('media', imagePath, sourcePath, './test-image.png');

      expect(htmlErrors).toHaveLength(0);
      expect(cssErrors).toHaveLength(0);
      expect(mediaErrors).toHaveLength(0);
    });

    it('should validate multiple assets of same type', () => {
      const html1 = resolve(fixturesDir, 'valid.html');
      const html2 = resolve(fixturesDir, 'unclosed-tags.html');

      const errors1 = service.validateAsset('html', html1, sourcePath, './valid.html');
      const errors2 = service.validateAsset('html', html2, sourcePath, './unclosed-tags.html');

      expect(errors1).toHaveLength(0);
      // unclosed-tags.html should be valid (fault-tolerant)
      expect(errors2).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty relative path', () => {
      const htmlPath = resolve(fixturesDir, 'valid.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, '');

      expect(errors).toHaveLength(0);
    });

    it('should handle nested relative paths', () => {
      const htmlPath = resolve(fixturesDir, 'valid.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, './assets/layout.html');

      expect(errors).toHaveLength(0);
    });

    it('should handle parent directory references', () => {
      const htmlPath = resolve(fixturesDir, 'valid.html');
      const errors = service.validateAsset('html', htmlPath, sourcePath, '../shared/layout.html');

      expect(errors).toHaveLength(0);
    });
  });
});
