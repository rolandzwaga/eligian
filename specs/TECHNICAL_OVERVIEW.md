# Eligian Technical Overview

> **Comprehensive technical reference for the Eligian DSL compiler and VS Code extension**

This document provides a detailed technical analysis of the Eligian codebase, covering architecture, build systems, module organization, and operational procedures. It serves as the primary reference for developers working on the project.

---

## Table of Contents

- [Project Architecture](#project-architecture)
- [Package Overview](#package-overview)
- [Build System](#build-system)
- [Compilation Pipeline](#compilation-pipeline)
- [Module Organization](#module-organization)
- [VS Code Extension](#vs-code-extension)
- [CLI Compiler](#cli-compiler)
- [Testing Infrastructure](#testing-infrastructure)
- [Development Workflow](#development-workflow)
- [Dependency Management](#dependency-management)
- [Code Quality Tools](#code-quality-tools)

---

## Project Architecture

### Monorepo Structure

Eligian is organized as a **pnpm workspace monorepo** with 5 packages:

```
eligian/
├── packages/
│   ├── language/          # Core: Grammar, compiler, LSP server
│   ├── cli/               # Command-line compiler
│   ├── extension/         # VS Code extension
│   └── shared-utils/      # Shared error types and utilities
├── examples/              # Example .eligian programs
├── specs/                 # Feature specifications
├── .specify/              # Project constitution and templates
└── pnpm-workspace.yaml    # Workspace configuration
```

**Workspace Configuration** (`pnpm-workspace.yaml`):
```yaml
packages:
  - 'packages/*'
```

All packages share a **single pnpm lockfile** at the root for consistent dependency resolution.

### Package Dependencies

```
┌─────────────────────────────────────┐
│  Root Workspace                     │
│  (effect, eligius, dev tools)       │
└─────────────────────────────────────┘
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
┌─────────────┐    ┌─────────────┐
│  language   │    │shared-utils │
│  (core)     │    │  (errors)   │
└─────────────┘    └─────────────┘
    ↑                   ↑
    │ depends on        │
    ├───────────────────┤
    │                   │
┌─────────────┐    ┌─────────────┐
│     cli     │    │  extension  │
│ (compiler)  │    │  (VS Code)  │
└─────────────┘    └─────────────┘
```

**Dependency Graph**:
- **Root**: Provides `effect`, `eligius`, and all dev dependencies
- **language**: Core package with grammar, compiler, LSP (depends on: shared-utils)
- **cli**: CLI wrapper around language package (depends on: language)
- **extension**: VS Code extension and webview (depends on: language, shared-utils)
- **shared-utils**: Shared error types (no dependencies)

---

## Package Overview

### 1. @eligian/language

**Purpose**: Core package containing Langium grammar, compiler pipeline, and Language Server Protocol implementation.

**Size**: ~5,000 lines of TypeScript

**Key Responsibilities**:
- DSL grammar definition (`eligian.langium`)
- Compiler pipeline (parse → validate → transform → optimize → emit)
- Language Server Protocol implementation (validation, completion, hover, navigation)
- Type system (Typir-based type inference and validation)
- CSS validation and registry
- Operation registry (79 Eligius operations)
- JSDoc documentation support

**Entry Points**:
- **Main**: `src/index.ts` → `dist/index.cjs` (CommonJS for extension compatibility)
- **Errors**: `src/errors/index.ts` → `dist/errors/index.cjs` (Feature 018)
- **CSS Service**: `src/css/css-service.ts` → `dist/css/css-service.cjs` (Feature 018)

**Exports** (`package.json`):
```json
{
  ".": "./dist/index.cjs",
  "./css-service": "./dist/css/css-service.cjs",
  "./errors": "./dist/errors/index.cjs"
}
```

**Build Output**:
- `dist/` - Bundled JavaScript (CommonJS, ~200KB)
- `out/` - TypeScript declarations (.d.ts files)
- `src/generated/` - Langium-generated parser and AST

**Dependencies**:
- `langium@4.0.3` - Language framework
- `typir@0.3.0`, `typir-langium@0.3.0` - Type system
- `postcss@8.5.6`, `css-tree@3.1.0` - CSS parsing
- `effect@3.19.3` - Functional error handling (inherited from root)
- `eligius@1.5.0` - Eligius library (inherited from root)

### 2. @eligian/cli

**Purpose**: Command-line compiler for `.eligian` files.

**Size**: ~250 lines of TypeScript (single file)

**Key Responsibilities**:
- CLI argument parsing (using `commander.js`)
- File I/O (read `.eligian`, write `.json`)
- Error formatting and display
- Asset validation integration

**Entry Point**:
- **Binary**: `src/main.ts` → `dist/cli.mjs` (ESM bundle)
- **Bin Name**: `eligian-cli` (executable name)

**Build Output**:
- `dist/cli.mjs` - ESM bundle (~50KB)

**Dependencies**:
- `@eligian/language@workspace:*` - Core compiler
- `commander@11.1.0` - CLI argument parser
- `chalk@5.6.2` - Terminal colors
- `effect@3.19.3` - Error handling (inherited from root)

**Exit Codes**:
- `0` - Success
- `1` - Compilation error (parse/validate/transform)
- `3` - I/O error (file not found, permission denied)

### 3. @eligian/vscode-extension

**Purpose**: VS Code extension providing IDE support for Eligian DSL.

**Size**: ~1,500 lines of TypeScript

**Key Responsibilities**:
- Language client (LSP client for VS Code)
- Language server (Langium LSP server)
- Webview preview (Eligius engine rendering)
- CSS hot-reload (live preview updates)
- Syntax highlighting (TextMate grammar)
- Commands: `eligian.compile`, `eligian.preview`

**Entry Points**:
- **Extension**: `src/extension/main.ts` → `out/extension/main.cjs` (CommonJS)
- **Language Server**: `src/language/main.ts` → bundled into extension
- **Webview**: `media/preview.ts` → `out/media/preview.js` (IIFE bundle)

**Build Output**:
- `out/extension/main.cjs` - Extension host bundle (~500KB)
- `out/language/main.cjs` - Language server bundle (~500KB)
- `out/media/preview.js` - Webview bundle (~200KB, IIFE)
- `syntaxes/eligian.tmLanguage.json` - TextMate grammar (copied from language package)

**Dependencies**:
- `@eligian/language@workspace:*` - Core compiler and LSP
- `@eligian/shared-utils@workspace:*` - Error types
- `vscode-languageclient@9.0.1`, `vscode-languageserver@9.0.1` - LSP implementation
- `eligius@1.5.0` - Webview timeline engine (inherited from root)
- `jquery@3.7.1`, `video.js@8.23.4`, `lottie-web@^5.13.0` - Webview UI dependencies

**VS Code Integration**:
- **Language ID**: `eligian`
- **File Extensions**: `.eligian`
- **Activation**: `onLanguage:eligian`
- **Commands**: Compile, Preview (keyboard: `Ctrl+K V` / `Cmd+K V`)

### 4. @eligian/shared-utils

**Purpose**: Shared error types and utilities used across packages.

**Size**: ~400 lines of TypeScript

**Key Responsibilities**:
- `AssetError` type definitions
- Source location utilities
- Error formatting helpers

**Dependencies**: None (pure utility package)

---

## Build System

### Three-Tool Pipeline

The build system uses three specialized tools:

1. **Langium CLI** (v4.0.0) - Grammar → Parser/AST generation
2. **TypeScript** (v5.9.3) - Source compilation with incremental builds
3. **esbuild** (v0.27.0) - Bundling (CommonJS, ESM, IIFE)

### Build Sequence

#### Language Package (`packages/language`)

**Command**: `pnpm run build`

**Steps** (defined in `package.json:scripts.build`):
```bash
# 1. Generate metadata and parser
pnpm run generate

# 2. Bundle with esbuild
node esbuild.mjs

# 3. Generate TypeScript declarations
tsc -p tsconfig.src.json --emitDeclarationOnly
```

**Step 1: Generate** (`pnpm run generate`):
```bash
# 1a. Generate completion metadata (timeline events, CSS properties)
tsx src/completion/generate-metadata.ts

# 1b. Generate operation registry from Eligius npm package
tsx src/compiler/operations/generate-registry.ts

# 1c. Generate Langium parser from grammar
langium generate
```

**Generated Files**:
- `src/completion/metadata/timeline-events.generated.ts` - Timeline event metadata
- `src/completion/metadata/css-properties.generated.ts` - CSS property metadata
- `src/compiler/operations/registry.generated.ts` - Operation registry (79 operations)
- `src/generated/ast.ts` - AST node types
- `src/generated/grammar.ts` - Parser implementation
- `src/generated/module.ts` - Langium module

**Step 2: Bundle** (`node esbuild.mjs`):
- **Input**: `src/index.ts`, `src/errors/index.ts`
- **Output**: `dist/index.cjs`, `dist/errors/index.cjs`
- **Format**: CommonJS (required for VS Code extension compatibility)
- **Target**: ES2017
- **External**: `vscode`, `css-tree` (not bundled)
- **Sourcemaps**: Yes (unless `--minify` flag)

**Step 3: Declarations** (`tsc`):
- **Input**: All TypeScript files in `src/`
- **Output**: `.d.ts` files in `out/`
- **Config**: `tsconfig.src.json`

**Build Output Size**: ~200KB (bundled JavaScript) + declarations

#### CLI Package (`packages/cli`)

**Command**: `pnpm run build`

**Steps**:
```bash
# Bundle with esbuild
node esbuild.mjs
```

**esbuild Configuration** (`esbuild.mjs`):
```javascript
{
  entryPoints: ['src/main.ts'],
  outfile: 'dist/cli.mjs',
  bundle: true,
  target: 'ES2022',  // ES2022 supports top-level await
  format: 'esm',     // ESM required for top-level await and import.meta
  packages: 'external',  // Don't bundle node_modules
  platform: 'node',
  sourcemap: true
}
```

**Why ESM?**
- CLI uses **top-level await** (reading package.json asynchronously)
- CLI uses **import.meta.url** for path resolution
- Both features require ESM format

**Build Output**: `dist/cli.mjs` (~50KB)

#### Extension Package (`packages/extension`)

**Command**: `pnpm run build`

**Steps**:
```bash
# 1. Copy TextMate grammar from language package
pnpm run build:prepare

# 2. Compile TypeScript (incremental)
tsc -b tsconfig.json

# 3. Bundle with esbuild
node esbuild.mjs
```

**Step 1: Prepare** (`build:prepare`):
```bash
mkdir -p ./syntaxes/
cp ../language/syntaxes/eligian.tmLanguage.json ./syntaxes/
```

**Step 2: TypeScript Compilation**:
- **Config**: `tsconfig.json` (incremental mode enabled)
- **Output**: Intermediate `.js` files (not bundled yet)

**Step 3: Bundle** (`node esbuild.mjs`):

Three separate bundles:

**Extension Host** (UI thread):
```javascript
{
  entryPoints: ['src/extension/main.ts'],
  outfile: 'out/extension/main.cjs',
  format: 'cjs',  // CommonJS required by VS Code
  external: ['vscode'],  // VS Code API not bundled
  platform: 'node'
}
```

**Language Server** (separate process):
```javascript
{
  entryPoints: ['src/language/main.ts'],
  outfile: 'out/language/main.cjs',
  format: 'cjs',
  external: ['vscode'],
  platform: 'node'
}
```

**Webview Preview** (browser context):
```javascript
{
  entryPoints: ['media/preview.ts'],
  outfile: 'out/media/preview.js',
  format: 'iife',  // IIFE for browser script tag
  platform: 'browser',
  external: []  // Bundle everything
}
```

**Build Output**: ~1MB total (3 bundles + syntax grammar)

### Workspace-Level Build

**Command**: `pnpm run build` (root)

**Execution**: Runs `pnpm -r build` (recursive build across all packages)

**Order**: pnpm automatically determines build order based on workspace dependencies:
1. `shared-utils` (no dependencies)
2. `language` (depends on shared-utils)
3. `cli` and `extension` (depend on language, built in parallel)

**Parallel Builds**: Enabled by default (pnpm runs independent packages concurrently)

---

## Compilation Pipeline

### Overview

The compiler transforms Eligian DSL source code into Eligius JSON configuration through a **five-stage pipeline** using Effect-ts for composable error handling.

```
DSL Source (.eligian)
        ↓
   [1. Parse]  ────→  Langium AST
        ↓
   [2. Validate & Transform]  ────→  Eligius IR
        ↓
   [3. Type Check]  ────→  Typed IR
        ↓
   [4. Optimize]  ────→  Optimized IR
        ↓
   [5. Emit]  ────→  Eligius JSON
```

### Pipeline Stages

#### Stage 1: Parse

**Module**: `src/compiler/pipeline.ts` (uses Langium parser)

**Input**: DSL source code (string)

**Output**: `Effect<Program, ParseError>`

**Responsibilities**:
- Langium parses source using grammar (`eligian.langium`)
- Creates Abstract Syntax Tree (AST)
- Detects syntax errors (missing semicolons, invalid tokens, etc.)
- Captures source locations for error reporting

**Implementation**:
```typescript
function parseSource(
  source: string,
  sourceUri?: string
): Effect.Effect<Program, ParseError>
```

**Error Types**:
- `ParseError` - Syntax errors with line/column information

**State Management**:
- Uses singleton Langium service instance (`sharedServices`)
- **CRITICAL**: Clears CSS registry state before each parse to ensure compilation isolation
- Prevents state pollution across multiple compilations

#### Stage 2: Validate & Transform

**Module**: `src/compiler/ast-transformer.ts`, `src/eligian-validator.ts`

**Input**: `Program` (Langium AST)

**Output**: `Effect<EligiusIR, TransformError | ValidationError>`

**Responsibilities**:
- **Semantic validation**: Name resolution, scoping, type checking
- **CSS validation**: Class names, selectors, file errors
- **AST transformation**: Convert Langium AST to Eligius Intermediate Representation (IR)
- **Name resolution**: Resolve action calls, operation calls
- **Asset loading**: Validate CSS files, HTML templates

**Validators** (`eligian-validator.ts`):
- `checkActionNameCollision()` - Prevent action names conflicting with operations
- `checkDuplicateActions()` - Prevent duplicate action definitions
- `checkCSSImports()` - Validate CSS file imports
- `checkClassNameParameter()` - Validate CSS class names
- `checkSelectorParameter()` - Validate CSS selectors
- `checkTimelineOperationCall()` - Validate operation calls in timeline context
- `checkReservedKeywords()` - Prevent using reserved keywords as identifiers
- `checkBreakContinueUsage()` - Validate break/continue only in loops

**Transformer** (`ast-transformer.ts`):
- `transformProgram()` - Entry point
- `transformTimeline()` - Timeline → TimelineConfiguration
- `transformEvent()` - Event → TimelineEvent
- `transformOperationCall()` - Operation/Action → Eligius operation
- `transformIfStatement()` - If/else → conditional operations
- `transformForStatement()` - For loop → forEach operation
- `transformSequenceBlock()` - Sequence → sequential operations
- `transformStaggerBlock()` - Stagger → staggered operations

**Error Types**:
- `ValidationError` - Semantic errors (undefined names, type mismatches)
- `TransformError` - AST transformation failures

#### Stage 3: Type Check

**Module**: `src/compiler/type-checker.ts`

**Input**: `EligiusIR`

**Output**: `Effect<EligiusIR, TypeError>`

**Responsibilities**:
- Validate Eligius-specific constraints
- Check timeline consistency (start/end times, overlaps)
- Verify provider configurations
- Type inference and checking (optional, via Typir)

**Type System** (Typir-based):
- Import type checking (`Import<css>`)
- Timeline event validation (`TimedEvent: 0s → 5s`)
- Control flow type checking (boolean conditions, array collections)
- Timeline configuration validation (provider-source consistency)

**Error Types**:
- `TypeError` - Type constraint violations

#### Stage 4: Optimize

**Module**: `src/compiler/optimizer.ts`

**Input**: `EligiusIR`

**Output**: `Effect<EligiusIR, never>` (optimizations cannot fail)

**Responsibilities**:
- Dead code elimination (unreachable events)
- Constant folding (compile-time evaluation)
- Timeline optimization (merge adjacent events)

**Optimization Passes**:
1. **Dead Code Elimination**: Remove unreachable timeline events
2. **Constant Folding**: Evaluate constant expressions at compile time
3. **Timeline Merging**: Combine adjacent events with same configuration

**Internal Mutation**:
Per constitution principle VI, optimizations use **internal mutation for performance** while maintaining **external immutability** (returns new IR reference).

#### Stage 5: Emit

**Module**: `src/compiler/emitter.ts`

**Input**: `EligiusIR`

**Output**: `Effect<IEngineConfiguration, EmitError>`

**Responsibilities**:
- Convert Eligius IR to final JSON structure
- Format according to Eligius schema
- Validate output structure

**Output Structure** (Eligius JSON):
```json
{
  "timelines": [...],
  "providers": [...],
  "cssFiles": [...],
  "layoutTemplate": "...",
  "imports": {...}
}
```

**Error Types**:
- `EmitError` - JSON generation failures

### Pipeline Orchestration

**Main Function** (`src/compiler/pipeline.ts`):
```typescript
export function compile(
  source: string,
  options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError>
```

**Effect Composition**:
```typescript
const compile = (source: string) =>
  pipe(
    parseSource(source),           // Stage 1
    Effect.flatMap(transformAST),  // Stage 2
    Effect.flatMap(typeCheck),     // Stage 3
    Effect.flatMap(optimize),      // Stage 4
    Effect.flatMap(emitJSON)       // Stage 5
  )
```

**Error Accumulation**:
All stages use Effect-ts for **typed error handling**. Errors short-circuit the pipeline and are formatted for display.

**Compile Options**:
```typescript
interface CompileOptions {
  optimize?: boolean;   // Enable/disable optimizations (default: true)
  minify?: boolean;     // Minify JSON output (default: false)
  sourceUri?: string;   // Source file URI for CSS resolution
}
```

---

## Module Organization

The language package is organized into **12 functional domains**:

### 1. Grammar & Parser

**Location**: `src/`

**Files**:
- `eligian.langium` - Grammar definition (550 lines)
- `generated/ast.ts` - Generated AST node types
- `generated/grammar.ts` - Generated parser
- `generated/module.ts` - Generated Langium module

**Grammar Structure**:
```langium
Program:
  imports+=Import*
  actions+=ActionDefinition*
  timelines+=Timeline*;

Timeline:
  'timeline' name=STRING 'at' start=TimeValue '{'
    events+=Event*
  '}';

Event:
  'at' timeRange=TimeRange operation=OperationStatement;
```

**Key Constructs**:
- Imports (`styles`, `layout`, `library`)
- Action definitions (`action name(params) [operations]`)
- Timelines (`timeline "name" at 0s { ... }`)
- Events (`at 0s..5s operation`)
- Control flow (`if/else`, `for`, `break/continue`)
- Sequences (`{ op1, op2 }`)
- Staggers (`stagger 200ms items with operation`)

### 2. Compiler Pipeline

**Location**: `src/compiler/`

**Files**:
- `pipeline.ts` - Main orchestration (360 lines)
- `ast-transformer.ts` - AST → IR transformation (1,630 lines)
- `type-checker.ts` - Type validation (currently minimal, delegates to Typir)
- `optimizer.ts` - Optimization passes (currently minimal)
- `emitter.ts` - IR → JSON output (150 lines)

**Key Functions**:
- `compile()` - Main entry point
- `parseSource()` - Parse DSL to AST
- `transformAST()` - AST to Eligius IR
- `typeCheck()` - Validate IR constraints
- `optimize()` - Apply optimizations
- `emitJSON()` - Generate final JSON

### 3. Language Services

**Location**: `src/`

**Files**:
- `eligian-validator.ts` - Semantic validation (1,400 lines)
- `eligian-scope.ts` - Name resolution and scoping (280 lines)
- `eligian-completion-provider.ts` - Autocompletion (570 lines)
- `eligian-hover-provider.ts` - Hover documentation (390 lines)
- `eligian-code-actions.ts` - Quick fixes (260 lines)
- `eligian-references.ts` - Find references (210 lines)
- `eligian-rename.ts` - Rename refactoring (180 lines)

**LSP Features**:
- **Validation**: Real-time error checking
- **Completion**: Context-aware suggestions (operations, CSS classes, action names)
- **Hover**: Documentation display (action JSDoc, operation signatures)
- **Go to Definition**: Navigate to action definitions
- **Find References**: Find all action usages
- **Rename**: Refactor action names

### 4. Operations System

**Location**: `src/compiler/operations/`

**Files**:
- `registry.generated.ts` - Auto-generated registry of 79 Eligius operations
- `generate-registry.ts` - Generator script (extracts from Eligius npm package)
- `operation-metadata.ts` - Operation metadata types

**Operation Categories** (79 total):
- **Selection**: `selectElement`, `selectAll`, `deselectElement`, `deselectAll`
- **DOM Manipulation**: `addClass`, `removeClass`, `toggleClass`, `setAttribute`, `removeAttribute`
- **Animation**: `animate`, `cancelAnimation`, `pauseAnimation`, `resumeAnimation`
- **Visibility**: `show`, `hide`, `fadeIn`, `fadeOut`
- **Control Flow**: `conditional`, `forEach`, `breakForEach`, `continueForEach`
- **Action Management**: `requestAction`, `startAction`, `cancelAction`
- **Timeline Control**: `pauseTimeline`, `resumeTimeline`, `seekTimeline`
- **Events**: `addEventListener`, `removeEventListener`, `dispatchEvent`
- **Media**: `playMedia`, `pauseMedia`, `seekMedia`
- **And 50+ more**

**Registry Structure**:
```typescript
export const OPERATION_REGISTRY: Record<string, OperationMetadata> = {
  selectElement: {
    name: 'selectElement',
    parameters: [
      { name: 'selector', type: 'string', required: true }
    ]
  },
  // ... 78 more operations
}
```

**Auto-Generation** (`generate-registry.ts`):
- Reads Eligius npm package at runtime
- Extracts operation metadata from TypeScript types
- Generates `registry.generated.ts` with operation signatures
- Runs during `pnpm run generate` before build

### 5. Type System (Typir)

**Location**: `src/type-system-typir/`

**Files**:
- `types/` - Custom type factories (ImportType, TimelineEventType, TimelineType)
- `inference/` - Type inference rules per construct
- `validation/` - Validation rules per construct
- `utils/` - Shared utilities (time parsing, asset type inference)
- `README.md` - Type system documentation

**Features** (Feature 021 - All 5 User Stories Complete):
- ✅ **US1**: Import statement type checking
- ✅ **US2**: Reserved keyword validation for constants
- ✅ **US3**: Timeline event validation
- ✅ **US4**: Control flow type checking
- ✅ **US5**: Timeline configuration validation

**Test Coverage**: 139 tests, 81.72% overall coverage

**Documentation**: `packages/language/src/type-system-typir/README.md`

### 6. CSS Support

**Location**: `src/css/`

**Files**:
- `css-parser.ts` - PostCSS-based parser (5,089 bytes)
- `css-registry.ts` - Centralized registry service (10,500 bytes)
- `levenshtein.ts` - Edit distance for suggestions (3,938 bytes)
- `selector-parser.ts` - CSS selector parsing (2,535 bytes)
- `css-service.ts` - Public API (exported as `@eligian/language/css-service`)

**Features** (Feature 013):
- CSS class name validation (`addClass("className")`)
- CSS selector validation (`selectElement(".class#id")`)
- CSS file syntax validation
- Hot-reload validation (updates on file change)
- "Did you mean?" suggestions (Levenshtein distance ≤ 2)

**Registry API**:
```typescript
interface CSSRegistryService {
  updateCSSFile(fileUri: string, metadata: CSSParseResult): void;
  registerImports(documentUri: string, cssFileUris: string[]): void;
  getClassesForDocument(documentUri: string): Set<string>;
  getIDsForDocument(documentUri: string): Set<string>;
  findClassLocation(documentUri: string, className: string): CSSSourceLocation | undefined;
  hasErrors(fileUri: string): boolean;
  getErrors(fileUri: string): CSSParseError[];
}
```

**Test Coverage**: 130 unit tests + 22 integration tests

### 7. Asset Loading & Validation

**Location**: `src/asset-loading/`

**Files**:
- `compiler-integration.ts` - Asset loading orchestration
- `css-file-validator.ts` - CSS file validation
- `html-template-validator.ts` - HTML template validation
- `library-validator.ts` - Library import validation

**Features** (Feature 010):
- CSS file imports (`styles "./file.css"`)
- HTML template imports (`layout "./template.html"`)
- Library imports (`library "./actions.eligian"`)
- File existence validation
- Syntax validation (CSS, HTML)
- Circular dependency detection (libraries)

**Asset Types**:
```typescript
interface AssetLoadingResult {
  cssFiles: string[];            // Validated CSS files
  layoutTemplate: string | null; // Validated HTML template
  importMap: Record<string, Library>; // Validated libraries
  errors: AssetError[];          // Validation errors
}
```

### 8. JSDoc Support

**Location**: `src/jsdoc/`

**Files**:
- `jsdoc-parser.ts` - Parse JSDoc comments (1,876 bytes)
- `jsdoc-extractor.ts` - Extract from AST (996 bytes)
- `jsdoc-formatter.ts` - Format as markdown (1,445 bytes)
- `jsdoc-template-generator.ts` - Generate templates (2,890 bytes)

**Features** (Feature 020):
- JSDoc-style action documentation (`/** @param ... */`)
- Auto-generation (type `/**` above action, press Enter)
- Hover tooltips with formatted documentation
- Type inference for untyped parameters

**Example**:
```eligian
/**
 * Fades in an element
 * @param selector CSS selector
 * @param duration Animation duration in ms
 */
action fadeIn(selector: string, duration: number) [...]
```

**Test Coverage**: 31 tests across 6 test suites

### 9. Error System

**Location**: `src/errors/`

**Files**:
- `index.ts` - Unified error namespace
- `parse-error.ts` - Syntax errors
- `validation-error.ts` - Semantic errors
- `transform-error.ts` - AST transformation errors
- `type-error.ts` - Type constraint errors
- `emit-error.ts` - JSON generation errors

**Error Structure**:
```typescript
interface CompileError {
  message: string;
  location: { line: number; column: number; file: string };
  code: string;  // Error code (e.g., 'unknown_css_class')
  hint?: string; // Suggested fix
}
```

**Formatted Output**:
```
Error: Unknown CSS class: 'buttom'

  3 │   at 0s selectElement("#box") {
  4 │     addClass("buttom")
    │              ^^^^^^^^
  5 │   }

💡 Did you mean: 'button'?
```

### 10. Effect-ts Services

**Location**: `src/compiler/` (currently minimal, placeholder for future)

**Files**:
- `pipeline.ts` - Uses Effect for error handling

**Current Usage**:
- All pipeline stages return `Effect<Success, Error>`
- Composable error handling via `Effect.flatMap`
- Type-safe error propagation

**Future Services** (planned):
- `FileSystemService` - File I/O effects
- `LoggerService` - Logging effects
- `CompilerService` - Compilation effects

### 11. Utilities

**Location**: `src/utils/`

**Files**:
- `ast-helpers.ts` - AST traversal utilities
- `time-parser.ts` - Time value parsing (`0s`, `1.5s`, etc.)
- `name-resolver.ts` - Action/operation name resolution
- `source-location.ts` - Source location helpers

**Key Functions**:
- `findActionByName()` - Lookup action definitions
- `suggestSimilarActions()` - Levenshtein-based suggestions
- `parseTimeValue()` - Parse time strings to milliseconds
- `getSourceLocation()` - Extract source location from AST node

### 12. Tests

**Location**: `src/__tests__/`

**Structure**:
```
__tests__/
├── parsing.spec.ts               # Grammar tests
├── validation.spec.ts            # Semantic validation tests
├── transformer.spec.ts           # AST transformation tests
├── type-system.spec.ts           # Type system tests
├── css-classname-validation/     # CSS class validation (5 files)
├── css-selector-validation/      # CSS selector validation (3 files)
├── css-hot-reload/               # CSS hot-reload tests (1 file)
├── css-invalid-file/             # CSS error handling (1 file)
├── jsdoc-integration/            # JSDoc tests (2 files)
├── test-helpers.ts               # Shared test utilities
└── __fixtures__/                 # Test data
    ├── valid/                    # Valid DSL programs
    ├── invalid/                  # Invalid DSL programs
    └── css/                      # CSS test files
```

**Test Count**: 1,483 tests (1,471 passing, 12 skipped)

**Coverage**: 81.72% (v8 provider)

**Test Helpers** (Feature 022):
```typescript
// Create test context (Langium services, parse, validate)
const ctx = createTestContext();

// Parse and validate DSL
const { program, errors } = await ctx.parseAndValidate('...');

// Setup CSS registry for tests
setupCSSRegistry(ctx, 'file:///styles.css', {
  classes: ['button', 'primary'],
  ids: ['header']
});

// Filter diagnostics by severity
const errors = getErrors(diagnostics);
const warnings = getWarnings(diagnostics);
```

---

## VS Code Extension

### Architecture

The extension uses a **three-process architecture**:

```
┌─────────────────────────────────────────────────┐
│  VS Code Extension Host (UI Thread)             │
│  - Language client (LSP client)                 │
│  - Webview management (preview panels)          │
│  - CSS watcher (file change detection)          │
│  - Commands (compile, preview)                  │
└─────────────────────────────────────────────────┘
              ↓ JSON-RPC ↑
┌─────────────────────────────────────────────────┐
│  Language Server (Separate Process)             │
│  - LSP implementation (Langium)                 │
│  - Validation, completion, hover, navigation    │
│  - CSS registry (class/selector validation)     │
│  - Typir integration (type system)              │
└─────────────────────────────────────────────────┘
              ↓ postMessage ↑
┌─────────────────────────────────────────────────┐
│  Webview Preview (Browser Context)              │
│  - Eligius engine rendering                     │
│  - Timeline playback controls                   │
│  - CSS injection and hot-reload                 │
│  - Error display                                │
└─────────────────────────────────────────────────┘
```

### Extension Host

**Entry Point**: `src/extension/main.ts`

**Responsibilities**:
1. **Language Client**: Start LSP client, manage server lifecycle
2. **Webview Management**: Create/destroy preview panels
3. **CSS Watcher**: Watch CSS files for changes, trigger hot-reload
4. **Commands**: Register `eligian.compile`, `eligian.preview`
5. **Decorations**: Block label decorations for timeline events

**Key Modules**:
- `language-client.ts` - LSP client setup
- `preview-panel.ts` - Webview panel lifecycle
- `css-watcher.ts` - CSS file watching (Feature 011)
- `webview-css-injector.ts` - CSS injection/hot-reload (Feature 011)
- `css-loader.ts` - CSS loading utilities (Feature 011)
- `decorations/block-label-decoration-provider.ts` - Timeline event decorations

**Commands**:
```typescript
// Compile current .eligian file to JSON
vscode.commands.registerCommand('eligian.compile', async () => {
  const editor = vscode.window.activeTextEditor;
  const document = editor?.document;
  // ... compile and save to .json
});

// Open preview panel for current .eligian file
vscode.commands.registerCommand('eligian.preview', async () => {
  const editor = vscode.window.activeTextEditor;
  const document = editor?.document;
  // ... create webview panel
});
```

**Keyboard Shortcuts**:
- `Ctrl+K V` (Windows/Linux) / `Cmd+K V` (Mac) - Open preview

### Language Server

**Entry Point**: `src/language/main.ts`

**Responsibilities**:
1. **LSP Server**: Implement Language Server Protocol
2. **Validation**: Real-time error checking
3. **Completion**: Context-aware suggestions
4. **Hover**: Documentation display
5. **Navigation**: Go to definition, find references
6. **CSS Notifications**: Handle CSS update notifications from extension

**LSP Lifecycle**:
```typescript
// 1. Create connection
const connection = createConnection(ProposedFeatures.all);

// 2. Create Langium services
const services = createEligianServices({ connection });

// 3. Start language server
startLanguageServer(services);

// 4. Handle CSS update notifications (Feature 013 - US3)
connection.onNotification(CSS_UPDATED_NOTIFICATION, async params => {
  // Re-parse CSS file, update registry, trigger re-validation
});
```

**LSP Features**:
- `textDocument/didOpen` - Document opened
- `textDocument/didChange` - Document edited
- `textDocument/completion` - Autocompletion
- `textDocument/hover` - Hover tooltips
- `textDocument/definition` - Go to definition
- `textDocument/references` - Find references
- `textDocument/rename` - Rename refactoring
- `textDocument/codeAction` - Quick fixes

### Webview Preview

**Entry Point**: `media/preview.ts`

**Responsibilities**:
1. **Eligius Engine**: Initialize and run timeline
2. **Playback Controls**: Play, pause, seek, restart
3. **CSS Injection**: Load and hot-reload CSS files
4. **Error Display**: Show compilation/runtime errors

**Message Protocol** (Extension ↔ Webview):
```typescript
// Extension → Webview
type WebviewMessage =
  | { type: 'compile'; config: IEngineConfiguration }
  | { type: 'css-load'; cssId: string; content: string }
  | { type: 'css-reload'; cssId: string; content: string }
  | { type: 'css-remove'; cssId: string }
  | { type: 'css-error'; filePath: string; error: string };

// Webview → Extension
type ExtensionMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string };
```

**CSS Hot-Reload Flow** (Feature 011 - US2):
1. User saves CSS file
2. Extension's `CSSWatcherManager` detects change (300ms debounce)
3. Extension sends `css-reload` message to webview
4. Webview updates `<style>` tag's `textContent`
5. Browser re-renders with new styles
6. **Timeline continues playing** (no engine restart)

**Content Security Policy**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src 'unsafe-inline';
               img-src ${cspSource} https: data:;
               font-src ${cspSource};
               script-src ${cspSource};">
```

### Syntax Highlighting

**Grammar**: `syntaxes/eligian.tmLanguage.json` (TextMate grammar)

**Scopes**:
- `keyword.control.eligian` - `timeline`, `action`, `at`, `if`, `else`, `for`, `break`, `continue`
- `string.quoted.double.eligian` - String literals
- `constant.numeric.eligian` - Numbers, time values
- `entity.name.function.eligian` - Action/operation names
- `comment.block.documentation.eligian` - JSDoc comments

**Generation**: Copied from language package during build

---

## CLI Compiler

### Overview

The CLI provides a standalone command-line interface for compiling `.eligian` files to Eligius JSON without VS Code.

**Binary Name**: `eligian-cli`

**Install Location**: `node_modules/.bin/eligian-cli` (when installed via npm/pnpm)

**Executable**: `dist/cli.mjs` (ESM bundle)

### Usage

**Basic Compilation**:
```bash
# Compile input.eligian → input.json
eligian-cli input.eligian

# Specify output file
eligian-cli input.eligian -o output.json

# Write to stdout (for piping)
eligian-cli input.eligian -o -
```

**Options**:
```bash
# Syntax check only (no output)
eligian-cli input.eligian --check

# Minify JSON output (no whitespace)
eligian-cli input.eligian --minify

# Disable optimizations
eligian-cli input.eligian --no-optimize

# Verbose logging
eligian-cli input.eligian -v

# Quiet mode (suppress success messages)
eligian-cli input.eligian -q
```

**Help**:
```bash
eligian-cli --help
eligian-cli --version
```

### Exit Codes

- **0**: Compilation successful
- **1**: Compilation error (parse/validate/transform)
- **3**: I/O error (file not found, permission denied)

### Error Formatting

The CLI formats errors with:
- **Error message** with context
- **Code snippet** showing error location
- **Hint** with suggested fix (when available)
- **Color-coded output** (via `chalk`)

**Example Output**:
```
Parse failed:

Error: Unexpected token 'at' (expected 'timeline' or 'action')

  3 │ action fadeIn() [...]
  4 │ at 0s selectElement("#box")
    │ ^^
  5 │ }

💡 Did you forget to wrap this in a timeline block?
```

### Implementation Details

**Entry Point**: `src/main.ts` (238 lines)

**Dependencies**:
- `commander@11.1.0` - CLI argument parsing
- `chalk@5.6.2` - Terminal colors
- `@eligian/language` - Core compiler
- `effect@3.19.3` - Error handling

**Main Workflow**:
```typescript
async function compileFile(inputPath: string, options: CompileOptions) {
  // 1. Read source file
  const sourceCode = await fs.readFile(inputPath, 'utf-8');

  // 2. Parse source to AST
  const parseEffect = parseSource(sourceCode, absoluteInputPath);
  const program = await Effect.runPromise(parseEffect);

  // 3. Validate and load assets
  if (hasImports(program)) {
    const assetResult = loadProgramAssets(program, absoluteInputPath);
    if (assetResult.errors.length > 0) {
      // Display asset errors and exit
    }
  }

  // 4. Compile AST to Eligius JSON
  const compileEffect = compile(sourceCode, {
    optimize: options.optimize,
    minify: options.minify,
    sourceUri: absoluteInputPath
  });
  const result = await Effect.runPromise(compileEffect);

  // 5. Write output (or check-only mode)
  if (options.check) {
    console.log(`✓ ${inputPath} is valid`);
  } else {
    const outputJson = JSON.stringify(result, null, options.minify ? 0 : 2);
    await fs.writeFile(outputPath, outputJson, 'utf-8');
    console.log(`✓ Compiled ${inputPath} → ${outputPath}`);
  }
}
```

**Error Handling**:
```typescript
// Parse errors
parseEffect.catch(error => {
  const formatted = formatErrors([error], sourceCode);
  console.error(chalk.red('\nParse failed:\n'));
  // ... display formatted errors
  process.exit(EXIT_COMPILE_ERROR);
});

// Asset validation errors
if (assetResult.errors.length > 0) {
  console.error(chalk.red('\nAsset validation failed:\n'));
  // ... display asset errors
  process.exit(EXIT_COMPILE_ERROR);
}

// Compilation errors
compileEffect.catch(error => {
  const formatted = formatErrors([error], sourceCode);
  console.error(chalk.red('\nCompilation failed:\n'));
  // ... display formatted errors
  process.exit(EXIT_COMPILE_ERROR);
});

// I/O errors
catch (error) {
  console.error(chalk.red(`I/O Error: ${error.message}`));
  process.exit(EXIT_IO_ERROR);
}
```

### Building the CLI

**Command**: `pnpm --filter @eligian/cli build`

**Steps**:
```bash
# 1. Bundle with esbuild
node esbuild.mjs
```

**esbuild Configuration**:
```javascript
{
  entryPoints: ['src/main.ts'],
  outfile: 'dist/cli.mjs',
  bundle: true,
  target: 'ES2022',     // Supports top-level await
  format: 'esm',        // ESM for import.meta and top-level await
  packages: 'external', // Don't bundle node_modules
  platform: 'node',
  sourcemap: true
}
```

**Output**: `dist/cli.mjs` (~50KB)

### Running the CLI

**From Package Root**:
```bash
# Build CLI first
pnpm --filter @eligian/cli build

# Run directly (Node.js ESM)
node packages/cli/dist/cli.mjs examples/simple-timeline.eligian

# Or via pnpm (no build needed if already built)
pnpm --filter @eligian/cli exec eligian-cli examples/simple-timeline.eligian
```

**From CLI Package**:
```bash
cd packages/cli

# Build
pnpm build

# Run
node dist/cli.mjs ../../examples/simple-timeline.eligian
```

**Global Installation** (for development):
```bash
# Link CLI globally
cd packages/cli
pnpm link --global

# Now available as 'eligian-cli' anywhere
eligian-cli examples/simple-timeline.eligian
```

**Testing the CLI**:
```bash
# Compile example file
pnpm --filter @eligian/cli build
node packages/cli/dist/cli.mjs examples/simple-timeline.eligian -o test-output.json

# Verify output
cat test-output.json
```

---

## Testing Infrastructure

### Test Framework

**Framework**: Vitest v3.2.4

**Runner**: `pnpm test` (runs all tests in language package)

**Coverage**: v8 provider (built into Node.js)

### Test Organization

**Location**: All tests in `packages/language/src/__tests__/`

**Structure**:
```
__tests__/
├── parsing.spec.ts               # Grammar parsing tests
├── validation.spec.ts            # Semantic validation tests
├── transformer.spec.ts           # AST transformation tests
├── type-system.spec.ts           # Type system tests
├── css-classname-validation/     # CSS class validation (5 files, 9 tests)
├── css-selector-validation/      # CSS selector validation (3 files, 14 tests)
├── css-hot-reload/               # CSS hot-reload tests (1 file, 6 tests)
├── css-invalid-file/             # CSS error handling (1 file, 6 tests)
├── jsdoc-integration/            # JSDoc tests (2 files, 11 tests)
├── test-helpers.ts               # Shared test utilities (Feature 022)
└── __fixtures__/                 # Test data
```

**Test Isolation**:
Each test suite in a separate file to prevent workspace contamination (per user directive in Feature 013).

### Test Helpers (Feature 022)

**Location**: `src/__tests__/test-helpers.ts`

**Utilities**:
```typescript
// Create test context (Langium services, parse, validate)
function createTestContext(): TestContext;

// Setup CSS registry with test data
function setupCSSRegistry(
  ctx: TestContext,
  fileUri: string,
  data: { classes?: string[]; ids?: string[] }
): void;

// Filter diagnostics by severity
function getErrors(diagnostics: Diagnostic[]): Diagnostic[];
function getWarnings(diagnostics: Diagnostic[]): Diagnostic[];

// Constants
const CSS_FIXTURES = { /* predefined CSS test data */ };
enum DiagnosticSeverity { Error = 1, Warning = 2, Information = 3, Hint = 4 }
```

**Usage Example**:
```typescript
import { createTestContext, setupCSSRegistry, getErrors } from './test-helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = createTestContext(); // Initialize once per suite
});

beforeEach(() => {
  setupCSSRegistry(ctx, 'file:///styles.css', {
    classes: ['button', 'primary'],
    ids: ['header']
  });
});

test('should validate CSS class names', async () => {
  const { errors } = await ctx.parseAndValidate(`
    styles "./styles.css"
    timeline "test" at 0s {
      at 0s selectElement("#header") {
        addClass("button")  // Valid
        addClass("invalid") // Error
      }
    }
  `);

  const errorMessages = getErrors(errors).map(e => e.message);
  expect(errorMessages).toContain('Unknown CSS class: \'invalid\'');
});
```

**Metrics** (as of Feature 022):
- **1,483 tests** passing (12 skipped)
- **81.72% coverage** (meets baseline target)
- **1,251 lines saved** (700 from createTestContext, 551 from setupCSSRegistry)

### Test Categories

**Unit Tests**:
- Grammar parsing (42 tests)
- Semantic validation (68 tests)
- AST transformation (52 tests)
- Type system (25 tests)
- CSS parsing (44 tests)
- Levenshtein distance (42 tests)
- CSS registry (34 tests)
- Selector parsing (42 tests)
- JSDoc parsing (9 tests)
- JSDoc extraction (4 tests)
- JSDoc formatting (15 tests)
- JSDoc template generation (6 tests)

**Integration Tests**:
- CSS class validation (9 tests)
- CSS selector validation (14 tests)
- CSS hot-reload (6 tests)
- CSS error handling (6 tests)
- JSDoc completion (5 tests)
- JSDoc hover (6 tests)
- Full compilation pipeline (25 tests)

**Fixture-Based Tests**:
- Valid DSL programs (`__fixtures__/valid/`)
- Invalid DSL programs (`__fixtures__/invalid/`)
- CSS test files (`__fixtures__/css/`)

### Running Tests

**All Tests**:
```bash
pnpm test
```

**Coverage Report**:
```bash
pnpm run test:coverage
```

**CI Coverage** (text output):
```bash
pnpm run test:coverage:ci
```

**Watch Mode** (auto-run on file change):
```bash
pnpm --filter @eligian/language run test -- --watch
```

**Single Test File**:
```bash
pnpm test parsing.spec.ts
```

**Test Filtering**:
```bash
# Run only tests matching pattern
pnpm test -- -t "CSS class validation"
```

### Coverage Configuration

**Config**: `vitest.config.ts` in language package

**Coverage Provider**: v8 (built into Node.js)

**Thresholds**:
- **Baseline**: 80% (current: 81.72%)
- **Target**: 85% (aspirational)

**Excluded from Coverage**:
- `src/generated/**` - Langium-generated code
- `src/**/*.generated.ts` - Auto-generated registries
- `src/__tests__/**` - Test files
- `src/**/*.spec.ts` - Test files
- `src/**/*.d.ts` - TypeScript declarations

**Coverage Report Formats**:
- **Terminal**: Text summary with percentages
- **HTML**: Detailed line-by-line coverage (in `coverage/` directory)
- **JSON**: Machine-readable coverage data

---

## Development Workflow

### Initial Setup

**Prerequisites**:
- **Node.js**: ≥20.10.0
- **pnpm**: 10.22.0 (enforced via `packageManager` field)

**Setup Commands**:
```bash
# 1. Clone repository
git clone https://github.com/rolandzwaga/eligian.git
cd eligian

# 2. Install dependencies (pnpm only!)
pnpm install

# 3. Generate Langium parser and metadata
pnpm run generate

# 4. Build all packages
pnpm run build

# 5. Run tests to verify setup
pnpm test
```

**Total Setup Time**: ~2 minutes (depending on network speed)

### Common Development Tasks

**Edit Grammar**:
```bash
# 1. Edit grammar file
code packages/language/src/eligian.langium

# 2. Regenerate parser
pnpm run langium:generate

# 3. Rebuild language package
pnpm --filter @eligian/language build

# 4. Run tests to verify
pnpm test
```

**Add New Feature**:
```bash
# 1. Update grammar (if needed)
# 2. Add validators (if needed)
# 3. Update transformer (if needed)
# 4. Write tests (REQUIRED)
# 5. Run tests
pnpm test

# 6. Format and lint code (REQUIRED before commit)
pnpm run check

# 7. Build to verify
pnpm build
```

**Run Pre-Commit Checks**:
```bash
# Run all quality checks
pnpm test          # All tests pass
pnpm run check     # Biome format + lint (0 errors)
pnpm run build     # TypeScript compiles successfully
```

### Watch Mode Development

**Language Package** (auto-rebuild on file change):
```bash
# Terminal 1: Watch TypeScript compilation
pnpm --filter @eligian/language run watch

# Terminal 2: Watch Langium grammar
pnpm run langium:watch

# Terminal 3: Watch tests
pnpm --filter @eligian/language test -- --watch
```

**Extension Development**:
```bash
# Terminal 1: Watch extension build
pnpm --filter @eligian/vscode-extension run watch

# Terminal 2: Launch VS Code Extension Host
# Press F5 in VS Code (or use "Run and Debug" panel)
```

**CLI Development**:
```bash
# Terminal 1: Watch CLI build
pnpm --filter @eligian/cli run build -- --watch

# Terminal 2: Test CLI manually
node packages/cli/dist/cli.mjs examples/simple-timeline.eligian
```

### Debugging

**Language Server** (in VS Code):
```bash
# 1. Open VS Code to project root
code .

# 2. Set breakpoints in language server code
# 3. Press F5 to launch Extension Development Host
# 4. Open .eligian file in Extension Host
# 5. Attach debugger to language server process
#    (VS Code → Run and Debug → "Attach to Language Server")
```

**Compiler** (Node.js debugger):
```bash
# 1. Set breakpoints in compiler code
# 2. Run with Node.js inspect flag
node --inspect-brk packages/cli/dist/cli.mjs examples/simple-timeline.eligian

# 3. Attach Chrome DevTools or VS Code debugger
# Chrome: Open chrome://inspect
# VS Code: Attach to Node process (port 9229)
```

**Tests** (Vitest UI):
```bash
# Launch Vitest UI (web-based test runner)
pnpm --filter @eligian/language test -- --ui

# Open browser to http://localhost:51204/__vitest__/
# Interactive test runner with debugging support
```

### Code Quality Workflow

**After Each Task** (Constitution Principle XI):
```bash
# 1. Complete code changes

# 2. Run Biome check with auto-fix
pnpm run check

# 3. If issues remain:
pnpm run lint  # Review remaining issues

# 4. Fix remaining issues (or update biome.json if false positives)

# 5. Verify clean
pnpm run check  # Should show "0 errors, 0 warnings"

# 6. Run tests to ensure no breakage
pnpm run test  # All tests must pass
```

**Biome Commands**:
```bash
pnpm run check   # Format + lint with auto-fix (use after each task)
pnpm run lint    # Lint only (check for issues without fixing)
pnpm run format  # Format code only (no linting)
pnpm run ci      # Check without modifying files (for CI/CD)
```

### Task Completion Checklist

Before considering any task complete:
- [ ] Code changes implemented
- [ ] `pnpm run build` passes (TypeScript compiles successfully)
- [ ] `pnpm run check` passes (0 errors, 0 warnings)
- [ ] `pnpm run test` passes (all tests green)
- [ ] Documentation updated (if applicable)
- [ ] Biome configuration updated (if rules needed adjustment)

---

## Dependency Management

### Package Manager

**CRITICAL**: This project uses **pnpm** as the package manager, NOT npm or yarn.

**Package Manager Version**: `pnpm@10.22.0` (enforced via `packageManager` field in root `package.json`)

**Why pnpm?**
- **Workspace support**: Excellent monorepo support with shared lockfile
- **Disk efficiency**: Hard links prevent duplicate dependencies
- **Strict resolution**: Prevents phantom dependencies
- **Performance**: Faster install/build times than npm/yarn

**Commands**:
```bash
# ✅ Correct: Use pnpm
pnpm install
pnpm run build
pnpm test

# ❌ Never use: npm or yarn
npm install   # Will cause workspace resolution failures!
yarn install  # Will cause dependency conflicts!
```

### Workspace Dependencies

**Workspace Protocol**: `workspace:*` (references local packages)

**Example** (from `@eligian/cli/package.json`):
```json
{
  "dependencies": {
    "@eligian/language": "workspace:*"
  }
}
```

**Resolution**: pnpm resolves `workspace:*` to the local package in `packages/language/` (no network request).

### Core Dependencies

**Root Workspace** (`package.json`):
```json
{
  "dependencies": {
    "effect": "3.19.3",     // Functional error handling
    "eligius": "1.5.0"      // Eligius library (for operation metadata)
  },
  "devDependencies": {
    "@biomejs/biome": "2.3.5",  // Code quality
    "typescript": "5.9.3",       // TypeScript compiler
    "vitest": "3.2.4",          // Test framework
    "esbuild": "0.27.0",        // Bundler
    "tsx": "4.20.6"             // TypeScript runner
  }
}
```

**Language Package** (`packages/language/package.json`):
```json
{
  "dependencies": {
    "langium": "4.0.3",           // Language framework
    "typir": "0.3.0",             // Type system framework
    "typir-langium": "0.3.0",     // Typir-Langium integration
    "postcss": "8.5.6",           // CSS parser
    "css-tree": "3.1.0"           // CSS AST utilities
  },
  "devDependencies": {
    "langium-cli": "4.0.0"        // Grammar compiler
  }
}
```

**CLI Package** (`packages/cli/package.json`):
```json
{
  "dependencies": {
    "commander": "11.1.0",  // CLI argument parser
    "chalk": "5.6.2"        // Terminal colors
  }
}
```

**Extension Package** (`packages/extension/package.json`):
```json
{
  "dependencies": {
    "vscode-languageclient": "9.0.1",  // LSP client
    "vscode-languageserver": "9.0.1",  // LSP server
    "jquery": "3.7.1",                 // Webview UI
    "video.js": "8.23.4",              // Video playback
    "lottie-web": "^5.13.0"            // Animation playback
  }
}
```

### Dependency Updates

**Check for Updates**:
```bash
pnpm outdated
```

**Update All Dependencies**:
```bash
pnpm update
```

**Update Specific Dependency**:
```bash
pnpm update langium --latest
```

**Update Workspace Dependencies**:
```bash
# Update all workspace dependencies to latest
pnpm update -r --latest
```

**Security Audits**:
```bash
pnpm audit
pnpm audit --fix  # Auto-fix security issues
```

### Adding Dependencies

**Add to Workspace Root**:
```bash
pnpm add <package>         # Add to dependencies
pnpm add -D <package>      # Add to devDependencies
```

**Add to Specific Package**:
```bash
pnpm --filter @eligian/language add <package>
pnpm --filter @eligian/cli add -D <package>
```

**Add Workspace Dependency**:
```bash
# Add local package as dependency
pnpm --filter @eligian/cli add @eligian/language@workspace:*
```

---

## Code Quality Tools

### Biome (v2.3.5)

**Purpose**: Unified code formatting and linting (replaces ESLint + Prettier)

**Configuration**: `biome.json` (root)

**Enabled Rules**:
- `recommended: true` - All recommended rules
- `noUnusedVariables: "warn"` - Warn about unused variables
- `noUnusedImports: "warn"` - Warn about unused imports
- `useConst: "warn"` - Suggest using const instead of let
- `useYield: "off"` - Disabled (Effect.gen patterns don't always yield)
- `noShadowRestrictedNames: "off"` - Disabled (our TypeError type name is intentional)
- `noExplicitAny: "off"` - Disabled (Langium generates some any types)
- `noNonNullAssertion: "off"` - Disabled (we use ! when we know better than TypeScript)
- `noParameterAssign: "off"` - Disabled (some patterns require parameter mutation)
- `noAccumulatingSpread: "off"` - Disabled (functional patterns use spread in loops)

**Formatting**:
- 2-space indentation
- 100 character line width
- Single quotes for strings
- Semicolons always
- ES5 trailing commas
- Arrow parentheses only when needed

**Excluded Files**:
- `**/out/**` - Build output
- `**/dist/**` - Distribution builds
- `**/generated/**` - Langium generated code
- `**/*.generated.ts` - Generated registry files
- `**/*.d.ts` - TypeScript declaration files

**Commands**:
```bash
pnpm run check   # Format + lint with auto-fix (REQUIRED after each task)
pnpm run lint    # Lint only (check for issues)
pnpm run format  # Format code only
pnpm run ci      # Check without modifying (for CI/CD)
```

**Integration**: Pre-commit checks should include `pnpm run check` to ensure code quality.

### TypeScript (v5.9.3)

**Configuration**: `tsconfig.build.json` (root), `tsconfig.json` (per package)

**Compiler Options** (strict mode):
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "strictBindCallApply": true,
  "strictPropertyInitialization": true,
  "noImplicitThis": true,
  "alwaysStrict": true
}
```

**Incremental Builds**: Enabled (`.tsbuildinfo` files cache compilation state)

**Type Checking**:
```bash
pnpm run typecheck  # Check all packages for type errors
```

**Watch Mode**:
```bash
pnpm run watch  # Auto-recompile on file change
```

### Vitest (v3.2.4)

**Configuration**: `vitest.config.ts` (per package)

**Coverage Provider**: v8 (built into Node.js)

**Coverage Thresholds**:
```json
{
  "statements": 80,
  "branches": 80,
  "functions": 80,
  "lines": 80
}
```

**Test Commands**:
```bash
pnpm test                  # Run all tests
pnpm run test:coverage     # Generate coverage report
pnpm run test:coverage:ci  # CI coverage (text output)
```

**Watch Mode**:
```bash
pnpm test -- --watch  # Auto-run tests on file change
pnpm test -- --ui     # Web-based test UI
```

---

## Summary

This technical overview provides a comprehensive reference for the Eligian codebase. Key takeaways:

1. **Monorepo Structure**: 5 packages with pnpm workspace management
2. **Three-Tool Build**: Langium CLI → TypeScript → esbuild
3. **Five-Stage Compiler**: Parse → Validate/Transform → Type Check → Optimize → Emit
4. **12 Functional Domains**: Grammar, compiler, LSP, operations, type system, CSS, assets, JSDoc, errors, Effect, utils, tests
5. **Three-Process Extension**: Extension Host ↔ Language Server ↔ Webview Preview
6. **Standalone CLI**: Command-line compiler with rich error formatting
7. **Comprehensive Testing**: 1,483 tests with 81.72% coverage
8. **Quality-First Development**: Biome + TypeScript strict mode + 80% coverage target

**For Further Reading**:
- `CLAUDE.md` - Project guidance and requirements
- `PROJECT_PROGRESS.md` - Current status and next steps
- `ELIGIUS_UNDERSTANDING.md` - Eligius library analysis
- `packages/language/src/type-system-typir/README.md` - Type system documentation
- `specs/*/spec.md` - Feature specifications
