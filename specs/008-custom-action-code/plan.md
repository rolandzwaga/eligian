# Implementation Plan: Custom Action Code Completions

**Branch**: `008-custom-action-code` | **Date**: 2025-10-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-custom-action-code/spec.md`

## Summary

Extend the existing Eligian code completion provider to include custom actions alongside built-in operations. Each completion item will be prefixed with either `operation:` or `action:` for visual distinction, and the combined list will be alphabetically sorted. When a user selects an item, only the actual name (without prefix) will be inserted into the document.

**Technical Approach**: Enhance `EligianCompletionProvider` to query the document for `ActionDefinition` nodes and add them to the existing operation-based completion items. Use Langium's `CompletionItem` structure with separate `label` (includes prefix) and `insertText` (name only) properties.

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js 20+ (ESM)
**Primary Dependencies**: Langium 3.x (LSP framework), VS Code Language Server Protocol
**Storage**: N/A (in-memory document parsing)
**Testing**: Vitest with Langium test utilities (`expectCompletion` from `langium/test`)
**Target Platform**: VS Code Extension (Node.js runtime)
**Project Type**: Single project (language server extension)
**Performance Goals**: Completion suggestions appear within 200ms of trigger
**Constraints**: Must work with existing completion infrastructure; alphabetical sorting case-insensitive
**Scale/Scope**: Expected 5-50 custom actions per document; operation registry has ~48 operations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach extends existing `EligianCompletionProvider` without architectural changes. Clear documentation required for prefix convention.
- [x] **Comprehensive Testing**: Integration tests using Langium's `expectCompletion` utility planned. Unit tests for action discovery and sorting logic.
- [x] **No Gold-Plating**: Solves documented need (US1: developer discoverability of custom actions). No speculative features (out of scope: cross-file refs, hover hints, parameters).
- [x] **Code Review**: Standard PR review process applies.
- [x] **UX Consistency**: Uses same completion trigger and interface as existing operation completions. Consistent with Langium LSP patterns.
- [x] **Functional Programming**: Completion provider methods are pure (same input → same output). No mutable state in completion logic.

*All checks passed. No constitutional violations.*

## Project Structure

### Documentation (this feature)

```
specs/008-custom-action-code/
├── plan.md              # This file
├── research.md          # Langium completion API patterns
├── data-model.md        # CompletionItem structure
├── quickstart.md        # Feature usage guide
├── contracts/           # LSP CompletionItem interface
└── checklists/
    └── requirements.md  # Specification validation checklist
```

### Source Code (repository root)

```
packages/language/src/
├── eligian-completion-provider.ts   # MODIFY: Add custom action completion
├── generated/
│   └── ast.ts                       # READ: ActionDefinition type
└── __tests__/
    └── completion.spec.ts           # MODIFY: Add action completion tests
```

**Structure Decision**: Existing single-project structure (`packages/language/`) is used. This feature modifies the existing completion provider rather than creating new files.

## Complexity Tracking

No constitutional violations. Feature uses existing infrastructure and follows established patterns.

---

## Phase 0: Research & Unknowns

### Research Tasks

**R1: Langium Completion API Patterns**
- **Question**: How does Langium's `CompletionProvider` allow customizing `label` vs `insertText`?
- **Research Method**: Consult context7 for Langium completion examples
- **Expected Outcome**: Confirm `CompletionItem` structure supports prefixed labels with unprefixed insert text

**R2: Action Discovery Pattern**
- **Question**: What's the best way to retrieve all `ActionDefinition` nodes from the current document?
- **Research Method**: Review existing Langium services usage in `EligianScopeProvider` (already queries actions)
- **Expected Outcome**: Confirm using `AstUtils.getDocument()` and filtering `program.elements`

**R3**: Alphabetical Sorting Behavior**
- **Question**: Should sorting be case-sensitive or case-insensitive?
- **Research Method**: Review user spec (says "alphabetically" without specification)
- **Expected Outcome**: Assume case-insensitive (industry standard), confirm with user if needed

### Dependencies & Integration Points

**Existing Code**:
- `EligianCompletionProvider` (packages/language/src/eligian-completion-provider.ts)
  - Already provides operation completions
  - Uses `completionFor()` method from Langium
  - Returns `CompletionItem[]`

**Langium Services**:
- `AstUtils.getDocument()` - Get current document from AST node
- `CompletionItem` - LSP completion item structure
- `expectCompletion` test utility - Test completion suggestions

**Operation Registry**:
- `OPERATION_REGISTRY` - Existing source of operation metadata
- Already used for operation completions

### Technical Unknowns (TO BE RESOLVED)

1. **Completion Context**: Where exactly is completion triggered? (Need to verify trigger points in timeline events, action bodies, control flow)
2. **Langium CompletionItem Properties**: Exact property names for label vs insert text (check Langium types)
3. **Sorting Implementation**: Where does sorting happen? (Langium LSP client or provider?)

---

## Phase 1: Design Artifacts

### Data Model

**CompletionItem Structure** (Langium LSP):
```typescript
interface CompletionItem {
  label: string;          // Display in IDE (includes prefix)
  insertText?: string;    // Text to insert (name only)
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string;
  sortText?: string;      // Optional: control sort order
}
```

**Action Discovery Model**:
```typescript
// Input: Current document AST
// Output: Array of ActionDefinition nodes
function getAllActionsInDocument(document: LangiumDocument): ActionDefinition[] {
  const program = document.parseResult.value as Program;
  return program.elements.filter(isActionDefinition);
}
```

**Completion Generation Model**:
```typescript
// For each operation:
CompletionItem {
  label: "operation: selectElement",
  insertText: "selectElement",
  kind: CompletionItemKind.Function
}

// For each custom action:
CompletionItem {
  label: "action: fadeIn",
  insertText: "fadeIn",
  kind: CompletionItemKind.Function
}
```

**Sorting Strategy**:
- Combine operations + actions into single array
- Sort by `label` field (case-insensitive comparison)
- No need for `sortText` field if labels are already in desired order

### API Contracts

**LSP Completion Request/Response** (Langium handles this automatically):

```typescript
// User triggers completion (Ctrl+Space or type in valid context)
// Langium calls: EligianCompletionProvider.getCompletion(context)

interface CompletionContext {
  document: LangiumDocument;
  position: Position;          // Cursor position
  node: AstNode;               // AST node at cursor
  tokenEndOffset: number;
}

// Provider returns:
type CompletionList = CompletionItem[];
```

**No new API contracts needed** - feature extends existing Langium completion API.

### Quickstart Guide

**Feature Usage**:

1. **Developer writes Eligian code**:
   ```eligian
   action fadeIn(selector: string) [
     selectElement(selector)
   ]

   timeline "main" in ".container" using raf {
     at 0s..1s |  // <- Cursor here, press Ctrl+Space
   }
   ```

2. **Completion list shows**:
   ```
   action: fadeIn
   operation: addClass
   operation: animate
   operation: selectElement
   operation: wait
   ...
   ```

3. **User selects `action: fadeIn`**:
   - Inserted text: `fadeIn`
   - Result: `at 0s..1s fadeIn()`

**Testing the Feature**:
```bash
# Run completion tests
npm run test -- completion.spec.ts

# Manual test in VS Code
1. Open .eligian file
2. Define a custom action
3. Trigger completion in timeline event
4. Verify action appears with "action:" prefix
```

---

## Phase 2: User Story Breakdown

### US1: See Custom Actions in Code Completion (P1)

**Acceptance Criteria**:
- Completion list includes custom actions with `action:` prefix
- Completion list includes operations with `operation:` prefix
- Custom actions appear when completion triggered in timeline events, action bodies, control flow

**Technical Tasks**:
1. Modify `EligianCompletionProvider.getCompletion()` to query document for actions
2. Generate `CompletionItem` objects for each action with `action:` prefix
3. Generate `CompletionItem` objects for each operation with `operation:` prefix
4. Combine and return both arrays

**Implementation Notes**:
- Reuse action discovery logic from `EligianScopeProvider` (already queries actions)
- Ensure completion works in all operation contexts (validated by existing completion trigger logic)

**Test Strategy**:
- Integration test: Define action `fadeIn`, trigger completion, verify `action: fadeIn` appears
- Integration test: Verify operations show `operation:` prefix
- Integration test: Verify completion works in timeline events, action bodies, if/else, for loops

**Estimated Complexity**: Low (extends existing pattern)

---

### US2: Alphabetical Sorting of Combined List (P2)

**Acceptance Criteria**:
- Operations and actions sorted alphabetically in single unified list
- Sorting is case-insensitive
- Prefix included in sort comparison

**Technical Tasks**:
1. Combine operation + action `CompletionItem` arrays
2. Sort by `label` field using case-insensitive comparison
3. Return sorted array

**Implementation Notes**:
- Use `Array.sort()` with `localeCompare` for case-insensitive alphabetical sorting
- Example: `items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))`

**Test Strategy**:
- Integration test: Create actions `fadeIn`, `setup`; verify sorted with operations `addClass`, `selectElement`, `wait`
- Integration test: Verify action `aaa` appears before operation `zzz`
- Unit test: Test sorting function with various action/operation combinations

**Estimated Complexity**: Trivial (single line of code)

---

### US3: Prefix Clarity for Type Distinction (P3)

**Acceptance Criteria**:
- Every operation has `operation:` prefix in label
- Every custom action has `action:` prefix in label
- Selecting item inserts only the name (without prefix)

**Technical Tasks**:
1. Set `CompletionItem.label` to include prefix
2. Set `CompletionItem.insertText` to exclude prefix
3. Verify Langium uses `insertText` when user selects item

**Implementation Notes**:
- Langium's LSP client handles `insertText` vs `label` distinction automatically
- Test that selection inserts correct text (use `expectCompletion` test utility)

**Test Strategy**:
- Integration test: Select `operation: selectElement`, verify only `selectElement` inserted
- Integration test: Select `action: fadeIn`, verify only `fadeIn` inserted
- Visual test: Verify prefix appears in completion UI

**Estimated Complexity**: Trivial (CompletionItem property configuration)

---

## Implementation Order

**Phase 2A: Core Feature (US1)**
1. Modify `EligianCompletionProvider` to query actions
2. Add action completion items with prefix
3. Add operation prefix to existing completions
4. Write integration tests

**Phase 2B: Sorting (US2)**
1. Implement alphabetical sorting of combined list
2. Write sorting tests

**Phase 2C: Prefix Handling (US3)**
1. Verify `insertText` vs `label` behavior
2. Write selection tests

**Dependencies**: US2 and US3 depend on US1 completion infrastructure

---

## Testing Strategy

### Integration Tests (Langium `expectCompletion`)

**Test File**: `packages/language/src/__tests__/completion.spec.ts`

**Test Cases**:
1. **US1-T1**: Custom action appears in completion list
2. **US1-T2**: Operations appear with `operation:` prefix
3. **US1-T3**: Actions appear with `action:` prefix
4. **US1-T4**: Completion works in timeline events
5. **US1-T5**: Completion works in action bodies
6. **US1-T6**: Completion works in control flow (if/for)
7. **US2-T1**: List is alphabetically sorted
8. **US2-T2**: Case-insensitive sorting (action `AAA` before operation `aaa`)
9. **US3-T1**: Selecting operation inserts name only
10. **US3-T2**: Selecting action inserts name only

### Unit Tests

**Test File**: `packages/language/src/__tests__/completion-sorting.spec.ts` (optional, if sorting extracted to utility)

**Test Cases**:
1. Sort mixed operations and actions
2. Handle empty action list
3. Handle empty operation list

### Manual Testing Checklist

- [ ] Open `.eligian` file with custom actions
- [ ] Trigger completion in timeline event
- [ ] Verify actions and operations appear
- [ ] Verify prefixes are correct
- [ ] Verify alphabetical order
- [ ] Select action, verify name-only insertion
- [ ] Select operation, verify name-only insertion
- [ ] Test with 20+ custom actions (performance check)

---

## Success Metrics

**From Spec**:
- SC-001: 100% of custom actions appear in completion ✅ (verified by test)
- SC-002: Single alphabetically sorted view ✅ (verified by test)
- SC-003: 100% of custom actions included ✅ (verified by test)
- SC-004: Visual distinction clear ✅ (verified by manual test)
- SC-005: Updates within 1 second ✅ (Langium handles reactivity)

**Additional Metrics**:
- Test coverage: 80%+ for completion provider logic
- Performance: < 200ms completion response time (measure in manual test)
- No regressions: Existing operation completions still work

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Langium doesn't support `insertText` vs `label` | High - can't remove prefix on insertion | Research Langium completion API early (Phase 0) |
| Sorting breaks existing operation order | Medium - user confusion | Test sorting thoroughly, document behavior |
| Performance with 100+ actions | Low - completion lag | Profile completion with large action count, optimize if needed |
| Completion doesn't trigger in all contexts | Medium - incomplete feature | Test in all operation contexts (timeline, actions, control flow) |

**Mitigation Strategy**:
- Phase 0 research resolves API questions before implementation
- Comprehensive integration tests catch context issues
- Performance testing with large action count (50+ actions)

---

## Dependencies

**External**:
- Langium 3.x - Completion provider API
- VS Code Language Server Protocol - CompletionItem structure

**Internal**:
- `EligianCompletionProvider` - Existing completion infrastructure
- `OPERATION_REGISTRY` - Existing operation metadata
- `ActionDefinition` AST type - Existing grammar definition

**No new dependencies required.**

---

## Open Questions

1. **Completion Trigger Points**: Do we need to modify completion triggers, or does existing logic already cover all contexts?
   - *Resolution Approach*: Review existing completion provider trigger logic

2. **Case-Insensitive Sorting**: Confirm user preference for case-insensitive vs case-sensitive sorting
   - *Resolution Approach*: Assume case-insensitive (industry standard), confirm if user objects

3. **CompletionItem Kind**: Should actions use a different `CompletionItemKind` than operations?
   - *Resolution Approach*: Use `Function` for both (consistent with operations)

---

## Next Steps

**After `/speckit.plan` completes**:
1. Run `/speckit.tasks` to generate task list from user stories
2. Implement Phase 0 research (Langium completion API)
3. Implement Phase 1 data model and contracts (CompletionItem structure)
4. Implement Phase 2 user stories (US1 → US2 → US3)
5. Verify test coverage meets 80% threshold
6. Run Biome check and TypeScript type checking
7. Manual testing in VS Code extension
8. Create pull request

**Estimated Timeline**: 1-2 development sessions (feature is straightforward extension of existing completion)
