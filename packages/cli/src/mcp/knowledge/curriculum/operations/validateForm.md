---
operation: validateForm
card: "Validates the fields of the selected form: the browser's constraint checks (the required, type and pattern attributes), then optional rules per field name: validateForm({ email: { required: true, email: true } }). Provides isValid and validationErrors (field name to message); branch on them with if."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action submitSignup [
  selectElement("form")
  validateForm({ email: { required: true, email: true }, name: { minLength: 2 } })
  selectElement("#box")
  if ($operationdata.isValid) {
    removeClass("highlight")
  } else {
    addClass("highlight")
  }
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#next")
    addController("DOMEventListenerController", "click", ["submitSignup"])
  ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
}
```

## Idioms

- In a click handler on the submit button: select the form, `validateForm(…)`, then
  `if ($operationdata.isValid) { … } else { … }`.
- Rules per field `name`: `required`, `minLength`, `maxLength`, `pattern` (a regex as a
  string) and `email`. Read a message as `$operationdata.validationErrors.<name>`.

## Pitfalls

- The selection must be a `<form>`: an empty selection or another element makes the engine
  throw (`selectedElement is required` / `must be a form element`). The layout must hold it.
- Fields without a `name` attribute are skipped.
- Checkboxes and radios are checked once per name: `required` means one of them is checked.
- The messages are fixed English texts or the browser's own; translate them yourself.
- `validationRules` is erased; `isValid` and `validationErrors` persist.
