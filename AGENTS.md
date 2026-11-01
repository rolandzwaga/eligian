# AGENTS.md

Shared guidance for any AI coding agent working in this repo. This is the canonical, tool-agnostic instruction file. Tool-specific notes live alongside it (e.g. `CLAUDE.md`, which imports this file).

> Nested `AGENTS.md` files exist under each `packages/*` dir. Agents read the **nearest** file in the directory tree, so the closest one wins; this root file applies repo-wide.

## Project

Langium-based DSL (**Eligian**, file extension **`.eligian`** — never `.eli`/`.elg`) + an Effect-ts compiler that emits [Eligius](https://github.com/rolandzwaga/eligius) JSON config, plus a VS Code extension (highlighting, validation, completion, preview, on-the-fly compile). Eligius is a story-telling engine driven by verbose JSON; the DSL exists to make that config concise and type-safe.

## ⚠️ Windows path rule (CRITICAL)

This repo lives on Windows. For every file-path tool **except a POSIX shell** (`Bash`), use Windows backslash paths and expand `~` to the full home dir.
- ✅ `C:\Users\scab\file.txt`   ❌ `/c/Users/scab/file.txt` or `~/file.txt`

## Import bans (CRITICAL)

Never import from research-only source trees. Always import from the installed npm packages.
- ❌ `../eligius/src/...`  → ✅ `import type { ... } from 'eligius'`
- ❌ `f:/projects/typir/...` → ✅ `from 'typir'` / `from 'typir-langium'`
- Never hand-edit Langium-generated code under `**/generated/`.

Research/reference (read-only, do NOT import):
- `../eligius/` — `README.md`, `jsonschema/eligius-configuration.json` (config entry point), `docs/`
- `f:/projects/typir/` — Typir API reference

## Tooling

- **Package manager: pnpm only** (version pinned via `packageManager` in package.json; currently 11.9). Never npm/yarn — breaks workspace resolution.
- **Type-check/build: TypeScript 7** (`typescript@7`, the native Go compiler; the `tsc` bin IS tsgo). `pnpm typecheck` = `tsc -b tsconfig.build.json`. TS 7 has no JS compiler API — the one script that needs it (`scripts/generate-html-metadata.ts`) imports the TS 6 API from `@typescript/typescript6`.
- **Effect: v4** (`effect@4`). Key v3→v4 renames already applied: `Context.Tag` → `Context.Service`, `Cause.failureOption` → `Cause.findErrorOption`, `Effect.catchAll` → `Effect.catch`, `Effect.either`/`Either` → `Effect.result`/`Result` (`_tag` is `Success`/`Failure`). `Effect.runPromise` now rejects with the typed error itself (no `FiberFailure` wrapper). Migration guide: https://github.com/Effect-TS/effect/blob/main/MIGRATION.md
- **Lint/format: Biome** (v2.5). Bundling: esbuild. Tests: Vitest. One-off scripts in `scripts/` and `tools/` run via `tsx`.
- **Effect LSP**: `@effect/tsgo` (Effect language service compiled into tsgo; plugin name in tsconfig stays `@effect/language-service`). Run headlessly via scripts: `pnpm effect:check` (both), `pnpm effect:check:language`, `pnpm effect:check:cli` (= `effect-tsgo diagnostics --strict`). `--strict` = errors + warnings exit non-zero (messages don't) and **CI runs `pnpm effect:check` and fails on findings**. Goal is **0 errors / 0 warnings**. Plain `tsc` does NOT run Effect rules; `pnpm effect:patch` swaps the workspace `tsc` binary for the Effect-patched one (editor + `tsc -b` then report Effect diagnostics) — re-run after `pnpm install`. No autofix for some rules (e.g. `effectGenUsesAdapter`) — fix by hand or codemod.

### Commands (from repo root)
- `pnpm build` (`-r build`) · `pnpm typecheck` · `pnpm watch`
- `pnpm test` (`-r test`, no coverage) · `pnpm test:coverage:ci` (coverage + thresholds)
- `pnpm check` (Biome format+lint, autofix — run after each task) · `pnpm lint` · `pnpm run ci` (no writes; bare `pnpm ci` is pnpm's clean-install, never run it)
- `pnpm langium:generate` (after editing `eligian.langium`) · `pnpm generate:html-metadata` (regenerates HTML completion metadata)
- `pnpm test:coverage` (local pruned coverage report via `tools/pruned-coverage.ts`)
- `pnpm run check:examples` (`eligian check` on every example; CI runs it with `--format github`). `check` also runs Eligius' `lintConfiguration` (`eligius/lint`) over each clean program's compiled config, findings at their source via `locateConfigPath` (`packages/cli/src/check/lint.ts`; `eligius-<rule>` codes; W111 left out; `--no-lint`)
- `eligian dev <entry> [--port] [--open]`: the bundle in the browser, rebuilt on change in a temp dir (`packages/cli/src/dev/`: node:http + SSE; CSS swapped in place, otherwise reload resuming the timeline / position via `window.EligiusBundled.ready`, build errors as an overlay)
- `pnpm run smoke:examples` (`eligian smoke`: plays every timeline in jsdom on the real engine, runtime failures at their source; `packages/cli/src/smoke/`. CI runs it with `--format github`)
- `eligian init [dir] --template blank|chapters|video|library` writes a starter project; the starters live in `packages/language/src/starters/starters.ts` (shared with the extension's *Eligian: New Presentation…*) and `packages/cli/src/__tests__/init.spec.ts` checks every one clean
- `pnpm run fmt:examples` (`eligian fmt --check` on every example; `eligian fmt --write <patterns>` formats; CI runs it with `--format github`). Formatter rules: `packages/language/src/lsp/format-rules.ts` (whitespace only; spec 054)
- `pnpm effect:check` (Effect LSP diagnostics; also `:language` / `:cli`) — see Effect LSP above

### Task completion checklist
1. `pnpm build` (or `pnpm typecheck`) clean
2. `pnpm check` → 0 errors / 0 warnings
3. `pnpm test` passes (run `test:coverage:ci` if new code, don't regress thresholds)
4. `pnpm langium:generate` first if grammar changed
5. **If you touched Effect code** (compiler or `cli/bundler`): run `pnpm effect:check` (or the per-project variant) and fix findings to 0/0/0 — these don't show in plain `tsc` or `pnpm check`.

### Commit / PR rules
- Do NOT offer to open a PR or push — these are user-only actions.
- Ignore CRLF/EOL diff noise.

## Conventions

- **Functional:** external immutability, internal mutation allowed for performance.
- **Biome:** 2-space indent, 100 cols, LF, single quotes, semicolons, ES5 trailing commas, arrow parens as needed. Scope is `packages/**/*.{ts,json}` only (`scripts/`, `tools/` are not checked). Excluded: `fixtures/`, `specs/`, `coverage/`, `out/`, `dist/`, `generated/`; lint+format disabled for `*.generated.ts`, `*.d.ts`, test-fixture JSON. Notable overrides OFF: `noExplicitAny` (Langium), `noNonNullAssertion`, `useYield` (Effect.gen), `noParameterAssign`, `noAccumulatingSpread`, `noShadowRestrictedNames`, `noAssignInExpressions`. `unusedVars`/`unusedImports`/`useConst` = warn.
- **Fixing TS errors:** never use `sed` with line numbers from compiler errors (they mark the symptom, not the fix — corrupts files). Navigate to the real site and edit by string/symbol match.
- **Effect idioms:** no thrown exceptions in the pipeline — `Effect.fail` with tagged-union errors carrying source location; services via `Context.Service` (Effect 4; was `Context.Tag` in v3), composed with `Layer`. Don't use the obsolete `Effect.gen(function* (_))` adapter (it's a no-op alias of pipe); use `Effect.void` over `Effect.succeed(undefined)`. Tagged errors need a `_tag` discriminant or the Effect LSP flags them as untagged global `Error`.

## Architecture

```
packages/
├── language/   @eligian/language — Langium grammar, LSP, validation, type system, AND the compiler
│   └── src/
│       ├── eligian.langium                 # grammar
│       ├── eligian-validator.ts (+ validators/)   # semantic validation
│       ├── eligian-scope-{provider,computation}.ts, eligian-{hover,completion,code-action}-provider.ts
│       ├── eligian-module.ts (DI wiring), eligian-formatter.ts, eligian-document-validator.ts, operation-data-tracker.ts
│       ├── compiler/                        # Effect-based DSL→Eligius JSON compiler (see below)
│       ├── type-system-typir/               # type system (Typir + typir-langium)
│       ├── css/                             # CSS class/selector validation + IDE helpers (PostCSS)
│       ├── jsdoc/ hover/ asset-loading/ lsp/ completion/ html/ labels/ locales/ errors/ utils/ types/ schemas/
│       ├── generated/                       # Langium-generated (do not edit)
│       └── __tests__/                       # incl. test-helpers.ts
├── cli/        CLI compiler — main.ts, compile-file.ts, bundler/ (asset/CSS bundling, tagged errors)
├── shared-utils/  errors.ts, file-loader.ts, path-resolver.ts, tag-guard.ts, locale-guards.ts
└── extension/  VS Code extension (LSP client + webview preview)

.specify/memory/constitution.md  — governs all development (read it)
```

See each package's own `AGENTS.md` for local detail.

### Compiler (`packages/language/src/compiler/`)
Effect-ts pipeline: parse → validate → type-check → transform → optimize → emit. `pipeline.ts` exports `compile`. Real modules include `ast-transformer.ts`, `type-checker.ts`, `optimizer.ts`, `constant-folder.ts`, `expression-evaluator.ts`, `emitter.ts`, `error-reporter.ts`, `name-resolver.ts`; `effects/` (`Compiler.ts`, `FileSystem.ts`, `Logger.ts`, `layers.ts`); `types/eligius-ir.ts`; `constants.ts`, `html-import-utils.ts`. Subdirs: `pipeline/` (parser, services, library-loader, document-errors), `transformers/` (per-construct transformers: action, timeline, operation, expression, time, config-builder, library-imports, scope, source-location), `operations/` (operation registry — `registry.generated.ts` is produced by `generate-registry.ts`, do not hand-edit — plus mapper/validator), `utils/`. Tests + `__fixtures__` in `__tests__/`. (There is no top-level `packages/compiler`.)

### Type system
Typir-based, in `type-system-typir/` (the old standalone `type-system/` dir was removed). Optional/opt-in static typing: annotations (`action f(x: string)`), inference from operation usage, `unknown` = opt-out. Types: string, number, boolean, object, array, unknown. README in that dir.

## DSL features (one-liners; details in `specs/<NNN>/`)

- **Unified call syntax**: actions and built-in operations are called identically (`at 0s..5s fadeIn("#box")`); compiler resolves action-first then operation. Action names can't collide with operations. Action calls expand to `requestAction`+`startAction`. (`name-resolver.ts`, `ast-transformer.ts`)
- **break / continue**: loop-control sugar → `breakForEach`/`continueForEach`; only valid inside `for` loops (else compile error).
- **CSS loading + live reload**: `styles "./x.css"` → `config.cssFiles[]`; extension hot-reloads CSS into the preview without restarting the timeline. (`packages/extension/src/extension/css-loader.ts`, `css-watcher.ts`, `webview-css-injector.ts`)
- **CSS class/selector validation**: validates className/selector args against imported CSS (PostCSS), with Levenshtein "did you mean?" suggestions; hot-reloads. (`css/`, spec 013)
- **JSDoc for actions**: `/** @param */` comments → hover docs + auto-generated templates. (`jsdoc/`, spec 020)
- **Imports**: default imports `layout | styles | provider | locales "./path"` (one of each per document); named asset imports `import name from "./file" (as html|css|...)?` with type inferred from extension. Paths must be relative. (specs 009/010)
- **Library files + action imports**: `library name` files contain only actions (`private` hides them); consumers use `import { a, b } from "./lib.eligian"`. (specs 023/032)
- **Event actions**: `on event "name" (topic "t")? action handler(params) [ ... ]` — Eligius event listeners declared as actions. (spec 028)
- **Endable actions**: `endable action name(...)` with start + end operation lists for timed ranges. Timelines: `timeline "name" in "#selector" using <provider> (from "src")?`.
- **Timeline lifecycle**: `on enter [ ops ]` / `on leave [ ops ]` in a timeline body → one open-ended timeline action (`{ start: 0 }`, no end), not counted in the duration; leave runs on navigate/stop, not when the content ends. (spec 050)
- **Time constants, labels, anchors**: `const beat = 7s` used as `@beat` in times; `at … as intro [..]` then `intro.start`/`intro.end` (earlier events only); `stagger … at <time>` anchors the first item. Shared evaluator `utils/time-constants.ts` (compiler, IDE resolver, validators). (spec 051)
- **Sequence items**: `sequence each [ prelude ] then [ postlude ] { call() for 5s  for 7s as x [ start ] [ end ] }`: inline items, a prelude before every item's start ops, a postlude after every item's end ops, labeled items. (spec 052)
- **Eligian map / runtime errors**: `compileWithMap` → `{ config, map }` (`compiler/eligian-map.ts`: action/operation ids → source locations, `locateEngineError` (every operation that matches the reported name + index: the first, plus `alternatives`), `activeTimelineActions`); CLI `--eligian-map`; the preview maps engine `error` events to `eligius-runtime` diagnostics and marks the running events. (spec 053)
- **target / with**: `at … target "<sel>" [..] [..]` prepends selectElement to the event's start (and end) ops; `with <sel> { ops }` = selectElement + ops (selection stays); quick fix *Insert selectElement* / *Add target* on the missing-selectedElement dataflow error. (spec 055)
- **Selectors through action parameters**: `css/parameter-roles.ts` infers selector/className roles of action parameters (through nested and library calls); call-site literals are validated/completed; selectors use CSS ∪ layout-HTML names (`css/selector-sources.ts`); optional `eligian.validation.selectorNotInLayout` / `check --selector-not-in-layout` (`validators/validation-settings.ts`). (spec 056)
- **Interactions**: `on <event> "<sel>" navigate "<tl>" (at t)? | play | pause | toggle | stop | seek <t> | run action(args)` (`InteractionStatement`, was `NavigateStatement`) → DOMEventListenerController + one synthetic broadcast action per verb (`compiler/transformers/navigate-operations.ts`); `seek` uses its own timeline's labels, `navigate … at` the target's; verbs are contextual keywords (`ActionName` rule); DOM events in `utils/dom-events.ts`; `on key "<keys>" (in "<sel>")? <verb>` → KeyboardController (key names in `utils/key-names.ts`). (spec 057)
- **Outline**: `lsp/eligian-document-symbol-provider.ts` lists timelines with their lifecycle blocks and events (resolved times from the shared resolver, labels, first text argument, calls), plus actions, event actions, constants, named imports. Timeline (Gantt) view: `lsp/timeline-gantt.ts` (`eligian/timelineGantt` request: bars packed into lanes) → `packages/extension/src/extension/timeline-view/TimelineViewProvider.ts` + `media/timeline-view*.ts` (click → source, double-click → `eligian.previewAt`, preview playhead via `preview/playhead-events.ts`). (idea #20)
- **Erased parameters**: an operation that erases a property named like an action parameter (`selectElement` → `selector`) is wrapped in a save / restore (`setOperationData` via `__eligian_param_<name>`) when the block uses the parameter again (`compiler/transformers/erased-parameters.ts`; found by `eligian smoke`).
- **CSS / HTML navigation**: `lsp/css-navigation.ts` (`cssUses`: classes / ids of className and selector strings via the #18 roles) → Go to Definition to the CSS rule and the layout elements; `eligian/cssReferences` and `eligian/cssReferenceLenses` requests for the extension's *Find Eligian References* and the CSS CodeLens (`packages/extension/src/extension/css-references/`). (idea #22)
- **Syntax errors**: `eligian-parser-error-provider.ts` (Langium `parser.ParserErrorMessageProvider`) writes one-line messages: a keyword used as a name is explained, the contextual keywords of the name rules fold into "a name", tokens in words, rule concepts ("a time", "an action or operation call, or a [ … ] block") instead of token lists.
- **Host modules**: `extensions "./host.ts" { operation trackEvent(eventName: string)  controller Confetti(count: number)  function formatPrice }` (`compiler/operations/host-operations.ts`): the registry lookups take an AST node as context (`getOperationSignature(name, node)`, `hasOperation`, `controllerMetadata`) so a program's declarations count; `--bundle` / `dev` import the module into the bundle and map the names, `smoke` bundles it with esbuild (`cli/src/dev/host-module.ts`); the preview bundles it in trusted workspaces with esbuild-wasm's browser build in a worker thread (`extension/src/extension/preview/host-bundler*.ts`; `out/esbuild.wasm` copied by esbuild.mjs; the Node API would spawn `node`) and registers it (`media/host-registrations.ts`; stand-ins when untrusted). (idea #24)
- **Languages + locales**: `languages { * "en-US" "English" ... }` block plus `locales "./file"` import for typed labels; `locales` is the keyword (not `labels`). (specs 037/045)

## Testing

- **Read `specs/TESTING_GUIDE.md` before writing tests** (Constitution XXV) — has templates and common pitfalls.
- Tests in `__tests__/` as `*.spec.ts`; fixtures in `__fixtures__/`. Compiler tests in `packages/language/src/compiler/__tests__/`.
- Helpers (`packages/language/src/__tests__/test-helpers.ts`): `createTestContext()` in `beforeAll`; `setupCSSRegistry()` in `beforeEach`; `DiagnosticSeverity` enum (no magic numbers); `getErrors()`/`getWarnings()`.
- Keep CSS-validation integration tests in separate files (avoid workspace contamination).

## TypeScript Navigation (typegraph-mcp)

Use the `ts_*` MCP tools before `rg`/`grep` for TypeScript navigation and Effect-aware editor feedback. They resolve through barrel files, re-exports, and project references; return semantic results instead of string matches; and expose TSGo LSP hover, diagnostics, and code actions when available.

- Point queries: `ts_find_symbol`, `ts_definition`, `ts_references`, `ts_type_info`, `ts_navigate_to`, `ts_trace_chain`, `ts_blast_radius`, `ts_module_exports`
- TSGo LSP tools: `ts_hover`, `ts_layer_hover`, `ts_effect_diagnostics`, `ts_code_actions`
- Graph queries: `ts_dependency_tree`, `ts_dependents`, `ts_import_cycles`, `ts_shortest_path`, `ts_subgraph`, `ts_module_boundary`
- Agent helpers: `ts_project_info`, `ts_document_symbols`, `ts_symbol_overview`, `ts_dead_exports`

`ts_navigate_to` searches exported symbols by default and returns exact counts. Pass `includeLocals` to also reach non-exported locals and class members — that half is capped at 256 and sets `localsTruncated`; never compare counts from a truncated result. Pass `file` to also search one file's document symbols, the only way to find object-literal keys such as RPC handler maps. `maxResults` (default 10) trims the returned list only — the counts always describe the full result set.

Use `ts_project_info` once at the start of a session to confirm the project root, tsconfig, backend, and graph/index sizes. Use `ts_document_symbols` for route tables, RPC handler maps, and object-literal keys in a known file. Use `ts_symbol_overview` as the first pass for change-risk questions. Use `ts_hover` when editor hover presentation matters; on Effect projects it can include expanded Success/Failure/Requirements blocks. Use `ts_layer_hover` for Effect Layer graph hover content. Use `ts_effect_diagnostics` for Effect LSP rule feedback and `ts_code_actions` for available quick fixes/refactors. If `ts_effect_diagnostics` returns `unavailable: true`, the current project is using the plain TypeScript TSGo fallback rather than `@effect/tsgo`; continue with non-Effect semantic tools. Use `ts_dead_exports` for explicit dead-export audits.

Start with TypeGraph MCP before reading entire files or grepping TypeScript. Use `rg`/`grep` for non-TypeScript assets, docs, config, and broad syntactic discovery when there is no symbol/type/navigation question.
