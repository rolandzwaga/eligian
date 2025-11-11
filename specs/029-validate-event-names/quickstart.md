# Quickstart: Event Name and Argument Validation

**Feature**: 029-validate-event-names
**Date**: 2025-11-10

## Overview

This guide explains how to use event name and argument validation in Eligian event actions. The validation catches typos in event names, warns about parameter count mismatches, and validates type annotations against event metadata.

## What Gets Validated

The Eligian compiler validates three aspects of event actions:

1. **Event Names** (US1): Event name must match a known Eligius event
2. **Argument Count** (US2): Parameter count should match event's argument count
3. **Type Annotations** (US3): Type annotations (when present) must match event's argument types

## Usage Examples

### ✅ Valid Event Actions

```eligian
// Event with typed parameters
on event "data-sync" action HandleDataSync(syncStatus: string, itemCount: number) [
  selectElement("#sync-status")
  setElementContent(syncStatus)
]

// Event without parameters
on event "timeline-complete" action HandleTimelineComplete() [
  selectElement("#status")
  setElementContent("Timeline complete!")
]

// Event with topic
on event "click" topic "navigation" action HandleNavClick(targetId: string) [
  selectElement(targetId)
  addClass("active")
]

// Event without type annotations (type checking is opt-in)
on event "user-login" action HandleLogin(userId, userName, userRole) [
  selectElement("#user-display")
  setElementContent(userName)
]
```

### ❌ Common Errors

#### Error 1: Typo in Event Name

```eligian
// ❌ ERROR: Unknown event name: 'data-synk' (Did you mean: 'data-sync'?)
on event "data-synk" action HandleSync(status: string) [
  selectElement("#status")
]
```

**Fix**: Correct the event name to match a known Eligius event.

```eligian
// ✅ FIXED
on event "data-sync" action HandleSync(status: string) [
  selectElement("#status")
]
```

#### Error 2: Type Mismatch

```eligian
// ❌ ERROR: Type mismatch for parameter 'index': declared as 'string' but event provides 'number'
on event "before-request-video-url" action HandleVideo(index: string) [
  selectElement("#video")
]
```

**Fix**: Update the type annotation to match the event's argument type.

```eligian
// ✅ FIXED
on event "before-request-video-url" action HandleVideo(index: number) [
  selectElement("#video")
]
```

### ⚠️ Common Warnings

#### Warning 1: Too Few Parameters

```eligian
// ⚠️ WARNING: Event 'before-request-video-url' provides 3 arguments, but action declares 2 parameters.
//             Missing arguments may be undefined at runtime.
on event "before-request-video-url" action HandleVideo(index, position) [
  selectElement("#video")
]
```

**Fix**: Add the missing parameter (or suppress warning if you intentionally don't need it).

```eligian
// ✅ FIXED
on event "before-request-video-url" action HandleVideo(index, position, isHistory) [
  selectElement("#video")
]
```

#### Warning 2: Too Many Parameters

```eligian
// ⚠️ WARNING: Event 'timeline-complete' provides 0 arguments, but action declares 1 parameter 'extraParam'.
//             Extra parameters will be ignored at runtime.
on event "timeline-complete" action HandleComplete(extraParam) [
  selectElement("#status")
]
```

**Fix**: Remove the unnecessary parameter.

```eligian
// ✅ FIXED
on event "timeline-complete" action HandleComplete() [
  selectElement("#status")
]
```

## Known Eligius Events

The validator checks against 43 known Eligius events. Some common ones:

**Timeline Events**:
- `"timeline-complete"` - 0 arguments
- `"timeline-start"` - 0 arguments
- `"before-request-timeline-uri"` - 0 arguments

**Navigation Events**:
- `"before-request-video-url"` - 3 arguments: `index: number`, `requestedVideoPosition: number`, `isHistoryRequest: boolean`
- `"after-request-video-url"` - 3 arguments: `index: number`, `requestedVideoPosition: number`, `isHistoryRequest: boolean`

**User-Defined Events**:
- `"click"` - User-defined, typically 0-2 arguments (depends on your usage)
- `"data-sync"` - User-defined, arguments depend on your implementation

**Complete List**: See `packages/language/src/completion/metadata/timeline-events.generated.ts`

## Type Checking Behavior

### Opt-In Validation

Type checking is **opt-in** - only parameters with explicit type annotations are validated.

```eligian
// No type checking (no type annotations)
on event "data-sync" action HandleSync(status, count) [...]

// Type checking enabled (type annotations present)
on event "data-sync" action HandleSync(status: string, count: number) [...]
```

### Supported Types

The validator supports these TypeScript types:
- `string` - String values
- `number` - Numeric values
- `boolean` - Boolean values
- `object` - Object literals
- `array` - Array literals

### Parameter Names Are Free-Form

You can use any parameter names - the validator only checks types and counts.

```eligian
// All of these are valid (names don't need to match event metadata)
on event "data-sync" action HandleSync(syncStatus, itemCount) [...]
on event "data-sync" action HandleSync(status, count) [...]
on event "data-sync" action HandleSync(s, c) [...]
```

## IDE Integration

### Error Locations

Validation errors appear at the appropriate source location:

- **Event name errors**: Underlined at the event name string
- **Type mismatch errors**: Underlined at the parameter with incorrect type
- **Argument count warnings**: Underlined at the event action definition

### Quick Fixes

The IDE provides "Did you mean?" suggestions for typos:

```
Unknown event name: 'data-synk'
(Did you mean: 'data-sync'?)
  [Quick Fix] → Replace with 'data-sync'
```

### Hover Information

Hover over an event name to see:
- Event description
- Expected argument count
- Argument names and types

## Performance

**Validation Speed**:
- Event name validation: ~2ms
- Argument count validation: ~1ms
- Type compatibility validation: ~2ms
- **Total overhead**: ~5ms per event action

**Target**: <300ms for entire document validation (typically many event actions)

## Common Pitfalls

### Pitfall 1: Case Sensitivity

Event names and types are case-sensitive:

```eligian
// ❌ Wrong case
on event "Data-Sync" action HandleSync() [...]  // Should be "data-sync"

// ❌ Wrong type case
on event "data-sync" action HandleSync(status: String) [...]  // Should be "string"
```

### Pitfall 2: Assuming Parameter Names Matter

Parameter names don't need to match event metadata - only count and types matter:

```eligian
// ✅ Valid (even though names don't match metadata)
on event "before-request-video-url" action HandleVideo(idx, pos, hist) [...]

// The event metadata might say: index, requestedVideoPosition, isHistoryRequest
// But you can use any names you want
```

### Pitfall 3: Forgetting Type Annotations Are Optional

If you don't want type checking, simply omit type annotations:

```eligian
// No type checking (opt-out)
on event "data-sync" action HandleSync(status, count) [...]

// With type checking (opt-in)
on event "data-sync" action HandleSync(status: string, count: number) [...]
```

### Pitfall 4: Warnings Don't Block Compilation

Argument count warnings are just warnings - compilation continues:

```eligian
// ⚠️ WARNING but compilation succeeds
on event "timeline-complete" action HandleComplete(extraParam) [...]
```

## Troubleshooting

### "Unknown event name" Error

**Cause**: Event name doesn't match any known Eligius event.

**Solutions**:
1. Check for typos (validator provides suggestions)
2. Verify event name spelling in Eligius documentation
3. Ensure event metadata is up-to-date (`tsx src/completion/generate-metadata.ts`)
4. Check if you're using a custom event (validation only checks Eligius standard events)

### "Type mismatch" Error

**Cause**: Type annotation doesn't match event's argument type.

**Solutions**:
1. Update type annotation to match event metadata
2. Remove type annotation (opt-out of type checking)
3. Check event metadata for correct type: `packages/language/src/completion/metadata/timeline-events.generated.ts`

### "Argument count mismatch" Warning

**Cause**: Parameter count doesn't match event's argument count.

**Solutions**:
1. Add missing parameters (if you need them)
2. Remove extra parameters (if you don't need them)
3. Suppress warning if intentional (warnings don't block compilation)

### Validation Not Running

**Possible causes**:
1. Language server not started (VS Code: check output panel)
2. File not saved (Langium triggers validation on save)
3. Syntax errors preventing validation (fix syntax first)

## Integration with Existing Features

### Compatibility with Type System (Feature 018)

Event validation works seamlessly with the existing type system:

```eligian
// Type annotations validated against both:
// - Event metadata (event argument types)
// - Type system (parameter usage within action body)
on event "data-sync" action HandleSync(status: string, count: number) [
  // Type system ensures selectElement expects string
  selectElement(status)  // ✅ Type matches
  // Type system ensures animate expects number
  animate({opacity: 1}, count)  // ✅ Type matches
]
```

### Compatibility with Event Actions (Feature 028)

Event validation builds on existing event action validation:

```eligian
// Existing validation (Feature 028):
// - Event name must be string literal
// - Event name ≤ 100 characters
// - Action body not empty
// - Parameters don't use reserved keywords
// - No duplicate parameter names

// New validation (Feature 029):
// - Event name matches known Eligius event
// - Parameter count matches event arguments
// - Type annotations match event argument types
```

## Best Practices

1. **Use type annotations** when working with events that have typed arguments
2. **Check IDE suggestions** when you see "Unknown event name" errors
3. **Match parameter count** to event arguments (avoid missing/extra params)
4. **Use descriptive parameter names** (even though they're not validated)
5. **Regenerate metadata** after Eligius library updates

## Further Reading

- **Event Metadata**: `packages/language/src/completion/metadata/timeline-events.generated.ts`
- **Validation Implementation**: `packages/language/src/eligian-validator.ts`
- **Levenshtein Distance**: `packages/language/src/css/levenshtein.ts`
- **Feature Specification**: `specs/029-validate-event-names/spec.md`
- **Data Model**: `specs/029-validate-event-names/data-model.md`
