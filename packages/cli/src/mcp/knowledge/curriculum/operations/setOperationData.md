---
operation: setOperationData
card: "Adds properties to the operation data: setOperationData({ name: value, ... }, override?). Values that are $operationdata, $globaldata or $scope chains are resolved first. With override true the object replaces the whole bag, selectedElement included. The compiler writes it itself to move arguments into fields that do not resolve chains."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action highlightIf(enabled: boolean) [
  setOperationData({ shown: false, arrayData: [3, 1, 2] })
  sortArray()
  if (enabled) {
    setOperationData({ shown: true })
  }
  setOperationData({ order: $operationdata.sortedArray, shown: $operationdata.shown }, true)
  selectElement("#box")
  addClass("highlight")
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    highlightIf(true)
  ] [
    selectElement("#box")
    removeClass("highlight")
  ]
}
```

## Idioms

- Give an operation its input under the name it reads: `{ arrayData: [...] }` for
  `sortArray` / `filterArray`, `{ textContent: … }` for the text operations.
- Set a default before an `if` that may change it (`{ shown: false }`): a comparison against a
  property that was never set is false even against `null`.
- Copy a global into the bag: `setOperationData({ items: $globaldata.items })`.

## Pitfalls

- `override` true drops everything not in the object: `selectedElement`, outputs, and the
  action's parameters; `check` does not report a parameter used after it. Keep what you still
  need in the object and select again afterwards.
- Keys are plain property names. To write into global data or the scope use `setData`.
- `check` tracks literal keys; an `override` that is not a literal makes what follows unknown
  to the dataflow check.
