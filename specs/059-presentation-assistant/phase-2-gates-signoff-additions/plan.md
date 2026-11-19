# Implementation Plan: presentation assistant, Phase 2: gates, sign-off, additions, adoption

**Branch**: `spec/059-presentation-assistant` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/059-presentation-assistant/phase-2-gates-signoff-additions/spec.md` (reviewed; clarifications Q1–Q7, R-2, R-7, R-11, R-12, R-13 encoded), roadmap §4.1–§4.5, §5, §8 Phase 2, §9 decisions; `spikes.md` §1, §2, §4.2, §5; Phase 1 (`phase-1-brief-engine/`, compliance COMPLETE).

Every signature below was read this session on the tree at `19abdea` (`packages/cli/src` is byte-identical to `5e47ea9`: `git diff --quiet 5e47ea9 -- packages/cli/src` exits 0). Sources: typegraph `ts_module_exports` on `mcp/brief/engine.ts`, `mcp/brief/brief-file.ts`, `mcp/errors.ts`, `packages/language/src/mcp.ts`; `ts_navigate_to` on `withLoadedDocuments`, `hostModuleOf`; Read/Grep for the rest, cited `file:line`. effect facts come from `node_modules/.pnpm/effect@4.1.4/node_modules/effect/dist/ai/{McpServer,McpSchema}.{d.ts,js}` and `dist/Schema.d.ts`. One probe ran in Bash (tsx, Node 24.7) and is not committed; its output is quoted where it is used. `cli/` means `packages/cli/src/`.

## Summary

Phase 2 adds four modules under `cli/mcp/brief/` and threads them through the existing tools:

- `known-programs.ts`: the string-aware text scan, `.eligian/programs.json` (parse, write, merge), the per-server record store with its first-run scan, and the record the CLI's `eligian init` writes.
- `gate.ts`: the pure verdict (`gateVerdict`, the FR-012 matrix plus the FR-032/FR-033 triggers), the Effect the five generation tools call before anything else (`checkPrograms`), the shared brief status (`eligian_project`, telemetry) and the CLI warning lines.
- `signature.ts`: the state directory, the key, the HMAC lines, the sign-off ticket, `verifyBrief` and the disk-only `verifyBriefFile`.
- `adopt.ts`: the code facts of a program, read under the compiler lock, and the conflict rules.

Phase 1's engine, file and tool are extended (the `approved` state, `by: code`, signed lines, addition sections, the widened S2 rule), `eligian_brief` gains `approve-storyboard`, `accept-existing`, `scope`, `paths` and `ticket`, and the declared tool failure gains the kind `gate`.

The design is reuse-first:

- **paths and roots**: `projectRoot(ai, cwd): Effect<ProjectRoot>` (`mcp/paths.ts:63`), `isInside(root, file)` (`:81`), `resolveInputPath` (`:93`), `resolveInputPatterns` (`:106`). The client-capability read uses the same `Effect.serviceOption(ai.McpSchema.McpServerClient)` as `projectRoot` (`paths.ts:65–68`).
- **atomic writes**: `writeFileAtomic(target, text, options?: { beforeRename?: () => Promise<boolean> }): Promise<'written' | 'aborted'>` (`cli/atomic-write.ts:39`) for `programs.json` and `BRIEF.md`, with the changed-file check of Phase 1's `writeBriefFile` (`tools/brief.ts:295–318`).
- **`.eligian/`**: `ensureEligianDir(root): Promise<string>` (`cli/dev/runtime-reports.ts:228`, imports only `node:fs/promises`, `node:path` and `../atomic-write.js`, `:8–10`).
- **globbing and library detection**: `expandPatterns(patterns, cwd): Promise<string[]>` and `isLibrary(source)` (`cli/check/check-command.ts:73`, `:52`), moved unchanged into `cli/check/files.ts` (FR-002).
- **the brief engine**: `evaluate(tree, brief, facts): Evaluation` (`engine.ts:405`), `applyAnswers(tree, brief, facts, input, round)` (`:814`), `confirm(brief, message, now, evaluation)` (`:930`), `pickRound(tree, evaluation, max?)` (`:997`), `nextRound(brief)` (`:1028`), `digest(answers)` (`:1040`), `EMPTY_BRIEF` (`:161`); `parseBrief(text, tree?)` and `writeBrief(tree, parsed, facts)` (`brief-file.ts:393`, `:519`).
- **per-key locks**: `makeBriefLocks()` (`tools/brief.ts:175`, `Semaphore.makeUnsafe(1)` per lower-cased key on win32) and Phase 1's P18 rule (wait interruptibly, run the acquired section `Effect.uninterruptible`, `tools/brief.ts:396–398`).
- **elicitation**: `ai.McpServer.elicit({ message, schema }): Effect<S["Type"], ElicitationDeclined, McpServerClient | …>` (`ai/McpServer.d.ts:1296`) bounded with `Effect.timeoutOption` as the spike does (`spikes/brief-spike-server.ts:77–83`).
- **program facts**: `withLoadedDocuments(files, use, onUnreadable?)` (`language/src/compiler/pipeline/check.ts:182`, re-exported at `compiler/index.ts:91`), `hostModuleOf(program): HostModule | undefined` (`compiler/operations/host-operations.ts:115`), both from the `@eligian/language` root as `project.ts:20–30` imports them; `timelineNames(program): string[]`, `timelineNamed(program, name): Timeline | undefined`, `navigatesTo(program, name): InteractionStatement[]`, `calledAction(call): ActionDefinition | undefined` from `@eligian/language/mcp` (typegraph `ts_module_exports` on `mcp.ts`: lines 24, 60, 57, 47); `compileFile(inputPath, options?): Promise<CompileResult>` (`cli/compile-file.ts:247`; `CompileResult` has `config`, `program`, `host?`, `:56–72`).
- **the storyboard reader**: `readStoryboard(text): Storyboard` and `cellsOf(row)` (`mcp/storyboard.ts:66`, `:42`).
- **tests**: `startInMemoryServer(options)` and `spawnServer(options?)` (`__tests__/mcp-test-client.ts:123`, `:264`), `compilerLockLayer(hooks, options?)` (`mcp/compiler-lock.ts:129`) with `onQueued` as the lock counter, `SmokeToolOptions { cliPath?; onSpawn? }` (`tools/smoke.ts:51–56`), the roots client `__fixtures__/mcp/roots-client.mjs` (`mcp-paths.spec.ts:234`).

Phase 2 adds no runtime dependency, no Effect `Context.Service` (the record store is a per-server closure like `briefLocks`, `server.ts:84`) and no language-package change.

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo), repo `lib` ES2020 (no `Array#at`). The CLI is one ESM bundle, `dist/cli.mjs` (`packages/cli/esbuild.mjs:113–135`); `@eligian/*` imports are inlined from source by the `workspace-sources` plugin (`:33–53`); only `package.json` `dependencies` stay external. |
| Runtime deps | Unchanged (`packages/cli/package.json:59–68`). `node:crypto` (`createHmac`, `createHash`, `randomBytes`) and `node:os` (`homedir`) are built-ins. |
| Effect APIs used | `Effect.serviceOption`, `Effect.timeoutOption` (as `paths.ts:51`), `Effect.exit`, `Cause.hasInterruptsOnly` (as `server.ts:235`), `Effect.uninterruptible`, `Semaphore.makeUnsafe(1)` + `withPermits(1)`, `Data.TaggedError`, `Effect.forkScoped` (`Effect.d.ts:17216`), `Effect.addFinalizer` (`:12852`), `Effect.promise` (`:1217`), `Layer.effectDiscard` (`Layer.d.ts:1318`), `Effect.catchDefect` (`Effect.d.ts:5362`) with `Schema.isSchemaError` (`Schema.d.ts:1032`), `Schema.Struct` / `Schema.optionalKey` / `Schema.Literals` / `Schema.Union(members: ReadonlyArray)` (`Schema.d.ts:4173`) / `Schema.NullOr`. `ai.McpServer.elicit` (`@stability unstable`; the `// @effect-diagnostics unstableApiUsage:off` header, as `tools/brief.ts:19`). |
| Testing | Vitest projects `cli`, `cli-timed`, `cli-bin`, `cli-soak` (`packages/cli/vitest.config.ts:33–56`); `maxWorkers: 8`. CLI specs resolve `@eligian/language` to its built bundle. |
| Platforms | Windows 11 (Node 24.7, the local gate) and `ubuntu-latest` (CI); engines floor Node 22.12. |
| Performance | `initialize` < 3 s with the scan in the background (`package-bin.spec.ts:149`, SC-015). A gated call adds one record read, one text scan per matched program, one `BRIEF.md` read and parse per directory and one key read: no Langium, no lock. |
| Constraints | stdout carries protocol frames only (the elicitation request is a protocol frame). `pnpm effect:check:cli` 0/0/0. CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`vitest.config.ts:60–63`); language coverage untouched (no language source changes). |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. Four modules from the roadmap's list, plus three small ones that each remove a coupling (`check/files.ts` FR-002, `brief/facts.ts` P3, `brief/wire.ts` P5) and one check module (`brief/storyboard-check.ts`, P8). No service, no dependency. |
| II / V / XX / XXV Testing, TDD | Pass. Every FR/SC maps to a named spec below, written red first. `specs/TESTING_GUIDE.md` templates are language-package templates; no language test is added (the language package is not changed). |
| III / XVII Effect | Pass. Every new failure is a tagged error: `ToolGateRefused` (`Data.TaggedError`), the existing `ToolIoError` / `ToolNotFound`. Plain helpers that catch live outside `Effect.gen` (Effect LSP `tryCatchInEffectGen`). |
| IV Clear errors | Pass. Every refusal carries a code, the program, the brief and the next round or the problem list. |
| VI / VII Immutability | Pass. `BriefState` and the record are replaced, never mutated. |
| VIII pnpm | Pass. |
| IX Langium | Pass. Only adoption loads a program, through `withLoadedDocuments` under the compiler lock (FR-044). |
| XII No premature docs | Pass. `packages/cli/AGENTS.md` only (its brief line would otherwise be incomplete). README, CHANGELOG, instructions, prompts and chunks are Phase 3 (spec non-goals). |
| XIV Windows paths | Pass. Record paths are root-relative with `/`; comparisons go through `isInside`'s rule (lower-cased on win32, `paths.ts:77–78`). |
| XV / XVI | Pass. No research-tree import; no edit under `generated/`. |
| XXII Sed safety | Pass. Edits by string match only. |

No violations, so no Complexity tracking table.

## Corrections and plan-level readings (found while planning)

Each is recorded in `compliance.md` at build time. Those that touch an FR's wording are proposed for that row (Review notes).

- **P1. The brief modules stop importing `@eligian/language`.** `brief/references.ts:10` imports `isValidLanguageCode` from `@eligian/language`, and `engine.ts:24` imports `references.ts`. So `gate.ts` (which needs `evaluate`) and with it the CLI warning path would load the language package, against FR-002 ("the CLI warning path … never from `@eligian/language`") and FR-025's disk-only `verifyBriefFile`. `references.ts` gets a local `const LANGUAGE_CODE = /^[a-z]{2,3}-[A-Z]{2,3}$/` (the language's `LANGUAGE_CODE_REGEX`, `language/src/compiler/constants.ts:34`, which `isValidLanguageCode` tests, `eligian-validator.ts:50–52`). A drift test asserts the two agree on a sample set (`brief-known-programs.spec.ts` › `purity`). After P1 and P2, `engine`, `values`, `references`, `tree`, `brief-file`, `facts`, `gate`, `signature`, `known-programs`, `storyboard`, `paths`, `errors` and `check/files.ts` reach no `@eligian/language` import; `adopt.ts` is the only brief module that does. The SC-003 grep test walks the relative imports of `gate.ts`, `signature.ts`, `known-programs.ts` and `check/files.ts` transitively.
- **P2. `mcp/paths.ts` imports `expandPatterns` from `../check/files.js`.** Today it imports `../check/check-command.js` (`paths.ts:16`), which loads `@eligian/language` (`check-command.ts:14–19`). FR-002 keeps "its six importers unchanged" through the re-export; this one import line changes so that `isInside` (needed by the gate and the CLI warning) loads no language code. Behaviour is identical (same function).
- **P3. `makeFacts` moves to `brief/facts.ts`.** It is today in `tools/brief.ts:242–251` with its `memoize` (`:222–236`). The gate, the CLI warning and `eligian_project` need it, and `tools/brief.ts` will import `gate.ts`, so keeping it in the tool would make a cycle. `tools/brief.ts` re-exports it (`export { makeFacts } from '../brief/facts.js'`), so `brief-tool.spec.ts`, `mcp-brief-interview.spec.ts` and `mcp-brief-restart.spec.ts` (its three importers, Grep) are unchanged.
- **P4. The HMAC enters the engine as a closure.** `evaluate` decides `confirmed` today by comparing `brief.confirmation.digest` with the evaluation's digest (`engine.ts:696–701`, and the P11 two-pass at `:405–411`, `:419–431`). Phase 2 needs the key for that comparison, and the engine must stay pure (no fs). `Facts` gains `readonly signer?: Signer` (`sign(payload: SignaturePayload): string`, built by `signature.ts` over the key; absent when there is no key, so nothing verifies). The two-pass rule stays: pass 1 keeps the recorded tree version when the confirmation's HMAC verifies over pass 1's canonical answers.
- **P5. The wire schemas move to `brief/wire.ts`.** `ColumnSchema`, `ShapeSchema`, `RoundItemSchema` (`tools/brief.ts:94–122`) move there, with the new `GateRefusalSchema`. `errors.ts` imports `GateRefusalSchema` from it for `ToolFailure.error.gate`; importing `tools/brief.ts` from `errors.ts` would be a cycle. The failure schema is not in `tools/list` (the snapshot has no failure kinds: Grep `not-found` in `tools-list-phase3.json.snap` gives 0), so SC-019 is unaffected.
- **P6. Two elicitation edge cases the spec does not name.** From `ai/McpServer.js:2613–2638`:
  - an `accept` whose content does not decode is `Effect.orDie` (`:2630`), a defect. The sign-off catches defects of the `elicit` effect alone (`Effect.catchDefect` around it, not around the handler) and classifies one as `declined` only when it is a `Schema.SchemaError` (`Schema.isSchemaError`, `Schema.d.ts:1032`): the box was not ticked, so it is FR-020's "accepted with the boolean `false`". The same `elicit` also dies on a decode of its own request parameters (`Schema.decodeUnknownEffect(McpSchema.ElicitRequestFormParams)(…).pipe(Effect.orDie)`, `:2619–2623`), which is a `SchemaError` too and would be a server bug, not a user's answer. That case is shut out by test instead of by classification: `brief-signoff.spec.ts` › `the form` asserts one `elicitation/create` frame for each of the three forms (`confirmed`, `approved`, `accepted`), so a form that does not encode to valid request parameters fails there and can never reach a user. Every caught `SchemaError` is logged first (`Effect.logError('eligian mcp: elicitation answer did not decode', defect)`, the stderr logger), so a declined-by-defect is visible. Any other defect (from `getClient`, the client, or anything not a `SchemaError`) is re-raised with `Effect.die(defect)` and reaches `catchDefects` (`errors.ts:91`) as `internal`, as every other defect of the server does.
  - a request the client answers with a JSON-RPC error becomes `ElicitationDeclined` **with** a `cause` (`:2624–2627`); a user's decline has none (`:2634–2636`). The first is classified `cancelled` (no one answered; FR-020's fallback with a ticket applies), the second `declined`. Without this, a client that errors on every elicitation would be stuck at `declined` with no fallback. Proposed for the FR-020 row.
- **P7. A cancel is captured by `Effect.exit`.** effect/ai implements cancel as `Effect.interrupt` (`McpServer.js:2631–2632`). Probe (tsx): `Effect.exit(Effect.scoped(Effect.interrupt).pipe(Effect.timeoutOption('1 second')))` followed by `Effect.sleep('10 millis')` printed `after: interrupt-only`. So the self-interrupt arrives as an exit with `Cause.hasInterruptsOnly` and the handler continues; a client's `notifications/cancelled` still interrupts the handler fiber from outside (Phase 1 risk 2a), which `Effect.exit` does not stop.
- **P8. `checkStoryboard` lives in `brief/storyboard-check.ts`.** The spec's component table puts it in `storyboard.ts`. `values.ts:14` imports `storyboard.ts`, and the check needs the engine's `Evaluation`; keeping `storyboard.ts` free of brief imports keeps it the plain spec 058 reader (`project.ts:49` uses it) with only the FR-030 fields added.
- **P9. `eligian init`'s record write is opt-in in `runInit`.** `runInit` (`cli/init.ts:49`) is shared by the CLI action (`main.ts:496`, the action at `:490`) and `eligian_init` (`tools/init.ts:111`). `InitOptions` gains `readonly firstRecord?: boolean`; only the CLI action passes `true`. `eligian_init` never writes a first record (its record write is FR-061). The write is `writeFirstRecord(dir, exclude)` in `known-programs.ts`. `init.ts` already imports `@eligian/language` for the starters (`init.ts:16`), so SC-022's "init.ts imports nothing from `@eligian/language` for the record" is checked on the record code: `known-programs.ts` and `check/files.ts` (P1's transitive walk).
- **P10. The first-run write never merges.** FR-007's merge applies to record updates. The first-run write (FR-003, FR-004) writes only when no record exists at rename time (its `beforeRename` re-reads and aborts when a file appeared); on abort, the other writer's record is the project's first record and is read as such. Merging the scan into a record another process made would accept programs written after that record (§9 risk 3).
- **P11. Addition interviews reuse the engine through a fixed view list.** `Facts` gains `readonly views?: readonly string[]`: when set, branch V expands over exactly those names instead of S2's (`engine.ts:442`, `:614`). `scopedTree(addition, context)` returns the FR-036 questions: V1–V6 as templates (needs `['S6']`), S4/S5/S6/D5 reshaped (S4 a table whose rows must name the view as `view` or `target`; S5, S6, D5 records with the view column removed), I4, A1–A6, L2 (record `supplier`, `when`), L3–L5, H1 (with a check that refuses `none`), H2, H3. Each applies-when that reads an id outside the scope reads it from `context` (the main brief's settled answers and the code facts) and applies when it finds nothing (R-8). The engine's asset list reads S6 as a table or a record. Instance ids are therefore `V1:Outro` … for the view and `S6`, `L2`, `H1` inside their section; the section heading disambiguates.
- **P12. `by: code` answers are settled facts.** `By` (`engine.ts:37`) gains `'code'`. They are written only by adoption (FR-042), never through `applyAnswers` (which rejects their ids with the new reason `fact`, FR-045). The engine counts an applicable `by: code` instance as answered without its prerequisites being answered (a fact needs no decision before it), never marks it stale by round, and keeps a non-applicable one dormant (it still feeds the conflict rules). They are in the canonical answer list, so a re-read that changes a fact invalidates a confirmation, as FR-044 intends.
- **P13. Telemetry gets the brief state by a per-call note.** `withTelemetry` sees only the exit (`telemetry.ts:131–170`); a successful `eligian_check` carries no brief state. `Telemetry` gains `noteBrief(requestId: string, brief: TelemetryBrief): void` (a `Map` entry removed when the line is written), and each handler's context gets `noteBrief: brief => telemetry.noteBrief(requestId, brief)`.
- **P14. Biome must skip `.eligian/`.** Servers started on checked-in fixture directories under `packages/` write `.eligian/programs.json` (FR-058). Git ignores it (the self-ignoring `.gitignore`), but `biome.json` has no `vcs` key, and its `files.includes` takes `packages/**/*.json` (`biome.json:46–62`), so `pnpm check` (`biome check --write .`) would format those files. `files.includes` gains `"!!**/.eligian"`.
- **P15. Tests never touch the developer's key.** `vitest.config.ts` `test.env` gains `ELIGIAN_STATE_DIR: path.join(os.tmpdir(), 'eligian-vitest-state')`, so a spec that signs without `ServerOptions.brief.stateDir`, and every spawned `bin/cli.js`, use a temp state directory instead of `%LOCALAPPDATA%\eligian`. Specs that need an isolated key pass their own `stateDir`.
- **P16. A forced re-init of existing work keeps its record entry.** FR-013 lets `eligian_init` with `force` re-initialise a known, ungoverned program; FR-008 lists no record write for it. The entry is left as it is; starter timeline names that are not in it are additions (decision 7) and take their scoped interview. The addition triggers are not evaluated for `eligian_init`'s own verdict (the file is about to be replaced; FR-061 covers the approved case).
- **P17. `eligian_project` never starts a scan and never writes** (FR-056 "stays read-only", SC-011 "writes nothing"; FR-004/FR-005 name only gated and `eligian_brief` calls as scan triggers). It calls `record.peek(root)`: when a scan of `root` is already running (the start-time scan, or one a gated call started), it waits for that scan to settle and reads the record it wrote; when the root has a record, it reads it; when it has none and no scan is running (an announced root not scanned yet, FR-004, or a root the store never scans, FR-062), it computes **in memory** the record the first-run scan would write there (`collectFirstRun(root)`, the same function `scanRoot` writes from; for a FR-062 root, `{ version: 1, programs: [] }`) and reports from that. So `brief.known` and `brief.gate` on the first call equal what the next gated call will decide, and the tool creates no file and no `.eligian/`.
- **P18. The 200-program timing check goes into `package-bin.spec.ts`.** Startup timings run in the `cli-bin` project on their own (`vitest.config.ts:15–16`, the `BIN` comment); a timing test among 8 parallel workers is unreliable.
- **P19. Lock order: brief permit, then record semaphore.** An approval writes `BRIEF.md` under the brief's permit, then updates the record under the root's semaphore. Record writers never take a brief permit, so there is no cycle. When the record write fails after the brief was signed, the brief is approved and its program not recorded: the gate's row 9 still runs it, so the state stays consistent and the reply's failure (`io`) tells the agent to call again (a repeat approval is a no-op that re-tries the record write).
- **P20. An addition name outside FR-047's rule is `not-an-addition`.** FR-036 applies FR-047's name rule to `<name>` and FR-037 refuses a name already in the approved set with `not-an-addition`; FR-051 names no separate code for a name that breaks the rule. An addition scope `{ addition: 'view', name }` whose `name` fails `S2_NAME` (and a `language` scope whose `name` fails `LANGUAGE_CODE`, P1) is refused `not-an-addition` with the message `"<name>" cannot be a view name: 1 to 64 characters, no ":", "|", line break, or leading or trailing space; rename the timeline` (resp. `… is not a language code like en-US`). No section is created. Proposed for the FR-037/FR-051 rows (Review notes).
- **P21. "Briefed, approved directory" (FR-033) is a fact of the record, not only of the current state.** After approval, a hand edit or a tool change makes the brief compute `complete` (FR-026, R-4) while its programs stay governed by row 3 (FR-031: "Later edits to `STORYBOARD.md` do not close the gate … unless the program or the storyboard gains a view"). `checkPrograms` therefore sets `GateInput.storyboardViews` when the directory has a main brief and either (a) the record holds an entry inside that directory with `via` in `brief`, `addition` or `adopted` (each written only by an approval, FR-031/FR-040/FR-049), or (b) the brief's computed state is `approved`. Otherwise it is left `undefined` and no storyboard view is a trigger.

## Project structure

```text
packages/cli/src/
├── check/
│   ├── files.ts                          NEW  isLibrary, expandPatterns, toGlobPath (moved, FR-002)
│   └── check-command.ts                  EDIT re-export them from ./files.js
├── init.ts                               EDIT InitOptions.firstRecord → writeFirstRecord (FR-060, P9)
├── main.ts                               EDIT the warning line in check/dev/smoke/fmt/compile; init firstRecord
├── mcp/
│   ├── brief/
│   │   ├── known-programs.ts             NEW  scanProgram, record format, RecordStore, writeFirstRecord
│   │   ├── gate.ts                       NEW  gateVerdict, governance, checkPrograms, briefStatusOf, cliBriefWarnings
│   │   ├── signature.ts                  NEW  stateDirectory, readKey/ensureKey, signer, ticket, verifyBrief(File)
│   │   ├── adopt.ts                      NEW  readCodeFacts, factAnswers, conflictsOf
│   │   ├── scoped.ts                     NEW  scopedTree (FR-036, P11)
│   │   ├── storyboard-check.ts           NEW  checkStoryboard (FR-029, FR-039, P8)
│   │   ├── facts.ts                      NEW  makeFacts + memoize (moved, P3)
│   │   ├── wire.ts                       NEW  ShapeSchema, RoundItemSchema, GateRefusalSchema (P5)
│   │   ├── engine.ts                     EDIT approved, by code, signer, views override, additions, watermark
│   │   ├── brief-file.ts                 EDIT signed lines, scope line, by code, addition sections
│   │   ├── references.ts                 EDIT local LANGUAGE_CODE (P1)
│   │   └── tree.ts                       EDIT S2_NAME widened (FR-047); Question.scoped?
│   ├── storyboard.ts                     EDIT header + views (FR-030)
│   ├── errors.ts                         EDIT kind gate, ToolGateRefused, ToolFailure.error.gate
│   ├── paths.ts                          EDIT expandPatterns from ../check/files.js (P2)
│   ├── telemetry.ts                      EDIT TelemetryLine.brief, noteBrief (P13)
│   ├── server.ts                         EDIT record store + start scan, gate context, brief via call
│   └── tools/{brief,init,check,fmt,compile,smoke,project}.ts   EDIT
├── __tests__/
│   ├── brief-gate.spec.ts, brief-scoped.spec.ts, mcp-brief-gate.spec.ts, brief-known-programs.spec.ts,
│   │   brief-signoff.spec.ts, brief-signature.spec.ts, mcp-brief-additions.spec.ts,
│   │   mcp-brief-adopt.spec.ts, mcp-brief-refusals.spec.ts, cli-brief-warning.spec.ts      NEW
│   ├── brief-helpers.ts                                                                   NEW  approved-brief builder, temp projects
│   ├── mcp-test-client.ts                                                                 EDIT elicitation option + responder
│   ├── 15 existing MCP specs (FR-058 inventory below), brief-file.spec.ts,
│   │   brief-tool.spec.ts, init.spec.ts, package-bin.spec.ts, mcp-stdout.spec.ts,
│   │   mcp-telemetry.spec.ts, mcp-project.spec.ts, mcp-server.spec.ts                     EDIT
│   ├── __snapshots__/tools-list-phase3.json.snap                                          UPDATED (eligian_brief, eligian_project)
│   └── __fixtures__/mcp/brief/{gate/<row>/, storyboards/<problem>.md, adopt/action-nav/,
│                               adopt/remote-video/, tour-baseline/*.json,
│                               addition-no-brief.md}                                       NEW
packages/cli/scripts/capture-tour-baseline.ts                                              NEW  (SC-008 capture, run once)
packages/cli/vitest.config.ts                                                              EDIT test.env (P15)
packages/cli/AGENTS.md                                                                     EDIT the brief modules and the gate
biome.json                                                                                 EDIT "!!**/.eligian" (P14)
```

## Module design

### 1. `cli/check/files.ts` (FR-002)

`isLibrary`, `expandPatterns` and `toGlobPath` move here verbatim from `check-command.ts:52–55`, `:73–97`, `:100`. Imports: `node:fs`, `node:path`, `tinyglobby`. `check-command.ts` keeps `export { expandPatterns, isLibrary } from './files.js';` and imports them for its own use, so `fmt.ts:13`, `mcp/tools/compile.ts:31`, `project.ts:44`, `smoke.ts:25`, `smoke/smoke-command.ts:18` are unchanged (`paths.ts:16` changes by P2).

```ts
export function isLibrary(source: string): boolean;                                  // unchanged, regex-based
export async function expandPatterns(patterns: readonly string[], cwd: string): Promise<string[]>;
export const toGlobPath: (p: string) => string;
```

### 2. `cli/mcp/brief/known-programs.ts` (FR-001–FR-009, FR-060, FR-062, FR-064)

Imports: `node:fs`, `node:fs/promises`, `node:os`, `node:path`, `effect` (`Effect`, `Semaphore`, `Scope`), `../../atomic-write.js`, `../../dev/runtime-reports.js` (`ensureEligianDir`), `../../check/files.js`, `../errors.js`, `../paths.js` (`isInside`). No `@eligian/language`, no `console`, no `process.stdout`.

```ts
export interface ProgramScan {
  readonly library: boolean;
  readonly timelines: readonly string[];
  readonly languages: readonly string[];
  readonly extensions: boolean;
}
/** FR-002: string-aware, comment-aware tokenizer; pure, sync, never throws. */
export function scanProgram(source: string): ProgramScan;

export type Via = 'first-run' | 'brief' | 'addition' | 'accepted' | 'adopted';
export interface RecordEntry {
  readonly path: string;                    // root-relative, '/'
  readonly timelines: readonly string[];
  readonly languages: readonly string[];
  readonly extensions: boolean;
  readonly via: Via;
  readonly mode?: 'elicitation' | 'agent-reported';   // via 'accepted' only
}
export type ProgramRecord =
  | { readonly version: 1; readonly programs: readonly RecordEntry[] }
  | { readonly invalid: string };            // FR-006: the parse problem, for the refusal message
export const RECORD_FILE: string;            // path.join('.eligian', 'programs.json')
export function parseRecord(text: string): ProgramRecord;
export function writeRecordText(programs: readonly RecordEntry[]): string;   // sorted by path, 2-space, LF, trailing LF
export function entryFor(record: ProgramRecord, root: string, file: string): RecordEntry | undefined;
/** FR-053: the nearest `.eligian/programs.json` walking up from `fromDir`; the CLI only. */
export function findRecordFile(fromDir: string): string | undefined;
/** FR-062: no start-time scan at a filesystem root or the home directory. */
export function skipStartScan(cwd: string, home?: string): boolean;          // home default os.homedir()
/** FR-060: the CLI's first record, minus `exclude` (the starter's main.eligian). */
export async function writeFirstRecord(root: string, exclude: readonly string[]): Promise<void>;

export interface RecordStoreOptions {
  readonly beforeScan?: () => Promise<void>;                        // FR-003 seam
  readonly recordBeforeRename?: (target: string) => Promise<void>;  // FR-007 seam
}
/** What a scan settles to; the stored promise never rejects. */
type ScanResult = { readonly ok: true } | { readonly ok: false; readonly error: unknown };
/** FR-003: the non-library programs under `root` as first-run entries; reads only. */
export async function collectFirstRun(root: string, signal?: AbortSignal): Promise<readonly RecordEntry[]>;
export interface RecordStore {
  /**
   * FR-003: the server's background part. Adds a finalizer to the scope that aborts every scan of
   * this store, then forks the cwd scan (unless skipStartScan) into that scope. Never fails; the
   * fork returns at once, so the layer build does not wait for the scan.
   */
  readonly start: (cwd: string) => Effect.Effect<void, never, Scope.Scope>;
  /** FR-003/FR-004/FR-062: resolves once `root` has a record, or `root` is never scanned (FR-062). */
  readonly ensureScanned: (root: string) => Effect.Effect<void, ToolError>;
  /** P17 (eligian_project): waits for a running scan, never starts one, never writes. */
  readonly peek: (root: string) => Effect.Effect<ProgramRecord, ToolError>;
  /** FR-005/FR-006: read from disk every call; the last copy when this process saw it and it is gone. */
  readonly read: (root: string) => Effect.Effect<ProgramRecord, ToolError>;
  /** FR-007: merge `entries` (theirs win per path) under the root's semaphore, re-read before rename, ≤ 5 retries. */
  readonly update: (root: string, entries: readonly RecordEntry[]) => Effect.Effect<void, ToolError>;
}
export function makeRecordStore(options?: RecordStoreOptions): RecordStore;
```

**Scan** (FR-002). A single pass over the source with three states (code, string, comment): `//` to end of line and `/* … */` are skipped only in code state; `"…"` with `\` escapes is a string. Tokens in code state: the first token decides `library`; `timeline` followed by a string token records that string (a block comment between them is skipped); `languages` `{` … `}` records each entry's first string (the code; the grammar's `LanguageEntry` is `code`, `isDefault`, `label`, `generated/ast.ts:900–906`); `extensions` followed by a string sets `extensions`. An unterminated string or comment ends the scan with what was read.

**First-run scan** (FR-003, FR-004, FR-062, P10). `scans: Map<rootKey, Promise<ScanResult>>` (rootKey lower-cased on win32, as `makeBriefLocks`); one store-wide `AbortController`. `beginScan(root)` returns the stored promise when `scans` already has the root (so the forked start scan and a first call that races it share one scan), else stores and returns `scanRoot(root, signal).then(() => ({ ok: true }), error => ({ ok: false, error }))`, so **the stored promise never rejects** and no scan can become an unhandled rejection, whoever awaits it and whenever. `start(cwd)` is `Effect.addFinalizer(() => Effect.sync(() => controller.abort()))` then, unless `skipStartScan(cwd)`, `Effect.forkScoped(Effect.promise(() => beginScan(cwd)))`: the cwd scan runs in the server layer's scope (structured, constitution XVII), `initialize` does not wait for it (the fork returns at once), and closing the server (stdio end, `InMemoryServer.close()`) aborts it. `scanRoot` checks the signal before each file read and in its `beforeRename` (aborted → `false`, so `writeFileAtomic` returns `'aborted'` and nothing is written), so an in-process spec's server writes no `.eligian/programs.json` after its teardown.

`ensureScanned(root)`, the same rule for every root (the cwd included):
1. `seen` has the root → done (FR-005: never rescanned once seen).
2. `scans` has it → await its `ScanResult`; `ok` → done; failed → delete the entry (so the next call starts a new scan) and fail the call `ToolIoError` through `toToolError('write', root)`.
3. `root/.eligian/programs.json` exists → mark seen, done.
4. `skipStartScan(root)` (FR-062: a filesystem root or the home directory is never scanned) → done; no record, every program not known.
5. else `beginScan(root)` and continue as in 2.

So a failed start-time scan of the cwd (EACCES on `.eligian/`, a file named `.eligian`, a `beforeScan` that rejects) fails the first gated call `io`, and the next call scans again; the server stays up. FR-004's "only the first announced root" holds because `root` is always `projectRoot`'s (`roots[0]` or the cwd). `scanRoot`: `await beforeScan?.()`, `collectFirstRun(root, signal)` (`expandPatterns(['.'], root)`, read and `scanProgram` each file, keep the non-libraries with `via: 'first-run'`), `ensureEligianDir(root)`, then `writeFileAtomic(file, text, { beforeRename: async () => !signal.aborted && (await readOrUndefined(file)) === undefined })` (P10).

`peek(root)` (P17): `scans` has the root → await it (either result); then `root/.eligian/programs.json` exists → `read(root)`; else `skipStartScan(root)` → `{ version: 1, programs: [] }`; else `{ version: 1, programs: await collectFirstRun(root) }`. It never calls `beginScan`, `ensureEligianDir` or a write, and never marks the root seen.

**Read** (FR-005, FR-006). `read(root)`: ENOENT and `seen` → the last copy; ENOENT and not seen (only a FR-062 root reaches here) → `{ version: 1, programs: [] }`; any other errno (EACCES, EISDIR when `programs.json` is a directory) → `ToolIoError` with the file's path (`toToolError('read', file)` maps ENOENT to not-found, so a dedicated read helper maps the non-ENOENT case). A parse failure returns `{ invalid }` and keeps the file. A successful read or write sets `seen` and `lastCopy`.

**Update** (FR-007). Under `locks.forFile(file).withPermits(1)(Effect.uninterruptible(…))` (P18 pattern): up to 6 attempts; each reads the file text (absent → `lastCopy ?? []`, invalid → `[]`), merges (union by path, `entries` win), writes with `beforeRename: async () => { await recordBeforeRename?.(file); return (await readOrUndefined(file)) === baseText; }`. After 6 aborted attempts: `ToolIoError({ message: 'programs.json changed while writing; call again', path: file })`, and the other writer's file stays (SC-002 (b): the seam ran 6 times).

### 3. `cli/mcp/brief/signature.ts` (FR-020, FR-023–FR-025)

Imports: `node:crypto`, `node:fs/promises`, `node:os`, `node:path`, `./brief-file.js`, `./engine.js`, `./facts.js`, `./tree.js`. No `effect`, no `@eligian/language`.

```ts
export type SignaturePayload =
  | readonly ['eligian-brief/1', 'confirmation', string /*section*/, 'elicitation' | 'agent-reported', string /*at*/, number /*n*/, CanonicalAnswers]
  | readonly ['eligian-brief/1', 'approval', string, 'elicitation' | 'agent-reported' | 'existing-storyboard', string, number, CanonicalAnswers, string /*confirmation hmac*/];
export interface Signer { readonly sign: (payload: SignaturePayload) => string }   // 'hmac-sha256:<64 hex>'

export function stateDirectory(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, home?: string): string;
export async function readKey(stateDir: string): Promise<Buffer | undefined>;   // absent or malformed → undefined
export async function ensureKey(stateDir: string): Promise<Buffer>;             // mkdir -p, temp 0o600 + fs.link; EEXIST → read
export function makeSigner(key: Buffer): Signer;                                // createHmac('sha256', key).update(JSON.stringify(payload))
export function sha256Hex(bytes: string | Buffer): string;

export type TicketParts = readonly ['eligian-signoff-ticket/1', 'confirm' | 'approve-storyboard' | 'accept-existing',
  string /*section*/, string | null /*BRIEF.md sha256*/, string | null /*STORYBOARD.md sha256*/,
  readonly string[] | null /*sorted paths*/, readonly (readonly [readonly string[], readonly string[], boolean])[] | null /*scans*/];
export function makeTicket(key: Buffer, parts: TicketParts): string;          // 'hmac-sha256:<64 hex>' over JSON.stringify(parts) (FR-020)
export function ticketValid(key: Buffer | undefined, ticket: string, parts: TicketParts): boolean;  // never throws

export interface Verification { readonly confirmation: 'none' | 'valid' | 'invalid'; readonly approval: 'none' | 'valid' | 'invalid' }
export function verifyBrief(parsed: ParsedBrief, evaluation: Evaluation, key: Buffer | undefined): Verification;
export async function verifyBriefFile(dir: string, stateDir: string): Promise<Verification>;
```

- `stateDirectory`: `env.ELIGIAN_STATE_DIR` when set; win32 `env.LOCALAPPDATA ?? <home>\AppData\Local` + `eligian`; darwin `<home>/Library/Application Support/eligian`; else `env.XDG_STATE_HOME ?? <home>/.local/state` + `eligian` (R-3). The server resolves `ServerOptions.brief.stateDir ?? stateDirectory(process.env)` once.
- `ensureKey` is called only on the first signing and on the first ticket (FR-020, FR-023); the CLI and the gate call `readKey` only. **The key file appears complete in one step**, so no reader ever sees it empty or half-written: `ensureKey` first tries `readKey`; when absent, it `mkdir -p`s the state directory, writes the 32 random bytes as hex + LF to a unique temp file beside it (`brief-key.<pid>.<8 random hex>.tmp`, flag `wx`, mode `0o600`), then `fs.link(temp, keyFile)`, which fails with `EEXIST` without replacing an existing file (the exclusive-create of FR-023, made atomic), and unlinks the temp file in a `finally`. On `EEXIST` it reads the key that won. A key file whose content is not 64 hex + LF makes `readKey` return `undefined` and `ensureKey` fail with an `Error` whose `code` is `'EINVAL'`, mapped to `io` by `toToolError('write', file)`; the user's file is never overwritten. (`open('wx')` then `write` was rejected: between the two a concurrent `ensureKey` or `readKey` sees an empty file and fails `io` or verifies nothing. P15 makes that window real: vitest's 8 workers share one `ELIGIAN_STATE_DIR`.) A crash between the temp write and the link leaves a uniquely named `*.tmp` file and no key, so the next `ensureKey` starts over.
- `ticketValid` never throws on agent input (`crypto.timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` on buffers of different length; checked this session with `node -e`). It returns `false` when `key` is `undefined`, when `ticket` does not match `^hmac-sha256:[0-9a-f]{64}$` (FR-020 step 2's form), or when `ticket.length !== expected.length`; only then does it call `timingSafeEqual(Buffer.from(ticket, 'utf8'), Buffer.from(expected, 'utf8'))`. The raw ticket is never decoded with `Buffer.from(ticket, 'hex')` (which silently truncates non-hex input). `verifyBrief` compares the `hmac-sha256:<hex>` strings the same way (length check first), although the parser's regexes already fix their length.
- `CanonicalAnswers` is the list `digest` hashes today (`[id, value, by]` sorted by id, `engine.ts:1040–1045`); the engine exports it as `canonicalAnswers(answers)` and `digest` becomes `sha256(JSON.stringify(canonicalAnswers(answers)))`, unchanged in value.
- `verifyBriefFile` reads `<dir>/BRIEF.md` and the key, `parseBrief`, builds `makeFacts(dir, dir)` (the project root is not needed for validity: `inside` only affects asset cross-checks, which do not change the canonical list of recorded answers), `evaluate` with the signer, and returns `verifyBrief`. SC-006's last item compares it with the server's verdict per case.

### 4. `cli/mcp/brief/engine.ts` (edits: FR-024–FR-027, FR-035, FR-036, FR-045, P4, P11, P12)

```ts
export type By = 'user' | 'delegated' | 'code';                                   // was 'user' | 'delegated' (:37)
export interface Confirmation {                                                   // was :48–55
  readonly mode: 'elicitation' | 'agent-reported';
  readonly at: string;
  readonly round?: number;            // the watermark n; absent on a Phase 1 sha256 line (never valid, no changed answers)
  readonly hmac: string;              // 'hmac-sha256:<64 hex>' or the legacy 'sha256:<64 hex>' (round-tripped verbatim)
  readonly message?: string;          // agent-reported only
}
export interface Approval {
  readonly mode: 'elicitation' | 'agent-reported' | 'existing-storyboard';
  readonly at: string;
  readonly hmac: string;
  readonly message?: string;
}
export type AdditionKind = 'view' | 'language' | 'host-module';
export interface AdditionState {
  readonly kind: AdditionKind;
  readonly name: string;              // '' for host-module
  readonly heading: string;           // 'Addition: view Outro' — the HMAC section (FR-038)
  readonly confirmation?: Confirmation;
  readonly approval?: Approval;
  readonly answers: readonly Answer[];
}
export interface BriefState {
  readonly idea?: string;
  readonly treeVersion: number;
  readonly scope?: 'adopt';           // FR-041
  readonly confirmation?: Confirmation;
  readonly approval?: Approval;
  readonly answers: readonly Answer[];
  readonly additions: readonly AdditionState[];
}
export interface Facts {              // :64–71, plus:
  readonly signer?: Signer;           // P4
  readonly views?: readonly string[]; // P11: fixed view list (addition scope)
  readonly section?: string;          // 'brief' or an addition heading (HMAC payload)
}
export type BriefStateName = 'open' | 'complete' | 'confirmed' | 'approved';    // :73
export interface Counts { …; readonly fromCode: number }                          // FR-045
export interface Evaluation {         // :112–127, plus:
  readonly confirmationStatus: 'none' | 'valid' | 'invalid';
  readonly approvalStatus: 'none' | 'valid' | 'invalid';
  readonly changed: readonly { readonly id: string; readonly title: string; readonly value: AnswerValue }[];  // FR-026
  readonly canonical: CanonicalAnswers;
}
export type RejectionReason = … | 'fact';                                          // FR-045
export function canonicalAnswers(answers: readonly Answer[]): CanonicalAnswers;
export function confirm(brief: BriefState, mode: Confirmation['mode'], message: string | undefined,
  now: Date, evaluation: Evaluation, signer: Signer, section: string): BriefState;  // replaces :930
export function approve(brief: BriefState, mode: Approval['mode'], message: string | undefined,
  now: Date, evaluation: Evaluation, signer: Signer, section: string): BriefState;
```

State (FR-026): `open` while the frontier is non-empty; then `approved` when both statuses are `valid`, `confirmed` when the confirmation is, else `complete`. `changed`: when the confirmation is present and `invalid` and has a `round`, the recorded applicable answers with `round` or `reviewed` above it. The confirmation HMAC is over `[…, 'confirmation', section, mode, at, round, canonical]`; the approval's over `[…, 'approval', section, mode, at, confirmation.round, canonical, confirmation.hmac]`, so an approval never outlives its confirmation (FR-024). `n` at signing is `nextRound(brief) - 1` (the highest `round` or `reviewed`, `:1028–1034`).

The same `evaluate` evaluates an addition: the tool calls it with `scopedTree(…)`, the addition's answers as a `BriefState` (`additions: []`) and `facts` with `views` and `section` set.

### 5. `cli/mcp/brief/brief-file.ts` (edits: FR-024, FR-035, FR-041, FR-042, SC-018)

- `HEADER_LINE` (`:104`) gains `scope` and `approval-message`; `CONFIRMATION` (`:102–103`) becomes `^(elicitation|agent-reported) (<ISO>) round ([1-9]\d*) (hmac-sha256:[0-9a-f]{64})$`; a Phase 1 line `^agent-reported (<ISO>) sha256:([0-9a-f]{64})$` still parses, to a `Confirmation` with no `round` and `hmac: 'sha256:<hex>'`, and is written back in that same form, so it round-trips and never verifies (FR-025). `APPROVAL`: `^(elicitation|agent-reported|existing-storyboard) (<ISO>) (hmac-sha256:[0-9a-f]{64})$`. The `- state:` line stays unread (Phase 1 FR-023).
- `META_LINE` (`:105`) `by` accepts `code`.
- `## Addition: view <name>`, `## Addition: language <code>`, `## Addition: host-module` headings are parsed into `AdditionState` (their own `- state:` / `- confirmation:` / `- approval:` / message lines, then `### <id>: <title>` answer blocks in Phase 1's format), validated against `scopedTree` of that addition. They are written after the branch and view sections and before `## Facts`, in the order they were created; each section's header lines are `- state:`, `- confirmation:` (+ `- confirmation-message:` when agent-reported), `- approval:` (+ `- approval-message:`), in that order, then a blank line and its answer blocks; unknown `##` sections are still kept and written after `## Facts` (Phase 1 P17). A brief whose only content is additions (FR-035: the file an addition creates in a project that had no brief) is written as the Phase 1 header lines (`# Brief`, the comment line, `- tree:`, `- state:`, `- confirmation: none`, `- approval: none`), no idea paragraph and no branch or view section, then the addition sections, then `## Facts`. The `- scope: adopt` line (FR-041) is written directly after `- tree:` and only when set.
- `FactsSnapshot.state` (`:67`) widens to the new `BriefStateName`; each addition's `- state:` comes from its own evaluation (`FactsSnapshot.additionStates: ReadonlyMap<string, BriefStateName>`).
- A file with no addition section, no `scope` line and `- approval: none` writes byte-identically to Phase 1's writer (SC-018; the golden `example.md` has `- confirmation: none` and `- approval: none`, `example.md:10–11`).

### 6. `cli/mcp/brief/tree.ts` (FR-047)

`S2_NAME` (`:172`) becomes `/^(?! )[^:|\r\n]{1,64}(?<! )$/` and the message at `:191` says "1 to 64 characters, no `:`, `|`, line break, or leading or trailing space". `TREE_VERSION` stays 1. `Question` gains `readonly scoped?: true` (P11: the engine's V checks at `engine.ts:442`, `:614`, `:763`, `:980` read `q.branch === 'V'`; scoped clones of V keep `branch: 'V'` and are expanded over `facts.views`).

### 7. `cli/mcp/brief/scoped.ts` (FR-036, P11)

```ts
export interface AdditionScope { readonly addition: AdditionKind; readonly name: string }
export interface ScopeContext { readonly get: (id: string) => AnswerValue | undefined }   // main-brief answers ∪ code facts
export function scopedTree(scope: AdditionScope, context: ScopeContext): readonly Question[];
export function additionHeading(scope: AdditionScope): string;   // 'Addition: view Outro' | 'Addition: language de-DE' | 'Addition: host-module'
```

Built from `TREE` by id. View: V1–V6 (`needs: ['S6']`; V6's rule reads C3 from `context`, applying when it is undefined, R-8), S4 (table `view`, `target`, `trigger`; a check that every row names `<name>` as `view` or `target`; `none` accepted), S5/S6/D5 (records: the table's columns without `view`; S6 keeps `checkS6`'s per-row rule on the record), I4 (applies when the presentation then has more than one view: `context.get('S2')` rows + 1 > 1, or the record's timelines count), A1–A6 with Phase 1's rules over the addition's own assets. Language: L2 (record `supplier`, `when`), L3, L4, L5. Host module: H1 (check refuses `none`), H2, H3. Answer validation, rejections, rounds and staleness are the engine's (Phase 1 FR-005–FR-017). `scopedTree` assumes a valid `name`: the tool refuses a view name outside FR-047's rule, a non-code language name, and a name already in the approved set with `not-an-addition` before it builds the tree (P20, FR-037). Every rule above has its own `it` in `brief-scoped.spec.ts` (Test plan).

### 8. `cli/mcp/brief/gate.ts` (FR-010–FR-017, FR-032–FR-034, FR-053–FR-056)

Imports: `node:fs/promises`, `node:path`, `effect`, `./known-programs.js`, `./signature.js`, `./engine.js`, `./brief-file.js`, `./tree.js`, `./scoped.js`, `./facts.js`, `./storyboard-check.js`, `../storyboard.js`, `../errors.js`, `../paths.js`, `./wire.js`. No `@eligian/language`.

```ts
export type GateCode = 'brief-required' | 'brief-incomplete' | 'brief-not-confirmed'
  | 'storyboard-not-approved' | 'brief-changed' | 'addition-not-briefed';
export interface ApprovedSet { readonly timelines: readonly string[]; readonly languages: readonly string[]; readonly extensions: boolean }
export interface Trigger { readonly addition: AdditionKind; readonly name: string }
export interface GoverningBrief {
  readonly state: BriefStateName;
  readonly confirmation: 'none' | 'valid' | 'invalid';
  readonly changed: Evaluation['changed'];
  readonly approvedSet: ApprovedSet;          // S2 names, L1 codes, H1 ≠ none
}
export interface GateInput {
  readonly scan: ProgramScan | undefined;     // undefined: eligian_init's target (P16: no trigger check)
  readonly entry: RecordEntry | undefined;    // undefined: not known
  readonly brief: GoverningBrief | undefined; // FR-011: a main brief, not an unapproved adopted one
  readonly additions: ApprovedSet;            // approved addition sections of the directory's BRIEF.md
  readonly storyboardViews?: readonly string[];  // FR-033; set by the P21 rule (record via brief/addition/adopted in the dir, or computed approved)
}
export type KnownChange = { readonly change: 'unchanged' } | { readonly change: 'rename' }
  | { readonly change: 'addition'; readonly triggers: readonly Trigger[] };
/** P21 / FR-033: the directory counts as briefed and approved for storyboard-view triggers. Pure. */
export function approvedDirectory(record: ProgramRecord, root: string, dir: string, state: BriefStateName): boolean;
/** FR-009 / R-15: a known program's scan against its entry ∪ the directory's approved additions. Pure. */
export function classifyKnownChange(scan: ProgramScan, entry: RecordEntry, additions: ApprovedSet): KnownChange;
export type Verdict =
  | { readonly verdict: 'runs' }
  | { readonly verdict: 'refused'; readonly code: GateCode; readonly triggers?: readonly Trigger[] };
export function gateVerdict(input: GateInput): Verdict;                   // pure, FR-012 rows 1–9

export interface ProgramGate {                                            // one program's evaluated inputs
  readonly file: string; readonly dir: string; readonly briefFile: string;
  readonly input: GateInput; readonly verdict: Verdict;
  readonly parsed: ParsedBrief | undefined; readonly evaluation: Evaluation | undefined;
}
export interface GateContext {
  readonly record: RecordStore;
  readonly stateDir: string;
  readonly noteBrief: (brief: TelemetryBrief) => void;
}
/** FR-010, FR-014, FR-016, FR-017: evaluate every program of `files`; fail with every refusal. */
export const checkPrograms: (root: ProjectRoot, files: readonly string[], context: GateContext,
  options?: { readonly init?: true }) => Effect.Effect<readonly ProgramGate[], ToolError | ToolGateRefused>;
/** FR-056: the brief section of one program (also the telemetry state, FR-057). */
export const briefStatusOf: (root: string, file: string, record: ProgramRecord, key: Buffer | undefined)
  => Promise<ProjectBrief>;
/** FR-053, FR-054: the CLI's warning lines; never throws, never writes. */
export async function cliBriefWarnings(files: readonly string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string[]>;
export async function cliBriefWarningsFor(patterns: readonly string[], cwd: string): Promise<string[]>;  // expandPatterns first
```

**`gateVerdict`** (first matching row wins):
1. no `brief`: `entry` → `triggers(scan, entry ∪ additions)` (row 1); else `brief-required` (row 2).
2. `brief` and `entry`: rows 3 and 4 (every `via`) → `triggers(scan, entry ∪ additions ∪ storyboard)`.
3. `brief`, no `entry`: `open` → `brief-incomplete`; `confirmation === 'invalid'` and `changed.length > 0` → `brief-changed`; not `confirmed`/`approved` → `brief-not-confirmed`; `confirmed` → `storyboard-not-approved`; `approved` → `triggers(scan, approvedSet ∪ additions ∪ storyboard)`.

`triggers` lists new timelines, then new language codes, then a new `extensions` block, then storyboard views outside the set (FR-033, FR-034); a non-empty list is `addition-not-briefed`. `scan === undefined` skips it.

**`classifyKnownChange`** (FR-009, R-15), used only by `accept-existing`'s pre-check for a program that has a record entry. With `known = entry ∪ additions` (timelines, languages, extensions): `added` = scan timelines not in `known.timelines`, `removed` = `entry.timelines` not in the scan; `newLanguages` = scan languages not in `known.languages`; `newExtensions` = `scan.extensions && !known.extensions`. Then: `added`, `removed`, `newLanguages` empty and `newExtensions` false → `unchanged`; `newLanguages` empty, `newExtensions` false and `added.length <= removed.length` (every new name matched by a disappeared one) → `rename`; else `addition` with `triggers(scan, known)` (the same ordering as the gate, so the refusal's `scope` is the first trigger). A name already in an approved addition of the directory is in `known`, so it is not new (FR-040's "counts for programs written later" and FR-032's approved set).

**Governance** (FR-011): `<dir>/BRIEF.md` read with `fs.readFile` (case-insensitive on Windows because the file system is; on Linux `brief.md` is a different file: SC-020); `parseBrief`; a **main brief** has an idea, an answer outside addition sections, or a confirmation line; an adopted (`scope: adopt`) one governs only once `approved`.

**`checkPrograms`** (FR-014): `context.record.ensureScanned(root.root)` → `record.read` → `readKey(stateDir)` → per file: read, `scanProgram`, skip libraries, evaluate governance (one parse per directory per call), build `GateInput` (`additions` from the approved addition sections of the directory's `BRIEF.md`, so a program written later in that directory counts them too, FR-040; `storyboardViews` from `STORYBOARD.md`'s `views` by P21), `gateVerdict`. Then `noteBrief` with the first refused (else first) program's state and code. When any is refused: compute the payload for the first refused program and `Effect.fail(new ToolGateRefused({ message: '<code>: <program>', path: program, gate }))`. Round: `brief-required` → `pickRound(TREE, evaluate(TREE, EMPTY_BRIEF, facts), 7)`; `brief-incomplete` / `-not-confirmed` / `storyboard-not-approved` / `brief-changed` → `pickRound` over the brief's evaluation (equal to `eligian_brief` `status` on that directory, SC-001); `addition-not-briefed` → `pickRound` over the first trigger's scoped evaluation (empty addition when the section does not exist yet, FR-015). An invalid record names `record.invalid` in every refusal's `message` (FR-006). The step reads only; no `.eligian/`, `BRIEF.md` or addition section is created (FR-015).

**`cliBriefWarnings`** (FR-053–FR-055): per program, `findRecordFile(dir)` (an unparsable record counts as none), `readKey(stateDirectory(env))`, governance as above (an unreadable or unparsable `BRIEF.md` is no brief), `gateVerdict` with: `entry` from the record when there is one; with no record, an ungoverned program counts as known and a governed one as not known. A line is printed exactly when the verdict is a refusal other than `addition-not-briefed`:

```
eligian: <program> — BRIEF.md is <state>; the open questions: eligian_brief {"action":"status","directory":"<dir>"}
```

`<state>` is the computed state, or `none` when no brief governs; paths relative to `cwd` with `/`. Every step is wrapped in a plain `try { … } catch { return [] }` per program (no Effect). It reads; it never calls `ensureKey`, `ensureEligianDir` or any write.

**`ProjectBrief`** (FR-056): `{ file: string | null; state: 'none' | BriefStateName; counts?: Counts; next: string; known: boolean; gate: 'runs' | GateCode }`.

### 9. `cli/mcp/brief/adopt.ts` (FR-041–FR-048)

Imports: `@eligian/language` (`withLoadedDocuments`, `hostModuleOf`, `type Program`), `@eligian/language/mcp` (`timelineNames`, `timelineNamed`, `navigatesTo`, `calledAction`), `../../compile-file.js` (`compileFile`), `../compiler-lock.js`, `../errors.js`, `./engine.js`, `./tree.js`.

```ts
export interface CodeFacts {
  readonly program: string;                                       // root-relative R3
  readonly views: readonly string[];                              // timelineNames
  readonly navigation: readonly { view: string; target: string; trigger: string }[];
  readonly providers: readonly { view: string; provider: string; source: string }[];
  readonly languages?: readonly { code: string; default: 'yes' | 'no' }[];
  readonly transport: readonly string[];                          // play/pause/toggle/stop/seek, as text
  readonly keys: readonly { key: string; action: string }[];
  readonly host?: readonly string[];                              // hostModuleOf names
  readonly perView: ReadonlyMap<string, { media?: string; reactions: readonly string[]; seconds?: number }>;
  readonly entryImports: readonly { file: string; kind: 'image' | 'other' }[];
  readonly badNames: readonly string[];                           // outside FR-047's rule
}
export const readCodeFacts: (file: string, root: string, requestId: string)
  => Effect.Effect<CodeFacts, ToolError, CompilerLock>;
export function factAnswers(facts: CodeFacts, round: number): readonly Answer[];   // by: 'code', FR-042 shapes
export function conflictsOf(evaluation: Evaluation): readonly { readonly ids: readonly string[]; readonly message: string }[];  // FR-046
```

`readCodeFacts` runs one `lock.run(requestId, …)` holding two steps: `withLoadedDocuments([file], loaded => …)` for the AST facts (works on a program that does not compile), then `compileFile(file, { optimize: true })` for the durations (`config.timelines[i].duration`, in `timelineNames` order, `timeline-review.ts:177–180`; a rejection gives no V5 duration: `none` / `none`). The AST is walked without importing `langium` (the CLI does not depend on it): a generic walk over own properties of `$type`-tagged objects, skipping `$`-prefixed keys, finds every `InteractionStatement` (fields `verb`, `target`, `selector`, `event`, `keys`, `position`, `call`; `generated/ast.ts:846–856`); its timeline is the nearest `$container` with `$type === 'Timeline'`; inside an action (`RegularActionDefinition`, `EndableActionDefinition`, `EventActionDefinition`), the timelines are those whose bodies reach the action through `calledAction` of their `OperationCall`s, transitively (R-9). Types come from the exported functions (`ReturnType<typeof navigatesTo>[number]` for `InteractionStatement`, `NonNullable<ReturnType<typeof timelineNamed>>` for `Timeline`: `provider`, `source`, `name`, `generated/ast.ts:1597–1609`). L1 from `program.languages?.entries` (`code`, `isDefault`, `generated/ast.ts:900–906`, `:1270–1274`).

`conflictsOf` (FR-046, R-11): C3 without `keyboard` and an I2 fact; C3 without `mouse` and `touch` and a non-`key` S4 or V6 fact; C5 `offline` and an `http:`/`https:` S6 source or V3 file.

### 10. `cli/mcp/brief/storyboard-check.ts` (FR-029, FR-039, P8)

```ts
export interface StoryboardProblem { readonly code: 'storyboard-ignored-rows' | 'storyboard-views' | 'storyboard-header'
  | 'storyboard-end-block' | 'storyboard-interactions'; readonly message: string }
export function checkStoryboard(storyboard: Storyboard, evaluation: Evaluation): readonly StoryboardProblem[];
export function checkAdditionStoryboard(storyboard: Storyboard, scope: AdditionScope, evaluation: Evaluation): readonly StoryboardProblem[];
```

The five checks in FR-029's order and wording; FR-039's subset for additions. The header values come from FR-030's `Storyboard.header`; S2/S4/S6/I1/I2/V6/L1/H1 values and the asset list from the evaluation's settled instances.

### 11. `cli/mcp/storyboard.ts` (FR-030)

`Storyboard` gains `readonly header: { readonly provider?: string; readonly languages?: string; readonly assets?: string; readonly hostModule?: string; readonly audience?: string }` (from lines `- provider:`, `- languages:`, `- assets:`, `- host module:`, `- audience:` outside tables, first occurrence, trimmed) and `readonly views: readonly string[]` (`## view <name>` headings, the text before ` (container` when present). `beats`, `interactions`, `interactionRows`, `ignoredRows` are unchanged, so `storyboardOf` (`project.ts:470–499`) is unaffected. Still never throws.

### 12. `cli/mcp/errors.ts` (FR-016, FR-017)

```ts
export type ToolErrorKind = 'not-found' | 'io' | 'timeout' | 'cancelled' | 'internal' | 'gate';   // :12
export class ToolGateRefused extends Data.TaggedError('ToolGateRefused')<{
  readonly message: string; readonly path?: string; readonly gate: GateRefusal;
}> {}
export type ToolError = ToolNotFound | ToolIoError | ToolInternal | ToolGateRefused;             // :29
// ToolFailure (:34): error gains gate: Schema.optionalKey(GateRefusalSchema); TOOL_ERROR_KINDS gains 'gate'
// KIND_OF_TAG (:44) gains ToolGateRefused: 'gate'; toToolFailure (:50) copies `gate`
```

`GateRefusalSchema` (in `brief/wire.ts`): `{ code, program, refused: { program, code }[], brief, directory, state: 'none' | BriefStateName, round: RoundItemSchema[], scope?: { addition, name }, additions?: { addition, name }[], changed?: { id, title, value: Unknown }[], next }`. Adding `ToolGateRefused` to `ToolError` keeps every existing handler's type valid (a wider error union), and `catchDefects` (`:91`) is unchanged.

### 13. `cli/mcp/telemetry.ts` (FR-057, P13)

```ts
export interface TelemetryBrief { readonly state: 'none' | 'open' | 'complete' | 'confirmed' | 'approved'; readonly gate?: GateCode }
export interface TelemetryLine { …; readonly brief?: TelemetryBrief }       // :14–25
export interface Telemetry { readonly withTelemetry: …; readonly noteBrief: (requestId: string, brief: TelemetryBrief) => void }
```

`withTelemetry` reads and deletes the note for its `requestId` when it builds the line. `MAX_LINE_CHARS` (`:63`) holds: the field is at most ~60 characters.

### 14. `cli/mcp/tools/brief.ts` (FR-009, FR-018–FR-022, FR-027–FR-031, FR-035–FR-052)

Parameters (FR-050):

```ts
export const Parameters = Schema.Struct({
  directory: Schema.optionalKey(Schema.String),
  action: Schema.Literals(['status', 'answer', 'confirm', 'approve-storyboard', 'accept-existing']),
  idea: …, answers: …, max: …, confirmation: …,                         // Phase 1, :61–77
  scope: Schema.optionalKey(Schema.Union([
    Schema.Literals(['presentation', 'adopt']),
    Schema.Struct({ addition: Schema.Literals(['view', 'language', 'host-module']), name: Schema.String }),
  ])),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
  ticket: Schema.optionalKey(Schema.String),
});
```

`Success` (FR-051) extends `:133–160`: `state` adds `approved`; `counts.fromCode`; `rejected.reason` adds `fact`; `refused` becomes `{ code: <the 13 codes>, outcome?: 'cancelled' | 'no-answer', problems?: { code, message }[], scope?, round? }`; optional `signoff`, `summary`, `ticket`, `changed`, `conflicts`, `accepted`, `skipped`, `scope`. The description is rewritten within 1,000 characters (FR-052), naming the five actions, `scope` and that generation tools refuse until approval.

`BriefToolContext` (`:190`) gains `gate: GateContext` and `elicitationTimeoutMs: number`; `BriefToolOptions` (`:164`) gains `stateDir?`, `elicitationTimeoutMs?`, `beforeScan?`, `recordBeforeRename?` (FR-059; `ServerOptions.brief` is this type).

Flow of `handle` (its type becomes `Effect<BriefSuccess, ToolError, CompilerLock>`; FR-044):

1. `projectRoot`, `resolveInputPath(directory)`, `context.gate.record.ensureScanned(root)` (FR-005).
2. `status` / `answer` (any scope), `confirm` without a dialog, `scope: 'adopt'` reads: Phase 1's single section under the brief permit (`tools/brief.ts:396–398`). For `scope: 'adopt'` the code facts are read **before** taking the permit (`readCodeFacts` under the compiler lock; the brief permit is never held while waiting for the compiler lock), then applied inside the section (FR-044: replaces every `by: code` answer, a changed one gets the call's round).
3. Sign-off actions (`confirm`, `approve-storyboard`, `accept-existing`):
   - **pre-check section** (permit, uninterruptible): read `BRIEF.md` (and `STORYBOARD.md`, or the matched programs for `accept-existing`, each known one classified by `classifyKnownChange`, §8), evaluate, refuse per FR-027/FR-028/FR-029/FR-009/FR-037 (`frontier-not-empty`, `brief-not-confirmed`, `storyboard-missing`, `storyboard-mismatch`, `governed-by-brief`, `addition-not-briefed`, …), build the `summary` (FR-019) and keep the bytes (or scans) it was built from.
   - **ticket path**: a `ticket` and a non-blank `confirmation` with `ticketValid(key, ticket, parts)` over the current bytes → sign `agent-reported` in a sign section; no `elicitation/create` (FR-020 step 2).
   - **dialog path** (client announced elicitation: `McpServerClient.clientCapabilities.elicitation !== undefined`, read as `paths.ts:65–68`): outside every permit, `elicitSignoff(ai, client, form, timeoutMs)`; then:
     - `accepted` → sign section: re-read, compare bytes with the summary's (or re-scan, FR-063), sign with mode `elicitation` or fail `io` with FR-022's / FR-063's message;
     - `declined` → reply `refused: { code: 'declined' }`, nothing written, any same-call `confirmation` ignored;
     - `cancelled` / `no-answer` → `ensureKey`, reply `refused: { code: 'elicitation-unavailable', outcome }`, `summary`, `ticket`; nothing written, any same-call `confirmation` ignored.
   - **no-capability path**: non-blank `confirmation` → sign `agent-reported` in the pre-check section itself (Phase 1's flow); blank → `confirmation-missing`.
   - Signing calls `ensureKey(stateDir)` and `engine.confirm` / `engine.approve` with `makeSigner(key)`; an adopted brief confirmed while `<dir>/STORYBOARD.md` exists also gets the `existing-storyboard` approval in the same write (FR-049).
   - After an approval: `record.update` (P19) with the R3 program (`via: brief`, FR-031), every known program of the directory with the addition (`via: addition`, FR-040), or the program's fresh scan (`via: adopted`, FR-049). After `accept-existing`: the accepted entries (`via: accepted`, `mode`).

```ts
type SignoffOutcome = 'accepted' | 'declined' | 'cancelled' | 'no-answer';
const elicitSignoff = (ai: EffectAi, client: McpServerClient, form: { message: string; field: 'confirmed' | 'approved' | 'accepted' },
  timeoutMs: number): Effect.Effect<SignoffOutcome>;
```

`elicitSignoff` builds `Schema.Struct({ [field]: Schema.Boolean })` (one required boolean, FR-019), runs `ai.McpServer.elicit({ message, schema }).pipe(Effect.provideService(ai.McpSchema.McpServerClient, client), Effect.catchDefect(defect => Schema.isSchemaError(defect) ? Effect.logError('eligian mcp: elicitation answer did not decode', defect).pipe(Effect.as(undecoded)) : Effect.die(defect)), Effect.timeoutOption(timeoutMs), Effect.exit)` and classifies: success `Some({field: true})` → accepted; `Some(false)` or `undecoded` → declined (P6; only a `SchemaError` is recovered, after a stderr log line; every other defect stays a defect and the tool answers `internal` through `catchDefects`); `None` → no-answer; failure `ElicitationDeclined` without `cause` → declined, with `cause` → cancelled (P6); `Cause.hasInterruptsOnly` → cancelled (P7). The default limit is 300 s (FR-021, R-2).

`summarizeArgs` (`:195–200`) adds `scope: 'presentation' | 'addition:<kind>' | 'adopt'` and `paths: number`; it never records names, codes, paths, values, the idea or a message (FR-057).

### 15. The five generation tools (FR-010, FR-013, FR-014, FR-061)

Each handler calls `checkPrograms` right after its paths resolve and before anything else:

| Tool | Insertion point | Note |
| --- | --- | --- |
| `eligian_check` (`tools/check.ts:122–124`) | after `resolveInputPatterns`, before `loadKnowledge` and the lock | |
| `eligian_fmt` (`tools/fmt.ts:84–86`) | after `resolveInputPatterns`, before the lock | |
| `eligian_compile` (`tools/compile.ts:480–482`) | after `resolveInputPath`, before the source read | a library passes the gate; the existing `library: true` reply follows |
| `eligian_smoke` (`tools/smoke.ts:382–384`) | after `resolveInputPatterns`, before `loadKnowledge`, the reads and `spawnSmoke` | |
| `eligian_init` (`tools/init.ts:107–108`) | after `resolveInputPath`, before `runInit` | the program is `<target>/main.eligian` (`STARTER_ENTRY`, `starters.ts:31`), `options.init` (no trigger check, P16); for every template, `library` included (FR-013) |

After a successful `runInit` under an approved brief (row 9), `eligian_init` calls `record.update` with `main.eligian`, `via: 'brief'`, `timelines` = S2 names ∪ `scanProgram(written text).timelines`, `languages` = L1 codes ∪ the starter's, `extensions` = H1 ≠ none || the starter's (FR-061). The `ToolContext` interfaces (`check.ts:26–32`, `init.ts:61–67`, `smoke.ts:58–65`) gain `readonly gate: GateContext`.

### 16. `cli/mcp/tools/project.ts` (FR-056)

`ProjectProgram` (`:143–167`) gains `brief: ProjectBriefSchema`. `handle` (`:550–592`) takes the record from `record.peek(root)` (P17: waits for a running scan, never starts one, never writes; with no record it reports from `collectFirstRun` in memory), reads the key once, and fills each program's section with `briefStatusOf`; `noteBrief` gets the first program whose `gate` is a refusal, else the first program (FR-057). It writes nothing itself and is never gated.

### 17. `cli/mcp/server.ts` (FR-003, FR-044, FR-059)

- `ServerOptions.brief` (`:44–45`) is the widened `BriefToolOptions`.
- `makeServerLayer` (`:71`) builds `const record = makeRecordStore({ beforeScan, recordBeforeRename })`, resolves `stateDir` once, and puts `gate: { record, stateDir }` in the base `context`; each `boundary`/`call` invocation adds `noteBrief`. The start-time scan is a layer of the server graph, not a bare call: `Layer.effectDiscard(record.start(options.cwd))` (`Layer.effectDiscard: <X, E, R>(effect) => Layer<never, E, Exclude<R, Scope>>`, `Layer.d.ts:1318`; `Effect.forkScoped`, `Effect.d.ts:17216`) joins the `Layer.mergeAll(tools, docsResources, newPresentationPrompt)` at `:206–210`. It is built before the server answers `initialize` but does not delay it (the fork returns at once, FR-003), it can never fail the layer (its error type is `never`), and it is interrupted, with the scan aborted, when the server's scope closes.
- `eligian_brief` moves from `boundary` to `call` (`:145–157` → `call(...)`), so `CompilerLock` is provided for adoption (FR-044).
- No change to the stdio, the logger, the instructions or the prompts.

### 18. `cli/main.ts` and `cli/init.ts` (FR-053–FR-055, FR-060)

- `check` (`main.ts:336–375`), `smoke` (`:432–470`), `fmt` (`:539–556`): `for (const line of await cliBriefWarningsFor(patterns, process.cwd())) process.stderr.write(`${line}\n`);` before the command runs. `compile` (`:610`): `cliBriefWarnings([path.resolve(input)], cwd)`. `dev` (`:387–406`): the same for `input`, before `startDevServer`, so it is the first stderr line (SC-010). `process.stderr.write`, never `console.*`, so `smoke --format ndjson`'s console redirect (`:455–458`) does not matter.
- `init` (`:490–504`): `runInit(dir, { …, firstRecord: true })`. In `runInit` after the agent files: `if (options.firstRecord) await writeFirstRecord(target, [path.join(target, STARTER_ENTRY)])`; it leaves an existing `.eligian/programs.json` untouched and writes `{ "version": 1, "programs": [] }` when no other program exists.

### 19. `cli/__tests__/mcp-test-client.ts` (FR-059)

```ts
export type ElicitAnswer =
  | { readonly action: 'accept'; readonly content: Readonly<Record<string, unknown>> }
  | { readonly action: 'decline' } | { readonly action: 'cancel' };
export interface InMemoryClientOptions {
  readonly elicitation?: true;     // initialize announces { elicitation: { form: {} } } (:189)
  readonly onElicit?: (request: { readonly message: string; readonly requestedSchema: unknown }) =>
    ElicitAnswer | Promise<ElicitAnswer> | undefined;   // undefined: never answered
}
export async function startInMemoryServer(options: ServerOptions, client?: InMemoryClientOptions): Promise<InMemoryServer>;
```

The `onStdout` line handler (`:128–132`) recognises a frame with `method === 'elicitation/create'` and an `id`, calls `onElicit(params)`, and (unless `undefined`) `send`s `{ jsonrpc: '2.0', id, result: answer }` when the promise resolves. `InMemoryServer` gains `elicitations(): readonly unknown[]` (the requests seen). Roots stay spawned-only (`mcp-paths.spec.ts:7–9`).

## Data and generation

| Artifact | Input | Generator | Output | Drift test |
| --- | --- | --- | --- | --- |
| Tour baseline (SC-008) | a temp copy of `examples/eligian-tour/` | `pnpm -C packages/cli exec tsx scripts/capture-tour-baseline.ts` (in-process server; `eligian_check`, `eligian_compile` `view: summary`, `eligian_fmt`, `eligian_smoke` with the stub CLI of `mcp-server.spec.ts:38`); refuses to run unless `git diff --quiet 5e47ea9 -- packages/cli/src` exits 0 | `__fixtures__/mcp/brief/tour-baseline/{check,compile,fmt,smoke}.json` (header and temp paths normalised to `<TMP>`) | `mcp-brief-additions.spec.ts` deep-equal; the compliance check runs `git log --format=%H -- …/tour-baseline` and expects exactly one commit-to-be (the files are never regenerated) |
| Gate-row fixtures | spec FR-012 | hand-written `BRIEF.md` / `programs.json` / `.eligian` per row; signed lines made by `brief-helpers.ts` › `approvedBrief(dir, stateDir)` (through the tool, never hand-made HMACs) | `__fixtures__/mcp/brief/gate/<row>/` | `brief-gate.spec.ts` |
| Storyboard fixtures | spec FR-029, FR-039 | hand-written | `__fixtures__/mcp/brief/storyboards/{pass,<problem>}.md` | `brief-signoff.spec.ts`, `mcp-brief-additions.spec.ts` |
| `tools/list` snapshot | the server | `mcp-server.spec.ts` | `__snapshots__/tools-list-phase3.json.snap` | SC-019: `git diff` touches only the `eligian_brief` entry and `eligian_project`'s output schema |
| `brief-questions` chunk | `TREE` | `generateKnowledge` (unchanged) | `dist/docs/generated/brief-questions.md` | unchanged: no question added or reworded (`TREE_VERSION` 1); `mcp-knowledge.spec.ts` stays green |

## Test plan

Every new spec is written first and run red. Paths are under `packages/cli/src/__tests__/` unless noted. Temp projects: `fs.realpathSync(fs.mkdtempSync(…))`; every spec that signs passes `brief: { stateDir: <temp> }` (P15 is the safety net).

| FR / SC | Spec file | `describe` › `it` | Assertion strategy |
| --- | --- | --- | --- |
| FR-012, FR-032–FR-034, SC-001 (pure half) | `brief-gate.spec.ts` | `gateVerdict` › `row <n>: <situation> → <verdict>` (`it.each`, rows 1–9; row 3 with answers changed after approval; row 4 for `first-run` and `accepted` with open, complete, confirmed, changed, hand-edited and other-key briefs); › `a not-known program with another key's confirmation is brief-not-confirmed (row 7)`; `triggers` › `a new timeline / language / extensions block / storyboard view` (also under rows 3 and 4, measured against the record entry); › `several triggers in program order`; › `non-triggers: interaction, asset, beat, class`; › `row 3 with a brief changed after approval (computed complete) and storyboardViews set: a new storyboard view is addition-not-briefed`; `approvedDirectory (P21)` › `an entry in the dir via brief / addition / adopted → true whatever the state`, › `only first-run / accepted entries and state complete → false`, › `no entry and state approved → true`, › `an entry via brief in another directory → false`; `classifyKnownChange (FR-009, R-15)` › `scan equal to the entry → unchanged`, › `Logic → Logic 2 (1 removed, 1 new) → rename`, › `1 removed + 2 new → addition, triggers = both new names in program order`, › `rename + a new language code → addition (the language is a trigger)`, › `rename + a new extensions block → addition`, › `a new name that is an approved addition of the directory (Outro) → unchanged`, › `a removed name and nothing new → rename (the entry's timelines are replaced)` | pure `GateInput` / `ProgramScan` / `RecordEntry` literals; `toEqual` on the verdict and the `KnownChange` |
| FR-010, FR-013, FR-014, FR-016, FR-017, SC-001 (server half), SC-013 stand-in, SC-023 | `mcp-brief-gate.spec.ts` | `per row` › `<tool> on row <n>` (`it.each` over check, fmt, compile, smoke, init × rows); `the gate runs first` › `a refused call takes no lock and spawns nothing`, › `a runs row takes the lock / spawns` (control); `globs` › `a library alone is never refused`, › `a glob over a refused and a known program fails listing only the refused one`; `eligian_init` › `blank, chapters, video, library into an empty dir: brief-required, nothing written, no lock`, › `library with an approved brief runs`; `under an approved brief (SC-023)` › `each template records main.eligian via brief with S2 ∪ starter timelines, L1 ∪ starter languages`, › `the next check runs`, › `an appended timeline is addition-not-briefed`, › `a refused init leaves the record unchanged`; `never gated` › `docs, operations, project succeed in every row`; `new presentation end to end` (SC-013 stand-in) › `brief-required → brief-incomplete → (confirm, elicitation) storyboard-not-approved → (approve, elicitation) runs` | `startInMemoryServer({ cwd, brief: { stateDir }, lock: compilerLockLayer({ onQueued: () => queued++ }), smoke: { cliPath: STUB, onSpawn } }, { elicitation: true, onElicit })`; a refusal: `isError`, `payload.error.kind === 'gate'`, `gate.code`, `gate.round` deep-equal to a `status` call's `round` on the same directory, files' bytes and `mtimeMs` unchanged; and for every refusal row the FR-017 payload: `gate.program` is absolute and equals the refused file, `gate.brief === path.join(dir, 'BRIEF.md')`, `gate.directory === dir`, `gate.state` is `'none'` on row 2 and the directory's `status` state otherwise, `gate.refused` lists exactly the refused programs; on row 2 `gate.next` contains `action: accept-existing` and `action: status` (FR-012 row 2's "work that did not come from the agent"; FR-017's example wording) |
| FR-001–FR-008, FR-062, FR-064, SC-002, SC-022 (record half), SC-024 (record half) | `brief-known-programs.spec.ts` | `first run` › `records a.eligian (not lib.eligian) via first-run, .gitignore is "*\n"`, › `no signature field`; `across processes` (spawned, `skipIf(!built)`) › `B refuses b.eligian, runs a.eligian`; `announced roots` (spawned, roots client) › `B scanned at the first call, C and A untouched`; `deleted record` › `a program written after start is brief-required; the record is written back on the next record write`; `invalid record` › `a known program's call is brief-required naming the problem; the file is unchanged`, › `programs.json is a directory → the gated call fails kind io naming the path, nothing written` (FR-006's "another reason"); `failed scan (FR-003, Risk 6)` › `beforeScan rejects once: the server stays up, the first gated call fails io, the second scans and runs` (the cwd retry of §2 step 2), › `a file named .eligian in the cwd: initialize answered, no unhandled rejection (a process 'unhandledRejection' spy stays uncalled), every gated call fails io, eligian_docs succeeds`, › `close() while beforeScan holds the scan: after release, no .eligian/programs.json appears (aborted scan)`; `concurrency` › `20 accept-existing in Promise.all leave 20 entries`; `no start scan (FR-062)` › `skipStartScan(root)` true for `path.parse(cwd).root` and `os.homedir()` (case-insensitive on win32), › `home cwd (vi.stubEnv HOME/USERPROFILE to a temp dir): no scan, no .eligian, every program brief-required`, › `announced root B scanned at first call` (spawned), › `500 programs recorded whole`; `merge (FR-007)` › `(a) a foreign x.eligian survives, the call's values win`, › `(b) 6 seam runs, then io "programs.json changed while writing; call again", foreign file kept`; `first-run never merges (P10)`; `purity` › `files.ts, known-programs.ts, gate.ts, signature.ts reach no @eligian/language and no check-command (transitive relative-import walk)`, › `LANGUAGE_CODE agrees with isValidLanguageCode` (P1), › `no console / process.stdout in brief/{gate,known-programs,signature,adopt}.ts` (SC-014) | `parseRecord(readFileSync(...))`; seams from `ServerOptions.brief`; the import walk reads sources with a regex over `from '…'` and follows `./`/`../` specifiers |
| FR-002, SC-003 | `brief-known-programs.spec.ts` › `scanProgram equals the parser` | › `every .eligian under examples/, cli fixtures, language fixtures and every starter` (logs the count), › hand cases (`"https://x"`, `timeline` in a comment, a block comment between `timeline` and its name, the contrived `// a /*` / `library x` / `"*/"` file: `library: true`, the parser's answer; the CLI's `isLibrary` gives `false` there) | `withLoadedDocuments([file], l => l.documentOf(file).parseResult.value)`; `library` = root `$type === 'Library'` and `isLibrary(source)`; `timelines` = `timelineNames`; `languages` = `languages.entries` codes; `extensions` = `hostModuleOf(program) !== undefined` |
| FR-018–FR-022, FR-063, SC-004, SC-005 | `brief-signoff.spec.ts` | `the form` › `one required boolean, no number/integer/array`; `outcomes` › `accept true`, › `accept false and decline (with and without confirmation)`, › `cancel (with and without confirmation) → elicitation-unavailable, summary = message, ticket, bytes unchanged`, › `the ticket signs agent-reported verbatim, no elicitation frame`, › `a ticket from before a hand edit / a hand-typed ticket elicits again`, › `no answer (elicitationTimeoutMs: 200) within 2 s`, › `no capability: no frame; confirmation signs agent-reported`, › `accept with content {} is declined (P6), nothing written, and stderr has one "elicitation answer did not decode" line` (`vi.spyOn(process.stderr, 'write')`: `stderrLoggerLayer` looks `process.stderr.write` up on every call, `stdio.ts:54–59`, `:89`), › `a JSON-RPC error answer is cancelled (P6)`; `the form` also asserts one `elicitation/create` frame per form field (`confirmed`, `approved`, `accepted`), so a form whose request parameters do not decode (the other `SchemaError` path of `elicit`, P6) cannot pass; `the same for approve-storyboard and accept-existing`; `accept-existing ticket` › `verifies while scans are equal; a timeline appended → elicits again; a copy edit → still verifies`; `messages` › `confirm names BRIEF.md, the delegated answer, the conflict`; › `approve-storyboard names STORYBOARD.md and its counts`; › `accept-existing names each program and its timelines`; `no permit during a dialog (SC-005)` › `status resolves while the dialog is pending`, › `a hand edit during the dialog → io "BRIEF.md changed while asking; call again", edit kept` (and `STORYBOARD.md`), › `notifications/cancelled during the dialog: no frame for the id, status within 2 s, a late answer changes nothing`, › `accept-existing: an appended timeline → io "a program changed while asking; call again", record unchanged; a copy edit → accepted with the shown scans` | the FR-059 client; `onElicit` returning a deferred; `server.notify('notifications/cancelled', { requestId })` as `mcp-concurrency.spec.ts:541–565` |
| FR-028–FR-031, SC-007 | `brief-signoff.spec.ts` › `approve-storyboard` | › `refused before confirmation`, › `storyboard-missing`, › `<problem fixture> gives exactly <code>` (`it.each`, the 15 SC-007 fixtures), › `a passing storyboard approves; the record has R3 via brief; check runs` | `refused.problems.map(p => p.code)` equals `[code]` |
| FR-023–FR-027, SC-006 | `brief-signature.spec.ts` | `forged` › `state: approved + typed hmac line is complete`; `another key` › `(a) no program: init and check brief-not-confirmed, one dialog`, › `(b) known first-run program: check/compile/fmt run; CLI with state dir B prints nothing with the record, one line (complete) without`, › `row 4 for open, complete, hand-edited`; `before approval` › `a tool change → brief-changed with exactly the changed ids; a hand edit → brief-not-confirmed; the dialog names only changed ids`; `after approval` › `a tool change and a hand edit leave check running; status reports complete (+ changed); an appended timeline is addition-not-briefed; an S2 view added through the tool does not let that timeline pass`; › `a copied approval line does not verify`; `the key` › `none after initialize`, › `two ensureKey + two servers signing concurrently: one key, both lines verify; 0o600 on POSIX`, › `20 ensureKey in Promise.all on an empty dir all resolve to the same key; no *.tmp left` (the link step), › `a readKey racing an ensureKey sees undefined or the whole key, never an empty or partial one` (100 iterations), › `a malformed brief-key fails EINVAL and is not overwritten`; `stateDirectory (FR-023)` › `it.each` over `(env, platform, home)`: `ELIGIAN_STATE_DIR` set wins on every platform; win32 with `LOCALAPPDATA` → `<LOCALAPPDATA>\eligian`; win32 without → `<home>\AppData\Local\eligian`; darwin → `<home>/Library/Application Support/eligian`; linux with `XDG_STATE_HOME` → `<XDG_STATE_HOME>/eligian`; linux without → `<home>/.local/state/eligian`; and the server's `ServerOptions.brief.stateDir` wins over `ELIGIAN_STATE_DIR` (in-process, the key appears in the option's dir); `ticketValid` › `a ticket of the wrong length, a non-hex ticket, an empty ticket, a ticket without the hmac-sha256: prefix → false, no throw`, › `no key → false`, › `the right ticket → true; one changed part → false`; › `a Phase 1 sha256 line is not valid and round-trips`; `verifyBriefFile` › `equals the server for each case` | `parseBrief` + `verifyBrief`; spawned CLI for the terminal half (`skipIf(!built)`) |
| FR-032–FR-040, SC-008, SC-013 stand-in | `mcp-brief-additions.spec.ts` | `the tour unchanged` › `check/compile/fmt/smoke deep-equal the baseline`; `a view` › `Outro → addition-not-briefed, scope, round has V1:Outro`, › `scoped interview, confirm, approve section → runs, record lists Outro`; `a language` › `de-DE → L2 round`; `a host module` › `extensions on demo → H1 in round`; `edits` › `a new on click and a new beat in Hub run`; `briefed project` › `a timeline / a ## view section outside S2`, › `after approval, a hand edit to BRIEF.md (state complete), then a ## view X section in STORYBOARD.md → addition-not-briefed with scope { addition: 'view', name: 'X' }` (P21, FR-031/FR-033); `later programs (FR-040)` › `in a briefed, approved directory with an approved Outro addition, a program written later (not in the record) whose timelines are S2 names plus Outro runs (row 9)`, › `a program written later with a timeline that is neither S2 nor an approved addition → addition-not-briefed for that name`; `several triggers` › `order and scope`; `section storyboard (FR-039)` › `<fixture> → storyboard-mismatch <code>, nothing written` (`it.each`, 5); `accept-existing` › `refuses an addition (no dialog, record unchanged)`, › `takes the Logic → Logic 2 rename`, › `renaming Logic to Outro, an approved addition of the directory, is accepted as a rename, not refused as an addition` | temp copy of `examples/eligian-tour/` made **before** the server starts; baseline JSON with `<TMP>` substitution |
| FR-041–FR-049, SC-009 | `mcp-brief-adopt.spec.ts` | `tour` › `S2 9 names in order, S6 9 raf, L1 en-US default + nl-NL, S3 Hub, I2 has Escape and space, H1 not none, R3 tour.eligian (all by: code)`, › `S4 rows: 8 click #card-…, 8 key <n>, an Escape → Hub per chapter`, › `I1 not none; V2 "in the code: tour.eligian"; V5 per FR-042; V6 of Hub; counts.fromCode > 0`, › `no round contains a fact id until complete; answer S2 is rejected fact`, › `C3 [mouse] → conflict C3, I2`; › `C3 [keyboard] → conflict C3, S4`; `lock` › `status/answer/confirm without adopt: 0; one adopt call: 1`; `facts re-read` › `Logic renamed: S2 updated at the call's round; the renamed view's V questions reopen`; `gate` › `before approval check runs`, › `confirm, approve fixture storyboard, a timeline outside S2 → addition-not-briefed`, › `an addition during adoption: status with the refusal's scope is accepted`; `fixtures` › `action-nav: S4 rows for A and C`, › `remote-video: C5 offline → conflict C5, S6`; `demo` › `S3/S4 not applicable, L1 fact`, › `existing STORYBOARD.md → existing-storyboard approval, verifyBriefFile valid, via adopted` | temp copies; `compilerLockLayer({ onQueued })` |
| FR-009, FR-037, FR-041, FR-047, FR-051, SC-021 | `mcp-brief-refusals.spec.ts` | one `it` per code: `governed-by-brief`, `addition-not-briefed`, `not-an-addition` (a name already in the approved set; and, P20, `{ addition: 'view', name: 'a:b' }`, `name: ' Outro'` and `{ addition: 'language', name: 'german' }`, each naming the rule, no section created), `brief-not-approved`, `adopt-program` (empty, two programs, `a:b`), `adopt-briefed`; › `accept-existing on lib + program writes the program, skips the library`; › `a second accept-existing after a rename replaces timelines` | `refused.code`; every file's bytes compared before/after |
| FR-053–FR-055, SC-010 | `cli-brief-warning.spec.ts` (`cli` project, spawned `bin/cli.js`, `skipIf(!built)`) | `<command>` (`it.each` over `check --format json`, `check --format github`, `compile -o -`, `smoke --format ndjson`, `fmt --check`) › `stdout and exit code identical with and without an open BRIEF.md; one more stderr line matching the regex`; › `record without the program: one "is none" line`; › `no record: no line, no .eligian created`; `read failures` › `unparsable record / BRIEF.md directory: stdout, exit, stderr identical`; `existing work` › `each via × open/complete/changed/other-key: no line; same open brief with no record: one line`; `dev` › `the line is the first stderr line, once` (child killed after the first stdout line), › `no .eligian/programs.json after the run` (not the absence of `.eligian/`: `dev` creates `<entry dir>/.eligian/` for its own `dev-errors.json`, `dev/dev-server.ts:143`, `:173`); `no key (FR-055)` › every run of every command above, `dev` included, gets its own empty `ELIGIAN_STATE_DIR` (a fresh temp dir) and the dir is still empty afterwards (no `brief-key`, no `*.tmp`) | `spawnSync(process.execPath, [BIN, …], { cwd, env: { …, ELIGIAN_STATE_DIR } })`; `Buffer.equals` on stdout; `fs.readdirSync(stateDir)` equals `[]` |
| FR-060, SC-022 | `init.spec.ts` (edited) + `brief-known-programs.spec.ts` | `eligian init writes the first record` › `<template> into an empty dir: programs: [], .gitignore`, › `a.eligian + lib.eligian: exactly a.eligian via first-run`, › `an existing programs.json is byte-identical`, › `a server there does not scan (beforeScan never called); check main.eligian brief-required; a.eligian runs`; `the CLI checks write no record` (in `cli-brief-warning.spec.ts`) | spawned `eligian init`; the in-process server with `beforeScan: vi.fn()` |
| FR-003, SC-015 | `package-bin.spec.ts` (edited, P18) + `brief-known-programs.spec.ts` | `mcp answers initialize in under 3 s with 200 programs; the first check on an existing program runs`; `beforeScan holds the scan` › `initialize answered; check and status still pending after 300 ms; after release, check runs (not brief-required) and status returns` | spawned bin; in-process deferred seam |
| FR-056, SC-011 | `mcp-project.spec.ts` (edited) | `brief section` › `known unbriefed: file null, state none, known, runs`, › `governed open: state, counts, brief-incomplete`, › `approved: runs`, › `writes nothing`; `never scans (P17)` › `first call while beforeScan holds the start scan: it waits, then reports known: true; still no write by the tool` (the scan's own write is the server's), › `first call on an unscanned announced root (spawned, roots client): known: true for its programs, gate equal to the next eligian_check's verdict, and no .eligian/ under that root afterwards`, › `FR-062 cwd (vi.stubEnv HOME/USERPROFILE to the temp dir): known: false, gate brief-required, no .eligian/` | snapshot of the project's files (recursive, `.eligian/` included) before/after the `eligian_project` call |
| FR-057, SC-012 | `mcp-telemetry.spec.ts` (edited) | `brief state` › `refused check: { state: open, gate: brief-incomplete }, ok false`, › `successful check on a known unbriefed program: brief equals { state: 'none' } (no gate key), ok true` (P13's note on the success path), › `successful compile under an approved brief: brief equals { state: 'approved' }`, › `eligian_brief line has its state`, › `eligian_brief with scope { addition: 'view', name: SENTINEL } and paths [a, b]: args.scope === 'addition:view', args.paths === 2, SENTINEL absent from the line`, › `scope 'adopt' → args.scope === 'adopt'; no scope → 'presentation'`, › `eligian_project line`, › `docs and operations have no brief`, › `sentinels absent` | `ELIGIAN_MCP_LOG` file lines parsed |
| SC-014 | `mcp-stdout.spec.ts` (edited) | `elicitation frames keep stdout pure` (spawned, `initialize` with `capabilities: { elicitation: { form: {} } }`: a refused gated call, `confirm`, `approve-storyboard`; each `elicitation/create` answered through `send`) | ≥ 1 frame with `method: 'elicitation/create'` and an `id`; `expectOnlyFrames(stdoutLines)` |
| SC-018 (as amended, Review notes) | the Phase 1 specs `brief-engine`, `brief-file`, `brief-tool`, `brief-tool-defect`, `brief-tool-tree-version`, `brief-tree`, `brief-values`, `mcp-brief-interview`, `mcp-brief-restart` | the golden byte-identity unchanged; every edit is one of the **Phase 1 edit list** below and nothing else; `mcp-brief-interview.spec.ts`'s round counts unchanged | compliance runs `git diff 19abdea -- <the nine files>` and maps every hunk to one entry of the list |
| FR-035, FR-041 (disk format) | `brief-file.spec.ts` (new cases) | `addition sections` › `the spec's "An addition in a project that had no brief" example (__fixtures__/mcp/brief/addition-no-brief.md) parses and writes byte-identically`, › `a main brief plus an addition: ## Addition: view Outro comes after the last view section and before ## Facts, its header lines are - state:, - confirmation:, - approval: in that order, then its ### answer blocks`, › `two additions keep their creation order`, › `an unknown ## section stays after ## Facts`, › `the no-brief file has the Phase 1 header lines, no idea paragraph, no branch or view section`; `scope line` › `- scope: adopt is written directly after - tree: and only when set; a file without it is byte-identical to Phase 1's writer` | golden fixture byte comparison; line-index comparisons on the written text (`lines.indexOf('## Facts') > lines.indexOf('## Addition: view Outro')`, …) |
| FR-036, FR-047 (scoped trees), P11, P20 | `brief-scoped.spec.ts` (new) | `view` › `V1–V6 are instantiated for <name> only (ids V1:Outro …)`, › `S4 is a table with columns view/target/trigger; a row naming neither <name> as view nor as target is rejected; none is accepted`, › `S5, S6 and D5 are records with no view column; S6 keeps checkS6's per-row rule`, › `I4 is absent when the presentation has one view (context S2 has none and the record one timeline) and present when the addition makes it two`, › `A1–A6 apply only to the assets the addition names (its V3 and S6), with Phase 1's applies-when`, › `V6 applies when context.get('C3') is undefined (R-8) and follows C3 when it is set`; `language` › `L2 is a record with columns supplier and when; L3, L4, L5 present; no other question`; `host-module` › `H1 rejects none; H2, H3 present`; `additionHeading` › `the three headings`; `names (P20, through the tool)` › `view name a:b, a leading space, 65 characters → not-an-addition naming the rule`, › `language name german → not-an-addition`, › `a name already in the approved set → not-an-addition` | pure: `scopedTree(scope, { get })` with a map-backed context, then `evaluate` / `validateValue` on the result; the name cases in process through `eligian_brief` |
| FR-047 | `brief-values.spec.ts` (edited) | `S2 names` › `accepts "Timeline & Time", "Files & Imports"`, › `rejects ":" "|" leading/trailing space, 65 chars` | `validateValue` |
| SC-019, FR-052 | `mcp-server.spec.ts` (edited) | `nine tools`; `tools/list matches the snapshot`; `upfront descriptions ≤ 1000`; `instructions unchanged` | `git diff -- …tools-list-phase3.json.snap` reviewed in compliance |
| SC-017, SC-020, SC-024 | compliance commands; `brief-known-programs.spec.ts` › `paths` (`it.runIf(win32)` backslash / drive case / `brief.md`; `it.skipIf(win32)` `brief.md` does not govern) | `git status --porcelain` after `pnpm test` is empty; `grep -n` over `roadmap.md` §4.2/§4.5/§6.3/Phase 3 | |

**FR-058 inventory** (the 23 specs that start a server, `grep -l "startInMemoryServer\|spawnServer"`, plus the helper): `brief-tool-defect`, `brief-tool-tree-version`, `mcp-brief-restart`, `mcp-docs`, `mcp-operations`, `mcp-registry`, `mcp-resources` call no generation tool and stay as they are; `mcp-soak-mixed` calls `eligian_check`, `eligian_project`, `eligian_compile`, `eligian_fmt` and `eligian_operations` through `mcp-tool-mix.ts:25–33` (so the literal grep misses it) on a copy of the tour made before the server starts (`copyProject`), which the start-time scan records: it is expected to stay green and runs in the soak gate. The 15 that call one (`brief-tool`, `mcp-brief-interview`, `mcp-check`, `mcp-compile`, `mcp-concurrency`, `mcp-fmt`, `mcp-init`, `mcp-paths`, `mcp-prompts`, `mcp-server`, `mcp-smoke`, `mcp-soak-check`, `mcp-staleness`, `mcp-stdout`, `mcp-telemetry`) are run red after the gate lands; each failure is fixed by exactly one of FR-058's three moves: (1) the program exists before the server starts (most: the fixture dirs `CLEAN`, `CHECK_CASES`, `SMOKE_ROOT`, `FIXTURE` are scanned at start), (2) an approved brief made through the tool with `brief-helpers.ts` › `approvedBrief`, (3) asserting the refusal (`mcp-init.spec.ts`: `eligian_init` without a brief is `brief-required`; its existing cases move to an approved brief). `mcp-telemetry.spec.ts` lines gain `brief`; equality assertions on whole lines use `toMatchObject`. The two Phase 1 specs among the 15 change as entries 4 and 5 of the list below; their other cases are already green under move (1) or call no generation tool.

**Phase 1 edit list** (SC-018 as amended; the complete set of changes to the nine Phase 1 spec files, each tied to the FR that forces it; anything else in their diff is a defect):

1. **Confirmation-line format (FR-024, FR-027).** `brief-file.spec.ts:350–369`: the regex becomes `/^- confirmation: agent-reported <ISO> round \d+ hmac-sha256:[0-9a-f]{64}$/m` and the `sha256:${digest([P1])}` expectation (`:369`) becomes the HMAC line built with a test key; `brief-tool.spec.ts:551`: the same regex, its capture groups renamed. Any other `brief-tool.spec.ts` case that reads the confirmation line by regex gets the same substitution.
2. **Confirmed by HMAC, not by digest (FR-024, P4).** `brief-engine.spec.ts:589–612`: the two cases build their `Confirmation` with `round` and an `hmac` from `makeSigner(testKey)` and pass `fakeFacts({ signer })`, instead of `digest: digest(COMPLETE.answers)`; their verdicts (`confirmed`, `complete`) are unchanged. `describe('confirm')` (`:1889–1924`): the calls take the new signature `confirm(brief, 'agent-reported', message, now, evaluation, signer, 'brief')` (§4) and `fakeFacts` gains an optional `signer`; the first case's expected `Confirmation` has `round` and `hmac` in place of `digest`; the two other cases' verdicts (`confirmed`; `complete` / `open` after a change) are unchanged. `digest (FR-022)` (`:616–644`) is unchanged (`digest` keeps its value, §3).
3. **Widened S2 rule (FR-047).** `brief-values.spec.ts:339–341`: `a:b` and `a|b` stay rejected with the new message text (`no ":", "|", …` instead of `must match`); `-intro` moves from the rejected table to the accepted cases (the widened rule allows a leading `-`).
4. **FR-058 move (1) in `brief-tool.spec.ts` › `status completes while a latched lock holds a check` (`:759–787`).** Today the test writes `main.eligian` after `restart(...)` (`:770`) and awaits `reached.promise`, which resolves only when the check takes the compiler lock; under the gate (FR-014) that program is not known, the check is refused `brief-required` before the lock and the test would hang. New setup: `await ok({ action: 'status' })` (awaits the first server's start scan; with no file and no idea it writes nothing, `:301`), write `main.eligian`, `fs.rmSync(path.join(root, '.eligian'), { recursive: true, force: true })`, then `restart(...)`, whose start scan records `main.eligian` (row 4, runs, takes the lock). The assertions are unchanged.
5. **FR-056 in `mcp-brief-interview.spec.ts` › `not gated (SC-003)` (`:263–313`).** The program is copied before the server starts (`:270–271`), so it is known (move 1) and row 4 runs every call; but the `eligian_project` result (`:283`) gains `brief`, which differs with and without `BRIEF.md`. `expect(withBrief).toEqual(without)` (`:311`) compares the five results with `programs[].brief` removed from the `eligian_project` payload; two added assertions check that field: without the file `{ file: null, state: 'none', known: true, gate: 'runs' }`, with it `state: 'open'`, `gate: 'runs'`. The `describe` title stays (the tools are still not gated by an open brief on a known program).

`brief-tool-defect`, `brief-tool-tree-version`, `brief-tree` and `mcp-brief-restart` have no entry: they are expected unchanged (`mcp-brief-restart` and `brief-tool` keep importing `makeFacts` through the re-export, P3).

## Build integration

- **`packages/cli/package.json`**: no change (no dependency, script, `files` or `exports` change). `package-bin.spec.ts` "imports only Node built-ins and the dependencies" stays green: `node:crypto` and `node:os` are built-ins.
- **`packages/cli/esbuild.mjs`**: no change. `scripts/capture-tour-baseline.ts` is not bundled (run with `tsx`, like `scripts/generate-knowledge.ts`).
- **`packages/cli/vitest.config.ts`**: `test.env.ELIGIAN_STATE_DIR` (P15). No project change; `cli-brief-warning.spec.ts` stays in `cli` (it measures no time).
- **`biome.json`**: `"!!**/.eligian"` in `files.includes` (P14).
- **`.github/workflows/ci.yml`**: no change (tool list unchanged; `guard-ci-gates.cjs` reads it).
- **Docs**: `packages/cli/AGENTS.md`: the `brief/` line names `known-programs`, `gate`, `signature`, `adopt` and says the five generation tools refuse until the brief is approved and the CLI only warns. No README, CHANGELOG, instructions, prompt or chunk change (Phase 3, spec non-goals). `roadmap.md` §4.2/§4.5/§6.3 edits are already applied (SC-024 greps them).

### Gates

| When | Gate |
| --- | --- |
| first group, first task | the SC-008 capture (refuses unless `packages/cli/src` equals `5e47ea9`) |
| every group | `pnpm typecheck`, `pnpm run ci`, scoped `pnpm -C packages/cli exec vitest run <specs>` |
| every group touching `mcp/` or `check/files.ts` | `pnpm effect:check:cli` (0/0/0) |
| the group that wires the gate into the tools | the 15 FR-058 specs, scoped |
| last group | `pnpm build`, `pnpm typecheck:tests`, `pnpm check`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm effect:check`, `pnpm run check:examples`, `pnpm run smoke:examples`, `pnpm run fmt:examples` (the CLI is not gated and no example has a `BRIEF.md` or record, so their output is unchanged), `pnpm -C packages/cli run test:soak` (the soak runs `eligian_check` 2 × N times through the gate), `git status --porcelain` empty (SC-017) |

## Risks and mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | **Concurrency on the Langium singleton** | The gate is a text scan and a Markdown parse; it never loads a document or takes the lock (FR-014, SC-001's lock count). Only adoption loads a program, inside `lock.run` (FR-044), read before the brief permit is taken so the permit is never held while waiting for the lock. |
| 2 | **Lock cycles** (brief permit, record semaphore, compiler lock) | One order: compiler lock (adoption read, released) → brief permit → record semaphore (P19). An elicitation holds none (FR-022). |
| 3 | **Cancellation mid-write** | Every write section is `Effect.uninterruptible` once acquired (Phase 1 P18); the dialog is interruptible and outside it, so `notifications/cancelled` ends a pending dialog without a write (SC-005). |
| 4 | **jsdom globals** | Not loaded by any new path; `eligian_smoke` still spawns the child after the gate. |
| 5 | **Stdout pollution** | No `console`/`process.stdout` in the new modules (grep test); the CLI warning uses `process.stderr.write`; the elicitation request is a protocol frame (SC-014). |
| 6 | **Startup time; a background scan that fails or outlives the server** | The scan is forked into the server layer's scope (`Layer.effectDiscard` + `Effect.forkScoped`, §17); `initialize` never waits (SC-015, 200 programs < 3 s in `cli-bin`). The stored scan promise settles to a `ScanResult` and never rejects, so a failure (EACCES, a file named `.eligian`, a `beforeScan` rejection) cannot become an unhandled rejection (the server installs no `unhandledRejection` handler; Grep finds one only in `smoke/smoke-runner.ts:438`); it fails the next gated call `io` and that entry is dropped so the call after it retries (§2). Closing the server aborts the scan before its rename, so an in-process spec's temp or fixture directory gets no late `programs.json`. Tested in `brief-known-programs.spec.ts` › `failed scan`. |
| 7 | **The developer's real key** | P15 (vitest `ELIGIAN_STATE_DIR`); the key is created lazily, never at start (SC-006). |
| 8 | **Fixture directories gain `.eligian/`** | Self-ignoring `.gitignore` (git), `!!**/.eligian` (Biome, P14), `git status --porcelain` in the last gate (SC-017). Parallel specs on one fixture dir: the first-run write aborts when another wrote first (P10), so both see one record. |
| 9 | **Windows paths** | Record paths `/`-separated and root-relative; lookups compare with `isInside`'s rule; `BRIEF.md` lookups rely on the file system's case rule (SC-020 on both OSes); `writeFileAtomic`'s rename retry covers an editor holding the file. |
| 10 | **`McpServer.elicit` is unstable** (roadmap risk 6) | `effect` pinned at 4.1.4; the two edge cases read from its source are covered by tests (P6) so a bump that changes them fails loudly. |
| 11 | **Coverage thresholds** (CLI 77.1 / 77.6 / 64.5 / 76.6) | The pure modules (`gateVerdict`, `classifyKnownChange` in `brief-gate.spec.ts`; `scanProgram`, `parseRecord` in `brief-known-programs.spec.ts`; `checkStoryboard` in `brief-signoff.spec.ts`; `scopedTree` in `brief-scoped.spec.ts`; `stateDirectory`, `ticketValid`, `ensureKey` in `brief-signature.spec.ts`) are unit-tested branch by branch; the tool paths in process. `test:coverage:ci` in the last group; add tests, never lower a threshold. Language thresholds untouched. |
| 12 | **Effect LSP findings** (`tryCatchInEffectGen`, `globalErrorInEffectFailure`, `unstableApiUsage`) | Catching helpers outside `Effect.gen`; only tagged errors; the `unstableApiUsage:off` header on `tools/brief.ts` and `known-programs.ts` (Semaphore is stable; the header is needed only where `ai.*` is used). |
| 13 | **The 14 eval cases stop at `brief-required`** | Expected (spec Differences 11); no CI job runs them; Phase 3 adds brief fixtures. |
| 14 | **A developer runs `eligian mcp` at the repo root** | The first-run scan records every repo `.eligian` there (`.eligian/` is ignored by git and Biome). The examples gates print no line: an ungoverned, recorded program is existing work, and an unrecorded one prints only when a record exists. Not a CI path. |
| 15 | **The engine grows** (approved, facts, additions) | Additions reuse `evaluate` via `Facts.views` (P11); signing is a closure (P4); scoped trees live in `scoped.ts`, so `engine.ts` changes stay local to state and fact handling. |

## Suggested task groups (for tasks.md)

1. **Baseline and foundations.** The SC-008 capture (first task, on the untouched tree). `check/files.ts` + re-export, `paths.ts` import (P2), `references.ts` local regex (P1), `brief/facts.ts` (P3), `brief/wire.ts` (P5), `biome.json` and `vitest.config.ts` (P14, P15). `[P]` within the group after the capture.
2. **Record.** `known-programs.ts` (scan, format, store, `writeFirstRecord`), `brief-known-programs.spec.ts` (scan-equals-parser, record, merge, purity).
3. **Signature and engine.** `signature.ts`, the engine/brief-file/tree edits (approved, signed lines, `by: code`, additions, S2 rule), `brief-signature.spec.ts` (pure half), the `brief-file.spec.ts` FR-035/FR-041 cases, entries 1–3 of the Phase 1 edit list (SC-018). `[P]` with group 2.
4. **Gate.** `gate.ts` (`gateVerdict`, `approvedDirectory`, `classifyKnownChange`, governance), `scoped.ts`, `storyboard.ts` FR-030, `storyboard-check.ts`, `errors.ts` kind `gate`, `brief-gate.spec.ts`, `brief-scoped.spec.ts`.
5. **Wiring.** `server.ts` (store, start scan, `call`), `telemetry.ts`, the five tools and `project.ts`, `mcp-test-client.ts` (FR-059), `mcp-brief-gate.spec.ts`, the FR-058 adaptations (entries 4 and 5 of the Phase 1 edit list among them), SC-011, SC-012.
6. **Sign-off.** `tools/brief.ts` actions (`confirm` by dialog, `approve-storyboard`, `accept-existing`, tickets), `brief-signoff.spec.ts`, SC-014.
7. **Additions and adoption.** Scope handling, `adopt.ts`, `mcp-brief-additions.spec.ts`, `mcp-brief-adopt.spec.ts`, `mcp-brief-refusals.spec.ts`. Adoption `[P]` with additions.
8. **CLI.** The warning in `main.ts`, `runInit` `firstRecord`, `cli-brief-warning.spec.ts`, `init.spec.ts`, SC-015 in `package-bin.spec.ts`.
9. **Docs and gates.** `packages/cli/AGENTS.md`, the snapshot review (SC-019), the full gate set, SC-013 (manual Claude Code run, recorded in `compliance.md`), SC-017, SC-024.

## Review notes

- Proposed spec-row updates (applied here as plan readings, recorded in `compliance.md`): FR-020 for P6 (an elicitation answered with a JSON-RPC error is `cancelled`; an accept whose content does not decode, a `SchemaError`, is `declined` after a stderr log line; every other defect of the dialog is `internal`); FR-037/FR-051 for P20 (an addition name outside FR-047's rule, or a language name that is not a code, is `not-an-addition`; no new code); FR-033 for P21 ("briefed, approved directory" = an entry of that directory in the record with `via` `brief`, `addition` or `adopted`, or a brief that computes `approved`); FR-004/FR-056/SC-011 for P17 (`eligian_project` never starts a scan: it waits for a running one and otherwise reports from the in-memory first-run record, so it writes nothing and its `known` matches the next gated call); **SC-018** (the Phase 1 specs change only in the confirmation-line format and the HMAC-based confirmation, FR-024/FR-027, in the widened S2 rule, FR-047, and by FR-058's moves in two named cases: `brief-tool.spec.ts`'s latched-lock case writes `main.eligian` before `restart`, and `mcp-brief-interview.spec.ts`'s `not gated` block compares the five results ignoring `eligian_project`'s new `brief` field; the exhaustive list is the "Phase 1 edit list" under the Test plan); **SC-022** (`dev`'s "creates no `.eligian/`" holds only up to its own `.eligian/dev-errors.json`, which `dev` has always written, `dev/dev-server.ts:143`, `:173`; for `dev` the check is that no `.eligian/programs.json` is created); FR-002 for P1/P2 (the language-free set is reached by changing `references.ts` and `paths.ts` imports); SC-022's grep target for P9 (the record code, not `init.ts`, which already imports the language package for its starters); the spec's component table for P3, P5, P8 (three modules beside the four named ones).
- Review round 2 (all 16 issues accepted, none rejected): SC-018 amendment and the Phase 1 edit list; `brief-scoped.spec.ts` for FR-036; the FR-035/FR-041 disk-format cases in `brief-file.spec.ts`; the FR-017 payload asserted per refusal row; P17 reversed (no scan from `eligian_project`); P21 for FR-033 after a post-approval change; `ensureScanned` with one rule for every root, so a failed cwd scan is retried (§2); `stateDirectory`, `ticketValid`, `ensureKey` and the CLI's untouched state directory tested; FR-006's unreadable record tested; `classifyKnownChange` named and unit-tested, FR-040's later programs tested; SC-022's `dev` clause made precise; FR-057's success line and `scope`/`paths` args tested; the start scan forked into the server's scope with a never-rejecting stored result (§2, §17, Risk 6); `ticketValid` length-guarded; the key published with `fs.link` from a temp file; P6's defect recovery narrowed to `SchemaError` and logged. No threshold or requirement was relaxed.
