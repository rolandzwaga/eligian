---
operation: substringText
card: "Cuts a part out of the string in textContent into substring: substringText(start, end?), 0-based, end exclusive, to the end when end is left out. textContent comes from getTextContent, a setOperationData or a parameter named textContent; read the result as $operationdata.substring."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action teaser(text: string) [
  setOperationData({ textContent: text })
  substringText(0, 12)
  selectElement("#title")
  setElementContent($operationdata.substring)
]

timeline "main" in "#stage" using raf {
  at 0s..3s teaser("A long chapter heading")
  at 3s..6s [
    selectElement("#title")
    getTextContent()
    substringText(2)
    log()
  ]
}
```

## Idioms

- Shorten text for a teaser or a caption: `substringText(0, n)`, then
  `setElementContent($operationdata.substring)`; the compiler moves the chain into a
  `setOperationData`, because `template` does not resolve chains itself.
- `getTextContent()` first to work on the text of the selected element.

## Pitfalls

- It needs `textContent`; without it the engine throws `substringText: textContent is
  required`, and a `start` that is not a number throws too.
- JavaScript `substring` rules: a negative index counts as 0, `start` > `end` swaps them, and
  indices count UTF-16 code units, so an emoji can be cut in half.
- `start` and `end` are erased; `textContent` stays for the next text operation.
