# Storyboard — Chapter 1: Timeline & Time

> The first chapter, and the one that set the **annotated code walkthrough** format the others follow.
> Teaches: the `timeline` declaration, providers (`raf` / `video` / `audio` / `scroll` / `custom`) and the header options `loop` / `duration`, `at` timed events with `start .. end` and `start for duration` ranges, time units, time arithmetic, relative time, time constants (`const beat = 6s`, `@beat`) and event labels (`as open`, `open.end`), the `target` clause with an optional end block, and the timeline lifecycle blocks (`on enter` / `on leave`).
> **Self-demonstration:** this chapter *is* a `timeline` of labelled `at` events timed with a time constant: the beat that teaches labels starts at `+0s`, the `target` beat really lights a box and its end block unlights it, and the recap shows this timeline's own header and lifecycle blocks.

---

## 0. Stage layout (shared across all chapters)

Authored once in `layout.html`, styled in `tour.css`. The walkthrough machinery lives here; chapters just drive it.

```
┌───────────────────────────────────────────────────────────┐
│  ← Hub   progress rail (8 dots, current = accent)  01 · …  │  header.chrome
├──────────────────────────────┬────────────────────────────┤
│                              │                            │
│   section.code-pane          │   section.effect-pane      │
│   pre-tokenized <span>s      │   live result of the       │
│   per line; spotlight via    │   snippet being explained  │
│   .spot                      │   (div.fx panels)          │
│                              │                            │
├──────────────────────────────┴────────────────────────────┤
│  #narration — one-line subtitle, fades per beat            │
│  #progress  — fill driven by the ProgressbarController     │
│  div.callout-layer — anchored arrow+label chips            │
└───────────────────────────────────────────────────────────┘
```

**Key authoring decision:** code is **pre-tokenized HTML** in `layout.html`, e.g.
`<span class="tok kw" id="tok-timeline">timeline</span> <span class="tok str" id="tok-name">"Tour"</span> …`.
Every token is a `span.tok` with a kind class (`kw`, `str`, `num`, `op`, `fn`, `com`); a token a beat spotlights gets an
id (Chapter 1 keeps its unprefixed ids `#tok-timeline`, `#tok-raf`, `#tok-at`, `#tok-plus` and adds `#c1-tok-…` ones).
The walkthrough toggles `.spot` on one token and `.show` on its callout chip; there is no runtime tokenizer. The
"typing" reveal is a CSS clip sweep triggered by `addClass("typing")`.

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056): `spotlight("#tok-timelin")` reports `Unknown CSS ID in selector: 'tok-timelin'. Did you mean: tok-timeline?`
although `spotlight` is an action.

**View management:** each chapter owns one `section.view.chapter` (`#ch1`) and shows / hides it only through its
lifecycle blocks: `on enter [ enterChapter("#ch1") … ]` shows the view and the narration and attaches the
ProgressbarController to `#progress-fill`; `on leave [ leaveChapter("#ch1", "#c1-to-hub") ]` hides them, resets the
view (`resetChapter`: removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it) and removes
every controller `on enter` attached (three KeyboardControllers on `#stage`, the back button's listener, the
ProgressbarController). The engine runs the leaving timeline's `on leave`, then the entering one's `on enter`.

### Shared presentation actions (`presentation.eligian` library)

| Action | Purpose | Desugars to (roughly) |
|---|---|---|
| `revealBlock(selector)` | fade a code block in and sweep it | selectElement + addClass("in") + addClass("typing") + scrollToElement |
| `spotlight(selector)` | highlight one token | selectElement + addClass("spot") |
| `clearSpots()` | clear every spotlight and hide the previous chip | `with ".tok" { removeClass("spot") }` + `with ".callout" { removeClass("show") }` |
| `callout(selector, template)` | show a chip with literal text on a token | selectElement + setElementContent + addClass("show") |
| `narrate(template)` | swap the subtitle line (literal text) | selectElement("#narration") + setElementContent + the `.fresh` entry animation |
| `demo(selector)` | run the effect in the effect pane | selectElement + addClass("active") + scrollToElement + animate |
| `revealCard(selector)` | reveal one item (Chapter 4's stagger) | selectElement + addClass("in") |
| `showView(selector)` / `hideView(selector)` | show / hide a top-level view | selectElement + addClass / removeClass("is-active") |
| `enterChapter(view)` | show the view + narration, attach the ProgressbarController | showView ×2 + selectElement("#progress-fill") + addController("ProgressbarController") |
| `resetChapter(view)` | undo every state class the beats added inside the view | `with view + " .in" { … }` … one `with` per state class |
| `replayChapter(view)` | reset, then seek to 0 | resetChapter + broadcastEvent([0], "timeline-seek-request") |
| `leaveChapter(view, back)` | hide, reset and unwire | hideView ×2 + resetChapter + one removeControllerFromElement per controller |

`callout` and `narrate` take the literal text of the chip / subtitle line; there is no locale routing for the
narration (the hub title and tagline are the tour's localized lines, Chapter 06).

---

## 1. Segment beats

The beats play on the raf clock at the times below; `space` pauses and resumes, `r` replays the chapter
(`replayChapter`: reset the view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap +
code block + spotlight + callout + effect panel. Times are fixed by a program-level time constant and event labels:

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

6 + 6 + 8 + 7 + 8 + 8 + 7 + 8 = **58 s**, the timeline's duration (the lifecycle blocks do not count), which the
ProgressbarController reads.

### Beat 1 — open on the canvas (0–6 s, `as open`)

- **Narration:** "An Eligian presentation is one or more timelines. Here's the one you're watching."
- **Code** `#code-ch1`:
  ```eligian
  timeline "Tour" in "#stage" using raf {
    … events …
  }
  ```
- **Spot / callout:** `#tok-timeline`; `#cl-name` "its name — also what navigate and the engine's uri use".
- **Effect pane** `#fx-stage`: an empty framed stage labelled `#stage`.

### Beat 2 — providers and header options (6–12 s, `as providers`)

- **Narration:** "What advances the timeline? Its provider — and the header can loop it or fix its duration."
- **Code** `#c1-code-providers`:
  ```eligian
  timeline "Clip" in "#player" using video from "./clip.mp4" { … }
  timeline "Story" in "#stage" using scroll "#scroller" duration 120s { … }
  timeline "Ambient" in "#bg" using raf loop duration 30s { … }
  timeline "Remote" in "#stage" using custom { … }   // your own position source
  // scroll: the container must be in the layout or the CSS, and scroll
  ```
- **Spot / callout:** `#tok-raf` (in `#code-ch1`); `#cl-provider` "raf = animation clock · video / audio drive from media · scroll = the scroll position · custom".
- **Effect pane** `#fx-providers`: chips `raf` `video` `audio` `scroll` `custom`.
- **Note:** the last comment line is the scroll-container check: without `#scroller` in the layout or the CSS,
  `check` reports `Unknown scroll container '#scroller': it is not in the layout HTML or the imported CSS`
  (`unknown_scroll_container`); when no rule makes it scroll, it warns `scroll_container_not_scrollable`.

### Beat 3 — ranges (12–20 s, `as ranges`)

- **Narration:** "Inside a timeline, at schedules work over a time range: start to end, or start for a duration."
- **Code** `#code-at`:
  ```eligian
  at 0s..5s    revealHero()   // start .. end
  at 5s for 3s revealHero()   // start for duration
  ```
- **Spot / callout:** `#tok-at`; `#cl-range` "a time range: start .. end — or start for duration".
- **Effect pane** `#fx-hero`: the hero box.

### Beat 4 — units (20–27 s, `as units`)

- **Narration:** "Times take units. No unit means seconds — and in arithmetic a bare number is a factor."
- **Code** `#code-units`:
  ```eligian
  42      // 42 s (no unit = seconds)
  500ms
  2s
  1.5m
  0.5h
  2s * 3  // 6s
  ```
- **Callout:** block chip `#cl-units` "42 = 42s · 500ms · 2s · 1.5m · 0.5h".
- **Effect pane** `#fx-ruler`: ticks `ms` `s` `m` `h`.

### Beat 5 — arithmetic and relative time (27–35 s, `as arith`)

- **Narration:** "Ranges can compute — and chain off the previous event with a +."
- **Code** `#code-arith`:
  ```eligian
  at 5s + 2s .. 10s  doThing()
  at 10s / 2 for 1s  doThing()
  at +0s..+3s        doThing()   // relative to the previous event's end
  ```
- **Spot / callout:** `#tok-plus` (the `+` of `+0s`); `#cl-relative` "relative time — anchored to the previous event's end".
- **Effect pane** `#fx-chain`: two bars, the second starting where the first ends.

### Beat 6 — time constants and labels (35–43 s, `as constants`)

- **Narration:** "Name a time once with const, label an event with as, and later times refer to them. This chapter is timed exactly that way."
- **Code** `#c1-code-labels`:
  ```eligian
  const beat = 6s
  at 0s for @beat as open [ … ]
  at open.end for @beat as providers [ … ]
  at providers.end + 1s..providers.end + 3s [ … ]
  ```
- **Spot / callout:** `#c1-tok-label` (on `as open`); `#c1-cl-label` "@beat is a compile-time constant · open.end refers to an earlier event of this timeline".
- **Effect pane** `#c1-fx-labels`: two bars with chips `open` `providers`.
- **Self-demo:** the event itself is `at +0s for @long as constants`, and beat 2 is `at open.end for @beat as providers`.
  Only labels of earlier events can be referred to.

### Beat 7 — target (43–50 s, `as targets`) — REAL

- **Narration:** "target selects an element for a block's start and its end — and an inline end block is optional."
- **Code** `#c1-code-target`:
  ```eligian
  at 0s..5s target "#box" [ addClass("lit") ] [ removeClass("lit") ]
  at 5s for 2s [ selectElement("#box") addClass("spot") ]   // no end block
  ```
- **Spot / callout:** `#c1-tok-target`; `#c1-cl-target` "selectElement at the head of both blocks; nothing carries from start to end".
- **Effect pane** `#c1-fx-target` > `span#c1-target-box.fx-hero-box` (dim until lit).
- **Self-demo:** the beat is `at constants.end for 7s as targets target "#c1-target-box" [ addClass("lit") … ] [ removeClass("lit") ]`:
  the compiled start operations begin `selectElement("#c1-target-box")`, `addClass("lit")`, the end operations
  `selectElement("#c1-target-box")`, `removeClass("lit")`. The box lights at 43 s and unlights at 50 s. Every other
  beat of this chapter has no end block.

### Beat 8 — recap (50–58 s, `as recap`)

- **Narration:** "That whole chapter? One timeline: on enter shows it, on leave cleans up, neither counts toward its 58 seconds, and its beats are timed with a constant and labels. Hub, space pauses, r replays."
- **Code** `#code-full`, this timeline's real header:
  ```eligian
  const beat = 6s
  timeline "Timeline & Time" in "#stage" using raf {
    on enter [ enterChapter("#ch1") … on key "r" run replayChapter("#ch1") ]
    on leave [ leaveChapter("#ch1", "#c1-to-hub") ]   // on navigate or stop, not when the content ends
    at 0s for @beat as open [ … ]
    at open.end for @beat as providers [ … ]
  }
  ```
- **Spot / callout:** `#c1-tok-enter` (on `on enter`); `#c1-cl-lifecycle` "one open-ended action { start: 0 }, not counted in the duration · on leave runs on navigate / stop, not when the content ends".
- **Effect pane** `#fx-endcard`: "Chapter 1 ✓".

---

## 2. Acceptance

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass;
   `smoke` reports `timeline 'Timeline & Time': 9 positions ok` (eight events plus the lifecycle action).
2. The chapter is timed with `const beat` / `const long` and labels; the compiled timeline's duration is 58 s.
3. The `target` beat lights the box at 43 s and unlights it at 50 s (browser).
4. Every displayed snippet passes `eligian check` when pasted into a scratch program (the `…` elisions filled in;
   `#player`, `#scroller` (scrollable), `#bg`, `#box`, `#hero` present in the scratch layout).
5. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit (all blocks hidden again,
   the box dim).

## 3. Verification notes and resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave. Replay is
  `on key "r" run replayChapter("#ch1")`, not `on key "r" seek 0s`: a seek only ends the actions that no longer
  cover the position and starts those that do, and the beats have no end blocks (except beat 7), so every class
  earlier beats added would survive it.
- **Reveal style:** CSS clip sweep triggered by `addClass("typing")`; no per-character sub-timeline.
- **Effect-pane fidelity:** beat 7 is a real effect of its own code (the `target` block); the other panels are
  illustrative graphics revealed by `demo`.
- **Verified with the CLI:** the four provider headers, both range forms, the units (`42` → 42 s, `1.5m` → 90 s,
  `0.5h` → 1800 s, `2s * 3` → 6 s), the arithmetic ranges (`5s + 2s .. 10s` → 7–10 s, `10s / 2 for 1s` → 5–6 s,
  `+0s..+3s` after it → 6–9 s), the labels snippet (`providers.end + 1s..providers.end + 3s` → 13–15 s), both
  `target` lines, and the recap header all check clean.
- **House rule:** `const` lives in actions or at program level (here: `beat`, `long`), never in a timeline block.

## 4. Files

```
examples/eligian-tour/
├── tour.eligian           # const beat / long + the "Timeline & Time" timeline
├── presentation.eligian   # shared library (revealBlock … leaveChapter)
├── layout.html            # #ch1: chrome, code blocks, effect panels, callout chips
└── tour.css               # theme, anchors, fallback rows, #c1-target-box
```
