/**
 * Integration Tests: Control Flow Type Checking (US4)
 *
 * Tests Typir integration for validating control flow statements:
 * - IfStatement: Condition must be boolean (warning if not)
 * - ForStatement: Collection must be array (error if not)
 *
 * Per Constitution Principle II: Integration tests MUST be isolated in separate files.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('US4: Control Flow Type Checking (Integration)', () => {
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
      validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [], // 1 = Error
      validationWarnings: document.diagnostics?.filter(d => d.severity === 2) ?? [], // 2 = Warning
    };
  }

  // T049-1: Warning on non-boolean condition
  test('should warn on non-boolean if condition', async () => {
    const code = `
      const value = "string"

      action testAction() [
        if (value) {
          selectElement("#box")
        }
      ]
    `;
    const { validationWarnings } = await parseAndValidate(code);

    const conditionWarnings = validationWarnings.filter(
      w => w.message.includes('boolean') || w.message.includes('condition')
    );
    expect(conditionWarnings.length).toBeGreaterThan(0);
  });

  // T049-2: Error on non-array collection in for loop
  test('should error on non-array collection in for statement', async () => {
    const code = `
      const notArray = "string"

      action testAction() [
        for (item in notArray) {
          selectElement("#box")
        }
      ]
    `;
    const { validationErrors } = await parseAndValidate(code);

    const collectionErrors = validationErrors.filter(
      e => e.message.includes('array') || e.message.includes('collection')
    );
    expect(collectionErrors.length).toBeGreaterThan(0);
  });

  // T049-3: No error on valid array collection
  test('should not error on valid array collection', async () => {
    const code = `
      action testAction() [
        for (item in [".item-1", ".item-2", ".item-3"]) {
          selectElement(@@item)
        }
      ]

      timeline "Test" in "#app" using raf {
        at 0s..1s testAction()
      }
    `;
    const { validationErrors } = await parseAndValidate(code);

    const collectionErrors = validationErrors.filter(
      e => e.message.includes('array') || e.message.includes('collection')
    );
    expect(collectionErrors.length).toBe(0);
  });

  // T049-4: Validation of comparison expression (should be boolean)
  test('should not warn on boolean comparison expression', async () => {
    const code = `
      const count = 5

      action testAction() [
        if (count > 3) {
          selectElement("#box")
        }
      ]
    `;
    const { validationWarnings } = await parseAndValidate(code);

    const conditionWarnings = validationWarnings.filter(
      w => w.message.includes('boolean') || w.message.includes('condition')
    );
    expect(conditionWarnings.length).toBe(0);
  });

  // T049-5: Warning on empty if branch
  test('should warn on empty if branch', async () => {
    const code = `
      const value = true

      action testAction() [
        if (value) {
        }
      ]
    `;
    const { validationWarnings } = await parseAndValidate(code);

    const emptyWarnings = validationWarnings.filter(
      w => w.message.includes('empty') || w.message.includes('branch')
    );
    expect(emptyWarnings.length).toBeGreaterThan(0);
  });
});
