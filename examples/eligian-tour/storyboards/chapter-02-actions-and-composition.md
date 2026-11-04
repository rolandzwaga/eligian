# Storyboard — Chapter 2: Actions & Composition

> Teaches: defining `action`s, parameters + optional type annotations (or none), the **unified call syntax** (and
> why a bare operation is not a timeline event), how parameters reach operations (by name, or bridged by
> `setOperationData`), `endable action` (start **and** end blocks) + the re-select rule, **dataflow contracts**,
> **erased parameters** (save / restore, selectors checked through parameters), and **libraries / imports**
> (public vs private, `as` aliases).
> **Self-demonstration:** every beat is driven by actions imported from `presentation.eligian`: this chapter *is* a
> composition of the very library it explains, and its `narrate` is the one-name-forwarding case Beat 4 shows.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapter 1 (see `chapter-01-timeline-and-time.md` §0): `#ch2` is a
`section.view.chapter` inside `#stage` with its own `header.chrome` (back button `#c2-to-hub`, an 8-dot
progress rail with dot 2 current, the label `02 · Actions & Composition`), `section.code-pane` of pre-tokenized
`pre#c2-code-*.code` blocks, `section.effect-pane` of `div#c2-fx-*.fx` panels and a `div.callout-layer` of
`div#c2-cl-*.callout` chips. The shared `#narration` and `#progress` sit outside the views.

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056).

**View management:** the chapter shows and hides its view only through its lifecycle blocks:
`on enter [ enterChapter("#ch2") … ]` shows the view and the narration and attaches the ProgressbarController to
`#progress-fill`; `on leave [ leaveChapter("#ch2", "#c2-to-hub") ]` hides them, resets the view (`resetChapter`:
removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it) and removes every controller
`on enter` attached (three KeyboardControllers on `#stage`, the back button's listener, the ProgressbarController).

### Shared presentation actions

Reuses the library unchanged (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`, and the
chapter skeleton's `enterChapter`, `replayChapter`, `leaveChapter`; table in `chapter-01-timeline-and-time.md` §0).
No new machinery, which is itself the point of this chapter.

---

## 1. Segment beats

The beats play on the raf clock; `space` pauses and resumes, `r` replays the chapter (`replayChapter`: reset the
view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap + code block + spotlight +
callout + effect panel. The chapter is one sequence of labelled items:

```eligian
timeline "Actions" in "#stage" using raf {
  on enter [
    enterChapter("#ch2")
    on click "#c2-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch2")
  ]
  on leave [ leaveChapter("#ch2", "#c2-to-hub") ]

  sequence each [ clearSpots() ] {
    for 7s as b1 [ … ]   // beat 1
    for 7s as b2 [ … ]
    for 8s as b3 [ … ]
    …
    for 8s as b8 [ … ]   // beat 8
  }
}
```

7 + 7 + 8 + 8 + 8 + 8 + 8 + 8 = **62 s**, the timeline's duration, which the ProgressbarController reads. The
`each [ clearSpots() ]` prelude runs before every item, so no beat clears the previous spotlight itself.

### Beat 1 — "Name a sequence of operations" (0–7 s, `as b1`)

- **Narration:** "An action is a named list of operations. Define once, call anywhere."
- **Code** `#c2-code-def`:
  ```eligian
  action revealBlock(selector) [
    selectElement(selector)
    addClass("in")
    addClass("typing")
  ]
  ```
- **Spot / callout:** `#c2-tok-action`; `#c2-cl-action` "declares a reusable action; its body runs top-to-bottom".
- **Effect pane** `#c2-fx-chain`: three op chips `selectElement` `addClass` `addClass` (illustrative).
- **Self-demo note:** `revealBlock` is what just revealed this very block.

### Beat 2 — "Parameters & (optional) types" (7–14 s, `as b2`)

- **Narration:** "Actions take parameters. Annotate types when you want the compiler's help — or leave the type off."
- **Code** `#c2-code-params`:
  ```eligian
  action fadeIn(selector, duration: number) [
    selectElement(selector)
    animate({ opacity: 1 }, duration)
  ]
  ```
- **Spot / callout:** `#c2-tok-param`; `#c2-cl-param` "optional type — string · number · boolean · object · array; no annotation = unchecked".
- **Effect pane** `#c2-fx-fade`: the `fadeIn` box.
- **Note:** to opt out of checking, leave the type off. `unknown` is not an annotation:
  `action f(x: unknown) [ … ]` reports `Expected 'string', 'number', 'boolean', 'object' or 'array' here, but found 'unknown'.`

### Beat 3 — "Unified call syntax" (14–22 s, `as b3`)

- **Narration:** "Inside a block, calling your action looks exactly like calling a built-in operation."
- **Code** `#c2-code-call`:
  ```eligian
  at 0s..5s fadeIn("#hero", 400)                 // your action
  at 0s..5s target "#hero" [ addClass("on") ]   // built-in op, in a block
  ```
- **Spot / callout:** `#c2-tok-call`; `#c2-cl-call` "one syntax: action first, then built-in op; a bare operation is not a timeline event".
- **Effect pane** `#c2-fx-call`: chips `requestAction` `startAction` (an action call expands to both).
- **Note:** `at 0s..5s addClass("on")` is rejected: `Operation 'addClass' cannot be used directly in timeline events. Define an action that calls this operation, then call the action.`
  An event's action is an action call or a `[ … ]` block (where operations and actions are called alike).

### Beat 4 — "Parameters reach operations by name" (22–30 s, `as b4`)

- **Narration:** "Parameters flow into operations by name — and when the names differ, the compiler bridges them."
- **Code** `#c2-code-byname`:
  ```eligian
  action narrate(template) [ selectElement("#narration") setElementContent(template) ]   // same name: forwarded
  action say(text) [ selectElement("#narration") setElementContent(text) ]               // bridged by setOperationData
  ```
- **Spot / callout:** `#c2-tok-template`; `#c2-cl-name` "same name → passed straight through · other name → a setOperationData before the operation".
- **Effect pane** `#c2-fx-slot`: chips `template → setElementContent` and `text → setOperationData → template`.
- **Verified:** `narrate` compiles to `selectElement, setElementContent`; `say` to `selectElement`,
  `setOperationData { properties: { template: "$operationdata.text" } }`, `setElementContent` (spec 046). The
  library's `narrate` and `callout` keep the name `template` so they need no extra operation.

### Beat 5 — "endable actions: start *and* end" (30–38 s, `as b5`)

- **Narration:** "An endable action has two blocks: set up, then tear down — independently."
- **Code** `#c2-code-endable`:
  ```eligian
  endable action highlight(selector) [
    selectElement(selector)
    addClass("spot")
  ] [
    selectElement(selector)   // re-select: start and end are separate runs
    removeClass("spot")
  ]
  ```
- **Spot / callout:** `#c2-tok-endable`; `#c2-cl-endable` "start & end run separately — re-select in each, or use target".
- **Effect pane** `#c2-fx-toggle`: the `.spot` box.

### Beat 6 — dataflow contracts (38–46 s, `as b6`)

- **Narration:** "The compiler knows what each block carries. Call an action that needs a selected element where there is none, and it tells you."
- **Code** `#c2-code-contract`:
  ```eligian
  action highlight() [ addClass("on") ]   // needs selectedElement
  at 1s..2s highlight()                   // ✗ requires 'selectedElement'
  at 1s..2s target "#box" highlight()     // ✓
  ```
- **Spot / callout:** `#c2-tok-contract` (the failing call, with a `.squiggle`); `#c2-cl-contract` "an inferred contract — the hover says Requires from the caller".
- **Effect pane** `#c2-fx-contract`: a `.diagnostic` with the message `eligian check` prints for the snippet,
  verbatim (line 2 only; line 3 is clean):
  `Action 'highlight' requires 'selectedElement' (used by addClass in 'highlight'), which is not available here - ensure it is created before calling 'highlight' (for example with selectElement)`
  (code `missing-action-dependency`).

### Beat 7 — erased parameters (46–54 s, `as b7`)

- **Narration:** "selectElement consumes its selector. Your parameter survives anyway: the compiler saves and restores it."
- **Code** `#c2-code-erased`:
  ```eligian
  action twice(selector) [
    selectElement(selector)   // erases 'selector'…
    addClass("on")
    selectElement(selector)   // …but the parameter was kept
  ]
  twice("#hero")              // checked as a selector at the call: CSS ∪ layout
  ```
- **Spot / callout:** `#c2-tok-erased` (the first `selectElement`); `#c2-cl-erased` "saved as __eligian_param_selector around the operation; found by eligian smoke · a parameter that reaches a selector is checked at every call (spec 056)".
- **Effect pane** `#c2-fx-erased`: chips `selector →` `selectElement →` `(saved) →` `selector`.
- **Verified:** `twice` compiles to `setOperationData { __eligian_param_selector: "$operationdata.selector" }`,
  `selectElement`, `setOperationData { selector: "$operationdata.__eligian_param_selector" }`, `addClass`,
  `selectElement`. A call `twice("#heroo")` reports `Unknown CSS ID in selector: 'heroo'. Did you mean: hero?`.

### Beat 8 — libraries & composition (54–62 s, `as b8`)

- **Narration:** "Group actions into a library and import what you need — renamed if you like. Chapter 05 goes deeper. Hub."
- **Code** `#c2-code-lib` (a trimmed snippet, not the scrolled library file):
  ```eligian
  library presentation
  action revealBlock(selector) [ … ]       // public
  private action _helper() [ … ]      // library-only

  import { revealBlock, narrate as say } from "./presentation.eligian"
  ```
- **Spot / callout:** none.
- **Effect pane** `#c2-fx-lib`: "Chapter 2 ✓".
- **Note:** `narrate as say` imports the library's `narrate` under the local name `say`. Chapter 05 covers file
  kinds and every import form.

---

## 2. Acceptance

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass;
   `smoke` reports `timeline 'Actions': 9 positions ok` (eight sequence items plus the lifecycle action), and the
   compiled timeline's duration is 62 s.
2. The message in `#c2-fx-contract` equals the `eligian check` output for the contract snippet pasted into a
   scratch program.
3. Every displayed snippet passes `eligian check` in a scratch program (the `…` elisions filled in; `#hero`,
   `#box`, `#narration` in the scratch layout, `.on` in the scratch CSS), except the line marked ✗.
4. Every beat is driven by existing library actions (no new machinery).
5. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit.

## 3. Verification notes and resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave.
- **Effect-pane fidelity:** the panels are illustrative graphics revealed by `demo`; Beat 6's diagnostic text is
  verbatim tool output.
- **Alias import shown:** Beat 8's `import { revealBlock, narrate as say }` checks clean against the real
  `presentation.eligian`.
- **Timeline name / uri:** `"Actions"` (short, used by `navigate`). Hub card label: "Actions & Composition".

## 4. Files

```
examples/eligian-tour/
├── tour.eligian           # the "Actions" timeline (eight labelled sequence items)
├── presentation.eligian   # the library the chapter is built from (unchanged machinery)
├── layout.html            # #ch2: chrome, code blocks, effect panels, callout chips
└── tour.css               # anchors, fallback rows, the shared mock-UI .diagnostic / .squiggle
```
