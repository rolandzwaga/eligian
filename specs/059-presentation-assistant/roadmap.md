# Roadmap: presentation assistant, the brief interview (spec 059)

Audience: engineers and agents implementing it in `f:\projects\eligius\eligian` through a phase workflow (stages `specify` → `plan` → `build` per phase; see AGENTS.md "Feature phases"). The workflow script is a clone of `.claude\workflows\mcp-server-phase.js` with its two paths changed (`ROADMAP`, `DIR`); cloning it is the first task of Phase 1.

Facts below were checked against the repo on 2026-11-19 (CLI `eligian` 1.1.0, `effect` 4.1.4, eight MCP tools, server instructions 2,415 of 4,096 characters, 14 eval cases). Four claims that could not be verified from the repo were settled by spikes on the same day; their results are in `spikes.md`. What is still unverified is marked **[UNVERIFIED]** and carries the test that settles it.

This roadmap builds on spec 058 (`specs\058-mcp-server\roadmap.md`), which made the MCP server (`eligian mcp`) an Eligian language expert. Spec 058's workflow starts from an idea and goes straight to a storyboard. Whatever the idea leaves out, the agent fills in silently: the styling, the languages, the navigation, what happens when a view ends.

---

## 1. Goal, non-goals, success criterion

### Goal

The MCP server makes the agent interview the user before it generates anything, and generation starts only when every aspect of the presentation is settled and the user has confirmed it.

The interview follows the grilling method (`github.com/mattpocock/skills`, `skills/productivity/grilling/SKILL.md`). The decisions of a presentation form a tree: each decision unlocks the decisions that depend on it. The agent asks in rounds. A round holds the questions whose prerequisites are already settled, each with the agent's recommended answer, worded so that "yes" accepts it. The agent looks up facts itself and puts only decisions to the user. The interview is done when no question is left, and nothing is acted on until the user confirms.

The server adds what a skill or a prompt cannot: it owns the tree, it records every answer in the project, and its generation tools refuse to run until the record is complete and confirmed.

### Terms

- **Brief**: the record of every decision about one presentation, in `BRIEF.md` next to the program.
- **Question**: one decision in the tree. It has an id, prerequisites, a rule for when it applies, and an answer shape.
- **Frontier**: the questions that apply, are not answered, and whose prerequisites are all answered.
- **Round**: the part of the frontier the agent asks in one message.
- **Delegated answer**: the user answered "you decide". The agent's choice is recorded and marked as delegated.
- **Confirmed**: the frontier is empty and the user has confirmed the brief.
- **Approved**: the brief is confirmed and the user has approved the `STORYBOARD.md` the agent drafted from it. Generation starts here.
- **Generation tools**: `eligian_init`, `eligian_check`, `eligian_fmt`, `eligian_compile`, `eligian_smoke`.
- **Addition**: a new view, a new language or a first host module in a presentation that already exists.
- **Adopted brief**: a brief for a presentation that was built without one, reconstructed from its code and confirmed by the user.

### Non-goals

- The server does not talk to the user during the interview. The agent asks; the server only says what to ask and records the answers. The one exception is the sign-off (§5).
- The CLI is not gated. `eligian check`, `compile`, `smoke`, `fmt` and `dev` in a terminal run as today, for people and for CI. On a program whose brief is not approved they print one warning line on stderr and change nothing else: not the exit code, not the output (§4.5; §9, risk 2).
- No change to the Eligian language, the compiler or the engine.
- Existing presentations do not need a brief. A project that already has `.eligian` files and no `BRIEF.md` works as today, except for additions (§4.3). Giving one a brief afterwards is an opt-in (§4.4).
- The brief does not stay binding after approval. Once the presentation is built, `STORYBOARD.md` is the living document; a program that drifts from an approved answer is neither refused nor reported. Only additions need a new interview.
- No brief editor in the VS Code extension. `BRIEF.md` is Markdown; the user edits it in any editor.
- The server does not write copy, choose colours or draft the storyboard. The agent does, from the brief.

### Success criterion

- **No generation before approval.** In every interview eval run (§7.2), no generation tool call succeeds and no `.eligian` file exists in the project before the brief is approved.
- **Nothing assumed.** Every fact on the eval's persona sheet is in `BRIEF.md` at approval, and every answer in `BRIEF.md` is either the user's or marked delegated.
- **Facts are not asked.** The agent asks the user zero questions that `eligian_project` or the file system answers.
- **Every question comes with a recommendation.** Measured by the harness on the agent's round messages.
- **Generation quality holds.** The 14 existing eval cases pass their gate at the same rate as before, when they start from an approved brief (§7.1).

---

## 2. How the server can force the interview

An MCP server has four ways to shape what an agent does. They differ in strength.

| Lever | What it does | Limit |
| --- | --- | --- |
| Server `instructions` and prompts | Tell the agent to interview first | Advice only. An agent can skip it. A skill pasted into the client has the same limit. |
| Tool results | The generation tools refuse and return the open questions | Works in every client. The server cannot stop an agent from writing files with its own editor, or from running the CLI in a terminal. |
| Elicitation (`elicitation/create`) | The server asks the user directly, in a dialog the client shows | The answer cannot be invented by the agent. Forms are flat (strings, numbers, booleans, enums), and client support varies. |
| Claude Code plugin hook | Blocks the agent's file writes | A hard stop, in Claude Code only. |

The design uses all four:

1. **Tool results are the main lever.** A new tool, `eligian_brief`, hands out rounds and records answers. The generation tools refuse until the brief is approved, and each refusal carries the next round. No model was trained on Eligian, so an agent cannot get a program right without `eligian_check`; a refused check sends it back to the interview.
2. **Elicitation is used for the two sign-offs only** (brief confirmation, storyboard approval). A form cannot carry recommendations or follow-up, so it is a poor interviewer, but it is the one channel where the user's "yes" reaches the server without passing through the agent. `effect` 4.1.4 has `McpServer.elicit` and `McpServer.clientCapabilities`. Clients without elicitation use a fallback (§5).
3. **The instructions, the prompt and a docs chunk** teach the round format, so the agent interviews well and does not only get blocked.
4. **The Claude Code plugin** (`plugins\claude\eligian\`) gets a hook that blocks creating program files before approval (§6.3).

Every target client supports form elicitation (`spikes.md` §1): Claude Code (measured: it announces `elicitation: { form, url }`), Cursor since 1.5, VS Code Copilot agent mode since 1.102, Codex CLI since 0.119.0. Two limits shape the design:

- Codex does not render number fields or multi-select enums; a form that has one falls back to a bare accept or decline. The sign-off forms therefore use only boolean and string fields.
- An elicitation has four outcomes, not two: accepted, declined, cancelled (no one can be asked: a headless run, VS Code Autopilot, some Codex approval policies) and no answer (a reported Cursor fault on Windows where the dialog never shows). The server puts a time limit on every elicitation and tells the four apart (§5.1).

Measured in Claude Code (`spikes.md` §1.2, §4.2): the dialog shows a checkbox for a boolean field; an accepted form arrives as the decoded value, a decline as the `ElicitationDeclined` failure, and a cancel as an interruption of the effect. The sign-off code handles all three, plus the time limit.

---

## 3. The question tree

The tree is data in the server (`packages\cli\src\mcp\brief\tree.ts`): one entry per question with its id, branch, title, what to ask, answer shape, prerequisites, applies-when rule, and the doc ids the agent reads to form its recommendation. A spec test checks that ids are unique, prerequisites form no cycle, applies-when rules read only earlier answers, and every doc id exists. A generated docs chunk (`brief-questions`) lists the tree, so the documentation cannot drift from the data.

There are 63 questions in 12 branches. Branch V repeats for every view the user lists in S2.

### 3.1 Never asked: facts

The server or the agent looks these up. They are recorded in the brief as facts, not as answers.

- What the project already contains: layout ids, CSS classes and custom properties, locale keys, asset files, host module declarations (`eligian_project`).
- Whether a named asset file exists.
- The text direction of each language (from its language code).
- The installed `eligian` version and the package manager.

The duration of a media file is not a fact yet: nothing reads media headers (spec 058 open question 12). Until that exists it is asked in V5.

### 3.2 Branch P: purpose

No prerequisites.

| id | Question | Answer |
| --- | --- | --- |
| P1 | What should a viewer know, feel or do afterwards? | text |
| P2 | What does the last screen ask of the viewer? | text, or none |
| P3 | Who watches, and what do they already know? | text |
| P4 | What tone: formal, playful, technical, …? | text |
| P5 | How long should it take to watch? | duration, or viewer-paced |

### 3.3 Branch C: context of use

No prerequisites.

| id | Question | Answer |
| --- | --- | --- |
| C1 | How is it used: self-paced on a web page, led by a presenter, an unattended loop, or embedded in an app? | one of four |
| C2 | On which devices, and which is the main one? | set of desktop, tablet, phone, large screen; one primary |
| C3 | Which inputs: mouse, touch, keyboard, clicker? | set |
| C4 | Is sound heard, or must it work muted? | on, off, both |
| C5 | Online, or must it run offline? | one of two |

### 3.4 Branch S: structure

| id | Question | Answer | Needs | Applies when |
| --- | --- | --- | --- | --- |
| S1 | Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece? (doc `decisions`) | one of five | C1, P5 | always |
| S2 | Which views are there: a name and a one-line purpose for each, in order? | list | S1 | always |
| S3 | Which view opens first? | a view | S2 | more than one view |
| S4 | From each view, where can the viewer go, and how? | table: view, target, trigger | S2, C3 | more than one view |
| S5 | When a view's timeline ends: stay, advance, loop, or return to the hub? | per view | S2, C1 | always |
| S6 | What drives each view's time: `raf`, `video`, `audio`, `scroll`? (doc `provider-choice`) | per view | S2, C4 | always |
| S7 | Is there a Start button before media with sound? | yes or no | S6 | a view uses `video` or `audio` and C4 is not off |
| S8 | After the last view: stay, restart, or loop? | one of three | S2, C1 | always |

### 3.5 Branch V: one copy per view

Needs S2 and S6. A view may answer the whole branch with `same as <view>`, so a deck of similar slides does not repeat six questions per slide.

| id | Question | Answer | Applies when |
| --- | --- | --- | --- |
| V1 | What is the one thing this view says? | text | always |
| V2 | What is every text on it, word for word? | text, or delegated (the agent drafts, the user approves it in the storyboard) | always |
| V3 | What is on screen besides text: images, video, lists, figures, buttons? | list | always |
| V4 | What appears, changes and disappears, in what order, and what stays to the end? | text | always |
| V5 | How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list? | duration and one of three, or no timed events (a hub that waits for a click) | always |
| V6 | Which elements react to a click or hover, and what does each do? | list, or none | C3 has mouse or touch |

### 3.6 Branch I: interaction

| id | Question | Answer | Needs | Applies when |
| --- | --- | --- | --- | --- |
| I1 | Which transport controls: play, pause, restart, seek, and where are they? | set and place, or none | S6, V5 | a V5 answer has a duration |
| I2 | Which keys do what? | table: key, action | S4 | C3 has keyboard |
| I3 | Is progress shown: a bar, a slide counter, a chapter menu? | set, or none | S2 | always |
| I4 | When the viewer returns to a view: restart at 0, or resume? | one of two | S4 | more than one view |
| I5 | Are touch gestures (swipe) needed? They are not built in and need a host module. | yes or no | C3 | C3 has touch |

### 3.7 Branch D: visual design

| id | Question | Answer | Needs | Applies when |
| --- | --- | --- | --- | --- |
| D1 | Is there a brand guide, a design system, CSS or a site to match? | reference, or none | P4 | always |
| D2 | Which colours (background, text, accent), and light, dark or both? | palette | D1 | always |
| D3 | Which fonts, from where (system, files in the project, a CDN), under which licence? | list | D1, C5 | always |
| D4 | A fixed-ratio stage scaled to the window (which ratio), or a fluid layout (which breakpoints)? | one of two, with detail | C2 | always |
| D5 | Which layout does each view use: title, two columns, full-bleed media, …? | per view | S2, D4 | always |
| D6 | Which motion: kinds of transition, durations, easing, how expressive? | text | P4 | always |
| D7 | Under reduced-motion settings: shorten or remove transitions, or keep them? | one of three | D6 | always |
| D8 | Which imagery: photos, illustrations, icons, and from where? | text, or none | D1 | a V3 answer lists images |

### 3.8 Branch L: languages

| id | Question | Answer | Needs | Applies when |
| --- | --- | --- | --- | --- |
| L1 | Which languages, and which is the default? | list of language codes, one default | P3 | always |
| L2 | Who supplies each translation, and when? | per language | L1 | more than one language |
| L3 | Where does the viewer switch language, and what does the switch look like? | text | L1 | more than one language |
| L4 | Which assets differ per language: audio, video, subtitles, images with text? | list, or none | L1, V3 | more than one language and any asset |
| L5 | Do the cue times differ per language? | yes with source, or no | L4 | L4 is not none |

### 3.9 Branch A: assets

One row per asset named in V3, S6 or D3.

| id | Question | Answer | Needs | Applies when |
| --- | --- | --- | --- | --- |
| A1 | For each asset that does not exist yet: who delivers it, and when? | table | V3 | an asset is missing |
| A2 | May the build use placeholders for missing assets, and of what kind? | yes with kind, or no | A1 | an asset is missing |
| A3 | Which licence or credit lines must be shown? | list, or none | V3 | any asset |
| A4 | For video and audio: poster image, captions track, loop, muted start? | per file | S6 | a view uses `video` or `audio` |
| A5 | What is the alt text of each meaningful image? | per image, or delegated | V3 | a V3 answer lists images |
| A6 | Are the files in the project, or at remote URLs? | one of two | C5 | any asset |

### 3.10 Branch H: custom behaviour

| id | Question | Answer | Needs | Applies when |
| --- | --- | --- | --- | --- |
| H1 | Does anything need code beyond the built-in operations: analytics, charts, form input, external data, gestures? (docs `assets-and-host-modules`, `not-eligian`) | list, or none | V4, V6, I5 | always |
| H2 | Is content loaded at run time, and from where? | source, or static | H1 | H1 lists external data |
| H3 | Which events are tracked, where do they go, and is consent needed? | text | H1 | H1 lists analytics |

### 3.11 Branch X: accessibility

| id | Question | Answer | Needs | Applies when |
| --- | --- | --- | --- | --- |
| X1 | Which target: WCAG 2.2 AA, best effort, or none stated? | one of three | C1 | always |
| X2 | Must every interaction work with the keyboard alone? | yes or no | I2, V6 | always |
| X3 | On a view change: move focus, and announce the view to screen readers? | yes or no, each | S4 | more than one view |
| X4 | Captions or a transcript for speech? | one of three | S6 | a view uses `video` or `audio` |
| X5 | A pause control for content that advances by itself? | yes or no | S5 | an S5 answer is advance or loop |

### 3.12 Branch R: delivery

No prerequisites except where noted.

| id | Question | Answer | Needs |
| --- | --- | --- | --- |
| R1 | Where does it run: a standalone page (`--bundle`), inside an existing site or app, or an offline bundle? | one of three, with detail | C1, C5 |
| R2 | Which browsers? | evergreen, or a list | none |
| R3 | Which directory and entry file name? | path | none |
| R4 | Are any actions shared with other presentations (a library file)? | yes or no | none |

### 3.13 Branch W: working agreement

| id | Question | Answer | Needs |
| --- | --- | --- | --- |
| W1 | What may the agent decide on its own during the build, beyond the delegated answers? | text, default nothing | all other branches |
| W2 | When does the user look: after the first view, or only at the end? (The storyboard approval is fixed.) | one of two | S2 |
| W3 | What is "done" beyond the tools passing? | text | none |

### 3.14 Rounds

A round is at most 7 questions (decided; the `max` parameter, 1 to 20, changes it for one call). The grilling method asks the whole frontier at once; 7 keeps each message answerable in one go. When the frontier is larger, the server picks the questions that unlock the most others. The first frontier holds 14 questions (P, C, R2 to R4, W3). An interview for a three-view deck in two languages is an estimated 8 to 10 rounds.

---

## 4. Tool surface

### 4.1 `eligian_brief` (new, the ninth tool)

Loaded up front (`anthropic/alwaysLoad`), because it is the entry point for a new presentation.

Parameters:

- `directory`: the presentation's directory, default the project root. The brief is `<directory>\BRIEF.md`.
- `action`: `status`, `answer`, `confirm`, `approve-storyboard` or `accept-existing` (§4.2).
- `idea`: the user's idea, verbatim. Stored in the brief header on the first call.
- `scope`: `presentation` (default), an addition: `{ addition: 'view' | 'language' | 'host-module', name }` (§4.3), or `adopt` (§4.4).
- `answers` (for `answer`): a list of `{ id, value, delegated? }`. A delegated answer still carries a `value`: the agent's choice.
- `max`: the round size.
- `confirmation` (for `confirm` and `approve-storyboard`, only when the client has no elicitation): the user's confirming message, verbatim.

Reply:

- `state`: `open`, `complete`, `confirmed` or `approved`.
- `round`: the questions to ask now. Each has `id`, `title`, `ask`, `shape`, `docs` (ids to read for the recommendation) and `facts` (what to look up first).
- Counts: answered, delegated, open, waiting on prerequisites, not applicable.
- `rejected`: answers the server did not accept, each with the reason.
- `next`: one instruction, for example "Ask the user these 7 questions in one message, each with your recommended answer worded so that yes accepts it; then call `eligian_brief` with `action: answer`."

Rules:

- An answer is accepted when its question applies and its prerequisites are answered, by an earlier call or by the same call. So what the user volunteers in the idea can be recorded at once, in dependency order.
- The server validates shape and cross-references: the default language is one of the languages, the entry view is one of the views, every navigation target is a view, a duration is a number.
- A rejected answer does not block the accepted ones.
- `confirm` is refused while the frontier is not empty.
- `approve-storyboard` is refused until the brief is confirmed and `STORYBOARD.md` passes the checks in §5.2.

### 4.2 The gate on the generation tools

The gate is evaluated per program file (a file with a timeline; `library` files are not presentations and are not gated).

The gate needs to know which programs are **known**: existing work, or work that went through a brief. The server keeps that record in the project, in `.eligian\programs.json` (the `.eligian\` directory ignores itself in git; `eligian dev` already writes there). The record lists each known program with its timeline names, its languages and whether it has an `extensions` block (a text scan, no compiler).

- The first time the server runs in a project there is no record. It scans the project for `.eligian` files and records them all as known: that is the existing work.
- From then on a program enters the record only when its brief is approved, when an addition to it is approved, or when the user accepts it as existing work (below).
- The record survives a restart of the server. A baseline in memory would not: a client that restarts the server (a new session, or every turn of a headless run; `spikes.md` §4.1) would turn a program written without an interview into existing work.

The scan covers the server's working directory at process start, which is the project in every launch form that `eligian init` writes and in Claude Code (`spikes.md` §2). When the first tool call shows an announced root outside it, that root is scanned then; `effect` 4.1.4 has no earlier hook.

**Accepting existing work.** A program can arrive without the agent: the user wrote it by hand, or `git pull` brought it. `eligian_brief` with `action: accept-existing` and the paths asks the user to confirm (as in §5.1) and adds them to the record. A renamed timeline shows as a new one; the same action covers it.

| Situation | Result |
| --- | --- |
| The file is known and no `BRIEF.md` governs it | runs as today, unless it contains an addition (§4.3) |
| The file is not known and no `BRIEF.md` governs it | refused: `brief-required`; the reply names `accept-existing` for work that did not come from the agent |
| A `BRIEF.md` governs it and its frontier is not empty | refused: `brief-incomplete` |
| The brief is complete or confirmed, the storyboard not approved | refused: `brief-not-confirmed` or `storyboard-not-approved` |
| The brief's answers changed after confirmation | refused: `brief-changed`; re-confirming shows only the changed answers |
| Approved | runs, unless it contains an addition (§4.3) |

`eligian_init` follows the same table for its target directory, with every starter (the `library` starter writes a `main.eligian` with a timeline, so it is gated too). Today's order stays: brief, storyboard, then `eligian_init`.

`eligian_docs`, `eligian_operations` and `eligian_project` are never gated: the agent needs them to find facts and form recommendations. `eligian_project` gains a `brief` section (state, counts, next step).

A refusal is a tool failure of a new kind, `gate` (today's kinds are `not-found`, `io`, `timeout`, `cancelled`, `internal`). It carries the code, the brief's state and the next round, so one refused call gives the agent everything it needs to continue the interview.

### 4.3 Additions to an existing presentation

Edits to an existing presentation are not gated: copy, beats, styling and interactions inside existing views. Three changes are additions and need a short interview first:

1. a timeline whose name is not in the record of known programs (or, in a briefed project, not in the approved storyboard);
2. a language code that is not in that record;
3. an `extensions` block where there was none.

For an addition the generation tools refuse with `addition-not-briefed` and the scoped round:

- **A view:** branch V for that view, its rows of S4, S5, S6 and D5, its assets (branch A), and I4.
- **A language:** L2 to L5 for that language.
- **A host module:** branch H.

Everything else is read from the existing code as facts. The answers go into `BRIEF.md` under an `## addition` section; in a project that had no brief, the file is created with only that section. The addition is confirmed and its storyboard section approved in the same way as a whole brief.

The list of three triggers is decided. A new interaction or a new asset inside an existing view is an edit, not an addition.

### 4.4 Adopting an existing presentation (opt-in)

A presentation that was built without a brief can get one afterwards. Nothing requires it: the user asks for it, and the agent calls `eligian_brief` with `scope: adopt`.

- The server reads what the code settles and records it as facts, not as answers: the views (S2), the entry view (S3), the navigation (S4), the providers (S6), the languages (L1), the assets and whether they exist, the host module (H1), the keys (I2) and the transport controls (I1). It reads them from the compiled program and from `eligian_project`'s inventory.
- The frontier is then every question that applies and that the code does not settle: purpose, context of use, the design intent, accessibility, delivery, the working agreement, and per view V1 and V4.
- Where a fact and an answer disagree (the user says the deck is self-paced, the code advances by itself), the server reports the conflict in the reply; the user decides which one changes.
- The brief is confirmed as in §5.1. When a `STORYBOARD.md` exists, it is not approved again; when none exists, the agent drafts one from the code and the user approves it (§5.2).
- Adopting never closes the gate on a program that was open: until the adopted brief is approved, the program stays existing work under §4.2.

After adoption the project is a briefed project: additions are measured against the approved storyboard instead of the record of known programs (§4.3).

### 4.5 The CLI warning

`eligian check`, `compile`, `smoke`, `fmt` and `dev` print one line on stderr when the program they run on is governed by a `BRIEF.md` that is not approved: the state, and the tool call that shows the open questions. The exit code and stdout do not change, so scripts and CI are unaffected (stdout stays machine-readable for `--format github`, `json` and `ndjson`). A program that is not in the record of known programs (§4.2) gets the same line. The CLI never writes that record, with one exception: `eligian init` writes `.eligian/programs.json` the way the first-run scan would, minus the `main.eligian` it just wrote, so the starter stays unknown and the first gated call is `brief-required`. Where no record exists yet, the CLI prints no not-known line.

### 4.6 `BRIEF.md`

Requirements; the exact layout is fixed in the Phase 1 spec:

- Markdown that a person can read and edit by hand, parsed by the server as `STORYBOARD.md` is (`packages\cli\src\mcp\storyboard.ts`): never throws, unknown content is kept and reported.
- A header: the idea, the state, the tree version, and the confirmation and approval lines.
- One section per branch and one per view. Each answer carries its id, its value, who gave it (`user` or `delegated`) and the round.
- Structured answers (views, navigation, languages, assets) are Markdown tables inside the answer.
- Writing then parsing returns the same answers.
- A brief confirmed under an older tree version stays confirmed; questions added later do not reopen it.

The agent does not write `BRIEF.md` with its own editor. Only the tool writes it, so that the state the server reads is the state the user confirmed (§5.3).

---

## 5. Sign-off

### 5.1 Confirming the brief

When the frontier is empty, `confirm` asks the user. With elicitation the server shows a dialog: the counts, the list of delegated answers with the agent's choices, a pointer to `BRIEF.md`, and one checkbox "this brief is complete and correct". Declining leaves the brief `complete`; the agent asks what to change. A cancelled elicitation, or one with no answer within the time limit, means no one could be asked: the server says so in its reply, and the agent uses the fallback below.

Without elicitation, the agent shows the same summary in the conversation and passes the user's confirming message verbatim in `confirmation`. The brief records which way it was confirmed (`elicitation` or `agent-reported`), so the weaker form is visible.

### 5.2 Approving the storyboard

After confirmation the agent drafts `STORYBOARD.md` from the brief (the format of the `storyboard` docs chunk). `approve-storyboard` first checks it against the brief:

- it parses, with no ignored rows;
- one view section per view in S2, and no other;
- the header agrees with the brief: the providers with S6, the languages with L1, the assets with branch A, the host module with H1;
- every beat has an end block;
- every navigation in S4, every key in I2, every control in I1 and every reaction in V6 has a row in the interactions table.

Then the user approves it, by elicitation or by the fallback, as in §5.1. Later edits to the storyboard do not close the gate again, unless they add a view (§4.3): the storyboard stays a working document that is changed before the code.

### 5.3 The confirmation cannot be typed in

An agent with a file editor could write `state: approved` into `BRIEF.md` itself. To rule that out, the confirmation and approval lines carry a signature: an HMAC over the answers, made with a key in the user's state directory, outside the project. A line without a valid signature, or answers that changed after signing, count as not confirmed.

The key is per user and per machine. A brief confirmed on another machine, with no program written yet, is asked to be confirmed again (one dialog). A project that already has its program is existing work under §4.2 and is not affected.

---

## 6. Teaching the agent to interview

### 6.1 Server instructions and prompts

- A fourth instructions string (`packages\cli\src\mcp\instructions.ts`), within the 4,096-character limit. Its first workflow line: `eligian_brief` comes first for a new presentation and for an addition; nothing is written before the brief is approved. One new rule: decisions are the user's, facts are the agent's.
- The `new-presentation` prompt (`packages\cli\src\mcp\prompts.ts`): steps 1 and 2 become the interview, the storyboard draft and its approval.
- A new prompt `add-to-presentation` (arguments: what to add) for additions.
- The `AGENTS.md` block that `eligian init` and `eligian agents setup` write repeats the instructions, as today.

### 6.2 Docs chunks

- `interview` (kind workflow): the round format, how to form a recommendation from `decisions`, `provider-choice`, `presentation-patterns` and `css-conventions`, facts against decisions, delegated answers, and how to present the sign-off.
- `brief-questions` (generated from the tree): every question with its prerequisites.
- `storyboard` (changed): the header is derived from the brief; the approval step.

### 6.3 The Claude Code plugin hook

`plugins\claude\eligian\` gets a `PreToolUse` hook on the file-writing tools. It runs a new CLI subcommand, `eligian brief gate`, which reads the hook's input and exits non-zero with the reason when:

- the target is `BRIEF.md` (only `eligian_brief` writes it), or
- the target is a new `.eligian` file in a directory whose brief is not approved.

The hook reads only what is on disk (`BRIEF.md` and its signature), so it works without the running server. The plugin's server entry moves from `eligian@^1.1` to `eligian@^1.2`.

A plugin ships hooks in `hooks\hooks.json` at its root, in the shape of the `hooks` object of `settings.json`, and its hook processes get `CLAUDE_PLUGIN_ROOT`. Measured with a test plugin loaded by `--plugin-dir`: its `PreToolUse` hook blocked creating a `.eligian` file, and the agent received the hook's message (`spikes.md` §3.1).

The hook has a third rule: it refuses a write to `.claude\settings.json` that adds an `Elicitation` hook. Such a hook answers an elicitation instead of the user (`spikes.md` §4.2), so it would approve every brief unseen.

The hook has a fourth rule: it refuses an agent write to `.eligian/programs.json`. The record is not signed in Phase 2 (spec 059 phase 2, R-13), so without this rule an agent could add its own program to the record with its editor.

**Verified 2026-11-23** (Phase 3 SC-003): the hook also runs when the plugin is installed from the marketplace (`/plugin install eligian@eligian`), not only when loaded with `--plugin-dir`, on Windows.

---

## 7. Evals

### 7.1 The existing 14 cases

The cases run `claude -p` with no user (`evals\mcp\run.ts`). With the gate they would all stop at `brief-required`. The 12 cases without a `start/` directory (`audio-lyrics`, `host-module`, `keyboard-deck`, `library-reuse`, `port-from-json`, `replay-safe`, `scrollytelling`, `staggered-list`, `three-chapters`, `title-card`, `typewriter-counter`, `video-subtitles`) therefore each get a `brief.md` fixture: the answers its prompt implies. `fix-dataflow` and `fix-selectors` get none: their start program, copied into the project before the agent runs, is existing work recorded by the first-run scan, so the gate never stops them at `brief-required`. The harness writes each fixture into the fresh project as a confirmed brief, with the state directory pointed into the run's temp directory (`ELIGIAN_STATE_DIR`).

For the storyboard approval the harness plays the user: it puts an `Elicitation` hook in the eval project's `.claude\settings.json` that accepts the server's sign-off. That is Claude Code's documented way to answer an elicitation without a person, and it works in `claude -p` (measured; `spikes.md` §4.2). The server therefore has no test-only switch.

The cases then measure what they measure today: generation from a settled spec. The storyboard assertions (`storyboard.exists`, `storyboard.beatsCovered`) stay.

Arm A0 (docs on disk, no server) is not affected.

### 7.2 The interview eval (new)

A multi-turn harness: the agent under test, and a second model that plays the user from a persona sheet (the answers to every question of the tree, some of them "you decide"). The harness passes the simulated user's reply as the next turn of the same session.

Three personas to start: a terse one (accepts every recommendation), a detailed one (two languages, video, a brand guide), and a vague one (changes an answer in a later round).

Measured per run:

1. No generation tool call succeeded and no `.eligian` file existed before approval.
2. Every persona fact is in `BRIEF.md`; every other answer is marked delegated.
3. Questions asked that a tool answers: zero.
4. Every question in every round message has a recommendation.
5. Rounds and questions per round.
6. The changed answer is reflected, and the questions that depended on it were asked again.

Measured (`spikes.md` §4): `claude -p --resume <session_id>` continues a session turn by turn. The MCP server starts anew on every turn, so everything the interview needs is on disk (`BRIEF.md`, the record of known programs). Without a hook an elicitation is cancelled in this mode; the harness's `Elicitation` hook gives both sign-offs the answer the simulated user decided.

These evals run locally under the user's subscription, never in CI (spec 058, decision 9).

### 7.3 Deterministic tests in CI

- The tree spec (§3).
- The brief engine: frontier computation, applies-when, `same as`, round selection, answer validation, parse and write.
- The gate matrix of §4.2 and the addition triggers of §4.3, against an in-process server.
- Adoption (§4.4) on two example projects: the facts read from the code, the remaining frontier, a reported conflict.
- The CLI warning (§4.5): the stderr line, unchanged stdout and exit code.
- The signature.
- `mcp-solutions-*.spec.ts` and `evals\mcp\gate.ts` use the CLI and are not affected.

---

## 8. Phased delivery

Day = one engineer-day, including the AGENTS.md checklist. Total **≈ 22 engineer-days**. The release is CLI 1.2.0 (a new tool is a minor version).

### Phase 1: brief engine (6 days)

**Status: ✅ COMPLETE (2026-11-19)** — see specs/059-presentation-assistant/phase-1-brief-engine/compliance.md

Touches: `.claude\workflows\presentation-assistant-phase.js` (new), `packages\cli\src\mcp\brief\{tree,engine,brief-file}.ts` (new), `packages\cli\src\mcp\tools\brief.ts` (new), `packages\cli\src\mcp\server.ts`, `packages\cli\scripts\generate-knowledge.ts` (`brief-questions`), the specs and the CI step that pin the tool list (`.github\workflows\ci.yml`, `mcp-server.spec.ts`, `mcp-instructions.spec.ts`, `mcp-resources.spec.ts`, `mcp-search.spec.ts`), `packages\cli\AGENTS.md`.

- Day 1: clone the workflow.
- The tree as data with its spec; the engine (frontier, applies-when, per-view copies, `same as`, round selection, validation).
- `BRIEF.md` parse and write.
- `eligian_brief` with `status` and `answer`; `confirm` records agent-reported confirmation only.
- Exit: the inspector lists nine tools; an in-process test walks a full interview from an idea to an empty frontier for three fixture personas; nothing is gated yet.

### Phase 2: gates, sign-off, additions, adoption (9 days)

**Status: ✅ COMPLETE (2026-11-20)**: see specs/059-presentation-assistant/phase-2-gates-signoff-additions/compliance.md. SC-013 (a real-client run) is the user's check, pending.

Touches: `packages\cli\src\mcp\brief\{gate,known-programs,signature,adopt}.ts` (new), the CLI commands `check`, `compile`, `smoke`, `fmt` and `dev` (the warning line), `packages\cli\src\mcp\tools\{init,check,fmt,compile,smoke,project,brief}.ts`, `packages\cli\src\mcp\errors.ts` (kind `gate`), `packages\cli\src\mcp\telemetry.ts` (brief state on each call line).

- The record of known programs (the first-run scan, `accept-existing`); the gate matrix; the `gate` failure with the next round.
- Sign-off by elicitation with the fallback; the signature; `approve-storyboard` with its checks.
- Additions: the three triggers and the scoped rounds.
- Adoption: facts from the code, the remaining frontier, conflicts (2 days).
- The CLI warning line.
- `eligian_project`'s `brief` section.
- Exit: the gate-matrix spec is green; in Claude Code, a new presentation cannot pass `eligian_check` before both sign-offs, and an existing example project works unchanged; adding a timeline to it is refused until its scoped interview is approved; `scope: adopt` on the eligian-tour example yields a brief whose views, providers and languages are facts and whose frontier holds only undecided questions; `eligian check` on a program with an unapproved brief prints the warning and exits as before.

### Phase 3: teaching, hook, evals (7 days)

**Status: ✅ COMPLETE (build, 2026-11-20)**: see specs/059-presentation-assistant/phase-3-teaching-hook-evals/compliance.md. SC-001 (interview eval) passed in its seventh run (2026-11-21, `2026-11-21T09-38-58-984Z`: terse 3/3, detailed 2/3, vague 2/3). SC-002 (14 cases) passed in phase run 3 (2026-11-21, `2026-11-21T20-15-39-843Z`: 12/42 = 28.6 % against the baseline's 21.4 %; fix-selectors judged on phase runs 2 and 3 together, 4/6). SC-003 (marketplace hook, Windows) passed on 2026-11-23. Exit met.

Touches: `packages\cli\src\mcp\{instructions,prompts}.ts`, `packages\cli\src\mcp\knowledge\curriculum\{interview,storyboard}.md`, `packages\cli\src\agents.ts`, `packages\cli\src\main.ts` (`brief gate`), `plugins\claude\eligian\`, `evals\mcp\{run.ts,cases\*,personas\*}`, `packages\cli\README.md`, `CHANGELOG.md`.

- The hook installed from the marketplace (§6.3).
- Instructions, both prompts, the docs chunks, the `AGENTS.md` block.
- The Claude Code hook and `eligian brief gate`, with its fourth rule: block agent writes to `.eligian/programs.json` (§6.3).
- Brief fixtures for the 14 cases; the multi-turn harness; three personas.
- Exit: the success criterion of §1 on the three personas (3 runs each, majority); the 14 cases at their previous pass rate.

---

## 9. Risks, decisions, open questions

### Risks

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| 1 | 63 questions tire the user | the interview is abandoned | a recommendation on every question so "yes" is enough; "you decide" is a valid answer; applies-when skips whole branches; `same as` for similar views; rounds of 7 |
| 2 | The agent runs the CLI in a terminal instead of the gated tools | generation without a brief | the instructions; the CLI's warning line (§4.5); the Claude Code hook blocks creating the program file. The CLI never refuses (decision 8) |
| 3 | The agent writes a program before its first tool call, or in an earlier session | the file looks like existing work and is not gated | the record of known programs is kept in the project and survives restarts; only the first run in a project accepts what is there; the hook |
| 4 | The agent invents answers during the rounds | a brief the user never gave | both sign-offs show the user the result; elicitation where available; the mode of confirmation is recorded |
| 5 | Elicitation behaves differently per client (cancelled in autonomous modes, a dialog that never shows) | no direct sign-off | boolean and string fields only; a time limit; four outcomes told apart; the agent-reported fallback |
| 6 | `McpServer.elicit` is `@stability unstable` | breaks on an `effect` bump | `effect` is pinned exactly and Dependabot ignores its minor and major updates |
| 7 | The gate blocks legitimate work (a quick experiment, a tutorial) | users turn the server off | existing work is never gated; delegating every question still gives an approved brief in a few rounds |
| 8 | The tree goes stale as the language grows | new features are never asked about | the tree is data with a spec; the tree version is in the brief; a checklist item when a DSL feature lands |
| 9 | The instructions outgrow 4,096 characters | truncated priming | the existing length spec; today 2,415 |
| 10 | Eval cost doubles (a second model per interview run) | fewer runs | three personas, three runs; the 14 cases stay single-turn |
| 11 | An `Elicitation` hook in the project's settings answers the sign-off for the user | an approval nobody saw | the plugin hook refuses a write that adds one (§6.3); the server cannot tell a hook's answer from a person's, so this stays the user's configuration to guard |

### Decisions (recorded 2026-11-19)

1. **Enforcement:** the tool gate, sign-off by elicitation, and the Claude Code hook.
2. **Existing presentations:** not gated; additions get a scoped interview.
3. **"You decide":** a valid answer, recorded as delegated with the agent's choice, and listed at sign-off.
4. **Depth:** the brief settles decisions; the agent drafts the storyboard; the user approves it; only then does generation start.
5. **Where the state lives:** `BRIEF.md` in the presentation's directory, written only by the tool.
6. **One tool:** `eligian_brief` with five actions, not five tools.
7. **Additions:** a new timeline, a new language, or a first host module. A new interaction or asset inside an existing view is a free edit.
8. **CLI:** warns on an unapproved brief with one stderr line; never refuses.
9. **Round size:** 7 questions by default.
10. **After approval:** the brief is a record of the starting decisions. The storyboard is the living document; drift from the brief is neither refused nor reported.
11. **Adoption:** an existing presentation can get a brief reconstructed from its code, as an opt-in (`scope: adopt`).
12. **Known programs:** recorded in the project (`.eligian\programs.json`), not in the server's memory, so the gate holds across restarts; `accept-existing` takes in programs that arrive another way.

### Open questions

None. The last open check, the hook in a plugin installed from the marketplace (§6.3), passed on 2026-11-23 (Phase 3 SC-003).
- **Follow-up: a `quote` on every `by: user` answer** (from Phase 3's first SC-001 run, 2026-11-20). The agent recorded answers `by: user` that it never asked (the per-view V items of a round, filled in silently; §9 risk 4). The server cannot see the conversation, so it cannot refuse them; Phase 3 teaches against it (phase 3 FR-053). A `quote` field (the user's own words) on each `by: user` answer, kept in `BRIEF.md`, would make every such answer auditable and let the eval check the quote against the user's reply. A tool schema and brief file change; not scheduled.
