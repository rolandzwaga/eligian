---
operation: extendController
card: "Copies the properties of an object onto the controller instance in the operation data: extendController(controllerExtension), after getControllerFromElement or getControllerInstance provided controllerInstance. Eligian object literals hold data only, so it can set fields, not add behaviour; for new behaviour declare a host controller."
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
    getControllerFromElement("DOMEventListenerController")
    extendController({ role: "pager" })
    log($operationdata.controllerInstance, "listener")
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

- An attached controller: `selectElement(…)`, `getControllerFromElement("<Name>")`, then
  `extendController({ … })`.
- A fresh one: `getControllerInstance("<Name>")`, `extendController({ … })`, then
  `addControllerToElement()`.
- A field the controller reads later (at its next event) changes what it does from then on.
- Most controllers take their settings as `addController` arguments: prefer those.

## Pitfalls

- It needs `controllerInstance`; without a `getController…` call before it, `check` reports
  the missing dependency.
- Nothing checks the keys against the controller: a misspelled field is simply added, an
  existing one overwritten.
- The keys `__proto__`, `prototype` and `constructor` throw at runtime.
- The engine never detaches a controller on a timeline switch: remove the one you added in
  `on leave`.
