/**
 * Unit tests for import validation rules
 *
 * Tests verify that Typir validation rules correctly detect:
 * - Duplicate default imports (layout/styles/provider)
 * - Asset type mismatches (file extension vs explicit type)
 *
 * Test Coverage:
 * - T019-1: Duplicate default import detection (layout/styles/provider)
 * - T019-2: Asset type mismatch warnings (explicit 'as' vs inferred)
 */

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, it } from 'vitest';
import { createEligianServices } from '../../../eligian-module.js';
import type { Program } from '../../../generated/ast.js';

describe('Import Validation Rules (Unit)', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

  async function parseAndValidate(code: string) {
    const document = await parse(code);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    return {
      diagnostics: document.diagnostics ?? [],
      errors: document.diagnostics?.filter(d => d.severity === 1) ?? [],
      warnings: document.diagnostics?.filter(d => d.severity === 2) ?? [],
    };
  }

  /**
   * Helper to create a minimal valid program with import statements
   * Includes required timeline to satisfy program validation
   */
  function programWithImports(imports: string): string {
    return `
      ${imports}
      action init() [ selectElement("#app") ]
      timeline "test" in "#app" using raf {
        at 0s init()
      }
    `;
  }

  describe('T019-1: Duplicate default import detection', () => {
    it('should detect duplicate layout imports', async () => {
      const code = programWithImports(`
        layout './layout1.html'
        layout './layout2.html'
      `);
      const { errors } = await parseAndValidate(code);

      const duplicateErrors = errors.filter(e => e.message.includes("Duplicate 'layout'"));
      expect(duplicateErrors.length).toBeGreaterThan(0);
    });

    it('should detect duplicate styles imports', async () => {
      const code = programWithImports(`
        styles './styles1.css'
        styles './styles2.css'
      `);
      const { errors } = await parseAndValidate(code);

      const duplicateErrors = errors.filter(e => e.message.includes("Duplicate 'styles'"));
      expect(duplicateErrors.length).toBeGreaterThan(0);
    });

    it('should detect duplicate provider imports', async () => {
      const code = programWithImports(`
        provider './video1.mp4'
        provider './video2.mp4'
      `);
      const { errors } = await parseAndValidate(code);

      const duplicateErrors = errors.filter(e => e.message.includes("Duplicate 'provider'"));
      expect(duplicateErrors.length).toBeGreaterThan(0);
    });

    it('should allow single default import of each type', async () => {
      const code = programWithImports(`
        layout './layout.html'
        styles './styles.css'
        provider './video.mp4'
      `);
      const { errors } = await parseAndValidate(code);

      // Filter to only duplicate-related errors
      const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
      expect(duplicateErrors.length).toBe(0);
    });

    it('should allow multiple named imports', async () => {
      const code = programWithImports(`
        import video1 from './intro.mp4'
        import video2 from './outro.mp4'
        import css1 from './theme.css'
        import css2 from './override.css'
      `);
      const { errors } = await parseAndValidate(code);

      // Named imports should not produce duplicate errors
      const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
      expect(duplicateErrors.length).toBe(0);
    });
  });

  describe('T019-2: Asset type mismatch warnings', () => {
    // Note: Identifier names like 'video' and 'styles' are reserved keywords,
    // so we use 'videoFile', 'cssFile', etc. to avoid conflicts.

    it('should warn when media file imported as html', async () => {
      const code = programWithImports(`
        import videoFile from './intro.mp4' as html
      `);
      const { warnings } = await parseAndValidate(code);

      const mismatchWarnings = warnings.filter(
        w => w.message.includes('conflicts with inferred type') && w.message.includes('media')
      );
      expect(mismatchWarnings.length).toBeGreaterThan(0);
    });

    it('should warn when css file imported as media', async () => {
      const code = programWithImports(`
        import cssFile from './theme.css' as media
      `);
      const { warnings } = await parseAndValidate(code);

      const mismatchWarnings = warnings.filter(
        w => w.message.includes('conflicts with inferred type') && w.message.includes('css')
      );
      expect(mismatchWarnings.length).toBeGreaterThan(0);
    });

    it('should warn when html file imported as css', async () => {
      const code = programWithImports(`
        import htmlFile from './layout.html' as css
      `);
      const { warnings } = await parseAndValidate(code);

      const mismatchWarnings = warnings.filter(
        w => w.message.includes('conflicts with inferred type') && w.message.includes('html')
      );
      expect(mismatchWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn when types match - media as media', async () => {
      const code = programWithImports(`
        import videoFile from './intro.mp4' as media
      `);
      const { warnings } = await parseAndValidate(code);

      // No mismatch warnings should appear
      const mismatchWarnings = warnings.filter(w => w.message.includes('conflicts with inferred'));
      expect(mismatchWarnings.length).toBe(0);
    });

    it('should not warn when types match - css as css', async () => {
      const code = programWithImports(`
        import cssFile from './theme.css' as css
      `);
      const { warnings } = await parseAndValidate(code);

      const mismatchWarnings = warnings.filter(w => w.message.includes('conflicts with inferred'));
      expect(mismatchWarnings.length).toBe(0);
    });

    it('should not warn when types match - html as html', async () => {
      const code = programWithImports(`
        import htmlFile from './layout.html' as html
      `);
      const { warnings } = await parseAndValidate(code);

      const mismatchWarnings = warnings.filter(w => w.message.includes('conflicts with inferred'));
      expect(mismatchWarnings.length).toBe(0);
    });

    it('should not warn when no explicit type provided', async () => {
      const code = programWithImports(`
        import videoFile from './intro.mp4'
        import cssFile from './theme.css'
        import htmlFile from './layout.html'
      `);
      const { warnings } = await parseAndValidate(code);

      // No mismatch warnings when no explicit 'as' clause
      const mismatchWarnings = warnings.filter(w => w.message.includes('conflicts with inferred'));
      expect(mismatchWarnings.length).toBe(0);
    });
  });

  describe('T019-3: Edge cases', () => {
    it('should handle duplicate labels imports', async () => {
      const code = programWithImports(`
        labels './labels1.json'
        labels './labels2.json'
      `);
      const { errors } = await parseAndValidate(code);

      const duplicateErrors = errors.filter(e => e.message.includes("Duplicate 'labels'"));
      expect(duplicateErrors.length).toBeGreaterThan(0);
    });

    it('should allow mix of default and named imports without duplicates', async () => {
      const code = programWithImports(`
        layout './layout.html'
        styles './styles.css'
        import videoFile from './intro.mp4' as media
        import anotherVideo from './outro.mp4'
      `);
      const { errors } = await parseAndValidate(code);

      const duplicateErrors = errors.filter(e => e.message.includes('Duplicate'));
      expect(duplicateErrors.length).toBe(0);
    });

    it('should handle unknown file extension gracefully', async () => {
      // Unknown extensions default to 'html' in inferAssetTypeFromExtension
      const code = programWithImports(`
        import data from './data.xyz' as html
      `);
      const { warnings } = await parseAndValidate(code);

      // Should not warn because unknown extensions infer as 'html'
      const mismatchWarnings = warnings.filter(w => w.message.includes('conflicts with inferred'));
      expect(mismatchWarnings.length).toBe(0);
    });
  });
});
