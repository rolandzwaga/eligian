# Tasks: presentation assistant, Phase 1: brief engine

**Input**: `specs/059-presentation-assistant/phase-1-brief-engine/spec.md` (FR-001 to FR-042, SC-001 to SC-022, clarifications Q1 to Q8) and `plan.md` (P1 to P19, module design §1 to §9, test plan, gates), roadmap §3, §4.1, §4.6, §8 Phase 1, §9; `spikes.md`.
**Branch**: `spec/059-presentation-assistant`. Nothing in this list commits; the user commits.

## How to read this list

- Tasks `T001` … are grouped into ordered **groups**. A group starts only when the previous group's gate is green.
- **[P]** marks a task that creates only NEW files, disjoint from every other task of its group, so the [P] tasks of a group can run in parallel. A task without [P] runs alone, in the listed order. Every task that edits an existing or shared file (a `package.json`, an `index.ts` barrel, `server.ts`, an existing spec, `ci.yml`, `AGENTS.md`, …) is unmarked.
- Every task follows the repo order: **write the failing test first and run it red → implement → `pnpm check` clean (Biome autofix, 0 errors and 0 warnings) → the verify command green**. Tasks that touch Effect code (`tools/brief.ts`, `server.ts`, `atomic-write.ts`, `dev/runtime-reports.ts`) also run `pnpm effect:check:cli` with 0 errors, 0 warnings, 0 messages gated.
- Paths: Bash takes `/f/projects/eligius/eligian/...`; every other file tool takes `F:\projects\eligius\eligian\...`. Commands below are run from the repo root in Bash.
- **CLI specs resolve `@eligian/language` and `@eligian/shared-utils` to their built output** (`packages/*/dist`). Run `pnpm -C packages/language build` once before the first CLI spec, and `pnpm -C packages/shared-utils build` after T005.
- Effect v4 idioms: `Effect.fail` with tagged errors, no `try`/`catch` inside `Effect.gen` (sync helpers that catch are plain functions outside the generator), `Effect.void`, no `Effect.gen` adapter, `// @effect-diagnostics unstableApiUsage:off` at the top of a tool module (as `tools/init.ts:12`). No `console.*` and no `process.stdout` anywhere in `brief/*` or `tools/brief.ts` (FR-035). The repo `lib` is ES2020: no `Array#at`.
- Read `specs/TESTING_GUIDE.md` once before the first test. Its templates are language-package templates; no language test is written in this phase (plan "Constitution check").

### Reused code (verified this session; cite, do not rebuild)

| What | Where (verified) |
| --- | --- |
| `makeServerLayer`, toolkit, handler record, `boundary`, `call`, `ServerOptions` (`smoke?` seam) | `packages/cli/src/mcp/server.ts:68`, `:109–118`, `:137–177`, `:95–107`, `:125–136`, `:35–43` |
| `projectRoot`, `isInside`, `resolveInputPath`, `type EffectAi` | `packages/cli/src/mcp/paths.ts:63`, `:81`, `:93`, `:20` |
| `ToolNotFound`, `ToolIoError`, `ToolInternal`, `ToolError`, `ToolFailure`, `toToolError`, `catchDefects` | `packages/cli/src/mcp/errors.ts:14`, `:19`, `:24`, `:29`, `:34`, `:76`, `:91` |
| `ToolContext` | `packages/cli/src/mcp/tools/check.ts:27` |
| `alwaysLoad` / `Destructive` / `Idempotent` annotations | `tools/check.ts:108`, `tools/init.ts:85–86` |
| `cellsOf`, `isSeparator` (module-private today), `readStoryboard` | `packages/cli/src/mcp/storyboard.ts:42`, `:61`, `:66` |
| `writeDevErrors` rename loop and its constants | `packages/cli/src/dev/runtime-reports.ts:213–251` |
| `findPackageManager`, `PackageManager`, `LOCKFILES`, `PACKAGE_MANAGER_FIELD`, `readManifest`, `installCommand` | `packages/extension/src/extension/mcp/install-state.ts:144–176`, `:206` |
| `compilerLockLayer`, `makeCompilerLock`, `CompilerLock` | `packages/cli/src/mcp/compiler-lock.ts:129`, `:83`, `:59` |
| `generateKnowledge`, `domEventsChunk`, chunk list, `chunkFile` check | `packages/cli/scripts/generate-knowledge.ts:1155`, `:781`, `:1173–1190`, `:1197–1199` |
| `startInMemoryServer` (`callTool`, `request`, `notify`, `frames`), `spawnServer`, `BIN` | `packages/cli/src/__tests__/mcp-test-client.ts:123`, `:226`, `:264`, `:260` |
| `isValidLanguageCode` (root export of `@eligian/language`) | `packages/language/src/eligian-validator.ts:50`, `packages/language/src/index.ts:34` |
| `@eligian/shared-utils` bundled from source | `packages/cli/esbuild.mjs:38` |

---

## Group 1 — Foundations (new files only)

- [ ] **T001 [P] Stage the cloned workflow (FR-001).**
  - Files: `.claude/workflows/presentation-assistant-phase.js` (exists, untracked).
  - Check first: `grep -n "ROADMAP = \|const DIR" .claude/workflows/presentation-assistant-phase.js` prints `85:const ROADMAP = 'specs/059-presentation-assistant/roadmap.md'` and `88:const DIR = \`specs/059-presentation-assistant/${SLUG}\``. Do not edit the script.
  - Action: `git add .claude/workflows/presentation-assistant-phase.js` (stage only; never commit).
  - Verify: `git ls-files .claude/workflows/presentation-assistant-phase.js` prints the path.

- [ ] **T002 [P] `findPackageManager` in `@eligian/shared-utils` (FR-041, plan P3, §8).**
  - Create: `packages/shared-utils/src/package-manager.ts`, `packages/shared-utils/__tests__/package-manager.spec.ts`. Do NOT touch `index.ts`, the extension or its spec here (T005 does).
  - Failing test first (`package-manager.spec.ts`, imports from `../src/package-manager.js`, temp dirs via `fs.mkdtempSync(path.join(os.tmpdir(), …))`, removed in `afterEach`):
    - `describe('findPackageManager')`, copied from `packages/extension/src/extension/__tests__/mcp-install-state.spec.ts:262–322` cases (1)–(4), including its `markerAboveTmpdir` guard (`:229`): › `(1) a lockfile in the folder › <lockfile> → <manager>` (an `it.each` over `pnpm-lock.yaml`→`pnpm`, `yarn.lock`→`yarn`, `bun.lockb`→`bun`, `bun.lock`→`bun`, `package-lock.json`→`npm`); › `(2) pnpm-lock.yaml two levels up → pnpm`; › `(2) the nearest of two ancestors wins` (`yarn`); › `(3) an ancestor package.json with packageManager pnpm@9.0.0 and no lockfile → pnpm`; › `(3) in one directory a lockfile wins over the field` (`yarn`); › `(4) nothing found → npm`.
    - `describe('readPackageManifest')` › `a missing package.json is undefined`; › `invalid JSON is undefined`; › `a JSON array is undefined`; › `a valid object is returned` (`toEqual({ name: 'x', version: '1.1.0' })`).
  - Implement: `export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm'`; `export function readPackageManifest(dir: string): Promise<Record<string, unknown> | undefined>` (today's private `readManifest`, `install-state.ts:156–160`); `export async function findPackageManager(folderPath: string): Promise<PackageManager>` with the body of `install-state.ts:163–176` verbatim; `LOCKFILES` and `PACKAGE_MANAGER_FIELD` (`:146–154`) as module constants; private `readText` / `isFile` / `parseJson` / `isRecord` helpers of a few lines each. Imports `node:fs/promises` and `node:path` only: no `vscode`, no new dependency.
  - Verify: `pnpm -C packages/shared-utils exec vitest run __tests__/package-manager.spec.ts`; `pnpm check`.

- [ ] **T003 [P] `writeFileAtomic` (FR-034, plan P6, §7).**
  - Create: `packages/cli/src/atomic-write.ts`, `packages/cli/src/__tests__/atomic-write.spec.ts`. Do NOT touch `dev/runtime-reports.ts` here (T006 does).
  - Failing test first (`describe('writeFileAtomic')`, temp dir per test):
    - `it('writes the text and leaves no *.tmp')`: the target's bytes equal the text; `fs.readdirSync(dir).filter(f => f.endsWith('.tmp'))` is `[]`; the result is `'written'`.
    - `it('replaces an existing target')`.
    - `it('beforeRename false returns aborted, leaves the target untouched and removes the temp')`: target pre-written with `OLD`; result `'aborted'`; target still `OLD`; no `*.tmp`.
    - `it('a beforeRename that rejects rejects with that error, leaves the target untouched and no *.tmp')`: `await expect(writeFileAtomic(t, 'x', { beforeRename: async () => { throw err } })).rejects.toBe(err)`.
    - `it('names the temp .BRIEF.<pid>.<n>.tmp in the target dir')`: inside `beforeRename` list the dir; exactly one entry matches `new RegExp(\`^\\.BRIEF\\.${process.pid}\\.\\d+\\.tmp$\`)`.
  - Implement exactly plan §7 / P6: move semantics of `runtime-reports.ts:213–251` (the comment block `:213–220`, `RENAME_RETRIES = 20`, `renameDelayMs`, `RETRYABLE` = `EPERM`/`EBUSY`/`EACCES`, `tempCounter`, `delay`) into this module. Signature `writeFileAtomic(target: string, text: string, options?: { readonly beforeRename?: () => Promise<boolean> }): Promise<'written' | 'aborted'>`. Temp name `.${path.parse(target).name}.${process.pid}.${n}.tmp` in `path.dirname(target)`. Keep `import * as fs from 'node:fs/promises'` (the namespace the dev-server spec mocks, `dev-server.spec.ts:25`). After the temp write, the `beforeRename` call and the whole rename loop run inside one `try { … } catch (error) { await fs.rm(temp, { force: true }).catch(() => {}); throw error; }`. A `false` from `beforeRename` removes the temp and returns `'aborted'`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/atomic-write.spec.ts`; `pnpm check`; `pnpm effect:check:cli`.

- [ ] **T004 [P] The question tree (FR-002, FR-003, FR-004, FR-008 rules, FR-038; plan §1, P10).**
  - Create: `packages/cli/src/mcp/brief/tree.ts`, `packages/cli/src/__tests__/brief-tree.spec.ts`.
  - Read first: roadmap §3.2–§3.13 (`roadmap.md:98–229`, the source of every id, title, needs and applies-when), spec FR-002–FR-006, FR-008, FR-038 (`spec.md:96–237`), plan §1 (`plan.md:159–224`).
  - Failing test first (`brief-tree.spec.ts`; pure, no server):
    - `describe('the tree')`:
      - `it('has 63 questions in P C S V I D L A H X R W of sizes 5 5 8 6 5 8 5 6 3 5 4 3')`: `TREE.length === 63`; the branch sequence of `TREE` collapses to `P C S V I D L A H X R W`; per-branch counts as listed; `BRANCHES.map(b => b.name)` equals `['Purpose', 'Context of use', 'Structure', 'One copy per view', 'Interaction', 'Visual design', 'Languages', 'Assets', 'Custom behaviour', 'Accessibility', 'Delivery', 'Working agreement']`; `TREE_VERSION === 1`.
      - `it('ids are unique')`.
      - `it('every needs and reads id is a template id')`.
      - `it('W1 needs every other template id')`.
      - `it('the effective graph is acyclic')`: DFS over `effectivePrerequisites(q)` (needs ∪ reads) finds no back edge.
      - `it('every since ≤ TREE_VERSION')` and every `since === 1`.
      - `it('S2 says timeline name and case-sensitive')`: S2 `ask` contains `timeline name` and `case-sensitive` and ends with `Each name is the timeline name the program will use, matched exactly (case-sensitive).`; S2 `title` is `Which views are there: a name and a one-line purpose for each, in order?`; S2 `shape.columns.map(c => c.name)` is `['name', 'purpose']`.
      - `it('titles equal the roadmap text')`: a literal table in the spec file for the golden ids (P1, P5, C1, C4, S1, S2, S6, V3), the exact `### <id>: <title>` texts of the golden fixture (`spec.md:663–734`); e.g. S1 is `Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece?` (the `(doc …)` parenthetical removed) and S6 is ``What drives each view's time: `raf`, `video`, `audio`, `scroll`?``.
      - `it('reads follow FR-003 and FR-008')`: a literal table: V6 reads `C3`; D8 and A5 read `V3`; A4 reads `S6`, `V3`; A1, A2, A3, A6 read `V3`, `S6`, `D3`; L4 reads `L1`, `V3`, `S6`, `D3`; L5 `L4`; S3, S4, I4, X3 `S2`; S7 `S6`, `C4`; I1 `V5`; I2, I5 `C3`; L2, L3 `L1`; H2, H3 `H1`; X4 `S6`; X5 `S5`; every other id `[]`.
      - `it('the shapes follow FR-006')`: an `it.each` literal table over all 63 ids giving `shape.kind`, and for choice/set the `options`, for record/table the column names, `none` and `rows: 'one-per-view'` (S5, S6, D5) exactly as `spec.md:147–203` lists.
    - `describe('applies-when (FR-008)')` › `<id> is <expected> for <case>`: an `it.each` literal table with one true and one false case per rule of FR-008 (S3/S4/I4/X3 with one vs two S2 rows; S7 video + C4 `on` true, C4 `off` false; V6 `['mouse']` vs `['keyboard']`; I1 a V5 copy with duration `30` vs all `none`; I2; I5; D8; L2/L3 one vs two L1 rows; L4 two codes + one asset vs two codes + no asset; L5; A1/A2 a `missing` entry vs only `exists`; A3/A6 empty vs non-empty asset list; A4 a `video` entry vs only `image`; A5; H2 `external-data`; H3 `analytics`; X4; X5 `advance` vs `stay`) and `ALWAYS` ids true. Each case calls `q.appliesWhen(view, assets)` with a restricted view built by a test helper that serves only `q.reads` and **throws on any other id**, so the test also proves "reads only its reads" (SC-004).
    - `describe('docs and facts (FR-004)')`: › `<id> docs contain <doc id>`: an `it.each` over a literal table: S1 `decisions`; S6 `provider-choice`; H1 `assets-and-host-modules` and `not-eligian`; S2, S5, S8 `presentation-patterns`; D1–D8 `css-conventions`; S4, V6, I1–I5 `map-events-and-interactions`; L1–L5 `map-locales-and-languages`; A1–A6 `map-imports-and-assets`. › `<id> has non-empty facts`: `it.each` over D1, D2, D3, L1, V3, A1, A6, R1, R3, H1; R1's facts mention `eligian-installed` and `package-manager` (FR-004, FR-042).
  - Implement `tree.ts` with exactly the exports of plan §1 (`TREE_VERSION`, `BranchId`, `BRANCHES`, `Cell`, `AnswerValue`, `CellKind`, `Column`, `Shape`, `AnswerView`, `AssetEntry`, `Question` with `when` and optional `check`, `TREE`, `ALWAYS`, `effectivePrerequisites`). It imports nothing (no `effect`, no `node:*`), and does no I/O at import (SC-012).
    - **`AnswerView` reading for V templates** (plan §3 step 4c: "a V template read returns an array of the copies' values"): declare `interface AnswerView { get(id: string): AnswerValue | undefined; copies(id: string): readonly AnswerValue[] }`. `get` serves a non-V id (`undefined` when not applicable or not settled); `copies('V3')` / `copies('V5')` return the settled copies' values in S2 order. Both throw on an id outside `reads`. Record this reading in the task's report for `compliance.md`.
    - `check` holds FR-006's intra-value rules (C2 one primary + unique devices; S2 name pattern `^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$` + unique names; S6 source rule; V5 couplings; D3 file rule; L5, A2 couplings). Write the `check` bodies here but test them in T009 (`values.ts` calls `check`).
    - `docs`, `facts`, `when` per FR-004 and plan §1. `since: 1` everywhere.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-tree.spec.ts`; `pnpm check`.

**Gate 1**: `pnpm typecheck`, `pnpm run ci`, the four verify commands above.

---

## Group 2 — Wire the foundations (sequential edits of existing files)

- [ ] **T005 Export `findPackageManager` from shared-utils and import it in the extension (FR-041, P3).**
  - Edit: `packages/shared-utils/src/index.ts` (add `// Package manager detection (spec 059 FR-041)` and `export * from './package-manager.js';`), `packages/extension/src/extension/mcp/install-state.ts`, `packages/extension/src/extension/__tests__/mcp-install-state.spec.ts`.
  - Test change first: in `mcp-install-state.spec.ts`, remove the `findPackageManager` expectations of `describe('findPackageManager / installCommand')` cases (1)–(4) (`:262–322`; they now live in T002's spec) and keep every `installCommand` expectation (cases (5), (6) and any `installCommand` assertion inside (1)–(4)); drop `findPackageManager` from the import list if unused. Keep importing `type PackageManager` from `../mcp/install-state.js`.
  - Implement: in `install-state.ts` delete `PackageManager`, `LOCKFILES`, `PACKAGE_MANAGER_FIELD`, `readManifest` and `findPackageManager` (`:144–176`); add `import { findPackageManager, type PackageManager, readPackageManifest } from '@eligian/shared-utils';` and `export type { PackageManager };`; `installCommand` (`:206`) calls `readPackageManifest(folderPath)` where it called `readManifest`. Keep `readText`, `isFile`, `parseJson`, `isRecord` (`:33–58`): `readEligianInstall` and `vscodeMcpJsonState` still use them.
  - Verify: `pnpm -C packages/shared-utils build`; `pnpm -C packages/shared-utils test`; `pnpm -C packages/extension exec vitest run src/extension/__tests__/mcp-install-state.spec.ts`; `pnpm typecheck`; `pnpm check`.

- [ ] **T006 `writeDevErrors` calls `writeFileAtomic` (FR-034, plan §7).**
  - Edit: `packages/cli/src/dev/runtime-reports.ts` only.
  - Test: no new test; `runtime-reports.spec.ts` and `dev-server.spec.ts` (its `vi.mock('node:fs/promises')` burst test, `:25–44`, `:1011–1021`) must stay green unchanged. Run them before the edit to have the baseline.
  - Implement: remove `RENAME_RETRIES`, `renameDelayMs`, `RETRYABLE`, `tempCounter`, `delay` and the comment `:213–220` (now in `atomic-write.ts`); `writeDevErrors(dir, file)` becomes `await writeFileAtomic(path.join(dir, 'dev-errors.json'), \`${JSON.stringify(file, null, 2)}\n\`)` (signature `(dir: string, file: DevErrorsFile): Promise<void>` unchanged; the temp name stays `.dev-errors.<pid>.<n>.tmp`). Keep its docstring pointing to `atomic-write.ts`. Remove the `fs` import if unused.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/runtime-reports.spec.ts src/__tests__/dev-server.spec.ts src/__tests__/atomic-write.spec.ts`; `pnpm check`; `pnpm effect:check:cli`.

- [ ] **T007 Export the storyboard cell helpers (plan §2).**
  - Edit: `packages/cli/src/mcp/storyboard.ts`: add `export` to `function cellsOf` (`:42`) and `function isSeparator` (`:61`), bodies unchanged.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/storyboard.spec.ts src/__tests__/mcp-evals-assert.spec.ts` (the two specs that use `readStoryboard`); `pnpm check`.

- [ ] **T008 The CLI declares `@eligian/shared-utils` (plan P15).**
  - Edit: `packages/cli/package.json` `devDependencies` gains `"@eligian/shared-utils": "workspace:*"` (alphabetical, after `@eligian/language`); `packages/cli/tsconfig.json` and `packages/cli/tsconfig.test.json` `references` gain `{ "path": "../shared-utils" }`. No `dependencies` change (`package-bin.spec.ts:80–96` checks only `dependencies`), no `esbuild.mjs` change (`:38` already maps it).
  - Run `pnpm install` (updates `pnpm-lock.yaml`).
  - Verify: `pnpm typecheck`; `pnpm typecheck:tests`; `pnpm -C packages/cli build`; `pnpm -C packages/cli exec vitest run --project cli-bin src/__tests__/package-bin.spec.ts -t "imports only Node built-ins"`.

**Gate 2**: `pnpm typecheck`, `pnpm run ci`, `pnpm effect:check:cli`, `pnpm -C packages/shared-utils test`, the extension spec of T005, the CLI specs of T003, T006, T007.

---

## Group 3 — Answer values

- [ ] **T009 `values.ts`: wire forms, intra-value rules, `BRIEF.md` value format and parse (FR-005, FR-006, FR-019 values, FR-020 values; plan §2, P7, P10).**
  - Create: `packages/cli/src/mcp/brief/values.ts`, `packages/cli/src/__tests__/brief-values.spec.ts`.
  - Read first: spec FR-005, FR-006 (`spec.md:133–203`), FR-019's value rules (`:315–325`), plan §2 (`plan.md:226–261`) and P7 (`:85–92`).
  - Failing test first (`brief-values.spec.ts`, pure):
    - `describe('wire forms')`:
      - `it.each` › `accepts the canonical form of <id>`: one row per FR-006 id (all 63) with a valid canonical value; `validateValue(q, v)` is `{ ok: true, value }` and, for records and table rows, the returned object's keys are in column order (`Object.keys` equals the column names) even when the input's key order differs (P7).
      - `it.each` › `rejects <variant> for <id> with "<expected>"`: `"yes"` for S7 → message contains `expected a JSON boolean (true or false)`; `"90"`, `"90s"`, `"1m30s"` for P5 → `expected a JSON number of seconds greater than 0, or "viewer-paced"`; `"mouse, touch"` for C3 → `expected an array of strings from: mouse, touch, keyboard, clicker`; a single record for C2 (a table); `"Self-Paced"` for C1; a number cell and a boolean cell in S2; a string with `\r` (`line breaks must be \n`); a cell with `\n` (`a cell is one line`); a path cell with `\` in D3 (`a path uses forward slashes`); a record with an extra key and one with a missing key (`expected exactly the fields: …`). Each asserts `ok: false` and `message` `toContain(expectedForm(q.shape))` for shape failures, or the quoted P7 text.
    - `describe('one wrong value per shape')` › `rejects <value> for <kind>`: one row per shape kind (text, choice, set, yes-no, duration, view, path, record, table), plus `"none"` for a shape that does not accept it (P1).
    - `describe('extra validation (FR-006)')` › `rejects <case>`: C2 with two `primary: yes` (`exactly one primary`), with none, with a duplicate `device`; S2 with a duplicate `name` (`names are unique`), a name with `:`, a name with `|`, a name starting with `-`; S6 `video` with source `-`, `audio` with source `-`, `raf` with a path; V5 `duration: none` with `pacing: fixed`, `duration: 30` with `pacing: none`, `pacing: cues` with `cues-from: -`; D3 `project` with file `-`, `system` with a path, `cdn` with a relative path; L5 `choice: yes` with source `-`; A2 `choice: yes` with kind `-`; `[]` for C2, S2, S4, I2, L1; `[]` for C3; `""` and `"   "` for P1, V1, D2, L3, H2, R2, W1, W3 (`expected non-empty text`). Every row's accepted twin is in the canonical table above, so a `check` that always passes fails this describe.
    - `describe('format and parse')`: › `round-trips every canonical value of the canonical table` (`parseValue(shape, formatValue(shape, v))` deep-equals `v`); › `text lines starting with # and \# round-trip` (`formatValue` writes `\#…` and `\\#…`); › `a cell with | is written \| and read back`; › `P5 90 is written 90s; parse accepts 90s and rejects 090s and 90.0s`; › `yes-no is yes/no, a set is "a, b"`; › `a table with a wrong cell count parses to undefined`; › `none round-trips where the shape accepts it`; › `escapeCell / unescapeCell are inverse`.
  - Implement the exports of plan §2: `Validated`, `validateValue(question, value)` (shape, then `question.check`), `expectedForm(shape)` (the FR-005 texts verbatim), `formatValue`, `parseValue` (table rows through `cellsOf` / `isSeparator` imported from `../storyboard.js`, then `unescapeCell`), `escapeCell`, `unescapeCell`. Imports: `tree.ts` types and `../storyboard.js` only (no `node:fs`, no `effect/ai`).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-values.spec.ts src/__tests__/brief-tree.spec.ts`; `pnpm check`.

**Gate 3**: `pnpm typecheck`, `pnpm run ci`, the two specs.

---

## Group 4 — The engine (sequential; every task edits `engine.ts` and `brief-engine.spec.ts`)

Shared test helpers (created by T010 at the top of `brief-engine.spec.ts`, reused by T011–T014): `fakeFacts({ exists?: string[], outside?: string[], briefDir?: string }): Facts` (`exists` from a `Set` of brief-relative paths, `inside` false for the listed paths and for any path starting with `../`, `briefDir` default `'.'`); `brief(...answers: Answer[]): BriefState`; `a(id, value, round = 1, extra?)` building an `Answer` with `by: 'user'`; `withBasis(brief)` filling each V answer's `basis` from `viewBasis`.

- [ ] **T010 `evaluate`: instances, statuses, applies-when, copies, assets, counts, digest, state (FR-008–FR-012, FR-022, FR-023; plan §3 steps 1–8, P12, P13).**
  - Create: `packages/cli/src/mcp/brief/engine.ts`, `packages/cli/src/__tests__/brief-engine.spec.ts`.
  - Read first: spec FR-008–FR-012, FR-022, FR-023 (`spec.md:217–261`, `:336–342`); plan §3 (`plan.md:263–366`, `:407–417`), P12, P13.
  - Failing test first:
    - `describe('frontier and counts')` › `the empty brief has the 14 first-frontier ids` (P1–P5, C1–C5, R2, R3, R4, W3, as a set) › `counts of the empty brief` (`open: 14`, `answered: 0`, `delegated: 0`; `waiting` = the rest, branch V counted as 6 template instances, FR-010).
    - `describe('applies-when through evaluate')` › one `it` per FR-008 rule, true and false, through `evaluate` on a minimal brief (e.g. `S3 applies with two views and is not-applicable with one`; `S7 applies with a video view and C4 on`; …), asserting the instance's `status`.
    - `describe('single view')` › `S3, S4, I4, X3 are not applicable` (and absent from every frontier).
    - `describe('per-view copies')` › `ids V1:intro … V6:end in S2 order, titles prefixed "<name>: "` › `before S2 branch V is 6 waiting template instances`.
    - `describe('a not-applicable prerequisite counts as settled (R-1)')` › `X2 is on the frontier when C3 has no keyboard`.
    - `describe('asset list (FR-012)')` › `a V3 image row with file - is missing, keyed "<view>: <element>"` › `it makes A1, A2, A3, A5, A6 apply, and L4 with two L1 codes` › `a system D3 row is not an entry` › `a cdn D3 row is remote, keyed by its URL or "font: <font>"` › `a V3 video row media/demo.mp4 and an S6 video source media/demo.mp4 are one entry with kind video` › `a V3 image, an S6 audio and a D3 project font are listed in V3, S6, D3 order` › `an https:// V3 file is remote` › `an existing relative file is exists` (from `fakeFacts({ exists: [...] })`).
    - `describe('states (FR-023)')` › `open while the frontier is non-empty` › `complete when the frontier is empty and there is no confirmation` › `confirmed when the confirmation digest equals digest(…) and the frontier is empty` › `a confirmation with another digest is complete`. Build the complete brief from a literal fully-answered single-view, one-language brief in the spec file.
    - `describe('digest (FR-022)')` › `is the sha256 hex of JSON [[id, value, by]] sorted by id, ignoring round, reviewed and basis` (compare against `createHash('sha256').update(JSON.stringify(...)).digest('hex')` computed in the test).
    - `describe('viewBasis (FR-016)')` › `demo is 4a3055a743c8484e and signup is 23a0aa8fc1af8ff6` with S2/S6 of the golden fixture (`spec.md:707–722`).
    - `describe('nextRound (FR-015)')` › `1 for an empty brief; 1 + max(round, reviewed) otherwise`.
    - `describe('textDirection')` › `ar-EG is rtl` › `nl-NL is ltr` › `an invalid code (xx-!!) gives ltr` › `a throwing Intl.Locale gives ltr` (`vi.spyOn(Intl, 'Locale')`) › `without getTextInfo the textInfo getter is used` (stub returning an object with only `textInfo: { direction: 'rtl' }`).
    - `describe('a defect in a rule')` › `a rule reading an id outside its reads throws` (a one-question test tree whose rule reads an undeclared id: `expect(() => evaluate(tree, …)).toThrow()`).
  - Implement the exports and types of plan §3 (`plan.md:267–337`): `By`, `Answer`, `Confirmation`, `BriefState`, `Facts`, `BriefStateName`, `InstanceStatus`, `Instance`, `Counts`, `Evaluation`, `RejectionReason`, `Rejection`, `AnswerInput`, `RoundItem`, `EMPTY_BRIEF`, `evaluate`, `nextRound`, `viewBasis`, `digest`, `textDirection`; leave `pickRound`, `applyAnswers`, `confirm` to T011–T014. `evaluate` per plan §3 steps 1–8 (topological order of the effective template graph memoized in a `WeakMap`, ties by tree order; V expansion; restricted `AnswerView` with `get`/`copies` per T004; assets recomputed from settled values in FR-012 order; counts over counted instances). Staleness (steps e–g) and FR-018 come in T013/T014: for now an own answer of an applicable instance with settled prerequisites is `answered`. Imports: `node:crypto` (`createHash`), `node:path` (`posix`), `isValidLanguageCode` from `@eligian/language` (P9), `tree.ts`, `values.ts`. No `node:fs`, no `effect`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-engine.spec.ts`; `pnpm check`.

- [ ] **T011 `pickRound` and the first round (FR-017; plan §3 `pickRound`).**
  - Edit: `engine.ts`, `brief-engine.spec.ts`, `brief-tree.spec.ts`.
  - Failing tests first:
    - `brief-tree.spec.ts` › `describe('the first frontier')` › `it('the first frontier is P1–P5, C1–C5, R2, R3, R4, W3')` (`evaluate(TREE, EMPTY_BRIEF, fakeFacts)`, a local fake) › `it('the first round is C1, P5, C4, P4, C3, C5, P3')` (exact order, `pickRound(TREE, ev, 7).map(i => i.id)`) and the dependent counts 39, 37, 24, 13, 11, 9, 6 (export a small `dependentCounts(evaluation)` helper from `engine.ts` or assert through a test-only computation over `Evaluation.instances`; prefer exporting `rankFrontier(evaluation): readonly { id: string; dependents: number }[]`, used by `pickRound`).
    - `brief-engine.spec.ts` › `describe('round selection')` › `max 1 returns C1` › `max 7 returns the seven ids above` › `max 20 returns all 14 frontier ids` › `ties are broken by tree order, then S2 view order` (two views, V1 copies) › `round items carry shape, docs, facts (arrays), and previous/reason only for stale instances`.
  - Implement `pickRound(tree, evaluation, max = 7)` per FR-017: rank each frontier instance by the number of distinct unsettled instances that transitively depend on it, descending; ties by tree order, then S2 view order; take `max`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-engine.spec.ts src/__tests__/brief-tree.spec.ts`; `pnpm check`.

- [ ] **T012 `applyAnswers` and `crossCheck` (FR-007, FR-011–FR-015, FR-014 acceptance; plan §3 `crossCheck`, `applyAnswers`).**
  - Edit: `engine.ts` (if it grows past about 700 lines, put `crossCheck` in a new `brief/references.ts`, plan risk 14), `brief-engine.spec.ts`.
  - Failing tests first:
    - `describe('rejections (FR-007)')` › `an unknown template id (Z9) is unknown-question` › `V2:nosuch is waiting before S2 is settled and unknown-question after` › `P1 twice in one call: the first is recorded, the second is rejected duplicate` › `one invalid and one valid answer in one call: the valid one is recorded` › `a waiting answer is rejected waiting` › `a not-applicable answer is rejected not-applicable`.
    - `describe('wire forms through applyAnswers (SC-020)')` › `<variant> for <id> is rejected invalid-value and nothing is recorded`: `it.each` over `"yes"` S7, `"90"`, `"90s"`, `"1m30s"` P5, `"mouse, touch"` C3, a record for C2, `"Self-Paced"` C1, a number cell, a boolean cell; each asserts `rejected` equals `[{ id, reason: 'invalid-value', message: expect.stringContaining(expectedForm(shape)) }]`, `changed === false`, and `brief.answers` deep-equals the input's. › `one wrong value per FR-006 shape is rejected invalid-value` › `an FR-006 extra-validation failure is invalid-value, a cross-reference failure is invalid-reference` (C2 two primaries vs S3 naming no view).
    - `describe('cross-references')` › one `it` each: S3 not a view; S4 `target` not a view; S5/S6/D5 missing a row and with an extra row; L1 an invalid code (`en_US`), a duplicate code, two defaults; L2 rows not the L1 codes; A1 rows not one per missing entry; A4 not one per video/audio entry; A5 not one per image entry; a V3 file `../x.png` with `inside` false (FR-012); R3 `sub/main.eligian` while `briefDir` is `.` (message contains `directory: "sub"`), R3 `./main.eligian`, `/abs/main.eligian`, `main.txt` (FR-013). All `invalid-reference`.
    - `describe('one call')` › `a question and its prerequisite given in reverse order are both accepted` (S2 before S1, P5, C1) › `a rejected prerequisite leaves its dependent waiting` › `P5, C1, S1, S2 in one call are accepted in dependency order` (US1 scenario 3).
    - `describe('round numbers')` › `the first answer call is round 1 and the next round 2` (apply with `nextRound`) › `a call that changes nothing consumes no round`.
    - `describe('no-op and by-only')` › `the same value and by is a no-op: changed false, round kept` › `only by differs: by updated, round kept, changed true`.
    - `describe('same as (acceptance)')` › `V:b = "same as a" is accepted once S2 is answered` › `an explicit V2:b overrides the copy` › `a chain (a is same as c) is invalid-reference` › `a self-reference is invalid-reference` › `a target not in S2 is invalid-reference`.
  - Implement `applyAnswers(tree, brief, facts, input, round)` per plan §3 steps 1–4 (duplicates; order by full-evaluation instance order, unknown ids at the end; per input re-evaluate, status, `validateValue` → `invalid-value` with `expectedForm`, `crossCheck` → `invalid-reference`, no-op, by-only, change with `basis` for V answers). Review of stale answers is T013. `crossCheck` is one table keyed by template id (plan §3 table).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-engine.spec.ts`; `pnpm check`.

- [ ] **T013 Staleness, review, re-validation, dormant answers, live `same as` (FR-014, FR-015 review, FR-016, FR-039, FR-040; SC-016–SC-019 engine halves; plan §3 steps 4a–4h).**
  - Edit: `engine.ts`, `brief-engine.spec.ts`.
  - Failing tests first:
    - `describe('staleness by round (FR-016)')` › `a prerequisite with a later round makes its dependent stale with previous` › `a prerequisite's reviewed never reopens a dependent` › `S2 and S6 rounds do not reopen V answers`.
    - `describe('per-view basis (in memory)')` › `changing S2's end row makes V copies of end stale and keeps intro answered` › `a V answer without a basis line is stale` › `S6 re-sent unchanged keeps intro settled`. (The re-parse-from-text variant is T017.)
    - `describe('review (SC-016)')`, seven `it`s: › `C1 changed after S1 and S2: S1 is on the frontier with previous, S2 is not stale` › `S1 re-sent unchanged gets reviewed: n, keeps its round, is not in the next round, S2 stays answered` › `S1 re-sent changed takes the round, loses reviewed, S2 is on the frontier with previous` › `the reviewing call consumes a round: the next answer is n + 1` › `a reviewed V answer gets the current basis` › `a reviewed answer is stale again when its prerequisite changes after the review` › `C4 changed reopens S6; S6 re-sent unchanged is reviewed and not in the next round` (SC-005).
    - `describe('re-validation (SC-018)')` › `after S2 drops a view that S3 names, S3 is stale with previous and reason` › `after a missing asset file appears (fakeFacts exists), A1's rows are stale with a reason` › `re-sending the same invalid value is rejected with that reason` › `a corrected value settles it` › `the stale answer is kept in brief.answers unchanged`.
    - `describe('dormant (SC-019 engine half)')` › `after S2 drops to one view S3's answer is dormant: counted notApplicable, not answered, not delegated, not in the digest` › `an answer for S3 is rejected not-applicable` › `C3 loses and regains keyboard: I2 is on the frontier with its old value as previous` › `a restored value with no round change is answered again`.
    - `describe('same as is live (SC-017)')`, four `it`s: › `V:b accepted while a has no V answers: V1:b…V6:b waiting, a's on the frontier` › `once a's Vn is answered Vn:b is settled and counts as answered; a V3 copied from a puts its entries in the asset list under b` › `a's Vn changed: Vn:b follows and neither V:b nor Vn:b is stale or on the frontier` › `a hand-made chain (a is same as c in the brief) makes V:b stale with a reason`.
  - Implement plan §3 steps 4a–4h (waiting, applies-when, effective value incl. `same as` copies settled only where the source is settled, FR-039 re-validation of own answers in topological order, staleness by round excluding S2/S6 for V instances, basis check) and the review branch of `applyAnswers` (FR-015: a stale answer with an equal value gets `reviewed: round`, keeps `round`, gets the current basis for V, updates `by`; a stale answer whose value no longer validates is rejected with the validation reason).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-engine.spec.ts src/__tests__/brief-tree.spec.ts`; `pnpm check`.

- [ ] **T014 Tree versions and `confirm` (FR-018, FR-022, FR-029 engine half; plan P11).**
  - Create: `packages/cli/src/__tests__/__fixtures__/mcp/brief/tree-v2.ts` (exports `TREE_V2`: `TREE` plus one new question `P6` with `since: 2`, `needs: []`, always applies). Edit: `engine.ts`, `brief-engine.spec.ts`.
  - Failing tests first:
    - `describe('tree versions (FR-018)')` › `a brief confirmed under version 1 stays confirmed under TREE_V2 and P6 is not applicable` › `an unconfirmed version-1 brief is evaluated against TREE_V2: P6 is on the frontier` › `a confirmed brief whose digest no longer matches is evaluated against the full tree (pass 2)`.
    - `describe('confirm')` › `confirm(brief, message, now, evaluation) sets mode agent-reported, at = now.toISOString(), digest = evaluation.digest, message verbatim` › `the state becomes confirmed` › `a later answer change drops the state to complete or open`.
  - Implement FR-018 as plan P11's two passes inside `evaluate`, and `confirm(brief, message, now, evaluation): BriefState`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-engine.spec.ts`; `pnpm check`.

**Gate 4**: `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm run ci`, `brief-tree`, `brief-values`, `brief-engine` specs.

---

## Group 5 — The file, the personas

- [ ] **T015 [P] Persona fixtures and the persona driver (SC-002 data; plan "Persona fixtures").**
  - Create: `packages/cli/src/__tests__/__fixtures__/mcp/brief/personas/terse.json`, `detailed.json`, `vague.json`, and the test helper `packages/cli/src/__tests__/brief-persona-driver.ts` (not a spec; shared by T017's round trip and T022's interview so the driver is written once).
  - Fixture form (plan `:672–680`): `{ idea: string, answers: { [id]: { value, delegated? } | { values: { value, delegated? }[] } }, script: { afterRound: number, answers: { id, value, delegated? }[] }[] }`. Values in the canonical wire form (FR-005). R3 is `main.eligian` (the brief at the project root). No asset file exists in the temp project.
    - `terse`: one view, L1 `en-US` only; plain answers recorded `by: user`; D2, V2:<view> and W1 `delegated: true`.
    - `detailed`: S2 `intro`, `demo`, `signup` (no `same as`); L1 `en-US` (default), `nl-NL`; C3 `["mouse", "keyboard"]`; C4 `on`; an S5 `advance` row; S6 `demo` = `video`, source `media/demo.mp4`; intro's V3 has an `image` row with file `-`; D1 names a brand guide; H1 and L4 `none`. With this sheet exactly 71 instances apply (P 5, C 5, S 8, V 18, I 4, D 8, L 4, A 6, H 1, X 5, R 4, W 3).
    - `vague`: two views; S3 `{ values: [{ value: "nowhere" }, { value: "<first view>" }] }`; a `script` entry after a later round (e.g. `afterRound: 4`) that changes one view's S2 `purpose` and C4 from `on` to `off`; S6's value is fixed, so a reopened S6 is re-sent unchanged (FR-015 review path).
  - Driver API (`brief-persona-driver.ts`): `interface Persona` (the fixture type); `loadPersona(name): Persona`; `interface Step { state; round: readonly { id; previous?; reason?; ask; shape; docs; facts }[]; rejected: readonly { id; reason }[]; counts }`; `runPersona(persona, step: (answers: AnswerInput[]) => Promise<Step>, start: () => Promise<Step>, options?: { cap?: number }): Promise<{ rounds: Step['round'][]; sent: Map<string, unknown>; final: Step }>`. Rules of plan `:682–687`: one value or a sequence with a per-id cursor (repeat the last when exhausted); an asked id with no entry throws naming it; after round `n` the `afterRound: n` entries are merged into that call, replacing an asked id's value instead of duplicating it, and not advancing its cursor; `sent` tracks the last value actually sent per id; cap 20 rounds, at the cap it throws naming the last round's ids; it stops at `state === 'complete'` with an empty round.
  - Verify: `node -e "for (const n of ['terse','detailed','vague']) JSON.parse(require('fs').readFileSync('packages/cli/src/__tests__/__fixtures__/mcp/brief/personas/'+n+'.json','utf8'))"`; `pnpm typecheck:tests`; `pnpm check`. (Behaviour is verified by T017 and T022.)

- [ ] **T016 [P] `brief-file.ts`: parse and write `BRIEF.md` (FR-010 unknown view, FR-019–FR-021; plan §4, P1, P17, P19).**
  - Create: `packages/cli/src/mcp/brief/brief-file.ts`, `packages/cli/src/__tests__/brief-file.spec.ts`, fixtures `packages/cli/src/__tests__/__fixtures__/mcp/brief/example.md` (the fenced block of `spec.md:649–798` copied byte for byte, LF, single trailing LF), `all-shapes.json` (plan "Data and generation": one value per FR-006 shape, `#` and `\#` text, `|` and `\|` cells, a 10,000-char V2, a multi-line idea, a `reviewed` line, a dormant answer, as a `BriefState` JSON plus its facts snapshot), `four-views.md` (P, C, S1, S2 with 4 views, S6 all `raf`, written by `writeBrief` once and pasted; V1–V5 of each view unanswered).
  - Failing test first (`brief-file.spec.ts`):
    - `describe('golden')` › `write(parse(example)) is byte-identical` (`writeBrief(TREE, parseBrief(example), facts)` with `facts` = `{ state: 'open', serverEligian: '1.1.0', eligianInstalled: '1.1.0', packageManager: 'pnpm', textDirection: undefined, assets: [{ key: 'media/demo.mp4', kind: 'video', state: 'missing' }] }`, `Buffer` equality) › `parse(example) returns idea (two lines), P1, P5 = 90, C1, C4, S1, S2 (3 rows), S6 (3 rows), V3:demo (2 rows, basis 4a3055a743c8484e), V:signup (same as intro, basis 23a0aa8fc1af8ff6), no ignored`.
    - `describe('round trip (FR-021)')` › `all-shapes: parse(write(b)) returns the same idea, tree, confirmation and answers; write(parse(write(b))) is byte-identical` › `all-shapes output matches the file snapshot` (`toMatchFileSnapshot('__snapshots__/brief-all-shapes.md.snap')`) › `a CRLF copy of example parses the same` › `the reviewed line round-trips and the digest ignores it` (SC-016).
    - `describe('kept content')` › `a ## Notes section and an ignored answer block survive a parse and a write byte for byte and are reported in ignored` (the ignored block last in its section, P17) › `a hand-edited ## Facts is dropped and rewritten from the given facts` › `a ## View: gone section when S2 lists only intro is in ignored with unknown-view and is written back verbatim after ## Facts` › `a malformed header line (- colour: red) is in ignored with malformed header line` › `an answer with an unknown id (### Z9: …) is ignored and kept`.
    - `describe('explicit FR-019 lines')` › `a confirmed brief has /^- confirmation: agent-reported \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z sha256:[0-9a-f]{64}$/m and a - confirmation-message: line whose value JSON.parses to the message` (message contains `"` and a newline) › `an unconfirmed brief has - confirmation: none and no confirmation-message line` › `L1 en-US, ar-EG gives - text-direction: en-US ltr, ar-EG rtl` › `L1 unanswered gives - text-direction: -` › `an empty asset list gives - assets: none and no asset table` › `a non-empty asset list gives the header | asset | kind | state |` › `the comment line and - approval: none are verbatim` › `eligianInstalled undefined writes - eligian-installed: -`.
    - `describe('robustness')` › `500 seeded mutations never throw (seed 0x5eed)`: a mulberry32 PRNG mutates `example.md` (delete, duplicate and truncate lines, insert random bytes); `parseBrief` is called unwrapped (no catch-all, P19).
  - Implement the exports of plan §4 (`RawBlock`, `Ignored`, `ParsedBrief`, `FactsSnapshot` with `state` (P1), `BRIEF_FILE = 'BRIEF.md'`, `EMPTY_PARSED`, `parseBrief(text, tree?)`, `writeBrief(tree, parsed, facts)`), following plan §4 steps (`plan.md:449–474`) and FR-019's layout exactly. `PackageManager` is a type import from `@eligian/shared-utils`. Total helpers (own `try`, return `undefined`) for `JSON.parse` and integer parsing; no catch-all around the parser. No I/O, no `effect`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-file.spec.ts`; `pnpm check`.

**Gate 5**: `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm run ci`, `brief-file.spec.ts`.

---

## Group 6 — Cross-checks of the pure modules (sequential edits)

- [ ] **T017 Persona round trips, the basis re-parse test, the purity test (FR-021, FR-016, SC-005, SC-006, SC-012, FR-035).**
  - Edit: `brief-file.spec.ts`, `brief-engine.spec.ts`, `brief-tree.spec.ts`.
  - Tests (write, run; fix the module they expose, never the test):
    - `brief-file.spec.ts` › `describe('round trip (FR-021)')` › `it.each(['terse', 'detailed', 'vague'])('the %s persona brief round-trips')`: build the brief in-process with `runPersona` (T015) and an engine step (`round = nextRound(b)`; `applyAnswers(TREE, b, fakeFacts, input, round)`; `evaluate`; `pickRound(…, 7)`); then `parse(write(b))` returns the same answers (bases included) and `write(parse(write(b)))` is byte-identical.
    - `brief-engine.spec.ts` › `describe('per-view basis, re-parsed from text (SC-005)')` › `with intro and end fully answered, written and parsed again, changing S2's end row makes end's V copies stale and keeps intro's; S6 re-sent unchanged keeps intro settled` (each step goes through `writeBrief` → `parseBrief`; no in-memory carry-over).
    - `brief-tree.spec.ts` › `describe('purity (SC-012, FR-035)')` › `brief/* import neither effect/ai nor node:fs` (read every `packages/cli/src/mcp/brief/*.ts`, assert no match of `/from ['"](effect\/ai|node:fs|fs)(\/promises)?['"]/`) › `no console in brief/*` (`/\bconsole\./`).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-file.spec.ts src/__tests__/brief-engine.spec.ts src/__tests__/brief-tree.spec.ts`; `pnpm check`.

**Gate 6**: `pnpm typecheck:tests`, `pnpm run ci`, the three specs.

---

## Group 7 — The tool and its registration (sequential)

- [ ] **T018 `eligian_brief`: module, registration, behaviour (FR-024–FR-031, FR-042, P1, P2, P5, P8, P16, P19; plan §5, §6).**
  - Create: `packages/cli/src/mcp/tools/brief.ts`, `packages/cli/src/__tests__/brief-tool.spec.ts`. Edit: `packages/cli/src/mcp/server.ts`, `brief-tree.spec.ts` (purity: add `tools/brief.ts` to the no-`console` check).
  - Failing test first (`brief-tool.spec.ts`; per test a temp project `fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-brief-')))` and `startInMemoryServer({ cwd })`, closed in `afterEach`; payloads from `server.callTool('eligian_brief', args)`):
    - `describe('paths (SC-011)')` › `directory with forward slashes resolves to <dir>/BRIEF.md` › `it.runIf(process.platform === 'win32')('backslashes and the other drive-letter case resolve to the same BRIEF.md')` › `../outside fails with kind not-found and creates nothing outside the root` › `a missing nested directory is created on the first write`.
    - `describe('status')` › `creates BRIEF.md with the idea, state open, round C1, P5, C4, P4, C3, C5, P3` › `no file and no idea creates nothing and next asks for the idea` (exact `next` text of plan `:571`) › `a second, different idea leaves the stored idea unchanged`.
    - `describe('idea (P8)')` › `an answer call without an idea creates BRIEF.md with no blockquote; a later status with an idea stores it; a third idea is ignored` › `an idea with CRLF is stored with LF`.
    - `describe('answer')` › `accepted answers are in BRIEF.md with by and round 1` › `all rejected and all no-op calls leave bytes and mtimeMs unchanged` (FR-028) › `an R3 whose directory is not the brief's is rejected invalid-reference` (SC-011).
    - `describe('review (SC-016 tool half)')` › `answer C1, S1, S2; change C1; re-send S1 unchanged: BRIEF.md has - reviewed: <n> under ### S1:, S1 keeps its round, S1 is not in the reply round, S2 still answered, the next answer is round n + 1`.
    - `describe('dormant (SC-019 tool half)')` › `S2 drops to one view: S3's block stays byte for byte, counts.notApplicable includes it, answered does not, S3 not in delegated` › `a confirmed brief becomes complete after S2 drops to one view` › `answer S3 is rejected not-applicable and the bytes are unchanged`.
    - `describe('max')` › `0 and 21 give JSON-RPC -32602 matching /between 1 and 20/ and no BRIEF.md` (use `server.request('tools/call', { name: 'eligian_brief', arguments: { action: 'status', max: 0 } })` and assert `response.error?.code === -32602`, as `mcp-docs.spec.ts:280`).
    - `describe('io')` › `BRIEF.md as a directory gives kind io`.
    - `describe('parse defect (P19)')` › `a parseBrief that throws gives kind internal, BRIEF.md bytes unchanged, console.error got the defect`: `vi.mock('../mcp/brief/brief-file.js', async importOriginal => …)` pass-through whose `parseBrief` throws `PARSE-DEFECT-SENTINEL` only when the text contains that sentinel; `vi.spyOn(console, 'error')` as `mcp-stdout.spec.ts:344–380`. (Put this describe in its own spec file `brief-tool-defect.spec.ts` if the module mock would leak into the other describes.)
    - `describe('confirm')` › `refused frontier-not-empty while open, with the round` › `a blank confirmation is refused confirmation-missing` › `a successful confirm writes - confirmation: agent-reported <ISO> sha256:<hex> whose digest equals digest() of the parsed answers, and - confirmation-message: <JSON of the reply>` › `re-confirming leaves the bytes unchanged`.
    - `describe('reply (FR-030)')` › `header matches /^eligian \S+ · eligius \S+ · eligian_brief · <absolute BRIEF.md path>$/` › `next has the plan texts for open, complete and confirmed` (`plan.md:566–571` verbatim) › `delegated is absent while open and present when complete or confirmed` › `a hand-edited ### Z9: block is in ignored with its line and reason and survives the next write`.
    - `describe('telemetry (FR-031)')` › `the sentinel is absent from summarizeArgs and summarizeResult JSON` (idea, an answer value and a confirmation each contain `TELEMETRY-SENTINEL`).
    - `describe('stale state (SC-013 in-process)')` › `a hand-edited P4 on a confirmed brief gives complete on the next status` › `creating a missing V3 asset makes A1 not applicable on the next call, with no restart`.
    - `describe('facts probes (SC-022)')` › `node_modules/eligian/package.json 1.1.0 and pnpm-lock.yaml give - eligian-installed: 1.1.0 and - package-manager: pnpm next to - server-eligian:` › `neither gives - eligian-installed: - and - package-manager: npm` (guard: skip the `npm` assertion when a lockfile or `packageManager` exists above `os.tmpdir()`, as `markerAboveTmpdir`) › `an invalid package.json gives - and the call succeeds`.
  - Implement `tools/brief.ts` per plan §5 (`plan.md:478–579`): `NAME`, `DESCRIPTION` (the plan's text, ≤ 1,000 chars, containing `BRIEF.md` and `never edit`), `Parameters` / `Success` schemas (P2: `max` is `Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })))`), `makeTool(ai)` (`Meta` alwaysLoad, `Destructive false`, `Idempotent true`, not `Readonly`, `failure: ToolFailure`), `makeFacts(root, briefDir)` (P16: per-call memoized `statSync(…, { throwIfNoEntry: false })?.isFile() === true` and `isInside`, any error → `false`), `probeFacts(root)` (FR-042: `readPackageManifest(<root>/node_modules/eligian)` → string `version` else `undefined`; `findPackageManager(root)`; catches everything), `summarizeArgs`, `summarizeResult`, `handle(params, context)` steps 1–8 (plan `:531–571`). In T018 the write is `fs.mkdir` + `writeFileAtomic(file, out)` without the seam and the handle runs without locks; T019 adds both. Edit `server.ts` per plan §6: `import * as brief from './tools/brief.js'`; `ServerOptions.brief?: brief.BriefToolOptions` next to `smoke?`; `brief.makeTool(ai)` as the FIRST argument of `ai.Toolkit.make` (`:109`); the handler entry `eligian_brief` wrapped by `boundary` directly (not `call`, P5); docstring line 5 → "The nine tools (spec 059 Phase 1 adds `eligian_brief`)".
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-tool.spec.ts src/__tests__/brief-tree.spec.ts`; `pnpm check`; `pnpm effect:check:cli`. (The pinned eight-tool specs fail until T020; that is expected inside this group.)

- [ ] **T019 Per-brief lock, uninterruptible section, changed-file check (FR-032–FR-034, P6, P18; SC-010, SC-015 FR-033).**
  - Edit: `tools/brief.ts`, `server.ts` (create `briefLocks` once in `makeServerLayer` and pass `options.brief`), `brief-tool.spec.ts`.
  - Failing tests first (`describe('concurrency')` in `brief-tool.spec.ts`):
    - `20 parallel answers on four-views.md get 20 distinct consecutive rounds`: copy `__fixtures__/mcp/brief/four-views.md` to the temp project as `BRIEF.md`; `Promise.all` of 20 `answer` calls, each one of the V1–V5 answers of the 4 views with a distinct value; the parsed file has all 20, rounds `k+1 … k+20`.
    - `status completes while a latched lock holds a check`: `startInMemoryServer({ cwd, lock: compilerLockLayer({ latch }) })` (`compiler-lock.ts:129`, as `mcp-soak-check.spec.ts:26`); start an `eligian_check` that blocks in the latch; a brief `status` resolves; then release.
    - `a hand edit in beforeRename gives io "BRIEF.md changed while writing; call again", keeps the edit byte for byte, leaves no *.tmp`.
    - `a beforeRename that rejects gives kind io, BRIEF.md untouched, no *.tmp`.
    - `A held in the seam on directory a while B on directory b completes; then A completes` (FR-033).
    - `a cancelled call finishes its write before the next call on that brief starts` (P18): A = `server.request('tools/call', …, 11)` held in `beforeRename`; `server.notify('notifications/cancelled', { requestId: 11 })`; B (id 12) on the same directory does not reach its seam; release A; B completes; `server.frames()` has no response with id 11; the parsed file holds A's and B's answers, B's round = A's + 1; no `*.tmp`. Negative control (run once while red, not kept): without `Effect.uninterruptible` A's answer is lost or its round repeats; record the observation in the task report for `compliance.md`.
  - Implement: `BriefToolOptions { beforeRename?: (target: string) => Promise<void> }`; `BriefLocks { forFile(file): Semaphore.Semaphore }` and `makeBriefLocks()` (lazy `Map`, key lower-cased on win32, `Semaphore.makeUnsafe(1)`; if the Effect LSP flags `makeUnsafe` outside an effect, return `Effect.sync(() => …)` instead, plan risk 8); `handle` runs steps 3–8 in `context.briefLocks.forFile(file).withPermits(1)(Effect.uninterruptible(section))`; the write passes `beforeRename: async () => { await options.beforeRename?.(file); const now = await readOrUndefined(file); return now === text; }` and maps `'aborted'` to `ToolIoError({ message: 'BRIEF.md changed while writing; call again', path: file })`, other rejections through `toToolError('write', file)`.
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/brief-tool.spec.ts`; `pnpm check`; `pnpm effect:check:cli`.

- [ ] **T020 Nine tools wherever eight were pinned (FR-037, SC-007).**
  - Edit: `packages/cli/src/__tests__/mcp-server.spec.ts`, `__snapshots__/tools-list-phase3.json.snap` (regenerated), `packages/cli/src/__tests__/mcp-resources.spec.ts`, `.github/workflows/ci.yml`.
  - `mcp-server.spec.ts`: import `* as brief from '../mcp/tools/brief.js'`; `TOOL_NAMES` (`:40–49`) gains `brief.NAME` first; `UPFRONT` (`:50`) becomes `[brief.NAME, docs.NAME, operations.NAME, check.NAME]`; docstring "the eight tools" (`:4`) → "the nine tools"; `it('lists exactly eight tools')` (`:118`) → `'lists exactly nine tools'` with `'eligian_brief'` first in the sorted literal; the annotations test (`:153`) renamed `'four upfront, three readonly with maxResultSizeChars'` with a branch before the `UPFRONT` branch: for `brief.NAME`, `readOnlyHint` is not `true`, `destructiveHint === false`, `idempotentHint === true`; `'upfront descriptions ≤ 1000'` `toHaveLength(3)` (`:192`) → `toHaveLength(4)`; new `it('the eligian_brief description says only the tool writes BRIEF.md')`: description contains `BRIEF.md` and `never edit`.
  - Snapshot: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-server.spec.ts -t "tools/list matches the Phase 3 snapshot" -u`, then `git diff --numstat -- packages/cli/src/__tests__/__snapshots__/tools-list-phase3.json.snap` prints `<n>	0` (insertions only) and the first entry of the snapshot is `eligian_brief`; `git diff --quiet -- packages/cli/src/__tests__/__snapshots__/instructions-phase3.txt.snap` exits 0.
  - `mcp-resources.spec.ts:105`: `toHaveLength(8)` → `toHaveLength(9)`.
  - `ci.yml`: both `want` strings (`:57`, `:111`) → `'eligian_brief eligian_check eligian_compile eligian_docs eligian_fmt eligian_init eligian_operations eligian_project eligian_smoke'`; the comment at `:53` → "the nine tools". `mcp-instructions.spec.ts` and `mcp-search.spec.ts` stay unchanged (spec "Differences" items 2, 3).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-server.spec.ts src/__tests__/mcp-resources.spec.ts src/__tests__/mcp-instructions.spec.ts src/__tests__/mcp-search.spec.ts`; `pnpm check`.

- [ ] **T021 The `brief-questions` docs chunk (FR-036, SC-004 docs ids, SC-008; plan §9).**
  - Edit: `packages/cli/scripts/generate-knowledge.ts`, `packages/cli/src/__tests__/mcp-knowledge.spec.ts`, `packages/cli/src/__tests__/brief-tree.spec.ts`.
  - Failing tests first:
    - `mcp-knowledge.spec.ts`: `REFERENCE_CHUNKS` (`:524–535`) gains `'brief-questions'` (alphabetical); new `it('brief-questions lists every template question')`: the index entry has kind `reference`, `see` `['decisions', 'storyboard']`, file `generated/brief-questions.md`; the body has exactly 63 lines matching `/^- [A-Z]\d?: /` (one per `TREE` id); the card is ≤ 120 words; the body is ≤ 3,000 words.
    - `brief-tree.spec.ts` › `describe('docs')` › `it('every docs id is in the generated index.json')` (`beforeAll`: `generateKnowledge({ outDir: tmp })`, 300 s timeout as `mcp-server.spec.ts:94–101`).
  - Implement `briefQuestionsChunk()` per plan §9 (`plan.md:621–635`), modelled on `domEventsChunk` (`:781`): imports `{ BRANCHES, TREE }` from `../src/mcp/brief/tree.js`; `line(q)` = `- ${id}: ${title} · needs ${needs or 'none'} · applies ${when} · docs ${docs or 'none'}`, W1's needs printed `all other questions`; add it to the chunk list (`:1173–1190`). The `chunkFile` check (`:1197–1199`) must pass.
  - Verify: `pnpm -C packages/cli build` (runs `generate:knowledge`); `pnpm -C packages/cli exec vitest run src/__tests__/mcp-knowledge.spec.ts src/__tests__/agents.spec.ts src/__tests__/brief-tree.spec.ts` (`agents.spec.ts` "≤ 8192 bytes" stays green); `pnpm check`.

**Gate 7**: `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm run ci`, `pnpm effect:check:cli`, `pnpm -C packages/cli build`, all `brief-*` specs, `mcp-server`, `mcp-resources`, `mcp-knowledge`, `agents`, `runtime-reports`, `dev-server` specs.

---

## Group 8 — End to end (new specs)

- [ ] **T022 [P] The persona interviews and "nothing is gated" (SC-002, SC-003, SC-021).**
  - Create: `packages/cli/src/__tests__/mcp-brief-interview.spec.ts`.
  - Tests (one fresh temp project and `startInMemoryServer({ cwd })` per persona; `runPersona` (T015) with a server step that calls `eligian_brief` `answer` and a start step that calls `status` with the persona's idea):
    - `describe('interview')` › `it.each(['terse', 'detailed', 'vague'])('%s reaches complete then confirmed')`, asserting per persona: (1) the final state is `complete` with an empty round, then `confirmed` after `confirm` with a verbatim message; (2) every round has ≤ 7 items, each with a non-empty `ask`, a `shape`, and `docs` and `facts` arrays; (3) each recorded answer of `parseBrief(BRIEF.md)` equals the driver's last sent value for that id and its `by` is `delegated` exactly when the persona marked it; for `terse` both `user` and `delegated` occur and the reply's `delegated` list at completion holds exactly the delegated ids; (4) no id is asked twice, except a reopened one whose `previous` equals the value recorded before the change, or one rejected in the previous call (no `previous`); (5) no rejected answers except vague's first S3, rejected `invalid-reference`; log the round count with `console.info` in the test (not in source).
    - › `detailed applies 71 instances in the FR split and needs at most 12 rounds`: from `evaluate(TREE, parseBrief(file).brief, makeFacts(root, root))` (exported by `tools/brief.ts`) assert 71 applicable instances and the per-branch split P 5, C 5, S 8, V 18, I 4, D 8, L 4, A 6, H 1, X 5, R 4, W 3; then `rounds ≤ Math.ceil((71 - 1) / 7) + 2` from that literal.
    - › `the first round item with id S2 has an ask containing "timeline name"` (SC-021, asserted on whichever round first carries S2).
    - `describe('not gated (SC-003)')` › `check, compile, fmt, project and smoke return the same with an open BRIEF.md`: copy `__fixtures__/mcp/fmt/formatted.eligian` into a temp project; call each tool without and then with an open `BRIEF.md` beside it (`smoke` with `smoke: { cliPath: STUB }`, the stub of `mcp-server.spec.ts:38`); payloads equal after removing timing fields the existing specs already ignore (follow `mcp-server.spec.ts`'s payload helpers).
  - Verify: `pnpm -C packages/cli exec vitest run src/__tests__/mcp-brief-interview.spec.ts`; `pnpm check`. A failure here is fixed in the engine/tool or the persona sheet, never by loosening an assertion.

- [ ] **T023 [P] Rounds survive a real restart (SC-013 restart half).**
  - Create: `packages/cli/src/__tests__/mcp-brief-restart.spec.ts` (runs in the `cli` project).
  - Test: `const built = fs.existsSync(<cli>/dist/cli.mjs)`; `test.skipIf(!built)('rounds survive a server restart')`: one temp project; process A = `spawnServer({ cwd })`, `initialize`, two `answer` calls, `close()`; process B = `spawnServer({ cwd })`, one `answer`, then `status`. Assert the parsed `BRIEF.md` has rounds 1, 2, 3, and B's `status` state, round ids and counts equal `evaluate` / `pickRound` over `parseBrief(file)` with `makeFacts(root, dir)`.
  - Verify: `pnpm -C packages/cli build`; `pnpm -C packages/cli exec vitest run src/__tests__/mcp-brief-restart.spec.ts` (must run, not skip); `pnpm check`.

**Gate 8**: `pnpm typecheck:tests`, `pnpm run ci`, both specs.

---

## Group 9 — Stdout purity (sequential edit)

- [ ] **T024 `eligian_brief` over a spawned server leaves stdout pure (SC-009, FR-035).**
  - Edit: `packages/cli/src/__tests__/mcp-stdout.spec.ts`.
  - Test: `test.skipIf(!built)('eligian_brief over the spawned server leaves stdout pure')` (`built` as `:28`): `spawnServer({ cwd: tempProject })`, `initialize`, `eligian_brief` `status` with an idea, one `answer`; the recorded stdout passes the spec's existing `expectOnlyFrames(stdout)` (`mcp-stdout.spec.ts:57`): every line is a JSON-RPC frame and nothing else is on stdout.
  - Verify: `pnpm -C packages/cli build`; `pnpm -C packages/cli exec vitest run src/__tests__/mcp-stdout.spec.ts`; `pnpm check`.

**Gate 9**: `pnpm run ci`, `mcp-stdout.spec.ts`.

---

## Group 10 — Documentation statements that would become false (sequential)

- [ ] **T025 AGENTS.md lines (FR-037, P14).**
  - Edit: root `AGENTS.md` line 49 ("Eight tools: `eligian_docs`, …" → "Nine tools: `eligian_brief`, `eligian_docs`, …"; add one clause: "`eligian_brief` runs the brief interview and is the only writer of `BRIEF.md` (spec 059)"); root `AGENTS.md` line 97 (`tools/ (docs, operations, check, fmt, init, compile, project, smoke)` → `tools/ (brief, docs, operations, check, fmt, init, compile, project, smoke), brief/ (the brief interview: tree, values, engine, BRIEF.md file)`); `packages/cli/AGENTS.md` line 34 (`tools/` (the eight tools) → (the nine tools), and add "`brief/` (the brief interview: tree, values, engine, `BRIEF.md` file)", and `atomic-write.ts` (the temp-and-rename write shared by `dev/` and `mcp/`)). No README or CHANGELOG change: both are Phase 3 (spec "Non-goals", roadmap §8 Phase 3 touches).
  - Verify: `grep -n "Nine tools" AGENTS.md`; `sed -n 97p AGENTS.md | grep -c brief` prints `1`; `grep -n "nine tools" packages/cli/AGENTS.md`; `git diff --quiet -- packages/cli/README.md CHANGELOG.md`.

---

## Group 11 — Integration gates (sequential; the last group)

- [ ] **T026 Build and type-check.** `pnpm build`; `pnpm typecheck`; `pnpm typecheck:tests`. All exit 0.
- [ ] **T027 Lint.** `pnpm check` (0 errors, 0 warnings), then `pnpm run ci` (no writes, `--error-on-warnings`).
- [ ] **T028 Effect diagnostics.** `pnpm effect:check` (= `effect:check:language` and `effect:check:cli`, both `--strict`): 0 errors, 0 warnings. Language is run for completeness; no language source changed.
- [ ] **T029 Tests.** `pnpm test` (all packages, the shared-utils and extension specs included). Then `pnpm -C packages/cli exec vitest run --project cli-bin src/__tests__/package-bin.spec.ts` ("imports only Node built-ins and the dependencies", "mcp answers initialize in under 3 s" at `:149`).
- [ ] **T030 Coverage.** `pnpm test:coverage:ci`: no threshold regresses (CLI `packages/cli/vitest.config.ts:60–63` lines 77.1 / functions 77.6 / branches 64.5 / statements 76.6; language 79.8 / 80 / 69.9 untouched because no language code changed). A shortfall is fixed by adding tests for the new code, never by lowering a threshold.
- [ ] **T031 Examples gates.** `pnpm run check:examples` (SC-014). `smoke:examples` and `fmt:examples` are not required (no language, compiler or example change; plan "Gates"); run them only if any file under `packages/language/` or `examples/` shows in `git status`.
- [ ] **T032 SC-001 and compliance commands.**
  - After `pnpm build`, run `ci.yml:55–57`'s `tools/list` command verbatim in Bash (with the new `want`): stdout `tools/list: eligian_brief eligian_check eligian_compile eligian_docs eligian_fmt eligian_init eligian_operations eligian_project eligian_smoke`, exit 0; and its `resources/list` line still passes.
  - Run `ci.yml:105–111` (the packed-tarball step) in Bash with `PKG_DIR=$(mktemp -d)`: `pnpm -C packages/cli pack`, the temp-dir `npm install` of the tarball (CI's own simulated user install), the `tools/list` check on the installed `bin/cli.js` (same line, exit 0) and `ELIGIAN_BIN=… vitest run src/__tests__/package-bin.spec.ts -t "mcp answers initialize"`. Remove the `.tgz` afterwards; `pnpm -C packages/cli build` again (pack ran `build:prod`).
  - `git ls-files .claude/workflows/presentation-assistant-phase.js` prints the path (FR-001).
  - `git diff --numstat -- packages/cli/src/__tests__/__snapshots__/tools-list-phase3.json.snap` prints `<n>	0` (SC-007).
  - `git diff --quiet -- packages/cli/src/__tests__/__snapshots__/instructions-phase3.txt.snap` exits 0 (SC-007).
  - Record each output verbatim for `compliance.md`, with the plan-level readings P1–P19, T004's `AnswerView.copies` reading, T015's shared driver helper and the measured persona round counts against roadmap §3.14's 8–10.

---

## Dependencies and execution order

| Group | Depends on | Parallel inside |
| --- | --- | --- |
| 1 Foundations | — | T001, T002, T003, T004 [P] |
| 2 Wiring | 1 (T005 needs T002; T006 needs T003) | none |
| 3 Values | 1 (T004), 2 (T007) | single task |
| 4 Engine | 3 | none (one file pair) |
| 5 File, personas | 4 | T015, T016 [P] |
| 6 Cross-checks | 5 | none |
| 7 Tool | 2 (T005, T008 for shared-utils in the CLI), 6 | none |
| 8 End to end | 7 | T022, T023 [P] |
| 9 Stdout | 7 | single task |
| 10 Docs | 7 | single task |
| 11 Gates | all | none |

FR/SC coverage: FR-001 T001/T032; FR-002–FR-004, FR-038 T004/T011/T021; FR-005–FR-007 T009/T012; FR-008–FR-018 T010–T014; FR-019–FR-021 T016/T017; FR-022, FR-023 T010/T014; FR-024–FR-031 T018/T020; FR-032–FR-034 T003/T006/T019; FR-035 T017/T018/T024; FR-036 T021; FR-037 T020/T025; FR-039, FR-040 T013/T018; FR-041 T002/T005; FR-042 T018. SC-001 T032; SC-002, SC-003, SC-021 T022; SC-004 T004/T011/T021; SC-005 T010–T014/T017; SC-006 T016/T017; SC-007 T020/T032; SC-008 T021; SC-009 T024; SC-010 T019; SC-011, SC-015 T018/T019; SC-012 T017/T029; SC-013 T018/T023; SC-014 T026–T031; SC-016–SC-020 T012/T013/T016/T018; SC-022 T002/T005/T018.

## Defects found

<!-- Triage notes added by the gates during the build stage. Empty at the start. -->
