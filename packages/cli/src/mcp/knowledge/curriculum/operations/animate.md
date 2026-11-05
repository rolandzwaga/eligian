---
operation: animate
card: "Animates the selected element(s) with jQuery: an object of target CSS values, a duration in milliseconds, an optional easing. The next operation runs when the animation completes. jQuery animates numeric properties only; for transforms prefer a class with a CSS transition."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s [
    selectElement("#box")
    setStyle({ opacity: "0" })
    animate({ opacity: 1 }, 1000)
    addClass("visible")
  ] [
    selectElement("#box")
    animate({ opacity: 0 }, 500, "linear")
    removeClass("visible")
  ]
}
```

## Idioms

- Set the start value with `setStyle`, then `animate` to the end value.
- Operations after `animate` wait for it: `animate(…)` then `addClass("visible")` adds the
  class when the fade is done.
- A fade-out in the end block mirrors the fade-in of the start block.
- `"swing"` (the jQuery default) and `"linear"` are the easings jQuery has without plugins.

## Pitfalls

- It needs `selectedElement`; on an empty selection it resolves at once.
- Values animate numerically (`opacity`, `width`, `left`, …). jQuery does not animate colours
  or `transform` strings; add a class with a CSS `transition` for those.
- The duration is in milliseconds (`1000`), not an Eligian time (`1s`).
- The animation's inline style stays after it ends; the end block (or `on leave`) resets it.
