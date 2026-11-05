---
operation: getTextContent
card: "Reads the text of the selected element(s), markup stripped, into textContent (jQuery .text(): the text of every selected element and its descendants, joined). No parameters. formatText reads textContent directly. Throws when the selection is empty."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..1s [
    selectElement("#title")
    setElementContent("Chapter one")
  ] [
    selectElement("#title")
    setElementContent("")
  ]
  at 1s..3s [
    selectElement("#title")
    getTextContent()
    formatText("uppercase")
    selectElement("#box")
    setElementContent($operationdata.formattedText)
  ] [
    selectElement("#box")
    setElementContent("")
  ]
}
```

## Idioms

- `getTextContent()` then `formatText("uppercase" | "lowercase" | "capitalize" | "titlecase"
  | "trim")`: `formatText` needs `textContent` and provides `formattedText`.
- Select the source, read, then select the target: `textContent` survives the second
  `selectElement`.

## Pitfalls

- It needs `selectedElement`; a selector matching nothing throws, naming `getTextContent`.
- Several matches give one joined string, not a list.
- Writing it back with `setElementContent` parses it as HTML: text such as `<b>` becomes
  markup.
