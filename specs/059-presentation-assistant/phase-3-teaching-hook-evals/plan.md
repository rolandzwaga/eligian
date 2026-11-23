# Implementation Plan: presentation assistant, Phase 3: teaching, hook, evals

**Branch**: `spec/059-presentation-assistant` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/059-presentation-assistant/phase-3-teaching-hook-evals/spec.md` (reviewed; clarifications Q1–Q8, R-3, R-4, R-5, R-7 encoded), roadmap §1, §6, §7, §8 Phase 3, §9; `spikes.md` §1.2, §3, §4; Phases 1 and 2 (`phase-1-brief-engine/`, `phase-2-gates-signoff-additions/`, compliance COMPLETE).

Every signature below was read this session on the tree at `d9bdb30`. Sources: typegraph `ts_module_exports` on `mcp/instructions.ts`, `mcp/prompts.ts`, `mcp/brief/gate.ts`, `mcp/brief/known-programs.ts`, `mcp/brief/signature.ts`, `mcp/brief/brief-file.ts`, `mcp/brief/engine.ts`; Read/Grep for the rest, cited `file:line`. Claude Code facts come from `claude --help` of Claude Code 2.1.328 (run this session) and from code.claude.com (fetched this session through context7, `/websites/code_claude`): `docs/en/hooks` ("Decision control", "Elicitation output", "ElicitationResult output"), `docs/en/agent-sdk/claude-code-features` ("What settingSources does not control"), `docs/en/plugins/install` ("Choose an install scope"), `docs/en/plugins/loading` ("Find where a plugin is enabled"), `docs/en/settings-reference` (`enabledPlugins`), `docs/en/plugins/manifest-reference` (`defaultEnabled`). `cli/` means `packages/cli/src/`.

## Summary

Phase 3 changes no behaviour of Phases 1 and 2. It adds three things on top of them:

- **Teaching**: instructions string 4 (`cli/mcp/instructions.ts`), the `new-presentation` prompt rewritten and a second prompt `add-to-presentation` (`cli/mcp/prompts.ts`, registered in `cli/mcp/server.ts`), a new docs chunk `interview`, the `storyboard` and `what-is-eligian` chunks changed (`cli/mcp/knowledge/curriculum/`), the `AGENTS.md` block through `BLOCK_PARTS[4]`.
- **The hook**: one new module `cli/mcp/brief/hook-gate.ts` (the four rules, pure except for disk reads), two new exports of `cli/mcp/brief/gate.ts` (`newProgramVerdict`, over the existing module-local `governanceOf` / `nextOf`, and `cliGovernanceRoot`, today's root rule of `cliWarningOf` factored out so both paths share it), the `eligian brief gate` command in `cli/main.ts`, and in the plugin `hooks/hooks.json` plus the dependency-free `hooks/prefilter.cjs`. CLI, `server.json` and plugin move to 1.2.0; `NPX_ARGS` to `eligian@^1.2`.
- **The evals**: two new evals-bundle modules, `cli/mcp/evals/brief-fixture.ts` (sign a fixture as a confirmed brief; read a project's brief state) and `cli/mcp/evals/interview.ts` (persona sheets, the turn loop with injected runners, the judge parsing, the six measures, the verdict, the record schema, the summary); `cli/mcp/evals/harness.ts` gains `agentIsolation`, the argv builders of every `claude -p` spawn, `--persona` / `--user-model`, and an async `prepareArmProject` that writes the state directory, the signed brief and the `Elicitation` hook; `cli/mcp/evals/transcript.ts` gains `isError` on tool entries and stops counting `eligian_brief` calls in `metrics.toolCalls`. In the repo: `evals/mcp/run.ts` (the interview mode), `evals/mcp/elicitation-hook.cjs`, two prompt files, three persona sheets, twelve `cases/<id>/brief.md` fixtures.

Reuse-first, verified:

- **the gate**: `gateVerdict(input: GateInput): Verdict` (`gate.ts:181`), the module-local `governanceOf(root, dir, key, record, reading): Promise<Governance>` (`gate.ts:430`) and `nextOf(code, dir, scope): string` (`gate.ts:557`), `readText(file, reading)` with `strict` failing closed on every errno except `ENOENT` / `ENOTDIR` (`gate.ts:392–399`), `cliBriefWarnings(files, cwd, env?): Promise<string[]>` (`gate.ts:751`, behaviour unchanged; its no-record shortcut is `gate.ts:730–732`), the module-local `cliRecordOf(dir)` (`gate.ts:707–716`: an unreadable or unparsable record is none) and `cliWarningOf`'s root rule `found?.root ?? (isInside(cwd, dir) ? path.resolve(cwd) : dir)` (`gate.ts:728`).
- **the record**: `scanProgram(source: string): ProgramScan` (`known-programs.ts:124`), `findRecordFile(fromDir: string): string | undefined` (`known-programs.ts:262`).
- **the key**: `stateDirectory(env?, platform?, home?): string` (`signature.ts:69`), `readKey(stateDir): Promise<Buffer | undefined>` (`:113`), `ensureKey(stateDir): Promise<Buffer>` (`:124`), `makeSigner(key: Buffer): Signer` (`:161`).
- **the brief**: `BRIEF_FILE = 'BRIEF.md'` (`brief-file.ts:94`), `parseBrief(text, tree?): ParsedBrief` (`:663`; `ParsedBrief { brief; ignored; kept }`, `:68–72`), `writeBrief(tree, parsed, facts: FactsSnapshot): string` (`:904`; `FactsSnapshot`, `:75–92`); `evaluate(tree, brief, facts): Evaluation` (`engine.ts:584`; `Evaluation.instances: readonly Instance[]`, `engine.ts:169`; `Instance.question: Question`, `engine.ts:130`, which for a `V:<name>` id is the synthetic `SAME_AS`, `engine.ts:236`, not a `TREE` entry), `confirm(brief, mode: 'agent-reported' | 'elicitation', message, now, evaluation, signer, section): BriefState` (`engine.ts:1153`), `applyAnswers(tree, brief, facts, input, round): { brief; rejected; changed }` (`:1024`), `nextRound(brief): number` (`:1282`), `pickRound(tree, evaluation, max?)` (`:1251`), `textDirection(code): 'ltr' | 'rtl'` (`:1328`), `EMPTY_BRIEF` (`:230`); `Instance.status: 'answered' | 'open' | 'stale' | 'waiting' | 'not-applicable'` (`engine.ts:124`); `validateValue(question, value): Validated` (`values.ts:227`); `TREE`, `TREE_VERSION` (`tree.ts:9`), `Shape.kind` (`tree.ts:53–63`), `Column.kind` (`tree.ts:40`); `makeFacts(root, briefDir): Facts` (`brief/facts.ts`, no `@eligian/language` import).
- **the prompt layer**: `ai.McpServer.prompt({ name, title, description, parameters: { idea: Schema.NonEmptyString… }, content })` as `newPresentationPrompt` uses it (`prompts.ts:64–75`).
- **the harness**: `parseHarnessArgs(argv, knownCases): HarnessArgs | 'help' | string` (`harness.ts:58`), `prepareArmProject(arm, { dir, cli, mcpLog, scratch }): ArmSetup` (`harness.ts:149`), `caseVerdict` (`:280`), `renderSummary` (`:340`), `RunRecordSchema` (`:407`), `MODELS` (`:20`); `parseTranscript` (`transcript.ts:66`), `toolEntries` (`:108`), `readMcpLog` (`:169`), `computeMetrics(arm, events, log, wallMs?)` (`:239`); `materialiseFixtures(evalCase, casesDir, dir)` (`gate-steps.ts:59`); the run loop and the judge's no-tools `claude -p` (`evals/mcp/run.ts:198–240`, `:285–413`).
- **tests**: `startInMemoryServer(options, clientOptions?)` (`__tests__/mcp-test-client.ts:159`; `InMemoryClientOptions { elicitation?: true; onElicit? }`, `:75–83`), `tempProject(files?)`, `snapshotFiles(dir)`, `storyboardFor(evaluation)`, `approvedBrief(server, dir, { stateDir, root?, persona? })` (`__tests__/brief-helpers.ts:19`, `:35`, `:73`, `:155`), `loadPersona(name)` and `runPersona(persona, step, start, options?)` (`__tests__/brief-persona-driver.ts:53`, `:96`), `SOLUTIONS`, `CASES_DIR` (`__tests__/mcp-solutions-harness.ts:32`, `:29`).

Phase 3 adds no runtime dependency, no Effect service and no language-package change.

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo), repo `lib` ES2020 (no `Array#at`, no `Object.hasOwn`; `run.ts` already uses `findLast`/`at` but it is outside every tsconfig). The CLI is one ESM bundle `dist/cli.mjs`; the evals bundle is `dist/evals/assert.mjs` from `src/mcp/evals/assert.ts` (`packages/cli/esbuild.mjs:128–151`), not packed (`files` lists `bin/cli.js`, `dist/cli.mjs`, `dist/docs/**`, `package.json:31–34`). |
| Runtime deps | Unchanged. `prefilter.cjs` and `elicitation-hook.cjs` use `node:` builtins only. |
| Effect APIs | `ai.McpServer.prompt` (`@stability unstable`, the existing `// @effect-diagnostics unstableApiUsage:off` header, `prompts.ts:11`), `Schema.NonEmptyString`, `Schema.Struct` / `Schema.optionalKey` / `Schema.Literals` / `Schema.NullOr` (the record schemas, as `harness.ts:407–437`). `hook-gate.ts`, `brief-fixture.ts` and `interview.ts` are plain async TypeScript (as `harness.ts` is, "plan D", `harness.ts:6`). |
| Testing | Vitest projects `cli`, `cli-timed`, `cli-bin`, `cli-soak` (`packages/cli/vitest.config.ts:43–64`), `maxWorkers: 8`, `ELIGIAN_STATE_DIR` set to a temp dir for every test (`vitest.config.ts:9`, `:41`). |
| Platforms | Windows 11 (the local gates; every `pnpm test` the user runs) and `ubuntu-latest` (CI). Windows-only rules are tested through a `platform` argument; the prefilter spec runs on both (its `npx` stub is created per platform), and its win32 `npx` lookup (P17) is also unit-tested on every OS through an injected `exists`. |
| Performance | `eligian brief gate`: median < 3 s per spawn (SC-008). The prefilter on a write of none of the four kinds: median < 1 s, no `npx` started. |
| Constraints | `eligian mcp` stdout = frames only (`mcp-stdout.spec.ts`'s frame-purity assertions unchanged; only its version literal moves with FR-026, P18). `eligian brief gate` and `prefilter.cjs` write nothing on stdout. `pnpm effect:check:cli` 0/0/0. CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`vitest.config.ts:72–77`); language coverage untouched (no language source changes). |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. Two src modules for the hook (one new, one export added), two for the eval logic, one CommonJS prefilter, one CommonJS eval hook. No generator: the twelve fixtures are hand-checked data guarded by specs (SC-011, SC-012). |
| II / V / XX / XXV Testing, TDD | Pass. Every FR/SC maps to a named spec below, written red first. No language test is added (no language change), so the `TESTING_GUIDE.md` language templates do not apply; the CLI specs follow the existing `brief-*.spec.ts` patterns. |
| III / XVII Effect | Pass. The Effect code changed is the prompt layer (`prompts.ts`, `server.ts`), the Schema record definitions (`RunRecordSchema` in `harness.ts`, which imports `Schema` from `effect` at `harness.ts:11`; the new `InterviewRecordSchema` in `interview.ts`), and `gate.ts` (imports `Effect` at `gate.ts:18`; the new exports are plain async functions in that module). All of them are in `effect:check:cli`'s scope (`packages/cli/tsconfig.json`, root `package.json:31`), which the gate runs for every group that touches them (Gates). The hook and the eval logic are plain async functions with no thrown exceptions crossing a module boundary: `hookDecision` resolves to a decision, `runBriefGate` to an exit code, `confirmBriefFixture` to `{ text } \| { error }`. |
| IV Clear errors | Pass. Every block names the rule, the target, the gate code and the call to make. |
| VI / VII Immutability | Pass. |
| VIII pnpm | Pass. The prefilter's `npx` is the client's launcher, as the plugin's `.mcp.json` already uses it (`plugins/claude/eligian/.mcp.json`). |
| IX Langium | Pass. The hook loads no document (FR-013); SC-012's `eligian_check` runs under the server's own lock. |
| XII No premature docs | Pass. README, CHANGELOG and the AGENTS.md files are this phase's FR-044 to FR-046. |
| XIV Windows paths | Pass. See P3 and the risks table. |
| XV / XVI | Pass. No research-tree import; no edit under `generated/`. |
| XXII Sed safety | Pass. |

No violations, so no Complexity tracking table.

## Corrections and plan-level readings (found while planning)

Each is recorded in `compliance.md` at build time. Those that touch an FR or SC's wording are listed under Open questions for the user.

- **P1. The guarded events are `Elicitation` and `ElicitationResult`** (FR-018, SC-024). See "Guarded events" below.
- **P2. `--setting-sources project,local` alone does not keep plugins out** (FR-048, SC-023). See "Isolation" below: `agentIsolation` also disables every installed plugin by id through `--settings`, and takes that list as an argument (the spec's sketch is `agentIsolation()` with no argument).
- **P3. The caret in `eligian@^1.2` must survive `cmd.exe`.** `npx` is a `.cmd` shim on Windows, so the prefilter must start it through a shell there, and `cmd.exe` reads an unquoted `^` as its escape character (`eligian@^1.2` would arrive as `eligian@1.2`, the range `1.2.x`). The prefilter therefore runs, on `win32` only, the command line `"<npx path>" -y "eligian@^1.2" brief gate` with `shell: true` (the path found by P17's lookup, so a missing `npx` is detected before `cmd.exe` starts) (inside double quotes `cmd` does not treat `^` as an escape; npx's own argument parser drops the quotes), and elsewhere `spawn('npx', ['-y', 'eligian@^1.2', 'brief', 'gate'])` with no shell. The choice is one exported pure function, `npxInvocation(platform)`, unit-tested on both platforms, and SC-022's stub `npx` (a `.cmd` on Windows) asserts the argv `-y eligian@^1.2 brief gate` on whichever OS runs the test. The same caret issue exists today in `serverEntry`'s `cmd /c npx -y eligian@^1.1 mcp` for non-Claude clients on Windows (`agents.ts:44–46`); it is out of this phase's scope and is named in compliance.md as a pre-existing finding.
- **P4. The measured hook form is `command` plus `args`.** The spike's `hooks.json` (`spikes/hook-plugin/hooks/hooks.json`; `spikes.md` §3.1) used `"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/gate.cjs"]`; FR-022 writes the single string `node ${CLAUDE_PLUGIN_ROOT}/hooks/prefilter.cjs`, which a shell splits at a space in the plugin's install path (`installPath` lives under the user's home, `~/.claude/plugins/cache/...`). Decided by the user (2026-11-20): FR-022 and SC-010 now pin the args form.
- **P5. `prepareArmProject` becomes async.** The fixture signing needs `ensureKey` (`signature.ts:124`, async). `prepareArmProject(arm, project): Promise<ArmSetup>`; the existing `evals-harness.spec.ts` cases gain `await`, and `run.ts`'s `RunBundle` interface changes with it (`run.ts:88–91`).
- **P6. New record fields are optional in the schemas.** `--write-budgets <run-id>` decodes records of earlier runs (`run.ts:421–443`), so `RunRecord.brief` and `RunRecord.isolation` are `Schema.optionalKey`; a record this phase writes always has both (A1: `brief: { fixture, approved }`; A0 / A-none: `brief: { fixture: false, approved: false }`). `HarnessArgs.personas` / `.userModel` are present only in persona mode, so the existing `parseHarnessArgs` `toEqual` expectations (`evals-harness.spec.ts:49–103`) hold unchanged (SC-020 "the existing case-mode results unchanged").
- **P7. Tool errors are read from the transcript.** Measure 1 needs "a non-error result"; `toolEntries` today drops `is_error` (`transcript.ts:108–138`). `ToolEntry` gains `isError?: true`, set only when the `tool_result` item has `is_error: true` (absent otherwise, so every existing `toEqual` over entries holds). The `RunRecord.toolSequence` doc comment "its length is metrics.toolCalls" (`harness.ts:370`) is reworded, since FR-032 drops `eligian_brief` calls from the count only.
- **P8. Instructions string 4 never backticks `approve-storyboard` or `accept-existing` alone.** `mcp-instructions.spec.ts`'s `unknownTokens` requires every backticked `^[a-z0-9_/-]+$` token to be a tool or an index id (`mcp-instructions.spec.ts:101–108`); the actions go inside a span that holds a space (`` `action: approve-storyboard` ``), which the filter skips. The same filter runs a second time in `mcp-server.spec.ts` › `backticked tokens are tools or index ids` (`mcp-server.spec.ts:229–237`, over `INSTRUCTIONS[MCP_PHASE]`, so over string 4 once `MCP_PHASE` is 4), checking against `TOOL_NAMES` and `indexIds`. Its `indexIds` come from `generateKnowledge({ outDir: <temp> })` over the source curriculum in its `beforeAll` (`mcp-server.spec.ts:97–103`), not from `dist`, so `` `interview` `` passes as soon as `curriculum/interview.md` exists; no rebuild is needed. Both token tests must stay green.
- **P9. `new-presentation` has fourteen steps.** Today's steps 1–2 become four (FR-007), followed by today's 3–12: 4 + 10 = 14. `mcp-prompts.spec.ts`'s "has twelve numbered steps in order" (`:76`) becomes "fourteen".
- **P10. The curriculum id list is exhaustive in a spec.** `mcp-knowledge.spec.ts` asserts the hand-written ids equal `FR_039_CHUNKS`'s keys (`mcp-knowledge.spec.ts:492–524`, `:681`); `interview: 'workflow'` is added there (with the kind counts that follow from it, `:656–660`).
- **P11. The hook's `Edit` replacement is literal.** `old_string` / `new_string` are applied with `indexOf` and `slice` (and, for `replace_all`, `split(old).join(new)`), never `String.prototype.replace`, whose `$&` / `$1` patterns in `new_string` would change the text Claude Code writes.
- **P12. `brief gate` exits after stderr is flushed.** On POSIX, `process.stderr` to a pipe is asynchronous; `process.exit` right after `write` can drop the reason. The action writes with a callback and exits in it: `process.stderr.write(text, () => process.exit(code))` (exit 0 with nothing to write calls `process.exit(0)` directly).
- **P13. An agent turn is judged as a whole.** The "agent message" of a turn is the `result` text of that `claude -p` call (what the simulated user reads). Every agent turn is judged once; a reply with `questions: []` is a message that asks nothing. That costs one judge call per turn (≤ 30 per run) and removes a pre-filter whose errors would hide questions.
- **P14. `briefStateOf` reads `<project>/BRIEF.md` only.** Every persona's R3 is `main.eligian` in the project root (the three Phase 1 fixtures, read this session), and `eligian_brief`'s `directory` defaults to the project root (roadmap §4.1). An agent that briefs a subdirectory instead never reaches `approved` on disk and the run ends at `turn-limit`; the record's last `BRIEF.md` snapshot and file list show why.
- **P15. A simulated-user failure aborts the run.** FR-035 defines `aborted` for the agent's turn; a `claude -p` of the simulated user that does not start, times out (5 min, `JUDGE_TIMEOUT_MS`, `run.ts:45`) or returns no `result` text leaves nothing to send, so the loop stops with `endReason: 'aborted'`, `aborted: true` and the cause in `failures` ("simulated user: …").
- **P16. The fixtures do not name assets the agent creates.** An answer about an asset whose existence flips during the run changes which A-questions apply (A1/A2 apply only "an asset is missing", roadmap §3.9), so the confirmation's canonical list changes and the brief turns `brief-changed`. A fixture names only assets that exist at confirmation: those the case's `fixtures` materialise (`gate.ts:36`, copied before the arm setup, `run.ts:311–315`). SC-012 catches a fixture that breaks this (the solution's files exist when `eligian_check` runs).
- **P17. On Windows a missing `npx` is found before the spawn, not by the `'error'` event** (FR-047's cannot-start clause, SC-022 (d)). With `shell: true` Node starts `cmd.exe`, which always starts, so `child.on('error')` never fires for a missing `npx`: `cmd` prints its own two lines ("'npx' is not recognized as an internal or external command, / operable program or batch file.") on the inherited stderr and exits 9009. The prefilter therefore exports a pure `findOnPath(name, env, platform, exists = fs.existsSync)`: on `win32` it walks `env.PATH` (the key matched case-insensitively, as Windows spells it `Path`), split on `;`, times `env.PATHEXT` (default `.COM;.EXE;.BAT;.CMD`), and returns the first `<dir>\<name><ext>` that `exists`, else `undefined`. On `win32` an `undefined` writes the one line `eligian hook: cannot start npx (not found on PATH)` and exits 1 without spawning anything; a found path is quoted into P3's command line (cmd's `/d /s /c "…"` strips the outer quotes only). On every other platform no lookup is made: `spawn('npx', …)` without a shell raises `ENOENT` on `'error'`, which writes the same one line and exits 1. Which branch SC-022 (d) exercises: on Windows the lookup branch (a `PATH` holding only the temp dir without the stub); on Linux the `ENOENT` branch; and on both OSes a unit case drives the `win32` branch through `findOnPath(…, 'win32', exists)` with an injected `exists` and `startGate`'s injected `which` (Module design §6).
- **P18. The version bump moves `mcp-stdout.spec.ts`'s header literal** (FR-026, SC-016). The spec pins the served header to 1.1.0: `const HEADER = /^eligian 1\.1\.0 · eligius …/` (`mcp-stdout.spec.ts:50`) and `expect(text.startsWith('{"header":"eligian 1.1.0 · ')).toBe(true)` (`:281`), both under `test.skipIf(!built)`. Both are derived from `packages/cli/package.json`'s `version` (read with `fs.readFileSync` in the spec, the escaped version built into the regex), so they hold at 1.2.0 and at every later bump. SC-016's "unchanged" is read as the frame-purity assertions (stdout carries frames only); compliance.md records that reading.
- **P19. The README's `^1.1` commands move with FR-024.** `packages/cli/README.md` holds `npx -y eligian@^1.1 mcp` at `:488` (the `agents setup` description), `:559–565` (the per-client commands, including the Windows `cmd /c` forms), `:586` (the plugin's server command) and `upgrade to eligian@^1.1` at `:598`. All become `^1.2`, matching what `agents setup` / `--print-config` write after the `NPX_ARGS` change. `plugins.spec.ts:101` asserts the README contains `'npx -y eligian@^1.1 mcp'`; its expected string becomes `'npx -y eligian@^1.2 mcp'`.
- **P20. The hook's governance root is the CLI's.** `newProgramVerdict` does not derive the root from `findRecordFile` alone: an unreadable or unparsable `programs.json` would then set a root that `cliBriefWarnings` ignores (`cliRecordOf` treats it as none, `gate.ts:707–716`, and falls back to `cwd` when the program is inside it, `gate.ts:728`). `gate.ts` factors that rule into one exported `cliGovernanceRoot(dir, cwd)`, which `cliWarningOf` and `newProgramVerdict` both call (Module design §3).

## Guarded events (FR-018, SC-024)

`ELICITATION_HOOK_EVENTS = ['Elicitation', 'ElicitationResult'] as const`.

Source: code.claude.com/docs/en/hooks, "Decision control" table, row "Elicitation, ElicitationResult: `hookSpecificOutput` or top-level `decision` — `action` (accept/decline/cancel), `content` (form field values). `decision: "block"` also declines." These are the only two events in that table whose decision acts on an elicitation:

- **`Elicitation`** ("Elicitation output"): "An Elicitation hook can answer the request for the user, decline or cancel it, or leave it to the dialog … Answer for the user: `"action": "accept"`, with the form field values in `content`". This is the event the spike used (`spikes.md` §4.2).
- **`ElicitationResult`** ("ElicitationResult output"): "An ElicitationResult hook can let the user's response through, change its values, or block it … Change the submitted values: `"action": "accept"`, with the new values in `content` … ElicitationResult hooks also run when the user declines or cancels, and your `action` replaces theirs." So it can turn a user's decline into an accept.

No other event in that table has an `action` or `content` over an elicitation (PreToolUse, PermissionRequest and the rest decide tools, prompts or permissions). The spec iterates the constant, so a later event is one line in `hook-gate.ts` and this section.

## Isolation (FR-048, SC-023)

```ts
// cli/mcp/evals/harness.ts
export interface Isolation {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}
/** FR-048: project settings only, no user settings, every installed plugin off, no auto memory. */
export function agentIsolation(installedPlugins: readonly string[] = []): Isolation;
// → { args: ['--setting-sources', 'project,local',
//            ...(installedPlugins.length === 0 ? [] :
//               ['--settings', JSON.stringify({ enabledPlugins: { [id]: false, … } })])],
//     env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } }
export const ISOLATION_ENV = 'ELIGIAN_EVAL_ISOLATION'; // the JSON of Isolation, for the hook script
```

Why each part (citations fetched this session):

1. **`--setting-sources project,local`**: `claude --help` (Claude Code 2.1.328): "--setting-sources <sources> Comma-separated list of setting sources to load (user, project, local)." Leaving out `user` drops `~/.claude/settings.json`: its hooks, permissions and `enabledPlugins`. `project` keeps the eval project's `.claude/settings.json`, which holds the harness's `Elicitation` hook (FR-030, FR-040); `local` is kept as the clarification's example names it and is empty in a fresh temp project.
2. **Plugins off by id**: excluding `user` does not disable a user-installed plugin. code.claude.com/docs/en/settings-reference (`enabledPlugins`): "A plugin with no entry at any scope falls back to its `defaultEnabled` value"; docs/en/plugins/manifest-reference (`defaultEnabled`): "Defaults to `true`." So a plugin installed at user scope (whose `enabledPlugins` entry lives in `~/.claude/settings.json`, docs/en/plugins/install "Choose an install scope") would load again. The `flag` source (`--settings`) ranks above `user`, `project` and `local` (docs/en/plugins/loading, "Find where a plugin is enabled": lowest to highest `--add-dir`, `user`, `project`, `local`, `flag`, `managed`), and `--settings` still applies under restricted modes ("managed settings and --settings still apply", `claude --help`, `--restricted`). `run.ts` reads the installed ids once per run with `claude plugin list --json` (its `id` field; `claude plugin list --help`: "--json Output as JSON") and passes them to `agentIsolation`. A managed `true` cannot be overridden (same table); the record states what was applied, so such a machine is visible.
3. **`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`**: docs/en/agent-sdk/claude-code-features, "What settingSources does not control": "Auto memory at `~/.claude/projects/<project>/memory/` — Loaded into the system prompt at session start … To disable: … `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in `env`". An interview resumes one session in one project for up to 30 turns, so memory written in turn 3 would otherwise be primed in turn 4.
4. **MCP**: every spawn already passes `--strict-mcp-config` with its own `--mcp-config` (`run.ts:325–327`, `:222–235`); the same table lists claude.ai connectors as read regardless unless `strictMcpConfig` is set.

Who uses it: the argv builders below (one place per spawn kind) prepend `isolation.args`, and every spawn takes its environment from the pure `spawnEnv` (Module design §10), which merges `isolation.env` together with `ELIGIAN_EVAL_ISOLATION=<JSON>`. Claude Code runs hooks in its own environment, so `elicitation-hook.cjs persona` reads `ELIGIAN_EVAL_ISOLATION` and applies the same args and env to the `claude -p` it starts; without the variable it falls back to `DEFAULT_ISOLATION_ARGS = ['--setting-sources', 'project,local']`, a constant `evals-harness.spec.ts` checks equal to `agentIsolation().args`. Every record carries `isolation`; `summary.md` prints it once.

**[UNVERIFIED]** That a session with these args runs with no hook of an installed plugin. Settled at the start of SC-001's runs (it needs the plugin installed at user scope, which happens in SC-003): one `claude -p` with `agentIsolation(<installed ids>)` in a temp project asked to write `main.eligian` with a timeline; the file is written (the plugin's rule 2 did not run). The command and its result go into compliance.md beside SC-001.

## Project structure

```text
packages/cli/
├── package.json                          EDIT version 1.2.0
├── server.json                           EDIT version 1.2.0 (twice)
├── README.md                             EDIT FR-044; every eligian@^1.1 → ^1.2 (P19)
├── AGENTS.md                             EDIT FR-046 (hook-gate.ts)
└── src/
    ├── agents.ts                         EDIT NPX_ARGS → eligian@^1.2
    ├── main.ts                           EDIT `brief` → `gate` command group
    ├── __tests__/                        hook-cases.ts (NEW) and every new or changed spec of the Test plan
    │                                     live here (beside mcp-test-client.ts, brief-helpers.ts,
    │                                     brief-persona-driver.ts); they import ../mcp/brief/*.js, ../mcp/evals/*.js
    └── mcp/
        ├── instructions.ts               EDIT MCP_PHASE 4, INSTRUCTIONS[4], BLOCK_PARTS[4]
        ├── prompts.ts                    EDIT NEW_PRESENTATION rewritten; ADD_TO_PRESENTATION, addToPresentationPrompt
        ├── server.ts                     EDIT registers addToPresentationPrompt (beside :233)
        ├── brief/
        │   ├── gate.ts                   EDIT export newProgramVerdict (over governanceOf, nextOf), cliGovernanceRoot (P20)
        │   └── hook-gate.ts              NEW  ELICITATION_HOOK_EVENTS, hookDecision, runBriefGate
        ├── evals/
        │   ├── assert.ts                 EDIT re-export brief-fixture.js, interview.js
        │   ├── brief-fixture.ts          NEW  confirmBriefFixture, briefStateOf
        │   ├── interview.ts              NEW  sheets, loop, judge parsing, measures, verdict, schema, summary
        │   ├── harness.ts                EDIT agentIsolation, argv builders, --persona/--user-model, async prepareArmProject, record fields
        │   └── transcript.ts             EDIT ToolEntry.isError; toolCalls metric without eligian_brief
        ├── knowledge/curriculum/
        │   ├── interview.md              NEW  kind workflow
        │   ├── storyboard.md             EDIT drafted from the brief; Approval section
        │   └── what-is-eligian.md        EDIT working method step 1
        (no mcp/__tests__/: the CLI's specs are in src/__tests__/ above)
plugins/claude/eligian/
├── .claude-plugin/plugin.json            EDIT version 1.2.0
├── .mcp.json                             EDIT eligian@^1.2
└── hooks/
    ├── hooks.json                        NEW  FR-022
    └── prefilter.cjs                     NEW  FR-047
.claude-plugin/marketplace.json           EDIT description (eligian@^1.2, eligian_brief, the hook)
evals/mcp/
├── run.ts                                EDIT interview mode; argv builders; isolation; async arm setup
├── elicitation-hook.cjs                  NEW  modes accept | persona
├── simulated-user.md                     NEW  the user model's prompt
├── interview-judge.md                    NEW  the round-message judge's prompt (frontmatter judge-model)
├── personas/{terse,detailed,vague}.json  NEW  FR-037
└── cases/<id>/brief.md                   NEW  12 fixtures (FR-027, FR-028)
package.json (root)                       EDIT script evals:interview
AGENTS.md (root), CHANGELOG.md            EDIT FR-045, FR-046
specs/059-presentation-assistant/roadmap.md  EDIT §7.1 wording (FR-028), §8 status line (SC-021, at the end)
```

## Module design

### 1. `cli/mcp/instructions.ts` (FR-001 to FR-006)

```ts
export const MCP_PHASE = 4 as const;
export const INSTRUCTIONS: Readonly<Record<1 | 2 | 3 | 4, string>>;   // 1–3 byte-identical
const BLOCK_PARTS: Readonly<Record<1 | 2 | 3 | 4, { workflow: string; rules: string }>>;
```

New parts (the existing `PREAMBLE`, `WORKFLOW_INTRO`, `CHECK_LINE`, `ENGINE_RULES` are reused unchanged; `DOCS_LINE` stays for strings 1–3, `instructions.ts:24–29`):

```ts
const BRIEF_LINE = `- \`eligian_brief\`: FIRST for a new presentation and for an addition (a new view, a new
  language or a first host module). Ask its rounds, record the answers, confirm the brief, then draft
  STORYBOARD.md from it and approve it. Nothing is written before the brief is approved; the
  generation tools refuse until then.`;
const DOCS_LINE_4 = `- \`eligian_docs\`: \`interview\` before the first round. Once the brief is confirmed:
  \`storyboard\`, \`decisions\`, \`project-layout\`, then draft STORYBOARD.md and call \`action: approve-storyboard\`.
  Before each construct you have not written this session: its map-* card (index) or body
  (detail:true). Read \`operations-index\` once.
- \`eligian_operations\`: …(as today)…
- \`eligian_init\`: scaffold from a starter once the brief is approved (writes files; next steps in the reply).`;
const WORKFLOW_PHASE_4 = `${WORKFLOW_INTRO}\n${BRIEF_LINE}\n${DOCS_LINE_4}\n<project, check/fmt, smoke, compile lines of WORKFLOW_PHASE_3>`;
const USER_RULE = `Decisions are the user's, facts are yours: look up what \`eligian_project\` or the files
answer (ids, classes, assets, languages, versions) and ask the user only decisions, each with your
recommended answer worded so that yes accepts it.`;
const RULES_PHASE_4 = `${ENGINE_RULES}\n${USER_RULE}\nReview STORYBOARD.md against the compiled timelines before declaring done.`;
const INSTRUCTIONS_PHASE_4 = `${PREAMBLE}\n\n${WORKFLOW_PHASE_4}\n\n${RULES_PHASE_4}\n`;
```

The rule sits after the five engine rules, not numbered among them (they are "Rules the engine imposes", `instructions.ts:55`). The project / smoke / compile lines are factored out of `WORKFLOW_PHASE_3` (`:47–53`) as constants so that string 3 stays byte-identical (its snapshot, SC-004). Length budget: string 3 is 2,415 characters (roadmap header); the additions are ≈ 700, so string 4 is ≈ 3,100 ≤ 4,096, asserted by the spec.

### 2. `cli/mcp/prompts.ts` and `server.ts` (FR-007, FR-008)

```ts
const TOOL = { brief: 'eligian_brief', docs: …, init: …, project: …, operations: …, check: …,
               compile: …, fmt: …, smoke: … } as const;           // brief first
const DOC = { interview: 'interview', storyboard: …, decisions: …, projectLayout: …,
              runtimeStatePitfalls: … } as const;
export const NEW_PRESENTATION: { name: 'new-presentation'; title; description; docIds; tools;
  text: (idea: string) => string };
export const ADD_TO_PRESENTATION: { name: 'add-to-presentation'; title: 'Add to an Eligian presentation';
  description: string; docIds; tools; text: (addition: string) => string };
export const newPresentationPrompt: (ai: EffectAi) => Layer<never, never, McpServer>;      // unchanged shape
export const addToPresentationPrompt: (ai: EffectAi) => Layer<never, never, McpServer>;
```

`new-presentation`'s text keeps its first line ("Build an Eligius presentation with Eligian for this idea:", `mcp-prompts.spec.ts:95–101`) and the idea; steps 1–4:

1. Call `` `${TOOL.brief}` `` with `action: status` and the idea above verbatim as `idea`; read "${DOC.interview}" with `` `${TOOL.docs}` `` before the first round.
2. Ask each round in one message: every question with your recommended answer worded so that "yes" accepts it. Look facts up (`` `${TOOL.project}` ``, the files) instead of asking. Record the replies with `action: answer` (a "you decide" as `delegated: true` with your choice), until the state is `complete`.
3. Call `` `${TOOL.brief}` `` with `action: confirm`: the user confirms in a dialog, or you show the counts and the delegated answers and pass their reply verbatim as `confirmation`.
4. Read "${DOC.storyboard}", "${DOC.decisions}" and "${DOC.projectLayout}" with `` `${TOOL.docs}` ``, draft STORYBOARD.md from the brief, and call `` `${TOOL.brief}` `` with `action: approve-storyboard`.

Steps 5–14 are today's steps 3–12 verbatim (`prompts.ts:39–48`), renumbered. `tools` / `docIds` stay `Object.values(TOOL)` / `Object.values(DOC)` (`prompts.ts:58–59`).

`add-to-presentation`: parameters `{ addition: Schema.NonEmptyString.annotate({ description: 'What to add, in your own words' }) }`; text: "Add to an existing Eligius presentation:\n<addition>\n\n" then four steps (FR-008): (1) `` `eligian_project` `` on the program; (2) decide which addition it is (a new view, a new language, a first host module); anything inside an existing view is an edit and needs no interview; (3) `` `eligian_brief` `` with `scope: { "addition": "view" | "language" | "host-module", "name": "<name>" }` and `action: status`, the rounds as in new-presentation step 2, `action: confirm`, add the view's section to STORYBOARD.md, `action: approve-storyboard`; (4) write the code, then `` `eligian_check` `` until clean, `` `eligian_fmt` `` with `write: true`, `` `eligian_smoke` `` with a scenario per interaction. Tool and doc names are interpolated from a `TOOL`/`DOC` subset, so `ADD_TO_PRESENTATION.tools` / `.docIds` are the single source as FR-007 requires.

`server.ts:233` becomes `newPresentationPrompt(ai), addToPresentationPrompt(ai),` inside the same `Layer.mergeAll`.

### 3. `cli/mcp/brief/gate.ts`: `newProgramVerdict` (FR-017, FR-021)

```ts
export interface NewProgramVerdict {
  readonly verdict: Verdict;
  readonly state: 'none' | BriefStateName;
  readonly next: string;           // nextOf(code, dir, triggers[0]) for a refusal, else ''
  readonly root: string;           // the project root the governance was read with
  readonly briefFile: string;      // <dir>/BRIEF.md
}
/** FR-017 rule 2: the verdict of a program that does not exist yet; `undefined` for a library. */
export async function newProgramVerdict(
  file: string,
  source: string,
  cwd: string,                       // the hook input's `cwd` (else process.cwd()), as cliBriefWarnings' cwd
  env: NodeJS.ProcessEnv = process.env
): Promise<NewProgramVerdict | undefined>;
/** P20: the root the CLI reads governance against; today's rule of cliWarningOf (gate.ts:727–728). */
export async function cliGovernanceRoot(
  dir: string,
  cwd: string
): Promise<{ readonly root: string; readonly found: { readonly record: ProgramRecord; readonly root: string } | undefined }>;
// = { found: await cliRecordOf(dir), root: found?.root ?? (isInside(cwd, dir) ? path.resolve(cwd) : dir) }
```

`cliWarningOf` replaces its two lines (`gate.ts:727–728`) with one `cliGovernanceRoot(dir, cwd)` call; its behaviour is unchanged (the `cliBriefWarnings` specs pass as they are).

Body (no new matrix; every step is an existing function):

```ts
const scan = scanProgram(source);                              // known-programs.ts:124
if (scan.library) return undefined;
const dir = path.dirname(path.resolve(file));
const { root } = await cliGovernanceRoot(dir, cwd);            // P20: cliRecordOf (gate.ts:707–716) + the cwd fallback (:728)
const key = await readKey(stateDirectory(env));                 // never ensureKey: creates nothing
const governance = await governanceOf(root, dir, key, undefined, 'strict');   // gate.ts:430
const verdict = gateVerdict({ scan, entry: undefined, brief: governance.governing,
                              additions: governance.additions });            // gate.ts:181
```

`entry: undefined` because a file that does not exist is never known (§4.2); with no governing brief that is row 2, `brief-required`, whether or not a record exists (Q5), so `cliWarningOf`'s shortcut (`gate.ts:730–732`) is not on this path. `record: undefined` gives `governanceOf` the CLI's reading (no storyboard-view triggers, `gate.ts:427–429`); additions inside an approved directory are left to the server gate (FR-017). `'strict'` makes a `BRIEF.md` read error other than a missing file reject (`gate.ts:397–398`), and `hookDecision` turns the rejection into a block. `readKey` and `cliRecordOf` (`findRecordFile` + a `'lenient'` read) read only; nothing writes (SC-007's state-directory and project snapshots). An invalid or unreadable `programs.json` therefore counts as no record for the root, exactly as for `cliBriefWarnings`: the root is `cwd` when the program is inside it, else the program's directory; `brief-hook-gate.spec.ts` › `newProgramVerdict root` has a case for it (an unparsable `programs.json` above the program: the verdict's `root` equals the root `cliBriefWarnings` reads, and the decision is the no-record one). `cliBriefWarnings`'s behaviour is untouched (its specs pass unchanged).

### 4. `cli/mcp/brief/hook-gate.ts` (FR-013 to FR-020)

Imports: `node:fs/promises`, `node:path`, `./gate.js` (`newProgramVerdict`), `./brief-file.js` (`BRIEF_FILE`), `./known-programs.js` (`RECORD_FILE` for the record's name). Nothing from `@eligian/language`, `effect/ai` or `../tools/` (SC-009 grep). No `console.`, no `process.stdout`.

```ts
export const ELICITATION_HOOK_EVENTS: readonly string[] = ['Elicitation', 'ElicitationResult'];
export const HOOK_SUFFIX = 'This hook comes from the eligian Claude Code plugin.';
export interface HookInput {
  readonly tool_name: string;
  readonly tool_input: Readonly<Record<string, unknown>>;
  readonly cwd?: string;
}
export type HookRule = 'brief-file' | 'new-program' | 'elicitation-hook' | 'programs-record';
export type HookDecision =
  | { readonly block: false }
  | { readonly block: true; readonly rule: HookRule; readonly reason: string };
export function parseHookInput(input: unknown): HookInput | undefined;     // FR-014's shape check
export async function hookDecision(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<HookDecision>;
export async function runBriefGate(
  stdin: string,
  env?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform
): Promise<{ readonly exitCode: 0 | 2; readonly stderr: string }>;
```

`hookDecision`, in order:

1. `parseHookInput`: a JSON object with a string `tool_name` in `Write | Edit | MultiEdit` and a string `tool_input.file_path`; anything else → `{ block: false }` (FR-014, R-2).
2. **Path flavour by `platform`**: `const p = platform === 'win32' ? path.win32 : path.posix`; `target = p.resolve(cwd ?? process.cwd(), file_path)`. Segments are split on `/[\\/]/` on every platform (FR-015 "both separators"); names compare lower-cased on `win32`, exactly elsewhere (`same(a, b)`).
3. **Rule 1** (`brief-file`): last segment `BRIEF.md` → block: "BRIEF.md is written only by `eligian_brief`: change an answer with `eligian_brief` and `action: answer`."
4. **Rule 4** (`programs-record`): last two segments `.eligian`, `programs.json` → block naming `action: accept-existing`.
5. **Rule 3** (`elicitation-hook`): last two segments `.claude` and `settings.json` | `settings.local.json`, at any depth, the home directory's included (no root check) →
   - `before = await readOrEmpty(target)` (missing or unreadable → `''`);
   - `after`: `Write` → `tool_input.content`; `Edit` → `applyEdit(before, old_string, new_string, replace_all === true)`; `MultiEdit` → `edits` folded through `applyEdit` in order (P11: `indexOf`/`slice`, or `split`/`join` for `replace_all`; an `old_string` not found leaves the text as it is: Claude Code refuses that edit anyway);
   - `hooksOf(text): Map<event, Set<string>> | 'invalid'`: `JSON.parse`; for each event `E` of `ELICITATION_HOOK_EVENTS`, every `hooks[E][i]` entry flattened to identities `canonicalJson({ matcher: entry.matcher, hook })` for each `hook` of `entry.hooks`, and an entry not in that shape as `canonicalJson(entry)` (so a hook of any type, `command`, `http` or another, with or without `args`, is an identity);
   - block when `after` is `'invalid'` and contains `"E"` for some `E`, or when some `E` has an identity in `after` that is not in `before` (`before` `'invalid'` counts as none). Everything else on a settings file → allow.
6. **Rule 2** (`new-program`): `tool_name === 'Write'` and the last segment ends in `.eligian` (case rule of step 2) →
   - `fs.stat(target)`: exists → allow (a replace or edit is free, decision 7); `ENOENT` → new; any other errno → block (fails closed for its own target, R-2);
   - `await newProgramVerdict(target, String(tool_input.content ?? ''), p.resolve(cwd ?? process.cwd()), env)`: `undefined` (a library) → allow; a rejection (unreadable `BRIEF.md`, unreadable key) → block "the brief beside <file> cannot be read: <errno>"; `verdict: 'runs'` or `code === 'addition-not-briefed'` → allow; any other code → block `"<code>: <target> — <briefFile> is <state>. <next>"`.
7. Otherwise → `{ block: false }`.

`runBriefGate(stdin)`: `JSON.parse` in a `try` (failure → `{ exitCode: 0, stderr: '' }`); `hookDecision`; a block → `{ exitCode: 2, stderr: `${reason} ${HOOK_SUFFIX}\n` }`. An unexpected rejection of `hookDecision` (a bug) → exit 0 with nothing on stderr for a target of no rule, block for a target of a rule (the target kinds are computed before any read, so the fail-closed side is known).

### 5. `cli/main.ts`: `eligian brief gate` (FR-013, FR-020)

Beside the `agents` group (`main.ts:533–546`):

```ts
program
  .command('brief')
  .description('the brief interview (spec 059)')
  .command('gate')
  .description("the Claude Code plugin hook's check: reads the PreToolUse input on stdin; exit 2 blocks the write")
  .action(async () => {
    const { runBriefGate } = await import('./mcp/brief/hook-gate.js');   // as printBriefWarnings, :85
    const stdin = await readAll(process.stdin);                          // a 10-line local helper
    const { exitCode, stderr } = await runBriefGate(stdin);
    if (stderr === '') process.exit(exitCode);
    else process.stderr.write(stderr, () => process.exit(exitCode));     // P12
  });
```

Runs in the CLI process, one short-lived process per guarded write; nothing on stdout. `main.ts` imports `@eligian/language` at load (`main.ts:11`), so the bundle's start-up is the cost (SC-008); no document is loaded.

### 6. The plugin (FR-022 to FR-026, FR-047)

`plugins/claude/eligian/hooks/hooks.json`: exactly FR-022's JSON. `.mcp.json`: `"args": ["-y", "eligian@^1.2", "mcp"]`. `plugin.json` `version: "1.2.0"`. `marketplace.json` plugin description: "Adds the eligian MCP server (npx -y eligian@^1.2 mcp): the brief interview (eligian_brief), docs, operations, check, fmt, compile, project, init, smoke; and a hook that blocks writing a program before its brief is approved".

`plugins/claude/eligian/hooks/prefilter.cjs` (CommonJS, `'use strict'`, `node:` requires only):

```js
const NPX_GATE_ARGS = ['-y', 'eligian@^1.2', 'brief', 'gate'];
/** FR-047: one of the four kinds, case-insensitively, either separator, on every platform. */
function guarded(input) /* → boolean */;
/** P17: the first PATH × PATHEXT match on win32 (PATH key matched case-insensitively); undefined if none.
 *  Only called on win32. */
function findOnPath(name, env, platform, exists = fs.existsSync) /* → string | undefined */;
/** P3: { command, args, shell } per platform; `npxPath` is the win32 lookup's result. */
function npxInvocation(platform, npxPath) /* win32: { command: `"${npxPath}" -y "eligian@^1.2" brief gate`, args: [], shell: true }
                                             else:  { command: 'npx', args: NPX_GATE_ARGS, shell: false } */;
/** P17: the invocation, or the one-line cannot-start message; `which` injectable for the unit spec. */
function startGate(platform, env, which = findOnPath)
  /* win32: which('npx', env, 'win32') → undefined ⇒ { error: 'eligian hook: cannot start npx (not found on PATH)' }
            else ⇒ npxInvocation('win32', found)
     else:  npxInvocation(platform) (no lookup; a missing npx is ENOENT on 'error') */;
const cannotStart = line => process.stderr.write(`${line}\n`, () => process.exit(1));
async function main() {
  const stdin = await readAll(process.stdin);
  let input; try { input = JSON.parse(stdin); } catch { process.exit(0); }
  if (!guarded(input)) process.exit(0);
  const start = startGate(process.platform, process.env);
  if ('error' in start) return cannotStart(start.error);          // win32: nothing is spawned
  const { command, args, shell } = start;
  const child = spawn(command, args, { shell, stdio: ['pipe', 'ignore', 'inherit'] });
  child.on('error', e => cannotStart(`eligian hook: cannot start npx (${e.message})`));   // POSIX ENOENT
  child.on('close', code => process.exit(code ?? 1));
  child.stdin.end(stdin);                                  // byte-identical (SC-022 (a))
}
module.exports = { NPX_GATE_ARGS, guarded, findOnPath, npxInvocation, startGate };
if (require.main === module) main();
```

`guarded` matches FR-047 (a)–(d): base name `brief.md`; a `Write` whose path ends in `.eligian`; last two segments `.claude` + `settings.json` | `settings.local.json`; last two `.eligian` + `programs.json`; all lower-cased, so it forwards a superset of `hookDecision`'s Linux and Windows blocks. Its stdout is `ignore`d and the CLI's stderr inherited unchanged. A found `npx.cmd` that then fails inside `cmd` is the CLI's (or npx's) own exit code and stderr, passed through as FR-047 (c) requires; only "npx is not there" is the cannot-start case, and on every OS it is one line and exit 1 (P17). `plugins.spec.ts` checks its `NPX_GATE_ARGS[1]` equals `.mcp.json`'s `args[1]`.

### 7. `cli/agents.ts`, versions (FR-024 to FR-026)

`NPX_ARGS = ['-y', 'eligian@^1.2', 'mcp']` (`agents.ts:33`). `packages/cli/package.json` `version` (`:5`), `server.json` (`:11`, `:17`) and `plugin.json` → `1.2.0`. `mcp-stdout.spec.ts`'s `HEADER` (`:50`) and header prefix (`:281`) are derived from `packages/cli/package.json`'s `version` (P18). The README's `^1.1` commands (`:488`, `:559–565`, `:586`, `:598`) move to `^1.2` and `plugins.spec.ts:101`'s expected string with them (P19). Unchanged: `starters.ts:120` `'^1.1.0'`, `install-state.ts:22`.

### 8. `cli/mcp/evals/brief-fixture.ts` (FR-029, FR-033)

```ts
export async function confirmBriefFixture(
  text: string, projectDir: string, stateDir: string, now: Date
): Promise<{ readonly text: string } | { readonly error: string }>;
export async function briefStateOf(projectDir: string, stateDir: string): Promise<'none' | BriefStateName>;
export const FIXTURE_CONFIRMATION = (caseId: string) => `eval harness: the brief fixture of case ${caseId}`;
```

`confirmBriefFixture` (R-6): `parsed = parseBrief(text)`; `parsed.ignored.length > 0` → `{ error: 'line <n>: <reason>' }`; `signer = makeSigner(await ensureKey(stateDir))`; `facts = { ...makeFacts(projectDir, projectDir), signer }`; `evaluation = evaluate(TREE, parsed.brief, facts)`; `evaluation.frontier.length > 0` → `{ error: 'the brief is open: <ids of the frontier>' }`; `confirmed = confirm(parsed.brief, 'agent-reported', message, now, evaluation, signer, 'brief')`; `after = evaluate(TREE, confirmed, facts)` (must be `confirmed`, else `{ error }`); `{ text: writeBrief(TREE, { ...parsed, brief: confirmed }, snapshot) }` with `snapshot = { state: after.state, serverEligian: installed ?? '-', eligianInstalled: installed, packageManager: undefined, textDirection: <L1 codes with textDirection(code)>, assets: after.assets }`, `installed` read from `<projectDir>/node_modules/eligian/package.json` (the `## Facts` block is never read back, `brief-file.ts:74`). The message is passed by the caller (`FIXTURE_CONFIRMATION(id)`); the function signature stays the spec's, with the message as a fifth optional parameter defaulting to `'eval harness: brief fixture'`.

`briefStateOf`: `<projectDir>/BRIEF.md` missing → `'none'`; else `parseBrief`, `readKey(stateDir)` (absent → no signer), `evaluate(TREE, brief, facts).state` (P14).

Imports: `node:fs/promises`, `node:path`, `../brief/{brief-file,engine,facts,signature,tree}.js`. None of them reaches `@eligian/language` (Phase 2 P1) or `effect/ai`, so the evals bundle stays a node-only module.

### 9. `cli/mcp/evals/interview.ts` (FR-034 to FR-043)

```ts
export type PersonaName = 'terse' | 'detailed' | 'vague';
export const PERSONA_NAMES: readonly PersonaName[];
export type Mode = 'states' | 'decides' | 'accepts';
export interface SheetValue { readonly value: unknown; readonly mode: Mode }
export interface PersonaSheet {
  readonly idea: string;
  readonly opening: string;
  readonly answers: Readonly<Record<string, SheetValue | { readonly values: readonly SheetValue[] }>>;
  readonly script: readonly { readonly afterRound: number;
                              readonly answers: readonly { readonly id: string; readonly value: unknown }[] }[];
}
export function parsePersonaSheet(json: unknown): PersonaSheet | string;
/** The Phase 1 driver's Persona (brief-persona-driver.ts:31–41), declared structurally here. */
export interface Persona { /* idea; answers: Record<id, {value, delegated?} | {values: …}>; script */ }
export function sheetToPersona(sheet: PersonaSheet): Persona;

export interface JudgedQuestion { readonly text: string; readonly ids: readonly string[];
                                  readonly fact: boolean; readonly recommendation: boolean }
export type JudgedMessage =
  | { readonly turn: number; readonly messageIndex: number; readonly questions: readonly JudgedQuestion[] }
  | { readonly turn: number; readonly messageIndex: number; readonly unparsable: string };
/** The last non-empty line as `{ questions: [...] }`; `undefined` on any other shape (incl. a single `id`). */
export function parseJudgeReply(text: string): readonly JudgedQuestion[] | undefined;

export interface ScriptChange { readonly answers: readonly { readonly id: string; readonly value: unknown }[] }
export function changedAnswerDependents(before: ParsedBrief, change: ScriptChange, facts: Facts): string[];

export interface TurnData {
  readonly turn: number;
  readonly events: readonly unknown[];   // this turn's claude -p events, tagged with turn
  readonly message: string | undefined;  // the result text (P13)
  readonly brief: string | undefined;    // BRIEF.md after the turn
  readonly files: readonly string[];     // project files after the turn (posix, relative, node_modules skipped)
}
export interface InterviewMeasures { /* the spec's `measures` object (Key entities) */ }
export function interviewMeasures(input: {
  readonly turns: readonly TurnData[]; readonly log: readonly TelemetryLike[];
  readonly sheet: PersonaSheet; readonly judged: readonly JudgedMessage[];
  readonly script: { readonly turn: number; readonly roundCount: number } | null;
  readonly facts: Facts;
}): InterviewMeasures;
export function interviewPass(m: InterviewMeasures, persona: PersonaName, aborted: boolean, approved: boolean): boolean;
export function interviewStop(input: { readonly state: 'none' | BriefStateName;
  readonly agentTurns: number; readonly elapsedMs: number }): 'approved' | 'turn-limit' | 'time-limit' | undefined;
export function interviewVerdict(records: readonly InterviewRecord[]): { pass: boolean; passed: number; of: number };
export interface InterviewRecord { /* the spec's Key entities, plus `persona`, `n`, `isolation` */ }
export const InterviewRecordSchema: Schema.Codec<InterviewRecord>;
export function renderInterviewSummary(records: readonly InterviewRecord[], isolation: Isolation): string;

/** The turn loop with every process injected (SC-020's fake runner). */
export interface InterviewDeps {
  readonly agentTurn: (input: { readonly message: string; readonly sessionId: string | undefined;
                                readonly turn: number }) => Promise<{ readonly stdout: string;
                                readonly started: boolean; readonly wallMs: number }>;
  readonly userReply: (prompt: string) => Promise<string | undefined>;
  readonly judge: (prompt: string) => Promise<string | undefined>;
  readonly parseTranscript: (text: string) => unknown[];      // transcript.ts:66
}
export interface InterviewRun {
  readonly runId: string; readonly persona: PersonaName; readonly n: number;
  readonly sheet: PersonaSheet; readonly model: string; readonly userModel: string;
  readonly cliVersion: string; readonly projectDir: string; readonly stateDir: string;
  readonly scratch: string; readonly outDir: string;   // results/<run-id>/interview
  readonly mcpLog: string; readonly isolation: Isolation;
  readonly prompts: { readonly simulatedUser: string; readonly judge: string };
}
export async function runInterview(run: InterviewRun, deps: InterviewDeps): Promise<InterviewRecord>;
export function simulatedUserPrompt(input: { … }): string;   // pure, tested
export function judgePrompt(input: { … }): string;            // pure, tested
export const FACT_KINDS: readonly string[];                   // roadmap §3.1's four bullets, for the judge
```

**`runInterview`** (FR-035, FR-036, FR-039): `turn = 1`, `message = sheet.opening`, `conversation = []`.

1. Append `{ role: 'user', turn, text: message }`; write `<scratch>/interview/conversation.json` (so the hook sees the reply it is acting on).
2. `out = await deps.agentTurn({ message, sessionId, turn })`; write `<outDir>/<persona>-<n>.turn-<k>.json` (`out.stdout`); `events = deps.parseTranscript(out.stdout)`; `final` = the last `type: 'result'` event. `!out.started || final === undefined` → stop, `aborted: true`, `endReason: 'aborted'`. `sessionId ??= final.session_id`.
3. `message = final.result` (a string), appended `{ role: 'agent', … }`; snapshot `BRIEF.md` to `<persona>-<n>.brief-<k>.md` when it exists; list the project's files.
4. `state = await briefStateOf(projectDir, stateDir)`; `stop = interviewStop({ state, agentTurns: k, elapsedMs: Σ wallMs })` → break on a value.
5. `roundCount` = the number of `mcp__eligian__eligian_brief` tool results (over every turn's events, `toolEntries`) whose parsed `resultText` has a non-empty `round` array. When a `script` entry is not yet fired and `roundCount >= afterRound`, this reply carries it and `script = { turn: k, roundCount }` (FR-039).
6. `reply = await deps.userReply(simulatedUserPrompt({ template: prompts.simulatedUser, sheet, conversation, last: message, change }))`; `undefined` → stop aborted (P15). `turn++`, `message = reply`, back to 1.

After the loop: for every agent turn with a message, `deps.judge(judgePrompt({ template, facts: FACT_KINDS, inventory, round, message }))` → `parseJudgeReply` (FR-042; the inventory is the last `eligian_project` `resultText` in the events up to that turn, else "eligian_project not called", plus the file list of the previous turn; the round is the `round` of the last `eligian_brief` result before the message); then `interviewMeasures`, `interviewPass`, the record (`InterviewRecordSchema` decode, as `run.ts:409`), `<persona>-<n>.json`. `approved` = the last `briefStateOf` is `approved`.

**Measures** (FR-041): the events of all turns are concatenated in order; `toolEntries` (with `isError`, P7) gives names, inputs, results.

1. `noGenerationBeforeApproval`: the index of the first `eligian_brief` entry whose `JSON.parse(resultText).state === 'approved'` (∞ if none); fail on an earlier entry named `mcp__eligian__eligian_{init,check,fmt,compile,smoke}` or `Write`/`Edit`/`MultiEdit` with `file_path` ending `.eligian`, without `isError`; and on any `.eligian` in `files` of a turn that ended before the turn of that approval.
2. `nothingAssumed` (FR-038): parse the final `BRIEF.md` (`parseBrief`) and each snapshot; `questionOf(id)` = the `question` of the instance with that id in `evaluate(TREE, brief, facts).instances` of the brief being compared (`Instance.question`, `engine.ts:130`), falling back to `SAME_AS` (`engine.ts:236`) for a `V:<view>` id with no instance there, and to "not comparable" (a failure string) otherwise; never a `TREE` lookup by the prefix before `:` (`V:slide-1` would give `V`, which is no `TREE` question; `V3:intro` → `V3` happens to be one); `same(q, a, b)`: by `q.shape.kind`, `choice|set|yes-no|duration|view|path` → `canonical(validateValue(q, a)) === canonical(validateValue(q, b))` (a `set` sorted); `record|table` → the non-`text` columns (`Column.kind !== 'text'`; a table with none, e.g. S2, uses its first column, T021 Q1) projected, each cell normalised the same way, compared as an unordered set of rows; `text` → always true. `asked(id)` = the turns `t` where `id` was in a `round` of an `eligian_brief` result of `t` and a judged question of `t` lists it; `firstRecorded(id)` = the first snapshot turn whose answer for `id` is `same` as the final. Each FR-038 bullet is one check; every failure is a string `"<id>: <reason>"`.
3. `factsAsked`: the count of judged questions with `fact: true`, plus one per unparsable message.
4. `questionsWithoutRecommendation`: `recommendation: false` likewise.
5. `rounds`: messages with ≥ 1 question, questions per message, and the `round` lengths `eligian_brief` returned.
6. `changedAnswer` (vague only): `script === null` → `{ pass: false, reason: 'script-not-applied' }`; else `before = parseBrief(brief snapshot of script.turn)`, `dependents = changedAnswerDependents(before.brief…)`: `applyAnswers(TREE, before.brief, facts, change.answers, nextRound(before.brief))`, `evaluate`, the instance ids with `status === 'stale'` (`engine.ts:704–716` is the engine's rule), then to a fixpoint: `applyAnswers` with every stale instance's recorded value, `evaluate`, add the newly stale ids, until a pass adds none; minus the changed ids (FR-041 item 6, T021 Q3); pass when every changed id's final value is `same` as the script's and every dependent is listed by a judged question of a turn `> script.turn`; `notReasked` lists the others.

`interviewPass` (FR-041, R-11): not aborted, approved, measure 1, measure 2, `factsAsked === 0`, `questionsWithoutRecommendation === 0`, and for `vague` measure 6. `interviewVerdict` (FR-043): `passed > records.length / 2`, aborted runs in the denominator.

### 10. `cli/mcp/evals/harness.ts` (FR-030 to FR-034, FR-048)

```ts
export interface HarnessArgs {                 // as today, plus (present only in persona mode, P6):
  readonly personas?: readonly PersonaName[];
  readonly userModel?: string;
}
export type ElicitationHookSpec =
  | { readonly mode: 'accept'; readonly script: string }
  | { readonly mode: 'persona'; readonly script: string; readonly sheet: string; readonly conversation: string;
      readonly userModel: string };            // the resolved --user-model id (FR-039, FR-040)
export interface ArmSetup {
  readonly mcpConfig: string; readonly allowedTools: string;
  readonly stateDir?: string;                  // A1 only
  readonly briefFixture: boolean;              // a BRIEF.md was written
  readonly env: Readonly<Record<string, string>>;   // A1: ELIGIAN_MCP_LOG and ELIGIAN_STATE_DIR
}
export async function prepareArmProject(arm: Arm, project: {
  readonly dir: string; readonly cli: string; readonly mcpLog: string; readonly scratch: string;
  readonly hook?: ElicitationHookSpec;                                  // A1 only
  readonly brief?: { readonly fixture: string; readonly caseId: string; readonly now?: Date };
}): Promise<ArmSetup>;
export function elicitationHookCommand(spec: ElicitationHookSpec, log: string): string;   // FR-030 / FR-040 text
export function agentIsolation(installedPlugins?: readonly string[]): Isolation;
export function caseAgentArgv(o: { prompt: string; setup: ArmSetup; model: string; isolation: Isolation }): string[];
export function interviewTurnArgv(o: { message: string; sessionId: string | undefined; setup: ArmSetup;
  model: string; isolation: Isolation }): string[];
export function noToolsArgv(o: { model: string; mcpConfig: string; isolation: Isolation }): string[];  // judge, user, round judge
/** SC-023: the environment of every claude spawn; run.ts builds no spawn env any other way. */
export function spawnEnv(o: { base: NodeJS.ProcessEnv; setup?: ArmSetup; isolation: Isolation }):
  Record<string, string | undefined>;
// = { ...base, ...(setup?.env ?? {}), ...isolation.env, [ISOLATION_ENV]: JSON.stringify(isolation) }
```

`elicitationHookCommand({ mode: 'persona', …, userModel }, log)` = `node "<script>" persona "<log>" --sheet "<sheet>" --conversation "<conversation>" --user-model <userModel>`: the user model reaches the hook on its own argv, not through an inherited variable (Claude Code runs the hook in its own environment). `elicitation-hook.cjs` has no fallback model: persona mode without `--user-model` declines and logs `{ input, raw: null, answer: 'decline', reason: 'no --user-model' }`, so no hand-copied model id exists to drift from `MODELS` (`harness.ts:20`).

A1 additionally: `stateDir = <scratch>/state`; when `brief` is given, `ensureKey` via `confirmBriefFixture(fixture, dir, stateDir, now, FIXTURE_CONFIRMATION(caseId))`; an `{ error }` throws `brief fixture of <id>: <error>` (a named setup failure: `run.ts:351–353` already turns a throw into `setup: …`); `.mcp.json`'s `env` gains `ELIGIAN_STATE_DIR: stateDir` (`harness.ts:173`); `.claude/settings.json` = `{ "hooks": { "Elicitation": [ { "hooks": [ { "type": "command", "command": elicitationHookCommand(hook, <scratch>/elicitations.log), …(persona ? { "timeout": 180 } : {}) } ] } ] } }`. `elicitationHookCommand` quotes a path with a space (`"<path>"`). The `isInside(dir, scratch)` guard (`harness.ts:155–157`) also covers the state directory, which is under `scratch`. A0 / A-none: unchanged (no state, no hook, no brief).

`caseAgentArgv` = isolation args + today's flags in today's order (`run.ts:321–345`); `interviewTurnArgv` = the same with the message and `--resume <id>` from turn 2; `noToolsArgv` = isolation args + the judge flags of `run.ts:222–235`. `parseHarnessArgs` gains `--persona` (repeatable, `PERSONA_NAMES` only) and `--user-model` (`sonnet` / `opus` aliases as `--model`), with FR-034's error strings; `HARNESS_USAGE` names both.

`RunRecord` gains `brief?: { fixture: boolean; approved: boolean }` and `isolation?: Isolation`; `RunRecordSchema` gains them as `Schema.optionalKey` (P6). `renderSummary` prints the isolation once ("Isolation: claude <args> with <env>").

### 11. `cli/mcp/evals/transcript.ts` (FR-032, P7)

`ToolEntry` gains `readonly isError?: true` (from `item.is_error === true` on the matching `tool_result`). `computeMetrics`: `toolCalls: entries.filter(e => e.name !== `${MCP}eligian_brief`).length` (`transcript.ts:265`, `MCP` at `:187`). `toolCalls(events)` (`:141`) unchanged.

### 12. Repo side: `evals/mcp/`

- **`run.ts`**: `RunBundle` gains the new functions. `main` reads `lib.parseHarnessArgs`; persona mode branches into `runInterviews(ctx)`. One `claude plugin list --json` per run gives the installed ids → `isolation = lib.agentIsolation(ids)` (a failing `claude plugin list` → `[]` and a stderr warning, recorded in the summary). Case runs: `await lib.prepareArmProject(arm, { dir, cli, mcpLog, scratch, ...(arm === 'A1' ? { hook: { mode: 'accept', script: HOOK }, ...(fixture ? { brief: { fixture, caseId: id } } : {}) } : {}) })`; the agent spawn uses `lib.caseAgentArgv(…)` and `env: lib.spawnEnv({ base: process.env, setup, isolation })` (every `claude` spawn of `run.ts`, the judge, simulated user and round judge included, takes its env from `spawnEnv` and from nowhere else); after the agent, `brief.approved = (await lib.briefStateOf(dir, setup.stateDir)) === 'approved'`; `<scratch>/elicitations.log` copied to `<outBase>.elicitations.log`. The rubric judge uses `lib.noToolsArgv`. Interview runs: per persona × n, a fresh project and scratch, `npm init -y`, `npm install <tarball>`, `prepareArmProject('A1', { …, hook: { mode: 'persona', script: HOOK, sheet, conversation: <scratch>/interview/conversation.json, userModel: <resolved --user-model, default MODELS.sonnet> } })`, then `lib.runInterview(run, deps)` with `deps.agentTurn` spawning `claude` with `interviewTurnArgv` (30 min timeout per turn, `AGENT_TIMEOUT_MS`), `deps.userReply` and `deps.judge` spawning `claude` with `noToolsArgv` and the prompt on stdin (`JUDGE_TIMEOUT_MS`, cwd `<scratch>/user` / `<scratch>/judge` with an empty `mcp-empty.json`). `summary.md` = `lib.renderInterviewSummary(records, isolation)` + provenance, rewritten after every run. Exit 0 when every persona's `interviewVerdict` passes.
- **`elicitation-hook.cjs`** (CommonJS, `node:` only; argv: `<mode> <log> [--sheet s] [--conversation c] [--user-model m]`): reads stdin JSON; `mcp_server_name !== 'eligian' || mode !== 'form'` → `decline`; `field` = the one key of `requested_schema.required` (else the first boolean property); mode `accept` → `accept` with `{ [field]: true }`; mode `persona` → runs `ELIGIAN_EVAL_USER_COMMAND` (JSON array) or `claude` with `-p --output-format json --model <the --user-model argument; missing → decline, no fallback> --strict-mcp-config --mcp-config <tmp empty> --tools "" ` plus the isolation args from `ELIGIAN_EVAL_ISOLATION` (else `DEFAULT_ISOLATION_ARGS`), `spawnSync` with the prompt on stdin (`simulated-user.md` path beside the script, the sheet, the conversation, the dialog's `message`, the confirm instruction), `timeout: 150_000`, cwd a temp dir outside the project; the last non-empty line of the `result` text (or of stdout when it is not `claude -p` JSON) parsed; exactly `{"confirm": true}` → accept, else decline. Writes exactly one JSON object on stdout; appends `{ input, raw, answer }` to the log. `module.exports = { DEFAULT_ISOLATION_ARGS, decide }` with a `require.main` guard, so the decision rule is unit-tested without a spawn.
- **`simulated-user.md`**, **`interview-judge.md`** (frontmatter `judge-model: claude-opus-5-5`, as `rubric.md:1–3`; the user model is `--user-model` / `MODELS.sonnet`, FR-039): plain prompts, loaded by `run.ts` with the rubric's frontmatter reader generalised to `loadPinnedPrompt(file)` (`run.ts:167–177`).
- **`personas/*.json`**, **`cases/<id>/brief.md`**: see Data.

### 13. Docs chunks (FR-009 to FR-012)

- `curriculum/interview.md`: frontmatter `id: interview`, `title: "The brief interview"`, `kind: workflow`, `use_cases: ["new presentation", "addition to a presentation"]`, `see: ["brief-questions", "decisions", "provider-choice", "presentation-patterns", "css-conventions", "storyboard"]`, `card: "Interview the user with eligian_brief before any file: rounds, recommendations, facts you look up, delegated answers, the sign-offs."`. Sections: Rounds (one message per round; title, recommendation worded so yes accepts it, the doc it came from); Recommendations (`decisions`, `provider-choice`, `presentation-patterns`, `css-conventions` and each item's `docs`); Facts, not questions (roadmap §3.1's four bullets, each item's `facts`); "You decide" (`delegated: true` with your choice as `value`; listed at sign-off); The sign-offs (counts, delegated answers, the `BRIEF.md` path; declined → ask what to change; no dialog → the reply verbatim as `confirmation`, with the `ticket`); Changed answers (a stale question comes back with `previous`; ask it again); the full tree is `brief-questions`. No `eligian` code block (no probe compiles, `mcp-knowledge.spec.ts:1062` pattern).
- `curriculum/storyboard.md`: title "Storyboard from the brief" (today "Storyboard first", `storyboard.md:3`), card "Draft STORYBOARD.md from the confirmed brief, then approve it with eligian_brief (action: approve-storyboard) before writing code." (today `storyboard.md:10`), first heading "# Storyboard: draft STORYBOARD.md from the confirmed brief" (today "# Storyboard: write STORYBOARD.md before any Eligian", `storyboard.md:13`); none of the three contains "before any Eligian" (FR-010, SC-006); a paragraph mapping each header line to its brief source (FR-010) with the five problem codes; a new `## Approval` section before "Before declaring done"; the beat and interaction tables, "From rows to code", the worked examples and "Before declaring done" (`storyboard.md:185–207`) unchanged. Its `see` gains `interview` and `brief-questions`.
- `curriculum/what-is-eligian.md:107`: step 1 becomes FR-012's sentence; step 2 onward renumbered.

`brief-questions` and the generator (`generate-knowledge.ts:276`, `:804–831`) are unchanged; `interview` reaches `index.json`, `resources/list` and the `AGENTS.md` block's index list through the existing curriculum scan.

## Data and generation

| Artifact | Input | Produced by | Drift guard |
| --- | --- | --- | --- |
| `dist/docs/curriculum/interview.md`, `index.json` entry, `eligian://docs/interview` | `curriculum/interview.md` | `pnpm -C packages/cli generate:knowledge` (every build) | `mcp-knowledge.spec.ts` (P10, SC-006), `mcp-resources.spec.ts` (count = index length, `:143`) |
| `dist/docs/agents-block.md` | `agentsMdBlock(index)` with `BLOCK_PARTS[4]` (`generate-knowledge.ts:1259`) | same | `agents.spec.ts:535–541` (`toBe(agentsMdBlock(index))`) |
| `evals/mcp/personas/{terse,detailed,vague}.json` | the Phase 1 fixtures (`__fixtures__/mcp/brief/personas/*.json`: 40 / 71 / 50 keys, read this session) | hand-written once by copying each fixture's `idea`, `answers` (values verbatim, `mode` by FR-037's rules) and `script`, plus an `opening` | SC-013 (`evals-interview.spec.ts`): keys, values and script equal the fixture's; modes per persona |
| `evals/mcp/cases/<id>/brief.md` × 12 | the case prompt (`cases/<id>.json` `prompt`), the reference solution (`__fixtures__/mcp-solutions/<id>/`: timeline names, `languages`, `extensions`) | hand-written; each drafted by playing a per-case answer map through the engine in a scratch script (not committed) and checking `writeBrief`'s output; `by: user` for what the prompt states, `by: delegated` for the rest; `keyboard-deck`'s twelve slides answer branch V once and `V:slide-<n>` `same as slide-1` (Phase 1 FR-014) | SC-011 (parses, confirms, R3), SC-012 (the solution passes the gate) |
| `instructions-phase4.txt.snap` | `INSTRUCTIONS[4]` | `toMatchFileSnapshot` (first run writes it; reviewed in the diff) | `mcp-server.spec.ts` |

No generator is committed for the fixtures: they are data, and two specs check them against the engine and the solutions.

## Test plan

Every spec is written red first. "spawned" means `spawnSync(process.execPath, [bin, …])` with `bin = packages/cli/bin/cli.js`, skipped when `dist/cli.mjs` is absent (the `built` pattern of `package-bin.spec.ts`).

| FR / SC | Spec file | describe › it | Strategy |
| --- | --- | --- | --- |
| FR-001–FR-005, SC-004 | `mcp-instructions.spec.ts` | `phase 3 instructions` (the `expect(MCP_PHASE).toBe(3)` / `expect(INSTRUCTIONS[MCP_PHASE]).toBe(text)` lines, `mcp-instructions.spec.ts:152–153`, move out into the phase 4 block as `toBe(4)` / `INSTRUCTIONS[4]`; the other `INSTRUCTIONS[3]` checks unchanged); new `phase 4 instructions` › `MCP_PHASE is 4 and INSTRUCTIONS[4] ≤ 4096`, `the brief line comes first and says approved and addition`, `has the decisions rule`, `no storyboard-first docs line`, `backticked tokens are tools or ids` (P8; `PHASE_2_TOOLS` + `eligian_brief`), `names all nine tools` | string asserts; `unknownTokens` reused |
| FR-006, SC-004 | `mcp-instructions.spec.ts` › `agentsMdBlock` | `carries the brief line and the decisions rule` | `agentsMdBlock(index)` contains both |
| SC-004 | `mcp-server.spec.ts` | `INSTRUCTIONS[MCP_PHASE] matches the Phase 4 snapshot`; `INSTRUCTIONS[3] matches the Phase 3 snapshot` (renamed, same file); `initialize serves INSTRUCTIONS[4]` | `toMatchFileSnapshot('__snapshots__/instructions-phase4.txt.snap')`; the phase-3 snapshot file unchanged |
| SC-004 (P8) | `mcp-server.spec.ts` | existing `backticked tokens are tools or index ids` (`:229–237`), unchanged in code, must stay green over `INSTRUCTIONS[4]`; existing `initialize` checks `instructions` `toBe(INSTRUCTIONS[MCP_PHASE])` (`:191`, `:272`) unchanged | `indexIds` from `generateKnowledge` into a temp dir over the source curriculum (`:97–103`), so `interview` is in it once `curriculum/interview.md` exists |
| FR-007, FR-008, SC-005 | `mcp-prompts.spec.ts` | `NEW_PRESENTATION` › `names only existing doc ids and tools, from one source` (expected arrays gain `eligian_brief`, `interview`), `has fourteen numbered steps in order` (P9: step 1 has `eligian_brief` and `action: status`; `eligian_init` first appears after `approve-storyboard`), `puts the idea first`, `≤ 4,096 chars without the idea`; new `ADD_TO_PRESENTATION` › same three shape checks, `names scope, eligian_project and approve-storyboard`; `over MCP` › `prompts/list has exactly the two prompts`, `prompts/get add-to-presentation returns one user message with the addition`, `a missing or empty addition is invalid params` | the existing in-process server pattern (`:116–170`) |
| FR-009–FR-012, SC-006 | `mcp-knowledge.spec.ts` | `FR_039_CHUNKS` gains `interview: 'workflow'` (P10); new `describe('spec 059 phase 3 chunks')` › `interview is a workflow chunk in curriculum/interview.md`, `interview names its sources and the sign-off words`, `storyboard names the five problem codes and approve-storyboard; its title, card and first heading drop "before any Eligian"` (three separate `not.toContain` asserts), `what-is-eligian step 1 is eligian_brief`; `brief-questions lists every template question` (`:420`) unchanged | over a generated temp docs dir (the spec's existing `beforeAll`) |
| SC-006 | `mcp-resources.spec.ts` | the existing count test passes with one more; new `eligian://docs/interview is listed` | in-process |
| FR-013–FR-019, FR-021, SC-007 | new `brief-hook-gate.spec.ts` | `rule 1`, `rule 2`, `rule 2 without a record` (Q5), `rule 3` (iterates `ELICITATION_HOOK_EVENTS`), `rule 4`, `fail open`, `newProgramVerdict root` (record / no record / an unparsable `programs.json`: root equals `cliGovernanceRoot`'s, the no-record decision; P20), `cliBriefWarnings is unchanged by newProgramVerdict` (re-runs one warning case) | one exported table `HOOK_CASES: readonly { name; input; files?; platform?; expect: 0 \| 2; rule? }[]` in `__tests__/hook-cases.ts` (shared with SC-022); each case: `tempProject`, `snapshotFiles(project)` and `snapshotFiles(stateDir)` before/after, `hookDecision(input, { ELIGIAN_STATE_DIR: stateDir }, platform)`; for approved cases `approvedBrief(server, dir, { stateDir })` on `startInMemoryServer({ cwd: dir, docsRoot, brief: { stateDir } })`; "signed with another key" re-reads with a second state dir; `EISDIR`: `mkdir BRIEF.md` |
| FR-013, SC-007, SC-009 | `brief-hook-gate.spec.ts` › `spawned` | one spawned `bin/cli.js brief gate` per rule + one allow: exit code, stdout `''`, stderr ends with `HOOK_SUFFIX` | `spawnSync(…, { input: JSON.stringify(case.input), env: { ...process.env, ELIGIAN_STATE_DIR } })` |
| SC-009 | `brief-hook-gate.spec.ts` › `purity` | `hook-gate.ts imports nothing from @eligian/language, effect/ai or ../tools/; no console. or process.stdout` | `fs.readFileSync` + regex over its import lines |
| SC-008 | `package-bin.spec.ts` | `brief gate decides in under 3 s (median of 5)` × 2 inputs; `the prefilter passes a non-guarded write in under 1 s (median of 5)` × 2 inputs | the `--version` timing pattern (`:152–162`); the approved brief prepared in `beforeAll` (FR-008's text); the prefilter run with a `PATH` whose stub `npx` records invocations (none expected) |
| FR-047, SC-022 | new `hook-prefilter.spec.ts` | `(a) forwards every blocked input of HOOK_CASES byte-identical to npx -y eligian@^1.2 brief gate`, `(b) exits 0 at once on none of the four kinds`, `(c) passes the CLI's exit code and stderr through`, `(d) exits 1 with one line when npx cannot start` (spawned, a `PATH` holding only a temp dir without the stub and the node dir; on Windows this drives P17's lookup branch, nothing spawned; on Linux the `ENOENT` branch; asserts exit 1, exactly one stderr line starting `eligian hook: cannot start npx`, empty stdout), `(d, win32 branch on every OS) startGate('win32', env, which) with a which that finds nothing returns the one-line error; with one that finds C:\x\npx.cmd returns the quoted command line`, `findOnPath` › `walks PATH × PATHEXT in order`, `matches the Path key case-insensitively`, `defaults PATHEXT`, `undefined when nothing exists` (injected `exists`), `(e) requires only node: builtins`, `npxInvocation quotes the caret and the npx path on win32` | a temp `bin/` dir first on `PATH` with a stub: POSIX `npx` (`#!/bin/sh` + `exec node stub.cjs "$@"`, chmod 755), Windows `npx.cmd` (`@node "%~dp0stub.cjs" %*`); `stub.cjs` appends `{ argv, stdin }` to a marker file and exits with `STUB_EXIT`, writing `STUB_STDERR`; (a) iterates the cases whose `hookDecision` blocks (computed in the spec, so the table drives both) |
| FR-022–FR-026, SC-010 | `plugins.spec.ts` | `holds exactly plugin.json, .mcp.json, hooks/hooks.json and hooks/prefilter.cjs`, `hooks.json has one PreToolUse entry with the prefilter command`, `the prefilter's package spec is the server entry's`, `requires only node: builtins`, `the marketplace description names eligian@^1.2 and eligian_brief`; existing `the README names the per-project route and the plugin install` with its expected string `'npx -y eligian@^1.1 mcp'` (`:101`) changed to `'npx -y eligian@^1.2 mcp'` (P19); new `the README names no eligian@^1.1` (no `eligian@^1.1` substring left); other existing `serverEntry` and version tests unchanged in code | `require(prefilter).NPX_GATE_ARGS[1] === mcp.args[1]` |
| FR-024, SC-010 | `agents.spec.ts` | `NPX` constant `eligian@^1.2` (`:42`); every existing test unchanged otherwise | — |
| FR-026, SC-010 | `mcp-registry.spec.ts` | unchanged code; passes with `1.2.0` | — |
| FR-026, SC-016 (P18) | `mcp-stdout.spec.ts` | `HEADER` (`:50`) and the header prefix assertion (`:281`) built from `packages/cli/package.json`'s `version`; every frame-purity assertion unchanged | `JSON.parse(fs.readFileSync(<cli package.json>))`, the version regex-escaped; the spec runs when `dist` is built (`test.skipIf(!built)`), so the gate builds first |
| FR-027, FR-028, SC-011 | `eval-cases.spec.ts` | new `describe('brief fixtures')` › `exactly the 12 cases without start/ have brief.md`; per case `parses with no ignored content`, `confirms on its materialised fixtures` (`confirmBriefFixture` → `{ text }`; `briefStateOf` → `confirmed`), `R3 is the case's entry`; `a fixture with one answer removed is refused naming it` | imports `../mcp/evals/brief-fixture.js` from source; `materialiseFixtures` into a `tempProject`; a temp state dir |
| FR-027, SC-012 | new `mcp-solutions-brief.spec.ts` | per case `the reference solution passes the gate under its fixture` | `startInMemoryServer({ cwd, docsRoot, brief: { stateDir } }, { elicitation: true, onElicit: () => ({ action: 'accept', content: { approved: true } }) })`; confirmed fixture + `storyboardFor(evaluation)` written; `approve-storyboard` → `approved`; solution copied (`fs.cpSync`); `eligian_check` on `main.eligian` → `error?.kind !== 'gate'`. Cases run serially in one file (Langium, R1); 120 s per case |
| FR-029–FR-032, SC-015 | `evals-harness.spec.ts` | `prepareArmProject` › existing cases with `await` (P5); `A1 with a fixture writes a confirmed BRIEF.md, the accept hook and ELIGIAN_STATE_DIR`, `the state dir is outside the project`, `A0 and A-none write none of these`, `the persona variant writes the persona hook with timeout 180`; `elicitation-hook.cjs accept` › `accepts approved`, `declines another server`, `appends to the log`; `computeMetrics` › `eligian_brief calls do not count` | spawned `node evals/mcp/elicitation-hook.cjs` with the spike's input (`spikes.md` §4.2) |
| FR-034, FR-048, SC-020, SC-023 | `evals-harness.spec.ts` | `parseHarnessArgs` › the six persona cases of SC-020; `agentIsolation` › `args and env as plan.md fixes them`, `disables each installed plugin`; `argv builders` › `case agent, interview turn and no-tools argv start with the isolation args`; `spawnEnv` › `holds isolation.env, ELIGIAN_EVAL_ISOLATION (the JSON of the isolation) and setup.env over base`, `without a setup holds isolation.env and ELIGIAN_EVAL_ISOLATION`; `elicitationHookCommand` › `the persona command carries --user-model <userModel>`, `the accept command carries none`; `elicitation-hook.cjs DEFAULT_ISOLATION_ARGS equals agentIsolation().args`; `renderSummary prints the isolation once`; `elicitation-hook.cjs persona with a stub claude and no ELIGIAN_EVAL_USER_COMMAND passes the isolation args and --model <the --user-model argument>` (the stub records its argv; run with `--user-model claude-opus-5-5` and asserted on that id, so a default cannot pass by accident), `persona without --user-model declines and logs the reason (no claude started)` | stub `claude` on `PATH` (same per-platform stub as SC-022) |
| FR-037, SC-013 | new `evals-interview.spec.ts` | `sheets` › per persona `decodes`, `keys, values and script equal the Phase 1 fixture`, `delegated ids of sheetToPersona`, `modes`, `content`; `plays to complete through eligian_brief` | `loadPersona`, `runPersona` on an in-process server (the `mcp-brief-interview.spec.ts` pattern) |
| FR-038, FR-041, FR-042, SC-014 | `evals-interview.spec.ts` | `measure 1`, `measure 2` (one `it` per comparison kind and per FR-038 bullet, plus `a V:<view> answer "same as <view>" resolves to SAME_AS and compares`, over a `keyboard-deck`-style `V:slide-2` answer), `measures 3 and 4`, `bundled questions`, `parseJudgeReply`, `measure 6` (vague's real script on a round-8 snapshot built in the spec by an engine loop over `sheetToPersona(vague)`: `pickRound` → answers → `applyAnswers` for 8 rounds, then `writeBrief`; `changedAnswerDependents` equal to a direct `applyAnswers` + `evaluate`), `interviewVerdict` | synthetic events in the shapes `toolEntries` reads (assistant `tool_use`, user `tool_result` with `is_error`) |
| FR-035, FR-039, FR-040, FR-043, SC-020 | `evals-interview.spec.ts` | `interviewStop` (five cases), `runInterview with a fake runner` › `turn 1 sends the opening verbatim`, `stops at the first approved turn`, `a turn without a result aborts`, `writes conversation.json before each turn and the result files`, `fires the script after the round count reaches afterRound`, `the record carries run.isolation` (`toEqual(run.isolation)` on the returned record and on the decoded `<persona>-<n>.json`); `renderInterviewSummary` › `prints the isolation once` (one occurrence over three records); `elicitation-hook.cjs persona` › `true → accept`, `false → decline`, `garbage → decline`, `non-zero → decline`, `the stub reads the message, the sheet and the conversation` | fake `agentTurn` writes `BRIEF.md` states through `confirmBriefFixture`-signed fixtures; `ELIGIAN_EVAL_USER_COMMAND='["node","<stub>.cjs"]'` |
| FR-032 | `evals-transcript.spec.ts` | `toolEntries marks is_error results` | synthetic events |
| SC-016 | `mcp-server.spec.ts`, `mcp-stdout.spec.ts` | the frame-purity assertions unchanged (the version literal moves, P18; compliance.md records that reading of "unchanged"); `git diff -- …/tools-list-phase3.json.snap` empty in the compliance run | — |
| SC-017, SC-021, SC-024, SC-025 | compliance run | Grep checks as written in the spec | — |
| SC-018, SC-019 | gates | see Build integration | `git status --porcelain` after `pnpm test` |
| SC-001–SC-003 | user runs | `pending-user` with the commands of the spec, plus the isolation probe (Isolation) | — |

Coverage: `hook-gate.ts`, `brief-fixture.ts` and `interview.ts` are unit-tested in process (the spawned runs add no coverage); `newProgramVerdict` is covered by `brief-hook-gate.spec.ts`. `run.ts`, the two `.cjs` scripts and the plugin are outside `src/**/*.ts` (`vitest.config.ts:68`), so they do not count.

## Build integration

- **package.json (cli)**: `version` 1.2.0. No new script; `generate:knowledge` already runs in every build.
- **package.json (root)**: `"evals:interview": "tsx evals/mcp/run.ts --persona terse --persona detailed --persona vague"` beside `evals:mcp` (`package.json:27`); `pnpm evals:mcp --persona …` works as well (FR-034).
- **esbuild.mjs**: no change. `brief-fixture.ts` and `interview.ts` reach `dist/evals/assert.mjs` through `assert.ts`'s new `export * from './brief-fixture.js'; export * from './interview.js';` (beside `assert.ts:1466–1469`); `hook-gate.ts` reaches `dist/cli.mjs` through `main.ts`'s dynamic import. `package-bin.spec.ts`'s external-dependency assertions are unaffected (no new import outside `node:` and the workspace).
- **exports map / `files`**: unchanged (the plugin and `evals/` are not in the npm package; `dist/evals` is not packed).
- **README** (`packages/cli/README.md`): FR-044, at `:437` (Use with coding agents), `:448–458` (tool table), `:578` (Claude Code plugin); and every `eligian@^1.1` command moved to `^1.2` (P19): `:488` (`agents setup`), `:559–565` (per-client commands, the Windows `cmd /c` forms included), `:586` (the plugin's server command), `:598` ("upgrade to `eligian@^1.2`"). Also: `ELIGIAN_STATE_DIR` must be set in the environment Claude Code runs in, not only in the server entry's `env`, or the hook cannot read the key (Risks R5).
- **CHANGELOG.md**: entries under "## Unreleased (2026-11-05)" › "### Added" (`CHANGELOG.md:7–9`), in its bold-lead style.
- **AGENTS.md** (root, `packages/cli`): FR-046, including checklist item 6.
- **roadmap.md**: §7.1 reworded (FR-028) in the build; the §8 status line completed after the workflow writes it (SC-021).

### Gates

After each task group: `pnpm build`, `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm run ci` (Biome, no writes), scoped `pnpm -C packages/cli exec vitest run <changed specs>`. When a group touches any file under `packages/cli/src` that imports from `'effect'` (`gate.ts`, `harness.ts`, `interview.ts`, `prompts.ts`, `server.ts`; all in `effect:check:cli`'s project, `packages/cli/tsconfig.json`, root `package.json:31`): `pnpm effect:check:cli`, so groups 1, 3, 4 and 6 run it. Last group: `pnpm check`, `pnpm test`, the root `pnpm test:coverage:ci` (root `package.json:16`: every package's `test:coverage:ci`, so the CLI thresholds `vitest.config.ts:72–77` and the language thresholds 79.8 / 80 / 69.9, as SC-018 lists them), `pnpm effect:check`, `pnpm run check:examples`, `pnpm run smoke:examples`, `pnpm run fmt:examples` (no language change; run because SC-018 lists them), `git status --porcelain` (SC-019), and locally `claude plugin validate --strict plugins/claude/eligian` (SC-010).

## Risks and mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Langium singleton.** SC-012 runs `eligian_check` twelve times; SC-013 runs `eligian_brief` interviews. | The hook loads no document (FR-013). SC-012 uses one in-process server per case, serially in its own file, under the server's own `CompilerLock` (Phase 2); SC-013 calls only `eligian_brief` (no Langium). No `@eligian/language` import is added to `hook-gate.ts`, `brief-fixture.ts` or `interview.ts` (grep, SC-009). |
| R2 | **jsdom globals.** | Nothing in this phase loads jsdom: no smoke run is added (SC-012 calls `eligian_check` only). |
| R3 | **Stdout pollution.** A hook's stdout on exit 0 is read as JSON by Claude Code; the server's stdout carries frames. | `brief gate` writes only stderr (SC-007 asserts empty stdout on every spawned case); the prefilter's child stdout is `ignore`d; `elicitation-hook.cjs` writes exactly one JSON object; `mcp-stdout.spec.ts`'s frame-purity assertions unchanged (SC-016; only its version literal is derived from `package.json`, P18). |
| R4 | **Startup time.** `brief gate` loads the whole bundle (`main.ts:11` imports `@eligian/language`); `npx` adds resolution. | The prefilter keeps every other write at one `node` start (SC-008, < 1 s); the guarded path is bounded at 3 s median (SC-008). With a project-local `eligian` 1.2.x, `npx` runs it without a download (R-4, settled in SC-003). |
| R5 | **The hook and the server read different keys.** The hook reads `stateDirectory(process.env)`; if a user sets `ELIGIAN_STATE_DIR` only in the server entry's `env`, an approved brief does not verify in the hook and rule 2 blocks every new program. | README states it (Build integration); the block reason names the brief's state as the hook read it, so the mismatch shows as "BRIEF.md is complete" beside an approved brief. |
| R6 | **Windows paths.** Backslashes, drive-letter case, `.cmd` shims, the caret. | `hookDecision`'s `platform` argument and `/[\\/]/` segments (SC-007 Windows cases run on Linux CI); P3 for `npx`; P4 for the plugin root path; the eval hooks are run as `node <absolute path>` and quoted when the path has a space. SC-003 runs on Windows. |
| R7 | **Coverage thresholds** (CLI 77.1 / 77.6 / 64.5 / 76.6). | The new src modules are pure or injected and fully specced; `runInterview` is driven by the fake runner. `test:coverage:ci` in the last group. |
| R8 | **Isolation not complete** (P2): a managed `enabledPlugins: true`, or a plugin not listed by `claude plugin list`. | The record states the isolation applied; the probe (Isolation) runs before SC-001; `summary.md` prints the isolation. |
| R9 | **SC-002's baseline runs without isolation.** The baseline is `5e47ea9`'s `run.ts`, which spawns `claude -p` with the user's settings, hooks and plugins; the phase run is isolated. | Before the baseline, the user records in compliance.md which user-level hooks and plugins are active (`claude plugin list --json`, the `hooks` of `~/.claude/settings.json`); see Open questions. |
| R10 | **A fixture's applicability flips during the run** (P16). | Fixtures name only materialised assets; SC-012 checks with the solution's files in place. |
| R11 | **Hook timeout.** A first `npx` fetch of `eligian@^1.2` may exceed Claude Code's default hook timeout. | A timeout is a non-blocking hook error (edge case "A hook that cannot run"): the write proceeds and the server's gate still refuses the generation tools. A local install avoids the fetch (R-4). |
| R12 | **Eval cost.** 9 interview runs × ≤ 30 turns × (agent + simulated user) + one judge per turn; 42 case runs twice (baseline and phase). | Local only (decision 9); the interview stops at approval; `--runs` and `--persona` select subsets. |
| R13 | **`McpServer.prompt` is `@stability unstable`.** | `effect` is pinned exactly (roadmap §9 risk 6); the second prompt uses the same call as the first. |

## Suggested task groups (for tasks.md)

1. **Hook core** (P): `gate.ts` `newProgramVerdict` and `cliGovernanceRoot` (P20, `cliWarningOf` switched to it); `hook-gate.ts`; `hook-cases.ts` + `brief-hook-gate.spec.ts`; `main.ts` `brief gate`.
2. **Plugin and versions**: `prefilter.cjs` (with `findOnPath` / `startGate`, P17) + `hook-prefilter.spec.ts`; `hooks.json`, `.mcp.json`, `plugin.json`, `marketplace.json`; `NPX_ARGS`; 1.2.0 in `package.json` / `server.json`; `mcp-stdout.spec.ts` header from the package version (P18); the README's `^1.1` commands → `^1.2` (P19); `plugins.spec.ts` (incl. `:101`), `agents.spec.ts`; `package-bin.spec.ts` timings (SC-008).
3. **Teaching** (P with 1–2): instructions string 4 + specs + snapshot; prompts + `server.ts` + spec; `interview.md`, `storyboard.md`, `what-is-eligian.md` + knowledge/resources specs.
4. **Eval core**: `transcript.ts` (`isError`, count); `brief-fixture.ts`; `harness.ts` (isolation, argv builders, `spawnEnv`, `elicitationHookCommand` with `--user-model`, async arm setup, args, record fields); `elicitation-hook.cjs`; `evals-harness.spec.ts`, `evals-transcript.spec.ts`.
5. **Fixtures**: twelve `cases/<id>/brief.md`; `eval-cases.spec.ts` (SC-011); `mcp-solutions-brief.spec.ts` (SC-012); roadmap §7.1 rewording.
6. **Interview**: `interview.ts`; personas; `simulated-user.md`, `interview-judge.md`; `evals-interview.spec.ts`; `run.ts` interview mode and isolation; root script.
7. **Docs and close**: README, CHANGELOG, AGENTS.md files; full gates with coverage; compliance with SC-001–SC-003 `pending-user`, the isolation probe and the roadmap status line (SC-021).

## Open questions

All three were decided by the user on 2026-11-20 (spec Clarifications, plan review): 1 the args form, 2 `agentIsolation(installedPlugins)`, 3 run the baseline and record the user-level hooks and plugins.


1. **The hook command form (P4).** FR-022 / SC-010 pin `"command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/prefilter.cjs"`. The measured form is `"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/prefilter.cjs"]`, which does not split a plugin root containing a space. Recommendation: switch FR-022 and SC-010 to the args form.
2. **`agentIsolation` takes the installed plugin ids (P2).** FR-048 / SC-023 sketch `agentIsolation()` with no argument and name `--setting-sources` as the means; the documentation read for this plan shows a user-installed plugin stays enabled without its user-scope `enabledPlugins` entry (`defaultEnabled` defaults to `true`). Recommendation: accept `agentIsolation(installedPlugins)` with `--settings '{"enabledPlugins":{…:false}}'` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
3. **SC-002's baseline is not isolated (R9).** Recommendation: run the baseline as specified and record the active user-level hooks and plugins in compliance.md, rather than changing the commit or patching its harness.

## Review notes

- **Accepted with a correction (the `mcp-server.spec.ts` / `MCP_PHASE` issue).** The token test is real and now listed (P8, Test plan SC-004 row). Two details of the issue did not hold when read this session: `mcp-server.spec.ts` has no `MCP_PHASE` value assertion (its `:152` is inside the Phase 3 snapshot test; the only `expect(MCP_PHASE).toBe(3)` is `mcp-instructions.spec.ts:152`), and its `indexIds` do not depend on a rebuilt `dist`: the spec generates the docs into a temp dir from the source curriculum in its `beforeAll` (`mcp-server.spec.ts:97–103`).
- **The two prefilter-on-Windows issues are one change** (P17): lookup before spawn, chosen over mapping cmd's 9009, because a 9009 can also come from a command run inside a found `npx.cmd` and piping the child's stderr would break FR-047 (c)'s pass-through.
- **The two user-model issues are one change**: the model travels on the hook's argv (`--user-model`), and the `.cjs` has no fallback, so there is no copied id to guard with a drift test.
