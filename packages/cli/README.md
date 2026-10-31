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

### Check Many Files (`eligian check`)

Report **every** error and warning in a set of files, with their severities.
`compile` stops at the first error; `check` does not, and writes no output.

```bash
eligian check "examples/**/*.eligian"
eligian check src "!src/drafts/**" --max-warnings 0
eligian check "**/*.eligian" --format github   # GitHub Actions annotations
```

- **Patterns:** file names, directories (all `.eligian` files below them) and
  globs. Quote globs so the shell does not expand them. A pattern starting with
  `!` excludes files. `node_modules` is always skipped.
- **Imports:** imported libraries are loaded for linking even when they are not
  in the checked set. Library files in the set are checked too.
- **Compile errors:** programs without validation errors are also compiled, so
  errors only the compiler finds are reported as well.

| Option | Meaning |
|---|---|
| `--format pretty\|json\|sarif\|github` | Output format (default `pretty`). `sarif` is SARIF 2.1.0 for code scanning; `github` prints workflow commands that annotate pull requests. |
| `--max-warnings <n>` | Fail when there are more than `n` warnings. |
| `--warnings-as-errors` | Fail on any warning (same as `--max-warnings 0`). |

Exit codes: **0** clean (warnings within the limit), **1** errors or too many
warnings, **2** nothing matched or an invalid option.

`eligian <input>` is short for `eligian compile <input>`.

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
Usage: eligian [compile] [options] <input>
       eligian check [options] <patterns...>

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

> Note: a timeline is `timeline "<name>" in "<container>" using <provider>`.
> Timeline events are `at <start>..<end> <action>`, where `<action>` is either a
> custom action call or an inline endable block `[ start ops ] [ end ops ]`
> (built-in operations cannot be placed bare under `at`). CSS selectors and class
> names are validated against the CSS you import with `styles`, so that import is
> required for any example that selects elements or toggles classes.

### Video Annotation

```eligian
styles "./styles.css"   // must define #player, #title, #content, .visible

timeline "annotations" in "#player" using video from "presentation.mp4" {
  at 0s..5s [
    selectElement("#title")
    addClass("visible")
  ] []

  at 5s..10s [
    selectElement("#content")
    addClass("visible")
  ] [
    selectElement("#content")
    removeClass("visible")
  ]
}
```

Compile:
```bash
eligian video-annotation.eligian
```

### Presentation

```eligian
styles "./styles.css"   // must define #app, .slide-1, .slide-2, .active

timeline "slides" in "#app" using raf {
  at 0s..3s [
    selectElement(".slide-1")
    addClass("active")
  ] [
    selectElement(".slide-1")
    removeClass("active")
  ]

  at 3s..6s [
    selectElement(".slide-2")
    addClass("active")
  ] []
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

Example error output (an unknown CSS class, with a "did you mean?" suggestion):

```
Compilation failed:

Validation Error: Unknown CSS class: 'visble'. Did you mean: visible?
  at 6:14

  4 |   at 0s..5s [
  5 |     selectElement("#title")
> 6 |     addClass("visble")
                    ^^^^^^^^
  7 |   ] []
  8 | }
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
