/**
 * Asset Collector Tests
 *
 * Tests for the asset-collector module that collects all assets
 * referenced in CSS files and configuration.
 *
 * Includes test for FR-011: video/audio files copied to assets folder, never inlined.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  type CollectOptions,
  collectAssets,
  createOutputPathTracker,
  extractCSSUrls,
  extractHTMLUrls,
  generateUniqueOutputPath,
  resolveAssetPath,
} from '../../bundler/asset-collector.js';

/**
 * Creates a unique temporary directory for test isolation
 */
async function createTempDir(): Promise<string> {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, 'eligian-asset-collector-test-');
  return await fs.mkdtemp(tmpdir);
}

/**
 * Create a minimal Eligius config for testing
 */
function createMinimalConfig() {
  return {
    containerSelector: '#presentation',
    initActions: [],
    actions: [],
    timelines: [],
  };
}

/**
 * Create a config with video provider
 */
function createVideoConfig() {
  return {
    containerSelector: '#presentation',
    timelineProviderSettings: {
      video: {
        selector: '#video-element',
        src: './media/video.mp4',
      },
    },
    initActions: [],
    actions: [],
    timelines: [],
  };
}

/**
 * Default collect options
 */
const defaultOptions: CollectOptions = {
  inlineThreshold: 51200, // 50KB
};

describe('Asset Collector (Feature 040, Phase 4)', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await createTempDir();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpdir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('extractCSSUrls', () => {
    test('should extract url() references from CSS', () => {
      const cssContent = `
        .hero { background: url('./images/hero.png'); }
        .icon { background-image: url("./icons/star.svg"); }
      `;

      const urls = extractCSSUrls(cssContent);

      expect(urls).toContain('./images/hero.png');
      expect(urls).toContain('./icons/star.svg');
    });

    test('should extract url() without quotes', () => {
      const cssContent = '.bg { background: url(./image.png); }';

      const urls = extractCSSUrls(cssContent);

      expect(urls).toContain('./image.png');
    });

    test('should extract @font-face src urls', () => {
      const cssContent = `
        @font-face {
          font-family: 'CustomFont';
          src: url('./fonts/custom.woff2') format('woff2'),
               url('./fonts/custom.woff') format('woff');
        }
      `;

      const urls = extractCSSUrls(cssContent);

      expect(urls).toContain('./fonts/custom.woff2');
      expect(urls).toContain('./fonts/custom.woff');
    });

    test('should skip http:// URLs', () => {
      const cssContent = '.external { background: url("http://example.com/image.png"); }';

      const urls = extractCSSUrls(cssContent);

      expect(urls).not.toContain('http://example.com/image.png');
      expect(urls).toHaveLength(0);
    });

    test('should skip https:// URLs', () => {
      const cssContent = '.external { background: url("https://cdn.example.com/image.png"); }';

      const urls = extractCSSUrls(cssContent);

      expect(urls).not.toContain('https://cdn.example.com/image.png');
      expect(urls).toHaveLength(0);
    });

    test('should skip data: URIs', () => {
      const cssContent = '.icon { background: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"); }';

      const urls = extractCSSUrls(cssContent);

      expect(urls).toHaveLength(0);
    });

    test('should deduplicate URLs', () => {
      const cssContent = `
        .btn1 { background: url('./shared.png'); }
        .btn2 { background: url('./shared.png'); }
      `;

      const urls = extractCSSUrls(cssContent);

      expect(urls).toHaveLength(1);
      expect(urls).toContain('./shared.png');
    });

    test('should return empty array for CSS without URLs', () => {
      const cssContent = '.button { color: blue; padding: 10px; }';

      const urls = extractCSSUrls(cssContent);

      expect(urls).toEqual([]);
    });

    test('should return empty array for empty CSS', () => {
      const urls = extractCSSUrls('');

      expect(urls).toEqual([]);
    });
  });

  // IMP2: HTML Layout Template Image Parsing tests (TDD - tests first)
  describe('extractHTMLUrls (IMP2)', () => {
    test('should extract src from img elements', () => {
      const html = '<img src="./images/hero.png" alt="Hero">';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./images/hero.png');
    });

    test('should extract src from multiple img elements', () => {
      const html = `
        <img src="./images/hero.png" alt="Hero">
        <img src="./images/logo.svg" alt="Logo">
      `;

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./images/hero.png');
      expect(urls).toContain('./images/logo.svg');
      expect(urls).toHaveLength(2);
    });

    test('should extract src from source elements', () => {
      const html = `
        <video>
          <source src="./media/video.mp4" type="video/mp4">
          <source src="./media/video.webm" type="video/webm">
        </video>
      `;

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./media/video.mp4');
      expect(urls).toContain('./media/video.webm');
    });

    test('should extract src from video elements', () => {
      const html = '<video src="./media/intro.mp4"></video>';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./media/intro.mp4');
    });

    test('should extract src from audio elements', () => {
      const html = '<audio src="./media/sound.mp3"></audio>';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./media/sound.mp3');
    });

    test('should extract poster from video elements', () => {
      const html = '<video src="./media/video.mp4" poster="./images/poster.jpg"></video>';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./media/video.mp4');
      expect(urls).toContain('./images/poster.jpg');
    });

    test('should extract srcset from img elements', () => {
      const html =
        '<img src="./images/hero.png" srcset="./images/hero-2x.png 2x, ./images/hero-3x.png 3x">';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./images/hero.png');
      expect(urls).toContain('./images/hero-2x.png');
      expect(urls).toContain('./images/hero-3x.png');
    });

    test('should extract srcset with width descriptors', () => {
      const html =
        '<img srcset="./images/small.jpg 480w, ./images/medium.jpg 800w, ./images/large.jpg 1200w">';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./images/small.jpg');
      expect(urls).toContain('./images/medium.jpg');
      expect(urls).toContain('./images/large.jpg');
    });

    test('should skip external http:// URLs', () => {
      const html = '<img src="http://example.com/image.png">';

      const urls = extractHTMLUrls(html);

      expect(urls).toHaveLength(0);
    });

    test('should skip external https:// URLs', () => {
      const html = '<img src="https://cdn.example.com/image.png">';

      const urls = extractHTMLUrls(html);

      expect(urls).toHaveLength(0);
    });

    test('should skip data: URIs', () => {
      const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';

      const urls = extractHTMLUrls(html);

      expect(urls).toHaveLength(0);
    });

    test('should skip protocol-relative URLs', () => {
      const html = '<img src="//cdn.example.com/image.png">';

      const urls = extractHTMLUrls(html);

      expect(urls).toHaveLength(0);
    });

    test('should deduplicate URLs', () => {
      const html = `
        <img src="./images/logo.png">
        <img src="./images/logo.png">
      `;

      const urls = extractHTMLUrls(html);

      expect(urls).toHaveLength(1);
      expect(urls).toContain('./images/logo.png');
    });

    test('should handle double-quoted attributes', () => {
      const html = '<img src="./images/hero.png">';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./images/hero.png');
    });

    test('should handle single-quoted attributes', () => {
      const html = "<img src='./images/hero.png'>";

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./images/hero.png');
    });

    test('should return empty array for HTML without asset references', () => {
      const html = '<div class="container"><p>Hello World</p></div>';

      const urls = extractHTMLUrls(html);

      expect(urls).toEqual([]);
    });

    test('should return empty array for empty HTML', () => {
      const urls = extractHTMLUrls('');

      expect(urls).toEqual([]);
    });

    test('should handle complex HTML with mixed content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
        </head>
        <body>
          <header>
            <img src="./images/logo.png" alt="Logo">
          </header>
          <main>
            <img src="./images/hero.jpg" srcset="./images/hero-2x.jpg 2x">
            <video poster="./images/poster.png">
              <source src="./media/video.mp4" type="video/mp4">
            </video>
          </main>
        </body>
        </html>
      `;

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./images/logo.png');
      expect(urls).toContain('./images/hero.jpg');
      expect(urls).toContain('./images/hero-2x.jpg');
      expect(urls).toContain('./images/poster.png');
      expect(urls).toContain('./media/video.mp4');
      expect(urls).toHaveLength(5);
    });

    test('should handle img with both src and srcset', () => {
      const html = '<img src="./fallback.png" srcset="./image-1x.png 1x, ./image-2x.png 2x">';

      const urls = extractHTMLUrls(html);

      expect(urls).toContain('./fallback.png');
      expect(urls).toContain('./image-1x.png');
      expect(urls).toContain('./image-2x.png');
      expect(urls).toHaveLength(3);
    });
  });

  describe('resolveAssetPath', () => {
    test('should resolve relative path from CSS file', () => {
      // Use tmpdir-based paths for cross-platform compatibility
      const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
      const urlRef = './images/hero.png';

      const resolved = resolveAssetPath(urlRef, cssFilePath);

      // path.resolve produces platform-specific paths
      expect(resolved).toBe(path.join(tmpdir, 'styles', 'images', 'hero.png'));
    });

    test('should resolve parent directory path', () => {
      const cssFilePath = path.join(tmpdir, 'styles', 'components', 'button.css');
      const urlRef = '../../images/hero.png';

      const resolved = resolveAssetPath(urlRef, cssFilePath);

      expect(resolved).toBe(path.join(tmpdir, 'images', 'hero.png'));
    });

    test('should handle path without ./ prefix', () => {
      const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
      const urlRef = 'images/hero.png';

      const resolved = resolveAssetPath(urlRef, cssFilePath);

      expect(resolved).toBe(path.join(tmpdir, 'styles', 'images', 'hero.png'));
    });
  });

  describe('collectAssets', () => {
    test('should collect assets from single CSS file', async () => {
      // Create CSS file with image reference
      const cssPath = path.join(tmpdir, 'styles.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'hero.png');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(cssPath, '.hero { background: url("./images/hero.png"); }');
      // Create a small fake image (under threshold)
      await fs.writeFile(imgPath, Buffer.alloc(1024)); // 1KB

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      expect(manifest.assets.size).toBe(1);
      expect(manifest.assets.has(imgPath)).toBe(true);

      const asset = manifest.assets.get(imgPath)!;
      expect(asset.outputPath).toBe('assets/hero.png');
      expect(asset.inline).toBe(true); // Under 50KB threshold
    });

    test('should collect assets from multiple CSS files', async () => {
      const css1Path = path.join(tmpdir, 'main.css');
      const css2Path = path.join(tmpdir, 'theme.css');
      const imgDir = path.join(tmpdir, 'images');
      const img1Path = path.join(imgDir, 'hero.png');
      const img2Path = path.join(imgDir, 'logo.png');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(css1Path, '.hero { background: url("./images/hero.png"); }');
      await fs.writeFile(css2Path, '.logo { background: url("./images/logo.png"); }');
      await fs.writeFile(img1Path, Buffer.alloc(1024));
      await fs.writeFile(img2Path, Buffer.alloc(1024));

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [css1Path, css2Path], tmpdir, defaultOptions)
      );

      expect(manifest.assets.size).toBe(2);
      expect(manifest.assets.has(img1Path)).toBe(true);
      expect(manifest.assets.has(img2Path)).toBe(true);
    });

    test('should deduplicate assets referenced multiple times', async () => {
      const css1Path = path.join(tmpdir, 'main.css');
      const css2Path = path.join(tmpdir, 'header.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'logo.png');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(css1Path, '.logo { background: url("./images/logo.png"); }');
      await fs.writeFile(css2Path, '.header-logo { background: url("./images/logo.png"); }');
      await fs.writeFile(imgPath, Buffer.alloc(1024));

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [css1Path, css2Path], tmpdir, defaultOptions)
      );

      expect(manifest.assets.size).toBe(1);
      const asset = manifest.assets.get(imgPath)!;
      // Should track both sources
      expect(asset.sources.length).toBe(2);
    });

    test('should mark large images for copying (not inlining)', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'large.jpg');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(cssPath, '.hero { background: url("./images/large.jpg"); }');
      // Create image larger than 50KB threshold
      await fs.writeFile(imgPath, Buffer.alloc(60000)); // 60KB

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      const asset = manifest.assets.get(imgPath)!;
      expect(asset.inline).toBe(false); // Over threshold
      expect(asset.dataUri).toBeUndefined();
    });

    test('should never inline video files regardless of size (FR-011)', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const mediaDir = path.join(tmpdir, 'media');
      const videoPath = path.join(mediaDir, 'intro.mp4');

      await fs.mkdir(mediaDir, { recursive: true });
      // Empty CSS, video comes from config
      await fs.writeFile(cssPath, '/* empty */');
      // Small video file (but should still not be inlined)
      await fs.writeFile(videoPath, Buffer.alloc(1024));

      const config = {
        ...createVideoConfig(),
        timelineProviderSettings: {
          video: {
            selector: '#video',
            src: './media/intro.mp4',
          },
        },
      };

      const manifest = await Effect.runPromise(
        collectAssets(config, [cssPath], tmpdir, defaultOptions)
      );

      expect(manifest.assets.has(videoPath)).toBe(true);
      const asset = manifest.assets.get(videoPath)!;
      expect(asset.inline).toBe(false); // Never inline video
    });

    test('should never inline audio files regardless of size (FR-011)', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const mediaDir = path.join(tmpdir, 'media');
      const audioPath = path.join(mediaDir, 'sound.mp3');

      await fs.mkdir(mediaDir, { recursive: true });
      await fs.writeFile(cssPath, '/* empty */');
      await fs.writeFile(audioPath, Buffer.alloc(1024));

      const config = {
        ...createMinimalConfig(),
        timelineProviderSettings: {
          audio: {
            src: './media/sound.mp3',
          },
        },
      };

      const manifest = await Effect.runPromise(
        collectAssets(config, [cssPath], tmpdir, defaultOptions)
      );

      expect(manifest.assets.has(audioPath)).toBe(true);
      const asset = manifest.assets.get(audioPath)!;
      expect(asset.inline).toBe(false); // Never inline audio
    });

    test('should skip external http:// URLs', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      await fs.writeFile(cssPath, '.external { background: url("http://example.com/image.png"); }');

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      expect(manifest.assets.size).toBe(0);
    });

    test('should skip data: URIs', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      await fs.writeFile(
        cssPath,
        '.icon { background: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"); }'
      );

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      expect(manifest.assets.size).toBe(0);
    });

    test('should return empty manifest for empty CSS list', async () => {
      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [], tmpdir, defaultOptions)
      );

      expect(manifest.assets.size).toBe(0);
      expect(manifest.cssSourceFiles).toEqual([]);
    });

    test('should fail with AssetNotFoundError for missing asset', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      await fs.writeFile(cssPath, '.missing { background: url("./images/nonexistent.png"); }');

      const result = await Effect.runPromiseExit(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      expect(result._tag).toBe('Failure');
    });

    test('should use custom inline threshold', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'medium.png');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(cssPath, '.img { background: url("./images/medium.png"); }');
      // 30KB - under 50KB default but over 10KB custom threshold
      await fs.writeFile(imgPath, Buffer.alloc(30000));

      const customOptions: CollectOptions = {
        inlineThreshold: 10000, // 10KB threshold
      };

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, customOptions)
      );

      const asset = manifest.assets.get(imgPath)!;
      expect(asset.inline).toBe(false); // Over custom threshold
    });

    test('should disable inlining when threshold is 0', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'tiny.png');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(cssPath, '.icon { background: url("./images/tiny.png"); }');
      await fs.writeFile(imgPath, Buffer.alloc(100)); // Very small

      const noInlineOptions: CollectOptions = {
        inlineThreshold: 0, // Disable inlining
      };

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, noInlineOptions)
      );

      const asset = manifest.assets.get(imgPath)!;
      expect(asset.inline).toBe(false);
    });

    test('should generate data URI for inlined images', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'icon.png');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(cssPath, '.icon { background: url("./images/icon.png"); }');
      // Create small PNG-like content
      const pngContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      await fs.writeFile(imgPath, pngContent);

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      const asset = manifest.assets.get(imgPath)!;
      expect(asset.inline).toBe(true);
      expect(asset.dataUri).toBeDefined();
      expect(asset.dataUri).toMatch(/^data:image\/png;base64,/);
    });

    test('should track CSS source files in manifest', async () => {
      const css1Path = path.join(tmpdir, 'main.css');
      const css2Path = path.join(tmpdir, 'theme.css');

      await fs.writeFile(css1Path, '.main { color: blue; }');
      await fs.writeFile(css2Path, '.theme { color: red; }');

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [css1Path, css2Path], tmpdir, defaultOptions)
      );

      expect(manifest.cssSourceFiles).toEqual([css1Path, css2Path]);
    });

    test('should handle fonts with correct MIME type', async () => {
      const cssPath = path.join(tmpdir, 'fonts.css');
      const fontDir = path.join(tmpdir, 'fonts');
      const fontPath = path.join(fontDir, 'custom.woff2');

      await fs.mkdir(fontDir, { recursive: true });
      await fs.writeFile(
        cssPath,
        "@font-face { font-family: 'Custom'; src: url('./fonts/custom.woff2'); }"
      );
      await fs.writeFile(fontPath, Buffer.alloc(1024));

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      const asset = manifest.assets.get(fontPath)!;
      expect(asset.mimeType).toBe('font/woff2');
    });
  });

  // Phase 7: Edge case error handling tests
  describe('edge cases (Phase 7)', () => {
    test('should handle unsupported image format by copying (not inlining)', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'image.xyz'); // Unknown extension

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(cssPath, '.bg { background: url("./images/image.xyz"); }');
      await fs.writeFile(imgPath, Buffer.alloc(100)); // Small file

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      const asset = manifest.assets.get(imgPath)!;
      // Unknown formats get application/octet-stream MIME type
      expect(asset.mimeType).toBe('application/octet-stream');
      // Should still be collected but not necessarily inlined (depends on canInline)
      expect(asset.outputPath).toContain('assets/');
    });

    test('should handle CSS file referencing itself gracefully', async () => {
      // This is a degenerate case - CSS can't really reference itself as an asset
      // But we test that the URL extraction doesn't cause infinite loops
      const cssPath = path.join(tmpdir, 'self.css');
      // url() pointing to itself would be caught as the file exists
      await fs.writeFile(cssPath, '.bg { background: url("./self.css"); }');

      // This should work - CSS file is valid, the URL just happens to point to itself
      // The asset collector will try to process it as an asset
      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      // The CSS file itself gets collected as an "asset" (which is unusual but valid)
      expect(manifest.assets.has(cssPath)).toBe(true);
    });

    test('should handle multiple CSS files referencing same asset', async () => {
      const css1Path = path.join(tmpdir, 'main.css');
      const css2Path = path.join(tmpdir, 'theme.css');
      const imgDir = path.join(tmpdir, 'images');
      const imgPath = path.join(imgDir, 'shared.png');

      await fs.mkdir(imgDir, { recursive: true });
      await fs.writeFile(css1Path, '.bg1 { background: url("./images/shared.png"); }');
      await fs.writeFile(css2Path, '.bg2 { background: url("./images/shared.png"); }');
      await fs.writeFile(imgPath, Buffer.alloc(100));

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [css1Path, css2Path], tmpdir, defaultOptions)
      );

      // Asset should be deduplicated but have multiple sources
      const asset = manifest.assets.get(imgPath)!;
      expect(asset).toBeDefined();
      expect(asset.sources.length).toBe(2);
      expect(asset.sources[0].file).toBe(css1Path);
      expect(asset.sources[1].file).toBe(css2Path);
    });

    test('should handle empty CSS file', async () => {
      const cssPath = path.join(tmpdir, 'empty.css');
      await fs.writeFile(cssPath, '');

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      expect(manifest.assets.size).toBe(0);
      expect(manifest.cssSourceFiles).toEqual([cssPath]);
    });

    test('should handle CSS with only comments (no url references)', async () => {
      const cssPath = path.join(tmpdir, 'comments.css');
      // CSS with comments but no url() references
      await fs.writeFile(cssPath, '/* This is a comment */\n/* Another comment */');

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      // No URLs to extract
      expect(manifest.assets.size).toBe(0);
    });

    test('should handle relative paths with parent directory traversal', async () => {
      const subDir = path.join(tmpdir, 'styles');
      const cssPath = path.join(subDir, 'main.css');
      const imgPath = path.join(tmpdir, 'shared.png'); // In parent directory

      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(cssPath, '.bg { background: url("../shared.png"); }');
      await fs.writeFile(imgPath, Buffer.alloc(100));

      const manifest = await Effect.runPromise(
        collectAssets(createMinimalConfig(), [cssPath], tmpdir, defaultOptions)
      );

      expect(manifest.assets.has(imgPath)).toBe(true);
    });
  });

  // IMP3: Asset filename collision detection tests
  describe('filename collision detection (IMP3)', () => {
    describe('generateUniqueOutputPath', () => {
      test('should return simple path when no collision', () => {
        const tracker = createOutputPathTracker();
        const result = generateUniqueOutputPath('/project/images/hero.png', tracker);

        expect(result).toBe('assets/hero.png');
        expect(tracker.collisions).toHaveLength(0);
      });

      test('should return same path for same source (idempotent)', () => {
        const tracker = createOutputPathTracker();
        const sourcePath = '/project/images/hero.png';

        const result1 = generateUniqueOutputPath(sourcePath, tracker);
        const result2 = generateUniqueOutputPath(sourcePath, tracker);

        expect(result1).toBe('assets/hero.png');
        expect(result2).toBe('assets/hero.png');
        expect(tracker.collisions).toHaveLength(0);
      });

      test('should add hash suffix when collision detected', () => {
        const tracker = createOutputPathTracker();

        // First file claims the name
        const result1 = generateUniqueOutputPath('/project/images/logo.png', tracker);
        // Second file with same name but different path
        const result2 = generateUniqueOutputPath('/project/icons/logo.png', tracker);

        expect(result1).toBe('assets/logo.png');
        // Second should have hash suffix
        expect(result2).toMatch(/^assets\/logo-[a-f0-9]{8}\.png$/);
        expect(result2).not.toBe(result1);
        expect(tracker.collisions).toHaveLength(1);
      });

      test('should track collision details', () => {
        const tracker = createOutputPathTracker();

        generateUniqueOutputPath('/project/images/logo.png', tracker);
        generateUniqueOutputPath('/project/icons/logo.png', tracker);

        expect(tracker.collisions).toHaveLength(1);
        expect(tracker.collisions[0].fileName).toBe('logo.png');
        expect(tracker.collisions[0].source1).toBe('/project/images/logo.png');
        expect(tracker.collisions[0].source2).toBe('/project/icons/logo.png');
        expect(tracker.collisions[0].resolvedPath).toMatch(/^assets\/logo-[a-f0-9]{8}\.png$/);
      });

      test('should handle multiple collisions for same filename', () => {
        const tracker = createOutputPathTracker();

        const result1 = generateUniqueOutputPath('/a/logo.png', tracker);
        const result2 = generateUniqueOutputPath('/b/logo.png', tracker);
        const result3 = generateUniqueOutputPath('/c/logo.png', tracker);

        expect(result1).toBe('assets/logo.png');
        expect(result2).toMatch(/^assets\/logo-[a-f0-9]{8}\.png$/);
        expect(result3).toMatch(/^assets\/logo-[a-f0-9]{8}\.png$/);
        // All three should be different
        expect(new Set([result1, result2, result3]).size).toBe(3);
        expect(tracker.collisions).toHaveLength(2);
      });

      test('should handle files with same name in different subdirectories', () => {
        const tracker = createOutputPathTracker();

        const result1 = generateUniqueOutputPath('/project/a/b/c/image.jpg', tracker);
        const result2 = generateUniqueOutputPath('/project/x/y/z/image.jpg', tracker);

        expect(result1).toBe('assets/image.jpg');
        expect(result2).toMatch(/^assets\/image-[a-f0-9]{8}\.jpg$/);
      });

      test('should handle files with no extension', () => {
        const tracker = createOutputPathTracker();

        const result1 = generateUniqueOutputPath('/project/a/README', tracker);
        const result2 = generateUniqueOutputPath('/project/b/README', tracker);

        expect(result1).toBe('assets/README');
        expect(result2).toMatch(/^assets\/README-[a-f0-9]{8}$/);
      });
    });

    describe('collectAssets with collisions', () => {
      test('should detect collision when two CSS files reference same-named different files', async () => {
        // Create directory structure
        const subDir1 = path.join(tmpdir, 'theme1');
        const subDir2 = path.join(tmpdir, 'theme2');
        await fs.mkdir(subDir1, { recursive: true });
        await fs.mkdir(subDir2, { recursive: true });

        // CSS files in subdirectories
        const css1Path = path.join(subDir1, 'styles.css');
        const css2Path = path.join(subDir2, 'styles.css');

        // Same filename in both directories but different content
        const img1Path = path.join(subDir1, 'logo.png');
        const img2Path = path.join(subDir2, 'logo.png');

        await fs.writeFile(css1Path, '.logo { background: url("./logo.png"); }');
        await fs.writeFile(css2Path, '.logo { background: url("./logo.png"); }');
        await fs.writeFile(img1Path, Buffer.alloc(100, 'A')); // Different content
        await fs.writeFile(img2Path, Buffer.alloc(100, 'B')); // Different content

        const manifest = await Effect.runPromise(
          collectAssets(createMinimalConfig(), [css1Path, css2Path], tmpdir, defaultOptions)
        );

        // Both assets should be collected
        expect(manifest.assets.size).toBe(2);

        // Get output paths
        const asset1 = manifest.assets.get(img1Path)!;
        const asset2 = manifest.assets.get(img2Path)!;

        // First one gets simple name, second gets hash
        expect(asset1.outputPath).toBe('assets/logo.png');
        expect(asset2.outputPath).toMatch(/^assets\/logo-[a-f0-9]{8}\.png$/);
        expect(asset1.outputPath).not.toBe(asset2.outputPath);
      });

      test('should not detect collision when same file referenced from multiple CSS', async () => {
        // Single image file
        const imgDir = path.join(tmpdir, 'images');
        await fs.mkdir(imgDir, { recursive: true });
        const imgPath = path.join(imgDir, 'shared.png');
        await fs.writeFile(imgPath, Buffer.alloc(100));

        // Two CSS files referencing the same image
        const css1Path = path.join(tmpdir, 'main.css');
        const css2Path = path.join(tmpdir, 'theme.css');
        await fs.writeFile(css1Path, '.bg1 { background: url("./images/shared.png"); }');
        await fs.writeFile(css2Path, '.bg2 { background: url("./images/shared.png"); }');

        const manifest = await Effect.runPromise(
          collectAssets(createMinimalConfig(), [css1Path, css2Path], tmpdir, defaultOptions)
        );

        // Only one asset (deduplicated)
        expect(manifest.assets.size).toBe(1);

        const asset = manifest.assets.get(imgPath)!;
        expect(asset.outputPath).toBe('assets/shared.png'); // No hash needed
        expect(asset.sources).toHaveLength(2); // Referenced by both CSS files
      });
    });
  });
});
