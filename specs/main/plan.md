# Implementation Plan: Eligius DSL & Compiler

**Branch**: `main` | **Date**: 2025-10-14 | **Spec**: N/A (initial project setup)
**Input**: Project requirements from CLAUDE.md and user-provided technology stack

**Note**: This is the main implementation plan for the Eligius DSL project.

## Summary

This project creates a Langium-based domain-specific language (DSL) and Effect-ts compiler for the Eligius Story Telling Engine. The DSL reduces JSON configuration verbosity by 70-80% while providing type safety and IDE support through a VS Code extension. The compiler uses a functional pipeline approach to transform DSL source into optimized Eligius JSON configurations. Key components include: Langium grammar and language server, Effect-based compilation pipeline with typed error handling, CLI compiler, and VS Code extension with on-the-fly compilation.

## Technical Context

**Language/Version**: TypeScript (latest stable via Node.js LTS)
**Primary Dependencies**:
- **Langium**: Grammar definition, language server, VS Code extension framework
- **Effect-ts**: Functional programming, error handling, compilation pipeline
- **esbuild**: Fast bundling for VS Code extension
- **tsdown**: Optimized bundling for compiler library
- **vitest**: Unit and integration testing framework

**Storage**: File-based (DSL source files, compiled JSON output) - no database required
**Testing**: vitest for unit tests, integration tests, and snapshot testing
**Target Platform**:
- **CLI**: Node.js (cross-platform: Windows, macOS, Linux)
- **Extension**: VS Code (Electron-based, cross-platform)

**Project Type**: Single project with multiple build targets (compiler library + VS Code extension)
**Performance Goals**:
- Compilation: <500ms for typical DSL files (<1000 lines)
- Extension response: <200ms for autocompletion/validation
- Incremental compilation for watch mode

**Constraints**:
- Extension bundle size: <10MB (including language server)
- Memory footprint: <100MB during compilation
- No external runtime dependencies (bundle Effect-ts, Langium runtime)

**Scale/Scope**:
- DSL programs: 100-5000 lines typical, up to 10k lines max
- Eligius config output: 1k-50k lines of JSON
- Grammar complexity: ~50-100 production rules
- VS Code users: 10-1000 concurrent extension instances

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: ✅ PASS - Langium + Effect-ts provide clear, well-documented frameworks. DSL → JSON transformation is straightforward. CLAUDE.md provides comprehensive architecture docs.
- [x] **Comprehensive Testing**: ✅ PASS - vitest for unit + integration tests. Grammar tests, validation tests, compilation pipeline tests, snapshot tests for JSON output all planned.
- [x] **No Gold-Plating**: ✅ PASS - Solves real problem (verbose Eligius JSON). Core features only: DSL parsing, type checking, compilation, VS Code extension. No speculative optimizations.
- [x] **Code Review**: ✅ PASS - Git workflow defined in constitution. PRs required before merge. Constitution compliance checklist in place.
- [x] **UX Consistency**: ⚠️ MODIFIED - Original principle targets MCP tools; this project has CLI + VS Code extension UX. Adaptation: Consistent error messages, response formats, and IDE integration patterns across all interfaces.
- [x] **Functional Programming**: ✅ PASS - Effect-ts throughout compiler. External immutability enforced. Internal mutation allowed for performance (documented in CLAUDE.md).

**Constitution Compliance**: PASS with one adaptation (UX Consistency principle applied to CLI/extension context)

*If any checks fail, document justification in Complexity Tracking section below.*

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
src/
├── language/                    # Langium grammar and language server
│   ├── eligius.langium         # DSL grammar definition
│   ├── eligius-module.ts       # Language module registration
│   ├── eligius-validator.ts    # Semantic validation rules
│   ├── eligius-scope.ts        # Name resolution and scoping
│   └── eligius-completion.ts   # Autocompletion provider
├── compiler/                    # Effect-based compiler (DSL → Eligius JSON)
│   ├── pipeline.ts             # Main compilation pipeline orchestration
│   ├── ast-transformer.ts      # AST → Eligius IR transformation
│   ├── type-checker.ts         # Type checking and validation
│   ├── optimizer.ts            # Optimization passes
│   ├── error-reporter.ts       # Error formatting and reporting
│   └── effects/                # Effect services and layers
│       ├── FileSystem.ts       # File I/O effects
│       ├── Compiler.ts         # Compilation effects
│       └── Logger.ts           # Logging effects
├── cli/                        # Command-line compiler
│   ├── index.ts                # CLI entry point
│   └── commands/               # CLI command implementations
│       ├── compile.ts          # Compile command
│       └── watch.ts            # Watch mode (optional)
├── extension/                  # VS Code extension
│   ├── main.ts                 # Extension entry point
│   ├── language-client.ts      # Langium language client setup
│   └── commands.ts             # VS Code command contributions
└── types/                      # Shared TypeScript types
    ├── eligius-ir.ts           # Intermediate representation types
    ├── eligius-config.ts       # Eligius JSON config types
    └── errors.ts               # Error type definitions

tests/
├── parsing/                    # Grammar and parsing tests
│   ├── grammar.test.ts         # Basic grammar rules
│   └── complex.test.ts         # Complex DSL constructs
├── validation/                 # Semantic validation tests
│   ├── scoping.test.ts         # Name resolution
│   └── type-checking.test.ts   # Type validation
├── compilation/                # End-to-end compilation tests
│   ├── pipeline.test.ts        # Full DSL → JSON pipeline
│   ├── optimizer.test.ts       # Optimization passes
│   └── snapshots/              # Expected JSON outputs
└── fixtures/                   # Example DSL programs
    ├── simple-timeline.eli     # Basic timeline example
    ├── video-annotation.eli    # Video use case
    └── presentation.eli        # Presentation use case

.vscode/
├── launch.json                 # Debug configurations
└── extensions.json             # Recommended extensions

.specify/
├── memory/
│   └── constitution.md         # Project constitution
└── templates/                  # Feature planning templates
```

**Structure Decision**: Single project with TypeScript. Langium handles parsing and language server. Effect-ts handles compilation pipeline. esbuild bundles the VS Code extension. tsdown bundles the compiler library for distribution. vitest for all tests. This structure supports three build targets: (1) compiler library for programmatic use, (2) CLI for command-line usage, (3) VS Code extension for IDE integration.

## Complexity Tracking

*No violations*. All constitution principles are satisfied.

## Generated Artifacts

### Phase 0: Research (Complete)

- **[research.md](./research.md)** - Technology research and design decisions
  - Langium framework best practices
  - Effect-ts usage patterns
  - esbuild, tsdown, vitest configuration
  - Eligius library analysis and JSON format
  - DSL syntax philosophy
  - IR design decisions
  - Compilation pipeline design

### Phase 1: Design & Contracts (Complete)

- **[data-model.md](./data-model.md)** - Complete data model specification
  - Intermediate Representation (IR) types
  - Eligius configuration types
  - Error types for all pipeline stages
  - Validation rules
  - State transitions
  - Immutability guarantees

- **[contracts/cli-interface.md](./contracts/cli-interface.md)** - CLI specification
  - Command structure (`compile`, `version`, `help`)
  - Arguments and options
  - Exit codes
  - Error formatting
  - Configuration file format
  - Environment variables

- **[contracts/compiler-api.md](./contracts/compiler-api.md)** - Compiler API specification
  - Core API (`compile`, `compileFile`, `compileString`)
  - Compilation options
  - Effect services (FileSystem, Compiler, Logger)
  - Layer composition
  - Error handling patterns
  - Type exports

- **[contracts/extension-api.md](./contracts/extension-api.md)** - VS Code extension specification
  - Features (syntax highlighting, autocompletion, diagnostics)
  - Language server capabilities
  - Commands and keybindings
  - Settings schema
  - Output channel format
  - Performance requirements

- **[quickstart.md](./quickstart.md)** - Getting started guide
  - Installation instructions
  - First DSL program example
  - Compilation workflow
  - Common use cases
  - Development workflow
  - Troubleshooting tips

## Phase 2: Tasks Generation

**Next Step**: Run `/speckit.tasks` to generate implementation task list from these artifacts.

The task list will break down implementation into phases:
1. **Setup**: Project initialization, dependencies
2. **Foundational**: Core infrastructure (Effect services, Langium setup)
3. **Grammar Development**: DSL grammar definition
4. **Semantic Layer**: Validation and type checking
5. **Compiler Pipeline**: AST transformation, optimization, emission
6. **CLI**: Command-line interface
7. **VS Code Extension**: Extension and language server
8. **Testing**: Unit and integration tests
9. **Documentation & Polish**: Final docs, examples, README
