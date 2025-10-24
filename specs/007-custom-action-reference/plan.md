# Implementation Plan: Custom Action Reference Provider

**Branch**: `007-custom-action-reference` | **Date**: 2025-10-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-custom-action-reference/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement "Go to Definition" functionality for custom actions in the Eligian DSL by creating a custom Langium reference provider. When developers Ctrl+Click on custom action calls like `fadeIn("#box", 1000)` in timeline events, inline blocks, sequences, or staggers, the IDE will navigate directly to the action definition. This requires implementing a custom ScopeProvider that resolves action names to ActionDefinition AST nodes and integrating with Langium's LSP References service.

**Technical Approach**: Extend Langium's reference resolution system without modifying the existing grammar. The `OperationCall` AST node already has an `operationName` field - we'll create a custom ScopeProvider that checks if that name matches an action definition, and if so, provides the ActionDefinition as a reference target. The Langium DefaultReferencesProvider will handle LSP integration automatically once the ScopeProvider returns proper scopes.

## Technical Context

**Language/Version**: TypeScript 5.3+ with Node.js 20+ ESM
**Primary Dependencies**: Langium 3.x (language server framework), Vitest (testing)
**Storage**: N/A (single-document references only)
**Testing**: Vitest with Langium test utilities (@langium/testing)
**Target Platform**: VS Code Extension (Node.js runtime)
**Project Type**: Single project (language package)
**Performance Goals**: Reference resolution under 1 second for files with 100+ action definitions
**Constraints**: <1s navigation latency, <5% LSP overhead, single-document scope only
**Scale/Scope**: Single-document references (no cross-file), typical files have 5-20 action definitions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

### Initial Check (Before Phase 0)

- [x] **Simplicity & Documentation**: The approach is straightforward - extend existing ScopeProvider, no complex abstractions. ScopeProvider pattern is well-documented in Langium. Clear documentation will be added for reference resolution logic.

- [x] **Comprehensive Testing**: Test-first development planned:
  - Unit tests for ScopeProvider logic (resolve action names, handle non-existent actions)
  - Integration tests for LSP navigation (Ctrl+Click scenarios from spec)
  - Tests will cover all timeline contexts (direct calls, inline blocks, sequences, staggers)

- [x] **No Gold-Plating**: Solves documented user need - developers currently can't navigate to action definitions after OperationCall unification (Feature 006). No speculative features - only implementing P1 user stories initially.

- [x] **Code Review**: Standard PR process applies. Review will verify ScopeProvider correctness, test coverage, and LSP integration.

- [x] **UX Consistency**: Uses standard VS Code navigation (Ctrl+Click, F12) - consistent with existing LSP features. No custom UI required.

- [x] **Functional Programming**: ScopeProvider will be a pure service - given ReferenceInfo context, returns Scope. No mutable state. Langium services are already Effect-compatible (dependency injection via Context).

### Post-Design Check (After Phase 1)

- [x] **Simplicity & Documentation**: ✅ CONFIRMED
  - Research validated approach: Override `getScope()`, use `MapScope`, no ScopeComputation needed
  - Data model clearly documents all entities and relationships
  - API contract fully specifies behavior and integration points
  - No complex abstractions introduced

- [x] **Comprehensive Testing**: ✅ CONFIRMED
  - Test strategy defined in research.md: Unit tests + integration tests
  - API contract specifies 6 unit test cases and 6 integration test cases
  - Coverage plan includes all timeline contexts (5 scenarios)
  - Quickstart provides manual verification steps

- [x] **No Gold-Plating**: ✅ CONFIRMED
  - Implementation limited to P1 user stories (direct calls, inline blocks)
  - P2 stories (sequences, staggers) share same resolution logic (no extra work)
  - P3 story (Find All References) works automatically via DefaultReferencesProvider
  - No speculative features added

- [x] **Code Review**: ✅ CONFIRMED
  - Standard PR process documented in API contract
  - Review checklist includes all constitution compliance checks
  - Implementation checklist ensures quality gates

- [x] **UX Consistency**: ✅ CONFIRMED
  - Uses standard VS Code LSP features (no custom UI)
  - Ctrl+Click, F12, Shift+F12, Alt+F12 all work automatically
  - Consistent error handling (EMPTY_SCOPE → validator shows error)

- [x] **Functional Programming**: ✅ CONFIRMED
  - ScopeProvider.getScope() is pure function (ReferenceInfo → Scope)
  - No mutable state in implementation
  - findActionByName() helper is pure function
  - Langium services injected via dependency injection

**Result**: All constitution checks pass. Design is compliant with all principles. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```
specs/007-custom-action-reference/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── scope-provider-api.yaml   # ScopeProvider interface contract
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/language/
├── src/
│   ├── eligian-scope-provider.ts         # MODIFY: Extend with action reference resolution
│   ├── eligian-module.ts                  # VERIFY: ScopeProvider registration (already exists)
│   ├── eligian.langium                    # NO CHANGE: Grammar remains unchanged
│   ├── utils/
│   │   └── action-resolver.ts             # NEW: Helper to find ActionDefinition by name
│   └── __tests__/
│       ├── references.spec.ts             # NEW: ScopeProvider unit tests
│       └── lsp-navigation.spec.ts         # NEW: Integration tests for "Go to Definition"
```

**Structure Decision**: Single project structure (Option 1). The reference provider is a language server concern, so all changes are in `packages/language/`. No compiler changes needed - this is purely IDE/LSP integration. The `eligian-scope-provider.ts` file already exists and handles scoping; we'll extend it with action reference resolution logic.

## Complexity Tracking

*No constitution violations - this section is empty.*

## Phase 0: Research & Technical Decisions

**Unknowns to Resolve**:

1. **Langium ScopeProvider API**: How to extend DefaultScopeProvider for custom reference resolution?
   - Research: Study Langium ScopeProvider documentation and examples
   - Decision needed: Override `getScope()` method or use ScopeComputation hooks?

2. **ReferenceInfo Context**: What information is available in ReferenceInfo when resolving OperationCall references?
   - Research: Examine ReferenceInfo structure (reference, container, property, index)
   - Decision needed: How to distinguish action calls from operation calls in ScopeProvider?

3. **Scope Construction**: How to create Scope objects that point to ActionDefinition nodes?
   - Research: Study Langium Scope API and construction patterns
   - Decision needed: Use `StreamScope`, `MapScope`, or custom Scope implementation?

4. **LSP Integration**: Does DefaultReferencesProvider automatically work once ScopeProvider returns proper scopes?
   - Research: Understand Langium's DefaultLinker and DefaultReferencesProvider behavior
   - Decision needed: Do we need custom References provider or is ScopeProvider sufficient?

5. **Testing Strategy**: How to test LSP navigation with Langium test utilities?
   - Research: Study `@langium/testing` utilities for references testing
   - Decision needed: Mock LSP requests or use helper functions?

**Research Tasks** (to be completed in Phase 0):

- Task 1: Research Langium ScopeProvider patterns (context7 + official docs)
- Task 2: Research ReferenceInfo structure and usage
- Task 3: Research Scope construction and types
- Task 4: Research DefaultLinker and DefaultReferencesProvider integration
- Task 5: Research Langium testing utilities for references

**Output**: `research.md` with findings and decisions for all unknowns

## Phase 1: Design Artifacts

**Prerequisites**: `research.md` complete with all decisions

**Data Model** (`data-model.md`):

- **ActionDefinition** (existing AST node - no changes):
  - `name: string` - Action identifier
  - `parameters: ActionParameter[]` - Parameter list
  - `operations: OperationStatement[]` - Action body
  - Source location (line, column) - For navigation target

- **OperationCall** (existing AST node - no changes):
  - `operationName: string` - Name to resolve (action or operation)
  - `args: Expression[]` - Call arguments
  - Source location (line, column) - For navigation source

- **ActionReference** (conceptual - handled by Langium):
  - Represents the link from OperationCall to ActionDefinition
  - Managed by Langium's reference resolution system (not an explicit AST node)

- **ReferenceInfo** (Langium type):
  - `reference: Reference` - The reference object to resolve
  - `container: AstNode` - Parent AST node (e.g., OperationCall)
  - `property: string` - Property name being resolved (e.g., "operationName")
  - `index?: number` - Array index if reference is in array

- **Scope** (Langium type):
  - Represents available symbols for resolution
  - Contains ActionDefinition nodes for action references

**API Contracts** (`contracts/scope-provider-api.yaml`):

OpenAPI-style documentation of ScopeProvider extension interface:
- `getScope(context: ReferenceInfo): Scope` - Main entry point
- Helper functions for action resolution
- Expected behavior for each timeline context

**Quickstart** (`quickstart.md`):

Step-by-step guide for testing the reference provider:
1. Open example `.eligian` file with action definitions
2. Navigate to timeline event with action call
3. Ctrl+Click on action name → should jump to definition
4. Test in all contexts (inline blocks, sequences, staggers)

**Agent Context Update**:

Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude` to add:
- Langium ScopeProvider patterns
- Reference resolution architecture
- Testing patterns for LSP features

## Phase 2: Task Generation

**Not part of `/speckit.plan` - use `/speckit.tasks` command to generate tasks.md**

The tasks will cover:
- Implement EligianScopeComputation to precompute action index (O(1) lookup)
- Extend EligianScopeProvider to use precomputed action scopes
- Write ScopeComputation unit tests (verify action indexing)
- Write ScopeProvider unit tests (resolve actions from precomputed scopes)
- Write LSP integration tests (Ctrl+Click scenarios from spec)
- Test all timeline contexts (direct calls, inline blocks, sequences, staggers)
- Verify "Find All References" works automatically

## Implementation Notes

### Key Design Decisions (Finalized After Phase 0)

1. **No Grammar Changes**: The existing `OperationCall` node with `operationName=ID` is sufficient. We don't need grammar-level cross-references (`action=[ActionDefinition:ID]`) which would cause parsing ambiguity.

2. **Indexed Lookup Strategy** (Updated for Library Import Support):
   - Use **ScopeComputation** to precompute action index when document changes
   - Use **ScopeProvider** to resolve references from precomputed index
   - **Rationale**: Future library imports may bring 100+ actions into scope; O(1) indexed lookup is critical for performance
   - Linear search (O(n)) would be acceptable for current 5-20 actions, but won't scale to library imports

3. **Resolution Logic**:
   ```
   ScopeComputation (runs once per document change):
   1. Index all ActionDefinition nodes in document
   2. Create AstNodeDescription for each action
   3. Store in precomputed scope map (O(1) lookup)

   ScopeProvider (runs per reference resolution):
   1. Get precomputed scopes from ScopeComputation
   2. Filter for ActionDefinition types
   3. Return Scope with indexed actions
   4. Langium matches by name automatically (O(1) hash lookup)
   ```

4. **LSP Integration**: Langium's DefaultReferencesProvider automatically provides "Go to Definition" and "Find All References" once ScopeProvider returns proper scopes. No custom References provider needed.

5. **Future Library Import Support**: When imports are added, only ScopeComputation needs updating:
   - Extend `computeLocalScopes()` to index imported actions
   - Add imported action descriptions to current document's scope
   - ScopeProvider continues working without changes (automatic)

6. **Testing Approach**:
   - Unit tests: Test ScopeProvider.getScope() with various ReferenceInfo contexts
   - Integration tests: Use Langium test utilities to simulate Ctrl+Click and verify navigation

### Risk Mitigation

**Risk**: ScopeProvider changes break existing validation or scoping
**Mitigation**: Extensive regression tests, verify all existing tests still pass

**Risk**: Performance degradation for large files with many actions
**Mitigation**: Benchmark reference resolution with 100+ action definitions, optimize if needed

**Risk**: LSP integration doesn't work automatically
**Mitigation**: Research phase will confirm DefaultReferencesProvider behavior, plan custom provider if needed

## Success Metrics (from Spec)

- **SC-001**: Navigation completes in <1s for 100 action definitions ✅ (measure in tests)
- **SC-002**: 100% resolution accuracy across all timeline contexts ✅ (integration tests verify)
- **SC-003**: Zero false positives/negatives ✅ (comprehensive test suite)
- **SC-004**: "Find All References" works correctly ✅ (integration tests verify)
- **SC-005**: Zero config changes needed ✅ (ScopeProvider auto-registers)
- **SC-006**: <5% LSP overhead ✅ (benchmark before/after)
- **SC-007**: 90% adoption without docs ✅ (intuitive Ctrl+Click behavior)

## Next Steps

1. Execute Phase 0 research (generate `research.md`)
2. Execute Phase 1 design (generate `data-model.md`, `contracts/`, `quickstart.md`)
3. Update agent context with new Langium patterns
4. Re-evaluate Constitution Check post-design
5. Use `/speckit.tasks` to generate task breakdown for implementation
