# Implementation Plan: presentation assistant, Phase 1: brief engine

**Branch**: `spec/059-presentation-assistant` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/059-presentation-assistant/phase-1-brief-engine/spec.md` (reviewed; clarifications Q1–Q8 encoded), roadmap §3, §4.1, §4.6, §8 Phase 1, §9 decisions; `spikes.md`.

Every signature below was read this session, with typegraph (`ts_module_exports`, `ts_navigate_to`) or from the file, on the tree at `ea09b3c` plus the untracked phase files. Library facts come from `node_modules/.pnpm/effect@4.1.4/node_modules/effect/dist/{Semaphore,Schema,ai/Tool,ai/McpServer}.{d.ts,js}`. Probes ran in Bash on Node 24.7.0 and are not committed. Their results are quoted where they are used.

## Summary

Phase 1 adds four pure modules and one tool:

- `brief/tree.ts`: the 63 questions as data.
- `brief/values.ts`: the answer shapes. It validates wire values and formats and parses them in `BRIEF.md`.
- `brief/engine.ts`: evaluation, rounds and acceptance.
- `brief/brief-file.ts`: `BRIEF.md` parse and write.
- `tools/brief.ts`: `eligian_brief`, the I/O shell around them, registered first in the toolkit.

It also adds one generated docs chunk (`brief-questions`), and it pins nine tools wherever eight were pinned.

The design is reuse-first:

- **paths**: `projectRoot` and `resolveInputPath` (`mcp/paths.ts:63`, `:93`), and `isInside` (`:81`) for asset containment.
- **errors and boundary**: `ToolNotFound`, `ToolIoError` and `toToolError` (`mcp/errors.ts:14`, `:19`, `:76`). The server's `boundary` provides telemetry, `catchDefects` and `failureHeader` (`server.ts:95–107`, `:60–65`).
- **tables**: the cell splitter of `readStoryboard` (`mcp/storyboard.ts:42`), exported instead of copied.
- **atomic write**: `writeDevErrors`' temp-and-rename loop with its measured Windows retry (`dev/runtime-reports.ts:221–251`), extracted to one helper.
- **package manager**: `findPackageManager` (`extension/src/extension/mcp/install-state.ts:163`), moved to `@eligian/shared-utils`. The CLI already aliases that package to its source (`packages/cli/esbuild.mjs:38`).
- **language codes**: `isValidLanguageCode` from `@eligian/language` (`eligian-validator.ts:50`, exported through `index.ts:34`'s `export * from './eligian-validator.js'`).
- **docs chunk**: `generateKnowledge`'s generated-chunk pattern (`scripts/generate-knowledge.ts:781` `domEventsChunk`, list at `:1173–1190`, path check at `:1196–1199`).
- **tests**: `startInMemoryServer` and `spawnServer` (`__tests__/mcp-test-client.ts:123`, `:264`), and `compilerLockLayer(hooks, options?): Layer.Layer<CompilerLock>` (`mcp/compiler-lock.ts:129`, built on `makeCompilerLock` `:83–113` and its `latch` hook, `:59–110`) for the "no lock" test. It is passed as `ServerOptions.lock` (`server.ts:38`, a `Layer.Layer<CompilerLock>`), as `mcp-soak-check.spec.ts:26` does. Cancellation in tests uses `server.notify('notifications/cancelled', { requestId })` with an explicit request id (`mcp-test-client.ts:46–47`), as `mcp-concurrency.spec.ts:541–565` does.
- **critical sections**: the compiler lock's "wait interruptibly, then run the acquired section uninterruptibly" (`compiler-lock.ts:6–9`, `:102–103`), copied for the brief lock (P18).

Phase 1 adds no runtime dependency, no Effect service and no Langium use. `@eligian/shared-utils` becomes a workspace devDependency of the CLI (P15).

## Technical context

| | |
| --- | --- |
| Language | TypeScript 7 (`tsc` = tsgo). Repo `lib` is ES2020 (`tsconfig.json:6`), so there is no `Array#at` and no typed `Intl.Locale#getTextInfo`. The CLI is ESM, bundled to `dist/cli.mjs`. `@eligian/*` imports are inlined from source by the `workspace-sources` plugin (`packages/cli/esbuild.mjs:33–53`). |
| Runtime deps | Unchanged (`packages/cli/package.json:59–68`: chalk, commander, effect 4.1.4, eligius 4.2.0, esbuild, jquery, tinyglobby, jsdom). |
| Effect APIs used | `Schema.Struct`, `Schema.optionalKey`, `Schema.Literals`, `Schema.Unknown` (`Schema.d.ts:2530`), `Schema.Int.check(Schema.isBetween({ minimum, maximum }))` (`Schema.d.ts:6160`). `Semaphore.makeUnsafe(permits: number): Semaphore` (`Semaphore.d.ts:217`) and `semaphore.withPermits(permits)(effect)` (`:79`). `ai.Tool.Meta` (`ai/Tool.d.ts:1550`), `ai.Tool.Destructive` (`:1599`), `ai.Tool.Idempotent` (`:1624`). |
| Testing | Vitest, CLI projects `cli` / `cli-timed` / `cli-bin` (`packages/cli/vitest.config.ts`). CLI specs resolve `@eligian/language` to the built bundle. shared-utils specs live in `packages/shared-utils/__tests__/`. |
| Platforms | Windows 11 (Node 24.7, the local gate) and `ubuntu-latest` (CI). The engines floor is Node 22.12 (`packages/cli/package.json:29`). |
| Performance | `initialize` < 3 s stays (`package-bin.spec.ts:149`). A brief call does one file read, at most one atomic write, and a handful of `statSync` calls. Evaluation is O(instances × answers), with at most a few hundred instances. |
| Constraints | stdout carries protocol frames only. `pnpm effect:check:cli` 0/0/0. CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`packages/cli/vitest.config.ts:60–63`). Language coverage is untouched (no language source changes). |

## Constitution check

| Principle | Status |
| --- | --- |
| I Simplicity | Pass. One new directory (`mcp/brief/`) with four pure modules, one tool, one extracted helper (`atomic-write.ts`) and one moved function. No service and no new dependency. `values.ts` is the one module beyond the roadmap's file list; P10 justifies it. |
| II / V / XX / XXV Testing, TDD | Pass. Each FR/SC maps to a named spec below, and each spec is written red first. `specs/TESTING_GUIDE.md` was read: its templates are language-package templates (`createTestContext`, CSS registry), and no language test is needed in this phase. |
| III / XVII Effect | Pass. `handle` is an `Effect` that fails only with the existing `ToolNotFound` and `ToolIoError`. The pure modules are plain TypeScript. Async fs runs through `Effect.tryPromise` with `toToolError`. There is no `try`/`catch` inside `Effect.gen` (Effect LSP `tryCatchInEffectGen`): the sync helpers that catch are plain functions outside the generator. The `// @effect-diagnostics unstableApiUsage:off` header is used, as in every tool module (`tools/init.ts:12`). |
| IV Clear errors | Pass. Every rejection carries a reason and a message that names the expected form (FR-005, FR-007). |
| VI / VII Immutability | Pass. `BriefState` is replaced, never mutated. Internal maps are used during evaluation. |
| VIII pnpm | Pass. The SC-001 tarball step keeps CI's own `npm install` of the tarball inside a temp user project (`ci.yml:109`). |
| IX Langium | Pass. Not touched. |
| XII No premature docs | Pass. Only the statements that would become false are changed: `packages/cli/AGENTS.md:34`, root `AGENTS.md:49` and `:97` (P14). README and CHANGELOG stay Phase 3 (spec "Non-goals"). |
| XIV Windows paths | Pass. `path.resolve` and `path.join` for files, and `path.posix` for the forward-slash paths inside `BRIEF.md`. Lock keys are lower-cased on win32, as `isInside` compares them (`paths.ts:78`). The rename retry is reused. |
| XV / XVI | Pass. No research-tree import. |
| XXII Sed safety | Pass. Edits by string match only. |

There are no violations, so there is no Complexity tracking table.

## Corrections and plan-level readings (found while planning)

Each one is recorded in `compliance.md` at build time.

- **P1. The writer gets the state as data.** `writeBrief` cannot compute the state: that needs `evaluate`, which needs `Facts.exists`. So `FactsSnapshot` gains `state: 'open' | 'complete' | 'confirmed'`, and the tool fills it from the evaluation of the brief it writes. In the SC-006 golden test the snapshot carries `state: 'open'`.
- **P2. `max` is checked by the Parameters schema.** The schema is `Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })))`.
  - Probed: decoding `{ max: 21 }` fails with `Expected a value between 1 and 20 at ["max"]`.
  - `McpServer` turns a parameter decode failure into JSON-RPC `-32602` with that message (`ai/McpServer.js:662–676`). `mcp-docs.spec.ts:280` asserts the same path for `eligian_docs`.
  - The handler never runs, so nothing is written (FR-025). The JSON Schema in `tools/list` carries `"minimum": 1, "maximum": 20` (probed with `Schema.toJsonSchemaDocument`).
  - SC-015 asserts `error.code === -32602` and a message matching `/between 1 and 20/`.
- **P3. The move of `findPackageManager` (FR-041).** It goes to `packages/shared-utils/src/package-manager.ts`.
  - That module also exports `readPackageManifest(dir): Promise<Record<string, unknown> | undefined>`, today's private `readManifest` (`install-state.ts:156`). `installCommand` (`:206`) uses it, and so does the FR-042 version probe.
  - `install-state.ts` keeps its private `readText`, `isFile`, `parseJson` and `isRecord` (`:33–58`), because `readEligianInstall` and `vscodeMcpJsonState` still use them. The new module has its own private `readText` and `isFile`: a few duplicated lines in another package, instead of exporting generic fs helpers from shared-utils.
- **P4. The installed-version probe reuses `readPackageManifest`, not `readEligianInstall`.** `readEligianInstall` (`install-state.ts:64`) stays in the extension, which the CLI does not import, and it carries the ≥ 1.1 gate and the `bin/cli.js` check, neither of which FR-042 wants. The probe is `readPackageManifest(<root>/node_modules/eligian)`, then the `version` if it is a string, else `-`.
- **P5. The brief handler uses `boundary`, not `call`.** `call` (`server.ts:125–136`) provides `CompilerLock` to the handler. The brief handler is wrapped by `boundary` (`:95–107`) directly, so FR-032 holds by construction.
- **P6. `writeFileAtomic`.** It lives in `packages/cli/src/atomic-write.ts`, a top-level module that `dev/` and `mcp/` both import.
  - Signature: `writeFileAtomic(target: string, text: string, options?: { readonly beforeRename?: () => Promise<boolean> }): Promise<'written' | 'aborted'>`.
  - A `false` from `beforeRename` removes the temp file and returns `'aborted'`, with no throw.
  - **The temp file never outlives the call.** Everything after the temp write (the `beforeRename` call and the whole rename loop) runs inside one `try { … } catch (error) { await fs.rm(temp, { force: true }).catch(() => {}); throw error; }`. A `beforeRename` that rejects (the brief tool's seam or its re-read failing with `EACCES`, `EISDIR`, a Windows lock, …) therefore removes the temp and rethrows, exactly as an exhausted rename does today (`runtime-reports.ts:244–246`). After a successful rename there is no temp to remove. FR-034's "no temp file is left" (spec SC-010) thus holds on the `'aborted'` path, the rejected-`beforeRename` path and the failed-rename path.
  - The temp name is `.${path.parse(target).name}.${process.pid}.${n}.tmp`, which keeps `writeDevErrors`' exact names (`.dev-errors.<pid>.<n>.tmp`, `runtime-reports.ts:236`).
  - The helper keeps `import * as fs from 'node:fs/promises'`. The dev-server spec's pass-through `vi.mock('node:fs/promises')` (`dev-server.spec.ts:25–44`) mocks the module for the whole graph, so its burst test still observes `write <temp>` before `rename <temp> <target>`, a temp in the same dir that ends in `.tmp`, and `maxInFlight 1` (`:1011–1021`).
- **P7. Strict forms that FR-021's round trip needs.** Each is rejected `invalid-value` with the message in quotes:
  - A string value or cell that contains `\r`: `"line breaks must be \n"`. The file is LF (FR-019), and a CR could not survive it.
  - A cell that contains `\n`: `"a cell is one line"`.
  - An empty or all-whitespace text: `"expected non-empty text"`. An empty value block cannot be told from no value.
  - A path cell or R3 that contains `\`: `"a path uses forward slashes"`. The edge cases say paths in `BRIEF.md` are forward-slash.
  - A record or table row with missing or extra keys: `"expected exactly the fields: …"`.

  Accepted records and rows are stored with keys in column order. That is not a change of value, and it makes the FR-022 digest independent of the client's key order.
- **P8. The idea is stored with CRLF turned into LF.** It is not an answer (FR-005 governs answers), and the blockquote is LF. The idea is stored whenever the brief has none, on `status` or `answer`, and it is never replaced (FR-027 "Stored … on the first call"). This covers a file that an `answer` without an idea created. It reads FR-028's "stores the idea if the file is new" as "if the brief has no idea", which includes a new file, and the edge cases' "stored verbatim" as verbatim up to line endings, which the LF file cannot carry (FR-019). Both readings go into `compliance.md` and are proposed for the FR-027 / FR-028 rows (Review notes). `brief-tool.spec.ts` › `idea` tests both (see Test plan).
- **P9. There are two `isValidLanguageCode` functions** (`ts_navigate_to`: `eligian-validator.ts:50`, `(code: string) => boolean`, and `labels/types.ts:128`, a type guard). The root export is the validator's (`index.ts:34`). Both use the same regex, `/^[a-z]{2,3}-[A-Z]{2,3}$/` (`compiler/constants.ts:34`, `labels/types.ts:121`). The engine imports `isValidLanguageCode` from `@eligian/language`.
- **P10. `Question` gains three fields beyond the spec sketch, and the shapes get one module.**
  - `when: string`: the roadmap's applies-when text, `'always'` otherwise. The generator writes it into `brief-questions` ("its applies-when in words", FR-036).
  - `check?: (value) => string | undefined`: the intra-value rules of FR-006, such as C2's one primary, the S6 source rule, the D3 file rule, the V5, L5 and A2 couplings and S2's name pattern.
  - `alternatives?` on `Shape`: P5's `'viewer-paced'`.
  - Shape validation, formatting and parsing are shared by the engine and the file, so they live in `brief/values.ts`. `SC-012`'s grep test covers it.
- **P11. FR-018 is evaluated in two passes.**
  - Pass 1: when a confirmation line is present, questions with `since > treeVersion` are not applicable. Compute the digest.
  - If the digest matches, keep pass 1.
  - Otherwise, evaluate again against the full current tree (pass 2).

  This resolves the circularity: "valid confirmation" depends on the digest, and the digest depends on applicability.
- **P12. The views come from S2's recorded, shape-valid, non-dormant answer**, even while S2 is stale. While S2 is not settled, every V copy is `waiting`. Before any S2 answer exists, branch V is one template copy of 6 waiting instances (FR-010). Counts stay stable while S2 is reopened.
- **P13. Counts are over question instances only.** A `V:<name>` (`same as`) answer is not a question instance. It can be a round item (when stale, FR-014), but it is not counted. `counts.delegated` counts own delegated answers only, never `same as` copies (FR-014 "names `<other>`'s own answers").
- **P14. Root `AGENTS.md:97` also changes.** Its `tools/ (docs, operations, check, …, smoke)` list gains `brief`, and the line names `brief/`, because the statement would otherwise be false. This is the same rule as Phase 2 of spec 058 (its plan P16). It is an addition to FR-037's list of pins (which names `AGENTS.md:49` only); it is recorded in `compliance.md` and proposed for the FR-037 row (Review notes). The compliance check greps `AGENTS.md:97` for `brief`.
- **P15. The CLI declares `@eligian/shared-utils`.** Today it has no direct import (Grep `@eligian/shared-utils` over `packages/cli/src`: none).
  - Add `"@eligian/shared-utils": "workspace:*"` to `devDependencies`, so pnpm links it for vitest and tsc. `package-bin.spec.ts:80–96` checks only `dependencies`, and the bundler inlines it anyway (`esbuild.mjs:38`).
  - Add `{ "path": "../shared-utils" }` to the `references` of `packages/cli/tsconfig.json` and `tsconfig.test.json`.
- **P16. `Facts` is synchronous.**
  - `exists` and `inside` are closures that `tools/brief.ts` builds per call over `fs.statSync(p, { throwIfNoEntry: false })?.isFile() === true` and `isInside`, memoized for that call only (FR-012 "never caches them").
  - Any `statSync` error gives `false` inside the closure, so evaluation cannot throw.
  - The engine itself imports no `node:fs`.
- **P17. Ignored answer blocks are re-emitted verbatim at the end of their section**, in their original order. Unknown `##` sections go after `## Facts`. SC-006's input places the ignored block last in its section, so the whole file is byte-identical after a parse and a write.
- **P18. The brief section is uninterruptible once it holds the permit (FR-033).** effect/ai's `McpServer` interrupts a handler fiber on `notifications/cancelled` (`effect/dist/ai/McpServer.js:1113–1132` `cancelRequest`, `:1356–1371` the `Interrupt` it sends; the repo tests it at `mcp-concurrency.spec.ts:541`). An interrupted `Effect.tryPromise` does not wait for its promise, so with an interruptible section the permit would be released while an orphaned `writeFileAtomic` (mkdir, temp write, `beforeRename` re-read, a rename retried for up to about 2.5 s) is still running. A queued call on the same `BRIEF.md` would then read the old file, compute the same `nextRound`, and the last rename would overwrite the other's answers. The fix is the compiler lock's rule (`compiler-lock.ts:6–9`, implemented at `:102–103`): `forFile(file).withPermits(1)(Effect.uninterruptible(section))`. Waiting for the permit stays interruptible, so a cancelled queued call leaves without running; an acquired call runs its read-evaluate-write to completion (milliseconds, plus at most the rename retry) and only then releases the permit. A cancelled call sends no response (`mcp-concurrency.spec.ts:556–557`), but its write lands.
- **P19. A parser defect reaches the tool boundary; it is never turned into an empty brief.** `parseBrief` has no catch-all. It never throws by construction: every line and block handler that meets something it cannot read reports it in `ignored` and keeps the text in `kept` (FR-020). The tool calls it inside `Effect.sync`, so a throw (a bug, not a user path) becomes a defect that `catchDefects` (`errors.ts:91–99`) logs to the stderr logger and answers `internal`. Because the parse runs before any write, a failed parse never writes `BRIEF.md`: the user's file and its recorded answers stay as they are. The SC-006 mutation test runs against this unwrapped parser, so a crash it finds is a real failure.

## Project structure

```text
packages/cli/src/
├── atomic-write.ts                       NEW  writeFileAtomic (P6), extracted from dev/runtime-reports.ts
├── dev/runtime-reports.ts                EDIT writeDevErrors → writeFileAtomic; RENAME_RETRIES etc. move
├── mcp/
│   ├── brief/
│   │   ├── tree.ts                       NEW  TREE, BRANCHES, TREE_VERSION, types
│   │   ├── values.ts                     NEW  shape validation, BRIEF.md value format/parse
│   │   ├── engine.ts                     NEW  evaluate, pickRound, applyAnswers, confirm, digest, …
│   │   └── brief-file.ts                 NEW  parseBrief, writeBrief
│   ├── storyboard.ts                     EDIT export cellsOf, isSeparator
│   ├── server.ts                         EDIT register eligian_brief first; ServerOptions.brief; docstring
│   └── tools/brief.ts                    NEW  the tool
├── __tests__/
│   ├── brief-tree.spec.ts, brief-values.spec.ts, brief-engine.spec.ts,
│   │   brief-file.spec.ts, brief-tool.spec.ts, mcp-brief-interview.spec.ts,
│   │   mcp-brief-restart.spec.ts, atomic-write.spec.ts                       NEW
│   ├── mcp-server.spec.ts, mcp-resources.spec.ts, mcp-knowledge.spec.ts,
│   │   mcp-stdout.spec.ts                                                    EDIT
│   ├── __snapshots__/tools-list-phase3.json.snap                             UPDATED (insertions only)
│   ├── __snapshots__/brief-all-shapes.md.snap                                NEW
│   └── __fixtures__/mcp/brief/{example.md, four-views.md, all-shapes.json, tree-v2.ts,
│                                personas/{terse,detailed,vague}.json}       NEW
packages/cli/scripts/generate-knowledge.ts                                    EDIT briefQuestionsChunk
packages/cli/{package.json, tsconfig.json, tsconfig.test.json}                EDIT (P15)
packages/cli/AGENTS.md                                                        EDIT :34
packages/shared-utils/src/{package-manager.ts NEW, index.ts EDIT}
packages/shared-utils/__tests__/package-manager.spec.ts                      NEW
packages/extension/src/extension/mcp/install-state.ts                        EDIT import from shared-utils
packages/extension/src/extension/__tests__/mcp-install-state.spec.ts         EDIT findPackageManager cases out
.github/workflows/ci.yml                                                      EDIT want strings, comment
AGENTS.md                                                                     EDIT :49, :97
.claude/workflows/presentation-assistant-phase.js                             COMMIT (exists)
```

## Module design

### 1. `packages/cli/src/mcp/brief/tree.ts` (FR-002, FR-003, FR-004, FR-038)

Pure data, no imports beyond its own types. No `effect`, no fs, no I/O at import (SC-012).

```ts
export const TREE_VERSION = 1;
export type BranchId = 'P' | 'C' | 'S' | 'V' | 'I' | 'D' | 'L' | 'A' | 'H' | 'X' | 'R' | 'W';
export const BRANCHES: readonly { readonly id: BranchId; readonly name: string }[]; // FR-002 names

export type Cell = string;
export type AnswerValue =
  | string | number | boolean | readonly string[]
  | Readonly<Record<string, Cell>> | readonly Readonly<Record<string, Cell>>[];

export type CellKind = 'text' | 'choice' | 'yes-no' | 'duration' | 'view' | 'path' | 'language';
export interface Column {
  readonly name: string;
  readonly kind: CellKind;
  readonly options?: readonly string[];
  readonly dash?: true;     // '-' accepted (empty cell)
  readonly none?: true;     // 'none' accepted (V5 duration)
}
export interface Shape {
  readonly kind: 'text' | 'choice' | 'set' | 'yes-no' | 'duration' | 'view' | 'path' | 'record' | 'table';
  readonly options?: readonly string[];
  readonly columns?: readonly Column[];
  readonly none?: true;
  readonly alternatives?: readonly string[];   // P5: ['viewer-paced'] (P10)
  readonly rows?: 'one-per-view';
}
export interface AnswerView { get(id: string): AnswerValue | undefined }  // restricted, throws outside `reads`
export interface AssetEntry {
  readonly key: string;
  readonly kind: 'image' | 'video' | 'audio' | 'font' | 'other';
  readonly state: 'exists' | 'missing' | 'remote';
}
export interface Question {
  readonly id: string; readonly branch: BranchId; readonly title: string; readonly ask: string;
  readonly shape: Shape;
  readonly needs: readonly string[]; readonly reads: readonly string[];
  readonly appliesWhen: (answers: AnswerView, assets: readonly AssetEntry[]) => boolean;
  readonly when: string;                                     // P10
  readonly check?: (value: AnswerValue) => string | undefined; // P10, intra-value rules
  readonly docs: readonly string[]; readonly facts: readonly string[];
  readonly since: number;
}
export const TREE: readonly Question[];  // 63 entries in branch order; V entries are templates
export const ALWAYS: Question['appliesWhen'];
export const effectivePrerequisites: (q: Question) => readonly string[]; // needs ∪ reads (FR-003)
```

- `reads` follows FR-003 and FR-008 exactly:
  - V6 reads C3; D8 and A5 read V3; A4 reads S6 and V3.
  - A1, A2, A3 and A6 read V3, S6 and D3 (the asset list).
  - L4 reads L1, V3, S6 and D3; L5 reads L4.
  - S3, S4, I4 and X3 read S2; S7 reads S6 and C4; I1 reads V5; I2 and I5 read C3.
  - L2 and L3 read L1; H2 and H3 read H1; X4 reads S6; X5 reads S5.
- W1's `needs` is every other template id (FR-003).
- Titles and asks are the roadmap §3 text. S2's `ask` appends `Each name is the timeline name the program will use, matched exactly (case-sensitive).` (FR-038).
- `docs` and `facts` follow FR-004.
- `when` is the roadmap's "Applies when" cell, `always` otherwise.

The shapes follow the FR-006 table. Two columns get a kind:

- L2's `language` column has kind `language`.
- A1's `asset`, A4's `file` and A5's `image` key cells have kind `text`. They are cross-checked in the engine, not by kind.

### 2. `packages/cli/src/mcp/brief/values.ts` (FR-005, FR-006 intra-value, FR-019 value formats, FR-020 value parsing; P7, P10)

Pure, with no imports beyond `tree.ts` types and `cellsOf` / `isSeparator` from `../storyboard.js`. Those two are exported unchanged from `storyboard.ts:42` and `:61`.

```ts
export type Validated = { readonly ok: true; readonly value: AnswerValue } | { readonly ok: false; readonly message: string };
export function validateValue(question: Question, value: unknown): Validated;      // shape + question.check
export function expectedForm(shape: Shape): string;                               // FR-005 message text
export function formatValue(shape: Shape, value: AnswerValue): readonly string[]; // BRIEF.md lines
export function parseValue(shape: Shape, lines: readonly string[]): AnswerValue | undefined; // undefined = ignored
export function escapeCell(cell: string): string;    // '|' → '\|'
export function unescapeCell(cell: string): string;  // '\|' → '|'
```

- **Wire forms** (FR-005), strict:

  | Shape | Wire form |
  | --- | --- |
  | text, choice, view, path | `string` (choice matched exactly) |
  | yes-no | `boolean` |
  | duration (P5) | a finite `number > 0`, or an `alternatives` string |
  | set | `string[]` of options, unique, ≥ 1, or `"none"` where `shape.none` |
  | record | an object with exactly the column keys, each a string cell |
  | table | an array of such objects, or `"none"` where `shape.none` |

  Cells: a yes-no cell is `"yes"` or `"no"`. A duration cell is `/^\d+(\.\d+)?$/` and > 0, or `none` where `column.none`. A `dash` cell may be `-`. A path cell is not empty, has no `\` (P7), and is not checked for existence here.
- **`expectedForm`** builds the FR-005 messages verbatim, for example `expected a JSON boolean (true or false)`, `expected a JSON number of seconds greater than 0, or "viewer-paced"`, `expected an array of strings from: mouse, touch, keyboard, clicker`.
- **Format** (FR-019):
  - **text**: the lines verbatim. A line that matches `/^\\*#/` gets one more leading `\`, and parsing removes one `\` from such lines. That makes `#…` and `\#…` round-trip.
  - **choice / view / path**: one line.
  - **yes-no**: `yes` / `no`.
  - **set**: `a, b`.
  - **duration**: `${String(n)}s`. Parsing accepts `Ns` only when `String(Number(N)) === N`, which is the canonical number text.
  - **record**: `| field | value |`, `| --- | --- |`, then one row per column in column order.
  - **table**: the header in column order, `| --- | … |`, and the rows with `escapeCell`.
- **Parse**: table rows through `cellsOf`, then `unescapeCell`. A row whose cell count differs, a missing column, or a value that does not re-validate gives `undefined`, which the caller reports as ignored. `none` is recognised where the shape accepts it.

### 3. `packages/cli/src/mcp/brief/engine.ts` (FR-007–FR-018, FR-022, FR-023, FR-039, FR-040)

This module is pure. It imports `node:crypto` (`createHash`, which FR-016 and FR-022 name), `node:path` (`posix` only), `isValidLanguageCode` from `@eligian/language` (P9), and `tree.ts` / `values.ts`. It does not import `node:fs` or `effect` (SC-012).

```ts
export type By = 'user' | 'delegated';
export interface Answer {
  readonly id: string; readonly value: AnswerValue; readonly by: By; readonly round: number;
  readonly reviewed?: number; readonly basis?: string;
}
export interface Confirmation {
  readonly mode: 'agent-reported'; readonly at: string /* ISO-8601 UTC */;
  readonly digest: string /* 64 hex */; readonly message: string;
}
export interface BriefState {
  readonly idea?: string; readonly treeVersion: number;
  readonly confirmation?: Confirmation; readonly answers: readonly Answer[];
}
export interface Facts {
  readonly briefDir: string;                       // posix, relative to the root, '.' at the root
  readonly exists: (fromBrief: string) => boolean; // a file at that path (P16)
  readonly inside: (fromBrief: string) => boolean; // resolves under the project root
}
export type BriefStateName = 'open' | 'complete' | 'confirmed';
export type InstanceStatus = 'answered' | 'open' | 'stale' | 'waiting' | 'not-applicable';
export interface Instance {
  readonly id: string;                 // 'P1', 'V3:intro', 'V:signup'
  readonly question: Question;         // the template (V: a synthetic 'same as' question)
  readonly view?: string;
  readonly status: InstanceStatus;
  readonly dormant: boolean;           // FR-040
  readonly answer?: Answer;            // own recorded answer
  readonly value?: AnswerValue;        // effective value (own, or the same-as source's)
  readonly round: number;              // effective round, for dependents' staleness
  readonly previous?: AnswerValue;     // stale only
  readonly reason?: string;            // FR-039 only
  readonly counted: boolean;           // false for 'V:<name>' (P13)
}
export interface Counts {
  readonly answered: number; readonly delegated: number; readonly open: number;
  readonly waiting: number; readonly notApplicable: number;
}
export interface Evaluation {
  readonly state: BriefStateName;
  readonly instances: readonly Instance[];   // evaluation order
  readonly frontier: readonly Instance[];    // open ∪ stale
  readonly counts: Counts;
  readonly delegated: readonly { readonly id: string; readonly title: string; readonly value: AnswerValue }[];
  readonly assets: readonly AssetEntry[];
  readonly views: readonly string[];
  readonly digest: string;                   // FR-022 over the applicable recorded answers
}
export type RejectionReason =
  | 'unknown-question' | 'duplicate' | 'waiting' | 'not-applicable' | 'invalid-value' | 'invalid-reference';
export interface Rejection { readonly id: string; readonly reason: RejectionReason; readonly message: string }
export interface AnswerInput { readonly id: string; readonly value: unknown; readonly delegated?: boolean }
export interface RoundItem {
  readonly id: string; readonly title: string; readonly ask: string; readonly shape: Shape;
  readonly docs: readonly string[]; readonly facts: readonly string[];
  readonly previous?: AnswerValue; readonly reason?: string;
}

export function evaluate(tree: readonly Question[], brief: BriefState, facts: Facts): Evaluation;
export function pickRound(tree: readonly Question[], evaluation: Evaluation, max?: number): readonly RoundItem[];
export function nextRound(brief: BriefState): number;
export function applyAnswers(
  tree: readonly Question[], brief: BriefState, facts: Facts,
  input: readonly AnswerInput[], round: number
): { readonly brief: BriefState; readonly rejected: readonly Rejection[]; readonly changed: boolean };
export function confirm(brief: BriefState, message: string, now: Date, evaluation: Evaluation): BriefState;
export function digest(answers: readonly Answer[]): string;
export function viewBasis(brief: BriefState, view: string): string;
export function textDirection(code: string): 'ltr' | 'rtl';
export const EMPTY_BRIEF: BriefState; // { treeVersion: TREE_VERSION, answers: [] }
```

**`evaluate`** works in one walk over a topological order of the effective template graph (FR-003, needs ∪ reads). It is computed once per tree and memoized in a `WeakMap<readonly Question[], …>`. Ties are broken by tree order, so W1 comes last (Differences item 6).

1. **Views.** Read the views from S2's recorded answer (P12), and the `same as` map from the `V:<name>` answers.
2. **Expansion.** At each V template's position, expand it into one instance per view: views without `same as` first, in S2 order, then the `same as` views. A `same as` source is therefore evaluated first, with no chains (FR-014). Each `V:<name>` answer is a non-counted instance placed before that view's V1.
3. **Instance dependencies.**
   - A dependency on template `Vn` means every `Vn:<view>` instance, or the 6-instance template copy before S2.
   - A V copy of a `same as` view depends on `V:<name>` and on the source's `Vn`.
   - A V instance's dependencies on S2 and S6 count for "waiting", but not for staleness by round (FR-016).
4. **Per instance, in order:**
   - **a. Waiting.** Any dependency in `waiting`, `open` or `stale` makes it `waiting`. A recorded answer stays recorded but is not reported.
   - **b. Version gate.** If FR-018 pass 1 applies (P11) and `since > brief.treeVersion`, the instance is `not-applicable`.
   - **c. Applies-when.** Evaluate `appliesWhen` over an `AnswerView` that serves only `reads`. It returns the effective value of a settled instance, `undefined` for not-applicable, and for a template read the list of copies (a V template read returns an array of the copies' values). Any other id throws an `Error` (FR-008: a defect in the tree, not a user path). `false` makes it `not-applicable`, and `dormant` when an answer is recorded (FR-040).
   - **d. Effective value.**
     - An own answer.
     - Else, for a `same as` copy: the source's value when the source is `answered`. When the source is `not-applicable`, the copy is not applicable too, which follows from the same rule. Otherwise the copy is `waiting`, never on the frontier (FR-014).
     - Else the instance is `open`.
   - **e. Re-validation (FR-039)**, own answers only, never a copy (FR-014):
     - `validateValue` (shape);
     - then `crossCheck(id, value, ctx)` over the settled values and `facts` (FR-011, FR-012, FR-013, FR-014 targets);
     - a failure makes it `stale`, with `reason` and `previous`.
   - **f. Staleness by round (FR-016).** Take each dependency's effective `round`, excluding S2 and S6 for V instances. If one is greater than `max(answer.round, answer.reviewed ?? 0)`, the instance is `stale` with `previous`.
   - **g. Basis.** For a V own answer or a `V:<name>`, a `basis` that is missing or differs from `viewBasis(brief, view)` makes it `stale`.
   - **h.** Otherwise `answered`.
5. **Assets (FR-012).** The asset list is recomputed whenever the walk passes an S6, D3 or V3 instance (whichever comes first in the topological order), from the settled values only, so that a later rule that reads it sees the current list. Whatever the evaluation position, the list is always built in FR-012's order: every V3 copy's rows (copies in S2 order, rows in table order), then S6's rows, then D3's rows, deduplicated by key with the first occurrence kept (so a V3 `video` row `media/demo.mp4` and an S6 `video` source `media/demo.mp4` are one entry, with the V3 kind). Existence and containment come only from `facts`. URL test: `/^https?:\/\//i`.
6. **Counts (FR-030, FR-040, P13).** Over counted instances. A settled copy counts as `answered`, and a dormant answer counts as `notApplicable`.
7. **`delegated`.** The own answered instances with `by: 'delegated'`. It goes into the reply only when the state is not `open` (the tool decides).
8. **Digest and state.** `digest` = FR-022 over the recorded answers of non-dormant, applicable instances: `createHash('sha256')` of `JSON.stringify(sorted [id, value, by])`. The state follows FR-023: `confirmed` iff `brief.confirmation?.digest === digest` and the frontier is empty. If pass 1 was used and the digest does not match, run pass 2 (P11).

**`crossCheck` (FR-011, FR-012, FR-013, FR-014)** is a table keyed by template id:

| Id | Check |
| --- | --- |
| S3, S4 (`view`, `target`) | names an S2 view |
| S5, S6, D5 | rows are exactly one per S2 view |
| L1 | codes unique, each `isValidLanguageCode`, exactly one `default: yes` |
| L2 | rows are exactly the L1 codes |
| A1 | rows are exactly one per `missing` entry, keyed |
| A4 | rows are exactly one per `video`/`audio` entry |
| A5 | rows are exactly one per `image` entry |
| V3 `file`, S6 `source`, D3 `file` | a relative path must satisfy `facts.inside` |
| R3 | see below |
| `V:<name>` | `same as <other>`: `<other>` is in S2, is not `<name>`, and is not itself `same as` |

R3 (FR-013) is checked as follows:

- The value is a relative posix path: not absolute and no drive letter.
- It equals its own `posix.normalize`, so it holds no `./` or `..`.
- It ends in `.eligian`.
- `posix.dirname(value)` equals `facts.briefDir`. Otherwise the message names `directory: "<dirname>"`.

Each failure is `invalid-reference` with a message naming the bad cell.

**`applyAnswers` (FR-007, FR-015)** works as follows:

1. **Duplicates.** A repeated id is rejected `duplicate`. The later one loses.
2. **Order.** Sort the inputs by the instance order of a full evaluation. Ids unknown at sort time keep their input position at the end.
3. **Per input:** re-evaluate the current state, a full `evaluate` per accepted answer, which is cheap at this size. Then:
   - **Unknown id.** An unknown template is rejected `unknown-question`. A `Vn:<view>` or `V:<view>` whose view is not in S2 is rejected `unknown-question` when S2 is settled, `waiting` otherwise.
   - **Status.** `waiting` is rejected `waiting`. `not-applicable` is rejected `not-applicable`.
   - **Validation.** `validateValue` failure → `invalid-value`, with `expectedForm` in the message. `crossCheck` failure → `invalid-reference`.
   - **No-op.** Recorded, not stale, same value (deep-equal over canonical values) and same `by`: nothing changes.
   - **`by` only.** The same value with a different `by` updates `by` and keeps the round.
   - **Review.** A stale answer with an equal value gets `reviewed: round`, keeps its `round`, and gets the current basis for V. `by` is updated if it differs.
   - **Change.** Otherwise the answer is replaced with `round` and no `reviewed`, plus `basis` for V.
4. **Result.** `changed` is true iff something changed (the idea is handled by the tool).

**`pickRound` (FR-017).** For each frontier instance, compute the number of distinct unsettled instances that reach it transitively through the reverse instance graph. Sort by that count descending, then tree order, then S2 view order. Take the first `max`. Round items carry `shape`, `docs`, `facts`, and `previous` / `reason` from stale instances.

**`nextRound` (FR-015)** is `1 + max(round, reviewed)` over the recorded answers. Ignored answers are not in `BriefState` at all.

**`viewBasis` (FR-016)** takes the first 16 hex characters of `sha256(JSON.stringify([s2Row ?? null, s6Row ?? null]))`, with keys in column order. Probed this session: `demo` gives `4a3055a743c8484e` and `signup` gives `23a0aa8fc1af8ff6`, both equal to the golden fixture.

**`textDirection` (FR-019).** The value comes from `new Intl.Locale(code)`:

1. `Reflect.get(locale, 'getTextInfo')`, when it is a function;
2. else the `textInfo` getter;
3. else `'ltr'`. Any throw also gives `'ltr'`.

`Reflect.get` keeps it within the ES2020 `lib`. Probed: `ar-EG` gives `rtl` on Node 24.7.

### 4. `packages/cli/src/mcp/brief/brief-file.ts` (FR-019, FR-020, FR-021)

This module is pure, with no I/O. It imports `tree.ts`, `values.ts` and the `engine.ts` types.

```ts
export interface RawBlock {
  readonly section: string;    // the '## …' heading it was found under, or '' at the top
  readonly text: string;       // verbatim, LF
  readonly kind: 'answer' | 'section';
}
export interface Ignored { readonly line: number; readonly reason: string }
export interface ParsedBrief {
  readonly brief: BriefState;
  readonly ignored: readonly Ignored[];
  readonly kept: readonly RawBlock[];
}
export interface FactsSnapshot {
  readonly state: BriefStateName;                       // P1
  readonly serverEligian: string;
  readonly eligianInstalled: string | undefined;        // '-' when undefined
  readonly packageManager: PackageManager | undefined;  // from @eligian/shared-utils
  readonly textDirection: readonly { readonly code: string; readonly direction: 'ltr' | 'rtl' }[] | undefined;
  readonly assets: readonly AssetEntry[];
}
export const BRIEF_FILE = 'BRIEF.md';
export const EMPTY_PARSED: ParsedBrief;
export function parseBrief(text: string, tree?: readonly Question[]): ParsedBrief; // never throws by construction (P19)
export function writeBrief(tree: readonly Question[], parsed: ParsedBrief, facts: FactsSnapshot): string;
```

**`parseBrief`** has no catch-all (P19). It never throws because no handler can: each one is total over its input lines, `JSON.parse` of the `confirmation-message:` value and the integer parse of `tree:` / `round:` / `reviewed:` go through small total helpers (a plain function with its own `try`, returning `undefined` on failure, outside any `Effect.gen`), and anything a handler cannot read is reported in `ignored` and kept in `kept`. There is no `unreadable` reason and no whole-file fallback: a bug in the parser is a defect that reaches the tool boundary (`catchDefects`, logged to stderr, kind `internal`), and an exception never leads to a write of `BRIEF.md` (§5 step 3). SC-006's 500 seeded mutations run against this parser, so a throw fails the test. The parse itself:

1. Split on `/\r?\n/`.
2. **Header.** `# Brief`, the comment line, the blockquote idea (`> ` stripped exactly, `>` alone is an empty line), then the `- key: value` header lines:
   - `tree:` is an integer;
   - `confirmation:` is `none` or `agent-reported <ISO> sha256:<64 hex>`;
   - `confirmation-message:` is `JSON.parse` of a string;
   - `state:` and `approval:` are read and dropped;
   - any other header line is ignored as `malformed header line`.
3. **Sections.** `## <L>: …` with a known letter is a branch section. `## View: <name>` is a view section. `## Facts` is dropped. Any other `##` is kept verbatim as `kind: 'section'`.
4. **Answer blocks.** A block starts at `### <id>: …` or `### V: same as`, followed by a blank line, then the `- by:`, `- round:`, `- reviewed:` and `- basis:` lines up to a blank line, then the value lines up to the next `##`/`###` heading. Exactly one trailing blank separator line is removed.
   - In a view section the id becomes `<id>:<view>` or `V:<view>`.
   - An unknown id, a missing `by`/`round`, a `parseValue` that returns `undefined`, or a duplicate id makes the block `kept` (`kind: 'answer'`, with its section) and adds an `ignored` entry with that reason.
5. **Unknown views.** After all sections are read, view sections whose name is not in the parsed S2 are moved to `kept` with `unknown-view` (FR-010).
6. **Markers.** `_No answers yet._` and `_One section per view below._` are dropped.

**`writeBrief`** writes the FR-019 order exactly:

1. `# Brief`, the comment line, the idea blockquote, then the header list (`state` from `facts.state`, P1).
2. The 12 sections. Branch V's marker depends on S2. Then the view sections in S2 order.
3. In each section: the answers in tree order, dormant ones included, then that section's kept answer blocks (P17).
4. `## Facts`, with the comment and lines, and either the asset table or `- assets: none`.
5. The kept unknown sections.
6. Blocks are joined with `\n\n`, and the file ends with a single `\n`.

The S2 used for view sections is the recorded S2 value, whatever its status.

### 5. `packages/cli/src/mcp/tools/brief.ts` (FR-024–FR-035, FR-042)

```ts
// @effect-diagnostics unstableApiUsage:off
export const NAME = 'eligian_brief' as const;
export const DESCRIPTION: string;      // ≤ 1000 chars (FR-024); draft below
export const Parameters = Schema.Struct({
  directory: Schema.optionalKey(Schema.String),
  action: Schema.Literals(['status', 'answer', 'confirm']),
  idea: Schema.optionalKey(Schema.String),
  answers: Schema.optionalKey(Schema.Array(Schema.Struct({
    id: Schema.String, value: Schema.Unknown, delegated: Schema.optionalKey(Schema.Boolean),
  }))),
  max: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))), // P2
  confirmation: Schema.optionalKey(Schema.String),
});
export const Success = Schema.Struct({
  header: Schema.String, file: Schema.String,
  state: Schema.Literals(['open', 'complete', 'confirmed']),
  round: Schema.Array(RoundItemSchema),   // shape as a Struct mirroring tree.ts Shape; previous: optionalKey(Unknown)
  counts: Schema.Struct({ answered: Schema.Int, delegated: Schema.Int, open: Schema.Int,
                          waiting: Schema.Int, notApplicable: Schema.Int }),
  rejected: Schema.Array(Schema.Struct({ id: Schema.String, reason: Schema.Literals([...]), message: Schema.String })),
  ignored: Schema.Array(Schema.Struct({ line: Schema.Int, reason: Schema.String })),
  delegated: Schema.optionalKey(Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, value: Schema.Unknown }))),
  refused: Schema.optionalKey(Schema.Struct({ code: Schema.Literals(['frontier-not-empty', 'confirmation-missing']) })),
  next: Schema.String,
});
export interface BriefToolOptions { readonly beforeRename?: (target: string) => Promise<void> }
export interface BriefLocks { readonly forFile: (file: string) => Semaphore.Semaphore }
export const makeBriefLocks: () => BriefLocks;
export const makeFacts: (root: string, briefDir: string) => Facts;           // P16; also used by SC-013
export const probeFacts: (root: string) => Promise<{ eligianInstalled?: string; packageManager?: PackageManager }>;
export const summarizeArgs: (params: BriefParameters) => Readonly<Record<string, unknown>>;
export const summarizeResult: (value: BriefSuccess) => Readonly<Record<string, unknown>>;
export const makeTool: (ai: EffectAi) => /* ai.Tool.make(...) */;
export const handle: (
  params: BriefParameters,
  context: ToolContext & { readonly briefLocks: BriefLocks; readonly options?: BriefToolOptions }
) => Effect.Effect<BriefSuccess, ToolError>;
```

`ToolContext` is imported from `./check.js` (`check.ts:27`), as `project.ts:50` does.

**`makeTool`** (FR-024):

```ts
ai.Tool.make(NAME, { description, parameters, success, failure: ToolFailure })
  .annotate(ai.Tool.Meta, { 'anthropic/alwaysLoad': true })
  .annotate(ai.Tool.Destructive, false)
  .annotate(ai.Tool.Idempotent, true)
```

It is not `Readonly`. `tools/check.ts:108` and `tools/init.ts:85–86` are the patterns.

**`handle`**, inside `Effect.gen`:

1. `root = yield* projectRoot(context.ai, context.cwd)`; `dir = yield* resolveInputPath(root, params.directory ?? '.')`. Outside the root, this fails `ToolNotFound` before any I/O (FR-026). Then `file = path.join(dir, BRIEF_FILE)`.
2. Everything else runs in `context.briefLocks.forFile(file).withPermits(1)(Effect.uninterruptible(section))` (FR-033, P18), the compiler lock's pattern (`compiler-lock.ts:102–103`).
   - Waiting for the permit stays interruptible: a call cancelled while queued leaves the queue without reading or writing.
   - Once acquired, `section` (steps 3–8) runs to completion even when the call is cancelled, so the permit is released only after the write settled, and the next call on that brief reads the written file.
   - `forFile` is lazy: a `Map<string, Semaphore>` keyed by `process.platform === 'win32' ? file.toLowerCase() : file`, filled with `Semaphore.makeUnsafe(1)`.
   - It is created once per server in `makeServerLayer`.
3. `text = yield* readBriefText(file)`: `Effect.tryPromise` over `fs.readFile(file, 'utf8')`, with an `ENOENT` → `undefined` mapping inside the promise.
   - Any other error, `EISDIR` included, goes through `toToolError('write', file)`, which maps every errno to `ToolIoError` (`errors.ts:76–88`; `'write'` is chosen because a `'read'` ENOENT is already handled).
   - `parsed = text === undefined ? EMPTY_PARSED : yield* Effect.sync(() => parseBrief(text))` (P19). A throw is a defect: the effect fails here, before any write, and `catchDefects` logs it and answers `internal`. No `BRIEF.md` is written after a failed parse.
4. `facts = makeFacts(root.root, dir)`; `probes = yield* Effect.promise(() => probeFacts(root.root))`. `probeFacts` catches everything inside the promise, so it never fails (FR-042).
5. **Action:**
   - **`status`**: if the brief has no idea and `params.idea` is given, store it (P8): a write. A missing file with no idea writes nothing (FR-027).
   - **`answer`**: `round = nextRound(parsed.brief)`, then `applyAnswers(TREE, …, params.answers ?? [], round)`. Store the idea per P8. Write iff `changed` or the idea was stored (FR-028).
   - **`confirm`**: evaluate first.
     - `open` → `refused: { code: 'frontier-not-empty' }`.
     - A blank `confirmation` → `confirmation-missing`.
     - `confirmed` already → no-op.
     - Otherwise `confirm(brief, message, new Date(), evaluation)`: a write (FR-029).
6. `evaluation = evaluate(TREE, brief, facts)` on the resulting brief.
7. **Write**, when needed:
   - `snapshot` = `{ state, serverEligian: context.versions.compiler, eligianInstalled, packageManager, textDirection: L1 settled ? codes.map(textDirection) : undefined, assets: evaluation.assets }`.
   - `out = writeBrief(TREE, { ...parsed, brief }, snapshot)`.
   - `yield* writeBriefFile(file, out, text, context.options?.beforeRename)`:
     - `Effect.tryPromise` of `fs.mkdir(dir, { recursive: true })`, then `writeFileAtomic(file, out, { beforeRename })`.
     - `beforeRename` awaits the seam, re-reads (ENOENT → `undefined`) and returns `now === text` (FR-034).
     - `'aborted'` → `ToolIoError({ message: 'BRIEF.md changed while writing; call again', path: file })`.
     - Other rejections → `toToolError('write', file)`.
8. **Reply** (FR-030):
   - `header` is `` `eligian ${c} · eligius ${e} · eligian_brief · ${file}` ``.
   - `round = pickRound(TREE, evaluation, params.max ?? 7)`.
   - `delegated` only when the state is not `open`.
   - `next` texts:

     | Case | `next` |
     | --- | --- |
     | `open` | `` Ask the user these ${n} questions in one message, each with your recommended answer worded so that yes accepts it; then call `eligian_brief` with `action: answer`. `` |
     | `complete` | `` Show the user the counts, the delegated answers and ${file}, then call `eligian_brief` with `action: confirm` and their reply verbatim as `confirmation`. `` |
     | `confirmed` | `` Draft STORYBOARD.md from the brief (`eligian_docs` id `storyboard`). `` |
     | no file and no idea | `` Ask the user for their idea in their own words, then call `eligian_brief` with `action: status` and the idea verbatim as `idea`. `` |

**`summarizeArgs`** (FR-031) returns `{ action, answers: params.answers?.length ?? 0, max: params.max, idea: params.idea !== undefined }`. It never includes values, the idea or the message. `summarizeResult` returns `{ state, counts, rejected: value.rejected.length }`.

`DESCRIPTION` (about 760 characters, below the FR-024 budget of 1,000):

> Start here for a new Eligian presentation, before writing any file: the brief interview. action status with the user's idea verbatim (idea) returns the next round, at most 7 questions (max 1–20). Ask them in one message, each with your recommended answer worded so that yes accepts it, then record the replies with action answer: answers [{ id, value, delegated? }], value in the canonical JSON form of the item's shape; delegated: true when the user said "you decide" (value = your choice). Look facts up yourself (eligian_project, the files); ask only decisions. When state is complete, show the user the delegated answers and BRIEF.md, then call action confirm with their reply verbatim as confirmation. Only this tool writes <directory>/BRIEF.md: never edit it yourself. directory defaults to the project root.

**Where it runs and its streams.** It runs in-process in the server, on the server's fiber, with no child process. It never writes to stdout or calls `console` (FR-035). A defect goes through `catchDefects` (`errors.ts:91`) to the stderr logger.

### 6. `packages/cli/src/mcp/server.ts` (FR-024, FR-034)

- `import * as brief from './tools/brief.js'`.
- `ServerOptions` gains `readonly brief?: brief.BriefToolOptions`, next to `smoke?` (`:41–42`).
- `const briefLocks = brief.makeBriefLocks()` is created once in `makeServerLayer`, beside `context`.
- `ai.Toolkit.make(brief.makeTool(ai), docs.makeTool(ai), …)`: brief is first (FR-024, SC-007 insertions only).
- The handler record entry (P5):

  ```ts
  eligian_brief: params =>
    boundary(brief.NAME, brief.summarizeArgs(params), requestId =>
      brief.handle(params, { ...context, requestId, briefLocks,
        ...(options.brief === undefined ? {} : { options: options.brief }) }),
      brief.summarizeResult),
  ```

- The docstring at `:5` reads "The nine tools (spec 059 Phase 1 adds `eligian_brief`)".

### 7. `packages/cli/src/atomic-write.ts` and `dev/runtime-reports.ts` (FR-034)

- `RENAME_RETRIES`, `renameDelayMs`, `RETRYABLE`, `tempCounter`, `delay` and the comment `:213–220` move to `atomic-write.ts`, with `writeFileAtomic` (P6).
- `writeDevErrors` becomes `await writeFileAtomic(path.join(dir, 'dev-errors.json'), `${JSON.stringify(file, null, 2)}\n`)`. Its signature `(dir: string, file: DevErrorsFile): Promise<void>` is unchanged.
- The loop is the same: rename, retry while `attempt < 20` on `EPERM`/`EBUSY`/`EACCES`, and `fs.rm(temp, { force: true })` before rethrowing.
- The cleanup now also covers `beforeRename` (P6): one `try`/`catch` around "`beforeRename` + rename loop" removes the temp on any rejection and rethrows. For `writeDevErrors`, which passes no `beforeRename`, the behaviour is unchanged.

### 8. `@eligian/shared-utils` `package-manager.ts` (FR-041, P3)

```ts
export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';
export function readPackageManifest(dir: string): Promise<Record<string, unknown> | undefined>;
export async function findPackageManager(folderPath: string): Promise<PackageManager>; // body verbatim from install-state.ts:163–176
```

- `LOCKFILES` and `PACKAGE_MANAGER_FIELD` (`install-state.ts:146–154`) move with it.
- `index.ts` gains `export * from './package-manager.js';`.
- The module imports `node:fs/promises` and `node:path` only, with no `vscode` and no dependency. shared-utils already uses `node:fs` (`file-loader.ts`).
- `install-state.ts` imports `{ findPackageManager, type PackageManager, readPackageManifest }` from `@eligian/shared-utils`, which the extension already depends on (`packages/extension/package.json:316`). It re-exports `type PackageManager`, because `mcp-install-state.spec.ts` imports it from `../mcp/install-state.js`.

### 9. `scripts/generate-knowledge.ts` `briefQuestionsChunk()` (FR-036)

The generator imports `{ BRANCHES, TREE }` from `../src/mcp/brief/tree.js`. `tree.ts` has no imports with side effects. The chunk:

```ts
{
  id: 'brief-questions', title: 'Brief questions', kind: 'reference',
  use_cases: ['brief interview', 'eligian_brief', 'BRIEF.md', 'question tree'],
  see: ['decisions', 'storyboard'],
  card: `The ${TREE.length} questions of the brief interview (eligian_brief), by branch: id, title, prerequisites, when each applies and the docs that inform the recommendation.`,
  body: [intro, ...BRANCHES.flatMap(b => [``, `## ${b.id}: ${b.name}`, ...TREE.filter(q => q.branch === b.id).map(line)])].join('\n'),
  file: 'generated/brief-questions.md',
}
```

- `line(q)` is `- ${q.id}: ${q.title} · needs ${q.needs.join(', ') || 'none'} · applies ${q.when} · docs ${q.docs.join(', ') || 'none'}`. W1's needs print as `all other questions`.
- It is added to the chunk list at `:1173–1190`, and the generator's path check (`:1196–1199`) verifies `generated/brief-questions.md`.

## Data and generation

| Artifact | Input | Generator | Output | Drift test |
| --- | --- | --- | --- | --- |
| `brief-questions` chunk | `brief/tree.ts` (`TREE`, `BRANCHES`) | `generateKnowledge` (`scripts/generate-knowledge.ts`), run by every CLI build (`pnpm -C packages/cli generate:knowledge`) | `packages/cli/dist/docs/generated/brief-questions.md`, an `index.json` entry, an AGENTS.md block line (`agentsMdBlock`, `instructions.ts:134`) | `mcp-knowledge.spec.ts`: the chunk has one body line per template id, so a tree change without a rebuild fails. `brief-tree.spec.ts`: every `docs` id is in the generated `index.json` |
| Golden `BRIEF.md` | spec "Example `BRIEF.md`" | hand-copied once | `__fixtures__/mcp/brief/example.md` | `brief-file.spec.ts` byte-identity (SC-006) |
| All-shapes brief | `__fixtures__/mcp/brief/all-shapes.json` (one value per FR-006 shape, plus `#` and `\#` text, `\|` and `\\|` cells, a 10,000-char V2, a multi-line idea, a `reviewed` line, a dormant answer) | `writeBrief` | `__snapshots__/brief-all-shapes.md.snap` (`toMatchFileSnapshot`) | the snapshot plus the FR-021 round trip |
| `tools/list` snapshot | the server | `mcp-server.spec.ts` | `__snapshots__/tools-list-phase3.json.snap` | `git diff --numstat` shows `<n>\t0` (SC-007) |

## Test plan

Every new spec is written first and run red. Paths are under `packages/cli/src/__tests__/` unless noted.

| FR / SC | Spec file | `describe` › `it` | Assertion strategy |
| --- | --- | --- | --- |
| FR-001 | (compliance command) | n/a | `git ls-files .claude/workflows/presentation-assistant-phase.js` prints the path, and `grep -n "ROADMAP = " …` shows the 059 roadmap |
| FR-002, FR-003, FR-004, FR-038, SC-004, SC-021 | `brief-tree.spec.ts` | `the tree` › `has 63 questions in P C S V I D L A H X R W of sizes 5 5 8 6 5 8 5 6 3 5 4 3`; › `ids are unique`; › `the effective graph is acyclic` (DFS); › `every rule reads only its reads` (each `appliesWhen` evaluated over the SC-005 true and false fixtures through a throwing `AnswerView`); › `every docs id is in the generated index.json` (`generateKnowledge` into a temp dir, `beforeAll`, 120 s); › `the first frontier is P1–P5, C1–C5, R2, R3, R4, W3`; › `the first round is C1, P5, C4, P4, C3, C5, P3` (plus the dependent counts 39, 37, 24, 13, 11, 9, 6); › `every since ≤ TREE_VERSION`; › `S2 says timeline name and case-sensitive`, S2 columns `name`, `purpose`; › `titles equal the roadmap text` (a literal table for the golden ids); `docs and facts (FR-004)` › `<id> docs contain <doc id>` (an `it.each` over a literal table of every FR-004 named mapping: S1 `decisions`; S6 `provider-choice`; H1 `assets-and-host-modules` and `not-eligian`; S2, S5, S8 `presentation-patterns`; D1–D8 `css-conventions`; S4, V6, I1–I5 `map-events-and-interactions`; L1–L5 `map-locales-and-languages`; A1–A6 `map-imports-and-assets`); › `<id> has non-empty facts` (`it.each` over D1, D2, D3, L1, V3, A1, A6, R1, R3, H1) | pure; `evaluate(TREE, EMPTY_BRIEF, fakeFacts)`; the FR-004 tables are literals in the spec file, not derived from `TREE` |
| SC-012, FR-035 | `brief-tree.spec.ts` | `purity` › `tree, values, engine and brief-file import neither effect/ai nor node:fs`; › `no console in brief/* and tools/brief.ts` | read the sources and match `/from ['"](effect\/ai\|node:fs\|fs)(\/promises)?['"]/` and `/\bconsole\./` |
| FR-005, FR-006, SC-005 (shape half), SC-020 (unit half) | `brief-values.spec.ts` | `wire forms` › `accepts the canonical form of <shape>` (one `it.each` row per FR-006 id); › `rejects <variant> for <id> with "<expected>"` (`"yes"` S7, `"90"`, `"90s"`, `"1m30s"` P5, `"mouse, touch"` C3, a record for C2, `"Self-Paced"` C1, a number cell, a `\r`, a cell with `\n`, a backslash path, extra keys); `one wrong value per shape` › `rejects <value> for <shape>` (an `it.each` with one row per FR-006 shape kind: text, choice, set, yes-no, duration, view, path, record, table, plus `none` where a shape does not accept it); `extra validation (FR-006)` › `rejects <case>` (an `it.each`, one row per rule of FR-006's "extra validation" column): C2 with two `primary: yes`, with no `primary: yes`, and with a duplicate `device`; S2 with a duplicate `name`, a name containing `:`, a name containing `\|`, and a name starting with `-`; S6 `video` with source `-`, `audio` with source `-`, and `raf` with a path; V5 `duration: none` with `pacing: fixed`, `duration: 30` with `pacing: none`, and `pacing: cues` with `cues-from: -`; D3 `project` with file `-`, `system` with a path, and `cdn` with a relative path; L5 `choice: yes` with source `-`; A2 `choice: yes` with kind `-`; an empty table `[]` for C2, S2, S4, I2 and L1; an empty set `[]` for C3; an empty or all-whitespace text for P1, V1, D2, L3, H2, R2, W1 and W3 | `validateValue(question, v)` is `{ ok: false }` with a message that `toContain`s `expectedForm(shape)` for shape failures and names the rule (for example `exactly one primary`, `names are unique`) for `check` failures; every row also has its accepted twin in the canonical-form table, so a `check` that always returns `undefined` fails |
| FR-007–FR-018, FR-022, FR-023, FR-039, FR-040, SC-005, SC-016–SC-020 | `brief-engine.spec.ts` | `frontier and counts`; `rejections (FR-007)` › `an unknown template id (Z9) is unknown-question`; › `V2:nosuch is waiting before S2 is settled and unknown-question after`; › `P1 twice in one call: the first is recorded, the second is rejected duplicate`; › `one invalid and one valid answer in one call: the valid one is recorded`; `wire forms through applyAnswers (SC-020)` › `<variant> for <id> is rejected invalid-value and nothing is recorded` (an `it.each` over every SC-020 variant: `"yes"` S7, `"90"`, `"90s"`, `"1m30s"` P5, `"mouse, touch"` C3, a record for C2, `"Self-Paced"` C1, a number cell, a boolean cell), each asserting `rejected` equals `[{ id, reason: 'invalid-value', message: expect.stringContaining(expectedForm(shape)) }]`, `changed === false` and `brief.answers` deep-equal to the input brief's; › `one wrong value per FR-006 shape is rejected invalid-value` (SC-005, the shape rows of `brief-values.spec.ts` sent through `applyAnswers`); › `an FR-006 extra-validation failure is invalid-value, a cross-reference failure is invalid-reference` (C2 two primaries vs. S3 naming no view); `textDirection` › `ar-EG is rtl`, › `nl-NL is ltr`, › `an invalid code (xx-!!) and a stubbed throwing Intl.Locale give ltr`, › `without getTextInfo the textInfo getter is used` (a stub `Intl.Locale` via `vi.spyOn`); `asset list order and dedup (FR-012)` › `a V3 video row media/demo.mp4 and an S6 video source media/demo.mp4 are one entry`; › `a V3 image, an S6 audio and a D3 project font are listed in V3, S6, D3 order`; › `an https:// V3 file is remote`; › `an existing relative file is exists` (`exists` from the fake `Set`); `applies-when` › one `it` per FR-008 rule, true and false; `single view` › `S3, S4, I4, X3 not applicable`; `per-view copies` › ids, titles; `same as` › override, chain, self; `same as is live` (SC-017, four `it`s); `round selection` › max 1, 7, 20; `cross-references` › one `it` per FR-011, FR-012 (`inside` false), FR-013 (other dir); `asset list` › image `-` missing keyed `<view>: <element>`, system font not an entry, cdn remote, A1/A2/A3/A5/A6 apply, L4 with two codes; `one call` › reverse order accepted, rejected prerequisite leaves dependent waiting; `round numbers` › 1, 2, no-write consumes none; `no-op and by-only`; `review` (SC-016, seven `it`s); `staleness by round`; `per-view basis` (written, re-parsed through `brief-file`, S2 `end` row changed); `tree versions` › `tree-v2.ts` fixture; `states` › open, complete, confirmed; `re-validation` (SC-018); `dormant` (SC-019, engine half) | pure; a fake `Facts` (`briefDir`, `exists` from a `Set`, `inside` from a predicate); briefs built with a small `brief(...answers)` helper |
| FR-010 (unknown view), FR-019–FR-021, SC-006 | `brief-file.spec.ts` | `golden` › `write(parse(example)) is byte-identical`; › `parse(example) returns idea, P1, P5 = 90, C1, C4, S1, S2 (3 rows), S6 (3 rows), V3:demo (2 rows, basis 4a3055a743c8484e), V:signup (same as intro, basis 23a0aa8fc1af8ff6), no ignored`; `round trip` › the three persona briefs, all-shapes (and `toMatchFileSnapshot`); › `a CRLF copy parses the same`; `kept content` › `## Notes` and an ignored block survive byte for byte and are reported; › `a hand-edited ## Facts is dropped and rewritten`; › `a ## View: gone section when S2 lists only intro is in ignored with unknown-view and is written back verbatim after ## Facts`; › `a malformed header line (- colour: red) is in ignored with malformed header line`; `explicit FR-019 lines` (string assertions, independent of the snapshot) › `a confirmed brief has /^- confirmation: agent-reported \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z sha256:[0-9a-f]{64}$/m and a - confirmation-message: line whose value JSON.parses to the message` (a message with `"` and a newline, so the JSON escaping is exercised); › `an unconfirmed brief has - confirmation: none and no confirmation-message line`; › `L1 en-US, ar-EG gives the line - text-direction: en-US ltr, ar-EG rtl`; › `L1 unanswered gives - text-direction: -`; › `an empty asset list gives - assets: none and no asset table`; › `a non-empty asset list gives the table header \| asset \| kind \| state \|`; › `the comment line and - approval: none are verbatim`; `robustness` › `500 seeded mutations never throw` (a mulberry32 PRNG, seed in the test name; the parser has no catch-all, P19, so a throw is a real failure) | `readFileSync` of fixtures; `Buffer` equality; `toMatch` / `toContain` on the written text for the FR-019 lines. `toMatchFileSnapshot` only guards drift of the all-shapes output; it is never the only check of an FR-019 line |
| FR-019 (confirmation lines), FR-020 (`ignored` in the reply), FR-024–FR-034, FR-042, P6, P8, P18, P19, SC-010, SC-011, SC-013 (in-process half), SC-015, SC-016 (tool half), SC-019 (tool half), SC-022 (tool half) | `brief-tool.spec.ts` | `paths` (SC-011, four `it`s; `it.runIf(win32)` for backslash and drive-case); `status` › creates with idea, no file and no idea creates nothing (and `next` asks for the idea), second idea unchanged; `idea (P8)` › `an answer call without an idea creates BRIEF.md with no blockquote; a later status with an idea stores it and a third idea is ignored`; › `an idea with CRLF is stored with LF (the blockquote lines, and parseBrief returns the LF text)`; `answer` › all rejected and all no-op leave bytes and `mtimeMs` unchanged; `review (SC-016 tool half)` › `answer C1, S1, S2; change C1; re-send S1 unchanged`: the parsed `BRIEF.md` has S1 with its old `round` and `reviewed: n` (the text contains `- reviewed: <n>` under `### S1:`), S1 is not in the reply's `round`, S2 is still answered, and the next `answer` call is recorded at round `n + 1`; `dormant (SC-019 tool half)` › `S2 drops to one view`: S3's block is still in the written `BRIEF.md` byte for byte, the reply's `counts.notApplicable` includes it and `counts.answered` does not, S3 is absent from the reply's `delegated`; › `a confirmed brief becomes complete after S2 drops to one view` (`confirm`, then the S2 change, then `status`: `state === 'complete'`); › `answer S3 is rejected not-applicable` (`rejected[0]` is `{ id: 'S3', reason: 'not-applicable' }` and the file's bytes are unchanged); `max` › `0` and `21` give `-32602` matching `/between 1 and 20/`, and no file; `io` › `BRIEF.md` as a directory gives kind `io`; › `a beforeRename that rejects gives kind io, BRIEF.md untouched, no *.tmp left`; `parse defect (P19)` › `a parseBrief that throws gives kind internal, BRIEF.md bytes unchanged, and console.error got the defect` (`brief-file.js` is replaced by a pass-through `vi.mock(…, async importOriginal => …)` whose `parseBrief` throws `PARSE-DEFECT-SENTINEL` only when the text contains that sentinel; the stderr assertion copies `mcp-stdout.spec.ts:344–380`, `vi.spyOn(console, 'error')`); `confirm` › refused while open, `confirmation-missing`, re-confirm keeps bytes; › `a successful confirm writes - confirmation: agent-reported <ISO> sha256:<64 hex> whose digest equals digest() of the parsed answers, and - confirmation-message: <JSON of the reply verbatim>`; `reply` › header regex, the three `next` texts, `delegated` presence; › `a hand-edited answer with an unknown id (### Z9: …) is in the reply's ignored with its line and reason, and survives the next write`; `telemetry` › sentinel absent from `summarizeArgs`/`summarizeResult` JSON; `concurrency` › 20 parallel answers on `four-views.md` (rounds `k+1…k+20`), `status` completes while a latched lock holds a `check` (`compilerLockLayer({ latch })`, `compiler-lock.ts:129`, passed as `lock`), a hand edit in `beforeRename` gives `io` with the exact message, keeps the edit byte for byte and leaves no `*.tmp`, and A held in the seam while B completes (FR-033); › `a cancelled call finishes its write before the next call on that brief starts` (P18): call A (`request('tools/call', …, 11)`, one answer) is held in the `beforeRename` seam; `notify('notifications/cancelled', { requestId: 11 })`; call B (another answer, id 12) on the same directory is started and is seen not to reach its own seam; A is released; B completes. Then A sent no response (`frames` has no id 11), the parsed `BRIEF.md` holds both A's and B's answers, their rounds are distinct and B's is A's + 1, and no `*.tmp` is left. Negative control: the same test against a section without `Effect.uninterruptible` loses A's answer or repeats its round; it is run once while the test is written red and recorded in `compliance.md`, not kept; `stale state` › hand-edited P4 gives `complete`, a created asset makes A1 not applicable; `facts probes` › `eligian-installed: 1.1.0` + `package-manager: pnpm`, then `-` + `npm`, invalid `package.json` gives `-` | `startInMemoryServer({ cwd, docsRoot, brief: { beforeRename } })`, `callTool('eligian_brief', …)`, `parseBrief(readFileSync(...))`; temp projects via `fs.realpathSync(fs.mkdtempSync(...))` |
| SC-002, SC-003, SC-021 | `mcp-brief-interview.spec.ts` | `interview` › `terse reaches complete then confirmed`, `detailed …` (asserts the 71 applicable instances and the per-branch split P 5, C 5, S 8, V 18, I 4, D 8, L 4, A 6, H 1, X 5, R 4, W 3 from the final evaluation, then the round bound ⌈(71 − 1)/7⌉ + 2 = 12 from that literal; logs its round count), `vague …` (its first S3 is rejected `invalid-reference` and the next S3 is accepted); › `the first round item with id S2 has an ask containing "timeline name"` (SC-021 interview half, asserted inside the driver on whichever round first carries S2); `not gated` › `check, compile, fmt, project, smoke return the same with an open BRIEF.md` | the persona driver loop (SC-002 rules, cap 20, failure names the last round's ids); payload equality with and without the file (smoke with the stub CLI, `mcp-server.spec.ts:38`) |
| SC-007, FR-037 | `mcp-server.spec.ts` (edited) | `lists exactly nine tools`; `tools/list matches the Phase 3 snapshot`; `four upfront, three readonly …` (brief: alwaysLoad, `destructiveHint false`, `idempotentHint true`, not `readOnlyHint`); `upfront descriptions ≤ 1000` (`toHaveLength(4)`); new `it('the eligian_brief description says only the tool writes BRIEF.md')` (FR-024): the description contains `BRIEF.md` and `never edit` | existing harness; `TOOL_NAMES` and `UPFRONT` gain `brief.NAME`; the annotations loop gets a brief branch before the `UPFRONT` branch |
| FR-037 | `mcp-resources.spec.ts:105` | `toHaveLength(9)` | edit |
| SC-008, FR-036 | `mcp-knowledge.spec.ts` (edited) | `REFERENCE_CHUNKS` gains `brief-questions`; new `it('brief-questions lists every template question')` checks kind `reference`, `see` `['decisions','storyboard']`, 63 lines matching `/^- [A-Z]\d?: /`, card ≤ 120 words, body ≤ 3,000 words | generated docs dir of the spec |
| SC-009 | `mcp-stdout.spec.ts` (edited) | `test.skipIf(!built)('eligian_brief over the spawned server leaves stdout pure')` | `spawnServer({ cwd: tempProject })`, `initialize`, `status` with idea, one `answer`, `expectOnlyFrames(stdoutLines)` |
| SC-013 (restart) | `mcp-brief-restart.spec.ts` (new, `cli` project) | `test.skipIf(!built)('rounds survive a server restart')` | process A: `spawnServer({ cwd })`, two `answer` calls, `close()`; process B: one `answer`, `status`. Assert rounds 1, 2, 3 in the parsed file, and B's state, round ids and counts equal `evaluate`/`pickRound` over `parseBrief(file)` with `makeFacts(root, dir)` |
| FR-034 (helper) | `atomic-write.spec.ts` | `writeFileAtomic` › writes and renames, no `*.tmp` left; › `beforeRename` false returns `'aborted'`, target untouched, temp removed; › `beforeRename` that rejects: the promise rejects with that error, the target is untouched, and no `*.tmp` is left (P6); › temp name `.BRIEF.<pid>.<n>.tmp` | temp dir |
| FR-034 (dev unchanged) | `runtime-reports.spec.ts`, `dev-server.spec.ts` | unchanged, must stay green | n/a |
| FR-041, SC-022 | `packages/shared-utils/__tests__/package-manager.spec.ts` (new) | cases (1)–(4) of `mcp-install-state.spec.ts:262–322`, moved: lockfile per kind, ancestor walk, nearest ancestor wins, `packageManager` field, lockfile beats field, default `npm` (with the `markerAboveTmpdir` guard); `readPackageManifest` › missing / invalid / valid | temp dirs |
| FR-041 | `packages/extension/src/extension/__tests__/mcp-install-state.spec.ts` | the `findPackageManager` expectations are removed from the shared `it`s; the `installCommand` expectations stay | edit |
| SC-001 | (compliance commands) | n/a | after `pnpm build`, Bash runs `ci.yml:55–57` and `:102–111` verbatim with the new `want`. Expected stdout: `tools/list: eligian_brief eligian_check eligian_compile eligian_docs eligian_fmt eligian_init eligian_operations eligian_project eligian_smoke`, exit 0 |
| SC-014 | (gates) | n/a | see "Gates" |

**Persona fixtures** (`__fixtures__/mcp/brief/personas/*.json`) have the form:

```ts
{
  idea: string,
  answers: { [id: string]: { value: unknown, delegated?: boolean } | { values: { value: unknown, delegated?: boolean }[] } },
  script: { afterRound: number, answers: { id: string, value: unknown, delegated?: boolean }[] }[],
}
```

The driver's rules:

1. **One value, or a sequence.** For an asked id with `{ value }`, the driver sends that value every time the id is asked. For an id with `{ values: [...] }`, it keeps a per-id cursor and sends the next entry each time the id is asked; once the sequence is exhausted it repeats the last entry. The vague persona's S3 is `{ values: [{ value: "nowhere" }, { value: "intro" }] }`: the first ask sends the invalid view (rejected `invalid-reference`, SC-002 item 5), the engine asks S3 again in the next round (SC-002 item 4 (ii)), and the second ask sends the correction, whatever round numbers ranking produces.
2. **A missing id fails.** An asked id that has no entry fails the test, naming it (SC-002 item 3).
3. **Scripted entries replace, never duplicate.** After round `n` the driver merges the `afterRound: n` entries into that call: a scripted entry whose id is also asked in that round replaces the asked id's value in the call instead of adding a second entry, so no call carries the same id twice and nothing is rejected `duplicate` (FR-007). A scripted entry does not advance that id's `values` cursor.
4. **"Last value".** SC-002 item 3's "the persona's last value for that id" is the last value the driver actually sent for it (the cursor position or the last scripted value), tracked by the driver.

The detailed persona's 71 applicable instances (SC-002) are a literal in the test: it asserts `answered + delegated-inclusive applicable instances === 71` and the per-branch split from the final evaluation (`evaluate`/`pickRound` over `parseBrief` of the written file, as SC-013 does), then derives the round bound from that literal. A bug that makes fewer instances apply fails the count instead of quietly lowering the bound.

## Build integration

- **`packages/cli/package.json`**: `devDependencies` gains `"@eligian/shared-utils": "workspace:*"` (P15). No script, `files` or `exports` change: the chunk ships through the existing `dist/docs/**`, and the tool through `dist/cli.mjs`. Then `pnpm install` updates the lockfile.
- **`packages/cli/tsconfig.json`, `tsconfig.test.json`**: `references` gains `{ "path": "../shared-utils" }`.
- **`packages/cli/esbuild.mjs`**: no change. `@eligian/shared-utils` is already mapped to `../shared-utils/src/index.ts` (`:38`), and `package-bin.spec.ts` "imports only Node built-ins and the dependencies" stays green.
- **`packages/shared-utils`**: a new module and an `index.ts` line. Its `build` is `tsc`, already first in `tsconfig.build.json`.
- **`.github/workflows/ci.yml`**:
  - Both `want` strings (`:57`, `:111`) gain `eligian_brief` in sorted position (first).
  - The comment at `:53` says "the nine tools".
  - `.claude/hooks/guard-ci-gates.cjs` reads `ci.yml`, so no hook change is needed.
- **Docs**:
  - `packages/cli/AGENTS.md:34`: "`tools/` (the nine tools), `brief/` (the brief interview: tree, values, engine, `BRIEF.md` file)".
  - Root `AGENTS.md:49`: "Nine tools: `eligian_brief`, …".
  - Root `AGENTS.md:97` per P14.
  - No README or CHANGELOG entry (spec non-goal, Phase 3).
- **Workflow**: `.claude/workflows/presentation-assistant-phase.js` is staged with the phase (FR-001). The workflow itself never commits; the user does.

### Gates

| When | Gate |
| --- | --- |
| every group | `pnpm typecheck`, `pnpm run ci`, scoped `pnpm -C packages/cli exec vitest run <specs>` |
| groups touching `tools/brief.ts`, `server.ts`, `atomic-write.ts`, `dev/runtime-reports.ts` | `pnpm effect:check:cli` (0/0/0) |
| the shared-utils move | `pnpm -C packages/shared-utils test`, `pnpm -C packages/extension exec vitest run src/extension/__tests__/mcp-install-state.spec.ts` |
| the generator change | `pnpm -C packages/cli build` (runs `generate:knowledge`), `vitest run src/__tests__/mcp-knowledge.spec.ts src/__tests__/agents.spec.ts` |
| last group | `pnpm build`, `pnpm typecheck:tests`, `pnpm check`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm run check:examples`, `pnpm effect:check`, the SC-001 commands. `smoke:examples` and `fmt:examples` are not affected (no language, compiler or example change) and are not required |

`pnpm effect:check:language` is run once in the last group, for completeness. No language source changes.

## Risks and mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | **Concurrency on the Langium singleton** | None arises. The brief path never calls `getOrCreateServices` or the `CompilerLock` (P5), as SC-010's latched-lock test proves. |
| 2 | **Concurrent writers.** Two calls in one server, two servers on one project, or an editor | A per-file semaphore in one server (FR-033). The re-read before the rename across processes (FR-034). A small window remains between the re-read and the rename. It is accepted: the next call re-reads, and nothing is silently merged. |
| 2a | **A cancelled call** (`notifications/cancelled` interrupts the handler fiber, `McpServer.js:1113–1132`, `:1356–1371`) | A cancelled call finishes its write before the next call on that brief starts: the acquired section is `Effect.uninterruptible` (P18, as `compiler-lock.ts:102–103`), so the permit is released only after the write settled. A call cancelled while queued never runs. `brief-tool.spec.ts` › `concurrency` › `a cancelled call finishes its write …` is the check. |
| 3 | **jsdom globals** | Not loaded by the brief path. SC-003's smoke call uses the stub CLI child (`mcp-server.spec.ts:38`), as today. |
| 4 | **Stdout pollution** | No `console` and no `process.stdout` in the new modules (SC-012 grep test). Defects go to the stderr logger through `catchDefects`, the parser's included: `parseBrief` has no catch-all, and the tool runs it in `Effect.sync` before any write (P19), so a parser bug is logged, answered `internal` and never rewrites `BRIEF.md`. The spawned SC-009 run checks the frames. |
| 4a | **A temp file left in the user's project** | `writeFileAtomic` removes the temp on every rejection after the temp write, `beforeRename` included (P6). `atomic-write.spec.ts` and `brief-tool.spec.ts` › `io` check that no `*.tmp` is left. |
| 5 | **Startup time** | `tree.ts` is a static array of 63 objects. `tools/brief.ts` is imported statically by `server.ts`, like the other tools, and its only heavy import (`@eligian/language`) is already loaded by `server.ts:14`. `package-bin.spec.ts:149` (< 3 s) is the gate. |
| 6 | **Windows paths** | `resolveInputPath` normalises backslashes and drive case (`paths.ts:93`). Lock keys are lower-cased on win32. The rename retry covers an editor holding `BRIEF.md` (≈ 2.5 s budget). CRLF input is parsed, and the output is LF. SC-011 runs on both OSes. |
| 7 | **CLI coverage thresholds** (77.1 / 77.6 / 64.5 / 76.6) | The pure modules are unit-tested branch by branch. `tools/brief.ts` is covered in-process. Run `pnpm test:coverage:ci` in the last group, and add tests rather than lower a threshold. The language thresholds are untouched. |
| 8 | **Effect LSP findings** (`tryCatchInEffectGen`, `unstableApiUsage`, `globalErrorInEffectFailure`) | Sync try/catch only in plain helpers outside `Effect.gen`. The `unstableApiUsage:off` header. Failures are only the existing tagged errors. If `Semaphore.makeUnsafe` outside an effect is flagged, `forFile` returns `Effect.sync(() => …)` instead. |
| 9 | **`Schema.Unknown` in `tools/list`** | It emits `{}` for `value` and `previous`. The snapshot pins it. Validation is the engine's (FR-005), which is why the schema does not narrow it. |
| 10 | **The tools-list snapshot must change by insertion only** (SC-007) | The tool is registered first, and no existing tool's text is touched. The `git diff --numstat` command is in compliance. |
| 11 | **Eval runs see a ninth, always-loaded tool** | Phase 1 runs no eval. `ALLOWED_TOOLS_A1` is `mcp__eligian__*` (`mcp/evals/harness.ts:128`), so the tool is reachable. A case's call budget may count brief calls if an agent tries the tool. That is recorded for Phase 3, where the instructions change. |
| 12 | **`@eligian/language` resolves to its built bundle in CLI specs** | `isValidLanguageCode` is a plain regex function in that bundle. `pnpm build` runs before the tests, as for every CLI spec. |
| 13 | **Moving `findPackageManager` breaks the extension bundle** | The extension already depends on `@eligian/shared-utils` (`package.json:316`, `tsconfig.json:12`). The `vscode:prepublish` build and `mcp-install-state.spec.ts` are the checks. |
| 14 | **The engine's size** (rules, cross-references, staleness and `same as` in one file) | Shapes are split into `values.ts` (P10). Cross-references are one table keyed by id. If `engine.ts` grows past about 700 lines, `crossCheck` moves to `brief/references.ts` without an API change. |

## Suggested task groups (for tasks.md)

1. **Foundations.** Stage the workflow (FR-001). Move `findPackageManager` (with its spec, the extension edit and P15). Extract `writeFileAtomic` (with its spec, and the dev specs green). Export `cellsOf` and `isSeparator`.
2. **The tree.** `tree.ts` and `brief-tree.spec.ts`. The docs-id test lands after group 6.
3. **The values.** `values.ts` and `brief-values.spec.ts`.
4. **The engine.** `engine.ts` and `brief-engine.spec.ts`, plus the `tree-v2.ts` fixture.
5. **The file.** `brief-file.ts`, `brief-file.spec.ts`, and the golden, all-shapes and four-views fixtures.
6. **The tool.** `tools/brief.ts` and the `server.ts` registration, `brief-tool.spec.ts`, the generator chunk, and the pins (`mcp-server.spec.ts`, the snapshot, `mcp-resources.spec.ts`, `mcp-knowledge.spec.ts`, `ci.yml`).
7. **End to end.** The personas and `mcp-brief-interview.spec.ts`; `mcp-stdout.spec.ts` (SC-009) and `mcp-brief-restart.spec.ts` (SC-013).
8. **Docs and gates.** The AGENTS.md lines, then the full gates and the SC-001 commands.

Groups 2 and 3 can run in parallel `[P]`, as can the three sub-tasks of group 1.

## Review notes

- **Plan elements without an FR (P8, P14): the spec-row half is not applied here.** This revision edits `plan.md` only, so FR-037 (`AGENTS.md:97`) and FR-027 / FR-028 (the idea is stored whenever the brief has none; CRLF becomes LF) are not rewritten in `spec.md` by it. The substance is applied: P8 and P14 now say which FR row they extend, both are recorded in `compliance.md` at build time, P8 has two `brief-tool.spec.ts` tests (`idea (P8)`), P14 has a compliance grep, and the FR-024 description rule has an `mcp-server.spec.ts` assertion. The FR-037 / FR-027 / FR-028 wording is proposed to the spec owner for the next spec edit; neither reading weakens a requirement (P14 adds a pin, P8 widens "if the file is new" to "if the brief has no idea", which includes a new file).
- Every other issue of this review was applied in full: P18 (uninterruptible acquired section, with a cancellation test and a risk row), P19 (no catch-all in `parseBrief`; parse in `Effect.sync` before any write), P6's temp cleanup around `beforeRename`, the `compilerLockLayer` correction, the persona driver's value sequences and replace-not-duplicate rule, and the missing tests (FR-004 mappings, FR-006 extra-validation rejections, SC-005's per-shape rejection, SC-020 through `applyAnswers`, FR-007 rejections, FR-019's explicit lines and `textDirection`, FR-012 dedup and order, FR-010 `unknown-view`, the tool halves of SC-016 and SC-019, SC-002's literal 71 and SC-021's interview half). No threshold was relaxed.
