/**
 * Unit Tests: Control Flow Validation Rules (US4)
 *
 * Tests the control flow validation rules in isolation:
 * - IfStatement validation (boolean condition, empty branch)
 * - ForStatement validation (array collection, empty body)
 */

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../../../eligian-module.js';
import type { Program } from '../../../generated/ast.js';

describe('Control Flow Validation (Unit Tests)', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

  async function parseAndValidate(code: string) {
    const document = await parse(code);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    return {
      diagnostics: document.diagnostics ?? [],
      errors: document.diagnostics?.filter(d => d.severity === 1) ?? [],
      warnings: document.diagnostics?.filter(d => d.severity === 2) ?? [],
    };
  }

  describe('IfStatement Validation', () => {
    test('should warn on string literal condition', async () => {
      const code = `
        action test() [
          if ("string") {
            selectElement("#box")
          }
        ]
      `;
      const { warnings } = await parseAndValidate(code);
      const conditionWarnings = warnings.filter(w => w.message.includes('boolean'));
      expect(conditionWarnings.length).toBeGreaterThan(0);
    });

    test('should warn on number literal condition', async () => {
      const code = `
        action test() [
          if (42) {
            selectElement("#box")
          }
        ]
      `;
      const { warnings } = await parseAndValidate(code);
      const conditionWarnings = warnings.filter(w => w.message.includes('boolean'));
      expect(conditionWarnings.length).toBeGreaterThan(0);
    });

    test('should not warn on boolean literal condition', async () => {
      const code = `
        action test() [
          if (true) {
            selectElement("#box")
          }
        ]
      `;
      const { warnings } = await parseAndValidate(code);
      const conditionWarnings = warnings.filter(w => w.message.includes('boolean'));
      expect(conditionWarnings.length).toBe(0);
    });

    test('should not warn on comparison expression', async () => {
      const code = `
        const count = 5
        action test() [
          if (count > 3) {
            selectElement("#box")
          }
        ]
      `;
      const { warnings } = await parseAndValidate(code);
      const conditionWarnings = warnings.filter(w => w.message.includes('boolean'));
      expect(conditionWarnings.length).toBe(0);
    });

    test('should warn on empty then branch', async () => {
      const code = `
        action test() [
          if (true) {
          }
        ]
      `;
      const { warnings } = await parseAndValidate(code);
      const emptyWarnings = warnings.filter(w => w.message.includes('empty'));
      expect(emptyWarnings.length).toBeGreaterThan(0);
    });

    test('should warn on empty else branch', async () => {
      const code = `
        action test() [
          if (true) {
            selectElement("#box")
          } else {
          }
        ]
      `;
      const { warnings } = await parseAndValidate(code);
      const emptyWarnings = warnings.filter(w => w.message.includes('empty'));
      expect(emptyWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('ForStatement Validation', () => {
    test('should error on string literal collection', async () => {
      const code = `
        action test() [
          for (item in "string") {
            selectElement("#box")
          }
        ]
      `;
      const { errors } = await parseAndValidate(code);
      const collectionErrors = errors.filter(e => e.message.includes('array'));
      expect(collectionErrors.length).toBeGreaterThan(0);
    });

    test('should error on number literal collection', async () => {
      const code = `
        action test() [
          for (item in 42) {
            selectElement("#box")
          }
        ]
      `;
      const { errors } = await parseAndValidate(code);
      const collectionErrors = errors.filter(e => e.message.includes('array'));
      expect(collectionErrors.length).toBeGreaterThan(0);
    });

    test('should not error on array literal collection', async () => {
      const code = `
        action test() [
          for (item in [".item-1", ".item-2"]) {
            selectElement(@@item)
          }
        ]
      `;
      const { errors } = await parseAndValidate(code);
      const collectionErrors = errors.filter(e => e.message.includes('array'));
      expect(collectionErrors.length).toBe(0);
    });

    test('should not error on array literal collection', async () => {
      const code = `
        action test() [
          for (item in [".item-1", ".item-2"]) {
            selectElement(@@item)
          }
        ]
      `;
      const { errors } = await parseAndValidate(code);
      const collectionErrors = errors.filter(e => e.message.includes('array'));
      expect(collectionErrors.length).toBe(0);
    });

    test('should warn on empty for body', async () => {
      const code = `
        action test() [
          for (item in [".item-1", ".item-2"]) {
          }
        ]
      `;
      const { warnings } = await parseAndValidate(code);
      const emptyWarnings = warnings.filter(w => w.message.includes('empty'));
      expect(emptyWarnings.length).toBeGreaterThan(0);
    });
  });
});
