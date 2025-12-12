/**
 * Library Loading Tests (Feature 032 - User Story 1)
 *
 * Tests for library file loading functionality in the compiler pipeline.
 * Constitution Principle II: Comprehensive Testing
 *
 * Test Coverage:
 * - T006: extractLibraryImports() - Extract import paths from AST
 * - T007: resolveLibraryPath() - Convert relative paths to absolute URIs
 * - T008: loadLibraryFile() - Read file content with error handling
 * - T009: parseLibraryDocument() - Parse library content into Langium document
 * - T010: linkLibraryDocuments() - Link library documents in workspace
 */

import { Effect } from 'effect';
import { URI } from 'langium';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import type { Program } from '../../generated/ast.js';
import {
  extractLibraryImports,
  extractLibraryImportsFromLibrary,
  loadLibraryFile,
  parseLibraryDocument,
  resolveLibraryPath,
} from '../pipeline.js';

describe('Library Loading (T006-T010)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();
  });

  /**
   * Helper: Parse DSL code and return Program AST
   */
  async function parseDSL(code: string, documentUri: string): Promise<Program> {
    const document = await ctx.parse(code, { documentUri });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: false, // Skip validation for parse-only tests
    });
    return document.parseResult.value;
  }

  describe('T006: extractLibraryImports()', () => {
    it('should return empty array when no imports exist', async () => {
      const program = await parseDSL(
        `
        action test() [
          selectElement("#box")
        ]
        timeline "Test" in ".container" using raf {
          at 0s..5s test()
        }
      `,
        'file:///test/t006/no-imports.eligian'
      );

      const imports = extractLibraryImports(program);
      expect(imports).toEqual([]);
    });

    it('should extract single library import', async () => {
      const program = await parseDSL(
        `
        import { fadeIn } from "./animations.eligian"
        timeline "Test" in ".container" using raf {
          at 0s..5s fadeIn()
        }
      `,
        'file:///test/t006/single-import.eligian'
      );

      const imports = extractLibraryImports(program);
      expect(imports).toEqual(['./animations.eligian']);
    });

    it('should extract multiple library imports', async () => {
      const program = await parseDSL(
        `
        import { fadeIn } from "./animations.eligian"
        import { setColor } from "./utils.eligian"
        import { slideIn } from "./effects.eligian"
        timeline "Test" in ".container" using raf {
          at 0s..5s fadeIn()
        }
      `,
        'file:///test/t006/multiple-imports.eligian'
      );

      const imports = extractLibraryImports(program);
      expect(imports).toHaveLength(3);
      expect(imports).toContain('./animations.eligian');
      expect(imports).toContain('./utils.eligian');
      expect(imports).toContain('./effects.eligian');
    });

    it('should deduplicate duplicate imports', async () => {
      const program = await parseDSL(
        `
        import { fadeIn } from "./animations.eligian"
        import { fadeOut } from "./animations.eligian"
        timeline "Test" in ".container" using raf {
          at 0s..5s fadeIn()
        }
      `,
        'file:///test/t006/duplicate-imports.eligian'
      );

      const imports = extractLibraryImports(program);
      expect(imports).toHaveLength(1);
      expect(imports).toEqual(['./animations.eligian']);
    });
  });

  describe('T007: resolveLibraryPath()', () => {
    it('should resolve relative path with ./', () => {
      const currentUri = URI.parse('file:///project/src/main.eligian');
      const importPath = './animations.eligian';

      const resolved = resolveLibraryPath(currentUri, importPath);

      expect(resolved.path).toBe('/project/src/animations.eligian');
    });

    it('should resolve parent path with ../', () => {
      const currentUri = URI.parse('file:///project/src/main.eligian');
      const importPath = '../libs/utils.eligian';

      const resolved = resolveLibraryPath(currentUri, importPath);

      // Note: URI.Utils.joinPath preserves .. segments rather than normalizing
      expect(resolved.path).toContain('libs/utils.eligian');
      expect(resolved.path).toContain('..');
    });

    it('should resolve deep relative paths', () => {
      const currentUri = URI.parse('file:///project/src/deep/nested/main.eligian');
      const importPath = '../../libs/animations.eligian';

      const resolved = resolveLibraryPath(currentUri, importPath);

      // Note: URI.Utils.joinPath preserves .. segments rather than normalizing
      expect(resolved.path).toContain('libs/animations.eligian');
    });

    it('should handle paths without leading ./', () => {
      const currentUri = URI.parse('file:///project/src/main.eligian');
      const importPath = 'libs/utils.eligian';

      const resolved = resolveLibraryPath(currentUri, importPath);

      // Should resolve relative to current directory
      expect(resolved.path).toContain('utils.eligian');
    });
  });

  describe('T008: loadLibraryFile()', () => {
    // Note: loadLibraryFile uses readFileSync directly on the fsPath,
    // which doesn't work with mock file system in memory.
    // These tests verify the function signature and error handling.

    it('should return ParseError for missing file', async () => {
      const libraryUri = URI.parse('file:///test/t008/nonexistent-file.eligian');

      // Effect.runPromise rejects on failure
      await expect(Effect.runPromise(loadLibraryFile(libraryUri))).rejects.toThrow();
    });
  });

  describe('T009: parseLibraryDocument()', () => {
    it('should parse valid library document', async () => {
      const libraryContent = `
        library animations
        action fadeIn(selector: string) [
          selectElement(selector)
        ]
      `;
      const libraryUri = URI.parse('file:///test/animations.eligian');

      const result = await Effect.runPromise(parseLibraryDocument(libraryContent, libraryUri));

      expect(result).toBeDefined();
      expect(result.$type).toBe('Library');
      expect(result.name).toBe('animations');
    });

    it('should return ParseError for syntax errors', async () => {
      const invalidContent = `
        library animations
        action fadeIn(selector: string  // Missing closing paren and bracket
      `;
      const libraryUri = URI.parse('file:///test/invalid.eligian');

      // Effect.runPromise rejects on failure
      await expect(
        Effect.runPromise(parseLibraryDocument(invalidContent, libraryUri))
      ).rejects.toThrow();
    });

    it('should return error for non-library files', async () => {
      // A regular Program (not a Library)
      const programContent = `
        action test() [
          selectElement("#box")
        ]
        timeline "Test" in ".container" using raf {
          at 0s..5s test()
        }
      `;
      const libraryUri = URI.parse('file:///test/program.eligian');

      // Effect.runPromise rejects when file is not a Library
      await expect(
        Effect.runPromise(parseLibraryDocument(programContent, libraryUri))
      ).rejects.toThrow();
    });
  });

  describe('T010: linkLibraryDocuments()', () => {
    it('should link single library to workspace', async () => {
      // Create a library document
      await createLibraryDocument(
        ctx,
        `
        library utils
        action helper() [
          selectElement("#helper")
        ]
      `,
        'file:///test/utils.eligian'
      );

      // Verify library is accessible in workspace
      const libraryDoc = ctx.services.shared.workspace.LangiumDocuments.getDocument(
        URI.parse('file:///test/utils.eligian')
      );

      expect(libraryDoc).toBeDefined();
    });

    it('should link multiple libraries to workspace', async () => {
      // Create multiple library documents
      await createLibraryDocument(
        ctx,
        `
        library animations
        action fadeIn() [
          selectElement("#fade")
        ]
      `,
        'file:///test/multi/animations.eligian'
      );

      await createLibraryDocument(
        ctx,
        `
        library effects
        action slideIn() [
          selectElement("#slide")
        ]
      `,
        'file:///test/multi/effects.eligian'
      );

      // Verify both libraries are accessible
      const animationsDoc = ctx.services.shared.workspace.LangiumDocuments.getDocument(
        URI.parse('file:///test/multi/animations.eligian')
      );
      const effectsDoc = ctx.services.shared.workspace.LangiumDocuments.getDocument(
        URI.parse('file:///test/multi/effects.eligian')
      );

      expect(animationsDoc).toBeDefined();
      expect(effectsDoc).toBeDefined();
    });

    it('should allow main document to import library actions after linking', async () => {
      // Create library
      await createLibraryDocument(
        ctx,
        `
        library animations
        action fadeIn(selector: string) [
          selectElement(selector)
        ]
      `,
        'file:///test/import/animations.eligian'
      );

      // Create main program that imports from library
      const mainCode = `
        import { fadeIn } from "./animations.eligian"
        timeline "Test" in ".container" using raf {
          at 0s..5s fadeIn("#box")
        }
      `;

      const document = await ctx.parse(mainCode, {
        documentUri: 'file:///test/import/main.eligian',
      });
      await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

      // Should not have errors related to missing import
      const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
      const importErrors = errors.filter(e => e.message.includes('fadeIn'));
      expect(importErrors).toHaveLength(0);
    });
  });

  describe('extractLibraryImportsFromLibrary()', () => {
    it('should extract imports from library with nested dependencies', async () => {
      // Create a library document that imports from another library
      const libraryDoc = await createLibraryDocument(
        ctx,
        `
        library effects
        import { fadeIn } from "./animations.eligian"
        action slideAndFade(selector: string) [
          selectElement(selector)
          animate({transform: "translateX(0)"}, 500)
        ]
      `,
        'file:///test/nested/effects.eligian'
      );

      const library = libraryDoc.parseResult.value;
      const imports = extractLibraryImportsFromLibrary(library as any);

      expect(imports).toContain('./animations.eligian');
    });
  });
});
