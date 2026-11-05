---
operation: findInArray
card: "Finds the first item of arrayData whose findProperty strictly equals findValue: foundItem and foundIndex, or undefined and -1 when nothing matches. No operation provides arrayData: set it with setOperationData or pass it as a parameter. findValue is typed object, so pass a constant, a parameter or setOperationData, not a literal."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action showSlide(slides: array, slug: string) [
  setOperationData({ arrayData: slides })
  findInArray("slug", slug)
  if ($operationdata.foundIndex >= 0) {
    selectElement("#title")
    setElementContent($operationdata.foundItem.title)
  }
] [
  selectElement("#title")
  setElementContent("")
]

timeline "main" in "#stage" using raf {
  at 0s..2s showSlide([{ slug: "intro", title: "Welcome" }, { slug: "end", title: "Thanks" }], "end")
  at 2s..3s [
    setOperationData({ arrayData: ["#title", "#box", "#panel"], findValue: "#box" })
    findInArray("item")
    log($operationdata.foundIndex, "index")
  ]
}
```

## Idioms

- A lookup table as a parameter or a constant: find by key, then use
  `$operationdata.foundItem.<field>` (here into `setElementContent`).
- Guard the use with `if ($operationdata.foundIndex >= 0) { … }`.
- In a list of plain values the item itself is compared once `findProperty` is set: any name
  works (`findInArray("item")` with `findValue` from `setOperationData`).

## Pitfalls

- A string or number literal as `findValue` is `parameter_type` (the registry types it
  `object`); a constant, a parameter or `setOperationData` pass.
- At runtime it throws when `arrayData` is not an array, and when `findProperty` or
  `findValue` is missing, for a list of plain values too.
- No match is not an error: `foundItem` is undefined, so guard what reads it.
- `findPredicate` is a function, which Eligian cannot write.
