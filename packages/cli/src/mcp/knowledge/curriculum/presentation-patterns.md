---
id: presentation-patterns
title: "Presentation patterns"
kind: workflow
use_cases:
  - "deck, replay, progress, stagger"
see:
  - "decisions"
  - "map-events-and-interactions"
  - "map-event-actions"
  - "map-locales-and-languages"
  - "runtime-scheduling"
card: "Ten recipes: hub, deck, replay, auto-advance, next/previous, progress, stagger, typewriter, counter, language."
---

# Presentation patterns

Ten recipes, each with a probe whose compiled JSON follows it. The probes use the shared probe layout (`#stage`, `#title`, `#panel`, `#box`, `#next`) and its classes (`visible`, `active`, `highlight`); in a project, use your own ids and `is-` state classes (`css-conventions`). Every probe passes `eligian_check` with 0 warnings: whatever `on enter` wires, `on leave` removes.

## Hub and chapters

A hub timeline with no timed events waits for a click; each chapter is a timeline with a way back. The `chapters` starter is this pattern.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Hub" in "#stage" using raf {
  on enter [
    selectElement("#panel")
    addClass("visible")
    on click "#next" navigate "Chapter"
  ]
  on leave [
    selectElement("#panel")
    removeClass("visible")
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
}

timeline "Chapter" in "#stage" using raf {
  on enter [ on key "Escape" navigate "Hub" ]
  on leave [
    selectElement("#stage")
    removeControllerFromElement("KeyboardController")
  ]
  at 0s..4s target "#title" [ addClass("visible") ] [ removeClass("visible") ]
}
```

## Keyboard deck

One timeline per slide; each slide's `on enter` binds the arrow keys to its neighbours by name. An `on key` without `in` puts its KeyboardController on the timeline's container, so `on leave` removes it there.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Slide 1" in "#stage" using raf {
  on enter [
    selectElement("#title")
    addClass("visible")
    on key "ArrowRight" navigate "Slide 2"
  ]
  on leave [
    selectElement("#title")
    removeClass("visible")
    selectElement("#stage")
    removeControllerFromElement("KeyboardController")
  ]
}

timeline "Slide 2" in "#stage" using raf {
  on enter [
    selectElement("#box")
    addClass("visible")
    on key "ArrowLeft" navigate "Slide 1"
  ]
  on leave [
    selectElement("#box")
    removeClass("visible")
    selectElement("#stage")
    removeControllerFromElement("KeyboardController")
  ]
}
```

## Replay: reset, then seek

`navigate` to the current timeline does nothing, and a seek to 0 keeps state that earlier ranges left behind (a range without an end block, such as the `#box` beat below). Replay is an action that undoes that state and then broadcasts `timeline-seek-request` with `[0]`. The same reset runs in `on leave`.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action resetView() [
  selectElement("#box")
  removeClass("visible")
]

action replay() [
  resetView()
  broadcastEvent([0], "timeline-seek-request")
]

timeline "Intro" in "#stage" using raf {
  on enter [ on click "#next" run replay() ]
  on leave [
    resetView()
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
  at 1s..2s target "#box" [ addClass("visible") ]
  at 2s..4s target "#title" [ addClass("visible") ] [ removeClass("visible") ]
}
```

## Auto-advance

`timeline-complete` carries no arguments, so nothing says where to go next. Give the timeline a last beat whose start block broadcasts `request-timeline-uri` with the target's name (for a media timeline, its `from` path) and a position.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Part 1" in "#stage" using raf {
  on enter [
    selectElement("#panel")
    addClass("visible")
  ]
  on leave [
    selectElement("#panel")
    removeClass("visible")
  ]
  at 0s..4s target "#title" [ addClass("visible") ] [ removeClass("visible") ]
  at 4s..5s [ broadcastEvent(["Part 2", 0], "request-timeline-uri") ]
}

timeline "Part 2" in "#stage" using raf {
  at 0s..3s target "#box" [ addClass("visible") ] [ removeClass("visible") ]
}
```

## Relative next and previous

There is no relative seek. Wire the button inside each labelled range: its start block binds `#next` to the following label, its end block removes that listener, so the button always means "the step after this one".

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Steps" in "#stage" using raf {
  at 0s for 4s as first target "#title" [
    addClass("visible")
    on click "#next" seek second.start
  ] [
    removeClass("visible")
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
  at first.end for 4s as second target "#box" [
    addClass("visible")
    on click "#next" seek first.start
  ] [
    removeClass("visible")
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
}
```

## Progress bar

`ProgressbarController` sets its element's CSS `width` to the timeline's progress in percent and seeks when the parent element is clicked. It follows pause, seek and timeline switches.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Story" in "#stage" using raf {
  on enter [
    selectElement("#box")
    addController("ProgressbarController")
  ]
  on leave [
    selectElement("#box")
    removeControllerFromElement("ProgressbarController")
  ]
  at 0s..10s target "#title" [ addClass("visible") ] [ removeClass("visible") ]
}
```

## Staggered list

`stagger <delay> [items] for <duration> [ start ] [ end ]` makes one range per item, each `delay` later; `@@item` is the item. `at` anchors the first item. The other form, `stagger 200ms [...] with reveal() for 2s`, passes each item as the action's first argument.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "List" in "#stage" using raf {
  stagger 400ms ["#title", "#box", "#next"] at 1s for 3s [
    selectElement(@@item)
    addClass("visible")
  ] [
    selectElement(@@item)
    removeClass("visible")
  ]
}
```

## Typewriter

A CSS animation on a state class, added for the range: in `styles.css`, `.typing { overflow: hidden; white-space: nowrap; animation: type 1.5s steps(24) both; }` with `@keyframes type { from { width: 0; } to { width: 24ch; } }`. In the probe, `active` stands for `typing`.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Type" in "#stage" using raf {
  at 0s..3s target "#title" [ addClass("active") ] [ removeClass("active") ]
}
```

## Counter

One range per value, back to back, each writing its value: after any seek the element shows the value of the range that covers the position.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Count" in "#stage" using raf {
  stagger 500ms ["1", "2", "3", "4"] for 500ms [
    selectElement("#box")
    setElementContent(@@item)
  ]
}
```

## Language toggle

The engine changes language on the broadcast `language-change` with the language code; every `LabelController` re-renders. Put the broadcast in an action and call it with `on click … run`. With a `locales` import, label elements with `addController("LabelController", "<key>")` in `on enter`.

```eligian probe
languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
}

styles "./probe.css"
layout "./probe-layout.html"

action setLanguage(code: string) [
  broadcastEvent([code], "language-change")
]

timeline "Main" in "#stage" using raf {
  on enter [ on click "#next" run setLanguage("nl-NL") ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
}
```

see: decisions, map-events-and-interactions, map-event-actions, map-locales-and-languages, runtime-scheduling
