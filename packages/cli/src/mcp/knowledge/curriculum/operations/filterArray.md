---
operation: filterArray
card: "Keeps the items of arrayData whose filterProperty strictly equals filterValue and writes them to filteredArray. No operation provides arrayData: set it with setOperationData or pass it as a parameter. filterValue is typed object, so pass a constant, a parameter or setOperationData, not a string or number literal."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

const kind = "fruit"

action listKind(items: array, kind: string) [
  setOperationData({ arrayData: items })
  filterArray("kind", kind)
  log($operationdata.filteredArray, "matches")
]

timeline "main" in "#stage" using raf {
  at 0s..2s listKind([{ kind: "fruit", name: "apple" }, { kind: "veg", name: "leek" }], "veg")
  at 2s..4s [
    setOperationData({ arrayData: [{ kind: "fruit", name: "pear" }, { kind: "veg", name: "kale" }] })
    filterArray("kind", @kind)
    for (match in $operationdata.filteredArray) {
      log(@@match, "fruit")
    }
  ]
}
```

## Idioms

- `setOperationData({ arrayData: items })` then `filterArray("kind", kind)`: the parameter
  moves into a `setOperationData` before the call.
- Act on each match with `for (x in $operationdata.filteredArray) { … }`.
- To filter the result again, copy it first:
  `setOperationData({ arrayData: $operationdata.filteredArray })`; the next array operation
  reads `arrayData`, not `filteredArray`.

## Pitfalls

- A string or number literal as `filterValue` is `parameter_type` (the registry types it
  `object`); `@kind`, a parameter or `setOperationData({ filterValue: "veg" })` pass.
- Only objects match: on a list of plain strings or numbers the result is empty.
- At runtime it throws when `arrayData` is not an array, and when `filterProperty` or
  `filterValue` is missing.
- `filterPredicate` is a function, which Eligian cannot write.
