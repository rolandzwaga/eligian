# Changelog

All notable changes to Eligian: the DSL, its compiler, the CLI and the VS Code extension.

Eligian has not been released yet: every package is still at version `0.0.1` and there are no release tags. This changelog was put together from the git history (274 commits, 2025-10-14 to 2026-11-01). It is grouped by period, newest first. Numbers like (#38) are the pull requests merged into `main`, and the spec numbers refer to `specs/<NNN>-*/`.

## Unreleased (2026-11-05)

### Added

- **`eligian smoke --determinism`** (spec 058, phase 3): checks that the DOM at every start and end time depends only on the time. Three fresh engines per timeline reach each time by linear play, a straight seek and a seek back from the end, and the classes, text, style and visibility of every layout id are compared; each difference is a `position-nondeterministic` error (one per class), reported once at the event that selects the element. Combines with `--timeline`, `--scenario`, `--strict` and every format. `eligian_smoke` takes `determinism: true`.
- **Smoke plays video and audio timelines**: a media clock stands in for jsdom's media element (positions only: the compiled timeline's duration, seeks, real time between `play()` and `pause()`; no file is read or decoded, no autoplay policy), so media timelines are walked, scenario steps on them run, and `--determinism` covers them. They were skipped before ("media timelines need a browser"), and `scenario-media-timeline` is gone.
- **`domEquals` scenario assertions**: `{ "freshAt": <s> }` or `{ "linearAt": <s> }` compares every layout id at a step with what a fresh engine shows at that time.
- **`eligian_compile` `explain: true`**: each returned operation with its JSON path and its `origin`, the construct that generated it (`source`, `call`, `target`, `with`, `erased-save`, `interaction`, `lifecycle`, `sequence`, `stagger`, …), and once per origin the rule with the `eligian_docs` id to read; the summary view gets the counts per origin. The origin is carried by the compiler through the Eligian map (`--eligian-map`), never into the compiled config.
- **The MCP eval harness** (`evals/mcp/`, `pnpm evals:mcp`): 14 cases, each run by `claude -p` in a fresh project with the packed CLI installed, in three arms (`A1` the MCP server, `A0` the AGENTS.md block and the docs on disk without the server, `A-none` neither), then gated (check, fmt, smoke with the case's scenario and `--determinism`, compile with the case's assertions, the tool-call budget) and scored against a rubric (A0 and A1); results under `evals/mcp/results/<run-id>/`. Runs locally under your Claude subscription, never in CI. Every case has a reference solution that passes its gate (`mcp-solutions.spec.ts`).
- **The curriculum is complete**: an overlay for every operation and every diagnostic code, and reference chunks for the DOM events, key names and HTML elements.
- **Three more MCP tools** (spec 058, phase 2; eight in all). `eligian_compile`: the compiled Eligius JSON of a program as a summary, a fragment (one timeline, one action, or the action around a source line, each with its source location) or the full config, with the Eligian map on request. `eligian_project`: the inventory of a program or a directory (CSS and layout names, the selectors a program may use, locale keys, host names, asset problems, the outline, the STORYBOARD.md beats against the compiled timeline actions). `eligian_smoke`: `eligian smoke` run in a child process, with a scenario, per-step snapshots, a `timeoutMs` that returns a partial result, and cancellation; the host module runs only in that child, never in the server.
- **Smoke scenarios**: `eligian smoke <file> --scenario <file.json>` replays steps (`seek`, `click`, `key`, `navigate`, `wait`, `snapshot`) on a fresh engine after the walk and checks assertions on the snapshots of the layout ids (classes, text, visibility, controllers, the active timeline, the position within 0.1 s). One program file per scenario. Failures are `scenario-*` problems at the step they concern. Also `--timeline <name>` (repeatable) and `--step-timeout-ms <n>`.
- **`eligian smoke --format ndjson`**: one JSON object per line as the run goes (`file`, `timeline`, `problem`, `step`, `summary`), nothing else on stdout.
- **`eligian agents setup [dir] [--client claude|cursor|vscode|codex]`**: writes or merges the `eligian` MCP server entry (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`) and the agent instructions (`AGENTS.md` and `.github/copilot-instructions.md` between `<!-- eligian:begin -->` / `<!-- eligian:end -->` markers, `.cursor/rules/eligian.mdc`, the `@AGENTS.md` line in `CLAUDE.md`). Only Eligian's own key, table or block changes; a second run changes nothing; invalid JSON is refused and left alone.
- **`eligian mcp --print-config <client>`**: prints the server entry for a client (JSON, or TOML for Codex) and starts no server.
- **Seven review checks** in `eligian check` and `eligian_check`: `media-file-missing`, `media-from-duplicate`, `timeline-container-not-in-layout`, `media-timeline-first-without-start-gesture`, `entry-timeline-without-enter`, `host-operation-in-block-without-select` (not in named-action bodies, which use their caller's selection) and `lottie-web-not-installed`.
- **`unknown-listener-action`**: an error, in the editor and the CLI, on a name in the action list of a `DOMEventListenerController` or `KeyboardController` that the program neither declares nor imports, with suggestions.
- **The curriculum of `eligian_docs`**: the rest of the language map (program and config, erased parameters, control flow and data, event actions, imports and assets, locales and languages), the runtime chunks (timing models, runtime quirks, state pitfalls, every claim a probe test), the authoring chunks (layout HTML, CSS conventions, provider choice, presentation patterns, assets and host modules, the host-module contract, the verification ladder), overlays for the most-used operations, all nine controllers and every new code, and example markers in the tour.
- **`eligian mcp`: an MCP server for coding agents** (spec 058, phase 1). A Model Context Protocol server over stdio in the `eligian` package, so Claude Code, Cursor, VS Code (Copilot agent mode) and Codex can learn Eligian and check what they write. Five tools: `eligian_docs` (curated knowledge, shipped in the package under `dist/docs` and generated from the compiler's own data), `eligian_operations` (operation lookup with NEEDS / PROVIDES / ERASES), `eligian_check` (every diagnostic with its fix), `eligian_fmt` and `eligian_init` (a starter plus `.mcp.json`, `AGENTS.md` and `CLAUDE.md`). Tool paths stay under the project root; one telemetry line per call on stderr, and in `ELIGIAN_MCP_LOG` when set. The client snippets are in the CLI README.
- **The review pass** of `eligian check` and `eligian_check`: warnings over each compiled program that the validation cannot see, at their source: `controller-imbalance` (a timeline's `on enter` adds controllers that its `on leave` does not remove; a quick fix inserts the removals) and `class-never-removed` (an `addClass` that nothing in the timeline removes). `--no-review` skips it.
- **`@eligian/language/mcp`**: a separate entry of the language package with what the MCP server reads beyond the package root (the operation walker, controller balance, parameter roles, the generated controller and timeline-event metadata).

- **The tour: eight chapters** (`examples/eligian-tour/`). Two new chapters, *Files & Imports* (program vs library, the `languages` block, default, named, library and `extensions` imports, comments and JSDoc, keywords) and *The Command Line* (a mock terminal with the real output of every `eligian` command), and *Tooling Magic* rewritten as *The Editor* (a mock VS Code, one beat per extension feature). The six existing chapters were corrected against the grammar and the engine and now also teach time constants and labels, `target` / `with`, sequence items with `each` / `then`, the anchored inline stagger, dataflow contracts, erased parameters, `else if`, loop control, interactions and `on key`, nine controllers, a real LabelController with a live language switch, and a host module (`host.js`). Every chapter can be left and re-entered cleanly (`on leave` resets and unwires it), paused with `space` and replayed with `r`; the hub opens a chapter with `1`–`8`; the progress bar is the engine's ProgressbarController. A test checks that every controller a lifecycle block attaches is removed again (`tour-controllers.spec.ts`). The storyboards and `ELIGIUS_EXECUTION_MODEL.md` (verified against eligius 4.2.0) were rewritten to match.

### Changed

- **`eligian smoke --format json`**: every problem carries its `code` (`smoke-engine-error`, `smoke-selector-miss`, …); the output is otherwise unchanged.
- **`eligian init` writes agent files**: the MCP server entry and the instructions of each `--client` (default `claude`), merged into existing files as by `eligian agents setup`; `--no-agents` writes none. The `video` starter carries one `media-file-missing` warning until `media/intro.mp4` exists.
- **`eligian_init` merges agent files**: an existing `.mcp.json`, `AGENTS.md` or `CLAUDE.md` is merged (only the `eligian` entry, the marked block and the import line change) instead of left untouched; `client` picks the clients and `agents: false` writes none.
- **CLI 1.1.0**: the `mcp` command. On a 1.0.x install `eligian mcp` is taken as `eligian compile mcp` and fails.
- **`eligian check` defaults**: the review pass runs by default (`--no-review`), and `--selector-not-in-layout` defaults to `ids` for a program that imports a `layout` (`off` turns it off), as in `eligian_check`. `examples/demo.eligian` is checked on its own, without the selector check, in `check:examples` and the publish workflow.
- **Starters**: `eligian init` projects depend on `eligian` `^1.1.0`.
- **Marketplace packaging**: the extension is named `eligian` (the scoped name was refused by vsce) and has an icon, a license, a repository and keywords. `pnpm -C packages/extension run package` builds it minified, without source maps, and packs only the runtime files (21 files, 5 MB), with the LICENSE and this changelog copied in.
- **CLI 1.0.1**: Effect 4.0.7.
- **The CLI on npm**: the package is `eligian` (version 1.0.0; `npx eligian init my-talk`). It is self-contained: the language and shared packages are bundled into one minified file, and the package holds only that, the launcher, the README and the LICENSE (455 KB). The `Publish CLI` workflow builds, tests, installs the packed tarball and runs it on the examples before publishing it with npm trusted publishing. `eligian init` projects depend on `eligian` `^1.0.0` instead of the unpublished `@eligian/cli`.
- **Publishing**: the `Publish extension` workflow (`.github/workflows/publish.yml`, run by hand on `main`) builds, tests and publishes the extension to the Visual Studio Marketplace with Trusted Publishing (OIDC, no stored token), optionally as a pre-release. The extension is at version 1.0.0.
- **Eligius 4.2.0**: engine errors carry the path of `startAction` / `endAction` calls to the failing operation (`operationPath`). The preview and `eligian smoke` follow it to the one operation that failed, where before an operation at the same index in the caller and in a called action could not be told apart ("or 1 other place"). Without a path the old search remains.

### Fixed

- **`--bundle` and `eligian dev` carry `loadJson` files**: the local, relative `url` of a `loadJson` operation (for example the animation of a LottieController) is copied into the bundle and rewritten to the copy, and `dev` serves it.
- **Long MCP sessions**: the server recycles the compiler's documents and services every 100 compiler calls, so its heap stays flat (`pnpm -C packages/cli run test:soak`: 200 `eligian_check` calls, at most 25 MB of growth).

## 2026-10-22 to 2026-11-02: the audit follow-up (#183)

This work follows the codebase audit of 2026-10-22 (`docs/audit/2026-10-22-codebase-audit.md`): its findings and most of its feature ideas.

### Added: the language

- **Time ranges with a duration**: `at 5s for 3s`. End blocks are now optional, and a code action converts a range to `for` (spec 048).
- **Timeline header options**: `using scroll "#scroller"` (scroll-driven timelines), `loop` and `duration 30s` (spec 049). Scroll containers are checked at compile time and in the preview.
- **Timeline lifecycle blocks**: `on enter [ … ]` and `on leave [ … ]` (spec 050).
- **Time constants, labels and anchors**: `const beat = 7s` used as `@beat`, event labels with `as intro` and references to `intro.start` / `intro.end`, and `stagger … at <time>` (spec 051).
- **Sequence items**: inline items, `each [ … ] then [ … ]` preludes and postludes, and labelled items (spec 052).
- **`target` and `with`**: `at … target "<sel>"` selects an element for an event's start and end operations; `with <sel> { … }` selects one for a block (spec 055). A quick fix inserts a missing `selectElement`.
- **Interactions**: `on <event> "<sel>" navigate | play | pause | toggle | stop | seek <time> | run action(args)`, and `on key "<keys>" (in "<sel>")` for keyboard shortcuts (spec 057, Eligius 4's KeyboardController).
- **Runtime string concatenation and runtime value forwarding** (spec 046).
- **Operation-data dataflow**: missing dependencies are reported, with contracts inferred for actions (spec 047).
- **`setData` targets are validated**, with a quick fix for a missing `$`.
- **Host modules**: `extensions "./host.ts" { operation trackEvent(eventName: string)  controller Confetti(count: number)  function formatPrice }` declares your own operations, controllers and functions. They are validated, completed and compiled like Eligius' own, and are bundled into `--bundle`, `eligian dev`, `eligian smoke` and the VS Code preview (trusted workspaces only).

### Added: the editor

- **Signature help and inlay hints**: parameter names (audit idea 7) and the resolved times of timeline events (audit idea 4).
- **Snippets**: timeline events and other common constructs (audit idea 13).
- **Navigation**: timeline names as symbols for `navigate` targets (audit idea 16); a timeline-aware Outline, breadcrumbs and Go to Symbol (audit idea 20); Go to Definition and Find References between `.eligian`, CSS and layout HTML, plus a CodeLens with reference counts on CSS rules (audit idea 22).
- **Selectors through action parameters**: class names and selectors passed to an action's parameters are checked against the CSS and the layout and completed there (spec 056). An optional warning flags selectors that are in the CSS but not in the layout (`eligian.validation.selectorNotInLayout`).
- **Formatter**: whitespace-only Format Document (spec 054).
- **Readable syntax errors** instead of Chevrotain's token lists. A keyword used as a name is explained.
- **Timeline (Gantt) view**: the events of each timeline as bars in a panel, with the preview's playhead (audit idea 20).
- ***Eligian: New Presentation…*** creates a project from a starter (blank, chapters, video, library).
- **Eligius lint while you type**: 200 ms after an edit, every program without errors is checked by Eligius' configuration lint, with findings in the editor and in Problems, with or without the preview (setting `eligian.validation.eligiusLint`).

### Added: the preview

- **Scrubber and time readout**, plus pickers for the timeline and the language (audit idea 5).
- **Preview from here**: `▶ Preview from 22s` CodeLenses above timelines and events.
- **Keeps its place**: the playhead stays where it was when the program is recompiled (audit idea 8).
- **Runtime errors in the source**: an engine error becomes a diagnostic on the operation that failed, through the new Eligian map. When the operation's name and index match several places on the call chain, the others are listed as related information (spec 053).
- **Running events marked**: the events playing at the current time are highlighted in the editor.

### Added: the CLI

- **`eligian check <patterns>`**: every diagnostic of many files, in pretty, JSON, SARIF or GitHub annotation output. It also runs Eligius' configuration lint (`eligius/lint`) on the compiled programs; `--no-lint` skips it.
- **`eligian fmt`**: `--check` (the default) or `--write`, with GitHub annotations through `--format github`.
- **`eligian smoke`**: plays every timeline headlessly in jsdom on the real engine and reports runtime failures at their source.
- **`eligian dev`**: the presentation in the browser, rebuilt on every change, with live CSS and a reload that keeps the playhead.
- **`eligian init`**: writes a starter project.
- **`--eligian-map`**: writes the map from the compiled JSON back to the source.
- **CI** checks, plays and format-checks every example (`check:examples`, `smoke:examples`, `fmt:examples`).

### Changed

- **Eligius 4.0.0**: the native `<video>` replaces video.js, which was removed.
- **Eligius 4.1.0**: bundles import from `eligius/runtime` and register only the operations, controllers and providers a presentation uses, through `createImporter`. The tour's minified, gzipped bundle went from 102.8 KB to 84.9 KB.
- **Dead code removed**: the bundler's unused video and lottie provider paths.

### Fixed

- **The audit's findings**: 15 high-severity, 53 medium and 78 low.
- **Action parameters erased by operations**: `selectElement` erases `selector`, and a parameter with that name was gone for the rest of the block. Found by `eligian smoke`.
- **Scroll timelines in bundles**: a bundled scroll timeline failed at start-up, because its position source was never registered.
- **A stuck preview**: TypeScript's output could overwrite the bundled webview script, leaving the preview on "Compiling timeline…".
- **Name arguments rejected**: string arguments to parameters typed as names (`systemName`, `controllerName`, URLs, label ids) were refused, so `customFunction("name")` could not be written.
- **Nameless declarations in scope**: actions, constants and imports without a name (while typing) no longer reach the scopes, which made the editor crash.
- **Global setData targets**: program-level runtime constants now compile to `$globaldata.` targets.

## 2026-09 to 2026-10: toolchain upgrades and the tour

- **TypeScript 7** (#146), with the TS 6 API kept only for the one script that needs it.
- **Effect 4** (#172).
- **Eligius 3.0.1** (#175), after Eligius 2.3.2 (#143).
- **vitest 5** (#148) and **chalk 6** (#138).
- **The Eligian tour** (#178), a presentation about Eligian written in Eligian, deployed to GitHub Pages (#179).
- **Operation metadata**: now imported from `eligius/metadata` (#150).
- **typegraph-mcp** for TypeScript navigation by AI agents (#165).
- **Dependency updates** through Dependabot (#132, #138, #140, #143, #144, #151, #155, #156, #159, #160, #164, #166, #170, #171, #173, #174, #177, #180, #181, #182).

## 2026-04 to 2026-07: code-analysis cleanup

- **Correctness fixes**:
  - six Tier 1 correctness bugs (#56)
  - Typir type inference (#57) and a double invocation in it (#98)
  - compiler correctness defects (#75)
  - two batches of smaller defects (#79, #80)
  - a phantom-CSS leak into production builds (#80)
- **Fixes in the editor and preview**:
  - the locale editor (#58)
  - the preview webview (#59)
- **Duplication removed**, in many small steps:
  - import-path resolution (#60), file watchers (#61), library document resolution (#62), revalidation triggers (#63)
  - Levenshtein suggestions (#64), control-flow validators (#65), AST traversal (#66), LSP notification types (#67)
  - CSS registry queries (#68), CSS operation names (#69), time expressions (#70), validators and the type system (#71)
  - the errors module (#72), the bundler (#73), and a final batch (#74)
- **Large modules split up**:
  - the extension's `main.ts` into commands (#84)
  - the validator into focused validators (#85)
  - the operation-call validator (#99), the AST transformer (#102), and other oversized modules (#103)
- **Anti-patterns and types**: anti-pattern, encapsulation and unsafe-cast cleanups (#81, #83); deferred type migrations (#82).
- **Performance**: imported actions memoized, and a redundant media check dropped (#97).
- **Tooling**:
  - the Effect language service (#100)
  - pnpm 11 workspace settings
  - Dependabot, with the Langium toolchain kept in lockstep (#115)
  - hardened CI workflows
  - an early TypeScript 7 native preview
- **Dependency updates** (#45, #49, #50, #52, #54, #55, #77, #78, #88 to #93, #96, #106, #113, #114, #118, #120, #123, #124, #126, #127).

## 2025-11 to 2025-12: libraries, events, labels and bundles

- **Library files**: `library name` files with only actions, `private` actions, and `import { a, b } from "./lib.eligian"` (#21, specs 023 and 032), with validation of imported actions (#22, spec 024).
- **Event actions**: `on event "name" (topic "t")? action handler(params) [ … ]` (#26, spec 028), with event-name validation (#29) and completion (#28).
- **Labels and languages**:
  - label imports (#31) and typed labels (#32)
  - the `languages { * "en-US" "English" … }` block (#35, spec 037)
  - quick fixes for languages, label files and label entries (#36, #37, #39)
  - a label editor (#34) and the locale editor (#44), where labels moved to locale files (spec 045)
- **Controller syntax**: `addController("LabelController", …)` (#33, spec 035).
- **Standalone bundles**: `--bundle` writes a self-contained HTML and JavaScript presentation (#38, spec 040).
- **Imports and completion**: looser import paths (#40); completion for HTML element names (#41).
- **Eligius 2.1** and its 2.0 API (#42, spec 044), then **Eligius 2.2**. Eligius went from 1.4.1 to 1.5.3 during these months.
- **Tests and cleanup**: placeholder tests replaced by real ones (#43); dead code removed with knip; test suite refactors (#20, #23) and a code duplication refactor (spec 031); package upgrades (#25, spec 027), then Vitest 4 and newer Typir and Langium.

## 2025-10: the first version

- **The language**: a Langium grammar for Eligius presentations with timelines, timed events, actions with start and end operations, `if` / `else`, `for` loops with `break` / `continue`, variables and constants, action parameters, `stagger` blocks, and relative times.
- **The compiler**: an Effect-ts pipeline (parse, validate, type-check, transform, optimize, emit) that writes Eligius JSON configurations. It has an operation registry generated from Eligius' metadata and dependency validation of operation lists.
- **The CLI**, and a VS Code extension with syntax highlighting, validation and hover documentation.
- **The live preview** with the Eligius engine (#1, spec 001).
- **Code completion** (#2).
- **The type system** on Typir (#3), extended later (#19, spec 021).
- **Constant folding** (#5).
- **Unified calls**: actions and operations are called the same way (#6, spec 006).
- **Go to Definition** for actions (#7), and completion for them (#8).
- **Asset imports**: `layout`, `styles` and named imports (#9, spec 009), with validation (spec 010).
- **CSS**:
  - `styles` imports injected into the preview with live reload (#10, spec 011)
  - class and selector validation against the CSS, with "did you mean" suggestions (#11, spec 013)
  - CSS completion and hover (#12, spec 014)
- **HTML variables** (#13, spec 015).
- **JSDoc comments** for actions, shown on hover (#18, spec 020).
- **Internal consolidation**: a shared utilities package (#14), one CSS module (#15), one error type (#16) and one validation pipeline (#17).

## Eligius versions

| Date | Eligius |
|---|---|
| 2025-10 | 1.2.1, then 1.3 (`break` / `continue`) |
| 2025-11 | 1.4.1 to 1.5.3 |
| 2025-12 | 2.1.0 (#42), 2.2.0, 2.2.1 |
| 2026-09 | 2.3.2 |
| 2026-10-22 | 3.0.1 (#175) |
| 2026-11-01 | 4.0.0, 4.1.0 |
| 2026-11-02 | 4.2.0 (`operationPath` on engine errors) |
