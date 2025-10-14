# Research: Eligius DSL & Compiler

**Date**: 2025-10-14
**Phase**: 0 (Outline & Research)

## Overview

This document consolidates research findings for technology choices, best practices, and design decisions for the Eligius DSL project. All NEEDS CLARIFICATION items from the Technical Context have been resolved.

## Technology Stack Research

### Langium Framework

**Decision**: Use Langium for grammar definition and language server implementation

**Rationale**:
- **TypeScript-native**: Written in TypeScript, integrates seamlessly with our stack
- **LSP-compliant**: Language Server Protocol support out of the box
- **VS Code integration**: Excellent VS Code extension scaffolding and tooling
- **Active development**: Backed by TypeFox, regular updates, good community support
- **Proven track record**: Used in production by multiple language implementations

**Best Practices**:
1. **Grammar Organization**:
   - Define terminal rules first (identifiers, literals, operators)
   - Build up production rules from simple to complex
   - Use cross-references for name resolution (e.g., `variable=[Variable:ID]`)
   - Leverage Langium's built-in validation framework

2. **Validation Strategy**:
   - Syntactic validation: handled by grammar
   - Semantic validation: custom validators in `eligius-validator.ts`
   - Type checking: separate pass in `eligius-scope.ts`
   - Error recovery: use Langium's error recovery mechanisms

3. **Language Server**:
   - Implement custom completion providers for Eligius-specific constructs
   - Use Langium's scope provider for name resolution
   - Leverage Langium's document builder for incremental parsing

**Alternatives Considered**:
- **ANTLR**: More powerful but Java-based, complex TS integration
- **Chevrotain**: Pure TypeScript but less VS Code integration
- **Custom parser**: Too much reinvention, no LSP support

### Effect-ts for Compiler

**Decision**: Use Effect-ts for the compilation pipeline

**Rationale**:
- **Typed errors**: Every pipeline stage has explicit, typed error handling
- **Composability**: Effect.flatMap, pipe, and Effect.gen for clean composition
- **Testability**: Easy to mock services via Layers
- **Performance**: Lazy evaluation, caching support, internal mutation allowed
- **Type safety**: Full TypeScript inference, catches bugs at compile time

**Best Practices**:
1. **Service Design**:
   - Define services as Context.Tag with readonly methods
   - Return Effect types from all service methods
   - Use Effect.gen for readable async composition

2. **Error Handling**:
   - Use tagged unions for error types (`{ _tag: "ErrorType", ... }`)
   - Include source location in all errors
   - Use Effect.fail for expected errors, never throw

3. **Layer Composition**:
   - Build Live implementations for production
   - Build Test/Mock implementations for testing
   - Compose with Layer.mergeAll for runtime

4. **Pipeline Design**:
   - Each stage: `(input) => Effect<output, error, dependencies>`
   - Compose with Effect.flatMap or pipe
   - Use Effect.cached for expensive computations

**Alternatives Considered**:
- **fp-ts**: Similar but less ergonomic, older API design
- **Plain Promises**: No typed errors, harder to compose, less testable
- **Synchronous approach**: Blocks on I/O, no composition benefits

### esbuild for VS Code Extension

**Decision**: Use esbuild for bundling the VS Code extension

**Rationale**:
- **Speed**: 10-100x faster than webpack/rollup
- **Simple config**: Minimal configuration needed
- **Tree shaking**: Excellent dead code elimination
- **VS Code standard**: Commonly used in VS Code extensions

**Best Practices**:
1. Bundle extension and language server separately
2. Mark VS Code API as external (`vscode` module)
3. Enable minification for production builds
4. Use sourcemaps for debugging

**Configuration**:
```javascript
{
  entryPoints: ['src/extension/main.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production'
}
```

### tsdown for Compiler Library

**Decision**: Use tsdown for bundling the compiler library

**Rationale**:
- **TypeScript-first**: Designed for TypeScript libraries
- **Type definitions**: Generates .d.ts files automatically
- **Multiple formats**: ESM + CJS output for maximum compatibility
- **Tree-shakeable**: Produces tree-shakeable ESM bundles

**Best Practices**:
1. Export Effect-based API (return Effect types)
2. Generate both ESM and CJS for compatibility
3. Include type definitions in package
4. Mark peer dependencies correctly (Effect, etc.)

**Configuration**:
```javascript
{
  entry: ['src/compiler/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['effect']
}
```

### vitest for Testing

**Decision**: Use vitest for all tests (unit, integration, snapshot)

**Rationale**:
- **Fast**: Vite-powered, instant re-runs on changes
- **TypeScript**: First-class TypeScript support, no ts-jest needed
- **API**: Compatible with Jest API (easy migration if needed)
- **ESM support**: Native ESM support (important for Effect-ts)
- **Snapshot testing**: Built-in snapshot testing for compiler output

**Best Practices**:
1. **Test Organization**:
   - Unit tests: `tests/unit/` (test individual functions)
   - Integration tests: `tests/integration/` (test pipelines)
   - Fixtures: `tests/fixtures/` (example DSL programs)

2. **Effect Testing**:
   - Mock services with Layer.succeed
   - Use Effect.runPromise in tests
   - Test both success and error paths

3. **Snapshot Testing**:
   - Use for expected JSON outputs
   - Store in `tests/compilation/snapshots/`
   - Review diffs carefully on updates

**Configuration**:
```javascript
{
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      threshold: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
}
```

## Eligius Library Analysis

**Source**: https://github.com/rolandzwaga/eligius

**Key Findings**:

1. **Configuration Structure**:
   - JSON-based configuration drives the entire engine
   - Top-level keys: `timeline`, `providers`, `events`, `actions`
   - Events are triggered based on timeline position
   - Actions define what happens when events trigger

2. **Timeline Providers**:
   - Video: `VideoTimelineProvider`
   - Audio: `AudioTimelineProvider`
   - RequestAnimationFrame: `RAFTimelineProvider`
   - Custom: Implement `ITimelineProvider` interface

3. **Event System**:
   - Events have `start` and `end` times (in provider units)
   - Events can trigger multiple actions
   - Events can have conditions (predicates)

4. **JSON Verbosity Example**:

**Current Eligius JSON** (23 lines):
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

**Proposed DSL** (6 lines):
```
timeline video from "presentation.mp4"

event intro at 0..5 {
  show #title with fadeIn(500ms)
}
```

**Verbosity Reduction**: 74% fewer lines

5. **DSL Design Implications**:
   - Need timeline declaration syntax
   - Need event syntax with time ranges
   - Need action syntax (show, hide, animate, etc.)
   - Need target selector syntax (CSS-like?)
   - Need property/option syntax (with durations, etc.)

## Design Decisions

### DSL Syntax Philosophy

**Decision**: Timeline-first, declarative syntax inspired by CSS/TypeScript

**Rationale**:
- Developers are familiar with CSS selectors and TypeScript syntax
- Timeline is the central concept in Eligius
- Declarative style matches Eligius' event-driven nature
- Type hints can be inferred from context

**Syntax Principles**:
1. **Timeline first**: `timeline <provider> from <source>`
2. **Events as blocks**: `event <id> at <range> { actions }`
3. **Actions as verbs**: `show`, `hide`, `animate`, `trigger`
4. **Selectors like CSS**: `#id`, `.class`, `element`
5. **Options inline**: `with fadeIn(500ms)` vs nested JSON

### Intermediate Representation (IR)

**Decision**: Define typed IR separate from AST and Eligius JSON

**Rationale**:
- Decouples parsing from code generation
- Allows optimization passes on IR
- Easier to test transformations
- Type-safe representation

**IR Structure**:
```typescript
type EligiusIR = {
  timeline: TimelineIR
  events: EventIR[]
  providers?: ProviderIR[]
  metadata?: MetadataIR
}

type TimelineIR = {
  provider: "video" | "audio" | "raf" | "custom"
  source?: string
  options?: Record<string, unknown>
}

type EventIR = {
  id: string
  start: number
  end: number
  actions: ActionIR[]
  conditions?: ConditionIR[]
}
```

### Compilation Pipeline

**Decision**: Six-stage pipeline (parse → validate → type-check → transform → optimize → emit)

**Rationale**:
- Clear separation of concerns
- Each stage independently testable
- Easy to add new passes (e.g., linting, formatting)
- Follows standard compiler design

**Pipeline Stages**:
1. **Parse**: Langium parser → AST
2. **Validate**: Semantic validation (scoping, name resolution)
3. **Type Check**: Eligius type constraints
4. **Transform**: AST → IR
5. **Optimize**: IR → Optimized IR
6. **Emit**: IR → Eligius JSON

### Testing Strategy

**Decision**: TDD approach with comprehensive coverage

**Test Levels**:
1. **Grammar tests**: Verify parsing of DSL constructs
2. **Validation tests**: Test semantic validators
3. **Type-checking tests**: Verify Eligius constraints
4. **Compilation tests**: End-to-end DSL → JSON with snapshots
5. **Extension tests**: VS Code integration tests

**Coverage Goals**:
- Unit tests: 90%+ coverage
- Integration tests: All happy paths + major error paths
- Fixtures: 3-5 realistic Eligius use cases

## Open Questions & Resolutions

### Q1: How to handle Eligius version compatibility?

**Resolution**: Target specific Eligius version initially (e.g., 1.x). Add version detection/validation in future if breaking changes occur.

### Q2: Should DSL support all Eligius features or subset?

**Resolution**: Start with core features (80% use cases):
- Timeline declaration
- Basic events (start/end times)
- Common actions (show, hide, animate)
- Expand based on user feedback

### Q3: How to handle custom Eligius extensions?

**Resolution**: Design DSL grammar to be extensible. Allow "escape hatch" to raw JSON for advanced use cases:
```
event custom at 0..10 {
  raw {
    "customAction": { ... }
  }
}
```

### Q4: Performance requirements for large DSL files?

**Resolution**: Based on technical context:
- Target <500ms for 1000-line files
- Use Langium's incremental parsing
- Lazy evaluation in Effect pipeline
- Cache compiled outputs

## Next Steps (Phase 1)

1. **Data Model** (`data-model.md`):
   - Define all IR types (TimelineIR, EventIR, ActionIR, etc.)
   - Define Eligius config types (for validation)
   - Define error types (for each pipeline stage)

2. **Contracts** (`contracts/`):
   - CLI interface (command-line arguments, exit codes)
   - Compiler API (programmatic compilation interface)
   - VS Code extension commands

3. **Quickstart** (`quickstart.md`):
   - Setup instructions
   - First DSL program example
   - Compilation and output

---

**Research Complete**: 2025-10-14
**All NEEDS CLARIFICATION items resolved**
