---
id: layout-html
title: "Layout HTML"
kind: workflow
use_cases:
  - "write layout.html"
see:
  - "css-conventions"
  - "project-layout"
  - "runtime-engine-lifecycle"
card: "layout.html: one root, every timeline container, an id per element a timeline touches."
---

# Layout HTML

Write `layout.html` and `styles.css` before any timeline (`storyboard` first, then these two). Every selector a timeline uses must name something in them, and `eligian_project` reads them back as the list of ids and classes you may use.

## What the layout is

`layout "./layout.html"` makes the file the configuration's `layoutTemplate`. At `init` the engine renders it once into its own container (`#eligius-container`, which the `--bundle` page and `eligian dev` provide); timelines then switch, and the layout stays. So every view of the presentation is in the layout from the start, and a timeline shows or hides its own view with classes in `on enter` / `on leave`.

Without a `layout` import the compiler generates only an empty element per timeline container. Always import one.

## The shape

The starters' shape: an HTML fragment (no `<html>`, `<head>` or `<body>`) with one root, `<div id="stage">`, and inside it one section per view.

```html
<div id="stage">
  <section id="hub" class="view">
    <h1 id="hub-title" class="title"></h1>
    <button id="card-1" class="card">Chapter 1</button>
  </section>
  <section id="chapter-1" class="view">
    <p id="c1-beat-1" class="beat">The first beat.</p>
    <button id="back-1">Back to the hub</button>
  </section>
  <div class="controls"><button id="play">Play / pause</button></div>
</div>
```

Rules:

- **Every timeline container exists in the layout.** `timeline "Hub" in "#stage"` needs `#stage`; otherwise check warns `timeline-container-not-in-layout`. Several timelines may share one container; the starters put every raf timeline in `#stage`.
- **An id for every element a timeline selects**: each beat's target, each button an interaction listens on, each element a `LabelController` fills. Ids are kebab-case and say where they belong (`c1-beat-1`, `back-1`). An id that is in the CSS but not in the layout is the warning `selector_not_in_layout`: it would only match an element created at runtime.
- **Classes in the layout describe what an element is** (`view`, `beat`, `card`); state classes (`is-visible`, `is-active`) are added and removed by the program and are not written in the layout.
- **Buttons are `<button>` elements** with an id: `on click "#back-1" navigate "Hub"`. For keys, nothing is needed in the layout: an `on key` without `in` listens on the timeline's container.
- **Texts that change with the language are empty elements** filled by `addController("LabelController", "hub.title")` from `locales.json`. Fixed text can stay in the HTML.
- **Media timelines get an empty container**: `timeline "Film" in "#player" using video from "./media/intro.mp4"` with `<div id="player"></div>`. Eligius creates the `<video class="eligius-video">` inside it; size it in CSS (`#player .eligius-video { width: 100%; }`). Captions and buttons are siblings of the player, not children.
- **Images** use paths relative to `layout.html` (`<img id="poster" src="./assets/poster.svg">`). `--bundle` copies them, or inlines small ones; a missing file fails the bundle.
- **No `<script>`**: code goes in a host module (`host-modules-contract`). No inline `style` attributes for the initial state either: an inline style beats every class rule, so a state class could not override it. Put the initial state in CSS.

## Views

One section per view, hidden by default in CSS and shown by a state class:

```css
.view { display: none; }
.is-active { display: block; }
```

Each timeline adds `is-active` to its own section in `on enter` and removes it in `on leave` (`showView` / `hideView` in the `chapters` starter). No timeline hides another one's view.

## Checking it

- `eligian_project` returns `layout.ids` and `layout.classes`, and `selectors` (what a selector may name: the CSS plus the layout).
- `eligian_check` validates every selector: an id or class in neither the layout nor the CSS is an error (`unknown_css_id_in_selector`, `unknown_css_class_in_selector`).
- `eligian_smoke` (strict) reports a `selectElement` that matches no element at runtime (`smoke-selector-miss`), and a scenario snapshot shows every layout id with its classes, text and visibility.

see: css-conventions, project-layout, runtime-engine-lifecycle
