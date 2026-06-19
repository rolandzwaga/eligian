# Storyboard — Chapter 6: Tooling Magic

> Teaches the **dev-time** half of Eligian — the VS Code tooling that makes the DSL not just
> concise but *type-safe and live*: on-the-fly compile + live preview, CSS class/selector
> validation with "did you mean?" quick-fixes, autocomplete everywhere, JSDoc hover, semantic
> validation, CSS hot-reload, and the locale editor.
>
> **⚠ This chapter is different from 1–5.** Those taught language/engine features the running
> presentation could genuinely *dogfood* at runtime. Chapter 6's subject is **editor tooling** —
> it lives in VS Code, not in the Eligius engine, so a running timeline **cannot exercise it live**.
> So Chapter 6 **reenacts** the tooling: a mock-editor effect pane showing **real example
> diagnostics/completions/hover taken verbatim from the actual providers**. The genuine "dogfood"
> here is *historical and meta*: this entire tour's source was authored, validated, autocompleted,
> and compiled by exactly these tools — Chapter 6 recounts that. (See §3 — this honesty must be
> explicit in the chapter itself, not hidden.)

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapters 1–5 (see `chapter-05-…md` §0): a `#ch6` `.view`
inside `#stage` with its own chrome (`.chrome` + `.progress-rail` + `.chapter-label` + `#c6-to-hub`),
`.code-pane`, `.effect-pane`, `.callout-layer`. Structural panes are shared classes; DSL-selected leaf
elements are namespaced `#c6-…` and **must be registered in `tour.css`** (only direct-literal
`selectElement`/`addClass`/`navigate` selectors are CSS-validated — selectors passed to library actions
like `revealBlock`/`demo` are not; the only hard requirements are `#c6-to-hub` and `#card-ch6`). `#narration`
is the shared subtitle.

**View management** = the self-managing endable setup action (see `ELIGIUS_EXECUTION_MODEL.md` §7b):
`timeline "Tooling Magic"`'s first event is `at 0s..3600s [ showView("#ch6") + showView("#narration")
+ wire #c6-to-hub ] [ hideView("#ch6") + hideView("#narration") ]`. Hub card `#card-ch6` `navigate`s to
`"Tooling Magic"`.

### Effect-pane motif: a mock editor

Because the subject *is* the editor, Chapter 6's effect pane is a small faithful **mock VS Code**: a code
strip with a red squiggle, a completion dropdown, a hover card, a lightbulb quick-fix, a preview webview
thumbnail. These are pre-authored HTML (`#c6-fx-*`) revealed by the existing `demo()`/`revealBlock()`
library — **no live LSP**. Text in them is copied from the real providers (cited per beat).

### Shared actions

Reuses the existing library (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`,
`showView`, `hideView`). **No new chapter-local actions** — there is no runtime tooling to wire, so unlike
Chapters 3–5 there is no real self-demo construct (and that's the honest point of §3).

---

## 1. Segment beats

Each beat: **click to advance** (autoplay toggle runs them on the raf clock at the authored `at` times).
A beat = (narration swap) + (code reveal / spotlight) + (callout) + (effect tick). Times are raf positions.

### Beat 1 — "The editor is half the language" (0s–7s)

- **Narration:** "Eligian isn't just a shorter way to write Eligius JSON — it's a *typed, tooled* way.
  Everything you've watched was written with the tools this chapter shows."
- **Code revealed** (`#c6-code-why`): concise `.eligian` beside the verbose JSON it compiles to (a few lines
  of `at 0s..5s fadeIn("#box")` ↔ the equivalent `timelineActions`/`operationData` blob).
- **Callout:** "concise on the left, type-safe everywhere, live in the preview — that's the magic."
- **Effect pane (reenacted):** the mock editor frame fades in (file tab `tour.eligian`, a gutter, a status bar).

### Beat 2 — "Compile + live preview" (7s–15s)

- **Narration:** "Hit *Preview Timeline* and the extension compiles your `.eligian` on the fly, runs it in an
  embedded Eligius engine, and reloads on every save. This tour is exactly what you'd see in that panel."
- **Code** (`#c6-code-preview`): the command-palette entries (display only) —
  ```text
  > Eligian: Preview Timeline      (eligian.preview)
  > Eligian: Compile Current File  (eligian.compile)
  ```
- **Callouts, click order:**
  1. `Preview Timeline` → "compiles + runs in an embedded webview engine (PreviewManager + CompilationService)"
  2. "save" → "a FileWatcher recompiles + reloads on save — edit-see-edit-see"
- **Effect pane (reenacted, with a REAL thread):** mock split — `.eligian` source on the left, a thumbnail of
  *this very tour* on the right. **Honest note in-beat:** if you opened this tour via *Eligian: Preview
  Timeline*, the right pane is literally how you're seeing it now.
- **Source of truth:** commands from `extension/package.json` (`eligian.preview`/`eligian.compile`/
  `eligian.openLabelEditor`); preview pipeline in `extension/src/extension/preview/`.

### Beat 3 — "CSS validation + quick-fix" ⭐ (the tour's own safety net) (15s–24s)

- **Narration:** "Every class and selector you use is checked against your imported CSS. Typo a class and you
  get a red squiggle, a suggestion, and a one-click fix — before you ever run anything."
- **Code** (`#c6-code-css`):
  ```eligian
  styles "./tour.css"
  …
  addClass("buton")        // typo
  ```
- **Callouts, click order:**
  1. `styles "./tour.css"` → "the imported CSS is the source of truth (PostCSS-parsed)"
  2. squiggle → "*CSS class 'buton' is not defined in any imported CSS files. Did you mean: button?*"
  3. lightbulb → "quick-fixes: *Create '.buton' in tour.css* · *Open CSS file*"
- **Effect pane (reenacted, REAL strings):** mock editor line `addClass("buton")` with a red underline, a
  diagnostic tooltip with the exact message, and a lightbulb menu — text copied verbatim from
  `css/selector-validation.ts` (`Did you mean: …?`) and `css/css-code-actions.ts` (`Create '.x' in tour.css`).
- **Meta (true):** this is the feature that made every `#cN-*` id in this tour get registered in `tour.css`;
  it's why the tour compiles clean. *That* is the real dogfood — historical, at build time.

### Beat 4 — "Autocomplete everywhere" (24s–32s)

- **Narration:** "Type and the editor knows what fits: operations with their parameters, the eight
  controllers, label IDs, CSS classes from your stylesheet, even HTML elements and an `on event` skeleton."
- **Code** (`#c6-code-complete`): a half-typed call —
  ```eligian
  addController("…")     // ← completion lists DOMEventListenerController, LabelController, …
  fad…                   // ← fadeIn / addClass / … with signatures
  ```
- **Callouts, click order:**
  1. dropdown → "operations show their signature + docs (`fadeIn (operation)` → params, outputs)"
  2. `addController("` → "controller names — and LabelController offers your label IDs next"
  3. "more" → "CSS classes/selectors, HTML elements, event names, `on event` snippet"
- **Effect pane (reenacted):** mock completion popup under the caret, an item highlighted with a side
  detail panel (signature + markdown doc), mirroring `completion/operations.ts` (`label: "<name> (operation)"`,
  markdown documentation) and the controller/css/event handlers.

### Beat 5 — "JSDoc hover + semantic validation" (32s–40s)

- **Narration:** "Document an action once with `@param` and the editor hovers those docs at every call —
  and it auto-generates the JSDoc skeleton for you. Meanwhile the validator catches wrong argument counts,
  unknown operations, and bad navigation or event names."
- **Code** (`#c6-code-jsdoc`):
  ```eligian
  /**
   * @param {string} selector
   */
  action revealBlock(selector: string) [ … ]

  revealBlock()            // ← validator: expects 1 argument but got 0
  ```
- **Callouts, click order:**
  1. hover card → "`@param` docs appear at the call site (hover-builders.ts)"
  2. "generate" → "auto-insert the JSDoc skeleton from the signature (jsdoc-template-generator.ts)"
  3. squiggle → "semantic checks: arg counts, unknown ops/actions, unknown `navigate` targets, `on event` names"
- **Effect pane (reenacted):** mock hover card over a `revealBlock(…)` call (the `@param` text), plus a second
  line with an arg-count squiggle. **True tie-in:** the `on event` name check is the one this session relaxed
  (V1) so custom events compile — the tour's own Chapter-5 `on event "tour-ping"` passes because it's broadcast.
- **Source of truth:** `jsdoc/` (extractor/formatter/parser/template-generator), `hover/hover-builders.ts`,
  `validators/`.

### Beat 6 — "Hot-reload, locales, and the whole picture" recap + end card (40s–48s)

- **Narration:** "Tweak your CSS and it hot-reloads into the running preview without restarting the timeline.
  Edit translations in a dedicated locale editor. Concise, type-safe, live — that's Eligian."
- **Code** (`#c6-code-recap`): the three pillars of the tooling, annotated —
  ```text
  compile + preview   ·  validate (CSS + semantics)  ·  autocomplete + hover
  CSS hot-reload       ·  Eligian: Edit Locales
  ```
- **Callouts:** spotlight each → "edit-see loop · safety net · discoverability".
- **Effect pane (reenacted):** mock preview where a CSS color change ripples in live (css-watcher +
  webview-css-injector), then a glimpse of the locale editor (`eligian.openLabelEditor`).
- **Meta moment:** the words learned across the whole tour pulse one last time.
- **End card:** "Chapter 6 ✓ — you've seen the whole language." + `← Hub`. (Final chapter — the hub's six
  cards are now all live.)

---

## 2. What this chapter must prove (acceptance)

1. The `timeline "Tooling Magic"` + `#ch6` view **compile clean** (`--check`, exit 0) within `tour.eligian`,
   and the chrome behaves like every other chapter.
2. Hub card `#card-ch6` `navigate`s to "Tooling Magic" and `← Hub` returns (verified in-engine, like 1–5).
3. **Every reenacted diagnostic/completion/hover string is faithful** to the real providers — copied from
   `css/selector-validation.ts`, `css/css-code-actions.ts`, `completion/*`, `hover/hover-builders.ts`,
   `extension/package.json`. No invented messages.
4. The chapter **states plainly** that these panels are reenactments of dev-time tooling, not live LSP (§3).
5. Motion stays restrained (150–250ms eases, transform/opacity only).

## 3. Reenacted, not live — and why (the honest core)

Chapters 1–5 each ran a *real* construct in the Eligius engine (a real `for`, a real `stagger`, a real
eventbus round-trip). **Chapter 6 cannot**: CSS validation, autocomplete, hover, quick-fixes, compile, and
the preview are **VS Code / language-server features**, not engine operations — a running timeline has no
access to them. Pretending otherwise would be dishonest.

So the design is: **faithful reenactment + a true meta-claim.**
- The mock-editor panels show **verbatim** strings from the actual providers (cited per beat) — accurate, not
  fabricated.
- The genuine dogfood is **historical**: this tour's entire source *was* validated, autocompleted, JSDoc-ed,
  and compiled by these tools (that's how the `#cN-*` ids got registered, how the ops were discovered, how
  C3/C5/C6/C7/C8/V1 were caught). Beat 2/3/5 say so explicitly.
- The one *currently-true* live tie-in: if the viewer opened the tour via **Eligian: Preview Timeline**, the
  preview beat is literally their current view — stated as a conditional, not a guarantee.

No new DSL/engine feature is introduced, so **no dogfooding bug-hunt is expected** here (the tooling is
exercised across the whole tour at build time, not by Chapter 6 at runtime). If building the chapter happens
to surface a tooling bug, the usual report+fix+regression-test applies.

## 4. Resolved decisions

- **Advance mode:** click-to-advance + autoplay toggle (same as 1–5).
- **Effect-pane fidelity:** *all reenacted* (mock editor) — there is no live tooling to run. Strings are real.
- **No self-demo construct / no chapter-local actions** — nothing to wire at runtime (deliberate, per §3).
- **Timeline name / uri:** `"Tooling Magic"` (the `navigate` uri). Hub card label: "Tooling Magic".
- **Scope:** compile+preview · CSS validation+quick-fix · autocomplete · JSDoc hover+template · semantic
  validation · CSS hot-reload · locale editor. (Locales themselves were touched illustratively in Ch5 Beat 5;
  here the focus is the *editor* for them, not the runtime LabelController.)

## 5. Files this implies (when building)

```
examples/eligian-tour/
├── layout.html      # + #ch6 view: pre-tokenized snippets (#c6-code-*), #c6-cl-* callouts, and the
│                    #   mock-editor effect pieces (#c6-fx-*): squiggle line, completion popup, hover card,
│                    #   quick-fix lightbulb, preview thumbnail, locale-editor glimpse
├── tour.css         # + Chapter-6 block/callout styles + mock-editor styles; register #c6-to-hub (+ #card-ch6
│                    #   already exists). #c6-fx-*/#c6-code-*/#c6-tok-* only need styling, not CSS-id validation
│                    #   (they're passed to library actions, not direct selectElement literals)
└── tour.eligian     # + timeline "Tooling Magic" (setup action + 6 beats; reuses revealBlock/spotlight/
                     #   callout/narrate/demo — NO new actions) + wire hub card #card-ch6 → navigate "Tooling Magic"
```

> Build note: this is the last chapter — after it, remove the final `is-soon` (already done for #card-ch5;
> #card-ch6 too) and confirm all six hub cards navigate. Verify in the jsdom harness exactly like 1–5:
> switch to "Tooling Magic", seek through the beats, confirm the view + back-nav. There is no eventbus/loop
> round-trip to assert here — the reenacted panels are static reveals.
