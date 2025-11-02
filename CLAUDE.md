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

## Package Manager

**CRITICAL**: This project uses **pnpm** as the package manager, NOT npm or yarn.

- ✅ Use: `pnpm install`, `pnpm run build`, `pnpm test`
- ❌ Never use: `npm install`, `yarn install`, etc.

**Rationale**: The project is configured with `"packageManager": "pnpm@10.19.0"` in package.json. All scripts use pnpm workspace commands (`pnpm -r`, `pnpm --filter`). Using npm or yarn will cause workspace resolution failures and dependency conflicts.

## Development Commands
- `pnpm run build`: Compile TypeScript to JavaScript
- `pnpm run dev`: Run development extension
- `pnpm run test`: Run all tests (language package)
- `pnpm run clean`: Remove build artifacts

**Note**: While `npm run <script>` will work for running scripts (npm delegates to the configured package manager), always use `pnpm install` for dependency management and `pnpm` commands for workspace operations.

### Code Quality with Biome (REQUIRED)

**IMPORTANT**: All code changes MUST be formatted and linted with Biome after each task completion (Constitution Principle XI).

#### Biome Commands
- `pnpm run check`: Format and lint with auto-fix (run after each task)
- `pnpm run lint`: Lint only (check for issues without fixing)
- `pnpm run format`: Format code only (no linting)
- `pnpm run ci`: Check without modifying files (for CI/CD)

#### Workflow: After Each Task
```bash
# 1. Complete your code changes
# 2. Run Biome check with auto-fix
pnpm run check

# 3. If issues remain (errors shown):
pnpm run lint  # Review what issues remain

# 4. Fix remaining issues:
#    - If legitimate issues: fix the code
#    - If false positives: update biome.json with justification

# 5. Verify clean:
pnpm run check  # Should show "0 errors, 0 warnings"

# 6. Run tests to ensure no breakage:
pnpm run test  # All tests must pass
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
- [ ] `pnpm run build` passes (TypeScript compiles successfully)
- [ ] `pnpm run check` passes (0 errors, 0 warnings)
- [ ] `pnpm run test` passes (all tests green)
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

### Type System (Typir Integration)

**Implementation**: Typir-based system in `packages/language/src/type-system-typir/`
**Framework**: [Typir](https://github.com/TypeFox/typir) + [Typir-Langium](https://github.com/TypeFox/typir-langium)

The Eligian DSL uses Typir (TypeFox's type system framework) for type inference, validation, and IDE support (hover, diagnostics).

**Implementation Status**: Feature 021 Complete (Phase 7 - All 5 User Stories)
- ✅ **US1**: Import statement type checking (`Import<css>` hover, duplicate validation, type mismatch warnings)
- ✅ **US2**: Reserved keyword validation for constants (13 keywords: 'if', 'else', 'for', 'in', 'break', 'continue', etc.)
- ✅ **US3**: Timeline event validation (`TimedEvent: 0s → 5s` hover, time range validation, duration/delay checks)
- ✅ **US4**: Control flow type checking (boolean conditions, array collections, empty branch warnings)
- ✅ **US5**: Timeline configuration validation (provider-source consistency, CSS selector syntax, empty timeline warnings)

**Architecture**:
```
type-system-typir/
├── types/          # Custom type factories (ImportType, TimelineEventType, TimelineType)
├── inference/      # Type inference rules per construct
├── validation/     # Validation rules per construct
└── utils/          # Shared utilities (time parsing, asset type inference)
```

**Test Coverage**: 1462 tests passing (1323+ existing + 139 new), 81.72% overall coverage

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

## CSS Loading with Live Reload (Features 010-011)

The Eligian DSL supports importing CSS files that are automatically loaded into the preview with hot-reload capabilities. This enables visual styling of Eligius presentations without restarting the timeline engine.

### Syntax (Feature 010 - Asset Loading)

**CSS Import**:
```eligian
// Import single CSS file
styles "./styles/main.css"

// Import multiple CSS files (loaded in order)
styles "./styles/base.css"
styles "./styles/theme.css"
styles "./styles/animations.css"
```

**Compilation**: CSS imports are extracted by the compiler and added to the Eligius configuration's `cssFiles` array.

### Preview Integration (Feature 011)

The VS Code extension preview automatically:
1. **Loads CSS files** when the preview opens
2. **Hot-reloads CSS** when files change (preserves timeline state)
3. **Handles errors gracefully** (file not found, permission denied, etc.)

### Architecture

**Core Modules** (`packages/extension/src/extension/`):

1. **[css-loader.ts](packages/extension/src/extension/css-loader.ts)** - Pure utility functions
   - `generateCSSId()` - Generate stable IDs from file paths (SHA-256 hash)
   - `convertToWebviewUri()` - Convert file paths to webview URIs
   - `rewriteCSSUrls()` - Rewrite CSS `url()` paths for webview compatibility
   - `loadCSSFile()` - Load CSS content with typed error handling
   - `extractCSSFiles()` - Extract CSS file paths from Eligius config

2. **[webview-css-injector.ts](packages/extension/src/extension/webview-css-injector.ts)** - CSS lifecycle management
   - `injectCSS()` - Initial CSS load when preview opens
   - `reloadCSS()` - Hot-reload single CSS file (preserves engine state)
   - `showCSSError()` - Display error notifications with rate limiting
   - Error tracking: tracks failed files, rate limits notifications (max 3/min/file)

3. **[css-watcher.ts](packages/extension/src/extension/css-watcher.ts)** - File watching for hot-reload
   - `CSSWatcherManager` - Watches CSS files for changes
   - Single `FileSystemWatcher` for all CSS files (efficient)
   - Per-file debouncing (300ms) to handle auto-save
   - Independent timers for each file (parallel editing support)

4. **[preview.ts](packages/extension/media/preview.ts)** - Webview message handlers
   - `css-load` - Inject `<style>` tags with `data-css-id` attributes
   - `css-reload` - Update existing `<style>` tag content (hot-reload)
   - `css-remove` - Remove `<style>` tags from DOM
   - `css-error` - Log errors, retain previous CSS

### How It Works

**Initial Load**:
1. User opens `.eligian` file with `styles` imports
2. Compiler extracts CSS file paths → `config.cssFiles[]`
3. PreviewPanel creates `WebviewCSSInjector` with workspace root
4. After Eligius engine initializes, CSS files are loaded
5. CSS `url()` paths are rewritten to webview URIs
6. `css-load` messages sent to webview with content
7. Webview creates `<style data-css-id="...">` tags in `<head>`
8. `CSSWatcherManager` starts watching CSS files

**Hot-Reload**:
1. Developer edits CSS file, saves
2. FileSystemWatcher detects change
3. 300ms debounce timer starts (per-file)
4. Timer completes → `handleCSSFileChange()` called
5. CSS file reloaded, URLs rewritten
6. `css-reload` message sent to webview
7. Webview updates `<style>` tag's `textContent`
8. **Timeline continues playing** (no engine restart)

**Error Handling**:
- **Typed Errors**: `FileNotFoundError`, `PermissionError`, `ReadError`
- **Rate Limiting**: Max 3 notifications per minute per file (prevents spam)
- **Graceful Degradation**: Preview remains functional with previous valid CSS
- **VS Code Notifications**: Clear error messages with "Open File" action

### Content Security Policy

The preview HTML template includes CSP directives for CSS:
- `style-src 'unsafe-inline'` - Required for inline `<style>` tags
- `img-src ${cspSource} https: data:` - Required for images in CSS
- `font-src ${cspSource}` - Required for fonts in CSS

**Security Note**: Using `textContent` (NOT `innerHTML`) when injecting CSS prevents XSS vulnerabilities.

### URL Rewriting for Webview

CSS `url()` paths are rewritten to webview URIs because inline `<style>` tags have no file context:

```css
/* Original CSS */
.bg { background: url('./image.png'); }

/* Rewritten for webview */
.bg { background: url('vscode-webview://authority/path/to/workspace/image.png'); }
```

This ensures images, fonts, and other assets load correctly in the webview context.

### Performance Characteristics

- **Initial Load**: CSS loads in <500ms (per success criteria)
- **Hot-Reload**: CSS reloads in <300ms (per success criteria)
- **Debouncing**: 300ms per-file delay handles auto-save scenarios
- **Max Files**: Supports up to 10 CSS files efficiently
- **Memory**: Single FileSystemWatcher for all CSS files (efficient)

### Example

```eligian
// styles/main.css - Base styles
styles "./styles/main.css"

// styles/animations.css - Animation styles with images
styles "./styles/animations.css"

timeline "My Presentation" at 0s {
  at 0s..5s selectElement("#intro") {
    animate({opacity: 1}, 1000)
  }
}
```

When you save changes to `styles/main.css` or `styles/animations.css`, the preview automatically reloads the CSS without restarting the timeline.

### Implementation Status

- ✅ **Feature 010** (Asset Loading & Validation): Complete
  - CSS import syntax (`styles "./file.css"`)
  - Compiler extracts CSS paths → `config.cssFiles[]`
- ✅ **Feature 011** (Preview CSS Support with Live Reload): Complete
  - User Story 1: Apply Imported CSS in Preview (MVP)
  - User Story 2: Live Reload CSS on File Change
  - User Story 3: Handle CSS File Errors Gracefully

### Documentation

- **Feature Spec**: `specs/011-preview-css-support/spec.md`
- **Implementation Plan**: `specs/011-preview-css-support/plan.md`
- **Tasks**: `specs/011-preview-css-support/tasks.md` (22 tasks completed)
- **Quickstart Guide**: `specs/011-preview-css-support/quickstart.md`

## Unified Action and Operation Call Syntax (Feature 006)

Custom actions and built-in operations use **identical calling syntax** throughout the DSL. The compiler automatically distinguishes between them based on name resolution.

### Syntax

**Old Syntax (REMOVED)**:
```eligian
at 0s..5s { fadeIn("#box") }  // ❌ No longer valid
```

**New Unified Syntax**:
```eligian
at 0s..5s fadeIn("#box")     // ✅ Custom action call
at 0s..5s selectElement("#box")  // ✅ Built-in operation call - identical syntax
```

### Key Features

1. **Unified Syntax**: Actions and operations called identically in all contexts:
   - Timeline events: `at 0s..5s fadeIn()`
   - Control flow: `for (item in items) { fadeIn(@@item) }`
   - Sequence blocks: `fadeIn() for 2s`
   - Stagger blocks: `stagger 200ms items with fadeIn() for 1s`

2. **Name Collision Prevention**: Action names cannot conflict with built-in operation names
   ```eligian
   action selectElement() [...]  // ❌ ERROR: name conflicts with built-in operation
   ```

3. **Automatic Resolution**: Compiler checks if name is an action first, then falls back to operations
   - If action: expands to `requestAction` + `startAction` operations
   - If operation: generates operation call directly
   - If neither: error with suggestions from both

### Implementation

**Name Resolution** ([name-resolver.ts](packages/language/src/compiler/name-resolver.ts)):
- `buildNameRegistry()` - Tracks all action and operation names
- `findActionByName()` - Looks up action definitions
- `suggestSimilarActions()` - Provides suggestions for typos

**Validation** ([eligian-validator.ts](packages/language/src/eligian-validator.ts)):
- `checkActionNameCollision()` - Prevents action names conflicting with operations
- `checkDuplicateActions()` - Prevents duplicate action definitions
- `checkTimelineOperationCall()` - Validates calls in timeline context

**Transformation** ([ast-transformer.ts](packages/language/src/compiler/ast-transformer.ts:1363-1409)):
- `transformOperationStatement()` - Expands action calls to requestAction/startAction
- Works in all contexts: timeline events, control flow, sequences, staggers

### Example

See [examples/unified-action-syntax.eligian](examples/unified-action-syntax.eligian) for comprehensive demonstration.

## CSS Class and Selector Validation (Feature 013)

The Eligian DSL provides real-time validation of CSS class names and selectors used in operation calls, catching typos and undefined references at compile time rather than runtime.

### Overview

This feature validates that:
1. **className parameters** reference valid CSS classes from imported CSS files
2. **selector parameters** contain only valid CSS classes and IDs
3. **CSS files** are syntactically valid and can be parsed
4. **Validation updates** automatically when CSS files change (hot-reload)

### Quick Example

```eligian
// Import CSS file
styles "./styles.css"

timeline "Demo" at 0s {
  at 0s selectElement("#header") {
    // ✅ Valid if .button exists in styles.css
    addClass("button")

    // ❌ Error: Unknown CSS class: 'buttom' (Did you mean: 'button'?)
    addClass("buttom")

    // ✅ Valid if both .button and .primary exist
    selectElement(".button.primary")

    // ❌ Error: Unknown CSS class in selector: 'buton'
    selectElement(".buton")
  }
}
```

### Architecture

**Location**: `packages/language/src/css/` and `packages/language/src/eligian-validator.ts`

**Core Components**:

1. **[css-parser.ts](packages/language/src/css/css-parser.ts)** - PostCSS-based parser
   - Extracts classes, IDs, locations, and rules from CSS files
   - Captures syntax errors with line/column information
   - Returns `CSSParseResult` with metadata and errors

2. **[css-registry.ts](packages/language/src/css/css-registry.ts)** - Centralized registry
   - Tracks CSS file metadata (classes, IDs, locations, rules, errors)
   - Maintains document → CSS imports mapping
   - Provides query methods for validation

3. **[selector-parser.ts](packages/language/src/css/selector-parser.ts)** - Selector parsing
   - Extracts individual classes and IDs from complex selectors
   - Handles combinators (>, +, ~), pseudo-classes (:hover), attribute selectors

4. **[levenshtein.ts](packages/language/src/css/levenshtein.ts)** - "Did you mean?" suggestions
   - Computes edit distance between class names
   - Provides intelligent suggestions for typos (threshold: distance ≤ 2)

5. **[css-notifications.ts](packages/language/src/lsp/css-notifications.ts)** - LSP notifications
   - `CSS_UPDATED_NOTIFICATION` - CSS file changed, re-validate documents
   - `CSS_ERROR_NOTIFICATION` - CSS file has errors
   - `CSS_IMPORTS_DISCOVERED_NOTIFICATION` - Document imports discovered

### Validation Rules

**className Parameter Validation** (User Story 1):
- Validates `addClass()`, `removeClass()`, `toggleClass()`, `hasClass()` operations
- Error code: `'unknown_css_class'`
- Provides "Did you mean?" suggestions using Levenshtein distance
- Example: `addClass("buttom")` → "Unknown CSS class: 'buttom' (Did you mean: 'button'?)"

**selector Parameter Validation** (User Story 2):
- Validates `selectElement()`, `selectAll()` operations
- Parses complex selectors: `.button.primary`, `#header.nav`, `.parent > .child`
- Validates each class/ID component independently
- Ignores pseudo-classes, pseudo-elements, combinators, attribute selectors
- Error code: `'unknown_css_class_in_selector'` or `'unknown_css_id_in_selector'`
- Example: `selectElement(".button.invalid")` → "Unknown CSS class in selector: 'invalid'"

**Invalid Selector Syntax**:
- Detects malformed CSS selectors (unclosed brackets, double dots, etc.)
- Error code: `'invalid_css_selector_syntax'`
- Example: `selectElement(".button[")` → "Invalid CSS selector syntax: Unclosed attribute selector"

**Invalid CSS File Handling** (User Story 4):
- Validates that imported CSS files don't have syntax errors
- Error shown at CSS import statement (not at every usage)
- Error code: `'invalid_css_file'`
- Example: `styles "./broken.css"` → "CSS file './broken.css' has syntax errors (line 5, column 10): Unclosed block"

### Hot-Reload Validation (User Story 3)

CSS validation updates automatically when CSS files change:

**Flow**:
1. User saves CSS file
2. Extension's `CSSWatcherManager` detects change (300ms debounce)
3. Extension sends `CSS_UPDATED_NOTIFICATION` to language server
4. Language server re-parses CSS file and updates `CSSRegistryService`
5. Language server triggers re-validation of importing documents
6. VS Code displays updated diagnostics

**Integration Points**:
- Extension: [css-watcher.ts](packages/extension/src/extension/css-watcher.ts)
- Language Server: [main.ts](packages/extension/src/language/main.ts)
- Notification handler re-parses CSS and triggers `DocumentBuilder.update()`

### CSSRegistryService API

**Core Methods**:

```typescript
// Update CSS file metadata (called after parsing)
updateCSSFile(fileUri: string, metadata: CSSParseResult): void

// Register which CSS files a document imports
registerImports(documentUri: string, cssFileUris: string[]): void

// Get CSS imports for a document
getDocumentImports(documentUri: string): Set<string>

// Query available classes/IDs for a document
getClassesForDocument(documentUri: string): Set<string>
getIDsForDocument(documentUri: string): Set<string>

// Find source location of a class/ID
findClassLocation(documentUri: string, className: string): CSSSourceLocation | undefined
findIDLocation(documentUri: string, idName: string): CSSSourceLocation | undefined

// Check for CSS file errors
hasErrors(fileUri: string): boolean
getErrors(fileUri: string): CSSParseError[]

// Clear document data (on document close)
clearDocument(documentUri: string): void
```

### Validator Integration

**Lazy Initialization Pattern**:
The validator uses a lazy initialization helper to ensure CSS imports are registered before validation runs, solving the Langium validator ordering issue where child validators run before parent validators complete.

```typescript
// Helper method (called from both checkCSSImports and checkClassNameParameter)
private ensureCSSImportsRegistered(program: Program, documentUri: string): void

// Program-level validator - extracts CSS imports
checkCSSImports(program: Program, accept: ValidationAcceptor): void

// Operation-level validator - validates className parameters
checkClassNameParameter(call: OperationCall, accept: ValidationAcceptor): void

// Operation-level validator - validates selector parameters
checkSelectorParameter(call: OperationCall, accept: ValidationAcceptor): void

// Program-level validator - validates CSS file errors
validateCSSFileErrors(program: Program, accept: ValidationAcceptor): void
```

### Test Coverage

**Unit Tests** (130 tests):
- [css-parser.spec.ts](packages/language/src/css/__tests__/css-parser.spec.ts) - 44 tests
- [levenshtein.spec.ts](packages/language/src/css/__tests__/levenshtein.spec.ts) - 42 tests
- [css-registry.spec.ts](packages/language/src/css/__tests__/css-registry.spec.ts) - 34 tests
- [selector-parser.spec.ts](packages/language/src/css/__tests__/selector-parser.spec.ts) - 42 tests (all passing)

**Integration Tests** (22 tests):
- [valid-classname.spec.ts](packages/language/src/__tests__/css-classname-validation/) - 3 tests
- [unknown-classname.spec.ts](packages/language/src/__tests__/css-classname-validation/) - 3 tests
- [valid-selector.spec.ts](packages/language/src/__tests__/css-selector-validation/) - 6 tests
- [unknown-selector.spec.ts](packages/language/src/__tests__/css-selector-validation/) - 5 tests
- [invalid-syntax.spec.ts](packages/language/src/__tests__/css-selector-validation/) - 3 tests
- [css-registry-update.spec.ts](packages/language/src/__tests__/css-hot-reload/) - 6 tests (hot-reload)
- [invalid-css.spec.ts](packages/language/src/__tests__/css-invalid-file/) - 6 tests (error handling)

**Test Isolation**: All integration tests are in separate files to prevent workspace contamination (per user directive).

### Performance

- **CSS Parsing**: PostCSS parses files in <50ms for typical stylesheets
- **Validation**: Real-time validation with no noticeable lag
- **Hot-Reload**: CSS changes reflect in <300ms (debounce period)
- **Memory**: Minimal overhead - only stores class/ID names and locations

### Error Messages

Examples of user-facing error messages:

```
Unknown CSS class: 'buttom' (Did you mean: 'button'?)
Unknown CSS class in selector: 'buton' (Did you mean: 'button'?)
Invalid CSS selector syntax: Unclosed attribute selector
CSS file './styles.css' has syntax errors (line 5, column 10): Unclosed block
```

### Implementation Files

**CSS Infrastructure**:
- `packages/language/src/css/css-parser.ts` - PostCSS-based parser (5,089 bytes)
- `packages/language/src/css/css-registry.ts` - Registry service (10,500 bytes)
- `packages/language/src/css/levenshtein.ts` - Distance algorithm (3,938 bytes)
- `packages/language/src/css/selector-parser.ts` - Selector parsing (2,535 bytes)
- `packages/language/src/lsp/css-notifications.ts` - LSP notification types

**Validators**:
- `packages/language/src/eligian-validator.ts:1176-1307` - CSS validation logic (190 lines)
  - `ensureCSSImportsRegistered()` - Lazy initialization helper
  - `checkCSSImports()` - Extract and register CSS imports
  - `checkClassNameParameter()` - Validate className parameters
  - `checkSelectorParameter()` - Validate selector parameters
  - `validateCSSFileErrors()` - Validate CSS file syntax

**Module Integration**:
- `packages/language/src/eligian-module.ts:36-38` - Service type extension
- `packages/language/src/eligian-module.ts:66-68` - Service registration

**Extension Integration**:
- `packages/extension/src/extension/css-watcher.ts` - CSS file watching
- `packages/extension/src/language/main.ts` - LSP notification handlers

### Documentation

- **Feature Spec**: `specs/013-css-class-and/spec.md` - Complete specification
- **Implementation Plan**: `specs/013-css-class-and/plan.md` - Technical design
- **Tasks**: `specs/013-css-class-and/tasks.md` - 32 tasks (29 complete)
- **Quickstart**: `specs/013-css-class-and/quickstart.md` - Usage guide

### Known Limitations

1. **CSS File Resolution**: Relative paths only (no node_modules resolution)
2. **Dynamic Classes**: Cannot validate dynamically generated class names
3. **CSS-in-JS**: Does not support CSS-in-JS libraries (Tailwind, Emotion, etc.)
4. **Import Order**: Classes must be defined in imported CSS files (no global CSS)

## JSDoc-Style Documentation for Custom Actions (Feature 020)

The Eligian DSL supports JSDoc-style documentation comments for custom actions, providing three key capabilities: write documentation, auto-generate templates, and view docs on hover.

### Overview

Developers can document custom actions using familiar JSDoc syntax with `/** */` delimiters and `@param` tags. The VS Code extension automatically generates documentation templates and displays formatted documentation in hover tooltips at call sites.

### Quick Example

**Writing Documentation**:
```eligian
/**
 * Fades in an element over a specified duration
 * @param selector CSS selector for target element
 * @param duration Animation duration in milliseconds
 */
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**Auto-Generation**: Type `/**` above an action and press Enter:
```eligian
/**
 *
 * @param selector
 * @param duration
 */
action fadeIn(selector: string, duration: number) [
  // Template auto-generated with parameter placeholders
]
```

**Hover Tooltip**: Hovering over `fadeIn("#box", 1000)` shows:
```markdown
### fadeIn

Fades in an element over a specified duration

**Parameters:**
- `selector` (`string`) - CSS selector for target element
- `duration` (`number`) - Animation duration in milliseconds
```

### Syntax

**JSDoc Comment Structure**:
```eligian
/**
 * Main description text (supports markdown)
 * Can span multiple lines
 * @param {type} name Description text
 * @param anotherParam Description without type
 */
```

**Supported Features**:
- Main description (text before first `@tag`)
- `@param` tags with optional type and description
- Markdown formatting in descriptions (bold, italic, code spans, links)
- Multi-line descriptions with preserved whitespace

**Not Supported**:
- Other JSDoc tags (`@returns`, `@throws`, `@example`, etc.)
- Type validation (types are for documentation only)
- Complex type expressions (generics, unions, etc.)

### Auto-Generation Workflow

1. **Position cursor** on the line above an action definition
2. **Type `/**`** and press Enter (or complete the second `*`)
3. **Template generates** automatically with:
   - Blank description line with cursor positioned for editing
   - `@param` tag for each parameter in order
   - Type annotations pre-filled from action signature
   - Type inference for untyped parameters (using existing type system)

**Example**:
```eligian
// Before: Type /** and press Enter here
action processData(items: array, options) [...]

// After: Template auto-generated
/**
 * |  <-- cursor here for description
 * @param {array} items
 * @param {object} options
 */
action processData(items: array, options) [...]
```

### Hover Documentation

**When hovering over an action invocation**, the tooltip displays:

1. **Action name** as heading
2. **Description** from JSDoc comment
3. **Parameters section** (if `@param` tags present):
   - Parameter name in code format
   - Type annotation (from `@param {type}` or inferred)
   - Description text

**Graceful Degradation**:
- **No JSDoc**: Shows basic action signature (name + parameters)
- **Partial JSDoc**: Shows available documentation only
- **Malformed JSDoc**: Falls back to signature without errors

### Architecture

**Location**: `packages/language/src/jsdoc/`

**Core Modules**:

1. **[jsdoc-parser.ts](packages/language/src/jsdoc/jsdoc-parser.ts)** - JSDoc parsing
   - Uses Langium's built-in `parseJSDoc()` for proper parsing
   - Extracts description and `@param` tags
   - Returns structured `JSDocComment` object

2. **[jsdoc-extractor.ts](packages/language/src/jsdoc/jsdoc-extractor.ts)** - Comment extraction
   - `extractJSDoc(actionDef, commentProvider)` - Extract JSDoc from action
   - Uses Langium's `CommentProvider` service
   - Pure function for easy testing

3. **[jsdoc-formatter.ts](packages/language/src/jsdoc/jsdoc-formatter.ts)** - Markdown formatting
   - `formatJSDocAsMarkdown(jsdoc, actionName)` - Format for hover display
   - Generates clean markdown with heading, description, parameters
   - Preserves markdown formatting from original comments

4. **[jsdoc-template-generator.ts](packages/language/src/jsdoc/jsdoc-template-generator.ts)** - Template generation
   - `generateJSDocTemplate(action, typeChecker)` - Generate template string
   - Infers types for untyped parameters
   - Returns snippet with placeholders

**Integration Points**:
- **Parser**: Langium's `CommentProvider` automatically captures `/** */` comments
- **Completion**: [eligian-completion-provider.ts](packages/language/src/eligian-completion-provider.ts:104-147) handles `/**` trigger
- **Hover**: [eligian-hover-provider.ts](packages/language/src/eligian-hover-provider.ts:83-134) displays formatted JSDoc

### Testing

**Test Coverage**: 31 tests across 4 test suites
- **Parser tests** (9 tests): `jsdoc-parser.spec.ts` - Parse JSDoc structure
- **Extractor tests** (4 tests): `jsdoc-extractor.spec.ts` - Extract from AST nodes
- **Formatter tests** (15 tests): `jsdoc-formatter.spec.ts` - Format as markdown
- **Template tests** (6 tests): `jsdoc-template-generator.spec.ts` - Generate templates
- **Completion tests** (5 tests): `jsdoc-completion.spec.ts` - Auto-generation workflow
- **Hover tests** (6 tests): `jsdoc-hover.spec.ts` - Hover display integration

**Integration Tests**:
- End-to-end JSDoc workflow in VS Code
- Type inference integration for untyped parameters
- Performance validation (<300ms hover, <500ms generation)

### Performance

- **Hover Response**: <200ms (target: <300ms)
- **Template Generation**: <100ms (target: <500ms)
- **Large Actions**: Handles 20+ parameters without degradation
- **Malformed JSDoc**: Graceful degradation without crashes

### Documentation

- **Feature Spec**: `specs/020-jsdoc-style-comments/spec.md` - Complete specification
- **Implementation Plan**: `specs/020-jsdoc-style-comments/plan.md` - Technical design
- **Tasks**: `specs/020-jsdoc-style-comments/tasks.md` - 34 tasks (all complete)
- **Quickstart**: `specs/020-jsdoc-style-comments/quickstart.md` - Usage guide

### Implementation Files

**Core JSDoc Infrastructure**:
- `packages/language/src/jsdoc/jsdoc-parser.ts` - Parse JSDoc comments (1,876 bytes)
- `packages/language/src/jsdoc/jsdoc-extractor.ts` - Extract from AST (996 bytes)
- `packages/language/src/jsdoc/jsdoc-formatter.ts` - Format as markdown (1,445 bytes)
- `packages/language/src/jsdoc/jsdoc-template-generator.ts` - Generate templates (2,890 bytes)

**IDE Integration**:
- `packages/language/src/eligian-completion-provider.ts:104-147` - Auto-generation trigger
- `packages/language/src/eligian-hover-provider.ts:83-134` - Hover documentation display

**Test Files** (31 tests total):
- `packages/language/src/jsdoc/__tests__/jsdoc-parser.spec.ts` - 9 tests
- `packages/language/src/jsdoc/__tests__/jsdoc-extractor.spec.ts` - 4 tests
- `packages/language/src/jsdoc/__tests__/jsdoc-formatter.spec.ts` - 15 tests
- `packages/language/src/jsdoc/__tests__/jsdoc-template-generator.spec.ts` - 6 tests
- `packages/language/src/__tests__/jsdoc-integration/jsdoc-completion.spec.ts` - 5 tests
- `packages/language/src/__tests__/jsdoc-integration/jsdoc-hover.spec.ts` - 6 tests

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
