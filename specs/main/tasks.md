# Implementation Tasks: Break and Continue Syntactic Sugar

**Feature**: Add `break` and `continue` keywords as syntactic sugar for loop control operations
**Branch**: `main`
**Status**: Ready for Implementation
**Estimated Effort**: 2-3 hours

---

## Overview

This document provides a complete, ordered task list for implementing `break` and `continue` syntactic sugar in the Eligian DSL. Tasks are organized by user story to enable independent implementation and testing.

### User Stories

- **US1**: Clean Loop Control Syntax - Use simple `break`/`continue` keywords for readability
- **US2**: Compile-Time Validation - Catch incorrect usage (outside loops) at compile time
- **US3**: Mixed Syntax Support - Support both new keywords and old operation calls

### Implementation Strategy

1. **Grammar First**: Add AST nodes for new statements
2. **Transformation**: Map keywords to Eligius operations
3. **Validation**: Ensure correct usage context
4. **Testing**: Comprehensive coverage at all layers

---

## Phase 1: Project Setup

**Goal**: Prepare development environment and verify prerequisites

### T001: Verify Operation Registry [Setup]
**Type**: Verification
**File**: `packages/language/src/compiler/operations/registry.generated.ts`
**Story**: Foundation
**Description**: Confirm `breakForEach` and `continueForEach` operations exist in registry
**Steps**:
1. Open `packages/language/src/compiler/operations/registry.generated.ts`
2. Search for `breakForEach` entry (should exist from previous phase)
3. Search for `continueForEach` entry (should exist from previous phase)
4. Verify both have `category: "Control Flow"`
5. Verify both have empty `parameters` array
6. Document operation signatures for reference

**Acceptance**:
- [x] `breakForEach` operation exists in registry
- [x] `continueForEach` operation exists in registry
- [x] Both operations have correct metadata

**Estimated Time**: 5 minutes

---

### T002: Review Existing Syntactic Sugar Patterns [Setup]
**Type**: Research
**Files**:
- `packages/language/src/eligian.langium` (grammar patterns)
- `packages/language/src/compiler/ast-transformer.ts` (transformation patterns)
**Story**: Foundation
**Description**: Study how existing syntactic sugar works (if/else, for loops) to maintain consistency
**Steps**:
1. Review `IfStatement` grammar rule and transformation to `when/otherwise/endWhen`
2. Review `ForStatement` grammar rule and transformation to `forEach/endForEach`
3. Note transformation patterns in `transformIfStatement` and `transformForStatement`
4. Identify pattern: simple statements with no children vs. compound statements with bodies
5. Document pattern for `BreakStatement`/`ContinueStatement` (simplest case - no children)

**Acceptance**:
- [x] Understand grammar pattern for simple statements
- [x] Understand transformation pattern for statement → operation
- [x] Identified correct location in `OperationStatement` alternatives

**Estimated Time**: 10 minutes

---

## Phase 2: Grammar Extension (US1 - Clean Syntax)

**Goal**: Add `break` and `continue` keywords to the Langium grammar

**User Story**: US1 - Clean Loop Control Syntax
**Test Criteria**: `break` and `continue` parse correctly without syntax errors

---

### T003: [US1] Add BreakStatement to Grammar
**Type**: Implementation
**File**: `packages/language/src/eligian.langium`
**Story**: US1
**Description**: Add grammar rule for `break` keyword
**Steps**:
1. Open `packages/language/src/eligian.langium`
2. Locate `OperationStatement` rule (around line 104)
3. Add `BreakStatement` alternative to `OperationStatement`:
   ```langium
   OperationStatement:
       IfStatement
       | ForStatement
       | VariableDeclaration
       | BreakStatement      // ← NEW
       | OperationCall;
   ```
4. Add `BreakStatement` rule after `ForStatement` (around line 140):
   ```langium
   /**
    * Break Statement - Exit current loop immediately
    *
    * Compiles to: breakForEach() operation
    *
    * Examples:
    *   for (item in items) {
    *     if (@@currentItem.invalid) {
    *       break  // Exit loop
    *     }
    *   }
    *
    * Validation: Must appear inside a ForStatement
    */
   BreakStatement:
       'break';
   ```
5. Save file

**Acceptance**:
- [x] `BreakStatement` added to `OperationStatement` alternatives
- [x] `BreakStatement` rule defined with documentation
- [x] Grammar follows existing documentation patterns

**Estimated Time**: 5 minutes

---

### T004: [US1] Add ContinueStatement to Grammar
**Type**: Implementation
**File**: `packages/language/src/eligian.langium`
**Story**: US1
**Description**: Add grammar rule for `continue` keyword
**Steps**:
1. In same file (`eligian.langium`)
2. Add `ContinueStatement` to `OperationStatement` alternatives:
   ```langium
   OperationStatement:
       IfStatement
       | ForStatement
       | VariableDeclaration
       | BreakStatement
       | ContinueStatement   // ← NEW
       | OperationCall;
   ```
3. Add `ContinueStatement` rule after `BreakStatement`:
   ```langium
   /**
    * Continue Statement - Skip to next loop iteration
    *
    * Compiles to: continueForEach() operation
    *
    * Examples:
    *   for (item in items) {
    *     if (@@currentItem.skip) {
    *       continue  // Skip this iteration
    *     }
    *   }
    *
    * Validation: Must appear inside a ForStatement
    */
   ContinueStatement:
       'continue';
   ```
4. Save file

**Acceptance**:
- [x] `ContinueStatement` added to `OperationStatement` alternatives
- [x] `ContinueStatement` rule defined with documentation
- [x] Grammar syntax is consistent with `BreakStatement`

**Estimated Time**: 5 minutes

---

### T005: [US1] Regenerate Langium Artifacts
**Type**: Build
**Command**: `npm run langium:generate`
**Story**: US1
**Description**: Regenerate AST types from updated grammar
**Steps**:
1. Run `npm run langium:generate` from `packages/language` directory
2. Wait for generation to complete (should be fast)
3. Verify no errors in output
4. Check that `packages/language/src/generated/ast.ts` was updated
5. Verify new AST node interfaces exist:
   - `BreakStatement` interface with `$type: 'BreakStatement'`
   - `ContinueStatement` interface with `$type: 'ContinueStatement'`
   - Type guard functions: `isBreakStatement()`, `isContinueStatement()`

**Acceptance**:
- [x] Langium generation succeeds without errors
- [x] `BreakStatement` interface exists in `generated/ast.ts`
- [x] `ContinueStatement` interface exists in `generated/ast.ts`
- [x] Type guard functions generated

**Estimated Time**: 2 minutes

---

### T006: [US1] Add Parsing Tests for Break Statement [P]
**Type**: Test
**File**: `packages/language/src/__tests__/parsing.spec.ts`
**Story**: US1
**Description**: Verify `break` keyword parses correctly
**Steps**:
1. Open `packages/language/src/__tests__/parsing.spec.ts`
2. Add new test suite at end of file:
   ```typescript
   describe('Break and Continue Statements', () => {
     test('should parse break statement', async () => {
       const code = `
         action test [
           for (item in items) {
             break
           }
         ]
       `;
       const result = await parseHelper.parse(code);

       expect(result.parserErrors).toHaveLength(0);
       expect(result.value).toBeDefined();

       const action = result.value.actions[0];
       const forStmt = action.operations[0];
       const breakStmt = (forStmt as any).body[0];

       expect(isBreakStatement(breakStmt)).toBe(true);
     });
   });
   ```
3. Save file
4. Run test: `npm test -- parsing.spec.ts`

**Acceptance**:
- [x] Test passes (break parses without errors)
- [x] `isBreakStatement()` returns true for parsed node

**Estimated Time**: 10 minutes

---

### T007: [US1] Add Parsing Tests for Continue Statement [P]
**Type**: Test
**File**: `packages/language/src/__tests__/parsing.spec.ts`
**Story**: US1
**Description**: Verify `continue` keyword parses correctly
**Steps**:
1. In same test suite from T006
2. Add test for continue:
   ```typescript
   test('should parse continue statement', async () => {
     const code = `
       action test [
         for (item in items) {
           continue
         }
       ]
     `;
     const result = await parseHelper.parse(code);

     expect(result.parserErrors).toHaveLength(0);
     expect(result.value).toBeDefined();

     const action = result.value.actions[0];
     const forStmt = action.operations[0];
     const continueStmt = (forStmt as any).body[0];

     expect(isContinueStatement(continueStmt)).toBe(true);
   });
   ```
3. Save file
4. Run test: `npm test -- parsing.spec.ts`

**Acceptance**:
- [x] Test passes (continue parses without errors)
- [x] `isContinueStatement()` returns true for parsed node

**Estimated Time**: 5 minutes

---

### T008: [US1] Add Parsing Test for Multiple Statements [P]
**Type**: Test
**File**: `packages/language/src/__tests__/parsing.spec.ts`
**Story**: US1
**Description**: Verify both keywords can be used together
**Steps**:
1. In same test suite
2. Add test for multiple statements:
   ```typescript
   test('should parse multiple break and continue in loop', async () => {
     const code = `
       action test [
         for (item in items) {
           if (@@currentItem.skip) {
             continue
           }
           if (@@currentItem.stop) {
             break
           }
         }
       ]
     `;
     const result = await parseHelper.parse(code);

     expect(result.parserErrors).toHaveLength(0);
     expect(result.value).toBeDefined();
   });
   ```
3. Save file
4. Run test: `npm test -- parsing.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] Multiple statements parse correctly in same loop

**Estimated Time**: 5 minutes

---

**✅ Checkpoint: US1 - Grammar and Parsing Complete**
- Grammar extended with new statement types
- AST types generated
- Parsing tests pass

---

## Phase 3: Transformation (US1 - Clean Syntax)

**Goal**: Transform `break`/`continue` statements to Eligius operations

**User Story**: US1 - Clean Loop Control Syntax (continued)
**Test Criteria**: Statements transform to correct `breakForEach`/`continueForEach` operations

---

### T009: [US1] Add transformBreakStatement Function
**Type**: Implementation
**File**: `packages/language/src/compiler/ast-transformer.ts`
**Story**: US1
**Description**: Transform `break` to `breakForEach` operation
**Steps**:
1. Open `packages/language/src/compiler/ast-transformer.ts`
2. Import new AST types at top:
   ```typescript
   import {
     // ... existing imports
     isBreakStatement,
     isContinueStatement,
     type BreakStatement,
     type ContinueStatement,
   } from '../generated/ast.js';
   ```
3. Add transformation function (near other statement transformers):
   ```typescript
   /**
    * Transform a BreakStatement to breakForEach operation.
    *
    * @param stmt - BreakStatement AST node
    * @param scope - Current scope context (unused for break)
    * @returns Effect producing array with single breakForEach operation
    */
   function* transformBreakStatement(
     stmt: BreakStatement,
     scope?: ScopeContext
   ): Effect.Effect<OperationConfigIR[], TransformError> {
     return [{
       systemName: 'breakForEach',
       operationData: {}
     }];
   }
   ```
4. Save file

**Acceptance**:
- [x] Function created with correct signature
- [x] Returns single operation with `systemName: 'breakForEach'`
- [x] Empty `operationData` (no parameters)
- [x] JSDoc documentation present

**Estimated Time**: 10 minutes

---

### T010: [US1] Add transformContinueStatement Function
**Type**: Implementation
**File**: `packages/language/src/compiler/ast-transformer.ts`
**Story**: US1
**Description**: Transform `continue` to `continueForEach` operation
**Steps**:
1. In same file (`ast-transformer.ts`)
2. Add transformation function after `transformBreakStatement`:
   ```typescript
   /**
    * Transform a ContinueStatement to continueForEach operation.
    *
    * @param stmt - ContinueStatement AST node
    * @param scope - Current scope context (unused for continue)
    * @returns Effect producing array with single continueForEach operation
    */
   function* transformContinueStatement(
     stmt: ContinueStatement,
     scope?: ScopeContext
   ): Effect.Effect<OperationConfigIR[], TransformError> {
     return [{
       systemName: 'continueForEach',
       operationData: {}
     }];
   }
   ```
3. Save file

**Acceptance**:
- [x] Function created with correct signature
- [x] Returns single operation with `systemName: 'continueForEach'`
- [x] Empty `operationData` (no parameters)
- [x] JSDoc documentation present

**Estimated Time**: 5 minutes

---

### T011: [US1] Update transformOperationStatement Dispatcher
**Type**: Implementation
**File**: `packages/language/src/compiler/ast-transformer.ts`
**Story**: US1
**Description**: Add cases for new statement types in dispatcher
**Steps**:
1. Find `transformOperationStatement` function in `ast-transformer.ts`
2. Locate the type dispatch logic (checking `isIfStatement`, `isForStatement`, etc.)
3. Add cases for break and continue BEFORE the final `isOperationCall` check:
   ```typescript
   function* transformOperationStatement(
     stmt: OperationStatement,
     scope?: ScopeContext
   ): Effect.Effect<OperationConfigIR[], TransformError> {
     if (isIfStatement(stmt)) {
       return yield* _(transformIfStatement(stmt, scope));
     }

     if (isForStatement(stmt)) {
       return yield* _(transformForStatement(stmt, scope));
     }

     if (isVariableDeclaration(stmt)) {
       return yield* _(transformVariableDeclaration(stmt, scope));
     }

     // NEW: Handle break statement
     if (isBreakStatement(stmt)) {
       return yield* _(transformBreakStatement(stmt, scope));
     }

     // NEW: Handle continue statement
     if (isContinueStatement(stmt)) {
       return yield* _(transformContinueStatement(stmt, scope));
     }

     if (isOperationCall(stmt)) {
       return yield* _(transformOperationCall(stmt, scope));
     }

     // ... existing error handling
   }
   ```
4. Save file

**Acceptance**:
- [x] Break statement dispatch added
- [x] Continue statement dispatch added
- [x] Cases added before `isOperationCall` check
- [x] Both use correct transformer functions

**Estimated Time**: 5 minutes

---

### T012: [US1] Add Transformer Test for Break Statement [P]
**Type**: Test
**File**: `packages/language/src/compiler/__tests__/transformer.spec.ts`
**Story**: US1
**Description**: Verify break transforms to breakForEach operation
**Steps**:
1. Open `packages/language/src/compiler/__tests__/transformer.spec.ts`
2. Add new test suite:
   ```typescript
   describe('Break and Continue Transformation', () => {
     test('should transform break to breakForEach operation', async () => {
       const code = `
         timeline "test" using raf {
           at 0s..1s [
             for (item in ["a", "b", "c"]) {
               break
             }
           ] []
         }
       `;
       const program = await parseDSL(code);
       const result = await Effect.runPromise(transformAST(program));

       const operations = result.config.timelines[0].timelineActions[0].startOperations;
       const breakOp = operations.find(op => op.systemName === 'breakForEach');

       expect(breakOp).toBeDefined();
       expect(breakOp?.operationData).toEqual({});
     });
   });
   ```
3. Save file
4. Run test: `npm test -- transformer.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] `breakForEach` operation found in output
- [x] Operation has empty `operationData`

**Estimated Time**: 10 minutes

---

### T013: [US1] Add Transformer Test for Continue Statement [P]
**Type**: Test
**File**: `packages/language/src/compiler/__tests__/transformer.spec.ts`
**Story**: US1
**Description**: Verify continue transforms to continueForEach operation
**Steps**:
1. In same test suite from T012
2. Add test:
   ```typescript
   test('should transform continue to continueForEach operation', async () => {
     const code = `
       timeline "test" using raf {
         at 0s..1s [
           for (item in ["a", "b", "c"]) {
             continue
           }
         ] []
       }
     `;
     const program = await parseDSL(code);
     const result = await Effect.runPromise(transformAST(program));

     const operations = result.config.timelines[0].timelineActions[0].startOperations;
     const continueOp = operations.find(op => op.systemName === 'continueForEach');

     expect(continueOp).toBeDefined();
     expect(continueOp?.operationData).toEqual({});
   });
   ```
3. Save file
4. Run test: `npm test -- transformer.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] `continueForEach` operation found in output
- [x] Operation has empty `operationData`

**Estimated Time**: 5 minutes

---

### T014: [US1] Add Transformer Test for Conditional Usage [P]
**Type**: Test
**File**: `packages/language/src/compiler/__tests__/transformer.spec.ts`
**Story**: US1
**Description**: Verify break/continue work inside conditionals
**Steps**:
1. In same test suite
2. Add test:
   ```typescript
   test('should transform conditional break and continue', async () => {
     const code = `
       timeline "test" using raf {
         at 0s..1s [
           for (item in ["a", "b", "c"]) {
             if (@@currentItem == "a") {
               continue
             }
             if (@@currentItem == "c") {
               break
             }
           }
         ] []
       }
     `;
     const program = await parseDSL(code);
     const result = await Effect.runPromise(transformAST(program));

     const operations = result.config.timelines[0].timelineActions[0].startOperations;

     expect(operations.some(op => op.systemName === 'continueForEach')).toBe(true);
     expect(operations.some(op => op.systemName === 'breakForEach')).toBe(true);
     expect(operations.some(op => op.systemName === 'when')).toBe(true);
   });
   ```
3. Save file
4. Run test: `npm test -- transformer.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] Both operations present in output
- [x] Wrapped in `when`/`endWhen` operations (from if statements)

**Estimated Time**: 10 minutes

---

**✅ Checkpoint: US1 - Transformation Complete**
- Break/continue transform to correct operations
- Transformer tests pass
- All parsing and transformation working

---

## Phase 4: Validation (US2 - Compile-Time Validation)

**Goal**: Add validation to catch incorrect usage (break/continue outside loops)

**User Story**: US2 - Compile-Time Validation
**Test Criteria**: Errors shown in editor and compiler when keywords used outside loops

---

### T015: [US2] Add isInsideForLoop Helper Function
**Type**: Implementation
**File**: `packages/language/src/eligian-validator.ts`
**Story**: US2
**Description**: Helper to check if a node is inside a ForStatement
**Steps**:
1. Open `packages/language/src/eligian-validator.ts`
2. Import necessary types at top:
   ```typescript
   import { AstUtils } from 'langium';
   import {
     // ... existing imports
     isForStatement,
     isBreakStatement,
     isContinueStatement,
     type BreakStatement,
     type ContinueStatement,
   } from './generated/ast.js';
   ```
3. Add helper function (private method in validator class):
   ```typescript
   /**
    * Check if a node is inside a ForStatement.
    *
    * Walks up the AST tree to find a containing ForStatement.
    *
    * @param node - AST node to check
    * @returns true if node is inside a for loop, false otherwise
    */
   private isInsideForLoop(node: AstNode): boolean {
     let current = node.$container;
     while (current) {
       if (isForStatement(current)) {
         return true;
       }
       current = current.$container;
     }
     return false;
   }
   ```
4. Save file

**Acceptance**:
- [x] Helper function created
- [x] Uses Langium's `$container` for AST traversal
- [x] Returns boolean indicating loop context
- [x] JSDoc documentation present

**Estimated Time**: 10 minutes

---

### T016: [US2] Add checkBreakStatement Validator
**Type**: Implementation
**File**: `packages/language/src/eligian-validator.ts`
**Story**: US2
**Description**: Validate break only appears inside loops
**Steps**:
1. In `eligian-validator.ts`
2. Add validator method to `EligianValidator` class:
   ```typescript
   /**
    * Validate that break statement appears inside a loop.
    *
    * Error if statement is not inside a ForStatement.
    *
    * @param stmt - BreakStatement to validate
    * @param accept - Langium validation acceptor
    */
   @check
   checkBreakStatement(stmt: BreakStatement, accept: ValidationAcceptor): void {
     if (!this.isInsideForLoop(stmt)) {
       accept('error',
         "'break' can only be used inside a loop",
         { node: stmt }
       );
     }
   }
   ```
3. Save file

**Acceptance**:
- [x] Validator method created with `@check` decorator
- [x] Uses `isInsideForLoop` helper
- [x] Error message is clear and actionable
- [x] Correct signature for Langium validator

**Estimated Time**: 5 minutes

---

### T017: [US2] Add checkContinueStatement Validator
**Type**: Implementation
**File**: `packages/language/src/eligian-validator.ts`
**Story**: US2
**Description**: Validate continue only appears inside loops
**Steps**:
1. In same file (`eligian-validator.ts`)
2. Add validator method after `checkBreakStatement`:
   ```typescript
   /**
    * Validate that continue statement appears inside a loop.
    *
    * Error if statement is not inside a ForStatement.
    *
    * @param stmt - ContinueStatement to validate
    * @param accept - Langium validation acceptor
    */
   @check
   checkContinueStatement(stmt: ContinueStatement, accept: ValidationAcceptor): void {
     if (!this.isInsideForLoop(stmt)) {
       accept('error',
         "'continue' can only be used inside a loop",
         { node: stmt }
       );
     }
   }
   ```
3. Save file

**Acceptance**:
- [x] Validator method created with `@check` decorator
- [x] Uses `isInsideForLoop` helper
- [x] Error message is clear and actionable
- [x] Consistent with `checkBreakStatement`

**Estimated Time**: 5 minutes

---

### T018: [US2] Add Validation Test for Break Outside Loop [P]
**Type**: Test
**File**: `packages/language/src/__tests__/validation.spec.ts`
**Story**: US2
**Description**: Verify error when break used outside loop
**Steps**:
1. Open `packages/language/src/__tests__/validation.spec.ts`
2. Add new test suite:
   ```typescript
   describe('Break and Continue Validation', () => {
     test('should error on break outside loop', async () => {
       const code = `
         action demo [
           break
         ]
       `;
       const result = await parseHelper.parse(code);
       const validationErrors = await validationHelper.validate(result);

       expect(validationErrors).toContainEqual(
         expect.objectContaining({
           message: expect.stringContaining('break can only be used inside a loop'),
           severity: 'error'
         })
       );
     });
   });
   ```
3. Save file
4. Run test: `npm test -- validation.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] Error message contains expected text
- [x] Severity is 'error' (not warning)

**Estimated Time**: 10 minutes

---

### T019: [US2] Add Validation Test for Continue Outside Loop [P]
**Type**: Test
**File**: `packages/language/src/__tests__/validation.spec.ts`
**Story**: US2
**Description**: Verify error when continue used outside loop
**Steps**:
1. In same test suite from T018
2. Add test:
   ```typescript
   test('should error on continue outside loop', async () => {
     const code = `
       action demo [
         continue
       ]
     `;
     const result = await parseHelper.parse(code);
     const validationErrors = await validationHelper.validate(result);

     expect(validationErrors).toContainEqual(
       expect.objectContaining({
         message: expect.stringContaining('continue can only be used inside a loop'),
         severity: 'error'
       })
     );
   });
   ```
3. Save file
4. Run test: `npm test -- validation.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] Error message contains expected text
- [x] Severity is 'error'

**Estimated Time**: 5 minutes

---

### T020: [US2] Add Validation Test for Valid Usage Inside Loop [P]
**Type**: Test
**File**: `packages/language/src/__tests__/validation.spec.ts`
**Story**: US2
**Description**: Verify no error when keywords used correctly
**Steps**:
1. In same test suite
2. Add test:
   ```typescript
   test('should allow break and continue inside loop', async () => {
     const code = `
       action demo [
         for (item in items) {
           if (@@currentItem.skip) {
             continue
           }
           if (@@currentItem.stop) {
             break
           }
         }
       ]
     `;
     const result = await parseHelper.parse(code);
     const validationErrors = await validationHelper.validate(result);

     // Should have no errors
     expect(validationErrors).toHaveLength(0);
   });
   ```
3. Save file
4. Run test: `npm test -- validation.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] No validation errors for valid usage
- [x] Both keywords work inside loop

**Estimated Time**: 5 minutes

---

### T021: [US2] Add Validation Test for Nested Loops [P]
**Type**: Test
**File**: `packages/language/src/__tests__/validation.spec.ts`
**Story**: US2
**Description**: Verify validation works with nested loops
**Steps**:
1. In same test suite
2. Add test:
   ```typescript
   test('should allow break/continue in nested loops', async () => {
     const code = `
       action demo [
         for (outer in outerItems) {
           for (inner in innerItems) {
             if (@@currentItem.skipInner) {
               continue
             }
             if (@@currentItem.stopInner) {
               break
             }
           }
         }
       ]
     `;
     const result = await parseHelper.parse(code);
     const validationErrors = await validationHelper.validate(result);

     expect(validationErrors).toHaveLength(0);
   });
   ```
3. Save file
4. Run test: `npm test -- validation.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] No errors in nested loop context
- [x] Validation correctly identifies inner loop

**Estimated Time**: 5 minutes

---

**✅ Checkpoint: US2 - Validation Complete**
- Validators implemented for both statements
- Error detection working correctly
- All validation tests pass

---

## Phase 5: Integration & Backwards Compatibility (US3 - Mixed Syntax)

**Goal**: Verify full pipeline and backwards compatibility with explicit operations

**User Story**: US3 - Mixed Syntax Support
**Test Criteria**: Both new keywords and old operations work, can coexist in same code

---

### T022: [US3] Add Pipeline Integration Test for Break [P]
**Type**: Test
**File**: `packages/language/src/compiler/__tests__/pipeline.spec.ts`
**Story**: US3
**Description**: Verify full compilation pipeline with break
**Steps**:
1. Open `packages/language/src/compiler/__tests__/pipeline.spec.ts`
2. Add new test suite:
   ```typescript
   describe('Break and Continue Pipeline Integration', () => {
     test('should compile DSL with break to valid Eligius JSON', async () => {
       const code = `
         timeline "test" using raf {
           at 0s..1s [
             for (item in ["a", "b", "c"]) {
               selectElement(@@currentItem)
               if (@@currentItem == "c") {
                 break
               }
             }
           ] []
         }
       `;
       const result = await Effect.runPromise(
         compile(code).pipe(Effect.provide(testLayer))
       );

       expect(result.config.timelines[0].timelineActions).toHaveLength(1);
       const operations = result.config.timelines[0].timelineActions[0].startOperations;
       expect(operations.some(op => op.systemName === 'breakForEach')).toBe(true);
     });
   });
   ```
3. Save file
4. Run test: `npm test -- pipeline.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] Full compilation succeeds
- [x] Valid Eligius JSON produced

**Estimated Time**: 10 minutes

---

### T023: [US3] Add Pipeline Integration Test for Continue [P]
**Type**: Test
**File**: `packages/language/src/compiler/__tests__/pipeline.spec.ts`
**Story**: US3
**Description**: Verify full compilation pipeline with continue
**Steps**:
1. In same test suite from T022
2. Add test:
   ```typescript
   test('should compile DSL with continue to valid Eligius JSON', async () => {
     const code = `
       timeline "test" using raf {
         at 0s..1s [
           for (item in ["a", "b", "c"]) {
             if (@@currentItem == "a") {
               continue
             }
             selectElement(@@currentItem)
           }
         ] []
       }
     `;
     const result = await Effect.runPromise(
       compile(code).pipe(Effect.provide(testLayer))
     );

     expect(result.config.timelines[0].timelineActions).toHaveLength(1);
     const operations = result.config.timelines[0].timelineActions[0].startOperations;
     expect(operations.some(op => op.systemName === 'continueForEach')).toBe(true);
   });
   ```
3. Save file
4. Run test: `npm test -- pipeline.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] Full compilation succeeds
- [x] Valid Eligius JSON produced

**Estimated Time**: 5 minutes

---

### T024: [US3] Add Mixed Syntax Test (New + Old) [P]
**Type**: Test
**File**: `packages/language/src/compiler/__tests__/pipeline.spec.ts`
**Story**: US3
**Description**: Verify new keywords coexist with old operation calls
**Steps**:
1. In same test suite
2. Add test:
   ```typescript
   test('should support both keywords and explicit operations', async () => {
     const code = `
       timeline "test" using raf {
         at 0s..1s [
           for (item in ["a", "b", "c", "d"]) {
             if (@@currentItem == "a") {
               continueForEach()  // Old style
             }
             if (@@currentItem == "b") {
               continue  // New style
             }
             if (@@currentItem == "c") {
               breakForEach()  // Old style
             }
             if (@@currentItem == "d") {
               break  // New style
             }
           }
         ] []
       }
     `;
     const result = await Effect.runPromise(
       compile(code).pipe(Effect.provide(testLayer))
     );

     const operations = result.config.timelines[0].timelineActions[0].startOperations;

     // Should have 2 continue operations (one from keyword, one from call)
     const continueOps = operations.filter(op => op.systemName === 'continueForEach');
     expect(continueOps.length).toBeGreaterThanOrEqual(2);

     // Should have 2 break operations (one from keyword, one from call)
     const breakOps = operations.filter(op => op.systemName === 'breakForEach');
     expect(breakOps.length).toBeGreaterThanOrEqual(2);
   });
   ```
3. Save file
4. Run test: `npm test -- pipeline.spec.ts`

**Acceptance**:
- [x] Test passes
- [x] Both syntax styles produce operations
- [x] No conflicts between old and new syntax

**Estimated Time**: 10 minutes

---

**✅ Checkpoint: US3 - Integration Complete**
- Full pipeline working
- Mixed syntax supported
- All user stories implemented

---

## Phase 6: Documentation & Examples

**Goal**: Document new syntax and provide examples

---

### T025: Create Loop Control Example File
**Type**: Documentation
**File**: `examples/loop-control-demo.eligian`
**Story**: Documentation
**Description**: Create example file demonstrating break and continue usage
**Steps**:
1. Create `examples/loop-control-demo.eligian`
2. Add comprehensive examples:
   ```eligian
   /**
    * Loop Control Example
    *
    * Demonstrates break and continue keywords for loop control
    */

   // Example 1: Skip invalid items with continue
   action processValidItems [
     for (item in $operationdata.items) {
       if (@@currentItem.invalid) {
         continue  // Skip invalid items
       }

       selectElement(@@currentItem.selector)
       addClass("processed")
     }
   ]

   // Example 2: Early exit with break
   action findFirstMatch [
     for (item in $operationdata.items) {
       if (@@currentItem.matches) {
         selectElement(@@currentItem.selector)
         break  // Stop after first match
       }
     }
   ]

   // Example 3: Combined usage
   action conditionalProcessing [
     for (item in $operationdata.items) {
       if (@@currentItem.skip) {
         continue  // Skip this iteration
       }

       if (@@currentItem.error) {
         break  // Exit loop on error
       }

       selectElement(@@currentItem.selector)
       addClass("active")
     }
   ]

   // Example 4: Backwards compatibility - both styles work
   action mixedSyntax [
     for (item in $operationdata.items) {
       if (@@currentItem.useOldStyle) {
         continueForEach()  // Old explicit operation call
       }

       if (@@currentItem.useNewStyle) {
         continue  // New keyword syntax
       }

       selectElement(@@currentItem.selector)
     }
   ]

   timeline "demo" using raf {
     at 0s..5s with processValidItems() []
     at 5s..10s with findFirstMatch() []
     at 10s..15s with conditionalProcessing() []
   }
   ```
3. Save file

**Acceptance**:
- [x] Example file created with multiple use cases
- [x] Comments explain each example
- [x] Both keywords demonstrated
- [x] Backwards compatibility shown

**Estimated Time**: 15 minutes

---

### T026: Update CLAUDE.md with New Syntax Patterns
**Type**: Documentation
**File**: `CLAUDE.md`
**Story**: Documentation
**Description**: Document break/continue syntax in project guide
**Steps**:
1. Open `CLAUDE.md`
2. Find the DSL syntax section (search for "Eligian DSL" or "Language Name")
3. Add new section after for-loop documentation:
   ```markdown
   ### Loop Control Statements

   **Break and Continue**: Control loop execution with familiar keywords

   ```eligian
   // Break - Exit loop immediately
   for (item in items) {
     if (@@currentItem.shouldStop) {
       break  // Exit loop
     }
     processItem(@@currentItem)
   }

   // Continue - Skip to next iteration
   for (item in items) {
     if (@@currentItem.shouldSkip) {
       continue  // Skip this iteration
     }
     processItem(@@currentItem)
   }
   ```

   **Generated Operations**:
   - `break` → `breakForEach()` operation
   - `continue` → `continueForEach()` operation

   **Validation**:
   - ✅ Must be used inside a `for` loop
   - ❌ Error if used outside a loop (compile-time error + editor red squiggly)

   **Backwards Compatibility**:
   - Explicit operation calls still work: `breakForEach()`, `continueForEach()`
   - Both styles can coexist in the same code
   ```
4. Save file

**Acceptance**:
- [x] Documentation added to CLAUDE.md
- [x] Examples show both keywords
- [x] Validation rules documented
- [x] Backwards compatibility noted

**Estimated Time**: 10 minutes

---

### T027: Verify All Existing Tests Pass
**Type**: Verification
**Command**: `npm test`
**Story**: Quality Assurance
**Description**: Ensure no regressions in existing functionality
**Steps**:
1. Run full test suite: `npm test` from `packages/language` directory
2. Verify all tests pass (should be 300+ tests)
3. Check for any unexpected failures
4. If failures occur:
   - Review failure details
   - Determine if caused by new changes
   - Fix any issues before proceeding

**Acceptance**:
- [x] All existing tests pass
- [x] New tests pass (20+ new tests added)
- [x] No regressions introduced
- [x] Total test count increased appropriately

**Estimated Time**: 5 minutes

---

### T028: Run Biome Code Quality Checks
**Type**: Quality Assurance
**Command**: `npm run check`
**Story**: Quality Assurance
**Description**: Ensure code quality standards met (Constitution Principle XI)
**Steps**:
1. Run Biome: `npm run check` from root directory
2. Review output for errors or warnings
3. If issues found:
   - Fix formatting issues (auto-fixed by Biome)
   - Fix linting errors (unused imports, etc.)
   - Update `biome.json` only if false positives (with justification)
4. Re-run until clean: `npm run check` shows "0 errors, 0 warnings"

**Acceptance**:
- [x] Biome checks pass (0 errors, 0 warnings)
- [x] All files properly formatted
- [x] No linting issues remain
- [x] ESM imports use `.js` extensions (Constitution Principle IX)

**Estimated Time**: 10 minutes

---

**✅ Checkpoint: Documentation and Quality Complete**
- Examples created and documented
- Code quality verified
- All tests passing

---

## Phase 7: Final Verification

**Goal**: Comprehensive verification before considering feature complete

---

### T029: Manual VS Code Integration Testing
**Type**: Manual Test
**Environment**: VS Code with Eligian extension
**Story**: Quality Assurance
**Description**: Verify language server provides real-time feedback
**Steps**:
1. Open VS Code with Eligian extension loaded
2. Create test file: `test-break-continue.eligian`
3. Test parsing:
   ```eligian
   action test [
     for (item in items) {
       break
     }
   ]
   ```
   - Verify no red squiggles
   - Verify autocomplete suggests `break` and `continue`
4. Test validation:
   ```eligian
   action test [
     break  // Should show error
   ]
   ```
   - Verify red squiggle appears under `break`
   - Hover over `break` - verify error message appears
   - Check Problems panel - verify error listed
5. Test both keywords:
   ```eligian
   action test [
     continue  // Should show error
   ]
   ```
   - Verify same error behavior as break
6. Delete test file

**Acceptance**:
- [x] Keywords parse without errors inside loops
- [x] Red squiggles appear for invalid usage
- [x] Error messages clear and actionable
- [x] Problems panel shows errors correctly
- [x] Hover tooltips work

**Estimated Time**: 15 minutes

---

### T030: Verify Generated JSON Correctness
**Type**: Verification
**File**: Manual compilation test
**Story**: Quality Assurance
**Description**: Verify generated Eligius JSON is correct and executable
**Steps**:
1. Create test DSL file with break/continue
2. Compile using CLI or programmatic API
3. Inspect generated JSON:
   - Find `breakForEach` operations
   - Find `continueForEach` operations
   - Verify `operationData` is empty object `{}`
   - Verify operations positioned correctly in sequence
4. (Optional) If Eligius runtime available, execute JSON and verify behavior

**Acceptance**:
- [x] JSON structure matches Eligius format
- [x] Operations correctly positioned
- [x] No extraneous properties
- [x] Valid JSON (parseable)

**Estimated Time**: 10 minutes

---

### T031: Update Feature Plan Status
**Type**: Documentation
**File**: `specs/main/plan.md`
**Story**: Documentation
**Description**: Mark feature as complete in plan
**Steps**:
1. Open `specs/main/plan.md`
2. Update "Plan Status" at bottom to "✅ IMPLEMENTED"
3. Update success criteria checkboxes (all should be checked)
4. Add implementation notes section:
   ```markdown
   ## Implementation Notes

   **Completed**: 2025-10-18
   **Tasks Completed**: 31
   **Tests Added**: ~20
   **Files Modified**: 6
   - eligian.langium (grammar)
   - generated/ast.ts (auto-generated)
   - ast-transformer.ts (transformation)
   - eligian-validator.ts (validation)
   - parsing.spec.ts (tests)
   - validation.spec.ts (tests)
   - transformer.spec.ts (tests)
   - pipeline.spec.ts (tests)

   **Total Test Count**: 320+ (was 300)

   **Key Learnings**:
   - Simple grammar changes have ripple effects (generation, transformation, validation)
   - Langium validation runs in language server (provides real-time editor feedback)
   - Mixed syntax support requires no additional work (both styles compile the same way)
   ```
5. Save file

**Acceptance**:
- [x] Plan marked as implemented
- [x] Success criteria updated
- [x] Implementation notes added

**Estimated Time**: 5 minutes

---

**✅ Final Checkpoint: Feature Complete**
- All user stories implemented
- All tests passing
- Documentation complete
- Code quality verified

---

## Summary

### Task Overview

| Phase | Tasks | Estimated Time | Status |
|-------|-------|----------------|--------|
| Phase 1: Setup | T001-T002 | 15 min | ⬜ Not Started |
| Phase 2: Grammar (US1) | T003-T008 | 30 min | ⬜ Not Started |
| Phase 3: Transformation (US1) | T009-T014 | 45 min | ⬜ Not Started |
| Phase 4: Validation (US2) | T015-T021 | 45 min | ⬜ Not Started |
| Phase 5: Integration (US3) | T022-T024 | 25 min | ⬜ Not Started |
| Phase 6: Documentation | T025-T028 | 45 min | ⬜ Not Started |
| Phase 7: Final Verification | T029-T031 | 30 min | ⬜ Not Started |
| **Total** | **31 tasks** | **~3 hours** | **⬜ Not Started** |

### Parallelization Opportunities

Tasks marked [P] can be run in parallel within their phase:

**Phase 2 (Parsing Tests)**: T006, T007, T008 (3 parallel)
**Phase 3 (Transformer Tests)**: T012, T013, T014 (3 parallel)
**Phase 4 (Validation Tests)**: T018, T019, T020, T021 (4 parallel)
**Phase 5 (Integration Tests)**: T022, T023, T024 (3 parallel)

**Total Parallel Opportunities**: 13 tasks can run in parallel

### Dependencies

```
T001 → T002 → [Grammar Phase]
T003 → T005 (grammar → regenerate)
T004 → T005 (grammar → regenerate)
T005 → T006, T007, T008 (regenerate → tests)

T009 → T011 (function → dispatcher)
T010 → T011 (function → dispatcher)
T011 → T012, T013, T014 (dispatcher → tests)

T015 → T016, T017 (helper → validators)
T016 → T018 (validator → test)
T017 → T019 (validator → test)

T022, T023, T024 → T027 (integration tests → full test run)
T027 → T028 (tests pass → code quality)
T028 → T029, T030 (quality → manual verification)
```

### File Modifications

| File | Tasks | Type |
|------|-------|------|
| `eligian.langium` | T003, T004 | Grammar Extension |
| `generated/ast.ts` | T005 | Auto-Generated |
| `ast-transformer.ts` | T009, T010, T011 | Transformation |
| `eligian-validator.ts` | T015, T016, T017 | Validation |
| `parsing.spec.ts` | T006, T007, T008 | Tests |
| `validation.spec.ts` | T018, T019, T020, T021 | Tests |
| `transformer.spec.ts` | T012, T013, T014 | Tests |
| `pipeline.spec.ts` | T022, T023, T024 | Tests |
| `loop-control-demo.eligian` | T025 | Example |
| `CLAUDE.md` | T026 | Documentation |
| `plan.md` | T031 | Documentation |

### Success Criteria per User Story

**US1 - Clean Loop Control Syntax**:
- ✅ `break` and `continue` keywords parse correctly
- ✅ Transform to `breakForEach`/`continueForEach` operations
- ✅ Generated JSON is valid Eligius format
- ✅ Tests: T006, T007, T008, T012, T013, T014

**US2 - Compile-Time Validation**:
- ✅ Errors shown when keywords used outside loops
- ✅ Errors appear in editor (red squiggles)
- ✅ Errors appear in compiler output
- ✅ Tests: T018, T019, T020, T021

**US3 - Mixed Syntax Support**:
- ✅ Old operation calls still work
- ✅ New keywords work
- ✅ Both can coexist in same code
- ✅ Tests: T024

### Next Steps

1. **Start Implementation**: Begin with Phase 1 (Setup)
2. **Follow Task Order**: Complete tasks sequentially unless marked [P]
3. **Run Tests Frequently**: After each phase, verify tests pass
4. **Commit After Phases**: Create logical commit after each checkpoint
5. **Final Verification**: Complete Phase 7 before considering feature done

---

**Questions or Issues?** Refer to:
- Feature Spec: `specs/main/spec.md`
- Implementation Plan: `specs/main/plan.md`
- Project Constitution: `.specify/memory/constitution.md`
- Project Guide: `CLAUDE.md`
