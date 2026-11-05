---
operation: formatText
card: "Transforms textContent into formattedText with one of uppercase, lowercase, capitalize (first letter only), titlecase or trim. textContent comes from getTextContent or setOperationData; show the result with setElementContent($operationdata.formattedText), or with createElement when it is user text."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#next")
    getTextContent()
    formatText("uppercase")
    setElementContent($operationdata.formattedText)
  ] [
    selectElement("#next")
    setElementContent("Next")
  ]
  at 2s..4s [
    setOperationData({ textContent: "  chapter one " })
    formatText("trim")
    setOperationData({ textContent: $operationdata.formattedText })
    formatText("titlecase")
    selectElement("#title")
    createElement("span", $operationdata.formattedText)
    setElementContent()
  ] [
    selectElement("#title")
    clearElement()
  ]
}
```

## Idioms

- `selectElement(…)`, `getTextContent()`, `formatText(…)`, then write it back.
- Two transformations: copy the result into `textContent` with `setOperationData` between
  them, as the second range does.
- For display only, CSS `text-transform` needs no operation at all.

## Pitfalls

- It needs `textContent`: `check` reports the missing dependency without `getTextContent`
  or a `setOperationData` before it.
- Any other transformation is `eligius-E120` in `check` and throws at runtime.
- `capitalize` and `titlecase` only raise letters; the rest keeps its case
  (`"hELLO"` becomes `"HELLO"` with `capitalize`).
- `setElementContent` parses a string as HTML: text that contains `<` becomes markup.
  `createElement("span", $operationdata.formattedText)` inserts it as text.
