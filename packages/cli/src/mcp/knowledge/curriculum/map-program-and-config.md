---
id: map-program-and-config
title: "Program and configuration"
kind: mapping
use_cases:
  - "program structure"
  - "where does a declaration go in the compiled JSON"
see:
  - "config-shape"
  - "map-imports-and-assets"
  - "map-timeline-and-providers"
card: "One program → one Eligius configuration: where each declaration lands."
---

## Program or library

An `.eligian` file is one of two kinds:

- a **library**: `library <name>`, then library imports and actions only (no timelines, no
  constants). It is not compiled on its own (`compile` refuses it); its actions enter the
  configuration of every program that imports them (`map-imports-and-assets`).
- a **program**: everything else. One program compiles to one Eligius configuration.

```
languages { ... }                      optional; first when present
<imports>                              layout, styles, locales, named assets, libraries, extensions
const / action / endable action /
on event … action / timeline           any order, any number
```

A program needs at least one timeline (`check` reports `timeline-required`).

## Where each declaration lands

| Eligian | In the configuration |
| --- | --- |
| `timeline "<name>" …` | one entry of `timelines`, in source order; the first declared is the entry timeline |
| `at …`, `sequence`, `stagger` | the `timelineActions` of their timeline, named `timeline-action-<start>-<end>` |
| `on enter` / `on leave` | one timeline action `timeline-lifecycle`, `duration: { start: 0 }` (no end) |
| `action` / `endable action` | one entry of `actions` each; callers refer to it by name |
| `on click … navigate`, `play`, `seek`, … | a generated entry of `actions` (`__nav__…`, `__on__…`) |
| `on event "<name>" action …` | one entry of `eventActions` |
| program-level `const` | folded into every use at compile time (see below) |
| `layout "<file>"` | `layoutTemplate`, the file's HTML |
| `styles "<file>"` | `cssFiles`, the path as written |
| `languages`, `locales` | `language`, `availableLanguages`, `locales` (`map-locales-and-languages`) |
| `extensions "<file>" { … }` | nothing in the JSON: `--bundle`, `dev` and `smoke` load the module beside it |

Without a `layout` import, `layoutTemplate` holds only the timeline containers. Everything the
compiler fills in by itself (engine, container selector, provider settings, random ids) is in
`config-shape`.

## Constants are compile-time

A program-level `const` whose value the compiler can compute (literals, objects, arrays,
arithmetic and string `+` over other constants, written `@other`) never reaches the JSON:
every `@name` is replaced by its value. A time constant (`const beat = 2s`) only exists in times
(`at 0s for @beat`). Only a `const` whose value depends on runtime data becomes a `setData`
in the init action `init-globaldata` (`initActions`), read back as `$globaldata.<name>`.
Inside an action, a `const` is folded the same way; one that is not constant becomes
`setVariable`, read as `@name` (`$scope.variables.<name>`).

## Operations live in blocks

A timeline event runs an action call, a `[ … ]` block, or an `if` / `for`. A bare operation
directly after `at …` is an error (`operation-in-timeline-event`): write
`at 0s..2s [ broadcastEvent(…) ]` or call an action.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

const welcome = "Welcome"
const beat = 2s

action greet(text: string) [
  selectElement("#title")
  setElementContent(text)
]

timeline "Intro" in "#stage" using raf {
  on enter [ on click "#next" navigate "Outro" ]
  on leave [ with "#next" { removeControllerFromElement("DOMEventListenerController") } ]
  at 0s for @beat greet(@welcome)
}

timeline "Outro" in "#stage" using raf {
  at 0s..3s target "#box" [ addClass("visible") ] [ removeClass("visible") ]
}
```

Read the output:

- `actions` holds `greet` and the generated `__nav__outro_…` action that broadcasts
  `request-timeline-uri` with `["Outro", 0]`; the click listener in `Intro`'s lifecycle action
  names it.
- `timelines` lists `Intro` first (the entry) and `Outro` second, keyed by uri (the name, for
  `raf`).
- `@welcome` became `"Welcome"` in `startAction`'s `actionOperationData`, and `@beat` became the
  range `0`–`2`. No `initActions`: every constant folded.
- `Intro`'s lifecycle action has `{ start: 0 }` and no end; its duration is the last end (2).

## Rules

- Do not edit the compiled JSON. Change the source and compile again; `eligian_compile` shows
  one timeline or action as a fragment like the one above.
- Declare the entry timeline first: the engine starts `timelines[0]`.
- Keep program-level constants for values you repeat (texts, selectors, times). A constant is not
  a variable: nothing can change it at runtime. For data that changes, use operations that
  write `$globaldata` (`setGlobalData`) or the operation data.
- Action, event action and generated names share one namespace in Eligius: two entries with the
  same name are rejected (`check` reports it before the engine does).
