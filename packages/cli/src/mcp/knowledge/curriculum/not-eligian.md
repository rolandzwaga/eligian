---
id: not-eligian
title: "Not in Eligian"
kind: orientation
use_cases:
  - "does eligian support"
see:
  - "syntax-cheatsheet"
  - "decisions"
card: "What Eligian lacks (tweens, JavaScript, return values) and alternatives."
---

# Not Eligian

Models write Eligian from their priors: TypeScript, CSS, GSAP, video players. Every line below is something Eligian does not have, followed by what to write instead. If a construct is in neither `syntax-cheatsheet` nor this list, assume it does not exist and ask. Inventing syntax costs a check round at best and a silent runtime bug at worst.

## Animation

- **No tween library** (GSAP, anime.js, Framer Motion, Remotion). Eligius schedules *when*; CSS does *how*. Write a state class with a CSS transition, add it in a range's start block and remove it in the end block: `at 2s..6s [ reveal("#title") ] [ conceal("#title") ]`.
- **No CSS in the DSL**: no `@keyframes`, no style rules, no inline style objects as a styling system. Put `@keyframes` and classes in `styles.css`. `addClass` starts a keyframe animation; `animateWithClass` adds the class and waits for its `animationend`.
- **No millisecond choreography inside a block.** `wait(ms)` and `animate(properties, ms)` (a jQuery animation) exist, but their milliseconds run outside the timeline. Put timing on the timeline as ranges; use `animate` only for a property a class cannot express.

## JavaScript

- **No `let`, `return`, `while`, arrow functions or JavaScript expressions.** Actions are lists of operations. Write `const` for values (a program-level `const` is `$globaldata.<name>`, one inside an action is `@name`), `if (…) { } else { }` (with `else if`), and `for (item in collection) { }` with `break` / `continue`.
- **No inline JavaScript or DOM code.** Real code goes in a host module: `extensions "./host.ts" { operation trackEvent(eventName: string) }`, then call `trackEvent("start")` like any operation. A host operation declares no needs or outputs, so select before you call it.
- **No HTML or JSX in `.eligian`.** The markup lives in `layout.html`; a fragment can be imported (`import hint from "./hint.html"`) and inserted with `setElementContent(@hint)` (a named import is read as `@name`).

## Actions and data

- **No return values from a called action.** A called action gets a copy of the caller's operation data plus its arguments, and nothing flows back. Make the action do the whole job (select and mutate), or compute the value in the caller's block.
- **No variables shared between timelines** other than global data. A program-level `const` is visible to every timeline as `$globaldata.<name>`; at runtime `setGlobalData` copies properties of the operation data into global data.
- **No state from a start block in its end block.** Both start from empty operation data, so an end block selects its element again (or use `at … target "#el" [ … ] [ … ]`, which selects in both).
- **No timelines, lifecycle blocks or event actions in a library**: a `library` file holds only actions.

## Navigation and time

- **No relative seek.** `seek +5s` is accepted, but it goes to the absolute position 5 s, not 5 s ahead. For next / previous, label the events (`at 0s for 4s as first`, `at first.end for 4s as second`) and bind each key or button to a fixed target (`on key "ArrowRight" seek second.start`), or give each step its own timeline and `navigate` between them.
- **No keyboard-stepped deck provider.** Eligius' keyboard step source is not reachable from Eligian. Build a deck as one timeline per slide, each with `on key "ArrowRight" navigate "Slide 2"` in `on enter`, removed in `on leave`.
- **No playlists, timeline flow or container providers.** Eligian emits none of them. Chain views with `navigate` and event actions instead.

## Media

- **No `muted`, `poster`, `controls` or `autoplay` options.** After `using video` / `using audio` the header takes only `from "<file>"`, `loop` and `duration`. The video element has no native controls: build play, pause and seek with interactions (`on click "#play" toggle`, `on click "#restart" seek 0s`). For a poster, show an image in the layout until playback starts.
- **No HLS or DASH streams, and no YouTube or Vimeo URLs.** The video provider plays a file the browser's `<video>` element can play (MP4, WebM, MP3). Put the file in `media/` and name it in `from "./media/intro.mp4"`.
- **No autoplay on load you can count on.** Browsers block media with sound until the user interacts with the page. Give every media presentation a visible start or play button.

## Providers

- **`using custom` gives you no custom position source.** It is accepted with no diagnostic and compiles as an `animation` timeline driven by requestAnimationFrame, exactly like `raf`. Eligian has no way to register your own position source for it yet. Use `raf` for time-driven views, `video` / `audio` for media, and `scroll` (with a `duration`) for scroll-driven stories.

## Selectors and files

- **No selectors or classes that the layout and CSS do not know.** A selector must name something in `layout.html` or the imported CSS, and a class you add or remove must be in the CSS (errors `unknown_css_id_in_selector`, `unknown_css_class`). `eligian_check` also warns about an id that is in the CSS but not in the layout. Add the element or the rule first.
- **No absolute paths or URLs in imports.** Every import path is relative to the importing file (`"./layout.html"`, `"./lib/effects.eligian"`).
- **No second `layout`, `styles`, `provider` or `locales` default import.** One of each per program; other assets come in as named imports.

see: syntax-cheatsheet, decisions
