# Feature Specification: MCP server, Phase 1: MVP server (learn + check)

**Feature**: spec 058 (Eligian MCP server), Phase 1 of `specs/058-mcp-server/roadmap.md` §7
**Branch**: `feat/mcp-server-roadmap`
**Created**: 2026-11-04
**Status**: Draft, revised after the spec review (see "Review notes") and clarified (see "Clarifications")
**Input**: roadmap §7 "Phase 1 — MVP server: learn + check (9 days)", the design in §2–§6 and the decisions in §8. Every claim about existing code below was checked on 2026-11-04 with typegraph (`ts_module_exports`, `ts_navigate_to`) or a command whose output is quoted. The checks ran against the tree after the Phase 0 commit `448cd8b`.

## Overview

Phase 1 ships the first usable Eligian MCP server: `eligian mcp`. It is a stdio server inside the `eligian` npm package (version 1.1.0), built on Effect's `effect/ai` `McpServer` (decision 1). It exposes five tools. `eligian_docs`, `eligian_operations` and `eligian_check` are loaded upfront; `eligian_fmt` and `eligian_init` are deferred.

With these tools an agent can:
- learn Eligian from version-matched knowledge chunks: a build-time generated reference plus a first hand-written curriculum;
- run the compiler in the loop: every diagnostic, Eligius lint, and a first review pass (`controller-imbalance`, `class-never-removed`). Each finding comes back as a structured `McpDiagnostic` with its fix attached: quick-fix edits or suggestions where the language computes them, and the cause + fix text of the code's diagnostics overlay inline (FR-015; roadmap §3.4 "Diagnostics carry their overlay inline").

The phase also:
- builds the knowledge generator into the CLI build, so the docs ship in the tarball;
- aligns the CLI `check` defaults with the tool (decision 4);
- adds a `@eligian/language/mcp` entry for the language data the server and Phase 2 need;
- adds a one-case eval harness that runs negative cases 13 and 14 with the server (arm A1).

## Scope and non-goals

**In scope** (roadmap §7 Phase 1, day by day):
- **Day 1**: spike `McpServer.layerStdio`, a Node `Stdio` layer and the stdout redirect; verify `_meta` (`alwaysLoad`, `maxResultSizeChars`), the annotations, the instructions and protocol negotiation with Claude Code and the inspector; go/no-go on Effect vs the official SDK (FR-002a, SC-024).
- **Day 2**: the one-case harness.
- **Days 3–4**: the tools `docs`, `operations` (batched), `check` with the semaphore, `fmt` and a minimal `init`; `McpDiagnostic` with `data`; the concurrency spec.
- **Days 5–6**: the generator, literate probes with snapshots, the drift spec.
- **Days 7–8**: review pass v1; curriculum A, B (five `map-*` chunks), C (two `runtime-*` chunks) and E; diagnostics overlays for the 30 most frequent codes.
- **Day 9**: the Phase 1 instructions string; the Windows + Linux handshake (`node` and `npx` forms); README; language API surface tests; CHANGELOG.

**Touched files** (roadmap §7 Phase 1 "Touches"; sites this spec found while verifying are marked †):
- `packages/cli/src/main.ts`, `packages/cli/src/mcp/{server,stdio,compiler-lock,diagnostics}.ts`, `packages/cli/src/mcp/tools/{docs,operations,check,fmt,init}.ts`
- `packages/cli/src/mcp/knowledge/**` (including `search.ts`), `packages/cli/scripts/generate-knowledge.ts`
- `packages/cli/src/check/review.ts`, `packages/cli/src/check/lint.ts`, `packages/cli/src/fmt.ts`
- `packages/cli/src/check/check-command.ts`† (`withLint` lives here, not in `lint.ts`; also the `--no-review` flag and the `ids` default of decision 4)
- `packages/language/src/compiler/controller-balance.ts`, `packages/language/src/compiler/pipeline/check.ts`, `packages/language/src/lsp/select-element-fix.ts`
- `packages/language/src/compiler/__tests__/tour-controllers.spec.ts`† (uses the lifted walker)
- `packages/language/src/compiler/transformers/runtime-values.ts`† (`SELF_RESOLVED` export)
- the suggestion sites of FR-014†
- `packages/language/src/index.ts`, `packages/language/package.json` (`exports`), `packages/language/esbuild.mjs`† (a fourth entry)
- `packages/cli/esbuild.mjs`, `packages/cli/package.json`
- `packages/language/src/starters/starters.ts`, `packages/cli/src/__tests__/init.spec.ts`
- `packages/cli/README.md`, `CHANGELOG.md`, root `AGENTS.md` (the starter range line, `AGENTS.md:41`). `packages/cli/AGENTS.md` has no starter-range line (`grep -n -i "starter\|major" packages/cli/AGENTS.md` finds nothing) and is not touched.
- `packages/cli/src/__tests__/{mcp-server,mcp-stdout,mcp-concurrency,mcp-knowledge,mcp-check,mcp-fmt,mcp-init,dataflow-tables,review}.spec.ts`, the test client helper `packages/cli/src/__tests__/mcp-test-client.ts` (SC-003), `packages/cli/src/__tests__/package-bin.spec.ts`
- `.github/workflows/{ci,publish-cli}.yml`
- `evals/mcp/` (the one-case harness, cases 13 and 14)
- root `package.json` (`check:examples`†, see FR-054 and Difference 7)
- `packages/cli/scripts/rank-diagnostic-codes.ts` and its committed output (FR-055)
- `specs/058-mcp-server/roadmap.md` (the text corrections of FR-056)

**Non-goals (owned by later phases; roadmap wording quoted):**
- **Phase 2** (§7 Phase 2 "Touches"):
  - the tools `eligian_compile`, `eligian_project` and `eligian_smoke`;
  - `agents.ts`, "`agents` subcommand, `mcp --print-config`, merge semantics", and `init.ts` "`--client`, `--no-agents`";
  - the remaining review checks: `media-file-missing`, `media-from-duplicate`, `timeline-container-not-in-layout`, `media-timeline-first-without-start-gesture`, `entry-timeline-without-enter`, `host-operation-in-block-without-select`;
  - smoke `--scenario`, `--format ndjson` and `smokeFile`;
  - the rest of curriculum B and C, all of D, the operation overlays and the 9 controller overlays;
  - example markers in the tour, the staleness specs, the final instructions string;
  - `response_format` (§4: "on compile, project, smoke") and the `storyboard` section of `eligian_project`.
- **Phase 3**: the full eval harness, the root `package.json` script `evals:mcp` (§7 Phase 3 Touches: "root `package.json` (`evals:mcp`, local `claude -p` driver)"), the assertion DSL, reference solutions for cases 1–14 and so the per-case tool-call budget (FR-051), `smoke --determinism`, the media clock, provenance `origin` and `explain`, the soak test, and overlays for every remaining operation and code.
- **Phase 4**: extension registration, `dev` error forwarding, the `eligian://docs/<id>` resources and the `new-presentation` prompt.
- **Phase 5**: the MCP registry entry (`mcpName`, `server.json`), a Claude Code plugin, and service recycling "tuned from the soak test".
- **Langium service recycling after N = 100 calls** (§2 "Memory and staleness"): NOT built in Phase 1. It is deferred to Phase 3's soak test and added to Phase 3's Touches in the roadmap (FR-053). Phase 1 only records the measured heap growth per check in `compliance.md` (FR-053, SC-026). Phase 5 still tunes N from the soak test.
- **Generated chunks the Day 5–6 list does not name**: `generated/dom-events.md`, `generated/key-names.md`, `generated/html-elements.md` and `generated/examples/<id>.md` (the examples need the Phase 2 markers). `eligian_operations` serves DOM events and key names directly from the source data (FR-021).
- **Never in this roadmap**: new DSL syntax (§1 non-goals), an HTTP transport (§2 trade-offs). Resources and prompts are Phase 4 (§3.4).
- **Separate specs**: the `custom` provider contract (decision 10), including its warning on `using custom`, which Phase 1 does not add (FR-039, FR-056), and open questions 11, 12, 14 and 15.

## User scenarios and testing

### User story 1: an agent connects and learns before it writes (P1)
A coding agent (Claude Code, Cursor, Copilot or Codex) launches `node <project>/node_modules/eligian/bin/cli.js mcp`. At session start it sees the instructions and the three upfront tools. Before it writes `.eligian` code, it reads the docs index (cards), the `operations-index` chunk and batched operation cards.

**Independent test**: the in-process test client (SC-003) sees exactly the five tools, with the right `_meta` and annotations, and the calls behave as follows:
- `eligian_docs()` returns the index.
- `eligian_docs({ ids, detail: true })` returns the bodies.
- `eligian_operations({ names: ['addClass','selectElement','adClass'] })` returns two cards, each opening with NEEDS / PROVIDES / ERASES, and one unknown name with suggestions.

**Acceptance scenarios**:
1. **Given** a fresh `eligian mcp` process, **When** a client sends `initialize`, **Then** the answer arrives in under 3 s, and `serverInfo.version` equals the `version` in `packages/cli/package.json` (1.1.0).
2. **Given** a connected client, **When** it calls `tools/list`, **Then**:
   - `eligian_docs`, `eligian_operations` and `eligian_check` carry `_meta["anthropic/alwaysLoad"] === true` and `readOnlyHint: true`;
   - `eligian_fmt` and `eligian_init` carry `destructiveHint: false` and `idempotentHint: true`.
3. **Given** a program with an `extensions "./host.ts" { operation score(answer: string) }` block, **When** `eligian_operations({ names: ['score'], path })` is called, **Then** it returns a host-operation card with no NEEDS / PROVIDES (as `hostSignature` declares none).

### User story 2: the compiler in the loop, with fixes attached (P1)
The agent edits files and calls `eligian_check` after every edit, until the check reports 0 errors and 0 warnings. Each diagnostic carries:
- a code and its source stage;
- an excerpt of the source;
- suggestions or a quick-fix edit, where available;
- a docs overlay id, and that overlay's cause + fix text inline (FR-015), so the agent needs no extra `eligian_docs` call to fix it.

**Independent test**: `mcp-check.spec.ts` runs fixtures with known problems and asserts the exact codes, sources, `quickFix` / `suggestions` and `ok`. The problems are: a missing `selectElement`, an unknown operation, a CSS id that is not in the layout, a controller imbalance, a class that is never removed, and an Eligius lint finding.

**Acceptance scenarios**:
1. Two fixtures, one code each:
   - **Given** an inline event `at 0s..1s [ ] [ addClass("x") ]` with nothing selected, **When** checked, **Then** exactly one `missing-dependency` diagnostic is returned (emitted by `applyOperation`, `dataflow/operation-dataflow.ts:505-509`), whose `quickFix.newText` contains `selectElement(`.
   - **Given** an inline event whose end block calls an action whose body runs `addClass` with nothing selected, **When** checked, **Then** exactly one `missing-action-dependency` diagnostic is returned at the call (emitted by `checkCall`, `operation-dataflow.ts:395-399`), whose `quickFix.newText` contains `selectElement(`.
2. **Given** a timeline whose `on enter` adds a controller that `on leave` does not remove, **When** checked with the defaults, **Then** a `controller-imbalance` warning with `source: 'review'` is returned, and `ok` is `false` (`maxWarnings` defaults to 0).
3. **Given** two different checks fired at the same moment, **When** both complete, **Then** each result equals the result of the same call made alone.

### User story 3: format and scaffold (P2)
Once `check` is clean, the agent formats its files. To start a new project, it scaffolds one from a starter, with an `.mcp.json` and an `AGENTS.md` block.

**Independent test**:
- `mcp-fmt.spec.ts`: check mode does not write; write mode rewrites only the unformatted files.
- `mcp-init.spec.ts`: covers each template, the refusal when starter files already exist, and the agent files written.

### User story 4: the knowledge cannot lie silently (P2)
Drift between the docs and the code fails CI:
- the docs name every registry operation, controller, timeline event, grammar keyword, starter and top-level config property;
- every literate probe compiles and matches its snapshot;
- the dataflow tables agree with `eligius/lint` W150.

### User story 5: the server is measured against a broken project (P3)
The one-case harness installs the packed tarball into a temp dir and starts Claude Code with the server (arm A1) on eval case 13 or 14. It then runs the pass gate.

## Requirements

### Functional requirements

#### A. Subcommand, transport and process rules (roadmap §2 "Transport and process rules"; §7 Day 1, Day 9)

- **FR-001**: `packages/cli/src/main.ts` MUST register an `mcp` command (`program.command('mcp')`) so that `eligian mcp` starts the server and the command is listed in `eligian --help`. The default `compile` command (`main.ts:458`, `.command('compile', { isDefault: true })`) must not swallow it. `package-bin.spec.ts:30-33` keys `hasMcp` on `/^\s+mcp\b/m` in the `--help` output. The `--help` epilogue (`main.ts:285`) MUST name `mcp` among the commands. *(§2 "Recommendation"; §7 Touches `main.ts` (`mcp` subcommand))*
- **FR-002**: The server MUST be `McpServer.layerStdio({ name: 'eligian', version, instructions, protocols })` from `effect/ai` (decision 1).
  - Signature: `layerStdio(options) => Layer<McpServer | McpServerClient, Cause.IllegalArgumentError, Stdio>` (`McpServer.d.ts:249-258`).
  - Tools come from `Tool.make` and `Toolkit.make` (`Tool.d.ts:896`, `Toolkit.d.ts:337`) and are registered with `McpServer.toolkit` (`McpServer.d.ts:388`).
  - `version` MUST be `getCompilerVersion().compiler`, the injected CLI version (`pipeline.ts:372-375`).
  - `protocols` MUST be exactly `[McpProtocol.v2025_11_25, McpProtocol.v2025_06_18]` (`McpProtocol.d.ts:184`, `:192`; a stateful stdio server). `McpProtocol.v2026_07_28` (stateless, for request-scoped HTTP where reverse requests such as `roots/list` are unavailable, `McpServer.d.ts:339`) MUST NOT be listed (SC-029). Both listed versions are needed:
    - `v2025_06_18`, because `package-bin.spec.ts:150` sends `protocolVersion: '2025-06-18'`;
    - `v2025_11_25`, because the `effect/ai` `McpClient` that the in-process tests use negotiates only `"2025-11-25" | "2026-07-28"` (`McpClient.d.ts:35`, `ProtocolVersion`). A server that lists only `v2025_06_18` cannot be reached by that client.


  *(§2 "effect@4.0.7 … ships effect/ai"; "protocols must be chosen explicitly")*
- **FR-002a (Day-1 spike, go/no-go)**: Before any Days 3–4 tool work starts, a spike MUST verify what roadmap §7 Day 1 lists against both Claude Code and the pinned inspector, and record a go/no-go on Effect vs the official SDK (decision 1). It uses two throwaway tools: one annotated `.annotate(Tool.Meta, { "anthropic/maxResultSizeChars": 200000 })`, and one with `{ "anthropic/alwaysLoad": true }` plus `Tool.Readonly`.
  - **Inspector**: `tools/list` shows both `_meta` objects verbatim and `annotations.readOnlyHint: true`. (`McpServer.js:1555-1561` builds `annotations` from `Tool.Readonly` / `Destructive` / `Idempotent` / `OpenWorld` and passes `_meta: toolMeta`; the spike confirms this on the wire.)
  - **Claude Code, connection**: `claude mcp add` then `claude mcp list` shows the server connected.
  - **Claude Code, upfront loading**: a `claude -p` session with `--output-format stream-json --verbose` shows the server instructions in effect, and the alwaysLoad tool among the tools loaded at session start without a tool search. **[UNVERIFIED]**: which field of the init event lists them; the spike records what it found.
  - **Claude Code, `maxResultSizeChars`**: the throwaway tool returns a 60,000-char text, above the 50,000-char spill threshold (§3.5), and Claude Code receives it inline rather than as a spilled file. Phase 2's `eligian_compile view:'full'` depends on this (§4).
  - **Protocol negotiation**: the `protocolVersion` that each client negotiates (Claude Code and the inspector) is recorded. It is captured from the inspector's printed `initialize` result, or by a throwaway stdio tee between client and server (not committed).
  - **Wire encoding**: the spike records how `McpServer` encodes a tool result (`structuredContent` and the text item), which fixes FR-005's wire shape.

  The go/no-go verdict and all of this evidence MUST be quoted in `compliance.md` before Days 3–4 start (SC-024). Decision 1 stands: the server is built on `effect/ai` `McpServer`, and this spike is the go/no-go.
  - **No-go condition**: the spike fails on `_meta` (`alwaysLoad`, `maxResultSizeChars`), on the annotations, or on protocol negotiation.
  - **Fallback (designed in)**: the official `@modelcontextprotocol/server` SDK. On a no-go, FR-002, FR-003, FR-004 and FR-016 switch to it (names `serveStdio` / `registerTool` **[UNVERIFIED]**). It is added to the CLI `dependencies` as an external, because `package-bin.spec.ts:64-82` asserts that the bundle imports only declared dependencies, and the lazy-import assertion of FR-003 then targets that package. The payload shape of FR-005 is kept.
  - The verdict and the evidence are SC-024's. *(§7 Day 1; decision 1)*
- **FR-003**: `packages/cli/src/mcp/server.ts` MUST load `effect/ai` with a dynamic `import('effect/ai')`, and only at server start.
  - The existing assertion at `package-bin.spec.ts:168-180` (no static top-level `import … from "effect/ai"` in `dist/cli.mjs`) MUST keep passing. It MUST also assert one dynamic `import("effect/ai")`.
  - Consequence: tool definitions that need `effect/ai` values when they are constructed are built after that import. No module that the bundle evaluates eagerly may call `Tool.make` at top level.

  *(§2 "Startup budget": "`await import('effect/ai')` (`mcp\server.ts`)")*
- **FR-004**: A new `packages/cli/src/mcp/stdio.ts` MUST provide the Node `Stdio` service layer that `layerStdio` requires. `effect` 4.0.7 has no Node layer: `Stdio.d.ts` exports only `make` (`:130`) and `layerTest` (`:151`). The layer works over `process.stdin` and the captured `process.stdout.write`. At server start it MUST capture `process.stdout.write` for the transport. It then redirects `console.log`, `console.info`, `console.debug`, `console.warn`, `console.error` and `process.stdout.write` to stderr for the life of the process. *(§2 "stdio only; nothing but the protocol on stdout")*
- **FR-005**: Every tool response MUST start with the header `eligian <cli version> · eligius <eligius version> · <tool> · <resolved absolute path or "-">`. The versions come from `getCompilerVersion()` (`pipeline.ts:372`, injected in Phase 0).
  - **Wire shape.** `effect/ai`'s `McpServer` puts a handler's encoded result into `structuredContent` (on success only), and into exactly one text item, `content: [{ type: 'text', text: JSON.stringify(encoded) }]` (`effect@4.0.7 dist/ai/McpServer.js:1569-1572`; `toolResultContent` at `:1476-1479`). A plain-text header line in front of the JSON is therefore not possible (Difference 17).
  - Every tool payload, success or failure, MUST be an object whose **first key** is `header`, so `content[0].text` begins `{"header":"eligian 1.1.0 · …`.
  - On success: `isError` is false, `structuredContent` is the payload, and `content[0].text` is `JSON.stringify(payload)`.
  - On failure (FR-006): `isError: true`, no `structuredContent`, and `content[0].text` is `JSON.stringify({ header, error })`.
  - Tests read the payload as `JSON.parse(content[0].text)`. On success they also assert that it deep-equals `structuredContent`.
  - **Exception (ruling 2026-11-05, T043)**: a parameter-schema refusal never reaches a handler, so it carries no header. `effect/ai` answers it with JSON-RPC -32602 under 2025-06-18 and with a plain-text `isError` result under 2025-11-25. This is the only response without a header; it is library-owned and stays as the library emits it (no wrapping handler, decision 1). The tool descriptions state the one schema limit so an agent rarely meets it (plan risk table).

  *(§2 "Every response header carries …"; §4 "Every response starts with …")*
- **FR-006**: Error shape:
  - A check with findings is a successful tool result, with `ok: false` and `diagnostics`.
  - `isError: true` MUST be used only when the tool could not run. The payload is `{ header, error: { kind: 'not-found' | 'io' | 'timeout' | 'cancelled' | 'internal', message, path? } }`. The one exception is the library's parameter-schema refusal (FR-005 exception): plain text under 2025-11-25, a JSON-RPC error under 2025-06-18.
  - Tool handlers MUST NOT throw. A failure is an `Effect.fail` of a tagged error (with `_tag`), declared in the tool's `failure` schema and mapped to that shape. `McpServer` returns a declared handler failure as its encoded payload with `isError: true`; anything else goes to its cause handler (`McpServer.js:1567-1573`).

  *(§4 "Error shape"; constitution: tagged errors)*
- **FR-007**: Path policy:
  - A tool input is an absolute path, or a path relative to the first MCP root the client announces (`roots/list`; `McpReverseClient.listRoots`, `McpSchema.d.ts:3825`). When the client announces no roots, the path is relative to the server cwd.
  - Windows backslash paths MUST be accepted and normalised.
  - Glob patterns go through the existing `expandPatterns` (`check-command.ts:68`), which applies the local `toGlobPath` (`:96`).
  - Every response echoes the resolved absolute path(s).
  - **Roots fallback**: when the client does not advertise `capabilities.roots`, or `roots/list` fails for any reason, the server falls back to its cwd silently: no error and no `isError`. METHOD_NOT_FOUND is the ordinary case here: the `effect/ai` `McpClient` sends `capabilities: {}` (`McpClient.js:155`) and declines every server request except ping (`:684`).
  - **Project root**: the first announced root, or the server cwd when there is none. The roadmap's "the directory of the entry file or the root" is read this way: an entry file under the project root has its directory under it too, and a reading of "any entry file's directory" would let an absolute path anywhere through, which leaves the read restriction empty (Difference 16).
  - **Reads**: tools read only under the project root. A tool input path, a glob match or an `eligian_operations({ path })` that resolves outside it returns `isError` with kind `not-found`, and a message that names the root; nothing outside it is read. The restriction covers **tool input paths only**. Files that a program imports are resolved by the compiler under the language's own rules, which allow `../` (`shared-utils/src/path-resolver.ts:17-19`), so a program inside the root may import a CSS, HTML, locales or library file outside it. The MCP tools MUST NOT add any import-location refusal or diagnostic of their own: for the same program, `eligian_check` and `eligian check` report identical diagnostics (FR-058, SC-021). The README security note says so (FR-047).
  - **Writes**: only `eligian_init` and `eligian_fmt({ write: true })` write files.

  *(§2 "Path policy": "Tools read only under the resolved project root (the directory of the entry file or the root), and write only via `eligian_init` and `eligian_fmt(write:true)`")*
- **FR-008**: Telemetry: every tool call MUST write one JSON line to stderr: `{ t, tool, ms, chars, ok, args }`. `args` is a summary, not file contents. `chars` is the response length. When `ELIGIAN_MCP_LOG=<file>` is set, the same lines MUST also be appended to that file. *(§2 "Telemetry"; the one-case harness reads it, §6.4)*
- **FR-009**: Cancellation: on `notifications/cancelled` the tool's fibre is interrupted, and no response frame is sent for that request id.
  - A call still queued on the lock leaves the queue without running.
  - A compiler call that already holds the lock (FR-010) runs to completion, and its result is dropped.
  - **Why the locked section must be uninterruptible**: `checkFiles` is an `Effect.promise(async () => …)` (`check.ts:66-71`). Interrupting it abandons a promise that keeps mutating the shared `Settings.selectorNotInLayout` and `LangiumDocuments` (`check.ts:75-82`, `:187`, `:244`), while `withPermits` releases the permit at interruption, so the next call would overlap the orphaned promise.
  - The locked compiler section MUST therefore run uninterruptibly (`Effect.uninterruptible` inside `withPermits(1)`). The permit is released only after the underlying promise has settled.

  *(§2 "Cancellation")*

#### B. Concurrency (roadmap §2 "Concurrency model")

- **FR-010**: A new `packages/cli/src/mcp/compiler-lock.ts` MUST hold one process-wide Effect semaphore with 1 permit (`Semaphore.make(1)`, `effect` `Semaphore.d.ts:235`; `withPermits(1)`, `:326`).
  - **Why**: `checkFiles` flips the shared `Settings.selectorNotInLayout` on every call (`check.ts:75-82`), and it adds and releases documents in the shared `LangiumDocuments` (`check.ts:187`, `:244`).
  - Every tool path that touches the shared Langium services runs under the lock:
    - `eligian_check`, all of it: `checkFiles`, lint and review;
    - `eligian_fmt`: `formatSource` keeps its own service set (`format-source.ts:29`), but it is serialised for the same reason and because it writes files;
    - `eligian_operations` when `path` is given.
  - The locked section is uninterruptible (FR-009).
  - **Test seam**: `compiler-lock.ts` exports `makeCompilerLock(hooks?)`. `CompilerLockLive` uses no hooks. Tests build a layer with hooks `{ onQueued, onAcquire, onRelease }`, each called with the request id and a timestamp (`onRelease` also says whether the section completed), plus an optional latch that holds a section right after acquire (SC-005, SC-022). Tests may also provide a pass-through `CompilerLock` layer with no semaphore, for SC-005's negative control. Neither is used in production.

  *(§2)*

#### C. Diagnostics with fixes (roadmap §4 "Diagnostic record"; §7 Touches `check.ts`, `diagnostics.ts`)

- **FR-011**: `CheckDiagnostic` (`check.ts:32`) is today `{ file, severity, message, line, column, endLine, endColumn, code: string }`. It MUST gain an optional `data?: { readonly suggestions?: readonly string[]; readonly quickFix?: QuickFix }`.
  - `QuickFix = { readonly line: number; readonly column: number; readonly endLine: number; readonly endColumn: number; readonly newText: string }`. The range is 1-based, like the diagnostic's own range. An empty range (start = end) is an insertion.
  - Applying a `QuickFix` is mechanical: replace the range with `newText`. SC-006 and SC-007 apply it exactly that way.
  - When `data` is absent, the existing consumers (`reporters.ts`, the CLI's JSON output) MUST produce byte-identical output. The JSON reporter MAY print `data` when it is present; the plan decides, and SC-008 pins whichever is chosen.
- **FR-012**: `validateFiles` converts Langium diagnostics at `check.ts:227-236`. It MUST copy a Langium diagnostic's `data.suggestions` when that is a `string[]`. Two sites already set it: `navigate-validator.ts:85` (`data: { suggestions: similar }`) and `timeline-validator.ts:343`.
- **FR-013**: Quick-fix text for the missing `selectElement` case:
  - The edit of the *Insert selectElement* quick fix MUST be computable without a `CodeAction`, as a pure function from document + diagnostic to the edit (range + inserted text). Today the edit is built inside `selectElementCodeActions` (`lsp/select-element-fix.ts:86`), with the selector guessed by `guessSelector` (`:43`).
  - `checkFiles` MUST set `data.quickFix` to that edit, converted to the 1-based `QuickFix` of FR-011, on every `missing-dependency` / `missing-action-dependency` diagnostic about `'selectedElement'`. These are the codes and the message test at `select-element-fix.ts:27` and `:95-96`.
  - The code-action provider MUST keep producing the same `CodeAction`s; its existing tests pass unchanged.
- **FR-014**: Some diagnostics carry their suggestions only in the message text today. `grep -rn "Did you mean" packages/language/src --include=*.ts`, excluding `__tests__`, finds 19 lines (2026-11-04). Each is classified here:
  - **MUST also pass `data.suggestions`**, with the message unchanged byte for byte:
    - `unknown_operation`: `validators/operation-call/operation-existence-validator.ts:41-45`. Its hint comes from `compiler/operations/validation/existence.ts:41` and goes through `formatValidationMessage`.
    - `unknown_css_class`: `validators/operation-call/css-parameter-validator.ts:50-54` (line 53) and `:129-140` (line 133).
    - `unknown_css_class_in_selector` and `unknown_css_id_in_selector`: `css/selector-validation.ts:37-46` (line 42) and `:52-60` (line 56), in `reportSelectorIssues`. `css/did-you-mean-fix.ts:28` parses these suggestions back out of the message today.
  - **Already covered by FR-012** (they set `data.suggestions` today):
    - `validators/navigate-validator.ts:76-85` (line 80; `unknown_dom_event`);
    - `validators/timeline-validator.ts:333-343` (line 335; `unknown_css_class_in_selector` on a timeline's container selector).
  - **MAY follow**. Any left without `data.suggestions` are listed in `compliance.md`:
    - `validators/event-action-validator.ts:160-171` (line 163; `unknown_event_name`);
    - `validators/import-validator.ts:234-246` (line 237; `import_action_not_found`);
    - `type-system-typir/validation/label-id-validation.ts:68-82` (line 73; `unknown_label_id`). Its result object already carries `suggestions` (`:82`).
  - **Not diagnostic sites** (comments, and the parser):
    - comments: `did-you-mean-fix.ts:3`, `css/parameter-roles.ts:13`, `label-id-validation.ts:41`, `event-action-validator.ts:105`, `import-validator.ts:218`, `css-parameter-validator.ts:64` and `:128`, `operation-call/label-parameter-validator.ts:281`;
    - the parser: `did-you-mean-fix.ts:28`.
- **FR-015**: A new `packages/cli/src/mcp/diagnostics.ts` MUST define `McpDiagnostic` and a pure builder from `CheckDiagnostic`:
  - Shape: `{ source: 'parser'|'validator'|'type'|'linker'|'compiler'|'eligius-lint'|'review'|'fmt', severity, code, message, file, line, column, endLine?, endColumn?, excerpt, suggestions?, quickFix?: QuickFix, docs?, fix? }`.
  - `source` for registry codes MUST come from the Phase 0 registry (`DIAGNOSTIC_CODES`, `validators/codes.ts:183`, entries `{ code, source }`).
  - The CLI-layer codes map as follows: `eligius-<rule>` (`lint.ts:29`) to `'eligius-lint'`; `compile-failed` (`check-command.ts:162`) to `'compiler'`; the review codes (FR-030) to `'review'`.
  - `excerpt` is the source line(s) of the range, read from the file.
  - `docs` is the overlay id, when an overlay exists (FR-040).
  - `fix` is the overlay's cause + fix text (≤ 120 words, FR-040), inlined so that the diagnostic carries its fix without an `eligian_docs` call. This follows §3.4 ("Diagnostics carry their overlay inline") and §3.5 ("Each diagnostic carries its fix"); §4 types only the `docs` id, so `fix` adds to §4's record without contradicting it.
  - To keep responses under the 50,000-char spill threshold (§3.5), a code that repeats within one response carries `fix` on its first diagnostic only. Later diagnostics of the same code carry `docs` alone.
  - A code without its own overlay gets the generic overlay of its `source` (FR-036) as `fix`.
  - The `smoke` source and the `timeline` / `time` / `step` fields are Phase 2.

  *(§3.4, §3.5, §4)*

#### D. Tools (roadmap §4; §7 Days 3–4)

General:
- **FR-016**: Exactly five tools MUST be listed: `eligian_docs`, `eligian_operations`, `eligian_check`, `eligian_fmt` and `eligian_init`, each in its own file under `packages/cli/src/mcp/tools/`.
  - The first three carry `Tool.Meta` `{ "anthropic/alwaysLoad": true }` and `Tool.Readonly` (`:1361`). `Tool.Meta` is a `Context` service class, applied with `.annotate(Tool.Meta, …)` (`Tool.d.ts:1317-1336`).
  - `eligian_fmt` and `eligian_init` carry `Tool.Destructive` false and `Tool.Idempotent` true (`:1385`, `:1410`).

  *(§3.5 "Three upfront tools"; §4 "Annotations")*
- **FR-017**: Description budgets:
  - Each upfront tool's description MUST be ≤ 1,000 characters.
  - Each deferred tool's description MUST be ≤ 16,384 characters, with its search keywords in the first 200 characters. Each tool file exports `KEYWORDS: readonly string[]` (for example, `eligian_fmt`: `['format', 'fmt', 'eligian']`), and every keyword appears, case-insensitively, in `description.slice(0, 200)`.
  - `eligian_check`'s description MUST say that its defaults are stricter than the CLI's.

  *(§3.5; §4 `eligian_check` "the description says so")*
- **FR-018**: The Phase 1 instructions string MUST be the §3.5 final text without the `eligian_project`, `eligian_smoke` and `eligian_compile` lines and without the scenario line (§3.5: "The Phase 1 variant omits …").
  - It MUST be ≤ 4,096 characters.
  - `server.ts` selects it by a build-time phase constant.
  - It names tools and chunks only as backticked tokens. Every backticked token that matches `/^[a-z0-9_/-]+$/` MUST be a tool of this phase or an `index.json` id, and the text contains no other backticked tokens of that form.

  *(§3.5)*

`eligian_docs`:
- **FR-019**: Inputs: `{ ids?: string[] (≤ 6), detail?: boolean, query?: string }`. The call forms:
  - No arguments: the index (`index.json` entries `{ id, title, kind, use_cases, words, see, card }`). Every chunk is an `index.json` entry, including the `generated/operations/<name>.md` chunks (`kind: operation`).
    - Non-operation entries are returned with their full card.
    - `kind: operation` entries are returned with `id` and `title` only. Their cards come through `ids` or through `eligian_operations`.
    - The whole no-argument response MUST be at most 12,000 chars (SC-011).
    - Per-code diagnostics overlays (`curriculum/diagnostics/<code>.md`) are overlays, not chunks: they are not `index.json` entries and are served only inlined by `eligian_check` (FR-015).
  - `{ ids }` without `detail`: the cards of those ids.
  - `ids` has at most 6 items in the parameters schema (`maxItems: 6`). A call with 7 or more ids is refused by parameter validation with an error result, and returns no cards or bodies. The "not returned" list exists only for the 6,000-word body cap.
  - `{ ids, detail: true }`: the bodies, up to 6 ids and 6,000 words per response. Any overflow is listed as "not returned".
  - `{ query }`: the top 8 entries from `knowledge/search.ts` (a tokenised keyword search over the index), each with its best-matching heading and its card. No bodies.
  - Unknown ids are listed together with the closest known ids.

  Docs are read through a `docsRoot` option. The default is `new URL('./docs/', import.meta.url)`, beside `dist/cli.mjs`; specs pass the generator's output dir. *(§3.1, §3.4, §2 "Docs are found via a docsRoot option")*

`eligian_operations`:
- **FR-020**: Inputs: `{ names?: string[], query?: string, category?: string, needs?: string, provides?: string, kind?: 'operation'|'controller'|'event'|'dom-event'|'key', path?: string }`.
  - Operations wrap the registry functions. All are exported from `compiler/operations/index.ts` and re-exported from the language root (verified): `getOperationSignature(name, context?)` (`:80`), `getAllOperations()` (`:122`), `getOperationsByCategory()` (`:147`), `findOperationsWithDependency(name)` (`:171`), `findOperationsWithOutput(name)` (`:187`), `searchOperations(query)` (`:204`), `suggestSimilarOperations(unknownName, maxSuggestions?, maxDistance?)` (`:229`).
  - A card MUST lead with NEEDS / PROVIDES / ERASES. It continues with the positional parameters (type / enum / required / default / erased), the description and the Eligian call form.
  - An unknown name returns the `suggestSimilarOperations` output.
  - `names` batches several lookups in one call.

  *(§4 `eligian_operations`)*
- **FR-021**: The other `kind` values read the language data:
  - `'controller'`: `CONTROLLERS` (`completion/metadata/controllers.generated.ts:29`), with the status of FR-037. There are 9 controllers: DOMEventListener, Keyboard, Label, Lottie, MutationObserver, Navigation, Progressbar, Routing and Subtitles.
  - `'event'`: `TIMELINE_EVENTS` (`timeline-events.generated.ts:29`, 46 entries).
  - `'dom-event'`: `DOM_EVENTS` (`utils/dom-events.ts:9`).
  - `'key'`: `KEY_COMPLETIONS` (`utils/key-names.ts:83`).

  All four come through the `@eligian/language/mcp` entry (FR-044).
- **FR-022**: With `path`, the program is loaded under the lock (FR-010), so that its `extensions {}` declarations count.
  - Lookups use `getOperationSignature(name, node)` with a node of that program, and `hostOperations(context)` / `hostControllers(context)` / `hostFunctions(context)` (`host-operations.ts:40, 44, 48`).
  - *(Ruling 2026-11-05, compliance closure)* `hostFunctions(context)` serves the `names` lookup: a host `function` the program declares comes back as a card of kind `host-function` (its text names the `extensions` module and says it is not an operation: no NEEDS / PROVIDES / ERASES). Without `path` the name is unknown, as for a host operation. Added in the main loop after the compliance pass found `eligian_operations` never called it (`mcp-operations.spec.ts` › `path: a host function card (FR-022)`; the host fixture declares `function formatScore`).
  - A host operation card states that host operations declare no NEEDS / PROVIDES (`hostSignature`, `:73`).
  - The documents loaded for the call MUST be released afterwards, with the same `releaseWorkspaceDocuments` discipline as `check.ts:244` (SC-010 checks this).

`eligian_check`:
- **FR-023**: Inputs: `{ paths: string[], selectorNotInLayout?: 'off'|'ids'|'all' (default 'ids'), lint?: boolean (default true), review?: boolean (default true), maxWarnings?: number (default 0) }`.
  - Output: `{ ok, files: [{ file, errors, warnings }], diagnostics: McpDiagnostic[], summary }`. `ok` means 0 errors and at most `maxWarnings` warnings.
  - It MUST reuse `expandPatterns`, `checkFiles` (`check.ts:68`), `withLint` (FR-029) and `reviewConfig` (FR-030), all under the lock.
  - When no file matches, it returns `isError` with kind `not-found`.

  *(§4 `eligian_check`)*

`eligian_fmt`:
- **FR-024**: Inputs: `{ paths: string[], write?: boolean }`. Output per file: `{ file, formatted, lineDiff?, error? }`; with `write`, the response lists the rewritten files.
  - It MUST call a new object-returning `fmtFiles` in `packages/cli/src/fmt.ts`, built on `formatSource` (`format-source.ts:25`) and the exported `lineDiff` (`fmt.ts:31`).
  - `runFmt` (`fmt.ts:89`) MUST keep returning `{ output, exitCode }`. It is reimplemented over `fmtFiles` with byte-identical CLI output, so the existing `fmt.spec.ts` passes unchanged.
  - A file with syntax errors is reported, not formatted.

  *(§4 `eligian_fmt`)*

`eligian_init` (minimal):
- **FR-025**: Inputs: `{ directory, template: 'blank'|'chapters'|'video'|'library', title?, force?, agents?: boolean (default true) }`.
  - It MUST reuse `runInit(directory, options)` (`init.ts:38`) and `starterFiles` (`starters.ts:79`). `runInit` refuses only when a starter file already exists (`:51-62`), unless `force` is set.
  - The response lists the files written. `runInit` returns only `{ output, exitCode }` (`init.ts:22-25`), so the list comes from `Object.keys(starterFiles(...))`.
  - The response also gives the next steps from §4 ("read `storyboard`, `decisions`; after the first timeline passes check …"), adapted to Phase 1, which has no `eligian_compile` (see FR-018), and the run commands.
  - The `client` input is Phase 2.
- **FR-026**: With `agents` (the default), the tool MUST also write three agent files:
  - `.mcp.json`: `{ "mcpServers": { "eligian": { "command": "node", "args": ["<abs dir>/node_modules/eligian/bin/cli.js", "mcp"] } } }`, with OS-native separators (backslashes on Windows, §2 install table);
  - an `AGENTS.md` block between `<!-- eligian:begin -->` and `<!-- eligian:end -->`. It holds the Phase 1 workflow and rules, is generated from the same source as the instructions, and points at `node_modules/eligian/dist/docs`;
  - a one-line `CLAUDE.md` containing `@AGENTS.md` (decision 3).

  Each file is written only when it does not exist yet. An existing file is left untouched and reported as skipped, together with the content the tool would have added. Merging is Phase 2's `agents setup`.
- **FR-027**: *(Removed in review.)* An embedded `eligian_check` in every `eligian_init` response went beyond roadmap §4 (`eligian_init` output: "files written; next steps …; the run commands") and §7 Days 3–4 ("minimal `init`"). SC-012 checks every template clean test-side instead, and `init.spec.ts` already checks every starter clean.

#### E. Review pass v1 and CLI check alignment (roadmap §4 `eligian_check`; §7 Days 7–8; decision 4)

- **FR-028**: The controller walker in `packages/language/src/compiler/__tests__/tour-controllers.spec.ts:38-118` (`resolve`, `walk` and the per-timeline balance) MUST move into `packages/language/src/compiler/controller-balance.ts` and be exported. `tour-controllers.spec.ts` MUST use it, and its three tests must keep passing.
  - Per timeline, the walker computes two multisets: controllers added (`addControllerToElement` after `selectElement X` + `getControllerInstance Name`) and controllers removed (`removeControllerFromElement Name` after `selectElement X`).
  - It follows `requestAction` / `startAction` with operationData substitution, as the test's header comment describes (`:1-14`).
- **FR-029**: `withLint` is today a non-exported function in `check-command.ts:138`, not in `lint.ts`. It MUST be exported (from `check-command.ts`, or moved to `lint.ts`; the plan decides) so that the tool and the CLI share it. Library findings stay merged into the library's own result (`:139-176`).
- **FR-030**: A new `packages/cli/src/check/review.ts` MUST export `reviewConfig(config, map, file)`, which returns `CheckDiagnostic[]` (warnings).
  - Both `eligian check` and `eligian_check` run it over every program without errors.
  - Each program is compiled with `compileFile` (`compile-file.ts:244`). Its `CompileResult` always carries `map` (`:55-69`).
  - Findings are located at source through the Eligian map, with `locateConfigPath` (`eligian-map.ts:266`) or with the map's action / operation locations.

  Phase 1 checks:
  - `controller-imbalance`: per timeline, the FR-028 add and remove multisets differ. When controllers are added and not removed, `data.quickFix` (FR-011) MUST balance them as follows:
    - When the timeline has an `on leave [ … ]` block, the fix is an insertion just before that block's closing `]`, of the removal lines: `selectElement("<selector>")` followed by `removeControllerFromElement("<Name>")`, for each missing removal.
    - When the timeline has no `on leave` block, the fix is an insertion just before the timeline's closing `}` of a complete `on leave [ … ]` block holding those lines. The body is `'{' (lifecycle += TimelineLifecycle | events += TimelineEvent)* '}'` (`eligian.langium:594-597`).
    - A removal without a matching add gets the warning but no `quickFix`.
  - `class-never-removed`: an `addClass` where nothing removes that class from that selector afterwards, per timeline.
    - The check follows `requestAction` / `startAction` with operationData substitution, exactly like the FR-028 walker. It MUST reuse that walker's resolution, exported from `controller-balance.ts`, so that an `addClass` inside an action called with a parameter is seen with the call's argument.
    - A removal is a `removeClass` / `toggleClass` of the same class on the same selector, and counts when it is in any of these places: the same action's end block; any later range of the same timeline; or the timeline's `on leave` block.
    - *(Ruling 2026-11-05, T024)* "The same action's end block" includes the end block of an endable action that the timeline event calls: a ranged call `at a..b x()` compiles to `requestAction` + `startAction` in the event's start operations and `requestAction` + `endAction` in its end operations, so the walker MUST follow `endAction` into the action's `endOperations` exactly as `startAction` is followed into `startOperations` (the action map carries both lists). `warning-only.eligian` (`showElement`, an endable action whose end block runs `removeClass("visible")`) is the regression fixture: it MUST produce no `class-never-removed` finding, and SC-008's byte-identical JSON test holds without `--no-review`.
    - An `addClass` in the timeline's `on enter` block is paired with the timeline's `on leave`: a removal there clears it, and without one the finding is reported.
    - A selector that is not a compile-time literal (runtime concatenation, or an unresolved parameter), on the add or on a removal, suppresses the finding for that class on that timeline.
    - The examples are not changed to satisfy this check: the tour (`examples/eligian-tour/`, which adds classes through parameterised action calls such as `showView(view)` in `on enter` and removes them with a runtime-concatenated selector in `resetChapter` and `hideView(view)` in `on leave`) MUST stay green under `--max-warnings 0` without edits (SC-007, SC-023).

  *(Ruling 2026-11-05, found during T040)* `reviewConfig` matches a config timeline to its balance and its insertion point **by index** (all three are in document order), never by `uri`: a video / audio timeline's `uri` is its source path, so a uri match found no insertion point (no `quickFix`) and the message named the path. Messages name the timeline by its source name (`LifecycleInsertionPoint.timeline`), falling back to the uri. Fixed in the main loop in `review.ts`.

  The review codes MUST be exported as a list, for the diagnostics catalogue (FR-036). Like `eligius-<rule>` (Phase 0 FR-009), they are CLI-layer codes outside the language registry.

  Each review code MUST ship with its diagnostics overlay in Phase 1: `curriculum/diagnostics/controller-imbalance.md` and `curriculum/diagnostics/class-never-removed.md`. Neither code may appear on the FR-042 allowlist. *(§4: "Each a warning with an overlay.")*
- **FR-031** (decision 4): The CLI `check` MUST behave like the tool in 1.1.0.
  - `--selector-not-in-layout` defaults to `ids` for a program that imports a `layout`. Today the option defaults to `'off'` (`main.ts:299-302`), and `checkFiles` defaults to `'off'` too (`check.ts:77`).
  - The review pass runs by default, and a `--no-review` flag skips it (like `--no-lint`, `main.ts:297`).
  - `--selector-not-in-layout off` still turns the selector check off.
  - `eligian check --help` documents both.

#### F. Knowledge generator and packaging (roadmap §3.1, §3.2, §2 "Versioning and compatibility"; §7 Days 5–6)

- **FR-032**: A new `packages/cli/scripts/generate-knowledge.ts` MUST write `dist/docs/index.json`, `dist/docs/curriculum/*.md` and `dist/docs/generated/*.md`.
  - It runs with `tsx`. It is outside the CLI `tsconfig.json` (`include: ["src/**/*.ts"]`), emits no `.d.ts`, and is not covered by `effect:check` or coverage.
  - Its output MUST be deterministic: no timestamps, stable ordering.
  - It MUST replace any previous `dist/docs`, because a dev build does not `rmSync(dist)` (`esbuild.mjs:79`).
  - Script: `pnpm -C packages/cli generate:knowledge`.

  *(§3.1, §3.2 "Generator")*
- **FR-033**: `packages/cli/esbuild.mjs` MUST run the generator in both the dev and the production build. In the production build it runs **after** the `rmSync(dist)` (`esbuild.mjs:79`), so that `prepack` (`build:prod`) ships the docs. *(§2 "The generator runs inside esbuild.mjs after the production rmSync(dist)")*
- **FR-034**: `packages/cli/package.json` `files` MUST add `dist/docs/**`. *(§2)*
- **FR-035**: Chunk format:
  - one markdown file per chunk, with frontmatter `id, title, kind, use_cases, see, card`;
  - `card` ≤ 120 words;
  - every chunk ends with its `see:` ids;
  - curriculum bodies are 300–1,200 words, with a hard limit of 1,500;
  - generated chunks are exempt from the 1,500-word curriculum limit, but each generated chunk MUST be at most 6,000 words, the per-response cap of FR-019, so that `eligian_docs({ ids: [<id>], detail: true })` can always return it (FR-041, SC-013).

  *(§3.1, §3.4)*
- **FR-036**: The generated chunks in Phase 1 (§7 Days 5–6; sources per §3.2):
  - **`generated/operations-index.md`**: one line per operation, grouped by category (from `getAllOperations` / `getOperationsByCategory`). Each line gives the name, the argument types / enums, NEEDS, PROVIDES, ERASES, whether it resolves chains, and one Eligian call form.
    - "Resolves chains" comes from `SELF_RESOLVED` (`compiler/transformers/runtime-values.ts:100-112`). `SELF_RESOLVED` is **not exported** today; it MUST be exported through the FR-044 entry.
  - **`generated/operations/<name>.md`**: one per registry operation. No overlays yet; overlays are Phase 2–3.
  - **`generated/dataflow-tables.md`**:
    - which operation resolves `$operationdata` / `$globaldata` / `$scope` chains in which field (from `SELF_RESOLVED`);
    - the erased parameters (registry `erased`; `grep -c '"erased": true' registry.generated.ts` → 106);
    - the persistent outputs.
  - **`generated/controllers.md`** and **`generated/events.md`**. The events chunk gives the `eventArgs` types (via `utils/event-arg-types.ts`); `timeline-complete` carries no args.
  - **`generated/syntax-cheatsheet.md`**, from the grammar: either the generated `EligianGrammar()` (`generated/grammar.ts:10`, a `loadGrammarFromJson` result) or `eligian.langium` through Langium's loader. It lists the keywords, the contextual keywords of the `ActionName` rule (`eligian.langium:493`), and one line per statement rule.
  - **`generated/starters/<name>.md`**: each starter's `starterFiles`, verbatim (4 starters; `STARTERS`, `starters.ts:33`).
  - **`generated/config-shape.md`**:
    - built from the installed `eligius/jsonschema/eligius-configuration.json`, resolved via `require.resolve('eligius/package.json')`. eligius' `files` field is `["dist","jsonschema"]`, and the schema is not in its `exports`. Never read the sibling checkout;
    - plus the `config-builder.ts` defaults, the fields Eligian never emits, the fact that ids are random per compile, and the rule "trust `eligius/lint`, not the schema".
  - **`generated/diagnostics.md`**: the catalogue of every code, one line per code in the form `code · source · overlay id`.
    - The codes are `DIAGNOSTIC_CODES` (139 entries), the review codes (FR-030), `compile-failed` (`source: compiler`) and one `eligius-<rule>` line per curated Eligius lint rule (source `eligius-lint`).
    - The overlay id on a line is the code's own overlay, or the generic overlay of its `source` when it has none. The overlay text is NOT in `diagnostics.md`: it lives only in the per-code overlays under `curriculum/diagnostics/`, which `eligian_check` inlines (FR-015).
    - `LINT_RULES_CHECKED_BY_ELIGIAN` (`compiler/eligius-lint.ts:23`) is `['W111']`. It is the set of rules that `lintCompiledConfig` **filters out** (`:47`), because Eligian checks them on the source. It is the excluded set, not the list of rules the tools emit as `eligius-<rule>` (Difference 19).
    - `eligius/lint` exports no rule list. `ILintDiagnostic.code` is `string` (eligius 4.2.0 `dist/lint.d.mts:4908-4913`), and the module's value exports are `lintConfiguration` and `findFlowControlProblems` (`:4999`, `:5023`). The generator therefore keeps a curated `ELIGIUS_LINT_RULES` list.
    - Measured 2026-11-04 with `grep -o '"[EW][0-9]\{3\}"' <eligius>/dist/lint.mjs | sort -u`, the installed `lint.mjs` contains these rule literals: E001, E101, E111, E120, E130, E131, E140, E141, E160, E310, W110, W111, W150, W151, W160. The curated list is these 15 minus the excluded set: 14 rules.
    - `mcp-knowledge.spec.ts` asserts that the curated list equals the rule literals of the installed `lint.mjs` minus `LINT_RULES_CHECKED_BY_ELIGIAN`. An eligius upgrade that adds or drops a rule therefore fails the drift spec.
- **FR-037**: `generated/controllers.md` and the `eligian_operations` controller cards MUST mark two controllers:
  - RoutingController: **do-not-use**. Its metadata says "This is a work in progress, do not use this yet please" (`controllers.generated.ts:190`).
  - LottieController: **constrained**. `lottie-web` is a dependency of the extension only.

  The other controllers carry no status line until the Phase 2 overlays (Difference 10).
- **FR-038**: Literate probes: the generator compiles every ` ```eligian probe ` block in a `map-*` chunk with `compileWithMap` (`pipeline.ts:264`). It splices the real JSON fragment in after the block, with ids stripped and keyed by action name / timeline uri. The curriculum contains no hand-written JSON. *(§3.3)*

#### G. Curriculum (roadmap §3.3; §7 Days 7–8)

- **FR-039**: Phase 1 MUST ship these hand-written chunks under `packages/cli/src/mcp/knowledge/curriculum/`:
  - A: `what-is-eligius`, `what-is-eligian`, `project-layout`, `not-eligian`, `decisions`;
  - B: `map-dataflow`, `map-actions-and-calls`, `map-timeline-and-providers`, `map-events-and-interactions`, `map-controllers`;
  - C: `runtime-engine-lifecycle`, `runtime-scheduling`;
  - E: `storyboard`.

  Source rules:
  - Runtime claims in C MUST be claims that Phase 0 marked as probe-verified in `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md`, which means they carry a test-title reference into `mcp-runtime-claims.spec.ts`. Sentences the document marks `(not probed, Phase 0)` MUST NOT be taught as fact.
  - The `LANGUAGE_SPEC.md` sections that Phase 0 fixed may be mined. `KNOWN_ISSUES.md` may not (§3.3 sources).
  - `examples/demo.eligian` is not a source (decision 6).
  - The `not-eligian` chunk's `custom` line MUST state the verified current behaviour:
    - `using custom` is accepted with no diagnostic. `timeline-validator.ts:62` lists `'custom'` among the valid providers, and no non-test site in `packages/language/src` warns on it.
    - It compiles as an `animation` timeline, through the `default` branch of `mapProviderToTimelineType` (`compiler/transformers/config-builder.ts:540-550`).
    - It leaves out the host-source recipe, which waits on the decision-10 spec.

    Phase 1 adds no warning for the custom provider: the warning stays with the separate `custom` spec. The chunk does not teach decision 10's warning, which does not exist (Difference 11); the roadmap's wording of decision 10 is corrected in this phase (FR-056). A probe in `mcp-knowledge.spec.ts` compiles a `using custom` timeline and asserts no diagnostic and the emitted `type`, so the line cannot go stale silently (SC-013).
- **FR-040**: Diagnostics overlays `curriculum/diagnostics/<code>.md` (cause + fix, ≤ 120 words each) MUST exist for 30 codes, chosen as FR-055 defines: first the codes that the start states of eval cases 13 and 14 produce (FR-052), then the most frequent codes of the committed ranking, up to 30. The drift spec lists every code without an overlay (FR-042).
  - Regardless of the selection, the two review codes (`controller-imbalance`, `class-never-removed`) MUST have overlays in Phase 1 (FR-030), and MUST NOT be on the FR-042 allowlist. When the selection does not contain them, their overlays are in addition to the 30.
  - One generic overlay per `source` (FR-036) MUST exist, so that every diagnostic has a `fix` (FR-015).
- **FR-055**: The selection of the 30 overlay codes MUST be reproducible from a committed script, `packages/cli/scripts/rank-diagnostic-codes.ts` (run with `tsx`; package script `rank:diagnostic-codes`).
  - The script runs `checkFiles`, Eligius lint and the review pass over the CLI and language test fixture corpus and over the examples, counts the codes produced, and ranks them by count (ties by code, alphabetical, so the output is deterministic). *(Ruling 2026-11-05, T061)* The corpus is the **committed** fixtures only: `__fixtures__/library-tests/` and `__fixtures__/library-error-tests/`, which `cli-library.spec.ts` and `cli-library-errors.spec.ts` create and delete while they run, are excluded by negative patterns, so the ranking that `mcp-knowledge.spec.ts` recomputes under `pnpm test` does not depend on test timing.
  - It writes the ranking and the selection to a committed file (`packages/cli/scripts/diagnostic-code-ranking.json`; the plan may rename it).
  - The selection is: (1) the codes that the start states of eval cases 13 and 14 produce under the strict check (FR-052), in code order; (2) then the highest-ranked remaining codes, until there are 30. The overlay files of FR-040 are exactly this selection plus the review codes of FR-040 and the generic overlays.
  - `mcp-knowledge.spec.ts` asserts that the committed selection equals the script's output, and that every selected code has an overlay (SC-013).
  - The Day 7–8 overlays are written from this selection, not from the first harness runs.

#### H. Drift and correctness specs (roadmap §2 "Drift and correctness tests"; §3.2 `dataflow-tables`)

- **FR-041**: `mcp-knowledge.spec.ts` MUST assert that:
  - the generated docs name every registry operation (`getAllOperations()`), the 9 controllers, the 46 timeline events, every grammar keyword, the 4 starter names and every top-level property of `eligius-configuration.json`;
    - "every grammar keyword" means every `Keyword` node reachable from the entry rule of `EligianGrammar()` whose value matches `/^[a-z][a-zA-Z]*$/`. That excludes punctuation and operators such as `[`, `..` and `@`, and includes the contextual keywords of `ActionName`. Each such keyword must be named in `generated/syntax-cheatsheet.md`;
  - two runs of the generator produce byte-identical output;
  - every literate probe compiles, and its spliced output equals the checked-in `__snapshots__`;
  - every card and body respects FR-035, including the 6,000-word limit for each generated chunk (`generated/diagnostics.md` and `generated/operations-index.md` among them).
- **FR-042**: Missing overlays are the codes in the FR-036 catalogue that have no `curriculum/diagnostics/<code>.md`. `mcp-knowledge.spec.ts` MUST track them as a checked-in allowlist that may only shrink (Difference 9):
  - a code that is missing from the docs and not on the list fails;
  - a listed code that gained an overlay fails until it is removed from the list.

  Phase 3 empties the list.
- **FR-043**: `dataflow-tables.spec.ts` MUST lint, for every operation × field, a probe config that puts a `$operationdata.` chain string in that field. It lints through `eligius/lint` (`lintConfiguration`, eligius `dist/lint.d.mts:4999`). It asserts that W150 fires exactly where `generated/dataflow-tables.md` says the field is not resolved. *(§3.2: Eligius' `RESOLVING_FIELDS` is not exported from `eligius/lint`; confirmed, it is not among the exports of `lint.d.mts`)*

#### I. Language API entry (roadmap §7 Touches `@eligian/language/mcp`)

- **FR-044**: A new entry `@eligian/language/mcp` (`packages/language/src/mcp.ts` or similar) MUST export:
  - `HTMLRegistryService` (`html/html-registry.ts:49`);
  - `scanLayoutElements`, `readLayoutHtml` and `LayoutElements` (`html/layout-elements.ts:13-51`);
  - `selectorNames`, `layoutElementsOf` and `SelectorNames` (`css/selector-sources.ts:18-51`);
  - `parameterRoles`, `argumentRole`, `calledAction` and `ParameterRole` (`css/parameter-roles.ts:28-63`);
  - the document-symbol data:
    - `EligianDocumentSymbolProvider` (`lsp/eligian-document-symbol-provider.ts:69`);
    - from `lsp/timeline-symbols.ts`, the data helpers `timelineSymbolAt` (`:44`), `timelineNamed` (`:70`), `navigatesTo` (`:75`) and `similarTimelineNames` (`:158`), and the type `TimelineSymbol` (`:31`);
    - not its editor helpers: `timelineNameTokens`, `innerRange`, `renameTimelineEdits`, `invalidTimelineName`, `navigateTargetCompletions` and `navigateTargetCodeActions` are not exported;
  - `CONTROLLERS` and `getController` (`controllers.generated.ts:29, 238`);
  - `TIMELINE_EVENTS` (`timeline-events.generated.ts:29`);
  - `DOM_EVENTS` (`dom-events.ts:9`) and `KEY_COMPLETIONS` (`key-names.ts:83`);
  - `hostControllers` and `hostFunctions` (`host-operations.ts:44, 48`). The root exports only `controllerMetadata`, `HostModule`, `hostModuleOf`, `hostOperations` and `isKnownController` (`compiler/index.ts:155-161`);
  - the `controller-balance` API (FR-028);
  - `SELF_RESOLVED` (FR-036).

  The entry MUST be wired in three places:
  - `packages/language/package.json` `exports["./mcp"]` (today the exports are `.`, `./errors` and `./eligius-lint`);
  - a fourth entry in `packages/language/esbuild.mjs`, beside `index.cjs` (`:33`), `errors` (`:49`) and `eligius-lint` (`:67`);
  - `WORKSPACE_SOURCES` in `packages/cli/esbuild.mjs:32-37`.

  The CLI's server code imports these only from `@eligian/language/mcp` or from the package root.

  **The entry's runtime exports are exactly**: `HTMLRegistryService`, `scanLayoutElements`, `readLayoutHtml`, `selectorNames`, `layoutElementsOf`, `parameterRoles`, `argumentRole`, `calledAction`, `EligianDocumentSymbolProvider`, `timelineSymbolAt`, `timelineNamed`, `navigatesTo`, `similarTimelineNames`, `CONTROLLERS`, `getController`, `TIMELINE_EVENTS`, `DOM_EVENTS`, `KEY_COMPLETIONS`, `hostControllers`, `hostFunctions` and `SELF_RESOLVED`. Two kinds of name are added to this list in `plan.md`: the controller-balance function(s) (sketch: `controllerBalance`), and any services accessor that FR-022 needs (`getOrCreateServices` and `releaseWorkspaceDocuments` are not root-exported, Difference 4). The exports test compares the sorted `Object.keys(await import('@eligian/language/mcp'))` with that list. The types `LayoutElements`, `SelectorNames`, `ParameterRole` and `TimelineSymbol` are checked by a type-only import in the same test.
- **FR-045**: Language tests MUST cover the entry's API surface: an exports test, plus behaviour tests for `controller-balance` and for the new `data` in `check.ts`. `packages/language` coverage must stay at or above lines 79.8, functions 80 and branches 69.9.

#### J. Versioning, docs, CI (roadmap §2 "Versioning and compatibility", "Install story"; §7 Day 9)

- **FR-046**: Version 1.1.0:
  - `packages/cli/package.json` `version` MUST be `1.1.0`.
  - The starters' `eligian` devDependency (`starters.ts:118`, today `'^1.0.0'`) MUST be `'^1.1.0'`.
  - `init.spec.ts:40-49` MUST assert `^<major>.<minor-that-introduced-mcp>.0`, that is 1.1.
  - The root `AGENTS.md` line "starters depend on `eligian` `^<major>.0.0`" MUST read `^<major>.<minor-that-introduced-mcp>.0`.
- **FR-047**: `packages/cli/README.md` MUST document:
  - `eligian mcp` and the five tools;
  - the install snippet for each client: Claude Code (`.mcp.json` / `claude mcp add`), Cursor, VS Code and Codex (§2 table);
  - the `npx -y eligian@^1.1 mcp` fallback, in the form the Windows handshake proved to work for each client (SC-016): the Phase 1 Windows handshake test settles whether `npx` needs a `cmd /c` wrapper on native Windows, and the README records the working form for each client;
  - that on a 1.0.x install, `eligian mcp` is swallowed by the default `compile` command;
  - that Codex applies project config to trusted projects only **[UNVERIFIED]**;
  - a security note: `host.ts` is user code; and the tools restrict only the paths given as tool input to the project root, while the files a program imports are resolved under the language's rules, which allow `../` (FR-007, FR-058).

  `CHANGELOG.md` gets the 1.1.0 entries.
- **FR-048**: `package-bin.spec.ts` changes:
  - The exact packed file list (`:182-205`, today `LICENSE`, `README.md`, `bin/cli.js`, `dist/cli.mjs`, `package.json`) MUST be extended by every file the generator writes under `dist/docs/`, including `dist/docs/index.json`.
  - The test "mcp answers initialize in under 3 s" (`:116-165`) is skipped today because `hasMcp` is false. It MUST run and pass.
- **FR-049**: The inspector and the workflows:
  - `@modelcontextprotocol/inspector` MUST be a pinned devDependency of `packages/cli`. Its postinstall script is a no-op when installed under `node_modules`, so `pnpm-workspace.yaml` lists it under `allowBuilds` as `false` (ruling 2026-11-04, T006); without that entry `pnpm install --frozen-lockfile` exits 1 with ERR_PNPM_IGNORED_BUILDS in every workflow.
  - `.github/workflows/ci.yml` MUST run an inspector gate after the build: `--cli node packages/cli/bin/cli.js mcp --method tools/list` lists the five tools.
  - The `eligian check … --max-warnings 0` line of the "Try the package" step (`publish-cli.yml:91`) MUST gain the same `"!examples/demo.eligian"` exclusion as the root `check:examples` script, and a separate non-strict line for the demo (FR-054). With the 1.1.0 defaults (FR-031), `demo.eligian` reports 13 diagnostics, so the first publish would otherwise fail.
  - The "Try the package" step of `.github/workflows/publish-cli.yml` (`publish-cli.yml:86-92`) MUST read one doc through the installed `eligian mcp` (an inspector `tools/call` of `eligian_docs`). The step fails when the call returns `isError` or no docs.

  *(§2; §7 Touches `ci,publish-cli`)*

#### K. One-case eval harness (roadmap §6.4; §7 Day 2, Exit)

- **FR-050**: `evals/mcp/run.ts` runs under tsx, outside Biome and tsconfig, and imports nothing from `packages/**/src`. It MUST do the following:
  - once per run: `pnpm -C packages/cli pack`;
  - for each case:
    1. create a temp dir and `npm install <tarball>` into it;
    2. copy the case fixtures;
    3. write `.mcp.json` with `node <tmp>/node_modules/eligian/bin/cli.js mcp`, and write the arm's `AGENTS.md`;
    4. run `claude -p "<prompt>" --mcp-config <tmp>/mcp.json --strict-mcp-config --permission-mode acceptEdits --allowedTools "mcp__eligian__*,Bash(node *),Bash(npx eligian*)" --output-format json` with a pinned model;
    5. run the gate;
    6. write `evals/mcp/results/<run>/<case>.json`: pass, rounds, tool calls and their sequence, tokens-from-tools (from `ELIGIAN_MCP_LOG`), wall time.

  In Phase 1 the harness supports arm A1 only, selected by `--case <id>`. It runs locally under the user's subscription (decision 9).
- **FR-051**: The Phase 1 gate, `evals/mcp/gate.ts`, runs from the produced project directory with the tarball installed (`node node_modules/eligian/bin/cli.js`). It holds every part of §6.1 that the shipped CLI can run, plus each case's §6.2 pass checks:
  1. (§6.1 step 1) `eligian check <entry> --max-warnings 0 --selector-not-in-layout ids`, with lint and review on, exits 0.
  2. (step 2) `eligian fmt --check "**/*.eligian"` exits 0.
  3. (step 3, without scenario and determinism) `eligian smoke <entry> --strict --format json` exits 0. `smoke`, `--strict` and `--format json` ship today: `main.ts:372-394`, with `--strict` at `:379`, and the formats `pretty | github | json` at `smoke/smoke-command.ts:16`.
  4. (step 4, without the assertion library) `eligian compile <entry> --eligian-map -o out/config.json` exits 0 (`main.ts:458`; `--eligian-map` at `:479`). The case checks below read `out/config.json` and its Eligian map, with inline code in `gate.ts`.
  5. (step 6, budget) At most 2 self-correction rounds; wall clock ≤ 15 min; tokens-from-tools ≤ 80,000 chars.
     - A **self-correction round** is, as §6.1 step 6 defines it, a check invocation after the first one, by tool or by CLI. `rounds` = (the `eligian_check` lines in `ELIGIAN_MCP_LOG`) + (the Bash tool calls in the agent transcript whose command runs `eligian check` or `cli.js check`) − 1. The result JSON records both counts and `rounds`.
     - **[UNVERIFIED]**: whether `claude -p --output-format json` carries the per-tool-call transcript. If it does not, the driver uses `--output-format stream-json --verbose`, and `compliance.md` records the change from §6.4's command.

  Case checks (§6.2). Compiled output is compared by action name and timeline uri, never by id:
  - **Case 13 (`fix-dataflow`)**:
    - Both start-state diagnostics are fixed with `target`, `with` or the erased-parameter save/restore, not by deleting code. In `out/config.json`, the action that held the start state's `addClass` still contains that `addClass`. Earlier in the same operation list there is a `selectElement`, or a `setOperationData` of a `__eligian_param_<name>` key (`preservedParameterKey`, `compiler/transformers/erased-parameters.ts:34`). The operation that read the erased property is still present.
    - `beats.min` unchanged: the timeline-action count of the compiled config is ≥ the start state's.
  - **Case 14 (`fix-selectors`)**:
    - The layout contains the ids that the start state's selectors referenced only in CSS.
    - Controllers are balanced (§6.2 `controllers.balanced`): the FR-028 walker over `out/config.json` reports equal add and remove multisets for every timeline, and `controller-imbalance` is clean.

  Left out, each with the phase that owns it:
  - the `--scenario` part of step 3, and the behavioural assertions of step 5: Phase 2 (smoke scenarios);
  - `--determinism` (step 3): Phase 3;
  - the assertion library `packages/cli/src/mcp/evals/assert.ts` of step 4: Phase 3 (§7 Phase 3 Touches). Phase 1's two cases use inline checks in `gate.ts`;
  - the tool-call budget of step 6 (≤ the reference run's count × 1.5): Phase 3. §6.1 sets it "per case from the reference solution's own agent run", and reference solutions are Phase 3. Phase 1 records the tool-call count without gating on it;
  - step 7, the rubric: Phase 3, and never gating.
- **FR-052**: Fixtures for the two cases MUST be created as `evals/mcp/cases/<id>.json` plus fixture files:
  - case 13 (`fix-dataflow`): an `addClass` before any select in an end block, reached through an action call, so that the code is `missing-action-dependency` (`operation-dataflow.ts:395-399`) as §6.2 names it; and an `erased-property-access`;
  - case 14 (`fix-selectors`): selectors that exist only in CSS, two `styles` imports, an `on click` bare in a timeline body, and a controller added in `on enter` without removal.

  Each start state MUST produce its named diagnostics under the strict check. This proves the case is well-formed. The codes that the two start states produce also seed the overlay selection (FR-055).

  *(Ruling 2026-11-05, compliance closure)* The strict check runs Eligius lint and the review pass only over a program **without errors** (`check-command.ts:184`; a program with errors has no trustworthy config). Case 14's controller defect is therefore reported once its two errors are fixed, not in the start state; `eval-cases.spec.ts` › `fix-selectors hides a controller imbalance behind its errors` pins that. The row is read as: each start state produces its named **language** diagnostics, and its review diagnostics once the errors are gone. This two-layer shape is intended: it is what makes case 14 take two rounds.

#### L. Decisions from the clarification session

- **FR-053** (no service recycling in Phase 1): Phase 1 MUST NOT build the Langium service recycling after N = 100 compiler calls; `compiler-lock.ts` has no reset hook and no call counter.
  - It is deferred to Phase 3's soak test. The roadmap's §7 Phase 3 "Touches" MUST gain the service recycling (`releaseWorkspaceDocuments` + a fresh `getOrCreateServices`, with the reset hook exported from the language package), recorded as a text edit in FR-056.
  - Phase 1 MUST measure the heap growth per `eligian_check` and record it in `compliance.md` (SC-026).
- **FR-054** (`examples/demo.eligian` under the 1.1.0 defaults, decision 4): With the defaults of FR-031, `demo.eligian` reports 13 diagnostics.
  - The root `package.json` `check:examples` script MUST gain the exclusion `"!examples/demo.eligian"` and keep `--max-warnings 0` for everything else.
  - The `eligian check … --max-warnings 0` line of `publish-cli.yml` ("Try the package", line 91) MUST gain the same exclusion.
  - Both the `check:examples` script and the "Try the package" step MUST then run a separate non-strict line for the demo: `check examples/demo.eligian --selector-not-in-layout off`, with no `--max-warnings`, so that the demo still compiles in CI (exit 0 while it has no errors).
  - `demo.eligian` itself is not changed. It stays outside teaching and evals (decision 6).
- **FR-056** (roadmap text corrections): Phase 1 MUST make these edits to `specs/058-mcp-server/roadmap.md`, and list them in `compliance.md`:
  - §8 decision 10: the wording "until it lands the compiler keeps the raf stand-in with a warning" is corrected to the verified behaviour: `using custom` is accepted silently and compiled as an `animation` timeline; the warning belongs to the separate `custom` spec (FR-039);
  - §7 Phase 3 Touches: the Langium service recycling is added (FR-053);
  - §7 Phase 1 exit criterion: the Linux half of the handshake is worded as SC-016 defines it (server-side evidence from the PR's `ubuntu-latest` CI run, plus one manual `claude mcp list` on a Linux host with Node 22+ when available). This is the explicit recorded relaxation that SC-016 requires.
- **FR-058** (import locations, MCP and CLI parity): `eligian_check`, `eligian_operations({ path })` and `eligian_fmt` MUST NOT refuse, rewrite or add diagnostics for an import whose resolved path lies outside the project root. The diagnostics for a program are identical via the MCP tools and via the CLI (FR-007).

### Key entities

- **McpDiagnostic**: one finding, as defined in FR-015.
- **Chunk**: one markdown knowledge unit, with frontmatter (`id`, `title`, `kind`, `use_cases`, `see`, `card`) and a body. A chunk is either curriculum (hand-written) or generated.
- **Index**: `dist/docs/index.json`, `[{ id, title, kind, use_cases, words, see, card }]`.
- **Overlay**: a curriculum file that adds to a generated entry: cause and fix for a diagnostic, or idioms and status for an operation or controller.
- **Review finding**: a warning computed over the compiled config + Eligian map, located at source, with a code from FR-030.
- **Eval case**: `evals/mcp/cases/<id>.json`, holding the prompt, the fixtures and the gate checks.

## Success criteria

**Built-artifact precondition** (applies to SC-001, SC-002, the inspector half of SC-003, SC-014, SC-015, SC-016 and the roots case of SC-021): the CLI tests resolve `@eligian/language` to the built `dist/index.cjs`, and `package-bin.spec.ts` skips its bundle tests when `dist/cli.mjs` is absent (`test.skipIf(!built)`). These criteria are therefore measured only after `pnpm build`, with `pnpm -C packages/cli exec vitest run <file>`. The vitest summary is quoted in `compliance.md` and MUST show **0 skipped**.

- **SC-001 (handshake + cold start)**: `package-bin.spec.ts` › "mcp answers initialize in under 3 s" passes and is not skipped, on Windows locally and on `ubuntu-latest` in CI. *(Amended 2026-11-05, as Phase 0 SC-009)* `ci.yml` runs on pull requests to `main` only, so the `ubuntu-latest` half is verified by the phase's PR run; until then `compliance.md` records it as pending. Metric: `initialize` is answered with a `result` in < 3,000 ms. `mcp-server.spec.ts` asserts that `serverInfo.version` equals the `version` in `packages/cli/package.json`.
- **SC-002 (stdout purity)**: `mcp-stdout.spec.ts` asserts that nothing but protocol frames reaches stdout, using writers that are known to fire. An ordinary check alone would prove nothing: outside tests, `console.log|info|debug` occurs in `packages/language/src` and `packages/cli/src` only in `compiler/effects/layers.ts:65-81` (a debug logger layer) and in comments, so a check would pass even with no redirect installed. The spec has four parts:
  - **Noise run**: spawn `node --import <__fixtures__/mcp/noise.mjs> bin/cli.js mcp`.
    - The preload polls for a trigger file named by an env var. When the file appears, it calls `console.log`, `console.info`, `console.debug` and `process.stdout.write`, each with its own sentinel string.
    - The test creates the trigger file after the `initialize` result has arrived, so the redirect is installed by then. It then sends `notifications/initialized`, `tools/list` and one `eligian_check`, on a fixture that exercises Langium, Typir, Eligius lint and review.
    - Metric: every stdout line parses as JSON with `jsonrpc: "2.0"`; non-protocol stdout lines = **0**; every sentinel appears on stderr and none on stdout; stderr has at least 1 telemetry line (FR-008).
  - **Crash run**: a second preload throws an uncaught exception from the same trigger. Metric: the process exits non-zero, stderr contains the exception message, and every stdout line is still a complete JSON-RPC frame.
  - **Effect logger**: an in-process test, through `serverLayer` with a tool the test adds, runs `Effect.log` and `Effect.logInfo` inside the server's runtime. The text arrives on the stderr side and never in the `Stdio` stdout sink. *(Ruling 2026-11-05, compliance closure)* Replaced by plan correction C10: `serverLayer` takes no extra tools, so the test logs through the server's own path instead: `mcp-stdout.spec.ts` › `stderrLoggerLayer logs through console.error, never console.log` (the logger layer every Effect log line goes through) and › `a tool defect is logged to stderr and answered as kind internal` (`catchDefects`' `Effect.logError` inside the server runtime, with the stdout sink asserted frame-only). Together they cover what the bullet asked for.
  - **Unit**: `redirectConsoleToStderr()` routes each of `console.log`, `info`, `debug`, `warn` and `error`, and `process.stdout.write`, to stderr; its returned `write` still reaches the original stdout.
- **SC-003 (tool surface)**: two clients list the tools.
  - **`mcp-server.spec.ts`**, through the in-process test client (`__tests__/mcp-test-client.ts`):
    - It is `effect/ai` `McpClient.make` over a hand-written in-memory `McpClient.Transport` (`McpClient.d.ts:185-194`: `protocol`, `request`, `notify`, `isCallable`).
    - The transport feeds request frames to `serverLayer` through a `Stdio.make` service (`Stdio.d.ts:130`): it writes the service's `stdin` stream and reads its `stdout` sink. The transport negotiates `v2025_11_25` (FR-002).
    - Why hand-written: `McpClient` has no in-memory transport. It exports `make`, `toolkit`, `Transport`, `stdio`, `layerStdio`, `http` and `layerHttp` (`McpClient.d.ts:136-282`). `McpClient.stdio` needs a `ChildProcessSpawner` (`:202-206`), for which effect 4.0.7 ships only `ChildProcessSpawner.make(spawn)` (`process/ChildProcessSpawner.d.ts:213`), and the workspace has no Node implementation.
    - Tests that need a real process (SC-001, SC-002, the roots case of SC-021) use a raw newline-delimited JSON-RPC helper over `child_process.spawn`, as `package-bin.spec.ts:116-165` does.
  - **The inspector**: `npx @modelcontextprotocol/inspector --cli node packages/cli/bin/cli.js mcp --method tools/list`.

  Both list exactly **5** tools, named as in FR-016. Exactly the three upfront tools have `_meta["anthropic/alwaysLoad"] === true`, and the annotations match FR-016. CI runs the inspector command (FR-049).
- **SC-004 (budgets)**: `mcp-server.spec.ts` asserts:
  - instructions ≤ **4,096** chars;
  - each upfront description ≤ **1,000** chars;
  - each deferred description ≤ **16,384** chars, and every entry of its tool file's `KEYWORDS` occurs, case-insensitively, in `description.slice(0, 200)` (FR-017);
  - every backticked token of the instructions that matches `/^[a-z0-9_/-]+$/` is a tool name of this phase or an `index.json` id (FR-018).
- **SC-005 (concurrency)**: `mcp-concurrency.spec.ts` fires these calls at once through the in-process test client, **20** times, with the recording `CompilerLock` hooks of FR-010:
  - call A: `eligian_check` with `selectorNotInLayout: 'ids'` on a layout program with a CSS-only id. It expects the not-in-layout warning;
  - call B: `eligian_check` with `selectorNotInLayout: 'off'` on another program;
  - one `eligian_fmt` alongside.

  Metrics:
  - **Equality**: every concurrent result deep-equals the sequential baseline of the same call, ignoring `header` and telemetry. Mismatches = **0**.
  - **Overlap**: in at least one iteration, a call's `onQueued` timestamp lies between another call's `onAcquire` and `onRelease`, which means it waited on the lock. Without this the test fails: a client or server that happened to serialise the requests would pass the equality metric without testing anything.
  - **Negative control**: the same 20 iterations with a pass-through `CompilerLock` layer give at least 1 mismatch.
    - If the control fails to show a mismatch in any of 10 consecutive local runs, it is not committed as a test. Instead it is run once by hand, and its output is quoted in `compliance.md`.
    - The overlap metric stays mandatory either way.
- **SC-006 (check tool)**: `mcp-check.spec.ts` uses one fixture per case and asserts the exact `code` and `source`. Payloads are read as FR-005 describes.
  - The selectedElement dependency, with two fixtures (User story 2, acceptance 1):
    - the inline `at 0s..1s [ ] [ addClass("x") ]` gives `missing-dependency`;
    - an end block that calls an action whose body adds a class with nothing selected gives `missing-action-dependency`.

    Each carries a `quickFix` whose `newText` contains `selectElement(` (FR-013). Applying the `quickFix` mechanically and checking again clears that diagnostic.
  - `unknown_operation`, with non-empty `suggestions` (FR-014).
  - The CSS sites of FR-014: an unknown className argument (`unknown_css_class`), an unknown class in a selector (`unknown_css_class_in_selector`) and an unknown id in a selector (`unknown_css_id_in_selector`). Each yields non-empty `suggestions`, equal to the names in the message's "Did you mean: …?" part.
  - The FR-014 messages are unchanged: a language spec under FR-045 compares the message text of `unknown_operation` and the three CSS codes with a snapshot taken before the change.
  - A mistyped DOM event in an `on <event>` interaction (`unknown_dom_event`), with `suggestions` (FR-012).
  - An `eligius-<rule>` finding, with `source: 'eligius-lint'`.
  - `controller-imbalance` and `class-never-removed`, with `source: 'review'`.
  - A warnings-only program: `ok: false` at the default `maxWarnings` of 0, and `ok: true` with `maxWarnings: 10`.
  - A nonexistent path: `isError` with `kind: 'not-found'`.

  Every diagnostic has an `excerpt` and a resolved absolute `file`. The first diagnostic of each code has a non-empty `fix`, and the later ones of that code carry `docs` without `fix` (FR-015).
- **SC-007 (review pass)**: `review.spec.ts` asserts:
  - two imbalanced fixtures, one whose timeline has an `on leave` block and one whose timeline has none, each give exactly one `controller-imbalance` per unbalanced timeline. In both, applying the `quickFix` mechanically (replace its range with `newText`, FR-011) and checking again gives 0 review findings and 0 errors (FR-030);
  - `class-never-removed` has these fixtures (FR-030):
    - one positive (a literal `addClass` on a literal selector, nothing removing it afterwards), and a positive for an `on enter` add with no removal in `on leave`;
    - negatives: removed in the end block of the same action, removed in a later range, toggled, removed in the timeline's `on leave`, an `on enter` add paired with an `on leave` removal;
    - an add through a parameterised action call (the `showView(view)` / `hideView(view)` pattern of the tour) whose removal is in `on leave` through another parameterised call: no finding, because the walker substitutes the arguments;
    - a non-literal selector (runtime concatenation, such as `view + " .in"`, or an unresolved parameter) on the add or on the removal: no finding for that class on that timeline.

  In addition, `tour-controllers.spec.ts` passes using `controller-balance.ts`, and `eligian check examples/eligian-tour/*.eligian --max-warnings 0` exits 0 with review on, with the tour files unchanged (`git diff --stat -- examples/eligian-tour` is empty).
- **SC-008 (CLI alignment, decision 4)**: `check-command.spec.ts` (or a new spec) asserts:
  - a program that imports a layout and has an id only in CSS gets the not-in-layout warning from `eligian check` with **no** flags;
  - `--selector-not-in-layout off` removes that warning;
  - `--no-review` removes the review warnings;
  - a program without a `layout` import gets no not-in-layout warning by default;
  - for diagnostics without `data`, the CLI JSON output is byte-identical to before (a snapshot of one fixture, taken before the change).
- **SC-009 (fmt tool)**: `mcp-fmt.spec.ts` asserts:
  - check mode on an unformatted file returns `formatted: false` with a `lineDiff`, and the file's bytes are unchanged;
  - write mode rewrites the file, and a second check returns `formatted: true`;
  - a file with a syntax error returns `error` and is unchanged.

  `fmt.spec.ts` passes unchanged, and the output of `pnpm run fmt:examples` is identical before and after `runFmt` moves onto `fmtFiles`.
- **SC-010 (operations tool)**: `mcp-server.spec.ts` or `mcp-operations.spec.ts` asserts:
  - `names: ['addClass','selectElement','adClass']` gives 2 cards whose first lines are NEEDS / PROVIDES / ERASES, and 1 unknown name whose `suggestions` contain `addClass`;
  - `kind: 'controller'` gives 9 entries, with RoutingController marked do-not-use and LottieController constrained;
  - `kind: 'event'` gives 46 entries; `kind: 'dom-event'` and `kind: 'key'` are non-empty;
  - `path` to a fixture with `extensions` gives the host operation card;
  - `needs: 'selectedElement'` gives the same operation names as `findOperationsWithDependency('selectedElement')`;
  - after `eligian_operations({ names, path })`, the shared `LangiumDocuments` holds no document for the fixture's URI, and `all` has the same count as before the call (FR-022). The test reads these through the accessor the plan chooses for FR-022.
- **SC-011 (docs tool)**: `mcp-knowledge.spec.ts` / `mcp-server.spec.ts` assert:
  - a call without arguments returns every `index.json` entry: the full card for each non-operation entry, and only `id` and `title` for each `kind: operation` entry. The whole response is at most **12,000** chars;
  - `{ ids: [<an operation id>] }` returns that operation's card;
  - `{ ids: <7 ids> }` is refused with an error result and returns no cards or bodies (the `maxItems: 6` schema, FR-019). *(Ruling 2026-11-05, T043)* The refusal is the library's, and its shape depends on the negotiated protocol: under **2025-06-18** a JSON-RPC error, `error.code === -32602`, no `result`; under **2025-11-25** a tool result `{ isError: true, content: [{ type: 'text', text: "Invalid parameters for tool 'eligian_docs': …" }] }` with no `structuredContent` and no header (`effect@4.0.7 dist/ai/internal/mcpProtocol/v2025_11_25.js:260` vs `v2025_06_18.js:256`). The test asserts **both**, one `it` per protocol, each on a session initialized with that `protocolVersion`;
  - a detail request over 6,000 words lists the overflow;
  - `{ query: 'selectElement' }` returns at most **8** entries, `operations-index` among them;
  - an unknown id returns the closest ids.
- **SC-012 (init tool)**: `mcp-init.spec.ts` runs each of the 4 templates in an empty temp dir and asserts:
  - the files of `starterFiles` exist, plus `.mcp.json`, `AGENTS.md` (with both markers) and `CLAUDE.md` (`@AGENTS.md`);
  - `.mcp.json` `args[0]` is absolute and ends with `node_modules<sep>eligian<sep>bin<sep>cli.js`;
  - the test itself runs `runCheck([<entry>], …)` on the new entry with the 1.1.0 defaults (selector `ids`, lint, review, `--max-warnings 0`), and gets 0 errors / 0 warnings. The tool response carries no check (FR-027 was removed).
  - *(Ruling 2026-11-05, T040)* The four starters in `packages/language/src/starters/starters.ts` did not pass the review pass: none removed in `on leave` the controllers its `on enter` interactions and `addController` calls add (a genuine `controller-imbalance`, the same pattern the tour handles in `leaveChapter`). Decision: the starters are fixed (not the rule, not SC-012): every timeline's `on leave` now removes those controllers, as the rule's quick fix inserts them (`DOMEventListenerController` on each `on click` selector, one `KeyboardController` per `on key` on the timeline container, `LabelController` on the labelled element). Done in the main loop; `init.spec.ts` still passes and each template checks 0/0 with the defaults.

  It also asserts that a dir with an existing `main.eligian` is refused without `force`, and that an existing `.mcp.json` or `AGENTS.md` is left byte-identical and reported as skipped.
- **SC-013 (drift + probes + dataflow)**: `mcp-knowledge.spec.ts` (FR-041, FR-042) and `dataflow-tables.spec.ts` (FR-043) pass. Metric:
  - missing names = **0**;
  - two generator runs are byte-identical;
  - probe snapshot mismatches = **0**;
  - W150 disagreements = **0**;
  - the missing-overlay allowlist has at most (catalogue size − 30) entries, where the 30 are the FR-055 selection;
  - `curriculum/diagnostics/controller-imbalance.md` and `curriculum/diagnostics/class-never-removed.md` exist, and neither code is on the allowlist (FR-030, FR-040);
  - a generator run into an `outDir` that holds a stale sentinel file (for example `generated/stale.md`) removes that file (FR-032);
  - the grammar keywords checked are exactly the FR-041 set;
  - the curated Eligius lint rule list equals the rule literals of the installed `eligius/dist/lint.mjs` minus `LINT_RULES_CHECKED_BY_ELIGIAN` (FR-036);
  - the `using custom` probe compiles with no diagnostic and emits `type: 'animation'` (FR-039);
  - every generated chunk is at most 6,000 words, and `eligian_docs({ ids: ['diagnostics'], detail: true })` returns `generated/diagnostics.md` whole (FR-035, FR-041);
  - `generated/diagnostics.md` has one `code · source · overlay id` line for every `DIAGNOSTIC_CODES` entry, every review code, `compile-failed` and every curated `eligius-<rule>`, and holds no overlay text (FR-036);
  - the committed overlay selection equals the output of the ranking script (FR-055), contains the codes of the case 13 and 14 start states, and every selected code has an overlay (FR-040).
- **SC-014 (docs in the tarball)**: after `pnpm -C packages/cli run build:prod`, the production path that deletes `dist`, `dist/docs/index.json` exists. The pack test in `package-bin.spec.ts` lists the base files plus every generated `dist/docs/**` file, `dist/docs/index.json` included.
- **SC-015 (publish path)**: the whole "Try the package" step of `publish-cli.yml`, as amended by FR-049, is run verbatim from the repo root against the packed 1.1.0 tarball:
  - `npm install -g ./packages/cli/eligian-1.1.0.tgz`;
  - `eligian --version`;
  - the `eligian check "examples/**/*.eligian" … --max-warnings 0` line, with the `"!examples/demo.eligian"` exclusion, and the separate non-strict demo line of FR-054;
  - `eligian smoke "examples/eligian-tour/*.eligian"`;
  - the inspector `tools/call` of `eligian_docs`.

  Metric: every command exits 0; `--version` prints `1.1.0`; the `tools/call` result is not `isError` and has at least 1 index entry. The whole output is quoted in `compliance.md`.
- **SC-016 (Claude Code handshake, Windows + Linux)**:
  - **Windows**: `claude mcp add eligian -- node <repo>\packages\cli\bin\cli.js mcp`, then `claude mcp list`, shows `eligian` connected. The same test runs for the `npx` form against the installed tarball, and it settles whether `npx` needs a `cmd /c` wrapper on native Windows. The README records the working form for each client (FR-047).
  - **Linux**: the exit evidence is (1) server-side evidence from the PR's `ubuntu-latest` CI run: the inspector `tools/list` gate (FR-049) and the `initialize` handshake test of `package-bin.spec.ts` (FR-048), run on the packed tarball; plus (2) one manual `claude mcp add eligian -- node <repo>/packages/cli/bin/cli.js mcp` followed by `claude mcp list` on a Linux host with Node 22+, when such a host is available. The local WSL (Node 18) is not a valid host and is not used. When no Linux host is available, `compliance.md` says that (2) was not done. *(Amended 2026-11-05)* Item (1) exists only once the branch has a PR (`ci.yml` runs on pull requests to `main`); until then it is recorded as pending, as Phase 0 SC-009 was.
  - This is a recorded relaxation of the roadmap's Phase 1 exit criterion, and the roadmap states it as such (FR-056).

  The commands and their output, for both platforms, are quoted in `compliance.md`.
- **SC-017 (eval cases)**: `tsx evals/mcp/run.ts --case fix-dataflow --arm A1` and `tsx evals/mcp/run.ts --case fix-selectors --arm A1` each write a result JSON with `pass: true` under the FR-051 gate. *(Met 2026-11-05 on commit `fa5dbfa`: fix-selectors `2026-11-05T01-51-01-963Z`, fix-dataflow `2026-11-05T01-52-53-934Z`; the earlier failures and their triage are in `compliance.md` Closure.)*
  - The JSON records: `rounds` and its two source counts (FR-051), the tool-call count and sequence, tokens-from-tools, wall time, the pinned model, the run id, `git rev-parse HEAD`, and whether the tree outside `evals/mcp/results/` was clean.
  - **Sample policy**: §6.4 says intermediate phases run arm A1 only, 1 run per case.
    - Every run the harness completes is committed under `evals/mcp/results/<run>/`, failed runs included.
    - A case counts only from its first run on a given tree. Re-running a case on an unchanged tree to replace a failure is not allowed: a re-run needs a change, and the earlier result stays committed.
    - The exit is met when the first run of each case on the tree submitted for the exit passes.
- **SC-018 (language API + coverage)**:
  - the `@eligian/language/mcp` exports test passes: the sorted `Object.keys` of the entry equal the FR-044 list exactly (as completed in `plan.md`), and the type-only import compiles;
  - `pnpm -C packages/language test:coverage:ci` passes with lines ≥ 79.8, functions ≥ 80 and branches ≥ 69.9;
  - `pnpm -C packages/cli test:coverage:ci` passes at or above its thresholds (`packages/cli/vitest.config.ts:14-19`: lines 77.1, functions 77.6, branches 64.5, statements 76.6).
- **SC-019 (versions)**:
  - `node packages/cli/bin/cli.js --version` prints `1.1.0`;
  - `init.spec.ts` asserts the starters' `eligian` range `^1.1.0`;
  - the `header` of every tool payload (FR-005) matches `/^eligian 1\.1\.0 · eligius \d+\.\d+\.\d+ · eligian_\w+ · /`, and `content[0].text` starts with `{"header":"eligian 1.1.0 · `.
- **SC-020 (lazy effect/ai)**: `package-bin.spec.ts` › "no static import of jsdom, esbuild or effect/ai" passes and asserts that `/\bimport\(\s*["']effect\/ai["']\s*\)/` matches. The `--version` median stays < 3,000 ms.
- **SC-021 (telemetry + paths)**: `mcp-server.spec.ts` asserts:
  - with `ELIGIAN_MCP_LOG` set, N tool calls append N JSON lines, each with `t, tool, ms, chars, ok, args`;
  - **Announced root**: a raw newline-delimited JSON-RPC client over the spawned `node bin/cli.js mcp` advertises `capabilities.roots` in `initialize`, and answers the server's `roots/list` with a temp dir's `file://` URI. A relative path given to `eligian_check` then resolves under that dir, and the response echoes it. (The `effect/ai` test client cannot produce this precondition: it sends `capabilities: {}` and declines every server request except ping, `McpClient.js:155`, `:684`.)
  - **No roots**: through the in-process test client, a relative path resolves against the server's `cwd` option, and the declined `roots/list` causes no error (FR-007).
  - **Outside the root**: `eligian_check({ paths: [<absolute path outside the root>] })` and `eligian_operations({ names: ['addClass'], path: <a path outside the root> })` each return `isError` with kind `not-found`.
  - **Imports outside the root**: a fixture program inside the root imports a CSS file through `../` from outside the root. `eligian_check` on it reports exactly the diagnostics that `eligian check` reports for the same file, with no refusal and no extra diagnostic on the import (FR-007, FR-058);
  - a Windows-style backslash path resolves on Windows;
  - `eligian_docs`, `eligian_operations`, `eligian_check` and `eligian_fmt({ write: false })` leave the fixture dir's file list and bytes unchanged.
- **SC-022 (cancellation)**: a test in `mcp-concurrency.spec.ts` (or its own spec) uses the in-process test client and the recording `CompilerLock`, whose latch holds a section right after acquire (FR-010):
  1. Send `eligian_check` (request 1). Wait until the hook reports request 1's `onAcquire`, so the cancel is known to land while the lock is held.
  2. Send `notifications/cancelled` for request 1, then `eligian_check` (request 2) on a different fixture. Release the latch.

  Assertions:
  - (a) no response frame arrives for request 1's id, up to 2 s after request 2's response;
  - (b) request 1's `onRelease` reports a completed section, and request 2's `onAcquire` timestamp is ≥ request 1's `onRelease` timestamp, so request 2 did not overlap request 1's `checkFiles` promise (FR-009);
  - (c) request 2's result deep-equals its sequential baseline.

  A second case cancels a request while it is still queued on the lock. It never reaches `onAcquire`, and gets no response.
- **SC-023 (repo gates)**: with the 1.1.0 defaults (selector `ids` + review on), all of these exit 0:
  - `pnpm build` and `pnpm typecheck`;
  - `pnpm check` (0 errors / 0 warnings);
  - `pnpm test`;
  - `pnpm effect:check` (0 errors / 0 warnings);
  - `pnpm run check:examples` (with `demo.eligian` excluded from the strict line and checked by the separate non-strict line, FR-054), `pnpm run fmt:examples` and `pnpm run smoke:examples`.
- **SC-024 (Day-1 spike)**: `compliance.md` quotes the FR-002a evidence, dated before the first Days 3–4 task:
  - the inspector `tools/list` output, with both throwaway `_meta` objects verbatim and `readOnlyHint`;
  - the Claude Code evidence: the connection, the instructions in effect, the alwaysLoad tool loaded at session start, and the 60,000-char result received inline;
  - the negotiated `protocolVersion` for each client;
  - the recorded wire encoding of a tool result;
  - the go/no-go verdict: go keeps `effect/ai` (decision 1); no-go (a failure on `_meta`, annotations or protocol negotiation) switches to the official SDK fallback of FR-002a.

  If any item is missing, the spike is not done.

- **SC-025 (demo gates)**: `pnpm run check:examples` exits 0 with `examples/demo.eligian` excluded from the `--max-warnings 0` line. The separate demo line (`check examples/demo.eligian --selector-not-in-layout off`, no `--max-warnings`) exits 0 locally and in the "Try the package" step. `git diff --stat -- examples/demo.eligian` is empty (FR-054).
- **SC-026 (heap growth, no recycling)**: `compliance.md` quotes the measured heap growth per `eligian_check`: the method (N sequential `eligian_check` calls through the in-process client on one fixture, `process.memoryUsage().heapUsed` read after a forced GC before the first call and after the last), N, the two readings and the growth per call in MB. A grep of `packages/cli/src/mcp/compiler-lock.ts` finds no call counter and no service reset (FR-053).
- **SC-027 (roadmap corrections)**: `specs/058-mcp-server/roadmap.md` no longer says that the compiler keeps the raf stand-in "with a warning" (decision 10); its Phase 3 Touches name the Langium service recycling; its Phase 1 exit criterion words the Linux half as SC-016 defines it (FR-056). `compliance.md` quotes the three changed passages.
- **SC-029 (protocols)**: `mcp-server.spec.ts` asserts that the server's `protocols` list equals `[v2025_11_25, v2025_06_18]` and does not contain `v2026_07_28` (FR-002), and the `package-bin.spec.ts` initialize with `protocolVersion: '2025-06-18'` succeeds (FR-048).

## Edge cases

- **Windows vs Linux paths**:
  - Tool inputs may use `\` or `/`, and drive letters in either case. Library locations come from document URIs with a lower-case drive (as the comment at `check-command.ts:141` notes), and `withLint` matches them with `path.relative(...) === ''` (`:144`).
  - `.mcp.json` gets OS-native absolute paths: backslashes on Windows (§2).
  - Globs always use forward slashes (`toGlobPath`, `check-command.ts:96`).
  - `excerpt` must handle CRLF files.
- **Concurrency on the shared Langium services**:
  - Two tools may run in parallel (FR-010).
  - A check that throws inside the lock must release it. Effect's `withPermits` releases on both failure and interruption.
  - `formatSource` keeps a second full service set (`format-source.ts:29`) and is still serialised.
- **stdout purity**:
  - Third-party `console.log` calls may come from Langium, Typir, eligius or jQuery.
  - The `console.log` in `esbuild.mjs:71` runs at build time only, not in the bundle.
  - An uncaught exception must print to stderr and exit non-zero. It must never write a partial frame to stdout (SC-002, crash run).
  - Effect's own logger must write to stderr (SC-002).
- **Missing files**:
  - A nonexistent path returns `isError` with kind `not-found`. So does a path outside the project root (FR-007).
  - A glob with no match also returns `not-found`; today `runCheck` returns exit 2 for this case (`check-command.ts:103-108`).
  - A missing imported library is a diagnostic from the import validator, not an `isError`.
  - A missing `dist/docs` (a dev build without the generator) makes `eligian_docs` return `isError` with kind `internal`, naming the `docsRoot`.
- **Stale caches**:
  - A `dist/docs` left over from an older build: the generator clears it (FR-032).
  - `checkFiles` re-reads the files on every call (`readFileSync`, `check.ts:164`) and releases the documents afterwards (`:244`).
  - CSS registry entries are cleared on every call (`:239-241`).
  - The full staleness specs (CSS / HTML / locales / library edits between calls) are Phase 2.
- **Cold start**:
  - Commands other than `mcp` must not load `effect/ai` (FR-003).
  - `jsdom` and `esbuild` stay lazy (Phase 0).
  - The docs are prebuilt, so the server answers `initialize` without generating anything.
- **A project on `eligian` 1.0.x**: `eligian mcp` is parsed as `compile mcp` and exits with an I/O error (`main.ts:458`, the default command). This is documented (FR-047), not fixed.
- **A project not yet installed after `eligian_init`**: `.mcp.json` points at `<dir>/node_modules/eligian/bin/cli.js`, which exists only after `npm install`. The next steps say so.
- **Review false positives**: a class added on purpose for the rest of a timeline (for example, a "visited" marker set in `on enter`) would be flagged by `class-never-removed`. `check:examples` runs with `--max-warnings 0` and must stay green (SC-023). The rule of FR-030 decides this: an `on enter` add is paired with `on leave`, a non-literal selector suppresses the finding, and the examples do not change. A class added in `on enter` on purpose for the rest of the timeline, with no removal in `on leave`, is still reported; that is the intended warning.
- **Large outputs**: `eligian_check` may run on a directory with many files. By default, responses stay under Claude Code's 50,000-char spill threshold (§3.5); the inlined overlay `fix` appears once per code per response (FR-015). `eligian_docs` is capped at 6 ids / 6,000 words.
- **Library files**: `eligian_check` on a library alone checks it but does not lint or review it; `withLint` skips libraries (`check-command.ts:150`). Review runs on programs only.

## Existing components (verified)

| Component | File | What Phase 1 reuses or changes | Real signature (typegraph, 2026-11-04) |
| --- | --- | --- | --- |
| `checkFiles` | `packages/language/src/compiler/pipeline/check.ts:68` | `eligian_check` core; diagnostics gain `data` (FR-012, FR-013) | `(filePaths: readonly string[], options?: CheckOptions) => Effect<readonly CheckFileResult[], never, never>` |
| `CheckDiagnostic` | `check.ts:32` | gains optional `data` (FR-011) | `{ file, severity: CheckSeverity, message, line, column, endLine, endColumn, code: string }` |
| `CheckOptions` (language) | `check.ts:62` | `selectorNotInLayout` per call; flips the shared `Settings` (`:75-82`) | `{ selectorNotInLayout?: SelectorNotInLayout }` |
| `compileErrorCode` | `check.ts:114` | unchanged | `(error: Pick<CompileError, "_tag">) => DiagnosticCode` |
| `getOrCreateServices` | `compiler/pipeline/services.ts:37` | the shared singleton the lock protects; not root-exported | `() => { shared: LangiumSharedServices; Eligian: EligianServices }` |
| `releaseWorkspaceDocuments` | `compiler/pipeline/parser.ts:364` | release discipline for `eligian_operations({ path })` | `(uris: Iterable<URI>) => void` |
| `parseSource` | `compiler/pipeline/parser.ts:68` (root-exported) | candidate loader for `eligian_operations({ path })` | `(source: string, uri?: string) => Effect<Program, ParseError \| ValidationError>` |
| `DIAGNOSTIC_CODES`, `isDiagnosticCode`, `DiagnosticSource` | `validators/codes.ts:183, 193, 18` (root-exported) | `McpDiagnostic.source`; diagnostics catalogue (139 entries) | `readonly DiagnosticCodeEntry[]` (`{ code, source }`); `(value: string) => value is DiagnosticCode` |
| `runCheck`, `expandPatterns`, `isLibrary` | `packages/cli/src/check/check-command.ts:98, 68, 47` | CLI defaults (FR-031); pattern expansion for the tools | `(patterns, options: CheckOptions) => Promise<CheckOutcome>`; `(patterns: readonly string[], cwd: string) => Promise<string[]>`; `(source: string) => boolean` |
| `withLint` (local) | `check-command.ts:138` | exported (FR-029) | `(results: readonly CheckFileResult[]) => Promise<CheckFileResult[]>` |
| `toGlobPath` (local) | `check-command.ts:96` | used through `expandPatterns` | `(p: string) => string` |
| `lintFile` | `packages/cli/src/check/lint.ts:12` | unchanged; `eligius-<rule>` codes (`:29`) | `(file: string) => Promise<CheckDiagnostic[]>` |
| `lintCompiledConfig`, `LINT_RULES_CHECKED_BY_ELIGIAN` | `compiler/eligius-lint.ts:37, 23, 47` (`@eligian/language/eligius-lint`) | `LINT_RULES_CHECKED_BY_ELIGIAN` is the **excluded** set (`['W111']`, filtered out at `:47`); the catalogue's rule list is curated (FR-036) | `(config, map, host?) => EligiusLintFinding[]`; `readonly string[]` |
| `lintConfiguration`, `ILintDiagnostic` | eligius 4.2.0 `dist/lint.d.mts:4999, 4908-4913` | `dataflow-tables.spec.ts`; no rule list is exported | `(configuration, options?) => ILintDiagnostic[]`; `code: string` |
| `compileFile` | `packages/cli/src/compile-file.ts:244` | review pass input (config + map) | `(inputPath: string, options?: CompileOptions) => Promise<CompileResult>`; `CompileResult.map: EligianMap` (`:55-69`) |
| `locateConfigPath`, `buildEligianMap` | `compiler/eligian-map.ts:266, 53` (root-exported) | review findings at source | `(map, config, jsonPath: string) => SourceLocation \| undefined`; `(ir: EligiusIR) => EligianMap` |
| `compileWithMap` | `compiler/pipeline.ts:264` (root-exported) | literate probes | `(source, options?) => Effect<{ config; map; host? }, CompileError>` |
| `getCompilerVersion` | `compiler/pipeline.ts:372` | `serverInfo.version`, response header | `() => { compiler: string; eligius: string }` (injected, Phase 0) |
| `formatSource` | `lsp/format-source.ts:25` (root-exported) | `fmtFiles` | `(source: string, options?: FormatSourceOptions) => Promise<FormatSourceResult>` |
| `runFmt`, `lineDiff`, `firstDifference` | `packages/cli/src/fmt.ts:89, 31, 78` | `runFmt` reimplemented over `fmtFiles` | `(patterns, options: FmtOptions) => Promise<FmtOutcome>`; `(before, after) => string` |
| `runInit`, `titleFromDirectory` | `packages/cli/src/init.ts:38, 28` | `eligian_init` | `(directory: string, options: InitOptions) => Promise<InitOutcome>` (`{ output, exitCode }`) |
| `STARTERS`, `starterFiles`, `findStarter`, `STARTER_ENTRY` | `starters/starters.ts:33, 79, 62, 31` (root-exported) | templates; `^1.1.0` (`:118`) | `(name: StarterName, options?: StarterOptions) => Record<string, string>` |
| Operation registry API | `compiler/operations/index.ts:80-229` (root-exported) | `eligian_operations`, generator | `getOperationSignature(name, context?)`, `getAllOperations()`, `getOperationsByCategory()`, `findOperationsWithDependency(name)`, `findOperationsWithOutput(name)`, `searchOperations(query)`, `suggestSimilarOperations(unknownName, maxSuggestions?, maxDistance?)` |
| `OPERATION_REGISTRY` | `compiler/operations/registry.generated.ts:13` | generated chunks (106 `"erased": true`) | `OperationRegistry` |
| `SELF_RESOLVED` (local) | `compiler/transformers/runtime-values.ts:100` | exported for the generator (FR-036) | `Readonly<Record<string, ReadonlySet<string> \| '*'>>` |
| Host declarations | `compiler/operations/host-operations.ts:40, 44, 48, 73` | `eligian_operations({ path })` | `hostOperations/hostControllers/hostFunctions(context: AstNode \| undefined)`; `hostSignature(decl) => OperationSignature` |
| `CONTROLLERS`, `getController` | `completion/metadata/controllers.generated.ts:29, 238` | controller cards / chunk | `ControllerMetadata[]` (9) |
| `TIMELINE_EVENTS` | `completion/metadata/timeline-events.generated.ts:29` | events | `TimelineEventMetadata[]` (46) |
| `DOM_EVENTS`, `KEY_COMPLETIONS` | `utils/dom-events.ts:9`, `utils/key-names.ts:83` | `kind: 'dom-event' \| 'key'` | `ReadonlyMap<string, string>` |
| `eligiusTypeToDslAnnotation` | `utils/event-arg-types.ts:38` | event arg types in `events.md` | `(eligiusType: string) => DslTypeAnnotation \| undefined` |
| `EligianGrammar` | `generated/grammar.ts:10` | cheatsheet | `() => Grammar` |
| `selectElementCodeActions`, `guessSelector` | `lsp/select-element-fix.ts:86, 43` | quick-fix text extracted (FR-013) | `(document, diagnostics) => CodeAction[]`; `(call: OperationCall) => string` |
| `HTMLRegistryService`, layout / selector / role helpers | `html/html-registry.ts:49`, `html/layout-elements.ts:21, 51`, `css/selector-sources.ts:38, 51`, `css/parameter-roles.ts:44, 50, 63` | `@eligian/language/mcp` (consumed in Phase 2) | class; `scanLayoutElements(html)`, `readLayoutHtml(program, html?)`; `layoutElementsOf/selectorNames(services, program, documentUri)`; `calledAction(call)`, `argumentRole(call, i)`, `parameterRoles(action, visiting?)` |
| `EligianDocumentSymbolProvider` | `lsp/eligian-document-symbol-provider.ts:69` | document-symbol data in the entry | class |
| Controller walker | `compiler/__tests__/tour-controllers.spec.ts:38-118` | lifted (FR-028) | test-local `resolve`, `walk` |
| `McpServer.layerStdio`, `toolkit` | `effect@4.0.7 dist/ai/McpServer.d.ts:249, 388` | server | see FR-002 |
| `McpProtocol` adapters | `dist/ai/McpProtocol.d.ts:176-215` | `protocols` | `v2026_07_28` (stateless), `v2025_11_25`, `v2025_06_18`, `v2025_03_26`, `v2024_11_05` |
| `Tool.make`, `Tool.Meta`, `Readonly` / `Destructive` / `Idempotent` | `dist/ai/Tool.d.ts:896, 1336, 1361, 1385, 1410` | tools | `make(name, { description?, parameters?, success?, failure?, … })`; `Meta` = `Context` service class |
| `Toolkit.make` | `dist/ai/Toolkit.d.ts:337` | toolkit | `(...tools) => Toolkit<ToolsByName<Tools>>` |
| `Stdio` | `effect@4.0.7 dist/Stdio.d.ts:108, 130, 151` | Node layer built on `make` | `Stdio: Context.Service<Stdio, Stdio>`; `make(options)`; `layerTest(impl)` |
| `Semaphore` | `effect@4.0.7 dist/Semaphore.d.ts:235, 326` | compiler lock | `make: (permits: number) => Effect<Semaphore>`; `withPermits` |
| `McpClient`, `Transport` | `dist/ai/McpClient.d.ts:35, 43, 136, 177-194, 202-206` | in-process test client over a hand-written in-memory `Transport` (SC-003) | `ProtocolVersion = "2025-11-25" \| "2026-07-28"`; `make` needs a `Transport`; `stdio` needs a `ChildProcessSpawner` (no Node implementation in the workspace); the client sends `capabilities: {}` (`McpClient.js:155`) and declines server requests except ping (`:684`) |
| `McpServer` tool-result encoding | `dist/ai/McpServer.js:1476-1479, 1555-1573` | FR-005 wire shape; FR-002a | `structuredContent` = encoded success; `content: [{ type: 'text', text: JSON.stringify(encoded) }]`; a declared handler failure → `isError: true`; annotations from `Tool.Readonly` / `Destructive` / `Idempotent` / `OpenWorld`; `_meta` passed through |
| `Stdio.make` | `effect@4.0.7 dist/Stdio.d.ts:64-92, 130` | the in-memory test transport | `{ args, stdin: Stream<Uint8Array>, stdout(): Sink, stderr(): Sink, … }` |
| `mapProviderToTimelineType` | `compiler/transformers/config-builder.ts:540-550` | the `not-eligian` `custom` line (FR-039) | `(provider: string) => 'animation' \| 'mediaplayer'`; `custom` → `default` → `'animation'` |
| `preservedParameterKey` | `compiler/transformers/erased-parameters.ts:34` | case 13 structural check (FR-051) | `(name: string) => string` (`__eligian_param_<name>`) |
| Smoke / compile CLI | `packages/cli/src/main.ts:372-394` (`smoke`, `--strict` `:379`), `:458` (`compile`), `:479` (`--eligian-map`); `smoke/smoke-command.ts:16` (`SMOKE_FORMATS`) | Phase 1 gate steps 3–4 (FR-051) | commander commands |
| `package-bin.spec.ts` | `packages/cli/src/__tests__/package-bin.spec.ts:30-33, 116-165, 168-180, 182-205` | the initialize test un-skips; pack list and lazy-import assertions extended | test |
| CLI build | `packages/cli/esbuild.mjs:32-37` (`WORKSPACE_SOURCES`), `:79` (`rmSync`), `:90-93` (`define`), `:95` (`external`) | `@eligian/language/mcp` source entry; generator call | script |
| Language build | `packages/language/esbuild.mjs:33, 49, 67` | fourth entry | script |
| Workflows | `.github/workflows/ci.yml` (`ubuntu-latest`, `:28`; PRs to `main` only, `:3-14`), `publish-cli.yml:86-92` | inspector gate; docs read | YAML |

## New components

| Module | Package | File path | Public API sketch (names are a sketch; the plan fixes them) |
| --- | --- | --- | --- |
| `mcp` command | `eligian` CLI | `packages/cli/src/main.ts` | `program.command('mcp').action(() => import('./mcp/server.js').then(m => m.runServer()))` |
| Server | CLI | `packages/cli/src/mcp/server.ts` | `runServer(options?: { docsRoot?: URL; cwd?: string }): Promise<void>`; `INSTRUCTIONS_PHASE_1: string`; `serverLayer(options)` for in-process tests |
| Node stdio | CLI | `packages/cli/src/mcp/stdio.ts` | `layerNodeStdio: Layer<Stdio>`; `redirectConsoleToStderr(): { write: (s) => void }` |
| Compiler lock | CLI | `packages/cli/src/mcp/compiler-lock.ts` | `CompilerLock` (`Context.Service`) with `run: <A, E, R>(eff: Effect<A, E, R>) => Effect<A, E, R>` (uninterruptible inside the permit); `makeCompilerLock(hooks?: { onQueued, onAcquire, onRelease, latch? })`; `CompilerLockLive: Layer<CompilerLock>` (no hooks) |
| Diagnostics | CLI | `packages/cli/src/mcp/diagnostics.ts` | `interface McpDiagnostic {…}`; `toMcpDiagnostic(d: CheckDiagnostic, source: string): McpDiagnostic`; `sourceOf(code: string)`; `withOverlays(diagnostics, overlays)` (inlines `fix` once per code) |
| Test client | CLI (test) | `packages/cli/src/__tests__/mcp-test-client.ts` | in-memory `McpClient.Transport` over `serverLayer` + `Stdio.make`; a raw NDJSON spawn helper for SC-001 / SC-002 / SC-021 roots |
| Tool errors | CLI | `packages/cli/src/mcp/errors.ts` (or in `diagnostics.ts`) | tagged `ToolNotFound \| ToolIoError \| ToolTimeout \| ToolCancelled \| ToolInternal` (`_tag`) → `{ error: { kind, message, path? } }` |
| Tools | CLI | `packages/cli/src/mcp/tools/{docs,operations,check,fmt,init}.ts` | one `Tool.make('eligian_<name>', …)` plus its handler, per file |
| Knowledge search | CLI | `packages/cli/src/mcp/knowledge/search.ts` | `searchIndex(index: readonly IndexEntry[], query: string, limit = 8): SearchHit[]` |
| Curriculum | CLI (data) | `packages/cli/src/mcp/knowledge/curriculum/{*.md, diagnostics/*.md}` | markdown + frontmatter |
| Generator | CLI (script) | `packages/cli/scripts/generate-knowledge.ts` | `generateKnowledge({ outDir }): Promise<void>`; package script `generate:knowledge` |
| `fmtFiles` | CLI | `packages/cli/src/fmt.ts` | `fmtFiles(files: readonly string[], options: { write: boolean }): Promise<FmtFileResult[]>`; `FmtFileResult = { file, formatted, lineDiff?, error? }` |
| Review pass | CLI | `packages/cli/src/check/review.ts` | `REVIEW_CODES: readonly ['controller-imbalance','class-never-removed']`; `reviewConfig(config, map, file): CheckDiagnostic[]`; `withReview(results)` |
| Controller balance | `@eligian/language` | `packages/language/src/compiler/controller-balance.ts` | `controllerBalance(config: IEngineConfiguration): { timeline: string; added: string[]; removed: string[] }[]` |
| Quick-fix text | `@eligian/language` | `packages/language/src/lsp/select-element-fix.ts` | `selectElementFixText(document, diagnostic): { range; newText } \| undefined` |
| `CheckDiagnostic.data` | `@eligian/language` | `check.ts` | `data?: { suggestions?: readonly string[]; quickFix?: QuickFix }`; `QuickFix = { line, column, endLine, endColumn, newText }` (1-based) |
| MCP entry | `@eligian/language` | `packages/language/src/mcp.ts` + `exports["./mcp"]` + an `esbuild.mjs` entry + CLI `WORKSPACE_SOURCES` | re-exports per FR-044 |
| Tests | CLI / language | `packages/cli/src/__tests__/{mcp-server,mcp-stdout,mcp-concurrency,mcp-knowledge,mcp-check,mcp-fmt,mcp-init,dataflow-tables,review}.spec.ts`, `__fixtures__/mcp/**` (including the `noise` / `crash` preloads of SC-002), `__snapshots__/`; language `controller-balance.spec.ts`, `mcp-entry.spec.ts` | test only |
| Eval harness | repo (tsx, outside Biome/tsconfig) | `evals/mcp/run.ts`, `evals/mcp/gate.ts`, `evals/mcp/cases/{fix-dataflow,fix-selectors}.json` + fixtures, `evals/mcp/results/` | `tsx evals/mcp/run.ts --case <id> --arm A1 [--model <m>]`. No root `package.json` script: `evals:mcp` is in Phase 3's Touches |

## Differences between the roadmap and the code (found while verifying)

1. **`withLint` is in `check-command.ts:138`, not in `lint.ts`**, and it is not exported: `ts_module_exports lint.ts` lists only `lintFile`. See FR-029.
2. **`toGlobPath` is a non-exported local** (`check-command.ts:96`). The reusable entry is `expandPatterns` (`:68`). See FR-007.
3. **`SELF_RESOLVED` is not exported** (`runtime-values.ts:100`; `ts_navigate_to` finds only a local declaration). The roadmap's `@eligian/language/mcp` list omits it; FR-036 and FR-044 add it.
4. **These are not root-exported**: `hostControllers`, `hostFunctions`, `getOrCreateServices` and `releaseWorkspaceDocuments`. `compiler/index.ts:155-161` exports only `controllerMetadata`, `HostModule`, `hostModuleOf`, `hostOperations` and `isKnownController`.
5. **The language package has its own `esbuild.mjs`**, with three entries (`:33`, `:49`, `:67`). A new export entry needs a fourth one there, not only `package.json` `exports` and `WORKSPACE_SOURCES`.
6. **`runInit` returns only `{ output, exitCode }`** (`init.ts:22-25`), and `init.ts` is not in the Phase 1 touches. The tool therefore derives the written files from `starterFiles` (FR-025).
7. **Decision 4 conflicts with `check:examples`.** Resolved by FR-054.
   - Measured 2026-11-04: `node packages/cli/bin/cli.js check "examples/**/*.eligian" "!examples/libraries/errors/**" "!examples/libraries/nested/cycle-*.eligian" --selector-not-in-layout ids --format json` reports diagnostics in exactly one file: `examples/demo.eligian` (13).
   - The root `check:examples` script (`package.json:25`) and the "Try the package" step (`publish-cli.yml:86-92`, the check line at `:91`) run with `--max-warnings 0` and include `demo.eligian`.
   - Decision: both lines exclude `"!examples/demo.eligian"`, and a separate non-strict line (`--selector-not-in-layout off`, no `--max-warnings`) keeps compiling the demo in CI.
8. **The 1,500-word hard limit conflicts with `operations-index`.** §3.1 sets the hard limit per chunk, but §3.2 sizes `operations-index` at "~3k tokens", about 2,200 words for 79 operations. Resolved by FR-035: generated chunks are exempt from the 1,500-word limit and bounded at 6,000 words each (tested, FR-041).
9. **Overlay test conflict.** §3.2 says "Missing overlay = a failing Vitest assertion", while §7 asks for "overlays for the 30 most frequent codes (the rest listed by the spec as missing)". Read literally, Phase 1 would ship a red test. FR-042 makes it a shrink-only allowlist instead.
10. **Controller status lines come "from the overlay" (§3.2), but the 9 controller overlays are Phase 2.** FR-037 carries only the two statuses that the roadmap states as facts: Routing is do-not-use, Lottie is constrained.
11. **Decision 10 assumes a warning that does not exist.** Resolved by FR-039 and FR-056. `not-eligian.md` "waits on" the decision-10 spec for its `custom` line, yet ships in Phase 1. Decision 10 says: "until it lands the compiler keeps the raf stand-in with a warning".
    - There is no such warning. `timeline-validator.ts:62` accepts `'custom'` among the valid providers with no diagnostic. `config-builder.ts:540-550` (`mapProviderToTimelineType`) compiles it through its `default` branch as an `animation` timeline. No non-test site in `packages/language/src` warns on `'custom'` (grep, 2026-11-04).
    - Decision: Phase 1 adds no warning. FR-039 teaches the verified current behaviour, guarded by a probe, and the roadmap's wording of decision 10 is corrected.
12. **Service recycling after N = 100 calls was in no phase's build list.** Resolved by FR-053. §2 "Memory and staleness" says the server recycles its Langium services after N = 100 compiler calls, and the heap grows ~0.35 MB per `runCheck` (§2). Decision: no recycling in Phase 1; it goes to Phase 3's soak test and Touches, and Phase 1 records the measured heap growth per check.
13. **No Linux host on this machine for the Claude Code handshake.** Resolved by SC-016.
    - `ci.yml` runs only on `ubuntu-latest`, and only for PRs to `main` (`:3-14`, `:28`).
    - Phase 0's compliance records that WSL Ubuntu on this machine has Node 18, below `engines.node >=22.12.0`, so it is not a valid host.
    - Decision: the Linux half of the exit is the server-side evidence of the PR's `ubuntu-latest` CI run plus one manual `claude mcp list` on a Linux host with Node 22+ when available; the roadmap's exit criterion is reworded (FR-056).
14. **`@modelcontextprotocol/sdk` 1.32.1 is in the lockfile** (`pnpm-lock.yaml:814`) as a transitive dependency of a dev tool. It is not the v2 `@modelcontextprotocol/server` that the fallback names, and the CLI MUST NOT import it.
15. **`--version` cold start is 338–401 ms** after Phase 0 (`phase-0-foundation/compliance.md`), not the roadmap's 1.9–2.1 s. The 3 s initialize budget has room for `effect/ai`.
16. **"Read only under the project root" meets imports that may leave it.** Resolved by FR-007 and FR-058.
    - §2 says: "Tools read only under the resolved project root (the directory of the entry file or the root)". FR-007 defines the project root as the first announced root, or else the server cwd, and refuses tool input paths outside it.
    - The language deliberately allows `../` imports (`shared-utils/src/path-resolver.ts:17-19`: `"../shared/styles.css"` and `"../../templates/header.html"` are LEGAL), so a program inside the root can make the compiler read a CSS, HTML, locales or library file outside it.
    - Decision: the restriction covers tool input paths only; imports follow the language's rules; the README security note says so; MCP and CLI diagnostics stay identical.
17. **No plain-text header line on the wire.** §4 says "Every response starts with" the header line. `effect/ai`'s `McpServer` emits the handler's encoded result as one `JSON.stringify` text item, plus `structuredContent` on success (`McpServer.js:1476-1479`, `:1569-1572`). FR-005 therefore makes `header` the first key of every payload, so the text still begins with it. If the Day-1 spike (FR-002a) falls back to the official SDK, the same payload shape is kept.
18. **`effect/ai`'s `McpClient` is not an in-process client.** It has no in-memory transport. `McpClient.stdio` needs a `ChildProcessSpawner` with no Node implementation in the workspace. It negotiates only `2025-11-25` and `2026-07-28` (`McpClient.d.ts:35`), and it declines every server request except ping (`McpClient.js:684`). SC-003 therefore uses a hand-written in-memory `Transport`, FR-002 requires `v2025_11_25`, and the roots case of SC-021 uses a raw JSON-RPC client.
19. **`LINT_RULES_CHECKED_BY_ELIGIAN` is the excluded set.** It is `['W111']` (`eligius-lint.ts:23`), the rules filtered out at `:47`, so it cannot list the rules emitted as `eligius-<rule>`. `eligius/lint` exports no rule list either. FR-036 curates the list from the rule literals of the installed `lint.mjs`, guarded by the drift spec.

## Review notes

No review issue was rejected. Where an issue offered alternatives, this revision chose:
- **FR-015 overlay inline** (§3.4 vs §4): `McpDiagnostic` gains `fix`, the overlay's cause + fix text, inlined once per code per response. The id-only option would leave most diagnostics without their fix.
- **FR-027** (`eligian_init` post-write check): removed, and the init bullet of FR-010 with it. SC-012 keeps the clean-check as a test-side assertion.
- **`not-eligian` `custom` line** (decision 10): teaching the verified current behaviour; the warning is not added in Phase 1 (clarification session, FR-039, FR-056).
- **Test transport**: a hand-written in-memory `McpClient.Transport` over `serverLayer` + `Stdio.make`. `McpClient.stdio` was not usable, because the workspace has no Node `ChildProcessSpawner`.
- **SC-011, 7 ids**: refused by schema (`maxItems: 6`), not truncated.
- **`quickFix` contract**: a 1-based `{ line, column, endLine, endColumn, newText }` edit (FR-011), for both `selectElement` and `controller-imbalance`, so that tests apply it mechanically.
- **Self-correction rounds**: counted as §6.1 step 6 defines them (check invocations after the first, by tool or CLI), not as `ok:false` results. The roadmap's definition wins over the review's example.
- **Eval sample policy**: §6.4's 1 run per case, with every run committed and no re-run on an unchanged tree, rather than N runs with a pass threshold, which the roadmap reserves for full runs at phase exits.

## Clarifications

### Session 2026-11-04

- Q1: What does `eligian_docs()` with no arguments return, and what size is asserted? Decision: all chunks are in `index.json`; the no-argument call returns full cards for non-operation entries and only `id` + `title` for `kind: operation` entries (cards via `ids` or `eligian_operations`); a test asserts the response is at most 12,000 chars. [FR-019, SC-011]
- Q2: What are the semantics of `class-never-removed`? Decision: follow `requestAction` / `startAction` with operationData substitution like the FR-028 walker; a removal counts in the same action's end block, any later range of the timeline, or on leave; `on enter` adds pair with `on leave`; a non-literal selector suppresses the finding for that class on that timeline; the tour stays unchanged and green. [FR-030, SC-007, SC-023]
- Q3: How is `examples/demo.eligian` handled under the 1.1.0 defaults? Decision: add `"!examples/demo.eligian"` to `check:examples` and to the `publish-cli.yml` "Try the package" line, plus a separate non-strict line (`--selector-not-in-layout off`, no `--max-warnings`) so the demo still compiles in CI. [FR-054, FR-049, SC-015, SC-023, SC-025]
- Q4: Does Phase 1 build service recycling after N = 100 calls? Decision: no; deferred to Phase 3's soak test and added to Phase 3's Touches in the roadmap; Phase 1 records the measured heap growth per check in `compliance.md`. [FR-053, FR-056, SC-026, SC-027]
- Q5: Do imports outside the project root fall under the path policy? Decision: the restriction covers tool input paths only; imports follow the language's rules (`../` allowed); the README security note says so; MCP and CLI diagnostics stay identical. [FR-007, FR-058, FR-047, SC-021]
- Q6: Does Phase 1 add a warning for the `custom` provider? Decision: no; `not-eligian` teaches the verified behaviour (accepted silently, compiled as `animation`), guarded by the SC-013 probe; the warning stays with the separate `custom` spec; decision 10's wording in roadmap §8 is corrected in this phase. [FR-039, FR-056, SC-013, SC-027]
- Q7: Which 30 codes get overlays? Decision: first the codes that the case 13 and 14 start states produce (FR-052), then filled up to 30 from a committed, reproducible ranking script that runs `checkFiles` + lint + review over the CLI and language fixture corpus and the examples, ranked by count. [FR-040, FR-055, SC-013]
- Q8: What bounds a generated chunk? Decision: generated chunks are exempt from the 1,500-word curriculum limit but each is at most 6,000 words (tested); `generated/diagnostics.md` lists every code on one line (code · source · overlay id), including `compile-failed` and the `eligius-<rule>` codes; overlay text lives only in the per-code overlays, which `eligian_check` inlines. [FR-035, FR-036, FR-041, SC-013]
- OQ-effect: Effect or the official SDK? Decision: decision 1 stands, `effect/ai` `McpServer`; the Day-1 spike is the go/no-go and the official `@modelcontextprotocol/server` SDK is the designed-in fallback if the spike fails on `_meta`, annotations or protocol negotiation. [FR-002a, SC-024]
- OQ-protocols: Which protocol versions? Decision: `[McpProtocol.v2025_11_25, McpProtocol.v2025_06_18]` (stateful stdio); `v2026_07_28` is not listed. [FR-002, SC-029]
- OQ-windows-npx: Does `npx` need `cmd /c` on native Windows? Decision: the Phase 1 Windows handshake test settles it, and the README records the working form for each client. [FR-047, SC-016]
- T006 (build stage, 2026-11-04): the inspector devDependency has a postinstall that pnpm refuses to ignore silently. Decision: add `'@modelcontextprotocol/inspector': false` to `allowBuilds` in `pnpm-workspace.yaml` (the script is a no-op as a dependency); not `true`, not `pnpm dlx`. [FR-049]
- T024 (build stage, 2026-11-05): `class-never-removed` flagged `warning-only.eligian:14` because the walker follows `startAction` only and the review's action map holds `startOperations` only, so an endable action's `removeClass` in its end block is never seen. Decision: a review-rule defect, fixed under T024 (not sent back to T023): `walkOperations` in `controller-balance.ts` follows `endAction` into `endOperations`, `review.ts` builds its action map from both lists, `review.spec.ts` gains an endable-action case. The fixture and the test stay as written. [FR-030, SC-008]
- T040 (build stage, 2026-11-05): every `eligian init` starter failed SC-012's review check with `controller-imbalance` (interactions and `addController` in `on enter`, nothing removed in `on leave`). Decision: (a) fix the starters, in the main loop, with the removals the rule's quick fix proposes; the rule is right (the tour does the same) and SC-012 is not relaxed. While reproducing, the video starter's warning had no `quickFix` and named the source path: `review.ts` matched timelines by `uri`; now by index. [SC-012, FR-030]
- T043 (build stage, 2026-11-05): plan C3 assumed a schema refusal is always JSON-RPC -32602; in `effect@4.0.7` that holds for 2025-06-18 only, 2025-11-25 returns a plain-text `isError` result without the header. Decision: (C) test both protocols, and record the schema refusal as the one library-owned exception to FR-005 / FR-006. Not (D): no production code wraps the library's refusal. The test client may gain a `protocolVersion` option (`mcp-test-client.ts`, a test file) so a session can initialize at 2025-06-18. [SC-011, FR-005, FR-006]
- T061 (build stage, 2026-11-05): under `pnpm test`, `mcp-knowledge.spec.ts` › `the ranking selection equals the script output` recomputed the ranking while two older CLI specs held transient `.eligian` files inside the corpus glob (`file-unreadable` pushed `event-end-not-after-start` out of slot 30). Decision: (a) exclude those two directories from `CORPUS` in `rank-diagnostic-codes.ts` (done in the main loop; the committed ranking is byte-identical after re-running the script), not (b) moving the older specs to temp dirs. [FR-055, SC-013]
- Compliance closure (main loop, 2026-11-05): the build stage ended with 89 pass, 6 partial / fail. Rulings: FR-022 → host functions added to the `names` lookup (code); FR-052 → the review pass is gated behind errors by design, the row is read per layer; SC-002 → plan C10 substitutes the Effect-logger test; SC-001 / SC-016 → the Linux halves are pending the PR's CI, as Phase 0 SC-009; SC-017 → the fix-dataflow failure was a **compiler gap** (a bare `clearOperationData()` erased the action's parameters at runtime; the check could not see it), fixed in `erased-parameters.ts` (the clear becomes a `setOperationData` with `override` that keeps the parameters the block still uses), and the fix-selectors failure was one wasted round (a Windows heredoc `cat > main.eligian` that changed nothing, then a re-check) on top of the two inherent rounds. Both cases re-run on the changed tree; the results are recorded in `compliance.md`. [FR-022, FR-052, SC-001, SC-002, SC-016, SC-017]
- OQ-linux-handshake: How is the Linux half of the handshake exit met? Decision: server-side evidence from the PR's `ubuntu-latest` CI run (inspector `tools/list` + `initialize` test on the packed tarball) plus one manual `claude mcp list` on a Linux host with Node 22+ when available; local WSL (Node 18) is not used. [SC-016, FR-056, FR-048, FR-049]
