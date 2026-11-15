---
operation: addControllerToElement
card: "The raw half of addController: attaches the controllerInstance in the bag (from getControllerInstance) to the selected element. It takes no arguments; the controller reads its parameters from the operation data. In Eligian write addController(\"<Name>\", …), which writes both operations and the parameters."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action flip [
  selectElement("#box")
  toggleClass("active")
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#next")
    getControllerInstance("DOMEventListenerController")
    setOperationData({ eventName: "click", actions: ["flip"] })
    addControllerToElement()
  ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
    selectElement("#box")
    removeClass("active")
  ]
}
```

## Idioms

- Prefer `addController("DOMEventListenerController", "click", ["flip"])`: it compiles to
  `getControllerInstance` plus this operation with the parameters in its `operationData`,
  and `check` validates the name and the arguments against the controller's card.
- The raw form is `selectElement`, `getControllerInstance("<Name>")`, the parameters in the
  bag (`setOperationData({ … })`), then `addControllerToElement()`.
- Detach in `on leave` or the end block with `removeControllerFromElement("<Name>")`.

## Pitfalls

- It needs `selectedElement` and `controllerInstance`; neither is erased, so both stay in
  the bag afterwards.
- The controller is registered only after its `init` and a synchronous `attach` succeed; when
  `attach` returns a promise that rejects, it is removed from the element again.
- Without the removal, every visit of the timeline attaches another instance.
