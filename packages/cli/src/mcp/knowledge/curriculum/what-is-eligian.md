---
id: what-is-eligian
title: "What Eligian is"
kind: orientation
use_cases:
  - "file kinds"
see:
  - "what-is-eligius"
  - "project-layout"
card: "Programs, libraries, imports, timelines; check; the CLI commands."
---

# What Eligian is

Eligian is a small language for Eligius presentations. Eligius runs a verbose JSON configuration (`what-is-eligius`); Eligian is the concise, checked way to write it. A `.eligian` file (always that extension) compiles to the JSON, or to a standalone bundle that runs in a browser.

No model was trained on Eligian. Its syntax looks a little like TypeScript and a little like CSS, and guessing from either is the most common way to go wrong. If a construct is not in `syntax-cheatsheet`, Eligian does not have it; `not-eligian` lists the constructs models reach for and what to write instead.

## A whole program

```eligian
languages {
  * "en-US" "English"
}

layout "./layout.html"
styles "./styles.css"
locales "./locales.json"

/** Show an element: selects it and adds .is-visible */
action reveal(selector: string) [
  selectElement(selector)
  addClass("is-visible")
]

action conceal(selector: string) [
  selectElement(selector)
  removeClass("is-visible")
]

timeline "Intro" in "#stage" using raf {
  on enter [
    on click "#play" toggle
  ]
  on leave [
    selectElement("#play")
    removeControllerFromElement("DOMEventListenerController")
  ]

  at 1s..6s [ reveal("#headline") ] [ conceal("#headline") ]
  at +0s for 5s [ reveal("#detail") ] [ conceal("#detail") ]
}
```

What the parts compile to:

- The default imports `layout`, `styles` and `locales` (at most one of each, relative paths) become the configuration's layout template, CSS files and label data. The `languages` block lists the languages; `*` marks the default.
- An `action` is a named list of operations. Calling it (`reveal("#headline")`) is written like an operation call; the compiler resolves the name to your action first, then to a built-in operation, and an action call compiles to `requestAction` + `startAction`.
- A `timeline` names its container (`in "#stage"`) and its provider (`using raf`, `video`, `audio` or `scroll`). A program needs at least one.
- `at 1s..6s [ start ] [ end ]` is a timeline action: the first block runs at 1 s, the second at 6 s. `at +0s for 5s` starts where the previous event ended.
- `on enter` and `on leave` are lifecycle blocks: they run when the timeline becomes active and when it is left.
- `on click "#play" toggle` is an interaction: it compiles to a DOM event listener controller and a small action that broadcasts the play/pause request.

`map-actions-and-calls`, `map-timeline-and-providers`, `map-events-and-interactions` and `map-dataflow` show the compiled JSON of each construct.

## File kinds

| File | What it is |
| --- | --- |
| `main.eligian` | a **program**: imports, actions, event actions, constants, timelines |
| `lib/<name>.eligian` | a **library**: starts with `library <name>`, holds only actions; a program imports them with `import { reveal, conceal } from "./lib/effects.eligian"` |
| `layout.html` | the HTML the presentation runs in; every id a timeline selects lives here |
| `styles.css` | the styles; class names and selectors in the program are checked against it |
| `locales.json` | the texts per language, keyed by language code (`"en-US"`), shown through `LabelController` keys |
| `host.ts` / `host.js` | an optional host module of your own operations, controllers and functions, declared with `extensions "./host.ts" { … }` |
| `media/`, `assets/` | video and audio files for media timelines (`using video from "./media/intro.mp4"`), images |

`project-layout` gives the canonical directory layout and naming rules.

## Static checking

Eligian checks far more than syntax, and the checks are the main reason to write Eligian instead of JSON:

- **Operation dataflow**: each operation declares what it needs in the operation data (`addClass` needs a `selectedElement`), what it provides and what it erases. Calling `addClass` in a block that has selected nothing is an error at compile time, not a silent no-op at runtime.
- **Selectors and class names** are checked against the imported CSS and layout HTML, with "did you mean" suggestions. `eligian_check` treats an id selector that is in the CSS but not in the layout as a warning.
- **Types**: optional annotations on action parameters (`selector: string`), with inference from how parameters are used. Types are `string`, `number`, `boolean`, `object`, `array`, `unknown`.
- **Eligius lint**: the compiled configuration is linted by Eligius' own linter, findings mapped back to the source line.
- **Review**: warnings for mechanical runtime pitfalls, such as a controller added in `on enter` that `on leave` does not remove (`controller-imbalance`) or a class that is added and never removed (`class-never-removed`).

Every diagnostic carries a code; `diagnostics` lists them all with the overlay that explains the fix.

## Toolchain

The `eligian` npm package is the compiler and command line; a project depends on it as a devDependency. The same commands back the MCP tools:

- `eligian check main.eligian`: every error and warning, Eligius lint and review included; no output written. Tool: `eligian_check`, run after every edit.
- `eligian fmt --write main.eligian`: whitespace-only formatting. Tool: `eligian_fmt`.
- `eligian main.eligian`: compile to `main.json`. `--bundle` writes a standalone `main.bundle/` directory (`index.html` + `bundle.js`) that runs in a browser.
- `eligian smoke main.eligian`: plays every timeline headlessly on the real engine and reports runtime failures at their source line.
- `eligian dev main.eligian`: serves the bundle in a browser and rebuilds it on change, keeping the playhead. A long-running process: run it in a terminal, not as a tool call.
- `eligian init --template blank|chapters|video|library`: writes a starter project. Tool: `eligian_init`. The starters (`starter/blank`, `starter/chapters`, `starter/video`, `starter/library`) are known-good minimal projects; read one before writing a program from scratch.
- `eligian mcp`: the MCP server these docs come from.

The VS Code extension adds highlighting, completion, hover docs, a live preview with CSS hot reload, and a timeline view.

## Working method

1. Interview the user with `eligian_brief` until the brief is approved; the storyboard is drafted from it and approved there (`interview`, `storyboard`).
2. Pick an architecture that fits the approved storyboard (`decisions`).
3. Scaffold with `eligian_init`, then write the layout and CSS before the timelines.
4. Before using a construct, read its `map-*` card; before calling an operation, read its card (`eligian_operations`). `operations-index` lists all of them on one page.
5. Run `eligian_check` after every edit until it reports 0 errors and 0 warnings, then `eligian_fmt`.

see: what-is-eligius, project-layout
