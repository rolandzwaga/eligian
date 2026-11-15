# Feature Specification: MCP server, Phase 2: Inspect, smoke with scenarios, agent context, curriculum

**Feature**: spec 058 (Eligian MCP server), Phase 2 of `specs/058-mcp-server/roadmap.md` §7
**Branch**: `feat/mcp-server-roadmap`
**Created**: 2026-11-05
**Status**: Draft (specify stage; revised after the skeptics' review, see "Review notes"; clarifications resolved 2026-11-05)
**Input**: roadmap §7 "Phase 2 — Inspect, smoke with scenarios, agent context, curriculum (9 days)", the design in §2–§6 and the binding decisions in §8. Every claim about existing code below was checked on 2026-11-05 against the tree at `a7bceb8` (Phase 1 closed), with typegraph (`ts_module_exports`, `ts_navigate_to`, `ts_document_symbols`) or with a command whose result is quoted. Probes ran with the built CLI (`node packages/cli/bin/cli.js`) in the session scratchpad; they are not committed.

## Overview

Phase 1 shipped `eligian mcp` with five tools: `eligian_docs`, `eligian_operations`, `eligian_check`, `eligian_fmt` and `eligian_init`. Phase 2 adds the three tools that complete the tool surface of roadmap §4:

- **`eligian_project`** reports what a presentation contains and which names it may reference: files, CSS and layout names, locale keys, host declarations, an outline, asset problems and storyboard counts.
- **`eligian_compile`** shows what the source compiles to: a summary, a fragment keyed by names, or the full config, mapped back to source through the Eligian map. (`explain` is Phase 3.)
- **`eligian_smoke`** runs the CLI `smoke` in a child process. `smoke` gains **scenarios** (seek, click, key, navigate, wait and snapshot steps, plus assertions), a streaming `--format ndjson`, a code on every problem, and the `host-operation-returned-non-object` check.

Phase 2 also delivers:
- the six remaining **review checks**, in both `eligian check` and `eligian_check`;
- **agent context**: `agents.ts`, `eligian agents setup`, `eligian mcp --print-config`, `eligian init --client / --no-agents`, the Cursor and Copilot passive-context files, and merge semantics;
- the rest of the **curriculum**: the rest of parts B and C, all of part D, overlays for the 25 most-used operations and for the 9 controllers, and example markers in the tour;
- the **final instructions string**;
- the **staleness specs**;
- the three **verifications** that the roadmap assigns to this phase;
- eval cases 1, 2, 3, 6 and 8, passing with arm A1 in the one-case harness.

## Scope and non-goals

### In scope

Roadmap §7 Phase 2, quoted:

> Touches: `packages\cli\src\mcp\tools\{compile,project,smoke}.ts`, `packages\cli\src\agents.ts` (+ `agents` subcommand, `mcp --print-config`, merge semantics), `packages\cli\src\smoke\{smoke-command,smoke-runner,dom-environment,scenario}.ts` (`--scenario`, `--format ndjson`, `smokeFile` export, `host-operation-returned-non-object`), `packages\cli\src\check\review.ts` (remaining checks), `packages\cli\src\init.ts` (`--client`, `--no-agents`), curriculum B remainder (`map-program-and-config`, `map-erased-parameters`, `map-control-flow-and-data`, `map-event-actions`, `map-imports-and-assets`, `map-locales-and-languages`), C (`timing-models`, `runtime-quirks`, `runtime-state-pitfalls`), D (all), overlays for the 25 most-used operations and all 9 controllers, example markers in the tour, `packages\cli\src\__tests__\{mcp-compile,mcp-project,mcp-smoke,mcp-scenario,agents,mcp-staleness}.spec.ts`, Cursor/Copilot passive-context files, final instructions string.
>
> Verify: listener action names in raw `addController` arrays (validator or review check if unchecked); Lottie under `--bundle`/`dev`/`smoke` (add `lottie-web` to CLI deps or a warning); which clients read `AGENTS.md`.
>
> Exit: all 8 tools listed by the inspector; `eligian init --template chapters --client claude` yields a project Claude Code picks up; cases 1, 2, 3, 6, 8 pass with arm A1 in the one-case harness; the staleness specs (CSS/HTML/locales/library edits between calls) green.

The Phase 1 spec's non-goals list (`phase-1-mvp-server/spec.md`, "Non-goals … Phase 2") also hands these items to Phase 2:
- `response_format` on compile, project and smoke (§4);
- the `storyboard` section of `eligian_project` (§5 step 1);
- the `smoke` diagnostic source and the `timeline` / `time` / `step` fields of `McpDiagnostic` (Phase 1 FR-015);
- `generated/examples/<id>.md`, which needs the Phase 2 markers.

### Touched files

The roadmap list above, plus the sites found while verifying (marked †):
- `packages/cli/src/mcp/server.ts`†.
- `packages/cli/src/mcp/instructions.ts`†: `MCP_PHASE`, the Phase 2 string, the AGENTS.md block.
- `packages/cli/src/mcp/diagnostics.ts`†: the `smoke` source and the `timeline` / `time` / `step` fields.
- `packages/cli/src/mcp/tools/init.ts`†: the `client` input, and merging through `agents.ts`.
- `packages/cli/src/mcp/knowledge/render.ts`†: overlay statuses replace `CONTROLLER_STATUS`, and cards carry the overlay text.
- `packages/cli/src/main.ts`†: `agents setup`, `mcp --print-config`, `init --client / --no-agents`, and `smoke --format ndjson / --scenario / --timeline / --step-timeout-ms`.
- `packages/cli/scripts/generate-knowledge.ts`†: operation and controller overlays, probes in `presentation-patterns`, example markers.
- `packages/cli/scripts/rank-operations.ts`† and its committed output.
- `packages/cli/src/mcp/knowledge/curriculum/**`: the new chunks, plus overlays under `operations/`, `controllers/`, and `diagnostics/` (one for every new code).
- `examples/eligian-tour/*.eligian`: markers only.
- `packages/language/src/mcp.ts`† and `packages/language/src/__tests__/mcp-entry.spec.ts`†: the exports that the new tools need.
- `packages/language/src/validators/**` and `validators/codes.ts`†: the validator and code of FR-055 (Q3), with its spec and fixtures.
- `packages/language/src/starters/starters.ts`† (the `video` starter note) and root `AGENTS.md`† (`:47`): they state that the `video` starter carries exactly one `media-file-missing` warning (FR-051). No placeholder media bytes, no suppression mechanism.
- `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md`†: a `(probed: "<title>")` marker for every new runtime claim that the C chunks cite (SC-014).
- `packages/cli/src/__tests__/{init,smoke,review,mcp-server,mcp-instructions,mcp-knowledge,mcp-concurrency,mcp-stdout,mcp-runtime-claims,package-bin}.spec.ts`†.
- `evals/mcp/{gate.ts,cases/*}`†: cases 1, 2, 3, 6 and 8, with their scenarios.
- `.github/workflows/ci.yml`†: both inspector gates (`ci.yml:63-67` and `:128-129`) want five names today.
- `packages/cli/package.json`† is NOT touched for `lottie-web`: it is not added to the CLI dependencies (FR-056).
- `packages/cli/README.md` and `CHANGELOG.md`.
- `specs/058-mcp-server/roadmap.md`: the §2 `[UNVERIFIED]` marker that FR-057 settles, and the §7 Phase 3 Touches entry of FR-099.

### Non-goals (owned elsewhere; roadmap wording quoted)

- **Phase 3** (§7 Phase 3) owns:
  - "full harness, assertion DSL incl. scenario, `storyboard.beatsCovered`, `controllers.balanced`, metrics; reference solutions for cases 1–14";
  - "`smoke --determinism`; media clock stub (cases 4, 9 run instead of skipping)";
  - "provenance `origin` + `explain`; soak test";
  - Langium service recycling;
  - "all remaining operation and diagnostics overlays";
  - the A0 arm.

  Consequences for Phase 2:
  - `eligian_compile` has no `explain` input, and `eligian_smoke` has no `determinism` input.
  - Smoke still skips media timelines.
  - The gate's generic §6.1 step-4 assertions (`storyboard.*`, `beats.min`, and `controllers.balanced` as a library assertion) and the tool-call budget stay in Phase 3.
- **Phase 4** (§7 Phase 4) owns extension registration (`mcpServerDefinitionProviders`), `dev` error forwarding, the `eligian://docs/<id>` resources and the `new-presentation` prompt.
- **Phase 5** owns promoting review checks to DSL validators ("each its own mini-spec"), the MCP registry entry and a Claude Code plugin.
- **Separate specs** own the `custom` provider host contract and its warning (decision 10; `provider-choice.md`'s `custom` row "waits on that spec"), and open questions 11, 12, 14 and 15.
- **Never in this roadmap** (§1, and §4 "Deliberately NOT tools"): new DSL syntax, an HTTP transport, in-server editing, and `dev` or `--bundle` as tools.
- **Unassigned generated chunks**: §3.2 lists `generated/dom-events.md`, `generated/key-names.md` and `generated/html-elements.md`, but no phase's Touches list names them: Phase 1 left them out, and the Phase 2 Touches do not list them. `eligian_operations` already serves DOM events and key names from source (Phase 1 FR-021). Phase 2 does not build them. Roadmap §7 Phase 3 Touches does not name them either, so FR-099 adds them there: the §3.2 deliverable gets an owning phase, as Phase 1 did for service recycling (Phase 1 FR-053).

## Verification record (this session)

| Claim / question | Result | Evidence |
|---|---|---|
| `smokeFile` exists, but is not exported | confirmed | `ts_module_exports smoke-command.ts` lists `isLibrary`, `SmokeFormat`, `SMOKE_FORMATS`, `SmokeCommandOptions`, `SmokeOutcome`, `parseSmokeFormat`, `runSmoke`. `async function smokeFile(file, options)` is local (`smoke-command.ts:61`). |
| The smoke formats today | `'pretty' \| 'github' \| 'json'` | `smoke-command.ts:15-16` |
| `SmokeProblem` has no `code` | confirmed | `smoke-runner.ts:30-39`: `{ severity, message, timeline?, time?, location? }` |
| Smoke skips media timelines | confirmed | `smoke-runner.ts:84-88`: `type === 'mediaplayer'` gives `skipped: 'media timelines need a browser'` |
| Smoke loads no CSS | confirmed | `smoke-runner.ts:97`: `cssFiles: []` |
| The smoke step timeout has no CLI flag | confirmed | The option exists as `SmokeCommandOptions.stepTimeoutMs` (`smoke-command.ts:23`), defaulting to 10 s (`smoke-runner.ts:102`). `main.ts:374-395` registers only `--format` and `--strict`. |
| `McpDiagnostic` has no `smoke` source | confirmed | The source literals of `McpDiagnosticSchema` are `parser, validator, type, linker, compiler, eligius-lint, review, fmt` (`diagnostics.ts:72`). |
| The review pass has 2 codes | confirmed | `REVIEW_CODES = ['controller-imbalance','class-never-removed']` (`review.ts:28`) |
| No `agents.ts`, no `agents` command, no `--print-config`, no `init --client` | confirmed | `ls packages/cli/src/agents.ts`: not found. `grep -n "agents\|print-config\|--client" main.ts init.ts` finds only the `mcp` description line (`main.ts:461`). |
| The CLI `eligian init` writes no agent files | confirmed | `runInit` writes only `starterFiles(...)` (`init.ts:38-84`). The agent files are written by the tool only (`mcp/tools/init.ts` `agentFiles`; `writeIfAbsent` uses flag `wx`). |
| The server lists five tools, and the phase constant is 1 | confirmed | `server.ts`: `Toolkit.make(docs, operations, check, fmt, init)`. `instructions.ts:11`: `MCP_PHASE = 1`. |
| The CI inspector gates want five names | confirmed | `.github/workflows/ci.yml:63-67`, `:128-129` |
| Listener action names in raw `addController` arrays are **not** checked | confirmed by probe | The probe puts `addController("DOMEventListenerController", "click", ["nope", "end:greet2"])` in `on enter`. `eligian check` reports "0 errors, 0 warnings" and exits 0. `eligian smoke --strict` fails at runtime with "unknown action "nope" for DOM event "click"". **Source**: `operation-dataflow.ts:436-439` skips an unknown name (`if (!action) continue; // reported by the controller validators`), but `checkControllerCall` (`label-parameter-validator.ts:54-130`) checks only the controller name and the parameter count. |
| A missing media `from` file and a duplicate `from` are not reported | confirmed by probe | Two timelines `using video from "./media/missing.mp4"`: `eligian check` reports 0 errors and 0 warnings. `timeline-validator.ts:85-101` checks only that a source is present (`timeline-source-required`) or absent (`timeline-source-unused`). |
| A timeline container defined only in CSS | an id is reported by `selector_not_in_layout` under the default `ids`; a class only under `all` | Probe: `in "#ghost"` gives a `selector_not_in_layout` warning by default; `in ".ghostc"` is reported only with `--selector-not-in-layout all`. |
| `lottie-web` | a dependency of the extension only, and an *optional peer* of eligius | It is in `packages/extension/package.json:294`. It is not in the `dependencies` of `packages/cli/package.json` (`chalk, commander, effect, eligius, esbuild, jquery, tinyglobby, jsdom`). In eligius 4.2.0, `peerDependenciesMeta["lottie-web"].optional = true`. |
| The generator splices probes into `map-*` chunks only, and reads only the diagnostics overlays | confirmed | `generate-knowledge.ts:317`: `id.startsWith('map-') ? await spliceProbes(...)`. `:332-355`: `overlayFiles` reads `curriculum/diagnostics/` only. |
| No `@mcp-example` markers exist | confirmed | `grep -rn "@mcp-example" examples packages/language/src/starters` finds nothing. |
| The video starter writes no media file | confirmed | `starters.ts:51` has the note "Add your video as media/intro.mp4"; `starters.ts:430` has `using video from "./media/intro.mp4"`. |
| `eligian_operations({path})` parses without adding a document | confirmed | `operations.ts:282-284`: `parseProgram` (`LangiumParser.parse`) runs under `lock.run`. |
| The `AGENTS.md` block cannot hold a titled, pathed line per index id | confirmed by measurement | `packages/cli/dist/docs/index.json` holds 104 entries today: `operation` 80, `reference` 7, `orientation` 5, `mapping` 5, `starter` 4, `runtime` 2, `workflow` 1. Measured with node over that file: the 104 entries as `- <id> — <title> — node_modules/eligian/dist/docs/<path>` take 8,322 bytes on their own. In FR-066's compact form, the 24 non-operation entries as `- <id>: <title> (<path relative to dist/docs>)` take 1,631 bytes (68 bytes per line on average), and the 80 operation names, comma-separated, take 1,205 bytes. The Phase 1 block (`dist/docs/agents-block.md`: workflow and rules, no index) is 2,283 bytes. Projection for Phase 2 (16 more lines at 68 bytes, the operation list, an example list, headers, and a workflow part about the size of Phase 1's): about 6.5–7 KB, within 8,192. |
| `@eligian/language/mcp` exports `hostControllers` and `hostFunctions`, not `hostOperations` or `hostSignature` | confirmed | `packages/language/src/mcp.ts`: `export { hostControllers, hostFunctions } from './compiler/operations/host-operations.js'`; the exact list in `mcp-entry.spec.ts:18`. |
| The bundle imports `eligius/lint` statically, the engine only dynamically | confirmed | `grep -o` over `packages/cli/dist/cli.mjs`: one `import{lintConfiguration as QLe}from"eligius/lint"`, no `from"eligius"`, one `import("eligius")`. The static-import test (`package-bin.spec.ts:184-194`) covers `jsdom`, `esbuild` and `effect/ai` only. |
| Every starter checks clean, warnings as errors | confirmed | `init.spec.ts:76-90`: `describe.each(STARTERS…)` with `warningsAsErrors: true`, expecting no diagnostic. Root `AGENTS.md:47`: "`init.spec.ts` checks every one clean". `starterFiles` returns `Record<string, string>` (`starters.ts:79-83`): text files only. |
| The smoke `json` problems are compared exactly | confirmed | `smoke.spec.ts:88`: `expect(result.problems).toEqual([{ severity, message, timeline, time, location }])`. |
| `reviewConfig` sees no validator diagnostics | confirmed | `withCompiledChecks` (`check-command.ts:169`) calls `reviewConfig(compiled, result.file)` with the compile result only (`:189`). |
| Spawn-based specs skip when the bundle is absent | confirmed | `const built = fs.existsSync(…'dist', 'cli.mjs')` in `mcp-stdout.spec.ts:25`, `mcp-paths.spec.ts:235`, `review.spec.ts:20`; `package-bin.spec.ts:29`. `bin/cli.js` imports `../dist/cli.mjs`. CI builds before it tests (`ci.yml:59-60`, then `:101-102`); `pnpm typecheck` does not rebuild the bundle. |
| Phase 1 eval cases pin a model id | confirmed | `evals/mcp/cases/fix-dataflow.json:5` and `fix-selectors.json:5`: `"model": "claude-sonnet-5-5"`. `run.ts:146`: `const model = modelOverride ?? evalCase.model`; `--model <m>` overrides it (`run.ts:40`). |
| The `npx` fallback on native Windows | recorded by Phase 1 | `packages/cli/README.md:288-293`: Claude Code starts plain `npx -y eligian@^1.1 mcp`; for Cursor, VS Code and Codex, use `cmd` with `/c npx -y eligian@^1.1 mcp`. |
| The SC-010 listener-name fixtures | probed (2026-11-05, scratchpad) | The two programs under "SC-010 fixtures": `eligian check --max-warnings 0` prints "0 errors, 0 warnings" and exits 0 for both. `eligian smoke --strict` exits 1 on the unknown-names program ("unknown action "nope" for DOM event "click"") and 0 on the known-names program. |

## User scenarios and testing

### User story 1: the agent knows what it may reference before it writes selectors (P1)
Before it writes timelines, the agent calls `eligian_project({ path })`. The answer gives the files, the CSS and layout names, the selector union, the locale keys per language, the host declarations, the outline and the asset problems. The agent then writes only names from those lists.

**Independent test**: `mcp-project.spec.ts` runs over a fixture project and asserts the exact sets. The fixture has a layout, two CSS files, locales in two languages, a library, a host module, and one video timeline whose `from` file is missing.

**Acceptance scenarios**:
1. **Given** a project whose layout has `#stage` and whose CSS defines `.in`, **When** `eligian_project` is called on the entry, **Then** `layout.ids` contains `stage`, `css.classes` contains `in`, and the selector union contains both.
2. **Given** a video timeline `from "./media/intro.mp4"` with no such file, **When** the tool is called, **Then** `assets.problems` holds one `media-file-missing` entry with the resolved path.
3. **Given** a `STORYBOARD.md` with 5 beat rows for timeline `Intro`, and a program whose `Intro` compiles to 4 ranged timeline actions plus the lifecycle action of its `on enter`, **When** the tool is called, **Then** the `storyboard` section reports `{ timeline: 'Intro', beats: 5, timelineActions: 4 }` (the lifecycle action is not counted), while `eligian_compile`'s summary reports 5 for `Intro`.

### User story 2: the agent sees what its source compiles to (P1)
After its first timeline passes `check`, the agent calls `eligian_compile({ path, select: { timeline: 'Intro' } })`. It reads the compiled timeline, keyed by names, with each action's source location.

**Acceptance scenarios**:
1. **Given** a clean program, **When** `eligian_compile({ path })` is called, **Then** the summary lists every timeline with its type and duration, and the operations used.
2. **Given** `select: { line: 12 }`, **When** the tool is called, **Then** the fragment is the innermost action whose source range contains line 12, with no `id` key anywhere.
3. **Given** a program with an error, **When** the tool is called, **Then** it returns `ok: false` with the same error diagnostics that `eligian_check` returns, and no config.

### User story 3: the agent proves its interactions work (P1)
After `fmt`, the agent calls `eligian_smoke` with a scenario for every interaction it wrote: for example, click `#pause`, wait, and take a snapshot; press `ArrowRight`; seek to 9. Failed assertions come back as problems located at source.

**Acceptance scenarios**:
1. **Given** a deck where `ArrowRight` navigates to the next slide's timeline, **When** a scenario presses `ArrowRight` and asserts `timeline: 'Slide 2'`, **Then** the assertion passes.
2. **Given** a program that adds the class `in` to `#headline` at 1 s:
   - a scenario asserting that `#headline` has class `in` after a seek to 2 passes;
   - the same assertion after a seek to 0.5 fails with `scenario-assertion-failed`, carrying the expected and the actual values.
3. **Given** a host operation that returns `undefined`, **When** it is smoked, **Then** exactly one `host-operation-returned-non-object` problem is reported, at the call site.
4. **Given** a `timeoutMs` shorter than the run (the test uses 5000 on a long fixture, see SC-008(2)), **When** the child is killed, **Then** the tool returns the lines read so far with `partial: true`, and the child process is gone.

### User story 4: the project is set up for every agent (P2)
`eligian init my-talk --template chapters --client claude` writes the starter plus `.mcp.json`, `AGENTS.md` and `CLAUDE.md`. In an existing project, `eligian agents setup --client cursor vscode` merges into the existing config files without touching other servers.

### User story 5: the knowledge covers whole presentations (P2)
`eligian_docs` serves:
- the D chunks (layout, CSS, provider choice, patterns, assets, host modules, the verification ladder);
- the rest of the B and C chunks;
- operation overlays for the 25 most-used operations, and overlays for all 9 controllers;
- examples cut from the tour.

### User story 6: edits between tool calls are seen (P2)
A check reports an unknown class, and the agent then edits `styles.css`: the next check is clean. The same holds for `layout.html`, `locales.json` and an imported library.

## Requirements

### A. Server, tool list, instructions (roadmap §3.5, §4)

- **FR-001**: The server MUST list exactly eight tools: the five of Phase 1, plus `eligian_compile`, `eligian_project` and `eligian_smoke`.
  - Each new tool lives in its own file: `packages/cli/src/mcp/tools/{compile,project,smoke}.ts`.
  - They are registered in `server.ts` beside the existing five (`Toolkit.make(...)`, `toolkit.toLayer({...})`).

  *(§4 "Eight tools")*
- **FR-002**: Annotations and descriptions of the three new tools:
  - They are deferred (no `anthropic/alwaysLoad`) and carry `Tool.Readonly` (§4 "Annotations: read-only tools get `Tool.Readonly`").
  - `eligian_compile`, `eligian_project` and `eligian_smoke` each carry `Tool.Meta({ "anthropic/maxResultSizeChars": 200000 })` (§4 `eligian_compile`, `full`; Q8). There is no truncation logic: no response is cut, and no `truncated` field exists. Size is bounded only by the concise defaults and the meta.
  - Each description MUST be at most 16,384 characters.
  - Each tool file exports `KEYWORDS: readonly string[]`, and every keyword appears, case-insensitively, in `description.slice(0, 200)`. This is §3.5 ("searchable keywords in the first 200 chars"), in the same convention as Phase 1 FR-017.
  - `eligian_smoke`'s description MUST contain the security note that `host.ts` is user code, executed only inside the smoke child (§2: "Security note in the README and the tool description").
  - `eligian_smoke`'s description MUST also tell the agent to pass `paths` for one file, or `timelines` for a subset (§2 "Tool budget").
- **FR-003**: The Phase 2 instructions:
  - `MCP_PHASE` (`instructions.ts:11`) MUST become `2`.
  - `INSTRUCTIONS[2]` MUST be the §3.5 "Final (Phase 2+) instructions" text, adjusted only as Interpretation I-1 states.
  - It follows the Phase 1 backtick convention: every backticked token that matches `/^[a-z0-9_/-]+$/` is a tool of this phase or an `index.json` id, and the text has no other such tokens.
  - It is at most 4,096 characters.
  - The Phase 1 test "names no phase 2 tool and no scenario" (`mcp-instructions.spec.ts:35`) is replaced by the Phase 2 assertions.

  *(§3.5 "Each phase has its own instructions string")*
- **FR-004**: The Phase 1 conventions apply unchanged to the three new tools:
  - the `header` as the first key (Phase 1 FR-005);
  - the error shape, with `isError` only when the tool could not run (FR-006);
  - the path policy, through `paths.ts` (`projectRoot`, `resolveInputPath`, `resolveInputPatterns`; FR-007);
  - the telemetry line (FR-008);
  - cancellation (FR-009);
  - the compiler lock around every section that touches the shared Langium services (FR-010: `CompilerLock.run(requestId, section)`, `compiler-lock.ts:21-64`).
- **FR-005**: `eligian_compile`, `eligian_project` and `eligian_smoke` take `response_format?: 'concise' | 'detailed'`, default `concise` (§4).
  - Each tool FR below marks the fields that only `detailed` returns.
  - `eligian_compile` and `eligian_project`: detailed is a superset. For the same input, every key of the concise response MUST be present in the detailed response with a deep-equal value (`header` excepted).
  - `eligian_smoke`: the same rule holds for every top-level key except `steps`, whose snapshots differ by design (FR-045). For every step i, the step fields other than `snapshot` are equal. For every key k of the concise `steps[i].snapshot`, the value deep-equals the detailed `steps[i].snapshot[k]`. Every key absent from the concise snapshot has a detailed value deep-equal to the detailed `steps[i-1].snapshot[k]`. Step 0 carries the full snapshot in both formats.

### B. `eligian_compile` (roadmap §4 Inspect)

- **FR-010**: Inputs: `{ path: string, select?: { timeline?: string, action?: string, line?: number }, view?: 'summary' | 'fragment' | 'full', includeMap?: boolean, response_format? }`.
  - There is no `explain` input; the parameter schema does not declare it. It is Phase 3 ("`explain: true` (Phase 3, after provenance)").
  - The default `view` is `'fragment'` when `select` is given, and `'summary'` otherwise.
- **FR-011**: It MUST compile with `compileFile(path, { optimize: true })`, inside the compiler lock. There is no second compile path.
  - Signature: `compileFile(inputPath, options?) => Promise<CompileResult>` (`compile-file.ts:247`).
  - `CompileResult` carries `config`, `json`, `map`, `warnings`, `host?` and `program` (`compile-file.ts:55-69`).
- **FR-012**: The `summary` view holds:
  - per timeline, in config order: `{ name, uri, type, duration, loop?, timelineActions: number }`;
  - `actions` and `eventActions` (names) and `initActions` (a count);
  - `operations: Record<systemName, count>`, counted over every operation list;
  - `controllers`: the names in `addController` operations;
  - `chars`: the length of the full JSON.

  `timelineActions` in the summary is the raw count of the timeline's actions in the compiled config, lifecycle actions included (Q6); it is not the ranged count of FR-025.

  `detailed` adds `cssFiles` and `languages`.

  The timeline `name` is the source name, matched to the config timeline **by index**, never by `uri`: a media timeline's `uri` is its `from` path. This is the Phase 1 ruling recorded under FR-030 of `phase-1-mvp-server/spec.md`.
- **FR-013**: The `fragment` view:
  - **Selection**: `select.timeline` returns that timeline with its timeline actions. `select.action` returns the named action or event action of that name. `select.line` returns the innermost action (timeline, named, event or init action) whose map `location` range contains that line.
  - **Shape**: the returned JSON has **no `id` key** at any depth, and is keyed by action name and timeline uri.
  - **One implementation**: the id stripping and keying MUST be one implementation, shared with the generator's literate probes. Today these are `withoutIds` and `probeFragment` (`generate-knowledge.ts:208-250`), which live outside `tsconfig`; they move into `packages/cli/src/` so that both use them.
  - **Source location**: each returned action carries its source `{ file, line, column }` from the Eligian map (`EligianMapAction.location`, `eligian-map.ts:31-41`).
  - **Nothing selected**: an unknown timeline or action name, or a line inside no action, returns `isError` with kind `not-found`. The message lists the available names, or the line ranges of the nearest actions.
- **FR-014**: The `full` view returns the whole compiled config verbatim. The ids are kept, because `locateConfigPath` paths address them.
- **FR-015**: `includeMap: true` adds the Eligian map entries of the returned actions, keyed like the fragment. An entry is an `EligianMapAction`: `name`, `kind`, `location`, the `start` / `end` operations with their locations, `timelineUri` and `duration` (`eligian-map.ts:23-41`). The default is false.
- **FR-016**: Programs that do not compile:
  - A program with errors returns a successful result `{ ok: false, diagnostics }`, with no config. The diagnostics are the error-severity `McpDiagnostic`s that `eligian_check` returns for the same file, built with the same `toMcpDiagnostics` (`diagnostics.ts:126`).
  - A library file returns `{ ok: false, library: true }`, with no diagnostics.
  - A missing file returns `isError` with kind `not-found`.

### C. `eligian_project` (roadmap §4 Inspect, §5 step 1)

- **FR-020**: Inputs: `{ path: string (entry .eligian or directory), response_format? }`.
  - A directory resolves to every non-library `.eligian` file under it, excluding `node_modules`. Libraries are detected with `isLibrary` (`check-command.ts:52`).
  - Each program gets its own section; library files are listed under `files`.
- **FR-021**: `files` lists the entry, the libraries it imports (transitively), `layout`, every `styles` import, `locales`, the named asset imports, the media `from` files and the host module. Each entry is `{ path (absolute), kind, exists }`; `detailed` adds `bytes`.
- **FR-022**: The names:
  - `css.classes` and `css.ids`: from the CSS registry of the program's document, after its CSS imports are loaded;
  - `layout.ids` and `layout.classes`: from `scanLayoutElements` / `layoutElementsOf` (`layout-elements.ts:21`, `selector-sources.ts:38`);
  - `selectors`: the union, from `selectorNames(services, program, documentUri)` (`selector-sources.ts:51`);
  - `locales`: the languages (the `languages` block's codes; `[]` without a block *(ruling 2026-11-05, compliance: `extractLanguageCodes` returns the `en-US` fallback for a program without a block, which would report a language the program does not declare; `project.ts` reads the block directly, `mcp-project.spec.ts` pins `languages: []`)*), and the keys with their language codes (`extractTranslationKeys(locales) => LabelGroupMetadata[]`, whose entries are `{ id, translationCount, languageCodes }`; root-exported at `packages/language/src/index.ts:57`);
  - `host`: the operations, controllers and functions, with their parameters (`hostOperations` / `hostControllers` / `hostFunctions`, `host-operations.ts:40-50`).

  For locales, concise gives the key list and the language list; `detailed` adds the language codes of each key.
- **FR-023**: `outline` is plain JSON (`{ kind, name, detail, line, children? }`), built from the data that `EligianDocumentSymbolProvider.getSymbols(document)` already computes (`lsp/eligian-document-symbol-provider.ts:70`): timelines with their lifecycle blocks and their events with resolved times, actions, event actions, constants and named imports.
  - It adds, per timeline, `{ container, provider, from?, duration }`.
  - It adds, per action, its parameters with their roles from `parameterRoles(action)` (`css/parameter-roles.ts:63`).
  - It MUST NOT derive the times again: it reuses the provider, which uses `resolveTimelineTimes` (`compiler/transformers/time-resolver.ts:116`).
- **FR-024**: `assets.problems` lists `media-file-missing`, `media-from-duplicate`, `timeline-container-not-in-layout`, and the named asset imports that do not exist. Each entry is `{ code, message, path?, line, column }`. The first three MUST be computed by the same functions the review pass uses (FR-050), not by a second implementation.
- **FR-025**: `storyboard`:
  - When `STORYBOARD.md` exists in the program's directory, the tool parses its §5 beat tables (header `| timeline | start | end | selector | change | end-block |`) and its `interactions` table (`| trigger | target | verb | timeline |`).
  - Per timeline name, the response gives `{ timeline, beats, timelineActions }`. `timelineActions` comes from a compile with `compileFile` under the lock, and counts only the **ranged** timeline actions of that timeline (those with an `end`): the open-ended lifecycle action of `on enter` / `on leave` (`duration: { start: 0 }`, no end) is excluded (Q6). It is `null` when the program does not compile. The compile summary's `timelineActions` (FR-012) keeps the raw count, so the two numbers differ by the lifecycle action.
  - It also gives `unknownTimelines` (rows that name a timeline the program does not declare) and `interactions` (the row count).
  - Beats are not matched to actions; that is Phase 3's `storyboard.beatsCovered`.
  - When the file is absent: `storyboard: null`.
- **FR-026**: `detailed` adds `starters`: the `STARTERS` names and descriptions (`starters.ts:33`).
- **FR-027**: All document loading runs inside the compiler lock. Every workspace document loaded for the call is released before the lock is released (`releaseWorkspaceDocuments`, `compiler/pipeline/parser.ts:364`, or `parseSourceTracked(...).release`, `:102-118`). The tool writes nothing.

### D. `eligian smoke` in the CLI (roadmap §4 Verify; decision 5: "scenario, determinism and media-clock modes ship in `eligian smoke`")

- **FR-030**: `SMOKE_FORMATS` (`smoke-command.ts:16`) MUST gain `'ndjson'`: one JSON object per line, written as each is produced (not buffered to the end). The line types:
  - `{ type: 'file', file }`;
  - `{ type: 'timeline', file, name, boundaries, skipped? }`;
  - `{ type: 'step', file, index, … }` (FR-034);
  - `{ type: 'problem', file, … }`;
  - a final `{ type: 'summary', files, timelines, errors, warnings }`.

  A process killed at any moment leaves only complete lines, plus at most one partial last line. *(§4 "`smoke-command.ts` gains `--format ndjson` (one line per timeline/step)")*
- **FR-031**: `smoke-command.ts` MUST export `smokeFile(file, options) => Promise<SmokeResult>` (§4). The `pretty` and `github` outputs stay byte-identical. The `json` output changes in one way only: each problem gains its `code` (FR-032). The problem expectations of `smoke.spec.ts` (`:88` and its siblings) gain that key and nothing else.
- **FR-032**: Every smoke problem MUST carry a `code` from an exported `SMOKE_CODES` list. This follows Phase 0's "a code on every diagnostic", and `McpDiagnostic.code` is required.
  - The list covers at least:
    - a program that does not compile;
    - an engine `error` event;
    - `console.error` and `console.warn`;
    - an unhandled rejection;
    - a strict `selectElement` miss;
    - a step timeout;
    - a missing host export (`smoke-runner.ts:109-115`);
    - `host-operation-returned-non-object`;
    - a failed scenario step, and a failed scenario assertion;
    - the tool's kill on timeout.
  - `host-operation-returned-non-object` is named in §7; the plan chooses the other names.
  - The `json` and `ndjson` formats carry `code` on every problem (FR-031). The eval gate's `--format json` run (FR-091) reads it. `pretty` and `github` stay unchanged.
- **FR-033** (`host-operation-returned-non-object`): in a smoke run, each registered host operation is wrapped (`loadHostModule` / `registrationsOf`, `dev/host-module.ts:21`, `:50`).
  - A return value (or resolved value) that is not a non-null object is reported as an error problem, once per operation name.
  - The problem is located at the first call site of that operation in the Eligian map.
  - The value is passed on unchanged, so the run behaves as the engine does.

  *(§3.3 C runtime-quirks: "an operation returning `undefined` hands the next one an empty bag"; §3.3 D host-modules-contract: "*always return the bag*")*
- **FR-034** (scenario): `eligian smoke --scenario <file.json>`. A scenario applies to exactly one program file: when `--scenario` is given and the patterns resolve to more than one program file (libraries are not program files), the CLI refuses, prints a usage error naming the files, runs nothing and exits 2 (Q5). The output shape stays flat: step results carry no `file` and `steps` is not grouped per file. The file is `{ "steps": ScenarioStep[], "assertions"?: Assertion[] }`. The steps are those of §4: `{ seek: s } | { click: "#sel" } | { key: "ArrowRight", in?: "#sel" } | { navigate: "<timeline name>" } | { wait: ms } | { snapshot: "<label>" }`. For the one program file:
  1. **The walk**: the normal boundary walk runs first, unchanged.
  2. **The scenario engine**: a **fresh engine** for the same config runs the scenario, started the way the `--bundle` runtime starts a presentation: `init()`, then `start()` (§3.3 C runtime-engine-lifecycle: "`engine.start()` (the bundle) vs `init()` alone"). For this engine, the program's CSS files are injected into the jsdom document as `<style>` elements, so that class-driven visibility can be evaluated. The walk keeps `cssFiles: []`.
  3. **The steps**:
     - `seek` seeks the active timeline.
     - `click` dispatches a bubbling `click` `MouseEvent` on the first element that matches the selector.
     - `key` dispatches `keydown`, then `keyup`, with that `key`. The target is the `in` element; else the element a `KeyboardController` is attached to; else `document`.
     - `navigate` switches to the named timeline at 0.
     - `wait` waits that many milliseconds of real time.
     - `snapshot` records a labelled snapshot.

     Three cases are scenario-step problems: a selector that matches nothing, an unknown timeline name, and a step on a media timeline (media stays skipped until Phase 3's media clock).
  4. **Step results**: every step returns `{ index, step, timeline (the active one, by source name), position (seconds), snapshot }`.
     - The snapshot holds, per element with an `id` in the layout, `{ classes, text (trimmed, ≤ 200 chars), style (inline), visible, controllers }`.
     - It also holds `activeTimelineActions`: their names, from `activeTimelineActions(map, uri, position)` (`eligian-map.ts:307`).
  5. **`visible`**: the element exists; it has no `hidden` attribute; and neither it nor any ancestor computes `display: none`, `visibility: hidden` or `opacity: 0`.
     - **[UNVERIFIED]**: whether jsdom 30.1.3's `getComputedStyle` cascades these three properties from injected `<style>` elements. `mcp-scenario.spec.ts` settles it. If it fails, the plan names the fallback: resolving the matched rules itself.
  6. **`controllers`**: the names of the Eligius controllers attached to the element.
     - **[UNVERIFIED]**: where eligius 4.2.0 records the controllers attached to an element. The plan verifies this in the installed `eligius` (`node_modules/eligius/dist`) before building on it.
  7. **Assertions**: `{ after: <snapshot label | step index>, selector?, hasClass? | notHasClass? | text? | visible? | controllers? | timeline? | position? }`. These are the §4 kinds, extended by Interpretation I-5.
     - `position` is `number | { sameAs: <snapshot label | step index> } | { greaterThan: <snapshot label | step index> }`. The number is an absolute position in seconds, compared with a tolerance that the plan fixes. `sameAs` asserts the same position as another step, and `greaterThan` a strictly greater one. The relative forms express §6.2 case 1 ("no position change after wait 300"; "position advances"), which an absolute value cannot express after real-time waits.
     - A failed assertion is an error problem carrying the step, the label, the selector, the expected value and the actual value.
     - Any error problem gives exit code 1.
- **FR-035**: The CLI gains two flags, for what the tool must pass to the child (Interpretation I-6):
  - `--timeline <name>` (repeatable) plays only those timelines. An unknown name is a problem.
  - `--step-timeout-ms <n>` sets `SmokeCommandOptions.stepTimeoutMs` (default 10 s, `smoke-runner.ts:102`).

  `eligian smoke --help` documents `--scenario`, `--timeline`, `--step-timeout-ms` and `ndjson`.
- **FR-036**: The new scenario code lives in `packages/cli/src/smoke/scenario.ts` (§7 Touches).
  - `dom-environment.ts` changes only as far as the scenario needs: CSS injection and event-dispatch helpers.
  - `jsdom` stays a dynamic import (`dom-environment.ts:20`; the Phase 0 lazy-import rule).

### E. `eligian_smoke` tool (roadmap §2 "Process isolation", "Cancellation", "Tool budget"; §4 Verify)

- **FR-040**: Inputs: `{ paths: string[], strict?: boolean (default true), timelines?: string[], scenario?: ScenarioStep[] | { steps, assertions? } | string (path to a scenario file), assertions?: Assertion[], timeoutMs?: number (default 45000), stepTimeoutMs?: number, response_format? }`. There is no `determinism` input (Phase 3). A `scenario` / `assertions` input together with `paths` that resolve to more than one program file is a usage error: the tool returns `isError` with kind `io` and a message naming the files, and spawns no child (Q5; the CLI's exit 2 of FR-034 is mapped to the same result if it is reached).
- **FR-041**: The tool MUST NOT run the engine in the server process.
  - It spawns `process.execPath` with `[<own bin/cli.js>, 'smoke', ...resolvedPaths, '--format', 'ndjson', ...flags]`, with `shell: false` and `cwd` set to the project root. Because the arguments are an array, Windows paths with spaces need no quoting.
  - `<own bin/cli.js>` defaults to the `bin/cli.js` beside the running bundle (`new URL('../bin/cli.js', import.meta.url)`). The specs can override it with an option.
  - An inline scenario is written to a temp file under `os.tmpdir()`. The file is removed when the call ends, on every path: success, failure, timeout and cancellation.
  - Test seams: the tool's handle options take `cliPath?` (above) and `onSpawn?: (pid: number, scenarioFile?: string) => void`, called once the child is spawned, so that a spec can check the child and the temp file after the call settles (SC-008(4)).

  *(§2: "`eligian_smoke` spawns `process.execPath <own bin\cli.js> smoke <paths> --format ndjson [--strict] [--scenario <file>]`")*
- **FR-042**: When `timeoutMs` elapses, the child is killed, and the tool returns a **successful** result built from the complete ndjson lines read so far. The result has `ok: false`, `partial: true` and a timeout problem (FR-032). *(§2: "kills the child on `timeoutMs`, and parses the lines read so far"; §4: "partial when killed on timeout")*
- **FR-043**: On MCP `notifications/cancelled`, the child is killed and the temp scenario file is removed. No response frame is sent (§2 "Cancellation"; Phase 1 FR-009).
- **FR-044**: The child's stdout is parsed, and never written to the server's stdout. The child's stderr is copied to the server's stderr, each line prefixed with `smoke: `. *(§2 "nothing but the protocol on stdout")*
- **FR-045**: Output: `{ header, ok, files: [{ file, timelines: [{ name, boundaries, skipped? }] }], steps: [...], problems: McpDiagnostic[], partial? }`. `steps` is flat and has no `file` key: a scenario runs on one program file only (FR-034, FR-040).
  - `McpDiagnosticSource` gains `'smoke'`, and `McpDiagnostic` gains the optional fields `timeline`, `time` and `step` (the §4 record; deferred by Phase 1 FR-015).
  - A problem without a location is anchored at line 1, column 1 of its program file.
  - Concise: each step carries only the snapshot entries that changed since the previous step. `detailed`: full snapshots.
  - `ok` means no error problems and not partial.
- **FR-046**: `eligian_smoke` does not take the compiler lock, because the child compiles in its own process. Parallel smoke calls each get their own child.

### F. Review pass, remaining checks (roadmap §4 `eligian_check`; decision 4)

- **FR-050**: `REVIEW_CODES` (`review.ts:28`) MUST gain six codes. Each is a **warning**, located at source, with its diagnostics overlay (§4: "Each a warning with an overlay").
  - `reviewConfig(compiled, file)` keeps its signature (`review.ts:41`, with `Compiled = Pick<CompileResult, 'config' | 'map' | 'program'>`).
  - The checks read the program AST, and for media files the file system, relative to the program file.

  The six checks:
  - **`media-file-missing`**: a video or audio timeline's `from`, resolved relative to the program file, does not exist. It is located at the `from` string. Named asset imports already fail with the error `import_file_not_found` (`import-validator.ts:126`), and are not reported again.
  - **`media-from-duplicate`**: two or more media timelines resolve to the same `from`. It is reported on the second and later timelines.
  - **`timeline-container-not-in-layout`**: the program imports a layout, and a class or id of a timeline's `in` selector is not in the layout.
    - It is reported whatever the `selectorNotInLayout` setting is, because a container must exist when `init()` renders the layout (§3.3 C runtime-engine-lifecycle).
    - It is not reported where `selector_not_in_layout` already reports the same range in the same run (Interpretation I-4). `reviewConfig` sees no validator diagnostics (`check-command.ts:189`), so the suppression is applied where review and validator diagnostics are merged: `withCompiledChecks` (`check-command.ts:169`), and the same merge in `eligian_check`. `reviewConfig` keeps its signature.
    - Without a layout import, nothing is reported: the engine generates the containers (§3.3 C).
  - **`media-timeline-first-without-start-gesture`**: the first declared timeline (the entry, §3.3 C) is a video or audio timeline, and its `on enter` holds no `on click "<sel>" play` or `toggle` interaction. *(§3.3 D provider-choice: "raf hub with a Start button that `navigate`s to the media timeline, or a visible `on click … play`")*
  - **`entry-timeline-without-enter`**: the program declares **two or more** timelines, and the first declared timeline has no `on enter` block (Q2). A program with a single timeline is never reported, so `examples/libraries/nested/chain-test.eligian` (one timeline, no `on enter`) stays clean.
  - **`host-operation-in-block-without-select`**: a host operation is called in a block where no `selectElement` precedes it in that block (`target` and `with` compile to one, and count), and the operation declares no parameter named `selector` (Interpretation I-3). The tour's `stampTime(selector: string)` (`tour.eligian:39-41`, called at `:108`) must stay clean. *(Ruling 2026-11-05, plan OQ-1)* "A block" means the lists whose operation data starts fresh: timeline events (start and end), timeline lifecycle, init actions and event actions. **Named-action bodies are exempt**: a called action receives a copy of its caller's operation data (`mcp-runtime-claims.spec.ts` CLAIMS[1]), so a host operation there may rely on the caller's selection, as the dataflow validator already allows for registry operations (it reports the call site, `missing-action-dependency`, not the body). A call-site rule for host operations is deferred to Phase 5's promotion if the evals show it matters.
- **FR-051**: `eligian check` runs all eight review checks by default (`--no-review` skips them, `main.ts:297`). `eligian_check` runs them under `review: true`. Gates:
  - `pnpm run check:examples` (root `package.json:25`, `--max-warnings 0`) stays green, and no example is edited to silence a check. A check that fires on an example is a defect in the check, unless `compliance.md` shows it is a true positive and the example is fixed with that justification.
  - `init.spec.ts` "checks without errors or warnings" (`init.spec.ts:76-90`) keeps the zero-diagnostic expectation for the `blank`, `chapters` and `library` starters. For the `video` starter it expects exactly one diagnostic: `media-file-missing`, on `./media/intro.mp4` (Q1). The `video` starter writes `using video from "./media/intro.mp4"` (`starters.ts:430`) but no media file, and this phase adds no placeholder media bytes and no suppression mechanism; `starterFiles` stays text-only. Root `AGENTS.md:47` and the `video` starter note (`starters.ts:51`) are updated to say that this starter carries that one warning until the user adds the file.

### G. The three verifications (roadmap §7 Phase 2 "Verify"; §3.3 B `map-imports-and-assets`; §2 install story)

- **FR-055** (listener action names): this session verified that they are unchecked (see the Verification record).
  - Phase 2 MUST report each string literal in the action list of `addController("DOMEventListenerController" | "KeyboardController", …, [ … ])` that, once an `end:` prefix is stripped, names no action the program can reach (local or imported).
  - It is a **language validator** (Q3): a code registered in `packages/language/src/validators/codes.ts`, shown as an IDE squiggle at the string, and reported by `eligian check` and `eligian_check` without compiling (it is reported for a program that has other errors too). It is not a review check.
  - The language coverage gate applies to the new validator (FR-080, FR-098).
  - The finding carries the code and an overlay (FR-076), and `map-imports-and-assets.md` teaches the result.
  - The SC-010 fixtures and the validator's spec live in the language package (path: plan).

- **FR-056** (Lottie): Phase 2 MUST run a `LottieController` probe program with the shipped CLI in three modes:
  - `compile --bundle`, then open the bundle;
  - `dev`, on page load;
  - `smoke`.

  For each mode, `compliance.md` records whether the controller works, with the exact commands and their output. "Works" means:
  - `compile --bundle` and `dev`: the bundle's page, loaded in a real browser (a headless Chromium, or the build agent's browser tool; not jsdom), shows an `<svg>` rendered by lottie-web inside the controller's element within 2 s of load. The engine emits no `error` event, and the console shows no error. The evidence is the element's `outerHTML` (truncated) and the console log.
  - `smoke`: `eligian smoke <probe> --strict` exits 0 with no problem.

  The probe project has `lottie-web` installed in its own `node_modules` for the three modes above; a fourth run, with `lottie-web` not resolvable, records the warning below.

  The outcome is decided (Q4): `lottie-web` is NOT added to the CLI `dependencies` (and the declared-dependencies assertion of `package-bin.spec.ts` stays as it is). Instead:
  - Phase 2 MUST emit a **coded warning**, located at the `addController("LottieController", …)` call, only when `lottie-web` cannot be resolved from the project's own `node_modules` (resolved upward from the program file's directory). The user installs it. When it resolves, nothing is reported.
  - The warning has an overlay (FR-076) that tells the user to install `lottie-web` in their project.
  - The `LottieController` status stays `constrained` (FR-074) until `lottie-web` is resolvable; the overlay says so.
  - *Ruling 2026-11-05 (compliance, T048 defects D-L1..D-L3; `baseline/lottie.txt`):* the three-mode probe of the form the overlay taught (`addController("LottieController", url)`) does not work in any mode: the engine's `LottieController.init` needs `json` / `animationData` and reads `url` only for its freeze / end markers (D-L1, a curriculum defect: the overlay now teaches `loadJson` + `addController`; the probe variant with `loadJson` rendered the `<svg>` in the bundle with the JSON copied beside it, and in `dev` with a data url). D-L2 (`--bundle` and `dev` do not carry operation-data urls) and D-L3 (`lottie-web` fails at import under jsdom, so `smoke` reports the peer dependency as missing) are CLI defects outside this phase, recorded in the roadmap for Phase 3; the overlay states both. The per-mode record stays as measured.
  - The mechanism that raises the warning (validator or review check) is chosen by the plan; the warning is reported by `eligian check` and `eligian_check` (SC-022).

- **FR-057** (AGENTS.md readers): Phase 2 MUST establish, from each client's official documentation as of the build date, which of Claude Code, Cursor, VS Code Copilot and Codex read `AGENTS.md` natively. Then:
  - `compliance.md` records the URLs and the date;
  - the roadmap §2 marker "[UNVERIFIED: which clients read AGENTS.md today; verify in Phase 2]" is settled;
  - `packages/cli/README.md` states the result.

  Decision 3 already fixes which files are written; this finding changes wording only.

### H. Agent context (roadmap §2 "Install story per client"; decision 3)

- **FR-060**: A new `packages/cli/src/agents.ts` MUST build every agent file from one source:
  - `.mcp.json` (claude) and `.cursor/mcp.json` (cursor): `{ "mcpServers": { "eligian": { "command": "node", "args": ["<abs>/node_modules/eligian/bin/cli.js", "mcp"] } } }`;
  - `.vscode/mcp.json` (vscode): `{ "servers": { "eligian": { "type": "stdio", "command": "node", "args": [...] } } }`;
  - `.codex/config.toml` (codex): a `[mcp_servers.eligian]` table with `command = "node"` and `args = [...]`;
  - the `AGENTS.md` block, between `<!-- eligian:begin -->` and `<!-- eligian:end -->`;
  - `CLAUDE.md` with the line `@AGENTS.md` (claude);
  - `.cursor/rules/eligian.mdc` (cursor);
  - a block in `.github/copilot-instructions.md`, between the same markers (vscode).

  The absolute path uses OS-native separators (§2). `eligian init` and `eligian_init` always write this `node` form: the starter's `package.json` depends on `eligian`, so the path exists after `npm install` (Q7). `eligian agents setup` instead follows the `--print-config` rule of FR-063 (node form when `node_modules/eligian/bin/cli.js` exists under the cwd, else the `npx` form, with `cmd /c` on win32 for cursor, vscode and codex); the `npx` form is the per-client form in the README (Phase 1 FR-047 recorded `cmd /c` on native Windows).
- **FR-061** (merge semantics, §2):
  - **JSON files**: parse; set only the `eligian` key of `mcpServers` (or `servers`); keep every other key and server; write 2-space JSON with a trailing newline. A file that is not valid JSON is refused, left untouched, and reported.
  - **TOML**: replace the `[mcp_servers.eligian]` table (from its header line through the line before the next table header), or append it. Every other byte is unchanged.
  - **Markdown blocks**: replace the text between the markers, or append the block after one blank line.
  - **`CLAUDE.md`**: add the line `@AGENTS.md`, unless a line already equals it.
  - **Status**: each file reports `written`, `updated`, `unchanged` or `refused`.
  - **Idempotence**: a second run on the same project reports every file `unchanged`, and changes no byte.
- **FR-062**: `eligian agents setup [dir] [--client <claude|cursor|vscode|codex>...]` (default `claude`) applies FR-060 and FR-061 to an existing project, choosing the server command with the FR-063 rule (node form when `node_modules/eligian/bin/cli.js` exists under the cwd, else the `npx` form; `cmd /c` on win32 for cursor, vscode and codex; Q7), and prints one line per file. It exits 0 when nothing was refused, 1 otherwise, and 2 on a usage error.
- **FR-063**: `eligian mcp --print-config <claude|cursor|vscode|codex>` prints that client's snippet to stdout and exits, without starting the server.
  - When `node_modules/eligian/bin/cli.js` exists under the cwd, the snippet uses the `node` form with its absolute path.
  - Otherwise it uses the `npx -y eligian@^1.1 mcp` form. On `process.platform === 'win32'`, the `cursor`, `vscode` and `codex` snippets use `cmd` as the command, with the arguments `["/c", "npx", "-y", "eligian@^1.1", "mcp"]` (TOML: the same values); `claude` keeps plain `npx`. This is the Phase 1 finding in `packages/cli/README.md:288-293`.
  - The platform is a parameter of `printConfig` (default `process.platform`), so both forms are tested on any OS.
  - Nothing else goes to stdout.

  *(§2)*
- **FR-064**: `eligian init` MUST write the agent files after the starter (§2: "Written by `eligian init` (new projects)"; Interpretation I-8), always in the `node` form of FR-060, whether or not `node_modules/eligian` exists yet (Q7).
  - `--client <…>` selects the clients; the default is `claude`.
  - `--no-agents` writes no agent file.
  - `AGENTS.md` is written for every client set; `CLAUDE.md` with `claude`.
- **FR-065**: `eligian_init` MUST gain `client?: ('claude' | 'cursor' | 'vscode' | 'codex')[]`, default `['claude']`.
  - It writes its agent files through `agents.ts`, with the merge semantics of FR-061, always in the `node` form (Q7). This replaces Phase 1's write-if-absent (`mcp/tools/init.ts` `writeIfAbsent`).
  - The response lists each agent file with its FR-061 status.
  - The next steps follow §4, adjusted by Interpretation I-1.

  *(§4 `eligian_init` "Wraps: `runInit` …; `starterFiles`; `agents.ts`")*
- **FR-066**: The `AGENTS.md` block holds:
  - the Phase 2 workflow and the five rules, built from the same parts as the instructions (`instructions.ts`);
  - the docs pointer, which names the docs directory `node_modules/eligian/dist/docs/` once;
  - the index, in two forms:
    - every index id whose kind is neither `operation` nor `example`: one line with its id, its title and its path relative to the docs directory;
    - the `operation/<name>` and `example/<id>` ids: by name only, as one comma-separated list per kind. Each list follows one line that gives its path pattern (`generated/operations/<name>.md`, `generated/examples/<id>.md`); the operation line also points at `operations-index`.

  It is at most 8,192 bytes (`Buffer.byteLength(agentsMdBlock(), 'utf8')`). The Cursor rule and the Copilot block carry the same text. The roadmap asks for an index that "repeats the workflow and the five rules and points at the on-disk chunk files", not for a titled line per id. A titled, pathed line for every id does not fit in the budget (Verification record). *(§5 "Enforcement": "the `AGENTS.md` index (~6–8 KB) …")*

### I. Knowledge (roadmap §3.3, §3.4)

- **FR-070**: New curriculum chunks under `packages/cli/src/mcp/knowledge/curriculum/`:
  - **B**: `map-program-and-config`, `map-erased-parameters`, `map-control-flow-and-data`, `map-event-actions`, `map-imports-and-assets` and `map-locales-and-languages`, each with literate probes;
  - **C**: `timing-models`, `runtime-quirks` and `runtime-state-pitfalls`;
  - **D**: `layout-html`, `css-conventions`, `provider-choice`, `presentation-patterns`, `assets-and-host-modules`, `host-modules-contract` and `verification-ladder`.

  **Format**: the Phase 1 chunk format (Phase 1 FR-035): frontmatter `id, title, kind, use_cases, see, card`; a card of at most 120 words; a body of 300–1,200 words, with a hard limit of 1,500; the chunk ends with `see:`.

  **Content rules**:
  - The §3.3 text of each chunk is its brief.
  - `provider-choice` states only the verified current behaviour of `custom`, and leaves the host-source row to the decision-10 spec.
  - `runtime-state-pitfalls` names the review codes (FR-050) of the mechanical pitfalls.
  - `verification-ladder` describes the ladder that this version ships: check, review warnings, fmt, smoke with scenarios, then `dev`. It does not teach `--determinism` (Phase 3).
  - `host-modules-contract` states that host operations declare no NEEDS / PROVIDES (`hostSignature`, `host-operations.ts:73`).

  **Sources**: the §3.3 source list. Not `KNOWN_ISSUES.md`, and not `examples/demo.eligian` (decision 6).
- **FR-071**: Every runtime claim in the three C chunks MUST be executable: one probe test per claim in `mcp-runtime-claims.spec.ts`, referenced by its test title in the chunk (§3.3 C: "every claim here is executable"). The `runtime-quirks` claims are mined from `f:\projects\eligius\eligius\src\test\differential\quirks.spec.ts`, a read-only reference from which nothing is imported.
- **FR-072**: Literate probes MUST also run in `presentation-patterns` (§3.3 D: "compiled output for each via probes"). The generator's probe filter (`generate-knowledge.ts:317`, `map-*` only) is widened to include it. Snapshots work as in Phase 1 FR-038 and FR-041.
- **FR-073** (operation overlays): `curriculum/operations/<name>.md` MUST exist for the 25 most-used operations. *(Ruling 2026-11-05, T036)* The I-9 corpus (the strict `check:examples` files plus the four starters) calls **13** distinct registry operations (609 call sites, 453 of them action calls), so "25" is a cap, not a count: the selection is every counted operation in count order, at most 25; overlays exist for exactly the selection; the ranking is not padded with uncounted registry operations and the corpus is not widened (the fixtures add only 2 more).
  - **Selection**: a committed script, `packages/cli/scripts/rank-operations.ts` (tsx; package script `rank:operations`), writes a committed ranking file (Interpretation I-9).
  - **Format**: frontmatter `operation: <name>`; a card of at most 120 words; a body with an Eligian call example (a literate probe), idioms and pitfalls.
  - **Use**: the generator merges an overlay into `generated/operations/<name>.md` (§3.2), and the `eligian_operations` cards include it (§4: "then params, status, Eligian form, overlay").
- **FR-074** (controller overlays): `curriculum/controllers/<name>.md` MUST exist for all 9 controllers in `CONTROLLERS` (`controllers.generated.ts:29`), in the FR-073 format (roadmap §3.3 G: "Eligian call example, idioms, pitfalls, status"):
  - frontmatter `controller: <name>` and `status: recommended | constrained | do-not-use`;
  - a card of at most 120 words;
  - a body with an `addController("<Name>", …)` call example as a literate probe, idioms and pitfalls. For a `do-not-use` controller, the probe still compiles, and the body says what to use instead.

  Further:
  - `RoutingController` is `do-not-use`, from its metadata (`controllers.generated.ts:190`).
  - `LottieController` is `constrained` (FR-056, Q4), and its overlay says to install `lottie-web` in the project *(ruling 2026-11-05: and to load the animation with `loadJson` first, to serve the JSON file beside the bundle, and that `smoke` cannot play it; the FR-056 ruling)*.
  - The overlay statuses become the single source: they replace `CONTROLLER_STATUS` in `mcp/knowledge/render.ts`.
  - `generated/controllers.md` and the controller cards show every status.
- **FR-075** (examples):
  - The tour's `.eligian` files gain `// @mcp-example <id> <title>` … `// @mcp-end` markers (§3.2).
  - The generator emits `generated/examples/<id>.md` for every marker in the tour and in the starters, with `kind: example` index entries. The no-argument index lists them with `id` and `title` only, like the operation entries (Phase 1 FR-019).
  - The generator fails on an unclosed marker or a duplicate id.
  - A chunk's `see:` may name an `example/<id>` where a marker covers its construct; no chunk is required to. Drift check: every `example/<id>` named in a `see:` line exists in the index.
  - `check:examples` and `fmt:examples` stay green with the markers.
- **FR-076** (overlays for new codes): every code this phase adds MUST have a `curriculum/diagnostics/<code>.md` overlay: the six review codes, `SMOKE_CODES`, the FR-055 code, and the FR-056 `lottie-web` warning.
  - The diagnostics catalogue (`generated/diagnostics.md`) lists them, with their sources (`review`, `smoke`, …).
  - The Phase 1 allowlist of missing overlays (Phase 1 FR-042) may only shrink: no new code is added to it.
- **FR-077**: With all the new chunks, the no-argument `eligian_docs` index stays within Phase 1's 12,000-character budget (Phase 1 FR-019 / SC-011). The only change to the listing rule in this phase is FR-075's: `example/<id>` entries are listed with `id` and `title` only. The bound is not relaxed (SC-013(7)). *(Ruling 2026-11-05, Group 14 gate)* Measured: Phase 1's index was 11,691 chars and the 13 new chunks add about 4,234 (16,022 total; blank cards still 12,129), so no card shortening can fit. Decision: (a) the listing rule changes: a chunk entry in the index is `{ id, title, kind, card }`; `use_cases`, `words` and `see` are detail data (returned by `ids`), not index data. The bound stays at 12,000. `docs.ts` and `mcp-docs.spec.ts` were amended in the main loop. *(Second ruling 2026-11-05, T045)* After T043 (3 runtime chunks) and T044 (17 example entries) the index measured 13,573 chars again, with cards totalling 4,125: cutting 38% of card text would strip the cards of meaning. Decision: the no-argument index **does not list the operations** (80 entries, about 4,500 chars); they have their own tool. The response carries `operations: { count, see }` pointing at `eligian_operations({})` and at `ids: ['operation/<name>']`, which still resolve. Phase 1 SC-011's "every `index.json` entry" is superseded for operation entries. This leaves about 3,000 chars of headroom for Phase 3's chunks.

### J. Language API entry (roadmap §7 Phase 1 `@eligian/language/mcp`)

- **FR-080**: The tools import language data only from `@eligian/language` or `@eligian/language/mcp` (`packages/language/src/mcp.ts`).
  - Anything that FR-022, FR-023 or FR-027 needs and that neither entry exports today is added to the `mcp` entry. Candidates found while verifying:
    - `releaseWorkspaceDocuments`, `parseSourceTracked` and `loadCssImports` (`compiler/pipeline/parser.ts:364`, `:102`, `:323`);
    - `extractLanguageCodes` (`labels/types.ts:170`);
    - `parseSelector` (`css/selector-parser.ts`);
    - `hostOperations` (FR-022), and `hostSignature` if a tool needs it (`compiler/operations/host-operations.ts:40`, `:73`). The entry exports only `hostControllers` and `hostFunctions` today (`mcp.ts`; `mcp-entry.spec.ts:18`).
  - The exact-exports test (`mcp-entry.spec.ts:18`) is updated to the new list.
  - Language coverage stays at or above lines 79.8 / functions 80 / branches 69.9 (`packages/language/vitest.config.ts:74-79`).

### K. Staleness (roadmap §2 "Memory and staleness")

- **FR-085**: `mcp-staleness.spec.ts` MUST cover four file kinds: a CSS file, `layout.html`, `locales.json` and an imported library `.eligian`. For each kind, the spec calls a tool, edits the file, and calls the tool again in the same server; the second result must reflect the edit.
  - **Tools covered**:
    - `eligian_check`: diagnostics appear or disappear;
    - `eligian_project`: names change;
    - `eligian_compile`: a library action's compiled operations change.
  - **Known caches to cover**:
    - the layout scan cache, keyed by HTML text (`selector-sources.ts:24-35`);
    - the CSS registry registration per document (`parser.ts:358`);
    - the label registry, updated by the validators (`asset-import-validator.ts:325-330`);
    - the library documents kept in the shared workspace (`parser.ts:58-66`).

### L. Eval cases (roadmap §6.2, §6.4; §7 Phase 2 Exit)

- **FR-090**: `evals/mcp/cases/{title-card,three-chapters,staggered-list,keyboard-deck,library-reuse}.json` (cases 1, 2, 3, 6 and 8). Each case has:
  - the §6.2 prompt, followed by the element ids and timeline names its scenario uses (Interpretation I-5), so that a correct solution can be checked;
  - an empty start state;
  - a scenario file holding the §6.2 behavioural assertions, without the determinism parts (Phase 3);
  - a pinned Sonnet-class model id in `model`: the same id as Phase 1's cases (`"claude-sonnet-5-5"`, `fix-dataflow.json:5`), never an alias (§6.4 "The model is pinned per run and recorded in the results"; decision 9).
- **FR-091**: `evals/mcp/gate.ts` changes:
  - Step 3 MUST run `smoke <entry> --strict --format json --scenario <case scenario>` when the case has a scenario.
  - Step 4 MUST check the case's §6.2 "Structural" column with inline code (Interpretation I-7).
  - `run.ts` accepts a case without a start directory.

### M. CI, packaging, docs

- **FR-095**: Both inspector gates in `ci.yml` (`:63-67`, `:128-129`) MUST want the eight names. The "Try the package" step of `publish-cli.yml` keeps its `eligian_docs` call (`publish-cli.yml:95-98`).
- **FR-096**: `package-bin.spec.ts`:
  - the packed file list is updated for the new docs;
  - the `initialize` answer stays under 3 s;
  - the server process loads neither `jsdom` nor the `eligius` main entry (the engine) at start; smoke runs in a child. `eligius/lint` is allowed: `eligian_check` uses it, and the bundle imports it statically today (Verification record). The static-import test (`package-bin.spec.ts:184-194`) gains the bare `eligius` specifier.
- **FR-097**: `packages/cli/README.md` documents:
  - the three new tools;
  - `agents setup`, `mcp --print-config` and `init --client / --no-agents`;
  - `smoke --scenario` (with the scenario format) and `--format ndjson`;
  - the security note;
  - the FR-057 finding.

  `CHANGELOG.md` gets the entries.
- **FR-098**: Gates:
  - CLI coverage at or above its thresholds: lines 77.1 / functions 77.6 / branches 64.5 / statements 76.6 (`packages/cli/vitest.config.ts:17-22`);
  - language coverage per FR-080, including the FR-055 validator and its spec;
  - `pnpm effect:check` with 0 errors and 0 warnings for every Effect module touched.
- **FR-099**: The roadmap's §7 Phase 3 Touches MUST name `generated/dom-events.md`, `generated/key-names.md` and `generated/html-elements.md` (§3.2; sources `utils/dom-events.ts`, `utils/key-names.ts`, `completion/html-elements.generated.ts`). This gives the §3.2 deliverable, which no phase lists today, an owner. Phase 2 does not build them (Non-goals).

## Success criteria

| SC | Criterion (metric, threshold) | How it is measured |
|---|---|---|
| SC-001 | `tools/list` names exactly `eligian_check eligian_compile eligian_docs eligian_fmt eligian_init eligian_operations eligian_project eligian_smoke` | The full `ci.yml` gate pipeline, not the inspector call alone (the call exits 0 whatever the list holds): `pnpm -C packages/cli exec mcp-inspector --cli --method tools/list --format json node bin/cli.js mcp \| node -e "…"`, where the `node -e` script of `ci.yml:63-67` compares the sorted names with `want='eligian_check eligian_compile eligian_docs eligian_fmt eligian_init eligian_operations eligian_project eligian_smoke'` and exits 1 on any other list. It exits 0 locally on Windows and on `ubuntu-latest` in the PR's CI, and `compliance.md` quotes the printed `tools/list: …` line. |
| SC-002 | (1) Annotations: 3 tools have `alwaysLoad: true`; compile, project and smoke have `readOnlyHint: true` and no `alwaysLoad`; compile, project and smoke each have `_meta["anthropic/maxResultSizeChars"] === 200000`; the three responses carry no `truncated` key. (2) Each new description is ≤ 16,384 chars, with its `KEYWORDS` in the first 200. (3) For each of compile, project and smoke (FR-004): `Object.keys(result)[0] === 'header'`; the call writes exactly one telemetry line whose `tool` is its name; a call that cannot run returns `isError` with the Phase 1 error shape. | `mcp-server.spec.ts`, through the in-process client (`mcp-test-client.ts`); `mcp-telemetry.spec.ts` (extended to the three tools) |
| SC-003 | The instructions are ≤ 4,096 chars, equal to §3.5's final text as adjusted by I-1, and every backticked token is a tool or an index id. | `mcp-instructions.spec.ts` |
| SC-004 | compile: (1) the summary fields follow FR-012; for a timeline with `on enter`, `timelineActions` is the raw count including the lifecycle action. (2) A `fragment` for a `timeline`, `action` or `line` selection has 0 `id` keys at any depth, and the expected names. (3) `full` deep-equals `compileFile(path).config`. (4) An error program gives `ok: false`, with diagnostics equal (code, line, column) to `eligian_check`'s errors. *(Ruling 2026-11-05, T006)* `compileFile`'s `AssetError` branch is unreachable for a program on disk: `ProgramAssetImportValidator` reports every asset error first (`asset-import-validator.ts:116-143`), so `parseSource` throws `CompilationError("Validation failed")` before it. The "validates clean but compileFile rejects" case is therefore dropped; the fixture is `__fixtures__/mcp/compile/compile-rejected/` (a program that imports a library, a layout, and a `locales.json` whose schema is invalid): `check` exits 1 with `locales-import-error`, `compile` exits 1 with the `CompilationError`. The B1 test (`compile-file-release.spec.ts` › `compileFile` › `releases its libraries when validation rejects`) asserts `rejects.toBeInstanceOf(CompilationError)` and an unchanged document count; `eligian_compile` on it is one more instance of this bullet (its `compile-failed` diagnostics equal `check`'s). *(Ruling 2026-11-05, T015)* T015 measured that the validation-rejection path already releases every document (`parseSource` wraps `parseSourceTracked` with `Effect.onError(release)`, `parser.ts:68-102`; the clean path is `acquireUseRelease`, `pipeline.ts:180-192`): root document count 0 → 0 on the fixture. Only the unreachable `AssetError` branch leaks. Plan P2 (B1) is therefore **dropped**: `compileFile` is not changed. The release test stays as a green regression guard (`compile-file-release.spec.ts` › `compileFile` › `releases its libraries when validation rejects` and › `a clean compile also leaves the count unchanged`); it is not test-first. (5) An unknown selection gives `isError` `not-found`, naming the available names. (6) The generator's probe snapshots are unchanged after the shared-fragment move. (7) Detailed ⊇ concise per FR-005, for a summary and for a fragment. (8) A library file gives `{ ok: false, library: true }` with no diagnostics; a missing file gives `isError` `not-found`. | `mcp-compile.spec.ts`; the snapshots in `mcp-knowledge.spec.ts` |
| SC-005 | project, on the fixture: (1) every FR-021–FR-026 set equals its expected value exactly. (2) `assets.problems` is exactly the seeded `media-file-missing`, `media-from-duplicate` and `timeline-container-not-in-layout`. (3) The storyboard counts are as seeded; for a seeded timeline with an `on enter`, `storyboard.timelineActions` counts only the ranged actions (lifecycle excluded) while the compile summary of the same program reports one more (FR-025, FR-012). (4) Detailed ⊇ concise per FR-005. (5) Directory input (FR-020): a directory with two programs and a library gives two program sections and the library under `files`; a directory with only libraries gives the files and no program section; a directory with no `.eligian` file gives `isError` `not-found`. (6) FR-027: the number of documents in the shared Langium workspace (`LangiumDocuments` of the shared services) is equal before and after a call, and every fixture file's bytes and mtime are unchanged. | `mcp-project.spec.ts` |
| SC-006 | smoke CLI: (1) `smoke.spec.ts` passes with its `json` problem expectations extended by `code` and no other change; the `pretty` and `github` expectations are untouched (FR-031). (2) Every `--format ndjson` line parses, and the line types appear in order. (3) Streaming (FR-030): on a fixture that runs for at least 3 s after its first timeline (a scenario `wait: 3000`), the first `timeline` line arrives while the child is alive (`child.exitCode === null`) and before any `summary` line. The child is then killed, and every line except a possibly unterminated last one parses. (4) Every problem has a code from `SMOKE_CODES`. (5) Every `--format json` problem has a `code` key (FR-032). (6) FR-035: `--timeline A` yields only A's `timeline` line; `--timeline nope` gives one problem and exit 1; `--step-timeout-ms 1` on a slow step gives the step-timeout code. | `smoke.spec.ts`, `mcp-smoke.spec.ts`. Precondition: `pnpm -C packages/cli build` runs before these specs (CI builds first, `ci.yml:59-60`), because the child runs `bin/cli.js`, which imports `dist/cli.mjs`. The spawn-based specs fail, not skip, when `dist/cli.mjs` is missing or older than any file under `src/smoke/` or `src/mcp/`, with a message that names the build command. |
| SC-007 | scenario: (1) Per step kind, a fixture and an assertion on its effect. **click**: an `on click` toggles a class, asserted with `hasClass`. **key**: the asserted `timeline` changes. **navigate**: `timeline` equals the target, and `position` is 0. **seek**: `position` equals s. **wait**: `position` is `greaterThan` the previous step's. **snapshot**: its label is addressable by `after`. Positions are compared within the FR-034 tolerance. (2) A deliberately wrong assertion fails with expected and actual, and exit 1. (3) A class-driven `visible` assertion is evaluated against the injected CSS. (4) A host operation returning `undefined` yields exactly one `host-operation-returned-non-object`, at its call site. (5) Three fixtures, one per scenario-step problem (a selector that matches nothing, an unknown timeline, a step on a media timeline), each give exactly one problem with its `SMOKE_CODES` code, and exit 1. (6) Key target: three fixtures show the fallback order: `in`, then the `KeyboardController` element, then `document`. `visible` is false through a `hidden` attribute and through an ancestor's `display: none`. (7) A pause / `wait: 300` / play fixture passes `position: { sameAs }` after the wait and `position: { greaterThan }` after play. (8) Snapshot shape: `text` is cut at 200 chars, `controllers` lists an attached controller, and `activeTimelineActions` names the running action. (9) `eligian smoke a.eligian b.eligian --scenario s.json` (two program files) runs nothing, prints a usage error naming both files and exits 2; with one program file plus a library it runs (FR-034). | `mcp-scenario.spec.ts` |
| SC-008 | smoke tool: (1) the result matches the CLI's for the same input. (2) `timeoutMs: 10000` on a long fixture with a two-wait scenario returns `partial: true` within 20 s (twice the timeout: spawn, kill and settle took 5 s more under load), holding at least one timeline from the lines read before the kill *(ruling 2026-11-05, T053: under the full suite's load the first `timeline` line arrives after 5 s, so the test's numbers grew; the scenario of two `wait: 9000` steps keeps the child busy past the kill, whatever the load)* *(ruling 2026-11-05, T026: measured from spawn, the child's first `timeline` line arrives after 1.6–2.6 s (compile, jsdom, engine setup), so the schema floor of 1000 ms can never hold a timeline; the 1000 ms floor and FR-042's clock stay as they are, only the test's numbers change)*. (3) A cancelled call kills the child and sends no response frame. (4) Through the `onSpawn` seam (FR-041), in four cases (success, child exit 1, timeout, cancellation): after the call settles, `fs.existsSync(scenarioFile) === false`, and `process.kill(pid, 0)` throws `ESRCH`. (5) The server's stdout stays pure NDJSON during a smoke call. (6) Concise and detailed steps relate as FR-005 states for smoke. (7) FR-046: two calls fired at once on different fixtures report two distinct child pids, and each result equals its sequential baseline, ignoring `header`. (8) FR-044: a child that writes to stderr shows those lines on the server's stderr, each prefixed `smoke: `. (9) A scenario with `paths` resolving to two program files returns `isError` kind `io` naming the files, and `onSpawn` is never called (FR-040). | `mcp-smoke.spec.ts`, `mcp-stdout.spec.ts` (extended). Precondition as in SC-006. |
| SC-009 | review: (1) each of the 6 checks has a positive fixture that produces exactly one warning with that code, at the expected line, and no other diagnostic (each positive fixture provides the media files it does not test), and a negative fixture that produces none. (2) `pnpm run check:examples` exits 0, with no example edits outside the justified cases of FR-051. (3) `init.spec.ts` expects zero diagnostics for the `blank`, `chapters` and `library` starters and exactly one `media-file-missing`, on `./media/intro.mp4`, for the `video` starter (FR-051). Container cases, measured through `checkPaths` + `withCompiledChecks` (`check-command.ts:147`, `:169`) or the CLI, not through `reviewConfig` alone: (4) `in "#ghost"` with a layout, default settings: exactly 1 diagnostic, code `selector_not_in_layout`. (5) `in ".ghostc"` with `--selector-not-in-layout off`: exactly 1 diagnostic, code `timeline-container-not-in-layout`. (6) The same program without a layout import: 0. (7) `entry-timeline-without-enter`: a two-timeline program whose first timeline has no `on enter` gives exactly one warning; the same program with an `on enter` on the first timeline gives none; a single-timeline program without `on enter` (the content of `examples/libraries/nested/chain-test.eligian`) gives none (FR-050). | `review.spec.ts`, `init.spec.ts`, `pnpm run check:examples` |
| SC-010 | listener names: (1) the unknown-names fixture under "SC-010 fixtures" (`["nope", "end:greet2"]`; neither `nope` nor `greet2` is declared) yields exactly 2 diagnostics with the FR-055 code, one at each string, and no other diagnostic. (2) The known-names fixture (`["greet", "end:greet"]`, with `greet` declared) yields 0, which pins the `end:` stripping. (3) The tour stays clean. | a language-package validator spec (FR-055), with the two fixtures committed under the language package's `__fixtures__/` (path: plan); (4) `eligian check` on the unknown-names fixture reports both diagnostics without compiling, and on a copy that also has an unrelated error still reports them; `check:examples`. |
| SC-011 | agents: (1) JSON clients (claude, cursor, vscode): on a fixture whose config holds another server and uses a 4-space indent and CRLF, the parsed result deep-equals the parsed original with only `mcpServers.eligian` / `servers.eligian` set. TOML (codex) and the Markdown blocks (`AGENTS.md`, `.github/copilot-instructions.md`): every byte outside the replaced table or block is unchanged. (2) A second run reports all files `unchanged`, and they are byte-identical. (3) Invalid JSON is refused and left untouched. (4) For each client, the stdout of `mcp --print-config <c>` parses as JSON or TOML, and contains nothing else. With the platform given as `win32`, the npx form of cursor, vscode and codex is `cmd` with `["/c", "npx", "-y", "eligian@^1.1", "mcp"]`, and claude's is plain `npx` (FR-063). (5) `agents setup` exits 0 when every file is written, 1 when an invalid JSON file is refused, and 2 on an unknown client. (6) `--print-config` in a cwd with `node_modules/eligian/bin/cli.js` gives the `node` form with that absolute path; without it, the `npx` form. (7) `eligian_init` with `client: ['cursor']` reports `.cursor/mcp.json`, `.cursor/rules/eligian.mdc` and `AGENTS.md`, each with its FR-061 status. (8) `eligian init` in a directory with no `node_modules` writes the `node` form with the absolute path. `eligian agents setup` follows the FR-063 rule: in a cwd with `node_modules/eligian/bin/cli.js` it writes the `node` form; without it, the `npx` form, with the platform given as `win32` using `cmd` and `["/c", "npx", "-y", "eligian@^1.1", "mcp"]` for cursor, vscode and codex and plain `npx` for claude. | `agents.spec.ts`, `mcp-init.spec.ts` |
| SC-012 | Exit criterion. Manual, on Windows: run `eligian init demo --template chapters --client claude`, then `npm install <packed tarball>` in `demo`, then `claude mcp list` in `demo`; it shows `eligian` connected, and the output is quoted in `compliance.md` *(ruling 2026-11-05, T057: Claude Code 2.1.302 keeps the approval of a project's `.mcp.json` servers in `~/.claude.json`; the demo's entry was written there for the listing and removed after; the line is quoted in `baseline/sc012.txt`)*. Automated: `init` writes a `.mcp.json` pointing at `<abs demo>/node_modules/eligian/bin/cli.js`, and `--no-agents` writes no agent file. | manual; `init.spec.ts` / `agents.spec.ts` |
| SC-013 | knowledge: (1) the 16 chunks exist and meet the FR-035 limits. (2) The probes in `map-*` and `presentation-patterns` compile and match their snapshots. (3) The committed operation ranking equals the script's output, its selection is every counted operation (at most 25; 13 today, ruling T036), and each selected operation has an overlay. (4) Each of the 9 controller overlays has a status, a card of at most 120 words and an `addController` probe that compiles. (5) There is one `generated/examples/<id>.md` per marker. (6) Every new code has an overlay, and the allowlist is not larger than Phase 1's. (7) The no-argument index is ≤ 12,000 chars (chunk entries listed as `{ id, title, kind, card }`, ruling FR-077). (8) The generator exits non-zero on an unclosed marker and on a duplicate example id. (9) Every `example/<id>` named in a `see:` line exists in the index. | `mcp-knowledge.spec.ts` |
| SC-014 | The runtime-claims check covers, by an explicit list, the chunk ids `runtime-engine-lifecycle`, `runtime-scheduling`, `timing-models`, `runtime-quirks` and `runtime-state-pitfalls`; a `runtime-` prefix filter would miss `timing-models`. In each chunk, every teaching unit cites a probe marker; every cited title is in `CLAIMS` of `mcp-runtime-claims.spec.ts`, whose tests pass; and every cited title has its `(probed: "<title>")` marker in `ELIGIUS_EXECUTION_MODEL.md`. This includes the claims mined from eligius' `quirks.spec.ts`, whose markers this phase adds there. | `mcp-runtime-claims.spec.ts`; the reference check in `mcp-knowledge.spec.ts:477-502`, with its runtime list replaced by the explicit list |
| SC-015 | staleness: for the 4 file kinds and the FR-085 tools, every second call is fresh. | `mcp-staleness.spec.ts` |
| SC-016 | Exit criterion: cases 1, 2, 3, 6 and 8 each pass with arm A1 (`tsx evals/mcp/run.ts --case <id> --arm A1`), on the case's pinned Sonnet-class model (FR-090) with no `--model` override. Each result JSON says `pass: true` and records that model id, and the results are committed under `evals/mcp/results/`. At phase exit, one Opus-class run of the same five cases (a pinned Opus-class id passed with `--model`) is committed under `evals/mcp/results/` and quoted in `compliance.md`. It does not gate (decision 9: "one Opus-class run per phase exit"). | the one-case harness; the results are quoted in `compliance.md` |
| SC-017 | concurrency, with the Phase 1 SC-005 metrics: `eligian_check`, `eligian_compile` and `eligian_project`, fired at once on different fixtures through the in-process client, **20** iterations, with the recording `CompilerLock` hooks. **Equality**: every concurrent result deep-equals the sequential baseline of the same call, ignoring `header` and telemetry; mismatches = 0. **Overlap**: in at least one iteration a compile call, and in at least one a project call, has its `onQueued` between another call's `onAcquire` and `onRelease`; held sections never overlap. | `mcp-concurrency.spec.ts` (extended; the "calls wait on the lock" metric, `:242`) |
| SC-018 | `initialize` answers in < 3 s on the packed tarball (Windows locally, Linux in CI); the packed file list is exact; the bundle has no static import of `jsdom` or of the bare `eligius` specifier (`eligius/lint` is allowed; FR-096). | `package-bin.spec.ts` (the static-import test, `:184-194`, extended with bare `eligius`) |
| SC-019 | The AGENTS.md block is ≤ 8,192 bytes (`Buffer.byteLength(agentsMdBlock(), 'utf8')`). Every index id whose kind is neither `operation` nor `example` appears with its title and its path; every `operation/<name>` and `example/<id>` id appears by name in its list; both path patterns appear (FR-066). `compliance.md` quotes the measured size. | `agents.spec.ts` |
| SC-020 | `compliance.md` holds the verification evidence: the FR-056 results per mode, judged against FR-056's definition of "works", with the commands and their output; the FR-057 URLs and date; and the outcome of the two FR-034 [UNVERIFIED] items. | compliance review |
| SC-021 | Full gates: `pnpm build`, `pnpm check` (0/0), `pnpm test` *(ruling 2026-11-05, T053/T054: the three tour-compiling language specs carry an explicit 30 s timeout instead of vitest's 5 s default, which the 1,400-line tour exceeds under the full suite's load; no assertion changed)*, `pnpm -C packages/cli test:coverage:ci` and `pnpm -C packages/language test:coverage:ci` at or above their thresholds, `pnpm effect:check` 0/0, and `check:examples`, `smoke:examples`, `fmt:examples` green. | the commands, each exiting 0 |
| SC-022 | lottie: (1) a program using `addController("LottieController", …)` in a project where `lottie-web` is not resolvable from the program's directory upward gives exactly one coded warning at that call, and no other diagnostic. (2) The same program with `lottie-web` present in the project's `node_modules` gives 0. (3) `packages/cli/package.json` `dependencies` has no `lottie-web`, and the declared-dependencies assertion of `package-bin.spec.ts` is unchanged. (4) The `LottieController` overlay status is `constrained` and names the install. | the spec of the mechanism the plan chooses (FR-056); `package-bin.spec.ts`; `mcp-knowledge.spec.ts` |

### SC-010 fixtures

Both programs share a `layout.html` holding `<div id="stage"><button id="go">Go</button></div>`. The known-names fixture differs only in the action list, which is `["greet", "end:greet"]`. Both were probed in this session (Verification record): `eligian check --max-warnings 0` is clean for both today.

```
layout "./layout.html"

endable action greet [
  selectElement("#go")
] [
  selectElement("#go")
]

timeline "Main" in "#stage" using raf {
  on enter [
    selectElement("#go")
    addController("DOMEventListenerController", "click", ["nope", "end:greet2"])
  ]
  on leave [
    selectElement("#go")
    removeControllerFromElement("DOMEventListenerController")
  ]
}
```

## Edge cases

- **Windows and Linux paths**:
  - `paths.ts` normalises tool inputs with backslashes, drive letters and spaces (Phase 1 FR-007).
  - The smoke child gets an argument array (`shell: false`), so nothing is quoted.
  - The generated agent configs use OS-native separators (FR-060); `agents.spec.ts` checks both forms through `path.win32` and `path.posix`.
  - The storyboard and marker parsers accept CRLF.
- **Shared Langium services**: compile and project run in the lock. Project releases every document it loaded (FR-027). A compile that fails inside the lock still releases its documents, because `parseSourceTracked` releases on error (`parser.ts:110-112`). The locked section stays uninterruptible (Phase 1 FR-009).
- **stdout purity**: the smoke engine never runs in the server process (FR-041, FR-044). `--print-config` writes only the snippet. `agents setup` writes its report to stdout like any CLI command; it does not run under `mcp`.
- **Child process lifetime**: the smoke child bundles a host module with esbuild, whose service process exits when its parent's stdin closes. After a kill, the spec checks that the node child is gone, and the plan checks that no esbuild service is left behind on Windows.
- **Missing files**:
  - a missing entry: `isError` `not-found`;
  - a missing layout, CSS or locales file in `eligian_project`: `exists: false`, plus the language diagnostic in `eligian_check`;
  - a missing scenario file: `isError` `not-found`;
  - a scenario with more than one resolved program file, or a malformed scenario: a usage error (CLI exit 2; the tool returns `isError` with kind `io` and the schema message).
- **Stale caches**: covered by FR-085. The layout scan cache is keyed by content, so an edit changes the key.
- **Cold start**: the three new tool modules import no `jsdom`, no `eligius` engine and no `esbuild` at top level, and `initialize` answers in < 3 s (SC-018).
- **Long smoke runs**: the tour takes ~42 s (§2), and the default `timeoutMs` is 45 s; partial results follow FR-042.
- **Media timelines**: skipped by the walk and by scenarios until Phase 3. A scenario step on a media timeline is a problem, not a crash.
- **A directory with no program**: `eligian_project` on a directory with only libraries returns the files, with no program sections. With no `.eligian` file at all, it returns `not-found`.
- **A STORYBOARD.md with malformed tables**: rows that do not have 6 cells are ignored and counted in `storyboard.ignoredRows`.
- **Concurrent agent setup**: not supported; `agents setup` is a single CLI process.

## Existing components (verified, reused)

| Component | File | What is reused (real signature) |
|---|---|---|
| `compileFile` | `packages/cli/src/compile-file.ts:247` | `(inputPath: string, options?: CompileOptions) => Promise<CompileResult>`; `CompileResult` is `{ config, json, map, assetCount, warnings, host?, program }` (`:55-69`) |
| `compileWithMap` | `packages/language/src/compiler/pipeline.ts:265` | `(source, options?) => Effect<{ config, map, host? }, CompileError>`; used through `compileFile`, not directly |
| `buildEligianMap`, `EligianMap`, `EligianMapAction` | `packages/language/src/compiler/eligian-map.ts:53`, `:44`, `:31` | the map from action ids to `{ name, kind, location, start, end, timelineUri?, duration? }` |
| `locateConfigPath` | `eligian-map.ts:266` | `(map, config, jsonPath: string) => SourceLocation \| undefined` |
| `activeTimelineActions` | `eligian-map.ts:307` | `(map, timelineUri: string, position: number) => EligianMapAction[]` |
| `smokeConfig`, `boundaries`, `SmokeProblem`, `SmokeResult`, `SmokeOptions` | `packages/cli/src/smoke/smoke-runner.ts:75`, `:165`, `:30`, `:49`, `:54` | `(config: IEngineConfiguration, map: EligianMap, options?: SmokeOptions) => Promise<SmokeResult>` |
| `runSmoke`, `smokeFile` (local), `SMOKE_FORMATS` | `packages/cli/src/smoke/smoke-command.ts:41`, `:61`, `:16` | `(patterns, options: SmokeCommandOptions) => Promise<SmokeOutcome>`; `smokeFile(file: string, options: SmokeCommandOptions): Promise<SmokeResult>`, to be exported |
| `smokeWindow`, `loadEligius`, `stubMissingBrowserApis` | `packages/cli/src/smoke/dom-environment.ts:19`, `:36`, `:49` | the shared jsdom window (a dynamic `import('jsdom')`), and eligius loaded after it |
| `loadHostModule`, `registrationsOf` | `packages/cli/src/dev/host-module.ts:21`, `:50` | `(host: HostModule) => Promise<{ registrations: HostRegistrations; missing: string[] }>` |
| `reviewConfig`, `REVIEW_CODES` | `packages/cli/src/check/review.ts:41`, `:28` | `(compiled: Pick<CompileResult,'config'\|'map'\|'program'>, file: string) => CheckDiagnostic[]` |
| `expandPatterns`, `isLibrary`, `withCompiledChecks` | `packages/cli/src/check/check-command.ts:73`, `:52`, `:169` | glob expansion; library detection; lint and review per compiled program (`:187-190`) |
| `runInit`, `titleFromDirectory`, `InitOptions` | `packages/cli/src/init.ts:38`, `:28`, `:14` | `(directory: string, options: InitOptions) => Promise<InitOutcome>`; `InitOptions` is `{ template, title?, force, cwd }` |
| MCP plumbing | `packages/cli/src/mcp/{server,paths,compiler-lock,errors,telemetry,diagnostics,instructions}.ts` | `makeServerLayer`; `projectRoot`, `resolveInputPath`, `resolveInputPatterns`; `CompilerLock` (`run(requestId, section)`); `toMcpDiagnostics(results, overlays, readSource)` (`diagnostics.ts:126`); `INSTRUCTIONS`; `agentsMdBlock()` |
| `selectorNames`, `layoutElementsOf` | `packages/language/src/css/selector-sources.ts:51`, `:38` | `(services, program, documentUri) => SelectorNames` and `=> LayoutElements \| undefined`; via `@eligian/language/mcp` |
| `scanLayoutElements`, `readLayoutHtml` | `packages/language/src/html/layout-elements.ts:21`, `:51` | `(html: string) => LayoutElements`, with `{ ids, classes, scrollableIds, scrollableClasses }` |
| `parameterRoles`, `argumentRole`, `calledAction` | `packages/language/src/css/parameter-roles.ts:63`, `:50`, `:44` | `(action: ActionDefinition) => ReadonlyMap<string, 'selector' \| 'className'>` |
| `EligianDocumentSymbolProvider` | `packages/language/src/lsp/eligian-document-symbol-provider.ts:69-70` | `getSymbols(document: LangiumDocument): DocumentSymbol[]` |
| `hostOperations`, `hostControllers`, `hostFunctions`, `hostSignature` | `packages/language/src/compiler/operations/host-operations.ts:40`, `:44`, `:48`, `:73` | `(context: AstNode \| undefined) => HostOperation[]` (likewise `HostController[]`, `HostFunction[]`); `hostSignature(declaration) => OperationSignature`. The `mcp` entry exports `hostControllers` and `hostFunctions` only; `hostOperations` (and `hostSignature`, if needed) are added by FR-080. |
| `extractTranslationKeys` | `packages/language/src/locales/translation-key-extractor.ts:40` (root export, `index.ts:57`) | `(locales: ILocalesConfiguration) => LabelGroupMetadata[]` |
| `STARTERS`, `starterFiles`, `STARTER_ENTRY` | `packages/language/src/starters/starters.ts:33`, `:79`, `:31` (root exports) | the four starters |
| `getOrCreateServices` | `packages/language/src/compiler/pipeline/services.ts:37` (exported from `@eligian/language/mcp`) | the shared Langium services |
| `releaseWorkspaceDocuments`, `parseSourceTracked` | `packages/language/src/compiler/pipeline/parser.ts:364`, `:102` | `(uris: Iterable<URI>) => void`; `(source, uri?) => Effect<TrackedParse, …>`, with `release()`. Neither is exported from the `mcp` entry today (FR-080). |
| `CONTROLLERS`, `getController` | `completion/metadata/controllers.generated.ts:29`, `:238` (via the `mcp` entry) | the metadata of the 9 controllers |
| knowledge generator | `packages/cli/scripts/generate-knowledge.ts` | `spliceProbes` (`:270`), `withoutIds` / `probeFragment` (`:208-250`), `overlayFiles` (`:332`), `operationChunk` (`:466`), `controllersChunk` (`:554`) |
| interaction action names | `packages/language/src/compiler/transformers/navigate-operations.ts:176`, `:190` | `__nav__<slug>_<hash>` and `__on__<verb>` (for the gate's structural checks) |
| eval harness | `evals/mcp/run.ts`, `evals/mcp/gate.ts` | the per-case run; gate steps 1–5 (today step 3 runs smoke without a scenario, `gate.ts:539-542`) |

## New components

| Module | Package | File | Public API sketch |
|---|---|---|---|
| compile tool | cli | `src/mcp/tools/compile.ts` | `NAME`, `KEYWORDS`, `DESCRIPTION`, `Parameters`, `Success`, `makeTool(ai)`, `summarizeArgs`, `handle(params, ctx): Effect<CompileSuccess, ToolError, CompilerLock>` |
| project tool | cli | `src/mcp/tools/project.ts` | the same shape; `handle(...): Effect<ProjectSuccess, ToolError, CompilerLock>` |
| smoke tool | cli | `src/mcp/tools/smoke.ts` | the same shape; `handle(...): Effect<SmokeSuccess, ToolError>`; `cliPath` and `onSpawn` options for the specs (FR-041) |
| config fragment | cli | `src/mcp/config-fragment.ts` (name: plan) | `withoutIds(value)`, `fragmentOf(config, select)`; shared with the generator |
| asset and container checks | cli | `src/check/review.ts`, or a sibling module | the six check functions, used by `reviewConfig` and by `eligian_project` |
| storyboard reader | cli | `src/mcp/storyboard.ts` (name: plan) | `readStoryboard(text) => { beats: {timeline, start, end, …}[], interactions: …[], ignoredRows }` |
| scenario runner | cli | `src/smoke/scenario.ts` | `Scenario`, `ScenarioStep`, `Assertion` (Effect `Schema`); `parseScenario(json)`; `runScenario(config, map, scenario, options) => Promise<{ steps, problems }>` |
| ndjson and `smokeFile` | cli | `src/smoke/smoke-command.ts` | `SmokeFormat` gains `'ndjson'`; `export smokeFile`; `SMOKE_CODES` (here or in `smoke-runner.ts`) |
| agents | cli | `src/agents.ts` | `AgentClient = 'claude'\|'cursor'\|'vscode'\|'codex'`; `agentFiles(projectDir, clients, form)`; `mergeAgentFile(existing, generated, kind) => { content, status }`; `setupAgents(dir, clients) => Promise<{ files: {path, status}[] }>`; `printConfig(client, cwd, platform = process.platform) => string` |
| CLI commands | cli | `src/main.ts` | `agents setup [dir] --client …`; `mcp --print-config <client>`; `init --client … --no-agents`; `smoke --format ndjson --scenario <f> --timeline <n> --step-timeout-ms <n>` |
| operation ranking | cli | `scripts/rank-operations.ts` + a committed JSON file | `pnpm -C packages/cli rank:operations` |
| curriculum | cli | `src/mcp/knowledge/curriculum/`: the 16 chunks, `operations/*.md` (×25), `controllers/*.md` (×9), `diagnostics/<new codes>.md` | markdown with frontmatter |
| specs | cli | `src/__tests__/{mcp-compile,mcp-project,mcp-smoke,mcp-scenario,agents,mcp-staleness}.spec.ts`, with fixtures | — |
| eval cases | repo | `evals/mcp/cases/{title-card,three-chapters,staggered-list,keyboard-deck,library-reuse}.json`, with scenario files | case JSON + `scenario` |

## Interpretations (roadmap tensions resolved here)

- **I-1 (`explain` in the final instructions)**: §3.5's final text says "`eligian_compile`: once after your first timeline passes check (select it, explain:true)", and so do the next steps of `eligian_init` in §4. But §4 makes `explain` Phase 3. Phase 2 therefore ships the final text without "explain:true" in that line, and without it in `eligian_init`'s next steps. Phase 3 adds it back together with `explain`.
- **I-2**: ruled by the user (Q1): the `video` starter keeps exactly one `media-file-missing` warning (FR-051).
- **I-3 (the host-operation exemption)**: a host operation cannot declare NEEDS (`hostSignature` gives `dependencies: []`), so the check cannot know whether it reads `selectedElement`. A declared parameter named `selector` marks an operation that selects on its own, such as the tour's `stampTime(selector: string)`; such an operation is exempt.
- **I-4 (the container-check overlap)**: under the default `ids`, `selector_not_in_layout` already reports an id container that is missing from the layout (see the probe in the Verification record). `timeline-container-not-in-layout` adds class containers and the `off` mode, and is suppressed where `selector_not_in_layout` reports the same range in the same run. The suppression happens where review and validator diagnostics are merged (FR-050), and SC-009(4)–(6) measure it.
- **I-5 (assertions and id contracts)**:
  - §6.2 cases 1 and 2 assert engine state: "engine paused (no position change after wait 300)" and "active timeline Problem". §4's assertion list (`hasClass | notHasClass | text | visible | controllers`) cannot express these, so `timeline` and `position` assertions are added. Their shape is in FR-034 item 7, including the relative `position` forms; SC-007(7) measures them.
  - The §6.2 prompts do not name the ids that the scenarios select (`#headline`, `#pause`, `#to-problem`, …). Each case prompt appends them, so that a correct solution can match.
- **I-6 (CLI flags for the tool)**: §4 gives the tool `timelines` and `stepTimeoutMs`, and §2 has the tool spawn the CLI. The CLI therefore gains `--timeline` and `--step-timeout-ms`.
- **I-7 (structural checks)**: the assertion library `packages/cli/src/mcp/evals/assert.ts` is Phase 3 (§7 Phase 3 Touches). Phase 2 checks each case's §6.2 Structural column with inline code in `gate.ts`, as Phase 1 did for cases 13 and 14. The generic §6.1 step-4 assertions stay in Phase 3.
- **I-8 (CLI `init` writes agent files)**: §2 says the agent files are "Written by `eligian init` (new projects)", and §7 gives `init.ts` the flags `--client` and `--no-agents`. Today only the tool writes them. From Phase 2 on, the CLI `init` writes them by default.
- **I-9 ("25 most-used operations")**: the roadmap does not define "most-used". The ranking counts the source call sites that resolve to registry operations: not action calls, not host operations. The corpus is:
  - the `check:examples` corpus (the root `package.json:25` globs, so without `examples/demo.eligian`);
  - the `starterFiles` of the four starters.

  Ties are broken by name, and the top 25 are selected. Like Phase 1 FR-055, it is reproducible.
- **I-10 (the scenario engine)**: the scenario runs on a fresh engine after the boundary walk (FR-034), so the walk's seeks do not leak state into the scenario, and the scenario starts the way the bundle starts a presentation.

## Review notes

All review issues were applied; none was rejected. Where an issue offered alternatives, this revision chose:
- **smoke `json` gains `code`** (FR-031, FR-032), so the eval gate keeps reading `--format json`. Only the `json` problem expectations of `smoke.spec.ts` change, by that key.
- **Spawn-based specs need a fresh build** and fail when it is missing or stale (SC-006 precondition), rather than running the source through a TypeScript loader. The tool spawns `bin/cli.js`, which imports `dist/cli.mjs`, so the build is what ships.
- **The three unassigned generated chunks** go to the roadmap's Phase 3 Touches (FR-099); this phase does not build them.
- **Quirks-derived runtime claims** get their `(probed: …)` marker in `ELIGIUS_EXECUTION_MODEL.md`, so that one rule covers every runtime chunk (SC-014).
- **The `see:` → `example/<id>` rule** is a drift check only (FR-075): no chunk is forced to cite an example.
- **The `video` starter** keeps one `media-file-missing` warning (Q1, FR-051).
- **The AGENTS.md index** names operations and examples by name only (FR-066). The 8,192-byte cap and the coverage of every id are kept; the roadmap (§5) asks for an index that points at the chunk files, not for a titled line per id.

## Clarifications

### Session 2026-11-05

- Q1: The `video` starter writes `using video from "./media/intro.mp4"` but no media file; how does it stay with `media-file-missing`? Decision: accept the warning. `init.spec.ts` expects exactly one `media-file-missing` for `video` (the other three starters stay at zero); root `AGENTS.md` and the starter note say so; no placeholder media bytes, no suppression mechanism. [FR-051, SC-009]
- Q2: What is the firing rule of `entry-timeline-without-enter`? Decision: it fires only when the program declares two or more timelines; single-timeline programs such as `examples/libraries/nested/chain-test.eligian` stay clean. [FR-050, FR-051, SC-009]
- Q3: What form does the listener-action-name check take? Decision: a language validator, with a code in `validators/codes.ts`, an IDE squiggle, reported by `check` without compiling; the language coverage gate applies; the SC-010 fixtures live in the language package. [FR-055, FR-080, FR-098, SC-010]
- Q4: What happens with `LottieController` under `--bundle` / `dev` / `smoke`? Decision: a coded warning (with an overlay) only when `lottie-web` cannot be resolved from the project's own `node_modules`; the user installs it; no CLI dependency; the `LottieController` status stays `constrained` until resolvable. [FR-056, FR-074, FR-076, SC-022]
- Q5: What does a scenario do with more than one resolved program file? Decision: refuse; it is a usage error (CLI exit 2; tool `isError` kind `io`); the output shape stays flat. [FR-034, FR-040, FR-045, SC-007, SC-008]
- Q6: What does `storyboard.timelineActions` count? Decision: only ranged timeline actions (with an `end`), lifecycle excluded; the compile summary keeps the raw count of the config. [FR-025, FR-012, SC-004, SC-005]
- Q7: What do `init` and `agents setup` write when the local install is absent? Decision: `init` (CLI and tool) always writes the `node` form, since the starter's `package.json` depends on `eligian`; `agents setup` uses the `--print-config` rule (`node` form when `node_modules/eligian/bin/cli.js` exists under the cwd, else the `npx` form, with `cmd /c` on win32 for cursor, vscode and codex). [FR-060, FR-062, FR-064, FR-065, SC-011]
- T006 (build stage, 2026-11-05): no program on disk validates clean yet is rejected by `compileFile` with `AssetError` (the validator reports asset errors first). Decision: (b) test the release on the reachable rejection: fixture `compile-rejected/` (library import + schema-invalid `locales.json`), B1 asserts `CompilationError` and an unchanged document count; the "validates clean but rejects" compile case is dropped; the `no-compile/` project sibling takes the same shape. [SC-004, SC-005]
- OQ-1 (build stage, 2026-11-05): `host-operation-in-block-without-select` does not check named-action bodies; see the FR-050 ruling. [FR-050, SC-009]
- T034 (build stage, 2026-11-05): T034 deleted `CONTROLLER_STATUS` while `generate-knowledge.ts` (not in its file list) still imported it; the parallel T035 rewrote the generator to read statuses from the controller overlays, which resolved it: no reference remains, `tsc -p tsconfig.test.json` clean, `mcp-docs.spec.ts` 11/11. No ruling needed beyond this note. [FR-074]
- T036 (build stage, 2026-11-05): the I-9 corpus uses 13 distinct registry operations, so a 25-element selection cannot exist. Decision: (b) the selection is every counted operation, capped at 25; FR-073 and SC-013(3) amended; `operation-ranking.json` and the `mcp-knowledge.spec.ts` ranking test were written in the main loop; T039 writes overlays for the 13. [FR-073, SC-013]
- Diagnostic ranking (build stage, 2026-11-05): no Phase 2 task regenerates `scripts/diagnostic-code-ranking.json`, and the new codes and fixtures change it (62 codes now). Regenerated in the main loop with `rank:diagnostic-codes`: entered `entry-timeline-without-enter`, `locales-import-error`, `unknown-listener-action`, `media-file-missing`, `media-timeline-first-without-start-gesture`, `timeline-container-not-in-layout`; left `unknown-action-in-timeline-event`, `break-outside-loop`, `continue-outside-loop`, `css-import-error`, `eligius-W151`, `event-end-not-after-start`; `caseCodes` unchanged. The overlay tasks cover the new selection; `locales-import-error` (an older code that entered through the `compile-rejected/` fixture) got its overlay in the main loop. The overlays of the codes that left stay (they are still real codes). [FR-076, SC-013]
- Compliance (2026-11-05), FR-022: `extractLanguageCodes` is not used for `locales.languages` (its `en-US` fallback would report an undeclared language); the row names the block's codes, `[]` without a block. [FR-022]
- Compliance (2026-11-05), FR-056 / FR-074: the Lottie probe failed in every mode because the overlay taught `addController("LottieController", url)` and the engine needs the JSON (D-L1). Decision: the overlay teaches `loadJson` + `addController` and names the two CLI limits (D-L2: the JSON is not bundled or served; D-L3: `smoke` cannot load `lottie-web` under jsdom); D-L2 / D-L3 go to the roadmap's Phase 3 as deferred defects; the measured per-mode record stands in `compliance.md`. [FR-056, FR-074]
- Compliance (2026-11-05), SC-016: `three-chapters` failed its scenario on both models because both localized the hub buttons (a LabelController beside the listener, which the exact `controllers` assertion rejects) and ran over the 80,000-char tool budget; `staggered-list` passed its scenario on both models but with six `at` events, never `stagger` (the cheatsheet listed the rule without saying when to use it). Decision: the prompt says the buttons keep fixed English text (the scenario stays); the generated cheatsheet gains a "Timeline constructs by intent" table (at, stagger, sequence, on enter / leave, on click / key, with) and its card names them; the two cases are re-run on the pinned Sonnet model and once on Opus. [SC-016, FR-077]
- Compliance (2026-11-05), FR-013: event actions carried no `source` (the transformer stripped their locations and `ast-transformer` passed an empty list to `buildSourceMap`), so a line inside one gave not-found. Fixed: `transformEventAction` returns an `EventActionIR`, `stripEventActionSourceLocation` produces the Eligius config, the map lists event actions with their location; `mcp-compile.spec.ts` pins the source and the line selection. [FR-013]
- Compliance (2026-11-05), T032: `eligian_compile` with `view: 'full'` (and a fragment with `includeMap`) answered JSON-RPC -32603 over the wire after a successful handler: the config carries `undefined` properties, which the result schema rejects as a defect. Fixed: the full and fragment views return plain JSON (`asJson`); a wire test through the in-memory server covers both. [FR-014]
- T057 (build stage, 2026-11-05): `claude mcp list` showed the demo's `eligian` server as "Pending approval"; approving it is interactive. Decision: (b) the approval was written where Claude Code keeps it (`~/.claude.json`, `projects["<demo>"].enabledMcpjsonServers`; a `demo/.claude/settings.local.json` entry did not count), the listing shows "✔ Connected", the entry was removed again, demo and tarball deleted. [SC-012]
- T053 / T054 (build stage, 2026-11-05): `pnpm test` and both coverage runs failed only on load-sensitive timeouts: the tour-compiling language specs (`examples-compile`, `time-resolver`, `tour-controllers`) at vitest's 5 s default (5.3–5.6 s under the full suite, 2.5 s alone) and `mcp-smoke`'s timeout case, whose timeline line arrived after its 5 s timeout under load. Not a Phase 2 regression (HEAD measured the same). Decision: (a) explicit 30 s timeouts on the three tour tests; the smoke timeout case uses `timeoutMs: 10000`, a 20 s bound (twice the timeout) and a scenario of two `wait: 9000` steps so the child is still busy at the kill. No assertion changed. All edits in the main loop. [SC-008, SC-021]
- T045 (build stage, 2026-11-05): the index breached the 12,000-char budget again (13,573) once the runtime chunks and the example entries landed. Decision: (b) the no-argument index no longer lists operation entries; `operations: { count, see }` points at `eligian_operations`; the bound stays. `docs.ts` and `mcp-docs.spec.ts` amended in the main loop. [FR-077, SC-013]
- Group 14 gate (build stage, 2026-11-05): the docs index cannot hold the new chunks under the 12,000-char budget with the Phase 1 listing rule (16,022 measured). Decision: (a) index entries of chunks carry `id`, `title`, `kind`, `card` only; `use_cases`, `words`, `see` move to detail; the bound stays. [FR-077, SC-013]
- T026 (build stage, 2026-11-05): SC-008(2) asked for a timeline within a 1000 ms timeout, which the child cannot deliver (first `timeline` line at 1.6–2.6 s). Decision: (a) the test uses `timeoutMs: 5000` on the long fixture, partial within 7 s, ≥ 1 timeline; the floor and FR-042 stay; the test was amended in the main loop and passes (12/12). [SC-008, FR-042]
- T015 (build stage, 2026-11-05): the validation-rejection path already releases its documents; only the unreachable `AssetError` branch leaks. Decision: drop plan P2 / B1 (no change to `compileFile`); keep the two release tests as a green regression guard; the `compile-rejected/` fixture was committed in the main loop (its probe lines are appended to `BASE/asset-rejected-probe.txt`). [SC-004]
- Q8: How are the sizes of `eligian_project` and `eligian_smoke` results bounded? Decision: `Tool.Meta({ "anthropic/maxResultSizeChars": 200000 })` on `eligian_project` and `eligian_smoke` as well as `eligian_compile`; no truncation logic. [FR-002, SC-002]
