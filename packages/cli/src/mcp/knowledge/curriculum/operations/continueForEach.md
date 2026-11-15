---
operation: continueForEach
card: "Skips the rest of the current loop iteration and goes on with the next item. Eligian writes it for the continue statement inside a for; write continue, not the raw call. Inside an if within the loop it skips conditionally."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action lightAll(ids: array, skip: string) [
  for (id in ids) {
    if (@@id == skip) {
      continue
    }
    with "#" + @@id { addClass("active") }
  }
]

action dimAll(ids: array) [
  for (id in ids) {
    with "#" + @@id { removeClass("active") }
  }
]

timeline "main" in "#stage" using raf {
  at 0s..3s [
    lightAll(["title", "box", "panel"], "box")
  ] [
    dimAll(["title", "box", "panel"])
  ]
}
```

## Idioms

- `if (<cond>) { continue }` filters items: compiled to `when`, `continueForEach`, `endWhen`
  inside `forEach` … `endForEach`.
- Inside `for (id in ids)` the item is `@@id`, the loop variable's own name.

## Pitfalls

- `continue` outside a `for` is an error (`continue-outside-loop`). A raw
  `continueForEach()` outside a loop passes `check`, so write the keyword.
- Whatever an iteration provided before the `continue` stays in the bag for the next one.
