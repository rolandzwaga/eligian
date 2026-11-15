---
operation: sortArray
card: "Sorts arrayData into sortedArray: sortArray(sortProperty?, sortOrder?), sortOrder 'asc' (the default) or 'desc'. With sortProperty it sorts objects by that property, without it the values themselves. It needs arrayData (setOperationData provides it) and leaves arrayData as it was. The third form takes a comparator function, which Eligian cannot write."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action ranking [
  setOperationData({ arrayData: [{ name: "Bea", score: 3 }, { name: "Ada", score: 7 }] })
  sortArray("score", "desc")
  for (entry in $operationdata.sortedArray) {
    createElement("p", @@entry.name)
    selectElement("#box")
    setElementContent($operationdata.template, "append")
  }
]

timeline "main" in "#stage" using raf {
  at 0s..3s [
    ranking()
  ] [
    selectElement("#box")
    setElementContent("")
  ]
}
```

## Idioms

- `setOperationData({ arrayData: … })`, `sortArray(…)`, then `for (x in $operationdata.sortedArray)`.
- To sort the result of `filterArray` or `mapArray`, copy it to `arrayData` first:
  `setOperationData({ arrayData: $operationdata.filteredArray })`.

## Pitfalls

- It needs `arrayData`; anything that is not an array throws at runtime.
- The natural order compares with `<`: strings by character code, so `"Zoe"` comes before
  `"ada"` and `"10"` before `"9"`. Store numbers as numbers.
- `sortedArray` is a new array; `arrayData` keeps the old order, and the next array operation
  reads `arrayData`, not `sortedArray`.
