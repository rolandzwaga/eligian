/**
 * Integration tests for Typir-based import validation (User Story 1)
 *
 * Tests cover:
 * - Import type inference and hover display
 * - Duplicate default import detection
 * - Asset type mismatch warnings
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { EligianHoverProvider } from '../eligian-hover-provider.js';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

describe('US1: Import Statement Type Checking (Integration)', () => {
  let ctx: TestContext;
  let provider: EligianHoverProvider;

  // Expensive setup - runs once per suite
  beforeAll(() => {
    ctx = createTestContext();
    provider = new EligianHoverProvider(ctx.services.Eligian.css.CSSRegistry, ctx.services.Eligian);
  });

  /**
   * Helper to parse document and get hover at cursor position marked by |
   */
  async function getHoverAtCursor(code: string): Promise<Hover | undefined> {
    const cursorIndex = code.indexOf('|');
    if (cursorIndex === -1) {
      throw new Error('No cursor position marked with | in test code');
    }

    const cleanCode = code.replace('|', '');
    const document = await ctx.parse(cleanCode);

    // Build the document with validation to ensure Typir types are inferred
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const position = document.textDocument.positionAt(cursorIndex);

    const params: HoverParams = {
      textDocument: { uri: document.uri.toString() },
      position,
    };

    return provider.getHoverContent(document, params);
  }

  test('T013-1: Hover shows "Import<css>" for styles import', async () => {
    const code = `
      sty|les './main.css'

      timeline "test" in "#app" using raf {}
    `;

    const hover = await getHoverAtCursor(code);

    expect(hover).toBeDefined();
    expect(hover?.contents).toBeDefined();

    if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      expect(hover.contents.kind).toBe('markdown');
      const markdown = hover.contents.value;

      // Verify ImportType is displayed
      expect(markdown).toContain('Import<css>');
      expect(markdown).toContain('./main.css');
    }
  });

  test('T013-2: Error on duplicate layout imports', async () => {
    const code = `
      layout './layout1.html'
      layout './layout2.html'

      timeline "test" in "#app" using raf {}
    `;

    const document = await ctx.parse(code);

    // Manually trigger validation
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const validationErrors =
      document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];

    expect(validationErrors.length).toBeGreaterThan(0);
    expect(
      validationErrors.some(e => e.message.includes('Duplicate') && e.message.includes('layout'))
    ).toBe(true);
  });

  test('T013-3: Warning on type mismatch (import media as html)', async () => {
    const code = `
      import myVideo from './intro.mp4' as html

      timeline "test" in "#app" using raf {}
    `;

    const document = await ctx.parse(code);

    // Manually trigger validation
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const validationWarnings =
      document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Warning) ?? [];

    expect(validationWarnings.length).toBeGreaterThan(0);
    expect(
      validationWarnings.some(
        e =>
          e.message.includes('conflicts') &&
          e.message.includes('media') &&
          e.message.includes('html')
      )
    ).toBe(true);
  });

  test('T013-4: Hover shows "Import<html>" for explicit override', async () => {
    const code = `
      import data from './data.json' as h|tml

      timeline "test" in "#app" using raf {}
    `;

    const hover = await getHoverAtCursor(code);

    expect(hover).toBeDefined();
    if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      const markdown = hover.contents.value;

      // Verify ImportType shows explicit override type
      expect(markdown).toContain('Import<html>');
      expect(markdown).toContain('./data.json');
    }
  });

  test('T013-5: Named import type inference from extension', async () => {
    const code = `
      import mySt|yles from './theme.css'

      timeline "test" in "#app" using raf {}
    `;

    const hover = await getHoverAtCursor(code);

    expect(hover).toBeDefined();
    if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
      const markdown = hover.contents.value;

      // Verify ImportType inferred from file extension
      expect(markdown).toContain('Import<css>');
      expect(markdown).toContain('./theme.css');
    }
  });
});
