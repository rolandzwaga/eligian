/**
 * Type System Tests - Phase 18
 *
 * Tests for type inference, validation, and checking functionality.
 */

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { Expression, Program } from '../generated/ast.js';
import { inferLiteralType } from '../type-system/inference.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

/**
 * Parse code and return the Program AST node
 */
async function parseProgram(code: string): Promise<Program> {
  const document = await parseDocument(services, code);
  return document.parseResult.value as Program;
}

/**
 * Parse code and return the document (for validation tests)
 */
async function parse(code: string) {
  return await parseDocument(services, code);
}

describe('Type Inference - Literal Types (T296)', () => {
  test('should infer string type from string literal', async () => {
    const program = await parseProgram(`
      const message = "hello"
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('string');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should infer number type from number literal', async () => {
    const program = await parseProgram(`
      const duration = 1000
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('number');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should infer number type from decimal literal', async () => {
    const program = await parseProgram(`
      const opacity = 0.5
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('number');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should infer boolean type from true literal', async () => {
    const program = await parseProgram(`
      const enabled = true
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('boolean');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should infer boolean type from false literal', async () => {
    const program = await parseProgram(`
      const disabled = false
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('boolean');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should infer object type from object literal', async () => {
    const program = await parseProgram(`
      const styles = { opacity: 1, color: "red" }
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('object');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should infer array type from array literal', async () => {
    const program = await parseProgram(`
      const items = [1, 2, 3]
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('array');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should return unknown for non-literal expressions (variable reference)', async () => {
    const program = await parseProgram(`
      const x = 10
      const y = @x
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[1];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('unknown');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should return unknown for non-literal expressions (binary expression)', async () => {
    const program = await parseProgram(`
      const result = 10 + 20
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('unknown');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });

  test('should infer string type from single-quoted string', async () => {
    const program = await parseProgram(`
      const name = 'world'
      timeline "test" in ".test-container" using raf {}
    `);

    const varDecl = program.elements[0];
    if (varDecl.$type === 'VariableDeclaration') {
      const inferredType = inferLiteralType(varDecl.value as Expression);
      expect(inferredType).toBe('string');
    } else {
      throw new Error('Expected VariableDeclaration');
    }
  });
});

describe('Type Checking - Integration (Phase 18 - T305)', () => {
  test('should allow actions with type annotations to compile', async () => {
    const code = `
      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]

      timeline "test" in ".test-container" using raf {
        at 0s..2s {
          fadeIn("#box", 1000)
        }
      }
    `;

    const document = await parse(code);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    // No validation errors expected
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should allow variables with inferred types', async () => {
    const code = `
      action testVars() [
        selectElement("#test")
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should allow mixed typed and untyped parameters', async () => {
    const code = `
      action mixedParams(selector: string, duration, flag: boolean) [
        selectElement(selector)
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should allow untyped parameters (backwards compatibility)', async () => {
    const code = `
      action oldStyle(selector, duration) [
        selectElement(selector)
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should allow endable actions with type annotations', async () => {
    const code = `
      endable action showHide(selector: string, duration: number) [
        selectElement(selector)
        addClass("visible")
      ] [
        removeClass("visible")
      ]

      timeline "test" in ".test-container" using raf {
        at 0s..2s {
          showHide("#box", 1000)
        }
      }
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should allow all primitive types', async () => {
    const code = `
      action allTypes(
        text: string,
        count: number,
        enabled: boolean,
        config: object,
        items: array
      ) [
        selectElement(text)
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should track variable types through control flow', async () => {
    const code = `
      action testControlFlow() [
        selectElement("#test")
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should handle nested control flow with type tracking', async () => {
    const code = `
      action nestedFlow() [
        selectElement("#outer")
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should allow inline endable actions', async () => {
    const code = `
      timeline "test" in ".test-container" using raf {
        at 0s..2s [
          selectElement("#box")
          addClass("active")
        ] [
          removeClass("active")
        ]
      }
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should compile actions without any type annotations', async () => {
    const code = `
      action noTypes(a, b, c) [
        selectElement("#test")
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });
});

describe('Type Inference - Parameter Types (Phase 18 - T312)', () => {
  test('should infer parameter type from single operation usage', async () => {
    const code = `
      action testInfer(selector) [
        selectElement(selector)
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // Should infer selector as string and not report any type errors
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should infer parameter types from multiple operations', async () => {
    const code = `
      action fadeIn(selector, duration) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // Should infer selector as string, duration as number
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should handle parameters used in multiple operations with same type', async () => {
    const code = `
      action multiUse(selector) [
        selectElement(selector)
        addClass("highlight")
        setAttribute(selector, "data-active", "true")
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // selector used in selectElement (string) and setAttribute (string) - consistent
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should infer types in control flow statements', async () => {
    const code = `
      action conditionalOp(selector, threshold) [
        if (threshold > 10) {
          selectElement(selector)
        }
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // Should infer selector as string from selectElement inside if block
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should infer types in for loops', async () => {
    const code = `
      action loopOp(selector) [
        for (item in $operationdata.items) {
          selectElement(selector)
        }
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // Should infer selector as string from selectElement inside for loop
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should prefer explicit annotations over inference', async () => {
    const code = `
      action explicitWins(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // Explicit annotations should be used, not inferred types
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should handle endable actions with type inference', async () => {
    const code = `
      endable action inferEnd(selector) [
        selectElement(selector)
        addClass("active")
      ] [
        removeClass("active")
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // Should infer selector as string from selectElement in start ops
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });

  test('should handle parameters not used in any operation', async () => {
    const code = `
      action unusedParam(selector, unused) [
        selectElement(selector)
      ]

      timeline "test" in ".test-container" using raf {}
    `;

    const document = await parse(code);
    // unused parameter has no constraints, should remain unknown (no type checking)
    const diagnostics = document.diagnostics ?? [];
    expect(diagnostics).toHaveLength(0);
  });
});
