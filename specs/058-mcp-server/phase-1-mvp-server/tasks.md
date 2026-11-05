# Tasks: MCP server, Phase 1: MVP server (learn + check)

**Input**: `specs/058-mcp-server/phase-1-mvp-server/spec.md` (FR-001…FR-058, SC-001…SC-029, clarifications Q1–Q8 and OQ-*) and `plan.md` (corrections C1–C14, module design A1–A7 / B1–B6 / C1–C10, generator, test plan, build integration, gates, eval harness). Roadmap: `specs/058-mcp-server/roadmap.md` §7 "Phase 1 — MVP server: learn + check", §8 decisions 1–10.
**Branch**: `feat/mcp-server-roadmap`. Nothing in this list commits, pushes or opens a PR.

## How to read this list

- Tasks `T001…` are grouped into **ordered groups**. A group starts only when the previous group is done.
- **[P]** = parallel-safe inside its group: the task creates **new files only**, disjoint from every other [P] task of that group. A task that edits an existing file (a `package.json`, an `index.ts`, an `esbuild.mjs`, a workflow, `main.ts`, a spec file created by an earlier task, `AGENTS.md`) is never [P] and runs in the order written.
- Each task names the files, the **failing test written first** (spec file, `describe` / `it` names, exact assertions), the implementation intent, and the **verify** command(s). Canonical order per task: failing test (run it, see it red) → implement → `pnpm check` (Biome autofix) clean → the named tests pass. Effect code (everything under `packages/cli/src/mcp/`, `packages/cli/src/check/`) additionally `pnpm effect:check:cli` → 0 errors / 0 warnings; language changes `pnpm effect:check:language` → 0 / 0.
- Read `specs/TESTING_GUIDE.md` before writing the first test (Constitution XXV). Language tests that validate documents use `createTestContext()` (`packages/language/src/__tests__/test-helpers.ts:337`), `getErrors()` (`:496`), `setupCSSRegistry()` and the `DiagnosticSeverity` enum (`:248`); no magic severity numbers.
- Paths: Windows backslash paths for every file tool (`F:\projects\eligius\eligian\...`); POSIX paths in Bash (`/f/projects/eligius/eligian/...`). `$SCRATCH` in commands = the executing session's scratchpad directory, written with forward slashes and a drive letter (for example `export SCRATCH=C:/Users/<user>/AppData/Local/Temp/claude/<session>/scratchpad`) so that Node and Bash read the same path; never `/tmp`. Commands below run from the repo root in Bash. pnpm only (the eval harness and the SC-015 / SC-016 steps use `npm` inside temp *user* projects on purpose, plan "Constitution check" VIII).
- **Built-artifact precondition**: CLI tests resolve `@eligian/language` (and, from T019 on, `@eligian/language/mcp`) to the built `packages/language/dist/*.cjs`. After any language change run `pnpm -C packages/language build` before a CLI test. Tests that spawn `packages/cli/bin/cli.js` or read `dist/cli.mjs` need `pnpm -C packages/cli build` too; their vitest summary must show **0 skipped**.
- **Evidence**: raw outputs that the spec or plan says go "in `compliance.md`" are saved by the task to `specs/058-mcp-server/phase-1-mvp-server/baseline/<name>.txt` (a new file per task, so [P] tasks never share a file). The comply stage quotes them.
- **Shared Langium singleton**: outside the tests that deliberately exercise the lock (T044), never run `checkFiles` / `checkPaths` / `compileFile` calls concurrently in a test or script; await each before the next.
- **Static-import rule (FR-003)**: under `packages/cli/src/mcp/` only `import type` from `effect/ai`; values come through an `ai: EffectAi` parameter (`type EffectAi = typeof import('effect/ai')`); only `server.ts` runs `await import('effect/ai')`. No module may call `Tool.make` at top level. No `Effect.promise` in `src/mcp/` (plan C3): every I/O step is `Effect.tryPromise` / `Effect.try` with `catch: toToolError(op, path)`.

### Verified this session (typegraph / grep, tree at `448cd8b` + untracked `phase-1-mvp-server/`)

- `ts_module_exports packages/language/src/compiler/pipeline/check.ts`: `CheckSeverity` `:30`, **`CheckDiagnostic` `:34`** (plan and spec say `:32`; use the symbol, not the line), `CheckFileResult` `:44`, `CheckOptions` `:62`, `checkFiles: (filePaths: readonly string[], options?: CheckOptions) => Effect<readonly CheckFileResult[], never, never>` `:68`, `compileErrorCode` `:114`. `CheckDiagnostic` is re-exported at `packages/language/src/compiler/index.ts:91`.
- `ts_module_exports packages/cli/src/check/check-command.ts`: `CheckOptions` `:24`, `CheckOutcome` `:38`, `isLibrary` `:47`, `parseCheckFormat` `:53`, `parseMaxWarnings` `:58`, `expandPatterns: (patterns: readonly string[], cwd: string) => Promise<string[]>` `:68`, `runCheck: (patterns: readonly string[], options: CheckOptions) => Promise<CheckOutcome>` `:98`. `withLint` is a non-exported local at `:138` (`ts_navigate_to includeLocals`: 1 hit, `exportHits: 0`); it calls `lintFile` at `:152` and emits `code: 'compile-failed'` at `:162`.
- `ts_module_exports packages/cli/src/check/lint.ts`: only `lintFile: (file: string) => Promise<CheckDiagnostic[]>` `:12`.
- `ts_module_exports packages/cli/src/fmt.ts`: `FmtOptions` `:16`, `FMT_FORMATS` `:23`, `FmtOutcome` `:25`, `lineDiff` `:31`, `firstDifference` `:78`, `runFmt: (patterns, options: FmtOptions) => Promise<FmtOutcome>` `:89`.
- `ts_module_exports packages/cli/src/init.ts`: `InitOptions` `:14`, `InitOutcome` `:22`, `titleFromDirectory` `:28`, `runInit: (directory: string, options: InitOptions) => Promise<InitOutcome>` `:38`.
- `ts_module_exports packages/cli/src/compile-file.ts`: `CompileResult` `:55`, `compileFile: (inputPath: string, options?: CompileOptions) => Promise<CompileResult>` `:244`.
- `ts_module_exports packages/language/src/lsp/select-element-fix.ts`: `guessSelector` `:43`, `selectElementCodeActions: (document: LangiumDocument<AstNode>, diagnostics: readonly Diagnostic[]) => CodeAction[]` `:86`.
- `ts_module_exports packages/language/src/utils/timeline-lifecycle.ts`: `LifecycleKind` `:7`, `duplicateLifecycleMessage` `:10`, `lifecycleBlocks` `:14`. `ts_module_exports .../compiler/pipeline/services.ts`: `getOrCreateServices` `:37`. `ts_navigate_to SELF_RESOLVED includeLocals`: one local declaration, `runtime-values.ts:100`, `exportHits: 0`.
- `packages/cli/package.json`: `version` `1.0.1`, `files` `["bin/cli.js","dist/cli.mjs"]`, `dependencies.effect` `4.0.7`, devDependencies only `@eligian/language`, `@types/jsdom`. Root devDependency `tsx` `4.23.15`. `packages/cli/vitest.config.ts` thresholds 77.1 / 77.6 / 64.5 / 76.6. No `packages/cli/scripts/` and no `packages/cli/src/__tests__/__snapshots__/` exist yet.
- `packages/cli/esbuild.mjs`: `WORKSPACE_SOURCES` `:32-37`, production `rmSync(dist)` `:79`, `define` `:90-93`, `external` `:95`. `packages/language/esbuild.mjs`: contexts at `:32-34` (`index.cjs`), `:48-50` (`errors`), `:66-68` (`eligius-lint`), list `const contexts = [ctxCjs, ctxErrors, ctxLint]` `:80`. `packages/language/package.json` `exports` `.`, `./errors`, `./eligius-lint` (`:16-29`).
- `packages/cli/src/main.ts`: epilogue `:285` (`… (compile, check, fmt, smoke, dev, init) for its options.`), `check` `:290`, `--no-lint` `:296`, `--selector-not-in-layout` `:298`, `compile` `isDefault` `:458`.
- `package-bin.spec.ts`: `built` `:28`, `hasMcp` `:31-33`, initialize test `:116`, lazy-import test `:168`, pack test `:182`. `init.spec.ts:40-49` asserts `^${major}.0.0`. `starters.ts:118` `eligian: '^1.0.0'`. Root `package.json:25` `check:examples`; `.github/workflows/ci.yml:78-79` `pnpm run check:examples --format github`; `publish-cli.yml:86-92` "Try the package".
- `effect@4.0.7` (`packages/cli/node_modules/effect/dist`): `McpServer.layerStdio` `McpServer.d.ts:249`, `toolkit` `:388`; `Tool.make` `Tool.d.ts:896`, `Meta` `:1336`, `Readonly` `:1361`, `Destructive` `:1385`, `Idempotent` `:1410`; `McpProtocol.v2025_11_25` `:184`, `v2025_06_18` `:192`; `Logger.withConsoleError` `:270`, `formatSimple` `:401`, `layer` `:828`; `Effect.catchDefect` `:5362`; `Stdio.make` `:130`; `Semaphore.make` `:235`; `McpServer.js:1525-1526` (an `Error` declared failure becomes a plain-text `toolErrorResult`, plan C2).
- `packages/cli/src/check/reporters.ts:111-123`: `formatJson` = `JSON.stringify({ files, summary }, null, 2)`, diagnostics spread minus `file` (`:116`).
- `biome.json` `files.includes`: `packages/**/*.ts`, `packages/**/*.json` (only folders named `fixtures` are excluded, not `__fixtures__` or `__snapshots__`). Consequence below.

### Deviations from the plan fixed here (recorded for `compliance.md`)

- **D1. File snapshots written by `toMatchFileSnapshot` end in `.snap`**, not `.json`: `did-you-mean-messages.json.snap`, `check-json-data.json.snap`, `probes/<chunk>-<n>.json.snap`. Reason: Biome formats every `packages/**/*.json` (`biome.json` `files.includes`) and collapses short arrays, so `pnpm check` would rewrite a `.json` snapshot and break vitest's raw string comparison. `.snap` is outside Biome's includes (`ignoreUnknown: true`). The one CLI-redirected snapshot, `check-json-before.json`, keeps its name and is compared canonically (`stdout === JSON.stringify(JSON.parse(snapshot), null, 2)`), which is exact because `formatJson` is `JSON.stringify(…, null, 2)`.
- **D2. Tool specs test the handler first, the wire second.** `server.ts` registers all five tools, so it can only be built after them. Each tool task (Group 16) writes its spec against `handle(params, context)`; T043 then appends the wire-level cases (FR-005 text shape, `isError` kinds, JSON-RPC -32602) through the in-process client to the same spec files. Every SC assertion of the plan's test table still lands in the spec file the plan names.
- **D3. Extra unit specs for coverage**: `mcp-errors.spec.ts`, `mcp-compiler-lock.spec.ts`, `mcp-telemetry.spec.ts`, `mcp-render.spec.ts`, `mcp-instructions.spec.ts`, `mcp-diagnostics.spec.ts`, `mcp-search.spec.ts`, `fmt-files.spec.ts`, `packages/language/src/utils/__tests__/timeline-lifecycle.spec.ts`. They are new files beside the plan's specs; nothing in the plan's specs moves.

---

## Group 1 — Build the pre-change tree

- [ ] **T001** Build everything before any change, so the Step 0 baselines measure the real tree (plan "Sequencing", Step 0).
  - Files: none edited. Create the directory `specs/058-mcp-server/phase-1-mvp-server/baseline/`.
  - Run: `git status --short` (only `specs/058-mcp-server/phase-1-mvp-server/` may be untracked), `pnpm install` (no lockfile change), `pnpm build`.
  - Verify: exit 0; `ls packages/cli/dist/cli.mjs packages/cli/LICENSE packages/language/dist/index.cjs` lists all three. Save `git rev-parse HEAD` and the last 5 build lines to `baseline/build-before.txt`.

---

## Group 2 — Step 0 baselines (no source edits)

- [ ] **T002** [P] SC-008 Step 0a: the CLI JSON of a diagnostic without `data`.
  - Create `packages/cli/src/__tests__/__snapshots__/check-json-before.json`.
  - Run from the repo root: `node packages/cli/bin/cli.js check packages/cli/src/__tests__/__fixtures__/warning-only.eligian --format json > packages/cli/src/__tests__/__snapshots__/check-json-before.json; echo "exit $?" > specs/058-mcp-server/phase-1-mvp-server/baseline/check-json-before-exit.txt`
  - Verify: the file parses (`node -e "JSON.parse(require('fs').readFileSync('packages/cli/src/__tests__/__snapshots__/check-json-before.json','utf8'))"`); it holds exactly one warning (the `raf` + `from` provider warning of `warning-only.eligian:13`) and no `data` key. Later comparisons are canonical (D1), so a Biome reformat of this file does not matter.

- [ ] **T003** [P] SC-006 Step 0b: the four "Did you mean" messages, before (FR-014, FR-045).
  - Create `packages/language/src/__tests__/did-you-mean-data.spec.ts` and, by running it, `packages/language/src/__tests__/__snapshots__/did-you-mean-messages.json.snap` (D1).
  - Test: `describe('suggestions as data')` with `createTestContext()` in `beforeAll` and `setupCSSRegistry()` in `beforeEach` (CSS with at least `.button`, `.active`, `#header`); one small program per code: an unknown operation `adClass("x")` → `unknown_operation`; `addClass("buttn")` → `unknown_css_class`; `selectElement(".buttn")` → `unknown_css_class_in_selector`; `selectElement("#headr")` → `unknown_css_id_in_selector`.
    - `it('messages are unchanged')`: collect `{ code, message }` of the one diagnostic per program (by `data.code` / `code`), `expect(JSON.stringify(list, null, 2)).toMatchFileSnapshot('./__snapshots__/did-you-mean-messages.json.snap')`.
    - `it("data.suggestions equals the message's list")`: for each diagnostic, parse the names out of the message's `Did you mean: …?` part and `expect(diagnostic.data?.suggestions).toEqual(names)`; also non-empty. **Red until T015.**
  - Run: `pnpm -C packages/language exec vitest run src/__tests__/did-you-mean-data.spec.ts -t "messages are unchanged"` (writes the snapshot), then the whole file (the second `it` must fail on `data.suggestions` undefined, nothing else). Save both summaries to `baseline/did-you-mean-before.txt`.
  - Verify: the snapshot holds 4 entries, one per code.

- [ ] **T004** [P] SC-009 Step 0c: `fmt:examples` output, before.
  - Run: `pnpm run fmt:examples > specs/058-mcp-server/phase-1-mvp-server/baseline/fmt-examples-before.txt 2>&1; echo "exit $?" >> specs/058-mcp-server/phase-1-mvp-server/baseline/fmt-examples-before.txt`
  - Verify: the file ends with `exit 0`.

- [ ] **T005** [P] Step 0d: coverage, before.
  - Run: `pnpm -C packages/language test:coverage:ci 2>&1 | tail -40 > specs/058-mcp-server/phase-1-mvp-server/baseline/coverage-language-before.txt` and `pnpm -C packages/cli test:coverage:ci 2>&1 | tail -40 > specs/058-mcp-server/phase-1-mvp-server/baseline/coverage-cli-before.txt`.
  - Verify: both exit 0 and their "All files" rows are at or above language 79.8 / 80 / 69.9 and CLI 77.1 / 77.6 / 64.5 / 76.6.

---

## Group 3 — Day-1 spike: go / no-go (FR-002a, SC-024; shared: `packages/cli/package.json`, `main.ts`)

Sequential. No Group 16 (tools) task may start before T008 records **go**.

- [ ] **T006** Dev dependencies (FR-049; plan "Build integration"). RULING 2026-11-04: `pnpm-workspace.yaml` `allowBuilds` gains `'@modelcontextprotocol/inspector': false` (done in the main loop; `pnpm install --frozen-lockfile` exits 0 again). The task is complete as executed.
  - Run: `pnpm view @modelcontextprotocol/inspector version bin engines` (expect 2.13.0 or later; save to `baseline/inspector-version.txt`), then `pnpm -F eligian add -D -E @modelcontextprotocol/inspector@<that version> tsx@4.23.15`.
  - Verify: `packages/cli/package.json` `devDependencies` lists both with exact versions; `pnpm -C packages/cli exec mcp-inspector --help` (or the bin the `bin` field names) prints usage, saved to `baseline/inspector-help.txt`; `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts` passes as before (devDependencies are not bundle imports).

- [ ] **T007** `src/mcp/stdio.ts` for real (FR-004; plan C1).
  - Files (new): `packages/cli/src/mcp/stdio.ts`, `packages/cli/src/__tests__/mcp-stdout.spec.ts`.
  - Failing test first: `describe('stdout carries only protocol frames')` › `it('redirectConsoleToStderr routes every writer')`: stub `process.stdout.write` and `process.stderr.write` with recorders (restore in `finally`, and restore `console.*`); call `redirectConsoleToStderr()`; call `console.log('L')`, `console.info('I')`, `console.debug('D')`, `console.warn('W')`, `console.error('E')`, `process.stdout.write('S')`; assert all six strings reached the stderr recorder and none the stdout one; the returned `write('F')` reached the original stdout recorder; a second call is idempotent (returns a writer to the same original).
  - Implement exactly plan C1: `CapturedStdout`, `redirectConsoleToStderr()`, `layerNodeStdio(stdout)` = `Layer.succeed(Stdio.Stdio, Stdio.make({ args, stdin, stdout, stderr }))` over `Stream.fromAsyncIterable(process.stdin, …PlatformError.systemError(…))` and `Sink.forEach`; `stderrLoggerLayer = Logger.layer([Logger.withConsoleError(Logger.formatSimple)])`. Look up `PlatformError.systemError`'s fields in `effect/dist/PlatformError.d.ts` before writing it.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-stdout.spec.ts`; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T008** The spike: throwaway server, evidence, verdict.
  - Files: new throwaway `packages/cli/src/mcp/spike.ts`; temporary `mcp-spike` command in `packages/cli/src/main.ts` (`program.command('mcp-spike').action(async () => (await import('./mcp/spike.js')).runSpike())`, before the default `compile` command at `:458`).
  - `spike.ts`: `await import('effect/ai')`; two tools via `Tool.make`: `spike_big` annotated `.annotate(Tool.Meta, { 'anthropic/maxResultSizeChars': 200000 })` returning `{ header, text }` with a 60,000-char `text`; `spike_upfront` with `{ 'anthropic/alwaysLoad': true }` + `.annotate(Tool.Readonly, true)`, parameters `{ ids: Schema.Array(Schema.String).check(Schema.isMaxLength(6)) }` (S2); its handler reads `Effect.serviceOption(McpSchema.McpServerClient)` and, when `Some`, `listRoots()` (S1) and returns what it found. Server = `McpServer.layerStdio({ name: 'eligian-spike', version, instructions: 'spike instructions', protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18] })` + `McpServer.toolkit`, provided `stderrLoggerLayer` and `layerNodeStdio(redirectConsoleToStderr())` (T007).
  - Run `pnpm -C packages/cli build`, then record each item in `baseline/spike.md` (commands verbatim, outputs verbatim, dated):
    1. Inspector `tools/list` against `node packages/cli/bin/cli.js mcp-spike` (find the 2.x CLI syntax first: S3; record the exact working command line): both `_meta` objects verbatim, `annotations.readOnlyHint: true`, `inputSchema.properties.ids.maxItems === 6` (S2).
    2. `claude mcp add eligian-spike -- node <abs repo>\packages\cli\bin\cli.js mcp-spike`, `claude mcp list` → connected. Remove it afterwards with `claude mcp remove eligian-spike`.
    3. `claude -p "<prompt calling spike_upfront then spike_big>" --mcp-config <tmp .mcp.json> --strict-mcp-config --output-format stream-json --verbose`: the init event field that lists the tools / instructions; whether `spike_upfront` was loaded without a tool search; whether `spike_big`'s 60,000 chars arrived inline. Also whether `--output-format json` carries the per-tool-call transcript (FR-051 [UNVERIFIED]).
    4. The negotiated `protocolVersion` per client (inspector's printed `initialize` result; for Claude Code a throwaway stdio tee script in the scratchpad, not committed).
    5. The wire encoding of a tool result (`structuredContent`, the single text item) and of a declared failure (plan C2).
    6. S1: whether `McpServerClient` is `Some` inside the handler, and `listRoots()` against a raw NDJSON client script (scratchpad) that advertises `capabilities.roots` and answers `roots/list`. If `None`: record the deviation (cwd root only, FR-007) for T030.
    7. How the process ends on stdin EOF (plan C10 `runServer`): does `Layer.launch` end, or is `process.stdin.once('end', …)` needed? Record the mechanism T041 must use.
  - Verdict: **go** keeps `effect/ai` (decision 1). **No-go** (a failure on `_meta`, annotations or protocol negotiation): stop here, write the evidence and "no-go" into `## Defects found`, and report; the remaining groups need re-planning onto the official SDK (FR-002a fallback).
  - Verify: `baseline/spike.md` holds items 1–7 and a dated verdict line `VERDICT: go` (or `no-go`).

- [ ] **T009** Remove the spike (plan "Day 1": deleted before Day 3).
  - Delete `packages/cli/src/mcp/spike.ts` and the `mcp-spike` command.
  - Verify: `git diff -- packages/cli/src/main.ts` empty; `test ! -e packages/cli/src/mcp/spike.ts`; `pnpm -C packages/cli build` exit 0; `node packages/cli/bin/cli.js --help | grep -c mcp-spike` → 0.

---

## Group 4 — Day 2: the one-case eval harness (FR-050–FR-052; new files only, outside Biome and every tsconfig)

- [ ] **T010** [P] Case 13 `fix-dataflow` start state (FR-052; plan "Eval harness").
  - Files (new): `evals/mcp/cases/fix-dataflow.json` (`{ id, prompt, entry: 'main.eligian', model }`; the prompt asks the agent to fix the project until `eligian check` is clean without deleting behaviour), `evals/mcp/cases/fix-dataflow/start/main.eligian` (+ `layout.html`, `styles.css`, `locales.json` only if the program needs them).
  - Content: an inline event whose **end** block calls an action whose body runs `addClass` with nothing selected (`missing-action-dependency`, `operation-dataflow.ts:395-399`), and an action that reads a parameter after an operation that erases it (`erased-property-access`).
  - Verify: `node packages/cli/bin/cli.js check evals/mcp/cases/fix-dataflow/start/main.eligian --selector-not-in-layout ids --format json` → the sorted set of `code`s is exactly `["erased-property-access","missing-action-dependency"]` (save output to `baseline/case13-start.txt`). If a planted defect yields another code, change the fixture until it holds (plan "Eval harness" last paragraph).

- [ ] **T011** [P] Case 14 `fix-selectors` start state (FR-052; plan C13).
  - Files (new): `evals/mcp/cases/fix-selectors.json`, `evals/mcp/cases/fix-selectors/start/{main.eligian,layout.html,styles.css,extra.css}`.
  - Content: a `layout` import; selectors used **only in CSS** (ids absent from `layout.html`), inside an action declared before the timeline; two `styles` imports (the second ends with `// eval:defect`); an `on enter` that adds a controller with no removal in `on leave`; a bare `on click …` as the **last** item of the timeline body, ending with `// eval:defect`.
  - Verify: `node packages/cli/bin/cli.js check evals/mcp/cases/fix-selectors/start/main.eligian --selector-not-in-layout ids --format json` → codes exactly `["import-duplicate-default","selector_not_in_layout","syntax-error"]` (save to `baseline/case14-start.txt`). The controller defect is proven by T045 once `controller-imbalance` exists.

- [ ] **T012** [P] `evals/mcp/run.ts` and `evals/mcp/gate.ts` (FR-050, FR-051; plan "Eval harness").
  - Files (new): `evals/mcp/run.ts`, `evals/mcp/gate.ts`, `evals/mcp/results/.gitkeep`. Import nothing from `packages/**/src` (FR-050).
  - `run.ts --case <id> --arm A1 [--model <m>]`: `pnpm -C packages/cli pack` once; per case `fs.mkdtempSync`; `npm init -y` + `npm install <abs tarball>` (`shell: process.platform === 'win32'`); copy `cases/<id>/start/**`; `.mcp.json` → `node <tmp>/node_modules/eligian/bin/cli.js mcp`; `AGENTS.md` from `<tmp>/node_modules/eligian/dist/docs/agents-block.md`; `ELIGIAN_MCP_LOG=<tmp>/mcp.log`; the `claude -p` command of FR-050 (output format per T008 item 3); then `gate.ts`; result JSON under `evals/mcp/results/<run-id>/<case>.json` with `pass`, `rounds` + its two source counts, tool-call count and sequence, tokens-from-tools (sum of `chars` in `mcp.log`), wall time, model, run id, `git rev-parse HEAD`, and whether `git status --porcelain -- . ':!evals/mcp/results'` is empty.
  - `gate.ts <project dir> --case <id>`: FR-051 steps 1–5 with `spawnSync(process.execPath, [<dir>/node_modules/eligian/bin/cli.js, …])`; the case 13 / 14 checks over `out/config.json` (plan "Eval harness"); a ~40-line copy of the `controllerBalance` walk marked `// copy of packages/language/src/compiler/controller-balance.ts (harness imports no src)`. Exit 0 = pass; prints one JSON line `{ pass, failures: [...] }`.
  - Verify (plumbing only; the agent runs are T067): `pnpm exec tsx evals/mcp/run.ts --help` prints usage; with the current 1.0.1 build, `pnpm -C packages/cli pack`, install it into a scratchpad dir, copy `fix-dataflow/start`, run `pnpm exec tsx evals/mcp/gate.ts <dir> --case fix-dataflow` → exit ≠ 0 with a failure naming step 1 (check). Save the output to `baseline/gate-plumbing.txt`; delete the scratch tarball (`packages/cli/eligian-*.tgz`).

---

## Group 5 — Language: quick-fix edit, `data`, suggestions (sequential; existing files)

- [ ] **T013** A2 `selectElementFix` (FR-013; plan A2).
  - Files: edit `packages/language/src/lsp/select-element-fix.ts`; new `packages/language/src/lsp/__tests__/select-element-fix.spec.ts`.
  - Failing test first: `describe('selectElementFix')` with `createTestContext()`:
    - `it('block branch')`: program with `at 0s..1s [ ] [ addClass("x") ]` (layout/CSS as needed); take the `missing-dependency` diagnostic about `'selectedElement'`; `selectElementFix(document, diagnostic)` returns `range.start` deep-equal `range.end` (an insertion) and `newText` starting with `selectElement(`.
    - `it('target branch')`: the fixture the existing `timeline/__tests__/target-and-with.spec.ts` uses for *Add target*; the fix's `title` starts with `Add target` and `newText` contains `target "`.
    - `it('code actions unchanged')`: for both documents, `selectElementCodeActions(document, diagnostics)` deep-equals the `CodeAction`s built from `selectElementFix` (same `title`, `kind`, `isPreferred`, `edit`).
    - `it('no fix for other diagnostics')`: an `unknown_operation` diagnostic → `undefined`.
  - Implement: export `SelectElementFix` and `selectElementFix(document, diagnostic)` from today's loop body (`:86-150`: the `DEPENDENCY_CODES` / `'selectedElement'` filter `:27`, `:95-96`; the `target` branch `:105-126`; the block branch `:128-148`); `selectElementCodeActions` maps each fix to the same `CodeAction`.
  - Verify: `pnpm -C packages/language exec vitest run src/lsp/__tests__/select-element-fix.spec.ts src/timeline/__tests__/target-and-with.spec.ts` (the second unchanged and green); `pnpm check`.

- [ ] **T014** A1 `CheckDiagnostic.data` (FR-011, FR-012, FR-013; plan A1).
  - Files: edit `packages/language/src/compiler/pipeline/check.ts`, `packages/language/src/compiler/index.ts` (beside `type CheckDiagnostic` at `:91`), `packages/language/src/compiler/__tests__/check-files.spec.ts`.
  - Failing tests first, in `check-files.spec.ts` › `describe('checkFiles')` (use that file's existing helpers; files written to a temp dir):
    - `it('copies data.suggestions')`: an `on clik "#b" play` interaction (`unknown_dom_event`, `navigate-validator.ts:85` sets `data.suggestions`) → `diagnostic.data.suggestions` is a non-empty `string[]` containing `click`.
    - `it('adds a 1-based quickFix')`: `at 0s..1s [ ] [ addClass("x") ]` → the `missing-dependency` diagnostic has `data.quickFix` with `line === endLine`, `column === endColumn`, numbers ≥ 1, `newText` containing `selectElement(`; equal to `selectElementFix`'s range `+1` on line and character.
    - `it('no data key when there is nothing')`: a diagnostic with neither → `'data' in diagnostic` is `false`.
  - Implement plan A1: export `QuickFix`, `CheckDiagnosticData`; `CheckDiagnostic.data?`; in the conversion inside `validateFiles` add `data` only when `suggestions` (a `string[]`) or `quickFix` exists. Re-export both types beside `CheckDiagnostic` in `compiler/index.ts`.
  - Verify: `pnpm -C packages/language exec vitest run src/compiler/__tests__/check-files.spec.ts`; `pnpm -C packages/language build && pnpm -C packages/cli build`; `node packages/cli/bin/cli.js check packages/cli/src/__tests__/__fixtures__/warning-only.eligian --format json > $SCRATCH/after.json; node -e "const fs=require('fs');const a=fs.readFileSync('$SCRATCH/after.json','utf8');const b=JSON.stringify(JSON.parse(fs.readFileSync('packages/cli/src/__tests__/__snapshots__/check-json-before.json','utf8')),null,2);process.exit(a.trimEnd()===b?0:1)"` → exit 0 (byte-identical, SC-008); `pnpm -C packages/cli exec vitest run src/__tests__/check-command.spec.ts src/__tests__/cli-warnings.spec.ts`; `pnpm effect:check:language` 0/0.

- [ ] **T015** A3 suggestions as data at the three MUST sites (FR-014; plan A3).
  - Files: edit `packages/language/src/validators/operation-call/operation-existence-validator.ts` (`data: { suggestions: error.suggestions }` beside the existing `code`), `validators/operation-call/css-parameter-validator.ts` (the role branch and `checkClassNameParameter`: `data: { code: diagnosticCode('unknown_css_class'), suggestions }`), `css/selector-validation.ts` `reportSelectorIssues` (class and id branches). Messages untouched byte for byte.
  - Failing test: T003's `it("data.suggestions equals the message's list")` (red now).
  - Verify: `pnpm -C packages/language exec vitest run src/__tests__/did-you-mean-data.spec.ts` (both `it`s green, the `.snap` unchanged: `git status --short packages/language/src/__tests__/__snapshots__` shows only the untracked new file, no modification after T003); `pnpm -C packages/language exec vitest run src/css` (CSS validation and `did-you-mean-fix` tests green). Save to `baseline/may-sites.txt` the three MAY sites left without `data.suggestions` (`event-action-validator.ts:160-171`, `import-validator.ts:234-246`, `label-id-validation.ts:68-82`).

---

## Group 6 — Language: the controller walker (new files only)

- [ ] **T016** [P] A4 `controller-balance.ts` (FR-028, FR-030; plan A4, C8).
  - Files (new): `packages/language/src/compiler/controller-balance.ts`, `packages/language/src/compiler/__tests__/controller-balance.spec.ts`.
  - Failing tests first (hand-built `IEngineConfiguration` fragments; `import type { IEngineConfiguration } from 'eligius'`):
    - `describe('resolveOperationData')` › `it('resolves $operationdata references deeply')`: `{ a: '$operationdata.x', b: ['$operationdata.y'] }` with `{ x: 1, y: 'z' }` → `{ a: 1, b: ['z'] }`; other strings unchanged.
    - `describe('walkOperations')` › `it('tracks selection, controllers and classes')` (selectElement → getControllerInstance → addControllerToElement gives one `controller-added` with that selector and name; addClass / removeClass / toggleClass give `class-*` events with `at` = the top-level index); › `it('substitutes arguments')` (requestAction + startAction with `actionOperationData: { view: '#a' }` into an action whose `selectElement` uses `'$operationdata.view'` → the event's `selector === '#a'`; the caller's data is copied, nothing flows back); › `it('records unresolved calls')` (an unknown action name and a self-calling action → `unresolved` names both, no throw).
    - `describe('controllerBalance')` › `it('lifecycle adds and removes per timeline')` (the `timeline-lifecycle` action's start ops add, end ops remove; `added` / `removed` sorted `${selector} ${controller}` strings) › `it('a timeline without lifecycle gets empty lists')`.
  - Implement plan A4 exactly (types `OperationData`, `WalkedOperation`, `WalkEvent`, `WalkResult`, `ControllerBalance`), lifted from `tour-controllers.spec.ts:38-136` (`resolve`, `walk`, `balance`), with `unresolved` instead of throwing (C8; depth limit 20).
  - Verify: `pnpm -C packages/language exec vitest run src/compiler/__tests__/controller-balance.spec.ts`; `pnpm check`.

---

## Group 7 — Language: walker consumers and lifecycle points (sequential; existing files)

- [ ] **T017** `tour-controllers.spec.ts` uses the lifted walker (FR-028, C8).
  - Edit `packages/language/src/compiler/__tests__/tour-controllers.spec.ts`: delete the local `resolve` / `walk` / `balance` (`:38-136`), call `controllerBalance(config)`, keep its three tests, and add `expect(entry.unresolved).toEqual([])` for every timeline.
  - Verify: `pnpm -C packages/language exec vitest run src/compiler/__tests__/tour-controllers.spec.ts` → 3 passed; `grep -c "function walk\|function resolve" packages/language/src/compiler/__tests__/tour-controllers.spec.ts` → 0.

- [ ] **T018** A5 `lifecycleInsertionPoints` (FR-030 quick fix; plan A5).
  - Files: edit `packages/language/src/utils/timeline-lifecycle.ts`; new `packages/language/src/utils/__tests__/timeline-lifecycle.spec.ts`.
  - Failing tests first (parse with `createTestContext()`): `describe('lifecycleInsertionPoints')` › `it('with on leave')`: `leaveClose` is the 0-based position of that block's `]` (assert the source character at that offset is `]`) and `bodyClose` the timeline's `}`; `timeline` = the timeline's name; `indent` = the leading whitespace of the timeline's first line › `it('without on leave')`: `leaveClose` undefined › `it('one entry per timeline, in order')`.
  - Implement on `lifecycleBlocks(timeline)` (`:14`) and the CST: `$cstNode.range.end` minus one character (`eligian.langium:594-597`, `:614-615`).
  - Verify: `pnpm -C packages/language exec vitest run src/utils/__tests__/timeline-lifecycle.spec.ts`; `pnpm check`.

---

## Group 8 — The `@eligian/language/mcp` entry (sequential; shared: two `esbuild.mjs`, `packages/language/package.json`)

- [ ] **T019** A6 + A7: `SELF_RESOLVED` export and the entry (FR-036, FR-044, FR-045, SC-018).
  - Files: edit `packages/language/src/compiler/transformers/runtime-values.ts:100` (`const SELF_RESOLVED` → `export const SELF_RESOLVED`, type unchanged); new `packages/language/src/mcp.ts` (exactly plan A7's export list, including the type-only exports `ControllerMetadata`, `TimelineEventMetadata`); new `packages/language/src/__tests__/mcp-entry.spec.ts`; edit `packages/language/package.json` (`exports["./mcp"] = { "types": "./out/mcp.d.ts", "default": "./dist/mcp/index.cjs" }`), `packages/language/esbuild.mjs` (`ctxMcp`: `entryPoints: ['src/mcp.ts']`, `outfile: 'dist/mcp/index.cjs'`, the options of `ctxLint` `:66-77`; add to `contexts` `:80`), `packages/cli/esbuild.mjs` (`WORKSPACE_SOURCES['@eligian/language/mcp'] = '../language/src/mcp.ts'`).
  - Failing test first: `describe('@eligian/language/mcp')` › `it('exports exactly the list')`: `expect(Object.keys(await import('../mcp.js')).sort()).toEqual([...27 names of plan A7 "Runtime exports, exactly"])` › `it('types')`: a type-only import of `LayoutElements`, `SelectorNames`, `ParameterRole`, `TimelineSymbol`, `ControllerMetadata`, `TimelineEventMetadata`, `ControllerBalance`, `WalkEvent`, `WalkResult`, `LifecycleInsertionPoint` used in a `satisfies` / typed `const` so `typecheck:tests` checks it; › `it('SELF_RESOLVED marks broadcastEvent eventArgs')`: `SELF_RESOLVED.broadcastEvent` has `eventArgs`.
  - Verify: `pnpm -C packages/language exec vitest run src/__tests__/mcp-entry.spec.ts`; `pnpm -C packages/language build && ls packages/language/dist/mcp/index.cjs packages/language/out/mcp.d.ts`; `pnpm run typecheck:tests`; `pnpm effect:check:language` 0/0; `pnpm -C packages/language test:coverage:ci` ≥ 79.8 / 80 / 69.9 (if below, add tests for the new language code; never lower a threshold); `pnpm -C packages/cli build` exit 0.

---

## Group 9 — CLI check layer: compile, lint, fmt (sequential; existing files)

- [ ] **T020** B1 `CompileResult.program` + B2 `lintCompiled` (plan B1, B2, C4, C7).
  - Files: edit `packages/cli/src/compile-file.ts` (`CompileResult` gains `readonly program: Program`, from the already-parsed `const program: Program = parseExit.value`), `packages/cli/src/check/lint.ts`, `packages/cli/src/__tests__/check-lint.spec.ts`.
  - Failing tests first, in `check-lint.spec.ts` › `describe('eligian check: Eligius lint')`: `it('compileFile returns the parsed program')` (`(await compileFile(f)).program.$type === 'Program'`); `it('lintCompiled equals lintFile')` on the file of the existing `reports a lint error at the failing operation` test: `lintCompiled(f, await compileFile(f))` deep-equals `await lintFile(f)`.
  - Implement: `lintCompiled(file, compiled: Pick<CompileResult, 'config' | 'map' | 'host'>)` = today's `lintCompiledConfig` + `toDiagnostic` (`lint.ts:17-31`); `lintFile` keeps its signature as `lintCompiled(file, await compileFile(file))`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/check-lint.spec.ts src/__tests__/cli.spec.ts`; `pnpm typecheck`; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T021** B6 `fmtFiles`; `runFmt` over it (FR-024; plan B6).
  - Files: edit `packages/cli/src/fmt.ts`; new `packages/cli/src/__tests__/fmt-files.spec.ts`.
  - Failing tests first (temp copies): `describe('fmtFiles')` › `it('check mode reports and does not write')` (`formatted: false`, `lineDiff` equals `lineDiff(source, formatted)`, `firstDifference` set, bytes unchanged) › `it('write mode rewrites and sets written')` (`written: true`, then a check-mode call gives `formatted: true`) › `it('syntax error: error set, file untouched')` › `it('a failed write rejects with the fs error')` (`fs.chmodSync(file, 0o444)`; rejects with an error whose `code` is `EACCES` or `EPERM` and whose `path` is the file).
  - Implement plan B6 (`FmtFileResult`; `fmtFiles(files, { write })`; no catch around `fs.writeFile`); `runFmt` maps results to today's exact lines (`fmt.ts:96-128`).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/fmt-files.spec.ts src/__tests__/fmt.spec.ts` (`fmt.spec.ts` unchanged: `git diff --stat -- packages/cli/src/__tests__/fmt.spec.ts` empty); `pnpm -C packages/cli build && pnpm run fmt:examples > $SCRATCH/fmt-after.txt 2>&1; echo "exit $?" >> $SCRATCH/fmt-after.txt; diff $SCRATCH/fmt-after.txt specs/058-mcp-server/phase-1-mvp-server/baseline/fmt-examples-before.txt` → empty (save the diff result to `baseline/fmt-examples-after.txt`).

---

## Group 10 — Review pass v1 (new files only)

- [ ] **T022** [P] B3 `check/review.ts` (FR-030, SC-007; plan B3).
  - Files (new): `packages/cli/src/check/review.ts`, `packages/cli/src/__tests__/review.spec.ts`, fixtures `packages/cli/src/__tests__/__fixtures__/mcp/review/` (`layout.html`, `styles.css` with the classes / ids used, one `.eligian` per case below).
  - Failing tests first; each compiles with `compileFile` and calls `reviewConfig(compiled, file)`:
    - `describe('controller-imbalance')` › `it('with on leave')` (exactly one finding, `severity: 'warning'`, `code: 'controller-imbalance'`, `data.quickFix` inserts before the `on leave` `]`; apply it mechanically (replace the 1-based range with `newText` in a temp copy), recompile → 0 review findings and `checkFiles` → 0 errors) › `it('without on leave')` (the fix inserts a full `on leave [ … ]` block before the timeline's `}`; same re-check) › `it('removal without add: warning, no quickFix')`.
    - `describe('class-never-removed')` positives: `it('literal addClass never removed')`, `it('on enter add without on leave removal')`; negatives (`toEqual([])`): `it('removed in the same action end block')`, `it('removed in a later range')`, `it('toggled later')`, `it('removed in on leave')`, `it('on enter add paired with on leave removal')`, `it('parameterised showView / hideView calls')` (tour pattern), `it('non-literal selector on the add or the removal suppresses')` (`view + " .in"` and an unresolved parameter). Positive message equals `addClass("<class>") on "<selector>" is never removed in timeline "<uri>": remove it in the end block, a later range or on leave`.
    - `describe('the tour')` › `it('has no review finding')`: for each of `examples/eligian-tour/presentation.eligian`, `tour.eligian`: `reviewConfig(await compileFile(f), f)` → `[]`.
  - Implement plan B3 exactly: `REVIEW_CODES`, `ReviewCode`, `reviewConfig(compiled: Pick<CompileResult, 'config' | 'map' | 'program'>, file)`; imports `controllerBalance`, `walkOperations`, `lifecycleInsertionPoints` from `@eligian/language/mcp`; locations from `map.actions[id]`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/review.spec.ts`; `pnpm check`; `pnpm effect:check:cli` 0/0; `git diff --stat -- examples/eligian-tour` empty.

---

## Group 11 — Check command: shared check and 1.1.0 defaults (sequential; shared: `check-command.ts`, `main.ts`, root `package.json`, `ci.yml`)

- [ ] **T023** B4 `withCompiledChecks` + `checkPaths` (FR-023, FR-029, FR-030; plan B4, C4).
  - Files: edit `packages/cli/src/check/check-command.ts`, `packages/cli/src/__tests__/check-command.spec.ts`, `packages/cli/src/__tests__/review.spec.ts` (one `it`).
  - Failing tests first, `check-command.spec.ts` › `describe('withCompiledChecks')`: `it('review findings only when review is on')` (the `review/` imbalance fixture via `checkPaths([f], { lint: true, review: true })` has one `controller-imbalance`; with `review: false` none) › `it('lint findings still go to the library result')` (the library fixture of `check-lint.spec.ts` `a finding in a library action is reported in the library`, through `checkPaths`) › `it('runCheck reports what checkPaths returns')` (`runCheck([f], { format: 'json', lint: true, review: true, … })` JSON diagnostics equal `checkPaths`'). In `review.spec.ts` add `it('quick fix re-checked through checkPaths')`.
  - Implement plan B4: `CheckOptions.review?`, exported `CompiledChecks`, `withCompiledChecks(results, { lint, review })` (the `withLint` body `:138-176`, one `compileFile` per clean program, `lintCompiled` + `reviewConfig`, library merge unchanged, `compile-failed` unchanged), exported `checkPaths(files, { selectorNotInLayout, lint, review })`; `runCheck` = `expandPatterns` + `checkPaths` + the existing summary / format / exit logic, `review: options.review ?? false`.
  - Before the default flips (risk table, gate 6 first): `pnpm -C packages/cli build`, then run `pnpm exec tsx -e "import('./packages/cli/src/check/check-command.ts').then(async m => { const o = await m.runCheck(['examples/**/*.eligian','!examples/libraries/errors/**','!examples/libraries/nested/cycle-*.eligian','!examples/demo.eligian'], { format: 'pretty', lint: true, review: true, selectorNotInLayout: 'ids', maxWarnings: 0, cwd: process.cwd() }); console.log(o.output); process.exit(o.exitCode) })"` (adjust option names to `CheckOptions` `:24-36`) → exit 0, 0 warnings. Save to `baseline/examples-review-before-default.txt`. A review finding on an example is a review-rule defect (fix `review.ts`, never the example); note it in `## Defects found`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/check-command.spec.ts src/__tests__/check-lint.spec.ts src/__tests__/review.spec.ts src/__tests__/cli-library.spec.ts`; `pnpm effect:check:cli` 0/0.

- [ ] **T024** B5 CLI check defaults and the demo exclusion (FR-031, FR-054, SC-008, SC-025; plan B5, C14). RULING 2026-11-05: the `class-never-removed` false positive on `warning-only.eligian:14` is a review-rule defect, fixed under this task. The file list grows by `packages/cli/src/check/review.ts` (action map from `startOperations` and `endOperations`) and `packages/language/src/compiler/controller-balance.ts` (`walkOperations` follows `endAction` into the action's end block like `startAction`), plus an endable-action `it` in `review.spec.ts` (add in start block, remove in the action's end block, called with a range → 0 findings). The byte-identical test and the fixture are not changed. See `## Defects found`.
  - Files: edit `packages/cli/src/main.ts` (`--selector-not-in-layout` default `'off'` → `'ids'`; `.option('--no-review', 'skip the review pass (controller balance, classes never removed)')` beside `--no-lint` `:296`; `runCheck(…, { …, review: cmdOptions.review !== false })`; help text of both options); root `package.json:25` (`check:examples` = `node packages/cli/bin/cli.js check "examples/**/*.eligian" "!examples/libraries/errors/**" "!examples/libraries/nested/cycle-*.eligian" "!examples/demo.eligian" --max-warnings 0 && node packages/cli/bin/cli.js check examples/demo.eligian --selector-not-in-layout off`); `.github/workflows/ci.yml:78-79` ("Check examples" becomes those two `node packages/cli/bin/cli.js check …` lines, each with `--format github`); `check-command.spec.ts`, `package-bin.spec.ts`, `review.spec.ts`. New fixture `packages/cli/src/__tests__/__fixtures__/check-data/missing-select.eligian` (an `addClass` with nothing selected → `missing-dependency` with `data.quickFix`), plus the layout / CSS fixtures the cases need under `__fixtures__/check-data/`.
  - Failing tests first:
    - `check-command.spec.ts` › `describe('check defaults (1.1.0)')`: `it('a layout program with a CSS-only id warns with no flags')` (spawned bin, `test.skipIf(!built)`; `selector_not_in_layout` present) › `it('--selector-not-in-layout off removes it')` › `it('--no-review removes the review warnings')` › `it('no layout import, no not-in-layout warning')` › `it('JSON without data is byte-identical to before')` (bin stdout for `warning-only.eligian --format json` === `JSON.stringify(JSON.parse(<check-json-before.json>), null, 2)`, D1) › `it('JSON carries data when present')` (`missing-select.eligian --format json`, `expect(stdout).toMatchFileSnapshot('./__snapshots__/check-json-data.json.snap')`, and the parsed diagnostic has `data.quickFix`).
    - `package-bin.spec.ts` › `it('help names mcp and the check defaults')` (`test.skipIf(!built)`): `check --help` contains `--no-review` and `(default: "ids")`. (The `mcp` epilogue assertion is added in T042.)
    - `review.spec.ts` › `it('the tour checks clean with the defaults')` (`test.skipIf(!built)`): spawn `node packages/cli/bin/cli.js check examples/eligian-tour/*.eligian --max-warnings 0` (expand the glob in the test) → exit 0.
  - Verify: `pnpm -C packages/cli build && pnpm -C packages/cli exec vitest run src/__tests__/check-command.spec.ts src/__tests__/package-bin.spec.ts src/__tests__/review.spec.ts` (0 skipped except `mcp answers initialize`, still skipped until T042); `pnpm run check:examples` exit 0; `git diff --stat -- examples/demo.eligian examples/eligian-tour` empty; `pnpm effect:check:cli` 0/0.

---

## Group 12 — MCP core modules, part 1 (new files only)

- [ ] **T025** [P] `src/mcp/errors.ts` (FR-006; plan C2, C3).
  - Files (new): `packages/cli/src/mcp/errors.ts`, `packages/cli/src/__tests__/mcp-errors.spec.ts`.
  - Failing tests first: `describe('toToolError')` › `it('read: ENOENT is not-found')`, `it('read: EACCES is io')`, `it('write: ENOENT is io')`, `it('no errno code is internal')`, `it('path: given, else the fs error path')`; `describe('toToolFailure')` › `it('a plain object, header first')` (`Object.keys(failure)[0] === 'header'`, `error.kind` per tag, not `instanceof Error`); `describe('catchDefects')` › `it('a defect becomes ToolInternal and is logged')` (provide a recording logger with `Logger.layer`; the failure is `ToolInternal` with message `internal error: <msg>`; one log entry) › `it('interruption passes through')` (`Effect.interrupt` stays an interrupt, `Exit.hasInterrupts`).
  - Implement plan C3 (`ToolErrorKind`, `ToolNotFound` / `ToolIoError` / `ToolInternal` as `Data.TaggedError`, `ToolError`, `ToolFailure` `Schema.Struct` with `Schema.Literals` for `kind` and `Schema.optionalKey` for `path`, `toToolFailure`, `toToolError`, `catchDefects` via `Effect.catchDefect`).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-errors.spec.ts`; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T026** [P] `src/mcp/compiler-lock.ts` (FR-009, FR-010, FR-053; plan C2-lock).
  - Files (new): `packages/cli/src/mcp/compiler-lock.ts`, `packages/cli/src/__tests__/mcp-compiler-lock.spec.ts`.
  - Failing tests first: `describe('CompilerLock')` › `it('serialises sections')` (two `run`s of a section that sleeps 50 ms under `Effect.all(…, { concurrency: 'unbounded' })` → acquire / release intervals disjoint, from hooks) › `it('hooks report queued, acquire, release(completed) per id')` › `it('the latch holds a section after acquire')` › `it('a queued call interrupted leaves the queue and never acquires')` › `it('an acquired section runs to the end when interrupted')` (interrupt the fiber after `onAcquire`; the section's side effect happened; `onRelease(id, _, true)`; the next call's `onAcquire` ≥ that release) › `it('PassThrough does not serialise')` (intervals overlap).
  - Implement plan C2-lock: `CompilerLockHooks`, `class CompilerLock extends Context.Service<…>()('eligian/mcp/CompilerLock')` (the repo form, `compiler/effects/Logger.ts:22-50`), `makeCompilerLock(hooks?)` with `Semaphore.make(1)`, `withPermits(1)(Effect.uninterruptible(…))`, `CompilerLockLive`, `compilerLockLayer(hooks)`, `CompilerLockPassThrough`. No call counter, no reset hook (FR-053).
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0; `grep -nE "count|reset" packages/cli/src/mcp/compiler-lock.ts` → nothing that counts calls or resets services (save to `baseline/lock-grep.txt`, SC-026).

- [ ] **T027** [P] `src/mcp/telemetry.ts` (FR-008; plan C5, C12).
  - Files (new): `packages/cli/src/mcp/telemetry.ts`, `packages/cli/src/__tests__/mcp-telemetry.spec.ts`.
  - Failing tests first (spy `process.stderr.write`): `describe('telemetry')` › `it('one JSON line per call with t, tool, ms, chars, ok, args')` (`chars === JSON.stringify(result).length`) › `it('request ids count 1, 2, … per instance')` (two `makeTelemetry` instances both start at `'1'`) › `it('a failure is ok: false')` › `it('an interrupted call writes ok: false')` › `it('appends to the log file')` (temp file, 2 calls → 2 lines) › `it('an unwritable log file warns once and changes no result')` (log path inside a nonexistent dir: result unchanged, exactly one warning line naming the file, later calls do not retry).
  - Implement plan C5.
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T028** [P] `knowledge/types.ts`, `knowledge/lint-rules.ts`, `knowledge/render.ts` (FR-020, FR-036, FR-037; plan C7, C9-name).
  - Files (new): `packages/cli/src/mcp/knowledge/{types,lint-rules,render}.ts`, `packages/cli/src/__tests__/mcp-render.spec.ts`.
  - Failing tests first: `describe('operationCard')` › `it('starts with NEEDS, PROVIDES, ERASES')` (for `addClass` and `selectElement` from `getOperationSignature`: lines 0–2 start with those words; then `RESOLVES CHAINS IN:`; the call form `addClass(className)` present) › `it('host variant states none declared')` (`NEEDS: none declared (host operations declare no needs)`, `PROVIDES: none declared`); `describe('controllers')` › `it('status of Routing and Lottie')` (`CONTROLLER_STATUS` exactly `{ RoutingController: 'do-not-use', LottieController: 'constrained' }`; `controllerCard` of each starts with its status line; the other 7 have no status line); `describe('events')` › `it('eventName is the first line')` (`TIMELINE_EVENTS.map(eventName)` has 46 entries, none containing `\n`); `describe('ELIGIUS_LINT_RULES')` › `it('is the 14 curated rules')`.
  - Implement plan C7 signatures; `render.ts` imports types from `@eligian/language/mcp` and values from `@eligian/language` (`getOperationSignature` etc.); it must stay importable by the tsx generator (no Effect, no `effect/ai`).
  - Verify: the spec; `pnpm check`; `pnpm typecheck`.

- [ ] **T029** [P] `src/mcp/instructions.ts` (FR-018, FR-026; plan C8).
  - Files (new): `packages/cli/src/mcp/instructions.ts`, `packages/cli/src/__tests__/mcp-instructions.spec.ts`.
  - Failing tests first: `it('phase 1 text is within 4096 chars')`; `it('names no phase 2 tool and no scenario')` (no `eligian_project`, `eligian_smoke`, `eligian_compile`, `scenario`); `it('INSTRUCTIONS[MCP_PHASE] is INSTRUCTIONS_PHASE_1')`; `it('agentsMdBlock holds both markers and the docs pointer')` (`<!-- eligian:begin -->`, `<!-- eligian:end -->`, `node_modules/eligian/dist/docs`, the five rules). (The backtick-token check against `index.json` ids is T041's, after the docs exist.)
  - Implement plan C8 with the exact text quoted there.
  - Verify: the spec; `pnpm check`.

---

## Group 13 — MCP core modules, part 2 (new files only; need Group 12)

- [ ] **T030** [P] `src/mcp/paths.ts` (FR-007, FR-058; plan C4).
  - Files (new): `packages/cli/src/mcp/paths.ts`, `packages/cli/src/__tests__/mcp-paths.spec.ts`.
  - Failing tests first, `describe('paths')`: `it('isInside')` (inside, equal, `..`, other drive; on win32 case-insensitive) › `it('resolveInputPath: relative to the root')` › `it('outside the root is not-found naming the root')` › `it('backslash path')` (`test.runIf(process.platform === 'win32')`, `sub\\file.eligian`) › `it('resolveInputPatterns: no match is not-found')` › `it('an absolute input outside the root fails before any glob')` › `it('projectRoot without an McpServerClient is cwd')` (`await import('effect/ai')` as `ai`; `{ root: cwd, from: 'cwd' }`).
  - Implement plan C4 (`ProjectRoot`, `projectRoot(ai, cwd)` with the 2 s timeout and silent fallback, `resolveInputPath`, `resolveInputPatterns` over `expandPatterns`, `isInside`). If T008 item 6 found `McpServerClient` absent in handlers, `projectRoot` returns cwd only and the deviation is recorded in `baseline/spike.md`.
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T031** [P] `src/mcp/diagnostics.ts` (FR-015; plan C6).
  - Files (new): `packages/cli/src/mcp/diagnostics.ts`, `packages/cli/src/__tests__/mcp-diagnostics.spec.ts`.
  - Failing tests first: `describe('sourceOf')` › `it('registry codes use DIAGNOSTIC_CODES')` (`missing-dependency` → `validator`, `syntax-error` → `parser`), `it('CLI-layer codes')` (`eligius-W150` → `eligius-lint`, `compile-failed` → `compiler`, `controller-imbalance` / `class-never-removed` → `review`), `it('unknown codes fall back to validator')`; `describe('excerptOf')` › `it('CRLF safe, at most 3 lines')`; `describe('toMcpDiagnostics')` › `it('fix only on the first diagnostic of a code')` (two of the same code: first has `docs` + `fix`, second `docs` only) › `it('generic overlay of the source when the code has none')` › `it('suggestions and quickFix lifted from data')` › `it('absolute file, excerpt present')`.
  - Implement plan C6 (`McpDiagnosticSource`, `McpDiagnostic`, `McpDiagnosticSchema`, `sourceOf`, `excerptOf`, `toMcpDiagnostics(results, overlays, readSource)`); `REVIEW_CODES` from `../check/review.js`.
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T032** [P] `knowledge/load.ts` + `knowledge/search.ts` (FR-019; plan C7).
  - Files (new): `packages/cli/src/mcp/knowledge/{load,search}.ts`, `packages/cli/src/__tests__/mcp-search.spec.ts`, fixture `packages/cli/src/__tests__/__fixtures__/mcp/docs-mini/` (`index.json` with ~6 entries incl. `operations-index` and `operation/selectElement`, `overlays.json`, matching chunk `.md` files with frontmatter).
  - Failing tests first: `describe('loadKnowledge')` › `it('reads index, bodies without frontmatter, ## headings, overlays')` › `it('a missing index.json is ToolInternal naming docsRoot')` (empty temp dir) › `it('cached per docsRoot')`; `describe('searchIndex')` › `it('an operation name routes to operation/<name> then operations-index')` (`selectElement`) › `it('at most limit hits, default 8')` › `it('ties by id; best heading returned')` › `it('camelCase and punctuation tokenised')`.
  - Implement plan C7 (`loadKnowledge(docsRoot)` with `Effect.tryPromise` + `toToolError`; `searchIndex` scores id/title 8, use_cases 4, card 3, heading 2, body `log2(1 + count)` for non-operation chunks).
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

---

## Group 14 — The knowledge generator (new files; sequential: T034 imports T033's script)

- [ ] **T033** `scripts/generate-knowledge.ts` and the drift spec, generated half (FR-032, FR-035, FR-036, FR-038, FR-041; plan "Generator", "Literate probes", "Drift test").
  - Files (new): `packages/cli/scripts/generate-knowledge.ts`, `packages/cli/src/mcp/knowledge/curriculum/` (empty but for `probe-assets/probe.css`, `probe-assets/probe-layout.html`, `diagnostics/.gitkeep`), `packages/cli/src/__tests__/mcp-knowledge.spec.ts`, fixture `packages/cli/src/__tests__/__fixtures__/mcp/curriculum-probe/map-test.md` (one ` ```eligian probe ` block) and `…/curriculum-probe/broken/map-broken.md` (a probe that does not compile).
  - Failing tests first, `mcp-knowledge.spec.ts` › `describe('generated docs')` (`beforeAll`: `generateKnowledge({ outDir })` twice into two `fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-docs-'))` dirs):
    - `it('names every registry operation')` (each `getAllOperations()` name has `generated/operations/<name>.md` and appears in `operations-index.md`), `it('names the 9 controllers')`, `it('names the 46 timeline events')` (via `eventName`), `it('names every grammar keyword')` (every `Keyword` reachable from the entry rule of `getOrCreateServices().Eligian.Grammar` from `@eligian/language/mcp`, value matching `/^[a-z][a-zA-Z]*$/`, appears in `syntax-cheatsheet.md`), `it('names the 4 starters')`, `it('names every top-level config property')` (from the installed `eligius/jsonschema/eligius-configuration.json` via `createRequire(import.meta.url).resolve('eligius/package.json')`).
    - `it('two runs are byte-identical')`; `it('a stale file is removed')` (write `generated/stale.md` into an outDir, regenerate, gone).
    - `it('cards ≤ 120 words; generated chunks ≤ 6000 words')`; `it('every chunk ends with its see line')`; `it('index.json is sorted by id with words counted')`.
    - `it('diagnostics.md has one code · source · overlay id line per code and no overlay text')` (all `DIAGNOSTIC_CODES`, `REVIEW_CODES`, `compile-failed`, `eligius-<rule>` for `ELIGIUS_LINT_RULES`).
    - `it('the curated lint rules are lint.mjs literals minus W111')` (read the installed `eligius/dist/lint.mjs`, `/"[EW]\d{3}"/g`, unique, minus `LINT_RULES_CHECKED_BY_ELIGIAN`, equals `ELIGIUS_LINT_RULES`).
    - `it('using custom compiles silently as animation')` (`compileWithMap` of a `using custom` timeline: no diagnostic, emitted `type === 'animation'`).
    - `describe('literate probes')` › `it('splices the compiled fragment')` (with `curriculumDir` = the `curriculum-probe` fixture: the ` ```json compiled ` block follows the probe, has no `id` key at any depth, `expect(fragment).toMatchFileSnapshot('./__snapshots__/probes/map-test-1.json.snap')`, D1) › `it('a broken probe fails with chunk id and index')` (the `broken` fixture rejects with a message containing `map-broken` and `probe 1`).
  - Implement plan "Generator" table (every row; `agents-block.md` from `agentsMdBlock()`; `overlays.json` from `curriculum/diagnostics/*.md`), determinism rules, `rmSync(outDir)` first, CLI `--out`.
  - Verify: `pnpm -C packages/language build && pnpm -C packages/cli exec vitest run src/__tests__/mcp-knowledge.spec.ts`; `pnpm -C packages/cli exec tsx scripts/generate-knowledge.ts --out $SCRATCH/eligian-docs && ls $SCRATCH/eligian-docs/index.json`; `pnpm check` (Biome covers `packages/cli/scripts/*.ts`); `pnpm run typecheck:tests`.

- [ ] **T034** `dataflow-tables.spec.ts` (FR-043, SC-013).
  - Files (new): `packages/cli/src/__tests__/dataflow-tables.spec.ts`.
  - Failing test first: `beforeAll` generates docs into a temp dir and parses `generated/dataflow-tables.md`; `describe('dataflow-tables')` › `it.each(<every operation with Eligius metadata × every parameter field>)('%s.%s')`: build a one-timeline config whose start op puts `'$operationdata.probe'` in that field, `lintConfiguration` from `eligius/lint`; `W150 at that path` ⇔ the table says "not resolved". Operations without Eligius metadata are skipped by the table marker (`lint.mjs:4153`).
  - Implement: only fix the generator's table if the spec disagrees (the table is the claim, lint is the truth).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/dataflow-tables.spec.ts` → W150 disagreements 0.

---

## Group 15 — Generator in the build and the tarball (sequential; shared: `packages/cli/package.json`, `esbuild.mjs`, `package-bin.spec.ts`)

- [ ] **T035** FR-033, FR-034, FR-048 (pack list), SC-014.
  - Files: edit `packages/cli/package.json` (`files` += `"dist/docs/**"`; script `"generate:knowledge": "tsx scripts/generate-knowledge.ts --out dist/docs"`), `packages/cli/esbuild.mjs` (after the production `rmSync` `:79`, before the bundle, in every mode: `spawnSync(process.execPath, [createRequire(import.meta.url).resolve('tsx/cli'), 'scripts/generate-knowledge.ts', '--out', 'dist/docs'], { cwd: here, stdio: 'inherit' })`, exit on non-zero), `packages/cli/src/__tests__/package-bin.spec.ts` (pack test: expected list = the five base files + every file under `dist/docs` (recursive, POSIX separators), `dist/docs/index.json` included; rename the `it` to `npm packs the launcher, the bundle, the docs, the README and the LICENSE`).
  - Failing test first: the edited pack test (red: `dist/docs/**` not packed yet).
  - Verify: `pnpm -C packages/cli build && ls packages/cli/dist/docs/index.json`; `pnpm -C packages/cli run build:prod && ls packages/cli/dist/docs/index.json` (save both to `baseline/docs-in-build.txt`, SC-014); `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts` (0 skipped except `mcp answers initialize`); `pnpm -C packages/cli build` again (restore the dev bundle); `rm -f packages/cli/eligian-*.tgz`.

---

## Group 16 — The five tools (new files only; needs `VERDICT: go` from T008)

Common to every tool task (plan C9): the file exports `NAME`, `DESCRIPTION`, `KEYWORDS`, `Parameters`, `Success` (a `Schema.Struct` whose first field is `header`), `summarizeArgs`, `makeTool(ai)` (`ai.Tool.make(NAME, { description, parameters, success, failure: ToolFailure, dependencies })` plus annotations), `handle(params, context)`. `ToolContext = { ai, cwd, docsRoot, versions, requestId }`. `header` = `` `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${resolvedPath ?? '-'}` ``. The spec of each task tests `handle` directly (D2): `const ai = await import('effect/ai'); const versions = getCompilerVersion();` (in-process this is `0.0.0-development`, C1), `Effect.runPromise(handle(params, ctx).pipe(Effect.provide(CompilerLockLive)))`; failures through `Effect.flip`. Locked tools pass `dependencies: [CompilerLock]` and run their compiler section with `CompilerLock.run(requestId, …)`.

- [ ] **T036** [P] `tools/docs.ts` (FR-019, SC-011).
  - Files (new): `packages/cli/src/mcp/tools/docs.ts`, `packages/cli/src/__tests__/mcp-docs.spec.ts`.
  - Failing tests first (`beforeAll`: generate docs into a temp dir as `docsRoot`): `describe('eligian_docs')` › `it('no arguments: the index')` (every `index.json` entry; non-operation entries with full card; `kind: operation` entries `{ id, title }` only; `JSON.stringify(payload).length <= 12000`) › `it('ids: cards')` (`{ ids: ['operation/addClass'] }` → that card) › `it('detail: bodies, overflow in notReturned')` (ids whose bodies exceed 6,000 words → the rest in `notReturned`) › `it('diagnostics returned whole with detail')` (`{ ids: ['diagnostics'], detail: true }` → one body, nothing in `notReturned`) › `it('query: at most 8 hits, operations-index among them')` (`{ query: 'selectElement' }`) › `it('unknown ids get the 3 closest')` › `it('header first')` (`Object.keys(payload)[0] === 'header'`, ends with ` · eligian_docs · -`).
  - Implement plan C9 docs row (`Readonly` + `Meta` alwaysLoad; `ids: Schema.Array(Schema.String).check(Schema.isMaxLength(6))`; closest ids via `findSimilarClasses`).
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T037** [P] `tools/operations.ts` (FR-020–FR-022, FR-037, SC-010; plan C5).
  - Files (new): `packages/cli/src/mcp/tools/operations.ts`, `packages/cli/src/__tests__/mcp-operations.spec.ts`, fixture `packages/cli/src/__tests__/__fixtures__/mcp/host/{main.eligian,host.ts}` (`extensions "./host.ts" { operation score(answer: string) }`; `host.ts` excluded from nothing: it is valid TS for Biome).
  - Failing tests first: `describe('eligian_operations')` › `it('names: two cards and one unknown')` (`['addClass','selectElement','adClass']`; card texts start `NEEDS:`/`PROVIDES:`/`ERASES:`; `unknown[0].suggestions` contains `addClass`) › `it('kind controller: 9 with statuses')` › `it('kind event: 46')` › `it('kind dom-event and key: non-empty')` › `it('needs selectedElement equals findOperationsWithDependency')` › `it('no argument: categories')` › `it('30 names: 25 cards, 5 in notReturned')` › `it('path: the host operation card')` (`{ names: ['score'], path }` → `NEEDS: none declared …`) › `it('path leaves the workspace as it was')` (through `@eligian/language/mcp` `getOrCreateServices().shared.workspace.LangiumDocuments`: `all` count equal before/after, `hasDocument(URI.file(fixture))` false) › `it('missing path is ToolNotFound naming it')` (`path: 'missing.eligian'` inside the root).
  - Implement plan C9 operations row and C5 (parse with `getOrCreateServices().Eligian.parser.LangiumParser.parse<Program>(source)` under the lock; no document added).
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T038** [P] `tools/check.ts` (FR-015, FR-017, FR-023, SC-006).
  - Files (new): `packages/cli/src/mcp/tools/check.ts`, `packages/cli/src/__tests__/mcp-check.spec.ts`, fixtures `packages/cli/src/__tests__/__fixtures__/mcp/check/<case>/` for: `missing-dependency`, `missing-action-dependency`, `unknown-operation`, `unknown-css-class`, `unknown-css-class-in-selector`, `unknown-css-id-in-selector`, `unknown-dom-event`, `eligius-lint`, `controller-imbalance`, `class-never-removed`, `warnings-only`, `repeated-code` (two diagnostics of one code), each with the layout / CSS it needs. Overlays: a generated docs dir (`beforeAll`) as `docsRoot`.
  - Failing tests first: `describe('eligian_check')`, one `it` per SC-006 bullet, each asserting the exact `code` and `source`: › `missing-dependency has a selectElement quick fix` and › `missing-action-dependency has a selectElement quick fix` (apply the 1-based range to a temp copy, check again: the code is gone) › `unknown_operation suggestions` › `unknown_css_class suggestions equal the message list` (and the two selector codes) › `unknown_dom_event suggestions` › `eligius-<rule> has source eligius-lint` › `controller-imbalance and class-never-removed have source review` › `warnings only: ok false at 0, true at maxWarnings 10` › `nonexistent path is ToolNotFound` › `every diagnostic has an excerpt and an absolute file` › `fix only on the first of each code` › `summary and files` (`summary` like `1 file: 0 errors, 1 warning (max 0)`).
  - Implement plan C9 check row (`resolveInputPatterns` → under the lock `Effect.tryPromise(() => checkPaths(files, { selectorNotInLayout, lint, review }))` → `toMcpDiagnostics(results, knowledge.overlays, readSource)`; defaults `ids`, `true`, `true`, `0`; description ≤ 1,000 chars and says the defaults are stricter than the CLI's).
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T039** [P] `tools/fmt.ts` (FR-024, SC-009).
  - Files (new): `packages/cli/src/mcp/tools/fmt.ts`, `packages/cli/src/__tests__/mcp-fmt.spec.ts`, fixtures `__fixtures__/mcp/fmt/{unformatted,formatted,syntax-error}.eligian` (copied to temp dirs by the tests).
  - Failing tests first: `describe('eligian_fmt')` › `it('check mode leaves the bytes')` (`formatted: false`, `lineDiff`, `written: []`, hash unchanged) › `it('write, then formatted')` (`written` equals exactly `[<that file's absolute path>]`; a second check → `formatted: true`) › `it('syntax error reported, file untouched')` › `it('a failed write is ToolIoError with the path')` (`fs.chmodSync(file, 0o444)`; restore in `finally`).
  - Implement plan C9 fmt row (`Destructive` false, `Idempotent` true; `KEYWORDS` e.g. `['format', 'fmt', 'eligian']` within `DESCRIPTION.slice(0, 200)`).
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

- [ ] **T040** [P] `tools/init.ts` (FR-025, FR-026, SC-012; plan C11). RULING 2026-11-05: the starters' `controller-imbalance` warnings are genuine; `starters.ts` was fixed in the main loop (each timeline's `on leave` removes the controllers `on enter` adds) and `review.ts` now matches timelines by index (the video starter had no quick fix). Every template checks 0/0 with the defaults (`node packages/cli/bin/cli.js init <dir> --template <t>` then `check main.eligian --selector-not-in-layout ids --max-warnings 0`). The task's own files are unchanged by the ruling: re-run its spec, which should pass as written. See `## Defects found`.
  - Files (new): `packages/cli/src/mcp/tools/init.ts`, `packages/cli/src/__tests__/mcp-init.spec.ts`.
  - Failing tests first: `describe('eligian_init')` › `it.each(['blank','chapters','video','library'])('template %s')` (empty temp dir: every `starterFiles` file exists, plus `.mcp.json`, `AGENTS.md` (both markers, `node_modules/eligian/dist/docs`), `CLAUDE.md` = `@AGENTS.md\n`; `.mcp.json` `args[0]` absolute and ends with `path.join('node_modules','eligian','bin','cli.js')`, `args[1] === 'mcp'`; `written` lists the files; `nextSteps[0]` mentions `npm install`; then `runCheck([<entry>], { selectorNotInLayout: 'ids', lint: true, review: true, maxWarnings: 0, … })` → exit 0) › `it('refuses existing starter files')` (`main.eligian` exists, no `force` → `ToolIoError` whose message lists the file and mentions `force: true`) › `it('skips existing agent files')` (existing `.mcp.json` / `AGENTS.md` byte-identical; listed in `skipped` with the content the tool would have written) › `it('a write failure is ToolIoError')` (`directory` = `<tmp>/file.txt/sub` where `file.txt` is a regular file).
  - Implement plan C9 init row (`resolveInputPath`; `runInit` in `Effect.tryPromise` + `toToolError('write', target)`; agent files each only when absent; `path.join` for `.mcp.json`).
  - Verify: the spec; `pnpm check`; `pnpm effect:check:cli` 0/0.

---

## Group 17 — The server and the `mcp` command (sequential; shared: `main.ts`, `package-bin.spec.ts`)

- [ ] **T041** `server.ts` + the in-process test client (FR-002, FR-003, FR-005, FR-016–FR-018; SC-003, SC-004, SC-029; plan C10, "Test client").
  - Files (new): `packages/cli/src/mcp/server.ts`, `packages/cli/src/__tests__/mcp-test-client.ts`, `packages/cli/src/__tests__/mcp-server.spec.ts`.
  - Failing tests first, `mcp-server.spec.ts` (servers via `startInMemoryServer({ cwd, docsRoot: <generated temp dir> })`, closed in `afterEach`):
    - `describe('tool surface')` › `it('lists exactly five tools with their annotations')` (through `client()` → `listTools()`: the five names; `_meta['anthropic/alwaysLoad'] === true` on exactly docs / operations / check; `annotations.readOnlyHint === true` on those three; `destructiveHint: false` and `idempotentHint: true` on fmt and init).
    - `describe('budgets')` › `it('instructions ≤ 4096')` (the `initialize` result's `instructions`) › `it('upfront descriptions ≤ 1000')` › `it('deferred ≤ 16384, KEYWORDS in the first 200 chars')` › `it('backticked tokens are tools or index ids')` (every `` `x` `` in the instructions matching `/^[a-z0-9_/-]+$/` is one of the five tool names or an id in the generated `index.json`; **red until the curriculum, Group 22: T053 confirms green**) › `it('says check defaults are stricter')`.
    - `describe('protocols')` › `it('serverProtocols lists 2025-11-25 then 2025-06-18')` (`serverProtocols(ai).map(p => p.protocolVersion)` equals `['2025-11-25','2025-06-18']`, no `'2026-07-28'`) › `it('initialize echoes 2025-11-25 and 2025-06-18 exactly')` (raw `request('initialize', …)`) › `it('the McpClient connects')`.
    - `describe('payload shape')` › one `it` per tool (one valid call each): `content[0].text` starts `{"header":`, `JSON.parse(text)` deep-equals `structuredContent`, `isError` false, `header` equals `` `eligian ${v.compiler} · eligius ${v.eligius} · <tool> · <path or ->` `` with `v = getCompilerVersion()` (C1).
  - Implement plan C10 exactly (`ServerOptions`, `SERVER_PROTOCOL_VERSIONS`, `serverProtocols`, `makeServerLayer` with `Layer.provide(handlers)`, `Layer.provide(options.lock ?? CompilerLockLive)`, `Layer.provide(layerStdio(…))`, outermost `Layer.provide(stderrLoggerLayer)` — never a merge; each handler `telemetry.withTelemetry(NAME, summarizeArgs(params), requestId => handle(…).pipe(catchDefects, Effect.mapError(toToolFailure(header))))`; `runServer` with the stdin-end mechanism T008 item 7 recorded). Test client per plan "Test client" (`Stdio.make` over a `Queue`-fed `Stream` and a recording `Sink`; hand-built `McpClient.Transport`; `spawnServer` with the line-buffered parser of `package-bin.spec.ts:122-141`).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-server.spec.ts` (all green except the one marked red); `pnpm check`; `pnpm effect:check:cli` 0/0; `pnpm typecheck`.

- [ ] **T042** The `mcp` command; bin-level handshake (FR-001, FR-003, FR-048; SC-001, SC-019, SC-020, SC-029; plan B5).
  - Files: edit `packages/cli/src/main.ts` (the `mcp` command of plan B5, registered before the default `compile` command `:458`; the epilogue `:285` → `Run 'eligian <command> --help' (compile, check, fmt, smoke, dev, init, mcp) for its options.`), `packages/cli/src/__tests__/package-bin.spec.ts`.
  - Failing tests first, `package-bin.spec.ts`: extend `it('help names mcp and the check defaults')` with the epilogue line above; in `mcp answers initialize in under 3 s` (`:116`): spawn `process.env.ELIGIAN_BIN ?? <repo bin>`, add `expect(result.serverInfo.version).toBe(pkg.version)` and `expect(answer.result.protocolVersion).toBe('2025-06-18')`; in `no static import of jsdom, esbuild or effect/ai` (`:168`) add `expect(code).toMatch(/\bimport\(\s*["']effect\/ai["']\s*\)/)`.
  - Verify: `pnpm -C packages/cli build && pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts` → **0 skipped** (the initialize test now runs: `hasMcp` matches `/^\s+mcp\b/m`); `node packages/cli/bin/cli.js mcp < /dev/null; echo $?` → 0 and nothing on stdout; `pnpm effect:check:cli` 0/0.

---

## Group 18 — Wire-level tool cases (sequential; edits the five tool specs)

- [ ] **T043** FR-005 / FR-006 on the wire, per tool (D2; SC-006, SC-009, SC-010, SC-011, SC-012).
  - Files: edit `mcp-docs.spec.ts`, `mcp-operations.spec.ts`, `mcp-check.spec.ts`, `mcp-fmt.spec.ts`, `mcp-init.spec.ts` (each gains a `describe('<tool> on the wire')` using `startInMemoryServer` + `callTool`).
  - Tests (each failure: `isError: true`, `content[0].text` starts `{"header":`, `JSON.parse(text).error.kind` as stated, no `structuredContent`):
    - docs › `it('7 ids are refused by the schema')` (raw `request('tools/call', …)`: `error.code === -32602`, no `result`, C3) › `it('a missing docsRoot is kind internal naming it')` (server with `docsRoot` = an empty temp dir).
      RULING 2026-11-05: split into two `it`s. `'7 ids are refused by the schema (2025-06-18)'`: a session initialized with `protocolVersion: '2025-06-18'` → JSON-RPC `error.code === -32602`, no `result`. `'7 ids are refused by the schema (2025-11-25)'`: the default session → `result.isError === true`, `content[0].text` starts `Invalid parameters for tool 'eligian_docs'`, no `structuredContent`, no cards or bodies. `mcp-test-client.ts` may be edited for this task to take `protocolVersion?: '2025-11-25' | '2025-06-18'` in `ServerOptions` (default unchanged), used by `ensureInitialized`. See `## Defects found`.
    - operations › `it('missing path is kind not-found, path absolute')` › `it('a path outside the root is kind not-found')`.
    - check › `it('nonexistent path is kind not-found')` › `it('a path outside the root is kind not-found')` › `it('a success payload deep-equals structuredContent')`.
    - fmt › `it('a failed write is kind io with the path')`.
    - init › `it('a write failure is kind io')`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-docs.spec.ts src/__tests__/mcp-operations.spec.ts src/__tests__/mcp-check.spec.ts src/__tests__/mcp-fmt.spec.ts src/__tests__/mcp-init.spec.ts`; `pnpm check`.

---

## Group 19 — Concurrency, cancellation, eval start states (new files only)

- [ ] **T044** [P] `mcp-concurrency.spec.ts` (FR-009, FR-010; SC-005, SC-022; plan C12).
  - Files (new): `packages/cli/src/__tests__/mcp-concurrency.spec.ts`, fixtures `__fixtures__/mcp/concurrency/{a-layout,b-plain,c-fmt,d-other}/` (A: layout program with a CSS-only id; B: another program; C: an unformatted file for fmt (copied to temp); D: a second check fixture for SC-022).
  - Tests: `describe('the compiler lock')` › `it('concurrent checks equal sequential ones (20 iterations)')` (sequential baselines first; 20 × `Promise.all([A ids, B off, fmt C])` on one server with `compilerLockLayer(hooks)`; each result deep-equal its baseline ignoring `header`; mismatches 0) › `it('calls wait on the lock')` (in ≥ 1 iteration some `onQueued` lies between another call's `onAcquire` and `onRelease`; mandatory) › `it('without the lock results differ')` (`CompilerLockPassThrough`, 20 iterations, ≥ 1 mismatch. If 10 consecutive local runs show no mismatch, remove this `it`, run the control once by hand and save the output to `baseline/sc005-negative-control.txt`) › `it('the three locked tools share one lock')` (check, fmt and `operations({ names, path })` at once, the latch holding the first acquirer: the other two report `onQueued` and no `onAcquire` until release; the three intervals pairwise disjoint).
    - `describe('cancellation')` › `it('a cancelled running check sends no response and the next waits until it settled')` › `it('a cancelled queued check never runs')`: exactly the plan's SC-022 row (baselines on a separate server; call ids `'1'` / `'2'` correlate with JSON-RPC ids 1 / 2 by sending each request only after the previous hook fired; `notifications/cancelled { requestId }`; no frame with the cancelled id up to 2 s after the other response; `onRelease('1')` completed and ≤ `onAcquire('2')`; request 2 deep-equals its baseline; the queued case never calls `onAcquire('2')`).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-concurrency.spec.ts` three times in a row, green each time (save summaries to `baseline/concurrency-runs.txt`).

- [ ] **T045** [P] `eval-cases.spec.ts` (FR-052; plan C13).
  - Files (new): `packages/cli/src/__tests__/eval-cases.spec.ts`.
  - Tests: `describe('eval case start states')` › `it('fix-dataflow yields exactly its codes')` (`checkPaths([evals/mcp/cases/fix-dataflow/start/main.eligian], { selectorNotInLayout: 'ids', lint: true, review: true })`; per file, the sorted code set equals `['erased-property-access','missing-action-dependency']`) › `it('fix-selectors yields exactly its codes')` (`['import-duplicate-default','selector_not_in_layout','syntax-error']`) › `it('fix-selectors hides a controller imbalance behind its errors')` (copy `start/` to a temp dir, drop every line ending `// eval:defect`, check again → `controller-imbalance` present).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/eval-cases.spec.ts`. A mismatch is fixed in the fixture (T010 / T011), or the plan's list is amended with the reason and noted in `## Defects found`.

---

## Group 20 — Process-level stdout and path specs (sequential; extends T007's and T030's spec files)

- [ ] **T046** SC-002 noise, crash and logger runs; SC-019 header on the bin (FR-004, FR-006; plan C10).
  - Files: edit `packages/cli/src/__tests__/mcp-stdout.spec.ts`; new fixtures `__fixtures__/mcp/noise.mjs`, `__fixtures__/mcp/crash.mjs` (preloads polling the file named by `ELIGIAN_NOISE_TRIGGER`), `__fixtures__/mcp/noise-project/` (layout, CSS, a library, an Eligius lint finding, a controller imbalance).
  - Tests (`test.skipIf(!built)` for the spawned ones):
    - `it('with console noise after initialize')`: `spawnServer({ preload: noise.mjs, env: { ELIGIAN_NOISE_TRIGGER } })`; create the trigger after the `initialize` result; `notifications/initialized`, `tools/list`, one `eligian_check` on `noise-project/`; every stdout line parses with `jsonrpc === '2.0'`; the four sentinels on stderr only; ≥ 1 telemetry line on stderr; the check payload's `header` matches `/^eligian 1\.1\.0 · eligius \d+\.\d+\.\d+ · eligian_check · /` and its text starts `{"header":"eligian 1.1.0 · ` (SC-019; **red until T055 bumps the version**, then green; T061 confirms).
    - `it('an uncaught exception goes to stderr')`: `crash.mjs`; exit code ≠ 0; the message on stderr; every stdout line a complete frame.
    - `it('a tool defect is logged to stderr and answered as kind internal')` (in-process): `startInMemoryServer({ cwd, lock: <a CompilerLock layer whose run dies> })`; `vi.spyOn(console, 'error')`, `vi.spyOn(console, 'log')`; one `eligian_check`; (a) `isError`, `kind: 'internal'`, text starts `{"header":`; (b) every recorded stdout frame is JSON-RPC; (c) the defect text reached `console.error`, `console.log` not called.
  - Verify: `pnpm -C packages/cli build && pnpm -C packages/cli exec vitest run src/__tests__/mcp-stdout.spec.ts` (only the version-regex assertion may fail before T055).

- [ ] **T047** SC-021 telemetry and paths at the server (FR-007, FR-008, FR-058).
  - Files: edit `packages/cli/src/__tests__/mcp-paths.spec.ts`; new fixtures `__fixtures__/mcp/outside/shared.css`, `__fixtures__/mcp/outside/inner/{main.eligian,layout.html}` (imports `../shared.css`), `__fixtures__/mcp/roots-client.mjs` (a raw NDJSON client: `--roots ok|error|silent`).
  - Tests: `describe('telemetry')` › `it('N calls append N lines')` (`ELIGIAN_MCP_LOG` set for the in-process server via `process.env`, restored after; N = 3) › `it('an unwritable log file changes no result')`; `describe('paths at the server')` › `it('announced root')` (spawned; client advertises `capabilities.roots`, answers `roots/list` with a temp dir's `file://` URI; a relative `eligian_check` path resolves there and is echoed) › `it('roots/list fails')` (run 1 answers `-32603`, run 2 never answers and waits out the 2 s timeout; in both a relative path resolves against the spawn cwd, not `isError`) › `it('no roots')` (in-process, `cwd` option) › `it('outside the root')` (check and operations → `not-found`) › `it('imports outside the root equal the CLI')` (`runCheck([inner/main.eligian], { format: 'json', … 1.1.0 defaults })` diagnostics vs the tool's, compared on `code`, `severity`, `message`, `line`, `column`; root = `outside/inner`) › `it('read-only tools change nothing')` (file list + sha256 of every file in a fixture copy before/after `eligian_docs`, `eligian_operations`, `eligian_check`, `eligian_fmt({ write: false })`).
  - Verify: `pnpm -C packages/cli build && pnpm -C packages/cli exec vitest run src/__tests__/mcp-paths.spec.ts` (0 skipped on Windows; the backslash test runs only on win32).

---

## Group 21 — Overlay ranking (sequential; shared: `packages/cli/package.json`)

- [ ] **T048** `scripts/rank-diagnostic-codes.ts` (FR-055; plan "Overlay selection").
  - Files: new `packages/cli/scripts/rank-diagnostic-codes.ts` and its output `packages/cli/scripts/diagnostic-code-ranking.json`; edit `packages/cli/package.json` (`"rank:diagnostic-codes": "tsx scripts/rank-diagnostic-codes.ts"`).
  - Implement plan "Overlay selection": corpus via `expandPatterns`, one `checkPaths` call per file, sequential; `counts` sorted by count desc then code; `caseCodes` from the two eval start states (sorted); `selection` = `caseCodes` then the highest counts up to 30. Exported `rankDiagnosticCodes()`; the command line writes the JSON (2-space, `\n`). Time the run.
  - Verify: `pnpm -C packages/cli run rank:diagnostic-codes` twice → byte-identical output; `selection.length === 30`; `caseCodes` equals the union of T045's two lists; save the timing to `baseline/ranking-time.txt` (> 120 s locally: the T053 ranking `it` goes under `describe.runIf(process.env.CI)`, reason recorded there).

---

## Group 22 — Curriculum and overlays (new files only; markdown, outside Biome)

Rules for every chunk (FR-035, FR-039; plan "Curriculum source rules"): frontmatter `id, title, kind, use_cases, see, card` (card ≤ 120 words, aim ≤ 60: the no-argument index must stay ≤ 12,000 chars); body 300–1,200 words (hard 1,500); last line `see: <ids>`; no hand-written JSON; never sourced from `packages/cli/KNOWN_ISSUES.md` or `examples/demo.eligian`; Eligian syntax from `eligian.langium` + `LANGUAGE_SPEC.md` only. After writing, run `pnpm -C packages/cli exec tsx scripts/generate-knowledge.ts --out $SCRATCH/eligian-docs` (a broken probe fails it).

- [ ] **T049** [P] Orientation chunks (kind `orientation`): `packages/cli/src/mcp/knowledge/curriculum/{what-is-eligius,what-is-eligian,project-layout,not-eligian,decisions}.md`. `not-eligian`'s `custom` line states exactly FR-039's verified behaviour (accepted silently, compiled as `animation`, no host-source recipe).
  - Verify: the generator run succeeds; each id is in `$SCRATCH/eligian-docs/index.json` with kind `orientation`.

- [ ] **T050** [P] Mapping chunks with literate probes (kind `mapping`): `curriculum/{map-dataflow,map-actions-and-calls,map-timeline-and-providers,map-events-and-interactions,map-controllers}.md`; each holds ≥ 1 ` ```eligian probe ` block (complete programs; may import `./probe.css`, `./probe-layout.html` from `probe-assets/`, extended there as needed).
  - Verify: the generator run succeeds and splices a ` ```json compiled ` block after every probe.

- [ ] **T051** [P] Runtime and workflow chunks: `curriculum/{runtime-engine-lifecycle,runtime-scheduling}.md` (kind `runtime`) and `curriculum/storyboard.md` (kind `workflow`). Every runtime paragraph / list item outside headings, fences, `Compiler:` paragraphs and the `see:` line carries `(probed: "<title>")` copied verbatim from `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md`, whose titles are the `CLAIMS` of `packages/cli/src/__tests__/mcp-runtime-claims.spec.ts:25-41`; no `not probed` text. Save to `baseline/runtime-claims-review.txt` each claim with its test title, and the statement that no chunk was written from `KNOWN_ISSUES.md` or `examples/demo.eligian` (plan "Negative source rules").
  - Verify: the generator run succeeds; `grep -c "not probed" packages/cli/src/mcp/knowledge/curriculum/runtime-*.md` → 0 each.

- [ ] **T052** [P] Diagnostics overlays (FR-040): one `curriculum/diagnostics/<code>.md` (frontmatter `code`, cause + fix ≤ 120 words) per code of `diagnostic-code-ranking.json` `selection`, plus `controller-imbalance.md`, `class-never-removed.md` (if not selected), plus one generic `curriculum/diagnostics/source-<source>.md` (frontmatter `source`) for `parser`, `validator`, `type`, `linker`, `compiler`, `eligius-lint`, `review`. New `packages/cli/src/__tests__/__fixtures__/mcp/missing-overlays.json`: the sorted catalogue codes (every `DIAGNOSTIC_CODES` code, `compile-failed`, every `eligius-<rule>`) without an overlay.
  - Verify: the generator run succeeds; `overlays.json` `byCode` has selection ∪ review codes, `bySource` has the 7 sources; the allowlist has ≤ (catalogue size − 30) entries and neither review code.

---

## Group 23 — Curriculum drift, budgets (sequential; extends `mcp-knowledge.spec.ts`)

- [ ] **T053** FR-039–FR-042, FR-055 assertions; the docs budget; the instructions tokens (SC-004, SC-011, SC-013).
  - Files: edit `packages/cli/src/__tests__/mcp-knowledge.spec.ts`.
  - Tests: `describe('curriculum')` › `it('ships the FR-039 chunks')` (the 13 ids with kinds: 5 orientation, 5 mapping, 2 runtime, 1 workflow) › `it('runtime chunks teach only probed claims')` (plan "Curriculum source rules" (a)–(c): `CLAIMS` titles read from `mcp-runtime-claims.spec.ts` as text; each marker title also occurs as `(probed: "<title>")` in the model doc) › `it('curriculum bodies are 300–1500 words')`; `describe('probes')` › `it('every map-* probe matches its snapshot')` (`toMatchFileSnapshot('./__snapshots__/probes/<chunk>-<n>.json.snap')`, D1); `describe('overlays')` › `it('missing overlays are exactly the allowlist')` (missing-and-unlisted fails; listed-but-present fails) › `it('the review overlays exist and are not allowlisted')` › `it('the ranking selection equals the script output')` (`rankDiagnosticCodes()`, timeout 300 s, or `runIf(process.env.CI)` per T048) › `it('the selection contains the case 13 and 14 start codes and has overlays')`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-knowledge.spec.ts src/__tests__/mcp-docs.spec.ts src/__tests__/mcp-server.spec.ts` → all green, including T041's `backticked tokens are tools or index ids` and T036's `≤ 12000` (if over budget, shorten cards, never raise the cap); commit nothing.

---

## Group 24 — Version, docs, workflows, roadmap (sequential; shared files)

- [ ] **T054** The static-import and no-`Effect.promise` rules, checked once over the finished `src/mcp/` (FR-003; plan C3): `grep -rnE "from ['\"]effect/ai['\"]" packages/cli/src/mcp | grep -v "import type"` → no line; `grep -rn "Effect.promise" packages/cli/src/mcp` → no line. Save to `baseline/static-import-grep.txt`. Fix any hit at its source.

- [ ] **T055** Version 1.1.0 (FR-046, SC-019).
  - Files: `packages/cli/package.json` (`version` `1.1.0`); `packages/language/src/starters/starters.ts:118` (`'^1.0.0'` → `'^1.1.0'`); `packages/cli/src/__tests__/init.spec.ts:40-49` (the `it` asserts `` `^${major}.1.0` `` with a comment "1.1 introduced `eligian mcp`"; rename it to `… in the minor that introduced eligian mcp`); root `AGENTS.md:41` ("starters depend on `eligian` `^<major>.<minor-that-introduced-mcp>.0`"). Then `grep -rn "\^1\.0\.0" packages --include=*.ts` and fix any other test that pins the old range (for example extension starter tests).
  - Failing test first: the edited `init.spec.ts` assertion (red before `starters.ts` changes).
  - Verify: `pnpm -C packages/language build && pnpm -C packages/cli build`; `node packages/cli/bin/cli.js --version` → `1.1.0`; `pnpm -C packages/cli exec vitest run src/__tests__/init.spec.ts src/__tests__/mcp-stdout.spec.ts src/__tests__/package-bin.spec.ts` (T046's header regex now green; 0 skipped).

- [ ] **T056** Workflows (FR-049, FR-054, SC-016; plan "Repo files").
  - Files: `.github/workflows/ci.yml` (after "Build": step `MCP inspector gate` = the T008 item-1 command through `pnpm -C packages/cli exec <inspector bin> …` against `node packages/cli/bin/cli.js mcp`, piped to `node -e` asserting exactly the five tool names; **last** step `MCP on the packed tarball`: `pnpm -C packages/cli pack`; in `${{ runner.temp }}/eligian-pkg` `npm init -y` and `npm install <abs tgz>`; the same inspector `tools/list` + assertion against `node <tmp>/node_modules/eligian/bin/cli.js mcp`; `ELIGIAN_BIN=<tmp>/node_modules/eligian/bin/cli.js pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts -t "mcp answers initialize"`), `.github/workflows/publish-cli.yml` "Try the package" (`:86-92`: the check line gains `"!examples/demo.eligian"`; a line `eligian check examples/demo.eligian --selector-not-in-layout off`; an inspector `tools/call` of `eligian_docs` via `npx -y @modelcontextprotocol/inspector@<pinned> …` with a `node -e` check: not `isError`, ≥ 1 index entry).
  - Verify: run the new ci.yml commands locally in Bash (inspector gate on the repo bin; the tarball step in a scratchpad dir) → exit 0; save to `baseline/ci-steps-local.txt`; `rm -f packages/cli/eligian-*.tgz`; `pnpm -C packages/cli build` (pack ran `build:prod`). `node -e "require('yaml')"` is not available; check the YAML by eye against the existing steps' indentation.

- [ ] **T057** README, CHANGELOG, AGENTS.md (FR-047; plan "Repo files").
  - Files: `packages/cli/README.md` (section "Use with coding agents (`eligian mcp`)": the five tools; the four client snippets (Claude Code `.mcp.json` / `claude mcp add`, Cursor, VS Code, Codex); the `npx -y eligian@^1.1 mcp` fallback in the form T066 settles (leave a `TODO(T066)` marker only until then); the 1.0.x caveat; the Codex trusted-project note marked **[UNVERIFIED]**; the security note (`host.ts` is user code; only tool input paths are restricted to the project root, imports follow the language's `../` rules); the `check` section documents the `ids` default and `--no-review`); `CHANGELOG.md` "Unreleased" (Added: `eligian mcp`, the review pass, `@eligian/language/mcp`; Changed: CLI 1.1.0, `check` defaults, starters `^1.1.0`); root `AGENTS.md` (one Commands line for `eligian mcp` — the five tools, `ELIGIAN_MCP_LOG`, docs from `pnpm -C packages/cli generate:knowledge`; one Architecture line for `packages/cli/src/mcp/`); `packages/cli/AGENTS.md` (the generator runs inside `esbuild.mjs` and needs the built language package, so `pnpm build` (topological) is the supported path; `pnpm -C packages/cli build` alone after `clean` fails).
  - Verify: `grep -n "eligian mcp" packages/cli/README.md CHANGELOG.md AGENTS.md packages/cli/AGENTS.md` ≥ 1 each; `grep -n "\^<major>.0.0" AGENTS.md` → 0.

- [ ] **T058** Roadmap corrections (FR-056, SC-027).
  - File: `specs/058-mcp-server/roadmap.md`: §8 decision 10 (accepted silently, compiled as an `animation` timeline; the warning belongs to the separate `custom` spec); §7 Phase 3 Touches gains the Langium service recycling (`releaseWorkspaceDocuments` + a fresh `getOrCreateServices`, reset hook exported from the language package); §7 Phase 1 Exit: the Linux half as SC-016 words it (recorded relaxation).
  - Verify: `grep -n "raf stand-in with a warning" specs/058-mcp-server/roadmap.md` → 0; `git diff specs/058-mcp-server/roadmap.md` shows only those three passages; save the three new passages to `baseline/roadmap-edits.txt`.

---

## Group 25 — Integration gates (sequential, in this order)

- [ ] **T059** Build, type and lint gates (plan gates 1–2; SC-023): `pnpm build`; `pnpm typecheck`; `pnpm run typecheck:tests`; `pnpm check` (0 errors / 0 warnings); `pnpm run ci` (never bare `pnpm ci`). Append each summary to `baseline/gates-after.txt`. Verify: all exit 0. A failure is fixed at its source (navigate to the real site; never `sed` with compiler line numbers), then T059 restarts.

- [ ] **T060** Effect gates (plan gate 3): `pnpm effect:check:language` and `pnpm effect:check:cli` → 0 errors, 0 warnings each; summaries appended.

- [ ] **T061** Tests (plan gate 4; SC-001, SC-002, SC-021). RULING 2026-11-05: the one red test (`mcp-knowledge.spec.ts` ranking selection) was timing-dependent; `rank-diagnostic-codes.ts` now excludes `__fixtures__/library-tests/**` and `__fixtures__/library-error-tests/**` (main loop; ranking JSON byte-identical). Re-run the gate as written. See `## Defects found`. `pnpm test` (all packages) green; then `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts src/__tests__/mcp-stdout.spec.ts src/__tests__/mcp-paths.spec.ts src/__tests__/review.spec.ts src/__tests__/check-command.spec.ts` → **0 skipped**; `grep -l "skipIf(!built" packages/cli/src/__tests__/*.ts` appended beside it (every listed file must be in that vitest command; add any missing one and re-run).

- [ ] **T062** Coverage (plan gate 5; SC-018): `pnpm -C packages/language test:coverage:ci` ≥ 79.8 / 80 / 69.9; `pnpm -C packages/cli test:coverage:ci` ≥ 77.1 / 77.6 / 64.5 / 76.6. "All files" rows appended, beside the T005 baselines. Below a threshold: add tests for the new code (MCP modules in-process; spawned tests do not count for v8); never lower a threshold.

- [ ] **T063** Example gates (plan gate 6; SC-007, SC-023, SC-025): `pnpm run check:examples` (exit 0; the strict line `0 errors, 0 warnings`), `pnpm run fmt:examples` (output identical to `baseline/fmt-examples-before.txt`), `pnpm run smoke:examples` (exit 0); `git diff --stat -- examples/` empty. Appended to `baseline/gates-after.txt`.

- [ ] **T064** Production bundle and the publish path (plan gate 7; SC-014, SC-015).
  - `pnpm -C packages/cli run build:prod && ls packages/cli/dist/docs/index.json`; `pnpm -C packages/cli pack`.
  - Record `npm ls -g eligian` first; then run the "Try the package" step of `publish-cli.yml` verbatim from the repo root against `./packages/cli/eligian-1.1.0.tgz` (install, `--version` → `1.1.0`, the strict check line, the demo line, the smoke line, the inspector `tools/call` of `eligian_docs` → not `isError`, ≥ 1 index entry). Save everything to `baseline/sc015-publish-path.txt`. Afterwards restore the global state recorded first (`npm uninstall -g eligian`, or reinstall the earlier version), `rm packages/cli/eligian-*.tgz`, `pnpm -C packages/cli build`.

- [ ] **T065** Heap growth (FR-053, SC-026).
  - File (new): `packages/cli/scripts/measure-heap.ts` (tsx): N = 100 sequential in-process `eligian_check` calls through `startInMemoryServer` on one fixture; `global.gc()` then `process.memoryUsage().heapUsed` before the first and after the last; prints N, both readings, growth per call in MB.
  - Run: `node --expose-gc --import tsx packages/cli/scripts/measure-heap.ts > specs/058-mcp-server/phase-1-mvp-server/baseline/heap.txt`; append `baseline/lock-grep.txt` (T026). Verify: the file has the four numbers; `pnpm check` clean.

- [ ] **T066** Handshakes and the inspector (plan gate 8; SC-003 inspector half, SC-016).
  - Inspector `tools/list` against `node packages/cli/bin/cli.js mcp` → exactly the five tools, `_meta` on the three upfront.
  - Windows: `claude mcp add eligian -- node <repo>\packages\cli\bin\cli.js mcp`, `claude mcp list` → connected; then the `npx` form against the installed tarball (a scratchpad project with `npm install <tgz>`): try `npx -y eligian@^1.1 mcp` and, if it fails, `cmd /c npx -y eligian@^1.1 mcp`; record the working form per client and replace T057's `TODO(T066)` in `packages/cli/README.md`. Remove the test registrations afterwards (`claude mcp remove eligian`).
  - Linux: the PR's `ubuntu-latest` CI run (inspector gate + tarball step) is the evidence; a manual `claude mcp list` on a Linux host with Node 22+ only when one is available, else record "not done (no host)". Never WSL Node 18.
  - Save all commands and outputs to `baseline/handshakes.txt`.

- [ ] **T067** Eval cases (SC-017; FR-050, FR-051).
  - Precondition: `git status --porcelain -- . ':!evals/mcp/results'` empty is preferred (the harness records it either way); `claude` logged in under the user's subscription.
  - Run once each: `pnpm exec tsx evals/mcp/run.ts --case fix-dataflow --arm A1` and `pnpm exec tsx evals/mcp/run.ts --case fix-selectors --arm A1`. Every run's result JSON stays under `evals/mcp/results/<run>/` (failed runs included); no re-run on an unchanged tree.
  - Verify: both result JSONs exist; record `pass`, `rounds`, tool calls, tokens-from-tools, wall time in `baseline/evals.txt`. A failing first run is triaged in `## Defects found` (curriculum gap / tool ergonomics / compiler gap); a re-run needs a change.

- [ ] **T068** Final diff review for the comply stage.
  - `git status --short` and `git diff --stat` saved to `baseline/final-status.txt`; confirm no file under `**/generated/`, `*.generated.ts`, `examples/` or `packages/cli/KNOWN_ISSUES.md` changed; no `spike.ts`; no leftover `*.tgz`.
  - The comply stage builds `compliance.md` from `baseline/`, the plan's corrections C1–C14, deviations D1–D3 above, and `baseline/may-sites.txt`.

---

## Dependencies

- Group 1 → Group 2: the Step 0 baselines measure the unchanged tree.
- Group 3 (spike, `VERDICT: go`) gates Group 16 (tools) and everything after; a no-go stops the list for re-planning.
- Group 4 (eval fixtures, harness) needs only the current CLI; T045 (Group 19) re-checks the fixtures once `checkPaths` and the review pass exist; T067 runs the harness last.
- Groups 5–8 (language) → Groups 9–11 (CLI check layer): `CheckDiagnostic.data`, the walker, `lifecycleInsertionPoints` and the `@eligian/language/mcp` build (T019) are imported by `review.ts`, `check.ts` (tool), the generator and the operations tool. Rebuild the language package after each language group.
- T020 (`program`, `lintCompiled`) → T022 (review) → T023 (`checkPaths`) → T024 (defaults; `check:examples` demo exclusion lands in the same task as the default switch).
- Group 12 → Group 13 (`paths` / `load` use `errors`; `diagnostics` uses `knowledge/types` and `REVIEW_CODES`).
- T028 + T029 → T033 (the generator imports `render.ts`, `lint-rules.ts`, `instructions.ts`) → T034, T035.
- Groups 12–15 → Group 16 (tools) → T041 (server registers all five) → T042 (`mcp` command) → Groups 18–20.
- T045 + T048: the ranking needs the eval start states and the review codes. T048 → T052 (overlays from the selection) → T053.
- T041's backtick-token test and T046's version regex are planned reds, turned green by T053 and T055.
- T055 (1.1.0) before T056 (CI steps use the version-independent commands) and T064 (`eligian-1.1.0.tgz`).
- Group 25 runs last, in order; T066's `npx` result feeds back into the README (T057's file).

## Defects found

<!-- Triage notes added by the gates during the build stage. Empty at planning time. -->

- **T006 blocked (Group 3)**: the inspector devDependency made `pnpm install --frozen-lockfile` exit 1 (ERR_PNPM_IGNORED_BUILDS). Ruled in the main loop: `allowBuilds` entry `false` in `pnpm-workspace.yaml`; verified exit 0 and `mcp-inspector --version` → 2.13.0. Not a code defect.

- **T024 blocked (Group 11), review-rule defect**: with review on by default, `warning-only.eligian` gets `class-never-removed` at 14:13 (`addClass("visible")` on `"#test"`), so SC-008's byte-identical JSON test fails. False positive: `showElement` is an endable action whose end block runs `removeClass("visible")`, and `at 0s..5s showElement()` ends it. Causes: `walkOperations` (`controller-balance.ts`) has no `endAction` case, and `classesNeverRemoved` (`review.ts`) maps actions to `startOperations` only. Ruled in the main loop: fix the rule under T024 (both files + an endable-action case in `review.spec.ts`); FR-030 amended to say so. The fixture and the test are unchanged.

- **T040 blocked (Group 16), starters not review-clean**: all four starters got `controller-imbalance` (blank 1, chapters 3, video 1, library 1): `on enter` interactions (`on click`, `on key`) and `addController` add controllers that `on leave` never removed. Genuine, as the tour's `leaveChapter` shows. Ruled in the main loop: `starters.ts` fixed with the removals the quick fix proposes; SC-012 stays. Found alongside: the video starter's warning had no `quickFix` and said `Timeline "./media/intro.mp4"`, because `review.ts` matched the config timeline to its insertion point by `uri` (the source path for media timelines) while the points are keyed by name. Fixed: matched by index, named by the source name. Verified: `review.spec.ts`, `check-command.spec.ts`, `init.spec.ts` 47 passed; `effect:check:cli` 0/0/0; a video program with a missing `on leave` now gets `Timeline "Video"` with a quick fix.

- **T043 blocked (Group 18), schema refusal shape differs per protocol**: plan C3's -32602 holds under 2025-06-18 (`v2025_06_18.js:256` → `ProtocolError.fromTool`), but under 2025-11-25 `effect@4.0.7` catches `InvalidToolInput` and returns `{ isError: true, content: [plain text] }` with no header (`v2025_11_25.js:260`). Ruled in the main loop: option (C), both protocols tested, the refusal recorded as the one library-owned exception to FR-005 / FR-006 (spec amended, plan C3 annotated). Not a defect of our code.

- **T061 blocked (Group 25), ranking test timing-dependent**: `pnpm test` ran `cli-library.spec.ts` / `cli-library-errors.spec.ts` (which write and delete `__fixtures__/library-tests/` and `library-error-tests/`) alongside `mcp-knowledge.spec.ts`, whose live ranking then saw `file-unreadable` and lost `event-end-not-after-start` from slot 30. Ruled in the main loop: option (a), both directories excluded from `CORPUS` by negative patterns; `pnpm -C packages/cli run rank:diagnostic-codes` re-run, output byte-identical to the committed JSON. The older specs are unchanged.

- **Compliance pass, SC-017 fail → compiler gap**: eval case 13 (fix-dataflow): the agent's program passed `eligian check` (0/0) but `smoke --strict` failed with `selectElement (in reveal): selector is either empty or not defined` at the `selectElement(selector)` after `clearOperationData()`. Cause: a bare `clearOperationData()` clears the action's parameters (they live in the operation data), `erased-parameters.ts` only knew the `@erased` parameters of the registry, and the dataflow validator tracks `selectedElement`, not parameters. Fixed in the main loop: `erasedBy` treats a bare clear as erasing every parameter (a literal `properties` list: those names); a bare clear whose block still uses parameters is compiled as `setOperationData({ properties: { <name>: '$operationdata.<name>' … }, override: true })` (same id and location), so everything is cleared except the needed parameters. `erased-parameters.spec.ts` › `a bare clearOperationData keeps the parameters the block still needs`; `map-dataflow.md` says so. The agent's saved project now plays clean. Case 14 (fix-selectors): the end state passed every step; the budget failed on 3 rounds, of which one was a `cat > main.eligian` heredoc that did not write (Windows), followed by a re-check. `gate.ts` now reports smoke problems by message and line instead of the JSON tail. Both cases re-run on the changed tree.

- **Group 2 gate (a1), `did-you-mean-data.spec.ts` › `data.suggestions equals the message's list` red**: intended TDD red, not a defect. T003 specifies it ("Red until T015"; "the second `it` must fail on `data.suggestions` undefined, nothing else"); the gate log shows exactly that (1 failed / 1 passed, `expected undefined to deeply equal [ 'addClass' ]`), matching `baseline/did-you-mean-before.txt`. Owned by T015 (Group 5); no change made in Group 2.

- **Group 18 gate (a1), `mcp-docs.spec.ts` › `7 ids are refused by the schema` red**: the test still had the pre-ruling form (one `it`, a 2025-11-25 session expecting -32602). Fixed per the T043 ruling: two `it`s, `(2025-06-18)` (explicit `initialize` at 2025-06-18, echo asserted → `error.code === -32602`, no `result`) and `(2025-11-25)` (`result.isError`, text starts `Invalid parameters for tool 'eligian_docs'`, no `structuredContent`, no cards / bodies). Raw `request` is used in both, so `mcp-test-client.ts` needed no `protocolVersion` option. Found alongside: `pnpm run typecheck:tests` failed on `package-bin.spec.ts:218` (`String#replaceAll` not in the test tsconfig's lib); replaced by `split('\\').join('/')`. Verified: the five Group 18 specs 58 passed; `typecheck`, `typecheck:tests`, `pnpm check` clean; `package-bin.spec.ts` 12 passed.

- **Group 20 gate (a1), `mcp-stdout.spec.ts` › `with console noise after initialize` red**: planned red, not a defect. T046 specifies it ("red until T055 bumps the version"; Verify: "only the version-regex assertion may fail before T055"), and the dependency list repeats it. The gate log (`3.log`) shows every earlier assertion green (frames only on stdout, sentinels on stderr, telemetry, `controller-imbalance` + `eligius-*` codes) and the one failure at `:250`, header `eligian 1.0.1 · …` against `/^eligian 1\.1\.0 · /`. Owned by T055 (Group 24); no change made in Group 20.

- **Group 21 gate (a1), three reds in `pnpm -C packages/cli test`**: (1) `mcp-stdout.spec.ts` › `with console noise after initialize` (header `eligian 1.0.1` vs `/^eligian 1\.1\.0/`): the planned SC-019 red already triaged above, owned by T055 (Group 24); unchanged. (2) `mcp-server.spec.ts` › `budgets` › `backticked tokens are tools or index ids` (instructions name `not-eligian`, `storyboard`, `decisions`, `project-layout`, curriculum ids not yet in `index.json`): planned red per T041 ("red until the curriculum, Group 22: T053 confirms green"), owned by T049 / T051 / T053; unchanged. (3) `cli.spec.ts` › `lists the compile and check commands in the top-level help`: a stale assertion missed by T042, which changed the `--help` epilogue (`main.ts:285`) to name `mcp` as FR-001 requires; the test still expected the pre-T042 list `(compile, check, fmt, smoke, dev, init)`. Fixed: it now asserts the full FR-001 epilogue line `Run 'eligian <command> --help' (compile, check, fmt, smoke, dev, init, mcp) for its options.` (the same string `package-bin.spec.ts:108` asserts). No source change.

- **Group 22 gate (a1), two reds in `pnpm -C packages/cli test`**: (1) `mcp-stdout.spec.ts` › `with console noise after initialize`: the planned SC-019 red, owned by T055 (Group 24); unchanged. (2) `mcp-docs.spec.ts` › `no arguments: the index`: 18,012 chars against the SC-011 cap of 12,000. Cause: the 13 curriculum entries took 9,439 chars (cards averaging ~67 words, 3–7 `use_cases`, 3–5 `see` each), while the 79 operation `{ id, title }` pairs (4,574) and the 11 generated / starter entries (3,904) leave about 3,400 for them. The plan's risk-table mitigation ("curriculum cards average ≤ 60 words") was not enough, because 13 × 60-word cards alone come to ~5,200 chars. Fixed per T053 ("shorten cards, never raise the cap"): frontmatter only for the 13 chunks. Cards are now 9–13 words, with one `use_case`, two `see` ids (the body's trailing `see:` line follows where one exists) and shorter titles. Bodies are unchanged. No-argument payload: 11,667 chars. Verified: `pnpm -C packages/cli test` → only (1) fails (678 passed). Note for later groups: about 330 chars are left, so any new index entry or longer card has to come out of this.
