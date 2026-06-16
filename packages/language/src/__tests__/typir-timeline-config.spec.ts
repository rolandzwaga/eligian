/**
 * Integration Tests: Timeline Configuration Validation (US5)
 *
 * Tests Typir integration for validating timeline configurations:
 * - Video/audio providers require source
 * - RAF/custom providers should not have source (warning)
 * - Container selector must be valid CSS syntax
 * - Timeline should not be empty (warning if no events)
 *
 * Per Constitution Principle II: Integration tests MUST be isolated in separate files.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

describe('US5: Timeline Configuration Validation (Integration)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function parseAndValidate(code: string) {
    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    return {
      document,
      program: document.parseResult.value,
      diagnostics: document.diagnostics ?? [],
      validationErrors:
        document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [],
      validationWarnings:
        document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Warning) ?? [],
    };
  }

  // T058-1: Error on video without source
  test('should error on video timeline without source', async () => {
    const code = `
      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in "#app" using video {
        at 0s..5s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const sourceErrors = validationErrors.filter(
      e => e.message.includes('source') || e.message.includes('Video')
    );
    expect(sourceErrors.length).toBeGreaterThan(0);
  });

  // T058-2: Warning on RAF with source
  test('should warn on RAF timeline with source', async () => {
    const code = `
      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in "#app" using raf from "./video.mp4" {
        at 0s..5s testAction()
      }
    `;
    const { validationWarnings } = await parseAndValidate(code);

    const sourceWarnings = validationWarnings.filter(
      w => w.message.includes('source') || w.message.includes('RAF') || w.message.includes('raf')
    );
    expect(sourceWarnings.length).toBeGreaterThan(0);
  });

  // T058-3: Error on invalid CSS selector
  test('should error on invalid CSS selector in container', async () => {
    const code = `
      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in "not a valid selector!!!" using raf {
        at 0s..5s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const selectorErrors = validationErrors.filter(
      e => e.message.includes('selector') || e.message.includes('CSS')
    );
    expect(selectorErrors.length).toBeGreaterThan(0);
  });

  // T058-4: Hover shows "Timeline<video>"
  test('should infer Timeline type with provider information', async () => {
    const code = `
      action testAction() [
        selectElement("#box")
      ]

      timeline "Test" in "#app" using video from "./video.mp4" {
        at 0s..5s testAction()
      }
    `;
    const { program } = await parseAndValidate(code);

    // Find the Timeline node
    const timeline = program.statements?.find(s => s.$type === 'Timeline');
    expect(timeline).toBeDefined();

    // Note: Full hover testing requires HoverProvider integration
    // This test verifies the AST structure exists for hover to work
    expect(timeline?.$type).toBe('Timeline');
  });

  // T058-5: Warning on timeline with no events
  test('should warn on timeline with no events', async () => {
    const code = `
      timeline "Test" in "#app" using raf {
      }
    `;
    const { validationWarnings } = await parseAndValidate(code);

    const emptyWarnings = validationWarnings.filter(
      w =>
        w.message.includes('empty') ||
        w.message.includes('no events') ||
        w.message.includes('event')
    );
    expect(emptyWarnings.length).toBeGreaterThan(0);
  });

  // Regression: an incomplete timeline (mid-edit) has no container selector.
  // `containerSelector` is mandatory in the grammar, but Langium error-recovery
  // produces a partial Timeline node with `containerSelector === undefined`.
  // The Typir selector rule used to call `selector.trim()` on it and throw a
  // TypeError (aborting the rest of the Timeline validation), and the Langium
  // CSS validator emitted a spurious "Invalid CSS selector syntax" error.
  // Both must now skip the CSS check on an absent selector.
  test('should not throw or emit a CSS error for a timeline missing its container selector', async () => {
    const code = `
      timeline "Test" in using raf {
      }
    `;

    // Must not throw during validation (the rule previously threw on undefined).
    const result = await parseAndValidate(code);
    const { diagnostics } = result;

    // No diagnostic should be an internal crash leaking through.
    const crashDiagnostics = diagnostics.filter(d =>
      d.message.includes('Cannot read properties of undefined')
    );
    expect(crashDiagnostics).toHaveLength(0);

    // No spurious CSS-selector diagnostic should be reported for the absent selector.
    const selectorDiagnostics = diagnostics.filter(
      d =>
        d.message.includes('Invalid CSS selector') ||
        d.message.includes('selector syntax') ||
        (typeof d.data === 'object' &&
          d.data !== null &&
          (d.data as { code?: string }).code === 'invalid_css_selector_syntax')
    );
    expect(selectorDiagnostics).toHaveLength(0);
  });
});
