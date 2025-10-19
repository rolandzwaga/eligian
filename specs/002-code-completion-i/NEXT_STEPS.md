# Next Steps: Resume After Type System

This document explains how to resume code completion work after the type system is implemented.

## Context

The code completion MVP (User Stories 1 & 2) has been delivered successfully:
- ✅ Operation name completions
- ✅ Custom action completions  
- ✅ Loop variable completions
- ✅ Intelligent completion ordering

However, **User Stories 3-6** require type information to work properly and have been deferred.

## Why Type System is Needed

### User Story 3: Keyword Completion
**Blocked because**: Context-aware keyword filtering requires type inference to determine valid keyword insertion points.

**Example**: Showing `break`/`continue` only inside loops needs loop detection, but also needs to understand whether the cursor is in a statement vs expression position (requires type context).

### User Story 4: Timeline Event Completion
**Blocked because**: Event completions need type-aware context to suggest appropriate events.

**Example**: Different events are valid in different timeline contexts - requires understanding timeline provider types.

### User Story 5: Variable Reference Completion (Full)
**Blocked because**: Full variable scope and type information requires type system.

**What we have**: `@@item` (loop variable only)
**What's missing**: All other variable scopes with proper type information
- `@@timeline` (type: Timeline)
- `@@currentItem` (type inferred from collection)
- `@@loopIndex` (type: number)
- `@@loopLength` (type: number)
- Custom variables from `setData` operations

### User Story 6: Parameter Name Completion
**Blocked because**: Requires type system to:
1. Infer which operation is being called from cursor position
2. Match parameters to expected types
3. Show type-aware completions inside operation calls

**Example**: Inside `selectElement({ ... })`, we need to know:
- We're inside `selectElement` (requires operation call detection + type inference)
- Available parameters: `selector: string`, `useSelectedElementAsRoot?: boolean`
- Expected types for each parameter

## How to Resume

### Step 1: Create Type System Feature
1. Create new spec: `specs/003-type-system/`
2. Design type inference system for Eligian:
   - Type annotations (optional, like TypeScript)
   - Type inference from usage
   - Type checking for operation calls
3. Implement type system in `packages/language/src/type-system/`
4. Add type information to completion context

### Step 2: Update Completion Context
Once type system exists, update `packages/language/src/completion/context.ts`:

```typescript
export interface CompletionContext {
  // Existing fields...
  isInsideLoop: boolean;
  isInsideAction: boolean;
  // ... etc.
  
  // NEW: Add type information
  expectedType?: EligianType;  // Type expected at cursor position
  inferredTypes?: Map<string, EligianType>;  // Inferred types for variables in scope
  operationSignature?: OperationSignature;  // If inside operation call
}
```

### Step 3: Resume Code Completion Spec

1. Checkout branch `002-code-completion-i` (or create new branch from it)
2. Reference `specs/002-code-completion-i/tasks.md`
3. Start at **T025** (User Story 3 - Keyword Completion)
4. Work through remaining user stories (T025-T046)
5. Complete Polish phase (T047-T054)

### Step 4: Integration Tests

After implementing deferred user stories, add integration tests that verify:
- Keywords appear in correct contexts (with type awareness)
- Events are suggested based on timeline provider type
- Variables show correct types in documentation
- Parameter completions work inside operation calls with type hints

## Files to Update

### Core Completion Modules
- `packages/language/src/completion/context.ts` - Add type information to context
- `packages/language/src/completion/keywords.ts` - NEW (T026)
- `packages/language/src/completion/events.ts` - NEW (T031)
- `packages/language/src/completion/variables.ts` - UPDATE with full scope support (T036)
- `packages/language/src/completion/parameters.ts` - NEW (T042)

### Main Provider
- `packages/language/src/eligian-completion-provider.ts` - Integrate new completion modules

### Tests
- `packages/language/src/__tests__/completion.spec.ts` - Add tests for US3-US6

## Success Criteria

You'll know this spec is complete when:
1. All 54 tasks in `tasks.md` are checked off (currently 24/54)
2. All completion tests pass (target: ~50 total tests)
3. All 5 success criteria from `spec.md` are met:
   - ✅ SC-001: 95% reduction in documentation lookups (DONE)
   - ✅ SC-002: <100ms completion time (DONE)
   - ✅ SC-003: Zero breaking changes (DONE)
   - ⏸️ SC-004: 90% reduction in parameter lookups (DEFERRED)
   - ⏸️ SC-005: 50% reduction in syntax errors (DEFERRED)
4. Manual testing in VS Code shows all 6 user stories working

## Questions?

If you need clarification while resuming this work, refer to:
- `specs/002-code-completion-i/IMPLEMENTATION_SUMMARY.md` - What was delivered
- `specs/002-code-completion-i/spec.md` - Full feature specification
- `specs/002-code-completion-i/tasks.md` - Detailed task breakdown
- `specs/002-code-completion-i/plan.md` - Technical implementation plan

Good luck! 🚀
