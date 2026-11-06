# Phase 4 — Editor registration, dev feedback, polish (phase-4-editor-dev-polish)

**Overall status: INCOMPLETE**

## Gap list (first)

| Item | Verdict | Gap |
|---|---|---|
| SC-001 | FAIL | The manual Windows VS Code exit step is unrecorded (steps, VS Code version, tool names). Automated half green (extension 792 passed). |
| SC-002 | PARTIAL | Manual step (setting off removes Eligian from MCP: List Servers) not recorded. |
| SC-003 | PARTIAL | Manual agent listings for (1) and (2) not recorded. |
| SC-004 | PARTIAL | (1) and (2) pass. (3) the real-browser timing (`updated` minus `performance.timeOrigin` <= 2 s) is not recorded. |
| SC-007 | PARTIAL | No manual Cursor check recorded, and no statement that Cursor was unavailable. |
| SC-014 | PARTIAL | All Windows gates green; the Linux half (ubuntu-latest CI on the PR) is not available. |
| T046 | BLOCKED | Group 15 manual checks need the user at real VS Code / Cursor / browser; not run by the build stage. Resume with `retry_tasks: ["T046"]` after the user supplies notes. |

Also: the SC-014.coverage-thresholds evidence ends "The aggregate gate is still red because of the flaky test in SC-014.test-coverage-ci", but SC-014.test-coverage-ci and FR-031 record `pnpm test:coverage:ci` COV_EXIT=0 after the race fix (`await server.idle()`, dev-server.spec.ts:1079). The statements come from different moments; the later run is green.

## Compliance table

| ID | Verdict | Evidence |
|---|---|---|
| FR-001 | pass | package.json contributes `mcpServerDefinitionProviders: [{ id: 'eligian.mcp', label: 'Eligian' }]`; server-definition-provider.ts:265 `vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, provider)`, chosen only when `cursorMcpApi()` is undefined (:368); main.ts pushes `registerEligianMcpServer(context)` into context.subscriptions. Tests mcp-provider.spec.ts:463; activate-client-failure.spec.ts 'registers the MCP provider even when the language server fails'. Extension suite: 65 files / 792 tests passed. |
| FR-002 | pass | server-definition-provider.ts:85-105 computeServerSpecs returns [] when `!vscode.workspace.isTrusted or workspaceLevelServer()` (:86); qualify checks enabled, folder mcp, `.vscode/mcp.json` and `readEligianInstall` (install-state.ts:64-76, version >= 1.1). Label 'Eligian' / `Eligian (${folder.name})`, args `[…/node_modules/eligian/bin/cli.js,'mcp']`, cwd = folder. Test mcp-provider.spec.ts:484 US1-1. |
| FR-003 | pass | watchFolder creates five non-recursive watchers per folder; listeners for `affectsConfiguration('eligian.mcp')` / `('mcp')`, onDidChangeWorkspaceFolders, onDidGrantWorkspaceTrust; `debounce(timers,'change',DEBOUNCE_MS,fire)` with DEBOUNCE_MS=500. Tests mcp-provider.spec.ts:754-938. Plan P3 (ancestor/extra watchers and follow-up check) goes beyond FR-003's fallback. |
| FR-004 | pass | install-state.ts:134-142 vscodeMcpJsonState via parseJsonc; hasEligianServer (:116-131) matches key `eligian` or stdio args cli.js/npx followed by 'mcp'; unparsable logs one line to the 'Eligian MCP' channel and proceeds. Tests SC-003 (1)/(3) mcp-provider.spec.ts:590,601. |
| FR-005 | pass | activationEvents = ["onLanguage:eligian","onMcpCollection:eligian.mcp","workspaceContains:node_modules/eligian/package.json","workspaceContains:**/*.eligian"]. Test mcp-provider.spec.ts:424. |
| FR-006 | pass | `eligian.mcp.enabled`: boolean, default true, scope resource, spec markdownDescription verbatim; read per folder (:54-56). Tests :441,556. |
| FR-007 | pass | `eligian.mcp.command`: string, default "node", machine-overridable; `restrictedConfigurations: ["eligian.mcp.command"]`; blank behaves as node (:44-47). Tests :455,574,581. |
| FR-008 | pass | promptTarget (:150-160) walks folders in order; `.eligian` file required for problem 'missing'; checkInstallPrompt (:292-313) once per activation, DISMISSED_KEY in workspaceState; Install runs in a terminal in the folder; Don't Ask Again calls workspaceState.update. Never from provideMcpServerDefinitions. Tests :986-1176. |
| FR-035 | pass | install-state.ts:163-176 findPackageManager walks ancestors; lockfiles before packageManager field; 'npm' at root. Test 'SC-021: Install runs in the folder with the ancestor manager' (:1176). |
| FR-036 | pass | install-state.ts:179-184 admitsMinimum; :206-213 installCommand picks PLAIN_INSTALL or ADD_ELIGIAN ('pnpm add -D eligian@^1.1', 'yarn add -D …', 'bun add -d …', 'npm install --save-dev eligian@^1.1'). semver bundled (esbuild.mjs:62 external only 'vscode'). |
| FR-009 | pass | args always `<folder>/node_modules/eligian/bin/cli.js`, 'mcp'; no npx or bundled path. Test :1344 'never falls back to npx or a bundled CLI'; `unzip -l eligian-1.0.0.vsix` grep for the CLI → no match, exit 1. |
| FR-010 | pass | cursorMcpApi() (:190-204) returns the API only when both `registerServer` and `unregisterServer` are functions; one cast. Test 'a partial Cursor API is ignored' (:1314). |
| FR-011 | pass | cursorBranch (:217-252): unregister all names, `api.registerServer({ name, server: { command, args, env: {} } })`; names 'eligian' / `eligian-${folder.name}`; dispose unregisters. Tests :1229-1328. Manual Cursor check is SC-007. |
| FR-012 | pass | :86 serves both branches; :294 prompt returns when untrusted; :362 trust grant fires change. untrustedWorkspaces.description extended. Tests :523, :923. |
| FR-034 | pass | workspaceLevelServer = hasEligianServer of the workspaceValue of `mcp.servers` (:65-69); globalValue never read. Tests :640,662,843. |
| FR-013 | pass | bundler/index.ts:413 `return { outputDir, files, stats, map: compileResult.map, config: compileResult.config };`. `capture-bundle-baseline.ts --diff` → "DEV_HOOK_SNIPPET: exported (178 chars), removed once per bundle / same examples/demo.eligian / same examples/eligian-tour/tour.eligian / same examples/libraries/nested/chain-test.eligian / 3 files, 0 differ", exit 0. |
| FR-014 | pass | dev-server.ts runtimeStatus: 403 foreign origin, 400 non-POST/oversized/malformed, 204 for stale buildId. MAX_BODY_BYTES = 64*1024. Tests 'status codes: 403 foreign origin, 400 malformed, 204 accepted', 'a stale buildId gets 204 and changes nothing'. |
| FR-015 | pass | DEV_HOOK_SNIPPET pushed in generateEntryPoint after createEngine and before init. Tests bundle-dev-hook.spec.ts:122,136,162. |
| FR-016 | pass | client-runtime.ts DEV_CLIENT_SCRIPT: engine error hook, console.error/warn wrappers calling through, window error / unhandledrejection, sendBeacon else fetch keepalive with guard, cap 50 plus one notice. dev-client.spec.ts passed (70 CLI files passed). |
| FR-017 | pass | describeReport uses locateEngineError; message from engineErrorText; `runtime error: ${message} at file:line:col` or ' (no source location)' plus ` (timeline ${uri} at ${position}s)`; PAGE_PREFIX for page kinds. Tests in dev-server.spec.ts. |
| FR-018 | pass | runtime-reports.ts DevErrorsFile with seven kinds; addError merges on mergeKey, cap MAX_ENTRIES=100; writeDevErrors temp+rename with retry; serialized `writes` promise; reset only on first/reload builds; failed build writes `build-error`. Tests 'bursts are serialized, atomic and capped at 100 entries', 'a rebuild resets the file; a failed build holds the build error'. |
| FR-019 | pass | dev-server.ts IGNORED regex now includes `.eligian`. Test 'writing .eligian/ triggers no rebuild'. |
| FR-033 | pass | adopt() only on first/reload builds; cssOnly branch keeps buildId, map, config. Tests describe 'eligian dev build identity'. See implementation notes on the CSS-only branch. |
| FR-037 | pass | ensureEligianDir: mkdir non-recursive; EEXIST leaves alone; fresh dir gets `.gitignore` containing `*`; root .gitignore untouched. Tests runtime-reports.spec.ts:202,208,217. |
| FR-038 | pass | accept(): print only for a new merge key, always count; adopt() clears `printed`. Test 'repeats print once and are counted'. |
| FR-039 | pass | console.warn wrapper posts `selector-miss` for SELECTOR_MISS (shared with smoke). Tests dev-client.spec.ts. |
| FR-040 | pass | selector-miss located via selectorLocation (moved to smoke/engine-error-format.ts). `pnpm run smoke:examples`: "9 files, 11 timelines played, 0 errors, 0 warnings" EXIT=0. |
| FR-020 | pass | packages/cli/src/main.ts unmodified; baseline/dev-log-diff.txt = "exit 0". Stray .css without a stylesheet now reloads (plan.md:495 option b). |
| FR-021 | pass | mcp/resources.ts registers one `eligian://docs/${id}` resource per index entry, mimeType text/markdown, lazy bodies. Tests mcp-resources.spec.ts:139,169,239,250. |
| FR-022 | pass | mcp-resources.spec.ts:188 unknown URI is a JSON-RPC error and server keeps answering; mcp-stdout.spec.ts `resources/read eligian://docs/nope` has `error` defined. |
| FR-023 | pass | server.ts writes `eligian mcp: no docs at <path>; resources disabled` to stderr when the index is missing; test :216. |
| FR-024 | pass | 'initialize advertises resources and prompts' (:261), 20 immediate initializes (:270); 'tools/list matches the Phase 3 snapshot'; tools/ and instructions.ts unmodified. |
| FR-025 | pass | prompts.ts registers `new-presentation` with `idea: Schema.NonEmptyString`, twelve numbered steps. Tests mcp-prompts.spec.ts:53,76,103,128. |
| FR-026 | pass | missing or empty idea gives code -32602 (test :158). |
| FR-027 | pass | packages/extension/README.md new '## Coding agents (MCP)' section, Configuration table, troubleshooting entry. |
| FR-028 | pass | packages/cli/README.md: vscode row/paragraph updated, '#### Resources and the prompt', `eligian dev` Runtime errors and `.eligian/dev-errors.json`. |
| FR-029 | pass | CHANGELOG.md Unreleased gains three entries; root AGENTS.md and packages/extension/AGENTS.md updated. |
| FR-030 | pass | verification-ladder.md §6 extended; card unchanged; 1201 words (`wc -w`), under 1,500. mcp-knowledge.spec.ts passes in the green CLI run. |
| FR-031 | pass | typecheck EXIT=0; ci "No fixes applied." EXIT=0; test EXIT=0; test:coverage:ci EXIT=0 (cli 1389 passed); effect:check "0 errors, 0 warnings and 0 messages." x2; check/smoke/fmt:examples EXIT=0; .vsix package EXIT=0. |
| FR-032 | pass | build-output.spec.ts asserts no `node_modules/eligian/`, `cli.mjs`, `bin/cli.js` in the vsce list; direct grep of `unzip -l eligian-1.0.0.vsix` → no match, 21 files. |
| SC-001 | **FAIL** | Automated half green (extension "Tests 792 passed (792)"). Manual Windows VS Code exit step unrecorded; spec.md:312 requires steps, VS Code version and tool names here. |
| SC-002 | **PARTIAL** | Automated toggle test green. Manual step (spec.md:313) not recorded. |
| SC-003 | **PARTIAL** | Provider halves (1)/(3) green. Manual agent listings for (1) and (2) (spec.md:314) not recorded. |
| SC-004 | **PARTIAL** | (1)/(2) pass: e2e race fixed at dev-server.spec.ts:1078-1079 (`await server.idle();`); isolated runs 5 of 5 "Tests 1 passed \| 27 skipped (28)"; full runs cli "Tests 1389 passed \| 32 skipped (1421)". (3) real-browser timing (spec.md:315) not recorded. |
| SC-005 | pass | version gate table (1.1.0 / 1.1.0-beta.1 / 1.2.3 / 2.0.0 give 1; 1.0.9 / 0.9.0 / no version / "abc" / no package.json / no bin/cli.js give 0), untrusted gives 0, trust grant fires once, two folders labelled 'Eligian (talk)','Eligian (deck)'. |
| SC-006 | pass | install prompt cases (1)-(8) all pass: pnpm/yarn/bun/npm commands run in the folder, Don't Ask Again persisted, suppression cases, one notification for two failing folders. |
| SC-007 | **PARTIAL** | Cursor-branch tests green (792 passed). Manual Cursor check (spec.md:318) not recorded and no statement that Cursor was unavailable. |
| SC-008 | pass | dev-server.spec.ts burst/cap/atomic, reset, stale buildId, no-rebuild on .eligian, status codes tests pass. |
| SC-009 | pass | dev-client.spec.ts runtime reports cases pass (12 files, "Tests 196 passed (196)"); pre-existing cases pass. |
| SC-010 | pass | `--diff` EXIT=0 "3 files, 0 differ"; bundle-dev-hook.spec.ts pass; smoke:examples 0 errors. Baselines live in specs/.../baseline/bundle-before/ (plan.md:65 P5 deviation). |
| SC-011 | pass | mcp-resources.spec.ts pass ("resources/list result: 34732 chars"); mcp-inspector `count 140 storyboard true addClass true` EXIT=0; CI step ci.yml:72-73. |
| SC-012 | pass | mcp-prompts.spec.ts pass; "new-presentation prompt text without the idea: 1634 chars". |
| SC-013 | pass | tools/list and INSTRUCTIONS snapshots match; tools/ and instructions.ts diff empty vs aa9fa55; mcp-stdout pass; "mcp initialize answered in 539 ms"; `pnpm run test:bin` "Tests 14 passed (14)". |
| SC-014 | **PARTIAL** | Windows gates green: typecheck EXIT=0; ci "Checked 875 files … No fixes applied."; test:coverage:ci language "91.31 \| 82.86 \| 93.87 \| 92.58", cli "89.5 \| 79.19 \| 91.78 \| 90.43"; effect:check 0/0/0; examples gates EXIT=0; "Packaged: …eligian-1.0.0.vsix (21 files, 5.09 MB)". Linux (ubuntu-latest PR CI) half not available. |
| SC-015 | pass | READMEs, CHANGELOG, verification-ladder.md contain the required text; mcp-knowledge.spec.ts passes. |
| SC-016 | pass | watcher/debounce tests pass ("watches five non-recursive patterns per folder", one event after 500 ms, coalescing). |
| SC-017 | pass | page kind prefixes pass; no-report log diff vs baseline `DIFF=0`; smoke.spec.ts unchanged and passing. |
| SC-018 | pass | manifest read: activationEvents, mcpServerDefinitionProviders, both settings, restrictedConfigurations, description; 4 manifest tests passing. |
| SC-019 | pass | build identity tests pass incl. (5) "a stray .css change reloads (not css) and mints a new buildId". |
| SC-020 | pass | cases (a)-(f) give 0 definitions; non-matches and user-profile/globalValue never read give 1. |
| SC-021 | pass | mcp-install-state.spec.ts:262-365 findPackageManager/installCommand cases pass; provider terminal test pass. |
| SC-022 | pass | self-ignoring .eligian/ tests pass in dev-server.spec.ts and runtime-reports.spec.ts. |
| SC-023 | pass | repeats print once and are counted; reload build prints again; CSS-only build keeps count. |
| SC-024 | pass | dev-client.spec.ts warnings / selector-miss / cap pass. |
| SC-025 | pass | console-warn unlocated; selector miss located like smoke; engine-error-format.spec.ts pass. |
| SC-014.typecheck | pass | `$ tsc -b tsconfig.build.json`, EXIT=0. |
| SC-014.ci | pass | `Checked 875 files in 251ms. No fixes applied.` EXIT=0. |
| SC-014.effect-check | pass | "Checked 259 files out of 259 files. 0 errors, 0 warnings and 0 messages." and "Checked 320 files out of 320 files. 0 errors, 0 warnings and 0 messages."; exit 0. |
| SC-014.test-coverage-ci | pass | COV_EXIT=0: shared-utils 105; language "Tests 3428 passed \| 23 skipped (3451)"; cli "Tests 1389 passed \| 32 skipped (1421)"; extension "Tests 792 passed (792)". |
| SC-014.coverage-thresholds | pass | Thresholds unchanged (`git diff aa9fa55 -- …vitest.config.ts` empty); measured above thresholds. Evidence text mentions a then-red aggregate gate from the flaky test; see note above. |
| FR-IMPORT-BAN | pass | regex search of diff, untracked files and packages returned 0 matches. |
| FR-NO-GENERATED-EDITS | pass | no generated files in status/diff/untracked. |
| SC-013.stdout-purity | pass | console/stdout matches only in stdio.ts:36-56,:82 (capture/reroute); new modules clean. |
| FR-CLI-DEPENDENCIES | pass | packages/cli/package.json diff empty; the only new runtime dependency is `semver: 7.8.5` in the extension, bundled (0 `require("semver")` in main.cjs). |
| FR-CLI-FILES-LIST | pass | `files` unchanged ["bin/cli.js","dist/cli.mjs","dist/docs/**"]. |
| T046 (Group 15) | **BLOCKED** | Manual checks not run (see gap list). |

## Implementation notes (deviations reported by task agents)

- T002: corpus is 3 programs, not 2; `examples/libraries/nested/chain-test.eligian` is included because the list is computed from the `smoke:examples` patterns.
- T004: JSON snapshot joined with a template literal rather than string concatenation (Biome useTemplate).
- T007: `engineErrorText` and its test use `located?.operation?.systemName` (the operation is an object).
- T008: only one `BundleResult` construction site (plan said 4).
- T009: test harness waits for jsdom's own DOMContentLoaded to avoid a double init.
- T011: parseRuntimeReport also rejects wrongly typed optional fields and an empty buildId; strings cut to 4,000 chars.
- T013: docIds/tools typed as `Object.values` unions rather than literal tuples (plan C3).
- T014: `vi.stubGlobal('EventSource', …)` kept instead of assigning `globalThis.EventSource`.
- T016/T017: plan B4's assumption that a stray `.css` without a stylesheet reaches the reload fallthrough was false, because `generateHTML` always emits a `<style>` element. Ruling applied (plan.md:495 option b): the CSS-only branch now swaps only when `css.trim() !== ''`, otherwise it reloads and mints a new identity. Side effect: a program whose own stylesheet becomes empty now reloads instead of getting an empty swap. The 'serves the bundle with the dev client' assertion was tightened to match the `data-build-id` attribute.
- T017: write queue starts after `listen`; `idle()` also awaits `writes`.
- T018: the gap found here (a page refreshed after a CSS-only build was not located) is fixed in the main loop on the user's ruling: `dev-server.ts` keeps the live builds since the last reload by `buildId`; `dev-server.spec.ts` (the CSS-only and reload identity cases) asserts a new served id after a CSS edit and the refreshed page's report located into the same entry (`count: 3`, `exact: true`). `vitest run dev-server / dev-client / runtime-reports`: "Test Files 3 passed (3)", "Tests 67 passed (67)".
- T019: client regex built from `SELECTOR_MISS.source` instead of a hand-copied literal; engine-error message uses a parenthesised fallback; file-level beforeEach/afterEach cleans listeners in dev-client.spec.ts.
- T020: `postRaw` does not exist; the existing `postRuntime` is used; waits for jsdom DOMContentLoaded.
- T022/T035: `mcp-knowledge.spec.ts > overlays > the ranking selection equals the script output` was reported failing mid-run (committed ranking has 'host-operation-in-block-without-select' where the script gave 'recursive_action_call'), independent of these tasks; the later full `pnpm test` and `test:coverage:ci` runs were green (cli 1389 passed).
- T023: unknown resource URI returns code -32002 (effect/ai legacy resource-not-found), not -32602 as plan P8 said; `resources/list` entries carry `annotations: {}`; with no docs `resources/list` answers `resources: []`. Plan P8 and T023 wording should say -32002.
- T024: package-bin run used `--reporter=verbose` so test names show.
- T025: the second tools/list block (packed tarball step) was left alone.
- T028: `Object.keys(servers).includes('eligian')` used (lib ES2020 has no `Object.hasOwn`); `installCommand` uses plain install if either dependencies or devDependencies admits 1.1+.
- T030: follow-up check does not fire if `provideMcpServerDefinitions` was never called; non-file folders get no watchers; extra dispose test.
- T031: module exports `installPromptSettled()` as the test handle; rejected checks are logged to the output channel.
- T033: mock uses a hoisted spy and disposable (stricter than the suggested `vi.fn`).
- T034: check verified by temporarily adding `!bin/cli.js` to `.vscodeignore` (failed as expected), then reverted.
- T037: relative link to the extension README omitted (npm-published README); the `@eligian:<uri>` mention syntax is the agent's reading of Claude Code docs, not verified against a running client.
- T041: examples gates compared against before-files with `\d+ms` normalised; all diffs empty.

## Remaining steps for the human loop

1. Run the Group 15 manual checks (T046) and send notes: SC-001 (VS Code version, the 8 tool names, install-after-open without reload, Running Extensions), SC-002, SC-003 (1)(2), SC-004 (3) (`dev-errors.json` `updated` and `performance.timeOrigin` values), SC-007 (Cursor cwd, or "Cursor not available"); then resume with `retry_tasks: ["T046"]`.
2. Confirm the ubuntu-latest CI run on the PR (SC-014 Linux half).
3. Rule on the T018 manual-refresh-after-CSS-only-build gap, if wanted.
4. Review the diff and commit (the workflow never commits).
