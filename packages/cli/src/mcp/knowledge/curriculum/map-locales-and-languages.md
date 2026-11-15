---
id: map-locales-and-languages
title: "Languages, locales and labels"
kind: mapping
use_cases:
  - "translate the presentation"
  - "language switch button"
  - "LabelController translation key"
see:
  - "map-event-actions"
  - "controllers"
  - "map-imports-and-assets"
card: "languages block + locales import; LabelController; switch = broadcast language-change."
---

## Declaring languages

```
languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
}
```

The block comes first in the program. It compiles to `language` (the code marked `*`) and
`availableLanguages` (one `{ languageCode, label }` per entry). A single entry is the default
without a `*`; with several, exactly one carries the `*` (`languages-missing-default`). Codes have
the form `xx-XX` (`invalid_language_code_format`). Without a `languages` block the program gets
`en-US` / `English`.

## The locales file

```
locales "./locales.json"
```

The file's content becomes `locales` in the configuration: one object per language code, holding
nested texts. A translation key is the dotted path to a text:

```
{
  "en-US": { "intro": { "title": "Hello" } },
  "nl-NL": { "intro": { "title": "Hallo" } }
}
```

Here `intro.title` is the key. A `locales` import needs a `languages` block
(`locales-without-languages`); a file that is not valid locales JSON is `locales-import-error`.
Give every declared language an entry, with the same keys.

## Showing a translated text

`LabelController` renders the text of one key into the selected element (or into an attribute
such as `title` or `aria-label`, its optional second parameter), and renders it again whenever the
language changes:

```
on enter [
  selectElement("#title")
  addController("LabelController", "intro.title")
]
on leave [
  with "#title" { removeControllerFromElement("LabelController") }
]
```

A literal key is checked against the locales file: `unknown_label_id` with the closest key
(`intro.titel` → "Did you mean: 'intro.title'?"), or `no_labels_import` when the program has no
`locales` import. Like every controller, it stays attached until removed: remove it in
`on leave`. Text written with `setElementContent("…")` is not translated.

## Switching the language at runtime

The engine listens to the `language-change` event: broadcast it with the new code, and every
`LabelController` renders its key in that language. The recipe is one action, called from an
interaction:

```eligian probe
languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
}

styles "./probe.css"
layout "./probe-layout.html"

action setLanguage(code: string) [
  broadcastEvent([code], "language-change")
]

on event "language-change" action showLanguage(language: string) [
  selectElement("#title")
  setElementContent(language)
]

timeline "Languages" in "#stage" using raf {
  on enter [ on click "#next" run setLanguage("nl-NL") ]
  on leave [ with "#next" { removeControllerFromElement("DOMEventListenerController") } ]
  at 0s..5s target "#box" [ addClass("visible") ] [ removeClass("visible") ]
}
```

Read the output: `setLanguage` is one `broadcastEvent` with `eventName: "language-change"` and
`eventArgs` holding `$operationdata.code`; the click listener runs it with
`actionOperationData: { code: "nl-NL" }`. `showLanguage` is an event action (in `eventActions`,
not shown) that receives the code as its first argument: use one like it to mark the active
language button.

This probe has no `locales` import (the probe folder has no locales file). In a real program,
every code you switch to has an entry in `locales.json`; otherwise the engine warns
`Locale 'nl-NL' is not available`, which `eligian smoke` reports as `smoke-console-warn`.

## Rules

- Use `on click "<button>" run setLanguage("<code>")`, one button per language; the action
  broadcasts, the engine and the controllers do the rest. Do not rewrite texts yourself.
- Only codes declared in the `languages` block, with entries in the locales file.
- Put every visible text that must follow the language in the locales file and show it with a
  `LabelController`; one controller per element, removed in `on leave`.
- An `on event "language-change"` action runs for every switch, from any timeline; its first
  parameter is the new code.
