# Storyboard — Chapter 3: Logic & Data

> Teaches: `const` variables (action-scoped `@name` vs program-level `$globaldata`), expressions &
> operators, `if` / `else`, `for` loops, `break` / `continue`, and the data sigils
> (`$operationdata` / `$globaldata` / `$scope`, `@@currentItem` / `@@loopIndex`).
> **Self-demonstration:** the chapter renders its own bullet list with a real `for` loop — the very
> construct Beat 4 explains drives what you see in the effect pane.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapters 1–2 (see `chapter-02-…md` §0, RESOLVED): a `#ch3` `.view`
inside `#stage` with its own chrome (`.chrome` + `.progress-rail` + `.chapter-label` + `#c3-to-hub`),
`.code-pane`, `.effect-pane`, `.callout-layer`. Structural panes are shared classes; DSL-selected leaf
elements are namespaced `#c3-…` and **must be registered in `tour.css`** (id-registration rule groups, since
class styling alone doesn't satisfy CSS validation's id-exists check). `#narration` is the shared subtitle.

**View management** = the self-managing endable setup action (see `ELIGIUS_EXECUTION_MODEL.md` §7b):
`timeline "Logic"`'s first event is `at 0s..3600s [ showView("#ch3") + showView("#narration") + wire
#c3-to-hub ] [ hideView("#ch3") + hideView("#narration") ]`. Hub card `#card-ch3` `navigate`s to `"Logic"`.

### Shared presentation actions

Reuses the existing library (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`,
`showView`, `hideView`). Beat 4 also needs a **real loop** writing into the effect pane — that introduces a
small chapter-local action (build detail in §4), which is itself dogfooding of this chapter's topic.

---

## 1. Segment beats

Each beat: **click to advance** (autoplay toggle runs them on the raf clock at the authored `at` times).
A beat = (narration swap) + (code reveal / spotlight) + (callout) + (effect tick). Times are raf positions.

### Beat 1 — "Name a value" / `const` (0s–7s)

- **Narration:** "`const` names a value. Inside an action it's a scope variable; at the top level it's global."
- **Code revealed** (`#c3-code-const`):
  ```eligian
  const theme = "dark"          // program-level → $globaldata.theme

  action greet(name) [
    const greeting = "hi"       // action-scoped → @greeting
    setElementContent(@greeting)
  ]
  ```
- **Callouts, click order:**
  1. top-level `const` → "program scope → read as `$globaldata.theme`"
  2. in-action `const` → "action scope → read as `@greeting` (= `$scope.variables.greeting`)"
- **Effect pane:** two labelled stores — `$globaldata` and `$scope.variables` — a chip drops into each.
- **Self-demo note:** "scope is just *where a name lives*; the rest of this chapter reads from these."

### Beat 2 — "Compute & compare" / expressions (7s–14s)

- **Narration:** "Expressions combine values: arithmetic, comparison, logic."
- **Code** (`#c3-code-expr`):
  ```eligian
  $operationdata.count + 1
  $operationdata.count >= 3 && @enabled
  !$globaldata.muted
  ```
- **Callouts:**
  1. arithmetic → "`+ - * / % **`"
  2. comparison → "`== != > < >= <=`"
  3. logical → "`&& || !`"
- **Effect pane:** a tiny expression evaluator: `2 + 1 → 3`, `3 >= 3 → true`, animating the result.

### Beat 3 — "Branch" / if-else (14s–23s)

- **Narration:** "`if` / `else` runs operations conditionally."
- **Code** (`#c3-code-if`):
  ```eligian
  if ($operationdata.count > 0) {
    selectElement("#badge")
    addClass("on")
  } else {
    selectElement("#badge")
    removeClass("on")
  }
  ```
- **Callouts, click order:**
  1. `if (…)` → "evaluate a boolean expression"
  2. `{ … }` / `else { … }` → "each branch is its own operation block"
  3. desugar chip → "compiles to `when` / `otherwise` / `endWhen`"
- **Effect pane (REAL-ish):** a `#badge` that turns its `on` class on/off as the condition flips true/false.

### Beat 4 — "Repeat" / for loops (23s–32s)  ⭐ self-demo

- **Narration:** "`for` iterates a collection — and this list is being revealed by one right now."
- **Code** (`#c3-code-for`):
  ```eligian
  const points = ["#c3-b1", "#c3-b2", "#c3-b3"]
  for (p in @points) {
    selectElement(@@currentItem)   // @@currentItem = the current selector
    addClass("in")                 // reveal this bullet
  }
  ```
- **Callouts, click order:**
  1. `for (p in @points)` → "iterate any collection expression"
  2. `@@currentItem` → "the current item (`$scope.currentItem`); `@@loopIndex` / `@@loopLength` too"
  3. desugar chip → "compiles to `forEach` / `endForEach`"
- **Effect pane (REAL):** three bullets pre-authored (hidden) in `#c3-fx-list` are revealed one-by-one
  **by an actual `for` loop** over a `const` array of their selectors. The list you read *is* the demo.
- **Why reveal-by-selector, not build-by-content (verified):** `selectElement` *resolves* its selector, so
  `selectElement(@@currentItem)` correctly selects each bullet. The content ops do **not** resolve sigils on
  their value — `setElementContent`/`createElement`-append of `@@currentItem` would emit the literal string
  `"$scope.currentItem"` (same contract as the param-by-name rule). So we loop over selectors and toggle a
  class, which keeps the demo genuine without hitting that pitfall.

### Beat 5 — "Steer the loop" / break & continue (32s–40s)

- **Narration:** "`break` exits the loop; `continue` skips to the next item — only inside a `for`."
- **Code** (`#c3-code-loopctl`):
  ```eligian
  for (n in @numbers) {
    if (@@currentItem == 0) { continue }   // skip zeros
    if (@@currentItem > 9) { break }       // stop past 9
    appendBullet(@@currentItem)
  }
  ```
- **Callouts:**
  1. `continue` → "skip to the next iteration → `continueForEach`"
  2. `break` → "exit the loop now → `breakForEach`"
  3. gotcha chip → "outside a `for`, these are a **compile error**"
- **Effect pane:** a row of number chips; zeros fade out (skipped), the run stops at the first >9.

### Beat 6 — "Where data lives" / sigils recap + reveal (40s–48s)

- **Narration:** "Three places data lives — and how operations read it."
- **Code** (`#c3-code-sigils`):
  ```eligian
  $operationdata.x      // this block's threaded data
  $globaldata.x         // program-wide store (top-level const)
  $scope.x              // loop/branch scope: @@currentItem, @var, @@loopIndex
  ```
- **Callouts:** spotlight each sigil; note resolution is **opt-in per operation** (an op resolves only the
  fields it cares about — there's no global pre-pass).
- **Meta moment:** the words learned this chapter (`const`, `if`, `for`, `break`, sigils) pulse in the code.
- **End card:** "Chapter 3 ✓ — next: Timeline Power Tools" + `← Hub`.

---

## 2. What this chapter must prove (acceptance)

1. The `timeline "Logic"` + any new blocks **compile clean** (`--check`, exit 0) within `tour.eligian`.
2. Hub card `#card-ch3` `navigate`s to "Logic" and `← Hub` returns (verified in-engine).
3. Beat 4's bullet list is built by a **genuine `for` loop** (real `forEach`/`endForEach` in the JSON) —
   not faked — proving the dogfood.
4. Motion stays restrained (150–250ms eases, transform/opacity only).

## 3. Resolved decisions

- **Advance mode:** click-to-advance + autoplay toggle (same as Chapters 1–2).
- **Effect-pane fidelity:** pragmatic mix — Beats 3/4 use *real* results (conditional class toggle; a real
  `for` loop building the list); Beats 1/2/5/6 (scopes, evaluator, loop-control, sigil map — abstract) use
  tasteful illustrative graphics.
- **Timeline name / uri:** `"Logic"` (short, slug-friendly for `navigate`). Hub card label: "Logic & Data".

## 4. Files this implies (when building)

```
examples/eligian-tour/
├── layout.html      # + #ch3 view: pre-tokenized Chapter-3 snippets, #c3-cl-* callouts, #c3-fx-* effects,
│                    #   and #c3-fx-list containing pre-authored hidden bullets #c3-b1/#c3-b2/#c3-b3
├── tour.css         # + Chapter-3 block/callout/effect/bullet styles + id-registration rules (validated)
├── presentation.eligian   # unchanged — Beat 4 reuses selectElement + addClass via the existing library
│                          #   (no append/content action needed; reveal-by-selector, see Beat 4)
└── tour.eligian     # + timeline "Logic" (setup action + 6 beats) + wire hub card #card-ch3 → navigate "Logic"
```

> Build question RESOLVED (the §1 Beat-4 check): no append operation is needed. The loop reveals
> pre-authored bullets via `selectElement(@@currentItem) + addClass("in")` over a `const` array of selectors
> — `selectElement` resolves the chain; content ops do not. Acceptance #3 still holds (genuine
> `forEach`/`endForEach` in the compiled JSON). Remember every `#c3-…` id selected by the .eligian (bullets,
> code blocks, callouts, fx, `#c3-to-hub`) must be registered in `tour.css`.
