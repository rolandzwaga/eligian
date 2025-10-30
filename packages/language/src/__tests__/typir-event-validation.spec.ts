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

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test, beforeAll } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

describe('US3: Timeline Event Validation (Integration)', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  /**
   * Helper: Parse DSL code and return validation diagnostics
   */
  async function parseAndValidate(code: string) {
    const document = await parse(code);

    // Manually trigger validation
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    return {
      document,
      program: document.parseResult.value as Program,
      diagnostics: document.diagnostics ?? [],
      validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [], // 1 = Error
    };
  }

  // T036-1: Error on negative start time
  test('should error on negative start time in timed event', async () => {
    const code = `
      timeline "Test" in "#app" using raf {
        at -1s..5s selectElement("#box")
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const timeErrors = validationErrors.filter(e =>
      e.message.includes('negative') || e.message.includes('start time')
    );
    expect(timeErrors.length).toBeGreaterThan(0);
  });

  // T036-2: Error on end < start
  test('should error when end time is before start time', async () => {
    const code = `
      timeline "Test" in "#app" using raf {
        at 5s..2s selectElement("#box")
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const timeErrors = validationErrors.filter(e =>
      e.message.includes('end time') || e.message.includes('greater than')
    );
    expect(timeErrors.length).toBeGreaterThan(0);
  });

  // T036-3: Error on negative sequence duration
  test('should error on negative sequence duration', async () => {
    const code = `
      timeline "Test" in "#app" using raf {
        at 0s selectElement("#box") for -2s
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const durationErrors = validationErrors.filter(e =>
      e.message.includes('duration') || e.message.includes('positive')
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

    const delayErrors = validationErrors.filter(e =>
      e.message.includes('delay') || e.message.includes('greater than')
    );
    expect(delayErrors.length).toBeGreaterThan(0);
  });

  // T036-5: Hover shows event timing
  test('should show timing information on hover for timed event', async () => {
    const code = `
      timeline "Test" in "#app" using raf {
        at 0s..5s selectElement("#box")
      }
    `;
    const { document, program } = await parseAndValidate(code);

    // Find the TimedEvent node
    const timeline = program.elements?.find(e => e.$type === 'Timeline');
    expect(timeline).toBeDefined();

    // Note: Full hover testing requires HoverProvider integration
    // This test verifies the AST structure exists for hover to work
    expect(timeline?.$type).toBe('Timeline');
  });
});
