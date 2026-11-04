# Storyboard — Chapter 5: Files & Imports

> Teaches: the two kinds of `.eligian` file (a **program** and a **library**), the `languages` block, the four
> **default imports** (`layout`, `styles`, `provider`, `locales`), **named asset imports** (`import x from "./f"`, with
> an optional `as html | css | media`), **library imports** with aliases and `private` (also `private endable`)
> actions, the **extensions import** (a host module of operations, controllers and functions), comments and JSDoc,
> and **keywords**: the sixteen reserved words versus the contextual ones.
> **Self-demonstration:** the subject is the tour's own file head. `tour.eligian` starts with the `languages` block of
> Beat 2 (two languages), the default imports of Beat 3, the library import of Beat 5, `import hint from "./hint.html"`
> and the real `extensions "./host.js" { … }` declaration. Beat 4 places `hint.html` into its panel with
> `setElementContent(@hint)` while you watch.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapter 1 (see `chapter-01-timeline-and-time.md` §0): `#chf` is a
`section.view.chapter` inside `#stage` with its own `header.chrome` (back button `#cf-to-hub`, an 8-dot progress rail
with dot 5 current, the label `05 · Files & Imports`), `section.code-pane` of pre-tokenized `pre#cf-code-*.code`
blocks, `section.effect-pane` of `div#cf-fx-*.fx` panels and a `div.callout-layer` of `div#cf-cl-*.callout` chips. The
shared `#narration` and `#progress` sit outside the views. The view id and the `cf-` prefix are letters, not a
number: the existing `#ch5` / `#ch6` keep their ids, and the display number (05) follows the hub order.

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056).

**View management:** the chapter shows and hides its view only through its lifecycle blocks:
`on enter [ enterChapter("#chf") … ]` shows the view and the narration and attaches the ProgressbarController to
`#progress-fill`; `on leave [ leaveChapter("#chf", "#cf-to-hub") ]` hides them, resets the view (`resetChapter`:
removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it) and removes every controller
`on enter` attached (three KeyboardControllers on `#stage`, the back button's listener, the ProgressbarController).
Hub card `#card-chf` (and key `5`) `navigate`s to `"Files & Imports"`; the hub's `on leave` (`hubUnwire()`) removes
that card's listener and the key's KeyboardController with the others.

### Shared presentation actions

Reuses the library unchanged (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`, and the
chapter skeleton's `enterChapter`, `replayChapter`, `leaveChapter`; table in `chapter-01-timeline-and-time.md` §0).
One chapter-local action in `tour.eligian`:

```eligian
action cfPlaceHint() [
  selectElement("#cf-fx-hint")
  setElementContent(@hint)
]
```

---

## 1. Segment beats

The beats play on the raf clock; `space` pauses and resumes, `r` replays the chapter (`replayChapter`: reset the
view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap + code block + spotlight +
callout + effect panel. The chapter is one sequence of labelled items, and the program head it talks about:

```eligian
languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
}

layout "./layout.html"
styles "./tour.css"
locales "./locales.json"

import { revealBlock, spotlight, clearSpots, callout, narrate, demo, … } from "./presentation.eligian"

import hint from "./hint.html"
extensions "./host.js" {
  operation stampTime(selector: string)
  function shout
}

timeline "Files & Imports" in "#stage" using raf {
  on enter [
    enterChapter("#chf")
    on click "#cf-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#chf")
  ]
  on leave [ leaveChapter("#chf", "#cf-to-hub") ]

  sequence each [ clearSpots() ] {
    for 7s as b1 [ … ]         // beat 1
    for 7s as b2 [ … ]
    for 8s as b3 [ … ]
    for 8s as b4 [ … ]         // … cfPlaceHint() …
    for 8s as b5 [ … ]
    for 8s as b6 [ … ]
    for 7s as b7 [ … ]
    for 7s as b8 [ … ]         // beat 8
  }
}
```

7 + 7 + 8 + 8 + 8 + 8 + 7 + 7 = **60 s**, the timeline's duration, which the ProgressbarController reads. The labels
`b1` … `b8` are scoped to this timeline.

### Beat 1 — two kinds of file (0–7 s, `as b1`)

- **Narration:** "An .eligian file is a program — timelines, actions, imports — or a library that starts with library
  and holds only actions."
- **Code** `#cf-code-files`:
  ```eligian
  // tour.eligian — a program
  languages { * "en-US" "English" }
  layout "./layout.html"
  timeline "Hub" in "#stage" using raf { … }

  // presentation.eligian — a library
  library presentation
  action narrate(template: string) [ … ]
  ```
- **Spot / callout:** `#cf-tok-library`; `#cf-cl-files` "a library may import other libraries; no timelines, consts or
  assets; it cannot be compiled on its own".
- **Effect pane** `#cf-fx-files`: two `.fx-frame`s, `tour.eligian · program` and `presentation.eligian · library`,
  with an `import { … } from` chip between them.
- **Grammar:** `EligianFile: Library | Program`; a library is `'library' name LibraryImport* ActionDefinition*`, so a
  timeline, a `const` or an asset import in it is a parse error. Compiling one directly reports
  `Cannot compile library files directly`.

### Beat 2 — `languages` (7–14 s, `as b2`)

- **Narration:** "languages comes first: the codes, their labels, and a star on the default. One entry is its own
  default."
- **Code** `#cf-code-languages`:
  ```eligian
  languages {
    * "en-US" "English"
      "nl-NL" "Nederlands"
  }
  ```
- **Spot / callout:** `#cf-tok-star` (on `*`); `#cf-cl-languages` "xx-XX codes, unique; compiles to language +
  availableLanguages".
- **Effect pane** `#cf-fx-languages`: chips `en-US ★` `nl-NL`.
- **Real code:** the tour's own block, the first declaration of `tour.eligian` (the grammar puts it before every
  statement). It compiles to `language: "en-US"` and `availableLanguages: [{ languageCode: "en-US", label: "English" },
  { languageCode: "nl-NL", label: "Nederlands" }]` (each with an id).

### Beat 3 — default imports (14–22 s, `as b3`)

- **Narration:** "Four default imports, one of each: layout, styles, provider, locales. Paths are relative to the
  file."
- **Code** `#cf-code-defaults`:
  ```eligian
  layout "./layout.html"     // → layoutTemplate
  styles "./tour.css"        // → cssFiles; classes and selectors are checked against it
  provider "./clip.mp4"      // → checked to exist; a video / audio timeline still names its media with from
  locales "./locales.json"   // → config.locales (needs a languages block)
  ```
- **Spot / callout:** `#cf-tok-styles`; `#cf-cl-defaults` "one of each per file; ./ or ../ only — no absolute paths or
  URLs".
- **Effect pane** `#cf-fx-defaults`: chips `layout` `styles` `provider` `locales`.
- **Real code:** the tour's `layout`, `styles` and `locales` imports.
- **Errors** (re-captured with `eligian check`): a second `styles` line reports
  `Duplicate 'styles' import. Only one styles import is allowed per document.`; `layout "/abs/layout.html"` reports
  `Import path must be relative (start with './' or '../'), absolute paths are not portable. Use './filename.ext' or '../folder/filename.ext' for relative paths`
  (`ABSOLUTE_PATH`).

### Beat 4 — named imports (22–30 s, `as b4`) ⭐ self-demo

- **Narration:** "A named import gives an asset a name. An HTML file becomes a string you can place with @name."
- **Code** `#cf-code-named`:
  ```eligian
  import hint from "./hint.html"          // type from the extension
  import theme from "./x.txt" as css      // or forced with as html | css | media

  selectElement("#cf-fx-hint")
  setElementContent(@hint)
  ```
- **Spot / callout:** `#cf-tok-import`; `#cf-cl-named` "names are unique per file; contextual keywords allowed as
  names".
- **Effect pane** `#cf-fx-hint`: an empty `.fx`; the beat fills it.
- **Real code:** `cfPlaceHint()` (above), then `demo("#cf-fx-hint")`. `@hint` is the content of `hint.html`, inlined
  at compile time: the compiled action is `selectElement { selector: "#cf-fx-hint" }`,
  `setElementContent { template: "<p class=\"hint\">This line lives in hint.html. …</p>\n" }`. The paragraph you read
  in the panel *is* the import. The beat writes the content each time it starts, so a replay needs no reset for it.
- A second import with the same name reports
  `Duplicate import name 'video', import names must be unique. Choose a different name for this import`
  (`DUPLICATE_IMPORT_NAME`; `video` is a contextual keyword, accepted as a name).

### Beat 5 — library imports and `private` (30–38 s, `as b5`)

- **Narration:** "import { … } from a library: public actions by name, renamed with as. private keeps a helper at
  home."
- **Code** `#cf-code-lib`:
  ```eligian
  import { revealBlock, narrate as say } from "./presentation.eligian"

  library presentation
  private action setClass(selector, className, visible) [ … ]   // callable here only
  private endable action spotOn(selector) [ … ] [ … ]   // endable too
  action reveal(selector) [ setClass(selector, "in", true) ]
  ```
- **Spot / callout:** `#cf-tok-private`; `#cf-cl-lib` "errors: private import, missing action, name clash with an
  operation or a local action, circular libraries".
- **Effect pane** `#cf-fx-lib`: chips `public` `private`.
- **Errors** (re-captured): `Cannot import private action 'setClass' from library './b5lib.eligian'`
  (`import_private_action`), `Action 'nope' does not exist in library './b5lib.eligian'` (`import_action_not_found`),
  `Cannot use alias 'selectElement': name conflicts with built-in operation` (`action_name_builtin_conflict`),
  `Import name collision: action 'reveal' conflicts with locally-defined action` (`import_name_collision`),
  `Imported library './ca.eligian' has a circular import: ca.eligian → cb.eligian → ca.eligian. Remove one of the imports to break the cycle`
  (`circular_library_import`). The file names are the scratch files'.

### Beat 6 — `extensions` (38–46 s, `as b6`)

- **Narration:** "extensions declares your own JavaScript: operations, controllers and functions the module exports.
  The compiler trusts the declaration; the bundle carries the module."
- **Code** `#cf-code-ext`:
  ```eligian
  extensions "./host.js" {
    operation stampTime(selector: string)   // called like a built-in
    controller Confetti(count: number)      // addController("Confetti", 25) (display only)
    function shout                          // customFunction("shout")
  }
  ```
- **Spot / callout:** `#cf-tok-ext`; `#cf-cl-ext` "one per program; .js .mjs .ts .mts .jsx .tsx; no Eligius names;
  params name, name?, name: type".
- **Effect pane** `#cf-fx-ext`: an `.fx-frame` `host.js: export const operations = { stampTime }`.
- **Real code:** `tour.eligian` declares `extensions "./host.js" { operation stampTime(selector: string) function shout }`
  and `host.js` exports both. The `controller Confetti` line is display only and must not be copied into the real
  declaration: `host.js` exports no controller, and `smoke` fails on a declared name the module does not export
  (`the extensions module …\host.js does not export controllers.Confetti`). Engine Reach (Chapter 06) calls
  `stampTime`.
- **Errors** (re-captured): `A program has one extensions import; declare everything in the first one`
  (`duplicate_extensions_import`), `The extensions module must be a .js, .mjs, .ts, .mts, .jsx or .tsx file`
  (`extensions_path_type`), `'addClass' is an Eligius operation: a host operation needs another name`
  (`host_operation_builtin`).

### Beat 7 — comments and JSDoc (46–53 s, `as b7`)

- **Narration:** "Comments: // and /* */. A /** doc */ with @param above an action becomes hover documentation."
- **Code** `#cf-code-doc`:
  ```eligian
  // a line comment
  /* a block comment */
  /**
   * Swap the narration line.
   * @param {string} template Subtitle text for this beat
   */
  action narrate(template: string) [ … ]
  ```
- **Spot / callout:** `#cf-tok-jsdoc` (the whole doc comment); `#cf-cl-doc` "typing /** + Enter above an action fills
  the template (Chapter 07)".
- **Effect pane** `#cf-fx-doc`: a `.hover-card` with the markdown the hover provider returns for a call to `narrate`,
  verbatim:
  ```
  ### narrate

  Swap the narration line.

  **Parameters:**
  - `template` (`string`) - Subtitle text for this beat
  ```
  The `(string)` comes from the JSDoc `{string}`; without braces the hover says `unknown`
  (`jsdoc/jsdoc-formatter.ts`).

### Beat 8 — keywords (53–60 s, `as b8`)

- **Narration:** "Sixteen reserved words can't be names. Every other keyword is contextual — fine as a parameter or
  const; action names are stricter. Hub."
- **Code** `#cf-code-keywords`:
  ```eligian
  action f(event, duration) [ … ]   // contextual keywords are fine as names
  const s = 5                        // even a time unit
  action toggle() [ … ]              // verbs too
  const for = 1                      // ✗ 'for' is a keyword, so it cannot be used as a name here. Choose another name.
  ```
- **Spot / callout:** `#cf-tok-reserved` (on `for`, with a `.squiggle`); `#cf-cl-keywords` "reserved: action break
  const continue else endable false for if import null on sequence stagger timeline true · action names accept fewer:
  plain names and the verbs (play, toggle, run, key, …), so action loop() fails (Chapter 07)".
- **Effect pane** `#cf-fx-done`: "Chapter 5 ✓".
- **Grammar:** the reserved words are the keywords outside `Identifier` (parameter, const and import names);
  `ActionName` is `ID` plus the verbs and the extensions words, so `loop` (an `Identifier`) is not an action name:
  `action loop()` reports `'loop' is a keyword, so it cannot be used as a name here. Choose another name.`

---

## 2. Acceptance

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass;
   `smoke` reports `timeline 'Files & Imports': 9 positions ok` (the nine beat boundaries 0–60 s), bundling `host.js`
   with esbuild, and the compiled timeline's duration is 60 s.
2. `@hint` renders: the compiled `cfPlaceHint` carries `hint.html` as `setElementContent`'s `template`, and in the
   browser the paragraph appears in `#cf-fx-hint` at 22 s.
3. The real `extensions` declaration compiles and `node packages/cli/bin/cli.js examples/eligian-tour/tour.eligian --bundle -o <dir> --force`
   succeeds (the Pages workflow path; the bundle contains `host.js`).
4. Every displayed snippet passes `eligian check --max-warnings 0` (and the program ones `eligian smoke`) in a scratch
   program, copied verbatim from `layout.html`, with each `…` filled with a body and against copies of the tour's
   `layout.html`, `tour.css`, `presentation.eligian`, `locales.json` and `hint.html`; `#cf-code-files` and
   `#cf-code-lib` are split into their program and library halves. The last line of `#cf-code-keywords` is the
   deliberate error, and its comment is the message `check` reports for it.
5. The hub shows the card `05 · Files & Imports` between `04` and `06`; key `5` opens the chapter.
6. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit.

## 3. Verification notes and resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave.
- **Effect-pane fidelity:** Beat 4 is real (the panel holds the imported file); Beats 2, 3, 5 and 6 point at the
  tour's own declarations; the panels themselves are illustrative, revealed by `demo`.
- **`@hint` verified:** a named HTML import is inlined as the `template` of the `setElementContent` that reads it.
- **An unused named import does not warn:** the `theme` line of `#cf-code-named` passes `check --max-warnings 0` in
  the scratch program although nothing reads `@theme`.
- **`controller Confetti` is display only** (Beat 6): the real declaration has `operation stampTime` and
  `function shout`, both exported by `host.js`.
- **`provider` today:** the import is checked (relative path, the file exists, one per file), but nothing is
  compiled from it: a `video` / `audio` timeline without `from` still reports
  `Timeline provider 'video' requires a source file. Add: from "<file path>"`, and a config compiled with and
  without the `provider` line is the same. The snippet's comment says so, instead of "→ the media a video / audio
  timeline plays" (the grammar's and LANGUAGE_SPEC.md's description of the intent).
- **The reserved-word message** is quoted whole (`… Choose another name.`).
- **Timeline name / uri:** `"Files & Imports"` (the string name is the `navigate` uri). Hub card label:
  "Files & Imports".

## 4. Files

```
examples/eligian-tour/
├── tour.eligian    # import hint, the extensions declaration, cfPlaceHint, the "Files & Imports" timeline,
│                   #   hub card #card-chf + key 5 (and their removals in hubUnwire)
├── layout.html     # #chf: chrome, eight code blocks, eight effect panels, eight callout chips; #card-chf
├── tour.css        # anchors (#cf-tok-*), fallback rows, #card-chf in the live-card list, the 4-column hub, .hint
├── hint.html       # the named asset import (one <p class="hint">)
├── host.js         # the host module: operations.stampTime, functions.shout (no controllers)
└── locales.json    # en-US / nl-NL (the locales import of Beat 3; hub title and tagline)
```

`presentation.eligian` is unchanged.
