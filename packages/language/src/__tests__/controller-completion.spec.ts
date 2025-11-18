/**
 * Tests for Controller Autocomplete (Feature 035, User Story 3)
 *
 * Verifies that autocomplete works correctly for addController calls:
 * - Controller name suggestions at first parameter
 * - Label ID suggestions for LabelController's labelId parameter
 * - Parameter suggestions based on controller metadata
 *
 * Feature: 035-specialized-controller-syntax
 * User Story: US3
 * Task: T021
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { LabelGroupMetadata } from '../type-system-typir/utils/label-registry.js';
import type { TestContext } from './test-helpers.js';
import { createTestContext, minimalProgram, setupCSSRegistry } from './test-helpers.js';

describe('Controller Autocomplete (Feature 035, User Story 3)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: [],
      ids: ['header'],
    });
  });

  describe('Controller Name Autocomplete', () => {
    test('Autocomplete at addController( suggests controller names with quotes (NEW)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController(
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      // Find the position right after "addController(" (no quotes yet)
      const text = document.textDocument.getText();
      const addControllerIndex = text.indexOf('addController(');
      const cursorOffset = addControllerIndex + 'addController('.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      expect(completions).toBeDefined();
      expect(completions?.items).toBeDefined();

      // Should suggest all controller names
      const navController = completions!.items.find(item => item.label === 'NavigationController');
      expect(navController).toBeDefined();
      expect(navController?.kind).toBe(7); // CompletionItemKind.Class

      // insertText should include quotes
      expect(navController?.insertText).toBe('"NavigationController"');

      const labelController = completions!.items.find(item => item.label === 'LabelController');
      expect(labelController).toBeDefined();
      expect(labelController?.insertText).toBe('"LabelController"');
    });

    test('Autocomplete at addController("N") suggests controller names (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("N")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      // Find the position inside the string with "N" (after "N")
      const text = document.textDocument.getText();
      const addControllerIndex = text.indexOf('addController("N');
      const cursorOffset = addControllerIndex + 'addController("N'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      expect(completions).toBeDefined();
      expect(completions?.items).toBeDefined();

      // Should suggest NavigationController (matches "N" prefix)
      const navController = completions!.items.find(item => item.label === 'NavigationController');
      expect(navController).toBeDefined();
      expect(navController?.kind).toBe(7); // CompletionItemKind.Class
    });

    test('Controller suggestions include descriptions (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      const text = document.textDocument.getText();
      const addControllerIndex = text.indexOf('addController("');
      const cursorOffset = addControllerIndex + 'addController("'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      expect(completions).toBeDefined();

      // Verify NavigationController has description
      const navController = completions!.items.find(item => item.label === 'NavigationController');
      expect(navController?.documentation).toBeDefined();
      expect(navController?.documentation).toContain('Navigation');
    });

    test('Partial controller name filters suggestions (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("Label")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      const text = document.textDocument.getText();
      const labelIndex = text.indexOf('"Label"');
      const cursorOffset = labelIndex + '"Label'.length; // Cursor after "Label"

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      expect(completions).toBeDefined();

      // Server returns ALL controllers - client (VS Code) does the filtering
      // Just verify that LabelController is present
      const labelController = completions!.items.find(item => item.label === 'LabelController');
      expect(labelController).toBeDefined();

      // NavigationController will also be present (server returns all, client filters)
      const navController = completions!.items.find(item => item.label === 'NavigationController');
      expect(navController).toBeDefined();
    });
  });

  describe('Label ID Autocomplete (LabelController)', () => {
    const mockLabels: LabelGroupMetadata[] = [
      { id: 'welcome.title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
      { id: 'welcome.subtitle', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
      { id: 'button.submit', translationCount: 1, languageCodes: ['en-US'] },
    ];

    test('Autocomplete at second parameter suggests label IDs (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      // Parse and setup labels
      const document = await ctx.parse(code);
      const documentUri = document.uri.toString();

      const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
      labelRegistry.registerImports(documentUri, 'file:///labels.json');

      const text = document.textDocument.getText();
      const labelParamIndex = text.indexOf('"LabelController", "');
      const cursorOffset = labelParamIndex + '"LabelController", "'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      expect(completions).toBeDefined();
      expect(completions?.items).toBeDefined();

      // Should suggest all 3 label IDs
      const welcomeTitle = completions!.items.find(item => item.label === 'welcome.title');
      expect(welcomeTitle).toBeDefined();

      const welcomeSubtitle = completions!.items.find(item => item.label === 'welcome.subtitle');
      expect(welcomeSubtitle).toBeDefined();

      const buttonSubmit = completions!.items.find(item => item.label === 'button.submit');
      expect(buttonSubmit).toBeDefined();
    });

    test('Label ID suggestions include metadata (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      const documentUri = document.uri.toString();

      const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
      labelRegistry.registerImports(documentUri, 'file:///labels.json');

      const text = document.textDocument.getText();
      const labelParamIndex = text.indexOf('"LabelController", "');
      const cursorOffset = labelParamIndex + '"LabelController", "'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      const welcomeTitle = completions!.items.find(item => item.label === 'welcome.title');
      expect(welcomeTitle?.documentation).toBeDefined();
      expect(welcomeTitle?.documentation).toContain('Translations:** 2');
      expect(welcomeTitle?.documentation).toContain('en-US, nl-NL');
    });

    test('No label suggestions if no labels imported (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      // Do NOT setup labels

      const text = document.textDocument.getText();
      const labelParamIndex = text.indexOf('"LabelController", "');
      const cursorOffset = labelParamIndex + '"LabelController", "'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      // Should return empty or only generic suggestions (no label IDs)
      expect(completions).toBeDefined();

      const labelSuggestions = completions!.items.filter(
        item => item.label.includes('welcome') || item.label.includes('button')
      );
      expect(labelSuggestions).toHaveLength(0);
    });

    test('Partial label ID filters suggestions (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "welcome")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      const documentUri = document.uri.toString();

      const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
      labelRegistry.registerImports(documentUri, 'file:///labels.json');

      const text = document.textDocument.getText();
      const welcomeIndex = text.indexOf('"welcome"');
      const cursorOffset = welcomeIndex + '"welcome'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      expect(completions).toBeDefined();

      // Server returns ALL label IDs - client (VS Code) does the filtering
      // Just verify that welcome.* labels are present
      const welcomeTitle = completions!.items.find(item => item.label === 'welcome.title');
      expect(welcomeTitle).toBeDefined();

      const welcomeSubtitle = completions!.items.find(item => item.label === 'welcome.subtitle');
      expect(welcomeSubtitle).toBeDefined();

      // button.submit will also be present (server returns all, client filters)
      const buttonSubmit = completions!.items.find(item => item.label === 'button.submit');
      expect(buttonSubmit).toBeDefined();
    });
  });

  describe('Parameter Autocomplete (Other Controllers)', () => {
    test('No suggestions for NavigationController JSON parameter (T021)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("NavigationController", {})
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      const text = document.textDocument.getText();
      const jsonParamIndex = text.indexOf('NavigationController", {');
      const cursorOffset = jsonParamIndex + 'NavigationController", {'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(cursorOffset);

      const completions = await ctx.services.Eligian.lsp.CompletionProvider?.getCompletion(
        document,
        {
          textDocument: { uri: document.uri.toString() },
          position,
        }
      );

      // JSON parameters don't have autocomplete (complex structure)
      // Should return empty or only generic language suggestions
      expect(completions).toBeDefined();

      // Should NOT suggest any controller-specific items
      const controllerSuggestions = completions!.items.filter(
        item =>
          item.label.includes('Controller') ||
          item.label.includes('pages') ||
          item.label.includes('label')
      );
      expect(controllerSuggestions).toHaveLength(0);
    });
  });
});
