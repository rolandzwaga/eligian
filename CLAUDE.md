# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This project develops a Langium-based domain-specific language (DSL) and compiler for the Eligius library. It provides a high-level, declarative syntax that streamlines writing and validating Eligius programs while maintaining full interoperability with the core library. The project also produces a VS Code extension that delivers integrated language support — including syntax highlighting, validation, autocompletion, and on-the-fly compilation — to make working with Eligius simpler, faster, and less error-prone. The compiler translates DSL code into an optimized Eligius-compatible configuration, enabling better developer productivity, readability, and maintainability across projects that rely on Eligius.

### Language Name and File Extension

**IMPORTANT**: The DSL language is called **"Eligian"** (derived from "Eligius") and uses the file extension **`.eligian`**.

- ✅ Correct: `my-timeline.eligian`, `presentation.eligian`, `*.eligian`
- ❌ Wrong: `.eli`, `.elg`, `.egl`, or any other abbreviation

This convention is established throughout the codebase:
- Grammar file: `eligian.langium`
- Test fixtures: `simple-timeline.eligian`, `video-annotation.eligian`
- VS Code extension: Registers `.eligian` file association
- CLI compiler: Processes `.eligian` source files

### Eligius library
[Eligius](https://github.com/rolandzwaga/eligius) is Javascript engine that allows arbitrary functionality to be triggered according to a given timeline provider. A timeline provider can be a video, an audio file, a request animation frame loop, etc. The engine can be the basis for video annotations, presentation software or interactive infographics, for example. Eligius is NOT a game or animation engine, instead, it is a Story Telling Engine.

Eligius is primarily driven by a JSON based configuration that contains all of the information needed to create and run a presentation. This JSON, however, is very verbose and quite unwieldy to have to write by hand.

**Example**: A simple timeline event in JSON might require 20+ lines, while the DSL version could be just 3-4 lines with clear, declarative syntax.

This is the exact reason why we want to create the DSL: we need a language that is easier to read and write so that creating Eligius presentations becomes less time consuming. Creating a VS Code extension for this DSL adds the benefit of code completion, compiler integration and all the other things that make programming easier in this IDE.

### DSL Design Goals

- **Concise syntax**: Reduce JSON verbosity by 70-80%
- **Type-safe**: Catch configuration errors at compile time
- **Timeline-first**: Syntax optimized for timeline-based thinking
- **Familiar**: Borrow conventions from existing languages (JS/TS where sensible)
- **Completable**: Full IDE support with autocompletion for Eligius APIs

## Development Commands
- `npm run build`: Compile TypeScript to JavaScript
- `npm run dev`: Run development extension
- `npm run test`: Run all tests (language package)
- `npm run clean`: Remove build artifacts

### Code Quality with Biome (REQUIRED)

**IMPORTANT**: All code changes MUST be formatted and linted with Biome after each task completion (Constitution Principle XI).

#### Biome Commands
- `npm run check`: Format and lint with auto-fix (run after each task)
- `npm run lint`: Lint only (check for issues without fixing)
- `npm run format`: Format code only (no linting)
- `npm run ci`: Check without modifying files (for CI/CD)

#### Workflow: After Each Task
```bash
# 1. Complete your code changes
# 2. Run Biome check with auto-fix
npm run check

# 3. If issues remain (errors shown):
npm run lint  # Review what issues remain

# 4. Fix remaining issues:
#    - If legitimate issues: fix the code
#    - If false positives: update biome.json with justification

# 5. Verify clean:
npm run check  # Should show "0 errors, 0 warnings"

# 6. Run tests to ensure no breakage:
npm run test  # All tests must pass
```

#### Biome Configuration (`biome.json`)

The project uses Biome v2.2.6+ with the following configuration:

**Enabled Rules**:
- `recommended: true` - All recommended rules enabled
- `noUnusedVariables: "warn"` - Warns about unused variables
- `noUnusedImports: "warn"` - Warns about unused imports
- `useConst: "warn"` - Suggests using const instead of let
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

**Excluded Files** (via `overrides`):
- `**/out/**` - Build output
- `**/dist/**` - Distribution builds
- `**/generated/**` - Langium generated code
- `**/*.generated.ts` - Generated registry files
- `**/*.d.ts` - TypeScript declaration files

#### When to Update `biome.json`

Only update Biome configuration when:
1. **False positives**: A rule flags valid code patterns we intentionally use
2. **New patterns**: Adopting new coding patterns that conflict with rules
3. **Generated code**: New generated files need exclusion

**Document all changes** with comments explaining the rationale.

#### Task Completion Checklist

Before considering any task complete:
- [ ] Code changes implemented
- [ ] `npm run check` passes (0 errors, 0 warnings)
- [ ] `npm run test` passes (all tests green)
- [ ] Documentation updated (if applicable)
- [ ] Biome configuration updated (if rules needed adjustment)

### Fixing TypeScript Errors: Critical Guidelines

**NEVER use sed with line numbers from TypeScript compiler errors.** TypeScript error line numbers indicate WHERE THE ERROR APPEARS, not where the fix should be applied. Using sed with these line numbers will corrupt files.

#### The Sed Corruption Incident (Post-Mortem)

**What happened:** Sed commands corrupted error-reporter.ts by blindly targeting line numbers from TypeScript errors, resulting in:
- Replaced JSDoc comments with code
- Replaced function parameters with object properties
- Created syntax errors requiring full file restoration

**Root causes:**
1. **Blind line number targeting**: Used TypeScript error line numbers directly in sed commands without verifying the actual file content
2. **No context verification**: Didn't read file content before applying changes
3. **Wrong tool for the job**: Sed is not suitable for complex TypeScript refactoring
4. **No validation**: Didn't verify results after changes

**Why this is dangerous:**
- TypeScript reports symptom locations, not fix locations
- Sed line numbers are fragile - any change invalidates all subsequent numbers
- Multiple sed commands in sequence compound errors exponentially

**CORRECT approach for fixing TypeScript errors:**

1. **Read the file first** - ALWAYS use Read tool to see actual code at error location
2. **Use Edit tool for TypeScript** - It requires reading first and uses string matching (not line numbers)
3. **Only use sed for mechanical changes** - Import organization, simple find/replace across whole file
4. **Never use sed with line numbers from errors** - Those indicate symptoms, not fixes
5. **Verify after each change** - Check that the fix actually resolves the error

**Examples:**

```bash
# ❌ NEVER DO THIS - Using error line numbers directly
sed -i '91s/.*/const hint = generateHint();/' file.ts  # Will corrupt random lines!

# ✅ DO THIS INSTEAD - Read first, then use Edit tool
# 1. Read the file to understand context
# 2. Use Edit tool with actual string matching
# 3. Verify the change worked
```

**When sed is acceptable:**
- Simple global replacements: `sed -i 's/oldImport/newImport/g'`
- Removing all occurrences: `sed -i '/pattern/d'`
- Adding to end of file: `echo "new line" >> file`

**When sed is FORBIDDEN:**
- Any use of line numbers from compiler errors
- Complex multi-line structural changes
- Changes requiring understanding of code context

## Architecture and Technical Requirements

### Programming Principles
- **Functional programming approach**: External immutability required, internal mutation allowed for performance
- **Language**: TypeScript with Node.js runtime
- **Build tools**: esbuild for compiling and bundling
- **Primary dependency**: Effect-ts for functional programming constructs in the compiler, Langium for VS Code extension

### Technology Rationale

**Why Langium?**
- Battle-tested framework for building language servers
- Excellent VS Code integration out of the box
- TypeScript-based (aligns with Eligius and our stack)
- Built-in support for validation, scoping, and code completion

**Why Effect-ts for Compiler?**
- Principled error handling (compilation can fail in many ways)
- Compositional pipeline design (parse → validate → transform → optimize)
- Type-safe effects management
- Aligns with functional programming constitution principle

**Why esbuild?**
- Fast bundling for VS Code extension
- TypeScript compilation without overhead
- Simple configuration

### Type System Migration

**Previous**: Custom type system in `packages/language/src/type-system/`
**Current**: Typir-based system in `packages/language/src/type-system-typir/`

The project migrated from a custom constraint-based type system to Typir (TypeFox's type system framework) for better inference, validation, and IDE integration.

**Migration Status**: Phase 3 Complete (User Story 1)
- ✅ Primitive types and operation validation
- ✅ Real-time type error detection in IDE
- ⏳ Action call validation (US4), type inference (US3), code completion (US2) pending

**Documentation**: See `packages/language/src/type-system-typir/README.md`

**Local Typir Reference**: The Typir library is cloned at `f:/projects/typir/` for documentation and API reference.

### Development Approach
- Always plan thoroughly before implementing code changes
- Minimize code changes to avoid unnecessary reverts
- Ask clarifying questions before implementation
- Use TodoWrite tool for complex multi-step tasks
- **Follow the project constitution**: All development must comply with `.specify/memory/constitution.md` principles

### Documentation Requirements
- **Comprehensive Understanding**: Always create detailed documentation of technical analysis and understanding for project continuity
- **Progress Tracking**: Maintain `PROJECT_PROGRESS.md` with current status, completed tasks, and next steps
- **Break/Resume Workflow**: Structure documentation to enable easy project resumption after breaks
- **Technical Context**: Document architectural decisions, implementation strategies, and design rationale

Key documentation files:
- `ELIGIUS_UNDERSTANDING.md`: Complete technical analysis of the Eligius library
- `../eligius/`: The Eligius library source repository (sibling directory)
  - **Overview**: Start with `../eligius/README.md` (global functionality overview)
  - **JSON Schema**: Start with `../eligius/jsonschema/eligius-configuration.json` (entry point for config structure)
  - **API Documentation**: Explore `../eligius/docs/` (API reference documentation)
- `PROJECT_PROGRESS.md`: Current status, next steps, and planning information
- `CLAUDE.md`: This file - project guidance and requirements

## Project Structure

```
packages/
├── language/                 # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium          # DSL grammar definition
│   │   ├── eligian-validator.ts     # Semantic validation rules
│   │   ├── eligian-scope.ts         # Name resolution and scoping
│   │   └── __tests__/               # Language package tests
│   │       ├── parsing.spec.ts      # Grammar and parsing tests
│   │       └── validation.spec.ts   # Semantic validation tests
│   └── package.json
│
├── compiler/                 # DSL → Eligius JSON compiler (Effect-based)
│   ├── src/
│   │   ├── pipeline.ts              # Main compilation pipeline
│   │   ├── ast-transformer.ts       # AST to Eligius config transformation
│   │   ├── optimizer.ts             # Config optimization passes
│   │   ├── type-checker.ts          # Type checking and validation
│   │   ├── error-reporter.ts        # Compilation error handling
│   │   ├── effects/                 # Effect services and layers
│   │   │   ├── FileSystem.ts        # File I/O effects
│   │   │   ├── Compiler.ts          # Compilation effects
│   │   │   └── Logger.ts            # Logging effects
│   │   └── __tests__/               # Compiler package tests
│   │       ├── pipeline.spec.ts     # Full pipeline tests
│   │       ├── transformer.spec.ts  # AST transformation tests
│   │       ├── optimizer.spec.ts    # Optimization tests
│   │       └── __fixtures__/        # Test fixtures and snapshots
│   │           ├── valid/           # Valid DSL programs
│   │           ├── invalid/         # Invalid DSL programs
│   │           └── snapshots/       # Expected JSON outputs
│   └── package.json
│
├── cli/                      # Command-line compiler
│   ├── src/
│   │   ├── main.ts
│   │   └── __tests__/               # CLI tests
│   │       └── cli.spec.ts
│   └── package.json
│
└── extension/                # VS Code extension
    ├── src/
    │   ├── extension/
    │   │   └── main.ts              # Extension entry point
    │   └── language/
    │       └── main.ts              # Language server entry point
    └── package.json

.specify/
├── memory/
│   └── constitution.md       # Project constitution (READ THIS!)
└── templates/                # Feature planning templates
```

## Loop Control: Break and Continue

The Eligian DSL provides clean syntactic sugar for loop control operations using familiar `break` and `continue` keywords, similar to existing sugar for `if/else` and `for` loops.

### Overview

These keywords compile to the underlying Eligius `breakForEach` and `continueForEach` operations, providing cleaner syntax while maintaining full compatibility with existing code.

### Syntax

**Break Statement** (exit loop immediately):
```eligian
for (item in items) {
  if (@@currentItem.stop) {
    break  // Exit the loop
  }
  processItem(@@currentItem)
}
```

**Continue Statement** (skip to next iteration):
```eligian
for (item in items) {
  if (@@currentItem.skip) {
    continue  // Skip this iteration
  }
  processItem(@@currentItem)
}
```

### Validation

- `break` and `continue` can **only** be used inside `for` loops
- Using them outside a loop produces a **compile error**:
  ```eligian
  action invalid [
    break  // ❌ ERROR: 'break' can only be used inside a loop
  ]
  ```

### Backwards Compatibility

Both new keywords and old operation calls work together:
```eligian
for (item in items) {
  // New syntax
  if (condition1) {
    continue
  }

  // Old syntax (still works)
  if (condition2) {
    continueForEach()
  }

  // Both can coexist
  if (condition3) {
    break
  }
  if (condition4) {
    breakForEach()
  }
}
```

### Documentation

- **Example File**: `examples/break-continue-demo.eligian` - Comprehensive usage examples
- **Feature Spec**: `specs/main/spec.md` - Complete specification
- **Implementation Plan**: `specs/main/plan.md` - Technical implementation details

### Implementation

- **Grammar**: Added `BreakStatement` and `ContinueStatement` to `eligian.langium`
- **Transformer**: Maps to `breakForEach`/`continueForEach` operations in `ast-transformer.ts`
- **Validation**: Loop context checking in `eligian-validator.ts`
- **Tests**:
  - 3 parsing tests in `parsing.spec.ts`
  - 3 transformer tests in `transformer.spec.ts`
  - 6 validation tests in `validation.spec.ts`

## Type System (Phase 18)

The Eligian DSL includes an **optional** static type checking system inspired by TypeScript. This system catches type errors at compile time without affecting runtime behavior.

### Overview

The type system provides three key features:

1. **Type Annotations (US1)**: Explicit type hints for parameter self-documentation
2. **Type Checking (US2)**: Catch type mismatches before running timelines
3. **Type Inference (US3)**: Automatically infer types from operation usage

### Quick Examples

**Type Annotations**:
```eligian
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**Type Inference** (no annotations needed):
```eligian
action fadeIn(selector, duration) [
  selectElement(selector)         // selector inferred as 'string'
  animate({opacity: 1}, duration) // duration inferred as 'number'
]
```

**Type Error Detection**:
```eligian
action bad(selector: number) [
  selectElement(selector)  // ❌ Compile error: selector is number, selectElement expects string
]
```

### Key Design Decisions

1. **Opt-In**: Type checking is completely optional. Untyped code works exactly as before.
2. **Backwards Compatible**: All existing DSL code continues to work (100% compatibility maintained).
3. **Compile-Time Only**: Type annotations are stripped during compilation - zero runtime overhead.
4. **Unknown Type**: Parameters without annotations or usage remain `'unknown'` (opt-out of type checking).

### Supported Types

- `string` - String literals, selectors, CSS values
- `number` - Numeric values (durations, offsets, coordinates)
- `boolean` - Boolean values
- `object` - Object literals
- `array` - Array literals
- `unknown` - Opt-out of type checking (implicit for unused parameters)

### Architecture

**Location**: `packages/language/src/type-system/`

**Core Modules**:
- `types.ts` - Type definitions (EligianType, TypeConstraint, TypeError)
- `inference.ts` - Type inference engine (constraint collection, unification)
- `validator.ts` - Type compatibility checking
- `index.ts` - Public API

**Integration**: Type checking is integrated into `eligian-validator.ts` at the action validation level.

### How Type Inference Works

1. **Constraint Collection**: Walk through action operations, collect type requirements from operation calls
2. **Constraint Unification**: Combine requirements - if all agree → use that type, if conflict → error
3. **Type Environment**: Track variable types through operation sequences (handles if/else, for loops)
4. **Precedence**: Explicit annotations take precedence over inferred types

**Example**:
```eligian
action fadeIn(selector, duration) [  // No annotations
  selectElement(selector)         // Constraint: selector must be 'string'
  animate({opacity: 1}, duration) // Constraint: duration must be 'number'
]
// Result: selector='string', duration='number' (inferred)
```

### Documentation

- **Type System README**: `packages/language/src/type-system/README.md`
- **Example Files**:
  - `examples/type-annotation-test.eligian` - Type annotation syntax
  - `examples/type-error-demo.eligian` - Type error demonstration
  - `examples/type-inference-demo.eligian` - Type inference examples

### Testing

- **298 tests** passing (25 type system tests)
- **Integration tests**: `src/__tests__/type-system.spec.ts`
- **Validation tests**: `src/__tests__/validation.spec.ts`

## Testing Strategy

Following constitution principle **II. Comprehensive Testing**:

### Test Organization
- **Location**: All tests live in `__tests__/` subdirectories alongside the code they test
- **Naming**: Test files use `.spec.ts` extension (e.g., `pipeline.spec.ts`)
- **Fixtures**: Test data and snapshots in `__fixtures__/` subdirectories within `__tests__/`

### Unit Tests
- **Grammar tests** (`packages/language/src/__tests__/parsing.spec.ts`): Verify parsing of DSL constructs using Langium test utilities
- **Validator tests** (`packages/language/src/__tests__/validation.spec.ts`): Test semantic validation rules in isolation
- **Compiler tests** (`packages/compiler/src/__tests__/*.spec.ts`): Test AST transformation logic, optimizations, and type checking

### Integration Tests
- **End-to-end compilation** (`packages/compiler/src/__tests__/pipeline.spec.ts`): Full DSL source → JSON output validation
- **Round-trip tests**: Compile DSL → JSON, verify JSON matches expected Eligius format
- **CLI tests** (`packages/cli/src/__tests__/cli.spec.ts`): Test command-line interface and file I/O

### Test Fixtures
- Maintain example DSL programs in `packages/compiler/src/__tests__/__fixtures__/`
- Organize fixtures by category:
  - `valid/` - Correct DSL programs for successful compilation tests
  - `invalid/` - Malformed DSL for error handling tests
  - `snapshots/` - Expected JSON outputs for snapshot testing
- Cover common Eligius patterns (video annotations, presentations, infographics)
- Include edge cases and error scenarios

## Compiler Architecture

The compiler is built using **Effect-ts** to provide principled error handling, composable pipelines, and type-safe side effect management. The compiler transforms Langium AST into Eligius JSON configuration through a multi-stage pipeline.

### Compilation Pipeline

The compiler follows a functional pipeline approach using Effect:

```typescript
// Conceptual pipeline structure
const compile = (source: string) =>
  pipe(
    parseSource(source),           // Langium parser → AST
    Effect.flatMap(validateAST),   // Semantic validation
    Effect.flatMap(typeCheck),     // Type checking
    Effect.flatMap(transformAST),  // AST → Eligius IR
    Effect.flatMap(optimize),      // Optimization passes
    Effect.flatMap(emitJSON)       // IR → JSON output
  )
```

**Pipeline Stages**:

1. **Parse**: Langium parses DSL source → AST
2. **Validate**: Semantic validation (scoping, name resolution)
3. **Type Check**: Verify Eligius type constraints
4. **Transform**: Convert AST to Eligius intermediate representation (IR)
5. **Optimize**: Apply optimization passes (dead code elimination, constant folding)
6. **Emit**: Generate final Eligius JSON configuration

### Effect-ts Usage Patterns

**Error Handling**:
```typescript
// All compilation stages return Effect with typed errors
type CompileError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError

const transformAST: (ast: AST) => Effect.Effect<
  EligiusIR,           // Success type
  TransformError,      // Error type
  CompilerContext      // Required context/dependencies
>
```

**Compositional Services**:
```typescript
// Define Effect services for compilation concerns
class FileSystemService extends Context.Tag("FileSystem")<
  FileSystemService,
  {
    readonly readFile: (path: string) => Effect.Effect<string, IOError>
    readonly writeFile: (path: string, content: string) => Effect.Effect<void, IOError>
  }
>() {}

class CompilerService extends Context.Tag("Compiler")<
  CompilerService,
  {
    readonly compile: (source: string) => Effect.Effect<EligiusConfig, CompileError>
    readonly optimize: (ir: EligiusIR) => Effect.Effect<EligiusIR, never>
  }
>() {}

class LoggerService extends Context.Tag("Logger")<
  LoggerService,
  {
    readonly info: (msg: string) => Effect.Effect<void>
    readonly error: (msg: string) => Effect.Effect<void>
    readonly debug: (msg: string) => Effect.Effect<void>
  }
>() {}
```

**Layer Composition**:
```typescript
// Build runtime with all required services
const CompilerLive = Layer.effect(
  CompilerService,
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystemService)
    const logger = yield* _(LoggerService)

    return {
      compile: (source) => /* implementation */,
      optimize: (ir) => /* implementation */
    }
  })
)

// Compose layers for full runtime
const MainLayer = Layer.mergeAll(
  FileSystemLive,
  LoggerLive,
  CompilerLive
)
```

**Internal Mutation for Performance**:
Per constitution principle VI, internal mutation is allowed for performance:

```typescript
// External API: immutable
export const optimize = (ir: EligiusIR): Effect.Effect<EligiusIR, never> =>
  Effect.sync(() => {
    // Internal: mutable for performance (building new IR)
    const optimized = { ...ir }
    const events = []

    // Mutate internal arrays for performance
    for (const event of ir.events) {
      if (!isDeadCode(event)) {
        events.push(optimizeEvent(event))
      }
    }

    optimized.events = events
    return optimized  // Return new immutable reference
  })
```

### Compiler Components

**AST Transformer** (`compiler/ast-transformer.ts`):
- Converts Langium AST nodes to Eligius IR
- Handles DSL constructs → JSON mapping
- Preserves source location for error reporting
- Returns `Effect<EligiusIR, TransformError>`

**Type Checker** (`compiler/type-checker.ts`):
- Validates Eligius-specific type constraints
- Checks timeline consistency (start/end times)
- Verifies provider configurations
- Returns `Effect<TypedAST, TypeError>`

**Optimizer** (`compiler/optimizer.ts`):
- Dead code elimination (unreachable events)
- Constant folding (compile-time evaluation)
- Timeline optimization (merge adjacent events)
- Returns `Effect<EligiusIR, never>` (optimizations cannot fail)

**Error Reporter** (`compiler/error-reporter.ts`):
- Formats compilation errors for display
- Includes source location and helpful messages
- Integrates with VS Code diagnostics
- Returns formatted error messages for CLI/extension

**Pipeline** (`compiler/pipeline.ts`):
- Orchestrates all compilation stages
- Composes Effects into complete pipeline
- Handles error accumulation and reporting
- Provides main `compile` function

### CLI Integration

The CLI (`cli/index.ts`) uses Effect runtime to execute compilation:

```typescript
import { Effect, Layer } from "effect"
import { compile } from "./compiler/pipeline"
import { MainLayer } from "./compiler/effects"

// CLI entry point
const program = Effect.gen(function* (_) {
  const args = yield* _(parseCliArgs)
  const source = yield* _(FileSystemService.readFile(args.input))
  const config = yield* _(compile(source))
  yield* _(FileSystemService.writeFile(args.output, JSON.stringify(config, null, 2)))
  yield* _(LoggerService.info(`Compiled ${args.input} → ${args.output}`))
})

// Run with runtime
const runtime = Layer.toRuntime(MainLayer)
Effect.runPromise(runtime.pipe(Effect.flatMap(() => program)))
  .catch(console.error)
```

### VS Code Extension Integration

The extension can invoke the compiler for on-the-fly compilation:

```typescript
// Extension integrates with compiler via Effect
import { compile } from "./compiler/pipeline"
import { testLayer } from "./compiler/effects"

// Compile current document
const compileDocument = (document: TextDocument) =>
  Effect.runPromise(
    compile(document.getText()).pipe(
      Effect.provide(testLayer),  // Provide services
      Effect.tapError((error) =>
        // Show errors in Problems panel
        showDiagnostics(document.uri, formatErrors(error))
      )
    )
  )
```

### Compiler Testing Strategy

**Unit Tests** (`packages/compiler/src/__tests__/*.spec.ts`):
- Test each pipeline stage independently
- Mock Effect services for isolation
- Verify error handling at each stage
- Examples:
  - `transformer.spec.ts` - AST transformation tests
  - `optimizer.spec.ts` - Optimization pass tests
  - `type-checker.spec.ts` - Type checking tests

**Integration Tests** (`packages/compiler/src/__tests__/pipeline.spec.ts`):
- Full DSL → JSON compilation
- Snapshot testing for expected outputs (in `__fixtures__/snapshots/`)
- Round-trip validation (JSON matches Eligius requirements)

**Property-Based Tests** (optional, for optimization passes):
- Verify optimizations preserve semantics
- Test that optimized JSON produces same runtime behavior

### Compiler Design Principles

Following the project constitution, the compiler must adhere to these principles:

**1. Simplicity First** (Constitution I):
- Keep transformation logic straightforward and well-documented
- Avoid premature optimization - make it work, then make it fast
- Document complex transformations with "why" not just "what"
- Prefer explicit transformations over clever abstractions

**2. Comprehensive Testing** (Constitution II):
- Every transformation function must have unit tests
- Full pipeline must have integration tests with snapshots
- Test both success and error paths
- Use Effect test utilities for mocking services

**3. Type Safety with Effect**:
- All side effects captured in Effect types
- Explicit error types at each pipeline stage
- No throwing exceptions - use Effect.fail for errors
- Use Effect.gen for readable async composition

**4. Error Messages**:
- Include source location (line, column) in all errors
- Provide actionable suggestions for fixes
- Use clear, jargon-free language
- Show relevant code snippet when possible

**5. Performance Considerations**:
- External API: immutable (Effect types, pure functions)
- Internal implementation: mutable structures allowed (document why)
- Profile before optimizing (no premature optimization)
- Use Effect.cached for expensive computations that repeat

### Compiler Development Guidelines

**Effect Service Design**:
```typescript
// ✅ Good: Services are pure interfaces
class CompilerService extends Context.Tag("Compiler")<
  CompilerService,
  {
    readonly compile: (source: string) => Effect.Effect<Config, CompileError>
  }
>() {}

// ❌ Bad: Services with side effects hidden
class CompilerService {
  compile(source: string): Config {  // Throws! Side effects hidden!
    // ...
  }
}
```

**Error Handling**:
```typescript
// ✅ Good: Tagged unions for typed errors
type TransformError =
  | { _tag: "UnknownNode"; node: ASTNode; location: SourceLocation }
  | { _tag: "InvalidTimeline"; message: string; location: SourceLocation }

const transform = (node: ASTNode): Effect.Effect<IR, TransformError> =>
  match(node)
    .with({ type: "Timeline" }, transformTimeline)
    .otherwise(() => Effect.fail({
      _tag: "UnknownNode",
      node,
      location: node.location
    }))

// ❌ Bad: Generic errors without context
const transform = (node: ASTNode): Effect.Effect<IR, Error> =>
  Effect.fail(new Error("Unknown node"))  // Lost type info!
```

**Testing Effect Pipelines**:
```typescript
// ✅ Good: Mock services for unit tests
const mockFS = Layer.succeed(FileSystemService, {
  readFile: (path) => Effect.succeed("test content"),
  writeFile: (path, content) => Effect.succeed(undefined)
})

const mockLogger = Layer.succeed(LoggerService, {
  info: (_) => Effect.succeed(undefined),
  error: (_) => Effect.succeed(undefined),
  debug: (_) => Effect.succeed(undefined)
})

const testLayer = Layer.mergeAll(mockFS, mockLogger, CompilerLive)

// Test with mocked dependencies
test("compile valid DSL", async () => {
  const result = await Effect.runPromise(
    compile("valid DSL source").pipe(Effect.provide(testLayer))
  )
  expect(result).toMatchSnapshot()
})
```

## Development Workflow

### Phase 1: Understanding (Current)
1. Analyze Eligius JSON config format and API
2. Document findings in `ELIGIUS_UNDERSTANDING.md`
3. Identify common patterns and pain points
4. Design initial DSL syntax examples

### Phase 2: Grammar Development
1. Define Langium grammar for core DSL constructs
2. Implement parser and basic AST
3. Test parsing with fixture files
4. Iterate on syntax based on ergonomics

### Phase 3: Semantic Layer
1. Implement validation rules
2. Add name resolution and scoping
3. Build type checking for Eligius constructs
4. Test validation with valid/invalid DSL programs

### Phase 4: Compiler (Effect-based Pipeline)
1. Setup Effect services (FileSystem, Logger, Compiler)
2. Implement compilation pipeline orchestration
3. Build AST → Eligius IR transformer with Effect error handling
4. Add type checker with Eligius constraint validation
5. Implement optimization passes (dead code, constant folding, timeline merge)
6. Create error reporter with source location mapping
7. Test each pipeline stage with mocked Effect services (unit tests)
8. Test full pipeline with real DSL fixtures (integration tests)
9. Validate output JSON against Eligius runtime requirements

### Phase 5: CLI Compiler
1. Build CLI argument parser
2. Integrate compiler pipeline with Effect runtime
3. Add file I/O via FileSystem service
4. Implement error formatting for terminal output
5. Add watch mode for development (optional)
6. Test CLI with various DSL inputs

### Phase 6: VS Code Extension
1. Configure language server integration
2. Add syntax highlighting
3. Implement autocompletion providers
4. Package and test extension

## Available MCP Resources
- effect-docs: Documentation and examples for Effect-ts usage
- ide: VS Code integration for diagnostics and code execution
- Always use context7 when I need code generation, setup or configuration steps, orlibrary/API documentation. This means you should automatically use the Context7 MCP tools to resolve library id and get library docs without me having to explicitly ask.
