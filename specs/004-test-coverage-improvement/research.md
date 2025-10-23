# Research: Test Coverage Improvement

**Feature**: Test Coverage Improvement
**Date**: 2025-01-23
**Status**: Complete

## Research Questions

### Q1: Current Test Failure Root Causes

**Question**: Why are existing tests failing?

**Investigation**:
- Need to run `npm run test` and analyze failure patterns
- Common causes in DSL projects:
  - Grammar updates without test updates
  - Validation rule changes
  - Breaking changes in Langium framework
  - ESM import resolution issues

**Decision**: Categorize failures into three types:

1. **Outdated Grammar Expectations**: Tests expect old DSL syntax that has evolved
   - **Fix**: Update test fixtures to match current grammar
   - **Verify**: Compare failing test expectations with current `eligian.langium` grammar

2. **Implementation Bugs**: Code doesn't match test expectations
   - **Fix**: Fix the implementation to match test requirements
   - **Verify**: Ensure tests document correct behavior

3. **Environment Issues**: Node.js version, ESM imports, path resolution
   - **Fix**: Update imports to use `.js` extensions (Constitution Principle IX)
   - **Verify**: Ensure all imports follow ESM standards

**Alternatives Considered**:
- Delete failing tests → **Rejected**: Tests document expected behavior, losing them loses documentation
- Rewrite entire test suite → **Rejected**: Out of scope, too risky

---

### Q2: Coverage Reporting Configuration

**Question**: Is Vitest coverage properly configured to exclude generated files and meet thresholds?

**Investigation**:
- Check `vitest.config.ts` for coverage configuration
- Verify exclusion patterns for:
  - `**/*.generated.ts` (operation registry)
  - `**/__tests__/**` (test files themselves)
  - `**/generated/**` (Langium-generated parsers)
  - `**/*.spec.ts` (test files)

**Decision**: Ensure Vitest configuration includes:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'json'],
  exclude: [
    '**/*.generated.ts',
    '**/__tests__/**',
    '**/generated/**',
    '**/*.spec.ts',
    '**/node_modules/**',
    '**/*.config.ts'
  ],
  thresholds: {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80
  }
}
```

**Rationale**:
- v8 provider is fast and accurate
- Multiple reporters (text for CLI, html for detailed analysis)
- Exclusions prevent inflated coverage from generated code
- Thresholds enforce Constitutional Principle II (80% requirement)

**Alternatives Considered**:
- Use c8 directly → **Rejected**: Vitest's built-in coverage is sufficient and integrated
- Set lower thresholds → **Rejected**: Constitution mandates 80%

---

### Q3: Test Patterns for DSL Validation

**Question**: What patterns work best for testing Langium validators and grammar rules?

**Investigation**:
- Langium provides test utilities: `parseHelper`, `validationHelper`
- Best practices from Langium documentation (via context7)
- Existing test patterns in the codebase

**Decision**: Use Langium testing utilities pattern:

```typescript
import { parseHelper, validationHelper } from 'langium/test';
import { createEligianServices } from '../eligian-module';

describe('Eligian Validation', () => {
  const services = createEligianServices().Eligian;
  const parse = parseHelper<Model>(services);
  const validate = validationHelper<Model>(services);

  it('should validate operation existence', async () => {
    const model = await parse(`
      action test [
        unknownOperation()
      ]
    `);
    const diagnostics = await validate(model);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('Unknown operation');
  });
});
```

**Key Patterns**:
1. **parseHelper**: Parse DSL source into AST
2. **validationHelper**: Run validators and collect diagnostics
3. **Service creation**: Use project's service module
4. **Async testing**: Langium parsing is async
5. **Diagnostic assertions**: Check message content and location

**Alternatives Considered**:
- Mock Langium services → **Rejected**: Integration with real services is more reliable
- String-based assertions → **Rejected**: Typed AST assertions are more maintainable

---

### Q4: Unreachable Code Identification

**Question**: How to identify and document legitimately untestable code?

**Investigation**:
- Unreachable code examples:
  - Error handlers for "impossible" states (defensive programming)
  - Fallback branches that library APIs guarantee won't be reached
  - Generated code branches for completeness

**Decision**: Two-step process:

1. **Identify Unreachable Code**:
   - Run coverage report
   - Review uncovered lines
   - Categorize: truly unreachable vs missing tests

2. **Document Exceptions**:
   ```typescript
   // Coverage exception: This error handler is unreachable because Langium
   // parser guarantees all nodes have a $type property. Kept for defensive
   // programming and future-proofing.
   if (!node.$type) {
     throw new Error('Node missing $type');
   }
   ```

3. **Request User Approval**:
   - Per Constitution Principle II: document why coverage is impossible
   - Present to user with justification
   - Wait for approval before proceeding

**Alternatives Considered**:
- Ignore coverage for entire files → **Rejected**: Too coarse-grained, hides real gaps
- Use istanbul ignore comments → **Accepted for confirmed unreachable code**, but requires documentation

---

## Technology Decisions

### Test Framework: Vitest

**Rationale**:
- Already configured in the project
- Fast execution with intelligent watch mode
- Built-in coverage via v8
- ESM-native (matches project's ESM setup)
- Compatible with Langium test utilities

**Alternatives Considered**:
- Jest → **Rejected**: ESM support still immature, slower than Vitest
- Mocha + nyc → **Rejected**: More complex setup, less integrated

---

### Coverage Provider: @vitest/coverage-v8

**Rationale**:
- Included with Vitest
- Accurate statement, branch, function, and line coverage
- Fast execution
- Supports exclusion patterns

**Alternatives Considered**:
- c8 standalone → **Rejected**: Vitest integration is more seamless
- istanbul → **Rejected**: v8 is faster and more accurate

---

### Test Fixture Format: Inline Strings

**Rationale**:
- Tests are more readable with DSL source inline
- Easy to modify during test updates
- No file I/O overhead
- Keeps related code together

**Pattern**:
```typescript
const source = `
  action fadeIn(selector, duration) [
    selectElement(selector)
    animate({opacity: 1}, duration)
  ]
`;
const model = await parse(source);
```

**Alternatives Considered**:
- External `.eligian` fixture files → **Use only for complex multi-feature tests**
- Programmatic AST construction → **Rejected**: Defeats purpose of testing parser

---

## Implementation Strategy

### Phase 1: Fix Failing Tests

1. Run `npm run test`
2. Categorize failures by root cause
3. Fix grammar-related failures by updating test expectations
4. Fix bug-related failures by correcting implementation
5. Verify all tests pass

### Phase 2: Generate Coverage Baseline

1. Run `npm run test:coverage`
2. Review HTML report (opens automatically)
3. Identify files below 80% threshold
4. Create prioritized list (core compiler logic first)

### Phase 3: Add Missing Tests

For each file below threshold:

1. Read source code
2. Identify uncovered lines (red in coverage report)
3. Write unit tests covering those paths
4. Re-run coverage to verify improvement
5. Repeat until threshold met

### Phase 4: Document Exceptions

For any files that cannot reach 80%:

1. Document reason in code comments
2. Present to user with justification
3. Wait for approval per Constitution Principle II
4. Only proceed after approval

---

## Constitutional Compliance

This research satisfies:

- **Principle XVIII**: Research & Documentation Standards - Used context7 implied for Langium patterns
- **Principle II**: Comprehensive Testing - Directly implements 80% coverage requirement
- **Principle XIV**: Question-First Implementation - Research before implementation
- **Principle XVI**: Concise Communication - Brief, technical research documentation

---

## Next Steps

1. Proceed to implementation via `/speckit.tasks`
2. Follow test strategy outlined above
3. Verify constitutional compliance throughout
4. Request user approval for coverage exceptions if needed
