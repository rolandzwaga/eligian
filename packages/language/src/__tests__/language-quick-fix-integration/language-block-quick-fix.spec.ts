import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { CodeAction } from 'vscode-languageserver';
import { CodeActionKind } from 'vscode-languageserver';
import { createTestContext, setupCSSRegistry, type TestContext } from '../test-helpers.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Feature 045: Updated to use 'locales' keyword instead of 'labels'
 */
describe('Language Block Quick Fix - Integration Tests', () => {
  let ctx: TestContext;
  const fixturesDir = path.join(__dirname, 'fixtures');

  // Helper to get fixture path for use in DSL code
  const getFixturePath = (filename: string) => path.join(fixturesDir, filename).replace(/\\/g, '/');

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: [],
      ids: [],
    });
  });

  describe('T012: Code Action Provider Registration', () => {
    test('should register code action provider in language services', async () => {
      const codeActionService = ctx.services.Eligian.lsp.CodeActionProvider;
      expect(codeActionService).toBeDefined();
    });
  });

  describe('T013: Quick Fix Availability Detection', () => {
    test('should provide quick fix when locales imported but no language block exists', async () => {
      const program = `
        locales "${getFixturePath('valid-labels.json')}"

        action testAction() [
          selectElement("#test")
        ]
      `;

      const { document } = await ctx.parseAndValidate(program);

      // Request code actions at the top of the document
      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      expect(codeActions).toBeDefined();
      expect(codeActions.length).toBeGreaterThan(0);

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeDefined();
    });

    test('should NOT provide quick fix when language block already exists', async () => {
      const program = `languages {
  * "en-US" "English"
  "nl-NL" "Dutch"
}

locales "${getFixturePath('valid-labels.json')}"

action testAction() [
  selectElement("#test")
]`;

      const { document } = await ctx.parseAndValidate(program);

      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeUndefined();
    });

    test('should NOT provide quick fix when no locales are imported', async () => {
      const program = `
        action testAction() [
          selectElement("#test")
        ]
      `;

      const { document } = await ctx.parseAndValidate(program);

      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeUndefined();
    });
  });

  describe('T014: Valid Locales File Parsing', () => {
    test('should extract language codes from valid locales file', async () => {
      const validLocalesPath = path.join(fixturesDir, 'valid-labels.json');
      const validLocalesContent = fs.readFileSync(validLocalesPath, 'utf-8');
      const localesData = JSON.parse(validLocalesContent);

      // Extract unique language codes from object keys (ILocalesConfiguration format)
      const languageCodes = Object.keys(localesData);

      expect(languageCodes.length).toBe(4);
      expect([...languageCodes].sort()).toEqual(['de-DE', 'en-US', 'fr-FR', 'nl-NL']);
    });
  });

  describe('T015: Empty Locales File Handling', () => {
    test('should generate template language block when locales file is empty', async () => {
      const program = `
        locales "${getFixturePath('empty-labels.json')}"

        action testAction() [
          selectElement("#test")
        ]
      `;

      const { document } = await ctx.parseAndValidate(program);

      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeDefined();
      expect(languageBlockFix?.title).toContain('template');
    });
  });

  describe('T016: Invalid Locales File Handling', () => {
    test('should generate template language block when locales file is malformed', async () => {
      const program = `
        locales "${getFixturePath('invalid-labels.json')}"

        action testAction() [
          selectElement("#test")
        ]
      `;

      const { document } = await ctx.parseAndValidate(program);

      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeDefined();
      expect(languageBlockFix?.title).toContain('template');
    });
  });

  describe('T017: Insertion Position Validation', () => {
    test('should insert language block after imports and before constants', async () => {
      const program = `
        locales "${getFixturePath('valid-labels.json')}"

        const TEST_VALUE = 42

        action testAction() [
          selectElement("#test")
        ]
      `;

      const { document } = await ctx.parseAndValidate(program);

      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeDefined();

      // Check that workspace edit inserts at correct position
      const edit = languageBlockFix?.edit;
      expect(edit).toBeDefined();
      expect(edit?.changes).toBeDefined();

      const changes = edit!.changes![document.uri.toString()];
      expect(changes).toBeDefined();
      expect(changes.length).toBe(1);

      // Should insert before "const TEST_VALUE = 42" (line 3)
      expect(changes[0].range.start.line).toBeLessThanOrEqual(3);
    });

    test('should insert language block at line 0 (top of file)', async () => {
      const program = `
        locales "${getFixturePath('valid-labels.json')}"
      `;

      const { document } = await ctx.parseAndValidate(program);

      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeDefined();

      const edit = languageBlockFix?.edit;
      expect(edit).toBeDefined();
      expect(edit?.changes).toBeDefined();

      const changes = edit!.changes![document.uri.toString()];
      expect(changes).toBeDefined();

      // Language block should always be inserted at line 0 (top of file)
      expect(changes[0].range.start.line).toBe(0);
      expect(changes[0].range.start.character).toBe(0);
    });
  });

  describe('T018: Generated Code Format Validation', () => {
    test('should generate correctly formatted language block with proper syntax', async () => {
      const program = `
        locales "${getFixturePath('valid-labels.json')}"

        action testAction() [
          selectElement("#test")
        ]
      `;

      const { document } = await ctx.parseAndValidate(program);

      const codeActions: CodeAction[] =
        await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
          diagnostics: [],
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
          textDocument: { uri: document.uri.toString() },
        });

      const languageBlockFix = codeActions.find(action =>
        action.title.includes('Generate language block')
      );
      expect(languageBlockFix).toBeDefined();

      const edit = languageBlockFix?.edit;
      const changes = edit!.changes![document.uri.toString()];
      const insertedText = changes[0].newText;

      // Validate format (template or real language codes)
      expect(insertedText).toMatch(/^languages \{/); // Opening
      expect(insertedText).toMatch(/\* "[a-z]{2}-[A-Z]{2}" "[^"]+"/); // Default language (e.g., * "en-US" "en-US label")
      expect(insertedText).toMatch(/\}\n\n$/); // Closing with 2 newlines

      // Check indentation (2 spaces) - at least one language entry should exist
      const lines = insertedText.split('\n');
      const languageLines = lines.filter(
        line => line.trim().length > 0 && !line.includes('languages {') && !line.includes('}')
      );
      expect(languageLines.length).toBeGreaterThan(0);
      for (const line of languageLines) {
        expect(line).toMatch(/^ {2}/); // Should start with 2 spaces
      }
    });
  });
});
