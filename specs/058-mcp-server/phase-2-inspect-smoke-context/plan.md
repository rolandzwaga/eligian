# Implementation Plan: MCP server, Phase 2: Inspect, smoke with scenarios, agent context, curriculum

**Branch**: `feat/mcp-server-roadmap` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/058-mcp-server/phase-2-inspect-smoke-context/spec.md` (reviewed; clarifications Q1–Q8 encoded), roadmap §2–§7 Phase 2, §8 decisions 1–10.

Every signature below was read this session, with typegraph (`ts_module_exports`, `ts_navigate_to`, `ts_references`) or from the file, on the tree at `a7bceb8` (Phase 1 closed). Facts about installed libraries come from `node_modules/.pnpm/eligius@4.2.0_*/node_modules/eligius/dist/*` (`engine-factory-39T5FByM.mjs`, `locale-manager-CJy3musb.d.mts`), `node_modules/.pnpm/hotkeys-js@4.0.8/node_modules/hotkeys-js/dist/hotkeys-js.js`, `node_modules/.pnpm/effect@4.0.7/node_modules/effect/dist/{Effect,Schema}.d.ts` and jsdom 30.1.3 (probed). Probes ran in the session scratchpad and are not committed.

## Summary

Phase 2:
- completes the eight-tool surface with `eligian_compile`, `eligian_project` and `eligian_smoke`;
- gives `eligian smoke` scenarios, a streaming `--format ndjson` and a code on every problem;
- adds six review checks, the `lottie-web` warning and one language validator (listener action names);
- writes agent context for four clients from one module;
- ships the rest of the curriculum.

The design is reuse-first:

- **compile** = `compileFile` (the only compile path) plus the generator's probe fragment code, which moves into `src/` and is shared.
- **project** = a load-and-release helper extracted from `checkFiles`' `validateFiles`, plus the existing `selectorNames`, `layoutElementsOf`, `EligianDocumentSymbolProvider.getSymbols`, `parameterRoles`, `extractTranslationKeys`, the host declarations, and the review pass's own timeline checks.
- **smoke** = the CLI `eligian smoke`, run in a child process. The scenario engine reuses `smokeConfig`'s engine setup, `activeTimelineActions` and the Eligian map.
- **review** = five AST checks in one language module, shared with `eligian_project`, plus one config check and the lottie check in `review.ts`.
- **agents** = one `agents.ts`, used by `eligian init`, `eligian agents setup`, `eligian mcp --print-config` and `eligian_init`. The AGENTS.md block is still generated at build time.

No new runtime or dev dependency.

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo). The CLI is ESM, bundled to `dist/cli.mjs` (`packages/cli/esbuild.mjs:102-126`). The language package builds `dist/index.cjs` and `dist/mcp/index.cjs` as separate bundles (`packages/language/esbuild.mjs:33`, `:82-89`) |
| Runtime deps (unchanged) | `chalk`, `commander` 15.0.0, `effect` 4.0.7, `eligius` 4.2.0, `esbuild` 0.28.2, `jquery` 4.0.0, `tinyglobby`, `jsdom` 30.1.3 (`packages/cli/package.json` `dependencies`) |
| Testing | Vitest. CLI specs resolve `@eligian/language` and `@eligian/language/mcp` to the two built bundles, which hold separate Langium singletons (P1) |
| Platforms | Windows 11 (Node 24.7), `ubuntu-latest` (CI) |
| Performance | `initialize` < 3 s (unchanged); `eligian_smoke` default `timeoutMs` 45,000, with partial results |
| Constraints | stdout carries protocol frames only (server) and NDJSON lines only (smoke `--format ndjson`); compiler calls are serialised; Effect diagnostics 0/0/0; language coverage ≥ 79.8 / 80 / 69.9 / 79 (`packages/language/vitest.config.ts:74-79`); CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`packages/cli/vitest.config.ts:17-22`) |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. No new package, service or dependency. Two new language modules (one with the five AST checks, one validator) and one extracted helper. The only new algorithms are the scenario runner, the storyboard table reader and the config merges of `agents.ts`. |
| II / V / XX / XXV Testing, TDD | Pass. Each FR/SC has a named spec below, written first. `specs/TESTING_GUIDE.md` is read before the first test. The FR-055 validator needs a layout file, so its spec uses the real-file `checkFiles` path; the other language specs use `createTestContext()`. |
| III / XVII Effect | Pass. The three tool handlers are `Effect`s that fail only with the existing tagged `ToolNotFound` / `ToolIoError` / `ToolInternal` (`mcp/errors.ts:14-27`). `CompilerLock` (a `Context.Service`) reaches compile and project through `Tool.make`'s `dependencies`. The smoke child runs inside `Effect.callback`, with a kill canceler, and the temp scenario file is managed with `Effect.acquireUseRelease`. Smoke internals (`smoke/*.ts`) stay plain async, as today. `pnpm effect:check:cli` and `:language` are gates. |
| IV Clear errors | Pass. Every new diagnostic has a code and an overlay (FR-076). |
| VI / VII Immutability | Pass. Payloads are built fresh. Internal mutation happens only in the scenario runner and the merge writers. |
| VIII pnpm | Pass. pnpm only. As in Phase 1, the eval harness keeps `npm install <tarball>` inside a temp *user* project. |
| IX Langium | Pass. No grammar change; generated files are only read. |
| XII No premature docs | Pass. Only the docs the spec requires: README, CHANGELOG, root `AGENTS.md:47` (FR-051), and the roadmap edits of FR-057 and FR-099. Beyond the spec's touched-files list, only the three lines that state the tool count and would become false are corrected (P16): root `AGENTS.md:49` ("Five tools"), `:94` (the `tools/` list) and `packages/cli/AGENTS.md:34` ("the five tools"). No new doc text is added. |
| XIV Windows paths | Pass. `path.resolve` / `path.join`, case-insensitive comparison on win32 (`isInside`, `paths.ts:81`), and argument arrays with `shell: false`. |
| XV / XVI Research context | Pass. `eligius` only through the installed package. `quirks.spec.ts` is read, never imported. |
| XXII Sed safety | Pass. Edits by string match. |

No violations, so the Complexity tracking table is empty.

## Corrections to the spec found while planning

Each was checked this session, and `compliance.md` records it.

- **P1. Workspace helpers come from the root entry, not from `@eligian/language/mcp`.**
  - `packages/language/esbuild.mjs:82-89` bundles `src/mcp.ts` on its own (`external: ['vscode']`). Under vitest, `dist/mcp/index.cjs` therefore holds a second Langium singleton, separate from the one in `dist/index.cjs` that `compileFile` and `checkPaths` use (the Phase 1 plan's risk "Two singletons under vitest").
  - Anything that loads or releases workspace documents must share the root singleton. Otherwise SC-005(6) and FR-085 would measure the wrong workspace.
  - So FR-080's candidates go to the **root** export (`packages/language/src/compiler/index.ts`):
    - `parseSourceTracked` and `type TrackedParse` (`parser.ts:102`, `:83`);
    - `releaseWorkspaceDocuments` (`parser.ts:364`);
    - the new `withLoadedDocuments` (A1);
    - `getOrCreateServices` (`services.ts:37`), for the SC-005(6) document count.
  - `loadCssImports` (`parser.ts:323`) is not exported, because `withLoadedDocuments` calls it.
  - `parseSelector` is already root-exported (`index.ts`: `export * from './css/selector-parser.js'`; `ts_module_exports` lists `parseSelector(selector: string) => ParsedSelector`, `:111`).
  - The `mcp` entry gains only the new stateless `timelineFindings`, `timelineNames`, `TIMELINE_REVIEW_CODES` and `ASSET_REVIEW_CODES` (A2). `hostSignature` is not needed.
  - `hostOperations` is **not** added: the root entry already exports it (`compiler/index.ts:157-163` exports `controllerMetadata`, `hostModuleOf`, `hostOperations`, `isKnownController`; `index.ts:24` is `export * from './compiler/index.js'`). `review.ts` and `tools/project.ts` import it from `@eligian/language`. `hostControllers` and `hostFunctions` are already in the `mcp` entry (`mcp.ts:14`).
  - `extractLanguageCodes` is **not** added either: it returns the fallback `['en-US']` when the program has no `languages` block (`labels/types.ts:170-176`), which is wrong for the project inventory (D3).
- **P2. `compileFile` leaks library documents on one path only: an asset rejection.**
  - `compileFile` parses twice. The first `parseSource` (`compile-file.ts:265`) releases only the main document (`parser.ts:68-79`: "Library documents stay loaded"); on a failed parse, `parseSourceTracked` releases everything itself (`Effect.onError(() => Effect.sync(release))`, `parser.ts:102-119`).
  - The second parse is `compileWithMap(sourceCode, { sourceUri })` (`compile-file.ts:311-317`). It goes through `sourceToIR` = `Effect.acquireUseRelease(parseSourceTracked(...), …, ({ release }) => Effect.sync(release))` (`language/src/compiler/pipeline.ts:180-192`). That reparse deletes and re-adds each library document (`parseLibraryDocument`, `library-loader.ts:159-163`), tracks its URI (`trackLibraries`, `parser.ts:203-205`) and releases it, on success and on failure.
  - So every call that reaches `compileWithMap` ends with no document left. The leak is limited to the `AssetError` throw (`compile-file.ts:295-301`): an asset that `loadProgramAssets` rejects after a parse that validated, before `compileWithMap` runs. A compile inside `eligian_project` on such a program would then break FR-027 and SC-005(6).
  - Fix (B1, narrowed): `parseSourceTracked` replaces `parseSource`; `releaseMain()` is called right after the parse, exactly as `parseSource` does today (so the main-document timing does not change and `compileWithMap` re-adds the URI as it does today), and `release()` runs in a `finally` around the rest of the body. On the success path that `release()` is a no-op (`releaseDocuments` checks `hasDocument`, `parser.ts:140-150`), because `sourceToIR` has already released the same URIs.
  - The returned `program` stays usable, because `parseSourceInner` pins every reference before it returns (`resolveAllReferences`, `parser.ts:301-302`).
  - The other callers (`smoke-command.ts:63`, `dev/`, `main.ts`) only read `config`, `map`, `host` and `program`.
- **P3. One load-and-release helper.**
  - `validateFiles` (`check.ts:169-270`) already does what `eligian_project` needs: it loads a file set with its transitive libraries, links them, loads their CSS into the registry, and releases everything in a `finally`.
  - Its load-and-release half becomes `withLoadedDocuments` (A1), and `validateFiles` runs its validation inside it.
  - `checkFiles` behaves exactly as before, and the existing `checkFiles` specs cover the helper.
- **P4. The AST review checks live in the language package.**
  - Five of the six FR-050 checks need only the program AST, the layout and the file system. They also need property ranges (`GrammarUtils.findNodeForProperty`).
  - The CLI has no `langium` dependency (`packages/cli/package.json` `dependencies`).
  - `eligian_project` must compute the first three "by the same functions the review pass uses" (FR-024).
  - So `packages/language/src/compiler/timeline-review.ts` (A2) holds the five checks. It is exported through the `mcp` entry (stateless: AST in, findings out) and has its own language spec for the coverage gate.
- **P5. Verified: jsdom cascades the three visibility properties.**
  - The probe (scratchpad `cs-probe.mjs`, jsdom 30.1.3) showed that `getComputedStyle` returns:
    - `display: none` for `.hide{display:none}`;
    - `visibility: hidden` for `.inv`, inherited by a child;
    - `opacity: 0` for `.fade`;
    - `display: none` for a descendant rule `#p.off .c`.
  - A `<style>` appended to `<head>` after load also takes effect (`ok-after-inject none`).
  - This settles FR-034 item 5's **[UNVERIFIED]**; no fallback that resolves rules is built.
  - `opacity` does not inherit, so `visible` walks the ancestors, as FR-034 item 5 already says.
- **P6. Verified: where eligius 4.2.0 records attached controllers.**
  - `attachControllerToElement` pushes the controller instance onto the jQuery data array `eligiusEngineControllers` of the selected element (`engine-factory-39T5FByM.mjs:1957-1967`).
  - Every controller has a `name` field: `name = "DOMEventListenerController"` (`:8026`), `"KeyboardController"` (`:8121`), `"LabelController"` (`:8317`).
  - jQuery data is stored per jQuery instance. `packages/cli/node_modules/jquery` and eligius' own `jquery` both link to `node_modules/.pnpm/jquery@4.0.0/node_modules/jquery` (checked with `ls -la` and `readlink -f`), and eligius pins `jquery: 4.0.0`. So an `import('jquery')` after `loadEligius()` gets the engine's instance.
  - This settles FR-034 item 6's **[UNVERIFIED]**. SC-007(8) keeps a behavioural assertion on it.
- **P7. Verified: a `KeyboardEvent` with `key` is enough for the KeyboardController.**
  - The controller binds its keys through hotkeys-js: `hotkeys(keys, { scope: "all" }, handler)` (engine-factory `:8100-8200`).
  - hotkeys-js 4.0.8 maps `event.key` to its key code itself (`getLayoutIndependentKeyCode`, `hotkeys-js.js:54-69`). It listens for `keydown` and `keyup` on its element, which is `document` by default (`:480-481`).
  - No `keyCode` shim is needed.
- **P8. The engine API the scenario needs exists.** `IEligiusEngine` (`locale-manager-CJy3musb.d.mts:1530`) has `position`, `playState`, `currentTimelineUri`, `init()`, `start()`, `seek(position)`, `switchTimeline(uri, position?)`, `stop()` and `destroy()`.
- **P9. `lottie-web` resolves from every path in this repo.**
  - `pnpm-workspace.yaml:38` sets `shamefullyHoist: true`.
  - `createRequire(<repo path>).resolve('lottie-web')` succeeds from `packages/cli/src/__tests__`, `examples` and `packages/extension` (probe output: `node_modules/.pnpm/lottie-web@5.13.0/...`).
  - SC-022's "not resolvable" fixture is therefore written under `os.tmpdir()`, outside the repo.
  - The check walks up from the program's directory, looking for `node_modules/lottie-web/package.json`. It does not use `createRequire`, which also reads `NODE_PATH` and the global folders.
- **P10. The FR-056 mechanism is a review check, `lottie-web-not-installed`.**
  - A missing `lottie-web` matters for the CLI paths only (`--bundle`, `dev`, `smoke`). The VS Code preview bundles `lottie-web` itself (`packages/extension/package.json:294`), so an IDE squiggle would be wrong there.
  - A review check runs in `eligian check` and `eligian_check`, both of which have review on by default. That is what SC-022 measures.
  - `REVIEW_CODES` therefore ends with **nine** codes: the two of Phase 1, the six of FR-050, and this one. FR-051's "eight review checks" counts the Phase 1 and FR-050 checks.
  - A compiled `addController("LottieController", …)` is the pair `getControllerInstance { systemName: "LottieController" }` + `addControllerToElement` (probe compile, scratchpad `p2probe/lottie.eligian`). So the warning is located, through the map, at the `getControllerInstance` operation.
- **P11. The compile summary's `controllers` read the compiled pair.** For the same reason, FR-012's "the names in `addController` operations" is computed as the `systemName` of every `getControllerInstance` operation.
- **P12. `eligian_init`'s Success replaces `skipped` with `agentFiles`.**
  - Phase 1's `skipped: { file, reason, content }[]` (`mcp/tools/init.ts:41-55`) existed because agent files were write-if-absent (`:111`).
  - FR-065 replaces that with merging, so the payload carries `agentFiles: { file, status, message? }[]`, with the FR-061 statuses.
  - In `mcp-init.spec.ts`, "skips existing agent files" becomes "merges into existing agent files".
- **P13. The AGENTS.md block stays a build artifact.**
  - FR-066 needs the docs index, which exists only at build time.
  - The generator already writes `dist/docs/agents-block.md` (`generate-knowledge.ts:942`). `agentsMdBlock` gains the index as a parameter.
  - `agents.ts` reads the generated file from `docsRoot`. The default is `new URL('./docs/', import.meta.url)`, as in `server.ts:69`.
  - As in Phase 1, specs generate the docs in `beforeAll` and pass `docsRoot`.
- **P14. `--format ndjson` redirects the console and flushes before exit.**
  - A Langium, Typir or eligius `console.log` outside `captureRuntime`'s window (`smoke-runner.ts:217-257`) would corrupt the stream. In ndjson mode, `main.ts` therefore calls `redirectConsoleToStderr()` (`mcp/stdio.ts:37`) and writes lines through the returned writer.
  - The jsdom window is created with `pretendToBeVisual: true` (`dom-environment.ts:24`). Its animation frames keep the event loop alive, so the command must still call `process.exit`.
  - A pipe write on Windows is asynchronous, so the command first awaits a flush of the captured stdout. `CapturedStdout` gains `flush(): Promise<void>`.
  - The tool also skips any line that does not parse as JSON, and copies it to stderr with the `smoke: ` prefix (FR-044).
- **P15. Timeline names come from one helper.**
  - `isTimeline` is not root-exported: `packages/language/src/index.ts` exports only `isProgram`, `isEndableActionDefinition` and `isInlineEndableAction` from `generated/ast`.
  - A media timeline's `uri` is its `from` path, not its name.
  - `timelineNames(program): string[]` (A2) gives the source names by config index, for compile, project, smoke and scenarios. It walks `getTimelines`, as `lifecycleInsertionPoints` does (`utils/timeline-lifecycle.ts:66-68`).
- **P16. Three doc lines state the tool count and become false.** The spec's touched-files list names root `AGENTS.md` only at `:47` (FR-051). Root `AGENTS.md:49` says "Five tools: `eligian_docs`, `eligian_operations`, `eligian_check`, `eligian_fmt`, `eligian_init`", `:94` lists `tools/ (docs, operations, check, fmt, init)`, and `packages/cli/AGENTS.md:34` says "`tools/` (the five tools)". After Phase 2 all three are wrong, so they are corrected to the eight names (nothing else is added to them). `compliance.md` records this as an addition to the touched-files list.

## Sequencing

- **Step 0, before any source edit**:
  - (a) save the `--format pretty` and `--format github` outputs of the `smoke.spec.ts` fixtures to the scratchpad (evidence for FR-031's "byte-identical");
  - (b) save the outputs of `pnpm run check:examples`, `smoke:examples` and `fmt:examples`;
  - (c) save both coverage summaries;
  - (d) list the probe snapshots of `mcp-knowledge.spec.ts` (for SC-004(6));
  - (e) find, by probe, the `asset-rejected` fixture: a program that imports a library, validates with no error (`checkFiles` → 0 errors), and whose `compileFile` rejects with `AssetError` in `loadProgramAssets` (`compile-file.ts:295-301`). The candidate is a `locales` file that parses as JSON and passes the validator (`asset-import-validator.ts:320-331` only parses and extracts keys) but fails `validateLocalesJSON`'s schema check, which only the compiler runs (`compiler-integration.ts:226`). The probe's result (the file content and the rejection message) goes into `compliance.md`. If no such program exists in the tree, the build stops with `blocked` and the SC-004(4) / B1 rows go back to the user, rather than being dropped.
- **Days 1–2**: language A1–A4, then the CLI check layer B1–B3. `check:examples` runs after B2.
- **Days 3–4**: smoke C1–C5 (codes, ndjson, `smokeFile`, flags, scenario runner), then the smoke tool D4.
- **Day 5**: compile D2, project D3, the staleness and concurrency specs.
- **Day 6**: agents E1–E3, init, `--print-config`, the CI gates moved to eight names.
- **Days 7–8**: knowledge F1–F5 (generator, ranking, overlays, curriculum, markers), the final instructions.
- **Day 9**: the verifications (FR-055 is done in A3; the FR-056 runs; the FR-057 docs), eval cases G, README / CHANGELOG / roadmap edits, gates.

## Module design

### A. Language package (`packages/language`)

#### A1. `withLoadedDocuments` (P3) — `src/compiler/pipeline/check.ts`

```ts
export interface LoadedDocuments {
  /** The shared compiler services: the singleton checkFiles and compileFile use */
  readonly services: EligianServices;
  /** The files and every library they import (transitively), by URI string */
  readonly documents: ReadonlyMap<string, LangiumDocument>;
  /** The document of one of `files`, by absolute path */
  readonly documentOf: (file: string) => LangiumDocument | undefined;
}

/**
 * Load `files` and their libraries into the shared workspace, link them, load their CSS
 * imports into the CSS registry, run `use`, then clear the CSS registrations and release
 * every loaded document (also when `use` throws). No validation is run.
 */
export async function withLoadedDocuments<T>(
  files: readonly string[],
  use: (loaded: LoadedDocuments) => Promise<T> | T,
  onUnreadable?: (file: string, error: unknown) => void
): Promise<T>;
```

- The body moves unchanged out of `validateFiles`: `addDocument`, the library walk, the relink and `loadCssImports` (`check.ts:174-240`), plus the `finally` (`:264-269`).
- `validateFiles` becomes `withLoadedDocuments(files, loaded => { validate each file … }, (file, error) => results.get(file)?.push(…))`. The pushed diagnostic is today's file-unreadable diagnostic (`:186-195`).
- `EligianServices` = `getOrCreateServices().Eligian`, the type `selectorNames(services: EligianServices, …)` takes (`selector-sources.ts:51`).
- New root exports (P1), in `src/compiler/index.ts`: `withLoadedDocuments`, `type LoadedDocuments`, `parseSourceTracked`, `type TrackedParse`, `releaseWorkspaceDocuments`, `getOrCreateServices`.

#### A2. Timeline review findings (FR-050, FR-024; P4, P15) — new `src/compiler/timeline-review.ts`

```ts
export const TIMELINE_REVIEW_CODES = [
  'media-file-missing',
  'media-from-duplicate',
  'timeline-container-not-in-layout',
  'media-timeline-first-without-start-gesture',
  'entry-timeline-without-enter',
] as const;
export type TimelineReviewCode = (typeof TIMELINE_REVIEW_CODES)[number];
/** The three FR-024 asset problems among them */
export const ASSET_REVIEW_CODES: readonly TimelineReviewCode[];

export interface TimelineFinding {
  readonly code: TimelineReviewCode;
  readonly message: string;
  /** The timeline's source name */
  readonly timeline: string;
  /** 1-based range of the reported property (the `from` string, the `in` selector, or the name) */
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** Media codes: the resolved absolute path */
  readonly path?: string;
}

/** The five timeline checks of `program`, compiled from or loaded at `file` (absolute). */
export function timelineFindings(
  program: Program,
  file: string,
  options?: { readonly exists?: (absolutePath: string) => boolean }   // default fs.existsSync
): TimelineFinding[];

/** The source names of the program's timelines, in document (= config) order. */
export function timelineNames(program: Program): string[];
```

The FR-050 rules, made mechanical:
- **`media-file-missing`**: the timeline's `provider` is `video` or `audio`, its `source` is set, and `exists(resolveImportRelativePath(source, path.dirname(file)))` is false. `resolveImportRelativePath` is in `utils/path-utils.ts`, root-exported. Range: `GrammarUtils.findNodeForProperty(timeline.$cstNode, 'source')`.
- **`media-from-duplicate`**: the second and later media timelines whose resolved `from` equals an earlier one's. Paths are compared case-insensitively on win32, as in `paths.ts:78`. Range: `source`. The message names the first timeline.
- **`timeline-container-not-in-layout`**: `readLayoutHtml(program)` (`html/layout-elements.ts:51`) returns text, and a class or id of `parseSelector(timeline.containerSelector)` (`css/selector-parser.ts:111`) is not in `scanLayoutElements(html)` (`:21`). Range: `containerSelector`. Without a layout import, nothing is reported (the engine generates the containers).
- **`media-timeline-first-without-start-gesture`**: the first timeline (`getTimelines(program)[0]`) is `video` or `audio`, and none of its `on enter` blocks holds an `InteractionStatement` with `event === 'click'` and `verb` `play` or `toggle`. The blocks are the `timeline.lifecycle` entries with `kind === 'enter'`; the AST is at `generated/ast.ts:846-856`. Range: `name`.
- **`entry-timeline-without-enter`**: `getTimelines(program).length >= 2`, and the first timeline has no `on enter` block (Q2). Range: `name`.

The module is exported through `src/mcp.ts`. It is pure: no services, no workspace.

#### A3. Listener action names (FR-055, Q3) — new `src/validators/operation-call/listener-action-validator.ts`

```ts
export class ListenerActionValidator {
  constructor(services: EligianServices);
  /** addController("DOMEventListenerController" | "KeyboardController", …, [ "a", "end:b" ]) */
  checkListenerActionNames(operation: OperationCall, accept: ValidationAcceptor): void;
}
```

- **Reading the call**: the validator reads it as the dataflow does (`dataflow/operation-dataflow.ts:414-439`):
  - the first argument is a string literal in `ACTION_CONTROLLERS` (`:108`, now exported for this);
  - the third argument is an array literal;
  - each string-literal element is a name, with any `end:` prefix stripped;
  - a non-literal element ends the check (as at `:435`).
- **Resolution**: the dataflow validator's own, `findCallableAction(name, (services.references.ScopeProvider as EligianScopeProvider).getCallableActions(operation))` (`utils/action-scope.ts:146`; `validators/dataflow-validator.ts:27-33`). Local, imported and aliased actions therefore count exactly as the compiler sees them.
- **An unknown name**: `accept('error', 'Unknown action "<name>" in the <Controller> action list: no action with that name is declared or imported', { node: element, data: { code: diagnosticCode('unknown-listener-action'), suggestions } })`.
  - `suggestions` are the closest callable action names, from the Phase 1 did-you-mean helper (`css/levenshtein.ts`). They travel as `data.suggestions` (Phase 1 A3), which `check.ts` `dataOf` reads.
  - The severity is error, because the engine fails at runtime ("unknown action "nope" for DOM event "click"", spec Verification record).
- **Wiring**: `OperationCallValidator` (`validators/operation-call-validator.ts:22-35`, the single DI surface) gains a `listeners` member and a `checkListenerActionNames` method. The method is listed in `operationCallChecks`, after `checkControllerCall` (`eligian-validator.ts:167-178`).
- **Code**: `validators/codes.ts` gains `'unknown-listener-action': 'validator'`.
- Validation runs without compiling, so `eligian check` reports the finding even when the program has other errors (SC-010(4)).

#### A4. `mcp` entry (FR-080, P1) — `src/mcp.ts`

The entry adds `timelineFindings`, `timelineNames`, `TIMELINE_REVIEW_CODES`, `ASSET_REVIEW_CODES`, `type TimelineFinding` and `type TimelineReviewCode`. The exact-exports list in `mcp-entry.spec.ts:18` is updated. `hostOperations` stays a root-only export and `extractLanguageCodes` is not exported (P1).

### B. CLI check layer (`packages/cli/src`)

#### B1. `compile-file.ts` (P2)

Narrowed to the one leaking path (P2):
- The `parseSource(sourceCode, absoluteInputPath)` call (`:265`) becomes `parseSourceTracked(...)`, with `const { program, releaseMain, release } = parseExit.value; releaseMain();`. That is what `parseSource` does today (`parser.ts:68-79`), so the main document's lifetime is unchanged.
- The rest of the body (assets, `compileWithMap`) runs in `try { … } finally { release(); }`. Its only effect is on the `AssetError` throw (`:295-301`), which today leaves the libraries loaded. After `compileWithMap` the call is a no-op, since `sourceToIR` already released the same URIs (`pipeline.ts:180-192`).
- The signature and `CompileResult` (`:55-69`) are unchanged.
- Tested by `mcp-compile.spec.ts` › `compileFile releases its libraries on an asset rejection` (fixture `asset-rejected/`, see the SC-004 row). A valid fixture would pass without B1, so that case is the one that tests it.

#### B2. `check/review.ts` (FR-050, FR-056)

```ts
export const REVIEW_CODES = [
  'controller-imbalance',
  'class-never-removed',
  ...TIMELINE_REVIEW_CODES,
  'host-operation-in-block-without-select',
  'lottie-web-not-installed',
] as const;                                  // nine codes (P10)

export function reviewConfig(compiled: Compiled, file: string): CheckDiagnostic[];   // signature unchanged (:41)

/** Whether `lottie-web` is installed in a node_modules at or above `fromDir` (P9). */
export function lottieInstalled(fromDir: string, exists?: (p: string) => boolean): boolean;
```

`reviewConfig` returns today's two checks (`:48-56`), plus the timeline findings, plus the two checks below:
- the timeline findings are `timelineFindings(compiled.program, file)`, each turned into a warning at the finding's range;
- `diagnostic()` (`:59`) is reused for the findings located through the map.

**`host-operation-in-block-without-select`** (FR-050, I-3):
- It reads the compiled config, not the AST: the operation lists (start and end) of timeline actions, init actions, event actions and named actions (`config.actions`). FR-050 says "a block" and does not exclude named-action bodies, so they are checked (see OQ-1).
- A host operation is a `systemName` declared with `hostOperations(compiled.program)` (imported from `@eligian/language`, P1).
- A list position holding a host operation, with no `selectElement` earlier in the same list, is reported. An operation whose declaration has a parameter named `selector` is exempt.
- `target` and `with` compile to a leading `selectElement` (AGENTS.md "target / with"), so they count by construction.
- Location: `compiled.map.actions[id][phase][index].location`.
- A named action that relies on its caller's selection is reported, as the FR-050 row reads today. A called action receives a copy of the caller's operationData (`mcp-runtime-claims.spec.ts` CLAIMS[1]), so such a program runs correctly; the diagnostics overlay says so and names the fix (a `selectElement`, or a `selector` parameter). The only host module in `examples/` is the tour's, whose one host operation is exempt (`stampTime(selector: string)`), so `check:examples` is unaffected (grep for `extensions` imports this session). Excluding named actions needs an FR-050 ruling first (OQ-1).

**`lottie-web-not-installed`** (FR-056, P9, P10):
- It reports every `getControllerInstance` operation whose `operationData.systemName === 'LottieController'`, when `!lottieInstalled(path.dirname(file))`.
- One warning per call, located through the map at the `getControllerInstance` operation, which is the source of the `addController(...)` call.

#### B3. `check/check-command.ts`: the I-4 suppression (FR-050)

- In `withCompiledChecks`' merge (`:206-212`), a `timeline-container-not-in-layout` diagnostic is dropped when the same result already holds a `selector_not_in_layout` diagnostic at the same `line` and `column`. Both are ranged on the `containerSelector` string (`reportNotInLayout`, `selector-sources.ts:73`).
- `eligian_check` runs `checkPaths` → `withCompiledChecks` (`mcp/tools/check.ts:114`). So this one merge serves both commands, which is what FR-050 asks for with "the same merge in `eligian_check`".

### C. `eligian smoke` (`packages/cli/src/smoke`, `main.ts`)

#### C1. `smoke-runner.ts`: codes, listener, host wrapping, engine setup

```ts
export const SMOKE_CODES = [
  'smoke-compile-failed',            // smokeFile: the program does not compile
  'smoke-engine-error',              // engine 'error' event (:119-133)
  'smoke-console-error',             // captureRuntime console.error (:228-233)
  'smoke-console-warn',              // captureRuntime console.warn (:247)
  'smoke-unhandled-rejection',       // :249-251
  'smoke-selector-miss',             // strict selectElement miss (:236-245)
  'smoke-step-timeout',              // withTimeout (:288-298)
  'smoke-run-failed',                // any other throw caught at :156-158
  'smoke-host-export-missing',       // :109-115
  'host-operation-returned-non-object',   // FR-033 (name from roadmap §7)
  'smoke-unknown-timeline',          // --timeline <name> not declared (FR-035)
  'scenario-selector-not-found',     // click / key `in` selector matched nothing
  'scenario-unknown-timeline',       // navigate to an undeclared timeline
  'scenario-media-timeline',         // navigate to a media timeline, or a media-only program (FR-034 item 3; C2 step 0)
  'scenario-assertion-failed',       // FR-034 item 7 (user story 3 names it)
  'smoke-timeout',                   // eligian_smoke killed the child (FR-042); written by the tool only
] as const;
export type SmokeCode = (typeof SMOKE_CODES)[number];

export interface SmokeProblem {               // :30-39, plus:
  readonly code: SmokeCode;
  readonly step?: number;                    // scenario step index
  readonly expected?: string;                // scenario assertions: JSON text
  readonly actual?: string;
  /* severity, message, timeline?, time?, location? unchanged */
}

export interface SmokeListener {
  readonly timeline?: (timeline: SmokeTimeline) => void;
  readonly problem?: (problem: SmokeProblem) => void;
  readonly step?: (step: ScenarioStepResult) => void;
}

export interface SmokeOptions {                // :54-61, plus:
  /** Source names by config timeline index (timelineNames, A2) */
  readonly names?: readonly string[];
  /** Play only these timelines (source names); an unknown one is a smoke-unknown-timeline problem */
  readonly timelines?: readonly string[];
  readonly scenario?: Scenario;
  /** The directory the config's relative cssFiles resolve against (the program's directory) */
  readonly sourceDir?: string;
  readonly listener?: SmokeListener;
}
export interface SmokeResult {                 // :49-52, plus:
  readonly steps?: readonly ScenarioStepResult[];
}
```

- **One report path**: every problem goes through the one `report` (`:92`), which now also calls `listener.problem`. The engine-error push (`:123`) changes to use `report`. `listener.timeline` is called where `timelines.push` happens (`:87`, `:151`).
- **Step timeouts**: `withTimeout` rejects with `class StepTimeoutError extends Error {}`. The catch at `:156` maps it to `smoke-step-timeout`, and anything else to `smoke-run-failed`.
- **FR-033, host operations**: after `loadHostModule` (`:107`), each registered operation `fn` in `registrations.operations` is replaced by a wrapper.
  - The wrapper calls `fn` with the same `this` and argument, and inspects the result, or the resolved value of a thenable.
  - A value that is not a non-null object reports one `host-operation-returned-non-object` error per operation name. It is located at the first map operation whose `systemName` is that name, found by scanning `map.actions` as `selectorLocation` does (`:265-286`).
  - The original value is returned unchanged.
  - The wrapper (`wrapHostOperations(registrations, onNonObject)`) lives in `smoke-runner.ts`, not in `dev/host-module.ts`, so `dev` is untouched.
- **Engine setup**: the engine construction (`:116-133`) moves into a local `createEngine(runnable, registrations)`. The scenario engine (C2) is built by the same function, with the same `error` listener.
- **The early return** (`if (playable.length === 0) return { timelines, problems };`, `:90`) now skips the walk only. Without a scenario the behaviour is unchanged. With a scenario, `smokeConfig` goes on to `captureRuntime`, the host module and the scenario (C2 step 0), so a media-only program still runs the scenario's media check instead of silently doing nothing.
- **`--timeline`**: the walk's `playable` (`:84`) is filtered to the indices whose `names[i]` is listed. The scenario engine gets every non-media timeline, whatever `--timeline` says: a `navigate` step is an explicit request for its target.

#### C2. Scenarios (FR-034) — new `smoke/scenario.ts`

```ts
// Effect Schema (effect is a static dependency; only effect/ai is lazy)
export const ScenarioStep: Schema.Union<[...]>;   // { seek: number } | { click: string } | { key: string, in?: string }
                                                  // | { navigate: string } | { wait: number } | { snapshot: string }
export const Assertion: Schema.Struct<{
  after: Schema.Union<[typeof Schema.String, typeof Schema.Int]>;
  selector: Schema.optionalKey<typeof Schema.String>;
  hasClass, notHasClass, text: Schema.optionalKey<typeof Schema.String>;
  visible: Schema.optionalKey<typeof Schema.Boolean>;
  controllers: Schema.optionalKey<Schema.Array<typeof Schema.String>>;
  timeline: Schema.optionalKey<typeof Schema.String>;
  position: Schema.optionalKey<Number | { sameAs: string | number } | { greaterThan: string | number }>;
}>;
export const Scenario: Schema.Struct<{ steps: Schema.Array<typeof ScenarioStep>; assertions: Schema.optionalKey<Schema.Array<typeof Assertion>> }>;
export type Scenario = typeof Scenario.Type;

/** Decode a scenario file's JSON; the failure text is the usage error (CLI exit 2, tool kind io). */
export function parseScenario(json: unknown): { ok: true; scenario: Scenario } | { ok: false; message: string };
// Schema.decodeUnknownResult(Scenario)(json) (effect Schema.d.ts, the decodeUnknownResult example at :977),
// then the cross-field rules of step 4 (after / selector), which the schema cannot express

export interface ElementSnapshot {
  readonly exists: boolean;         // false: the id is in the layout but not in the document now
  readonly classes: readonly string[];
  readonly text: string;            // textContent trimmed, ≤ 200 chars
  readonly style: string;           // the style attribute, '' when absent
  readonly visible: boolean;
  readonly controllers: readonly string[];
}
/** Flat, as FR-034 item 4 states: one key per layout id, plus `activeTimelineActions`. */
export type Snapshot = Readonly<Record<string, ElementSnapshot | readonly string[]>>;
//   snapshot[<layout id>]: ElementSnapshot; snapshot.activeTimelineActions: string[]
export interface ScenarioStepResult {
  readonly index: number;
  readonly step: typeof ScenarioStep.Type;
  readonly label?: string;          // snapshot steps
  readonly timeline: string;        // active timeline, source name
  readonly position: number;        // seconds
  readonly snapshot: Snapshot;
}

export const POSITION_TOLERANCE_S = 0.1;

export async function runScenario(
  engine: IEligiusEngine,
  window: Window & typeof globalThis,
  context: {
    readonly config: IEngineConfiguration;
    readonly map: EligianMap;
    readonly names: readonly string[];
    readonly scenario: Scenario;
    readonly stepTimeoutMs: number;
    readonly report: (problem: SmokeProblem) => void;
    readonly onStep: (result: ScenarioStepResult) => void;
  }
): Promise<readonly ScenarioStepResult[]>;
```

The scenario runs inside `smokeConfig`, after the walk's `destroy` (`:155`), as I-10 requires. It has no early return of its own (C1).

0. **The media check, against the full `config.timelines`**:
   - The walk's engine and the scenario engine are given only the non-media timelines (`runnable.timelines = playable`, `smoke-runner.ts:93-98`). So the active timeline can never be a `mediaplayer`, and FR-034 item 3's "a step on a media timeline" is checked before a step runs, against the full config.
   - When `config.timelines` holds no non-media timeline, no engine is built and no step runs. One `scenario-media-timeline` error with `step: 0` is reported, naming the media timelines. The result has no step results, and the assertions are not evaluated (the error already gives exit 1).
   - Otherwise, a `navigate` whose target is a `mediaplayer` timeline (`config.timelines[names.indexOf(name)].type === 'mediaplayer'`) reports `scenario-media-timeline` with that step's index, without calling the engine. The active timeline stays as it was, and the scenario continues.
1. **A fresh engine**:
   - the body is reset to `<div id="eligian-smoke-root">`;
   - `injectStyles(window, texts)` (C4) adds the program's CSS: each `config.cssFiles` entry, read relative to `options.sourceDir` (the tour's config holds `cssFiles: ["./tour.css"]`, probe);
   - `createEngine` builds the engine with `cssFiles: []`;
   - `init()`, then `start()` (I-10; roadmap §3.3 C lifecycle).
2. **The steps**, each under `withTimeout(stepTimeoutMs)`, then `SETTLE_MS` (`:69`):
   - `seek`: `engine.seek(s)`.
   - `click`: `new window.MouseEvent('click', { bubbles: true, cancelable: true })`, dispatched on `document.querySelector(sel)`.
   - `key`: `new window.KeyboardEvent('keydown' | 'keyup', { key, bubbles: true, cancelable: true })` (P7). The target is the `in` element; else the first element whose `eligiusEngineControllers` names include `KeyboardController`; else `document`.
   - `navigate`: the name's index in `names`, then `engine.switchTimeline(config.timelines[i].uri, 0)`.
   - `wait`: a `setTimeout`.
   - `snapshot`: no action; records the `label`.

   Three cases are problems, each carrying `step: index`; the scenario continues after them:
   - no element for `click` or for `key.in`: `scenario-selector-not-found`;
   - an unknown `navigate` name: `scenario-unknown-timeline`;
   - a `navigate` to a media timeline, or any step of a media-only program: `scenario-media-timeline` (step 0 above).
3. **The snapshot**, after each step, flat (FR-034 item 4), so FR-005's per-key smoke rule applies to it as written:
   - The layout ids are `scanLayoutElements(config.layoutTemplate).ids` (`@eligian/language/mcp`; `layoutTemplate` is a string in compiled configs, probe). Every layout id gets a key, whether or not the element is in the document now.
   - Per id, with `el = document.getElementById(id)`:
     - `exists`: `el !== null`;
     - `classes`: the `classList`;
     - `text`;
     - `style`;
     - `visible`: the element exists, has no `hidden` attribute, and neither it nor any ancestor computes `display: none`, `visibility: hidden` or `opacity: 0` (P5);
     - `controllers`: `(jQuery(el).data('eligiusEngineControllers') ?? []).map(c => c.name)`, with `jQuery = (await import('jquery')).default` after `loadEligius()` (P6).
   - An absent element is `{ exists: false, classes: [], text: '', style: '', visible: false, controllers: [] }`. Removing an element is therefore a change, and the concise form (D4) cannot mistake it for "unchanged".
   - `activeTimelineActions`: `activeTimelineActions(map, engine.currentTimelineUri, engine.position).map(a => a.name)` (`eligian-map.ts:307`). The key is reserved: a layout id named `activeTimelineActions` is not snapshotted, and an assertion on `#activeTimelineActions` is a usage error.
   - `timeline`: `names[config.timelines.findIndex(t => t.uri === engine.currentTimelineUri)]`.
4. **The assertions**, after the last step:
   - Checked by `parseScenario`, so a violation is a usage error (CLI exit 2, tool kind `io`), before anything runs:
     - `after` must name a `snapshot` label of the scenario, or be a step index in range;
     - `selector`, when present, must be `#<id>` (one id, matching `^#[A-Za-z_][\w-]*$`); a class, compound or descendant selector is rejected with a message saying that assertions address layout ids;
     - an element field (`hasClass`, `notHasClass`, `text`, `visible`, `controllers`) without a `selector` is rejected.
   - At evaluation, a `#<id>` that is not a layout id has no snapshot entry: it is a `scenario-selector-not-found` error carrying the `after` step's index, and the assertion is not compared further.
   - `after` resolves to the snapshot step with that label, or to the step with that index.
   - The fields are compared as follows:
     - `hasClass` / `notHasClass`: on `classes`;
     - `text`: exact match;
     - `visible`: equality;
     - `controllers`: as a multiset;
     - `timeline`: equality;
     - `position`: a number passes when `|actual − n| ≤ POSITION_TOLERANCE_S`; `sameAs` when `|actual − other| ≤ POSITION_TOLERANCE_S`; `greaterThan` when `actual > other`.
   - A failure is a `scenario-assertion-failed` error with `step`, `expected` / `actual` (JSON text), and a message naming the `after`, the selector and the field.
5. **Teardown**: `stop()`, `destroy()`, and removal of the injected styles.

#### C3. `smoke-command.ts` (FR-030–FR-032, FR-034, FR-035)

```ts
export type SmokeFormat = 'pretty' | 'github' | 'json' | 'ndjson';
export const SMOKE_FORMATS: readonly SmokeFormat[];           // :15-16, + 'ndjson'
export interface SmokeCommandOptions {                         // :18-24, plus:
  readonly timelines?: readonly string[];
  readonly scenario?: Scenario;
  /** ndjson: called with each line as it is produced */
  readonly writeLine?: (line: string) => void;
}
export async function smokeFile(file: string, options: SmokeCommandOptions): Promise<SmokeResult>;  // :61, now exported
export async function runSmoke(patterns: readonly string[], options: SmokeCommandOptions): Promise<SmokeOutcome>; // :41
```

- **`runSmoke` with a scenario**: after `expandPatterns`, the non-library files are counted with `isLibrary` (`check-command.ts:52`). With more than one, nothing is played, and the outcome is `{ output: 'eligian smoke: --scenario applies to one program file; these patterns match: <files>', exitCode: 2 }` (Q5).
- **`smokeFile`**: `compileFile`, then `smokeConfig(config, map, { ...options, host, names: timelineNames(program), sourceDir: path.dirname(file), listener })`. The catch (`:65-79`) gets `code: 'smoke-compile-failed'`.
- **ndjson**:
  - a `{ type: 'file', file }` line before each file;
  - `timeline`, `problem` and `step` lines, written through the listener as they happen, each with its `file`;
  - a last `{ type: 'summary', files, timelines, errors, warnings }` line.

  `output` is `''`, because the lines were already written. `file` values are absolute paths, because the tool needs them; `json` keeps `displayPath`.
- **json**: unchanged, except that each problem gains `code` (FR-031: "changes in one way only"). Step results are **not** added: the eval gate (FR-091) reads only the problems, and a failed assertion is a problem. Steps reach the tool through `ndjson` only.
- **pretty / github**: `prettyFile` and `githubLine` (`:112-146`) are not touched, so their output stays byte-identical (Step 0a).

#### C4. `dom-environment.ts` (FR-036)

- Adds `injectStyles(window, cssTexts: readonly string[]): () => void`. It appends `<style data-eligian-smoke>` elements to `head` and returns the function that removes them.
- `jsdom` stays a dynamic import (`:20`).

#### C5. `main.ts` smoke command (`:374-395`)

- New options: `.option('--scenario <file>', …)`, `.option('--timeline <name>', …, collect)` and `.option('--step-timeout-ms <n>', …)`. The `--format` help lists `ndjson`.
  - `--timeline` is repeatable, not variadic. The command declares `.argument('<patterns...>')`, and a variadic option (`<name...>`) would swallow the patterns after it: `eligian smoke --timeline A file.eligian` would read `file.eligian` as a timeline name. `collect = (value: string, previous: string[] = []) => [...previous, value]`, with no default value, so an absent option is `undefined` (all timelines).
- A missing scenario file or a schema failure prints a message to stderr and exits 2.
- ndjson (P14):
  - `const out = redirectConsoleToStderr()`;
  - `writeLine: line => out.write(`${line}\n`)`;
  - `await out.flush()` before `process.exit`.

### D. MCP tools (`packages/cli/src/mcp`)

All three tools:
- follow the Phase 1 tool shape: `NAME`, `DESCRIPTION`, `KEYWORDS`, `Parameters`, `Success`, `summarizeArgs`, `makeTool(ai)`, `handle(params, context)`, with `ToolContext` from `tools/check.ts:174-180`;
- are registered in `server.ts` (`Toolkit.make(...)` `:83-89`, `toolkit.toLayer({...})` `:90-111`) through the same `boundary` (telemetry, `catchDefects`, `failureHeader`; `:74-81`);
- annotate `.annotate(ai.Tool.Readonly, true).annotate(ai.Tool.Meta, { 'anthropic/maxResultSizeChars': 200000 })`, with no `alwaysLoad` (FR-002, Q8);
- put `header` = `` `eligian ${compiler} · eligius ${eligius} · ${NAME} · ${resolvedPath}` `` first in their `Success` struct;
- take `response_format: Schema.optionalKey(Schema.Literals(['concise', 'detailed']))`.

`KEYWORDS`:
- compile: `['compile', 'json', 'config', 'eligius', 'map']`;
- project: `['project', 'inventory', 'selectors', 'css', 'layout', 'locales', 'assets']`;
- smoke: `['smoke', 'play', 'scenario', 'runtime', 'click']`.

Each keyword appears in the first 200 characters of its description.

#### D1. `config-fragment.ts` (FR-013, SC-004(6)) — new `src/mcp/config-fragment.ts`

```ts
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
/** `value` with every `id` key removed at any depth (moved from generate-knowledge.ts:208) */
export function withoutIds(value: unknown): Json;
/** The probe fragment: actions by name, timelines by uri, initActions (moved from :221) */
export function configFragment(config: IEngineConfiguration): Json;
export type FragmentSelection =
  | { readonly timeline: number }                     // config index
  | { readonly action: string }                       // named action or event action name
  | { readonly mapActionId: string };                 // a line selection resolves to a map action id
/** One part of the config in the probe shape; with `map`, each action gains `source: { file, line, column }` */
export function fragmentOf(config: IEngineConfiguration, selection: FragmentSelection, map?: EligianMap): Json | undefined;
```

The generator imports `withoutIds` and `configFragment` from `../src/mcp/config-fragment.ts`; it already imports `../src/mcp/knowledge/render.ts` and `instructions.ts` the same way (`generate-knowledge.ts:45-48`). It calls them without `map`, so the probe output is byte-identical (SC-004(6)).

#### D2. `eligian_compile` (FR-010–FR-016) — `tools/compile.ts`

- **Parameters**: `{ path: String, select?: { timeline?: String, action?: String, line?: Int ≥ 1 }, view?: 'summary'|'fragment'|'full', includeMap?: Boolean, response_format? }`. There is no `explain`.
- `dependencies: [CompilerLock]`.
- **Flow**:
  1. `projectRoot`, then `resolveInputPath`.
  2. Read the file, with `toToolError('read', file)` (ENOENT is `not-found`).
  3. `isLibrary(source)` → `{ ok: false, library: true }`.
  4. Under `lock.run(requestId, …)`: `Effect.tryPromise(() => compileFile(file, { optimize: true }))`.
  5. On rejection, still under the lock: `checkPaths([file], { selectorNotInLayout: 'ids', lint: true, review: true })`, the defaults `eligian_check` applies (`optionsOf`, `mcp/tools/check.ts:73-78`; the call at `:114-118`), then `toMcpDiagnostics` (`diagnostics.ts:126`), errors only → `{ ok: false, diagnostics }`. This is FR-016: the same builder and options as `eligian_check`.
     - `lint` and `review` must be on. `withCompiledChecks` returns early when both are off (`check-command.ts:173`), and only past that point does it add the `compile-failed` error for a program that validates clean but does not compile (`check-command.ts:186-202`). With them off, such a program would give `{ ok: false, diagnostics: [] }`.
     - The cost is a second compile on the rejection path only. The review warnings it produces are dropped by the errors-only filter.
- **`summary`** (FR-012):
  - per config timeline i: `{ name: names[i], uri, type, duration, loop?, timelineActions: timelineActions.length }`, a raw count (Q6);
  - `actions` and `eventActions`: names;
  - `initActions`: a count;
  - `operations`: counted over every operation list;
  - `controllers` (P11);
  - `chars: compiled.json.length`;
  - detailed adds `cssFiles` and `languages` (`config.availableLanguages`).
- **`fragment`** (FR-013):
  - `select.timeline`: the index is `names.indexOf(name)`.
  - `select.action`: `config.actions`, then `config.eventActions`, by `name`.
  - `select.line`: among the `map.actions` entries whose `location` is in this file (`location.file` absent or equal), the one with the smallest span that contains the line. The end line is computed from `location.line` / `column` / `length` over the source text, because map locations span the whole node: the tour's `ch3Badge` is `{ line: 47, column: 1, length: 346 }` and ends on line 60 (probe).
  - Nothing selected → `ToolNotFound`. Its message lists the timeline names, the action names, or the line ranges of the two nearest actions.
- **`full`** (FR-014): `compiled.config` verbatim.
- **`includeMap`** (FR-015): the `EligianMapAction`s of the returned actions, keyed like the fragment. With `full`, it is `compiled.map.actions`.
- **Success**: `{ header, ok, library?, view?, summary?, fragment?, config?, map?, diagnostics? }`, with `Schema.Unknown` for `fragment`, `config` and `map`.

#### D3. `eligian_project` (FR-020–FR-027) — `tools/project.ts`, with `storyboard.ts`

```ts
// src/mcp/storyboard.ts
export interface StoryboardBeat { readonly timeline: string; readonly start: string; readonly end: string; readonly selector: string; readonly change: string; readonly endBlock: string }
export interface Storyboard { readonly beats: readonly StoryboardBeat[]; readonly interactions: number; readonly ignoredRows: number }
/** The §5 tables of a STORYBOARD.md: a table whose header is `| timeline | start | end | selector | change | end-block |` is a beat table, `| trigger | target | verb | timeline |` the interactions table; CRLF accepted; rows with another cell count are counted in ignoredRows. */
export function readStoryboard(text: string): Storyboard;
```

- **Parameters**: `{ path: String, response_format? }`; `dependencies: [CompilerLock]`.
- **`path`**: a file is that program. A directory goes through `expandPatterns([dir], root)` (which skips node_modules, `check-command.ts:93`), split by `isLibrary`. No `.eligian` file → `ToolNotFound`.
- **Per program, one locked section** (`lock.run`):
  1. `withLoadedDocuments([file], loaded => …)` (A1). Inside it, with `document = loaded.documentOf(file)` and `program = document.parseResult.value`:
     - **`files`** (FR-021): the entry; the libraries (`loaded.documents` minus the entry); the `layout`, `styles` and `locales` default imports and the named asset imports (`isDefaultImport`, root `index.ts`); the media `from` files; the host module (`hostModuleOf`, root). Each is `{ path, kind, exists }`; detailed adds `bytes`.
     - **`css`** (FR-022): `loaded.services.css.CSSRegistry.getClassesForDocument(uri)` and `getIDsForDocument(uri)`, as `selectorNames` reads them (`selector-sources.ts:56-58`).
     - **`layout`**: `layoutElementsOf(loaded.services, program, uri)` (`:38`).
     - **`selectors`**: `selectorNames(loaded.services, program, uri)` (`:51`). All sets are sorted into arrays.
     - **`locales`**:
       - `languages` = `program.languages?.entries.map(e => e.code) ?? []`, read directly. `extractLanguageCodes` is not used, because it returns the fallback `['en-US']` for a program with no `languages` block (`labels/types.ts:170-176`), a language the program never declared.
       - `keys`: the `locales` import's file, read with `fs`, `JSON.parse`d and passed to `extractTranslationKeys(json)` (`locales/translation-key-extractor.ts:40`), as the validator does (`asset-import-validator.ts:320-331`). Concise gives `keys: id[]`; detailed gives `{ id, languageCodes }[]`.
       - The read, the parse and the extraction are guarded inside the `use` callback, so a malformed `locales.json` (an ordinary user state) does not reject `withLoadedDocuments` and turn the call into `ToolInternal`. On a failure other than ENOENT: `keys: []`, and an `assets.problems` entry `{ code: 'locales-parse-failed', message, path, line, column }` at the `locales` import, with the code the validator uses for the same failure (`asset-import-validator.ts:333-338`). A missing file is `files[…].exists: false` and `keys: []`, with no problem entry (the validator already reports it as an error).
     - **`host`**: `hostOperations` (from `@eligian/language`, P1) / `hostControllers` / `hostFunctions` (`@eligian/language/mcp`) of the program → `{ name, parameters: { name, type?, optional }[] }`.
     - **`outline`** (FR-023): `new EligianDocumentSymbolProvider().getSymbols(document)`, mapped to `{ kind: <SymbolKind name>, name, detail, line, children? }`.
       - Per timeline symbol: `{ container, provider, from? }` from the matching `Timeline` node (`timelineNamed(program, name)`, `lsp/timeline-symbols.ts:70`).
       - Per action symbol: `parameters: { name, role? }[]` from `parameterRoles(action)` (`css/parameter-roles.ts:63`).
     - **`assets.problems`** (FR-024): `timelineFindings(program, file)` filtered to `ASSET_REVIEW_CODES` (A2), plus every named asset import whose file does not exist, with the validator's code for that case, `import_file_not_found` (`import-validator.ts:126`).
     - **The storyboard source**: `STORYBOARD.md` beside the program, read inside the same guard. Every read failure (ENOENT, EISDIR, EACCES) gives `storyboard: null`, as FR-025 states for an absent file; no new problem code is invented for it. `readStoryboard` itself does not throw: unknown tables and malformed rows are counted, not rejected.
     - Nothing inside the callback throws for a user state, so the `Effect.tryPromise` around it maps only genuine internal failures to `ToolInternal`, as the Constitution check states.
  2. After the documents are released, still in the lock: `compileFile(file)` in `Effect.tryPromise`. It leaves no document behind: `sourceToIR` releases on every path that reaches `compileWithMap`, and B1 covers the `AssetError` path (P2). Its result gives the per-timeline `duration` of the outline and the storyboard counts. A rejection gives `duration: null` and `timelineActions: null`.
- **`storyboard`** (FR-025):
  - per beat timeline, `{ timeline, beats, timelineActions }`, where `timelineActions` counts the config timeline's actions with `duration.end !== undefined` (Q6);
  - `unknownTimelines`;
  - `interactions`;
  - `ignoredRows`.

  An absent file gives `null`.
- **`detailed`** adds `starters` (`STARTERS`, `starters.ts:33`: name and description), `bytes`, and the language codes per locale key.
- **Success**: `{ header, root, files: ProjectFile[], programs: ProjectProgram[] }`.
  - The top-level `files` lists the directory's library files as FR-021 entries, `{ path, kind: 'library', exists: true }` (detailed adds `bytes`). This is FR-020's "library files are listed under `files`" and SC-005(5)'s "the library under `files`".
  - For a file input, the top-level `files` is `[]`; the libraries that program imports are in its own `programs[i].files` (FR-021).
  - A directory with only libraries gives those `files` and `programs: []`.

#### D4. `eligian_smoke` (FR-040–FR-046) — `tools/smoke.ts`

```ts
export interface SmokeToolOptions {
  /** The bin/cli.js the child runs; default fileURLToPath(new URL('../bin/cli.js', import.meta.url)) */
  readonly cliPath?: string;
  /** Test seam (SC-008(4)): called once the child is spawned */
  readonly onSpawn?: (pid: number, scenarioFile?: string) => void;
}
export const handle: (params, context: ToolContext & { readonly smoke?: SmokeToolOptions }) =>
  Effect.Effect<SmokeSuccess, ToolError>;      // no CompilerLock (FR-046)
```

- **Parameters**: `{ paths: Array(String) min 1, strict?: Boolean, timelines?: Array(String), scenario?: Union(Array(ScenarioStep), Scenario, String), assertions?: Array(Assertion), timeoutMs?: Int ≥ 1000, stepTimeoutMs?: Int ≥ 1, response_format? }`. The step and assertion schemas are C2's.
- **`cliPath` default**: `fileURLToPath(new URL('../bin/cli.js', import.meta.url))`, a string, as `spawn`'s argument array requires (a `URL` element throws `ERR_INVALID_ARG_TYPE`). In the bundle, `import.meta.url` is `dist/cli.mjs`, so it names `packages/cli/bin/cli.js` (and `node_modules/eligian/bin/cli.js` when installed). The in-process specs always pass `cliPath`; the spawned `mcp-stdout.spec.ts` smoke call (SC-008(5)) runs on the default, so the default is tested from the built server.
- **Inputs**:
  - `resolveInputPatterns(root, paths)`.
  - With a scenario or assertions, more than one non-library file → `ToolIoError` naming the files, and no spawn (Q5).
  - `assertions` without `scenario` → `ToolIoError` ("assertions need a scenario: they are evaluated against its steps"), no spawn. With no steps, every `after` would be out of range (C2 step 4).
  - A string `scenario`: `resolveInputPath`, read (`not-found` when missing), `parseScenario` (a failure is `ToolIoError` with the parse message). Without `assertions`, the resolved file is passed to the child as is and no temp file is written. With `assertions`, they are appended to the file's own `assertions`, re-checked with `parseScenario`, and the result is written to a temp file.
  - An inline scenario (array of steps, or `{ steps, assertions? }`) is merged with `assertions`, checked with `parseScenario`, and written to `path.join(os.tmpdir(), 'eligian-scenario-<pid>-<n>.json')`.
- **The temp file** (inline scenarios, and file scenarios with extra `assertions`): `Effect.acquireUseRelease(writeScenario, spawnSmoke, removeScenario)` (`Effect.d.ts:12798`). The release removes the file on success, failure, timeout and interruption (FR-041).
- **`spawnSmoke`** = `Effect.callback<ChildOutcome>((resume) => { … return Effect.promise(() => killAndWait(child)) })` (`Effect.d.ts:1724`). The returned Effect is the interruption canceler, so `notifications/cancelled` kills the child and waits for its exit (FR-043).
  - The child: `spawn(process.execPath, [cliPath, 'smoke', ...files, '--format', 'ndjson', ...(strict ? ['--strict'] : []), ...timelines.flatMap(t => ['--timeline', t]), ...(scenarioFile ? ['--scenario', scenarioFile] : []), ...(stepTimeoutMs ? ['--step-timeout-ms', String(stepTimeoutMs)] : [])], { cwd: root.root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })`, then `onSpawn(child.pid, scenarioFile)`.
  - stdout is split on `\n`. Each complete line is `JSON.parse`d into the line list; a non-JSON line goes to stderr with the `smoke: ` prefix (P14).
  - stderr: each line goes to `process.stderr.write('smoke: ' + line)` (FR-044). Nothing reaches `process.stdout`.
  - `setTimeout(timeoutMs)`: kill the child, wait for `exit`, resume with `{ lines, timedOut: true }` (FR-042).
  - On `exit`: resume with `{ lines, exitCode }`.
- **The result** (FR-045):
  - `files`: from the `file` and `timeline` lines.
  - `steps`: from the `step` lines. Concise: each step's `snapshot` keeps only the layout-id keys whose entry differs (deep-equal) from the previous step's, and step 0 is full; `activeTimelineActions` is always present. A removed element differs (`exists: false`, C2 step 3), so "absent key" always means "unchanged". Detailed: full snapshots. This is FR-005's smoke rule applied per key of the flat snapshot.
  - `problems`: the `problem` lines, turned into `McpDiagnostic`s (D5). After a timeout, a `smoke-timeout` error is added, anchored at line 1 of the first program.
  - `partial: true` after a timeout.
  - `ok`: no error problems, and not partial.
  - A child that exits 2 (a usage error) gives `ToolIoError` with the child's stderr text.

#### D5. `diagnostics.ts` (FR-045)

- `McpDiagnosticSource` (`:21-29`) and `MCP_DIAGNOSTIC_SOURCES` (`:52`) gain `'smoke'`.
- `McpDiagnosticSchema` (`:72`) gains `timeline?: String`, `time?: Number`, `step?: Int`, `expected?: String` and `actual?: String`.
- `sourceOf` (`:100`) returns `'smoke'` for the `SMOKE_CODES`, checked before the `validator` fallback.
- `smokeToMcpDiagnostics(problems: readonly (SmokeProblem & { file: string })[], overlays, readSource): McpDiagnostic[]`:
  - builds `CheckFileResult`s, with `line` / `column` from `location`, else 1 / 1 (FR-045);
  - calls `toMcpDiagnostics`;
  - adds `timeline`, `time`, `step`, `expected` and `actual`.

#### D6. `instructions.ts` (FR-003, FR-066; I-1)

```ts
export const MCP_PHASE = 2 as const;
export const INSTRUCTIONS: Readonly<Record<1 | 2, string>>;   // 1 kept for history; server.ts reads INSTRUCTIONS[MCP_PHASE]
export function agentsMdBlock(index: readonly IndexEntry[]): string;   // workflow + rules + docs pointer + FR-066 index
```

`WORKFLOW_PHASE_2` is the §3.5 final text, with the Phase 1 backtick convention and I-1 applied:

```
- `eligian_docs`: FIRST for a new presentation: ids `storyboard`, `decisions`, `project-layout`,
  then write STORYBOARD.md. Before each construct you have not written this session: its map-*
  card (index) or body (detail:true). Read `operations-index` once.
- `eligian_operations`: BEFORE calling any operation not in your session so far; batch with
  names:[...]. Cards lead with NEEDS / PROVIDES / ERASES.
- `eligian_init`: scaffold a new project from a starter (writes files; next steps in the reply).
- `eligian_project`: the ids, classes, locale keys, asset files and host names you may reference.
  Call before writing selectors; layout + CSS come before timelines.
- `eligian_check`: after EVERY edit until 0 errors and 0 warnings. Each diagnostic carries its fix.
- `eligian_fmt`: write:true once check is clean.
- `eligian_smoke`: after fmt; pass a scenario for every interaction you wrote (click, key, seek).
- `eligian_compile`: once after your first timeline passes check (select it), and whenever
  behaviour surprises you.
```

- The last line of `RULES` becomes the §3.5 one: "Review STORYBOARD.md against the compiled timelines before declaring done."
- `agentsMdBlock(index)` holds, in order:
  - the Phase 2 workflow and rules;
  - the docs pointer, which names `node_modules/eligian/dist/docs/` once;
  - `- <id>: <title> (<file>)` for every entry whose kind is neither `operation` nor `example`;
  - one line `Operations (generated/operations/<name>.md; overview: operations-index): <names, comma-separated>`;
  - one line `Examples (generated/examples/<id>.md): <ids>` (FR-066).

#### D7. `server.ts`

- `Toolkit.make(docs, operations, check, fmt, init, compile, project, smoke)`, with three new handler entries.
- `ServerOptions` gains `smoke?: SmokeToolOptions`, passed into the smoke handler's context. The specs set `cliPath` and `onSpawn` through it.
- No other change.

#### D8. `tools/init.ts` (FR-065, P12)

- Parameters gain `client?: Array(Literals(['claude','cursor','vscode','codex']))`, default `['claude']`.
- The handler calls `runInit(target, { …, agents: params.agents === false ? [] : clients, docsRoot: context.docsRoot })` (E2) and returns the `agentFiles` of its outcome.
- `agentFiles` (`:87`) and `writeIfAbsent` (`:111`) are deleted.
- `nextSteps` follows I-1 (no `explain`) and gains "call `eligian_project` before writing selectors".
- **`DESCRIPTION`** (`:23`) is rewritten. Today it says "plus .mcp.json, AGENTS.md and CLAUDE.md for agents" and "an existing agent file is never touched and is reported as skipped with the content it would get", which is the opposite of FR-065. The new text names the `client` input (claude, cursor, vscode, codex; default claude), says that each client's files are written (the AGENTS.md block for all of them), that existing agent files are merged (only the `eligian` server entry and the marked block change), and that each agent file is reported as `written`, `updated`, `unchanged` or `refused` (invalid JSON is left untouched). The `KEYWORDS` rule (first 200 characters) still holds.
- `mcp-init.spec.ts` asserts that `DESCRIPTION` names `client` and the four statuses, and contains neither "never touched" nor "skipped".

### E. Agent context (`packages/cli/src`)

#### E1. `agents.ts` (FR-060–FR-063, FR-066) — new

```ts
export type AgentClient = 'claude' | 'cursor' | 'vscode' | 'codex';
export const AGENT_CLIENTS: readonly AgentClient[];
export type ServerCommand =
  | { readonly form: 'node'; readonly cliPath: string }               // <project>/node_modules/eligian/bin/cli.js
  | { readonly form: 'npx'; readonly platform: NodeJS.Platform };
export type AgentFileStatus = 'written' | 'updated' | 'unchanged' | 'refused';
export interface AgentFileResult { readonly file: string; readonly status: AgentFileStatus; readonly message?: string }

/** { command, args } of the eligian server per client (FR-060, FR-063) */
export function serverEntry(client: AgentClient, command: ServerCommand): { readonly command: string; readonly args: readonly string[] };
/** The command rule of --print-config and agents setup: node when <cwd>/node_modules/eligian/bin/cli.js exists, else npx */
export function detectServerCommand(cwd: string, platform?: NodeJS.Platform, exists?: (p: string) => boolean): ServerCommand;
export function printConfig(client: AgentClient, cwd: string, platform?: NodeJS.Platform): string;

/** Pure merges (FR-061) */
export function mergeJsonServers(existing: string | undefined, key: 'mcpServers' | 'servers', entry: object): { content?: string; status: AgentFileStatus; message?: string };
export function mergeTomlTable(existing: string | undefined, table: string): { content: string; status: AgentFileStatus };
export function mergeMarkedBlock(existing: string | undefined, block: string): { content: string; status: AgentFileStatus };
export function mergeImportLine(existing: string | undefined, line: '@AGENTS.md'): { content: string; status: AgentFileStatus };

/** Writes every agent file of `clients` into `projectDir` (FR-060, FR-061) */
export function setupAgents(projectDir: string, clients: readonly AgentClient[], options: { readonly command: ServerCommand; readonly docsRoot: URL | string }): Promise<readonly AgentFileResult[]>;
```

- **Files per client**:
  - `claude`: `.mcp.json` (`mcpServers`) and `CLAUDE.md`;
  - `cursor`: `.cursor/mcp.json` (`mcpServers`) and `.cursor/rules/eligian.mdc` (frontmatter `description: Eligian presentation workflow` and `alwaysApply: true`, then the block);
  - `vscode`: `.vscode/mcp.json` (`servers`, the entry with `type: 'stdio'`) and `.github/copilot-instructions.md` (a marked block);
  - `codex`: `.codex/config.toml`;
  - `AGENTS.md` (a marked block) for every non-empty client set.
- **`serverEntry`**:
  - node form: `{ command: 'node', args: [cliPath, 'mcp'] }`, with `cliPath` from `path.join` (OS-native separators);
  - npx form: `{ command: 'npx', args: ['-y', 'eligian@^1.1', 'mcp'] }`;
  - npx form on `win32` for cursor, vscode and codex: `{ command: 'cmd', args: ['/c', 'npx', '-y', 'eligian@^1.1', 'mcp'] }` (`packages/cli/README.md:288-293`).
- **`mergeJsonServers`**:
  - `JSON.parse`; a failure gives `refused`, and the file is left untouched;
  - when the existing entry deep-equals the new one: `unchanged`, and nothing is written, so a 4-space CRLF file stays byte-identical on the second run;
  - otherwise only that key is set, and the file is written as `JSON.stringify(…, null, 2) + '\n'`: `updated`, or `written` for an absent file.
- **`mergeTomlTable`**:
  - the table spans from its `[mcp_servers.eligian]` header line (and any `[mcp_servers.eligian.<sub>]` header) to the line before the next other `[` header;
  - it is replaced, or appended after one blank line;
  - string values are written with `JSON.stringify` (TOML basic strings use the same escapes as JSON, which matters for Windows paths);
  - every other byte is unchanged.
- **`mergeMarkedBlock`**: replaces the text between `<!-- eligian:begin -->` and `<!-- eligian:end -->`, or appends the block after one blank line.
- **`mergeImportLine`**: adds `@AGENTS.md`, unless a line already equals it.
- **The block text** is `dist/docs/agents-block.md`, read from `docsRoot` (P13).

#### E2. `init.ts` (FR-064)

- `InitOptions` (`:14-20`) gains `agents?: readonly AgentClient[]` (default `['claude']`; `[]` is `--no-agents`) and `docsRoot?: URL | string`.
- `InitOutcome` (`:22-25`) gains `agentFiles?: readonly AgentFileResult[]`.
- After the starter files (`:64-68`), init calls `setupAgents(target, agents, { command: { form: 'node', cliPath: path.join(target, 'node_modules', 'eligian', 'bin', 'cli.js') }, docsRoot })` (Q7) and prints one output line per agent file.

#### E3. `main.ts` commands

- **`--client` is repeatable, not variadic** (as `--timeline`, C5). Both commands take a positional `[dir]`, and a variadic `<clients...>` would swallow it: `eligian init --client cursor my-dir` would read `my-dir` as a client and exit 2. The option is `.option('--client <client>', …, collect)` with no commander default; after parsing, an absent option becomes `['claude']` (a commander default plus an accumulator would append to it, giving `['claude', 'cursor']`). `--client cursor --client vscode` selects both.
- **`init`** (`:401-419`): `--client` as above, and `.option('--no-agents', …)`. An unknown client exits 2.
- **`agents setup [dir]`** (new):
  - `program.command('agents').command('setup').argument('[dir]', …, '.')`, with `--client` as above;
  - it runs `setupAgents(dir, clients, { command: detectServerCommand(process.cwd()), docsRoot })`;
  - it prints one line per file;
  - it exits 0, 1 when any file was `refused`, and 2 for an unknown client.
- **`mcp`** (`:459-465`): `.option('--print-config <client>')`. When given, the command calls `console.log(printConfig(client, process.cwd()))` and returns before the dynamic `import('./mcp/server.js')`. An unknown client prints to stderr and exits 2.

### F. Knowledge (`packages/cli/scripts`, `src/mcp/knowledge`)

- **F1. Kinds and overlays.**
  - `ChunkKind` (`knowledge/types.ts:6-13`) gains `'example'`.
  - `Overlays` gains `operations: Record<name, { card: string }>` and `controllers: Record<name, { status: 'recommended' | 'constrained' | 'do-not-use'; card: string }>`. The generator writes them into `overlays.json`, and `loadKnowledge` (`knowledge/load.ts:94`) reads them.
  - `render.ts`: `CONTROLLER_STATUS` and `STATUS_REASON` (`:20-28`) are deleted. `operationCard(signature, { host?, overlay? })` (`:64`) and `controllerCard(metadata, overlay?)` (`:103`) append the overlay card; the controller status comes from the overlay.
  - `eligian_operations` passes `knowledge.overlays.*[name]` to them.
  - `controllersChunk` (`generate-knowledge.ts:554-558`) lists every status from the overlays.
  - `docs.ts:113` lists `example` entries as `{ id, title }`, like operations (FR-075, FR-077).
- **F2. Generator** (`scripts/generate-knowledge.ts`):
  - Probes also run in `presentation-patterns` (`:317` becomes `id.startsWith('map-') || id === 'presentation-patterns'`) and in the operation and controller overlays (FR-073, FR-074).
  - `overlayFiles` (`:332`) is generalised to the three overlay directories: `diagnostics/` keeps the `code` / `source` frontmatter; `operations/` needs `operation`; `controllers/` needs `controller` and `status`.
  - `operationChunk` (`:466`) appends the operation overlay's body.
  - Examples:
    - the generator scans `examples/eligian-tour/*.eligian` and the `.eligian` text of every `starterFiles(name)` for `// @mcp-example <id> <title>` … `// @mcp-end`, CRLF accepted;
    - each marker becomes `generated/examples/<id>.md` (`kind: example`; the card is the title; the body is the fenced snippet and its source path);
    - an unclosed marker or a duplicate id throws, with the file and line (SC-013(8)).
  - `agents-block.md` = `agentsMdBlock(index)` (`:942`).
  - The diagnostics catalogue adds the `SMOKE_CODES` (source `smoke`), the nine `REVIEW_CODES`, and `unknown-listener-action` (registry).
- **F3. Ranking** (FR-073, I-9):
  - `scripts/rank-operations.ts` (tsx; `pnpm -C packages/cli rank:operations`) writes `scripts/operation-ranking.json`: `{ counts: { name, count }[], selection: string[25] }`.
  - The corpus is the root `check:examples` globs (`package.json:25`, so without `examples/demo.eligian`), plus the `.eligian` files of the four starters.
  - Each program is parsed with `parseSource`; libraries with the shared `LangiumParser`, as in Phase 1 C5.
  - Every `OperationCall` whose name resolves to a registry operation is counted: `getOperationSignature(name)` is defined, and no action of that name is callable from the call site. Ties are broken by name.
  - The spec asserts that the committed file equals a fresh run.
- **F4. Curriculum**:
  - the 16 FR-070 chunks;
  - 25 `operations/<name>.md` overlays, from the ranking;
  - 9 `controllers/<name>.md` overlays (`CONTROLLERS`, `controllers.generated.ts:29`): `RoutingController` is `do-not-use` (from `:190`), `LottieController` is `constrained`, and the rest are `recommended`;
  - diagnostics overlays (FR-076) for the 7 new review codes, the 16 `SMOKE_CODES` and `unknown-listener-action`.

  The C chunks cite `(probed: "<title>")` markers. Each new runtime claim gets a `CLAIMS` entry, a probe test in `mcp-runtime-claims.spec.ts`, and the marker in `ELIGIUS_EXECUTION_MODEL.md` (FR-071, SC-014).
- **F5. Example markers** in `examples/eligian-tour/tour.eligian`: comments only. `check:examples` and `fmt:examples` are run again afterwards.

### G. Eval cases (FR-090, FR-091)

- `evals/mcp/cases/{title-card,three-chapters,staggered-list,keyboard-deck,library-reuse}.json`, each with:
  - `"model": "claude-sonnet-5-5"`;
  - no start directory;
  - `"scenario": "<id>.scenario.json"`, a file beside it holding steps and assertions in the C2 format, without the determinism parts.
- `run.ts` skips the copy when `cases/<id>/start` does not exist (`run.ts:156`).
- `gate.ts` step 3 (`:539-542`) adds `--scenario <abs scenario>` when the case has one.
- `gate.ts` step 4 gets one inline function per case id, for the §6.2 Structural column (I-7). It reads `out/config.json` and the files.

## Data and generation design

| Output (under `dist/docs/`) | Source | New in Phase 2 |
| --- | --- | --- |
| `index.json` | every chunk's frontmatter | `kind: example` entries; the 16 new chunks |
| `overlays.json` | `curriculum/{diagnostics,operations,controllers}/*.md` | `operations`, `controllers` maps (F1) |
| `agents-block.md` | `agentsMdBlock(index)` | the FR-066 index; ≤ 8,192 bytes |
| `curriculum/<id>.md` | hand-written + spliced probes | B, C, D chunks (FR-070); probes in `presentation-patterns` |
| `generated/operations/<name>.md` | registry + `curriculum/operations/<name>.md` | the overlay body for the 25 ranked operations |
| `generated/controllers.md` | `CONTROLLERS` + controller overlays | every status from the overlays |
| `generated/examples/<id>.md` | `// @mcp-example` markers | new (FR-075) |
| `generated/diagnostics.md` | `DIAGNOSTIC_CODES`, `REVIEW_CODES`, `SMOKE_CODES`, lint rules | smoke + review codes |

Committed inputs: `scripts/operation-ranking.json` (F3), `src/__tests__/__fixtures__/mcp/missing-overlays.json` (Phase 1 allowlist; it may only shrink, FR-076). The drift test stays Phase 1's: generate twice into temp dirs, compare, and assert the names (`mcp-knowledge.spec.ts`).

## Test plan

Conventions:
- CLI specs live in `packages/cli/src/__tests__/`, with fixtures in `__fixtures__/mcp/<topic>/`. Language specs sit next to the code they test.
- In-process MCP calls go through `mcp-test-client.ts` (`startInMemoryServer(options)`, `callTool`). Spawned servers use `spawnServer`.
- **A fresh bundle is a hard precondition** (SC-006). A helper `requireFreshBundle()` in `src/__tests__/fresh-bundle.ts` throws "run `pnpm -C packages/cli build`" when `dist/cli.mjs` is missing, or older than any file of the bundle's input graph: every file under `packages/cli/src/**`, `packages/language/src/**` and `packages/shared-utils/src/**`, excluding `__tests__/` and `__fixtures__/` directories. `esbuild.mjs` inlines `src/main.ts` and every workspace source, and the spawned specs depend on code outside `src/smoke/` and `src/mcp/`: the new `--scenario` / `--timeline` / `--step-timeout-ms` options, the ndjson console redirect and `await out.flush()` (C5, P14) are in `src/main.ts`; B1 is in `compile-file.ts`; B2/B3 in `check/`; A1–A3 in the language package. This is a superset of SC-006's "any file under `src/smoke/` or `src/mcp/`". The new spawn-based tests call it in `beforeAll`; they do not use `skipIf(!built)`.
- **Coverage**: the child is not measured by v8, so every smoke and scenario branch also has an in-process test through `runSmoke` / `smokeFile`, as `smoke.spec.ts` does today.

| SC / FR | Spec file | describe › it | Strategy |
| --- | --- | --- | --- |
| SC-001, FR-001, FR-095 | `ci.yml` gates; `mcp-server.spec.ts` | `tool surface` › `lists exactly eight tools` | In-process `listTools()` gives the sorted eight names. CI: the two `want=` strings (`ci.yml:63-67`, `:128-129`) list the eight names; `compliance.md` quotes the printed `tools/list:` line (Windows local, `ubuntu-latest`) |
| SC-002 (1)(2) | `mcp-server.spec.ts` | `annotations` › `three upfront, three readonly with maxResultSizeChars`, `budgets` › `deferred descriptions ≤ 16384 and KEYWORDS in the first 200`, `smoke description carries the security note and the paths/timelines advice` | `listTools()`. For compile, project and smoke: `_meta['anthropic/maxResultSizeChars'] === 200000`, `readOnlyHint === true`, no `alwaysLoad`. No response holds a `truncated` key |
| SC-002 (3), FR-004 | `mcp-server.spec.ts`, `mcp-telemetry.spec.ts` | `header first` › each tool; `telemetry` › `one line per call for compile, project, smoke`; `errors` › `missing path is not-found` | `content[0].text.startsWith('{"header":')`; the stderr spy counts one line with `tool` = the name; a missing path gives `isError`, kind `not-found` |
| SC-003, FR-003 | `mcp-instructions.spec.ts` | `phase 2 instructions` › `≤ 4096`, `equals the §3.5 text with I-1`, `backticked tokens are tools or ids`, `names all eight tools`; the Phase 1 test at `:35` is removed | The I-1 text is stored in the spec as the expected string; ids come from a generated docs dir |
| SC-004, FR-010–FR-016 | `mcp-compile.spec.ts` | `eligian_compile` › `summary` (the raw count includes the lifecycle action), `fragment by timeline / action / line` (0 `id` keys by a recursive walk; the expected names; `source` present), `full deep-equals compileFile().config`, `error program equals check's errors (code, line, column)`, `validates clean but compileFile rejects: the compile-failed error equals check's` (fixture `asset-rejected/`, Step 0e), `unknown selection lists the names`, `line outside every action → not-found listing the two nearest ranges`, `includeMap adds the EligianMapAction of each returned action, keyed like the fragment (and map.actions with full)`, `detailed ⊇ concise (summary, fragment)`, `library file`, `missing file`; `compileFile` › `releases its libraries on an asset rejection` (B1) | Fixtures in `__fixtures__/mcp/compile/`. ⊇ is checked with a helper `expectSuperset(concise, detailed)` that skips `header`. The B1 case counts the **root** `getOrCreateServices().shared.workspace.LangiumDocuments.all.count()` before and after `compileFile` on `asset-rejected/` (which imports a library) and expects the baseline; it fails on today's code. The `includeMap` case compares each `map[key]` with `compileFile().map.actions[id]` for the action's id |
| SC-004 (6) | `mcp-knowledge.spec.ts` | the existing probe snapshot tests | Unchanged snapshots after `config-fragment.ts` is introduced |
| SC-005, FR-020–FR-027 | `mcp-project.spec.ts` | `eligian_project` › `names` (exact sets; `locales.languages` is `['en-US','nl-NL']`), `no languages block → locales.languages []` (not the `en-US` fallback), `outline equals the expected tree` (symbol tree; D's `container` / `provider` / `duration`; an action parameter whose role is `selector`), `assets.problems is exactly the seeded three`, `missing named asset import`, `malformed locales.json → keys [] and one locales-parse-failed problem, no isError`, `storyboard counts ranged actions only` (and compile reports one more), `unknown beat timeline and a 5-cell row are counted` (`unknownTimelines`, `ignoredRows`), `storyboard on a non-compiling program gives timelineActions null` (and `duration: null`), `detailed ⊇ concise`, `directory input` (two programs + a library: the library in the top-level `files` with `kind: 'library'`; libraries only: `files` and `programs: []`; empty → not-found), `releases every document and writes nothing` | Fixture `__fixtures__/mcp/project/`: `main.eligian` (timelines A `video from "./media/present.mp4"`, B `video from "./media/present.mp4"` (duplicate), C `audio from "./media/missing.mp3"`, D `raf` in `".ghostc"`, the last one with `on enter`; an action `highlight(target)` whose `target` reaches `selectElement`), a layout, two CSS files, `locales.json` (en-US, nl-NL), `lib/anim.eligian`, `host.ts`, `STORYBOARD.md` (one beat row for an undeclared timeline, one 5-cell row), `media/present.mp4` (an empty committed file). Siblings: `no-languages/main.eligian`, `bad-locales/` (`locales.json` with a trailing comma), `no-compile/` (validates, compile rejects: the Step 0e fixture shape, plus a `STORYBOARD.md`). The document count comes from the **root** `getOrCreateServices().shared.workspace.LangiumDocuments.all.count()` (P1) before and after; every fixture file's bytes and mtime are hashed before and after |
| SC-006, FR-030–FR-032, FR-035 | `smoke.spec.ts` (extended), `mcp-smoke.spec.ts` | `eligian smoke` › the existing `json` expectations gain `code` (`:88` and siblings); `ndjson lines parse in order`; `every problem has a SMOKE_CODES code`; `--timeline A`; `--timeline A placed before the pattern still plays only A` (spawned: `['smoke', '--timeline', 'A', fixture]`, guarding C5's non-variadic option); `--timeline nope` (one problem, exit 1); `json has no steps key with a scenario` (FR-031); `--step-timeout-ms 1` (`smoke-step-timeout`); `streams before the summary` (spawned) | The pretty and github expectations stay untouched. Streaming: `spawn(bin, ['smoke', fixture, '--format', 'ndjson', '--scenario', wait3000.json])`; on the first `timeline` line, `child.exitCode === null` and no `summary` yet; then kill, and every complete line parses |
| SC-007, FR-033, FR-034, FR-036 | `mcp-scenario.spec.ts` (in-process `runSmoke`) | `scenario` › one `it` per step kind; `wrong assertion: expected/actual, exit 1`; `class-driven visible against injected CSS`; `host op returning undefined: exactly one host-operation-returned-non-object at the call site`; `selector / unknown timeline / media step: one problem each` (media: `raf-plus-media.eligian`, a raf timeline plus a video timeline, scenario `[{ navigate: <the video's name> }, { snapshot: 'after' }]`: exactly one `scenario-media-timeline` with `step: 0`, the step result's `timeline` still the raf one); `media-only program + a scenario: exactly one problem` (`scenario-media-timeline`, `step: 0`, no step results); `key target order` (3 fixtures); `visible false via hidden and via ancestor display none`; `removed element: exists false and visible false at the next step` (a `seek` into an event whose start operations select a layout id and run `removeElement`, a registry operation in `registry.generated.ts`); `pause, wait 300, play: sameAs then greaterThan`; `snapshot shape` (flat: one key per layout id plus `activeTimelineActions`; text cut at 200; `controllers` lists `DOMEventListenerController`; `activeTimelineActions` names the running action); `assertion rules` (`.cls` selector, `after` naming no label, element field without selector: each exit 2 with nothing played; `#not-in-layout`: one `scenario-selector-not-found`); `two program files: exit 2, nothing played`; `one program + a library runs` | Fixtures in `__fixtures__/mcp/scenario/`; scenarios inline in the spec. The host fixture is `host.ts` with `export const operations = { bad(data) { return undefined } }` |
| SC-008, FR-040–FR-046 | `mcp-smoke.spec.ts`, `mcp-stdout.spec.ts` (extended) | `eligian_smoke` › `matches the CLI json` (problems compared by code / line / message), `timeoutMs 1000 → partial within 3 s, ≥ 1 timeline`, `cancel kills the child, no frame`, `temp file gone and pid dead in 4 cases`, `stdout stays pure NDJSON` (spawned server, **default `cliPath`**: the result holds ≥ 1 timeline, so the default resolved and the child ran), `concise vs detailed steps` (the FR-005 rule checked per key of the flat snapshot, on a scenario in which a layout element is removed between two steps: the concise step carries that id with `exists: false`), `parallel calls: two pids, results equal baselines`, `child stderr prefixed`, `non-JSON stdout line goes to stderr`, `assertions without scenario: io, no spawn`, `scenario with two programs: io, no spawn` | In-process server with `smoke: { onSpawn }`. Pid check: `expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))`. Cancellation: raw `notify('notifications/cancelled', { requestId })`, then wait 2 s with no frame for that id. Stderr (FR-044): a host module's `console.error` cannot be used, because `captureRuntime` is installed before `loadHostModule` (`smoke-runner.ts:99`, `:105-107`) and turns it into a `smoke-console-error` problem on stdout (`:228-233`). Instead, `cliPath` points at a stub `__fixtures__/mcp/smoke/stub-cli.mjs` that writes two known lines to stderr, one non-JSON line and valid ndjson (`file`, `timeline`, `summary`) to stdout, then exits 0. The `process.stderr.write` spy expects exactly `smoke: <line>` for the two stderr lines and the non-JSON one, and the call's result and every protocol frame are checked not to contain them. After a kill on Windows, `tasklist /FI "IMAGENAME eq esbuild.exe"` is recorded in compliance (the esbuild service exit) |
| SC-009, FR-050, FR-051 | `packages/language/src/compiler/__tests__/timeline-review.spec.ts`, `review.spec.ts`, `init.spec.ts`, `check:examples` | `timelineFindings` › positive/negative per code; `reviewConfig` › `host-operation-in-block-without-select` (positive in a timeline event; positive in a named-action body, per FR-050 as written (OQ-1); `target`; `with`; `selector`-parameter exemption), `lottie-web-not-installed`; `container cases via checkPaths` › `#ghost default → selector_not_in_layout only`, `.ghostc with off → timeline-container-not-in-layout only`, `no layout → 0`; `entry-timeline-without-enter` (the two-timeline positive and negative; `chain-test` content → 0); `init.spec` › `video starter: exactly media-file-missing on ./media/intro.mp4` | Each positive fixture provides the media files it does not test; the line of the expected warning is asserted. `git diff --stat -- examples` is empty (compliance) |
| SC-010, FR-055 | `packages/language/src/__tests__/listener-action-names.spec.ts`; `check-codes.spec.ts` (CLI) | `unknown-listener-action` › `unknown names: exactly 2, one per string`, `known names (end: stripped): 0`, `tour stays clean`; CLI › `reported with an unrelated error present` | Fixtures `packages/language/src/__tests__/__fixtures__/listener-actions/{unknown-names,known-names,with-error}.eligian` + `layout.html` (the spec's SC-010 programs). Checked with `checkFiles([fixture])`, since the layout import needs a real path |
| SC-011, FR-060–FR-065 | `agents.spec.ts`, `mcp-init.spec.ts` | `merge` › `json keeps other servers (4-space CRLF)`, `toml bytes outside the table`, `marked blocks`, `second run unchanged and byte-identical`, `invalid json refused`; `printConfig` › each client parses (`JSON.parse` / a 20-line TOML table reader in the spec), `win32 npx forms`, `node form when installed`; `agents setup` › exit 0 / 1 / 2 (in-process `runAgentsSetup`, plus one spawned run for exit codes), `--client cursor placed before [dir] writes into dir` (spawned, guarding E3's non-variadic option; same for `init --client cursor <dir>`); `mcp --print-config` (spawned, `node bin/cli.js mcp --print-config <c>` for each of the four clients, behind `requireFreshBundle()`) › `exit 0 and the whole stdout parses` (`JSON.parse`; the TOML table reader for codex), `unknown client: exit 2 and empty stdout`; `eligian_init client cursor` › the three files with statuses; `init without node_modules writes the node form` | Platform passed as a parameter (`win32` / `linux`). Paths checked with `path.win32` / `path.posix`. The spawned `--print-config` runs measure the command's stdout (SC-011(4)), so anything `main.ts` or its imports print before `printConfig` fails them |
| SC-012 | `init.spec.ts`; manual | `init writes .mcp.json to <abs>/node_modules/eligian/bin/cli.js`, `--no-agents writes no agent file`; manual `claude mcp list` (quoted) | — |
| SC-013, FR-070–FR-077 | `mcp-knowledge.spec.ts` | `curriculum` › `ships the FR-039 + FR-070 chunks` (the kind counts at `:470` become `{ orientation: 5, mapping: 11, runtime: 5, workflow: 8 }`: the six B chunks are `mapping`, the three C chunks `runtime`, the seven D chunks `workflow`), word limits, probes, `ranking equals a fresh run and the 25 have overlays`, `9 controller overlays (status, card ≤ 120 words, compiling probe)`, `one example file per marker`, `new codes have overlays; allowlist not larger`, `index ≤ 12000 chars`, `generator fails on an unclosed marker / a duplicate id` (generator run on a temp curriculum + temp tour copy), `see: example ids exist` | Runs `generateKnowledge` in `beforeAll`, as today |
| SC-014, FR-071 | `mcp-knowledge.spec.ts` (`:477-502` changed), `mcp-runtime-claims.spec.ts` | `runtime chunks teach only probed claims` uses the explicit list `['runtime-engine-lifecycle','runtime-scheduling','timing-models','runtime-quirks','runtime-state-pitfalls']` instead of the `runtime-` prefix | New `CLAIMS` entries with probes |
| SC-015, FR-085 | `mcp-staleness.spec.ts` | `between calls` › CSS (check: `unknown_css_class` disappears; project: `css.classes` changes), layout (check: `selector_not_in_layout` disappears; project: `layout.ids`), locales (project: `locales.keys`; check: the label-ID diagnostic disappears), library (compile: the library action's operations change; check: a diagnostic caused by the library disappears after the edit, an imported action called with two arguments that the library first declares with one parameter and then with two; project: the entry's `files` gains a second library after the first library is edited to import it) | User story 6 and FR-085 name `eligian_check` among the tools; the library check case goes through `checkFiles`' library walk (A1) and `compileFile` (B1), so a stale library document in the shared workspace (`parser.ts:58-66`) fails it. Every tool of FR-085 sees the library kind at least once. One in-process server per kind; files in a temp copy, edited with `fs.writeFileSync` between the two calls |
| SC-016, FR-090, FR-091 | harness; `eval-cases.spec.ts` | `phase 2 cases` › `each case parses and its scenario decodes with parseScenario` | `tsx evals/mcp/run.ts --case <id> --arm A1`; results committed and quoted |
| SC-017 | `mcp-concurrency.spec.ts` | `the compiler lock` › `check, compile and project at once equal sequential (20 iterations)`, › `compile and project wait on the lock` | The Phase 1 hooks (`compilerLockLayer`); the overlap metric of `:242` |
| SC-018, FR-096 | `package-bin.spec.ts` | the static-import test (`:184-194`) regex gains `eligius(?!/)`; `npm packs …` file list | The packed list gains `dist/docs/generated/examples/*`, `dist/docs/overlays.json` |
| SC-019, FR-066 | `agents.spec.ts` | `AGENTS.md block` › `≤ 8192 bytes`, `every non-operation non-example id with title and path`, `every operation and example by name`, `both path patterns` | `Buffer.byteLength(read('agents-block.md'))`; the size is quoted in compliance |
| SC-020, FR-056, FR-057 | compliance (manual) | — | Lottie: a probe project in the scratchpad with `npm install lottie-web`. `compile --bundle` and `dev` are loaded in a headless Chromium (the build agent's browser tool), and the `<svg>` `outerHTML` and console log are recorded. `smoke --strict` exits 0. A fourth run without `lottie-web` records the warning. AGENTS.md readers: the official docs URLs of Claude Code (memory / CLAUDE.md page), Cursor (rules), VS Code Copilot (custom instructions), Codex (AGENTS.md), with the date |
| SC-021 | gates | — | See "Build integration" |
| SC-022, FR-056 | `review.spec.ts`, `package-bin.spec.ts`, `mcp-knowledge.spec.ts` | `lottie-web-not-installed` › `tmpdir project without lottie-web: exactly one warning at the addController call`, `with node_modules/lottie-web/package.json: 0`; `lottieInstalled` unit (injected `exists`) | The project is built under `os.tmpdir()` (P9); `dependencies` has no `lottie-web` |

## Build integration

### `packages/cli/package.json`

- `scripts`: add `"rank:operations": "tsx scripts/rank-operations.ts"`. `build`, `build:prod` and `prepack` are unchanged: `esbuild.mjs` already runs the generator after the production `rmSync` (`esbuild.mjs:81-97`).
- `files`: unchanged (`"dist/docs/**"` already covers the examples and overlays).
- `dependencies` / `devDependencies`: unchanged. `lottie-web` is not added (FR-056, Q4).

### `packages/cli/esbuild.mjs`

No change. `WORKSPACE_SOURCES` already maps `@eligian/language/mcp` (`:37`). Everything new imports from `@eligian/language` or `@eligian/language/mcp`.

### `packages/language`

- `package.json` exports: unchanged (`./mcp` exists).
- New `src/compiler/timeline-review.ts`, `src/validators/operation-call/listener-action-validator.ts`; `src/compiler/index.ts` and `src/mcp.ts` gain the exports of P1 / A4.
- `pnpm -C packages/language build` regenerates `out/*.d.ts` and both bundles.

### Repo files

- **`.github/workflows/ci.yml`**: both `want=` strings (`:67`, `:129`) become `'eligian_check eligian_compile eligian_docs eligian_fmt eligian_init eligian_operations eligian_project eligian_smoke'`. Nothing else changes; the CI order already builds before testing (`ci.yml:59-60`).
- **`.github/workflows/publish-cli.yml`**: unchanged. The `eligian_docs` call stays (`:95-98`).
- **Root `AGENTS.md`**:
  - line `:47`: the `video` starter carries one `media-file-missing` warning until `media/intro.mp4` exists (FR-051);
  - line `:49`: "Five tools: …" becomes the eight names (P16); nothing else on the line changes;
  - line `:94`: `tools/ (docs, operations, check, fmt, init)` becomes the eight (P16).
  - No new Commands line: `smoke --scenario` / `--format ndjson`, `agents setup` and `--print-config` are documented in `packages/cli/README.md` (FR-097), which is what the spec asks for.
- **`starters.ts:51`**: the video note adds "until then `eligian check` reports `media-file-missing`".
- **`packages/cli/README.md`**: the three tools, `agents setup`, `--print-config`, `init --client` / `--no-agents`, `smoke --scenario` (the format) and `--format ndjson`, the security note, and the FR-057 finding (FR-097).
- **`CHANGELOG.md`** "Unreleased": Added (the three tools, scenarios, ndjson, `agents setup`, `--print-config`, the review checks, `unknown-listener-action`, the curriculum); Changed (smoke `json` problems carry `code`; `init` writes agent files; `eligian_init` merges agent files).
- **`specs/058-mcp-server/roadmap.md`**: the §2 marker settled by FR-057; the three generated chunks added to the §7 Phase 3 Touches (FR-099).
- **`packages/cli/AGENTS.md:34`**: "`tools/` (the five tools)" becomes "(the eight tools)" (P16). No other edit: the smoke child, `--format ndjson` and the fresh-bundle rule are not documented there, because no FR asks for it (Constitution XII); the fresh-bundle rule is enforced by `requireFreshBundle()`'s own message.

### Gates (in order; each output quoted in `compliance.md`)

1. `pnpm build`, `pnpm typecheck`, `pnpm run typecheck:tests`.
2. `pnpm check` (0 / 0) and `pnpm run ci`.
3. `pnpm effect:check:language`, `pnpm effect:check:cli` (0 / 0 / 0). The Effect code touched: `mcp/tools/{compile,project,smoke,init}.ts`, `mcp/server.ts`, `mcp/stdio.ts`, `compile-file.ts`, `check/check-command.ts`, `language/compiler/pipeline/check.ts`.
4. `pnpm test`, then the built-artifact specs with no skips: `pnpm -C packages/cli exec vitest run src/__tests__/{package-bin,mcp-stdout,mcp-paths,review,check-command,mcp-smoke,smoke}.spec.ts`.
5. `pnpm -C packages/language test:coverage:ci` and `pnpm -C packages/cli test:coverage:ci`, both at or above their thresholds.
6. `pnpm run check:examples`, `pnpm run fmt:examples`, `pnpm run smoke:examples`.
7. `pnpm -C packages/cli run build:prod`, `pnpm -C packages/cli pack`, and the CI tarball step run locally (`tools/list` = eight names).
8. The manual items: SC-012 (`claude mcp list`), SC-016 (eval cases 1, 2, 3, 6, 8; plus one Opus run), SC-020 (FR-056 runs, FR-057 URLs).

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Concurrency on the Langium singleton: project loads documents and fills the CSS registry; compile parses and compiles | wrong or flaky diagnostics | Compile and project run fully inside `CompilerLock.run` (FR-004). `withLoadedDocuments` releases in a `finally`; `compileFile` already releases through `sourceToIR`, and B1 closes the `AssetError` path (P2). SC-017 adds compile and project to the 20-iteration concurrency spec |
| Two Langium singletons under vitest (P1) | SC-005(6) / FR-085 would read a workspace the tools do not use | Workspace helpers and `getOrCreateServices` for tests come from the root entry; the `mcp` entry gets only stateless functions |
| jsdom globals (`installGlobals`, `dom-environment.ts:88-109`) and smoke's console patching | a server corrupted by globals and patches | The server never runs the engine (FR-041); `eligian_smoke` spawns. In-process specs that run `runSmoke` live in their own spec files (vitest isolates files), as `smoke.spec.ts` does |
| stdout pollution in the child (Langium / Typir / eligius logs outside `captureRuntime`) | broken NDJSON | ndjson mode redirects the console to stderr for the whole command (P14); the tool ignores non-JSON lines and copies them to stderr |
| stdout pollution in the server | protocol corruption | Unchanged Phase 1 redirect; `mcp-stdout.spec.ts` extended with a smoke call (SC-008(5)) |
| Truncated ndjson at exit on Windows pipes | lost summary line | `out.flush()` before `process.exit` (P14); SC-006(2) parses every line on Windows locally |
| Orphaned child or esbuild service after a kill | leaked processes | `killAndWait` waits for `exit`; the `ESRCH` check (SC-008(4)); esbuild's service exits when its parent's stdin closes, checked with `tasklist` on Windows after the timeout test (compliance) |
| Startup time | client timeout | The new tool modules import no `jsdom`, no `eligius` engine, no `esbuild` at top level; `scenario.ts`'s imports of `eligius` / `jsdom` are type-only, and `dom-environment.ts` imports jsdom dynamically; `package-bin.spec.ts` extends the static-import test with bare `eligius` (SC-018) |
| Real-time scenario flakiness (raf in jsdom, `wait` in real ms) | flaky SC-007 | `POSITION_TOLERANCE_S = 0.1`; specs use `wait ≥ 300` before `greaterThan`; `sameAs` is used after `pause`; seeks are asserted with the tolerance |
| `lottie-web` hoisted in the repo (P9) | false negative in SC-022 | Fixture under `os.tmpdir()`; the check walks for `node_modules/lottie-web/package.json` only |
| Review checks firing on examples | `check:examples` red under `--max-warnings 0` | Survey this session: no example has a media timeline or a raw listener `addController`; the tour has nine timelines whose first (`Hub`) has `on enter`, and its one host call (`stampTime(selector)`, `tour.eligian:108`) is exempt (I-3). Gate 6 runs after B2, before anything else depends on it |
| `host-operation-in-block-without-select` on named actions that rely on the caller's selection | warnings on programs that run correctly | FR-050 as written covers them (B2). The overlay names the fix; no example is affected (only the tour has a host module, and its operation is exempt). Excluding them needs an FR-050 ruling (OQ-1) |
| Windows paths in agent configs and the child | broken snippets or spawn | `path.join` for the node form; `cmd /c` for the npx form on win32 (README finding); `spawn` with an argument array and `shell: false` |
| Coverage thresholds (language 79.8 / 80 / 69.9 / 79; CLI 77.1 / 77.6 / 64.5 / 76.6) | CI red | New language modules have their own specs (`timeline-review.spec.ts`, `listener-action-names.spec.ts`); `withLoadedDocuments` is covered through `checkFiles`. CLI: scenario and smoke branches are run in-process; the tools are covered in-process (the child is not measured); `scripts/` is outside coverage `include` |
| AGENTS.md block budget (8,192 bytes) | SC-019 red | The Verification record projects 6.5–7 KB; the spec asserts the bound from the first generator change, so curriculum titles stay short |
| Index budget (12,000 chars) with 16 new chunks | SC-013(7) red | Cards ≤ 60 words on average for the new chunks, measured by the same assertion from Day 7 |

## Complexity tracking

None.

## Open questions

- **OQ-1** (B2, FR-050), to be ruled **before group B is built**: the plan follows FR-050 as written and checks every block, named-action bodies included. A called action inherits the caller's selection (CLAIMS[1]), so a named action that relies on it runs correctly but is reported. The options for the user are:
  - (a) keep FR-050 as written (the plan's current design and `review.spec.ts` case);
  - (b) exclude named-action bodies: FR-050's row is amended first, with the CLAIMS[1] reason, then B2 skips `config.actions` and the `review.spec.ts` case flips to "named action not reported";
  - (c) the call-site variant: a named-action body is reported only when some call site has no `selectElement` before the call in its own block (`walkOperations`, `@eligian/language/mcp`). FR-050's row is amended first.

  The plan does not narrow FR-050 on its own reading. Per the phase rules, any ruling goes into the FR-050 row before the build.

## Review notes

Review round 1 (spec-coverage, effect-and-bundle, reuse-reality lenses). All 22 issues were applied; none was rejected. Where an issue offered alternatives, the choice made:
- Scenario media handling (major): the media check runs against the full `config.timelines` before a step (C2 step 0); the early return skips the walk only (C1). Two SC-007 fixtures pin it.
- FR-044 stderr test (major): the `cliPath` stub, not a host-module `console.error`, which `captureRuntime` turns into a problem.
- Snapshot shape (major): flattened to FR-034 item 4's shape, with `exists` so a removed element is a change. The spec is not amended; FR-005's per-key rule now applies as written. `exists` is an added field of the element entry, recorded in `compliance.md`.
- Library staleness (major): check and project cases added.
- Compile rejection diagnostics (major): `checkPaths` with `eligian_check`'s own defaults (`lint: true, review: true`), so `compile-failed` is produced by the same code.
- P2 / B1 (two issues): P2 corrected (the leak is the `AssetError` path only); B1 narrowed to `releaseMain()` + a `finally release()`, with a test that fails on today's code.
- FR-031 `steps`: dropped from `--format json`; FR-031 is not amended.
- Docs (Constitution XII): the unrequired doc additions are removed. The three tool-count lines are kept as corrections of now-false statements (P16), not new docs.
- OQ-1: the plan now follows FR-050 as written and asks for a ruling before group B, instead of acting on its own narrower reading.
- `eligian_project` locales guard: a malformed `locales.json` adds a `locales-parse-failed` entry to `assets.problems`. FR-024 lists the entries that `assets.problems` MUST hold; this entry is reported in addition, with the validator's own code, and only for a malformed file, so SC-005(2)'s "exactly the seeded three" fixture is unaffected. A `STORYBOARD.md` read failure gives `storyboard: null` (FR-025's absent-file value) rather than a new invented code.
- Commander options: `--timeline` and `--client` are repeatable, non-variadic, with spawned cases that place the option before the positional argument.
