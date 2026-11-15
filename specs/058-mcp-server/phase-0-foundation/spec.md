# Feature Specification: MCP server, Phase 0: Foundation

**Feature**: spec 058 (Eligian MCP server), Phase 0 of `specs/058-mcp-server/roadmap.md` §7
**Branch**: `feat/mcp-server-roadmap`
**Created**: 2026-11-04
**Status**: Draft (clarifications encoded 2026-11-04)
**Input**: roadmap §7 "Phase 0: Foundation (5 days)", the design in §2–§6, and the decisions in §8. Every claim about existing code below was checked on 2026-11-04 with typegraph (`ts_module_exports`, `ts_references`) or a command whose output is quoted.

## Overview

Phase 0 builds no MCP server. It fixes what the server will rely on. When the phase is done, the facts the server repeats (diagnostic codes, runtime semantics, versions, the language spec) are true and machine-checkable, and the CLI starts fast enough to host a stdio server. Concretely, every diagnostic `checkFiles` reports carries a code from one runtime registry. `eligian check` adds two CLI-layer codes outside that registry, `compile-failed` and `eligius-<rule>` (FR-009). Each runtime claim in `ELIGIUS_EXECUTION_MODEL.md` is either backed by an executable probe against the installed eligius or marked as not probed. The compiler reports its real version instead of hard-coded literals, and the CLI loads `jsdom`/`esbuild` only when it needs them. The `LANGUAGE_SPEC.md` sections that describe a fictional output format are corrected. `examples/demo.eligian` is labelled, the CLI package gets a coverage gate, and stale docs (`KNOWN_ISSUES.md`, `AGENTS.md`) are reconciled with the code.

## Scope and non-goals

**In scope** (roadmap §7 Phase 0 bullet list, verbatim headings): a code on every diagnostic; runtime re-verification; `getCompilerVersion`/`VERSION` injected at build time; lazy imports in source and a startup measurement; `LANGUAGE_SPEC.md` §11.2/11.3, §4.2, §5.9, §8.1.1, §12.1 and a new §11.4; `examples/demo.eligian` labelled (decision Q6); a coverage gate for `packages/cli` (decision Q8); `KNOWN_ISSUES.md` and `AGENTS.md` drift.

**Touched files** (roadmap §7 Phase 0 "Touches", plus the sites this spec found while verifying, marked †): `LANGUAGE_SPEC.md`, `packages/language/src/validators/**`, `packages/language/src/eligian-document-validator.ts`, `packages/language/src/compiler/pipeline.ts`, `packages/language/src/compiler/index.ts`, `packages/language/src/compiler/pipeline/check.ts`†, `packages/language/src/compiler/ast-transformer.ts`†, `packages/language/src/type-system-typir/validation/**`†, `packages/cli/esbuild.mjs`, `packages/cli/src/smoke/dom-environment.ts`, `packages/cli/src/smoke/smoke-runner.ts`†, `packages/cli/src/main.ts`† (version source only, FR-016; the `mcp` subcommand stays Phase 1), `packages/cli/src/__tests__/{mcp-runtime-claims,check-codes}.spec.ts` and their `__fixtures__/`†, `packages/language/src/__tests__/diagnostic-codes.spec.ts` and `__fixtures__/diagnostic-codes/`†, `packages/cli/src/dev/host-module.ts`, `packages/cli/src/bundler/*`, `packages/cli/src/__tests__/package-bin.spec.ts`, `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md`, `examples/README.md`, `packages/cli/package.json`, `packages/cli/vitest.config.ts`, `packages/cli/KNOWN_ISSUES.md`, `packages/language/src/index.ts` (registry export, FR-001a), `specs/058-mcp-server/roadmap.md` (metric names only, FR-002b), root and `packages/cli` `AGENTS.md`.

**Non-goals (owned by later phases; roadmap wording quoted):**
- The server itself: "`packages\cli\src\main.ts` (`mcp` subcommand), `packages\cli\src\mcp\{server,stdio,compiler-lock,diagnostics}.ts`", tools, generator, curriculum, review pass, `fmtFiles`, `withLint` export, `CheckDiagnostic.data`, `@eligian/language/mcp` entry, version 1.1.0, starters `^1.1.0`: **Phase 1** (§7 Phase 1 "Touches").
- `McpDiagnostic` and the `generated/diagnostics.md` catalogue built from the code registry: **Phase 1** (§3.2 row `generated/diagnostics.md`, §4). Phase 0 only provides "a runtime registry of code constants (`packages\language\src\validators\codes.ts`, Phase 0)"; its entries carry `{ code, source }` and no summaries (FR-001).
- Smoke `--scenario`, `--format ndjson`, `smokeFile`, `host-operation-returned-non-object`, agents setup: **Phase 2**. Determinism, media clock, provenance `origin`, eval harness: **Phase 3**. Extension registration, `dev` error forwarding: **Phase 4**.
- Bringing `examples/demo.eligian` to the strict gate: "fixing it to the strict gate is a later task" (§8 decision 6).
- The `custom` provider contract (§8 decision 10) and open questions 11, 12, 14, 15: separate specs.
- No new DSL syntax (§1 non-goals). No diagnostic **message** rewording except the Typir prefix strip that settles roadmap Q13 (FR-004b, FR-009a).

## User scenarios and testing

### User story 1: every diagnostic has a stable code (Priority: P1)
An agent (later, through `eligian_check`) or a CI script reads `eligian check --format json` and keys its fix on `code`. Today some diagnostics have none, so they cannot be mapped to a fix.

**Independent test**: `checkFiles` over the fixture corpus plus a coded-diagnostics fixture set reports zero diagnostics without a code, and every code is in the registry. At the CLI, `eligian check --format json` prints a code on every diagnostic; the registry rule covers what `checkFiles` returns, and `compile-failed` / `eligius-*` are the CLI's own (FR-009).

**Acceptance scenarios**:
1. **Given** a program with two `styles` imports, **When** `eligian check --format json` runs, **Then** the duplicate-import diagnostic carries a registry code. Today it carries none (probe output, 2026-11-04: `"message": "While validating the AstNode 'styles \"./b.css\"', this error is found: Duplicate 'styles' import. …"` with no `code` key). After this phase the message no longer starts with `While validating the AstNode` (FR-004b).
2. **Given** a `video` timeline without `from`, **When** checked, **Then** every diagnostic it produces carries a code. Today two uncoded diagnostics are emitted for the same problem, one from `timeline-validator.ts:84` and one from Typir `timeline-validation.ts:72`. After this phase exactly one is emitted (the validator's), and it is coded (FR-004a).
3. **Given** a parse error, **When** checked, **Then** the code is `syntax-error` (today `parsing-error`, which comes from Langium's `data.code`).

### User story 2: the runtime model the server will teach is executable (P1)
**Independent test**: `mcp-runtime-claims.spec.ts` (15 probes, FR-010) passes on the installed eligius 4.2.0. With an eligius bump that changes a claimed behaviour, the spec fails.

### User story 3: correct versions and a fast cold start (P2)
**Independent test**: a test compares `--version` and the versions inlined in the built bundle with `packages/cli/package.json` and the installed `eligius/package.json` (FR-016). `package-bin.spec.ts` asserts that the bundle has no static top-level import of `jsdom`/`esbuild`/`effect/ai` and that `--version` stays within budget.

### User story 4: docs and gates the later phases depend on (P3)
**Independent test**: the corrected `LANGUAGE_SPEC.md` sections compile as shown. The CLI coverage thresholds are enforced in `test:coverage:ci`. `KNOWN_ISSUES.md` and `AGENTS.md` match the code. `check:examples`, `smoke:examples` and `fmt:examples` are green.

## Requirements

### Functional requirements

#### A. A code on every diagnostic (roadmap §7 Phase 0 bullet 2; §3.2 `generated/diagnostics.md`; §4 "Error shape")

- **FR-001**: A new module `packages/language/src/validators/codes.ts` MUST export a runtime-enumerable registry of every diagnostic code that any Eligian diagnostic can carry. Each registry entry is an object `{ code, source }`, where `source` is one of `'parser' | 'validator' | 'type' | 'linker' | 'compiler'` (the stage that emits the code). Entries carry **no** other field in this phase, in particular no summary text. The module MUST export (i) one value that enumerates all entries (for the Phase 1 generator, §3.2), (ii) the type of the code union, (iii) the type of the source union, and (iv) a membership guard for code strings. Validators MUST reference codes through this registry, not through string literals. *(§3.2: "a runtime registry of code constants (`packages\language\src\validators\codes.ts`, Phase 0)"; clarification Q5)*
- **FR-001a** (clarification Q5): The registry MUST be exported from the `@eligian/language` package root (`packages/language/src/index.ts`), so it is reachable through `dist/index.cjs`, which is what the CLI tests resolve `@eligian/language` to. Each code's `source` MUST be the stage that emits it: `syntax-error` is `parser`; `unresolved-reference` is `linker`; `type-mismatch` and every Eligian Typir rule code are `type`; the five compile-error codes of FR-008 and the "Cannot read file" code are `compiler`; every other code (the existing validator codes, the lowercased operation-validation codes, the pass-through `validation-errors.ts` codes, the FR-007 validator-exception code) is `validator`. Verified by SC-019.
- **FR-002**: Existing code strings MUST be kept verbatim in the registry, and the baseline is **every code a diagnostic can carry today, enumerated from source** (clarification Q1), not the result of one grep. The enumeration is the union of: (i) every `code: '…'` literal under `packages/language/src` outside `generated/` and `__tests__/` that reaches a diagnostic (the plain `grep -rhoE "code: '[a-z_-]+'" packages/language/src` gives 76 strings but also catches `'code'`, an AST property name at `generated/ast.ts:910`, and `'syntax-error'`, which appears only as test data at `__tests__/css-ide-features/code-actions.spec.ts:217`; neither is a baseline member unless a diagnostic emits it); (ii) codes held in constants (`expression-validator.ts:34-69` six `*_CODE` values; `set-data-validator.ts:7` `invalid_setdata_target`; `eligian-validator.ts:22` `missing_labels_file`); (iii) the lowercased `OperationValidationError` codes (`operation-existence-validator.ts:44` → `unknown_operation`; `parameter-validator.ts:116,154` → `parameter_count` / `parameter_type`; `control-flow-pairing.ts:41` → `control_flow`; source `compiler/operations/validation/errors.ts`); (iv) the verbatim pass-through codes of `validation-errors.ts:29-60` (SCREAMING_SNAKE, such as `ABSOLUTE_PATH`, `INVALID_PATH_FORMAT`, emitted at `import-validator.ts:330,352`). The enumeration is produced by a scratch script **before any source change**, saved to `specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-before.json`, and its count is quoted in `compliance.md`. Sites that compute their code (`.toLowerCase()`, pass-through) keep their derivation; they are not rewritten to registry constants (FR-002a). Consumers match on these strings: `eligian-code-action-provider.ts`, `css/code-action-helpers.ts`, `css/did-you-mean-fix.ts`, `labels/types.ts`, `validators/operation-call/label-parameter-validator.ts`, `packages/extension/src/extension/label-file-creator.ts`. Renaming would break quick fixes, so **no existing code is renamed**. New codes MUST use kebab-case, matching the names the roadmap uses (`type-mismatch`, `unresolved-reference`, `syntax-error`). *(Derived from §7 bullet 2, constrained by existing consumers; clarification Q1)*
- **FR-002a** (clarification Q1): A test MUST assert that every **derivable** value of a computed or constant-held code is a registry member: every value the `OperationValidationError` codes can take after lowercasing, every code of `validation-errors.ts`, every constant-held code of FR-002 (ii), and the `control_flow` / `parameter_count` / `parameter_type` derivations. The test enumerates the values from the source modules, not from a hand-written list. Verified by SC-020.
- **FR-002b** (clarification Q4): `unknown_operation` stays verbatim in the registry and in what is emitted (no rename, no alias). This phase MUST correct the roadmap's success-metric names that say `unknown-operation`, in `specs/058-mcp-server/roadmap.md` §1 ("Teaching happened") and §6.4 (the `operations-before-first-unknown` metric text), so they read `unknown_operation`. Only those metric names change in the roadmap. Verified by SC-021.
- **FR-003**: Every `accept(…)` call under `packages/language/src/validators/**` and `packages/language/src/eligian-validator.ts` MUST pass a registry code, as `code:` or as `data.code`; both are read by `diagnosticCode` in `compiler/pipeline/check.ts:233-236`. The roadmap counts 9 sites (timeline-validator 7, action-validator 2). The scan for this spec found **16** sites with no code anywhere in the call:
  - `timeline-validator.ts:64, 84, 117, 120, 129, 135, 146` (7)
  - `action-validator.ts:355, 369` (2)
  - `operation-call/operation-existence-validator.ts:80, 92` (2)
  - `program/asset-import-validator.ts:126, 131, 255, 319` (4)
  - `program/structure-validator.ts:20` (1)

  All 16 MUST get a code. (`label-parameter-validator.ts:206` and `set-data-validator.ts:52` pass a `data` variable that already holds a `code`.) *(§7 bullet 2)*
- **FR-004**: Diagnostics produced by Typir MUST carry a registry code. The path is `typir-langium` `DefaultLangiumTypirValidator.report` (`typir-langium@0.3.3 lib/features/langium-validation.js:30-37`). It calls `accept(problem.severity, Printer.printValidationProblem(problem), Object.assign({ node, property, index }, problem))` and sets no code of its own. Two cases:
  - **Eligian's own Typir rules.** There are 21 `accept({…})` sites in 6 of the 7 files under `packages/language/src/type-system-typir/validation/`; `label-id-validation.ts` has none and returns errors to `label-parameter-validator.ts`. The sites are listed by the SC-002 scan: constant 62, 75; control-flow 79, 90, 138, 149; event 67, 78, 85, 101, 132, 162, 172; import 63, 106; languages 74, 91, 103; timeline 70, 78, 89. Each site MUST pass a **rule-specific** registry code as a `code` property of the problem it accepts. That property reaches Langium unchanged, for two reasons. `report` spreads the whole problem into Langium's `DiagnosticInfo`. typir-langium types the problem properties as `TypirSpecifics['ValidationMessageProperties'] & Omit<DiagnosticInfo<AstNode>, 'node' | 'property' | 'index'>` (`typir-langium@0.3.3 lib/typir-langium.d.ts:19`), and `DiagnosticInfo` has `code`. One blanket code attached afterwards in the document validator does **not** satisfy this FR. Sites of one rule that report one condition MAY share a code. Sites that report different conditions MUST NOT.
  - **Typir core** (assignability/inference). Its problems have no Eligian rule site and MUST get `type-mismatch`. The roadmap puts this wrapping in `eligian-document-validator.ts`; whether it overrides `report` or post-processes the diagnostics is a plan decision. `type-mismatch` MUST NOT be used by any Eligian Typir rule site.

  *(§7 bullet 2: "wraps Typir diagnostics (`type-mismatch`, …)")*
- **FR-004a** (clarification Q2): The duplicate Typir source-file rules MUST be removed. In `type-system-typir/validation/timeline-validation.ts`, Rule 1 (the "requires a source file" error and the "does not use a source file" warning, `:70-82`) is deleted, which removes 2 of the 21 FR-004 sites (19 remain; Rule 2, the empty-timeline warning, keeps its own rule-specific code). `timeline-validator.ts:84` is then the only reporter of "requires a source file", so a `video`/`audio` timeline without `from` yields exactly **one** diagnostic. `timeline-validator.ts` does not report the "does not use a source file" warning (a `raf`/`custom` timeline with `from`), so that warning MUST move into `timeline-validator.ts` with the same message, severity (warning) and range (`property: 'source'`) and a registry code of its own; it is therefore still reported exactly once and no diagnostic is lost. `document-errors.spec.ts:130` stays green.
- **FR-004b** (clarification Q2): `EligianDocumentValidator` MUST strip Typir's message prefix `While validating the AstNode '…', this error is found: ` (origin `typir@0.3.3 lib/services/printing.js:99-104`) from **every** Typir diagnostic, both Eligian rule diagnostics and Typir-core diagnostics, so each message starts with the problem text. Only the message changes: code, severity, range and `data` are untouched. Non-Typir diagnostics are never altered.

- **FR-005**: Langium linking errors MUST carry the code `unresolved-reference`. `EligianDocumentValidator.processLinkingErrors` (`eligian-document-validator.ts:21-50`) rebuilds the diagnostic without Langium's `data` (`{ code: 'linking-error', containerType, property, refText }`, `langium@4.2.4 lib/validation/document-validator.js:115-131`). The override MUST keep that `data`, so that Langium's `stopAfterLinkingErrors` check (`document-validator.js:37`) works again, and MUST set the top-level `code: 'unresolved-reference'`. The existing skip of `OperationCall.operationName` linking errors MUST be kept. *(§7 bullet 2: "Langium linker errors (`unresolved-reference`)")*
- **FR-006**: Lexer and parser diagnostics MUST carry the top-level code `syntax-error`, and Langium's `data.code` (`lexing-error` / `parsing-error`) MUST stay as it is. `DefaultDocumentValidator.validateDocument` tests `d.data?.code === DocumentValidator.ParsingError` for `stopAfterParsingErrors` (`document-validator.js:29-33`). `checkFiles` prefers the top-level `code` (`check.ts:234`), so it will report `syntax-error`. *(§7 bullet 2: "parser errors `syntax-error`")*
- **FR-007**: A diagnostic that Langium synthesises when a validator throws MUST carry a registry code. Langium's `ValidationRegistry.handleException` (`langium@4.2.4 lib/validation/validation-registry.js:77-91`, called at `:74` and `:150`) emits `"An error occurred during validation: …"` with no code. No validator is known to throw on a real input, so this is verified by a unit test, not a fixture. A test-only services instance (`createTestContext()` or its own `createEligianServices`) registers a check that throws through `ValidationRegistry.register(checksRecord, thisObj, category)` (`validation-registry.js:44`). The test then runs `DocumentValidator.validateDocument` and asserts that the resulting diagnostic has the registry code.
- **FR-008**: `compileDiagnostic` (`compiler/pipeline/check.ts:107-127`) MUST set a registry code derived from the compile error's `_tag`. The `_tag` values come from the `CompileError` union (`pipeline.ts:166`): `ParseError`, `ValidationError`, `TypeError`, `TransformError`, `EmitError`. The derivation MUST be an exported pure function, so a **table test** can cover every `_tag` and assert its registry code, and that two different `kind` values of one `_tag` (from `ValidationErrorKind`, `errors/compiler-errors.ts:47-61`, and `TransformErrorKind`, `:117-124`) give the same code. No fixture reliably reaches `compileDiagnostic` through `checkFiles`: it compiles only programs with no validation errors (`check.ts:85-95`), and asset errors are reported by the IDE validator first (`pipeline.ts:222-226`). The derivation is **one code per `_tag`**: 5 distinct registry codes, one each for `ParseError`, `ValidationError`, `TypeError`, `TransformError` and `EmitError`; `kind` does not influence the code (it MAY stay in `data`). The "Cannot read file" diagnostic built in `validateFiles` (`check.ts:150-158`) MUST carry a code as well. It is reached by passing a **nonexistent path** to `checkFiles`. A permission-based unreadable file is not portable (`chmod` has no effect on Windows). *(§7 bullet 2: "`compileDiagnostic` gets codes")*
- **FR-009**: Every code that `checkFiles` returns MUST be a member of the FR-001 registry. `CheckDiagnostic.code` (`check.ts:40`, today `readonly code?: string`) MAY become required. Message text, severity and range of existing diagnostics MUST NOT change, except the changes FR-004a and FR-004b list (enforced by SC-016). The registry's scope is the language package (`checkFiles` and the IDE). The CLI layer adds two codes of its own outside it: `compile-failed` (`packages/cli/src/check/check-command.ts:162`) and `eligius-<rule>` for Eligius lint findings (`packages/cli/src/check/lint.ts:29`). Both stay outside the registry in Phase 0, and Phase 1's `generated/diagnostics.md` catalogue (§3.2) decides how to list them. Every diagnostic `eligian check` prints still carries a code.
- **FR-009a** (roadmap §8 Q13; clarification Q2): Roadmap Q13 is settled by fixing, not by documenting: FR-004a (duplicate rule removed) and FR-004b (prefix stripped). `packages/cli/KNOWN_ISSUES.md` MUST record both as **resolved**, each with the date, the origin (the Typir printer at `typir@0.3.3 lib/services/printing.js:99-104`; `timeline-validator.ts:84` + `timeline-validation.ts:72`) and the command that shows the resolution. The changed messages and counts that FR-004a/FR-004b allow are the only exceptions to FR-009's no-change rule, and each is listed in `compliance.md`.

#### B. Runtime re-verification (roadmap §7 Phase 0 bullet 3; §3.3 C)

- **FR-010**: A new spec `packages/cli/src/__tests__/mcp-runtime-claims.spec.ts` MUST contain one test per claim below (15 tests). Each test compiles a minimal `.eligian` probe with the real compiler and runs it on the **installed** eligius in jsdom. It then asserts the observable named for its claim.

  **Harness (fixed here, not left to the plan).** The bag cannot be observed with built-in operations alone. Claim 1 also cannot be written with them: an end block that uses a `selectedElement` it never selected is rejected at compile time. `operation-dataflow.ts:237-238` walks `endOperations` from `fresh()` state, and `:503-506` reports `missing-dependency`. `compileWithMap` runs `validateAST` (`pipeline.ts:215`), so such a probe never reaches the engine. The probes therefore use a **probe host module**: `packages/cli/src/__tests__/__fixtures__/runtime-claims/probe-host.ts`, following the `extensions "./host.ts"` convention of `host-module.spec.ts:34`. It is declared in each probe as `extensions "./probe-host.ts" { operation recordBag(label: string, value: unknown) operation returnUndefined }`.
  - The dataflow check does not flag host operations: their signatures get `dependencies: []` and `outputs: []` (`compiler/operations/host-operations.ts:81-82`).
  - `recordBag` appends `{ label, keys: Object.keys(operationData), value }` to an array on `globalThis` and returns `operationData` unchanged. Every probe passes both arguments (a dummy `0` when there is no value), so arity validation does not interfere. `globalThis` is the channel because the host module is bundled into a module instance of its own. `returnUndefined` returns `undefined`, as Eligius's own quirk test does with a custom operation (`eligius src/test/differential/quirks.spec.ts:371-373`, read-only reference).
  - Compile with `compileWithMap(source, { sourceUri })` (`pipeline.ts:264`; `CompileOptions.sourceUri`, `pipeline.ts:97`). `sourceUri` is a file URI inside the fixture directory, so the `extensions` path and any `layout` resolve; the result carries `host?: HostModule`.
  - Run each probe in one of two ways:
    - through `smokeConfig(config, map, { host })` (`smoke/smoke-runner.ts:75`), when its fixed seek-every-boundary sequence produces the observable;
    - otherwise the way `smokeConfig` does it (`smoke-runner.ts:80-116`): `loadEligius()`, `smokeWindow()`, `loadHostModule(host)`, `EngineFactory`. The test then drives the position, `switchTimeline`, or DOM/keyboard events itself.

  The claims, with their source in `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` and the exact observable each test asserts:
  1. **start/end independence**: each block starts from `{}`. A `selectedElement` from the start block is absent in the end block (§2 "start vs end are INDEPENDENT runs", lines 47-58). *Observable*: the end block's `recordBag` keys do not include `selectedElement`, while the start block's (after `selectElement`) do.
  2. **called-action copy**: the callee gets a copy of the caller's operationData plus its arguments, and nothing flows back (§5; rule 1, lines 231-235). *Observable*: the callee's `recordBag` keys include the caller's `selectedElement` and the parameter name. The caller's `recordBag` after the call lacks any key the callee added (e.g. through `setOperationData`).
  3. **seek reconcile**: a seek ends active actions that no longer cover the position and starts inactive ones that do (§7, `_reconcileActions`). *Observable*: a recorded start/end sequence (or DOM class) after seeking from inside range A to inside range B: A's end ran, B's start ran.
  4. **forward skip**: after a jump past a range, that range's start and end operations never ran (§7, rule 13). *Observable*: no `recordBag` entry with that range's labels.
  5. **controller survival across switch**: a controller attached in `on enter` stays attached after `switchTimeline` unless `on leave` removes it (§6, rule 12). *Observable*: a DOMEventListenerController listener attached in timeline A's `on enter` still fires its action (a `recordBag` entry) on a dispatched click after switching to timeline B; with a `removeControllerFromElement` in A's `on leave` it does not.
  6. **`loopLength` = length − 1** (roadmap §3.3 C `runtime-quirks`). *Observable*: `recordBag("len", @@loopLength)` inside a `for` over a 3-item array records `value === 2`.
  7. **an operation returning `undefined` hands the next operation an empty bag** (roadmap §3.3 C `runtime-quirks`). *Observable*: after `selectElement(…)`, `returnUndefined()`, `recordBag("after", 0)`, the recorded keys are `[]`.
  8. **lifecycle blocks start empty**: `on enter` and `on leave` begin with `{}` (lines 59-60; rule 1). *Observable*: the first `recordBag` in each block records `[]`.
  9. **event actions start with only `eventArgs`** (lines 60-61; rule 1). *Observable*: an `on event "x"` action's first `recordBag` records exactly `['eventArgs']` after a `broadcastEvent`.
  10. **listener actions start with the listener's data plus `eventTarget` (and `eventKey` for keys)** (lines 61-64; rule 1). *Observable*: the first `recordBag` in an `on click … run` action includes `eventTarget`. In an `on key … run` action it includes `eventTarget` and `eventKey`. Neither includes a key set by the timeline block that wired the listener, except the listener's own `actionOperationData`.
  11. **a plain action call runs start operations only** (rule 3, lines 239-240). *Observable*: calling an `endable action` as a plain operation records its start `recordBag` and never its end one.
  12. **`switchTimeline` ends the leaving timeline's active actions, so its `on leave` runs** (lines 191-193). *Observable*: A's `on leave` `recordBag` entry exists after a switch to B.
  13. **`on leave` does not run when the content ends** (lines 194-196). *Observable*: under real playback (FR-010a) a short raf timeline runs to its duration, with no switch or stop, and afterwards there is no `on leave` entry.
  14. **a switch to the already-current timeline is a no-op** (rule 13, lines 272-273). *Observable*: `switchTimeline` to the current timeline adds no `on leave` and no `on enter` entry.
  15. **the first timeline starts only on the first position tick** (lines 207-209). *Observable*: after `init()` and before the first faked animation frame there is no `on enter` entry of the first timeline; after the first frame has ticked the position (real playback, FR-010a) there is.

  Claims 8–15 are the document's claims that the Phase 1 instructions state as rules (§3.5) or that Phase 1's `runtime-engine-lifecycle` / `runtime-scheduling` mine (§3.3 C). *(§7: "one probe per claim in `ELIGIUS_EXECUTION_MODEL.md`")*
- **FR-010a** (clarification Q8): Claims 13 and 15 MUST be probed with **real playback under vitest fake timers**, not with `seek`. The test installs `vi.useFakeTimers` with `toFake` including `requestAnimationFrame` (and `cancelAnimationFrame`, `setTimeout`, `setInterval`, `performance`), applied so that the raf the engine calls (the jsdom window's) is the faked one, on a short raf timeline (about 1 s). It starts the engine (`start()` / play) and advances the fake clock to drive the frames, through the end of the content for claim 13 and through the first frame for claim 15. It never waits on real time. Every other probe (claims 1-12, 14) positions the engine with `seek` (`smokeConfig`'s seek-every-boundary sequence, or `engine.seek`), as `smoke` does. Timers MUST be restored (`vi.useRealTimers()`) after each of the two tests so the other probes are unaffected.

- **FR-011**: Where a probe disagrees with the document, the **document** MUST be corrected; the probe is not adjusted to fit. Each of the 15 claims MUST be stated in `ELIGIUS_EXECUTION_MODEL.md` with a reference to its test title. Claims 6 and 7 are not stated today; the document only maps `@@loopLength` to `$scope.loopLength`, line 85. *(§7: "fix the document where a probe disagrees")*
- **FR-011a**: Every other behavioural claim in `ELIGIUS_EXECUTION_MODEL.md` (a sentence about what the engine does at runtime, as opposed to a pointer into eligius source) MUST end up in one of two states. Either it has a probe in `mcp-runtime-claims.spec.ts` and a test-title reference, or it is marked inline `(not probed, Phase 0)`. The title line (`# Eligius execution model — verified from source`, line 1) MUST say that only the referenced claims are probe-verified against the installed eligius. Phase 1 teaches a sentence as verified only if it carries a test-title reference. *(§3.3 C: "re-verified in Phase 0 by probes"; §3.3 "after Phase 0 re-verification")*
- **FR-012**: The spec MUST import eligius only from the installed package (`eligius`), never from `../eligius/src` or the sibling checkout (AGENTS.md import bans). It MUST live in its own test file, because `dom-environment.ts` installs jsdom globals permanently (roadmap §2 "Process isolation").

#### C. Versions injected at build time (roadmap §7 bullet 4; §2 "Versioning and compatibility")

- **FR-013**: In the CLI bundle, `getCompilerVersion()` (`compiler/pipeline.ts:371-374`, today `{ compiler: '0.0.1', eligius: '1.1.4' }`) MUST return `compiler` = the `version` of `packages/cli/package.json` and `eligius` = the `version` of the installed `eligius/package.json`. The eligius file MUST be resolved from `packages/cli` with `createRequire(import.meta.url).resolve('eligius/package.json')` (`node:module`), never from the sibling checkout. `esbuild.mjs` is an ES module with no `require` of its own. The only `createRequire` in it (line 88) is inside the banner string injected into the bundle. eligius exports `./package.json`, and resolving it from `packages/cli` yields eligius 4.2.0. Both values MUST be injected by an esbuild `define` in `packages/cli/esbuild.mjs`, which already reads `package.json` at `esbuild.mjs:24`. *(§2: "Phase 0 injects both at build time (`esbuild` `define` from `packages\cli\package.json` and `eligius/package.json`)")*
- **FR-014**: `VERSION` (`compiler/index.ts:151`, today the literal `'0.0.1'`) and the IR metadata `compilerVersion: '0.0.1'` (`compiler/ast-transformer.ts:325`, the third hard-coded copy) MUST use the same injected value.
- **FR-015**: Code that reads the injected constants MUST NOT throw when they are not defined. This covers vitest without a `define`, the language package's own `dist/index.cjs` build that the CLI tests resolve `@eligian/language` to (`packages/language/package.json` `exports["."].default`), and the extension bundle. It MUST then return a fixed, recognisable development value, which the plan names. Every reference to an injected identifier MUST be inside a `typeof … !== 'undefined'` guard (or `typeof … === 'string'`). Verified by SC-007a.
- **FR-016**: Tests in `package-bin.spec.ts` MUST show that the **built** CLI carries the injected versions. The observable is fixed here, because the obvious ones pass even when the `define` does not work:
  - `--version` reads `package.json` at runtime today (`readPackageVersion`, `main.ts:41-51`).
  - `getCompilerVersion` has no caller besides its re-export (`ts_references`: `pipeline.ts:371` definition, `compiler/index.ts:103` re-export).
  - The emitter does not emit IR metadata (`compilerVersion` is set at `ast-transformer.ts:325` only).
  - `dist/cli.mjs` exports only `main` (`bin/cli.js:3`).

  Therefore:
  - (i) `main.ts` MUST take the version that `--version` prints (and passes as `version` to `runCheck`, `main.ts:352`) from the injected compiler version, and `readPackageVersion` MUST be removed. The define is then the only source of `--version`. The output format stays a bare version (`cli.spec.ts:221-226` asserts `/\d+\.\d+\.\d+/`). The test spawns `node bin/cli.js --version` and asserts that the trimmed output equals `version` read at test time from `packages/cli/package.json`.
  - (ii) The test reads `dist/cli.mjs` and asserts that it contains neither `__ELIGIAN_VERSION__` nor `__ELIGIUS_VERSION__`. It also asserts that the bundle contains `JSON.stringify(v)` for both versions. `v` is read at test time from `packages/cli/package.json` and from the file at `createRequire(<packages/cli/package.json>).resolve('eligius/package.json')`.

  Both expected values are read from the package files at test time, never written as literals. *(§2: "adds a test that the header matches the package files")*

#### D. Lazy imports and startup (roadmap §7 bullet 5; §2 "Startup budget")

- **FR-017**: `packages/cli/src/smoke/dom-environment.ts` MUST load `jsdom` with a dynamic `import('jsdom')`; today the import is static (`dom-environment.ts:8`). `smokeWindow()` is synchronous today (`() => Window & typeof globalThis`, line 19) and has two callers (`dom-environment.ts:36`, `smoke-runner.ts:81`). It MAY become async, and its callers MUST be adapted. Type-only imports are allowed.
- **FR-018**: `esbuild` MUST be loaded with a dynamic `import('esbuild')` at every runtime use in the CLI sources. Today the imports are static in `dev/host-module.ts:13`, `bundler/css-processor.ts:12` and `bundler/runtime-bundler.ts:13`. Type-only uses such as `esbuild.BuildFailure` (`runtime-bundler.ts:324`) MAY stay as `import type`.
- **FR-019**: `package-bin.spec.ts` MUST assert that the built `dist/cli.mjs` contains no static top-level `import … from "jsdom"`, `"esbuild"` or `"effect/ai"` (including subpaths) and no bare `import "jsdom"` / `"esbuild"` / `"effect/ai"`. The patterns MUST also match minified output: `prepack` = `build:prod`, which emits `import{JSDOM as x}from"jsdom"` (packages/cli/AGENTS.md:20). The patterns are `/(?:^|[;\n])\s*import\s*[^;'"(]*?from\s*["'](jsdom|esbuild|effect\/ai)(\/[^"']*)?["']/g` and `/(?:^|[;\n])\s*import\s*["'](jsdom|esbuild|effect\/ai)(\/[^"']*)?["']/g`, each with 0 matches. These are the same anchoring as the existing specifier scan at `package-bin.spec.ts:53-54`. The test MUST also assert at least one dynamic `import("jsdom")` and one `import("esbuild")` (`/\bimport\(\s*["']jsdom["']\s*\)/` and likewise for esbuild), so it checks that the imports became lazy and not merely that the text changed. In the bundle built 2026-11-04 the hoisted static imports are `esbuild` at lines 87143, 87363 and 88661, and `jsdom` at line 88705. `effect/ai` is not imported yet; the assertion guards the Phase 1 rule "`await import('effect/ai')` (`mcp\server.ts`)" before the module exists. *(§2: "`dist\cli.mjs` hoists external imports to static top-level imports … Phase 0 changes the sources")*
- **FR-020**: `package-bin.spec.ts` MUST measure the wall time of `node bin/cli.js --version` against the built bundle and assert the median is under 3,000 ms (the §2 startup budget, "< 3 s on the CI runners, Windows and Linux"). The test spawns `process.execPath` directly with `spawnSync`, without `shell`. It does one warm-up spawn that is not counted, then **5 measured spawns, one after another**, and asserts the **median** of the 5. It MUST print all 5 values and the median.
  - Parallel load: the other CLI suites spawn processes in parallel (`package-bin.spec.ts:69` comment). The 3,000 ms threshold is meant to absorb that load: the idle measurement on the development machine on 2026-11-04, before any change, was 1,075–1,109 ms over 3 runs, a 2.7× margin. The roadmap's figure is 1.9–2.1 s.
  - If the test proves flaky in CI, the fix is to move it to its own file with `fileParallelism: false`. Raising the threshold is not a fix.
- **FR-020a** (roadmap §7 Phase 0: "`package-bin.spec.ts` measures … the future `mcp` initialize time"; §8 risk "Startup over Codex's limit"; clarification Q7): `package-bin.spec.ts` MUST contain an `mcp` initialize-time test now. It spawns `node bin/cli.js mcp`, sends a JSON-RPC `initialize` request on stdin, and asserts that the initialize response arrives in under **3,000 ms**. It is guarded by `test.skipIf` on a probe of `bin/cli.js --help` output not listing an `mcp` subcommand, so it is skipped in Phase 0 and Phase 1 enables it by adding the subcommand, without editing the test. The skip condition MUST be derived from the CLI itself, not from a hard-coded flag.
- **FR-021**: `eligius/lint` stays a static import (bundle line 87807). The roadmap names it among the hoisted imports but does not list it for Phase 0 lazy-loading. `smoke`, `dev`, `compile --bundle` and host-module loading MUST behave identically after FR-017/FR-018.

#### E. LANGUAGE_SPEC.md corrections (roadmap §7 bullet 6; §3.3 "Not `LANGUAGE_SPEC.md` §11.2/11.3, §4.2, §5.9, §8.1.1, §12.1 until Phase 0 fixes them")

- **FR-022**: §11.2 "Output Format" (`LANGUAGE_SPEC.md:2747`) MUST show the real compiled output of its example: `startOperations: [{ id, systemName, operationData }]`, `timelines[].timelineActions`, durations in seconds, and the `requestAction` / `startAction` pair for an action call. Today the section shows a fictional `actions`/`operations`/`type`/`parameters`/`timeline.events` shape with times in milliseconds. Ids MUST be replaced by placeholders and labelled as random per compile.
- **FR-023**: §11.3 "Syntactic Sugar Transformations" (`:2798`) MUST list what the compiler emits for each row, checked by compiling each row.
- **FR-024**: §4.2 "Endable Actions" (`:969`) MUST NOT show an end block that mutates without selecting. Today its example's end block is `[ removeClass("visible") ]` with no `selectElement`, which contradicts start/end independence (FR-010 claim 1).
- **FR-025**: §5.9 "Compilation Model" for event actions (`:1612`) MUST show the emitted `IEventActionConfiguration` shape. Today it shows `operations: [{ systemName, parameters }]`.
- **FR-026**: §8.1.1 "Controller Operations" (`:2405`) MUST list exactly the controllers in `completion/metadata/controllers.generated.ts`: DOMEventListenerController, KeyboardController, LabelController, LottieController, MutationObserverController, NavigationController, ProgressbarController, RoutingController and SubtitlesController. It MUST use their positional parameters and MUST drop `VideoController`, `AudioController` and any parameter form the validator rejects. The RoutingController entry MUST carry a **do-not-use** status quoting its metadata ("This is a work in progress, do not use this yet please", `controllers.generated.ts:190`). The LottieController entry MUST say it is constrained: `lottie-web` is an optional peer dependency loaded on first attach (`controllers.generated.ts:111`), and it is a dependency of the extension only. Both statuses match roadmap §3.2, row `generated/controllers.md`.
- **FR-027**: §12.1 "CSS File Imports" (`:2816`) MUST say one `styles` import per document. Today it shows three. The Typir rule `type-system-typir/validation/import-validation.ts:65` rejects a second one, as the duplicate-styles probe in User story 1 confirmed.
- **FR-028**: A new §11.4 MUST document erased parameters: an operation that erases a property named like an action parameter is wrapped in a save/restore through `setOperationData` / `__eligian_param_<name>` when the block uses the parameter again (`compiler/transformers/erased-parameters.ts`; AGENTS.md "Erased parameters").
- **FR-029**: Every Eligian snippet in the sections of FR-022…FR-028 MUST pass `eligian check` (supporting layout/CSS files as needed). Every JSON block in them MUST equal `eligian compile` output for its snippet, modulo ids.

#### F. demo.eligian (roadmap §7 bullet 7; §8 decision 6)

- **FR-030**: `examples/README.md` MUST label `examples/demo.eligian` "feature inventory, not idiom". It MUST state that the file is excluded from the MCP example corpus and the evals, and that it does not pass the strict gate (`check --selector-not-in-layout ids --max-warnings 0`). Verified 2026-11-04: `1 file, 0 errors, 13 warnings` / `Too many warnings: 13 (maximum 0)`. `demo.eligian` itself MUST NOT change. It stays in `check:examples`, `smoke:examples` and `fmt:examples`, which it passes today (`check:examples` → `9 files, 0 errors, 0 warnings`, exit 0).

#### G. CLI coverage gate (roadmap §7 bullet 8; §8 decision 8)

- **FR-031**: `packages/cli/package.json` `test:coverage:ci` MUST run `vitest run --coverage`; today it is `vitest run`. `packages/cli/vitest.config.ts` MUST define a V8 coverage block with `include: ['src/**/*.ts']` and an `exclude` of `src/**/__tests__/**`, `src/**/*.d.ts` and the browser-only client file `src/dev/client-runtime.ts` (clarification Q6), so a source file no test loads counts as 0% and lowers the total (an untested new MCP module fails the gate). The block also MUST define `thresholds` for lines, functions, branches and statements. The thresholds MUST be set to the baseline measured **before** any Phase 0 source change, **with that include and exclude**, floored to one decimal. CI already runs the root `test:coverage:ci` (`.github/workflows/ci.yml:92`, root `package.json:16` → `pnpm -r … test:coverage:ci`), so no workflow edit is needed. *(§8 decision 8: "thresholds at the measured baseline")*
- **FR-032**: The language package thresholds (`packages/language/vitest.config.ts:74-79`: lines 79.8, functions 80, branches 69.9, statements 79) MUST NOT be lowered, and language coverage MUST stay at or above them.

#### H. Documentation drift (roadmap §7 bullet 9)

- **FR-033**: Each entry of `packages/cli/KNOWN_ISSUES.md` (B1/B1b, B2, B3, B4, B5, B6, B7, "Note — possible asset-path edge case") MUST carry a re-verified status with a date and the command used: open, fixed or stale. At least B1b is stale: `bin` now maps both names to `./bin/cli.js` and `files` contains `bin/cli.js` (`packages/cli/package.json`; asserted by `package-bin.spec.ts:29-39`).
- **FR-034**: Root `AGENTS.md:29` says pnpm "currently 11.9"; `package.json:50` pins `pnpm@12.14.0`. `packages/cli/AGENTS.md:24` says `bin` maps to `./dist/cli.mjs`. `packages/cli/AGENTS.md:27` lists an `index.ts` "package exports", but `packages/cli/src` has no `index.ts`. All three MUST be corrected.

#### I. Exit (roadmap §7 Phase 0 "Exit")

- **FR-035**: The phase is complete only when `check:examples`, `smoke:examples` and `fmt:examples` are green. The coded-diagnostics test (SC-001) and the runtime-claims spec (SC-005) must be green. The corrected spec sections must have been read against compiled probes (SC-011). The AGENTS.md task-completion checklist must pass, including `pnpm effect:check` with 0 errors and 0 warnings for the touched Effect code (`check.ts` is `Effect.promise`-based).

### Key entities

- **Diagnostic code**: a stable string identifying a diagnostic kind. It lives in the FR-001 registry and is carried as `Diagnostic.code` or `Diagnostic.data.code`. `checkFiles` surfaces it as `CheckDiagnostic.code`.
- **Runtime claim**: one sentence of `ELIGIUS_EXECUTION_MODEL.md` about engine behaviour. It is either paired with one probe test that executes it (referenced by test title) or marked `(not probed, Phase 0)` (FR-011a).
- **Probe host module**: the test-only `extensions` module (`recordBag`, `returnUndefined`) through which the probes observe operationData (FR-010).
- **Injected version constants**: the CLI version and the eligius version, fixed at bundle time.

## Success criteria

**Built-artifact preconditions (apply to SC-005, SC-007, SC-008, SC-009, SC-018).**
- The CLI tests resolve `@eligian/language` to the language package's built `dist/index.cjs` (`packages/language/package.json` `exports["."].default`).
- `package-bin.spec.ts` skips its bundle tests when `dist/cli.mjs` or `LICENSE` is absent (`test.skipIf(!built)`, lines 26, 49, 70).

A stale or missing build therefore makes these criteria pass without testing anything. Each of them is measured only after `pnpm build`, or at least `pnpm -C packages/language build && pnpm -C packages/cli build`, and is run with `pnpm -C packages/cli exec vitest run <file>`. The vitest summary goes into `compliance.md` as a quote. For `package-bin.spec.ts` and `mcp-runtime-claims.spec.ts` the summary MUST show **0 skipped** tests, apart from the FR-020a initialize test, which is skipped until Phase 1 adds the `mcp` subcommand.

- **SC-001 (100% coded)**: A vitest spec in `packages/language/src/__tests__/` (`diagnostic-codes.spec.ts`) runs `checkFiles` **sequentially** over three sets of files:
  - (a) every `.eligian` file under `packages/language/src/__tests__/__fixtures__` (13), `packages/language/src/compiler/__tests__/__fixtures__` (7) and `packages/cli/src/__tests__/__fixtures__` (4);
  - (b) every `.eligian` file under `examples/` (15);
  - (c) a new fixture set, `__fixtures__/diagnostic-codes/`. Each fixture is paired in the spec with the **exact** code it must produce. Assertions such as "has a code" do not count. The set contains:
    - one file per FR-003 site (16);
    - one per data-variable site (`label-parameter-validator.ts`, `set-data-validator.ts`);
    - at least one per Eligian Typir rule file with `accept` sites (constant, control-flow, event, import, languages, timeline: 6). Each asserts that rule's own code, not `type-mismatch`;
    - a Typir core type mismatch (`type-mismatch`);
    - an unresolved reference (`unresolved-reference`);
    - a lexer error and a parser error (`syntax-error`);
    - a `video` timeline without `from` (exactly **1** diagnostic, coded) and a `raf` timeline with `from` (exactly **1** warning, coded), FR-004a;
    - a **nonexistent path** passed to `checkFiles`, for the "Cannot read file" diagnostic (FR-008).

    The validator-exception path (FR-007) and the compile-error mapping (FR-008) are covered by their unit tests, not by fixtures.

  **Metric**: diagnostics without `code` = **0**; codes not in the registry = **0**; every set-(c) fixture yields its expected code. The FR-007 throwing-check unit test and the FR-008 table test (each of the 5 `_tag` values → its own registry code, 5 distinct codes; two `kind` values of one `_tag` → the same code) pass. Baseline 2026-11-04: the duplicate-styles probe and the video-without-`from` probe each produced uncoded diagnostics.
- **SC-002 (no uncoded sites)**: The scan in Appendix A lists every `accept(…)` call that has no `code` property key (`code:` or shorthand `code`) in its balanced argument list. It covers `packages/language/src/validators/**`, `packages/language/src/type-system-typir/validation/**` and `packages/language/src/eligian-validator.ts`, with comments and string contents blanked first. Blanking the strings means `entry.code` inside a message (`languages-validation.ts:74`) does not count as a code. The command is `node <appendix-A script> .`, run from the repo root.
  - **Baseline** (run 2026-11-04): `uncoded accept sites: 39`. That is the 16 FR-003 sites, the 21 Typir rule sites of FR-004, and the 2 data-variable sites (`label-parameter-validator.ts:206`, `set-data-validator.ts:52`). FR-004a removes 2 timeline sites afterwards, so the post-change scan covers 37 sites; the target below is unchanged.
  - **Target**: exactly **2** lines, the two data-variable sites (one in `label-parameter-validator.ts`, one in `set-data-validator.ts`), which SC-001(c) covers by fixture. If the plan inlines their `code`, the target is 0.
  - In addition, `grep -rnE "type-mismatch|<registry key of type-mismatch>" packages/language/src/type-system-typir/validation` returns **0** lines: `type-mismatch` appears only on Typir-core problems (FR-004).
  - The command and its output go in `compliance.md`.
- **SC-003 (no code renamed or lost)**: Every code in the **enumerated** baseline of FR-002 (saved before the change as `baseline/emittable-codes-before.json`, count quoted in `compliance.md`; this is not the plain 76-string grep) is a member of the registry after the phase. Missing = **0**. The FR-002a test passes. Existing code-action tests pass unchanged.
- **SC-004 (CLI surface, automated)**: A new spec `packages/cli/src/__tests__/check-codes.spec.ts` spawns `node bin/cli.js check <file> --format json` on four probe fixtures and asserts:
  - (i) duplicate `styles`: the duplicate-import diagnostic has its registry code;
  - (ii) `video` without `from`: every diagnostic has a code;
  - (iii) an event anchored on an undeclared label (`at nope.end..2s [ ] [ ]`): `"code": "unresolved-reference"`. Baseline 2026-11-04: `"message": "Could not resolve reference to LabeledEvent named 'nope'."` with no `code`;
  - (iv) a stray token: `"code": "syntax-error"`.

  In every probe, each printed `code` is a registry member, `compile-failed`, or `eligius-<rule>` (FR-009). The compliance reviewer also quotes one manual run per probe.
- **SC-005 (runtime claims)**: Under the preconditions above, `pnpm -C packages/cli exec vitest run src/__tests__/mcp-runtime-claims.spec.ts` reports **16 tests passed, 0 skipped**: 15 claim probes, one per FR-010 claim with the title naming its claim, plus the SC-006 document check, on eligius 4.2.0. Every probe that observes operationData does so through the probe host module (FR-010 harness), never through a hand-written JSON config. Claims 13 and 15 run real playback under fake timers (FR-010a, SC-022).
- **SC-006 (document agrees)**: `mcp-runtime-claims.spec.ts` declares its 15 titles in one module-level `CLAIMS` array, used both for the 15 `test(title, …)` calls and for a 16th test. That test reads `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` and asserts that every title appears in it verbatim: **15 of 15**, checked on every run.
  - Every disagreement a probe found is listed in `compliance.md` with the corrected sentence. Probes failing at phase end = **0**.
  - For FR-011a, `compliance.md` has a table of every runtime claim in the document (line, sentence, status `probed: <title>` or `not probed (Phase 0)`). `grep -c '(not probed, Phase 0)' examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` equals the number of `not probed` rows. Line 1 no longer reads `verified from source` alone.
- **SC-007 (versions)**: Under the preconditions above, the FR-016 tests pass. `--version` equals the `version` read at test time from `packages/cli/package.json`. `dist/cli.mjs` contains no `__ELIGIAN_VERSION__` / `__ELIGIUS_VERSION__` and contains the JSON-stringified versions read at test time from `packages/cli/package.json` and the resolved `eligius/package.json`. No version literal is written in the test. `grep -nE "'0\.0\.1'|'1\.1\.4'"` over `compiler/pipeline.ts`, `compiler/index.ts` and `compiler/ast-transformer.ts` → **0** lines. `grep -n readPackageVersion packages/cli/src/main.ts` → **0** lines.
- **SC-007a (development fallback, FR-015)**: a vitest in `packages/language/src/compiler/__tests__/` asserts that `getCompilerVersion()` and `VERSION` equal the plan's documented development value when no `define` is set. After `pnpm -C packages/extension build` (exit 0) and `pnpm -C packages/language build`, `grep -rhoE --include='*.js' --include='*.cjs' --include='*.mjs' '.{0,11}__ELIGI(AN|US)_VERSION__' packages/extension/out packages/language/dist | grep -vcE '(typeof |"string" ?\? ?)__ELIGI(AN|US)_VERSION__$'` → **0**: every remaining reference is the `typeof` guard or its guarded consequent; source maps are excluded (amended 2026-11-04 to the plan's command, the original 7-character window also matched the guarded consequent and the source maps).
- **SC-008 (no static heavy imports)**: The FR-019 assertions in `package-bin.spec.ts` pass, with 0 skipped (apart from the FR-020a initialize test), against **both** builds:
  - after `pnpm -C packages/cli build` (non-minified; baseline 4 static matches);
  - again after `pnpm -C packages/cli build:prod` (minified, what `prepack` publishes).

  For each, the two FR-019 static-import patterns match **0** times, and `import("jsdom")` and `import("esbuild")` each match at least once. Both vitest summaries are quoted in `compliance.md`. Run `pnpm -C packages/cli build` again afterwards so `dist` is the development build.
- **SC-009 (startup)**:
  - **Linux**: the FR-020 timing test in `package-bin.spec.ts` passes in CI (`ubuntu-latest`, `ci.yml:28`; every workflow runs on `ubuntu-latest`, there is no Windows runner), median under **3,000 ms**. `ci.yml` runs on pull requests to `main` only, so this half is verified by the phase's PR run; until that run it is recorded as pending in `compliance.md` (amended 2026-11-04).
  - **Windows**: a local measurement on the development machine, after `pnpm build`, with no other test run in progress, using exactly this command from the repo root:
    `node -e "const{spawnSync}=require('node:child_process');const t=[];for(let i=0;i<6;i++){const s=performance.now();spawnSync(process.execPath,['packages/cli/bin/cli.js','--version']);t.push(performance.now()-s)}t.shift();t.sort((a,b)=>a-b);console.log(t.map(Math.round).join(' '),'median',Math.round(t[2]))"`
    It prints the 5 measured values and the median of the 5 after one warm-up. The median MUST be under 3,000 ms and MUST NOT exceed the before maximum (1,109 ms, dev machine, 2026-11-04). `compliance.md` quotes the output and the FR-020 test's printed values.
- **SC-010 (no behaviour change)**: `pnpm -C packages/cli test` passes, including `smoke.spec.ts`, `dev-server.spec.ts`, `dev-client.spec.ts`, `host-module.spec.ts`, `bundler/**` and `cli.spec.ts`, with no test deleted or skipped that was not skipped before.
- **SC-011 (spec sections)**: For each of §4.2, §5.9, §8.1.1, §11.2, §11.3, §11.4 and §12.1, every Eligian snippet passes `eligian check` (exit 0). Each JSON block is compared with `eligian compile` output for its snippet as follows:
  - Normalise both sides: recursively replace the value of every `id` key with `"<id>"`. Then replace every string that equals an original `id` value elsewhere in the same document with `"<id>"`, which covers `requestAction` / `startAction` references to generated ids.
  - The normalised block MUST equal either the whole normalised output or the subtree at a JSON path that the section names next to the block (for example `timelines[0].timelineActions[0]`). **0** differences.

  For FR-026 the controller sets MUST be identical, compared with `diff <(sed -n '/^### 8\.1\.1/,/^### 8\.2/p' LANGUAGE_SPEC.md | grep -oE '\b[A-Z][A-Za-z]+Controller\b' | sort -u) <(grep -oE '"name": "[A-Za-z]+Controller"' packages/language/src/completion/metadata/controllers.generated.ts | grep -oE '[A-Za-z]+Controller' | sort -u)` → empty (9 controllers). In addition, `sed -n '/^### 8\.1\.1/,/^### 8\.2/p' LANGUAGE_SPEC.md | grep -ci 'do-not-use\|do not use'` ≥ 1, on the RoutingController entry.

  The commands and outputs are recorded in `compliance.md` by a reviewer other than the implementer (roadmap exit: "a reviewer reads the fixed spec sections against a compiled probe").
- **SC-012 (demo)**: In `examples/README.md`, the `demo.eligian` entry (the paragraph or list item that links `demo.eligian`) contains all three of: "feature inventory, not idiom"; the word "excluded" together with "MCP" and "evals"; and `--max-warnings 0`. Checked with `grep -n -A6 '\[demo.eligian\]' examples/README.md`, output quoted. `git diff --stat examples/demo.eligian` → empty.
- **SC-013 (CLI coverage gate)**: `pnpm -C packages/cli test:coverage:ci` exits 0 and prints the coverage table. `vitest.config.ts` holds `coverage.include` = `['src/**/*.ts']` with the exclusions of FR-031, and four thresholds equal to the floored pre-change baseline measured with that include; the baseline run's summary is quoted in `compliance.md`. A scratch check (a new untested file under `packages/cli/src/` lowers the reported total; the file is then removed) is quoted too, showing that an untested module counts as 0%. The language package `test:coverage:ci` passes at ≥ lines 79.8 / functions 80 / branches 69.9 / statements 79.
- **SC-014 (docs drift)**: Each command returns **0** lines:
  - `grep -n "11\.9" AGENTS.md`
  - ``grep -n 'dist/cli.mjs` (the no-op bundle)' packages/cli/AGENTS.md``
  - ``grep -n '`index.ts` — package exports' packages/cli/AGENTS.md`` (the current text at `packages/cli/AGENTS.md:27`; the `bundler/` list's `index.ts` at line 29 is legitimate and not matched)

  `test -e packages/cli/src/index.ts` is false. Every `KNOWN_ISSUES.md` entry has a dated status line, and B1b is marked resolved.
- **SC-015 (exit gates)**: `pnpm run check:examples` (exit 0, `0 errors, 0 warnings`), `pnpm run smoke:examples` (exit 0), `pnpm run fmt:examples` (exit 0), `pnpm build`, `pnpm typecheck`, `pnpm check` (0 errors / 0 warnings), `pnpm test` and `pnpm effect:check` (0 errors / 0 warnings) all green, with the summary lines quoted in `compliance.md`.
- **SC-016 (no diagnostic drift, FR-005/FR-006/FR-009)**:
  - **Snapshot.** **Before any source change**, a script runs `checkFiles` sequentially over SC-001 sets (a)+(b). It saves every diagnostic **without** `code` (file relative to the repo root, severity, message, line, column, endLine, endColumn), sorted, to `specs/058-mcp-server/phase-0-foundation/baseline/diagnostics-before.json`. After the phase the same script writes `diagnostics-after.json`, and `diff` of the two is **empty**, except the entries FR-004a and FR-004b allow (the stripped Typir prefix; the removed duplicate diagnostic). Those are listed one per line in `compliance.md`.
  - **Unit test** on `DocumentValidator.validateDocument` output (language package). It asserts that:
    - a parse error has `code === 'syntax-error'` **and** `data.code === 'parsing-error'`;
    - a lexer error has `code === 'syntax-error'` and `data.code === 'lexing-error'`;
    - a linking diagnostic has `code === 'unresolved-reference'` and keeps `data.code === 'linking-error'` with `containerType`, `property` and `refText`;
    - an unknown `OperationCall.operationName` yields **no** linking diagnostic.
- **SC-017 (Q13 deliverable, FR-004a, FR-004b, FR-009a)**:
  - SC-004(ii) asserts that no diagnostic message starts with `While validating the AstNode` and that a `video` timeline without `from` yields exactly **1** diagnostic.
  - A language-package unit test asserts, over the SC-001 set (c), that no message of any diagnostic starts with `While validating the AstNode`, and that Typir-core and Eligian-rule diagnostics both lose the prefix with code, severity and range unchanged.
  - `grep -n "requires a source file\|does not use a source file" packages/language/src/type-system-typir/validation/timeline-validation.ts` → **0** lines.
  - `grep -n "While validating the AstNode" packages/cli/KNOWN_ISSUES.md` ≥ 1 line, in an entry marked **resolved** with the date and command, and a second entry (or the same one) records the duplicate video-`from` diagnostic as resolved.
- **SC-018 (initialize measurement, FR-020a)**: `package-bin.spec.ts` contains the initialize test with a `3000` budget and a `skipIf` derived from the absence of `mcp` in `bin/cli.js --help`. The vitest summary shows it as the **only** skipped test. A scratch check (a stub `mcp` subcommand answering `initialize`, not committed) shows the test then runs and passes, so Phase 1 needs no edit to it.
- **SC-019 (registry shape and export, FR-001, FR-001a)**: A spec in `packages/language/src/__tests__/` asserts that every registry entry has exactly the keys `code` and `source`, that `source` is one of the five allowed values, that codes are unique, and that the sources of `syntax-error`, `unresolved-reference` and `type-mismatch` and of the five compile-error codes are `parser`, `linker`, `type` and `compiler`. `check-codes.spec.ts` (against `dist/index.cjs`) asserts that `require('@eligian/language')` exposes the registry and that every code it prints in SC-004 is a registry code. Entries without a summary field = all.
- **SC-020 (derivable codes, FR-002a)**: The FR-002a test passes: every derivable value of the computed and constant-held codes is a registry member, with the values enumerated from the source modules.
- **SC-021 (roadmap metric names, FR-002b)**: In `specs/058-mcp-server/roadmap.md`, `grep -n "unknown-operation" specs/058-mcp-server/roadmap.md` → **0** lines, `grep -n "unknown_operation"` → at least the two metric lines (§1 "Teaching happened", §6.4), output quoted in `compliance.md`. `git diff` of the roadmap shows only those name changes. `grep -rn --exclude-dir=__tests__ "unknown-operation" packages/language/src` → **0** lines (no alias in the registry; tests may name the rejected spelling in a negative assertion or a test title, amended 2026-11-04).
- **SC-022 (real playback for claims 13 and 15, FR-010a)**: In `mcp-runtime-claims.spec.ts`, the tests of claims 13 and 15 call `vi.useFakeTimers` with `requestAnimationFrame` in `toFake`, start the engine and advance the fake clock, and restore real timers; no other claim test uses fake timers. A scratch mutation (claim 15's expectation reversed, then restored) fails the test, showing that it observes the first frame.

## Edge cases

- **Windows and Linux paths.**
  - The eligius version file MUST be found by package resolution, `createRequire(import.meta.url).resolve('eligius/package.json')` (FR-013), never by a hand-built `/`-joined path.
  - Fixture paths in SC-001 are passed to `checkFiles`, which calls `path.resolve` (`check.ts:69`); assertions MUST compare resolved paths, not literal strings.
  - The `--version` timing test spawns `node` directly (no `shell: true`), so Windows shell startup does not count against the budget. The `npm pack` test keeps its existing `shell: process.platform === 'win32'` (`package-bin.spec.ts:78`).
- **Shared Langium services.** `checkFiles` mutates `Settings.selectorNotInLayout` on the singleton (`check.ts:73-82`) and adds and deletes documents in the shared `LangiumDocuments` (`check.ts:162-164, 223`). The SC-001 spec MUST await each call before the next (no `Promise.all`); concurrent calls produce spurious diagnostics (roadmap §2 "Concurrency model"). FR-004/FR-005 changes in `EligianDocumentValidator` affect the IDE too: the extension runs the same validator, and its tests must stay green.
- **Duplicate diagnostics.** A `video` timeline without `from` reports one diagnostic, from `timeline-validator.ts:84`; the Typir duplicate is removed (FR-004a). SC-001 counts exactly one.
- **Typir message prefix.** `"While validating the AstNode '…', this error is found: "` comes from Typir's printer (`typir@0.3.3 lib/services/printing.js:99-104`), **not** from a throwing validator. This answers roadmap open question 13's hypothesis. FR-004b strips it.
- **stdout purity.** No change in this phase may add stdout output on the CLI's code paths. Langium logs validator exceptions with `console.error` (`validation-registry.js:85-88`), which goes to stderr. Phase 1's global redirect still relies on this. The lazy imports MUST NOT print.
- **jsdom globals.** After FR-017 jsdom loads on first use, but the window is still process-global and permanent. The runtime-claims spec MUST NOT share a file with tests that assume a pristine `globalThis`. Vitest's per-file isolation is relied on.
- **Missing files.** A nonexistent entry path yields a coded "Cannot read file" diagnostic (FR-008). If `eligius/package.json` cannot be resolved at build time, `esbuild.mjs` MUST fail the build with an error rather than inject a fallback.
- **Stale builds and caches.**
  - `package-bin.spec.ts` skips its bundle assertions when `dist/cli.mjs` or `LICENSE` is absent (`package-bin.spec.ts:26`). The new FR-016/FR-019/FR-020 assertions inherit that skip, so they are meaningful only after a build. The Success-criteria preconditions (build first, 0 skipped) close this gap. CI builds before testing (`ci.yml:60` before `:92`).
  - `node esbuild.mjs --watch` reads the versions once at start; a version bump during a watch needs a restart.
  - `dist/cli.mjs` from an older build, or a minified `build:prod` bundle left by `pnpm pack`, MUST NOT satisfy SC-008. SC-008 rebuilds both variants itself.
- **Cold start.** The first run after a build includes disk-cache warm-up, so FR-020 discards one warm-up spawn and asserts the median of 5. Measurement noise between runners and the parallel load of the other CLI suites are why the threshold is the §2 budget (3 s), not the local measurement.
- **eligius bumps.** A dependabot bump that changes a claimed behaviour MUST fail `mcp-runtime-claims.spec.ts`; that is the purpose of the spec (roadmap §8 risk "Curriculum semantics drift").
- **CLI coverage of child processes.** Many CLI specs spawn `bin/cli.js`, and V8 coverage does not follow them, so the baseline is low by construction. The gate's purpose is non-regression and covering new MCP modules (§8 decision 8), not a target value.

## Existing components (verified)

| Component | File | What Phase 0 reuses or changes | Real signature (typegraph `ts_module_exports`, 2026-11-04) |
| --- | --- | --- | --- |
| `checkFiles` | `packages/language/src/compiler/pipeline/check.ts:66` | the 100%-coded test drives it; `compileDiagnostic` and the unreadable-file diagnostic get codes | `(filePaths: readonly string[], options?: CheckOptions) => Effect<readonly CheckFileResult[], never, never>` |
| `CheckDiagnostic` | `check.ts:31` | `code` becomes always set (optionally required) | `{ file, severity: CheckSeverity, message, line, column, endLine, endColumn, code?: string }` |
| `diagnosticCode` (local) | `check.ts:233` | already reads `code ?? data.code`; no change needed | `(diagnostic: { code?: unknown; data?: unknown }) => string \| undefined` |
| `compileDiagnostic` (local) | `check.ts:107` | adds a code from `_tag`/`kind` | `(file: string, error: { message: string; location?: CompileLocation }) => CheckDiagnostic` |
| `EligianDocumentValidator` | `packages/language/src/eligian-document-validator.ts:13` | `processLinkingErrors` keeps Langium `data` and adds `unresolved-reference`; Typir / parser / exception codes per FR-004…FR-007 | `class extends DefaultDocumentValidator` (langium 4.2.4) |
| `DefaultDocumentValidator` | `langium@4.2.4 lib/validation/document-validator.js` | `toDiagnostic(severity, message, info)` copies `info.code` and `info.data` (lines 208-219); `LexingError='lexing-error'`, `ParsingError='parsing-error'`, `LinkingError='linking-error'` (281-286) | library |
| `DefaultLangiumTypirValidator.report` | `typir-langium@0.3.3 lib/features/langium-validation.js:30` | origin of uncoded Typir diagnostics | library |
| Eligian Typir rules | `packages/language/src/type-system-typir/validation/{constant,control-flow,event,import,label-id,languages,timeline}-validation.ts` | 21 `accept({…})` sites in 6 files get rule-specific `code` properties (FR-004), 2 of them (timeline Rule 1) are removed (FR-004a); `label-id-validation.ts` has no `accept` | n/a |
| Typir problem properties | `typir-langium@0.3.3 lib/typir-langium.d.ts:19` | `ValidationMessageProperties` includes `Omit<DiagnosticInfo<AstNode>, 'node' \| 'property' \| 'index'>`, so a rule may pass `code`; `report` spreads it into Langium's info | library type |
| `ValidationRegistry.register` / `handleException` | `langium@4.2.4 lib/validation/validation-registry.js:44, 77` | FR-007 unit test registers a throwing check | `register(checksRecord, thisObj = this, category = 'fast')` |
| `operation-dataflow` end-block walk | `packages/language/src/dataflow/operation-dataflow.ts:237-238, 503-506` | why claim 1 needs a host operation (end block walked from `fresh()`, `missing-dependency`) | n/a |
| Host operation signatures | `packages/language/src/compiler/operations/host-operations.ts:81-82` | `dependencies: []`, `outputs: []`: probe host operations pass the dataflow check | n/a |
| CLI-layer codes | `packages/cli/src/check/check-command.ts:162` (`compile-failed`), `packages/cli/src/check/lint.ts:29` (`eligius-${finding.rule}`) | stay outside the registry (FR-009) | n/a |
| Timeline / action / other validators | `validators/timeline-validator.ts`, `action-validator.ts`, `operation-call/operation-existence-validator.ts`, `program/asset-import-validator.ts`, `program/structure-validator.ts` | the 16 uncoded `accept` sites (FR-003) | n/a |
| Compile errors | `packages/language/src/errors/compiler-errors.ts` | `_tag` (`ParseError`, `ValidationError`, `TypeError`, `TransformError`, `EmitError`) and `kind` feed FR-008 | `CompileError = ParseError \| ValidationError \| TransformError \| TypeError \| EmitError` (`pipeline.ts:166`) |
| `getCompilerVersion` | `packages/language/src/compiler/pipeline.ts:371` | returns injected values | `() => { compiler: string; eligius: string }` |
| `VERSION` | `packages/language/src/compiler/index.ts:151` | injected value | `"0.0.1"` (literal type today) |
| IR `metadata.compilerVersion` | `packages/language/src/compiler/ast-transformer.ts:325`; type `compiler/types/eligius-ir.ts:332` | injected value | `readonly compilerVersion: string` |
| `compileWithMap` | `compiler/pipeline.ts:264` | probes in `mcp-runtime-claims.spec.ts` | `(source: string, options?: CompileOptions) => Effect<{ config: IEngineConfiguration; map: EligianMap; host?: HostModule }, CompileError, never>` |
| `smokeWindow`, `loadEligius`, `stubMissingBrowserApis` | `packages/cli/src/smoke/dom-environment.ts:19, 35, 48` | jsdom made lazy; probes reuse the window and eligius loader | `smokeWindow: () => Window & typeof globalThis`; `loadEligius: () => Promise<typeof import('eligius')>`; `stubMissingBrowserApis: (window) => void` |
| `smokeConfig` | `packages/cli/src/smoke/smoke-runner.ts:75` | caller of `smokeWindow` (line 81) adapted to async | `(config: IEngineConfiguration, map: EligianMap, options?: SmokeOptions) => Promise<SmokeResult>` |
| `loadHostModule` | `packages/cli/src/dev/host-module.ts:22` | esbuild made lazy | `(host: HostModule) => Promise<{ registrations: HostRegistrations; missing: string[] }>` |
| bundler esbuild users | `packages/cli/src/bundler/css-processor.ts:12` (`esbuild.transform`, line 34), `runtime-bundler.ts:13` (`esbuild.build`, line 298) | esbuild made lazy | n/a |
| CLI build | `packages/cli/esbuild.mjs` | gains `define` for the two versions; `WORKSPACE_SOURCES` (line 27) and `external` from `dependencies` (line 85) unchanged | script |
| `readPackageVersion` / `packageVersion` | `packages/cli/src/main.ts:41-51` | the CLI's `--version` source today (runtime read of `package.json`); MUST be replaced by the injected constant (FR-016 (i)) | `() => Promise<string>` |
| `package-bin.spec.ts` | `packages/cli/src/__tests__/package-bin.spec.ts` | gains the no-static-heavy-import assertion, the `--version` timing and the version test; existing bundle-import and `npm pack` assertions unchanged | test |
| Example gates | root `package.json:24-26` (`fmt:examples`, `check:examples`, `smoke:examples`) | exit gates | scripts |
| Language coverage gate | `packages/language/vitest.config.ts:74-79` | must not regress | config |
| Runtime model doc | `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` (273 lines; §2 l.47, §5 l.114, §6 l.133, §7 l.158, rules l.229) | claims re-verified and corrected | doc |

## New components

| Module | Package | File path | Public API sketch |
| --- | --- | --- | --- |
| Diagnostic code registry | `@eligian/language` | `packages/language/src/validators/codes.ts` | `export type DiagnosticSource = 'parser' | 'validator' | 'type' | 'linker' | 'compiler';` · `export const DIAGNOSTIC_CODES = { … } as const;` (entries `{ code, source }`, no summaries) · `export type DiagnosticCode = …;` · `export const ALL_DIAGNOSTICS: readonly { code: DiagnosticCode; source: DiagnosticSource }[];` · `export function isDiagnosticCode(s: string): s is DiagnosticCode;` · all re-exported from the `@eligian/language` root (FR-001a); names are a sketch, the plan fixes them |
| Build-time version constants | `@eligian/language` (read) / `eligian` CLI (defined) | a small module under `packages/language/src/compiler/` (name per plan) + `define` entries in `packages/cli/esbuild.mjs` | `declare const __ELIGIAN_VERSION__: string \| undefined; declare const __ELIGIUS_VERSION__: string \| undefined;` → `export const ELIGIAN_VERSION: string; export const ELIGIUS_VERSION: string;` (typeof-guarded fallback, FR-015) |
| Coded-diagnostics spec + fixtures | `@eligian/language` (tests) | `packages/language/src/__tests__/diagnostic-codes.spec.ts`, `packages/language/src/__tests__/__fixtures__/diagnostic-codes/*.eligian` | test only (SC-001, SC-003) |
| Runtime-claims spec | `eligian` CLI (tests) | `packages/cli/src/__tests__/mcp-runtime-claims.spec.ts`, probe host module `packages/cli/src/__tests__/__fixtures__/runtime-claims/probe-host.ts` (+ layout fixtures as needed) | test only (SC-005, SC-006) |
| CLI check-codes spec | `eligian` CLI (tests) | `packages/cli/src/__tests__/check-codes.spec.ts` + its probe fixtures | test only (SC-004) |
| Diagnostic baseline | spec artefact | `specs/058-mcp-server/phase-0-foundation/baseline/diagnostics-{before,after}.json`, `baseline/emittable-codes-before.json` | data (SC-016, SC-003) |
| CLI coverage config | `eligian` CLI | `packages/cli/vitest.config.ts` (`test.coverage`), `packages/cli/package.json` (`test:coverage:ci`) | config |
| `LANGUAGE_SPEC.md` §11.4 | docs | `LANGUAGE_SPEC.md` | doc section "Erased parameters" |

## Differences between the roadmap and the code (found while verifying)

1. **Uncoded sites: 16, not 9, plus 21 in the Typir rules.** The roadmap counted only `timeline-validator` (7) and `action-validator` (2). Seven more sites exist in three other validator files (FR-003). The 21 `accept({…})` sites in `type-system-typir/validation/**` set no code either (FR-004; SC-002 scan baseline 39 including the 2 data-variable sites).
2. **Parser errors already carry a code.** It is Langium's `data.code: 'parsing-error'`; `eligian check` printed `"code": "parsing-error"` on 2026-11-04. Langium's `stopAfterParsingErrors` logic depends on that value, so `syntax-error` is added as the top-level `code` and `data.code` is kept (FR-006).
3. **Linker errors lost their code in Eligian's override.** `EligianDocumentValidator.processLinkingErrors` drops Langium's `data` (FR-005).
4. **Roadmap Q13 is answered.** The "While validating the AstNode …" wrapper is Typir's `printValidationProblem`, not a throwing validator. The video-without-`from` case is a duplicate rule: validator `timeline-validator.ts:84` plus Typir `timeline-validation.ts:72`.
5. **A third hard-coded compiler version** is at `ast-transformer.ts:325` (FR-014).
6. **`bundler/css-processor.ts:12` also imports esbuild statically.** It is covered by the roadmap's `bundler\*` (FR-018).
7. **`--version` cold start measured 1.08–1.11 s here**, against the roadmap's 1.9–2.1 s. The 3 s budget is unaffected.
8. **The CLI tests resolve `@eligian/language` to the language package's built `dist/index.cjs`** (`package.json` `exports`), not to source. Anything the CLI tests observe about injected versions must go through the built CLI bundle (FR-016).

## Appendix A: uncoded-`accept` scan (SC-002)

Save as a scratch file, not in the repo, and run from the repo root as `node <file> .`. It walks `validators/**` (skipping `__tests__`), `type-system-typir/validation/**` and `eligian-validator.ts`. It blanks comments, extracts each `accept(` call's balanced argument list, blanks string contents, and reports calls with no `code` property key. Output on 2026-11-04: 39 lines plus `uncoded accept sites: 39`.

```js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = process.argv[2] ?? '.';
const L = 'packages/language/src';
const files = [];
const walk = d => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p); }
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
  }
};
walk(join(root, L, 'validators'));
walk(join(root, L, 'type-system-typir/validation'));
files.push(join(root, L, 'eligian-validator.ts'));
let n = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  for (const m of src.matchAll(/\baccept\s*\(/g)) {
    let i = m.index + m[0].length, depth = 1, q = null;
    for (; i < src.length && depth; i++) {
      const c = src[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; }
      else if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const call = src.slice(m.index, i).replace(/(['"`])(?:\\.|(?!\1)[^\\])*?\1/g, "''");
    if (!/[{,]\s*code\s*[:,}]/.test(call)) {
      n++;
      console.log(`${relative(root, f).replace(/\\/g, '/')}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
}
console.log(`uncoded accept sites: ${n}`);
```

## Review notes

- **Typir rule codes, "distinct per site" (testability review, FR-004/SC-002).** Partly adopted. The review asked that every Typir rule site emit a distinct code. Several sites of one rule report the same condition from different branches; forcing distinct codes there would invent codes with no meaning to a fix. FR-004 therefore requires codes that are distinct per **condition**: sites reporting different conditions MUST NOT share a code. It also forbids `type-mismatch` at any rule site and requires an exact expected code per fixture (SC-001(c)), so a blanket code still fails.
- **Typir site count.** The review counted 22 sites including a commented-out one (`control-flow-validation.ts:106`) and omitted `languages-validation.ts:74`. The Appendix A scan (comments blanked) finds 21 live sites, 74 included. The baseline is 39 = 16 + 21 + 2 data-variable sites, not "16 + 22".
- **Compile-only fixture (FR-008).** Dropped from SC-001(c), as the review allowed: no fixture is known to reach `compileDiagnostic` through `checkFiles`. The FR-008 table test covers the mapping.
- **CLI-scope of codes.** The review offered two options; the spec takes the first. The registry covers `checkFiles`. `compile-failed` and `eligius-<rule>` stay CLI-layer codes until Phase 1's catalogue, because adding an open `eligius-` prefix family to a closed registry would break FR-001's "runtime-enumerable".

## Clarifications

### Session 2026-11-04

- Q1 Which codes form the "existing codes" baseline, and how are computed codes handled? → Baseline = every code emittable today, enumerated from source (literals outside `generated/` and `__tests__`, constant-held codes, lowercased `OperationValidationError` codes, verbatim `validation-errors.ts` pass-through codes); FR-002 and SC-003 re-baselined on that enumeration; computed sites keep their derivation; a test asserts every derivable value is a registry member. [FR-002, FR-002a, SC-003, SC-020]
- Q2 Fix or document the Typir-wrapped and duplicated diagnostics (roadmap Q13)? → Fix: strip the Typir `While validating the AstNode …` prefix for all Typir diagnostics in `EligianDocumentValidator`, remove the duplicate Typir source-file rules from `timeline-validation.ts`, record both in KNOWN_ISSUES as resolved. (The "does not use a source file" warning has no validator counterpart, so it moves into `timeline-validator.ts` to stay reported once.) [FR-004a, FR-004b, FR-009a, SC-001, SC-016, SC-017]
- Q3 How fine-grained are the codes `compileDiagnostic` derives? → One code per `CompileError` `_tag` (5 codes); `kind` ignored for the code (may stay in `data`). [FR-008, SC-001]
- Q4 Which name is canonical, `unknown-operation` or `unknown_operation`? → `unknown_operation` stays verbatim; this phase corrects the roadmap's metric names (§1 "Teaching happened", §6.4). [FR-002b, SC-021]
- Q5 What does a registry entry carry, and where is it exported? → Entries `{ code, source }` with source in parser | validator | type | linker | compiler, exported from the `@eligian/language` root (reachable through `dist/index.cjs`); no summaries in this phase. [FR-001, FR-001a, SC-019]
- Q6 What file scope does the CLI coverage gate measure? → `coverage.include = ['src/**/*.ts']` minus `__tests__`, `*.d.ts` and browser-only client files, so an untested new module counts as 0% and fails the gate; thresholds at the baseline measured with that include. [FR-031, SC-013]
- Q7 How is the `mcp` initialize time handled before `mcp` exists? → Phase 0 adds the initialize timing test to `package-bin.spec.ts`, guarded by `skipIf` (no `mcp` subcommand), 3,000 ms budget; Phase 1 enables it by adding the subcommand. [FR-020a, SC-018]
- Q8 How do probes advance the position? → Claims 13 and 15 run real playback under vitest fake timers (`toFake` including `requestAnimationFrame`) on a short raf timeline; every other probe uses `seek`, as smoke does. [FR-010, FR-010a, SC-005, SC-022]
