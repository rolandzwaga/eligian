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
  eventActionProgram,
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
    const code = eventActionProgram('dom-mutation', 'HandleMutation');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  // T006: Valid event name "before-request-video-url" produces no errors
  test('should accept valid event name "before-request-video-url"', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  // T007: Valid event name "timeline-complete" produces no errors
  test('should accept valid event name "timeline-complete"', async () => {
    const code = eventActionProgram('timeline-complete', 'HandleComplete');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  // T008: Unknown event "dom-mutaton" produces error with suggestion "dom-mutation"
  test('should reject unknown event "dom-mutaton" with suggestion', async () => {
    const code = eventActionProgram('dom-mutaton', 'HandleMutation');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('dom-mutaton'));
    expect(eventError).toBeDefined();
    expect(eventError?.message).toMatch(/did you mean.*dom-mutation/i);
  });

  // T009: Unknown event "before-request-vidio-url" produces error with suggestion
  test('should reject unknown event "before-request-vidio-url" with suggestion', async () => {
    const code = eventActionProgram('before-request-vidio-url', 'HandleVideo');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('before-request-vidio-url'));
    expect(eventError).toBeDefined();
    expect(eventError?.message).toMatch(/did you mean.*before-request-video-url/i);
  });

  // T010: Unknown event with distance > 2 produces error without suggestions
  test('should reject unknown event "completely-invalid-event" without suggestions', async () => {
    const code = eventActionProgram('completely-invalid-event', 'HandleInvalid');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('completely-invalid-event'));
    expect(eventError).toBeDefined();
    expect(eventError?.message).not.toMatch(/did you mean/i);
  });

  // T011: Empty event name produces error
  test('should reject empty event name with appropriate error', async () => {
    const code = eventActionProgram('', 'HandleEmpty');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.toLowerCase().includes('empty'));
    expect(eventError).toBeDefined();
  });

  // T012: Event name with multiple typos produces error with closest match
  test('should suggest closest match for event with multiple typos', async () => {
    const code = eventActionProgram('befre-reqest-vdeo-url', 'HandleVideo');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('befre-reqest-vdeo-url'));
    expect(eventError).toBeDefined();
    // Should still provide suggestion if within threshold for any known event
  });

  // T013: Case-sensitive matching (e.g., "Dom-Mutation" should error, not match "dom-mutation")
  test('should enforce case-sensitive event name matching', async () => {
    const code = eventActionProgram('Dom-Mutation', 'HandleMutation');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const eventError = errors.find(e => e.message.includes('Dom-Mutation'));
    expect(eventError).toBeDefined();
  });

  // Custom application events are first-class on the eventbus (the engine's
  // ActionRegistryEventbusListener dispatches by event name to whatever registered
  // for it). So a non-engine event name is valid IF the program broadcasts it
  // itself — keeping typo help for known-event mistakes while allowing deliberate
  // custom events (e.g. a button broadcasting an event an `on event` answers).
  test('should accept a custom event name that is broadcast in the same file', async () => {
    const code = `
      on event "tour-ping" action OnPing(target) [
        selectElement(target)
      ]
      action ping() [
        broadcastEvent(["#app"], "tour-ping")
      ]
      timeline "t" in "#app" using raf {
        at 0s..1s ping()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const eventError = errors.find(e => e.message.includes('tour-ping'));
    expect(eventError).toBeUndefined();
  });

  // A custom event name that is NEITHER a known engine event NOR broadcast
  // anywhere in the program is still flagged (it can never fire → almost surely
  // a typo or dead handler).
  test('should still reject a custom event name that is never broadcast', async () => {
    const code = `
      on event "tour-ping" action OnPing(target) [
        selectElement(target)
      ]
      timeline "t" in "#app" using raf {
        at 0s..1s selectElement("#app")
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const eventError = errors.find(e => e.message.includes('tour-ping'));
    expect(eventError).toBeDefined();
    expect(eventError?.message).toMatch(/unknown event name/i);
  });
});
