---
operation: scrollToPosition
card: "Scrolls the browser window to pixel coordinates: scrollToPosition(x, y, behavior?), behavior 'auto' (the default) or 'smooth'. It uses window.scrollTo, so it moves the page, not a scrollable element inside it; to bring one element into view use scrollToElement. Needs no selection."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  on enter [
    scrollToPosition(0, 0)
  ]
  at 2s..4s [
    scrollToPosition(0, 400, "smooth")
  ] [
    scrollToPosition(0, 0)
  ]
}
```

## Idioms

- Back to the top when a timeline starts: `scrollToPosition(0, 0)` in `on enter`.
- `"smooth"` for a visible move the viewer follows, the default for an instant jump.
- `scrollToElement` (on a `selectElement`) when the target is an element, not a coordinate:
  it does not depend on the layout's sizes.

## Pitfalls

- `x` and `y` must be numbers; anything else throws at runtime.
- It scrolls the window. Content that scrolls inside an element (`overflow: auto`) does not
  move.
- Pixel positions depend on the viewport and the layout: a size change moves the target.
