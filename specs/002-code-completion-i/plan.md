# Implementation Plan: Code Completion for Eligian DSL

**Branch**: `002-code-completion-i` | **Date**: 2025-10-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-code-completion-i/spec.md`

## Summary

Implement code completion for the Eligian DSL VS Code extension to provide developers with intelligent autocompletion for Eligius operations, custom actions, keywords, timeline events, variable references, and parameter names. Completions will be alphabetically sorted, display descriptions, and be context-aware (e.g., `break`/`continue` only in loops). This feature directly addresses the core pain point of Eligius JSON verbosity by reducing documentation lookups by 95% and cutting development time by 40%.

**Technical Approach**: Use Langium's `CompletionProvider` infrastructure to implement completion logic, generate operation metadata registry at build time from Eligius sources, integrate with VS Code's completion UI, and track cursor context via AST traversal for context-aware filtering.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20+ (ESM modules)
**Primary Dependencies**:
- Langium 4.0+ (language server protocol framework)
- VS Code Extension API 1.60+ (completion provider)
- Eligius operation metadata (`../eligius/src/operation/metadata/`)
- Eligius timeline events (`../eligius/src/timeline-event-names.ts`)

**Storage**: N/A (metadata loaded at build time, bundled with extension)
**Testing**: Vitest (unit tests), Langium test utilities (integration tests)
**Target Platform**: VS Code 1.60+ on Windows/Linux/macOS
**Project Type**: Monorepo with 3 packages (language, extension, CLI)
**Performance Goals**:
- Completion suggestions appear within 100ms of trigger
- Support up to 100 operations + 50 custom actions without lag
- Debounce completion computation to avoid blocking UI

**Constraints**:
- Must work offline (no runtime fetching of metadata)
- Must gracefully degrade if operation metadata is missing
- Must not break existing parsing/validation features
- Must maintain compatibility with Langium's LSP implementation

**Scale/Scope**:
- ~46 Eligius operations (from metadata registry)
- ~25 timeline events (from `timeline-event-names.ts`)
- 7 DSL keywords
- Unknown number of custom actions (document-dependent)
- ~10-20 variable references
- Parameter completion for all operations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is straightforward - Langium provides completion infrastructure, we implement provider logic. Each completion type (operations, keywords, etc.) is independently testable. Documentation will cover architecture, metadata generation, and completion logic.

- [x] **Comprehensive Testing**: Unit tests planned for each completion provider function (operations, keywords, events, variables, parameters). Integration tests will verify completion behavior in real `.eligian` files. Langium test utilities provide fixtures for testing completion providers.

- [x] **No Gold-Plating**: Feature directly solves documented user pain point (Eligius JSON verbosity, documentation lookup overhead). Scope limited to 6 user stories, with clear "Out of Scope" section (no fuzzy matching, no cross-file actions, no snippets). Implements only what's needed for MVP.

- [x] **Code Review**: Standard PR process applies (feature branch → PR → review → merge). Constitution compliance will be verified in review.

- [x] **UX Consistency**: Completion UX follows VS Code conventions (alphabetical sorting, descriptions in detail field, grouping if supported). Consistent with Langium completion patterns used in other language servers.

- [x] **Functional Programming**: Completion provider logic will be pure functions (input: AST context → output: completion items). Metadata registry is immutable after build. No global mutable state. Langium services are injected via DI, not global.

**Result**: ✅ All checks passed. No complexity violations.

## Project Structure

### Documentation (this feature)

```
specs/002-code-completion-i/
├── spec.md                   # Feature specification (user stories, requirements)
├── plan.md                   # This file (technical implementation plan)
├── research.md               # Phase 0: Technology decisions and patterns
├── data-model.md             # Phase 1: Completion metadata structure
├── quickstart.md             # Phase 1: Developer guide for using completions
├── contracts/                # Phase 1: Completion provider API contracts
│   └── completion-provider.ts # TypeScript interface definitions
└── checklists/
    └── requirements.md       # Specification quality validation
```

### Source Code (repository root)

```
packages/
├── language/                 # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium          # DSL grammar (no changes needed)
│   │   ├── eligian-module.ts        # DI module (register completion provider)
│   │   ├── eligian-completion-provider.ts  # NEW: Main completion provider
│   │   ├── eligian-validator.ts     # Existing validator (no changes)
│   │   ├── eligian-scope-provider.ts # Existing scope provider (no changes)
│   │   ├── eligian-hover-provider.ts # Existing hover provider (reference)
│   │   ├── completion/              # NEW: Completion logic modules
│   │   │   ├── operations.ts        # Operation name completion
│   │   │   ├── actions.ts           # Custom action completion
│   │   │   ├── keywords.ts          # Keyword completion
│   │   │   ├── events.ts            # Timeline event completion
│   │   │   ├── variables.ts         # Variable reference completion
│   │   │   ├── parameters.ts        # Parameter name completion
│   │   │   ├── context.ts           # Context detection (in loop, in action, etc.)
│   │   │   └── registry.ts          # Operation registry access
│   │   └── __tests__/
│   │       ├── completion.spec.ts   # NEW: Completion integration tests
│   │       └── parsing.spec.ts      # Existing (no changes)
│   └── package.json
│
├── cli/                      # Command-line compiler
│   ├── src/
│   │   ├── main.ts                  # CLI entry point
│   │   ├── commands/
│   │   │   └── generate-registry.ts # NEW: Generate operation metadata registry
│   │   └── __tests__/
│   │       └── cli.spec.ts
│   └── package.json
│
└── extension/                # VS Code extension
    ├── src/
    │   ├── extension/
    │   │   └── main.ts              # Extension entry point (no changes)
    │   ├── language/
    │   │   └── main.ts              # Language server entry point (no changes)
    │   └── metadata/                # NEW: Generated metadata (build artifact)
    │       ├── operations.generated.ts    # Operation registry
    │       └── timeline-events.generated.ts # Timeline events
    └── package.json

.specify/
└── scripts/
    └── powershell/
        └── generate-metadata.ps1    # NEW: Build script to generate metadata
```

**Structure Decision**: We use the existing monorepo structure with 3 packages. The `language` package implements completion provider logic using Langium's LSP framework. The `cli` package adds a metadata generation command to extract Eligius operation metadata at build time. The `extension` package bundles generated metadata for offline use. This approach maintains separation of concerns (language logic vs. extension packaging) and enables CLI-based compilation without VS Code dependency.

## Complexity Tracking

*No constitution violations - this section is empty.*

## Phase 0: Research & Technology Decisions

### Research Tasks

1. **Langium Completion Provider API**:
   - Investigate Langium's `CompletionProvider` interface and lifecycle
   - Understand how to register custom completion providers in Langium modules
   - Research completion context (cursor position, AST node, expected types)
   - Find examples of context-aware completions in Langium ecosystem

2. **VS Code Completion UI**:
   - Research VS Code's completion item structure (`CompletionItem`, `CompletionItemKind`)
   - Investigate grouping/categorization support in VS Code completion UI
   - Understand detail fields (description, signature, documentation)
   - Research sorting and filtering behavior

3. **Metadata Generation Strategy**:
   - Determine best approach for extracting Eligius operation metadata
   - Evaluate TypeScript AST parsing (ts-morph, TypeScript Compiler API)
   - Investigate JSDoc extraction for descriptions
   - Research build-time code generation vs. runtime loading

4. **Context Detection Patterns**:
   - Research AST traversal for determining cursor context (inside loop, inside action, etc.)
   - Investigate Langium's `AstNode` utilities for parent/ancestor lookup
   - Understand Langium's scoping mechanism for finding action definitions
   - Research caching strategies for expensive computations (action list, operation registry)

### Decisions to Make

- **Metadata Source**: Build-time generation from Eligius sources vs. runtime loading?
- **Grouping Strategy**: Use `CompletionItemKind` for grouping or custom prefixes?
- **Registry Format**: JSON file, TypeScript module, or in-memory data structure?
- **Context Detection**: AST traversal, Langium scoping, or custom visitor pattern?
- **Testing Approach**: Langium test utilities vs. custom fixture parsing?

**Output**: `research.md` documenting all decisions with rationale and alternatives

## Phase 1: Design & Contracts

### Data Model

**Entities** (see `data-model.md` for full structure):

1. **OperationMetadata**:
   - `name: string` - Operation name (e.g., "selectElement")
   - `description: string` - Human-readable description
   - `parameters: ParameterMetadata[]` - Operation parameters
   - `dependencies: string[]` - Required operationData properties
   - `outputs: string[]` - Properties added to operationData

2. **ParameterMetadata**:
   - `name: string` - Parameter name
   - `type: string` - Parameter type (ParameterType enum)
   - `required: boolean` - Is parameter required?
   - `defaultValue?: unknown` - Default value if optional
   - `description?: string` - Parameter description

3. **TimelineEventMetadata**:
   - `name: string` - Event name (e.g., "timeline-play")
   - `description: string` - JSDoc comment from Eligius source
   - `category?: string` - Event category (requests, announcements, etc.)

4. **CompletionItem** (VS Code standard):
   - `label: string` - Display name
   - `kind: CompletionItemKind` - Icon/category (Function, Variable, Keyword, etc.)
   - `detail?: string` - Signature/type info
   - `documentation?: string` - Full description
   - `sortText?: string` - Custom sort order
   - `insertText?: string` - Text to insert (may differ from label)

5. **CompletionContext**:
   - `cursorNode: AstNode` - AST node at cursor position
   - `isInsideLoop: boolean` - Is cursor inside a `for` loop?
   - `isInsideAction: boolean` - Is cursor inside an action block?
   - `isInsideEvent: boolean` - Is cursor inside an event block?
   - `expectedType?: string` - Expected type at cursor (for parameter completion)

### API Contracts

**Completion Provider Interface** (see `contracts/completion-provider.ts`):

```typescript
interface EligianCompletionProvider {
  /**
   * Provide completion items for the given cursor position
   * @param params Completion parameters from LSP
   * @param services Langium services (for AST access, scoping, etc.)
   * @returns Array of completion items
   */
  getCompletion(
    params: CompletionParams,
    services: EligianServices
  ): CompletionList;
}

interface CompletionParams {
  document: LangiumDocument;
  position: Position; // Cursor position (line, character)
  context?: CompletionContext;
}

interface CompletionList {
  isIncomplete: boolean; // More items available?
  items: CompletionItem[];
}
```

**Completion Module Interfaces** (each module implements specific completion type):

```typescript
// Operations completion
interface OperationCompletionProvider {
  getOperations(context: CompletionContext): CompletionItem[];
}

// Custom actions completion
interface ActionCompletionProvider {
  getActions(document: LangiumDocument, context: CompletionContext): CompletionItem[];
}

// Keywords completion
interface KeywordCompletionProvider {
  getKeywords(context: CompletionContext): CompletionItem[];
}

// Timeline events completion
interface EventCompletionProvider {
  getEvents(context: CompletionContext): CompletionItem[];
}

// Variable references completion
interface VariableCompletionProvider {
  getVariables(context: CompletionContext): CompletionItem[];
}

// Parameter names completion
interface ParameterCompletionProvider {
  getParameters(context: CompletionContext, operationName: string): CompletionItem[];
}
```

**Context Detection Interface**:

```typescript
interface ContextDetector {
  /**
   * Determine completion context from cursor position
   * @param document Document being edited
   * @param position Cursor position
   * @returns Context information (inside loop, inside action, etc.)
   */
  detectContext(
    document: LangiumDocument,
    position: Position
  ): CompletionContext;
}
```

**Operation Registry Interface**:

```typescript
interface OperationRegistry {
  /**
   * Get all operation metadata
   * @returns Array of operation metadata (sorted alphabetically)
   */
  getAllOperations(): OperationMetadata[];

  /**
   * Get specific operation metadata
   * @param name Operation name
   * @returns Operation metadata or undefined if not found
   */
  getOperation(name: string): OperationMetadata | undefined;

  /**
   * Check if operation should be filtered (handled by keyword)
   * @param name Operation name
   * @returns True if operation should be hidden from completions
   */
  isFilteredOperation(name: string): boolean;
}
```

### Quickstart Guide

See `quickstart.md` for developer guide covering:
- How to add new completion types
- How to regenerate operation metadata
- How to test completion providers
- How to debug completion behavior in VS Code

### Agent Context Update

After Phase 1 design, run:
```bash
.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude
```

This will add Langium completion provider patterns, metadata generation workflow, and completion testing strategies to `.specify/memory/claude-context.md`.

## Phase 2: Tasks (Generated by `/speckit.tasks`)

**Note**: This section is NOT filled by `/speckit.plan`. After this plan is complete, run `/speckit.tasks` to generate the actionable task breakdown in `tasks.md`.

The tasks will break down implementation into:
1. Metadata generation infrastructure
2. Operation registry implementation
3. Context detection logic
4. Each completion provider (operations, actions, keywords, events, variables, parameters)
5. Integration with Langium module
6. Unit tests for each module
7. Integration tests for full completion workflow
8. Documentation updates

## Re-evaluation: Constitution Check (Post-Design)

*Re-check after Phase 1 design artifacts are generated:*

- [x] **Simplicity & Documentation**: Design is straightforward - 6 completion modules, each with single responsibility. `data-model.md` documents metadata structure, `contracts/` defines clear interfaces. No unnecessary abstractions.

- [x] **Comprehensive Testing**: Testing strategy defined in research.md. Each module has unit tests (operations.spec.ts, keywords.spec.ts, etc.). Integration tests cover full completion workflow using Langium test utilities.

- [x] **No Gold-Plating**: Design strictly follows spec requirements. No extra features added. Metadata generation is necessary for offline operation (no runtime fetching). Caching is performance optimization, not speculation.

- [x] **Functional Programming**: All completion provider functions are pure (AST input → completion items output). Metadata registry is immutable. Context detection is stateless (no side effects).

**Result**: ✅ All checks still passing post-design. No concerns.

## Implementation Readiness

**Status**: ✅ Planning complete, ready for `/speckit.tasks`

**Generated Artifacts**:
- [x] plan.md (this file)
- [x] research.md (technology decisions)
- [x] data-model.md (completion metadata structure)
- [x] contracts/ (TypeScript interfaces)
- [x] quickstart.md (developer guide)
- [x] Updated agent context

**Next Steps**:
1. Run `/speckit.tasks` to generate task breakdown
2. Begin implementation with metadata generation infrastructure
3. Implement completion providers module by module (US1 → US6)
4. Write tests alongside implementation
5. Run Biome checks after each task
6. Integration test full completion workflow
7. Update documentation with examples
