# @eligian/cli

**Eligian CLI** - Command-line compiler for the Eligian DSL.

Compile `.eligian` files to Eligius JSON configuration from the command line.

## Installation

```bash
npm install -g @eligian/cli
```

## Usage

### Start a Project (`eligian init`)

```bash
eligian init my-talk                      # blank starter in ./my-talk
eligian init my-talk --template chapters  # a hub with two chapters
eligian init . --template library --title "Product Tour"
```

Writes a presentation that checks without errors (`main.eligian`), its `layout.html`,
`styles.css` and `locales.json` (with a two-language `languages` block), a `package.json` with
`check`, `build` and `fmt` scripts, and a README. Templates:

| Template | What it shows |
|---|---|
| `blank` (default) | one timeline, timed events, play / pause buttons |
| `chapters` | a hub and two chapters: `on enter` / `on leave`, `navigate`, `on key`, labels |
| `video` | a timeline driven by a video, with captions (add `media/intro.mp4`) |
| `library` | reusable actions in `lib/effects.eligian`, imported by the presentation |

Existing files are never overwritten unless you pass `--force`; the title defaults to the
directory name (`my-talk` → "My Talk"). VS Code: *Eligian: New Presentation…* writes the same
starters.

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
- **`--selector-not-in-layout <off|ids|all>`:** also warn about selector ids
  (`ids`), or ids and classes (`all`), that the CSS defines but the layout HTML
  does not contain (the editor setting `eligian.validation.selectorNotInLayout`).

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

### Format Files (`eligian fmt`)

Format files with the rules of the editor's *Format Document* (whitespace only:
comments and code are kept).

```bash
eligian fmt "**/*.eligian"            # same as --check: list unformatted files with a diff
eligian fmt --write src               # rewrite them
```

- `--check` (the default) exits with 1 when a file is not formatted, so it can
  run in CI; `--write` rewrites the files. Patterns work as for `eligian check`.
- Files with syntax errors are reported and left alone (exit code 2).
- The rules: one statement per line, 2-space indentation inside multi-line
  `[ ]` / `{ }` blocks (one-line blocks stay on one line), `] [` between start
  and end blocks, at most one blank line between entries, one space around
  operators and after keywords and commas, no space inside `( )` or around
  `..`, `5s` not `5 s`, `{ a: 1 }` and `["#a", "#b"]`.

## Options

```
Usage: eligian [compile] [options] <input>
       eligian check [options] <patterns...>
       eligian fmt [--check | --write] <patterns...>
       eligian init [dir] [--template blank|chapters|video|library] [--title <title>] [--force]

Eligian DSL compiler - compile .eligian files to Eligius JSON

Arguments:
  input                input .eligian file

Options:
  -V, --version        output the version number
  -o, --output <file>  output file (default: <input>.json, use "-" for stdout)
  --check              syntax check only (do not generate output)
  --minify             minify JSON output (no whitespace)
  --no-optimize        disable optimization passes
  --eligian-map        also write <output>.eligian-map.json: every compiled action and
                       operation with its .eligian source location (for tools that
                       report Eligius runtime errors against the source)
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
