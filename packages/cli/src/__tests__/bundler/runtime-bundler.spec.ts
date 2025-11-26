/**
 * Runtime Bundler Tests
 *
 * Tests for the runtime-bundler module that bundles Eligius runtime
 * with embedded configuration into a browser-compatible JavaScript file.
 *
 * Uses OS temp directory for test isolation per Vitest best practices:
 * @see https://sdorra.dev/posts/2024-02-12-vitest-tmpdir
 */

import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  bundleRuntime,
  extractUsedOperations,
  extractUsedProviders,
  generateEntryPoint,
} from '../../bundler/runtime-bundler.js';
import type { RuntimeBundleConfig, TimelineProviderType } from '../../bundler/types.js';

/**
 * ES Module equivalent of __dirname
 * Uses fileURLToPath(import.meta.url) pattern for ES modules
 * @see https://nodejs.org/api/esm.html#importmetaurl
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates a unique temporary directory for test isolation
 */
async function createTempDir(): Promise<string> {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, 'eligian-runtime-bundler-test-');
  return await fs.mkdtemp(tmpdir);
}

/**
 * Find node_modules paths for esbuild to resolve 'eligius' and 'jquery'
 * Walks up from current file to find monorepo's node_modules
 *
 * Uses ES module-compatible path resolution via import.meta.url
 * @see https://nodejs.org/api/esm.html#importmetaurl
 */
function getNodeModulesPaths(): string[] {
  // Start from the test file's directory and walk up to find node_modules
  // __dirname is derived from import.meta.url for ES module compatibility
  let currentDir = path.resolve(__dirname, '..', '..', '..', '..'); // packages/cli
  const paths: string[] = [];

  // Walk up to find node_modules directories
  while (true) {
    const nodeModulesPath = path.join(currentDir, 'node_modules');
    try {
      // Check if directory exists (sync for simplicity in test helper)
      const stat = fsSync.statSync(nodeModulesPath);
      if (stat.isDirectory()) {
        paths.push(nodeModulesPath);
      }
    } catch {
      // Ignore if doesn't exist
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached root
    }
    currentDir = parentDir;
  }

  return paths;
}

/**
 * Minimal Eligius configuration for testing
 */
function createMinimalConfig() {
  return {
    containerSelector: '#presentation',
    initActions: [],
    actions: [],
    timelines: [
      {
        uri: 'main',
        timelineActions: [
          {
            startTime: 0,
            endTime: 5000,
            startOperations: [
              {
                systemName: 'selectElement',
                operationData: { selector: '#slide1' },
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Configuration with multiple operations
 */
function createConfigWithOperations() {
  return {
    containerSelector: '#app',
    initActions: [
      {
        name: 'setup',
        startOperations: [
          { systemName: 'selectElement', operationData: { selector: '#container' } },
          { systemName: 'addClass', operationData: { className: 'initialized' } },
        ],
      },
    ],
    actions: [
      {
        name: 'fadeIn',
        startOperations: [
          { systemName: 'selectElement', operationData: { selector: '.item' } },
          { systemName: 'animate', operationData: { properties: { opacity: 1 }, duration: 500 } },
        ],
      },
    ],
    timelines: [
      {
        uri: 'main',
        timelineActions: [
          {
            startTime: 0,
            endTime: 3000,
            startOperations: [
              { systemName: 'requestAction', operationData: { name: 'fadeIn' } },
              { systemName: 'startAction', operationData: { name: 'fadeIn' } },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Configuration with video provider settings
 */
function createVideoProviderConfig() {
  return {
    containerSelector: '#video-player',
    timelineProviderSettings: {
      video: {
        selector: '#video-element',
      },
    },
    initActions: [],
    actions: [],
    timelines: [
      {
        uri: 'main',
        timelineActions: [],
      },
    ],
  };
}

/**
 * Configuration with lottie provider settings
 */
function createLottieProviderConfig() {
  return {
    containerSelector: '#lottie-container',
    timelineProviderSettings: {
      lottie: {
        path: './animation.json',
      },
    },
    initActions: [],
    actions: [],
    timelines: [],
  };
}

describe('Runtime Bundler (Feature 040, Phase 3)', () => {
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

  describe('extractUsedOperations', () => {
    test('should extract operations from initActions', () => {
      const config = createConfigWithOperations();
      const operations = extractUsedOperations(config);

      expect(operations).toContain('selectElement');
      expect(operations).toContain('addClass');
    });

    test('should extract operations from actions', () => {
      const config = createConfigWithOperations();
      const operations = extractUsedOperations(config);

      expect(operations).toContain('animate');
    });

    test('should extract operations from timeline eventActions', () => {
      const config = createMinimalConfig();
      const operations = extractUsedOperations(config);

      expect(operations).toContain('selectElement');
    });

    test('should deduplicate operations', () => {
      const config = createConfigWithOperations();
      const operations = extractUsedOperations(config);

      // selectElement appears multiple times in config but should be unique
      const selectElementCount = operations.filter(op => op === 'selectElement').length;
      expect(selectElementCount).toBe(1);
    });

    test('should return empty array for empty config', () => {
      const config = {
        containerSelector: '#app',
        initActions: [],
        actions: [],
        timelines: [],
      };
      const operations = extractUsedOperations(config);

      expect(operations).toEqual([]);
    });
  });

  describe('extractUsedProviders', () => {
    test('should detect video provider', () => {
      const config = createVideoProviderConfig();
      const providers = extractUsedProviders(config);

      expect(providers).toContain('video');
    });

    test('should detect lottie provider', () => {
      const config = createLottieProviderConfig();
      const providers = extractUsedProviders(config);

      expect(providers).toContain('lottie');
    });

    test('should return empty array when no provider settings', () => {
      const config = createMinimalConfig();
      const providers = extractUsedProviders(config);

      expect(providers).toEqual([]);
    });

    test('should detect multiple providers', () => {
      const config = {
        containerSelector: '#app',
        timelineProviderSettings: {
          video: { selector: '#video' },
          lottie: { path: './anim.json' },
        },
        initActions: [],
        actions: [],
        timelines: [],
      };
      const providers = extractUsedProviders(config);

      expect(providers).toContain('video');
      expect(providers).toContain('lottie');
    });
  });

  describe('generateEntryPoint', () => {
    test('should generate valid JavaScript entry point', () => {
      const config = createMinimalConfig();
      const operations = ['selectElement'];
      const providers: TimelineProviderType[] = [];

      const entryPoint = generateEntryPoint(config, operations, providers);

      expect(entryPoint).toContain('import');
      expect(entryPoint).toContain('eligius');
      expect(entryPoint).toContain('selectElement');
      expect(entryPoint).toContain('CONFIG');
      expect(entryPoint).toContain('#presentation');
    });

    test('should include video.js import for video provider', () => {
      const config = createVideoProviderConfig();
      const operations = ['selectElement'];
      const providers: TimelineProviderType[] = ['video'];

      const entryPoint = generateEntryPoint(config, operations, providers);

      expect(entryPoint).toContain('VideoTimelineProvider');
      expect(entryPoint).toContain('video.js');
    });

    test('should include lottie-web import for lottie provider', () => {
      const config = createLottieProviderConfig();
      const operations = [];
      const providers: TimelineProviderType[] = ['lottie'];

      const entryPoint = generateEntryPoint(config, operations, providers);

      expect(entryPoint).toContain('LottieTimelineProvider');
      expect(entryPoint).toContain('lottie-web');
    });

    test('should generate BundledResourceImporter class', () => {
      const config = createMinimalConfig();
      const operations = ['selectElement', 'addClass'];
      const providers: TimelineProviderType[] = [];

      const entryPoint = generateEntryPoint(config, operations, providers);

      expect(entryPoint).toContain('BundledResourceImporter');
      expect(entryPoint).toContain('import(name)');
    });

    test('should include DOMContentLoaded auto-init', () => {
      const config = createMinimalConfig();
      const operations = ['selectElement'];
      const providers: TimelineProviderType[] = [];

      const entryPoint = generateEntryPoint(config, operations, providers);

      expect(entryPoint).toContain('DOMContentLoaded');
      expect(entryPoint).toContain('init');
    });

    test('should export EligiusBundled to window', () => {
      const config = createMinimalConfig();
      const operations = [];
      const providers: TimelineProviderType[] = [];

      const entryPoint = generateEntryPoint(config, operations, providers);

      expect(entryPoint).toContain('window.EligiusBundled');
    });
  });

  // NOTE: bundleRuntime tests require 'eligius' and 'jquery' packages to be installed
  // These packages are available in the monorepo root dependencies
  describe('bundleRuntime (integration - requires eligius package)', () => {
    // Get node_modules paths once for all integration tests
    const nodePaths = getNodeModulesPaths();

    test('should bundle minimal config successfully', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: createMinimalConfig(),
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      // Should return JavaScript content
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should produce browser-compatible ESM format', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: createMinimalConfig(),
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      // ESM format should not have IIFE wrapper, uses modern ES module syntax
      // ESM bundles typically start with comments, imports, or variable declarations
      expect(result).not.toMatch(/^var\s+\w+\s*=\s*\(/); // No IIFE pattern
      // Should contain modern ES features used by esbuild ESM output
      expect(result.length).toBeGreaterThan(0);
    });

    test('should minify output when minify option is true', async () => {
      const config = createMinimalConfig();

      const unminifiedConfig: RuntimeBundleConfig = {
        eligiusConfig: config,
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const minifiedConfig: RuntimeBundleConfig = {
        eligiusConfig: config,
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: true,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const unminified = await Effect.runPromise(bundleRuntime(unminifiedConfig));
      const minified = await Effect.runPromise(bundleRuntime(minifiedConfig));

      // Minified should be smaller
      expect(minified.length).toBeLessThan(unminified.length);
    });

    test('should include inline source map when sourcemap option is true', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: createMinimalConfig(),
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: false,
        sourcemap: true,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      // Should contain inline source map
      expect(result).toContain('//# sourceMappingURL=data:');
    });

    test('should not include source map when sourcemap option is false', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: createMinimalConfig(),
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      // Should NOT contain source map
      expect(result).not.toContain('//# sourceMappingURL=');
    });

    test('should embed configuration as JSON', async () => {
      const config = createMinimalConfig();
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: config,
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      // Should contain the container selector from config
      expect(result).toContain('#presentation');
    });

    test('should handle config with multiple operations', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: createConfigWithOperations(),
        usedOperations: ['selectElement', 'addClass', 'animate', 'requestAction', 'startAction'],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    // Skip: VideoTimelineProvider is not currently exported from eligius package
    // This test will be enabled once eligius exports timeline providers
    test.skip('should handle video provider inclusion', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: createVideoProviderConfig(),
        usedOperations: [],
        usedProviders: ['video'],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      expect(result).toBeDefined();
      // Note: actual video.js bundling would increase bundle size significantly
    });

    test('should handle empty operations list', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: {
          containerSelector: '#app',
          initActions: [],
          actions: [],
          timelines: [],
        },
        usedOperations: [],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      const result = await Effect.runPromise(bundleRuntime(bundleConfig));

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    test('should clean up temporary files after bundling', async () => {
      const bundleConfig: RuntimeBundleConfig = {
        eligiusConfig: createMinimalConfig(),
        usedOperations: ['selectElement'],
        usedProviders: [],
        minify: false,
        sourcemap: false,
        tempDir: tmpdir,
        nodePaths,
      };

      await Effect.runPromise(bundleRuntime(bundleConfig));

      // Check that temp directory doesn't contain leftover entry point files
      const files = await fs.readdir(tmpdir);
      const entryFiles = files.filter(f => f.includes('entry'));
      expect(entryFiles.length).toBe(0);
    });
  });
});
