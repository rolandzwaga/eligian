# Eligian Tour — Expansion Plan

Plan for turning `examples/eligian-tour/` into a presentation that (1) explains what it already demos accurately, (2) shows every detail of the Eligian language, (3) has a chapter on the VS Code extension, (4) a chapter on the CLI, and (5) keeps its own meta-docs accurate.

Written 2026-11-04 against `main` at 1e4437e (after #183 … #192). Sources of truth used for every snippet: `packages/language/src/eligian.langium`, `LANGUAGE_SPEC.md`, `specs/<NNN>-*/spec.md`. Every claim marked **verified** below was reproduced with the real CLI (`node packages/cli/bin/cli.js check|compile|smoke|fmt`) on scratch programs during planning; claims marked **verify** must be re-run by the implementer before the beat is presented as real.

Owner decisions already taken (not up for discussion in this plan): the IDE and the terminal are **CSS-built mock UI inside layout.html**, driven by the timeline exactly like the existing code pane — no screenshots, GIFs or binary assets. The plan lands at this path. Meta-docs are covered fully, new storyboards included.

## Hard constraints (stated, and respected throughout)

1. `pnpm run check:examples` (= `eligian check "examples/**/*.eligian" … --max-warnings 0`) keeps passing: **0 errors, 0 warnings**.
2. `pnpm run smoke:examples` (= `eligian smoke …`: every timeline is played in jsdom on the real engine) keeps passing.
3. `pnpm run fmt:examples` (= `eligian fmt --check`) keeps passing: every `.eligian` file formatted.
4. **No new binary assets.** New files are text only: `host.js`, `locales.json`, `hint.html`, storyboard `.md` files.
5. Action names must not collide with built-in operation names (`action_name_builtin_conflict`); every new action is prefixed `chN…`, `cf…`, `cc…`, or is a verb no operation uses (checked against `compiler/operations/registry.generated.ts` in WP-1).
6. `const` stays scoped inside actions (or at program level), never inside a timeline inline block — the header comments of `tour.eligian` are kept true. (A scratch test showed that a `const` inside an inline `at` block *does* compile today; see Risks §10.1. The plan does not rely on it.)
7. One compiled config: one Hub timeline plus one timeline per chapter, all in `tour.eligian`.
8. Each chapter owns one `.view` and uses the `on enter` / `on leave` pattern; nothing else shows or hides views.

Verification command after **every** work package (run from the repo root):

```
pnpm run check:examples && pnpm run smoke:examples && pnpm run fmt:examples && node packages/cli/bin/cli.js examples/eligian-tour/tour.eligian -o examples/eligian-tour/tour.json
```

---

## 1. Summary and goals

### What exists

- `examples/eligian-tour/tour.eligian` (556 lines): `languages { * "en-US" "English" }`, `layout "./layout.html"`, `styles "./tour.css"`, one library import, four chapter-local helper actions + one event action, then seven raf timelines in `#stage`: `Hub` (lifecycle only, `on click "#card-chN" navigate "…"`) and six chapters. Chapter 1 is six explicit `at a..b [ … ]` events; chapters 2–6 are `sequence each [ clearSpots() ] { for Ns [ … ] ×6 }`. Chapter 4 has one real `stagger … at editBeat.end with revealCard() for 1.5s`.
- `presentation.eligian`: `library presentation` with `revealBlock, spotlight, clearSpots, callout, narrate, demo, revealCard, showView, hideView`.
- `layout.html` (467 lines): `#stage` > `#hub` + `#ch1..#ch6` (each `.view.chapter` with `.chrome`, `.code-pane` of pre-tokenized `<pre class="code">`, `.effect-pane` of `.fx` panels, `.callout-layer`), shared `#narration` and `#progress`.
- `tour.css` (865 lines): theme, `.view/.is-active`, `.code/.in/.typing`, `.spot`, callout anchor positioning (one `anchor-name`/`position-anchor` pair per callout + a fallback row table), `.fx/.active`, Chapter 6 mock-editor classes, `#progress-fill` animation per chapter (42/46/48/47/48/48 s).
- `storyboards/chapter-01…06-*.md`, `ELIGIUS_EXECUTION_MODEL.md`, committed `tour.json`.
- Current state (verified): `check` 2 files 0/0, `smoke` 7 timelines ok (Hub 1, Ch1 7, Ch2 7, Ch3 7, Ch4 12, Ch5 7, Ch6 7 positions), `fmt` clean.

### What the result looks like

A hub of **eight** cards (two rows of four) that keyboard-navigates too (`1`–`8`, `Escape` back). Chapters keep the two-pane annotated-walkthrough format (code pane left, effect pane right, callout chips, shared narration plate, progress bar). Every chapter can be left and re-entered cleanly (an `on leave` reset), paused with `space`, replayed with `r` (`replayChapter`: reset the view, then seek to 0; a bare `seek 0s` would leave everything earlier beats revealed, §4.0). The progress bar is the engine's ProgressbarController, so it pauses and replays with the timeline. Each chapter is itself written with the constructs it teaches, and the displayed snippets are grammar-valid Eligian or verbatim tool output.

### Chapter list

| # (hub order) | View id / prefix | Timeline name | Status | Beats | Length |
|---|---|---|---|---|---|
| 01 | `#ch1`, unprefixed ids + new `c1-…` | `Timeline & Time` | **changed** (+scroll/loop/duration/custom, `for` ranges, time constants + labels, `target`, lifecycle blocks in the recap, labelled as its own demo) | 8 | 58 s |
| 02 | `#ch2`, `c2-…` | `Actions` | **changed** (3 wrong snippets fixed, +dataflow contracts, +erased parameters, +alias import) | 8 | 62 s |
| 03 | `#ch3`, `c3-…` | `Logic` | **changed** (const folding, literals, operators rewritten, +else if, +runtime concat/calc, +`with`, real loop control) | 8 | 64 s |
| 04 | `#ch4`, `c4-…` | `Timeline Power Tools` | **changed** (braces fixed, +inline items/each/then/labels, +anchored inline stagger as a second real demo) | 7 | 57 s |
| 05 | `#chf`, `cf-…` | `Files & Imports` | **new** (program vs library, languages, default/named/library/extensions imports, comments + JSDoc, keywords) | 8 | 60 s |
| 06 | `#ch5`, `c5-…` | `Engine Reach` | **changed** (broadcast/request fixed, button wired on enter, +interactions, +`on key`, nine controllers, real locales + LabelController + live language switch, +host module call) | 9 | 73 s |
| 07 | `#ch6`, `c6-…` | `The Editor` (renamed from `Tooling Magic`) | **rewritten** as a mock VS Code (one beat per extension feature) | 15 | 106 s |
| 08 | `#chc`, `cc-…` | `The Command Line` | **new** (mock terminal, one beat per command) | 11 | 87 s |

Hub order ≠ section-id number for 05–08 on purpose: the existing `c5-`/`c6-` ids and the `Engine Reach`/editor timelines keep their ids (no mass rename); the two new chapters get letter prefixes (`cf`, `cc`). Display numbers (`.card-num`, `.chapter-label`, progress rail) follow the hub order above. Storyboard files are renamed to the display numbers (§8).

---

## 2. Accuracy fixes in the existing tour

Each entry: location → current text → replacement → why (citation). "Verified" = reproduced during planning with the real CLI on a scratch program.

### 2.1 Confirmed findings (fix all)

**F1 — braces around a call are not Eligian.** `layout.html:259-261` (`#c4-code-manual`), `storyboards/chapter-04:42-44`.
Current: `at 0s..5s   { intro() }` / `at 5s..15s  { main() }` / `at 15s..18s { outro() }`.
Replace with: `at 0s..5s   intro()` / `at 5s..15s  main()     // 5 + 10, by hand` / `at 15s..18s outro()    // …and 15 + 3`.
Why: `TimelineAction: InlineEndableAction | OperationCall | ForStatement | IfStatement` (`eligian.langium:659-660`). Verified: `Expected an action or operation call, or a [ … ] block here, but found '{'.` (parsing-error 5:13). Note the grammar's own doc comments (`eligian.langium:581,627,672,705-707`) and `LANGUAGE_SPEC.md` §6.2 stagger comment still show braces — out of scope here, but do not copy them.

**F2 — a built-in operation cannot be a bare `at` event.** `layout.html:123` (`#c2-code-call` line 2), `tour.eligian:218-221`, `storyboards/chapter-02:77`, `chapter-01:91`.
Current: `at 0s..5s addClass("on")         // built-in op`.
Replace with: `at 0s..5s target "#hero" [ addClass("on") ]   // built-in op, inside a block` and narration `"Inside a block, calling your action looks exactly like calling a built-in operation."`; callout `"one syntax, resolved action-first then built-in op — a bare operation is not a timeline event; a block or an action is"`.
Why: `validators/operation-call/operation-existence-validator.ts:82`. Verified: `Operation 'addClass' cannot be used directly in timeline events. Define an action that calls this operation, then call the action.` (also with `target`).

**F3 — "a parameter MUST be named after the op's input" is obsolete.** `tour.eligian:227,230`, `presentation.eligian:42-44,56`, `ELIGIUS_EXECUTION_MODEL.md:187-192` (rule 5b), `storyboards/chapter-02:88-99`.
Current: `"A parameter that feeds a built-in op must be named after that op's input."` / NOTE `the content param MUST be named template`.
Replace with: narration `"Parameters flow into operations by name — and when the names differ, the compiler bridges them."`; callout `"same name → forwarded as-is · other name → a setOperationData before the operation"`; presentation.eligian note: `named template so it is forwarded without an extra operation (any name works: the compiler inserts setOperationData otherwise)`; delete rule 5b.
Why: `LANGUAGE_SPEC.md:2359-2375` (spec 046). Verified: `action narrateA(text) [ selectElement("#greeting") setElementContent(text) ]` compiles to `selectElement, setOperationData{ properties: { template: "$operationdata.text" } }, setElementContent`.

**F4 — literal consts are inlined, not stored.** `layout.html:183` (`// → $globaldata.theme`), `:186` (`// → @greeting`), `tour.eligian:272,275`, `storyboards/chapter-03:41-50`, `ELIGIUS_EXECUTION_MODEL.md:95-96`, `LANGUAGE_SPEC.md:2453-2466` (also stale; out of scope).
Current: `"const names a value. In an action it's a scope variable; at top level it's global."` / `"action scope → @name · program scope → $globaldata"`.
Replace with: narration `"const names a value. Known at compile time it is inlined wherever you write @name; a runtime value becomes a scope variable."`; snippet comments `// inlined: @theme → "dark"`, `// inlined too`, `const copy = label   // runtime → setVariable, read back as $scope.variables.copy`; callout `"@name reads a const · literal → folded in · runtime value → scope variable"`.
Why/verified: compiled scratch has `"initActions": []` for `const theme = "dark"`, `template: "hi"` for `@greeting`, `template: 17` for `const total = 2 ** 3 * 2 + 1`, and `setVariable` only for `const copy = label` (read as `$scope.variables.copy`). `compiler/ast-transformer.ts:125-169` filters constants out of initActions.

**F5 — a const is read as `@name`, not bare.** `layout.html:187` (`setElementContent(greeting)`).
Replace with `setElementContent(@greeting)` and add `selectElement("#greeting")` before it.
Why: `eligian.langium:906-921` (bare identifier = ParameterReference). Verified: `Could not resolve reference to Parameter named 'greeting'.`

**F6 — runtime arithmetic is a compile error.** `layout.html:190-192` (`#c3-code-expr`), `tour.eligian:281,284`.
Current: `$operationdata.count + 1` / `$operationdata.count >= 3 && @enabled` / `!$globaldata.muted`.
Replace with (see Ch3 beat 3): `const total = 2 ** 3 * 2 + 1   // 17, folded at compile time`, `if (count >= 3 && enabled) { … }   // runtime comparisons and logic: inside if`, `selectElement("#" + slideId)   // runtime string concatenation`, `calc(count, 1, "+")   // runtime arithmetic is an operation`.
Why: `LANGUAGE_SPEC.md:2302-2357`. Verified: `Arithmetic operator '+' cannot be applied to runtime values … Use the calc operation instead (its result is $operationdata.calculationResult) …` (runtime_operator_operand). `calc`'s parameter order is `left, right, operator` (verified: `calc(count, "+", 1)` → `Parameter 'right' expects type 'ParameterType:number' but got 'string'`); confirm with signature help in WP-4.

**F7 — `broadcastEvent` never "requests".** `tour.eligian:434,437`, `layout.html:329` (`// request: engine answers`), `storyboards/chapter-05:61-71`.
Current: `"Broadcast reaches every listener; request asks for the one that answers."` / `"request-timeline-uri is the request the navigate sugar emits"`.
Replace with: `"broadcastEvent puts a message on the engine's bus. Whoever listens for that name reacts: your on event handlers, controllers — and the engine itself."`; callout `"the engine listens for request-timeline-uri and switches timeline — it is a broadcast like any other"`; comment `// the engine listens: switches to "Hub"`.
Why: `node_modules/eligius/dist/engine-factory-*.mjs:1472-1474` registers `request-timeline-uri` with `_onEventbusEvent` (a broadcast listener), not `_registerRequest`. Eventbus requests (`request-engine-root`, `request-action`, …) are internal to operations and unreachable from `broadcastEvent`.

**F8 — the ping button is not wired when Beat 3 says to click it.** `tour.eligian:441-458`.
Current: Beat 3 (15–24 s) `"Click the button — it broadcasts, and this handler answers."` but `ch5WireButton()` runs at 24 s (Beat 4), and re-runs on every seek into Beat 4 (duplicate listeners).
Replace with: wire in `on enter` with the interaction form `on click "#c5-fx-ping" run ch5BroadcastPing()`, remove the listener in `on leave` (`with "#c5-fx-ping" { removeControllerFromElement("DOMEventListenerController") }`), keep `ch5WireButton` only as the *displayed* desugaring (`#c5-code-controller`), delete the action.
Why: spec 057 (`LANGUAGE_SPEC.md:1951-2012`); verified compile of `on click "#btn" run ping("#panel")` → `addControllerToElement { eventName: "click", actions: ["ping"], actionOperationData: { target: "#panel" } }`; controllers are never detached by a timeline switch (engine `_endActiveActionsReporting` ends actions, `detachControllersWithin` is only called by `removeElement`/`clearElement`/`setElementContent`/destroy).

**F9 — eight controllers → nine.** `tour.eligian:452,531`, `storyboards/chapter-05:99-100,111-112`, `chapter-06:103-104`.
Replace `"one of eight"` / `"the eight controllers"` with `"one of nine"` and list `DOMEventListener · Keyboard · Label · Lottie · MutationObserver · Navigation · Progressbar · Routing · Subtitles`.
Why: `KeyboardController` class exists in eligius 4.2.0 (`engine-factory-*.mjs:8118`) and backs `on key` (`compiler/transformers/navigate-operations.ts`).

**F10 — the narration is not localized.** `tour.eligian:471`, `layout.html:347` (`// ← the localized narration`), `storyboards/chapter-05:9-10,121,141-147`, `chapter-01:41-46`.
Replace with: a real localization of the **hub title and tagline** (`Hub` on enter: `selectElement("#hub-title") addController("LabelController", "hub.title")`, same for `#hub-tagline`), a `locales "./locales.json"` import, `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`, and recap line `addController("LabelController", "hub.title")   // ← the hub title you read`; narration `"… the navigation and the hub title you've used were built from exactly these."`
Why: verified there is no `locales` import and no LabelController in the tour; `narrate` is `setElementContent(template)`.

**F11 — `addController` takes positional parameters.** `ELIGIUS_EXECUTION_MODEL.md:114`, `storyboards/chapter-05:36-37,53,104-107,127,205`.
Replace `addController("DOMEventListenerController", { eventName: "click", actions: [...] })` with `addController("DOMEventListenerController", "click", ["ch5BroadcastPing"])` and `addController("LabelController", { translationKey: … })` with `addController("LabelController", "hub.title")`.
Why: `LANGUAGE_SPEC.md:2405-2451`. Verified: the object form compiles **without error** to `addControllerToElement({ eventName: { eventName: "click", actions: [...] } })` — a silent miscompile (worth a validator issue, see §10).

**F12 — `broadcastEvent(eventArgs, eventName)`.** `ELIGIUS_EXECUTION_MODEL.md:136-138,193-194`, `storyboards/chapter-05:33,52,65-66,145,171`, `chapter-01:140`.
Replace `broadcastEvent("request-timeline-uri", [uri, 0])` with `broadcastEvent([uri, 0], "request-timeline-uri")` and `broadcastEvent("tour-ping", [...])` with `broadcastEvent(["#c5-fx-panel"], "tour-ping")`.
Why: `registry.generated.ts` (broadcastEvent parameters: eventArgs, eventName, eventTopic); `tour.eligian:75-77` already has it right.

**F13 — the tour uses sequence/label/anchor forms it never teaches.** `tour.eligian:197-249,269-324,345-395,423-476,502-554,365,400`, `layout.html:263-278`, `storyboards/chapter-04:78-79,155-157`.
Add Ch4 beat 5 (inline items, `each`/`then`, `as label`) and beat 6 (`stagger … at <time>`, inline form) — §4.4. Delete the "stretch goal" paragraph.
Why: `eligian.langium:675-722`, `LANGUAGE_SPEC.md:2062-2136,2189-2217`; verified compile of `sequence each [ … ] then [ … ] { for 3s as explain [ … ] [ … ]  ping("#panel") for 2s }`.

**F14 — inline stagger blocks start empty; `items` is unresolvable.** `layout.html:271-275` (`#c4-code-inline`), `tour.eligian:384`.
Replace with the anchored wave of §4.4 beat 6 (`stagger 150ms ["#c4-wave-1", "#c4-wave-2", "#c4-wave-3"] at waveBeat.start + 1s for 2s [ selectElement(@@item) addClass("lit") ] [ selectElement(@@item) removeClass("lit") ]`); §4.4 is the one source for this block's text.
Why: `LANGUAGE_SPEC.md:1923-1928` (every block starts empty), spec 048 (end block optional). Verified: compiles clean (scratch `e.eligian`), the per-item event gets the item substituted.

**F15 — the storyboard's inline-stagger warning is resolved.** `storyboards/chapter-04:118-122,173-175`. Delete the ⚠ paragraphs; Ch4 beat 6 becomes a REAL demo (§4.4).

**F16 — providers: `scroll` missing; `loop`/`duration` missing.** `tour.eligian:138`, `layout.html:79-81`, `storyboards/chapter-01:75-82`.
Callout → `"raf = animation clock · video / audio drive from media · scroll = the scroll position · custom"`; add a `scroll` chip; add the header-options block (Ch1 beat 2).
Why: `eligian.langium:594-597,620-621`.

**F17 — ranges are also `start for duration`.** `tour.eligian:148`, `layout.html:58`. Callout → `"a time range: start .. end — or start for duration"`; snippet gains `at 5s for 3s revealHero()`. Why: `eligian.langium:746-747`.

**F18 — `#code-arith` line 1 has no action.** `layout.html:66`: `at 5s + 2s .. 10s` is not a complete event (TimedEvent needs an action). Replace with `at 5s + 2s .. 10s  doThing()`; add `at 10s / 2 for 1s  doThing()`. Why: `eligian.langium:656-660`. (Found while re-reading; not in the audit.)

**F19 — time constants and labels are the robust way to chain.** `tour.eligian:162-169`. Add Ch1 beat 6 (§4.1). Why: `LANGUAGE_SPEC.md:2189-2217`.

**F20 — interactions, `on key`, host modules are never taught.** `tour.eligian:428,455`, `layout.html:324-326,336-338,346`. Add Ch5 beats 4, 5, 8 (§4.6). Why: `eligian.langium:531-537,148-182`.

**F21 — the CSS diagnostic text is invented.** `tour.eligian:525`, `layout.html:432-433`, `storyboards/chapter-06:93-97`.
Replace with the real strings, using a typo of a class tour.css really has (tour.css has no `.button`, so `addClass("buton")` against it only gets `Unknown CSS class: 'buton'.` with no suggestion): `Unknown CSS class: 'activ'. Did you mean: active?` (code `unknown_css_class`), lightbulb `Change to 'active'` · `Create '.activ' in tour.css` (`Open CSS file` is the follow-up command of the create fix, not a menu entry). Verified in review with `styles "./tour.css"`; re-run in WP-8, after the new state classes land (a new class can join the suggestion list).
Why/verified: `validators/operation-call/css-parameter-validator.ts:52`, `css/did-you-mean-fix.ts:49`, `css/css-code-actions.ts:127-133`; scratch check output.

**F22 — `fadeIn (operation)` is not an operation.** `layout.html:439,402`, `storyboards/chapter-06:111`.
Replace the popup with `animate (operation)`, `animateWithClass (operation)` (typing `ani`) and, typing `rev`, `revealBlock (action)` with detail `(selector: string) - imported action` (items filter on the bare name, `completion/actions.ts:71`, `completion/operations.ts:60`, so `revealBlock` is not in the `ani` list).
Why: `completion/operations.ts:58` (`<name> (operation)`), `completion/actions.ts:69-74` (`<name> (action)`, imported detail); the registry has no `fadeIn`.

**F23 — compiled JSON has `startOperations`, not `operations`.** `layout.html:391-392`. Replace with `{ "duration": { "start": 0, "end": 5 }, "startOperations": [ requestAction, startAction … ], "endOperations": [ … ] }`. Verified in compiled scratch output.

**F24 — the arg-count message and hover are paraphrased.** `layout.html:446-447`. Message → `Action 'revealBlock' expects 1 argument(s) but got 0. Expected: selector` (`parameter-validator.ts:56`, verified). Hover on a **call** → the JSDoc markdown `### revealBlock` + description + `**Parameters:**` with `` `selector` (`string`) - … `` (the type comes only from a JSDoc `{type}`; without braces it reads `(`unknown`)`, `jsdoc/jsdoc-formatter.ts:34-39`, `jsdoc/jsdoc-parser.ts:135-143`), plus `**Requires from the caller** (operationData):` when the action needs something (`eligian-hover-provider.ts:196-200,251-266`). Hover on the **definition** → `### revealBlock` + `**Requires…**` + `**Parameters checked at call sites:**` only, no JSDoc (`:238-241`, `:55-65`). The two never appear in one card.

**F25 — "every class and selector is checked against your imported CSS" is incomplete; the tooling list is a third of the extension.** `tour.eligian:522,531,540,549`, `layout.html:411-412`. Selectors are checked against the CSS **and the layout HTML**, also through action parameters (spec 056). Chapter 07 is rewritten (§5).

**F26 — id-registration blocks are obsolete.** `tour.css:3-5,9-10,109-117,245-264,291-302,498-512,606-610,622-624`, `layout.html:19-20`, `storyboards/chapter-03:15-17,175-176`, `chapter-04:15-16,173`, `chapter-05:20-21,209-210`, `chapter-06:24-26,208-210`.
Delete the id-registration rule groups (keep `#c3-badge`, `#c5-fx-ping` styling where it styles); comments → `"ids come from layout.html, classes from tour.css; both are checked, also through action parameters (spec 056)"`.
Why/verified: `spotlight("#tok-timelin")` → `Unknown CSS ID in selector: 'tok-timelin'. Did you mean: tok-timeline?` although `spotlight` is an action.

**F27 — `const` can live in inline blocks; helper-action comment overstated.** `tour.eligian:33-35`. Rewrite the comment to the house rule: `// House rule: const lives in actions (or at program level), not in timeline blocks, so the loop and the conditional live in helper actions whose bodies are the displayed snippets.` Verified: a `const` in an inline block compiles, so the old comment's "is scoped inside an action" is false as stated.

**F28 — a constant `if` condition is not folded away.** `tour.eligian:37-38`. Delete the parenthesis `(a constant condition would instead be folded to the taken branch at compile time)`. Verified: `if (2 > 0) { … } else if (1 > 2) { … } else { … }` compiles to `when { expression: "true" } … otherwise … when { expression: "false" } …`.

**F29 — the setVariable / eligius 2.2.2 history is noise.** `tour.eligian:49-54`, `layout.html:200-204`. Replace `ch3RevealBullets` with the idiomatic `const points = ["#c3-b1", "#c3-b2", "#c3-b3"]  for (p in @points) { selectElement(@@p) addClass("in") }` (const inside the action, honouring constraint 6). Verified: compiles to `forEach { collection: [...], itemName: "p" }`, `selectElement { selector: "$scope.currentItem" }`.

**F30 — `setElementContent(@@currentItem)` works now.** `storyboards/chapter-03:105-109,172-176`. Replace the rationale: reveal-by-selector is a style choice; runtime values are materialized by `setOperationData` (spec 046).

**F31 — startAction runs the callee on a copy of the caller's data.** `ELIGIUS_EXECUTION_MODEL.md:100-110,177-178`. Rewrite §5 and rule 1: engine-fired blocks (timeline start/end, lifecycle, event actions, listener actions) start empty; a called action starts with a **copy** of the caller's operationData plus its arguments; outputs do not flow back (`LANGUAGE_SPEC.md:1303-1352`).

**F32 — source citations are eligius ~2.x.** `ELIGIUS_EXECUTION_MODEL.md:3-6,18-31,51-56,127-132`. Re-cite against the installed `eligius@4.2.0` (`node_modules/eligius/dist/`), or drop line numbers; add a version line.

**F33 — §7b/rule 7 still recommend the 3600 s trick.** `ELIGIUS_EXECUTION_MODEL.md:140-163,195-205`. Lead with `on enter`/`on leave`; keep the trick as history.

**F34 — rules miss current compiler behaviour.** Add rules for `target`/`with`, erased-parameter save/restore, dataflow errors + quick fixes, constant folding, controllers not detached on switch (remove them in `on leave`).

**F35 — hideView doc.** `presentation.eligian:99-103` → `Hide a top-level view; each timeline calls it for its own view in on leave.`

**F36 — layout structure comment lists `#ch1`, `#ch2`.** `layout.html:5-11` → list all views (`#hub`, `#ch1`–`#ch4`, `#chf`, `#ch5`, `#ch6`, `#chc`).

**F37 — `locales "./locales/en.json"` suggests one file per language.** `layout.html:340` → `locales "./locales.json"   // every language, keyed by code`. Why: `LANGUAGE_SPEC.md:457-533`.

**F38 — "click-to-advance + autoplay toggle + re-watch" is not implemented.** All six storyboards. Replace with the real advance model (§7): beats play on the raf clock; `space` toggles, `r` replays, `Escape`/`← Hub` leave. Replay is `on key "r" run replayChapter("#chN")` (§4.0: reset the view, then broadcast `timeline-seek-request` with `[0]`), not `on key "r" seek 0s`: a seek only ends the active actions that no longer cover the position and starts the inactive ones that do (`engine-factory-*.mjs:11620-11629`), and beats have no end blocks, so every class earlier beats added would survive it. Verified: `on key "space" toggle` and `on key "r" run replayChapter("#ch1")` compile and smoke; the DOM effect is WP-1's browser acceptance.

**F39 — storyboard 1 describes a never-built structure.** `chapter-01:29-31,40-46,130,150-161` (ids `#t-kw-timeline`, `.dim`, `labelId`, `hub.eligian`, `chapters/chapter-01.eligian`, `locales.json`). Rewrite to the built structure (§8).

**F40 — `unknown` is not an annotation.** `chapter-02:68,143,174`. Verified: `Expected 'string', 'number', 'boolean', 'object' or 'array' here, but found 'unknown'.` → "leave the type off to opt out"; Beat 6 shows a trimmed snippet; the per-chapter-view generalization is done.

**F41 — revealCard is regular, id is `#c4-code-inline`.** `chapter-04:26,105,166`.

**F42 — navigate desugaring wording.** `tour.eligian:7-8` → `"…a DOMEventListenerController whose action broadcasts request-timeline-uri [name, 0] (the engine listens and switches)"`. Verified: the generated verb actions are named `__on__…` (`__on__toggle`, `__on__seek__7`); the navigate action is `__nav__<slug>_<fnv1a hex>`, plus `__<position>` when the position is not 0 (`compiler/transformers/navigate-operations.ts:169-176`). The comment may still describe it generically.

**F43 — re-entering a chapter does not reset it; listeners accumulate.** `tour.eligian` every `on enter`/`on leave`. Add `leaveChapter(view, back)` (§4.0) that resets `.in/.typing/.active/.show/.spot/.lit/.muted` inside the view and removes the controllers `on enter` added (three KeyboardControllers on `#stage`, the back button's listener, the ProgressbarController). Verified: `removeControllerFromElement("KeyboardController")` / `("DOMEventListenerController")` compile, smoke and remove exactly one controller per call (`engine-factory-*.mjs:4361-4372`).

### 2.2 Findings not confirmed (not acted on)

- "A `for`/`if` written directly as the `at` action rejects built-in operations inside it" — not reproduced; the plan never uses that form, so nothing depends on it.
- Audit's exact synthetic navigate action name `__nav__<slug>_<hash>` — settled since from source (`navigate-operations.ts:169-176`, F42); no displayed text depends on it.
- `LabelController` re-render on language change and the exact event to switch languages at runtime — settled since from the engine source: the `language-change` broadcast (`broadcastEvent(["nl-NL"], "language-change")`) makes the LocaleEventbusAdapter call `setLocale` (`engine-factory-*.mjs:1904-1917`), LabelController re-renders on it (`:8342`), and the preview's language picker sends the same broadcast (`packages/extension/media/preview.ts:304`). The language then persists across timelines. Ch06 beat 7's switch is REAL (§4.6).

---

## 3. Language coverage matrix

One row per item of the language inventory. "Now" = where the current tour covers it (chapter.beat) or **missing**; "Plan" = where this plan puts it (§4–§6 beat ids). Rows marked ✱ are features the tour itself *uses* today without teaching them.

| Feature | Now | Plan |
|---|---|---|
| Program vs library file; entry rule | Ch2.6 (one line) | **ChF.1** (program vs library, what a library may contain, cannot compile a library); Ch2.8 keeps the teaser |
| Comments and JSDoc | missing (Ch6.5 shows `/** @param */` as tooling) | **ChF.7** (`//`, `/* */`, `/** @param {string} … */`), Ch7.7 (hover + template) |
| Literals (strings, numbers, booleans, null, objects, arrays) | missing | **Ch3.2** |
| Time units and unitless seconds | Ch1.4 | Ch1.4 (kept; adds `2s * 3` factor note) |
| Keywords: reserved vs contextual | missing | **ChF.8** |
| Default imports (`layout`/`styles`/`provider`/`locales`) | ✱ used; Ch5.5 shows `locales` | **ChF.3** |
| Named asset imports (`import x from "./f.html" (as …)?`) | missing | **ChF.4** (real: `hint.html`) |
| Library action import with alias | Ch2.6 (no alias) | **ChF.5**, Ch2.8 (adds `as`) |
| Private actions (library only) | Ch2.6 | ChF.5 (`private action` and `private endable action`) |
| Extensions import (host module) | missing | **ChF.6** (declaration) + **Ch5.8** (call, real `host.js`) |
| Languages block | ✱ used | **ChF.2** (two languages, `*` default) |
| Locales and typed labels (LabelController key validation) | Ch5.5 (illustrative) | **Ch5.7** (real `locales.json`, hub title, live `nl-NL` switch), Ch7.14 (locale editor, *Generate language block*) |
| Regular action | Ch2.1 | Ch2.1 |
| Endable action | Ch2.5 | Ch2.5 (callout fixed) |
| Typed parameters and gradual typing | Ch2.2 | Ch2.2 (+ "leave the type off") |
| Unified call syntax | Ch2.3 (wrong) | Ch2.3 (fixed, F2) |
| Controllers via `addController` | Ch5.4 | **Ch5.6** (desugaring, nine controllers, positional params) |
| Event actions (`on event … action …`) | Ch5.3 (button not wired) | **Ch5.3** (wired on enter; a display line with `topic`), optional parens in callout |
| Timeline declaration | Ch1.1 | Ch1.1 |
| Header options: `loop`, `duration`, `scroll` (+ the `custom` provider) | missing | **Ch1.2** (+ the scroll-container check in a comment) |
| Timed event with range | Ch1.3 | Ch1.3 |
| Duration ranges (`for`) and optional end block | ✱ used | **Ch1.3**, Ch1.7 |
| Relative times | Ch1.5 | Ch1.5 |
| Time arithmetic | Ch1.5 (incomplete snippet, F18) | Ch1.5 |
| Time constants (`const beat = 7s`, `@beat`) | missing | **Ch1.6** (real: Ch1 is written with `@beat`) |
| Event labels and references (`as x`, `x.start/.end`) | ✱ used (Ch4) | **Ch1.6** (real: Ch1 beats labelled), Ch4.5 |
| Sequence block | Ch4.2 | Ch4.2 |
| Sequence items: inline blocks, `each`/`then`, labels | ✱ used | **Ch4.5** (real: the chapter's own `each [ clearSpots() ] then [ … toggleClass("lit") ]`) |
| Stagger block | Ch4.4 (real) | Ch4.4 |
| Stagger anchor (`at <time>`) | ✱ used | **Ch4.6** (real) |
| Timeline lifecycle blocks | ✱ used (header comment only) | **Ch1.8** (real: the chapter's own `on enter` / `on leave` in the recap; callout: one open-ended action, not in the duration, leave on navigate/stop only), Ch5.4/5.5 (what `on enter` wires) |
| `target` clause | missing | **Ch1.7** (real: lights a box for the beat) |
| `with` statement | ✱ used (`clearSpots`) | **Ch3.7** (real: `clearSpots`, `resetChapter`) |
| Insert selectElement quick fix | missing | **Ch7.4** |
| `if` / `else if` / `else` | Ch3.3 (real, no else-if) | **Ch3.4** (real three-way badge) |
| `else if` chains | missing | Ch3.4 |
| `for` loop | Ch3.4 (real) | **Ch3.5** (real, `@@p`, `@@loopIndex`, `@@loopLength`) |
| `break` / `continue` | Ch3.5 (illustrative) | **Ch3.6** (real number chips; compile verified, DOM in WP-4's browser check) |
| `const` declarations and scope | Ch3.1 (wrong, F4) | **Ch3.1** (folding vs runtime) |
| References and sigils | Ch3.6 | **Ch3.8** (adds `@@p`, `@const`, bare param) |
| Operators and precedence | Ch3.2 (wrong, F6) | **Ch3.3** |
| Runtime string concatenation | missing | **Ch3.3** (display), **Ch3.6** (real: `with "#c3-n-" + @@n` → concatenateStrings, verified) |
| Runtime values in operation arguments | missing | **Ch2.4** (F3) |
| Interaction statements (`on <event> "<sel>" <verb>`) | ✱ used (`navigate` only) | **Ch5.4** (real: `navigate`, `run`, `toggle` in the chapter's own `on enter`; `play`/`pause`/`stop`, `seek <label>` and `navigate … at` are display lines) |
| Key interactions (`on key`) | missing | **Ch5.5** (real: `Escape`/`space`/`r` → `run replayChapter(…)`), Hub digits |
| Operation-data dataflow and contracts | missing | **Ch2.6** |
| Erased parameters save/restore | missing | **Ch2.7** |
| `setData` target validation | missing | **Ch7.2** (Problems panel) |
| CSS class and selector validation | Ch6.3 (wrong text, F21) | **Ch7.3** |
| Selectors through action parameters | missing | **Ch2.7** (`twice("#hero")`: the argument is checked as a selector; callout), **Ch7.3** (second squiggle) |
| Readable syntax errors | missing | **Ch7.2** |
| Formatter | missing | **Ch7.10**, **ChC.10** |
| Eligian map and runtime errors in source | missing | **Ch7.12**, **ChC.5** |
| Eligius configuration lint | missing | **Ch7.12**, **ChC.7** |
| CLI compile / bundle | missing | **ChC.3, ChC.4** |
| CLI check | missing | **ChC.6, ChC.7** |
| CLI dev | missing | **ChC.9** |
| CLI smoke | missing | **ChC.8** |
| CLI init and starters | missing | **ChC.2** |
| CLI fmt | missing | **ChC.10** (every CLI option and exit code: §3c) |
| VS Code editor features (commands, settings, panels) | Ch6 (7 features, partly wrong) | **Ch7.1–7.15**, one row per item in §3b |

Not enumerated individually (as in the inventory): the 43 Eligius event names, the operation registry contents, the nine controllers' parameters — Ch5.6 lists the controller names, Ch7.5 shows completion of operations/events/keys/timeline names.

### 3b. Extension coverage (one row per contributed item; checked in WP-8)

| Item (`packages/extension/package.json` unless noted) | Beat |
|---|---|
| Command `eligian.compile` *Eligian: Compile Current File* (also editor context menu) | Ch7.14 |
| Command `eligian.newPresentation` *Eligian: New Presentation…* (starters from `starters.ts`) | Ch7.14 |
| Command `eligian.preview` *Eligian: Preview Timeline* + keybinding `ctrl+k v` / `cmd+k v` (also context menu) | Ch7.11 |
| Command `eligian.previewAt` *Eligian: Preview From Time* (hidden from the palette; CodeLens / Gantt double-click) | Ch7.11, Ch7.13 |
| Command `eligian.openLabelEditor` *Eligian: Edit Locales* (also context menu) | Ch7.14 |
| Command `eligian.showTimelineView` *Eligian: Show Timeline View* + the `Eligian` panel container with the `Timeline` webview view | Ch7.13 |
| Command `eligian.findEligianReferences` *Eligian: Find Eligian References* (CSS / HTML context menu) | Ch7.8 |
| Internal command `eligian.generateJSDoc` (the `/**` template) | Ch7.7 |
| Internal command `eligian.openLocaleFile` (Ctrl+Click on the `locales` path) | Ch7.14 |
| Internal commands `eligian.createLabelsFile`, `eligian.createLabelEntry` (label quick fixes) | Ch7.14 callout |
| Custom editor `eligian.localeEditor` *Locale Editor* (`**/*locale*.json`, Open With) | Ch7.14 |
| Snippets `snippets/eligian.json`: Action, Endable action, Event action, Timeline, Chapter timeline, Languages block, Library | Ch7.10 |
| Setting `eligian.validation.selectorNotInLayout` | Ch7.3 callout, Ch7.15 |
| Setting `eligian.validation.eligiusLint` | Ch7.12, Ch7.15 |
| Setting `eligian.preview.highlightActiveEvents` | Ch7.11, Ch7.15 |
| Setting `eligian.codeLens.preview` | Ch7.11, Ch7.15 |
| Setting `eligian.codeLens.cssReferences` | Ch7.8, Ch7.15 |
| Settings `eligian.inlayHints.parameterNames`, `.sequenceTimes`, `.staggerTimes`, `.computedTimes`, `.timelineDuration` | Ch7.6, Ch7.15 |
| Diagnostics: syntax errors, semantic rules, `setData` targets | Ch7.2 |
| CSS / selector validation + *Change to* / *Create '.x' in …* fixes | Ch7.3 |
| Dataflow errors + *Insert selectElement* / *Add target* fixes | Ch7.4 |
| Completion (operations, actions, controllers, CSS, DOM events, keys, timeline names, label keys, event skeletons) | Ch7.5 |
| Signature help, inlay hints | Ch7.6 |
| Hovers: call (JSDoc + requirements), definition (roles), timeline header, operations | Ch7.7 |
| Go to Definition, references, CSS CodeLens, rename, *Change to "…"* / *Create timeline "…"* on a navigate target | Ch7.8 |
| Outline / document symbols | Ch7.9 |
| Format Document, block-label decorations, *Convert to '… for …'* range refactor | Ch7.10 |
| Preview webview: controls, scrubber, timeline / language selects, *Keep position on reload*, EventBus Debug Viewer, Compilation Errors + *Retry Compilation*, *Preview from* CodeLens, playhead highlight | Ch7.11 |
| Runtime-error diagnostics (`eligius-runtime`) + toast with *Go to Source*; Eligius lint diagnostics (`Eligius lint`) | Ch7.12 |
| Timeline (Gantt) view | Ch7.13 |
| *Generate language block* fix | Ch7.14 |
| Hot reload of CSS / HTML / locales / host module; untrusted-workspace host stand-ins | narration only (Ch7.11, Ch6.8) |

### 3c. CLI coverage (one row per command, option and exit code; checked in WP-9)

| Item (`eligian <command> --help`, eligian 1.0.1) | Beat |
|---|---|
| bins `eligian`, `eligian-cli` (`packages/cli/package.json` `bin`); `-V/--version`, `-h/--help`, `help [command]` | ChC.1 |
| `compile <input>` (the default command: `eligian <input>`) | ChC.3 |
| compile `-o/--output <file>` (`-` = stdout), `--check`, `--minify`, `--no-optimize`, `-v/--verbose`, `-q/--quiet` | ChC.3 |
| compile `--bundle`, `--inline-threshold <bytes>`, `--sourcemap`, `--force` | ChC.4 |
| compile `--eligian-map` | ChC.5 |
| `check <patterns...>` (files, directories, globs, `!` excludes), `--max-warnings <n>`, `--warnings-as-errors` | ChC.6 |
| check `--format` (pretty / json / sarif / github), `--no-lint`, `--selector-not-in-layout` (off / ids / all) | ChC.7 |
| `smoke <patterns...>`, `--format` (pretty / github / json), `--strict` | ChC.8 |
| `dev <input>`, `-p/--port <port>` (next free one when taken), `--open` | ChC.9 |
| `fmt <patterns...>`, `--check` (default), `--write`, `--format` (text / github) | ChC.10 |
| `init [dir]`, `-t/--template` (blank / chapters / video / library), `--title <title>`, `--force` | ChC.2 |
| exit codes 0 / 1 / 2 / 3 | ChC.11 |

---

## 4. Language chapters, beat by beat

### 4.0 Shared mechanics that every chapter uses (WP-1)

**Beat body convention** (unchanged): `narrate("…")`, `revealBlock("#…code…")`, optional `spotlight("#…tok…")`, optional `callout("#…cl…", "…")`, `demo("#…fx…")`, optional REAL self-demo call. Chapters are `sequence each [ clearSpots() ] { for Ns as <label> [ … ] × N }` with every item labelled (`as b1`, `as b2`, …) so sub-steps and real demos after the sequence can anchor on `bK.start` / `bK.end`.

**Timeline skeleton** (replace every chapter's `on enter` / `on leave`):

```eligian
timeline "Logic" in "#stage" using raf {
  on enter [
    enterChapter("#ch3")
    on click "#c3-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch3")   // reset, then seek 0: a bare seek 0s keeps every class earlier beats added
  ]
  on leave [
    leaveChapter("#ch3", "#c3-to-hub")
  ]
  sequence each [ clearSpots() ] {
    // beats
  }
}
```

New `presentation.eligian` actions (names checked against the registry: none is an operation):

```eligian
/**
 * Enter a chapter: show its view and the narration, and let the engine's
 * ProgressbarController fill #progress-fill (it follows pause, seek and replay).
 * @param {string} view CSS selector of the chapter view (#ch3)
 */
action enterChapter(view: string) [
  showView(view)
  showView("#narration")
  selectElement("#progress-fill")
  addController("ProgressbarController")
]

/**
 * Undo everything a chapter's beats did to its own view, so re-entering or
 * replaying it starts like the first visit. Runs in on leave and in replayChapter.
 * @param {string} view CSS selector of the chapter view (#ch3)
 */
action resetChapter(view: string) [
  with view + " .in" { removeClass("in") removeClass("typing") }
  with view + " .active" { removeClass("active") }
  with view + " .show" { removeClass("show") }
  with view + " .spot" { removeClass("spot") }
  with view + " .lit" { removeClass("lit") }
  with view + " .muted" { removeClass("muted") }
]

/**
 * Replay a chapter: reset its view, then seek to 0. A seek alone only ends the
 * actions that no longer cover the position and starts those that do, so it
 * would keep every class earlier beats added. Bound per chapter as
 * on key "r" run replayChapter("#chN") (run arguments are literals).
 * @param {string} view CSS selector of the chapter view
 */
action replayChapter(view: string) [
  resetChapter(view)
  broadcastEvent([0], "timeline-seek-request")
]

/**
 * Leave a chapter: hide its view and the narration, reset it, and detach the
 * controllers its on enter attached (the engine never detaches controllers on
 * a timeline switch). Exactly three `on key` statements per chapter: one
 * removeControllerFromElement per KeyboardController (checked by the
 * controller-balance test, WP-1).
 * @param {string} view CSS selector of the chapter view
 * @param {string} back CSS selector of the chapter's Hub button
 */
action leaveChapter(view: string, back: string) [
  hideView(view)
  hideView("#narration")
  resetChapter(view)
  with "#stage" {
    removeControllerFromElement("KeyboardController")
    removeControllerFromElement("KeyboardController")
    removeControllerFromElement("KeyboardController")
  }
  with back { removeControllerFromElement("DOMEventListenerController") }
  with "#progress-fill" { removeControllerFromElement("ProgressbarController") }
]
```

Verified: `with view + " .code" { … }` (runtime concatenation as a `with` selector) compiles; `with "#stage" { removeControllerFromElement("KeyboardController") }` compiles and smokes; compound literal selectors such as `"#ch3 .code"` are validated per component (`"#ch3 .fxx"` → `Unknown CSS class in selector: 'fxx'. Did you mean: fx, fn?`). Verified in review (scratch copy of the tour, `check --max-warnings 0` + `smoke`): `enterChapter` with `addController("ProgressbarController")` (no `textElement` needed: the controller writes its percentage text only when one is given, `engine-factory-*.mjs:9050-9062`), `on key "r" run replayChapter("#ch1")`, and the `ProgressbarController` removal. `.lit` is a new state class (tour.css) for "lit for the duration of a beat" elements. A chapter that attaches more listeners in `on enter` (Ch5's ping button) removes them itself in `on leave`, before `leaveChapter`.

**Per-beat sub-steps**: after the sequence, `at bK.start + 2s for 5s [ revealCard("#…pop…") ]` reveals a popup or line inside a beat (end block optional; `resetChapter` cleans `.in`). Only labels of *earlier* events may be referenced, so these `at` events always follow the sequence in the source.

**layout.html per chapter**: `<section id="chX" class="view chapter">` with `header.chrome` (`button#cX-to-hub.to-hub`, `nav.progress-rail` with **8** dots, `span.chapter-label`), `section.code-pane` (`pre#cX-code-*.code > code`, tokens `span.tok.kw|str|num|op|fn|com`, `id="cX-tok-*"` on spotlighted tokens), `section.effect-pane` (`div#cX-fx-*.fx`), `div.callout-layer` (`div#cX-cl-*.callout`). Every existing chapter's rail grows from 6 to 8 dots (`is-current` at the display index).

**CSS state classes**: the shared state rules (`.in`, `.active`, `.show`, `.lit`, `tour.css:840-858`) are one class each (specificity 0,1,0). A component hidden by a two-class or id rule is not revealed by them: `#c3-badge { opacity: 0.35 }` already beats `.active` today, and `.term-line.out { opacity: 0 }` would beat `.in`. Every such component declares its own reveal rule (`#c3-badge.active`, `.term-line.out.in`, `.term-line.cmd.later.in`, `.ide-pop.in`), or stays single-class and is declared before the state-class section.

**Progress bar** (WP-1): `enterChapter` attaches the ProgressbarController to `#progress-fill`, so the fill follows the timeline's real duration, pause, seek and replay. WP-1 deletes the six per-chapter `#stage:has(#chX.is-active) #progress-fill { animation: … }` rules and the `@keyframes progress-fill`; `#progress-fill` keeps `width: 0` plus `transition: width 0.25s linear` (the controller sets the width; it also makes `#progress` clickable to seek, `engine-factory-*.mjs:9064-9071`). No chapter carries a hand-kept length any more.

**tour.css per chapter**: one `#<anchor> { anchor-name: --cX-cl-*; }` + `#cX-cl-* { position-anchor: --cX-cl-*; }` pair per callout; block chips added to the `@supports (anchor-name)` list; the `@supports not` fallback table is extended to beat indexes 1–15 (`top: 3rem + 3rem × (k − 1)`).

**Hub**: see §7.

### 4.1 Chapter 01 — Timeline & Time (`#ch1`, timeline `"Timeline & Time"`, 58 s)

Self-demo upgrade: the chapter is rewritten with the forms it teaches: `const beat = 6s` (program level), `at 0s for @beat as open […]`, `at open.end for @beat as providers […]`, …, and one `target` beat with an end block. It keeps explicit `at` events (no sequence), so the recap can show a real `at` chain.

```eligian
const beat = 6s          // Chapter 1's basic beat (a time constant)
const long = @beat + 2s  // 8s

timeline "Timeline & Time" in "#stage" using raf {
  on enter [
    enterChapter("#ch1")
    on click "#c1-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch1")
  ]
  on leave [ leaveChapter("#ch1", "#c1-to-hub") ]

  at 0s for @beat as open [ … ]                      // beat 1
  at open.end for @beat as providers [ … ]           // beat 2
  at providers.end for @long as ranges [ … ]         // beat 3
  at ranges.end for 7s as units [ … ]                // beat 4
  at units.end for @long as arith [ … ]              // beat 5
  at +0s for @long as constants [ … ]                // beat 6: relative, chains off beat 5
  at constants.end for 7s as targets target "#c1-target-box" [ addClass("lit") … ] [ removeClass("lit") ]   // beat 7
  at targets.end for @long as recap [ … ]            // beat 8
}
```

Totals 6+6+8+7+8+8+7+8 = **58 s** (the timeline's duration, which the ProgressbarController reads).

| Beat | Narration | Code block · snippet | Spot / callout | Effect | Real code |
|---|---|---|---|---|---|
| 1 open (0–6) | "An Eligian presentation is one or more timelines. Here's the one you're watching." | `#code-ch1` kept: `timeline "Tour" in "#stage" using raf { … }` | `#tok-timeline`; `#cl-name`: "its name — also what navigate and the engine's uri use" | `#fx-stage` | — |
| 2 providers (6–12) | "What advances the timeline? Its provider — and the header can loop it or fix its duration." | **new** `#c1-code-providers`: `timeline "Clip" in "#player" using video from "./clip.mp4" { … }` / `timeline "Story" in "#stage" using scroll "#scroller" duration 120s { … }` / `timeline "Ambient" in "#bg" using raf loop duration 30s { … }` / `timeline "Remote" in "#stage" using custom { … }   // your own position source` / `// scroll: the container must be in the layout or the CSS, and scroll` | `#tok-raf`; `#cl-provider`: "raf = animation clock · video / audio drive from media · scroll = the scroll position · custom" | `#fx-providers` + a `scroll` chip | — |
| 3 ranges (12–20) | "Inside a timeline, at schedules work over a time range: start to end, or start for a duration." | `#code-at` → `at 0s..5s    revealHero()   // start .. end` / `at 5s for 3s revealHero()   // start for duration` | `#tok-at`; `#cl-range`: "a time range: start .. end — or start for duration" | `#fx-hero` | — |
| 4 units (20–27) | "Times take units. No unit means seconds — and in arithmetic a bare number is a factor." | `#code-units` kept + `2s * 3   // 6s` | `#cl-units` block chip "42 = 42s · 500ms · 2s · 1.5m · 0.5h" | `#fx-ruler` | — |
| 5 arith (27–35) | "Ranges can compute — and chain off the previous event with a +." | `#code-arith` → `at 5s + 2s .. 10s  doThing()` / `at 10s / 2 for 1s  doThing()` / `at +0s..+3s        doThing()   // relative to the previous event's end` (F18) | `#tok-plus`; `#cl-relative`: "relative time — anchored to the previous event's end" | `#fx-chain` | — |
| 6 constants (35–43) **new** | "Name a time once with const, label an event with as, and later times refer to them. This chapter is timed exactly that way." | **new** `#c1-code-labels`: `const beat = 6s` / `at 0s for @beat as open [ … ]` / `at open.end for @beat as providers [ … ]` / `at providers.end + 1s..providers.end + 3s [ … ]` | **new** `#c1-tok-label` (on `as open`); **new** `#c1-cl-label`: "@beat is a compile-time constant · open.end refers to an earlier event of this timeline" | **new** `#c1-fx-labels`: two `.fx-bar`s with chips `open` `providers` | the event itself is `at open.end for @beat as providers` |
| 7 target (43–50) **new** | "target selects an element for a block's start and its end — and an inline end block is optional." | **new** `#c1-code-target`: `at 0s..5s target "#box" [ addClass("lit") ] [ removeClass("lit") ]` / `at 5s for 2s [ selectElement("#box") addClass("spot") ]   // no end block` | **new** `#c1-tok-target`; **new** `#c1-cl-target`: "selectElement at the head of both blocks; nothing carries from start to end" | **new** `#c1-fx-target` > `span#c1-target-box.fx-hero-box` | the beat is `at … target "#c1-target-box" [ addClass("lit") narrate(…) … ] [ removeClass("lit") ]`: the box lights at 43 s and unlights at 50 s |
| 8 recap (50–58) | "That whole chapter? One timeline: on enter shows it, on leave cleans up, neither counts toward its 58 seconds, and its beats are timed with a constant and labels. Hub, space pauses, r replays." | `#code-full` → the chapter's real header: `const beat = 6s` / `timeline "Timeline & Time" in "#stage" using raf {` / `  on enter [ enterChapter("#ch1") … on key "r" run replayChapter("#ch1") ]` / `  on leave [ leaveChapter("#ch1", "#c1-to-hub") ]   // on navigate or stop, not when the content ends` / `  at 0s for @beat as open [ … ]` / `  at open.end for @beat as providers [ … ]` / `}` | **new** `#c1-tok-enter` (on `on enter`); **new** `#c1-cl-lifecycle`: "one open-ended action { start: 0 }, not counted in the duration · on leave runs on navigate / stop, not when the content ends" | `#fx-endcard` "Chapter 1 ✓" | the displayed lifecycle blocks and events are this timeline's own |

Snippet validity: `at 0s..5s target "#box" [ … ] [ … ]` = `'at' TimeRange ('as' …)? ('target' STRING)? InlineEndableAction` (`eligian.langium:656-660,731-733`); `using scroll "#scroller" duration 120s` and `using raf loop duration 30s` follow `eligian.langium:594-597`; arithmetic ranges per `:746-764`; lifecycle blocks per `:606-618` (one open-ended action `{ start: 0 }`, not counted in the duration; `LANGUAGE_SPEC.md:1897-1921`); `custom` per `:621`. The scroll-container check is verified: `Unknown scroll container '#scroller': it is not in the layout HTML or the imported CSS` (`unknown_scroll_container`, `validators/timeline-validator.ts:219`), so a scratch paste of beat 2's snippet needs `#scroller` in the scratch layout. Verified compile of `const beat = 7s`, `at 0s for @beat as intro […]`, `at intro.end + @long for 2s as closing target "#hero" [ … ] [ … ]`, `using raf loop duration closing.end + 1s`.

layout.html additions: `pre#c1-code-providers`, `pre#c1-code-labels`, `pre#c1-code-target`, chip `scroll` in `#fx-providers`, `div#c1-fx-labels.fx`, `div#c1-fx-target.fx > span#c1-target-box.fx-hero-box`, callouts `#c1-cl-label`, `#c1-cl-target`, `#c1-cl-lifecycle`, token `#c1-tok-enter` in `#code-full`; rail 8 dots. tour.css: `.lit { box-shadow: 0 0 0 3px var(--accent); opacity: 1; }` (also used by Ch4, Ch7, Ch8), anchors `#c1-tok-label → --c1-cl-label`, `#c1-tok-target → --c1-cl-target`, `#c1-tok-enter → --c1-cl-lifecycle`, fallback rows 6/7/8.

### 4.2 Chapter 02 — Actions & Composition (`#ch2`, timeline `"Actions"`, 62 s)

Beats 7+7+8+8+8+8+8+8 = **62 s**; sequence items labelled `as b1` … `as b8`.

| Beat | Narration | Code block · snippet | Spot / callout | Effect | Real code |
|---|---|---|---|---|---|
| 1 def (0–7) | kept | `#c2-code-def` kept | kept | `#c2-fx-chain` | — |
| 2 params (7–14) | "Actions take parameters. Annotate types when you want the compiler's help — or leave the type off." | `#c2-code-params` kept | `#c2-tok-param`; `#c2-cl-param`: "optional type — string · number · boolean · object · array; no annotation = unchecked" | `#c2-fx-fade` | — |
| 3 call (14–22) | "Inside a block, calling your action looks exactly like calling a built-in operation." (F2) | `#c2-code-call`: `at 0s..5s fadeIn("#hero", 400)                 // your action` / `at 0s..5s target "#hero" [ addClass("on") ]   // built-in op, in a block` | `#c2-tok-call`; `#c2-cl-call`: "one syntax: action first, then built-in op; a bare operation is not a timeline event" | `#c2-fx-call` | — |
| 4 by-name (22–30) | "Parameters flow into operations by name — and when the names differ, the compiler bridges them." (F3) | `#c2-code-byname`: `action narrate(template) [ selectElement("#narration") setElementContent(template) ]   // same name: forwarded` / `action say(text) [ selectElement("#narration") setElementContent(text) ]   // bridged by setOperationData` | `#c2-tok-template`; `#c2-cl-name`: "same name → passed straight through · other name → a setOperationData before the operation" | `#c2-fx-slot` → chips `template → setElementContent` and `text → setOperationData → template` | — |
| 5 endable (30–38) | kept | `#c2-code-endable` kept, comment `// re-select: start and end are separate runs` | `#c2-cl-endable`: "start & end run separately — re-select in each, or use target" | `#c2-fx-toggle` | — |
| 6 contracts (38–46) **new** | "The compiler knows what each block carries. Call an action that needs a selected element where there is none, and it tells you." | **new** `#c2-code-contract`: `action highlight() [ addClass("on") ]   // needs selectedElement` / `at 1s..2s highlight()                   // ✗ requires 'selectedElement'` / `at 1s..2s target "#box" highlight()     // ✓` | **new** `#c2-tok-contract`; **new** `#c2-cl-contract`: "an inferred contract — the hover says Requires from the caller" | **new** `#c2-fx-contract`: `.diagnostic` with the verified text `Action 'highlight' requires 'selectedElement' (used by addClass in 'highlight'), which is not available here - ensure it is created before calling 'highlight' (for example with selectElement)` | — |
| 7 erased (46–54) **new** | "selectElement consumes its selector. Your parameter survives anyway: the compiler saves and restores it." | **new** `#c2-code-erased`: `action twice(selector) [` / `  selectElement(selector)   // erases 'selector'…` / `  addClass("on")` / `  selectElement(selector)   // …but the parameter was kept` / `]` / `twice("#hero")              // checked as a selector at the call: CSS ∪ layout` | **new** `#c2-tok-erased`; **new** `#c2-cl-erased`: "saved as __eligian_param_selector around the operation; found by eligian smoke · a parameter that reaches a selector is checked at every call (spec 056)" | **new** `#c2-fx-erased`: chips `selector → selectElement → (saved) → selector` | — |
| 8 libraries (54–62) | "Group actions into a library and import what you need — renamed if you like. Chapter 05 goes deeper. Hub." | `#c2-code-lib` + `import { revealBlock, narrate as say } from "./presentation.eligian"` | — | `#c2-fx-lib` "Chapter 2 ✓" | — |

Why: F2, F3; `LANGUAGE_SPEC.md:1303-1352` (contracts, erased parameters); alias per `eligian.langium:263-264`. layout: `pre#c2-code-contract`, `pre#c2-code-erased`, `div#c2-fx-contract.fx`, `div#c2-fx-erased.fx`, callouts `#c2-cl-contract`, `#c2-cl-erased`; tour.css anchors + rows 6/7. The `.diagnostic` class already exists (inside the Ch6 mock block, `tour.css:663-671`) and moves, with `.squiggle` and `.hover-card`, to a shared "mock UI" section of tour.css in **WP-3** (Ch2 needs it); WP-8 then replaces only the `.mock-*` / `.complete-*` rules.

### 4.3 Chapter 03 — Logic & Data (`#ch3`, timeline `"Logic"`, 64 s)

Beats 8+7+9+9+9+8+7+7 = **64 s**; items `as b1` … `as b8`. Helper actions (top of `tour.eligian`, house rule: `const` inside actions):

```eligian
// Chapter-3 helpers: the executed code mirrors the taught snippets.
// House rule: const lives in actions (or at program level), not in timeline
// blocks, so the loop and the conditional live here.
action ch3Badge(count) [
  // count is a runtime parameter, so this emits a real when / otherwise / endWhen
  selectElement("#c3-badge")
  if (count > 0) {
    removeClass("muted")
    addClass("active")
  } else if (count == 0) {
    removeClass("active")
    addClass("muted")
  } else {
    removeClass("active")
    removeClass("muted")
  }
]

action ch3RevealBullets() [
  const points = ["#c3-b1", "#c3-b2", "#c3-b3"]   // folded into forEach's collection
  for (p in @points) {
    selectElement(@@p)                           // the loop item (= @@currentItem)
    addClass("in")
  }
]

action ch3LoopControl() [
  const numbers = [0, 3, 7, 12]
  for (n in @numbers) {
    if (@@n == 0) { continue }                   // continueForEach
    if (@@n > 9) { break }                       // breakForEach
    with "#c3-n-" + @@n { addClass("lit") }      // runtime concat: "#c3-n-3", "#c3-n-7"
  }
]
```

`ch3Badge` is verified in shape (`if / else if / else` compiles to nested when/otherwise/endWhen; dataflow: `selectElement` before the branches so each branch has `selectedElement`). `ch3RevealBullets` verified (`forEach { collection: [...], itemName: "p" }`, `selectElement { selector: "$scope.currentItem" }`). `ch3LoopControl`: **verified** in review: `with "#c3-n-" + @@n` compiles to `setOperationData` strings + `concatenateStrings` + `selectElement` of the result and smokes; `continue` / `break` land on 0 and 12 (`LANGUAGE_SPEC.md:1936-1940,2317-2340`). The DOM result (chips 3 and 7 lit) is WP-4's browser acceptance. Dataflow note: the `for` body adds nothing afterwards, and `with` selects inside the body, so no missing-dependency is expected.

| Beat | Narration | Code block · snippet | Spot / callout | Effect | Real code |
|---|---|---|---|---|---|
| 1 const (0–8) | "const names a value. Known at compile time it is inlined wherever you write @name; a runtime value becomes a scope variable." (F4, F5) | `#c3-code-const`: `const theme = "dark"            // inlined: @theme → "dark"` / `const beat = 7s                 // a time constant (program level only)` / `action greet(label) [` / `  const greeting = "hi"         // inlined too` / `  const copy = label            // runtime → setVariable; read as $scope.variables.copy` / `  selectElement("#greeting")` / `  setElementContent(@greeting)` / `]` | `#c3-tok-const`; `#c3-cl-const`: "@name reads a const · literal → folded in · runtime value → scope variable" | `#c3-fx-scopes` → chips `"dark" (inlined)` `$scope.variables.copy` | — |
| 2 literals (8–15) **new** | "Values are literals: strings in either quote, numbers, booleans, null, objects and arrays." | **new** `#c3-code-literals`: `"text"  'text'  42  3.14  true  false  null` / `{ opacity: 1, from: 0 }        // keys may be any word, even keywords` / `["#c3-b1", "#c3-b2", "#c3-b3"]` | **new** `#c3-tok-literal` (on the object); **new** `#c3-cl-literal`: "no negative literals: -2 is unary minus applied to 2" | **new** `#c3-fx-literals`: chips `string` `number` `boolean` `null` `object` `array` | — |
| 3 operators (15–24) | "Operators fold at compile time. On runtime values they belong in if conditions — except string +, which joins at runtime." (F6) | `#c3-code-expr`: `const total = 2 ** 3 * 2 + 1       // 17, folded; ** binds tightest` / `if (count >= 3 && enabled) { … }  // comparisons & logic on runtime values: in if` / `selectElement("#" + slideId)      // runtime string concatenation` / `calc(count, 1, "+")                // runtime arithmetic is an operation` | `#c3-tok-expr` (on `**`); `#c3-cl-expr`: "** · unary - ! · * / % · + - · < <= > >= · == != · && · ||" | `#c3-fx-eval` → chips `2 ** 3 * 2 + 1 → 17` `"#" + "hero" → "#hero"` | — |
| 4 if / else if (24–33) | "if / else if / else runs operations conditionally — when, otherwise, endWhen, nested." | `#c3-code-if` (= `ch3Badge`'s body): `selectElement("#c3-badge")` / `if (count > 0) {` / `  removeClass("muted") addClass("active")` / `} else if (count == 0) {` / `  removeClass("active") addClass("muted")` / `} else {` / `  removeClass("active") removeClass("muted")` / `}` | `#c3-tok-if`; `#c3-cl-if`: "else if = else { if … }: a when nested in the otherwise" | `#c3-fx-if` > `#c3-badge` | `ch3Badge(2)` at the beat; `at b4.start + 4s for 1s [ ch3Badge(0) ]` and `at b4.start + 6s for 1s [ ch3Badge(-1) ]` after the sequence: the badge goes active (full) → muted (dim, grey) → plain |
| 5 for (33–42) ⭐ | "for iterates a collection — and this list is being revealed by one right now." | `#c3-code-for`: `const points = ["#c3-b1", "#c3-b2", "#c3-b3"]` / `for (p in @points) {        // forEach / endForEach` / `  selectElement(@@p)        // the item; @@loopIndex, @@loopLength too` / `  addClass("in")` / `}` (F29) | `#c3-tok-for`; `#c3-cl-for`: "@@p is the loop item (= @@currentItem); @@loopIndex / @@loopLength count" | `#c3-fx-list` | `ch3RevealBullets()` |
| 6 break / continue (42–50) | "continue skips an item, break leaves the loop — only inside a for. Watch 0 skipped and the run stop at 12." | `#c3-code-loopctl`: the body of `ch3LoopControl` | `#c3-tok-break`; `#c3-cl-loopctl`: "continue → continueForEach · break → breakForEach · outside a for: compile error" | `#c3-fx-loopctl` → chips `span#c3-n-0` `#c3-n-3` `#c3-n-7` `#c3-n-12` (`.lit` = highlighted) | `ch3LoopControl()` |
| 7 with (50–57) **new** | "with selects an element for a block, in any action or event — this tour's clearSpots is two with blocks." | **new** `#c3-code-with`: `with ".tok" { removeClass("spot") }      // selectElement(".tok"), then the block` / `with "#" + id { addClass("lit") }        // any expression; the selection stays` | **new** `#c3-tok-with`; **new** `#c3-cl-with`: "the selection stays after the block — there is nothing to restore" | **new** `#c3-fx-with`: chips `selectElement(".tok")` → `removeClass("spot")` | `clearSpots()` (the prelude) |
| 8 sigils (57–64) | "Where data lives: $operationdata, $globaldata, $scope — and the short forms you have been reading. Hub." | `#c3-code-sigils`: `$operationdata.x   // this block's data` / `$globaldata.x      // program-wide` / `$scope.x           // loop / branch scope` / `selector           // a parameter → $operationdata.selector` / `@beat              // a const` / `@@p  @@loopIndex   // loop scope → $scope.…` | `#c3-tok-sigil` | `#c3-fx-sigils` "Chapter 3 ✓" | — |

Why: F4, F5, F6, F27, F28, F29; `eligian.langium:434-436` (else if), `:874-921` (references), `:927-972` (literals), `LANGUAGE_SPEC.md:2259-2375`. layout: `pre#c3-code-literals`, `pre#c3-code-with`, `div#c3-fx-literals.fx`, `div#c3-fx-with.fx`, chips `#c3-n-0..12` replace the plain chips in `#c3-fx-loopctl`, callouts `#c3-cl-literal`, `#c3-cl-with`; tour.css: `#c3-badge.active { opacity: 1; }` (the id rule `#c3-badge { opacity: 0.35 }`, `tour.css:583-586`, beats the one-class `.active`, so today's badge never brightens), `#c3-badge.muted { opacity: 0.2; filter: grayscale(1); }` (dimmer than plain), a `.muted` class (so `addClass("muted")` validates), anchors + rows.

### 4.4 Chapter 04 — Timeline Power Tools (`#ch4`, timeline `"Timeline Power Tools"`, 57 s)

Beats 7+8+7+9+9+9+8 = **57 s**; items labelled `as b1`, `as b2`, `as editBeat` (3), `as b4`, `as b5`, `as waveBeat` (6), `as b7`. The sequence gets a real `each … then`:

```eligian
sequence each [ clearSpots() ] then [ with "#c4-pulse" { toggleClass("lit") } ] {
  …
}
// REAL stagger 1 (beat 4): cards reveal from editBeat.end = 22s
stagger 200ms ["#c4-card-1", "#c4-card-2", "#c4-card-3"] at editBeat.end with revealCard() for 1.5s
// REAL stagger 2 (beat 6): the inline form with an end block, anchored on the beat
stagger 150ms ["#c4-wave-1", "#c4-wave-2", "#c4-wave-3"] at waveBeat.start + 1s for 2s [
  selectElement(@@item)
  addClass("lit")
] [
  selectElement(@@item)
  removeClass("lit")
]
```

`then` runs after every item's *end* operations, also for inline items without an end block (verified in review: the compiled `sequence-item-*` actions end with the postlude). Items are back to back, so an item's end operations and the next item's start operations run in the same reconcile, with no paint in between (`engine-factory-*.mjs:11574-11590,11620-11629`): a prelude `addClass("lit")` and a postlude `removeClass("lit")` would cancel out and leave the dot lit all chapter. So the prelude stays `clearSpots()` (visible: the spotlights go out at every beat start) and the postlude flips `#c4-pulse` (a dot in the chrome) with `toggleClass`, so it changes state at every beat boundary. Verified: `then [ with … { toggleClass(…) } ]` compiles and smokes.

| Beat | Narration | Code block · snippet | Spot / callout | Effect | Real code |
|---|---|---|---|---|---|
| 1 manual (0–7) | kept | `#c4-code-manual`: `at 0s..5s   intro()` / `at 5s..15s  main()     // 5 + 10, by hand` / `at 15s..18s outro()    // …and 15 + 3` (F1) | `#c4-cl-manual` | `#c4-fx-ruler` | — |
| 2 sequence (7–15) | kept | `#c4-code-sequence` kept | kept | `#c4-fx-seq` | — |
| 3 edit (15–22) `as editBeat` | kept | (re-uses `#c4-code-sequence`) | `#c4-cl-edit` | `#c4-fx-seq` | — |
| 4 stagger (22–31) ⭐ | kept | `#c4-code-stagger`: `stagger 200ms ["#a", "#b", "#c"] at editBeat.end with revealCard() for 1.5s` | `#c4-tok-stagger`; `#c4-cl-stagger`: "200ms between starts · the item is the action's first argument · at editBeat.end anchors the first item" | `#c4-fx-row` | stagger 1 |
| 5 items (31–40) **new** | "A sequence item can be an inline block, labelled with as; each runs before every item, then after it. each clears the spotlights; then flips this dot at the end of every beat." | **new** `#c4-code-items`: `sequence each [ clearSpots() ] then [ with "#c4-pulse" { toggleClass("lit") } ] {` / `  for 7s as editBeat [ narrate("…") revealBlock("#c4-code-sequence") ]   // inline, labelled` / `  revealCard("#c4-card-1") for 2s` / `}` | **new** `#c4-tok-each`; **new** `#c4-cl-items`: "each → before every item's start ops · then → after every item's end ops, in the same instant as the next each · editBeat.end usable later" | **new** `#c4-fx-items`: chips `each` `item` `then` with the live `#c4-pulse` dot mirrored | the chapter's own `each … then` |
| 6 inline + anchor (40–49) `as waveBeat` **new** ⭐ | "The inline stagger form has its own start and end blocks, and at anchors the first item on a time instead of the previous event. Watch the wave." | `#c4-code-inline` → `stagger 150ms ["#c4-wave-1", "#c4-wave-2", "#c4-wave-3"] at waveBeat.start + 1s for 2s [` / `  selectElement(@@item)` / `  addClass("lit")` / `] [` / `  selectElement(@@item)` / `  removeClass("lit")` / `]` (F14) | **new** `#c4-tok-anchor` (on `at`); `#c4-cl-inline`: "every block starts empty: selectElement(@@item) first · at +2s would count from the previous event" | `#c4-fx-cascade` → chips `span#c4-wave-1..3` | stagger 2 |
| 7 recap (49–57) | "sequence for distinct back-to-back steps; stagger for one effect across many items. Hub." | `#c4-code-recap`: `sequence { a() for 5s  b() for 10s }` / `const cards = ["#a", "#b", "#c"]` / `stagger 200ms @cards with fadeIn() for 1.5s` | `#c4-tok-recap` | `#c4-fx-done` | — |

Verified: inline anchored stagger with `selectElement(@@item)` and an end block compiles and smokes (12 positions); `sequence each […] then […]` with inline labelled items compiles. layout: `span#c4-pulse.pulse-dot` in `#ch4 header.chrome`, `pre#c4-code-items`, `div#c4-fx-items.fx`, `span#c4-wave-1..3.fx-chip` inside `#c4-fx-cascade`, callout `#c4-cl-items`; tour.css: `.pulse-dot` (+ `.pulse-dot.lit`), anchors `#c4-tok-each → --c4-cl-items`, `#c4-tok-anchor → --c4-cl-inline` (replacing the block anchor on `#c4-code-inline`; `#c4-cl-inline` and `#c4-cl-inline::before` also leave both block-chip selector lists, `tour.css:419-436`, so the chip gets the token arrow instead of being pinned to a block corner). `smoke` positions for this timeline will rise (two staggers).

### 4.5 Chapter 05 — Files & Imports (**new**, `#chf`, prefix `cf-`, timeline `"Files & Imports"`, 60 s)

Beats 7+7+8+8+8+8+7+7 = **60 s**; items `as b1` … `as b8`. New text assets: `examples/eligian-tour/hint.html` (one `<p class="hint">…</p>`), used by beat 4; `locales.json` and `host.js` are introduced here and used live in Ch06. Hub card `#card-chf` "05 · Files & Imports".

```eligian
import hint from "./hint.html"          // named asset import (beat 4); read as @hint
extensions "./host.js" {               // beat 6 declares it, Ch06 beat 8 calls it
  operation stampTime(selector: string)
  function shout
}
```

**Verified** in review: `selectElement("#cf-fx-hint") setElementContent(@hint)` resolves and inlines the file as `template` (`setElementContent {template: "<p class=\"hint\">…</p>\n"}`); an unused named import gives no warning either. The `extensions` block above is the **real** declaration (`stampTime` + `shout`, both exported by `host.js`). Beat 6's display adds `controller Confetti`, which must not be copied into it: `smoke` fails when a declared name is not exported (`the extensions module …host.js does not export controllers.Confetti`, `packages/cli/src/dev/host-module.ts:50-66`).

| Beat | Narration | Code block · snippet | Spot / callout | Effect | Real code |
|---|---|---|---|---|---|
| 1 two kinds (0–7) | "An .eligian file is a program — timelines, actions, imports — or a library that starts with library and holds only actions." | `#cf-code-files`: `// tour.eligian — a program` / `languages { * "en-US" "English" }` / `layout "./layout.html"` / `timeline "Hub" in "#stage" using raf { … }` / `` / `// presentation.eligian — a library` / `library presentation` / `action narrate(template: string) [ … ]` | `#cf-tok-library`; `#cf-cl-files`: "a library may import other libraries; no timelines, consts or assets; it cannot be compiled on its own" | `#cf-fx-files`: two `.fx-frame`s `tour.eligian` → `presentation.eligian` | — |
| 2 languages (7–14) | "languages comes first: the codes, their labels, and a star on the default. One entry is its own default." | `#cf-code-languages`: `languages {` / `  * "en-US" "English"` / `    "nl-NL" "Nederlands"` / `}` | `#cf-tok-star`; `#cf-cl-languages`: "xx-XX codes, unique; compiles to language + availableLanguages" | `#cf-fx-languages`: chips `en-US ★` `nl-NL` | the tour's own block (now two languages) |
| 3 default imports (14–22) | "Four default imports, one of each: layout, styles, provider, locales. Paths are relative to the file." | `#cf-code-defaults`: `layout "./layout.html"     // → layoutTemplate` / `styles "./tour.css"        // → cssFiles; classes and selectors are checked against it` / `provider "./clip.mp4"      // → the media a video / audio timeline plays` / `locales "./locales.json"   // → config.locales (needs a languages block)` | `#cf-tok-styles`; `#cf-cl-defaults`: "one of each per file; ./ or ../ only — no absolute paths or URLs" | `#cf-fx-defaults`: chips | the tour's imports |
| 4 named imports (22–30) | "A named import gives an asset a name. An HTML file becomes a string you can place with @name." | `#cf-code-named`: `import hint from "./hint.html"          // type from the extension` / `import theme from "./x.txt" as css      // or forced with as html | css | media` / `` / `selectElement("#cf-fx-hint")` / `setElementContent(@hint)` | `#cf-tok-import`; `#cf-cl-named`: "names are unique per file; contextual keywords allowed as names" | `#cf-fx-hint` (empty `.fx`; the beat fills it) | `cfPlaceHint()` = `selectElement("#cf-fx-hint") setElementContent(@hint)` (verified) |
| 5 library imports (30–38) | "import { … } from a library: public actions by name, renamed with as. private keeps a helper at home." | `#cf-code-lib`: `import { revealBlock, narrate as say } from "./presentation.eligian"` / `` / `library presentation` / `private action setClass(selector, className, visible) [ … ]   // callable here only` / `private endable action spotOn(selector) [ … ] [ … ]   // endable too` / `action reveal(selector) [ setClass(selector, "in", true) ]` | `#cf-tok-private`; `#cf-cl-lib`: "errors: private import, missing action, name clash with an operation or a local action, circular libraries" | `#cf-fx-lib`: chips `public` `private` | — |
| 6 extensions (38–46) | "extensions declares your own JavaScript: operations, controllers and functions the module exports. The compiler trusts the declaration; the bundle carries the module." | `#cf-code-ext`: `extensions "./host.js" {` / `  operation stampTime(selector: string)   // called like a built-in` / `  controller Confetti(count: number)      // addController("Confetti", 25) (display only)` / `  function shout                          // customFunction("shout")` / `}` | `#cf-tok-ext`; `#cf-cl-ext`: "one per program; .js .mjs .ts .mts .jsx .tsx; no Eligius names; params name, name?, name: type" | `#cf-fx-ext`: `.fx-frame` `host.js: export const operations = { stampTime }` | — |
| 7 comments + JSDoc (46–53) | "Comments: // and /* */. A /** doc */ with @param above an action becomes hover documentation." | `#cf-code-doc`: `// a line comment` / `/* a block comment */` / `/**` / ` * Swap the narration line.` / ` * @param {string} template Subtitle text for this beat` / ` */` / `action narrate(template: string) [ … ]` | `#cf-tok-jsdoc`; `#cf-cl-doc`: "typing /** + Enter above an action fills the template (Chapter 07)" | `#cf-fx-doc`: `.hover-card` with `### narrate` / `Swap the narration line.` / `**Parameters:**` / `` - `template` (`string`) - Subtitle text for this beat `` (the `(string)` comes from the JSDoc `{string}`; without braces the hover says `unknown`, `jsdoc/jsdoc-formatter.ts:34-39`) | — |
| 8 keywords (53–60) | "Sixteen reserved words can't be names. Every other keyword is contextual — fine as a parameter or const; action names are stricter. Hub." | `#cf-code-keywords`: `action f(event, duration) [ … ]   // contextual keywords are fine as names` / `const s = 5                        // even a time unit` / `action toggle() [ … ]              // verbs too` / `const for = 1                      // ✗ 'for' is a keyword, so it cannot be used as a name here` | `#cf-tok-reserved`; `#cf-cl-keywords`: "reserved: action break const continue else endable false for if import null on sequence stagger timeline true · action names accept fewer: plain names and the verbs (play, toggle, run, key, …), so action loop() fails (Chapter 07)" | `#cf-fx-done` "Chapter 5 ✓" | — |

Why: `eligian.langium:37-67` (file kinds), `:107-131` (languages), `:198-228` (default/named imports), `:247-264` (library import), `:148-182` (extensions), `:978-1021` (Identifier/FeatureName), `:1045-1049` (comments); `LANGUAGE_SPEC.md:188-218`. Verified: `extensions "./host.js" { operation tourMark(label: string) function shout }` passes `check`, `smoke` (esbuild bundles the module) and `--bundle` (the Pages workflow path). The `'loop'` keyword message is the verified parser text for an action name (`action loop()` → `'loop' is a keyword, so it cannot be used as a name here. Choose another name.`): `loop` is in `Identifier` (`eligian.langium:1000-1009`, parameter / const names) but not in `ActionName` (`:493-495`). A second default import of one kind is an error, verified: `Duplicate 'styles' import. Only one styles import is allowed per document.` (`type-system-typir/validation/import-validation.ts:65`; `eligian.langium:194-199`).

layout: `section#chf.view.chapter` (chrome with `#cf-to-hub`, 8-dot rail, label "05 · Files & Imports"), eight `pre#cf-code-*`, eight `div#cf-fx-*`, eight `div#cf-cl-*`. tour.css: anchors, rows, `#card-chf` in the live-card list. Hub `on enter`: `on click "#card-chf" navigate "Files & Imports"`, `on key "5" navigate "Files & Imports"`.

### 4.6 Chapter 06 — Engine Reach (`#ch5`, timeline `"Engine Reach"`, 73 s)

Beats 7+8+9+8+8+8+9+8+8 = **73 s**; items `as b1` … `as b9`. Chapter-local code:

```eligian
action ch5BroadcastPing() [
  // broadcastEvent(eventArgs, eventName): the array first
  broadcastEvent(["#c5-fx-panel"], "tour-ping")
]

on event "tour-ping" action ch5OnPing(target) [   // target ← eventArgs[0]
  selectElement(target)
  addClass("in")
]

action ch5Stamp() [ stampTime("#c5-fx-clock") ]   // a host operation (host.js)

action ch5Dutch() [ broadcastEvent(["nl-NL"], "language-change") ]     // LabelControllers re-render
action ch5English() [ broadcastEvent(["en-US"], "language-change") ]

timeline "Engine Reach" in "#stage" using raf {
  on enter [
    enterChapter("#ch5")
    on click "#c5-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch5")
    on click "#c5-fx-ping" run ch5BroadcastPing()          // the live button, wired once per visit
    on click "#c5-fx-lang-nl" run ch5Dutch()               // live language switch
    on click "#c5-fx-lang-en" run ch5English()
    selectElement("#c5-fx-label-text")                     // the span, not the panel: LabelController replaces its element's content
    addController("LabelController", "tour.greeting")      // real locales
  ]
  on leave [
    broadcastEvent(["en-US"], "language-change")           // the language persists across timelines: back to the default
    with "#c5-fx-ping" { removeControllerFromElement("DOMEventListenerController") }
    with "#c5-fx-lang-nl" { removeControllerFromElement("DOMEventListenerController") }
    with "#c5-fx-lang-en" { removeControllerFromElement("DOMEventListenerController") }
    with "#c5-fx-label-text" { removeControllerFromElement("LabelController") }
    leaveChapter("#ch5", "#c5-to-hub")
  ]
  sequence each [ clearSpots() ] { … }
}
```

`host.js` (new, text): `export const operations = { stampTime(operationData) { const el = document.querySelector(operationData.selector); if (el) el.textContent = new Date().toLocaleTimeString(); return operationData; } }; export const controllers = {}; export const functions = { shout: s => String(s).toUpperCase() };`. In jsdom (`smoke`) `toLocaleTimeString` works; in an untrusted VS Code workspace the operation is a no-op stand-in (the narration says so).

| Beat | Narration | Code block · snippet | Spot / callout | Effect | Real code |
|---|---|---|---|---|---|
| 1 doors (0–7) | "Everything so far fired on the clock. A presentation also reacts — to clicks, keys, events, and to your own code. That's engine reach." | `#c5-code-overview`: `broadcastEvent([args], "name")              // 1. the eventbus` / `on event "name" action H(p) [ … ]           // 2. react to it` / `on click "#btn" run ping()                   // 3. interactions` / `addController("…Controller", …)             // 4. attach behaviour` / `extensions "./host.js" { operation … }       // 5. your own JavaScript` | `#c5-cl-over` block chip: "five doors past the clock" | `#c5-fx-doors` + chips `interactions` `host code` | — |
| 2 eventbus (7–15) | "broadcastEvent puts a message on the engine's bus. Whoever listens for that name reacts: your on event handlers, controllers — and the engine itself." (F7, F12) | `#c5-code-eventbus`: `broadcastEvent(["#c5-fx-panel"], "tour-ping")          // eventArgs first, then the name` / `broadcastEvent(["Hub", 0], "request-timeline-uri")     // the engine listens: switches to "Hub"` | `#c5-tok-bcast`; `#c5-cl-bus`: "one bus, many listeners; request-timeline-uri is a broadcast the engine answers by switching" | `#c5-fx-bus` | — |
| 3 on event (15–24) ⭐ | "An on event action runs when its event fires, not at a time. Click the button: it broadcasts tour-ping, and this handler reveals the panel." (F8) | `#c5-code-onevent` kept (`onTourPing` → `ch5OnPing`) + display line `on event "tour-ping" topic "demo" action ch5OnDemo(target) [ … ]   // topic namespaces the event` | `#c5-tok-onevent`; `#c5-cl-on`: "params map to eventArgs by position · topic "x" namespaces · parentheses optional with no params" | `#c5-fx-bus` (button live since on enter) | `on click "#c5-fx-ping" run ch5BroadcastPing()` (on enter) → `ch5OnPing` |
| 4 interactions (24–32) **new** | "on <event> on an element runs a verb: navigate, play, pause, toggle, stop, seek, or run an action. The hub cards and this button are written that way." | **new** `#c5-code-interact`: `on click "#card-ch1" navigate "Timeline & Time"       // switch timelines` / `on click "#card-ch3" navigate "Logic" at b4.start     // a position: the target's labels` / `on click "#c5-fx-ping" run ch5BroadcastPing()       // start an action` / `on click "#play" toggle                              // play · pause · toggle · stop` / `on dblclick "#stage" seek intro.end                  // labels of this timeline` | **new** `#c5-tok-run`; **new** `#c5-cl-interact`: "any DOM event name; run arguments must be compile-time values; the action starts with eventTarget, eventKey and its arguments — nothing from the surrounding block" | **new** `#c5-fx-interact`: chips `click → navigate` `click → run` | the chapter's own `on enter` |
| 5 keys (32–40) **new** | "on key binds keyboard shortcuts — Escape takes you to the hub, space pauses, r replays, in every chapter." | **new** `#c5-code-keys`: `on key "Escape" navigate "Hub"` / `on key "space" toggle` / `on key "r" run replayChapter("#ch5")   // reset, then seek 0s` / `on key "shift+right, pagedown" seek intro.end        // hotkeys syntax` / `on key "Escape" in "#dialog" stop                    // only while focus is inside #dialog` | **new** `#c5-tok-key`; **new** `#c5-cl-keys`: "a KeyboardController; unknown names are errors; input fields are ignored" | **new** `#c5-fx-keys`: key caps `Esc` `␣` `r` | the chapter's own `on key` lines |
| 6 controllers (40–48) | "Under both forms sits a controller: lasting behaviour attached to a selected element. This is what on click desugars to — one of nine." (F9, F11) | `#c5-code-controller`: `selectElement("#c5-fx-ping")` / `addController("DOMEventListenerController", "click", ["ch5BroadcastPing"])   // positional: event, then actions` / `// on leave:` / `removeControllerFromElement("DOMEventListenerController")` | `#c5-tok-ctrl`; `#c5-cl-ctrl`: "DOMEventListener · Keyboard · Label · Lottie · MutationObserver · Navigation · Progressbar · Routing · Subtitles" | `#c5-fx-ctrl` (new): chips of the nine names | — |
| 7 locales (48–57) ⭐ | "locales make text translatable: a LabelController renders a key in the active language. This label — and the hub title — are real ones: click nl-NL and it switches." (F10) | `#c5-code-label`: `locales "./locales.json"                              // every language, keyed by code` / `selectElement("#c5-fx-label-text")` / `addController("LabelController", "tour.greeting")      // the key is validated against the file` / `on click "#c5-fx-lang-nl" run ch5Dutch()   // broadcastEvent(["nl-NL"], "language-change")` | `#c5-tok-loc`; `#c5-cl-loc`: "completion and did-you-mean on the key; Chapter 07 has the editor" | `#c5-fx-label` > `span#c5-fx-label-text` (rendered by the controller) + sibling buttons `button#c5-fx-lang-en` `button#c5-fx-lang-nl` | LabelController in on enter; the two buttons broadcast `language-change` (the LocaleEventbusAdapter sets the locale, LabelController re-renders: `engine-factory-*.mjs:1904-1917,8342`); on leave switches back to en-US |
| 8 host (57–65) **new** | "Your own JavaScript reaches in too: a host operation is called like a built-in. This clock was stamped by host.js just now." | **new** `#c5-code-host`: `extensions "./host.js" { operation stampTime(selector: string) }` / `` / `action ch5Stamp() [ stampTime("#c5-fx-clock") ]` | **new** `#c5-tok-host`; **new** `#c5-cl-host`: "bundled by --bundle, dev, smoke and the preview (trusted workspaces)" | **new** `#c5-fx-host` > `span#c5-fx-clock.fx-chip` | `ch5Stamp()` |
| 9 recap (65–73) | "Eventbus, on event, interactions, controllers, locales, host code — the hub, its title and every click you made were built from these. Hub." | `#c5-code-recap`: `on click "#card-ch1" navigate "Timeline & Time"   // ← every card you clicked` / `addController("LabelController", "hub.title")      // ← the hub title you read` / `on key "Escape" navigate "Hub"                       // ← the way back` | `#c5-tok-recap` | `#c5-fx-done` "Chapter 6 ✓" | — |

Why: F7–F12, F20; `eligian.langium:531-537` (interactions), `:148-182` (extensions), `LANGUAGE_SPEC.md:1951-2012`, `:457-533` (locales), `:535-582` (extensions). Verified: `on click "#btn" run ping("#panel")`, `on key "Escape" navigate "Hub"`, `on key "space" toggle`, `on key "r" seek 0s` compile and smoke (the chapter binds `r` to `replayChapter`, §4.0); `removeControllerFromElement("DOMEventListenerController")` compiles; LabelController + `locales` + two languages compile and smoke (the `chapters` starter); `broadcastEvent(["nl-NL"], "language-change")` in a `run` action compiles clean (review). LabelController sits on the span because it renders with `selectedElement.html(text)` (`engine-factory-*.mjs:8349-8353`), which would wipe the panel's buttons. `locales.json`: `{ "en-US": { "hub": { "title": "The Eligian Tour", "tagline": "A presentation that teaches the language it is written in." }, "tour": { "greeting": "Hello from a LabelController" } }, "nl-NL": { "hub": { "title": "De Eligian-rondleiding", "tagline": "Een presentatie die de taal uitlegt waarin ze is geschreven." }, "tour": { "greeting": "Hallo van een LabelController" } } }`.

layout: `pre#c5-code-interact`, `#c5-code-keys`, `#c5-code-host`, `div#c5-fx-interact`, `#c5-fx-keys`, `#c5-fx-ctrl`, `#c5-fx-host > span#c5-fx-clock`, `span#c5-fx-label-text` and the sibling buttons `button#c5-fx-lang-en`, `button#c5-fx-lang-nl` inside `#c5-fx-label`, callouts `#c5-cl-interact`, `#c5-cl-keys`, `#c5-cl-host`; label "06 · Engine Reach"; `#hub-title` and `#hub-tagline` emptied in HTML (filled by LabelController) — keep a `data-fallback` comment. tour.css: `.keycap`, anchors, rows up to 9. Delete `ch5WireButton` from `tour.eligian`.

---

## 5. New chapter: The Editor (VS Code extension) — `#ch6`, prefix `c6-`, timeline `"The Editor"`, 106 s

Replaces "Tooling Magic" (same section and ids; the timeline is renamed, so the hub `navigate "Tooling Magic"` becomes `navigate "The Editor"`, and the card reads "07 · The Editor"). Fifteen beats: 8 + 14 × 7 = **106 s**. Everything the effect pane shows is a reenactment: a CSS-built mock of VS Code whose text is copied from the real providers (cited per beat). The narration says so in beat 1.

### 5.1 Mock editor design

One IDE frame **per beat** (`div#c6-fx-<beat>.fx.ide`), revealed by `demo()` like any `.fx` panel, so no layer juggling is needed; sub-elements inside a frame appear with `.in` via timed `at bK.start + Ns for Ms [ revealCard("#c6-pop-…") ]` events placed after the sequence. `resetChapter("#ch6")` removes `.in/.active/.lit` on leave.

DOM of a frame (all CSS classes new in tour.css under `/* ---- Mock IDE ---- */`, replacing the Ch6 `.mock-*` / `.complete-*` rules; `.diagnostic`, `.squiggle` and `.hover-card` already moved to the shared mock-UI section in WP-3):

```html
<div id="c6-fx-css" class="fx ide">
  <div class="ide-titlebar"><span class="ide-tab is-active">tour.eligian</span><span class="ide-tab">tour.css</span></div>
  <div class="ide-body">
    <div class="ide-gutter"><span>41</span><span>42</span><span>43</span></div>
    <div class="ide-editor">
      <div class="ide-line"><span class="tok fn">addClass</span>(<span class="tok str">"<span class="squiggle">activ</span>"</span>)<span class="ide-caret"></span></div>
      <div id="c6-pop-css-diag" class="ide-pop ide-hover">Unknown CSS class: 'activ'. Did you mean: active?  <span class="ide-code">eligian(unknown_css_class)</span></div>
      <div id="c6-pop-css-fix" class="ide-pop ide-lightbulb">💡 Change to 'active'<br>Create '.activ' in tour.css</div>
    </div>
  </div>
  <div class="ide-panel ide-problems"><div class="ide-panel-title">PROBLEMS 1</div><div class="ide-problem"><span class="ide-x">⊗</span> Unknown CSS class: 'activ'. Did you mean: active? <span class="ide-dim">eligian(unknown_css_class) [Ln 42, Col 12]</span></div></div>
  <div class="ide-status"><span>Eligian</span><span>⊗ 1 ⚠ 0</span><span>Ln 42, Col 12</span></div>
</div>
```

CSS components (names fixed so all beats share them):

| Class | Purpose |
|---|---|
| `.ide` | frame: `#0b0f14` background, 1px `#30363d` border, radius 8, monospace 0.8rem, `display:grid; grid-template-rows: auto 1fr auto auto`; plus `.fx.ide, .fx.term { place-items: stretch; padding: 0; text-align: left; }`, because `.fx` centres and pads its content (`tour.css:487-497`) |
| `.ide-titlebar`, `.ide-tab`, `.ide-tab.is-active` | tab strip; active tab has the accent underline |
| `.ide-body`, `.ide-gutter`, `.ide-editor`, `.ide-line` | gutter with line numbers (muted), lines `white-space: pre`; `.ide-line.typing` reuses `clip-sweep` for "being typed"; `.ide-line.is-current` = `rgba(88,166,255,.06)` background |
| `.ide-caret` | 1px accent bar, `animation: caret-blink 1s steps(1) infinite` |
| `.squiggle`, `.squiggle.warn` | red / yellow wavy underline (existing `.squiggle` kept) |
| `.ide-pop` | hidden popup (`opacity:0; transform: translateY(4px)`), shown by its own `.ide-pop.in { opacity: 1; transform: none; }` rule (state-class rule, §4.0) |
| `.ide-hover` | hover card: `#161b22`, border, max-width 26rem, markdown-ish (`<b>`, `<code>`) |
| `.ide-complete`, `.ide-complete-item(.is-sel)`, `.ide-complete-detail` | completion list (existing `.complete-*` renamed) |
| `.ide-lightbulb` | quick-fix menu (💡 + one title per line) |
| `.ide-lens` | CodeLens line above code: small muted text `▶ Preview from 22s` |
| `.ide-inlay` | inlay hint chip: `background:#21262d; border-radius:4px; font-size:.7rem; padding:0 .3rem` |
| `.ide-blocklabel` | superscript decoration before `[`: `ˢᵉᵗᵘᵖ` / `ᵗᵉᵃʳᵈᵒʷⁿ` |
| `.ide-signature` | signature-help popup with the active parameter in bold |
| `.ide-panel`, `.ide-panel-title`, `.ide-problems`, `.ide-problem`, `.ide-x`, `.ide-warn` | bottom panel; `⊗` red, `⚠` yellow |
| `.ide-outline`, `.ide-outline-item[data-depth]` | tree with chevrons and symbol icons (`⧉ timeline`, `⚡ at`, `ƒ action`) |
| `.ide-preview`, `.ide-preview-controls`, `.ide-scrubber` | webview thumbnail: buttons `Play Pause Stop Restart Debug Events`, `☑ Keep position on reload`, timeline `<select>` look-alike, a range track, `0.0s` readout, language select; the floating `EventBus Debug Viewer` panel (`Clear`, `Filter by name or topic...`, event rows); the `Compilation Errors` panel with `Retry Compilation` (`preview/templates/preview.html:263-299`) |
| `.ide-gantt`, `.ide-lane`, `.ide-bar(.at|.sequence|.stagger)`, `.ide-playhead` | Timeline view: one swimlane per timeline, bars positioned with `left/width` percentages, a playhead line |
| `.ide-locale`, `.ide-locale-tree`, `.ide-locale-table` | locale editor: key tree (`▼ locale keys`, `📝 hub.title`), table `Key | en-US | nl-NL` |
| `.ide-palette`, `.ide-palette-item` | command palette / quick pick list |
| `.ide-toast` | notification toast (`Go to Source` button) |
| `.ide-status` | status bar (accent background) |

Interaction between beats and the frame is class-only, so `demo()`/`revealCard()` suffice; no new library actions.

### 5.2 Beats (one per extension feature)

Sequence items `as e1` … `as e15`; `at eK.start + Ns for Ms [ revealCard("#c6-pop-…") ]` sub-steps listed in the last column. All strings below are verified against the sources named in the "Source" column (messages reproduced with the CLI where possible).

| Beat | Narration | Code pane snippet (`#c6-code-*`) | Effect frame `#c6-fx-*` (what is shown) | Sub-steps | Source |
|---|---|---|---|---|---|
| 1 install (0–8) | "The other half of Eligian is the editor. Install the extension and every .eligian file gets highlighting, checking, completion, hover, a preview — all of which wrote this tour. What follows is a mock-up with the real texts." | `#c6-code-why`: `code --install-extension rolandzwaga.eligian` / `// Marketplace: eligian · publisher rolandzwaga · activates on .eligian files` | `#c6-fx-editor`: frame with tab `tour.eligian`, six highlighted lines of the real tour header, status `Eligian · ⊗ 0 ⚠ 0` | — | `packages/extension/package.json` (name `eligian`, publisher, `activationEvents: onLanguage:eligian`) |
| 2 validation + Problems (8–15) | "Syntax errors speak plainly, and every semantic rule — imports, names, arguments, events, timelines — lands in Problems while you type." | `#c6-code-syntax`: `at 0s..5s { intro() }` / `action loop() [ … ]` / `setData({ "operationdata.k": 1 })` | `#c6-fx-problems`: lines with squiggles under `{`, `loop`, `"operationdata.k"`; Problems panel: `⊗ Expected an action or operation call, or a [ … ] block here, but found '{'. eligian(parsing-error)`, `⊗ 'loop' is a keyword, so it cannot be used as a name here. Choose another name. eligian(parsing-error)`, `⊗ setData target 'operationdata.k' needs a '$' prefix: '$operationdata.k'. Eligius rejects 'operationdata.k' at runtime eligian(invalid_setdata_target)` | +2 s panel `.in` | `eligian-parser-error-provider.ts`; verified CLI texts |
| 3 CSS & selectors (15–22) ⭐ | "Every class and selector is checked against your CSS and your layout — even when it travels through an action parameter. Typo one: a squiggle, a suggestion, a one-click fix." | `#c6-code-css`: `styles "./tour.css"` / `addClass("activ")              // class: must be in the CSS` / `spotlight("#tok-timelin")      // selector through a parameter: CSS ∪ layout` | `#c6-fx-css`: both squiggles; hover `Unknown CSS class: 'activ'. Did you mean: active?`; lightbulb `Change to 'active'` / `Create '.activ' in tour.css`; second hover `Unknown CSS ID in selector: 'tok-timelin'. Did you mean: tok-timeline?` | +2 s hover, +4 s lightbulb | `css-parameter-validator.ts:52`, `selector-validation.ts`, `did-you-mean-fix.ts:49`, `css-code-actions.ts:127`; spec 056 |
| 4 dataflow + quick fix (22–29) | "The dataflow check knows what each block carries. A missing selected element gets a fix: Insert selectElement, or Add target." | `#c6-code-dataflow`: `action highlight(selector) [ addClass("on") ]` / `at 1s..2s highlight("#box")` / `at 3s..4s [ addClass("on") ] [ selectElement("#box") removeClass("on") ]` | `#c6-fx-dataflow`: hover on the block's `addClass`: `Property 'selectedElement' is not available - ensure it is created by a previous operation (for example with selectElement)`; hover on the call: `Action 'highlight' requires 'selectedElement' (used by addClass in 'highlight'), which is not available here - ensure it is created before calling 'highlight' (for example with selectElement)` (both verified); lightbulb `Insert selectElement("#box")` on the block (guessed from the end block's `selectElement`), `Add target "#box"` on the call (from its selector argument; without one both titles would read `""`); hover on `highlight` shows `**Requires from the caller** (operationData):` `- selectedElement (used by addClass)` | +2 s hover, +4 s lightbulb | `dataflow/operation-dataflow.ts:508`, `lsp/select-element-fix.ts:43-84,111,138`, `eligian-hover-provider.ts:264` |
| 5 completion (29–36) | "Type and the editor knows what fits: operations, your actions, controllers, CSS classes and ids, DOM events, keys, timeline names, label keys, even whole event skeletons." | `#c6-code-complete`: `ani▎` / `rev▎` / `navigate "▎` / `on key "▎` / `addController("▎` | `#c6-fx-complete`: list 1 (after `ani`) `animate (operation)` *Eligius operation*, `animateWithClass (operation)`; list 1b (after `rev`) `revealBlock (action)` *(selector: string) - imported action* (items filter on the bare name); list 2 (after `navigate "`): `Hub` `Timeline & Time` `Actions` `Logic` … ; list 3: `LabelController` `DOMEventListenerController` `KeyboardController` … | +2 s list 2, +4 s list 3 | `completion/operations.ts:58,63`, `completion/actions.ts:69-74`, `eligian-completion-provider.ts` |
| 6 signature help + inlay hints (36–43) | "Inside a call the signature follows your cursor; resolved times and parameter names sit in the code as inlay hints." | `#c6-code-hints`: `broadcastEvent(["#c5-fx-panel"], "tour-ping")` / `for 7s as editBeat [ … ]` / `stagger 200ms […] at editBeat.end with revealCard() for 1.5s` / `timeline "Logic" in "#stage" using raf {` | `#c6-fx-hints`: signature popup `broadcastEvent(eventArgs: array, eventName: eventName, eventTopic?: string)` with `eventName: eventName` bold; inlay chips `eventArgs:` `eventName:` before the arguments, `‹15s..22s›` after `for 7s`, `‹22s..23.9s ×3›` after the stagger, `‹64s›` after the timeline header | +2 s signature, +4 s inlays | `lsp/call-signature.ts:126-139` (label `name(p: type, q?: type)`; types from `registry.generated.ts:184-212` through `translateParameterType`, `hover/hover-builders.ts:134-165`, where `ParameterType:eventName` has no mapping and shows as `eventName`; confirm in VS Code in WP-8), `eligian-inlay-hint-provider.ts:55,151,182,204`, settings `eligian.inlayHints.*` |
| 7 hover + JSDoc (43–50) | "Hover anything: an operation's docs from Eligius, your action's JSDoc, the CSS rule behind a class. Type /** above an action and the template writes itself." | `#c6-code-jsdoc`: `/**` / ` * Reveal a code block …` / ` * @param {string} selector CSS selector for the code block` / ` */` / `action revealBlock(selector: string) [ … ]` / `revealBlock()` | `#c6-fx-hover`: **call-site** hover on `revealBlock()` (JSDoc only: revealBlock selects its own element, so there is no *Requires* section): `### revealBlock` / `Reveal a code block: fade it in …` / `**Parameters:**` / `` - `selector` (`string`) - CSS selector for the code block `` (the `{string}` is added to presentation.eligian's JSDoc in WP-1), above the squiggle text `Action 'revealBlock' expects 1 argument(s) but got 0. Expected: selector`; **definition** hover on `action revealBlock` (no JSDoc there): `### revealBlock` / `**Parameters checked at call sites:**` / `` - `selector`: CSS selector (checked against the CSS and the layout) ``; **timeline** hover on `timeline "Logic"`: `### Timeline "Logic"` / `- **Provider:** raf` / `` - **Container:** `#stage` `` / `- **Duration:** computed from the events when compiling` / `- **Loops:** no`; a mini-frame typing `/**` + Enter → ` * Description` (the snippet placeholder, selected) / ` * @param {string} selector` | +1.5 s definition hover, +3 s timeline hover, +4.5 s template | `jsdoc/jsdoc-formatter.ts:18-39`, `eligian-hover-provider.ts:55-65,196-212,238-241`, `hover/timeline-hover.ts:32-50`, `parameter-validator.ts:56`, `jsdoc-template-generator.ts:60-76` (`${1:Description}` is the snippet placeholder) |
| 8 navigation (50–57) | "F12 jumps from navigate to the timeline, from a selector to the CSS rule or the layout element. Shift+F12 finds references across .eligian, CSS and HTML; F2 renames a timeline everywhere." | `#c6-code-nav`: `on click "#card-ch3" navigate "Logic"      // F12 → timeline "Logic"` / `spotlight("#tok-timeline")                 // F12 → tour.css · layout.html` / `timeline "Logic" …                         // F2 renames every navigate` / `on click "#card-ch3" navigate "Logik"      // ✗ → Change to "Logic" · Create timeline "Logik"` | `#c6-fx-nav`: tab `tour.css` with a CodeLens `3 Eligian references` above `#tok-timeline { … }`; context-menu `Eligian: Find Eligian References`; a references peek listing `tour.eligian 128`, `… 137`; a squiggle under `"Logik"`: `Unknown navigate target: 'Logik'. No timeline with this name exists. Available timelines: 'Logic'.` (`unknown_navigate_target`; verified on a one-timeline scratch, the tour's list names all nine: copy it in WP-8) with lightbulb `Change to "Logic"` / `Create timeline "Logik"` | +2 s lens, +4 s peek, +5.5 s fix | `lsp/eligian-timeline-providers.ts`, `lsp/css-navigation.ts`, `css-references/css-reference-features.ts`, setting `eligian.codeLens.cssReferences`, `lsp/timeline-symbols.ts:191,206` |
| 9 outline (57–64) | "The Outline lists timelines with their lifecycle blocks and events at their resolved times — Ctrl+Shift+O jumps to any beat." | `#c6-code-outline`: `timeline "Logic" in "#stage" using raf {` / `  on enter [ … ]` / `  sequence each [ … ] { for 8s as b1 [ … ] … }` | `#c6-fx-outline`: tree `⧉ timeline "Logic"  raf · 0s..64s` → `on enter  showView, …` / `sequence 0s..64s ×8` → `0s..8s as b1  "const names a value…" · narrate, revealBlock, spotlight, callout, …` … | +2 s tree expands (`.in` on children) | `lsp/eligian-document-symbol-provider.ts:95-156` |
| 10 snippets, format, block labels (64–71) | "Snippets scaffold an action, a timeline, a chapter. Format Document tidies whitespace only. And every start and end block is labelled in the margin; a range rewrites itself as start for duration in one click." | `#c6-code-format`: before: `action f( selector:string )[` / `selectElement(selector)` / `  addClass( "on" )` / `]` → after Shift+Alt+F: `action f(selector: string) [` / `  selectElement(selector)` / `  addClass("on")` / `]` | `#c6-fx-format`: snippet picker `action · endable action · on event · timeline · chapter · languages · library`; a line `at 0s..4s ˢᵉᵗᵘᵖ[ reveal("#a") ] ᵗᵉᵃʳᵈᵒʷⁿ[ conceal("#a") ]` with the refactor lightbulb on `0s..4s`: `Convert to '0s for 4s'` | +2 s picker, +4 s labels, +5.5 s refactor | `snippets/eligian.json` (7 prefixes), `lsp/format-rules.ts`, `block-label-decoration-provider.ts:32,41`, `timeline/time-range-actions.ts:29-60` |
| 11 preview (71–78) | "Ctrl+K V opens the preview: the real engine in a webview, recompiled on every save, keeping its place. Scrub, pick a timeline or a language, or start from a line with Preview from." | `#c6-code-preview`: `> Eligian: Preview Timeline        (Ctrl+K V)` / `▶ Preview from 22s` / `at 22s for 9s as b4 [ … ]    ▶ 22s..31s` | `#c6-fx-preview`: thumbnail with controls `Play Pause Stop Restart Debug Events ☑ Keep position on reload`, `Logic ▾` `━━●━━ 24.0s` `en-US ▾`; editor strip with a CodeLens `▶ Preview from 22s` and a line highlighted with `▶ 22s..31s`; the floating `EventBus Debug Viewer` (`Clear`, `Filter by name or topic...`, a few event rows copied from a real session in WP-8) | +2 s CodeLens, +4 s playhead highlight, +5.5 s Debug Viewer | `preview/templates/preview.html:263-299`, `eligian-code-lens-provider.ts:71-83`, `playhead-decoration-provider.ts:27`, keybinding `ctrl+k v` |
| 12 runtime errors + lint (78–85) | "An engine error during preview becomes a diagnostic on the operation that failed, with Go to Source. And Eligius' own lint runs 200 ms after you stop typing." | `#c6-code-runtime`: `action boom() [ selectElement($globaldata.nowhere) addClass("on") ]` / `scrollToElement(200, "nowhere")` | `#c6-fx-runtime`: squiggle under `selectElement(` with hover `Runtime error at 9s of 'Logic': selectElement: selector is either empty or not defined.  eligius-runtime(runtime_error)` (position and timeline are the preview's at the moment of the error: illustrative); toast `Eligian Preview Runtime Error: selectElement: selector is either empty or not defined. (tour.eligian:<line>:<col>)` with a `Go to Source` button; second problem, an **error**: `⊗ scrollToElement: 'block' must be one of 'start', 'center', 'end', 'nearest', got 'nowhere'. (at actions[0].startOperations[1].operationData.block in the compiled JSON)  Eligius lint(E120)` (the path depends on where the call sits) | +2 s toast, +4 s lint row | `preview/PreviewPanel.ts:774-807` (toast, diagnostic text, source `eligius-runtime`, code `runtime_error`), `compiler/eligian-map.ts`, `lsp/eligius-lint-notifications.ts:23-25` (editor: source `Eligius lint`, code `E120`, suffix `(at <path> in the compiled JSON)`; the CLI's suffix differs, §6.2 beat 7), `eligius-lint-diagnostics.ts:54` (severity 1 → Error), `node_modules/eligius/dist/lint.mjs:4167` (E120 is reported as `error`) |
| 13 timeline view (85–92) | "The Eligian panel draws each timeline as a Gantt chart: a bar per event at its resolved time, the preview's playhead moving through. Click a bar to jump to its source; double-click to preview from there." | `#c6-code-gantt`: `> Eligian: Show Timeline View` / `sequence { for 7s as b1 [ … ]  for 7s as b2 [ … ] }` / `stagger 200ms […] at editBeat.end …` | `#c6-fx-gantt`: panel title `ELIGIAN › TIMELINE`, lanes `Timeline Power Tools  raf  57s` with bars named after the item labels `b1` `b2` `editBeat` `b4` `b5` `waveBeat` `b7` (an unlabelled item would read `sequence k/7`), stagger rows `stagger 1/3 "#c4-card-1"` … `stagger 3/3 "#c4-card-3"` and `stagger 1/3 "#c4-wave-1"` … `stagger 3/3 "#c4-wave-3"`, a playhead at 24 s | +2 s playhead moves (`.lit`) | `lsp/timeline-gantt.ts:34-60,119,132`, `timeline-view/TimelineViewProvider.ts`, `media/timeline-view.ts` |
| 14 locales, new, compile (92–99) | "Edit translations in the Locale Editor — Ctrl+Click the locales path, or Open With. New Presentation writes a starter project; Compile Current File writes the JSON beside your file." | `#c6-code-locales`: `locales "./locales.json"      // Ctrl+Click opens the Locale Editor` / `> Eligian: Edit Locales` / `> Eligian: New Presentation…   blank · chapters · video · library` / `> Eligian: Compile Current File → tour.json` | `#c6-fx-locale`: tree `▼ locale keys` `▼ hub` `📝 title` `📝 tagline` `▼ tour` `📝 greeting`; table `Key │ en-US │ nl-NL` with `hub.title │ The Eligian Tour │ De Eligian-rondleiding`; quick pick `Blank — One timeline with a title …`, `Chapters — A hub that links to two chapters …`; lightbulb `Generate language block (2 languages)` on the `locales` import of a file without a `languages` block | +2 s table, +4 s quick pick, +5.5 s lightbulb | `media/locale-editor.ts:1153,1326-1331`, `commands/new-presentation.ts`, `starters.ts:33-59`, `commands/compile.ts`, `labels/language-block-code-actions.ts:80-88` |
| 15 settings + recap (99–106) | "Ten settings tune it: lint, selector checks, playhead highlights, CodeLenses, inlay hints. Concise, checked, live — that's Eligian in the editor. Hub." | `#c6-code-recap`: `eligian.validation.selectorNotInLayout   off · ids · all` / `eligian.validation.eligiusLint           true` / `eligian.preview.highlightActiveEvents    true` / `eligian.codeLens.preview · cssReferences true` / `eligian.inlayHints.parameterNames        none · literals · all` / `eligian.inlayHints.sequenceTimes · staggerTimes · computedTimes · timelineDuration` | `#c6-fx-done` "Chapter 7 ✓" | — | `package.json:74-143` |

Hot reload (CSS/HTML/locales/host module) and the untrusted-workspace behaviour of host modules are **narration-only** (beat 11's and Ch06 beat 8's narration); no frame claims to show them, and WP-8's acceptance says so. Internal commands (`eligian.generateJSDoc`, `openLocaleFile`, `createLabelsFile`, `createLabelEntry`) appear as what they do: the JSDoc template (beat 7), the Ctrl+Click link (beat 14), and label quick fixes named in beat 14's callout (`Create labels file`, `Create label entry 'hub.title'`, `Use '<key>'`).

Callouts (one per beat, `#c6-cl-e1` … `#c6-cl-e15`, anchored to the beat's `#c6-tok-*`): e.g. e3 `"CSS ∪ layout for selectors; CSS only for class names"`, e6 `"settings: eligian.inlayHints.*"`, e11 `"eligian.preview.highlightActiveEvents · eligian.codeLens.preview"`, e12 `"source 'eligius-runtime' / 'Eligius lint'; setting eligian.validation.eligiusLint"`.

Header comment of the chapter in `tour.eligian` (replaces lines 479-488): states that the pane is a reenactment with verbatim strings, lists the sources, and names the one live tie-in (if this tour is open in the preview, beat 11 shows what the viewer is looking at).

---

## 6. New chapter: The Command Line — `#chc`, prefix `cc-`, timeline `"The Command Line"`, 87 s

Eleven beats: 7+8+8+8+7+9+8+9+8+8+7 = **87 s**; items `as t1` … `as t11`. Hub card `#card-chc` "08 · The Command Line". Every output line below was produced by `node packages/cli/bin/cli.js` (eligian 1.0.1) during planning, with paths shortened to the tour's; timestamps in the `dev` beat are illustrative, the line formats are the real ones (`dev-server.ts:116-129`). Exceptions: the bundle `Files` / `Size` / `Time` (beat 4) and the smoke counts (beat 8) depend on the finished tour (9 timelines, more positions, locales and host.js in the bundle) and are re-captured in WP-11; they are marked below.

### 6.1 Mock terminal design

`div#cc-fx-<beat>.fx.term` per beat. DOM:

```html
<div id="cc-fx-check" class="fx term">
  <div class="term-titlebar">eligian — bash</div>
  <div class="term-body">
    <div class="term-line cmd typing"><span class="term-prompt">$</span> eligian check "examples/**/*.eligian" --max-warnings 0</div>
    <div id="cc-out-check-1" class="term-line out"><u>examples/eligian-tour/tour.eligian</u></div>
    <div id="cc-out-check-2" class="term-line out">  <span class="dim">16:13</span>  <span class="err">error</span>    Action 'highlight' requires 'selectedElement' … <span class="dim">missing-action-dependency</span></div>
    <div id="cc-out-check-3" class="term-line out"><span class="err">1 file, 1 error, 0 warnings</span></div>
    <div id="cc-cmd-check-2" class="term-line cmd later"><span class="term-prompt">$</span> <span class="term-caret"></span></div>
  </div>
</div>
```

| Class | Purpose |
|---|---|
| `.term` | frame: `#0b0f14`, border `#30363d`, radius 8, monospace 0.8rem, left-aligned, `white-space: pre-wrap` |
| `.term-titlebar` | muted title strip |
| `.term-line.cmd` / `.term-prompt` | command line; prompt in accent. The beat's **first** command carries a static `typing` (`clip-sweep`, 0.9 s: it types as the frame appears). Every later command is `.term-line.cmd.later` with an id (`#cc-cmd-<beat>-<n>`), hidden like an output line and typed by its own `.term-line.cmd.later.in { opacity: 1; animation: clip-sweep 0.9s … }` when the beat's stagger reaches it |
| `.term-line.out` | output line, `opacity: 0` until its own `.term-line.out.in { opacity: 1; }` rule (0.15 s); the shared one-class `.in` (`tour.css:840-843`) loses to `.term-line.out` and would reveal nothing (state-class rule, §4.0) |
| `.ok` (green `#3fb950`), `.err` (red `#f85149`), `.warn` (yellow `#d29922`), `.dim` (muted), `.cyan` (`#39c5cf`), `u` (underlined file name) | chalk colours as the CLI prints them |
| `.term-caret` | blinking block cursor (shares `caret-blink`) |

Output lines appear one after another through a **real stagger** per beat, placed after the sequence (self-demo of Ch4 in the CLI chapter):

```eligian
stagger 250ms ["#cc-out-check-1", "#cc-out-check-2", "#cc-out-check-3", "#cc-cmd-check-2"] at t6.start + 1.5s for 6s [
  selectElement(@@item)
  addClass("in")
]
```

(end block omitted: `resetChapter("#chc")` clears `.in` on leave; the `for 6s` only sets the event's end.) Verified pattern: inline anchored stagger with `selectElement(@@item)`. Each beat's item list holds its output lines and its later command lines in display order, so a second command types only after the first one's output.

### 6.2 Beats

| Beat | Narration | Code pane snippet (`#cc-code-*`) | Terminal frame (`#cc-fx-*`): typed command → output lines | Source |
|---|---|---|---|---|
| 1 install (0–7) | "The compiler is also a command: eligian on npm, Node 22.12 or later. Install it, or run it once with npx." | `#cc-code-install`: `npm install -g eligian` / `npx eligian init my-talk` / `eligian --version` / `# also installed as eligian-cli` | `$ npm install -g eligian` → `added 7 packages` (illustrative) · `$ eligian --version` → `1.0.1` · `$ eligian --help` → `Usage: eligian [options] [command]` … `` `eligian <input>` is short for `eligian compile <input>`. `` · `Run 'eligian <command> --help' (compile, check, fmt, smoke, dev, init) for its options.` | `packages/cli/package.json:2-4,28,37-40`, `main.ts:296-303` |
| 2 init (7–15) | "eligian init writes a starter that already checks clean: blank, chapters, video or library, with layout, styles, locales, a package.json and a README." | `#cc-code-init`: `eligian init my-talk --template chapters` / `eligian init . --template library --title "Product Tour"` / `# blank · chapters · video · library` | `$ eligian init my-talk --template chapters` → `Created my-talk/ (Chapters starter): package.json, README.md, main.eligian, layout.html, styles.css, locales.json` / `` / `Next:` / `  cd my-talk` / `  eligian check main.eligian` / `  open the folder in VS Code and run "Eligian: Preview Timeline" (Ctrl+K V)` — then `$ eligian init my-talk` → `Not overwriting existing files in my-talk/: package.json, README.md, main.eligian, layout.html, styles.css, locales.json` / `Use --force to overwrite them.` (exit 1) | verified output; `init.ts`, `starters.ts:33-59` |
| 3 compile (15–23) | "eligian file.eligian compiles to Eligius JSON next to the file. Dash o picks the output, dash for stdout; --check only validates; --minify, --no-optimize, -q and -v adjust the rest." | `#cc-code-compile`: `eligian tour.eligian                 # → tour.json` / `eligian tour.eligian -o -            # JSON to stdout` / `eligian tour.eligian --check         # validate only` / `eligian tour.eligian --minify --no-optimize -q` / `eligian compile tour.eligian -v           # the explicit form; -v logs each step` | `$ eligian examples/eligian-tour/tour.eligian` → `✓ Compiled examples/eligian-tour/tour.eligian → examples/eligian-tour/tour.json` · `$ eligian examples/eligian-tour/tour.eligian --check` → `✓ examples/eligian-tour/tour.eligian is valid` · a failing compile: `Parse failed:` / `` / `Parse Error: Expected an action or operation call, or a [ … ] block here, but found '{'.` / `  at 5:13` / `` / `  4 | timeline "T" in "#stage" using raf {` / `> 5 |   at 0s..5s { intro() }` / `                  ^` / `💡 Actions are defined inside square brackets: [ operation1() operation2() ]` | verified; `main.ts:176-240` |
| 4 bundle (23–31) | "--bundle writes a standalone presentation: index.html, bundle.js, your assets, small images inlined, only the Eligius pieces you use. --force overwrites, --sourcemap and --inline-threshold tune it." | `#cc-code-bundle`: `eligian tour.eligian --bundle                  # → tour.bundle/` / `eligian tour.eligian --bundle -o site --force` / `eligian tour.eligian --bundle --sourcemap --inline-threshold 8192` | `$ eligian examples/eligian-tour/tour.eligian --bundle` → `✓ Bundle created: examples/eligian-tour/tour.bundle` / `  Files: 2` / `  Size: <n> KB` / `  Time: <n>ms` (re-captured in WP-11 from the finished tour; today's tour gives `Files: 2` / `Size: 647.3 KB` / `Time: 361ms`, a prototype with locales + host.js 682.9 KB) · again → `Bundle failed: Output directory already exists: examples/eligian-tour/tour.bundle. Use --force to overwrite.` · `$ eligian tour.eligian --bundle --check` → `Error: --bundle and --check cannot be combined: --check validates only and writes no output, but --bundle always writes a bundle directory` | verified; `bundler/index.ts`, `cli-options.ts:34-36` |
| 5 eligian map (31–38) | "--eligian-map also writes the map from every compiled action and operation back to its source line — the same map the preview and smoke build in memory to point at the failing operation, written to a file for your own tools." | `#cc-code-map`: `eligian tour.eligian --eligian-map    # + tour.eligian-map.json` / `# not with --bundle, not with -o -` | `$ eligian examples/eligian-tour/tour.eligian --eligian-map` → `✓ Compiled examples/eligian-tour/tour.eligian → examples/eligian-tour/tour.json` / `✓ Eligian map → examples/eligian-tour/tour.eligian-map.json` · `$ eligian tour.eligian --eligian-map -o -` → `Error: --eligian-map needs an output file (it is written next to it), not '-o -'` | verified; `cli-options.ts:37-52` |
| 6 check (38–47) | "eligian check reports every error and warning of many files — globs, directories, exclusions — and fails on warnings when you tell it to." | `#cc-code-check`: `eligian check "examples/**/*.eligian" --max-warnings 0` / `eligian check src "!src/drafts/**" --warnings-as-errors` | `$ eligian check demo.eligian --max-warnings 0` → `demo.eligian` / `  4:17  warning  'clik' is not a known DOM event. Did you mean: 'click'?  unknown_dom_event` / `` / `1 file, 0 errors, 1 warning` / `Too many warnings: 1 (maximum 0)` (exit 1) · `$ eligian check examples/eligian-tour --max-warnings 0` → `2 files, 0 errors, 0 warnings` | verified; `check-command.ts:40-130`, `reporters.ts` |
| 7 check formats + lint (47–55) | "Four output formats: pretty, json, sarif for code scanning, github for pull-request annotations. Eligius' own configuration lint runs too unless --no-lint; --selector-not-in-layout adds the layout check." | `#cc-code-formats`: `eligian check "**/*.eligian" --format github` / `eligian check src --format sarif > eligian.sarif` / `eligian check src --no-lint --selector-not-in-layout ids` | `$ eligian check demo.eligian --format github` → `::error file=demo.eligian,line=16,col=13,endLine=16,endColumn=22,title=missing-action-dependency::Action 'highlight' requires 'selectedElement' (used by addClass in 'highlight'), which is not available here - ensure it is created before calling 'highlight' (for example with selectElement)` · `--format json` → `{ "files": [ { "file": "demo.eligian", "diagnostics": [ { "severity": "error", "message": "…", "line": 3, "column": 13, "endLine": 3, "endColumn": …, "code": "parsing-error" } ] } ], "summary": { "files": 1, "errors": 1, "warnings": 0, "infos": 0, "hints": 0 } }` · lint row (verified; an **error**, so it fails the check): `  6:3  error    scrollToElement: 'block' must be one of 'start', 'center', 'end', 'nearest', got 'nowhere'. (Eligius lint at actions[0].startOperations[2].operationData.block)  eligius-E120` (line, column and path are those of the scratch action the call sits in) | verified (github/json/lint); `reporters.ts:11,165-166`, `check/lint.ts:17-29`, `node_modules/eligius/dist/lint.mjs:4167`, `README.md:89-94` |
| 8 smoke (55–64) | "eligian smoke plays every timeline headlessly on the real engine: enter, every start and end, leave — and reports what fails at its source line. --strict also flags selectors that match nothing." | `#cc-code-smoke`: `eligian smoke examples/eligian-tour` / `eligian smoke "examples/**/*.eligian" --strict --format github` | `$ eligian smoke examples/eligian-tour` → `examples/eligian-tour/presentation.eligian (library: nothing to play)` / `examples/eligian-tour/tour.eligian` / `  timeline 'Hub': 1 position ok` / `  timeline 'Timeline & Time': <n> positions ok` / … / `2 files, 9 timelines played, 0 errors, 0 warnings` (the timeline lines and counts are re-captured in WP-11 from the finished tour) · failing: `  timeline 'Logic': 3 positions FAIL (1)` / `  error  start operation selectElement (in boom): selectElement: selector is either empty or not defined.` / `         boom.eligian:3:17 — 'Logic' at 9s` / `1 file, 1 timeline played, 1 error, 0 warnings` (exit 1) | format verified, tour counts re-captured in WP-11; `smoke-command.ts` |
| 9 dev (64–72) | "eligian dev serves the bundle and rebuilds on every change: a CSS edit swaps styles in place, anything else reloads and resumes at the same position. Build errors show as an overlay." | `#cc-code-dev`: `eligian dev tour.eligian --open` / `eligian dev tour.eligian --port 4000` | `$ eligian dev examples/eligian-tour/tour.eligian --open` → `[12:04:02] built in 505ms` / `eligian dev examples/eligian-tour/tour.eligian → http://localhost:5180/ (Ctrl+C to stop)` / `[12:04:31] tour.css changed → rebuilt in 351ms, styles swapped` / `[12:04:40] presentation.eligian changed → rebuilt in 293ms, reloading 1 page` / `[12:05:02] tour.eligian changed → build failed (120ms):` / `  Expected an action or operation call, or a [ … ] block here, but found '{'.` | formats from `dev-server.ts:109-129`, `main.ts:374-382`; timings illustrative |
| 10 fmt (72–80) | "eligian fmt checks formatting — whitespace only, the editor's Format Document rules — and --write applies it. CI runs it on every example." | `#cc-code-fmt`: `eligian fmt "examples/**/*.eligian"        # --check is the default` / `eligian fmt --write src` / `eligian fmt --format github "**/*.eligian"` | `$ eligian fmt u.eligian` → `u.eligian` / `@@ line 2` / `  styles "./s.css"` / `- action f( selector:string )[` / `- selectElement(selector)` / `-   addClass( "on" )` / `+ ` / `+ action f(selector: string) [` / `+   selectElement(selector)` / `+   addClass("on")` / `  ]` / `` / `1 file would be reformatted (run 'eligian fmt --write')` (exit 1) · `$ eligian fmt --write u.eligian` → `Formatted u.eligian` / `1 file formatted` · `$ eligian fmt examples/eligian-tour` → `All 2 files formatted` | verified; `fmt.ts` |
| 11 exit codes (80–87) | "Exit codes you can script on: 0 clean, 1 findings or a failed compile, 2 usage errors of check, smoke, fmt, dev and init, 3 I/O. The repo's CI checks, plays and format-checks every example this way. Hub." | `#cc-code-exit`: `0  success / clean` / `1  errors, too many warnings, smoke failures, unformatted files, init conflicts, compile option errors (--bundle --check, --eligian-map -o -, --inline-threshold)` / `2  no files matched, invalid --format / --max-warnings / --port / --template / --selector-not-in-layout, fmt syntax errors` / `3  I/O error, refusing to overwrite the source` / `` / `pnpm run check:examples && pnpm run smoke:examples && pnpm run fmt:examples` | `$ eligian check "nothing/**"` → `No files matched: nothing/**` (exit 2) · `$ eligian init x --template bogus` → `Unknown template 'bogus'. Use one of: blank, chapters, video, library` (exit 2) · `$ echo $?` lines; `#cc-fx-done` "Chapter 8 ✓ — the whole toolchain" | verified; `main.ts:337-343,500-508,523-528`, `init.ts:44`, `fmt.ts:95,149` |

Callouts `#cc-cl-t1` … `#cc-cl-t11` anchored to a `#cc-tok-*` token per snippet (e.g. t6: "patterns: files, directories, globs, !excludes; node_modules skipped"; t7: "sarif 2.1.0 · github workflow commands"; t9: "only files under the entry's directory are watched · a taken --port moves to the next free one"; t11: "commander's own usage errors exit 1"). Note for the implementer: `check` uses `pretty|json|sarif|github`, `smoke` `pretty|github|json`, `fmt` `text|github` — show the three option lists as they are.

layout: `section#chc.view.chapter` (`#cc-to-hub`, rail, label "08 · The Command Line"), eleven `pre#cc-code-*`, eleven `div#cc-fx-*.fx.term` with `div#cc-out-<beat>-<n>.term-line.out` output lines and `div#cc-cmd-<beat>-<n>.term-line.cmd.later` later commands, eleven `div#cc-cl-*`. tour.css: `/* ---- Mock terminal ---- */` block, anchors, rows, `#card-chc`. tour.eligian: the timeline, eleven staggers after the sequence (one per beat, each over that beat's `#cc-out-*` and `#cc-cmd-*` ids), Hub `on click "#card-chc" navigate "The Command Line"` + `on key "8" …`.

---

## 7. Hub and navigation changes

**Cards** (`layout.html` `#hub-cards`, in this order): `#card-ch1` "01 · Timeline & Time", `#card-ch2` "02 · Actions & Composition", `#card-ch3` "03 · Logic & Data", `#card-ch4` "04 · Timeline Power Tools", `#card-chf` "05 · Files & Imports", `#card-ch5` "06 · Engine Reach", `#card-ch6` "07 · The Editor", `#card-chc` "08 · The Command Line". `.card-num` texts updated for ch5/ch6. Grid `#hub-cards { grid-template-columns: repeat(4, 1fr); }` (two rows); `#card-chf`, `#card-chc` added to the live-card border list; `.card.is-soon` on a new card until its timeline exists (never committed in that state: card and timeline land in the same WP). A hint line under the cards: `<p id="hub-hint">Click a card or press 1–8 · Esc returns here · space pauses · r replays</p>` (styled like `#hub-tagline`, smaller).

**Hub timeline**:

```eligian
timeline "Hub" in "#stage" using raf {
  on enter [
    showView("#hub")
    selectElement("#hub-title")
    addController("LabelController", "hub.title")
    selectElement("#hub-tagline")
    addController("LabelController", "hub.tagline")
    on click "#card-ch1" navigate "Timeline & Time"
    on click "#card-ch2" navigate "Actions"
    on click "#card-ch3" navigate "Logic"
    on click "#card-ch4" navigate "Timeline Power Tools"
    on click "#card-chf" navigate "Files & Imports"
    on click "#card-ch5" navigate "Engine Reach"
    on click "#card-ch6" navigate "The Editor"
    on click "#card-chc" navigate "The Command Line"
    on key "1" navigate "Timeline & Time"
    on key "2" navigate "Actions"
    on key "3" navigate "Logic"
    on key "4" navigate "Timeline Power Tools"
    on key "5" navigate "Files & Imports"
    on key "6" navigate "Engine Reach"
    on key "7" navigate "The Editor"
    on key "8" navigate "The Command Line"
  ]
  on leave [
    hideView("#hub")
    with "#hub-title" { removeControllerFromElement("LabelController") }
    with "#hub-tagline" { removeControllerFromElement("LabelController") }
    with "#stage" {
      removeControllerFromElement("KeyboardController")   // × 8, one per on key
      …
    }
    with "#card-ch1" { removeControllerFromElement("DOMEventListenerController") }   // × 8, one per card
    …
  ]
}
```

The hub has no timed events (duration 0, waits for input). Card listeners are navigate broadcasts (idempotent, so duplicates would be harmless), but they are removed anyway so the pattern is uniform; the eight `KeyboardController` removals are required (stale digit listeners would otherwise fire in chapters). The removals can be grouped in one `action hubUnwire() [ … ]` at the top of `tour.eligian` to keep the timeline short; they are plain `with "<sel>" { removeControllerFromElement(…) }` operations, so a library action would work too (keeping it beside the hub is a style choice). The hub's count changes in WP-1 (six keys), WP-6 (seven) and WP-9 (eight); the controller-balance test (WP-1) checks it every time.

**Back pattern** (every chapter): `← Hub` button (`#cN-to-hub`, `on click … navigate "Hub"`) and `on key "Escape" navigate "Hub"`; `on key "space" toggle`; `on key "r" run replayChapter("#chN")`. `enterChapter(view)` shows the view and starts the progress bar; `leaveChapter(view, back)` hides, resets and unwires. A self-`navigate` cannot replay either: switching to the timeline that is already current is a no-op (`engine-factory-*.mjs:11009`). Verified: `on key "Escape" navigate "Hub"` / `toggle` / `run replayChapter("#ch1")` compile and smoke; `removeControllerFromElement` compiles and smokes.

**Keyboard caveat to verify in a browser (WP-1)**: the `Escape` handler's own `KeyboardController` is detached by the `on leave` it triggers (navigate → engine switch → end of the lifecycle action). hotkeys-js has already dispatched by then; confirm no error is logged. If it is, move the Escape binding to `in "#chN"` (needs focus inside the view). That KeyboardController then sits on `#chN`, not on `#stage` (`LANGUAGE_SPEC.md:1983-1984`), so `leaveChapter` changes with it: two KeyboardController removals on `#stage` plus `with view { removeControllerFromElement("KeyboardController") }` (otherwise smoke logs `controller for name 'KeyboardController' was not found on the given element` and a listener stays on the view).

**Beat stepping** is deliberately not offered: `seek` takes one fixed position and spec 057's `next`/`prev` targets are not implemented, so per-beat keys would need one `on key` per beat (and one removal each). See §10.

---

## 8. Meta-docs

### 8.1 Storyboards (`examples/eligian-tour/storyboards/`)

Rename to the display numbers (`git mv`): `chapter-05-engine-reach.md` → `chapter-06-engine-reach.md`; `chapter-06-tooling-magic.md` → `chapter-07-the-editor.md`; new `chapter-05-files-and-imports.md`, `chapter-08-the-command-line.md`. Every storyboard keeps the established sections: header blockquote (Teaches / Self-demonstration), §0 Stage layout + view management + shared actions, §1 Segment beats (Narration, Code `#id` + eligian block, Callouts, Effect pane, self-demo note), §2 acceptance, §3 verification / resolved decisions, §4 files. Common edits in **all six existing** storyboards: advance mode → "plays on the raf clock; space toggles, r replays, Esc / ← Hub leave" (F38); view management paragraph → the `leaveChapter` pattern (§4.0); id-registration sentences → "ids come from layout.html, classes from tour.css; both are checked, also through action parameters" (F26); acceptance → add "check:examples --max-warnings 0, smoke:examples, fmt:examples pass"; §4 file lists → the real files.

**Order, cross-references, this plan.** The two renames do not collide with the new files (`chapter-05-engine-reach.md` → `chapter-06-engine-reach.md` and `chapter-06-tooling-magic.md` → `chapter-07-the-editor.md`; the new files are `chapter-05-files-and-imports.md` and `chapter-08-the-command-line.md`), so their order is free. After them, sweep every storyboard for file names and chapter ranges: `chapter-03:13`, `chapter-04:12`, `chapter-05-engine-reach:17` and `chapter-06-tooling-magic:21` each say "Same per-chapter-view architecture as Chapters 1–N (see `chapter-0N-…md` §0)", which is stale after the renumbering; `tour.eligian:487` names `chapter-06-tooling-magic.md` (§8.3). This plan is deleted in WP-10 once every WP has landed (its content then lives in the storyboards and the CHANGELOG), unless the owner keeps it (§10.1.9).

| File | Edits |
|---|---|
| `chapter-01-timeline-and-time.md` | §0: ids `#tok-*`, no `.dim`, `callout(selector, template)`/`narrate(template)` take literal text, no locales routing (F39); shared-actions table adds `revealCard, showView, hideView, enterChapter, resetChapter, replayChapter, leaveChapter`; beats rewritten to §4.1 (8 beats, 58 s, labels/const/target, lifecycle blocks in the recap); Beat 3 code `at 0s..5s revealHero()` (not `selectElement`); §2 acceptance: "the chapter is timed with `const beat` and labels; the `target` beat lights and unlights the box"; §3 resolved decisions per F38; §4 files: `tour.eligian`, `presentation.eligian`, `layout.html`, `tour.css` only |
| `chapter-02-actions-and-composition.md` | header: drop "param-by-name contract", add "dataflow contracts, erased parameters"; Beat 2: delete the `unknown` ghost note (F40) → "leave the type off"; Beat 3 code per F2; Beat 4 rewritten per F3 (no "positional bridge" sentence); Beat 6 → trimmed snippet, not the scrolled file; add Beats 6–7 (contracts, erased) and renumber libraries to 8; delete the closing note about generalizing views; §3: alias import shown |
| `chapter-03-logic-and-data.md` | header: `@name` folding, `else if`, `with`, literals, runtime concat; Beat 1 per F4; Beat 2 → literals; Beat 3 → operators per F6; Beat 4 → if/else if with `ch3Badge`; Beat 5 for per F29; Beat 6 loop control (real; compile verified, DOM checked in the browser); Beat 7 `with`; Beat 8 sigils; §1 "Why reveal-by-selector" paragraph rewritten per F30; §4 build question paragraph rewritten (no id registration; `const` inside the helper action by house rule) |
| `chapter-04-timeline-power-tools.md` | Beat 1 code per F1; §0 `revealCard` is a regular action (F41); Beat 5 id `#c4-code-inline` (F41) and content per F14; delete the ⚠ paragraphs (F15); add Beat 5 items/each/then and Beat 6 anchored inline stagger (7 beats, 57 s); §3: delete "stretch goal", state the chapter's `each … then` (the `then` dot flips at every beat boundary; why a lit / unlit pair in each / then would cancel out); §4: `#c4-pulse`, wave chips |
| `chapter-05-files-and-imports.md` (new) | outline: header (Teaches: file kinds, languages, default/named/library/extensions imports, comments + JSDoc, keywords; Self-demo: the tour's own header lines and `hint.html`); §0 stage; §1 eight beats from §4.5 with ids; §2 acceptance (`@hint` renders; `extensions` declaration compiles; check/smoke/fmt clean); §3 verification notes (`@hint` verified: inlined as `template`; an unused named import does not warn; `controller Confetti` is display-only); §4 files (`hint.html`, `host.js`, `locales.json`) |
| `chapter-06-engine-reach.md` (renamed) | header: "narration is locale-driven" → "the hub title is a LabelController"; five doors; §0 chapter-local actions per §4.6 (`ch5BroadcastPing`, `ch5OnPing`, `ch5Stamp`; `ch5WireButton` deleted); Beat 2 code and text per F7/F12; Beat 3 wiring in `on enter` (F8); Beat 4 interactions, Beat 5 keys (new); Beat 6 controllers per F9/F11, positional; Beat 7 locales REAL (`locales.json`, hub title, the LabelController on `#c5-fx-label-text`, the two `language-change` buttons, back to en-US on leave); Beat 8 host module; Beat 9 recap per F10; §3 "verified in-engine" updated (C8/V1 history kept as history); §5 files add `locales.json`, `host.js` |
| `chapter-07-the-editor.md` (renamed) | rewritten to §5: honesty paragraph kept; mock design (§5.1 table); 15 beats with sources; §2 acceptance #3 "every string verbatim" now lists the files per beat; Beat 3 strings per F21, Beat 4 completion per F22, Beat 5 per F24; §0: selectors through library actions ARE validated (F26) |
| `chapter-08-the-command-line.md` (new) | outline: header (Teaches: install, init, compile, bundle, eligian map, check, formats + lint, smoke, dev, fmt, exit codes; Self-demo: output lines revealed by real staggers); §0 terminal mock (§6.1); §1 eleven beats (§6.2) with the verified outputs and the "illustrative" marks; §2 acceptance (outputs match `node packages/cli/bin/cli.js` 1.0.1; staggers smoke); §3 notes (format option lists differ per command; commander usage errors exit 1); §4 files |

### 8.2 `ELIGIUS_EXECUTION_MODEL.md`

- Title/intro (lines 1-6): "verified against eligius 4.2.0 (`node_modules/eligius/dist/`)"; drop or re-cite every `src/*.ts:line` citation (F32).
- §1: `executeOperation` is iterative in 4.x; keep the threading model.
- §2 "start vs end are INDEPENDENT runs": keep; add "so are lifecycle blocks, event actions and listener actions".
- §3: add `@@p` (loop item by name) and that constants are folded (F4); `const` inside an action = `setVariable` **only for runtime values**.
- §5: rewrite per F31 (copy of the caller's data; outputs do not flow back; `LANGUAGE_SPEC.md` 4.7).
- §6: positional `addController` (F11); controllers are **not** detached on a timeline switch — `removeControllerFromElement("<Name>")` in `on leave` (F43).
- §7: `request-timeline-uri` is a broadcast the engine listens to (F7); the synthetic verb actions `__on__…` (F42).
- §7b: `on enter` / `on leave` first; the 3600 s range as history (F33).
- §8: broadcast vs request clarified: requests are internal to operations.
- Rules: 1 rewritten (engine-fired blocks start empty; called actions copy the caller's data), 5b deleted (F3), 6 → interactions (`on click … navigate`, `run`, `on key`), 7 → lifecycle blocks; new 8 `target` / `with`, 9 erased parameters are preserved, 10 dataflow errors + quick fixes, 11 constant folding, 12 unwire in `on leave` (F34), 13 a seek re-runs starts but never undoes what earlier blocks did to the DOM (replay = reset, then seek; §4.0).

### 8.3 Header comments

- `tour.eligian:1-23`: chapter list (eight); "navigate compiles to a DOMEventListenerController whose generated action broadcasts request-timeline-uri [name, 0]" (F42); view management → `enterChapter` (show + progress bar) / `leaveChapter` (reset + unwire), replay → `replayChapter` (reset + seek); keyboard (`1`–`8`, Esc, space, r); "snippets are hand-authored display assets; every snippet is grammar-valid Eligian or verbatim tool output (checked by pasting into `eligian check`)"; mention `host.js`, `locales.json`, `hint.html`.
- `tour.eligian:33-35` → house rule (F27); `:37-38` (F28); `:49-54` (F29); `:62-66`, `:69-70`, `:75-76` → interactions wording; `:479-488` → §5 header.
- `presentation.eligian:1-7`: list the new actions; `:42-44` note per F3; `:99-103` per F35.
- `layout.html:1-21`: structure lists all views (F36); "Every id/class … must be defined in tour.css" → "ids: layout.html, classes: tour.css; both validated (spec 056)"; mock IDE / terminal note.
- `tour.css:1-11`: same rule; delete the id-registration sentence and blocks (F26); `#progress` comment (784-790) rewritten: the ProgressbarController fills the bar, no per-chapter lengths.

### 8.4 Elsewhere in the repo (grep `eligian-tour`)

| File | Edit |
|---|---|
| `packages/cli/README.md:114-118,136` | still valid (`eligian dev examples/eligian-tour/tour.eligian --open`, `eligian smoke …`); the sample at `:143-149` is a failing-run example (`'Logic': 7 positions FAIL`) with no timeline count: no change |
| `packages/language/KNOWN_ISSUES.md:274` | "Documented in `examples/eligian-tour/presentation.eligian`" (param naming) → point to `LANGUAGE_SPEC.md` 7.4 "Runtime values in operation arguments"; mark the entry superseded by spec 046 |
| `packages/cli/KNOWN_ISSUES.md:3` | historical; no change |
| `examples/README.md` | add a "Tour" section: what it is, `eligian dev examples/eligian-tour/tour.eligian --open`, Pages URL |
| `.github/workflows/pages.yml`, `publish-cli.yml:92` | unchanged (`*.eligian` glob covers the tour; `host.js` is bundled by `--bundle`) |
| `docs/audit/…`, `docs/handoff/…` | historical; no change |
| `packages/language/src/compiler/__tests__/examples-compile.spec.ts:57`, `time-resolver.spec.ts:64`, `lsp/__tests__/document-symbols.spec.ts:116` | compile/resolve/outline the tour; re-run `pnpm test` after each WP (document-symbols asserts `timelines.length >= 7` and non-empty children, `document-symbols.spec.ts:116-122`: nine timelines pass) |
| `specs/050-timeline-lifecycle/spec.md:10,75-83`, `specs/051-time-references/spec.md:13,78`, `specs/048-range-durations/spec.md:11,45`, `specs/056-selectors-through-actions/spec.md:12` | historical ("the tour has 7 timelines", "the CSS progress bar was not replaced by ProgressbarController"): no change |
| `packages/language/src/compiler/transformers/expression-transformer.ts:180-184` | comment cites "the tour's Chapter-5 `on event` round-trip": still true (`ch5OnPing(target)` reads `eventArgs.0`); reword to "the tour's Engine Reach `on event` round-trip" in WP-10 |
| `.gitignore:46-47` | ignores `/examples/eligian-tour/tour.json`, which is tracked anyway: §10.1.8 |
| `CHANGELOG.md` | add an Unreleased entry "The tour: eight chapters …" |

---

## 9. Build order

Each work package leaves the tour passing the gate `G` = `pnpm run check:examples && pnpm run smoke:examples && pnpm run fmt:examples && pnpm test` (plus `node packages/cli/bin/cli.js examples/eligian-tour/tour.eligian -o examples/eligian-tour/tour.json` to refresh `tour.json`, tracked although `.gitignore` lists it, §10.1.8). Snippets for layout.html are validated by pasting them into a scratch `.eligian` (with the tour's `layout`/`styles` imports) and running `eligian check` before they are tokenized into HTML. Estimates are developer hours.

| WP | Scope | Files touched | Acceptance | h |
|---|---|---|---|---|
| **WP-1 Foundations** | `enterChapter`, `resetChapter` (incl. `.muted`), `replayChapter`, `leaveChapter` in the library; typed JSDoc (`@param {string} …`) on every library action (Ch7.7's hover shows the type); every chapter's `on enter`/`on leave` on the new skeleton (Esc / space / `r` → `run replayChapter("#chN")`, unwire); `#progress-fill` driven by the ProgressbarController (delete the six per-chapter `progress-fill` animations and the `@keyframes`); `.lit`, `.muted`, `.pulse-dot` classes and the state-class rule (§4.0); 8-dot rails + display numbers in all chapters; hub digits for the six existing chapter timelines (keys `1`–`4`, `6`, `7`; `7` → `"Tooling Magic"` until WP-8 renames it) and six KeyboardController removals in the hub's `on leave`; hub `hubUnwire()`; `locales.json` + `languages` with `nl-NL` + hub title/tagline LabelControllers; registry collision check of all new action names; **controller-balance test**: a vitest next to `examples-compile.spec.ts` that compiles the tour and, per timeline, compares the controllers its lifecycle action adds in `startOperations` (`addControllerToElement` after `selectElement X`, keyed by X + controller name) with those its `endOperations` remove, following `requestAction`/`startAction` into `config.actions` with the call's literal operationData substituted (`leaveChapter`'s `back` → `"#cN-to-hub"`); the two multisets must be equal | `tour.eligian`, `presentation.eligian`, `layout.html` (rails, hub hint), `tour.css`, new `locales.json`, new `packages/language/src/compiler/__tests__/tour-controllers.spec.ts` | `G`; in a browser (`eligian dev examples/eligian-tour/tour.eligian --open`): enter Ch1, Esc back, enter again → all code blocks hidden again; press `r` mid-chapter → all code blocks hidden again, beat 1 replays and the progress bar restarts; press `space` twice in a chapter → paused and resumed once (no double toggle) and the progress bar stops and resumes with it; console has no `controller … was not found` warnings | 8 |
| **WP-2 Chapter 01** | §4.1: `const beat/long`, labelled `at` chain, beats 2/3/5 snippet fixes (F16–F18), beats 6–7 new, recap with the chapter's own lifecycle blocks (`#c1-cl-lifecycle`) | `tour.eligian`, `layout.html`, `tour.css`, `storyboards/chapter-01-…md` | `G`; `smoke` shows `'Timeline & Time': 9 positions ok` (8 events + lifecycle; count may differ, must be `ok`); the target box lights at 43 s and unlights at 50 s in the browser | 5 |
| **WP-3 Chapter 02** | §4.2: F2, F3 fixes, callouts, beats 6–7 new (with the `twice("#hero")` selector-role line), alias line; move `.diagnostic`, `.squiggle`, `.hover-card` out of the Ch6 mock block into a shared mock-UI section of tour.css | `tour.eligian`, `presentation.eligian` (note F3), `layout.html`, `tour.css`, `storyboards/chapter-02-…md` | `G`; the contract message in `#c2-fx-contract` equals `eligian check` output for the snippet pasted in a scratch file | 4 |
| **WP-4 Chapter 03** | §4.3: `ch3Badge` (else if; each branch clears the other state), `ch3RevealBullets` (const + `@@p`), `ch3LoopControl` (`with "#c3-n-" + @@n`, verified), beats 1–3 rewritten (F4–F6), literals + `with` beats, sigils; `#c3-badge.active` / `#c3-badge.muted` rules; `calc` argument order confirmed via signature help | `tour.eligian`, `layout.html`, `tour.css`, `storyboards/chapter-03-…md` | `G`; in the browser at 42–50 s chips 3 and 7 light, 0 and 12 do not; badge active (full) → muted (dim, grey) → plain | 6 |
| **WP-5 Chapter 04** | §4.4: F1/F14/F15 fixes, `each [ clearSpots() ] then [ with "#c4-pulse" { toggleClass("lit") } ]`, beats 5–6 new, second real stagger, `#c4-cl-inline` out of the block-chip lists | `tour.eligian`, `layout.html`, `tour.css`, `storyboards/chapter-04-…md` | `G`; `smoke` `'Timeline Power Tools'` positions rise (two staggers) and are `ok`; wave chips light 41–43 s and go out; `#c4-pulse` changes state at every beat boundary (7, 15, 22, 31, 40, 49 s) | 5 |
| **WP-6 Chapter 05 Files & Imports (new)** | §4.5: `hint.html`, `import hint …` + `cfPlaceHint()` (`@hint` verified), the real `extensions "./host.js" { operation stampTime(selector: string) function shout }` + `host.js` (no `controller` line: host.js exports none), eight beats, hub card `#card-chf` + `navigate "Files & Imports"` + key `5` (hub: one more key and card removal) | `tour.eligian`, `layout.html`, `tour.css`, new `hint.html`, new `host.js`, new `storyboards/chapter-05-files-and-imports.md` | `G` (smoke bundles `host.js` with esbuild: verified path; the controller-balance test covers the hub's new key); `--bundle` of the tour succeeds (Pages workflow); hub shows one card per existing chapter timeline (seven before WP-9, eight after) in two rows | 7 |
| **WP-7 Chapter 06 Engine Reach** | §4.6: F7–F12 fixes, ping button on enter via `run`, interactions + keys beats, nine controllers, LabelController on `#c5-fx-label-text` + the `language-change` buttons (`ch5Dutch` / `ch5English`, back to en-US on leave), host call `ch5Stamp()`, recap; delete `ch5WireButton`; `locales.json` keys | `tour.eligian`, `layout.html`, `tour.css`, `locales.json`, `host.js`, renamed `storyboards/chapter-06-engine-reach.md` | `G`; browser: click the ping button during beat 3 → panel appears; click `nl-NL` → the label reads `Hallo van een LabelController` and the language buttons stay; leave → the hub title is English; `#c5-fx-clock` shows a time at 57 s; leaving and re-entering shows one click = one reveal | 7 |
| **WP-8 Chapter 07 The Editor** | §5: rename timeline + card (hub key `7` → `"The Editor"`); mock IDE CSS block (replaces only the `.mock-*` / `.complete-*` rules; `.fx.ide` override; `.ide-pop.in`), 15 frames with the strings of §5.2 (re-check each against the source named in its row; copy the signature-help label, the navigate-target list and the Debug Viewer rows from VS Code / `eligian check`), 15 beats + sub-step `at` events; settings recap (ten settings) | `tour.eligian`, `layout.html`, `tour.css`, renamed `storyboards/chapter-07-the-editor.md` | `G`; every quoted diagnostic appears byte-identical in `eligian check` output for a scratch file (keep scratch files outside `examples/**`, e.g. the OS temp dir, so `check:examples` never sees them); every §3b row points at a beat that shows it, or is marked narration-only (hot reload, untrusted host modules); the recap lists exactly the ten keys of `packages/extension/package.json:74-143` | 20 |
| **WP-9 Chapter 08 The Command Line (new)** | §6: mock terminal CSS (`.term-line.out.in`, `.term-line.cmd.later.in`, `.fx.term` override), 11 frames with the verified outputs, 11 beats + 11 staggers over output lines and later commands, hub card `#card-chc` + key `8` (hub: eighth key and card removal) | `tour.eligian`, `layout.html`, `tour.css`, new `storyboards/chapter-08-the-command-line.md` | `G`; `smoke` plays `'The Command Line'` `ok`; outputs re-checked against `node packages/cli/bin/cli.js` 1.0.1; every §3c row points at a beat; hub shows eight cards | 12 |
| **WP-10 Meta-docs** | §8: ELIGIUS_EXECUTION_MODEL.md rewrite (incl. rule 13), header comments, layout/css comments, storyboard renames + cross-reference sweep + common edits, `examples/README.md`, `KNOWN_ISSUES.md:274`, the `expression-transformer.ts:183` comment, CHANGELOG entry; delete this plan (unless §10.1.9 keeps it) | all `.md`, comment blocks | `G` (comments only, but `fmt:examples` re-checks `.eligian` comments' placement; `pnpm check` for the `.ts` comment); every file:line cited in §2 re-read and found replaced | 5 |
| **WP-11 Polish** | re-capture the CLI chapter's tour-dependent outputs from the finished tour (`eligian smoke examples/eligian-tour`: 9 timelines and their position counts → `#cc-fx-smoke`; `--bundle` `Files` / `Size` / `Time` → `#cc-fx-bundle`); callout fallback rows; `prefers-reduced-motion` for new animations (`caret-blink`, `.typing` on terminal lines); keyboard caveat (§7) checked in Chrome and Firefox; `tour.json` (per §10.1.8) and Pages bundle regenerated; `pnpm check` (Biome) clean | `tour.css`, `layout.html`, `tour.json` | `G`; `pnpm check`; the mock smoke and bundle lines equal a fresh run; Pages workflow dry run with `node packages/cli/bin/cli.js examples/eligian-tour/tour.eligian --bundle -o /tmp/site --force` | 5 |

Total ≈ **84 h** (re-estimated in review: WP-1 +2 h for replay, the progress controller and the controller-balance test; WP-8 12 → 20 h and WP-9 8 → 12 h, because today's six far simpler Ch6 mock frames already take about 85 lines of hand-tokenized HTML, `layout.html:378-460`; WP-11 +1 h for the re-capture). WP-2 … WP-9 are independent of each other after WP-1 (each adds or edits one timeline + one section) and can be done in any order; the hub's card and key counts in their acceptance are "one per existing chapter timeline"; WP-6 before WP-7 if `host.js`/`locales.json` are to exist when Ch06 needs them (otherwise WP-7 creates them). WP-10 after the last chapter WP, WP-11 after it (it re-captures the finished tour's output).

---

## 10. Risks and open questions

### 10.1 Owner decisions needed

1. **`const` in timeline blocks.** Constraint 6 says `const` is scoped to actions. A scratch test (`at 0s for @beat as intro [ const points = [...] for (p in @points) { … } ]`) compiles and smokes clean, so the house rule is stricter than the language. Keep the rule (this plan does) or relax it and inline the Ch3 demos into the beats?
2. **Hub order vs section ids.** The plan keeps `#ch5`/`#ch6` ids with display numbers 06/07 and letter prefixes for the new chapters. Alternative: renumber everything (`#ch5` → `#ch6`, …), ~400 id edits in three files, which this plan avoids. Confirm.
3. **Beat stepping keys.** Not planned (no `next`/`prev`; one `on key` + one removal per beat). Want digits `1`–`8` *inside* chapters to seek to beat starts (8 bindings + 8 removals per chapter)?
4. **Live language switch in Ch06 beat 7.** Resolved in review, no decision needed: the `language-change` broadcast switches the locale and LabelControllers re-render (§2.2), so the beat has two real buttons (`ch5Dutch` / `ch5English`); `on leave` switches back to en-US, because the language otherwise persists into the hub (and the preview's language select would not follow).
5. **Chapter 07 length (106 s) and 15 beats.** Split into "The Editor: writing" (beats 1–10) and "The Editor: running" (11–15) as two cards? The plan keeps one chapter per the task statement.
6. **Host module in the Pages bundle.** `--bundle` with `extensions` verified locally; the published site will execute `host.js`. Acceptable? (The operation only writes a time string.)
7. **Validator issue for F11.** `addController("X", { … })` compiles silently to nested data. File an issue / add a validator (out of the tour's scope, but the tour's docs used the form).
8. **`tour.json`.** `.gitignore:46-47` declares it a build artifact, yet it is tracked (committed before the rule). Untrack it (`git rm --cached examples/eligian-tour/tour.json`; the verification command's `-o tour.json` is then only a local compile check) or drop the ignore rule and keep refreshing it. Until decided the plan keeps refreshing the tracked file.
9. **This plan after execution.** Deleted in WP-10 (default), or kept as a design record (e.g. under `docs/`).

### 10.2 Technical risks (with the mitigation planned)

- **Controllers accumulate across visits** (engine never detaches on switch; verified in `engine-factory-*.mjs`). Mitigation: `leaveChapter` + per-chapter removals; the invariant "every controller `on enter` adds is removed in `on leave`" is written in the action's JSDoc and checked by the controller-balance test added in WP-1 (part of `pnpm test`, so of `G`). `check`, `smoke` and `fmt` all pass with a wrong count: a missing removal leaves e.g. a hub digit live inside a chapter, an extra one only logs a warning.
- **Escape handler detaches itself** while handling (§7 caveat). Verify in two browsers; fallback `in "#chN"`.
- **`with "#c3-n-" + @@n`** (string + number runtime concat) — verified in review (concatenateStrings, smokes); the DOM result is WP-4's browser check.
- **`@hint` named-import reference** — verified in review (inlined as `template`).
- **`then` postlude for items without end blocks** — verified (it runs), but in the same instant as the next item's prelude, so only a postlude effect the prelude does not undo is visible (§4.4: `toggleClass`).
- **Replay**: a seek never undoes what earlier blocks did to the DOM (`_reconcileActions`); `replayChapter` resets first. What a beat changes outside the state classes `resetChapter` clears (content written by `setElementContent`, the host clock, the language) is not reset by `r`: beats either use the state classes or rewrite their content when they start.
- **CSS specificity of hidden components**: the state-class rule (§4.0); `#c3-badge` and `.term-line.out` are the known cases.
- **`calc` argument order** — inferred `left, right, operator` from a type error; confirm with signature help (§4.3).
- **Sub-step `at` events after a sequence** rely on labels of earlier items (supported; the current tour already does this for the stagger). Many small `at` events raise `smoke` position counts and runtime — acceptable (jsdom seeks are fast).
- **`--max-warnings 0`**: an unused named import does not warn (verified); a `customFunction` of an undeclared function may (unverified; the tour declares `shout`).
- **Progress bar**: the ProgressbarController reads the timeline duration and follows pause, seek and replay, which a CSS animation keyed on `.is-active` cannot (`tour.css:803-829`). It also makes `#progress` clickable (a click seeks, `engine-factory-*.mjs:9064-9071`) and sets `pointer-events: none` on the fill. Verified: compiles and smokes without a `textElement`. Browser check in WP-1.
- **`document-symbols.spec.ts`** opens the tour and asserts at least 7 timelines with children; nine pass. If an expectation ever breaks, adjust the test, never the tour.
- **Mock strings drift** when messages change upstream. WP-8/WP-9 acceptance re-runs the CLI; add a note in `chapter-07`/`chapter-08` storyboards listing the source file per string so a future bump can re-verify.
- **Anchor positioning fallback** rows grow to 15 per chapter; browsers without `anchor-name` will show stacked chips — unchanged behaviour, more rows.
- **`languages` hover** (`eligian-hover-provider.ts:143-146`) is not mocked in Ch7.7: no verbatim text was captured; WP-8 may add it as a fourth card if time allows.

### 10.3 Verification checklist for the "verify-first" items (run before each beat is called REAL)

| Item | How |
|---|---|
| `with "#c3-n-" + @@n { … }` | compile + smoke verified in review; remaining: WP-4's browser check that chips 3 and 7 get `.lit` |
| `then` postlude without end blocks | verified in review (the `endOperations` of `sequence-item-*` hold the postlude) |
| `@hint` from a named HTML import | verified in review (the compiled `template` holds the file) |
| LabelController live switch | settled from the engine source (`language-change`, §2.2); WP-7's browser check: click `nl-NL`, read `#c5-fx-label-text` |
| Replay (`r`) | WP-1 browser check: mid-chapter `r` → code blocks hidden, beat 1 replays, progress bar restarts |
| ProgressbarController | WP-1 browser check: the fill follows play, pause (`space`) and `r` |
| Escape self-detach | browser console while pressing Esc in a chapter |
| `calc(left, right, operator)` | VS Code signature help on `calc(` |

---

## Review log

Three reviews (syntax-and-facts, buildability, completeness; 57 findings) were checked against the grammar, the code and scratch runs of `node packages/cli/bin/cli.js` 1.0.1 on a copy of the tour. Duplicates are logged once with all their numbers.

- Applied #1, #25: `r` replays through `replayChapter(view)` (reset, then broadcast `timeline-seek-request` [0]); one library action with a literal `run` argument instead of one action per chapter (verified compile + smoke); WP-1 acceptance tests `r` mid-chapter; execution-model rule 13.
- Applied #2, #24: ChF beat 3 callout → "one of each per file"; the duplicate-styles error quoted in §4.5.
- Applied #3: JSDoc hovers split into call-site (JSDoc + Requires) and definition (roles) cards; `{string}` added to the shown JSDoc and to presentation.eligian (WP-1); template shown as ` * Description`.
- Applied #4, #34: E120 is an error in both mocks; CLI text pasted; the editor mock uses the editor's own format (`(at … in the compiled JSON)`, source `Eligius lint`, code `E120`, `lsp/eligius-lint-notifications.ts:23-25`), not the CLI text #34 proposed.
- Applied #5, #35, #46: "Ten settings"; WP-8 acceptance checks the ten keys.
- Applied #6: Ch7.4 snippets changed so the fixes really read `Insert selectElement("#box")` / `Add target "#box"`; both hover texts verified.
- Applied #7: Gantt bars named by labels; stagger rows carry the quoted item text (`stagger 1/3 "#c4-card-1"`, the CST text includes the quotes).
- Applied #8: runtime diagnostic prefix, code `runtime_error`, toast text.
- Applied #9: typed signature label (`eventName: eventName`, no type mapping); stale "in WP-7 / WP-8" references removed.
- Applied #10: `revealBlock` moved to a `rev` list.
- Applied #11, #33: typo `activ` → `Did you mean: active?` (verified against tour.css); `spto` rejected as the example because it yields two suggestions (`spot, str`).
- Applied #12, #37, #47: bundle size/time and smoke counts marked for re-capture in WP-11 (9 timelines); json mock gains `endLine`/`endColumn`; the README smoke sample is a FAIL example, no edit.
- Applied #13: exit-code table and narration cover compile option errors (1) and `--selector-not-in-layout` (2).
- Applied #14, #28: own fix: prelude `clearSpots()`, postlude `toggleClass("lit")` on `#c4-pulse` (verified compile + smoke), so the dot flips at each boundary; verify note dropped.
- Applied #15, #29, #43: `ch3Badge` branches clear the other state; `#c3-badge.active` / dimmer `#c3-badge.muted`; `.muted` in `resetChapter`.
- Applied #16: Escape fallback changes `leaveChapter`'s removals.
- Applied #17: `run` callout names eventTarget, eventKey and the arguments.
- Applied #18, #36: ChF.8 callout and narration on ActionName; garbled `' '` fixed.
- Applied #19: full `fx, fn` suggestion list.
- Applied #20: F14 points at §4.4 beat 6.
- Applied #21, #40: wrong "not possible" reason dropped; WP-1 wires keys 1–4, 6, 7; WP-6 / WP-9 card counts "one per existing chapter timeline".
- Applied #22: `@hint`, the postlude and the concat marked verified; §2.2, §10.2 and §10.3 updated.
- Applied #23: eligian-map narration: the preview and smoke build the map in memory.
- Applied #26: progress bar → the ProgressbarController in `enterChapter` (verified compile + smoke without `textElement`); per-chapter CSS lengths and their risk removed.
- Applied #27: LabelController on `#c5-fx-label-text`; language buttons are siblings.
- Applied #30, #31: `.term-line.out.in`, later commands `.term-line.cmd.later` in each stagger; state-class rule added to §4.0.
- Applied #32: controller-balance vitest in WP-1.
- Applied #38: real `extensions` declaration has no `controller`; the unused-import risk replaced by the verified "no warning".
- Applied #39: live language switch planned as real (`ch5Dutch` / `ch5English`, back to en-US in `on leave`); F42 names `__nav__<slug>_<fnv1a hex>`.
- Applied #41: `.diagnostic`, `.squiggle`, `.hover-card` move in WP-3.
- Applied #42: `#c4-cl-inline` leaves the block-chip lists.
- Applied #44: `.fx.ide, .fx.term` override.
- Applied #45: WP-8 20 h, WP-9 12 h, WP-1 8 h, WP-11 5 h; total 84 h.
- Applied #48: lifecycle blocks taught in the Ch1.8 recap (real, `#c1-cl-lifecycle`); matrix row cites it.
- Applied #49: `Convert to '0s for 4s'` (Ch7.10), navigate-target diagnostic + `Change to "Logic"` / `Create timeline "Logik"` (Ch7.8), `Generate language block (2 languages)` (Ch7.14).
- Applied #50 (in part): Debug Viewer sub-step and Compilation Errors panel in Ch7.11, timeline hover in Ch7.7, hot reload stated narration-only; the `languages` hover is not mocked (no verbatim text captured; noted in §10.2).
- Applied #51: `private endable action` (ChF.5), `@param {string}` (ChF.7), `topic` line (Ch6.3), `custom` + scroll-container check (Ch1.2), `navigate … at` (Ch6.4).
- Applied #52: `eligian-cli`, `eligian compile`, free-port note.
- Applied #53: §3b extension and §3c CLI coverage tables, checked in WP-8 / WP-9.
- Applied #54 (a), (c): cross-reference sweep and this plan's fate (deleted in WP-10 by default, §10.1.9). Rejected #54 (b): the renames cannot collide; `chapter-05-files-and-imports.md` and `chapter-06-engine-reach.md` are different names from the files they would supposedly overwrite.
- Applied #55: `tour.json` tracked-but-ignored → owner decision §10.1.8.
- Applied #56: specs 048/050/051/056, `expression-transformer.ts:180-184`, `document-symbols.spec.ts:116-122`, `.gitignore` added to §8.4.
- Applied #57: matrix cites beat ids only; spec 056 shown in Ch2.7; interaction row separates real and display verbs.
