---
operation: addController
card: "Eligian sugar: attaches a controller to the selected element (getControllerInstance + addControllerToElement). The first argument is the controller name, the rest its parameters in the order of its card. Remove it in on leave or the end block with removeControllerFromElement."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action ping [
  selectElement("#box")
  toggleClass("active")
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
    selectElement("#title")
    addClass("visible")
  ] [
    selectElement("#title")
    removeClass("visible")
  ]
}
```

## Idioms

- `addController("<Name>", …)`: the parameters after the name follow the controller's card
  (`controllers`, or `eligian_operations` for one controller); `check` validates the name
  and the number of arguments.
- `on enter` attaches, `on leave` detaches. For a click or a key that plays, seeks,
  navigates or runs an action, prefer an interaction (`on click "#next" play`,
  `on key "ArrowRight" …`): it writes the listener controller and its action for you.
  It still adds a controller, so remove it in `on leave` too.
- The action names in a listener's action list must be actions of the program
  (`unknown-listener-action`).

## Pitfalls

- Most controllers need `selectedElement`: select before the call.
- The engine never detaches controllers on a timeline switch; without the removal they pile up
  on every visit (`controller-imbalance`).
- The controller name is a string literal of a known controller; check its status in
  `controllers` before using it.
