/**
 * Tests for Controller Validation
 *
 * Verifies that addController calls are validated correctly:
 * - Unknown controller names produce errors
 * - Missing required parameters produce errors
 * - Too many parameters produce errors
 * - Valid controller calls produce no errors
 * - Label ID validation for LabelController (User Story 2)
 *
 * Feature: 035-specialized-controller-syntax
 * User Stories: US1, US2
 * Tasks: T007, T015
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { LabelGroupMetadata } from '../type-system-typir/utils/label-registry.js';
import type { TestContext } from './test-helpers.js';
import {
  CSS_FIXTURES,
  createTestContext,
  DiagnosticSeverity,
  minimalProgram,
  setupCSSRegistry,
} from './test-helpers.js';

describe('Controller Validation (Feature 035, User Story 1)', () => {
  let ctx: TestContext;

  const mockLabels: LabelGroupMetadata[] = [
    { id: 'label.welcome', translationCount: 1, languageCodes: ['en-US'] },
  ];

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: [...(CSS_FIXTURES.common.classes ?? []), 'container'],
      ids: [...(CSS_FIXTURES.common.ids ?? []), 'header'],
    });
  });

  test('Unknown controller name produces error (T007)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("UnknownController", "param")
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    const { diagnostics } = await ctx.parseAndValidate(code);

    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    // Should have exactly one error for unknown controller
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown controller');
    expect(errors[0].message).toContain('UnknownController');
  });

  test('Missing required parameter produces error (T007)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("LabelController")
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    const { diagnostics } = await ctx.parseAndValidate(code);

    const errors = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'missing_required_parameter'
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Missing required parameter');
    expect(errors[0].message).toContain('labelId');
  });

  test('Too many parameters produces error (T007)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("LabelController", "label.welcome", "textContent", "extra")
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'too_many_parameters'
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Too many parameters');
  });

  test('Valid LabelController call with required parameter only produces no errors (T007)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    // Syntax: languages { [*] "code" "label" }
    const code = `languages {
  "en-US" "English"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "label.welcome")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI, then setup labels and CSS
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

    // Filter to only label ID validation errors (ignore file existence and CSS errors from generated code)
    const labelErrors =
      document.diagnostics?.filter(
        d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_label_id'
      ) ?? [];
    expect(labelErrors).toHaveLength(0);
  });

  test('Valid LabelController call with required + optional parameters produces no errors (T007)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    // Syntax: languages { [*] "code" "label" }
    const code = `languages {
  "en-US" "English"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "label.welcome", "textContent")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI, then setup labels and CSS
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

    // Filter to only label ID validation errors (ignore file existence and CSS errors from generated code)
    const labelErrors =
      document.diagnostics?.filter(
        d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_label_id'
      ) ?? [];
    expect(labelErrors).toHaveLength(0);
  });

  test('Valid NavigationController call produces no errors (T007)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("NavigationController", {pages: ["home", "about"]})
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors).toHaveLength(0);
  });
});

describe('Controller Label ID Validation (Feature 035, User Story 2)', () => {
  let ctx: TestContext;

  const mockLabels: LabelGroupMetadata[] = [
    { id: 'welcome.title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
    { id: 'welcome.subtitle', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] },
    { id: 'button.submit', translationCount: 1, languageCodes: ['en-US'] },
    { id: 'label.welcome', translationCount: 1, languageCodes: ['en-US'] },
  ];

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Setup CSS registry
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: [...(CSS_FIXTURES.common.classes ?? []), 'container'],
      ids: [...(CSS_FIXTURES.common.ids ?? []), 'header'],
    });
  });

  test('Valid label ID produces no errors (T015)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    // Syntax: languages { [*] "code" "label" } - * marks default
    const code = `languages {
  * "en-US" "English"
  "nl-NL" "Nederlands"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "welcome.title")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI, then setup labels and CSS
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

    // Filter to only label ID validation errors (ignore file existence and CSS errors from generated code)
    const labelErrors =
      document.diagnostics?.filter(
        d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_label_id'
      ) ?? [];
    expect(labelErrors).toHaveLength(0);
  });

  test('Unknown label ID produces error (T015)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    // Syntax: languages { [*] "code" "label" } - * marks default
    const code = `languages {
  * "en-US" "English"
  "nl-NL" "Nederlands"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "unknown.label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI, then setup labels and CSS
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

    const errors =
      document.diagnostics?.filter(
        d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_label_id'
      ) ?? [];

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown label ID');
    expect(errors[0].message).toContain('unknown.label');
  });

  test('Typo label ID produces error with suggestion (T015)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    // Syntax: languages { [*] "code" "label" } - * marks default
    const code = `languages {
  * "en-US" "English"
  "nl-NL" "Nederlands"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "welcom.title")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI, then setup labels and CSS
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

    const errors =
      document.diagnostics?.filter(
        d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_label_id'
      ) ?? [];

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Did you mean');
    expect(errors[0].message).toContain('welcome.title');
  });

  test('No label imports produces warning/error (T015)', async () => {
    const code = minimalProgram({
      actionBody: `
        selectElement("#header")
        addController("LabelController", "any.label")
      `,
      timelineBody: 'at 0s..1s testAction()',
    });

    // Parse but don't register any labels (simulates no labels imported)
    const document = await ctx.parse(code);

    // Now validate without setting up labels
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const errors =
      document.diagnostics?.filter(
        d =>
          (d.severity === DiagnosticSeverity.Error || d.severity === DiagnosticSeverity.Warning) &&
          d.data?.code === 'no_labels_import'
      ) ?? [];

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('no labels imported');
  });

  test('Multiple LabelController calls validate independently (T020)', async () => {
    // Languages block must come FIRST, then imports, then actions/timelines
    // Syntax: languages { [*] "code" "label" } - * marks default
    const code = `languages {
  * "en-US" "English"
  "nl-NL" "Nederlands"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "welcome.title")
        selectElement("#footer")
        addController("LabelController", "unknown.label")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI, then setup labels and CSS
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

    // Should have exactly 1 error for the unknown label
    const errors =
      document.diagnostics?.filter(
        d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_label_id'
      ) ?? [];
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('unknown.label');
  });

  test('Label ID with special characters validates correctly (T020)', async () => {
    const specialLabels: LabelGroupMetadata[] = [
      { id: 'welcome-title.v2', translationCount: 1, languageCodes: ['en-US'] },
      { id: 'button_submit', translationCount: 1, languageCodes: ['en-US'] },
    ];

    // Languages block must come FIRST, then imports, then actions/timelines
    // Syntax: languages { [*] "code" "label" }
    const code = `languages {
  "en-US" "English"
}
labels "./labels.json"
${minimalProgram({
  cssImport: false, // We handle imports manually
  actionBody: `
        selectElement("#header")
        addController("LabelController", "welcome-title.v2")
      `,
  timelineBody: 'at 0s..1s testAction()',
})}`;

    // Parse first to get document URI, then setup labels and CSS
    const document = await ctx.parse(code);
    const documentUri = document.uri.toString();

    // Register CSS imports for selector validation
    const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
    cssRegistry.registerImports(documentUri, ['file:///styles.css']);

    // Register label imports for label validation
    const labelRegistry = ctx.services.Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile('file:///labels.json', specialLabels);
    labelRegistry.registerImports(documentUri, 'file:///labels.json');

    // Now validate
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    // Filter to only label ID validation errors (ignore file existence and CSS errors from generated code)
    const labelErrors =
      document.diagnostics?.filter(
        d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_label_id'
      ) ?? [];
    expect(labelErrors).toHaveLength(0);
  });
});
