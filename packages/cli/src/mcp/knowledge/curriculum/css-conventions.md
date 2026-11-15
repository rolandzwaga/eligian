---
id: css-conventions
title: "CSS conventions"
kind: workflow
use_cases:
  - "write styles.css"
see:
  - "layout-html"
  - "decisions"
  - "presentation-patterns"
card: "Hidden by default, is- state classes with transitions; every class the program adds is in styles.css."
---

# CSS conventions

Eligius decides *when* something changes; CSS decides *how* it looks while it changes. The program adds and removes classes at the edges of ranges; the stylesheet holds the initial state, the state classes and every transition or keyframe animation.

## What check enforces

`styles "./styles.css"` imports the stylesheet; `eligian_check` validates the program against it and the layout:

- A class an operation adds, removes or toggles (`addClass("is-visible")`, also through an action parameter) must be defined in the CSS; otherwise `unknown_css_class` ("Did you mean: is-visible?" when a close name exists). A class that only appears in `layout.html` does not count.
- A selector (`selectElement`, `target`, `with`, interaction selectors) may name ids and classes of the CSS or of the layout. A name in neither is `unknown_css_id_in_selector` / `unknown_css_class_in_selector`.
- An id in the CSS but not in the layout is the warning `selector_not_in_layout`.
- The scroll container of a `using scroll "#scroller"` timeline needs `overflow-y` (or `overflow`) `auto` or `scroll` in a CSS rule; otherwise `scroll_container_not_scrollable`.

So write the rule before the call: add `.is-visible` to `styles.css`, then `addClass("is-visible")`.

## Initial state and state classes

- **Elements start in their initial state in CSS**, usually hidden: `.beat { opacity: 0; transform: translateY(0.5rem); transition: opacity 0.4s, transform 0.4s; }`.
- **A state class says what is true now**, named as an adjective with `is-`: `.is-visible { opacity: 1; transform: none; }`, `.is-active`, `.is-current`. One state class serves many elements; do not create a class per element.
- **The transition lives on the element's base rule**, so it runs both ways: the start block adds the class (fade in), the end block removes it (fade out).
- **Views**: `.view { display: none; }` and `.is-active { display: block; }`. `display` does not transition; fade the view's children instead if the switch must be soft.

The starters' `styles.css` follows exactly this: `.beat` hidden with a transition, `.is-visible` shows it, `.view` / `.is-active` for the chapters.

## Specificity

A state class must win over the base rule. Keep both at the same specificity and declare the state class after the base rule, or write the state rule with the same selector plus the class (`.beat.is-visible`). A base rule with two classes (`.term-line.out { opacity: 0 }`) beats a one-class state rule (`.is-visible`) whatever the order: write `.term-line.out.is-visible` as well. Never set state with an inline `style`: no class overrides it.

## Motion

- **Transitions** for a change between two states; **`@keyframes`** for a motion with steps (a typewriter, a pulse). `addClass` starts a keyframe animation; `animateWithClass` adds the class and waits for its `animationend` before the next operation.
- **Durations are CSS durations**, short (0.2–0.8 s). The time an element stays in a state is the length of its range on the timeline, not a CSS delay.
- **Not `animate()` or `setStyle()` for state**: they write inline styles, which a seek does not undo unless the end block writes the inverse (`decisions`).
- Respect reduced motion: `@media (prefers-reduced-motion: reduce) { .beat { transition: none; } }`.

## Media, images and layout

- Eligius renders media into the timeline's container as `<video class="eligius-video">`; size it with `#player .eligius-video { display: block; width: 100%; height: auto; }` (the `video` starter).
- `url()` paths are relative to the CSS file; `--bundle` copies the files or inlines small images.
- Give the root a size and a position: the starters' `#stage { position: relative; width: 100%; min-height: 100vh; }`, so absolutely positioned controls and captions have a frame.

## While developing

`eligian dev main.eligian` swaps changed CSS into the running page without restarting the timeline, so you can tune a transition at the position where it plays. The VS Code preview does the same.

see: layout-html, decisions, presentation-patterns
