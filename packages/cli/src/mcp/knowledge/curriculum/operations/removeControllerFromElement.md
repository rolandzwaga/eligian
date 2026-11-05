---
operation: removeControllerFromElement
card: "Detaches one controller of the given name from the selected element. The engine never detaches controllers on a timeline switch, so pair every addController in on enter with one of these in on leave, on the same element."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action ping [
  log("ping")
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#next")
    addController("DOMEventListenerController", "click", ["ping"])
  ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
  at 0s..5s [
    selectElement("#box")
    addClass("visible")
  ] [
    selectElement("#box")
    removeClass("visible")
  ]
}
```

## Idioms

- `on enter` adds, `on leave` removes: one `removeControllerFromElement` per controller,
  after selecting the same element the controller was added to.
- `with "#next" { removeControllerFromElement("DOMEventListenerController") }` when there
  is nothing else to do on that element.
- The same pairing works in an event's start and end blocks for a controller that should
  only live during that range.

## Pitfalls

- It needs `selectedElement`: an `on leave` block starts empty, so select first.
- It removes **one** controller of that name. Two adds need two removes.
- A name that is not attached to the element only logs a warning (`controller for name '…'
  was not found on the given element`); `eligian_smoke` reports console warnings.
- A missing removal is the `controller-imbalance` review warning: listeners pile up on every
  visit of the timeline. Its quick fix inserts the removal.
