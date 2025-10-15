# @eligian/language

**Eligian Language Support** - Langium-based language implementation for the Eligian DSL.

This package provides the core language infrastructure for Eligian, including:
- Grammar definition and parser
- Semantic validation
- Langium language services
- Compiler pipeline (AST transformation, type checking, optimization, emission)

## Overview

The Eligian DSL provides a concise, readable syntax for creating Eligius timeline-based presentations. This package implements the complete language toolchain from parsing to JSON generation.

## Features

- **Grammar & Parser**: Full Langium grammar for `.eligian` files
- **Semantic Validation**: Comprehensive validation rules (timeline requirements, time ranges, operation signatures)
- **Compiler Pipeline**: Effect-based transformation from AST to Eligius JSON
  - AST → IR transformation
  - Type checking
  - Optimization passes (dead code elimination, constant folding)
  - JSON emission
- **Operation Registry**: Complete validation of all 46 Eligius operations
- **Error Reporting**: Helpful error messages with source locations and hints

## Example

Input `.eligian` file:
```eligian
timeline raf {
  0..5: {
    selectElement("#title")
    addClass("visible")
  }
}
```

Output Eligius JSON:
```json
{
  "id": "...",
  "timelines": [{
    "type": "raf",
    "timelineActions": [{
      "duration": { "start": 0, "end": 5 },
      "startOperations": [
        { "systemName": "selectElement", "operationData": { "selector": "#title" } },
        { "systemName": "addClass", "operationData": { "className": "visible" } }
      ]
    }]
  }]
}
```

## Usage

### Programmatic API

```typescript
import { compile } from '@eligian/language';
import { Effect } from 'effect';

// Compile DSL source code
const compileEffect = compile(sourceCode, {
  optimize: true,
  minify: false
});

// Run with Effect
const config = await Effect.runPromise(compileEffect);
```

### Validation

```typescript
import { createEligianServices } from '@eligian/language';
import { NodeFileSystem } from 'langium/node';

const services = createEligianServices(NodeFileSystem);
const document = services.shared.workspace.LangiumDocuments.getDocument(uri);

// Validation errors available via Langium's validation system
const diagnostics = await services.shared.lsp.DiagnosticProvider.provideDiagnostics(document);
```

## Architecture

### Compiler Pipeline

1. **Parse**: Langium parses `.eligian` → AST
2. **Validate**: Semantic validation (timeline required, valid time ranges, operation signatures)
3. **Transform**: AST → Eligius IR (intermediate representation)
4. **Type Check**: Verify type constraints
5. **Optimize**: Apply optimization passes
6. **Emit**: Generate Eligius JSON configuration

### Directory Structure

```
src/
├── eligian.langium              # Grammar definition
├── eligian-module.ts            # Langium service configuration
├── eligian-validator.ts         # Semantic validation rules
├── compiler/
│   ├── pipeline.ts              # Main compilation orchestration
│   ├── ast-transformer.ts       # AST → IR transformation
│   ├── type-checker.ts          # Type checking
│   ├── optimizer.ts             # Optimization passes
│   ├── emitter.ts               # IR → JSON emission
│   ├── error-reporter.ts        # Error formatting
│   ├── operations/              # Operation registry & validation
│   │   ├── types.ts             # Operation type definitions
│   │   ├── registry.generated.ts # Generated operation registry
│   │   ├── validator.ts         # Operation validation
│   │   ├── mapper.ts            # Parameter mapping
│   │   └── index.ts             # Public API
│   └── types/
│       ├── eligius-ir.ts        # IR type definitions
│       ├── errors.ts            # Error types
│       └── common.ts            # Common types
└── __tests__/                   # Comprehensive test suite
```

## Testing

All compiler stages are comprehensively tested:

```bash
npm test
```

**Test Coverage**:
- 235 tests across all stages
- Grammar & parsing tests
- Semantic validation tests
- Compiler pipeline tests (transformer, type-checker, optimizer, emitter)
- Operation registry & validation tests
- Error reporter tests

## Development

### Build

```bash
npm run build
```

### Generate Grammar

```bash
npm run langium:generate
```

### Watch Mode

```bash
npm run watch
```

## Dependencies

- **Langium**: Language server protocol framework
- **Effect**: Functional effect system for the compiler
- **Eligius**: Target runtime library (peer dependency)

## Related Packages

- **@eligian/cli**: Command-line compiler
- **@eligian/vscode-extension**: VS Code extension

## License

See LICENSE file in the root of the repository.
