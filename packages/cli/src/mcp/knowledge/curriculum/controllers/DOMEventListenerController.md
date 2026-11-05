---
controller: DOMEventListenerController
status: recommended
card: "Runs actions by name on a DOM event of the selected element. Prefer the on click / on <event> interactions, which generate it; write addController yourself for several actions in one listener, the end: prefix or actionOperationData. Remove it in on leave: a timeline switch does not detach it."
---

## Call

Select the element, then attach the listener with the event name and the action names:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action reveal(selector: string) [
  selectElement(selector)
  addClass("visible")
]

timeline "Listener" in "#stage" using raf {
  on enter [
    selectElement("#next")
    addController("DOMEventListenerController", "click", ["reveal"], { selector: "#box" })
  ]
  on leave [
    with "#next" { removeControllerFromElement("DOMEventListenerController") }
  ]
}
```

## Idioms

- `on click "#next" run reveal("#box")` and the other interactions of
  `map-events-and-interactions` compile to this controller; use them when one verb is enough.
- Each listed action starts with a copy of `actionOperationData` plus `eventTarget`; the actions
  run in order, each receiving the data the previous one returned.
- `"end:<action>"` runs the end operations of an endable action: a `mouseenter` / `mouseleave`
  pair needs no timeline range.

## Pitfalls

- The action names are checked: an unknown name is `unknown-listener-action`.
- One `removeControllerFromElement` removes one listener: remove as many as you attached, on the
  same element, or `check` reports `controller-imbalance`.
- When an action fails, the remaining actions of that event are skipped.
