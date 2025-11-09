# Implementation Plan: Event Actions with Declarative Syntax

**Branch**: `028-event-actions-the` | **Date**: 2025-11-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/028-event-actions-the/spec.md`

## Summary

This feature adds event-triggered actions to the Eligian DSL, enabling developers to define custom actions that execute automatically when specific events are broadcast through the Eligius eventbus. The primary requirement is to support `on event "<eventName>" action <ActionName>(<params>) [<operations>]` syntax with optional topic namespacing, compile to Eligius `eventActions` JSON format, and provide parameter mapping to `$operationData.eventArgs[n]`. The technical approach involves extending the Langium grammar with event action definitions, implementing parameter scoping for event arguments, validating event action constraints, and transforming event actions into Eligius configuration with correct parameter index mapping.

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js 18+ (ESM modules)
**Primary Dependencies**: Langium (DSL parsing, validation, IDE integration), Vitest (testing), Biome (linting/formatting)
**Storage**: N/A (compile-time only, no runtime storage)
**Testing**: Vitest with 80% coverage threshold (unit tests for validation/transformation, integration tests for end-to-end compilation)
**Target Platform**: Node.js 18+ (CLI compiler), VS Code extension (language server)
**Project Type**: DSL compiler with IDE integration (monorepo structure: packages/language, packages/compiler, packages/extension)
**Performance Goals**: Compile-time validation <2s, IDE autocomplete <500ms, parameter mapping 100% accuracy
**Constraints**: Must maintain backwards compatibility with existing action syntax, must not conflict with future DSL extensions, event actions are separate namespace from regular actions
**Scale/Scope**: Support 100+ event actions per file, handle 20+ parameters per event action, support all existing operation types in event action bodies

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Is the approach clear and well-documented? No unnecessary complexity?
  - Yes: Event action syntax follows existing DSL patterns (`on event` + existing action body syntax)
  - Documentation will include grammar rules, transformation logic, and parameter mapping details

- [x] **Comprehensive Testing**: Are unit tests + integration tests planned for all components?
  - Yes: Unit tests for validation rules (duplicate handlers, reserved keywords, empty bodies)
  - Integration tests for end-to-end compilation (DSL → JSON with correct eventArgs mapping)
  - Test coverage target: 80%+ for validation and transformation logic

- [x] **No Gold-Plating**: Does this solve a real, documented need? No speculative features?
  - Yes: User explicitly requested event actions for Eligius eventbus integration
  - Feature is essential for interactive presentations (language changes, timeline events, user interactions)
  - No speculative features: topics (P3) are part of Eligius eventActions schema, not speculative

- [x] **Code Review**: Is the review process defined?
  - Yes: Standard PR process with constitution compliance verification
  - Will verify test-first development via git history

- [x] **UX Consistency**: Are tool interfaces consistent with existing MCP tools?
  - Yes: Syntax consistent with existing action definitions
  - Validation messages follow existing error format with source locations
  - IDE integration (autocomplete, hover) matches existing operation/action patterns

- [x] **Functional Programming**: Does the design maintain external immutability? Effect-ts usage planned?
  - Yes: Transformation functions are pure (AST → JSON with no side effects)
  - Validation returns structured error objects (no exceptions)
  - Internal AST traversal may use mutation for performance (acceptable per constitution)
  - No Effect-ts needed: compile-time feature with no async operations or complex error handling

*No violations. All checks pass.*

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

This feature extends existing DSL compiler structure:

```
packages/
├── language/                    # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium             # Grammar: EventActionDefinition node
│   │   ├── eligian-validator.ts        # Validation: duplicate handlers, reserved params, empty bodies
│   │   ├── eligian-completion-provider.ts # Autocomplete: event names (from Eligius metadata)
│   │   ├── eligian-hover-provider.ts   # Hover: event documentation (if available)
│   │   └── __tests__/
│   │       ├── event-action-parsing.spec.ts        # Grammar tests (parse event action syntax)
│   │       ├── event-action-validation.spec.ts     # Validation tests (duplicate handlers, reserved params)
│   │       └── event-action-completion.spec.ts     # IDE integration tests (autocomplete, hover)
│
├── compiler/                    # AST transformation
│   ├── src/
│   │   ├── ast-transformer.ts           # Transform EventActionDefinition → Eligius eventActions JSON
│   │   ├── name-resolver.ts             # Resolve event action names, check duplicates
│   │   └── __tests__/
│   │       ├── event-action-transformer.spec.ts  # Unit tests: parameter mapping to eventArgs[n]
│   │       └── event-action-integration.spec.ts  # Integration: DSL → JSON round-trip
│
└── extension/                   # VS Code extension (no changes expected)
```

**Structure Decision**: Extending existing monorepo packages (language, compiler) rather than creating new packages. Event actions are a language feature that fits into existing grammar (language package) and compilation pipeline (compiler package). No new dependencies or packages required.

## Complexity Tracking

*No violations requiring justification.*

---

## Phase 0 Completion: Research

**Status**: ✅ Complete

**Artifacts Generated**:
- `research.md` - Comprehensive research on Eligius event actions, parameter mapping, topic namespacing, and implementation strategy

**Key Findings**:
- Eligius `IEventActionConfiguration` schema extends `IActionConfiguration` with `eventName` and `eventTopic`
- Event arguments passed via `operationData.eventArgs` array at runtime
- Parameters in DSL map to array indices: first param → `eventArgs[0]`, second → `eventArgs[1]`, etc.
- Topics implemented as string concatenation with `:` delimiter (`"eventName:topic"`)
- Event actions have NO `endOperations` (only `startOperations`)

**Decisions Made**:
- Grammar syntax: `on event "<name>" topic "<topic>" action Name(...) [...]`
- Parameter scoping via transformation context (`Map<paramName, index>`)
- Compiler-first validation pattern (per Constitution Principle X)
- UUID v4 for all IDs (per Constitution Principle VII)

---

## Phase 1 Completion: Design

**Status**: ✅ Complete

**Artifacts Generated**:
- `data-model.md` - Entity definitions, state transitions, validation rules, integration points
- `contracts/event-action-configuration.json` - JSON schema for compiled configuration
- `contracts/examples.md` - Comprehensive examples (basic, topics, multi-param, zero-param, complex)
- `quickstart.md` - 5-minute tutorial for developers

**Design Artifacts**:

### Data Model
- **EventActionDefinition** (AST): `eventName`, `eventTopic?`, `name`, `parameters[]`, `operations[]`
- **IEventActionConfiguration** (JSON): `id`, `name`, `eventName`, `eventTopic?`, `startOperations[]`
- **EventActionContext** (Transform): `parameters: Map<string, number>` for index mapping

### Validation Rules
- Event name/topic must be string literals (not variables)
- Action name must be valid identifier (alphanumeric + underscores)
- Parameters must not be reserved keywords
- No duplicate parameters within same event action
- At least one operation required (no empty bodies)
- Warn on duplicate (eventName, eventTopic) combinations

### Transformation Strategy
- Build parameter registry when transforming EventActionDefinition
- Map parameter references → `$operationData.eventArgs[n]` during operation transform
- Generate UUID v4 for event action ID and operation IDs
- Add to `config.eventActions[]` array

**Constitution Check (Post-Design)**:

- [x] **Simplicity & Documentation**: Design maintains simplicity - reuses existing AST patterns, minimal new concepts
- [x] **Comprehensive Testing**: Test strategy defined (unit tests for validation, integration tests for transformation)
- [x] **No Gold-Plating**: No speculative features added - only implements spec requirements
- [x] **Code Review**: Standard PR process applies
- [x] **UX Consistency**: Syntax consistent with existing action definitions
- [x] **Functional Programming**: Transformation functions pure, parameter context immutable externally

**No new violations introduced.**

---

## Phase 2: Task Generation

**Next Step**: Run `/speckit.tasks` to generate implementation tasks from the design artifacts.

**Expected Task Categories**:
1. Grammar extension (Langium)
2. Validation implementation (compiler + Langium adapter)
3. AST transformation (parameter context, eventArgs mapping)
4. IDE integration (autocomplete, hover)
5. Testing (unit + integration)
6. Documentation (LANGUAGE_SPEC.md update)

**Ready to Proceed**: ✅ All design artifacts complete, constitution check passed
