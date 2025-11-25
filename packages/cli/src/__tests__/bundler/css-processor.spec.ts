/**
 * CSS Processor Tests
 *
 * Tests for the css-processor module that combines CSS files
 * and rewrites url() references to point to bundle asset paths.
 *
 * Includes test for FR-010: external URLs http/https preserved unchanged.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { processCSS, rewriteCSSUrls } from '../../bundler/css-processor.js';
import type { AssetEntry, AssetManifest } from '../../bundler/types.js';

/**
 * Creates a unique temporary directory for test isolation
 */
async function createTempDir(): Promise<string> {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, 'eligian-css-processor-test-');
  return await fs.mkdtemp(tmpdir);
}

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

describe('CSS Processor (Feature 040, Phase 4)', () => {
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

  describe('rewriteCSSUrls', () => {
    test('should rewrite relative url() to asset path', () => {
      const cssContent = '.hero { background: url("./images/hero.png"); }';
      // Use tmpdir-based paths for cross-platform compatibility
      const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
      const resolvedPath = path.join(tmpdir, 'styles', 'images', 'hero.png');

      const manifest = createTestManifest(
        new Map([
          [
            resolvedPath,
            createAssetEntry({
              sourcePath: resolvedPath,
              outputPath: 'assets/hero.png',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain("url('assets/hero.png')");
      expect(result).not.toContain('./images/hero.png');
    });

    test('should rewrite parent directory url() references', () => {
      const cssContent = '.bg { background: url("../images/bg.jpg"); }';
      const cssFilePath = path.join(tmpdir, 'styles', 'components', 'button.css');
      const resolvedPath = path.join(tmpdir, 'styles', 'images', 'bg.jpg');

      const manifest = createTestManifest(
        new Map([
          [
            resolvedPath,
            createAssetEntry({
              sourcePath: resolvedPath,
              outputPath: 'assets/bg.jpg',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain("url('assets/bg.jpg')");
    });

    test('should inline small images as data URI', () => {
      const cssContent = '.icon { background: url("./icon.png"); }';
      const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
      const resolvedPath = path.join(tmpdir, 'styles', 'icon.png');
      const dataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const manifest = createTestManifest(
        new Map([
          [
            resolvedPath,
            createAssetEntry({
              sourcePath: resolvedPath,
              outputPath: 'assets/icon.png',
              inline: true,
              dataUri,
            }),
          ],
        ])
      );

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain(`url('${dataUri}')`);
      expect(result).not.toContain('./icon.png');
    });

    test('should preserve external http:// URLs unchanged (FR-010)', () => {
      const cssContent = '.external { background: url("http://example.com/image.png"); }';
      const cssFilePath = '/project/styles/main.css';
      const manifest = createTestManifest();

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain('url("http://example.com/image.png")');
    });

    test('should preserve external https:// URLs unchanged (FR-010)', () => {
      const cssContent = '.external { background: url("https://cdn.example.com/image.png"); }';
      const cssFilePath = '/project/styles/main.css';
      const manifest = createTestManifest();

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain('url("https://cdn.example.com/image.png")');
    });

    test('should preserve data: URIs unchanged', () => {
      const dataUri = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E';
      const cssContent = `.icon { background: url("${dataUri}"); }`;
      const cssFilePath = '/project/styles/main.css';
      const manifest = createTestManifest();

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain(`url("${dataUri}")`);
    });

    test('should handle url() without quotes', () => {
      const cssContent = '.hero { background: url(./images/hero.png); }';
      const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
      const resolvedPath = path.join(tmpdir, 'styles', 'images', 'hero.png');

      const manifest = createTestManifest(
        new Map([
          [
            resolvedPath,
            createAssetEntry({
              sourcePath: resolvedPath,
              outputPath: 'assets/hero.png',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain("url('assets/hero.png')");
    });

    test('should handle url() with single quotes', () => {
      const cssContent = ".hero { background: url('./images/hero.png'); }";
      const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
      const resolvedPath = path.join(tmpdir, 'styles', 'images', 'hero.png');

      const manifest = createTestManifest(
        new Map([
          [
            resolvedPath,
            createAssetEntry({
              sourcePath: resolvedPath,
              outputPath: 'assets/hero.png',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain("url('assets/hero.png')");
    });

    test('should handle multiple url() in same declaration', () => {
      const cssContent = '.multi { background: url("./bg1.png"), url("./bg2.png"); }';
      const cssFilePath = path.join(tmpdir, 'styles', 'main.css');

      const manifest = createTestManifest(
        new Map([
          [
            path.join(tmpdir, 'styles', 'bg1.png'),
            createAssetEntry({
              sourcePath: path.join(tmpdir, 'styles', 'bg1.png'),
              outputPath: 'assets/bg1.png',
              inline: false,
            }),
          ],
          [
            path.join(tmpdir, 'styles', 'bg2.png'),
            createAssetEntry({
              sourcePath: path.join(tmpdir, 'styles', 'bg2.png'),
              outputPath: 'assets/bg2.png',
              inline: false,
            }),
          ],
        ])
      );

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain("url('assets/bg1.png')");
      expect(result).toContain("url('assets/bg2.png')");
    });

    test('should handle @font-face src url()', () => {
      const cssContent = `@font-face {
        font-family: 'CustomFont';
        src: url('./fonts/custom.woff2') format('woff2');
      }`;
      const cssFilePath = path.join(tmpdir, 'styles', 'fonts.css');
      const resolvedPath = path.join(tmpdir, 'styles', 'fonts', 'custom.woff2');

      const manifest = createTestManifest(
        new Map([
          [
            resolvedPath,
            createAssetEntry({
              sourcePath: resolvedPath,
              outputPath: 'assets/custom.woff2',
              inline: false,
              mimeType: 'font/woff2',
            }),
          ],
        ])
      );

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain("url('assets/custom.woff2')");
    });

    test('should return CSS unchanged when no url() present', () => {
      const cssContent = '.button { color: blue; padding: 10px; }';
      const cssFilePath = '/project/styles/main.css';
      const manifest = createTestManifest();

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toBe(cssContent);
    });

    test('should return empty string for empty CSS', () => {
      const cssContent = '';
      const cssFilePath = '/project/styles/main.css';
      const manifest = createTestManifest();

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toBe('');
    });

    test('should preserve CSS comments', () => {
      const cssContent = `/* Main styles */
.button { color: blue; }
/* End of main styles */`;
      const cssFilePath = '/project/styles/main.css';
      const manifest = createTestManifest();

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      expect(result).toContain('/* Main styles */');
      expect(result).toContain('/* End of main styles */');
    });

    test('should leave url() unchanged when asset not in manifest', () => {
      const cssContent = '.missing { background: url("./missing.png"); }';
      const cssFilePath = '/project/styles/main.css';
      const manifest = createTestManifest();

      const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

      // Should leave the original URL unchanged
      expect(result).toContain('url("./missing.png")');
    });

    // Phase 5: Image inlining threshold tests
    describe('image inlining with thresholds', () => {
      test('should inline image when marked as inline in manifest', () => {
        const cssContent = '.bg { background: url("./small.png"); }';
        const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
        const resolvedPath = path.join(tmpdir, 'styles', 'small.png');
        const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';

        const manifest = createTestManifest(
          new Map([
            [
              resolvedPath,
              createAssetEntry({
                sourcePath: resolvedPath,
                outputPath: 'assets/small.png',
                inline: true,
                dataUri,
                size: 100, // Small file
              }),
            ],
          ])
        );

        const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

        expect(result).toContain(`url('${dataUri}')`);
        expect(result).not.toContain('./small.png');
      });

      test('should use file path when image marked as not inline (over threshold)', () => {
        const cssContent = '.bg { background: url("./large.png"); }';
        const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
        const resolvedPath = path.join(tmpdir, 'styles', 'large.png');

        const manifest = createTestManifest(
          new Map([
            [
              resolvedPath,
              createAssetEntry({
                sourcePath: resolvedPath,
                outputPath: 'assets/large.png',
                inline: false, // Over threshold - not inlined
                size: 100000, // Large file
              }),
            ],
          ])
        );

        const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

        expect(result).toContain("url('assets/large.png')");
        expect(result).not.toContain('data:');
      });

      test('should handle mixed inline and non-inline images in same CSS', () => {
        const cssContent = `.small { background: url("./small.png"); }
.large { background: url("./large.png"); }`;
        const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
        const smallPath = path.join(tmpdir, 'styles', 'small.png');
        const largePath = path.join(tmpdir, 'styles', 'large.png');
        const dataUri = 'data:image/png;base64,smallImageData';

        const manifest = createTestManifest(
          new Map([
            [
              smallPath,
              createAssetEntry({
                sourcePath: smallPath,
                outputPath: 'assets/small.png',
                inline: true,
                dataUri,
                size: 100,
              }),
            ],
            [
              largePath,
              createAssetEntry({
                sourcePath: largePath,
                outputPath: 'assets/large.png',
                inline: false,
                size: 100000,
              }),
            ],
          ])
        );

        const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

        // Small image should be inlined
        expect(result).toContain(`url('${dataUri}')`);
        // Large image should use file path
        expect(result).toContain("url('assets/large.png')");
      });

      test('should not inline when inline=true but dataUri is missing', () => {
        const cssContent = '.bg { background: url("./image.png"); }';
        const cssFilePath = path.join(tmpdir, 'styles', 'main.css');
        const resolvedPath = path.join(tmpdir, 'styles', 'image.png');

        const manifest = createTestManifest(
          new Map([
            [
              resolvedPath,
              createAssetEntry({
                sourcePath: resolvedPath,
                outputPath: 'assets/image.png',
                inline: true, // Marked for inline
                dataUri: undefined, // But dataUri missing
                size: 100,
              }),
            ],
          ])
        );

        const result = rewriteCSSUrls(cssContent, cssFilePath, manifest);

        // Should fall back to file path when dataUri is missing
        expect(result).toContain("url('assets/image.png')");
        expect(result).not.toContain('data:');
      });
    });
  });

  describe('processCSS', () => {
    test('should combine multiple CSS files in order', async () => {
      // Create test CSS files
      const css1Path = path.join(tmpdir, 'main.css');
      const css2Path = path.join(tmpdir, 'theme.css');

      await fs.writeFile(css1Path, '.button { color: blue; }');
      await fs.writeFile(css2Path, '.button { color: red; }');

      const manifest = createTestManifest();
      const result = await Effect.runPromise(processCSS([css1Path, css2Path], manifest, tmpdir));

      // Both should be present, in order
      expect(result).toContain('.button { color: blue; }');
      expect(result).toContain('.button { color: red; }');
      // Order matters - theme.css should come after main.css
      const blueIndex = result.indexOf('color: blue');
      const redIndex = result.indexOf('color: red');
      expect(blueIndex).toBeLessThan(redIndex);
    });

    test('should add source comments for each CSS file', async () => {
      const css1Path = path.join(tmpdir, 'main.css');
      const css2Path = path.join(tmpdir, 'theme.css');

      await fs.writeFile(css1Path, '.button { color: blue; }');
      await fs.writeFile(css2Path, '.theme { background: white; }');

      const manifest = createTestManifest();
      const result = await Effect.runPromise(processCSS([css1Path, css2Path], manifest, tmpdir));

      expect(result).toContain('/* === Source: main.css === */');
      expect(result).toContain('/* === Source: theme.css === */');
    });

    test('should rewrite URLs in combined CSS', async () => {
      const cssPath = path.join(tmpdir, 'styles.css');
      const imgPath = path.join(tmpdir, 'hero.png');

      await fs.writeFile(cssPath, '.hero { background: url("./hero.png"); }');
      await fs.writeFile(imgPath, 'fake image content');

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

      const result = await Effect.runPromise(processCSS([cssPath], manifest, tmpdir));

      expect(result).toContain("url('assets/hero.png')");
    });

    test('should handle empty CSS file list', async () => {
      const manifest = createTestManifest();
      const result = await Effect.runPromise(processCSS([], manifest, tmpdir));

      expect(result).toBe('');
    });

    test('should handle single CSS file', async () => {
      const cssPath = path.join(tmpdir, 'single.css');
      await fs.writeFile(cssPath, '.single { display: block; }');

      const manifest = createTestManifest();
      const result = await Effect.runPromise(processCSS([cssPath], manifest, tmpdir));

      expect(result).toContain('.single { display: block; }');
    });

    test('should fail with CSSProcessError for missing file', async () => {
      const missingPath = path.join(tmpdir, 'nonexistent.css');
      const manifest = createTestManifest();

      const result = await Effect.runPromiseExit(processCSS([missingPath], manifest, tmpdir));

      expect(result._tag).toBe('Failure');
    });
  });
});
