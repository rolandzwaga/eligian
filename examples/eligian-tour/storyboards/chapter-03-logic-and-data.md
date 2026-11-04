# Storyboard — Chapter 3: Logic & Data

> Teaches: `const` and **constant folding** (a known value is inlined wherever you write `@name`; a runtime value
> becomes a scope variable), **literals**, operators and precedence (folded at compile time; on runtime values only
> in `if` conditions, plus **runtime string concatenation** and `calc`), `if` / **`else if`** / `else`, `for` loops,
> `break` / `continue`, the **`with`** statement, and the data sigils with their short forms (`$operationdata` /
> `$globaldata` / `$scope`, a bare parameter, `@const`, `@@p` / `@@loopIndex`).
> **Self-demonstration:** the chapter's effect pane is driven by the constructs it explains: a real
> `if / else if / else` sets the badge (Beat 4), a real `for` loop reveals the bullet list (Beat 5), a real loop
> with `continue` / `break` lights the number chips (Beat 6), and Beat 7's `with` is the `clearSpots` prelude that
> runs before every beat.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapter 1 (see `chapter-01-timeline-and-time.md` §0): `#ch3` is a
`section.view.chapter` inside `#stage` with its own `header.chrome` (back button `#c3-to-hub`, an 8-dot progress
rail with dot 3 current, the label `03 · Logic & Data`), `section.code-pane` of pre-tokenized `pre#c3-code-*.code`
blocks, `section.effect-pane` of `div#c3-fx-*.fx` panels and a `div.callout-layer` of `div#c3-cl-*.callout` chips.
The shared `#narration` and `#progress` sit outside the views.

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056).

**View management:** the chapter shows and hides its view only through its lifecycle blocks:
`on enter [ enterChapter("#ch3") … ]` shows the view and the narration and attaches the ProgressbarController to
`#progress-fill`; `on leave [ leaveChapter("#ch3", "#c3-to-hub") ]` hides them, resets the view (`resetChapter`:
removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it, so the badge, the bullets and the
lit chips start over) and removes every controller `on enter` attached (three KeyboardControllers on `#stage`, the
back button's listener, the ProgressbarController). Hub card `#card-ch3` (and key `3`) `navigate`s to `"Logic"`.

### Shared presentation actions

Reuses the library unchanged (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`, and the
chapter skeleton's `enterChapter`, `replayChapter`, `leaveChapter`; table in `chapter-01-timeline-and-time.md` §0).

### Chapter-local actions (top of `tour.eligian`)

House rule: `const` lives in actions (or at program level), not in timeline blocks, so the conditional and the
loops live in three helper actions whose bodies are the displayed snippets:

```eligian
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

Each branch of `ch3Badge` clears the other state, so the three calls leave the badge active, then muted, then plain.
`selectElement` comes before the `if`, so every branch has a `selectedElement` (no dataflow error).

---

## 1. Segment beats

The beats play on the raf clock; `space` pauses and resumes, `r` replays the chapter (`replayChapter`: reset the
view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap + code block + spotlight +
callout + effect panel. The chapter is one sequence of labelled items plus two sub-step events:

```eligian
timeline "Logic" in "#stage" using raf {
  on enter [
    enterChapter("#ch3")
    on click "#c3-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch3")
  ]
  on leave [ leaveChapter("#ch3", "#c3-to-hub") ]

  sequence each [ clearSpots() ] {
    for 8s as b1 [ … ]   // beat 1
    for 7s as b2 [ … ]
    for 9s as b3 [ … ]
    for 9s as b4 [ … ch3Badge(2) ]
    for 9s as b5 [ … ch3RevealBullets() ]
    for 8s as b6 [ … ch3LoopControl() ]
    for 7s as b7 [ … ]
    for 7s as b8 [ … ]   // beat 8
  }

  at b4.start + 4s for 1s [ ch3Badge(0) ]
  at b4.start + 6s for 1s [ ch3Badge(-1) ]
}
```

8 + 7 + 9 + 9 + 9 + 8 + 7 + 7 = **64 s**, the timeline's duration, which the ProgressbarController reads. The two
`at` events refer to `b4`, an earlier event, so they follow the sequence in the source.

### Beat 1 — `const`: folded or a scope variable (0–8 s, `as b1`)

- **Narration:** "const names a value. Known at compile time it is inlined wherever you write @name; a runtime value becomes a scope variable."
- **Code** `#c3-code-const`:
  ```eligian
  const theme = "dark"            // inlined: @theme → "dark"
  const beat = 7s                 // a time constant (program level only)
  action greet(label) [
    const greeting = "hi"         // inlined too
    const copy = label            // runtime → setVariable; read as $scope.variables.copy
    selectElement("#greeting")
    setElementContent(@greeting)
  ]
  ```
- **Spot / callout:** `#c3-tok-const`; `#c3-cl-const` "@name reads a const · literal → folded in · runtime value → scope variable".
- **Effect pane** `#c3-fx-scopes`: chips `"dark" (inlined)` and `$scope.variables.copy`.
- **Verified:** the compiled config has `"initActions": []` (program-level literal constants are filtered out),
  `greet` compiles to `setOperationData { properties: { value: "$operationdata.label" } }`,
  `setVariable { name: "copy" }`, `selectElement`, `setElementContent { template: "hi" }`. A const is read as
  `@greeting`; a bare `greeting` is a parameter reference and fails with
  `Could not resolve reference to Parameter named 'greeting'.`

### Beat 2 — literals (8–15 s, `as b2`)

- **Narration:** "Values are literals: strings in either quote, numbers, booleans, null, objects and arrays."
- **Code** `#c3-code-literals`:
  ```eligian
  "text"  'text'  42  3.14  true  false  null
  { opacity: 1, from: 0 }        // keys may be any word, even keywords
  ["#c3-b1", "#c3-b2", "#c3-b3"]
  ```
- **Spot / callout:** `#c3-tok-literal` (the object); `#c3-cl-literal` "no negative literals: -2 is unary minus applied to 2".
- **Effect pane** `#c3-fx-literals`: chips `string` `number` `boolean` `null` `object` `array`.
- **Grammar:** `Literal: StringLiteral | TimeValue | NumberLiteral | BooleanLiteral | NullLiteral`, plus
  `ObjectLiteral` (keys are `FeatureName | STRING`) and `ArrayLiteral`; `NUMBER` is `/[0-9]+(\.[0-9]+)?/`, so `-2`
  is the unary `-` applied to `2` (a constant, folded: `ch3Badge(-1)` passes `count: -1`).

### Beat 3 — operators (15–24 s, `as b3`)

- **Narration:** "Operators fold at compile time. On runtime values they belong in if conditions — except string +, which joins at runtime."
- **Code** `#c3-code-expr`:
  ```eligian
  const total = 2 ** 3 * 2 + 1       // 17, folded; ** binds tightest
  if (count >= 3 && enabled) { … }  // comparisons & logic on runtime values: in if
  selectElement("#" + slideId)      // runtime string concatenation
  calc(count, 1, "+")                // runtime arithmetic is an operation
  ```
- **Spot / callout:** `#c3-tok-expr` (on `**`); `#c3-cl-expr` "** · unary - ! · * / % · + - · < <= > >= · == != · && · ||" (precedence, tightest first).
- **Effect pane** `#c3-fx-eval`: chips `2 ** 3 * 2 + 1 → 17` and `"#" + "hero" → "#hero"`.
- **Verified:** `@total` compiles to `17`; the `if` to `when { expression: "$operationdata.count >= 3 && $operationdata.enabled" }`;
  `"#" + slideId` to `setOperationData { strings: ["#", "$operationdata.slideId"] }`, `concatenateStrings`,
  `selectElement { selector: "$operationdata.result" }`; `calc` to `{ left: "$operationdata.count", right: 1, operator: "+" }`.
  `calc`'s signature help reads `calc(left: number, right: number, operator: "+" | "-" | "*" | "/" | "%" | "**")`
  (`calc(count, "+", 1)` reports `Parameter 'right' expects type 'ParameterType:number' but got 'string'. Provide a ParameterType:number value for parameter 'right'`).
  Outside an `if`, `setElementContent(count + 1)` reports
  `Arithmetic operator '+' cannot be applied to runtime values (parameters, variables, system properties, property chains): Eligius has no runtime arithmetic in expressions. Use the calc operation instead (its result is $operationdata.calculationResult). For string concatenation, make one operand a string: a string literal or a parameter annotated ': string'`
  and `setElementContent(count >= 3 && enabled)` reports
  `Operator '>=' on runtime values (parameters, variables, system properties, property chains) is only supported inside if/when conditions`
  (both `runtime_operator_operand`).

### Beat 4 — `if` / `else if` / `else` (24–33 s, `as b4`) — REAL

- **Narration:** "if / else if / else runs operations conditionally — when, otherwise, endWhen, nested."
- **Code** `#c3-code-if` (= `ch3Badge`'s body):
  ```eligian
  selectElement("#c3-badge")
  if (count > 0) {
    removeClass("muted") addClass("active")
  } else if (count == 0) {
    removeClass("active") addClass("muted")
  } else {
    removeClass("active") removeClass("muted")
  }
  ```
- **Spot / callout:** `#c3-tok-if` (on `else if`); `#c3-cl-if` "else if = else { if … }: a when nested in the otherwise".
- **Effect pane** `#c3-fx-if` > `#c3-badge`.
- **Real code:** `ch3Badge(2)` at the beat (24 s: active, full opacity), `at b4.start + 4s for 1s [ ch3Badge(0) ]`
  (28 s: muted, dimmer and grey) and `at b4.start + 6s for 1s [ ch3Badge(-1) ]` (30 s: plain). `ch3Badge` compiles to
  `selectElement`, `when`, …, `otherwise`, `when`, …, `otherwise`, …, `endWhen`, `endWhen`. The id rule
  `#c3-badge { opacity: 0.35 }` beats the one-class `.active` / `.muted`, so tour.css declares `#c3-badge.active`
  and `#c3-badge.muted` itself.

### Beat 5 — `for` (33–42 s, `as b5`) ⭐ self-demo

- **Narration:** "for iterates a collection — and this list is being revealed by one right now."
- **Code** `#c3-code-for`:
  ```eligian
  const points = ["#c3-b1", "#c3-b2", "#c3-b3"]
  for (p in @points) {        // forEach / endForEach
    selectElement(@@p)        // the item; @@loopIndex, @@loopLength too
    addClass("in")
  }
  ```
- **Spot / callout:** `#c3-tok-for`; `#c3-cl-for` "@@p is the loop item (= @@currentItem); @@loopIndex / @@loopLength count".
- **Effect pane** `#c3-fx-list`: three pre-authored, hidden bullets `#c3-b1` … `#c3-b3`.
- **Real code:** `ch3RevealBullets()`, compiled to `forEach { collection: ["#c3-b1", "#c3-b2", "#c3-b3"], itemName: "p" }`,
  `selectElement { selector: "$scope.currentItem" }`, `addClass`, `endForEach`. The list you read *is* the demo.
- **Why reveal-by-selector:** a style choice, not a workaround. `setElementContent(@@p)` would work too: runtime
  values in operation arguments are materialized by `setOperationData` (spec 046). Revealing pre-authored bullets
  keeps their text in `layout.html` and the transition in `tour.css`.

### Beat 6 — `break` / `continue` (42–50 s, `as b6`) — REAL

- **Narration:** "continue skips an item, break leaves the loop — only inside a for. Watch 0 skipped and the run stop at 12."
- **Code** `#c3-code-loopctl` (= `ch3LoopControl`'s body):
  ```eligian
  const numbers = [0, 3, 7, 12]
  for (n in @numbers) {
    if (@@n == 0) { continue }                   // continueForEach
    if (@@n > 9) { break }                       // breakForEach
    with "#c3-n-" + @@n { addClass("lit") }      // runtime concat: "#c3-n-3", "#c3-n-7"
  }
  ```
- **Spot / callout:** `#c3-tok-break`; `#c3-cl-loopctl` "continue → continueForEach · break → breakForEach · outside a for: compile error".
- **Effect pane** `#c3-fx-loopctl`: chips `span#c3-n-0`, `#c3-n-3`, `#c3-n-7`, `#c3-n-12`; `.lit` = highlighted.
- **Real code:** `ch3LoopControl()`: chips 3 and 7 light, 0 is skipped, the loop stops at 12. It compiles to
  `forEach`, `when` / `continueForEach` / `endWhen`, `when` / `breakForEach` / `endWhen`,
  `setOperationData { strings: ["#c3-n-", "$scope.currentItem"] }`, `concatenateStrings`,
  `selectElement { selector: "$operationdata.result" }`, `addClass`, `endForEach`. A `break` outside a loop reports
  `'break' can only be used inside a loop`.

### Beat 7 — `with` (50–57 s, `as b7`) — REAL

- **Narration:** "with selects an element for a block, in any action or event — this tour's clearSpots is two with blocks."
- **Code** `#c3-code-with`:
  ```eligian
  with ".tok" { removeClass("spot") }      // selectElement(".tok"), then the block
  with "#" + id { addClass("lit") }        // any expression; the selection stays
  ```
- **Spot / callout:** `#c3-tok-with`; `#c3-cl-with` "the selection stays after the block — there is nothing to restore".
- **Effect pane** `#c3-fx-with`: chips `selectElement(".tok") →` `removeClass("spot")`.
- **Real code:** the sequence's `each [ clearSpots() ]` prelude, which ran just before this beat:
  `clearSpots` is `with ".tok" { removeClass("spot") }` and `with ".callout" { removeClass("show") }`; the library's
  `resetChapter` is six `with view + " .<class>" { … }` blocks. `with "#" + id` compiles to the same
  `setOperationData` / `concatenateStrings` / `selectElement` as Beat 6.

### Beat 8 — where data lives: the sigils (57–64 s, `as b8`)

- **Narration:** "Where data lives: $operationdata, $globaldata, $scope — and the short forms you have been reading. Hub."
- **Code** `#c3-code-sigils`:
  ```eligian
  $operationdata.x   // this block's data
  $globaldata.x      // program-wide
  $scope.x           // loop / branch scope
  selector           // a parameter → $operationdata.selector
  @beat              // a const
  @@p  @@loopIndex   // loop scope → $scope.…
  ```
- **Spot / callout:** `#c3-tok-sigil`; no callout.
- **Effect pane** `#c3-fx-sigils`: "Chapter 3 ✓".

---

## 2. Acceptance

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass;
   `smoke` reports `timeline 'Logic': 13 positions ok` (every distinct start and end: the eight beat
   boundaries 0–57 s, the end at 64 s, and 28, 29, 30, 31 s of the two badge sub-steps), and the compiled timeline's duration is 64 s.
2. Every displayed snippet passes `eligian check` in a scratch program (the `…` elisions filled in; `#greeting`,
   `#hero`, `#c3-badge`, `#c3-b1`–`#c3-b3`, `#c3-n-*` in the scratch layout; `.in`, `.active`, `.muted`, `.lit`,
   `.tok`, `.spot` in the scratch CSS). The literals of Beat 2 and the sigils of Beat 8 are checked one by one in
   positions where they are valid (as const values and operation arguments).
3. Beats 4–7 are driven by genuine `when` / `forEach` / `continueForEach` / `breakForEach` / `concatenateStrings`
   operations in the compiled JSON, not faked.
4. In the browser at 42–50 s chips 3 and 7 light and 0 and 12 do not; at 24–33 s the badge goes active (full) →
   muted (dim, grey) → plain.
5. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit.

## 3. Verification notes and resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave.
- **Effect-pane fidelity:** Beats 4–7 are real (the badge, the bullet list, the number chips, the prelude);
  Beats 1–3 and 8 are illustrative panels revealed by `demo`.
- **`const` placement:** the house rule keeps `const` in actions or at program level. A `const` inside an inline
  timeline block compiles today; the tour does not rely on it.
- **`calc` argument order** confirmed with signature help: `left, right, operator`.
- **Timeline name / uri:** `"Logic"` (short, used by `navigate`). Hub card label: "Logic & Data".

## 4. Files

```
examples/eligian-tour/
├── tour.eligian    # ch3Badge, ch3RevealBullets, ch3LoopControl; the "Logic" timeline (eight labelled items + two sub-steps)
├── layout.html     # #ch3: chrome, code blocks, effect panels (badge, bullets #c3-b1–3, chips #c3-n-0/3/7/12), callout chips
└── tour.css        # anchors, fallback rows, .bullet, #c3-badge / #c3-badge.active / #c3-badge.muted
```

No build question remains: there is no id registration (ids come from `layout.html`), and the loops and the
conditional live in helper actions because `const` stays in actions by house rule.
