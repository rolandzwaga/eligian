# Storyboard — Chapter 8: The Command Line

> Teaches the **`eligian` CLI**, one beat per command: installing it (the two bins, `--version`, `--help`), `init`
> and its four starters, `compile` (the default command) with `-o`, `--check`, `--minify`, `--no-optimize`, `-q`,
> `-v`, `--bundle` with `--force`, `--sourcemap` and `--inline-threshold`, the `--eligian-map`, `check` with its
> patterns, `--max-warnings` and `--warnings-as-errors`, the four `check` formats and Eligius' configuration lint
> (`--no-lint`, `--selector-not-in-layout`), `smoke` (`--strict`, its formats), `dev` (`--port`, `--open`), `fmt`
> (`--check`, `--write`, its formats), and the exit codes 0 / 1 / 2 / 3.
> **Self-demonstration:** the terminal frames are a reenactment (a CSS-built mock terminal), but every line in them
> is real output of `node packages/cli/bin/cli.js` (eligian 1.0.1), run on the tour itself and on small scratch
> files. What plays for real is Chapter 04's tool: each beat's output lines appear one after another through a
> **real stagger** after the sequence.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapter 1 (see `chapter-01-timeline-and-time.md` §0): `#chc` is a
`section.view.chapter` inside `#stage` with its own `header.chrome` (back button `#cc-to-hub`, an 8-dot progress rail
with dot 8 current, the label `08 · The Command Line`), `section.code-pane` of pre-tokenized `pre#cc-code-*.code`
blocks, `section.effect-pane` of eleven `div#cc-fx-*.fx.term` terminal frames plus the done card `#cc-fx-done`, and a
`div.callout-layer` of `div#cc-cl-t1` … `#cc-cl-t11` chips. The shared `#narration` and `#progress` sit outside the
views. The view id and the `cc-` prefix are letters, not a number: the existing `#ch5` / `#ch6` keep their ids, and
the display number (08) follows the hub order.

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056). That includes every item of the eleven staggers: each `"#cc-out-…"` / `"#cc-cmd-…"` string
is validated against the layout.

**View management:** the chapter shows and hides its view only through its lifecycle blocks:
`on enter [ enterChapter("#chc") … ]` shows the view and the narration and attaches the ProgressbarController to
`#progress-fill`; `on leave [ leaveChapter("#chc", "#cc-to-hub") ]` hides them, resets the view (`resetChapter`:
removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it, so every output line is hidden
again) and removes every controller `on enter` attached (three KeyboardControllers on `#stage`, the back button's
listener, the ProgressbarController). The chapter attaches nothing else. Hub card `#card-chc` (and key `8`)
`navigate`s to `"The Command Line"`; the hub's `on leave` (`hubUnwire()`) removes that card's listener and the key's
KeyboardController with the others (eight keys, eight cards).

### Shared actions

Reuses the library unchanged (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`, and the
chapter skeleton's `enterChapter`, `replayChapter`, `leaveChapter`; table in `chapter-01-timeline-and-time.md` §0).
**No chapter-local actions:** there is no CLI at runtime to drive; every frame and line is a class (`demo` adds
`.active` to a frame, the staggers add `.in` to its lines).

### Effect-pane motif: a mock terminal

One frame per beat, `div#cc-fx-<beat>.fx.term` (`install`, `init`, `compile`, `bundle`, `map`, `check`, `formats`,
`smoke`, `dev`, `fmt`, `exit`), revealed by `demo()` like any `.fx` panel:

```html
<div id="cc-fx-check" class="fx term">
  <div class="term-titlebar">eligian — bash</div>
  <div class="term-body">
    <div class="term-line cmd typing"><span class="term-prompt">$</span> eligian check demo.eligian --max-warnings 0</div>
    <div id="cc-out-check-1" class="term-line out"><u>demo.eligian</u></div>
    …
    <div id="cc-cmd-check-2" class="term-line cmd later"><span class="term-prompt">$</span> eligian check examples/eligian-tour --max-warnings 0</div>
    <div id="cc-out-check-6" class="term-line out"><span class="ok">2 files, 0 errors, 0 warnings</span></div>
    <div id="cc-cmd-check-3" class="term-line cmd later"><span class="term-prompt">$</span> <span class="term-caret"></span></div>
  </div>
</div>
```

The classes live in the `/* ---- Mock terminal ---- */` section of `tour.css`, right after the Mock IDE section
(`.fx.ide, .fx.term` share the rule that resets `.fx`'s centring and padding):

| Class | Purpose |
|---|---|
| `.term` | the frame: `#0b0f14`, 1px `#30363d` border, radius 8, monospace 0.8rem, left-aligned |
| `.term-titlebar` | muted title strip (`eligian — bash`) |
| `.term-body`, `.term-line` | the session; one `div` per line, `white-space: pre-wrap`, an empty line keeps its height |
| `.term-line.cmd`, `.term-prompt` | a command line; the `$` in the accent. The beat's **first** command carries a static `typing` (`clip-sweep`, 0.9 s): it types as the frame appears. Every later command is `.term-line.cmd.later` with an id (`#cc-cmd-<beat>-<n>`, n from 2), hidden like an output line and typed by its own `.term-line.cmd.later.in { opacity: 1; animation: clip-sweep 0.9s … }` when the stagger reaches it |
| `.term-line.out` | an output line (`#cc-out-<beat>-<n>`), `opacity: 0` until its own `.term-line.out.in { opacity: 1 }` (0.15 s). The shared one-class `.in` loses to the two-class hidden state and would reveal nothing (the state-class rule of `tour.css`) |
| `.ok` (green `#3fb950`), `.err` (red `#f85149`), `.warn` (yellow `#d29922`), `.dim` (muted), `.cyan` (`#39c5cf`), `u` | the chalk colours the CLI prints, scoped as `.term .ok` etc.; `u` is the underlined file name of `check` |
| `.term-caret` | the block cursor on the beat's last prompt; `caret-blink` (shared with the Mock IDE), off under `prefers-reduced-motion` |

A `…` line (`.dim`) marks lines left out of a long output; every other line is the tool's, byte for byte (HTML
escaped).

---

## 1. Segment beats

The beats play on the raf clock; `space` pauses and resumes, `r` replays the chapter (`replayChapter`: reset the
view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap + code block + spotlight +
callout + terminal frame; the frame's first command types at once, its other lines follow through the beat's stagger.
The chapter is one sequence of labelled items, then eleven staggers and the end card:

```eligian
timeline "The Command Line" in "#stage" using raf {
  on enter [
    enterChapter("#chc")
    on click "#cc-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#chc")
  ]
  on leave [
    leaveChapter("#chc", "#cc-to-hub")
  ]

  sequence each [ clearSpots() ] {
    for 7s as t1 [ … ]         // beat 1
    for 8s as t2 [ … ]
    …
    for 7s as t11 [ … ]        // beat 11
  }

  stagger 250ms [
    "#cc-out-check-1",
    …
    "#cc-cmd-check-3"
  ] at t6.start + 1.5s for 5.5s [
    selectElement(@@item)
    addClass("in")
  ]
  … // one stagger per beat

  at t11.start + 5s for 2s [ demo("#cc-fx-done") ]
}
```

7+8+8+8+7+9+8+9+8+8+7 = **87 s**, the timeline's duration, which the ProgressbarController reads. The labels `t1` …
`t11` are scoped to this timeline. Each stagger's item list is its frame's output lines and later commands in display
order (a second command types only after the first one's output), starting 1.5 s into the beat, 250 ms apart. The end
block is left out (`resetChapter` clears `.in` on leave and replay); the `for` only sets each item's end, chosen so
the last item ends by the beat's end (2.5 / 4 / 1.5 / 4 / 4 / 5.5 / 1.5 / 3 / 4 / 2 / 2.5 s), which keeps the
timeline at 87 s.

Scratch files (outside `examples/`, with copies of `layout.html` and `tour.css`), quoted by name in the frames:

```eligian
// demo.eligian (beat 6)
layout "./layout.html"
styles "./tour.css"
timeline "T" in "#stage" using raf {
  on enter [ on clik "#hub" play ]
}
```

```eligian
// contract.eligian (beat 7)
layout "./layout.html"
styles "./tour.css"
action highlight(selector) [ addClass("in") ]
timeline "T" in "#stage" using raf {
  at 0s..1s highlight("#hub")
}
```

`brace.eligian` (beat 3) is `layout` + `styles` + `action intro() [ selectElement("#hub") addClass("in") ]` +
`timeline "T" in "#stage" using raf {` / `  at 0s..5s { intro() }` / `}`; `jump.eligian` (beats 7, 11) is `layout` +
`styles` + `action jump() [ selectElement("#hub") scrollToElement("smooth", "nowhere") ]` + a timeline with
`at 0s..1s jump()`; `boom.eligian` (beat 8) is `layout` + `styles` +
`action boom() [ selectElement($globaldata.nowhere) addClass("in") ]` + `timeline "Logic" … { at 9s..10s boom() }`;
`u.eligian` (beat 10) is `layout "./l.html"` / `styles "./s.css"` / `action f( selector:string )[` /
`selectElement(selector)` / `  addClass( "on" )` / `]`.

### Beat 1 — install (0–7 s, `as t1`)

- **Narration:** "The compiler is also a command: eligian on npm, Node 22.12 or later. Install it, or run it once with
  npx."
- **Code** `#cc-code-install`: `npm install -g eligian` / `npx eligian init my-talk` / `eligian --version` /
  `# also installed as eligian-cli`.
- **Spot / callout:** `#cc-tok-install` (the package name); `#cc-cl-t1` "two bins: eligian and eligian-cli ·
  -V / --version · -h / --help · help [command]".
- **Frame** `#cc-fx-install`: `$ npm install -g eligian` → `added 53 packages in 19s` / `` / `13 packages are looking
  for funding` / `  run `npm fund` for details` · `$ eligian --version` → `1.0.1` · `$ eligian --help` →
  `Usage: eligian [options] [command]` / `…` / `` `eligian <input>` is short for `eligian compile <input>`. `` /
  `Run 'eligian <command> --help' (compile, check, fmt, smoke, dev, init) for its options.`
- **Source:** npm's output of `npm install -g eligian --prefix <scratch dir>` (eligian 1.0.1 from the registry; the
  package count and time are that run's); `packages/cli/package.json` (`bin`: `eligian`, `eligian-cli`;
  `engines.node`: `>=22.12.0`), `main.ts` (help text).

### Beat 2 — init (7–15 s, `as t2`)

- **Narration:** "eligian init writes a starter that already checks clean: blank, chapters, video or library, with
  layout, styles, locales, a package.json and a README."
- **Code** `#cc-code-init`: `eligian init my-talk --template chapters` /
  `eligian init . --template library --title "Product Tour"` / `# blank · chapters · video · library`.
- **Spot / callout:** `#cc-tok-init` (`--template`); `#cc-cl-t2` "-t / --template · --title (default: from the
  directory name) · --force overwrites".
- **Frame** `#cc-fx-init`: `$ eligian init my-talk --template chapters` → `Created my-talk/ (Chapters starter):
  package.json, README.md, main.eligian, layout.html, styles.css, locales.json` / `` / `Next:` / `  cd my-talk` /
  `  eligian check main.eligian` / `  open the folder in VS Code and run "Eligian: Preview Timeline" (Ctrl+K V)` ·
  `$ eligian init my-talk` (red) → `Not overwriting existing files in my-talk/: package.json, README.md,
  main.eligian, layout.html, styles.css, locales.json` / `Use --force to overwrite them.` (exit 1).
- **Source:** `init.ts`, `packages/language/src/starters/starters.ts`. Every starter writes `locales.json` (blank and
  video too; library adds `lib/effects.eligian`).

### Beat 3 — compile (15–23 s, `as t3`)

- **Narration:** "eligian file.eligian compiles to Eligius JSON next to the file. Dash o picks the output, dash for
  stdout; --check only validates; --minify, --no-optimize, -q and -v adjust the rest."
- **Code** `#cc-code-compile`: `eligian tour.eligian  # → tour.json` / `eligian tour.eligian -o -  # JSON to stdout` /
  `eligian tour.eligian --check  # validate only` / `eligian tour.eligian --minify --no-optimize -q` /
  `eligian compile tour.eligian -v  # the explicit form; -v adds progress lines`.
- **Spot / callout:** `#cc-tok-compile` (`-o -`); `#cc-cl-t3` "-o - writes the JSON to stdout · eligian file is short
  for eligian compile file".
- **Frame** `#cc-fx-compile`: `$ eligian examples/eligian-tour/tour.eligian` → `✓ Compiled
  examples/eligian-tour/tour.eligian → examples/eligian-tour/tour.json` (green) ·
  `$ eligian examples/eligian-tour/tour.eligian --check` → `✓ examples/eligian-tour/tour.eligian is valid` ·
  `$ eligian brace.eligian` → `` / `Parse failed:` (red) / `` / `Parse Error: Expected an action or operation call,
  or a [ … ] block here, but found '{'.` / `  at 5:13` / `` / the code frame `  3 | …` to `  7 |` with the `^` under
  the `{` / `` / `💡 Actions are defined inside square brackets: [ operation1() operation2() ]` (yellow) / ``.
- **Source:** `main.ts` (compile action), `compile-file.ts`, `error-reporter.ts`.

### Beat 4 — bundle (23–31 s, `as t4`)

- **Narration:** "--bundle writes a standalone presentation: index.html, bundle.js, your assets, small images
  inlined, only the Eligius pieces you use. --force overwrites, --sourcemap and --inline-threshold tune it."
- **Code** `#cc-code-bundle`: `eligian tour.eligian --bundle  # → tour.bundle/` /
  `eligian tour.eligian --bundle -o site --force` / `eligian tour.eligian --bundle --sourcemap --inline-threshold 8192`.
- **Spot / callout:** `#cc-tok-bundle`; `#cc-cl-t4` "next to the input as tour.bundle/, or -o a directory ·
  --inline-threshold in bytes (51200 by default)".
- **Frame** `#cc-fx-bundle`: `$ eligian examples/eligian-tour/tour.eligian --bundle` → `✓ Bundle created:
  examples/eligian-tour/tour.bundle` / `  Files: 2` / `  Size: 1205.2 KB` / `  Time: <n>ms` (grey) · the same again →
  `` / `Bundle failed: Output directory already exists: examples/eligian-tour/tour.bundle. Use --force to overwrite.`
  (red) · `$ eligian examples/eligian-tour/tour.eligian --bundle --check` → `Error: --bundle and --check cannot be
  combined: --check validates only and writes no output, but --bundle always writes a bundle directory`.
- **Re-captured in WP-11:** `Size` and `Time` depend on the finished tour (this chapter's own layout is in the bundle);
  the values in the frame are those of the run that built this chapter.
- **Source:** `bundler/index.ts`, `bundler/runtime-bundler.ts` (`extractUsedOperations`), `cli-options.ts`.

### Beat 5 — the eligian map (31–38 s, `as t5`)

- **Narration:** "--eligian-map also writes the map from every compiled action and operation back to its source line —
  the same map the preview and smoke build in memory to point at the failing operation, written to a file for your
  own tools."
- **Code** `#cc-code-map`: `eligian tour.eligian --eligian-map  # + tour.eligian-map.json` /
  `# not with --bundle, not with -o -`.
- **Spot / callout:** `#cc-tok-map`; `#cc-cl-t5` "compiled actions and operations → .eligian source locations" (the
  option's help text).
- **Frame** `#cc-fx-map`: `$ eligian examples/eligian-tour/tour.eligian --eligian-map` → `✓ Compiled … →
  examples/eligian-tour/tour.json` / `✓ Eligian map → examples/eligian-tour/tour.eligian-map.json` ·
  `… --eligian-map -o -` → `Error: --eligian-map needs an output file (it is written next to it), not '-o -'` ·
  `… --bundle --eligian-map` → `Error: --eligian-map applies to JSON output, not to --bundle`.
- **Source:** `cli-options.ts`, `compiler/eligian-map.ts`.

### Beat 6 — check (38–47 s, `as t6`)

- **Narration:** "eligian check reports every error and warning of many files — globs, directories, exclusions — and
  fails on warnings when you tell it to."
- **Code** `#cc-code-check`: `eligian check "examples/**/*.eligian" --max-warnings 0` /
  `eligian check src "!src/drafts/**" --warnings-as-errors`.
- **Spot / callout:** `#cc-tok-check` (`"!src/drafts/**"`); `#cc-cl-t6` "patterns: files, directories, globs,
  !excludes; node_modules skipped".
- **Frame** `#cc-fx-check`: `$ eligian check demo.eligian --max-warnings 0` → `demo.eligian` (underlined) /
  `  4:17  warning  'clik' is not a known DOM event. Did you mean: 'click'?  unknown_dom_event` / `` /
  `1 file, 0 errors, 1 warning` (yellow) / `Too many warnings: 1 (maximum 0)` (red, exit 1) ·
  `$ eligian check examples/eligian-tour --max-warnings 0` → `2 files, 0 errors, 0 warnings` (green).
- **Source:** `check/check-command.ts` (patterns, `ignore: ['**/node_modules/**', …]`), `check/reporters.ts`.

### Beat 7 — check formats + lint (47–55 s, `as t7`)

- **Narration:** "Four output formats: pretty, json, sarif for code scanning, github for pull-request annotations.
  Eligius' own configuration lint runs too unless --no-lint; --selector-not-in-layout adds the layout check."
- **Code** `#cc-code-formats`: `eligian check "**/*.eligian" --format github` /
  `eligian check src --format sarif > eligian.sarif` / `eligian check src --no-lint --selector-not-in-layout ids`.
- **Spot / callout:** `#cc-tok-formats` (`--format`); `#cc-cl-t7` "sarif 2.1.0 · github workflow commands".
- **Frame** `#cc-fx-formats`: `$ eligian check contract.eligian --format github` →
  `::error file=contract.eligian,line=5,col=13,endLine=5,endColumn=22,title=missing-action-dependency::Action
  'highlight' requires 'selectedElement' (used by addClass in 'highlight'), which is not available here - ensure it is
  created before calling 'highlight' (for example with selectElement)` / `1 file, 1 error, 0 warnings` ·
  `$ eligian check contract.eligian --format json` → `{` / `  "files": [` / `…` / `  "summary": {` /
  `    "files": 1,` / `    "errors": 1,` / `    "warnings": 0,` / `    "infos": 0,` / `    "hints": 0` / `  }` / `}` ·
  `$ eligian check jump.eligian` → `jump.eligian` / `  3:39  error    scrollToElement: 'block' must be one of
  'start', 'center', 'end', 'nearest', got 'nowhere'. (Eligius lint at
  actions[0].startOperations[1].operationData.block)  eligius-E120` / `` / `1 file, 1 error, 0 warnings` (the lint
  finding is an error, so it fails the check; `--no-lint` gives `1 file, 0 errors, 0 warnings`).
- **Source:** `check/reporters.ts` (pretty, json, sarif `2.1.0`, github), `check/lint.ts`, Eligius' `eligius/lint`
  (rule E120).

### Beat 8 — smoke (55–64 s, `as t8`)

- **Narration:** "eligian smoke plays every timeline headlessly on the real engine: enter, every start and end, leave —
  and reports what fails at its source line. --strict also flags selectors that match nothing."
- **Code** `#cc-code-smoke`: `eligian smoke examples/eligian-tour` /
  `eligian smoke "examples/**/*.eligian" --strict --format github`.
- **Spot / callout:** `#cc-tok-smoke` (`--strict`); `#cc-cl-t8` "--strict: selectElement selectors that match no
  element · --format pretty, github or json".
- **Frame** `#cc-fx-smoke`: `$ eligian smoke examples/eligian-tour` →
  `examples/eligian-tour/presentation.eligian (library: nothing to play)` / `examples/eligian-tour/tour.eligian` /
  `  timeline 'Hub': 1 position ok` / `  timeline 'Timeline & Time': 9 positions ok` / `  timeline 'Actions': 9
  positions ok` / `  timeline 'Logic': 13 positions ok` / `  timeline 'Timeline Power Tools': 19 positions ok` /
  `  timeline 'Files & Imports': 9 positions ok` / `  timeline 'Engine Reach': 10 positions ok` /
  `  timeline 'The Editor': 45 positions ok` / `  timeline 'The Command Line': 254 positions ok` /
  `2 files, 9 timelines played, 0 errors, 0 warnings` · `$ eligian smoke boom.eligian` → `boom.eligian` /
  `  timeline 'Logic': 3 positions FAIL (1)` / `  error  start operation selectElement (in boom): selectElement:
  selector is either empty or not defined.` / `         boom.eligian:3:17 — 'Logic' at 9s` /
  `1 file, 1 timeline played, 1 error, 0 warnings` (exit 1).
- **Re-captured in WP-11:** the tour's timeline lines and counts (the finished tour). This chapter's 254 positions are
  its eleven staggers' starts and ends.
- **Source:** `smoke/` (`smoke-command.ts`).

### Beat 9 — dev (64–72 s, `as t9`)

- **Narration:** "eligian dev serves the bundle and rebuilds on every change: a CSS edit swaps styles in place,
  anything else reloads and resumes at the same position. Build errors show as an overlay."
- **Code** `#cc-code-dev`: `eligian dev tour.eligian --open` / `eligian dev tour.eligian --port 4000`.
- **Spot / callout:** `#cc-tok-dev`; `#cc-cl-t9` "only files under the entry's directory are watched · a taken --port
  moves to the next free one".
- **Frame** `#cc-fx-dev`: `$ eligian dev examples/eligian-tour/tour.eligian` → `[hh:mm:ss] built in <n>ms` /
  `eligian dev examples/eligian-tour/tour.eligian → http://localhost:5180/ (Ctrl+C to stop)` /
  `[…] tour.css changed → rebuilt in <n>ms, styles swapped` /
  `[…] presentation.eligian changed → rebuilt in <n>ms, reloading 1 page` /
  `[…] tour.eligian changed → build failed (<n>ms):` / `  Parse Error: Expected an action or operation call, or a
  [ … ] block here, but found '{'.` / `    at 207:27` / `…` / `  Hint: Actions are defined inside square brackets:
  [ operation1() operation2() ]` / `[…] tour.eligian changed → rebuilt in <n>ms, reloading 1 page`.
- **Illustrative:** the clock times and build times are those of the capture run. The run had one page connected to
  the event stream (hence `reloading 1 page`), edited `tour.css`, then `presentation.eligian`, then turned beat 1's
  `[` of `tour.eligian` (line 207) into a `{` and back. It ran without `--open` (no browser opened); `--open` adds
  nothing to the log.
- **Source:** `dev/dev-server.ts` (`build`, `listen`: the next free port, up to 10 further; `watch(root, recursive)`
  with `root` the entry's directory), `main.ts` (the `[hh:mm:ss]` prefix, the URL line).

### Beat 10 — fmt (72–80 s, `as t10`)

- **Narration:** "eligian fmt checks formatting — whitespace only, the editor's Format Document rules — and --write
  applies it. CI runs it on every example."
- **Code** `#cc-code-fmt`: `eligian fmt "examples/**/*.eligian"  # --check is the default` /
  `eligian fmt --write src` / `eligian fmt --format github "**/*.eligian"`.
- **Spot / callout:** `#cc-tok-fmt` (`--write`); `#cc-cl-t10` "--format text or github · a file with syntax errors is
  left alone (exit 2)".
- **Frame** `#cc-fx-fmt`: `$ eligian fmt u.eligian` → `u.eligian` / `@@ line 2` / `  styles "./s.css"` /
  `- action f( selector:string )[` / `- selectElement(selector)` / `-   addClass( "on" )` / `+ ` /
  `+ action f(selector: string) [` / `+   selectElement(selector)` / `+   addClass("on")` / `  ]` / `` /
  `1 file would be reformatted (run 'eligian fmt --write')` (exit 1) · `$ eligian fmt --write u.eligian` →
  `Formatted u.eligian` / `1 file formatted` · `$ eligian fmt examples/eligian-tour` → `All 2 files formatted`.
- **Source:** `fmt.ts`, `packages/language/src/lsp/format-rules.ts`; `.github/workflows/ci.yml` (*Format examples*).

### Beat 11 — exit codes (80–87 s, `as t11`)

- **Narration:** "Exit codes you can script on: 0 clean, 1 findings or a failed compile, 2 usage errors of check,
  smoke, fmt, dev and init, 3 I/O. The repo's CI checks, plays and format-checks every example this way. Hub."
- **Code** `#cc-code-exit`: `0  success, clean` / `1  errors · too many warnings · smoke failures · unformatted files ·
  init conflicts · a failed compile · compile option errors (--bundle --check, --eligian-map -o -,
  --inline-threshold)` / `2  no files matched · invalid --format, --max-warnings, --port, --template or
  --selector-not-in-layout · fmt syntax errors` / `3  I/O error · refusing to overwrite the source` / `` /
  `pnpm run check:examples && pnpm run smoke:examples && pnpm run fmt:examples`.
- **Spot / callout:** `#cc-tok-exit` (the `2`); `#cc-cl-t11` "commander's own usage errors (a missing argument, an
  unknown option) exit 1".
- **Frame** `#cc-fx-exit`: `$ eligian check "nothing/**"` → `No files matched: nothing/**` · `$ echo $?` → `2` ·
  `$ eligian init x --template bogus` → `Unknown template 'bogus'. Use one of: blank, chapters, video, library` ·
  `$ echo $?` → `2` · `$ eligian jump.eligian -o jump.eligian` → `Output path 'jump.eligian' is the same as the input
  file; refusing to overwrite.` · `$ echo $?` → `3`. At +5 s the done card `#cc-fx-done` "Chapter 8 ✓ — the whole
  toolchain".
- **Source:** `main.ts`, `init.ts`, `fmt.ts`, `check/check-command.ts`; each code checked by a run (also: an invalid
  `--format` of check / smoke / fmt, `--max-warnings x`, `--selector-not-in-layout some`, `--port abc`, a fmt syntax
  error and `No .eligian files match …` of smoke / fmt exit 2; a missing input file exits 3; `eligian check` without
  patterns and an unknown option exit 1).

---

## 2. What this chapter must prove (acceptance)

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass; `smoke`
   reports `timeline 'The Command Line': 254 positions ok`, and the compiled timeline's duration is 87 s.
2. The controller-balance test (`tour-controllers.spec.ts`) passes: the chapter attaches only the skeleton's
   controllers, and the hub's eight keys and eight cards are all removed by `hubUnwire()`.
3. **Every output line is verbatim**: equal to a run of `node packages/cli/bin/cli.js` (eligian 1.0.1) on the tour or
   on the scratch files of §1 (npm's lines: a real `npm install -g` into a scratch prefix). Lines left out are marked
   `…`; the illustrative parts are only the times of beats 1, 4 and 9.
4. Every CLI command, option and exit code (`eligian <command> --help`, eligian 1.0.1) points at a beat that shows
   it: bins / `--version` / `--help` / `help` (1), `init` and its options (2), `compile` and `-o` / `--check` /
   `--minify` / `--no-optimize` / `-v` / `-q` (3), `--bundle` / `--inline-threshold` / `--sourcemap` / `--force` (4),
   `--eligian-map` (5), `check` patterns / `--max-warnings` / `--warnings-as-errors` (6), `--format` / `--no-lint` /
   `--selector-not-in-layout` (7), `smoke` (8), `dev` (9), `fmt` (10), exit codes (11).
5. The hub shows eight cards; key `8` and `#card-chc` open the chapter.
6. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit: every output line hidden again.

## 3. Verification notes and how to re-verify

The strings drift when the CLI changes; after a bump, re-run the commands of §1 (scratch files in the OS temp dir,
never under `examples/`, or `check:examples` picks them up; the tour commands on a copy of the tour, so `--bundle`
and `--eligian-map` write nothing into the repo). The chapter was built by a throwaway script that ran every command
with `FORCE_COLOR=1`, stdout and stderr on one descriptor (their real order), and turned chalk's colours into the
`.ok` / `.err` / `.warn` / `.dim` / `.cyan` / `u` spans; the `dev` lines came from a run with one connected page.

| Beat | Re-capture with |
|---|---|
| 1 | `eligian --version`, `eligian --help`; npm's lines from `npm install -g eligian --prefix <temp>` |
| 2 | `eligian init my-talk --template chapters` twice, in an empty temp dir |
| 3, 5 | the commands on a tour copy; `brace.eligian` |
| 4 | `--bundle` on a tour copy (delete `tour.bundle` first), then again, then `--bundle --check` |
| 6, 7, 11 | `eligian check` on `demo.eligian`, `contract.eligian`, `jump.eligian`; the exit codes with `echo $?` |
| 8 | `eligian smoke` on a tour copy and on `boom.eligian` |
| 9 | `eligian dev` on a tour copy, with a client on `/__eligian/events` and the three edits of §1 |
| 10 | `eligian fmt` / `fmt --write` on `u.eligian`, `fmt` on the tour |

Notes and findings (recorded, not changed here):
- The three commands' format lists differ, and the chapter shows them as they are: `check` `pretty | json | sarif |
  github`, `smoke` `pretty | github | json`, `fmt` `text | github`.
- commander's own usage errors (a missing argument, an unknown option) exit 1, not 2: `error: missing required
  argument 'patterns'`, `error: unknown option '--frobnicate'`.
- `-v` adds two lines to a compile (`Compiling examples/eligian-tour/tour.eligian...`, `✓ Validated 6 asset(s)`), not
  a line per step; the code comment says "adds progress lines".
- `--bundle --eligian-map` is refused too (`Error: --eligian-map applies to JSON output, not to --bundle`); the frame
  shows it after `-o -`.
- In `--format github` the summary line `1 file, 1 error, 0 warnings` is printed as well (stdout), after the
  annotations.
- `eligian fmt` on a single formatted file prints `All 1 file formatted`.
- Smoke positions: each stagger item is its own event (start and end), so this chapter has 254 positions; the compiled
  timeline has 161 timeline actions (11 sequence items, 148 stagger items, the end card, the lifecycle action).

## 4. Resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave.
- **Effect-pane fidelity:** *all reenacted* (mock terminal), every line real; illustrative only: the times of beats 1,
  4 and 9, the title bar, and the `$` prompt (commands on scratch files ran in their own temp directories).
- **The staggers have no end block** and run 250 ms apart from 1.5 s into each beat; a later command's line is an item
  of its beat's stagger, so it types after the output above it.
- **No chapter-local actions, no new library actions:** frames and lines are driven by classes alone.
- **Timeline name / uri:** `"The Command Line"`. Hub card label: "The Command Line" (`08`).

## 5. Files

```
examples/eligian-tour/
├── tour.eligian    # the "The Command Line" timeline (skeleton lifecycle, 11 labelled items, 11 staggers, the end
│                   #   card); hub card #card-chc + key 8 navigate "The Command Line"; hubUnwire removes both
├── layout.html     # #chc: chrome, eleven code blocks (#cc-code-*), eleven terminal frames (#cc-fx-*.fx.term) with
│                   #   their lines (#cc-out-*, #cc-cmd-*) + the done card, eleven callout chips; hub card #card-chc;
│                   #   the editor chapter's navigate-target list and completion list end with "The Command Line"
└── tour.css        # the Mock terminal section (.fx.term, .term-*), anchors #cc-tok-* → --cc-cl-t1 … t11, fallback
                    #   rows 1–11, #card-chc in the live-card list
```

`presentation.eligian` is unchanged.
