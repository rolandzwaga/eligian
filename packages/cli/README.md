# eligian

**Eligian CLI** - Command-line compiler for the Eligian DSL.

Compile `.eligian` files to Eligius JSON configuration from the command line.

## Installation

```bash
npm install -g eligian        # the `eligian` command
npx eligian init my-talk      # or without installing
```

Requires Node.js 22.12 or later. A project can also add it as a dev dependency (`npm install -D eligian`); `eligian init` writes a `package.json` that does.

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
- **Eligius lint:** each program without errors is also checked by Eligius' own
  configuration lint (`eligius/lint`) as the engine would get it, and each finding
  is reported at its source line with the code `eligius-<rule>`, for example
  `eligius-E120` for `scrollToElement(200, "nowhere")` (not an allowed `block`).
  A finding in an imported library is reported in the library. W111 is left out:
  Eligian checks action parameters at every call. `--no-lint` skips it.
- **Review:** each compiled program is also reviewed for what neither the
  validation nor Eligius' lint can see, with warnings at the source:
  `controller-imbalance` (a timeline's `on enter` adds controllers that its
  `on leave` does not remove, or the other way round; the engine does not
  detach them on a timeline switch) and `class-never-removed` (an `addClass`
  that nothing in the same timeline removes again). `--no-review` skips it.
- **`--selector-not-in-layout <off|ids|all>`** (default `ids`): in a program
  that imports a `layout`, warn about selector ids (`ids`), or ids and classes
  (`all`), that the CSS defines but the layout HTML does not contain (the editor
  setting `eligian.validation.selectorNotInLayout`). `off` turns it off.

| Option | Meaning |
|---|---|
| `--format pretty\|json\|sarif\|github` | Output format (default `pretty`). `sarif` is SARIF 2.1.0 for code scanning; `github` prints workflow commands that annotate pull requests. |
| `--max-warnings <n>` | Fail when there are more than `n` warnings. |
| `--warnings-as-errors` | Fail on any warning (same as `--max-warnings 0`). |
| `--no-lint` | Skip the Eligius lint of the compiled programs. |
| `--no-review` | Skip the review pass (`controller-imbalance`, `class-never-removed`). |
| `--selector-not-in-layout off|ids|all` | Selectors in the CSS but not in the layout HTML (default `ids`). |

Exit codes: **0** clean (warnings within the limit), **1** errors or too many
warnings, **2** nothing matched or an invalid option.

`eligian <input>` is short for `eligian compile <input>`.

### Work in the Browser (`eligian dev`)

```bash
eligian dev examples/eligian-tour/tour.eligian --open
  [12:04:02] built in 505ms
  eligian dev examples/eligian-tour/tour.eligian → http://localhost:5180/ (Ctrl+C to stop)
  [12:04:31] tour.css changed → rebuilt in 351ms, styles swapped
  [12:04:40] presentation.eligian changed → rebuilt in 293ms, reloading 1 page
```

Serves the bundle (the same as `--bundle`) on `localhost` and rebuilds it when a file in the
entry's directory changes: the program, libraries, layout, styles, locales and media.

- A stylesheet change swaps the styles in place: the presentation keeps running.
- Any other change reloads the page, which resumes at the same timeline and position (and
  stays paused when it was paused).
- A build error shows as an overlay in the page (the same message as `eligian compile`) until
  the file is fixed.
- `--port <n>` (default 5180; the next free port is used when it is taken), `--open` opens the
  default browser. Media is served with Range requests, so video can seek.
- Only files under the entry's directory are watched.

### Play Every Timeline (`eligian smoke`)

```bash
eligian smoke examples/eligian-tour/tour.eligian
eligian smoke "examples/**/*.eligian" --strict --format github
```

Compiles each program and plays its timelines on the real Eligius engine in a headless
browser (jsdom): it switches to each timeline (`on enter`), seeks to every start and end time
(each event's start and end operations) and switches on (`on leave`). What fails at runtime is
reported at its `.eligian` source, with the timeline and the time:

```
tour.eligian
  timeline 'Logic': 7 positions FAIL (1)
  error  start operation selectElement (in boom): selectElement: selector is either empty or not defined.
         tour.eligian:3:17 — 'Logic' at 9s
```

- Reported: failing operations (also inside called and library actions), unhandled rejections
  and `console.error` output. `--strict` also reports `selectElement` selectors that match no
  element.
- `--format pretty` (default), `github` (annotations) or `json`. Exit code 1 when something
  failed or did not compile, 2 when no file matched.
- Library files are skipped (nothing to play), and so are video / audio timelines (jsdom plays
  no media). jsdom has no layout: scrolling, media playback and observers are no-ops, so what
  depends on sizes or positions is not checked.

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
- `--format github` also prints a GitHub Actions annotation per unformatted file,
  at its first changed line.
- Files with syntax errors are reported and left alone (exit code 2).
- The rules: one statement per line, 2-space indentation inside multi-line
  `[ ]` / `{ }` blocks (one-line blocks stay on one line), `] [` between start
  and end blocks, at most one blank line between entries, one space around
  operators and after keywords and commas, no space inside `( )` or around
  `..`, `5s` not `5 s`, `{ a: 1 }` and `["#a", "#b"]`.

### Use with coding agents (`eligian mcp`)

```bash
eligian mcp
```

Starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so a
coding agent (Claude Code, Cursor, VS Code Copilot agent mode, Codex) can learn Eligian and
check what it writes. The client starts the server; you do not run it yourself. Stdout carries
only protocol messages. Every tool call logs one JSON line (tool, duration, result size) to
stderr; set `ELIGIAN_MCP_LOG=<file>` to also append those lines to a file.

| Tool | What it does |
|---|---|
| `eligian_docs` | The curated knowledge: the index without arguments, cards by `ids`, full bodies with `detail: true`, a `query` search. Read-only. |
| `eligian_operations` | Operation lookup: NEEDS / PROVIDES / ERASES (the operation data each operation reads, writes and removes), parameters, the call form. Filters by name, category, `needs`, `provides`; `kind` lists controllers, timeline events, DOM events and keys; `path` adds a program's host operations. Read-only. |
| `eligian_check` | Every diagnostic of `eligian check` (compiler, Eligius lint, review pass), each with its fix: suggestions, a quick fix, the source excerpt and a docs overlay. Stricter defaults than the CLI: `lint`, `review`, `selectorNotInLayout: 'ids'`, `maxWarnings: 0`. Read-only. |
| `eligian_fmt` | Formats like `eligian fmt`: checks by default (a line diff per unformatted file), rewrites with `write: true`. |
| `eligian_init` | Writes a starter project like `eligian init`, plus `.mcp.json`, `AGENTS.md` and `CLAUDE.md` for agents (an existing agent file is never touched). |

The docs ship in the package (`node_modules/eligian/dist/docs`), so the server works offline.

**Setup.** Add `eligian` 1.1 or later to the project (`npm install -D eligian`), then register
the project-local install with your client. A direct `node` launch starts fastest (no `npx`
download, no shell wrapper). The path must be absolute; on Windows write it with backslashes
(`"C:\work\my-talk\node_modules\eligian\bin\cli.js"` in JSON).

Claude Code, `.mcp.json` in the project root (or
`claude mcp add eligian -s project -- node /abs/path/my-talk/node_modules/eligian/bin/cli.js mcp`):

```json
{
  "mcpServers": {
    "eligian": {
      "command": "node",
      "args": ["/abs/path/my-talk/node_modules/eligian/bin/cli.js", "mcp"]
    }
  }
}
```

Cursor, `.cursor/mcp.json`: the same `mcpServers` shape as above.

VS Code (Copilot agent mode), `.vscode/mcp.json`:

```json
{
  "servers": {
    "eligian": {
      "type": "stdio",
      "command": "node",
      "args": ["/abs/path/my-talk/node_modules/eligian/bin/cli.js", "mcp"]
    }
  }
}
```

Codex, `.codex/config.toml`:

```toml
[mcp_servers.eligian]
command = "node"
args = ["/abs/path/my-talk/node_modules/eligian/bin/cli.js", "mcp"]
```

Codex applies a project's own config only to trusted projects **[UNVERIFIED]**: if the server
does not show up, trust the project or add the table to your user config.

**Without a local install**, `npx` fetches the package: use `npx` as the command and
`-y eligian@^1.1 mcp` as the arguments, for example
`claude mcp add eligian -s project -- npx -y eligian@^1.1 mcp`. The first start downloads the
package, so it is slower. On native Windows:

- Claude Code (tested with 2.1.302) starts both plain `npx -y eligian@^1.1 mcp` and
  `cmd /c npx -y eligian@^1.1 mcp`.
- Cursor, VS Code and Codex: use `cmd` as the command and `/c npx -y eligian@^1.1 mcp` as the
  arguments. `npx` is a `npx.cmd` script on Windows, which a client that launches the command
  without a shell cannot start; `cmd /c` starts it from any client. Whether these three need the
  wrapper is **[UNVERIFIED]**. The direct `node` form above needs no wrapper anywhere.
- Running `claude mcp add … -- cmd /c …` from Git Bash: set `MSYS_NO_PATHCONV=1` first, or
  Git Bash rewrites `/c` into the path `C:/` and the server fails to start.

**Version.** The `mcp` command exists from 1.1.0. On a 1.0.x install, `eligian mcp` is taken
as `eligian compile mcp` (compile is the default command) and exits with an I/O error, so the
client reports a server that failed to start: upgrade to `eligian@^1.1`.

**Security.**

- A host module (`extensions "./host.ts" { … }`) is your own code and runs with your
  permissions wherever the presentation runs (`eligian dev`, `eligian smoke`, a `--bundle`).
  Review what an agent writes into it as you would any code it runs.
- The tools read and write only under the project root: the first root the client announces,
  else the server's working directory. A path or glob given to a tool that resolves outside it
  is refused (`not-found`, naming the root), and nothing outside is read.
- That restriction covers the paths given to the tools only. The files a program imports (CSS,
  HTML, locales, libraries) are resolved by the compiler under the language's own rules, which
  allow `../`, so a program inside the root may import a file outside it. `eligian_check` and
  `eligian check` report the same diagnostics for the same program.

## Options

```
Usage: eligian [compile] [options] <input>
       eligian check [options] <patterns...>
       eligian fmt [--check | --write] [--format text|github] <patterns...>
       eligian dev [--port <n>] [--open] <input>
       eligian smoke [--strict] [--format pretty|github|json] <patterns...>
       eligian init [dir] [--template blank|chapters|video|library] [--title <title>] [--force]
       eligian mcp

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
- **eligian** (`packages/extension`): VS Code extension for Eligian

## License

See LICENSE file in the root of the repository.
