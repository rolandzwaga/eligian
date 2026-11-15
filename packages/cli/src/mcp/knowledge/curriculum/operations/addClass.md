---
operation: addClass
card: "Adds a CSS class to the selected element(s); select first. Undo it where the effect should end (the end block, on leave), or the class-never-removed review warning fires. Prefer classes plus CSS transitions over setStyle."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s [
    selectElement("#box")
    addClass("visible")
    addClass("highlight")
  ] [
    selectElement("#box")
    removeClass("highlight")
    removeClass("visible")
  ]
  at 3s..5s target "#title" [
    addClass("active")
  ] [
    removeClass("active")
  ]
}
```

## Idioms

- State lives in CSS: `.visible { opacity: 1 }` with a `transition`, then `addClass` /
  `removeClass` at the right time. The look stays in the stylesheet, the timing in Eligian.
- Several classes in a row share one selection.
- A start block adds, the end block of the same range removes: seeking into and out of the
  range then gives the right state.

## Pitfalls

- It needs `selectedElement` (`missing-dependency` otherwise); the end block starts empty.
- One class name per call, without a leading dot: `addClass("visible")`, not `".visible"`.
- The class must exist in an imported stylesheet (`unknown_css_class`, with a suggestion).
- A seek re-runs start blocks but never undoes what earlier blocks did to the DOM: a class
  added without a matching removal stays (`class-never-removed`).
