# Implementation Plan: MCP server, Phase 0: Foundation

**Branch**: `feat/mcp-server-roadmap` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/058-mcp-server/phase-0-foundation/spec.md` (clarifications Q1–Q8 encoded), roadmap §2, §3.2, §3.3 C, §7 Phase 0, §8.

Every signature quoted below was read this session with typegraph (`ts_module_exports`, `ts_references`) or from the installed library files (`langium@4.2.4`, `typir@0.3.3`, `typir-langium@0.3.3`, `eligius@4.2.0`, `esbuild`). File:line references are to the tree at `1e2e750`.

## Summary

Phase 0 builds no server. It makes the facts the Phase 1 server repeats true and checkable:

1. **Codes** – a runtime registry `packages/language/src/validators/codes.ts`; every `accept` site, the Typir rule sites, Typir core, Langium lexer/parser/linker diagnostics, validator exceptions, `compileDiagnostic` and the "Cannot read file" diagnostic carry a registry code. The duplicate Typir source-file rule is removed and Typir's message prefix is stripped (roadmap Q13 fixed).
2. **Runtime claims** – `packages/cli/src/__tests__/mcp-runtime-claims.spec.ts`: 15 probes on the installed eligius in jsdom through a probe host module, plus a document-agreement test; `ELIGIUS_EXECUTION_MODEL.md` corrected and annotated.
3. **Versions** – one typeof-guarded module in the language package, injected by `esbuild` `define` in the CLI build; `--version` reads it; `readPackageVersion` removed.
4. **Startup** – `jsdom` and `esbuild` loaded with dynamic `import()`; `package-bin.spec.ts` asserts no static heavy import (dev and prod builds), the `--version` median, and a skip-guarded `mcp initialize` timing test.
5. **Docs and gates** – `LANGUAGE_SPEC.md` §4.2/5.9/8.1.1/11.2/11.3/12.1 corrected and §11.4 added; `examples/README.md` labels `demo.eligian`; CLI coverage gate at the measured baseline; `KNOWN_ISSUES.md` / `AGENTS.md` drift fixed; roadmap metric names.

The approach is reuse-only: no new runtime dependency, no new package, no new Effect service. The only new production modules are `validators/codes.ts`, `compiler/version.ts` and `eligian-validation-registry.ts` (a 15-line Langium subclass).

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo); ESM sources, language `dist/index.cjs` (CJS, `packages/language/esbuild.mjs:33-37`), CLI `dist/cli.mjs` (ESM, `packages/cli/esbuild.mjs:75-90`) |
| Dependencies (all present) | `langium` 4.2.4, `typir`/`typir-langium` 0.3.3, `effect` 4.0.7, `eligius` 4.2.0, `jsdom` 30.1.3, `esbuild` 0.28.2, `vitest` 5.0.5 + `@vitest/coverage-v8` 5.0.5 (root devDependency, `package.json:41`) |
| Testing | Vitest per package; CLI tests resolve `@eligian/language` to `dist/index.cjs` (`packages/language/package.json` `exports["."].default`) |
| Platforms | Windows (dev machine), `ubuntu-latest` (CI, `ci.yml`) |
| Performance | `node bin/cli.js --version` median < 3,000 ms (§2 budget; dev machine before: 1,075–1,109 ms) |
| Constraints | stdout purity on CLI paths (nothing new printed); language coverage ≥ 79.8 / 80 / 69.9 / 79; Effect diagnostics 0/0 |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. No new services or layers. The registry is one `as const` object plus a typed identity helper. Version injection is two `define` entries plus one guarded module. |
| II / V / XX / XXV Testing, TDD | Pass. Each FR gets a failing test first (order in "Sequencing"). `specs/TESTING_GUIDE.md` is read before writing tests. Tests that validate documents use `createTestContext()` / `getErrors()`. |
| III / XVII Effect | Pass. The touched Effect code is `check.ts` (`Effect.promise`) and `bundler/runtime-bundler.ts` (`Effect.tryPromise`). There are no new Effect code paths, tagged errors are unchanged, and `pnpm effect:check` is a gate. |
| IV Clear errors | Pass. Typir messages lose the `While validating …` prefix; codes are added; nothing else is reworded. |
| VIII pnpm | Pass. pnpm only. |
| IX Langium | Pass. No grammar change, no generated file edited. |
| XII No premature docs | Pass. The only docs touched are those the spec requires (LANGUAGE_SPEC, execution model, `examples/README.md`, KNOWN_ISSUES, the two AGENTS.md files, the roadmap metric names). No CHANGELOG or CLI README edit. |
| XIV Windows paths | Pass. `eligius/package.json` is found by package resolution, paths are compared after `path.resolve`, and `spawnSync(process.execPath, …)` runs without a shell. |
| XV / XVI Research context | Pass. eligius and typir are imported only from the installed packages. `quirks.spec.ts` in the sibling checkout is a read-only reference. |
| XXII Sed safety | Pass. Edits by string match only. |

No violations, so the Complexity tracking table is empty.

## Corrections to the spec found while planning

All of these were checked this session. The plan follows the code, and `compliance.md` records each correction.

1. **`returnUndefined` needs parentheses.** The grammar rule is `HostOperation: 'operation' name=ActionName '(' … ')'` (`eligian.langium:171-172`). The probe header is therefore `extensions "./probe-host.ts" { operation recordBag(label: string, value) operation returnUndefined() }`. `value` stays untyped: `HostParameter: name=Identifier (optional?='?')? (':' type=TypeAnnotation)?` (`:181-182`).
2. **`compileWithMap`'s `host.path` is relative.** `HostModule.path` is "the import path as written" (`host-operations.ts:107-109`, set at `:121`). `loadHostModule` passes `host.path` to `esbuild.build({ entryPoints: [host.path] })` (`host-module.ts:29-30`). The harness therefore resolves it as `compileFile` does (`compile-file.ts:333-336`: `path.resolve(path.dirname(absoluteInputPath), declared.path)`) and sets `map.source` as `compile-file.ts:342` does.
3. **The linking-error range must stay as it is.** Langium's default `processLinkingErrors` passes `range: reference.$refNode?.range` (`document-validator.js:118-131`). Eligian's override passes only `node/property/index` (`eligian-document-validator.ts:42-46`). Adding `range` would move diagnostics and break SC-016, so the override adds only `data` and `code`.
4. **Typir's prefix depends on severity.** `printValidationProblem` prints `` `While validating ${node}, this ${problem.severity} is found: ${problem.message}` `` (`typir@0.3.3 lib/services/printing.js:99-104`), so warnings read `this warning is found:`. The strip handles every severity.
5. **SC-007a's grep cannot be satisfied as written** (open question 1). Built without `define`, esbuild keeps a non-`typeof` reference in the guarded read: `var ELIGIAN_VERSION = typeof __ELIGIAN_VERSION__ === "string" ? __ELIGIAN_VERSION__ : DEVELOPMENT_VERSION;` (scratch esbuild run, this session). In addition, the source maps in `packages/language/dist` and `packages/extension/out` carry the `declare const` line in `sourcesContent`. The plan uses the amended command in the "SC-007a check" section below.
6. **Typir rule codes cannot reuse validator codes.** FR-001a gives each code one `source`, and every Typir rule code has source `type`. The Typir `languages` and `import` rules report the same conditions as `languages-validator.ts:38,45,87` (`missing_default_marker`, `multiple_default_markers`, `duplicate_language_code`) and `default-import-validator.ts:54` (`DUPLICATE_DEFAULT_IMPORT`), all of which have source `validator`. The Typir sites therefore get their own `type` codes. Whether both rules fire on one input is out of scope; if the SC-016 snapshot shows a double report, `compliance.md` records it.
7. **`smokeConfig` ends with `engine.stop()`** (`smoke-runner.ts:155-157`), which runs the last timeline's `on leave`. Claims 13 and 14 observe "no `on leave`", and claim 15 observes the first frame, so all three use the hand-driven engine instead of `smokeConfig`.

## Sequencing

Several SCs compare against "before any source change", so the baselines come first:

- **Step 0, before any source edit**:
  - (a) `baseline/emittable-codes-before.json` (FR-002, SC-003);
  - (b) `baseline/diagnostics-before.json` (SC-016);
  - (c) the Appendix A scan (SC-002 baseline, 39);
  - (d) the CLI coverage baseline with the FR-031 include/exclude (SC-013):
    1. change `packages/cli/package.json` `"test:coverage:ci": "vitest run"` (`:48`) to `"vitest run --coverage"`, because without `--coverage` (and with no `enabled: true` in the block) vitest collects nothing;
    2. add the coverage block to `vitest.config.ts` without thresholds;
    3. run `pnpm build` (`package-bin.spec.ts` and the runtime specs skip without `dist`, which would understate the baseline), then `pnpm -C packages/cli test:coverage:ci`;
    4. copy the summary, then set the thresholds to it floored to one decimal.

    These two config edits are the only changes made before the baseline, and they change no source;
  - (e) the SC-009 Windows timing command.

  Each output is quoted in `compliance.md`.
- **Step 1, codes (A)**: tests → registry → sites → document validator → registry subclass → `check.ts`.
- **Step 2, versions (C)** and **Step 3, lazy imports (D)**: independent of each other; both end in `package-bin.spec.ts`.
- **Step 4, runtime claims (B)**: after Step 3, because the harness uses the async `smokeWindow`.
- **Step 5, docs (E, F, H)**; **Step 6, gates (G, I)**.

## Module design

### A. Diagnostic codes (`@eligian/language`)

#### A1. `packages/language/src/validators/codes.ts` (new)

```ts
export type DiagnosticSource = 'parser' | 'validator' | 'type' | 'linker' | 'compiler';

/** Every code an Eligian diagnostic can carry, mapped to the stage that emits it. */
const SOURCES = {
  'syntax-error': 'parser',
  'unresolved-reference': 'linker',
  'type-mismatch': 'type',
  // … every baseline code verbatim (FR-002) and every new code below
} as const satisfies Record<string, DiagnosticSource>;

export type DiagnosticCode = keyof typeof SOURCES;

export interface DiagnosticCodeEntry {
  readonly code: DiagnosticCode;
  readonly source: DiagnosticSource;
}

/** All entries, in declaration order (Phase 1's generated/diagnostics.md reads this). */
export const DIAGNOSTIC_CODES: readonly DiagnosticCodeEntry[];

export function isDiagnosticCode(value: string): value is DiagnosticCode; // Object.hasOwn(SOURCES, value)

/** A registry code at a diagnostic site: the literal is checked against the registry at compile time. */
export function diagnosticCode<const C extends DiagnosticCode>(code: C): C;
```

- **Why a code-keyed object.**
  - Code strings stay greppable: one search finds both the registry entry and every site.
  - There is no second, camelCase name per code, and a typo fails `tsc`.
  - Existing exported constants keep their literal types: `export const MISSING_LABELS_FILE_CODE = diagnosticCode('missing_labels_file')` (`eligian-validator.ts:22`), and likewise `INVALID_SET_DATA_TARGET_CODE` (`set-data-validator.ts:7`). Their consumers compile unchanged: `eligian-code-action-provider.ts`, `css/code-action-helpers.ts`, `css/did-you-mean-fix.ts`, `labels/types.ts`, `label-parameter-validator.ts` and `extension/.../label-file-creator.ts`.
- **Compile-time derivation checks (FR-002a; they complement the runtime test).**
  - `type _Op = Lowercase<OperationValidationError['code']>` (`compiler/operations/validation/errors.ts:21-66`) is asserted to extend `DiagnosticCode` through `const _ops: readonly DiagnosticCode[] = [] as _Op[];`.
  - The code unions of `validators/validation-errors.ts` (`PathError`, `ImportNameError`, `TypeInferenceError`, `DuplicateDefaultImportError`, …) get the same assertion.
  - The imports are type-only, so no import cycle reaches runtime.
- **Export (FR-001a)**: `packages/language/src/index.ts` gains `export { DIAGNOSTIC_CODES, diagnosticCode, isDiagnosticCode, type DiagnosticCode, type DiagnosticCodeEntry, type DiagnosticSource } from './validators/codes.js';`. After `pnpm -C packages/language build` the registry is reachable through `dist/index.cjs`.
- **Population**: the registry starts from `baseline/emittable-codes-before.json` (which holds only codes that reach a diagnostic; see "Enumeration rules"), with every code verbatim and its source set by the FR-001a rule. The registry is exactly that baseline plus the new codes below, and a test checks it. The new codes are:

| Source | New codes (kebab-case, FR-002) | Emitted at |
| --- | --- | --- |
| parser | `syntax-error` | A3 lexer/parser overrides |
| linker | `unresolved-reference` | A3 `processLinkingErrors` |
| type | `type-mismatch` | A3 Typir-core fallback only |
| type | `constant-reserved-name` (constant:62), `constant-cycle` (constant:75), `if-condition-not-boolean` (control-flow:79), `if-empty-then` (:90), `for-collection-not-array` (:138), `for-empty-body` (:149), `event-start-negative` (event:67), `event-duration-relative` (:78), `event-duration-not-positive` (:85), `event-end-not-after-start` (:101), `sequence-item-duration-not-positive` (:132), `stagger-delay-not-positive` (:162), `stagger-duration-not-positive` (:172), `import-duplicate-default` (import:63), `asset-type-conflict` (import:106), `languages-duplicate-code` (languages:74), `languages-missing-default` (:91), `languages-multiple-defaults` (:103), `timeline-empty` (timeline:89) | `type-system-typir/validation/*.ts` (19 sites after FR-004a) |
| validator | `timeline-provider-invalid` (timeline-validator:64), `timeline-source-required` (:84), `timeline-source-unused` (moved warning, FR-004a), `timeline-scroll-duration-required` (:117), `timeline-scroll-selector-not-scroll` (:120), `timeline-duration-relative` (:129), `timeline-duration-not-positive` (:135), `event-ends-after-timeline` (:146), `break-outside-loop` (action-validator:355), `continue-outside-loop` (:369), `operation-in-timeline-event` (operation-existence-validator:80), `unknown-action-in-timeline-event` (:92), `html-import-error` / `css-import-error` / `css-parse-error` / `media-import-error` / `locales-import-error` (asset-import-validator:126,131, by `AssetError['_tag']`, `errors/asset-errors.ts:48,69,83,108,129`), `locales-without-languages` (:255), `locales-parse-failed` (:319), `timeline-required` (structure-validator:20), `validation-exception` (A4) | `validators/**` |
| compiler | `compile-parse-error`, `compile-validation-error`, `compile-type-error`, `compile-transform-error`, `compile-emit-error`, `file-unreadable` | A5 `check.ts` |

#### A2. Site changes (FR-003, FR-004, FR-004a)

- **The 16 FR-003 sites** add `code: diagnosticCode('…')` to their info object. At `asset-import-validator.ts:126,131` the code comes from a total map, `const ASSET_ERROR_CODES: Record<AssetError['_tag'], DiagnosticCode>`, as `code: ASSET_ERROR_CODES[error._tag]`. `tsc` then flags any new asset error tag that has no code.
- **The 19 remaining Typir rule sites** add `code: diagnosticCode('…')` to the problem they `accept`. This works for three reasons:
  - the problem's property type is `TypirSpecifics['ValidationMessageProperties'] & Omit<DiagnosticInfo<AstNode>, 'node'|'property'|'index'>` (`typir-langium@0.3.3 lib/typir-langium.d.ts:19`), so `code` is allowed;
  - `DefaultLangiumTypirValidator.report` spreads the problem into the Langium info (`langium-validation.js:30-37`, `Object.assign({ node, property, index }, problem)`);
  - Langium's `toDiagnostic` copies `info.code` (`document-validator.js:206-216`).
- **FR-004a**:
  - Delete Rule 1 of `type-system-typir/validation/timeline-validation.ts`, the `requiresSource`/`hasSource` block (today `:64-82`).
  - In `validators/timeline-validator.ts`, next to the `:84` check, add `else if (!requiresSource && hasSource) accept('warning', \`Timeline provider '${timeline.provider}' does not use a source file. Remove: from "${timeline.source}"\`, { node: timeline, property: 'source', code: diagnosticCode('timeline-source-unused') })`. The message is the text Typir printed after its prefix.
  - Rule 2 (`timeline-empty`) stays.
- **Existing literal `code: '…'` values** in the FR-001 scope become `diagnosticCode('…')`, with the same string. The scope is:
  - `validators/**`, `eligian-validator.ts` and `type-system-typir/validation/**`;
  - the non-validator modules whose literals the baseline enumeration shows reaching a diagnostic: `css/selector-validation.ts` (`:31,46,59`), `css/selector-sources.ts` (`:92`, `selector_not_in_layout`), `dataflow/operation-dataflow.ts` (`:398,445,476,506,531`; `diagnosticCode('…')` returns the literal type, so it still satisfies `DataflowCode`) and `type-system-typir/validation/label-id-validation.ts`.
  - The authoritative list is not this hand-written one: it is every file named in a `kind: 'literal'` site of `baseline/emittable-codes-before.json`. Any file that the baseline adds beyond the four above is converted too, and `compliance.md` names it.

  Two kinds of site stay as they are:
  - computed codes keep their derivation: `error.code.toLowerCase()` at `operation-existence-validator.ts:44`, `parameter-validator.ts:116,154` and `control-flow-pairing.ts:41`, and the pass-through `error.code` at `import-validator.ts:330,352`;
  - the data-variable sites (`label-parameter-validator.ts:206`, `set-data-validator.ts:52`) are unchanged (SC-002 target 2).

#### A3. `packages/language/src/eligian-document-validator.ts` (changed)

`EligianDocumentValidator extends DefaultDocumentValidator` (langium 4.2.4). The protected hooks this plan uses are confirmed in `document-validator.d.ts:55-63`: `processLexingErrors`, `processParsingErrors`, `processLinkingErrors(document, diagnostics, _options)` and `toDiagnostic<N extends AstNode>(severity, message, info: DiagnosticInfo<N, string>): Diagnostic`.

```ts
protected override processLexingErrors(parseResult: ParseResult, diagnostics: Diagnostic[], options: ValidationOptions): void {
  const from = diagnostics.length;
  super.processLexingErrors(parseResult, diagnostics, options);
  for (let i = from; i < diagnostics.length; i++) diagnostics[i].code = diagnosticCode('syntax-error');
}
// processParsingErrors: same pattern. data.code stays 'lexing-error' / 'parsing-error' (FR-006),
// so stopAfterLexing/ParsingErrors (document-validator.js:27-33) keeps working.

protected override processLinkingErrors(document: LangiumDocument, diagnostics: Diagnostic[], _options: ValidationOptions): void {
  // unchanged skip of OperationCall.operationName (lines 34-38), then:
  diagnostics.push(this.toDiagnostic('error', linkingError.message, {
    node: linkingError.info.container, property: linkingError.info.property, index: linkingError.info.index, // unchanged range
    code: diagnosticCode('unresolved-reference'),
    data: { code: DocumentValidator.LinkingError, containerType: linkingError.info.container.$type,
            property: linkingError.info.property, refText: linkingError.info.reference.$refText }, // as Langium, :120-125
  }));
}

/** Every validateAst acceptor call goes through here (document-validator.js:135-139). */
protected override toDiagnostic<N extends AstNode>(severity: ValidationSeverity, message: string, info: DiagnosticInfo<N, string>): Diagnostic {
  if (!isValidationProblem(info)) return super.toDiagnostic(severity, message, info);   // typir: $problem === 'ValidationProblem'
  return super.toDiagnostic(severity, stripTypirPrefix(message, info), {
    ...info, code: info.code ?? diagnosticCode('type-mismatch'),
  });
}
```

`stripTypirPrefix` is exported from the same file and is pure:

```ts
/** Remove Typir's "While validating <node>, this <severity> is found: " (typir printing.js:99-104); sub-problems kept. */
export function stripTypirPrefix(message: string, problem: { severity: string; message: string }): string;
```

- **What it returns.** If `message` starts with `While validating ` and contains `` `, this ${problem.severity} is found: ${problem.message}` ``, it returns the text from `problem.message` on, which keeps the sub-problems the printer appends. Otherwise it returns `message` unchanged.
- **Why anchor on `problem.message`.** A regex on the prefix would break on a node text that itself contains `", this error is found: "`. Anchoring on the problem's own message avoids that.
- **How Typir diagnostics are recognised.** `isValidationProblem` is imported from `typir` (exported through `lib/index.d.ts:51` → `services/validation.d.ts:23`). It matches Typir-core and Eligian-rule problems alike, because both reach `report` as `ValidationProblem`s.
- Non-Typir diagnostics are untouched (FR-004b).

This one file therefore covers FR-004 (Typir core → `type-mismatch`, in `eligian-document-validator.ts` as the roadmap places it), FR-004b, FR-005 and FR-006.

#### A4. `packages/language/src/eligian-validation-registry.ts` (new, FR-007)

```ts
export class EligianValidationRegistry extends ValidationRegistry {
  // langium validation-registry.d.ts:134: protected handleException(functionality, messageContext, accept, node): Promise<void>
  protected override handleException(functionality: () => MaybePromise<void>, messageContext: string,
      accept: ValidationAcceptor, node: AstNode): Promise<void> {
    return super.handleException(functionality, messageContext,
      (severity, message, info) => accept(severity, message, { ...info, code: diagnosticCode('validation-exception') }), node);
  }
}
```

- **Why this hook.** `wrapValidationException` captures the check's own `accept` inside `functionality`. The separate `accept` argument is used only for the exception diagnostic (`validation-registry.js:72-91`). Wrapping it therefore codes exactly the synthesised `"An error occurred during validation: …"` diagnostic, plus the before/after-document variants (`wrapPreparationException`, `:148-151`). Nothing matches on message text.
- **Wiring.** `eligian-module.ts` gets `validation: { …, ValidationRegistry: services => new EligianValidationRegistry(services) }`. The constructor is `(services: LangiumCoreServices)` (`validation-registry.d.ts:123`). `initializeLangiumTypirServices` (`eligian-module.ts:201`) registers Typir's checks on the same instance, so a throwing Typir rule is coded too.
- Langium still logs the exception with `console.error`, which goes to stderr (spec edge case "stdout purity").

#### A5. `packages/language/src/compiler/pipeline/check.ts` (changed, FR-008, FR-009)

- **`CheckDiagnostic.code`** becomes `readonly code: string` (required). `tsc` then finds every construction site. The CLI-side ones already set a code: `check-command.ts:162` (`compile-failed`) and `lint.ts:29` (`eligius-${rule}`).
- **New export:**

  ```ts
  /** One registry code per compile-error _tag (clarification Q3); kind is ignored. */
  export function compileErrorCode(error: Pick<CompileError, '_tag'>): DiagnosticCode;
  ```

  It is backed by a total `Record<CompileError['_tag'], DiagnosticCode>` with 5 entries, because `CompileError = ParseError | ValidationError | TransformError | TypeError | EmitError` (`pipeline.ts:166`).
- **`checkFiles` keeps the `CompileError`** from `Effect.flip(compile(…))` instead of casting it to `{ message; location }` (`check.ts:89-91`; the `Effect.map(error => error as …)` line is removed).
- **`compileDiagnostic`'s parameter** becomes structural, not the bare union:

  ```ts
  function compileDiagnostic(
    file: string,
    error: Pick<CompileError, '_tag' | 'message'> & { readonly location?: CompileLocation }
  ): CheckDiagnostic   // body unchanged (check.ts:107-126), plus code: compileErrorCode(error)
  ```

  - **Why not `error: CompileError`.** The body reads `error.location ?? {}` (`check.ts:111`), and `EmitError` has no `location` member (`errors/compiler-errors.ts:170-175`: `_tag`, `message`, `ir?`, `hint?`), so `error.location` on the union is TS2339.
  - **Why this type accepts every member.** `_tag` and `message` are common to all five; the four located errors carry `location: SourceLocation` (`compiler-errors.ts:33,81,104,139`), and `SourceLocation` (`errors/base.ts:16-21`: `file?`, `line`, `column`, `length?`) is assignable to `CompileLocation` (`check.ts:100-105`); `EmitError` satisfies the optional `location`. So the `CompileError` is passed unchanged, with no cast.
  - `compileErrorCode(error)` reads the real `_tag`, and an `EmitError` still reports at line 1, column 1, as today.
- **The `Cannot read file` diagnostic** (`check.ts:152-160`) gets `code: diagnosticCode('file-unreadable')`.
- **The local `diagnosticCode(diagnostic)`** (`check.ts:233-236`) is renamed `codeOf`, so it does not shadow the registry helper.
  - Its `code ?? data.code` logic stays.
  - It now returns `string`: a diagnostic with no code at that point gets `'uncoded'`, which is not a registry member.
  - SC-001's "codes not in registry = 0" then fails visibly, instead of the type hiding a missing code as `undefined`.
- The `checkFiles` signature is unchanged: `(filePaths: readonly string[], options?: CheckOptions) => Effect<readonly CheckFileResult[], never, never>`.

### B. Runtime re-verification (`eligian` CLI tests)

#### B1. `packages/cli/src/__tests__/__fixtures__/runtime-claims/`

- **`probe-host.ts`**, the probe host module:

  ```ts
  type Bag = Record<string, unknown>;
  export interface Recorded { readonly label: string; readonly keys: readonly string[]; readonly value: unknown }
  const log = (): Recorded[] => ((globalThis as { __eligianProbe?: Recorded[] }).__eligianProbe ??= []);
  export const operations = {
    recordBag(operationData: Bag): Bag {
      log().push({ label: String(operationData.label), keys: Object.keys(operationData), value: operationData.value });
      return operationData;
    },
    returnUndefined(): undefined { return undefined; },
  };
  ```

  - The exports follow the `operations` / `controllers` shape that `registrationsOf` reads (`host-module.ts:50`; host source in `host-module.spec.ts`, lines 20-30).
  - `keys` records every key the engine passes, including the `label` and `value` that the call itself adds. The assertions therefore compare `keys` minus `['label', 'value']`. This rule is written once in the harness as `bagKeys(entry)`.
- **`layout.html`** with the ids the probes select (`#a`, `#b`, `#stage`, `#btn`), and **`styles.css`** with matching selectors. `check` is not run on the probes, but `compileWithMap` validates them.

#### B2. Harness inside `mcp-runtime-claims.spec.ts`

```ts
const CLAIMS = [ /* 15 titles, verbatim in ELIGIUS_EXECUTION_MODEL.md */ ] as const;
async function compileProbe(source: string): Promise<{ config: IEngineConfiguration; map: EligianMap; host?: HostModule }>;
//  compileWithMap(source, { sourceUri: path.join(FIXTURES, 'probe.eligian') })  (pipeline.ts:264)
//  → Effect<{ config; map; host? }, CompileError, never>; run with Effect.runPromise;
//  host.path resolved as compile-file.ts:333-336; map.source set to the sourceUri path.
async function startEngine(compiled): Promise<{ engine: IEligiusEngine; window: Window & typeof globalThis }>;
//  as smokeConfig does (smoke-runner.ts:80-116): await loadEligius(); const window = await smokeWindow();
//  body = '<div id="probe-root"></div>'; await loadHostModule(host) → registrations;
//  const { engine } = new EngineFactory(new EligiusResourceImporter(registrations), window, { input: { playToggle: false, resize: false } })
//    .createEngine({ ...config, containerSelector: '#probe-root', cssFiles: [] });   // destructured, as smoke-runner.ts:116-118
//  return { engine, window };
const recorded = (): readonly Recorded[];  // globalThis.__eligianProbe, reset in beforeEach
```

- **Engine API**, from `eligius` `IEligiusEngine` (`dist/locale-manager-*.d.mts:1532-1580`): `init(): Promise<IPositionSource>`, `start(): Promise<void>`, `seek(position: number): Promise<number>`, `switchTimeline(uri: string, position?: number): Promise<void>`, `stop(): void | Promise<void>`, `destroy(): Promise<void>`, `readonly currentTimelineUri`, `readonly position: number` (`:1532`), `readonly duration: number | undefined` (`:1534`) and `on<K extends keyof EngineEvents>(event: K, handler: (...args: EngineEvents[K]) => void, options?): () => void` (`:1550`). `EngineEvents` (`:1294-1320`) names the completion event `timelineComplete: []` (`:1312`); `timeline-complete` (`:389-394`) is the eventbus broadcast of the same fact, not an `engine.on` key.
- Each test ends with `await engine.destroy()` in a `finally`.
- **Precedent** for running the engine on jsdom: `packages/language/src/compiler/__tests__/interactions-engine.spec.ts:53-57`.

| # | Driver | Observable (assertion) |
| --- | --- | --- |
| 1 start/end independence | `smokeConfig` (it seeks every boundary, so a range's start and end blocks both run) | the start block's `recordBag("start",0)` after `selectElement("#a")` has `selectedElement`; the end block's `recordBag("end",0)` keys lack it |
| 2 called-action copy | `smokeConfig` | the callee's keys ⊇ {`selectedElement`, parameter name}; the caller's `recordBag("after-call",0)` lacks the key the callee set with `setOperationData` |
| 3 seek reconcile | hand-driven: `init()`, `seek(A.mid)`, assert an `A-start` entry exists (precondition: A is active), clear the log, `seek(B.mid)` | the recorded labels include `A-end` and then `B-start` |
| 4 forward skip | hand-driven: `seek(0)`, then `seek(after C)` | no entry labelled `C-start` or `C-end` |
| 5 controller survival | hand-driven, two probes: A's `on enter` adds a DOMEventListenerController (`on click "#btn" run hit()`); `switchTimeline(B)`; `#btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))` | without `removeControllerFromElement` in A's `on leave`, `hit` is recorded; with it, `hit` is not recorded |
| 6 `loopLength` | `smokeConfig` | `for` over a 3-item array with `recordBag("len", @@loopLength)` records `value === 2` |
| 7 returning `undefined` | `smokeConfig` | `selectElement("#a") returnUndefined() recordBag("after",0)` gives `bagKeys === []` |
| 8 lifecycle blocks start empty | hand-driven: `init`, `seek(0)`, `switchTimeline(B)` | the first entries of `on enter` and `on leave` have `bagKeys === []` |
| 9 event actions start with `eventArgs` | hand-driven: a range runs `broadcastEvent("x", …)` | the event action's first entry has `bagKeys` equal to `['eventArgs']` |
| 10 listener actions | hand-driven: a click, and `KeyboardEvent('keydown', { key: 'ArrowRight' })` | the click action's keys include `eventTarget`; the key action's include `eventTarget` and `eventKey`; neither includes a key the wiring block set with `setOperationData`, except the listener's own `actionOperationData` |
| 11 plain call runs start only | `smokeConfig` | calling an `endable action` as an operation records its start entry and never its end entry |
| 12 switch runs `on leave` | hand-driven: `init()`, `seek(0)`, assert A's `on enter` entry exists (precondition: A's lifecycle action is active, claim 15), clear the log, `switchTimeline(B)` | A's `on leave` entry exists |
| 13 no `on leave` at content end | **fake timers** (FR-010a): a 1 s raf timeline, `engine.on('timelineComplete', () => { completed = true })` registered before `start()`, `start()`, `vi.advanceTimersByTimeAsync(1500)` | `completed === true` or `engine.position` ≥ `engine.duration` (both on `IEligiusEngine`), and there is no `on leave` entry |
| 14 switch to current is a no-op | hand-driven: `init()`, `seek(0)`, assert an `on enter` entry exists (precondition, so a non-no-op switch would have an active lifecycle action to leave); clear the log; `switchTimeline(engine.currentTimelineUri)`; `seek(0)` again (the tick that would re-run `on enter` after a restart) | the log has no `on leave` and no `on enter` entry. Mutation check at implementation time (recorded in `compliance.md`): with the switch replaced by `switchTimeline(B)` and back to A, the same assertions fail, which shows the test can fail |
| 15 first tick starts the first timeline | **fake timers**: `init()`, assert no `on enter`; then `start()` and advance one frame | the `on enter` entry exists only after the advance |

**Fake timers (claims 13 and 15).**
- **Why the order matters.** `loadEligius()` / `smokeWindow()` must run first: `installGlobals` copies jsdom's bound `requestAnimationFrame` onto `globalThis` (`dom-environment.ts:95-110`). Eligius's `animationInterval` calls the global `requestAnimationFrame`, `setTimeout` and `performance.now()` (`eligius dist/engine-factory-*.mjs:12381-12408`).
- **Then install the fakes.** Call `vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })`. This replaces the globals, which the engine looks up at call time. Then set `window.requestAnimationFrame = globalThis.requestAnimationFrame` (and `cancelAnimationFrame`), so a `window.`-qualified call also hits the fake.
- **Timing of `init()` vs `start()`.** `init()` runs before `useFakeTimers`, because its promise may wait on real timers. `start()` and the clock advances run under the fake timers.
- **Cleanup.** In `finally`: `vi.useRealTimers()` and restore the window's original functions.
- **`document.timeline`.** `animationInterval` reads `document?.timeline?.currentTime` first (`:12382`). If jsdom implements `document.timeline` with a real clock, the test stubs `document.timeline` to `undefined` while it runs. A one-line check at implementation time decides whether the stub is needed (risk R4).

**Document check (SC-006)**: test 16 reads `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` and asserts that every `CLAIMS` title occurs in it verbatim.

#### B3. `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` (FR-011, FR-011a)

- Line 1 becomes `# Eligius execution model — only claims marked "probed:" are verified against the installed eligius (mcp-runtime-claims.spec.ts)`.
- Each probed claim ends with `(probed: "<test title>")`. Claims 6 and 7 are added to the document.
- Every other runtime sentence gets `(not probed, Phase 0)`.
- Where a probe disagrees with the document, the document is fixed, never the probe (FR-011). `compliance.md` lists each disagreement with the corrected sentence.

### C. Versions injected at build time

#### C1. `packages/language/src/compiler/version.ts` (new)

```ts
declare const __ELIGIAN_VERSION__: string | undefined;
declare const __ELIGIUS_VERSION__: string | undefined;
/** What un-injected builds (vitest, language dist, extension) report (FR-015). */
export const DEVELOPMENT_VERSION = '0.0.0-development';
export const ELIGIAN_VERSION: string =
  typeof __ELIGIAN_VERSION__ === 'string' ? __ELIGIAN_VERSION__ : DEVELOPMENT_VERSION;
export const ELIGIUS_VERSION: string =
  typeof __ELIGIUS_VERSION__ === 'string' ? __ELIGIUS_VERSION__ : DEVELOPMENT_VERSION;
```

- **With `define`**, esbuild emits `true ? "1.0.1" : DEVELOPMENT_VERSION`, and the minified build folds it to `"1.0.1"` (scratch run, this session).
- **Without `define`**, `typeof` of an undeclared global is `'undefined'`, so the code never throws (FR-015).
- **Users of the module:**
  - `getCompilerVersion` (`pipeline.ts:371-374`, `() => { compiler: string; eligius: string }`) returns `{ compiler: ELIGIAN_VERSION, eligius: ELIGIUS_VERSION }`.
  - `VERSION` (`compiler/index.ts:151`) becomes `export const VERSION: string = ELIGIAN_VERSION`. Its type widens from the literal `'0.0.1'` to `string`; `ts_references` shows no consumer besides the export.
  - `ast-transformer.ts:325` uses `compilerVersion: ELIGIAN_VERSION`.

#### C2. `packages/cli/esbuild.mjs` (changed)

```js
import { createRequire } from 'node:module';
const eligiusPackage = createRequire(import.meta.url).resolve('eligius/package.json'); // throws → build fails (edge case)
const eligiusVersion = JSON.parse(readFileSync(eligiusPackage, 'utf-8')).version;
// in esbuild.context({...}):
define: {
  __ELIGIAN_VERSION__: JSON.stringify(pkg.version),     // pkg read at esbuild.mjs:24
  __ELIGIUS_VERSION__: JSON.stringify(eligiusVersion),
},
```

- `createRequire` is imported under its own name. The banner's `__eligianCreateRequire` (`:88`) is a string inside the bundle and is unrelated.
- `--watch` reads the versions once at start (spec edge case).
- `packages/language/esbuild.mjs` and the extension build get **no** define, so they report `DEVELOPMENT_VERSION` (FR-015).

#### C3. `packages/cli/src/main.ts` (changed, FR-016 (i))

- Remove `readPackageVersion`, `packageVersion`, `packagePath`, `__dirname` and the now-unused `node:url` import (`main.ts:11, 35-51`). `fs` stays; it is used at `:223,231`.
- Import `getCompilerVersion` from `'@eligian/language'` and set `const version = getCompilerVersion().compiler;`.
- Use it in `.version(version)` (`:299`) and in `runCheck({ …, version })` (`:352`).
- `@eligian/language` is bundled from source (`WORKSPACE_SOURCES`, `esbuild.mjs:27-32`), so the define applies.

### D. Lazy imports and startup

- **`smoke/dom-environment.ts`** (FR-017):
  - `import type { JSDOM } from 'jsdom'` (type-only; esbuild drops it).
  - `let dom: Promise<JSDOM> | undefined`.
  - `export function smokeWindow(): Promise<Window & typeof globalThis>` memoises `dom ??= import('jsdom').then(({ JSDOM, VirtualConsole }) => …same body…)`.
  - `loadEligius(): Promise<typeof import('eligius')>` becomes `async`: `await smokeWindow(); eligius ??= import('eligius'); return eligius;`.
  - The two callers (`ts_references`: `dom-environment.ts:36`, `smoke-runner.ts:81`) await it.
  - The promise is memoised, not the result, so concurrent first calls share one window.
- **esbuild** (FR-018). Each runtime use becomes `const esbuild = await import('esbuild')`, with `import type * as esbuild from 'esbuild'` where types are still needed:
  - `dev/host-module.ts:13,29`, inside `loadHostModule` (already `async`);
  - `bundler/css-processor.ts:12,34`, in `minifyCSS` (already `async`);
  - `bundler/runtime-bundler.ts:13,298`: `try: async () => (await import('esbuild')).build({...})` inside the existing `Effect.tryPromise`. An import failure lands in the same `catch` and becomes a `RuntimeBundleError`. `esbuild.BuildFailure` at `:324` stays a type.
- No helper module: there are three call sites of one line each (Simplicity).
- `eligius/lint` stays a static import (FR-021).

### E–H. Documentation and gates (no code)

- **E. `LANGUAGE_SPEC.md`**: sections §4.2 (`:969`), §5.9 (`:1612`), §8.1.1 (`:2405`), §11.2 (`:2747`), §11.3 (`:2798`) and §12.1 (`:2816`), plus a new §11.4 after §11.3.
  - §8.1.1 lists the 9 controllers of `controllers.generated.ts:31-201`. RoutingController is marked do-not-use, quoting `:190`; LottieController is marked constrained (`:111`).
  - Procedure for each snippet:
    1. write it to a scratch directory with a `layout.html` and `styles.css`;
    2. run `node packages/cli/bin/cli.js check <f>` (exit 0);
    3. run `node packages/cli/bin/cli.js compile <f> -o <f>.json`;
    4. paste the JSON after the SC-011 normalisation (scratch script below), with the subtree path named next to the block.
- **F. `examples/README.md`**: the `[demo.eligian]` entry gains three statements: "feature inventory, not idiom"; "excluded from the MCP example corpus and the evals"; and "does not pass `check --selector-not-in-layout ids --max-warnings 0` (13 warnings)". `demo.eligian` itself is untouched.
- **G. CLI coverage**:
  - `packages/cli/vitest.config.ts` gets `test.coverage = { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/dev/client-runtime.ts'], reportsDirectory: './coverage', thresholds: { lines, functions, branches, statements } }`. The thresholds come from Step 0(d).
  - `package.json`: `"test:coverage:ci": "vitest run --coverage"` (already done in Step 0(d), before the baseline run).
  - `@vitest/coverage-v8` resolves from the root devDependency. If vitest in `packages/cli` cannot resolve it, add `"@vitest/coverage-v8": "5.0.5"` to the CLI `devDependencies` (`pnpm add -D -F eligian`).
- **H. Drift fixes**:
  - `AGENTS.md:29` → "currently 12.14" (from `package.json:50`, `pnpm@12.14.0`).
  - `packages/cli/AGENTS.md:24` → `bin` maps both names to `./bin/cli.js`.
  - `packages/cli/AGENTS.md:27`: drop the `index.ts — package exports` line.
  - `packages/cli/KNOWN_ISSUES.md`: each entry (B1/B1b, B2–B7, and the asset-path note) gets `Status (2026-11-xx, <command>): open | fixed | stale`. B1b becomes stale/resolved. A new resolved entry records the Typir prefix and the duplicate video-`from` diagnostic (FR-009a), with the origin lines and the command `node packages/cli/bin/cli.js check <probe> --format json`.
- **Roadmap (FR-002b)**: in `specs/058-mcp-server/roadmap.md`, `unknown-operation` becomes `unknown_operation` in §1 "Teaching happened" (line 35) and §6.4 (line 385). Nothing else changes.
- **No `CHANGELOG.md` or `packages/cli/README.md` edit.** No FR or SC requires one and neither file is in the spec's "Touched files" list (spec.md:17), so Constitution XII rules them out.

## Data and baseline artefacts

These live in `specs/058-mcp-server/phase-0-foundation/baseline/`. The scripts sit next to their outputs so that the before and after runs use the same code. They are outside Biome and tsconfig (Biome only covers `packages/**`).

| Artefact | Generator | Input | Run | Drift check |
| --- | --- | --- | --- | --- |
| `emittable-codes-before.json` (`[{ code, kind: 'literal'\|'constant'\|'lowercased'\|'pass-through', sites: ['file:line'] }]`, sorted) | `enumerate-codes.mjs` (plain Node text scan; see "Enumeration rules" below) | `packages/language/src`, minus `generated/` and `__tests__/` | `node specs/…/baseline/enumerate-codes.mjs > …/emittable-codes-before.json` (the dropped literals go to stderr, which is quoted in `compliance.md`) | the SC-003 test in `diagnostic-code-registry.spec.ts` reads it and checks every entry with `isDiagnosticCode`; the "registry = baseline ∪ new codes" test checks the converse |
| `diagnostics-before.json` / `diagnostics-after.json` (`{ file (repo-relative, '/'), severity, message, line, column, endLine, endColumn }[]`, sorted) | `snapshot-diagnostics.ts` | the SC-001 sets (a)+(b), through `checkFiles` imported from `packages/language/src/compiler/pipeline/check.ts`, run one by one with `Effect.runPromise` | `pnpm exec tsx specs/…/baseline/snapshot-diagnostics.ts before\|after` | `diff` of before and after shows only the FR-004a/b lines, which `compliance.md` lists |
| `uncoded-accepts-{before,after}.txt` | the spec's Appendix A script (scratch copy) | the FR scope | `node <scratch>/scan.mjs .` | SC-002: 39 before, exactly 2 after |

**Enumeration rules (`enumerate-codes.mjs`, FR-002 (i)–(iv)).** FR-002 (i) admits only literals "that reach a diagnostic", so the scan does not take every value-position `code: '…'`:

1. **Blank comments first** (`//…` and `/*…*/`, string contents kept), so JSDoc examples such as `code: 'ERROR_CODE'` / `code: 'DUPLICATE_IMPORT_NAME'` (`utils/error-builder.ts:15,32`) and `code: 'en-US'` (`type-system-typir/utils/locale-metadata-extractor.ts:90`) never enter.
2. **(i) literals reach a diagnostic in one of two ways only:**
   - (i-a) the literal is inside the info-object argument of an `accept(` call, including a nested `data: { code: '…' }` (e.g. `css/selector-validation.ts:31,46,59`, `css/selector-sources.ts:92`, `validators/operation-call/parameter-validator.ts:60`). Typir rule `accept`s count the same way;
   - (i-b) the literal belongs to a code union that a validator passes through to `accept` as an identifier. The one such union is `DataflowCode` (`dataflow/operation-dataflow.ts:76-79`: `'missing-dependency' | 'missing-action-dependency' | 'erased-property-access'`), which `validators/dataflow-validator.ts:17-20` passes as `code: diagnostic.code`. The script reads that union verbatim, and records the value-position sites `operation-dataflow.ts:398,445,476,506,531` under it.
3. **(ii)** `*_CODE = '…'` constants (unchanged).
4. **(iii)** the `code:` unions of `compiler/operations/validation/errors.ts:21-58`, **lowercased**. `compiler/operations/**` is excluded from (i): its value literals (`'CONTROL_FLOW'` at `validation/control-flow.ts:54,70,88,105,116`, `'UNKNOWN_OPERATION'` at `validation/existence.ts:35`, `'PARAMETER_COUNT'` at `validation/parameter-count.ts:32`, `'PARAMETER_TYPE'` at `validation/parameter-types.ts:221`) reach a diagnostic only lowercased, through (iii). `'MAPPING_ERROR'` (`compiler/operations/mapper.ts:83`) is the `MappingError` that `mapParameters` returns and never reaches a diagnostic.
5. **(iv)** the `code:` unions of `validators/validation-errors.ts:29-60`, verbatim (unchanged).
6. Literals inside `type`/`interface` declarations are excluded, e.g. `types/code-actions.ts:81` (`unknown_label_id`; its emitted form is enumerated at its `accept` site), as is the AST property `'code'` (`generated/ast.ts:910`).

Every scanned `code: '…'` literal that no rule admits is written to stderr with its `file:line` and the reason (comment, `compiler/operations`, type position, not in an `accept` info object). A literal reported as "not in an `accept` info object" that is not one of the cases above is investigated before the baseline is accepted; it is not silently dropped.

Scratch only (not committed): the SC-011 id normaliser (replace every `id` value with `"<id>"`, then every string equal to an original id), the SC-013 untested-module check, the SC-018 stub `mcp` subcommand, and the SC-022 reversed-expectation mutation.

## Test plan

Language tests run with `pnpm -C packages/language exec vitest run <file>`. CLI tests run after `pnpm -C packages/language build && pnpm -C packages/cli build` (the built-artifact preconditions), with `pnpm -C packages/cli exec vitest run <file>`.

| FR / SC | Spec file | describe / it | Assertion strategy |
| --- | --- | --- | --- |
| FR-001, FR-001a, SC-019 | `packages/language/src/__tests__/diagnostic-code-registry.spec.ts` | `describe('diagnostic code registry')` · `it('entries have exactly code and source')` · `it('codes are unique')` · `it('sources of syntax-error, unresolved-reference, type-mismatch and the compile codes')` | `Object.keys(e).sort()` equals `['code','source']`; `new Set` size equals the array length; the source table has 8 explicit rows |
| FR-002, SC-003 | same | `it('keeps every code emittable before Phase 0')` | read `baseline/emittable-codes-before.json`; `missing = entries.filter(e => !isDiagnosticCode(e.code))` equals `[]` |
| FR-001 (only emittable codes), FR-002 (kebab-case) | same | `it('the registry is exactly the baseline plus the new codes')` · `it('new codes are kebab-case')` · `it('non-emittable literals are not codes')` | `NEW_CODES` in the test is the A1 new-codes table; the registry's code set equals `baseline ∪ NEW_CODES` (set equality, both differences listed on failure), so a non-emittable code fails; every code not in the baseline matches `/^[a-z]+(-[a-z]+)*$/`; `isDiagnosticCode` is false for `CONTROL_FLOW`, `UNKNOWN_OPERATION`, `PARAMETER_COUNT`, `PARAMETER_TYPE`, `MISSING_DEPENDENCY`, `MAPPING_ERROR` and `ERROR_CODE` |
| FR-002a, SC-020 | same | `it('every derivable code is registered')` | extract the `code:` literal unions of `compiler/operations/validation/errors.ts` (lowercased) and `validators/validation-errors.ts` (verbatim) from the source text with `/code:\s*((?:'[^']+'\s*\|?\s*)+);/g`; import the constants `RUNTIME_NEGATION_CODE` … `END_BLOCK_RUNTIME_CONST_CODE`, `INVALID_SET_DATA_TARGET_CODE` and `MISSING_LABELS_FILE_CODE`; all pass `isDiagnosticCode`. The test also asserts that the extracted set is non-empty and includes `unknown_operation`, `parameter_count`, `parameter_type` and `control_flow` |
| FR-001 (no literals) | same | `it('validators use the registry, not string literals')` | scan the A2 scope, derived at test time as `validators/**`, `eligian-validator.ts`, `type-system-typir/validation/**` plus every file of a `kind: 'literal'` site in `baseline/emittable-codes-before.json` (so `css/selector-sources.ts` is in it); comments and strings blanked, except the literal under test: every value-position `code:` is `diagnosticCode(`, an identifier, `error.code` or `…toLowerCase()`; offenders are listed |
| FR-002b, SC-021 | — | `compliance.md` | `grep -n "unknown-operation" specs/058-mcp-server/roadmap.md` → 0; `grep -rn "unknown-operation" packages/language/src` → 0 |
| FR-003, FR-004, FR-004a, FR-005, FR-006, FR-008 (file), FR-009, SC-001 | `packages/language/src/__tests__/diagnostic-codes.spec.ts`, fixtures in `packages/language/src/__tests__/__fixtures__/diagnostic-codes/` | `describe('every checked diagnostic carries a registry code')` · `it('fixture corpora and examples: no uncoded, no unregistered code')` · `describe('coded fixtures')` `it.each(CASES)('%s → %s')` · `it('a nonexistent path → file-unreadable')` · `it('video without from → exactly one diagnostic')` · `it('raf with from → exactly one warning, timeline-source-unused')` | `for (const f of files) results.push(...await Effect.runPromise(checkFiles([f])))`, **one call at a time** (no `Promise.all`); `CASES` holds `[fixture, code, source]` triples: each fixture's exact code, and the FR-001a source that `DIAGNOSTIC_CODES.find(e => e.code === code)!.source` must equal (`type` for every Typir rule fixture, `validator` for the validator sites, `compiler` for `file-unreadable`, `parser` / `linker` for `syntax-error` / `unresolved-reference`); the two "exactly one" cases use `toHaveLength(1)`; paths are compared after `path.resolve` |
| SC-017 (language) | same | `it('no Typir prefix in any set-(c) message')` | every message `not.toMatch(/^While validating /)` |
| FR-004b, FR-005, FR-006, SC-016 unit | `packages/language/src/__tests__/eligian-document-validator.spec.ts` (new) | `describe('EligianDocumentValidator codes')` · `it('parse error: code syntax-error, data.code parsing-error')` · `it('lexer error: syntax-error + lexing-error')` · `it('linking error: unresolved-reference, data kept')` · `it('unknown operation name: no linking diagnostic')` · `it('Typir rule and Typir core diagnostics lose the prefix; code, severity and range kept')` · `describe('stripTypirPrefix')` table test (error, warning, a message containing ", this error is found: ", sub-problems kept, non-matching message unchanged) | `createTestContext()` in `beforeAll`; `ctx.parse(src)`, then `services.Eligian.validation.DocumentValidator.validateDocument(doc)`; the `DiagnosticSeverity` enum from test-helpers. For the prefix case, the expected range is computed with `getDiagnosticRange` from the same node and property, i.e. the range the base `toDiagnostic` would give |
| FR-007 | same file | `it('a throwing check yields validation-exception')` | an own `createEligianServices(EmptyFileSystem)` instance (not the shared context); `ValidationRegistry.register({ Program: () => { throw new Error('boom'); } })`; `vi.spyOn(console, 'error').mockImplementation(() => {})`; the diagnostic whose message starts with `An error occurred during validation: boom` has `code === 'validation-exception'`, and that code's registry `source` is `validator` (FR-001a) |
| FR-008 | `packages/language/src/compiler/__tests__/check-files.spec.ts` (existing, extended) | `describe('compileErrorCode')` · `it.each(TAGS)('%s → its code')` · `it('5 distinct codes')` · `it('kind does not change the code')` | build errors with `createParseError`, `createValidationError` (two `ValidationErrorKind`s), `createTypeError`, `createTransformError` (two `TransformErrorKind`s) and `createEmitError` (`errors/compiler-errors.ts:204-315`); every code passes `isDiagnosticCode` |
| FR-013–FR-015, SC-007a | `packages/language/src/compiler/__tests__/version.spec.ts` (new) | `it('reports the development version without define')` | `getCompilerVersion()` equals `{ compiler: DEVELOPMENT_VERSION, eligius: DEVELOPMENT_VERSION }`; `VERSION === DEVELOPMENT_VERSION` |
| SC-004, SC-017 (CLI), SC-019 (CLI) | `packages/cli/src/__tests__/check-codes.spec.ts` (new); fixtures `packages/cli/src/__tests__/__fixtures__/check-codes/{duplicate-styles,video-without-from,unknown-label,stray-token}.eligian` (+ `a.css`, `b.css`) | `describe('eligian check --format json codes')` · `it('duplicate styles → import-duplicate-default')` · `it('video without from → one coded diagnostic, no Typir prefix')` · `it('undeclared label → unresolved-reference')` · `it('stray token → syntax-error')` · `it('every printed code is a registry code, compile-failed or eligius-*')` · `it('@eligian/language exposes the registry')` | `execFileSync(process.execPath, [bin, 'check', f, '--format', 'json'])`, catching the non-zero exit and reading its stdout; parse the JSON; `import { DIAGNOSTIC_CODES, isDiagnosticCode } from '@eligian/language'` (resolves to `dist/index.cjs`) |
| FR-010, FR-010a, FR-012, SC-005, SC-006, SC-022 | `packages/cli/src/__tests__/mcp-runtime-claims.spec.ts` (new, a file of its own) | `describe('Eligius runtime claims (installed eligius)')` · `test(CLAIMS[i], …)` ×15 · `test('ELIGIUS_EXECUTION_MODEL.md states every probed claim')` | the B2 harness; imports only from `'eligius'`; the summary must read 16 passed, 0 skipped |
| FR-016, SC-007 | `packages/cli/src/__tests__/package-bin.spec.ts` | `test.skipIf(!built)('--version prints the package version')` · `test.skipIf(!built)('the bundle carries the injected versions')` | the trimmed stdout of `spawnSync(process.execPath, [bin, '--version'])` equals `pkg.version`; the bundle text does `not.toContain('__ELIGIAN_VERSION__')` / `'__ELIGIUS_VERSION__'` and does `toContain(JSON.stringify(v))` for both versions, with `v` read from `package.json` and from `createRequire(resolve(packageRoot,'package.json')).resolve('eligius/package.json')` |
| FR-019, SC-008 | same | `test.skipIf(!built)('no static import of jsdom, esbuild or effect/ai')` | the two FR-019 regexes → 0 matches; `/\bimport\(\s*["']jsdom["']\s*\)/` and its esbuild counterpart → ≥ 1 match each; run once after `build` and once after `build:prod` |
| FR-020, SC-009 | same | `test.skipIf(!built)('--version starts in under 3 s (median of 5)', { timeout: 60_000 })` | 1 warm-up spawn plus 5 sequential `spawnSync(process.execPath, [bin,'--version'])` timed with `performance.now()`; `console.info` prints the 5 values and the median (this is vitest's output, not the CLI's); `expect(median).toBeLessThan(3000)` |
| FR-020a, SC-018 | same | `test.skipIf(!built \|\| !hasMcp)('mcp answers initialize in under 3 s', { timeout: 20_000 })` | `hasMcp = /^\s+mcp\b/m.test(execFileSync(process.execPath, [bin, '--help'], …))`, computed once when built; `spawn(process.execPath, [bin, 'mcp'])`; write `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"package-bin.spec","version":"0"}}}\n` to stdin; read stdout lines until one parses with `id === 1` and has a `result`; elapsed < 3000 ms; kill the child in `finally` |
| SC-010 | existing CLI suites | — | `pnpm -C packages/cli test` is green; the skipped count is unchanged apart from FR-020a |
| FR-031, SC-013 | config | — | `pnpm -C packages/cli test:coverage:ci` exits 0 with the thresholds; the scratch untested-file check is quoted |
| FR-032 | config | — | `pnpm -C packages/language test:coverage:ci` ≥ 79.8 / 80 / 69.9 / 79. The new language code (registry, validator overrides, registry subclass, `compileErrorCode`, version module) is covered by the specs above |
| FR-022–FR-029, SC-011 | — | reviewer, `compliance.md` | the E procedure and the SC-011 commands, including the controller-set `diff` |
| FR-030, SC-012 | — | `compliance.md` | `grep -n -A6 '\[demo.eligian\]' examples/README.md`; `git diff --stat examples/demo.eligian` is empty |
| FR-033, FR-034, SC-014 | — | `compliance.md` | the SC-014 greps → 0 lines; `test -e packages/cli/src/index.ts` is false |
| FR-035, SC-015 | — | `compliance.md` | the gate list below |

**SC-007a check (amended; open question 1)**: after `pnpm -C packages/extension build` and `pnpm -C packages/language build`, run

```
grep -rhoE --include='*.js' --include='*.cjs' --include='*.mjs' '.{0,11}__ELIGI(AN|US)_VERSION__' packages/extension/out packages/language/dist \
  | grep -vcE '(typeof |"string" ?\? ?)__ELIGI(AN|US)_VERSION__$'
```

The expected output is `0`: every reference is either the `typeof` guard or the guarded consequent, and source maps are excluded.

## Build integration

| Item | Change |
| --- | --- |
| `packages/cli/esbuild.mjs` | `define` for the two versions (C2). The bundle stays one file; `external` (`:85`) and `WORKSPACE_SOURCES` (`:27-32`) are unchanged |
| `packages/cli/package.json` | `test:coverage:ci` → `vitest run --coverage` (Step 0(d)). `files`, `exports`, `bin` and version 1.0.1 are unchanged (1.1.0 is Phase 1). Possibly an `@vitest/coverage-v8` devDependency (G) |
| `packages/cli/vitest.config.ts` | the `test.coverage` block (G) |
| `packages/language/src/index.ts` | the registry exports (A1). The `package.json` `exports` map is unchanged (root entry) |
| `packages/language/src/eligian-module.ts` | the `ValidationRegistry` override (A4) |
| Generated code | none touched; `pnpm langium:generate` is not needed (no grammar change) |

**Gates** (run in this order; outputs quoted in `compliance.md`):

1. `pnpm build`
2. `pnpm typecheck`
3. `pnpm run typecheck:tests` (CI runs it, `ci.yml:68`)
4. `pnpm check` → 0/0
5. `pnpm run ci`
6. `pnpm effect:check` (= `effect:check:language` + `effect:check:cli`, root `package.json:27-29`) → 0 errors, 0 warnings. `check.ts` and `runtime-bundler.ts` are Effect code. These two projects check **non-test sources only**: `effect:check:language` uses `packages/language/tsconfig.src.json`, and `effect:check:cli` uses `packages/cli/tsconfig.json`, which sets no `exclude` and so inherits the root `tsconfig.json` exclude of `**/__tests__/**/*` and `**/__fixtures__/**/*` (`tsconfig.json:22-28`).
6a. Because the new tests contain Effect code (`compileProbe`'s `Effect.runPromise(compileWithMap(…))`, the `Effect.runPromise(checkFiles([f]))` loop, `probe-host.ts`), the test projects are checked too: `pnpm exec effect-tsgo diagnostics --project packages/language/tsconfig.test.json --format text --strict` and the same with `packages/cli/tsconfig.test.json` (both set their own `exclude` without `__tests__`). Measured this session before any change: language tests `Checked 492 files … 0 errors, 0 warnings and 0 messages`; CLI tests `Checked 301 files … 0 errors, 1 warnings`, the one warning being the pre-existing `globalErrorInEffectFailure` at `packages/cli/src/__tests__/cli-low-fixes.spec.ts:256`. Gate: the language test project stays 0/0; the CLI test project reports no finding other than that pre-existing one (no finding in any file this phase adds or changes). Both summaries are quoted in `compliance.md`.
7. `pnpm test` (root `pnpm -r test`, `package.json:15`: language, cli, extension and shared-utils). Its per-package summaries are quoted in `compliance.md` (SC-015)
8. `pnpm -C packages/cli build:prod`, then `vitest run src/__tests__/package-bin.spec.ts`, then `pnpm -C packages/cli build` again (SC-008)
9. `pnpm run check:examples`, `pnpm run smoke:examples`, `pnpm run fmt:examples`
10. `pnpm test:coverage:ci` (both packages at or above their thresholds)
11. the SC-009 Windows command
12. the SC-016 after-snapshot and its diff; the SC-002 after-scan

## Risks and mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Concurrency on the Langium singleton.** `checkFiles` flips `Settings.selectorNotInLayout` (`check.ts:73-82`) and adds and deletes documents (`:162-164`, `releaseWorkspaceDocuments` at `:223`). Parallel calls in tests produce spurious diagnostics | `diagnostic-codes.spec.ts` and `snapshot-diagnostics.ts` await each call before the next; no `Promise.all`. The FR-007 test uses its own services instance, so the throwing check does not leak into the shared one |
| R2 | **jsdom globals are permanent** (`installGlobals`, `dom-environment.ts:95-110`) | the runtime claims live in their own file (vitest isolates files); fake timers and the window's functions are restored in `finally` |
| R3 | **stdout pollution** | no new `console.log` on CLI paths; the lazy imports print nothing; the FR-007 test silences Langium's `console.error`; the `--version` equality test (FR-016) catches any stray line on that path |
| R4 | **Fake timers vs Eligius's raf loop.** `document.timeline.currentTime` or a window-bound raf could bypass the fake clock | the B2 order (window first, then the fakes, then re-point the window's raf); stub `document.timeline` if jsdom provides it; the SC-022 mutation shows the test really observes the first frame |
| R5 | **Startup time** of the timing test while other CLI suites run in parallel | the threshold is the §2 budget (3 s), not the local 1.1 s figure. If it is flaky in CI, move the test to its own file with `fileParallelism: false` (FR-020); do not raise the threshold |
| R6 | **Windows paths** | paths compared after `path.resolve`; eligius found by package resolution; `spawnSync(process.execPath, …)` without a shell; fixture paths built with `path.join`; the KNOWN_ISSUES and spec commands use forward slashes under Git Bash |
| R7 | **Coverage thresholds.** In the language package the new code (overrides, registry subclass, `compileErrorCode`, version module) adds lines. In the CLI the baseline is low by construction, because many tests run the CLI in child processes | each new piece has a unit test above. Removing Typir Rule 1 slightly reduces the covered lines, so run `test:coverage:ci` before finishing. The CLI gate only guards against regression |
| R8 | **`asset-import-validator.ts:131` may be unreachable by a fixture.** The asset error's `filePath` is the import path as written (`compiler-integration.ts:101`), so a matching import normally exists | try a fixture first (an asset error with no matching import node). If none is found, cover the site with a unit test of `AssetImportValidator` with a stubbed `loadProgramAssets` result, and record the deviation from SC-001(c)'s "one fixture per site" in `compliance.md` (open question 2) |
| R9 | **Typir rules may double-report** what a validator already reports (languages, import) | not changed in Phase 0, so there is no message or count drift outside FR-004a/b; `compliance.md` records it if the SC-016 snapshot shows such a double report |
| R10 | **IDE impact** of the `EligianDocumentValidator` and registry changes | the extension uses the same services; gate 7 is `pnpm test` (root `pnpm -r test`), which runs the extension and shared-utils suites as well as language and cli; the quick-fix consumers match code strings that do not change |
| R11 | **Stale builds** make the `package-bin` and runtime-claims SCs pass without testing anything | the built-artifact preconditions; the summaries must show 0 skipped (except FR-020a) |

## Project structure

```text
specs/058-mcp-server/phase-0-foundation/
├── spec.md  plan.md  tasks.md  compliance.md
└── baseline/  enumerate-codes.mjs  snapshot-diagnostics.ts
               emittable-codes-before.json  diagnostics-{before,after}.json  uncoded-accepts-{before,after}.txt

packages/language/src/
├── validators/codes.ts                         NEW registry
├── eligian-validation-registry.ts              NEW handleException override
├── compiler/version.ts                         NEW injected versions
├── eligian-document-validator.ts               lexer/parser/linker codes, Typir toDiagnostic
├── eligian-module.ts                           ValidationRegistry wiring
├── index.ts                                    registry exports
├── compiler/pipeline.ts · compiler/index.ts · compiler/ast-transformer.ts   versions
├── compiler/pipeline/check.ts                  compileErrorCode, file-unreadable, required code
├── validators/** · eligian-validator.ts · css/selector-validation.ts · css/selector-sources.ts · dataflow/operation-dataflow.ts   diagnosticCode(...)
├── type-system-typir/validation/*.ts           rule codes; timeline Rule 1 removed
└── __tests__/  diagnostic-code-registry.spec.ts  diagnostic-codes.spec.ts  eligian-document-validator.spec.ts
                __fixtures__/diagnostic-codes/*.eligian
    compiler/__tests__/  version.spec.ts  check-files.spec.ts (extended)

packages/cli/
├── esbuild.mjs · package.json · vitest.config.ts
├── src/main.ts · smoke/dom-environment.ts · smoke/smoke-runner.ts · dev/host-module.ts
├── src/bundler/css-processor.ts · src/bundler/runtime-bundler.ts
└── src/__tests__/  package-bin.spec.ts  check-codes.spec.ts  mcp-runtime-claims.spec.ts
                    __fixtures__/check-codes/*  __fixtures__/runtime-claims/{probe-host.ts,layout.html,styles.css}

LANGUAGE_SPEC.md · examples/README.md · examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md
packages/cli/KNOWN_ISSUES.md · packages/cli/AGENTS.md · AGENTS.md
specs/058-mcp-server/roadmap.md (two metric names)
```

**Structure decision**: only the existing monorepo packages; no new package, entry point or `exports` subpath.

## Complexity tracking

None. `EligianValidationRegistry` is the one new class. The alternative was to match the message prefix in `toDiagnostic`; it was rejected because it depends on text that Langium could reword.

## Open questions

1. **The SC-007a command.** As written, it also counts the guarded consequent and the text in source maps, so no typeof-guarded implementation can reach 0 (shown with a scratch esbuild build). The plan uses the amended command above. The alternative is a `define` in the language and extension builds too, so that no identifier remains; it touches two more build files and was rejected for simplicity.
2. **`asset-import-validator.ts:131`.** If no fixture reaches it, a unit test with a stubbed asset result replaces the fixture (R8). That deviates from SC-001(c)'s "one file per FR-003 site".

## Review notes

Review round 1 (plan challenge). All ten issues were applied; two suggested resolutions were adjusted, because applying them literally would have been wrong against the code:

1. **Baseline filter (issue 1), partly adjusted.** The suggested filter ("only `code:` literals inside an `accept(…)` info object or a `data: { code }` object, or a `*_CODE` constant") would drop three real emitted codes: `missing-dependency`, `missing-action-dependency` and `erased-property-access`. Their literals sit in `report(…)` / `unmet(…)` calls in `dataflow/operation-dataflow.ts:398,445,476,506,531`, not in `accept`, and reach a diagnostic through `validators/dataflow-validator.ts:17-20` (`code: diagnostic.code`). The plan therefore adds rule (i-b), the `DataflowCode` union (`operation-dataflow.ts:76-79`) read verbatim. The rest of the suggestion is applied: comments are blanked, `compiler/operations/**` is excluded, the non-membership assertions are added, and the registry must equal baseline ∪ new codes.
2. **Completion event name (issue 10), corrected.** The issue proposes `engine.on('timeline-complete', …)`. `IEligiusEngine.on` takes `K extends keyof EngineEvents` (`eligius dist/locale-manager-CJy3musb.d.mts:1550`), and that key is `timelineComplete` (`:1312`). `'timeline-complete'` (`:389-394`) is the eventbus event name, so passing it to `engine.on` does not type-check. Claim 13 uses `engine.on('timelineComplete', …)`. The destructuring `const { engine } = …createEngine(…)` is applied as suggested.
3. **Effect gate for tests (issue 8).** The plan does not just state that tests are outside the gate. It adds gate 6a, which checks both test tsconfigs. The CLI test project already has one warning (`cli-low-fixes.spec.ts:256`, measured this session). That file is outside the spec's touched files, so the gate allows that one finding and no other, rather than demanding a 0 that this phase cannot reach without editing an unrelated file.
