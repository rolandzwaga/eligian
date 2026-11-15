---
operation: getElementDimensions
card: "Measures the selected element's inner width and height (padding included) into dimensions: getElementDimensions(modifier?). An optional modifier string adjusts them: an operator + - * /, an amount, an optional side h or w, an optional %, then an optional |<side>[ar=<w>-<h>] aspect ratio, e.g. '+100h|w[ar=8-1]'."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action halfWidth(modifier) [
  selectElement("#panel")
  getElementDimensions(modifier)
  calc($operationdata.dimensions.width, 2, "/")
  selectElement("#title")
  setElementContent($operationdata.calculationResult)
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#panel")
    getElementDimensions()
    log($operationdata.dimensions, "panel")
  ]
  at 2s..4s halfWidth("-20h")
}
```

## Idioms

- Read `$operationdata.dimensions.width` / `.height` in a field that resolves chains (`calc`,
  `setOperationData`); the compiler hoists a chain in other fields into a `setOperationData`.
- Pass a modifier through an action parameter named `modifier`, as `halfWidth` does.

## Pitfalls

- It needs `selectedElement` and measures the first selected element.
- A height of 0 is replaced by the width before the modifier applies.
- A string literal as the modifier is rejected by `check` (`parameter_type`); use a parameter.
- A malformed modifier throws at runtime, naming the modifier. It erases `modifier`.
