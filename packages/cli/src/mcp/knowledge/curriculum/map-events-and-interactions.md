---
id: map-events-and-interactions
title: "Events and interactions"
kind: mapping
use_cases:
  - "click to navigate"
see:
  - "events"
  - "map-controllers"
card: "on click / on key add controllers (remove in on leave); on event actions."
---

## Interactions: DOM events and keys

An interaction is an operation statement; it works in any block, and belongs in `on enter`:

```
on <dom event> "<selector>" <verb>
on key "<keys>" (in "<selector>")? <verb>
```

| Verb | Runs |
| --- | --- |
| `navigate "<timeline>" (at <time>)?` | switch to that timeline of the program |
| `play` / `pause` / `toggle` / `stop` | playback of the current timeline |
| `seek <time>` | seek the current timeline (its own labels allowed: `seek intro.end`) |
| `run <action>(<args>)` | start an action of the program, with constant arguments |

Each statement compiles to three operations: `selectElement` (the listened-to element; for
`on key`, the `in` element or else the timeline's container), `getControllerInstance` and
`addControllerToElement`. The listener runs a named action: for `navigate`, `play`, `seek` and
friends a generated action (`__nav__...`, `__on__...`) that broadcasts the engine request;
for `run` your own action, with the arguments in `actionOperationData`.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action flash(selector: string) [
  selectElement(selector)
  toggleClass("highlight")
]

timeline "Deck" in "#stage" using raf {
  on enter [
    on click "#next" navigate "End"
    on key "space" toggle
    on click "#box" run flash("#title")
  ]
  on leave [
    with "#next" { removeControllerFromElement("DOMEventListenerController") }
    with "#box" { removeControllerFromElement("DOMEventListenerController") }
    with "#stage" { removeControllerFromElement("KeyboardController") }
  ]
  at 0s..4s as intro target "#title" [ addClass("visible") ] [ removeClass("visible") ]
}

timeline "End" in "#stage" using raf {
  on enter [ on key "ArrowLeft" navigate "Deck" at intro.end ]
  on leave [ with "#stage" { removeControllerFromElement("KeyboardController") } ]
}
```

Read the output: `navigate "End"` became the action `__nav__end_...` broadcasting
`request-timeline-uri` with `["End", 0]`; `navigate "Deck" at intro.end` resolved the label of
the target timeline to 4. `on key` selected `#stage`, the container. `run flash("#title")`
stored `{ selector: "#title" }` as `actionOperationData`.

## Rules

- A listener action starts with only `eventTarget`, `eventKey` and its arguments, so a `run`
  action selects its own element. Its arguments must be known at compile time (literals and
  constants, not parameters or loop items).
- `navigate` targets must be timeline names of the program; positions are constant times, and
  labels come from the target timeline.
- The engine does not detach controllers when the timeline changes. Remove every listener of
  `on enter` in `on leave`, one `removeControllerFromElement` per listener on the same element;
  `check` warns `controller-imbalance` otherwise.
- `on key` keys use hotkeys-js names (`right`, `space`, `esc`) or `KeyboardEvent.key` names
  (`ArrowRight`, `Escape`), comma separated, with `+`-joined modifiers.
- `keydown` on an element fires only while it has focus; use `on key` for keys.

## Event actions: listening to the eventbus

```eligian
on event "timeline-complete" action ShowDone [
  selectElement("#title")
  setElementContent("The end")
]
```

An event action runs whenever the engine (or a `broadcastEvent`) fires that event. The name must
be one of the Eligius events (the `events` chunk lists them with their arguments); the
parameters receive the event's `eventArgs` by position. An event action compiles to an entry
of `eventActions` (not shown by the probes above) and starts with only `eventArgs`. It is
declared at the top level of the program, outside every timeline. Use `topic "<name>"` to give
one event several handlers.

Choose: an interaction for a user gesture on an element or a key; an event action to react to
the engine (`timeline-complete`, `language-change`); `broadcastEvent` to fire an event from an
operation list.
