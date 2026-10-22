# Storyboard — Chapter 5: Engine Reach

> Teaches the three ways an Eligian presentation reaches **past the timeline clock** into the
> Eligius engine's runtime services: the **eventbus** (`broadcastEvent`, broadcast vs request),
> **`on event` actions** (logic fired by an event instead of a time), and **controllers**
> (`addController`, stateful behaviour attached to an element) — closing with **i18n / `locales`**
> via the `LabelController`.
> **Self-demonstration:** the tour's *own chrome* is built from exactly these features — every
> click you've made routes click → `DOMEventListenerController` → `broadcastEvent("request-timeline-uri")`
> → engine switch, and the narration is locale-driven. Chapter 5 pulls back that curtain, and reveals
> its own panel with a **real eventbus round-trip** it wires live.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapters 1–4 (see `chapter-04-…md` §0): a `#ch5` `.view`
inside `#stage` with its own chrome (`.chrome` + `.progress-rail` + `.chapter-label` + `#c5-to-hub`),
`.code-pane`, `.effect-pane`, `.callout-layer`. Structural panes are shared classes; DSL-selected leaf
elements are namespaced `#c5-…` and **must be registered in `tour.css`** (id-registration rule groups —
class styling alone doesn't satisfy CSS validation's id-exists check). `#narration` is the shared subtitle.

**View management** = the self-managing endable setup action (see `ELIGIUS_EXECUTION_MODEL.md` §7b):
`timeline "Engine Reach"`'s first event is `at 0s..3600s [ showView("#ch5") + showView("#narration")
+ wire #c5-to-hub ] [ hideView("#ch5") + hideView("#narration") ]`. Hub card `#card-ch5` `navigate`s to
`"Engine Reach"`.

### Shared + chapter-local actions

Reuses the existing library (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`,
`showView`, `hideView`). Beat 3/4 add the chapter-local pieces that dogfood the topic (build detail in §3/§4):

- a tiny `broadcastPing()` action — `broadcastEvent("tour-ping", ["#c5-fx-panel"])` — fired by a button,
- an **`on event` handler** — `on event "tour-ping" action onTourPing(target) [ selectElement(target) addClass("in") ]`
  (param `target` ← `eventArgs[0]`), which reveals the panel,
- the button's click wiring done by a **real** `addController("DOMEventListenerController", { eventName: "click",
  actions: ["broadcastPing"] })` (the same proven path that powers `navigate`).

---

## 1. Segment beats

Each beat: **click to advance** (autoplay toggle runs them on the raf clock at the authored `at` times).
A beat = (narration swap) + (code reveal / spotlight) + (callout) + (effect tick). Times are raf positions.

### Beat 1 — "Beyond the clock" (0s–7s)

- **Narration:** "Everything so far fired on the timeline clock — *at* this time, *for* that long. But a
  presentation also has to **react**: to clicks, to events, to a change of language. That's engine reach."
- **Code revealed** (`#c5-code-overview`): the three doors, as headers —
  ```eligian
  broadcastEvent("name", [args])          // 1. the eventbus — fire a message
  on event "name" action H(p) [ … ]       // 2. react to it, no timeline needed
  addController("LabelController", { … })  // 3. attach stateful behaviour to an element
  ```
- **Callout:** "You've used all three already — every click in this tour is engine reach. Let's see how."
- **Effect pane:** three labelled doors / lanes (Eventbus · Reactions · Controllers) light up in turn.

### Beat 2 — "The eventbus: broadcast vs request" (7s–15s)

- **Narration:** "The engine has a message bus. `broadcastEvent` puts a message on it. **Broadcast** reaches
  *every* listener; **request** asks for the *one* that answers — that's how navigation works."
- **Code** (`#c5-code-eventbus`):
  ```eligian
  broadcastEvent("tour-ping", ["#c5-fx-panel"])          // broadcast: all listeners hear it
  broadcastEvent("request-timeline-uri", ["Hub", 0])     // request: the engine answers, switches timeline
  ```
- **Callouts, click order:**
  1. event name string → "the channel — listeners subscribe by name"
  2. `[ … ]` args → "positional arguments — they arrive as `eventArgs[0]`, `eventArgs[1]`, …"
  3. `request-timeline-uri` → "the *request* the `navigate` sugar emits — the engine's switch responds"
- **Effect pane (illustrative):** a bus line; a broadcast packet fans out to many handlers, a request packet
  travels to exactly one responder and returns.

### Beat 3 — "on event: logic fired by an event" ⭐ self-demo (15s–24s)

- **Narration:** "An `on event` action runs when its event fires — not at a time on the timeline. Its
  parameters are filled from the event's arguments. Click the button: it broadcasts, and this handler answers."
- **Code** (`#c5-code-onevent`):
  ```eligian
  on event "tour-ping" action onTourPing(target) [
    selectElement(target)        // target ← eventArgs[0] = "#c5-fx-panel"
    addClass("in")
  ]
  ```
- **Callouts, click order:**
  1. `on event "tour-ping"` → "no `at` — this fires whenever the named event is broadcast"
  2. `action onTourPing(target)` → "parameters map to the event's args by position (`target` ← `eventArgs[0]`)"
  3. body → "from here it's an ordinary operation chain — select, add a class"
- **Effect pane (REAL):** a `#c5-fx-ping` button is live; clicking it reveals `#c5-fx-panel`. The reveal is
  driven by a genuine broadcast → `on event` round-trip (build detail §3). The panel you see appear *is* the demo.
- **Why this is genuine (to verify in-engine at build):** uses the **same proven path as `navigate`** —
  `DOMEventListenerController` → action → `broadcastEvent` — only the event is a custom `"tour-ping"` caught by
  an `on event` handler instead of the engine's `request-timeline-uri` switch. High confidence; verify the
  round-trip in the jsdom harness before presenting as REAL (see §3 ⚠).

### Beat 4 — "Controllers: stateful behaviour on an element" (24s–32s)

- **Narration:** "A controller attaches lasting behaviour to a selected element. The button that just worked?
  Its click was wired by a `DOMEventListenerController`. There are eight built-ins."
- **Code** (`#c5-code-controller`):
  ```eligian
  selectElement("#c5-fx-ping")
  addController("DOMEventListenerController", {
    eventName: "click",
    actions: ["broadcastPing"]      // run this action's start ops on each click
  })
  ```
- **Callouts, click order:**
  1. `selectElement(...)` → "a controller attaches to the **selected element** (its one dependency)"
  2. `"DOMEventListenerController"` → "one of eight: DOMEventListener · Label · Lottie · MutationObserver ·
     Navigation · Progressbar · Routing · Subtitles"
  3. `actions: ["broadcastPing"]` → "names the action(s) to run on the event — this is what `navigate` desugars to"
- **Effect pane (REAL — same demo as Beat 3):** spotlight the live `#c5-fx-ping` button and trace
  click → controller → `broadcastPing` → `tour-ping` → `onTourPing` → panel. Beat 3 and Beat 4 narrate the
  two halves of the *one* real round-trip the chapter wires.

### Beat 5 — "i18n: the LabelController" (32s–40s)

- **Narration:** "Locales make text translatable. A `LabelController` binds a **translation key** to an element;
  it renders the active language and re-renders itself when the language changes. This tour's narration runs on it."
- **Code** (`#c5-code-label`):
  ```eligian
  locales "./locales/en.json"           // (+ other languages) registered as config locales

  selectElement("#c5-fx-label")
  addController("LabelController", { translationKey: "tour.greeting" })
  ```
- **Callouts, click order:**
  1. `locales "…"` → "a default import — keys + translations become engine locales"
  2. `translationKey` → "the key to render; the controller resolves it via the rosetta locale system"
  3. "re-renders on `language-change`" → "broadcast that event and every bound label swaps language live"
- **Effect pane (REAL if verified, else illustrative):** a `#c5-fx-label` shows text from a key; broadcasting
  `language-change` swaps it to a second locale in place. **⚠ Build/verify:** confirm the `LabelController` +
  `locales` round-trip renders and re-renders in the jsdom harness; if the locale/rosetta wiring needs assets
  the harness can't satisfy, keep Beat 5 **illustrative** (animated key→text swap) and leave the REAL demo as
  Beat 3/4's eventbus round-trip (mirrors Ch4's "one real demo, the rest illustrative" stance).

### Beat 6 — "The chrome was the lesson" recap + end card (40s–48s)

- **Narration:** "Eventbus, `on event`, controllers, locales — the navigation and narration you've used the
  whole time are built from exactly these. The timeline says *when*; engine reach says *what else*."
- **Code** (`#c5-code-recap`): the three doors again, now annotated with where the tour itself uses each —
  ```eligian
  broadcastEvent("request-timeline-uri", …)   // ← every Hub/chapter card you clicked
  addController("DOMEventListenerController",…) // ← what `navigate` desugars to
  addController("LabelController", …)           // ← the localized narration line
  ```
- **Callouts:** spotlight each → "you've been using engine reach since the Hub."
- **Meta moment:** the words learned this chapter (`broadcastEvent`, `on event`, `addController`, `locales`) pulse.
- **End card:** "Chapter 5 ✓ — next: Tooling Magic" + `← Hub`.

---

## 2. What this chapter must prove (acceptance)

1. The `timeline "Engine Reach"` + the `on event` handler + the `addController` call **compile clean**
   (`--check`, exit 0) within `tour.eligian`.
2. Hub card `#card-ch5` `navigate`s to "Engine Reach" and `← Hub` returns (verified in-engine).
3. Beat 3/4's panel reveal is driven by a **genuine eventbus round-trip** (real `DOMEventListenerController`
   + custom `broadcastEvent` + `on event` handler in the compiled JSON) — not faked — proving the dogfood.
4. Beat 5's locale demo is REAL **iff** verified in the jsdom harness; otherwise demoted to illustrative with
   the eventbus round-trip remaining the chapter's REAL self-demo.
5. Motion stays restrained (150–250ms eases, transform/opacity only).

## 3. Verified in-engine (jsdom) + dogfooding finds

**Built and verified** (jsdom harness, against the real compiled config + Eligius engine): switch to
"Engine Reach" → seek into Beat 4 (the timeline runs `ch5WireButton`, attaching a real
`DOMEventListenerController` to `#c5-fx-ping`) → click → controller runs `ch5BroadcastPing` →
`broadcastEvent("tour-ping",["#c5-fx-panel"])` → the `on event "tour-ping"` handler resolves
`eventArgs.0` + `addClass("in")` → `#c5-fx-panel` revealed. Back-nav to Hub (and `#ch5` hidden on leave) also verified.

**Two real bugs found + fixed while building this chapter** (see `KNOWN_ISSUES.md`):
- **C8** 🔴 — event-action params compiled to `$operationData.eventArgs[n]` (bracket), which eligius cannot
  resolve (no bracket parsing) → any handler reading an event arg threw at runtime. Fixed to dot-index
  `eventArgs.n`. Would have made *every* `on event` handler that uses its parameters silently broken.
- **V1** 🟠 — `on event` rejected any non-engine event name, blocking custom application events (which the
  eventbus fully supports). Relaxed to allow a custom name that the program broadcasts itself.

- **`LabelController` + `locales` round-trip** — NOT wired live; Beat 5 is illustrative (no locale assets
  authored for the tour), per the §Beat 5 fallback. The eventbus round-trip (Beats 3+4) is the chapter's REAL demo.

## 4. Resolved decisions

- **Advance mode:** click-to-advance + autoplay toggle (same as Chapters 1–4).
- **Scope:** three pillars = eventbus / `on event` / controllers, plus i18n (`locales` + `LabelController`).
  **Libraries+imports are NOT re-taught** — Chapter 2 Beat 6 already covered them.
- **Effect-pane fidelity:** pragmatic mix — Beat 3/4 share *one real* eventbus round-trip; Beats 1/2/6 (door
  diagrams, bus animation, recap) are illustrative; Beat 5 real-if-verified, else illustrative.
- **Timeline name / uri:** `"Engine Reach"` (the string name is the `navigate` uri). Hub card label: "Engine Reach".
- **Self-demo construct:** the eventbus round-trip the chapter wires live (mirrors Ch3's real-`for`, Ch4's real
  `stagger`).

## 5. Files this implies (when building)

```
examples/eligian-tour/
├── layout.html      # + #ch5 view: pre-tokenized Chapter-5 snippets (#c5-code-*), #c5-cl-* callouts,
│                    #   #c5-fx-* effects incl. live #c5-fx-ping button + hidden #c5-fx-panel (+ #c5-fx-label)
├── tour.css         # + Chapter-5 block/callout/effect styles + id-registration rules (validated)
├── presentation.eligian   # + broadcastPing() action + on event "tour-ping" action onTourPing(target) [...]
│                          #   (and, if Beat 5 is REAL, nothing extra — LabelController is an addController call)
└── tour.eligian     # + timeline "Engine Reach" (setup action + 6 beats; Beat 4 fires the real
                     #   addController("DOMEventListenerController", { eventName:"click", actions:["broadcastPing"] })
                     #   on #c5-fx-ping) + wire hub card #card-ch5 → navigate "Engine Reach"
```

> Build note: every `#c5-…` id selected by the .eligian (button, panel, label, code blocks, callouts, fx,
> `#c5-to-hub`) must be registered in `tour.css`. Verify both the `on event` receive and the `LabelController`
> render in the jsdom harness before presenting either as more than illustrative (see §3).
```
