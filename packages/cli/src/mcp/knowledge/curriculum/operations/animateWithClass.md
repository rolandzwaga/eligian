---
operation: animateWithClass
card: "Adds a class that starts a CSS animation on the selected element(s) and waits until the animation ends; by default it then removes the class again. animateWithClass(className, removeClass?, includeDescendants?). The rest of the block runs after the animation."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#box")
    animateWithClass("highlight")
    addClass("visible")
  ] [
    selectElement("#box")
    removeClass("visible")
  ]
  at 2s..4s [
    selectElement("#title")
    animateWithClass("highlight", false)
  ] [
    selectElement("#title")
    removeClass("highlight")
  ]
}
```

## Idioms

- A one-shot effect (a pulse, a shake): `animateWithClass("<class>")`; the class is gone
  afterwards, so the end block has nothing to undo.
- Keep the end state with `animateWithClass("<class>", false)` and remove the class in the
  end block or `on leave`.
- `includeDescendants` = `true` for a class that animates only children: the first
  `animationend` from the subtree then resolves it.

## Pitfalls

- It needs `selectedElement`. The class must exist in an imported stylesheet and give the
  element itself a CSS `animation`; `animationend` events bubbling up from children are
  ignored unless `includeDescendants` is set.
- It resolves at once when the selection is empty or the class sets no animation (also under
  `prefers-reduced-motion: reduce`); an infinite animation is waited for until an
  `animationend` arrives.
- For a transition between two states over a range, `addClass` / `removeClass` with a CSS
  transition does not hold up the operation list.
