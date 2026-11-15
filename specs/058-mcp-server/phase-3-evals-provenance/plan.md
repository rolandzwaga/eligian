# Implementation Plan: MCP server, Phase 3: Eval harness, behavioural checks, provenance, curriculum completion

**Branch**: `feat/mcp-server-roadmap` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/058-mcp-server/phase-3-evals-provenance/spec.md` (reviewed; clarifications Q1–Q8 encoded), roadmap §2–§8 (Phase 3 in §7, decisions 1–10 in §8).

Every signature below was read this session on the tree at `b62b762` (Phase 2 closed), with typegraph (`ts_module_exports` on `smoke/scenario.ts`, `smoke/smoke-runner.ts`, `mcp/compiler-lock.ts`, `compiler/eligian-map.ts`, `mcp/storyboard.ts`, `compiler/controller-balance.ts`, `mcp/config-fragment.ts`, `completion/html-elements.generated.ts`; `ts_navigate_to compileWithMap`) or from the file at the cited line. Facts about installed libraries come from `node_modules/.pnpm/eligius@4.2.0_*/node_modules/eligius/dist/engine-factory-39T5FByM.mjs` (lines cited) and from a jsdom probe run in `packages/cli` (a descriptor dump of `HTMLMediaElement.prototype`, quoted in P7). Probes ran in the session temp dir and are not committed.

## Summary

Phase 3 turns the Phase 1–2 one-case harness into the measurement the roadmap defines, and closes the remaining design items. Reuse-first, one line each:

- **Assertions and gate steps** move out of `evals/mcp/gate.ts` into `packages/cli/src/mcp/evals/` (type-checked, linted, tested, covered), are built to `packages/cli/dist/evals/assert.mjs` (never packed), and are imported by the thin `gate.ts` / `run.ts` (the build output) and by `mcp-solutions.spec.ts` (the source). `controllers.balanced` is `controllerBalance` from `@eligian/language/mcp`; storyboard rows come from `readStoryboard`; `config.equivalent` is `configFragment`.
- **Determinism** is three fresh engines per timeline, built by `smokeConfig`'s existing engine factory, stepped with its existing `step` helper, compared on the existing `ElementSnapshot` fields, located with the existing Eligian map. The same path functions back the scenario's new `domEquals`.
- **The media clock** is a set of prototype accessors on jsdom's `HTMLMediaElement`, sufficient for eligius 4.2.0's `VideoPositionSource` (its call sites quoted), installed only by the smoke runner.
- **Provenance** is one required field on `OperationConfigIR`, set at the construction sites found this session (table A2), carried by operation id in a new `SourceMap.origins` (exactly as the location already is), read by `buildEligianMap`. The emitted config does not change (byte baseline).
- **`explain`** reads the origins from the Eligian map that `compileFile` already returns, plus one rule table.
- **Recycling** is a counter, created beside the semaphore at each layer build (P20), advanced inside the existing uninterruptible permit of `makeCompilerLock`, calling `releaseWorkspaceDocuments` and a new two-line `resetServices`.
- **Curriculum**: 66 operation overlays and 126 diagnostics overlays (hand-written, batched), three generated chunks from data the `mcp` entry exports.
- **D-L2** is one more reference kind in `mapConfigAssetRefs`; `dev` serves it because it serves the bundler's output.

No new runtime or dev dependency. No new DSL syntax. No grammar change.

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo). CLI ESM bundle `dist/cli.mjs` (`packages/cli/esbuild.mjs:102-126`); a second esbuild context builds `dist/evals/assert.mjs` (new). The language package builds `dist/index.cjs`, `dist/mcp/index.cjs`, … as separate bundles (`packages/language/esbuild.mjs`, `ctxCjs`, `ctxMcp`) |
| Runtime deps (unchanged) | `chalk`, `commander` 15.0.0, `effect` 4.0.7, `eligius` 4.2.0, `esbuild`, `jquery`, `tinyglobby`, `jsdom` (`packages/cli/package.json` `dependencies`) |
| Testing | Vitest 5.0.5. CLI projects `cli`, `cli-timed`, `cli-bin` (`packages/cli/vitest.config.ts:23-36`), plus a new `cli-soak`. CLI specs resolve `@eligian/language` and `@eligian/language/mcp` to two built bundles with **separate** Langium singletons (Phase 2 plan P1) |
| Platforms | Windows 11 (local, Node 24.7), `ubuntu-latest` (CI, one job, `ci.yml:25-28`) |
| Measured | Gate steps on the `chapters` starter (`eligian init . --template chapters --no-agents`), Windows, in-repo `bin/cli.js`, this session: check 650 ms, fmt 524 ms, smoke 1,499 ms, compile 596 ms, all exit 0. Estimate for `mcp-solutions.spec.ts`: 14 × (≈ 3.3 s + determinism ≈ 2 × smoke) ≈ 80–120 s locally. Re-measured with the real file after group G5 and recorded in `compliance.md` (FR-021) |
| Constraints | server stdout = protocol frames only; smoke `--format ndjson` stdout = NDJSON only; compiler calls serialised; Effect diagnostics 0/0/0; language coverage ≥ 79.8 / 80 / 69.9 / 79 (`packages/language/vitest.config.ts:75-78`); CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`packages/cli/vitest.config.ts:44-47`) |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. One new field (`origin`), one new map (`SourceMap.origins`), one counter in the lock, two new smoke modules, one rule table. The harness's pure logic moves into one directory instead of growing inline in `gate.ts`. |
| II / V / XX / XXV Testing, TDD | Pass. Every FR/SC has a named spec (Test plan), written first; `specs/TESTING_GUIDE.md` is read before the first test. Language specs use `createTestContext()` where no files are needed, real files otherwise (`origin.spec.ts` compiles fixtures from disk). |
| III / XVII Effect | Pass. Touched Effect code: the transformers (each origin is a field in an existing object literal; no new effect), `compiler-lock.ts` (the recycle runs inside the existing `Effect.uninterruptible`), the compile and check tool handlers, `telemetry.ts`. No thrown exception is added to the pipeline. Smoke internals and the eval library stay plain async / sync, as `smoke/*.ts` are today. `pnpm effect:check:language` and `:cli` are gates. |
| IV Clear errors | Pass. One new code (`position-nondeterministic`) with an overlay; one code removed (`scenario-media-timeline`, P11) with its overlay. |
| VI / VII Immutability | Pass. `origin` is set at construction; rewrites use spreads (`{ ...op, … }`) that carry it. |
| VIII pnpm | Pass. As in Phases 1–2, the harness runs `npm install <tarball>` only inside a temp *user* project. |
| IX Langium | Pass. No grammar change; generated files are only read. |
| XII No premature docs | Pass. README, CHANGELOG, root `AGENTS.md` (`evals:mcp`), `verification-ladder`, the `LottieController` overlay, `evals.md` and the roadmap status line: the spec's list. |
| XIV Windows paths | Pass. `path.join` / `path.resolve`; case files use relative POSIX paths joined at run time; spawns with argument arrays and no shell, except `run.ts`'s existing `exec` for the `.cmd` shims (`run.ts:80-94`). |
| XV / XVI Research context | Pass. `eligius` only through the installed package; its dist file is read, never imported. |
| XXII Sed safety | Pass. Edits by string match; the origin sites are edited one by one by symbol. |

No violations; the Complexity tracking table is empty.

## Corrections to the spec found while planning

Each was checked this session; `compliance.md` records each as a correction or as an addition to the touched-files list.

- **P1. The reset hook is exported from the language package root, not from `@eligian/language/mcp`.**
  - FR-060 says "exported from `@eligian/language/mcp`". Under vitest the CLI resolves `@eligian/language` to `dist/index.cjs` and `@eligian/language/mcp` to `dist/mcp/index.cjs`: two bundles of `compiler/pipeline/services.ts`, so two `let sharedServices` (`services.ts:26`). `packages/language/esbuild.mjs` bundles `src/mcp.ts` on its own (`ctxMcp`).
  - `compileFile`, `checkPaths` and `withLoadedDocuments` use the root singleton; `compiler/index.ts:89-97` exports `withLoadedDocuments`, `parseSourceTracked`, `releaseWorkspaceDocuments` and `getOrCreateServices` from the root for exactly this reason (Phase 2 P1). A reset exported only from the `mcp` entry would reset the wrong singleton under vitest, and SC-015(2) would measure nothing.
  - So `resetServices()` is exported from `compiler/index.ts` (the root). In the production bundle both entries are one module (esbuild inlines `../language/src/*` once, `WORKSPACE_SOURCES`, `packages/cli/esbuild.mjs:33-39`), so the root export resets the one singleton.
  - The `mcp` singleton is used only by `tools/operations.ts:288` (a stateless `LangiumParser.parse`, no workspace documents) and by the generator; it needs no recycle. `mcp-entry.spec.ts`'s exact-exports list changes only for FR-057's HTML exports.
- **P2. Two `as OperationConfigIR` casts would let the required `origin` through unset.** `runtime-values.ts:240-246` (`helper(...)` returns `({ id, systemName, operationData, sourceLocation }) as OperationConfigIR`) and `:279-282` (`lowered`). A type assertion accepts an object literal that lacks a required property, so FR-040's "the compiler enforces every transformer" does not hold there. Both casts are removed: `helper` takes the origin and returns a typed literal; `lowered` becomes `const lowered: OperationConfigIR = { ...op, operationData: … }`. No other cast to `OperationConfigIR` exists in non-test compiler code (`grep "as OperationConfigIR"`: these two).
- **P3. `lifecycle` has no operation-construction site; the plan gives it the lifecycle blocks' top-level `source` operations.**
  - `transformLifecycle` (`timeline-transformer.ts:238-281`) compiles the `on enter` / `on leave` statements with `transformOperationStatement` and creates no operation of its own.
  - FR-041 allows removing such a value, but `explain` would then lose the rule these operations need most ("runs when the timeline is entered / left; not on `timelineComplete` or a loop restart; every controller added in on enter is removed in on leave"). So `transformLifecycle` re-tags each returned operation whose origin is `source` as `lifecycle`; operations with a more specific origin (`interaction`, `call`, `with`, …) keep theirs.
  - Alternative (recorded only): remove `lifecycle` from the union per FR-041. Not chosen, because it drops the teaching text for the blocks the agent writes most.
- **P4. The operation overlays are a superset of the registry: `addController.md` is not a registry name.** `curriculum/operations/` holds 13 files (`ls`), one of them `addController.md`; the registry's 79 names (`registry.generated.ts`, listed this session) contain `addControllerToElement`, not `addController` (the DSL form). FR-055's "the set of overlays equals the registry's names" would fail on day one. The test asserts: registry names ⊆ overlay names, and overlay names − registry names = `['addController']` exactly. *Superseded 2026-11-05 (build ruling): `getAllOperations()` (FR-055's registry) adds the synthetic `addController` to the 79 generated names, so overlay names = registry names, difference `[]`.*
- **P5. Storyboard beats need source timeline names, which the compiled output does not carry.**
  - FR-012 matches a beat's timeline by its **source name** to the config timeline by index (the Phase 1 FR-030 ruling). A media timeline's `uri` is its `from` path (`compile.ts:174-175`, "By config index, never by uri"). The gate reads only `out/config.json` and the `--eligian-map` file, and `EligianMap` (`eligian-map.ts:44-50`) has no names.
  - Fix: `EligianMap` gains `readonly timelineNames?: readonly string[]` (source names by config index), set by the CLI's `compileFile` next to `source`: `compile-file.ts:343` `map: { ...map, source: absoluteInputPath }` becomes `{ ...map, source: absoluteInputPath, timelineNames: timelineNames(program) }` (`timelineNames` from `@eligian/language/mcp`, as `smoke-command.ts:16` already imports it). Optional and additive: the config bytes do not change (FR-043); the `--eligian-map` file and `includeMap` gain one key.
- **P6. `domEquals` cannot build its reference engine while the scenario runs.** The smoke runner has one jsdom window per process, made global (`dom-environment.ts:1-33`, "one jsdom window for the whole process"), and an engine's `init()` replaces the container's children. A second engine during the scenario would overwrite the scenario engine's DOM. The scenario's assertions are evaluated only after the last step (`runScenario`, `scenario.ts:212`, calls `checkAssertions` at its end), so the reference states are computed **after** the scenario engine is stopped and destroyed, in the same window, against the stored step snapshots. FR-015's "the `runScenario` context gains what `domEquals` needs" therefore becomes: `runScenario` skips `domEquals`; `smokeConfig` calls a new exported `checkDomEquals` after destroying the scenario engine (B4).
- **P7. Verified: jsdom's media accessors are configurable, and `canPlayType` must be stubbed.**
  - Probe (jsdom from `packages/cli`): `HTMLMediaElement.prototype` has configurable accessors `duration` (get), `currentTime` (get/set), `readyState` (get), `seekable` (get), `paused` (get); `canPlayType`, `load` and `play` are configurable values; `error` is not on the prototype. A fresh `<video>` gives `canPlayType('video/mp4') === ""`, `readyState === 0`, `duration === NaN`.
  - `VideoPositionSource._load` keeps only the sources with `!isNonEmptyString(type) || video.canPlayType(type) !== ""` and rejects when none is left ("none of the sources has a type this browser can play", `engine-factory-39T5FByM.mjs:13001-13006`). The compiled sources carry a type (`config-builder.ts:577-578`: `mp3: 'audio/mpeg'`, `m4a: 'audio/mp4'`). So FR-035's list gains `canPlayType` (returns `'maybe'`); without it no media timeline inits.
  - `_load` appends the `<source>` elements before `video.load()` (`:13013-13015`), so the clock reads the element's first source `src` inside `load()` to pick the duration (FR-036).
- **P8. How each determinism path steps its one engine (FR-030: "the plan fixes").**
  - (a) linear: ascending `seek(t)` over `boundaries(timeline)` (`smoke-runner.ts:328`); the state is compared at every t.
  - (b) fresh: for each t ascending, `seek(0)` then `seek(t)`. Every range start is a boundary, so a forward seek between consecutive boundaries is linear play; the return to 0 makes each `seek(t)` a jump over every range before t. *Superseded 2026-11-05 (build ruling on T015): the return to 0 does not clear what an earlier visit left behind, so (b) and (c) visit the boundaries DESCENDING; a key is reported at the first boundary they visit (the latest). See the spec's FR-030 ruling.*
  - (c) end-back: for each t, `seek(duration)` then `seek(t)` (descending, as (b)).
  - Soundness: in a program whose DOM is a function of the position, every path yields the same state at t, so any difference is a real violation, whichever path exposed it. The engine count stays three per timeline (SC-009(8)).
  - Settling: every seek goes through the runner's `step` (timeout, then `SETTLE_MS = 5`, `smoke-runner.ts:124`, `:229-232`). Before each compared snapshot the path waits for quiescence: a snapshot every `QUIESCE_INTERVAL_MS = 25` until two consecutive ones are equal, at most `QUIESCE_MAX_MS = 1000` (then the last one is compared). `smoke-determinism.spec.ts` has a fixture with `wait(300)` in a start block that must report nothing (spec Edge cases: "a difference that disappears with a longer settle is a harness bug").
- **P9. The harness's pure parts live in `packages/cli/src/mcp/evals/`, not in `evals/mcp/*.ts`.** FR-022 requires that the spec shares the assertion, step and fixture-materialising logic with `gate.ts` and `run.ts`; SC-006(2) requires vitest specs over argument parsing, the verdict, the budget, `medianBudget`, the metrics and the summary. `evals/mcp/` is outside every tsconfig, Biome and coverage (FR-002), so code there could not be shared with a spec without a second copy. All of it goes into `src/mcp/evals/` and the FR-083 bundle; `gate.ts` and `run.ts` keep only argv handling, the `claude -p` spawns and file writes.
- **P10. Telemetry needs result-derived data.** `TelemetryLine` (`telemetry.ts:11-18`) carries `args`, computed before the call (`server.ts:79-86`, `boundary(tool, summarizeArgs(params), …)`). The `codes` of an `eligian_check` result (FR-007) exist only after the call. `withTelemetry` gains an optional fourth parameter `summarizeResult?: (value: A) => Readonly<Record<string, unknown>>`, and `TelemetryLine` an optional `result`. `explain` goes into `summarizeArgs` (it is an input).
- **P11. `scenario-media-timeline` and `mediaOnlyProblem` are removed (FR-037: "the plan decides").** With the clock every media timeline inits, so no path produces the code any more: the media branch of `navigate` (`scenario.ts:300-306`) and the media-only branch (`smoke-runner.ts:263-271`, `mediaOnlyProblem` at `scenario.ts:339`) go. `SMOKE_CODES` loses that entry and gains `position-nondeterministic` (still 16). The overlay `curriculum/diagnostics/scenario-media-timeline.md` is deleted; the drift tests iterate `SMOKE_CODES` and follow. `SmokeTimeline.skipped` (`smoke-runner.ts:84`), the formatters' `skipped` branch and the tool's `TimelineSchema.skipped` (`tools/smoke.ts:111`) become dead and are removed with it.
- **P12. D-L2 covers `loadJson.url` only.** The registry parameters named like a file reference are `loadJson.url`, `httpDelete.url`, `httpPost.url`, `httpPut.url` (a scan of `registry.generated.ts` this session). The `http*` ones address HTTP endpoints, not files a bundle can carry. The bundler maps local, relative `loadJson` urls (not `http:`, `https:`, `data:`, `blob:`, `//` or `/`-rooted).
- **P13. The metrics need each tool result paired with its call.** `toolCalls(events)` (`gate.ts:88-100`) keeps `{ name, input }` and drops `tool_use_id`; FR-005's `transcriptToolChars` and FR-007's "codes … read from the matching `tool_result` text" need the result of each call. `transcript.ts` adds `toolEntries(events)` (paired by `tool_use_id`); `toolCalls` stays as a projection of it, so the budget counts exactly as before.
- **P14. `SourceMap` gains a required `origins`; three test helpers build `SourceMap` literals.** `emitter.spec.ts:42-47`, `optimizer.spec.ts:40-45` and `type-checker.spec.ts` (`timelineActions: new Map()` at `:49`) construct `SourceMap` by hand; each gains `origins: new Map()`. No production code outside `buildSourceMap` builds one (`grep "timelineActions: new Map"`).
- **P15. The FR-043 baseline must be OS-independent.** It is captured on Windows and checked on ubuntu. Compiling the examples with the CLI this session: three compile (`demo`, `eligian-tour/tour`, `libraries/nested/chain-test`; the others are libraries or error fixtures), and none of their configs holds an absolute path (`grep -c -i projects` → 0). The capture additionally fails when any string of a captured config contains the repo root (either separator); if that happens, the build stops `blocked` rather than widening the normalisation the spec fixed.
- **P16. The FR-033 capture covers the on-disk smoke fixtures; `smoke.spec.ts`'s inline programs are guarded by its own expectations.** `smoke.spec.ts` writes most of its programs inline into a temp cwd (`:49`), so no script can capture them without copying the spec; its on-disk fixture is `__fixtures__/mcp/scenario/host-undefined` (`:13`). `smoke-ndjson.spec.ts` uses `__fixtures__/mcp/smoke/*` (`:17-21`). The capture takes the `smoke:examples` corpus (root `package.json:26`) plus every non-media `.eligian` under `__fixtures__/mcp/smoke/` and `__fixtures__/mcp/scenario/`; SC-009(4)'s second half ("every expectation of `smoke.spec.ts` and `smoke-ndjson.spec.ts` is unchanged except the named FR-037 rewrite") covers the inline ones.
- **P17. `beats.min "start"` counts `at` events only.** The gate's `startTimelineActionCount` (`gate.ts:340-344`) adds 1 for a lifecycle block; FR-013 excludes lifecycle actions. The moved function counts the start state's `at` events only (the start states do not compile, so the count stays a source scan, as today).
- **P18. Interaction rows are matched one by one, and `run` has no synthetic action.**
  - FR-012's parenthetical names the `__on__*` / `__nav__*` actions (`navigate-operations.ts:169`, `:184`). But `interactionActionName` is documented as the "Deterministic synthetic action name of an interaction verb (all but `run`)" (`navigate-operations.ts:180`), and a `run` listener names the called action itself (`transformRunInteraction`, `operation-transformer.ts:466-471`: `scope.actionSystemNames?.get(name) ?? name`). A correct case-10 solution, and case 11's `#restart` row, have only `run` listeners, so a rule that looks only for `__on__` / `__nav__` names would fail them.
  - Matching "some `__on__` / `__nav__` action exists" would also let one listener satisfy every row.
  - D1 therefore matches **each** row to its own listener, by trigger, timeline and the action its verb implies, and a `run` row to the declared action it names (D1, "Interaction rows"). This is FR-012's "every row … maps to a listener action" applied per row. It is stricter than the parenthetical, not weaker. `compliance.md` records it as a correction.
- **P19. `smoke-runner.ts` is in every command's static import graph.** `main.ts:32` statically imports `./smoke/smoke-command.js`, which value-imports `smokeConfig` from `./smoke-runner.js` (`smoke-command.ts:21-26`). The stdio server loads it too: `mcp/diagnostics.ts:23` value-imports `SMOKE_CODES` from `../smoke/smoke-runner.js`. Every module that `smoke-runner.ts` imports statically is therefore evaluated in every CLI process, the server included. What keeps FR-038 and the startup time is the new modules' content, not who imports them (B1).
- **P20. The recycle counter belongs to the layer build, not to `makeCompilerLock`'s body.** `CompilerLockLive` is the module constant `Layer.effect(CompilerLock, makeCompilerLock())` (`compiler-lock.ts:64-67`), so `makeCompilerLock()` runs once per process. Each server's build re-runs only the returned Effect, the `Effect.map(Semaphore.make(1), …)` callback (`:40`), and that is why the semaphore is per server. `server.ts:140` provides `options.lock ?? CompilerLockLive`, so a counter in the function body would be shared by every server built without `options.lock`, the in-process test servers included (C3).

## Sequencing

Groups run in order; tasks marked `[P]` inside a group are independent.

- **G0, before any source edit**: (a) the FR-043 capture `pnpm exec tsx packages/language/src/compiler/__tests__/config-baseline.ts --write`, committed; (b) the FR-033 capture `pnpm exec tsx packages/cli/scripts/capture-smoke-baseline.ts --write` into `baseline/smoke-before/`; (c) both coverage summaries, the outputs of `check:examples` / `smoke:examples` / `fmt:examples`, and the probe-snapshot list of `mcp-knowledge.spec.ts`, into `baseline/`.
- **G1 language**: A1–A5, then `origin.spec.ts` against the G0 baseline. It covers the examples and the compiler fixtures. SC-011(1)'s solutions half runs in G5's `mcp-solutions.spec.ts`, because the solutions are written in G5. Gate: `pnpm typecheck`, language vitest with coverage, `effect:check:language`, `check:examples`.
- **G2 smoke**: B1 clock, B2 determinism, B7 touched selectors, B3 runner, B4 scenario DSL, B5 flags, B6 tool input. Gate: CLI vitest (smoke specs), the FR-033 diff, `smoke:examples`.
- **G3 server**: C1 `explain` + rule table, C2 telemetry, C3 recycling lock + soak project, C4 instructions, C5 init, C6 `compileFile` names. Gate: `effect:check:cli`, CLI vitest, `test:soak`.
- **G4 eval library**: D1–D5. Gate: CLI vitest, `package-bin.spec.ts`.
- **G5 cases, fixtures, solutions**: E1 media generator, the seven case files and scenarios, the `port-from-json` fixture (F4), the 14 solutions (F5), `mcp-solutions.spec.ts` (including SC-011(1)'s solutions half, which asserts the solution count of 14), `eval-cases.spec.ts`; the measured wall time; `ci.yml`'s timeout if FR-021 requires it.
- **G6 harness scripts**: `gate.ts`, `run.ts`, `rubric.md`, root `evals:mcp`.
- **G7 knowledge [P]**: operation overlays (66, in batches of about 11), diagnostics overlays (126, batches of about 20), the three generated chunks, `verification-ladder`, the `LottieController` text.
- **G8 Lottie D-L2** (beside G7): H, then the FR-065 re-run of the three-mode probe of `phase-2-inspect-smoke-context/baseline/lottie.txt` on the fixed tree.
  - The modes are those of that file: `compile --bundle` with the bundle opened, `dev` on page load, and `smoke --strict`.
  - The probe is the `loadJson("./anim.json")` variant, because that is the form the overlay teaches. The bare-`url` form is re-run as well, for comparison.
  - The output goes to `baseline/lottie.txt` in the Phase 2 format, and `compliance.md` quotes it with the outcome per mode. Expected: `--bundle` and `dev` render the `<svg>`, and `smoke --strict` still fails as D-L3 documents.
- **G9 docs and the full gate set**: README, CHANGELOG, root `AGENTS.md`; every gate of FR-082 with coverage.
- **G10, user-driven, last, separate tasks (FR-074)**: the first full run, triage, `--write-budgets`, the second full run with the Opus record, `evals.md`, the roadmap status line.

## Module design

### A. Language package (`packages/language`)

#### A1. `OperationOrigin` (FR-040) — new `src/compiler/types/operation-origin.ts`

```ts
/** Spec 058 Phase 3 (FR-040): the construct that generated an emitted operation. */
export const OPERATION_ORIGINS = [
  'source', 'call', 'param-binding', 'erased-save', 'erased-restore', 'concat', 'saved-result',
  'target', 'with', 'interaction', 'lifecycle', 'loop-control', 'init-globaldata', 'sequence',
  'stagger', 'library-qualified',
] as const;
export type OperationOrigin = (typeof OPERATION_ORIGINS)[number];
```

- `OperationConfigIR` (`eligius-ir.ts:194-196`) becomes `IOperationConfiguration<TOperationData> & { readonly sourceLocation: SourceLocation; readonly origin: OperationOrigin }` (required, I-4).
- `compiler/index.ts` exports `OPERATION_ORIGINS` and `type OperationOrigin` from the root (the CLI's rule table and its drift test read them). A runtime list, not only a type, so the FR-046 drift test can iterate it.

#### A2. The construction sites (FR-041)

Found this session (`grep -n randomUUID packages/language/src/compiler/{*,transformers/*}.ts`, non-test; action, timeline and config ids excluded). Each literal gains `origin`; a helper gains an `origin` parameter where its callers differ.

| Site | Operations | Origin |
| --- | --- | --- |
| `transformOperationCall` (`operation-transformer.ts:62`, literal `:147-153`) | the operation of a source call (built-ins and host operations) | `source` |
| `addController` expansion (`operation-transformer.ts:264-283`) | `getControllerInstance` + `addControllerToElement` | `source` |
| `WithStatement` (`operation-transformer.ts:364-379`) | the leading `selectElement` | `with` |
| `transformIfStatement` (`:514`; `when` `:529`, `otherwise` `:557`, `endWhen` `:582`) | control flow | `source` |
| `transformForStatement` (`:608`; `forEach` `:623`, `endForEach` `:655`) | control flow | `source` |
| `transformBreakStatement` / `transformContinueStatement` (`:673`, `:695`; literals `:679`, `:701`) | `breakForEach`, `continueForEach` | `loop-control` |
| variable declaration (`:757-765`) | `setVariable` | `source` |
| `buildActionCallOperations(actionName, actionOperationData, sourceLocation, verb, origin = 'call')` (`action-call-operations.ts:26`) | `requestAction` + `startAction` / `endAction` | the parameter: |
| — from `operation-transformer.ts:331` | an action call in a block | `library-qualified` when `scope.actionSystemNames?.get(operationName)` is defined and differs from `operationName`, else `call` |
| — from `timeline-transformer.ts:419`, `:426` (`sequenceCallOperations`) | a `call() for 5s` sequence item | `sequence` |
| — from `timeline-transformer.ts:542`, `:550` (stagger, call form) | a stagger item's call | `stagger` |
| — from `timeline-transformer.ts:862`, `:872` (`at … action()`) | the call pair | `call` |
| `preserveErasedParameters` (`erased-parameters.ts:80`; `copy` at `:110-117`) | the save before / the restore after | `erased-save` / `erased-restore` |
| — the bare-clear rewrite (`erased-parameters.ts:98-107`) | `clearOperationData` → `setOperationData { override }` | `erased-save` (the save that keeps the parameters) |
| `lowerOperation` (`runtime-values.ts:203-290`; `helper` at `:240-246`, P2) | the `SAVED_RESULT_KEY` save and restore (`:256`, `:268`) | `saved-result` |
| — | per concatenation: `setOperationData { strings }`, `concatenateStrings`, the temp-key copy (`:259-264`); the cleanup `removePropertiesFromOperationData` (`:284-287`) | `concat` |
| — | the materialising `setOperationData` of unresolved chains (`:275-277`) | `param-binding` |
| — the lowered operation itself (`:279-282`) | the original operation | kept (spread) |
| `buildInteractionOperations` (`navigate-operations.ts:283-317`) | `selectElement`, `getControllerInstance`, `addControllerToElement` | `interaction` |
| `buildNavTargetAction` / `buildPlaybackAction` (`:324`, `:350`; literals `:335`, `:360`) | the synthetic `broadcastEvent` | `interaction` |
| `target` (`timeline-transformer.ts:899-906`) | the `selectElement` at the head of start and end | `target` |
| `transformLifecycle` (`timeline-transformer.ts:238-281`, P3) | top-level operations whose origin is `source` | re-tagged `lifecycle` |
| globals `setData` (`ast-transformer.ts:150-162`) | the one `setData` of `$globaldata.*` | `init-globaldata` |

- Library action bodies are compiled by the same functions, so their operations get the same origins; a call pair with a qualified name gets `library-qualified`.
- With `origin` required and P2's casts gone, `pnpm typecheck` fails at any literal this table missed; SC-011(1) catches anything else at runtime.

#### A3. Carrying the origin (FR-042, I-4) — `eligius-ir.ts`, `config-builder.ts`, `eligian-map.ts`

- `SourceMap` (`eligius-ir.ts:75-81`) gains `readonly origins: ReadonlyMap<string, OperationOrigin>; // operation.id → origin`.
- `buildSourceMap(rootLocation, initActions, actions, eventActions, timelines): SourceMap` (`config-builder.ts:399`): each loop that does `operationMap.set(op.id, op.sourceLocation)` also does `originMap.set(op.id, op.origin)`; returned as `origins`.
- `optimize(ir: EligiusIR) => Effect<EligiusIR, never>` (`optimizer.ts:25`) filters `ir.config.timelines` and keeps `ir.sourceMap`, so the origins pass through unchanged (no edit; SC-011(1) runs on optimized compiles).
- `stripOperationSourceLocation` (`config-builder.ts:492-501`) is unchanged: it already emits `{ id, systemName, operationData }` only (FR-043).
- `EligianMapOperation` (`eligian-map.ts:23-28`) gains `readonly origin?: OperationOrigin`; `buildEligianMap(ir)` (`:53`) adds `origin: sourceMap.origins.get(op.id)` beside `location: sourceMap.operations.get(op.id)` (`:60`). Optional on the map type, because maps are also read back from JSON files.
- `EligianMap` (`:44-50`) gains `readonly timelineNames?: readonly string[]` (P5; set by the CLI).

#### A4. `resetServices` (FR-060, P1) — `src/compiler/pipeline/services.ts`

```ts
/** Drop the shared services: the next getOrCreateServices() builds (and, under Vitest, seeds) a fresh set. */
export function resetServices(): void {
  sharedServices = undefined;
}
```

- Exported from `compiler/index.ts` beside `getOrCreateServices` (`:97`).
- Every language call site reads `getOrCreateServices()` at call time (`check.ts:98`, `:187`; `library-loader.ts:156`, `:286`; `parser.ts:144`, `:172`, `:250`; `library-imports.ts:79`); none keeps it in a module variable (checked this session). A reset therefore takes effect on the next call.
- Test: `services.spec.ts` (new, language): the instance after `resetServices()` is `!==` the one before, and the Vitest CSS seeding (`services.ts:46`) is present again.

#### A5. `mcp` entry (FR-057) — `src/mcp.ts`

- Adds `HTML_ELEMENT_NAMES` (`html-elements.generated.ts:16`), `COMMON_HTML_ATTRIBUTES` (`:138`), `getElementAttributes(tagName: string) => readonly HTMLAttributeMetadata[]` (`:1713`) and `type HTMLAttributeMetadata`.
- Adds `interactionActionName(verb: 'navigate' | PlaybackVerb, target: string | undefined, position: number): string` (`navigate-operations.ts:184-191`) and `type PlaybackVerb` (`:57`), for D1's per-row interaction match (P18). The eval library derives the synthetic names with the compiler's own function, so the FNV hash in `syntheticNavActionName` (`:169-177`) cannot drift between the two.
- Adds `type WalkedOperation` and `type ActionBody` to the controller-balance re-export. Today `mcp.ts:7-13` re-exports only `ControllerBalance`, `controllerBalance`, `resolveOperationData`, `WalkEvent`, `WalkResult` and `walkOperations`, and the two interfaces sit at `controller-balance.ts:11` and `:32`. B7's `touchedSelectors` signature needs them, and the CLI has no other way to reach them: `packages/language/package.json` exports only `.`, `./errors`, `./eligius-lint` and `./mcp`, and the CLI's `workspaceSources` plugin fails the build on any other `@eligian/...` specifier ("No source entry for the workspace import", `packages/cli/esbuild.mjs:48`).
- `WalkEvent`'s `controller-added` variant (`controller-balance.ts:17-23`) gains `readonly data: OperationData`. This is the `addControllerToElement` operation data, resolved against the walk's data with `resolveOperationData(own, data)` in `walk`'s `addControllerToElement` case (`:119-120`). D1 reads each listener's `eventName`, `keys` and `actions` from it; this is the walker that already follows the calls, so no second walker is written. `controllerBalance` reads only `selector` and `controller` (`controllerKey`, `:186-187`), so its output does not change. The two `controller-added` expectations in `controller-balance.spec.ts` (`:51`, `:85`) gain the field.
- `mcp-entry.spec.ts` ("exports exactly the list", `:18-19`) gains the four values `HTML_ELEMENT_NAMES`, `COMMON_HTML_ATTRIBUTES`, `getElementAttributes` and `interactionActionName`. Type exports are erased, so the runtime list cannot see them. Instead, the spec's type-only import (`:2-13`) gains `ActionBody`, `HTMLAttributeMetadata`, `PlaybackVerb` and `WalkedOperation`, and a dropped type export then fails `pnpm typecheck`.

#### A6. Config baseline (FR-043) — new `src/compiler/__tests__/config-baseline.ts`

```ts
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** Every UUID-shaped string value (keys excluded) becomes '<id>'. */
export function normaliseIds(value: unknown): Json;
/** compile(source, { sourceUri: file }), normalised, as JSON.stringify(value, null, 2) + '\n'; undefined when it fails. */
export function compileForBaseline(file: string): Promise<string | undefined>;
/** Every .eligian under examples/** and packages/language/src/compiler/__tests__/__fixtures__/**, sorted. */
export function baselineCandidates(repoRoot: string): string[];
```

- Uses `compile(source: string, options?: CompileOptions) => Effect<IEngineConfiguration, CompileError>` (`pipeline.ts:240-243`) with `{ sourceUri: <absolute path> }` (the form `compile-file.ts:311-316` passes), run with `Effect.runPromiseExit`.
- `--write` (run by `tsx`): writes `__fixtures__/configs-before/<repo-relative path>.json` for each candidate that compiles and lists the rest in `__fixtures__/configs-before/skipped.txt`; fails on a repo-root string (P15).
- `origin.spec.ts` (new): one `it` per baseline file, `expect(await compileForBaseline(file)).toBe(committed)`.

### B. `eligian smoke` (`packages/cli/src/smoke`, `main.ts`)

#### B1. Media clock (FR-035–FR-038, P7) — new `smoke/media-clock.ts`

```ts
/** Durations by media source as compiled: timelines[].positionSource.sources[].src → the timeline's duration. */
export function mediaDurations(config: IEngineConfiguration): ReadonlyMap<string, number>;

/**
 * The fake clock on jsdom's HTMLMediaElement (spec 058 Phase 3 FR-035): per-element state in a WeakMap.
 * Returns the function that restores the original prototype descriptors.
 */
export function installMediaClock(
  window: Window & typeof globalThis,
  durationOf: (src: string) => number | undefined
): () => void;
```

- Accessors via `Object.defineProperty(window.HTMLMediaElement.prototype, name, { configurable: true, get, set })` (P7: all configurable):
  - `duration`: NaN until `load()`, then `durationOf(<first <source>'s src attribute>)`, else NaN.
  - `currentTime` get / set: set clamps to `[0, duration]`, fires `seeking`, then on a 0 ms timer `seeked` and `timeupdate` (eligius resolves a seek on `seeked`, `:12918`).
  - `readyState`: 0 until `load()`, then 4 (HAVE_ENOUGH_DATA; eligius checks `HAVE_NOTHING`, `:12895`); `seekable`: a `TimeRanges`-shaped object with one range `[0, duration]` (length 0 before `load()`; eligius checks `seekable.length === 0`, `:12900`); `paused`; `error`: `null`.
  - `canPlayType()` → `'maybe'`; `load()`: sets the duration, then on a 0 ms timer fires `loadedmetadata` and `canplay` (eligius settles init on `canplay`, `:13066-13068`).
  - `play()`: fires `playing` (eligius' container-ready listener, `:13063`), starts a 100 ms interval that advances `currentTime` by the real elapsed time and fires `timeupdate`; at `duration` it stops and fires `ended` (`:13058-13061`); returns `Promise.resolve()`. `pause()` stops the interval.
- Positions change only through seeks and real time between `play()` and `pause()` (FR-036). No media file is read (FR-038).
- Installed by `smokeConfig` after `smokeWindow()` and restored in its `finally`. Nothing else calls `installMediaClock` (FR-038). `stubMissingBrowserApis` (`dom-environment.ts:67`) keeps its `play` / `pause` / `load` stubs for the other users; the clock overrides them while installed.
- **Import constraint (P19; FR-038; Edge cases, "Cold start").** `smoke-runner.ts` is in the static import graph of every CLI command and of the stdio server, so being imported only by `smoke-runner.ts` confines nothing. The constraint is on content: `media-clock.ts`, `determinism.ts` and `touched-selectors.ts` (B7):
  - have no module-scope side effects (declarations and `const` literals only);
  - take `window` as a parameter;
  - make no value import of `jsdom`, bare `eligius` or `jquery`. They use type imports only, and the window and the engine come through the existing lazy `smokeWindow()` / `loadEligius()` (`dom-environment.ts`) and `import('jquery')` (`scenario.ts:220`).

  The clock exists only between `installMediaClock` and its restore inside `smokeConfig`, and `smokeConfig` runs only in the `smoke` command (the smoke child, for the server). Enforced by `package-bin.spec.ts`'s "no static import of jsdom, esbuild, effect/ai or the eligius engine" (`:186-197`, over the built `dist/cli.mjs`) and by `mcp-stdout.spec.ts` (stdout = protocol frames only), re-run unchanged.

#### B2. Determinism (FR-030–FR-033, P8) — new `smoke/determinism.ts`

```ts
export type PathKind = 'linear' | 'fresh' | 'end-back';
/** The compared state of one element (FR-031): ElementSnapshot without `exists` and `controllers`. */
export interface ComparedState {
  readonly classes: readonly string[];
  readonly text: string;
  readonly style: string;
  readonly visible: boolean;
}
export type LayoutState = Readonly<Record<string, ComparedState>>;

export interface DeterminismEnvironment {
  readonly window: Window & typeof globalThis;
  /** A fresh, not started engine over the runnable config (smokeConfig's createEngine) */
  readonly createEngine: () => IEligiusEngine;
  readonly step: (what: string, run: () => unknown) => Promise<void>;
  /** Every id of config.layoutTemplate (scanLayoutElements(...).ids, as runScenario reads them) */
  readonly layoutIds: readonly string[];
  /** The program's CSS texts (readCssFiles) */
  readonly css: readonly string[];
  readonly resetBody: () => void;
}

/** The states at `positions` reached on one fresh engine by `kind`: init, switchTimeline(uri, 0), the path. */
export function pathStates(
  env: DeterminismEnvironment,
  timeline: ITimelineConfiguration,
  kind: PathKind,
  positions: readonly number[]
): Promise<ReadonlyMap<number, LayoutState>>;

/** FR-030–FR-032: one problem per (timeline, element, class | property), at its first boundary, with the recurrence count. */
export function checkDeterminism(
  env: DeterminismEnvironment,
  config: IEngineConfiguration,
  map: EligianMap,
  options: { readonly names: readonly string[]; readonly timelines: readonly ITimelineConfiguration[] }
): Promise<readonly SmokeProblem[]>;
```

- Per played timeline: three engines (`pathStates` once per kind). Each: `resetBody()`, `injectStyles(window, css)` (`dom-environment.ts:46`), `createEngine()`, `step('init', …)`, `step(switchTimeline(uri, 0))`, the path, `stop`, `destroy`, styles removed.
- The element state is the scenario's `elementSnapshot` (`scenario.ts:345`, exported by B4) without `exists` / `controllers`, so `visible` is the same `isVisible` (`:365-373`).
- Problem fields (`SmokeProblem`, `smoke-runner.ts:61-77`): `code: 'position-nondeterministic'`, `severity: 'error'`, `timeline` (source name) and `time: t`, plus all three path values (FR-031). No new field is needed: `McpDiagnosticSchema` already carries `expected` and `actual` (`mcp/diagnostics.ts:107-108`), so the json, ndjson and MCP shapes are unchanged.
  - `expected`: the linear value as JSON text. For a class that is its presence (`true` / `false`); for `text` / `style` the string; for `visible` the boolean.
  - `actual`: the JSON text of `{ "fresh": <value>, "end-back": <value> }`, the values of both other paths at t, whether one of them differs or both do. FR-031's "`actual` the value of the path that differs" still holds, and the third value survives when the FR-032 key folds two differing paths into one problem.
  - message: `element #<id>: class '<c>' present after linear play to <t>s, absent after the <paths> path (recurs at <n> more boundaries)`. `<paths>` names **every** differing path: `fresh`, `end-back` or `fresh and end-back`. `text`, `style` and `visible` use the same form.
- Location (FR-031): among the timeline's ranged actions whose operations touch `#<id>` (B7) and whose start or end is ≤ t, the one with the largest such time; its map location through the runner's `inFile`; otherwise the timeline's location.
- SC-009(8) counts engines through `env.createEngine`, the only way `checkDeterminism` gets one.

#### B3. `smoke-runner.ts` (FR-030, FR-037)

- `SMOKE_CODES` (`:41-58`): `scenario-media-timeline` out, `position-nondeterministic` in (P11).
- `SmokeOptions` (`:101-117`) gains `readonly determinism?: boolean`.
- `smokeConfig(config: IEngineConfiguration, map: EligianMap, options?: SmokeOptions) => Promise<SmokeResult>` (`:133`):
  - after `smokeWindow()`: `const restoreClock = installMediaClock(window, src => durations.get(src))`, restored in the `finally` beside `restore()`.
  - `playable = walked` (the media filter and the `skipped` report at `:173-176` go); the `runnableWith` provider-settings filter (`:181-193`) stays.
  - the scenario uses every timeline (the `scenarioTimelines` filter at `:265` and the `mediaOnlyProblem` branch go).
  - after the scenario: the `domEquals` assertions through `checkDomEquals` with `pathStates(env, timeline, kind, [t])` (P6); then, when `options.determinism`, every problem of `checkDeterminism(env, config, map, { names, timelines: walked })` goes through `report`. `env` reuses the local `createEngine`, `step`, `injectStyles` and `readCssFiles` (`:316-318`).
- Without `--determinism`, the output of a program with no `mediaplayer` timeline is byte-identical (FR-033): the new paths run only under the option, and the clock touches nothing in a program without media elements.

#### B4. Scenario DSL (FR-015, P6) — `smoke/scenario.ts`

- `Assertion` (`:30-45`) gains `textPrefixOf: Schema.optionalKey(Schema.String)` and `domEquals: Schema.optionalKey(Schema.Union([Schema.Struct({ freshAt: Schema.Finite }), Schema.Struct({ linearAt: Schema.Finite })]))`.
- `parseScenario(json: unknown) => ParsedScenario` (`:109`): `textPrefixOf` requires a `selector` (added to `ELEMENT_FIELDS`, `:94`); `domEquals` refuses one; both through the existing `{ ok: false, message }` path.
- `checkAssertions` (`:381`): `textPrefixOf: full` passes when `text !== '' && text.length < full.length && full.startsWith(text)`, else `fail('textPrefixOf', full, text)` (a `scenario-assertion-failed`, `:401-407`).
- New export, called by `smokeConfig` after the scenario engine is destroyed:

```ts
export async function checkDomEquals(
  scenario: Scenario,
  results: readonly ScenarioStepResult[],
  reference: (timelineName: string, kind: 'fresh' | 'linear', at: number) => Promise<LayoutState>,
  report: (problem: SmokeProblem) => void
): Promise<void>;
```

  One `scenario-assertion-failed` per differing (element, property), `expected` the reference value, `actual` the step snapshot's value (FR-015).
- `elementSnapshot` (`:345`) is exported for B2. `mediaOnlyProblem` and the media branch of `navigate` go (P11). `ScenarioContext` (`:186-198`) is unchanged; `runScenario` skips `domEquals` assertions.

#### B5. `smoke-command.ts`, `main.ts` (FR-033)

- `SmokeCommandOptions` (`smoke-command.ts:33-44`) gains `readonly determinism?: boolean`; `smokeFile(file, options)` (`:109`) passes it to `smokeConfig`.
- `main.ts` smoke command (`:415-450`): `.option('--determinism', 'also compare the DOM at every boundary reached by linear play, a straight seek and a seek back from the end (position-nondeterministic)', false)`.
- ndjson: a determinism problem goes through the existing `report` → `listener.problem`, so it is a `problem` line as soon as it is found, before `summary` (SC-009(5)).

#### B6. `eligian_smoke` (FR-034) — `mcp/tools/smoke.ts`

- `Parameters` (`:96-105`) gains `determinism: Schema.optionalKey(Schema.Boolean)`; the argv builder (`:405-417`) adds `...(params.determinism === true ? ['--determinism'] : [])`; `summarizeArgs` (`:138`) records it.
- `DESCRIPTION` gains one sentence ("`determinism: true` compares linear play, a straight seek and a seek back from the end at every boundary; about three times slower, so pass `timelines` for a subset"); the 16,384-char limit and the `KEYWORDS` test stay green. The `onSpawn` seam is unchanged (spec Review notes).

#### B7. Touched selectors — new `smoke/touched-selectors.ts`

```ts
/** The literal selectors an operation list selects or acts on, following requestAction + startAction / endAction. */
export function touchedSelectors(
  operations: readonly WalkedOperation[],
  actions: ReadonlyMap<string, ActionBody>
): ReadonlySet<string>;
```

- Built on `walkOperations(operations, actions) => WalkResult` (`controller-balance.ts:177`; its events carry `selector` for class and controller effects) plus each `selectElement`'s `operationData.selector`, resolved with `resolveOperationData(value, data)` (`:63`). Both come from `@eligian/language/mcp`, and so do the parameter types `WalkedOperation` and `ActionBody`, which A5 adds to `mcp.ts` (they are not exported there today). Used by B2 (location) and by `storyboard.beatsCovered` (D1), so a beat and a difference are matched the same way.
- Touched files: `smoke/touched-selectors.ts` (new) and `packages/language/src/mcp.ts` (A5). It is subject to B1's import constraint.

### C. MCP server (`packages/cli/src/mcp`)

#### C1. `eligian_compile` `explain` (FR-045–FR-047, I-5) — `tools/compile.ts`, new `origin-rules.ts`

- `origin-rules.ts`:

```ts
import type { OperationOrigin } from '@eligian/language';
export interface OriginRule {
  readonly rule: string;
  readonly docs: string;
}
export const ORIGIN_RULES: Readonly<Record<OperationOrigin, OriginRule>> = { /* 16 entries */ };
```

  The `docs` ids (the FR-046 drift test checks each against `index.json`): `source`, `call` → `map-actions-and-calls`; `library-qualified` → `map-imports-and-assets`; `param-binding`, `target`, `with` → `map-dataflow`; `erased-save`, `erased-restore` → `map-erased-parameters`; `concat`, `saved-result`, `loop-control` → `map-control-flow-and-data`; `interaction` → `map-events-and-interactions`; `lifecycle`, `sequence`, `stagger` → `map-timeline-and-providers`; `init-globaldata` → `map-program-and-config`. Each rule ≤ 300 chars.
- `Parameters` (`:56-68`) gains `explain: Schema.optionalKey(Schema.Boolean)`; `summarizeArgs` (`:122-127`) adds `...(params.explain === undefined ? {} : { explain: params.explain })` (FR-047).
- `Success` (`:92-106`) gains:

```ts
explain: Schema.optionalKey(
  Schema.Struct({
    operations: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          /** locateConfigPath notation: timelines[0].timelineActions[2].startOperations[1] */
          path: Schema.String,
          action: Schema.String,
          systemName: Schema.String,
          origin: Schema.String,
          location: Schema.optionalKey(Schema.Unknown),
        })
      )
    ),
    counts: Schema.optionalKey(Schema.Record(Schema.String, Schema.Int)),
    rules: Schema.Record(Schema.String, Schema.Struct({ rule: Schema.String, docs: Schema.String })),
  })
),
```

- `explainOf(compiled, view, selection?)`: walks `config.initActions`, `actions`, `eventActions` and `timelines[t].timelineActions`, with their start and end lists, and reads the origin from `compiled.map.actions[action.id].start[i].origin` (the map is already in `CompileResult.map`, `compile-file.ts:61`). `fragment` → the operations of the selection's action ids (the ids `mapOf` already derives, `compile.ts:315-335`); `full` → every operation (I-5); `summary` → `counts` per origin only. `rules` lists each present origin once. The path notation is `locateConfigPath`'s (`eligian-map.ts:259-266`). The payload goes through the existing `asJson` (`compile.ts:113`).
- A program with errors returns from the existing `'results' in outcome` branch (`:364-371`) before `explainOf`, so it carries no explain (FR-047). `response_format` does not affect `explain`, so concise ⊆ detailed holds.
- Effect: `explainOf` is pure; `handle` stays `Effect.Effect<CompileSuccess, ToolError, CompilerLock>` (`:342-345`).

#### C2. Telemetry (FR-007, P10) — `telemetry.ts`, `server.ts`, `tools/check.ts`

```ts
export interface TelemetryLine {
  /* t, tool, ms, chars, ok, args as today (`telemetry.ts:11-18`) */
  readonly result?: Readonly<Record<string, unknown>>;
  readonly truncated?: true;
}
export interface Telemetry {
  readonly withTelemetry: <A, E, R>(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    run: (requestId: string) => Effect.Effect<A, E, R>,
    summarizeResult?: (value: A) => Readonly<Record<string, unknown>>
  ) => Effect.Effect<A, E, R>;
}
/** Pure: the line text, at most 1,000 chars; a result.codes that does not fit is cut (largest counts kept) and marked truncated. */
export function telemetryText(line: TelemetryLine): string;
```

- `withTelemetry` (`telemetry.ts:83-108`): on a success exit, `result: summarizeResult?.(exit.value)`; the line text is `telemetryText(line)`.
- `tools/check.ts` exports `summarizeResult = (success) => ({ codes: <distinct code → count over success.diagnostics, a codeless diagnostic counted under its source> })`; `server.ts`'s `boundary` (`:79-86`) passes an optional fourth argument through, set for `eligian_check` only.

#### C3. Recycling (FR-060–FR-063) — `compiler-lock.ts`

```ts
export interface CompilerLockHooks {
  /* onQueued, onAcquire, onRelease, latch as today (`compiler-lock.ts:13-19`) */
  /**
   * After the recycle released the documents and reset the services; awaited inside the permit (tests hold here).
   * `=> Promise<void>`, as `latch` is (`:18`): `Effect.tryPromise`'s thunk must return a `PromiseLike<A>`
   * (effect 4.0.7, `Effect.d.ts:1297`, `<A>(options: (signal: AbortSignal) => PromiseLike<A>)`). A hook that only records is `async n => { … }`.
   */
  readonly onRecycle?: (completedSections: number) => Promise<void>;
}
export interface CompilerLockOptions {
  /** Recycle after every N completed sections (default 100, roadmap §2) */
  readonly recycleAfter?: number;
  /** Default: recycleCompilerServices */
  readonly recycle?: () => void;
}
export const makeCompilerLock: (
  hooks?: CompilerLockHooks,
  options?: CompilerLockOptions
) => Effect.Effect<CompilerLock['Service']>;
export const compilerLockLayer: (
  hooks: CompilerLockHooks,
  options?: CompilerLockOptions
) => Layer.Layer<CompilerLock>;
/** releaseWorkspaceDocuments(every LangiumDocuments uri) + resetServices(), on the root singleton (P1). */
export function recycleCompilerServices(): void;
```

- Inside the existing `Effect.uninterruptible(...)` (`compiler-lock.ts:45-56`), after `section` and before `onRelease`, an `Effect.onExit` increments the counter. At each multiple of N it runs `recycle()`, then `onRecycle(count)`. The hook is awaited with `Effect.tryPromise(() => onRecycle(count)).pipe(Effect.orDie)`, as `holdAt` does (`:34-35`), and the step is `Effect.void` when no hook is set.
  - **The counter is created per layer build, beside the semaphore** (P20). It is a `let completed = 0` inside the `Effect.map(Semaphore.make(1), semaphore => …)` callback (`:40`), not in `makeCompilerLock`'s body. Each server's build of `CompilerLockLive` runs that callback once, so each server counts only its own sections. The single permit serialises the increments.
  - Every acquired section counts, success or failure. A queued call interrupted before it acquires never reaches the counter (`semaphore.withPermits(1)` stays interruptible while waiting, `:43-44`), so it does not count (SC-015(7)).
  - The recycle runs inside the permit and cannot be interrupted (FR-061); SC-015(6) holds it through `onRecycle`.
- `recycleCompilerServices` passes `getOrCreateServices().shared.workspace.LangiumDocuments.all.map(doc => doc.uri)` to `releaseWorkspaceDocuments(uris: Iterable<URI>): void` (`parser.ts:364`), then calls `resetServices()` (A4); all from `@eligian/language`, the root (P1).
- `CompilerLockLive` (`:64-67`) keeps its shape (`Layer.effect(CompilerLock, makeCompilerLock())`, default options); `CompilerLockPassThrough` (`:74-77`) never recycles.
- Test (P20): one `compilerLockLayer({ onRecycle }, { recycleAfter: 3 })` value, built twice (provided to two separately run programs, which is how `CompilerLockLive` is shared), runs two sections in each build without a recycle. A third section in one build gives exactly one `onRecycle(3)`. A counter shared between builds would fire at the third section overall.
- `formatSource`'s own service set (`lsp/format-source.ts:22`, `:29`) is not touched (I-10).
- Soak (FR-063): `mcp-soak.spec.ts` in a new vitest project, `{ extends: true, test: { name: 'cli-soak', include: ['src/__tests__/mcp-soak.spec.ts'], execArgv: ['--expose-gc'], env: { ELIGIAN_SOAK: '1' } } }`, and excluded from the `cli` project. Script `"test:soak": "vitest run --project cli-soak"`. The spec fails ("run pnpm -C packages/cli run test:soak: it needs --expose-gc") when `typeof globalThis.gc !== 'function'`. It counts recycles with `compilerLockLayer({ onRecycle })` passed as `ServerOptions.lock` (`server.ts:36-37`), default N. `scripts/measure-heap.ts` gains `--calls <n>` (default 100) and prints the recycle count.

#### C4. Instructions (FR-050, I-8) — `instructions.ts`

- `MCP_PHASE = 3`; `WORKFLOW_PHASE_3` is `WORKFLOW_PHASE_2` (`:36-44`) with §3.5's `eligian_compile` line verbatim ("once after your first timeline passes check (select it, explain:true), and whenever behaviour surprises you") and, only if the whole string stays ≤ 4,096 chars (asserted), the smoke line "…(click, key, seek), then determinism:true".
- `INSTRUCTIONS: Readonly<Record<1 | 2 | 3, string>>` (`:69`). The AGENTS.md block is built from the phase's parts, so `agents-block.md` names `explain` (FR-051).

#### C5. `eligian_init` next steps (FR-051) — `tools/init.ts:91-99`

- "Call eligian_compile once after your first timeline passes check (select it)." becomes "After the first timeline passes check, call eligian_compile(select, explain:true)."; the I-1 comment goes.

#### C6. `compileFile` names (P5) — `compile-file.ts:343`

- `map: { ...map, source: absoluteInputPath, timelineNames: timelineNames(program) }`.

### D. The eval library (`packages/cli/src/mcp/evals/`, built to `dist/evals/assert.mjs`; FR-083, P9)

Plain synchronous TypeScript, no Effect services: it spawns the CLI with `spawnSync` as `gate.ts:700-705` does today and returns failures as data.

#### D1. `assert.ts` — the entry and the assertion library (FR-011–FR-013)

```ts
export interface AssertionInput {
  readonly projectDir: string;
  readonly entry: string;
  readonly config: IEngineConfiguration;
  readonly map?: EligianMap;
  /** readStoryboard(text) of STORYBOARD.md (storyboard.ts:56); undefined when the file is absent */
  readonly storyboard?: Storyboard;
  /** Gate step 1's diagnostic codes */
  readonly checkCodes?: readonly string[];
  /** Cases 13 and 14: the case's start/ directory */
  readonly startDir?: string;
  /** evals/mcp: the base of config.equivalent fixtures */
  readonly casesDir: string;
  /** library.checksClean: runs the CLI */
  readonly eligian?: (args: readonly string[]) => { status: number | null; stdout: string; stderr: string };
}
export type AssertionKind = (typeof ASSERTION_KINDS)[number];
export type Assertion = { readonly kind: AssertionKind } & Readonly<Record<string, unknown>>;
export interface AssertionResult {
  readonly kind: AssertionKind;
  readonly pass: boolean;
  readonly detail: string;
}
export const ASSERTION_KINDS: readonly string[]; // as const, the kinds below
export function parseAssertions(json: unknown): { ok: true; assertions: readonly Assertion[] } | { ok: false; message: string };
export function evaluateAssertions(input: AssertionInput, assertions: readonly Assertion[]): readonly AssertionResult[];
export * from './gate-steps.js';
export * from './harness.js';
export * from './transcript.js';
```

`parseAssertions` validates each kind's parameters with an Effect `Schema` (`eval-cases.spec.ts` uses it for "only known assertion kinds"). The kinds:

| Kind | Parameters | Passes when |
| --- | --- | --- |
| `timelines.count` | `equals?`, `min?`, `type?` | the count of config timelines (of `type`, when given) matches |
| `timeline` | selection: `at?` (index) \| `name?` (source name via `map.timelineNames`) \| `type?` (first of that type); checks: `type?`, `positionSource?`, `duration?`, `loop?`, `from?`, `sourceType?`, `hasDuration?` | the selected timeline has each given property (`positionSource.systemName`, `positionSource.sources[0].src` / `.type`) |
| `timeline.rangedActions` | selection as `timeline`, `min` | ≥ `min` timeline actions with an `end` ≥ 0, lifecycle excluded |
| `timelines.lifecycle` | `names` (source names), `enter?`, `leave?` | each has a `timeline-lifecycle` action with non-empty start / end operations |
| `timeline.addsController` | `controller`, `names` | each named timeline's `controllerBalance` entry (`controllerBalance(config: IEngineConfiguration) => readonly ControllerBalance[]`, `controller-balance.ts:190`) has an `added` of `… <controller>` |
| `timeline.scrollSelectorInLayout` | selection as `timeline` | its `positionSource.selector` is a `#id` of the layout |
| `timeline.rangeTouches` | `selector` | a ranged timeline action whose `touchedSelectors` (B7) holds it |
| `actions.named` | `names?`, `prefix?` | every name exists / some action name starts with `prefix` |
| `actions.called` | `names` | a `requestAction` with that `systemName` exists |
| `operations.used` | `all?`, `anyOf?` | over every operation of the config |
| `controllers.used` | `all?`, `anyOf?` | a literal `getControllerInstance` or a `controllerBalance` addition (as `addsController`, `gate.ts:512-519`) |
| `controllers.balanced` | — | every `controllerBalance(config)` entry has `added` = `removed` and no `unresolved` |
| `interactions.keyboard` | `keys` | a `KeyboardController` `addControllerToElement` binds each key |
| `interactions.listener` | `controller`, `event?`, `runs?: true` | a listener operation of that controller whose `actions` name a declared action (not a synthetic `__nav__` / `__on__` one, when `runs`) |
| `interactions.seekTo` | `position` | a `broadcastEvent` with `eventName: 'timeline-seek-request'` and `eventArgs[0] === position` |
| `interactions.noWait` | `triggers` (selectors) | each trigger has at least one `DOMEventListenerController` listener (the `controller-added` events with A5's `data`), and no operation those listeners run is a `wait`. The run actions are followed transitively: each `data.actions` name, then every literal `requestAction` `systemName` in its start and end operations, through `config.actions`, to any depth. A trigger with no listener fails. This is FR-027's "a covering range (not a `wait`)" (§6.2 #10, "timeline-driven, not `wait`"). |
| `replay.resetThenSeek` | `trigger` | the action the trigger's listener runs (followed through calls) has a non-select operation before a `timeline-seek-request` broadcast with `[0]` (the `presentation-patterns` recipe, `curriculum/presentation-patterns.md:89-108`) |
| `stagger.spaced` | `count`, `gap` | a timeline has `count` `stagger-*` actions whose starts are `gap` apart (±1e-6) (from `gate.ts:602-625`) |
| `origins.present` | `all` | every origin occurs among the `map` operations |
| `check.codesAbsent` | `codes` | none of them in `checkCodes` |
| `files.exist` | `paths` (relative POSIX) | each exists under `projectDir` |
| `layout.hasId` | `ids` | each is an id of the layout the entry imports (`gate.ts:495-510`) |
| `layout.gainedCssOnlyIds` | — | every id the start state used that only its CSS defined is in the layout now (`gate.ts:433-462`) |
| `css.definesStateClasses` | `classes?` | the CSS defines `.c` for `classes` and for every literal `addClass` / `toggleClass` class (`gate.ts:540-565`) |
| `css.hasRule` | `selector`, `anyProperty` | a rule for `selector` sets one of the properties |
| `locales.languages` | `codes` | each in `config.availableLanguages` |
| `source.blocks` | `keyword`, `equals?` \| `anyOf?` (keywords) | comment-stripped source scan (`stripComments`, `gate.ts:286-291`) |
| `source.provider` | `name` | a timeline declared `using <name>` |
| `source.label` | `name` | an `as <name>` event label |
| `source.labelSeek` | `label`, `anchor: 'start' \| 'end'` | the comment-stripped source has a `seek` interaction to that label, `/\bseek\s+<label>\.<anchor>\b/`, so the seek uses the label and not a literal time (§6.2 #11, "`seek reveal.start`") |
| `source.extensions` | `module`, `operations` | an `extensions "<module>" { operation <name>(<params>) }` declaration |
| `library.file`, `library.imports`, `library.jsdoc`, `library.checksClean` | `dir`, `names` | from `checkLibraryReuse` (`gate.ts:657-686`); `checksClean` runs `eligian check <the library files> --max-warnings 0` through `input.eligian` |
| `dataflow.callsPreserved`, `dataflow.selectedBeforeAddClass` | — | from `checkFixDataflow` (`gate.ts:369-431`), split in two |
| `storyboard.exists` | — | `STORYBOARD.md` exists with ≥ 1 beat row |
| `storyboard.beatsCovered` | — | FR-012: each beat row → a timeline action of the timeline at `map.timelineNames.indexOf(row.timeline)` whose `[start, end]` covers the row's range within `POSITION_TOLERANCE_S` (`scenario.ts:86`) and whose `touchedSelectors` holds the row's selector; each interaction row → its own listener, by the per-row rule "Interaction rows" below (P18). Detail: every unmatched row, beat or interaction; "no storyboard" when absent |
| `beats.min` | `n: number \| 'storyboard' \| 'start'` | ranged, non-lifecycle timeline actions ≥ n (`'start'`: P17) |
| `config.equivalent` | `fixture` (relative to `casesDir`, `evals/mcp/cases`: `../fixtures/…`) | FR-028 over `configFragment(config: IEngineConfiguration) => Json` (`config-fragment.ts:85`) of both: the same timeline uris and durations, the same action names, per action the same operation `systemName` sequence once `setOperationData` entries are compared as a multiset, the same controllers |

- `Storyboard.interactions` is a count today (`storyboard.ts:23`); FR-012 needs the rows, so `readStoryboard(text: string) => Storyboard` (`:56`) gains `interactionRows: readonly StoryboardInteraction[]` (`{ trigger, target, verb, timeline }`), and `interactions` stays their count (`storyboard.spec.ts` extended).
- **Interaction rows (FR-012, P18): one listener per row.** The columns mean what `curriculum/storyboard.md` teaches (its "Column rules" and the template row at `:41`). `trigger` is `click #<id>`, `<event> #<sel>` or `key <Key>`. `target` is "the timeline name for `navigate`, the time for `seek`, the action call for `run`, `-` for `play`, `pause`, `toggle` and `stop`". `timeline` is the view whose `on enter` wires the listener. A row `{ trigger, target, verb, timeline }` is matched when the timeline at `map.timelineNames.indexOf(row.timeline)` has a listener whose trigger and action both match:
  - **The listeners**: the `controller-added` events (with A5's `data`) of `walkOperations` over the start operations of each of that timeline's timeline actions, the lifecycle action included. The walk follows the calls, so a listener added inside a called action counts.
  - **Trigger**:
    - `<event> #<sel>`: a `DOMEventListenerController` listener with `selector === '#<sel>'` and `data.eventName === <event>`;
    - `key <Key>`: a `KeyboardController` listener whose `data.keys`, split on `,` and `+`, trimmed and lower-cased, contains `<Key>` lower-cased.
  - **Action**, by verb, checked against the listener's `data.actions`, with the names derived by the compiler's `interactionActionName` (A5):
    - `navigate`: `interactionActionName('navigate', <target>, 0)`, or that name followed by `__` and a position suffix (`navigate … at t`, `syntheticNavActionName`'s `posSuffix`, `navigate-operations.ts:175`);
    - `play` / `pause` / `toggle` / `stop`: `interactionActionName(verb, undefined, 0)`, which is `__on__<verb>`;
    - `seek`: if the target is a number of seconds (`12`, `12s`), `interactionActionName('seek', undefined, n)`; for any other target (a label such as `reveal.start`), any name that starts with `__on__seek__`;
    - `run`: the target's action name (the text before `(`), or a name ending in `.<that name>` (a library-qualified helper, `library-imports.ts:24`). A `run` listener names the declared action itself (`operation-transformer.ts:466-471`), and that action must exist in `config.actions`.
  - **Rows are matched independently.** A storyboard with three interaction rows and one implemented listener fails, and the detail names the two unmatched rows. A row that cannot be parsed (an unknown verb, or a trigger in neither form) is unmatched, and its detail says why.
- Every case check in `gate.ts` (`checkTitleCard` … `checkFixSelectors`, `gate.ts:369-686`) and its helpers (`operationLists`, `resolveOperationData`, `walk`, `controllerBalance`, `gate.ts:174-284`) are deleted from `gate.ts` (SC-007(6)).

#### D2. `gate-steps.ts` — the §6.1 steps (FR-014)

```ts
export interface GateCase {
  readonly id: string;
  readonly entry: string;
  readonly scenario?: string;
  readonly assertions: readonly Assertion[];
  readonly fixtures?: readonly { readonly from: string; readonly to: string }[];
  readonly budget?: Budget;
}
export interface StepOptions {
  readonly dir: string;
  /** The bin/cli.js to run: the installed tarball's (gate.ts) or the repo's (solutions spec) */
  readonly cli: string;
  readonly casesDir: string;
  readonly evalCase: GateCase;
}
export interface StepsResult {
  readonly failures: readonly string[];
  readonly checkCodes?: readonly string[];
  readonly assertions: readonly AssertionResult[];
  /** Step 4's --eligian-map file (eligianMapPath('out/config.json') = out/config.eligian-map.json, cli-options.ts:50-52), read back; SC-011(1)'s solutions half */
  readonly map?: EligianMap;
}
/** Step 3's argv after `smoke <entry>`: --strict --format json [--scenario <file>] --determinism (FR-014 step 3) */
export function smokeStepArgs(evalCase: GateCase, casesDir: string): readonly string[];
/** Steps 1–5: check, fmt --check, smoke --strict --scenario --determinism, compile --eligian-map + assertions, the scenario's results. */
export function runGateSteps(options: StepOptions): StepsResult;
/** Copy every `fixtures` entry ({ from: relative to casesDir, to: relative to dir }); a missing file is a named failure. */
export function materialiseFixtures(evalCase: GateCase, casesDir: string, dir: string): readonly string[];
```

- The steps are today's (`gate.ts:731-776`), with `--determinism` added to step 3 (through `smokeStepArgs`, the only builder of step 3's argv) and step 4's case checks replaced by `evaluateAssertions`. As today, every step runs and its failures are collected, so a step-1 failure does not hide a step-3 one. Every CLI step is `spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 64 MiB })`.
- Step 5 lists the `scenario-*` problems of step 3's JSON report separately from its other problems.
- A case without its scenario file or with a missing fixture fails with a named message (Edge cases).

#### D3. `transcript.ts` — transcript and metrics (FR-005, FR-007, P13)

```ts
export function parseTranscript(text: string): unknown[]; // moved from gate.ts:67
export interface ToolCall { readonly name: string; readonly input: Record<string, unknown> }
export interface ToolEntry extends ToolCall {
  readonly id: string;
  readonly resultText?: string;
  readonly resultChars: number;
}
export function toolEntries(events: readonly unknown[]): ToolEntry[];
export function toolCalls(events: readonly unknown[]): ToolCall[]; // a projection of toolEntries
export function isCheckBashCall(call: ToolCall): boolean; // gate.ts:102-106
export function isCliBashCall(call: ToolCall): boolean; // CHECK_COMMAND widened to any subcommand
export function readMcpLog(file: string): TelemetryLike[]; // gate.ts:109-122
export interface RunMetrics {
  readonly rounds: number;
  readonly checkToolCalls: number;
  readonly checkBashCalls: number;
  readonly toolCalls: number;
  readonly transcriptToolChars: number;
  readonly toolChars: number;
  readonly channelChars: number;
  readonly operationsBeforeFirstUnknown: boolean;
  readonly hitUnknown: boolean;
  readonly explainCalled: boolean;
  readonly fmtCalled: boolean;
  readonly wallMs?: number;
}
export function computeMetrics(
  arm: Arm,
  events: readonly unknown[],
  log: readonly TelemetryLike[],
  wallMs?: number
): RunMetrics;
```

- `transcriptToolChars`: the sum of `resultChars` (a string `content`'s length; for an array, the sum of its items' `text` lengths).
- `toolChars`: the sum of telemetry `chars` (`gate.ts:132-135`). `channelChars`: A1 → `toolChars`; A0 / A-none → the `resultChars` of `Read` / `Grep` / `Glob` entries whose `file_path` / `path` (normalised to `/`) contains `node_modules/eligian/dist/docs`, plus `Bash` entries matching `isCliBashCall` (FR-008).
- `operationsBeforeFirstUnknown` (I-11): the reference point is the first check entry (`mcp__eligian__eligian_check`, or `isCheckBashCall`) whose `resultText` contains `unknown_operation` or `missing-action-dependency` (`validators/codes.ts:81`, `:116`); else the first check entry; else the end of the run. It is true when an earlier entry is any of:
  - an `mcp__eligian__eligian_operations` call;
  - an `mcp__eligian__eligian_docs` entry that **returned** the chunk (FR-007: "`eligian_docs` returned it"). Its `resultText` (paired by `toolEntries`, P13), parsed as JSON, must have an item with `id === 'operations-index'` in `cards`, `bodies` or `hits` (`tools/docs.ts`, `Success`). An `ids` request and a `query` hit therefore both count, but an `ids` request whose id came back in `unknown` does not. A `resultText` that does not parse counts when it contains `"id":"operations-index"`;
  - a `Read` / `Bash` / `Grep` entry that names `generated/operations-index.md`.

  `hitUnknown` records which reference applied.
- `explainCalled`: an `mcp__eligian__eligian_compile` entry with `input.explain === true`. `fmtCalled`: an `mcp__eligian__eligian_fmt` entry or a CLI `fmt` Bash call.
- `rounds` keeps Phase 1's definition (`gate.ts:136-138`): check tool lines + CLI check calls − 1.

#### D4. `harness.ts` — arms, verdicts, budgets, summary, result schema (FR-001–FR-009, FR-023)

```ts
export type Arm = 'A0' | 'A1' | 'A-none';
/** I-6: the aliases of --model */
export const MODELS: Readonly<Record<'sonnet' | 'opus', string>> = {
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
};
export interface HarnessArgs {
  readonly cases: readonly string[];
  readonly arms: readonly Arm[];
  readonly runs: number;
  readonly model?: string;
  readonly callBudget: 'off' | 'enforce';
  readonly writeBudgets?: string;
}
export const HARNESS_USAGE: string;
export function parseHarnessArgs(argv: readonly string[], knownCases: readonly string[]): HarnessArgs | 'help' | string;
export interface ArmSetup {
  /** The file passed as --mcp-config */
  readonly mcpConfig: string;
  readonly allowedTools: string;
}
/**
 * SC-006(3): prepares an installed project for its arm, so it is called after `npm install`. The function does every
 * file operation itself, and the runner only passes the returned values to `claude -p`.
 * A1: writes <dir>/.mcp.json and <dir>/AGENTS.md. A0: writes <dir>/AGENTS.md, and the empty-server config in `scratch`.
 * A-none: writes the empty-server config in `scratch`, and deletes <dir>/node_modules/eligian/dist/docs.
 * `scratch` is outside `dir`, so no arm except A1 has a .mcp.json in the project.
 */
export function prepareArmProject(
  arm: Arm,
  project: { readonly dir: string; readonly cli: string; readonly mcpLog: string; readonly scratch: string }
): ArmSetup;
export interface Budget {
  readonly toolCalls: number;
  readonly fromRun: string;
  readonly model: string;
}
export function budgetFailures(metrics: RunMetrics, budget: Budget | undefined, mode: 'off' | 'enforce'): readonly string[];
export function medianBudget(runs: readonly RunRecord[], fromRun: string): Budget | undefined;
/**
 * FR-023, `--write-budgets <run-id>`: for each case file `<casesDir>/<id>.json`, sets `budget = medianBudget(records of
 * that case, runId)` when it is defined. Returns the files it changed.
 */
export function writeBudgets(records: readonly RunRecord[], casesDir: string, runId: string): readonly string[];
export function caseVerdict(runs: readonly RunRecord[]): { pass: boolean; passed: number; denominator: number };
export function renderSummary(records: readonly RunRecord[]): string;
/** FR-005: one result JSON, results/<run-id>/<case>/<arm>-<n>.json. Every field is required; a not-applicable one is null, never absent. */
export interface RunRecord {
  readonly runId: string;
  readonly case: string;
  readonly arm: Arm;
  readonly n: number;
  /** The resolved model id and the CLI version of the tarball (SC-006(4)) */
  readonly model: string;
  readonly cliVersion: string;
  /** No `result` event in the transcript (Edge cases) */
  readonly aborted: boolean;
  readonly pass: boolean;
  /** FR-005: the failures of each gate step 1–6; [] for a step that passed or was skipped */
  readonly steps: readonly { readonly step: 1 | 2 | 3 | 4 | 5 | 6; readonly failures: readonly string[] }[];
  /** FR-005: the tool-call sequence, tool names in call order (toolCalls(events)); its length is metrics.toolCalls */
  readonly toolSequence: readonly string[];
  /** FR-005 / FR-007: rounds, tool calls, transcriptToolChars, toolChars, channelChars and the FR-007 metrics */
  readonly metrics: RunMetrics;
  /** FR-005: the final `result` event's usage (input and output tokens, other keys kept); null when the run has none */
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number; readonly [key: string]: unknown } | null;
  /** FR-005: the wall time */
  readonly wallMs: number;
  /** FR-005: the detail of each assertion; [] when step 4 did not compile */
  readonly assertions: readonly AssertionResult[];
  /** FR-009: null when the judge did not run (A-none, or a failed judge call) */
  readonly rubric: { readonly score: number; readonly model: string } | null;
}
/** Decodes a RunRecord; every key above is required (SC-006(4)), and only usage and rubric may be null. */
export const RunRecordSchema: Schema.Codec<RunRecord>;
```

- `prepareArmProject`:
  - A1: today's `.mcp.json` (`run.ts:157-171`), `AGENTS.md` from `dist/docs/agents-block.md`, and `ALLOWED_TOOLS` (`run.ts:32`).
  - A0: `AGENTS.md`, an `{ "mcpServers": {} }` config written to `scratch`, and the allowed tools without `mcp__eligian__*`.
  - A-none: no `AGENTS.md`, the same empty config, and `fs.rmSync(<dir>/node_modules/eligian/dist/docs, { recursive: true, force: true })`, run by the function itself.
  - `run.ts` performs no arm file operation of its own, so the spec tests the deletion that A-none depends on.
- `writeBudgets`: reads each case file and sets `budget: { toolCalls, fromRun: runId, model }`. An existing `budget` is replaced in place; otherwise the key is appended last, so every other key keeps its order. The file is written as 2-space JSON with a trailing newline. A case without a passing, non-aborted, pinned-Sonnet A1 record is not written at all, so it stays byte-identical. Running it twice on the same records gives the same bytes. `run.ts --write-budgets <run-id>` only reads `results/<run-id>/**/*.json`, decodes each with `RunRecordSchema`, and calls it.
- `budgetFailures`: rounds > 2, wall clock > 15 min and `channelChars` > 80,000 (`gate.ts:24`); under `enforce`, `toolCalls > ⌊1.5 × budget.toolCalls⌋` (`tool calls 61 > 60`), or "no tool-call budget" when `budget` is absent (FR-008). One budget for every arm.
- `medianBudget`: only records with `arm === 'A1'`, `pass`, not aborted, model `MODELS.sonnet`; the lower middle value for an even count; none → `undefined` (FR-023).
- `caseVerdict`: aborted runs excluded; pass iff `passed > denominator / 2` (FR-006).
- `renderSummary`: per arm, the cases passed out of 14; the means over all non-aborted runs (rounds, tool calls, `transcriptToolChars`); the passing-runs means; the means of `toolChars` and `channelChars`; the SC-003 fraction with its denominator and the `hitUnknown` fraction; the `fmtCalled` rate; the rubric means.

#### D5. The build (FR-083) — `packages/cli/esbuild.mjs`

A second context after `cliCtx` (`:102-126`), with the same `plugins` (the workspace-source plugin), `external` and `banner`:

```js
const evalsCtx = await esbuild.context({
  entryPoints: ['src/mcp/evals/assert.ts'],
  outfile: 'dist/evals/assert.mjs',
  bundle: true,
  target: 'ES2022',
  format: 'esm',
  platform: 'node',
  loader: { '.ts': 'ts' },
  external: Object.keys(pkg.dependencies ?? {}).flatMap(name => [name, `${name}/*`]),
  banner: { js: "import { createRequire as __eligianCreateRequire } from 'node:module';\nconst require = __eligianCreateRequire(import.meta.url);" },
  sourcemap: !minify,
  minify,
  keepNames: minify,
  plugins,
});
```

Watched or rebuilt with `cliCtx`, in every mode. `files` stays `bin/cli.js`, `dist/cli.mjs`, `dist/docs/**`, so the packed list is unchanged (FR-080). `main.ts` never imports `src/mcp/evals/`, so `dist/cli.mjs` does not grow.

### E. Harness scripts (`evals/mcp/`, outside Biome and tsconfig)

- **`gate.ts`**: argv (`<dir> --case <id> [--transcript <file>] [--wall-ms <n>] [--call-budget off|enforce]`), then `runGateSteps`, `computeMetrics` and `budgetFailures`, imported from `../../packages/cli/dist/evals/assert.mjs` with a dynamic `import()` after an existence check whose message names `pnpm -C packages/cli build`. Exports `runGate(options)` for `run.ts`.
- **`run.ts`**: `parseHarnessArgs`; packs once (`run.ts:100-109`); per case × arm × run: a temp dir, `npm install <tarball>`, the start files and `materialiseFixtures`, `prepareArmProject` (after the install), `claude -p` with the arm's `--mcp-config` / `--allowedTools` and the resolved model id (`--strict-mcp-config`, `--permission-mode acceptEdits`, `--output-format json`, FR-004), the gate, the rubric (A0 and A1 only, FR-009: a second `claude -p` over `rubric.md` + `STORYBOARD.md` + the entry, `--output-format json`, the judge model pinned in `rubric.md`; the score is the integer on the line `SCORE: n`; any failure records `rubric: null`), the result JSON at `results/<run-id>/<case>/<arm>-<n>.json` (validated with `RunRecordSchema`), then `summary.md`. A run with no `result` event is `aborted`. `--write-budgets <run-id>` reads and decodes that run's records and calls `writeBudgets` (D4), which does the rewrite; `run.ts` keeps only the argv and the file listing. The build stage runs no agent (FR-074).
- **`rubric.md`**: the pinned judge prompt (storyboard quality and provider justification, 1–5, the `SCORE:` line).
- **`generate-media.ts`**: see "Data and generation design".

### F. Cases, scenarios, fixtures, solutions

#### F1. Case file format (FR-025)

```json
{
  "id": "video-subtitles",
  "prompt": "…§6.2 prompt, then the ids and timeline names the scenario uses…",
  "entry": "main.eligian",
  "model": "claude-sonnet-5-5",
  "scenario": "video-subtitles.scenario.json",
  "fixtures": [{ "from": "../fixtures/media/intro.mp4", "to": "media/intro.mp4" }],
  "assertions": [{ "kind": "timelines.count", "type": "mediaplayer", "equals": 1 }],
  "budget": { "toolCalls": 40, "fromRun": "<run-id>", "model": "claude-sonnet-5-5" }
}
```

`budget` is absent until the user-driven `--write-budgets` (FR-023). *Ruling 2026-11-05 (build, T041): `casesDir` is `evals/mcp/cases` everywhere (case files, `<id>.scenario.json`, `<id>/start/`, as `gate.ts`'s `CASES_DIR` already reads it); `fixtures[].from` and `config.equivalent`'s `fixture` are relative to it, so they start with `../fixtures/`.* Cases 13 and 14 keep `start/` and gain `assertions`; §6.2 names no behaviour for them, so they have no scenario.

#### F2. Structural column → assertions (FR-025, FR-029; `eval-cases.spec.ts` mirrors this table)

| # | §6.2 Structural item (verbatim) | Assertion(s) |
| --- | --- | --- |
| 1 | "1 raf timeline, duration 10" | `timelines.count {equals:1}`; `timeline {at:0, type:'animation', duration:10}` |
| 1 | "`__on__play`/`__on__pause` actions" | `actions.named {names:['__on__play','__on__pause']}` |
| 1 | "layout has headline/subtitle ids" | `layout.hasId {ids:['headline','subtitle']}` |
| 1 | "CSS defines the state classes" | `css.definesStateClasses {classes:['in']}` |
| 2 | "≥ 4 timelines" | `timelines.count {min:4}` |
| 2 | "`__nav__*` actions" | `actions.named {prefix:'__nav__'}` |
| 2 | "`languages` with `en-US` + `nl-NL`" | `locales.languages {codes:['en-US','nl-NL']}` |
| 2 | "`LabelController`" | `controllers.used {all:['LabelController']}` |
| 2 | "every chapter has `on enter`/`on leave`" | `timelines.lifecycle {names:['Problem','Solution','Results'], enter:true, leave:true}` |
| 2 | "`controllers.balanced`" | `controllers.balanced` |
| 3 | "one `stagger` (6 actions 0.4 s apart)" | `source.blocks {keyword:'stagger', equals:1}`; `stagger.spaced {count:6, gap:0.4}` |
| 3 | "6 card ids in layout" | `layout.hasId {ids:['card-1','card-2','card-3','card-4','card-5','card-6']}` |
| 3 | "no `class-never-removed`" | `check.codesAbsent {codes:['class-never-removed']}` |
| 4 | "1 `mediaplayer` timeline with `VideoPositionSource`, `from` set" | `timelines.count {type:'mediaplayer', equals:1}`; `timeline {type:'mediaplayer', positionSource:'VideoPositionSource', from:'media/intro.mp4'}` |
| 4 | "5 ranged caption events" | `timeline.rangedActions {type:'mediaplayer', min:5}` |
| 4 | "`ProgressbarController` or Subtitles controller" | `controllers.used {anyOf:['ProgressbarController','SubtitlesController']}` |
| 4 | "CSS sizes `.eligius-video`" | `css.hasRule {selector:'.eligius-video', anyProperty:['width','height','max-width','max-height','inline-size','block-size']}` |
| 4 | "a raf hub timeline first" | `timeline {at:0, type:'animation'}` |
| 4 | "`media-timeline-first-without-start-gesture` clean" | `check.codesAbsent {codes:['media-timeline-first-without-start-gesture']}` |
| 5 | "1 timeline with `ScrollPositionSource`, `duration`" | `timelines.count {equals:1}`; `timeline {at:0, positionSource:'ScrollPositionSource', hasDuration:true}` |
| 5 | "scrollable selector in layout" | `timeline.scrollSelectorInLayout {at:0}` |
| 5 | "4 ranged events" | `timeline.rangedActions {at:0, min:4}` |
| 6 | "one timeline per slide … 12 timelines" | `timelines.count {equals:12}` |
| 6 | "a KeyboardController added in `on enter` and removed in `on leave`" | `timeline.addsController {controller:'KeyboardController', names:['slide-1',…,'slide-12']}`; `controllers.balanced` |
| 6 | "ArrowRight/ArrowLeft `navigate` to neighbours, Home to slide 1" | `interactions.keyboard {keys:['ArrowRight','ArrowLeft','Home']}`; `actions.named {prefix:'__nav__'}` |
| 6 | "`on key` → `KeyboardController`" | `controllers.used {all:['KeyboardController']}` |
| 7 | "`for`/`sequence`" | `source.blocks {anyOf:['for','sequence']}` |
| 7 | "`calc`/`math` + `setElementContent`" | `operations.used {anyOf:['calc','math'], all:['setElementContent']}` |
| 7 | "erased-parameter save/restore compiles" | `origins.present {all:['erased-save','erased-restore']}` |
| 7 | "W151 clean" | `check.codesAbsent {codes:['eligius-W151']}` (`check/lint.ts:37`: `` `eligius-${finding.rule}` ``) |
| 8 | "`lib\*.eligian` with `library`" | `library.file {dir:'lib'}` |
| 8 | "`import { fadeIn, fadeOut, slideIn }`" | `library.imports {dir:'lib', names:['fadeIn','fadeOut','slideIn']}` |
| 8 | "all three used" | `actions.called {names:['fadeIn','fadeOut','slideIn']}` |
| 8 | "JSDoc" | `library.jsdoc {dir:'lib', names:['fadeIn','fadeOut','slideIn']}` |
| 8 | "the library checks alone" | `library.checksClean {dir:'lib'}` |
| 9 | "`audio` timeline with `from`" | `source.provider {name:'audio'}`; `timeline {type:'mediaplayer', from:'media/song.mp3', sourceType:'audio/mpeg'}` |
| 9 | "one range per line" | `timeline.rangedActions {type:'mediaplayer', min:<the prompt's line count>}` |
| 9 | "`__on__seek*` actions" | `actions.named {prefix:'__on__seek__'}` (`navigate-operations.ts:190`) |
| 9 | "raf start timeline first" | `timeline {at:0, type:'animation'}` |
| 10 | "`extensions \"./host.ts\" { operation score(answer: string) }`" | `source.extensions {module:'./host.ts', operations:[{name:'score', params:'answer: string'}]}` |
| 10 | "`host.ts` exists" | `files.exist {paths:['host.ts']}` |
| 10 | "`on click … run`" | `interactions.listener {controller:'DOMEventListenerController', event:'click', runs:true}` |
| 10 | "result shown by a covering range" | `timeline.rangeTouches {selector:'#result'}` |
| 10 | Behavioural, FR-027: "snapshot after 3.5 s (timeline-driven, not `wait`) → hidden" | `interactions.noWait {triggers:['#answer-a','#answer-b','#answer-c']}`. With the scenario's `wait 3500` → hidden (F3), the hide has to come from the timeline, because the click path contains no `wait` |
| 11 | "`as reveal` label and `seek reveal.start`" | `source.label {name:'reveal'}`; `source.labelSeek {label:'reveal', anchor:'start'}`; `interactions.seekTo {position:12}` |
| 11 | "Restart = reset-then-seek" | `replay.resetThenSeek {trigger:'#restart'}` |
| 12 | "same timelines (uris, durations), action names and operation sequence per action (order-insensitive on inserted `setOperationData`), same controllers" | `config.equivalent {fixture:'../fixtures/port-from-json/config.json'}` |
| 13 | "both fixed with `target`/`with`/save-restore" | `dataflow.callsPreserved`; `dataflow.selectedBeforeAddClass` |
| 13 | "`beats.min` unchanged" | `beats.min {n:'start'}` |
| 14 | "layout gained the ids" | `layout.gainedCssOnlyIds` |
| 14 | "`controllers.balanced`" | `controllers.balanced`; `check.codesAbsent {codes:['controller-imbalance']}` (kept from `gate.ts:477-479`) |
| 14 | FR-013, "For cases 13 and 14, n is the count of the start state" (not a §6.2 #14 item; §6.1 step 4, "so warnings cannot be silenced by deleting code") | `beats.min {n:'start'}` |

Every positive case (1–12) also gets the generic §6.1 step-4 assertions `storyboard.exists`, `storyboard.beatsCovered` and `beats.min {n:'storyboard'}`. Cases 13 and 14 both carry `beats.min {n:'start'}` (FR-013), so neither fix can pass by deleting the offending events. `fix-selectors.json` holds it, and `eval-cases.spec.ts`'s coverage table lists it for both cases, so a case file without it fails.

#### F3. Behavioural column → scenarios (the seven new cases)

- **4**: the scenario starts on the raf hub; `click "#start"` → `timeline: <the media timeline's name>`; then a `seek` to each caption's midpoint + `snapshot`, asserting that caption `visible: true` and the other four `visible: false`.
- **5**: a `seek` to 25 / 50 / 75 / 100 % of the duration → `#illustration-<n>` `visible: true` and `#heading` `text` the n-th heading.
- **7**: `seek 2` → `#sentence` `textPrefixOf: <the sentence>`; `seek 4` → `text: <the sentence>`; `seek 7` → `#counter` `text: "250"`.
- **9**: after `click "#start"`: a `seek` to line n's midpoint → `#line-<n>` `hasClass: 'active'`, the others `notHasClass: 'active'`; `click "#line-3"` → `position: <line 3's start>`.
- **10**: `click "#answer-b"` → `#result` `visible: true` and `text: <the score("b") text>`; `wait 3500` + `snapshot` → `#result` `visible: false`. Step 3 fails on any error problem, so a `host-operation-returned-non-object` fails the case (FR-027).
- **11**: `seek 15`, `click "#restart"` → `domEquals: { freshAt: 0 }`; `click "#skip"` → `position: 12` and `domEquals: { linearAt: 12 }`.
- **12**: the scenario of the source project (F4), unchanged.
- "determinism clean": step 3 always runs `--determinism`, and any `position-nondeterministic` fails it.

#### F4. Fixtures

- `evals/mcp/fixtures/media/{intro.mp4,song.mp3}` (generated, committed).
- `evals/mcp/fixtures/port-from-json/source/`: the `chapters` starter's files (`starterFiles`, `packages/language/src/starters/starters.ts`) extended with one tour chapter, passing the strict gate; `config.json`: its compiled config. `eval-cases.spec.ts` recompiles `source/` with `compileFile` and asserts `configFragment` equality with `config.json` (drift); `mcp-solutions.spec.ts` runs the gate steps on `source/` with case 12's scenario.

#### F5. Solutions (FR-020, FR-021)

`packages/cli/src/__tests__/__fixtures__/mcp-solutions/<id>/` × 14: the entry, `layout.html`, the CSS, `STORYBOARD.md`, and the locales, host and library files the case needs; no media (FR-020). The solutions of cases 13 and 14 are their fixed start states. Each is written against its case's scenario and assertions.

### G. Knowledge (`packages/cli/scripts/generate-knowledge.ts`, `src/mcp/knowledge/curriculum`)

- **Generated chunks (FR-057)**, each an index entry of kind `reference` with a `see:` line:
  - `dom-events`: one line per `DOM_EVENTS` entry (`ReadonlyMap<string, string>`, `utils/dom-events.ts:9`) with the `on <event> "<sel>" …` form; `see: map-events-and-interactions`.
  - `key-names`: one line per `KEY_COMPLETIONS` entry (`ReadonlyMap<string, string>`, `utils/key-names.ts:83`) with the `on key "<keys>" …` form; `see: map-events-and-interactions, map-controllers`.
  - `html-elements`: per `HTML_ELEMENT_NAMES` element, the names of `getElementAttributes(tag)` that are not in `COMMON_HTML_ATTRIBUTES` (listed once at the top); names only, no enum values, to stay under 1,500 words (889 attribute entries in the generated file; Risks); `see: layout-html`.
  - Index growth: three cards (≤ 120 words each) against Phase 2's ~3,000 chars of headroom (FR-077). Operations are not in the no-argument index (`tools/docs.ts:116-117`, `TITLE_ONLY`), so the operation overlays do not grow it.
- **Operation overlays (FR-055)**: 66 new files in the Phase 2 FR-073 format (frontmatter `operation:`; a card ≤ 120 words; a body with an Eligian call example as a literate probe, idioms, pitfalls). The probe snapshots come from the existing literate-probe pipeline.
- **Diagnostics overlays (FR-056)**: the 125 codes of `missing-overlays.json` plus `position-nondeterministic`; `scenario-media-timeline.md` deleted (P11); `missing-overlays.json` → `[]`.
- **`verification-ladder.md` (FR-052)**: the `--determinism` / `determinism:true` step after scenarios, and the clock's limits (positions only, no decoding, no autoplay policy).
- **`LottieController.md` + README (FR-065, D-L3)**: the two limits; status `constrained`; the overlay's probe uses `loadJson("./anim.json")` before `addController`, the form that works under `--bundle` once D-L2 is fixed (the Phase 2 baseline shows the bare `url` form never works, D-L1).

### H. D-L2 (FR-065, P12) — `bundler/asset-collector.ts`

- `mapConfigAssetRefs(config, map)` (`:294`) also maps, in every `initActions` / `actions` / `eventActions` / `timelines[].timelineActions` start and end list, the string `operationData.url` of each `loadJson` operation that is local and relative (P12). The collection pass (the callback use at `:300-343`), `rewriteConfigAssetRefs(config, manifest, basePath)` (`:351`) and `collectAssets(config, cssFiles, basePath, options)` (`:507`) then copy, record and rewrite it with no further change.
- `dev` builds through the same bundler into its output dir and serves that dir (`dev-server.ts:190-206`), so the copied file is served without a change to `dev-server.ts`.

## Data and generation design

| Artifact | Input | Generator | Output | Drift / check |
| --- | --- | --- | --- | --- |
| media fixtures | constants in the script | `evals/mcp/generate-media.ts` (tsx; `--out <dir>`, default `evals/mcp/fixtures/media`) | `intro.mp4` (30 s), `song.mp3` (20 s), each < 500 KB | `eval-cases.spec.ts`: generated into a temp dir and byte-compared with the committed files; sizes; durations by a parser in the spec that shares no constant (mp4 `mvhd` duration ÷ timescale; mp3 frame headers × 1152 ÷ sample rate) (SC-008) |
| config baseline | the FR-043 corpus | `config-baseline.ts --write` (G0) | `packages/language/src/compiler/__tests__/__fixtures__/configs-before/**.json`, `skipped.txt` | `origin.spec.ts` (SC-011(3)) |
| smoke baseline | `smoke:examples` corpus + non-media `__fixtures__/mcp/{smoke,scenario}` (P16) | `packages/cli/scripts/capture-smoke-baseline.ts --write` (G0) / `--diff` (G2, G9) | `specs/058-mcp-server/phase-3-evals-provenance/baseline/smoke-before/<rel>.json` | the diff, quoted in `compliance.md` (SC-009(4)) |
| knowledge | registry, `DOM_EVENTS`, `KEY_COMPLETIONS`, HTML metadata, curriculum | `generate-knowledge.ts` (every build) | `dist/docs/generated/{dom-events,key-names,html-elements}.md`, `index.json`, `overlays.json` | `mcp-knowledge.spec.ts` (determinism, word limits, probes), `mcp-docs.spec.ts` (index ≤ 12,000) |
| port-from-json fixture | `source/` | `node packages/cli/bin/cli.js compile source/main.eligian -o config.json` (once, G5) | `evals/mcp/fixtures/port-from-json/config.json` | `eval-cases.spec.ts` `configFragment` equality |
| budgets | the first full run's records | `pnpm evals:mcp --write-budgets <run-id>` (user, G10) | `budget` in each case file | `eval-cases.spec.ts` well-formedness |

**The media generator**:
- mp3: MPEG-1 Layer III, 44,100 Hz, 32 kbps, mono, no CRC (header `FF FB 10 C4`); frame size ⌊144 × 32000 / 44100⌋ = 104 bytes, zero payload after the header and side info (silence, `main_data_begin` 0); 20 s = ⌈20 × 44100 / 1152⌉ = 766 frames ≈ 80 KB; no ID3 tag.
- mp4: `ftyp` (`isom`, compatible `isom iso2 avc1 mp41`); `moov` { `mvhd` (timescale 1000, duration 30000), `trak` { `tkhd` (16×16), `mdia` { `mdhd` (timescale 1000, duration 30000), `hdlr` (`vide`), `minf` { `vmhd`, `dinf`/`dref`, `stbl` { `stsd` → `avc1` (16×16) with `avcC` (SPS / PPS constants), `stts` (1 sample, delta 30000), `stsc`, `stsz`, `stco` } } } } }; `mdat` holding one IDR frame of a 16×16 black H.264 baseline stream (a byte constant in the script). Every creation / modification time is 0; the bytes are assembled deterministically. Playback in a browser through `eligian dev` is SC-008's manual check, recorded in `compliance.md`.

## Test plan

CLI specs are in `packages/cli/src/__tests__/`, language specs in `packages/language/src/**/__tests__/`. "Fresh build" = `requireFreshBundle()` (`fresh-bundle.ts:44`), which fails rather than skips.

| FR / SC | Spec | describe / it | Strategy |
| --- | --- | --- | --- |
| FR-040–FR-043, SC-011 | `language/src/compiler/__tests__/origin.spec.ts` (new) | `origin` › `every operation of every example and compiler fixture has an origin` (SC-011(1)'s solutions half is in `mcp-solutions.spec.ts`, G5); `origin ${value} occurs` (one per `OPERATION_ORIGINS` value); `lifecycle re-tags only source operations`; `config baseline` › `${file} compiles to the committed config` (one per baseline file) | `compileWithMap` per file; every `map.actions[*].start/end[*].origin` defined; fixtures `__fixtures__/origins/*.eligian` (one program per origin, incl. a runtime concatenation, a saved result, a library helper); string equality with the baseline |
| FR-042, P5 | `eligian-map.spec.ts` (extended) | `the map carries origins and timeline names` | `compileFile` on a raf + video fixture |
| FR-060, SC-015(2) | `language/src/compiler/__tests__/services.spec.ts` (new) | `resetServices` › `the next getOrCreateServices is a fresh, seeded set` | instance identity; a seeded CSS class is registered |
| FR-061, SC-015(1),(2),(6),(7) | `mcp-compiler-lock.spec.ts` (extended) | `recycling` › `onRecycle after sections 3 and 6, never during one`; `the release and the reset are both proven`; `an interrupt during the recycle does not stop it`; `a queued call interrupted before acquire does not count`; `two builds of one lock layer count independently` (P20, C3) | `makeCompilerLock(hooks, { recycleAfter: 3 })`, `onRecycle` an `async` recorder (C3's `=> Promise<void>`); `onAcquire` / `onRelease` times vs `onRecycle`; `LangiumDocuments` captured from `@eligian/language` before; `Fiber.interrupt` while `onRecycle` is held |
| FR-062, SC-015(3)–(5) | `mcp-staleness.spec.ts`, `mcp-concurrency.spec.ts` (extended) | `with a recycle between the edit and the re-check` (× 4); `results are equal across a recycle`, with one call each of `eligian_check`, `eligian_compile` (`select` + `includeMap: true`) and `eligian_project`, each made immediately before and immediately after the recycle (FR-062: all three tools); `two concurrent calls straddling the recycle equal their sequential baselines` | in-process server with `compilerLockLayer({}, { recycleAfter: 2 })`; deep equality ignoring `header` and ids (`withoutIds`, `config-fragment.ts:21`) |
| FR-063, SC-016 | `mcp-soak.spec.ts` (new, `cli-soak`) | `200 checks stay under 25 MB and recycle twice`; the `gc` guard | `startInMemoryServer(options)` (`mcp-test-client.ts:123`), `gc()`, `process.memoryUsage().heapUsed` |
| FR-030–FR-033, SC-009 | `smoke-determinism.spec.ts` (new) | (1) `a class nothing removes → one problem at the range, exit 1`, asserting the element, `classes`, class `in`, `expected` = the linear value and `actual` = `{ fresh, end-back }` (all three values, B2), and a message that names every differing path; (2) `an inverse end block → none, exit 0`; (3) `an addClass in a click handler does not flag`; (5) `ndjson: the problem before summary`; (7) `two classes → two problems`; (8) `three engines per non-first timeline; an element outside the container is compared`; `wait(300) in a start block reports nothing` (P8); FR-033: `--determinism --timeline <name>` reports only that timeline's problems and creates engines only for it (counted as in (8)), on a two-timeline fixture with a violation in each; `--determinism --scenario` runs both; `--determinism --strict` exits 1 on the problem; `every format reports it`: `pretty`, `github`, `json` and `ndjson`, each spawned, each output naming `position-nondeterministic` | in-process `smokeConfig(config, map, { determinism: true, … })` over `compileFile` of `__fixtures__/mcp/determinism/*`; (1),(2),(5) also spawn `bin/cli.js smoke --determinism` (fresh build); (8) counts through a wrapping `createEngine` |
| FR-033, FR-037, SC-009(4) | `smoke.spec.ts`, `mcp-scenario.spec.ts` (only the named lines) | `a media timeline is walked` (replaces `smoke.spec.ts:161-168`); `a scenario navigates to a media timeline` (replaces `mcp-scenario.spec.ts:318-336`) | the FR-033 diff empty, quoted |
| FR-034, SC-009(6) | `mcp-smoke.spec.ts` (extended, `cli-timed`) | `determinism:true reaches the child` | the tool with and without `determinism` on fixture (1) |
| FR-035–FR-038, SC-010 | `smoke-media.spec.ts` (new) | (1) `video and audio timelines are walked`; (2) `seek 12 lands within tolerance, caption visible`; (3) `play, wait 500, pause advances`; (4) `walks with the media file absent`; `installMediaClock` › `canPlayType`, `load → canplay`, `currentTime → seeking, seeked`, restore | in-process `smokeConfig`; unit tests on `smokeWindow()` |
| FR-015, SC-020 | `mcp-scenario.spec.ts` (extended) | `textPrefixOf` › proper prefix / full string / empty / non-prefix; `domEquals` › `freshAt passes after a resetting restart`, `fails on a leftover class naming element and property`, `linearAt passes / fails`; `parseScenario rejects domEquals with a selector and textPrefixOf without one` | fixtures under `__fixtures__/mcp/scenario/` |
| FR-045–FR-047, SC-012 | `mcp-compile.spec.ts` (extended) | `explain` › US3-1 `target` origins and rule docs; US3-2 the `call` pair; `rules list exactly the present origins`; `summary counts sum to the operation count`; `full lists every operation by path, within maxResultSizeChars`; `a program with errors has no explain`; `concise ⊆ detailed` | in-process server; each `docs` id resolved through `eligian_docs({ ids })` |
| FR-046 | `mcp-knowledge.spec.ts` | `ORIGIN_RULES covers OPERATION_ORIGINS; docs ids exist; rules ≤ 300 chars` | the generated `index.json` |
| FR-007, SC-012(3) | `mcp-telemetry.spec.ts` (extended) | `explain is in args`; `check codes are in result`; `50 codes → ≤ 1000 chars, truncated: true` | `telemetryText` unit; an in-process check |
| FR-050, FR-051, FR-052, SC-013 | `mcp-instructions.spec.ts`, `mcp-init.spec.ts`, `agents.spec.ts`, `mcp-knowledge.spec.ts` | `INSTRUCTIONS[3] ≤ 4096, the compile line verbatim, backticked tokens exist`; `next steps contain explain:true`; `the block is ≤ 8192 bytes and names explain`; `verification-ladder names --determinism and determinism:true, and the clock's three limits` (positions only, no decoding, no autoplay policy, each asserted by its own phrase; FR-052) | string assertions |
| FR-055–FR-058, SC-005, SC-014 | `mcp-knowledge.spec.ts`, `mcp-docs.spec.ts` | `every operation has an overlay`, which replaces `the 25 ranked operations have overlays` (`mcp-knowledge.spec.ts:1123-1152`; its listing equals the ranking selection, so 66 new files break it). The overlay file set must equal the registry names ∪ `{addController}` (P4). For **each** of those names, the per-overlay checks of `:1139-1151` run: frontmatter `operation: <name>`, card 1–120 words, at least one `eligian probe` fence in the body, and the card merged into `generated/operations/<name>.md` with at least one compiled fence. The selection-size assertions go, because the overlay set is no longer the ranking's selection. `no code lacks an overlay` (replaces `mcp-knowledge.spec.ts:703`); `overlay bodies and cards ≤ 120 words`; `the generated chunks name every DOM event / key / element`; `index ≤ 12000`; `two generator runs are byte-identical` | the generator into temp dirs |
| FR-065, SC-017 | `__tests__/bundler/*.spec.ts`, `dev-server.spec.ts`, `mcp-knowledge.spec.ts` | `--bundle copies loadJson urls and rewrites them`; `dev serves the loadJson file with 200`; `the LottieController overlay and the README state D-L3`; `SMOKE_CODES has no smoke-controller-unavailable` | `__fixtures__/lottie-probe/`; an HTTP GET on the dev port |
| FR-011–FR-013, SC-007 | `mcp-evals-assert.spec.ts` (new) | one `describe` per kind, `passes` / `fails` (`interactions.noWait`: a `wait` in an action the listener's action calls fails, a timeline range passes, a trigger with no listener fails; `source.labelSeek`: `seek reveal.start` passes, and an unused `as reveal` label with a literal `seek 12s` fails); `beatsCovered through a called action`; `rejects a different selector`; interaction rows (P18): `a run row matches its declared action`, `a navigate row with an at-position matches`, `a seek row matches by number and by label`, `a key row matches a KeyboardController listener`, `three rows with one listener fail and name the two unmatched rows`, `a row whose trigger has no listener in its timeline fails`; `beats.min excludes lifecycle`; `controllers.balanced agrees with controllerBalance on the Phase 2 regression fixture`; `config.equivalent ignores ids and setOperationData order, rejects a changed duration` | small configs and temp projects; SC-007(6) is a `grep` quoted in `compliance.md` |
| FR-001–FR-009, FR-023, SC-006(1)–(5) | `evals-harness.spec.ts` (new) | `parseHarnessArgs`; `caseVerdict` (2/3, 1/3, 1/2, pass–aborted–fail); `budgetFailures` (61 vs 60 for each arm; off; no budget); `medianBudget`; `computeMetrics` (US1-1, US1-4, the SC-003 fixtures incl. the CLI branch, an `eligian_docs` `query` whose hits return `operations-index` → `true`, and an `ids` request answered in `unknown` → `false`); `prepareArmProject` per arm, on a temp project with a fake installed `node_modules/eligian/dist/docs/` (A-none: afterwards there is no `AGENTS.md`, no `.mcp.json` and no `node_modules/eligian/dist/docs`; A0: `AGENTS.md`, no `.mcp.json`, docs kept; A1: both files, docs kept); `writeBudgets` over recorded records and temp case files (a case with a median gets `budget: { toolCalls, fromRun, model }` with the other keys in their order and a trailing newline; a case without a passing pinned-Sonnet A1 run is byte-identical; a second call gives the same bytes; the returned list names only the changed files); `RunRecordSchema` (a complete record decodes; removing any one key fails, iterated over every key of the fixture record; `usage: null` and `rubric: null` decode, and `metrics: null` does not); `the rubric score does not change the verdict`; `renderSummary` | recorded transcripts and logs under `__fixtures__/evals/` |
| FR-020–FR-022, SC-004 | `mcp-solutions.spec.ts` (new, `cli` project) | `${id} passes gate steps 1–5` (× 14, 120 s each); `a deleted beat fails storyboard.beatsCovered`; `case 4 without its media fails step 1 with media-file-missing`; `a range that adds a class nothing removes fails step 3 with position-nondeterministic` (a copy of the case-1 solution, with the end block of one beat deleted; SC-010(6) and the "determinism clean" item measured by a negative control, since a solution passing does not show that step 3 ran `--determinism`); `smokeStepArgs contains --determinism` (unit); SC-011(1): `every operation of every solution's step-4 map has an origin`, over the `StepsResult.map` of each solution, asserting the count of solutions is 14 (the case-file count) so that a glob or path mistake cannot pass on zero | fresh build; the solution copied to a temp dir, `materialiseFixtures`, `runGateSteps` with `cli = packages/cli/bin/cli.js` |
| FR-025–FR-029, SC-008 | `eval-cases.spec.ts` (extended) | `exactly the 14 ids`; per case: parses, pins its model, scenario accepted by `parseScenario`, known kinds, the F2 coverage table, a well-formed budget when present; `an incomplete copy fails coverage`; the media generator checks; the port-from-json drift | |
| FR-080, FR-083 | `package-bin.spec.ts` | `dist/evals/assert.mjs exists after a build and is not packed`; the packed list unchanged; `initialize` < 3 s; no static `jsdom` / `esbuild` / `effect/ai` / bare `eligius` import | the existing harness |

Manual and user-driven (G10): SC-001, SC-002, SC-003, SC-006(6), SC-019; the browser check of the two media files (SC-008), quoted in `compliance.md`.

## Build integration

### `packages/cli`

- `package.json`: script `"test:soak": "vitest run --project cli-soak"`; `files`, `exports` and the version (1.1.0) unchanged.
- `vitest.config.ts`: the `cli-soak` project (C3); `mcp-soak.spec.ts` excluded from `cli`.
- `esbuild.mjs`: `evalsCtx` (D5).
- `scripts/`: `capture-smoke-baseline.ts` (new), `measure-heap.ts` (`--calls`), `generate-knowledge.ts` (G).
- `README.md`: `smoke --determinism`, the media clock's limits, `eligian_compile`'s `explain`, D-L3.

### `packages/language`

- `src/mcp.ts` (A5: the HTML exports, `interactionActionName`, `PlaybackVerb`, `WalkedOperation`, `ActionBody`); `src/compiler/controller-balance.ts` (A5: `controller-added` gains `data`); `src/compiler/index.ts` (`resetServices`, `OPERATION_ORIGINS`, `OperationOrigin`). No `package.json` change (the `./mcp` export exists, `package.json:29-32`).

### Repo

- Root `package.json`: `"evals:mcp": "tsx evals/mcp/run.ts"`.
- `.github/workflows/ci.yml`: a step `Soak test` (`pnpm -C packages/cli run test:soak`) after `Build`; `timeout-minutes` (`:28`, 20 today) raised in the same change only if the measured job time comes within 3 minutes of it (FR-021), the new value quoted in `compliance.md`. No Windows job.
- Root `AGENTS.md`, Commands: `pnpm evals:mcp [--case <id>] [--arm A0|A1|A-none] [--runs n] [--model sonnet|opus] [--call-budget off|enforce] [--write-budgets <run-id>]` (local `claude -p` runs; results under `evals/mcp/results/`).
- `CHANGELOG.md` (Unreleased): `smoke --determinism`; media timelines smoked; `eligian_compile` `explain`; the eval harness; `--bundle` / `dev` carry `loadJson` files.
- `specs/058-mcp-server/evals.md` and the roadmap status line: G10 only.

### Gates (in order; each output quoted in `compliance.md`)

1. `pnpm typecheck` (with `origin` required).
2. `pnpm run ci` (0 errors, 0 warnings).
3. `pnpm test` (incl. `mcp-solutions.spec.ts`), then `pnpm -C packages/cli run test:soak`.
4. `pnpm effect:check` (both projects, 0 / 0 / 0).
5. `pnpm run test:coverage:ci` (CLI ≥ 77.1 / 77.6 / 64.5 / 76.6; language ≥ 79.8 / 80 / 69.9 / 79).
6. `pnpm run check:examples`, `pnpm run fmt:examples`, `pnpm run smoke:examples`.
7. The FR-033 diff (`capture-smoke-baseline.ts --diff`) empty.
8. Windows: `pnpm -C packages/cli build && pnpm -C packages/cli exec vitest run src/__tests__/mcp-solutions.spec.ts` ("14 passed" and the duration line).

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Concurrency on the Langium singleton during a recycle | a tool sees half-reset services | the recycle runs inside the one permit, uninterruptibly, after the section (C3); SC-015(1), (5), (6) |
| Two singletons under vitest (root vs `mcp` bundle) | the wrong set reset; tests that pass for the wrong reason | the reset and the document count both come from the root entry (P1); SC-015(2) checks the instance identity and the document count |
| Stale references to old services after a reset | memory not freed; stale CSS / label registries | no module keeps the services (A4, checked); the registries live inside the services; SC-015(4) and the soak ceiling |
| jsdom globals: one window, several engines (determinism, `domEquals`) | DOM or listener leakage between engines | sequential engines; `stop` + `destroy` + body reset + style removal around each; `domEquals` after the scenario engine is gone (P6); SC-009(2) and the `wait(300)` fixture as negative controls |
| Timing-dependent differences (async operations) | false `position-nondeterministic` | the quiescence wait (P8); a difference a longer settle removes is a harness bug (fixture) |
| Media clock events out of the order eligius expects | media timelines never init, or seeks hang | the order follows the eligius source lines (P7, B1); eligius' own `loadTimeout` and the runner's step timeout bound a hang; SC-010 |
| stdout pollution | protocol corruption | determinism and the clock run only in the smoke child (Phase 2 FR-041); `mcp-stdout.spec.ts` re-run unchanged; ndjson keeps its console redirect (Phase 2 P14) |
| Startup time | client time-outs | `origin` adds no import. `smoke-runner.ts` is in every command's static graph (P19), so `media-clock.ts`, `determinism.ts` and `touched-selectors.ts` have no module-scope side effects and no value import of `jsdom`, bare `eligius` or `jquery` (B1). The eval bundle is a separate file. `package-bin.spec.ts` checks for no static import and re-measures `initialize` < 3 s |
| Windows paths | broken fixtures on CI | relative POSIX paths in case files, joined with `path` at run time; argument-array spawns; the media files byte-compared on ubuntu (SC-008); the config baseline refuses repo-root strings (P15) |
| Language coverage (79.8 / 80 / 69.9) | CI fails | `origin.spec.ts` exercises every site (one fixture per origin); `services.spec.ts`; the G0 baseline; `test:coverage:ci` in G1's gate and the final gate |
| CLI coverage (77.1 / 77.6 / 64.5 / 76.6) | CI fails | the eval library, determinism and the clock are tested in-process (spawned children add no coverage); `mcp-solutions.spec.ts` only adds spawns |
| CI time (solutions + determinism) | the 20-minute job times out | the file's budget is ≤ 6 min (FR-021), measured; the job timeout is raised if within 3 min (FR-021) |
| The `html-elements` chunk exceeds 1,500 words | the knowledge spec fails | names only, common attributes once (G); if still over, the build stops `blocked` and the spec rules between a split and a cut (FR-057 fixes one chunk) |
| 192 hand-written overlays | review time; drift from behaviour | batches per task; every operation overlay has a literate probe (compiled, snapshotted); diagnostics overlays are ≤ 120 words and name the fix that the diagnostic's `data` carries |
| An origin value with no producible fixture | SC-011(2) fails | FR-041's removal path, recorded in `plan.md` and `compliance.md`; P3 already settles `lifecycle` |
| `effect/ai`'s result schema rejects `undefined` in the `explain` payload | JSON-RPC -32603 | the payload goes through the existing `asJson` (`compile.ts:113`) |

## Complexity tracking

None.

## Open questions

None for the build stage. The user-driven G10 tasks (first run, triage, budgets, second run, Opus record, `evals.md`) follow FR-070–FR-075 as written.

## Review notes

Plan review, round 1. Every issue was applied, and none was rejected or resolved by relaxing a threshold.
- The two findings on B7 / A5 (the missing `WalkedOperation` / `ActionBody` exports, raised under "effect-and-bundle" and "reuse-reality") describe one defect, and A5 fixes it once. The export is chosen over `Parameters<typeof walkOperations>`, so that B7's signature stays readable.
- The per-row interaction match reuses `walkOperations` with one added event field (A5). A second listener walker in the CLI would duplicate its call-following.
- For case 10's "not a `wait`", the narrow `interactions.noWait` kind was chosen over a scoped `operations.used {noneOf}`. `operations.used` ranges over every operation of the config (D1), and scoping it would change that kind's meaning for the other cases.
- For the three determinism values, `expected` + a structured `actual` was chosen over a new `SmokeProblem.values` field, because it needs no change to `McpDiagnosticSchema`, the formatters or the tool's output schema.
- For SC-010(6), both suggested measures are used: a behavioural negative control, and a unit check on `smokeStepArgs`.
