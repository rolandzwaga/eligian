# @eligian/cli

**Eligian CLI** - Command-line compiler for the Eligian DSL.

Compile `.eligian` files to Eligius JSON configuration from the command line.

## Installation

```bash
npm install -g @eligian/cli
```

## Usage

### Basic Compilation

Compile a single `.eligian` file:

```bash
eligian input.eligian
```

This generates `input.json` in the same directory.

### Specify Output File

```bash
eligian input.eligian -o output.json
```

### Output to Stdout

```bash
eligian input.eligian -o -
```

### Syntax Check Only

Check syntax without generating output:

```bash
eligian input.eligian --check
```

### Optimization & Minification

```bash
# Disable optimization
eligian input.eligian --no-optimize

# Minify output (no whitespace)
eligian input.eligian --minify
```

### Verbose Mode

```bash
eligian input.eligian --verbose
```

### Quiet Mode

Suppress success messages:

```bash
eligian input.eligian --quiet
```

## Options

```
Usage: eligian [options] <input>

Eligian DSL compiler - compile .eligian files to Eligius JSON

Arguments:
  input                input .eligian file

Options:
  -V, --version        output the version number
  -o, --output <file>  output file (default: <input>.json, use "-" for stdout)
  --check              syntax check only (do not generate output)
  --minify             minify JSON output (no whitespace)
  --no-optimize        disable optimization passes
  -v, --verbose        verbose logging
  -q, --quiet          suppress success messages
  -h, --help           display help for command
```

## Exit Codes

- **0**: Compilation successful
- **1**: Compilation error (syntax error, validation error, type error)
- **3**: I/O error (file not found, permission denied)

## Examples

### Video Annotation

```eligian
timeline video from "presentation.mp4" {
  0..5: {
    selectElement("#title")
    addClass("visible")
  }

  5..10: {
    selectElement("#content")
    fadeIn(1000)
  }
}
```

Compile:
```bash
eligian video-annotation.eligian
```

### Presentation

```eligian
timeline raf {
  0..3: {
    selectElement(".slide-1")
    addClass("active")
  }

  3..6: {
    selectElement(".slide-1")
    removeClass("active")

    selectElement(".slide-2")
    addClass("active")
  }
}
```

Compile with optimization:
```bash
eligian presentation.eligian
```

## Error Reporting

The CLI provides helpful error messages with:
- Source location (line and column)
- Code snippet showing the error
- Hints for fixing common issues

Example error output:

```
Compilation failed:

Parse Error: Expected timeline keyword
  at 1:1

> 1 | timelin raf {
    | ^^^^^^^
  2 |   0..5: {
  3 |     selectElement("#title")

💡 Did you forget to define a timeline? Every program needs exactly one timeline.
```

## Programmatic Usage

You can also use the compiler programmatically:

```typescript
import { compile } from '@eligian/language';
import { Effect } from 'effect';
import * as fs from 'node:fs/promises';

const sourceCode = await fs.readFile('input.eligian', 'utf-8');

const compileEffect = compile(sourceCode, {
  optimize: true,
  minify: false
});

const config = await Effect.runPromise(compileEffect);

await fs.writeFile('output.json', JSON.stringify(config, null, 2));
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Related Packages

- **@eligian/language**: Core language and compiler
- **@eligian/vscode-extension**: VS Code extension for Eligian

## License

See LICENSE file in the root of the repository.
