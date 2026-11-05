---
operation: toggleClass
card: "Adds a class to the selected element(s) when absent, removes it when present. Fits click and key handlers that flip a state; in timeline ranges prefer explicit addClass / removeClass, which stay right after a seek."
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

## Idioms

- A handler action that flips one state: `selectElement(…)` then `toggleClass(…)`, attached
  with a listener controller or an interaction (`on click "#next" run flip()`).
- `with "#box" { toggleClass("active") }` inside a `sequence … then [ … ]` postlude.
- Reset with `removeClass` in `on leave`, so a re-entry starts from a known state.

## Pitfalls

- It needs `selectedElement`.
- The result depends on the current state: a start block that toggles and a seek that
  re-runs it flip the class twice. Ranges that should show a state use `addClass` and
  `removeClass`.
- One class name, without a leading dot; it must exist in an imported stylesheet.
