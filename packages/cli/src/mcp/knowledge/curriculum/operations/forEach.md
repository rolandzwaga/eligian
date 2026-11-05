---
operation: forEach
card: "Starts a for loop: each pass puts the next item in the scope (@@<name>, @@loopIndex from 0). You do not write it: for (x in collection) { … } compiles to forEach, the body, endForEach. The collection is read once when the loop starts; an empty one skips the body."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

const targets = ["#title", "#box", "#panel"]

endable action revealAll(selectors: array) [
  for (sel in selectors) {
    selectElement(@@sel)
    addClass("visible")
  }
] [
  for (sel in selectors) {
    selectElement(@@sel)
    removeClass("visible")
  }
]

action logOdd [
  setOperationData({ arrayData: [1, 2, 3] })
  for (n in $operationdata.arrayData) {
    log(@@n, "item")
    log(@@loopIndex, "index")
  }
]

timeline "main" in "#stage" using raf {
  at 0s..3s revealAll(@targets)
  at 3s..4s logOdd()
}
```

## Idioms

- Loop over a parameter, a constant (`@targets`) or an output chain
  (`$operationdata.arrayData`, `$operationdata.filteredArray`).
- Select inside the body from the item: `selectElement(@@sel)` or
  `with "#" + @@id { … }`.
- An endable action loops in both lists: the end list undoes every item.

## Pitfalls

- The item is `@@<loop variable>`: inside `for (sel in …)`, `@@item` compiles to
  `$scope.item`, which nothing sets, and `check` does not catch it.
- A collection whose type is known and not an array is the error
  `for-collection-not-array`; a runtime value that is not an array throws.
- All passes run at once, not over time: for one item every 200 ms use `stagger` or
  `sequence`.
- The loop iterates over a copy: changing the list inside the body changes nothing.
- What the body provides is not certain after the loop.
