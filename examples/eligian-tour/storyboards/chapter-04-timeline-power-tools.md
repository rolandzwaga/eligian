# Storyboard — Chapter 4: Timeline Power Tools

> Teaches: `sequence` blocks (auto-calculated consecutive timing) and `stagger` blocks
> (one event per item with incrementally delayed starts), plus when to reach for each.
> **Self-demonstration:** the chapter reveals its own row of cards with a real `stagger`
> block — the very construct Beat 4 explains drives what you see in the effect pane.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapters 1–3 (see `chapter-03-…md` §0): a `#ch4` `.view`
inside `#stage` with its own chrome (`.chrome` + `.progress-rail` + `.chapter-label` + `#c4-to-hub`),
`.code-pane`, `.effect-pane`, `.callout-layer`. Structural panes are shared classes; DSL-selected leaf
elements are namespaced `#c4-…` and **must be registered in `tour.css`** (id-registration rule groups —
class styling alone doesn't satisfy CSS validation's id-exists check). `#narration` is the shared subtitle.

**View management** = the self-managing endable setup action (see `ELIGIUS_EXECUTION_MODEL.md` §7b):
`timeline "Timeline Power Tools"`'s first event is `at 0s..3600s [ showView("#ch4") + showView("#narration")
+ wire #c4-to-hub ] [ hideView("#ch4") + hideView("#narration") ]`. Hub card `#card-ch4` `navigate`s to
`"Timeline Power Tools"`.

### Shared presentation actions

Reuses the existing library (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`,
`showView`, `hideView`). Beat 4 adds one small chapter-local **endable** action, `revealCard(selector)`,
that the real `stagger` block calls per item — itself dogfooding this chapter's topic (build detail in §4).

---

## 1. Segment beats

Each beat: **click to advance** (autoplay toggle runs them on the raf clock at the authored `at` times).
A beat = (narration swap) + (code reveal / spotlight) + (callout) + (effect tick). Times are raf positions.

### Beat 1 — "Timing by hand is brittle" (0s–7s)

- **Narration:** "Scheduling a chain of events by hand means recomputing every time you tweak one. Two
  timeline power tools do the arithmetic for you."
- **Code revealed** (`#c4-code-manual`): the tedious way, for contrast —
  ```eligian
  at 0s..5s   { intro() }
  at 5s..15s  { main() }     // had to add 5 + 10 by hand
  at 15s..18s { outro() }    // …and 15 + 3
  ```
- **Callout:** spotlight the hand-computed boundaries → "change `main`'s length and you re-do all of these."
- **Effect pane:** three blocks laid end-to-end on a ruler; nudging the middle one leaves a visible gap/overlap.

### Beat 2 — "sequence" / auto consecutive timing (7s–15s)

- **Narration:** "`sequence` lays events back-to-back automatically — each runs `for` a duration, the next
  starts where the last ended."
- **Code** (`#c4-code-sequence`):
  ```eligian
  sequence {
    intro() for 5s
    main()  for 10s
    outro() for 3s
  }
  ```
- **Callouts, click order:**
  1. `sequence { … }` → "events run in order, no explicit times"
  2. `for 5s` → "each item declares only its **duration**"
  3. desugar chip → "compiles to `at 0s..5s` · `at 5s..15s` · `at 15s..18s` (start = previous end)"
- **Effect pane (illustrative):** the three ruler blocks snap flush against each other as the `for` values
  are read; a caption shows the running cumulative time.

### Beat 3 — "Edit one, the rest follow" (15s–22s)

- **Narration:** "Because starts are computed, changing one duration shifts everything after it — no manual
  re-numbering."
- **Code** (reuse `#c4-code-sequence`, highlight the edit): `main() for 10s` → `main() for 6s`.
- **Callouts:**
  1. the changed `for` → "edit just this"
  2. desugar chip updates → "`outro` now `at 11s..14s` automatically"
- **Effect pane (illustrative):** bump `main`'s block shorter; `outro` slides left to stay flush — the whole
  chain stays gap-free.
- **Meta note (optional, build-time call):** the chapter's own beats *could* be authored as a `sequence`;
  noted in §3 as a stretch, not required for acceptance.

### Beat 4 — "stagger" / one event per item ⭐ self-demo (22s–31s)

- **Narration:** "`stagger` fans an animation across a collection — same effect on each item, each starting a
  little after the last. This card row is being revealed by one right now."
- **Code** (`#c4-code-stagger`):
  ```eligian
  stagger 200ms ["#c4-card-1", "#c4-card-2", "#c4-card-3"] with revealCard() for 1.5s
  ```
- **Callouts, click order:**
  1. `200ms` → "the **delay** — how much later each item starts"
  2. `[ … ]` → "the collection — one timeline event is generated per item"
  3. `with revealCard()` → "the action applied to each; the item is passed as its first argument"
  4. `for 1.5s` → "the **duration** each item's event lasts"
  5. desugar chip → "`#c4-card-1` `at 0s..1.5s` · `#c4-card-2` `at 0.2s..1.7s` · `#c4-card-3` `at 0.4s..1.9s`"
- **Effect pane (REAL):** three cards pre-authored (hidden) in `#c4-fx-row` are revealed one-by-one **by an
  actual `stagger` block** calling `revealCard(selector)` per card. The row you watch *is* the demo.
- **Why this is genuine (verified):** the action-call form threads each item as the action's **first
  parameter**, so `revealCard(selector)` receives `"#c4-card-1"` etc.; `selectElement` resolves that selector
  (same contract used in Chapter 3's loop reveal). No sigil-on-value pitfall.

### Beat 5 — "delay vs duration + the inline form" (31s–39s)

- **Narration:** "Two numbers, two jobs: **delay** is the gap between starts, **duration** is how long each
  lasts — they overlap on purpose. You can also inline the operations instead of naming an action."
- **Code** (`#c4-code-stagger-inline`):
  ```eligian
  stagger 100ms items for 1s [
    addClass("active")
  ] [
    removeClass("active")
  ]
  ```
- **Callouts:**
  1. delay vs duration → "small delay + longer duration = overlapping, cascading motion"
  2. `[ … ] [ … ]` → "inline start / end operation blocks instead of `with <action>`"
- **Effect pane (illustrative):** a delay/duration diagram — overlapping bars showing the cascade; tweaking
  delay tightens/loosens the wave.
- **⚠ Build/verify note (potential dogfooding find):** the inline form maps `@@item`→`$scope.currentItem`,
  but the transformer doesn't appear to inject the per-item value into runtime data (no `forEach` wraps these
  separately-generated timeline actions). Verify in-engine whether `@@item`/`$scope.currentItem` resolves for
  the inline form; if it doesn't, this is a real bug to report+fix (and Beat 5 stays *illustrative*, with the
  REAL demo remaining Beat 4's action-call form, which is confirmed to thread the item).

### Beat 6 — "Which tool?" recap + end card (39s–47s)

- **Narration:** "`sequence` for a chain of distinct, back-to-back steps; `stagger` for the same effect across
  many items. Both compute the timing so you don't."
- **Code** (`#c4-code-recap`): the two headers side by side —
  ```eligian
  sequence { a() for 5s  b() for 10s }                       // consecutive, distinct steps
  stagger 200ms items with fadeIn() for 1.5s                 // one effect, many items, cascading
  ```
- **Callouts:** spotlight each → "distinct steps in order" vs "one effect fanned across a collection".
- **Meta moment:** the words learned this chapter (`sequence`, `for`, `stagger`, delay, duration) pulse.
- **End card:** "Chapter 4 ✓ — next: Engine Reach" + `← Hub`.

---

## 2. What this chapter must prove (acceptance)

1. The `timeline "Timeline Power Tools"` + the `sequence`/`stagger` blocks **compile clean**
   (`--check`, exit 0) within `tour.eligian`.
2. Hub card `#card-ch4` `navigate`s to "Timeline Power Tools" and `← Hub` returns (verified in-engine).
3. Beat 4's card row is revealed by a **genuine `stagger` block** (real per-item timeline actions in the
   compiled JSON, with incrementally delayed `duration.start`s) — not faked — proving the dogfood.
4. Motion stays restrained (150–250ms eases, transform/opacity only).

## 3. Resolved decisions

- **Advance mode:** click-to-advance + autoplay toggle (same as Chapters 1–3).
- **Effect-pane fidelity:** pragmatic mix — Beat 4 uses a *real* `stagger` reveal; Beats 1/2/3/5/6 (rulers,
  cumulative-time captions, delay/duration diagram, recap — abstract) use tasteful illustrative graphics.
- **Timeline name / uri:** `"Timeline Power Tools"` (the string name is the `navigate` uri). Hub card label:
  "Timeline Power Tools".
- **Self-demo construct:** `stagger` (Beat 4), mirroring Chapter 3's real-`for` reveal. Authoring the whole
  chapter's beats as a `sequence` is a **stretch goal**, not required for acceptance (the beats need precise
  per-beat callout control that the explicit `at` form already gives).

## 4. Files this implies (when building)

```
examples/eligian-tour/
├── layout.html      # + #ch4 view: pre-tokenized Chapter-4 snippets, #c4-cl-* callouts, #c4-fx-* effects,
│                    #   and #c4-fx-row containing pre-authored hidden cards #c4-card-1/2/3
├── tour.css         # + Chapter-4 block/callout/effect/card styles + id-registration rules (validated)
├── presentation.eligian   # + endable `revealCard(selector)` [ selectElement(selector) addClass("in") ] []
│                          #   (first param is the staggered item; selectElement resolves it)
└── tour.eligian     # + timeline "Timeline Power Tools" (setup action + 6 beats; Beat 4 fires a real
                     #   `stagger 200ms ["#c4-card-1","#c4-card-2","#c4-card-3"] with revealCard() for 1.5s`)
                     #   + wire hub card #card-ch4 → navigate "Timeline Power Tools"
```

> Build note: every `#c4-…` id selected by the .eligian (cards, code blocks, callouts, fx, `#c4-to-hub`) must
> be registered in `tour.css`. Beat 5's inline-stagger item threading must be verified in-engine before it's
> presented as anything more than illustrative (see Beat 5 ⚠).
