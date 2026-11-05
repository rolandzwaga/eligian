---
operation: getAttributesFromElement
card: "Reads attributes of the selected element into attributeValues, an object keyed by attribute name: getAttributesFromElement(attributeNames) with an array of names. The name value reads the form field's current value instead of the attribute. A missing attribute reads as undefined."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#box")
    getAttributesFromElement(["id", "class", "data-step"])
    log($operationdata.attributeValues, "box")
    selectElement("#title")
    setElementContent($operationdata.attributeValues.id)
  ] [
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- Read data the layout carries (`data-*` attributes) and use it through
  `$operationdata.attributeValues.<name>` chains.
- Branch on it: `if ($operationdata.attributeValues.id == "box") { … }`.
- `getAttributesFromElement(["value"])` on an input reads what the user typed.

## Pitfalls

- It needs `selectedElement`: select first.
- The names are an array, also for one name: `["id"]`.
- With several elements selected it reads the first one.
- Attribute values are strings: compare with `"2"`, not `2` (`==` is strict).
