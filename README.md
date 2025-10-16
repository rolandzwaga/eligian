# Eligian: DSL & Compiler for Eligius Story Telling Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)

**Eligian** is a domain-specific language (DSL) and compiler for the [Eligius Story Telling Engine](https://github.com/rolandzwaga/eligius). It dramatically reduces the verbosity of Eligius JSON configurations by 70-80% while providing type safety, IDE support, and a more intuitive syntax for creating timeline-based interactive presentations.

> **📝 File Extension**: Eligian programs use the **`.eligian`** file extension (e.g., `my-timeline.eligian`).

## 🎯 What is Eligius?

[Eligius](https://github.com/rolandzwaga/eligius) is a JavaScript engine that triggers arbitrary functionality according to a timeline provider (video, audio, requestAnimationFrame, etc.). It's designed for:

- **Video annotations**: Overlay text, graphics, or interactive elements synchronized with video playback
- **Presentation software**: Create slide decks with timed transitions and animations
- **Interactive infographics**: Build data visualizations that unfold over time
- **Audio-driven experiences**: Synchronize visuals with audio narration or music

Eligius is **not** a game or animation engine—it's a **Story Telling Engine** focused on time-based narrative experiences.

## 🚨 The Problem: JSON Verbosity

Eligius is configured entirely through JSON, which becomes unwieldy for complex presentations:

### Before: Eligius JSON (23 lines)

```json
{
  "timeline": {
    "provider": "video",
    "source": "presentation.mp4"
  },
  "events": [
    {
      "id": "intro",
      "start": 0,
      "end": 5,
      "actions": [
        {
          "type": "showElement",
          "target": "#title",
          "properties": {
            "animation": "fadeIn",
            "duration": 500
          }
        }
      ]
    }
  ]
}
```

### After: Eligian DSL (6 lines, 74% reduction)

```eligian
timeline video from "presentation.mp4"

event intro at 0..5 {
  show #title with fadeIn(500ms)
}
```

## ✨ Key Features

### 🎨 Concise, Readable Syntax
- **Timeline-first design**: Define your time source upfront (`timeline video from "video.mp4"`)
- **Declarative events**: `event intro at 0..5 { ... }` replaces verbose JSON objects
- **Action-oriented**: `show #title with fadeIn(500ms)` reads like natural language
- **CSS-like selectors**: `#id`, `.class`, `element` for targeting DOM elements

### 🔒 Type-Safe Compilation
- **Compile-time validation**: Catch errors before runtime (duplicate IDs, invalid time ranges, missing required fields)
- **Type checking**: Ensures time expressions evaluate to numbers, durations are valid, etc.
- **Source location tracking**: Error messages show exact line/column where issues occur

### 🚀 IDE Support via VS Code Extension
- **Syntax highlighting**: Keywords, selectors, literals beautifully colored
- **Autocompletion**: Actions, properties, selectors suggested as you type
- **Real-time diagnostics**: Red squiggles for errors, warnings, and suggestions
- **On-the-fly compilation**: Compile and preview with a single command

### ⚡ Powerful Compiler Pipeline
- Built with **Effect-ts** for principled functional programming and error handling
- **Optimization passes**: Dead code elimination, constant folding, timeline optimizations
- **Flexible output**: Minified JSON for production, formatted JSON for debugging
- **Metadata injection**: Compiler version, timestamp automatically added

### 🧪 Comprehensive Testing
- Grammar parsing tests (19 tests covering all DSL constructs)
- Semantic validation tests (duplicate detection, constraint checking)
- End-to-end compilation tests with snapshot validation
- 80%+ code coverage target

## 📦 Project Structure

Eligian is organized as a **monorepo** with four packages:

```
packages/
├── language/                 # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium          # DSL grammar definition
│   │   ├── eligian-validator.ts     # Semantic validation rules
│   │   └── __tests__/               # Grammar and validation tests
│   └── package.json
│
├── compiler/                 # Effect-based DSL → JSON compiler
│   ├── src/
│   │   ├── pipeline.ts              # Main compilation pipeline
│   │   ├── ast-transformer.ts       # AST to Eligius config transformation
│   │   ├── optimizer.ts             # Optimization passes
│   │   ├── error-reporter.ts        # Human-readable error formatting
│   │   ├── effects/                 # Effect services (FileSystem, Logger)
│   │   └── __tests__/               # Compiler unit & integration tests
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
    │   └── language/                # Language server entry point
    └── package.json
```

## 🏗️ Architecture

### Technology Stack

- **Language**: TypeScript (compiled to JavaScript for Node.js runtime)
- **Grammar Framework**: [Langium](https://langium.org/) - TypeScript-based language workbench
- **Compiler Framework**: [Effect-ts](https://effect.website/) - Functional programming for type-safe pipelines
- **Build Tools**: esbuild (fast bundling), vitest (testing)
- **Target Platform**: Node.js 20+ (CLI), VS Code 1.80+ (extension)

### Compilation Pipeline

The compiler uses a **six-stage functional pipeline**:

```
DSL Source (.eligian)
    ↓
[1] Parse (Langium) → AST
    ↓
[2] Validate → Validated AST (semantic checks)
    ↓
[3] Type Check → Typed AST (Eligius constraints)
    ↓
[4] Transform → Intermediate Representation (IR)
    ↓
[5] Optimize → Optimized IR (dead code elimination, constant folding)
    ↓
[6] Emit → Eligius JSON Configuration
```

Each stage returns an **Effect** type with explicit error handling, making the pipeline composable, testable, and type-safe.

### Design Principles

Following our [project constitution](.specify/memory/constitution.md):

1. **Simplicity First**: Clear, well-documented code over clever abstractions
2. **Comprehensive Testing**: Every component has unit tests, integration tests for pipelines
3. **Functional Programming**: Effect-ts throughout, external immutability, internal mutation allowed for performance
4. **Type Safety**: Leverage TypeScript's type system, no `any` types
5. **Developer Experience**: Clear error messages with source locations and actionable hints

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v20 or later (LTS recommended)
- **npm**: v10 or later
- **VS Code**: v1.80 or later (for extension)

### Installation

```bash
# Clone the repository
git clone https://github.com/rolandzwaga/eligian.git
cd eligian

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Your First Eligian Program

Create `example.eligian`:

```eligian
// Define timeline with video provider
timeline video from "presentation.mp4"

// Intro event (0-5 seconds)
event intro at 0..5 {
  show #title with fadeIn(500ms)
  show #subtitle with slideIn(300ms, "left")
}

// Main content (5-120 seconds)
event main at 5..120 {
  show #content
  trigger startAnimation on #diagram
}

// Outro (120-130 seconds)
event outro at 120..130 {
  hide #content with fadeOut(400ms)
  show #credits with slideIn(500ms, "bottom")
}
```

### Compile to Eligius JSON

```bash
# Compile to JSON
npx eligian compile example.eligian -o output.json

# Output:
# ✓ Compiled successfully (42ms)
# Output written to output.json (2.1 KB)
```

### Use with Eligius

```html
<!DOCTYPE html>
<html>
<head>
  <title>Eligius Presentation</title>
  <script type="module">
    import { Eligius } from './node_modules/eligius/dist/index.js'
    import config from './output.json' assert { type: 'json' }

    const eligius = new Eligius(config)
    eligius.start()
  </script>
</head>
<body>
  <video src="presentation.mp4" controls></video>
  <div id="title">Welcome</div>
  <div id="subtitle">Story Telling Engine</div>
  <div id="content">Main Content</div>
  <div id="credits">Credits</div>
</body>
</html>
```

## 📚 DSL Syntax Overview

### Timeline Declaration

Every program starts with a timeline declaration:

```eligian
timeline video from "video.mp4"      // Video timeline
timeline audio from "podcast.mp3"    // Audio timeline
timeline raf                          // RequestAnimationFrame loop
timeline custom from "config.json"   // Custom provider
```

### Event Declaration

Events trigger at specific times:

```eligian
event <id> at <start>..<end> {
  <actions>
}
```

Example:

```eligian
event intro at 0..5 {
  show #title
}

event chapter1 at 5..30 {
  show #section1 with fadeIn(500ms)
}
```

### Actions

**show** - Make element visible:

```eligian
show #id
show #id with fadeIn(500ms)
show .class with slideIn(300ms, "left")
```

**hide** - Hide element:

```eligian
hide #id
hide #id with fadeOut(400ms)
```

**animate** - Trigger animation:

```eligian
animate #diagram with spin(1000ms)
```

**trigger** - Trigger custom action:

```eligian
trigger playSound on #audio-player
```

### Selectors

CSS-like selectors for targeting elements:

```eligian
#id              // Element with ID
.class           // Elements with class
element          // Elements by tag name
```

### Time Ranges

Specify event durations in seconds (for video/audio) or milliseconds (for RAF):

```eligian
at 0..5          // 0 to 5 seconds/milliseconds
at 10..20        // 10 to 20 seconds/milliseconds
at 0..9999       // Long-running event
```

### Comments

```eligian
// Single-line comment

/* Multi-line
   comment */
```

## 🧰 CLI Reference

### Compile Command

```bash
eligian compile <input> [options]

Options:
  -o, --output <file>      Output file path (default: stdout)
  -w, --watch              Watch for changes and recompile
  --minify                 Minify output JSON
  --no-optimize            Skip optimization passes
  --check                  Syntax check only (no output)
  --verbose                Show detailed compilation logs
  --quiet                  Suppress all output except errors
  -h, --help               Show help
  -v, --version            Show version
```

### Examples

```bash
# Compile single file
eligian compile src/presentation.eligian -o dist/config.json

# Compile with minification
eligian compile src/presentation.eligian -o dist/config.json --minify

# Watch mode (recompile on save)
eligian compile src/presentation.eligian -o dist/config.json --watch

# Syntax check only
eligian compile src/presentation.eligian --check
```

## 🎨 VS Code Extension

### Features

- **Syntax Highlighting**: Keywords, selectors, literals, comments
- **Autocompletion**: Context-aware suggestions for actions, properties, selectors
- **Diagnostics**: Real-time error detection with red squiggles
- **Quick Fixes**: Automatic corrections for common errors
- **Hover Information**: Inline documentation for actions and properties
- **Compilation Commands**: Compile current file or entire project

### Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Eligian DSL"
4. Click Install

### Usage

1. Create a `.eligian` file
2. Start typing - autocompletion will suggest actions
3. Press `Ctrl+Shift+B` to compile current file
4. View errors in Problems panel (Ctrl+Shift+M)

## 🧪 Development

### Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Watch mode (rebuild on changes)
npm run watch
```

### Project Scripts

```bash
npm run build              # Build all packages
npm run clean              # Remove build artifacts
npm run test               # Run all tests
npm run check              # Type-check without building
npm run langium:generate   # Generate Langium AST types
```

### Testing

```bash
# Run all tests
npm test

# Run specific package tests
npm test --workspace=packages/language
npm test --workspace=packages/compiler

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style guidelines, and pull request process.

## 📖 Documentation

- **[Project Constitution](.specify/memory/constitution.md)**: Core principles and guidelines
- **[Eligius Understanding](ELIGIUS_UNDERSTANDING.md)**: Deep dive into Eligius library analysis
- **[DSL Syntax Reference](specs/main/quickstart.md)**: Complete syntax guide
- **[Compiler API](specs/main/contracts/compiler-api.md)**: Programmatic compilation interface
- **[CLI Interface](specs/main/contracts/cli-interface.md)**: Command-line interface specification
- **[Extension API](specs/main/contracts/extension-api.md)**: VS Code extension capabilities

## 🗺️ Project Status

### Current Progress

- ✅ **Phase 0: Research & Analysis** - Complete
- ✅ **Phase 1: Setup (Project Infrastructure)** - Complete
- ✅ **Phase 2: Foundational (Core Types & Effects)** - Complete
- ✅ **Phase 3: Grammar Development** - Complete (19 parsing tests passing)
- 🚧 **Phase 4: Semantic Validation** - In Progress
- ⏳ **Phase 5: Compiler Pipeline** - Planned
- ⏳ **Phase 6: Error Reporting** - Planned
- ⏳ **Phase 7: CLI Compiler** - Planned
- ⏳ **Phase 8: VS Code Extension** - Planned
- ⏳ **Phase 9: Polish & Documentation** - Planned

**Overall Progress**: 35/168 tasks complete (21%)

See [specs/main/tasks.md](specs/main/tasks.md) for detailed task breakdown.

## 🎯 Roadmap

### MVP (Minimum Viable Product)

- [x] Langium grammar for core DSL constructs
- [x] Effect-based compilation pipeline architecture
- [ ] AST → JSON transformation
- [ ] CLI compiler with basic options
- [ ] End-to-end compilation tests

**Target**: Command-line compiler that can compile simple DSL files to valid Eligius JSON

### Post-MVP

- [ ] VS Code extension with syntax highlighting
- [ ] Language server with autocompletion
- [ ] Real-time diagnostics and validation
- [ ] On-the-fly compilation in editor

**Target**: Full IDE support for editing `.eligian` files

### Future Enhancements

- [ ] Action definitions (reusable action templates)
- [ ] Variable substitution and expressions
- [ ] Conditional events
- [ ] Import/module system
- [ ] Source maps for debugging
- [ ] Watch mode with incremental compilation
- [ ] Plugin system for custom actions/providers

## 🤝 Related Projects

- **[Eligius](https://github.com/rolandzwaga/eligius)**: The Story Telling Engine this DSL targets
- **[Langium](https://langium.org/)**: Language workbench used for grammar and language server
- **[Effect-ts](https://effect.website/)**: Functional programming library powering the compiler

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 👥 Contributors

- **Roland Zwaga** - Creator of Eligius and Eligian DSL
- **Claude Code** - AI pair programmer assisting with implementation

## 🙏 Acknowledgments

- **TypeFox** for creating Langium
- **Effect-ts Team** for the excellent functional programming framework
- The TypeScript and Node.js communities

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/rolandzwaga/eligian/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rolandzwaga/eligian/discussions)
- **Eligius Documentation**: [Eligius Docs](https://github.com/rolandzwaga/eligius/tree/main/docs)

---

**Built with ❤️ using TypeScript, Langium, and Effect-ts**
