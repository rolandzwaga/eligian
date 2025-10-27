# Implementation Plan: HTML Variables

**Branch**: `015-html-variables-the` | **Date**: 2025-10-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/015-html-variables-the/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enable HTML file imports as string variables in Eligian DSL, distinct from the `layout` keyword which assigns HTML to `layoutTemplate`. The syntax `import foo from './foo.html'` loads HTML content as a variable referenceable with `@foo` in operations like `setElementContent(@foo)`. This provides clean separation between application structure (layout) and reusable content (imports), reducing inline HTML verbosity by 80% while maintaining compile-time path validation and security restrictions.

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js 20+ (ESM modules)
**Primary Dependencies**: Langium (grammar/parser), Effect-ts (compiler pipeline), Node.js fs module (file I/O)
**Storage**: File system only (HTML files read at compile-time, no runtime storage)
**Testing**: Vitest (unit + integration tests, 80% coverage threshold)
**Target Platform**: Node.js 20+ for CLI/compiler, VS Code extension for IDE integration
**Project Type**: Monorepo (single codebase, multiple packages: language, compiler, extension, CLI)
**Performance Goals**: HTML file reading <50ms per file, compilation time increase <10% with HTML imports
**Constraints**: HTML imports restricted to project directory (security), files must exist at compile-time, max 1MB per HTML file (reasonable web content size)
**Scale/Scope**: Support 10+ HTML imports per Eligian file, typical HTML files 10-100KB, validate paths at compile-time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is straightforward: grammar rule for imports, file reading, variable registration. Reuses existing variable system (`@variableName`). Clear separation from layout keyword. Well-documented in spec.
- [x] **Comprehensive Testing**: Planned unit tests (parser, file reading, path validation) and integration tests (end-to-end compilation with HTML imports). Test-first workflow required by Principle II. Coverage target: 80%.
- [x] **No Gold-Plating**: Solves documented user need (reusable HTML content without duplicating markup). Spec includes 80% reduction in inline HTML as success criteria. No speculative features (no templating, no dynamic generation, just static file imports).
- [x] **Code Review**: Standard PR process applies (branch → test-first → implementation → review → merge). Constitution compliance verified in review.
- [x] **UX Consistency**: Uses familiar import syntax (`import foo from './file.html'`). Error messages follow existing pattern (compile-time validation with actionable messages). Variable referencing (`@foo`) consistent with existing Eligian syntax.
- [x] **Functional Programming**: External immutability maintained (imported HTML variables are immutable strings). File reading will use Effect-ts for error handling. No mutable global state. Internal mutation allowed for performance (per Principle VI).

*All checks passed. No violations to document.*

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

```
packages/
├── language/                          # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium           # Grammar definition (ADD: HTMLImport rule)
│   │   ├── eligian-validator.ts      # Semantic validation (ADD: path validation, duplicate detection)
│   │   ├── eligian-scope.ts          # Name resolution (ADD: HTML variable scoping)
│   │   └── __tests__/
│   │       ├── parsing.spec.ts       # (ADD: HTML import parsing tests)
│   │       └── validation.spec.ts    # (ADD: HTML import validation tests)
│   └── package.json
│
├── compiler/                          # DSL → Eligius JSON compiler
│   ├── src/
│   │   ├── ast-transformer.ts        # (MODIFY: transform HTML imports to variables)
│   │   ├── html-loader.ts            # (NEW: HTML file reading with Effect-ts)
│   │   ├── path-resolver.ts          # (NEW: resolve relative paths, validate security)
│   │   ├── error-reporter.ts         # (MODIFY: add HTML import error types)
│   │   └── __tests__/
│   │       ├── html-loader.spec.ts   # (NEW: file reading, error handling tests)
│   │       ├── path-resolver.spec.ts # (NEW: path resolution, security tests)
│   │       └── transformer.spec.ts   # (MODIFY: HTML import transformation tests)
│   └── package.json
│
├── extension/                         # VS Code extension
│   ├── src/
│   │   └── language/
│   │       └── main.ts               # (NO CHANGES: validation handled by Langium)
│   └── package.json
│
└── cli/                              # Command-line compiler
    ├── src/
    │   └── main.ts                   # (NO CHANGES: inherits compiler changes)
    └── package.json

examples/                              # (ADD: html-imports-demo.eligian example)
```

**Structure Decision**: Monorepo structure (existing). HTML import feature touches three packages:
1. **language** - Grammar rule, validation, scoping for HTML imports
2. **compiler** - File loading, path resolution, transformation to variables
3. **examples** - Demonstration file for documentation

No changes to extension or CLI packages (they inherit functionality from language/compiler changes).

## Complexity Tracking

*No violations - all Constitution checks passed.*
