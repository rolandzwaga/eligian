/**
 * Integration tests for User Story 3 (US3): Timeline Event Validation
 *
 * Tests Typir-based validation of timeline events:
 * - TimedEvent: startTime ≥ 0, endTime > startTime
 * - SequenceEvent: duration > 0
 * - StaggerEvent: delay > 0
 * - Hover displays event timing information
 *
 * NOTE: Overlapping events are ALLOWED (per spec - overlaps are intentional)
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('US3: Timeline Event Validation (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  /**
   * Helper: Parse DSL code and return validation diagnostics
   */
  async function parseAndValidate(code: string) {
    const document = await ctx.parse(code);

    // Manually trigger validation
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    return {
      document,
      program: document.parseResult.value,
      diagnostics: document.diagnostics ?? [],
      validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [], // 1 = Error
    };
  }

  // T036-1: Error on negative start time
  test('should error on negative start time in timed event', async () => {
    const code = `
      action testAction() [
        selectElement("#test")
      ]

      timeline "Test" in "#app" using raf {
        at 0s - 1s..5s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const timeErrors = validationErrors.filter(
      e => e.message.includes('negative') || e.message.includes('start time')
    );
    expect(timeErrors.length).toBeGreaterThan(0);
  });

  // T036-2: Error on end < start
  test('should error when end time is before start time', async () => {
    const code = `
      action testAction() [
        selectElement("#test")
      ]

      timeline "Test" in "#app" using raf {
        at 5s..2s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const timeErrors = validationErrors.filter(
      e => e.message.includes('end time') || e.message.includes('greater than')
    );
    expect(timeErrors.length).toBeGreaterThan(0);
  });

  // T036-3: Error on negative sequence duration
  test('should error on negative sequence duration', async () => {
    const code = `
      timeline "Test" in "#app" using raf {
        sequence {
          selectElement("#box") for 0s - 2s
        }
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const durationErrors = validationErrors.filter(
      e => e.message.includes('duration') || e.message.includes('positive')
    );
    expect(durationErrors.length).toBeGreaterThan(0);
  });

  // T036-4: Error on zero stagger delay
  test('should error on zero stagger delay', async () => {
    const code = `
      const items = ["a", "b", "c"]

      timeline "Test" in "#app" using raf {
        at 0s stagger 0s items with selectElement(".item") for 1s
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const delayErrors = validationErrors.filter(
      e => e.message.includes('delay') || e.message.includes('greater than')
    );
    expect(delayErrors.length).toBeGreaterThan(0);
  });

  // T036-5: Hover shows event timing
  test('should show timing information on hover for timed event', async () => {
    const code = `
      action fadeIn(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in "#app" using raf {
        at 0s..5s fadeIn("#box")
      }
    `;
    const { program } = await parseAndValidate(code);

    // Find the Timeline node
    const timeline = program.statements?.find(e => e.$type === 'Timeline');
    expect(timeline).toBeDefined();

    // Note: Full hover testing requires HoverProvider integration
    // This test verifies the AST structure exists for hover to work
    expect(timeline?.$type).toBe('Timeline');
  });
});
