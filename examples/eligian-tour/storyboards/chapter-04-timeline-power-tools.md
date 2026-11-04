# Storyboard — Chapter 4: Timeline Power Tools

> Teaches: `sequence` blocks (auto-calculated consecutive timing), **sequence items** (an action call or an inline
> block, labelled with `as`, plus the `each [ … ]` prelude and the `then [ … ]` postlude), `stagger` blocks (one event
> per item with incrementally delayed starts) in the action form and the **inline form with an end block**, the
> stagger **anchor** `at <time>`, and when to reach for which.
> **Self-demonstration:** the chapter is written with what it teaches. Its seven beats are one `sequence` of labelled
> inline items whose `each` clears the spotlights and whose `then` flips the `#c4-pulse` dot in the chrome at every
> beat boundary; a real `stagger` anchored at `editBeat.end` reveals the card row (Beat 4), and a real inline
> `stagger` anchored at `waveBeat.start + 1s` lights the wave chips and its end block unlights them (Beat 6).

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapter 1 (see `chapter-01-timeline-and-time.md` §0): `#ch4` is a
`section.view.chapter` inside `#stage` with its own `header.chrome` (back button `#c4-to-hub`, the status dot
`span#c4-pulse.pulse-dot`, an 8-dot progress rail with dot 4 current, the label `04 · Timeline Power Tools`),
`section.code-pane` of pre-tokenized `pre#c4-code-*.code` blocks, `section.effect-pane` of `div#c4-fx-*.fx` panels and
a `div.callout-layer` of `div#c4-cl-*.callout` chips. The shared `#narration` and `#progress` sit outside the views.

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056).

**View management:** the chapter shows and hides its view only through its lifecycle blocks:
`on enter [ enterChapter("#ch4") … ]` shows the view and the narration and attaches the ProgressbarController to
`#progress-fill`; `on leave [ leaveChapter("#ch4", "#c4-to-hub") ]` hides them, resets the view (`resetChapter`:
removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it, so the cards, the wave chips and
`#c4-pulse` start over) and removes every controller `on enter` attached (three KeyboardControllers on `#stage`, the
back button's listener, the ProgressbarController). Hub card `#card-ch4` (and key `4`) `navigate`s to
`"Timeline Power Tools"`.

### Shared presentation actions

Reuses the library unchanged (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`, `revealCard`,
and the chapter skeleton's `enterChapter`, `replayChapter`, `leaveChapter`; table in
`chapter-01-timeline-and-time.md` §0). `revealCard(selector)` is a regular (not endable) library action,
`selectElement(selector) addClass("in")`; the first stagger calls it once per card. The chapter has no local actions:
both staggers and the `each` / `then` blocks are written in the timeline itself.

---

## 1. Segment beats

The beats play on the raf clock; `space` pauses and resumes, `r` replays the chapter (`replayChapter`: reset the
view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap + code block + spotlight +
callout + effect panel. The chapter is one sequence of labelled items plus two staggers:

```eligian
timeline "Timeline Power Tools" in "#stage" using raf {
  on enter [
    enterChapter("#ch4")
    on click "#c4-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch4")
  ]
  on leave [ leaveChapter("#ch4", "#c4-to-hub") ]

  sequence each [ clearSpots() ] then [ with "#c4-pulse" { toggleClass("lit") } ] {
    for 7s as b1 [ … ]         // beat 1
    for 8s as b2 [ … ]
    for 7s as editBeat [ … ]
    for 9s as b4 [ … ]
    for 9s as b5 [ … ]
    for 9s as waveBeat [ … ]
    for 8s as b7 [ … ]         // beat 7
  }

  // REAL stagger 1 (beat 4): cards reveal from editBeat.end = 22 s
  stagger 200ms ["#c4-card-1", "#c4-card-2", "#c4-card-3"] at editBeat.end with revealCard() for 1.5s

  // REAL stagger 2 (beat 6): the inline form with an end block, anchored on the beat
  stagger 150ms ["#c4-wave-1", "#c4-wave-2", "#c4-wave-3"] at waveBeat.start + 1s for 2s [
    selectElement(@@item)
    addClass("lit")
  ] [
    selectElement(@@item)
    removeClass("lit")
  ]
}
```

7 + 8 + 7 + 9 + 9 + 9 + 8 = **57 s**, the timeline's duration, which the ProgressbarController reads. The staggers
refer to `editBeat` and `waveBeat`, earlier events, so they follow the sequence in the source. The beat boundaries,
where `then` flips `#c4-pulse`, are 7, 15, 22, 31, 40, 49 and 57 s.

### Beat 1 — timing by hand is brittle (0–7 s, `as b1`)

- **Narration:** "Scheduling a chain of events by hand means recomputing every time you tweak one."
- **Code** `#c4-code-manual`:
  ```eligian
  at 0s..5s   intro()
  at 5s..15s  main()     // 5 + 10, by hand
  at 15s..18s outro()    // …and 15 + 3
  ```
- **Callout:** `#c4-cl-manual` (block chip on the code block) "change one length and every later time is re-done by hand".
- **Effect pane** `#c4-fx-ruler`: chips `intro` `main` `outro`.
- **Grammar:** a timed event's action is `InlineEndableAction | OperationCall | ForStatement | IfStatement`, so the
  call stands on its own. The old snippet's braces (`at 0s..5s   { intro() }`) report
  `Expected an action or operation call, or a [ … ] block here, but found '{'.` (parsing-error).

### Beat 2 — `sequence`: auto consecutive timing (7–15 s, `as b2`)

- **Narration:** "'sequence' lays events back-to-back automatically — each runs 'for' a duration."
- **Code** `#c4-code-sequence`:
  ```eligian
  sequence {
    intro() for 5s
    main()  for 10s
    outro() for 3s
  }
  ```
- **Spot / callout:** `#c4-tok-seq`; `#c4-cl-seq` "start = previous end → 0s..5s · 5s..15s · 15s..18s".
- **Effect pane** `#c4-fx-seq`: chips `0–5` `5–15` `15–18`.

### Beat 3 — edit one, the rest follow (15–22 s, `as editBeat`)

- **Narration:** "Because starts are computed, changing one duration shifts everything after it."
- **Code:** re-uses `#c4-code-sequence` (no new block).
- **Callout:** `#c4-cl-edit` (block chip on `#c4-code-sequence`) "shorten 'main' and 'outro' slides left — no re-numbering".
- **Effect pane** `#c4-fx-seq` again.
- The item is labelled `editBeat`: the first stagger starts at `editBeat.end` (22 s).

### Beat 4 — `stagger`: one event per item (22–31 s, `as b4`) ⭐ self-demo

- **Narration:** "'stagger' fans one effect across a collection — each item starts a little after the last."
- **Code** `#c4-code-stagger`:
  ```eligian
  stagger 200ms ["#a", "#b", "#c"] at editBeat.end with revealCard() for 1.5s
  ```
- **Spot / callout:** `#c4-tok-stagger`; `#c4-cl-stagger` "200ms between starts · the item is the action's first
  argument · at editBeat.end anchors the first item".
- **Effect pane** `#c4-fx-row`: three pre-authored, hidden cards `#c4-card-1` … `#c4-card-3` (`li.bullet`).
- **Real code:** stagger 1 (above). It compiles to three timeline actions, `stagger-revealCard-0-22-23.5`,
  `stagger-revealCard-1-22.2-23.7` and `stagger-revealCard-2-22.4-23.9`, each `requestAction { systemName: "revealCard" }`
  + `startAction { actionOperationData: { selector: "#c4-card-N" } }`: the item is the action's first argument. The
  row you watch *is* the demo.

### Beat 5 — sequence items: inline blocks, labels, `each` / `then` (31–40 s, `as b5`) — REAL

- **Narration:** "A sequence item can be an inline block, labelled with as; each runs before every item, then after
  it. each clears the spotlights; then flips this dot at the end of every beat."
- **Code** `#c4-code-items`:
  ```eligian
  sequence each [ clearSpots() ] then [ with "#c4-pulse" { toggleClass("lit") } ] {
    for 7s as editBeat [ narrate("…") revealBlock("#c4-code-sequence") ]   // inline, labelled
    revealCard("#c4-card-1") for 2s
  }
  ```
- **Spot / callout:** `#c4-tok-each` (on `each`); `#c4-cl-items` "each → before every item's start ops · then → after
  every item's end ops, in the same instant as the next each · editBeat.end usable later".
- **Effect pane** `#c4-fx-items`: chips `each` `item` `then`; the `then` chip holds a dot that mirrors `#c4-pulse`
  (CSS `#ch4:has(#c4-pulse.lit) #c4-fx-items .pulse-dot`), so it is lit whenever the chrome dot is.
- **Real code:** the chapter's own `sequence each [ clearSpots() ] then [ with "#c4-pulse" { toggleClass("lit") } ]`.
  Every compiled `sequence-item-*` action starts with `requestAction { systemName: "clearSpots" }` + `startAction` and
  its end operations are `selectElement { selector: "#c4-pulse" }`, `toggleClass { className: "lit" }`, even though
  the items have no end blocks.

### Beat 6 — the inline stagger, anchored (40–49 s, `as waveBeat`) ⭐ self-demo

- **Narration:** "The inline stagger form has its own start and end blocks, and at anchors the first item on a time
  instead of the previous event. Watch the wave."
- **Code** `#c4-code-inline`:
  ```eligian
  stagger 150ms ["#c4-wave-1", "#c4-wave-2", "#c4-wave-3"] at waveBeat.start + 1s for 2s [
    selectElement(@@item)
    addClass("lit")
  ] [
    selectElement(@@item)
    removeClass("lit")
  ]
  ```
- **Spot / callout:** `#c4-tok-anchor` (on `at`); `#c4-cl-inline` (a token chip now, no longer a block chip) "every
  block starts empty: selectElement(@@item) first · at +2s would count from the previous event".
- **Effect pane** `#c4-fx-cascade`: chips `span#c4-wave-1` … `#c4-wave-3` (`wave 1 · 41s`, `wave 2 · 41.15s`,
  `wave 3 · 41.3s`), dim at rest and lit (`#c4-fx-cascade .fx-chip.lit`) while their event runs.
- **Real code:** stagger 2 (above). It compiles to `stagger-inline-0-41-43`, `stagger-inline-1-41.15-43.15` and
  `stagger-inline-2-41.3-43.3`; the item is substituted per event (`selectElement { selector: "#c4-wave-1" }`,
  `addClass { className: "lit" }`, end: `selectElement { selector: "#c4-wave-1" }`, `removeClass`). The chips light
  41–43.3 s and go out.

### Beat 7 — which tool? recap (49–57 s, `as b7`)

- **Narration:** "sequence for distinct back-to-back steps; stagger for one effect across many items. Hub."
- **Code** `#c4-code-recap`:
  ```eligian
  const cards = ["#a", "#b", "#c"]             // program level, before the timeline
  sequence { a() for 5s  b() for 10s }         // distinct steps, in order
  stagger 200ms @cards with fadeIn() for 1.5s  // one effect, many items
  ```
- **Spot / callout:** `#c4-tok-recap` (on `sequence`); no callout.
- **Effect pane** `#c4-fx-done`: "Chapter 4 ✓".
- The `const` line comes first: a `const` is a program element, not a timeline event (in a timeline body it reports
  `Expected an event (at, sequence, stagger), on enter / on leave, or '}' here, but found 'const'.`). `fadeIn` is a
  user action here (there is no `fadeIn` operation).

---

## 2. Acceptance

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass;
   `smoke` reports `timeline 'Timeline Power Tools': 19 positions ok` (every distinct start and end: the eight beat
   boundaries 0–57 s, the cards at 22.2, 22.4, 23.5, 23.7, 23.9 s, the wave at 41, 41.15, 41.3, 43, 43.15, 43.3 s),
   and the compiled timeline's duration is 57 s.
2. Every displayed snippet passes `eligian check` and `eligian smoke` in a scratch program, copied verbatim from
   `layout.html` (the generic ones with `#a` / `#b` / `#c` and `intro` / `main` / `outro` / `a` / `b` / `fadeIn`
   actions in a scratch layout; `#c4-code-items` and `#c4-code-inline` against copies of the tour's `layout.html`,
   `tour.css` and `presentation.eligian`, with an earlier item labelled `waveBeat`).
3. Beats 4–6 are driven by genuine per-item timeline actions and sequence-item end operations in the compiled JSON,
   not faked.
4. In the browser the wave chips light at 41–43 s and go out; `#c4-pulse` changes state at every beat boundary
   (7, 15, 22, 31, 40, 49 s).
5. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit (`#c4-pulse` unlit, cards hidden).

## 3. Verification notes and resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave.
- **Effect-pane fidelity:** Beats 4, 5 and 6 are real (the card row, the `each` / `then` dot, the wave); Beats 1–3
  and 7 are illustrative panels revealed by `demo`.
- **The chapter's `each … then`:** items are back to back, so an item's end operations and the next item's start
  operations run in the same reconcile, with no paint in between. A prelude `addClass("lit")` and a postlude
  `removeClass("lit")` would cancel out and leave a dot lit all chapter. So the prelude stays `clearSpots()`
  (visible: the spotlights go out at every beat start) and the postlude flips `#c4-pulse` with `toggleClass`, so it
  changes state at every boundary: lit at 7 s, unlit at 15 s, lit at 22 s, and so on.
- **The inline stagger threads its item:** every block starts empty, so each block selects its item first
  (`selectElement(@@item)`); the compiler substitutes the item into each generated event. The old snippet
  (`stagger 100ms items for 1s [ addClass("active") ] [ removeClass("active") ]`) reports
  `Could not resolve reference to Parameter named 'items'.` and, for both blocks,
  `Property 'selectedElement' is not available - ensure it is created by a previous operation (for example with selectElement)`
  (missing-dependency).
- **Anchors:** `at <time>` after the items places the first item; without it the first item starts where the
  previous event ends, and `at +2s` counts from there.
- **Timeline name / uri:** `"Timeline Power Tools"` (the string name is the `navigate` uri). Hub card label:
  "Timeline Power Tools".

## 4. Files

```
examples/eligian-tour/
├── tour.eligian    # the "Timeline Power Tools" timeline: seven labelled items with each / then, two staggers
├── layout.html     # #ch4: chrome (+ #c4-pulse), code blocks, effect panels (cards #c4-card-1–3, the each / then
│                   #   panel, wave chips #c4-wave-1–3), callout chips (+ #c4-cl-items)
└── tour.css        # anchors (#c4-tok-each, #c4-tok-anchor), fallback rows, the mirrored dot, the wave chips
```

`presentation.eligian` is unchanged: `revealCard` is already in the library.
