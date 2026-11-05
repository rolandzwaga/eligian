---
operation: getFormData
card: "Reads the fields of the selected form into formData, an object keyed by field name: getFormData(). Only named, enabled fields count; unchecked checkboxes and radios are left out, and a name used by several fields gives an array. Throws when the selection is empty or not a form element."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action submitAnswers [
  selectElement("form")
  getFormData()
  broadcastEvent([$operationdata.formData], "answers-submitted")
]

timeline "main" in "#stage" using raf {
  on enter [ on click "#next" run submitAnswers() ]
  on leave [ with "#next" { removeControllerFromElement("DOMEventListenerController") } ]
}
```

## Idioms

- Select the `<form>` itself, not a field, then `getFormData()`.
- Hand the result on in a field that resolves chains: `setOperationData`, or the `eventArgs`
  of `broadcastEvent`; or post it with `httpPost(url, $operationdata.formData)`.
- Read one field as `$operationdata.formData.<name>` in an `if` condition.

## Pitfalls

- It needs `selectedElement`, and it must be a `<form>`: a `div` around inputs throws.
- A field without a `name` attribute is not in `formData`.
- Values are strings (the checked value of a checkbox, the selected option's value).
