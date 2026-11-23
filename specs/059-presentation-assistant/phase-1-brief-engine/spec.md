# Feature Specification: presentation assistant, Phase 1: brief engine

**Feature**: spec 059 (presentation assistant, the brief interview), Phase 1 of `specs/059-presentation-assistant/roadmap.md` §8
**Branch**: `spec/059-presentation-assistant`
**Created**: 2026-11-19
**Status**: Draft (specify stage, revised after review; clarifications of 2026-11-19 encoded)
**Input**: roadmap §8 "Phase 1: brief engine (6 days)", the design in §3 (the question tree), §4.1 (`eligian_brief`) and §4.6 (`BRIEF.md`), the decisions in §9, and the measured facts in `spikes.md`. Every claim about existing code below was checked on 2026-11-19 with typegraph (`ts_module_exports`, `ts_navigate_to`) or with Grep/Read, and is cited as `file:line`.

## Overview

Phase 1 builds the data and the engine of the brief interview, and exposes them as a ninth MCP tool, `eligian_brief`. The tool hands out rounds of questions and records the answers in `BRIEF.md`. It also records a confirmation that the agent reports. Nothing is gated yet.

- **The question tree** (`packages/cli/src/mcp/brief/tree.ts`): roadmap §3 as data. 63 questions in 12 branches. Each question has an id, a branch, a title, what to ask, an answer shape, prerequisites, an applies-when rule, the doc ids for the recommendation and the facts to look up first. Branch V repeats once per view.
- **The engine** (`brief/engine.ts`): pure functions over a tree, a brief and the looked-up facts. They compute the frontier, apply the applies-when rules, make the per-view copies, resolve `same as`, pick a round, and validate answers and cross-references.
- **The brief file** (`brief/brief-file.ts`): parses and writes `BRIEF.md`. The layout is fixed below (roadmap §4.6: "the exact layout is fixed in the Phase 1 spec"). The parser never throws, and writing then parsing returns the same answers. The file also carries the facts the server computed (§3.1 "They are recorded in the brief as facts, not as answers").
- **The tool** (`tools/brief.ts`): `eligian_brief` with the actions `status`, `answer` and `confirm`. `confirm` records an agent-reported confirmation only. The tool is loaded up front.
- **The docs**: a generated reference chunk `brief-questions` that lists the tree, so the docs cannot drift from the data (roadmap §3, §6.2).

Exit (roadmap §8 Phase 1): the inspector lists nine tools. An in-process test walks a full interview, from an idea to an empty frontier, for three fixture personas. Nothing is gated yet.

## Scope and non-goals

**In scope** (roadmap §8 Phase 1, verbatim bullets):
- "Day 1: clone the workflow." **Already done**: `.claude/workflows/presentation-assistant-phase.js` exists. It is untracked (`git status`: `?? .claude/workflows/presentation-assistant-phase.js`) and its `ROADMAP` constant names `specs/059-presentation-assistant/roadmap.md` (line 85). Phase 1 only commits it (FR-001).
- "The tree as data with its spec; the engine (frontier, applies-when, per-view copies, `same as`, round selection, validation)."
- "`BRIEF.md` parse and write."
- "`eligian_brief` with `status` and `answer`; `confirm` records agent-reported confirmation only."

**Touched files** (roadmap §8 Phase 1 "Touches"; the sites this spec found while verifying are marked †):
- `.claude/workflows/presentation-assistant-phase.js` (exists, to be committed)
- `packages/cli/src/mcp/brief/{tree,engine,brief-file}.ts` (new), `packages/cli/src/mcp/tools/brief.ts` (new)
- `packages/cli/src/mcp/server.ts` (registration; docstring "The eight tools", line 5; `ServerOptions` gains the `brief?` test seam of FR-034, next to `smoke?` at lines 41–42)
- `packages/cli/scripts/generate-knowledge.ts` (`brief-questions`)
- `packages/shared-utils/src/` (a new module for `findPackageManager`, moved from the extension, exported from `index.ts`; its tests move with it; FR-041), `packages/extension/src/extension/mcp/install-state.ts` (imports it from `@eligian/shared-utils`) and `packages/extension/src/extension/__tests__/mcp-install-state.spec.ts`† (its `findPackageManager` cases move to the shared-utils spec)
- `.github/workflows/ci.yml` (both inspector gates, lines 53–57 and 110–111)
- `packages/cli/src/__tests__/mcp-server.spec.ts`: `TOOL_NAMES` (lines 40–49), `UPFRONT` (line 50), the docstring "the eight tools" (line 4), "lists exactly eight tools" (line 118), the snapshot (line 142), the annotations test (lines 153–174), and† "upfront descriptions ≤ 1000" (lines 187–195, whose `toHaveLength(3)` at line 192 becomes `toHaveLength(4)`)
- `packages/cli/src/__tests__/__snapshots__/tools-list-phase3.json.snap`† (the `tools/list` snapshot)
- `packages/cli/src/__tests__/mcp-resources.spec.ts` (`toHaveLength(8)`, line 105)
- `packages/cli/src/__tests__/mcp-knowledge.spec.ts`† (`REFERENCE_CHUNKS`, lines 524–535, compared exhaustively at lines 642 and 652)
- `packages/cli/src/dev/runtime-reports.ts`† (the temp-file-and-rename loop of `writeDevErrors`, lines 221–251, extracted into one exported helper that `writeDevErrors` then calls; FR-034)
- `packages/cli/AGENTS.md` (line 34: "the eight tools"), root `AGENTS.md`† (line 49: "Eight tools: …")
- New tests and fixtures under `packages/cli/src/__tests__/` (see "New components")

`mcp-instructions.spec.ts` and `mcp-search.spec.ts` are on the roadmap's list but need no change in this phase; `mcp-instructions.spec.ts:137` ("names all eight tools") stays as it is. See "Differences between the roadmap and the code".

**Non-goals: what later phases own** (roadmap §8, quoted):
- **Phase 2** (gates, sign-off, additions, adoption): "The record of known programs (the first-run scan, `accept-existing`); the gate matrix; the `gate` failure with the next round." "Sign-off by elicitation with the fallback; the signature; `approve-storyboard` with its checks." "Additions: the three triggers and the scoped rounds." "Adoption: facts from the code, the remaining frontier, conflicts." "The CLI warning line." "`eligian_project`'s `brief` section." Phase 2 also owns `packages/cli/src/mcp/errors.ts` (kind `gate`) and `telemetry.ts` (the brief state on each call line).
  - So in Phase 1 there is no `scope` parameter, and no `approve-storyboard` or `accept-existing` action. Phase 1 makes no elicitation, writes no HMAC signature (FR-022 writes a plain SHA-256 digest that Phase 2 replaces), writes no `.eligian/programs.json`, and gates no tool, the CLI included.
- **Phase 3** (teaching, hook, evals): "Instructions, both prompts, the docs chunks, the `AGENTS.md` block." "The Claude Code hook and `eligian brief gate`." "Brief fixtures for the 14 cases; the multi-turn harness; three personas." Also `packages/cli/README.md` and `CHANGELOG.md`.
  - So in Phase 1, `INSTRUCTIONS[MCP_PHASE]` stays byte-identical, the `new-presentation` prompt is unchanged, and there is no `interview` chunk and no change to the `storyboard` chunk. The three fixture personas of this phase are in-process test data. They borrow the §7.2 names and behaviour, but they are not the §7.2 eval personas (no second model plays them).
- Roadmap §1 non-goals hold throughout: no change to the Eligian language, the compiler or the engine; the server does not write copy, choose colours or draft the storyboard.

## User scenarios and testing

### User story 1: an agent interviews from an idea to a complete brief (P1)

The user gives an idea. The agent calls `eligian_brief` (`action: status`, `idea`) and gets the first round: at most 7 questions, each with the doc ids that inform the recommendation and the facts to look up first. The agent asks them in one message. It records the answers (`action: answer`) and gets the next round, until the frontier is empty.

**Independent test**: SC-002. The in-process persona walk.

**Acceptance scenarios**:
1. **Given** an empty project, **When** `status` is called with an idea, **Then** `BRIEF.md` is created holding the idea, the state is `open`, and the round is `C1, P5, C4, P4, C3, C5, P3`.
2. **Given** a round, **When** the agent answers it, **Then** the accepted answers are in `BRIEF.md` with `by` and `round` (the first `answer` call is round 1, FR-015), and the reply holds the next round.
3. **Given** an idea that already states S1 and S2, **When** P5, C1, S1 and S2 are answered in one call, **Then** all four are accepted, in dependency order (roadmap §4.1 "by an earlier call or by the same call").
4. **Given** a single-view deck, **When** S2 has one row, **Then** S3, S4, I4 and X3 are counted as not applicable and never asked.

### User story 2: "you decide" and "same as" keep the interview short (P1)

**Acceptance scenarios**:
1. **Given** any question, **When** it is answered with `delegated: true` and the agent's choice as `value`, **Then** it is recorded with `by: delegated`, and the delegated answers are listed in the reply once the brief is `complete`.
2. **Given** views `intro`, `a`, `b`, **When** `V:b` is answered `same as a`, **Then** none of `V1:b`…`V6:b` is asked: each takes `a`'s current answer once it is settled, and waits (never asked) until then. A later change to `a` flows through without reopening `b`, and an explicit `V2:b` answer overrides the copied one (FR-014).

### User story 3: a changed answer reopens what depended on it (P2)

**Acceptance scenarios**:
1. **Given** S2 = `intro, end` with every V question answered, **When** S2's `end` row is changed in a later round, **Then** the V copies of `end` and the answered questions that read S2 come back on the frontier, each with its old value as `previous`. The V copies of `intro` stay answered, also after the server restarts, because each V answer records the basis it was given against (FR-016).
2. **Given** a reopened question, **When** the user keeps its old value and the agent sends it unchanged, **Then** it is settled by a `reviewed` line, keeps its round, is not asked again, and nothing below it reopens (FR-015).

### User story 4: the user confirms the brief through the agent (P2)

**Acceptance scenarios**:
1. **Given** state `open`, **When** `confirm` is called, **Then** it is refused (`frontier-not-empty`) and the reply holds the round.
2. **Given** state `complete`, **When** `confirm` is called with the user's message, **Then** the state is `confirmed` and `BRIEF.md` carries an `agent-reported` confirmation line with a digest.
3. **Given** a confirmed brief, **When** an answer is changed (by the tool or by hand), **Then** the state falls back to `complete` or `open`.

## Requirements

### Functional requirements

#### Workflow

- **FR-001** The cloned workflow `.claude/workflows/presentation-assistant-phase.js` is committed with this phase. Its `ROADMAP` constant is `specs/059-presentation-assistant/roadmap.md` and its artifacts land in `specs/059-presentation-assistant/phase-N-<slug>/`. (Roadmap header, §8 "Day 1: clone the workflow".)

#### The question tree (`brief/tree.ts`)

- **FR-002** The tree is exported data: 63 template questions in the 12 branches P, C, S, V, I, D, L, A, H, X, R, W (in that order), with the ids, titles, prerequisites and applies-when rules of roadmap §3.2–§3.13. Each question has:
  - `id`, `branch`
  - `title`: the roadmap's question text, without its "(doc …)" / "(docs …)" parenthetical
  - `ask`: what to ask, the roadmap's question text (S2 adds one sentence, FR-038)
  - `shape` (FR-005), `needs` (declared prerequisites), `appliesWhen` (FR-008), `reads` (the question ids its rule reads)
  - `docs`, `facts`
  - `since`: the tree version that added it; 1 for all 63

  S2's `ask` is the roadmap's question text followed by one sentence that says its names are timeline names (FR-038).

  `BRANCHES` names the branches as the roadmap's §3 headings do, with a capital first letter: Purpose, Context of use, Structure, One copy per view, Interaction, Visual design, Languages, Assets, Custom behaviour, Accessibility, Delivery, Working agreement. The module also exports `TREE_VERSION = 1`. It imports nothing from `effect/ai` and does no I/O at import. (§3, §4.6 "the tree version", spec 058 FR-003: `effect/ai` loads only in `server.ts`.)
- **FR-038** **S2 names are timeline names.** An S2 `name` is the name of the timeline the program will have for that view, and Phase 2 matches it case-sensitively (§5.2 "one view section per view in S2", §4.3). S2's `ask` is the roadmap's question text followed by the sentence `Each name is the timeline name the program will use, matched exactly (case-sensitive).` The S2 shape and its name pattern (FR-006) stay as they are, and S2 gets no `timeline` column. Phase 1 does no matching.
- **FR-003** **Effective prerequisites.** A question's effective prerequisites are its `needs` plus its `reads`. The engine waits on both. W1's `needs` is every other question (§3.13 "all other branches"). The roadmap's applies-when rules read some answers that are not in the declared `needs`:
  - V6 reads C3
  - D8 and A5 read V3
  - A4 reads S6 and V3 (FR-008)
  - the "any asset" and "an asset is missing" rules read V3, S6 and D3 (FR-012)

  Those reads become effective prerequisites. This is how the §3 test "applies-when rules read only earlier answers" is met (see "Differences"). The edge V3 → A4 adds no dependent to any question of the first frontier (C1, P5 and C4 already reach A4 through S6; P4, C3, C5 and P3 reach neither V3 nor A4 through it), so FR-017's counts hold.
- **FR-004** **Docs and facts per question.** `docs` lists index ids. Where the roadmap names ids, they are used: S1 `decisions`; S6 `provider-choice`; H1 `assets-and-host-modules`, `not-eligian`. The other branches get ids from §6.2's list and from the existing map chunks, all checked to exist as curriculum ids:
  - S2, S5, S8: `presentation-patterns`
  - D1–D8: `css-conventions`
  - S4, V6, I1–I5: `map-events-and-interactions`
  - L1–L5: `map-locales-and-languages`
  - A1–A6: `map-imports-and-assets`

  `facts` lists what the agent looks up before recommending, from §3.1:
  - D1, D2: `eligian_project` CSS classes and custom properties
  - D3: font files in the project
  - L1: the languages of existing programs, and each code's text direction
  - V3, A1, A6: the asset files (`eligian_project` files, the file system)
  - R3: the `.eligian` files already in the directory
  - R1: the installed `eligian` version and the package manager (the `- eligian-installed:` and `- package-manager:` lines of the brief's `## Facts`, FR-042)
  - H1: the host declarations (`eligian_project` host)

#### Answer shapes and validation

- **FR-005** **Answer values.** On the wire an answer is `{ id, value, delegated? }`. Each shape has exactly one canonical JSON form, and nothing else is accepted (no coercion, no normalising):
  - text, a choice, a view, a path: a JSON string. A choice is one of its options, matched exactly (case-sensitive). `none`, where a shape accepts it, is the string `"none"`.
  - a top-level yes/no (S7, I5, R4, X2, X5): a JSON boolean (`true` or `false`)
  - P5: a JSON number of seconds greater than 0, or the string `"viewer-paced"`
  - a set: an array of strings, each an option (or the string `"none"` where the shape accepts it)
  - a record: an object whose values are strings
  - a table: an array of such objects, one per row (or the string `"none"` where the shape accepts it)
  - a **cell** (inside a record or table) is always a string: a yes/no cell is `"yes"` or `"no"`, a duration cell is a positive number of seconds as a string, `-` is an empty cell.
  - so that `BRIEF.md` round-trips exactly (FR-021), these are also rejected `invalid-value`, with a message naming the rule: any string that contains a carriage return (`\r`); a cell (inside a record or table) that contains a line break; a path written with a backslash (paths use `/`); an empty or whitespace-only text answer; a cell with leading or trailing spaces (a `BRIEF.md` table trims its cells). (Clarification P7, 2026-11-19; the cell-spaces rule, build ruling 2026-11-19.)

  Anything else is rejected `invalid-value`, and the `message` shows the expected form of that shape (for example `expected a JSON boolean (true or false)`, `expected a JSON number of seconds greater than 0, or "viewer-paced"`, `expected an array of strings from: mouse, touch, keyboard, clicker`). Examples that are rejected: `"yes"` for S7, `"90"`, `"90s"` or `"1m30s"` for P5, a comma-separated string for a set, one record where a table is wanted, `"Self-Paced"` for C1, a number or boolean as a cell. The forms in `BRIEF.md` (`yes`, `90s`, comma-separated sets, FR-019) are written by the server and read back into the same canonical values; they are not wire forms.

  The round item carries the shape as data: `kind`; `options` for choices and sets; `columns` (name, kind, options) for records and tables; `none: true` when the literal `"none"` is accepted; `rows: "one-per-view"` where the table needs one row per S2 view. (§3, §4.1 "the server validates shape".)
- **FR-006** **The shapes.** All 63 are fixed here. A "view" cell or value must be a name in S2. "Entry" and "key" refer to the asset list of FR-012. Readings that go beyond the roadmap's answer column are listed under "Readings".

| id | shape | extra validation |
| --- | --- | --- |
| P1, P3, P4 | text | non-empty |
| P2 | text, or `none` | |
| P5 | number of seconds > 0, or `"viewer-paced"` | |
| C1 | choice `self-paced`, `presenter`, `loop`, `embedded` | |
| C2 | table `device` (`desktop`, `tablet`, `phone`, `large-screen`), `primary` (yes/no) | ≥ 1 row, devices unique, exactly one `primary: yes` |
| C3 | set of `mouse`, `touch`, `keyboard`, `clicker` | ≥ 1 |
| C4 | choice `on`, `off`, `both` | |
| C5 | choice `online`, `offline` | |
| S1 | choice `slide-deck`, `hub-and-chapters`, `media-annotation`, `scrollytelling`, `timed-piece` | |
| S2 | table `name`, `purpose` | ≥ 1 row; names unique, matching `^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$` (FR-010); each `name` is the timeline name of the view (FR-038) |
| S3 | view | |
| S4 | table `view` (view), `target` (view), `trigger` (text) | ≥ 1 row |
| S5 | table `view`, `end` (`stay`, `advance`, `loop`, `hub`) | one row per view |
| S6 | table `view`, `provider` (`raf`, `video`, `audio`, `scroll`), `source` (path, URL or `-`) | one row per view; `source` is not `-` for `video`/`audio` and is `-` for `raf`/`scroll` |
| S7 | yes/no | |
| S8 | choice `stay`, `restart`, `loop` | |
| V1, V2, V4 | text | non-empty |
| V3 | table `element` (text), `kind` (`text`, `image`, `video`, `audio`, `list`, `figure`, `button`, `other`), `file` (path, URL or `-`); or `none` | |
| V5 | record `duration` (seconds or `none`), `pacing` (`fixed`, `cues`, `stagger`, `none`), `cues-from` (text or `-`) | `duration: none` exactly when `pacing: none`; `cues-from` not `-` when `pacing: cues` |
| V6 | text, or `none` | |
| I1 | text, or `none` | |
| I2 | table `key`, `action` | ≥ 1 row |
| I3 | set of `bar`, `counter`, `chapter-menu`; or `none` | |
| I4 | choice `restart`, `resume` | |
| I5 | yes/no | |
| D1, D8 | text, or `none` | |
| D2, D6 | text | non-empty |
| D3 | table `font`, `source` (`system`, `project`, `cdn`), `file` (path, URL or `-`), `licence` | `file` is a path when `source: project`, `-` when `source: system`, a URL or `-` when `source: cdn` |
| D4 | record `choice` (`fixed-ratio`, `fluid`), `detail` (text) | |
| D5 | table `view`, `layout` | one row per view |
| D7 | choice `shorten`, `remove`, `keep` | |
| L1 | table `code`, `default` (yes/no) | ≥ 1 row; codes unique and valid per `isValidLanguageCode` (FR-011); exactly one default |
| L2 | table `language`, `supplier`, `when` | one row per L1 code, each an L1 code |
| L3 | text | non-empty |
| L4 | text, or `none` | |
| L5 | record `choice` (`yes`, `no`), `source` (text or `-`) | `source` not `-` when `yes` |
| A1 | table `asset`, `who`, `when` | one row per missing entry, its `asset` cell the entry's key |
| A2 | record `choice` (`yes`, `no`), `kind` (text or `-`) | `kind` not `-` when `yes` |
| A3 | text, or `none` | |
| A4 | table `file`, `poster`, `captions`, `loop` (yes/no), `muted` (yes/no) | one row per `video` or `audio` entry, its `file` cell the entry's key |
| A5 | table `image`, `alt` | one row per `image` entry, its `image` cell the entry's key |
| A6 | choice `project`, `remote` | |
| H1 | table `need` (`analytics`, `charts`, `form-input`, `external-data`, `gestures`, `other`), `detail`; or `none` | |
| H2, H3 | text | non-empty |
| X1 | choice `wcag-2.2-aa`, `best-effort`, `none` | |
| X2, X5 | yes/no | |
| X3 | record `focus` (yes/no), `announce` (yes/no) | |
| X4 | choice `captions`, `transcript`, `none` | |
| R1 | record `choice` (`standalone`, `embedded`, `offline`), `detail` (text) | |
| R2 | text | non-empty (`evergreen` or a list) |
| R3 | path | FR-013 |
| R4 | yes/no | |
| W1 | text | non-empty (`nothing` is the default recommendation) |
| W2 | choice `first-view`, `end` | |
| W3 | text | non-empty |

- **FR-007** **Rejections.** An answer that is not accepted is listed in the reply's `rejected` as `{ id, reason, message }`. `reason` is one of:
  - `unknown-question`
  - `duplicate` (the same id twice in one call; the later one is rejected)
  - `waiting` (an effective prerequisite is not settled)
  - `not-applicable`
  - `invalid-value` (shape; the message shows the expected form, FR-005)
  - `invalid-reference` (a cross-reference of FR-006, FR-010, FR-012, FR-013)

  A rejected answer does not block the accepted ones (§4.1).

#### The engine (`brief/engine.ts`)

- **FR-008** **Applies-when.** Each rule is a pure predicate over the settled answers it `reads` and the asset list (FR-012):
  - "more than one view": S2 has more than one row (S3, S4, I4, X3)
  - S7: some S6 row is `video` or `audio`, and C4 is not `off`
  - V6: C3 has `mouse` or `touch`
  - I1: some V5 copy has a duration other than `none`
  - I2: C3 has `keyboard`
  - I5: C3 has `touch`
  - D8: some V3 row has kind `image`
  - L2, L3: L1 has more than one row
  - L4: L1 has more than one row and the asset list is not empty
  - L5: L4 is not `none`
  - A1, A2: an entry of the asset list is missing
  - A3, A6: the asset list is not empty
  - A4: the asset list has a `video` or `audio` entry
  - A5: some V3 row has kind `image` (so the asset list has an `image` entry)
  - H2: H1 has `external-data`
  - H3: H1 has `analytics`
  - X4: some S6 row is `video` or `audio`
  - X5: some S5 row is `advance` or `loop`

  Every other question applies always. (§3.2–§3.13 "Applies when".) The engine hands each rule an `AnswerView` restricted to the question's `reads`. Reading any other id throws, which is a defect in the tree, never a user-input path, so an undeclared read fails every test that evaluates the rule (SC-004).
- **FR-009** **States of a question.** A question is **settled** when it is answered (and not stale, FR-016, FR-039) or not applicable (an answer recorded for a question that does not apply is dormant, FR-040, and does not make it answered). It is **waiting** when an effective prerequisite is not settled. It is **not applicable** when its prerequisites are settled and its rule is false. The **frontier** is the questions that apply, are not answered, and whose effective prerequisites are all settled. A not-applicable prerequisite counts as settled, so X2 (needs I2) is not blocked when C3 has no keyboard. (§1 Terms "Frontier", refined: see "Readings" R-1.)
- **FR-010** **Per-view copies.** Once S2 is answered, branch V has one copy per S2 row, with ids `V1:<name>` … `V6:<name>` and titles prefixed `<name>: `. Before S2 is answered, branch V counts as one template copy (6 waiting questions). An answer id names the view by its S2 `name` exactly; view names may not contain `:` or `|` (the S2 pattern of FR-006). A `## View: <name>` section whose name is not in S2 (the view was removed or renamed) is kept as an unknown section (FR-020) and reported in `ignored` with reason `unknown-view`. (§3.5.)
- **FR-011** **Cross-references** (§4.1 "the default language is one of the languages, the entry view is one of the views, every navigation target is a view, a duration is a number"):
  - S3, and S4 `view`/`target`, name S2 views
  - S5, S6 and D5 have exactly one row per S2 view
  - L1 has exactly one default
  - L2 rows are exactly the L1 codes
  - every duration is a positive number

  Language codes are checked with `isValidLanguageCode` from `@eligian/language` (`packages/language/src/eligian-validator.ts:50`, re-exported by `packages/language/src/index.ts:34`), so the brief accepts exactly the codes a `languages` block accepts.
- **FR-012** **The asset list (a fact, not an answer).** §3.9: "One row per asset named in V3, S6 or D3"; A1: "For each asset that does not exist yet". The list holds, in this order and deduplicated by key:
  - every row of every V3 copy whose kind is `image`, `video` or `audio`, whatever its `file`, and every other V3 row whose `file` is not `-`
  - every S6 row whose provider is `video` or `audio` (its `source`)
  - every D3 row whose source is `project` or `cdn` (a `system` font is not an asset: nothing is delivered or fetched)

  Each entry has:
  - a **key**: its file, source or URL when that is not `-`; otherwise `<view>: <element>` for a V3 row and `font: <font>` for a D3 `cdn` row
  - a **kind**: the V3 kind when it is `image`, `video` or `audio`, else `other`; the S6 provider; `font` for D3
  - a **state**:
    - `remote`: an `http:`/`https:` URL, and every D3 `cdn` row
    - `missing`: a V3 row whose file is `-`, or a relative path with no file at it, resolved against the brief's directory
    - `exists`: otherwise

  "An asset is missing" means some entry is `missing`; "any asset" means the list is not empty. A relative path that resolves outside the project root (`Facts.inside`, implemented with `isInside`, `packages/cli/src/mcp/paths.ts:81`) makes the answer that names it `invalid-reference`. The engine reads existence and containment only through the `Facts` it is given (`exists`, `inside`, `briefDir`; see "New components"), so every check of this FR is pure and is tested with a fake `Facts`. The tool builds the real `Facts` on every call and never caches them. The list is written to the `## Facts` section of `BRIEF.md` for people (FR-019) and never read back (§3.1 "Whether a named asset file exists").
- **FR-013** **R3.** The value is a relative path from the project root, with forward slashes, that ends in `.eligian` and lies under the root (`Facts.inside`). Its directory must be the brief's directory (`Facts.briefDir`, relative to the root; `.` at the root). Otherwise it is `invalid-reference`, and the message names the `directory` to call `eligian_brief` with. (§3.12, §4.1 "`directory`: … The brief is `<directory>\BRIEF.md`".)
- **FR-014** **`same as`** (a live reference). The answer id `V:<name>` with value `same as <other>` makes branch V of `<name>` use the answers of `<other>`. `<other>` must be another S2 view and not itself answered `same as` (no chains); otherwise it is `invalid-reference`. The answer is accepted once S2 and S6 are answered (every V answer is given against the view's S2 and S6 rows, its `basis`, FR-016), even while `<other>` has answered nothing. (Ruling, build 2026-11-19.) It is evaluated at every evaluation and never copied into the file:
  - Each `Vn:<name>` without an explicit answer takes `<other>`'s **current** `Vn` answer. That value is what every rule, cross-reference and the asset list (FR-008, FR-011, FR-012) read for `<name>`, so a copied V3 contributes its entries under `<name>`.
  - A copy is **settled only where `<other>`'s `Vn` is settled** (answered and not stale, or not applicable). Otherwise `Vn:<name>` is **waiting**: it is never on the frontier, and `<other>`'s `Vn` is.
  - Each settled copy counts as one answered question in the counts. The reply's `delegated` list names `<other>`'s own answers, not the copies.
  - A change to `<other>`'s answers flows through at once and does **not** reopen `<name>`: a copy is never stale because of `<other>`'s rounds. `V:<name>` itself is stale only by its own basis (FR-016) or by FR-039 (for example when `<other>` was hand-edited into a `same as` itself, or left S2).
  - An explicit `Vn:<name>` answer overrides the copy for that one question, and is an ordinary answer (FR-015, FR-016).

  (§3.5 "A view may answer the whole branch with `same as <view>`".)
- **FR-015** **Accepting answers in one call.**
  - **The round number.** The round of an `answer` call is 1 + the highest `round` or `reviewed` number among the recorded, non-ignored answers in `BRIEF.md` (1 for an empty brief). It is read from the file on every call, never from server memory. `status` and `confirm` do not advance it, and a call that writes nothing (FR-028) consumes no round.
  - **Order.** The answers of one call are processed in a topological order of the effective graph, ties broken by tree order, each against the state that includes the answers accepted before it in the same call. So a question and its prerequisite can be answered together (§4.1 "by an earlier call or by the same call").
  - **Changes.** An answer whose value differs from the recorded one gets the call's round, and loses any `reviewed` line. An answer that is not stale and whose `value` and `by` equal the recorded ones is a no-op: its round is unchanged. If only `by` differs, `by` is updated and the round is kept. Only a change of value advances `round`.
  - **A stale answer kept as it is is reviewed, not changed.** An answer to a stale question (FR-016) whose `value` equals the recorded one is settled by a `- reviewed: <n>` line, where `n` is the call's round (for a V answer, with the current basis). Its `round` is kept, and `by` is updated if it differs. This is a write (it consumes the round), but it is not a change of value, so nothing below it reopens: dependents reopen only below an answer whose value actually changed (FR-016). A user who keeps a reopened answer settles it with one "yes" (§9 risk 1). A stale answer whose recorded value no longer validates (FR-039) is rejected with the validation reason and is never reviewed.
- **FR-016** **Stale answers.** A recorded answer to an applicable question is **stale** when:
  - one of its effective prerequisites carries a `round` later than the answer's own `max(round, reviewed)`, except S2 and S6 for a V answer (only a prerequisite's `round` counts: a prerequisite's `reviewed` never reopens a dependent); or
  - it is a V answer (a `Vn:<name>` copy, or the `V:<name>` `same as` answer) of view `X` and its recorded `basis` differs from the current basis of `X`, or it has no `basis` line; or
  - it no longer validates against the current answers and facts (FR-039).

  The **basis** of view `X` is the first 16 hex characters of the SHA-256 (`node:crypto`) of `JSON.stringify([s2Row, s6Row])`, where `s2Row` is S2's row for `X` as `{ name, purpose }` and `s6Row` is S6's row for `X` as `{ view, provider, source }` (keys in column order), or `null` when S6 has no row for `X`. The tool writes it on every V answer it accepts, a review included (FR-019 `- basis:`). So a change to another view's S2 or S6 row does not reopen `X`, and S6 re-sent unchanged after it was reopened does not either.

  A stale answer counts as not answered. It is kept in `BRIEF.md`, returns to the frontier when its prerequisites are settled, and its round item carries its recorded value as `previous` (and, for the third case, the validation message as `reason`). Staleness is derived from the rounds, `reviewed` numbers and bases in the file, so it survives a restart and needs no other marker. Only an answer whose value changed advances `round`, so only it reopens its direct dependents; a reopened answer that is kept (reviewed) does not. (§7.2 item 6 "the questions that depended on it were asked again"; §9 risk 1 "a recommendation on every question so 'yes' is enough".)
- **FR-017** **Round selection.** A round is the first `max` frontier questions (default 7, `max` an integer 1 to 20). They are ranked by the number of unsettled question instances that transitively depend on each one, descending, with ties broken by tree order and then by S2 view order. For the empty brief the first frontier is exactly the 14 questions P1–P5, C1–C5, R2, R3, R4, W3. The first round is `C1, P5, C4, P4, C3, C5, P3` (computed from the effective graph: C1 has 39 dependents, P5 37, C4 24, P4 13, C3 11, C5 9, P3 6). (§3.14.)
- **FR-018** **Tree versions.** `BRIEF.md` records the tree version it was written under. While a brief has a valid confirmation (FR-022), the questions whose `since` is greater than its version count as not applicable, so a later tree does not reopen it. An unconfirmed brief is evaluated against the current tree, and the next write records the current version. (§4.6 "A brief confirmed under an older tree version stays confirmed; questions added later do not reopen it".) The engine takes the tree as a parameter, so a test can pass a version-2 tree.
- **FR-039** **Re-validation on every evaluation.** The engine re-validates every recorded answer to an applicable question on every evaluation, against the current answers and the current `Facts`, with the checks of acceptance: shape (FR-005, FR-006), cross-references (FR-011, FR-012, FR-013) and `same as` targets (FR-014). It goes in topological order, so an answer is checked only against settled prerequisites. An answer that no longer validates **counts as stale** (FR-016): not answered, back on the frontier when its prerequisites are settled, its recorded value as `previous` and the validation message as `reason` on its round item. It stays in `BRIEF.md` unchanged. Examples: S3 names a view that a hand edit removed from S2; A1's rows are no longer one per missing entry because an asset file was deleted; S5 lacks a row for a view added to S2. Re-sending the same value is rejected with the same reason (FR-015), and a value that validates is accepted and settles it. The reply has no separate `invalid` list: the round item carries the reason. (Parsing still ignores a value that does not fit its shape, FR-020; that answer counts as not answered, without `previous`.)
- **FR-040** **Answers to questions that do not apply (dormant).** A recorded answer whose question is not applicable (S3 after S2 drops to one view, I2 after `keyboard` leaves C3, A1 after the missing file appears) is **dormant**:
  - It stays in `BRIEF.md` (written in its section like any answer, and round-tripped, FR-021). Nothing is dropped.
  - It is left out of the `answered` and `delegated` counts, out of the reply's `delegated` list, and out of the FR-022 digest. Its instance counts as `notApplicable`. It is not validated (FR-039). So a confirmation made while it applied no longer matches the digest, and the state becomes `complete` (FR-023).
  - An `answer` call for it is rejected `not-applicable` (FR-007).
  - When the question applies again, the recorded answer is an ordinary answer and FR-016 applies. When it applies again because an answer it reads changed, that prerequisite carries a later round, so the answer is stale and returns to the frontier with its recorded value as `previous`; a "yes" settles it by review (FR-015). (When it applies again only because a hand edit restored the earlier value, or because a fact changed, no round moved: the answer counts as answered again, unless FR-039 finds it invalid.)

#### `BRIEF.md` (`brief/brief-file.ts`)

- **FR-019** **The layout** (fixed here, per §4.6). LF line endings, UTF-8. Blocks are separated by exactly one blank line, and the file ends with a single LF. In this order:
  1. `# Brief`.
  2. This comment line, verbatim: `<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->` (decision 5, §4.6 "Only the tool writes it").
  3. The idea as a blockquote: each line prefixed `> `, an empty line as `>`. Omitted when there is no idea.
  4. The header list:
     - `- tree: <n>`
     - `- state: <open|complete|confirmed|approved>` (for people; the server never trusts it, FR-023)
     - `- confirmation: none`, or `- confirmation: agent-reported <ISO-8601 UTC> sha256:<64 hex>`
     - `- confirmation-message: <JSON string>`, only when confirmed
     - `- approval: none` (Phase 1 always writes `none`)
  5. All 12 branch sections, `## <letter>: <branch name>` (FR-002 `BRANCHES`), in tree order (§4.6 "One section per branch and one per view"). A section with no answers holds the single line `_No answers yet._`. Branch V's section holds `_No answers yet._` until S2 is answered, then `_One section per view below._`, and is followed by one `## View: <name>` section per S2 row, in S2 order. A view section with no answers holds `_No answers yet._`.
  6. `## Facts`: the facts the server computed for this write (§3.1 "They are recorded in the brief as facts, not as answers"):
     - the comment line `<!-- Computed by eligian_brief when it writes this file; never read back. -->`
     - `- server-eligian: <version>` (the running server's `versions.compiler`, `server.ts:72`; under the `npx` launch form it need not be the version installed in the project, so the line does not claim to be)
     - `- eligian-installed: <version>`: the `version` of `<project root>/node_modules/eligian/package.json`, or `-` when that file is absent or unreadable (FR-042)
     - `- package-manager: <pnpm|yarn|bun|npm>` from `findPackageManager` at the project root (FR-041, FR-042)
     - `- text-direction: <code> <ltr|rtl>, …` for the L1 codes in L1 order, or `- text-direction: -` while L1 is not answered. The direction comes from `Intl.Locale`: `getTextInfo().direction`, else the `textInfo` getter (older V8), else `ltr`. Measured on Node 24.7 in this session: `ar-EG` gives `rtl`, `nl-NL` gives `ltr`. The CLI's engines floor is Node 22.12 (`packages/cli/package.json:29`), hence the fallbacks. No existing helper computes it (Grep `rtl` over `packages/`: only `html-elements.generated.ts:157`).
     - the asset list of FR-012 as a table `| asset | kind | state |` (key, kind, state), or the line `- assets: none`
  7. The unknown `##` sections, verbatim, in their original order.

  Inside a section, each answer is written as:
  - the heading `### <id>: <title>`. In a view section the id is the template id (`### V3: …`), and the branch-level `same as` is `### V: same as`.
  - one blank line, then `- by: <user|delegated>` and `- round: <n>`, then `- reviewed: <n>` only on an answer that was kept as it is while stale (FR-015), then for a V answer `- basis: <16 hex>` (FR-016)
  - one blank line, then the value:
    - text: verbatim, a line that starts with `#` written with a leading `\`
    - a choice, set or yes/no: one line (`yes`/`no`; a set comma-separated, or `none`)
    - a number: `<n>s`
    - a record: a `| field | value |` table
    - a table: a Markdown table with the shape's columns in shape order, `|` in a cell escaped as `\|`

  Answers inside a section are in tree order. Answers to questions that do not apply (FR-040) are written like any other. The facts are written whenever the tool writes the file (FR-028). A call that writes nothing leaves them as they were, which is harmless because the server recomputes them on every call. A full example is in "Example `BRIEF.md`". It is also the golden fixture of SC-006.
- **FR-020** **Parsing** never throws. It accepts LF and CRLF and returns:
  - the idea
  - the tree version
  - the confirmation (mode, time, digest, message), or none
  - the recorded answers (id, value, by, round, and where present `reviewed` and, for a V answer, its basis)
  - `ignored`: `{ line, reason }`, for an answer heading with an unknown id, a value that does not fit its shape, missing `by`/`round` lines, a malformed header line, and a view section for a view not in S2 (`unknown-view`, FR-010)
  - the unknown `##` sections and ignored answer blocks, as raw text with their positions

  An ignored answer counts as not answered. Writing keeps every ignored block verbatim in its section, and every unknown section verbatim at the end, so content a person added is never lost. The `## Facts` section (all its lines, the version and package-manager lines included) is recognised and dropped on read: the writer recomputes it, and its comment line says so. The `_No answers yet._` and `_One section per view below._` lines are recognised and dropped. (§4.6 "never throws, unknown content is kept and reported", modelled on `readStoryboard`, `packages/cli/src/mcp/storyboard.ts:66`.)
- **FR-021** **Round trip.** For every brief `b` that the writer can produce (with a given facts snapshot), `parse(write(b))` returns the same idea, tree version, confirmation and answers (bases included). `write(parse(write(b)))` with the same facts snapshot is byte-identical to `write(b)`. (§4.6 "Writing then parsing returns the same answers".)
- **FR-022** **The digest.** The confirmation line carries `sha256:` and the hex SHA-256 (`node:crypto`) of the canonical JSON of the recorded, non-ignored answers to questions that apply (dormant answers are left out, FR-040), sorted by id, each as `[id, value, by]` (round, `reviewed` and basis are excluded; the facts are not answers). Phase 2 replaces it with the HMAC of §5.3. The `sha256:` prefix keeps the two apart.
- **FR-023** **State** is computed on every call and never read from the `state:` line:
  - `confirmed`: a confirmation is present, its digest matches the current answers, and the frontier is empty
  - `complete`: the frontier is empty and there is no valid confirmation
  - `open`: otherwise

  Phase 1 never computes `approved` (§1 Terms; §4.1 "`state`: `open`, `complete`, `confirmed` or `approved`").

#### The tool `eligian_brief` (`tools/brief.ts`)

- **FR-024** **Registration.** `eligian_brief` is the ninth tool. It is added as the **first** entry of `ai.Toolkit.make(...)` (`packages/cli/src/mcp/server.ts:109–118`; `tools/list` returns tools in toolkit order, as the snapshot's order docs → operations → check → … → smoke shows), so the `tools/list` snapshot gains only insertions (SC-007). It is also added to the handler record in `makeServerLayer` (`:137–177`), and runs inside the same `call`/`boundary` wrapper, so it gets telemetry, defect catching and the declared `{ header, error }` failure (`server.ts:95–107`, `errors.ts:34`, `:91`). It is annotated:
  - `ai.Tool.Meta { 'anthropic/alwaysLoad': true }` (§4.1 "Loaded up front")
  - `Destructive false`, `Idempotent true` (FR-015), and not `Readonly`

  Its description is at most 1,000 characters (the upfront budget, `mcp-server.spec.ts:187–195`). It states that only `eligian_brief` writes `BRIEF.md`, so the agent must not edit that file itself (§4.6, decision 5).
- **FR-025** **Parameters** (§4.1 without the Phase 2 parts):
  - `directory`: optional, default the project root
  - `action`: `status`, `answer` or `confirm`
  - `idea`: optional string
  - `answers`: optional list of `{ id: string, value, delegated?: boolean }` (FR-005)
  - `max`: optional integer from 1 to 20
  - `confirmation`: optional string

  A `max` outside 1–20 fails the call with a message naming the range, and nothing is written. The check is the parameters schema's, as for every bad parameter of the existing tools: the call fails as a JSON-RPC `-32602` (invalid params) error whose message names 1 and 20, not as a declared tool failure with a header. (Clarification P2, 2026-11-19.) That is the outcome on protocol 2025-06-18. On protocol 2025-11-25, which reports input validation errors as tool execution errors, the same check gives a tool result with `isError: true` and the same message; nothing is written either way, and both protocols are tested. (Build ruling, 2026-11-19.)
- **FR-026** **Paths.** `directory` resolves with `projectRoot` and `resolveInputPath` (`paths.ts:63`, `:93`). It accepts backslashes, forward slashes and either drive-letter case. A directory outside the root fails with `ToolNotFound` (kind `not-found`) and reads and writes nothing. The brief is `<directory>/BRIEF.md`. A missing directory is created when the brief is first written. An absent `BRIEF.md` (ENOENT) is an empty brief. Any other read or write failure, a `BRIEF.md` that is a directory included, is `ToolIoError` (kind `io`) through `toToolError` (`errors.ts:76`).
- **FR-027** **`status`.** Reads `BRIEF.md` and returns the reply.
  - File absent, `idea` given: it creates the file with the idea and an empty answer set.
  - File absent, no `idea`: it writes nothing, returns the first round, and `next` asks for the user's idea verbatim.
  - File with an idea already: a different `idea` is not stored. (§4.1 "Stored in the brief header on the first call".)
  - File present without an idea: the first `status` or `answer` call that carries an `idea` stores it. The first stored idea is never replaced.
  - A stored idea has its CRLF line endings converted to LF. (Clarification P8, 2026-11-19.)
- **FR-028** **`answer`.** Applies FR-015 to `answers`, stores the idea if the file is new, writes `BRIEF.md` when at least one answer changed, and returns the reply. A call where every answer is rejected or a no-op writes nothing.
- **FR-029** **`confirm`.**
  - It is refused with `refused: { code: 'frontier-not-empty' }` while the state is `open` (§4.1 "`confirm` is refused while the frontier is not empty").
  - It is refused with `confirmation-missing` when `confirmation` is absent or blank.
  - Otherwise it writes the `agent-reported` confirmation line and the verbatim message, and the state becomes `confirmed`.
  - Confirming an already confirmed brief whose digest still matches is a no-op.

  A refusal is a successful tool result with the reply, not a tool failure, so the agent gets the round with it. (§5.1 fallback; §8 "`confirm` records agent-reported confirmation only".)
- **FR-030** **Reply** (§4.1 "Reply"):
  - `header`: `eligian <compiler> · eligius <eligius> · eligian_brief · <BRIEF.md path>`, the format of the other tools
  - `file`: the absolute path of `BRIEF.md`
  - `state`
  - `round`: items `{ id, title, ask, shape, docs, facts, previous?, reason? }` (`previous` for a stale answer, `reason` for one that no longer validates, FR-016, FR-039)
  - `counts`: `{ answered, delegated, open, waiting, notApplicable }` over question instances (FR-010). A dormant answer counts as `notApplicable`, not as answered or delegated (FR-040); a settled `same as` copy counts as answered (FR-014).
  - `rejected` (FR-007) and `ignored` (FR-020)
  - `delegated`: `{ id, title, value }[]`, present only when the state is `complete` or `confirmed` (§5.1 "the list of delegated answers with the agent's choices")
  - `refused`, when FR-029 applies
  - `next`: one instruction:
    - `open`: "Ask the user these N questions in one message, each with your recommended answer worded so that yes accepts it; then call `eligian_brief` with `action: answer`."
    - `complete`: show the user the counts, the delegated answers and `BRIEF.md`, then call `confirm` with their reply verbatim
    - `confirmed`: draft `STORYBOARD.md` from the brief (`eligian_docs` id `storyboard`)
- **FR-031** **Telemetry.** `summarizeArgs` records `action`, the number of answers, `max` and whether an idea was passed. It never records answer values, the idea or the confirmation message. `summarizeResult` records `state`, the counts and the number rejected. (`telemetry.ts:28–33`; spec 058 FR-008.)
- **FR-032** **No compiler, no lock.** `eligian_brief` touches neither the Langium services nor `CompilerLock` (`compiler-lock.ts:59`). It never waits behind a compile, and a compile never waits behind it.
- **FR-033** **One call at a time per brief.** Within one server, calls on the same `BRIEF.md` run one at a time under a per-path `Semaphore` with one permit (effect 4.1.4 `Semaphore.makeUnsafe(permits)`, `Semaphore.d.ts:217`; `withPermits`, `:79`). The semaphores live in a map keyed by the resolved path, lower-cased on Windows. The map is created once per server in `makeServerLayer`. Calls on different directories run in parallel.
- **FR-034** **Atomic writes.** `BRIEF.md` is written to a temp file in the same directory and renamed onto the target, with the retry on `EPERM`/`EBUSY`/`EACCES` that `writeDevErrors` already has (`packages/cli/src/dev/runtime-reports.ts:221–251`).
  - **The shared helper.** That temp-file-and-rename loop is extracted into one exported helper, `writeFileAtomic(target, text)`, which both callers use. `writeDevErrors` keeps its behaviour. The helper keeps the `node:fs/promises` namespace import, which the dev-server spec observes with `vi.mock` (`runtime-reports.ts:231–233`), so that spec stays green. The plan picks the module.
  - **The changed-file check.** Before the rename, the tool re-reads `BRIEF.md`. If the text differs from what the call read (a hand edit, or another server process on the same project), the call removes its temp file, writes nothing, and fails with `ToolIoError` "BRIEF.md changed while writing; call again". The changed file is kept as it is. There is no recompute.
  - **The test seam.** `ServerOptions.brief?: { beforeRename?: (target: string) => Promise<void> }`, modelled on `smoke?` (`server.ts:41–42`). It is called after the temp file is written and before the re-read, and defaults to none. SC-010 and SC-015 use it.
- **FR-035** **Stdout.** No brief module writes to stdout or `console`. Over stdio, stdout carries protocol frames only (spec 058; `packages/cli/AGENTS.md:34`).

#### Docs

- **FR-036** **`brief-questions`.** `generateKnowledge` (`packages/cli/scripts/generate-knowledge.ts:1155`) adds a generated chunk modelled on `domEventsChunk` (`:781–801`):
  - id `brief-questions`, kind `reference`, file `generated/brief-questions.md` (as `chunkFile`, `instructions.ts:108–112`, requires; the generator enforces it at `:1196–1199`)
  - `see: ['decisions', 'storyboard']`
  - a card of at most 120 words
  - the body is built from `tree.ts` and has one line per template question: id, title, its `needs`, its applies-when in words, and its docs ids, grouped by branch

  The AGENTS.md block lists it through `agentsMdBlock` (`instructions.ts:134`). (§3 "A generated docs chunk (`brief-questions`) lists the tree"; §6.2.)

#### Documentation and pins

- **FR-037** **The tool list moves from eight to nine** in every place that pins it:
  - `ci.yml`: both `want` strings, and the comment at line 53
  - `mcp-server.spec.ts`:
    - `TOOL_NAMES`
    - the "lists exactly eight tools" test (renamed nine)
    - the upfront set (`UPFRONT` gains `eligian_brief`)
    - the annotations test (brief: alwaysLoad, `destructiveHint false`, `idempotentHint true`)
    - "upfront descriptions ≤ 1000" (`:187–195`): `toHaveLength(3)` at `:192` becomes `toHaveLength(4)`
    - the docstring "the eight tools" (`:4`) becomes "the nine tools"
  - the `tools-list-phase3.json.snap` snapshot
  - `mcp-resources.spec.ts:105`
  - `mcp-knowledge.spec.ts` `REFERENCE_CHUNKS`
  - `server.ts`'s docstring
  - `packages/cli/AGENTS.md:34` ("the nine tools", and `brief/`)
  - the root `AGENTS.md`: line 49 ("Eight tools" becomes nine, with `eligian_brief`) and line 97, the `tools/` list of the architecture block, which gains `brief` (and `brief/` beside `knowledge/`). (Clarification P14, 2026-11-19.)
  - root `AGENTS.md:49`

  `mcp-instructions.spec.ts:137` ("names all eight tools") is not a tool-list pin and stays unchanged (Differences item 3).

#### Facts probes

- **FR-041** **`findPackageManager` moves to `@eligian/shared-utils`.** `findPackageManager(folderPath): Promise<PackageManager>`, the `PackageManager` type and the lockfile list and file helpers it needs move from `packages/extension/src/extension/mcp/install-state.ts:163` into `packages/shared-utils/src/` (a new module, exported from `index.ts`; the plan picks the file). Behaviour is unchanged: walk up from the folder, a lockfile wins over the `packageManager` field per directory, the default is `npm`. `install-state.ts` imports it from `@eligian/shared-utils` and `installCommand` keeps working; the CLI imports it from there through the bundler alias (`packages/cli/esbuild.mjs:38`). The function's cases move to a shared-utils spec, and the extension's `mcp-install-state.spec.ts` stays green. The module imports no `vscode` and adds no dependency to shared-utils.
- **FR-042** **The two probes.** On every call, `tools/brief.ts` computes (never cached) the installed version and the package manager and passes them to the writer as part of the facts snapshot:
  - `eligian-installed` is the string `version` of `<project root>/node_modules/eligian/package.json`; an absent, unreadable or non-JSON file, or one without a string `version`, gives `-`
  - `package-manager` is `findPackageManager(<project root>)`
  - a probe never fails the call
  - the facts are written to `## Facts` (FR-019) and never read back; `tree.ts`, `engine.ts` and `brief-file.ts` do no I/O, so the probes live in `tools/brief.ts` and the values come in as data (SC-012)

## Readings (decided in this spec where the roadmap leaves a detail open)

- **R-1** "Prerequisites are all answered" (§1) is read as "settled": answered or not applicable (FR-009). Without it, X2 (needs I2) would wait for ever when C3 has no keyboard.
- **R-2** Applies-when reads become effective prerequisites (FR-003). Otherwise V6, D8, L4 and A1–A6 read answers outside their declared needs.
- **R-3** S6 gets a `source` column for video and audio. §3.9 counts "assets named in … S6", and S6's roadmap answer ("per view") names no file.
- **R-4** §3.1 says the looked-up facts "are recorded in the brief as facts, not as answers", and that rule applies to Phase 1. Phase 1 records the facts the server computes in `## Facts` (FR-019): the running server's version (`server-eligian`), the installed `eligian` version (`eligian-installed`), the package manager (`package-manager`), each L1 code's text direction, and the asset list with each entry's state. It writes them whenever it writes the file and never reads them back, because the server recomputes them on every call (FR-012, FR-042). The package-manager probe is made possible by moving `findPackageManager` into `@eligian/shared-utils` (FR-041). One §3.1 fact is not recorded in Phase 1: the project inventory (layout ids, CSS classes, locale keys, host declarations) is `eligian_project`'s output. The agent reads it per question (`facts`, FR-004), and adoption records it as facts in Phase 2 (§4.4).
- **R-5** X4's "one of three" is read as `captions`, `transcript`, `none`. C2's set plus primary is a table with a `primary` column. Structured answers outside the four that §4.6 names (C2, D3, V5, I2, A1, A4, A5, H1, the records) are tables or records too, so that every value round-trips.
- **R-6** A changed answer reopens its direct dependents through rounds and bases (FR-016), and so, one level at a time, its transitive ones as each is changed; a kept answer (reviewed, FR-015) reopens nothing. `previous` and `reason` are added to the round item (FR-030). These are the only fields Phase 1 adds to §4.1's round item. They serve §7.2 item 6 and risk 1.
- **R-7** Phase 1 writes a SHA-256 digest on the confirmation line (FR-022), so a hand edit after confirmation drops the state to `complete` (§5.3's rule, without its key, which is Phase 2).
- **R-8** `confirm`'s refusals are replies with `refused`, not tool failures. The `gate` failure kind belongs to the generation tools in Phase 2 (§4.2).
- **R-9** The asset list (FR-012) holds the V3 image, video and audio rows whose file is `-`. Those are exactly the assets "that do not exist yet" that A1 asks about. A D3 `system` font is not an asset. A D3 `cdn` font is a remote asset, and A6 asks about those.
- **R-10** Per-view staleness is computed from a `basis` digest recorded on each V answer (FR-016). A round per answer cannot tell which S2/S6 row changed once the old rows are overwritten. A digest of the view's own S2 and S6 rows can, from the file alone.

## Success criteria

- **SC-001** **Nine tools in the inspector** (roadmap §8 exit). After `pnpm build`, the `ci.yml` "MCP inspector gate" `tools/list` command (lines 55–57) is run locally in Bash with the new `want` string. It prints exactly `tools/list: eligian_brief eligian_check eligian_compile eligian_docs eligian_fmt eligian_init eligian_operations eligian_project eligian_smoke` and exits 0. `.claude/hooks/guard-ci-gates.cjs`, which runs the ci.yml steps on a commit, covers the same step. The tarball gate (ci.yml "MCP on the packed tarball", lines 102–112) is not run by that hook, so its script is run locally in Bash, as written: `pnpm -C packages/cli pack`, the `npm install` of the tarball into a temp dir (the step's own simulated user install), then the `tools/list` check on the installed `bin/cli.js`. It prints the same line and exits 0. CI runs both on the PR to `main` (`ci.yml:3–14`).
- **SC-002** **A full interview for three personas** (roadmap §8 exit). `packages/cli/src/__tests__/mcp-brief-interview.spec.ts` starts an in-process server (`startInMemoryServer`, `mcp-test-client.ts:123`) per persona in a fresh temp project.
  - **The loop.** It calls `status` with the idea, then loops: it answers the asked ids with the persona's values, and after round `n` it also sends the persona's scripted `{ afterRound: n, answers }` entries, whether or not their ids were asked. It stops when the state is `complete`, then calls `confirm`.
  - **The cap.** Every loop is capped at 20 rounds. At the cap the test fails, naming the last round's ids.
  - **The personas** are fixtures under `__fixtures__/mcp/brief/personas/`:
    - `terse` (§7.2 "accepts every recommendation"): one view, one language (`en-US`), fixed values in `terse.json`. Most answers are plain, recorded `by: user`, which stands for the user saying "yes" to the agent's recommendation. A few (D2, V2 and W1) are `delegated: true`, which stands for "you decide".
    - `detailed`: three views (`intro`, `demo`, `signup`, none `same as`) and two languages (`en-US` default, `nl-NL`). C3 is `mouse, keyboard`, C4 is `on`, and S5 has an `advance` row. S6 gives `demo` the provider `video` with the source `media/demo.mp4`, which does not exist. Intro's V3 has an `image` row with file `-`. D1 names a brand guide. H1 and L4 are `none`. With this sheet 71 question instances apply: P 5, C 5, S 8, V 18, I 4, D 8, L 4, A 6, H 1, X 5, R 4, W 3.
    - `vague`: two views. Its first S3 names a view that is not in S2, and a later round corrects it: the first round in which the ranking asks S3 again, not necessarily the very next one (build ruling, 2026-11-19). Scripted after a later round: a changed S2 `purpose` for one view, and C4 changed from `on` to `off`. When S6 is reopened, the persona re-sends it unchanged (the FR-015 stale path).

  Measured per persona, all must hold:
  1. the final state is `complete` with an empty round, then `confirmed` after `confirm`
  2. every round has at most 7 items, and every item has a non-empty `ask`, a `shape`, `docs` and `facts` (arrays, possibly empty)
  3. each recorded answer in the parsed `BRIEF.md` equals the persona's **last** value for that id, and its `by` is `delegated` exactly when the persona marked it so. The persona has no answer that was asked and is missing. For `terse`, the recorded answers include both `by: user` and `by: delegated`, and the reply's `delegated` list at completion holds exactly the delegated ids.
  4. no question is asked twice, except (i) reopened questions (stale by round, by basis or by FR-039), whose `previous` equals the value recorded before the change (a question settled by review is not asked again), and (ii) a question whose answer was rejected in the previous call, which carries no `previous`
  5. no rejected answers, except the vague persona's planned invalid S3, rejected `invalid-reference`
  6. the detailed persona needs at most ⌈(n − 1)/7⌉ + 2 rounds, where `n` is the number of applicable instances at completion (71, so at most 12). The reasons: W1 needs every other question, so it is asked alone in the last round, and one depth-limited partial round is allowed. The test logs each persona's round count, and compliance.md records it against roadmap §3.14's estimate of 8 to 10.
- **SC-003** **Nothing is gated** (roadmap §8 exit). In `mcp-brief-interview.spec.ts`, with a `BRIEF.md` in state `open` next to a program, `eligian_check`, `eligian_compile`, `eligian_fmt`, `eligian_project` and `eligian_smoke` (stub CLI) return the same results as without the file. Every existing `mcp-*.spec.ts` passes unchanged, apart from the FR-037 pins.
- **SC-004** **The tree spec.** `packages/cli/src/__tests__/brief-tree.spec.ts` asserts:
  - 63 template questions, branches in the order P C S V I D L A H X R W with sizes 5 5 8 6 5 8 5 6 3 5 4 3
  - ids are unique
  - the effective graph (FR-003) is acyclic
  - each `appliesWhen` reads only its `reads`. This is checked structurally: FR-008's restricted `AnswerView` throws on any other id. Every rule is evaluated over the SC-005 true and false fixtures of FR-008, which cover both outcomes of every operand, and none throws.
  - every `docs` id is in the generated `index.json` (from `generateKnowledge` into a temp dir)
  - the first frontier is exactly the 14 ids of FR-017, and the first round is `C1, P5, C4, P4, C3, C5, P3`
  - every `since` is ≤ `TREE_VERSION`
  - S2's `ask` contains `timeline name` and `case-sensitive` (FR-038) while its `title` is the roadmap's question text, and S2's shape has exactly the columns `name` and `purpose`
  - every `title` equals the roadmap's question text without its "(doc …)" parenthetical, for the ids that the golden fixture of SC-006 uses
- **SC-005** **The engine spec.** `packages/cli/src/__tests__/brief-engine.spec.ts` covers, with at least one test each (a fake `Facts` with chosen `exists`, `inside` and `briefDir`):
  - the frontier and the counts
  - each applies-when rule of FR-008, true and false
  - single view: S3, S4, I4 and X3 not applicable
  - the per-view copies and their ids
  - `same as`, with an override, a chain rejected and a self-reference rejected (the live semantics are SC-017)
  - round selection at `max` 1, 7 and 20
  - each cross-reference of FR-011, FR-012 (a path outside the root through `Facts.inside`) and FR-013 (a directory other than `Facts.briefDir`), rejected with `invalid-reference`
  - each shape of FR-006 rejecting one wrong value with `invalid-value`
  - the asset list:
    - a V3 `image` row with file `-` is a `missing` entry keyed `<view>: <element>`, and makes A1, A2, A3, A5 and A6 apply (and L4 with two L1 codes)
    - a `system` D3 row is not an entry
    - a `cdn` D3 row is `remote`
  - a question and its prerequisite in one call, given in reverse order
  - a rejected prerequisite making its dependent `waiting`
  - FR-015's round number: the first `answer` is round 1, the next one round 2, and a call that writes nothing consumes no round
  - FR-015's no-op and `by`-only change
  - FR-015's review rule: C4 is changed, which reopens S6. S6 is re-sent unchanged. It is then settled by a `reviewed` line, keeps its round and is not in the next round (SC-016)
  - FR-016's staleness by round
  - FR-016's per-view basis, re-parsed from text with no in-memory carry-over. With views `intro` and `end` fully answered, the brief is written and parsed again, and S2's `end` row is changed. The V copies of `end` are stale and those of `intro` are not. S6 is then re-sent unchanged, and `intro` stays settled.
  - FR-018 with a version-2 tree fixture
  - FR-023's three states
- **SC-006** **The file spec.** `packages/cli/src/__tests__/brief-file.spec.ts` asserts:
  - **golden**: "Example `BRIEF.md`" below is the fixture `__fixtures__/mcp/brief/example.md`.
    - `writeBrief(TREE, parseBrief(example), facts)` is byte-identical to it, with `facts` = server eligian `1.1.0`, installed eligian `1.1.0`, package manager `pnpm`, and the one asset entry `media/demo.mp4`, `video`, `missing`.
    - `parseBrief(example)` returns the idea (two lines), P1, P5 = 90, C1, C4, S1, S2 with 3 rows, S6 with 3 rows, V3 of `demo` with 2 rows and basis `4a3055a743c8484e`, and `V:signup` = `same as intro` with basis `23a0aa8fc1af8ff6`. It returns no `ignored`.
  - FR-021 on the three persona briefs and on one brief that uses every shape of FR-006, including text with a leading `#`, cells with `|`, a multi-line idea, an answer with a `reviewed` line and a dormant answer (FR-040). The all-shapes output is also pinned with `toMatchFileSnapshot`.
  - a CRLF copy parses to the same result
  - an unknown `## Notes` section and an ignored answer block survive a parse and write byte for byte, and are reported in `ignored`
  - a hand-edited `## Facts` section is dropped on parse and rewritten from the given facts on write
  - 500 deterministically mutated inputs (seeded: deleted, duplicated and truncated lines, random bytes) never throw
- **SC-007** **The server surface.** `mcp-server.spec.ts` asserts:
  - nine tools
  - `alwaysLoad` exactly `eligian_brief`, `eligian_check`, `eligian_docs`, `eligian_operations`, and four upfront descriptions of at most 1,000 characters each (`:187–195`, `toHaveLength(4)`)
  - the brief annotations of FR-024
  - the `instructions-phase3.txt.snap` snapshot is unchanged

  The `tools-list` snapshot changes only by the added `eligian_brief` entry. Because FR-024 registers the tool first, `git diff --numstat -- packages/cli/src/__tests__/__snapshots__/tools-list-phase3.json.snap` reports `<n>	0` (insertions only, 0 deletions), and the first entry of the new snapshot is `eligian_brief`.
- **SC-008** **The docs chunk.** In `mcp-knowledge.spec.ts`:
  - `brief-questions` is in `REFERENCE_CHUNKS`
  - its index entry has kind `reference` and the FR-036 `see`
  - its body has one line per template id (63)
  - its card is at most 120 words, and it has at most 3,000 words

  `agents.spec.ts` "≤ 8192 bytes" stays green (the block is 7,438 bytes today).
- **SC-009** **Stdout purity.** `mcp-stdout.spec.ts` gains a spawned-server run: `initialize`, then `eligian_brief` `status` with an idea and one `answer`. Every stdout line parses as a JSON-RPC frame, and nothing else is on stdout. It runs when the CLI is built, as the existing spawned runs do (`mcp-stdout.spec.ts:28`).
- **SC-010** **Concurrency.** In `brief-tool.spec.ts`:
  - **Concurrent answers.** The precondition is the fixture `__fixtures__/mcp/brief/four-views.md`: P, C, S1, S2 (4 views) and S6 (all `raf`) are answered, so V1–V5 of each view (20 instances, none a prerequisite of another) are on the frontier in any call order. One server (`startInMemoryServer`) gets 20 `answer` calls through `Promise.all`, each with one of those answers and a distinct value. The resulting `BRIEF.md` parses with all 20 answers, and their rounds are 20 distinct consecutive numbers (FR-033 serializes the calls, FR-015 numbers them).
  - **No compiler lock.** While a compiler lock built with blocking hooks holds a `check`, a `status` call completes, so it does not wait on the lock.
  - **A hand edit during a write.** It is made in the `beforeRename` seam (FR-034). The call fails with kind `io` and the message "BRIEF.md changed while writing; call again". `BRIEF.md` holds the edit byte for byte, and no temp file is left in the directory.
- **SC-011** **Paths on Windows and Linux.** `brief-tool.spec.ts` asserts:
  - `directory` given with forward slashes, with backslashes (on Windows) and with the other drive-letter case (on Windows) resolves to the same `BRIEF.md`
  - `../outside` fails with kind `not-found`, and nothing is created outside the root
  - an R3 whose directory is not the brief's is rejected
  - a missing nested `directory` is created on first write

  The spec runs in CI on Linux and in the local gate on Windows.
- **SC-012** **Cold start.** `package-bin.spec.ts` "mcp answers initialize in under 3 s" (line 149) stays green. `tree.ts`, `engine.ts` and `brief-file.ts` import neither `effect/ai` nor `node:fs` (checked by a grep test in `brief-tree.spec.ts`). Only `tools/brief.ts` does I/O, and only inside a call.
- **SC-013** **Stale state.**
  - In `brief-tool.spec.ts`:
    - after a confirmed brief's P4 value is edited by hand, the next `status` reports `complete`
    - after a missing asset file named in V3 is created, A1 becomes not applicable on the next call, with no restart
  - **The restart** is measured across real processes, because `spikes.md` §4.1 measured that "Each call starts the MCP server again" (line 126). In `mcp-stdout.spec.ts`, or a new spawned spec, skipped when the CLI is not built like the existing spawned runs (`mcp-stdout.spec.ts:28`), with `spawnServer` (`mcp-test-client.ts:264`) in one temp project:
    - process A: two `answer` calls, then exit
    - process B: one `answer` call, then `status`
    - the recorded rounds are 1, 2, 3, and B's `status` returns the same state, round and counts as an in-process evaluation of the file

    An in-process restart (a second `startInMemoryServer`) may duplicate it as a fast test, but it does not count for this SC.
- **SC-014** **The checklist** (AGENTS.md "Task completion checklist"). These are clean:
  - `pnpm build`, `pnpm typecheck:tests`
  - `pnpm check` (0 errors, 0 warnings)
  - `pnpm test` (the shared-utils and extension specs included, FR-041), `pnpm test:coverage:ci` (no threshold regresses; the language thresholds are untouched because no language code changes). Both green on a 32-core workstation, with no 30 s timeouts in the spawn-heavy CLI specs: the `cli` package's vitest `maxWorkers` is capped at 8 (`packages/cli/vitest.config.ts`), and `smoke-determinism.spec.ts` "every format reports it" is one test per format (ruling T029)
  - `pnpm effect:check:cli`, exit 0. `--strict` fails on errors and warnings (`package.json:31`; AGENTS.md "Effect LSP"); messages are not gated.
  - `pnpm run check:examples`
- **SC-015** **Tool rules, one test per FR** (in `brief-tool.spec.ts` unless noted):
  - FR-001: `git ls-files .claude/workflows/presentation-assistant-phase.js` prints the path (a compliance command, not a vitest test).
  - FR-025: `max: 0` and `max: 21` each fail with a message naming 1–20, and `BRIEF.md` is not created.
  - FR-026: a `BRIEF.md` that is a directory gives kind `io`.
  - FR-027:
    - `status` with no file and no idea creates nothing, and `next` asks for the idea
    - a second, different idea leaves the stored idea unchanged
  - FR-028: a call whose answers are all rejected, and a call whose answers are all no-ops, each leave the file's bytes and mtime unchanged.
  - FR-029:
    - a blank `confirmation` is refused with `confirmation-missing`
    - re-confirming a confirmed brief leaves its bytes unchanged
  - FR-030:
    - the `header` matches `eligian <v> · eligius <v> · eligian_brief · <absolute BRIEF.md path>`
    - `next` has the specified text for `open`, `complete` and `confirmed`
    - `delegated` is absent while `open` and present when `complete` or `confirmed`
  - FR-031: an idea, answers and a confirmation message that each carry a sentinel string are passed to `summarizeArgs` and `summarizeResult`. The sentinel is absent from the JSON of both.
  - FR-033: a call on directory A is held in the `beforeRename` seam while a call on directory B completes. Then A is released and completes.
- **SC-016** **Kept answers stop the cascade** (FR-015, FR-016, FR-019 to FR-021). In `brief-engine.spec.ts` and `brief-tool.spec.ts`:
  - C1 is changed after S1 and S2 were answered: S1 is on the frontier with its old value as `previous`, and S2 is not stale
  - S1 re-sent unchanged gets `- reviewed: <n>` and keeps its `round`. It is not in the next round, and S2 and everything below stay answered
  - S1 re-sent with a changed value takes the call's round, loses `reviewed`, and S2 is on the frontier with `previous`
  - the call that reviews consumes a round: the next `answer` is `n + 1`
  - a V answer that is reviewed also gets the current basis
  - a `reviewed` answer is stale again when its prerequisite changes after the review
  - `parseBrief` and `writeBrief` round-trip the `reviewed` line, and the digest ignores it
- **SC-017** **`same as` is live** (FR-014). In `brief-engine.spec.ts`:
  - `V:b` = `same as a` is accepted while `a` has no V answers: `V1:b`…`V6:b` are waiting, not asked, and `a`'s are on the frontier
  - once `a`'s `Vn` is answered, `Vn:b` is settled and counts as answered; a V3 copied from `a` puts its entries in the asset list under `b`
  - `a`'s `Vn` is then changed: `Vn:b` follows at once, and neither `V:b` nor `Vn:b` is stale or on the frontier
  - an explicit `V2:b` overrides, and a chain (`a` is itself `same as`, also made by a hand edit) is `invalid-reference` on acceptance and makes `V:b` stale with a `reason` on evaluation
- **SC-018** **Recorded answers are re-validated** (FR-039). In `brief-engine.spec.ts`: after S2 drops a view that S3 names, S3 is stale with `previous` and a `reason`; after a missing asset file is deleted, A1's rows are stale with a `reason`; a re-send of the same invalid value is rejected with that reason; a corrected value settles it; the stale answer is still in the written file byte for byte.
- **SC-019** **Dormant answers** (FR-040). In `brief-engine.spec.ts` and `brief-tool.spec.ts`: after S2 drops to one view, S3's recorded answer stays in `BRIEF.md`, is counted `notApplicable`, is absent from `answered`, `delegated`, the reply's `delegated` list and the digest; a confirmed brief becomes `complete`; an `answer` for S3 is rejected `not-applicable`; when C3 loses and regains `keyboard`, I2 is on the frontier with its old value as `previous`; a hand edit restoring the value leaves it answered.
- **SC-020** **Canonical wire forms** (FR-005, FR-007). In `brief-engine.spec.ts`, per shape: the canonical form is accepted, and each variant of FR-005 (`"yes"` for S7, `"90"`, `"90s"`, `"1m30s"` for P5, a comma-separated string for C3, a record where a table is wanted, `"Self-Paced"` for C1, a number as a cell) is rejected `invalid-value` with a `message` that contains the expected form, and nothing is written for it.
- **SC-021** **S2 names are timeline names** (FR-038). `brief-tree.spec.ts` (SC-004) pins the S2 `ask`; in `mcp-brief-interview.spec.ts` the first round item for S2 has an `ask` that contains `timeline name`.
- **SC-022** **The facts probes** (FR-041, FR-042).
  - a shared-utils spec covers `findPackageManager`: a lockfile wins over the `packageManager` field, the walk goes up, the default is `npm`
  - `mcp-install-state.spec.ts` passes unchanged in behaviour
  - in `brief-tool.spec.ts`, with a fake `node_modules/eligian/package.json` (version `1.1.0`) and a `pnpm-lock.yaml`, a write puts `- eligian-installed: 1.1.0` and `- package-manager: pnpm` in `## Facts`, next to `- server-eligian:`; with neither, `- eligian-installed: -` and `- package-manager: npm`; an unreadable or invalid `package.json` gives `-` and does not fail the call
  - the `## Facts` lines are dropped on parse (SC-006)

## Edge cases

- **Windows and Linux paths.** `resolveInputPath` (`paths.ts:93`) normalizes backslashes and the drive-letter case. The semaphore key is lower-cased on Windows only, as `isInside` compares (`paths.ts:77–78`). Paths inside `BRIEF.md` (R3, the asset cells) are written with forward slashes. Asset cells resolve with `path.resolve` against the brief's directory, R3 against the project root. The file name is exactly `BRIEF.md`. On Linux a `brief.md` is not read; on Windows the file system's case-insensitivity makes it the same file.
- **Concurrency on the shared Langium services.** None: the brief engine never loads a document and never takes the `CompilerLock` (FR-032). Two brief calls on one directory serialize (FR-033). Two server processes on one project, or a person editing in an editor, are caught by the re-read before the rename (FR-034). The call that sees a changed file fails and asks to be called again, so an edit is never silently lost.
- **Stdout purity.** No `console.*` in `brief/*` or `tools/brief.ts`. A defect inside the handler goes through `catchDefects` (`errors.ts:91`) to the stderr logger and answers `internal` (FR-035, SC-009).
- **Missing files.** A missing `BRIEF.md` is an empty brief, not an error (FR-027). A missing directory is created on write (FR-026). A missing asset is a fact that makes A1/A2 apply (FR-012). A `BRIEF.md` that is a directory, or unreadable, is `ToolIoError`.
- **Stale caches.** There are none to go stale. `BRIEF.md` and the asset facts are re-read on every call, the round number comes from the file (FR-015), and the engine keeps no state between calls. SC-013 measures this across two processes. This matters because a client may restart the server on every turn (`spikes.md` §4.1: "Each call starts the MCP server again").
- **Cold start time.** The tree is static data built at import, with no I/O. The `brief-questions` chunk is produced at build time by the generator, not at server start (SC-012).
- **Hand edits.** A person may edit any answer. The edit is read as is, and a malformed one is ignored and reported, not lost (FR-020).
  - A hand-edited value does not change the answer's round, so it does not reopen dependents by round (FR-016). It does break the confirmation digest (FR-022). A hand edit that makes an answer invalid (FR-039) makes that answer stale, with a `reason`.
  - A hand edit to S2's or S6's row for a view changes that view's basis, so that view's V answers reopen.
  - A hand edit to `## Facts` is dropped on the next write.
- **A brief from a newer tree.** Ids the server does not know are ignored, reported and kept (FR-020). A higher `tree:` version is kept as is.
- **Large values.** No size limit beyond the MCP transport. A 10,000-character V2 text round-trips (covered by the SC-006 all-shapes brief).
- **The idea.** Stored verbatim. A multi-line idea round-trips through the blockquote. An idea passed when one is already stored is ignored, not merged.

## Existing components (verified)

| Component | File | What is reused (real exported signature) |
| --- | --- | --- |
| Server composition | `packages/cli/src/mcp/server.ts:68` | `makeServerLayer(options: ServerOptions): Promise<Layer<never, IllegalArgumentError, Stdio>>`; toolkit at `:109–118`, handler record at `:137–177`, `call`/`boundary` at `:95–136`; `versions = getCompilerVersion()` at `:72` |
| Server options | `server.ts:35–43` | `interface ServerOptions { cwd; docsRoot?; lock?; smoke? }` (`smoke?` is the test-seam model for FR-034's `brief?`) |
| Project root and path policy | `packages/cli/src/mcp/paths.ts:63`, `:81`, `:93` | `projectRoot(ai: EffectAi, cwd: string): Effect<ProjectRoot>`; `isInside(root: string, file: string): boolean`; `resolveInputPath(root: ProjectRoot, input: string): Effect<string, ToolNotFound>` |
| Tool errors | `packages/cli/src/mcp/errors.ts:14–29`, `:34`, `:76`, `:91` | `ToolNotFound`, `ToolIoError`, `ToolInternal` (`Data.TaggedError` with `{ message; path? }`); `ToolFailure` schema; `toToolError(op: 'read' \| 'write', path?) => (cause) => ToolError` (read ENOENT → `ToolNotFound`, other errno → `ToolIoError`); `catchDefects` |
| Tool context | `packages/cli/src/mcp/tools/check.ts:27` | `interface ToolContext { ai; cwd; docsRoot; versions; requestId }` (imported by `project.ts:50`) |
| Upfront annotation | `tools/check.ts:108`, `tools/docs.ts:114` | `.annotate(ai.Tool.Meta, { 'anthropic/alwaysLoad': true })`; `ai.Tool.Destructive`/`Idempotent` as in `tools/init.ts:85–86` (effect `ai/Tool.d.ts:1599`, `:1624`) |
| Telemetry | `packages/cli/src/mcp/telemetry.ts:28–33` | `withTelemetry(tool, args, run, summarizeResult?)` via the server's `boundary` |
| Compiler lock (not used, by design) | `packages/cli/src/mcp/compiler-lock.ts:59` | `class CompilerLock extends Context.Service`: referenced only to state FR-032 |
| Storyboard parser (model) | `packages/cli/src/mcp/storyboard.ts:66` | `readStoryboard(text: string): Storyboard`: the never-throw table parsing that `brief-file.ts` follows. Its cell splitter `cellsOf` (`:42`) is module-private; `brief-file.ts` may export and share it rather than copy it |
| Atomic write with retry | `packages/cli/src/dev/runtime-reports.ts:234` | `writeDevErrors(dir: string, file: DevErrorsFile): Promise<void>`: temp file and rename, retried on `EPERM`/`EBUSY`/`EACCES` with backoff, 20 attempts (`:221–251`); its loop is extracted to `writeFileAtomic` (FR-034) |
| Package manager probe | `packages/extension/src/extension/mcp/install-state.ts:163` (moves, FR-041) | `findPackageManager(folderPath: string): Promise<PackageManager>`, `type PackageManager = 'pnpm' \| 'yarn' \| 'bun' \| 'npm'`: to `@eligian/shared-utils` |
| Language codes | `packages/language/src/eligian-validator.ts:50` | `isValidLanguageCode(code: string): boolean` (regex `LANGUAGE_CODE_REGEX`, `compiler/constants.ts:34`), exported from `@eligian/language` (`index.ts:34`) |
| Knowledge generator | `packages/cli/scripts/generate-knowledge.ts:1155` | `generateKnowledge(options: GenerateOptions): Promise<{ files }>`; chunk list `:1173–1190`; generated-chunk model `domEventsChunk` `:781` |
| Chunk paths, AGENTS block | `packages/cli/src/mcp/instructions.ts:108`, `:134` | `chunkFile(entry: Pick<IndexEntry, 'id' \| 'kind'>): string`; `agentsMdBlock(index): string` |
| Chunk kinds | `packages/cli/src/mcp/knowledge/types.ts:7` | `ChunkKind` (`'reference'` used) |
| Semaphore | effect 4.1.4 `Semaphore.d.ts:217`, `:79` | `Semaphore.makeUnsafe(permits: number): Semaphore`; `semaphore.withPermits(n)(effect)` |
| In-process test server | `packages/cli/src/__tests__/mcp-test-client.ts:123` | `startInMemoryServer(options: ServerOptions): Promise<InMemoryServer>` |
| Spawned test server | `packages/cli/src/__tests__/mcp-test-client.ts:264` | `spawnServer(options?: { env?; preload?; cwd?; args? }): SpawnedServer` (`request`, `close`, `stdoutLines`; `BIN` at `:260`); used by SC-009 and SC-013 |
| Curriculum ids for `docs` | `packages/cli/src/mcp/knowledge/curriculum/*.md` frontmatter | `decisions`, `provider-choice`, `assets-and-host-modules`, `not-eligian`, `presentation-patterns`, `css-conventions`, `map-events-and-interactions`, `map-locales-and-languages`, `map-imports-and-assets`, `storyboard` (each `id:` line verified) |
| Workflow | `.claude/workflows/presentation-assistant-phase.js:85` | Exists (untracked): `ROADMAP = 'specs/059-presentation-assistant/roadmap.md'` |

## New components

| Module | Package | File | Public API sketch |
| --- | --- | --- | --- |
| Question tree | `eligian` (cli) | `packages/cli/src/mcp/brief/tree.ts` | `TREE_VERSION: 1`; `type BranchId = 'P'\|'C'\|'S'\|'V'\|'I'\|'D'\|'L'\|'A'\|'H'\|'X'\|'R'\|'W'`; `interface Shape { kind: 'text'\|'choice'\|'set'\|'yes-no'\|'duration'\|'view'\|'path'\|'record'\|'table'; options?; columns?; none?; alternatives?; rows? }`; `interface AnswerView { get(id: string): AnswerValue \| undefined }` (restricted to `reads`, FR-008); `interface Question { id; branch; title; ask; shape: Shape; needs: readonly string[]; reads: readonly string[]; appliesWhen: (a: AnswerView, assets: readonly AssetEntry[]) => boolean; docs: readonly string[]; facts: readonly string[]; since: number }`; `TREE: readonly Question[]`; `BRANCHES: readonly { id: BranchId; name: string }[]` |
| Engine | `eligian` (cli) | `packages/cli/src/mcp/brief/engine.ts` | `interface Answer { id; value: AnswerValue; by: 'user'\|'delegated'; round: number; reviewed?: number; basis?: string }`; `interface BriefState { idea?; treeVersion; confirmation?; answers: readonly Answer[] }`; `interface Facts { briefDir: string; exists(path: string): boolean; inside(path: string): boolean }` (paths relative to the brief's directory; `briefDir` relative to the root); `interface AssetEntry { key; kind: 'image'\|'video'\|'audio'\|'font'\|'other'; state: 'exists'\|'missing'\|'remote' }`; `evaluate(tree, brief, facts): Evaluation` (`{ state, frontier, counts, stale, dormant, delegated, assets }`; `stale` entries carry `previous` and, for FR-039, `reason`); `nextRound(brief): number` (FR-015); `viewBasis(brief, view): string` (FR-016); `pickRound(tree, evaluation, max): RoundItem[]`; `applyAnswers(tree, brief, facts, input: readonly AnswerInput[], round: number): { brief; rejected: Rejection[] }`; `confirm(brief, message, now: Date): BriefState`; `digest(answers): string` |
| Brief file | `eligian` (cli) | `packages/cli/src/mcp/brief/brief-file.ts` | `parseBrief(text: string): ParsedBrief` (never throws: `{ brief: BriefState; ignored: { line; reason }[]; kept: RawBlock[] }`); `interface FactsSnapshot { serverEligian: string; eligianInstalled: string \| undefined; packageManager: PackageManager \| undefined; textDirection: readonly { code; direction: 'ltr'\|'rtl' }[] \| undefined; assets: readonly AssetEntry[] }`; `writeBrief(tree, parsed: ParsedBrief, facts: FactsSnapshot): string` |
| Tool | `eligian` (cli) | `packages/cli/src/mcp/tools/brief.ts` | `NAME = 'eligian_brief'`; `DESCRIPTION`; `Parameters`, `Success` (effect `Schema`); `makeTool(ai)`; `summarizeArgs`, `summarizeResult`; `interface BriefToolOptions { beforeRename?: (target: string) => Promise<void> }` (`ServerOptions.brief`); `handle(params, context: ToolContext & { briefLocks: BriefLocks; options?: BriefToolOptions }): Effect<Success, ToolError>`; `makeBriefLocks(): BriefLocks` |
| Package manager probe | `@eligian/shared-utils` | `packages/shared-utils/src/` (new module, exported from `index.ts`) | `findPackageManager(folderPath: string): Promise<PackageManager>`; `type PackageManager` (FR-041) |
| Atomic write helper | `eligian` (cli) | extracted from `packages/cli/src/dev/runtime-reports.ts` (the plan picks the module) | `writeFileAtomic(target: string, text: string): Promise<void>` |
| Docs chunk | `eligian` (cli) | `generate-knowledge.ts` (`briefQuestionsChunk()`) | Writes `generated/brief-questions.md` |
| Tests | `eligian` (cli) | `src/__tests__/brief-tree.spec.ts`, `brief-engine.spec.ts`, `brief-file.spec.ts`, `brief-tool.spec.ts`, `mcp-brief-interview.spec.ts` (and a spawned restart run, SC-013); fixtures `__fixtures__/mcp/brief/personas/{terse,detailed,vague}.json` (values, delegated marks, `script: { afterRound, answers }[]`), `__fixtures__/mcp/brief/example.md` (the golden file), `__fixtures__/mcp/brief/four-views.md` (SC-010), `__fixtures__/mcp/brief/tree-v2.ts` | See SC-002 to SC-015 |

## Example `BRIEF.md`

This is the golden fixture of SC-006, written with the facts snapshot: server eligian `1.1.0`, installed eligian `1.1.0`, package manager `pnpm`, L1 not answered, and `media/demo.mp4` missing. The `basis` values are the FR-016 digests of the rows shown. For example, `demo`'s is the SHA-256 of `[{"name":"demo","purpose":"The product at work"},{"view":"demo","provider":"video","source":"media/demo.mp4"}]`, cut to 16 hex characters. They were computed with `node:crypto` in this session.

```markdown
# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> A short product tour in English and Dutch,
> three screens, with a video on the second.

- tree: 1
- state: open
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: user
- round: 1

Know the three features and sign up for the trial.

### P5: How long should it take to watch?

- by: delegated
- round: 1

90s

## C: Context of use

### C1: How is it used: self-paced on a web page, led by a presenter, an unattended loop, or embedded in an app?

- by: user
- round: 1

self-paced

### C4: Is sound heard, or must it work muted?

- by: user
- round: 1

on

## S: Structure

### S1: Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece?

- by: user
- round: 2

slide-deck

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| intro | The promise |
| demo | The product at work |
| signup | The call to action |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: user
- round: 4

| view | provider | source |
| --- | --- | --- |
| intro | raf | - |
| demo | video | media/demo.mp4 |
| signup | raf | - |

## V: One copy per view

_One section per view below._

## View: intro

_No answers yet._

## View: demo

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: user
- round: 5
- basis: 4a3055a743c8484e

| element | kind | file |
| --- | --- | --- |
| Product video | video | media/demo.mp4 |
| Feature list | list | - |

## View: signup

### V: same as

- by: user
- round: 5
- basis: 23a0aa8fc1af8ff6

same as intro

## I: Interaction

_No answers yet._

## D: Visual design

_No answers yet._

## L: Languages

_No answers yet._

## A: Assets

_No answers yet._

## H: Custom behaviour

_No answers yet._

## X: Accessibility

_No answers yet._

## R: Delivery

_No answers yet._

## W: Working agreement

_No answers yet._

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.1.0
- eligian-installed: 1.1.0
- package-manager: pnpm
- text-direction: -

| asset | kind | state |
| --- | --- | --- |
| media/demo.mp4 | video | missing |
```

(The V3 `Product video` row and S6's `demo` source name the same file, so they are one entry, FR-012. `Feature list` is a `list` with no file, so it is not an asset.)

## Differences between the roadmap and the code (found while verifying)

1. **The workflow is already cloned.** Roadmap §8 "Day 1: clone the workflow". The file exists, untracked, with the right paths (line 85). Phase 1 only commits it (FR-001).
2. **`mcp-search.spec.ts` does not pin the tool list.** Its `toHaveLength(8)` (line 143) is `searchIndex`'s default hit limit, and its only `eligian_` mention is in a comment (line 3). It needs no change.
3. **`mcp-instructions.spec.ts` needs no change in Phase 1.** It pins the instructions text, which Phase 3 changes (§8 Phase 3 touches `instructions.ts`). Its "names all eight tools" test (line 137) checks the eight tools the text names. The instructions do not name `eligian_brief` until Phase 3.
4. **More pins than the roadmap lists.**
   - The `tools-list-phase3.json.snap` file snapshot (`mcp-server.spec.ts:142`).
   - The annotations test (`:153–174`), whose `UPFRONT` set becomes four.
   - "upfront descriptions ≤ 1000" (`:187–195`), whose `toHaveLength(3)` (`:192`) becomes 4.
   - `mcp-knowledge.spec.ts`'s exhaustive `REFERENCE_CHUNKS` (`:524–535`, `:652`), which must gain `brief-questions`.
   - The root `AGENTS.md:49` "Eight tools" line.
5. **Applies-when rules read outside their declared needs.** V6 → C3, D8/A5 → V3, A4 → V3, and the asset rules → V3, S6, D3. Resolved by FR-003 (R-2).
6. **W1 sits before W2 and W3 in §3.13's table but needs them.** Tree order is therefore not a topological order. The engine sorts topologically (FR-015) and does not rely on table order.
7. **S6 names no media file**, yet §3.9 counts assets "named in … S6". Resolved by R-3.
8. **The package manager and the installed version are probed in Phase 1** (R-4, FR-041, FR-042). `findPackageManager` is in the extension (`install-state.ts:163`), which the CLI does not import, so it moves into `@eligian/shared-utils`. The project inventory is still left to `eligian_project` and adoption (§4.4, Phase 2). The server's own version is written as `- server-eligian:`, not `eligian:`.
9. **Phase 1 touches `packages/cli/src/dev/runtime-reports.ts`**, which the roadmap does not list. The reason is reuse: `BRIEF.md` needs the same Windows-safe rename retry that `writeDevErrors` has (FR-034). The change only moves its loop into a shared helper.

## Open questions

None. Roadmap §4.6 defers the exact `BRIEF.md` layout to this spec, and FR-019 fixes it. Everything else in this phase is decided in the roadmap (§9 decisions 3, 5, 6 and 9 apply here). The readings R-1 to R-10 above are this spec's interpretations, open to the clarify scan; The clarifications of 2026-11-19 (below) ruled on the ones most worth a ruling.

## Review notes

- **SC-002 item 6 (round bound), issue "detailed ≤ 10": partly rejected.** The detailed persona as specified has 71 applicable question instances (SC-002). At 7 per round that is at least ⌈71/7⌉ = 11 rounds, and W1 needs every other answer, so it is asked alone at the end. Asserting `rounds ≤ 10` is therefore impossible for this persona, and the roadmap's 8–10 is an estimate (§3.14 "an estimated"). The bound is kept, but it is now derived from the instance count and justified (⌈(n − 1)/7⌉ + 2 = 12), not unexplained slack. Every persona loop is also capped at 20, and compliance.md logs each measured count against 8–10.
- **FR-012, issue "every D3 row": narrowed.** A `system` font row is left out of the asset list. With file `-` it would count as a missing asset, and A1 would ask who delivers Arial. `project` and `cdn` rows are in, and `cdn` rows are remote, as the issue asks.
- **FR-034, issue "drop runtime-reports.ts": partly rejected.** The recompute is dropped, as suggested: a changed file fails the call with `ToolIoError`. The extraction from `writeDevErrors` stays, because the repo's reuse-first rule forbids a second copy of its measured rename retry (`runtime-reports.ts:213–220`, the comment that records the measured EPERM failures). The change is limited to moving the loop, and the dev-server spec's `vi.mock` keeps working. It is listed under "Differences" item 9.
- **Persona `terse`, two issues that pull in opposite directions.** One issue asks that `terse` match §7.2 ("accepts every recommendation", `by: user`, with a few "you decide"). The other notes that the server sends no recommendation. Both are applied: values are fixed in `terse.json`, most are recorded `by: user`, and D2, V2 and W1 are delegated. SC-002 item 3 checks the mix.
- **Facts in `BRIEF.md` (R-4), issue option (a) vs (b).** Option (a) is applied for the facts the server computes. The package manager and the installed version, first deferred, were decided into Phase 1 by clarification Q8 (FR-041, FR-042).

## Clarifications

### Session 2026-11-19

- Q1: When a stale answer is re-sent unchanged, does it reopen its dependents? Decision: no. A kept answer is settled by a new `- reviewed: <n>` line and keeps its `round`; only a value change advances `round`; staleness compares a prerequisite's `round` with the dependent's `max(round, reviewed)`; dependents reopen only below an answer that actually changed. [FR-015, FR-016, FR-019, FR-020, FR-021, SC-005, SC-006, SC-016]
- Q2: What does `V:<name>` = `same as <other>` mean? Decision: a live reference. Each `Vn:<name>` takes `<other>`'s current `Vn` answer at every evaluation; a copy is settled only where `<other>`'s answer is settled (waiting otherwise); each copied instance counts as answered; changes to `<other>` flow through without reopening `<name>`. [FR-014, SC-005, SC-017]
- Q3: Are recorded answers re-validated on every evaluation? Decision: yes. Shape and cross-references are re-checked against the current answers and facts; an answer that no longer validates counts as stale and returns to the frontier with `previous` and the reason. [FR-039, FR-016, FR-030, SC-018]
- Q4: What happens to a recorded answer whose question stops applying? Decision: it is kept in `BRIEF.md` but left out of the counts, the `delegated` list and the FR-022 digest; when the question applies again it returns with its old value as `previous`. [FR-040, FR-022, FR-030, SC-019]
- Q5: Which JSON forms does `value` accept? Decision: strict, one canonical form (top-level yes/no a JSON boolean, P5 a JSON number, sets arrays, records objects, tables arrays of records); anything else is `invalid-value` with a message that shows the expected form. [FR-005, FR-007, SC-020]
- Q6: Is an S2 view `name` the timeline name? Decision: yes, matched case-sensitively in Phase 2; the S2 `ask` says so and the FR-006 pattern stays. [FR-038, FR-006, SC-004, SC-021]
- Q7: Keep the per-view `basis` digest? Decision: yes, `- basis: <16 hex>` (SHA-256 of the view's S2 and S6 rows) on every V answer, as specified and pinned in the golden fixture. [FR-016, FR-019, SC-006]
- Q8: Which facts does `## Facts` hold? Decision: add the probes now. `findPackageManager` moves into `@eligian/shared-utils` (the extension imports it from there), the project's `node_modules/eligian/package.json` version is read, and `- eligian-installed:` and `- package-manager:` are recorded; the server version line is renamed `- server-eligian:`. [FR-041, FR-042, FR-019, SC-006, SC-022]

### Session 2026-11-19 (plan review)

- P7: Which values does the strict form reject so that `BRIEF.md` round-trips? Decision: a string with `\r`, a cell with a line break, a path with a backslash, and empty text are `invalid-value`, named in FR-005. The round-trip guarantee of FR-021 stays exact. [FR-005, FR-021, SC-006, SC-020]
- P8: How is the idea stored? Decision: the first `status` or `answer` call that carries an idea stores it when the brief has none, CRLF converted to LF; it is never replaced. [FR-027]
- P2: Is a `max` outside 1–20 a protocol error? Decision: yes, the parameters schema rejects it as JSON-RPC `-32602` with a message naming 1 and 20, as for the other tools' parameters. [FR-025]
- P14: Does the root AGENTS.md tools list change? Decision: yes, line 97 joins line 49 in FR-037. [FR-037]
- AnswerView: rules that read a per-view (V) question get the copies' values through `copies(id): readonly AnswerValue[]` beside `get(id)`. Recorded in compliance.md as a task-level reading. [FR-003, FR-008]
- README and CHANGELOG: no entry in Phase 1; Phase 3 documents the feature (the spec's non-goals). [Scope and non-goals]

### Session 2026-11-19 (build: T029, T030)

- T029: CLI specs that spawn the CLI timed out at 30 s under the full parallel run (one worker per core, 32 here; main already failed 2 of them). Decision: cap `maxWorkers` at 8 in `packages/cli/vitest.config.ts`, and split `smoke-determinism.spec.ts` "every format reports it" (four spawns, 17.5 s alone) into one test per format. No timeout is raised. Measured: `--project cli --project cli-timed` 2120 passed, 0 failed, 201 s. [SC-014]
- FR-014: does `same as <other>` wait for S6? Decision: yes; the spec is reworded to "once S2 and S6 are answered", the code (`SAME_AS.needs: ['S2', 'S6']`) is unchanged. [FR-014]
- T009: a cell with leading or trailing spaces? Decision: rejected `invalid-value`, listed in FR-005 beside the P7 rejections. [FR-005, FR-021]
- T022: when is a rejected answer re-asked? Decision: in any later round the ranking chooses, not necessarily the next. [SC-002 `vague` persona]
- T018: a bad `max` on protocol 2025-11-25? Decision: a tool result with `isError`, recorded in FR-025 beside the 2025-06-18 `-32602`. [FR-025]
