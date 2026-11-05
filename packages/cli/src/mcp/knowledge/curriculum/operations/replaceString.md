---
operation: replaceString
card: "Replaces every occurrence of a text in textContent and writes the outcome to result: replaceString(pattern, replacement). textContent itself is left unchanged. getTextContent provides textContent from the selected element. Both arguments are taken literally. replaceText is the variant that writes back to textContent."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action tidyTitle [
  selectElement("#title")
  getTextContent()
  replaceString("-", " ")
  setElementContent($operationdata.result)
]

timeline "main" in "#stage" using raf {
  at 0s..2s tidyTitle()
}
```

## Idioms

- `selectElement`, `getTextContent()`, `replaceString(…)`, then `setElementContent` with
  `$operationdata.result` (the compiler moves the chain into a `setOperationData`).
- An action parameter named `textContent` provides the input too, without an element.
- Chain two replacements by copying `result` back:
  `setOperationData({ textContent: $operationdata.result })`.

## Pitfalls

- It needs `textContent`; `check` reports `missing-dependency` without a `getTextContent` or a
  parameter of that name.
- An empty `pattern` throws at runtime. Eligian passes strings only, so `$&` and `$1` in the
  replacement are inserted as written.
- `result` is shared: `concatenateStrings` (and string `+` on runtime values) writes it too, so
  read it before the next one.
- It erases `pattern` and `replacement`.
