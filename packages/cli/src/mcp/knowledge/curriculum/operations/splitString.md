---
operation: splitString
card: "Splits the string in textContent into resultArray: splitString(delimiter, limit?). textContent comes from getTextContent, a setOperationData or a parameter named textContent; resultArray feeds a `for` loop or any operation that reads it as $operationdata.resultArray."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action listWords(sentence: string) [
  setOperationData({ textContent: sentence })
  splitString(" ")
  selectElement("#box")
  setElementContent("")
  for (word in $operationdata.resultArray) {
    setElementContent(@@word, "append")
  }
]

timeline "main" in "#stage" using raf {
  at 0s..3s listWords("one two three")
  at 3s..6s [
    selectElement("#title")
    getTextContent()
    splitString(",", 1)
    log()
  ]
}
```

## Idioms

- From the page: `selectElement(…)`, `getTextContent()`, then `splitString(…)`.
- From an argument: `setOperationData({ textContent: sentence })`, or name the action
  parameter `textContent` so it is already in the bag.
- Loop over the parts with `for (part in $operationdata.resultArray) { … }`; the part is
  `@@part`.

## Pitfalls

- It needs `textContent`; without it the engine throws `splitString: textContent is required`.
- The delimiter is a string and is matched literally: Eligian has no regex literal, so
  `splitString("\\s+")` does not split on whitespace.
- `limit` caps the number of parts and drops the rest: `"a,b,c"` with `(",", 1)` gives `["a"]`.
- `delimiter` and `limit` are erased; `textContent` stays, and `resultArray` persists until
  the next `splitString` overwrites it.
