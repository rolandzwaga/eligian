---
operation: getControllerFromElement
card: "Finds a controller that is attached to the selected element by its name and puts it in controllerInstance: getControllerFromElement(controllerName). It does not create one: addController attaches it first. When no controller of that name is attached it logs a console warning and controllerInstance is undefined."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action flip [
  selectElement("#box")
  toggleClass("active")
]

action inspectListener [
  selectElement("#next")
  getControllerFromElement("DOMEventListenerController")
  log($operationdata.controllerInstance, "listener")
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#next")
    addController("DOMEventListenerController", "click", ["flip"])
  ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
    selectElement("#box")
    removeClass("active")
  ]
  at 0s..1s inspectListener()
}
```

## Idioms

- Select the element the controller was added to, then look it up under the same name that
  `addController` used.
- To call a method on it, copy it into `instance` with
  `setOperationData({ instance: $operationdata.controllerInstance })`, then
  `invokeObjectMethod(…)`.

## Pitfalls

- It needs `selectedElement`; it reads the controllers of the first selected element only.
- A missing controller does not throw: the next operation gets an undefined
  `controllerInstance`. Look it up after the `addController` has run (`on enter` runs first).
- It erases `controllerName`; `controllerInstance` stays until it is overwritten, by an
  `addController` too.
