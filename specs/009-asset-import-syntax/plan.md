# Implementation Plan: Asset Import Syntax

**Branch**: `009-asset-import-syntax` | **Date**: 2025-10-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/009-asset-import-syntax/spec.md`

## Summary

Add import statement syntax to Eligian DSL for HTML, CSS, and media assets with named and default imports, type inference from file extensions, and relative path validation. This feature provides only syntax validation - file loading and content processing are deferred to future features. Enables developers to declare asset dependencies in timeline source code with portability enforcement (relative paths only).

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js ESM (`module: "NodeNext"`)
**Primary Dependencies**: Langium 4.0.3 (grammar and validation), Vitest 2.x (testing), Biome 2.2.6+ (linting/formatting)
**Storage**: N/A (syntax-only feature, no file loading)
**Testing**: Vitest with Langium test utilities (`parseHelper`, `expectCompletion`)
**Target Platform**: Node.js 19+ (ESM modules, VS Code extension host)
**Project Type**: Single monorepo with packages (language, compiler, extension, cli)
**Performance Goals**: Parse and validate imports within 50ms for files with 20+ import statements
**Constraints**: Must maintain backward compatibility with existing Eligian files (imports are optional), grammar must remain LL(*) parseable by Langium
**Scale/Scope**: Support 50+ imports per file, recognize 10+ file extensions, validate paths with up to 10 directory levels deep

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [X] **Simplicity & Documentation**: Approach is clear - extend grammar with import statements, add validators for paths and names. Well-documented in spec. No unnecessary complexity.
- [X] **Comprehensive Testing**: Unit tests planned for validators (path format, name uniqueness, type inference), integration tests planned for parsing imports in complete Eligian files
- [X] **No Gold-Plating**: Solves real need (asset organization, portability enforcement). Explicitly excludes file loading/processing (future features).
- [X] **Code Review**: Review process defined in constitution, PR will verify grammar correctness and validation completeness
- [X] **UX Consistency**: Import syntax follows familiar ES module patterns (consistency with JS/TS developer expectations)
- [X] **Functional Programming**: Grammar rules are declarative, validators are pure functions returning typed errors, no mutable state

*All checks pass - no constitutional violations.*

## Project Structure

### Documentation (this feature)

```
specs/009-asset-import-syntax/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification (already created)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (grammar rules as contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/
├── language/                # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium          # Grammar file (ADD import rules)
│   │   ├── eligian-validator.ts     # Validation (ADD import validators)
│   │   ├── generated/
│   │   │   └── ast.ts               # Generated AST types (AUTO-UPDATED by Langium)
│   │   └── __tests__/
│   │       ├── parsing.spec.ts      # ADD: Import parsing tests
│   │       └── validation.spec.ts   # ADD: Import validation tests
│   └── package.json
│
├── compiler/                # Compiler (no changes for this feature)
│   └── src/
│       └── (no changes - file loading is future feature)
│
├── extension/               # VS Code extension (no changes)
│   └── (no changes - grammar update is automatic)
│
└── cli/                     # CLI (no changes)
    └── (no changes - grammar update is automatic)
```

**Structure Decision**: Monorepo with packages, only `language` package affected. Grammar changes in `eligian.langium` automatically update AST types and parser. Validators added to `eligian-validator.ts` following compiler-first pattern (Principle X - validation logic is pure, reusable functions).

## Complexity Tracking

*No constitutional violations - this section is empty.*

## Phase 0: Research & Technical Decisions

### Research Tasks

**R001: Langium Grammar Patterns for Import Statements**
- **Question**: What's the correct Langium grammar pattern for parsing import statements with optional type overrides?
- **Context**: Need to support both `layout './path'` (default imports) and `import name from './path' as type` (named imports with optional type override)
- **Research**: Consult context7 for Langium grammar rules with optional clauses, alternatives, and keyword-based parsing
- **Deliverable**: Grammar rule patterns for `DefaultImport` and `NamedImport`

**R002: Path Validation Strategies**
- **Question**: How should relative path validation work? Regex patterns vs. Langium grammar constraints?
- **Context**: Must reject absolute paths (`/`, `C:\`, `https://`) and accept relative paths (`./`, `../`)
- **Research**: Langium string terminal patterns vs. validator functions - which is more maintainable?
- **Deliverable**: Decision on path validation approach (grammar-level vs. validator-level)

**R003: Type Inference from File Extensions**
- **Question**: Where should type inference logic live? Grammar, validator, or separate utility?
- **Context**: Need to map extensions (`.html`, `.css`, `.mp4`) to types (`html`, `css`, `media`)
- **Research**: Best practices for type inference in Langium DSLs
- **Deliverable**: Type inference function location and signature

**R004: AST Node Structure for Imports**
- **Question**: How should import AST nodes be structured to support both default and named imports?
- **Context**: Default imports (`layout`, `styles`, `provider`) vs. named imports with identifiers
- **Research**: Langium AST design patterns, common vs. alternative nodes
- **Deliverable**: AST interface designs for `DefaultImport` and `NamedImport`

**R005: Integration with Existing Grammar**
- **Question**: Where should import statements fit in the existing Eligian grammar? Top-level only?
- **Context**: Imports should appear at document root, not inside actions or timeline events
- **Research**: Langium grammar composition, top-level vs. scoped declarations
- **Deliverable**: Grammar rule for document structure with imports

### Research Findings (research.md)

*To be generated by Phase 0 execution - see research.md file*

## Phase 1: Design Artifacts

### Data Model (data-model.md)

*To be generated by Phase 1 execution - see data-model.md file*

Key entities from spec:
- **DefaultImport**: Type (`layout` | `styles` | `provider`), path (relative string)
- **NamedImport**: Name (identifier), path (relative string), asset type (`html` | `css` | `media` - inferred or explicit)
- **Asset Type**: Enum of supported types with file extension mappings
- **Import Path**: String value with validation rules (relative, portable)

### API Contracts (contracts/)

*To be generated by Phase 1 execution*

Contracts for this feature:
- **Grammar Contract**: Langium grammar rules for import statements (BNF-style rules)
- **Validator Contract**: Validation function signatures and error types
- **AST Contract**: TypeScript interfaces for import AST nodes (auto-generated from grammar)

### Quickstart Guide (quickstart.md)

*To be generated by Phase 1 execution - see quickstart.md file*

Will include:
- Basic import syntax examples (default + named)
- Type inference examples
- Explicit type override examples
- Common validation errors and fixes
- Integration with existing Eligian features

## Phase 2: Implementation Planning

*Phase 2 (tasks.md generation) is performed by `/speckit.tasks` command after this plan is complete.*

Tasks will be organized by user story priority (P1 → P2 → P3):
1. Default imports (layout, styles, provider) - P1
2. Named imports - P2
3. Type inference and override - P3
4. Path validation - P1
5. Validation error messages

## Gate Decisions

### Technical Decisions Requiring Approval

**None** - All technical decisions are standard Langium patterns, no novel architecture required.

### Risk Mitigation

**Risk 1: Grammar Ambiguity**
- **Risk**: Import syntax might conflict with existing grammar rules
- **Mitigation**: Use distinct keywords (`layout`, `styles`, `provider`, `import`) that don't overlap with existing syntax. Langium will detect ambiguities at grammar generation time.

**Risk 2: Backward Compatibility**
- **Risk**: Adding import statements might break existing Eligian files
- **Mitigation**: Imports are optional (not required). Existing files without imports remain valid. Test with existing example files to verify.

**Risk 3: Type Inference Complexity**
- **Risk**: Extension mapping might be ambiguous or incomplete
- **Mitigation**: Require explicit type override (`as type`) for unknown/ambiguous extensions (`.ogg` files). Clear error messages guide users.

## Next Steps

After this plan is approved:

1. **Execute Phase 0**: Generate `research.md` with findings from research tasks
2. **Execute Phase 1**: Generate `data-model.md`, `contracts/`, and `quickstart.md`
3. **Update Agent Context**: Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`
4. **Re-check Constitution**: Verify design artifacts comply with constitution principles
5. **Stop and Report**: Command ends, ready for `/speckit.tasks` to generate implementation tasks

## Implementation Notes

- Grammar changes trigger automatic AST regeneration (Langium handles this)
- No compiler changes needed (file loading is future feature)
- VS Code extension automatically benefits from grammar updates (Langium Language Server)
- CLI automatically benefits from grammar updates (shared language package)
- Follow Constitution Principle X (Compiler-First Validation): Validators are pure functions, Langium validator is thin adapter
