# Quickstart: Test Coverage Improvement

**Feature**: Test Coverage Improvement
**Date**: 2025-01-23
**Branch**: `004-test-coverage-improvement`

## Overview

This guide walks through fixing failing tests and achieving 80% coverage threshold for business logic.

## Prerequisites

- Node.js 22+ installed
- pnpm package manager
- Feature branch checked out: `004-test-coverage-improvement`
- All dependencies installed: `pnpm install`

## Step-by-Step Implementation

### Step 1: Assess Current Test Status

**Goal**: Understand what tests are failing and why.

```bash
# Run all tests
npm run test

# Expected: Some tests may be failing
# Note: Record failure count and error messages
```

**Analysis Checklist**:
- [ ] How many tests are failing?
- [ ] Are failures related to grammar/syntax changes?
- [ ] Are failures due to implementation bugs?
- [ ] Are failures due to import/environment issues?

### Step 2: Fix Failing Tests

**Goal**: Get all existing tests to pass (0 failures).

**For Grammar-Related Failures**:

1. Compare test expectations with current grammar (`packages/language/src/eligian.langium`)
2. Update test fixtures to match current DSL syntax
3. Example:
   ```typescript
   // Old test expectation
   const source = `action test [doSomething()]`;

   // If grammar changed, update to new syntax
   const source = `action test [ doSomething() ]`; // Added spaces
   ```

**For Implementation Bug Failures**:

1. Identify what the test expects
2. Verify the test documents correct behavior
3. Fix implementation to match test expectations
4. Do NOT change tests unless they document incorrect behavior

**For Import/Environment Failures**:

1. Ensure all imports use `.js` extensions (Constitution Principle IX)
2. Verify ESM compatibility
3. Example fix:
   ```typescript
   // Bad
   import { foo } from './bar';

   // Good
   import { foo } from './bar.js';
   ```

**Verify**:
```bash
npm run test
# Expected: 0 failures, all tests pass
```

### Step 3: Generate Coverage Baseline

**Goal**: Identify which files need additional tests.

```bash
# Run tests with coverage reporting
npm run test:coverage

# Expected: Coverage report generated, HTML report opens
# Location: coverage/index.html
```

**Analysis**:
1. Open `coverage/index.html` in browser
2. Navigate to `packages/language/src/` directory
3. Look for files with <80% coverage (red background)
4. Create prioritized list:
   - Priority 1: Core compilation (transformer, validator)
   - Priority 2: Type system
   - Priority 3: Helper utilities

**Document Findings**:
```
Files Below 80% Threshold:
1. packages/language/src/eligian-validator.ts - 65% coverage
2. packages/language/src/type-system/inference.ts - 72% coverage
3. packages/compiler/src/ast-transformer.ts - 78% coverage
```

### Step 4: Add Tests for Uncovered Code Paths

**Goal**: Write unit tests to cover untested code paths.

**Process** (repeat for each file below threshold):

1. **Read Source File**: Identify uncovered lines (red in coverage report)

2. **Categorize Uncovered Code**:
   - Missing test cases
   - Edge cases not tested
   - Error handling paths
   - Defensive programming (potentially unreachable)

3. **Write Unit Tests**:
   ```typescript
   // Example: Testing validation error path
   describe('EligianValidator', () => {
     it('should report error for unknown operation', async () => {
       const source = `
         action test [
           unknownOperation()
         ]
       `;
       const model = await parse(source);
       const diagnostics = await validate(model);

       expect(diagnostics).toHaveLength(1);
       expect(diagnostics[0].message).toContain('Unknown operation');
       expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
     });
   });
   ```

4. **Run Tests and Verify**:
   ```bash
   npm run test -- --coverage
   # Check if coverage improved for the file
   ```

5. **Repeat Until Threshold Met**:
   - Add tests for remaining uncovered lines
   - Aim for 80%+ coverage (all four metrics)
   - Don't aim for 100% (diminishing returns)

**Test Writing Tips**:
- One test per code path
- Use descriptive test names (Given-When-Then)
- Keep tests focused and minimal
- Reuse existing test helpers and fixtures
- Follow existing test patterns in the codebase

### Step 5: Document Coverage Exceptions

**Goal**: Document any code that legitimately cannot reach 80% coverage.

**When to Document Exception**:
- Unreachable error handlers (defensive programming)
- Generated code branches
- Fallback paths guaranteed by library APIs

**Exception Documentation Process**:

1. **Add Code Comment**:
   ```typescript
   // Coverage exception: This error handler is unreachable because Langium
   // parser guarantees all nodes have a $type property. Kept for defensive
   // programming and future-proofing against Langium API changes.
   if (!node.$type) {
     throw new Error('Node missing $type');
   }
   ```

2. **Document in Spec** (`specs/004-test-coverage-improvement/spec.md`):
   ```markdown
   ## Coverage Exceptions

   - **File**: packages/language/src/eligian-validator.ts
   - **Reason**: Lines 145-148 handle impossible state (Langium guarantees)
   - **Approval**: [WAIT FOR USER APPROVAL]
   ```

3. **Request User Approval**:
   - Present findings to user
   - Explain why coverage is impossible
   - Wait for explicit approval per Constitution Principle II
   - Only proceed after approval

### Step 6: Final Verification

**Goal**: Confirm all requirements are met.

```bash
# Run full test suite
npm run test
# Expected: 0 failures

# Run coverage report
npm run test:coverage
# Expected: All business logic files >= 80% (or documented exceptions approved)

# Run code quality checks
npm run check && npm run typecheck
# Expected: 0 errors
```

**Verification Checklist**:
- [ ] All tests pass (0 failures)
- [ ] All business logic files >= 80% coverage
- [ ] Coverage report generated successfully
- [ ] Coverage exceptions documented and approved
- [ ] Biome checks pass
- [ ] TypeScript type checks pass
- [ ] Test suite completes in <2 minutes
- [ ] Coverage report generates in <30 seconds

### Step 7: Commit Changes

**Goal**: Commit test additions following constitutional guidelines.

```bash
# Stage all test files
git add packages/language/src/__tests__/**/*.spec.ts
git add packages/compiler/src/__tests__/**/*.spec.ts

# Commit with descriptive message
git commit -m "test: improve coverage to 80% threshold

- Fix all failing unit tests (grammar expectations updated)
- Add tests for uncovered code paths in validator, transformer, type system
- Document coverage exceptions for defensive programming paths
- Achieve 80% coverage for statements, branches, functions, lines

Coverage improvements:
- eligian-validator.ts: 65% → 82%
- type-system/inference.ts: 72% → 85%
- ast-transformer.ts: 78% → 83%

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to feature branch
git push -u origin 004-test-coverage-improvement
```

## Common Issues & Solutions

### Issue 1: Tests Still Failing After Fixes

**Symptom**: Tests fail even after updating expectations.

**Solution**:
- Clear Vitest cache: `npx vitest clear`
- Rebuild project: `npm run build`
- Re-run tests: `npm run test`

### Issue 2: Coverage Report Not Excluding Generated Files

**Symptom**: Generated files showing in coverage report.

**Solution**:
- Check `vitest.config.ts` exclusion patterns
- Verify generated files match exclusion globs
- Update configuration if needed

### Issue 3: Cannot Reach 80% Coverage for a File

**Symptom**: File has unreachable code paths.

**Solution**:
- Document exception in code comments
- Explain why code is unreachable
- Request user approval per Constitution Principle II
- Do NOT proceed without approval

### Issue 4: Test Suite Runs Too Slowly

**Symptom**: Tests take >2 minutes.

**Solution**:
- Review test efficiency (avoid unnecessary async operations)
- Use `test.concurrent` for independent tests
- Consider splitting large test files
- Profile with `npm run test -- --reporter=verbose`

## Success Criteria

✅ All tests pass (0 failures)
✅ All business logic >= 80% coverage
✅ Coverage report generated in <30 seconds
✅ Test suite completes in <2 minutes
✅ All code quality checks pass
✅ Coverage exceptions documented and approved

## Next Steps

After completing this quickstart:

1. Create pull request:
   ```bash
   gh pr create --title "Test coverage improvement: achieve 80% threshold" \
     --body "Fixes all failing tests and adds coverage to meet constitutional requirements"
   ```

2. Request code review
3. Address reviewer feedback
4. Merge after approval

## References

- Feature Spec: [spec.md](./spec.md)
- Implementation Plan: [plan.md](./plan.md)
- Research Findings: [research.md](./research.md)
- Constitution: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) (Principle II)
