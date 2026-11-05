---
operation: setElementContent
card: "Writes content into the selected element(s): setElementContent(template, insertionType?), 'overwrite' (the default), 'append' or 'prepend'. A string template is parsed as HTML; for text from user data use createElement. Overwrite detaches controllers inside the replaced content."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

const heading = "Chapter one"

action caption(selector: string, text: string) [
  selectElement(selector)
  setElementContent(text)
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#title")
    setElementContent(@heading)
  ] [
    selectElement("#title")
    setElementContent("")
  ]
  at 2s..4s [
    selectElement("#box")
    setElementContent("<p>First</p>")
    setElementContent("<p>Second</p>", "append")
  ]
  at 4s..6s caption("#title", "Done")
}
```

## Idioms

- Static text in the layout, changing text with `setElementContent`; translated text with a
  `LabelController` (`addController("LabelController", "<key>")`) instead.
- A constant (`@heading`) or an action parameter as the template; a parameter under a
  different name than `template` is moved into a `setOperationData` by the compiler.
- Clear it again in the end block (`setElementContent("")`) when a seek back should show the
  layout's state.

## Pitfalls

- It needs `selectedElement`.
- `overwrite` replaces the children: controllers attached inside them are detached, those on
  the selected element itself stay.
- An `insertionType` other than the three values throws at runtime; `check` rejects a
  literal that is not one of them.
- String templates run scripts and inline handlers through jQuery: never pass user input.
