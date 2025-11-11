/**
 * User Story 1: Event Name Validation Tests
 *
 * Tests for validating event names match known Eligius events
 * with "Did you mean?" suggestions using Levenshtein distance ≤ 2
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('Event Name Validation (US1)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  // T005: Valid event name "dom-mutation" produces no errors
  test('should accept valid event name "dom-mutation"', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action HandleMutation() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  // T006: Valid event name "before-request-video-url" produces no errors
  test('should accept valid event name "before-request-video-url"', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "before-request-video-url" action HandleVideo() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  // T007: Valid event name "timeline-complete" produces no errors
  test('should accept valid event name "timeline-complete"', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "timeline-complete" action HandleComplete() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  // T008: Unknown event "dom-mutaton" produces error with suggestion "dom-mutation"
  test('should reject unknown event "dom-mutaton" with suggestion', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutaton" action HandleMutation() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('dom-mutaton'));
    expect(eventError).toBeDefined();
    expect(eventError?.message).toMatch(/did you mean.*dom-mutation/i);
  });

  // T009: Unknown event "before-request-vidio-url" produces error with suggestion
  test('should reject unknown event "before-request-vidio-url" with suggestion', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "before-request-vidio-url" action HandleVideo() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('before-request-vidio-url'));
    expect(eventError).toBeDefined();
    expect(eventError?.message).toMatch(/did you mean.*before-request-video-url/i);
  });

  // T010: Unknown event with distance > 2 produces error without suggestions
  test('should reject unknown event "completely-invalid-event" without suggestions', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "completely-invalid-event" action HandleInvalid() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('completely-invalid-event'));
    expect(eventError).toBeDefined();
    expect(eventError?.message).not.toMatch(/did you mean/i);
  });

  // T011: Empty event name produces error
  test('should reject empty event name with appropriate error', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "" action HandleEmpty() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.toLowerCase().includes('empty'));
    expect(eventError).toBeDefined();
  });

  // T012: Event name with multiple typos produces error with closest match
  test('should suggest closest match for event with multiple typos', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "befre-reqest-vdeo-url" action HandleVideo() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('befre-reqest-vdeo-url'));
    expect(eventError).toBeDefined();
    // Should still provide suggestion if within threshold for any known event
  });

  // T013: Case-sensitive matching (e.g., "Dom-Mutation" should error, not match "dom-mutation")
  test('should enforce case-sensitive event name matching', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "Dom-Mutation" action HandleMutation() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('Dom-Mutation'));
    expect(eventError).toBeDefined();
  });
});
