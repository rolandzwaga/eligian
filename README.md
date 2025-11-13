# Eligian: DSL & Compiler for Eligius Story Telling Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)

**Eligian** is a domain-specific language (DSL) and compiler for the [Eligius Story Telling Engine](https://github.com/rolandzwaga/eligius). It dramatically reduces the verbosity of Eligius JSON configurations by 70-80% while providing type safety, IDE support, and a more intuitive syntax for creating timeline-based interactive presentations.

For a full current spec of the language check [this](./LANGUAGE_SPEC.md)

> **📝 File Extension**: Eligian programs use the **`.eligian`** file extension (e.g., `my-timeline.eligian`).

**NOTE:** This is very much a work in progress still, so the language is in flux, half-ready and far from suitable for anything production level.

## 🎯 What is Eligius?

[Eligius](https://github.com/rolandzwaga/eligius) is a JavaScript engine that triggers arbitrary functionality according to a timeline provider (video, audio, requestAnimationFrame, etc.). It's designed for:

- **Video annotations**: Overlay text, graphics, or interactive elements synchronized with video playback
- **Presentation software**: Create slide decks with timed transitions and animations
- **Interactive infographics**: Build data visualizations that unfold over time
- **Audio-driven experiences**: Synchronize visuals with audio narration or music

Eligius is **not** a game or animation engine—it's a **Story Telling Engine** focused on narratives structured around time.

## 🚨 The Problem: JSON Verbosity

Eligius is configured entirely through JSON, which becomes unwieldy for complex presentations. Eligian solves this with a concise, readable syntax.

### Example: Before & After

**Before (Eligius JSON)** - verbose and error-prone:
```json
{
  "actions": [
    {
      "name": "fadeIn",
      "startOperations": [
        {
          "systemName": "selectElement",
          "operationData": {
            "selector": "parameter:selector"
          }
        },
        {
          "systemName": "animate",
          "operationData": {
            "animationProperties": {
              "opacity": 1
            },
            "animationDuration": "parameter:duration"
          }
        }
      ],
      "endOperations": []
    }
  ]
}
```

**After (Eligian DSL)** - clean and intuitive:
```eligian
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**70-80% less code**, with the same functionality!

## ✨ Key Features

### 🎨 Concise, Readable Syntax
- **Action definitions**: Define reusable operations with parameters and JSDoc documentation
- **Timeline operations**: 45+ built-in operations from Eligius (DOM, animation, data, events, etc.)
- **Custom actions**: Call your own defined actions alongside built-in operations
- **Control flow**: `if/else` conditionals, `for` loops, `break/continue` statements
- **Variable references**: Access loop variables (`@@item`), system properties (`@@currentItem`, `@@loopIndex`)
- **Asset imports**: CSS, HTML, and library file imports with validation
- **Event actions**: Runtime event handlers with compile-time validation

### 🔒 Type-Safe Compilation
- **Compile-time validation**: Catch errors before runtime
- **Type checking**: Optional type annotations with inference (TypeScript-inspired)
- **Semantic validation**: Duplicate detection, scope checking, constraint validation
- **Source location tracking**: Error messages show exact line/column with helpful hints

### 🚀 IDE Support via VS Code Extension
- **Syntax highlighting**: Keywords, identifiers, literals beautifully colored
- **Code completion**:
  - ✅ Operation names with descriptions and parameter info
  - ✅ Custom action names with signatures
  - ✅ Event action skeleton generation (43 Eligius events)
  - ✅ Loop variables and system properties
  - ✅ JSDoc template auto-generation (`/**` + Enter)
  - Context-aware filtering (only valid items at cursor position)
- **Live preview**: Compile and preview timelines in real-time with CSS hot-reload
- **Real-time diagnostics**: Error detection as you type
- **CSS validation**: Class name validation with "Did you mean?" suggestions
- **Hover documentation**: View JSDoc, CSS rule locations, and type information

### ⚡ Powerful Compiler
- Built with **Langium** (language workbench) and **TypeScript**
- **Multi-stage pipeline**: Parse → Validate → Type Check → Transform → Optimize → Emit
- **Metadata generation**: Auto-generates operation registry from Eligius source
- **Optimization**: Constant folding, dead code elimination
- **Source maps**: Track DSL locations through to JSON output

### 🧪 Comprehensive Testing
- **1,758 tests passing** across all packages
- Grammar parsing tests
- Semantic validation tests
- Type system tests (Typir integration)
- Compiler pipeline tests
- Code completion tests
- CSS validation tests
- JSDoc documentation tests
- 81.72% code coverage

## 📦 Project Structure

Eligian is organized as a **monorepo** with three packages:

```
packages/
├── language/                 # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium          # DSL grammar definition
│   │   ├── eligian-validator.ts     # Semantic validation rules
│   │   ├── eligian-completion-provider.ts  # Code completion
│   │   ├── type-system-typir/       # Typir-based type system
│   │   ├── compiler/                # AST → JSON transformer
│   │   ├── completion/              # Completion modules
│   │   ├── css/                     # CSS validation and hover
│   │   ├── jsdoc/                   # JSDoc parsing and generation
│   │   └── __tests__/               # Comprehensive test suites
│   └── package.json
│
├── cli/                      # Command-line compiler
│   ├── src/
│   │   └── main.ts
│   └── package.json
│
└── extension/                # VS Code extension
    ├── src/
    │   ├── extension/               # Extension entry point
    │   │   ├── preview/             # Live preview manager
    │   │   └── commands/            # Extension commands
    │   └── language/                # Language server entry point
    └── package.json
```

## 🏗️ Architecture

### Technology Stack

- **Language**: TypeScript (compiled to JavaScript for Node.js runtime)
- **Grammar Framework**: [Langium](https://langium.org/) - TypeScript-based language workbench
- **Build Tools**: esbuild (fast bundling), Vitest (testing), Biome (linting/formatting)
- **Target Platform**: Node.js 20+ (CLI), VS Code 1.80+ (extension)

### Compilation Pipeline

The compiler uses a **six-stage pipeline**:

```
DSL Source (.eligian)
    ↓
[1] Parse (Langium) → AST
    ↓
[2] Validate → Validated AST (semantic checks)
    ↓
[3] Type Check → Typed AST (optional type annotations + inference)
    ↓
[4] Transform → Eligius Configuration Object
    ↓
[5] Optimize → Optimized Configuration (constant folding, etc.)
    ↓
[6] Emit → Eligius JSON
```

Each stage has comprehensive error handling with source location tracking.

### Design Principles

Following our [project constitution](.specify/memory/constitution.md):

1. **Simplicity First**: Clear, well-documented code over clever abstractions
2. **Comprehensive Testing**: 379 tests covering all components
3. **Functional Programming**: Immutable external API, internal mutation allowed for performance
4. **Type Safety**: Leverage TypeScript's type system
5. **Developer Experience**: Clear error messages with source locations and actionable hints

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v20 or later (LTS recommended)
- **pnpm**: v8 or later (package manager)
- **VS Code**: v1.80 or later (for extension)

### Installation

```bash
# Clone the repository
git clone https://github.com/rolandzwaga/eligian.git
cd eligian

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm test
```

### Your First Eligian Program

Create `example.eligian`:

```eligian
// Import CSS styles
styles "./styles.css"

// Define a reusable fade-in action
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

// Define a timeline with events
timeline "My First Timeline" in "#app" using raf {

  // Event at 0 seconds: fade in the title
  at 0s..2s [
    fadeIn("#title", 1000)
  ] [
    selectElement("#title")
    animate({opacity: 0}, 500)
  ]

  // Event at 2 seconds: show multiple items with a loop
  at 2s..5s for (item in ["#item1", "#item2", "#item3"]) {
    fadeIn(@@item, 500)
    wait(200)
  }

  // Event at 5 seconds: conditional logic
  at 5s..5s if (true) {
    log("Timeline complete!")
  }
}
```

### Preview in VS Code

The easiest way to see your Eligian program in action:

```bash
# 1. Open example.eligian in VS Code
# 2. Press Ctrl+Shift+P → "Eligian: Start Preview"
# 3. Edit your file - preview updates in real-time
```

### Compile to Eligius JSON (CLI)

```bash
# CLI is in development - for now, use the VS Code extension preview
# The compiled JSON is generated automatically when you use the preview
```

## 📚 DSL Syntax Overview

### Action Definitions

Define reusable actions with parameters:

```eligian
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

// Call the action
fadeIn("#title", 500)
```

### Type Annotations (Optional)

Add type hints for better IDE support:

```eligian
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

Types are **optional** - the compiler infers types from operation usage if not specified.

### Control Flow

**If/Else Conditionals**:
```eligian
action processItem(item) [
  if (@@loopIndex === 0) {
    selectElement(item)
  } else {
    animate(item, {opacity: 0.5})
  }
]
```

**For Loops**:
```eligian
action animateAll(items) [
  for (item in items) {
    fadeIn(@@item, 500)  // @@item is the loop variable
  }
]
```

**Break/Continue**:
```eligian
for (item in items) {
  if (@@currentItem.skip) {
    continue  // Skip to next iteration
  }
  if (@@currentItem.stop) {
    break  // Exit loop
  }
  processItem(@@currentItem)
}
```

### Variable References

Access system properties with `@@` prefix:

- `@@item` - Current loop variable (alias for `@@currentItem` in loops)
- `@@currentItem` - Current item in a loop
- `@@loopIndex` - Current loop index (0-based)
- `@@loopLength` - Total loop iterations

### Built-in Operations

45+ operations from Eligius, including:

**DOM Operations**:
```eligian
selectElement(selector)
createElement(tagName, attributes)
removeElement(selector)
```

**Animation**:
```eligian
animate(properties, duration)
setStyle(selector, property, value)
```

**Data Management**:
```eligian
setData(key, value)
getData(key)
mergeData(key, value)
```

**Control Flow**:
```eligian
runAction(actionName, ...args)
delay(milliseconds)
```

See the [complete list of Eligius operations](https://github.com/rolandzwaga/eligius/tree/main/src/operation) in the Eligius repository.

### Comments

```eligian
// Single-line comment

/* Multi-line
   comment */
```

## 🎨 VS Code Extension

### Features

- ✅ **Syntax Highlighting**: Keywords, identifiers, literals
- ✅ **Code Completion**:
  - Operation names (45+ operations) with descriptions
  - Custom action names with parameter signatures and JSDoc
  - Event action skeletons (43 Eligius events with auto-generated handlers)
  - JSDoc template generation (`/**` + Enter above actions)
  - Loop variables (`@@item`, `@@currentItem`, etc.)
  - Smart sorting (most relevant items first)
- ✅ **Live Preview**: Compile and preview timelines in real-time with CSS hot-reload
- ✅ **Real-time Validation**: Error detection as you type with helpful hints
- ✅ **Hover Information**:
  - JSDoc documentation on action hover
  - CSS class/ID source locations with rule snippets
  - Type information from Typir type system
- ✅ **CSS Support**:
  - Import CSS files with `styles "./file.css"`
  - Real-time class name validation with "Did you mean?" suggestions
  - Hot-reload CSS changes without restarting timeline
- ⏳ **Quick Fixes**: Automatic corrections (planned)

### Installation (Development)

1. Open the project in VS Code
2. Press **F5** to launch Extension Development Host
3. Create a `.eligian` file in the development window
4. Start typing to see code completion!

### Usage

**Trigger Code Completion**:
- Type operation name: `sel` → suggests `selectElement`
- Type custom action: Start typing action name → suggests defined actions with JSDoc
- Type `on event ` → triggers event action skeleton completion (43 Eligius events)
- Type `/**` above an action + Enter → generates JSDoc template
- Type `@@` → suggests loop variables and system properties
- Press `Ctrl+Space` to manually trigger

**CSS Support**:
- Add `styles "./styles.css"` to import CSS files
- Edit CSS file → preview hot-reloads automatically (no timeline restart)
- Typo in class name? → Get "Did you mean?" suggestions with Levenshtein distance

**Compile & Preview**:
- Press `Ctrl+Shift+P` → "Eligian: Start Preview"
- Edit your `.eligian` file - preview updates in real-time
- Edit imported CSS files - styles hot-reload in preview
- Compilation errors shown in preview panel with source locations

## 🧪 Development

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm test

# Watch mode (rebuild on changes)
pnpm run watch
```

### Project Scripts

```bash
pnpm run build                    # Build all packages
pnpm run clean                    # Remove build artifacts
pnpm test                         # Run all tests
pnpm run check                    # Biome format & lint
pnpm run langium:generate         # Generate Langium AST types
pnpm run generate:metadata        # Generate operation metadata
pnpm run generate:registry        # Generate operation registry
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific package tests
cd packages/language && pnpm test

# Run specific test file
cd packages/language && pnpm test completion.spec.ts

# Watch mode
pnpm test -- --watch

# Coverage report
pnpm test -- --coverage
```

### Code Quality

This project uses **Biome** for formatting and linting:

```bash
# Format and lint (auto-fix)
pnpm run check

# Lint only
pnpm run lint

# CI check (no modifications)
pnpm run ci
```

All code changes must pass Biome checks before commit (Constitution Principle XI).

## 📖 Documentation

- **[Project Constitution](.specify/memory/constitution.md)**: Core principles and guidelines
- **[DSL Grammar](packages/language/src/eligian.langium)**: Complete grammar definition
- **[Language Specification](LANGUAGE_SPEC.md)**: Full language specification
- **[Type System (Typir)](packages/language/src/type-system-typir/README.md)**: Type checking and inference
- **[Completion System](packages/language/src/completion/)**: Code completion modules
- **[CSS Validation](specs/013-css-class-and/)**: CSS class validation with Levenshtein suggestions
- **[JSDoc Support](specs/020-jsdoc-style-comments/)**: JSDoc template generation and hover
- **[Feature Specs](specs/)**: Feature specifications and implementation plans

### Recent Feature Specs

- **[JSDoc Documentation](specs/020-jsdoc-style-comments/)**: JSDoc template generation and hover (complete)
- **[Typir Type System](specs/021-type-system-typir/)**: Typir-based type checking (complete)
- **[CSS Validation](specs/013-css-class-and/)**: CSS class validation with hot-reload (complete)
- **[CSS Live Reload](specs/011-preview-css-support/)**: CSS hot-reload in preview (complete)
- **[Event Actions](specs/028-event-actions-the/)**: Runtime event handlers (complete)

## 🗺️ Project Status

### Completed Features ✅

- ✅ **Core Language**: Grammar, parser, AST with Langium
- ✅ **Validation**: Semantic validation, scope checking, duplicate detection
- ✅ **Type System (Typir)**: Type annotations, type inference, type checking with Typir
- ✅ **Compiler**: AST → JSON transformation with constant folding optimization
- ✅ **Control Flow**: If/else, for loops, break/continue keywords
- ✅ **Code Completion**: Operations, actions, event skeletons, JSDoc templates
- ✅ **Live Preview**: Real-time compilation and preview with CSS hot-reload
- ✅ **CSS Support**: Import CSS files, class validation, hot-reload
- ✅ **JSDoc**: Template auto-generation and hover documentation
- ✅ **Event Actions**: Runtime event handlers with validation (43 events)
- ✅ **Library Imports**: Import actions from `.eligian` library files
- ✅ **Asset Loading**: CSS and HTML file imports with validation
- ✅ **Metadata Generation**: Auto-generated operation registry from Eligius source

### In Progress 🚧

- 🚧 **CLI Compiler**: Command-line interface (architecture ready, implementation pending)

### Planned ⏳

- ⏳ **Source Maps**: Debug support with source locations
- ⏳ **Package Publishing**: NPM package and VS Code marketplace
- ⏳ **Performance Profiling**: Optimize compilation and validation performance

**Test Coverage**: 1,758 tests passing (81.72% coverage)

## 🎯 Architecture Highlights

### Loop Control Syntactic Sugar

Clean `break` and `continue` keywords that compile to Eligius operations:

```eligian
for (item in items) {
  if (@@currentItem.skip) {
    continue  // → continueForEach()
  }
  if (@@currentItem.stop) {
    break  // → breakForEach()
  }
}
```

See [examples/break-continue-demo.eligian](examples/break-continue-demo.eligian) for usage examples.

### Type System

Optional TypeScript-inspired type system with inference:

```eligian
// Type annotations (optional)
action fadeIn(selector: string, duration: number) [
  selectElement(selector)  // Type-checked!
  animate({opacity: 1}, duration)
]

// Type inference (no annotations needed)
action fadeIn(selector, duration) [
  selectElement(selector)  // Infers selector: string
  animate({opacity: 1}, duration)  // Infers duration: number
]
```

See [Type System README](packages/language/src/type-system/README.md) for details.

### Code Completion

Smart, context-aware completions with intelligent sorting:

1. **Loop variables first**: `@@item` (most relevant in loops)
2. **System properties**: `@@currentItem`, `@@loopIndex`
3. **Action parameters**: Available parameters in current scope
4. **Literals last**: `true`, `false`, `null`

Operations show full documentation including:
- Description from JSDoc
- Parameter names and types
- Dependencies and outputs
- Usage examples

See [Code Completion Spec](specs/002-code-completion-i/) for implementation details.

## 🤝 Related Projects

- **[Eligius](https://github.com/rolandzwaga/eligius)**: The Story Telling Engine this DSL targets
- **[Langium](https://langium.org/)**: Language workbench used for grammar and language server

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 👥 Contributors

- **Roland Zwaga** - Creator of Eligius and Eligian DSL
- **Claude Code** - AI pair programmer assisting with implementation

## 🙏 Acknowledgments

- **TypeFox** for creating Langium
- The TypeScript and Node.js communities

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/rolandzwaga/eligian/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rolandzwaga/eligian/discussions)
- **Eligius Documentation**: [Eligius Docs](https://github.com/rolandzwaga/eligius/tree/main/docs)

---

**Built with ❤️ using TypeScript and Langium**
