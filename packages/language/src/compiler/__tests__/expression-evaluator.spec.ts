/**
 * Expression Evaluator Tests
 *
 * Tests compile-time evaluation of constant expressions.
 * User Story 3 (P3): Evaluate simple expressions at compile time.
 */

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Expression, Program } from '../../generated/ast.js';
import { evaluateExpression } from '../expression-evaluator.js';
import type { ConstantMap } from '../types/constant-folding.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

async function parseExpression(code: string): Promise<Expression> {
  const fullCode = `const TEST = ${code};`;
  const document = await parseDocument(services, fullCode);
  const program = document.parseResult.value as Program;
  const varDecl = program.elements[0];
  if (varDecl.$type !== 'VariableDeclaration') {
    throw new Error('Expected VariableDeclaration');
  }
  return varDecl.value;
}

describe('Expression Evaluator - Arithmetic', () => {
  test('should evaluate addition', async () => {
    const expr = await parseExpression('10 + 20');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(30);
  });

  test('should evaluate subtraction', async () => {
    const expr = await parseExpression('50 - 30');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(20);
  });

  test('should evaluate multiplication', async () => {
    const expr = await parseExpression('5 * 6');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(30);
  });

  test('should evaluate division', async () => {
    const expr = await parseExpression('20 / 4');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(5);
  });

  test('should detect division by zero', async () => {
    const expr = await parseExpression('10 / 0');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(false);
    expect(result.error?.reason).toContain('Division by zero');
  });

  test('should handle nested arithmetic', async () => {
    const expr = await parseExpression('(5 + 3) * 2');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(16);
  });
});

describe('Expression Evaluator - String Concatenation', () => {
  test('should evaluate string concatenation', async () => {
    const expr = await parseExpression('"Hello" + " World"');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe('Hello World');
  });

  test('should handle multiple string concatenations', async () => {
    const expr = await parseExpression('"a" + "b" + "c"');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe('abc');
  });
});

describe('Expression Evaluator - Logical Operations', () => {
  test('should evaluate logical AND (true && false)', async () => {
    const expr = await parseExpression('true && false');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(false);
  });

  test('should evaluate logical OR (false || true)', async () => {
    const expr = await parseExpression('false || true');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(true);
  });

  test('should evaluate logical NOT (!true)', async () => {
    const expr = await parseExpression('!true');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(false);
  });

  test('should evaluate comparison (5 > 3)', async () => {
    const expr = await parseExpression('5 > 3');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(true);
  });
});

describe('Expression Evaluator - Constant References', () => {
  test('should resolve constant reference', async () => {
    // Parse with full context so Langium can resolve references
    const fullCode = `
      const A = 5;
      const B = @A + 3;
    `;
    const document = await parseDocument(services, fullCode);
    const program = document.parseResult.value as Program;

    // Get B's expression
    const bDecl = program.elements[1];
    if (bDecl.$type !== 'VariableDeclaration') {
      throw new Error('Expected VariableDeclaration');
    }

    // Build constant map with A already evaluated
    const constantMap: ConstantMap = new Map([['A', { name: 'A', value: 5, type: 'number' }]]);

    const result = evaluateExpression(bDecl.value, constantMap);

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(8);
  });

  test('should resolve transitive constants', async () => {
    // This test simulates: const A = 5; const B = A + 3; const C = B * 2;
    const fullCode = `
      const A = 5;
      const B = @A + 3;
      const C = @B * 2;
    `;
    const document = await parseDocument(services, fullCode);
    const program = document.parseResult.value as Program;

    const cDecl = program.elements[2];
    if (cDecl.$type !== 'VariableDeclaration') {
      throw new Error('Expected VariableDeclaration');
    }

    // Build constant map with A and B already evaluated
    const constantMap: ConstantMap = new Map([
      ['A', { name: 'A', value: 5, type: 'number' }],
      ['B', { name: 'B', value: 8, type: 'number' }], // A + 3 = 8
    ]);

    const result = evaluateExpression(cDecl.value, constantMap);

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(16); // B * 2 = 8 * 2 = 16
  });

  test('should error on undefined constant reference', async () => {
    const fullCode = `
      const X = 5;
      const Y = @UNDEFINED + 1;
    `;
    const document = await parseDocument(services, fullCode);
    const program = document.parseResult.value as Program;

    const yDecl = program.elements[1];
    if (yDecl.$type !== 'VariableDeclaration') {
      throw new Error('Expected VariableDeclaration');
    }

    const result = evaluateExpression(yDecl.value, new Map());

    expect(result.canEvaluate).toBe(false);
    expect(result.error?.reason).toContain('Undefined constant');
  });
});

describe('Expression Evaluator - Edge Cases', () => {
  test('should handle modulo operation', async () => {
    const expr = await parseExpression('10 % 3');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(1);
  });

  test('should handle negative numbers with unary minus', async () => {
    const expr = await parseExpression('-(5 + 3)');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(-8);
  });

  test('should return literal values as-is', async () => {
    const expr = await parseExpression('42');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(42);
  });

  test('should fail gracefully on unsupported expression types', async () => {
    // Object literals should fail gracefully
    const expr = await parseExpression('{ x: 5 }');
    const result = evaluateExpression(expr, new Map());

    expect(result.canEvaluate).toBe(false);
    expect(result.error?.reason).toContain('Cannot evaluate');
  });
});
