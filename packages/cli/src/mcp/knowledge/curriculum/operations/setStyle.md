---
operation: setStyle
card: "Sets inline CSS properties on the selected element(s) from an object literal ({ opacity: \"0\" }). Use it for start values before animate or for one-off values; keep states in CSS classes. An empty string removes an inline property again."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#box")
    setStyle({ opacity: "0", transform: "translateX(-100px)" })
    addClass("visible")
  ] [
    selectElement("#box")
    setStyle({ opacity: "", transform: "" })
    removeClass("visible")
  ]
}
```

## Idioms

- Start values before `animate`: `setStyle({ opacity: "0" })` then
  `animate({ opacity: 1 }, 500)`.
- Several properties in one call; property names in JavaScript form (`backgroundColor`).
- Reset in the end block or `on leave` with empty strings, so a seek or a re-entry starts
  from the stylesheet again.

## Pitfalls

- It needs `selectedElement`.
- Inline styles beat class rules: a `setStyle({ opacity: "0" })` that is never reset hides
  the element even after `addClass("visible")`.
- Give values as strings with their unit (`"100px"`); they go to jQuery `css()`.
- Prefer a class for anything that has a name (visible, active, highlighted): the stylesheet
  then owns the look and `check` validates the class name.
