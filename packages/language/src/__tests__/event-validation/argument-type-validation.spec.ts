/**
 * User Story 3: Argument Type Compatibility Validation Tests
 *
 * Tests for validating that event action parameter type annotations
 * match the types specified in Eligius event metadata (opt-in validation)
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  eventActionProgram,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('Argument Type Compatibility Validation (US3)', () => {
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

  // T039: Event "before-request-video-url" with matching types (number, number, boolean) produces no errors
  test('should accept matching type annotations', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'index', type: 'number' },
      { name: 'position', type: 'number' },
      { name: 'isHistory', type: 'boolean' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const typeErrors = errors.filter(e => e.message.toLowerCase().includes('type mismatch'));

    expect(typeErrors).toHaveLength(0);
  });

  // T040: Event "dom-mutation" with matching type (payload: any) produces no errors
  test('should accept matching type for single parameter', async () => {
    const code = eventActionProgram('dom-mutation', 'HandleMutation', [
      { name: 'payload', type: 'any' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const typeErrors = errors.filter(e => e.message.toLowerCase().includes('type mismatch'));

    expect(typeErrors).toHaveLength(0);
  });

  // T041: Parameters without type annotations produce no errors (opt-in validation)
  test('should skip validation for parameters without type annotations', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'index' },
      { name: 'position' },
      { name: 'isHistory' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const typeErrors = errors.filter(e => e.message.toLowerCase().includes('type'));

    expect(typeErrors).toHaveLength(0);
  });

  // T042: Event "before-request-video-url" with mismatched type (index: string instead of number) produces error
  test('should reject mismatched type annotation (string vs number)', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'index', type: 'string' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    const typeError = errors.find(
      e =>
        e.message.includes('index') &&
        e.message.toLowerCase().includes('type mismatch') &&
        e.message.includes('string') &&
        e.message.includes('number')
    );
    expect(typeError).toBeDefined();
  });

  // T043: Event with multiple type mismatches produces errors for each mismatch
  test('should report multiple type mismatches', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'index', type: 'string' },
      { name: 'position', type: 'boolean' },
      { name: 'isHistory', type: 'number' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const typeErrors = errors.filter(e => e.message.toLowerCase().includes('type mismatch'));

    // Should have 3 type errors (one for each parameter)
    expect(typeErrors.length).toBeGreaterThanOrEqual(3);
  });

  // T044: Mixed annotations (some with types, some without) validates only annotated parameters
  test('should validate only parameters with type annotations (mixed scenario)', async () => {
    const code = eventActionProgram('before-request-video-url', 'HandleVideo', [
      { name: 'index', type: 'number' },
      { name: 'position' },
      { name: 'isHistory' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const typeErrors = errors.filter(e => e.message.toLowerCase().includes('type mismatch'));

    // Should have no errors (index matches, others not validated)
    expect(typeErrors).toHaveLength(0);
  });

  // T045: Type annotation on parameter beyond event argument count produces warning
  test('should warn about unnecessary type annotation for extra parameter', async () => {
    const code = eventActionProgram('timeline-complete', 'HandleComplete', [
      { name: 'extraParam', type: 'string' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    const unnecessaryTypeWarning = warnings.find(
      w => w.message.includes('extraParam') && w.message.toLowerCase().includes('unnecessary')
    );
    expect(unnecessaryTypeWarning).toBeDefined();
  });

  // T046: Unknown event name skips type validation (handled by US1)
  test('should skip type validation for unknown events', async () => {
    const code = eventActionProgram('unknown-event', 'HandleUnknown', [
      { name: 'a', type: 'string' },
      { name: 'b', type: 'number' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    // Should have error from US1 (unknown event name)
    const unknownEventError = errors.find(e => e.message.includes('unknown-event'));
    expect(unknownEventError).toBeDefined();

    // Should NOT have type mismatch errors (validation skipped)
    const typeErrors = errors.filter(e => e.message.toLowerCase().includes('type mismatch'));
    expect(typeErrors).toHaveLength(0);
  });

  // T047: Case-sensitive type matching (string vs any should mismatch)
  test('should enforce case-sensitive type matching', async () => {
    const code = eventActionProgram('dom-mutation', 'HandleMutation', [
      { name: 'payload', type: 'string' },
    ]);

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    const typeError = errors.find(
      e => e.message.includes('payload') && e.message.toLowerCase().includes('type mismatch')
    );
    expect(typeError).toBeDefined();
  });
});
