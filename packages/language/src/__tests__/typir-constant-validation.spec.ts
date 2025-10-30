/**
 * Integration tests for Typir-based constant validation (User Story 2)
 *
 * Tests cover:
 * - Reserved keyword detection in constant declarations
 * - Valid constant names that don't conflict with keywords
 */

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

describe('US2: Reserved Keyword Validation (Integration)', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

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

  test('T026-1: Parser error on const if = 5 (grammar keyword)', async () => {
    const code = `
      const if = 5

      timeline "test" in "#app" using raf {}
    `;

    const { document } = await parseAndValidate(code);

    // Grammar keywords cause parser errors (which is correct behavior)
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  test('T026-2: Parser error on const timeline = "test" (grammar keyword)', async () => {
    const code = `
      const timeline = "test"

      timeline "real" in "#app" using raf {}
    `;

    const { document } = await parseAndValidate(code);

    // Grammar keywords cause parser errors (which is correct behavior)
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  test('T026-3: Parser error on const action = 42 (grammar keyword)', async () => {
    const code = `
      const action = 42

      timeline "test" in "#app" using raf {}
    `;

    const { document } = await parseAndValidate(code);

    // Grammar keywords cause parser errors (which is correct behavior)
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  test('T026-4: No error on const duration = 100 (valid name)', async () => {
    const code = `
      const duration = 100

      timeline "test" in "#app" using raf {}
    `;

    const { validationErrors } = await parseAndValidate(code);

    // Filter out non-related errors (e.g., timeline validation)
    const reservedKeywordErrors = validationErrors.filter(e => e.message.includes('reserved'));
    expect(reservedKeywordErrors.length).toBe(0);
  });

  test('T026-5: No error on const myVar = "test" (valid name)', async () => {
    const code = `
      const myVar = "test"

      timeline "test" in "#app" using raf {}
    `;

    const { validationErrors } = await parseAndValidate(code);

    // Filter out non-related errors
    const reservedKeywordErrors = validationErrors.filter(e => e.message.includes('reserved'));
    expect(reservedKeywordErrors.length).toBe(0);
  });
});
