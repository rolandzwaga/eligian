# Compiler API Contract

**Date**: 2025-10-14
**Component**: Compiler Library (Programmatic API)

## Overview

The Compiler API provides programmatic access to the Eligius DSL compiler for embedding in other tools, build systems, or custom workflows. All functions return Effect types for typed error handling.

## Package Exports

**Package**: `@eligius/dsl-compiler`
**Entry Point**: `dist/index.js` (ESM) / `dist/index.cjs` (CJS)
**Types**: `dist/index.d.ts`

```typescript
// Main exports
export { compile, compileString, compileFile } from './compiler/pipeline'
export { formatError, formatErrors } from './compiler/error-reporter'
export * from './types'
export * from './compiler/effects'
```

## Core API

### `compile`

Main compilation function accepting source string.

**Signature**:
```typescript
export const compile: (
  source: string,
  options?: CompileOptions
) => Effect.Effect<EligiusConfig, CompileError, CompilerContext>
```

**Parameters**:
- `source`: DSL source code as string
- `options`: Optional compilation options

**Returns**: Effect that:
- **Success**: Produces `EligiusConfig` (JSON output)
- **Error**: Fails with typed `CompileError`
- **Context**: Requires `CompilerContext` (FileSystem, Logger, etc.)

**Example**:
```typescript
import { compile, CompilerLive } from '@eligius/dsl-compiler'
import { Effect, Layer } from 'effect'

const source = `
  timeline video from "video.mp4"
  event intro at 0..5 {
    show #title with fadeIn(500ms)
  }
`

const program = compile(source).pipe(
  Effect.tap((config) => Effect.log(`Compiled: ${JSON.stringify(config)}`)),
  Effect.tapError((error) => Effect.log(`Error: ${error.message}`))
)

const result = await Effect.runPromise(
  program.pipe(Effect.provide(CompilerLive))
)
```

### `compileFile`

Compile DSL file from filesystem.

**Signature**:
```typescript
export const compileFile: (
  filePath: string,
  options?: CompileOptions
) => Effect.Effect<EligiusConfig, CompileError | IOError, CompilerContext>
```

**Parameters**:
- `filePath`: Path to `.eli` file
- `options`: Optional compilation options

**Returns**: Effect with FileSystem dependency

**Example**:
```typescript
import { compileFile, MainLayer } from '@eligius/dsl-compiler'
import { Effect } from 'effect'

const program = compileFile('./src/presentation.eli')

const result = await Effect.runPromise(
  program.pipe(Effect.provide(MainLayer))
)
```

### `compileString`

Alias for `compile` for clarity.

**Signature**:
```typescript
export const compileString: typeof compile
```

## Compilation Options

```typescript
export type CompileOptions = {
  /** Skip optimization passes */
  readonly noOptimize?: boolean
  /** Include source maps in output */
  readonly sourcemap?: boolean
  /** Minify JSON output */
  readonly minify?: boolean
  /** Target Eligius version */
  readonly target?: "eligius-1.0" | string
  /** Source file name (for error reporting) */
  readonly filename?: string
}
```

**Defaults**:
```typescript
{
  noOptimize: false,
  sourcemap: false,
  minify: false,
  target: "eligius-1.0",
  filename: "input.eli"
}
```

## Error Handling

### Error Types

All errors are typed unions for pattern matching:

```typescript
export type CompileError =
  | ParseError
  | ValidationError
  | TypeError
  | TransformError
  | OptimizationError
  | EmitError
```

### Error Formatting

```typescript
export const formatError: (
  error: CompileError,
  source?: string
) => FormattedError

export const formatErrors: (
  errors: ReadonlyArray<CompileError>,
  source?: string
) => ReadonlyArray<FormattedError>
```

**Example**:
```typescript
import { compile, formatError } from '@eligius/dsl-compiler'
import { Effect } from 'effect'

const program = compile(source).pipe(
  Effect.mapError((error) => formatError(error, source))
)

const result = await Effect.runPromiseExit(program.pipe(Effect.provide(CompilerLive)))

if (result._tag === 'Failure') {
  const formatted = result.cause
  console.error(`${formatted.message} at ${formatted.location.line}:${formatted.location.column}`)
}
```

## Effect Services

The compiler requires Effect services for side effects.

### CompilerService

```typescript
export class CompilerService extends Context.Tag("Compiler")<
  CompilerService,
  {
    readonly compile: (source: string, options?: CompileOptions) => Effect.Effect<EligiusConfig, CompileError>
    readonly optimize: (ir: EligiusIR) => Effect.Effect<EligiusIR, never>
  }
>() {}
```

### FileSystemService

```typescript
export class FileSystemService extends Context.Tag("FileSystem")<
  FileSystemService,
  {
    readonly readFile: (path: string) => Effect.Effect<string, IOError>
    readonly writeFile: (path: string, content: string) => Effect.Effect<void, IOError>
  }
>() {}
```

### LoggerService

```typescript
export class LoggerService extends Context.Tag("Logger")<
  LoggerService,
  {
    readonly info: (msg: string) => Effect.Effect<void>
    readonly error: (msg: string) => Effect.Effect<void>
    readonly debug: (msg: string) => Effect.Effect<void>
  }
>() {}
```

### Layers

Pre-built layers for common scenarios:

```typescript
// Production layer with real implementations
export const CompilerLive: Layer.Layer<CompilerContext>

// Test layer with mocked services
export const CompilerTest: Layer.Layer<CompilerContext>

// Main layer composition (FileSystem + Logger + Compiler)
export const MainLayer: Layer.Layer<CompilerContext>
```

**Example**:
```typescript
import { compile, CompilerTest } from '@eligius/dsl-compiler'
import { Effect } from 'effect'

// Use test layer with mocked services
const result = await Effect.runPromise(
  compile(source).pipe(Effect.provide(CompilerTest))
)
```

## Advanced Usage

### Custom Layer

```typescript
import { CompilerService, FileSystemService, LoggerService } from '@eligius/dsl-compiler'
import { Effect, Layer } from 'effect'

// Custom logger that writes to file
const CustomLogger = Layer.succeed(LoggerService, {
  info: (msg) => Effect.sync(() => logToFile('info', msg)),
  error: (msg) => Effect.sync(() => logToFile('error', msg)),
  debug: (msg) => Effect.sync(() => logToFile('debug', msg))
})

// Compose with default layers
const CustomLayer = Layer.mergeAll(
  FileSystemLive,
  CustomLogger,
  CompilerLive
)

// Use custom layer
const result = await Effect.runPromise(
  compile(source).pipe(Effect.provide(CustomLayer))
)
```

### Pipeline Access

Access individual pipeline stages:

```typescript
import { parseSource, validateAST, transformAST, optimizeIR, emitJSON } from '@eligius/dsl-compiler'
import { pipe } from 'effect'

// Run pipeline stages individually
const program = pipe(
  parseSource(source),
  Effect.flatMap(validateAST),
  Effect.flatMap(transformAST),
  Effect.flatMap(optimizeIR),
  Effect.flatMap(emitJSON)
)
```

### Error Accumulation

Collect all errors instead of failing fast:

```typescript
import { compile } from '@eligius/dsl-compiler'
import { Effect } from 'effect'

const program = Effect.all([
  compile(source1).pipe(Effect.either),
  compile(source2).pipe(Effect.either),
  compile(source3).pipe(Effect.either)
])

const results = await Effect.runPromise(program.pipe(Effect.provide(CompilerLive)))

// results: Array<Either<CompileError, EligiusConfig>>
```

## Type Exports

```typescript
// IR Types
export type {
  EligiusIR,
  TimelineIR,
  EventIR,
  ActionIR,
  TimeExpression,
  TargetSelector
} from './types/eligius-ir'

// Config Types
export type {
  EligiusConfig,
  EligiusTimeline,
  EligiusEvent,
  EligiusAction
} from './types/eligius-config'

// Error Types
export type {
  CompileError,
  ParseError,
  ValidationError,
  TypeError,
  TransformError,
  FormattedError
} from './types/errors'

// Options
export type {
  CompileOptions
} from './compiler/pipeline'
```

## Performance Guarantees

Per technical context:
- **Typical source (<1000 lines)**: <500ms compilation
- **Large source (5000 lines)**: <2s compilation
- **Memory footprint**: <100MB during compilation

## Testing

The API must be tested with:
1. Unit tests for each pipeline stage
2. Integration tests with Effect.runPromise
3. Snapshot tests for JSON output
4. Error path tests for all error types
5. Custom layer tests

**Example Test**:
```typescript
import { compile, CompilerTest } from '@eligius/dsl-compiler'
import { Effect } from 'effect'
import { expect, test } from 'vitest'

test('compile simple timeline', async () => {
  const source = `
    timeline video from "test.mp4"
    event intro at 0..5 {
      show #title
    }
  `

  const result = await Effect.runPromise(
    compile(source).pipe(Effect.provide(CompilerTest))
  )

  expect(result.timeline.provider).toBe('video')
  expect(result.events).toHaveLength(1)
  expect(result.events[0].id).toBe('intro')
})
```

---

**Contract Version**: 1.0.0
**Status**: Defined
**Next**: Implement in `src/compiler/`
