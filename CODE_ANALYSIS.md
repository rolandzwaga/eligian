# Eligian Code Analysis

## Executive Summary

This report synthesizes a verified, cross-module static analysis of the Eligian DSL monorepo (language core, compiler, CSS/HTML/labels tooling, Typir type system, completion, asset loading, CLI, VS Code extension, locale editor, and shared utilities). The original deduplicated framing identified **96 distinct issues** across bugs, code-duplication clusters, and anti-patterns. The dominant theme of the report was **systemic code duplication** — the same logic (file-watcher classes, Levenshtein distance, import-path resolution, control-flow-pairing validators, `_tag` type guards, `error.hint` formatting, empty-CSS-metadata construction, AST root traversal) copy-pasted across 3-9 sites with silent behavioral drift that produced real bugs.

**Current status:** the duplication track is **fully resolved** (every cluster fixed), **all High-severity bugs are fixed**, and the medium/low bug tail has now been drained to almost nothing — the four co-located cleanup batches closed 11 Mediums, and a follow-up `fix/bug-tail-final` batch closed **7 more bugs** (B31, B44, B52, B59 Medium; B55, B57, B61 Low) plus the phantom-test-CSS production-leak anti-pattern. **B30** was then closed by the `fix/b30-typir-double-invocation` batch — the double-invocation turned out to be our own double registration (`createEligianServices` called `registerTypirValidationChecks` a second time after `initializeLangiumTypirServices` had already registered it), so the fix removed the redundant call and deleted the symptom-masking WeakSet. **B47** — the last open bug — was then closed in the same `fix/b30-typir-double-invocation` batch: bracket-position detection was migrated from the extension host to a custom `eligian/blockLabels` LSP request (the server reuses its cached AST via `extractBlockLabels`), and the `langium/test`-parsing `block-label-detector` module was deleted, taking its singleton-services leak with it. **Every bug in this report is now fixed.** The remaining work is the **anti-pattern themes**. The mechanical, behavior-preserving slice of these — the **dead/stub-code removals** and the **`any`-typing cleanups** — was drained by the `refactor/anti-pattern-cleanup-batch-1` batch (10 bullets fixed); the two type migrations it deferred as non-mechanical — **`AssetError`→discriminated union** and **`PathResolutionResult`→`string`** — were then closed by the `refactor/deferred-type-migrations-batch-2` batch (the union gained a `LocalesImportError` member; `resolvePath` now returns a bare `string`). The **encapsulation/API-hygiene, perf-doc, unsafe-cast/silent-failure, and "other" themes** — including the whole locale-editor correctness cluster — were then drained by the `refactor/anti-pattern-tier1-encapsulation-cleanup` batch (16 bullets fixed). The `extension/main.ts` half of the god-class work — including the paired manual-FiberFailure-unwrapping cleanup in `registerCompileCommand` — was then closed by the `refactor/extension-main-god-module-decomposition` batch (compile/JSDoc/locale commands extracted into `commands/*`, `main.ts` down to 254 lines; `registerCompileCommand` now recovers the typed error via `runPromiseExit`/`Cause`). The higher-effort core — the **`EligianValidator` god-class decomposition** — was then closed by the `refactor/eligian-validator-god-class-decomposition` batch (the 3077-line monolith split into an abstract `BaseValidator` plus seven concern-grouped subclasses under `validators/`, each registered via its own `registry.register(map, instance)` call; `eligian-validator.ts` down to 199 lines as a composition root; methods moved verbatim, suite green at baseline 1995/23, coverage CI exit 0). The two previously-deferred perf items were then closed by the `perf/batch-b-getimportedactions-double-filecheck` batch (`getImportedActions` now memoizes its top-level call in a build-cycle-aware `WorkspaceCache`; the redundant top-level media file-existence stat is skipped in favor of `MediaValidator`'s own existence + is-file check). Nothing remains: **all 66 bugs, all 46 duplication clusters, and all 48 anti-pattern bullets are resolved — 160 of 160 findings fixed, 0 open.** See the status table below.

## Summary Table — Status by Category

Re-tallied from the inline-numbered findings in this document (each `B`/`D` finding and each anti-pattern bullet counted by its current ✅ FIXED / open status). This supersedes the original Category × Severity inventory, which had drifted as later findings (B45–B66, D24–D44) were appended without updating the headline counts.

| Category | Fixed | Open | Total |
|---|---|---|---|
| Bug | 66 | 0 | 66 |
| Duplication | 46 | 0 | 46 |
| Anti-pattern | 48 | 0 | 48 |
| **Total** | **160** | **0** | **160** |

**Open bugs by severity** — **none. Every bug in this report is now fixed.**

| | High | Medium | Low |
|---|---|---|---|
| Open | 0 | 0 | 0 |

> **B47 note:** now **fixed** on branch `fix/b30-typir-double-invocation`. Bracket-position detection was migrated from the extension host to a custom `eligian/blockLabels` LSP request: the language server reuses its already-built, cached AST (`extractBlockLabels(program)` in `packages/language/src/lsp/block-labels.ts`) instead of the host re-parsing on every keystroke via `langium/test` `parseDocument`. The production parsing module (`block-label-detector.ts`) and its singleton `EligianServices` are deleted outright (so the resource-leak half is moot — there is no singleton to dispose), and the `findBlockLabels` test suite was redesigned into a parse-free unit test of `extractBlockLabels` in the language package.

---

## Status — Fixes Applied

The following findings were fixed and committed in **`6b1c52a`** (verified: full test suite green, build clean). They are marked **✅ FIXED** inline below. Everything else remains open.

**Fixed (numbered):** B1, B6, B8, B15, B17, B23, B27, B28, B54, B56, B58, B62, D33.

The following findings — the **Typir inference correctness cluster** — were fixed and committed in **`220b552`** (verified: typecheck clean, biome clean, full language suite green at 1989 passed/23 skipped, coverage CI passing). They are marked **✅ FIXED** inline below.

**Fixed (numbered):** B10, B11, B12, B29.

The following duplication cluster was fixed on branch **`refactor/consolidate-file-watchers-d1`** (verified: tsgo typecheck clean, 337 extension tests green, esbuild build clean). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D1, D2, D2b. The three watcher classes (`CSSWatcherManager`/`HTMLWatcherManager`/`LabelsWatcherManager`) now extend a shared `FileImportWatcherManager` (`packages/extension/src/extension/base-watcher-manager.ts`) parameterized by `{ globPattern, watchCreate, notifyOnDeleteWhenUntracked, sendUpdateNotification }`; each concrete watcher is a ~50-line wrapper preserving its existing public API. This also gives the watchers one shared accumulate-only `updateTrackedFiles`, locking in the earlier B23 fix.

Notes on this cluster: typing the `CustomKind` factories concretely (B12) surfaced a second defect beyond the report — the event/import/languages inference rules also passed properties at the top level instead of under `{ properties: {...} }`, masked by the `any` typing; both were corrected. A side fix was forced by B12: `TimelineType.events` was `never[]`, which under concrete typing distributes to `never` and breaks `create()`, so it was changed to `string[]` (always an empty placeholder resolved by Typir later). A new regression test (`type-system-typir/inference/__tests__/inference-resolves-types.spec.ts`) asserts `Inference.inferType()` returns a resolved `Type` for import/languages/timed-event nodes — coverage the cluster previously lacked (the hover provider replicates the logic instead of using Typir). Also fixed a pre-existing `TS6307` in `packages/language/tsconfig.json` whose `include` override dropped `src/schemas/*.json`.

**Also applied (cleanups not tracked as a numbered finding):** removed dead `checkSingleLanguagesBlock` method (eligian-validator.ts); removed empty `else` block (css-code-actions.ts); removed duplicate comments (pipeline.ts, asset-type-validator.ts); used the imported `path` module instead of inline `require` and marked `updateTrackedFiles` private across the three watchers; exported/reused `DEFAULT_INLINE_THRESHOLD`; deleted committed `error-reporter.ts.orig` and added `*.orig` to `.gitignore`.

The following was fixed on branch **`refactor/consolidate-levenshtein-d3`** (commit `92659bf`; verified: tsgo clean, language suite green at 2001 passed/23 skipped, biome clean, coverage CI passing). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D3. New `compiler/utils/string-similarity.ts` re-exports the canonical `levenshteinDistance` and adds a generic `findSimilar`; `suggestSimilarActions`/`suggestSimilarOperations` delegate to it; the two byte-identical private compiler copies are deleted and the compiler suggestion paths gain the previously-missing `maxDistance` early-exit. Net −92 lines.

The following were fixed on branch **`fix/preview-webview-cluster`** (merged as PR #59, commit `b51e9db`). **Fixed (numbered):** B20, B21, B50 — eventbus listener removers stored and invoked before re-registering; play/pause/stop/restart now broadcast eventbus requests; `updateConfig`/`initialize` protocol clarified.

The following cluster was fixed on branch **`fix/locale-editor-cluster`** (merged as PR #58, commit `5bbfb9f`; verified: 337 extension tests green, tsgo clean, biome clean, build green). Marked **✅ FIXED** inline below.

**Fixed (numbered):** B16, B18, B19, B22, B63, B64–B66 (correctness), and duplication clusters D36, D37, D38. The webview now imports `SerializableKeyTreeNode`/`LocaleEditorState`/`findNodeByKey`/pure `removeKeyFromTree` from `locale-editor-core` (D36, source-of-truth dedup that also locks in the B18 mutating-vs-pure divergence) and calls core `validateLocaleCode` (kills the divergent inline locale-code regex); `buildTreeFromKeys`/`buildTreeFromKeysWithPrefix` collapsed to one `buildTreeFromKeys(keys, locales, prefix='')` (D37); `LocaleUsageTracker` extracted `buildKeyUsagePatterns`/`forEachEligianFile`/`collectLineMatches` shared by `searchWorkspace` and `getKeyUsageDetails` (D38). Host-side type duplication (`locale-editor/types.ts` vs the media bundle) was deliberately left as-is to avoid coupling the webview to the extension host.

The following cluster was fixed on branch **`refactor/d4-import-path-resolution`** (merged as PR #60, commit `1d7e1be`; verified: full language suite green at 2001 passed/23 skipped). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D4, and as side effects of the single fix point B53 (`importPath === '.'` now resolves via `path.join`) and B35 (`../` segments normalized). Replaced the strip-quotes→strip-`./`→`path.join` idiom across ~10 sites in 6 files with three shared helpers in `utils/path-utils.ts` (`stripImportQuotes`, `resolveImportRelativePath`, `resolveImportPathToUri`), exported from the package barrel; also removed the three byte-identical `resolveAbsolute*Uri` watcher methods (reinforcing D2). Adds 12 unit tests incl. B53/B35 regressions.

The following cluster was fixed on branch **`refactor/trigger-revalidation-d8-b51`** (merged as PR #63, commit `4faa989`). **Fixed (numbered):** D8, B51 — single `triggerRevalidation(documentUris)` helper in `language/main.ts`; all six CSS/labels/HTML success+error loops delegate to it, parsing each URI once.

The following cluster was fixed on branch **`refactor/library-document-resolution-d30-b4`** (merged as PR #62, commit `55a9a3b`; verified: tsgo typecheck clean, biome lint clean, full language suite green at 2001 passed/23 skipped). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D30, B4. Extracted a private `resolveLibraryNode(libraryImport): Library | undefined` on `EligianValidator` that resolves via the project-wide `resolveLibraryPath()` (the same resolution already used by `checkImportFileExists`, the compiler pipeline, and the scope provider); `checkImportedActionsExist` and `checkImportedActionsPublic` now delegate to it. This collapses two byte-identical resolve→`getDocument`→Library-type-check blocks (D30) and replaces the ad-hoc `substring`/`lastIndexOf('/')` + string-concat URI resolution that skipped normalization on Windows/percent-encoded paths (B4). Pure refactor, net −21 lines.

The following cluster was fixed on branch **`refactor/consolidate-control-flow-pairing-d5`** (verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped, coverage CI passing). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D5. Extracted a private generic `validateControlFlowPairingForOps<N extends AstNode>(operations, node, property, accept)` on `EligianValidator`; the five `checkControlFlowPairing*` methods (regular, endable start/end, inline start/end) now each delegate in one line, differing only in the operation list and the `accept` `property` key. Chips away at the `EligianValidator` god-class anti-pattern.

The following cluster was fixed on branch **`refactor/consolidate-program-root-traversal-d6`** (verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D6. Replaced five inline `while (node.$type !== 'Program')` upward traversals in `eligian-validator.ts` with the existing `this.getProgram(node)` helper, and rewrote `getProgram`/`getLibrary` to delegate to `AstUtils.getContainerOfType(node, isProgram/isLibrary)` (typed `AstNode`, not `any`) — also clearing the paired "manual parent-walk" anti-pattern. Pure refactor.

The following cluster was fixed on branch **`refactor/consolidate-lsp-notifications-d7`** (verified: tsgo typecheck clean for language + extension, biome clean, full language suite green at 2001 passed/23 skipped, 337 extension tests green, build clean). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D7. Extracted shared `AssetUpdatedParams` (`documentUris: string[]`) and `AssetImportsDiscoveredParams` (`documentUri: string`) bases into a new `packages/language/src/lsp/asset-notifications.ts`; the CSS/HTML/labels `*UpdatedParams` and `*ImportsDiscoveredParams` interfaces now `extend` them and keep only their asset-specific file-URI field (`cssFileUri`/`htmlFileUri`/`labelsFileUri`, plus CSS's array `cssFileUris`). The CSS-only `CSSErrorParams` pair is unchanged. All public type/constant names are preserved (the `extension/src/language/main.ts` notification handlers destructure the same fields), so this is a behavior-preserving refactor; the base is barrel-exported from the package `index.ts`.

The following cluster was fixed on branch **`refactor/consolidate-css-registry-queries-d11`** (verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped, coverage CI passing). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D11. Collapsed the six near-identical query methods on `CSSRegistryService` onto two private generics — `collectFromImports<T>(documentUri, select)` (Set-union across a document's imported CSS files) and `findInImports<T>(documentUri, lookup)` (first-truthy match in import order). `getClassesForDocument`/`getIDsForDocument` delegate to the former; `findClassLocation`/`findIDLocation`/`getClassRule`/`getIDRule` delegate to the latter. Public signatures, JSDoc, and behavior (skip-unparsed-files, import-order precedence) are unchanged. Net ~−95 lines.

The following cluster was fixed on branch **`refactor/consolidate-css-operations-d12`** (verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped, coverage CI passing). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D12. New `packages/language/src/css/css-operations.ts` exports the `CLASS_NAME_OPERATIONS` and `SELECTOR_OPERATIONS` Sets as the single source of truth; `context-detection.ts` and `hover-detection.ts` import them and the byte-identical local declarations are deleted. Pure behavior-preserving refactor.

The following cluster was fixed on branch **`refactor/consolidate-time-expression-d14`** (verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped, coverage CI passing). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D14. New `packages/language/src/type-system-typir/utils/time-expression.ts` exports `extractTimeValue` and `parseTimeRange` as the single source of truth; `inference/event-inference.ts` and `validation/event-validation.ts` import them and the two character-identical private copies (including JSDoc and TODOs) are deleted. The pre-existing string-based `utils/time-parser.ts` is an unrelated helper (parses time *strings* like `"5s"`, not AST nodes) and was intentionally left untouched — it remains tracked under the dead/unused-code anti-pattern. Pure behavior-preserving refactor.

The following combined cluster was fixed on branch **`refactor/consolidate-validator-typesystem-dedup`** (verified: tsgo typecheck clean, biome clean on the changed files, full language suite green at 2001 passed/23 skipped, coverage CI passing/exit 0). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D15, D20, D27, D28, D29. A single combined PR consolidating one Typir cluster and four `EligianValidator` clusters (continuing to chip away at the god-class anti-pattern alongside the already-done D5/D6/D30):
- **D15** — new private `resolveTypirPrimitiveType(typeName): PrimitiveType | undefined` on `EligianTypeSystem` is the single source of truth for the string→Typir-type mapping. The three switches (operation `mapParameterTypeToTypirType`, the `Parameter` annotation inference rule, and `createActionFunctionType`) now delegate to it and apply their own fallback (`?? this.stringType` for operation params, `?? this.unknownType` for action/annotation params), preserving each site's prior default behavior.
- **D20** — new `formatValidationMessage(message, hint?)` in `utils/error-builder.ts`; all 13 `error.hint` append sites in `eligian-validator.ts` now route through it. This also resolves the guarded-vs-unguarded inconsistency: the 7 unguarded `` `${message}. ${hint}` `` sites (which appended a literal ". undefined" when no hint was present) are now unified on the guarded behavior.
- **D27** — new private generic `reportDuplicatesByName<T extends AstNode & { name: string }>(items, messageFor, code, accept)`; `checkDuplicateActions`, `checkDuplicateConstants`, and `checkLibraryDuplicateActions` now filter their items and delegate (one `property: 'name' as Properties<T>` cast required for the generic node).
- **D28** — new private `reportActionParameterCountError(opName, parameters, argumentCount, node, accept)`; the three identical local/imported/library expected-vs-actual checks in `checkParameterCount` delegate to it.
- **D29** — new private `reportLabelIDError(node, error, labelId, labelsFileUri, languageCodes, accept)` building the Feature 041 `MissingLabelIDData` quick-fix payload; the three identical diagnostic-data blocks (LabelController arg check + single/array label-ID parameter checks) delegate to it.

All five are pure behavior-preserving refactors (D20's unguarded-form unification is the one intentional, strictly-safer behavior change). Only `eligian-validator.ts`, `type-system-typir/eligian-type-system.ts`, and `utils/error-builder.ts` are changed.

The following combined cluster was fixed on branch **`refactor/errors-module-dedup-d17-d22`** (verified: tsgo typecheck clean for shared-utils/language/extension/cli, biome clean, all suites green — shared-utils 87, language 2001 passed/23 skipped, extension 337, cli 230 passed/19 skipped — language coverage CI passing/exit 0). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D17, D18, D19, D21, D22, D42, B43, B45, B46. A single PR consolidating the errors-module duplication clusters plus the co-located IO-error bugs:
- **D19** — new `hasTag<T>(error, tag)` in `shared-utils/src/tag-guard.ts` is the single source of truth; all 14 `_tag` guards (10 in `errors/type-guards.ts`, 4 in `shared-utils/errors.ts`) delegate, and `isIOError` ORs four `hasTag` calls. This is the fix the earlier revert botched — `hasTag` is *imported* (locally bound), not referenced through the re-export.
- **D21** — dropped the positional overloads from the four compiler-error constructors (object form is used everywhere in production); two test files migrated to object form.
- **D22** — `FileImportErrorBase` + generic `makeImportError<T, P>`; the three import errors intersect the base and their constructors/formatter cases collapse.
- **D17/D18** — `extractDocumentErrors` (pipeline) and `buildFormattedError` (error-reporter) extract the duplicated bodies.
- **D42** — `getBaseName` helper in `formatters.ts`.
- **B45/B46** — the mutually-masking IO-error location bug: `formatLocation` now reads `path` (not `filePath`), and the test literals that had been hiding it are rebuilt via the IO factories.
- **B43** — `mapFileSystemError` passes the raw error as `cause`.

> ⚠️ One auto-proposed fix (compose `isIOError` from leaf guards, type-guards.ts) was **reverted** — it broke 20 tests with a `ReferenceError`; the code at HEAD was already correct. *(Superseded: D19 above recomposes `isIOError` via the imported `hasTag` instead of the re-exported leaf guards, sidestepping the binding problem.)*

The following cluster was fixed on branch **`refactor/cli-bundler-cluster-d31`** (verified: tsgo typecheck clean, biome clean, CLI suite green at 230 passed/19 skipped, esbuild + tsgo build clean). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D31, D32, D34, B7, B41, B42. A single PR consolidating the CLI bundler duplication clusters plus the co-located Effect error-handling bugs:
- **D31** — new `packages/cli/src/bundler/url-utils.ts` is the single source of truth for `isExternalUrl`/`isDataUri`/`resolveAssetPath`; the byte-identical private copies in `asset-collector.ts`, `css-processor.ts`, and `html-generator.ts` are deleted (css-processor's `resolveUrl` and html-generator's `resolveAssetPath` were the same `dirname`+`resolve` logic). `asset-collector.ts` re-exports `resolveAssetPath` to preserve its existing test import. `html-generator.ts` no longer imports `node:path`.
- **D32** — new private `tryAppendAssetSource(assets, absolutePath, source)` in `asset-collector.ts`; the three `collectAssets` upsert blocks (CSS / config / layout-template) now build the `AssetSource` once, early-`continue` on an existing entry, and otherwise fall through to entry creation. Behavior-preserving: files are still read/inlined only for new assets (the early return preserves the original laziness), and the `has`+`get!` double-lookup is removed.
- **D34** — new `printFormattedErrors(header, formatted)` in `main.ts`; `printParseErrors` and `printCompilationErrors` (byte-identical) are deleted and their two call sites pass the header string. `printAssetErrors` (different shape) is unchanged.
- **B7** — `bundleCLI` now uses `Effect.runPromiseExit` + `Cause.failureOption`; the typed `BundleError` (and its `OutputExistsError` subclass) is recovered from the `Cause` instead of `instanceof` against the `FiberFailure` wrapper, and the fragile `String(error).includes(...)` fallback is gone. Defects/interruptions print via `Cause.pretty`.
- **B42** — `extractEffectError`'s `JSON.stringify` round-trip is replaced by `causeToError(cause)` (= `Cause.failureOption` with a `Cause.squash` fallback for defects); both the parse and compile blocks in `compile-file.ts` use `runPromiseExit` and recover the typed `CompilerError` from the `Cause`.
- **B41** — the temp-dir cleanup `Effect.catchAll` in `bundler/index.ts` and the entry-point cleanup in `runtime-bundler.ts` now `console.warn` the failure instead of silently swallowing it.

> Note: **B40** (NaN guard on `--inline-threshold`) was already present in the code at HEAD (`Number.isNaN` check at `main.ts` after `parseInt`) and required no change. **B57** (`outputHelp()` reachability, Low) was left as-is. **B6** was already fixed in `6b1c52a`.

The following "dedup tail" cluster (Track A — the remaining medium/low duplication clusters left after the high-severity sweep) was fixed on branch **`refactor/dedup-tail-track-a`** (verified: `pnpm run typecheck` clean across all packages, biome `check` clean, full suites green — language 2001 passed/23 skipped, extension 337, cli 230 passed/19 skipped, shared-utils 87 — language coverage CI passing/exit 0). Marked **✅ FIXED** inline below.

**Fixed (numbered):** D9, D40, D10, B60, D13, D16, D26, D35, D39, D2c, D41. A single behavior-preserving PR consolidating the remaining mechanical clusters:
- **D9/D40** — new `createEmptyCSSMetadata(errors?)` in `css/css-parser.ts` (barrel-exported); the four hand-rolled empty-`CSSParseResult` literals (compiler pipeline error-fallback, extension `CSS_UPDATED` catch, `CSS_ERROR` handler, and the `processImports` `createEmptyMetadata` thunk) delegate to it.
- **D10/B60** — new `uriToFsPath(uri)` in `utils/path-utils.ts` (barrel-exported) delegating to `URI.parse(uri).fsPath`; the three `.replace('file:///','')` + `decodeURIComponent` sites (`language-block-code-actions.ts`, two in `eligian-code-action-provider.ts`) now use it, fixing the B60 leading-slash/authority bug.
- **D13** — new `createCSSIdentifierEdit(uri, name, content, type)` in `css/code-action-helpers.ts`; `createCSSClassEdit`/`createCSSIDEdit` are now thin wrappers passing `'class'`/`'id'`.
- **D16** — new `buildActionCallOperations(actionName, actionOperationData, sourceLocation, verb)` in `ast-transformer.ts`; the four hand-coded `requestAction` + (`startAction`|`endAction`) triplets (sequence items, stagger items, timeline action calls, inline operation statements) delegate to it.
- **D26** — `extractParameters(properties)` and `extractOutputs(outputProperties)` extracted in `completion/generate-metadata.ts`; `convertOperationMetadata`/`convertControllerMetadata` delegate.
- **D35** — extracted the shared resolve-path → cycle-check → `getDocument` → `isLibrary` step into a private `resolveLibraryDocument(fromUri, importPath, visited)`; `resolveImports` and `resolveLibraryImports` delegate. *(Conservative scope: their divergent action-collection semantics — selective+alias vs whole-library — are intentionally left intact, since merging them would risk changing compilation output.)*
- **D39** — `locale-serializer.ts` was already removed in earlier work (no longer tracked/present); no action required.
- **D2c** — new generic `debounce<K>(timers, key, delay, fn)` in `extension/debounce-util.ts`; `FileImportWatcherManager.debounceChange` (the D1 base) and the preview `FileWatcher` now delegate, replacing their hand-rolled clear-timer/setTimeout/delete-on-fire blocks.
- **D41** — `jsdoc-formatter.ts` `formatJSDocAsMarkdown` now builds via `MarkdownBuilder` instead of the manual `lines.push`/`join` array (output byte-identical).

The following four co-located cleanup batches were fixed on branch **`fix/medium-bug-tail-batches`** (verified: `pnpm run typecheck` clean across all packages, biome `check` clean — only 4 pre-existing `useOptionalChain` warnings remain in the untouched `eligian-scope-provider.ts` — full suites green at baseline: language 2001 passed/23 skipped, extension 337, cli 230 passed/19 skipped, shared-utils 87; language coverage CI passing/exit 0). Marked **✅ FIXED** inline below.

**Fixed (numbered):** B24, B25, B26, B32, B33, B36, B37, B38, B39, B48, B49 — eleven Medium bugs, grouped by module:
- **Batch A — asset-loading correctness:** **B36** (CST `range.start` is 0-based; import `SourceLocation` now `+ 1` to match `getSourceLocation`), **B37** (`provider` imports no longer read the binary media file into memory as a UTF-8 string only to discard it), **B38** (`IAssetValidationService.validateAsset` interface union now includes `'json'`, matching the implementation), **B39** (`loadProgramAssets` locales branch now runs the AJV `validateLocalesJSON` schema check instead of bare `JSON.parse`, so structurally-invalid-but-parseable locale files are rejected).
- **Batch B — extension resource leaks:** **B48** (`PreviewManager` singleton torn down via a new static `disposeInstance()` pushed into `context.subscriptions`), **B49** (the `'Eligian Compiler'` output channel is created once via a lazy module-level getter and disposed through `context.subscriptions`, instead of a fresh channel per failed compile). Also removed the leftover `LABELS_IMPORTS_DISCOVERED` `console.error` in `extension/main.ts` (the trailing half of B54) and added `disposeBlockLabelServices()` wiring.
- **Batch C — validator performance:** **B24** (`checkRecursiveActionCalls` DFS now carries a finished-node `visited` set — standard white/gray/black coloring — eliminating the O(M^N) re-exploration; cycle reporting is preserved and deduplicated), **B25** (`checkLocalesImports` is now `async` and uses `fs.promises` + a non-throwing `fileExistsAsync`, so LSP validation no longer blocks the event loop on synchronous disk I/O).
- **Batch D — completion correctness:** **B26** (`EligianHoverProvider.services` is now a required, concretely-typed `EligianServices`; the `{ References: {} }` mock that silently disabled JSDoc hover is gone — all call sites already pass real services), **B33** (`detectControllerContext` parameter index now counts complete quoted-string literals with escape handling rather than halving a raw quote count, fixing `addController("O'Brien", …)` miscounts). **B32** was **verified already-resolved** in prior unmarked work (the `eventAction.eventName` early-return is gone; the regex gate handles re-editing an existing event name).

**Also fixed (anti-patterns):**
- **`checkImportNameCollisions` O(N²)** — moved from a per-`LibraryImport` check to a single Program-level validator that scans all imports once (local-conflict lookup also switched to a `Set`); this removes the redundant full re-scan per import and the duplicate diagnostics it emitted.
- **Singleton `EligianServices` in `block-label-detector` with no disposal** — exposed `disposeServices()`, wired into the extension's `deactivate()` via `context.subscriptions` (pairs with B47).

Deliberately **deferred** (risky / cross-cutting, left for focused follow-ups consistent with this report's "manual review" policy): **B47**'s LSP-request migration (see note in the summary), the **deprecated `AssetError` → discriminated-union migration**, the **double media file-existence check**, and **`getImportedActions` memoization** (a naive cache would hold stale library-AST nodes across document rebuilds — a correctness hazard worse than the perf cost; needs build-cycle-aware invalidation).

The high-severity report-only items deliberately **not** auto-applied (require real refactors / control-flow changes): **B2** (`Effect.runSync` crash path), **B3** (module-level `currentConstantMap` state leak), and all duplication-cluster refactors (D1, etc.).

The following correctness + dedup-tail batch was fixed on branch **`fix/correctness-batches-b2-b14`** (verified: `pnpm run typecheck` clean across all packages, biome `check` clean, full suites green — language 2001 passed/23 skipped, extension 337, cli 230 passed/19 skipped — language coverage CI passing/exit 0, full `pnpm run build` clean). Marked **✅ FIXED** inline below.

**Fixed (numbered):** B2, B3 (the two deferred compiler-correctness defects), and D24, D25, D43, D44 (the remaining duplication tail — the Duplication category is now fully resolved). This batch also **verified and marked** B5, B9, B13, B14, B34, which had already been correctly implemented in prior work but were left unmarked in this report.
- **B2** — `transformEventAction` converted to an `Effect`-returning function composed with `yield*`; inner failures flow through the typed `TransformError` channel instead of crashing via `Effect.runSync`; missing `eventName` is now an `InvalidEvent` failure rather than a `throw`.
- **B3** — module-level `currentConstantMap` removed; the constant map is built once per `transformAST` call and threaded through a new `ScopeContext.programConstants` field (inherited by derived scopes via spread, injected into root scopes via new `programConstants` parameters), eliminating the concurrent-compilation state-leak.
- **D24** — `validateHtml`/`validateCss` collapsed onto a private generic `validateContentFile(...)`.
- **D25** — `inferImportAssetType` delegates extension inference to the shared `inferAssetType`.
- **D43** — `ERROR_MESSAGES.ABSOLUTE_PATH`/`INVALID_PATH_FORMAT` are now zero-arg functions for shape consistency; the call site drops its arrow wrapper.
- **D44** — generic `ValidationResult<TError>` base; the three per-asset result types are aliases.

The following "bug-tail final" batch was fixed on branch **`fix/bug-tail-final`** (verified: `pnpm run typecheck` clean across all packages, biome `check` clean — only the 4 pre-existing `useOptionalChain` warnings remain in the untouched `eligian-scope-provider.ts` — full suites green at baseline: language 2001 passed/23 skipped, extension 337, cli 230 passed/19 skipped, shared-utils 87). Marked **✅ FIXED** inline below.

**Fixed (numbered):** B31, B44, B52, B55, B57, B59, B61 — the last seven straightforward bugs in the tail, grouped by module:
- **Batch A — Typir validation:** **B31** (relaxed `isValidCSSSelector` to accept whitespace/commas/combinators/attribute/pseudo selectors so `#app .container` and selector lists validate; added empty-selector guard + broader error message). *(B30 in the same module was investigated and **reverted** at this point — removing the WeakSet doubled the duplicate-import diagnostics — but was **later fully fixed** on branch `fix/b30-typir-double-invocation` once the root cause (a redundant `registerTypirValidationChecks` call in `eligian-module.ts`) was identified; see its inline note below.)*
- **Batch B — language pure-logic:** **B59** (single-quote branch of `extractPartialText` now clamps to the closing quote like the double-quote branch), **B55** (`getVisibleVariables` collects globals from top-level `program.statements` only, no longer leaking other actions' locals via `streamAst`), **B61** (`extractLocalesFilePaths` uses a `DefaultImport` type-predicate filter, dropping the unreachable double-guard / `''` branch / dead trailing filter).
- **Batch C — shared-utils + CLI:** **B44** (`resolvePaths` Windows branch uses `path.win32.resolve` to resolve `../`/`.` in-place instead of relying on downstream normalization), **B57** (removed the unreachable `outputHelp()` fallback — Commander exits on the missing required `<input>` arg during `parse()`).
- **Batch D — extension:** **B52** (`import-processor` one-to-one path registers/notifies the first occurrence and `console.warn`s on multiples, ending the silent drop of all-but-the-last).

**Also fixed (anti-pattern):** the **`getOrCreateServices()` phantom-test-CSS production leak** — the fixture class/ID seeding is extracted into `registerTestCSSFixtures()` and gated behind `process.env.VITEST`, so real user documents compiled in production no longer pass CSS-class validation against classes their stylesheets never define.

The following **anti-pattern cleanup batch (Batch 1 — dead/stub code + `any`-typing)** was fixed on branch **`refactor/anti-pattern-cleanup-batch-1`** (verified: `pnpm run typecheck` clean across all packages, `pnpm run check` clean — only the 4 pre-existing `useOptionalChain` warnings remain in the untouched `eligian-scope-provider.ts` — full suites green: language 1994 passed/23 skipped, extension 337, cli 202 passed/19 skipped, shared-utils 87; full `pnpm run build` clean). The two reduced test counts vs. the prior baseline are exactly the two orphan specs deleted with their dead modules (`image-inliner.spec.ts` ~28 tests, `time-parser.spec.ts` ~7 tests). Marked **✅ FIXED** inline below.

This batch drains the mechanical, behavior-preserving anti-patterns ahead of the god-class decomposition (the next, larger effort). Items fixed, grouped by theme:

- **Dead/stub code in public surface:**
  - **`compileFile` stub** — the permanently-failing placeholder in `pipeline.ts` (and its `compiler/index.ts` barrel export) is deleted. It was never consumed inside the language package; the CLI's own real `compileFile` (`packages/cli/src/compile-file.ts`) is unaffected.
  - **`image-inliner.ts` (`inlineImage`/`shouldInline`)** — deleted along with its orphan spec. Production inlining lives entirely in `asset-collector.ts` (`shouldInlineAsset` + inline base64); the module was referenced only by its own tests. `InlineDecision`/`getMimeType`/`NEVER_INLINE_EXTENSIONS` remain in `bundler/types.ts`.
  - **`time-parser.ts` (`parseTimeExpression`)** — deleted along with its orphan spec. It parsed time *strings* and was referenced only by its own tests (the AST-node time helpers consolidated under D14 live in `time-expression.ts`). README file-tree updated.
  - **Deprecated label exports** — `generateLabelEntry`/`LabelEntry`/`TranslationEntry` (old array-based label format) removed from `label-entry-generator.ts` and the package barrel. They were exported but unused; `generateLocaleEntry`/`mergeLocaleEntry` are the live API.
- **Empty/dead branches:**
  - **Magic `CompletionItemKind` literals + type-only import** (`eligian-completion-provider.ts`) — `CompletionItemKind` is now imported as a value and the `2`/`3`/`12`/`14`/`18` literals are replaced with `CompletionItemKind.Method`/`.Function`/`.Value`/`.Constant`/`.Reference`. *(The `kind === Method` branch in the `isInsideArguments` filter was **retained**, not removed: verification showed it filters the provider's own `"action:"`-prefixed action items in expression position — it is not dead. Removing it is a behavior change and was intentionally left out of this mechanical batch.)*
- **Pervasive `any` / lost type safety:**
  - **`EligianValidator.services`** is now a required, non-optional `EligianServices` (constructor + field). It is only ever constructed via `eligian-module.ts` with real services, so the `if (!this.services) return;` guards are now provably redundant but were left in place (behavior-preserving); the type no longer advertises a never-occurring undefined that silently skipped checks.
  - **`buildCSSIdentifierInfo`** (`css-hover.ts`) is now generic `<M>` over the metadata shape instead of `any`; the two callers infer `M` from their `getMetadata` return type.
  - **`detectClassNameHover`** (`hover-detection.ts`) — the unused `_operationCall: any` parameter is removed (caller updated).
  - **`extractElementName`** (`html/context-detection.ts`) — `arg: any` → `arg: AstNode | undefined`.
  - **`getTimelines`/`getVariables`** (`program-helpers.ts`) — the `$type` string compare + `as`-cast is replaced with the generated `isTimeline`/`isVariableDeclaration` type guards.
  - **`findActionBelow`** (`ast-navigation.ts`) — the `root: any` / `items: any[]` + `$type` string compares are replaced with the generated `isProgram`/`isLibrary` guards and an `AstNode[]` item list.

**Deliberately deferred** (listed under dead/stub but the fix is a migration, not a mechanical edit — both change exported public types and ripple into multiple consumers + test suites; left for a focused follow-up where the API change is the headline):
- **Deprecated `AssetError` interface → discriminated union** — actively consumed by `asset-validation-service.ts`/`compiler-integration.ts`; migrating changes the error shape callers destructure.
- **`PathResolutionResult` one-armed union** — `resolvePath` always returns `{ success: true }`; collapsing to a bare `string` (or adding a real failure variant) touches 4 production callers' dead-branch guards plus ~15 assertions across `path-resolver.spec.ts` and `cross-platform.spec.ts`.

The two **deferred type migrations** above were then completed on branch **`refactor/deferred-type-migrations-batch-2`** (verified: `pnpm run typecheck` clean across all packages, `pnpm run check` clean — only the 4 pre-existing `useOptionalChain` warnings remain in the untouched `eligian-scope-provider.ts` — full suites green: shared-utils 87, language 1995 passed/23 skipped, cli 202 passed/19 skipped, extension 337; language coverage CI passing/exit 0; full `pnpm run build` clean). Marked **✅ FIXED** inline below.

- **`PathResolutionResult` → `string`** — the one-armed `{ success: true; absolutePath }` result type is deleted; `resolvePath` returns the normalized path directly. The genuine consumers (`node-asset-loader.ts`, `compiler/html-import-utils.ts`, `extension/preview/MediaResolver.ts`) drop their `.absolutePath` unwrap. The report's cited "dead-branch guards" at `node-asset-loader.ts:89`/`html-import-utils.ts:42`/`css-service.ts:202` were re-verified to be `FileLoadResult` (`loadFileSync`/`loadFileAsync`) guards, **not** `resolvePath` results — `resolvePath` never had a failure arm — so they are left intact. ~30 `.success`/`.absolutePath` assertions across `path-resolver.spec.ts`/`cross-platform.spec.ts` rewritten.
- **`AssetError` interface → unified discriminated union** — the flat `asset-loading/types.ts` `AssetError` interface and its barrel re-export are deleted; the unified `errors/asset-errors.ts` union gained a new **`LocalesImportError`** member (constructor `createLocalesImportError`, guard `isLocalesImportError`, `isAssetError`/barrel/formatter/exhaustive-matcher coverage) to carry the locales/JSON `validation-error` case the old flat `type` enum encoded. Producers now emit proper per-type union members keyed on `_tag`: `AssetValidationService` via a new `buildMissingFileError` + per-builder content/load callbacks (HTML→`HtmlImportError`, CSS content→`CssParseError`, CSS/media/locales import failures→their import errors), and `loadProgramAssets` via a new `buildLoadError`. `IAssetValidationService` and `AssetLoadingResult.errors` type against the union. The CLI's own `AssetError` *class* and `printAssetErrors` are unchanged — a single `toCliAssetError` adapter in `compile-file.ts` maps each `_tag` to the CLI's flat shape (`location`→`sourceLocation`, HTML/CssParse line+column→`details`), preserving terminal output. `asset-validation-service.spec.ts`/`compiler-integration.spec.ts` updated from `.type`/`.sourceLocation` to `._tag`/`.location`. *(The SSOT meta-tests are satisfied: the union remains the single `export type AssetError` definition.)*

The following **anti-pattern Tier 1 batch (encapsulation / API hygiene + unsafe-cast/silent-failure + perf-doc + the locale-editor correctness cluster)** was fixed on branch **`refactor/anti-pattern-tier1-encapsulation-cleanup`** (verified: `pnpm run typecheck` clean across all packages, `pnpm run check` clean — only the pre-existing `useOptionalChain` warnings remain, none in the changed lines — full suites green at baseline: shared-utils 87, language 1995 passed/23 skipped, extension 337, cli 202 passed/19 skipped; full `pnpm run build` clean). This drains every remaining mechanical/behavior-preserving anti-pattern, leaving only the two god-class decompositions and two deliberately-deferred perf items. Sixteen bullets fixed, grouped by theme:

- **Locale-editor correctness cluster** (`LocaleEditorProvider.ts` + `locale-editor-utils.ts` + `media/locale-editor.ts`):
  - **`renameKeyInConfig` branch-key drop** — `setAtPath` now accepts `string | TLocaleData` and the rename guard moved from `typeof value === 'string'` to `value !== undefined` (functions are already filtered out by `getAtPath`), so renaming an intermediate (branch) key moves the whole subtree instead of silently dropping it.
  - **`check-usage`/`request-delete` `'key' in message` + `any` casts** — the `(message as any).groupId` casts are gone; the handler now narrows the two protocols via `'key' in message` (`in`-operator discriminator) so the legacy `groupId`/`index` fields are properly typed.
  - **Unhandled `document.save()`/`showWarningMessage()` rejections** — `handleWebviewMessage` is now `async`; the four save/confirm sites `await` through new `trySaveDocument`/`tryShowWarning` helpers that try/catch and report failure (`save-complete:false` / treat as not-confirmed) instead of leaving a thenable to reject unobserved. The `onDidReceiveMessage` callback marks the handler `void` (it owns its I/O + error reporting).
  - **`getHtmlForWebview` synchronous `fs.readFileSync` per open** — the static template is read once and cached in a new `htmlTemplate` field; per-webview placeholder substitution still runs each call.
  - **`media/locale-editor.ts` mutates state ignoring core pure fns** — the divergent inline `selectedKey`/`expandedKeys` mutations (leaf-click select, branch toggle, and the `select-key` message) now route through core `selectKey`/`toggleExpanded` via a new `applyLocaleTransition` write-back helper that copies the pure result onto the in-place `localeState` singleton (preserving the `window.__localeEditorNewState` test contract).
  - **Global `window.__pendingDeleteIndex` side-channel** — replaced with a module-level `let pendingDeleteIndex: number | null`.
  - **29 debug `console.log/trace`** — all routed through new `debugLog`/`debugTrace` helpers gated behind `window.__localeEditorDebug`; production console stays quiet.
  - **`locale-editor.ts` re-exports types it re-declares** — the dead `export type { EditorState, LabelGroup, Translation, ValidationError }` re-export (nothing imports from the webview bundle) is removed.
- **Encapsulation / API hygiene:**
  - **`getDocumentImports` returns the internal Set by reference** — now returns `new Set(imports)` (defensive copy).
  - **`createValidationError` (utility) shadows the domain constructor** — the `utils/error-builder.ts` helper is renamed `buildValidationError` (4 validator callers + its own spec updated); the `errors/` domain `createValidationError` constructor is untouched.
  - **`getAllOperations` JSDoc implied runtime filtering** — reworded to state it performs no runtime filtering; keyword-handled ops are excluded from `OPERATIONS` at code-generation time (`isFilteredOperation` is the runtime check).
- **Performance / I/O (documentation):**
  - **`mapParameterTypeToTypirType` first-param-only** — documented the single-type constraint (multi-type params are not yet modelled as a union; additional declared types are intentionally ignored).
- **Unsafe casts / silent failures:**
  - **Blind `as NodeJS.ErrnoException`** (`file-loader.ts`) — guarded with `error instanceof Error` before reading `.code`; a non-Error throwable now falls through to the generic read error.
- **Other:**
  - **`EligianTypeSystem._typirServices` `!` without guard** — the `typirServices` getter now throws a clear error if accessed before `onInitialize()` instead of returning `undefined`.
  - **`LanguagesType` cache key omits `allLanguages`** — `calculateLanguagesTypeIdentifier` now appends `allLanguages.join(',')`, so two blocks with the same count+default but different language sets no longer alias onto one cached type.
- **Effect/error-handling fragility:**
  - **Top-level `await fs.readFile(package.json)` with no try/catch** (`cli/main.ts`) — moved into a `readPackageVersion()` helper that falls back to `'0.0.0'` on a missing/unreadable file.

The following **perf batch (Batch B — the two deliberately-deferred performance items)** was fixed on branch **`perf/batch-b-getimportedactions-double-filecheck`** (verified: `pnpm run typecheck` clean across all packages, biome `check` clean on the changed files — only the pre-existing `useOptionalChain` warnings remain in the untouched parts of `eligian-scope-provider.ts` — full language suite green at baseline 1995 passed/23 skipped, language coverage CI exit 0). This closes the last non-bug items in the report; only the two deferred bugs (B30, B47) remained at the time of this batch. Marked **✅ FIXED** inline below. *(Both have since been fixed on branch `fix/b30-typir-double-invocation`; no bugs remain.)*

- **`getImportedActions` memoization** — the recursive body is extracted into a private `computeImportedActions`; the public `getImportedActions` memoizes only the **top-level** invocation (`visited.size === 0`, which reliably identifies an external caller since recursion always carries a non-empty cycle-detection set) keyed on the document URI string in a new `WorkspaceCache<string, ActionDefinition[]>`. `WorkspaceCache` is the build-cycle-aware invalidation the report flagged as the prerequisite: the result depends on *other* documents (the imported libraries), so it must evict whenever any workspace document is added/changed/deleted — exactly `WorkspaceCache`'s contract. A naive `Map` would have held stale library AST across rebuilds (a correctness hazard) and a `DocumentCache` keyed on the importing document would have missed edits to the libraries it imports. Recursive calls stay uncached because their result depends on the caller's `visited` cut-off state.
- **Double media file-existence check** — `validateAsset`'s shared top-level `assetLoader.fileExists` guard now skips media (`assetType !== 'media' && !fileExists(...)`). Media is the only asset type whose dedicated validator (`MediaValidator`, invoked via `validateMedia`) already performs its own existence + is-file check (`existsSync` + `statSync`), so the top-level stat was the redundant one; the content assets (html/css/json) keep the guard because their validators load file contents and assume existence. Behavior-preserving: a missing media file still yields a `MediaImportError` whose message contains "not found" (the only thing the spec asserts), while `MediaValidator`'s is-file/directory and empty-path branches are now strictly more reachable.

---

## Glaring Bugs

Ordered by severity (High first), grouped where the same root cause spans modules.

### High Severity

#### B1. CSS directory resolution uses `||` instead of logical max — empty path on Unix
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** High
**Locations:** [pipeline.ts:311](packages/language/src/compiler/pipeline.ts#L311)
`docDir` is computed as `docPath.substring(0, docPath.lastIndexOf('\\') || docPath.lastIndexOf('/'))`. On any path without a backslash, `lastIndexOf('\\')` returns `-1` (truthy), so `||` short-circuits and `substring(0, -1)` returns `''` — making `docDir` empty on all non-Windows systems and silently breaking every CSS file resolution in the compiler pipeline. `Math.max(...)` is already used correctly in `resolveLibraryPath` at line 640.
**Fix:** Add `import * as path from 'node:path';` and replace the expression with `path.dirname(docPath)`.

#### B2. `transformEventAction` uses `Effect.runSync` and can crash the whole compiler
> ✅ **FIXED** — branch `fix/correctness-batches-b2-b14` (`transformEventAction` is now an `Effect.Effect<IEventActionConfiguration, TransformError>` composed with `yield*`; the inner `transformOperationStatement` failures propagate through the typed channel instead of escaping `Effect.runSync` as an unhandled fiber crash, and the missing-`eventName` case is an `InvalidEvent` `Effect.fail` rather than a synchronous `throw`. Call site in `transformAST` `yield*`s it; the 7 test call sites wrap in `Effect.runSync`. Fixed together with B3.)
**Severity:** High
**Locations:** [ast-transformer.ts:2311](packages/language/src/compiler/ast-transformer.ts#L2311), [ast-transformer.ts:2335](packages/language/src/compiler/ast-transformer.ts#L2335)
The synchronous `transformEventAction` calls `Effect.runSync(transformOperationStatement(...))` from inside the `Effect.gen` body of `transformAST`. A failing inner Effect throws a synchronous exception that escapes the typed error channel as an unhandled fiber crash instead of a structured `TransformError`.
**Fix:** Convert `transformEventAction` to return `Effect.Effect<IEventActionConfiguration, TransformError>` and use `yield*` composition; update the call site in `transformAST`.

#### B3. Module-level mutable `currentConstantMap` leaks state between concurrent compilations
> ✅ **FIXED** — branch `fix/correctness-batches-b2-b14` (the module-level `let currentConstantMap` is removed; the map is built once per `transformAST` call as a local `const` and threaded through `ScopeContext.programConstants`. Every derived scope inherits it via the existing `...scope` spread; root scopes (action/event/timeline/sequence/stagger/timed-event) and the handful of no-scope `transformExpression` call sites receive it explicitly through new `programConstants` parameters on `transformActionDefinition`/`buildTimelineConfig`/`transformSequenceBlock`/`transformStaggerBlock`/`transformTimedEvent`/`transformEventAction`. Concurrent compilations can no longer clobber each other.)
**Severity:** High
**Locations:** [ast-transformer.ts:116](packages/language/src/compiler/ast-transformer.ts#L116), [ast-transformer.ts:282](packages/language/src/compiler/ast-transformer.ts#L282)
A module-level `let currentConstantMap` is reassigned at the start of every `transformAST` call. In a language-server context, two overlapping compilations clobber each other's constant maps, producing incorrect constant inlining. The code comment acknowledges the hazard.
**Fix:** Pass `constantMap` explicitly through `transformAST` and all consumers; remove the module-level variable.

#### B4. Two validators use ad-hoc URI resolution instead of `resolveLibraryPath`
> ✅ **FIXED** — branch `refactor/library-document-resolution-d30-b4` (both validators now resolve via the shared `resolveLibraryNode` helper using `resolveLibraryPath`; fixed together with D30)
**Severity:** High
**Locations:** [eligian-validator.ts:2573](packages/language/src/eligian-validator.ts#L2573), [eligian-validator.ts:2579](packages/language/src/eligian-validator.ts#L2579), [eligian-validator.ts:2707](packages/language/src/eligian-validator.ts#L2707), [eligian-validator.ts:2713](packages/language/src/eligian-validator.ts#L2713)
`checkImportedActionsExist` and `checkImportedActionsPublic` resolve the library URI via `substring`/`lastIndexOf('/')` + string concatenation rather than the project-wide `resolveLibraryPath()` (already imported, and used correctly by `checkImportFileExists` at line 2538). The ad-hoc approach skips normalization and is inconsistent with workspace-loaded documents on Windows/encoded paths. (Also surfaced as anti-pattern in `dup-validators`.)
**Fix:** Replace both blocks with `const resolvedUri = resolveLibraryPath(documentUri, originalPath);`.

#### B5. `ensureLabelsImportsRegistered` is a no-op stub — label ID validation silently passes
> ✅ **FIXED** — verified on branch `fix/correctness-batches-b2-b14` (already implemented in prior work, previously unmarked): `ensureLabelsImportsRegistered` now inlines the locale-loading logic (resolve → `fs.readFileSync` → `extractTranslationKeys` → `updateLabelsFile`/`registerImports`) and tracks completed documents in a dedicated `private readonly initializedLabelDocuments = new Set<string>()` — exactly the recommended fix — so an empty registry is no longer mistaken for "not yet registered." Wired into both label-ID operation validators.
**Severity:** High
**Locations:** [eligian-validator.ts:1836](packages/language/src/eligian-validator.ts#L1836), [eligian-validator.ts:1842](packages/language/src/eligian-validator.ts#L1842), [eligian-validator.ts:1856](packages/language/src/eligian-validator.ts#L1856)
The method finds locales imports but falls through to a TODO and returns without registering them; the real loading lives in `checkLocalesImports`. The early-exit guard treats an empty registry as "not yet registered," so when validator ordering runs label checks first, `validateLabelID` operates on a stale empty registry.
**Fix:** Inline the locale-loading logic and track initialized document URIs in a dedicated `Set<string>`, or populate the registry via `registerBeforeDocument`.

#### B6. Redundant `try/catch` around `yield* Effect.tryPromise` — catch branch is dead code
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** High
**Locations:** [bundler/index.ts:112-119](packages/cli/src/bundler/index.ts#L112), [image-inliner.ts:34-43](packages/cli/src/bundler/image-inliner.ts#L34), [image-inliner.ts:78-85](packages/cli/src/bundler/image-inliner.ts#L78), [runtime-bundler.ts:219-226](packages/cli/src/bundler/runtime-bundler.ts#L219)
Inside `Effect.gen`, `yield*` on a failed Effect short-circuits via the Effect protocol — it does not throw — so the outer `catch` can never run, and its error mapping is silently dead. The `catch` variable would capture an iterator-completion object, not the typed error.
**Fix:** Remove the outer `try/catch`; the bare `yield* Effect.tryPromise({...})` already propagates the typed failure.
**Research notes:** Confirmed via Effect-ts docs — `Effect.gen` uses a generator adapter where `yield*` communicates failures through the Effect channel, not by throwing.

#### B7. `bundleCLI` checks `instanceof BundleError` after `Effect.runPromise` — always misses FiberFailure
> ✅ **FIXED** — branch `refactor/cli-bundler-cluster-d31` (`bundleCLI` now uses `runPromiseExit` + `Cause.failureOption`; the typed `BundleError`/`OutputExistsError` is recovered from the `Cause`, and the `String(error).includes(...)` fallback is removed)
**Severity:** High
**Locations:** [main.ts:192](packages/cli/src/main.ts#L192), [main.ts:209](packages/cli/src/main.ts#L209), [main.ts:214-219](packages/cli/src/main.ts#L214)
`Effect.runPromise` rejects with a `FiberFailure` wrapper, not the raw `BundleError`, so `instanceof BundleError` is always false and the code falls back to fragile string matching. `OutputExistsError` cannot be distinguished and structured error data is lost.
**Fix:** Use `Effect.runPromiseExit` + `Cause.failureOption`, or `Effect.either`/`Effect.catchAll` inside the pipeline before `runPromise`.
**Research notes:** Confirmed via Effect-ts docs — `runPromise` wraps failures in `FiberFailure`; use `runPromiseExit`/`Cause.failureOption`/`Effect.matchCause`.

#### B8. Operator-precedence bug defeats token-boundary guard for single-quoted CSS strings
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** High
**Locations:** [css-completion.ts:62](packages/language/src/css/css-completion.ts#L62), [css-completion.ts:64](packages/language/src/css/css-completion.ts#L64), [css-completion.ts:65](packages/language/src/css/css-completion.ts#L65)
`(hasTokenBoundaries && text[tokenOffset] === '"') || text[tokenOffset] === "'"` leaves the single-quote branch outside the guard. When `text` is `undefined` (optional chaining at line 56), the unguarded branch evaluates `undefined[tokenOffset]` and throws a `TypeError`.
**Fix:** `const insideString = hasTokenBoundaries && (text[tokenOffset] === '"' || text[tokenOffset] === "'");` then simplify the `if (insideString && text)` to `if (insideString)`.

#### B9. `detectSelectorHover` always returns the first class/ID, ignoring cursor position
> ✅ **FIXED** — verified on branch `fix/correctness-batches-b2-b14` (already implemented in prior work, previously unmarked): `detectSelectorHover` now translates `params.position` into an offset relative to the string-literal CST node (`textDocument.offsetAt(params.position) - (cstNode.offset + 1)`) and resolves the exact identifier via `findIdentifierAtOffset`, falling back to the first identifier only when position info is unavailable. Pairs with B34.
**Severity:** High
**Locations:** [hover-detection.ts:121](packages/language/src/css/hover-detection.ts#L121), [hover-detection.ts:139](packages/language/src/css/hover-detection.ts#L139), [hover-detection.ts:149](packages/language/src/css/hover-detection.ts#L149)
The `_params: HoverParams` argument is unused; the function returns `classes[0]`/`ids[0]` regardless of where the cursor is. For `.button.primary`, hovering `.primary` always reports `.button`.
**Fix:** Compute the character offset from `params.position` and the string literal's CST range, then resolve the identifier via `findIdentifierAtOffset` (after fixing B-stub below) using postcss-selector-parser `sourceIndex`.

#### B10. Typir inference callbacks return `CustomTypeConfigurationChain` instead of a resolved `Type`
> ✅ **FIXED** — commit `220b552`
**Severity:** High
**Locations:** [event-inference.ts:112](packages/language/src/type-system-typir/inference/event-inference.ts#L112), [event-inference.ts:143](packages/language/src/type-system-typir/inference/event-inference.ts#L143), [event-inference.ts:169](packages/language/src/type-system-typir/inference/event-inference.ts#L169), [import-inference.ts:86](packages/language/src/type-system-typir/inference/import-inference.ts#L86), [import-inference.ts:118](packages/language/src/type-system-typir/inference/import-inference.ts#L118), [languages-inference.ts:75](packages/language/src/type-system-typir/inference/languages-inference.ts#L75)
The callbacks return `factory.create({...})` directly. `CustomKind.create()` returns a `CustomTypeConfigurationChain`, which is none of the four shapes `inferTypeLogicWithoutChildren` accepts, so it is treated as a language node and re-inferred, causing inference failures. `timeline-inference.ts` correctly calls `.finish().getTypeFinal()` first.
**Fix:** `const type = factory.create({...}).finish().getTypeFinal(); return type ?? InferenceRuleNotApplicable;`
**Research notes:** Verified against Typir source — `CustomTypeConfigurationChain` exposes only `inferenceRule()`/`finish()`; `inferTypeLogicWithoutChildren` accepts `InferenceRuleNotApplicable`, a real `Type`, an `InferenceProblem`, or a language node.

#### B11. `timeline-inference` `getTypeFinal()!` non-null assertion can return undefined
> ✅ **FIXED** — commit `220b552`
**Severity:** High
**Locations:** [timeline-inference.ts:67](packages/language/src/type-system-typir/inference/timeline-inference.ts#L67)
`getTypeFinal()` returns `T | undefined`; it is only set once the type switches to identifiable. For unresolved property descriptors the type stays in the initial state and the `!` becomes a runtime crash.
**Fix:** `const type = ...finish().getTypeFinal(); return type ?? InferenceRuleNotApplicable;`
**Research notes:** Verified against Typir `type-initializer.ts` / `custom-initializer.ts` — `typeToReturn` starts `undefined` and is set asynchronously via a listener.

#### B12. All `CustomKind` factory fields/getters typed `any`, discarding type safety
> ✅ **FIXED** — commit `220b552`
**Severity:** High (anti-pattern with bug-masking impact)
**Locations:** [eligian-type-system.ts:56](packages/language/src/type-system-typir/eligian-type-system.ts#L56), [eligian-type-system.ts:63](packages/language/src/type-system-typir/eligian-type-system.ts#L63), [event-inference.ts:92](packages/language/src/type-system-typir/inference/event-inference.ts#L92), [import-inference.ts:67](packages/language/src/type-system-typir/inference/import-inference.ts#L67), [languages-inference.ts:37](packages/language/src/type-system-typir/inference/languages-inference.ts#L37)
Six factory/type fields and their getters are typed `any`, propagating into inference modules and masking the `'json'` AssetType mismatch (B13) at compile time. (Listed here because it directly hides a real bug; also tracked under anti-patterns.)
**Fix:** Type each field with its concrete generic, e.g. `private _importFactory: CustomKind<ImportTypeProperties, EligianSpecifics>`.

#### B13. `getAvailableVariables` always returns `'action'`-scoped variables regardless of context
> ✅ **FIXED** — verified on branch `fix/correctness-batches-b2-b14` (already implemented in prior work, previously unmarked): `getAvailableVariables(isInsideLoop, isInsideAction)` now takes the `isInsideAction` flag and the `'action'` branch returns it; the call site in `variables.ts` passes `cursorContext.isInsideAction`.
**Severity:** High
**Locations:** [variable-metadata.ts:110](packages/language/src/completion/variable-metadata.ts#L110), [variable-metadata.ts:118](packages/language/src/completion/variable-metadata.ts#L118), [variables.ts:50](packages/language/src/completion/variables.ts#L50)
The `'action'` case falls through to `return true`, so `@@whenEvaluation` (marked `availableIn: 'action'`) is always offered. `CursorContext.isInsideAction` exists but is never passed in.
**Fix:** Add `isInsideAction: boolean` param, change the `'action'` branch to `return isInsideAction;`, pass `cursorContext.isInsideAction` at the call site.

#### B14. `eligian.openLabelEditor` command ignores its argument
> ✅ **FIXED** — verified on branch `fix/correctness-batches-b2-b14` (already implemented in prior work, previously unmarked): the `eligian.openLabelEditor` handler now accepts an optional `fileUri?: vscode.Uri` and, when present, opens it directly via `executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor')` instead of always reading `activeTextEditor`.
**Severity:** High
**Locations:** [label-file-creator.ts:141](packages/extension/src/extension/label-file-creator.ts#L141), [main.ts:474](packages/extension/src/extension/main.ts#L474)
`executeCommand('eligian.openLabelEditor', fileUri)` passes a Uri, but the registered handler takes zero params and always reads `activeTextEditor` — the new labels file is never opened in the locale editor and the command typically fails with "Cursor is not on a locales import statement."
**Fix:** Accept an optional `fileUri?` and, when present, call `executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor')`; or have `createLabelsFile` open it directly.

#### B15. `/g` RegExp shared across loop iterations causes missed locale-import links
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** High
**Locations:** [locale-link-provider.ts:42](packages/extension/src/extension/locale-link-provider.ts#L42), [locale-link-provider.ts:50](packages/extension/src/extension/locale-link-provider.ts#L50)
A `/g` regex declared once outside the per-line loop retains `lastIndex` across lines, so `exec` skips valid matches on subsequent lines — the classic stateful-`/g` bug.
**Fix:** Move the regex declaration inside the loop (or reset `pattern.lastIndex = 0` per iteration).

#### B16. `isApplyingWebviewEdit` race condition; flag never reset on rejected `applyEdit`
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): replaced with a per-document `Set` cleared on both resolve and reject
**Severity:** High
**Locations:** [LocaleEditorProvider.ts:533-542](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L533), [LocaleEditorProvider.ts:395-399](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L395)
A single instance-level boolean is shared across all open locale documents and reset only inside an unawaited `.then()`. If `applyEdit` rejects the flag stays `true` forever (all external changes ignored); with two open files, one document's save corrupts the other's state.
**Fix:** Add `.catch(() => { this.isApplyingWebviewEdit = false; })` and key the flag per-document via a `Map<string, boolean>`.

#### B17. `LocaleFileWatcher` RelativePattern uses `vscode.Uri.parse` on a bare POSIX path
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** High
**Locations:** [LocaleFileWatcher.ts:51-55](packages/extension/src/extension/locale-editor/LocaleFileWatcher.ts#L51)
`vscode.Uri.parse(this.fileUri.path).fsPath` treats `/c:/foo/bar.json` as a scheme-less URI, producing an unreliable `fsPath` on Windows and potentially a glob that never matches.
**Fix:** Use `this.fileUri.path.split('/').pop()` directly — `fileUri` is already a `vscode.Uri`.
**Research notes:** VS Code API docs confirm `Uri.parse` expects a full URI string, not a path component.

#### B18. `performKeyDelete` mutates the local tree but never tells the extension
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): now persists via `sendLocaleMessage({ type: 'delete-key', key })` and uses the pure `removeKeyFromTree`
**Severity:** High
**Locations:** [media/locale-editor.ts:1495-1507](packages/extension/media/locale-editor.ts#L1495)
After `delete-confirmed`, the webview mutates `localeState.keyTree` but never sends `delete-key`, so the extension's `documentConfigs` retains the key and the next reload/undo restores it — deletions are silently ephemeral.
**Fix:** Send `sendLocaleMessage({ type: 'delete-key', key })` in `performKeyDelete`.

#### B19. Locale-editor modal element IDs do not match the IDs looked up in JS
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): HTML IDs renamed to `add-key-*`/`add-locale-*`; key modal split into parent + segment fields the handler expects
**Severity:** High
**Locations:** [locale-editor.html:527-560](packages/extension/src/extension/locale-editor/templates/locale-editor.html#L527), [media/locale-editor.ts:1562-1573](packages/extension/media/locale-editor.ts#L1562), [media/locale-editor.ts:1626-1636](packages/extension/media/locale-editor.ts#L1626), [media/locale-editor.ts:1700-1727](packages/extension/media/locale-editor.ts#L1700)
HTML defines `modal-new-key`/`key-modal-*` and `modal-new-locale`/`locale-modal-*`; JS looks for `add-key-*` and `add-locale-*`. Null-guards swallow the mismatch, so both add-key and add-locale modals open but their inputs and buttons are completely non-functional.
**Fix:** Rename the HTML IDs to match the JS (`add-key-parent`, `add-key-segment`, `add-key-cancel`, `add-key-confirm`, `add-key-error`, and the `add-locale-*` equivalents).

#### B20. Eventbus listeners accumulate on every engine re-initialization
> ✅ **FIXED** — branch `fix/preview-webview-cluster`
**Severity:** High
**Locations:** [media/preview.ts:84](packages/extension/media/preview.ts#L84), [media/preview.ts:484-517](packages/extension/media/preview.ts#L484)
`setupTimelineEventListeners()` registers five named listeners plus a debug viewer on every `initializeEngine()`, but previous listeners are never removed, so each re-init multiplies event firings (doubled `playbackStarted/Paused/Stopped` and `updateControlStates`).
**Fix:** Store the `TEventbusRemover` functions and invoke them before re-registering.
**Research notes:** Verified against Eligius `eventbus` — `on()`/`registerEventlistener()` return removers; the eventbus is a module-scope singleton never cleared between inits.

#### B21. `play/pause/stop/restart` messages do not actually control the engine
> ✅ **FIXED** — branch `fix/preview-webview-cluster`
**Severity:** High
**Locations:** [media/preview.ts:374-390](packages/extension/media/preview.ts#L374)
These cases only echo `playbackStarted/Paused/Stopped` back to the extension without broadcasting any eventbus request, so external playback commands have no effect while the extension receives a false confirmation.
**Fix:** Broadcast `timeline-play-request` (etc.) in each case and drop the spurious echo (the existing `eventbus.on('timeline-play')` listener already reports real state).

#### B22. `validateGroupId` duplicate check always passes (identity exclusion of self)
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): switched to occurrence counting; regression test added
**Severity:** Medium→High (data integrity)
**Locations:** [LocaleEditorProvider.ts:677](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L677), [LocaleValidation.ts:47-50](packages/extension/src/extension/locale-editor/LocaleValidation.ts#L47), [media/locale-editor-core.ts:111-134](packages/extension/media/locale-editor-core.ts#L111)
Called as `validateGroupId(group.id, groupIds, group.id)`; the check `existingId === id && existingId !== currentGroupId` can never be true when `id === currentGroupId`, so duplicate group IDs are never flagged server-side. Two divergent `validateGroupId` signatures also exist (extension vs webview).
**Fix:** Use index-based exclusion or count occurrences; unify the two implementations.

#### B23. `updateTrackedFiles` diverges — css-watcher clears, html/labels watchers accumulate
> ✅ **FIXED** — commit `6b1c52a` (css-watcher now accumulates to match html/labels)
**Severity:** High
**Locations:** [css-watcher.ts:203](packages/extension/src/extension/css-watcher.ts#L203), [html-watcher.ts:189](packages/extension/src/extension/html-watcher.ts#L189), [labels-watcher.ts:195](packages/extension/src/extension/labels-watcher.ts#L195)
*(Two verified findings describe opposite manifestations of the same divergence; merged.)* The three "parallel" watcher classes disagree: `css-watcher` calls `trackedFiles.clear()` before re-adding (replace semantics); `html-watcher`/`labels-watcher` only `add()` (monotonic growth). The CSS variant breaks hot-reload for the first document when a second is opened; the HTML/labels variant accumulates stale paths that trigger unnecessary `debounceChange` callbacks. They cannot both be correct.
**Fix:** Pick one semantic. The accumulate-without-clearing pattern is correct for multi-document tracking; change `css-watcher` to match (clear only in `dispose()`/`clearDocumentMappings()`). This is the canonical behavioral bug exposed by the watcher-class duplication cluster (D1).

### Medium Severity

#### B24. `checkRecursiveActionCalls` DFS has no global visited set (exponential blowup)
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (added a finished-node `visited: Set<string>` to the DFS — white/gray/black coloring where `chain` is the recursion stack and `visited` is the completed set — so a node reachable via N paths is explored once; cycle detection and reporting are preserved, and duplicate diagnostics for diamond-reachable cycles are deduplicated)
**Severity:** Medium
**Locations:** [eligian-validator.ts:1421](packages/language/src/eligian-validator.ts#L1421), [eligian-validator.ts:1440](packages/language/src/eligian-validator.ts#L1440), [eligian-validator.ts:1452](packages/language/src/eligian-validator.ts#L1452)
Only the linear call chain is tracked; nodes outside the current chain are re-explored from scratch, giving O(M^N) worst case.
**Fix:** Add a `visited: Set<string>` initialized once; skip already-visited actions; add to `visited` after iterating.

#### B25. Synchronous `fs.existsSync`/`fs.readFileSync` in an LSP validator blocks the event loop
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (`checkLocalesImports` is now `async`/returns `Promise<void>`; existence is probed with a non-throwing `fileExistsAsync` (`fs.promises.access`) and content read via `fs.promises.readFile`. Langium `ValidationCheck` natively supports async checks, and `parseAndValidate` already awaits them.)
**Severity:** Medium
**Locations:** [eligian-validator.ts:1914](packages/language/src/eligian-validator.ts#L1914), [eligian-validator.ts:1936](packages/language/src/eligian-validator.ts#L1936), [eligian-validator.ts:1938](packages/language/src/eligian-validator.ts#L1938)
`checkLocalesImports` does synchronous disk I/O inside the validation cycle, freezing the UI proportional to file size/disk latency.
**Fix:** Make the validator `async` and use `fs.promises`, or load via `registerBeforeDocument`.
**Research notes:** Langium `ValidationCheck` is `(node, accept, cancelToken) => MaybePromise<void>` — async validators are natively supported.

#### B26. `EligianHoverProvider` stores a mock `services` typed `any`; CommentProvider silently degrades
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (constructor `services` is now a required `EligianServices` (no `?`, no `any`); the `{ References: {} }` fallback that left `documentation.CommentProvider` undefined is removed. The module registration and all four test suites already construct the provider with real `EligianServices`, so no call site relied on the mock.)
**Severity:** Medium
**Locations:** [eligian-hover-provider.ts:38](packages/language/src/eligian-hover-provider.ts#L38), [eligian-hover-provider.ts:40](packages/language/src/eligian-hover-provider.ts#L40), [eligian-hover-provider.ts:43](packages/language/src/eligian-hover-provider.ts#L43), [eligian-hover-provider.ts:47](packages/language/src/eligian-hover-provider.ts#L47)
The optional `services?: any` falls back to `{ References: {} }`, so `services.documentation?.CommentProvider` is always `undefined` and JSDoc hover is silently disabled when instantiated without real services.
**Fix:** Type `services` as required `EligianServices`; provide a proper typed partial mock in tests.

#### B27. Empty `if` body after stripped debug `console.log`
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Medium
**Locations:** [pipeline.ts:372](packages/language/src/compiler/pipeline.ts#L372)
`if (document.diagnostics && document.diagnostics.length > 0) { }` is dead code with a `// DEBUG` comment.
**Fix:** Remove the empty `if` and comment.

#### B28. `&&`/`||` in `expression-evaluator` use `Boolean()` coercion, losing short-circuit semantics
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Medium
**Locations:** [expression-evaluator.ts:167](packages/language/src/compiler/expression-evaluator.ts#L167), [expression-evaluator.ts:170](packages/language/src/compiler/expression-evaluator.ts#L170)
`Boolean(left) && Boolean(right)` always returns `boolean`, so constant-folding `"" || "fallback"` yields `true` instead of `"fallback"`.
**Fix:** `return left && right;` / `return left || right;` (the `string | number | boolean` return type already allows this).

#### B29. `inferAssetTypeFromKeyword` returns `'json'`, incompatible with `ImportTypeProperties.assetType`
> ✅ **FIXED** — commit `220b552`
**Severity:** Medium
**Locations:** [import-inference.ts:35](packages/language/src/type-system-typir/inference/import-inference.ts#L35), [import-inference.ts:44](packages/language/src/type-system-typir/inference/import-inference.ts#L44), [import-type.ts:28](packages/language/src/type-system-typir/types/import-type.ts#L28), [typir-types.ts:16](packages/language/src/type-system-typir/types/typir-types.ts#L16)
`'json'` (returned for `'locales'`) is outside the `'html' | 'css' | 'media'` `AssetType` union; the mismatch is hidden by the `any`-typed factory (B12) and produces an inconsistent `Import<json>` type at runtime.
**Fix:** Add `'json'` to `AssetType`/`ImportTypeProperties.assetType` (or model locales differently) and type the factory concretely.

#### B30. `import-validation` WeakSet deduplication can skip re-validation
> ✅ **FIXED** — branch `fix/b30-typir-double-invocation`. Root cause found: the double-invocation was **our own double registration**, not a typir-langium defect. `initializeLangiumTypirServices()` (typir-langium) **already** calls `registerTypirValidationChecks()` internally; `createEligianServices` in `eligian-module.ts` then called `registerTypirValidationChecks(Eligian, Eligian.typir)` a **second** time, so the Typir validator's `checkTypingProblemsWithTypir` landed in the Langium `ValidationRegistry` `'AstNode'` bucket **twice** (verified by probe: one registration call → 2 AstNode entries) — making every Typir validation rule (the duplicate-import `Program` rule, plus event/languages/constant/control-flow/timeline rules) fire twice per cycle. **Fix:** removed the redundant explicit `registerTypirValidationChecks` call (and its now-unused import) from `eligian-module.ts`, leaving `initializeLangiumTypirServices` as the sole registrar; then **deleted the `validatedDocuments` WeakSet guard** from `import-validation.ts`, which was only masking the symptom. With the double registration gone, the `Program` rule fires exactly once and the duplicate-import diagnostics stay at 3 (verified: `validation.spec.ts` "should reject duplicates of each type independently" passes; full language suite green at baseline 1995 passed/23 skipped; tsgo typecheck clean; biome clean; coverage CI exit 0).
**Severity:** Medium
**Locations:** [import-validation.ts:34](packages/language/src/type-system-typir/validation/import-validation.ts#L34), [import-validation.ts:54](packages/language/src/type-system-typir/validation/import-validation.ts#L54), [import-validation.ts:57](packages/language/src/type-system-typir/validation/import-validation.ts#L57)
The `validatedDocuments` WeakSet skips any second call for the same `Program` instance and misunderstands Typir's once-per-node-per-cycle contract.
**Fix:** Remove the WeakSet guard; rely on Typir's built-in guarantee. Investigate the root cause if duplicate calls are actually observed.

#### B31. `isValidCSSSelector` regex rejects valid compound/descendant selectors
> ✅ **FIXED** — branch `fix/bug-tail-final` (relaxed the allowed-character pattern to permit whitespace, commas, combinators `> + ~`, the universal `*`, attribute-selector chars, and pseudo-function parens — so `#app .container` and selector lists now validate; added an empty/whitespace-only guard and broadened the error message to no longer claim only `#id`/`.class`/`element` are accepted)
**Severity:** Medium
**Locations:** [timeline-validation.ts:33](packages/language/src/type-system-typir/validation/timeline-validation.ts#L33), [timeline-validation.ts:38](packages/language/src/type-system-typir/validation/timeline-validation.ts#L38)
`/^[#.\w\-:[\]]+$/` forbids spaces, commas, and combinators, producing false positives for `#app .container` and selector lists.
**Fix:** Relax the regex to allow whitespace/commas/combinators, or use a real selector parser; at minimum document the limitation in the error message.

#### B32. `detectAfterEventKeyword` suppresses completions when re-editing an existing event name
> ✅ **FIXED** — verified on branch `fix/medium-bug-tail-batches` (already implemented in prior unmarked work): the `if (eventAction.eventName) { return false; }` early-return is gone (the param is now `_eventAction`, unused), and a comment documents that the `/\bon\s+event\s*$/` regex on the text before the cursor is the sole gate — so completions are offered when re-editing an existing event name.
**Severity:** Medium
**Locations:** [context.ts:311](packages/language/src/completion/context.ts#L311)
`if (eventAction.eventName) { return false; }` blocks completions even when the cursor is right after `on event` to replace an existing name; the regex at line 321 already gates this case correctly.
**Fix:** Remove the early-return guard and rely on the existing regex.

#### B33. Controller parameter index miscounted with embedded/escaped quotes
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (`detectControllerContext` now counts complete quoted-string literals via `/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g` — each closed string is exactly one consumed parameter and the in-progress trailing quote is correctly not counted — instead of halving a raw `match(/["']/g)` count, which mis-indexed `addController("O'Brien", …)`)
**Severity:** Medium
**Locations:** [context.ts:386](packages/language/src/completion/context.ts#L386), [context.ts:390](packages/language/src/completion/context.ts#L390)
`textInCall.match(/["']/g)` counts raw quotes, so `addController("O'Brien")` or escaped quotes throw off `Math.floor(count/2)`.
**Fix:** Match complete quoted strings (`/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g`) or count top-level commas.

#### B34. `findIdentifierAtOffset` is a non-functional stub with a midpoint heuristic
> ✅ **FIXED** — verified on branch `fix/correctness-batches-b2-b14` (already implemented in prior work, previously unmarked): `findIdentifierAtOffset` now parses the selector via `parseSelectorIdentifiers` (which carries real `start`/`end` spans) and returns the identifier whose span contains the offset — the `selector.length / 2` midpoint heuristic is gone, and it is wired into the live `detectSelectorHover` path (B9).
**Severity:** Medium
**Locations:** [hover-detection.ts:177](packages/language/src/css/hover-detection.ts#L177), [hover-detection.ts:189](packages/language/src/css/hover-detection.ts#L189), [hover-detection.ts:191](packages/language/src/css/hover-detection.ts#L191)
Uses `selector.length / 2` as a class/ID boundary (meaningless) and is never wired into the live hover path.
**Fix:** Implement offset detection via postcss-selector-parser `sourceIndex` and wire it into `detectSelectorHover` (pairs with B9).
**Research notes:** postcss-selector-parser nodes carry `sourceIndex` (zero-based offset) and `source.start/end`.

#### B35. `resolveCSSPath` does not normalize `../` segments
> ✅ **FIXED** — PR #60 (`refactor/d4-import-path-resolution`): side effect of the D4 single fix point; `../` now normalized
**Severity:** Medium
**Locations:** [css-code-actions.ts:170](packages/language/src/css/css-code-actions.ts#L170), [css-code-actions.ts:179](packages/language/src/css/css-code-actions.ts#L179), [css-code-actions.ts:185](packages/language/src/css/css-code-actions.ts#L185)
Plain `docDir + cleanPath` concatenation yields `file:///.../../shared/styles.css` for parent-relative imports — currently masked by an early return on absolute URIs, but fragile.
**Fix:** Document/assert the absolute-URI invariant, or normalize with `new URL(cleanPath, docDir).href` / `path.resolve`.

#### B36. CST line/column stored 0-indexed into 1-indexed `SourceLocation`
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (the import-statement `sourceLocation` in `compiler-integration.ts` now adds `+ 1` to `range.start.line`/`character` (defaulting to line/col 1 when no CST node), matching the `+ 1` every other call site applies and the 1-indexed `SourceLocation` contract in `errors/base.ts`)
**Severity:** Medium
**Locations:** [compiler-integration.ts:279](packages/language/src/asset-loading/compiler-integration.ts#L279), [compiler-integration.ts:280](packages/language/src/asset-loading/compiler-integration.ts#L280), [base.ts:18](packages/language/src/errors/base.ts#L18)
Import-statement `sourceLocation` omits the `+1` that every other call site applies; currently no observable effect because consumers re-resolve position, but the field is wrong.
**Fix:** Add `+ 1` to line/column (guarding null), matching `ast-transformer.ts:2474-2475`.

#### B37. Provider (media) file read as UTF-8 then discarded
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (the `provider` branch of `loadProgramAssets` now stores only the relative path and skips `loader.loadFile()` entirely; `loadFile` is called lazily inside the non-provider `else` arm, so layout/styles/locales/named imports still read content as before)
**Severity:** Medium
**Locations:** [compiler-integration.ts:165](packages/language/src/asset-loading/compiler-integration.ts#L165), [compiler-integration.ts:166](packages/language/src/asset-loading/compiler-integration.ts#L166), [compiler-integration.ts:176](packages/language/src/asset-loading/compiler-integration.ts#L176), [compiler-integration.ts:178](packages/language/src/asset-loading/compiler-integration.ts#L178)
`loadFile` reads entire binary media files into memory as UTF-8 strings, then stores only the path — wasteful for large videos.
**Fix:** Skip `loadFile()` for provider imports; read content only in branches that use it.

#### B38. `IAssetValidationService` interface and implementation have mismatched `assetType`
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (`IAssetValidationService.validateAsset` now accepts `'html' | 'css' | 'media' | 'json'`, matching the implementation and the real `'json'` caller; JSDoc updated)
**Severity:** Medium
**Locations:** [interfaces.ts:118](packages/language/src/asset-loading/interfaces.ts#L118), [interfaces.ts:119](packages/language/src/asset-loading/interfaces.ts#L119), [asset-validation-service.ts:39](packages/language/src/asset-loading/asset-validation-service.ts#L39), [asset-validation-service.ts:40](packages/language/src/asset-loading/asset-validation-service.ts#L40)
Interface omits `'json'` but the implementation and a real caller use it; callers typed to the interface cannot pass `'json'`.
**Fix:** Add `'json'` to the interface union and JSDoc.

#### B39. Locales JSON schema validation bypassed in `loadProgramAssets`
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (the `locales` branch now calls `validateLocalesJSON(content, importInfo.path)` and maps a returned `LocaleValidationError` to a `validation-error` `AssetError` (including its `details`); the parsed config is only assigned when schema validation passes. Structurally invalid-but-parseable locale files are now rejected. Test documents remain skip-gated in `checkAssetLoading`, so the stricter check surfaces only for real files.)
**Severity:** Medium
**Locations:** [compiler-integration.ts:181](packages/language/src/asset-loading/compiler-integration.ts#L181), [compiler-integration.ts:183](packages/language/src/asset-loading/compiler-integration.ts#L183), [locale-import-validator.ts:121](packages/language/src/validators/locale-import-validator.ts#L121)
Only `JSON.parse` is used; the existing AJV `validateLocalesJSON` (locale-code format, required fields, minProperties) is skipped, so structurally invalid-but-parseable files pass.
**Fix:** Call `validateLocalesJSON(content, importInfo.path)` and map its error to an `AssetError`.

#### B40. `parseInt` on `--inline-threshold` with no NaN guard silently disables inlining
> ✅ **ALREADY FIXED** — the `Number.isNaN(inlineThreshold)` guard (exit with an error) is already present in `main.ts` at HEAD; no change needed in branch `refactor/cli-bundler-cluster-d31`
**Severity:** Medium
**Locations:** [main.ts:260](packages/cli/src/main.ts#L260), [asset-collector.ts:321](packages/cli/src/bundler/asset-collector.ts#L321)
NaN flows to `size <= threshold`, which is always false, disabling all inlining without warning.
**Fix:** Add `Number.isNaN` check after `parseInt` and exit with an error (or use Commander `.argParser`).

#### B41. Cleanup errors silently swallowed in temp/entry-point removal
> ✅ **FIXED** — branch `refactor/cli-bundler-cluster-d31` (both cleanup `Effect.catchAll` sites now `console.warn` the failure instead of returning `Effect.succeed(undefined)`)
**Severity:** Medium
**Locations:** [bundler/index.ts:180-183](packages/cli/src/bundler/index.ts#L180), [runtime-bundler.ts:262-266](packages/cli/src/bundler/runtime-bundler.ts#L262)
`Effect.catchAll(() => Effect.succeed(undefined))` hides all cleanup I/O errors; temp files accumulate invisibly.
**Fix:** Log a warning: `Effect.catchAll(e => Effect.sync(() => console.warn('Cleanup failed:', e)))`.

#### B42. `extractEffectError` uses `JSON.stringify` round-trip on FiberFailure
> ✅ **FIXED** — branch `refactor/cli-bundler-cluster-d31` (`extractEffectError` replaced by `causeToError` using `Cause.failureOption` + `Cause.squash`; parse and compile blocks in `compile-file.ts` use `runPromiseExit`)
**Severity:** Medium
**Locations:** [compile-file.ts:125-138](packages/cli/src/compile-file.ts#L125), [compile-file.ts:195](packages/cli/src/compile-file.ts#L195)
Relies on Effect's undocumented FiberFailure serialization; `JSON.stringify` of an `Error` yields `{}` (non-enumerable props), so defect failures fall through and an opaque FiberFailure is unsoundly cast to `CompilerError`.
**Fix:** Use `Effect.runPromiseExit` + `Cause.failureOption`/`Cause.defectOption`.
**Research notes:** Effect docs endorse `Cause.failures`/`matchCause`/`runPromiseExit`; the JSON approach is not documented.

#### B43. `createReadError` called with a pre-stringified message instead of the raw cause
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (the generic-read-error branch of `mapFileSystemError` now passes the raw `error` as `cause` instead of `nodeError.message`; `message` stays the generic "Failed to read file" string)
**Severity:** Medium
**Locations:** [file-loader.ts:58](packages/shared-utils/src/file-loader.ts#L58), [file-loader.ts:59](packages/shared-utils/src/file-loader.ts#L59), [errors.ts:96](packages/shared-utils/src/errors.ts#L96)
The OS error detail is stored in `cause` as a string; `message` stays generic, defeating the `cause` field's purpose (machine-inspectable original Error).
**Fix:** Pass the raw error object as `cause`, or add a separate message-override parameter.

#### B44. `resolvePaths` Windows branch does not handle `../` (relies on downstream normalize)
> ✅ **FIXED** — branch `fix/bug-tail-final` (the Windows-absolute branch now uses `path.win32.resolve(baseDir, relativePath)` — resolving `../` and `.` segments in-place — then converts backslashes to forward slashes, instead of stripping leading `./` and concatenating and relying on a downstream `normalizePath`. Empty/`.` segments still map to `baseDir`.)
**Severity:** Medium
**Locations:** [path-resolver.ts:44](packages/shared-utils/src/path-resolver.ts#L44), [path-resolver.ts:52](packages/shared-utils/src/path-resolver.ts#L52), [path-resolver.ts:53](packages/shared-utils/src/path-resolver.ts#L53), [path-resolver.ts:54](packages/shared-utils/src/path-resolver.ts#L54)
Only strips leading `./` and concatenates; correctness depends on an undocumented downstream `normalizePath`.
**Fix:** Use `path.win32.resolve(baseDir, relativePath)` (then normalize slashes) or unify both branches on `path.resolve`.

#### B45. `formatLocation` checks `filePath` but IOError uses `path` — IO errors silently lose location
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (the IO fallback branch now checks `'path' in error && error.path` and returns `error.path`; fixed together with B46, which had been masking it by supplying `filePath` in the test literals)
**Severity:** High (verified) — *placed here adjacent to B43/B44 IO cluster*
**Locations:** [formatters.ts:79](packages/language/src/errors/formatters.ts#L79), [errors.ts:14](packages/shared-utils/src/errors.ts#L14)
The IO fallback branch checks `'filePath' in error`, but the IOError subtypes define `path`, not `filePath`, so `formatLocation` always returns `null` for IO errors and the file path is dropped from output.
**Fix:** Change to `'path' in error && error.path` and return `error.path`.

#### B46. `error-consistency.spec.ts` constructs IOError literals with wrong field names
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (the three IOError literals now use `createFileNotFoundError`/`createPermissionError`, so they carry the real `path` field; assertions updated to the factory messages — `File not found` instead of the bespoke `File does not exist`)
**Severity:** Medium
**Locations:** [error-consistency.spec.ts:171](packages/language/src/errors/__tests__/error-consistency.spec.ts#L171), [error-consistency.spec.ts:184](packages/language/src/errors/__tests__/error-consistency.spec.ts#L184), [error-consistency.spec.ts:362](packages/language/src/errors/__tests__/error-consistency.spec.ts#L362)
Test literals use `filePath`/`absolutePath` instead of `path`, which both diverges from the real type and masks B45.
**Fix:** Build IOErrors via `createFileNotFoundError`/`createPermissionError` and update expectations.

#### B47. `block-label-detector` uses `langium/test` `parseDocument` in production
> ✅ **FIXED** — branch `fix/b30-typir-double-invocation`. The extension host no longer parses: bracket-position detection is migrated to a custom `eligian/blockLabels` LSP request. The new parse-free core `extractBlockLabels(program)` lives in the language package (`packages/language/src/lsp/block-labels.ts`, exporting `BlockLabel`, `BLOCK_LABELS_REQUEST`, `BlockLabelsParams`); the language server's request handler (`extension/src/language/main.ts`) resolves the document from `shared.workspace.LangiumDocuments` and runs `extractBlockLabels` on the **already-built, cached AST** — no re-parse, no duplicated work. `BlockLabelDecorationProvider` now takes the `LanguageClient` and `sendRequest`s for positions instead of calling the old detector. The production module `block-label-detector.ts` (which imported `langium/test` `parseDocument` and held a singleton `EligianServices`) is **deleted outright**, so the resource-leak half is moot — there is no singleton left to dispose, and the `disposeServices()`/`deactivate()` wiring is removed. The `findBlockLabels` test suite was redesigned into a parse-free unit test of `extractBlockLabels` in the language package (10 cases ported verbatim, identical position assertions). Verified: tsgo clean (language + extension); language suite 2005 passed/23 skipped + coverage CI exit 0; extension suite 327 passed; biome clean; both language-server and extension-host esbuild bundles build.
**Severity:** Medium
**Locations:** [block-label-detector.ts:19](packages/extension/src/extension/decorations/block-label-detector.ts#L19), [block-label-detector.ts:50](packages/extension/src/extension/decorations/block-label-detector.ts#L50)
A test-only utility runs a full from-scratch parse on every debounced keystroke in the extension host, duplicating the language server's work with no caching.
**Fix:** Have the language server emit bracket positions via a custom LSP request/notification instead of parsing in the extension host.
**Research notes:** Langium docs use `parseDocument`/`parseHelper` exclusively in test contexts; it bundles fine (no runtime crash), so this is a correctness/perf concern, not a load failure.

#### B48. `PreviewManager` singleton never disposed on deactivation
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (added a static `PreviewManager.disposeInstance()` that disposes the instance if one exists; `activate()` pushes `{ dispose: () => PreviewManager.disposeInstance() }` into `context.subscriptions`, so VS Code tears down all preview panels and the active-editor listener on deactivation)
**Severity:** Medium
**Locations:** [main.ts:205](packages/extension/src/extension/main.ts#L205), [PreviewManager.ts:113](packages/extension/src/extension/preview/PreviewManager.ts#L113)
`dispose()` exists but is never called from `deactivate()` or registered in `context.subscriptions`, leaking panels and the active-editor listener.
**Fix:** Push a disposal wrapper into `context.subscriptions` or call `dispose()` in `deactivate()`.

#### B49. Output channel leaked on every failing compile command
> ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (the `'Eligian Compiler'` channel is now created once via a lazy module-level `getCompilerOutputChannel()` and disposed through `context.subscriptions`; the per-failure `createOutputChannel` call is gone)
**Severity:** Medium
**Locations:** [main.ts:309](packages/extension/src/extension/main.ts#L309)
`createOutputChannel('Eligian Compiler')` runs on every failure, never disposed — duplicate output entries and leaked resources.
**Fix:** Create the channel once (module-level/lazy) and dispose via `context.subscriptions`.

#### B50. `updateConfig` message shows container but never re-initializes the engine
> ✅ **FIXED** — branch `fix/preview-webview-cluster` (protocol clarified: re-init is intended via the separate `initialize` message sent by `PreviewPanel.compileAndUpdate`; `updateConfig` only preps the DOM — calling `initializeEngine` here would double-init. Misleading comment corrected.)
**Severity:** Medium
**Locations:** [media/preview.ts:325-334](packages/extension/media/preview.ts#L325)
The case only toggles container visibility (and a misleading comment hides the error container), never calling `initializeEngine`.
**Fix:** Clarify the protocol; if re-init is intended, call `initializeEngine(message.payload.config)`; fix the comment.

#### B51. Redundant `URI.parse()` calls in re-validation loops
> ✅ **FIXED** — branch `refactor/trigger-revalidation-d8-b51` (folded into the D8 `triggerRevalidation` helper, which parses each URI once)
**Severity:** Medium *(also part of duplication cluster D8)*
**Locations:** [language/main.ts:55-59](packages/extension/src/language/main.ts#L55), [language/main.ts:83-87](packages/extension/src/language/main.ts#L83), [language/main.ts:130-134](packages/extension/src/language/main.ts#L130), [language/main.ts:145-149](packages/extension/src/language/main.ts#L145), [language/main.ts:172-176](packages/extension/src/language/main.ts#L172), [language/main.ts:193-197](packages/extension/src/language/main.ts#L193)
`URI.parse(docUri)` is called twice per iteration in six loops.
**Fix:** Parse once per iteration (folds into the D8 `triggerRevalidation` helper).

#### B52. `import-processor` silently drops all but the last one-to-one import
> ✅ **FIXED** — branch `fix/bug-tail-final` (for `'one'`-cardinality imports the processor now registers and notifies the **first** occurrence, and emits a `console.warn` naming the kept file and the count ignored when multiple are present — the silent data loss is gone. Well-formed documents still have exactly one, flagged as an error by the validator otherwise.)
**Severity:** Medium
**Locations:** [import-processor.ts:152-154](packages/extension/src/language/import-processor.ts#L152), [import-processor.ts:163-165](packages/extension/src/language/import-processor.ts#L163)
For `'one'`-cardinality types, multiple imports are parsed but only the last is registered/watched — silent data loss.
**Fix:** Validate exactly one import (warn on multiple) or register the first occurrence only.

#### B53. `import-processor` path stripping mishandles `'.'`
> ✅ **FIXED** — PR #60 (`refactor/d4-import-path-resolution`): now uses `path.join` via the shared D4 helper; regression test added
**Severity:** Medium *(part of D9 path-resolution cluster)*
**Locations:** [import-processor.ts:127-128](packages/extension/src/language/import-processor.ts#L127)
Manual `./` stripping makes `importPath === '.'` resolve to the directory; `path.join` already handles `./`.
**Fix:** Use `path.join(docDir, importPath)` directly.

#### B54. `labels-watcher` leftover `console.error` debug traces
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Medium *(merged across two findings; same set of lines)*
**Locations:** [labels-watcher.ts:70](packages/extension/src/extension/labels-watcher.ts#L70), [labels-watcher.ts:90](packages/extension/src/extension/labels-watcher.ts#L90), [labels-watcher.ts:102](packages/extension/src/extension/labels-watcher.ts#L102), [labels-watcher.ts:206](packages/extension/src/extension/labels-watcher.ts#L206), [labels-watcher.ts:207](packages/extension/src/extension/labels-watcher.ts#L207), [labels-watcher.ts:211](packages/extension/src/extension/labels-watcher.ts#L211), [labels-watcher.ts:260](packages/extension/src/extension/labels-watcher.ts#L260), [labels-watcher.ts:277](packages/extension/src/extension/labels-watcher.ts#L277), [labels-watcher.ts:287](packages/extension/src/extension/labels-watcher.ts#L287), [labels-watcher.ts:290](packages/extension/src/extension/labels-watcher.ts#L290), [main.ts:85](packages/extension/src/extension/main.ts#L85)
Ten `console.error` informational traces (absent in css/html watchers) spam the error channel in production.
**Fix:** Remove them or route through an `OutputChannel`.

### Low Severity

#### B55. `getVisibleVariables` collects locals from other action bodies as "global"
> ✅ **FIXED** — branch `fix/bug-tail-final` (global variables are now collected from top-level `program.statements` filtered by `isVariableDeclaration` (guarded by `isProgram`), instead of `AstUtils.streamAst(program)` which descended into every action body and leaked their locals into the global scope)
**Severity:** Low
**Locations:** [eligian-scope-provider.ts:343](packages/language/src/eligian-scope-provider.ts#L343)
`AstUtils.streamAst(program).filter(isVariableDeclaration)` descends into all action bodies, leaking action B's locals into action A's scope.
**Fix:** Filter only top-level `program.statements` declarations.

#### B56. `generateContainerElement` misindents the closing `</div>`
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Low
**Locations:** [html-generator.ts:80](packages/cli/src/bundler/html-generator.ts#L80)
Hard-coded two leading spaces before `</div>` yield four-space indentation in output.
**Fix:** Remove the leading spaces on the closing tag.

#### B57. `outputHelp()` after `program.parse()` — reachability ambiguity
> ✅ **FIXED** — branch `fix/bug-tail-final` (confirmed the `<input>` argument is required, so Commander prints its usage error and `process.exit(1)`s during `parse()` when no input is supplied — the `if (process.argv.length <= 2) program.outputHelp()` fallback was unreachable dead code and is removed, with a comment documenting why)
**Severity:** Low
**Locations:** [main.ts:273](packages/cli/src/main.ts#L273), [main.ts:276-278](packages/cli/src/main.ts#L276)
Dead/unreachable depending on Commander's required-arg handling.
**Fix:** Verify Commander behavior; remove dead code or use a pre-action/help hook.

#### B58. `applyDecorations` rejection unobserved in `setTimeout`
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Low
**Locations:** [block-label-decoration-provider.ts:55](packages/extension/src/extension/decorations/block-label-decoration-provider.ts#L55)
A synchronous throw before the first `await` escapes as an unhandled rejection.
**Fix:** `.catch(err => console.error(...))` on the returned promise.

#### B59. `extractPartialText` single-quote branch lacks upper-bound clamping
> ✅ **FIXED** — branch `fix/bug-tail-final` (the single-quote branch now clamps the slice end with `Math.min(singleQuoteIndex + 1 + relativeOffset, closeQuoteIndex)`, mirroring the double-quote branch, so a cursor past the closing quote no longer returns text beyond the string)
**Severity:** Medium *(listed low-block by module; clamping bug)*
**Locations:** [context-detection.ts:229](packages/language/src/html/context-detection.ts#L229), [context-detection.ts:234](packages/language/src/html/context-detection.ts#L234)
Unlike the double-quote branch, the single-quote branch can return text past the closing quote.
**Fix:** `Math.min(singleQuoteIndex + 1 + relativeOffset, closeQuoteIndex)`.

#### B60. URI-to-path conversion fragile/cross-platform broken (`.replace('file:///','')`)
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (resolved as part of the D10 `uriToFsPath` extraction; all sites now use `URI.parse(uri).fsPath`.)
**Severity:** Medium *(part of D10 cluster)*
**Locations:** [language-block-code-actions.ts:66](packages/language/src/labels/language-block-code-actions.ts#L66), [language-block-code-actions.ts:67](packages/language/src/labels/language-block-code-actions.ts#L67), [eligian-code-action-provider.ts:74](packages/language/src/eligian-code-action-provider.ts#L74), [eligian-code-action-provider.ts:75](packages/language/src/eligian-code-action-provider.ts#L75), [eligian-code-action-provider.ts:300](packages/language/src/eligian-code-action-provider.ts#L300), [eligian-code-action-provider.ts:301](packages/language/src/eligian-code-action-provider.ts#L301)
Stripping `file:///` drops the leading slash on POSIX and ignores authority components.
**Fix:** Use `URI.parse(uri).fsPath` via a shared `uriToFsPath` helper (see D10).

#### B61. `extractLocalesFilePaths` double-guards `isDefaultImport` (unreachable fallback)
> ✅ **FIXED** — branch `fix/bug-tail-final` (the `.filter` now uses a `stmt is DefaultImport` type predicate so `.map` accesses `stmt.path` directly; the redundant in-`.map` `isDefaultImport` re-check, the `''` fallback branch, and the trailing dead `.filter` are removed)
**Severity:** Low
**Locations:** [language-block-code-actions.ts:137-140](packages/language/src/labels/language-block-code-actions.ts#L137)
Re-checks `isDefaultImport` inside `.map`, making the `''` branch and the trailing `.filter` dead.
**Fix:** Use a type-predicate `.filter` so `.map` accesses `stmt.path` directly.

#### B62. `selectKey` mutates the original state's `expandedKeys` Set
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Low
**Locations:** [media/locale-editor-core.ts:695-709](packages/extension/media/locale-editor-core.ts#L695)
Spread shares the Set reference; `add()` mutates the original (unlike `toggleExpanded`).
**Fix:** `expandedKeys: new Set(state.expandedKeys)` before mutating.

#### B63. `renderKeyTree` auto-expand triggers a synchronous recursive double-render
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): auto-expand now runs before rendering
**Severity:** Medium *(state/render bug)*
**Locations:** [media/locale-editor.ts:1172-1175](packages/extension/media/locale-editor.ts#L1172)
Auto-expand of `__root__` recurses after rendering, doubling DOM work on initial load.
**Fix:** Move the auto-expand logic before the render (or into initialization).

#### B64–B66. Webview "immutable" state functions mutate in place
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): `updateTranslationValue`/`addKeyToTree` now rebuild the tree immutably; regression tests added
**Severity:** Medium
**Locations:** `updateTranslationValue` [media/locale-editor-core.ts:595-609](packages/extension/media/locale-editor-core.ts#L595); `addKeyToTree` [media/locale-editor-core.ts:639-650](packages/extension/media/locale-editor-core.ts#L639)
Both find a node and mutate it in place while returning a shallow-spread state that shares the same `keyTree` array — reference-equality consumers miss the change.
**Fix:** Rebuild the `keyTree` immutably (recursive map) and return new state.

---

## Code Duplication (Priority)

Clusters are merged across the per-module and repo-wide passes (the analysis found the same clusters independently from multiple angles; their locations are unioned here).

### D1. Three near-identical file-watcher classes — CSS / HTML / Labels (~690-800 lines)
> ✅ **FIXED** — branch `refactor/consolidate-file-watchers-d1` (extracted `FileImportWatcherManager` base in `extension/base-watcher-manager.ts`; the three watchers are now ~50-line config wrappers. Subsumes D2 and D2b; locks in the B23 fix via one shared accumulate-only `updateTrackedFiles`. Verified: tsgo clean, 337 extension tests green, build clean.)
**Severity:** High
**Sites:** [css-watcher.ts:35](packages/extension/src/extension/css-watcher.ts#L35), [html-watcher.ts:32](packages/extension/src/extension/html-watcher.ts#L32), [labels-watcher.ts:32](packages/extension/src/extension/labels-watcher.ts#L32)
`CSSWatcherManager`, `HTMLWatcherManager`, `LabelsWatcherManager` share identical fields, constructor, `clearDocumentMappings`, `startWatching` skeleton, `updateTrackedFiles`, `handleFileChange`, `debounceChange`, `handleFileDelete`, and a byte-for-byte identical `dispose()`. They differ only in glob pattern, notification constant, the imports-Map field name, and single-vs-array URI registration. This cluster directly caused the behavioral divergence bug B23 (`updateTrackedFiles` clear vs accumulate) and harbors the duplicated `resolveAbsolute*Uri` (D2), `dispose()` (D2b), and the leftover `console.error` traces (B54).
**Scale:** ~3 classes × ~230 lines; ~500 lines removable.
**Proposed abstraction:** A generic `BaseWatcherManager`/`FileImportWatcherManager` (abstract class or options-configured factory in `extension/base-watcher-manager.ts`) parameterized by `{ globPattern, notificationFactory, single|array registration }`. Each concrete watcher becomes a ~20-30 line wrapper. Fix B23 as part of the consolidation.

### D2. `resolveAbsolute{CSS,HTML,Labels}Uri` — byte-identical private methods
> ✅ **FIXED** — branch `refactor/consolidate-file-watchers-d1` (consolidated into the D1 base, which resolves import paths via the D4 `resolveImportPathToUri` helper instead of the per-watcher copies).
**Severity:** Medium
**Sites:** [css-watcher.ts:137](packages/extension/src/extension/css-watcher.ts#L137), [html-watcher.ts:128](packages/extension/src/extension/html-watcher.ts#L128), [labels-watcher.ts:134](packages/extension/src/extension/labels-watcher.ts#L134)
Identical `startsWith('file://')` → parse → dirname → strip `./` → join → `Uri.file().toString()` logic (~18 lines each).
**Abstraction:** Standalone `resolveAbsoluteFileUri(documentUri, fileUri)` in `extension/uri-utils.ts` (or `watcher-utils.ts`). Useful independently of D1.

#### D2b. `dispose()` byte-for-byte identical across the three watchers
> ✅ **FIXED** — branch `refactor/consolidate-file-watchers-d1` (single `dispose()` now lives on the D1 base class).
**Severity:** Medium
**Sites:** [css-watcher.ts:338](packages/extension/src/extension/css-watcher.ts#L338), [html-watcher.ts:289](packages/extension/src/extension/html-watcher.ts#L289), [labels-watcher.ts:308](packages/extension/src/extension/labels-watcher.ts#L308)
~17 lines × 3. Subsumed by D1; otherwise extract `disposeWatcherResources(state)`.

#### D2c. `FileWatcher` re-implements the 300ms debounce + `Map<string, Timeout>` pattern
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (new generic `debounce<K>(timers, key, delay, fn)` in `extension/debounce-util.ts`; the D1 base `FileImportWatcherManager.debounceChange` and the preview `FileWatcher` both delegate.)
**Severity:** Low
**Sites:** [FileWatcher.ts:33](packages/extension/src/extension/preview/FileWatcher.ts#L33), [FileWatcher.ts:92](packages/extension/src/extension/preview/FileWatcher.ts#L92), and the three watchers ([css-watcher.ts:299](packages/extension/src/extension/css-watcher.ts#L299), [html-watcher.ts:250](packages/extension/src/extension/html-watcher.ts#L250), [labels-watcher.ts:259](packages/extension/src/extension/labels-watcher.ts#L259))
**Abstraction:** `debounce<K>(timers, key, delay, fn)` utility in `extension/debounce-util.ts`.

### D3. `levenshteinDistance` implemented three times
> ✅ **FIXED** — branch `refactor/consolidate-levenshtein-d3` (commit `92659bf`): new `compiler/utils/string-similarity.ts` re-exports the canonical `levenshteinDistance` (single source of truth) and adds a generic `findSimilar`; `suggestSimilarActions`/`suggestSimilarOperations` delegate to it and the two private compiler copies are deleted. The compiler suggestion paths also gain the `maxDistance` early-exit they were missing (identical results). Net −92 lines. Verified: tsgo clean, language suite green (2001 passed/23 skipped), biome clean, coverage CI passing.
**Severity:** High
**Sites:** [css/levenshtein.ts:20](packages/language/src/css/levenshtein.ts#L20) (canonical, has `maxDistance` early-exit), [name-resolver.ts:168](packages/language/src/compiler/name-resolver.ts#L168), [operations/index.ts:296](packages/language/src/compiler/operations/index.ts#L296)
The two compiler copies are character-identical and lack the optimization; each is paired with its own filter-sort-slice suggestion helper.
**Abstraction:** Import the canonical `levenshteinDistance` (or promote to a shared `compiler/utils/string-similarity.ts`); delete the private copies; have `suggestSimilarActions`/`suggestSimilarOperations` delegate to a shared `findSimilar`.

### D4. Import-path strip-and-resolve pattern duplicated across ~9 sites in 5 files
> ✅ **FIXED** — PR #60 (`refactor/d4-import-path-resolution`, commit `1d7e1be`): consolidated into `stripImportQuotes`/`resolveImportRelativePath`/`resolveImportPathToUri` in `utils/path-utils.ts` (barrel-exported), applied at all ~10 sites across 6 files; also removed the three `resolveAbsolute*Uri` watcher copies (reinforces D2) and fixed B53 + B35 at the single fix point. +12 unit tests.
**Severity:** High *(the single largest cross-module duplication; merges the validator-local, css, pipeline, and extension variants)*
**Sites:** [eligian-validator.ts:1730](packages/language/src/eligian-validator.ts#L1730), [eligian-validator.ts:1796](packages/language/src/eligian-validator.ts#L1796), [eligian-validator.ts:1909](packages/language/src/eligian-validator.ts#L1909), [pipeline.ts:303](packages/language/src/compiler/pipeline.ts#L303), [css-code-actions.ts:182](packages/language/src/css/css-code-actions.ts#L182), [import-processor.ts:124](packages/extension/src/language/import-processor.ts#L124), [css-watcher.ts:149](packages/extension/src/extension/css-watcher.ts#L149), [labels-watcher.ts:146](packages/extension/src/extension/labels-watcher.ts#L146), [html-watcher.ts:140](packages/extension/src/extension/html-watcher.ts#L140)
The three-step idiom — strip quotes (`/^["']|["']$/`), strip leading `./`, `path.join(docDir, cleanPath)` (→ `URI.file().toString()`) — is repeated verbatim. The `pipeline.ts` variant additionally contains the broken `||` dirname bug (B1), and `import-processor.ts` the `'.'` edge-case bug (B53). A single fix point would have prevented both.
**Abstraction:** `resolveImportRelativePath(rawQuotedPath, docDir): string` (and/or `resolveImportPathToUri(documentUri, importPath)`) in `packages/language/src/utils/path-utils.ts`, used at all sites.

### D5. Five near-identical `checkControlFlowPairing*` methods
> ✅ **FIXED** — branch `refactor/consolidate-control-flow-pairing-d5` (extracted a private generic `validateControlFlowPairingForOps<N>(operations, node, property, accept)` on `EligianValidator`; the five public `checkControlFlowPairing*` methods are now one-line delegations differing only in the ops array and the `accept` `property` key. Pure refactor, behavior-preserving. Verified: tsgo clean, biome clean, language suite green at 2001 passed/23 skipped, coverage CI passing.)
**Severity:** High *(confirmed independently three times; same five sites)*
**Sites:** [eligian-validator.ts:893](packages/language/src/eligian-validator.ts#L893), [eligian-validator.ts:915](packages/language/src/eligian-validator.ts#L915), [eligian-validator.ts:940](packages/language/src/eligian-validator.ts#L940), [eligian-validator.ts:965](packages/language/src/eligian-validator.ts#L965), [eligian-validator.ts:990](packages/language/src/eligian-validator.ts#L990)
Identical filter→map→`validateControlFlowPairing`→iterate→`accept` body (~12 lines × 5); differ only in the ops array property and the `accept` `property` key.
**Abstraction:** Private `validateControlFlowPairingForOps(ops, node, property, accept)`; each public method becomes a one-liner.

### D6. AST "find Program root" upward traversal duplicated 4× while `getProgram` exists
> ✅ **FIXED** — branch `refactor/consolidate-program-root-traversal-d6` (verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped). Replaced the four (in fact **five** — a fifth copy in the `LabelController` branch of the controller-call validator was also a hand-rolled walk) inline `let node: any = ...; while (node && node.$type !== 'Program') node = node.$container;` traversals with the existing `this.getProgram(node)` helper, then read the document URI via `program?.$document?.uri?.toString()`. Also rewrote `getProgram`/`getLibrary` themselves to delegate to `AstUtils.getContainerOfType(node, isProgram/isLibrary)` (typed `AstNode` instead of `any`), which clears the paired anti-pattern note under "Manual `getProgram`/`getLibrary` parent-walk instead of `AstUtils.getContainerOfType`". Pure refactor, behavior-preserving.
**Severity:** High
**Sites:** [eligian-validator.ts:501](packages/language/src/eligian-validator.ts#L501), [eligian-validator.ts:1977](packages/language/src/eligian-validator.ts#L1977), [eligian-validator.ts:2069](packages/language/src/eligian-validator.ts#L2069), [eligian-validator.ts:2340](packages/language/src/eligian-validator.ts#L2340); helper at [eligian-validator.ts:1376](packages/language/src/eligian-validator.ts#L1376)
`let node: any = ...; while (node && node.$type !== 'Program') node = node.$container;` (typed `any`) is copy-pasted; the existing `getProgram` helper is a drop-in replacement. (See also anti-pattern A-getProgram: prefer `AstUtils.getContainerOfType`.)
**Abstraction:** Replace all four with `this.getProgram(node)` then `program?.$document?.uri?.toString()`; ideally rewrite `getProgram`/`getLibrary` to use `AstUtils.getContainerOfType`.

### D7. Three LSP notification files are near-identical structural copies
> ✅ **FIXED** — branch `refactor/consolidate-lsp-notifications-d7` (new `lsp/asset-notifications.ts` exports the shared `AssetUpdatedParams` (`documentUris: string[]`) and `AssetImportsDiscoveredParams` (`documentUri: string`) bases; the CSS/HTML/labels param interfaces now `extend` them, retaining only their asset-specific file-URI field — `cssFileUri`/`htmlFileUri`/`labelsFileUri`, and CSS's array `cssFileUris`. The CSS-only `CSSErrorParams` pair is left in place. All public type/constant names are unchanged (consumers in `extension/src/language/main.ts` destructure the same fields), so this is a pure behavior-preserving refactor; the base is barrel-exported from `packages/language/src/index.ts`. Verified: tsgo clean (language + extension), biome clean, language suite green at 2001 passed/23 skipped, 337 extension tests green, build clean.)
**Severity:** High
**Sites:** [css-notifications.ts:1](packages/language/src/lsp/css-notifications.ts#L1), [labels-notifications.ts:1](packages/language/src/lsp/labels-notifications.ts#L1), [html-notifications.ts:1](packages/language/src/lsp/html-notifications.ts#L1)
Each defines the same UPDATED + IMPORTS_DISCOVERED notification/param pair, differing only by prefix and minor field shapes (CSS also has an ERROR pair).
**Abstraction:** Generic `AssetUpdatedParams`/`AssetImportsDiscoveredParams` base in `lsp/asset-notifications.ts`; asset-specific files extend/re-export.

### D8. Trigger-revalidation loop duplicated six times in language/main.ts
> ✅ **FIXED** — branch `refactor/trigger-revalidation-d8-b51` (extracted a single `triggerRevalidation(documentUris)` helper in `packages/extension/src/language/main.ts`; all six CSS/labels/HTML success+error loops now delegate to it, parsing each URI once — resolves B51. Verified: tsgo clean, 337 extension tests green, biome clean.)
**Severity:** High
**Sites:** [language/main.ts:53-60](packages/extension/src/language/main.ts#L53), [language/main.ts:81-88](packages/extension/src/language/main.ts#L81), [language/main.ts:128-135](packages/extension/src/language/main.ts#L128), [language/main.ts:144-151](packages/extension/src/language/main.ts#L144), [language/main.ts:170-177](packages/extension/src/language/main.ts#L170), [language/main.ts:192-199](packages/extension/src/language/main.ts#L192)
Identical `for...getDocument(URI.parse)...update([URI.parse], [])` across success/error paths of CSS/labels/HTML handlers.
**Abstraction:** `triggerRevalidation(documentUris: string[])` that parses each URI once — also resolves B51.

### D9. Empty CSS metadata object literal constructed inline 4×
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (new `createEmptyCSSMetadata(errors?)` in `css/css-parser.ts`; all four sites delegate. Subsumes D40.)
**Severity:** Medium
**Sites:** [language/main.ts:64](packages/extension/src/language/main.ts#L64), [language/main.ts:96](packages/extension/src/language/main.ts#L96), [language/main.ts:224](packages/extension/src/language/main.ts#L224), [pipeline.ts:343](packages/language/src/compiler/pipeline.ts#L343)
The `{ classes/ids: Set, *Locations/*Rules: Map, errors: [...] }` shape (differing only in `errors`).
**Abstraction:** `createEmptyCSSMetadata(errors?: CSSParseError[])` exported from `packages/language/src/css/`.

### D10. URI-to-fsPath decoding duplicated across 3 code-action sites
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (new `uriToFsPath(uri)` in `utils/path-utils.ts` via `URI.parse(uri).fsPath`; all three sites delegate, fixing B60.)
**Severity:** Medium
**Sites:** [language-block-code-actions.ts:66](packages/language/src/labels/language-block-code-actions.ts#L66), [eligian-code-action-provider.ts:74](packages/language/src/eligian-code-action-provider.ts#L74), [eligian-code-action-provider.ts:300](packages/language/src/eligian-code-action-provider.ts#L300)
`.replace('file:///','')` + `decodeURIComponent` with identical comments (also bug B60).
**Abstraction:** `uriToFsPath(uri): string` (via `URI.parse(uri).fsPath`) in `utils/path-utils.ts`.

### D11. Six near-identical traversal methods in `CSSRegistryService`
> ✅ **FIXED** — branch `refactor/consolidate-css-registry-queries-d11` (extracted two private generics on `CSSRegistryService`: `collectFromImports<T>(documentUri, select)` (Set-accumulating, used by `getClassesForDocument`/`getIDsForDocument`) and `findInImports<T>(documentUri, lookup)` (first-match across imports, used by `findClassLocation`/`findIDLocation`/`getClassRule`/`getIDRule`). The six public methods are now one-line delegations preserving their JSDoc and exact behavior (import-order iteration, skip-unparsed-files, first-truthy-wins). Pure refactor, behavior-preserving. Verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped, coverage CI passing.)
**Severity:** High
**Sites:** [css-registry.ts:130](packages/language/src/css/css-registry.ts#L130), [css-registry.ts:160](packages/language/src/css/css-registry.ts#L160), [css-registry.ts:197](packages/language/src/css/css-registry.ts#L197), [css-registry.ts:224](packages/language/src/css/css-registry.ts#L224), [css-registry.ts:257](packages/language/src/css/css-registry.ts#L257), [css-registry.ts:284](packages/language/src/css/css-registry.ts#L284)
`getClassesForDocument`/`getIDsForDocument`/`findClassLocation`/`findIDLocation`/`getClassRule`/`getIDRule` share the imports→loop→metadata→map-lookup structure (~120 lines).
**Abstraction:** Private generic `queryImportedFiles<T>(documentUri, extract)` with Set-accumulating and first-match variants.

### D12. `CLASS_NAME_OPERATIONS` / `SELECTOR_OPERATIONS` duplicated verbatim
> ✅ **FIXED** — branch `refactor/consolidate-css-operations-d12` (new `packages/language/src/css/css-operations.ts` exports the two Sets as the single source of truth; `context-detection.ts` and `hover-detection.ts` now import them and the byte-identical local declarations are deleted. Pure behavior-preserving refactor. Verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped, coverage CI passing.)
**Severity:** High
**Sites:** [context-detection.ts:36](packages/language/src/css/context-detection.ts#L36), [context-detection.ts:41](packages/language/src/css/context-detection.ts#L41), [hover-detection.ts:33](packages/language/src/css/hover-detection.ts#L33), [hover-detection.ts:38](packages/language/src/css/hover-detection.ts#L38)
**Abstraction:** Shared `css/css-operations.ts` exporting both Sets.

### D13. `createCSSClassEdit` / `createCSSIDEdit` near-identical (~50 lines)
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (new `createCSSIdentifierEdit(uri, name, content, type)`; both functions are now thin `'class'`/`'id'` wrappers.)
**Severity:** Medium
**Sites:** [code-action-helpers.ts:91](packages/language/src/css/code-action-helpers.ts#L91), [code-action-helpers.ts:128](packages/language/src/css/code-action-helpers.ts#L128)
Differ only by `.` vs `#` prefix and a local var name.
**Abstraction:** `createCSSIdentifierEdit(uri, name, content, type: 'class'|'id')`; keep thin wrappers.

### D14. `extractTimeValue` and `parseTimeRange` copy-pasted (inference vs validation)
> ✅ **FIXED** — branch `refactor/consolidate-time-expression-d14` (new `packages/language/src/type-system-typir/utils/time-expression.ts` exports `extractTimeValue` and `parseTimeRange` as the single source of truth; `event-inference.ts` and `event-validation.ts` import them and the two character-identical private copies are deleted. The pre-existing string-based `utils/time-parser.ts` is a separate, unrelated helper (AST-node vs string parsing) and was left untouched. Pure behavior-preserving refactor. Verified: tsgo typecheck clean, biome clean, full language suite green at 2001 passed/23 skipped, coverage CI passing.)
**Severity:** High
**Sites:** [event-inference.ts:23](packages/language/src/type-system-typir/inference/event-inference.ts#L23), [event-inference.ts:66](packages/language/src/type-system-typir/inference/event-inference.ts#L66), [event-validation.ts:28](packages/language/src/type-system-typir/validation/event-validation.ts#L28), [event-validation.ts:71](packages/language/src/type-system-typir/validation/event-validation.ts#L71)
Character-identical including JSDoc and TODOs.
**Abstraction:** Shared `type-system-typir/utils/time-expression.ts`.

### D15. String→Typir-type mapping switch duplicated 3× in `EligianTypeSystem`
> ✅ **FIXED** — branch `refactor/consolidate-validator-typesystem-dedup` (private `resolveTypirPrimitiveType()` is now the single source of truth; the three switches delegate with site-specific `?? this.stringType` / `?? this.unknownType` fallbacks, preserving prior defaults).
**Severity:** High
**Sites:** [eligian-type-system.ts:209](packages/language/src/type-system-typir/eligian-type-system.ts#L209), [eligian-type-system.ts:277](packages/language/src/type-system-typir/eligian-type-system.ts#L277), [eligian-type-system.ts:379](packages/language/src/type-system-typir/eligian-type-system.ts#L379)
**Abstraction:** Private `resolveTypirPrimitiveType(typeName): Type`; delegate from all three.

### D16. `requestAction + startAction/endAction` triplet hand-coded in 4 places
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (new `buildActionCallOperations(actionName, actionOperationData, sourceLocation, verb)`; all four sites delegate.)
**Severity:** Medium
**Sites:** [ast-transformer.ts:1262](packages/language/src/compiler/ast-transformer.ts#L1262), [ast-transformer.ts:930](packages/language/src/compiler/ast-transformer.ts#L930), [ast-transformer.ts:1066](packages/language/src/compiler/ast-transformer.ts#L1066), [ast-transformer.ts:1722](packages/language/src/compiler/ast-transformer.ts#L1722)
**Abstraction:** `buildActionCallOperations(actionName, actionOperationData, sourceLocation, isEnd): OperationConfigIR[]`.

### D17. Parse-error extraction duplicated (parseSource vs parseLibraryDocument)
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (extracted `extractDocumentErrors(document, hints)` in `pipeline.ts` — an `Effect<void, ParseError>` that runs the three identical lexer/parser/diagnostic location-computing checks; `parseSource` and `parseLibraryDocument` each delegate, passing a `DocumentErrorHints` object for the few message/hint strings that differ. Pure behavior-preserving refactor.)
**Severity:** High
**Sites:** [pipeline.ts:389](packages/language/src/compiler/pipeline.ts#L389), [pipeline.ts:741](packages/language/src/compiler/pipeline.ts#L741)
Identical lexer/parser/diagnostics → `ParseError` shape.
**Abstraction:** `extractDocumentErrors(document, fileHint?): Effect<void, ParseError>`.

### D18. `format{Parse,Validation,Type,Transform}Error` share structure
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (new private `buildFormattedError(prefix, error, sourceCode, hint)` in `error-reporter.ts` assembles the prefix+message / `at <location>` line / code snippet / hint; the four public formatters are now one-line delegations differing only in the prefix string and which `generate*Hint` runs. Pure behavior-preserving refactor.)
**Severity:** Medium
**Sites:** [error-reporter.ts:34](packages/language/src/compiler/error-reporter.ts#L34), [error-reporter.ts:65](packages/language/src/compiler/error-reporter.ts#L65), [error-reporter.ts:95](packages/language/src/compiler/error-reporter.ts#L95), [error-reporter.ts:125](packages/language/src/compiler/error-reporter.ts#L125)
**Abstraction:** `buildFormattedError(prefix, error, sourceCode, hintFn)`.

### D19. `_tag` type-guard predicate copy-pasted 14× across two packages
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (new `hasTag<T extends string>(error, tag): error is { _tag: T }` in `packages/shared-utils/src/tag-guard.ts`, barrel-exported. All 14 guards — the 10 in `errors/type-guards.ts` and the 4 in `shared-utils/errors.ts` — are now one-line `hasTag(error, '...')` delegations, and `isIOError` ORs four `hasTag` calls. The `import { hasTag } from '@eligian/shared-utils'` binds locally (the previous revert failed because it referenced the *re-exported* leaf guards, which aren't bound in module scope). Verified across language/shared-utils/extension/cli typecheck + suites.)
**Severity:** High *(merges the language `type-guards.ts` set and the shared-utils set)*
**Sites:** [type-guards.ts:58](packages/language/src/errors/type-guards.ts#L58), [type-guards.ts:77](packages/language/src/errors/type-guards.ts#L77), [type-guards.ts:99](packages/language/src/errors/type-guards.ts#L99), [type-guards.ts:118](packages/language/src/errors/type-guards.ts#L118), [type-guards.ts:140](packages/language/src/errors/type-guards.ts#L140), [type-guards.ts:162](packages/language/src/errors/type-guards.ts#L162), [type-guards.ts:213](packages/language/src/errors/type-guards.ts#L213), [type-guards.ts:235](packages/language/src/errors/type-guards.ts#L235), [type-guards.ts:260](packages/language/src/errors/type-guards.ts#L260), [type-guards.ts:279](packages/language/src/errors/type-guards.ts#L279), [shared-utils/errors.ts:129](packages/shared-utils/src/errors.ts#L129), [shared-utils/errors.ts:144](packages/shared-utils/src/errors.ts#L144), [shared-utils/errors.ts:159](packages/shared-utils/src/errors.ts#L159), [shared-utils/errors.ts:171](packages/shared-utils/src/errors.ts#L171)
**Abstraction:** `hasTag<T extends string>(error, tag): error is { _tag: T }` in `packages/shared-utils/src/tag-guard.ts`; each guard becomes a one-liner. Also fix `isIOError` ([type-guards.ts:329](packages/language/src/errors/type-guards.ts#L329)) to compose leaf guards.

### D20. `error.hint` ternary repeated 13-15× (two inconsistent forms)
> ✅ **FIXED** — branch `refactor/consolidate-validator-typesystem-dedup` (new `formatValidationMessage(message, hint?)` in `utils/error-builder.ts`; all 13 sites delegate. The 7 unguarded sites that appended ". undefined" are unified on the guarded behavior.)
**Severity:** Medium
**Sites:** [eligian-validator.ts:687](packages/language/src/eligian-validator.ts#L687), [eligian-validator.ts:795](packages/language/src/eligian-validator.ts#L795), [eligian-validator.ts:832](packages/language/src/eligian-validator.ts#L832), [eligian-validator.ts:877](packages/language/src/eligian-validator.ts#L877), [eligian-validator.ts:902](packages/language/src/eligian-validator.ts#L902), [eligian-validator.ts:927](packages/language/src/eligian-validator.ts#L927), [eligian-validator.ts:952](packages/language/src/eligian-validator.ts#L952), [eligian-validator.ts:977](packages/language/src/eligian-validator.ts#L977), [eligian-validator.ts:1002](packages/language/src/eligian-validator.ts#L1002), [eligian-validator.ts:1534](packages/language/src/eligian-validator.ts#L1534), [eligian-validator.ts:1561](packages/language/src/eligian-validator.ts#L1561), [eligian-validator.ts:1599](packages/language/src/eligian-validator.ts#L1599), [eligian-validator.ts:1625](packages/language/src/eligian-validator.ts#L1625), [eligian-validator.ts:1688](packages/language/src/eligian-validator.ts#L1688)
Guarded vs unguarded forms coexist (B-level inconsistency at 1688).
**Abstraction:** `formatValidationMessage(message, hint?)` in `utils/error-builder.ts`.

### D21. Constructor dual-API branching copy-pasted across 4 compiler error constructors
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (dropped the positional overloads from `createParseError`/`createValidationError`/`createTypeError`/`createTransformError` — production used the object form exclusively; the `typeof firstArg === 'string'` dispatch + duplicate return blocks are gone, each constructor is now a single object→object map. The only positional callers were two test files (`error-reporter.spec.ts`, `library-errors.spec.ts`), migrated to the object form.)
**Severity:** High
**Sites:** [compiler-errors.ts:203](packages/language/src/errors/compiler-errors.ts#L203), [compiler-errors.ts:236](packages/language/src/errors/compiler-errors.ts#L236), [compiler-errors.ts:269](packages/language/src/errors/compiler-errors.ts#L269), [compiler-errors.ts:305](packages/language/src/errors/compiler-errors.ts#L305)
Each does `typeof firstArg === 'string'` dispatch into two return blocks.
**Abstraction:** Drop the positional overloads (object form is used everywhere), or a `resolveParams<T>` normalizer.

### D22. `Html/Css/MediaImportError` structurally identical shapes/constructors/formatters
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (new exported `FileImportErrorBase` holds the five shared fields; `HtmlImportError`/`CssImportError`/`MediaImportError` are now `FileImportErrorBase & { _tag }` intersections (HTML keeps its optional `line`/`column`). A private generic `makeImportError<T, P>(tag, params)` is the single constructor body; the three public constructors are thin typed wrappers. `CssParseError` (different shape) is unchanged. The three identical `${baseMessage} (${error.filePath})` formatter cases are collapsed into one fall-through case.)
**Severity:** Medium
**Sites:** [asset-errors.ts:28](packages/language/src/errors/asset-errors.ts#L28), [asset-errors.ts:54](packages/language/src/errors/asset-errors.ts#L54), [asset-errors.ts:97](packages/language/src/errors/asset-errors.ts#L97), [asset-errors.ts:127](packages/language/src/errors/asset-errors.ts#L127), [asset-errors.ts:154](packages/language/src/errors/asset-errors.ts#L154), [asset-errors.ts:202](packages/language/src/errors/asset-errors.ts#L202), [formatters.ts:105](packages/language/src/errors/formatters.ts#L105)
**Abstraction:** `FileImportErrorBase` + intersection types; generic `makeImportError<T>(tag, params)`; collapse the formatter cases.

### D23. Four structurally identical IO type guards in shared-utils (subset of D19)
**Severity:** Medium — *merged into D19.*

### D24. `validateHtml` and `validateCss` structurally identical
> ✅ **FIXED** — branch `fix/correctness-batches-b2-b14` (new private generic `validateContentFile(absolutePath, relativePath, sourceLocation, validate, invalidType, label)` on `AssetValidationService` is the single source of truth; `validateHtml`/`validateCss` are now thin wrappers passing the validator callback, the `'invalid-html'`/`'invalid-css'` error type, and the `'HTML'`/`'CSS'` label. Pure behavior-preserving refactor.)
**Severity:** High
**Sites:** [asset-validation-service.ts:100](packages/language/src/asset-loading/asset-validation-service.ts#L100), [asset-validation-service.ts:147](packages/language/src/asset-loading/asset-validation-service.ts#L147)
**Abstraction:** Generic private helper taking the validator, error-type string, and message prefix.

### D25. Extension→type-mapping duplicated: `inferImportAssetType` vs `EXTENSION_MAP`
> ✅ **FIXED** — branch `fix/correctness-batches-b2-b14` (the named-import extension switch in `inferImportAssetType` now delegates to `inferAssetType(importStmt.path)` from `utils/asset-type-inference.ts` (the `EXTENSION_MAP` single source of truth), falling back to `'media'`; the now-unused `getFileExtension` import is dropped. Behavior-preserving — `inferAssetType` recognizes the same html/css/mp4/webm/mp3/wav set.)
**Severity:** Medium
**Sites:** [compiler-integration.ts:251-254](packages/language/src/asset-loading/compiler-integration.ts#L251), [asset-type-inference.ts:23](packages/language/src/utils/asset-type-inference.ts#L23)
**Abstraction:** Call `inferAssetType(path)` from `inferImportAssetType`; fall back to `'media'`.

### D26. `convertOperationMetadata` / `convertControllerMetadata` duplicate property extraction
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (extracted `extractParameters(properties)` + `extractOutputs(outputProperties)`; both converters delegate.)
**Severity:** Medium
**Sites:** [generate-metadata.ts:42](packages/language/src/completion/generate-metadata.ts#L42), [generate-metadata.ts:95](packages/language/src/completion/generate-metadata.ts#L95)
**Abstraction:** `extractParameters(properties)` (+ `extractOutputs` for operations).

### D27. Duplicate-detection Map loops: actions / library actions / constants
> ✅ **FIXED** — branch `refactor/consolidate-validator-typesystem-dedup` (private generic `reportDuplicatesByName<T extends AstNode & { name: string }>()`; the three checks filter their items and delegate.)
**Severity:** Medium
**Sites:** [eligian-validator.ts:235](packages/language/src/eligian-validator.ts#L235), [eligian-validator.ts:266](packages/language/src/eligian-validator.ts#L266), [eligian-validator.ts:2497](packages/language/src/eligian-validator.ts#L2497)
**Abstraction:** Generic `detectDuplicatesByName<T extends {name}>(...)`.

### D28. Parameter-count error message duplicated 3× (local/imported/library)
> ✅ **FIXED** — branch `refactor/consolidate-validator-typesystem-dedup` (private `reportActionParameterCountError(opName, parameters, argumentCount, node, accept)`; the three checks in `checkParameterCount` delegate.)
**Severity:** Medium
**Sites:** [eligian-validator.ts:720](packages/language/src/eligian-validator.ts#L720), [eligian-validator.ts:748](packages/language/src/eligian-validator.ts#L748), [eligian-validator.ts:770](packages/language/src/eligian-validator.ts#L770)
**Abstraction:** `reportActionParameterCountError(opName, expected, got, parameters, node, accept)`.

### D29. `MissingLabelIDData` diagnostic-data block duplicated 3×
> ✅ **FIXED** — branch `refactor/consolidate-validator-typesystem-dedup` (private `reportLabelIDError(node, error, labelId, labelsFileUri, languageCodes, accept)`; the three diagnostic-data blocks delegate.)
**Severity:** Medium
**Sites:** [eligian-validator.ts:2298](packages/language/src/eligian-validator.ts#L2298), [eligian-validator.ts:2398](packages/language/src/eligian-validator.ts#L2398), [eligian-validator.ts:2428](packages/language/src/eligian-validator.ts#L2428)
**Abstraction:** `reportLabelIDError(node, error, labelId, labelsFileUri, languageCodes, accept)`.

### D30. Library-document resolution duplicated in two validators
> ✅ **FIXED** — branch `refactor/library-document-resolution-d30-b4` (extracted private `resolveLibraryNode(libraryImport): Library | undefined` on `EligianValidator`, resolving via `resolveLibraryPath`; both `checkImportedActionsExist` and `checkImportedActionsPublic` now delegate to it, fixing B4 at the same time. Verified: tsgo clean, biome lint clean, full language suite green at 2001 passed/23 skipped.)
**Severity:** High
**Sites:** [eligian-validator.ts:2564](packages/language/src/eligian-validator.ts#L2564), [eligian-validator.ts:2698](packages/language/src/eligian-validator.ts#L2698)
Identical normalize→dir→parse→`getDocument`→null-check (also the B4 ad-hoc-URI bug).
**Abstraction:** Private resolver returning the library document or `undefined`; fix B4 here at the same time.

### D31. CLI `isExternalUrl`/`isDataUri` and `resolveAssetPath`/`resolveUrl` triplicated
> ✅ **FIXED** — branch `refactor/cli-bundler-cluster-d31` (new `cli/src/bundler/url-utils.ts` exports `isExternalUrl`/`isDataUri`/`resolveAssetPath` as the single source of truth; the byte-identical private copies in `asset-collector.ts`/`css-processor.ts`/`html-generator.ts` are deleted — css-processor's `resolveUrl` and html-generator's `resolveAssetPath` collapse into the shared `resolveAssetPath`. `asset-collector.ts` re-exports `resolveAssetPath` for its existing test import; `html-generator.ts` drops its now-unused `node:path` import.)
**Severity:** High
**Sites:** [asset-collector.ts:73-82](packages/cli/src/bundler/asset-collector.ts#L73), [css-processor.ts:43-52](packages/cli/src/bundler/css-processor.ts#L43), [html-generator.ts:129-138](packages/cli/src/bundler/html-generator.ts#L129) (url helpers); [asset-collector.ts:242-245](packages/cli/src/bundler/asset-collector.ts#L242), [css-processor.ts:61-64](packages/cli/src/bundler/css-processor.ts#L61), [html-generator.ts:147-150](packages/cli/src/bundler/html-generator.ts#L147) (path resolution)
**Abstraction:** Shared `cli/src/bundler/url-utils.ts` with `isExternalUrl`, `isDataUri`, and a single `resolveAssetPath`.

### D32. Asset-Map upsert pattern duplicated 3× in `collectAssets`
> ✅ **FIXED** — branch `refactor/cli-bundler-cluster-d31` (new private `tryAppendAssetSource(assets, absolutePath, source)`; the three upsert blocks build the `AssetSource` once, early-`continue` on an existing entry, then fall through to entry creation. Preserves laziness — files are read/inlined only for new assets — and removes the `has`+`get!` double-lookup.)
**Severity:** Medium
**Sites:** [asset-collector.ts:471-508](packages/cli/src/bundler/asset-collector.ts#L471), [asset-collector.ts:527-551](packages/cli/src/bundler/asset-collector.ts#L527), [asset-collector.ts:571-606](packages/cli/src/bundler/asset-collector.ts#L571)
**Abstraction:** `upsertAsset(assets, absolutePath, source, entry)`.

### D33. `getFileType` called twice in the same loop iteration
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Medium
**Sites:** [bundler/index.ts:258](packages/cli/src/bundler/index.ts#L258), [bundler/index.ts:261](packages/cli/src/bundler/index.ts#L261)
**Abstraction:** `const fileType = getFileType(ext)` once.

### D34. `printParseErrors` / `printCompilationErrors` byte-identical
> ✅ **FIXED** — branch `refactor/cli-bundler-cluster-d31` (new `printFormattedErrors(header, formatted)` in `main.ts`; both byte-identical printers deleted, the two call sites pass `'Parse failed:'` / `'Compilation failed:'`. `printAssetErrors` left unchanged — different shape.)
**Severity:** Medium
**Sites:** [main.ts:48-64](packages/cli/src/main.ts#L48), [main.ts:97-113](packages/cli/src/main.ts#L97)
**Abstraction:** `printFormattedErrors(header, formatted)`.

### D35. `resolveImports` vs `resolveLibraryImports` near-identical recursion
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (extracted the shared resolve-path → cycle-check → `getDocument` → `isLibrary` step into private `resolveLibraryDocument(fromUri, importPath, visited)`; both functions delegate. Their divergent action-collection semantics — selective+alias vs whole-library — were intentionally left intact to avoid changing compilation output.)
**Severity:** Medium *(also anti-pattern)*
**Sites:** [ast-transformer.ts:144](packages/language/src/compiler/ast-transformer.ts#L144), [ast-transformer.ts:213](packages/language/src/compiler/ast-transformer.ts#L213)
**Abstraction:** `collectImportedActions(importStatements, visited, currentUri)`.

### D36. Locale-editor webview/extension type & function duplication
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`, commit `5bbfb9f`): webview now imports `SerializableKeyTreeNode`/`LocaleEditorState`/`findNodeByKey`/pure `removeKeyFromTree` from `locale-editor-core` (core is the single source of truth); the divergent inline locale-code regex replaced with core `validateLocaleCode`. Host-side `locale-editor/types.ts` duplication left as-is to avoid coupling the webview to the extension host.
**Severity:** High *(cluster; merges several findings)*
**Sites:** `SerializableKeyTreeNode`/`LocaleEditorState` defined in [types.ts:40-55](packages/extension/src/extension/locale-editor/types.ts#L40), [media/locale-editor-core.ts:42-48](packages/extension/media/locale-editor-core.ts#L42), [media/locale-editor-core.ts:64-72](packages/extension/media/locale-editor-core.ts#L64), [media/locale-editor.ts:33-40](packages/extension/media/locale-editor.ts#L33), [media/locale-editor.ts:84-100](packages/extension/media/locale-editor.ts#L84); `findNodeByKey` ([media/locale-editor-core.ts:578-590](packages/extension/media/locale-editor-core.ts#L578) vs [media/locale-editor.ts:1420-1432](packages/extension/media/locale-editor.ts#L1420)); `removeKeyFromTree` pure vs mutating ([media/locale-editor-core.ts:655-666](packages/extension/media/locale-editor-core.ts#L655) vs [media/locale-editor.ts:1512-1529](packages/extension/media/locale-editor.ts#L1512))
The locale-code regex also diverges (`{2,3}` in core vs `{2}` inline at locale-editor.ts:1651), a real behavioral inconsistency.
**Abstraction:** Single shared module for the types/message-union; import `findNodeByKey`/pure `removeKeyFromTree` from core and delete the local copies (the mutating `removeKeyFromTree` is tied to bug B18).

### D37. `buildTreeFromKeys` / `buildTreeFromKeysWithPrefix` near-identical (~60 lines)
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): collapsed into a single `buildTreeFromKeys(keys, locales, prefix='')` (root case is `prefix === ''`).
**Severity:** High
**Sites:** [key-tree-builder.ts:90-150](packages/extension/src/extension/locale-editor/key-tree-builder.ts#L90), [key-tree-builder.ts:155-222](packages/extension/src/extension/locale-editor/key-tree-builder.ts#L155)
**Abstraction:** Single `buildTreeFromKeysWithPrefix(keys, locales, prefix='')`.

### D38. `searchWorkspace` / `getKeyUsageDetails` duplicate find/regex/read setup
> ✅ **FIXED** — PR #58 (`fix/locale-editor-cluster`): extracted `buildKeyUsagePatterns`/`forEachEligianFile`/`collectLineMatches`; each caller now only post-processes.
**Severity:** High
**Sites:** [LocaleUsageTracker.ts:54-103](packages/extension/src/extension/locale-editor/LocaleUsageTracker.ts#L54), [LocaleUsageTracker.ts:114-190](packages/extension/src/extension/locale-editor/LocaleUsageTracker.ts#L114)
**Abstraction:** Shared private helper returning raw match data; each caller post-processes.

### D39. `locale-serializer.ts` duplicates `key-tree-builder.ts` tree logic and is unused
> ✅ **FIXED** — `locale-serializer.ts` was already removed in earlier work (no longer tracked/present); confirmed on branch `refactor/dedup-tail-track-a`. No action required.
**Severity:** Medium
**Sites:** [locale-serializer.ts](packages/extension/src/extension/locale-editor/locale-serializer.ts), [key-tree-builder.ts:289-309](packages/extension/src/extension/locale-editor/key-tree-builder.ts#L289)
**Abstraction:** Remove `locale-serializer.ts` (only a test imports it) and migrate the test, or have `key-tree-builder` delegate.

### D40. CSS error-metadata construction duplicated (notification paths)
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (resolved by the D9 `createEmptyCSSMetadata` extraction; the notification-path sites delegate to it.)
**Severity:** Medium — *subset of D9; same `createEmptyCSSMetadata` fix.*
**Sites:** [language/main.ts:63-79](packages/extension/src/language/main.ts#L63), [language/main.ts:96-104](packages/extension/src/language/main.ts#L96), [language/main.ts:221-232](packages/extension/src/language/main.ts#L221)

### D41. `jsdoc-formatter` manual `lines.push/join` instead of `MarkdownBuilder`
> ✅ **FIXED** — branch `refactor/dedup-tail-track-a` (`formatJSDocAsMarkdown` now builds via `MarkdownBuilder`; output byte-identical.)
**Severity:** Medium
**Sites:** [jsdoc-formatter.ts:18](packages/language/src/jsdoc/jsdoc-formatter.ts#L18), [jsdoc-formatter.ts:48](packages/language/src/jsdoc/jsdoc-formatter.ts#L48)
**Abstraction:** Refactor `formatJSDocAsMarkdown` to use `MarkdownBuilder` (the pattern it was built to replace).

### D42. File-basename extraction `split(/[\\/]/).pop()` duplicated in `formatLocation`
> ✅ **FIXED** — branch `refactor/errors-module-dedup-d17-d22` (private `getBaseName(filePath)` in `formatters.ts`; both the `CssParseError` and `location`-bearing branches of `formatLocation` delegate to it.)
**Severity:** Low
**Sites:** [formatters.ts:64](packages/language/src/errors/formatters.ts#L64), [formatters.ts:71](packages/language/src/errors/formatters.ts#L71)
**Abstraction:** Private `getBaseName(filePath)`.

### D43. `createValidationError` wraps a static object in an unnecessary arrow
> ✅ **FIXED** — branch `fix/correctness-batches-b2-b14` (`ERROR_MESSAGES.ABSOLUTE_PATH`/`INVALID_PATH_FORMAT` are now zero-arg functions like every other entry, so the call site drops its `() => ERROR_MESSAGES.ABSOLUTE_PATH` arrow wrapper and passes `ERROR_MESSAGES.ABSOLUTE_PATH` directly. Uniform `(...args) => { message, hint }` shape across the table.)
**Severity:** Medium
**Sites:** [import-path-validator.ts:50](packages/language/src/validators/import-path-validator.ts#L50), [validation-errors.ts:74](packages/language/src/validators/validation-errors.ts#L74)
**Abstraction:** Make `ERROR_MESSAGES.ABSOLUTE_PATH`/`INVALID_PATH_FORMAT` zero-arg functions for shape consistency.

### D44. Validator result shape `{ valid; errors[] }` duplicated without a base type
> ✅ **FIXED** — branch `fix/correctness-batches-b2-b14` (new generic `ValidationResult<TError>` in `asset-loading/types.ts`; `HtmlValidationResult`/`CssValidationResult`/`MediaValidationResult` are now aliases `ValidationResult<HtmlValidationError>` etc. Behavior-preserving — consumers see the same shapes.)
**Severity:** Low
**Sites:** [css-validator.ts:26](packages/language/src/asset-loading/css-validator.ts#L26), [html-validator.ts:30](packages/language/src/asset-loading/html-validator.ts#L30), [media-validator.ts:29](packages/language/src/asset-loading/media-validator.ts#L29)
**Abstraction:** Generic `ValidationResult<TError>` in `types.ts`.

---

## Anti-Patterns

### Theme: God classes / god modules
- **`EligianValidator` god class (3000+ lines, 40+ methods).** [eligian-validator.ts:203](packages/language/src/eligian-validator.ts#L203). All validation concerns in one class; the root cause of clusters D5/D6/D20/D27-D30. **Fix:** Decompose into focused validator classes registered via `registerValidationChecks`. ✅ **FIXED** — branch `refactor/eligian-validator-god-class-decomposition` (the 3077-line monolith is split into an abstract `BaseValidator` — holding the shared surface: `services`, `getProgram`, `getLibrary`, `reportDuplicatesByName`, `ensureCSSImportsRegistered` — plus seven focused subclasses grouped by AST-node concern under `packages/language/src/validators/`: `ProgramValidator`, `ImportValidator`, `TimelineValidator`, `OperationCallValidator`, `ActionValidator`, `LanguagesValidator`, `EventActionValidator`. Each group-local helper moved with its group: `validateCSSFileErrors`+`fileExistsAsync`→Program; `resolveLibraryNode`→Import; `reportActionParameterCountError`/`findImportedActionByNameOrAlias`/`isDirectTimelineCall`/`isDescendantOf`/`reportLabelIDError`/`ensureLabelsImportsRegistered`+`initializedLabelDocuments`→OperationCall; `validateControlFlowPairingForOps`/`validateOperationSequence`/`getAllOperationCalls`/`collectOperationCallsFromStatements`/`isInsideForLoop`→Action. `eligian-validator.ts` drops to 199 lines: it keeps `MISSING_LABELS_FILE_CODE`/`isValidLanguageCode` exported, makes `EligianValidator` a composition root that constructs the seven sub-validators as public readonly fields (so the DI entry `services.validation.EligianValidator` still resolves), and `registerValidationChecks` issues seven `registry.register(map, instance)` calls — every AST node type belongs to exactly one group, so the node-type→check-method arrays, ordering, and inline comments mirror the original single `checks` map exactly. Method bodies moved verbatim — pure behavior-preserving refactor: typecheck clean, biome clean on the changed files, full language suite green at baseline 1995 passed/23 skipped, coverage CI exit 0.)
- **`extension/main.ts` god module (515 lines).** [main.ts:251](packages/extension/src/extension/main.ts#L251), [main.ts:364](packages/extension/src/extension/main.ts#L364), [main.ts:417](packages/extension/src/extension/main.ts#L417), [main.ts:473](packages/extension/src/extension/main.ts#L473). Move compile/JSDoc/locale commands into `commands/*` files (as already done for preview). ✅ **FIXED** — branch `refactor/extension-main-god-module-decomposition` (compile → `commands/compile.ts`, JSDoc generation + `/**` auto-completion → `commands/jsdoc.ts`, "Edit Labels" → `commands/locale.ts`, each exporting a `register*` returning `vscode.Disposable`; `main.ts` drops to 254 lines and just wires them into `context.subscriptions`. The compiler output channel (B49) moved into `commands/compile.ts` behind a `disposeCompilerOutputChannel()` export wired from `main.ts`. The unused `client` param on `registerJSDocAutoCompletion` was dropped. Behavior-preserving; typecheck clean, biome clean, 337 extension tests green, build clean).

### Theme: Pervasive `any` and lost type safety
- **`EligianValidator.services` optional.** [eligian-validator.ts:204](packages/language/src/eligian-validator.ts#L204), [eligian-validator.ts:206](packages/language/src/eligian-validator.ts#L206). `if (!this.services) return;` silently skips checks in tests. Make required. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (field + constructor now require a non-optional `EligianServices`; only ever constructed via `eligian-module.ts` with real services, so the now-redundant guards are left in place behavior-preserving).
- **`CustomKind` factories typed `any`** (B12) — masks B13/B29.
- **`buildCSSIdentifierInfo` uses `any` metadata.** [css-hover.ts:158](packages/language/src/css/css-hover.ts#L158), [css-hover.ts:159](packages/language/src/css/css-hover.ts#L159). Use a generic `<M>`. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (now generic `<M>`; both callers infer `M`).
- **`detectClassNameHover` `_operationCall: any` unused.** [hover-detection.ts:93](packages/language/src/css/hover-detection.ts#L93). Remove the param. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (unused param removed, caller updated).
- **`extractElementName(arg: any)`.** [context-detection.ts:148](packages/language/src/html/context-detection.ts#L148). Use the AST expression union type. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (`arg: AstNode | undefined`).
- **`getTimelines`/`getVariables` use `$type` string + `as`-cast.** [program-helpers.ts:58](packages/language/src/utils/program-helpers.ts#L58), [program-helpers.ts:78](packages/language/src/utils/program-helpers.ts#L78), [program-helpers.ts:79](packages/language/src/utils/program-helpers.ts#L79). Use generated `isTimeline`/`isVariableDeclaration`. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (both now filter via the generated guards, dropping the casts).
- **`findActionBelow` untyped `root`/`items`.** [ast-navigation.ts:33](packages/language/src/utils/ast-navigation.ts#L33), [ast-navigation.ts:38](packages/language/src/utils/ast-navigation.ts#L38). Use `EligianFile`/`isProgram`/`isLibrary`. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (`isProgram`/`isLibrary` guards + `AstNode[]` items).
- **Manual `getProgram`/`getLibrary` parent-walk instead of `AstUtils.getContainerOfType`.** [eligian-validator.ts:1376](packages/language/src/eligian-validator.ts#L1376), [eligian-validator.ts:1391](packages/language/src/eligian-validator.ts#L1391). ✅ **FIXED** — branch `refactor/consolidate-program-root-traversal-d6` (both helpers now delegate to `AstUtils.getContainerOfType`; fixed alongside D6).

### Theme: Test/dev artifacts leaking into production
- **`getOrCreateServices()` registers test CSS classes in the production singleton.** [pipeline.ts:64](packages/language/src/compiler/pipeline.ts#L64), [pipeline.ts:72](packages/language/src/compiler/pipeline.ts#L72). Phantom classes (`test-container`, `invalid1`…) make user docs pass CSS validation incorrectly. ✅ **FIXED** — branch `fix/bug-tail-final` (extracted the fixture seeding into `registerTestCSSFixtures()` and gated it behind `process.env.VITEST`, so the shared production singleton no longer injects phantom classes into real user documents — the false-negative in CSS-class validation is gone. The whole suite relies on the seeding, so it is gated to test runs rather than deleted outright.)
- **Debug `console.log/trace` in webview (29 calls).** [media/locale-editor.ts:462-463](packages/extension/media/locale-editor.ts#L462), [media/locale-editor.ts:224-268](packages/extension/media/locale-editor.ts#L224). Remove or gate behind a debug flag. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (all calls routed through `debugLog`/`debugTrace`, gated behind `window.__localeEditorDebug`).
- **`labels-watcher` debug `console.error`** (see B54). ✅ **FIXED** — `6b1c52a`
- **Dead `.orig` file committed.** [error-reporter.ts.orig](packages/language/src/compiler/error-reporter.ts.orig). Delete and add `*.orig` to `.gitignore`. ✅ **FIXED** — `6b1c52a`
- **Duplicate consecutive comments.** [pipeline.ts:308](packages/language/src/compiler/pipeline.ts#L308) ("Parse each CSS file…" twice); [asset-type-validator.ts:74-75](packages/language/src/validators/asset-type-validator.ts#L74) ("If inference fails…" twice). ✅ **FIXED** — `6b1c52a`

### Theme: Dead/stub code in public surface
- **`checkSingleLanguagesBlock`** empty body, never registered. [eligian-validator.ts:378](packages/language/src/eligian-validator.ts#L378). Delete. ✅ **FIXED** — `6b1c52a`
- **`compileFile`** permanently-failing stub exported publicly. [pipeline.ts:510](packages/language/src/compiler/pipeline.ts#L510). Implement via FileSystem effect or remove the export. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (function + barrel export deleted; never consumed in the language package — the CLI's own `compileFile` is unaffected).
- **`image-inliner.ts` `inlineImage`/`shouldInline` unused in production.** [image-inliner.ts:27](packages/cli/src/bundler/image-inliner.ts#L27), [image-inliner.ts:68](packages/cli/src/bundler/image-inliner.ts#L68). Delete or wire into `asset-collector`. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (module + orphan spec deleted; production inlining lives in `asset-collector.ts`).
- **`time-parser.ts` unused.** [time-parser.ts:27](packages/language/src/type-system-typir/utils/time-parser.ts#L27). Delete or document intent. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (module + orphan spec deleted; README file-tree updated).
- **Deprecated label exports retained.** [label-entry-generator.ts:142](packages/language/src/labels/label-entry-generator.ts#L142), [:161](packages/language/src/labels/label-entry-generator.ts#L161), [:170](packages/language/src/labels/label-entry-generator.ts#L170). Remove with migration note. ✅ **FIXED** — branch `refactor/anti-pattern-cleanup-batch-1` (`generateLabelEntry`/`LabelEntry`/`TranslationEntry` removed from the module and package barrel; they were exported but unused).
- **Deprecated `AssetError` interface still used.** [types.ts:32](packages/language/src/asset-loading/types.ts#L32), [asset-validation-service.ts:14](packages/language/src/asset-loading/asset-validation-service.ts#L14), [compiler-integration.ts:20](packages/language/src/asset-loading/compiler-integration.ts#L20), [index.ts:17](packages/language/src/asset-loading/index.ts#L17). Migrate to the discriminated union. ✅ **FIXED** — branch `refactor/deferred-type-migrations-batch-2` (the flat `AssetError` interface is deleted from `asset-loading/types.ts` and the barrel re-export removed; the unified `errors/asset-errors.ts` union gained a new `LocalesImportError` member — with constructor, `isLocalesImportError` guard, barrel exports, formatter case, and exhaustive-matcher coverage — so it covers the locales/JSON `validation-error` case the old flat enum carried. `AssetValidationService.validateAsset`/`buildMissingFileError` and `loadProgramAssets`/`buildLoadError` now emit the proper per-type union members keyed on `_tag`; `IAssetValidationService` and `AssetLoadingResult.errors` type against the union. The CLI's own `AssetError` class + `printAssetErrors` are unchanged — a single `toCliAssetError` adapter in `compile-file.ts` localizes all per-`_tag` shape knowledge, preserving CLI output. Asset/compiler-integration specs updated from `.type`/`.sourceLocation` to `._tag`/`.location`.)
- **`PathResolutionResult` one-armed union; `success` is a dead stub.** [path-resolver.ts:64-67](packages/shared-utils/src/path-resolver.ts#L64), [:135](packages/shared-utils/src/path-resolver.ts#L135), with dead-branch guards at [node-asset-loader.ts:89](packages/language/src/asset-loading/node-asset-loader.ts#L89), [html-import-utils.ts:42](packages/language/src/compiler/html-import-utils.ts#L42), [css-service.ts:202](packages/language/src/css/css-service.ts#L202). Add a real failure variant or return `string`. ✅ **FIXED** — branch `refactor/deferred-type-migrations-batch-2` (`PathResolutionResult` deleted; `resolvePath` now returns a bare `string`. The real consumers — `node-asset-loader.ts`, `html-import-utils.ts`, and `extension/preview/MediaResolver.ts` — drop their `.absolutePath` unwrap. *Note: the `.success` "dead-branch guards" cited at `css-service.ts:202` (and the file-load guards in the other two files) were the `loadFileSync`/`loadFileAsync` `FileLoadResult` guards, not `resolvePath` results — `resolvePath` never had a failure branch to guard, so those are untouched.* ~30 `.success`/`.absolutePath` assertions across `path-resolver.spec.ts`/`cross-platform.spec.ts` rewritten.)

### Theme: Empty/dead branches
- **Empty `else {}`.** [css-code-actions.ts:99](packages/language/src/css/css-code-actions.ts#L99). Remove. ✅ **FIXED** — `6b1c52a`
- **Magic `CompletionItemKind` literals + dead `kind === 2` branch + type-only import.** [eligian-completion-provider.ts:195](packages/language/src/eligian-completion-provider.ts#L195). Import `CompletionItemKind` as a value and use named constants; remove the dead branch. ✅ **FIXED (magic literals + type-import)** — branch `refactor/anti-pattern-cleanup-batch-1` (`CompletionItemKind` imported as a value; the `2`/`3`/`12`/`14`/`18` literals replaced with named members). The `kind === Method` branch was **retained**: verification showed it filters the provider's own `"action:"`-prefixed action items in expression position, so it is not dead — removing it is a behavior change excluded from this mechanical batch.

### Theme: Effect/error-handling fragility (non-bug-level)
- **Manual FiberFailure unwrapping in `registerCompileCommand`.** [main.ts:288](packages/extension/src/extension/main.ts#L288), [main.ts:299](packages/extension/src/extension/main.ts#L299). Use `runPromiseExit`/`Cause` (pairs with B7/B42). ✅ **FIXED** — branch `refactor/extension-main-god-module-decomposition` (fixed while extracting the compile command into `commands/compile.ts`, as planned). The hand-rolled `toJSON()` → `_id === 'FiberFailure'` → `_tag === 'Fail'` unwrapping is gone; the command now uses `Effect.runPromiseExit` + a local `causeToError` (`Cause.failureOption` with a `Cause.squash` fallback for defects) to recover the typed `CompileError`, mirroring the CLI's `compile-file.ts`. The `throw new Error('Compilation failed')` control-flow sentinel is replaced by a plain early `return`.
- **`transformEventAction` synchronous outlier** (B2) — also an architectural inconsistency.
- **Top-level `await fs.readFile(package.json)` with no try/catch.** [main.ts:20-21](packages/cli/src/main.ts#L20). Wrap with a default fallback. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (moved into a `readPackageVersion()` helper that falls back to `'0.0.0'` on a missing/unreadable file).

### Theme: Encapsulation / API hygiene
- **`getDocumentImports` returns the internal Set by reference.** [css-registry.ts:113-114](packages/language/src/css/css-registry.ts#L113). Return a defensive copy. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (now returns `new Set(imports)`).
- **`updateTrackedFiles` unintentionally public.** [css-watcher.ts:203](packages/extension/src/extension/css-watcher.ts#L203), [html-watcher.ts:189](packages/extension/src/extension/html-watcher.ts#L189), [labels-watcher.ts:195](packages/extension/src/extension/labels-watcher.ts#L195). Mark `private`. ✅ **FIXED** — `6b1c52a`
- **Global `window.__pendingDeleteIndex` side-channel** (race-prone). [media/locale-editor.ts:809](packages/extension/media/locale-editor.ts#L809), [:819](packages/extension/media/locale-editor.ts#L819), [:835](packages/extension/media/locale-editor.ts#L835). Use a module-level typed variable or pass the index through the message chain. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (replaced with a module-level `let pendingDeleteIndex: number | null`).
- **`locale-editor.ts` re-exports types it re-declares.** [media/locale-editor.ts:23](packages/extension/media/locale-editor.ts#L23). Remove the re-export. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (dead re-export removed; nothing imports from the webview bundle).
- **`createValidationError` name shadows the domain constructor.** [error-builder.ts:52](packages/language/src/utils/error-builder.ts#L52) vs [compiler-errors.ts:236](packages/language/src/errors/compiler-errors.ts#L236) / [errors/index.ts:44](packages/language/src/errors/index.ts#L44). Rename the utility. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (the `error-builder.ts` utility is renamed `buildValidationError`; 4 validator callers + its spec updated; the domain constructor is untouched).
- **`getAllOperations` JSDoc implies runtime filtering by `FILTERED_OPERATIONS`.** [registry.ts:10](packages/language/src/completion/registry.ts#L10), [registry.ts:81](packages/language/src/completion/registry.ts#L81). Clarify that filtering happens at codegen. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (JSDoc reworded: no runtime filtering; keyword-handled ops are excluded from `OPERATIONS` at codegen, `isFilteredOperation` is the runtime check).

### Theme: Performance / I/O
- **`checkImportNameCollisions` O(N²) (full scan per `LibraryImport`).** [eligian-validator.ts:2629](packages/language/src/eligian-validator.ts#L2629), [:2638](packages/language/src/eligian-validator.ts#L2638). Move to a Program-level validator. ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (re-registered as a single `Program`-level check that scans all library imports once; local-conflict lookup uses a `Set`. Also eliminates the duplicate diagnostics the per-import re-scan emitted.)
- **`getImportedActions` not memoized (called up to 3× per `OperationCall`).** [eligian-scope-provider.ts:131](packages/language/src/eligian-scope-provider.ts#L131), [eligian-validator.ts:675](packages/language/src/eligian-validator.ts#L675), [eligian-validator.ts:737](packages/language/src/eligian-validator.ts#L737), [eligian-validator.ts:1216](packages/language/src/eligian-validator.ts#L1216). Cache per document URI or via `registerBeforeDocument`. ✅ **FIXED** — branch `perf/batch-b-getimportedactions-double-filecheck` (the recursive body is extracted into a private `computeImportedActions`; the public `getImportedActions` now memoizes the **top-level** call — `visited.size === 0` — keyed on document URI string in a new `WorkspaceCache<string, ActionDefinition[]>`. `WorkspaceCache` is the build-cycle-aware invalidation the report called for: because the result depends on *other* documents (the imported libraries), it must evict whenever any workspace document is added/changed/deleted — which is exactly `WorkspaceCache`'s contract, unlike a naive `Map` (stale library AST across rebuilds) or a `DocumentCache` keyed on the importing document (would miss library edits). Recursive calls carry a non-empty `visited` set and stay uncached, since their result depends on that cycle-cutoff state.)
- **`mapParameterTypeToTypirType` ignores all but the first param type.** [eligian-type-system.ts:198](packages/language/src/type-system-typir/eligian-type-system.ts#L198), [:208](packages/language/src/type-system-typir/eligian-type-system.ts#L208). Document single-type constraint or build a union. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (single-type constraint documented inline; the union is explicitly out of scope for this behavior-preserving pass).
- **Double file-existence check for media assets.** [asset-validation-service.ts:55](packages/language/src/asset-loading/asset-validation-service.ts#L55), [:76](packages/language/src/asset-loading/asset-validation-service.ts#L76), [media-validator.ts:47](packages/language/src/asset-loading/media-validator.ts#L47), [:61](packages/language/src/asset-loading/media-validator.ts#L61). Remove one check. ✅ **FIXED** — branch `perf/batch-b-getimportedactions-double-filecheck` (`validateAsset`'s top-level `assetLoader.fileExists` guard now skips media — `assetType !== 'media' && !fileExists(...)`. Media is the only asset type with a dedicated validator that performs its **own** existence + is-file (`existsSync` + `statSync`) check, so the top-level guard was the redundant stat; the content assets html/css/json keep it because their validators load file contents and assume existence. Missing media still yields a `MediaImportError` whose message contains "not found", so the spec assertions are unchanged; the is-file/directory and empty-path branches in `MediaValidator` are now strictly more reachable.)
- **`getHtmlForWebview` synchronous `fs.readFileSync` on the extension host.** [LocaleEditorProvider.ts:654](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L654). Cache at construction or use `fs.promises`. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (the static template is read once into a cached `htmlTemplate` field; per-webview placeholder substitution still runs each call).
- **Singleton `EligianServices` in `block-label-detector` with no disposal.** [block-label-detector.ts:31](packages/extension/src/extension/decorations/block-label-detector.ts#L31). Expose `disposeServices()` (pairs with B47). ✅ **FIXED** — branch `fix/medium-bug-tail-batches` (added `disposeServices()` which nulls the singleton; the extension pushes `{ dispose: () => disposeBlockLabelServices() }` into `context.subscriptions`). **Superseded** by the B47 fix on branch `fix/b30-typir-double-invocation`: the whole `block-label-detector` module (singleton included) was deleted when bracket detection moved to the `eligian/blockLabels` LSP request, so there is no longer any singleton to dispose.

### Theme: Unsafe casts / silent failures
- **Blind `as NodeJS.ErrnoException` before any guard.** [file-loader.ts:45](packages/shared-utils/src/file-loader.ts#L45). Add an `instanceof Error` check. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (`error instanceof Error` guard before reading `.code`; non-Error throwables fall through to the generic read error).
- **`renameKeyInConfig` silently drops branch-key renames.** [locale-editor-utils.ts:306-316](packages/extension/src/extension/locale-editor/locale-editor-utils.ts#L306). Handle the object case or return an explicit error. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (`setAtPath` now accepts `string | TLocaleData`; the guard moved to `value !== undefined`, so a branch subtree is moved whole — functions are already filtered by `getAtPath`).
- **`check-usage`/`request-delete` use `'key' in message` + `any` casts.** [LocaleEditorProvider.ts:463-484](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L463), [:488-526](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L488). Introduce a proper format discriminator. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (the `(message as any).groupId` casts are gone; both handlers narrow the two protocols via the `'key' in message` discriminator so the legacy `groupId`/`index` fields type correctly).
- **Unhandled rejections from `document.save()`/`showWarningMessage()`.** [LocaleEditorProvider.ts:418-423](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L418), [:436-441](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L436), [:498-505](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L498), [:515-521](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L515). Use async/await + try/catch and send a failure message. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (`handleWebviewMessage` is `async`; all four sites `await` through new `trySaveDocument`/`tryShowWarning` try/catch helpers that report failure instead of leaving a thenable to reject).
- **`locale-editor.ts` mutates state directly, ignoring core pure functions.** [media/locale-editor.ts:499](packages/extension/media/locale-editor.ts#L499), [:727-728](packages/extension/media/locale-editor.ts#L727), [:843-848](packages/extension/media/locale-editor.ts#L843), [:976-985](packages/extension/media/locale-editor.ts#L976). Use the core transition functions. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (divergent inline select/toggle mutations route through core `selectKey`/`toggleExpanded` via a new `applyLocaleTransition` write-back helper that preserves the in-place `localeState` singleton identity tests rely on).

### Theme: Other
- **`EligianTypeSystem._typirServices` definite-assignment `!` without guard.** [eligian-type-system.ts:53](packages/language/src/type-system-typir/eligian-type-system.ts#L53). Add a getter guard. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (the `typirServices` getter throws a clear error if accessed before `onInitialize()` instead of returning `undefined`).
- **`LanguagesType` cache key omits `allLanguages`.** [languages-type.ts:92](packages/language/src/type-system-typir/types/languages-type.ts#L92). Include `allLanguages.join(',')`. ✅ **FIXED** — branch `refactor/anti-pattern-tier1-encapsulation-cleanup` (`calculateLanguagesTypeIdentifier` now appends `allLanguages.join(',')`).
- **Inline `require('node:path')` shadows the top-level import.** [css-watcher.ts:85](packages/extension/src/extension/css-watcher.ts#L85), [html-watcher.ts:82](packages/extension/src/extension/html-watcher.ts#L82), [labels-watcher.ts:86](packages/extension/src/extension/labels-watcher.ts#L86). Use `path.dirname`. ✅ **FIXED** — `6b1c52a`
- **Magic `51200` duplicated.** [types.ts:52](packages/cli/src/bundler/types.ts#L52), [main.ts:248](packages/cli/src/main.ts#L248). Export `DEFAULT_INLINE_THRESHOLD`. ✅ **FIXED** — `6b1c52a`

---

## Follow-up Worklist (not yet tracked as findings)

These items are **out of scope** of the 160 numbered findings above — they were
either created by an earlier fix (the validator decomposition relocated bulk
into a new large file) or were never flagged by the original god-class theme at
all. They are recorded here so they can be turned into tasks later; none is a
correctness defect, all are size/maintainability concerns. Verify line counts
before scheduling — they drift.

**Status:** W1 ✅ FIXED (see below). W2 and W3 remain open.

### W1. `operation-call-validator.ts` is a new god class (~1038 lines) — ✅ FIXED
**Location:** [operation-call-validator.ts](packages/language/src/validators/operation-call-validator.ts)
The `EligianValidator` decomposition (god-class anti-pattern, ✅ FIXED) split the
3077-line monolith into seven concern-grouped sub-validators. One of them,
`OperationCallValidator`, absorbed the largest concern (operation-call argument/
type/label/CSS checks) and is itself now ~1038 lines in a single class — bigger
than several files that *were* flagged. **Suggested task:** split by check family
(e.g. parameter-count, label-ID, CSS-class/selector, control-flow-pairing) into
collaborating validators or free functions, keeping the one registered class as a
thin delegator. Lower priority than the original because responsibility is already
focused (one AST node type) and it is independently testable.

**Fixed** on branch **`refactor/w1-operation-call-validator-decomposition`** (verified:
`pnpm exec tsgo --noEmit` clean for the language package, `pnpm run check` clean — only
the 4 pre-existing `useOptionalChain` warnings remain in the untouched
`eligian-scope-provider.ts` — full language suite green at 2005 passed/23 skipped,
`test:coverage:ci` exit 0 with the new `validators/operation-call/` dir at ~84% lines /
96% funcs, full `pnpm run build` clean). The 1038-line monolith was split by check
family into four collaborating sub-validators under a new
[validators/operation-call/](packages/language/src/validators/operation-call/) directory,
each extending `BaseValidator` and independently testable:
- **`operation-existence-validator.ts`** — `checkOperationExists` + the unified-syntax
  `checkTimelineOperationCall` (with its private `isDirectTimelineCall`/`isDescendantOf`).
- **`parameter-validator.ts`** — `checkParameterCount`/`checkParameterTypes`/`checkDependencies`
  + private `reportActionParameterCountError` (D28).
- **`css-parameter-validator.ts`** — `checkClassNameParameter`/`checkSelectorParameter` (Feature 013).
- **`label-parameter-validator.ts`** — `checkControllerCall`/`checkLabelIDParameter` + the lazy
  labels-import registration state (`initializedLabelDocuments`/`ensureLabelsImportsRegistered`)
  and the `reportLabelIDError` D29 helper.

The shared `findImportedActionByNameOrAlias` action-resolution helper (used by both the
existence and parameter families) was extracted to a free function in
[validators/operation-call/action-resolution.ts](packages/language/src/validators/operation-call/action-resolution.ts).
`operation-call-validator.ts` is now a **72-line thin delegator**: it keeps the single
registered DI surface (`services.validation.EligianValidator.operationCall`), constructs the
four collaborators, and forwards each registered method one line, so the `OperationCall`
check map in `registerValidationChecks` is unchanged. All method bodies moved verbatim —
pure behavior-preserving refactor.

### W2. `ast-transformer.ts` is the largest file in the repo (~2535 lines)
**Location:** [ast-transformer.ts](packages/language/src/compiler/ast-transformer.ts)
Never flagged by the god-class theme (which only named `EligianValidator` and
`extension/main.ts`), but at ~2535 lines / ~22 top-level functions it is the
single biggest source file. **Suggested task:** extract per-construct transformers
(timeline / action / operation / control-flow / asset) into a `transformers/`
directory behind the existing public entry points, mirroring the validator
decomposition. Higher risk than W1 — it sits on the compile path and changing it
can alter JSON output, so it needs strong snapshot coverage first.

### W3. Other oversized modules worth a sizing pass (lower priority)
Recorded for completeness; decompose only if they keep growing:
- [pipeline.ts](packages/language/src/compiler/pipeline.ts) — ~880 lines (compiler orchestration)
- [LocaleEditorProvider.ts](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts) — ~749 lines
- [compiler/operations/validator.ts](packages/language/src/compiler/operations/validator.ts) — ~695 lines
- [eligian-hover-provider.ts](packages/language/src/eligian-hover-provider.ts) — ~627 lines
- [eligian-completion-provider.ts](packages/language/src/eligian-completion-provider.ts) — ~625 lines
- [program-validator.ts](packages/language/src/validators/program-validator.ts) — ~515 lines (also a decomposition product)

---

## Recommended Safe Auto-Fixes

The following subset is judged mechanical and behavior-preserving (pure deletions of dead code, comment dedup, named-constant substitution, type-guard composition, slash-direction/`Math.max` corrections with no control-flow change, and stateful-`/g` regex relocation). All refactors that introduce shared abstractions, change public APIs, or alter control flow are intentionally excluded and left for manual review.

(See the structured `safeFixes` payload for the precise, applier-ready instructions.)
