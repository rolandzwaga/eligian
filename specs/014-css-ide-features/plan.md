# Implementation Plan: CSS IDE Features

**Branch**: `014-css-ide-features` | **Date**: 2025-10-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-css-ide-features/spec.md`

**Note**: This plan builds on Feature 013 (CSS Validation Infrastructure) which provides the CSSRegistryService foundation.

## Summary

This feature adds rich IDE support for CSS classes and selectors in Eligian DSL:
- **Autocomplete**: Suggest CSS classes in `className` parameters and when typing `.` or `#` in selectors
- **Hover**: Show CSS file location and rule previews when hovering over class names
- **Quick Fixes**: Create missing CSS classes in appropriate CSS files with TODO scaffolding
- **Performance**: All features must complete in <100ms to maintain responsive IDE experience

Technical approach leverages existing Langium LSP integration (completion, hover, code actions) with CSS registry data from Feature 013.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022), Node.js 20+
**Primary Dependencies**: Langium 3.x (LSP framework), Feature 013 CSSRegistryService
**Storage**: N/A (CSS metadata already in CSSRegistry from Feature 013)
**Testing**: Vitest with Langium testing utilities (`parseHelper`, LSP test helpers)
**Target Platform**: VS Code extension (Node.js runtime in language server)
**Project Type**: Monorepo (language package for LSP providers, extension package for integration)
**Performance Goals**:
- Autocomplete latency: <100ms from trigger to suggestions shown
- Hover latency: <50ms from hover to tooltip display
- Quick fix execution: <1s from trigger to CSS file updated
- Handle 1000+ CSS classes without degradation

**Constraints**:
- Must not degrade autocomplete performance for non-CSS completions
- Cursor position detection in selector strings (complex due to LSP position mapping)
- Quick fixes must use LSP WorkspaceEdit protocol (cannot directly modify CSS files)
- Hover markdown format limitations (VSCode LSP constraint)

**Scale/Scope**:
- 3-4 new provider classes
- Integration with existing EligianCompletionProvider and hover providers
- ~15-20 unit tests + 5-8 integration tests
- Estimated 2-3 days implementation (per master plan)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: IDE features are straightforward LSP providers querying CSSRegistry. Clear separation of concerns.
- [x] **Comprehensive Testing**: Unit tests for each provider + integration tests for LSP interactions planned
- [x] **No Gold-Plating**: Solves documented need (Feature 013 provides validation but no IDE productivity features)
- [x] **Code Review**: Standard PR process applies
- [x] **UX Consistency**: LSP providers follow Langium patterns, consistent with existing completion/hover
- [x] **Functional Programming**: Providers are pure functions (query CSS registry, return completion items). No mutable state.

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/014-css-ide-features/
├── plan.md              # This file
├── research.md          # Phase 0 output (Langium LSP API patterns)
├── data-model.md        # Phase 1 output (Provider interfaces, CompletionItem/Hover structures)
├── quickstart.md        # Phase 1 output (Developer guide for using CSS IDE features)
├── contracts/           # Phase 1 output (LSP protocol contracts for custom notifications if needed)
├── checklists/
│   └── requirements.md  # Already created by /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/language/src/
├── css/                            # From Feature 013
│   ├── css-parser.ts               # Existing (Feature 013)
│   ├── css-registry.ts             # Existing (Feature 013)
│   ├── selector-parser.ts          # Existing (Feature 013)
│   ├── css-completion.ts           # NEW: CSSCompletionProvider
│   ├── css-hover.ts                # NEW: CSSHoverProvider
│   └── css-code-actions.ts         # NEW: CSSCodeActionProvider
├── completion/
│   └── eligian-completion-provider.ts  # MODIFY: Integrate CSS completion
├── hover/
│   └── eligian-hover-provider.ts       # MODIFY: Integrate CSS hover (or create if missing)
├── code-actions/
│   └── eligian-code-action-provider.ts # MODIFY: Integrate CSS code actions (or create if missing)
└── __tests__/
    ├── css-ide-features/
    │   ├── completion.spec.ts      # NEW: CSS completion tests
    │   ├── hover.spec.ts           # NEW: CSS hover tests
    │   └── code-actions.spec.ts    # NEW: CSS code action tests
    └── integration/
        └── css-ide-integration.spec.ts  # NEW: End-to-end LSP tests

packages/extension/src/
└── language/
    └── main.ts                     # VERIFY: Code action provider registered if needed
```

**Structure Decision**: Single-project monorepo structure with language package containing LSP providers. Extension package only needs verification that code action provider is registered (if adding new provider type). Feature 013 already established CSS infrastructure in `packages/language/src/css/`, so we're adding 3 new files there and integrating with existing providers.

## Complexity Tracking

*No constitution violations. This section intentionally left empty.*

## Phase 0: Research & Unknowns

The following areas require investigation to fill knowledge gaps:

### Research Topics

1. **Langium Completion API Patterns**
   - Question: How to detect cursor position in string literals for selector completion?
   - Question: How to rank CSS completions higher than other suggestions?
   - Question: What's the completion item format for property vs method suggestions?

2. **Langium Hover API Integration**
   - Question: How to detect hover over specific parts of string literals?
   - Question: What's the markdown format for showing file locations and CSS previews?
   - Question: How to handle hover on compound selectors (e.g., ".button.primary")?

3. **Langium Code Actions API**
   - Question: How to create quick fix actions from validation diagnostics?
   - Question: How to construct LSP WorkspaceEdit for modifying CSS files?
   - Question: How to determine cursor position in file for inserting new CSS rules?

4. **Performance Best Practices**
   - Question: Should completion items be cached or generated on-demand?
   - Question: How to avoid blocking the LSP server with large CSS files?

### Research Methodology

For each topic, use context7 MCP server to query Langium documentation:
- `mcp__context7__resolve-library-id` with "langium"
- `mcp__context7__get-library-docs` focusing on completion, hover, and code actions topics

Document findings in `research.md` with:
- **Decision**: What API/pattern to use
- **Rationale**: Why this approach (performance, maintainability, Langium conventions)
- **Alternatives Considered**: Other approaches evaluated

**Output**: `research.md` with all questions resolved

## Phase 1: Design & Contracts

*Prerequisites: `research.md` complete*

### 1. Data Model (`data-model.md`)

Define structures for:

**CSSCompletionProvider Interface**:
- Input: CompletionContext (cursor position, AST node, document)
- Output: CompletionItem[] (label, kind, detail, documentation, insertText, sortText)
- Methods: `provideCSSClassCompletions`, `provideSelectorCompletions`

**CSSHoverProvider Interface**:
- Input: HoverParams (position, document)
- Output: Hover | undefined (markdown content with file location and CSS rules)
- Methods: `provideCSSClassHover`, `provideCSSIDHover`

**CSSCodeActionProvider Interface**:
- Input: CodeActionContext (diagnostics, document, range)
- Output: CodeAction[] (title, kind, edit or command)
- Methods: `provideCreateClassAction`, `provideGoToDefinitionAction`

**CSS Metadata Structures** (from Feature 013):
- Already defined in CSSRegistry
- Document how providers query registry for classes, IDs, locations, rules

### 2. API Contracts (`contracts/`)

Since this is LSP integration, contracts are defined by Langium/LSP protocol. Document:

**LSP Standard Protocols Used**:
- `textDocument/completion` - Completion requests
- `textDocument/hover` - Hover requests
- `textDocument/codeAction` - Code action requests

**Custom Notifications** (if any):
- None expected (Feature 013 already handles `css/updated` notifications)

**Provider Registration Patterns**:
- Document how providers integrate with Langium services
- Document registration in `eligian-module.ts` if needed

### 3. Agent Context Update

Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude` to:
- Add "Langium LSP providers" to technology list
- Add "VS Code code actions" to technology list
- Preserve existing Feature 013 CSS entries

### 4. Quickstart Guide (`quickstart.md`)

Developer guide covering:
- How to trigger CSS autocomplete (type `addClass("")` and position cursor)
- How to use hover (hover over class name strings)
- How to apply quick fixes (click lightbulb icon on validation errors)
- Performance characteristics (<100ms completion, <50ms hover)
- Troubleshooting (CSS not loading, completions not showing)

**Output**: `data-model.md`, `contracts/` (or justification if none needed), `quickstart.md`, updated agent context file

## Re-Constitution Check

*After Phase 1 design completion, re-verify constitution compliance:*

- [x] **Design simplicity**: Providers are thin adapters over CSSRegistry queries. No complex state management.
- [x] **Testing approach**: Each provider has unit tests + integration tests for LSP protocol
- [x] **Functional purity**: Providers query registry (read-only), return new completion items. No side effects.
- [x] **Dependencies**: No new dependencies (Langium already available, Feature 013 provides CSS registry)

*All checks still pass after design phase.*

## Next Steps

1. Execute Phase 0 research using context7 MCP server
2. Document findings in `research.md`
3. Execute Phase 1 design
4. Generate `data-model.md`, `quickstart.md`, and contracts
5. Update agent context
6. Report completion to user with file paths

*This plan ends after Phase 1. Use `/speckit.tasks` to generate implementation tasks.*
