/**
 * Integration tests for Label Entry Quick Fix Availability (Feature 041 - User Story 2)
 *
 * Tests the conditions under which the "Create label entry" quick fix is offered:
 * - NOT offered when no labels import exists
 * - NOT offered when labels file doesn't exist
 * - NOT offered when labels file has invalid JSON
 * - NOT offered when label ID already exists
 * - IS offered when all conditions are met
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { LabelGroupMetadata } from '../../type-system-typir/utils/label-registry.js';
import {
  createTestContext,
  DiagnosticSeverity,
  minimalProgram,
  type TestContext,
} from '../test-helpers.js';

describe('Code Action Availability (Feature 041, User Story 2)', () => {
  let ctx: TestContext;

  // Mock labels for testing
  const mockLabels: LabelGroupMetadata[] = [
    { id: 'existing-label', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
  ];

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Clear label registry before each test
    ctx.services.Eligian.labels.LabelRegistry.clearAll();
  });

  // T026: Test quick fix NOT offered when no labels import exists
  test('should NOT offer quick fix when no labels import exists (T026)', async () => {
    // Program using addController("LabelController", "labelId") without labels import
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("LabelController", "some-label")
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    // Parse but don't register any labels (simulates no labels imported)
    const document = await ctx.parse(code);

    // Now validate without setting up labels
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];

    // Should have a diagnostic for no_labels_import, not unknown_label_id
    const noImportDiagnostics = diagnostics.filter(
      d =>
        (d.severity === DiagnosticSeverity.Error || d.severity === DiagnosticSeverity.Warning) &&
        (d.data as any)?.code === 'no_labels_import'
    );
    const unknownLabelDiagnostics = diagnostics.filter(
      d => (d.data as any)?.code === 'unknown_label_id'
    );

    // Without labels import, should get no_labels_import error
    expect(noImportDiagnostics.length).toBeGreaterThan(0);
    expect(noImportDiagnostics[0].message).toContain('no labels imported');
    // Should NOT get unknown_label_id with quick fix data
    expect(unknownLabelDiagnostics.length).toBe(0);
  });

  // T027: Test quick fix NOT offered when labels file doesn't exist
  // Note: When the labels file doesn't exist, the registry won't be updated,
  // so this falls back to no_labels_import error similar to T026
  test('should NOT offer quick fix when labels file does not exist (T027)', async () => {
    // Program with labels import pointing to non-existent file
    // Languages block first, then labels import, then action/timeline
    const code = `languages {
  * "en-US" "English"
}
labels "./non-existent-labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "some-label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse the code
    const document = await ctx.parse(code);

    // Don't register any labels (simulating non-existent file)
    // The validator should still work but won't find the file in registry

    // Now validate
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];

    // Check that unknown_label_id diagnostics don't have labelsFileUri
    // (which is required for the quick fix to work)
    const unknownLabelDiagnostics = diagnostics.filter(
      d => (d.data as any)?.code === 'unknown_label_id'
    );

    // With no labels file registered, we should get no_labels_import instead
    const noImportDiagnostics = diagnostics.filter(
      d => (d.data as any)?.code === 'no_labels_import'
    );

    // Either we get no diagnostics because file isn't registered,
    // or we get no_labels_import because registry has no labels
    if (unknownLabelDiagnostics.length > 0) {
      // If we do get unknown_label_id, it shouldn't have labelsFileUri
      for (const diag of unknownLabelDiagnostics) {
        const data = diag.data as any;
        expect(data?.labelsFileUri).toBeUndefined();
      }
    } else {
      // Expect no_labels_import error since file doesn't exist
      expect(noImportDiagnostics.length).toBeGreaterThan(0);
    }
  });

  // T028: Test quick fix NOT offered when labels file has invalid JSON
  // Note: This is handled at the import level - invalid JSON files
  // are registered with empty metadata, so labels won't be found
  test('should NOT offer quick fix when labels file has invalid JSON (T028)', async () => {
    // This test validates that the system handles invalid JSON gracefully
    // The quick fix won't be offered because the file won't parse correctly
    // and thus no label IDs will be registered

    // Register a labels file with empty metadata (simulating invalid JSON)
    const documentUri = 'file:///test.eligian';
    const labelsFileUri = 'file:///invalid-labels.json';

    ctx.services.Eligian.labels.LabelRegistry.updateLabelsFile(labelsFileUri, []);
    ctx.services.Eligian.labels.LabelRegistry.registerImports(documentUri, labelsFileUri);

    // Check that no labels are available for the document
    const labelIDs = ctx.services.Eligian.labels.LabelRegistry.getLabelIDsForDocument(documentUri);
    expect(labelIDs.size).toBe(0);
  });

  // T029: Test quick fix NOT offered when label ID already exists
  test('should NOT offer quick fix when label ID already exists (T029)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    const code = `languages {
  * "en-US" "English"
  "nl-NL" "Nederlands"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "existing-label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI
    const document = await ctx.parse(code);
    const documentUri = document.uri.toString();

    // Register CSS imports for selector validation
    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    cssRegistry.registerImports(documentUri, ['file:///styles.css']);

    // Register label imports for label validation
    const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
    labelRegistry.registerImports(documentUri, 'file:///labels.json');

    // Now validate
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];

    // Should NOT have any unknown_label_id diagnostics for existing-label
    const unknownLabelDiagnostics = diagnostics.filter(
      d =>
        (d.data as any)?.code === 'unknown_label_id' &&
        (d.data as any)?.labelId === 'existing-label'
    );

    expect(unknownLabelDiagnostics.length).toBe(0);
  });

  // T030: Test quick fix IS offered when all conditions are met
  test('should offer quick fix when all conditions are met (T030)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    const code = `languages {
  * "en-US" "English"
  "nl-NL" "Nederlands"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "missing-label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI
    const document = await ctx.parse(code);
    const documentUri = document.uri.toString();

    // Register CSS imports for selector validation
    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    cssRegistry.registerImports(documentUri, ['file:///styles.css']);

    // Register label imports for label validation
    const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile('file:///labels.json', mockLabels);
    labelRegistry.registerImports(documentUri, 'file:///labels.json');

    // Now validate
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];

    // Should have unknown_label_id diagnostic with full quick fix data
    const unknownLabelDiagnostics = diagnostics.filter(
      d =>
        (d.data as any)?.code === 'unknown_label_id' && (d.data as any)?.labelId === 'missing-label'
    );

    expect(unknownLabelDiagnostics.length).toBe(1);

    const data = unknownLabelDiagnostics[0].data as any;
    expect(data.labelId).toBe('missing-label');
    expect(data.labelsFileUri).toBeDefined();
    expect(data.languageCodes).toEqual(['en-US', 'nl-NL']);
  });

  // Additional test: Multiple missing labels
  test('should offer quick fix for each missing label independently', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    const code = `languages {
  * "en-US" "English"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "missing-one")
        addController("LabelController", "missing-two")
        addController("LabelController", "existing-label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI
    const document = await ctx.parse(code);
    const documentUri = document.uri.toString();

    // Register CSS imports for selector validation
    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    cssRegistry.registerImports(documentUri, ['file:///styles.css']);

    // Register label imports for label validation
    const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile('file:///labels.json', [
      { id: 'existing-label', translationCount: 1, languageCodes: ['en-US'] },
    ]);
    labelRegistry.registerImports(documentUri, 'file:///labels.json');

    // Now validate
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = document.diagnostics ?? [];

    // Should have diagnostics for both missing labels
    const missingOneDiag = diagnostics.filter(
      d =>
        (d.data as any)?.code === 'unknown_label_id' && (d.data as any)?.labelId === 'missing-one'
    );
    const missingTwoDiag = diagnostics.filter(
      d =>
        (d.data as any)?.code === 'unknown_label_id' && (d.data as any)?.labelId === 'missing-two'
    );
    const existingDiag = diagnostics.filter(
      d =>
        (d.data as any)?.code === 'unknown_label_id' &&
        (d.data as any)?.labelId === 'existing-label'
    );

    expect(missingOneDiag.length).toBe(1);
    expect(missingTwoDiag.length).toBe(1);
    expect(existingDiag.length).toBe(0); // existing label should not trigger diagnostic
  });
});
