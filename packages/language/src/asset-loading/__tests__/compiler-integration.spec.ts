/**
 * Tests for compiler integration module
 *
 * Verifies that the integration bridge correctly loads and validates assets
 * from Eligian program ASTs.
 */

import { unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import {
  createAssetValidationService,
  hasImports,
  loadProgramAssets,
} from '../compiler-integration.js';

// Get current file's directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __fixtures__ = resolve(__dirname, '../__fixtures__/assets');

describe('Compiler Integration', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  /**
   * Helper: Parse DSL code and return program AST
   */
  async function parseProgram(code: string) {
    const document = await parse(code);
    return document.parseResult.value as Program;
  }
  describe('createAssetValidationService', () => {
    it('should create a validation service with all validators', () => {
      const service = createAssetValidationService();

      expect(service).toBeDefined();
      expect(service.validateAsset).toBeDefined();
    });

    it('should create service that can validate HTML', () => {
      const service = createAssetValidationService();
      const htmlPath = resolve(__fixtures__, 'valid.html');
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const errors = service.validateAsset('html', htmlPath, sourcePath, './valid.html');

      expect(errors).toEqual([]);
    });

    it('should create service that can validate CSS', () => {
      const service = createAssetValidationService();
      const cssPath = resolve(__fixtures__, 'valid.css');
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const errors = service.validateAsset('css', cssPath, sourcePath, './valid.css');

      expect(errors).toEqual([]);
    });

    it('should create service that can validate media', () => {
      const service = createAssetValidationService();
      const mediaPath = resolve(__fixtures__, 'test-image.png');
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const errors = service.validateAsset('media', mediaPath, sourcePath, './test-image.png');

      expect(errors).toEqual([]);
    });
  });

  describe('hasImports', () => {
    it('should return false for program with no imports', async () => {
      const source = `
        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const result = hasImports(program);

      expect(result).toBe(false);
    });

    it('should return true for program with layout import', async () => {
      const source = `
        layout './layout.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const result = hasImports(program);

      expect(result).toBe(true);
    });

    it('should return true for program with styles import', async () => {
      const source = `
        styles './theme.css'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const result = hasImports(program);

      expect(result).toBe(true);
    });

    it('should return true for program with provider import', async () => {
      const source = `
        provider './video.mp4'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const result = hasImports(program);

      expect(result).toBe(true);
    });

    it('should return true for program with named import', async () => {
      const source = `
        import tooltip from './tooltip.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const result = hasImports(program);

      expect(result).toBe(true);
    });

    it('should return true for program with multiple imports', async () => {
      const source = `
        layout './layout.html'
        styles './theme.css'
        import tooltip from './tooltip.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const result = hasImports(program);

      expect(result).toBe(true);
    });
  });

  describe('loadProgramAssets', () => {
    it('should return empty result for program with no imports', async () => {
      const source = `
        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      expect(result).toEqual({
        layoutTemplate: undefined,
        cssFiles: [],
        importMap: {},
        errors: [],
      });
    });

    it('should load layout import and populate layoutTemplate', async () => {
      const source = `
        layout './valid.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should load the HTML content
      expect(result.layoutTemplate).toBeDefined();
      expect(result.layoutTemplate).toContain('<!DOCTYPE html>');
      expect(result.layoutTemplate).toContain('<title>Test Layout</title>');

      // Should populate importMap
      expect(result.importMap.layout).toBe(result.layoutTemplate);

      // Should not have errors
      expect(result.errors).toEqual([]);

      // Should not have CSS files
      expect(result.cssFiles).toEqual([]);
    });

    it('should load styles import and populate cssFiles', async () => {
      const source = `
        styles './valid.css'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // CSS paths should be relative
      expect(result.cssFiles).toEqual(['./valid.css']);

      // Should populate importMap with content
      expect(result.importMap.styles).toBeDefined();
      expect(result.importMap.styles).toContain('body {');

      // Should not have errors
      expect(result.errors).toEqual([]);

      // Should not have layout
      expect(result.layoutTemplate).toBeUndefined();
    });

    it('should load provider import and populate importMap', async () => {
      const source = `
        provider './test-video.mp4'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Provider path should be relative
      expect(result.importMap.provider).toBe('./test-video.mp4');

      // Should not have errors
      expect(result.errors).toEqual([]);

      // Should not have layout or CSS
      expect(result.layoutTemplate).toBeUndefined();
      expect(result.cssFiles).toEqual([]);
    });

    it('should load named HTML import and populate importMap', async () => {
      const source = `
        import tooltip from './valid.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should populate importMap with content
      expect(result.importMap.tooltip).toBeDefined();
      expect(result.importMap.tooltip).toContain('<!DOCTYPE html>');

      // Should not have errors
      expect(result.errors).toEqual([]);

      // Should not have layout (named imports don't populate layoutTemplate)
      expect(result.layoutTemplate).toBeUndefined();
    });

    it('should load named CSS import and populate both importMap and cssFiles', async () => {
      const source = `
        import theme from './valid.css'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should populate importMap with content
      expect(result.importMap.theme).toBeDefined();
      expect(result.importMap.theme).toContain('body {');

      // Should populate cssFiles with relative path
      expect(result.cssFiles).toEqual(['./valid.css']);

      // Should not have errors
      expect(result.errors).toEqual([]);
    });

    it('should load multiple imports correctly', async () => {
      const source = `
        layout './valid.html'
        styles './valid.css'
        import tooltip from './valid.html' as html

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Layout should be loaded
      expect(result.layoutTemplate).toBeDefined();
      expect(result.importMap.layout).toBe(result.layoutTemplate);

      // CSS should be loaded
      expect(result.cssFiles).toEqual(['./valid.css']);
      expect(result.importMap.styles).toBeDefined();

      // Named import should be loaded
      expect(result.importMap.tooltip).toBeDefined();

      // Should not have errors
      expect(result.errors).toEqual([]);
    });

    it('should report error for missing layout file', async () => {
      const source = `
        layout './missing.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should have error
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('missing-file');
      expect(result.errors[0].filePath).toBe('./missing.html');
      expect(result.errors[0].message).toContain('not found');

      // Should not populate layoutTemplate
      expect(result.layoutTemplate).toBeUndefined();
    });

    it('should report error for missing CSS file', async () => {
      const source = `
        styles './missing.css'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should have error
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('missing-file');
      expect(result.errors[0].filePath).toBe('./missing.css');

      // Should not populate cssFiles
      expect(result.cssFiles).toEqual([]);
    });

    it('should report error for missing provider file', async () => {
      const source = `
        provider './missing.mp4'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should have error
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('missing-file');
      expect(result.errors[0].filePath).toBe('./missing.mp4');

      // Should not populate importMap
      expect(result.importMap.provider).toBeUndefined();
    });

    it('should report error for missing named import file', async () => {
      const source = `
        import tooltip from './missing.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should have error
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('missing-file');
      expect(result.errors[0].filePath).toBe('./missing.html');

      // Should not populate importMap
      expect(result.importMap.tooltip).toBeUndefined();
    });

    it('should report error for invalid HTML', async () => {
      // Create temporary invalid HTML file
      const invalidHtmlPath = resolve(__fixtures__, 'invalid-temp.html');
      writeFileSync(invalidHtmlPath, 'Not HTML content at all', 'utf-8');

      try {
        const source = `
          layout './invalid-temp.html'

          timeline main {
            at 0s selectElement("#root")
          }
        `;

        const program = await parseProgram(source);
        const sourcePath = resolve(__fixtures__, 'test.eligian');

        const result = loadProgramAssets(program, sourcePath);

        // Should have error
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].type).toBe('invalid-html');
        expect(result.errors[0].message).toContain('validation error');

        // Should not populate layoutTemplate
        expect(result.layoutTemplate).toBeUndefined();
      } finally {
        // Clean up
        try {
          unlinkSync(invalidHtmlPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should use provided validation service', async () => {
      const source = `
        layout './valid.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      // Create custom service
      const service = createAssetValidationService();

      const result = loadProgramAssets(program, sourcePath, service);

      // Should work the same way
      expect(result.layoutTemplate).toBeDefined();
      expect(result.errors).toEqual([]);
    });

    it('should handle multiple errors from different imports', async () => {
      const source = `
        layout './missing-layout.html'
        styles './missing-styles.css'
        provider './missing-video.mp4'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Should have 3 errors
      expect(result.errors.length).toBe(3);

      // Check each error
      const layoutError = result.errors.find(e => e.filePath === './missing-layout.html');
      expect(layoutError).toBeDefined();
      expect(layoutError!.type).toBe('missing-file');

      const stylesError = result.errors.find(e => e.filePath === './missing-styles.css');
      expect(stylesError).toBeDefined();
      expect(stylesError!.type).toBe('missing-file');

      const providerError = result.errors.find(e => e.filePath === './missing-video.mp4');
      expect(providerError).toBeDefined();
      expect(providerError!.type).toBe('missing-file');
    });

    it('should include source location in errors', async () => {
      const source = `
        layout './missing.html'

        timeline main {
          at 0s selectElement("#root")
        }
      `;

      const program = await parseProgram(source);
      const sourcePath = resolve(__fixtures__, 'test.eligian');

      const result = loadProgramAssets(program, sourcePath);

      // Error should have source location
      expect(result.errors[0].sourceLocation).toBeDefined();
      expect(result.errors[0].sourceLocation.file).toBe(sourcePath);
      expect(result.errors[0].sourceLocation.line).toBeGreaterThanOrEqual(0);
      expect(result.errors[0].sourceLocation.column).toBeGreaterThanOrEqual(0);
    });
  });
});
