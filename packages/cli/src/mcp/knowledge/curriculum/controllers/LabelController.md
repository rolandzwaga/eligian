---
controller: LabelController
status: recommended
card: "Renders the text of a translation key from the locales file in the selected element (or, with attributeName, in an attribute such as title or aria-label), and re-renders it on a language change. A literal key is checked against the locales import; with none, check reports no_labels_import."
---

## Call

The program needs a `languages` block and a `locales "./locales.json"` import; a literal key is
then checked against that file. An action that takes the key as a parameter keeps the call short:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action label(selector: string, key: string) [
  selectElement(selector)
  addController("LabelController", key)
]

timeline "Labels" in "#stage" using raf {
  on enter [
    label("#title", "intro.title")
  ]
  on leave [
    with "#title" { removeControllerFromElement("LabelController") }
  ]
}
```

## Idioms

- One `LabelController` per element that shows text; change the language and every label
  re-renders, without any timeline operation.
- `addController("LabelController", "nav.next", "aria-label")` fills an attribute instead of
  the element's content.
- Translations may hold simple markup (`<br>`, `<strong>`, `<em>`, `<span>`, links); it is
  sanitised before insertion.

## Pitfalls

- A literal key missing from the locales file is `unknown_label_id`, with a quick fix that adds
  it; without a `locales` import it is `no_labels_import`.
- An event-handler attribute (`onclick`, …) as `attributeName` fails at runtime.
- Remove it in `on leave` like any controller.
