/**
 * HTML Generator Tests
 *
 * Tests for the html-generator module that creates the index.html entry point
 * for standalone bundles.
 *
 * Includes tests for:
 * - FR-017: Minimal HTML wrapper when no layout template
 * - FR-018: Layout template HTML content inclusion
 */

import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  generateContainerElement,
  generateHTML,
  rewriteHTMLUrls,
} from '../../bundler/html-generator.js';
import type { AssetEntry, AssetManifest, HTMLGeneratorConfig } from '../../bundler/types.js';

/**
 * Create a minimal asset manifest for testing
 */
function createTestManifest(assets: Map<string, AssetEntry> = new Map()): AssetManifest {
  return {
    assets,
    combinedCSS: '',
    cssSourceFiles: [],
  };
}

/**
 * Create a test asset entry
 */
function createAssetEntry(overrides: Partial<AssetEntry> = {}): AssetEntry {
  return {
    originalRef: './image.png',
    sourcePath: '/test/images/image.png',
    outputPath: 'assets/image.png',
    size: 1024,
    inline: false,
    mimeType: 'image/png',
    sources: [],
    ...overrides,
  };
}

/**
 * Base path used for pure function path resolution tests.
 * rewriteHTMLUrls() is a pure function - it only uses path.dirname/path.resolve
 * to resolve relative asset paths. No actual file system access.
 *
 * We use path.resolve to get an absolute path that works on both Unix and Windows.
 * This ensures manifest keys match the resolved paths in the implementation.
 */
const TEST_BASE_DIR = path.resolve('/test-project');

describe('HTML Generator (Feature 040, Phase 2)', () => {
  describe('generateHTML', () => {
    test('should generate complete HTML document with all fields populated', () => {
      const config: HTMLGeneratorConfig = {
        title: 'My Presentation',
        css: '.slide { background: #fff; }',
        layoutTemplate: '<div class="slide">Content</div>',
        containerSelector: '#presentation',
        bundlePath: 'bundle.js',
      };

      const html = generateHTML(config);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<title>My Presentation</title>');
      expect(html).toContain('.slide { background: #fff; }');
      expect(html).toContain('<div class="slide">Content</div>');
      expect(html).toContain('id="presentation"');
      expect(html).toContain('<script type="module" src="bundle.js"></script>');
    });

    test('should generate minimal HTML wrapper when no layout template (FR-017)', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Minimal',
        css: '',
        layoutTemplate: '', // No layout template
        containerSelector: '#app',
        bundlePath: 'bundle.js',
      };

      const html = generateHTML(config);

      // Should still have valid structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Minimal</title>');
      expect(html).toContain('id="app"');
      // Container should be empty but present
      expect(html).toContain('<div id="app"></div>');
    });

    test('should include layout template HTML content in container (FR-018)', () => {
      const layoutHTML = `<header class="header">Header Content</header>
        <main class="content">
          <section id="slide1">Slide 1</section>
          <section id="slide2">Slide 2</section>
        </main>
        <footer class="footer">Footer</footer>`;

      const config: HTMLGeneratorConfig = {
        title: 'With Layout',
        css: '',
        layoutTemplate: layoutHTML,
        containerSelector: '#container',
        bundlePath: 'bundle.js',
      };

      const html = generateHTML(config);

      // Layout template should be inserted inside container
      expect(html).toContain('<header class="header">Header Content</header>');
      expect(html).toContain('<section id="slide1">Slide 1</section>');
      expect(html).toContain('<footer class="footer">Footer</footer>');
    });

    test('should handle empty CSS gracefully', () => {
      const config: HTMLGeneratorConfig = {
        title: 'No CSS',
        css: '',
        layoutTemplate: '<div>Content</div>',
        containerSelector: '#app',
      };

      const html = generateHTML(config);

      // Should have style tag even if empty
      expect(html).toContain('<style>');
      expect(html).toContain('</style>');
    });

    test('should use default bundle path when not specified', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Default Bundle',
        css: '',
        layoutTemplate: '',
        containerSelector: '#app',
        // bundlePath not specified - should default to 'bundle.js'
      };

      const html = generateHTML(config);
      expect(html).toContain('<script type="module" src="bundle.js"></script>');
    });

    test('should HTML-escape special characters in title', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Test <script>alert("xss")</script>',
        css: '',
        layoutTemplate: '',
        containerSelector: '#app',
      };

      const html = generateHTML(config);

      // Title should be escaped
      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });

    test('should include viewport meta tag for responsive design', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Responsive',
        css: '',
        layoutTemplate: '',
        containerSelector: '#app',
      };

      const html = generateHTML(config);
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('width=device-width');
    });

    test('should handle large CSS content', () => {
      const largeCSS = '.class { color: red; }\n'.repeat(1000);
      const config: HTMLGeneratorConfig = {
        title: 'Large CSS',
        css: largeCSS,
        layoutTemplate: '',
        containerSelector: '#app',
      };

      const html = generateHTML(config);
      expect(html).toContain('.class { color: red; }');
    });
  });

  describe('generateContainerElement', () => {
    test('should generate div with ID from selector "#container"', () => {
      const element = generateContainerElement('#container', '');
      expect(element).toContain('id="container"');
      expect(element).toMatch(/<div /);
    });

    test('should generate div with class from selector ".app"', () => {
      const element = generateContainerElement('.app', '');
      expect(element).toContain('class="app"');
    });

    test('should generate div with ID and classes from combined selector "#app.main.active"', () => {
      const element = generateContainerElement('#app.main.active', '');
      expect(element).toContain('id="app"');
      expect(element).toContain('class="main active"');
    });

    test('should include layout template content inside container', () => {
      const layout = '<div class="inner">Content</div>';
      const element = generateContainerElement('#container', layout);
      expect(element).toContain(layout);
    });

    test('should handle empty layout template', () => {
      const element = generateContainerElement('#container', '');
      expect(element).toBe('<div id="container"></div>');
    });
  });

  // IMP2: HTML URL rewriting tests
  // rewriteHTMLUrls() is a PURE FUNCTION - it only uses path.dirname/path.resolve
  // for relative path resolution. No actual file system access, so no temp dirs needed.
  describe('rewriteHTMLUrls (IMP2)', () => {
    // Use path.join for cross-platform path construction
    const htmlFilePath = path.join(TEST_BASE_DIR, 'layout.html');

    test('should rewrite img src to asset path', () => {
      const html = '<img src="./images/hero.png" alt="Hero">';
      const imgPath = path.join(TEST_BASE_DIR, 'images', 'hero.png');
      const manifest = createTestManifest(
        new Map([
          [
            imgPath,
            createAssetEntry({
              sourcePath: imgPath,
              outputPath: 'assets/hero.png',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="assets/hero.png"');
      expect(result).not.toContain('./images/hero.png');
    });

    test('should rewrite video src to asset path', () => {
      const html = '<video src="./media/intro.mp4"></video>';
      const videoPath = path.join(TEST_BASE_DIR, 'media', 'intro.mp4');
      const manifest = createTestManifest(
        new Map([
          [
            videoPath,
            createAssetEntry({
              sourcePath: videoPath,
              outputPath: 'assets/intro.mp4',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="assets/intro.mp4"');
    });

    test('should rewrite audio src to asset path', () => {
      const html = '<audio src="./media/sound.mp3"></audio>';
      const audioPath = path.join(TEST_BASE_DIR, 'media', 'sound.mp3');
      const manifest = createTestManifest(
        new Map([
          [
            audioPath,
            createAssetEntry({
              sourcePath: audioPath,
              outputPath: 'assets/sound.mp3',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="assets/sound.mp3"');
    });

    test('should rewrite source src to asset path', () => {
      const html = '<video><source src="./media/video.mp4" type="video/mp4"></video>';
      const videoPath = path.join(TEST_BASE_DIR, 'media', 'video.mp4');
      const manifest = createTestManifest(
        new Map([
          [
            videoPath,
            createAssetEntry({
              sourcePath: videoPath,
              outputPath: 'assets/video.mp4',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="assets/video.mp4"');
    });

    test('should rewrite video poster to asset path', () => {
      const html = '<video poster="./images/poster.jpg" src="./video.mp4"></video>';
      const posterPath = path.join(TEST_BASE_DIR, 'images', 'poster.jpg');
      const videoPath = path.join(TEST_BASE_DIR, 'video.mp4');
      const manifest = createTestManifest(
        new Map([
          [
            posterPath,
            createAssetEntry({
              sourcePath: posterPath,
              outputPath: 'assets/poster.jpg',
              inline: false,
            }),
          ],
          [
            videoPath,
            createAssetEntry({
              sourcePath: videoPath,
              outputPath: 'assets/video.mp4',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('poster="assets/poster.jpg"');
    });

    test('should rewrite srcset URLs to asset paths', () => {
      const html =
        '<img src="./images/hero.png" srcset="./images/hero-2x.png 2x, ./images/hero-3x.png 3x">';
      const heroPath = path.join(TEST_BASE_DIR, 'images', 'hero.png');
      const hero2xPath = path.join(TEST_BASE_DIR, 'images', 'hero-2x.png');
      const hero3xPath = path.join(TEST_BASE_DIR, 'images', 'hero-3x.png');
      const manifest = createTestManifest(
        new Map([
          [
            heroPath,
            createAssetEntry({
              sourcePath: heroPath,
              outputPath: 'assets/hero.png',
              inline: false,
            }),
          ],
          [
            hero2xPath,
            createAssetEntry({
              sourcePath: hero2xPath,
              outputPath: 'assets/hero-2x.png',
              inline: false,
            }),
          ],
          [
            hero3xPath,
            createAssetEntry({
              sourcePath: hero3xPath,
              outputPath: 'assets/hero-3x.png',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="assets/hero.png"');
      expect(result).toContain('assets/hero-2x.png 2x');
      expect(result).toContain('assets/hero-3x.png 3x');
    });

    test('should inline small images as data URI', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
      const html = '<img src="./images/icon.png" alt="Icon">';
      const iconPath = path.join(TEST_BASE_DIR, 'images', 'icon.png');
      const manifest = createTestManifest(
        new Map([
          [
            iconPath,
            createAssetEntry({
              sourcePath: iconPath,
              outputPath: 'assets/icon.png',
              inline: true,
              dataUri,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain(`src="${dataUri}"`);
      expect(result).not.toContain('./images/icon.png');
    });

    test('should preserve external http:// URLs unchanged', () => {
      const html = '<img src="http://example.com/image.png">';
      const manifest = createTestManifest();

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="http://example.com/image.png"');
    });

    test('should preserve external https:// URLs unchanged', () => {
      const html = '<img src="https://cdn.example.com/image.png">';
      const manifest = createTestManifest();

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="https://cdn.example.com/image.png"');
    });

    test('should preserve data: URIs unchanged', () => {
      const html = '<img src="data:image/png;base64,abc123">';
      const manifest = createTestManifest();

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="data:image/png;base64,abc123"');
    });

    test('should leave URLs unchanged when asset not in manifest', () => {
      const html = '<img src="./images/missing.png">';
      const manifest = createTestManifest();

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="./images/missing.png"');
    });

    test('should handle HTML with multiple asset references', () => {
      const html = `
        <header>
          <img src="./images/logo.png" alt="Logo">
        </header>
        <main>
          <img src="./images/hero.jpg" alt="Hero">
          <video poster="./images/poster.png">
            <source src="./media/video.mp4" type="video/mp4">
          </video>
        </main>
      `;
      const logoPath = path.join(TEST_BASE_DIR, 'images', 'logo.png');
      const heroPath = path.join(TEST_BASE_DIR, 'images', 'hero.jpg');
      const posterPath = path.join(TEST_BASE_DIR, 'images', 'poster.png');
      const videoPath = path.join(TEST_BASE_DIR, 'media', 'video.mp4');
      const manifest = createTestManifest(
        new Map([
          [
            logoPath,
            createAssetEntry({
              sourcePath: logoPath,
              outputPath: 'assets/logo.png',
              inline: false,
            }),
          ],
          [
            heroPath,
            createAssetEntry({
              sourcePath: heroPath,
              outputPath: 'assets/hero.jpg',
              inline: false,
            }),
          ],
          [
            posterPath,
            createAssetEntry({
              sourcePath: posterPath,
              outputPath: 'assets/poster.png',
              inline: false,
            }),
          ],
          [
            videoPath,
            createAssetEntry({
              sourcePath: videoPath,
              outputPath: 'assets/video.mp4',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toContain('src="assets/logo.png"');
      expect(result).toContain('src="assets/hero.jpg"');
      expect(result).toContain('poster="assets/poster.png"');
      expect(result).toContain('src="assets/video.mp4"');
    });

    test('should return HTML unchanged when no asset references', () => {
      const html = '<div class="container"><p>Hello World</p></div>';
      const manifest = createTestManifest();

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      expect(result).toBe(html);
    });

    test('should return empty string for empty HTML', () => {
      const result = rewriteHTMLUrls('', htmlFilePath, createTestManifest());

      expect(result).toBe('');
    });

    test('should handle single-quoted attributes', () => {
      const html = "<img src='./images/hero.png'>";
      const imgPath = path.join(TEST_BASE_DIR, 'images', 'hero.png');
      const manifest = createTestManifest(
        new Map([
          [
            imgPath,
            createAssetEntry({
              sourcePath: imgPath,
              outputPath: 'assets/hero.png',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      // Should rewrite and preserve quote style
      expect(result).toContain("src='assets/hero.png'");
    });

    test('should use file path when dataUri is missing for inline asset', () => {
      const html = '<img src="./images/icon.png">';
      const iconPath = path.join(TEST_BASE_DIR, 'images', 'icon.png');
      const manifest = createTestManifest(
        new Map([
          [
            iconPath,
            createAssetEntry({
              sourcePath: iconPath,
              outputPath: 'assets/icon.png',
              inline: true, // Marked for inline but dataUri missing
              dataUri: undefined,
            }),
          ],
        ])
      );

      const result = rewriteHTMLUrls(html, htmlFilePath, manifest);

      // Should fall back to file path
      expect(result).toContain('src="assets/icon.png"');
    });
  });
});
