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
eligian init my-talk --client claude --client cursor   # agent files for two clients
```

Writes a presentation that checks without errors (`main.eligian`), its `layout.html`,
`styles.css` and `locales.json` (with a two-language `languages` block), a `package.json` with
`check`, `build` and `fmt` scripts, a README, and the agent files (below). Templates:

| Template | What it shows |
|---|---|
| `blank` (default) | one timeline, timed events, play / pause buttons |
| `chapters` | a hub and two chapters: `on enter` / `on leave`, `navigate`, `on key`, labels |
| `video` | a timeline driven by a video, with captions. No video is written: until you add `media/intro.mp4`, `eligian check` reports one warning, `media-file-missing` |
| `library` | reusable actions in `lib/effects.eligian`, imported by the presentation |

Existing files are never overwritten unless you pass `--force`; the title defaults to the
directory name (`my-talk` → "My Talk"). VS Code: *Eligian: New Presentation…* writes the same
starters.

**Agent files.** For each `--client <claude|cursor|vscode|codex>` (repeatable, default
`claude`), `init` also writes that client's entry for the MCP server (`eligian mcp`, below) and
the instructions block, the files listed under *Set up agents*. The entry runs
`node <project>/node_modules/eligian/bin/cli.js mcp`, so run `npm install` before the agent
starts it. An agent file that exists already is merged, not overwritten, as by
`eligian agents setup`. `--no-agents` writes none.

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
  validation nor Eligius' lint can see, with warnings at the source.
  `--no-review` skips it.
  - `controller-imbalance`: a timeline's `on enter` adds controllers that its
    `on leave` does not remove, or the other way round (the engine does not
    detach them on a timeline switch).
  - `class-never-removed`: an `addClass` that nothing in the same timeline
    removes again.
  - `media-file-missing`: the `from` file of a `video` or `audio` timeline does
    not exist. `media-from-duplicate`: two media timelines name the same file.
  - `timeline-container-not-in-layout`: a timeline's `in` selector names an id or
    class that the imported layout HTML does not have.
  - `media-timeline-first-without-start-gesture`: the first timeline is a media
    timeline whose `on enter` has no `on click … play` or `toggle` (browsers
    block media that no user gesture started).
  - `entry-timeline-without-enter`: a program with two or more timelines whose
    first timeline has no `on enter`.
  - `host-operation-in-block-without-select`: a host operation runs with no
    element selected before it, in a timeline event, `on enter` / `on leave`,
    an init action or an event action.
  - `lottie-web-not-installed`: a `LottieController`, and no
    `node_modules/lottie-web` from the program's directory upward.
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
| `--no-review` | Skip the review pass. |
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
eligian smoke deck/main.eligian --determinism
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
- `--format pretty` (default), `github` (annotations), `json` (each problem with its `code`,
  such as `smoke-engine-error`) or `ndjson` (below). Exit code 1 when something failed or did
  not compile, 2 when no file matched or an option or the scenario is invalid.
- `--timeline <name>` plays only that timeline (repeatable; a name the program does not declare
  is a `smoke-unknown-timeline` error). `--step-timeout-ms <n>` is the longest one engine step
  may take (default 10000); a slower step is a `smoke-step-timeout` error.
- Library files are skipped (nothing to play). Video / audio timelines are played on a media
  clock that stands in for the media element (see Limits below). jsdom has no layout:
  scrolling and observers are no-ops, so what depends on sizes or positions is not checked.
- `--determinism` also checks that the DOM at every time depends only on the time, not on how
  the engine got there (below).

**`--format ndjson`** writes one JSON object per line as the run goes, and nothing else on
stdout (any other output goes to stderr): a `file` line before each file, then its `timeline`,
`problem` and `step` lines (each with the file's absolute path), and one `summary` line at the
end (`files`, `timelines`, `errors`, `warnings`). `eligian_smoke` reads this format.

#### Scenarios (`--scenario <file>`)

```bash
eligian smoke deck/main.eligian --scenario deck/keys.scenario.json
```

After the walk, the scenario is replayed on a fresh engine (`init`, then `start`, as the
presentation starts, with the program's CSS), then its assertions are checked. A scenario
applies to **one program file**: patterns that match more than one (libraries do not count)
are a usage error (exit 2), and nothing is played. The file is JSON,
`{ "steps": [...], "assertions"?: [...] }`; an unknown key, a malformed step or an invalid
assertion is a usage error that names it.

```json
{
  "steps": [
    { "snapshot": "start" },
    { "key": "ArrowRight" },
    { "click": "#next" },
    { "wait": 300 },
    { "snapshot": "third" }
  ],
  "assertions": [
    { "after": "start", "timeline": "slide-1" },
    { "after": "third", "timeline": "slide-3" },
    { "after": "third", "selector": "#counter", "text": "3 / 12" },
    { "after": "third", "selector": "#deck", "controllers": ["KeyboardController"] },
    { "after": "third", "selector": "#slide-1", "visible": false }
  ]
}
```

Steps (one kind per step):

| Step | What it does |
|---|---|
| `{ "seek": <s> }` | seeks the active timeline to `s` seconds |
| `{ "click": "<selector>" }` | a bubbling `click` on the first element the selector matches |
| `{ "key": "<key>", "in"?: "<selector>" }` | `keydown` then `keyup` with that `key`, sent to the `in` element, else to the first element with a `KeyboardController`, else to the document |
| `{ "navigate": "<timeline>" }` | switches to that timeline (by its source name) at 0 s |
| `{ "wait": <ms> }` | waits `ms` milliseconds of real time (raf timelines keep playing) |
| `{ "snapshot": "<label>" }` | does nothing; names the snapshot for the assertions |

After every step the run records the active timeline, the position and a snapshot of every
id in the layout HTML: `exists`, `classes`, `text` (trimmed, at most 200 characters), `style`,
`visible` (no `hidden` attribute and no `display: none`, `visibility: hidden` or `opacity: 0`
on the element or above it) and `controllers`, plus `activeTimelineActions`. The `step` lines
of `--format ndjson` carry them.

An assertion names the step it reads (`after`: a `snapshot` label or a step index) and checks
one or more fields:

- `selector` is one layout id, `#<id>`: assertions address layout ids, so a class or a compound
  selector is refused. `hasClass`, `notHasClass`, `text` (exact), `visible` and `controllers`
  (as a multiset: one name per attached controller) need it.
- `timeline`: the active timeline's source name.
- `position`: a number of seconds, `{ "sameAs": <step> }` or `{ "greaterThan": <step> }`
  (`<step>` is a label or an index, as in `after`). A number and `sameAs` pass within
  `POSITION_TOLERANCE_S`, 0.1 s; `greaterThan` is strict. The engine plays in real time, so put
  a `wait` of at least 300 ms before a `greaterThan`.
- `domEquals`: `{ "freshAt": <s> }` or `{ "linearAt": <s> }`, with no `selector`. Every layout
  id at the `after` step must equal the state a fresh engine reaches on the same timeline by a
  straight seek to `s` (`freshAt`) or by linear play to `s` (`linearAt`), compared as
  `--determinism` compares (`classes`, `text`, `style`, `visible`). For example
  `{ "after": "restarted", "domEquals": { "freshAt": 0 } }` after a click on a restart button.

Problems, each with the index of its step (the scenario goes on after them; every one is an
error, exit 1): `scenario-selector-not-found` (no element for a `click` or `in`, or an
assertion on an id the layout does not have), `scenario-unknown-timeline` and
`scenario-assertion-failed` (with the `expected` and `actual` values; a `domEquals` reports one
per differing element and property). Steps on video / audio timelines run on the media clock.

#### Determinism (`--determinism`)

```bash
eligian smoke main.eligian --determinism
```

The DOM of a presentation should be a function of the position: whatever the viewer did, the
page at 5 s should look the same. `--determinism` checks that, after the walk, for every
played timeline (video / audio included). Three fresh engines each switch to the timeline and
reach every start and end time by a different path:

- **linear**: seeks to every time in ascending order (what playing does to the DOM);
- **fresh**: a seek to 0 s, then straight to the time;
- **end-back**: a seek to the end of the timeline, then back to the time.

The state of every element of the layout HTML that has an id (not only those inside the
timeline's container) is compared at each time: its classes, its text, its `style` and whether
it is visible, with the program's CSS. Each difference is a `position-nondeterministic` error
(exit 1): one per class name for `classes`, one per property otherwise, reported once, at the
latest time where it shows, with the count of the further times where it recurs. It is located
at the event of that timeline that selects the element and whose range starts or ends nearest
before that time:

```
main.eligian
  timeline 'main': 4 positions FAIL (1)
  error  element #box: class 'in' present after linear play to 5s, absent after the fresh and end-back path (recurs at 2 more boundaries)
         main.eligian:6:3 — 'main' at 5s
```

Here `at 1s..3s [ selectElement("#box") addClass("in") ] []` adds a class that its end block
does not remove: an empty end block is the usual cause, and the fix is the inverse operation
there (`removeClass("in")`). A change made outside the timeline (a click handler, an event
action) is not a timeline's range and is not flagged. `--determinism` combines with
`--timeline`, `--scenario`, `--strict` and every format (`json` and `ndjson` carry the code);
it plays each timeline three more times, so pass `--timeline` for a subset of a long program.

#### Limits

- **Video and audio**: jsdom plays no media, so for the run a media clock stands in for every
  `<video>` / `<audio>` element. It models positions only: its duration is the compiled
  timeline's, the position changes only by a seek (the walk, a scenario `seek`) or by real time
  between `play()` and `pause()` (a scenario `wait`), and it fires the events the engine listens
  to (`loadedmetadata`, `canplay`, `seeking`, `seeked`, `playing`, `timeupdate`, `ended`). It
  reads no media file and decodes nothing: a missing or broken file still smokes clean (`eligian
  check` reports a missing one, `media-file-missing`), and codecs, the real duration, buffering
  and frames are not checked. There is no autoplay policy either: `play()` always succeeds, so a
  media timeline that a browser would block until the first user gesture plays here (`eligian
  check` warns when the entry timeline is such a timeline without a start control,
  `media-timeline-first-without-start-gesture`). Verify playback in a
  browser with `eligian dev`.
- **Lottie**: a program that attaches a `LottieController` does not smoke clean.
  `lottie-web` fails at import under smoke's jsdom (no canvas), and Eligius reports it as a
  missing peer dependency ("LottieController requires the optional peer dependency
  'lottie-web'") even when the package is installed: a `smoke-engine-error` on the attach, so the
  run exits 1. This is a known limit of smoke, not a defect of the program; verify Lottie
  in a browser with `eligian dev`.

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
| `eligian_compile` | The compiled Eligius JSON of a program, with the Eligian map back to the source. `view`: `summary` (timelines with their source names, durations and action counts, action names, operation counts, controllers, the JSON size), `fragment` (`select` one timeline, one named or event action, or the innermost action around a source `line`; each action with its source location) or `full` (the whole config). `includeMap: true` adds the map entries. A program with errors returns the same error diagnostics as `eligian_check`. `explain: true` adds, per returned operation, its JSON `path`, `systemName`, source location and `origin`: the construct that generated it (`source`, `call`, `target`, `with`, `erased-save`, `erased-restore`, `interaction`, `lifecycle`, `sequence`, `stagger`, …), and once per origin present the rule that produced it with the `eligian_docs` id to read; with `view: 'summary'` only the operation counts per origin. Read-only. |
| `eligian_project` | The inventory of a program, or of every program in a directory: CSS classes and ids, layout ids and classes, the selectors a program may use, locales (languages, keys), host names, asset problems (missing media and import files, media timelines sharing a file, containers missing from the layout), the files, the outline (timelines with their events at resolved times, actions with the role of each parameter, event actions, constants, named imports) and the STORYBOARD.md beats against the compiled timeline actions. Read-only. |
| `eligian_smoke` | `eligian smoke` with an optional scenario (inline steps, `{ steps, assertions }` or a scenario file) and extra `assertions`: each step's timeline, position and snapshot (concise: only what changed since the previous step), each problem with its source. `strict` is on by default. Runs `eligian smoke --format ndjson` in a child process; after `timeoutMs` (default 45000) the child is stopped and the result holds what was played, `partial: true`. `determinism: true` adds the `--determinism` check (about three times slower; pass `timelines` for a subset). Read-only. |
| `eligian_fmt` | Formats like `eligian fmt`: checks by default (a line diff per unformatted file), rewrites with `write: true`. |
| `eligian_init` | Writes a starter project like `eligian init`, plus the agent files of each `client` (default `claude`; `agents: false` writes none). Existing agent files are merged as by `eligian agents setup`. |

The docs ship in the package (`node_modules/eligian/dist/docs`), so the server works offline.

**Setup.** Add `eligian` 1.1 or later to the project (`npm install -D eligian`), then register
the project-local install with your client. A direct `node` launch starts fastest (no `npx`
download, no shell wrapper). The path must be absolute; on Windows write it with backslashes
(`"C:\work\my-talk\node_modules\eligian\bin\cli.js"` in JSON). `eligian agents setup` writes
the entries for you; the snippets after it show them by hand.

**Set up agents** (`eligian agents setup`, `eligian mcp --print-config`):

```bash
eligian agents setup                               # Claude Code, in the current directory
eligian agents setup my-talk --client cursor --client codex
eligian mcp --print-config vscode                  # print the entry; writes nothing
```

`eligian agents setup [dir] [--client <client>]...` writes, or merges into, the files of each
client (`claude`, `cursor`, `vscode`, `codex`; repeatable, default `claude`), and `AGENTS.md`
for every client:

| Client | Files |
|---|---|
| `claude` | `.mcp.json`, `CLAUDE.md` (the line `@AGENTS.md`) |
| `cursor` | `.cursor/mcp.json`, `.cursor/rules/eligian.mdc` |
| `vscode` | `.vscode/mcp.json`, `.github/copilot-instructions.md` (the marked block) |
| `codex` | `.codex/config.toml` |

- The entry runs `node` with the absolute path of `node_modules/eligian/bin/cli.js` when that
  exists in the current directory, else `npx -y eligian@^1.1 mcp` (on Windows, `cmd /c npx …`
  for every client but Claude Code).
- Merging changes only what is Eligian's: in a JSON file the `eligian` server key (other servers
  stay), in `config.toml` the `[mcp_servers.eligian]` table, in `AGENTS.md` and
  `copilot-instructions.md` the block between `<!-- eligian:begin -->` and
  `<!-- eligian:end -->`; `CLAUDE.md` gets the import line once. A second run changes nothing.
- A JSON file that does not parse is refused and left as it is (exit 1). Each file is reported
  as `written`, `updated`, `unchanged` or `refused`; an unknown client is exit 2.
- `eligian mcp --print-config <claude|cursor|vscode|codex>` prints the same server entry
  (JSON, or the TOML table for Codex) on stdout and starts no server.

**Which clients read `AGENTS.md`** (their documentation, checked 2026-11-05): all four.

- Claude Code (2.1.277 or later) reads it only when there is no `CLAUDE.md` or
  `CLAUDE.local.md` in the working directory or above, and some sessions cannot read it. The
  `CLAUDE.md` with `@AGENTS.md` works in every session and never loads it twice, so it is kept.
- Cursor reads it in the project root and in subdirectories.
- VS Code Copilot reads `.github/copilot-instructions.md` or `AGENTS.md`
  (`chat.useAgentsMdFile`, on by default).
- Codex reads the one in `~/.codex` and every one from the project root down to the working
  directory.

The `.cursor/rules` and Copilot files are therefore not required by those clients; they are
written anyway, from the same block.

**By hand.** Claude Code, `.mcp.json` in the project root (or
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
- The server never executes it. `eligian_smoke` is the only tool that runs a program, and it
  does so in the `eligian smoke` child process it starts, which also loads the host module;
  `eligian_compile`, `eligian_project` and `eligian_check` only read its declarations.
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
       eligian smoke [--strict] [--format pretty|github|json|ndjson] [--timeline <name>]...
                     [--step-timeout-ms <n>] [--scenario <file>] [--determinism] <patterns...>
       eligian init [dir] [--template blank|chapters|video|library] [--title <title>] [--force]
                    [--client <client>]... [--no-agents]
       eligian agents setup [dir] [--client <client>]...
       eligian mcp [--print-config <claude|cursor|vscode|codex>]

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
