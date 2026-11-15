---
operation: concatenateStrings
card: "Joins an array of strings: concatenateStrings(strings, separator?), separator \"\" by default, the result in result. Eligian writes it for + with a string operand on a runtime value, so \"#\" + @@id needs no explicit call."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action heading(chapter: string) [
  concatenateStrings(["Chapter", chapter], " ")
  selectElement("#title")
  setElementContent($operationdata.result)
]

timeline "main" in "#stage" using raf {
  at 0s..3s [
    heading("two")
  ] [
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- `+` covers most joins: `"#" + @@id` in a `with` or a `selectElement` compiles to this
  operation and uses its `result`.
- The explicit call pays off for a separator over a list: `concatenateStrings(parts, ", ")`.
- Read the result as `$operationdata.result` in the next operation.

## Pitfalls

- `strings` must be an array; anything else throws at runtime.
- `result` is shared: the next `concatenateStrings`, a `+` join, `replaceString` or
  `splitString` overwrites it.
