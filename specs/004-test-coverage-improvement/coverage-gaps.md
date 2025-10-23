# Coverage Gaps Analysis

**Date**: 2025-01-23
**Baseline Coverage Run**: pnpm run test:coverage:ci

## Overall Coverage Status

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Statements | 68.84% | 80% | ❌ **11.16% gap** |
| Branches | 80% | 80% | ✅ **MEETS** |
| Functions | 77.77% | 80% | ❌ **2.23% gap** |
| Lines | 68.84% | 80% | ❌ **11.16% gap** |

## Priority 1: Core Business Logic (Critical - Must Fix)

### 1. `src/eligian-validator.ts` - 70.71% lines
**Current**: 70.71% lines, 76.54% branches, 95.83% functions
**Gap**: Need +9.29% line coverage
**Uncovered Lines**: 100-101,114,245-248,305-307,382-383,413,430,541-549,577
**Priority**: HIGH - Core validation logic
**Action**: Add tests for uncovered validation rules

### 2. `src/metadata-tracker.ts` - 59.15% lines
**Current**: 59.15% lines, 72.72% branches, 50% functions
**Gap**: Need +20.85% line coverage
**Uncovered Lines**: 34-137,157-167
**Priority**: HIGH - Metadata tracking for completion
**Action**: Add tests for metadata collection and tracking logic

### 3. `src/compiler/type-checker.ts` - 59.18% lines
**Current**: 59.18% lines, 80% branches, 100% functions
**Gap**: Need +20.82% line coverage
**Uncovered Lines**: 56-65,69-78
**Priority**: HIGH - Type checking logic
**Action**: Add tests for type checking edge cases

### 4. `src/compiler/ast-transformer.ts` - 76.17% lines
**Current**: 76.17% lines, 70.05% branches, 100% functions
**Gap**: Need +3.83% line coverage
**Uncovered Lines**: 148,160,211,264,273,295,317,340,367,389,447,478,592,622-625,643,661,698,732,746,779,815-816,860-863,883-884,906-907,939-940,972,1002,1033,1056-1057,1092-1093,1132,1175,1227-1228,1238,1295-1296,1312-1313,1328-1329,1350,1377-1381,1475,1580-1584,1651,1681-1682,1750,1766,1788,1809-1815
**Priority**: MEDIUM - Already close to threshold
**Action**: Add tests for uncovered AST transformation paths

### 5. `src/compiler/effects/layers.ts` - 48.57% lines
**Current**: 48.57% lines, 100% branches, 0% functions
**Gap**: Need +31.43% line coverage
**Uncovered Lines**: 26-39,42-45,74-90
**Priority**: MEDIUM - Effect layer composition
**Action**: Add tests for effect layer setup

## Priority 2: Generator Scripts (Can Exclude or Test)

### 1. `src/compiler/operations/generate-registry.ts` - 0% coverage
**Decision Needed**: This is a **build-time generator script**
**Options**:
1. Exclude from coverage (add to vitest.config.ts exclude list)
2. Add tests for registry generation logic

**Recommendation**: **EXCLUDE** - Generator scripts run at build time, not runtime

### 2. `src/compiler/operations/operation-converter.ts` - 0% coverage
**Decision Needed**: Build-time conversion script
**Recommendation**: **EXCLUDE** if it's a generator, or test if it's runtime logic

### 3. `src/completion/generate-metadata.ts` - 0% coverage
**Decision Needed**: Build-time metadata generator
**Recommendation**: **EXCLUDE** - Generator script

## Priority 3: Low-Impact Files

### 1. `src/eligian-hover-provider.ts` - 12.22% lines
**Current**: 12.22% lines, 100% branches, 0% functions
**Gap**: Need +67.78% line coverage
**Uncovered Lines**: 27-140,146-150
**Priority**: LOW - IDE hover support (not core compilation)
**Action**: Add tests for hover provider logic OR justify low coverage

### 2. `src/compiler/effects/FileSystem.ts` - 63.63% lines
**Current**: 63.63% lines, 100% branches, 0% functions
**Gap**: Need +16.37% line coverage
**Uncovered Lines**: 19-22
**Priority**: LOW - Effect wrapper
**Action**: Add tests for FileSystem effect layer

## Excluded Files (No Action Needed)

These files are **correctly excluded** from coverage:
- `src/compiler/types/eligius-ir.ts` - Type definitions only (0% is expected)
- `src/type-system-typir/eligian-specifics.ts` - Type definitions (0% expected)
- All `__tests__/**` files
- All `*.spec.ts` files

## Implementation Plan

### Phase 1: Quick Wins (Get to ~75% coverage)
1. Add tests for `ast-transformer.ts` (+3.83%) - Only need 5-10 more test cases
2. Add tests for `eligian-validator.ts` (+9.29%) - Add validation rule tests
3. Exclude generator scripts from coverage (will improve overall %)

### Phase 2: Core Logic (Get to 80% coverage)
4. Add tests for `type-checker.ts` (+20.82%) - Type checking edge cases
5. Add tests for `metadata-tracker.ts` (+20.85%) - Metadata collection
6. Add tests for `layers.ts` (+31.43%) - Effect layer composition

### Phase 3: Decision on Low-Priority
7. Decide on `eligian-hover-provider.ts` - test or document exception
8. Add FileSystem tests if needed

## Estimated Effort

- **Quick Wins**: 2-3 hours (add ~20-30 test cases)
- **Core Logic**: 4-6 hours (add ~50-80 test cases)
- **Total**: 6-9 hours to reach 80% threshold

## Next Steps

1. ✅ Baseline coverage generated (T015)
2. ✅ Coverage gaps documented (T016, T017)
3. **Next**: Update vitest.config.ts to exclude generator scripts
4. **Then**: Start adding tests for Priority 1 files
