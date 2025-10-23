# Implementation Plan: Unified Custom Action and Operation Call Syntax

**Branch**: `006-currently-a-custom` | **Date**: 2025-01-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-currently-a-custom/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Unify the syntax for calling custom actions and built-in operations in timeline events, allowing them to be mixed seamlessly using square bracket notation. The compiler must distinguish between the two types of calls, enforce name collision prevention, and provide clear error messages when conflicts occur.

## Technical Context

**Language/Version**: TypeScript with Node.js ESM (existing project stack)
**Primary Dependencies**: Langium (grammar/parsing), Effect-TS (compilation pipeline), Vitest (testing)
**Storage**: N/A (compiler processes files, no persistent storage)
**Testing**: Vitest with TDD workflow (unit + integration tests)
**Target Platform**: Node.js 20+ (CLI compiler) + VS Code Extension (language server)
**Project Type**: Single project (monorepo with packages/language, packages/compiler, packages/extension)
**Performance Goals**: NEEDS CLARIFICATION - What is acceptable compilation time increase for name resolution?
**Constraints**: Must maintain 100% backward compatibility with existing DSL code (deprecation warnings allowed)
**Scale/Scope**: NEEDS CLARIFICATION - How many custom actions per file is reasonable? How many operations in Eligius registry?

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is clear - extend grammar to allow calls in timeline events, use name resolution to distinguish action vs operation. Well-documented in spec.
- [x] **Comprehensive Testing**: TDD planned - grammar tests, validation tests, transformer tests, integration tests for mixed calls
- [x] **No Gold-Plating**: Solves documented user pain (weird curly brace syntax), unifies two concepts into one
- [x] **Code Review**: Standard PR process applies (constitution Principle IV)
- [x] **UX Consistency**: Error messages follow existing pattern, syntax unification improves consistency
- [x] **Functional Programming**: Effect-TS used in compiler, external immutability maintained, name registry is immutable map
- [x] **UUID-Based Identifiers**: Not applicable (no new Eligius config elements, just call resolution)
- [x] **ESM Import Extensions**: All imports use `.js` extensions (existing project standard)
- [x] **Validation Pattern**: Compiler-first validation for name collisions, exposed to Langium validator
- [x] **Biome Integration**: Code quality checks mandatory after each task
- [x] **Operation Metadata Consultation**: Must check operation registry for name collision detection
- [x] **Concise Communication**: Brief, technical communication for senior developer
- [x] **Language Spec Maintenance**: LANGUAGE_SPEC.md must be updated with new syntax rules

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/006-currently-a-custom/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command - may be empty for compiler features)
├── checklists/          # Quality checklists
│   └── requirements.md  # Spec validation checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/language/
├── src/
│   ├── eligian.langium                  # Grammar: extend TimelineEvent to accept OperationCall
│   ├── eligian-validator.ts             # Validation: name collision checks
│   ├── eligian-scope.ts                 # Scoping: custom action resolution
│   ├── eligian-completion-provider.ts   # Code completion: suggest actions + operations
│   └── __tests__/
│       ├── parsing.spec.ts              # Grammar tests: parse mixed calls
│       ├── validation.spec.ts           # Validation tests: name collision detection
│       └── completion.spec.ts           # Completion tests: suggest both types
│
├── compiler/
│   ├── src/
│   │   ├── ast-transformer.ts           # Transform: distinguish action vs operation calls
│   │   ├── name-resolver.ts             # NEW: Resolve call names to actions or operations
│   │   ├── error-reporter.ts            # Error messages: suggest similar names
│   │   └── __tests__/
│   │       ├── transformer.spec.ts      # Transform tests: mixed calls in timeline events
│   │       ├── name-resolver.spec.ts    # NEW: Name resolution tests
│   │       └── integration/
│   │           └── mixed-calls.spec.ts  # NEW: End-to-end tests for feature
│
└── extension/
    └── (No changes needed - language server auto-picks up validation)
```

**Structure Decision**: Existing monorepo structure applies. Main changes in `packages/language` (grammar, validation, scoping) and `packages/language/src/compiler` (name resolution, transformation). No new packages needed.

## Complexity Tracking

*No constitution violations. This section is empty.*

## Phase 0: Research & Open Questions

**Status**: NEEDS EXECUTION

### Research Tasks

#### RT-001: Grammar Design for Unified Call Syntax
**Question**: How should the grammar differentiate between action calls and operation calls if syntax is identical?
**Context**: Currently `TimelineEvent` accepts inline actions with curly braces and operations with square brackets. Need to unify to square brackets only.
**Research needed**:
- Examine current Langium grammar for `TimelineEvent`, `InlineAction`, `OperationCall`
- Determine if we need a new AST node type `CallStatement` that encompasses both
- Or if we can reuse `OperationCall` and resolve to action at validation/transformation time
- Investigate Langium best practices for ambiguous syntax resolution

**Approach**: Use Task agent to analyze current grammar and propose unified call syntax

#### RT-002: Name Resolution Strategy
**Question**: At what stage should we resolve call names - parsing, validation, or transformation?
**Context**: Need to distinguish custom actions from operations for correct code generation
**Research needed**:
- Langium scoping/linking phase - can we resolve during linking?
- Should custom actions be added to a symbol table that Langium can reference?
- How does Langium handle cross-references to user-defined vs built-in symbols?
- Performance implications of resolution stage choice

**Approach**: Use context7 to research Langium scoping and cross-reference APIs

#### RT-003: Operation Registry Access
**Question**: How do we efficiently check if a name is a registered operation?
**Context**: Need to detect name collisions and resolve ambiguous calls
**Research needed**:
- Current operation registry structure (`registry.generated.ts`)
- API for querying operation names
- Should we build a Set of operation names at startup for O(1) lookup?
- How to handle operation registry updates (Eligius version changes)

**Approach**: Read operation registry code and metadata consultation pattern

#### RT-004: Error Message Quality
**Question**: What algorithm should we use to suggest similar names when a call cannot be resolved?
**Context**: FR-008 requires helpful suggestions for undefined actions/operations
**Research needed**:
- Levenshtein distance or other fuzzy matching algorithms
- Should we suggest from both actions and operations, or just one category?
- Threshold for "similar enough" to suggest (edit distance <= 2?)
- Performance impact of fuzzy matching on large name sets

**Approach**: Research common "did you mean" algorithms in compilers (TypeScript, Rust)

#### RT-005: Performance Baseline
**Question**: What is current compilation time for files with operations? What increase is acceptable?
**Context**: Technical Context notes unknown performance goals for name resolution overhead
**Research needed**:
- Benchmark current compilation time for typical DSL files
- Estimate overhead of name resolution (O(n*m) where n=calls, m=actions+operations?)
- Can we cache operation name set? Custom action symbol table?
- Profiling strategy for measuring impact

**Approach**: Create benchmark suite with varying file sizes and operation counts

#### RT-006: Backward Compatibility Strategy
**Question**: How to deprecate old `{ action() }` syntax while maintaining compatibility?
**Context**: ASM-004 assumes old syntax can be deprecated, but migration path unclear
**Research needed**:
- Should grammar accept both syntaxes during transition period?
- Deprecation warning approach - Langium diagnostic with "info" severity?
- Timeline for removal (next major version? 2 versions out?)
- Automatic migration tool feasibility (codemod?)

**Approach**: Research Langium deprecation patterns and common DSL migration strategies

### Open Questions (from Spec)

- **OQ-001**: Migration path for old `{ customAction() }` syntax
  - **Research**: See RT-006 above
  - **Needs**: Decision on deprecation timeline and warning strategy

- **OQ-002**: Custom action precedence when Eligius adds colliding operation names
  - **Decision**: Resolved in spec - compiler rejects with error (Option A)
  - **No research needed**

### Phase 0 Deliverable

**Output**: `research.md` with:
- Grammar design decision (new AST node or reuse OperationCall)
- Name resolution stage and algorithm
- Operation name lookup optimization strategy
- Fuzzy matching algorithm for suggestions
- Performance baseline and acceptable overhead
- Deprecation strategy for old syntax

---

## Phase 1: Design & Contracts

**Status**: BLOCKED (waiting for Phase 0 research completion)

**Prerequisites**:
- RT-001 through RT-006 completed
- `research.md` generated with all decisions documented

### Data Model

**Entity**: Name Registry (internal compiler data structure)
- Built-in operation names (from operation registry)
- Custom action names (from current file's action definitions)
- Collision detection rules
- Resolution priority (operation > action for collision detection)

**Entity**: Call Resolution Result
- Call name (string)
- Resolved type (CustomAction | BuiltInOperation | Undefined)
- Target reference (ActionDefinition | OperationMetadata | null)
- Suggestions (list of similar names if undefined)

### Contracts

**Note**: This is a compiler feature with no external API contracts. The "contract" is the grammar and validation behavior.

**Grammar Contract** (Langium):
- Timeline events accept both action calls and operation calls in operation statement positions
- Syntax is identical for both: `callName(arg1, arg2, ...)`
- Grammar does not distinguish - resolution happens at validation/linking

**Validation Contract**:
- Custom action definitions with names matching operation names → ERROR
- Calls to undefined names → ERROR with suggestions
- Calls with incorrect argument counts → ERROR (existing validation, no change)

**Transformation Contract**:
- Custom action calls → `startAction` operation with action reference
- Built-in operation calls → direct operation inclusion (existing behavior)

### Phase 1 Deliverables

**Output**:
- `data-model.md` - Name registry and resolution result entities
- `quickstart.md` - How to use unified call syntax with examples
- Agent context update (`.specify/memory/claude-context.md`)

---

## Phase 2: Task Generation

**Status**: NOT STARTED (use `/speckit.tasks` command after Phase 1 complete)

**Prerequisites**:
- Phase 0 research complete
- Phase 1 design artifacts generated
- All open questions resolved

**Command**: `/speckit.tasks` will generate dependency-ordered task list based on user stories and technical design.

---

## Next Steps

1. Execute Phase 0 research tasks (RT-001 through RT-006)
2. Generate `research.md` with consolidated findings
3. Execute Phase 1 design (data model, quickstart, agent context)
4. Use `/speckit.tasks` to generate implementation tasks
5. Begin implementation with TDD workflow

**Current Status**: Ready for Phase 0 research execution.
