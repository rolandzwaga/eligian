# Implementation Plan: MCP server, Phase 4: Editor registration, dev feedback, polish

**Branch**: `feat/mcp-server-roadmap` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/058-mcp-server/phase-4-editor-dev-polish/spec.md` (reviewed; clarifications Q1–Q7 encoded), roadmap §2–§8 (Phase 4 in §7, decision 2 in §8).

Every signature below was read this session on the tree at `aa9fa55`, with typegraph (`ts_module_exports` on `smoke/smoke-runner.ts` and `compiler/eligian-map.ts`; `ts_references` on `BundleResult`) or from the file at the cited line (`grep -n`; the typegraph index gives stale line numbers for `smoke-runner.ts`, e.g. `inFile` at 446 vs the file's 422). Facts about installed libraries come from `node_modules/.pnpm/effect@4.0.7/node_modules/effect/dist/ai/{McpServer.js,McpServer.d.ts,internal/mcpRuntime.js,internal/mcpCore.js}`, `@types/vscode@1.140.0/index.d.ts`, `eligius@4.2.0/dist/locale-manager-CJy3musb.d.mts` and `jsonc-parser@3.3.1/lib/umd/main.js` (lines cited). Vendor facts come from the VS Code and Cursor sources and docs (URLs and quotes in P1–P3). Probes ran in the session scratchpad and are not committed; their results are quoted where used.

## Summary

Phase 4 adds no tool and no DSL. Reuse-first, one line each:

- **Extension registration** is one new module, `packages/extension/src/extension/mcp/server-definition-provider.ts`, over the `@types/vscode` 1.140 provider API (`McpStdioServerDefinition`, `lm.registerMcpServerDefinitionProvider`), the existing `debounce` helper (`debounce-util.ts`), and a Cursor branch over `vscode.cursor.mcp` (shape from Cursor's docs, P2). Pure helpers (version gate, user-server detection, package-manager walk, install command, JSONC) are a second file, `mcp/install-state.ts`, tested without `vscode`.
- **`dev` runtime feedback** reuses `locateEngineError` (`eligian-map.ts:177`), smoke's `errorMessage` / `alsoAt` / `inFile` / `selectorLocation` (moved unchanged into `smoke/engine-error-format.ts`), the map and config the bundled compile already produced (`CompileResult.map`, `compile-file.ts:62`; returned through `BundleResult`), and one generated hook in the bundle's `init`. New: one POST route, one report parser, one serialized file writer.
- **Resources and the prompt** are `McpServer.resource` (static form) and `McpServer.prompt` from `effect/ai` 4.0.7, merged beside the toolkit in `makeServerLayer` (`server.ts:65`). Bodies come from the existing `loadKnowledge` cache (`knowledge/load.ts:96`); only `index.json` is read at startup (a new `loadIndex` beside it), and it is read by `makeServerLayer` *before* any layer is built, so every registration layer is synchronous like the toolkit (P18).
- **Docs**: the extension and CLI READMEs, root `CHANGELOG.md`, root and extension `AGENTS.md`, `verification-ladder.md`.

New dependencies: `semver` 7.8.5 (already in the lockfile) and `@types/semver` 7.8.0, both in the extension only (P10). No CLI dependency change. No grammar change; nothing in `packages/language` changes.

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo). CLI ESM bundle `dist/cli.mjs` (`packages/cli/esbuild.mjs`). Extension CJS bundles `out/extension/main.cjs` etc. (`packages/extension/esbuild.mjs:44-67`: `bundle: true`, `platform: 'node'`, `external: ['vscode']`; `vsce.dependencies: false`, so every runtime dependency is inlined) |
| Runtime deps | CLI unchanged. Extension: `+ semver@7.8.5` (`dependencies`, bundled), `+ @types/semver@7.8.0` (`devDependencies`) |
| Testing | Vitest 5.0.5. CLI projects `cli`, `cli-timed`, `cli-bin`, `cli-soak` (`packages/cli/vitest.config.ts`). Extension: one project, `environment: 'jsdom'`, `vscode` aliased to `__mocks__/vscode.ts` (`packages/extension/vitest.config.ts`); specs that need more `vscode` mock it per file (`activate-client-failure.spec.ts:26`) |
| Platforms | Windows 11 (local, Node 24.7), `ubuntu-latest` (CI, one job, `ci.yml`) |
| Measured | `compile --bundle`: tour 1,009,485-char `bundle.js` (1,174 ms), demo 479,661 bytes; two tour bundles normalised for UUIDs differ only at line 11956, the esbuild entry comment `// C:/…/eligian-bundle-QP7R4Y/entry-1793923736153.js` (P6). `JSON.stringify(index)` 40,413 chars, 140 entries (spec record) |
| Constraints | MCP stdout = protocol frames only (`stdio.ts` redirect unchanged); compiler lock unchanged (resources never take it); Effect diagnostics 0/0/0; CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`packages/cli/vitest.config.ts:58-63`; `src/dev/client-runtime.ts` is excluded from coverage, `:55`); language thresholds untouched (no language change); extension has no coverage gate |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. One extension module plus one pure-helper module; one dev module (`runtime-reports.ts`); one moved formatting module; resources/prompt are two `effect/ai` layer constructors. JSONC is a 30-line stripper instead of a dependency that does not bundle (P10). |
| II / V / XX / XXV Testing, TDD | Pass. Every FR/SC has a named spec (Test plan), written first; `specs/TESTING_GUIDE.md` read before the first test. No language-package test (no language change). |
| III / XVII Effect | Pass. Effect code touched: `server.ts` (the index pre-read and the resource and prompt layers), new `mcp/resources.ts` and `mcp/prompts.ts`, `knowledge/load.ts` (`loadIndex`), `bundler/index.ts` (two fields in the result literal). Failures are the existing tagged `ToolInternal`. `resources.ts` and `prompts.ts` call `ai.McpServer.resource` / `ai.McpServer.prompt`, both `@stability unstable` in `McpServer.d.ts`, which @effect/tsgo's `unstableApiUsage` rule reports as a warning (`--strict` fails on it); like every existing `effect/ai` module (`server.ts:13`, `paths.ts:12`, `stdio.ts:9`, `tools/docs.ts:14` and the other seven tool modules, grep this session) they begin with `// @effect-diagnostics unstableApiUsage:off` (C2, C3). The dev server and the extension stay plain async, as they are today. `pnpm effect:check:cli` is a gate of G2 and G4 and of the last group. |
| IV Clear errors | Pass. Every dev report prints one line in a fixed format (FR-017/FR-040); the install prompt names the version found. |
| VI / VII Immutability | Pass. `addReport` returns a new `DevErrorsFile`; the server keeps one current value and replaces it inside the write queue. |
| VIII pnpm | Pass for this repo. The **Install** button runs the *user project's* package manager (FR-035; spec I-4). |
| IX Langium | Pass. No grammar change. |
| XII No premature docs | Pass. Only the spec's FR-027–FR-030 list. |
| XIV Windows paths | Pass. `path.join` / `path.resolve` / `path.relative`; `Uri.joinPath(...).fsPath`; spawn-free extension (a terminal runs the install); rename retry on `EPERM`/`EBUSY` (R5). |
| XV / XVI Research context | Pass. `eligius` only through the installed package; vendor sources read, never imported. |
| XXII Sed safety | Pass. Edits by string match. |

No violations; the Complexity tracking table is empty.

## Corrections to the spec found while planning

Each was checked this session; `compliance.md` records each as a correction or an addition.

- **P1. The MCP activation event exists, and VS Code generates it.** (Settles the spec's [UNVERIFIED] activation row.)
  - `src/vs/workbench/contrib/mcp/common/mcpConfiguration.ts` (https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpConfiguration.ts): `const mcpActivationEventPrefix = 'onMcpCollection:';` … `export const mcpActivationEvent = (contributedCollectionId: string) => mcpActivationEventPrefix + contributedCollectionId;` and, in the `mcpServerDefinitionProviders` contribution point, `activationEventsGenerator: function* (contribs) { for (const contrib of contribs) { if (contrib.id) { yield mcpActivationEvent(contrib.id); } } }`.
  - `src/vs/workbench/contrib/mcp/common/discovery/extensionMcpDiscovery.ts`: `private async _activateExtensionServers(collectionId: string) { await this._extensionService.activateByEvent(mcpActivationEvent(collectionId)); … }`, called from the collection's `lazy.load`.
  - So contributing `mcpServerDefinitionProviders: [{ id: 'eligian.mcp' }]` already activates the extension when the chat needs the collection. FR-005 still adds the two `workspaceContains` events (so the install prompt can run without a chat request), and lists `onMcpCollection:eligian.mcp` explicitly as well: harmless, documents the trigger, and matches the manifest's explicit `onLanguage:eligian` (`package.json:272-274`). SC-018 asserts all four.
- **P2. Cursor's API shape, from Cursor's documentation.** (Settles the [UNVERIFIED] Cursor row; FR-011, SC-007.)
  - URL: https://cursor.com/docs/context/mcp-extension-api (fetched 2026-11-06). Verbatim excerpts (the page's own TypeScript reference): `export interface StdioServerConfig {`, `export type ExtMCPServerConfig = StdioServerConfig | RemoteServerConfig;`, `export const registerServer: (config: ExtMCPServerConfig) => void;`, `export const unregisterServer: (serverName: string) => void;`. The stdio config is `{ name, server: { command: string, args: string[], env: Record<string, string> } }`; the page's example: `name: "my-local-server",` `command: "python",` `args: ["-m", "my_mcp_server"],` (with an `env` of two variables).
  - Consequences: `unregisterServer` exists (FR-011's "if the plan's check confirms it" holds); `env` is passed as `{}` always; **there is no `cwd`** in Cursor's stdio config. The server then starts in Cursor's working directory, and its path policy (§2) relies on the client's MCP roots or absolute paths. Recorded as R8; the Cursor manual check in `compliance.md` notes the cwd the server reports (the response header path of an `eligian_project` call with a relative path).
  - SC-007's fake is `{ registerServer: vi.fn((config: { name: string; server: { command: string; args: string[]; env: Record<string, string> } }) => {}), unregisterServer: vi.fn((serverName: string) => {}) }`, the documented shape, nothing more.
- **P3. A non-recursive watcher on a base that does not exist yet is suspended and resumed by VS Code, but that does not guarantee a `package.json` event.** (Settles the [UNVERIFIED] non-existent-base row.)
  - `src/vs/platform/files/node/watcher/nodejs/nodejsWatcherLib.ts`: a missing path at start (`ENOENT` from `stat`) goes to `notifyWatchFailed()` (`this.didFail = true; this.onDidWatchFail?.();`).
  - `src/vs/platform/files/node/watcher/baseWatcher.ts`: a failed request is suspended and monitored, reusing a recursive watcher when one covers the path (`this.recursiveWatcher?.subscribe(request.path, …)`) or else polling (`watchFile(request.path, { persistent: false, interval: this.suspendedWatchRequestPollingInterval }, …)`, `suspendedWatchRequestPollingInterval: number = 5007; // node.js default`), then "// Watch path created: resume watching request".
  - The resume follows the creation of the **base** (`node_modules/eligian`) by up to ~5 s; npm/pnpm usually write `package.json` within that window, so the resumed watcher may never see `package.json` change. Therefore FR-003 adds the spec's fallback ancestor watchers, all non-recursive: base `<folder>` pattern `node_modules`; base `<folder>/node_modules` pattern `eligian`; base `<folder>` pattern `.vscode`. And a watcher-triggered refresh schedules **one** follow-up check 3,000 ms later that fires the change event only when the computed definitions differ from the last ones provided (an install still writing `bin/cli.js` at the first check: no watcher covers `bin/`, so without the follow-up a `cli.js` written after the `package.json` event would never produce a definition). The follow-up is an addition beyond FR-003's listed fallback (the ancestor watchers); `compliance.md` records it as an addition. SC-016 (a) lists the five patterns; SC-016 (b) still sees exactly one event (the definitions do not change between the two checks in a static fake folder); SC-016 (f) (added here) checks its positive case: `bin/cli.js` written after the first check and before `FOLLOW_UP_MS` gives exactly one more event and one definition. The real-editor check stays SC-001's install-after-open step.
- **P4. SC-010's "remove the exact `DEV_HOOK_SNIPPET` from `bundle.js`" works only because the snippet is written in esbuild's printed form.** esbuild reprints the generated entry (`runtime-bundler.ts:276-345`, `minify` default `false`, `types.ts:62`). Probe (esbuild from `packages/cli`, `format: 'esm'`, `target: 'ES2020'`, the generated `init` with the hook lines): output identical to the input lines, `verbatim: true`. The tour bundle prints the current `init` verbatim too (`bundle.js:29356-29362`). The snippet uses distinctive local names (`eligianDevHooks`, `eligianDevHook`) so esbuild's renamer has no top-level name to collide with. Under `--minify` the snippet is not verbatim; SC-010 applies to the default (unminified) bundle, the form `dev` and the examples use.
- **P5. SC-010's baselines go to the phase's `baseline/` directory, captured and diffed by a script, not to `__fixtures__/bundle-before/`.** The two example bundles are 1.0 MB and 0.48 MB and embed the eligius runtime from `node_modules`, so a perpetual fixture would fail on every eligius bump (dependabot) and add 1.5 MB to the repo. Same pattern as Phase 3's `capture-smoke-baseline.ts` (`--write` in G0, `--diff` at the gate, output quoted in `compliance.md`). The perpetual part of SC-010 (snippet once, hook called before `engine.init` resolves, no hook without the global) is a vitest spec (Test plan).
- **P6. Bundle normalisation needs one more rule than UUIDs.** Measured: two `compile --bundle` runs of the tour, UUID-normalised, differ only in esbuild's entry comment (`// <tmp>/eligian-bundle-<rand>/entry-<ms>.js`, from `runtime-bundler.ts:286`). The normaliser replaces that line by `// <entry>` (regex `/^\/\/ .*eligian-bundle-[^\\/]+[\\/]entry-\d+\.js$/m`) and UUIDs by `<uuid>` (the spec's regex). The capture script runs from the repo root, so the remaining module-path comments are stable.
- **P7. `loadKnowledge` reads every body at once, so "only `index.json` at startup" (FR-021) needs a separate index reader.** `read` (`load.ts:57-91`) parses `index.json`, then `overlays.json`, then every `.md` under the root. New `loadIndex(docsRoot)` in `load.ts` parses `index.json` only (same `toDirectory`, same `ToolInternal` failure); `makeServerLayer` runs it before building any layer (P18) to build the resource list; the first `resources/read` calls `loadKnowledge` (cached per directory, shared with `eligian_docs`). Because `loadKnowledge` also requires `overlays.json`, SC-011 (7)'s temp docs root holds `index.json` and `overlays.json` (`{}`), and no body file for the listed id. That case alone cannot tell lazy from eager: `read` does not fail when an index id has no body (`bodies` just lacks it), so an eager `loadKnowledge` at startup would also pass (7). SC-011 (8) (added here) closes that: a docs root with `index.json` and **no `overlays.json`**, where `loadIndex` succeeds and `loadKnowledge` fails (`parseJson('overlays.json')`, `load.ts:68`). A lazy server lists the id and fails only the read; an eager one would hit the `ToolInternal` at startup and list nothing (or not start).
- **P8. The JSON-RPC errors come from `effect/ai` as follows** (FR-022, FR-026, SC-011 (3)/(7), SC-012 (4)):
  - unknown resource URI: `ResourceNotFound` → `InvalidParams({ message: \`Resource '${error.uri}' not found\` })` (`McpServer.js:359-361`);
  - a failing resource `content` effect: `InternalError({ message: Cause.prettyErrors(cause)[0].message })` (`McpServer.js:1628-1633`), so the failure message must contain the id;
  - prompt parameters: `decode(params).pipe(Effect.mapError(error => new InvalidParams({ message: error.message })))` (`McpServer.js:1758`). `Schema.String` accepts `""`, so `idea` is `Schema.NonEmptyString` (`Schema.js:5838`: `String.check(isNonEmpty())`); a missing or empty `idea` is then invalid-params.
- **P9. Capability advertisement is conditional in `effect/ai`.** `initialize` adds `resources: { listChanged: true, subscribe }` only when `presence.resources` and `prompts: { listChanged: true }` only when `presence.prompts` (`internal/mcpRuntime.js:411-425`); presence = "at least one registration" (`internal/mcpCore.js:171-175`). So FR-024 holds when the docs exist; with no `index.json` (FR-023) the `resources` capability is absent (no resource registered) while `prompts` stays. SC-011 (5) asserts that. `resources/list` is not paginated (no `nextCursor` in `McpServer.js` / `internal/*.js`).
- **P10. JSONC and ranges in the extension: a stripper, and `semver`.**
  - The extension has no JSONC parser (`package.json:290-297`). `jsonc-parser@3.3.1` is in the store (via `@vscode/vsce`), but its `main` is UMD (`lib/umd/main.js`: `})(function (require, exports) { … const formatter = require("./impl/format");`), which esbuild cannot follow with `platform: 'node'` (default main fields put `main` first); importing it would break `out/extension/main.cjs` at runtime. So `install-state.ts` has `parseJsonc(text): unknown | undefined`: one string-aware pass that drops `//` and `/* */` comments and trailing commas before `}`/`]`, then `JSON.parse`; `undefined` on failure.
  - FR-036's ranges: `semver` (7.8.5 is in `pnpm-lock.yaml:2831`) with `@types/semver` 7.8.0 (registry, `pnpm view`). Probe on 7.8.5: `validRange` + `intersects(r, '>=1.1.0')` gives `^1.1.0` true, `^1.0.0` true, `>=1.1` true, `*` true, `1.x` true, `1.0.0 - 1.2.0` true, `^0.9.0 || ^1.2.0` true; `1.0.3` false, `~1.0.3` false, `<1.1.0` false; `latest`, `workspace:*`, `file:../x`, `abc` → `validRange` null. Rule: `latest` admits; any `workspace:`/`file:`/`link:` prefix does not; otherwise `validRange(r) !== null && intersects(r, '>=1.1.0')`.
  - FR-002 (c)'s installed-version gate is not `semver.gte` (`1.1.0-beta.1` must pass, and semver orders it below `1.1.0`): `meetsMinimum` parses `/^(\d+)\.(\d+)\./` and compares major and minor numerically.
- **P11. The engine-error report's `message` is the cause's message.** Eligius' `IEngineActionError` "message names the action, the phase and, when the original error carries it, the operation, followed by the original message" (`locale-manager-CJy3musb.d.mts`, the doc of `IEngineActionError`). Smoke prints `errorMessage(info, …)`, which uses `cause.message || error.message` (`smoke-runner.ts:395-405`). So the dev client sends `message: cause instanceof Error ? cause.message : String(cause ?? '') || error.message`, and the server calls the same `errorMessage` with no `cause`; SC-004's `message: 'boom'` and SC-017's smoke-format line follow.
- **P12. `.eligian/` is created on the first report, never by a reset.** SC-022 (1) says the directory appears "on the first error". So a reset (FR-018: reload-build, first success after a failure) rewrites `dev-errors.json` only when it exists; the first successful build of a session also resets an existing file (a stale file from an earlier `dev` run). A failed build writes the `build-error` entry (creating the directory, since that is an error).
- **P13. While a build is failing, `current` is cleared and every runtime report is dropped (`204`).** The file keeps the last minted `buildId` beside the `build-error` entry (FR-018's shape requires a `buildId`). The next successful build mints a new one (FR-033).
- **P14. The `buildId` rides on the client tag as a data attribute; the one-argument `withClient` is unchanged.** `dev-server.spec.ts:123-126` asserts `withClient('<html><body><p></p></body></html>')` byte-exactly. New signature `withClient(html: string, buildId?: string)`: with a `buildId` the tag is `<script src="/__eligian/client.js" data-build-id="<id>"></script>`. The client reads `document.currentScript?.dataset.buildId`, falling back to `document.querySelector('script[data-build-id]')` (under `window.eval` in SC-004 (2), `currentScript` is `null`).
- **P15. `activate-client-failure.spec.ts` mocks `vscode` without `lm`, `workspaceFolders` or `isTrusted`** (`:26-58`). That spec gains `vi.mock('../mcp/server-definition-provider.js', () => ({ registerEligianMcpServer: vi.fn(() => ({ dispose() {} })) }))` and asserts the call (FR-001: registration survives a failing language server). `registerEligianMcpServer` also guards `typeof vscode.lm?.registerMcpServerDefinitionProvider === 'function'` (forks and older hosts), registering nothing otherwise.
- **P16. "Workspace-level `mcp` configuration" is read with `inspect`, not `get`.** `workspace.getConfiguration('mcp').get('servers')` merges user settings; FR-034 excludes the user level. The provider reads `getConfiguration('mcp').inspect<Record<string, unknown>>('servers')`: `workspaceValue` (the `.code-workspace` `settings` or a single folder's `.vscode/settings.json`) and, per folder, `getConfiguration('mcp', folder).inspect('servers')?.workspaceFolderValue`. `globalValue` is never read. SC-020 (f)'s fake returns values per level and asserts `globalValue` is not consulted. That check is in addition to, not instead of, SC-020's user-profile file: the spec writes an Eligian `mcp.json` into a fake user dir (temp dir; `vi.stubEnv` of `APPDATA`, `HOME` and `USERPROFILE` to it) and asserts, through a pass-through `vi.mock('node:fs/promises')` that records every path read, that no read touches that dir (Test plan).
- **P17. A runtime report is answered after its write.** The `204` goes out when the report's queued read-merge-write has finished. The browser does not wait (beacon / `keepalive`), and tests read the file right after the response, with no polling helper.
- **P18. Registration layers must do no I/O, or `initialize` can miss the `resources` capability.** `Layer.provide` builds the dependency first: `provideWith` is `that.build(memoMap, scope)` then `self.build(...)` (`effect/dist/Layer.js:945`). `layerStdio` is `layerWithRuntime(options, "stdio")`, whose build runs `Effect.forkScoped(runWithRuntime(options, runtime, transport))` (`ai/McpServer.js:1045-1048`, `:1071`), so the request loop is already reading stdin when the layers above it are built. `initialize` reads `registrationPresence` when the request arrives (`ai/internal/mcpRuntime.js:404-425`), and presence is `resourceRegistrations.length > 0 || resourceTemplateRegistrations.length > 0` (`ai/internal/mcpCore.js:171-175`). A resource layer that first awaited `fs.readFile` (`Layer.unwrap(loadIndex(...))`) would register after an early `initialize`, which then carries no `resources` capability; the in-process harness sends `initialize` straight after `Effect.runFork(Layer.launch(...))` (`mcp-test-client.ts:148-150`). The toolkit has no such race today because its registration does no I/O. So `makeServerLayer` (already `async`, `server.ts:65`) awaits `loadIndex` **before** building any layer and passes the entries to a synchronous `docsResources(ai, entries)` (C2, C4). `mcp-resources.spec.ts` asserts that an `initialize` sent at once reports `capabilities.resources`.

## Sequencing

Groups; `[P]` = independent of the other groups in the same column.

- **G0, before any source edit** (baselines, committed under `baseline/`):
  (a) `tools/list` snapshot: a one-off `mcp-server.spec.ts` case with `toMatchFileSnapshot('__snapshots__/tools-list-phase3.json.snap')` run once on `aa9fa55` to write it (SC-013); in the same run, `expect(INSTRUCTIONS[3]).toMatchFileSnapshot('__snapshots__/instructions-phase3.txt.snap')` (SC-013's "`INSTRUCTIONS[MCP_PHASE]` unchanged": the existing `expect(INSTRUCTIONS[MCP_PHASE]).toBe(text)` with `text = INSTRUCTIONS[3]`, `mcp-instructions.spec.ts:149-153`, compares the value with itself);
  (b) `pnpm exec tsx packages/cli/scripts/capture-bundle-baseline.ts --write` → `baseline/bundle-before/` (SC-010, P5);
  (c) the log lines of the existing `dev-server.spec.ts` cases (a temporary `log` collector, lines written to `baseline/dev-log-before.txt`, normalised for `\d+ms`) (SC-017);
  (d) `pnpm -C packages/cli test:coverage:ci` summary → `baseline/coverage-cli-before.txt`; `check:examples` / `smoke:examples` / `fmt:examples` outputs.
- **G1** shared engine-error formatting (B1) + smoke switched to it (`smoke.spec.ts` unchanged and green).
- **G2** bundler (B2): `BundleResult.map/config`, `DEV_HOOK_SNIPPET`; `bundle-dev-hook.spec.ts`; the G0 (b) `--diff`.
- **G3** dev (B3–B5): `runtime-reports.ts`, the route, build identity, the writer, the client script; `dev-server.spec.ts`, `dev-client.spec.ts`.
- **G4 [P]** MCP resources and prompt (C1–C3); `mcp-resources.spec.ts`, `mcp-prompts.spec.ts`, `mcp-server.spec.ts` / `mcp-stdout.spec.ts` extensions.
- **G5 [P]** extension (A1–A4); `mcp-install-state.spec.ts`, `mcp-provider.spec.ts`, `build-output.spec.ts`, `activate-client-failure.spec.ts`.
- **G6** docs (D), CI inspector steps.
- **G7** full gates, `.vsix`, manual SC-001/002/003/004(3)/007 checks, `compliance.md`.

G4 and G5 can run in parallel with G1–G3 (no shared file). G3 depends on G1 and G2.

## Module design

### A. Extension (`packages/extension`)

#### A1. Manifest (FR-001, FR-005–FR-007, FR-012) — `package.json`

- `activationEvents`: `["onLanguage:eligian", "onMcpCollection:eligian.mcp", "workspaceContains:node_modules/eligian/package.json", "workspaceContains:**/*.eligian"]` (P1).
- `contributes.mcpServerDefinitionProviders`: `[{ "id": "eligian.mcp", "label": "Eligian" }]`.
- `contributes.configuration.properties` gains:
  - `"eligian.mcp.enabled": { "type": "boolean", "default": true, "scope": "resource", "markdownDescription": "Register the Eligian MCP server (the \`eligian_*\` tools) for Copilot agent mode when this folder has \`eligian\` 1.1 or later installed. Turn off to use your own \`.vscode/mcp.json\` or no server." }`
  - `"eligian.mcp.command": { "type": "string", "default": "node", "scope": "machine-overridable", "markdownDescription": "The program that runs \`<folder>/node_modules/eligian/bin/cli.js mcp\`, for example an absolute path to node.exe when \`node\` is not on the editor's PATH. Empty means \`node\`." }`
- `capabilities.untrustedWorkspaces`: `description` += " The Eligian MCP server for Copilot agent mode is not registered (it runs the workspace's own node_modules/eligian)."; `"restrictedConfigurations": ["eligian.mcp.command"]`.
- `dependencies` += `"semver": "7.8.5"`; `devDependencies` += `"@types/semver": "7.8.0"` (P10). `.vscodeignore` unchanged (esbuild inlines `semver` into `main.cjs`).

#### A2. Pure install state (FR-002 (c)(d), FR-004, FR-034, FR-035, FR-036) — new `src/extension/mcp/install-state.ts`

No `vscode` import (testable over temp dirs with plain `node:fs/promises`). Exports:

```ts
export const MIN_MAJOR = 1;
export const MIN_MINOR = 1;

/** major.minor ≥ 1.1, numeric; a prerelease of 1.1.0+ counts; missing / unparsable → false (P10). */
export function meetsMinimum(version: unknown): boolean;

export type EligianInstall =
  | { readonly ok: true; readonly version: string; readonly cliPath: string }
  | { readonly ok: false; readonly problem: 'missing' | 'bad-version' | 'too-old' | 'no-bin'; readonly version?: string };

/** Reads <folder>/node_modules/eligian/package.json and checks bin/cli.js (fs.stat).
 *  'missing': no package.json file; 'bad-version': the file exists but is not JSON, or its
 *  `version` is missing or does not match /^(\d+)\.(\d+)\./ (`version` set when it is a string);
 *  'too-old': parsable and below 1.1; 'no-bin': ≥ 1.1 without bin/cli.js. */
export function readEligianInstall(folderPath: string): Promise<EligianInstall>;

/** JSON with comments and trailing commas; undefined when it does not parse (P10). */
export function parseJsonc(text: string): unknown | undefined;

/** FR-004 (a)/(b) over a `servers` object: key `eligian`, or a stdio server whose args hold
 *  `…eligian/bin/cli.js` (either separator) then `mcp`, or `eligian` / `eligian@…` then `mcp`. */
export function hasEligianServer(servers: unknown): boolean;

/** <folder>/.vscode/mcp.json: 'configured' | 'none' | 'unparsable' (missing file → 'none'). */
export function vscodeMcpJsonState(folderPath: string): Promise<'configured' | 'none' | 'unparsable'>;

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';
/** FR-035: walk up from folderPath; per directory a lockfile wins over `packageManager`. */
export function findPackageManager(folderPath: string): Promise<PackageManager>;

/** FR-036: a range in the folder's own package.json that admits ≥ 1.1.0 (P10). */
export function admitsMinimum(range: unknown): boolean;

/** FR-035 + FR-036: the one line the Install terminal sends. */
export function installCommand(folderPath: string): Promise<string>;
```

- `hasEligianServer`: `servers` must be a plain object; entry `eligian` → true; else for each entry with `args` an array of strings (a stdio server: `type` absent or `'stdio'`), scan pairs `(args[i], args[i+1])`: `/(^|[\\/])eligian[\\/]bin[\\/]cli\.js$/` then `'mcp'`, or `/^eligian(@.*)?$/` then `'mcp'`. The Windows npx form `agents.ts` writes (`{ command: 'cmd', args: ['/c', 'npx', '-y', 'eligian@^1.1', 'mcp'] }`, `agents.ts:41-49`) matches the second rule.
- Lockfile table: `pnpm-lock.yaml` → pnpm; `yarn.lock` → yarn; `bun.lockb` / `bun.lock` → bun; `package-lock.json` → npm; `packageManager` `/^(pnpm|yarn|bun|npm)@/`. The walk stops at the filesystem root (`path.dirname(d) === d`) → npm.
- Commands: plain install `pnpm install` / `yarn install` / `bun install` / `npm install`; add `pnpm add -D eligian@^1.1` / `yarn add -D eligian@^1.1` / `bun add -d eligian@^1.1` / `npm install --save-dev eligian@^1.1`.

#### A3. The provider (FR-001–FR-004, FR-008, FR-009–FR-012, FR-034) — new `src/extension/mcp/server-definition-provider.ts`

```ts
import * as vscode from 'vscode';

export const PROVIDER_ID = 'eligian.mcp';
export const DISMISSED_KEY = 'eligian.mcp.installPromptDismissed';
export const DEBOUNCE_MS = 500;
export const FOLLOW_UP_MS = 3000;

/** One server the extension would start (both branches build their records from it). */
export interface EligianServerSpec {
  readonly folder: vscode.Uri;
  readonly label: string;       // 'Eligian' | `Eligian (${folder name})`
  readonly name: string;        // Cursor: 'eligian' | `eligian-${folder name}`
  readonly command: string;     // eligian.mcp.command, blank → 'node'
  readonly args: readonly string[]; // [Uri.joinPath(folder,'node_modules','eligian','bin','cli.js').fsPath, 'mcp']
  readonly version: string;
}

/** FR-002: the specs for the current workspace; never shows UI. */
export function computeServerSpecs(): Promise<readonly EligianServerSpec[]>;

/** Cursor's documented API (P2), feature-detected (FR-010). */
export interface CursorMcpApi {
  registerServer(config: {
    name: string;
    server: { command: string; args: string[]; env: Record<string, string> };
  }): void;
  unregisterServer(serverName: string): void;
}
export function cursorMcpApi(): CursorMcpApi | undefined;

/** FR-001 / FR-011: chooses the branch, wires watchers, events and the install prompt. */
export function registerEligianMcpServer(context: vscode.ExtensionContext): vscode.Disposable;
```

- **`computeServerSpecs`**: `[]` unless `workspace.isTrusted` (FR-012) and no workspace-level server (`hasEligianServer` over `inspect('servers').workspaceValue`, P16). For each `workspace.workspaceFolders` folder with `uri.scheme === 'file'`: `eligian.mcp.enabled` (`getConfiguration('eligian.mcp', folder).get('enabled', true)`), the folder-level `mcp` `workspaceFolderValue`, `vscodeMcpJsonState(folder.uri.fsPath)` (`'unparsable'` logs one line to a lazily created `Eligian MCP` output channel and counts as `'none'`, FR-004), `readEligianInstall`. Labels and names get the folder suffix only when more than one folder qualifies.
- **`lm` branch** (no Cursor API, `vscode.lm?.registerMcpServerDefinitionProvider` present): a provider object
  - `onDidChangeMcpServerDefinitions: emitter.event` (`new vscode.EventEmitter<void>()`);
  - `provideMcpServerDefinitions: async () => (await computeServerSpecs()).map(toDefinition)`, where `toDefinition(spec)` = `new vscode.McpStdioServerDefinition(spec.label, spec.command, [...spec.args], {}, spec.version)` then `definition.cwd = spec.folder` (the constructor is `constructor(label: string, command: string, args?: string[], env?: Record<string, string | number | null>, version?: string)`, `index.d.ts:20472`; `cwd?: Uri` is a property, `:20439`); no `resolveMcpServerDefinition`.
  - registered with `vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, provider)` (`index.d.ts:20847`).
- **Cursor branch** (FR-010, FR-011): `cursorMcpApi()` reads `(vscode as unknown as { cursor?: { mcp?: Partial<CursorMcpApi> } }).cursor?.mcp` and returns it only when `typeof registerServer === 'function'` and `typeof unregisterServer === 'function'`. At activation and on every change: `unregisterServer(name)` for each name registered before, then `registerServer({ name, server: { command, args: [...args], env: {} } })` per spec; the returned disposable unregisters every registered name.
- **Change events** (FR-003, P3): per folder five `createFileSystemWatcher` calls with `new vscode.RelativePattern(base, pattern)`: `(node_modules/eligian, 'package.json')`, `(node_modules, 'eligian')`, `(<folder>, 'node_modules')`, `(.vscode, 'mcp.json')`, `(<folder>, '.vscode')`, bases from `vscode.Uri.joinPath`. Each watcher's `onDidCreate/Change/Delete`, plus `workspace.onDidChangeConfiguration(e => e.affectsConfiguration('eligian.mcp') || e.affectsConfiguration('mcp'))`, `onDidChangeWorkspaceFolders` (add: new watchers; remove: dispose that folder's watchers), `onDidGrantWorkspaceTrust`, call `changed()`: `debounce(timers, 'change', DEBOUNCE_MS, fire)` from `../debounce-util.js`. `fire` = `emitter.fire()` (lm) or re-register (Cursor), then `checkInstallPrompt()`. A watcher-triggered `changed()` also schedules one `FOLLOW_UP_MS` check that compares `JSON.stringify(specs)` with the last provided and fires only on a difference (P3; an addition beyond FR-003's fallback, recorded in `compliance.md`; positive case SC-016 (f)).
- **Install prompt** (FR-008, FR-035, FR-036): `checkInstallPrompt()` runs from activation (`void` after `registerEligianMcpServer` returns, never awaited by `activate`) and from `fire`. It returns when the prompt was shown in this activation, `context.workspaceState.get(DISMISSED_KEY) === true`, the workspace is untrusted, or a workspace-level server exists. It takes the first folder (in `workspaceFolders` order) that is enabled, has no configured server, fails `readEligianInstall` (`ok: false`), and either has an existing `node_modules/eligian/package.json` (`problem` is `bad-version`, `too-old` or `no-bin`: FR-008's "too old, unparsable or without `bin/cli.js`", prompted with no `.eligian` file) or has `problem: 'missing'` and an `.eligian` file (`workspace.findFiles(new vscode.RelativePattern(folder, '**/*.eligian'), '**/node_modules/**', 1)`). Message: ``Eligian tools for Copilot need `eligian` 1.1 or later in this folder (${name}${version ? `; found ${version}` : ''}).`` with items `'Install'`, `"Don't Ask Again"` (`window.showInformationMessage`). Install → `const t = window.createTerminal({ name: 'Eligian: install', cwd: folder }); t.show(); t.sendText(await installCommand(folder.fsPath));`. Don't Ask Again → `workspaceState.update(DISMISSED_KEY, true)`. The `shown` flag is set before the `await` so concurrent checks cannot show two.
- Never `npx`, never a bundled CLI (FR-009): the only `command` is the setting, the only `args[0]` the folder's `cli.js`.

#### A4. Activation (FR-001) — `src/extension/main.ts`

`registerClientIndependentFeatures` (`main.ts:78`) gains `context.subscriptions.push(registerEligianMcpServer(context));` next to the other client-independent registrations. Nothing else in `activate` changes.

### B. CLI `dev` (`packages/cli/src`)

#### B1. Shared formatting (FR-017, FR-040) — new `smoke/engine-error-format.ts`

The four functions move **unchanged** from `smoke-runner.ts` (`errorMessage` `:395`, `alsoAt` `:411`, `inFile` `:422`, `selectorLocation` `:489`); one helper is added:

```ts
export function errorMessage(
  error: { message: string; cause?: unknown; phase?: string; operationSystemName?: string },
  operation: string | undefined,
  via: readonly string[] | undefined
): string;
export function alsoAt(alternatives: readonly EngineErrorCandidate[], map: EligianMap): string;
export function inFile(location: SourceLocation | undefined, map: EligianMap):
  (SourceLocation & { file: string }) | undefined;
export function selectorLocation(config: IEngineConfiguration, map: EligianMap, selector: string):
  SourceLocation | undefined;
/** errorMessage(...) + alsoAt(...): the text of smoke-engine-error (smoke-runner.ts:239-251). */
export function engineErrorText(
  error: { message: string; cause?: unknown; phase?: string; operationSystemName?: string },
  located: LocatedEngineError | undefined,
  map: EligianMap
): string;
/** The Eligius selector warning (the regex of smoke-runner.ts:458). */
export const SELECTOR_MISS: RegExp; // /^selector '(.+)' wasn't found!$/
```

Imports: `node:path` and types from `@eligian/language` / `eligius` only (no jsdom, no smoke runtime), so `dev-server.ts` can import it without smoke's side effects. `smoke-runner.ts` imports them (its `report` call becomes `message: engineErrorText(info, located, map)`); `determinism.ts:24` imports `inFile` from the new module. No re-export from `smoke-runner.ts` (only `determinism.ts` imported `inFile`, grep this session).

#### B2. Bundler (FR-013, FR-015) — `bundler/types.ts`, `bundler/index.ts`, `bundler/runtime-bundler.ts`

- `BundleResult` (`types.ts:144-159`) gains `readonly map: EligianMap` and `readonly config: IEngineConfiguration` (the compiled config, `compileResult.config`, not the asset-rewritten `bundleConfig`: action ids and selectors are identical, `index.ts:220`, and the selector lookup must match source). `index.ts:413` `return { outputDir, files, stats }` → `return { outputDir, files, stats, map: compileResult.map, config }`. Callers: `main.ts:271` (prints `outputDir` and `stats` only) and `dev-server.ts:102` (`ts_references` BundleResult: 4 sites, all in `bundler/`), so `compile --bundle` output is unchanged.
- `runtime-bundler.ts`:

```ts
/** FR-015: the generated lines inside `init`, in esbuild's printed form (P4). */
export const DEV_HOOK_SNIPPET = [
  '    const eligianDevHooks = window.__eligianDevHooks;',
  '    if (Array.isArray(eligianDevHooks)) {',
  '      for (const eligianDevHook of eligianDevHooks) eligianDevHook(engine);',
  '    }',
  '',
].join('\n');
```

  pushed by `generateEntryPoint` between `const { engine } = factory.createEngine(CONFIG);` and `return engine.init()…` (`runtime-bundler.ts:239-240`), as `lines.push(DEV_HOOK_SNIPPET.slice(0, -1))` so the joined entry contains the snippet verbatim. Without the global the loop never runs.

#### B3. Runtime reports (FR-014, FR-018, FR-038, FR-039) — new `dev/runtime-reports.ts`

Plain TypeScript (no Effect; `dev-server.ts` is async code today):

```ts
export type DevErrorKind = 'engine-error' | 'console-error' | 'console-warn' | 'selector-miss'
  | 'window-error' | 'unhandled-rejection' | 'build-error';

export interface EngineErrorReport {
  readonly kind: 'engine-error'; readonly buildId: string; readonly message: string;
  readonly actionId: string; readonly actionName?: string; readonly phase: 'start' | 'end';
  readonly operationSystemName?: string; readonly operationIndex?: number;
  readonly operationPath?: readonly { readonly systemName: string; readonly index: number }[];
  readonly timelineUri?: string; readonly position?: number;
}
export interface PageErrorReport {
  readonly kind: 'console-error' | 'console-warn' | 'window-error' | 'unhandled-rejection';
  readonly buildId: string; readonly message: string;
  readonly source?: string; readonly line?: number; readonly column?: number;
}
export interface SelectorMissReport {
  readonly kind: 'selector-miss'; readonly buildId: string; readonly message: string; readonly selector: string;
}
export type RuntimeReport = EngineErrorReport | PageErrorReport | SelectorMissReport;

/** Shape check; strings over 4,000 chars are truncated; undefined → 400. */
export function parseRuntimeReport(body: unknown): RuntimeReport | undefined;

export interface DevError {
  readonly kind: DevErrorKind; readonly message: string; readonly count: number;
  readonly first: string; readonly last: string;
  readonly file?: string; readonly line?: number; readonly column?: number;
  readonly endLine?: number; readonly endColumn?: number;
  readonly timeline?: string; readonly position?: number;
  readonly action?: string; readonly operation?: string; readonly via?: readonly string[];
  readonly exact?: boolean;
  readonly alternatives?: readonly { file: string; line: number; column: number; via: readonly string[] }[];
}
export interface DevErrorsFile {
  readonly version: 1; readonly entry: string; readonly url: string; readonly buildId: string;
  readonly updated: string; readonly errors: readonly DevError[];
}
export const MAX_ENTRIES = 100;
export const MAX_BODY_BYTES = 64 * 1024;

/** The FR-018 merge key: kind, message, file:line:column. */
export function mergeKey(error: Pick<DevError, 'kind' | 'message' | 'file' | 'line' | 'column'>): string;
/** Merge (count +1, last = now) or append; drop the oldest beyond MAX_ENTRIES. */
export function addError(file: DevErrorsFile, error: Omit<DevError, 'count' | 'first' | 'last'>, now: string): DevErrorsFile;
/** Atomic write: <dir>/.dev-errors.<pid>.<n>.tmp then rename (retry ×5, 20 ms, on EPERM/EBUSY/EACCES).
 *  Uses `import * as fs from 'node:fs/promises'` like `dev-server.ts:18`; SC-008 (7) observes it
 *  through `vi.mock('node:fs/promises', …)` (Test plan), so there is no injected fs parameter. */
export function writeDevErrors(dir: string, file: DevErrorsFile): Promise<void>;
/** FR-037: mkdir <entry dir>/.eligian; when created now, write `.gitignore` = "*\n". */
export function ensureEligianDir(root: string): Promise<string>;
```

`DevError.endLine` / `endColumn` stay in the type (FR-018 lists them as optional) but Phase 4 never writes them: the located positions come from `inFile`, which returns the compiler's `SourceLocation` `{ file?, line, column, length? }` (`compiler/types/common.ts:13-18`, `smoke-runner.ts:422-429`), which has no end position, and the terminal line and SC-004 / SC-019 / SC-025 need only the start. `dev-server.spec.ts` asserts the stored entries have no `endLine` / `endColumn` key, so a later phase that derives them (from `length` over the source text) is a visible change.

#### B4. Dev server (FR-014, FR-016–FR-020, FR-033, FR-037) — `dev/dev-server.ts`

- `IGNORED` (`:77`) becomes `/(^|[\\/])(node_modules|\.git|\.eligian|[^\\/]+\.bundle)([\\/]|$)|~$|\.swp$/` (FR-019).
- New state in `startDevServer`: `current: { buildId: string; map: EligianMap; config: IEngineConfiguration } | undefined`, `lastBuildId: string`, `printed: Set<string>` (FR-038), `errors: DevErrorsFile | undefined` (in-memory current file), `writes: Promise<void>` (the queue). `const RUNTIME_PATH = '/__eligian/runtime'`.
- `build` (`:99-132`):
  - failure: `current = undefined` (P13); `enqueue(f => ({ ...f, errors: [buildError] }))` creating the directory; existing log + `send('build-error')` unchanged;
  - a new identity, `adopt(result)` = `mint()` (`randomUUID()`, `node:crypto`) into `lastBuildId`, `current = { buildId, map: result.map, config: result.config }`, `printed.clear()`, and a reset that rewrites only an existing file (P12), is called at exactly two places, tied to what the build *sends* (FR-033), not to the `cssOnly` flag: (i) in the `first` branch before `log(\`built in ${time}\`)` (`:114-117`), and (ii) immediately before `send('reload')` (`:128-131`). Path (ii) covers `recovered`, a non-CSS change, **and** the CSS-only fallthrough: when `cssOnly` is true but `styleOf(...)` returns `undefined` (the program imports no stylesheet and a `.css` file in the watched root changed, `:119-126`), the existing code falls through to `send('reload')`, and the reloaded page runs a bundle with new action ids, so it must get a new `buildId` and map;
  - the CSS swap (`send('css', …)` and `return`, `:122-124`): nothing of the above (FR-033); it is the only success path that keeps the identity.
  - The `Exit.isFailure` / success split is the existing one; the success value is `exit.value` (today unused).
- `index.html` (`:196-205`): `withClient(html, current?.buildId ?? lastBuildId)` (P14).
- Route, before the `CLIENT_PATH` branch (`:185`):
  1. `request.headers.origin !== undefined && origin !== \`http://localhost:${port}\`` → `403`;
  2. method not `POST` → `400`;
  3. read the body, `> MAX_BODY_BYTES` → `400`; `JSON.parse` failure, `parseRuntimeReport` `undefined` (covers a missing `buildId`) → `400`;
  4. `report.buildId !== current?.buildId` → `204`, nothing else;
  5. otherwise `await accept(report)` → `204`.
- `accept(report)`:
  - `engine-error`: `located = locateEngineError(current.map, { actionId, phase, operationSystemName, operationIndex, operationPath })`; `at = inFile(located?.location, current.map)`; text `engineErrorText({ message, phase, operationSystemName }, located, current.map)`; line `` `runtime error: ${text}${at ? ` at ${path.relative(root, at.file)}:${at.line}:${at.column}` : ' (no source location)'}${timelineUri !== undefined && position !== undefined ? ` (timeline ${timelineUri} at ${position}s)` : ''}` ``; entry with `file: at.file` (absolute), `line`, `column` (no `endLine` / `endColumn`, B3), `timeline`, `position`, `action: located.action.name`, `operation`, `via`, `exact`, `alternatives` (each through `inFile`).
  - `console-error` / `console-warn` / `window-error` / `unhandled-rejection`: `console error: ` / `console warning: ` / `page error: ` / `unhandled rejection: ` + message; no location.
  - `selector-miss`: `at = inFile(selectorLocation(current.config, current.map, report.selector), current.map)`; line `` `selectElement("${selector}") matched no element${at ? ` at ${rel}:${line}:${column}` : ''}` ``; entry located.
  - The line is printed through `log` only when `mergeKey` is not in `printed` (FR-038); the entry is always merged (`count`).
- `enqueue(update)`: `writes = writes.then(async () => { const dir = await ensureEligianDir(root); const next = update(errors ?? emptyFile()); await writeDevErrors(dir, next); errors = next; }).catch(e => log(\`cannot write .eligian/dev-errors.json: ${message(e)}\`))`; `accept` awaits the promise it chained (P17). `emptyFile()` = `{ version: 1, entry: input, url, buildId: lastBuildId, updated, errors: [] }`.
- `close` awaits `writes` after `building`.
- Unchanged: CLI surface (FR-020, `main.ts:380-405`), the SSE events, the build log lines.

#### B5. Dev client (FR-016, FR-039) — `dev/client-runtime.ts`

`DEV_CLIENT_SCRIPT` keeps its current body (resume, `reload`, `css`, `build-error`, `ok`) and gains, before the `EventSource` line:

- `const BUILD = ((document.currentScript || document.querySelector('script[data-build-id]')) || {}).dataset?.buildId || '';` (P14).
- `post(report)`: guarded by a `posting` flag (no recursion) and a counter: posts 1–50 as given, the 51st as `{ kind: 'console-error', message: 'eligian dev: more errors not forwarded' }`, then nothing; body `JSON.stringify({ ...report, buildId: BUILD })`; `navigator.sendBeacon('/__eligian/runtime', body)` when it is a function, else `fetch('/__eligian/runtime', { method: 'POST', body, keepalive: true }).catch(() => {})`; the whole poster inside `try {} catch {}`.
- `const original = { error: console.error, warn: console.warn };` `console.error = (...args) => { post({ kind: 'console-error', message: args.map(describe).join(' ') }); return original.error.apply(console, args); }`; `console.warn` likewise, with `SELECTOR_MISS` text → `{ kind: 'selector-miss', message, selector }` instead (FR-039). There is no filter for the client's own messages: FR-016 (c) posts every call, the engine-error print of FR-016 (b) already bypasses the wrapper through `original.error`, and the only other own error/warn call, `console.warn('[eligian dev] could not resume:', error)` (`client-runtime.ts:59`), is a real failure that is posted as a `console-warn` (`:57` is `console.info`, not wrapped). SC-009 asserts that a failing resume posts one `console-warn`.
- `addEventListener('error', e => post({ kind: 'window-error', message: e.message || describe(e.error), source: e.filename, line: e.lineno, column: e.colno }))`; `addEventListener('unhandledrejection', e => post({ kind: 'unhandled-rejection', message: describe(e.reason) }))`.
- `(window.__eligianDevHooks = window.__eligianDevHooks || []).push(engine => engine.on('error', error => { original.error.call(console, '[eligian dev] ' + error.message, error.cause); post({ kind: 'engine-error', message: causeMessage(error), actionId: error.actionId, actionName: error.actionName, phase: error.phase, operationSystemName: error.operationSystemName, operationIndex: error.operationIndex, operationPath: error.operationPath, timelineUri: engine.currentTimelineUri, position: engine.position }); }))`. `engine.on(event, handler)` is `IEligiusEngine.on` (`locale-manager-CJy3musb.d.mts`, `on<K extends keyof EngineEvents>(event: K, handler: …, options?): () => void`); `currentTimelineUri` and `position` are engine properties (same file). The hook runs before `engine.init()` (B2), so position 0's errors are caught.
- The selector regex text is the same as `SELECTOR_MISS` (B1); `dev-client.spec.ts` asserts both match the same samples.

### C. MCP server (`packages/cli/src/mcp`)

#### C1. `loadIndex` (FR-021, FR-023, P7) — `knowledge/load.ts`

```ts
/** index.json only (no bodies, no overlays); ToolInternal naming docsRoot on any failure. */
export const loadIndex = (docsRoot: URL | string): Effect.Effect<readonly IndexEntry[], ToolInternal>;
```

Same `toDirectory`, `failure`, and `parseJson('index.json')` + array check as `read` (`load.ts:57-71`); the two share a module-private helper, so `read` is unchanged in behaviour.

#### C2. Resources (FR-021–FR-024, I-6) — new `resources.ts`

```ts
/** One static resource per index entry; Layer.empty when `entries` is empty. Synchronous: no I/O
 *  at layer build (P18); `entries` come from `loadIndex`, awaited by `makeServerLayer` (C4). */
export const docsResources = (
  ai: EffectAi,
  docsRoot: URL | string,
  entries: readonly IndexEntry[]
): Layer.Layer<never>;
export const resourceUri = (id: string): string => `eligian://docs/${id}`;
```

- The file begins with `// @effect-diagnostics unstableApiUsage:off` and the same justification comment as the other `effect/ai` modules (`ai.McpServer.resource` is `@stability unstable`; `effect` is pinned exactly, roadmap decision 1), so `pnpm effect:check:cli` stays 0/0/0.
- No `Layer.unwrap` and no file read: the index is already in `entries`. `docsRoot` is kept only for the lazy `content` effect below.
- Per entry `ai.McpServer.resource({ uri: resourceUri(e.id), name: e.id, description: e.card, mimeType: 'text/markdown', content })` (the static overload, `McpServer.d.ts:487-499`), `content = loadKnowledge(docsRoot).pipe(Effect.flatMap(k => { const body = k.body(e.id); return body === undefined ? Effect.fail(new ToolInternal({ message: \`no body for Eligian doc '${e.id}'\`, path: dir })) : Effect.succeed(\`# ${e.title}\n\n${body}\`); }))`. A string becomes `{ contents: [{ uri, text }] }` (`resolveResourceContent`, `McpServer.js:1882-1889`); the failure becomes `InternalError` with that message (P8).
- `Layer.mergeAll(first, ...rest)` over the entries (`Layer.d.ts:1434` needs a non-empty tuple; `Arr.isArrayNonEmpty` guard, `Layer.empty` otherwise).
- No compiler lock, no telemetry line (resources are not tool calls).

#### C3. The prompt (FR-025, FR-026, I-7) — new `prompts.ts`

```ts
export const NEW_PRESENTATION: {
  readonly name: 'new-presentation';
  readonly title: 'New Eligian presentation';
  readonly description: string;
  readonly docIds: readonly ['storyboard', 'decisions', 'project-layout', 'runtime-state-pitfalls'];
  readonly tools: readonly ['eligian_docs', 'eligian_init', 'eligian_project', 'eligian_operations',
                            'eligian_check', 'eligian_compile', 'eligian_fmt', 'eligian_smoke'];
  readonly text: (idea: string) => string;
};
/** The layer: ai.McpServer.prompt({ name, title, description, parameters: { idea }, content }). */
export const newPresentationPrompt = (ai: EffectAi): Layer.Layer<never>;
```

- `text(idea)` is a template literal whose every tool and doc id is interpolated from two `const` records (`TOOL.docs`, … / `DOC.storyboard`, …) from which `tools` and `docIds` are `Object.values(...)`, so the arrays and the text have one source. Steps, numbered `1.`–`12.` on their own lines, follow FR-025 verbatim in content: 1 `eligian_docs` ids `"storyboard"`, `"decisions"`, `"project-layout"`; 2 write `STORYBOARD.md`; 3 `eligian_init` with the starter the provider choice in `"decisions"` points to; 4 `eligian_project`; 5 layout and CSS first; 6 timelines one view at a time, `eligian_operations` (batched names) before each new operation; 7 `eligian_check` until 0 errors and 0 warnings; 8 `eligian_compile` with `select` and `explain: true` once the first timeline passes; 9 `eligian_fmt` with `write: true`; 10 `eligian_smoke` with a scenario per interaction and `determinism: true`; 11 `npx eligian dev main.eligian` for a human look, then read `.eligian/dev-errors.json`; 12 before declaring done, compare `STORYBOARD.md` with `eligian_project`'s storyboard section and the compiled timelines, and read `"runtime-state-pitfalls"`. The idea goes first, after one line `Build an Eligius presentation with Eligian for this idea:`. Measured length without the idea is asserted (≤ 4,096; expected ≈ 1,500).
- The file begins with `// @effect-diagnostics unstableApiUsage:off` and the same comment as the other `effect/ai` modules (`ai.McpServer.prompt` is `@stability unstable`).
- `parameters: { idea: Schema.NonEmptyString.annotate({ description: 'The presentation idea in your own words' }) }` (P8); `content: ({ idea }) => Effect.succeed(NEW_PRESENTATION.text(idea))` ("String content becomes a user text message", `McpServer.d.ts` doc of `registerPrompt`; `McpServer.js:1764-1771`).

#### C4. `makeServerLayer` (FR-024) — `server.ts:148-164`

```ts
// before any layer is built (P18): the registrations below do no I/O
const index = await Effect.runPromise(Effect.result(loadIndex(context.docsRoot)));
if (Result.isFailure(index)) {
  process.stderr.write(`eligian mcp: no docs at ${dir}; resources disabled\n`); // FR-023
}
const entries = Result.isSuccess(index) ? index.success : [];
const tools = ai.McpServer.toolkit(toolkit).pipe(Layer.provide(handlers), Layer.provide(options.lock ?? CompilerLockLive));
return Layer.mergeAll(tools, docsResources(ai, context.docsRoot, entries), newPresentationPrompt(ai)).pipe(
  Layer.provide(ai.McpServer.layerStdio({ … unchanged … })),
  Layer.provide(stderrLoggerLayer)
);
```

`Effect.result` is `<A, E, R>(self: Effect<A, E, R>) => Effect<Result.Result<A, E>, never, R>` (`Effect.d.ts:3560`); `Result.isFailure` / `isSuccess` and the `success` field are `Result.d.ts:659`, `:691`, `:152`. `dir` is the resolved directory string `loadIndex` names in its `ToolInternal` (the same `toDirectory`). Because every registration layer is now synchronous, there is no I/O wait between the fork of `layerStdio`'s request loop (P18) and the registrations, the position the toolkit is in today. The immediate-`initialize` case of `mcp-resources.spec.ts` is the check; should it ever fail, the fallback (no requirement change) is to make the transport depend on the registrations, `ai.McpServer.layerStdio(...).pipe(Layer.provide(registrations))`, sharing the memoized `McpServer.layer`. `resource` and `prompt` layers provide `McpServer.layer` themselves (`McpServer.js:1695-1701`, `:1789`), like the toolkit; all three take the same `layerStdio`. `INSTRUCTIONS[MCP_PHASE]` and `MCP_PHASE = 3` are unchanged (I-9). The `ServerOptions` interface is unchanged (`docsRoot` already exists, `:35`).

### D. Documentation (FR-027–FR-030)

- `packages/extension/README.md`: new `## Coding agents (MCP)` after `## Compilation Output` (`:297`), with the seven FR-027 items; `## Configuration` (`:306`) lists the two settings; `## Troubleshooting` gains "node is not on the editor's PATH → `eligian.mcp.command`" (spec Edge cases).
- `packages/cli/README.md`: `### Use with coding agents (eligian mcp)` (`:381`): VS Code row and paragraph (automatic via the extension; `.vscode/mcp.json` manual), a "Resources and the prompt" sub-section (`eligian://docs/<id>`, `/mcp__eligian__new-presentation`); `### Work in the Browser (eligian dev)` (`:144`): the runtime lines, `.eligian/dev-errors.json` (format, kinds, `count`, printed once per build, reset on a reload-build, not on a CSS-only build) and `.eligian/.gitignore`.
- `CHANGELOG.md` `## Unreleased (2026-11-05)` → `### Added` (`:9`): three entries (extension registration; `dev` runtime feedback; resources + prompt).
- `AGENTS.md:45` (`eligian dev` line): "+ runtime errors / console errors and warnings / selector misses posted back (`POST /__eligian/runtime`), printed located through the build's Eligian map and written to `.eligian/dev-errors.json` (self-ignoring `.eligian/.gitignore`)"; the Commands list gains the extension registration in the `eligian mcp` line. `packages/extension/AGENTS.md` `## Layout` (`:7`): the `mcp/` module.
- `curriculum/verification-ladder.md` §6 (`:78-80`): one paragraph (≈ 70 words; the chunk is 1,132 words, limit 1,500): runtime errors print in the `dev` terminal with their source location and go to `.eligian/dev-errors.json` (engine errors, console errors and warnings, selector misses, page errors; repeats only counted), which the agent reads after the page loads. Card unchanged.

## Data and generation design

| Artefact | Input | Producer | Output | Drift check |
| --- | --- | --- | --- | --- |
| bundle baseline | `smoke:examples` patterns minus library files (`library <name>` first statement): today `examples/demo.eligian`, `examples/eligian-tour/tour.eligian` | new `packages/cli/scripts/capture-bundle-baseline.ts --write` (G0) / `--diff` (G2, G7); runs `node packages/cli/bin/cli.js compile <file> --bundle -o <tmp> --force` from the repo root; normalises per P6 and, for `--diff`, removes `DEV_HOOK_SNIPPET` once (failing when it is not present exactly once) | `specs/058-mcp-server/phase-4-editor-dev-polish/baseline/bundle-before/<repo-relative path>.bundle.js` | `--diff` exit 0, output quoted in `compliance.md` (SC-010 (1)) |
| `tools/list` snapshot | the server at `aa9fa55` | `mcp-server.spec.ts` `toMatchFileSnapshot` (G0, then permanent) | `packages/cli/src/__tests__/__snapshots__/tools-list-phase3.json.snap` | the same spec (SC-013) |
| instructions snapshot | `INSTRUCTIONS[3]` at `aa9fa55` | `mcp-server.spec.ts` `toMatchFileSnapshot` (G0, then permanent) | `packages/cli/src/__tests__/__snapshots__/instructions-phase3.txt.snap` | the same spec (SC-013) |
| dev log baseline | `dev-server.spec.ts` at `aa9fa55` | G0 (c) | `baseline/dev-log-before.txt` | SC-017's last clause compares the new run's lines |
| `dev-errors.json` | runtime reports | `dev-server.ts` at run time | `<entry dir>/.eligian/dev-errors.json` (+ `.gitignore`) | `dev-server.spec.ts` |
| docs resources | `dist/docs/index.json` + bodies (existing generator, unchanged) | `resources.ts` at run time | MCP `resources/list` / `read` | `mcp-resources.spec.ts` compares with the index |

No generated source file; `scripts/generate-knowledge.ts` is unchanged.

## Test plan

TESTING_GUIDE first. Every spec below is written before its code (TDD). Fixtures under `__fixtures__/`; temp dirs via `fs.mkdtempSync(path.join(os.tmpdir(), …))`, removed in `afterEach`/`afterAll`.

### Extension — `packages/extension/src/extension/__tests__/`

**`mcp-install-state.spec.ts`** (new; pure, real temp dirs, no `vscode`):
- `describe('meetsMinimum')` `it.each` SC-005's table: `1.1.0`, `1.1.0-beta.1`, `1.2.3`, `2.0.0` → true; `1.0.9`, `0.9.0`, `undefined`, `'abc'` → false.
- `describe('readEligianInstall')`: missing `package.json` → `missing`; `{"version":"abc"}` → `bad-version` with `version: 'abc'`; `{}` and a non-JSON `package.json` → `bad-version` with no `version`; `1.0.3` → `too-old` with version; no `bin/cli.js` → `no-bin`; ok → `{ version, cliPath: path.join(folder, 'node_modules', 'eligian', 'bin', 'cli.js') }`.
- `describe('parseJsonc')`: line/block comments, comments inside strings kept, trailing commas, invalid → `undefined`.
- `describe('hasEligianServer')` SC-020 (a)–(e) true; cli.js without `mcp`, `eligian-tools`, unrelated → false; the Windows `cmd /c npx -y eligian@^1.1 mcp` form → true.
- `describe('findPackageManager / installCommand')` SC-021 (1)–(6), table-driven over temp trees (lockfile in folder; two levels up; nearest of two ancestors; `packageManager: 'pnpm@9.0.0'`; lockfile beats the field in one dir; nothing → npm; declared ranges `^1.1.0`, `^1.0.0`, `>=1.1`, `latest` → plain install per manager; `1.0.3`, none, `abc`, `workspace:*` → add command).

**`mcp-provider.spec.ts`** (new; `vi.mock('vscode', …)` per file with: `Uri.file` / `Uri.joinPath` (fsPath via `path.join`), `RelativePattern` recording `{ base, pattern }`, `McpStdioServerDefinition` (a class storing its constructor args and `cwd`), `EventEmitter` (counting `fire`), `workspace` (`workspaceFolders`, `isTrusted`, `getConfiguration` with per-level `inspect`, `onDidChangeConfiguration`, `onDidChangeWorkspaceFolders`, `onDidGrantWorkspaceTrust`, `createFileSystemWatcher` recording patterns and exposing fire handles, `findFiles`), `window` (`showInformationMessage`, `createTerminal`, `createOutputChannel`), `lm.registerMcpServerDefinitionProvider` (captures the provider); folders are real temp dirs; `vi.useFakeTimers()` where events are counted):
- `describe('registration')`: SC-001 automated half (US1-1: label `Eligian`, command `node`, args `[<abs>/node_modules/eligian/bin/cli.js, 'mcp']` built with `path.sep`, `cwd` = folder `Uri`, `version` `1.1.0`); `package.json` `contributes.mcpServerDefinitionProviders[0].id === PROVIDER_ID === ` the id passed to `registerMcpServerDefinitionProvider`; the disposable is in `context.subscriptions`.
- `describe('version gate')`: SC-005 over temp folders; untrusted → `[]`, `onDidGrantWorkspaceTrust` → one event; two folders → `Eligian (<name>)` ×2; US1-2 (version change → event → new `version`).
- `describe('setting')`: SC-002 (`enabled: false` → `[]`; toggle → exactly one event within 500 ms; back on → 1); blank `eligian.mcp.command` → `node`; `command` `C:\\node\\node.exe` → that.
- `describe('user-configured server')`: SC-003 (1)/(3), where (3) (an unparsable `.vscode/mcp.json`) also asserts exactly one `appendLine` call on the channel returned by `createOutputChannel('Eligian MCP')` (FR-004's log line); SC-020 via the provider (file states and workspace-level `inspect`; `globalValue` set to an Eligian server in the fake and still 1 definition: never read); SC-020's user-profile case literally: an Eligian `mcp.json` written into a fake user dir (temp dir; `vi.stubEnv('APPDATA' | 'HOME' | 'USERPROFILE', dir)`, and the same file under `<dir>/Code/User/mcp.json`), 1 definition returned, and a pass-through `vi.mock('node:fs/promises', async importOriginal => …)` whose `readFile` / `stat` / `access` record every path shows no path under that dir (P16).
- `describe('change events')`: SC-016 (a) five `RelativePattern` `{ base, pattern }` pairs per folder (P3); (b) create/change/delete on each watcher and a folders change → exactly one event after 500 ms (and none extra after `FOLLOW_UP_MS`); (c) config + watcher + trust inside 500 ms → 1; (d) added folder gets watchers, removed folder's are disposed; (e) `affectsConfiguration('mcp')` → 1; (f) the follow-up's positive case (P3): a temp folder with `node_modules/eligian/package.json` `1.1.0` and no `bin/cli.js`, a create event on the `package.json` watcher, timers advanced 500 ms (one event; `provideMcpServerDefinitions` → `[]`), then `bin/cli.js` written and timers advanced to `FOLLOW_UP_MS`: exactly one more event, and `provideMcpServerDefinitions` returns one definition.
- `describe('install prompt')`: SC-006 (1)–(8) (`showInformationMessage` call count and text containing `1.0.3`; Install → one `createTerminal({ cwd: folder })` + `sendText(<cmd>)`; Don't Ask Again → `workspaceState.update(DISMISSED_KEY, true)` and no second prompt; `provideMcpServerDefinitions` → 0 calls; disabled/untrusted/configured/unrelated → 0; two folders → one prompt naming the first). Plus FR-008's unparsable install: a folder with `node_modules/eligian/package.json` `{"version":"abc"}` and **no** `.eligian` file shows exactly one notification. Plus SC-021's `cwd` at provider level for the monorepo case: `pnpm-lock.yaml` two levels above the folder, no lockfile in the folder, **Install** clicked → `createTerminal` called once with `cwd` equal to the folder `Uri` (not the ancestor) and `sendText('pnpm add -D eligian@^1.1')`. (The rest of SC-021's table runs against `installCommand` in `mcp-install-state.spec.ts`, which returns the line; the terminal `cwd` is the same code path for every case, the folder.)
- `describe('Cursor branch')`: SC-007 (1)–(4) with the P2 fake on `vscode.cursor.mcp` (per-test `vi.doMock` / module reset): `registerServer` per folder `{ name, server: { command, args, env: {} } }`, no `lm` call; a change → `unregisterServer(name)` then `registerServer`; dispose → `unregisterServer` per name; without the fake → `lm` path, `registerServer` untouched.
- `describe('manifest')`: SC-018 (reads `package.json`: the four activation events, the contribution, both settings' `type`/`default`/`scope`, `restrictedConfigurations`, the description mentions MCP).

**`activate-client-failure.spec.ts`** (extended, P15): `vi.mock('../mcp/server-definition-provider.js', …)`; `it('registers the MCP provider even when the language server fails')` asserts one call with the context.

**`build-output.spec.ts`** (extended): in the `.vsix` case, `expect(files.filter(f => /(^|\/)node_modules\/eligian\/|(^|\/)cli\.mjs$|(^|\/)bin\/cli\.js$/.test(f))).toEqual([])` (FR-032, SC-014).

### CLI — `packages/cli/src/__tests__/`

**`smoke.spec.ts`** (unchanged; G1 gate): the `:118-148` engine-error texts and the selector-miss cases pass as they are (SC-017, SC-025 (4)).

**`engine-error-format.spec.ts`** (new, small): `engineErrorText` equals `errorMessage(...) + alsoAt(...)` on a located fixture error; `selectorLocation` finds the first `selectElement` with that literal in start then end ops; `SELECTOR_MISS` matches `selector '#x' wasn't found!` (SC-025 (4)).

**`bundler/bundle-dev-hook.spec.ts`** (new; G2): reuses the `bundle-runs.spec.ts` seam (`createBundle` on a temp program, `new JSDOM(html without scripts, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' })`, `stubMissingBrowserApis`, `dom.window.eval(bundle)`, `DOMContentLoaded`):
- `it('the bundle carries DEV_HOOK_SNIPPET exactly once')` (SC-010 (1) perpetual half; also over `generateEntryPoint` output);
- `it('calls every __eligianDevHooks function once with the engine before init resolves')` (SC-010 (2): `window.__eligianDevHooks = [spy]` set before `eval`; `spy` called once, with an object whose `init` is the engine's; the spy pushes `'hook'` to an `order` array and wraps the engine's `init` (`const init = engine.init.bind(engine); engine.init = (...a) => { order.push('init'); return init(...a); }`), so after `ready` resolves `order` starts with `['hook', 'init']`; a hook placed after `init()` resolved, or after `init` was called, gives a different order. `ready` resolving is only the end of the wait, not the ordering check);
- `it('without the global, nothing is called and the bundle still starts')` (SC-010 (3));
- `it('BundleResult carries the map and config of its compile')` (FR-013: every `config.timelines[].timelineActions[].id` is a key of `map.actions`).

**`dev-client.spec.ts`** (extended; jsdom, the existing `run = () => new Function(DEV_CLIENT_SCRIPT)()`, `FakeEventSource`; `navigator.sendBeacon` stubbed with `vi.fn`; `document.currentScript` provided via `Object.defineProperty` or a `script[data-build-id]` element):
- `FakeEventSource` moves from this file (`dev-client.spec.ts:12-17`) to a shared helper `packages/cli/src/__tests__/fake-event-source.ts` (beside `fresh-bundle.ts` and `mcp-test-client.ts`), exporting `createFakeEventSource()` → `{ FakeEventSource, listeners }`, so `dev-server.spec.ts` SC-004 (2) installs the same class on its jsdom window; the existing four cases keep their bodies.
- SC-009 (1)–(6), (5a); a failing resume (`switchTimeline` rejecting) posts exactly one `console-warn` whose message starts `[eligian dev] could not resume:` and still calls through (FR-016 (c), no own-message filter, B5); SC-024: posts decoded from the beacon bodies, `buildId` present; the fake engine `{ on(event, h) { handlers[event] = h }, currentTimelineUri, position }` passed to `window.__eligianDevHooks[0]` before `start` emits; console call-through counted with spies set **before** `run()` (the wrapper captures the originals at run time); the 50 cap; throwing `sendBeacon` / `fetch` neither throws nor recurses; the existing four cases untouched.

**`dev-server.spec.ts`** (extended; a second `describe('eligian dev runtime reports')` with its own temp project and `startDevServer(entry, { port: 0, debounceMs: 50, log: line => lines.push(line) })`; a `post(body, { origin?, method? })` helper over `http.request`; `buildId` read from the served `index.html` `data-build-id`; the file read with `fs.readFileSync` right after a `204`, P17):
- FR-019 / SC-008 (5) / SC-022 (4): `it('writing .eligian/ triggers no rebuild')` (0 new `reload`/`ok` via `next(...)`, 0 new rebuild lines within `debounceMs + 500`).
- SC-008 (1)–(7): concurrency (`Promise.all` of 20 identical / 20 distinct), cap 100 after 120, reset on reload-build, build-error on failure, stale `buildId` (bytes and lines unchanged), status codes (403 foreign Origin, 400 ×5 cases, 204), atomicity (a 5 ms poller parsing the file during the burst; temp path in the same dir then rename, with no overlap: a counter of in-flight renames never above 1). The fs calls are observed with a module mock, not `vi.spyOn(fs.promises, …)`: the dev code imports `* as fs from 'node:fs/promises'` (`dev-server.ts:18`), and patching the CJS `fs.promises` object does not change the ESM namespace bindings of a builtin. The spec file declares `const io = vi.hoisted(() => ({ calls: [] as string[], inFlight: 0, maxInFlight: 0 }))` and `vi.mock('node:fs/promises', async importOriginal => { const real = await importOriginal<typeof import('node:fs/promises')>(); return { ...real, writeFile: vi.fn(async (p, ...a) => { io.calls.push(\`write ${p}\`); return real.writeFile(p, ...a); }), rename: vi.fn(async (from, to) => { io.calls.push(\`rename ${from} ${to}\`); io.inFlight++; io.maxInFlight = Math.max(io.maxInFlight, io.inFlight); try { return await real.rename(from, to); } finally { io.inFlight--; } }) }; })`. Pass-through, so the other cases of the file are unaffected. Assertions: every `rename` to `dev-errors.json` is preceded by a `write` of its `from` path, which is in the same `.eligian` dir and ends `.tmp`; `io.calls` contains at least 20 renames for the burst (the mock does see the writer: a zero count fails the case instead of passing it vacuously); `io.maxInFlight === 1`.
- SC-017: one line per kind with its prefix; unknown `actionId` → ends `(no source location)`; `(timeline <uri> at <position>s)`; a run with no reports: the log lines equal `baseline/dev-log-before.txt` (normalised `\d+ms`).
- SC-019 (1)–(4): CSS-only keeps `buildId`, accepted report located with B1's map, entries and `updated` unchanged by the CSS build; reload-build → b2, file reset, b1 dropped; failed then fixed → new id, reset.
- SC-019 (5) (added here, B4) *(ruling 2026-11-06, option b: the bundler always emits a `<style>` block, so "no stylesheet" means an **empty** `styleOf(...)` result, not `undefined`; `dev-server.ts` checks `css.trim() !== ''`)*: a second temp project whose `main.eligian` has **no** `styles` import, plus a `.css` file in its root. Changing the `.css` file makes `build` take the CSS-only branch with `styleOf(...)` `undefined`, so the SSE stream carries `reload` (not `css`); the served `index.html`'s `data-build-id` then differs from the one before, a report with the old id gets `204` and changes nothing, and a report with the new id is accepted.
- The stored entries carry no `endLine` / `endColumn` key (B3).
- SC-022 (1)–(3): `.gitignore` = `*` (+ `\n`), a pre-existing user `.gitignore` byte-identical, root `.gitignore` byte-identical.
- SC-023 (1)–(5): repeat rule and counts.
- SC-025 (1)–(3): `console warning: w`; `selector-miss` located at the fixture's `selectElement`, the expected position computed with the same `selectorLocation` over `compileFile`'s config and map (the function smoke uses, B1); unknown selector → no location.
- **SC-004** fixture `__fixtures__/dev-runtime-error/` (`main.eligian`: `layout`, `styles`, `extensions "./host.ts" { operation boom() }`, `timeline "Intro" in "#stage" using raf { on enter [ boom() ] at 0s..1s [ selectElement("#a") addClass("on") ] [ selectElement("#a") removeClass("on") ] }`; `host.ts`: `export const operations = { boom(): never { throw new Error('boom'); } };` in the shape of `__fixtures__/mcp/host/host.ts`; `layout.html`, `styles.css`), copied to a temp dir per test:
  - (1) `it('an engine-error report is printed and stored located')`: `actionId` = the `on enter` action's id from the served `bundle.js`'s `CONFIG` (read by evaluating it in jsdom as below, or by parsing `window.EligiusBundled.CONFIG`), `phase: 'start'`, the `boom` op's `systemName`, index and path from that action's `startOperations`; asserts the line contains `boom` and `main.eligian:<L>:<C>` (L:C = the `boom()` call's position found by `indexOf` in the fixture text), and the file entry has absolute `file`, `line`, `column`, `exact: true`.
  - (2) `it('end to end: the real engine, hook and client report boom located')`: fetch `index.html`, `/__eligian/client.js`, `bundle.js`; `new JSDOM(indexHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: server.url })` (the inert `<script data-build-id>` tag stays, P14); `stubMissingBrowserApis(window)`; `window.EventSource = createFakeEventSource().FakeEventSource` (jsdom has no `EventSource`, `stubMissingBrowserApis` (`smoke/dom-environment.ts:67-100`) stubs none, and `DEV_CLIENT_SCRIPT` calls `new EventSource('/__eligian/events')` unguarded, `client-runtime.ts:69`; without it the eval throws a `ReferenceError`; the SSE stream is not under test here, the report path is); `window.navigator.sendBeacon = (url, body) => { postViaHttp(new URL(url, server.url), body, { origin: new URL(server.url).origin }); return true; }`; `expect(() => window.eval(clientText)).not.toThrow()` (the eval is asserted, never wrapped in a `try` that would hide a failure); `window.eval(bundleText)`; dispatch `DOMContentLoaded`; `await vi.waitFor(() => expect(lines.some(l => l.includes('boom') && l.includes(\`main.eligian:${L}:${C}\`))).toBe(true), { timeout: 15000 })`; then the file entry. Per-test timeout 60 s. Window closed in `finally`.

**`mcp-resources.spec.ts`** (new; `startInMemoryServer({ cwd, docsRoot })` over a `generateKnowledge({ outDir })` temp docs root as `mcp-server.spec.ts:96-103` does):
- SC-011 (1) `resources/list` vs the index (count per `kind`, uri, name, mimeType, description = card; `eligian://docs/operation/addClass` present); (2) `resources/read` of `map-dataflow` and `operation/addClass` starts with `# <title>` and contains `Knowledge.body`; (3) unknown URI → JSON-RPC error (`-32602`), then `tools/list` still answers; (4) `JSON.stringify(result).length ≤ 50,000`, the value printed (`console.info` in the spec, quoted in `compliance.md`); (5) a docs root without `index.json`: initializes, `resources/list` `[]`, no `resources` capability (P9), one stderr line (`vi.spyOn(process.stderr, 'write')`); (7) lazy bodies: temp docs root with `index.json` (one id) and `overlays.json` `{}` and no body (P7): `initialize` + `resources/list` ok, `resources/read` → error whose message contains the id, then `tools/list` answers; (8) lazy bodies, the discriminating case (P7): temp docs root with `index.json` (one id) and **no `overlays.json`** (so `loadKnowledge` fails and `loadIndex` succeeds): `initialize` succeeds and reports `capabilities.resources`, `resources/list` contains `eligian://docs/<id>` (an eager `loadKnowledge` at startup would leave the list empty or fail to start), `resources/read` of it returns a JSON-RPC error, then `tools/list` answers.
- FR-024 / SC-013 part: `initialize` result has `capabilities.resources` and `capabilities.prompts`.
- P18: `it('an initialize sent at once reports the resources capability')`: `startInMemoryServer` over the generated docs root and an `initialize` sent with no wait or retry as the first frame; the result has `capabilities.resources` (repeated 20 times in a loop, each with a fresh server, so a race shows as a failure, not as flakiness).

**`mcp-prompts.spec.ts`** (new): SC-012 (1)–(4) (`prompts/list` = `[new-presentation]`, `idea` required; `prompts/get` with `idea: 'a title card'` → one user message containing it; the `docIds`/`tools`/regex/step checks against `NEW_PRESENTATION` and the generated index; `text('')` length minus 0 ≤ 4,096; missing and empty `idea` → `-32602`).

**`mcp-server.spec.ts`** (extended): SC-013 `it('tools/list matches the Phase 3 snapshot')` (`toMatchFileSnapshot`); `it('INSTRUCTIONS[MCP_PHASE] matches the Phase 3 snapshot')` (`expect(INSTRUCTIONS[MCP_PHASE]).toMatchFileSnapshot('__snapshots__/instructions-phase3.txt.snap')`, captured in G0 (a)), plus the existing `instructions` equality (`mcp-server.spec.ts:166`).

**`mcp-stdout.spec.ts`** (extended): the spawned-server case (`:196-250`) also sends `resources/list`, `resources/read` (`eligian://docs/storyboard`), `resources/read` of an unregistered URI (`eligian://docs/nope`, which must come back as one JSON-RPC error frame, FR-022), `prompts/get` before `eligian_check`; stdout stays pure NDJSON, every line a frame (SC-013, FR-022).

**`package-bin.spec.ts`** (unchanged assertion re-run): `mcp answers initialize in under 3 s` (`:147-148`) with the resource layer built (SC-013).

**CI inspector** (SC-011 (6)): `ci.yml` "MCP inspector gate" (`:66-70`) gains a second command `mcp-inspector --cli --method resources/list --format json node bin/cli.js mcp` piped to a `node -e` check that `eligian://docs/storyboard` is listed. The inspector accepts the method today (local run: `{"result":{"resources":[]}}`, exit 0; `prompts/list` likewise).

### Manual (Windows, `compliance.md`)

SC-001 (fresh window, extension active before the first chat, install-after-open, *MCP: List Servers*, 8 tools), SC-002 (setting off removes the server), SC-003 (1)/(2) (file server only, once), SC-004 (3) (browser timing: `dev-errors.json` `updated` − `performance.timeOrigin` ≤ 2 s), SC-007 (Cursor, when available; the reported cwd, R8).

## Build integration

### `packages/extension`
- `package.json`: A1. `pnpm install` updates `pnpm-lock.yaml` (`semver` 7.8.5 reused, `@types/semver` 7.8.0 added).
- `esbuild.mjs`, `.vscodeignore`: unchanged (`semver` is inlined into `out/extension/main.cjs`; `build-output.spec.ts` stays the allow-list check).
- `README.md`, `AGENTS.md`: D. The extension's `CHANGELOG.md` is the build copy (`build:prepare`), not edited.

### `packages/cli`
- No dependency, `files`, `exports` or version change. No `esbuild.mjs` change (new modules are bundled sources; `effect/ai` stays lazily imported from `server.ts`; `resources.ts` / `prompts.ts` take `ai` as a parameter, never import `effect/ai` statically).
- New script `scripts/capture-bundle-baseline.ts` (tsx; outside tsconfig and Biome like the other `scripts/`).
- README: D.

### Repo
- `CHANGELOG.md`, `AGENTS.md`: D. `.github/workflows/ci.yml`: the inspector `resources/list` step. `publish-cli.yml`: unchanged.

### Gates (in order; each output quoted in `compliance.md`)
1. `pnpm typecheck`
2. `pnpm run ci` ("No fixes applied", exit 0)
3. per group: `pnpm -C packages/cli exec vitest run <specs of the group>`, `pnpm -C packages/extension exec vitest run <specs>`
4. `pnpm effect:check:cli` (G2, G4 and last; in G4 it is part of the group gate, so a missing `unstableApiUsage:off` header in `resources.ts` / `prompts.ts` fails the group) and `pnpm effect:check` (last): 0 errors / 0 warnings / 0 messages
5. `pnpm -C packages/cli build` before any spec that spawns `bin/cli.js` (`fresh-bundle.ts` fails stale bundles)
6. `pnpm exec tsx packages/cli/scripts/capture-bundle-baseline.ts --diff` (G2, G7)
7. `pnpm run check:examples`, `pnpm run smoke:examples`, `pnpm run fmt:examples`
8. `pnpm test`, then `pnpm test:coverage:ci` (CLI 77.1 / 77.6 / 64.5 / 76.6 and language 79.8 / 80 / 69.9 / 79 met, thresholds unchanged)
9. the inspector `resources/list` command locally
10. `pnpm -C packages/extension run package` and `build-output.spec.ts` on the built tree

## Risks and mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Concurrency on the Langium singleton** | Resources and the prompt never touch the compiler services or `compiler-lock.ts`; they read only the knowledge cache (`loadKnowledge`, shared, read-only after the first load). `mcp-concurrency.spec.ts` unchanged. |
| R2 | **jsdom globals** | `dev-server.ts` imports only `smoke/engine-error-format.ts` (no jsdom, no `dom-environment.ts`), so the dev command loads no jsdom. SC-004 (2) uses its own `JSDOM` instance and `dom.window.eval`, never smoke's process-wide window; the extension specs run in vitest's jsdom env as today. |
| R3 | **stdout pollution (MCP)** | The missing-docs line uses `process.stderr.write`; resource and prompt handlers log nothing; the global redirect (`stdio.ts`) still covers third-party writes. `mcp-stdout.spec.ts` re-runs with the new methods. `dev` prints through `log` (its terminal), unrelated to MCP. |
| R4 | **Startup time and the capability race** | One extra 40 KB `index.json` parse, awaited in `makeServerLayer` before any layer is built (P18), so registration does no I/O and `initialize` always sees the resources; bodies lazy. `package-bin.spec.ts`'s < 3 s initialize assertion is the gate. The extension does no spawn and no network at activation; its checks run after `activate` returns. |
| R5 | **Windows paths and renames** | Definitions use `Uri.joinPath(...).fsPath` (drive letter, backslashes); the specs build expectations with `path.join`. `writeDevErrors` retries `rename` on `EPERM`/`EBUSY`/`EACCES` (5 × 20 ms; libuv opens readers with share-delete, but scanners can hold files). The terminal location is `path.relative(root, file)`; the file stores absolute paths. |
| R6 | **Coverage thresholds (CLI)** | New CLI code (`runtime-reports.ts`, the route in `dev-server.ts`, `engine-error-format.ts`, `resources.ts`, `prompts.ts`, the hook) is exercised by the specs above; `client-runtime.ts` stays excluded (a string). `test:coverage:ci` after the last group; G0 baseline for comparison. No language change, so the language thresholds cannot move. |
| R7 | **`effect/ai` is `@stability unstable`** | `effect` is pinned (4.0.7); the static `resource` / `prompt` overloads and their error mapping were read in the installed dist (P8, P9); in-process specs and the inspector gate cover both. `resources.ts` / `prompts.ts` carry the `// @effect-diagnostics unstableApiUsage:off` header of the existing `effect/ai` modules (`unstableApiUsage` defaults to `warning` in @effect/tsgo, and `--strict` fails on warnings); `effect:check:cli` in the G4 gate catches a missing one. |
| R8 | **Cursor has no `cwd`** (P2) | The server's path policy accepts absolute paths and MCP roots (§2); the README says so; the manual check records the cwd. If Cursor also implements the `lm` API one day, the Cursor branch still wins (I-3), so no double registration. |
| R9 | **The watcher misses an install** (P3) | Ancestor watchers + one 3 s follow-up check; SC-001's install-after-open step in the real editor; the `version` field makes VS Code refresh on upgrades. |
| R10 | **esbuild renames or reflows the hook** (P4) | Distinctive names; SC-010 (1) asserts exactly one verbatim occurrence in every example bundle and in the test bundle; `--minify` is outside SC-010 by design. |
| R11 | **`dev` route abuse** | Origin check (403), 64 KiB cap, schema check, 100-entry cap, nothing evaluated from bodies; the server listens on `localhost` only (`listen`, `dev-server.ts:333`). |
| R12 | **Plain install keeps an old lockfile pin** (FR-036) | A folder declaring `^1.0.0` with a lockfile at 1.0.3 reinstalls 1.0.3; the prompt does not loop (once per activation), and the README's Install paragraph says to run `<pm> add -D eligian@^1.1` then. |
| R13 | **Bundle baseline machine dependence** | Captured and diffed from the repo root on the same machine within the phase (P5, P6); not a perpetual test. |

## Complexity tracking

None.

## Open questions

None. The spec's three [UNVERIFIED] rows are settled in P1 (activation event), P2 (Cursor shape) and P3 (non-existent base).

## Review notes

Plan review round 1 (2026-11-06): all 15 issues applied; none rejected. Choices made inside a suggested resolution, and two partial disagreements with the issue's framing (the fix was applied anyway):

- Capability race (P18, C2, C4): the first resolution (await `loadIndex` in `makeServerLayer`, synchronous `docsResources(ai, docsRoot, entries)`); the transport-depends-on-registrations form is kept as the documented fallback should the immediate-`initialize` case ever fail.
- Build identity (B4): the identity is adopted in the `first` branch and immediately before `send('reload')`, so the CSS-only fallthrough (no stylesheet) mints a new `buildId`; SC-019 (5) added *(ruling 2026-11-06: the fallthrough is taken when the swapped style is empty)*.
- Atomic writes (SC-008 (7)): a pass-through `vi.mock('node:fs/promises')` with hoisted counters, not an injected `{ writeFile, rename }` parameter, because the property under test is the server's queue (no two renames overlap across reports), which a unit test of `writeDevErrors` alone would not cover. The case also asserts the mock saw the renames, so it cannot pass vacuously.
- `own(args)` (B5): removed rather than recorded as a spec correction; FR-016 (c) stands as written.
- `endLine` / `endColumn` (B3): omitted (optional in FR-018), with an assertion that they are absent.
- FOLLOW_UP_MS (P3, A3): kept, recorded as an addition, positive case SC-016 (f); the ancestor watchers alone cannot see `bin/cli.js`.
- SC-020 user-profile file: written and asserted never read (fs path recorder), in addition to the `globalValue` check; not recorded as a correction, since the SC is met as written.
- Instructions snapshot: the issue says every existing test compares the value with itself. `mcp-instructions.spec.ts:157-168` does compare `INSTRUCTIONS[3]` with a text derived from `EXPECTED_PHASE_2`, so an edit would not pass all of them; the `toBe(text)` with `text = INSTRUCTIONS[3]` (`:149-153`) and `mcp-server.spec.ts:166` are self-comparisons, though. The file snapshot is added anyway, as the direct SC-013 measure.
- `effect:check:cli` in G4: Gates item 4 already listed G4; the plan now says so explicitly and ties it to the new `unstableApiUsage:off` headers.
