# Phase 5 — Hardening and reach (phase-5-hardening-reach): compliance

**Overall status: INCOMPLETE**

## Honest gap list (fail / partial items)

No item is a hard fail. These are PARTIAL:

1. **Promotions (Group 10, T032–T043) are blocked: awaiting Phase 3 evals (FR-001b).** `specs/058-mcp-server/evals.md` does not exist, and `evals/mcp/results/` holds only 16 one-case runs with no telemetry logs ("16 runs scanned, 0 records", "none pinned"). The evidence rule is not applied, so nothing is promoted. Affected: FR-002, FR-003, FR-004, FR-004a, FR-005, FR-005a, FR-005b, FR-005c, FR-006, FR-007, FR-008, FR-009, SC-001 (validators-active clause), SC-010, SC-011, SC-012, SC-013, SC-019, SC-021.
2. **User-run items not run:** SC-002 and T044 (registry publish from main; the registry search returned `{"servers":[],"metadata":{"count":0}}`), SC-003 and T045 (eval phase-exit run), SC-009 and T046 (plugin install check; `npm view eligian versions` lists only 0.0.0-stage, 1.0.0, 1.0.1, so 1.1.0 must be published first).
3. **FR-029:** the roadmap is marked complete only on a fully green table. It is not green, so the roadmap stays unmarked.

## Compliance table

| id | verdict | evidence |
|---|---|---|
| FR-001 | pass | `renderPromotionEvidence` prints arm and model per counted run (`promotion-evidence.ts:246-248`; `modelsText` :228-231 gives "model not recorded"). Spec `mcp-promotion-evidence.spec.ts:130-149`: "Test Files  1 passed (1) / Tests  13 passed (13)". `pnpm evals:mcp:evidence` printed "promotion-evidence: 16 runs scanned, 0 records → specs\058-mcp-server\phase-5-hardening-reach\baseline\promotion-evidence.md", exit 0, byte-identical on a re-run. |
| FR-001a | pass | `baseline/promotion-evidence.md` exists: every (a)/(b) cell is "no data" and the 16 scanned runs are named. Script `"evals:mcp:evidence": "tsx evals/mcp/promotion-evidence.ts"`. `promotion-evidence-run.txt` records exit 0 and a byte-identical second run (sha256 a5cf3edf…). |
| FR-001b | pass | No promotion was made. `git status --porcelain` over `packages/cli/src/check`, `packages/language/src`, `packages/extension/src`, `mcp/diagnostics.ts` and `generate-knowledge.ts` printed nothing. REVIEW_CODES is unchanged (`review.ts:49-55`). The rule is coded at `promotion-evidence.ts:194`: `code !== NEVER_PROMOTED && (runsWithCode >= 2 \|\| rounds >= 1)`. Group 10 is marked BLOCKED in tasks.md. |
| FR-002 | partial | Blocked on the Phase 3 evals. `grep -n '^## Promotions' spec.md` returned exit 1. No `specs/058-mcp-server/evals.md`. |
| FR-003 | partial | Blocked (FR-001b). `git status --short packages/cli/src/check packages/cli/src/mcp/diagnostics.ts packages/language/src` printed nothing. `grep -n "'config'" packages/cli/src/mcp/diagnostics.ts` returned exit 1. |
| FR-004 | partial | Blocked (FR-001b). `git status --short packages/language/src` printed nothing, so `eligian-validator.ts` is unchanged. |
| FR-004a | partial | Blocked: conditional on promoting `timeline-container-not-in-layout`. Its row reads "no data \| no data \| ... \| rule not applied". `withoutReported` is still only in `packages/cli`. |
| FR-005 | partial | Blocked (FR-001b). `git status` is empty for `packages/extension/src` and `packages/cli/src/check`. |
| FR-005c | partial | Blocked (FR-001b). `packages/cli/src/check` is unmodified. The class/host walks have not moved. |
| FR-005a | partial | Blocked (FR-001b). `check-command.ts` and the extension's `eligius-lint.ts` are unmodified. |
| FR-005b | partial | Blocked: conditional on promoting `controller-imbalance` ("rule not applied"). No editor code action was added. |
| FR-006 | partial | Blocked (FR-001b). `check-command.ts` is unmodified, so `--no-review` / `review:false` behave as before. No CHANGELOG moved-code entry (T042). |
| FR-007 | partial | Blocked (FR-001b). `git status --short packages/cli/src/mcp/knowledge` printed nothing (T041). |
| FR-008 | partial | Blocked (FR-001b). The generator and overlays are unmodified (T041). |
| FR-009 | partial | Blocked with FR-002–FR-009, so the mini-spec rule has not been written. No warnings were added. `check:examples` -> "8 files, 0 errors, 0 warnings", then "1 file, 0 errors, 5 warnings" (demo), exit 0. `smoke:examples` -> "9 files, 11 timelines played, 0 errors, 0 warnings". `fmt:examples` -> "All 12 files formatted". |
| FR-010 | pass | `packages/cli/package.json:3` has `"mcpName": "io.github.rolandzwaga/eligian"`. `package-bin.spec.ts:268-270` asserts it. A manual tarball extraction printed `io.github.rolandzwaga/eligian` and a server.json count of 0. `publish-cli.yml:104` checks the installed tarball's `mcpName`. Caveat: the vitest assertion reads the source manifest, and the workflow step covers the tarball. |
| FR-011 | pass | `packages/cli/server.json` has the 2025-12-11 schema, name, title, a 92-char description, repository with subfolder, version 1.1.0, one npm package (stdio, positional `mcp`) and `ELIGIAN_MCP_LOG` (isRequired false, isSecret false). `files` excludes it (`package-bin.spec.ts:264`). `mcp-publisher validate` -> "✅ server.json is valid". |
| FR-012 | pass | `mcp-registry.spec.ts` checks name = mcpName, version three times, identifier, stdio, `packageArguments` = `['mcp']`, description ≤ 100, a handshake via `spawnServer({ args })`, and a negative control (`args: []` rejects with "mcp exited (1) before answering initialize"). Run: "Test Files 4 passed (4) Tests 44 passed (44)". |
| FR-013 | pass | `publish-cli.yml`: pinned mcp-publisher v1.8.7 with `sha256sum -c -` before `tar xzf` (:115-125); "Validate server.json" (:127-129) before Publish (:131); "Publish to the MCP registry" (:136-149) after Publish; a `registry_only` boolean input (:25-28) gating the other steps and the release job. No `continue-on-error`, no `secrets.`, `release` keeps `needs: publish`. |
| FR-014 | pass | `publish-cli.yml:142-149`: `attempts=6`, `sleep 30` (180 s ≤ 300), then `::error::` and `exit 1`. `mcp-registry.spec.ts:210-215` asserts the bounds. |
| FR-015 | pass | `packages/cli/README.md` ("From the MCP registry"), the root `AGENTS.md` publishing line and `CHANGELOG.md` (Added) were updated. |
| FR-016 | pass | `.claude-plugin/marketplace.json`, `plugins/claude/eligian/.claude-plugin/plugin.json` (version 1.1.0) and `.mcp.json` (`npx -y eligian@^1.1 mcp`). `claude plugin validate plugins/claude/eligian --strict` -> "✔ Validation passed" exit 0, and `claude plugin validate . --strict` -> "✔ Validation passed" exit 0. |
| FR-016a | pass | `ls -a plugins` shows only `claude`. No `.cursor-plugin`, `.codex-plugin` or `.agents`. `plugins.spec.ts:93` asserts it. |
| FR-017 | pass | No `.cursor-plugin`. `plugins.spec.ts:79-92` asserts the Cursor paths do not exist. |
| FR-018 | pass | No `.codex-plugin` or `.agents`. `plugins.spec.ts:80-91` asserts the Codex paths do not exist. |
| FR-019 | pass | `plugins.spec.ts:39-49`: the entry equals `serverEntry('claude', { form: 'npx', platform: ... })` on win32 and linux, command is not `node`, and the version equals the CLI's (1.1.0). |
| FR-020 | pass | The plugin holds only `.claude-plugin/plugin.json` and `.mcp.json` (`plugins.spec.ts:52-54`). |
| FR-020a | pass | `plugins.spec.ts` checks the file list, the marketplace keys and source resolution, the plugin name, and Cursor/Codex absence. It passes within 44/44. |
| FR-021 | pass | The README gives `/plugin marketplace add rolandzwaga/eligian` and `/plugin install eligian@eligian`, the launch form, the `.mcp.json` interaction, and the per-project route. `plugins.spec.ts:96-109` asserts these strings. |
| FR-022 | pass | `packages/cli/scripts/measure-recycle.ts` drives `startInMemoryServer` with `compilerLockLayer` hooks, the rotated tool mix, a sections = calls check, base/post/trig, a never row and a fmt-only run. Output in `baseline/recycle-measurements.txt` (rows never/25/50/100/200, 500 sections each). |
| FR-023 | pass | Growth for 25/50/100/200: 13.97/12.95/12.69/24.52 MB, median post/trig ≤ 1.04. "decision (FR-023): chosen N = 200 (largest of {25,50,100,200} with growth ≤ 25 MB and median post ≤ 3 and median trig ≤ 3)". `compiler-lock.ts:46`: `export const RECYCLE_AFTER = 200;`. |
| FR-024 | pass | The mixed soak case on the tour asserts sections = 2N, then recycles [N, 2N], then growth ≤ ceiling after a warm-up round. `gate-soak.txt:809`: "mcp-soak mixed: 400 calls; growth 6.36 MB; sections 400; recycles at [200,400]"; "Tests 2 passed", exit 0. |
| FR-025 | pass | fmt-only checkpoints 195.89/196.27/195.71/195.87/193.47 MB, "fmt metric: -0.604 MB per 100 calls", "verdict (FR-025): ≤ 1 MB per 100: no change". Neither `formatSource` nor `recycleCompilerServices` was changed. |
| FR-026 | pass | `recycleCompilerServices` runs `releaseWorkspaceDocuments` then `resetServices()` in process (`compiler-lock.ts:52-57`). No `process.exit`, `child_process` or `execPath` in `packages/cli/src/mcp` outside smoke's tool child. |
| FR-027 | pass | `pnpm typecheck` exit 0; `pnpm run ci` "Checked 883 files … No fixes applied."; `pnpm effect:check:cli` "0 errors, 0 warnings and 0 messages."; tests: language 3428, extension 792, cli 1427, test:bin 15 passed; coverage above thresholds (CLI 89.76/79.61/92.16/90.67, language 91.31/82.86/93.87/92.58). |
| FR-028 | pass | `git status --porcelain -- packages/language/src/eligian.langium` printed nothing. |
| FR-029 | partial | This file now exists, but the roadmap is deliberately not marked complete because the table is not fully green. `git status --short specs/058-mcp-server/roadmap.md` printed nothing. |
| SC-001 | partial | Examples gates are green: check "8 files, 0 errors, 0 warnings" plus demo "5 warnings", smoke "9 files, 11 timelines played, 0 errors, 0 warnings", fmt "All 12 files formatted". The "with the promoted validators active" clause is blocked (nothing promoted). |
| SC-002 | partial | User-run. `mcpName` and `server.json` are in place at 1.1.0, but no Publish CLI run has happened on main, so the registry entry cannot be queried. |
| SC-003 | partial | User-run eval phase-exit run not executed. No `evals.md`. The 16 existing runs do not qualify. |
| SC-004 | pass | `mcp-registry.spec.ts` + `plugins.spec.ts`: "Test Files 2 passed (2) Tests 20 passed (20)", including the handshake with `packageArguments` and the negative control. |
| SC-005 | pass | mcp-publisher v1.8.7 windows_amd64: "mcp-publisher_windows_amd64.tar.gz: OK"; `mcp-publisher.exe validate` -> "✅ server.json is valid", exit 0. The workflow validates before Publish (:127-131). |
| SC-006 | pass | All six `publish-cli.yml` specs green (step order, pin + sha256, bounded retry, no secrets, release behind publish, `registry_only`). A reviewer read of the file confirmed each point with line numbers. |
| SC-007 | pass | Claude Code 2.1.302: both `claude plugin validate ... --strict` runs gave "✔ Validation passed", exit 0. The marketplace run printed one non-verdict Advice about the root README. |
| SC-008 | pass | `plugins.spec.ts` verbose: server entry on Windows/POSIX, CLI version, exact file list, marketplace keys, no Cursor/Codex, README strings. |
| SC-009 | partial | User-run: `claude plugin marketplace add` / `install` / `claude mcp list` not run (installing into the user's Claude Code config; 1.1.0 is also not on npm yet). Validation precondition holds. |
| SC-010 | partial | Blocked: awaiting Phase 3 evals. `pnpm evals:mcp:evidence` -> "16 runs scanned, 0 records", identical to the committed file. No `baseline/promotion-<code>-before.json`. |
| SC-011 | partial | Blocked: awaiting Phase 3 evals. REVIEW_CODES unchanged; no `'config'` source. |
| SC-012 | partial | Blocked: awaiting Phase 3 evals. `check-command.ts` is unmodified (T038/T039 blocked). |
| SC-013 | partial | Probe count unchanged: `mcp-runtime-claims.spec.ts` "Tests  28 passed (28)". The "Caught in the editor" assertion does not apply: `runtime-state-pitfalls.md` is unmodified (blocked). |
| SC-014 | pass | `recycle-measurements.txt`: 25: 13.97 MB; 50: 12.95; 100: 12.69; 200: 24.52 (post 1.03, trig 0.91); never 37.68 MB; "chosen N = 200"; `RECYCLE_AFTER = 200`. Margin to the 25 MB rule is thin (24.52). |
| SC-015 | pass | `test:soak`: "mcp-soak: 400 eligian_check calls; ... growth 9.97 MB; recycles at [200,400]" and "mcp-soak mixed: 400 calls; growth 6.31 MB; sections 400; recycles at [200,400]; wall 199.8 s", "Tests 2 passed (2)", exit 0. |
| SC-016 | pass | fmt-only 500 calls: "fmt metric: -0.604 MB per 100 calls", "verdict (FR-025): ≤ 1 MB per 100: no change". |
| SC-017 | pass | Own pack: `eligian-1.1.0.tgz`, packed `mcpName` "io.github.rolandzwaga/eligian"; `tar tzf \| grep -cE "server.json\|^package/(plugins\|.claude-plugin\|.cursor-plugin\|.agents)/"` -> 0. `package-bin.spec.ts` "Tests 15 passed (15)". Caveat: in a parallel run the 3 s test failed once ("expected 3733.8456000000006 to be less than 3000"); it is meant to run alone (`test:bin`). |
| SC-018 | pass | `pnpm build` exit 0; `pnpm typecheck` exit 0; `pnpm run ci` "Checked 883 files in 267ms. No fixes applied."; `pnpm test` exit 0; `pnpm effect:check` "0 errors, 0 warnings and 0 messages."; `pnpm test:coverage:ci` exit 0 (CLI 89.76 / 79.61 / 92.16 / 90.67, up from 89.5 / 79.16 / 91.78 / 90.45). |
| SC-019 | partial | Blocked: conditional on promoting `controller-imbalance`. No editor quick-fix spec. |
| SC-020 | pass | `promotion-evidence.md` has one row per REVIEW_CODE (9), columns (a)–(d) + promote, "Scanned runs" lists the 16, "Pinned runs: none pinned". The rule section says `lottie-web-not-installed` is never promoted and "no data" is not promoted. Regenerated: identical. |
| SC-021 | partial | Blocked: conditional on promoting `timeline-container-not-in-layout` ("rule not applied"). No SC-021 specs. Gates re-run: typecheck exit 0, `run ci` "No fixes applied.", `pnpm test` exit 0. |
| SC-typecheck | pass | `$ tsc -b tsconfig.build.json`, EXIT=0. |
| SC-ci-biome | pass | `$ biome ci --error-on-warnings .` / "Checked 883 files in 374ms. No fixes applied." EXIT=0. |
| SC-effect-check | pass | "Checked 259 files out of 259 files. 0 errors, 0 warnings and 0 messages." (language); "Checked 321 files out of 321 files. 0 errors, 0 warnings and 0 messages." (cli). |
| SC-coverage-thresholds | pass | `pnpm test:coverage:ci` EXIT=0. Language 91.31/82.86/93.87/92.58 and CLI 89.76/79.61/92.16/90.67, above thresholds. |
| SC-no-banned-imports | pass | The grep over the diff and the untracked files returned no lines. |
| SC-no-generated-edits | pass | Count of generated paths in the diff and untracked files: 0. |
| SC-mcp-no-stdout | pass | Matches only in `stdio.ts` (comment, the transport's captured write, and the redirect to stderr). |
| SC-new-deps-declared | pass | `packages/cli/package.json` adds only `mcpName` and a `measure:recycle` script. `pnpm-lock.yaml` is unchanged. |
| SC-files-list | pass | `files` is unchanged: `["bin/cli.js","dist/cli.mjs","dist/docs/**"]`. `server.json` and the plugin are not bundled. |

## Implementation notes (deviations reported by task agents)

- **N changed during the phase.** Early task notes (T018/T019) chose N = 100 under the FR-023 fallback, measured from a cold start. T020's mixed soak then failed the 25 MB ceiling: 28.46 MB over 200 calls, caused by a one-time warm-up of about 36.6 MB in the first round of 5 calls, not a leak. A later ruling (2026-11-06) added a warm-up round, and the final table gives N = 200 (`RECYCLE_AFTER = 200`, AGENTS.md and CHANGELOG at 200). The T018, T019 and T020 notes describing N = 100 and a blocked T020 are superseded by the final evidence above. The FR-024 and SC-015 wording on warm-up should be confirmed in spec.md by the human loop.
- T008: renamed the existing `packedPaths` to `files` instead of adding a second variable.
- T009: the task's checksum grep also matched the `.sbom.json` line, so the pattern was anchored. A mutation proof needed a temporary edit, which was reverted.
- T010: `ts_references` on `spawnServer` returned only the definition, so callers were checked with grep.
- T011: the default bash runs with `-e`, so a failing `mcp-publisher login` exits without retrying. Only a failing `publish` is retried (plan B5 as written).
- T013: Biome's organizeImports moved the new export between harness.js and transcript.js.
- T016: `measure-heap.ts` had three `heapAfterGc` call sites, not two; all were switched.
- T017: the default `--project` is resolved to `<repo>/examples/eligian-tour`; `--fmt-calls` must be a multiple of 100 and at least 200.
- T021: FR-025 verdict "no change", so no `resetFormatServices` code was added and the CHANGELOG formatter clause was left out.
- T022: `plugins.spec.ts` has 6 tests, not the 7 in tasks.md; plan.md lists 6.
- T024: the older `### Fixed` entry "Long MCP sessions" (CHANGELOG line 54) still says "every 100 compiler calls" and "200 `eligian_check` calls". It is stale and should be updated.
- T027: the soak gate was run with `AI_AGENT`, `CLAUDECODE` and `CLAUDE_CODE` unset and `NO_COLOR=1`, because vitest hides console output of passing tests under an agent session.
- T005/T031: the root README has no `/plugin install eligian --marketplace rolandzwaga/eligian` line. `claude plugin validate` gives this as advice only.
- Blocked tasks: T032–T043 (awaiting Phase 3 evals), T044 and T045 and T046 (user-run).

## Remaining steps for the human loop

1. Run Phase 3's full evals (`pnpm evals:mcp --arm A1 --arm A0 --runs 3`, plus the Opus run) and record the run ids in `specs/058-mcp-server/evals.md`. Then resume Group 10 with `retry_tasks` from T032.
2. Review the diff. Confirm the spec.md FR-024/SC-015 warm-up wording and update the stale CHANGELOG "Long MCP sessions" entry.
3. Commit (the workflow never commits), then merge to main and run *Publish CLI* for 1.1.0 (T044). After 1.1.0 is on npm, run the plugin install checks (T046) and the eval phase-exit run (T045).
4. Mark the roadmap phase complete only once the table is fully green.
