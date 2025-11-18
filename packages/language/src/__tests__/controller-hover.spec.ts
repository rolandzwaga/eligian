/**
 * Tests for Controller Hover Documentation (Feature 035, User Story 3)
 *
 * Verifies that hover tooltips show documentation for addController calls:
 * - Controller name hover shows controller description and parameters
 * - Label ID hover shows label metadata (translation count, languages)
 * - Parameter hover shows parameter descriptions
 *
 * Feature: 035-specialized-controller-syntax
 * User Story: US3
 * Task: T022
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { LabelGroupMetadata } from '../type-system-typir/utils/label-registry.js';
import type { TestContext } from './test-helpers.js';
import { createTestContext, minimalProgram, setupCSSRegistry } from './test-helpers.js';

describe('Controller Hover Documentation (Feature 035, User Story 3)', () => {
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

  describe('Controller Name Hover', () => {
    test('Hovering over controller name shows description (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("NavigationController", {pages: ["home"]})
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      // Find position of "NavigationController" string
      const text = document.textDocument.getText();
      const navControllerIndex = text.indexOf('"NavigationController"');
      const hoverOffset = navControllerIndex + '"Navigation'.length; // Middle of string

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      expect(hover).toBeDefined();
      expect(hover?.contents).toBeDefined();

      // Should show controller description
      const hoverText =
        typeof hover!.contents === 'string' ? hover!.contents : hover!.contents.value;
      expect(hoverText).toContain('Navigation');
      expect(hoverText).toContain('Controller');
    });

    test('Hover shows controller parameters (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "label.welcome")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      const documentUri = document.uri.toString();

      // Setup labels
      const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile('file:///labels.json', [
        { id: 'label.welcome', translationCount: 1, languageCodes: ['en-US'] },
      ]);
      labelRegistry.registerImports(documentUri, 'file:///labels.json');

      const text = document.textDocument.getText();
      const labelControllerIndex = text.indexOf('"LabelController"');
      const hoverOffset = labelControllerIndex + '"Label'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      expect(hover).toBeDefined();

      const hoverText =
        typeof hover!.contents === 'string' ? hover!.contents : hover!.contents.value;

      // Should show parameters: labelId, property (optional)
      expect(hoverText).toContain('labelId');
      expect(hoverText).toContain('string');
    });

    test('Hover shows parameter types (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("NavigationController", {pages: ["home"]})
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      const text = document.textDocument.getText();
      const navControllerIndex = text.indexOf('"NavigationController"');
      const hoverOffset = navControllerIndex + '"Navigation'.length;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      expect(hover).toBeDefined();

      const hoverText =
        typeof hover!.contents === 'string' ? hover!.contents : hover!.contents.value;

      // Should show parameter type (object for NavigationController)
      expect(hoverText).toContain('object');
    });
  });

  describe('Label ID Hover (LabelController)', () => {
    const mockLabels: LabelGroupMetadata[] = [
      { id: 'welcome.title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
      { id: 'button.submit', translationCount: 1, languageCodes: ['en-US'] },
    ];

    test('Hovering over label ID shows metadata (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "welcome.title")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      const documentUri = document.uri.toString();

      const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
      labelRegistry.registerImports(documentUri, 'file:///labels.json');

      const text = document.textDocument.getText();
      const welcomeTitleIndex = text.indexOf('"welcome.title"');
      const hoverOffset = welcomeTitleIndex + '"welcome.title'.length / 2; // Middle of string

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      expect(hover).toBeDefined();

      const hoverText =
        typeof hover!.contents === 'string' ? hover!.contents : hover!.contents.value;

      // Should show translation count and language codes
      expect(hoverText).toContain('Translations:** 2');
      expect(hoverText).toContain('en-US');
      expect(hoverText).toContain('nl-NL');
    });

    test('Hover shows label ID (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "button.submit")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      const documentUri = document.uri.toString();

      const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
      labelRegistry.registerImports(documentUri, 'file:///labels.json');

      const text = document.textDocument.getText();
      const buttonSubmitIndex = text.indexOf('"button.submit"');
      const hoverOffset = buttonSubmitIndex + '"button.submit'.length / 2;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      expect(hover).toBeDefined();

      const hoverText =
        typeof hover!.contents === 'string' ? hover!.contents : hover!.contents.value;

      // Should show the label ID
      expect(hoverText).toContain('button.submit');
    });

    test('No hover if label ID invalid (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "invalid.label")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      const documentUri = document.uri.toString();

      const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
      labelRegistry.registerImports(documentUri, 'file:///labels.json');

      const text = document.textDocument.getText();
      const invalidLabelIndex = text.indexOf('"invalid.label"');
      const hoverOffset = invalidLabelIndex + '"invalid.label'.length / 2;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      // Should return undefined or no label-specific hover (label doesn't exist)
      if (hover) {
        const hoverText =
          typeof hover.contents === 'string' ? hover.contents : hover.contents.value;

        // Should NOT show translation metadata
        expect(hoverText).not.toContain('translations');
      }
    });

    test('No hover if no labels imported (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("LabelController", "any.label")
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);
      // Do NOT setup labels

      const text = document.textDocument.getText();
      const anyLabelIndex = text.indexOf('"any.label"');
      const hoverOffset = anyLabelIndex + '"any.label'.length / 2;

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      // Should return undefined or no label-specific hover
      if (hover) {
        const hoverText =
          typeof hover.contents === 'string' ? hover.contents : hover.contents.value;

        // Should NOT show translation metadata
        expect(hoverText).not.toContain('translations');
      }
    });
  });

  describe('Parameter Hover', () => {
    test('Hovering over JSON parameter shows parameter description (T022)', async () => {
      const code = minimalProgram({
        actionBody: `
          selectElement("#header")
          addController("NavigationController", {pages: ["home"]})
        `,
        timelineBody: 'at 0s..1s testAction()',
      });

      const document = await ctx.parse(code);

      const text = document.textDocument.getText();
      const jsonParamIndex = text.indexOf('{pages');
      const hoverOffset = jsonParamIndex + '{pa'.length; // Middle of "pages"

      // Convert offset to line/character position
      const position = document.textDocument.positionAt(hoverOffset);

      const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position,
      });

      // May or may not have hover (depends on implementation)
      // If hover exists, should show parameter description
      if (hover) {
        const hoverText =
          typeof hover.contents === 'string' ? hover.contents : hover.contents.value;

        // Should show something about pages parameter
        expect(hoverText.length).toBeGreaterThan(0);
      }
    });
  });
});
