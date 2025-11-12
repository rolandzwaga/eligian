/**
 * User Story 2: Argument Count Validation Tests
 *
 * Tests for validating that event action parameter counts match
 * the number of arguments provided by Eligius events
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  eventActionProgram,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('Argument Count Validation (US2)', () => {
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

  // T022: Event "before-request-video-url" (3 args) with 3 params produces no warnings
  test('should accept event with matching parameter count (3 args, 3 params)', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'index' },
      { name: 'position' },
      { name: 'isHistory' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
    const countWarnings = warnings.filter(w => w.message.includes('provides'));

    expect(countWarnings).toHaveLength(0);
  });

  // T023: Event "timeline-complete" (0 args) with 0 params produces no warnings
  test('should accept event with zero args and zero params', async () => {
    const code = eventActionProgram('timeline-complete', 'HandleComplete');

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
    const countWarnings = warnings.filter(w => w.message.includes('provides'));

    expect(countWarnings).toHaveLength(0);
  });

  // T024: Event "dom-mutation" (1 arg: payload) with 1 param produces no warnings
  test('should accept event with matching parameter count (1 arg, 1 param)', async () => {
    const code = eventActionProgram('dom-mutation', 'HandleMutation', [{ name: 'payload' }]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
    const countWarnings = warnings.filter(w => w.message.includes('provides'));

    expect(countWarnings).toHaveLength(0);
  });

  // T025: Event "before-request-video-url" (3 args) with 2 params produces warning
  test('should warn when too few parameters (3 args, 2 params)', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'index' },
      { name: 'position' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    expect(warnings.length).toBeGreaterThan(0);
    const countWarning = warnings.find(
      w =>
        w.message.includes('before-request-video-url') &&
        w.message.includes('provides 3') &&
        w.message.includes('declares 2')
    );
    expect(countWarning).toBeDefined();
    expect(countWarning?.message).toMatch(/missing.*undefined/i);
  });

  // T026: Event "before-request-video-url" (3 args) with 1 param produces warning
  test('should warn when too few parameters (3 args, 1 param)', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [{ name: 'index' }]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    expect(warnings.length).toBeGreaterThan(0);
    const countWarning = warnings.find(
      w =>
        w.message.includes('before-request-video-url') &&
        w.message.includes('provides 3') &&
        w.message.includes('declares 1')
    );
    expect(countWarning).toBeDefined();
  });

  // T027: Event "timeline-complete" (0 args) with 1 param produces warning
  test('should warn when too many parameters (0 args, 1 param)', async () => {
    const code = eventActionProgram('timeline-complete', 'HandleComplete', [
      { name: 'extraParam' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    expect(warnings.length).toBeGreaterThan(0);
    const countWarning = warnings.find(
      w =>
        w.message.includes('timeline-complete') &&
        w.message.includes('provides 0') &&
        w.message.includes('declares 1') &&
        w.message.includes('extraParam')
    );
    expect(countWarning).toBeDefined();
    expect(countWarning?.message).toMatch(/extra.*ignored/i);
  });

  // T028: Event "timeline-complete" (0 args) with 3 params produces warning
  test('should warn when too many parameters (0 args, 3 params)', async () => {
    const code = eventActionProgram('timeline-complete', 'HandleComplete', [
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    expect(warnings.length).toBeGreaterThan(0);
    const countWarning = warnings.find(
      w =>
        w.message.includes('timeline-complete') &&
        w.message.includes('provides 0') &&
        w.message.includes('declares 3')
    );
    expect(countWarning).toBeDefined();
  });

  // T029: Unknown event name skips argument count validation (handled by US1)
  test('should skip argument count validation for unknown events', async () => {
    const code = eventActionProgram('unknown-event-name', 'HandleUnknown', [
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    // Should have error from US1 (unknown event name)
    const unknownEventError = errors.find(e => e.message.includes('unknown-event-name'));
    expect(unknownEventError).toBeDefined();

    // Should NOT have argument count warning (validation skipped)
    const countWarning = warnings.find(
      w => w.message.includes('provides') && w.message.includes('declares')
    );
    expect(countWarning).toBeUndefined();
  });

  // T030: Parameter names can be arbitrary (validation only checks count, not names)
  test('should allow arbitrary parameter names (only count matters)', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'foo' },
      { name: 'bar' },
      { name: 'baz' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    // Should have no warnings or errors (count matches, names don't matter)
    const countWarnings = warnings.filter(w => w.message.includes('provides'));
    const nameErrors = errors.filter(e => e.message.toLowerCase().includes('parameter name'));

    expect(countWarnings).toHaveLength(0);
    expect(nameErrors).toHaveLength(0);
  });
});
