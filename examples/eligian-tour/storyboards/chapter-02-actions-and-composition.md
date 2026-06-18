# Storyboard — Chapter 2: Actions & Composition

> Teaches: defining `action`s, parameters + optional type annotations, the **unified call syntax**,
> the **param-by-name** contract, `endable action` (start **and** end blocks) + the re-select rule,
> and **libraries / imports** (public vs private, JSDoc `@param`).
> **Self-demonstration:** every beat is driven by actions imported from `presentation.eligian` — this
> chapter *is* a composition of the very library it explains. Beat 6 puts that library's own source on screen.

---

## 0. Stage layout (shared)

**RESOLVED — per-chapter views.** Each chapter is its own `.view` (`#ch1`, `#ch2`, …) inside `#stage`,
holding its own chrome (back button + progress rail + label), `.code-pane`, `.effect-pane`, and
`.callout-layer`. The structural panes are **classes** (`.code-pane` / `.effect-pane` / `.chrome` /
`.callout-layer` / `.progress-rail`) shared across chapters; only leaf elements the DSL selects keep ids,
namespaced per chapter (`#c2-…`). The hub `navigate`s straight to each chapter timeline.

**Shared narration.** `#narration` is a single subtitle bar — a direct child of `#stage`, not inside any
view — toggled visible while a chapter is active (`showView("#narration")` on chapter start,
`hideView("#narration")` on hub start). This keeps `narrate(template)` chapter-agnostic (it always targets
the one `#narration`) instead of forcing a per-chapter narration selector.

### Shared presentation actions

Reuses the Chapter-1 library (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`,
`showView`, `hideView`). No new machinery required — which is itself the point of this chapter.

---

## 1. Segment beats

Each beat: **click to advance** (autoplay toggle runs them on the raf clock at the authored `at` times).
A beat = (narration swap) + (code reveal / spotlight) + (callout) + (effect tick). Times are raf positions.

### Beat 1 — "Name a sequence of operations" (0s–7s)

- **Narration:** "An *action* is a named list of operations. Define once, call anywhere."
- **Code revealed** (`#c2-code-def`, fades in then `.typing` sweep):
  ```eligian
  action revealBlock(selector) [
    selectElement(selector)
    addClass("in")
    addClass("typing")
  ]
  ```
- **Callouts, click order:**
  1. `action` → "declares a reusable action"
  2. `revealBlock` → "its name — how you'll call it"
  3. the `[ … ]` body → "operations run top-to-bottom, threading one **operationData** object"
- **Effect pane:** three stacked op-pills (`selectElement` → `addClass` → `addClass`) with an arrow showing
  data flowing down the chain (illustrative).
- **Self-demo note:** "you've already seen this one — `revealBlock` is what just revealed this very block."

### Beat 2 — "Parameters & (optional) types" (7s–14s)

- **Narration:** "Actions take parameters. Annotate types when you want the compiler's help."
- **Code** (`#c2-code-params`):
  ```eligian
  action fadeIn(selector, duration: number) [
    selectElement(selector)
    animate({ opacity: 1 }, duration)
  ]
  ```
- **Callouts:**
  1. `selector` → "a parameter — read inside as `$operationdata.selector`"
  2. `: number` → "optional type annotation — `string · number · boolean · object · array`"
  3. `unknown` (ghost note) → "the opt-out type; no checking"
- **Effect pane:** a box fades opacity 0→1 over the named `duration` (real `animate`).

### Beat 3 — "Unified call syntax" (14s–22s)

- **Narration:** "Calling your action looks exactly like calling a built-in operation."
- **Code** (`#c2-code-call`):
  ```eligian
  at 0s..5s fadeIn("#hero", 400)   // your action
  at 0s..5s addClass("on")         // built-in op — same shape
  ```
- **Callouts, click order:**
  1. both call sites → "one syntax: `name(args)`"
  2. resolution note → "the compiler resolves **action-first**, then built-in operation"
  3. expansion chip → "an action call expands to `requestAction` + `startAction`"
- **Effect pane:** a single call pill splits into `requestAction` → `startAction` (illustrative of the desugar).
- **Self-demo note:** "every callout, narration, reveal in this tour is an action call just like these."

### Beat 4 — "Params feed operations *by name*" (22s–30s)

- **Narration:** "A parameter that feeds a built-in op must be **named** after that op's input."
- **Code** (`#c2-code-byname`):
  ```eligian
  action narrate(template) [   // not `text` — setElementContent reads `template`
    selectElement("#narration")
    setElementContent(template)
  ]
  ```
- **Callouts:**
  1. `template` → "matches `setElementContent`'s input property"
  2. cheat-sheet chip → "`selectElement`→`selector` · `addClass`→`className` · `setElementContent`→`template`"
  3. why → "params thread by **name** through operationData; there's no positional bridge"
- **Effect pane:** a key→slot diagram: the param key `template` snaps into the op's `template` slot; a
  mis-named `text` key visibly fails to fit.
- **Meta badge:** "this is exactly why the narration you're reading uses `template`."

### Beat 5 — "endable actions: start *and* end" (30s–38s)

- **Narration:** "An *endable* action has two blocks: set up, then tear down — independently."
- **Code** (`#c2-code-endable`):
  ```eligian
  endable action highlight(selector) [
    selectElement(selector)   // start: re-select, then add
    addClass("spot")
  ] [
    selectElement(selector)   // end: re-select AGAIN — nothing carries over
    removeClass("spot")
  ]
  ```
- **Callouts, click order:**
  1. first `[ … ]` → "**start** ops — fire at the range's start"
  2. second `[ … ]` → "**end** ops — fire at the range's end"
  3. the repeated `selectElement` → "start & end are independent runs (fresh `{}`); **re-select in each**.
     The only thing that persists between them is the DOM."
- **Effect pane:** a token gets `.spot` on enter and loses it on exit as a range bar passes its start/end —
  showing reversibility / seek-safety.

### Beat 6 — "Libraries & composition" + the reveal (38s–46s)

- **Narration:** "Group actions into a library, import what you need — `private` stays home."
- **Code** (`#c2-code-lib`):
  ```eligian
  library presentation
  /** @param selector CSS selector for the code block */
  action revealBlock(selector) [ … ]      // public — importable
  private action _internal() [ … ]         // library-only

  // elsewhere:
  import { revealBlock, narrate } from "./presentation.eligian"
  ```
- **Callouts:**
  1. `library` → "marks a library file (no timelines)"
  2. `private` → "usable only within the library"
  3. `/** @param */` → "JSDoc → hover docs + generated call templates (Chapter 6 fodder)"
  4. `import { … }` → "pull named, public actions into a program"
- **Meta moment:** the code pane scrolls the **actual `presentation.eligian`** — the library that has been
  driving every beat — and the action names used this chapter pulse as they scroll by.
- **End card:** "Chapter 2 ✓ — next: Logic & Data" + `← Hub`.

---

## 2. What this chapter must prove (acceptance)

1. The Chapter-2 timeline + any new blocks **compile clean** (`--check`, exit 0) within `tour.eligian`.
2. Hub card `#card-ch2` `navigate`s to "Actions" and the `← Hub` back button returns (verified in-engine).
3. Every beat is driven by existing library actions (no new machinery) — proving composition.
4. Motion stays restrained (150–250ms eases, transform/opacity only).

## 3. Resolved decisions

- **Advance mode:** click-to-advance + autoplay toggle (same as Chapter 1).
- **Effect-pane fidelity:** pragmatic mix — Beats 2/5 use *real* operation results (`animate`, class
  toggles on a passing range); Beats 1/3/4 (chains, desugaring, name-binding — abstract) use tasteful
  illustrative diagrams.
- **Timeline name / uri:** `"Actions"` (short, slug-friendly for `navigate`). Hub card label: "Actions & Composition".

## 4. Files this implies (when building)

```
examples/eligian-tour/
├── layout.html      # + #ch2 view (or #c2-* blocks) : pre-tokenized Chapter-2 snippets + callout chips
├── tour.css         # + Chapter-2 block/callout styles (validated)
├── presentation.eligian   # unchanged — reused as the live example
└── tour.eligian     # + timeline "Actions" (6 beats) + wire hub card #card-ch2 → navigate "Actions"
```

> Note: building Chapter 2 is also when we generalize the single `#chapter` view into per-chapter views
> (`#ch1`, `#ch2`), per the authoring decision in §0.
