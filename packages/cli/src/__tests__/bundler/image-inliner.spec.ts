/**
 * Image Inliner Tests
 *
 * Tests for the image-inliner module that converts images to base64 data URIs
 * and makes inlining decisions based on file size and type.
 *
 * Uses OS temp directory for test isolation per Vitest best practices:
 * @see https://sdorra.dev/posts/2024-02-12-vitest-tmpdir
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { inlineImage, shouldInline } from '../../bundler/image-inliner.js';

/**
 * Creates a unique temporary directory for test isolation
 */
async function createTempDir(): Promise<string> {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, 'eligian-test-');
  return await fs.mkdtemp(tmpdir);
}

describe('Image Inliner (Feature 040, Phase 2)', () => {
  let tmpdir: string;

  // Create fresh temp directory before each test
  beforeEach(async () => {
    tmpdir = await createTempDir();
  });

  // Clean up temp directory after each test
  afterEach(async () => {
    try {
      await fs.rm(tmpdir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('inlineImage', () => {
    test('should convert PNG image to base64 data URI', async () => {
      // Create a minimal 1x1 red PNG (67 bytes)
      const pngPath = path.join(tmpdir, 'test-image.png');
      const minimalPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
        'base64'
      );
      await fs.writeFile(pngPath, minimalPng);

      const dataUri = await Effect.runPromise(inlineImage(pngPath));

      expect(dataUri).toMatch(/^data:image\/png;base64,/);
      expect(dataUri).toContain('iVBORw0KGgo');
    });

    test('should convert JPEG image to base64 data URI', async () => {
      // Create a minimal JPEG (fake header for test)
      const jpegPath = path.join(tmpdir, 'test-image.jpg');
      // Minimal valid JPEG bytes
      const jpegBytes = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ]);
      await fs.writeFile(jpegPath, jpegBytes);

      const dataUri = await Effect.runPromise(inlineImage(jpegPath));

      expect(dataUri).toMatch(/^data:image\/jpeg;base64,/);
    });

    test('should URL-encode SVG instead of base64 for smaller output', async () => {
      const svgPath = path.join(tmpdir, 'test-icon.svg');
      const svgContent =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
      await fs.writeFile(svgPath, svgContent);

      const dataUri = await Effect.runPromise(inlineImage(svgPath));

      expect(dataUri).toMatch(/^data:image\/svg\+xml,/);
      expect(dataUri).not.toContain('base64');
      // Should contain URL-encoded SVG content
      expect(dataUri).toContain('%3Csvg');
    });

    test('should handle file not found error', async () => {
      const result = Effect.runPromise(inlineImage('/nonexistent/image.png'));
      await expect(result).rejects.toThrow();
    });

    test('should handle zero-byte file gracefully', async () => {
      const emptyPath = path.join(tmpdir, 'empty.png');
      await fs.writeFile(emptyPath, Buffer.alloc(0));

      // Should not throw, should return valid data URI with empty content
      const dataUri = await Effect.runPromise(inlineImage(emptyPath));
      expect(dataUri).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('shouldInline', () => {
    const DEFAULT_THRESHOLD = 51200; // 50KB

    test('should return true for image under threshold', async () => {
      const smallImagePath = path.join(tmpdir, 'small.png');
      const smallPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
        'base64'
      );
      await fs.writeFile(smallImagePath, smallPng);

      const decision = await Effect.runPromise(shouldInline(smallImagePath, DEFAULT_THRESHOLD));

      expect(decision.shouldInline).toBe(true);
      expect(decision.reason).toBe('under-threshold');
      expect(decision.mimeType).toBe('image/png');
    });

    test('should return false for image over threshold', async () => {
      const largeImagePath = path.join(tmpdir, 'large.png');
      // Create a "large" file (just over a tiny threshold for testing)
      const largeBuffer = Buffer.alloc(100);
      await fs.writeFile(largeImagePath, largeBuffer);

      const decision = await Effect.runPromise(shouldInline(largeImagePath, 50)); // 50 byte threshold

      expect(decision.shouldInline).toBe(false);
      expect(decision.reason).toBe('over-threshold');
    });

    test('should return false for video files regardless of size', async () => {
      const videoPath = path.join(tmpdir, 'tiny.mp4');
      await fs.writeFile(videoPath, Buffer.alloc(10)); // Tiny file

      const decision = await Effect.runPromise(shouldInline(videoPath, DEFAULT_THRESHOLD));

      expect(decision.shouldInline).toBe(false);
      expect(decision.reason).toBe('never-inline-type');
    });

    test('should return false for audio files regardless of size', async () => {
      const audioPath = path.join(tmpdir, 'tiny.mp3');
      await fs.writeFile(audioPath, Buffer.alloc(10));

      const decision = await Effect.runPromise(shouldInline(audioPath, DEFAULT_THRESHOLD));

      expect(decision.shouldInline).toBe(false);
      expect(decision.reason).toBe('never-inline-type');
    });

    test('should return correct MIME type for font files', async () => {
      const woffPath = path.join(tmpdir, 'test.woff2');
      await fs.writeFile(woffPath, Buffer.alloc(100));

      const decision = await Effect.runPromise(shouldInline(woffPath, DEFAULT_THRESHOLD));

      expect(decision.mimeType).toBe('font/woff2');
    });

    test('should return octet-stream for unknown extension', async () => {
      const unknownPath = path.join(tmpdir, 'file.xyz');
      await fs.writeFile(unknownPath, Buffer.alloc(10));

      const decision = await Effect.runPromise(shouldInline(unknownPath, DEFAULT_THRESHOLD));

      expect(decision.mimeType).toBe('application/octet-stream');
    });

    // Phase 5: Additional edge cases for inlining decisions
    describe('threshold edge cases', () => {
      test('should return true for file exactly at threshold', async () => {
        const exactPath = path.join(tmpdir, 'exact.png');
        const threshold = 100;
        // Create file exactly at threshold (implementation uses > not >=)
        await fs.writeFile(exactPath, Buffer.alloc(threshold));

        const decision = await Effect.runPromise(shouldInline(exactPath, threshold));

        // File at exactly threshold SHOULD be inlined (size > threshold check means <= is OK)
        expect(decision.shouldInline).toBe(true);
        expect(decision.reason).toBe('under-threshold');
        expect(decision.size).toBe(threshold);
      });

      test('should return true for file one byte under threshold', async () => {
        const underPath = path.join(tmpdir, 'under.png');
        const threshold = 100;
        await fs.writeFile(underPath, Buffer.alloc(threshold - 1));

        const decision = await Effect.runPromise(shouldInline(underPath, threshold));

        expect(decision.shouldInline).toBe(true);
        expect(decision.reason).toBe('under-threshold');
        expect(decision.size).toBe(threshold - 1);
      });

      test('should return false for file one byte over threshold', async () => {
        const overPath = path.join(tmpdir, 'over.png');
        const threshold = 100;
        await fs.writeFile(overPath, Buffer.alloc(threshold + 1));

        const decision = await Effect.runPromise(shouldInline(overPath, threshold));

        expect(decision.shouldInline).toBe(false);
        expect(decision.reason).toBe('over-threshold');
        expect(decision.size).toBe(threshold + 1);
      });

      test('should return false when threshold is 0 (inlining disabled)', async () => {
        const smallPath = path.join(tmpdir, 'tiny.png');
        await fs.writeFile(smallPath, Buffer.alloc(10));

        const decision = await Effect.runPromise(shouldInline(smallPath, 0));

        // With threshold 0, no file should be inlined
        expect(decision.shouldInline).toBe(false);
        expect(decision.reason).toBe('over-threshold');
      });

      test('should inline zero-byte file when threshold > 0', async () => {
        const emptyPath = path.join(tmpdir, 'empty.png');
        await fs.writeFile(emptyPath, Buffer.alloc(0));

        const decision = await Effect.runPromise(shouldInline(emptyPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(true);
        expect(decision.size).toBe(0);
      });
    });

    describe('never-inline file types', () => {
      test('should never inline .webm regardless of size', async () => {
        const webmPath = path.join(tmpdir, 'video.webm');
        await fs.writeFile(webmPath, Buffer.alloc(10));

        const decision = await Effect.runPromise(shouldInline(webmPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(false);
        expect(decision.reason).toBe('never-inline-type');
        expect(decision.mimeType).toBe('video/webm');
      });

      test('should never inline .ogg audio regardless of size', async () => {
        const oggPath = path.join(tmpdir, 'audio.ogg');
        await fs.writeFile(oggPath, Buffer.alloc(10));

        const decision = await Effect.runPromise(shouldInline(oggPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(false);
        expect(decision.reason).toBe('never-inline-type');
      });

      test('should never inline .wav regardless of size', async () => {
        const wavPath = path.join(tmpdir, 'sound.wav');
        await fs.writeFile(wavPath, Buffer.alloc(10));

        const decision = await Effect.runPromise(shouldInline(wavPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(false);
        expect(decision.reason).toBe('never-inline-type');
        expect(decision.mimeType).toBe('audio/wav');
      });

      test('should never inline .mov regardless of size', async () => {
        const movPath = path.join(tmpdir, 'video.mov');
        await fs.writeFile(movPath, Buffer.alloc(10));

        const decision = await Effect.runPromise(shouldInline(movPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(false);
        expect(decision.reason).toBe('never-inline-type');
        expect(decision.mimeType).toBe('video/quicktime');
      });

      test('should never inline .flac regardless of size', async () => {
        const flacPath = path.join(tmpdir, 'audio.flac');
        await fs.writeFile(flacPath, Buffer.alloc(10));

        const decision = await Effect.runPromise(shouldInline(flacPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(false);
        expect(decision.reason).toBe('never-inline-type');
        expect(decision.mimeType).toBe('audio/flac');
      });
    });

    describe('inlineable file types', () => {
      test('should inline .webp under threshold', async () => {
        const webpPath = path.join(tmpdir, 'image.webp');
        await fs.writeFile(webpPath, Buffer.alloc(100));

        const decision = await Effect.runPromise(shouldInline(webpPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(true);
        expect(decision.mimeType).toBe('image/webp');
      });

      test('should inline .gif under threshold', async () => {
        const gifPath = path.join(tmpdir, 'animation.gif');
        await fs.writeFile(gifPath, Buffer.alloc(100));

        const decision = await Effect.runPromise(shouldInline(gifPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(true);
        expect(decision.mimeType).toBe('image/gif');
      });

      test('should inline .svg under threshold', async () => {
        const svgPath = path.join(tmpdir, 'icon.svg');
        await fs.writeFile(svgPath, '<svg></svg>');

        const decision = await Effect.runPromise(shouldInline(svgPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(true);
        expect(decision.mimeType).toBe('image/svg+xml');
      });

      test('should inline .ico under threshold', async () => {
        const icoPath = path.join(tmpdir, 'favicon.ico');
        await fs.writeFile(icoPath, Buffer.alloc(100));

        const decision = await Effect.runPromise(shouldInline(icoPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(true);
        expect(decision.mimeType).toBe('image/x-icon');
      });

      test('should inline .woff font under threshold', async () => {
        const woffPath = path.join(tmpdir, 'font.woff');
        await fs.writeFile(woffPath, Buffer.alloc(100));

        const decision = await Effect.runPromise(shouldInline(woffPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(true);
        expect(decision.mimeType).toBe('font/woff');
      });

      test('should inline .ttf font under threshold', async () => {
        const ttfPath = path.join(tmpdir, 'font.ttf');
        await fs.writeFile(ttfPath, Buffer.alloc(100));

        const decision = await Effect.runPromise(shouldInline(ttfPath, DEFAULT_THRESHOLD));

        expect(decision.shouldInline).toBe(true);
        expect(decision.mimeType).toBe('font/ttf');
      });
    });

    describe('error handling', () => {
      test('should fail for non-existent file', async () => {
        const nonExistent = path.join(tmpdir, 'does-not-exist.png');

        const result = Effect.runPromise(shouldInline(nonExistent, DEFAULT_THRESHOLD));

        await expect(result).rejects.toThrow();
      });
    });
  });
});
