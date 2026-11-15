---
operation: setFormValue
card: "Sets the value of the selected input, select or textarea: setFormValue(value), a string, number or boolean. It needs selectedElement. A boolean on a checkbox or radio button sets its checked state; anything else becomes the control's value. getFormData reads a form back into formData."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action addField [
  selectElement("#panel")
  createElement("input", "", { type: "checkbox", name: "agree" })
  setElementContent($operationdata.template, "append")
  selectElement("#panel input")
  setFormValue(true)
]

timeline "main" in "#stage" using raf {
  at 0s..3s [
    addField()
  ] [
    selectElement("#panel input")
    removeElement()
  ]
}
```

## Idioms

- Prefill or reset a control: `selectElement("#email")` then `setFormValue("")` in `on enter`.
- Check or uncheck a box with `setFormValue(true)` / `setFormValue(false)`.
- Read the form with `getFormData` (on the form element); `validateForm` checks it.

## Pitfalls

- It needs `selectedElement`; an empty selection throws at runtime.
- A boolean on a text field becomes the text `"true"`: only checkboxes and radio buttons treat
  it as checked.
- Setting the value does not fire `change` or `input` events, so listeners on them do not run.
