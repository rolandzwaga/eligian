---
operation: createElement
card: "Builds one element and leaves it in template: createElement(elementName, text?, attributes?). text becomes text content and each attribute is set on its own, so neither is parsed as HTML: the safe way to show user data. Follow it with setElementContent() without an argument to insert it into the selected element."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action note(text: string) [
  selectElement("#box")
  createElement("p", text, { class: "item" })
  setElementContent($operationdata.template, "append")
] [
  selectElement("#box")
  clearElement()
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#box")
    createElement("h2", "Step <1>", { class: "highlight" })
    setElementContent()
  ] [
    selectElement("#box")
    clearElement()
  ]
  at 2s..4s note("Typed by a user")
}
```

## Idioms

- `createElement(…)` then `setElementContent()`: the empty call inserts `template` from the
  operation data. `setElementContent($operationdata.template, "append")` appends instead of
  overwriting; it compiles to `insertionType` only.
- An action parameter named `text` or `attributes` forwards itself (`createElement("p", text)`
  writes no `text` field); other values go in by position.
- Text from runtime data (a parameter, `$operationdata.formattedText`) belongs in `text`,
  never in a `setElementContent` string.
- Undo the insertion in the end block: `clearElement()` on the container.

## Pitfalls

- `setElementContent` needs `selectedElement`: select the container before or after the
  `createElement` (it erases only its own three fields, the selection stays).
- `setElementContent("…")` with an argument replaces `template`: the created element is not
  inserted.
- At runtime it throws on an invalid tag name, on `script`, on `on*` and `srcdoc` attributes
  and on `javascript:` / `vbscript:` URLs; completion never offers them.
- Attributes with a falsy value (`false`, `0`, `""`) are skipped.
- Class names inside `attributes` are not checked against the stylesheet.
