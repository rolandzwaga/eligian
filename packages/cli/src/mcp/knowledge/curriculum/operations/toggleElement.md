---
operation: toggleElement
card: "Shows the selected element(s) when hidden, hides them when visible (jQuery toggle(), the inline display style). No arguments. Fits click and key handlers; in timeline ranges prefer addClass / removeClass or setStyle, which give the same result after a seek."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action flipPanel [
  selectElement("#panel")
  toggleElement()
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#next")
    addController("DOMEventListenerController", "click", ["flipPanel"])
  ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
    selectElement("#panel")
    setStyle({ display: "" })
  ]
}
```

## Idioms

- A handler action that shows and hides a panel: `selectElement(…)`, `toggleElement()`,
  attached with a listener controller or an interaction (`on click "#next" run flipPanel()`).
- Reset in `on leave` with `setStyle({ display: "" })`, which removes the inline style, so a
  re-entry starts from the stylesheet's state.

## Pitfalls

- It needs `selectedElement`.
- The result depends on the current state: a start block that toggles and a seek that re-runs
  it show and hide twice. Ranges that should show a state use explicit classes or styles.
- It writes the inline `display` style, which wins over the stylesheet's classes until it is
  removed.
