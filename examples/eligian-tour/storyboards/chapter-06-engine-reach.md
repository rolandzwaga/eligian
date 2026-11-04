# Storyboard — Chapter 6: Engine Reach

> Teaches the five ways an Eligian presentation reaches **past the timeline clock** into the Eligius engine's
> runtime: the **eventbus** (`broadcastEvent(eventArgs, eventName)`, one bus that every listener, the engine
> included, hears), **`on event` actions** (logic fired by an event instead of a time, with an optional `topic`),
> **interactions** (`on <event> "<sel>" navigate | play | pause | toggle | stop | seek | run …`) and **`on key`**,
> **controllers** (`addController`, positional parameters, nine of them), and **your own JavaScript** (a host
> operation from the `extensions` module). Plus **locales**: a LabelController rendering a key in the active
> language.
> **Self-demonstration:** the tour's own chrome is built from these. Every card and back button is an `on click …
> navigate`, Esc / space / r are this chapter's own `on key` lines, and the hub title is a LabelController. In the
> chapter itself the ping button is wired in `on enter` with `run` and answered by an `on event` handler, the
> greeting is a real LabelController with two buttons that switch the language live, and the clock is stamped by
> `host.js`.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapter 1 (see `chapter-01-timeline-and-time.md` §0): `#ch5` is a
`section.view.chapter` inside `#stage` with its own `header.chrome` (back button `#c5-to-hub`, an 8-dot progress rail
with dot 6 current, the label `06 · Engine Reach`), `section.code-pane` of pre-tokenized `pre#c5-code-*.code`
blocks, `section.effect-pane` of `div#c5-fx-*.fx` panels and a `div.callout-layer` of `div#c5-cl-*.callout` chips.
The shared `#narration` and `#progress` sit outside the views. The view keeps its id `#ch5` and the `c5-` prefix; the
display number (06) follows the hub order.

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056).

**View management:** the chapter shows and hides its view only through its lifecycle blocks:
`on enter [ enterChapter("#ch5") … ]` shows the view and the narration and attaches the ProgressbarController to
`#progress-fill`; `on leave [ … leaveChapter("#ch5", "#c5-to-hub") ]` hides them, resets the view (`resetChapter`:
removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it) and removes every controller of the
skeleton (three KeyboardControllers on `#stage`, the back button's listener, the ProgressbarController). This chapter
attaches five more controllers in `on enter` (the ping button's and the two language buttons' listeners, the
greeting's LabelController) and removes them itself in `on leave`, before `leaveChapter`; first it switches the
language back to en-US, because the language otherwise persists into the hub. Hub card `#card-ch5` (and key `6`)
`navigate`s to `"Engine Reach"`.

### Shared and chapter-local actions

Reuses the library unchanged (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`, and the
chapter skeleton's `enterChapter`, `replayChapter`, `leaveChapter`; table in `chapter-01-timeline-and-time.md` §0).
Chapter-local, in `tour.eligian` (the earlier `ch5WireButton`, which a beat ran, is gone: the button is wired in
`on enter`):

```eligian
action ch5BroadcastPing() [
  // broadcastEvent(eventArgs, eventName): the array first
  broadcastEvent(["#c5-fx-panel"], "tour-ping")
]

on event "tour-ping" action ch5OnPing(target) [   // target ← eventArgs[0]
  selectElement(target)
  addClass("in")
]

action ch5Stamp() [ stampTime("#c5-fx-clock") ]   // a host operation (host.js)

action ch5Dutch() [ broadcastEvent(["nl-NL"], "language-change") ]     // LabelControllers re-render
action ch5English() [ broadcastEvent(["en-US"], "language-change") ]
```

`stampTime` is declared in the program head (`extensions "./host.js" { operation stampTime(selector: string)
function shout }`, Chapter 05) and exported by `host.js`, which writes `new Date().toLocaleTimeString()` into the
element `operationData.selector` names.

---

## 1. Segment beats

The beats play on the raf clock; `space` pauses and resumes, `r` replays the chapter (`replayChapter`: reset the
view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap + code block + spotlight +
callout + effect panel. The chapter is one sequence of labelled items:

```eligian
timeline "Engine Reach" in "#stage" using raf {
  on enter [
    enterChapter("#ch5")
    on click "#c5-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch5")
    on click "#c5-fx-ping" run ch5BroadcastPing() // the live button, wired once per visit
    on click "#c5-fx-lang-nl" run ch5Dutch() // live language switch
    on click "#c5-fx-lang-en" run ch5English()
    selectElement("#c5-fx-label-text") // the span, not the panel: LabelController replaces its element's content
    addController("LabelController", "tour.greeting") // real locales
  ]
  on leave [
    broadcastEvent(["en-US"], "language-change") // the language persists across timelines: back to the default
    with "#c5-fx-ping" { removeControllerFromElement("DOMEventListenerController") }
    with "#c5-fx-lang-nl" { removeControllerFromElement("DOMEventListenerController") }
    with "#c5-fx-lang-en" { removeControllerFromElement("DOMEventListenerController") }
    with "#c5-fx-label-text" { removeControllerFromElement("LabelController") }
    leaveChapter("#ch5", "#c5-to-hub")
  ]

  sequence each [ clearSpots() ] {
    for 7s as b1 [ … ]         // beat 1
    for 8s as b2 [ … ]
    for 9s as b3 [ … ]
    for 8s as b4 [ … ]
    for 8s as b5 [ … ]
    for 8s as b6 [ … ]
    for 9s as b7 [ … ]
    for 8s as b8 [ … ]         // … ch5Stamp() …
    for 8s as b9 [ … ]         // beat 9
  }
}
```

7 + 8 + 9 + 8 + 8 + 8 + 9 + 8 + 8 = **73 s**, the timeline's duration, which the ProgressbarController reads. The
labels `b1` … `b9` are scoped to this timeline.

### Beat 1 — five doors past the clock (0–7 s, `as b1`)

- **Narration:** "Everything so far fired on the clock. A presentation also reacts — to clicks, keys, events, and to
  your own code. That's engine reach."
- **Code** `#c5-code-overview`:
  ```eligian
  broadcastEvent([args], "name")            // 1. the eventbus
  on event "name" action H(p) [ … ]         // 2. react to it
  on click "#btn" run ping()                // 3. interactions
  addController("…Controller", …)           // 4. attach behaviour
  extensions "./host.js" { operation … }    // 5. your own JavaScript
  ```
- **Callout:** `#c5-cl-over` (a block chip on the code block) "five doors past the clock".
- **Effect pane** `#c5-fx-doors`: chips `eventbus` `on event` `interactions` `controllers` `host code`.

### Beat 2 — the eventbus (7–15 s, `as b2`)

- **Narration:** "broadcastEvent puts a message on the engine's bus. Whoever listens for that name reacts: your on
  event handlers, controllers — and the engine itself."
- **Code** `#c5-code-eventbus`:
  ```eligian
  broadcastEvent(["#c5-fx-panel"], "tour-ping")          // eventArgs first, then the name
  broadcastEvent(["Hub", 0], "request-timeline-uri")     // the engine listens: switches to "Hub"
  ```
- **Spot / callout:** `#c5-tok-bcast`; `#c5-cl-bus` "one bus, many listeners; request-timeline-uri is a broadcast the
  engine answers by switching".
- **Effect pane** `#c5-fx-bus`: the ping button and its (hidden) panel; the button is already live.
- **Why "a broadcast":** the engine registers `request-timeline-uri` as an eventbus *listener*
  (`_onEventbusEvent`), not as a request responder; the eventbus requests (`request-engine-root`, `request-action`, …)
  are internal to operations and cannot be reached from `broadcastEvent`. The parameter order is
  `broadcastEvent(eventArgs, eventName, eventTopic?)` (the operation registry).

### Beat 3 — `on event` (15–24 s, `as b3`) ⭐ self-demo

- **Narration:** "An on event action runs when its event fires, not at a time. Click the button: it broadcasts
  tour-ping, and this handler reveals the panel."
- **Code** `#c5-code-onevent`:
  ```eligian
  on event "tour-ping" action ch5OnPing(target) [
    selectElement(target)        // target ← eventArgs[0]
    addClass("in")
  ]

  on event "tour-ping" topic "demo" action ch5OnDemo(target) [ … ]   // topic namespaces the event
  ```
- **Spot / callout:** `#c5-tok-onevent`; `#c5-cl-on` "params map to eventArgs by position · topic "x" namespaces ·
  parentheses optional with no params".
- **Effect pane** `#c5-fx-bus` (REAL): click `#c5-fx-ping` and `#c5-fx-panel` appears. The path is
  `on click "#c5-fx-ping" run ch5BroadcastPing()` (attached in `on enter`) → `broadcastEvent(["#c5-fx-panel"],
  "tour-ping")` → `ch5OnPing` (`target` ← `eventArgs.0`) → `addClass("in")`. The button works from the moment the
  chapter is entered, so a click in this beat always answers; the listener is removed in `on leave`, so a second visit
  still has one listener: one click, one reveal.
- The `topic` line is display only (the tour has one `tour-ping` handler); it passes `check` next to the real handler.

### Beat 4 — interactions (24–32 s, `as b4`) **new**

- **Narration:** "on &lt;event&gt; on an element runs a verb: navigate, play, pause, toggle, stop, seek, or run an
  action. The hub cards and this button are written that way." (The narration is written with `&lt;` / `&gt;`:
  `narrate` writes HTML, so a literal `<event>` would be an element.)
- **Code** `#c5-code-interact`:
  ```eligian
  on click "#card-ch1" navigate "Timeline & Time"      // switch timelines
  on click "#card-ch3" navigate "Logic" at b4.start    // a position: the target's labels
  on click "#c5-fx-ping" run ch5BroadcastPing()        // start an action
  on click "#play" toggle                              // play · pause · toggle · stop
  on dblclick "#stage" seek intro.end                  // labels of this timeline
  ```
- **Spot / callout:** `#c5-tok-run` (on `run`); `#c5-cl-interact` "any DOM event name; run arguments must be
  compile-time values; the action starts with eventTarget, eventKey and its arguments — nothing from the surrounding
  block".
- **Effect pane** `#c5-fx-interact`: chips `click → navigate` `click → run`.
- **Real code:** the chapter's own `on enter` (the back button, the ping button, the language buttons) and the hub's
  cards. The `toggle`, `seek` and `navigate … at` lines are display only. Each `on <event>` compiles to
  `selectElement` + `getControllerInstance("DOMEventListenerController")` + `addControllerToElement`; `navigate`
  runs a generated action that broadcasts `request-timeline-uri` (`__nav__hub_4717fc8c` for `"Hub"`), the verbs a
  generated `__on__<verb>` action (`__on__toggle`), and `run` the action itself with its arguments as
  `actionOperationData`. A runtime argument is an error (re-captured with `eligian check`):
  `A 'run' argument must be known when the listener is attached (a literal or constant): 'x' is a runtime value`
  (`run_runtime_argument`).

### Beat 5 — keys (32–40 s, `as b5`) **new**

- **Narration:** "on key binds keyboard shortcuts — Escape takes you to the hub, space pauses, r replays, in every
  chapter."
- **Code** `#c5-code-keys`:
  ```eligian
  on key "Escape" navigate "Hub"
  on key "space" toggle
  on key "r" run replayChapter("#ch5")                 // reset, then seek 0s
  on key "shift+right, pagedown" seek intro.end        // hotkeys syntax
  on key "Escape" in "#dialog" stop                    // only while focus is inside #dialog
  ```
- **Spot / callout:** `#c5-tok-key` (on the first `key`); `#c5-cl-keys` "a KeyboardController; unknown names are
  errors; input fields are ignored".
- **Effect pane** `#c5-fx-keys`: key caps (`.keycap`) `Esc` `␣` `r`.
- **Real code:** the first three lines are this chapter's own (every chapter has them); the last two are display
  only. Without `in`, the KeyboardController sits on the timeline container (`#stage`), which is why `leaveChapter`
  removes three KeyboardControllers there. An unknown key name reports
  `Unknown key 'foo' in "foo". Use key names such as "ArrowRight", "space", "Enter", "Escape", "PageDown", "F1", a letter or digit, joined to modifiers (shift, alt, ctrl, meta) with '+' and separated by ','`
  (`unknown_key`). The KeyboardController ignores presses in `input`, `select`, `textarea` and contenteditable
  elements (its documentation in the engine).

### Beat 6 — controllers (40–48 s, `as b6`)

- **Narration:** "Under both forms sits a controller: lasting behaviour attached to a selected element. This is what
  on click desugars to — one of nine."
- **Code** `#c5-code-controller`:
  ```eligian
  selectElement("#c5-fx-ping")
  addController("DOMEventListenerController", "click", ["ch5BroadcastPing"])   // positional: event, then actions
  // on leave:
  removeControllerFromElement("DOMEventListenerController")
  ```
- **Spot / callout:** `#c5-tok-ctrl`; `#c5-cl-ctrl` "DOMEventListener · Keyboard · Label · Lottie · MutationObserver ·
  Navigation · Progressbar · Routing · Subtitles".
- **Effect pane** `#c5-fx-ctrl`: nine chips, one per controller.
- **Positional parameters:** `addController(name, …params)` takes the controller's parameters in order after the name.
  The object form `addController("DOMEventListenerController", { eventName: "click", actions: [...] })` compiles
  without an error to the wrong data (`eventName: { eventName: …, actions: … }`), so the snippet uses the positional
  form. The engine never detaches a controller on a timeline switch; `removeControllerFromElement` removes one
  controller of that name from the selected element, which is what every `on leave` of the tour does.

### Beat 7 — locales (48–57 s, `as b7`) ⭐ self-demo

- **Narration:** "locales make text translatable: a LabelController renders a key in the active language. This label —
  and the hub title — are real ones: click nl-NL and it switches."
- **Code** `#c5-code-label`:
  ```eligian
  locales "./locales.json"                            // every language, keyed by code

  selectElement("#c5-fx-label-text")
  addController("LabelController", "tour.greeting")   // the key is validated against the file
  on click "#c5-fx-lang-nl" run ch5Dutch()            // broadcastEvent(["nl-NL"], "language-change")
  ```
- **Spot / callout:** `#c5-tok-loc`; `#c5-cl-loc` "completion and did-you-mean on the key; Chapter 07 has the editor".
- **Effect pane** `#c5-fx-label` (REAL): `span#c5-fx-label-text`, filled by the LabelController `on enter` attached
  (`Hello from a LabelController`), and the sibling buttons `button#c5-fx-lang-en` (`en-US`) and
  `button#c5-fx-lang-nl` (`nl-NL`). A click on `nl-NL` runs `ch5Dutch`, whose `language-change` broadcast makes the
  engine's LocaleEventbusAdapter set the locale; every LabelController re-renders, so the span reads
  `Hallo van een LabelController`. The controller sits on the span, not on the panel, because it renders with
  `selectedElement.html(text)`, which would wipe the buttons. `on leave` broadcasts `language-change` with `en-US`,
  so the hub title is English again.
- **`locales.json`** (one file, every language keyed by its code): `en-US` / `nl-NL` with `hub.title`, `hub.tagline`
  (the hub's LabelControllers) and `tour.greeting`. A typo in the key reports
  `Unknown translation key: 'tour.greetin'. Did you mean: 'tour.greeting'?` (`unknown_label_id`).

### Beat 8 — host code (57–65 s, `as b8`) **new**

- **Narration:** "Your own JavaScript reaches in too: a host operation is called like a built-in. This clock was
  stamped by host.js just now."
- **Code** `#c5-code-host`:
  ```eligian
  extensions "./host.js" { operation stampTime(selector: string) }

  action ch5Stamp() [ stampTime("#c5-fx-clock") ]
  ```
- **Spot / callout:** `#c5-tok-host` (on `stampTime` in the declaration); `#c5-cl-host` "bundled by --bundle, dev,
  smoke and the preview (trusted workspaces)".
- **Effect pane** `#c5-fx-host` (REAL): `span#c5-fx-clock.fx-chip`, `--:--:--` until the beat calls `ch5Stamp()`,
  then the local time of that moment. The beat writes the time each time it starts, so a replay needs no reset for
  it. In an untrusted VS Code workspace the preview registers a stand-in that does nothing, so the chip keeps its
  placeholder there.

### Beat 9 — recap (65–73 s, `as b9`)

- **Narration:** "Eventbus, on event, interactions, controllers, locales, host code — the hub, its title and every
  click you made were built from these. Hub."
- **Code** `#c5-code-recap`:
  ```eligian
  on click "#card-ch1" navigate "Timeline & Time"   // ← every card you clicked
  addController("LabelController", "hub.title")     // ← the hub title you read
  on key "Escape" navigate "Hub"                    // ← the way back
  ```
- **Spot:** `#c5-tok-recap` (on `navigate`).
- **Effect pane** `#c5-fx-done`: "Chapter 6 ✓".
- **Real code:** the three lines are the hub's own (`timeline "Hub"`'s `on enter`) and every chapter's.

---

## 2. What this chapter must prove (acceptance)

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass;
   `smoke` reports `timeline 'Engine Reach': 10 positions ok` (the beat boundaries 0–73 s; `ch5Stamp` runs the
   bundled `host.js` in jsdom), and the compiled timeline's duration is 73 s.
2. The controller-balance test (`tour-controllers.spec.ts`) passes: `on leave` removes exactly the controllers
   `on enter` adds (eight DOMEventListener / Keyboard / Progressbar controllers of the skeleton and the chapter, plus
   the LabelController on `#c5-fx-label-text`).
3. In the browser: a click on the ping button during beat 3 reveals the panel; leaving and re-entering, a click is
   still one reveal. A click on `nl-NL` makes the label read `Hallo van een LabelController` and the language buttons
   stay; leaving shows the hub title in English. `#c5-fx-clock` shows a time at 57 s.
4. Every displayed snippet passes `eligian check --max-warnings 0` and `eligian smoke` in a scratch program, copied
   verbatim from `layout.html`, with each `…` filled with a body, against copies of the tour's `layout.html` (plus
   `#btn`, `#play` and `#dialog`), `tour.css`, `presentation.eligian`, `locales.json` and `host.js`; the interactions
   and keys snippets sit in an `on enter`, next to timelines `"Hub"`, `"Timeline & Time"` and `"Logic"` (with a label
   `b4`) and a label `intro` in their own timeline.
5. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit.

## 3. Verified in-engine and dogfooding finds

- **Compiled lifecycle** (re-checked in the compiled config): `on enter` adds the back button's listener, three
  KeyboardControllers on `#stage` (`Escape` → `__nav__hub_4717fc8c`, `space` → `__on__toggle`, `r` →
  `replayChapter` with `{ view: "#ch5" }`), the listeners on `#c5-fx-ping` (`ch5BroadcastPing`), `#c5-fx-lang-nl`
  (`ch5Dutch`) and `#c5-fx-lang-en` (`ch5English`) and the LabelController (`translationKey: "tour.greeting"`) on
  `#c5-fx-label-text`; `on leave` starts with `broadcastEvent { eventArgs: ["en-US"], eventName: "language-change" }`,
  removes the four chapter controllers and calls `leaveChapter`.
- **Live language switch:** settled from the engine source: the `language-change` broadcast makes the
  LocaleEventbusAdapter call `setLocale`, and LabelController re-renders on it; the preview's language picker sends
  the same broadcast. The language then persists across timelines, hence the switch back in `on leave`.
- **Host operation:** `smoke` bundles `host.js` with esbuild and plays beat 8 in jsdom (`toLocaleTimeString` works
  there).
- **History (kept as history):** two bugs were found and fixed while the first version of this chapter was built
  (see `KNOWN_ISSUES.md`):
  - **C8** 🔴 — event-action params compiled to `$operationData.eventArgs[n]` (bracket), which eligius cannot resolve
    → any handler reading an event arg threw at runtime. Fixed to dot-index `eventArgs.n`.
  - **V1** 🟠 — `on event` rejected any non-engine event name, blocking custom application events. Relaxed to allow a
    custom name that the program broadcasts itself (`tour-ping`).
  The first version also wired the button in beat 4 (a beat after the narration asked for the click, and again on
  every seek into beat 4) and showed the LabelController as an illustration only; both are replaced by the
  `on enter` wiring and the real `locales.json`.

## 4. Resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave.
- **Scope:** five doors (eventbus, `on event`, interactions + `on key`, controllers, host code) plus locales. Library
  imports and the `extensions` declaration itself are Chapter 05's subjects; this chapter calls the host operation.
- **Effect-pane fidelity:** Beats 3, 7 and 8 are real (the ping round-trip, the LabelController with the live language
  switch, the host clock); Beats 4, 5 and 9 point at the chapter's and the hub's own lines; the panels of Beats 1, 2,
  4, 5 and 6 are illustrative, revealed by `demo`.
- **The language goes back to en-US on leave**, so the hub and the other chapters never inherit Dutch.
- **Timeline name / uri:** `"Engine Reach"` (the string name is the `navigate` uri). Hub card label: "Engine Reach".

## 5. Files

```
examples/eligian-tour/
├── tour.eligian    # ch5BroadcastPing, ch5OnPing, ch5Stamp, ch5Dutch, ch5English, the "Engine Reach" timeline
│                   #   (on enter / on leave per §1); hub card #card-ch5 + key 6 (and their removals in hubUnwire)
├── layout.html     # #ch5: chrome, nine code blocks, eight effect panels (+ the done card), eight callout chips
├── tour.css        # anchors (#c5-tok-*), fallback rows 1–8, .keycap, the #c5-fx-label layout, .ping-btn
├── locales.json    # en-US / nl-NL: hub.title, hub.tagline, tour.greeting
└── host.js         # the host module: operations.stampTime (beat 8), functions.shout
```

`presentation.eligian` is unchanged.
