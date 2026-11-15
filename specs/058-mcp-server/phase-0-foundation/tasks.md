# Tasks: MCP server, Phase 0: Foundation

**Input**: `specs/058-mcp-server/phase-0-foundation/spec.md` (FR-001…FR-035, SC-001…SC-022, clarifications Q1–Q8) and `plan.md` (module design A–H, sequencing, test plan, gates). Roadmap: `specs/058-mcp-server/roadmap.md` §7 "Phase 0 — Foundation", §8 decisions 6 and 8.
**Branch**: `feat/mcp-server-roadmap`. Nothing in this list commits, pushes or opens a PR.

## How to read this list

- Tasks `T001…` are grouped into **ordered groups**. A group starts only when the previous group is done.
- **[P]** = parallel-safe inside its group: the task creates **new files only**, disjoint from every other [P] task of the group. Every task that edits an existing file (a `package.json`, `index.ts`, `esbuild.mjs`, a validator, a spec that another task also extends, a doc) is sequential, in the order written.
- Each task names: the files, the **failing test written first** (spec file, `describe`/`it` names, exact assertions), the implementation intent, and the **verify** command(s). Canonical order per task: failing test → implement → `pnpm check` (Biome, autofix) clean → the named tests pass; Effect code additionally `pnpm effect:check:<pkg>` → 0 errors / 0 warnings.
- Read `specs/TESTING_GUIDE.md` before writing any test (Constitution XXV). Language tests that validate documents use `createTestContext()` (`packages/language/src/__tests__/test-helpers.ts:337`), `getErrors()` (`:496`) and the `DiagnosticSeverity` enum (`:248`); no magic severity numbers.
- Paths: Windows backslash paths for every file tool (`F:\projects\eligius\eligian\...`); POSIX paths in Bash (`/f/projects/eligius/eligian/...`). Commands below run from the repo root in Bash.
- **Built-artifact precondition** (spec "Success criteria"): CLI tests resolve `@eligian/language` to `packages/language/dist/index.cjs`, and `package-bin.spec.ts` skips its bundle tests when `dist/cli.mjs` or `LICENSE` is absent (`package-bin.spec.ts:26`; `test.skipIf(!built)` at `:49`, `:70`). Every CLI verify step below is therefore preceded by `pnpm -C packages/language build && pnpm -C packages/cli build`, and its vitest summary must show **0 skipped** (except the FR-020a `mcp initialize` test).
- **Evidence**: raw outputs that the spec says go "in `compliance.md`" are saved by the task to `specs/058-mcp-server/phase-0-foundation/baseline/<name>.txt` (a new file per task, so [P] tasks never share a file). The workflow's comply stage quotes them into `compliance.md`.
- Shared Langium singleton: never run `checkFiles` calls concurrently (`check.ts:73-82` flips `Settings.selectorNotInLayout`; `:162-164`, `:223` add/release documents). Await each call before the next; no `Promise.all`.

Verified this session (typegraph / grep, tree at `1e2e750`): `checkFiles: (filePaths: readonly string[], options?: CheckOptions) => Effect<readonly CheckFileResult[], never, never>` (`ts_module_exports`, `check.ts:66`); `getCompilerVersion` has 2 references (`ts_references`: definition `pipeline.ts:371`, re-export `compiler/index.ts:103`); `smokeWindow` references `dom-environment.ts:19,36`, `smoke-runner.ts:28,81` (`ts_references`); `VERSION = '0.0.1'` (`compiler/index.ts:151`); `compilerVersion: '0.0.1'` (`ast-transformer.ts:325`); `readPackageVersion` (`cli/src/main.ts:42`, used `:51`, `:299`, `:352`); static `esbuild` imports `dev/host-module.ts:13`, `bundler/css-processor.ts:12`, `bundler/runtime-bundler.ts:13`; static `jsdom` import `smoke/dom-environment.ts:8`; `createParseError` / `createValidationError` / `createTypeError` / `createTransformError` / `createEmitError` exported from `errors/compiler-errors.ts:204,225,246,269,309` (`ts_module_exports`); `AssetError` tags `HtmlImportError` / `CssImportError` / `CssParseError` / `MediaImportError` / `LocalesImportError` (`errors/asset-errors.ts:48,69,83,108,129`); `OperationValidationError` code literals `UNKNOWN_OPERATION` / `PARAMETER_COUNT` / `PARAMETER_TYPE` / `MISSING_DEPENDENCY` / `CONTROL_FLOW` (`compiler/operations/validation/errors.ts:21,29,38,49,58`); `packages/cli/vitest.config.ts` has no coverage block; CLI `test:coverage:ci` = `vitest run` (`packages/cli/package.json`); language thresholds 79.8 / 80 / 69.9 / 79 (`packages/language/vitest.config.ts:74-79`); root `packageManager` `pnpm@12.14.0` (`package.json:50`) vs root `AGENTS.md` "currently 11.9".

---

## Group 1 — Build the pre-change tree

- [ ] **T001** Build everything before any change, so that the baselines of Groups 2 and 3 measure the real tree.
  - Files: none edited.
  - Run: `git status --short` (only `specs/058-mcp-server/phase-0-foundation/` may be untracked; no source change), then `pnpm install` (no lockfile change expected) and `pnpm build`.
  - Verify: exit 0; `ls packages/cli/dist/cli.mjs packages/cli/LICENSE packages/language/dist/index.cjs` lists all three. Save `git rev-parse HEAD` and the last 5 lines of the build output to `specs/058-mcp-server/phase-0-foundation/baseline/build-before.txt`.

---

## Group 2 — Pre-change baselines (no source edits)

All four tasks only read the source tree and create new files under `specs/058-mcp-server/phase-0-foundation/baseline/`.

- [ ] **T002** [P] Enumerate every code emittable today (FR-002, SC-003; plan "Enumeration rules").
  - Create `specs/058-mcp-server/phase-0-foundation/baseline/enumerate-codes.mjs` (plain Node ESM, no dependencies) and its output `baseline/emittable-codes-before.json`.
  - Scan `packages/language/src/**/*.ts` minus `generated/`, `__tests__/` and `*.spec.ts`. Rules, in order (plan "Enumeration rules" 1–6):
    1. Blank comments (`//…`, `/*…*/`) before matching, keeping string contents.
    2. (i-a) a `code: '…'` literal inside the info-object argument of an `accept(` call, including a nested `data: { code: '…' }` (e.g. `css/selector-validation.ts:31,46,59`, `css/selector-sources.ts:92`, `validators/operation-call/parameter-validator.ts:60`); Typir rule `accept({…})` sites count the same way → `kind: 'literal'`. (i-b) the `DataflowCode` union read verbatim from `dataflow/operation-dataflow.ts:76-79` (`'missing-dependency' | 'missing-action-dependency' | 'erased-property-access'`), sites `operation-dataflow.ts:398,445,476,506,531` → `kind: 'literal'`.
    3. (ii) `*_CODE = '…'` constants (`validators/expression-validator.ts:34-69`, `set-data-validator.ts:7`, `eligian-validator.ts:22`) → `kind: 'constant'`.
    4. (iii) the `code:` unions of `compiler/operations/validation/errors.ts` (`:21`, `:29`, `:38`, `:49`, `:58`), **lowercased** → `kind: 'lowercased'`. `compiler/operations/**` value literals are excluded from (i).
    5. (iv) the `code:` unions of `validators/validation-errors.ts:29-60` verbatim (`ABSOLUTE_PATH`, `INVALID_PATH_FORMAT`, `DUPLICATE_IMPORT_NAME`, `RESERVED_KEYWORD`, `OPERATION_NAME_CONFLICT`, `UNKNOWN_EXTENSION`, `AMBIGUOUS_EXTENSION`, `DUPLICATE_DEFAULT_IMPORT`) → `kind: 'pass-through'`.
    6. Exclude literals in `type`/`interface` declarations (e.g. `types/code-actions.ts:81`).
  - Output: a JSON array `[{ code, kind, sites: ['file:line', …] }]`, sorted by `code`, deterministic (no timestamps), `file` repo-relative with `/`. Every scanned literal that no rule admits goes to **stderr** with `file:line` and the reason. Investigate any "not in an `accept` info object" literal that is not one of the known cases before accepting the baseline.
  - Run: `node specs/058-mcp-server/phase-0-foundation/baseline/enumerate-codes.mjs > specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-before.json 2> specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-dropped.txt`
  - Verify: `node -e "const a=require('./specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-before.json');console.log(a.length, ['unknown_operation','parameter_count','parameter_type','control_flow','missing-dependency','ABSOLUTE_PATH','missing_labels_file','invalid_setdata_target'].every(c=>a.some(e=>e.code===c)), ['code','syntax-error','ERROR_CODE','en-US','MAPPING_ERROR','CONTROL_FLOW'].some(c=>a.some(e=>e.code===c)))"` prints `<count> true false`. Append `count: <n>` to `emittable-codes-dropped.txt`.

- [ ] **T003** [P] Snapshot every diagnostic before the change (SC-016).
  - Create `specs/058-mcp-server/phase-0-foundation/baseline/snapshot-diagnostics.ts` and its output `baseline/diagnostics-before.json`.
  - The script takes `before | after` and collects the SC-001 sets (a)+(b): every `.eligian` under `packages/language/src/__tests__/__fixtures__`, `packages/language/src/compiler/__tests__/__fixtures__`, `packages/cli/src/__tests__/__fixtures__` and `examples/`, **excluding** the `diagnostic-codes/`, `check-codes/` and `runtime-claims/` fixture directories that later tasks add (so before and after compare the same file set). It imports `checkFiles` from `packages/language/src/compiler/pipeline/check.ts` and runs `await Effect.runPromise(checkFiles([file]))` **one file at a time**. It writes every diagnostic **without** `code` as `{ file (repo-relative, '/'), severity, message, line, column, endLine, endColumn }`, sorted, 2-space JSON, no timestamps, to `baseline/diagnostics-<arg>.json`.
  - Run: `pnpm exec tsx specs/058-mcp-server/phase-0-foundation/baseline/snapshot-diagnostics.ts before`
  - Verify: valid JSON; two consecutive runs produce byte-identical files (`git diff --no-index` empty). Save the file count and diagnostic count to `baseline/diagnostics-before-summary.txt`.

- [ ] **T004** [P] Uncoded-`accept` scan, before (SC-002).
  - Copy the spec's Appendix A script (spec.md "Appendix A") to the scratch file `C:\Users\scab\AppData\Local\Temp\claude\6adf1a082b4b5525\36f8780e-961a-4331-8c14-5cdda6313511\scratchpad\scan.mjs` (not in the repo).
  - Run: `node <scratch>/scan.mjs . > specs/058-mcp-server/phase-0-foundation/baseline/uncoded-accepts-before.txt`
  - Verify: the last line reads `uncoded accept sites: 39`. If it differs, stop and record the difference in that file; the site lists of Groups 6–8 then need re-checking first.

- [ ] **T005** [P] Effect diagnostics of the test projects, before (plan gate 6a).
  - Run `pnpm exec effect-tsgo diagnostics --project packages/language/tsconfig.test.json --format text --strict` and the same with `packages/cli/tsconfig.test.json`; save both summaries to `specs/058-mcp-server/phase-0-foundation/baseline/effect-tests-before.txt`.
  - Verify: language test project `0 errors, 0 warnings`; CLI test project exactly one warning, `globalErrorInEffectFailure` at `packages/cli/src/__tests__/cli-low-fixes.spec.ts:256` (plan gate 6a). Any other finding is recorded in the file and becomes the allowed pre-existing set.

---

## Group 3 — Startup baseline and the CLI coverage gate (shared: `packages/cli/package.json`, `packages/cli/vitest.config.ts`)

Sequential. T006 must run with nothing else under load (SC-009 "no other test run in progress").

- [ ] **T006** Windows startup timing, before (SC-009).
  - Files: none edited. Run from the repo root, nothing else running:
    `node -e "const{spawnSync}=require('node:child_process');const t=[];for(let i=0;i<6;i++){const s=performance.now();spawnSync(process.execPath,['packages/cli/bin/cli.js','--version']);t.push(performance.now()-s)}t.shift();t.sort((a,b)=>a-b);console.log(t.map(Math.round).join(' '),'median',Math.round(t[2]))"`
  - Verify: output saved to `specs/058-mcp-server/phase-0-foundation/baseline/startup-before.txt` (the spec quotes 1,075–1,109 ms on 2026-11-04).

- [ ] **T007** CLI coverage baseline (FR-031, SC-013; plan Step 0(d), section G). These two config edits are the only changes before the baseline; no source changes.
  - Edit `packages/cli/package.json`: `"test:coverage:ci": "vitest run"` → `"vitest run --coverage"`.
  - Edit `packages/cli/vitest.config.ts`: add under `test` the block `coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/dev/client-runtime.ts'], reportsDirectory: './coverage' }`, **without thresholds**. Keep `testTimeout: 30000`.
  - If vitest in `packages/cli` cannot resolve `@vitest/coverage-v8` (root devDependency 5.0.5), run `pnpm add -D -F eligian @vitest/coverage-v8@5.0.5` and record that in the evidence file.
  - Run (the T001 build is current): `pnpm -C packages/cli test:coverage:ci 2>&1 | tee specs/058-mcp-server/phase-0-foundation/baseline/coverage-cli-before.txt`
  - Verify: exit 0; the "All files" row shows % Stmts / % Branch / % Funcs / % Lines; the skipped count equals that of a plain `pnpm -C packages/cli test` (bundle tests not skipped).

- [ ] **T008** Set the CLI thresholds to the measured baseline (FR-031).
  - Edit `packages/cli/vitest.config.ts`: add `thresholds: { lines, functions, branches, statements }` = the T007 "All files" values **floored to one decimal** (41.37 → 41.3).
  - Scratch check (not committed): create `packages/cli/src/__scratch_untested.ts` with ~30 lines of exported, never-imported functions; re-run `pnpm -C packages/cli test:coverage:ci`; the totals drop (an untested module counts as 0%); delete the file. Append both totals to `baseline/coverage-cli-before.txt`.
  - Verify: `pnpm -C packages/cli test:coverage:ci` exits 0 with the thresholds; `test -e packages/cli/src/__scratch_untested.ts` is false; `pnpm check` clean.

---

## Group 4 — The diagnostic code registry (shared: `packages/language/src/index.ts`)

- [ ] **T009** Registry module, its spec and the package-root export (FR-001, FR-001a, FR-002, FR-002a, SC-003, SC-019, SC-020; plan A1).
  - **Failing test first**: create `packages/language/src/__tests__/diagnostic-code-registry.spec.ts`, `describe('diagnostic code registry')`, importing from `'../validators/codes.js'`:
    - `it('entries have exactly code and source')`: for every entry of `DIAGNOSTIC_CODES`, `Object.keys(e).sort()` equals `['code', 'source']` and `source` ∈ `['parser', 'validator', 'type', 'linker', 'compiler']`.
    - `it('codes are unique')`: `new Set(DIAGNOSTIC_CODES.map(e => e.code)).size === DIAGNOSTIC_CODES.length`.
    - `it('sources of syntax-error, unresolved-reference, type-mismatch and the compile codes')`: table `syntax-error → parser`, `unresolved-reference → linker`, `type-mismatch → type`, `compile-parse-error` / `compile-validation-error` / `compile-type-error` / `compile-transform-error` / `compile-emit-error` / `file-unreadable` → `compiler`, `validation-exception → validator`.
    - `it('keeps every code emittable before Phase 0')`: read `specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-before.json` (resolved from the spec file, four directories up to the repo root); `entries.filter(e => !isDiagnosticCode(e.code))` equals `[]`.
    - `it('the registry is exactly the baseline plus the new codes')`: with a local `NEW_CODES` array (the list below), the registry code set equals `baselineCodes ∪ NEW_CODES`; on failure print both set differences.
    - `it('new codes are kebab-case')`: every registry code that is not in the baseline matches `/^[a-z]+(-[a-z]+)*$/`.
    - `it('non-emittable literals are not codes')`: `isDiagnosticCode` is false for `CONTROL_FLOW`, `UNKNOWN_OPERATION`, `PARAMETER_COUNT`, `PARAMETER_TYPE`, `MISSING_DEPENDENCY`, `MAPPING_ERROR`, `ERROR_CODE` and `unknown-operation`.
    - `it('every derivable code is registered')`: read the source text of `packages/language/src/compiler/operations/validation/errors.ts` and `packages/language/src/validators/validation-errors.ts`; extract the unions with `/code:\s*((?:'[^']+'\s*\|?\s*)+);/g` (first file lowercased, second verbatim); assert the set is non-empty and contains `unknown_operation`, `parameter_count`, `parameter_type`, `control_flow`; import the constants `RUNTIME_NEGATION_CODE` … `END_BLOCK_RUNTIME_CONST_CODE` (`validators/expression-validator.ts:34-69`), `INVALID_SET_DATA_TARGET_CODE` (`set-data-validator.ts:7`) and `MISSING_LABELS_FILE_CODE` (`eligian-validator.ts:22`); every value passes `isDiagnosticCode`.
    - `NEW_CODES` (plan A1 table): parser `syntax-error`; linker `unresolved-reference`; type `type-mismatch`, `constant-reserved-name`, `constant-cycle`, `if-condition-not-boolean`, `if-empty-then`, `for-collection-not-array`, `for-empty-body`, `event-start-negative`, `event-duration-relative`, `event-duration-not-positive`, `event-end-not-after-start`, `sequence-item-duration-not-positive`, `stagger-delay-not-positive`, `stagger-duration-not-positive`, `import-duplicate-default`, `asset-type-conflict`, `languages-duplicate-code`, `languages-missing-default`, `languages-multiple-defaults`, `timeline-empty`; validator `timeline-provider-invalid`, `timeline-source-required`, `timeline-source-unused`, `timeline-scroll-duration-required`, `timeline-scroll-selector-not-scroll`, `timeline-duration-relative`, `timeline-duration-not-positive`, `event-ends-after-timeline`, `break-outside-loop`, `continue-outside-loop`, `operation-in-timeline-event`, `unknown-action-in-timeline-event`, `html-import-error`, `css-import-error`, `css-parse-error`, `media-import-error`, `locales-import-error`, `locales-without-languages`, `locales-parse-failed`, `timeline-required`, `validation-exception`; compiler `compile-parse-error`, `compile-validation-error`, `compile-type-error`, `compile-transform-error`, `compile-emit-error`, `file-unreadable`.
    - Run `pnpm -C packages/language exec vitest run src/__tests__/diagnostic-code-registry.spec.ts` → fails (module missing).
  - **Implement** `packages/language/src/validators/codes.ts` (plan A1):
    - `export type DiagnosticSource = 'parser' | 'validator' | 'type' | 'linker' | 'compiler'`.
    - A module-private `SOURCES = { '<code>': '<source>', … } as const satisfies Record<string, DiagnosticSource>` holding every baseline code verbatim (source per FR-001a: lowercased operation codes, pass-through codes, constant-held and literal validator codes → `validator`; the dataflow codes → `validator`) plus `NEW_CODES` with the sources above.
    - `export type DiagnosticCode = keyof typeof SOURCES`; `export interface DiagnosticCodeEntry { readonly code: DiagnosticCode; readonly source: DiagnosticSource }`; `export const DIAGNOSTIC_CODES: readonly DiagnosticCodeEntry[]` (declaration order); `export function isDiagnosticCode(value: string): value is DiagnosticCode` (`Object.hasOwn(SOURCES, value)`); `export function diagnosticCode<const C extends DiagnosticCode>(code: C): C` (identity).
    - Compile-time derivation checks with **type-only** imports: `const _ops: readonly DiagnosticCode[] = [] as Lowercase<OperationValidationError['code']>[];` and the same for the code unions of `validators/validation-errors.ts`.
    - No entry carries any field besides `code` / `source`.
  - **Export** (FR-001a): add to `packages/language/src/index.ts`: `export { DIAGNOSTIC_CODES, diagnosticCode, isDiagnosticCode, type DiagnosticCode, type DiagnosticCodeEntry, type DiagnosticSource } from './validators/codes.js';`.
  - Verify: the spec passes; `pnpm typecheck` clean; `pnpm check` 0/0; `pnpm -C packages/language build`, then `node -e "console.log(require('./packages/language/dist/index.cjs').DIAGNOSTIC_CODES.length)"` prints a number > 0.

---

## Group 5 — Failing tests for coded diagnostics (new files only)

Both tasks write tests that fail now and that Groups 6–8 turn green. Each verify step records the expected failures.

- [ ] **T010** [P] Coded-diagnostics spec and fixtures (FR-003, FR-004, FR-004a, FR-005, FR-006, FR-008 file case, FR-009, SC-001, SC-017 language part).
  - Create `packages/language/src/__tests__/diagnostic-codes.spec.ts` and `packages/language/src/__tests__/__fixtures__/diagnostic-codes/*.eligian` (plus the `layout.html` / `.css` files the fixtures import).
  - Fixtures (set (c)), one per case, each yielding its exact code:
    - The 16 FR-003 sites: `timeline-validator.ts:64` `timeline-provider-invalid`, `:84` `timeline-source-required`, `:117` `timeline-scroll-duration-required`, `:120` `timeline-scroll-selector-not-scroll`, `:129` `timeline-duration-relative`, `:135` `timeline-duration-not-positive`, `:146` `event-ends-after-timeline`; `action-validator.ts:355` `break-outside-loop`, `:369` `continue-outside-loop`; `operation-call/operation-existence-validator.ts:80` `operation-in-timeline-event`, `:92` `unknown-action-in-timeline-event`; `program/asset-import-validator.ts:126` and `:131` (an asset error → its `ASSET_ERROR_CODES` code, e.g. a missing CSS file → `css-import-error`), `:255` `locales-without-languages`, `:319` `locales-parse-failed`; `program/structure-validator.ts:20` `timeline-required`. If no fixture reaches `asset-import-validator.ts:131` (plan R8), write `it.todo` for it here; T012 covers it with a unit test.
    - The two data-variable sites `label-parameter-validator.ts:206` and `set-data-validator.ts:52`, each with its existing code (taken from the baseline JSON).
    - One per Typir rule file: constant (`constant-reserved-name`), control-flow (`if-condition-not-boolean`), event (`event-start-negative`), import (`import-duplicate-default`: two `styles` imports), languages (`languages-missing-default`), timeline (`timeline-empty`).
    - A Typir core mismatch → `type-mismatch`; an undeclared label (`at nope.end..2s [ ] [ ]`) → `unresolved-reference`; a lexer error and a parser error → `syntax-error`.
    - `video-without-from.eligian` and `raf-with-from.eligian`.
  - Tests:
    - `describe('every checked diagnostic carries a registry code')` · `it('fixture corpora and examples: no uncoded, no unregistered code')`: SC-001 sets (a)+(b) (the T003 file list) plus set (c); `for (const f of files) results.push(...await Effect.runPromise(checkFiles([f])))`, **sequential**; every diagnostic has a `code` and `isDiagnosticCode(code)` (from `'../validators/codes.js'`) is true; offenders listed on failure.
    - `describe('coded fixtures')` · `it.each(CASES)('%s → %s')` with `CASES: [fixture, code, source][]`: some diagnostic of the fixture has exactly `code`, and `DIAGNOSTIC_CODES.find(e => e.code === code)!.source === source` (`type` for the Typir rules, `validator` for validator sites, `parser` / `linker` / `compiler` as listed in T009).
    - `it('a nonexistent path → file-unreadable')`: `checkFiles([path.resolve(dir, 'does-not-exist.eligian')])` → one diagnostic with code `file-unreadable`.
    - `it('video without from → exactly one diagnostic')`: `toHaveLength(1)`, code `timeline-source-required`.
    - `it('raf with from → exactly one warning, timeline-source-unused')`: `toHaveLength(1)`, severity warning, code `timeline-source-unused`.
    - `it('no Typir prefix in any set-(c) message')`: every message `not.toMatch(/^While validating /)`.
    - Compare file paths after `path.resolve`.
  - Verify (expected red): `pnpm -C packages/language exec vitest run src/__tests__/diagnostic-codes.spec.ts` fails on the uncoded cases; save the failing test names to `specs/058-mcp-server/phase-0-foundation/baseline/diagnostic-codes-red.txt`. `pnpm check` clean.

- [ ] **T011** [P] Document-validator unit spec (FR-004b, FR-005, FR-006, SC-016 unit part, SC-017).
  - Create `packages/language/src/__tests__/eligian-document-validator.spec.ts`. `createTestContext()` in `beforeAll`; parse with `ctx.parse(src)`, validate with `ctx.services.Eligian.validation.DocumentValidator.validateDocument(doc)`.
  - `describe('EligianDocumentValidator codes')`:
    - `it('parse error: code syntax-error, data.code parsing-error')`
    - `it('lexer error: syntax-error + lexing-error')`
    - `it('linking error: unresolved-reference, data kept')`: `code === 'unresolved-reference'`, `data.code === 'linking-error'`, and `data.containerType`, `data.property`, `data.refText` are defined.
    - `it('unknown operation name: no linking diagnostic')`: an unknown `OperationCall.operationName` yields no diagnostic with `data.code === 'linking-error'`.
    - `it('Typir rule and Typir core diagnostics lose the prefix; code, severity and range kept')`: one Eligian Typir rule input and one Typir-core input; message `not.toMatch(/^While validating /)`; code is the rule code / `type-mismatch`; range equals the range of the reported node+property (compute it with Langium's `getDiagnosticRange` for the same info).
  - `describe('stripTypirPrefix')` table test (import from `'../eligian-document-validator.js'`): an error prefix; a warning prefix (`this warning is found:`); a node text that itself contains `", this error is found: "`; sub-problems after the message kept; a non-matching message returned unchanged.
  - Verify (expected red): `pnpm -C packages/language exec vitest run src/__tests__/eligian-document-validator.spec.ts` fails (no `stripTypirPrefix` export, codes missing); save the failing names to `baseline/document-validator-red.txt`. `pnpm check` clean.

---

## Group 6 — Code every validator and Typir rule site (existing files; sequential)

- [ ] **T012** The 16 FR-003 sites (FR-003).
  - Failing tests: the 16 FR-003 cases of T010 (`pnpm -C packages/language exec vitest run src/__tests__/diagnostic-codes.spec.ts -t "coded fixtures"`).
  - Edit, adding `code: diagnosticCode('…')` (imported from `validators/codes.ts` with the right relative path) to the info object of each `accept`: `validators/timeline-validator.ts:64,84,117,120,129,135,146`; `validators/action-validator.ts:355,369`; `validators/operation-call/operation-existence-validator.ts:80,92`; `validators/program/asset-import-validator.ts:126,131` through a total `const ASSET_ERROR_CODES: Record<AssetError['_tag'], DiagnosticCode> = { HtmlImportError: 'html-import-error', CssImportError: 'css-import-error', CssParseError: 'css-parse-error', MediaImportError: 'media-import-error', LocalesImportError: 'locales-import-error' }` used as `code: ASSET_ERROR_CODES[error._tag]`, plus `:255` and `:319`; `validators/program/structure-validator.ts:20`. Codes per the T010 list. Messages, severities and ranges unchanged.
  - Plan R8: if T010 found no fixture for `asset-import-validator.ts:131`, add `packages/language/src/__tests__/asset-import-validator-codes.spec.ts`, which calls the validator with a stubbed `loadProgramAssets` result (an asset error whose path matches no import node) and asserts the code; replace T010's `it.todo` by a pointer comment; record the deviation in `baseline/deviations.txt`.
  - Verify: the 16 cases pass; `pnpm -C packages/language exec vitest run` is green apart from the T010/T011 cases that T013–T017 own; `pnpm check` 0/0.

- [ ] **T013** Typir rule codes and the duplicate source-file rule (FR-004, FR-004a).
  - Failing tests: the T010 cases `constant-reserved-name`, `if-condition-not-boolean`, `event-start-negative`, `import-duplicate-default`, `languages-missing-default`, `timeline-empty`, `video without from → exactly one diagnostic`, `raf with from → exactly one warning, timeline-source-unused`.
  - Edit `packages/language/src/type-system-typir/validation/*.ts`, adding `code: diagnosticCode('…')` to each accepted problem: constant `:62` `constant-reserved-name`, `:75` `constant-cycle`; control-flow `:79` `if-condition-not-boolean`, `:90` `if-empty-then`, `:138` `for-collection-not-array`, `:149` `for-empty-body`; event `:67` `event-start-negative`, `:78` `event-duration-relative`, `:85` `event-duration-not-positive`, `:101` `event-end-not-after-start`, `:132` `sequence-item-duration-not-positive`, `:162` `stagger-delay-not-positive`, `:172` `stagger-duration-not-positive`; import `:63` `import-duplicate-default`, `:106` `asset-type-conflict`; languages `:74` `languages-duplicate-code`, `:91` `languages-missing-default`, `:103` `languages-multiple-defaults`; timeline `:89` `timeline-empty`. No Typir rule site uses `type-mismatch`.
  - FR-004a: delete Rule 1 of `type-system-typir/validation/timeline-validation.ts` (the `requiresSource` / `hasSource` block, today `:64-82`). In `validators/timeline-validator.ts`, next to the `:84` check, add the warning branch `else if (!requiresSource && hasSource)`: severity `'warning'`, message `` `Timeline provider '${timeline.provider}' does not use a source file. Remove: from "${timeline.source}"` `` (the text Typir printed after its prefix; confirm it against `baseline/diagnostics-before.json` before writing), info `{ node: timeline, property: 'source', code: diagnosticCode('timeline-source-unused') }`.
  - Verify: those T010 cases pass; `pnpm -C packages/language exec vitest run src/compiler/__tests__` is green, including `document-errors.spec.ts:130`; `grep -n "requires a source file\|does not use a source file" packages/language/src/type-system-typir/validation/timeline-validation.ts` → 0 lines; `grep -rn "type-mismatch" packages/language/src/type-system-typir/validation` → 0 lines; `pnpm check` 0/0.

- [ ] **T014** Existing literal codes through the registry (FR-001 "validators reference codes through this registry"; plan A2 "Existing literal `code: '…'` values").
  - **Failing test first**: add to `packages/language/src/__tests__/diagnostic-code-registry.spec.ts` `it('validators use the registry, not string literals')`. Scope, derived at test time: `validators/**`, `eligian-validator.ts`, `type-system-typir/validation/**`, plus every file of a `kind: 'literal'` site in `baseline/emittable-codes-before.json`. Blank comments and strings; every value-position `code:` must be `diagnosticCode(`, an identifier, `error.code`, `diagnostic.code` or `…toLowerCase()`; offenders listed as `file:line`. Run → fails.
  - Implement: replace each literal `code: '…'` in scope with `code: diagnosticCode('…')` (same string), including `css/selector-validation.ts:31,46,59`, `css/selector-sources.ts:92`, `dataflow/operation-dataflow.ts:398,445,476,506,531` (the helper returns the literal type, so `DataflowCode` still type-checks) and `type-system-typir/validation/label-id-validation.ts`, plus any further file the baseline names. Constants: `MISSING_LABELS_FILE_CODE = diagnosticCode('missing_labels_file')` (`eligian-validator.ts:22`), `INVALID_SET_DATA_TARGET_CODE` (`set-data-validator.ts:7`), the six `*_CODE` of `expression-validator.ts:34-69`. Unchanged: the computed codes (`operation-existence-validator.ts:44`, `parameter-validator.ts:116,154`, `control-flow-pairing.ts:41` `.toLowerCase()`; `import-validator.ts:330,352` pass-through) and the data-variable sites (`label-parameter-validator.ts:206`, `set-data-validator.ts:52`). Name every converted file outside the plan's list in `baseline/deviations.txt`.
  - Verify: `pnpm -C packages/language exec vitest run src/__tests__/diagnostic-code-registry.spec.ts` green; `pnpm -C packages/language exec vitest run` — the code-action specs (`eligian-code-action-provider`, `css/*`, `labels/*`) unchanged and green; `pnpm typecheck` clean (the extension's `label-file-creator.ts` still compiles); `pnpm check` 0/0.

---

## Group 7 — Document validator and validation registry (existing files; sequential)

- [ ] **T015** `EligianDocumentValidator`: lexer/parser/linker codes, the Typir core code, the prefix strip (FR-004 core, FR-004b, FR-005, FR-006; plan A3).
  - Failing tests: all of T011 (the FR-007 test arrives with T016); the T010 cases `unresolved-reference`, `syntax-error`, `type-mismatch` and `no Typir prefix in any set-(c) message`.
  - Edit `packages/language/src/eligian-document-validator.ts` (class at `:13`, `processLinkingErrors` at `:21`):
    - Override `processLexingErrors` and `processParsingErrors`: call `super`, then set `diagnostics[i].code = diagnosticCode('syntax-error')` for each diagnostic `super` appended; `data.code` (`lexing-error` / `parsing-error`) stays.
    - `processLinkingErrors`: keep the `OperationCall.operationName` skip and the `node` / `property` / `index` info (no `range`, plan correction 3); add `code: diagnosticCode('unresolved-reference')` and `data: { code: DocumentValidator.LinkingError, containerType: container.$type, property, refText: reference.$refText }`.
    - Override `toDiagnostic(severity, message, info)`: when `isValidationProblem(info)` (from `'typir'`), return `super.toDiagnostic(severity, stripTypirPrefix(message, info), { ...info, code: info.code ?? diagnosticCode('type-mismatch') })`; otherwise unchanged.
    - Export `stripTypirPrefix(message: string, problem: { severity: string; message: string }): string`: when `message` starts with `While validating ` and contains `` `, this ${problem.severity} is found: ${problem.message}` ``, return the text from `problem.message` on (sub-problems kept); otherwise return `message`.
  - Verify: `pnpm -C packages/language exec vitest run src/__tests__/eligian-document-validator.spec.ts src/__tests__/diagnostic-codes.spec.ts` green except the FR-007 test (T016) and the compile / file cases (T017); the full language suite green; `pnpm check` 0/0.

- [ ] **T016** `validation-exception` through a `ValidationRegistry` subclass (FR-007; plan A4).
  - **Failing test first**: add to `packages/language/src/__tests__/eligian-document-validator.spec.ts` `it('a throwing check yields validation-exception')`: its own `createEligianServices(EmptyFileSystem)` (not the shared context); `services.Eligian.validation.ValidationRegistry.register({ Program: () => { throw new Error('boom'); } })`; `vi.spyOn(console, 'error').mockImplementation(() => {})`; parse and `validateDocument`; the diagnostic whose message starts with `An error occurred during validation: boom` has `code === 'validation-exception'`, and `DIAGNOSTIC_CODES.find(e => e.code === 'validation-exception')!.source === 'validator'`. Restore the spy. Run → fails.
  - Implement: new `packages/language/src/eligian-validation-registry.ts`: `export class EligianValidationRegistry extends ValidationRegistry`, overriding `protected handleException(functionality, messageContext, accept, node): Promise<void>` to call `super.handleException(functionality, messageContext, (severity, message, info) => accept(severity, message, { ...info, code: diagnosticCode('validation-exception') }), node)`. Wire it in `packages/language/src/eligian-module.ts` (the `validation:` block at `:47`): `ValidationRegistry: services => new EligianValidationRegistry(services)`.
  - Verify: the spec passes; the full language suite green; `pnpm check` 0/0.

---

## Group 8 — `checkFiles` codes (existing files; sequential)

- [ ] **T017** `compileErrorCode`, `file-unreadable`, a required `code` (FR-008, FR-009; plan A5).
  - **Failing test first**: extend `packages/language/src/compiler/__tests__/check-files.spec.ts` (existing `describe('checkFiles')`, `:13`) with `describe('compileErrorCode')`: `it.each(TAGS)('%s → its code')` over errors built with `createParseError`, `createValidationError`, `createTypeError`, `createTransformError`, `createEmitError` → `compile-parse-error`, `compile-validation-error`, `compile-type-error`, `compile-transform-error`, `compile-emit-error`; `it('5 distinct codes')`; `it('kind does not change the code')` (two `ValidationErrorKind`s and two `TransformErrorKind`s give the same code per `_tag`); every code passes `isDiagnosticCode`. Run → fails.
  - Implement in `packages/language/src/compiler/pipeline/check.ts`:
    - `export function compileErrorCode(error: Pick<CompileError, '_tag'>): DiagnosticCode`, backed by a total `Record<CompileError['_tag'], DiagnosticCode>` (5 entries; `CompileError` from `pipeline.ts:166`).
    - Drop the `Effect.map(error => error as …)` cast after `Effect.flip(compile(…))` (`:89-91`), so the `CompileError` reaches `compileDiagnostic`.
    - `compileDiagnostic(file, error: Pick<CompileError, '_tag' | 'message'> & { readonly location?: CompileLocation })` (`:107`): body unchanged plus `code: compileErrorCode(error)`.
    - The `Cannot read file` diagnostic (`:150-160`) gets `code: diagnosticCode('file-unreadable')`.
    - `CheckDiagnostic.code` (`:40`) becomes `readonly code: string`.
    - Rename the local `diagnosticCode(diagnostic)` (`:233-236`) to `codeOf`, returning `string`, `'uncoded'` when neither `code` nor `data.code` exists.
    - Fix every construction site `tsc` reports (the CLI ones already set codes: `cli/src/check/check-command.ts:162`, `cli/src/check/lint.ts:29`).
  - Verify: `pnpm -C packages/language exec vitest run src/compiler/__tests__/check-files.spec.ts src/__tests__/diagnostic-codes.spec.ts src/__tests__/eligian-document-validator.spec.ts src/__tests__/diagnostic-code-registry.spec.ts` all green, 0 skipped / todo; `pnpm typecheck` clean; `pnpm effect:check:language` → 0 errors / 0 warnings (`check.ts` is Effect code); `pnpm check` 0/0.

- [ ] **T018** After-scans for the codes work (SC-002, SC-016 snapshot).
  - New evidence files only, but it runs after T017.
  - Run `node <scratch>/scan.mjs . > specs/058-mcp-server/phase-0-foundation/baseline/uncoded-accepts-after.txt` → exactly 2 site lines (`label-parameter-validator.ts`, `set-data-validator.ts`) and `uncoded accept sites: 2`.
  - Run `pnpm exec tsx specs/058-mcp-server/phase-0-foundation/baseline/snapshot-diagnostics.ts after`, then `git diff --no-index specs/058-mcp-server/phase-0-foundation/baseline/diagnostics-before.json specs/058-mcp-server/phase-0-foundation/baseline/diagnostics-after.json > specs/058-mcp-server/phase-0-foundation/baseline/diagnostics-diff.txt`.
  - Verify: every diff line is either a stripped `While validating the AstNode … is found: ` prefix (same position, message suffix unchanged) or the removed duplicate video-`from` diagnostic (FR-004a/b). Any other line is a defect: fix the code, never the snapshot, and re-run. A Typir double report that surfaces (plan R9) goes into `baseline/deviations.txt`.

---

## Group 9 — Versions injected at build time (sequential)

- [ ] **T019** Version module in the language package (FR-013, FR-014, FR-015, SC-007a).
  - **Failing test first**: new `packages/language/src/compiler/__tests__/version.spec.ts`, `it('reports the development version without define')`: `getCompilerVersion()` (from `'../pipeline.js'`) equals `{ compiler: DEVELOPMENT_VERSION, eligius: DEVELOPMENT_VERSION }`, and `VERSION` (from `'../index.js'`) equals `DEVELOPMENT_VERSION` (from `'../version.js'`). Run → fails (module missing).
  - Implement: new `packages/language/src/compiler/version.ts` as in plan C1: `declare const __ELIGIAN_VERSION__: string | undefined;` and `declare const __ELIGIUS_VERSION__: string | undefined;`; `export const DEVELOPMENT_VERSION = '0.0.0-development'`; `export const ELIGIAN_VERSION: string = typeof __ELIGIAN_VERSION__ === 'string' ? __ELIGIAN_VERSION__ : DEVELOPMENT_VERSION;` and likewise `ELIGIUS_VERSION`. Use it at `compiler/pipeline.ts:371-374` (`{ compiler: ELIGIAN_VERSION, eligius: ELIGIUS_VERSION }`), `compiler/index.ts:151` (`export const VERSION: string = ELIGIAN_VERSION`) and `compiler/ast-transformer.ts:325` (`compilerVersion: ELIGIAN_VERSION`).
  - Verify: the spec passes; `grep -nE "'0\.0\.1'|'1\.1\.4'" packages/language/src/compiler/pipeline.ts packages/language/src/compiler/index.ts packages/language/src/compiler/ast-transformer.ts` → 0 lines; `pnpm -C packages/language exec vitest run` green; `pnpm effect:check:language` 0/0 (`pipeline.ts` is Effect code); `pnpm check` 0/0.

- [ ] **T020** `define` in the CLI build, `--version` from it (FR-013, FR-016, SC-007).
  - **Failing tests first** in `packages/cli/src/__tests__/package-bin.spec.ts`:
    - `test.skipIf(!built)('--version prints the package version')`: the trimmed stdout of `spawnSync(process.execPath, [resolve(packageRoot, 'bin', 'cli.js'), '--version'], { encoding: 'utf-8' })` equals `pkg.version` (the spec's parsed `package.json`).
    - `test.skipIf(!built)('the bundle carries the injected versions')`: `readFileSync(bundlePath, 'utf-8')` does `not.toContain('__ELIGIAN_VERSION__')`, `not.toContain('__ELIGIUS_VERSION__')`, `toContain(JSON.stringify(pkg.version))` and `toContain(JSON.stringify(eligiusVersion))`, with `eligiusVersion` read from `createRequire(resolve(packageRoot, 'package.json')).resolve('eligius/package.json')`. No version literal in the test.
    - Run after `pnpm -C packages/language build && pnpm -C packages/cli build` → the second test fails.
  - Implement:
    - `packages/cli/esbuild.mjs`: `import { createRequire } from 'node:module'`; `const eligiusVersion = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('eligius/package.json'), 'utf-8')).version;` (a resolution failure throws and fails the build; no fallback); add `define: { __ELIGIAN_VERSION__: JSON.stringify(pkg.version), __ELIGIUS_VERSION__: JSON.stringify(eligiusVersion) }` to the `esbuild.context({...})` options (`pkg` is read at `:24`). `external` and `WORKSPACE_SOURCES` unchanged.
    - `packages/cli/src/main.ts`: remove `readPackageVersion`, `packageVersion`, `packagePath`, `__dirname` and the now-unused `node:url` import (`:11`, `:35-51`; `fs` stays, used at `:223,231`); `import { getCompilerVersion } from '@eligian/language'`; `const version = getCompilerVersion().compiler;`, used at `.version(…)` (`:299`) and in `runCheck({ …, version })` (`:352`). The output stays a bare version (`cli.spec.ts:221-226`).
  - Verify: rebuild the CLI; `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts src/__tests__/cli.spec.ts` green, 0 skipped; `grep -n readPackageVersion packages/cli/src/main.ts` → 0 lines; `pnpm effect:check:cli` 0/0; `pnpm check` 0/0.

---

## Group 10 — Lazy `jsdom` / `esbuild` and startup measurements (shared: `package-bin.spec.ts`, smoke/bundler sources; sequential)

- [ ] **T021** Dynamic imports of `jsdom` and `esbuild` (FR-017, FR-018, FR-019, FR-021, SC-008).
  - **Failing test first** in `package-bin.spec.ts`: `test.skipIf(!built)('no static import of jsdom, esbuild or effect/ai')`: on the bundle text, `/(?:^|[;\n])\s*import\s*[^;'"(]*?from\s*["'](jsdom|esbuild|effect\/ai)(\/[^"']*)?["']/g` and `/(?:^|[;\n])\s*import\s*["'](jsdom|esbuild|effect\/ai)(\/[^"']*)?["']/g` each match 0 times (print the matches on failure); `/\bimport\(\s*["']jsdom["']\s*\)/` and `/\bimport\(\s*["']esbuild["']\s*\)/` each match at least once. Run after a CLI build → fails (4 static matches).
  - Implement (plan D):
    - `packages/cli/src/smoke/dom-environment.ts`: `import type { JSDOM } from 'jsdom'` replaces the static import (`:8`); a module-level memoised promise; `export function smokeWindow(): Promise<Window & typeof globalThis>` returns `dom ??= import('jsdom').then(({ JSDOM, VirtualConsole }) => …same body…)`; `loadEligius()` (`:35`) becomes `async`: `await smokeWindow(); eligius ??= import('eligius'); return eligius;`.
    - `packages/cli/src/smoke/smoke-runner.ts:81`: `const window = await smokeWindow();`.
    - `packages/cli/src/dev/host-module.ts:13,29`: `import type * as esbuild from 'esbuild'` where types are needed; inside `loadHostModule`, `const esbuild = await import('esbuild')`.
    - `packages/cli/src/bundler/css-processor.ts:12,34`: the same inside `minifyCSS`.
    - `packages/cli/src/bundler/runtime-bundler.ts:13,298`: `import type * as esbuild from 'esbuild'`; the `Effect.tryPromise` `try` becomes `async () => (await import('esbuild')).build({...})`; the existing `catch` (`:324`, `esbuild.BuildFailure` as a type) still maps failures to `RuntimeBundleError`.
    - `eligius/lint` stays static (FR-021). No new stdout output on any path.
  - Verify: `pnpm -C packages/cli build`; `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts` green, 0 skipped; then `pnpm -C packages/cli build:prod` and the same vitest command (minified bundle) green; then `pnpm -C packages/cli build` again. Save both summaries to `specs/058-mcp-server/phase-0-foundation/baseline/lazy-imports-after.txt`. Behaviour unchanged (SC-010): `pnpm -C packages/cli exec vitest run src/__tests__/smoke.spec.ts src/__tests__/dev-server.spec.ts src/__tests__/dev-client.spec.ts src/__tests__/host-module.spec.ts src/__tests__/bundler src/__tests__/cli.spec.ts` green with the skipped count unchanged. `pnpm effect:check:cli` 0/0 (`runtime-bundler.ts` is Effect code); `pnpm check` 0/0.

- [ ] **T022** Startup timing and the skip-guarded `mcp initialize` test (FR-020, FR-020a, SC-009 Linux, SC-018).
  - Tests (the deliverable; they pass when written) in `package-bin.spec.ts`:
    - `test.skipIf(!built)('--version starts in under 3 s (median of 5)', { timeout: 60_000 })`: one uncounted warm-up, then 5 sequential `spawnSync(process.execPath, [bin, '--version'])` (no `shell`) timed with `performance.now()`; `console.info` prints the 5 values and the median; `expect(median).toBeLessThan(3000)`.
    - `test.skipIf(!built || !hasMcp)('mcp answers initialize in under 3 s', { timeout: 20_000 })`, with `hasMcp = built && /^\s+mcp\b/m.test(execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf-8' }))` (derived from the CLI, no flag): `spawn(process.execPath, [bin, 'mcp'])`; write `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"package-bin.spec","version":"0"}}}\n` to stdin; read stdout lines until one parses with `id === 1` and a `result`; elapsed < 3000 ms; kill the child in `finally`.
  - Scratch check (SC-018, not committed): add a stub `mcp` command to `packages/cli/src/main.ts` that reads one stdin line and writes `{"jsonrpc":"2.0","id":1,"result":{}}`; rebuild; the initialize test runs and passes; revert the stub (`git diff packages/cli/src/main.ts` shows only T020's change) and rebuild.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts` → all pass, exactly 1 skipped (the initialize test); the printed timings and the stub run's summary saved to `baseline/startup-after.txt`; `pnpm check` 0/0.

---

## Group 11 — CLI-level tests on the built CLI (new files only)

Precondition for both: `pnpm -C packages/language build && pnpm -C packages/cli build`.

- [ ] **T023** [P] `check-codes.spec.ts` (SC-004, SC-017 CLI part, SC-019 CLI part).
  - Create `packages/cli/src/__tests__/check-codes.spec.ts` and `packages/cli/src/__tests__/__fixtures__/check-codes/{duplicate-styles,video-without-from,unknown-label,stray-token}.eligian` with `a.css`, `b.css`.
  - `describe('eligian check --format json codes')`; each test runs `execFileSync(process.execPath, [bin, 'check', f, '--format', 'json'])` (catch the non-zero exit, read `error.stdout`) and parses the JSON:
    - `it('duplicate styles → import-duplicate-default')`
    - `it('video without from → one coded diagnostic, no Typir prefix')`: exactly 1 diagnostic, code `timeline-source-required`, no message starting with `While validating the AstNode`.
    - `it('undeclared label → unresolved-reference')` (`at nope.end..2s [ ] [ ]`)
    - `it('stray token → syntax-error')`
    - `it('every printed code is a registry code, compile-failed or eligius-*')`, over all four outputs.
    - `it('@eligian/language exposes the registry')`: `import { DIAGNOSTIC_CODES, isDiagnosticCode } from '@eligian/language'` (resolves to `dist/index.cjs`); `DIAGNOSTIC_CODES.length > 0`.
  - The implementation is already in the build, so show the test can fail: change one expected code, run, see it fail, restore.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/check-codes.spec.ts` green, 0 skipped; one manual `node packages/cli/bin/cli.js check <fixture> --format json` per fixture saved to `baseline/check-codes-manual.txt`; `pnpm check` 0/0.

- [ ] **T024** [P] Runtime-claims spec and probe host (FR-010, FR-010a, FR-012, SC-005, SC-022; plan B1, B2).
  - Create `packages/cli/src/__tests__/__fixtures__/runtime-claims/probe-host.ts` (plan B1: `export const operations = { recordBag(operationData), returnUndefined() }`, the log on `globalThis.__eligianProbe`, `recordBag` returns the bag unchanged), `layout.html` (ids `#a`, `#b`, `#stage`, `#btn`) and `styles.css`; and `packages/cli/src/__tests__/mcp-runtime-claims.spec.ts`, a file of its own (FR-012), importing eligius only from `'eligius'`.
  - Every probe declares `layout "./layout.html"`, `styles "./styles.css"` and `extensions "./probe-host.ts" { operation recordBag(label: string, value) operation returnUndefined() }` (plan correction 1: `HostOperation` needs parentheses, `eligian.langium:171-172`; `value` untyped, `:181-182`); every `recordBag` call passes both arguments.
  - Harness (plan B2): a module-level `const CLAIMS = [ …15 titles… ] as const`; `compileProbe(source)` = `Effect.runPromise(compileWithMap(source, { sourceUri: <file URI of path.join(FIXTURES, 'probe.eligian')> }))`, with `host.path` resolved as `compile-file.ts:333-336` does and `map.source` set as `compile-file.ts:342` does; `startEngine(compiled)` as `smoke-runner.ts:80-118`: `await loadEligius()`, `await smokeWindow()`, `await loadHostModule(host)`, `const { engine } = new EngineFactory(new EligiusResourceImporter(registrations), window, { input: { playToggle: false, resize: false } }).createEngine({ ...config, containerSelector: '#probe-root', cssFiles: [] })`; `recorded()` reads the log, reset in `beforeEach`; `bagKeys(e)` = `e.keys` minus `label` and `value`; every test ends with `await engine.destroy()` in `finally`.
  - `describe('Eligius runtime claims (installed eligius)')` · `test(CLAIMS[i], …)` ×15, each with the plan B2 driver and observable:
    - via `smokeConfig(config, map, { host })`: 1 start/end independence, 2 called-action copy, 6 `loopLength` (`value === 2` over a 3-item array), 7 returning `undefined` (`bagKeys === []`), 11 plain call runs start only;
    - hand-driven `init` / `seek` / `switchTimeline`: 3 seek reconcile (precondition `A-start` recorded; then `A-end` before `B-start`), 4 forward skip, 5 controller survival (two probes, with and without `removeControllerFromElement` in `on leave`; `MouseEvent('click', { bubbles: true })`), 8 lifecycle blocks start empty, 9 event actions start with `eventArgs` (exactly `['eventArgs']`), 10 listener actions (click → `eventTarget`; `KeyboardEvent('keydown', { key: 'ArrowRight' })` → `eventTarget` and `eventKey`), 12 switch runs `on leave` (precondition `on enter` recorded), 14 switch to the current timeline is a no-op (precondition `on enter` recorded; then `switchTimeline(engine.currentTimelineUri)` and `seek(0)` add no `on leave` / `on enter`);
    - **fake timers** (FR-010a): 13 no `on leave` at content end (`engine.on('timelineComplete', …)` registered before `start()`, `vi.advanceTimersByTimeAsync(1500)` on a 1 s raf timeline, `completed === true` or `engine.position >= engine.duration`, no `on leave`) and 15 the first tick starts the first timeline (no `on enter` after `init()`; present after `start()` and one frame). Order: window and eligius first, `init()` under real timers, then `vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })`, re-point `window.requestAnimationFrame` / `cancelAnimationFrame` to the globals, stub `document.timeline` to `undefined` if jsdom provides it (risk R4); `vi.useRealTimers()` and the window's originals restored in `finally`. No other test uses fake timers.
  - `test('ELIGIUS_EXECUTION_MODEL.md states every probed claim')`: reads `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` and asserts that every `CLAIMS` title occurs verbatim (15 of 15). **Red until T025.**
  - Where a probe disagrees with the document, the assertion follows the observed engine behaviour, and the disagreement (claim, document sentence, observed behaviour) goes to `baseline/runtime-claims-disagreements.txt`; T025 fixes the document (FR-011).
  - Mutation checks (not committed): claim 14 with the switch replaced by `switchTimeline(B)` and back to A fails; claim 15 with its expectation reversed fails (SC-022). Record both in `baseline/runtime-claims-mutations.txt`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-runtime-claims.spec.ts` → 15 passed, 1 failed (the document test), 0 skipped; `pnpm exec effect-tsgo diagnostics --project packages/cli/tsconfig.test.json --format text --strict` shows nothing beyond the T005 set; `pnpm check` 0/0.

---

## Group 12 — The execution-model document (existing file)

- [ ] **T025** `ELIGIUS_EXECUTION_MODEL.md` corrected and annotated (FR-011, FR-011a, SC-005, SC-006).
  - Failing test: T024's `ELIGIUS_EXECUTION_MODEL.md states every probed claim`.
  - Edit `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md`: line 1 → `# Eligius execution model — only claims marked "probed:" are verified against the installed eligius (mcp-runtime-claims.spec.ts)`; each of the 15 claims ends with `(probed: "<exact CLAIMS title>")`; add claims 6 (`@@loopLength` is length − 1) and 7 (an operation returning `undefined` hands the next one an empty bag), which the document does not state today; correct every sentence listed in `baseline/runtime-claims-disagreements.txt` (the document changes, the probe does not); every other runtime sentence ends with `(not probed, Phase 0)`.
  - Write the FR-011a table (line, sentence, `probed: <title>` or `not probed (Phase 0)`) to `baseline/execution-model-claims.txt`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-runtime-claims.spec.ts` → **16 passed, 0 skipped**; `grep -c '(not probed, Phase 0)' examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` equals the number of `not probed` rows; `head -1` of the document no longer reads `verified from source` alone.

---

## Group 13 — Documentation corrections (existing files; sequential)

- [ ] **T026** `LANGUAGE_SPEC.md` §11.2, §11.3 and a new §11.4 (FR-022, FR-023, FR-028, FR-029, SC-011).
  - Procedure per snippet (plan E): write it to a scratch directory with `layout.html` and `styles.css`; `node packages/cli/bin/cli.js check <f>` exits 0; `node packages/cli/bin/cli.js compile <f> -o <f>.json`; normalise with a scratch script (every `id` value → `"<id>"`, then every string equal to an original id → `"<id>"`); paste the normalised JSON and name the subtree path next to the block (e.g. `timelines[0].timelineActions[0]`).
  - §11.2 "Output Format" (`LANGUAGE_SPEC.md:2747`): the real shape: `startOperations: [{ id, systemName, operationData }]`, `timelines[].timelineActions`, seconds, the `requestAction` / `startAction` pair for an action call; ids labelled as random per compile.
  - §11.3 "Syntactic Sugar Transformations" (`:2798`): each row's emitted operations, checked by compiling the row.
  - New §11.4 "Erased parameters" after §11.3: the save/restore through `setOperationData` / `__eligian_param_<name>` when the block uses the parameter again (`compiler/transformers/erased-parameters.ts`), with a compiled probe.
  - Verify: each snippet exits 0 under `check`; each JSON block equals the normalised `compile` output at its named path (0 differences); commands and outputs saved to `baseline/language-spec-11.txt`.

- [ ] **T027** `LANGUAGE_SPEC.md` §4.2, §5.9, §8.1.1, §12.1 (FR-024, FR-025, FR-026, FR-027, FR-029, SC-011).
  - The same procedure as T026.
  - §4.2 Endable Actions (`:969`): the end block selects before it mutates (no bare `removeClass("visible")`).
  - §5.9 Compilation Model (`:1612`): the emitted `IEventActionConfiguration` shape, compiled, instead of `operations: [{ systemName, parameters }]`.
  - §8.1.1 Controller Operations (`:2405`): exactly the 9 controllers of `completion/metadata/controllers.generated.ts`, with positional parameters; drop `VideoController`, `AudioController` and any form the validator rejects; RoutingController **do-not-use**, quoting "This is a work in progress, do not use this yet please" (`controllers.generated.ts:190`); LottieController constrained (`lottie-web` is an optional peer dependency loaded on first attach, `:111`, and a dependency of the extension only).
  - §12.1 CSS File Imports (`:2816`): one `styles` import per document (the Typir rule `import-validation.ts:65` rejects a second).
  - Verify: `diff <(sed -n '/^### 8\.1\.1/,/^### 8\.2/p' LANGUAGE_SPEC.md | grep -oE '\b[A-Z][A-Za-z]+Controller\b' | sort -u) <(grep -oE '"name": "[A-Za-z]+Controller"' packages/language/src/completion/metadata/controllers.generated.ts | grep -oE '[A-Za-z]+Controller' | sort -u)` → empty; `sed -n '/^### 8\.1\.1/,/^### 8\.2/p' LANGUAGE_SPEC.md | grep -ci 'do-not-use\|do not use'` ≥ 1; the snippet checks and JSON comparisons as in T026, saved to `baseline/language-spec-4-5-8-12.txt`.

- [ ] **T028** `examples/README.md`: label `demo.eligian` (FR-030, SC-012).
  - Edit the `[demo.eligian](demo.eligian)` entry (`examples/README.md:28`): add "feature inventory, not idiom"; "excluded from the MCP example corpus and the evals"; "does not pass `check --selector-not-in-layout ids --max-warnings 0` (13 warnings)". `examples/demo.eligian` is not touched.
  - Verify: `grep -n -A6 '\[demo.eligian\]' examples/README.md` shows all three; `git diff --stat examples/demo.eligian` is empty; `node packages/cli/bin/cli.js check examples/demo.eligian --selector-not-in-layout ids --max-warnings 0` still reports 13 warnings (line saved to `baseline/demo-label.txt`).

- [ ] **T029** `packages/cli/KNOWN_ISSUES.md`: statuses and the resolved Q13 entries (FR-009a, FR-033, SC-014 part, SC-017).
  - Edit each entry (B1 `:9`, B1b `:25`, B2 `:38`, B3 `:77`, B4 `:111`, B5 `:136`, B6 `:162`, B7 `:171`, the asset-path note `:184`): a line `Status (2026-11-<dd>, <command>): open | fixed | stale`, each re-verified by running its command. B1b → stale / resolved (`bin` maps both names to `./bin/cli.js` and `files` contains `bin/cli.js`; asserted by `package-bin.spec.ts:29-39`).
  - Add a **resolved** entry for the Typir message prefix `While validating the AstNode …` (origin `typir@0.3.3 lib/services/printing.js:99-104`; now stripped in `EligianDocumentValidator`) and the duplicate video-`from` diagnostic (origin `timeline-validator.ts:84` + Typir `timeline-validation.ts:72`; the Typir rule is removed), with the date and the command `node packages/cli/bin/cli.js check packages/cli/src/__tests__/__fixtures__/check-codes/video-without-from.eligian --format json`.
  - Verify: `grep -n "While validating the AstNode" packages/cli/KNOWN_ISSUES.md` ≥ 1 line, inside an entry marked resolved; every entry heading has a `Status (` line below it.

- [ ] **T030** Roadmap metric names (FR-002b, SC-021).
  - Edit `specs/058-mcp-server/roadmap.md`: `unknown-operation` → `unknown_operation` at line 35 (§1 "Teaching happened") and line 385 (§6.4). Nothing else.
  - Verify: `grep -n "unknown-operation" specs/058-mcp-server/roadmap.md` → 0; `grep -n "unknown_operation" specs/058-mcp-server/roadmap.md` ≥ 2; `git diff specs/058-mcp-server/roadmap.md` shows only those two lines; `grep -rn "unknown-operation" packages/language/src` → 0. Output saved to `baseline/roadmap-metrics.txt`.

---

## Group 14 — Integration: AGENTS.md, docs policy, gates (sequential, in this order)

- [ ] **T031** `AGENTS.md` drift (FR-034, SC-014; roadmap §7 Phase 0 "AGENTS.md drift (pnpm version, bin mapping, no `src\index.ts`)").
  - Root `AGENTS.md:29`: "currently 11.9" → "currently 12.14" (`package.json:50`, `pnpm@12.14.0`).
  - `packages/cli/AGENTS.md`: the `> Note:` paragraph that says `bin` maps `eligian` → `./dist/cli.mjs` (the no-op bundle) becomes: `bin` maps both `eligian` and `eligian-cli` to `./bin/cli.js`, which is in `files`. Drop "`index.ts` — package exports." from the `main.ts` line under "Layout (`src/`)" (`packages/cli/src` has no `index.ts`; the `bundler/` list's `index.ts` stays).
  - Verify: `grep -n "11\.9" AGENTS.md` → 0; ``grep -n 'dist/cli.mjs` (the no-op bundle)' packages/cli/AGENTS.md`` → 0; ``grep -n '`index.ts` — package exports' packages/cli/AGENTS.md`` → 0; `test -e packages/cli/src/index.ts` is false. Output saved to `baseline/docs-drift.txt`.

- [ ] **T032** README / CHANGELOG: no entry in this phase (plan "E–H": no FR or SC requires one, neither file is in spec.md's "Touched files", Constitution XII).
  - Confirm `git diff --stat -- CHANGELOG.md README.md packages/cli/README.md` is empty. If the user decides otherwise (see open questions), the entry is written here, after T031.

- [ ] **T033** Build, type and lint gates (plan gates 1–5; SC-015).
  - Run, appending each summary to `specs/058-mcp-server/phase-0-foundation/baseline/gates-after.txt`: `pnpm build`; `pnpm typecheck`; `pnpm run typecheck:tests`; `pnpm check` (0 errors / 0 warnings); `pnpm run ci` (never bare `pnpm ci`).
  - Verify: every command exits 0. A failure is fixed at its source (navigate to the real site; never `sed` with compiler line numbers), then T033 restarts.

- [ ] **T034** Effect gates (plan gates 6 and 6a; FR-035).
  - `pnpm effect:check` (= `effect:check:language` + `effect:check:cli`) → 0 errors, 0 warnings. `pnpm exec effect-tsgo diagnostics --project packages/language/tsconfig.test.json --format text --strict` → 0/0; the same with `packages/cli/tsconfig.test.json` → no finding besides the T005 set. Summaries appended to `baseline/gates-after.txt`.

- [ ] **T035** Test suites and both bundle variants (plan gates 7–8; SC-005, SC-008, SC-010, SC-018).
  - `pnpm test` (all packages, incl. extension and shared-utils) green; per-package summaries appended.
  - `pnpm -C packages/cli build:prod` → `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts` (the only skipped test: `mcp answers initialize in under 3 s`) → `pnpm -C packages/cli build`.
  - `pnpm -C packages/cli exec vitest run src/__tests__/mcp-runtime-claims.spec.ts` → 16 passed, 0 skipped.

- [ ] **T036** Example gates (plan gate 9; FR-035, SC-015). The language package changed, so all three run.
  - `pnpm run check:examples` (exit 0, `0 errors, 0 warnings`), `pnpm run smoke:examples` (exit 0), `pnpm run fmt:examples` (exit 0). Summaries appended to `baseline/gates-after.txt`.

- [ ] **T037** Coverage gates (plan gate 10; FR-031, FR-032, SC-013).
  - `pnpm test:coverage:ci` (root, both packages, `--workspace-concurrency=1`). Language ≥ lines 79.8 / functions 80 / branches 69.9 / statements 79; CLI ≥ the T008 thresholds. If the language package drops below, add tests for the new code (`validators/codes.ts`, the `eligian-document-validator.ts` overrides, `eligian-validation-registry.ts`, `compileErrorCode`, `compiler/version.ts`); never lower a threshold. "All files" rows appended to `baseline/gates-after.txt`.

- [ ] **T038** Measurements and diffs on the final tree (plan gates 11–12; SC-002, SC-007a, SC-009, SC-014, SC-016, SC-021).
  - SC-009 Windows: the T006 command, nothing else running → median < 3,000 ms and ≤ 1,109 ms (the before maximum); appended to `baseline/startup-after.txt`.
  - SC-007a: after `pnpm -C packages/extension build` and `pnpm -C packages/language build`, the plan's amended command `grep -rhoE --include='*.js' --include='*.cjs' --include='*.mjs' '.{0,11}__ELIGI(AN|US)_VERSION__' packages/extension/out packages/language/dist | grep -vcE '(typeof |"string" ?\? ?)__ELIGI(AN|US)_VERSION__$'` → `0`.
  - Re-run T018 (scan → `uncoded accept sites: 2`; snapshot diff → only FR-004a/b lines) and the T030 / T031 greps on the final tree.
  - Everything appended to `baseline/gates-after.txt`. The comply stage builds `compliance.md` from the `baseline/` evidence, `baseline/deviations.txt`, the plan's "Corrections to the spec" and open questions 1–2, and the SC-011 reading of T026 / T027 by a reviewer other than the implementer.

---

## Dependencies

- Group 1 → Group 2 → Group 3: every baseline is taken before any source edit (plan "Sequencing", Step 0).
- Group 4 (registry) → Groups 5–8: every code site imports `diagnosticCode`.
- Group 5's tests are red until Groups 6–8; T017 turns the last cases green and T018 diffs.
- Group 9 (versions) and Group 10 (lazy imports) both edit `package-bin.spec.ts`, so they run one after the other, Group 9 first.
- Group 11 needs Groups 4–10 in the build: `check-codes` reads the coded output, and the runtime claims use T021's async `smokeWindow`.
- Group 12 needs T024 (the claim titles). Group 13 needs the final compiler (T026 / T027 compile snippets; T029 cites a T023 fixture).
- Group 14 runs last.

## Defects found

<!-- Triage notes added by the gates during the build stage. Empty at planning time. -->

- **Group 5 gate (a3), triaged, not a defect**: step 3's 40 failures (`diagnostic-codes.spec.ts` 30, `eligian-document-validator.spec.ts` 10; 3 passed, 1 todo) are the planned test-first red, identical to `baseline/diagnostic-codes-red.txt` and `baseline/document-validator-red.txt`. Owners: T012 (16 FR-003 sites, incl. `timeline-provider-invalid`, whose fixture's parse error is intended and whose validator diagnostic is the uncoded entry), T013 (Typir rule codes, `video without from`, `raf with from`), T015 (`syntax-error`, `unresolved-reference`, `type-mismatch`, prefix strip, `stripTypirPrefix` export), T017 (`file-unreadable`; the corpus test goes green after T017). No source change in Group 5.
- **Group 11 gate (a1), triaged, not a defect**: step 3's single failure, `mcp-runtime-claims.spec.ts` > `ELIGIUS_EXECUTION_MODEL.md states every probed claim` (15 of 15 `CLAIMS` titles absent from `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md`), is the planned test-first red marked "Red until T025" (Group 12); every other case in `mcp-runtime-claims.spec.ts` and all of `check-codes.spec.ts` pass. Owner: T025. No source change in Group 11.
