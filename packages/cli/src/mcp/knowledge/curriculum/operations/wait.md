---
operation: wait
card: "Pauses the rest of its operation list for a number of milliseconds: wait(500). The timeline keeps playing meanwhile. For timed steps prefer separate at ranges, a sequence or a stagger, which follow seeks and pauses."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s [
    selectElement("#box")
    addClass("visible")
    wait(500)
    addClass("highlight")
  ] [
    selectElement("#box")
    removeClass("highlight")
    removeClass("visible")
  ]
}
```

## Idioms

- A short beat between two steps of one block that belong together (show, then highlight).
- The data passes through: the selection before `wait` is still there after it.
- In a handler action, a delay before a follow-up (`wait(200)` then the next class).

## Pitfalls

- The argument is milliseconds (`500`), not an Eligian time (`0.5s`).
- It is a plain timer, not a timeline position: pausing the timeline does not pause a
  running `wait`. Anything that should follow the timeline belongs in its own `at` range.
