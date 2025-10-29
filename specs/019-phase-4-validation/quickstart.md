# Quick Start: Phase 4 - Validation Pipeline Unification

**Feature**: Phase 4 - Validation Pipeline Unification
**Status**: Planning Complete - Ready for Implementation
**Date**: 2025-01-28

## Overview

This feature fixes the reported issue where "IDE shows errors but compilation succeeds" (or vice versa) by unifying validation pipelines between VS Code and CLI.

**What Changed**:
- CSS files now load BEFORE validation in both environments (no more race conditions)
- Compilation state is explicitly reset between runs (no more state pollution)
- Automated tests verify IDE and compiler produce identical validation results

## For Users

### Before This Fix
```
# Open test.eligian in VS Code
styles "./styles.css"
timeline "Test" at 0s {
  at 0s selectElement(".invalid-class")  # ❌ Error: Unknown CSS class
}

# Compile via CLI
$ pnpm --filter @eligian/cli compile test.eligian
✓ Compilation succeeded  # ⚠️ No error reported!

# User confusion: "Why does IDE show errors but compilation succeeds?"
```

### After This Fix
```
# Open test.eligian in VS Code
styles "./styles.css"
timeline "Test" at 0s {
  at 0s selectElement(".invalid-class")  # ❌ Error: Unknown CSS class
}

# Compile via CLI
$ pnpm --filter @eligian/cli compile test.eligian
✗ Compilation failed:
  test.eligian:4:20 - Unknown CSS class: 'invalid-class'

# ✅ IDE and CLI show identical errors
```

### Expected Behavior

**Consistent Validation**:
- IDE and CLI always show the same validation errors
- CSS class validation works identically in both environments
- Compilation results are deterministic and repeatable

**Performance**:
- No noticeable slowdown (< 10ms overhead)
- CSS loading still completes in < 2 seconds
- Validation still completes in < 500ms

## For Developers

### Running Validation Parity Tests

```bash
# Run full parity test suite
pnpm --filter @eligian/language test ide-compiler-parity

# Expected output:
# ✓ IDE and Compiler produce identical parse errors
# ✓ IDE and Compiler produce identical validation errors
# ✓ IDE and Compiler produce identical CSS errors
# ✓ IDE and Compiler produce identical asset errors
# ✓ CSS validation consistent after file changes
# ✓ Sequential compilations are isolated
# ✓ Repeated compilation produces identical results
#
# Test Suites: 1 passed, 1 total
# Tests:       10 passed, 10 total
# Time:        < 10s
```

### Testing CSS Validation Consistency

```bash
# Create test file with CSS import
cat > test.eligian << 'EOF'
styles "./test.css"
timeline "Test" at 0s {
  at 0s selectElement(".button") {
    addClass("invalid-class")
  }
}
EOF

# Create CSS file
cat > test.css << 'EOF'
.button { color: blue; }
EOF

# Test in IDE:
# 1. Open test.eligian in VS Code
# 2. Observe Problems panel - should show "Unknown CSS class: 'invalid-class'"

# Test in CLI:
pnpm --filter @eligian/cli compile test.eligian

# Expected: Same error in both environments
# test.eligian:4:10 - Unknown CSS class: 'invalid-class'
```

### Debugging State Pollution Issues

```bash
# Create two test files
cat > fileA.eligian << 'EOF'
styles "./styles.css"
timeline "FileA" at 0s {
  at 0s selectElement(".button")
}
EOF

cat > fileB.eligian << 'EOF'
timeline "FileB" at 0s {
  at 0s selectElement(".button")  # Should error - no CSS imported
}
EOF

# Compile sequentially
pnpm --filter @eligian/cli compile fileA.eligian
pnpm --filter @eligian/cli compile fileB.eligian

# Expected: fileB shows error (doesn't see fileA's CSS)
# fileB.eligian:2:20 - CSS class '.button' used but no CSS files imported

# If fileB doesn't error, state pollution is occurring (bug)
```

### Adding New Validation Parity Tests

```typescript
// packages/language/src/__tests__/ide-compiler-parity.spec.ts

import { describe, test, expect } from 'vitest';
import { getIDEValidationErrors, getCompilerValidationErrors, compareValidationResults } from './parity-helpers.js';

describe('IDE and Compiler Validation Parity', () => {
  test('new validation rule produces identical errors', async () => {
    const source = `
      // Your test case here
    `;

    const ideErrors = await getIDEValidationErrors(source);
    const compilerErrors = await getCompilerValidationErrors(source);

    expect(compareValidationResults(ideErrors, compilerErrors)).toBe(true);
  });
});
```

## Architecture Overview

### CSS Loading Flow (Before vs After)

**BEFORE** (Race Condition):
```
Compiler:  Parse → Load CSS (sync) → Validate ✓
IDE:       Parse → Validate ✗ → Load CSS (async) ⚠️
           ↑ Race condition - validation runs before CSS loaded
```

**AFTER** (Synchronized):
```
Compiler:  Clear State → Parse → Load CSS (sync) → Validate ✓
IDE:       Parse → Load CSS (async) → Wait → Validate ✓
           ↑ Synchronization barrier ensures CSS loads first
```

### State Management Flow

**BEFORE** (State Pollution):
```
Compile fileA → Registry: {fileA → styles.css}
Compile fileB → Registry: {fileA → styles.css, fileB → (none)}
                ↑ fileB sees fileA's CSS classes (BUG)
```

**AFTER** (State Isolation):
```
Compile fileA → Clear(fileA) → Load CSS → Registry: {fileA → styles.css}
Compile fileB → Clear(fileB) → No CSS  → Registry: {fileB → (none)}
                ↑ fileB doesn't see fileA's CSS (CORRECT)
```

## Key Files Modified

### Language Package (`@eligian/language`)

**`src/compiler/pipeline.ts`**:
- Lines 42-54: Singleton service management
- Lines 138-193: CSS loading synchronization
- **Changes**: Add `clearDocument(uri)` call before parsing, document state management

**`src/css/css-registry.ts`**:
- **New Methods**:
  - `clearDocument(documentUri: string): void` - Clear document-specific state
  - `clearAll(): void` - Reset entire registry
- **Purpose**: Explicit state management for compilation isolation

**`src/__tests__/ide-compiler-parity.spec.ts`** (NEW):
- 10+ test cases comparing IDE and compiler validation
- **Purpose**: Automated parity verification

**`src/__tests__/css-state-isolation.spec.ts`** (NEW):
- 6+ test cases verifying state isolation
- **Purpose**: Ensure no state leakage between compilations

**`src/compiler/types/errors.ts`** (DELETED):
- Deprecated error types from Feature 018
- All imports updated to `@eligian/language/errors`

### Extension Package (`@eligian/extension`)

**`src/language/main.ts`**:
- Lines 75-158: CSS loading synchronization
- **Changes**: Ensure `onBuildPhase(Parsed)` completes before validation

## Testing Strategy

### Unit Tests (New)
- `clearDocument()` removes document-specific state ✅
- `clearAll()` resets entire CSS registry ✅
- State operations are idempotent ✅

### Integration Tests (New)
- **Validation Parity** (10+ tests):
  - Parse errors identical ✅
  - Validation errors identical ✅
  - CSS errors identical ✅
  - Asset errors identical ✅

- **State Isolation** (6+ tests):
  - Sequential compilations independent ✅
  - No CSS metadata leakage ✅
  - Repeated compilation deterministic ✅

### Regression Tests (Existing)
- All 1235+ existing tests pass ✅
- CSS hot-reload continues working ✅
- No performance degradation ✅

## Success Criteria Verification

| Criterion | Target | Verification Method | Status |
|-----------|--------|---------------------|--------|
| SC-001: Validation parity | 100% identical results | Parity test suite | ⏳ |
| SC-002: Zero inconsistencies | 0 reports | Integration tests | ⏳ |
| SC-003: Code reduction | 80+ lines removed | Git diff | ⏳ |
| SC-004: Test performance | < 10 seconds | Automated timing | ⏳ |
| SC-005: Validation performance | < 500ms | Benchmark | ⏳ |
| SC-006: Regression tests | 1235+ passing | CI verification | ⏳ |
| SC-007: CSS hot-reload | < 300ms | Manual verification | ⏳ |

## Troubleshooting

### Issue: Parity Tests Failing

**Symptom**: `compareValidationResults()` returns false

**Debug Steps**:
1. Check error messages - are they identical?
2. Check error locations - same line/column?
3. Check error codes - same `_tag` or `code` field?
4. Enable debug logging in parity helpers

**Common Causes**:
- CSS loading timing still differs
- Error message formatting differs
- Location calculation differs

### Issue: State Pollution Detected

**Symptom**: fileB sees CSS from fileA

**Debug Steps**:
1. Add logging in `clearDocument()`
2. Verify `clearDocument()` is called before parsing
3. Check CSS registry state after clearing

**Common Causes**:
- `clearDocument()` not called
- Reference counting bug in CSS registry
- Singleton service not reused (fresh service created)

### Issue: Performance Regression

**Symptom**: Validation takes > 500ms

**Debug Steps**:
1. Benchmark CSS loading time
2. Benchmark validation time
3. Profile with Chrome DevTools

**Common Causes**:
- Synchronization overhead too high
- CSS file loading timeout not set
- N+1 query pattern in CSS registry

## Next Steps

1. ✅ **Spec Complete**: Feature specification validated and approved
2. ✅ **Plan Complete**: Implementation plan with research and design
3. ⏳ **Generate Tasks**: Run `/speckit.tasks` to create task breakdown
4. ⏳ **Implementation**: Run `/speckit.implement` with TDD approach

**Estimated Timeline**: 3-5 days
- P1 (CSS Loading): 1-2 days
- P2 (State Isolation): 0.5-1 days
- P3 (Parity Tests): 0.5-1 days
- P4 (Cleanup): 0.5 days
- Polish & Testing: 0.5-1 days

## Resources

- **Feature Spec**: [spec.md](./spec.md)
- **Implementation Plan**: [plan.md](./plan.md)
- **Research Findings**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **API Contracts**: [contracts/](./contracts/)
- **Refactoring Roadmap**: [../REFACTORING_ROADMAP.md](../REFACTORING_ROADMAP.md)

## Support

For questions or issues with this feature:
1. Check the research findings in [research.md](./research.md)
2. Review the comprehensive analysis that identified root causes
3. Consult the API contracts in [contracts/](./contracts/)
4. Ask the maintainers (reference this spec in your question)
