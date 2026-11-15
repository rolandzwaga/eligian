---
operation: removeClass
card: "Removes a CSS class from the selected element(s); select first. Its usual place is the end block of the range that added the class, or on leave; removing a class that is not there is harmless."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#panel")
    addClass("visible")
  ]
  on leave [
    selectElement("#panel")
    removeClass("visible")
  ]
  at 0s..2s [
    selectElement("#box")
    addClass("highlight")
  ] [
    selectElement("#box")
    removeClass("highlight")
  ]
}
```

## Idioms

- Mirror `addClass`: the start block adds, the end block removes, on the same selector.
- Classes added in `on enter` come off in `on leave`, so re-entering the timeline starts
  clean.
- To flip a class on each call (a click handler), use `toggleClass`.

## Pitfalls

- It needs `selectedElement`; an end block or `on leave` block starts empty, so select
  again (or use `target "<selector>"` on the event).
- One class name per call, without a leading dot.
- The class must exist in an imported stylesheet (`unknown_css_class`).
