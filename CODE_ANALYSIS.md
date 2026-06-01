# Eligian Code Analysis

## Executive Summary

This report synthesizes a verified, cross-module static analysis of the Eligian DSL monorepo (language core, compiler, CSS/HTML/labels tooling, Typir type system, completion, asset loading, CLI, VS Code extension, locale editor, and shared utilities). After deduplicating findings that share a common root cause across modules, the analysis identifies **96 distinct issues**: **45 bugs**, **30 code-duplication clusters**, and **21 anti-patterns**. The dominant theme — and the priority of this report — is **systemic code duplication**: the same logic (file-watcher classes, Levenshtein distance, import-path resolution, control-flow-pairing validators, `_tag` type guards, `error.hint` formatting, empty-CSS-metadata construction, and AST root traversal) is copy-pasted across 3-9 sites each, frequently with silent behavioral drift that produces real bugs (e.g. the CSS-vs-HTML/Labels watcher `updateTrackedFiles` divergence, and the `||`-instead-of-`Math.max` path bug). The most serious correctness defects are concentrated in the locale editor webview (mismatched modal element IDs, ephemeral deletions, in-place "immutable" mutations), the Effect error-handling boundaries (dead `try/catch` around `yield*`, `instanceof` against `FiberFailure` wrappers), and the Typir inference rules (returning un-finished configuration chains instead of resolved `Type`s).

## Summary Table — Counts by Category × Severity

| Category | High | Medium | Low | Total |
|---|---|---|---|---|
| Bug | 18 | 22 | 5 | 45 |
| Duplication | 16 | 13 | 1 | 30 |
| Anti-pattern | 5 | 12 | 4 | 21 |
| **Total** | **39** | **47** | **10** | **96** |

---

## Status — Fixes Applied

The following findings were fixed and committed in **`6b1c52a`** (verified: full test suite green, build clean). They are marked **✅ FIXED** inline below. Everything else remains open.

**Fixed (numbered):** B1, B6, B8, B15, B17, B23, B27, B28, B54, B56, B58, B62, D33.

The following findings — the **Typir inference correctness cluster** — were fixed and committed in **`220b552`** (verified: typecheck clean, biome clean, full language suite green at 1989 passed/23 skipped, coverage CI passing). They are marked **✅ FIXED** inline below.

**Fixed (numbered):** B10, B11, B12, B29.

Notes on this cluster: typing the `CustomKind` factories concretely (B12) surfaced a second defect beyond the report — the event/import/languages inference rules also passed properties at the top level instead of under `{ properties: {...} }`, masked by the `any` typing; both were corrected. A side fix was forced by B12: `TimelineType.events` was `never[]`, which under concrete typing distributes to `never` and breaks `create()`, so it was changed to `string[]` (always an empty placeholder resolved by Typir later). A new regression test (`type-system-typir/inference/__tests__/inference-resolves-types.spec.ts`) asserts `Inference.inferType()` returns a resolved `Type` for import/languages/timed-event nodes — coverage the cluster previously lacked (the hover provider replicates the logic instead of using Typir). Also fixed a pre-existing `TS6307` in `packages/language/tsconfig.json` whose `include` override dropped `src/schemas/*.json`.

**Also applied (cleanups not tracked as a numbered finding):** removed dead `checkSingleLanguagesBlock` method (eligian-validator.ts); removed empty `else` block (css-code-actions.ts); removed duplicate comments (pipeline.ts, asset-type-validator.ts); used the imported `path` module instead of inline `require` and marked `updateTrackedFiles` private across the three watchers; exported/reused `DEFAULT_INLINE_THRESHOLD`; deleted committed `error-reporter.ts.orig` and added `*.orig` to `.gitignore`.

> ⚠️ One auto-proposed fix (compose `isIOError` from leaf guards, type-guards.ts) was **reverted** — it broke 20 tests with a `ReferenceError`; the code at HEAD was already correct.

The high-severity report-only items deliberately **not** auto-applied (require real refactors / control-flow changes): **B2** (`Effect.runSync` crash path), **B3** (module-level `currentConstantMap` state leak), and all duplication-cluster refactors (D1, etc.).

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
**Severity:** High
**Locations:** [ast-transformer.ts:2311](packages/language/src/compiler/ast-transformer.ts#L2311), [ast-transformer.ts:2335](packages/language/src/compiler/ast-transformer.ts#L2335)
The synchronous `transformEventAction` calls `Effect.runSync(transformOperationStatement(...))` from inside the `Effect.gen` body of `transformAST`. A failing inner Effect throws a synchronous exception that escapes the typed error channel as an unhandled fiber crash instead of a structured `TransformError`.
**Fix:** Convert `transformEventAction` to return `Effect.Effect<IEventActionConfiguration, TransformError>` and use `yield*` composition; update the call site in `transformAST`.

#### B3. Module-level mutable `currentConstantMap` leaks state between concurrent compilations
**Severity:** High
**Locations:** [ast-transformer.ts:116](packages/language/src/compiler/ast-transformer.ts#L116), [ast-transformer.ts:282](packages/language/src/compiler/ast-transformer.ts#L282)
A module-level `let currentConstantMap` is reassigned at the start of every `transformAST` call. In a language-server context, two overlapping compilations clobber each other's constant maps, producing incorrect constant inlining. The code comment acknowledges the hazard.
**Fix:** Pass `constantMap` explicitly through `transformAST` and all consumers; remove the module-level variable.

#### B4. Two validators use ad-hoc URI resolution instead of `resolveLibraryPath`
**Severity:** High
**Locations:** [eligian-validator.ts:2573](packages/language/src/eligian-validator.ts#L2573), [eligian-validator.ts:2579](packages/language/src/eligian-validator.ts#L2579), [eligian-validator.ts:2707](packages/language/src/eligian-validator.ts#L2707), [eligian-validator.ts:2713](packages/language/src/eligian-validator.ts#L2713)
`checkImportedActionsExist` and `checkImportedActionsPublic` resolve the library URI via `substring`/`lastIndexOf('/')` + string concatenation rather than the project-wide `resolveLibraryPath()` (already imported, and used correctly by `checkImportFileExists` at line 2538). The ad-hoc approach skips normalization and is inconsistent with workspace-loaded documents on Windows/encoded paths. (Also surfaced as anti-pattern in `dup-validators`.)
**Fix:** Replace both blocks with `const resolvedUri = resolveLibraryPath(documentUri, originalPath);`.

#### B5. `ensureLabelsImportsRegistered` is a no-op stub — label ID validation silently passes
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
**Severity:** High
**Locations:** [variable-metadata.ts:110](packages/language/src/completion/variable-metadata.ts#L110), [variable-metadata.ts:118](packages/language/src/completion/variable-metadata.ts#L118), [variables.ts:50](packages/language/src/completion/variables.ts#L50)
The `'action'` case falls through to `return true`, so `@@whenEvaluation` (marked `availableIn: 'action'`) is always offered. `CursorContext.isInsideAction` exists but is never passed in.
**Fix:** Add `isInsideAction: boolean` param, change the `'action'` branch to `return isInsideAction;`, pass `cursorContext.isInsideAction` at the call site.

#### B14. `eligian.openLabelEditor` command ignores its argument
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
**Severity:** High
**Locations:** [media/locale-editor.ts:1495-1507](packages/extension/media/locale-editor.ts#L1495)
After `delete-confirmed`, the webview mutates `localeState.keyTree` but never sends `delete-key`, so the extension's `documentConfigs` retains the key and the next reload/undo restores it — deletions are silently ephemeral.
**Fix:** Send `sendLocaleMessage({ type: 'delete-key', key })` in `performKeyDelete`.

#### B19. Locale-editor modal element IDs do not match the IDs looked up in JS
**Severity:** High
**Locations:** [locale-editor.html:527-560](packages/extension/src/extension/locale-editor/templates/locale-editor.html#L527), [media/locale-editor.ts:1562-1573](packages/extension/media/locale-editor.ts#L1562), [media/locale-editor.ts:1626-1636](packages/extension/media/locale-editor.ts#L1626), [media/locale-editor.ts:1700-1727](packages/extension/media/locale-editor.ts#L1700)
HTML defines `modal-new-key`/`key-modal-*` and `modal-new-locale`/`locale-modal-*`; JS looks for `add-key-*` and `add-locale-*`. Null-guards swallow the mismatch, so both add-key and add-locale modals open but their inputs and buttons are completely non-functional.
**Fix:** Rename the HTML IDs to match the JS (`add-key-parent`, `add-key-segment`, `add-key-cancel`, `add-key-confirm`, `add-key-error`, and the `add-locale-*` equivalents).

#### B20. Eventbus listeners accumulate on every engine re-initialization
**Severity:** High
**Locations:** [media/preview.ts:84](packages/extension/media/preview.ts#L84), [media/preview.ts:484-517](packages/extension/media/preview.ts#L484)
`setupTimelineEventListeners()` registers five named listeners plus a debug viewer on every `initializeEngine()`, but previous listeners are never removed, so each re-init multiplies event firings (doubled `playbackStarted/Paused/Stopped` and `updateControlStates`).
**Fix:** Store the `TEventbusRemover` functions and invoke them before re-registering.
**Research notes:** Verified against Eligius `eventbus` — `on()`/`registerEventlistener()` return removers; the eventbus is a module-scope singleton never cleared between inits.

#### B21. `play/pause/stop/restart` messages do not actually control the engine
**Severity:** High
**Locations:** [media/preview.ts:374-390](packages/extension/media/preview.ts#L374)
These cases only echo `playbackStarted/Paused/Stopped` back to the extension without broadcasting any eventbus request, so external playback commands have no effect while the extension receives a false confirmation.
**Fix:** Broadcast `timeline-play-request` (etc.) in each case and drop the spurious echo (the existing `eventbus.on('timeline-play')` listener already reports real state).

#### B22. `validateGroupId` duplicate check always passes (identity exclusion of self)
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
**Severity:** Medium
**Locations:** [eligian-validator.ts:1421](packages/language/src/eligian-validator.ts#L1421), [eligian-validator.ts:1440](packages/language/src/eligian-validator.ts#L1440), [eligian-validator.ts:1452](packages/language/src/eligian-validator.ts#L1452)
Only the linear call chain is tracked; nodes outside the current chain are re-explored from scratch, giving O(M^N) worst case.
**Fix:** Add a `visited: Set<string>` initialized once; skip already-visited actions; add to `visited` after iterating.

#### B25. Synchronous `fs.existsSync`/`fs.readFileSync` in an LSP validator blocks the event loop
**Severity:** Medium
**Locations:** [eligian-validator.ts:1914](packages/language/src/eligian-validator.ts#L1914), [eligian-validator.ts:1936](packages/language/src/eligian-validator.ts#L1936), [eligian-validator.ts:1938](packages/language/src/eligian-validator.ts#L1938)
`checkLocalesImports` does synchronous disk I/O inside the validation cycle, freezing the UI proportional to file size/disk latency.
**Fix:** Make the validator `async` and use `fs.promises`, or load via `registerBeforeDocument`.
**Research notes:** Langium `ValidationCheck` is `(node, accept, cancelToken) => MaybePromise<void>` — async validators are natively supported.

#### B26. `EligianHoverProvider` stores a mock `services` typed `any`; CommentProvider silently degrades
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
**Severity:** Medium
**Locations:** [import-validation.ts:34](packages/language/src/type-system-typir/validation/import-validation.ts#L34), [import-validation.ts:54](packages/language/src/type-system-typir/validation/import-validation.ts#L54), [import-validation.ts:57](packages/language/src/type-system-typir/validation/import-validation.ts#L57)
The `validatedDocuments` WeakSet skips any second call for the same `Program` instance and misunderstands Typir's once-per-node-per-cycle contract.
**Fix:** Remove the WeakSet guard; rely on Typir's built-in guarantee. Investigate the root cause if duplicate calls are actually observed.

#### B31. `isValidCSSSelector` regex rejects valid compound/descendant selectors
**Severity:** Medium
**Locations:** [timeline-validation.ts:33](packages/language/src/type-system-typir/validation/timeline-validation.ts#L33), [timeline-validation.ts:38](packages/language/src/type-system-typir/validation/timeline-validation.ts#L38)
`/^[#.\w\-:[\]]+$/` forbids spaces, commas, and combinators, producing false positives for `#app .container` and selector lists.
**Fix:** Relax the regex to allow whitespace/commas/combinators, or use a real selector parser; at minimum document the limitation in the error message.

#### B32. `detectAfterEventKeyword` suppresses completions when re-editing an existing event name
**Severity:** Medium
**Locations:** [context.ts:311](packages/language/src/completion/context.ts#L311)
`if (eventAction.eventName) { return false; }` blocks completions even when the cursor is right after `on event` to replace an existing name; the regex at line 321 already gates this case correctly.
**Fix:** Remove the early-return guard and rely on the existing regex.

#### B33. Controller parameter index miscounted with embedded/escaped quotes
**Severity:** Medium
**Locations:** [context.ts:386](packages/language/src/completion/context.ts#L386), [context.ts:390](packages/language/src/completion/context.ts#L390)
`textInCall.match(/["']/g)` counts raw quotes, so `addController("O'Brien")` or escaped quotes throw off `Math.floor(count/2)`.
**Fix:** Match complete quoted strings (`/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g`) or count top-level commas.

#### B34. `findIdentifierAtOffset` is a non-functional stub with a midpoint heuristic
**Severity:** Medium
**Locations:** [hover-detection.ts:177](packages/language/src/css/hover-detection.ts#L177), [hover-detection.ts:189](packages/language/src/css/hover-detection.ts#L189), [hover-detection.ts:191](packages/language/src/css/hover-detection.ts#L191)
Uses `selector.length / 2` as a class/ID boundary (meaningless) and is never wired into the live hover path.
**Fix:** Implement offset detection via postcss-selector-parser `sourceIndex` and wire it into `detectSelectorHover` (pairs with B9).
**Research notes:** postcss-selector-parser nodes carry `sourceIndex` (zero-based offset) and `source.start/end`.

#### B35. `resolveCSSPath` does not normalize `../` segments
**Severity:** Medium
**Locations:** [css-code-actions.ts:170](packages/language/src/css/css-code-actions.ts#L170), [css-code-actions.ts:179](packages/language/src/css/css-code-actions.ts#L179), [css-code-actions.ts:185](packages/language/src/css/css-code-actions.ts#L185)
Plain `docDir + cleanPath` concatenation yields `file:///.../../shared/styles.css` for parent-relative imports — currently masked by an early return on absolute URIs, but fragile.
**Fix:** Document/assert the absolute-URI invariant, or normalize with `new URL(cleanPath, docDir).href` / `path.resolve`.

#### B36. CST line/column stored 0-indexed into 1-indexed `SourceLocation`
**Severity:** Medium
**Locations:** [compiler-integration.ts:279](packages/language/src/asset-loading/compiler-integration.ts#L279), [compiler-integration.ts:280](packages/language/src/asset-loading/compiler-integration.ts#L280), [base.ts:18](packages/language/src/errors/base.ts#L18)
Import-statement `sourceLocation` omits the `+1` that every other call site applies; currently no observable effect because consumers re-resolve position, but the field is wrong.
**Fix:** Add `+ 1` to line/column (guarding null), matching `ast-transformer.ts:2474-2475`.

#### B37. Provider (media) file read as UTF-8 then discarded
**Severity:** Medium
**Locations:** [compiler-integration.ts:165](packages/language/src/asset-loading/compiler-integration.ts#L165), [compiler-integration.ts:166](packages/language/src/asset-loading/compiler-integration.ts#L166), [compiler-integration.ts:176](packages/language/src/asset-loading/compiler-integration.ts#L176), [compiler-integration.ts:178](packages/language/src/asset-loading/compiler-integration.ts#L178)
`loadFile` reads entire binary media files into memory as UTF-8 strings, then stores only the path — wasteful for large videos.
**Fix:** Skip `loadFile()` for provider imports; read content only in branches that use it.

#### B38. `IAssetValidationService` interface and implementation have mismatched `assetType`
**Severity:** Medium
**Locations:** [interfaces.ts:118](packages/language/src/asset-loading/interfaces.ts#L118), [interfaces.ts:119](packages/language/src/asset-loading/interfaces.ts#L119), [asset-validation-service.ts:39](packages/language/src/asset-loading/asset-validation-service.ts#L39), [asset-validation-service.ts:40](packages/language/src/asset-loading/asset-validation-service.ts#L40)
Interface omits `'json'` but the implementation and a real caller use it; callers typed to the interface cannot pass `'json'`.
**Fix:** Add `'json'` to the interface union and JSDoc.

#### B39. Locales JSON schema validation bypassed in `loadProgramAssets`
**Severity:** Medium
**Locations:** [compiler-integration.ts:181](packages/language/src/asset-loading/compiler-integration.ts#L181), [compiler-integration.ts:183](packages/language/src/asset-loading/compiler-integration.ts#L183), [locale-import-validator.ts:121](packages/language/src/validators/locale-import-validator.ts#L121)
Only `JSON.parse` is used; the existing AJV `validateLocalesJSON` (locale-code format, required fields, minProperties) is skipped, so structurally invalid-but-parseable files pass.
**Fix:** Call `validateLocalesJSON(content, importInfo.path)` and map its error to an `AssetError`.

#### B40. `parseInt` on `--inline-threshold` with no NaN guard silently disables inlining
**Severity:** Medium
**Locations:** [main.ts:260](packages/cli/src/main.ts#L260), [asset-collector.ts:321](packages/cli/src/bundler/asset-collector.ts#L321)
NaN flows to `size <= threshold`, which is always false, disabling all inlining without warning.
**Fix:** Add `Number.isNaN` check after `parseInt` and exit with an error (or use Commander `.argParser`).

#### B41. Cleanup errors silently swallowed in temp/entry-point removal
**Severity:** Medium
**Locations:** [bundler/index.ts:180-183](packages/cli/src/bundler/index.ts#L180), [runtime-bundler.ts:262-266](packages/cli/src/bundler/runtime-bundler.ts#L262)
`Effect.catchAll(() => Effect.succeed(undefined))` hides all cleanup I/O errors; temp files accumulate invisibly.
**Fix:** Log a warning: `Effect.catchAll(e => Effect.sync(() => console.warn('Cleanup failed:', e)))`.

#### B42. `extractEffectError` uses `JSON.stringify` round-trip on FiberFailure
**Severity:** Medium
**Locations:** [compile-file.ts:125-138](packages/cli/src/compile-file.ts#L125), [compile-file.ts:195](packages/cli/src/compile-file.ts#L195)
Relies on Effect's undocumented FiberFailure serialization; `JSON.stringify` of an `Error` yields `{}` (non-enumerable props), so defect failures fall through and an opaque FiberFailure is unsoundly cast to `CompilerError`.
**Fix:** Use `Effect.runPromiseExit` + `Cause.failureOption`/`Cause.defectOption`.
**Research notes:** Effect docs endorse `Cause.failures`/`matchCause`/`runPromiseExit`; the JSON approach is not documented.

#### B43. `createReadError` called with a pre-stringified message instead of the raw cause
**Severity:** Medium
**Locations:** [file-loader.ts:58](packages/shared-utils/src/file-loader.ts#L58), [file-loader.ts:59](packages/shared-utils/src/file-loader.ts#L59), [errors.ts:96](packages/shared-utils/src/errors.ts#L96)
The OS error detail is stored in `cause` as a string; `message` stays generic, defeating the `cause` field's purpose (machine-inspectable original Error).
**Fix:** Pass the raw error object as `cause`, or add a separate message-override parameter.

#### B44. `resolvePaths` Windows branch does not handle `../` (relies on downstream normalize)
**Severity:** Medium
**Locations:** [path-resolver.ts:44](packages/shared-utils/src/path-resolver.ts#L44), [path-resolver.ts:52](packages/shared-utils/src/path-resolver.ts#L52), [path-resolver.ts:53](packages/shared-utils/src/path-resolver.ts#L53), [path-resolver.ts:54](packages/shared-utils/src/path-resolver.ts#L54)
Only strips leading `./` and concatenates; correctness depends on an undocumented downstream `normalizePath`.
**Fix:** Use `path.win32.resolve(baseDir, relativePath)` (then normalize slashes) or unify both branches on `path.resolve`.

#### B45. `formatLocation` checks `filePath` but IOError uses `path` — IO errors silently lose location
**Severity:** High (verified) — *placed here adjacent to B43/B44 IO cluster*
**Locations:** [formatters.ts:79](packages/language/src/errors/formatters.ts#L79), [errors.ts:14](packages/shared-utils/src/errors.ts#L14)
The IO fallback branch checks `'filePath' in error`, but the IOError subtypes define `path`, not `filePath`, so `formatLocation` always returns `null` for IO errors and the file path is dropped from output.
**Fix:** Change to `'path' in error && error.path` and return `error.path`.

#### B46. `error-consistency.spec.ts` constructs IOError literals with wrong field names
**Severity:** Medium
**Locations:** [error-consistency.spec.ts:171](packages/language/src/errors/__tests__/error-consistency.spec.ts#L171), [error-consistency.spec.ts:184](packages/language/src/errors/__tests__/error-consistency.spec.ts#L184), [error-consistency.spec.ts:362](packages/language/src/errors/__tests__/error-consistency.spec.ts#L362)
Test literals use `filePath`/`absolutePath` instead of `path`, which both diverges from the real type and masks B45.
**Fix:** Build IOErrors via `createFileNotFoundError`/`createPermissionError` and update expectations.

#### B47. `block-label-detector` uses `langium/test` `parseDocument` in production
**Severity:** Medium
**Locations:** [block-label-detector.ts:19](packages/extension/src/extension/decorations/block-label-detector.ts#L19), [block-label-detector.ts:50](packages/extension/src/extension/decorations/block-label-detector.ts#L50)
A test-only utility runs a full from-scratch parse on every debounced keystroke in the extension host, duplicating the language server's work with no caching.
**Fix:** Have the language server emit bracket positions via a custom LSP request/notification instead of parsing in the extension host.
**Research notes:** Langium docs use `parseDocument`/`parseHelper` exclusively in test contexts; it bundles fine (no runtime crash), so this is a correctness/perf concern, not a load failure.

#### B48. `PreviewManager` singleton never disposed on deactivation
**Severity:** Medium
**Locations:** [main.ts:205](packages/extension/src/extension/main.ts#L205), [PreviewManager.ts:113](packages/extension/src/extension/preview/PreviewManager.ts#L113)
`dispose()` exists but is never called from `deactivate()` or registered in `context.subscriptions`, leaking panels and the active-editor listener.
**Fix:** Push a disposal wrapper into `context.subscriptions` or call `dispose()` in `deactivate()`.

#### B49. Output channel leaked on every failing compile command
**Severity:** Medium
**Locations:** [main.ts:309](packages/extension/src/extension/main.ts#L309)
`createOutputChannel('Eligian Compiler')` runs on every failure, never disposed — duplicate output entries and leaked resources.
**Fix:** Create the channel once (module-level/lazy) and dispose via `context.subscriptions`.

#### B50. `updateConfig` message shows container but never re-initializes the engine
**Severity:** Medium
**Locations:** [media/preview.ts:325-334](packages/extension/media/preview.ts#L325)
The case only toggles container visibility (and a misleading comment hides the error container), never calling `initializeEngine`.
**Fix:** Clarify the protocol; if re-init is intended, call `initializeEngine(message.payload.config)`; fix the comment.

#### B51. Redundant `URI.parse()` calls in re-validation loops
**Severity:** Medium *(also part of duplication cluster D8)*
**Locations:** [language/main.ts:55-59](packages/extension/src/language/main.ts#L55), [language/main.ts:83-87](packages/extension/src/language/main.ts#L83), [language/main.ts:130-134](packages/extension/src/language/main.ts#L130), [language/main.ts:145-149](packages/extension/src/language/main.ts#L145), [language/main.ts:172-176](packages/extension/src/language/main.ts#L172), [language/main.ts:193-197](packages/extension/src/language/main.ts#L193)
`URI.parse(docUri)` is called twice per iteration in six loops.
**Fix:** Parse once per iteration (folds into the D8 `triggerRevalidation` helper).

#### B52. `import-processor` silently drops all but the last one-to-one import
**Severity:** Medium
**Locations:** [import-processor.ts:152-154](packages/extension/src/language/import-processor.ts#L152), [import-processor.ts:163-165](packages/extension/src/language/import-processor.ts#L163)
For `'one'`-cardinality types, multiple imports are parsed but only the last is registered/watched — silent data loss.
**Fix:** Validate exactly one import (warn on multiple) or register the first occurrence only.

#### B53. `import-processor` path stripping mishandles `'.'`
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
**Severity:** Medium *(listed low-block by module; clamping bug)*
**Locations:** [context-detection.ts:229](packages/language/src/html/context-detection.ts#L229), [context-detection.ts:234](packages/language/src/html/context-detection.ts#L234)
Unlike the double-quote branch, the single-quote branch can return text past the closing quote.
**Fix:** `Math.min(singleQuoteIndex + 1 + relativeOffset, closeQuoteIndex)`.

#### B60. URI-to-path conversion fragile/cross-platform broken (`.replace('file:///','')`)
**Severity:** Medium *(part of D10 cluster)*
**Locations:** [language-block-code-actions.ts:66](packages/language/src/labels/language-block-code-actions.ts#L66), [language-block-code-actions.ts:67](packages/language/src/labels/language-block-code-actions.ts#L67), [eligian-code-action-provider.ts:74](packages/language/src/eligian-code-action-provider.ts#L74), [eligian-code-action-provider.ts:75](packages/language/src/eligian-code-action-provider.ts#L75), [eligian-code-action-provider.ts:300](packages/language/src/eligian-code-action-provider.ts#L300), [eligian-code-action-provider.ts:301](packages/language/src/eligian-code-action-provider.ts#L301)
Stripping `file:///` drops the leading slash on POSIX and ignores authority components.
**Fix:** Use `URI.parse(uri).fsPath` via a shared `uriToFsPath` helper (see D10).

#### B61. `extractLocalesFilePaths` double-guards `isDefaultImport` (unreachable fallback)
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
**Severity:** Medium *(state/render bug)*
**Locations:** [media/locale-editor.ts:1172-1175](packages/extension/media/locale-editor.ts#L1172)
Auto-expand of `__root__` recurses after rendering, doubling DOM work on initial load.
**Fix:** Move the auto-expand logic before the render (or into initialization).

#### B64–B66. Webview "immutable" state functions mutate in place
**Severity:** Medium
**Locations:** `updateTranslationValue` [media/locale-editor-core.ts:595-609](packages/extension/media/locale-editor-core.ts#L595); `addKeyToTree` [media/locale-editor-core.ts:639-650](packages/extension/media/locale-editor-core.ts#L639)
Both find a node and mutate it in place while returning a shallow-spread state that shares the same `keyTree` array — reference-equality consumers miss the change.
**Fix:** Rebuild the `keyTree` immutably (recursive map) and return new state.

---

## Code Duplication (Priority)

Clusters are merged across the per-module and repo-wide passes (the analysis found the same clusters independently from multiple angles; their locations are unioned here).

### D1. Three near-identical file-watcher classes — CSS / HTML / Labels (~690-800 lines)
**Severity:** High
**Sites:** [css-watcher.ts:35](packages/extension/src/extension/css-watcher.ts#L35), [html-watcher.ts:32](packages/extension/src/extension/html-watcher.ts#L32), [labels-watcher.ts:32](packages/extension/src/extension/labels-watcher.ts#L32)
`CSSWatcherManager`, `HTMLWatcherManager`, `LabelsWatcherManager` share identical fields, constructor, `clearDocumentMappings`, `startWatching` skeleton, `updateTrackedFiles`, `handleFileChange`, `debounceChange`, `handleFileDelete`, and a byte-for-byte identical `dispose()`. They differ only in glob pattern, notification constant, the imports-Map field name, and single-vs-array URI registration. This cluster directly caused the behavioral divergence bug B23 (`updateTrackedFiles` clear vs accumulate) and harbors the duplicated `resolveAbsolute*Uri` (D2), `dispose()` (D2b), and the leftover `console.error` traces (B54).
**Scale:** ~3 classes × ~230 lines; ~500 lines removable.
**Proposed abstraction:** A generic `BaseWatcherManager`/`FileImportWatcherManager` (abstract class or options-configured factory in `extension/base-watcher-manager.ts`) parameterized by `{ globPattern, notificationFactory, single|array registration }`. Each concrete watcher becomes a ~20-30 line wrapper. Fix B23 as part of the consolidation.

### D2. `resolveAbsolute{CSS,HTML,Labels}Uri` — byte-identical private methods
**Severity:** Medium
**Sites:** [css-watcher.ts:137](packages/extension/src/extension/css-watcher.ts#L137), [html-watcher.ts:128](packages/extension/src/extension/html-watcher.ts#L128), [labels-watcher.ts:134](packages/extension/src/extension/labels-watcher.ts#L134)
Identical `startsWith('file://')` → parse → dirname → strip `./` → join → `Uri.file().toString()` logic (~18 lines each).
**Abstraction:** Standalone `resolveAbsoluteFileUri(documentUri, fileUri)` in `extension/uri-utils.ts` (or `watcher-utils.ts`). Useful independently of D1.

#### D2b. `dispose()` byte-for-byte identical across the three watchers
**Severity:** Medium
**Sites:** [css-watcher.ts:338](packages/extension/src/extension/css-watcher.ts#L338), [html-watcher.ts:289](packages/extension/src/extension/html-watcher.ts#L289), [labels-watcher.ts:308](packages/extension/src/extension/labels-watcher.ts#L308)
~17 lines × 3. Subsumed by D1; otherwise extract `disposeWatcherResources(state)`.

#### D2c. `FileWatcher` re-implements the 300ms debounce + `Map<string, Timeout>` pattern
**Severity:** Low
**Sites:** [FileWatcher.ts:33](packages/extension/src/extension/preview/FileWatcher.ts#L33), [FileWatcher.ts:92](packages/extension/src/extension/preview/FileWatcher.ts#L92), and the three watchers ([css-watcher.ts:299](packages/extension/src/extension/css-watcher.ts#L299), [html-watcher.ts:250](packages/extension/src/extension/html-watcher.ts#L250), [labels-watcher.ts:259](packages/extension/src/extension/labels-watcher.ts#L259))
**Abstraction:** `debounce<K>(timers, key, delay, fn)` utility in `extension/debounce-util.ts`.

### D3. `levenshteinDistance` implemented three times
**Severity:** High
**Sites:** [css/levenshtein.ts:20](packages/language/src/css/levenshtein.ts#L20) (canonical, has `maxDistance` early-exit), [name-resolver.ts:168](packages/language/src/compiler/name-resolver.ts#L168), [operations/index.ts:296](packages/language/src/compiler/operations/index.ts#L296)
The two compiler copies are character-identical and lack the optimization; each is paired with its own filter-sort-slice suggestion helper.
**Abstraction:** Import the canonical `levenshteinDistance` (or promote to a shared `compiler/utils/string-similarity.ts`); delete the private copies; have `suggestSimilarActions`/`suggestSimilarOperations` delegate to a shared `findSimilar`.

### D4. Import-path strip-and-resolve pattern duplicated across ~9 sites in 5 files
**Severity:** High *(the single largest cross-module duplication; merges the validator-local, css, pipeline, and extension variants)*
**Sites:** [eligian-validator.ts:1730](packages/language/src/eligian-validator.ts#L1730), [eligian-validator.ts:1796](packages/language/src/eligian-validator.ts#L1796), [eligian-validator.ts:1909](packages/language/src/eligian-validator.ts#L1909), [pipeline.ts:303](packages/language/src/compiler/pipeline.ts#L303), [css-code-actions.ts:182](packages/language/src/css/css-code-actions.ts#L182), [import-processor.ts:124](packages/extension/src/language/import-processor.ts#L124), [css-watcher.ts:149](packages/extension/src/extension/css-watcher.ts#L149), [labels-watcher.ts:146](packages/extension/src/extension/labels-watcher.ts#L146), [html-watcher.ts:140](packages/extension/src/extension/html-watcher.ts#L140)
The three-step idiom — strip quotes (`/^["']|["']$/`), strip leading `./`, `path.join(docDir, cleanPath)` (→ `URI.file().toString()`) — is repeated verbatim. The `pipeline.ts` variant additionally contains the broken `||` dirname bug (B1), and `import-processor.ts` the `'.'` edge-case bug (B53). A single fix point would have prevented both.
**Abstraction:** `resolveImportRelativePath(rawQuotedPath, docDir): string` (and/or `resolveImportPathToUri(documentUri, importPath)`) in `packages/language/src/utils/path-utils.ts`, used at all sites.

### D5. Five near-identical `checkControlFlowPairing*` methods
**Severity:** High *(confirmed independently three times; same five sites)*
**Sites:** [eligian-validator.ts:893](packages/language/src/eligian-validator.ts#L893), [eligian-validator.ts:915](packages/language/src/eligian-validator.ts#L915), [eligian-validator.ts:940](packages/language/src/eligian-validator.ts#L940), [eligian-validator.ts:965](packages/language/src/eligian-validator.ts#L965), [eligian-validator.ts:990](packages/language/src/eligian-validator.ts#L990)
Identical filter→map→`validateControlFlowPairing`→iterate→`accept` body (~12 lines × 5); differ only in the ops array property and the `accept` `property` key.
**Abstraction:** Private `validateControlFlowPairingForOps(ops, node, property, accept)`; each public method becomes a one-liner.

### D6. AST "find Program root" upward traversal duplicated 4× while `getProgram` exists
**Severity:** High
**Sites:** [eligian-validator.ts:501](packages/language/src/eligian-validator.ts#L501), [eligian-validator.ts:1977](packages/language/src/eligian-validator.ts#L1977), [eligian-validator.ts:2069](packages/language/src/eligian-validator.ts#L2069), [eligian-validator.ts:2340](packages/language/src/eligian-validator.ts#L2340); helper at [eligian-validator.ts:1376](packages/language/src/eligian-validator.ts#L1376)
`let node: any = ...; while (node && node.$type !== 'Program') node = node.$container;` (typed `any`) is copy-pasted; the existing `getProgram` helper is a drop-in replacement. (See also anti-pattern A-getProgram: prefer `AstUtils.getContainerOfType`.)
**Abstraction:** Replace all four with `this.getProgram(node)` then `program?.$document?.uri?.toString()`; ideally rewrite `getProgram`/`getLibrary` to use `AstUtils.getContainerOfType`.

### D7. Three LSP notification files are near-identical structural copies
**Severity:** High
**Sites:** [css-notifications.ts:1](packages/language/src/lsp/css-notifications.ts#L1), [labels-notifications.ts:1](packages/language/src/lsp/labels-notifications.ts#L1), [html-notifications.ts:1](packages/language/src/lsp/html-notifications.ts#L1)
Each defines the same UPDATED + IMPORTS_DISCOVERED notification/param pair, differing only by prefix and minor field shapes (CSS also has an ERROR pair).
**Abstraction:** Generic `AssetUpdatedParams`/`AssetImportsDiscoveredParams` base in `lsp/asset-notifications.ts`; asset-specific files extend/re-export.

### D8. Trigger-revalidation loop duplicated six times in language/main.ts
**Severity:** High
**Sites:** [language/main.ts:53-60](packages/extension/src/language/main.ts#L53), [language/main.ts:81-88](packages/extension/src/language/main.ts#L81), [language/main.ts:128-135](packages/extension/src/language/main.ts#L128), [language/main.ts:144-151](packages/extension/src/language/main.ts#L144), [language/main.ts:170-177](packages/extension/src/language/main.ts#L170), [language/main.ts:192-199](packages/extension/src/language/main.ts#L192)
Identical `for...getDocument(URI.parse)...update([URI.parse], [])` across success/error paths of CSS/labels/HTML handlers.
**Abstraction:** `triggerRevalidation(documentUris: string[])` that parses each URI once — also resolves B51.

### D9. Empty CSS metadata object literal constructed inline 4×
**Severity:** Medium
**Sites:** [language/main.ts:64](packages/extension/src/language/main.ts#L64), [language/main.ts:96](packages/extension/src/language/main.ts#L96), [language/main.ts:224](packages/extension/src/language/main.ts#L224), [pipeline.ts:343](packages/language/src/compiler/pipeline.ts#L343)
The `{ classes/ids: Set, *Locations/*Rules: Map, errors: [...] }` shape (differing only in `errors`).
**Abstraction:** `createEmptyCSSMetadata(errors?: CSSParseError[])` exported from `packages/language/src/css/`.

### D10. URI-to-fsPath decoding duplicated across 3 code-action sites
**Severity:** Medium
**Sites:** [language-block-code-actions.ts:66](packages/language/src/labels/language-block-code-actions.ts#L66), [eligian-code-action-provider.ts:74](packages/language/src/eligian-code-action-provider.ts#L74), [eligian-code-action-provider.ts:300](packages/language/src/eligian-code-action-provider.ts#L300)
`.replace('file:///','')` + `decodeURIComponent` with identical comments (also bug B60).
**Abstraction:** `uriToFsPath(uri): string` (via `URI.parse(uri).fsPath`) in `utils/path-utils.ts`.

### D11. Six near-identical traversal methods in `CSSRegistryService`
**Severity:** High
**Sites:** [css-registry.ts:130](packages/language/src/css/css-registry.ts#L130), [css-registry.ts:160](packages/language/src/css/css-registry.ts#L160), [css-registry.ts:197](packages/language/src/css/css-registry.ts#L197), [css-registry.ts:224](packages/language/src/css/css-registry.ts#L224), [css-registry.ts:257](packages/language/src/css/css-registry.ts#L257), [css-registry.ts:284](packages/language/src/css/css-registry.ts#L284)
`getClassesForDocument`/`getIDsForDocument`/`findClassLocation`/`findIDLocation`/`getClassRule`/`getIDRule` share the imports→loop→metadata→map-lookup structure (~120 lines).
**Abstraction:** Private generic `queryImportedFiles<T>(documentUri, extract)` with Set-accumulating and first-match variants.

### D12. `CLASS_NAME_OPERATIONS` / `SELECTOR_OPERATIONS` duplicated verbatim
**Severity:** High
**Sites:** [context-detection.ts:36](packages/language/src/css/context-detection.ts#L36), [context-detection.ts:41](packages/language/src/css/context-detection.ts#L41), [hover-detection.ts:33](packages/language/src/css/hover-detection.ts#L33), [hover-detection.ts:38](packages/language/src/css/hover-detection.ts#L38)
**Abstraction:** Shared `css/css-operations.ts` exporting both Sets.

### D13. `createCSSClassEdit` / `createCSSIDEdit` near-identical (~50 lines)
**Severity:** Medium
**Sites:** [code-action-helpers.ts:91](packages/language/src/css/code-action-helpers.ts#L91), [code-action-helpers.ts:128](packages/language/src/css/code-action-helpers.ts#L128)
Differ only by `.` vs `#` prefix and a local var name.
**Abstraction:** `createCSSIdentifierEdit(uri, name, content, type: 'class'|'id')`; keep thin wrappers.

### D14. `extractTimeValue` and `parseTimeRange` copy-pasted (inference vs validation)
**Severity:** High
**Sites:** [event-inference.ts:23](packages/language/src/type-system-typir/inference/event-inference.ts#L23), [event-inference.ts:66](packages/language/src/type-system-typir/inference/event-inference.ts#L66), [event-validation.ts:28](packages/language/src/type-system-typir/validation/event-validation.ts#L28), [event-validation.ts:71](packages/language/src/type-system-typir/validation/event-validation.ts#L71)
Character-identical including JSDoc and TODOs.
**Abstraction:** Shared `type-system-typir/utils/time-expression.ts`.

### D15. String→Typir-type mapping switch duplicated 3× in `EligianTypeSystem`
**Severity:** High
**Sites:** [eligian-type-system.ts:209](packages/language/src/type-system-typir/eligian-type-system.ts#L209), [eligian-type-system.ts:277](packages/language/src/type-system-typir/eligian-type-system.ts#L277), [eligian-type-system.ts:379](packages/language/src/type-system-typir/eligian-type-system.ts#L379)
**Abstraction:** Private `resolveTypirPrimitiveType(typeName): Type`; delegate from all three.

### D16. `requestAction + startAction/endAction` triplet hand-coded in 4 places
**Severity:** Medium
**Sites:** [ast-transformer.ts:1262](packages/language/src/compiler/ast-transformer.ts#L1262), [ast-transformer.ts:930](packages/language/src/compiler/ast-transformer.ts#L930), [ast-transformer.ts:1066](packages/language/src/compiler/ast-transformer.ts#L1066), [ast-transformer.ts:1722](packages/language/src/compiler/ast-transformer.ts#L1722)
**Abstraction:** `buildActionCallOperations(actionName, actionOperationData, sourceLocation, isEnd): OperationConfigIR[]`.

### D17. Parse-error extraction duplicated (parseSource vs parseLibraryDocument)
**Severity:** High
**Sites:** [pipeline.ts:389](packages/language/src/compiler/pipeline.ts#L389), [pipeline.ts:741](packages/language/src/compiler/pipeline.ts#L741)
Identical lexer/parser/diagnostics → `ParseError` shape.
**Abstraction:** `extractDocumentErrors(document, fileHint?): Effect<void, ParseError>`.

### D18. `format{Parse,Validation,Type,Transform}Error` share structure
**Severity:** Medium
**Sites:** [error-reporter.ts:34](packages/language/src/compiler/error-reporter.ts#L34), [error-reporter.ts:65](packages/language/src/compiler/error-reporter.ts#L65), [error-reporter.ts:95](packages/language/src/compiler/error-reporter.ts#L95), [error-reporter.ts:125](packages/language/src/compiler/error-reporter.ts#L125)
**Abstraction:** `buildFormattedError(prefix, error, sourceCode, hintFn)`.

### D19. `_tag` type-guard predicate copy-pasted 14× across two packages
**Severity:** High *(merges the language `type-guards.ts` set and the shared-utils set)*
**Sites:** [type-guards.ts:58](packages/language/src/errors/type-guards.ts#L58), [type-guards.ts:77](packages/language/src/errors/type-guards.ts#L77), [type-guards.ts:99](packages/language/src/errors/type-guards.ts#L99), [type-guards.ts:118](packages/language/src/errors/type-guards.ts#L118), [type-guards.ts:140](packages/language/src/errors/type-guards.ts#L140), [type-guards.ts:162](packages/language/src/errors/type-guards.ts#L162), [type-guards.ts:213](packages/language/src/errors/type-guards.ts#L213), [type-guards.ts:235](packages/language/src/errors/type-guards.ts#L235), [type-guards.ts:260](packages/language/src/errors/type-guards.ts#L260), [type-guards.ts:279](packages/language/src/errors/type-guards.ts#L279), [shared-utils/errors.ts:129](packages/shared-utils/src/errors.ts#L129), [shared-utils/errors.ts:144](packages/shared-utils/src/errors.ts#L144), [shared-utils/errors.ts:159](packages/shared-utils/src/errors.ts#L159), [shared-utils/errors.ts:171](packages/shared-utils/src/errors.ts#L171)
**Abstraction:** `hasTag<T extends string>(error, tag): error is { _tag: T }` in `packages/shared-utils/src/tag-guard.ts`; each guard becomes a one-liner. Also fix `isIOError` ([type-guards.ts:329](packages/language/src/errors/type-guards.ts#L329)) to compose leaf guards.

### D20. `error.hint` ternary repeated 13-15× (two inconsistent forms)
**Severity:** Medium
**Sites:** [eligian-validator.ts:687](packages/language/src/eligian-validator.ts#L687), [eligian-validator.ts:795](packages/language/src/eligian-validator.ts#L795), [eligian-validator.ts:832](packages/language/src/eligian-validator.ts#L832), [eligian-validator.ts:877](packages/language/src/eligian-validator.ts#L877), [eligian-validator.ts:902](packages/language/src/eligian-validator.ts#L902), [eligian-validator.ts:927](packages/language/src/eligian-validator.ts#L927), [eligian-validator.ts:952](packages/language/src/eligian-validator.ts#L952), [eligian-validator.ts:977](packages/language/src/eligian-validator.ts#L977), [eligian-validator.ts:1002](packages/language/src/eligian-validator.ts#L1002), [eligian-validator.ts:1534](packages/language/src/eligian-validator.ts#L1534), [eligian-validator.ts:1561](packages/language/src/eligian-validator.ts#L1561), [eligian-validator.ts:1599](packages/language/src/eligian-validator.ts#L1599), [eligian-validator.ts:1625](packages/language/src/eligian-validator.ts#L1625), [eligian-validator.ts:1688](packages/language/src/eligian-validator.ts#L1688)
Guarded vs unguarded forms coexist (B-level inconsistency at 1688).
**Abstraction:** `formatValidationMessage(message, hint?)` in `utils/error-builder.ts`.

### D21. Constructor dual-API branching copy-pasted across 4 compiler error constructors
**Severity:** High
**Sites:** [compiler-errors.ts:203](packages/language/src/errors/compiler-errors.ts#L203), [compiler-errors.ts:236](packages/language/src/errors/compiler-errors.ts#L236), [compiler-errors.ts:269](packages/language/src/errors/compiler-errors.ts#L269), [compiler-errors.ts:305](packages/language/src/errors/compiler-errors.ts#L305)
Each does `typeof firstArg === 'string'` dispatch into two return blocks.
**Abstraction:** Drop the positional overloads (object form is used everywhere), or a `resolveParams<T>` normalizer.

### D22. `Html/Css/MediaImportError` structurally identical shapes/constructors/formatters
**Severity:** Medium
**Sites:** [asset-errors.ts:28](packages/language/src/errors/asset-errors.ts#L28), [asset-errors.ts:54](packages/language/src/errors/asset-errors.ts#L54), [asset-errors.ts:97](packages/language/src/errors/asset-errors.ts#L97), [asset-errors.ts:127](packages/language/src/errors/asset-errors.ts#L127), [asset-errors.ts:154](packages/language/src/errors/asset-errors.ts#L154), [asset-errors.ts:202](packages/language/src/errors/asset-errors.ts#L202), [formatters.ts:105](packages/language/src/errors/formatters.ts#L105)
**Abstraction:** `FileImportErrorBase` + intersection types; generic `makeImportError<T>(tag, params)`; collapse the formatter cases.

### D23. Four structurally identical IO type guards in shared-utils (subset of D19)
**Severity:** Medium — *merged into D19.*

### D24. `validateHtml` and `validateCss` structurally identical
**Severity:** High
**Sites:** [asset-validation-service.ts:100](packages/language/src/asset-loading/asset-validation-service.ts#L100), [asset-validation-service.ts:147](packages/language/src/asset-loading/asset-validation-service.ts#L147)
**Abstraction:** Generic private helper taking the validator, error-type string, and message prefix.

### D25. Extension→type-mapping duplicated: `inferImportAssetType` vs `EXTENSION_MAP`
**Severity:** Medium
**Sites:** [compiler-integration.ts:251-254](packages/language/src/asset-loading/compiler-integration.ts#L251), [asset-type-inference.ts:23](packages/language/src/utils/asset-type-inference.ts#L23)
**Abstraction:** Call `inferAssetType(path)` from `inferImportAssetType`; fall back to `'media'`.

### D26. `convertOperationMetadata` / `convertControllerMetadata` duplicate property extraction
**Severity:** Medium
**Sites:** [generate-metadata.ts:42](packages/language/src/completion/generate-metadata.ts#L42), [generate-metadata.ts:95](packages/language/src/completion/generate-metadata.ts#L95)
**Abstraction:** `extractParameters(properties)` (+ `extractOutputs` for operations).

### D27. Duplicate-detection Map loops: actions / library actions / constants
**Severity:** Medium
**Sites:** [eligian-validator.ts:235](packages/language/src/eligian-validator.ts#L235), [eligian-validator.ts:266](packages/language/src/eligian-validator.ts#L266), [eligian-validator.ts:2497](packages/language/src/eligian-validator.ts#L2497)
**Abstraction:** Generic `detectDuplicatesByName<T extends {name}>(...)`.

### D28. Parameter-count error message duplicated 3× (local/imported/library)
**Severity:** Medium
**Sites:** [eligian-validator.ts:720](packages/language/src/eligian-validator.ts#L720), [eligian-validator.ts:748](packages/language/src/eligian-validator.ts#L748), [eligian-validator.ts:770](packages/language/src/eligian-validator.ts#L770)
**Abstraction:** `reportActionParameterCountError(opName, expected, got, parameters, node, accept)`.

### D29. `MissingLabelIDData` diagnostic-data block duplicated 3×
**Severity:** Medium
**Sites:** [eligian-validator.ts:2298](packages/language/src/eligian-validator.ts#L2298), [eligian-validator.ts:2398](packages/language/src/eligian-validator.ts#L2398), [eligian-validator.ts:2428](packages/language/src/eligian-validator.ts#L2428)
**Abstraction:** `reportLabelIDError(node, error, labelId, labelsFileUri, languageCodes, accept)`.

### D30. Library-document resolution duplicated in two validators
**Severity:** High
**Sites:** [eligian-validator.ts:2564](packages/language/src/eligian-validator.ts#L2564), [eligian-validator.ts:2698](packages/language/src/eligian-validator.ts#L2698)
Identical normalize→dir→parse→`getDocument`→null-check (also the B4 ad-hoc-URI bug).
**Abstraction:** Private resolver returning the library document or `undefined`; fix B4 here at the same time.

### D31. CLI `isExternalUrl`/`isDataUri` and `resolveAssetPath`/`resolveUrl` triplicated
**Severity:** High
**Sites:** [asset-collector.ts:73-82](packages/cli/src/bundler/asset-collector.ts#L73), [css-processor.ts:43-52](packages/cli/src/bundler/css-processor.ts#L43), [html-generator.ts:129-138](packages/cli/src/bundler/html-generator.ts#L129) (url helpers); [asset-collector.ts:242-245](packages/cli/src/bundler/asset-collector.ts#L242), [css-processor.ts:61-64](packages/cli/src/bundler/css-processor.ts#L61), [html-generator.ts:147-150](packages/cli/src/bundler/html-generator.ts#L147) (path resolution)
**Abstraction:** Shared `cli/src/bundler/url-utils.ts` with `isExternalUrl`, `isDataUri`, and a single `resolveAssetPath`.

### D32. Asset-Map upsert pattern duplicated 3× in `collectAssets`
**Severity:** Medium
**Sites:** [asset-collector.ts:471-508](packages/cli/src/bundler/asset-collector.ts#L471), [asset-collector.ts:527-551](packages/cli/src/bundler/asset-collector.ts#L527), [asset-collector.ts:571-606](packages/cli/src/bundler/asset-collector.ts#L571)
**Abstraction:** `upsertAsset(assets, absolutePath, source, entry)`.

### D33. `getFileType` called twice in the same loop iteration
> ✅ **FIXED** — commit `6b1c52a`
**Severity:** Medium
**Sites:** [bundler/index.ts:258](packages/cli/src/bundler/index.ts#L258), [bundler/index.ts:261](packages/cli/src/bundler/index.ts#L261)
**Abstraction:** `const fileType = getFileType(ext)` once.

### D34. `printParseErrors` / `printCompilationErrors` byte-identical
**Severity:** Medium
**Sites:** [main.ts:48-64](packages/cli/src/main.ts#L48), [main.ts:97-113](packages/cli/src/main.ts#L97)
**Abstraction:** `printFormattedErrors(header, formatted)`.

### D35. `resolveImports` vs `resolveLibraryImports` near-identical recursion
**Severity:** Medium *(also anti-pattern)*
**Sites:** [ast-transformer.ts:144](packages/language/src/compiler/ast-transformer.ts#L144), [ast-transformer.ts:213](packages/language/src/compiler/ast-transformer.ts#L213)
**Abstraction:** `collectImportedActions(importStatements, visited, currentUri)`.

### D36. Locale-editor webview/extension type & function duplication
**Severity:** High *(cluster; merges several findings)*
**Sites:** `SerializableKeyTreeNode`/`LocaleEditorState` defined in [types.ts:40-55](packages/extension/src/extension/locale-editor/types.ts#L40), [media/locale-editor-core.ts:42-48](packages/extension/media/locale-editor-core.ts#L42), [media/locale-editor-core.ts:64-72](packages/extension/media/locale-editor-core.ts#L64), [media/locale-editor.ts:33-40](packages/extension/media/locale-editor.ts#L33), [media/locale-editor.ts:84-100](packages/extension/media/locale-editor.ts#L84); `findNodeByKey` ([media/locale-editor-core.ts:578-590](packages/extension/media/locale-editor-core.ts#L578) vs [media/locale-editor.ts:1420-1432](packages/extension/media/locale-editor.ts#L1420)); `removeKeyFromTree` pure vs mutating ([media/locale-editor-core.ts:655-666](packages/extension/media/locale-editor-core.ts#L655) vs [media/locale-editor.ts:1512-1529](packages/extension/media/locale-editor.ts#L1512))
The locale-code regex also diverges (`{2,3}` in core vs `{2}` inline at locale-editor.ts:1651), a real behavioral inconsistency.
**Abstraction:** Single shared module for the types/message-union; import `findNodeByKey`/pure `removeKeyFromTree` from core and delete the local copies (the mutating `removeKeyFromTree` is tied to bug B18).

### D37. `buildTreeFromKeys` / `buildTreeFromKeysWithPrefix` near-identical (~60 lines)
**Severity:** High
**Sites:** [key-tree-builder.ts:90-150](packages/extension/src/extension/locale-editor/key-tree-builder.ts#L90), [key-tree-builder.ts:155-222](packages/extension/src/extension/locale-editor/key-tree-builder.ts#L155)
**Abstraction:** Single `buildTreeFromKeysWithPrefix(keys, locales, prefix='')`.

### D38. `searchWorkspace` / `getKeyUsageDetails` duplicate find/regex/read setup
**Severity:** High
**Sites:** [LocaleUsageTracker.ts:54-103](packages/extension/src/extension/locale-editor/LocaleUsageTracker.ts#L54), [LocaleUsageTracker.ts:114-190](packages/extension/src/extension/locale-editor/LocaleUsageTracker.ts#L114)
**Abstraction:** Shared private helper returning raw match data; each caller post-processes.

### D39. `locale-serializer.ts` duplicates `key-tree-builder.ts` tree logic and is unused
**Severity:** Medium
**Sites:** [locale-serializer.ts](packages/extension/src/extension/locale-editor/locale-serializer.ts), [key-tree-builder.ts:289-309](packages/extension/src/extension/locale-editor/key-tree-builder.ts#L289)
**Abstraction:** Remove `locale-serializer.ts` (only a test imports it) and migrate the test, or have `key-tree-builder` delegate.

### D40. CSS error-metadata construction duplicated (notification paths)
**Severity:** Medium — *subset of D9; same `createEmptyCSSMetadata` fix.*
**Sites:** [language/main.ts:63-79](packages/extension/src/language/main.ts#L63), [language/main.ts:96-104](packages/extension/src/language/main.ts#L96), [language/main.ts:221-232](packages/extension/src/language/main.ts#L221)

### D41. `jsdoc-formatter` manual `lines.push/join` instead of `MarkdownBuilder`
**Severity:** Medium
**Sites:** [jsdoc-formatter.ts:18](packages/language/src/jsdoc/jsdoc-formatter.ts#L18), [jsdoc-formatter.ts:48](packages/language/src/jsdoc/jsdoc-formatter.ts#L48)
**Abstraction:** Refactor `formatJSDocAsMarkdown` to use `MarkdownBuilder` (the pattern it was built to replace).

### D42. File-basename extraction `split(/[\\/]/).pop()` duplicated in `formatLocation`
**Severity:** Low
**Sites:** [formatters.ts:64](packages/language/src/errors/formatters.ts#L64), [formatters.ts:71](packages/language/src/errors/formatters.ts#L71)
**Abstraction:** Private `getBaseName(filePath)`.

### D43. `createValidationError` wraps a static object in an unnecessary arrow
**Severity:** Medium
**Sites:** [import-path-validator.ts:50](packages/language/src/validators/import-path-validator.ts#L50), [validation-errors.ts:74](packages/language/src/validators/validation-errors.ts#L74)
**Abstraction:** Make `ERROR_MESSAGES.ABSOLUTE_PATH`/`INVALID_PATH_FORMAT` zero-arg functions for shape consistency.

### D44. Validator result shape `{ valid; errors[] }` duplicated without a base type
**Severity:** Low
**Sites:** [css-validator.ts:26](packages/language/src/asset-loading/css-validator.ts#L26), [html-validator.ts:30](packages/language/src/asset-loading/html-validator.ts#L30), [media-validator.ts:29](packages/language/src/asset-loading/media-validator.ts#L29)
**Abstraction:** Generic `ValidationResult<TError>` in `types.ts`.

---

## Anti-Patterns

### Theme: God classes / god modules
- **`EligianValidator` god class (3000+ lines, 40+ methods).** [eligian-validator.ts:203](packages/language/src/eligian-validator.ts#L203). All validation concerns in one class; the root cause of clusters D5/D6/D20/D27-D30. **Fix:** Decompose into focused validator classes registered via `registerValidationChecks`.
- **`extension/main.ts` god module (515 lines).** [main.ts:251](packages/extension/src/extension/main.ts#L251), [main.ts:364](packages/extension/src/extension/main.ts#L364), [main.ts:417](packages/extension/src/extension/main.ts#L417), [main.ts:473](packages/extension/src/extension/main.ts#L473). Move compile/JSDoc/locale commands into `commands/*` files (as already done for preview).

### Theme: Pervasive `any` and lost type safety
- **`EligianValidator.services` optional.** [eligian-validator.ts:204](packages/language/src/eligian-validator.ts#L204), [eligian-validator.ts:206](packages/language/src/eligian-validator.ts#L206). `if (!this.services) return;` silently skips checks in tests. Make required.
- **`CustomKind` factories typed `any`** (B12) — masks B13/B29.
- **`buildCSSIdentifierInfo` uses `any` metadata.** [css-hover.ts:158](packages/language/src/css/css-hover.ts#L158), [css-hover.ts:159](packages/language/src/css/css-hover.ts#L159). Use a generic `<M>`.
- **`detectClassNameHover` `_operationCall: any` unused.** [hover-detection.ts:93](packages/language/src/css/hover-detection.ts#L93). Remove the param.
- **`extractElementName(arg: any)`.** [context-detection.ts:148](packages/language/src/html/context-detection.ts#L148). Use the AST expression union type.
- **`getTimelines`/`getVariables` use `$type` string + `as`-cast.** [program-helpers.ts:58](packages/language/src/utils/program-helpers.ts#L58), [program-helpers.ts:78](packages/language/src/utils/program-helpers.ts#L78), [program-helpers.ts:79](packages/language/src/utils/program-helpers.ts#L79). Use generated `isTimeline`/`isVariableDeclaration`.
- **`findActionBelow` untyped `root`/`items`.** [ast-navigation.ts:33](packages/language/src/utils/ast-navigation.ts#L33), [ast-navigation.ts:38](packages/language/src/utils/ast-navigation.ts#L38). Use `EligianFile`/`isProgram`/`isLibrary`.
- **Manual `getProgram`/`getLibrary` parent-walk instead of `AstUtils.getContainerOfType`.** [eligian-validator.ts:1376](packages/language/src/eligian-validator.ts#L1376), [eligian-validator.ts:1391](packages/language/src/eligian-validator.ts#L1391).

### Theme: Test/dev artifacts leaking into production
- **`getOrCreateServices()` registers test CSS classes in the production singleton.** [pipeline.ts:64](packages/language/src/compiler/pipeline.ts#L64), [pipeline.ts:72](packages/language/src/compiler/pipeline.ts#L72). Phantom classes (`test-container`, `invalid1`…) make user docs pass CSS validation incorrectly. **Remove** the test metadata; inject in tests only.
- **Debug `console.log/trace` in webview (29 calls).** [media/locale-editor.ts:462-463](packages/extension/media/locale-editor.ts#L462), [media/locale-editor.ts:224-268](packages/extension/media/locale-editor.ts#L224). Remove or gate behind a debug flag.
- **`labels-watcher` debug `console.error`** (see B54). ✅ **FIXED** — `6b1c52a`
- **Dead `.orig` file committed.** [error-reporter.ts.orig](packages/language/src/compiler/error-reporter.ts.orig). Delete and add `*.orig` to `.gitignore`. ✅ **FIXED** — `6b1c52a`
- **Duplicate consecutive comments.** [pipeline.ts:308](packages/language/src/compiler/pipeline.ts#L308) ("Parse each CSS file…" twice); [asset-type-validator.ts:74-75](packages/language/src/validators/asset-type-validator.ts#L74) ("If inference fails…" twice). ✅ **FIXED** — `6b1c52a`

### Theme: Dead/stub code in public surface
- **`checkSingleLanguagesBlock`** empty body, never registered. [eligian-validator.ts:378](packages/language/src/eligian-validator.ts#L378). Delete. ✅ **FIXED** — `6b1c52a`
- **`compileFile`** permanently-failing stub exported publicly. [pipeline.ts:510](packages/language/src/compiler/pipeline.ts#L510). Implement via FileSystem effect or remove the export.
- **`image-inliner.ts` `inlineImage`/`shouldInline` unused in production.** [image-inliner.ts:27](packages/cli/src/bundler/image-inliner.ts#L27), [image-inliner.ts:68](packages/cli/src/bundler/image-inliner.ts#L68). Delete or wire into `asset-collector`.
- **`time-parser.ts` unused.** [time-parser.ts:27](packages/language/src/type-system-typir/utils/time-parser.ts#L27). Delete or document intent.
- **Deprecated label exports retained.** [label-entry-generator.ts:142](packages/language/src/labels/label-entry-generator.ts#L142), [:161](packages/language/src/labels/label-entry-generator.ts#L161), [:170](packages/language/src/labels/label-entry-generator.ts#L170). Remove with migration note.
- **Deprecated `AssetError` interface still used.** [types.ts:32](packages/language/src/asset-loading/types.ts#L32), [asset-validation-service.ts:14](packages/language/src/asset-loading/asset-validation-service.ts#L14), [compiler-integration.ts:20](packages/language/src/asset-loading/compiler-integration.ts#L20), [index.ts:17](packages/language/src/asset-loading/index.ts#L17). Migrate to the discriminated union.
- **`PathResolutionResult` one-armed union; `success` is a dead stub.** [path-resolver.ts:64-67](packages/shared-utils/src/path-resolver.ts#L64), [:135](packages/shared-utils/src/path-resolver.ts#L135), with dead-branch guards at [node-asset-loader.ts:89](packages/language/src/asset-loading/node-asset-loader.ts#L89), [html-import-utils.ts:42](packages/language/src/compiler/html-import-utils.ts#L42), [css-service.ts:202](packages/language/src/css/css-service.ts#L202). Add a real failure variant or return `string`.

### Theme: Empty/dead branches
- **Empty `else {}`.** [css-code-actions.ts:99](packages/language/src/css/css-code-actions.ts#L99). Remove. ✅ **FIXED** — `6b1c52a`
- **Magic `CompletionItemKind` literals + dead `kind === 2` branch + type-only import.** [eligian-completion-provider.ts:195](packages/language/src/eligian-completion-provider.ts#L195). Import `CompletionItemKind` as a value and use named constants; remove the dead branch.

### Theme: Effect/error-handling fragility (non-bug-level)
- **Manual FiberFailure unwrapping in `registerCompileCommand`.** [main.ts:288](packages/extension/src/extension/main.ts#L288), [main.ts:299](packages/extension/src/extension/main.ts#L299). Use `runPromiseExit`/`Cause` (pairs with B7/B42).
- **`transformEventAction` synchronous outlier** (B2) — also an architectural inconsistency.
- **Top-level `await fs.readFile(package.json)` with no try/catch.** [main.ts:20-21](packages/cli/src/main.ts#L20). Wrap with a default fallback.

### Theme: Encapsulation / API hygiene
- **`getDocumentImports` returns the internal Set by reference.** [css-registry.ts:113-114](packages/language/src/css/css-registry.ts#L113). Return a defensive copy.
- **`updateTrackedFiles` unintentionally public.** [css-watcher.ts:203](packages/extension/src/extension/css-watcher.ts#L203), [html-watcher.ts:189](packages/extension/src/extension/html-watcher.ts#L189), [labels-watcher.ts:195](packages/extension/src/extension/labels-watcher.ts#L195). Mark `private`. ✅ **FIXED** — `6b1c52a`
- **Global `window.__pendingDeleteIndex` side-channel** (race-prone). [media/locale-editor.ts:809](packages/extension/media/locale-editor.ts#L809), [:819](packages/extension/media/locale-editor.ts#L819), [:835](packages/extension/media/locale-editor.ts#L835). Use a module-level typed variable or pass the index through the message chain.
- **`locale-editor.ts` re-exports types it re-declares.** [media/locale-editor.ts:23](packages/extension/media/locale-editor.ts#L23). Remove the re-export.
- **`createValidationError` name shadows the domain constructor.** [error-builder.ts:52](packages/language/src/utils/error-builder.ts#L52) vs [compiler-errors.ts:236](packages/language/src/errors/compiler-errors.ts#L236) / [errors/index.ts:44](packages/language/src/errors/index.ts#L44). Rename the utility.
- **`getAllOperations` JSDoc implies runtime filtering by `FILTERED_OPERATIONS`.** [registry.ts:10](packages/language/src/completion/registry.ts#L10), [registry.ts:81](packages/language/src/completion/registry.ts#L81). Clarify that filtering happens at codegen.

### Theme: Performance / I/O
- **`checkImportNameCollisions` O(N²) (full scan per `LibraryImport`).** [eligian-validator.ts:2629](packages/language/src/eligian-validator.ts#L2629), [:2638](packages/language/src/eligian-validator.ts#L2638). Move to a Program-level validator.
- **`getImportedActions` not memoized (called up to 3× per `OperationCall`).** [eligian-scope-provider.ts:131](packages/language/src/eligian-scope-provider.ts#L131), [eligian-validator.ts:675](packages/language/src/eligian-validator.ts#L675), [eligian-validator.ts:737](packages/language/src/eligian-validator.ts#L737), [eligian-validator.ts:1216](packages/language/src/eligian-validator.ts#L1216). Cache per document URI or via `registerBeforeDocument`.
- **`mapParameterTypeToTypirType` ignores all but the first param type.** [eligian-type-system.ts:198](packages/language/src/type-system-typir/eligian-type-system.ts#L198), [:208](packages/language/src/type-system-typir/eligian-type-system.ts#L208). Document single-type constraint or build a union.
- **Double file-existence check for media assets.** [asset-validation-service.ts:55](packages/language/src/asset-loading/asset-validation-service.ts#L55), [:76](packages/language/src/asset-loading/asset-validation-service.ts#L76), [media-validator.ts:47](packages/language/src/asset-loading/media-validator.ts#L47), [:61](packages/language/src/asset-loading/media-validator.ts#L61). Remove one check.
- **`getHtmlForWebview` synchronous `fs.readFileSync` on the extension host.** [LocaleEditorProvider.ts:654](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L654). Cache at construction or use `fs.promises`.
- **Singleton `EligianServices` in `block-label-detector` with no disposal.** [block-label-detector.ts:31](packages/extension/src/extension/decorations/block-label-detector.ts#L31). Expose `disposeServices()` (pairs with B47).

### Theme: Unsafe casts / silent failures
- **Blind `as NodeJS.ErrnoException` before any guard.** [file-loader.ts:45](packages/shared-utils/src/file-loader.ts#L45). Add an `instanceof Error` check.
- **`renameKeyInConfig` silently drops branch-key renames.** [locale-editor-utils.ts:306-316](packages/extension/src/extension/locale-editor/locale-editor-utils.ts#L306). Handle the object case or return an explicit error.
- **`check-usage`/`request-delete` use `'key' in message` + `any` casts.** [LocaleEditorProvider.ts:463-484](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L463), [:488-526](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L488). Introduce a proper format discriminator.
- **Unhandled rejections from `document.save()`/`showWarningMessage()`.** [LocaleEditorProvider.ts:418-423](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L418), [:436-441](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L436), [:498-505](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L498), [:515-521](packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L515). Use async/await + try/catch and send a failure message.
- **`locale-editor.ts` mutates state directly, ignoring core pure functions.** [media/locale-editor.ts:499](packages/extension/media/locale-editor.ts#L499), [:727-728](packages/extension/media/locale-editor.ts#L727), [:843-848](packages/extension/media/locale-editor.ts#L843), [:976-985](packages/extension/media/locale-editor.ts#L976). Use the core transition functions.

### Theme: Other
- **`EligianTypeSystem._typirServices` definite-assignment `!` without guard.** [eligian-type-system.ts:53](packages/language/src/type-system-typir/eligian-type-system.ts#L53). Add a getter guard.
- **`LanguagesType` cache key omits `allLanguages`.** [languages-type.ts:92](packages/language/src/type-system-typir/types/languages-type.ts#L92). Include `allLanguages.join(',')`.
- **Inline `require('node:path')` shadows the top-level import.** [css-watcher.ts:85](packages/extension/src/extension/css-watcher.ts#L85), [html-watcher.ts:82](packages/extension/src/extension/html-watcher.ts#L82), [labels-watcher.ts:86](packages/extension/src/extension/labels-watcher.ts#L86). Use `path.dirname`. ✅ **FIXED** — `6b1c52a`
- **Magic `51200` duplicated.** [types.ts:52](packages/cli/src/bundler/types.ts#L52), [main.ts:248](packages/cli/src/main.ts#L248). Export `DEFAULT_INLINE_THRESHOLD`. ✅ **FIXED** — `6b1c52a`

---

## Recommended Safe Auto-Fixes

The following subset is judged mechanical and behavior-preserving (pure deletions of dead code, comment dedup, named-constant substitution, type-guard composition, slash-direction/`Math.max` corrections with no control-flow change, and stateful-`/g` regex relocation). All refactors that introduce shared abstractions, change public APIs, or alter control flow are intentionally excluded and left for manual review.

(See the structured `safeFixes` payload for the precise, applier-ready instructions.)
