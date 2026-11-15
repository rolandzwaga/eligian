---
id: map-controllers
title: "Controllers"
kind: mapping
use_cases:
  - "addController"
see:
  - "controllers"
  - "map-events-and-interactions"
card: "addController attaches; the engine never detaches: remove in on leave."
---

## Attach, then detach

A controller attaches to the selected element and stays there until it is removed. The
`addController` statement is Eligian sugar:

```
selectElement("<selector>")
addController("<ControllerName>", <parameter 1>, <parameter 2>, ...)
```

It compiles to `getControllerInstance` with the controller's name, then
`addControllerToElement` with each argument stored under its parameter name. The parameters
are positional, in the order the `controllers` chunk lists for each controller; `check` reports
an unknown controller, a missing required parameter and too many arguments.

`removeControllerFromElement("<ControllerName>")` removes one controller of that name from the
selected element. Controllers are not detached when the timeline changes, so the pattern is:

- attach in `on enter` (or in the start list of a covering range);
- remove in `on leave` (or in the matching end list), on the same element, once per controller
  attached. `with "<selector>" { ... }` selects and runs the removals in one statement.

`check` reports a timeline whose `on enter` and `on leave` do not balance as
`controller-imbalance`, with a quick fix that inserts the missing removals.

## Listener controllers run actions by name

`DOMEventListenerController` (a DOM event) and `KeyboardController` (keys) take an `actions`
list of action names. Each listed action starts with a copy of `actionOperationData` plus
`eventTarget` (and `eventKey` for keys); they run in order, each receiving the data the previous
one returned. By default the start operations run; the prefix `end:` runs the end operations of
an endable action instead. That gives a hover pair without any timeline range:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action spotlight(selector: string) [
  selectElement(selector)
  addClass("highlight")
] [
  selectElement(selector)
  removeClass("highlight")
]

timeline "Hover" in "#stage" using raf {
  on enter [
    selectElement("#box")
    addController("DOMEventListenerController", "mouseenter", ["spotlight"], { selector: "#title" })
    addController("DOMEventListenerController", "mouseleave", ["end:spotlight"], { selector: "#title" })
  ]
  on leave [
    with "#box" {
      removeControllerFromElement("DOMEventListenerController")
      removeControllerFromElement("DOMEventListenerController")
    }
  ]
}
```

Read the output: the lifecycle action selects `#box` once and attaches two listeners (the
selection persists between them); `on leave` removes both. The `on click` / `on key`
interactions of `map-events-and-interactions` generate exactly these operations for you;
write `addController` yourself when you need several actions in one listener, the `end:`
prefix, `actionOperationData`, or a controller with no interaction syntax.

## KeyboardController precedence

The KeyboardController metadata of the installed Eligius states: presses in `input`, `select`,
`textarea` and contenteditable elements are ignored; a held key runs the actions once; when the
keys include the engine's play toggle hotkey (space by default) or a key its KeyboardStepSource
binds (the arrow keys, `home`, `end`), the controller wins and playback is not toggled or
stepped. With `scope` `"element"` the keys only work while the focus is inside the selected
element.

## Status

- `RoutingController`: **do-not-use**; its metadata says it is a work in progress.
- `LottieController`: **constrained**; `lottie-web` is an optional peer dependency of Eligius
  that the Eligian CLI does not ship.
- The others (`LabelController`, `MutationObserverController`, `NavigationController`,
  `ProgressbarController`, `SubtitlesController` and the two listeners) carry no status line;
  check each one's needs in the `controllers` chunk (`ProgressbarController` also needs
  `textElement`).
