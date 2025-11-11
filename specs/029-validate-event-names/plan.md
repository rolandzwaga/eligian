# Implementation Plan: Event Name and Argument Validation

**Branch**: `029-validate-event-names` | **Date**: 2025-11-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/029-validate-event-names/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add compile-time validation for event actions to verify event names match known Eligius events and validate parameter count/types against event metadata. This prevents runtime errors from typos, wrong argument counts, or type mismatches. Uses existing event metadata infrastructure (`TIMELINE_EVENTS` from `timeline-events.generated.ts`) and Levenshtein distance for "Did you mean?" suggestions. Validation is compiler-first with Langium integration following established patterns.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM with `NodeNext` module resolution)
**Primary Dependencies**: Langium 3.x, Vitest 2.x, Eligius (event metadata), existing Levenshtein utility
**Storage**: N/A (validation uses in-memory metadata)
**Testing**: Vitest with unit tests (validator logic) + integration tests (Langium validation)
**Target Platform**: Node.js 20+ (CLI) + VS Code extension (LSP)
**Project Type**: Single project (language package with compiler-first validation)
**Performance Goals**: <300ms validation response time, real-time IDE feedback
**Constraints**: Zero false positives on existing valid event actions, 80% test coverage
**Scale/Scope**: 43 known Eligius events, ~15 test cases per user story (45+ total tests)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach reuses existing patterns (Levenshtein, compiler-first validation). Well-documented validator methods. No unnecessary abstraction.
- [x] **Comprehensive Testing**: Unit tests for validation logic (event name matching, argument count, type checking) + integration tests for Langium validator. 80% coverage planned.
- [x] **No Gold-Plating**: Solves documented need (catch typos, prevent runtime errors). Parameter name validation intentionally REMOVED to avoid being overly restrictive. Type checking opt-in only.
- [x] **Code Review**: Standard PR process applies.
- [x] **UX Consistency**: Uses existing `ValidationAcceptor` pattern, error codes, and diagnostic severity (error vs warning).
- [x] **Functional Programming**: Validation functions are pure (deterministic, no side effects). Event metadata is immutable. No global state.

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/029-validate-event-names/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (research findings)
├── data-model.md        # Phase 1 output (validation entities and flow)
├── quickstart.md        # Phase 1 output (usage guide)
├── contracts/           # Phase 1 output (validation function signatures)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created yet)
```

### Source Code (repository root)

```
packages/language/
├── src/
│   ├── eligian-validator.ts              # Add 3 new validation methods (event name, arg count, type compat)
│   ├── completion/
│   │   └── metadata/
│   │       └── timeline-events.generated.ts  # Event metadata (43 events) - EXISTING
│   ├── css/
│   │   └── levenshtein.ts                # Reuse for event name suggestions - EXISTING
│   └── __tests__/
│       ├── event-validation/             # NEW: Integration tests (separate files per test)
│       │   ├── event-name-validation.spec.ts       # US1: Event name validation (typos, valid, invalid)
│       │   ├── argument-count-validation.spec.ts   # US2: Argument count validation (mismatches)
│       │   └── argument-type-validation.spec.ts    # US3: Type compatibility validation (opt-in)
│       └── test-helpers.ts               # Reuse createTestContext() - EXISTING
└── package.json

examples/
└── demo.eligian                          # UPDATE: Add event validation examples (event name typos, arg mismatches, type errors)
```

**Structure Decision**: Single language package with compiler-first validation following Principle X. Event metadata already exists in `completion/metadata/timeline-events.generated.ts` (43 events with args). Levenshtein utility already exists in `css/levenshtein.ts` for suggestions. Integration tests in separate files per Constitution Principle II (one integration test per file to avoid environment pollution).

## Complexity Tracking

*No constitutional violations - this section is empty.*

---

## Phase 0: Research & Investigation

**Goal**: Resolve all unknowns from Technical Context and establish implementation patterns.

### Research Tasks

1. **Event Metadata Structure** ✅ (Already known from context)
   - Decision: Use existing `TIMELINE_EVENTS` from `timeline-events.generated.ts`
   - Structure: `{ name: string, description: string, category: string, args: EventArgMetadata[] }`
   - `EventArgMetadata`: `{ name: string, type: string }`
   - 43 events total (e.g., "data-sync", "before-request-video-url", "timeline-complete")

2. **Levenshtein Distance for Suggestions** ✅ (Already exists)
   - Decision: Reuse `css/levenshtein.ts` module (distance ≤ 2 for suggestions)
   - Same pattern as CSS class validation (Feature 013)
   - Functions: `levenshteinDistance(a, b)`, `findSimilar(target, candidates, threshold=2)`

3. **Validation Integration Points**
   - Decision: Add 3 new methods to `EligianValidator` class
   - Methods: `checkEventNameExists()`, `checkEventArgumentCount()`, `checkEventTypeCompatibility()`
   - Register methods in `EligianValidatorRegistry` for `EventActionDefinition` AST nodes
   - Follow existing pattern from `checkEventActionDefinition()` and `checkEventActionParameters()`

4. **Type Annotation Extraction**
   - Decision: Use existing type annotation infrastructure from Feature 018
   - Extract type from `Parameter.type` field (optional TypeScript syntax)
   - Compare against `EventArgMetadata.type` from event metadata
   - Only validate when type annotation is explicitly present (opt-in)

5. **Error vs Warning Severity**
   - Decision: Event name errors → `'error'` (blocks compilation intent, though warnings don't block per FR-011)
   - Argument count mismatches → `'warning'` (runtime may still work, just risky)
   - Type mismatches → `'error'` (when type annotations present, indicates clear mismatch)
   - Empty event names → `'error'` (cannot be valid)

**Output**: `research.md` with consolidated findings

---

## Phase 1: Design & Contracts

**Goal**: Define validation entities, data flow, and function signatures.

### 1. Data Model (`data-model.md`)

**Entities**:

- **TIMELINE_EVENTS** (existing): Array of `TimelineEventMetadata`
  - `name: string` - Event identifier
  - `description: string` - Event description
  - `category?: string` - Event category (e.g., "Timeline", "Navigation")
  - `args?: EventArgMetadata[]` - Event arguments (empty array if no args)

- **EventArgMetadata** (existing): Event argument specification
  - `name: string` - Argument identifier
  - `type: string` - Argument type (e.g., "string", "number", "boolean")

- **EventActionDefinition** (existing AST node): DSL construct
  - `eventName: string` - String literal from `on event "name"`
  - `actionName: string` - Action identifier
  - `parameters: Parameter[]` - Action parameters
  - `topic?: string` - Optional event topic
  - `body: OperationStatement[]` - Action operations

- **Parameter** (existing AST node): Action parameter
  - `name: string` - Parameter identifier
  - `type?: string` - Optional TypeScript type annotation

**Validation Flow**:
```
1. checkEventNameExists(eventAction, accept)
   ├─> Load TIMELINE_EVENTS
   ├─> Check if eventAction.eventName exists in TIMELINE_EVENTS
   ├─> If not found:
   │   ├─> Calculate Levenshtein distance for all event names
   │   ├─> Find suggestions (distance ≤ 2)
   │   └─> Accept error with suggestions
   └─> If found: continue

2. checkEventArgumentCount(eventAction, accept)
   ├─> Load event metadata by name
   ├─> Compare eventAction.parameters.length vs event.args.length
   ├─> If mismatch:
   │   └─> Accept warning with expected vs actual count
   └─> If match: continue

3. checkEventTypeCompatibility(eventAction, accept)
   ├─> Load event metadata by name
   ├─> For each parameter with type annotation:
   │   ├─> Find corresponding event arg by position
   │   ├─> Compare parameter.type vs eventArg.type
   │   └─> If mismatch: accept error with type details
   └─> If no type annotations: skip (opt-in)
```

### 2. API Contracts (`contracts/validator.ts`)

```typescript
/**
 * Validate that event name matches a known Eligius event
 *
 * @param eventAction - Event action AST node
 * @param accept - Validation acceptor for diagnostics
 *
 * Errors:
 * - unknown_event_name: Event name not found in TIMELINE_EVENTS
 * - empty_event_name: Event name is empty string
 *
 * Provides:
 * - "Did you mean?" suggestions using Levenshtein distance ≤ 2
 */
checkEventNameExists(
  eventAction: EventActionDefinition,
  accept: ValidationAcceptor
): void;

/**
 * Validate that parameter count matches event argument count
 *
 * @param eventAction - Event action AST node
 * @param accept - Validation acceptor for diagnostics
 *
 * Warnings:
 * - event_argument_count_mismatch: Parameter count doesn't match event args
 *
 * Provides:
 * - Expected vs actual count in message
 * - Missing/extra parameter information
 */
checkEventArgumentCount(
  eventAction: EventActionDefinition,
  accept: ValidationAcceptor
): void;

/**
 * Validate that parameter type annotations match event argument types
 *
 * @param eventAction - Event action AST node
 * @param accept - Validation acceptor for diagnostics
 *
 * Errors:
 * - event_type_mismatch: Parameter type doesn't match event arg type
 *
 * Provides:
 * - Declared vs expected type in message
 * - Only validates when type annotations present (opt-in)
 */
checkEventTypeCompatibility(
  eventAction: EventActionDefinition,
  accept: ValidationAcceptor
): void;
```

### 3. Quickstart Guide (`quickstart.md`)

Usage examples, common pitfalls, and validation error explanations.

### 4. Agent Context Update

Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude` to update `CLAUDE.md` with:
- Event validation patterns section
- Reference to event metadata infrastructure
- Levenshtein suggestion pattern

---

## Post-Design Constitution Check

*Re-check after Phase 1 design complete:*

- [x] **Simplicity**: Design reuses existing patterns (Levenshtein, metadata, ValidationAcceptor). No new abstractions.
- [x] **Testing**: Unit tests for each validation method + integration tests per user story (separate files).
- [x] **No Gold-Plating**: Only validates what's necessary (event names, arg count, types). Parameter names intentionally not validated.
- [x] **UX Consistency**: Error messages follow existing format ("Unknown event name: 'X' (Did you mean: 'Y'?)").
- [x] **Functional Programming**: All validation methods are pure functions (deterministic, no side effects).

*All checks pass. Design approved for implementation.*

---

## Next Steps

1. **Phase 0 Complete**: Generate `research.md` with findings above
2. **Phase 1 Complete**: Generate `data-model.md`, `contracts/`, `quickstart.md`
3. **Ready for `/speckit.tasks`**: Task generation command will create `tasks.md` with implementation steps

This plan follows compiler-first validation (Principle X), maintains functional programming (Principle VI), and uses existing infrastructure (event metadata, Levenshtein). Implementation will add 3 validator methods with ~45 tests (15 per user story) across 3 separate integration test files (Principle II).
