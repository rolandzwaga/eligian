---
operation: getControllerInstance
card: "Creates a new instance of the controller registered under the name and puts it in controllerInstance: getControllerInstance(systemName). You rarely write it: addController(name, …) compiles to getControllerInstance + addControllerToElement. Throws when no controller is registered under the name."
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
    addController("DOMEventListenerController", "click", ["flip"])
  ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
    selectElement("#box")
    removeClass("active")
  ]
}
```

The compiled `on enter` shows the pair `addController` writes: `getControllerInstance` with
`systemName`, then `addControllerToElement` with the controller's parameters.

## Idioms

- Attach controllers with `addController`: it writes this pair, `check` validates the
  controller's parameters, and the controller balance checks see it.
- To reach a controller that is already attached, use `getControllerFromElement`.

## Pitfalls

- Every call creates a new instance; it is not the one attached to an element.
- The name must be a registered controller (a built-in one, or one declared in an
  `extensions` block); an unknown name throws at runtime, naming `getControllerInstance` and
  the name.
- It erases `systemName`.
