# Quickstart: Implementing Constant Folding

**Feature**: Constant Folding Optimization
**Branch**: `005-const-folding-compiler`
**Date**: 2025-01-23

## Overview

This guide provides step-by-step instructions for implementing constant folding optimization in the Eligian compiler. Follow these steps in order, using Test-First Development (TDD) as required by the constitution.

---

## Prerequisites

Before starting:
- ✅ Read [spec.md](./spec.md) - understand the feature requirements
- ✅ Read [research.md](./research.md) - understand design decisions
- ✅ Read [data-model.md](./data-model.md) - understand data structures
- ✅ Understand existing compiler pipeline (`ast-transformer.ts`, `optimizer.ts`, `emitter.ts`)
- ✅ Understand Langium AST structure (check `generated/ast.ts`)

---

## Implementation Steps

### Phase 1: User Story 1 (P1) - Inline Constant Values

**Goal**: Replace constant references with literal values in generated JSON.

#### Step 1: Create `constant-folder.ts` (Core Logic)

**File**: `packages/language/src/compiler/constant-folder.ts`

**TDD Approach**: Write tests FIRST in `packages/language/src/compiler/__tests__/constant-folder.spec.ts`

**Test Cases** (write these first):
```typescript
describe('buildConstantMap', () => {
  it('should detect string constant', () => {
    const ast = parseEligian('const MESSAGE = "hello";');
    const map = buildConstantMap(ast);
    expect(map.get('MESSAGE')).toEqual({
      name: 'MESSAGE',
      value: 'hello',
      type: 'string'
    });
  });

  it('should detect number constant', () => {
    const ast = parseEligian('const DELAY = 1000;');
    const map = buildConstantMap(ast);
    expect(map.get('DELAY')).toEqual({
      name: 'DELAY',
      value: 1000,
      type: 'number'
    });
  });

  it('should detect boolean constant', () => {
    const ast = parseEligian('const FLAG = true;');
    const map = buildConstantMap(ast);
    expect(map.get('FLAG')).toEqual({
      name: 'FLAG',
      value: true,
      type: 'boolean'
    });
  });

  it('should handle multiple constants', () => {
    const ast = parseEligian(`
      const A = "foo";
      const B = 42;
    `);
    const map = buildConstantMap(ast);
    expect(map.size).toBe(2);
    expect(map.has('A')).toBe(true);
    expect(map.has('B')).toBe(true);
  });

  it('should ignore let variables', () => {
    const ast = parseEligian(`
      const A = 5;
      let B = 10;
    `);
    const map = buildConstantMap(ast);
    expect(map.size).toBe(1);
    expect(map.has('A')).toBe(true);
    expect(map.has('B')).toBe(false);
  });
});
```

**Implementation** (after tests fail):
```typescript
import type { Program, ConstDeclaration, Literal } from '../generated/ast.js';
import type { ConstantMap, ConstantValue } from './types.js';

/**
 * Build a map of all global constants from the AST
 * @param program - The Eligian program AST
 * @returns Map of constant names to their resolved values
 */
export function buildConstantMap(program: Program): ConstantMap {
  const map: ConstantMap = new Map();

  // Traverse all global declarations
  for (const element of program.elements) {
    if (element.$type === 'ConstDeclaration') {
      const constDecl = element as ConstDeclaration;

      // For User Story 1 (P1), only handle literal values
      if (constDecl.value.$type === 'Literal') {
        const literal = constDecl.value as Literal;
        const value = literal.value;

        map.set(constDecl.name, {
          name: constDecl.name,
          value: value,
          type: typeof value as 'string' | 'number' | 'boolean',
          sourceLocation: {
            line: constDecl.$cstNode?.range.start.line ?? 0,
            column: constDecl.$cstNode?.range.start.character ?? 0,
            file: program.$document?.uri.fsPath ?? 'unknown'
          }
        });
      }
    }
  }

  return map;
}
```

**Run tests**: `pnpm run test constant-folder.spec.ts` → Should pass ✅

---

#### Step 2: Integrate into `ast-transformer.ts`

**TDD Approach**: Add tests to `packages/language/src/compiler/__tests__/transformer.spec.ts`

**Test Cases** (write these first):
```typescript
describe('constant folding', () => {
  it('should inline string constant', async () => {
    const source = `
      const MESSAGE = "hello";

      action test [
        log(MESSAGE)
      ]
    `;

    const json = await compile(source);

    // Verify constant is inlined
    expect(JSON.stringify(json)).toContain('"message": "hello"');
    // Verify no globalData reference
    expect(JSON.stringify(json)).not.toContain('$globalData.MESSAGE');
  });

  it('should inline number constant', async () => {
    const source = `
      const DELAY = 1000;

      action test [
        wait(DELAY)
      ]
    `;

    const json = await compile(source);

    // Verify constant is inlined
    expect(JSON.stringify(json)).toContain('"delay": 1000');
    expect(JSON.stringify(json)).not.toContain('$globalData.DELAY');
  });

  it('should inline boolean constant', async () => {
    const source = `
      const FLAG = true;

      action test [
        if (FLAG) {
          log("enabled")
        }
      ]
    `;

    const json = await compile(source);

    // Verify constant is inlined
    expect(JSON.stringify(json)).toContain('true');
    expect(JSON.stringify(json)).not.toContain('$globalData.FLAG');
  });
});
```

**Implementation** (modify `ast-transformer.ts`):
```typescript
import { buildConstantMap } from './constant-folder.js';
import type { ConstantMap } from './types.js';

export class AstTransformer {
  private constantMap: ConstantMap = new Map();

  transform(program: Program): EligiusConfig {
    // Build constant map BEFORE transformation
    this.constantMap = buildConstantMap(program);

    // Rest of transformation logic...
    return this.transformProgram(program);
  }

  private transformVariableReference(ref: VariableReference): any {
    // Check if this is a constant reference
    if (this.constantMap.has(ref.name)) {
      const constant = this.constantMap.get(ref.name)!;
      // Return literal value instead of globalData reference
      return constant.value;
    }

    // Otherwise, return normal globalData reference
    return `$globalData.${ref.name}`;
  }
}
```

**Run tests**: `pnpm run test transformer.spec.ts` → Should pass ✅

---

### Phase 2: User Story 2 (P2) - Eliminate Init Actions

**Goal**: Don't generate init actions when only constants exist.

#### Step 3: Modify Init Action Generation

**TDD Approach**: Add tests to `transformer.spec.ts`

**Test Cases** (write these first):
```typescript
describe('init action elimination', () => {
  it('should not generate init action for constants only', async () => {
    const source = `
      const MESSAGE = "hello";
      const DELAY = 1000;
    `;

    const json = await compile(source);

    // Verify no init action
    expect(json.init).toBeUndefined();
  });

  it('should generate init action for let variables', async () => {
    const source = `
      const A = 5;
      let B = 10;
    `;

    const json = await compile(source);

    // Verify init action exists
    expect(json.init).toBeDefined();
    // Verify only B is in globalData
    expect(JSON.stringify(json.init)).toContain('"B"');
    expect(JSON.stringify(json.init)).not.toContain('"A"');
  });
});
```

**Implementation** (modify init action generation):
```typescript
private generateInitAction(program: Program): InitAction | undefined {
  const globalAssignments: GlobalDataAssignment[] = [];

  for (const element of program.elements) {
    // Only add assignments for 'let' variables, skip 'const'
    if (element.$type === 'VariableDeclaration' && element.kind === 'let') {
      globalAssignments.push({
        name: element.name,
        value: this.transformExpression(element.value)
      });
    }
  }

  // If no assignments, return undefined (no init action)
  if (globalAssignments.length === 0) {
    return undefined;
  }

  return { operations: globalAssignments };
}
```

**Run tests**: `pnpm run test transformer.spec.ts` → Should pass ✅

---

### Phase 3: User Story 3 (P3) - Compile-Time Expression Evaluation

**Goal**: Evaluate simple expressions at compile time (e.g., `const SUM = 10 + 20;` → inline `30`).

#### Step 4: Create `expression-evaluator.ts`

**File**: `packages/language/src/compiler/expression-evaluator.ts`

**TDD Approach**: Write tests FIRST in `expression-evaluator.spec.ts`

**Test Cases** (write these first):
```typescript
describe('evaluateExpression', () => {
  it('should evaluate arithmetic addition', () => {
    const expr = parseBinaryExpression('10 + 20');
    const result = evaluateExpression(expr, new Map());
    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(30);
  });

  it('should evaluate string concatenation', () => {
    const expr = parseBinaryExpression('"Hello" + " World"');
    const result = evaluateExpression(expr, new Map());
    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe('Hello World');
  });

  it('should evaluate logical AND', () => {
    const expr = parseBinaryExpression('true && false');
    const result = evaluateExpression(expr, new Map());
    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(false);
  });

  it('should resolve constant references', () => {
    const map = new Map([
      ['A', { name: 'A', value: 5, type: 'number' }]
    ]);
    const expr = parseBinaryExpression('A + 3');
    const result = evaluateExpression(expr, map);
    expect(result.canEvaluate).toBe(true);
    expect(result.value).toBe(8);
  });

  it('should detect circular dependencies', () => {
    const map = new Map([
      ['A', { name: 'A', value: 'B', type: 'number' }],
      ['B', { name: 'B', value: 'A', type: 'number' }]
    ]);
    const expr = parseVariableReference('A');
    expect(() => evaluateExpression(expr, map, new Set(['A']))).toThrow('Circular dependency');
  });
});
```

**Implementation** (after tests fail):
```typescript
import type { Expression, BinaryExpression, UnaryExpression, Literal, VariableReference } from '../generated/ast.js';
import type { ConstantMap, ExpressionEvaluationResult } from './types.js';

export function evaluateExpression(
  expr: Expression,
  constants: ConstantMap,
  evaluating: Set<string> = new Set()
): ExpressionEvaluationResult {
  try {
    const value = evaluateExpressionInternal(expr, constants, evaluating);
    return { canEvaluate: true, value };
  } catch (error) {
    return {
      canEvaluate: false,
      error: {
        reason: error.message,
        expression: expr.$cstNode?.text ?? 'unknown',
        sourceLocation: {
          line: expr.$cstNode?.range.start.line ?? 0,
          column: expr.$cstNode?.range.start.character ?? 0,
          file: 'unknown'
        }
      }
    };
  }
}

function evaluateExpressionInternal(
  expr: Expression,
  constants: ConstantMap,
  evaluating: Set<string>
): string | number | boolean {
  switch (expr.$type) {
    case 'Literal':
      return (expr as Literal).value;

    case 'BinaryExpression':
      const bin = expr as BinaryExpression;
      const left = evaluateExpressionInternal(bin.left, constants, evaluating);
      const right = evaluateExpressionInternal(bin.right, constants, evaluating);
      return applyBinaryOperator(bin.operator, left, right);

    case 'UnaryExpression':
      const un = expr as UnaryExpression;
      const operand = evaluateExpressionInternal(un.operand, constants, evaluating);
      return applyUnaryOperator(un.operator, operand);

    case 'VariableReference':
      const ref = expr as VariableReference;
      if (evaluating.has(ref.name)) {
        throw new Error(`Circular dependency detected: ${ref.name}`);
      }
      if (!constants.has(ref.name)) {
        throw new Error(`Reference to non-constant: ${ref.name}`);
      }
      const constant = constants.get(ref.name)!;
      return constant.value;

    default:
      throw new Error(`Cannot evaluate expression type: ${expr.$type}`);
  }
}

function applyBinaryOperator(op: string, left: any, right: any): any {
  switch (op) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': {
      if (right === 0) throw new Error('Division by zero');
      return left / right;
    }
    case '%': return left % right;
    case '&&': return left && right;
    case '||': return left || right;
    case '==': return left == right;
    case '!=': return left != right;
    case '<': return left < right;
    case '>': return left > right;
    case '<=': return left <= right;
    case '>=': return left >= right;
    default:
      throw new Error(`Unsupported operator: ${op}`);
  }
}

function applyUnaryOperator(op: string, operand: any): any {
  switch (op) {
    case '!': return !operand;
    case '-': return -operand;
    case '+': return +operand;
    default:
      throw new Error(`Unsupported unary operator: ${op}`);
  }
}
```

**Run tests**: `pnpm run test expression-evaluator.spec.ts` → Should pass ✅

---

#### Step 5: Integrate Expression Evaluator

**Modify `constant-folder.ts` to use the evaluator**:
```typescript
import { evaluateExpression } from './expression-evaluator.js';

export function buildConstantMap(program: Program): ConstantMap {
  const map: ConstantMap = new Map();

  for (const element of program.elements) {
    if (element.$type === 'ConstDeclaration') {
      const constDecl = element as ConstDeclaration;

      // Try to evaluate the expression
      const result = evaluateExpression(constDecl.value, map);

      if (result.canEvaluate) {
        map.set(constDecl.name, {
          name: constDecl.name,
          value: result.value!,
          type: typeof result.value as 'string' | 'number' | 'boolean',
          sourceLocation: {
            line: constDecl.$cstNode?.range.start.line ?? 0,
            column: constDecl.$cstNode?.range.start.character ?? 0,
            file: program.$document?.uri.fsPath ?? 'unknown'
          }
        });
      } else {
        // Log warning or treat as regular variable (no folding)
        console.warn(`Cannot fold constant ${constDecl.name}: ${result.error?.reason}`);
      }
    }
  }

  return map;
}
```

**Add integration tests**:
```typescript
it('should evaluate arithmetic expression', async () => {
  const source = `
    const SUM = 10 + 20;

    action test [
      log(SUM)
    ]
  `;

  const json = await compile(source);

  // Verify expression was evaluated and inlined
  expect(JSON.stringify(json)).toContain('30');
  expect(JSON.stringify(json)).not.toContain('$globalData.SUM');
});
```

**Run tests**: `pnpm run test` → All tests should pass ✅

---

### Phase 4: Integration Testing

**Create end-to-end test file**: `packages/language/src/__tests__/integration/constant-folding.spec.ts`

**Test Cases**:
```typescript
describe('Constant Folding Integration', () => {
  it('should handle real-world example', async () => {
    const source = `
      timeline raf

      const MESSAGE = "Hello, World!";
      const DELAY = 1000;
      const REPEAT = 3;

      event greeting at 0..10 {
        log(MESSAGE)
        wait(DELAY)
        repeat(REPEAT)
      }
    `;

    const json = await compile(source);

    // Verify all constants inlined
    expect(JSON.stringify(json)).toContain('"Hello, World!"');
    expect(JSON.stringify(json)).toContain('1000');
    expect(JSON.stringify(json)).toContain('3');

    // Verify no globalData references
    expect(JSON.stringify(json)).not.toContain('$globalData.MESSAGE');
    expect(JSON.stringify(json)).not.toContain('$globalData.DELAY');
    expect(JSON.stringify(json)).not.toContain('$globalData.REPEAT');

    // Verify no init action
    expect(json.init).toBeUndefined();
  });
});
```

**Run full test suite**: `pnpm run test` → All tests pass ✅

---

## Validation Checklist

Before considering the feature complete:

- [ ] **FR-001**: Compiler detects all `const` declarations ✅
- [ ] **FR-002**: All constant references replaced with literals ✅
- [ ] **FR-003**: No globalData assignments for constants ✅
- [ ] **FR-004**: Type preservation works (string vs. number vs. boolean) ✅
- [ ] **FR-005**: Init action eliminated when only constants ✅
- [ ] **FR-006**: Expression evaluation works for simple expressions ✅ (P3)
- [ ] **FR-007**: Mixed const/let handled correctly ✅
- [ ] **FR-008**: Runtime behavior identical to before optimization ✅
- [ ] **SC-001**: JSON size reduced by 20%+ (measure with real files)
- [ ] **SC-002**: 100% of constants inlined (no $globalData patterns)
- [ ] **SC-003**: Compile time increase <10% (benchmark)
- [ ] **SC-004**: All existing tests pass (regression check)
- [ ] **SC-005**: No init action for constants-only files ✅

---

## Performance Validation

**Benchmark compilation time**:
```bash
# Before optimization (baseline)
time pnpm run test > /dev/null

# After optimization
time pnpm run test > /dev/null

# Calculate percentage increase (must be <10%)
```

**Measure JSON size reduction**:
```bash
# Before optimization
wc -c generated-config.json  # e.g., 5000 bytes

# After optimization
wc -c generated-config.json  # e.g., 4000 bytes

# Calculate reduction: (5000 - 4000) / 5000 = 20% ✅
```

---

## Troubleshooting

### Issue: Compilation time increased by >10%

**Diagnosis**: Profile the constant map building and expression evaluation logic.

**Fix**: Add memoization, optimize map lookups, lazy-evaluate expressions only when referenced.

### Issue: Type mismatch errors

**Diagnosis**: Constant value type doesn't match expected parameter type.

**Fix**: Ensure `type` field in `ConstantValue` is preserved during transformation. Add type validation.

### Issue: Circular dependency not detected

**Diagnosis**: `evaluating` set not being passed correctly.

**Fix**: Verify `evaluateExpressionInternal` adds constant name to `evaluating` set before recursion.

---

## Summary

You now have a complete implementation of constant folding optimization:
1. ✅ **P1**: Constants inlined in generated JSON
2. ✅ **P2**: Init actions eliminated for constants-only files
3. ✅ **P3**: Compile-time expression evaluation for simple expressions

**Next**: Run `/speckit.tasks` to generate the detailed task breakdown for implementation.
