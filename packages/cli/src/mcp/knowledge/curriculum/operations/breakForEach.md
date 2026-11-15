---
operation: breakForEach
card: "Ends the enclosing loop at once. Eligian writes it for the break statement inside a for; write break, not the raw call. Inside an if within the loop it breaks conditionally."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action revealUpTo(items: array, limit: number) [
  for (item in items) {
    if (@@loopIndex >= limit) {
      break
    }
    selectElement(@@item)
    addClass("visible")
  }
]

action hideAll(items: array) [
  for (item in items) {
    selectElement(@@item)
    removeClass("visible")
  }
]

timeline "main" in "#stage" using raf {
  at 0s..3s [
    revealUpTo(["#title", "#box", "#panel"], 2)
  ] [
    hideAll(["#title", "#box", "#panel"])
  ]
}
```

## Idioms

- `if (<cond>) { break }` at the top of a `for` body: compiled to `when`, `breakForEach`,
  `endWhen` inside `forEach` … `endForEach`.
- Stop at a count with `@@loopIndex` (0-based) compared to a parameter.

## Pitfalls

- `break` outside a `for` is an error (`break-outside-loop`); a raw `breakForEach()` outside a
  loop passes `check`, so write the keyword.
- The operations after the loop still run; `break` leaves the loop, not the action.
- The end block of a range does not know where the loop stopped: undo every item there.
