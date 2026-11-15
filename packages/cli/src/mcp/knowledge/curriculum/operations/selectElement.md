---
operation: selectElement
card: "Puts the elements matching a selector into selectedElement, the input of every DOM operation after it. Every engine-fired block starts empty, so select in the block that uses the element; `with` and `target` write the call for you."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#panel")
    addClass("visible")
    selectElement(".item", true)
    addClass("highlight")
  ] [
    selectElement("#panel")
    removeClass("visible")
    selectElement(".item", true)
    removeClass("highlight")
  ]
  at 2s..4s target "#title" [
    addClass("active")
  ] [
    removeClass("active")
  ]
}
```

## Idioms

- One `selectElement`, then any number of `addClass` / `removeClass` / `setStyle` /
  `animate` calls: the selection persists until the next `selectElement` overwrites it.
- `selectElement(".item", true)` searches inside the current selection (here `#panel`) instead of
  the whole presentation (`useSelectedElementAsRoot`).
- `with "#box" { addClass("visible") }` is a `selectElement` plus the block;
  `at … target "#box" [ … ] [ … ]` selects at the head of both the start and the end block.
- A selector can match several elements; the DOM operations act on all of them.

## Pitfalls

- An end block does not see the start block's selection: select again, or use `target`.
- A selector that matches nothing is not an error: the engine warns `selector '…' wasn't
  found!` and the following operations act on an empty set. `eligian_smoke` reports it as
  `smoke-selector-miss`; `check` reports selectors with ids or classes that the CSS or the
  layout does not define.
- `selector` is erased after the call; an action parameter named `selector` is kept alive by
  the compiler while the block still uses it.
