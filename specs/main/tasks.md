# Tasks: Eligius DSL & Compiler

**Input**: Design documents from `/specs/main/`
**Prerequisites**: plan.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Organization**: Tasks are organized by feature delivery to enable incremental implementation and testing. Each phase delivers a working increment.

## Format: `[ID] [P?] [Phase] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Phase]**: Which feature phase this task belongs to (e.g., Grammar, Compiler, CLI, Extension)
- Include exact file paths in descriptions

## Path Conventions
- **Monorepo structure**: `packages/language/`, `packages/compiler/`, `packages/cli/`, `packages/extension/`
- **Tests**: `__tests__/` subdirectories with `.spec.ts` files
- **Fixtures**: `__fixtures__/` subdirectories within `__tests__/`

---

## Phase 0: Research & Analysis (Understanding Eligius)

**Purpose**: Analyze Eligius library to understand JSON configuration format, API structure, and common patterns before designing the DSL

**⚠️ CRITICAL**: This phase MUST be completed before any DSL design or implementation work begins

- [X] R001 [Research] Read ../eligius/README.md for high-level understanding of Eligius functionality and use cases
- [X] R002 [Research] Analyze ../eligius/jsonschema/eligius-configuration.json to understand the complete JSON config structure
- [X] R003 [Research] Explore ../eligius/docs/ API documentation to understand available Eligius APIs and their usage
- [X] R004 [Research] Identify JSON configuration patterns by examining example configs in ../eligius/ (if available)
- [X] R005 [Research] Document Eligius timeline providers (video, audio, RAF, custom) and their configuration requirements
- [X] R006 [Research] Document Eligius event system (start/end times, actions, conditions, triggers)
- [X] R007 [Research] Document Eligius action types (show, hide, animate, trigger, custom) and their properties
- [X] R008 [Research] Identify pain points in JSON verbosity (repetitive structures, deep nesting, etc.)
- [X] R009 [Research] Create ELIGIUS_UNDERSTANDING.md with comprehensive technical analysis of findings
- [X] R010 [DSL Design] Design initial DSL syntax examples showing proposed improvements over JSON (timeline, events, actions)
- [X] R011 [DSL Design] Define DSL syntax goals based on verbosity reduction targets (70-80% reduction)
- [X] R012 [DSL Design] Document DSL-to-JSON mapping examples in ELIGIUS_UNDERSTANDING.md

**Checkpoint**: Complete understanding of Eligius documented. Initial DSL syntax designed with examples. Ready to implement grammar and compiler.

**Deliverable**: `ELIGIUS_UNDERSTANDING.md` with analysis and DSL design examples

---

## Phase 1: Setup (Project Infrastructure)

**Purpose**: Initialize monorepo structure, dependencies, and build configuration

- [X] T001 [P] Verify monorepo workspace structure matches plan.md (packages/language, compiler, cli, extension)
- [X] T002 [P] Install Langium dependencies in packages/language/package.json (langium@4.1.0, langium-cli@4.1.0)
- [X] T003 [P] Install Effect-ts dependencies in packages/compiler/package.json (effect@latest)
- [X] T004 [P] Install CLI dependencies in packages/cli/package.json (commander@11.1.0, chalk@5.6.2)
- [X] T005 [P] Install extension dependencies in packages/extension/package.json (vscode-languageclient@9.0.1, vscode-languageserver@9.0.1)
- [X] T006 [P] Install vitest in packages/language/package.json for testing (vitest@3.2.4)
- [X] T007 [P] Configure TypeScript build references in tsconfig.build.json
- [X] T008 [P] Configure esbuild for extension bundling in packages/extension/esbuild.mjs
- [X] T009 [P] Add workspace scripts to root package.json (build, watch, langium:generate, test)
- [X] T010 Update packages/compiler/package.json to include proper dependencies and build scripts

**Checkpoint**: All dependencies installed, build configuration ready

---

## Phase 2: Foundational (Core Types & Effects Infrastructure)

**Purpose**: Define shared types and Effect services that all other components depend on

**⚠️ CRITICAL**: No grammar, compiler, or extension work can begin until this phase is complete

- [X] T011 [P] [Foundation] Create IR types in packages/compiler/src/types/eligius-ir.ts based on data-model.md
- [X] T012 [P] [Foundation] Add eligius package dependency to import Eligius types (instead of duplicating them)
- [X] T013 [P] [Foundation] Create error types in packages/compiler/src/types/errors.ts based on data-model.md
- [X] T014 [P] [Foundation] Create SourceLocation type in packages/compiler/src/types/common.ts
- [X] T015 [Foundation] Create FileSystemService Effect service in packages/compiler/src/effects/FileSystem.ts
- [X] T016 [P] [Foundation] Create LoggerService Effect service in packages/compiler/src/effects/Logger.ts
- [X] T017 [Foundation] Create CompilerService Effect service interface in packages/compiler/src/effects/Compiler.ts
- [X] T018 [Foundation] Create Live layer implementations in packages/compiler/src/effects/layers.ts (FileSystemLive, LoggerLive)
- [X] T019 [Foundation] Create Test layer implementations in packages/compiler/src/effects/layers.ts (FileSystemTest, LoggerTest)
- [X] T020 [Foundation] Export all types and services from packages/compiler/src/index.ts

**Checkpoint**: Foundation ready - type-safe IR, Effect services, and layers available for all components

---

## Phase 3: Grammar Development (DSL Parsing) 🎯 MVP Foundation

**Goal**: Implement working Langium grammar that can parse Eligius DSL syntax

**Independent Test**: Parse valid DSL files and produce AST without errors

- [X] T021 [Grammar] Define terminal rules in packages/language/src/eligian.langium (ID, INT, STRING, WS, COMMENT)
- [X] T022 [Grammar] Define Timeline production rule in packages/language/src/eligian.langium (timeline <provider> from <source>)
- [X] T023 [Grammar] Define Event production rule in packages/language/src/eligian.langium (event <id> at <start>..<end> { actions })
- [X] T024 [Grammar] Define Action production rules in packages/language/src/eligian.langium (show, hide, animate, trigger)
- [X] T025 [Grammar] Define Selector production rules in packages/language/src/eligian.langium (#id, .class, element)
- [X] T026 [Grammar] Define time range syntax in packages/language/src/eligian.langium (<start>..<end>)
- [X] T027 [Grammar] Define action properties syntax in packages/language/src/eligian.langium (with <animation>(<params>))
- [X] T028 [Grammar] Run langium generate command to generate AST types in packages/language/src/generated/
- [X] T029 [P] [Grammar] Create test fixtures in packages/language/src/__tests__/__fixtures__/valid/ (simple-timeline.eligian, video-annotation.eligian, presentation.eligian)
- [X] T030 [P] [Grammar] Create test fixtures in packages/language/src/__tests__/__fixtures__/invalid/ (syntax-errors.eligian, missing-timeline.eligian)
- [X] T031 [Grammar] Implement parsing tests in packages/language/src/__tests__/parsing.spec.ts
- [X] T032 [Grammar] Test timeline parsing in packages/language/src/__tests__/parsing.spec.ts
- [X] T033 [Grammar] Test event parsing in packages/language/src/__tests__/parsing.spec.ts
- [X] T034 [Grammar] Test action parsing in packages/language/src/__tests__/parsing.spec.ts
- [X] T035 [Grammar] Test error recovery for invalid syntax in packages/language/src/__tests__/parsing.spec.ts

**Checkpoint**: Grammar can parse valid DSL programs and generate AST. All parsing tests pass.

---

## Phase 4: Semantic Validation (Type Checking & Validation)

**Goal**: Implement validation rules for Eligius-specific constraints

**Independent Test**: Validate DSL programs and report semantic errors (duplicate IDs, invalid time ranges, etc.)

- [X] T036 [Validation] Implement TimelineRequired validation in packages/language/src/eligian-validator.ts
- [X] T037 [P] [Validation] Implement UniqueEventIds validation in packages/language/src/eligian-validator.ts
- [X] T038 [P] [Validation] Implement ValidTimeRange validation in packages/language/src/eligian-validator.ts (start < end)
- [X] T039 [P] [Validation] Implement NonNegativeTimes validation in packages/language/src/eligian-validator.ts (start >= 0, end >= 0)
- [X] T040 [P] [Validation] Implement ValidActionType validation in packages/language/src/eligian-validator.ts
- [X] T041 [P] [Validation] Implement TargetRequired validation in packages/language/src/eligian-validator.ts (show/hide/animate need targets)
- [X] T042 [Validation] Implement ValidProvider validation in packages/language/src/eligian-validator.ts (video, audio, raf, custom)
- [X] T043 [Validation] Implement SourceRequired validation in packages/language/src/eligian-validator.ts (video/audio need source)
- [X] T044 [Validation] Register all validators in packages/language/src/eligian-validator.ts using registerValidationChecks
- [X] T045 [P] [Validation] Create validation test fixtures in packages/language/src/__tests__/__fixtures__/invalid/
- [X] T046 [Validation] Implement validation tests in packages/language/src/__tests__/validation.spec.ts
- [X] T047 [Validation] Test timeline validation rules in packages/language/src/__tests__/validation.spec.ts
- [X] T048 [Validation] Test event validation rules in packages/language/src/__tests__/validation.spec.ts
- [X] T049 [Validation] Test action validation rules in packages/language/src/__tests__/validation.spec.ts

**Checkpoint**: Validation catches all semantic errors defined in data-model.md. All validation tests pass.

---

## Phase 5: Compiler Pipeline (AST → JSON Transformation) 🎯 MVP Core

**Goal**: Implement Effect-based compilation pipeline that transforms Langium AST to Eligius JSON

**Independent Test**: Compile valid DSL to JSON and verify output matches Eligius format

### Pipeline Stage: Transform (AST → IR)

- [X] T050 [P] [Transform] Implement transformTimeline in packages/compiler/src/ast-transformer.ts (Timeline AST → TimelineIR)
- [X] T051 [P] [Transform] Implement transformEvent in packages/compiler/src/ast-transformer.ts (Event AST → EventIR)
- [X] T052 [P] [Transform] Implement transformAction in packages/compiler/src/ast-transformer.ts (Action AST → ActionIR)
- [X] T053 [P] [Transform] Implement transformSelector in packages/compiler/src/ast-transformer.ts (Selector AST → TargetSelector)
- [X] T054 [P] [Transform] Implement transformTimeExpression in packages/compiler/src/ast-transformer.ts (Time AST → TimeExpression)
- [X] T055 [Transform] Implement main transformAST function in packages/compiler/src/ast-transformer.ts (orchestrates all transforms)
- [X] T056 [Transform] Add error handling with TransformError types in packages/compiler/src/ast-transformer.ts
- [X] T057 [Transform] Include source location mapping in all IR nodes in packages/compiler/src/ast-transformer.ts
- [X] T058 [P] [Transform] Create transform test fixtures in packages/compiler/src/__tests__/__fixtures__/
- [X] T059 [Transform] Implement transformer tests in packages/compiler/src/__tests__/transformer.spec.ts (14 tests passing)

### Pipeline Stage: Type Checking

- [X] T060 [P] [TypeCheck] Implement TimeType checking in packages/compiler/src/type-checker.ts (time expressions evaluate to number)
- [X] T061 [P] [TypeCheck] Implement NumericDuration checking in packages/compiler/src/type-checker.ts (durations are numeric)
- [X] T062 [P] [TypeCheck] Implement StringLiteral checking in packages/compiler/src/type-checker.ts (sources, selectors are strings)
- [X] T063 [TypeCheck] Implement main typeCheck function in packages/compiler/src/type-checker.ts (returns Effect<TypedAST, TypeError>)
- [X] T064 [TypeCheck] Implement type-checking tests in packages/compiler/src/__tests__/type-checker.spec.ts (18 tests passing)

### Pipeline Stage: Optimization

- [X] T065 [P] [Optimize] Implement dead code elimination in packages/compiler/src/optimizer.ts (remove unreachable events)
- [X] T066 [P] [Optimize] Implement constant folding in packages/compiler/src/optimizer.ts (evaluate compile-time expressions)
- [X] T067 [Optimize] Implement main optimize function in packages/compiler/src/optimizer.ts (returns Effect<EligiusIR, never>)
- [X] T068 [Optimize] Document internal mutation for performance in packages/compiler/src/optimizer.ts
- [X] T069 [Optimize] Implement optimizer tests in packages/compiler/src/__tests__/optimizer.spec.ts (16 tests passing)

### Pipeline Stage: Emit (IR → JSON)

- [X] T070 [P] [Emit] Implement emitTimeline in packages/compiler/src/emitter.ts (TimelineIR → EligiusTimeline)
- [X] T071 [P] [Emit] Implement emitEvent in packages/compiler/src/emitter.ts (EventIR → EligiusEvent)
- [X] T072 [P] [Emit] Implement emitAction in packages/compiler/src/emitter.ts (ActionIR → EligiusAction)
- [X] T073 [Emit] Implement emitJSON function in packages/compiler/src/emitter.ts (EligiusIR → EligiusConfig)
- [X] T074 [Emit] Add metadata generation in packages/compiler/src/emitter.ts (compiler version, timestamp)
- [X] T075 [Emit] Implement emit tests in packages/compiler/src/__tests__/emitter.spec.ts (15 tests passing)

### Pipeline Orchestration

- [X] T076 [Pipeline] Implement parseSource stage in packages/compiler/src/pipeline.ts (Langium parse → AST)
- [X] T077 [Pipeline] Implement validateAST stage in packages/compiler/src/pipeline.ts (semantic validation)
- [X] T078 [Pipeline] Wire transformAST stage in packages/compiler/src/pipeline.ts
- [X] T079 [Pipeline] Wire typeCheck stage in packages/compiler/src/pipeline.ts
- [X] T080 [Pipeline] Wire optimize stage in packages/compiler/src/pipeline.ts
- [X] T081 [Pipeline] Wire emitJSON stage in packages/compiler/src/pipeline.ts
- [X] T082 [Pipeline] Implement main compile function in packages/compiler/src/pipeline.ts (orchestrates all stages with Effect.flatMap)
- [X] T083 [Pipeline] Implement compileFile helper in packages/compiler/src/pipeline.ts (reads file via FileSystemService)
- [X] T084 [Pipeline] Implement compileString alias in packages/compiler/src/pipeline.ts
- [X] T085 [Pipeline] Add CompileOptions support in packages/compiler/src/pipeline.ts (minify, sourcemap, optimize, target)

### Integration Tests

- [~] T086 [P] [Compiler] Create snapshot fixtures in packages/compiler/src/__tests__/__fixtures__/snapshots/ (expected JSON outputs) - BLOCKED: Schema alignment needed
- [~] T087 [Compiler] Implement end-to-end pipeline tests in packages/compiler/src/__tests__/pipeline.spec.ts - Created 22 tests, 18 failing due to schema mismatch
- [~] T088 [Compiler] Test simple timeline compilation in packages/compiler/src/__tests__/pipeline.spec.ts - Created but failing (schema mismatch)
- [~] T089 [Compiler] Test video annotation compilation in packages/compiler/src/__tests__/pipeline.spec.ts - Created but failing (schema mismatch)
- [~] T090 [Compiler] Test presentation compilation in packages/compiler/src/__tests__/pipeline.spec.ts - Created but failing (schema mismatch)
- [X] T091 [Compiler] Test compilation with optimization passes in packages/compiler/src/__tests__/pipeline.spec.ts (tests created and pass)
- [X] T092 [Compiler] Test compilation error handling (all error types) in packages/compiler/src/__tests__/pipeline.spec.ts (tests created and pass)
- [ ] T093 [Compiler] Snapshot testing for JSON outputs in packages/compiler/src/__tests__/pipeline.spec.ts - BLOCKED: Schema alignment needed

**Checkpoint**: Compiler pipeline implemented but requires Eligius schema alignment. Core compiler stages (Transform, TypeCheck, Optimize, Emit) all working with 63 tests passing. Pipeline orchestration complete but tests blocked on schema mismatch between simplified DSL output and full IEngineConfiguration requirements.

**⚠️ SCHEMA ALIGNMENT REQUIRED**: The compiler currently emits a simplified configuration structure (`{ timeline, events, metadata }`), but Eligius expects the full `IEngineConfiguration` interface with properties like `id, engine, timelines (plural), eventActions, containerSelector, language, layoutTemplate, availableLanguages, initActions, actions, labels`. Before continuing with integration tests, CLI, or extension work, the following schema alignment tasks must be completed:

- [X] SA001 [Schema] Update EligiusIR types in packages/compiler/src/types/eligius-ir.ts to match full IEngineConfiguration structure
- [X] SA002 [Schema] Update ast-transformer.ts to map DSL concepts to full Eligius schema (timeline → timelines array, events → TimelineActions)
- [X] SA003 [Schema] Add default values for required Eligius fields (id, engine, containerSelector, language, layoutTemplate, etc.)
- [X] SA004 [Schema] Update emitter.ts to output complete IEngineConfiguration structure
- [~] SA005 [Schema] Update all compiler code and tests to work with full Eligius schema
  - [X] SA005a: Updated transformer.spec.ts tests to expect new IEngineConfiguration IR structure
  - [X] SA005b: Fixed type-checker.ts implementation to work with new IR (timelines, TimelineActions, operations)
  - [X] SA005c: Fixed optimizer.ts implementation to work with new IR structure (dead code elimination for timeline actions)
  - [X] SA005d: Fixed pipeline.ts to properly compose updated stages (fixed Program import)
  - [~] SA005e-h: Update remaining test files to work with new IR
    - [ ] type-checker.spec.ts: Update helper functions and test cases
    - [ ] optimizer.spec.ts: Update tests for timeline action optimization
    - [ ] emitter.spec.ts: Update tests for new emission functions
    - [ ] pipeline.spec.ts: Update end-to-end tests for full IEngineConfiguration output
- [ ] SA006 [Schema] Optionally extend DSL grammar to support configuration blocks (config { id, container, language })

**Estimated Effort**: 2-3 hours for minimal viable alignment, 1-2 days for complete feature support

---

## Phase 6: Error Reporting (User-Friendly Errors)

**Goal**: Format compilation errors for display in CLI and VS Code

**Independent Test**: Generate helpful error messages with source locations and hints

- [ ] T094 [P] [Errors] Implement formatParseError in packages/compiler/src/error-reporter.ts
- [ ] T095 [P] [Errors] Implement formatValidationError in packages/compiler/src/error-reporter.ts
- [ ] T096 [P] [Errors] Implement formatTypeError in packages/compiler/src/error-reporter.ts
- [ ] T097 [P] [Errors] Implement formatTransformError in packages/compiler/src/error-reporter.ts
- [ ] T098 [Errors] Implement formatError function in packages/compiler/src/error-reporter.ts (pattern match on error._tag)
- [ ] T099 [Errors] Implement formatErrors function in packages/compiler/src/error-reporter.ts (array version)
- [ ] T100 [Errors] Add code snippet extraction in packages/compiler/src/error-reporter.ts (show source context)
- [ ] T101 [Errors] Add hint generation in packages/compiler/src/error-reporter.ts (actionable suggestions)
- [ ] T102 [Errors] Implement error reporter tests in packages/compiler/src/__tests__/error-reporter.spec.ts

**Checkpoint**: Error messages are clear, include source locations, and provide helpful hints.

---

## Phase 7: CLI Compiler (Command-Line Interface) 🎯 MVP Deliverable

**Goal**: Implement command-line compiler matching cli-interface.md contract

**Independent Test**: Compile DSL files from command line with proper exit codes and output

- [ ] T103 [CLI] Implement argument parsing in packages/cli/src/main.ts using Commander
- [ ] T104 [CLI] Implement compile command in packages/cli/src/commands/compile.ts
- [ ] T105 [CLI] Implement file globbing support in packages/cli/src/commands/compile.ts (src/*.eli)
- [ ] T106 [CLI] Implement file I/O in packages/cli/src/commands/compile.ts (read input, write output)
- [ ] T107 [CLI] Integrate compiler pipeline with Effect runtime in packages/cli/src/commands/compile.ts
- [ ] T108 [CLI] Implement error formatting for terminal in packages/cli/src/util.ts (colored output with chalk)
- [ ] T109 [CLI] Implement exit code handling in packages/cli/src/main.ts (0=success, 1=compile error, 2=invalid args, 3=IO error)
- [ ] T110 [CLI] Implement verbose logging mode in packages/cli/src/commands/compile.ts (--verbose flag)
- [ ] T111 [CLI] Implement quiet mode in packages/cli/src/commands/compile.ts (--quiet flag)
- [ ] T112 [CLI] Implement stdout output mode in packages/cli/src/commands/compile.ts (no -o flag)
- [ ] T113 [CLI] Implement --check flag in packages/cli/src/commands/compile.ts (syntax check only)
- [ ] T114 [CLI] Implement --minify flag in packages/cli/src/commands/compile.ts
- [ ] T115 [CLI] Implement --no-optimize flag in packages/cli/src/commands/compile.ts
- [ ] T116 [CLI] Implement version command in packages/cli/src/main.ts
- [ ] T117 [CLI] Implement help command in packages/cli/src/main.ts
- [ ] T118 [CLI] Implement config file loading in packages/cli/src/config.ts (eligius.config.json)
- [ ] T119 [CLI] Implement environment variable support in packages/cli/src/config.ts (ELIGIUS_DSL_CONFIG, etc.)
- [ ] T120 [CLI] Create CLI executable entry point in packages/cli/bin/cli.js
- [ ] T121 [P] [CLI] Create CLI test fixtures in packages/cli/src/__tests__/__fixtures__/
- [ ] T122 [CLI] Implement CLI tests in packages/cli/src/__tests__/cli.spec.ts
- [ ] T123 [CLI] Test successful compilation in packages/cli/src/__tests__/cli.spec.ts
- [ ] T124 [CLI] Test error handling and exit codes in packages/cli/src/__tests__/cli.spec.ts
- [ ] T125 [CLI] Test multiple input files in packages/cli/src/__tests__/cli.spec.ts
- [ ] T126 [CLI] Test config file loading in packages/cli/src/__tests__/cli.spec.ts

**Checkpoint**: CLI works according to cli-interface.md contract. Can compile DSL files from command line. All CLI tests pass.

---

## Phase 8: VS Code Extension (IDE Integration) 🎯 MVP Complete

**Goal**: Implement VS Code extension matching extension-api.md contract

**Independent Test**: Open .eli files in VS Code with syntax highlighting, validation, and compilation commands

### Extension Setup

- [ ] T127 [Extension] Configure extension manifest in packages/extension/package.json (name, version, activation events)
- [ ] T128 [Extension] Define file association for .eli files in packages/extension/package.json
- [ ] T129 [Extension] Define commands in packages/extension/package.json (eligius-dsl.compile, eligius-dsl.compileAndPreview)
- [ ] T130 [Extension] Define configuration schema in packages/extension/package.json (settings for compiler, validation, formatting)
- [ ] T131 [Extension] Copy TextMate grammar from packages/language/syntaxes/ to packages/extension/syntaxes/ in build script

### Language Client

- [ ] T132 [Extension] Implement extension activation in packages/extension/src/extension/main.ts
- [ ] T133 [Extension] Implement language client setup in packages/extension/src/extension/main.ts (connect to language server)
- [ ] T134 [Extension] Configure language client options in packages/extension/src/extension/main.ts (documentSelector for .eli files)
- [ ] T135 [Extension] Implement extension deactivation in packages/extension/src/extension/main.ts (stop language server)

### Language Server

- [ ] T136 [Extension] Implement language server entry point in packages/extension/src/language/main.ts
- [ ] T137 [Extension] Wire Langium services to language server in packages/extension/src/language/main.ts
- [ ] T138 [Extension] Configure language server capabilities in packages/extension/src/language/main.ts (completion, hover, diagnostics, etc.)

### Autocompletion

- [ ] T139 [Extension] Implement keyword completion provider in packages/language/src/eligian-completion.ts (timeline, event, at, from, with)
- [ ] T140 [Extension] Implement provider completion in packages/language/src/eligian-completion.ts (video, audio, raf, custom)
- [ ] T141 [Extension] Implement action completion in packages/language/src/eligian-completion.ts (show, hide, animate, trigger)
- [ ] T142 [Extension] Implement selector completion in packages/language/src/eligian-completion.ts (#id, .class, element)
- [ ] T143 [Extension] Implement snippet completion in packages/language/src/eligian-completion.ts (timeline, event, action templates)
- [ ] T144 [Extension] Register completion provider in packages/language/src/eligian-module.ts

### Diagnostics Integration

- [ ] T145 [Extension] Convert validation errors to LSP diagnostics in packages/language/src/eligian-validator.ts
- [ ] T146 [Extension] Add severity levels to diagnostics in packages/language/src/eligian-validator.ts (error, warning, info)
- [ ] T147 [Extension] Add diagnostic codes in packages/language/src/eligian-validator.ts (E001, W001, etc.)

### Compilation Commands

- [ ] T148 [Extension] Implement "Compile Current File" command in packages/extension/src/extension/commands.ts
- [ ] T149 [Extension] Integrate compiler pipeline with command in packages/extension/src/extension/commands.ts
- [ ] T150 [Extension] Show compilation output in Output panel in packages/extension/src/extension/commands.ts
- [ ] T151 [Extension] Show compilation errors in Problems panel in packages/extension/src/extension/commands.ts
- [ ] T152 [Extension] Register compilation commands in packages/extension/src/extension/main.ts

### Status Bar Integration

- [ ] T153 [Extension] Implement status bar item for compiler status in packages/extension/src/extension/status-bar.ts
- [ ] T154 [Extension] Update status bar on compilation success/failure in packages/extension/src/extension/status-bar.ts

### Extension Build & Bundle

- [ ] T155 [Extension] Configure esbuild to bundle extension and language server separately in packages/extension/esbuild.mjs
- [ ] T156 [Extension] Mark vscode module as external in packages/extension/esbuild.mjs
- [ ] T157 [Extension] Enable sourcemaps for debugging in packages/extension/esbuild.mjs
- [ ] T158 [Extension] Test extension in Extension Development Host (launch.json configuration)

**Checkpoint**: VS Code extension works according to extension-api.md contract. .eli files have syntax highlighting, validation, autocompletion, and compilation commands.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple components

- [ ] T159 [P] [Polish] Add JSDoc comments to all public APIs in packages/compiler/src/index.ts
- [ ] T160 [P] [Polish] Add README.md to each package (language, compiler, cli, extension)
- [ ] T161 [P] [Polish] Create examples in examples/ directory (video-annotation.eli, presentation.eli, infographic.eli)
- [ ] T162 [Polish] Verify all tests pass with npm run test from root
- [ ] T163 [Polish] Verify build works with npm run build from root
- [ ] T164 [Polish] Run quickstart.md validation (install CLI, compile example, verify output)
- [ ] T165 [P] [Polish] Add LICENSE file
- [ ] T166 [P] [Polish] Add CONTRIBUTING.md with development setup instructions
- [ ] T167 [Polish] Performance profiling for typical DSL files (<1000 lines should compile <500ms)
- [ ] T168 [Polish] Memory profiling (<100MB during compilation)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all subsequent phases
- **Grammar (Phase 3)**: Depends on Foundational (needs types)
- **Validation (Phase 4)**: Depends on Grammar (needs AST)
- **Compiler (Phase 5)**: Depends on Foundational, Grammar, Validation
- **Error Reporting (Phase 6)**: Depends on Compiler (needs error types)
- **CLI (Phase 7)**: Depends on Compiler, Error Reporting
- **Extension (Phase 8)**: Depends on Grammar, Validation, Compiler
- **Polish (Phase 9)**: Depends on all previous phases

### Critical Path

```
Setup → Foundational → Grammar → Validation → Compiler → Error Reporting → CLI
                                                                            ↓
                                                                         Extension
```

### Parallel Opportunities

- **Phase 1 Setup**: All T001-T010 can run in parallel (different package.json files)
- **Phase 2 Foundational**: T011-T014 (types) can run in parallel, T015-T017 (services) can run in parallel
- **Phase 3 Grammar**: T029-T030 (fixtures) can run in parallel with grammar definition
- **Phase 4 Validation**: T037-T041 (different validators) can run in parallel
- **Phase 5 Compiler**:
  - Within Transform: T050-T054 can run in parallel
  - Within TypeCheck: T060-T062 can run in parallel
  - Within Optimize: T065-T066 can run in parallel
  - Within Emit: T070-T072 can run in parallel
- **Phase 6 Error Reporting**: T094-T097 can run in parallel
- **Phase 8 Extension**: T139-T142 (completion providers) can run in parallel

---

## Implementation Strategy

### MVP Phases (Minimum Viable Product)

**MVP Goal**: Working CLI compiler that can compile simple DSL files to JSON

1. **Phase 1: Setup** → Dependencies installed, build works
2. **Phase 2: Foundational** → Types and Effect services ready
3. **Phase 3: Grammar** → Can parse simple DSL (timeline + events + actions)
4. **Phase 4: Validation** → Basic validation (unique IDs, valid times)
5. **Phase 5: Compiler** → AST → JSON pipeline works
6. **Phase 6: Error Reporting** → Clear error messages
7. **Phase 7: CLI** → Command-line compiler works

**MVP Checkpoint**: Can compile `examples/simple-timeline.eli` from command line and get valid Eligius JSON

### Post-MVP (Extension)

8. **Phase 8: Extension** → VS Code integration (syntax highlighting, validation, compilation)

**Full Product Checkpoint**: Can edit .eli files in VS Code with full IDE support

### Polish

9. **Phase 9: Polish** → Documentation, examples, performance tuning

### Incremental Delivery

- After Phase 7 CLI: Deliverable CLI compiler, users can compile from command line
- After Phase 8 Extension: Deliverable VS Code extension, users can edit DSL in IDE
- After Phase 9 Polish: Production-ready release with docs and examples

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Phase] label maps task to specific feature phase
- Tests use vitest with `__tests__/` subdirectories and `.spec.ts` naming
- Test fixtures in `__fixtures__/` subdirectories
- Commit after each logical task group
- Stop at any checkpoint to validate phase independently
- Follow constitution: simplicity, testing, functional programming, immutability

---

**Generated**: 2025-10-14
**Total Tasks**: 168
**Estimated MVP Tasks**: 126 (T001-T126)
**Parallel Opportunities**: 47 tasks marked [P]
