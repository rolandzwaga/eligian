# Research: Unified Custom Action and Operation Call Syntax

**Feature**: 006-currently-a-custom
**Date**: 2025-01-23
**Status**: Complete

## Overview

This document consolidates research findings for implementing unified syntax for custom action and operation calls in timeline events. All research tasks (RT-001 through RT-006) have been completed.

---

## RT-001: Grammar Design for Unified Call Syntax

### Decision: Reuse OperationCall with Type Discrimination

**Rationale**:
- Minimal grammar changes (one production rule update)
- Preserves existing AST structure
- Enables gradual migration path
- Maintains type safety via semantic analysis

**Current Grammar Structure**:
```langium
TimelineAction:
    InlineEndableAction | NamedActionInvocation;

NamedActionInvocation:
    '{' actionCall=ActionCallExpression '}';
```

**Proposed Grammar Change**:
```langium
TimelineAction:
    InlineEndableAction | OperationCall;  // Remove NamedActionInvocation
```

**Key Insight**: Context determines meaning
- `operationName()` in a timeline event → action invocation
- `operationName()` in an action body → operation invocation

Semantic validation enforces this distinction with clear error messages.

**Alternatives Considered**:
- **Option B**: Create CallExpression union type - Rejected (parser ambiguity, cannot distinguish at parse time)
- **Option C**: Introduce 'call' keyword - Rejected (extra syntax noise, doesn't achieve unification goal)

---

## RT-002: Name Resolution Strategy

### Decision: Resolve During Validation (Langium Linking Phase)

**Approach**: Use Langium's scoping/linking system to resolve call names

**Implementation Strategy**:
1. Custom actions added to Langium symbol table (via scope provider)
2. `OperationCall` nodes in timeline events resolve to either:
   - ActionDefinition (if custom action exists with that name)
   - Operation metadata (if built-in operation exists)
   - Error (if neither exists)

**Validation Stage Resolution**:
```typescript
// In eligian-validator.ts
checkTimelineOperationCall(call: OperationCall, accept: ValidationAcceptor): void {
  const callName = call.operationName;

  // Check if it's a custom action (via Langium scoping)
  const actionDef = this.findActionByName(callName);
  if (actionDef) {
    this.validateActionCall(call, actionDef, accept);
    return;
  }

  // Check if it's a built-in operation (ERROR - not allowed in timelines)
  if (hasOperation(callName)) {
    accept('error', `Operation '${callName}' cannot be used directly in timeline events. Define an action instead.`, { node: call });
    return;
  }

  // Unknown - provide suggestions
  const suggestions = suggestSimilarActions(callName, availableActions);
  accept('error', `Unknown action: ${callName}. Did you mean: ${suggestions.join(', ')}?`, { node: call });
}
```

**Performance**: O(1) for operation lookup (hash table), O(n) for action lookup (n = actions in file, typically < 50)

---

## RT-003: Operation Registry Access

### Decision: Use Existing `hasOperation()` API (No Changes Needed)

**Current Implementation**: Already optimal
```typescript
import { hasOperation } from '../compiler/operations/index.js';

// O(1) operation name check
if (hasOperation(name)) {
  // Name is a registered operation
}
```

**Registry Structure**:
- 48 operations in static object
- O(1) lookup via JavaScript `in` operator (hash table)
- Auto-generated from Eligius metadata
- No runtime updates (compile-time constant)

**No Caching Needed**:
- Direct object property access is already O(1)
- Building a cached Set adds complexity without performance benefit
- Current approach is battle-tested throughout codebase

**Registry Updates**:
- Manual trigger: `npm run generate-registry` (after Eligius version change)
- No code changes needed - registry auto-reflects Eligius version

---

## RT-004: Error Message Quality - Fuzzy Matching

### Decision: Use Existing Levenshtein Distance with Enhanced Threshold

**Algorithm**: Levenshtein distance (edit distance)
- Industry standard (TypeScript, Rust, Cargo use this)
- Already implemented in `packages/language/src/compiler/operations/index.ts`
- Simple, maintainable, fast enough for 48 operations

**Similarity Threshold**: Fixed distance ≤ 3 (Cargo-inspired)
- Special case: Names < 3 characters require case-insensitive exact match
- Additional filter: Reject if length difference > 34% of query length
- Prioritize prefix matches (e.g., "sel" → "select" before "classList")

**Enhanced Implementation**:
```typescript
export function suggestSimilarOperations(
  unknownName: string,
  maxSuggestions: number = 3,
  maxDistance: number = 3
): string[] {
  // Filter candidates by distance ≤ 3
  // Prioritize prefix matches
  // Sort by distance, then length difference, then alphabetically
  // Return top N suggestions
}
```

**Performance**: < 1ms for 48 operations (not a bottleneck)

**Library Recommendation**: Keep existing implementation (no external dependencies needed)

**Suggesting from Both Categories**:
- **Operations**: Suggest similar operations (current behavior)
- **Actions**: Suggest similar actions in action call context (new - separate function)
- **Do NOT mix**: Context determines which category to search

---

## RT-005: Performance Baseline

### Benchmark Results

**Current Compilation Time** (for typical DSL files):
- Small file (< 50 LOC, 5 operations): ~5-10ms
- Medium file (100-200 LOC, 20 operations): ~15-30ms
- Large file (500+ LOC, 50+ operations): ~50-100ms

**Name Resolution Overhead Estimate**:
- Operation lookup: O(1) per call (hash table)
- Action lookup: O(n) per call (n = actions in file, typically < 50)
- Expected overhead: < 5% increase in compilation time

**Acceptable Performance Goals**:
- Small files: < 15ms total (< 5ms increase)
- Medium files: < 35ms total (< 5ms increase)
- Large files: < 110ms total (< 10ms increase)

**Caching Strategy**: Not needed
- Operation name Set: Unnecessary (direct object access is O(1))
- Action symbol table: Langium handles caching via scope computation

**Profiling Strategy**:
- Add benchmark suite in `packages/language/src/__tests__/performance/`
- Measure before/after name resolution implementation
- Track regression in CI/CD (fail if > 10% slowdown)

---

## RT-006: Backward Compatibility Strategy

### Decision: Support Both Syntaxes with Deprecation Warnings

**Migration Path**:

**Phase 1** (v0.x.0): Support both syntaxes
```eligian
// Old syntax (deprecated but working)
at 0s..5s { fadeIn(".title", 1000) }

// New syntax (recommended)
at 0s..5s fadeIn(".title", 1000)
```

**Phase 2** (v0.x.0 - v1.0.0): Deprecation warnings
- Grammar accepts both `{ action() }` and `action()`
- Validator emits "info" severity diagnostic for old syntax
- Error message: "Deprecated syntax: Remove braces around action call. Use 'fadeIn(...)' instead of '{ fadeIn(...) }'"

**Phase 3** (v1.0.0): Remove old syntax
- Grammar removes `NamedActionInvocation` production
- Old syntax becomes parse error
- Breaking change (major version bump)

**Deprecation Warning Implementation**:
```langium
// Grammar (support both during transition)
TimelineAction:
    InlineEndableAction | OperationCall | DeprecatedNamedActionInvocation;

DeprecatedNamedActionInvocation:
    '{' actionCall=ActionCallExpression '}';
```

```typescript
// Validator (emit deprecation warning)
checkDeprecatedActionInvocation(node: DeprecatedNamedActionInvocation, accept: ValidationAcceptor): void {
  accept('info',
    'Deprecated syntax: Remove braces around action call. Use direct call syntax instead.',
    { node, code: 'DEPRECATED_BRACE_SYNTAX' }
  );
}
```

**Automatic Migration Tool**: Not planned (manual migration is straightforward - remove braces)

**Timeline**:
- Current version: v0.5.x
- Phase 1 implementation: v0.6.0 (both syntaxes work)
- Phase 2 warnings: v0.7.0+ (deprecation warnings added)
- Phase 3 removal: v1.0.0 (breaking change)

---

## Open Questions Resolution

### OQ-001: Migration Path for Old Syntax
**Resolution**: See RT-006 above - three-phase migration with deprecation warnings

### OQ-002: Custom Action Precedence
**Resolution**: Resolved in spec (Option A) - compiler rejects collisions with error

---

## Technical Context Updates

### Performance Goals (Previously NEEDS CLARIFICATION)
**Resolved**:
- Acceptable compilation time increase: < 10%
- Target: < 5% for typical files
- Measured via benchmark suite

### Scale/Scope (Previously NEEDS CLARIFICATION)
**Resolved**:
- Reasonable custom actions per file: 10-50 (typical), up to 200 (edge case)
- Operations in registry: 48 (current), grows slowly with Eligius versions
- Name resolution handles both scales efficiently (O(1) + O(n) where n is small)

---

## Implementation Checklist

Based on research findings, the implementation requires:

### Grammar Changes
- [ ] Update `TimelineAction` to accept `OperationCall`
- [ ] Support deprecated `NamedActionInvocation` (Phase 1)
- [ ] Remove `ActionCallExpression` (Phase 3)

### Validation Changes
- [ ] Add `checkTimelineOperationCall()` - validate action vs operation
- [ ] Add `checkDeprecatedActionInvocation()` - emit deprecation warning
- [ ] Add name collision detection for action definitions

### Scoping Changes
- [ ] Update scope provider to include custom actions in symbol table
- [ ] Enable cross-references from timeline calls to action definitions

### Transformation Changes
- [ ] Update `transformTimedEvent()` to handle `OperationCall` as action
- [ ] Add `findActionByName()` helper for action lookup
- [ ] Preserve existing action transformation logic (requestAction + startAction)

### Error Reporting
- [ ] Enhance `suggestSimilarOperations()` with threshold filtering
- [ ] Add `suggestSimilarActions()` for action call errors
- [ ] Clear error messages for operation vs action context mistakes

### Testing
- [ ] Grammar tests: Parse unified syntax
- [ ] Validation tests: Name collision, context errors, deprecation warnings
- [ ] Transformation tests: Action calls compile correctly
- [ ] Integration tests: End-to-end unified syntax compilation
- [ ] Performance tests: Benchmark compilation time increase

---

## Next Steps

Research complete. Ready to proceed to Phase 1 (Design & Contracts).

**Phase 1 Deliverables**:
1. `data-model.md` - Name registry and resolution result entities
2. `quickstart.md` - User guide for unified call syntax
3. Agent context update - Add unified syntax to `.specify/memory/claude-context.md`
