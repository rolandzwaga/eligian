# Implementation Plan: MCP server, Phase 1: MVP server (learn + check)

**Branch**: `feat/mcp-server-roadmap` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/058-mcp-server/phase-1-mvp-server/spec.md` (reviewed; clarifications Q1–Q8 and OQ-effect / OQ-protocols / OQ-windows-npx / OQ-linux-handshake encoded), roadmap §2–§7 Phase 1, §8 decisions 1–10.

Every signature below was read this session, either with typegraph (`ts_module_exports`, `ts_references`) or from the installed library files: `effect@4.0.7` (`dist/ai/*.d.ts`, `dist/ai/McpServer.js`, `dist/Stdio.d.ts`, `dist/Semaphore.d.ts`, `dist/Logger.d.ts`, `dist/Schema.d.ts`, `dist/Effect.d.ts`), `langium@4.2.4` (`lib/services.d.ts`, `lib/parser/langium-parser.d.ts`) and `eligius@4.2.0` (`dist/lint.mjs`). File:line references are to the tree at `448cd8b`. Where the spec's line numbers drifted, the line found this session is used (for example `CheckDiagnostic` is at `check.ts:32`, `checkFiles` at `check.ts:67`).

## Summary

Phase 1 ships `eligian mcp`, a stdio MCP server inside the `eligian` 1.1.0 package. It has five tools (`eligian_docs`, `eligian_operations` and `eligian_check` upfront; `eligian_fmt` and `eligian_init` deferred), a build-time knowledge generator whose output ships in the tarball, a first review pass, and a one-case eval harness.

The design is reuse-first:

- **Check** = the existing `expandPatterns` + `checkFiles` + Eligius lint (`lintCompiledConfig`) pipeline of `eligian check`, plus the new review pass. The CLI and the tool run one shared function (`checkPaths`, B4), so their diagnostics are identical by construction (FR-058).
- **Fmt** = `formatSource` through a new object-returning `fmtFiles`; `runFmt` is reimplemented over it.
- **Init** = `runInit` + `starterFiles`.
- **Operations** = the registry API plus the language metadata, exported through a new `@eligian/language/mcp` entry.
- **Server** = `effect/ai` `McpServer.layerStdio` + `Toolkit`, loaded with a dynamic `import('effect/ai')`; a small Node `Stdio` layer; one `Semaphore` around everything that touches the shared Langium services.

No new runtime dependencies. New devDependencies of `packages/cli`: `@modelcontextprotocol/inspector` (pinned, FR-049) and `tsx` (already a root devDependency at 4.23.15; declared in the CLI because `esbuild.mjs` runs the generator with it).

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo). CLI sources ESM, bundled to `dist/cli.mjs` (`packages/cli/esbuild.mjs:81-105`); language `dist/index.cjs` + per-entry CJS bundles (`packages/language/esbuild.mjs:33-77`) |
| Runtime deps (present) | `effect` 4.0.7 (incl. `effect/ai`), `eligius` 4.2.0, `commander` 15.0.0, `tinyglobby`, `jsdom`, `esbuild` (CLI `package.json` `dependencies`) |
| New dev deps | `@modelcontextprotocol/inspector`, pinned to the version the Day-1 spike uses (registry today: 2.13.0, bins `mcp-inspector` / `inspector`, `engines.node >=22.19.0`); `tsx` 4.23.15 |
| Testing | Vitest 5 per package. CLI tests resolve `@eligian/language` (and the new `/mcp` subpath) to the built `dist/*.cjs`, so the language package must be built first, as today |
| Platforms | Windows 11 (dev machine, Node 24.7), `ubuntu-latest` Node 24 (CI, `ci.yml`) |
| Performance | `initialize` answered < 3,000 ms from a cold `node bin/cli.js mcp` (SC-001); `--version` median < 3,000 ms (SC-020) |
| Constraints | nothing but JSON-RPC frames on stdout; compiler calls serialised; Effect diagnostics 0/0/0; language coverage ≥ 79.8 / 80 / 69.9; CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`packages/cli/vitest.config.ts:14-19`) |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. One new Effect service (`CompilerLock`), no new package, no new runtime dependency. Tools are thin adapters over existing functions; the only new algorithms are the two review checks and the docs search. |
| II / V / XX / XXV Testing, TDD | Pass. Each FR gets a failing test first (see "Sequencing"); `specs/TESTING_GUIDE.md` is read before the first test; language tests that validate documents use `createTestContext()` / `getErrors()`. |
| III / XVII Effect | Pass. Tool handlers are `Effect`s that fail only with tagged errors (`Data.TaggedError`, `_tag`), mapped to a plain declared-failure object at the tool boundary (correction C2). Every I/O or promise step a tool owns runs through `Effect.tryPromise` / `Effect.try` mapped to a tagged error, and a defect is caught once at the tool boundary, logged to stderr and answered as `kind: 'internal'` (C3), so no answer leaves FR-005's shape. `CompilerLock` is a `Context.Service` provided by a `Layer`, once per server, and reaches the handlers through `Tool.make`'s `dependencies` (C9, C10). `pnpm effect:check:cli` and `:language` are gates. No `Effect.gen` adapter; `Effect.void` over `Effect.succeed(undefined)`. |
| IV Clear errors | Pass. The FR-014 messages are unchanged byte for byte; suggestions and quick fixes are added as data. |
| VI / VII Immutability, functional | Pass. Payloads are built fresh; internal mutation only inside the walker and the search scorer. |
| VIII pnpm | Pass. pnpm only. The eval harness runs `npm install <tarball>` inside a temp *user* project because that is what roadmap §6.4 measures; the CI tarball step (SC-016) installs the packed tarball with `npm install` into a temp dir for the same reason. |
| IX Langium | Pass. No grammar change, no generated file edited (`registry.generated.ts`, `controllers.generated.ts`, `timeline-events.generated.ts`, `generated/**` are read only). |
| XII No premature docs | Pass. Only the docs the spec requires: CLI README, CHANGELOG, root `AGENTS.md` lines, the roadmap corrections. |
| XIV Windows paths | Pass. Path comparison through `path.resolve` / `path.relative` (case-insensitive on win32), globs through `expandPatterns`, `.mcp.json` written with `path.join` (OS-native). |
| XV / XVI Research context | Pass. `eligius` only through the installed package (`eligius/lint`, `require.resolve('eligius/package.json')`). |
| XXII Sed safety | Pass. Edits by string match. |

No violations; the Complexity tracking table is empty.

## Corrections to the spec found while planning

All checked this session; `compliance.md` records each one.

- **C1. In-process versions are development versions.** `ELIGIAN_VERSION` is `typeof __ELIGIAN_VERSION__ === 'string' ? __ELIGIAN_VERSION__ : DEVELOPMENT_VERSION` (`packages/language/src/compiler/version.ts`), and only the CLI's esbuild `define` sets it (`packages/cli/esbuild.mjs:90-93`). Under vitest the CLI sources import the language `dist/index.cjs`, built without that `define`, so `getCompilerVersion()` returns `0.0.0-development`. Therefore:
  - SC-001's "`serverInfo.version` equals the `packages/cli/package.json` version" and SC-019's `eligian 1.1.0` header regex are asserted on the **spawned bin** (`package-bin.spec.ts` initialize test, `mcp-stdout.spec.ts`), not in `mcp-server.spec.ts`;
  - in-process tests assert `header` equals `` `eligian ${v.compiler} · eligius ${v.eligius} · <tool> · <path>` `` with `v = getCompilerVersion()`.
- **C2. A declared tool failure must be a plain object, not an `Error`.** `McpServer.registerToolkit` turns a declared failure that is `instanceof Error` with a non-empty `message` into `toolErrorResult(error.message)`, a plain-text item (`McpServer.js:1523-1526`). FR-005 needs `content[0].text` = `JSON.stringify({ header, error })`. Handlers therefore fail internally with `Data.TaggedError` classes, and the tool boundary maps them (`Effect.mapError`) to the plain `ToolFailure` object `{ header, error: { kind, message, path? } }`, which is the tool's `failure` schema. That object is encoded and returned with `isError: true` (`McpServer.js:1524-1526`).
- **C3. Parameter-schema refusals are JSON-RPC errors.** *(Amended by the T043 ruling, 2026-11-05: true under 2025-06-18 only; under 2025-11-25 the refusal is a plain-text `isError` result. Both are tested; see spec SC-011 and the FR-005 exception.)* A parameter decoding failure becomes `InvalidParams` (`McpServer.js:1533-1536`), a JSON-RPC error response (code -32602), not a tool result with `isError`. SC-011's "7 ids … refused with an error result" is asserted as: the response has `error.code === -32602`, no `result`.
- **C4. `withLint` becomes `withCompiledChecks`.** Lint and review both need the compiled config + map of each clean program. Rather than compiling twice, `withLint` (`check-command.ts:138`) is generalised in place to `withCompiledChecks(results, { lint, review })` and exported (FR-029: "exported … the plan decides"). Its library-merge logic (`:139-176`) is unchanged. `lintFile` (`lint.ts:12`; `ts_references`: only `check-command.ts:21,152`) keeps its signature as a wrapper over a new `lintCompiled`.
- **C5. `eligian_operations({ path })` parses; it does not load documents.** Host declarations need only the AST: `hostOperations` / `hostControllers` / `hostFunctions` find the program with `AstUtils.getContainerOfType(context, isProgram)` (`host-operations.ts:31-49`). `parseSource` (`parser.ts:68`) fails with `ValidationError` on a program with validation errors, which is exactly when an agent asks about an unknown name. The tool therefore uses `getOrCreateServices().Eligian.parser.LangiumParser.parse<Program>(source)` (`parse<T extends AstNode = AstNode>(input: string, options?: ParserOptions): ParseResult<T>`, `langium-parser.d.ts:124`; `LangiumParser` service at `services.d.ts:58`). No document is added to `LangiumDocuments`, so FR-022's release discipline holds trivially, and SC-010's "no document for the fixture's URI, same count" is still asserted. The call still runs under the lock (FR-010).
- **C6. The `@eligian/language/mcp` list grows by five names.** Beyond the spec's two kinds (`controllerBalance`; the services accessor `getOrCreateServices`), the entry adds:
  - `walkOperations` and `resolveOperationData`: FR-030 requires `class-never-removed` to "reuse that walker's resolution";
  - `lifecycleInsertionPoints`: the `controller-imbalance` quick fix needs the positions of the `on leave` block's `]` and the timeline's `}`. The Eligian map cannot give them: the lifecycle timeline action's `sourceLocation` is the *first* lifecycle block (`timeline-transformer.ts:254`, `:279`);
  - `eligiusTypeToDslAnnotation` (`utils/event-arg-types.ts:38`, not root-exported): FR-036's events chunk uses it.

  `EligianGrammar` is **not** exported: the generator reads the same grammar through `getOrCreateServices().Eligian.Grammar` (`LangiumCoreServices.Grammar`, `langium/lib/services.d.ts:44`).
- **C7. `CompileResult` gains `program`.** `compileFile` already holds the parsed `Program` (`compile-file.ts`, `const program: Program = parseExit.value`); returning it lets the review pass compute quick-fix positions without a second parse. The CLI package has no library API (`packages/cli/AGENTS.md`), so the change is internal.
- **C8. The lifted walker does not throw.** The test walker throws on a cycle (`tour-controllers.spec.ts:63`) and on an unknown action (`:93`). The library version records `unresolved` entries instead, so the review pass never crashes a check; `tour-controllers.spec.ts` asserts `unresolved` is empty to keep its old strictness.
- **C9. One timeline event name is multi-line.** `TIMELINE_EVENTS[0].name` is `"before-request-timeline-uri\n\nBroadcast by …"` (`timeline-events.generated.ts:31`). The events chunk, the `kind: 'event'` entries and the drift spec use the first line of `name` (one helper, `eventName(event)`, in `knowledge/render.ts`); the count stays 46. The generated metadata file is not edited (generated code).
- **C10. SC-002's Effect-logger part is a behavioural test of the composed server.** The server provides `stderrLoggerLayer = Logger.layer([Logger.withConsoleError(Logger.formatSimple)])` (`Logger.d.ts:828`, `:270`, `:401`) to the whole server graph with `Layer.provide` (C10 below, the composition written out). `Logger.layer` is a layer over `CurrentLoggers`: it changes logging only for what it is provided to, not for siblings it is merged with, and without it Effect's default logger writes with `console.log` unless `LogToStderr` is set (`effect/dist/internal/effect.js:3072`, `:3267`, `:3394`). Adding a test-only tool to the server would put a test seam into the production API; the test uses the existing `lock` option instead: a `CompilerLock` layer whose `run` dies. `eligian_check` under it hits the tool boundary's defect handler (`catchDefects`, C3), which logs the cause with `Effect.logError` from inside the handler's context. The test asserts (a) the answer is `isError` with `kind: 'internal'` and a text starting `{"header":`; (b) every frame on the recording `Stdio` stdout is a JSON-RPC frame; (c) the defect text reached `console.error` and `console.log` was not called. A merge instead of a provide sends that log to `console.log` and fails (c). The earlier identity assertion (`SERVER_LAYERS.logger === stderrLoggerLayer`) is dropped with `SERVER_LAYERS`: it compared two constants and never checked the composition.
- **C11. An `eligian_init` refusal is `isError` kind `io`.** FR-006 has no better kind for "starter files exist"; the message lists the files and says that `force: true` overwrites them.
- **C12. The lock hooks' "request id" is the server's call id, not the JSON-RPC id.** `McpServer` passes no JSON-RPC id to a handler: `built.handle(tool.name, payload ?? {}, undefined, decodeOptions)` (`McpServer.js:1567`). The hooks therefore receive the call id the telemetry wrapper assigns: `'1'`, `'2'`, … per server, in the order the handlers start (C5; the counter lives in the per-server `Telemetry`, so every in-memory server starts at `'1'`). SC-005 needs only per-call pairing of the hooks. SC-022 correlates call ids with JSON-RPC ids by construction: its sequential baselines run on a *separate* server instance, and each of its requests is sent only after the hook of the previous one fired, so call id `'1'` is JSON-RPC request 1 and `'2'` is request 2 (test plan, SC-022 row). `compliance.md` records this reading of FR-010's "with the request id".
- **C13. Case 14's controller defect is not a start-state code.** FR-030 runs the review pass only on programs without errors (B4), and case 14's start state has two by design: Typir reports a second `styles` import as `import-duplicate-default` with `severity: 'error'` (`type-system-typir/validation/import-validation.ts:62-69`), and an `on click` bare in a timeline body is a `syntax-error`, since the body admits only `TimelineLifecycle` and `TimelineEvent` (`eligian.langium:597`; the registry code is set at `eligian-document-validator.ts:63-71`). `controller-imbalance` cannot appear at start. The start-state codes are exactly those listed under "Eval harness"; `eval-cases.spec.ts` also proves the controller defect is planted (with the two error lines removed, the check yields `controller-imbalance`). FR-055's `caseCodes` is the start-state set; `controller-imbalance` gets its overlay through FR-040's review-code rule regardless. `compliance.md` records this.
- **C14. The JSON reporter prints `data` when present.** `formatJson` spreads every diagnostic field but `file` (`r.diagnostics.map(({ file: _file, ...d }) => d)`, `reporters.ts:116`), so `data` (suggestions, quick fix) appears in `eligian check --format json` with no code change; the plan keeps that, since agents and CI scripts are its readers. The pretty and github reporters print only the message, unchanged. SC-008 pins both sides: the Step 0a snapshot (no `data`, byte-identical) and a new snapshot holding `data.quickFix`.

## Sequencing

Baselines first, because several SCs compare with "before the change":

- **Step 0 (before any source edit)**:
  - (a) SC-008: `node packages/cli/bin/cli.js check packages/cli/src/__tests__/__fixtures__/warning-only.eligian --format json` → `packages/cli/src/__tests__/__snapshots__/check-json-before.json` (CLI JSON for diagnostics without `data`);
  - (b) SC-006: the message text of `unknown_operation`, `unknown_css_class`, `unknown_css_class_in_selector` and `unknown_css_id_in_selector` for one input each → `packages/language/src/__tests__/__snapshots__/did-you-mean-messages.json`;
  - (c) SC-009: `pnpm run fmt:examples` output (scratch file, quoted in `compliance.md`);
  - (d) `pnpm -C packages/language test:coverage:ci` and `pnpm -C packages/cli test:coverage:ci` summaries (quoted).
- **Day 1, spike (FR-002a, SC-024)**: `stdio.ts` for real, plus a throwaway `spike.ts` with the two throwaway tools wired through a temporary `mcp-spike` command (deleted before Day 3). Recorded in `compliance.md`: the inspector `tools/list`; Claude Code `claude mcp add` / `claude mcp list`; the `claude -p --output-format stream-json --verbose` init event; the 60,000-char result; the negotiated `protocolVersion` per client; the wire encoding. Three plan-level checks are added to the spike:
  - **S1**: inside a tool handler under `layerStdio`, `Effect.serviceOption(McpSchema.McpServerClient)` is `Some`, and `getClient` → `listRoots()` works against a client that advertises roots (`McpSchema.d.ts:3824-3825`, `:3873`). Fallback if not: the cwd root only, recorded as a deviation from FR-007.
  - **S2**: `Schema.Array(Schema.String).check(Schema.isMaxLength(6))` appears as `maxItems: 6` in the advertised `inputSchema` (`Schema.d.ts:4311`, `:6478`).
  - **S3**: the pinned inspector's exact CLI syntax for `tools/list` and `tools/call`. Inspector 2.x reorganised its packaging (bins `mcp-inspector`, `inspector`, `mcpdo`); the roadmap's `--cli … --method tools/list` is **[UNVERIFIED]** for 2.13.0.
  - Go/no-go per FR-002a.
- **Day 2**: eval harness (`evals/mcp/`) and the case 13/14 fixtures (FR-050–FR-052).
- **Days 3–4**: language changes A1–A7 → CLI check layer B1–B6 → MCP modules C1–C10 → tools. Concurrency and cancellation specs.
- **Days 5–6**: generator, literate probes, ranking script, drift specs.
- **Days 7–8**: review pass v1; curriculum; overlays.
- **Day 9**: instructions string, handshakes (SC-016), README, CHANGELOG, version bump, workflows, roadmap edits (FR-056).

## Module design

### A. Language package (`packages/language`)

#### A1. `CheckDiagnostic.data` (FR-011, FR-012, FR-013) — `src/compiler/pipeline/check.ts`

```ts
// New exports
export interface QuickFix {
  readonly line: number;       // 1-based, like CheckDiagnostic
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;  // start = end: an insertion
  readonly newText: string;
}
export interface CheckDiagnosticData {
  readonly suggestions?: readonly string[];
  readonly quickFix?: QuickFix;
}
export interface CheckDiagnostic {   // check.ts:32; existing fields unchanged
  // file, severity, message, line, column, endLine, endColumn, code
  readonly data?: CheckDiagnosticData;
}
```

In `validateFiles`, at the conversion (`check.ts:227-236`):
- `suggestions` are copied when `(diagnostic.data as { suggestions?: unknown } | undefined)?.suggestions` is a `string[]` (set today at `navigate-validator.ts:85` and `timeline-validator.ts:343`);
- `quickFix` = `selectElementFix(document, diagnostic)` (A2), converted from the 0-based LSP range (`+1` on line and character);
- `data` is added only when one of the two exists, so a record without data is structurally identical to today's (SC-008, byte-identical CLI JSON).
- `eligian check --format json` prints `data` when it is present (C14): `formatJson` already spreads every field but `file` (`reporters.ts:116`). The pretty and github reporters print only the message, as today.

`checkFiles`' signature is unchanged: `(filePaths: readonly string[], options?: CheckOptions) => Effect<readonly CheckFileResult[], never, never>` (`check.ts:67`). Both new types are re-exported from the package root beside `CheckDiagnostic`.

#### A2. Quick-fix text (FR-013) — `src/lsp/select-element-fix.ts`

```ts
export interface SelectElementFix {
  readonly title: string;   // 'Insert selectElement(…)' | 'Add target …'
  readonly range: Range;    // LSP, 0-based; an insertion (start = end)
  readonly newText: string;
}
/** The edit of the 'Insert selectElement' / 'Add target' quick fix for one diagnostic, if any. */
export function selectElementFix(document: LangiumDocument, diagnostic: Diagnostic): SelectElementFix | undefined;
```

Its body is today's loop body of `selectElementCodeActions` (`:86-150`): the `DEPENDENCY_CODES` / `'selectedElement'` filter (`:27`, `:95-96`), the CST lookup, the `target` branch (`:105-126`) and the `selectElement(<guessSelector>)` branch (`:128-148`). `selectElementCodeActions(document, diagnostics)` becomes a map from each fix to the same `CodeAction` (same title, kind, `isPreferred`, edit), so its existing tests (`timeline/__tests__/target-and-with.spec.ts`) pass unchanged. Both SC-006 fixtures take the block branch, whose `newText` starts with `selectElement(`.

#### A3. Suggestions as data (FR-014)

Each MUST site adds `suggestions` beside its existing code; the message is untouched:
- `validators/operation-call/operation-existence-validator.ts` (`accept('error', message, { node: operation, property: 'operationName', code: error.code.toLowerCase() })`): add `data: { suggestions: error.suggestions }` (`UnknownOperationError.suggestions` is computed at `compiler/operations/validation/existence.ts:33`);
- `validators/operation-call/css-parameter-validator.ts`, the role branch and `checkClassNameParameter`: `data: { code: diagnosticCode('unknown_css_class'), suggestions }`;
- `css/selector-validation.ts` `reportSelectorIssues`: `data: { code: diagnosticCode(…), suggestions }` in the class and the id branch.

The three MAY sites stay as they are and are listed in `compliance.md`.

#### A4. Controller walker (FR-028, FR-030) — new `src/compiler/controller-balance.ts`

The test's `resolve` and `walk` (`tour-controllers.spec.ts:38-102`) move here, generalised to events so that `class-never-removed` reuses the same resolution:

```ts
import type { IEngineConfiguration } from 'eligius';

export type OperationData = Readonly<Record<string, unknown>>;
export interface WalkedOperation { readonly systemName: string; readonly operationData?: OperationData }

/** One effect the walker saw; `at` is the index of the top-level operation that led to it. */
export type WalkEvent =
  | { readonly kind: 'controller-added' | 'controller-removed'; readonly selector: unknown; readonly controller: unknown; readonly at: number }
  | { readonly kind: 'class-added' | 'class-removed' | 'class-toggled'; readonly selector: unknown; readonly className: unknown; readonly at: number };

export interface WalkResult {
  readonly events: readonly WalkEvent[];
  /** Calls the walker could not follow: unknown action names, nesting deeper than 20 */
  readonly unresolved: readonly string[];
}

/** `$operationdata.<name>` references, resolved deeply against `data`; other values unchanged. */
export function resolveOperationData(value: unknown, data: OperationData): unknown;

/**
 * Walk an operation list as the engine does for the selection, controllers and classes
 * (selectElement, setOperationData, getControllerInstance, addControllerToElement,
 * removeControllerFromElement, addClass, removeClass, toggleClass), descending into
 * requestAction + startAction with a copy of the caller's data plus the call's
 * arguments; nothing flows back. `actions`: action name → startOperations.
 */
export function walkOperations(
  operations: readonly WalkedOperation[],
  actions: ReadonlyMap<string, readonly WalkedOperation[]>
): WalkResult;

export interface ControllerBalance {
  readonly timeline: string;           // timeline uri
  readonly added: readonly string[];   // `${selector} ${controller}`, sorted
  readonly removed: readonly string[];
  readonly unresolved: readonly string[];
}
/** Per timeline: the controllers its lifecycle action adds (start) and removes (end). */
export function controllerBalance(config: IEngineConfiguration): readonly ControllerBalance[];
```

`controllerBalance` reproduces `balance()` (`tour-controllers.spec.ts:113-136`): the `timeline-lifecycle` timeline action, start ops for adds, end ops for removals; a timeline without one gets empty lists. `tour-controllers.spec.ts` keeps its three tests, calls `controllerBalance(config)` and adds `expect(unresolved).toEqual([])` (C8).

#### A5. Lifecycle insertion points (FR-030 quick fix) — `src/utils/timeline-lifecycle.ts`

```ts
export interface LifecycleInsertionPoint {
  readonly timeline: string;   // Timeline.name (the compiled uri)
  /** 0-based position of the `]` of the first `on leave` block, if any */
  readonly leaveClose?: { readonly line: number; readonly character: number };
  /** 0-based position of the timeline's closing `}` */
  readonly bodyClose: { readonly line: number; readonly character: number };
  /** Leading whitespace of the timeline's first line */
  readonly indent: string;
}
export function lifecycleInsertionPoints(program: Program): readonly LifecycleInsertionPoint[];
```

Built on `lifecycleBlocks(timeline)` (same file) and the CST: `$cstNode.range.end` minus one character is the `]` of `'on' kind '[' … ']'` (`eligian.langium:614-615`) and the `}` of the timeline body (`:594-597`).

#### A6. `SELF_RESOLVED` export (FR-036) — `src/compiler/transformers/runtime-values.ts:100`

`const SELF_RESOLVED` → `export const SELF_RESOLVED`; type unchanged: `Readonly<Record<string, ReadonlySet<string> | '*'>>`.

#### A7. The `@eligian/language/mcp` entry (FR-044) — new `src/mcp.ts`

```ts
export { HTMLRegistryService } from './html/html-registry.js';
export { type LayoutElements, readLayoutHtml, scanLayoutElements } from './html/layout-elements.js';
export { layoutElementsOf, type SelectorNames, selectorNames } from './css/selector-sources.js';
export { argumentRole, calledAction, type ParameterRole, parameterRoles } from './css/parameter-roles.js';
export { EligianDocumentSymbolProvider } from './lsp/eligian-document-symbol-provider.js';
export { navigatesTo, similarTimelineNames, type TimelineSymbol, timelineNamed, timelineSymbolAt } from './lsp/timeline-symbols.js';
export { CONTROLLERS, type ControllerMetadata, getController } from './completion/metadata/controllers.generated.js';
export { TIMELINE_EVENTS, type TimelineEventMetadata } from './completion/metadata/timeline-events.generated.js';
export { DOM_EVENTS } from './utils/dom-events.js';
export { KEY_COMPLETIONS } from './utils/key-names.js';
export { eligiusTypeToDslAnnotation } from './utils/event-arg-types.js';
export { hostControllers, hostFunctions } from './compiler/operations/host-operations.js';
export { SELF_RESOLVED } from './compiler/transformers/runtime-values.js';
export {
  type ControllerBalance, controllerBalance, resolveOperationData,
  type WalkEvent, type WalkResult, walkOperations,
} from './compiler/controller-balance.js';
export { type LifecycleInsertionPoint, lifecycleInsertionPoints } from './utils/timeline-lifecycle.js';
export { getOrCreateServices } from './compiler/pipeline/services.js';
```

Exported symbols verified this session: `html-registry.ts:49`, `layout-elements.ts:13, 21, 51`, `selector-sources.ts:18, 38, 51`, `parameter-roles.ts:28, 44, 50, 63`, `timeline-symbols.ts:31, 44, 70, 75, 158`, `controllers.generated.ts:10, 29, 238`, `timeline-events.generated.ts:18, 29`, `dom-events.ts:9`, `key-names.ts:83`, `event-arg-types.ts:38`, `host-operations.ts:44, 48`, `services.ts:37`.

**Runtime exports, exactly** (sorted; the exports test's expected list, 27 names): `CONTROLLERS`, `DOM_EVENTS`, `EligianDocumentSymbolProvider`, `HTMLRegistryService`, `KEY_COMPLETIONS`, `SELF_RESOLVED`, `TIMELINE_EVENTS`, `argumentRole`, `calledAction`, `controllerBalance`, `eligiusTypeToDslAnnotation`, `getController`, `getOrCreateServices`, `hostControllers`, `hostFunctions`, `layoutElementsOf`, `lifecycleInsertionPoints`, `navigatesTo`, `parameterRoles`, `readLayoutHtml`, `resolveOperationData`, `scanLayoutElements`, `selectorNames`, `similarTimelineNames`, `timelineNamed`, `timelineSymbolAt`, `walkOperations`. C6 explains the names beyond the spec's list.

**Type-only exports** (no runtime name, so the list above is unchanged): `ControllerBalance`, `ControllerMetadata`, `LayoutElements`, `LifecycleInsertionPoint`, `ParameterRole`, `SelectorNames`, `TimelineEventMetadata`, `TimelineSymbol`, `WalkEvent`, `WalkResult`. `ControllerMetadata` (`controllers.generated.ts:10`) and `TimelineEventMetadata` (`timeline-events.generated.ts:18`) are exported because `knowledge/render.ts` (C7) types its parameters with them and is shared by the bundled CLI and the tsx generator, which both reach the language package only through its `exports`; the package root re-exports neither (no match for either name in `src/index.ts` or `src/compiler/index.ts`).

Wiring:
- `packages/language/package.json` `exports["./mcp"] = { "types": "./out/mcp.d.ts", "default": "./dist/mcp/index.cjs" }` (today: `.`, `./errors`, `./eligius-lint`);
- `packages/language/esbuild.mjs`: a fourth context `ctxMcp` (`entryPoints: ['src/mcp.ts']`, `outfile: 'dist/mcp/index.cjs'`, the options of `ctxLint`, `:67-77`), added to `contexts`;
- `packages/cli/esbuild.mjs` `WORKSPACE_SOURCES['@eligian/language/mcp'] = '../language/src/mcp.ts'` (`:32-37`).

**Two singletons under vitest.** `dist/mcp/index.cjs` is a separate CJS bundle, so under vitest it carries its *own* copy of the `services.ts` singleton, distinct from the one in `dist/index.cjs` (the same holds today for `dist/eligius-lint/index.cjs`). In the production CLI bundle both specifiers resolve to the same source modules, so there is one singleton. Rule: CLI code never mixes services from the two entries in one operation. The only consumers of the entry's `getOrCreateServices` are the operations parse (C5) and the generator's grammar read, both self-contained; SC-010 reads the same entry's workspace that the tool's parse uses.

### B. CLI check layer (`packages/cli/src`)

#### B1. `compile-file.ts` (C7)

`CompileResult` (`:55-69`) gains `readonly program: Program` (`type Program` is root-exported, `packages/language/src/index.ts:46`). `compileFile(inputPath: string, options?: CompileOptions): Promise<CompileResult>` (`:244`) is otherwise unchanged.

#### B2. `check/lint.ts`

```ts
/** The Eligius lint findings of a compiled program, at their source. */
export function lintCompiled(file: string, compiled: Pick<CompileResult, 'config' | 'map' | 'host'>): CheckDiagnostic[];
/** Unchanged signature (lint.ts:12): lintCompiled(file, await compileFile(file)). */
export async function lintFile(file: string): Promise<CheckDiagnostic[]>;
```

`lintCompiled` wraps `lintCompiledConfig(config, map, host)` (`compiler/eligius-lint.ts:37`) and today's `toDiagnostic` (`lint.ts:17-31`).

#### B3. `check/review.ts` (FR-030)

```ts
export const REVIEW_CODES = ['controller-imbalance', 'class-never-removed'] as const;
export type ReviewCode = (typeof REVIEW_CODES)[number];

/** Review warnings over one compiled program, located at source. */
export function reviewConfig(
  compiled: Pick<CompileResult, 'config' | 'map' | 'program'>,
  file: string
): CheckDiagnostic[];
```

(The spec's sketch was `reviewConfig(config, map, file)`; the program is added for the quick-fix positions, C7.)

- **`controller-imbalance`**: for each `controllerBalance(config)` entry whose sorted `added` and `removed` differ as multisets:
  - location: the `timeline-lifecycle` action's location in the map (`map.actions[id].location`), else the timeline's first located action;
  - `data.quickFix` only for adds without a removal, from `lifecycleInsertionPoints(program)` for that timeline. With `leaveClose`: insert before the `]` one line per missing removal pair, `selectElement("<sel>")` then `removeControllerFromElement("<Name>")`, indented to the timeline indent + 4. Without: insert before `bodyClose` a full `on leave [ … ]` block (indent + 2, lines + 4). Positions converted to 1-based `QuickFix` (A1);
  - a removal without an add: the warning, no `quickFix`.
- **`class-never-removed`**: per timeline, `walkOperations` over every timeline action's start ops and end ops separately (`actions` = `config.actions` names → `startOperations`), keeping each action's `duration.start` and its index in `timelineActions`.
  - Key = `${selector}\u0000${className}` when both are strings and neither contains a `$operationdata.` / `$globaldata.` / `$scope.` chain. Otherwise the class name, when a string, goes into the timeline's `suppressed` set: a non-literal selector on an add or on a removal suppresses that class on that timeline (FR-030).
  - An add in a range's start ops is cleared by a `class-removed` or `class-toggled` of the same key in: the same action's end ops; the start or end ops of any timeline action that starts later (`duration.start` greater, or equal and later in `timelineActions`); the lifecycle action's end ops. An add in the lifecycle start ops is cleared only by the lifecycle end ops.
  - Each remaining add is one warning, at the top-level operation (`map.actions[id].start[at].location`, else the action's location), with the message `addClass("<class>") on "<selector>" is never removed in timeline "<uri>": remove it in the end block, a later range or on leave`.
- Findings are `severity: 'warning'` with a `REVIEW_CODES` code.

#### B4. `check/check-command.ts`

```ts
export interface CheckOptions {   // check-command.ts:24-36, plus:
  readonly review?: boolean;
}
export interface CompiledChecks { readonly lint: boolean; readonly review: boolean }

/**
 * For every program without errors (not libraries): compile once (compileFile), add the Eligius
 * lint findings (lintCompiled) and the review warnings (reviewConfig). A finding located in an
 * imported library goes to that library's result, added when the library was not checked itself.
 * A program that checks clean but does not compile gets the `compile-failed` error (as today, :153-163).
 */
export async function withCompiledChecks(
  results: readonly CheckFileResult[],
  checks: CompiledChecks
): Promise<CheckFileResult[]>;

/** checkFiles + withCompiledChecks: the check the CLI and eligian_check share. */
export async function checkPaths(
  files: readonly string[],
  options: { readonly selectorNotInLayout?: SelectorNotInLayout; readonly lint: boolean; readonly review: boolean }
): Promise<CheckFileResult[]>;
```

`runCheck(patterns, options)` (`:98`) = `expandPatterns` (`:68`) + `checkPaths(files, { selectorNotInLayout, lint: options.lint ?? false, review: options.review ?? false })` + the existing summary/format/exit logic (`:115-129`). The CLI action passes the 1.1.0 defaults (B5). The tool calls `checkPaths` too.

#### B5. `main.ts`: check defaults (FR-031) and the `mcp` command (FR-001)

- `check`: `--selector-not-in-layout` default `'off'` → `'ids'` (`main.ts:297-301`). Without a layout import `reportNotInLayout` returns before warning (`css/selector-sources.ts:81-83`: `layoutElementsOf(...)` undefined), so `ids` affects only programs that import a layout, as decision 4 says. New `.option('--no-review', 'skip the review pass (controller balance, classes never removed)')` beside `--no-lint` (`:296`); `runCheck(…, { …, review: cmdOptions.review !== false })`. Help texts of both options updated.
- The epilogue (`:283-286`) lists `mcp`: `Run 'eligian <command> --help' (compile, check, fmt, smoke, dev, init, mcp) for its options.`
- New command, registered before the default `compile` command (`:458`):

```ts
program
  .command('mcp')
  .description('start the Model Context Protocol server for coding agents (stdio)')
  .action(async () => {
    const { runServer } = await import('./mcp/server.js');
    await runServer({ cwd: process.cwd() });
  });
```

#### B6. `fmt.ts` (FR-024)

```ts
export interface FmtFileResult {
  readonly file: string;              // absolute
  /** Formatted already (check mode) or now (after a write) */
  readonly formatted: boolean;
  readonly written?: boolean;
  readonly lineDiff?: string;         // check mode, unformatted: lineDiff(source, text)
  readonly firstDifference?: number;  // for the --format github annotation
  readonly error?: string;            // the first syntax error; the file is untouched
}
export async function fmtFiles(files: readonly string[], options: { readonly write: boolean }): Promise<FmtFileResult[]>;
```

Built on `formatSource(source, options?) => Promise<FormatSourceResult>` (`lsp/format-source.ts:25`, `{ text, changed, errors }`), `lineDiff(before, after): string` (`fmt.ts:31`) and `firstDifference(before, after): number` (`:78`). `runFmt(patterns, options): Promise<FmtOutcome>` (`:89`) keeps `{ output, exitCode }` and its exact text by mapping each `FmtFileResult` to the lines it prints today (`:96-128`). Byte identity is guarded by the unchanged `fmt.spec.ts` and the Step 0c `fmt:examples` output.

A write failure rejects with Node's fs error, which carries `code` and `path`, exactly as `runFmt` does today (`await fs.writeFile(file, result.text, 'utf-8')`, `fmt.ts:115`); `fmtFiles` does not catch it. The CLI behaviour is unchanged; the tool maps the rejection to `kind: 'io'` with that path (C3).

### C. MCP server (`packages/cli/src/mcp/`)

Placement: everything runs **in-process** in the `eligian mcp` process. Phase 1 starts no child processes (smoke is Phase 2). Only `effect/ai` is loaded lazily; `effect` core is already loaded by the CLI.

**Static-import rule** (FR-003): files under `src/mcp/` may import *types* from `effect/ai` (`import type`), never values. Values reach them through a parameter `ai: EffectAi` (`type EffectAi = typeof import('effect/ai')`); only `server.ts` runs `await import('effect/ai')`. The `effect/ai` index exports `McpSchema`, `McpServer`, `McpProtocol`, `McpClient`, `Tool`, `Toolkit` (`effect/dist/ai/index.d.ts:49-114`).

#### C1. `stdio.ts` (FR-004)

```ts
import { Effect, Layer, Logger, PlatformError, Sink, Stdio, Stream } from 'effect';

export interface CapturedStdout { readonly write: (chunk: string | Uint8Array) => boolean }

/** Capture process.stdout.write for the transport, then route console.log/info/debug/warn/error
 *  and process.stdout.write to stderr for the life of the process. Idempotent. */
export function redirectConsoleToStderr(): CapturedStdout;

/** The Stdio service over process.stdin and the captured stdout writer. */
export function layerNodeStdio(stdout: CapturedStdout): Layer.Layer<Stdio.Stdio>;

/** Effect's logger, to stderr (console.error). */
export const stderrLoggerLayer: Layer.Layer<never>;
```

- `layerNodeStdio` = `Layer.succeed(Stdio.Stdio, Stdio.make({ args, stdin, stdout, stderr }))` with `Stdio.make(options)` (`Stdio.d.ts:130`; fields per `:64-92`): `args: Effect.succeed(process.argv.slice(2))`; `stdin: Stream.fromAsyncIterable(process.stdin, cause => PlatformError.systemError({ … }))` (`Stream.d.ts:1159`; `PlatformError.d.ts:201`, fields per that declaration); `stdout: () => Sink.forEach(chunk => Effect.sync(() => { stdout.write(chunk) }))` (`Sink.d.ts:1508`); `stderr` likewise over `process.stderr.write`.
- `stderrLoggerLayer` = `Logger.layer([Logger.withConsoleError(Logger.formatSimple)])`.
- `redirectConsoleToStderr` is called by `runServer` only, never by in-process tests (it would capture vitest's console).
- An uncaught exception: Node prints it to stderr and exits non-zero; the redirect never touches `process.stderr`, and each frame is one `write` of a whole line, so no partial frame comes from our side (SC-002 crash run).

#### C2. `compiler-lock.ts` (FR-009, FR-010)

```ts
export interface CompilerLockHooks {
  readonly onQueued?: (requestId: string, at: number) => void;
  readonly onAcquire?: (requestId: string, at: number) => void;
  readonly onRelease?: (requestId: string, at: number, completed: boolean) => void;
  /** Holds a section right after acquire until the promise resolves (tests) */
  readonly latch?: (requestId: string) => Promise<void>;
}
export class CompilerLock extends Context.Service<
  CompilerLock,
  { readonly run: <A, E, R>(requestId: string, section: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> }
>()('eligian/mcp/CompilerLock') {}

export const makeCompilerLock: (hooks?: CompilerLockHooks) => Effect.Effect<CompilerLock['Service']>;
export const CompilerLockLive: Layer.Layer<CompilerLock>;                             // no hooks
export const compilerLockLayer: (hooks: CompilerLockHooks) => Layer.Layer<CompilerLock>; // tests
export const CompilerLockPassThrough: Layer.Layer<CompilerLock>;                      // tests: SC-005 control
```

The `Context.Service<Self, Shape>()(key)` form is the one the repo uses (`compiler/effects/Logger.ts:22-50`). `run(id, section)` = `onQueued` → `semaphore.withPermits(1)(Effect.uninterruptible(onAcquire → latch → section → onRelease(completed)))`, with `Semaphore.make(1)` (`Semaphore.d.ts:235`), `withPermits` (`:78`, `:326`) and `Effect.uninterruptible` (`Effect.d.ts:14409`). Waiting for the permit stays interruptible, so a cancelled queued call leaves the queue; once acquired, the section (an `Effect.tryPromise` over `checkPaths` or `fmtFiles`, or the synchronous parse, C3) runs to the end and the permit is released only after the promise settled (FR-009). No call counter, no reset hook (FR-053). `requestId` is the per-server call id the telemetry wrapper assigns (C5, C12), not the JSON-RPC id.

#### C3. `errors.ts` (FR-006)

```ts
export type ToolErrorKind = 'not-found' | 'io' | 'timeout' | 'cancelled' | 'internal';
export class ToolNotFound extends Data.TaggedError('ToolNotFound')<{ readonly message: string; readonly path?: string }> {}
export class ToolIoError extends Data.TaggedError('ToolIoError')<{ readonly message: string; readonly path?: string }> {}
export class ToolInternal extends Data.TaggedError('ToolInternal')<{ readonly message: string; readonly path?: string }> {}
export type ToolError = ToolNotFound | ToolIoError | ToolInternal;

/** The declared failure on the wire (a plain object, C2). */
export const ToolFailure: Schema.Struct<{ header: …; error: Schema.Struct<{ kind: …; message: …; path: … }> }>;
export type ToolFailure = typeof ToolFailure.Type;
export const toToolFailure: (header: string) => (error: ToolError) => ToolFailure;
/** A rejection or throw → a tagged error. 'read' (a tool input): ENOENT → ToolNotFound, any other
 *  fs errno → ToolIoError. 'write': every fs errno → ToolIoError. No errno `code` → ToolInternal.
 *  `path` = the given one, else the fs error's own `path`. */
export const toToolError: (op: 'read' | 'write', path?: string) => (cause: unknown) => ToolError;
/** The tool boundary: a defect is logged (Effect.logError) and becomes ToolInternal; interruption passes. */
export const catchDefects: <A, R>(self: Effect.Effect<A, ToolError, R>) => Effect.Effect<A, ToolError, R>;
```

`Data.TaggedError` (`Data.d.ts:798`); `Schema.Literals` (`Schema.d.ts:4181`) for `kind`; `Schema.optionalKey` (`:1967`) for `path`.

- **No `Effect.promise` in `src/mcp/`.** Every I/O or promise step a tool owns runs through `Effect.tryPromise({ try, catch })` (`Effect.d.ts:1458-1459`) or `Effect.try({ try, catch })` (`:2289-2293`) with `catch: toToolError(op, path)`, and leaves through `toToolFailure(header)` as `{ header, error: { kind, message, path? } }` (FR-005, FR-006):
  - `checkPaths` (`'read'`). A rejection is not expected: `checkFiles` reports an unreadable file as a diagnostic (`check.ts:162-170`) and the compiled checks turn a compile failure into `compile-failed` (`check-command.ts:150-163`). But the library test reads each file with `fs.promises.readFile` outside that `try` (`:150`), so a file deleted between the glob and the check rejects;
  - `fmtFiles` (`'write'`): its `fs.writeFile` (`fmt.ts:115`) fails with EACCES / EPERM on a read-only file, or EBUSY on a file an editor holds on Windows;
  - the `eligian_operations({ path })` read (`'read'`, the file: ENOENT → `ToolNotFound`, C4);
  - `runInit` (its `fs.mkdir` / `fs.writeFile` at `init.ts:66-67` have no `try`) and the three agent-file writes (`'write'`, C9);
  - `loadKnowledge` (a missing `index.json` → `ToolInternal` naming `docsRoot`, C7).
- **Defects.** `catchDefects` wraps every handler before `toToolFailure`: `Effect.catchDefect(defect => Effect.logError('eligian mcp: tool defect', defect).pipe(Effect.andThen(Effect.fail(new ToolInternal({ message: 'internal error: ' + describe(defect) })))))` (`Effect.catchDefect`, `Effect.d.ts:5362`; `describe` = the `Error` message or `String(defect)`). A bug therefore still answers `{ header, error: { kind: 'internal', … } }`. It never reaches McpServer's `internalToolError`, whose answer is the plain-text item `toolErrorResult(INTERNAL_TOOL_ERROR_MESSAGE)` (`McpServer.js:1468`, `:1506-1508`) and would break FR-005. The cause is logged through the server's stderr logger (C10). Interruption is not a defect and passes through, so a cancelled call still sends no frame (FR-009).
- `'timeout'` and `'cancelled'` are part of the wire schema but Phase 1 never produces them (no child processes; a cancelled call sends no frame, FR-009).

#### C4. `paths.ts` (FR-007)

```ts
export interface ProjectRoot { readonly root: string; readonly from: 'roots' | 'cwd' }
/** The first announced root when the client advertises roots, else cwd. Never fails. */
export const projectRoot: (ai: EffectAi, cwd: string) => Effect.Effect<ProjectRoot>;
/** Absolute path for a tool input (backslashes, either drive-letter case); ToolNotFound outside the root. */
export const resolveInputPath: (root: ProjectRoot, input: string) => Effect.Effect<string, ToolNotFound>;
/** Paths/globs through expandPatterns, all under the root; ToolNotFound when nothing matches. */
export const resolveInputPatterns: (root: ProjectRoot, inputs: readonly string[]) => Effect.Effect<readonly string[], ToolNotFound>;
export const isInside: (root: string, file: string) => boolean;
```

- `projectRoot`: `Effect.serviceOption(ai.McpSchema.McpServerClient)` (`Effect.d.ts:11810`; `McpServerClient`, `McpSchema.d.ts:3873`). When `clientCapabilities.roots` is present: `Effect.scoped(getClient)` → `listRoots()` (`:3825`) → the first root's `file:` URI through `fileURLToPath`. Every failure (`McpReverseOperationError`, `McpReverseOperationUnsupported`, a 2 s timeout, no service) → `{ root: cwd, from: 'cwd' }`, silently. Spike S1 confirms the service is present in handlers. The failure branch is tested, not only the absent-capability one: a spawned client that advertises `capabilities.roots` and answers `roots/list` with a JSON-RPC error, and one that never answers (SC-021 row).
- `resolveInputPath`: on win32, `/` and `\` both accepted (`path.resolve` normalises); `path.resolve(root.root, input)`; then `isInside`, where `isInside(root, file)` = `const r = path.relative(root, file); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r))`, both sides lower-cased on win32.
- `resolveInputPatterns`: absolute inputs outside the root fail `ToolNotFound` (naming the root) before any glob runs; then `expandPatterns(inputs, root.root)` (`check-command.ts:68`, which applies `toGlobPath`, `:96`), filtered with `isInside`; no match → `ToolNotFound`.
- A tool that reads one input file (`eligian_operations({ path })`) reads it after `resolveInputPath` with `Effect.tryPromise` + `toToolError('read', file)` (C3), so a nonexistent file inside the root is `ToolNotFound` naming the path, not a defect. Patterns that match nothing are `ToolNotFound` already (`resolveInputPatterns`).
- The imports of a program are never inspected here (FR-058).

#### C5. `telemetry.ts` (FR-008)

```ts
export interface TelemetryLine {
  readonly t: string; readonly tool: string; readonly ms: number; readonly chars: number;
  readonly ok: boolean; readonly args: Readonly<Record<string, unknown>>;
}
export interface Telemetry {
  readonly withTelemetry: <A, E, R>(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    run: (requestId: string) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
}
/** One per server (makeServerLayer): its own call counter and log-file state. */
export const makeTelemetry: (logFile: string | undefined) => Telemetry;
```

- Times the call; `chars` = `JSON.stringify(success or failure payload).length`; `args` is the tool's `summarizeArgs` output (counts and names, never file contents). An interrupted call writes its line with `ok: false` (`Effect.onExit`).
- The line goes to `process.stderr.write`. When `logFile` is set (`makeServerLayer` passes `process.env.ELIGIAN_MCP_LOG`), it is also appended with `Effect.try({ try: () => fs.appendFileSync(logFile, line), catch: … })` (`Effect.d.ts:2289-2293`). A failed append (a missing directory, no permission) writes one warning line to stderr naming the file, turns file logging off for that server, and is otherwise ignored (`Effect.ignore`, `Effect.d.ts:7734`). Telemetry never changes a tool result, and its finalizer never throws.
- The counter gives the `requestId` that the `CompilerLock` hooks report: `'1'`, `'2'`, … per server, in the order the handlers start (C12). It lives in the `Telemetry` value, not in module state, so every `startInMemoryServer` starts at `'1'`.

#### C6. `diagnostics.ts` (FR-015)

```ts
export type McpDiagnosticSource = 'parser' | 'validator' | 'type' | 'linker' | 'compiler' | 'eligius-lint' | 'review' | 'fmt';
export interface McpDiagnostic {
  readonly source: McpDiagnosticSource; readonly severity: CheckSeverity; readonly code: string;
  readonly message: string; readonly file: string; readonly line: number; readonly column: number;
  readonly endLine?: number; readonly endColumn?: number; readonly excerpt: string;
  readonly suggestions?: readonly string[]; readonly quickFix?: QuickFix;
  readonly docs?: string; readonly fix?: string;
}
export const McpDiagnosticSchema: Schema.Struct<…>;   // used in eligian_check's success schema
export function sourceOf(code: string): McpDiagnosticSource;
export function excerptOf(source: string, line: number, endLine: number): string;
export function toMcpDiagnostics(
  results: readonly CheckFileResult[],
  overlays: Overlays,                         // C7
  readSource: (file: string) => string
): McpDiagnostic[];
```

- `sourceOf`: a `DIAGNOSTIC_CODES` entry (`validators/codes.ts:183`, `{ code, source }`, root-exported at `index.ts:111`; `DiagnosticSource` = `'parser' | 'validator' | 'type' | 'linker' | 'compiler'`, `codes.ts:18`) → its source; `eligius-*` → `'eligius-lint'`; `compile-failed` → `'compiler'`; `REVIEW_CODES` → `'review'`; anything else (for example `'uncoded'` from `check.ts` `codeOf`) → `'validator'`. The drift spec keeps that fallback unused on the corpus.
- `excerptOf`: lines `line … min(endLine, line + 2)` of the file split on `/\r?\n/` (CRLF-safe), joined with `\n`.
- Overlays: `docs` = the code's overlay id, else its source's generic overlay id; `fix` (the overlay text) only on the first diagnostic of each code in one response (FR-015).

#### C7. `knowledge/` (FR-019, FR-035, FR-036)

```ts
// knowledge/types.ts
export type ChunkKind = 'orientation' | 'mapping' | 'runtime' | 'workflow' | 'reference' | 'operation' | 'starter';
export interface IndexEntry {
  readonly id: string; readonly title: string; readonly kind: ChunkKind; readonly use_cases: readonly string[];
  readonly words: number; readonly see: readonly string[]; readonly card: string;
}
export interface Overlay { readonly docs: string; readonly fix: string }
export interface Overlays { readonly byCode: Readonly<Record<string, Overlay>>; readonly bySource: Readonly<Record<string, Overlay>> }
export interface Knowledge {
  readonly index: readonly IndexEntry[];
  readonly body: (id: string) => string | undefined;
  readonly headings: (id: string) => readonly string[];
  readonly overlays: Overlays;
}

// knowledge/load.ts
export const loadKnowledge: (docsRoot: URL | string) => Effect.Effect<Knowledge, ToolInternal>;   // cached per docsRoot

// knowledge/search.ts
export interface SearchHit { readonly id: string; readonly score: number; readonly heading?: string }
export function searchIndex(knowledge: Pick<Knowledge, 'index' | 'headings' | 'body'>, query: string, limit?: number): SearchHit[]; // limit 8

// knowledge/render.ts (shared with the generator; ControllerMetadata, TimelineEventMetadata
// are type imports from '@eligian/language/mcp', A7)
export function operationCard(signature: OperationSignature, options?: { readonly host?: boolean }): string;
export function controllerCard(metadata: ControllerMetadata): string;
export const CONTROLLER_STATUS: Readonly<Record<string, 'do-not-use' | 'constrained'>>; // FR-037
export function eventName(event: TimelineEventMetadata): string;   // first line of name (C9)
export function eventLine(event: TimelineEventMetadata): string;

// knowledge/lint-rules.ts
export const ELIGIUS_LINT_RULES: readonly string[];   // FR-036, 14 rules
```

- `loadKnowledge` reads `index.json`, `overlays.json` and every chunk file once (< 1 MB), strips frontmatter, keeps bodies and `##` headings in memory. A missing `index.json` → `ToolInternal` naming `docsRoot` (spec edge case).
- `operationCard` text starts with exactly three lines `NEEDS: …`, `PROVIDES: …`, `ERASES: …` (from `dependencies`, `outputs` and the `erased` flags of `OperationSignature`, `compiler/operations/types.ts:69-139`), then `RESOLVES CHAINS IN: …` (`SELF_RESOLVED`), the positional parameters (type / enum / required / default / erased), the description and an Eligian call form `name(arg1, arg2?)`. With `host: true`: `NEEDS: none declared (host operations declare no needs)` / `PROVIDES: none declared` (`hostSignature`, `host-operations.ts:73-87`: `dependencies: []`, `outputs: []`).
- `searchIndex`: lower-case tokens split on non-alphanumerics and camelCase. Routing rule first: when a query token equals a registry operation name (case-insensitive), the hits start with `operation/<name>` and `operations-index`. Then scores: id/title token 8, `use_cases` 4, card 3, heading 2 (the best heading is returned), body `log2(1 + count)` for non-operation chunks only; ties by id; top `limit`.

#### C8. `instructions.ts` (FR-018, FR-026)

```ts
export const MCP_PHASE = 1 as const;
export const INSTRUCTIONS_PHASE_1: string;
export const INSTRUCTIONS: Readonly<Record<typeof MCP_PHASE, string>>;   // { 1: INSTRUCTIONS_PHASE_1 }
/** The AGENTS.md block between <!-- eligian:begin --> and <!-- eligian:end -->: workflow + rules,
 *  and the docs pointer `node_modules/eligian/dist/docs` (FR-026). */
export function agentsMdBlock(): string;
```

`INSTRUCTIONS_PHASE_1` (about 2,100 chars; tools and ids backticked, FR-018):

```
Eligian: a DSL compiled to Eligius presentation JSON (timelines of timed actions; an action is a
chain of operations over one shared operationData bag). No model was trained on Eligian. Do not
write it from memory. If a construct is not in `syntax-cheatsheet`, Eligian does not have it: read
`not-eligian` for the alternative, or ask.

Use these tools whenever a task touches .eligian files, layout HTML, CSS, locales.json or a host
module of an Eligius presentation:
- `eligian_docs`: FIRST for a new presentation: ids `storyboard`, `decisions`, `project-layout`,
  then write STORYBOARD.md. Before each construct you have not written this session: its map-*
  card (index) or body (detail:true). Read `operations-index` once.
- `eligian_operations`: BEFORE calling any operation not in your session so far; batch with
  names:[...]. Cards lead with NEEDS / PROVIDES / ERASES.
- `eligian_init`: scaffold a new project from a starter (writes files; next steps in the reply).
- `eligian_check`: after EVERY edit until 0 errors and 0 warnings. Each diagnostic carries its fix.
- `eligian_fmt`: write:true once check is clean.

Rules the engine imposes:
1. A fired block has nothing selected. Timeline, lifecycle and init blocks start with {};
   event actions start with {eventArgs}; listener actions get the controller's data plus
   eventTarget/eventKey; a called action gets a copy plus its arguments. Select before you mutate.
2. Nothing flows back from a called action. Start and end blocks are independent runs.
3. The DOM is a function of the position: every visible state belongs to a range that covers it,
   an end block is the exact inverse of its start, and skipped ranges never run on seek.
4. A selector must exist in layout.html or the imported CSS; check rejects the rest.
5. Every controller added in on enter is removed in on leave. Durations live on the timeline,
   not in wait()/animate() milliseconds.
Review STORYBOARD.md against the timelines you wrote before declaring done.
```

#### C9. Tools (`tools/<name>.ts`, FR-016–FR-026)

Every tool file exports the same shape:

```ts
export const NAME = 'eligian_<name>' as const;
export const DESCRIPTION: string;
export const KEYWORDS: readonly string[];          // each in DESCRIPTION.slice(0, 200), case-insensitive
export const Parameters: Schema.Struct<…>;
export const Success: Schema.Struct<{ header: typeof Schema.String /* first */; … }>;
export const summarizeArgs: (params: typeof Parameters.Type) => Readonly<Record<string, unknown>>;
export const makeTool: (ai: EffectAi) => /* ai.Tool.make(NAME, { description, parameters, success, failure: ToolFailure, dependencies }) + annotations */;
export const handle: (params: typeof Parameters.Type, context: ToolContext) => Effect.Effect<typeof Success.Type, ToolError, Requirements>;
// check, fmt, operations: dependencies = [CompilerLock], Requirements = CompilerLock
// docs, init:              no dependencies,           Requirements = never
```

`ToolContext = { ai: EffectAi; cwd: string; docsRoot: URL | string; versions: { compiler: string; eligius: string }; requestId: string }` (`requestId`: the per-server call id, C12). `Tool.make(name, { description?, parameters?, success?, failure?, failureMode?, dependencies?, … })` (`Tool.d.ts:896`); `.annotate(ai.Tool.Meta, { 'anthropic/alwaysLoad': true })` (`Meta`, `:1317-1336`), `.annotate(ai.Tool.Readonly, true)` / `Destructive` / `Idempotent` (`:1361`, `:1385`, `:1410`). `McpServer` emits them as `annotations.readOnlyHint` / `destructiveHint` / `idempotentHint` and `_meta` (`McpServer.js:1549-1561`). The success schema must encode to an object-root JSON Schema, or `McpServer` dies at registration (`McpServer.js:1540-1541`); every `Success` is a `Schema.Struct`.

**Handler requirements.** A handler may require only `Tool.HandlerServices<T>` = the parameters' `DecodingServices` | `ResultEncodingServices<T>` | the tool's `_Requirements` (`Tool.d.ts:716`), and `_Requirements` come only from `Tool.make`'s `dependencies` option (`Tool.d.ts:896`, `:929-931`). `HandlersFrom` types every handler that way (`Toolkit.d.ts:136-143`) and `toolkit.toLayer<Handlers extends HandlersFrom<Tools>>` enforces it (`Toolkit.d.ts:66-70`), so a handler with `R = CompilerLock` and no `dependencies` fails `tsc`. Therefore the `makeTool` of `eligian_check`, `eligian_fmt` and `eligian_operations` passes `dependencies: [CompilerLock]` (our own `Context.Service`, a value the static-import rule allows); `eligian_docs` and `eligian_init` pass none and their `handle` has `R = never`. `McpServer.toolkit(toolkit)` then requires `CompilerLock` (`Exclude<Tool.HandlerServices<…>, McpRequestContext>`, `McpServer.d.ts:388`), and `makeServerLayer` provides it exactly once (C10). Providing a lock inside a handler (`Effect.provide(CompilerLockLive)`) is forbidden: it would build a new semaphore per call and silently drop FR-010's serialisation.

`header` = `` `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${resolvedPath ?? '-'}` `` (FR-005). `header` is the first Struct field so the encoded JSON starts with it (asserted: `content[0].text.startsWith('{"header":')`).

| Tool | Parameters | Success payload | Reuses | Lock |
| --- | --- | --- | --- | --- |
| `eligian_docs` (upfront, Readonly) | `ids?: Array(String)` max 6, `detail?: Boolean`, `query?: String` | `{ header, index?, cards?: {id,title,card}[], bodies?: {id,title,body}[], hits?: {id,title,heading?,card}[], notReturned?: string[], unknown?: {id, closest}[] }` | `loadKnowledge`, `searchIndex`; closest ids via `findSimilarClasses` (`css/levenshtein.ts:93`, root-exported through `index.ts:30`) | no |
| `eligian_operations` (upfront, Readonly) | `names?: Array(String)` (no schema limit), `query?`, `category?`, `needs?`, `provides?`, `kind?: 'operation'|'controller'|'event'|'dom-event'|'key'`, `path?` | `{ header, cards: {name, kind, text}[], unknown: {name, suggestions}[], entries?: {name, description}[], categories?: Record<string, string[]>, notReturned?: string[] }` | `getOperationSignature(name, context?)`, `getAllOperations()`, `getOperationsByCategory()`, `findOperationsWithDependency(name)`, `findOperationsWithOutput(name)`, `searchOperations(query)`, `suggestSimilarOperations(name, max?, dist?)` (`compiler/operations/index.ts`, root-exported); `CONTROLLERS`, `TIMELINE_EVENTS`, `DOM_EVENTS`, `KEY_COMPLETIONS`, `hostOperations`, `hostControllers`, `hostFunctions` | only with `path` |
| `eligian_check` (upfront, Readonly) | `paths: Array(String)` min 1, `selectorNotInLayout?: 'off'|'ids'|'all'` = `'ids'`, `lint?` = true, `review?` = true, `maxWarnings?: Number` = 0 | `{ header, ok, root, files: {file, errors, warnings}[], diagnostics: McpDiagnostic[], summary: string }` | `resolveInputPatterns` → `checkPaths` → `toMcpDiagnostics` | yes, the whole check |
| `eligian_fmt` (deferred, Destructive false, Idempotent true) | `paths: Array(String)` min 1, `write?` = false | `{ header, files: FmtFileResult[], written: string[] }` | `resolveInputPatterns` → `fmtFiles` | yes |
| `eligian_init` (deferred, Destructive false, Idempotent true) | `directory: String`, `template: 'blank'|'chapters'|'video'|'library'`, `title?`, `force?` = false, `agents?` = true | `{ header, directory, template, written: string[], skipped: {file, reason, content}[], nextSteps: string[] }` | `runInit` (`init.ts:38`), `starterFiles` (`starters.ts:79`), `titleFromDirectory` (`init.ts:28`), `agentsMdBlock` | no |

Details:
- **docs** (FR-019): no argument → `index`: non-operation entries whole, `kind: operation` entries `{ id, title }`; `ids` without `detail` → `cards`; with `detail` → `bodies` up to 6,000 words, the rest in `notReturned`; `query` → `hits` (≤ 8, cards, no bodies); unknown ids → `unknown` with the 3 closest ids. Several inputs in one call are answered together in one payload.
- **operations** (FR-020–FR-022): `names` → one card per known name, else an `unknown` entry with `suggestSimilarOperations(name)`; the filters (`query`, `category`, `needs`, `provides`) intersect; `kind` other than `operation` → `entries` (controller cards with the FR-037 status line first; event names per C9); no argument → `categories` plus a pointer to `operations-index`. At most 25 cards per response, the rest named in `notReturned`. This cap is a plan addition, recorded in `compliance.md`: FR-020 sets no limit, so `names` has no schema maximum and a long list is never a JSON-RPC refusal (C3); the cap only keeps one response near the docs index's 12,000-char scale (SC-011), and SC-010 asserts it. With `path`: `resolveInputPath` → read (`Effect.tryPromise`, `toToolError('read', file)`: a missing file is `ToolNotFound`, C4) → under the lock, `getOrCreateServices().Eligian.parser.LangiumParser.parse<Program>(source).value` (C5) → `getOperationSignature(name, program)`, `hostOperations(program)` etc.; host cards use `operationCard(sig, { host: true })`.
- **check** (FR-023): `ok = errors === 0 && warnings <= maxWarnings`; `summary` like `2 files: 0 errors, 1 warning (max 0)`; `files` includes the library results added by `withCompiledChecks`. The description says the defaults are stricter than the CLI's (FR-017).
- **fmt** (FR-024): syntax-error files get `error` and are never written. `written` lists the absolute paths this call rewrote (empty in check mode; files already formatted are not in it). `fmtFiles` runs in `Effect.tryPromise` with `toToolError('write')`: a failed write is `ToolIoError` naming the file from the fs error's `path` (B6, C3).
- **init** (FR-025, FR-026): `target = resolveInputPath(root, directory)`; written files = `Object.keys(starterFiles(template, { title: title?.trim() || titleFromDirectory(target) }))`; `runInit(target, { template, title, force, cwd: root.root })`; `exitCode 1` → `ToolIoError` (C11); `runInit` runs in `Effect.tryPromise` with `toToolError('write', target)`, so a failed `fs.mkdir` / `fs.writeFile` (`init.ts:66-67`) is `ToolIoError` too; `exitCode 2` cannot happen (the schema restricts `template`). Agent files, each only when absent (else in `skipped` with the content the tool would have written): `.mcp.json` = `{ "mcpServers": { "eligian": { "command": "node", "args": [path.join(target, 'node_modules', 'eligian', 'bin', 'cli.js'), "mcp"] } } }`; `AGENTS.md` = `agentsMdBlock()`; `CLAUDE.md` = `@AGENTS.md\n`; each existence test and write is an `Effect.tryPromise` with `toToolError('write', <that file>)`. `nextSteps`: `npm install` (the server path exists only afterwards), `eligian_docs` ids `storyboard` and `decisions`, `eligian_check` on `main.eligian` after every edit, `eligian_fmt` with `write: true`, `npx eligian dev main.eligian` to look at it.

#### C10. `server.ts` (FR-002, FR-003, FR-018)

```ts
export interface ServerOptions {
  readonly cwd: string;
  readonly docsRoot?: URL | string;           // default new URL('./docs/', import.meta.url)
  readonly lock?: Layer.Layer<CompilerLock>;  // default CompilerLockLive
}
export const SERVER_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'] as const;   // SC-029
/** The adapters for SERVER_PROTOCOL_VERSIONS, in that order: exactly what makeServerLayer passes as `protocols`. */
export function serverProtocols(ai: EffectAi): Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>;
/** The server as a Layer over a Stdio service (in-process tests provide Stdio.make). */
export function makeServerLayer(options: ServerOptions): Promise<Layer.Layer<never, Cause.IllegalArgumentError, Stdio.Stdio>>;
export function runServer(options: ServerOptions): Promise<void>;
```

- `serverProtocols(ai)` = `Arr.map(SERVER_PROTOCOL_VERSIONS, version => ({ '2025-11-25': ai.McpProtocol.v2025_11_25, '2025-06-18': ai.McpProtocol.v2025_06_18 })[version])` (adapters `McpProtocol.d.ts:184`, `:192`; `v2026_07_28`, `:176`, has no entry and cannot be listed). `layerStdio` takes `protocols: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>` (`McpServer.d.ts:249-258`), and `Arr.map` keeps the tuple non-empty. There is one list, so the value SC-029 asserts is the value the server is built with.
- `makeServerLayer`: `const ai = await import('effect/ai')`; `const telemetry = makeTelemetry(process.env.ELIGIAN_MCP_LOG)` (C5); `toolkit = ai.Toolkit.make(docs.makeTool(ai), operations.makeTool(ai), check.makeTool(ai), fmt.makeTool(ai), init.makeTool(ai))` (`Toolkit.make(...tools)`, `Toolkit.d.ts:337`); `handlers = toolkit.toLayer({ eligian_docs: params => telemetry.withTelemetry(NAME, summarizeArgs(params), requestId => docs.handle(params, { …ctx, requestId }).pipe(catchDefects, Effect.mapError(toToolFailure(header)))), … })` (`toLayer(build)`, `Toolkit.d.ts:66-70`; `catchDefects`, C3). The composition, written out:

```ts
const tools = ai.McpServer.toolkit(toolkit).pipe(       // McpServer.d.ts:388: needs the handlers and CompilerLock (C9)
  Layer.provide(handlers),
  Layer.provide(options.lock ?? CompilerLockLive)         // the one lock instance of this server
);
return tools.pipe(
  Layer.provide(ai.McpServer.layerStdio({                 // Layer<McpServer | McpServerClient, IllegalArgumentError, Stdio>
    name: 'eligian',
    version: getCompilerVersion().compiler,
    instructions: INSTRUCTIONS[MCP_PHASE],
    protocols: serverProtocols(ai),
  })),
  Layer.provide(stderrLoggerLayer)                        // C1; provided to the whole graph, never merged
);
```

  - The lock is provided once, to the registration layer. `registerToolkit` captures that context (`Effect.context()`, `McpServer.js:1487-1503`) and every tool call runs under it (`Effect.provideContext(services)`, `:1567-1573`), merged with the handler's own build context (`Toolkit.js:218`). So the three locked tools see one semaphore (SC-005 › `the three locked tools share one lock`).
  - `Layer.provide(stderrLoggerLayer)` is the outermost provide, so the `layerStdio` server, the toolkit registration and every handler log through `console.error`, including `catchDefects`' `Effect.logError` and McpServer's own logs. A `Layer.merge` would leave them on Effect's default `console.log` logger (correction C10), which in-process servers (never redirected, C1) would write to stdout; the SC-002 logger test fails on that.
- `runServer`: `const out = redirectConsoleToStderr()`; `const layer = await makeServerLayer(options)`; `Effect.runPromise(Layer.launch(layer.pipe(Layer.provide(layerNodeStdio(out)))))`. When stdin ends the process exits 0; the spike fixes the mechanism (the stdio protocol ends the launch, or `process.stdin.once('end', …)` interrupts it).
- `serverInfo.version` = `getCompilerVersion().compiler` (FR-002; `1.1.0` in the bundle, C1).
- Cancellation (FR-009): `McpServer` maps `notifications/cancelled` to an `Interrupt` of the request (`McpServer.js:771-790`) and suppresses the response of a cancelled request (`:690-694`, `:1380-1393`); SC-022 asserts the observable behaviour on the stdio transport.

## Data and generation design

### Generator

`packages/cli/scripts/generate-knowledge.ts` (tsx; outside `tsconfig.json` `include: ["src/**/*.ts"]`; not under `effect:check` or coverage; FR-032):

```ts
export interface GenerateOptions { readonly outDir: string; readonly curriculumDir?: string }  // default src/mcp/knowledge/curriculum
export async function generateKnowledge(options: GenerateOptions): Promise<{ readonly files: readonly string[] }>;
// command line: tsx scripts/generate-knowledge.ts --out dist/docs
```

It imports `@eligian/language` (root), `@eligian/language/mcp`, the installed eligius schema (`createRequire(import.meta.url).resolve('eligius/package.json')` → `jsonschema/eligius-configuration.json`, as `esbuild.mjs:27-29` resolves eligius), and `../src/mcp/knowledge/render.ts` + `lint-rules.ts` + `../src/mcp/instructions.ts`, so cards in the docs and in `eligian_operations` cannot differ.

| Output (under `outDir`) | id | kind | Source |
| --- | --- | --- | --- |
| `index.json` | — | — | every chunk's frontmatter + `words` (body word count), sorted by id |
| `overlays.json` | — | — | `curriculum/diagnostics/*.md` → `{ byCode: { <code>: { docs: 'diagnostic/<code>', fix } }, bySource: { <source>: { docs: 'diagnostic/source-<source>', fix } } }` |
| `agents-block.md` | — | — | `agentsMdBlock()` (read by the eval harness, which imports nothing from `packages/**/src`) |
| `curriculum/<id>.md` | `what-is-eligius`, `what-is-eligian`, `project-layout`, `not-eligian`, `decisions` (orientation); `map-dataflow`, `map-actions-and-calls`, `map-timeline-and-providers`, `map-events-and-interactions`, `map-controllers` (mapping); `runtime-engine-lifecycle`, `runtime-scheduling` (runtime); `storyboard` (workflow) | as listed | hand-written; `map-*` probes spliced |
| `curriculum/diagnostics/<code>.md`, `curriculum/diagnostics/source-<source>.md` | `diagnostic/<code>`, `diagnostic/source-<source>` | overlay, not in `index.json` | hand-written, ≤ 120 words, frontmatter `code` or `source` |
| `generated/operations-index.md` | `operations-index` | reference | `getOperationsByCategory()`, `SELF_RESOLVED` |
| `generated/operations/<name>.md` | `operation/<name>` | operation | `getAllOperations()` → `operationCard` |
| `generated/dataflow-tables.md` | `dataflow-tables` | reference | `SELF_RESOLVED`; parameter and output `erased` flags; persistent (non-erased) outputs |
| `generated/controllers.md` | `controllers` | reference | `CONTROLLERS` + `CONTROLLER_STATUS` |
| `generated/events.md` | `events` | reference | `TIMELINE_EVENTS` (`eventName`, C9), `eligiusTypeToDslAnnotation` |
| `generated/syntax-cheatsheet.md` | `syntax-cheatsheet` | reference | `getOrCreateServices().Eligian.Grammar` (C6): keywords, the `ActionName` alternatives (`eligian.langium:493-495`), one line per parser rule |
| `generated/starters/<name>.md` | `starter/<name>` | starter | `STARTERS` (`starters.ts:33`), `starterFiles(name)` verbatim in fenced blocks |
| `generated/config-shape.md` | `config-shape` | reference | the schema's top-level `properties`; the `config-builder.ts` facts as prose; the "trust `eligius/lint`, not the schema" rule |
| `generated/diagnostics.md` | `diagnostics` | reference | `DIAGNOSTIC_CODES` (139), `REVIEW_CODES`, `compile-failed`, `ELIGIUS_LINT_RULES`: one `code · source · overlay id` line each, no overlay text |

`ELIGIUS_LINT_RULES` = `['E001','E101','E111','E120','E130','E131','E140','E141','E160','E310','W110','W150','W151','W160']`: the 15 rule literals of the installed `lint.mjs` minus `LINT_RULES_CHECKED_BY_ELIGIAN` = `['W111']` (`eligius-lint.ts:23`, filtered out in `lintCompiledConfig`).

Frontmatter (FR-035): `id`, `title`, `kind`, `use_cases` (list), `see` (list), `card` (≤ 120 words). Bodies end with a `see:` line. Determinism: sorted iteration everywhere, `\n` line endings, no timestamps, `JSON.stringify(…, null, 2)`. `outDir` is deleted first (`rmSync(outDir, { recursive: true, force: true })`), so a dev build has no stale chunk (FR-032).

### Literate probes (FR-038)

- In a `map-*.md`, a block opened by ` ```eligian probe ` is a complete program. Probes may import `./probe.css` and `./probe-layout.html` from `src/mcp/knowledge/curriculum/probe-assets/`; each is compiled with `compileWithMap(source, { sourceUri: <probe-assets>/probe-<chunk>-<n>.eligian })` (`pipeline.ts:264`) so relative imports resolve there.
- The block spliced after it is ` ```json compiled `, holding `{ actions: { [name]: { startOperations, endOperations } }, timelines: { [uri]: { type, duration, timelineActions: [{ name?, duration, startOperations, endOperations }] } }, initActions? }`, with every `id` key removed recursively.
- A probe that does not compile fails the generator with the chunk id, the probe index and the compile error, so a broken probe breaks the build, not only the spec.

### Curriculum source rules (FR-039)

- **The chunk list.** The 13 ids and kinds of the generator table (5 `orientation`, 5 `mapping`, 2 `runtime`, 1 `workflow`). `mcp-knowledge.spec.ts` › `curriculum` › `ships the FR-039 chunks` asserts that each id is an `index.json` entry of that kind; SC-004's check of the ids the instructions name does not cover them all.
- **Runtime claims (C chunks).** A sentence of `runtime-engine-lifecycle.md` or `runtime-scheduling.md` that says what the engine does at runtime ends with the model doc's own marker, `(probed: "<title>")` (the convention of `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md:11-17`), copied verbatim. The marker ships in the chunk: it tells the agent the sentence is tested. A paragraph about what the Eligian compiler emits starts with `Compiler:` and carries no marker, as in the model doc. `mcp-knowledge.spec.ts` › `curriculum` › `runtime chunks teach only probed claims` asserts on the source files:
  - (a) every paragraph and list item of a `runtime-*` body, outside headings, fenced code, `Compiler:` paragraphs and the `see:` line, holds at least one marker;
  - (b) every marker title is one of the `CLAIMS` string literals of `packages/cli/src/__tests__/mcp-runtime-claims.spec.ts` (`:25-41`, read as text, since `CLAIMS` is not exported; 15 titles today), and occurs as `(probed: "<title>")` in the model doc;
  - (c) no runtime chunk contains `not probed`.

  A sentence the model doc marks `(not probed, Phase 0)` (47 today) has no title to cite, so it cannot be taught.
- **Negative source rules.** "`KNOWN_ISSUES.md` may not be mined" and "`examples/demo.eligian` is not a source" are not mechanically checkable. `compliance.md` records a manual review step: for each runtime chunk, each claim quoted with its test title, and a statement that no chunk was written from `KNOWN_ISSUES.md` or `examples/demo.eligian`.

### Overlay selection (FR-040, FR-055)

`packages/cli/scripts/rank-diagnostic-codes.ts` (tsx; package script `rank:diagnostic-codes`):

```ts
export async function rankDiagnosticCodes(): Promise<{ counts: { code: string; count: number }[]; caseCodes: string[]; selection: string[] }>;
// writes packages/cli/scripts/diagnostic-code-ranking.json
```

Corpus: `expandPatterns(['packages/cli/src/__tests__/__fixtures__/**/*.eligian', 'packages/language/src/**/__fixtures__/**/*.eligian', 'examples/**/*.eligian'], repoRoot)`, checked with `checkPaths(files, { selectorNotInLayout: 'ids', lint: true, review: true })`. `caseCodes` = the codes of `evals/mcp/cases/{fix-dataflow,fix-selectors}/start/**` under the same check, sorted: the start-state codes the "Eval harness" lists (C13). `selection` = `caseCodes`, then the highest counts (ties by code) up to 30. The overlay files are exactly `selection` ∪ `REVIEW_CODES` ∪ one generic per source (`parser`, `validator`, `type`, `linker`, `compiler`, `eligius-lint`, `review`; `fmt` diagnostics are not produced in Phase 1).

### Drift test

`mcp-knowledge.spec.ts` runs `generateKnowledge` twice, into two `fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-docs-'))` dirs, in `beforeAll`, and checks the FR-041/FR-042 list (see the test plan). The allowlist of codes without overlays is `packages/cli/src/__tests__/__fixtures__/mcp/missing-overlays.json` (shrink-only).

## Test plan

Conventions: CLI specs in `packages/cli/src/__tests__/`, fixtures in `__fixtures__/mcp/<topic>/`; language specs next to the code they test. In-process MCP tests go through `mcp-test-client.ts`. Spawned tests use a raw NDJSON helper. Note for parity tests: the shared services seed test CSS when `process.env.VITEST` is set (`compiler/pipeline/services.ts:47-50`), and spawned children inherit it; the seeded URIs are only `file:///styles.css` and `file:///memory/styles.css` (`:93-94`), so real fixture paths are unaffected, but the SC-021 parity test spawns with `VITEST` removed from the env anyway.

### Test client — `mcp-test-client.ts`

```ts
export interface InMemoryServer {
  readonly request: (method: string, params?: unknown, id?: number) => Promise<JsonRpcResponse>;
  readonly notify: (method: string, params?: unknown) => Promise<void>;
  readonly frames: () => readonly unknown[];      // every frame the server wrote
  readonly callTool: (name: string, args: unknown) => Promise<{ payload: any; isError: boolean; raw: unknown }>;
  readonly client: () => Promise<McpClient>;      // effect/ai McpClient over an in-memory Transport
  readonly close: () => Promise<void>;
}
export function startInMemoryServer(options: ServerOptions): Promise<InMemoryServer>;
export function spawnServer(options?: { env?: NodeJS.ProcessEnv; preload?: string; cwd?: string }): SpawnedServer;
```

- `startInMemoryServer`: `makeServerLayer(options)` provided with a `Stdio.make` whose `stdin` is a `Stream` over an Effect `Queue` the helper offers request lines to, and whose `stdout` is a `Sink.forEach` that records each frame and resolves pending requests by id. `callTool` parses `content[0].text` and, on success, asserts it deep-equals `structuredContent` (FR-005). Each call builds a new server, with its own lock (unless `options.lock` is given) and its own call counter (C5, C12).
- `client()` builds an `McpClient.Transport` by hand: `{ '~effect/ai/McpClient/Transport': '~effect/ai/McpClient/Transport', protocol: McpProtocol.v2025_11_25, request, notify, isCallable: () => true }` (`McpClient.d.ts:185-194`; `TransportTypeId` is the string literal at `:287`, not exported) and calls `McpClient.make({ name: 'test', version: '0' })` (`:136-144`) in a scope. It serves SC-003's listing; raw `request` / `notify` drive SC-005 and SC-022, which need exact ids and `notifications/cancelled`.
- `spawnServer`: `child_process.spawn(process.execPath, [preload ? '--import' : …, bin, 'mcp'])` with the line-buffered parser of `package-bin.spec.ts:122-141`.

### Per requirement

| SC / FR | Spec file | describe › it | Strategy |
| --- | --- | --- | --- |
| SC-001, FR-001, FR-048 | `package-bin.spec.ts` | `the eligian npm package` › `mcp answers initialize in under 3 s` (runs once `--help` lists `mcp`) | existing spawned test (`:116-165`) plus `expect(result.serverInfo.version).toBe(pkg.version)` (C1); and `expect(answer.result.protocolVersion).toBe('2025-06-18')`. effect falls back to the first stateful protocol for an unlisted version (`selectStatefulProtocol`, `effect/dist/ai/internal/mcpRuntime.js:70`), so `toBeDefined()` alone would pass without `v2025_06_18`; only the exact echo proves it is listed (SC-029). The test spawns `process.env.ELIGIAN_BIN` when set (default: the repo bin), so CI also runs it on the installed tarball (SC-016) |
| SC-002 noise | `mcp-stdout.spec.ts` | `stdout carries only protocol frames` › `with console noise after initialize` | `spawnServer({ preload: __fixtures__/mcp/noise.mjs, env: { ELIGIAN_NOISE_TRIGGER } })`; trigger file created after the initialize result; `notifications/initialized`, `tools/list`, one `eligian_check` on `__fixtures__/mcp/noise-project/` (layout, CSS, a library, an Eligius lint finding, a controller imbalance); every stdout line parses with `jsonrpc === '2.0'`; sentinels on stderr only; ≥ 1 telemetry line; `header` matches `/^eligian 1\.1\.0 · eligius \d+\.\d+\.\d+ · eligian_check · /` and the text starts with `{"header":"eligian 1.1.0 · ` (SC-019) |
| SC-002 crash | `mcp-stdout.spec.ts` | › `an uncaught exception goes to stderr` | preload `crash.mjs` throws on the trigger; exit code ≠ 0; message on stderr; every stdout line a complete frame |
| SC-002 logger, FR-006 | `mcp-stdout.spec.ts` | › `a tool defect is logged to stderr and answered as kind internal` | in-process `startInMemoryServer({ cwd, lock: <a CompilerLock layer whose run dies> })`, one `eligian_check`; `vi.spyOn(console, 'error')` and `vi.spyOn(console, 'log')`; assertions (a)–(c) of correction C10 |
| FR-001, FR-031 | `package-bin.spec.ts` | › `help names mcp and the check defaults` | `--help` contains `Run 'eligian <command> --help' (compile, check, fmt, smoke, dev, init, mcp) for its options.` (the epilogue, not commander's command list); `check --help` contains `--no-review` and `(default: "ids")` |
| SC-002 unit | `mcp-stdout.spec.ts` | › `redirectConsoleToStderr routes every writer` | stub `process.stdout.write` / `process.stderr.write`, restore in `finally`; the returned `write` reaches the original stdout |
| SC-003, FR-016 | `mcp-server.spec.ts` | `tool surface` › `lists exactly five tools with their annotations` | in-process `client()` → `listTools()`; exactly the five names; `_meta['anthropic/alwaysLoad'] === true` on exactly the three; `readOnlyHint` true on the three; `destructiveHint: false` + `idempotentHint: true` on fmt and init. Inspector half: the CI step (FR-049) |
| SC-004, FR-017, FR-018 | `mcp-server.spec.ts` | `budgets` › `instructions ≤ 4096`, `upfront descriptions ≤ 1000`, `deferred ≤ 16384, KEYWORDS in the first 200 chars`, `backticked tokens are tools or index ids`, `says check defaults are stricter` | pure; ids from a generated docs dir |
| SC-005, FR-010 | `mcp-concurrency.spec.ts` | `the compiler lock` › `concurrent checks equal sequential ones (20 iterations)`, › `calls wait on the lock`, › `without the lock results differ` | sequential baselines first; 20 × `Promise.all([A, B, fmt])` with `compilerLockLayer(hooks)`; deep-equal ignoring `header`; overlap from hook timestamps (mandatory); negative control with `CompilerLockPassThrough` (dropped to a recorded manual run if 10 local runs show no mismatch); › `the three locked tools share one lock`: `eligian_check`, `eligian_fmt` and `eligian_operations({ names, path })` fired at once, the latch holding the first acquirer; the other two report `onQueued` and no `onAcquire` until it is released, and the three acquire/release intervals are pairwise disjoint (one semaphore per server, C9, C10) |
| SC-022, FR-009 | `mcp-concurrency.spec.ts` | `cancellation` › `a cancelled running check sends no response and the next waits until it settled`, › `a cancelled queued check never runs` | correlation (C12): the sequential baselines run first on a *separate* `startInMemoryServer`, so the server under test assigns call id `'1'` to its first handler; each request is sent only after the previous one's hook fired, so call id `'1'` is JSON-RPC request 1 and `'2'` is request 2 by construction. Running case: latch hook; send request 1; wait for the first `onAcquire` (call `'1'`); `notifications/cancelled { requestId: 1 }`; send request 2 on another fixture; wait for the second `onQueued` (call `'2'`); release the latch; no frame with JSON-RPC id 1 up to 2 s after request 2's response; `onRelease('1')` has `completed: true` and a time ≤ `onAcquire('2')`'s; request 2 deep-equals its baseline. Queued case: request 1 held by the latch; send request 2; wait for `onQueued('2')`; `notifications/cancelled { requestId: 2 }`; release; `onAcquire` is never called with `'2'`, no frame with id 2, request 1 answers |
| SC-006, FR-011–FR-015, FR-023 | `mcp-check.spec.ts` | `eligian_check` › one `it` per SC-006 bullet | fixtures `__fixtures__/mcp/check/<case>/`; exact `code` and `source`; quick fix applied by splicing the 1-based range into a temp copy, re-checked, the code is gone; `suggestions` equal the names in the message's `Did you mean: …?`; `ok` at `maxWarnings` 0 and 10; nonexistent path → `isError`, `kind: 'not-found'`; every diagnostic has `excerpt` and an absolute `file`; `fix` only on the first of each code, later ones `docs` only |
| SC-006 messages, FR-014, FR-045 | `packages/language/src/__tests__/did-you-mean-data.spec.ts` | `suggestions as data` › `messages are unchanged`, › `data.suggestions equals the message's list` | `createTestContext()` + `setupCSSRegistry()`; the Step 0b snapshot |
| FR-013 | `packages/language/src/lsp/__tests__/select-element-fix.spec.ts` | `selectElementFix` › `block branch`, › `target branch`, › `code actions unchanged` | `createTestContext()` documents; compared with `selectElementCodeActions` |
| FR-011, FR-012 | `packages/language/src/compiler/__tests__/check-files.spec.ts` (extend) | `checkFiles` › `copies data.suggestions`, › `adds a 1-based quickFix`, › `no data key when there is nothing` | existing helpers of that file |
| SC-007, FR-028, FR-030 | `review.spec.ts` (CLI), `packages/language/src/compiler/__tests__/controller-balance.spec.ts`, `tour-controllers.spec.ts` | `controller-imbalance` › `with on leave`, `without on leave`, `removal without add`; `class-never-removed` › each SC-007 positive and negative; `walkOperations` › `substitutes arguments`, `records unresolved calls` | fixtures `__fixtures__/mcp/review/*.eligian` with layout and CSS; the quick fix applied mechanically, then `checkPaths` → 0 review findings, 0 errors; the tour check `eligian check examples/eligian-tour/*.eligian --max-warnings 0` spawned (skipIf not built); `git diff --stat -- examples/eligian-tour` empty (compliance) |
| SC-008, FR-031 | `check-command.spec.ts` (extend) | `check defaults (1.1.0)` › the five SC-008 cases | `runCheck` plus the spawned bin for the no-flags case; the Step 0a snapshot; a sixth case pins C14: `--format json` on `__fixtures__/check-data/missing-select.eligian` (an `addClass` with no selection before it: a `missing-dependency` on `'selectedElement'`, which carries `data.quickFix`, A1/A2) matches `__snapshots__/check-json-data.json`, which holds that `data` |
| SC-009, FR-024 | `mcp-fmt.spec.ts` | `eligian_fmt` › `check mode leaves the bytes`, › `write, then formatted`, › `syntax error reported, file untouched`, › `a failed write is kind io` | temp copies; with `write: true`, `written` equals exactly `[<the rewritten file's absolute path>]`; the failed write: the temp file made read-only (`fs.chmodSync(file, 0o444)`: the read-only attribute on Windows, the mode bits on Linux) → `isError`, `kind: 'io'`, `path` = that file, `content[0].text` starts `{"header":`; `fmt.spec.ts` unchanged; Step 0c compared in compliance |
| SC-010, FR-020–FR-022 | `mcp-operations.spec.ts` | `eligian_operations` › the SC-010 bullets | in-process; host fixture `__fixtures__/mcp/host/main.eligian` + `host.ts`; `path: 'missing.eligian'` (inside the root) → `isError`, `kind: 'not-found'`, `path` absolute, text starts `{"header":`; 30 distinct operation names → 25 cards and the other 5 in `notReturned`, not a JSON-RPC error; workspace check through the mcp entry's `getOrCreateServices().shared.workspace.LangiumDocuments` (`all` count before/after; `hasDocument(URI.file(fixture))` false) |
| SC-011, FR-019 | `mcp-docs.spec.ts` | `eligian_docs` › the SC-011 bullets | docs generated in `beforeAll`; 7 ids → JSON-RPC error -32602 (C3); `JSON.stringify(payload).length ≤ 12000` for the no-argument call; › `a missing docsRoot is kind internal`: `docsRoot` = an empty temp dir → `isError`, `kind: 'internal'`, the message names the `docsRoot` (spec edge case), text starts `{"header":` |
| SC-012, FR-025, FR-026 | `mcp-init.spec.ts` | `eligian_init` › `each template` (4), › `refuses existing starter files`, › `skips existing agent files` | temp dirs; `.mcp.json` `args[0]` absolute and ends with `path.join('node_modules', 'eligian', 'bin', 'cli.js')`; `runCheck([entry], { selectorNotInLayout: 'ids', lint: true, review: true, maxWarnings: 0, … })` → exit 0; `nextSteps` non-empty, its first entry mentions `npm install` (FR-025); `AGENTS.md` holds both markers and `node_modules/eligian/dist/docs` (FR-026); › `a write failure is kind io`: `directory` below a regular file (`<tmp>/file.txt/sub`) → `isError`, `kind: 'io'`, text starts `{"header":` |
| SC-013, FR-032–FR-043, FR-055 | `mcp-knowledge.spec.ts`, `dataflow-tables.spec.ts` | `generated docs` › every name; determinism; stale sentinel removed; probes (`toMatchFileSnapshot('__snapshots__/probes/<chunk>-<n>.json')`); word limits; diagnostics catalogue lines; grammar keywords (every `Keyword` reachable from the entry rule of `getOrCreateServices().Eligian.Grammar`, matching `/^[a-z][a-zA-Z]*$/`, named in `syntax-cheatsheet`); lint rule list = `lint.mjs` literals minus W111; `using custom` probe (no diagnostic, `type: 'animation'`); allowlist shrink-only; the review overlays exist; ranking selection = `rankDiagnosticCodes()` (timeout 300 s); `curriculum` › `ships the FR-039 chunks` (each of the 13 ids is an `index.json` entry of its kind: 5 `orientation`, 5 `mapping`, 2 `runtime`, 1 `workflow`) and › `runtime chunks teach only probed claims` (see "Curriculum source rules"). `dataflow-tables` › one `it.each` per operation × parameter | `dataflow-tables.spec.ts`: a one-timeline config whose start op puts `'$operationdata.probe'` in that field, linted with `lintConfiguration` (`eligius/lint`); W150 at that path ⇔ the table says "not resolved". W150 is reported only for operations with Eligius metadata (`lint.mjs:4153`), which the table marks |
| SC-014, FR-033, FR-034 | `package-bin.spec.ts` | › `npm packs the launcher, the bundle, the docs, the README and the LICENSE` | expected list = the five base files + every file under `dist/docs` (recursive, POSIX separators), `dist/docs/index.json` included; the `build:prod` path in compliance |
| SC-015, SC-016, SC-017, SC-024, SC-027 | compliance (manual) | — | quoted command output |
| SC-018, FR-044, FR-045 | `packages/language/src/__tests__/mcp-entry.spec.ts` | `@eligian/language/mcp` › `exports exactly the list`, › `types` | `Object.keys(await import('../mcp.js')).sort()` equals the A7 list; a type-only import of `LayoutElements`, `SelectorNames`, `ParameterRole`, `TimelineSymbol`, `ControllerMetadata`, `TimelineEventMetadata` compiles under `typecheck:tests`; coverage commands |
| SC-019 | `package-bin.spec.ts`, `init.spec.ts`, `mcp-stdout.spec.ts` | — | `--version` = 1.1.0; `^1.1.0`; header (C1) |
| SC-020, FR-003 | `package-bin.spec.ts` › `no static import of jsdom, esbuild or effect/ai` | — | add `expect(code).toMatch(/\bimport\(\s*["']effect\/ai["']\s*\)/)` |
| SC-021, FR-007, FR-008, FR-058 | `mcp-paths.spec.ts` | `telemetry` › `N calls append N lines`, › `an unwritable log file changes no result` (`ELIGIAN_MCP_LOG` inside a nonexistent dir, in-process: the call is not `isError`, and its telemetry line plus one warning reach stderr, `process.stderr.write` spied; C5); `paths` › `announced root` (spawned raw client advertising `capabilities.roots` and answering `roots/list`), `roots/list fails` (spawned raw client advertising `capabilities.roots`; run 1 answers `roots/list` with a JSON-RPC error `-32603`, run 2 never answers and waits out the 2 s timeout; in both a relative path resolves against the spawn cwd and the result is not `isError`), `no roots` (in-process, `cwd` option), `outside the root` (check and operations), `imports outside the root equal the CLI` (`runCheck --format json` vs the tool's diagnostics on `__fixtures__/mcp/outside/inner/main.eligian`, which imports `../shared.css`), `backslash path` (`test.runIf(process.platform === 'win32')`), `read-only tools change nothing` (file list + bytes hashed before/after) | as stated |
| SC-023, SC-025 | gates | — | see "Build integration" |
| SC-026 | `packages/cli/scripts/measure-heap.ts` (tsx, run with `node --expose-gc --import tsx`) | — | N = 100 in-process `eligian_check` calls on one fixture; `heapUsed` after forced GC before and after; quoted in compliance; `grep` of `compiler-lock.ts` for a counter/reset |
| SC-029 | `mcp-server.spec.ts` › `protocols` | — | `serverProtocols(ai).map(p => p.protocolVersion)` equals `['2025-11-25', '2025-06-18']` (the list `makeServerLayer` passes, C10) and holds no `'2026-07-28'`; raw in-process `initialize` with `protocolVersion: '2025-11-25'` answers `'2025-11-25'`, and with `'2025-06-18'` answers `'2025-06-18'` (an exact echo; the fallback would answer `'2025-11-25'`); the `McpClient` connects; the spawned half is the SC-001 row |
| FR-052 | `eval-cases.spec.ts` | `eval case start states` › `fix-dataflow yields exactly its codes`, › `fix-selectors yields exactly its codes`, › `fix-selectors hides a controller imbalance behind its errors` | `checkPaths` with the strict options on `evals/mcp/cases/<id>/start/`; per file, the sorted set of codes equals the "Eval harness" list exactly (none missing, none extra); the third test removes the lines marked `// eval:defect` from a temp copy, checks again and asserts `controller-imbalance` (C13) |

## Build integration

### `packages/cli/package.json`

```jsonc
{
  "version": "1.1.0",
  "files": ["bin/cli.js", "dist/cli.mjs", "dist/docs/**"],
  "scripts": {
    // build / build:prod / prepack unchanged: esbuild.mjs runs the generator
    "generate:knowledge": "tsx scripts/generate-knowledge.ts --out dist/docs",
    "rank:diagnostic-codes": "tsx scripts/rank-diagnostic-codes.ts"
  },
  "devDependencies": {
    "@eligian/language": "workspace:*",
    "@modelcontextprotocol/inspector": "<exact version pinned by the spike>",
    "@types/jsdom": "30.0.0",
    "tsx": "4.23.15"
  }
}
```

### `packages/cli/esbuild.mjs`

- `WORKSPACE_SOURCES['@eligian/language/mcp'] = '../language/src/mcp.ts'`.
- After the production `rmSync(dist)` (`:79`) and before the bundle, in every mode (dev, production, watch: once at start):

```js
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');   // tsx exports './cli'
const generated = spawnSync(
  process.execPath,
  [tsxCli, 'scripts/generate-knowledge.ts', '--out', 'dist/docs'],
  { cwd: here, stdio: 'inherit' }
);
if (generated.status !== 0) process.exit(generated.status ?? 1);
```

The generator imports the *built* `@eligian/language` (package `exports`), so `pnpm -r build` order (language before cli) is required, as for the CLI tests today. `packages/cli/AGENTS.md` says so.

### `packages/language`

`package.json` `exports["./mcp"]`; `esbuild.mjs` `ctxMcp`; `tsconfig.src.json` already covers `src/**` (`out/mcp.d.ts` comes from `tsc --emitDeclarationOnly` in the `build` script).

### Repo files

- `starters.ts:118` `'^1.0.0'` → `'^1.1.0'`; `init.spec.ts:40-49` asserts `^<major>.<minor-that-introduced-mcp>.0` = `^1.1.0`.
- Root `AGENTS.md:41`: "`eligian init` starters depend on `eligian` `^<major>.<minor-that-introduced-mcp>.0`"; one Commands line for `eligian mcp`.
- Root `package.json` `check:examples` (`:25`): add `"!examples/demo.eligian"` and append `&& node packages/cli/bin/cli.js check examples/demo.eligian --selector-not-in-layout off` (FR-054). Because `pnpm run check:examples --format github` appends the flag only to the *last* command, the CI step becomes two explicit `node packages/cli/bin/cli.js check …` lines, each with `--format github`.
- `.github/workflows/ci.yml`:
  - after "Build": a step `MCP inspector gate` running the spike-verified inspector `tools/list` command (through `pnpm -C packages/cli exec mcp-inspector …`) against the repo bin, and a `node -e` assertion that exactly the five tool names are listed;
  - last in the job, a step `MCP on the packed tarball` (SC-016's Linux evidence): `pnpm -C packages/cli pack`; in `${{ runner.temp }}/eligian-pkg`, `npm init -y` and `npm install <absolute tgz path>`; the same inspector `tools/list` and assertion against `node <tmp>/node_modules/eligian/bin/cli.js mcp`; then `ELIGIAN_BIN=<tmp>/node_modules/eligian/bin/cli.js pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts -t "mcp answers initialize"` (the SC-001 initialize test, with its `protocolVersion: '2025-06-18'` echo, on the installed tarball). It is last because `pack` runs `prepack` (`build:prod`), which deletes and rebuilds `packages/cli/dist`.
- `.github/workflows/publish-cli.yml` "Try the package" (`:86-92`): the check line gains `"!examples/demo.eligian"`; a demo line `eligian check examples/demo.eligian --selector-not-in-layout off`; an inspector `tools/call` of `eligian_docs` against `eligian mcp` with a `node -e` check (no `isError`, ≥ 1 index entry). There the inspector runs as `npx -y @modelcontextprotocol/inspector@<pinned>` (the global install has no devDependencies).
- `packages/cli/README.md`: a section "Use with coding agents (`eligian mcp`)": the five tools, the four client snippets (§2 table; the Windows form per SC-016), the `npx -y eligian@^1.1 mcp` fallback, the 1.0.x caveat, the Codex trusted-project note **[UNVERIFIED]**, the security note (FR-047); the `check` section documents the new defaults and `--no-review`.
- `CHANGELOG.md` "Unreleased": Added (`eligian mcp`, the review pass, `@eligian/language/mcp`); Changed (CLI 1.1.0, `check` defaults, starters `^1.1.0`).
- `specs/058-mcp-server/roadmap.md`: the three FR-056 edits.

### Gates (in order; each output quoted in `compliance.md`)

1. `pnpm build` (Langium generate, language bundles incl. `dist/mcp`, CLI bundle + `dist/docs`), `pnpm typecheck`, `pnpm run typecheck:tests`.
2. `pnpm check` (Biome, 0 errors / 0 warnings) and `pnpm run ci`.
3. `pnpm effect:check:language`, `pnpm effect:check:cli` (0/0/0).
4. `pnpm test`; then the built-artifact specs `pnpm -C packages/cli exec vitest run src/__tests__/package-bin.spec.ts src/__tests__/mcp-stdout.spec.ts src/__tests__/mcp-paths.spec.ts src/__tests__/review.spec.ts src/__tests__/check-command.spec.ts` with **0 skipped**. The list is every CLI spec with a test that skips when the bundle is not built (today `package-bin.spec.ts`; the plan adds such tests to `mcp-stdout`, `mcp-paths`, `review` (the SC-007 tour check) and `check-command` (the SC-008 no-flags case)). `compliance.md` quotes `grep -l "skipIf(!built" packages/cli/src/__tests__/*.ts` beside the run, and a spec that gains such a test joins the list.
5. `pnpm -C packages/language test:coverage:ci` (≥ 79.8 / 80 / 69.9) and `pnpm -C packages/cli test:coverage:ci` (≥ 77.1 / 77.6 / 64.5 / 76.6).
6. `pnpm run check:examples`, `pnpm run fmt:examples`, `pnpm run smoke:examples`.
7. `pnpm -C packages/cli run build:prod`; `pnpm -C packages/cli pack`; the SC-015 steps verbatim.
8. Inspector command; Claude Code handshakes (SC-016); eval cases (SC-017).

## Eval harness (FR-050–FR-052)

- `evals/mcp/run.ts` (tsx; outside Biome, whose scope is `packages/**`, and outside every tsconfig): `--case <id> --arm A1 [--model <m>]`. Per FR-050: `pnpm -C packages/cli pack` once; per case a `fs.mkdtempSync` dir; `npm install <abs tarball>` (`shell: process.platform === 'win32'`); fixtures copied from `evals/mcp/cases/<id>/start/`; `.mcp.json` with `node <tmp>/node_modules/eligian/bin/cli.js mcp`; `AGENTS.md` from `<tmp>/node_modules/eligian/dist/docs/agents-block.md`; `ELIGIAN_MCP_LOG=<tmp>/mcp.log`; the `claude -p` driver of FR-050 (switched to `--output-format stream-json --verbose` if the spike shows `json` lacks the per-tool-call transcript, recorded in compliance); the result JSON of SC-017 under `evals/mcp/results/<run-id>/<case>.json`, with `git rev-parse HEAD` and whether `git status --porcelain -- . ':!evals/mcp/results'` is empty.
- `evals/mcp/gate.ts`: FR-051 steps 1–5 by `spawnSync(process.execPath, [<tmp>/node_modules/eligian/bin/cli.js, …])`; inline case checks over `out/config.json`:
  - case 13: the action that held the start state's `addClass` still has it, preceded in its list by `selectElement` or by a `setOperationData` whose `properties` has a `__eligian_param_` key (`preservedParameterKey`, `compiler/transformers/erased-parameters.ts:34`); the erased-property reader is still there; `timelineActions` count ≥ the start state's;
  - case 14: the layout ids; the controller multisets per timeline. The harness may not import `packages/**/src`, so it carries a ~40-line copy of the `controllerBalance` walk, marked as a copy.
- `evals/mcp/cases/fix-dataflow.json` and `fix-selectors.json` + `cases/<id>/start/**`. `eval-cases.spec.ts` (CLI) asserts these start-state codes exactly, per file, under the strict check (FR-052):
  - `fix-dataflow/start/main.eligian`: `erased-property-access` and `missing-action-dependency` (`validators/codes.ts:51`, `:81`), nothing else;
  - `fix-selectors/start/main.eligian`: `import-duplicate-default` (the second `styles` import; `codes.ts:157`, an error, `import-validation.ts:62-69`), `syntax-error` (the bare `on click`; `codes.ts:22`) and `selector_not_in_layout` (the CSS-only selectors, with a `layout` import and the `ids` default; `codes.ts:102`), nothing else. The CSS-only selectors live in an action declared before the timeline and the bare `on click` is the last item of the timeline body, so parser recovery cannot hide the other defects; both error lines end with `// eval:defect`;
  - the `on enter` controller without removal is no start-state code (C13); `eval-cases.spec.ts` proves it is planted: with the `// eval:defect` lines removed, the check yields `controller-imbalance`.

  If a fixture, once written, yields a different code for a planted defect, the fixture is changed until this list holds, or the list is amended here with the reason; the test asserts the list the plan states.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Concurrency on the Langium singleton: `checkFiles` flips `Settings.selectorNotInLayout` (`check.ts:75-82`) and adds/releases documents (`:187`, `:244`); `compileFile` parses into the same workspace | wrong or flaky diagnostics | `CompilerLock` around the whole check (checkFiles + compile + lint + review), fmt and the operations parse; uninterruptible once acquired; SC-005 (overlap metric + negative control), SC-022 |
| Two singletons under vitest (`dist/index.cjs` vs `dist/mcp/index.cjs`) | a test reads the wrong workspace | only parse-only consumers use the mcp entry's services (C5, A7); SC-010 reads the entry the tool uses; the production bundle has one copy |
| `effect/ai` is `@stability unstable`; its declared-failure encoding is subtle (C2) | wrong wire shape | `effect` pinned exactly (4.0.7); FR-005 asserted on raw frames in-process and spawned; the spike records the encoding |
| Parameter refusals are JSON-RPC errors (C3) | an agent sees a protocol error | descriptions state the one schema limit (≤ 6 ids; `names` has none, its overflow goes to `notReturned`); the test asserts -32602 |
| jsdom globals | none in Phase 1 | no smoke tool in Phase 1; `jsdom` stays a dynamic import (asserted in `package-bin.spec.ts`) |
| stdout pollution (Langium / Typir / eligius `console.log`, the Effect logger, uncaught errors) | protocol corruption | process-wide redirect before the layer is built; Effect logger to `console.error`; SC-002 noise, crash and logger runs |
| Startup time (`effect/ai` import, Langium services on the first compiler call) | client start-up timeout | `effect/ai` lazy; services created on the first compiler call, not at `initialize`; docs loaded on the first `eligian_docs`; SC-001 measures < 3 s on Windows and Ubuntu |
| Windows paths: backslashes, drive-letter case, library URIs with a lower-case drive (`check-command.ts:141-145`) | false "outside the root", lost library findings | `isInside` case-insensitive on win32; `withCompiledChecks` keeps the `path.relative(…) === ''` owner match; `.mcp.json` via `path.join`; SC-021 backslash test on Windows |
| `npx` on native Windows may need `cmd /c` **[UNVERIFIED]** | the README snippet fails | SC-016 settles it; the README records the working form per client |
| Inspector 2.x CLI syntax **[UNVERIFIED]** | the CI gate cannot run | spike S3 pins version and command before the CI step is written |
| Index budget: about 25 non-operation entries × cards up to 120 words (~800 chars) ≈ 20,000 chars, over the 12,000-char no-argument cap (SC-011); the 79 operation `{ id, title }` pairs take ~4,000 | SC-011 fails | generated reference cards ≤ 40 words; curriculum cards average ≤ 60 words; the SC-011 size assertion exists from Day 5 so authors see the budget while writing; FR-035's 120-word maximum still holds per card |
| Search ranking misses `operations-index` for an operation query | SC-011 fails | the explicit routing rule (C7) |
| The ranking script compiles the whole fixture corpus | slow `mcp-knowledge.spec.ts` | one `it` with a 300 s timeout; the measured time is recorded; if it exceeds 120 s locally, that one assertion moves under `describe.runIf(process.env.CI)` with the reason in compliance |
| `class-never-removed` false positives | `check:examples` red under `--max-warnings 0` | FR-030 rules (lifecycle pairing, non-literal suppression); SC-007 tour-pattern fixtures; gate 6 run before the review default is switched on |
| Coverage thresholds (language 79.8 / 80 / 69.9; CLI 77.1 / 77.6 / 64.5 / 76.6) | CI red | each new language module has a unit spec (`controller-balance`, `select-element-fix`, `lifecycleInsertionPoints`, `mcp-entry`); the CLI MCP modules are covered in-process (spawned tests do not count for v8 coverage); `scripts/` is outside `include: ['src/**/*.ts']` |
| Heap growth (~0.35 MB per check, roadmap §2), no recycling (FR-053) | long sessions slow down | measured and recorded (SC-026); recycling is Phase 3 |
| `TIMELINE_EVENTS` name quirk (C9) | wrong names or counts | one `eventName` helper used by generator, tool and spec |
| The generator depends on the built language package | `pnpm -C packages/cli build` alone after `clean` fails | documented; `pnpm build` (topological) is the supported path, as for the CLI tests |

## Complexity tracking

None.

## Open questions

None block the plan. The **[UNVERIFIED]** items (the Windows `npx` wrapper, the inspector 2.x CLI syntax, whether `claude -p --output-format json` carries the per-tool-call transcript, `McpServerClient` in tool handlers) are settled by the Day-1 spike (S1–S3) or SC-016 and recorded in `compliance.md`; each has a stated fallback above.

## Review notes

No review issue was rejected. Where an issue offered alternatives, the plan chose:
- SC-022 / FR-010 correlation: hook order with baselines on a separate server and a per-server counter (C12), not a marker argument, which would add a test-only input to the production tool schemas.
- FR-052 case 14: one program, with the controller defect proven by a second check after the error lines are removed (C13), not a second program file: the eval gate compiles one entry, so a second program would leave the controller defect outside `out/config.json`.
- FR-011: the JSON reporter keeps printing `data` (C14), the existing behaviour of `formatJson`.
- `eligian_operations` limits: the schema limit on `names` is dropped; the 25-card `notReturned` cap stays as a recorded plan addition.
- FR-006 I/O: `checkPaths` also runs in `Effect.tryPromise` rather than `Effect.promise`, because its library test read (`check-command.ts:150`) can reject outside the compile `try`; and the tool boundary catches defects (`catchDefects`, C3), so a bug also answers in FR-005's shape.
- SC-016 Linux evidence: the CI tarball step, not a recorded relaxation.
