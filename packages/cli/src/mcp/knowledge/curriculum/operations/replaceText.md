---
operation: replaceText
card: "Replaces every occurrence of a text in textContent: replaceText(searchPattern, replacement). It needs textContent (getTextContent provides it), rewrites textContent in place and provides replacementCount. Nothing changes on the page until setElementContent writes $operationdata.textContent back. From Eligian the pattern is a plain string, matched literally."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action greet(name: string) [
  selectElement("#title")
  setElementContent("Hello {name}, welcome {name}")
  getTextContent()
  replaceText("{name}", name)
  setElementContent($operationdata.textContent)
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    greet("Ada")
  ] [
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- Fill placeholders: `getTextContent()`, one `replaceText` per placeholder (each one works on
  the `textContent` the previous one left), then `setElementContent($operationdata.textContent)`.
- An action parameter as the replacement (`replaceText("{name}", name)`): the field is called
  `replacement`, so the compiler moves `name` into a `setOperationData` before the call.
- Clear or restore the element in the end block, so a seek back shows the layout's state.

## Pitfalls

- It needs `textContent`; `check` reports `missing-dependency` when nothing before it provides
  it. `getTextContent` in turn needs `selectedElement`.
- It edits the bag, not the element: without the `setElementContent` the page does not change.
- An empty `searchPattern` throws at runtime. A string pattern is literal (no wildcards, `$&`
  is not expanded); Eligian has no regex literal.
- `replaceString` is the variant that writes `result` and leaves `textContent` unchanged.
