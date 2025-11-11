# Research: Event Name and Argument Validation

**Feature**: 029-validate-event-names
**Date**: 2025-11-10
**Status**: Complete

## Overview

This document consolidates research findings for implementing event name and argument validation for Eligian event actions. The feature validates that `on event "name"` declarations match known Eligius events and that parameter counts/types match event metadata.

## Research Findings

### 1. Event Metadata Structure

**Decision**: Use existing `TIMELINE_EVENTS` from `completion/metadata/timeline-events.generated.ts`

**Rationale**: Event metadata is already generated from the Eligius library via `generate-metadata.ts` script. This ensures validation stays synchronized with Eligius event definitions across library versions.

**Structure**:
```typescript
export interface TimelineEventMetadata {
  name: string;           // Event identifier (e.g., "data-sync", "before-request-video-url")
  description: string;    // Event description (e.g., "Event: data-sync")
  category?: string;      // Event category (e.g., "Timeline", "Navigation", "general")
  args?: EventArgMetadata[];  // Event arguments (empty array if no args)
}

export interface EventArgMetadata {
  name: string;   // Argument identifier (e.g., "syncStatus", "itemCount")
  type: string;   // Argument type (e.g., "string", "number", "boolean")
}
```

**Available Events**: 43 total events in `TIMELINE_EVENTS` array
- Examples with arguments: "before-request-video-url" (3 args), "data-sync" (2 args)
- Examples without arguments: "timeline-complete" (0 args), "app-ready" (0 args)

**Alternatives Considered**:
- Hard-coding event list → Rejected: Would become outdated as Eligius evolves
- Fetching at runtime → Rejected: Already have compile-time metadata, no need for network requests

### 2. Levenshtein Distance for "Did You Mean?" Suggestions

**Decision**: Reuse existing `css/levenshtein.ts` module (distance ≤ 2)

**Rationale**: Levenshtein distance successfully used in Feature 013 (CSS class validation) for typo detection. Same pattern applies to event names. Threshold of 2 catches common typos without false positives.

**Available Functions**:
```typescript
// Calculate edit distance between two strings
levenshteinDistance(a: string, b: string): number;

// Find similar strings within threshold
findSimilar(target: string, candidates: string[], threshold: number = 2): string[];
```

**Usage Pattern** (from CSS validation):
```typescript
const suggestions = findSimilar(typoedName, validNames, 2);
if (suggestions.length > 0) {
  message = `Unknown event name: '${typoedName}' (Did you mean: ${suggestions.join(', ')}?)`;
} else {
  message = `Unknown event name: '${typoedName}'`;
}
```

**Alternatives Considered**:
- Exact match only → Rejected: Doesn't help users fix typos
- Fuzzy matching library (fuse.js) → Rejected: Adds dependency, Levenshtein sufficient for event names

### 3. Validation Integration Points

**Decision**: Add 3 new validation methods to `EligianValidator` class

**Methods**:
1. `checkEventNameExists()` - Validate event name matches known Eligius event
2. `checkEventArgumentCount()` - Validate parameter count matches event args
3. `checkEventTypeCompatibility()` - Validate type annotations match event arg types

**Registration Pattern** (from existing code):
```typescript
// In packages/language/src/eligian-validator.ts
const checks: ValidationChecks<EligianAstType> = {
  EventActionDefinition: [
    validator.checkEventActionDefinition,     // Existing: event name literal, length, body
    validator.checkEventActionParameters,     // Existing: reserved keywords, duplicates
    validator.checkEventNameExists,           // NEW: event name validation (US1)
    validator.checkEventArgumentCount,        // NEW: argument count validation (US2)
    validator.checkEventTypeCompatibility,    // NEW: type compatibility validation (US3)
  ],
};
registry.register(checks, validator);
```

**Alternatives Considered**:
- Single validation method for all checks → Rejected: Violates single responsibility, harder to test
- Separate validator class → Rejected: Existing pattern uses single `EligianValidator` class

### 4. Type Annotation Extraction

**Decision**: Use existing `Parameter.type` field from Feature 018 (type system)

**Rationale**: Type annotations are already parsed by Langium grammar and available on Parameter AST nodes. No additional parsing needed.

**Extraction Pattern**:
```typescript
// Parameter AST node already has optional type field
interface Parameter {
  name: string;
  type?: string;  // TypeScript type annotation (e.g., "string", "number", "boolean")
}

// Validation checks if type is present
if (param.type) {
  // Compare param.type against eventArg.type
  if (param.type !== eventArg.type) {
    accept('error', `Type mismatch for parameter '${param.name}': ...`);
  }
}
```

**Type Matching**:
- Direct string comparison (e.g., "string" === "string")
- Case-sensitive (TypeScript types are case-sensitive)
- No type coercion or compatibility checking (out of scope)

**Alternatives Considered**:
- Complex type compatibility (e.g., `string | null` compatible with `string`) → Rejected: Out of scope, requires full type system
- Type inference from usage → Rejected: Type checking is opt-in, only validate explicit annotations

### 5. Error vs Warning Severity

**Decision**: Use appropriate severity based on impact

**Severity Mapping**:

| Validation | Severity | Rationale |
|------------|----------|-----------|
| Unknown event name | `'error'` | Handler will never execute (typo or non-existent event) |
| Empty event name | `'error'` | Cannot be valid, indicates syntax error |
| Argument count mismatch | `'warning'` | Runtime may work (extra args ignored, missing args undefined) |
| Type mismatch (with annotation) | `'error'` | Clear type violation when types are explicitly declared |

**Compilation Blocking**:
Per FR-011, warnings do NOT block compilation. Only errors would block if strict mode were enabled (currently not enforced).

**Error Codes**:
- `unknown_event_name` - Event name not found in TIMELINE_EVENTS
- `empty_event_name` - Event name is empty string
- `event_argument_count_mismatch` - Parameter count doesn't match event args
- `event_type_mismatch` - Parameter type doesn't match event arg type

**Alternatives Considered**:
- All errors → Rejected: Argument count mismatch may not break runtime
- All warnings → Rejected: Unknown event name is always an error (silent failure)

## Implementation Dependencies

### Existing Infrastructure (No Changes Needed)

1. **Event Metadata Generation**:
   - `packages/language/src/completion/generate-metadata.ts` - Already generates event metadata
   - `packages/language/src/completion/metadata/timeline-events.generated.ts` - 43 events available
   - Regenerate metadata: `tsx src/completion/generate-metadata.ts` (if Eligius updates)

2. **Levenshtein Distance**:
   - `packages/language/src/css/levenshtein.ts` - Already implemented
   - Used successfully in CSS class validation (Feature 013)

3. **Type Annotations**:
   - `Parameter.type` field from Feature 018 - Already parsed by grammar
   - No additional grammar changes needed

4. **Validation Architecture**:
   - `EligianValidator` class pattern - Established in `packages/language/src/eligian-validator.ts`
   - `ValidationAcceptor` for diagnostics - Langium built-in
   - Error code system - Established pattern

### New Implementation Required

1. **Validator Methods** (3 new methods in `EligianValidator` class):
   - `checkEventNameExists()` - ~30 lines (load metadata, find event, suggest alternatives)
   - `checkEventArgumentCount()` - ~25 lines (load metadata, compare counts, format message)
   - `checkEventTypeCompatibility()` - ~35 lines (load metadata, iterate params, compare types)

2. **Integration Tests** (3 separate files per Principle II):
   - `event-name-validation.spec.ts` - ~15 tests (typos, valid, invalid, empty)
   - `argument-count-validation.spec.ts` - ~15 tests (too many, too few, zero, correct)
   - `argument-type-validation.spec.ts` - ~15 tests (mismatches, matches, opt-in behavior)

3. **Example Updates**:
   - Add event validation examples to `examples/demo.eligian` (per Principle XXIV)

## Performance Considerations

**Event Metadata Loading**:
- `TIMELINE_EVENTS` is a constant array (43 events) - O(1) import
- Event lookup is O(n) linear search - acceptable for 43 events
- Could optimize with Map if needed (premature optimization avoided per Principle III)

**Levenshtein Calculation**:
- Calculates distance for all events when typo detected - O(n * m) where m is avg string length
- Only runs on error case (not hot path)
- 43 events * ~20 char avg = ~860 comparisons max (negligible)

**Validation Timing**:
- Runs on document change (Langium triggers validation)
- Target: <300ms total validation time (per success criteria SC-002)
- Event validation adds ~5ms overhead (3 validator methods)

## Best Practices from Similar Features

**CSS Class Validation (Feature 013)**:
- ✅ Use Levenshtein distance ≤ 2 for suggestions
- ✅ Provide "Did you mean?" message format
- ✅ Use descriptive error codes
- ✅ Separate integration tests per validation rule

**Type System (Feature 018)**:
- ✅ Type checking is opt-in (only when annotations present)
- ✅ Clear messages indicating expected vs actual types
- ✅ No type coercion or complex compatibility checking

**Event Actions (Feature 028)**:
- ✅ Validate event name is string literal (already implemented)
- ✅ Validate event name length ≤100 chars (already implemented)
- ✅ Validate action body not empty (already implemented)

## Risks and Mitigations

**Risk 1: Event metadata out of sync with Eligius**
- Mitigation: Document metadata regeneration process in CLAUDE.md
- Mitigation: CI/CD could run `generate-metadata.ts` on Eligius version updates

**Risk 2: False positives for custom/user-defined events**
- Mitigation: Only validate against known Eligius events (not custom events)
- Mitigation: Document that validation is for Eligius standard events only

**Risk 3: Type annotation format changes**
- Mitigation: Use existing `Parameter.type` field (stable from Feature 018)
- Mitigation: Type matching is simple string comparison (no parsing)

**Risk 4: Performance degradation with large files**
- Mitigation: Validation is per-node, not per-file (scales linearly)
- Mitigation: Levenshtein only runs on error case (not hot path)

## Conclusion

All research tasks complete. No unknowns remain. Implementation can proceed with:
- 3 new validator methods (~90 lines total)
- 3 separate integration test files (~45 tests total)
- Example updates to `demo.eligian`
- No new dependencies required
- No grammar changes required

Ready for Phase 1 (Design & Contracts).
