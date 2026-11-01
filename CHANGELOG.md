# Changelog

All notable changes to Eligian: the DSL, its compiler, the CLI and the VS Code extension.

Eligian has not been released yet: every package is still at version `0.0.1` and there are no release tags. This changelog was put together from the git history (274 commits, 2025-10-14 to 2026-11-01). It is grouped by period, newest first. Numbers like (#38) are the pull requests merged into `main`, and the spec numbers refer to `specs/<NNN>-*/`.

## Unreleased: branch `fix/audit-high-findings` (2026-10-22 to 2026-11-01)

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

- **Signature help and inlay hints**: parameter names (audit idea #7) and the resolved times of timeline events (#4).
- **Snippets**: timeline events and other common constructs (#13).
- **Navigation**: timeline names as symbols for `navigate` targets (#16); a timeline-aware Outline, breadcrumbs and Go to Symbol (#20); Go to Definition and Find References between `.eligian`, CSS and layout HTML, plus a CodeLens with reference counts on CSS rules (#22).
- **Selectors through action parameters**: class names and selectors passed to an action's parameters are checked against the CSS and the layout and completed there (spec 056). An optional warning flags selectors that are in the CSS but not in the layout (`eligian.validation.selectorNotInLayout`).
- **Formatter**: whitespace-only Format Document (spec 054).
- **Readable syntax errors** instead of Chevrotain's token lists. A keyword used as a name is explained.
- **Timeline (Gantt) view**: the events of each timeline as bars in a panel, with the preview's playhead (#20).
- ***Eligian: New Presentation…*** creates a project from a starter (blank, chapters, video, library).

### Added: the preview

- **Scrubber and time readout**, plus pickers for the timeline and the language (#5).
- **Preview from here**: `▶ Preview from 22s` CodeLenses above timelines and events.
- **Keeps its place**: the playhead stays where it was when the program is recompiled (#8).
- **Runtime errors in the source**: an engine error becomes a diagnostic on the operation that failed, through the new Eligian map. When the operation's name and index match several places on the call chain, the others are listed as related information (spec 053).
- **Running events marked**: the events playing at the current time are highlighted in the editor.
- **Eligius lint findings in Problems** after each compile (setting `eligian.preview.eligiusLint`).

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
