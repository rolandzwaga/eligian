# Implementation Plan: Languages Declaration Syntax

**Branch**: `037-languages-syntax` | **Date**: 2025-11-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/037-languages-syntax/spec.md`

## Summary

Add a `languages` block to the Eligian DSL that declares available presentation languages and the default language. The block must appear as the first declaration in the file. Single language declarations use implicit default (no `*` marker), while multiple languages require exactly one `*` marker to indicate the default. The syntax compiles to Eligius `language` (string) and `availableLanguages` (ILabel[]) properties. Typir type system integration provides IDE hover support and validation.

**Technical Approach**: Extend Langium grammar with LanguagesBlock rule, add position validation in eligian-validator.ts, implement AST transformation in ast-transformer.ts to generate Eligius configuration properties, and create Typir LanguagesType for IDE support.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js runtime)
**Primary Dependencies**: Langium 3.x, Typir 0.x, typir-langium 0.x
**Storage**: N/A (compile-time only)
**Testing**: Vitest (via vitest-mcp tools per Constitution XXIII)
**Target Platform**: VS Code extension (Node.js) + CLI compiler
**Project Type**: Monorepo workspace (packages/language, packages/extension)
**Performance Goals**: <100ms parsing, <300ms IDE hover response
**Constraints**:
  - Must maintain backwards compatibility (languages block is optional)
  - Default language must be "en-US" when no languages block present
  - Must validate IETF language code format (xx-XX pattern)
**Scale/Scope**: Single grammar rule, 3-5 validation rules, 1 Typir type, ~150 lines of code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ PASSED Gates

- **I. Simplicity First**: Simple declarative syntax, straightforward transformation to Eligius properties
- **II. Comprehensive Testing**: Plan includes unit tests (validation, transformation) and integration tests (end-to-end compilation)
- **III. Type Safety with Effect**: N/A - no Effect pipeline changes needed (uses existing compiler infrastructure)
- **V. Test-Driven Development (TDD)**: Tests will be written first per spec acceptance scenarios
- **VI. External Immutability, Internal Performance**: Pure transformation functions, no mutable state needed
- **VII. Functional Programming First**: All transformations are pure functions
- **VIII. Package Manager Discipline**: Uses pnpm exclusively
- **IX. Langium Grammar Best Practices**: Grammar rule is declarative and unambiguous
- **XI. Code Quality with Biome**: Will run `pnpm run check` after implementation
- **XIII. File Extension Consistency**: Uses .eligian extension
- **XIV. Windows Path Handling**: Uses Windows backslash paths in tool calls
- **XX. Testing Strategy (Comprehensive)**: Tests co-located in `__tests__/`, fixtures in `__fixtures__/`
- **XXIII. Testing with vitest-mcp Tools**: Will use `mcp__vitest__run_tests` for quality gates
- **XXIV. Test Suite Maintenance**: Will use `createTestContext()` and test helpers from test-helpers.ts
- **XXV. Testing Guide Discipline**: Will consult `specs/TESTING_GUIDE.md` before writing tests

### No Violations

No constitution violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/037-languages-syntax/
├── plan.md              # This file
├── research.md          # Phase 0: Langium grammar patterns, Typir type creation, IETF language code validation
├── data-model.md        # Phase 1: LanguagesBlock, LanguageEntry entities
├── quickstart.md        # Phase 1: Usage examples and developer guide
├── contracts/           # Phase 1: AST interfaces, transformation contracts
└── tasks.md             # Phase 2: Created by /speckit.tasks
```

### Source Code (repository root)

```text
packages/language/src/
├── eligian.langium                     # Add LanguagesBlock grammar rule
├── eligian-validator.ts                # Add languages validation rules
├── compiler/
│   └── ast-transformer.ts              # Add transformLanguagesBlock() function
├── type-system-typir/
│   ├── types/
│   │   └── languages-type.ts           # NEW: Typir LanguagesType factory
│   ├── inference/
│   │   └── languages-inference.ts      # NEW: Type inference for languages block
│   └── validation/
│       └── languages-validation.ts     # NEW: Typir validation rules
└── __tests__/
    ├── parsing.spec.ts                 # Add grammar parsing tests
    ├── validation.spec.ts              # Add validation tests
    ├── transformer.spec.ts             # Add transformation tests
    └── type-system-typir/
        └── languages-type.spec.ts      # NEW: Typir integration tests

examples/
└── languages-demo.eligian              # NEW: Example file demonstrating syntax
```

**Structure Decision**: Extends existing monorepo structure. Language feature implementation goes in `packages/language/src/`, following established patterns from Features 020-033. Typir integration follows Feature 021 architecture.

## Complexity Tracking

No constitution violations - no complexity tracking needed.

## Phase 0: Research

### Research Questions

1. **Langium Grammar: First Declaration Enforcement**
   - **Question**: How do we enforce that the languages block must be the first declaration in the Program?
   - **Options**: (a) Grammar-level rule with Program ::= LanguagesBlock? OtherDeclarations*, (b) Validator check on AST node positions
   - **Research**: Review Langium docs for ordered rules, check existing DSL patterns for first-declaration enforcement

2. **IETF Language Code Validation**
   - **Question**: What is the exact regex pattern for IETF BCP 47 language codes (xx-XX format)?
   - **Research**: Review Eligius `TLanguageCode` type definition, find standard regex pattern for primary-region format

3. **Typir LanguagesType Design**
   - **Question**: What should the Typir type representation include for a languages block?
   - **Options**: (a) Simple type with language count, (b) Rich type with all language codes and default marker, (c) Type per language entry
   - **Research**: Review existing Typir types in Feature 021 (ImportType, TimelineEventType, TimelineType) for patterns

4. **AST Transformation: ILabel ID Generation**
   - **Question**: What is the ID format for `availableLanguages` ILabel entries?
   - **Research**: Check existing Eligius configurations for ID patterns, verify format with Eligius library

5. **Default Language Behavior**
   - **Question**: When no languages block is present, what are the exact defaults for `language` and `availableLanguages`?
   - **Research**: Check existing ast-transformer.ts default values, verify against Eligius IEngineConfiguration requirements

### Research Tasks

- **RT-001**: Investigate Langium grammar ordered rules for first-declaration enforcement
- **RT-002**: Find IETF BCP 47 regex pattern and validate against Eligius TLanguageCode
- **RT-003**: Review Feature 021 Typir types to determine LanguagesType design pattern
- **RT-004**: Examine existing Eligius configurations to determine ILabel ID format
- **RT-005**: Verify default language behavior when languages block is absent

### Output

Research findings will be documented in `research.md` with decisions, rationales, and alternatives considered.

## Phase 1: Design & Contracts

### Data Model (`data-model.md`)

**Entities**:

1. **LanguagesBlock**
   - Purpose: Represents the entire `languages { ... }` declaration
   - AST Properties:
     - `entries: LanguageEntry[]` - Array of language declarations
     - `$cstNode` - CST node for source location
   - Relationships: Child of Program, must be first element in `declarations` array
   - Validation Rules:
     - Must contain at least 1 entry (FR-012)
     - Must be first declaration if present (FR-004)
     - Only one languages block allowed per Program (FR-011)
   - State: Compile-time only (no runtime state)

2. **LanguageEntry**
   - Purpose: Represents a single language within the languages block
   - AST Properties:
     - `code: string` - Language code (e.g., "en-US")
     - `label: string` - Display label (e.g., "English")
     - `isDefault: boolean` - Whether this entry has `*` marker
     - `$cstNode` - CST node for source location
   - Validation Rules:
     - Code must match IETF format: `/^[a-z]{2,3}-[A-Z]{2}$/` (FR-005)
     - No duplicate codes within same LanguagesBlock (FR-006)
     - Exactly one `isDefault: true` when multiple entries (FR-003)
     - Zero `isDefault: true` markers allowed when single entry (FR-002)
   - Transformation: Maps to `ILabel` in Eligius config

**Transformation Contract**:
```typescript
// Input: LanguagesBlock AST node
LanguagesBlock {
  entries: [
    { code: "en-US", label: "English", isDefault: true },
    { code: "nl-NL", label: "Nederlands", isDefault: false }
  ]
}

// Output: Eligius configuration properties
{
  language: "en-US",  // From entry with isDefault: true
  availableLanguages: [
    { id: "lang-en-US", languageCode: "en-US", label: "English" },
    { id: "lang-nl-NL", languageCode: "nl-NL", label: "Nederlands" }
  ]
}
```

### API Contracts (`contracts/`)

**Langium Grammar Rule**:
```langium
// contracts/grammar-rule.langium
LanguagesBlock:
  'languages' '{'
    entries+=LanguageEntry+
  '}';

LanguageEntry:
  isDefault?='*'? code=STRING label=STRING;
```

**AST Transformer Interface**:
```typescript
// contracts/transformer-interface.ts
interface LanguagesTransformer {
  /**
   * Transforms LanguagesBlock AST node to Eligius configuration properties
   * @param block - LanguagesBlock AST node (or undefined if not present)
   * @returns { language: string, availableLanguages: ILabel[] }
   */
  transformLanguagesBlock(
    block: LanguagesBlock | undefined
  ): {
    language: string;
    availableLanguages: ILabel[];
  };
}

// Default behavior when block is undefined:
// { language: "en-US", availableLanguages: [] }

// ILabel format (from Eligius library):
interface ILabel {
  id: string;           // Format: "lang-{languageCode}"
  languageCode: string; // IETF format: "xx-XX"
  label: string;        // Display name
}
```

**Validator Interface**:
```typescript
// contracts/validator-interface.ts
interface LanguagesValidator {
  /**
   * Validates languages block position (must be first declaration)
   * @param program - Program AST node
   * @param accept - ValidationAcceptor for reporting errors
   */
  checkLanguagesBlockPosition(
    program: Program,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates language code format (IETF xx-XX pattern)
   * @param entry - LanguageEntry AST node
   * @param accept - ValidationAcceptor for reporting errors
   */
  checkLanguageCodeFormat(
    entry: LanguageEntry,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates default marker rules (single language = optional, multiple = required exactly one)
   * @param block - LanguagesBlock AST node
   * @param accept - ValidationAcceptor for reporting errors
   */
  checkDefaultMarker(
    block: LanguagesBlock,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates no duplicate language codes
   * @param block - LanguagesBlock AST node
   * @param accept - ValidationAcceptor for reporting errors
   */
  checkDuplicateLanguageCodes(
    block: LanguagesBlock,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates only one languages block per file
   * @param program - Program AST node
   * @param accept - ValidationAcceptor for reporting errors
   */
  checkSingleLanguagesBlock(
    program: Program,
    accept: ValidationAcceptor
  ): void;
}
```

**Typir Type Interface**:
```typescript
// contracts/typir-type-interface.ts
interface LanguagesTypeDetails {
  languageCount: number;       // Number of language entries
  defaultLanguage: string;     // Default language code (marked with *)
  allLanguages: string[];      // All language codes in block
}

/**
 * Typir type factory for languages blocks
 * Provides IDE hover support and type validation
 */
function createLanguagesType(
  typir: TypirServices
): TypeFactory<LanguagesTypeDetails>;

// Example hover output:
// "LanguagesType: 3 languages, default: en-US"
```

### Quickstart Guide (`quickstart.md`)

Will include:
- Syntax examples (single language, multiple languages)
- Compilation output examples
- Validation error examples with fixes
- IDE hover screenshot (or description)
- Migration guide (optional → required when adding more languages)

### Agent Context Update

Run script to update agent context with new technology references:
- Typir LanguagesType implementation
- IETF language code validation
- First-declaration enforcement pattern

## Phase 2: Task Breakdown

**NOT CREATED by /speckit.plan** - will be created by `/speckit.tasks` command.

Tasks will be generated from user stories in spec.md:
- US1: Single Language Declaration (P1)
- US2: Multiple Languages with Explicit Default (P2)
- US3: First Declaration Enforcement (P1)
- US4: Language Code Validation (P2)
- US5: Typir Type Integration (P3)

## Completion Status

✅ **Phase 0: Research** - Complete
- Generated `research.md` with all 5 research questions resolved (RT-001 through RT-005)
- All decisions documented with rationales and alternatives considered

✅ **Phase 1: Design & Contracts** - Complete
- Generated `data-model.md` with LanguagesBlock and LanguageEntry entities
- Generated `contracts/` directory with 4 interface files:
  - `grammar-rule.langium` - Langium grammar rules
  - `transformer-interface.ts` - AST transformation contract
  - `validator-interface.ts` - Validation rules interface
  - `typir-type-interface.ts` - Typir type system integration
- Generated `quickstart.md` with usage examples and migration guide

✅ **Agent Context Update** - Complete
- Updated CLAUDE.md with TypeScript 5.x, Langium 3.x, Typir 0.x references

✅ **Constitution Check Re-validation** - PASSED
- All principles still passing (no changes from initial check)
- No violations introduced during design phase
- Ready for implementation

## Next Steps

Ready for **`/speckit.tasks`** to generate task breakdown and implementation checklist.

