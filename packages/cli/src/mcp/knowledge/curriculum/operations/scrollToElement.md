---
operation: scrollToElement
card: "Scrolls the page so the selected element is in view (the browser's scrollIntoView): scrollToElement(behavior?, block?, inline?), defaults 'auto', 'start', 'nearest'. Throws when the selection is empty, so select an element that exists."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s [
    selectElement("#panel")
    scrollToElement("smooth", "nearest")
    addClass("visible")
  ] [
    selectElement("#panel")
    removeClass("visible")
  ]
  at 3s..5s [
    selectElement("#title")
    scrollToElement("smooth", "start")
  ]
}
```

## Idioms

- `scrollToElement("smooth", "nearest")` brings a section into view without jumping when it
  is already visible.
- Select, scroll, then reveal (`addClass`) on the same selection.
- Long scrolling pages: one range per section, each scrolling to its section.

## Pitfalls

- It needs `selectedElement`, and unlike `addClass` it fails on an empty selection
  (`scrollToElement: selectedElement is required`); `eligian_smoke` reports the failure. Only the first selected element is scrolled to.
- `behavior` is `'auto'` or `'smooth'`; `block` and `inline` are `'start'`, `'center'`,
  `'end'` or `'nearest'`. Positional: to set `block`, pass `behavior` too.
- A smooth scroll does not hold up the operations after it.
