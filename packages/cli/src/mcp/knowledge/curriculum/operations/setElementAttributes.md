---
operation: setElementAttributes
card: "Sets HTML attributes on the selected element(s): setElementAttributes({ name: value, ... }). It needs selectedElement. Fits ARIA state (aria-pressed, aria-hidden), titles, hrefs and data- attributes; for classes use addClass / removeClass, for inline styles setStyle. Event handler attributes and javascript: URLs are refused."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s [
    selectElement("#next")
    setElementAttributes({ "aria-pressed": "true", title: "Next chapter" })
  ] [
    selectElement("#next")
    setElementAttributes({ "aria-pressed": "false", title: "" })
  ]
}
```

## Idioms

- A range sets the attribute in its start block and puts the previous value back in its end
  block, so a seek in either direction shows the right state.
- Attribute names with a dash are quoted keys (`"aria-pressed"`); values are strings.
- One call per element, several attributes in the one object; an action parameter as a value
  (`{ title: label }`) is resolved by the compiler, which moves the object into a
  `setOperationData` first.

## Pitfalls

- It needs `selectedElement`.
- `on*` handlers (`onclick`), `srcdoc`, and `javascript:` / `vbscript:` URLs in `href`, `src`
  or `formaction` throw at runtime, and then none of the attributes is set.
- `class` and `style` set here replace the whole attribute, dropping what `addClass` or
  `setStyle` added before.
