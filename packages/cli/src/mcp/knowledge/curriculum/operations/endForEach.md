---
operation: endForEach
card: "Closes a for loop: it starts the next pass with the next item, or, after the last item, lets the operations after the loop run. You do not write it: for (x in list) { … } compiles to forEach, the body, endForEach; break and continue jump through it."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action markFirst(ids: array, limit: number) [
  for (id in ids) {
    if (@@loopIndex >= limit) {
      break
    }
    with "#" + @@id { addClass("active") }
  }
  selectElement("#panel")
  addClass("visible")
] [
  for (id in ids) {
    with "#" + @@id { removeClass("active") }
  }
  selectElement("#panel")
  removeClass("visible")
]

timeline "main" in "#stage" using raf {
  at 0s..3s markFirst(["title", "box", "next"], 2)
}
```

## Idioms

- The operations after the closing `}` run once, after the last item or a `break`: put the
  steps that belong to the whole list there (the probe's `#panel`).
- Each nested `for` gets its own `forEach` … `endForEach` pair; the compiler matches them.
- An end block undoes every item with its own loop: it does not know where the start loop
  stopped.

## Pitfalls

- A raw `endForEach()` without a `forEach` before it, or a `forEach` without its
  `endForEach`, is the error `control_flow`: write `for`.
- What the body selects or provides is not certain after the loop (the list may be empty):
  select again after the `}`, as the probe does.
- An empty loop body is the warning `for-empty-body`.
