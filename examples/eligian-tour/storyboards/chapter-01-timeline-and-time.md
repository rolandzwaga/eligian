# Storyboard — Chapter 1: Timeline & Time

> Vertical slice. Proves the **annotated code walkthrough** format end-to-end before we replicate ×6.
> Teaches: the `timeline` declaration, providers, `at` timed events, time units, time arithmetic, relative time.
> **Self-demonstration:** this chapter *is* a `timeline` full of `at` events — the very things it teaches.

---

## 0. Stage layout (shared across all chapters)

Authored once in `layout.html`, styled in `tour.css`. The walkthrough machinery lives here; chapters just drive it.

```
┌───────────────────────────────────────────────────────────┐
│  �+ progress rail (6 dots, current = accent)        ↩ hub   │  #chrome
├──────────────────────────────┬────────────────────────────┤
│                              │                            │
│   #code-pane                 │   #effect-pane             │
│   pre-tokenized <span>s      │   live result of the       │
│   per line; spotlight via    │   snippet being explained  │
│   .spot / .dim classes       │                            │
│                              │                            │
├──────────────────────────────┴────────────────────────────┤
│  #narration  — one-line subtitle, fades per beat           │
│  #callout-layer — absolutely-positioned arrow+label chips  │
└───────────────────────────────────────────────────────────┘
```

**Key authoring decision:** code is **pre-tokenized HTML** in `layout.html`, e.g.
`<span class="kw">timeline</span> <span class="str">"Tour"</span> ...`, each meaningful token id'd
(`#t-kw-timeline`, `#t-str-name`, …). Walkthrough = toggling `.spot`/`.dim` classes + positioning callouts.
No runtime tokenizer needed. "Typing" reveal = a CSS clip/opacity animation triggered by `addClass("typing")`.

### Shared presentation actions (`presentation.eligian` library)

| Action | Purpose | Desugars to (roughly) |
|---|---|---|
| `revealBlock(sel)` | fade a code block in | selectElement + addClass("in") |
| `spotlight(sel)` | highlight one token, dim the rest | selectElement + addClass("spot") |
| `clearSpots()` | reset all spotlights | selectElement(".tok") + removeClass("spot") |
| `callout(sel, labelId)` | animate an arrow+label onto a token | selectElement + setElementContent + addClass("show") |
| `narrate(labelId)` | swap the subtitle line | selectElement("#narration") + setElementContent |
| `demo(sel)` | run the actual effect in #effect-pane | selectElement + addClass(...) / animate |

All take selectors/label-ids as params → all are real, compilable Eligian (we verify with `--check`).
`labelId` args route through `locales` so the narration is i18n-ready (and that becomes Chapter 5 fodder).

---

## 1. Segment beats

Each beat: **click to advance**. A beat = (narration swap) + (spotlight move) + (callout) + (effect tick).
"Re-watch" replays the chapter timeline from its start. Times below are the raf positions used by `at`.

### Beat 1 — "Every presentation starts with a canvas" (0s–6s)

- **Narration:** "An Eligian presentation is one or more *timelines*. Here's the one you're watching."
- **Code revealed** (block fades in, then `.typing` sweep):
  ```eligian
  timeline "Tour" in "#stage" using raf {
    …
  }
  ```
- **Callouts, in click order:**
  1. `timeline` → "the keyword that declares a timeline"
  2. `"Tour"` → "its name — also the **uri** the hub uses to jump here"
  3. `in "#stage"` → "the container element it renders into"
  4. `using raf` → "its driver (more in a sec)"
- **Effect pane:** an empty framed stage labelled `#stage` draws itself in.
- **Meta badge (bottom-right, subtle):** `↩ you're inside this timeline right now`

### Beat 2 — "Pick a driver" / providers (6s–12s)

- **Narration:** "What advances the timeline? Its *provider*."
- **Code:** spotlight shifts to `raf`; a ghosted comment reveals the alternatives:
  ```eligian
  using raf      // animation clock — what this tour uses
  using video    // drive from a <video> (needs `from "clip.mp4"`)
  using audio    // drive from an <audio>
  using custom   // your own provider
  ```
- **Callouts:** one per provider line; `video`/`audio` callout notes the `from` source requirement.
- **Effect pane:** four mini-icons (clock / film / waveform / gear); the clock pulses as "selected".
- **Self-demo note:** none new — still riding the Beat-1 timeline.

### Beat 3 — "Make something happen at a time" / `at` events (12s–20s)

- **Narration:** "Inside a timeline, `at` schedules work over a time range."
- **Code:**
  ```eligian
  at 0s..5s selectElement("#hero")
  ```
- **Callouts, click order:**
  1. `at` → "schedule a timed event"
  2. `0s..5s` → "a **time range**: start `..` end"
  3. `selectElement("#hero")` → "any operation (or your own action) — unified call syntax"
- **Effect pane:** a `#hero` block fades in at the 0s tick and the range bar fills 0→5s on a mini scrubber.
- **Self-demo note:** "this reveal you just saw? an `at` event, exactly like this one."

### Beat 4 — "Time speaks four units" (20s–27s)

- **Narration:** "Times take units. No unit means milliseconds."
- **Code:**
  ```eligian
  at 42      …   // 42 ms (bare number = ms)
  at 500ms   …
  at 2s      …
  at 1.5m    …
  at 0.5h    …
  ```
- **Callouts:** spotlight each literal; the bare `42` gets the "= 42ms" gotcha chip.
- **Effect pane:** a ruler that rescales as each unit is highlighted (ms → s → m → h), driving the point home visually.

### Beat 5 — "Do arithmetic on time" + relative time (27s–35s)

- **Narration:** "Ranges can compute — and chain off the previous event."
- **Code:**
  ```eligian
  at 5s + 2s .. 10s          // arithmetic in a bound
  at +0s..+3s   doThing()    // relative: starts when the previous event ends
  ```
- **Callouts:**
  1. `5s + 2s` → "arithmetic: `+ - * /` on durations"
  2. `+0s` / `+3s` → "relative time — anchored to the previous event's end"
- **Effect pane:** two range bars; the second visibly snaps to begin where the first ends.

### Beat 6 — Recap + the reveal (35s–42s)

- **Narration:** "That whole sequence? One timeline. Here it is."
- **Code pane** zooms out to show the **entire chapter source** (the real `chapter-01.eligian`, lightly trimmed) scrolling past.
- **Meta moment:** the words you just learned (`timeline`, `at`, `using`, time literals) pulse in the code as they're named.
- **Effect pane:** collapses into the hub-return affordance.
- **End card:** "Chapter 1 ✓ — next: Actions & Composition" + `↩ back to hub`.

---

## 2. What this slice must prove (acceptance)

1. `chapter-01.eligian` + `presentation.eligian` library **compile clean** (`--check`, exit 0) and produce sane JSON.
2. The hub→chapter→hub nav round-trips (uses the verified `addController` + `broadcastEvent("request-timeline-uri", …)` path; sugar idiom optional at this stage).
3. The annotated-walkthrough machinery (revealBlock/spotlight/callout/narrate/demo) reads cleanly and the timing feels tight in preview.
4. Motion is restrained (150–250ms eases, transform/opacity only).

## 3. Resolved decisions

- **Advance mode:** *click to advance* by default, **plus an autoplay toggle** that runs beats on the raf clock at the authored `at` times. Re-watch replays from start. (Times are already written, so autoplay is nearly free.)
- **Reveal style:** **CSS clip sweep** — code blocks reveal via a clip/opacity animation triggered by `addClass("typing")`. No per-char sub-timeline.
- **Effect-pane fidelity:** **pragmatic mix** — Beats 1/3/5 use *real* Eligian operation results (genuine dogfooding); Beats 2/4 (providers, units — awkward to show literally) use tasteful illustrative graphics.

## 4. Files this implies (next, once storyboard is approved)

```
examples/eligian-tour/
├── layout.html                 # stage + pre-tokenized code spans
├── tour.css                    # theme + animations (validated against operations)
├── locales.json                # narration/callout strings (i18n-ready)
├── presentation.eligian        # shared library: revealBlock, spotlight, callout, narrate, demo
├── hub.eligian | main.eligian  # entry: languages, imports, hub timeline + nav wiring
└── chapters/
    └── chapter-01.eligian      # this chapter's timeline
```
