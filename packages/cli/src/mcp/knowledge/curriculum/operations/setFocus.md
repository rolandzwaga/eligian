---
operation: setFocus
card: "Moves keyboard focus to the first selected element: setFocus(), no arguments, needs selectedElement. Fits a button or form field the viewer should act on next. The element must be focusable (a button, link, form control, or an element with a tabindex attribute)."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..4s [
    selectElement("#box")
    addClass("visible")
  ] [
    selectElement("#box")
    removeClass("visible")
  ]
  at 4s..6s [
    selectElement("#next")
    addClass("highlight")
    setFocus()
  ] [
    selectElement("#next")
    removeClass("highlight")
  ]
}
```

## Idioms

- Focus the control a step asks for when it appears, together with a visible cue
  (`addClass("highlight")`).
- `getFocusedElement` reads the focus back; `announceToScreenReader` speaks a change without
  moving focus.

## Pitfalls

- It needs `selectedElement`; an empty selection (a selector that matched nothing) throws at
  runtime.
- Only the first matched element is focused.
- Focus on a plain `div` without `tabindex` does nothing.
- Moving focus takes the keyboard away from what the viewer was using: a `keydown` listener on
  another element stops firing, since it fires only while its element has focus.
