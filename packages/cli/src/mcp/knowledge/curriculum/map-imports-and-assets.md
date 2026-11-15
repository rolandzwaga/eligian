---
id: map-imports-and-assets
title: "Imports, libraries and assets"
kind: mapping
use_cases:
  - "import a library"
  - "import an html snippet"
  - "listener action name not found"
see:
  - "map-program-and-config"
  - "map-controllers"
  - "project-layout"
card: "Asset imports, library imports (one global action namespace), listener action names."
---

## Asset imports

Every path is relative to the importing file and starts with `./` or `../` (an absolute path is
an error, `ABSOLUTE_PATH`). A file that cannot be read is an error at the import
(`html-import-error`, `css-import-error`, `locales-import-error`, …).

| Import | Effect on the configuration |
| --- | --- |
| `layout "./layout.html"` | its HTML becomes `layoutTemplate`; at most one |
| `styles "./styles.css"` | its path goes into `cssFiles`; at most one |
| `locales "./locales.json"` | its content becomes `locales`; needs a `languages` block (`map-locales-and-languages`) |
| `import name from "./x.html"` | a compile-time constant: `@name` is replaced by the file's text |
| `import name from "./x.css"` | its path is added to `cssFiles` |
| `import name from "./x.mp4"` | a media file; a timeline's media comes from its `from` path |
| `… as html` / `as css` / `as media` | overrides the type inferred from the extension |

A second default import of the same kind is `import-duplicate-default`. The CSS and layout
imports also feed `check`: class names and selectors in your calls are validated against them.
Media for a `video` or `audio` timeline is attached by `from "<path>"`; `check` warns
`media-file-missing` when that file does not exist yet.

`extensions "./host.ts" { … }` (one per program) declares host operations, controllers and
functions; it adds nothing to the JSON, and `--bundle`, `dev` and `smoke` load the module
(`assets-and-host-modules`).

## Library imports

```
import { fadeIn, fadeOut as hide } from "./lib/animations.eligian"
```

A library is a file that starts with `library <name>` and holds only imports and actions.
`private action` keeps a helper inside its library (importing it is `import_private_action`).

Eligius looks actions up by name in **one global namespace**, so the compiler decides which
library actions go into `actions` and under which names:

- every action the program imports is emitted, under the name the program calls it by (the
  alias when there is one), whether or not it is called;
- every local action of the program is emitted;
- a library action the program does not import (a private helper, a sibling, a nested import)
  is emitted only when an emitted action reaches it through calls, under the qualified name
  `<library>.<action>`; the `requestAction` calls in library bodies are rewritten to match;
- the rest of the library is dropped.

Two emitted actions with the same name are an error at the import or definition. Rename one, or
import with `as`.

## Listener action names are strings

`on click …` and `on key …` write their listener for you. When you write a listener controller
yourself, its `actions` list names actions as strings:

```
addController("DOMEventListenerController", "click", ["showSnippet", "end:spotlight"])
addController("KeyboardController", "right", ["next"])
```

Eligian validates these names. Each string, with an `end:` prefix stripped, must be an action
the program can call: declared in the program, or imported (by its alias, when aliased). Any
other name is an error at the string, `unknown-listener-action` (the diagnostic carries the
closest names). A private library helper, an action the program does not import, and a qualified
`<library>.<action>` name are not callable, so they are reported too. A list that is not an
array literal is not checked, nor are the entries after its first non-literal entry.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

import snippet from "./probe-layout.html"

action showSnippet() [
  selectElement("#panel")
  setElementContent(@snippet)
]

timeline "Assets" in "#stage" using raf {
  on enter [
    selectElement("#next")
    addController("DOMEventListenerController", "click", ["showSnippet"])
  ]
  on leave [
    with "#next" { removeControllerFromElement("DOMEventListenerController") }
  ]
  at 0s..3s target "#title" [ addClass("visible") ] [ removeClass("visible") ]
}
```

Read the output: `@snippet` is gone; `setElementContent`'s `template` holds the text of the
imported file (here the probe's own layout). The lifecycle action attaches the listener with
`actions: ["showSnippet"]`, the name `showSnippet` is emitted under in `actions`.

## Rules

- Put shared actions in `lib/*.eligian` libraries and import only what the program uses; mark
  helpers `private`.
- Name listener actions by the name the program calls them by. Prefer `on click … run
  <action>(…)`, which checks the call and its arguments like any other call.
- Use a named HTML import for markup you insert at runtime; keep the page structure in the
  `layout`.
- Remove every listener you attach, in `on leave` (`map-controllers`).
