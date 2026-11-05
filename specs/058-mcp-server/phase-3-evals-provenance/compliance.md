# Phase 3 — Eval harness, behavioural checks, provenance, curriculum completion (phase-3-evals-provenance)

**Overall status: INCOMPLETE**

## Honest gap list (fail / partial)

FAIL
- SC-001: the second full run has not happened. 0 case files have a `"budget"`.
- SC-019: `specs/058-mcp-server/evals.md` does not exist.

RESOLVED IN THE MAIN LOOP (2026-11-05)
- FR-026 / SC-008: the generator writes 30 samples of 1 s over the one embedded frame (a single 30 s sample ended at once in Chrome). Regenerated `intro.mp4` (1146 bytes) plays in headless Chrome/157: currentTime 0.5, 2.02, 5.02, ended false (`baseline/media-browser-check.txt` §4). `eval-cases.spec.ts` + `mcp-solutions.spec.ts`: "Test Files 2 passed (2)", "Tests 123 passed | 14 skipped (137)". SC-008's cross-OS byte identity runs in the PR's CI (ubuntu).

PARTIAL (user-driven, FR-074, T067/T068/T070/T072 unchecked)
- FR-059, FR-070, FR-071, FR-072, FR-073, FR-075, SC-002, SC-003, SC-006 (part 6).
- SC-004, SC-016, SC-018: Windows evidence is green; the ubuntu-latest CI half is unverifiable (no CI run exists for this uncommitted work, and ci.yml triggers only on main).

## Compliance table

| ID | Verdict | Evidence |
|---|---|---|
| FR-001 | pass | harness.ts:58-116 parseHarnessArgs: repeatable --case (default all) and --arm (default ['A1']), --runs default 1, --model with sonnet/opus aliases. run.ts:504-514 runs serially. `pnpm evals:mcp --help` printed the usage naming --case, --arm A0\|A1\|A-none, --runs, --model; `--case nope` printed "no eval case 'nope' (known: audio-lyrics, ...)". |
| FR-002 | pass | package.json:27 `"evals:mcp": "tsx evals/mcp/run.ts"`. run.ts imports only node:*, 'effect' and ./gate.ts. gate.ts:24 loads packages/cli/dist/evals/assert.mjs by dynamic import. Nothing from packages/**/src. |
| FR-003 | pass | harness.ts:149-186 prepareArmProject: A1 writes .mcp.json (`node <cli> mcp` plus ELIGIAN_MCP_LOG) and AGENTS.md; A0 points mcpConfig at an empty `{mcpServers:{}}` in scratch; A-none removes node_modules/eligian/dist/docs. No-server allowedTools contain no mcp__eligian__. |
| FR-004 | pass | run.ts:320-336 spawns claude with -p, --mcp-config, --strict-mcp-config, --permission-mode acceptEdits, --allowedTools, --output-format json, --model. record.model set at run.ts:398. |
| FR-005 | pass | run.ts:294/:412 write results/<run-id>/<case>/<arm>-<n>.json; summary.md rewritten after every run. RunRecord (harness.ts:354-386) carries pass, failures, toolSequence, metrics, usage, wallMs, assertions, model, cliVersion, rubric; RunRecordSchema decodes every record (run.ts:411). |
| FR-006 | pass | harness.ts:280-288 caseVerdict uses strict majority of non-aborted runs; armSection (:303-337) reports cases passed of 14 and means over all and passing runs. evals-harness.spec cases passed (65 files passed). |
| FR-007 | pass | transcript.ts:254-270 I-11 reference point; operationsBeforeFirstUnknown, hitUnknown, explainCalled, fmtCalled. check.ts summarizeResult codes summary; compile.ts:157 records explain; telemetryText cuts to MAX_LINE_CHARS=1000 and marks `truncated:true`. |
| FR-008 | pass | gate.ts:174 `let callBudget: CallBudget = 'enforce';`, :138 `options.callBudget ?? 'enforce'`, :163 USAGE "enforce (default) or off". Verbose vitest: "without --call-budget the tool-call check applies, as under enforce 3021ms" and "the usage names enforce as the default 370ms" (Test Files 3 passed (3), Tests 71 passed (71)). |
| FR-009 | pass | rubric.md frontmatter `judge-model: claude-opus-5-5`; run.ts:198-262 judge, A0/A1 only, never for aborted runs; pass computed without the rubric (:401). 'the rubric score does not change the verdict' (evals-harness.spec.ts:410) passed. |
| FR-010 | pass | assert.ts compares by name and uri; config.equivalent uses configFragment (ids stripped); actions looked up by name; no evaluator reads action ids. |
| FR-011 | pass | assert.ts:52-94 ASSERTION_KINDS includes all required kinds; parseAssertions (:216) rejects unknown kinds and excess keys. gate.ts is now 217 lines; baseline/sc-007-6.txt grep empty. |
| FR-012 | pass | gate-steps.ts:207-209 readStoryboard; assert.ts:592-609 beatProblem requires a ranged action covering [start,end] within POSITION_TOLERANCE_S touching the selector; interaction rows map via interactionActionName (:629-677). |
| FR-013 | pass | assert.ts:1324-1341 beats.min counts ranged timeline actions (lifecycle and unranged excluded); n may be number, 'storyboard' or 'start'. |
| FR-014 | pass | gate-steps.ts:117-231 runs check, fmt --check, smoke --strict --determinism, compile --eligian-map + assertions, scenario problems; gate.ts:127-138 adds step 6 budget. |
| FR-015 | pass | scenario.ts:38 textPrefixOf, :53-56 domEquals {freshAt}\|{linearAt}; :191-192 rejects domEquals with a selector; smoke-runner.ts:332-350 reference engines only when a domEquals exists. |
| FR-020 | pass | `mcp-solutions/` has 14 directories, one per case id; media not duplicated (case files list fixtures ../fixtures/media/...). |
| FR-021 | pass | mcp-solutions.spec.ts:52-57 materialiseFixtures + runGateSteps, 120_000 ms per test; requireFreshBundle throws rather than skips. `pnpm test` gave cli+cli-timed 65 files passed. baseline/ci-timeout.txt records 110.91 s locally, ci.yml timeout unchanged. |
| FR-022 | pass | runGateSteps and materialiseFixtures shared by gate.ts (through dist/evals/assert.mjs), run.ts and mcp-solutions.spec.ts. Nothing re-implemented. |
| FR-023 | pass | harness.ts:233-244 medianBudget (A1, pass, non-aborted, claude-sonnet-5-5, lower median); writeBudgets; run.ts:466-479 --write-budgets. No case has a budget yet (budget=null for all 14). |
| FR-025 | pass | evals/mcp/cases/{video-subtitles,scrollytelling,typewriter-counter,audio-lyrics,host-module,replay-safe,port-from-json}.json exist with id, prompt, entry, model 'claude-sonnet-5-5', scenario, assertions, fixtures. |
| FR-026 | pass | Ruling 2026-11-05 (spec FR-026): 30 samples of 1 s over the one embedded frame. `evals/mcp/generate-media.ts` imports only node:* modules; regenerated media: intro.mp4 1146 bytes, song.mp3 79664 bytes. Headless Chrome/157 (baseline/media-browser-check.txt §4): after.mp4 "samples [0.5, 2.02, 5.02], ended false, paused false"; before (one sample) "samples [30, 30, 30], ended true". song.mp3 plays (§2: "@2.29 playing", "@5.29 playing", "@8.79 playing"). eval-cases.spec.ts structure + reproduction tests pass. |
| FR-027 | pass | `--strict` fails step 3 on non-scenario smoke problems (gate-steps.ts:168-174), so host-operation-returned-non-object fails case 10. host-module.json asserts timeline.rangeTouches #result and interactions.noWait. |
| FR-028 | pass | fixtures/port-from-json/{config.json,source}; config.equivalent via configFragment; 'the port-from-json source passes the gate steps with its scenario' passed. |
| FR-029 | pass | eval-cases.spec.ts:461-545 checks all 14 cases (parse, model pin, scenario, known kinds, F2 coverage, budget well-formed); passed. |
| FR-030 | pass | determinism.ts:241-249 pathStates for linear, fresh, end-back each on a new engine; jump paths in descending order per T015 ruling; media timelines not filtered. smoke-determinism.spec passed. |
| FR-031 | pass | determinism.ts:272-275 `// FR-031: the range, otherwise the timeline's declaration`. Tests: "no range selects the element by id → located at the timeline (FR-031 fallback) 984ms" and "the CLI > locates a difference no range selects by id at the timeline (FR-031 fallback) 2161ms". |
| FR-032 | pass | determinism.ts:250-265 keys by (element, class\|property); message prints 'recurs at N more boundaries'. |
| FR-033 | pass | checkDeterminism takes `options.report` (determinism.ts:233-243), called per timeline (:268-284). Test: "a timeline's problems are reported before the next timeline's engines are built (FR-033) 1930ms". |
| FR-034 | pass | tools/smoke.ts:101 `determinism: Schema.optionalKey(Schema.Boolean)`, :415 passes --determinism; description ≤ 16384 (mcp-smoke.spec.ts:405). |
| FR-035 | pass | media-clock.ts:122-192 overrides HTMLMediaElement.prototype members (duration, currentTime, readyState, seekable, paused, play, pause, load, events). |
| FR-036 | pass | media-clock.ts:45-54 mediaDurations; position changes only via currentTime setter or real time between play() and pause(). |
| FR-037 | pass | smoke-runner.ts:181-183 walks every timeline including media; scenario-media-timeline removed from SMOKE_CODES; its overlay deleted. |
| FR-038 | pass | media-clock.ts reads no file; type-only imports; package-bin.spec 'no static import of jsdom, esbuild, effect/ai or the eligius engine' passed. |
| FR-040 | pass | operation-origin.ts:7-24 lists the 16 §4 values; eligius-ir.ts:201 `readonly origin: OperationOrigin` (required); `pnpm typecheck` clean. |
| FR-041 | pass | Producers exist for every value; origin.spec.ts passed 'origin <v> occurs' for all 16 and 'every operation of every example and compiler fixture has an origin'. |
| FR-042 | pass | eligius-ir.ts:82 SourceMap.origins; eligian-map.ts:32/:67 fill origin; 'every operation of every solution's step-4 map has an origin' passed. |
| FR-043 | pass | config-baseline.ts normaliseIds/compileForBaseline; capture predates operation-origin.ts; 6 written, 33 skipped; 'config baseline › <file> compiles to the committed config' passed for all 6. |
| FR-044 | pass | `test:coverage:ci` (language) exit 0: 'Test Files 257 passed \| 1 skipped', 'All files \| 91.31 \| 82.86 \| 93.87 \| 92.58'; thresholds 79.8/80/69.9. effect:check language: "Checked 259 files ... 0 errors, 0 warnings and 0 messages." |
| FR-045 | pass | tools/compile.ts:80 explain?: boolean; explainOf returns {path, action, systemName, origin, location} and rules; summary view returns counts per origin. |
| FR-046 | pass | origin-rules.ts:14 ORIGIN_RULES; drift test mcp-knowledge.spec.ts:1274-1285 passed. |
| FR-047 | pass | compile.ts:157 summarizeArgs records explain; errors path returns no explain (:512-517); mcp-compile.spec.ts passed. |
| FR-050 | pass | instructions.ts:14 `MCP_PHASE = 3`; INSTRUCTIONS[3] contains "`eligian_compile`: once after your first timeline passes check (select it, explain:true), and whenever behaviour surprises you."; ≤ 4096 passed. |
| FR-051 | pass | tools/init.ts:97 'After the first timeline passes check, call eligian_compile(select, explain:true).'; agents-block.md 7438 bytes (≤ 8192). |
| FR-052 | pass | verification-ladder.md:16 order 'smoke with scenarios → determinism → `dev`'; :72-74 determinism section; :70 clock limits; pinned by mcp-knowledge.spec.ts:1292-1299. |
| FR-055 | pass | 80 operation overlays; mcp-knowledge.spec.ts:1188-1205 set equals getAllOperations() plus addController; passed. |
| FR-056 | pass | missing-overlays.json is `[]`; curriculum/diagnostics has 187 files; 'no code lacks an overlay' passed. |
| FR-057 | pass | generate-knowledge.ts:781-856 domEventsChunk, keyNamesChunk, htmlElementsChunk (kind 'reference', see: lines); dist/docs/generated/ has dom-events.md, key-names.md, html-elements.md. |
| FR-058 | pass | 'Test Files 65 passed \| 1 skipped (66) / Tests 1296 passed \| 32 skipped'; mcp-docs index ≤ 12000 chars. |
| **FR-059** | **PARTIAL** | Open (user-driven, FR-074). tasks.md:464 T068 unchecked. `ls specs/058-mcp-server/evals.md` → "No such file or directory". No triage edits to trace. |
| FR-060 | pass | `resetServices()` in compiler/pipeline/services.ts, exported at compiler/index.ts:97; services.spec.ts passed. |
| FR-061 | pass | compiler-lock.ts recycleAfter default 100, recycle in the uninterruptible section; 'onRecycle after sections 3 and 6', 'the release and the reset are both proven', 'an interrupt during the recycle does not stop it' passed. |
| FR-062 | pass | mcp-concurrency.spec.ts:437 and :471; mcp-staleness.spec.ts:280-282 recycle variants passed. |
| FR-063 | pass | cli-soak project with --expose-gc; `pnpm run test:soak`: 'Tests 1 passed (1)', EXIT=0; ci.yml has the Soak step; measure-heap: 'recycles: 2 (after sections 100, 200)'. |
| FR-065 | pass | LottieController.md:4 "a local relative url such as ./anim.json travels with --bundle and dev"; :47-50 Pitfalls updated; D-L3 still stated at :51-55. Tests: "the LottieController overlay states the shipped D-L2 behaviour (--bundle and dev carry the JSON)" and "the LottieController overlay and the README state D-L3". |
| FR-070 | PARTIAL | Open (user-driven). T067 unchecked (tasks.md:463). 16 result dirs, latest record 14-35-51-863Z/three-chapters.json has "head": "a7bceb8..." and "model": "claude-opus-5-5". Not the required 14-case × A0/A1 × 3 Sonnet run with --call-budget off; no A-none run. |
| FR-071 | PARTIAL | Open (user-driven). T068 unchecked (tasks.md:464). No first full run to triage; evals.md does not exist. |
| FR-072 | PARTIAL | Open (user-driven). T070 unchecked (tasks.md:466). `grep -l '"budget"' evals/mcp/cases/*.json \| wc -l` gives 0. Harness support exists (default enforce, gate.ts:174). |
| FR-073 | PARTIAL | Open (user-driven). T072 unchecked (tasks.md:468). evals.md: "No such file or directory". |
| FR-074 | pass | tasks.md:461-468 Group 21 holds T067–T072 as the last, separate, unchecked tasks; no evals.md, results run or written budget, so the build stage ran no agent runs. |
| FR-075 | PARTIAL | Open. Conditional on the second full run (T070, unchecked); nothing recorded, evals.md does not exist. |
| FR-080 | pass | package.json files unchanged (['bin/cli.js','dist/cli.mjs','dist/docs/**']). '✓ mcp answers initialize in under 3 s 592ms', 'no static import of jsdom, esbuild, effect/ai or the eligius engine', 'dist/evals/assert.mjs exists after a build and is not packed', 'Tests 14 passed'. Note: the initialize test failed once at 3539 ms in a first sequential `pnpm test` (load-sensitive flake); two reruns passed. |
| FR-081 | pass | README documents --determinism, clock limits, eligian_compile explain; AGENTS.md:50 names `pnpm evals:mcp`; CHANGELOG entries added. |
| FR-082 | pass | `pnpm typecheck` EXIT=0 (`$ tsc -b tsconfig.build.json`). `pnpm run ci` EXIT=0: "Checked 859 files in 344ms. No fixes applied." `pnpm effect:check` EXIT=0: language and cli "0 errors, 0 warnings and 0 messages." (cli 316 files). `pnpm test:coverage:ci` EXIT=0: language 91.31/82.86/93.87/92.58, cli 89.12/78.5/91.84/90.02 (thresholds met, vitest.config.ts unchanged); extension 63 files / 628 tests; cli-bin 14 passed. Examples: check:examples EXIT=0 (`8 files, 0 errors, 0 warnings`; demo `1 file, 0 errors, 5 warnings`), fmt:examples "All 12 files formatted", smoke:examples "9 files, 11 timelines played, 0 errors, 0 warnings". No banned imports (greps empty); no edits under generated/ (porcelain grep empty); no stdout writes outside protocol frames in packages/cli/src/mcp (only stdio.ts:44-56 redirect). |
| FR-083 | pass | esbuild.mjs adds evalsCtx (src/mcp/evals/assert.ts → dist/evals/assert.mjs); `files` unchanged; main.ts has no 'evals' reference; no dependency added (diff adds only scripts `test:soak`, `evals:mcp`). |
| **SC-001** | **FAIL** | Second full run has not happened. evals.md: "No such file or directory"; 0 case files have a "budget". No A1 pass count. Open, user-driven (FR-074). |
| SC-002 | PARTIAL | Unit half: evals-transcript.spec.ts green ("packages/cli test: Tests 1302 passed \| 32 skipped (1334)"). Exit half open: no second-run A0 vs A1 measurements, no evals.md. |
| SC-003 | PARTIAL | Unit fixtures pass in the green cli suite (TEST_EXIT=0). The ≥90% value over 42 A1 runs is unmeasured (T070 unchecked). |
| SC-004 | PARTIAL | Windows: `pnpm test` TEST_EXIT=0, cli "Tests 1302 passed \| 32 skipped (1334)"; baseline/solutions-windows-final.txt holds the dedicated run. ubuntu-latest half unverifiable here (no CI run for uncommitted work; ci.yml triggers only on main). |
| SC-005 | pass | missing-overlays.json `[]`; '✓ every operation has an overlay', '✓ no code lacks an overlay', '✓ new codes have overlays', '✓ overlay bodies and cards ≤ 120 words', '✓ cards ≤ 120 words'. |
| SC-006 | PARTIAL | Parts (1)–(5) covered by evals-harness.spec.ts and evals-gate-steps.spec.ts, green. Part (6), manual `pnpm evals:mcp --case fix-dataflow --arm A0 --runs 1`, belongs to T067 (unchecked); no results dir holds a fix-dataflow A0 record. |
| SC-007 | pass | mcp-evals-assert.spec.ts: every kind has a passing and failing test (storyboard.beatsCovered, beats.min, controllers.balanced, config.equivalent among them). `grep -n "function controllerBalance\|function walk\|function check[A-Z]" evals/mcp/gate.ts` → no output, exit=1. |
| SC-008 | partial | Windows: eval-cases.spec.ts passes (14 ids, per-case parse / model / scenario / kinds / coverage, media sizes and durations, structure "30 samples of 1 s", the generator reproduces the committed bytes). Manual browser check passes after the FR-026 ruling (baseline/media-browser-check.txt §4). Open: the cross-OS byte identity on ubuntu-latest (the PR's CI). |
| SC-009 | pass | smoke-determinism.spec.ts: "a class nothing removes → one problem at the range", "an inverse end block → none", "two classes → two problems", "three engines per non-first timeline", CLI exit 1/0 cases, ndjson, every format. mcp-smoke: "determinism:true reaches the child". smoke.spec: "pretty and github outputs are byte-identical to the baseline". `capture-smoke-baseline.ts --diff` → 24 `same`, 4 `new`, "28 files, 0 differ", exit=0. Batch 2: Test Files 19 passed \| 1 skipped (20). |
| SC-010 | pass | smoke-media.spec.ts: video and audio timelines walked, seek 12 within tolerance, play/wait/pause advances, media file absent. `smoke:examples` "9 files, 11 timelines played, 0 errors, 0 warnings". mcp-solutions: "video-subtitles passes gate steps 1–5 13553ms", "audio-lyrics passes gate steps 1–5 11163ms". |
| SC-011 | pass | origin.spec.ts + config-baseline.spec.ts: "Test Files 2 passed (2) / Tests 30 passed (30)", all 16 origins occur, 6 baseline assertions pass (corpus = 6 compiling files; rest in skipped.txt). Probe snapshots match; `pnpm typecheck` exit=0. |
| SC-012 | pass | mcp-compile.spec.ts explain tests (US3-1, US3-2, rules, summary counts, full within maxResultSizeChars, errors → no explain); mcp-telemetry: "explain is in args", "50 codes → ≤ 1000 chars, truncated: true"; origin-rules drift test. |
| SC-013 | pass | INSTRUCTIONS[3] ≤ 4096; init next steps contain explain:true; agents-block.md 7438 bytes, `grep -c explain` → 1; verification ladder test passed. |
| SC-014 | pass | generated dom-events/key-names/html-elements tests; index ≤ 12000 chars; "two runs are byte-identical 88ms". |
| SC-015 | pass | mcp-compiler-lock, mcp-concurrency, mcp-staleness recycle tests all passed (batch 2 exit=0). |
| SC-016 | PARTIAL | Windows evidence in baseline/soak-windows-final.txt and measure-heap-200.txt; CI step exists. ubuntu CI "1 passed" unverifiable (no CI run; ci.yml only on main). |
| SC-017 | pass | LottieController.md:4 and :47-50 state shipped D-L2 behaviour; pinned by test; status `constrained`. baseline/lottie.txt: compile --bundle WORKS, dev WORKS, smoke STILL FAILS as D-L3 documents. |
| SC-018 | PARTIAL | Windows: `pnpm typecheck` TC_EXIT=0; `pnpm run ci` "Checked 859 files in 237ms. No fixes applied."; `pnpm test` TEST_EXIT=0 (shared-utils 105, language 3428 \| 23 skipped, extension 628, cli 1302 \| 32 skipped, cli-bin 14). Linux PR CI half unverifiable. |
| **SC-019** | **FAIL** | `ls specs/058-mcp-server/evals.md` → "ls: cannot access ...: No such file or directory". Open, user-driven (T067/T068/T070/T072 unchecked, tasks.md:463-468). |
| SC-020 | pass | mcp-scenario.spec.ts textPrefixOf and domEquals tests (pass and fail cases, parse rejections); typewriter-counter.scenario.json and replay-safe.scenario.json use them; "typewriter-counter passes gate steps 1–5 31623ms", "replay-safe passes gate steps 1–5 8997ms". |

## Implementation notes (deviations reported by task agents)

- T001-T006: baselines captured at HEAD b62b762. T006 used a summary section because `tail -40` missed the "All files" row. T005 inventory is 22 files (12 `map-*`, 10 `presentation-patterns-*`).
- T002: Biome run on touched files only, not repo-wide, to avoid rewriting parallel work. Baseline corpus is 6 compiling files; 33 skipped (libraries, parse errors, etc.).
- T003: `scenario/host-undefined` baseline stores an absolute Windows path; a checkout elsewhere would show a DIFF.
- T007: one extra file edited, `event-action-transformer.spec.ts` (already failing `typecheck:tests` before the change). `library-imports.ts` has no construction site.
- T010: `HTMLAttributeMetadata` exported from `./html/metadata-types.js`, not `html-elements.generated.js`.
- T013: `touchedSelectors` has a private selection walk because `walkOperations` emits no selectElement event.
- T014: tests pass `sourceDir` to `smokeConfig` in addition to `{ scenario }`.
- T015/T017/T018/T019 reported BLOCKED: plan P8's ascending stepping order made SC-009(1)/(7)/(8) unreachable (all three paths on one engine gave 0 problems). Option A (descending order for fresh/end-back, report at the latest boundary) is what the final code and spec comments reflect (determinism.ts:94-99). The final verification shows these specs passing.
- T016 BLOCKED on the Phase 2 media baseline test (smoke.spec.ts:222-237) disagreeing with FR-037's changed media output; spec.md:369 / tasks.md:479 record the ruling that only byte differences fail and new files print `new`. T020's `--diff` blocker (missing baselines for 4 new scenario fixtures) was resolved the same way (gate 9: "28 files, 0 differ").
- T041 BLOCKED on the `casesDir` mismatch (scenario/start under cases/, fixtures under evals/mcp). Case fixtures now use `../fixtures/...` and the solutions spec passes.
- T021: CLI does not create missing `-o` parent dirs; the test creates `out/` first.
- T022: Phase 2 test 'declares no explain parameter' renamed 'declares the explain parameter (Phase 3)'. Tests use `select: { timeline: 'Intro' }` (string), not tasks.md's numeric form.
- T025: measure-heap needs `tsx --expose-gc`; the literal command from the task cannot work. Soak readings need `--reporter=default`.
- T026: old assertions that the block has no `explain` were removed (contradict FR-051).
- T027: two existing `toEqual` tests got `interactionRows` added.
- T033: H.264 frame built as a single I_PCM macroblock; not decoded with a real decoder (no ffmpeg). Browser check later failed (see FR-026).
- T037: the video-subtitles progress bar must sit on a child (`#progress .progress-fill`) because ProgressbarController on an id'd element is flagged by `--determinism`. Risk: an agent putting the controller directly on `#progress` fails gate step 3. `source.blocks anyOf ['for','sequence']` is a weak assertion (word-boundary matches `stagger … for`).
- T040: fix-dataflow needed extra edits (inverse end blocks, `target "#title"`) to satisfy determinism after the planted errors were fixed.
- T048: found a compiler gap, `getElementDimensions("-20h")` rejected with `parameter_type` (no `dimensionsModifier` case in parameter-types.ts); overlay documents the workaround. getFormData probe selects `form`, absent from the shared probe layout.
- T059: new reference chunks held to 1,500 words (stricter than FR-035's 6,000).
- T063: with `loadJson("./anim.json")`, smoke fails at `loadJson` (Failed to parse URL) rather than on the attach as README/overlay describe; smoke still exits 1.
- T066: Linux halves of SC-004/SC-016/SC-018 need the PR CI run.
- T020 gate `pnpm check`/gates were later all green (T065: all ten gates exit 0).

## Remaining steps for the human loop

1. (done 2026-11-05) FR-026 / SC-008 ruled: 30-sample mp4, regenerated, browser check re-run (§4), T071 checked.
2. Run the user-driven Group 21 tasks: T067 (full 14 × A0/A1 × 3 Sonnet run, `--call-budget off`, plus A-none), T068 (triage), T070 (budgets + enforce second run), T072 (`specs/058-mcp-server/evals.md`), Opus record.
3. Verify the ubuntu-latest CI halves (SC-004, SC-016, SC-018) after pushing.
4. Review the diff and commit (the workflow never commits).
