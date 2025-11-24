import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, DiagnosticSeverity, type TestContext } from '../test-helpers.js';

/**
 * Integration tests for labels hot-reload validation
 *
 * These tests verify that validation updates correctly when the label registry
 * is updated (simulating labels JSON file changes detected by the file watcher).
 *
 * Feature: Labels File Hot-Reload Validation
 */
describe('Labels Hot-Reload - Registry Update Validation', () => {
  let ctx: TestContext;

  // Expensive setup - runs once per suite
  beforeAll(async () => {
    ctx = createTestContext();
  });

  test('should show error before labels update, no error after labels update', async () => {
    const code = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }
      labels "./labels.json"

      action test() [
        selectElement("#header")
        addController("LabelController", "button-text")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // Parse first to get document URI
    const document = await ctx.parse(code);
    const documentUri = document.uri.toString();

    // Setup: Register labels with only 'welcome-title'
    const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile('file:///labels.json', [
      {
        id: 'welcome-title',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
    ]);
    labelRegistry.registerImports(documentUri, 'file:///labels.json');

    // First validation: should have error for 'button-text' (unknown label ID)
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors1 = document.diagnostics ?? [];
    const unknownLabelErrors1 = errors1.filter(
      e => e.severity === DiagnosticSeverity.Error && e.data?.code === 'unknown_label_id'
    );
    expect(unknownLabelErrors1.length).toBeGreaterThan(0);
    expect(unknownLabelErrors1[0].message).toContain('button-text');

    // Simulate labels file update: add 'button-text'
    labelRegistry.updateLabelsFile('file:///labels.json', [
      {
        id: 'welcome-title',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
      {
        id: 'button-text',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
    ]);

    // Re-validate the same document
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors2 = document.diagnostics ?? [];
    const unknownLabelErrors2 = errors2.filter(e => e.data?.code === 'unknown_label_id');

    // Error should disappear
    expect(unknownLabelErrors2.length).toBe(0);
  });

  test('should show error after labels update removes label ID', async () => {
    const code = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }
      labels "./labels.json"

      action test() [
        selectElement("#header")
        addController("LabelController", "button-text")
      ]

      timeline "test" in ".container" using raf {
        at 0s test()
      }
    `;

    // Parse first to get document URI
    const document = await ctx.parse(code);
    const documentUri = document.uri.toString();

    // Setup: Register labels with 'welcome-title' and 'button-text'
    const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile('file:///labels.json', [
      {
        id: 'welcome-title',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
      {
        id: 'button-text',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
    ]);
    labelRegistry.registerImports(documentUri, 'file:///labels.json');

    // First validation: should have NO errors
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors1 = document.diagnostics ?? [];
    const unknownLabelErrors1 = errors1.filter(e => e.data?.code === 'unknown_label_id');
    expect(unknownLabelErrors1.length).toBe(0);

    // Simulate labels file update: remove 'button-text'
    labelRegistry.updateLabelsFile('file:///labels.json', [
      {
        id: 'welcome-title',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
    ]);

    // Re-validate the same document
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors2 = document.diagnostics ?? [];
    const unknownLabelErrors2 = errors2.filter(e => e.data?.code === 'unknown_label_id');

    // Error should appear
    expect(unknownLabelErrors2.length).toBeGreaterThan(0);
    expect(unknownLabelErrors2[0].message).toContain('button-text');
  });

  test('should update validation for multiple documents importing same labels file', async () => {
    const code1 = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }
      labels "./shared-labels.json"

      action test1() [
        selectElement("#header")
        addController("LabelController", "button-text")
      ]

      timeline "test1" in ".container" using raf {
        at 0s..1s test1()
      }
    `;

    const code2 = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }
      labels "./shared-labels.json"

      action test2() [
        selectElement("#footer")
        addController("LabelController", "button-text")
      ]

      timeline "test2" in ".container" using raf {
        at 0s..1s test2()
      }
    `;

    // Parse both documents first
    const doc1 = await ctx.parse(code1);
    const doc2 = await ctx.parse(code2);

    // Setup: Register labels with only 'welcome-title'
    const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile('file:///shared-labels.json', [
      {
        id: 'welcome-title',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
    ]);

    // Register imports for both documents
    labelRegistry.registerImports(doc1.uri.toString(), 'file:///shared-labels.json');
    labelRegistry.registerImports(doc2.uri.toString(), 'file:///shared-labels.json');

    // Validate both documents
    await ctx.services.shared.workspace.DocumentBuilder.build([doc1], { validation: true });
    await ctx.services.shared.workspace.DocumentBuilder.build([doc2], { validation: true });

    // Both should have errors for 'button-text'
    const errors1 = doc1.diagnostics ?? [];
    const errors2 = doc2.diagnostics ?? [];
    const unknownLabel1 = errors1.filter(e => e.data?.code === 'unknown_label_id');
    const unknownLabel2 = errors2.filter(e => e.data?.code === 'unknown_label_id');
    expect(unknownLabel1.length).toBeGreaterThan(0);
    expect(unknownLabel2.length).toBeGreaterThan(0);

    // Simulate labels file update: add 'button-text'
    labelRegistry.updateLabelsFile('file:///shared-labels.json', [
      {
        id: 'welcome-title',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
      {
        id: 'button-text',
        translationCount: 2,
        languageCodes: ['en-US', 'nl-NL'],
      },
    ]);

    // Re-validate both documents
    await ctx.services.shared.workspace.DocumentBuilder.build([doc1], { validation: true });
    await ctx.services.shared.workspace.DocumentBuilder.build([doc2], { validation: true });

    // Both should have no errors now
    const errors1After = doc1.diagnostics?.filter(e => e.data?.code === 'unknown_label_id') ?? [];
    const errors2After = doc2.diagnostics?.filter(e => e.data?.code === 'unknown_label_id') ?? [];
    expect(errors1After.length).toBe(0);
    expect(errors2After.length).toBe(0);
  });
});
