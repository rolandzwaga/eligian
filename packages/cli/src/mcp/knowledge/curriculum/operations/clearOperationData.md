---
operation: clearOperationData
card: "Empties the operation data: clearOperationData() removes every property, the selection included; clearOperationData([\"name\", …]) removes only the listed ones. Eligian keeps an action's parameters alive across a bare clear when the block still uses them."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action relabel(selector: string, text: string) [
  selectElement(selector)
  addClass("active")
  clearOperationData()
  selectElement(selector)
  setElementContent(text)
]

timeline "main" in "#stage" using raf {
  at 0s..2s relabel("#box", "Ready")
  at 2s..4s [
    concatenateStrings(["Step", "two"], " ")
    clearOperationData(["result"])
    selectElement("#box")
    removeClass("active")
  ]
}
```

## Idioms

- `clearOperationData(["result", "calculationResult"])` drops intermediate outputs and keeps
  the selection.
- In an action, a bare `clearOperationData()` before later uses of a parameter compiles to a
  `setOperationData` with `override` that keeps only the parameters still needed.

## Pitfalls

- After a bare clear, `selectedElement` is gone: select again before the next DOM operation
  (`check` reports `erased-property-access`).
- The names in the list are property names of the bag, as strings in an array.
