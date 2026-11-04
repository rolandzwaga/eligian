# Roadmap: Eligian MCP server (spec 058)

Audience: engineers and agents implementing it in `f:\projects\eligius\eligian` through the phase workflow `.claude\workflows\mcp-server-phase.js` (stages `specify` → `plan` → `build` per phase; see AGENTS.md "Feature phases").

Facts below were checked against the repo on 2026-11-04 (CLI `eligian` 1.0.1, `effect` 4.0.7, `eligius` 4.2.0, 79 operations in the registry, 46 timeline events) and against `code.claude.com/docs/en/mcp` (tool search, `_meta` keys, output limits). Claims that could not be verified are marked **[UNVERIFIED]** and carry the test that settles them.

---

## 1. Goal, non-goals, success criterion

### Goal

A local MCP server that makes a filesystem-capable coding agent (Claude Code, Cursor, Copilot agent mode, Codex) an Eligian expert: given an idea in natural language, it produces a complete Eligius presentation (`.eligian` source, `layout.html`, CSS, `locales.json`, assets, optional host module) that compiles, lints, formats, plays and *behaves* as the idea asked. The server teaches, in detail, how each Eligian construct becomes Eligius JSON and how the engine runs it: operation dataflow, erased parameters, action expansion, providers, controllers, config shape, scheduling, seek semantics, the engine lifecycle.

The server does three things and nothing else:

1. **Knowledge on demand**: small, version-matched chunks of a curriculum and generated reference, pulled by tools. Two tiers: a ~120-word *card* per construct and a ≤ 1,200-word *detail* body on request.
2. **Compiler in the loop**: the checks the CLI runs (`check` + Eligius lint + a review pass over the compiled config, `fmt`, `smoke` with scenarios), returned as structured diagnostics with the fix attached.
3. **Inspection**: what a project contains (CSS classes, layout ids, locale keys, host declarations, asset files) and what a program compiles to, mapped back to source.

### Non-goals

- No remote/HTTP server, no hosted docs, no embeddings or vector index (the corpus is < 1 MB and well-sectioned).
- No in-server editing or code generation: the model edits files; tools take paths (decided).
- No `eligian dev` / preview as a tool (long-running process; the agent runs it in a terminal). No `--bundle` as a tool.
- No new DSL *syntax* in this roadmap. Compiler/CLI additions that the evals need are in scope and listed per phase: a review pass over compiled configs, scenario and determinism modes for `smoke`, provenance in the IR for `explain`, codes on every diagnostic, runtime error forwarding in `dev`.
- Not a replacement for the VS Code extension's LSP; the server does not run a language server over stdio.

### Success criterion ("expert")

The eval set in §6 is the definition. Phase exit criteria use it:

- **Expert**: with the server, an agent driven by the harness in §6.4 passes every eval case's gate (`check --max-warnings 0 --selector-not-in-layout ids` with the review pass, `fmt --check`, `smoke --strict` with the case's scenario and determinism check, behavioural and structural assertions) in ≤ 2 self-correction rounds, and arm A1 (server) is at least as good as arm A0 (same docs on disk, no server) on pass rate and better on rounds, tool calls and tokens.
- **Context cost**: total characters returned by `eligian_*` tools per eval case ≤ 80,000 (~20k tokens), measured by the server's per-call stderr log (§2, telemetry) and reported by the harness. Claude Code's own 25k-token-per-call cap and 50,000-char spill threshold are satisfied by construction and are not criteria.
- **Teaching happened**: in ≥ 90% of runs `eligian_operations` or the `operations-index` doc was read before the first `unknown-operation` / `missing-action-dependency` diagnostic, and `eligian_compile(explain:true)` was called at least once (harness metrics, §6.4).

---

## 2. Packaging decision

### Recommendation: one stdio server as `eligian mcp` inside the `eligian` npm package, plus a thin VS Code/Cursor launcher, plus passive agent context written by `eligian init` / `eligian agents setup`

Evidence: Angular (`npx -y @angular/cli mcp`) and Nx (folded `nx-mcp` into `nx mcp` in 21.4) both ended here; Svelte's server is the closest analogue for a compiler-backed language and uses the same list/get/validate loop. Repo facts that make it cheap:

- `packages\cli` already bundles `@eligian/language` and `@eligian/shared-utils` from source (`WORKSPACE_SOURCES` in `packages\cli\esbuild.mjs`), so the compiler, registry, `checkFiles`, `formatSource`, `smokeConfig` and starters are importable in-process from the same bundle. A separate package would repeat that bundling because `@eligian/language` is private.
- `effect@4.0.7` (already an external runtime dependency of the CLI) ships `effect/ai`: `McpServer.layerStdio({ name, version, instructions, protocols })`, `Tool`/`Toolkit` with `Tool.Meta` (forwards `_meta`), `Tool.Readonly`/`Destructive`/`Idempotent`/`OpenWorld` (MCP annotations). Verified in `node_modules\effect\dist\ai\McpServer.d.ts` and `Tool.d.ts`. **Zero new dependencies** for the MVP. Caveats: `@stability unstable`; `layerStdio` needs a `Stdio` service (`effect/Stdio` has `make` and `layerTest`, no Node layer: ~30 lines over `process.stdin`/`process.stdout` in `packages\cli\src\mcp\stdio.ts`); `protocols` must be chosen explicitly: `[McpProtocol.v2025_06_18]` plus the latest the library offers at implementation time.
- Publishing is solved: `.github\workflows\publish-cli.yml` builds, tests, packs, installs the tarball, runs it on the examples, publishes with OIDC and creates the release. The subcommand adds a handshake step to the tarball smoke.

Fallback if the Day-1 spike (Phase 1) fails on `_meta`, annotations or protocol negotiation: the official `@modelcontextprotocol/server` (v2 API, `serveStdio`/`registerTool` **[UNVERIFIED]** — confirm names in the spike), added to the CLI `dependencies` (external; `package-bin.spec.ts` asserts the bundle only imports declared deps).

### Trade-offs

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| (a) `eligian mcp` in `packages\cli` | compiler, docs and validators in one artifact and one version; no new publish pipeline; the project-local install (starters add `eligian` as a devDependency) is the version the project compiles with | bundle grows (docs + mcp module); every CLI command must stay fast, so jsdom/esbuild/`effect/ai` must be truly lazy (§ process rules); a project on `eligian` < 1.1 has no `mcp` subcommand | **chosen** |
| (b) separate `@eligian/mcp` package | independent cadence | re-bundles the private language package; docs/validators drift from the compiler; second publish workflow and trusted-publisher registration | rejected (Nx abandoned exactly this) |
| (c) VS Code extension registration only | zero-config for Copilot agent mode | VS Code + Cursor only; Claude Code/Codex in a terminal get nothing; the extension's compiler version may not match the project's; bundling the CLI into the `.vsix` means shipping jsdom and a native esbuild binary per platform (see §8 Q2) | **Phase 4 launcher only**, workspace-local `eligian` required |
| HTTP transport | one shared process | port/auth/CORS surface; nothing needs it; stdio is what Playwright, Chrome DevTools, Svelte, Angular and Nx default to | rejected; `layerHttp` exists if ever needed |

### Transport and process rules

- **stdio only; nothing but the protocol on stdout.** At server start, `packages\cli\src\mcp\stdio.ts` captures `process.stdout.write` for the transport, then redirects `console.log/info/debug/warn/error` and `process.stdout.write` to stderr for the life of the process. (The compiler's `LoggerLive` in `packages\language\src\compiler\effects\layers.ts` prints with `console.info/debug` but is used nowhere in the pipeline or CLI; the real risks are third-party `console.log` from Langium/Typir/eligius/jQuery and smoke's console patching, hence the global redirect.) Test: `mcp-stdout.spec.ts` spawns `node bin\cli.js mcp`, sends `initialize` + `tools/list` + one `eligian_check`, asserts stdout is pure NDJSON.
- **Concurrency model: compiler calls are serialised.** `checkFiles` (`packages\language\src\compiler\pipeline\check.ts`) works on one shared Langium singleton (`getOrCreateServices`), flips the mutable `Settings.selectorNotInLayout` per call and adds/releases documents in the shared `LangiumDocuments`; concurrent calls produce spurious diagnostics. MCP clients issue parallel tool calls. Every tool that touches the Langium services (`check`, `compile`, `project`, `fmt`, `operations` with `path`) runs under one process-wide `Effect.Semaphore` (1 permit) in `packages\cli\src\mcp\compiler-lock.ts`. Test: two different `eligian_check` calls fired at once through the in-process client return the same results as sequential calls.
- **Process isolation for smoke and host modules.** `eligian_smoke` spawns `process.execPath <own bin\cli.js> smoke <paths> --format ndjson [--strict] [--scenario <file>]`, kills the child on `timeoutMs`, and parses the lines read so far (partial results come from the streaming format, §4). Reasons: `dom-environment.ts` installs jsdom globals on `globalThis` permanently, `captureRuntime` patches `console.*` and adds a process `unhandledRejection` listener, `Effect.timeout` cannot stop engine timers, and `loadHostModule` imports a fresh `eligian-host-<hash>-<time>.mjs` per run that Node never unloads. Security note in the README and the tool description: `host.ts` is user code; the server executes it only inside the smoke child.
- **Cancellation.** On MCP `notifications/cancelled` the smoke child is killed; serialised compiler calls finish (they are short) and their result is dropped. The Effect fibre of the tool is interrupted in both cases.
- **Path policy.** Tool inputs are absolute paths, or relative to the first MCP root the client announces (`roots/list`); when the client announces no roots, relative paths resolve against the server cwd and every response echoes the resolved absolute path. Windows backslash paths are accepted and normalised; globs go through `toGlobPath` (`packages\cli\src\check\check-command.ts`). Tools read only under the resolved project root (the directory of the entry file or the root), and write only via `eligian_init` and `eligian_fmt(write:true)`.
- **Startup budget.** Codex `startup_timeout_sec` defaults to 10 s **[UNVERIFIED: 10 vs 30 in third-party sources]**. Measured here: `node packages\cli\bin\cli.js --version` 1.9–2.1 s; `import('jsdom')` 1.15 s, `import('effect')` 0.53 s. `dist\cli.mjs` hoists external imports to static top-level imports (`import * as esbuild from "esbuild"` at line ~87143, `jsdom`, `eligius/lint` likewise), so a dynamic `import('./mcp/server.js')` of bundled source does not make its externals lazy. Phase 0 changes the *sources* to `await import('jsdom')` (`smoke\dom-environment.ts`), `await import('esbuild')` (`dev\host-module.ts`, `bundler\`) and `await import('effect/ai')` (`mcp\server.ts`), and `package-bin.spec.ts` measures time-to-`initialize`-response (< 3 s on the CI runners, Windows and Linux).
- **Tool budget.** Codex `tool_timeout_sec` 60 s default; Claude Code backgrounds calls > 2 min. `eligian_smoke` default `timeoutMs` 45 s with partial results; the tour takes ~42 s today, so the tool description tells the agent to pass `paths` for one file or `timelines` for a subset.
- **Telemetry.** Every tool call logs one stderr line `{ t, tool, ms, chars, ok, args: <summary> }`; `ELIGIAN_MCP_LOG=<file>` appends the same lines to a file for "server disconnected" reports. The eval harness reads this log for tokens-from-tools and call-sequence metrics.
- **Memory and staleness.** Repeated in-process `runCheck` grows the heap ~0.35 MB per call; `formatSource` creates a second full Langium service set. Specs: a soak test (200 checks, heap ceiling), and tests that edit a CSS file, `layout.html`, `locales.json` and an imported library between two tool calls and assert fresh results. The server recycles its Langium services (`releaseWorkspaceDocuments` + a new `getOrCreateServices`) after N = 100 compiler calls.

### Install story per client

Written by `eligian init` (new projects) and `eligian agents setup` (existing projects), documented in `packages\cli\README.md`. Generated configs prefer a direct `node` launch of the project-local install (no npx cold start, no shell wrapper question on Windows); `npx` is the documented fallback:

| Client | File / command (generated) |
| --- | --- |
| Claude Code | `.mcp.json`: `{ "mcpServers": { "eligian": { "command": "node", "args": ["<abs>\\node_modules\\eligian\\bin\\cli.js", "mcp"] } } }`; fallback `claude mcp add eligian -s project -- npx -y eligian@^1.1 mcp` |
| Cursor | `.cursor\mcp.json`, same `mcpServers` shape |
| VS Code (Copilot) | `.vscode\mcp.json`: `{ "servers": { "eligian": { "type": "stdio", "command": "node", "args": [...] } } }`; Phase 4 makes this automatic via the extension |
| Codex | `.codex\config.toml`: `[mcp_servers.eligian] command = "node" args = [...]`. Project-level Codex config applies only to trusted projects **[UNVERIFIED]**; the README says so until verified |

`eligian mcp --print-config <claude|cursor|vscode|codex>` prints the snippet. `eligian agents setup [--client …]` *merges* into existing files (JSON: add/replace the `eligian` key only, keep other servers; TOML: append/replace the `[mcp_servers.eligian]` table) and writes the `AGENTS.md` block between `<!-- eligian:begin -->` / `<!-- eligian:end -->` markers (idempotent). Windows: the generated absolute path uses backslashes; whether `npx` needs a `cmd /c` wrapper on native Windows is **[UNVERIFIED]** (not in the current Claude Code MCP page) — the Phase 1 exit includes a real Windows handshake with both the `node` and the `npx` form, and the fallback snippet is adjusted to what works. Passive context for other clients is generated from the same source: `.cursor\rules\eligian.mdc`, `.github\copilot-instructions.md` block, Codex reads `AGENTS.md` natively **[UNVERIFIED: which clients read AGENTS.md today; verify in Phase 2]**.

### Versioning and compatibility

- `mcp` ships in **`eligian` 1.1.0** (minor). Starters (`packages\language\src\starters\starters.ts`) move from `eligian: '^1.0.0'` to `'^1.1.0'`; `packages\cli\src\__tests__\init.spec.ts` and the AGENTS.md line "starters depend on `eligian ^<major>.0.0`" change to "`^<major>.<minor-that-introduced-mcp>.0`". In a project with `eligian` 1.0.x, `eligian mcp` is swallowed by the default `compile` command (`.command('compile', { isDefault: true })` in `main.ts`) and exits with an I/O error for a file named `mcp`; the README documents the failure, and the generated `npx` fallback pins `eligian@^1.1`.
- Docs ship in the tarball: `packages\cli\dist\docs\**` added to `files`. The generator runs **inside `esbuild.mjs` after the production `rmSync(dist)`** (`prepack` = `build:prod` = `node esbuild.mjs --production`, which deletes `dist` first; a generator in `build` alone would ship no docs). `package-bin.spec.ts` asserts the exact packed file list including `dist/docs/index.json`; `publish-cli.yml`'s "Try the package" step reads one doc through the installed `eligian mcp`.
- `serverInfo.version` = `packages\cli\package.json` version. Every response header carries `eligian <cli version> · eligius <version>`; `getCompilerVersion()` in `packages\language\src\compiler\pipeline.ts` is hard-coded to `{ compiler: '0.0.1', eligius: '1.1.4' }` and `compiler\index.ts` exports `VERSION = '0.0.1'`: Phase 0 injects both at build time (`esbuild` `define` from `packages\cli\package.json` and `eligius/package.json`) and adds a test that the header matches the package files.
- Docs are found via a `docsRoot` option (default `new URL('./docs/', import.meta.url)` next to `dist\cli.mjs`); the specs pass the generator's output dir, since `import.meta.url` resolves to `src\` under vitest.
- Drift and correctness tests (Phase 1 on): registry operations, controllers, timeline events, grammar keywords, starter names and `eligius-configuration.json` top-level properties all appear in the docs; literate probes in `map-*` chunks compile and match their snapshots (§3.3); runtime claims in section C are executable (§3.3 C).

### MCP registry

Phase 5: `"mcpName": "io.github.rolandzwaga/eligian"` in `packages\cli\package.json`, a `server.json`, and a `mcp-publisher publish` step after `npm publish` in `publish-cli.yml`.

---

## 3. Knowledge architecture

### 3.1 Two sources, one index

```
packages\cli\
  scripts\generate-knowledge.ts     build-time generator (tsx; outside tsconfig include, no .d.ts emit,
                                    not under effect:check or coverage); deterministic: no timestamps
  src\mcp\
    knowledge\curriculum\           hand-written markdown, one file per chunk
                                    frontmatter: id, title, kind, use_cases, see, card (the ~120-word card)
    knowledge\search.ts             tokenised keyword search over the index
    server.ts                       McpServer layer, instructions (per phase), toolkit
    compiler-lock.ts                the Effect Semaphore
    tools\<name>.ts                 one file per tool
    stdio.ts                        Node Stdio layer + stdout redirect
    diagnostics.ts                  McpDiagnostic
  dist\docs\                        build output, shipped in the tarball
    index.json                      [{ id, title, kind, use_cases, words, see, card }]
    curriculum\*.md  generated\*.md
```

Chunk = one markdown file with frontmatter and two tiers: `card` (≤ 120 words: form, what it compiles to, the one pitfall) and the body (300–1,200 words, hard limit 1,500). `index.json` with cards is what `eligian_docs` returns with no arguments (~8 KB).

### 3.2 Generated (build time, from code, never hand-edited)

| Chunk(s) | Source | Content |
| --- | --- | --- |
| `generated/operations-index.md` | `packages\language\src\compiler\operations\registry.generated.ts` via `getAllOperations()`; `SELF_RESOLVED` in `compiler\transformers\runtime-values.ts` | **the primary anti-guessing artefact**, read once (~3k tokens): one line per operation, grouped by category: name · arg types/enums · NEEDS · PROVIDES · ERASES · resolves-chains? · one Eligian call form |
| `generated/operations/<name>.md` (one per registry operation) | same, merged with `curriculum\operations\<name>.md` overlays when present | full card: positional parameters (type/enum/required/default/erased), dependencies, outputs, description, Eligian usage |
| `generated/dataflow-tables.md` | `SELF_RESOLVED`, registry `erased`/`outputs` | which operation resolves `$operationdata`/`$globaldata`/`$scope` chains in which field; erased parameters (106 in the registry; `forEach.collection` is the non-erased exception); persistent outputs (`calculationResult`, `mathResult`, `result`, `json`, …). Correctness test `dataflow-tables.spec.ts`: for every operation × field, lint a probe config with a chain string through `eligius/lint` and assert W150 fires exactly where the table says the field is not resolved (Eligius' own `RESOLVING_FIELDS` is not exported from `eligius/lint`, so the test probes behaviour) |
| `generated/controllers.md` | `completion\metadata\controllers.generated.ts` + `curriculum\controllers\<name>.md` | per controller: status line (recommended / constrained / do-not-use, from the overlay), positional params, dependencies, the `addController("Name", …)` form; RoutingController is **do-not-use** (its metadata says "work in progress, do not use this yet"); LottieController marked constrained until `lottie-web` is verified under `--bundle`/`dev`/`smoke` (it is a dependency of the extension only) |
| `generated/events.md` | `completion\metadata\timeline-events.generated.ts`, `utils\event-arg-types.ts` | event name, `eventArgs` types, the `on event "<name>" action …` form; `timeline-complete` carries no args |
| `generated/dom-events.md`, `generated/key-names.md` | `utils\dom-events.ts`, `utils\key-names.ts` | lists for `on <event> "<sel>" …` and `on key "<keys>" …` |
| `generated/html-elements.md` | `completion\html-elements.generated.ts` | element → attributes for `createElement` |
| `generated/syntax-cheatsheet.md` | `packages\language\src\eligian.langium` (Langium grammar loader at build time) | keywords, contextual keywords (`ActionName` rule), one-line form of every statement rule |
| `generated/starters/<name>.md` | `starters.ts` (`starterFiles`) | each starter's files verbatim, as known-good minimal projects |
| `generated/config-shape.md` | `node_modules\eligius\jsonschema\eligius-configuration.json` resolved via `require.resolve('eligius/package.json')` (ships in eligius' `files`; never the sibling checkout) + `config-builder.ts` defaults | the `IEngineConfiguration` tree with the Eligian construct that fills each field; the fields Eligian never emits (`timelineFlow`, playlists, container providers, KeyboardStepSource, `positionSource.poster`/`muted`); that ids are `crypto.randomUUID()` per compile; that the schema rejects valid output and `eligius/lint` is the validator to trust |
| `generated/diagnostics.md` | a runtime registry of code constants (`packages\language\src\validators\codes.ts`, Phase 0) + `LINT_RULES_CHECKED_BY_ELIGIAN` + smoke/review codes, merged with `curriculum\diagnostics\<code>.md` overlays | code → cause → fix. Missing overlay = a failing Vitest assertion in `mcp-knowledge.spec.ts` (listed, not a build failure); codeless diagnostics fall back to a per-`source` generic overlay |
| `generated/examples/<id>.md` | `examples\eligian-tour\*.eligian`, the starters, `evals` reference solutions | snippets cut at `// @mcp-example <id> <title>` … `// @mcp-end`. `examples\demo.eligian` is excluded (it fails `check --selector-not-in-layout ids --max-warnings 0` with 13 warnings today; §7 Phase 0 decides its fate) |

Generator: `pnpm -C packages\cli generate:knowledge`, called from `esbuild.mjs` (dev and production). Output deterministic; the drift spec is the gate.

### 3.3 Hand-curated curriculum (`curriculum\`)

Each file has a `card` and a body. **Literate probes**: every `map-*` chunk embeds ```` ```eligian probe ```` blocks; the generator compiles each with `compileWithMap` and splices the real JSON fragment (ids stripped, keyed by action name / timeline uri) after it; `mcp-knowledge.spec.ts` fails when a probe stops compiling or its output differs from the checked-in snapshot (`__snapshots__`). No hand-written JSON anywhere in the curriculum.

**A. Orientation**
- `what-is-eligius.md`, `what-is-eligian.md` (file kinds, toolchain).
- `project-layout.md`: canonical layout aligned with the starters (`main.eligian`, `layout.html`, `styles.css`, `locales.json`, `media\` for video/audio as the video starter uses, `assets\` for images, `lib\*.eligian`, `host.ts`), naming, when to split into libraries, where output goes.
- `not-eligian.md` (negative knowledge, aimed at the model's priors): no GSAP/Remotion tweens, no CSS keyframes in the DSL, no `else if`, no HLS/DASH, `custom` without a host-registered position source (decided Q10; separate spec), no return values from called actions, no cross-timeline variables outside `$globaldata`, no `muted`/`poster` options, no relative `seek`, no Eligius features unreachable from Eligian. Each line names the alternative.
- `decisions.md`: one rule + one counter-example per decision: provider; one timeline per view vs labels in one timeline; action vs event action vs `on … run`; when to make a library; CSS transition vs `animate`; `addClass`/`removeClass` pair vs end block; stated default architectures for a deck (one timeline per slide, keyboard listener per slide, balanced in `on leave`), a hub + chapters story, a media annotation (raf hub first with a Start gesture), a scrollytelling piece.

**B. Eligian → Eligius mapping**, one chunk per construct, with literate probes:
- `map-program-and-config.md`; `map-timeline-and-providers.md` (incl. media: engine `uri` = the `from` path, `timelineUri` in `navigate-operations.ts`; `audio` also runs through `VideoPositionSource` and appends a `<video>`; no native controls; browser autoplay: `VideoPositionSource` sets `controls=false`, `autoplay=false`, leaves `muted` unset and `activate()` may reject with `NotAllowedError`, while the `--bundle` runtime calls `engine.init().then(() => engine.start())` on DOMContentLoaded, so a media-first presentation needs a start gesture).
- `map-actions-and-calls.md`; `map-dataflow.md` (the data-start table; the generated tables; "inputs are consumed, outputs persist until overwritten" as the core rule); `map-erased-parameters.md`; `map-events-and-interactions.md`; `map-control-flow-and-data.md`; `map-controllers.md` (status lines; `end:`-prefixed listener action names; KeyboardController precedence **[UNVERIFIED: space play-toggle, inputs ignored]**); `map-event-actions.md` (global namespace, `broadcastEvent` reach, auto-advance needs a terminal beat broadcasting `request-timeline-uri` with the target's uri since `timeline-complete` has no args); `map-imports-and-assets.md` (global action namespace, reachability pruning and `<library>.<action>` qualification from `library-imports.ts`; raw `addController("DOMEventListenerController", …, ["name"])` action names — Phase 2 verifies whether Eligian validates them and adds a validator or review check if not); `map-locales-and-languages.md` (runtime switch = broadcast `language-change`; recipe `action setLanguage(code)` used from `on click … run`).

**C. Engine runtime semantics** (source: `examples\eligian-tour\ELIGIUS_EXECUTION_MODEL.md`, re-verified in Phase 0 by probes; every claim here is executable in `packages\cli\src\__tests__\mcp-runtime-claims.spec.ts`, which runs a tiny `.eligian` probe per claim on the installed eligius in jsdom, so an eligius bump fails CI before the docs lie):
- `runtime-engine-lifecycle.md`: `init()` replaces the container's children with `layoutTemplate` and throws when `containerSelector` (`#eligius-container`) is missing; locales load before the provider; `timelines[0]` (first declared) is the entry timeline; `initActions` run before the first `on enter` and end at destroy; `engine.start()` (the bundle) vs `init()` alone; without a `layout` import `generateLayoutTemplate` emits only timeline containers; `destroy` detaches leftover controllers; the hosting page contract (`#eligius-container`, `window.EligiusBundled.init/ready`).
- `runtime-scheduling.md`: ends before starts at the same position; a start waits for pending ends; async operations delay the end; `switchTimeline` ends the old timeline's active actions; `timelineComplete` and `loop` restarts do not run `on leave`. **Seek model**: a seek only ends active actions that no longer cover the position and only starts actions that do; skipped ranges never run; an end block must be the exact inverse of its start; cumulative state belongs in a covering range or in `on enter`. The rule: *the DOM is a function of the position.*
- `timing-models.md`: timeline seconds vs operation milliseconds (`wait`, `animate` take ms); in-flight waits/animations keep running through pause, seek and navigation; listener actions run outside the timeline (an `addClass → wait(3000) → removeClass` in a click handler can land on a view the user left); keep durations on the timeline.
- `runtime-quirks.md`, mined from `f:\projects\eligius\eligius\src\test\differential\quirks.spec.ts` (read-only reference): `loopLength` = length−1, `'false'`/`'0'` truthy in `when`, `==` against an unresolved chain is strict and false, `!a==b` binds `!` first, a controller holds a reference to the bag, an operation returning `undefined` hands the next one an empty bag.
- `runtime-state-pitfalls.md`: the non-mechanical pitfalls only (source-order anchoring, sub-100 ms staggers, `custom`, selectors only in CSS); the mechanical ones are *caught* by the review pass (§4 `eligian_check`) and named here with their codes.

**D. Whole-presentation guidance**
- `layout-html.md`, `css-conventions.md`, `provider-choice.md` (decision table; media needs a start gesture: raf hub with a Start button that `navigate`s to the media timeline, or a visible `on click … play`), `presentation-patterns.md` (hub + chapters, keyboard deck with per-slide timelines, replay = reset-then-seek, auto-advance recipe, relative next/previous recipe, progress bar, staggered lists, typewriter, counters, language toggle; compiled output for each via probes), `assets-and-host-modules.md` (placeholders for media the agent cannot create: a generated silent mp4/mp3 or a poster image, how `eligian_project` reports missing `from` files), `host-modules-contract.md` (operation signature `function(this: scope, operationData) → operationData | Promise`, parameters read by name from the bag, *always return the bag*, no declarable needs/provides — `hostSignature` in `compiler\operations\host-operations.ts` gives `dependencies: []`, `outputs: []` — so select inside the block before calling; controller `init/attach/detach` lifecycle; the tour's `host.js` as the example), `verification-ladder.md` (check → review warnings → fmt → smoke with scenarios → determinism → `dev`; how an agent with a browser MCP drives the dev page via `window.EligiusBundled.ready`; the VS Code preview's `eligius-runtime` diagnostics).

**E. Storyboard** (`storyboard.md`): the machine-readable template (§5) plus two worked examples (raf, video).

**F. Diagnostics overlays** (`diagnostics\<code>.md`): cause + fix for every code, ≤ 120 words each.

**G. Operation and controller overlays** (`operations\<name>.md`, `controllers\<name>.md`): Eligian call example, idioms, pitfalls, status.

Sources to mine for B–D: `ELIGIUS_EXECUTION_MODEL.md` (after Phase 0 re-verification), root `AGENTS.md` DSL one-liners, `specs\047`, `050`, `052`, `055`, `056`, `057`, the tour storyboards (`examples\eligian-tour\storyboards\chapter-0*.md`; author-facing, not served verbatim), `f:\projects\eligius\eligius\README.md`, `src\operation\README.md`, controller metadata descriptions, `quirks.spec.ts`. Not `LANGUAGE_SPEC.md` §11.2/11.3, §4.2, §5.9, §8.1.1, §12.1 until Phase 0 fixes them; not `KNOWN_ISSUES.md`.

### 3.4 Retrieval design

- `eligian_docs()` → the index with cards (~8 KB). `eligian_docs({ ids, detail: true })` → bodies, up to 6 ids / 6,000 words per response (overflow listed as "not returned"). `eligian_docs({ query })` → top 8 entries with the matching heading and card; no bodies.
- `generated/operations-index.md` is the primary operations teaching; `eligian_operations` is for enum values, unknown names (with `suggestSimilarOperations`), host declarations and batches (`names: string[]`).
- Diagnostics carry their overlay inline.
- Every chunk ends with `see:` ids.
- Resources: the same chunks as `eligian://docs/<id>` for @-mention (Phase 4). Prompts: one, `new-presentation` (Phase 4). Both optional; tools are the contract. Verified for Claude Code: tool search is on by default, only tool names and server instructions load at session start, and resources/prompts are user-pulled.

### 3.5 Server `instructions` (priming)

Claude Code facts (verified at `code.claude.com/docs/en/mcp`): with tool search, "only tool names and server instructions load at session start"; server instructions and the description of an upfront tool are cut at **4,096** characters; a deferred tool's description at **16,384**, and tool search matches the query against the start of the description; `_meta["anthropic/alwaysLoad"]: true` marks a tool to load upfront; `_meta["anthropic/maxResultSizeChars"]` raises the 50,000-char spill threshold (ceiling 500,000).

Consequences:
- **Three upfront tools**: `eligian_docs`, `eligian_operations`, `eligian_check` (`Tool.Meta({ "anthropic/alwaysLoad": true })`). Their descriptions ≤ 1,000 chars each.
- **Every "when to call" trigger lives in the instructions**, one line per tool, name first. Instructions ≤ 4,096 chars, asserted in `mcp-server.spec.ts`.
- Deferred tools (`compile`, `project`, `init`, `fmt`, `smoke`) get rich descriptions within 16,384 chars with searchable keywords in the first 200 chars.
- **Each phase has its own instructions string** naming only the tools and chunk ids that phase ships (`server.ts` picks by a build-time constant; the spec asserts every id/tool named exists).

Final (Phase 2+) instructions:

```
Eligian: a DSL compiled to Eligius presentation JSON (timelines of timed actions; an action is a
chain of operations over one shared operationData bag). No model was trained on Eligian. Do not
write it from memory. If a construct is not in the cheatsheet, Eligian does not have it: read
doc "not-eligian" for the alternative, or ask.

Use these tools whenever a task touches .eligian files, layout HTML, CSS, locales.json or a host
module of an Eligius presentation:
- eligian_docs: FIRST for a new presentation: ids ["storyboard","decisions","project-layout"],
  then write STORYBOARD.md. Before each construct you have not written this session: its
  "map-*" card (index) or body (detail:true). Read "operations-index" once.
- eligian_operations: BEFORE calling any operation not in your session so far; batch with
  names:[...]. Cards lead with NEEDS / PROVIDES / ERASES.
- eligian_init: scaffold a new project from a starter (writes files; next steps in the reply).
- eligian_project: the ids, classes, locale keys, asset files and host names you may reference.
  Call before writing selectors; layout + CSS come before timelines.
- eligian_check: after EVERY edit until 0 errors and 0 warnings. Each diagnostic carries its fix.
- eligian_fmt: write:true once check is clean.
- eligian_smoke: after fmt; pass a scenario for every interaction you wrote (click, key, seek).
- eligian_compile: once after your first timeline passes check (select it, explain:true), and
  whenever behaviour surprises you.

Rules the engine imposes:
1. A fired block has nothing selected. Timeline, lifecycle and init blocks start with {};
   event actions start with {eventArgs}; listener actions get the controller's data plus
   eventTarget/eventKey; a called action gets a copy plus its arguments. Select before you mutate.
2. Nothing flows back from a called action. Start and end blocks are independent runs.
3. The DOM is a function of the position: every visible state belongs to a range that covers it,
   an end block is the exact inverse of its start, and skipped ranges never run on seek.
4. A selector must exist in layout.html or the imported CSS; check rejects the rest.
5. Every controller added in on enter is removed in on leave. Durations live on the timeline,
   not in wait()/animate() milliseconds.
Review STORYBOARD.md against the compiled timelines before declaring done.
```

(≈ 2,300 chars.) The Phase 1 variant omits `eligian_project`, `eligian_smoke`, `eligian_compile` and the scenario line.

---

## 4. Tool surface

Eight tools, all prefixed `eligian_`, defined with `effect/ai` `Tool.make` + `Toolkit` in `packages\cli\src\mcp\tools\<name>.ts`. Common conventions:

- Paths: see the path policy in §2. Every response echoes the resolved absolute path.
- **Error shape**: a failed check is a *successful* tool result with `ok: false` and structured `diagnostics`. `isError: true` only when the tool could not run: `{ error: { kind: 'not-found' | 'io' | 'timeout' | 'cancelled' | 'internal', message, path? } }`.
- Diagnostic record `McpDiagnostic` (`packages\cli\src\mcp\diagnostics.ts`), built from `CheckDiagnostic` (`check.ts`), `SmokeProblem` (`smoke-runner.ts`), lint findings (`check\lint.ts`) and review findings: `{ source: 'parser'|'validator'|'type'|'linker'|'compiler'|'eligius-lint'|'review'|'smoke'|'fmt', severity, code, message, file, line, column, endLine?, endColumn?, excerpt, suggestions?: string[], quickFix?: string, docs?: string (overlay id), timeline?, time?, step? }`. Phase 1 extends `CheckDiagnostic` in the language package with optional `data` (suggestions, quick-fix text; the code-action provider `lsp\select-element-fix.ts` is refactored so its text is available to diagnostics) with tests.
- Annotations: read-only tools get `Tool.Readonly`; `eligian_init` and `eligian_fmt(write:true)` are the only writers (`Destructive: false, Idempotent: true`).
- Every response starts with `eligian <ver> · eligius <ver> · <tool> · <path>`.
- `response_format: 'concise' | 'detailed'` on compile, project, smoke; default concise.

### Learn

**`eligian_docs`** — index with cards, bodies, search.
- Inputs: `{ ids?: string[] (≤ 6), detail?: boolean, query?: string }`. None → index.
- Wraps: `dist\docs\index.json` + files via `docsRoot`; `knowledge\search.ts`.
- alwaysLoad.

### Inspect

**`eligian_operations`** — operations, controllers, events, DOM events, key names, host declarations.
- Inputs: `{ names?: string[], query?, category?, needs?, provides?, kind?: 'operation'|'controller'|'event'|'dom-event'|'key', path? }`. `path` loads the program so `extensions {}` declarations count (`getOperationSignature(name, node)`, `hostOperations`/`hostControllers`).
- Output: cards (NEEDS / PROVIDES / ERASES first, then params, status, Eligian form, overlay); unknown name → `suggestSimilarOperations`.
- Wraps (serialised when `path` is given): `getOperationSignature`, `getAllOperations`, `searchOperations`, `getOperationsByCategory`, `findOperationsWithDependency`, `findOperationsWithOutput`, `suggestSimilarOperations`; `controllers.generated.ts`, `timeline-events.generated.ts`, `utils\dom-events.ts`, `utils\key-names.ts`.
- alwaysLoad.

**`eligian_project`** — what a presentation contains and what names may be referenced.
- Inputs: `{ path (entry .eligian or directory), response_format? }`.
- Output: files found (entry, libraries, layout, styles, locales, assets, host module) with sizes; CSS classes/ids; layout ids/classes (`html\layout-elements.ts`, `html\html-registry.ts`); the selector union (`css\selector-sources.ts`); locale keys per language; host declarations; outline (timelines with container/provider/duration/labels, actions with params and inferred selector/className roles from `css\parameter-roles.ts`, event actions, consts, imports — the data of `lsp\eligian-document-symbol-provider.ts`); **asset checks**: every media `from` and named asset import that does not exist on disk, duplicate media `from`, timeline `in` selectors missing from the layout; starters available.
- Wraps: `getOrCreateServices` + document load (serialised), CSS/HTML registries, locales helpers, `STARTERS`.

**`eligian_compile`** — what source becomes, mapped back to source.
- Inputs: `{ path, select?: { timeline?, action?, line? }, view?: 'summary'|'fragment'|'full', explain?: boolean, includeMap?: boolean }`.
- Output: summary; `fragment` = the JSON of the selected timeline action/action with its source range (via the Eligian map), ids stripped, keyed by action name and timeline uri; `full` = whole config (`Tool.Meta({ "anthropic/maxResultSizeChars": 200000 })`). `explain: true` (Phase 3, after provenance) appends per emitted operation its `origin` and the rule text with the curriculum id.
- Wraps: `compileFile(path, { optimize })` (`packages\cli\src\compile-file.ts`; it always returns `map`) → `compileWithMap`/`buildEligianMap`; `locateConfigPath`.
- Provenance prerequisite (Phase 3, language package): `OperationConfigIR` (`compiler\types\eligius-ir.ts`) gains `origin: 'source'|'call'|'param-binding'|'erased-save'|'erased-restore'|'concat'|'saved-result'|'target'|'with'|'interaction'|'lifecycle'|'loop-control'|'init-globaldata'|'sequence'|'stagger'|'library-qualified'`, set in every transformer, carried through the optimizer into `EligianMapOperation`; a test asserts every emitted operation in the examples has an origin.

### Build

**`eligian_init`** — scaffold a project from a starter.
- Inputs: `{ directory, template: 'blank'|'chapters'|'video'|'library', title?, force?, agents?: boolean (default true: also `.mcp.json` + `AGENTS.md` block), client?: ('claude'|'cursor'|'vscode'|'codex')[] }`.
- Output: files written; next steps: "read `storyboard`, `decisions`; after the first timeline passes check call `eligian_compile(select, explain:true)`"; the run commands.
- Wraps: `runInit` (`packages\cli\src\init.ts`): refuses only when a starter file already exists (not when the directory is non-empty), unless `force`; `starterFiles`; `agents.ts`.

### Verify

**`eligian_check`** — every diagnostic, Eligius lint, and the review pass.
- Inputs: `{ paths: string[], selectorNotInLayout?: 'off'|'ids'|'all' (default 'ids'), lint?: boolean (default true), review?: boolean (default true), maxWarnings?: number (default 0) }`.
- Output: `{ ok, files: [{file, errors, warnings}], diagnostics: McpDiagnostic[], summary }`.
- Wraps (serialised): `checkFiles` + `lintFile` (`withLint`, which merges library findings, is exported in Phase 1) + `reviewConfig` (`packages\cli\src\check\review.ts`, Phase 1–2; also run by the CLI `check`, `--no-review`): mechanical pitfalls over the compiled config + Eligian map, located at source: `controller-imbalance` (the walker lifted from `packages\language\src\compiler\__tests__\tour-controllers.spec.ts` into `packages\language\src\compiler\controller-balance.ts`: add/remove multisets per timeline through `requestAction`/`startAction` with operationData substitution; quick-fix text generates the `on leave` removals), `class-never-removed` (an `addClass` in a start block with no `removeClass`/`toggleClass` of that class on that selector in an end block or later range), `media-file-missing`, `media-from-duplicate`, `timeline-container-not-in-layout`, `media-timeline-first-without-start-gesture`, `entry-timeline-without-enter`, `host-operation-in-block-without-select`. Each a warning with an overlay.
- Defaults stricter than the CLI on purpose; the description says so.
- alwaysLoad.

**`eligian_fmt`** — formatter check or write.
- Inputs: `{ paths, write?: boolean }`.
- Output: per file `{ file, formatted, lineDiff? }`; rewritten files when `write`.
- Wraps: a new object-returning `fmtFiles` in `packages\cli\src\fmt.ts` (built on `formatSource` + the exported `lineDiff`; `runFmt` keeps `{ output, exitCode }` for the CLI).

**`eligian_smoke`** — play every timeline on the real engine in jsdom, with scenarios.
- Inputs: `{ paths, strict?: boolean (default true), timelines?: string[], scenario?: ScenarioStep[] | path, determinism?: boolean, timeoutMs?: number (default 45000), stepTimeoutMs? }`.
- Scenario (also `eligian smoke --scenario <file.json>`): steps `{ seek: s } | { click: "#sel" } | { key: "ArrowRight", in?: "#sel" } | { navigate: "<timeline>" } | { wait: ms } | { snapshot: "<label>" }` executed in jsdom against the real engine (`dispatchEvent` on the selected element; keyboard events on the KeyboardController's element); each step returns a DOM snapshot of the layout ids (classes, text, inline style), controllers attached per element, and `activeTimelineActions` from `compiler\eligian-map.ts`. Assertions `{ after, selector, hasClass | notHasClass | text | visible | controllers }` are evaluated by the harness and by the tool when passed.
- Determinism (Phase 3): for each boundary `t`, compare the DOM reached by linear play, by a fresh engine seeking straight to `t`, and by seeking to the end then back to `t`; report every element/class that differs, located through the map (`position-nondeterministic`).
- Media (Phase 3): `dom-environment.ts` already stubs `HTMLMediaElement.play`; it gains a fake clock (`duration`, `currentTime`, `loadedmetadata`/`timeupdate`) so `VideoPositionSource` can be seeked and media timelines run instead of being skipped.
- Output: `{ ok, timelines: [{name, boundaries, skipped?}], steps: [...], problems: McpDiagnostic[] }`; partial when killed on timeout.
- Wraps: the child process (§2); `smoke-command.ts` gains `--format ndjson` (one line per timeline/step) and exports `smokeFile`.

### Deliberately NOT tools

| Not a tool | Why | Instead |
| --- | --- | --- |
| `eligian dev` / preview | long-running process with a browser | `verification-ladder.md`: run `npx eligian dev main.eligian`; Phase 4 makes `dev` forward engine `error` events and console errors from the page to the terminal and `.eligian\dev-errors.json`, located with the map (today `dev-server.ts` only sends `build-error`/`ok`) |
| `--bundle` | artifact build | `npx eligian compile --bundle` |
| editing/patching, "generate presentation" | the model edits | `eligian_init` + curriculum |
| raw `LANGUAGE_SPEC.md` / grammar dump | 3,246 lines in context | chunks + cheatsheet |
| `eligian_lint`, `eligian_review`, `eligian_explain_error`, `eligian_trace` | folded into `check` / `smoke` | — |
| CSS/HTML editing helpers | `eligian_project` gives the names | — |

---

## 5. The expert workflow the server teaches

1. **Idea → storyboard** (`storyboard.md`). `STORYBOARD.md` in the project, machine-readable: a header (audience, provider + reason, languages, assets, host module) and one fenced table per view:

   ```
   | timeline | start | end | selector | change | end-block |
   | Intro    | 1     | 8   | #headline | addClass in | removeClass in |
   ```
   plus an `interactions` table `| trigger | target | verb | timeline |`. The harness (and the agent, told to by the instructions) checks every beat row against the compiled config through the Eligian map: a timeline action in that timeline covering `[start, end]` whose operations touch that selector; every interaction row against a listener action. `eligian_project` reports the storyboard's beat count vs compiled timeline actions (`storyboard` section) so the agent can self-check.
2. **Project skeleton** (`eligian_init`, `project-layout.md`, `decisions.md`): starter by provider; `.mcp.json` + `AGENTS.md` block; `eligian_project` confirms the inventory and asset files.
3. **Layout and CSS first** (`layout-html.md`, `css-conventions.md`): one container per timeline, ids for everything a timeline selects, state classes in CSS. `eligian_check` with `selectorNotInLayout: 'ids'` rejects anything else.
4. **Timelines, one view at a time** (`map-*` cards, `operations-index`): `on enter`/`on leave` own the view; beats as ranges with inverse end blocks; interactions in `on enter`; controllers removed in `on leave`. After the first timeline passes check: `eligian_compile(select, explain:true)` once.
5. **Verify** (`verification-ladder.md`): `eligian_check` (incl. review warnings) → `eligian_fmt(write)` → `eligian_smoke` with a scenario per interaction and `determinism:true` → `eligian dev` for a human look.
6. **Iterate**: the storyboard is the spec; before declaring done, compare it with `eligian_project`'s storyboard section and run `runtime-state-pitfalls`.

Enforcement: the instructions carry the triggers (§3.5); `eligian_init` repeats the next steps; `eligian_check` is strict and attaches fixes; the review pass turns the mechanical pitfalls into warnings the `--max-warnings 0` gate measures; the `AGENTS.md` index (~6–8 KB) repeats the workflow and the five rules and points at the on-disk chunk files.

---

## 6. Eval set

### 6.1 Pass gate (every case)

Run from the produced project directory with the tarball installed in it (`node node_modules\eligian\bin\cli.js`):

1. `eligian check <entry> --max-warnings 0 --selector-not-in-layout ids` exit 0 (Eligius lint + review pass).
2. `eligian fmt --check "**/*.eligian"` exit 0.
3. `eligian smoke <entry> --strict --format json --scenario <case>.scenario.json --determinism` exit 0; every scenario assertion holds.
4. `eligian compile <entry> --eligian-map -o out\config.json` exit 0; structural assertions over `out\config.json` and the files (assertion library `packages\cli\src\mcp\evals\assert.ts`, inside the CLI package so it is type-checked and linted): `timelines.count`, `timelines[n].type/positionSource/duration/loop`, `actions.named`, `operations.used`, `controllers.used`, `controllers.balanced`, `files.exist`, `layout.hasId`, `locales.languages`, `storyboard.exists`, `storyboard.beatsCovered` (every storyboard beat maps to a timeline action), `beats.min(n)` (timeline-action count ≥ the storyboard's beats, so warnings cannot be silenced by deleting code).
5. Behavioural assertions from the scenario (3–6 per case).
6. Budget: ≤ 2 self-correction rounds after the first check (counted as check invocations, CLI or tool, after the first); tool calls ≤ the reference run's count × 1.5 (set per case from the reference solution's own agent run, not guessed); wall clock ≤ 15 min; tokens-from-tools ≤ 80,000 chars.
7. Rubric (reported separately, not gating): storyboard quality and provider justification, scored by an LLM judge with a pinned prompt (`evals\mcp\rubric.md`), 1–5.

Comparisons of compiled output are by action name and timeline uri, never by id (ids are random per compile).

### 6.2 Cases (positive)

Each case: `evals\mcp\cases\<id>.json` (prompt, fixtures, scenario, assertions) and a reference solution in `packages\cli\src\__tests__\__fixtures__\mcp-solutions\<id>\` that `mcp-solutions.spec.ts` runs through the gate in PR CI (proof the case is solvable before it is scored; per-test timeout 120 s for smoke).

| # | id | Prompt | Scenario + behavioural assertions | Structural |
| --- | --- | --- | --- | --- |
| 1 | `title-card` | "Make a 10-second title card presentation: a headline fades in at 1s, a subtitle slides up under it at 3s, both fade out at 8s. Play/pause buttons." | seek 2 → `#headline` hasClass in; seek 9 → notHasClass in and subtitle hidden; click `#pause` → engine paused (no position change after wait 300); click `#play` → position advances; determinism clean | 1 raf timeline, duration 10; `__on__play`/`__on__pause` actions; layout has headline/subtitle ids; CSS defines the state classes |
| 2 | `three-chapters` | "A three-chapter product story (Problem, Solution, Results). A hub with three buttons, each chapter its own timeline with a Back button. Chapter text in English and Dutch, with a language toggle." | click `#to-problem` → active timeline Problem, `#hub` not visible; click `#back` → Hub; after each leave `controllers` per element balanced; click `#lang-nl` → a LabelController text changes to the Dutch string | ≥ 4 timelines; `__nav__*` actions; `languages` with `en-US` + `nl-NL`; `LabelController`; every chapter has `on enter`/`on leave`; `controllers.balanced` |
| 3 | `staggered-list` | "Reveal a list of 6 feature cards one after another, 0.4s apart, then highlight the third one for 2s." | seek 0.5 → card 1 visible, card 2 not; seek 2.1 → all 6 visible; highlight window: card 3 hasClass highlight inside, not outside; determinism clean | one `stagger` (6 actions 0.4 s apart); 6 card ids in layout; no `class-never-removed` |
| 4 | `video-subtitles` | "Subtitle track over the video `media/intro.mp4` (30s): five captions at given times, with a progress bar. The presentation starts from a Start button." (harness supplies a 30 s silent mp4) | with the media clock stub: seek to each caption's midpoint → that caption visible, the others not; click `#start` → media timeline active | 1 `mediaplayer` timeline with `VideoPositionSource`, `from` set; 5 ranged caption events; `ProgressbarController` or Subtitles controller; CSS sizes `.eligius-video`; a raf hub timeline first; `media-timeline-first-without-start-gesture` clean |
| 5 | `scrollytelling` | "A scroll-driven explainer: as the reader scrolls a 4000px article, four illustrations appear and the heading changes." | seek 25/50/75/100% of duration → illustration n visible, heading text n | 1 timeline with `ScrollPositionSource`, `duration`, scrollable selector in layout; 4 ranged events |
| 6 | `keyboard-deck` | "A 12-slide deck navigated with the arrow keys; Home returns to slide 1. Slide numbers shown bottom-right." | key ArrowRight ×3 → only slide 4 visible, counter text "4 / 12"; key ArrowLeft → slide 3; key Home → slide 1; after each switch `controllers.balanced` | the project's opinion (`decisions.md`): one timeline per slide, a KeyboardController added in `on enter` and removed in `on leave`, ArrowRight/ArrowLeft `navigate` to neighbours, Home to slide 1; 12 timelines; `on key` → `KeyboardController` |
| 7 | `typewriter-counter` | "Type out a sentence character by character over 4 seconds, then count a number up from 0 to 250 over 3 seconds." | seek 2 → text is a proper prefix; seek 4 → full sentence; seek 7 → counter text "250"; determinism clean | `for`/`sequence`; `calc`/`math` + `setElementContent`; erased-parameter save/restore compiles; W151 clean |
| 8 | `library-reuse` | "Build a small animation library (fadeIn, fadeOut, slideIn with a direction parameter) in its own file and use it from a 15-second showcase timeline." | seek inside each showcase beat → the expected class on the expected element; determinism clean | `lib\*.eligian` with `library`; `import { fadeIn, fadeOut, slideIn }`; all three used; JSDoc; the library checks alone |
| 9 | `audio-lyrics` | "Karaoke-style lyrics for `media/song.mp3` (20s): each line highlights when sung, with click-to-seek on each line, behind a Start button." (harness supplies the mp3) | media clock stub: seek to line n's midpoint → only line n highlighted; click `#line-3` → position = line 3's start | `audio` timeline with `from`; one range per line; `__on__seek*` actions; raf start timeline first |
| 10 | `host-module` | "A quiz slide: three answer buttons; clicking one calls a host function `score(answer)` from `host.ts` and shows a result panel for 3 seconds." | click `#answer-b` → `#result` visible and text from `score`; snapshot after 3.5 s (timeline-driven, not `wait`) → hidden; the host operation returns the bag (smoke `host-operation-returned-non-object` clean) | `extensions "./host.ts" { operation score(answer: string) }`; `host.ts` exists; `on click … run`; result shown by a covering range |
| 11 | `replay-safe` | "A 20s intro that can be replayed from a Restart button at any time, and jumped to its 'reveal' at 12s from a Skip button." | seek 15, click `#restart` → DOM equals the DOM at position 0 of a fresh engine; click `#skip` → position 12 and the DOM equals linear play at 12; determinism clean | `as reveal` label and `seek reveal.start`; Restart = reset-then-seek |
| 12 | `port-from-json` | "Here is an Eligius JSON config. Rewrite it as an Eligian project." (harness supplies the compiled JSON of the `chapters` starter extended with one tour chapter, which passes the strict gate) | the scenario of the source project passes against the port | same timelines (uris, durations), action names and operation sequence per action (order-insensitive on inserted `setOperationData`), same controllers |

Negative/diagnostic cases (the agent must reach a clean state from a broken start, fixtures created in Phase 1):

| # | id | Start state | Pass |
| --- | --- | --- | --- |
| 13 | `fix-dataflow` | `addClass` before any select in an end block (`missing-action-dependency`) and an `erased-property-access` | both fixed with `target`/`with`/save-restore; `beats.min` unchanged; gate passes |
| 14 | `fix-selectors` | selectors only in CSS, two `styles` imports, `on click` bare in a timeline body, a controller added in `on enter` without removal | gate passes; layout gained the ids; `controllers.balanced` |

### 6.3 Arms

- **A0**: `AGENTS.md` index + the same docs on disk (`node_modules\eligian\dist\docs`) + the CLI, no MCP server.
- **A1**: A0 + the MCP server.
- Once, at the Phase 3 first run, for the record: **A-none** (no docs, no server).

Exit rule: A1 ≥ A0 on pass rate **and** A1 lower on rounds, tool calls and tokens. If A0 matches A1, ship docs-on-disk + `agents setup` and shrink the server to `check`/`smoke`/`compile` (the honest fallback).

### 6.4 How evals run

- Harness `evals\mcp\run.ts` (tsx; outside Biome and tsconfig; imports nothing from `packages\**\src` except through the built tarball). Per run: `pnpm -C packages\cli pack` once; per case: temp dir, `npm install <tarball>`, copy fixtures, write `.mcp.json` with `node <tmp>\node_modules\eligian\bin\cli.js mcp` (arm A1 only), write the arm's `AGENTS.md`, run the agent, run the gate, write `evals\mcp\results\<run>\<case>.json` (pass/fail, rounds, tool calls, tool-call sequence, tokens-from-tools from the stderr log, wall time, per-assertion detail, rubric) and a markdown summary.
- Driver: `claude -p "<prompt>" --mcp-config <tmp>\mcp.json --strict-mcp-config --permission-mode acceptEdits --allowedTools "mcp__eligian__*,Bash(node *),Bash(npx eligian*)" --output-format json`, model pinned per run. Project-scoped servers load without a prompt under `-p` (verified in the Claude Code docs). A Codex driver (`codex exec`) is optional later.
- Metrics beyond pass/fail: `operations-before-first-unknown` (fraction of runs where `eligian_operations` or `operations-index` was read before the first `unknown-operation`/`missing-action-dependency`), `explain-called`, tokens-from-tools, rounds per arm.
- Where: **locally, under the user's Claude subscription** (decided Q9): `pnpm evals:mcp [--case <id>] [--arm A0|A1] [--runs n] [--model sonnet|opus]` runs `claude -p` per case on the developer's machine, cases serial, results committed under `evals\mcp\results\`. No GitHub workflow and no API key; add `mcp-evals.yml` only if local runs become too slow. Budget: 14 cases × 2 arms × 3 runs × ≤ 15 min ≈ 21 h serial for a full run, so full runs are phase-exit events; intermediate phases run arm A1 only, 1 run per case (≈ 3.5 h).
- Model (decided Q9b): Sonnet-class drives the full runs (the weaker model shows whether the server teaches); one Opus-class run per phase exit shows the ceiling. The model is pinned per run and recorded in the results.
- Media fixtures: a 30 s silent mp4 and a 20 s silent mp3 generated by a script (`evals\mcp\fixtures\generate-media.ts`, no licence question), < 500 KB each, committed without LFS.
- Deterministic parts in PR CI: `packages\cli\src\__tests__\mcp-solutions.spec.ts` runs the gate on every reference solution.

---

## 7. Phased delivery

Day = one engineer-day, including the AGENTS.md checklist (`pnpm build`, `pnpm check`, `pnpm test`, `pnpm effect:check` for Effect code, language coverage at threshold: lines 79.8 / functions 80 / branches 69.9). The curriculum is its own track with review time, written against harness failures from Phase 1 day 2 on. Total **≈ 41 engineer-days** (Phase 0–3 ≈ 33; a usable server after Phase 1, ≈ 14).

### Phase 0 — Foundation (5 days)

Touches: `LANGUAGE_SPEC.md`, `packages\language\src\validators\**`, `packages\language\src\eligian-document-validator.ts`, `packages\language\src\compiler\pipeline.ts`, `packages\language\src\compiler\index.ts`, `packages\cli\esbuild.mjs`, `packages\cli\src\smoke\dom-environment.ts`, `packages\cli\src\dev\host-module.ts`, `packages\cli\src\bundler\*`, `packages\cli\src\__tests__\package-bin.spec.ts`, `examples\eligian-tour\ELIGIUS_EXECUTION_MODEL.md`, `examples\README.md` (demo labelled), `packages\cli\package.json` + `packages\cli\vitest.config.ts` (coverage gate), `packages\cli\KNOWN_ISSUES.md`, root and `packages\cli` `AGENTS.md`.
- `specs\058-mcp-server\phase-0-foundation\` (`spec.md`, `plan.md`, `tasks.md`, `compliance.md`) written by the phase workflow from this roadmap.
- **A code on every diagnostic**: `validators\codes.ts` registry of constants; the 9 `accept()` sites without `code` (timeline-validator 7, action-validator 2) get one; `eligian-document-validator.ts` wraps Typir diagnostics (`type-mismatch`, …) and Langium linker errors (`unresolved-reference`) with codes; parser errors `syntax-error`; `compileDiagnostic` gets codes. Test: `checkFiles` over the fixture corpus → 100% coded.
- **Runtime re-verification**: `mcp-runtime-claims.spec.ts` with one probe per claim in `ELIGIUS_EXECUTION_MODEL.md` (start/end independence, called-action copy, seek reconcile, forward skip, controller survival across switch, `loopLength`, returning `undefined`); fix the document where a probe disagrees.
- `getCompilerVersion`/`VERSION` injected at build time; test against the package files.
- Lazy imports in source (`jsdom`, `esbuild`, `effect/ai`); `package-bin.spec.ts` measures `--version` and the future `mcp` initialize time.
- `LANGUAGE_SPEC.md` §11.2/11.3 (real output: `startOperations[{systemName, operationData}]`, `timelines[].timelineActions`, seconds, requestAction/startAction pairs), §4.2, §5.9, §8.1.1, §12.1; §11.4 erased parameters.
- `examples\demo.eligian` (decided Q6): labelled "feature inventory, not idiom" in `examples\README.md` and excluded from the example corpus and the evals; bringing it to the strict gate is a later task.
- Coverage gate for `packages\cli` (decided Q8): `test:coverage:ci` runs `vitest run --coverage` with thresholds at the baseline measured on day 1; CI fails below them, so every MCP module ships covered.
- `KNOWN_ISSUES.md` entries verified/stale; AGENTS.md drift (pnpm version, bin mapping, no `src\index.ts`).
- Exit: `check:examples`, `smoke:examples`, `fmt:examples` green; 100%-coded test green; runtime-claims spec green; a reviewer reads the fixed spec sections against a compiled probe.

### Phase 1 — MVP server: learn + check (9 days)

Touches: `packages\cli\src\main.ts` (`mcp` subcommand), `packages\cli\src\mcp\{server,stdio,compiler-lock,diagnostics}.ts`, `packages\cli\src\mcp\tools\{docs,operations,check,fmt,init}.ts`, `packages\cli\scripts\generate-knowledge.ts`, `packages\cli\src\mcp\knowledge\**`, `packages\cli\src\check\review.ts`, `packages\cli\src\fmt.ts` (`fmtFiles`), `packages\cli\src\check\lint.ts` (export `withLint`), `packages\language\src\compiler\controller-balance.ts`, `packages\language\src\compiler\pipeline\check.ts` (`CheckDiagnostic.data`), `packages\language\src\index.ts` + `package.json` `exports` + a new `@eligian/language/mcp` entry in `WORKSPACE_SOURCES` (exports: `html-registry`, `layout-elements`, `selector-sources`, `parameter-roles`, document-symbol data, `controllers.generated`, `timeline-events.generated`, `dom-events`, `key-names`, `hostControllers`/`hostFunctions`, `controller-balance`) with tests that keep language coverage at threshold, `packages\cli\esbuild.mjs` (generator call after `rmSync`), `packages\cli\package.json` (`files`, scripts, version 1.1.0), `starters.ts` + `init.spec.ts` (`^1.1.0`), `packages\cli\README.md`, `packages\cli\src\__tests__\{mcp-server,mcp-stdout,mcp-concurrency,mcp-knowledge,mcp-check,mcp-fmt,mcp-init,dataflow-tables}.spec.ts`, `package-bin.spec.ts`, `.github\workflows\{ci,publish-cli}.yml`, `evals\mcp\` (one-case harness).
- Day 1: spike `McpServer.layerStdio` + Node `Stdio` layer + stdout redirect; verify `_meta` (`alwaysLoad`, `maxResultSizeChars`), `readOnlyHint`, instructions, protocol negotiation with Claude Code and the Inspector (pinned as a devDependency, `--cli … --method tools/list`); the pure-NDJSON spawn test. Go/no-go on Effect vs official SDK by end of day.
- Day 2: **one-case harness** (`evals\mcp\run.ts` with case 13 and arm A1 only, the gate script, tarball install) so every chunk from here is written against a failure.
- Days 3–4: tools `docs`, `operations` (batched), `check` with the semaphore, `fmt`, minimal `init` (starters + `.mcp.json` + `AGENTS.md` block); `McpDiagnostic` with `data`; the concurrency spec.
- Days 5–6: generator (operations-index, operations, dataflow-tables + its W150 probe spec, controllers, events, cheatsheet, starters, config-shape from the installed schema, diagnostics catalogue), literate-probe pipeline with snapshots, drift spec.
- Days 7–8: review pass v1 (`controller-imbalance`, `class-never-removed`) in `check`; curriculum A (incl. `not-eligian`, `decisions`, `project-layout`), B `map-dataflow`, `map-actions-and-calls`, `map-timeline-and-providers`, `map-events-and-interactions`, `map-controllers`, C `runtime-engine-lifecycle`, `runtime-scheduling`, E `storyboard`; diagnostics overlays for the 30 most frequent codes (the rest listed by the spec as missing).
- Day 9: Phase 1 instructions string; Windows + Linux handshake (`node` form and `npx` form); README; language API surface tests; CHANGELOG entries.
- Exit: `claude mcp add eligian -- node <repo>\packages\cli\bin\cli.js mcp` works on Windows and Linux; inspector gate green; concurrency and stdout specs green; eval cases 13 and 14 pass with arm A1 in the one-case harness; instructions ≤ 4,096 chars and upfront descriptions ≤ 1,000 chars asserted.

### Phase 2 — Inspect, smoke with scenarios, agent context, curriculum (9 days)

Touches: `packages\cli\src\mcp\tools\{compile,project,smoke}.ts`, `packages\cli\src\agents.ts` (+ `agents` subcommand, `mcp --print-config`, merge semantics), `packages\cli\src\smoke\{smoke-command,smoke-runner,dom-environment,scenario}.ts` (`--scenario`, `--format ndjson`, `smokeFile` export, `host-operation-returned-non-object`), `packages\cli\src\check\review.ts` (remaining checks), `packages\cli\src\init.ts` (`--client`, `--no-agents`), curriculum B remainder (`map-program-and-config`, `map-erased-parameters`, `map-control-flow-and-data`, `map-event-actions`, `map-imports-and-assets`, `map-locales-and-languages`), C (`timing-models`, `runtime-quirks`, `runtime-state-pitfalls`), D (all), overlays for the 25 most-used operations and all 9 controllers, example markers in the tour, `packages\cli\src\__tests__\{mcp-compile,mcp-project,mcp-smoke,mcp-scenario,agents,mcp-staleness}.spec.ts`, Cursor/Copilot passive-context files, final instructions string.
- Verify: listener action names in raw `addController` arrays (validator or review check if unchecked); Lottie under `--bundle`/`dev`/`smoke` (add `lottie-web` to CLI deps or a warning); which clients read `AGENTS.md`.
- Exit: all 8 tools listed by the inspector; `eligian init --template chapters --client claude` yields a project Claude Code picks up; cases 1, 2, 3, 6, 8 pass with arm A1 in the one-case harness; the staleness specs (CSS/HTML/locales/library edits between calls) green.

### Phase 3 — Eval harness, behavioural checks, provenance, curriculum completion (10 days)

Touches: `evals\mcp\{run.ts,cases\*.json,fixtures\**,rubric.md,generate-media.ts}`, `packages\cli\src\mcp\evals\assert.ts`, `packages\cli\src\__tests__\__fixtures__\mcp-solutions\**`, `packages\cli\src\__tests__\mcp-solutions.spec.ts`, `evals\mcp\results\**`, root `package.json` (`evals:mcp`, local `claude -p` driver), `packages\cli\src\smoke\{determinism,media-clock}.ts`, `packages\language\src\compiler\types\eligius-ir.ts` + every transformer + optimizer + `eligian-map.ts` (`origin`), `packages\cli\src\mcp\tools\compile.ts` (`explain`), all remaining operation and diagnostics overlays.
- Days 1–3: full harness, assertion DSL incl. scenario, `storyboard.beatsCovered`, `controllers.balanced`, metrics; reference solutions for cases 1–14 (each solution's agent run sets the case's call budget).
- Days 4–5: `smoke --determinism`; media clock stub (cases 4, 9 run instead of skipping).
- Days 6–7: provenance `origin` + `explain`; soak test.
- Day 8: first full run (A0, A1, A-none once); triage into curriculum gaps / tool ergonomics / compiler gaps.
- Days 9–10: second run; `specs\058-mcp-server\evals.md`.
- Exit: arm A1 passes ≥ 12 of 14 within budget on the pinned model; A1 ≥ A0 on pass rate and lower on rounds/calls/tokens; `operations-before-first-unknown` ≥ 0.9; the solutions spec is in PR CI; every registry operation and every code has an overlay (spec green).

### Phase 4 — Editor registration, dev feedback, polish (4 days)

Touches: `packages\extension\package.json` (`contributes.mcpServerDefinitionProviders`, settings `eligian.mcp.enabled`, `eligian.mcp.command`), `packages\extension\src\extension\mcp\server-definition-provider.ts` (`vscode.lm.registerMcpServerDefinitionProvider` → `McpStdioServerDefinition` with `node <workspace>\node_modules\eligian\bin\cli.js mcp` when the install is ≥ 1.1; otherwise an install prompt), Cursor branch via `vscode.cursor.mcp.registerServer` when present, `packages\extension\src\__tests__\mcp-provider.spec.ts`, `packages\cli\src\dev\{dev-server,client-runtime}.ts` (engine `error` events and console errors posted back, printed located via the map, written to `.eligian\dev-errors.json`), `eligian://docs/<id>` resources and the `new-presentation` prompt in `server.ts`, READMEs, CHANGELOGs.
- Exit: Copilot agent mode lists the `eligian_*` tools with no user config; the setting turns it off; `.vscode\mcp.json` still works; `dev` prints a runtime error with its source location.

### Phase 5 — Hardening and reach (4 days, can trail)

- Promote review checks that the evals proved to DSL validators where an IDE squiggle is worth it (each its own mini-spec; `runtime-state-pitfalls.md` moves them from "caught by check" to "caught in the editor").
- MCP registry entry; optional Claude Code plugin (`.claude-plugin\`) and Codex/Cursor equivalents; server process recycling tuned from the soak test.
- Exit: `check:examples` green; registry entry visible; evals re-run without regression.

---

## 8. Risks and open questions

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `effect/ai` McpServer is `@stability unstable` | breaks on an Effect bump | `effect` pinned exactly; in-process client tests + inspector gate; SDK fallback designed in |
| stdout pollution (third-party `console.log`, smoke's console patching) | protocol corruption | process-wide stdout redirect at start; smoke in a child; pure-NDJSON spawn test |
| Concurrent compiler calls on the shared Langium singleton | wrong diagnostics | semaphore; concurrency spec |
| Smoke leaks (globals, console, listeners, ESM modules) and user host code | server corruption, security | child process, kill on timeout, security note |
| The model ignores tools / reads too much | no teaching, context bloat | three upfront tools, triggers in the instructions, cards by default, telemetry + metrics in the harness |
| Curriculum semantics drift (eligius bumps by dependabot) | the docs lie | literate probes with snapshots; `mcp-runtime-claims.spec.ts`; dataflow W150 probe spec; drift spec |
| Generated docs missing from the tarball | server without docs | generator inside `esbuild.mjs`; exact file-list assertion; publish "Try the package" step |
| Startup over Codex's limit | server never connects | lazy imports in source; measured initialize time in `package-bin.spec.ts` |
| `eligian mcp` on a 1.0.x install is swallowed by `compile` | "server failed to start" | 1.1.0 minimum, starters `^1.1.0`, pinned `npx` fallback, README note |
| Eval nondeterminism and cost | flaky exits | pinned model, 3 runs, majority; local runs under the subscription (no API spend); deterministic solutions spec in CI |
| Memory growth in a long-lived server | slow or crashing server | soak test, service recycling after N calls |
| The CLI package has no coverage gate (`test:coverage:ci` is plain `vitest run`) | ungated MCP code | decided Q8: gate added in Phase 0 at the measured baseline |

### Decisions (recorded 2026-11-04)

1. **MCP library:** Effect `effect/ai` McpServer. The official `@modelcontextprotocol/server` stays the designed-in fallback if the Day-1 spike fails on `_meta`, annotations or protocol negotiation.
2. **VS Code extension:** registers the server only when a workspace-local `eligian` ≥ 1.1 exists, with an install prompt otherwise. No CLI copy is bundled into the `.vsix`.
3. **Agent context from `eligian init`:** `AGENTS.md` plus a one-line `CLAUDE.md` importing it (`@AGENTS.md`), as this repo does; `.cursor\rules` and Copilot instructions generated from the same block.
4. **`eligian_check` defaults:** align the CLI in 1.1.0: `selectorNotInLayout` on (`ids`) when a layout is imported, review pass on by default, so the agent and the human see the same diagnostics.
5. **Smoke modes:** scenario, determinism and media-clock modes ship in `eligian smoke`; the evals use the shipped binary.
6. **`examples\demo.eligian`:** labelled "feature inventory, not idiom" and excluded from teaching and evals; fixing it to the strict gate is a later task.
7. **Provenance:** `origin` on `OperationConfigIR` across every transformer in Phase 3, so `explain` maps compiled JSON to source exactly.
8. **CLI coverage gate:** added in Phase 0 with thresholds at the measured baseline.
9. **Evals:** run locally under the user's Claude subscription via `claude -p` (no GitHub workflow, no API key); Sonnet-class drives the full runs, one Opus-class run per phase exit.
10. **`custom` provider:** requires a host-registered position source. A separate spec defines the host contract and the diagnostic for `custom` without one; `provider-choice.md`'s `custom` row and `not-eligian.md` wait on that spec, and until it lands the compiler keeps the raf stand-in with a warning.

### Open questions

11. Expose `KeyboardStepSource` as a provider for decks? Case 6 is solved with per-slide timelines; a `step` provider would make it the natural answer. Separate spec.
12. Media timelines: warn when events run past the media length. Needs header parsing at check time. Separate spec.
13. The "While validating the AstNode …" wrapper on the duplicate-`styles` and video-without-`from` diagnostics suggests a validator throws; Phase 0 codes work fixes or documents it.
14. Tool count: 8; if evals show `eligian_fmt` is rarely called, fold it into `check` (`fix: ['format']`).
15. `extensions {}` grammar: `needs`/`provides` clauses for host operations so dataflow validation covers them. Separate spec after the evals show how often host dataflow bugs occur.
