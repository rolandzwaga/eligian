# Feature Specification: MCP server, Phase 3: Eval harness, behavioural checks, provenance, curriculum completion

**Feature**: spec 058 (Eligian MCP server), Phase 3 of `specs/058-mcp-server/roadmap.md` §7
**Branch**: `feat/mcp-server-roadmap`
**Created**: 2026-11-05
**Status**: Draft (clarifications encoded; plan stage next)
**Input**: roadmap §7 "Phase 3 — Eval harness, behavioural checks, provenance, curriculum completion (10 days)", the design in §2–§6, the binding decisions in §8, and the Phase 2 hand-offs (`phase-2-inspect-smoke-context/spec.md` Non-goals, I-1, I-7, FR-099; `compliance.md` Closure item 1). Every claim about existing code was checked on 2026-11-05 against the tree at `b62b762` (Phase 2 closed), with typegraph (`ts_module_exports`, `ts_navigate_to`) or with a command whose result is quoted.

## Overview

Phases 0–2 shipped `eligian mcp` with all eight tools, the review pass, smoke scenarios, agent context and most of the curriculum. Seven of the fourteen eval cases exist (1, 2, 3, 6, 8, 13, 14). `evals/mcp/gate.ts` checks them with inline, per-case code, on arm A1 only, one run at a time. Phase 3 turns that into the measurement that defines the roadmap's success criterion (§1 "Expert"), and closes the remaining design items:

- **The full eval harness** (§6):
  - all 14 cases;
  - the arms A0 and A1, plus A-none once;
  - several runs per case, with a majority verdict;
  - the declarative assertion library `packages/cli/src/mcp/evals/assert.ts`, including `storyboard.beatsCovered`, `controllers.balanced` and `beats.min`;
  - the per-case tool-call budget, set from the median of the passing A1 runs of the first full run (FR-008, FR-023);
  - the metrics: `operations-before-first-unknown`, `explain-called`, tokens-from-tools (arm-neutral, from the transcript; plus the telemetry context cost) and rounds;
  - the rubric;
  - `pnpm evals:mcp`.
- **Reference solutions** for cases 1–14. `mcp-solutions.spec.ts` runs them through the gate in PR CI.
- **Behavioural checks in `smoke`** (decision 5):
  - `--determinism` compares linear play, a straight seek, and end-then-back;
  - a **media clock** makes video and audio timelines run instead of being skipped (cases 4 and 9).
- **Provenance** (decision 7):
  - an `origin` on every `OperationConfigIR`, set in every transformer and carried into the Eligian map;
  - `eligian_compile` gains `explain`.
- **Curriculum completion**:
  - an overlay for every registry operation and every diagnostic code (the Phase 1 allowlist goes to empty);
  - the three unassigned generated chunks `generated/dom-events.md`, `generated/key-names.md` and `generated/html-elements.md` (Phase 2 FR-099).
- **Langium service recycling** after N = 100 compiler calls, with a soak test (deferred from Phase 1, FR-053).
- **The deferred Lottie defects** D-L2 and D-L3 (Phase 2 compliance), fixed or documented.
- **Two full eval runs**, with triage between them, and the report `specs/058-mcp-server/evals.md`. These are a user-driven step after the build stage (FR-074): the build stage implements everything else and runs only what turns the deterministic success criteria green.

## Scope and non-goals

### In scope

Roadmap §7 Phase 3, quoted (paths shortened where marked …):

> Touches: `evals\mcp\{run.ts,cases\*.json,fixtures\**,rubric.md,generate-media.ts}`, `packages\cli\src\mcp\evals\assert.ts`, `packages\cli\src\__tests__\__fixtures__\mcp-solutions\**`, `packages\cli\src\__tests__\mcp-solutions.spec.ts`, `evals\mcp\results\**`, root `package.json` (`evals:mcp`, local `claude -p` driver), `packages\cli\src\smoke\{determinism,media-clock}.ts`, `packages\language\src\compiler\types\eligius-ir.ts` + every transformer + optimizer + `eligian-map.ts` (`origin`), `packages\cli\src\mcp\tools\compile.ts` (`explain`), all remaining operation and diagnostics overlays, the §3.2 generated chunks `generated/dom-events.md`, `generated/key-names.md` and `generated/html-elements.md` (…), Langium service recycling for the soak test (`packages\cli\src\mcp\compiler-lock.ts`: after N compiler calls, `releaseWorkspaceDocuments` (…) + a fresh `getOrCreateServices` (…), with the reset hook exported from the language package; deferred from Phase 1, which records the measured heap growth per `eligian_check`).
> - Days 1–3: full harness, assertion DSL incl. scenario, `storyboard.beatsCovered`, `controllers.balanced`, metrics; reference solutions for cases 1–14 (each solution's agent run sets the case's call budget).
> - Days 4–5: `smoke --determinism`; media clock stub (cases 4, 9 run instead of skipping).
> - Days 6–7: provenance `origin` + `explain`; soak test.
> - Day 8: first full run (A0, A1, A-none once); triage into curriculum gaps / tool ergonomics / compiler gaps.
> - Days 9–10: second run; `specs\058-mcp-server\evals.md`.
> - Deferred from Phase 2 (Lottie, …): D-L2 `--bundle` and `dev` do not carry operation-data urls (…); D-L3 `lottie-web` fails at import under smoke's jsdom (no canvas) (…). Fix or document in the smoke / bundler work of this phase.
> - Exit: arm A1 passes ≥ 12 of 14 within budget on the pinned model; A1 ≥ A0 on pass rate and lower on rounds/calls/tokens; `operations-before-first-unknown` ≥ 0.9; the solutions spec is in PR CI; every registry operation and every code has an overlay (spec green).

Hand-offs from earlier phases that this phase owns:
- The `explain` input of `eligian_compile` and the `determinism` input of `eligian_smoke`. Phase 2 FR-010 and FR-040: "There is no `determinism` input (Phase 3)".
- "explain:true" back in the final instructions and in `eligian_init`'s next steps. Phase 2 I-1: "Phase 3 adds it back together with `explain`".
- The generic §6.1 step-4 assertions (`storyboard.*`, `beats.min`, and `controllers.balanced` as a library assertion), and the tool-call budget. Sources: Phase 2 I-7; Phase 1 spec, "the tool-call budget of step 6 … Phase 3".
- `verification-ladder` teaching `--determinism`. Phase 2 FR-070: "It does not teach `--determinism` (Phase 3)".
- The Phase 1 allowlist of missing overlays. Phase 1 FR-042: "Phase 3 empties the list".

### Touched files

The roadmap list above, plus the sites found while verifying (marked †):
- `evals/mcp/gate.ts`†: the assertion library replaces its per-case inline checks (`checkTitleCard` … `checkLibraryReuse`, `gate.ts:521-686`) and its own copy of `controllerBalance` (`gate.ts:260`) (FR-011).
- The seven new case files `evals/mcp/cases/{video-subtitles,scrollytelling,typewriter-counter,audio-lyrics,host-module,replay-safe,port-from-json}.json`†, with their scenario and fixture files. The seven existing case files gain budgets.
- `packages/cli/src/__tests__/eval-cases.spec.ts`†: extended to all 14 cases.
- `packages/cli/esbuild.mjs`†: builds the assertion library and the gate's step logic into `packages/cli/dist/evals/assert.mjs` for the harness (FR-083).
- Smoke†: `packages/cli/src/smoke/{smoke-runner,smoke-command,dom-environment,scenario}.ts`, `packages/cli/src/main.ts` (`--determinism`), and `packages/cli/src/mcp/tools/smoke.ts` (the `determinism` input).
- Compiler†:
  - `packages/language/src/compiler/transformers/config-builder.ts`: `buildSourceMap` (`:399`) and `stripOperationSourceLocation` (`:492`);
  - `packages/language/src/compiler/ast-transformer.ts`: the `setData` for globals (`:150-156`);
  - `packages/language/src/compiler/runtime-concat.ts`.
- Language exports†: `packages/language/src/compiler/pipeline/services.ts` (the reset hook), plus `packages/language/src/mcp.ts` and `packages/language/src/__tests__/mcp-entry.spec.ts` (the exports).
- MCP server†:
  - `packages/cli/src/mcp/instructions.ts`;
  - `packages/cli/src/mcp/tools/init.ts` (the next steps);
  - `packages/cli/src/mcp/telemetry.ts` and `summarizeArgs` in `tools/compile.ts`: the metrics need `explain` and the diagnostic codes (FR-007).
- Knowledge†:
  - `packages/cli/scripts/generate-knowledge.ts`: the three new generated chunks, and the origin rule ids;
  - `packages/cli/src/mcp/knowledge/curriculum/{operations,diagnostics}/**`;
  - `curriculum/verification-ladder.md`;
  - `packages/cli/src/__tests__/__fixtures__/mcp/missing-overlays.json`, which becomes empty.
- Specs† in `packages/cli/src/__tests__/`: `{mcp-knowledge,mcp-docs,agents,mcp-instructions,mcp-compile,mcp-smoke,mcp-scenario,smoke,mcp-compiler-lock,package-bin}.spec.ts`.
- Lottie (D-L2 fixed, D-L3 documented; FR-065)†: `packages/cli/src/bundler/asset-collector.ts`, `packages/cli/src/dev/dev-server.ts`, `curriculum/controllers/LottieController.md` and `packages/cli/README.md`. No smoke change.
- Scenario DSL† (FR-015): `packages/cli/src/smoke/scenario.ts` (`Assertion`, `parseScenario`, `runScenario`) and `packages/cli/src/__tests__/mcp-scenario.spec.ts`.
- CI and test wiring†:
  - `.github/workflows/ci.yml`: a named soak step (FR-063), and the job's `timeout-minutes` (`ci.yml:29`, today 20) raised if the measured solutions-spec time requires it (FR-021). No Windows job is added (SC-004).
  - `packages/cli/vitest.config.ts`: a `cli-soak` project with `execArgv: ['--expose-gc']`, and the soak spec excluded from the `cli` project; `packages/cli/package.json`: the `test:soak` script.
- Baselines†: `packages/language/src/compiler/__tests__/config-baseline.ts` (capture helper) with `__fixtures__/configs-before/` (FR-043), and `specs/058-mcp-server/phase-3-evals-provenance/baseline/smoke-before/` (FR-033).
- Docs: `packages/cli/README.md`, `CHANGELOG.md`, and root `AGENTS.md`† (the `evals:mcp` command line).
- Specs: `specs/058-mcp-server/evals.md` (new), and `specs/058-mcp-server/roadmap.md` (the Phase 3 status line on exit).

### Non-goals (owned elsewhere; roadmap wording quoted)

- **Phase 4** (§7 Phase 4) owns:
  - "`contributes.mcpServerDefinitionProviders` …";
  - "`dev-server,client-runtime` (engine `error` events and console errors posted back …)": this phase builds no runtime error forwarding from `dev`;
  - "`eligian://docs/<id>` resources and the `new-presentation` prompt".
- **Phase 5** (§7 Phase 5) owns:
  - "Promote review checks that the evals proved to DSL validators … (each its own mini-spec)";
  - "MCP registry entry";
  - "server process recycling tuned from the soak test". Phase 3 fixes N = 100 (§2) and only measures; tuning N is Phase 5.
- **Separate specs** (§8) own:
  - decision 10 (the host contract of the `custom` provider);
  - Q11 (a `KeyboardStepSource` provider);
  - Q12 ("warn when events run past the media length. Needs header parsing at check time"). The media clock of this phase parses no media headers;
  - Q15 (`needs` / `provides` for host operations).
- **Q14** ("if evals show `eligian_fmt` is rarely called, fold it into `check`"): Phase 3 reports the `eligian_fmt` call rate in `evals.md` as data for Q14. It does not fold the tool.
- **Never in this roadmap** (§1; §4 "Deliberately NOT tools"; §6.4):
  - new DSL syntax;
  - an HTTP transport;
  - in-server editing;
  - `dev` or `--bundle` as tools;
  - a GitHub workflow for evals: "No GitHub workflow and no API key; add `mcp-evals.yml` only if local runs become too slow" (§6.4).
- **Triage scope**: between the two runs, the phase fixes only the categories that §7 names ("curriculum gaps / tool ergonomics / compiler gaps") plus bounded case-defect corrections (FR-071: a correction may restore §6.2, never relax it). Everything else, including noise, is only recorded in `evals.md`. A fix that needs new DSL syntax is out of scope. §6 stays the definition (§1: "The eval set in §6 is the definition"): no triage step may drop or relax a §6.2 prompt requirement, behavioural assertion or structural assertion.

## Verification record (this session)

| Claim / question | Result | Evidence |
|---|---|---|
| None of the new Phase 3 files exist | confirmed | `[ -e ]` on `packages/cli/src/mcp/evals`, `evals/mcp/{rubric.md,generate-media.ts,fixtures}`, `__fixtures__/mcp-solutions`, `mcp-solutions.spec.ts`, `smoke/{determinism,media-clock}.ts` and `specs/058-mcp-server/evals.md`: all absent. |
| Existing eval cases | 7 of 14 | `ls evals/mcp/cases`: `fix-dataflow` and `fix-selectors` (with `start/` dirs), `title-card`, `three-chapters`, `staggered-list`, `keyboard-deck`, `library-reuse` (each with a `.scenario.json`). Cases 4, 5, 7, 9, 10, 11 and 12 are absent. |
| The runner supports arm A1 only, and one run | confirmed | `run.ts` USAGE: "`--arm A1` the arm: A1 (MCP server + AGENTS.md block) is the only arm in Phase 1"; `parseArgs` rejects any other arm. There is no `--runs`, and no root `evals:mcp` script (`package.json:7-31`). |
| The gate's budget step | rounds, wall clock and tokens only | `gate.ts:24`: `BUDGET = { rounds: 2, wallMs: 15 * 60 * 1000, toolChars: 80_000 }`; step 5 at `gate.ts:776-787`. There is no tool-call budget. `toolCalls(events)` exists (`gate.ts:88`). |
| The gate has its own copy of the controller balance | confirmed | A local `function controllerBalance(config)` at `gate.ts:260`, with `walk` and `resolveOperationData` at `:191-258`: the harness imports nothing from `packages/**`. The language package has `controllerBalance(config: IEngineConfiguration) => readonly ControllerBalance[]` (`compiler/controller-balance.ts:190`), re-exported by `@eligian/language/mcp`. |
| The fields of a telemetry line | `{ t, tool, ms, chars, ok, args }` | `TelemetryLine`, `telemetry.ts:11-18`. It carries no diagnostic codes. `eligian_compile`'s `summarizeArgs` (`tools/compile.ts:122`) has no `explain`, because the tool has none. The transcript is `claude -p --output-format json` (`run.ts:190-191`). |
| `readStoryboard` exists | confirmed | `readStoryboard(text: string) => Storyboard` (`packages/cli/src/mcp/storyboard.ts:56`); `StoryboardBeat` at `:11`. |
| `OperationConfigIR` has no `origin` | confirmed | `eligius-ir.ts:194-196`: `IOperationConfiguration<TOperationData> & { readonly sourceLocation: SourceLocation }`. `grep -rn origin packages/language/src/compiler` (non-test) finds one unrelated comment (`operations/mapper.ts:119`). |
| Source locations reach the map through `SourceMap`, by operation id | confirmed | `SourceMap.operations: ReadonlyMap<string, SourceLocation>` (`eligius-ir.ts:78`). `buildSourceMap` (`config-builder.ts:399-464`) fills it from the start and end operations of every action. `buildEligianMap` reads `sourceMap.operations.get(op.id)` (`eligian-map.ts:60`). `stripOperationSourceLocation` emits only `{ id, systemName, operationData }` (`config-builder.ts:492-501`). |
| The optimizer works on the stripped config | confirmed | `optimize(ir) => Effect<EligiusIR, never>` (`optimizer.ts:25`) runs only `eliminateDeadCode` over `ir.config.timelines`. It removes timeline actions with `end <= start` or `start < 0`, and creates no operations. |
| The operation construction sites (origin candidates) | 52 `systemName:` literals in non-test compiler code | For example: `buildActionCallOperations` (`transformers/action-call-operations.ts:26`, `requestAction` at `:35`); `preserveErasedParameters` (`erased-parameters.ts:80`, `setOperationData` at `:103` and `:112`); the `SAVED_RESULT_KEY` save and restore (`runtime-values.ts:255`, `:268`); `registerRuntimeConcat` and `lowerRuntimeValues` (`runtime-values.ts:69`, `:194`); the `target` select (`timeline-transformer.ts:899-906`); the `with` select (`operation-transformer.ts:364-379`); interactions (`navigate-operations.ts:283`, `:324`, `:350`); `break` and `continue` (`operation-transformer.ts:673`, `:695`); the `setData` for globals (`ast-transformer.ts:150-156`); library qualification (`library-imports.ts:89`); sequence and stagger (`timeline-transformer.ts:90-103`); the `addController` expansion (`operation-transformer.ts:269`, `:277`); `if` and `for` (`:530-583`, `:624-656`). |
| No service reset hook exists | confirmed | `services.ts` holds `let sharedServices` (`:26`) and exports only `getOrCreateServices()` (`:37`; `ts_module_exports` count: 1). `releaseWorkspaceDocuments(uris: Iterable<URI>): void` exists (`parser.ts:364`; re-exported at `compiler/index.ts:94`). `formatSource` keeps its own service set (`lsp/format-source.ts:22`, `:29`). |
| The compiler lock has no call counter | confirmed | `makeCompilerLock(hooks?: CompilerLockHooks)` (`compiler-lock.ts:37`), with the hooks `onQueued`, `onAcquire`, `onRelease` and `latch` (`:13-19`). Phase 1 measured a heap growth of 0.047 MB per `eligian_check` over N = 100 (`phase-1-mvp-server/compliance.md`, FR-053 row), with the script `packages/cli/scripts/measure-heap.ts`. |
| Smoke skips media timelines | confirmed | `smoke-runner.ts:173-175`: `playable = walked.filter(t => t.type !== 'mediaplayer')`; the others are reported with `skipped: 'media timelines need a browser'`. Scenarios likewise (`:273`; `scenario.ts:202`; `mediaOnlyProblem`, `scenario.ts:339`). |
| The jsdom media stubs today | `play`, `pause` and `load` only | `stubMissingBrowserApis` (`dom-environment.ts:67`): `media.play = () => Promise.resolve()`, and no-op `pause` and `load` (`:75-78`). There is no `duration`, `currentTime`, `readyState`, `seekable`, and no media event. |
| What eligius 4.2.0's `VideoPositionSource` needs from the element | `play()`, `currentTime`, `readyState`, `seekable`, `duration`; the events `canplay`, `playing`, `timeupdate`, `ended`, `seeked` (plus `error` and `emptied`) | `node_modules/eligius/dist/engine-factory-39T5FByM.mjs`: `await this._video?.play()` (`:12866`); `readyState === HAVE_NOTHING` (`:12895`); `seekable.length === 0` (`:12900`); a seek resolves on `"seeked"` (`:12918`); `duration` (`:12952`); listeners for `timeupdate` (`:13058`), `ended` (`:13061`) and `playing` (`:13063`); init settles on `canplay` (`:13066-13068`). Version 4.2.0 does not listen to the roadmap's "`loadedmetadata`" (Interpretation I-3). |
| No `--determinism` anywhere | confirmed | `grep -rn "determinism\|position-nondeterministic" packages/cli/src` (non-test): nothing. The smoke flags in `main.ts` are `--format`, `--strict`, `--timeline`, `--step-timeout-ms` and `--scenario` (`main.ts:422-444`). |
| `SMOKE_CODES` today | 16 codes | `smoke-runner.ts:41-58`, including `scenario-media-timeline`. |
| The overlays today | operations: 13 of 79; diagnostics: 62 files; allowlist: 125 | `ls curriculum/operations` gives 13 (`addClass` … `wait`); `grep -c '"systemName":' registry.generated.ts` gives 79; `missing-overlays.json` has 125 entries; `PHASE_1_ALLOWLIST_SIZE = 126` (`mcp-knowledge.spec.ts:748`). |
| The three generated chunks are not built | confirmed | `grep -n "dom-events\|key-names\|html-elements" scripts/generate-knowledge.ts` finds nothing. `ls dist/docs/generated` gives `config-shape`, `controllers`, `dataflow-tables`, `diagnostics`, `events`, `examples/`, `operations/`, `operations-index`, `starters/` and `syntax-cheatsheet`. The sources: `DOM_EVENTS` (`utils/dom-events.ts:9`) and `KEY_COMPLETIONS` (`utils/key-names.ts:83`), both exported by `@eligian/language/mcp`; and `HTML_ELEMENT_NAMES`, `HTML_ELEMENT_ATTRIBUTES`, `COMMON_HTML_ATTRIBUTES` and `getElementAttributes` (`completion/html-elements.generated.ts:16`, `:174`, `:138`, `:1713`), which the `mcp` entry does not export. |
| The index and block budgets | index: 137 entries, at most 12,000 chars; block: at most 8,192 bytes | The kinds in `dist/docs/index.json`: operation 80, example 17, mapping 11, workflow 8, reference 7, orientation 5, runtime 5, starter 4. The index bound is asserted at `mcp-docs.spec.ts:95` (≤ 12000); Phase 2 FR-077 leaves "about 3,000 chars of headroom for Phase 3's chunks". The block bound is at `agents.spec.ts:11` (8,192 bytes). |
| The instructions and `init` still omit `explain` | confirmed | `MCP_PHASE = 2` (`instructions.ts:13`); `INSTRUCTIONS: Record<1 \| 2, string>` (`:69`); the `WORKFLOW_PHASE_2` comment "I-1: the `eligian_compile` line has no `explain` (Phase 3)" (`:35`); `tools/init.ts:91`: "§4's next steps, without `explain` (I-1: Phase 3)". |
| D-L2 and D-L3 are still open | confirmed | `phase-2-inspect-smoke-context/baseline/lottie.txt`: `mapConfigAssetRefs` (`asset-collector.ts:294`) covers provider sources only; `dev-server.ts:190-206` serves the build dir only; `lottie-web` throws at import under jsdom ("Cannot set properties of null (setting 'fillStyle')"). |
| The package's `files` and `exports` | `bin/cli.js`, `dist/cli.mjs`, `dist/docs/**`; exports `./package.json` only | `packages/cli/package.json:30-37`; version `1.1.0`. |
| The coverage thresholds | CLI 77.1 / 77.6 / 64.5 / 76.6; language 79.8 / 80 / 69.9 / 79 | `packages/cli/vitest.config.ts:44-47`; `packages/language/vitest.config.ts:75-78`. |
| The gate's tokens-from-tools is A1-only | confirmed | `measure()` (`gate.ts:124-140`) sums `chars` over `readMcpLog(path.join(dir, 'mcp.log'))` (`GateMetrics.toolChars`, `gate.ts:47-48`). An A0 run has no server and no log, so the value is always 0. The transcript holds the tool results (`user` events) and the final `result` event, whose `usage` `run.ts` already records (`run.ts:217`, `:240`). |
| The scenario assertion schema | `hasClass`, `notHasClass`, `text`, `visible`, `controllers`, `timeline`, `position` (number, `{ sameAs }`, `{ greaterThan }`) | `Assertion` (`scenario.ts:29-45`); `text` is an exact match (`element.text !== assertion.text`, `scenario.ts:427`); a failed field reports `scenario-assertion-failed` (`scenario.ts:401-407`). No prefix or DOM-equality form exists, so §6.2 #7 ("text is a proper prefix") and #11 ("DOM equals the DOM at position 0 of a fresh engine"; "equals linear play at 12") cannot be written today. |
| The smoke tool's spawn seam | pid and scenario file only | `SmokeToolOptions.onSpawn?: (pid: number, scenarioFile?: string) => void` (`tools/smoke.ts:55`), called as `onSpawn?.(child.pid, scenarioFile)` (`:347`); the argument array goes only to `spawn` (`:316`). |
| A media source missing next to the entry is a warning | confirmed | `timeline-review.ts:104-116`: `media-file-missing` when the source, resolved against the entry's dir, does not exist. So a solution checked in place without its media fails gate step 1 (`--max-warnings 0`). |
| Smoke specs that pin the media skip | two | `smoke.spec.ts:161-168` expects "timeline './intro.mp4' skipped (media timelines need a browser)"; `mcp-scenario.spec.ts:318-336` expects `scenario-media-timeline`. FR-037 removes both behaviours. |
| CI | one ubuntu job, 20 min | `.github/workflows/ci.yml:26-29`: job `build-and-test`, `runs-on: ubuntu-latest`, `timeout-minutes: 20`, no OS matrix; `grep -rln windows .github/workflows` finds nothing. The test step is `pnpm run test:coverage:ci` (`ci.yml:102`), which in the CLI runs `vitest run --coverage --project cli --project cli-timed && pnpm run test:bin` (`packages/cli/package.json:52`). |
| Vitest supports per-project worker argv | confirmed | vitest 5.0.5 (root `package.json:48`); the test option `execArgv?: string[]` ("Pass additional arguments to `node` process when spawning the worker", `node_modules/vitest/dist/chunks/plugin.d.C8mmycim.d.ts:3631-3641`). The CLI config has the projects `cli`, `cli-timed`, `cli-bin` and no `execArgv` (`packages/cli/vitest.config.ts:19-37`). |

## User scenarios and testing

### User story 1: the maintainer measures whether the server teaches (P1)
`pnpm evals:mcp --arm A1 --runs 3`:
- packs the CLI once;
- runs every case three times under the pinned Sonnet model;
- gates each run;
- writes the JSON of each run, plus a markdown summary with the pass rate, rounds, tool calls, tokens-from-tools (`transcriptToolChars`, `toolChars`, `channelChars`) and the teaching metrics.

`--arm A0` runs the same cases with the docs on disk and no server.

**Independent test**: a vitest spec runs the harness's pure parts against recorded inputs: argument parsing, the majority verdict, the metric computation over a recorded transcript and telemetry log, and the summary rendering. The full run is a local, manual event at the phase exit (§6.4).

**Acceptance scenarios**:
1. **Given** a recorded transcript whose first `eligian_check` result carries `unknown_operation`, and whose earlier calls include `eligian_operations`, **When** the metrics are computed, **Then** `operationsBeforeFirstUnknown` is `true` for that run.
2. **Given** three runs of a case with the verdicts pass, fail, pass, **When** the summary is written, **Then** the case is reported as passing (2 of 3), with the failures of each run listed.
3. **Given** a case whose budget was set from a median of 40 tool calls, **When** a run (of any arm, FR-008) makes 61, **Then** the gate fails step 6 with "tool calls 61 > 60"; under `--call-budget off` the same run passes step 6 and its call count is recorded.
4. **Given** a recorded A0 transcript (no `mcp.log`) whose agent read `node_modules/eligian/dist/docs/generated/operations-index.md` with `Read` and ran `eligian check` with `Bash`, **When** the metrics are computed, **Then** `transcriptToolChars` and the arm's `channelChars` (FR-005, FR-008) are both greater than 0, and `toolChars` (telemetry) is 0.

### User story 2: every case is proven solvable before it is scored (P1)
Each case has a reference solution under `__fixtures__/mcp-solutions/<id>/`. In PR CI, `mcp-solutions.spec.ts` runs the gate on each one: check, fmt, smoke with the scenario and determinism, and compile with the assertions.

**Acceptance scenarios**:
1. **Given** the `staggered-list` solution, **When** the spec runs, **Then** every gate step passes, including `beats.min` and `controllers.balanced`.
2. **Given** a solution edited so that one storyboard beat has no covering timeline action, **When** the spec runs, **Then** `storyboard.beatsCovered` fails and names that beat.

### User story 3: the agent learns where each compiled operation came from (P1)
After its first timeline passes check, the agent calls `eligian_compile({ path, select: { timeline: 'Intro' }, explain: true })`. For each emitted operation it sees the origin (for example `erased-save`, `target` or `call`), the rule that produced it, and the curriculum id to read.

**Acceptance scenarios**:
1. **Given** an event `target "#box" [ addClass("in") ] [ removeClass("in") ]`, **When** it is explained, **Then** both `selectElement` operations have the origin `target`, and the rule names the curriculum chunk that the rule table assigns to `target`.
2. **Given** a called action, **When** it is explained, **Then** its `requestAction` / `startAction` pair has the origin `call`.

### User story 4: smoke proves that the DOM is a function of the position (P1)
`eligian smoke main.eligian --determinism`:
- reports `position-nondeterministic` for a class that one range adds and nothing removes, located at the range that adds it;
- reports nothing for a program whose end blocks invert their starts.

### User story 5: media presentations are smoked (P2)
`eligian smoke` plays a video or audio timeline on a fake media clock. The walk visits its boundaries and scenario `seek` steps move it, instead of a `skipped` report.

### User story 6: a long-lived server stays bounded (P2)
After 200 `eligian_check` calls:
- the heap growth stays under the ceiling;
- the services were recycled after call 100;
- the results before and after the recycle are identical.

### User story 7: every code and every operation has teaching (P2)
Any diagnostic code that the server can emit, and any registry operation, resolves to an overlay through `eligian_docs` or `eligian_operations`.

## Requirements

### A. Eval harness (roadmap §6.3, §6.4; §7 Phase 3 days 1–3 and 8–10)

- **FR-001**: `evals/mcp/run.ts` MUST accept:
  - `--case <id>`, repeatable; the default is every case in `evals/mcp/cases/*.json`;
  - `--arm A0|A1|A-none`, repeatable; the default is `A1`;
  - `--runs <n>`; the default is 1;
  - `--model <m>` (Interpretation I-6).

  Cases run serially. *(§6.4: "`pnpm evals:mcp [--case <id>] [--arm A0|A1] [--runs n] [--model sonnet|opus]` … cases serial")*
- **FR-002**: The root `package.json` MUST gain `"evals:mcp": "tsx evals/mcp/run.ts"` (§7 Touches: "root `package.json` (`evals:mcp`, local `claude -p` driver)").
  - The harness stays outside Biome and every tsconfig.
  - It imports nothing from `packages/**/src` (§6.4). It reaches the assertion library only through the build output `packages/cli/dist/evals/assert.mjs` (FR-083).
- **FR-003**: The arms (§6.3):
  - **A1**, as today (`run.ts`): the tarball installed; a `.mcp.json` with `node <tmp>/node_modules/eligian/bin/cli.js mcp` and `ELIGIAN_MCP_LOG`; an `AGENTS.md` from `dist/docs/agents-block.md`.
  - **A0**: the same project and `AGENTS.md`, the docs on disk (`node_modules/eligian/dist/docs`) and the CLI, but **no** `.mcp.json`. `--allowedTools` drops `mcp__eligian__*`, and `--strict-mcp-config` gets an empty server set.
  - **A-none**: no `AGENTS.md` and no server; the docs directory is removed from the installed package. It runs "once, at the Phase 3 first run, for the record" (§6.3).
- **FR-004**: The driver is `claude -p "<prompt>" --mcp-config <file> --strict-mcp-config --permission-mode acceptEdits --allowedTools <the arm's list> --output-format json --model <pinned id>` (§6.4). Every result records the model id used.
- **FR-005**: For each run, the harness writes `evals/mcp/results/<run-id>/<case>/<arm>-<n>.json`. It holds:
  - pass or fail, with the failures of each gate step;
  - rounds, tool calls and the tool-call sequence;
  - three size measures (Interpretation I-12):
    - `transcriptToolChars`, **the arm-neutral tokens-from-tools**: the total characters of every `tool_result` item in the `user` events of the `claude -p` transcript, whatever the tool (`Read`, `Bash`, `Grep`, `mcp__eligian__*`, …); for a `tool_result` whose `content` is an array, the `text` of its items. It exists in every arm, and SC-002 compares it;
    - `toolChars`: the sum of the telemetry `chars` (`measure()`, `gate.ts:132-135`), the §1 "Context cost" of the `eligian_*` tools; 0 in A0 and A-none;
    - `channelChars`: the characters of the arm's teaching channel, the quantity budgeted by step 6 (FR-008);
  - the `usage` of the final `result` event (input and output tokens), as recorded data;
  - the wall time;
  - the detail of each assertion;
  - the metrics of FR-007;
  - the model id and the CLI version;
  - the rubric score (FR-009).

  It also writes `evals/mcp/results/<run-id>/summary.md` (§6.4: "and a markdown summary").
- **FR-006**: The verdict: a case passes for an arm when a strict majority of its runs pass (§8 Risks: "pinned model, 3 runs, majority"). The summary reports, per arm:
  - the cases passed, out of 14;
  - the means of rounds, tool calls and `transcriptToolChars`, **over all runs, aborted runs excluded** (this is the mean SC-002 gates on);
  - the same means over the passing runs only, as reported data that does not gate;
  - the means of `toolChars` and `channelChars`.

  An aborted run (Edge cases) counts toward neither the majority nor the means: three runs of pass, aborted, fail give a fail on a denominator of 2.
- **FR-007**: The metrics (§6.4 "Metrics beyond pass/fail"; §1 "Teaching happened"):
  - `operationsBeforeFirstUnknown` (Interpretation I-11), a boolean for **every** non-aborted run:
    - the **reference point** is the first check result (tool or CLI) that carries `unknown_operation` or `missing-action-dependency`; if the run has none, the first check result of any kind; if the run made no check, the end of the run;
    - `true` when, before the reference point, `eligian_operations` was called or the `operations-index` doc was read (`eligian_docs` returned it, or, in A0, a `Read`/`Bash` call read `generated/operations-index.md`);
    - `false` otherwise.

    The record also keeps `hitUnknown: boolean` (whether the reference point was such a diagnostic), so the fraction over only the runs that hit it is reported as data.
  - `explainCalled`: an `eligian_compile` call with `explain: true` occurred.
  - `fmtCalled`: the data for Q14.
  - rounds, as Phase 1 defines them (`GateMetrics`, `gate.ts:40-50`), and the three size measures of FR-005.

  The data that each metric needs (the diagnostic codes of each check call, `explain` on each compile call) MUST be recoverable from the telemetry log or the transcript. A CLI check is recognised by `isCheckBashCall` (`gate.ts:104`), and its codes are read from the matching `tool_result` text. Where the telemetry line lacks the data, `summarizeArgs` or the telemetry line gains it, for example a `codes` summary for `eligian_check` (distinct codes with counts) and `explain` for `eligian_compile`. No line grows beyond 1,000 characters: a `codes` summary that would exceed it is truncated, with a `truncated: true` marker.
- **FR-008**: The budget (§6.1 step 6):
  - rounds ≤ 2 and wall clock ≤ 15 min, both existing (`gate.ts:24`);
  - **`channelChars` ≤ 80,000** (the existing `toolChars: 80_000`, `gate.ts:24`), where the channel is per arm (Interpretation I-12):
    - A1: `toolChars`, the telemetry sum over the `eligian_*` tools (§1 "Context cost"), as today;
    - A0 and A-none: the `tool_result` characters of the calls that stand in for the server: `Read`/`Grep`/`Glob` calls whose path is under `node_modules/eligian/dist/docs`, and `Bash` calls that run the CLI (`eligian` or `cli.js`, the `CHECK_COMMAND` pattern widened to every subcommand);
  - new: **tool calls ≤ ⌊1.5 × the case's reference count⌋**.

  The reference count is the **median** of `toolCalls(events).length` (`gate.ts:88`) over the passing pinned-Sonnet A1 runs of the **first full run** (FR-023, Interpretation I-9; for an even number of runs, the lower of the two middle values). It is stored in the case JSON as `budget: { toolCalls, fromRun: <run-id>, model }`.
  - **One budget for every arm**: the single per-case gate judges A0, A1 and A-none alike. The cross-arm comparison of tool calls stays a separate term of SC-002 (the means), not part of this step.
  - **`--call-budget off|enforce`** (`run.ts` and the gate; default `enforce`):
    - under `enforce`, the tool-call check applies, and a case without a `budget` fails its gate with "no tool-call budget";
    - under `off` (the first full run), the check is skipped, the call counts are recorded, and a missing `budget` is not a failure.
    - The budgets gate the second full run (the SC-001 run).
- **FR-009**: The rubric (§6.1 step 7):
  - `evals/mcp/rubric.md` holds a pinned judge prompt that scores storyboard quality and provider justification from 1 to 5.
  - The harness runs it with `claude -p` on `STORYBOARD.md` (plus the entry file) of each A1 and A0 run, and records `rubric: { score, model }`.
  - The rubric never gates.
- **FR-010**: Compiled output is compared by action name and timeline uri, never by id (§6.1, last line).

### B. Assertion library (roadmap §6.1 step 4 and §6.2 "Structural"; §7 Touches `assert.ts`)

- **FR-011**: `packages/cli/src/mcp/evals/assert.ts` MUST evaluate a case's declarative `assertions` (in the case JSON) over `{ projectDir, entry, config, map?, storyboard? }`, and return `{ kind, pass, detail }` per assertion.
  - **The kinds**: those of §6.1 step 4: `timelines.count`, `timelines[n].type|positionSource|duration|loop`, `actions.named`, `operations.used`, `controllers.used`, `controllers.balanced`, `files.exist`, `layout.hasId`, `locales.languages`, `storyboard.exists`, `storyboard.beatsCovered` and `beats.min(n)`; plus `config.equivalent`, for case 12 (FR-028).
  - **Unknown kinds** are an error of the case file, caught by `eval-cases.spec.ts`.
  - **The inline checks of `gate.ts`** (`checkTitleCard`, `checkThreeChapters`, `checkStaggeredList`, `checkKeyboardDeck`, `checkLibraryReuse`, `checkFixDataflow`, `checkFixSelectors`; `gate.ts:369-686`) MUST be re-expressed as declarative assertions in their case files, and removed from `gate.ts`.
  - **Case-specific facts** that no §6.1 kind expresses, such as "6 stagger actions 0.4 s apart", get a narrowly named kind in `assert.ts`, with its own unit test.
  - **`controllers.balanced`** MUST use the language package's `controllerBalance` (`@eligian/language/mcp`). The copy in `gate.ts` (`gate.ts:191-284`) is deleted.
- **FR-012** (`storyboard.beatsCovered`; §5 step 1, §6.1): `STORYBOARD.md` is parsed with `readStoryboard` (`storyboard.ts:56`).
  - **Beat rows**: every row `| timeline | start | end | selector | change | end-block |` MUST map to a timeline action of that timeline such that:
    - the timeline is found by its source name, matched to the config timeline by index (the Phase 1 FR-030 ruling);
    - the action's `[start, end]` covers the beat's range, within `POSITION_TOLERANCE_S` (`scenario.ts:86`);
    - its start or end operations contain an operation whose `selector` operation data equals the beat's selector. `requestAction` / `startAction` calls are followed, with operation-data substitution.
  - **Interaction rows**: every row of the `interactions` table maps to a listener action (the `__on__*` and `__nav__*` names, `navigate-operations.ts:169`, `:184`).
  - **Failure detail**: the unmatched rows.
- **FR-013** (`beats.min(n)`): the number of ranged timeline actions (those with an `end`; lifecycle actions excluded, as Phase 2 FR-025 counts them) is at least n.
  - n is the case's value or, when the case says `"storyboard"`, the storyboard's beat count (§6.1: "so warnings cannot be silenced by deleting code").
  - For cases 13 and 14, n is the count of the start state ("`beats.min` unchanged", §6.2 #13).
- **FR-014**: The gate (`gate.ts`) runs the steps of §6.1 in order:
  1. `check <entry> --max-warnings 0 --selector-not-in-layout ids`;
  2. `fmt --check "**/*.eligian"`;
  3. `smoke <entry> --strict --format json --scenario <case>.scenario.json --determinism`;
  4. `compile <entry> --eligian-map -o out/config.json`, then the assertions;
  5. the scenario's behavioural assertions, read from the output of step 3;
  6. the budget (the tool-call part per FR-008; skipped under `--call-budget off`, as in the first full run).

  Every CLI step runs the installed tarball (`node node_modules/eligian/bin/cli.js`).
- **FR-015** (the scenario part of the assertion DSL; §7 days 1–3 "assertion DSL incl. scenario"; §6.2 #7 and #11): the scenario `Assertion` schema (`scenario.ts:29-45`), `parseScenario` and `runScenario` MUST gain two fields, so that every §6.2 behavioural assertion is expressible:
  - **`textPrefixOf: string`**: passes when the element's text is a **proper prefix** of the given string: non-empty, strictly shorter, and `string.startsWith(text)`. (Case 7: "seek 2 → text is a proper prefix".)
  - **`domEquals: { freshAt: number } | { linearAt: number }`**: passes when the snapshot of every layout id at the `after` step equals the snapshot that a **fresh engine** produces by seeking straight to t (`freshAt`), or by **linear play** to t (`linearAt`, Interpretation I-2), on the timeline active at that step; each reference engine is built as FR-030 builds its paths (`init`, then `switchTimeline(uri, 0)`, then the path's seeks). The comparison is the FR-031 state (`ElementSnapshot`), and the two paths are the same functions as `determinism.ts` uses (no second implementation). (Case 11: "click `#restart` → DOM equals the DOM at position 0 of a fresh engine"; "click `#skip` → … the DOM equals linear play at 12".)
  - A failure reports the existing `scenario-assertion-failed` (`scenario.ts:401-407`): for `textPrefixOf`, `expected` the full string and `actual` the text; for `domEquals`, one problem per differing (element, property), with `expected` the reference path's value.
  - Each field is accepted only alone with `selector` (`textPrefixOf`) or without `selector` (`domEquals`); other combinations are rejected by `parseScenario` with the existing schema-error path.
  - The `runScenario` context gains what `domEquals` needs to build a fresh engine (the plan names it); scenarios without `domEquals` build no second engine.

### C. Reference solutions and the solutions spec (roadmap §6.2 header; §6.4, last bullet)

- **FR-020**: Each of the 14 cases MUST have a reference solution in `packages/cli/src/__tests__/__fixtures__/mcp-solutions/<id>/`. It is a complete project that passes gate steps 1–5 once materialised (FR-021): the entry, `layout.html`, the CSS, `STORYBOARD.md`, and the locales, host and library files that the case needs. The media files are not duplicated: the fixtures reference the generated media (FR-026), at the paths the case prompt names (`media/intro.mp4`, `media/song.mp3`).
- **FR-021**: `packages/cli/src/__tests__/mcp-solutions.spec.ts` MUST run gate steps 1–5 on every solution.
  - **Materialising**: each solution is copied into a fresh temp dir, and every file that the case JSON lists under `fixtures` (for cases 4 and 9, `evals/mcp/fixtures/media/*` → `<tmp>/media/`) is copied in, **before** step 1. The copy is done by the same fixture-materialising function that the harness uses for an agent's project (FR-022), so the spec reproduces the gate's real precondition: without the copy, step 1 fails with `media-file-missing` (`timeline-review.ts:104-116`).
  - It runs the steps through the in-repo CLI (`packages/cli/bin/cli.js`), with a per-test timeout of 120 s (§6.2: "per-test timeout 120 s for smoke").
  - It needs a fresh build: like Phase 2's SC-006 precondition, it fails (it does not skip) when `dist/cli.mjs` is missing or stale.
  - **Where it runs**: in the CLI's `cli` vitest project, so in `pnpm test` locally and, in PR CI, in `pnpm run test:coverage:ci` (`ci.yml:102`; `packages/cli/package.json:52`), after `pnpm run build` (`ci.yml:60`).
  - **Time budget**: the whole file runs in at most 6 minutes on the CI runner. The plan records the locally measured wall time of the file; if the measured CI duration of the job, with this file added, comes within 3 minutes of `timeout-minutes` (`ci.yml:29`, 20 today), the timeout is raised in `ci.yml` in the same change, and the new value is quoted in `compliance.md`.
- **FR-022**: The spec MUST share the assertion, step and fixture-materialising logic with `gate.ts` and `run.ts` (FR-083: the harness imports the build output, the spec the source). It does not re-implement them.
- **FR-023**: There are no separate reference runs, and the Phase 2 results are not reused for budgets. A case's `budget` (FR-008) is set **after the first full run** (FR-070) as the median tool-call count of that case's passing pinned-Sonnet A1 runs.
  - The median is a pure, unit-tested function (`medianBudget(runs)`, in the harness's pure parts): only passing, non-aborted, pinned-Sonnet A1 runs count; no such run gives no budget.
  - `pnpm evals:mcp --write-budgets <run-id>` writes `budget: { toolCalls, fromRun, model }` into each case file that has a median; it is run by the user in the user-driven step (FR-074).
  - A case without a passing run keeps no `budget` (Edge cases).

### D. The remaining eval cases and the media fixtures (roadmap §6.2, §6.4)

- **FR-025**: The files `evals/mcp/cases/{video-subtitles,scrollytelling,typewriter-counter,audio-lyrics,host-module,replay-safe,port-from-json}.json` (cases 4, 5, 7, 9, 10, 11 and 12) MUST exist.
  - **Format**: the Phase 2 case format (`id`, `prompt`, `entry`, `model`, `scenario`), plus `assertions`, `fixtures` where the case supplies files, and `budget` (absent until the first full run has set it, FR-023). *Ruling 2026-11-05 (build, T041 blocked): every path a case file holds (`scenario`, `fixtures[].from`, the `config.equivalent` `fixture`) is relative to `evals/mcp/cases`, the one `casesDir` of the library, the spec and the harness; the fixtures are therefore `../fixtures/…`.*
  - **Prompt**: the §6.2 prompt, followed by the element ids and timeline names that its scenario uses (Phase 2 Interpretation I-5).
  - **Model**: the pinned Sonnet-class id of the existing cases (`"claude-sonnet-5-5"`).
  - **Scenario**: every §6.2 behavioural assertion of the case, now including the determinism parts ("determinism clean"), written with the existing fields or the FR-015 fields (`textPrefixOf` for case 7, `domEquals` for case 11). None is dropped or weakened.
  - **Assertions**: every item of the case's §6.2 "Structural" column, expressed with an FR-011 kind or a narrowly named kind (FR-011, last-but-one bullet). For example: case 4's "a raf hub timeline first", "`media-timeline-first-without-start-gesture` clean" and "CSS sizes `.eligius-video`"; case 7's "`for`/`sequence`", "`calc`/`math` + `setElementContent`" and "W151 clean"; case 9's "`__on__seek*` actions"; case 10's "`extensions \"./host.ts\" { operation score(answer: string) }`" and "`on click … run`". `plan.md` lists, per case, each Structural item and the assertion(s) that encode it.
- **FR-026**: `evals/mcp/generate-media.ts` MUST be a dependency-free TypeScript writer (no ffmpeg, no media package) that generates, deterministically, a 30 s silent mp4 and a 20 s silent mp3 into `evals/mcp/fixtures/media/`, each under 500 KB.
  - **mp3**: repeated silent MPEG-1 Layer III frames, 20 s of them.
  - **mp4**: hand-written ISO-BMFF boxes (`ftyp`, `moov` with its `trak` / `stbl` tables including `avc1` and `avcC`, `mdat`) around one embedded tiny H.264 black frame (a byte constant in the generator) held for 30 s. *Ruling 2026-11-05 (compliance, T071 browser check): the frame is stored once and referenced by 30 samples of 1 s (one chunk per sample, every chunk offset at the frame); a single 30 s sample ends at once in Chrome ("play() request was interrupted by end of playback", `baseline/media-browser-check.txt` §1, §3). Playable is the user's Q7 answer, so it wins over the one-sample wording.*
  - Both play in a browser (`eligian dev`) and are byte-identical across OSs (no timestamps or host-dependent bytes).
  - The files are committed without LFS (§6.4 "Media fixtures").
  - Cases 4 and 9 copy them into the project as `media/intro.mp4` and `media/song.mp3`.
- **FR-027**: Case 10 (`host-module`) passes only when `smoke` reports no `host-operation-returned-non-object`, and when a covering range (not a `wait`) hides the result panel after 3.5 s (§6.2 #10).
- **FR-028**: Case 12 (`port-from-json`):
  - The fixture is the compiled JSON of the `chapters` starter extended with one tour chapter. That project passes the strict gate itself (§6.2 #12), and it is kept as the case's reference for the scenario.
  - `config.equivalent` compares the ported config with the fixture JSON (`../fixtures/port-from-json/config.json`, relative to the cases dir; the T041 ruling) through `configFragment` (`config-fragment.ts:85`: ids stripped, keyed by name and uri). It requires the same timelines (uris and durations), the same action names, the same operation sequence per action (order-insensitive on inserted `setOperationData`), and the same controllers.
- **FR-029**: `eval-cases.spec.ts` MUST cover all 14 cases. Each case:
  - parses;
  - pins its model id;
  - names an existing scenario that `parseScenario` accepts;
  - has only known assertion kinds;
  - for the seven new cases: covers every §6.2 Structural item, checked against a per-case table in the spec (the Structural item, verbatim, → the assertion kind(s) that must be present in the case file), which mirrors the `plan.md` mapping of FR-025;
  - if it has a `budget`, the budget is well-formed (`toolCalls` a positive integer, `fromRun` an existing results dir, a pinned model); a case without one is accepted until the user-driven step writes the budgets (FR-023, FR-074).

  The negative start states still yield exactly their planted codes (the existing tests).

### E. `smoke --determinism` (roadmap §4 Verify "Determinism (Phase 3)"; decision 5)

- **FR-030**: `eligian smoke --determinism` (and the `smokeConfig` option `determinism: true`) MUST compare three DOM states of **all** the layout's elements that have an id (not only those inside the timeline's container), for every played timeline (media included, FR-035) and every boundary t (`boundaries(timeline)`, `smoke-runner.ts:328`) (§4).
  - **Three fresh engines per timeline**, whether or not it is the first timeline (36 for the 12-timeline deck). Each engine runs `init`, then `switchTimeline(uri, 0)`, then its path:
    - (a) **linear**: ascending boundary seeks (Interpretation I-2);
    - (b) **fresh**: a seek straight to t;
    - (c) **end-back**: a seek to the timeline's end, then back to t.
  - The plan fixes how each path's engine is stepped across the boundaries and how long each seek settles (Edge cases); the engine count stays three per timeline.
  - *Ruling 2026-11-05 (build, T015 blocked):* a seek never resets the DOM (Eligius ends the active actions that no longer cover the position and starts the ones that do; what an earlier visit left behind stays), so with the plan's ascending visits the fresh and end-back engines carry every leftover forward and all three paths agree on the `never-removed` fixture (measured: 0 problems). The two jump paths therefore visit the boundaries in **descending** order (latest t first), each still `seek(0)` or `seek(end)` then `seek(t)`, on one engine each; the engine count stays three. A difference a leftover of a later visit causes at an earlier t is a real path dependence and counts (it is folded into the recurrence count).
- **FR-031**: The compared state:
  - **Per element**: the scenario snapshot's `{ classes, text, style, visible }` (`ElementSnapshot`, `scenario.ts:57`), with the program's CSS injected (`injectStyles`, `dom-environment.ts:46`), as in the scenario engine.
  - **Each difference** MUST be reported as one error problem with the code **`position-nondeterministic`**, which is added to `SMOKE_CODES`.
  - **What one difference is** (§4: "report every element/class that differs"): for `classes`, each class name that is present on one path and absent on another is its own difference; for `text`, `style` and `visible`, the property is the difference.
  - **The problem carries** the timeline, t, the element id, the property (and, for `classes`, the class name) and the three values: `expected` is the linear value, `actual` the value of the path that differs.
  - **Location**: the timeline action of that timeline whose operations select that element and whose range starts or ends nearest before t; otherwise, the timeline's source.
- **FR-032**: A difference is reported once per key, at the first boundary where it appears *(ruling 2026-11-05: the first boundary the jump paths visit, which is the latest t, so FR-031's location rule finds the range that ends before it)*, with the count of the further boundaries where it recurs. The key is (timeline, element, class) for `classes` and (timeline, element, property) otherwise. This keeps the output bounded without merging two classes into one problem.
- **FR-033**: `--determinism` combines with `--timeline`, `--scenario`, `--strict` and every format. `ndjson` emits each problem as a `problem` line as soon as it is found.
  - **Without the flag**, for every program with no `mediaplayer` timeline, the output is byte-identical to Phase 2's. Measured by capturing `node packages/cli/bin/cli.js smoke <file> --format json` for every file of the `smoke:examples` corpus (root `package.json:26`), plus the non-media fixtures of `smoke.spec.ts` and `smoke-ndjson.spec.ts`, into `baseline/smoke-before/` before any smoke change, and diffing the same capture after (the `ms`/time fields, if any, normalised by the capture script).
  - **The named exception**: programs with a media timeline change by FR-037. The expectations at `smoke.spec.ts:161-168` (the "skipped (media timelines need a browser)" line) and `mcp-scenario.spec.ts:318-336` (`scenario-media-timeline`) are rewritten per FR-037, and no other expectation of those specs changes.
  - *Ruling 2026-11-05 (build, T016 / T020 blocked):* a second expectation of `smoke.spec.ts` replays the Phase 2 baseline files (`pretty and github outputs are byte-identical to the baseline`), whose two `media.eligian` sections also change by FR-037. That test skips the sections whose arguments name a media program (`MEDIA_PROGRAMS`); the Phase 2 baseline files are not edited; the media output is pinned by `smoke-media.spec.ts`. The capture script's `--diff` prints `new <file>` for a corpus file with no capture (a fixture added after G0) and does not count it as a difference; only a byte difference fails.
- **FR-034**: The `eligian_smoke` tool gains `determinism?: boolean` (default false), passed to the child as `--determinism` (the Phase 2 FR-040 deferral). Its description mentions it, within the existing limit of 16,384 chars and the `KEYWORDS` rule.

### F. Media clock (roadmap §4 Verify "Media (Phase 3)"; §7: "cases 4, 9 run instead of skipping")

- **FR-035**: `packages/cli/src/smoke/media-clock.ts` MUST give jsdom's `HTMLMediaElement` a fake clock that is sufficient for eligius 4.2.0's `VideoPositionSource` (see the Verification record):
  - `duration`;
  - `currentTime`, settable; setting it fires `seeking`, then `seeked`;
  - `readyState`, at least HAVE_ENOUGH_DATA once loaded;
  - `seekable`, one range `[0, duration]`;
  - `paused`;
  - `play()`, which starts the clock and fires `playing`;
  - `pause()`;
  - the events `canplay`, `timeupdate` and `ended` (Interpretation I-3 covers `loadedmetadata`).
- **FR-036**: The clock's duration is the `duration` of the compiled timeline (Interpretation I-3). Positions change only through explicit seeks (the walk, and scenario `seek` steps) and through real time between `play()` and `pause()` (scenario `wait`), so runs stay deterministic.
- **FR-037**: With the clock installed:
  - media timelines MUST be walked;
  - scenario steps on media timelines MUST run;
  - determinism (FR-030) covers media timelines;
  - for a media timeline, neither the `skipped: 'media timelines need a browser'` path (`smoke-runner.ts:173-175`) nor the media-only scenario problem (`scenario-media-timeline`, `mediaOnlyProblem`) MUST fire any more.

  The plan decides whether `scenario-media-timeline` stays in `SMOKE_CODES` (if it finds a case that still needs it) or is removed together with its overlay. The drift tests follow that decision.
- **FR-038**: The clock does not read the media file. A missing file still smokes; it is reported by `check` (`media-file-missing`, review pass). `jsdom` stays a dynamic import (the Phase 0 lazy-import rule), and only the smoke runner imports `media-clock.ts`.

### G. Provenance: `origin` (roadmap §4 `eligian_compile` "Provenance prerequisite"; decision 7)

- **FR-040**: `OperationConfigIR` (`eligius-ir.ts:194`) MUST gain `origin: OperationOrigin`, where `OperationOrigin = 'source' | 'call' | 'param-binding' | 'erased-save' | 'erased-restore' | 'concat' | 'saved-result' | 'target' | 'with' | 'interaction' | 'lifecycle' | 'loop-control' | 'init-globaldata' | 'sequence' | 'stagger' | 'library-qualified'` (§4, verbatim). The field is required (Interpretation I-4), so every construction site sets it.
- **FR-041**: Every transformer that creates or rewrites an `OperationConfigIR` MUST set the origin of the construct that generated it. The Verification record lists the sites.
  - Every value of the union MUST be produced by at least one compiled fixture.
  - A value for which the plan finds no site is removed from the union, with the reason recorded in `plan.md` and `compliance.md`.
- **FR-042**: The origin MUST be carried, by operation id, through the `SourceMap` (`eligius-ir.ts:75`, filled in `buildSourceMap`, `config-builder.ts:399`) and the optimizer (`optimizer.ts:25`), into `EligianMapOperation` as `origin?: OperationOrigin` (`eligian-map.ts:23`). The `--eligian-map` output and `eligian_compile`'s `includeMap` carry it.
- **FR-043**: The origin MUST NOT appear in the compiled Eligius config: `stripOperationSourceLocation` (`config-builder.ts:492`) keeps emitting `{ id, systemName, operationData }` only. For every example and fixture, the compiled config, with ids normalised, is byte-identical before and after the provenance change:
  - **The corpus**: every `.eligian` file under `examples/**` and `packages/language/src/compiler/__tests__/__fixtures__/**` that compiles without errors at the capture commit (libraries and error fixtures drop out by that rule; the capture lists the files it skipped).
  - **The normalisation**: every string matching the UUID shape `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` becomes `<id>`, wherever it occurs (keys excluded); the JSON is written with `JSON.stringify(value, null, 2)` and a trailing newline.
  - **The capture**: a helper `packages/language/src/compiler/__tests__/config-baseline.ts` (exports `normaliseIds` and `compileForBaseline(file)`, which uses the language package's `compile`), run as `pnpm exec tsx packages/language/src/compiler/__tests__/config-baseline.ts --write` **before** any `origin` change lands (the plan orders this task first), writes `__fixtures__/configs-before/<path relative to the repo root>.json`, committed.
  - **The check**: `origin.spec.ts` recompiles every baseline file's source with the same helper and asserts equality with the committed baseline, one test per file, so the check reruns in every `pnpm test`.
- **FR-044**: The language package's coverage stays at or above lines 79.8, functions 80 and branches 69.9 (`packages/language/vitest.config.ts:75-77`). `pnpm effect:check:language` reports 0 errors and 0 warnings for the touched Effect modules.

### H. `eligian_compile` `explain` (roadmap §4 `eligian_compile`)

- **FR-045**: `eligian_compile` MUST accept `explain?: boolean` (default false). With `explain: true` the response appends (§4: "appends per emitted operation its `origin` and the rule text with the curriculum id"):
  - for each emitted operation of the returned fragment: `{ systemName, origin, location }`;
  - a `rules` dictionary `origin → { rule: string, docs: <index id> }`, listing each origin present once.

  Interpretation I-5 covers the summary and full views.
- **FR-046**: The rule table (`origin → { rule, docs }`) is one constant in the CLI package. A drift test asserts that:
  - every `OperationOrigin` has an entry;
  - every `docs` id exists in the generated `index.json`;
  - every rule text is at most 300 characters.
- **FR-047**: Further rules for `explain`:
  - `summarizeArgs` records `explain` (FR-007);
  - the concise / detailed superset rule (Phase 2 FR-005) holds with `explain`;
  - a program with errors still returns `{ ok: false, diagnostics }`, with no explain data.

### I. Instructions, next steps, agent context (Phase 2 I-1; roadmap §3.5, §4 `eligian_init`, §5)

- **FR-050**: The instructions (Interpretation I-8):
  - `MCP_PHASE` (`instructions.ts:13`) MUST become `3`.
  - The `eligian_compile` line of `INSTRUCTIONS[3]` MUST be §3.5's "Final (Phase 2+) instructions" verbatim: "once after your first timeline passes check (select it, explain:true), and whenever behaviour surprises you".
  - The `eligian_smoke` line mentions `determinism:true` only if it fits the limit of 4,096 chars.
  - The backtick convention and the ≤ 4,096 assertion stay (Phase 2 FR-003).
- **FR-051**: `eligian_init`'s next steps (`tools/init.ts:91-99`) MUST say "after the first timeline passes check call `eligian_compile(select, explain:true)`" (§4 `eligian_init` Output). The `AGENTS.md` block (`dist/docs/agents-block.md`) carries the same workflow line, and stays at most 8,192 bytes (`agents.spec.ts:11`).
- **FR-052**: `curriculum/verification-ladder.md` MUST teach:
  - `smoke --determinism` (and `determinism:true` on the tool) as the step after scenarios (§3.3 D: "smoke with scenarios → determinism → `dev`");
  - the limits of the media clock: positions only, no decoding, no autoplay policy.

### J. Curriculum completion (roadmap §3.2; §3.3 F and G; §7 Exit: "every registry operation and every code has an overlay")

- **FR-055**: `curriculum/operations/<name>.md` MUST exist for every registry operation (`getAllOperations()`; 80: the 79 names of `registry.generated.ts` plus the synthetic `addController` that `operations/index.ts` adds to `OPERATION_REGISTRY`; *ruling 2026-11-05 (build, Group 17 fixer): the sets are equal; plan P4's "overlays minus registry = [addController]" counted the generated file only*), in the Phase 2 FR-073 format: frontmatter `operation:`; a card of at most 120 words; a body with an Eligian call example as a literate probe, idioms and pitfalls. A test asserts that the set of overlays equals the registry's names.
- **FR-056**: `curriculum/diagnostics/<code>.md` (cause and fix, at most 120 words) MUST exist for every code of the Phase 1 FR-036 catalogue, plus every code added since: review, smoke (including `position-nondeterministic`) and any code this phase adds.
  - `missing-overlays.json` MUST become `[]`.
  - The test "missing overlays are exactly the allowlist" (`mcp-knowledge.spec.ts:703`) becomes "no code lacks an overlay".
  - Codeless diagnostics keep their per-`source` fallback (§3.2).
- **FR-057**: The generator (`scripts/generate-knowledge.ts`) MUST emit (§3.2; Phase 2 FR-099):
  - `generated/dom-events.md`, from `DOM_EVENTS`;
  - `generated/key-names.md`, from `KEY_COMPLETIONS`;
  - `generated/html-elements.md` (element → attributes), from `html-elements.generated.ts`.

  Each chunk gets an index entry of kind `reference` and a `see:` line, and respects the word limits of Phase 1 FR-035. What the generator needs from `html-elements.generated.ts` it imports through `@eligian/language/mcp`; the entry gains those exports, and its exact-exports test is updated.
- **FR-058**: The budgets hold with the new content:
  - the no-argument `eligian_docs` index stays at most 12,000 chars (`mcp-docs.spec.ts:95`);
  - the generated output is deterministic (two runs are byte-identical);
  - every literate probe compiles and matches its snapshot;
  - the drift spec stays green: the registry operations, controllers, events, keywords, starters and schema properties are named in the docs.
- **FR-059**: Triage after the first full run (FR-071) may add or edit curriculum chunks and overlays. Every edit keeps FR-055–FR-058 green, and `evals.md` traces each one to the run failure that it answers.

### K. Langium service recycling and the soak test (roadmap §2 "Memory and staleness"; §7 Touches)

- **FR-060**: The language package MUST export a reset hook, for example `resetServices()` in `compiler/pipeline/services.ts`, exported from `@eligian/language/mcp`. It drops the shared singleton (`services.ts:26`), so that the next `getOrCreateServices()` builds a fresh set. Under Vitest, the fresh set is seeded as today (`services.ts:46`).
- **FR-061**: The compiler lock (`compiler-lock.ts`) MUST count the completed compiler sections. After every N = 100 sections (§2), before it releases the permit, it releases every workspace document (`releaseWorkspaceDocuments`, `parser.ts:364`) and calls the reset hook.
  - **Inside the permit**: no tool section can observe a half-reset state.
  - **Not interruptible**.
  - **Reported** through a new `CompilerLockHooks` callback (for example `onRecycle(count)`), for the tests.
  - **N** is a constructor option (default 100), so that the specs can use a small N.
  - `formatSource`'s separate service set (`lsp/format-source.ts:22`) is not recycled (Interpretation I-10).
- **FR-062**: Results MUST be identical across a recycle:
  - the same `eligian_check`, `eligian_compile` or `eligian_project` call, made immediately before and immediately after a recycle, returns deep-equal results (ignoring `header` and ids);
  - the four staleness cases of Phase 2 FR-085 still pass when a recycle falls between the edit and the second call.
- **FR-063**: The soak test (§2: "a soak test (200 checks, heap ceiling)"):
  - 200 sequential `eligian_check` calls through the in-process server, on one fixture;
  - the heap is read after a forced GC, before the first call and after the last.

  The wiring, so that the spec cannot pass by skipping:
  - the spec (`mcp-soak.spec.ts`; the plan may rename it) is excluded from the `cli` project and included only in a new `cli-soak` vitest project with `execArgv: ['--expose-gc']` (vitest 5's per-worker node arguments; Verification record);
  - the script `"test:soak": "vitest run --project cli-soak"` in `packages/cli/package.json` runs it, with `ELIGIAN_SOAK=1` set for the run (set inside the spec's project config `env`, so it needs no shell syntax on Windows);
  - the spec **fails** (it does not skip) when `typeof globalThis.gc !== 'function'`, with a message naming `test:soak`;
  - `ci.yml` gains a named step `Soak test` that runs `pnpm -C packages/cli run test:soak` after the build.

  `measure-heap.ts` gains the 200-call mode and prints the readings.

### L. The Lottie defects deferred from Phase 2 (roadmap §7 Phase 3 "Deferred from Phase 2")

- **FR-065** (OQ-1, decided): Phase 3 MUST fix D-L2 and document D-L3.
  - **D-L2, fixed**: `--bundle` and `dev` carry operation-data urls, such as the `url` of `loadJson("./anim.json")`, as assets.
    - The bundler copies the file into the output dir and rewrites the config url to it (`mapConfigAssetRefs`, `rewriteConfigAssetRefs`, `collectAssets`); `dev` serves it with HTTP 200.
    - It applies to the operation-data urls of the registry operations that load a file by url, not to Lottie only (the plan lists them, `loadJson` included).
  - **D-L3, documented, not fixed**:
    - `curriculum/controllers/LottieController.md` and `packages/cli/README.md` state that `lottie-web` fails at import under smoke's jsdom (no canvas), and that Eligius reports this as a missing peer dependency.
    - A vitest test pins that text in the overlay (and the README).
    - There is no smoke change: no canvas stub, no new smoke code (`SMOKE_CODES` is unchanged by this requirement).
  - The controller's status stays `constrained`, and the overlay states the behaviour that this version ships.
  - `compliance.md` records the re-run of the three-mode probe of `phase-2-inspect-smoke-context/baseline/lottie.txt`, with its outcome.

### M. Runs, triage, report (roadmap §7 days 8–10; the §6.3 exit rule)

- **FR-070**: The first full run MUST cover:
  - arms A0 and A1, on all 14 cases, with 3 runs each;
  - A-none once (1 run per case);
  - all on the pinned Sonnet-class model (decision 9).

  The results are committed under `evals/mcp/results/`. The run is user-driven (FR-074), and uses `--call-budget off` (FR-008).
- **FR-071**: Triage MUST classify every failing A1 run into exactly one category:
  - curriculum gap;
  - tool ergonomics;
  - compiler gap;
  - case defect: a case file, reference solution, fixture or scenario that contradicts §6.2 or the shipped engine;
  - noise: the run passes when re-run.

  The first three categories are fixed between the two runs, and each fix is traced to its runs. Case defects are corrected only within this bound:
  - a correction may only change a reference solution, fixture, scenario or prompt detail (an element id, a timeline name, a file path) that contradicts §6.2 or the behaviour of the shipped engine;
  - it MUST NOT drop or relax a §6.2 prompt requirement, a behavioural assertion or a structural assertion, change a budget set by a reference run (I-9), or change the case set;
  - each correction is listed in `evals.md` with its diff and the §6.2 text it restores (or the engine behaviour it matches, with a command that shows it).

  Noise is recorded only.
- **FR-072**: The exit SCs are measured on the second full run: A0 and A1, 3 runs each, on the Sonnet-class model. One Opus-class A1 run per case is added for the record (decision 9: "one Opus-class run per phase exit"). The run is user-driven (FR-074), uses `--call-budget enforce` with the budgets that FR-023 wrote after the first run, and is the run that SC-001–SC-003 are measured on.
- **FR-073**: `specs/058-mcp-server/evals.md` MUST report both runs:
  - per case × arm: the verdicts and the metrics of each run;
  - the A-none record;
  - the triage table, with the fix for each item;
  - the values of the exit SCs;
  - the `eligian_fmt` call rate (data for Q14);
  - the rubric scores (non-gating);
  - if the fallback condition of the §6.3 exit rule holds ("If A0 matches A1"), the outcome of FR-075.

- **FR-074** (execution split, Q1 decided): the build stage implements everything in this spec and runs only what turns the deterministic success criteria green.
  - **Not run by the build stage**: any agent run (`claude -p`): the two full runs, the Opus record, the SC-006(6) manual run. Also not done by it: the triage (FR-071), the budgets (FR-023, `--write-budgets`) and `evals.md` (FR-073).
  - **Run by the user afterwards**: the first full run, the triage, the budgets, the second full run, the Opus record and `evals.md`. The phase resumes with `retry_tasks` for the triage and report tasks, so `tasks.md` keeps those as separate, last, user-driven tasks.
  - **Status until then**: SC-001, SC-002, SC-003, SC-019 and SC-006(6) are reported `open (user-driven)` in `compliance.md`, not failed. The roadmap's Phase 3 status line is not marked complete while they are open.
- **FR-075** (OQ-2, decided): if the second run shows that A0 matches A1 (the §6.3 fallback condition, judged on SC-002's numbers), Phase 3:
  - records the outcome in `evals.md` and in the roadmap (the Phase 3 status line);
  - reports SC-002 as failed.

  It does not shrink the server. The shrink to `check` / `smoke` / `compile` (docs-on-disk + `agents setup`) is a follow-up phase of its own, named in that roadmap record.

### N. CI, packaging, docs, gates

- **FR-080**: `package-bin.spec.ts`:
  - the packed file list stays exactly `bin/cli.js`, `dist/cli.mjs` and `dist/docs/**`: the assertion library is not shipped (FR-083);
  - `initialize` still answers in under 3 s;
  - the static-import test still finds no top-level `jsdom`, `esbuild`, `effect/ai` or bare `eligius` import.
- **FR-081**: The docs:
  - `packages/cli/README.md` documents `smoke --determinism`, the limits of the media clock, and `eligian_compile`'s `explain`;
  - root `AGENTS.md` names `pnpm evals:mcp`;
  - `CHANGELOG.md` gets the entries.
- **FR-082**: The gates, per AGENTS.md:
  - `pnpm typecheck`;
  - `pnpm run ci` with 0 errors and 0 warnings;
  - `pnpm test`;
  - `pnpm effect:check` with 0 errors and 0 warnings for every Effect module touched (the compiler transformers, `compiler-lock.ts`, the tools);
  - `test:coverage:ci`: CLI coverage at or above 77.1 / 77.6 / 64.5 / 76.6, and language coverage at or above 79.8 / 80 / 69.9;
  - `check:examples`, `fmt:examples` and `smoke:examples` green.
- **FR-083** (assertion library build, Q2 decided): `packages/cli/esbuild.mjs` MUST build the assertion library and the gate's step logic (entry `src/mcp/evals/assert.ts`) into `packages/cli/dist/evals/assert.mjs` on every CLI build.
  - `packages/cli/package.json` `files` is unchanged (`bin/cli.js`, `dist/cli.mjs`, `dist/docs/**` only): the build output is never packed (FR-080).
  - `evals/mcp/gate.ts` and `run.ts` import the build output, and nothing from `packages/**/src`.
  - `mcp-solutions.spec.ts` imports the source.
  - There is no hidden CLI subcommand for it.
  - A spec asserts that the build output exists after a build, and that it is absent from the packed file list.

## Success criteria

| SC | Criterion (metric, threshold) | How it is measured |
|---|---|---|
| SC-001 | **Exit**: arm A1 passes at least 12 of the 14 cases within budget (every gate step 1–6, FR-014 and FR-008) on the pinned Sonnet-class model. A case passes when a strict majority of its 3 runs pass. | The second full run (FR-072): `pnpm evals:mcp --arm A1 --runs 3`. The count is quoted from `evals/mcp/results/<run-id>/summary.md` in `evals.md` and in `compliance.md`. User-driven: open at the build stage (FR-074). |
| SC-002 | **Exit**: over all non-aborted runs of the second full run, A1's pass rate is at least A0's, **and** A1's mean rounds, mean tool calls and mean `transcriptToolChars` (the arm-neutral tokens-from-tools, FR-005) are each strictly lower than A0's. The means are those over all runs, aborted runs excluded (FR-006); the passing-runs means are reported only. | The same run with `--arm A0 --arm A1`; the four numbers per arm are quoted from `summary.md`. If the condition fails, FR-075 applies, and the SC is reported as failed. User-driven: open at the build stage (FR-074). Unit test (`evals-harness.spec.ts`): US1-4 (an A0 transcript with `Read` calls gives a non-zero `transcriptToolChars` and `channelChars`, and a zero `toolChars`). |
| SC-003 | **Exit**: `operationsBeforeFirstUnknown` (FR-007, Interpretation I-11) is `true` in at least 90% of the non-aborted A1 runs of the second full run. The denominator is every such run (42 when no run aborts), and is reported. The fraction over only the runs with `hitUnknown: true` is reported alongside, as data. | The metric line of `summary.md`, and the per-run values in the result JSONs. User-driven: open at the build stage (FR-074). Unit test: the metric function over recorded fixtures: acceptance scenario US1-1 (`true`, `hitUnknown: true`); a run where the diagnostic comes before any operations call (`false`); a run with no such diagnostic that read `operations-index` before its first check (`true`, `hitUnknown: false`); a run with no such diagnostic that read nothing before its first check (`false`); a run whose first `unknown_operation` comes from a `Bash` `eligian check` result (the CLI branch). |
| SC-004 | **Exit**: `mcp-solutions.spec.ts` runs gate steps 1–5 on all 14 materialised reference solutions (FR-021) and passes: on `ubuntu-latest` in the PR's CI run, and on Windows locally. Each test takes at most 120 s, and the whole file at most 6 minutes on CI. CI has no Windows job (`ci.yml:26-29`), and this phase adds none: the Windows half is a local run, as in Phases 1–2 (Phase 2 SC-018). | Ubuntu: the PR's CI run, step `pnpm run test:coverage:ci` (`ci.yml:102`), with the spec's duration from the vitest output. Windows: `pnpm -C packages/cli build && pnpm -C packages/cli exec vitest run src/__tests__/mcp-solutions.spec.ts`, output quoted in `compliance.md` ("14 passed" and the duration line). Negative controls in the same spec: (a) a copy of one solution, with the covering range of one beat deleted, fails `storyboard.beatsCovered` (US2-2); (b) the case-4 solution materialised without the media copy fails step 1 with `media-file-missing`. |
| SC-005 | **Exit**: every registry operation has an operation overlay, and every code has a diagnostics overlay: (1) the overlay names equal the `getAllOperations()` names (79); (2) `missing-overlays.json` is `[]`; (3) no code of the catalogue (Phase 1 FR-036, plus `REVIEW_CODES`, `SMOKE_CODES` and this phase's codes) lacks a `curriculum/diagnostics/<code>.md`; (4) every diagnostics overlay, and every operation card, is at most 120 words. | `mcp-knowledge.spec.ts`, with new and amended tests: "every registry operation has an overlay", "no code lacks an overlay". |
| SC-006 | The harness: (1) `run.ts --help` lists `--case`, `--arm A0\|A1\|A-none`, `--runs` and `--model`. (2) A vitest spec over recorded transcript and log fixtures covers: argument parsing; the majority verdict (2 of 3 passes → pass; 1 of 3 → fail; 1 of 2 → fail; pass, aborted, fail → fail on a denominator of 2); budget step 6 (61 > ⌊1.5 × 40⌋ fails, 60 passes, identically for an A0, an A1 and an A-none run; skipped under `--call-budget off`; a case without a `budget` fails under `enforce` with "no tool-call budget"; `channelChars` per arm, FR-008); `medianBudget` (the lower median for an even count; only passing, non-aborted, pinned-Sonnet A1 runs count; none gives no budget); `--write-budgets` (FR-023); the metric computation (SC-002, SC-003 fixtures); and the summary rendering. (3) The arm setup functions: A0 writes `AGENTS.md` and no `.mcp.json`; A-none leaves no `AGENTS.md`, no `.mcp.json` and no `node_modules/eligian/dist/docs`. (4) Every result JSON validates against the result schema, which requires `model`, `cliVersion` and `rubric: { score, model }` (or `rubric: null` when the judge did not run). (5) A recorded run whose rubric score is 1 has the same gate verdict as with a score of 5. (6) `pnpm evals:mcp --case fix-dataflow --arm A0 --runs 1` produces a result JSON for a project that had no `.mcp.json`, and a transcript without any `mcp__eligian__` call. | (1)–(5): `evals-harness.spec.ts` (the plan chooses the name). (6): a manual run by the user in the user-driven step (FR-074), quoted in `compliance.md` then; open at the build stage. |
| SC-007 | The assertion library: (1) each FR-011 kind has a passing and a failing unit test, over a fixture config or project. (2) `storyboard.beatsCovered` matches a beat through a called action (`requestAction` substitution), and rejects one whose selector differs. (3) `beats.min` excludes lifecycle actions. (4) On the Phase 2 regression fixture, `controllers.balanced` gives the same verdict as the language's `controllerBalance`. (5) `config.equivalent` ignores ids and the order of inserted `setOperationData`, and rejects a changed duration. (6) `gate.ts` contains no `controllerBalance`, `walk` or `check<Case>` function. | `mcp-evals-assert.spec.ts` (the plan chooses the name). For (6): `grep -n "function controllerBalance\|function walk\|function check[A-Z]" evals/mcp/gate.ts` finds no match. |
| SC-008 | The cases: `evals/mcp/cases/*.json` holds exactly the 14 ids of §6.2. Each pins a model id; has a scenario that `parseScenario` accepts; has only known assertion kinds; covers, for the seven new cases, every §6.2 Structural item per the spec's mapping table (FR-025, FR-029); and, when it has a `budget`, one whose `fromRun` names an existing results dir (budgets are written after the first full run, FR-023; the spec reports the cases without one and does not fail them). The media fixtures: two files, of 30 s ± 0.1 and 20 s ± 0.1, each under 500 KB; `generate-media.ts`, run into a temp dir, produces files byte-identical to the committed `evals/mcp/fixtures/media/*` (generated and committed on Windows, so the ubuntu CI run checks cross-OS identity). The files are structurally valid and playable (FR-026): the mp3 is made of MPEG-1 Layer III frame headers only; the mp4 has `ftyp`, `moov`, `avc1` with `avcC`, one sample covering 30 s in its sample tables (*ruling 2026-11-05: 30 samples of 1 s over the one embedded frame; one 30 s sample ends at once in Chrome, see FR-026*), and `mdat`. Playing both in a browser through `eligian dev` is a manual check, recorded in `compliance.md`. | `eval-cases.spec.ts` (extended), plus a generator check in the same spec: size; byte equality with the committed files; duration read by a parser in the spec that shares no constant with the generator (mp4: `mvhd` duration ÷ timescale; mp3: frame count × samples per frame ÷ sample rate, from the frame headers). The mapping table: a deliberately incomplete copy of a new case (one Structural assertion removed) fails the coverage test. |
| SC-009 | Determinism: (1) a fixture that adds class `in` in a range whose end block does not remove it reports exactly one `position-nondeterministic` problem (element, property `classes`, class `in`, the three values), located at that range's line (*ruling 2026-11-05: reported at the latest boundary, the first the jump paths visit, with the two others as recurrences*), and exits 1. (2) The version with an inverse end block reports none, and exits 0. (3) A fixture with an `addClass` in a click handler (outside the timeline) does not flag the timeline's ranges. (4) Without `--determinism`, for programs with no `mediaplayer` timeline: the capture of FR-033 diffs empty against `baseline/smoke-before/` (*ruling 2026-11-05: `same` or `new` lines only, exit 0*), and every expectation of `smoke.spec.ts` and `smoke-ndjson.spec.ts` is unchanged except the named FR-037 rewrite (`smoke.spec.ts:161-168`; likewise `mcp-scenario.spec.ts:318-336`; *ruling 2026-11-05: and the baseline replay test skips its `media.eligian` sections*). (5) `--determinism --format ndjson` emits the problem as a `problem` line before `summary` (*ruling 2026-11-05: in "every format reports it", `pretty` and `github` are checked by the FR-031 message, since they print no codes by FR-033; `json` and `ndjson` by the code*). (6) The tool's `determinism: true` reaches the child, measured by behaviour: `eligian_smoke({ paths: [<the (1) fixture>], determinism: true })` returns exactly one `position-nondeterministic` problem, and the same call without `determinism` returns none. (7) A fixture whose range adds two classes `a` and `b` that nothing removes reports two problems, one per class (FR-031, FR-032). (8) For a timeline that is not the first, determinism creates exactly three fresh engines (counted through an instrumented engine factory), each `init` then `switchTimeline(uri, 0)` then its path (FR-030); a nondeterministic class on an element outside the timeline's own container is still reported (all layout ids compared). | `smoke.spec.ts`, `mcp-smoke.spec.ts`, and a new `smoke-determinism.spec.ts`; the FR-033 baseline diff, quoted in `compliance.md`. Precondition: a fresh build (Phase 2 SC-006). |
| SC-010 | The media clock: (1) a video fixture and an audio fixture are walked: their `timeline` lines have `boundaries > 0` and no `skipped`. (2) A scenario `seek 12` on the video timeline gives a `position` of 12 ± `POSITION_TOLERANCE_S`, with the caption that covers 12 visible. (3) `play`, `wait: 500`, `pause` advances the position by more than 0. (4) The walk works with the media file absent. (5) `pnpm run smoke:examples` stays green. (6) The reference solutions of cases 4 and 9 pass with `--determinism`. | `smoke-media.spec.ts` (the plan chooses the name), `mcp-solutions.spec.ts`, `pnpm run smoke:examples`. |
| SC-011 | Provenance: (1) every operation of every compiled example (the `check:examples` corpus) and of every reference solution has an `origin` in its Eligian map entry: 0 missing. (2) Each `OperationOrigin` value occurs in at least one fixture, asserted per value. (3) The compiled configs of the FR-043 corpus (examples and compiler fixtures), normalised by `normaliseIds` (UUID-shaped strings → `<id>`), equal the committed `__fixtures__/configs-before/` baseline, captured by `pnpm exec tsx packages/language/src/compiler/__tests__/config-baseline.ts --write` before the change: one vitest assertion per file, 0 differences. (4) The literate-probe snapshots are unchanged. (5) `pnpm typecheck` passes with `origin` required. | `origin.spec.ts` in `packages/language/src/compiler/__tests__/` (the plan chooses the name), which holds the baseline assertions of (3); the snapshots in `mcp-knowledge.spec.ts`. `compliance.md` quotes the capture command, its commit, and the file count. |
| SC-012 | `explain`: (1) the fixtures of US3-1 and US3-2 give the expected origins. (2) `rules` holds exactly the origins present, and each `docs` id resolves through `eligian_docs`. (3) `explain` is in the telemetry `args`; the `eligian_check` telemetry line built from a result with 50 distinct diagnostic codes (a unit test on the line builder, fed a synthetic result) is at most 1,000 chars and carries `truncated: true` if it had to cut (FR-007). (4) The drift test of the rule table passes. (5) A program with errors returns no explain data. (6) Concise ⊆ detailed with `explain: true`. (7) `eligian_compile({ path, view: 'summary', explain: true })` returns per-origin counts that sum to the program's operation count, and no per-operation list (I-5). (8) `view: 'full', explain: true` lists one entry per emitted operation, keyed by JSON path, and the response stays within the existing `maxResultSizeChars` meta (I-5). | `mcp-compile.spec.ts` (extended), `mcp-telemetry.spec.ts`. |
| SC-013 | Instructions and agent context: `INSTRUCTIONS[3]` is at most 4,096 chars, contains "explain:true" in its `eligian_compile` line, and every backticked token is a tool or an index id. `eligian_init`'s next steps contain `explain:true`. `agents-block.md` is at most 8,192 bytes and names `explain`. `verification-ladder` names `--determinism`. | `mcp-instructions.spec.ts`, `mcp-init.spec.ts`, `agents.spec.ts`, `mcp-knowledge.spec.ts`. |
| SC-014 | The generated chunks: `generated/dom-events.md` names every `DOM_EVENTS` key, `generated/key-names.md` every `KEY_COMPLETIONS` key, and `generated/html-elements.md` every `HTML_ELEMENT_NAMES` entry. Each has an index entry of kind `reference`. The no-argument index is at most 12,000 chars. Two generator runs are byte-identical. | `mcp-knowledge.spec.ts`, `mcp-docs.spec.ts`. |
| SC-015 | Recycling, with N = 3 in a spec: (1) `onRecycle` fires after sections 3 and 6, and never during a section. (2) The release and the reset are both proven: the `LangiumDocuments` instance captured before the recycle has an `all` count of 0 right after `onRecycle` (the release), and `getOrCreateServices()` afterwards returns an instance `!==` the pre-recycle one (the reset). (3) A check result immediately before and immediately after a recycle is deep-equal (ignoring `header`). (4) The Phase 2 staleness cases pass with a recycle between the edit and the re-check. (5) Two concurrent calls that straddle the recycle point equal their sequential baselines. (6) A call interrupted while the recycle runs (held there through the existing `latch` / a hook) does not interrupt it: the recycle completes, and the next call sees the fresh services. (7) A queued call interrupted before it acquires the permit (observed through `onQueued`, `compiler-lock.ts:13-19`) leaves the counter unchanged: the next recycle fires after 3 completed sections. | `mcp-compiler-lock.spec.ts` ((1), (2), (6), (7)), `mcp-staleness.spec.ts`, `mcp-concurrency.spec.ts` (extended). |
| SC-016 | The soak test: 200 sequential `eligian_check` calls with the default N = 100. The heap growth (forced GC, after minus before) is at most 25 MB, and exactly 2 recycles are reported. Phase 1 measured 0.047 MB per call, about 9.4 MB per 200; the ceiling allows about 2.5 times that. The spec fails, not skips, without `globalThis.gc` (FR-063). | `pnpm -C packages/cli run test:soak` (the `cli-soak` project, `execArgv: ['--expose-gc']`), locally on Windows and as the `Soak test` step of `ci.yml`; `compliance.md` quotes its "1 passed" line from both, plus the output of `measure-heap.ts --calls 200`. |
| SC-017 | Lottie (FR-065): (1) D-L2: a bundler spec builds the `loadJson("./anim.json")` + `addController` probe with `--bundle` and asserts that the output dir contains the copied `anim.json` and that the rewritten config url points to it; a dev-server spec starts `dev` on the probe and an HTTP GET of the JSON's served url returns 200. (2) D-L3: `LottieController.md` and `packages/cli/README.md` state both limits (`lottie-web` fails at import under jsdom without canvas; Eligius reports a missing peer dependency); a test pins the overlay text; the status is `constrained`; `SMOKE_CODES` is unchanged and holds no `smoke-controller-unavailable`; no smoke source changes. | The specs named; a `compliance.md` record with the commands and their output (in the format of `baseline/lottie.txt`); `mcp-knowledge.spec.ts` for the overlay and README text. |
| SC-018 | Packaging and gates: the file-list assertion of `package-bin.spec.ts` passes unchanged; `initialize` answers in under 3 s on Windows and Linux; `pnpm typecheck`, `pnpm run ci`, `pnpm test`, `pnpm effect:check` (0 errors and 0 warnings on both projects), both coverage runs (at or above the thresholds) and the three example gates all exit 0. | The commands and their last lines, quoted in `compliance.md`. Linux: the PR's CI run on `ubuntu-latest`. Windows: a local run (CI has no Windows job, `ci.yml:26-29`). |
| SC-019 | The report: `specs/058-mcp-server/evals.md` exists and contains, for both full runs: a table per case × arm; the A-none record; the triage table (every failing A1 run of run 1 classified, FR-071); the values of SC-001–SC-003; the Opus record; the `eligian_fmt` call rate; and the rubric means. | A reviewer reads `evals.md` against `evals/mcp/results/`; `compliance.md` links each number to its results file. |
| SC-020 | The scenario DSL extension (FR-015): (1) `textPrefixOf` passes on a proper prefix, and fails on the full string, on the empty string and on a non-prefix, each failure a `scenario-assertion-failed`. (2) `domEquals: { freshAt: 0 }` passes after a restart that resets the DOM, and fails (naming the element and property) after a "restart" that leaves a class set. (3) `domEquals: { linearAt: t }` passes after a seek to t from a state reached by linear play, and fails on a fixture whose seek path differs from linear play. (4) `parseScenario` rejects `domEquals` with a `selector`, and `textPrefixOf` without one. (5) The case-7 and case-11 scenarios use these fields, and their reference solutions pass (SC-004). | `mcp-scenario.spec.ts` (extended); `mcp-solutions.spec.ts`. |

## Edge cases

- **Windows and Linux paths**:
  - The case JSON gives `fixtures` paths and `files.exist` paths as relative POSIX paths, joined with `path` at run time.
  - Result dir names avoid `:`, as today (`2026-11-05T14-35-51-863Z`).
  - `run.ts` runs `npm` and `pnpm` through the shell on Windows (the `.cmd` shims; `exec` in `run.ts`).
  - `generate-media.ts` must produce identical bytes on both OSs (checked by SC-008 on the ubuntu CI run against the files committed from Windows).
  - `mcp-solutions.spec.ts` spawns `bin/cli.js` with an argument array, so nothing is quoted.
  - The origin and the map locations keep the existing handling of `SourceLocation.file`.
- **Shared Langium services**:
  - The recycle runs inside the compiler permit, after a section completes (FR-061).
  - A cancelled queued call never acquires the permit, and does not count.
  - An interrupted call cannot interrupt the recycle.
  - The existing paths release the documents of a failed section (`parseSourceTracked` releases on error) before the count is taken.
  - Caches outside the services survive a recycle harmlessly: the layout scan cache is module-level and keyed by HTML text (`selector-sources.ts:24-35`).
  - The registries inside the services (CSS, labels) are rebuilt on the next load; SC-015(4) checks this.
- **stdout purity**:
  - Determinism and the media clock run only in the smoke child (Phase 2 FR-041), and the server's stdout stays pure NDJSON (`mcp-stdout.spec.ts`).
  - The harness reads the stdout of `claude -p` as JSON, and reads the server's lines only from `ELIGIAN_MCP_LOG`.
- **Missing files**:
  - A case without a `budget`, without its scenario file, or with a missing fixture file fails its gate with a named message; it does not crash.
  - A media file that is absent at smoke time still plays on the clock (FR-038), but `check` reports `media-file-missing`.
  - A missing `STORYBOARD.md` fails `storyboard.exists`, and makes `storyboard.beatsCovered` fail with "no storyboard".
- **Stale caches**:
  - The harness packs once per run and installs per case.
  - A stale `dist/` in the repo makes `mcp-solutions.spec.ts` fail, with a message naming the build command (the Phase 2 SC-006 precondition).
  - After a recycle, results must equal the pre-recycle ones (FR-062).
- **Cold start**:
  - `origin` adds no import.
  - `media-clock.ts` and `determinism.ts` load only in the smoke child.
  - The reset hook is a plain function.
  - The `initialize` time (under 3 s) is measured again (FR-080).
  - After a recycle, the next compiler call pays the service creation cost once, within the tool budget.
- **Determinism and async operations**:
  - Operations that wait (`wait`, `animate`, async host operations) can make the three paths differ by timing rather than by position.
  - Each seek settles (`SETTLE_MS`, `smoke-runner.ts:124`), and the step timeouts apply (`--step-timeout-ms`).
  - In-flight listener actions are out of scope: they run outside the timeline.
  - The plan fixes how long each path settles. A difference that disappears with a longer settle is a harness bug, not a finding.
- **Long runs**: determinism multiplies the engine work by about 3 per timeline. The tool's default `timeoutMs` (45 s) and partial results (Phase 2 FR-042) still apply, and the tool description repeats "pass `timelines` for a subset".
- **Eval nondeterminism and limits**: runs are repeated 3 times, with a majority verdict. Local subscription rate limits can abort a run. An aborted run (no transcript) is recorded as `aborted` and re-run; it never counts as a fail or a pass, and is excluded from the majority denominator and from the means (FR-006; SC-006(2)).
- **Long CI**: the solutions spec runs smoke with `--determinism` on 14 projects inside the coverage run; its time is bounded by FR-021 (≤ 6 minutes for the file on CI, the job timeout raised in `ci.yml` if needed).
- **A case that no agent passes**: a case with no passing pinned-Sonnet A1 run in the first full run gets no `budget` (FR-023, I-9). In the second run, under `--call-budget enforce`, it fails its gate with "no tool-call budget" (FR-008), and counts as **failing** in SC-001; it is not redefined to make it passable. Only a correction within the FR-071 case-defect bound (one that restores §6.2 or matches the shipped engine) may be made, and if a later passing run then exists, its median sets the budget. `evals.md` lists every such case.

## Existing components (verified, reused)

| Component | File | What is reused (real signature) |
|---|---|---|
| eval runner and gate | `evals/mcp/run.ts`, `evals/mcp/gate.ts` | `loadCase(id): EvalCase` (`gate.ts:58`); `parseTranscript(text): unknown[]` (`:67`); `toolCalls(events): ToolCall[]` (`:88`); `isCheckBashCall` (`:104`); `readMcpLog(file)` (`:109`); `measure(...)` (`:124`); `runGate(options: GateOptions): GateResult` (`:695`); `BUDGET` (`:24`); the pack / install / `.mcp.json` / `claude -p` flow of `run.ts` |
| scenario engine | `packages/cli/src/smoke/scenario.ts` | `parseScenario(json: unknown) => ParsedScenario` (`:109`); `runScenario(engine, window, context) => Promise<readonly ScenarioStepResult[]>` (`:212`); `ElementSnapshot` (`:57`); `POSITION_TOLERANCE_S = 0.1` (`:86`) |
| smoke runner | `packages/cli/src/smoke/smoke-runner.ts` | `smokeConfig(config: IEngineConfiguration, map: EligianMap, options?: SmokeOptions) => Promise<SmokeResult>` (`:133`); `boundaries(timeline: ITimelineConfiguration) => number[]` (`:328`); `SMOKE_CODES` (`:41`); `SmokeProblem` (`:61`, with `expected` / `actual`); `SmokeListener` (`:95`) |
| smoke command | `packages/cli/src/smoke/smoke-command.ts` | `runSmoke(patterns, options: SmokeCommandOptions) => Promise<SmokeOutcome>` (`:61`); `smokeFile(file: string, options: SmokeCommandOptions) => Promise<SmokeResult>` (`:109`); `SMOKE_FORMATS` (`:31`) |
| jsdom environment | `packages/cli/src/smoke/dom-environment.ts` | `smokeWindow() => Promise<Window & typeof globalThis>` (`:19`); `loadEligius()` (`:36`); `injectStyles(window, cssTexts) => () => void` (`:46`); `stubMissingBrowserApis(window)` (`:67`) |
| Eligian map | `packages/language/src/compiler/eligian-map.ts` | `EligianMapOperation { systemName, location?, calls? }` (`:23`); `EligianMapAction` (`:32`); `buildEligianMap(ir: EligiusIR) => EligianMap` (`:53`); `locateConfigPath(map, config, jsonPath)` (`:266`); `activeTimelineActions(map, timelineUri, position) => EligianMapAction[]` (`:307`) |
| IR and source map | `packages/language/src/compiler/types/eligius-ir.ts`, `transformers/config-builder.ts` | `OperationConfigIR` (`eligius-ir.ts:194`); `SourceMap` (`:75`, `operations` at `:78`); `buildSourceMap(rootLocation, initActions, actions, eventActions, timelines): SourceMap` (`config-builder.ts:399`); `stripOperationSourceLocation(op): IOperationConfiguration` (`:492`) |
| optimizer | `packages/language/src/compiler/optimizer.ts` | `optimize(ir: EligiusIR) => Effect<EligiusIR, never>` (`:25`) |
| operation construction sites | `transformers/{action-call-operations,erased-parameters,runtime-values,navigate-operations,operation-transformer,timeline-transformer,library-imports}.ts`, `ast-transformer.ts` | `buildActionCallOperations` (`action-call-operations.ts:26`); `preserveErasedParameters` (`erased-parameters.ts:80`); `registerRuntimeConcat` (`runtime-values.ts:69`); `lowerRuntimeValues` (`:194`); `SAVED_RESULT_KEY` (`:89`); `buildInteractionOperations` (`navigate-operations.ts:283`); `buildNavTargetAction` (`:324`); `buildPlaybackAction` (`:350`); `transformOperationCall` (`operation-transformer.ts:62`); `transformIfStatement` (`:514`); `transformForStatement` (`:608`); `transformBreakStatement` (`:673`); `transformContinueStatement` (`:695`); `buildTimelineConfig` (`timeline-transformer.ts:75`); `resolveCompilerAction` (`library-imports.ts:89`) |
| compile tool | `packages/cli/src/mcp/tools/compile.ts` | `Parameters` (`:56`); `Success` (`:92`); `summarizeArgs` (`:122`); `makeTool(ai)` (`:129`); `handle(params, ctx)` (`:342`) |
| config fragments | `packages/cli/src/mcp/config-fragment.ts` | `withoutIds(value) => Json` (`:21`); `configFragment(config) => Json` (`:85`); `fragmentOf(config, selection, map?) => Json \| undefined` (`:117`) |
| storyboard parser | `packages/cli/src/mcp/storyboard.ts` | `readStoryboard(text: string) => Storyboard` (`:56`) |
| controller balance | `packages/language/src/compiler/controller-balance.ts`, via `@eligian/language/mcp` | `controllerBalance(config: IEngineConfiguration) => readonly ControllerBalance[]` (`:190`); `walkOperations`; `resolveOperationData` |
| compiler lock | `packages/cli/src/mcp/compiler-lock.ts` | `CompilerLock` (`:21`, `run(requestId, section)`); `makeCompilerLock(hooks?: CompilerLockHooks)` (`:37`); `CompilerLockHooks` (`:13`); `compilerLockLayer(hooks)` (`:70`) |
| shared services | `packages/language/src/compiler/pipeline/services.ts`, `parser.ts` | `getOrCreateServices()` (`services.ts:37`); `releaseWorkspaceDocuments(uris: Iterable<URI>): void` (`parser.ts:364`) |
| heap script | `packages/cli/scripts/measure-heap.ts` | the N-call `eligian_check` loop through `startInMemoryServer` (`mcp-test-client.ts`), with forced-GC heap readings |
| telemetry | `packages/cli/src/mcp/telemetry.ts` | `TelemetryLine { t, tool, ms, chars, ok, args }` (`:11`) |
| instructions | `packages/cli/src/mcp/instructions.ts` | `MCP_PHASE` (`:13`); `INSTRUCTIONS` (`:69`); the `WORKFLOW_*` and `ENGINE_RULES` parts |
| sources of the generated chunks | `@eligian/language/mcp`; `completion/html-elements.generated.ts` | `DOM_EVENTS: ReadonlyMap<string, string>` (`utils/dom-events.ts:9`); `KEY_COMPLETIONS: ReadonlyMap<string, string>` (`utils/key-names.ts:83`); `HTML_ELEMENT_NAMES` (`:16`); `COMMON_HTML_ATTRIBUTES` (`:138`); `HTML_ELEMENT_ATTRIBUTES` (`:174`); `getElementAttributes(tagName) => readonly HTMLAttributeMetadata[]` (`:1713`) |
| knowledge generator and tests | `packages/cli/scripts/generate-knowledge.ts`, `mcp-knowledge.spec.ts` | overlay merging; literate probes and snapshots; the allowlist test (`mcp-knowledge.spec.ts:699-765`) |
| bundler and dev (D-L2) | `packages/cli/src/bundler/asset-collector.ts`, `src/dev/dev-server.ts` | `mapConfigAssetRefs` (`asset-collector.ts:294`); `rewriteConfigAssetRefs` (`:351`); `collectAssets` (`:507`); static serving at `dev-server.ts:190-206` |

## New components

| Module | Package | File | Public API sketch |
|---|---|---|---|
| assertion library | cli | `src/mcp/evals/assert.ts` (built to `dist/evals/assert.mjs`, FR-083) | `type Assertion = { kind: AssertionKind; … }`; `evaluateAssertions(input: { projectDir: string; entry: string; config: IEngineConfiguration; map?: EligianMap; storyboard?: Storyboard }, assertions: readonly Assertion[]) => readonly AssertionResult[]`; `ASSERTION_KINDS` |
| determinism | cli | `src/smoke/determinism.ts` | `checkDeterminism(config, map, options: { names; css; stepTimeoutMs; timelines? }) => Promise<readonly SmokeProblem[]>`, called by `smokeConfig` when `determinism: true`; the path functions (fresh seek to t, linear play to t) exported for `domEquals` (FR-015) |
| scenario DSL extension | cli | `src/smoke/scenario.ts` | `Assertion` gains `textPrefixOf?: string` and `domEquals?: { freshAt: number } \| { linearAt: number }` |
| config baseline | language (test helper) | `src/compiler/__tests__/config-baseline.ts`, `__fixtures__/configs-before/**` | `normaliseIds(value) => Json`; `compileForBaseline(file) => Promise<string>`; CLI `--write` |
| soak project | cli | `vitest.config.ts` (`cli-soak`), `package.json` (`test:soak`), `src/__tests__/mcp-soak.spec.ts` | vitest project with `execArgv: ['--expose-gc']` |
| media clock | cli | `src/smoke/media-clock.ts` | `installMediaClock(window: Window & typeof globalThis, durations: (element) => number) => () => void` |
| origin and rules | language and cli | `compiler/types/eligius-ir.ts` (`OperationOrigin`); `cli/src/mcp/tools/compile.ts` or a sibling (`ORIGIN_RULES: Readonly<Record<OperationOrigin, { rule: string; docs: string }>>`) | `OperationConfigIR.origin`; `EligianMapOperation.origin?`; `SourceMap.origins`, or an extended `operations` value (the plan decides) |
| service reset | language | `compiler/pipeline/services.ts`, plus the export in `mcp.ts` | `resetServices(): void` |
| recycling lock | cli | `src/mcp/compiler-lock.ts` | `makeCompilerLock(hooks?, options?: { recycleAfter?: number; recycle?: () => void })`; `CompilerLockHooks.onRecycle?(count: number)` |
| harness | repo | `evals/mcp/run.ts` (extended), `evals/mcp/rubric.md`, `evals/mcp/generate-media.ts`, `evals/mcp/fixtures/**`, `evals/mcp/cases/*.json` (7 new) | `tsx evals/mcp/run.ts [--case <id>]… [--arm A0\|A1\|A-none]… [--runs n] [--model m]` |
| solutions spec | cli | `src/__tests__/mcp-solutions.spec.ts`; `src/__tests__/__fixtures__/mcp-solutions/<id>/` (14) | vitest, one test per case |
| report | specs | `specs/058-mcp-server/evals.md` | — |

## Interpretations (roadmap tensions resolved here; input for the clarify scan)

- **I-1 (how the harness reaches `assert.ts`)**, decided (Q2): the roadmap pulls three ways (§6.1 "inside the CLI package so it is type-checked and linted"; §6.4 "imports nothing from `packages\**\src` except through the built tarball"; the tarball's `files` and `exports` do not expose the library). Decision: `esbuild.mjs` builds `src/mcp/evals/assert.ts` (with the gate's step logic) into `packages/cli/dist/evals/assert.mjs`, which is not shipped; `gate.ts` imports that build output, and `mcp-solutions.spec.ts` imports the source (FR-083).
- **I-2 (linear play)**: real-time playback in jsdom would take the timeline's full duration per run. Ascending seeks to every boundary, on a fresh engine that ran `init` and `switchTimeline(uri, 0)`, visit every range (each range's start is a boundary), and that is what linear play does to the DOM. "Linear play" therefore means that path of FR-030 (a), not the existing single-engine walk carried over from earlier timelines.
- **I-3 (the events and duration of the media clock)**: §4 names "`duration`, `currentTime`, `loadedmetadata`/`timeupdate`". Eligius 4.2.0 settles init on `canplay`, and also uses `playing`, `seeked`, `ended`, `readyState` and `seekable` (Verification record). The clock follows the installed engine, not the roadmap's event names. The media file is not parsed (Q12 owns header parsing), so the clock's duration is the `duration` of the compiled timeline.
- **I-4 (`origin` is required and carried by id)**: §4 says that `origin` is "set in every transformer, carried through the optimizer into `EligianMapOperation`".
  - A required field makes the compiler enforce "every transformer".
  - The optimizer only filters the stripped config, so the origin travels with the source location in the `SourceMap`, keyed by operation id.
  - It never enters the Eligius config (FR-043).
- **I-5 (`explain` per view)**: §4 defines `explain` "per emitted operation", without naming a view.
  - With a fragment (or a `select`), it lists the fragment's operations (FR-045).
  - With `view: 'summary'`, it adds per-origin counts only.
  - With `view: 'full'`, it lists every operation by JSON path, under the existing `maxResultSizeChars` meta.

  Each rule text appears once per origin, to bound the context cost (§1 "Context cost").
- **I-6 (`--model sonnet|opus`)**: §6.4's flag takes aliases, but the results must record a pinned model (§6.4; decision 9; `PINNED_MODEL` in `eval-cases.spec.ts`). The flag accepts `sonnet` or `opus`, mapped to pinned ids in one table in `run.ts`, or a pinned id. The resolved id is recorded.
- **I-7 (`explainCalled`)**: §1 "Teaching happened" includes "`eligian_compile(explain:true)` was called at least once", but the §7 Phase 3 exit lists only `operations-before-first-unknown` ≥ 0.9. In this phase, `explainCalled` is measured and reported (FR-007, FR-073), but does not gate.
- **I-8 (the Phase 3 instructions)**: Phase 2 I-1 removed "explain:true" until `explain` exists. Phase 3 restores §3.5's text in a new `INSTRUCTIONS[3]` entry (the type `Record<1 | 2, string>` widens), so that each phase's string stays testable.
- **I-9 (the budget source)**, decided (Q5): "each solution's agent run sets the case's call budget" (§7) is replaced by the median call count of the passing pinned-Sonnet A1 runs of the first full run, counted with the same `toolCalls` function that the gate uses. There are no separate reference runs, and Phase 2 results are not reused. Step 6's call check is not applied in the first run; the budgets gate the second run. A reference solution may be corrected by hand; the budget does not change (FR-008, FR-023).
- **I-10 (`formatSource`'s services)**: §2 says that the server recycles "its Langium services (`releaseWorkspaceDocuments` + a new `getOrCreateServices`)". `formatSource` keeps a second set, which holds no workspace documents: each call builds a document from a string (`format-source.ts:30`). It is not recycled; the soak test measures whether that holds.
- **I-11 (the denominator of `operations-before-first-unknown`)**: §1 "Teaching happened" says "in ≥ 90% of runs `eligian_operations` or the `operations-index` doc was read before the first `unknown_operation` / `missing-action-dependency` diagnostic", and §6.4 calls it a "fraction of runs". The denominator is therefore **all** (non-aborted) A1 runs, not only the runs that hit the diagnostic: excluding the others would let the metric rest on a handful of runs, and be undefined when none hit it. For a run without such a diagnostic, the reference point falls back to the first check result (else the end of the run): an agent that checks before it has read the operations table did not do the teaching step either. The conditional fraction (runs with `hitUnknown: true` only) is reported as data, never as the gate.
- **I-12 (tokens-from-tools across arms)**: §6.3/§7's exit compares "tokens" between A1 and A0, and §1 "Context cost" budgets "total characters returned by `eligian_*` tools per eval case ≤ 80,000 … measured by the server's per-call stderr log". The telemetry sum (`toolChars`) cannot serve the comparison: it is 0 in A0, which has no server (Verification record). So:
  - the **comparison** (SC-002) uses `transcriptToolChars`, the characters of every tool result in the transcript, which exists in every arm and counts what the agent actually took into context;
  - the **step-6 budget** keeps §1's 80,000 chars on the arm's teaching channel (`channelChars`): the server's output in A1 (`toolChars`, as §1 defines it), and its stand-in in A0 and A-none (reads of the docs on disk and CLI output). Without this, A0's budget would be vacuous and A0 could pass cases that A1 would fail on context cost;
  - the `usage` tokens of the final `result` event are recorded as data, not gated, because they include the agent's own reasoning, which is not "from tools".

## Decided questions

- **OQ-1 (D-L2 and D-L3)**: decided as option (b): fix D-L2, document D-L3 (FR-065, SC-017).
- **OQ-2 (if A0 matches A1)**: decided as option (a): record the outcome, report SC-002 failed, the shrink is a follow-up phase (FR-075).

## Review notes (revision of 2026-11-05)

No review issue was rejected. Where an issue offered alternatives, the choice and the reason:
- **Tokens across arms** (blocker): resolved with an arm-neutral `transcriptToolChars` for SC-002 and a per-arm teaching channel for the step-6 budget (FR-005, FR-008, I-12). The `usage` tokens are recorded but not used for the comparison, because they include the agent's own reasoning, which is not "from tools".
- **Scenario DSL** (major): the schema is extended (FR-015, SC-020) rather than expressing §6.2 #7 and #11 with the existing fields; the existing `text` is an exact match and nothing compares against a fresh engine, so no deviation from §6.2 is recorded.
- **`operations-before-first-unknown` denominator** (major): option (a), all non-aborted A1 runs (I-11), because it is §1's reading ("in ≥ 90% of runs") and always has a non-zero denominator; the conditional fraction is reported as data.
- **Windows in CI** (three issues): CI keeps its single `ubuntu-latest` job (`ci.yml:26-29`); the Windows halves of SC-004 and SC-018 are local runs quoted in `compliance.md`, as in Phases 1–2. `ci.yml` is touched only for the soak step and, if the measured time requires it, the job timeout (FR-021, FR-063).
- **The smoke tool's `determinism` input** (major): measured by behaviour (SC-009(6)) rather than by widening the `onSpawn` seam (`tools/smoke.ts:55`), so the seam and its existing call sites stay unchanged.
- **Determinism granularity** (minor): one problem per differing class (FR-031, FR-032, SC-009(7)), not an interpretation keeping the class list whole.
- **Lottie code name** (minor): superseded by the OQ-1 decision (D-L3 documented, no new smoke code).

## Clarifications

### Session 2026-11-05

- Q1 (who runs the agent runs; does the phase close on them): (b) the build stage implements everything and runs only what turns the deterministic SCs green; the user runs the two full runs, the triage and `evals.md` later, resuming with `retry_tasks`; SC-001/002/003/019 stay open until then. [FR-074, FR-023, FR-070, FR-072, SC-001, SC-002, SC-003, SC-006, SC-019]
- Q2 (how the harness reaches the assertion library): (a) `esbuild.mjs` builds the assertion library and gate step logic into `packages/cli/dist/evals/assert.mjs`; `files` does not ship it; `gate.ts` imports the build output, `mcp-solutions.spec.ts` the source. [FR-083, FR-002, FR-022, FR-080]
- Q3 (Lottie D-L2 / D-L3): (b) fix D-L2 (bundler and `dev` carry operation-data urls as assets); document D-L3 in the `LottieController` overlay and the README with a text-pinning test; no smoke change; status stays `constrained`. [FR-065, SC-017]
- Q4 (if A0 matches A1): (a) record the outcome in `evals.md` and the roadmap, report SC-002 as failed; the shrink is a follow-up phase of its own. [FR-075, FR-073, SC-002]
- Q5 (which runs set the tool-call budget): (b) the median call count of the passing pinned-Sonnet A1 runs of the first full run; step 6's call check is not applied in run 1; the budgets gate run 2; no separate reference runs. [FR-008, FR-023, FR-025, FR-029, SC-006, SC-008]
- Q6 (does the budget gate A0 and A-none): (a) one budget for every arm; the cross-arm tool-call comparison stays a separate SC-002 term. [FR-008, SC-002, SC-006]
- Q7 (what `generate-media.ts` produces): (a) a dependency-free TS writer: mp3 as repeated silent MPEG-1 Layer III frames; mp4 as ISO-BMFF boxes around one embedded tiny H.264 black frame held for 30 s; browser-playable and byte-identical across OSs. [FR-026, SC-008]
- Q8 (determinism paths for a non-first timeline): (a) three fresh engines per timeline, each `init`, then `switchTimeline(uri, 0)`, then ascending boundary seeks (linear), a seek to t (fresh) or a seek to the end and back to t (end-back); all layout ids compared. [FR-030, FR-015, SC-009]
- Build (2026-11-05), T015 blocked: plan P8's ascending visits on one engine cannot detect a never-removed class (a seek never resets the DOM; measured 0 problems on four fixtures). Ruled (option A of the task's question): the fresh and end-back paths visit the boundaries descending, a key is reported at the first boundary they visit (the latest), the engine count stays three; FR-032's "first boundary" reads accordingly. Also authorized: regenerating `packages/cli/scripts/diagnostic-code-ranking.json` (the new determinism fixtures join the ranking corpus; the 30-code set is unchanged, 3 positions move). [FR-030, FR-032, SC-009]
- Build (2026-11-05), T016 / T020 blocked: the Phase 2 baseline replay test in `smoke.spec.ts` covers two `media.eligian` sections that FR-037 changes. Ruled (option A): the test skips the sections naming a media program, the Phase 2 files stay as captured, `smoke-media.spec.ts` pins the new media output. The capture script's `--diff` reports a corpus file without a capture as `new` and passes it (option a); the four scenario fixtures T014 / T017 added are such files. `provider-choice.md` and the two media scenario fixtures' comments are brought in line with FR-037 in the main loop (no task owned them). [FR-033, FR-037, SC-009]
- Build (2026-11-05), T041 blocked: the task passed `evals/mcp` as `casesDir` to both `materialiseFixtures` and `runGateSteps`, but the library reads the scenario and the start dir under `casesDir` while the case files' fixture paths were relative to `evals/mcp` (measured: 13 of 14 cases fail with the task's value, 18 of 20 with `evals/mcp/cases`). Ruled (option b): `casesDir` = `evals/mcp/cases` everywhere, matching `gate.ts`'s `CASES_DIR`; the three case files with fixtures use `../fixtures/…`; `eval-cases.spec.ts` checks `from` against the cases dir; plan F1 / F2 / F4 updated. The spec also gains plan F4's gate run over `fixtures/port-from-json/source/`. [FR-021, FR-025, FR-028, SC-004]
- Compliance (2026-11-05), FR-026 / SC-008: the T071 browser check found `intro.mp4` ending at once in Chrome (one 30 s sample); variants with 2 or 30 samples play. Ruled (main loop, under Q7 "playable"): the generator writes 30 samples of 1 s over the one embedded frame; the `eval-cases.spec.ts` structure test and SC-008's "one sample" wording follow; the media files are regenerated and the check re-run. [FR-026, SC-008]
- Build (2026-11-05), Group 17 gate: `mcp-knowledge.spec.ts › every operation has an overlay` expected `['addController']` as the overlays beyond the registry (plan P4), but `getAllOperations()` already returns the synthetic `addController` (80 names). Ruled (option a, FR-055 as written): the overlay set equals `getAllOperations()`; the test asserts the registry contains `addController` and the difference is `[]`. The gate's other red (`missing-overlays.json` not yet `[]`) is T058, Group 18. [FR-055, SC-005]
- Build (2026-11-05), T018's "every format reports it": `pretty` and `github` print no problem codes (FR-033 byte-identity), so the test checks those two by the FR-031 message and `json` / `ndjson` by the code. [FR-033, SC-009]
