---
id: decisions
title: "Decisions"
kind: orientation
use_cases:
  - "which provider"
see:
  - "storyboard"
  - "project-layout"
card: "Rules for providers, timelines, action kinds; default architectures."
---

# Decisions

Make these choices before writing timelines, and record them in the storyboard header (`storyboard`). Each is a rule with the counter-example it rules out.

## Provider

**Rule:** `raf` for anything the user clicks or watches without media; `video` / `audio` when a media file is the clock (`using video from "./media/intro.mp4"`); `scroll` when the reader's scrolling is the clock (`using scroll "#scroller" duration 60s`, with `overflow-y: auto` on `#scroller` in the CSS, or check warns that it may not scroll).

**Counter-example:** `using custom` for a clock of your own. It compiles as a plain `raf` timeline; there is no way yet to plug in another position source (`not-eligian`).

## One timeline per view

**Rule:** a view the user navigates to (a slide, a chapter, a menu) is its own timeline, entered with `navigate "<name>"`. Within one view, steps are labelled ranges of one timeline (`as first`, `seek second.start`).

**Counter-example:** a whole deck as one long timeline with a seek per slide. Every seek must then reconstruct the slide's state from the ranges that cover it, and nothing marks which slide is "current" for the keyboard listeners.

## Action, endable action, event action, `on … run`

**Rule:**

- `action name(params) [ … ]`: a reusable list of operations, called from any block. A plain call runs it once; it gets a copy of the caller's data plus its arguments, and nothing flows back.
- `endable action highlight(selector: string) [ start ] [ end ]`: a pair you use as a whole range, `at 1s..4s highlight("#s1-point")`: the start block runs at 1 s, the end block at 4 s.
- `on event "<name>" action handler(…) [ … ]`: runs whenever that event is broadcast on the engine's event bus, whatever the current timeline (`events` lists the timeline events and their arguments).
- `on click "#card" run reveal("#card-detail")`: a DOM interaction that calls an action with its arguments, wired in `on enter` and removed in `on leave`.

**Counter-example:** an `on event "timeline-complete"` handler as the way to react to one button: it listens to the bus for the whole presentation. A button belongs to an interaction in its view's `on enter`.

## State lives in a range

**Rule:** the DOM is a function of the position. Every visible state belongs to a range that covers it: its start block adds the state, its end block is the exact inverse. A state that holds for the whole view goes in `on enter` and is undone in `on leave`.

```eligian
at 1s..4s target "#s2-point" [ addClass("is-visible") ] [ removeClass("is-visible") ]
```

**Counter-example:** adding a class in one short range and removing it in a later one:

```eligian
at 1s..2s [ selectElement("#a") addClass("is-visible") ]
at 5s..6s [ selectElement("#a") removeClass("is-visible") ]
```

A seek from 0 s to 3 s jumps over the first range, which then runs neither block, so `#a` is hidden where the author meant it visible. Without the second range check reports `class-never-removed`.

## CSS transitions over `animate`

**Rule:** motion is a class with a CSS `transition` (or `@keyframes`) in `styles.css`, switched by `addClass` / `removeClass`. `animateWithClass` when the block must wait for a keyframe animation to finish.

**Counter-example:** `animate({ opacity: 1 }, 500)` in a start block with no inverse in the end block. The style it leaves is inline, a seek back does not undo it, and its 500 ms run outside the timeline. Keep durations on the timeline (rule 5 of the server instructions).

## Controllers are balanced

**Rule:** every controller added in `on enter` (each `on click …` / `on key …` interaction adds one; so does `addController`) is removed in `on leave` with `removeControllerFromElement` on the same element. For an `on key` without `in`, that element is the timeline's container. Check reports `controller-imbalance` otherwise.

**Counter-example:** wiring `on key "ArrowRight" navigate "Slide 2"` in a slide's `on enter` and never removing it. Controllers survive a timeline switch, so on slide 5 every earlier slide's listener still fires.

## When to make a library

**Rule:** only when two or more programs share actions, or for a vocabulary of actions you reuse across projects (`project-layout`). One presentation is one program file.

## Default architectures

**Slide deck:** one timeline per slide, all in `#stage`; each `on enter` shows its slide and wires the keys, each `on leave` hides it and removes the keyboard controllers. `showView` / `hideView` are the actions of the `chapters` starter; `highlight` is the endable action above.

```eligian
timeline "Slide 1" in "#stage" using raf {
  on enter [
    showView("#slide-1")
    on key "ArrowRight" navigate "Slide 2"
  ]
  on leave [
    hideView("#slide-1")
    selectElement("#stage")
    removeControllerFromElement("KeyboardController")
  ]
  at 1s..4s highlight("#s1-point")
}
```

**Hub and chapters:** a hub timeline with no timed events (it waits for a click) and a button per chapter; each chapter is a timeline with a back button and `on key "Escape" navigate "Hub"`. The `chapters` starter is this architecture; start from it.

**Media annotation:** declare a `raf` hub first with a Start button, then the media timeline. Browsers may block media with sound until the user has interacted with the page; the Start click is that interaction.

```eligian
timeline "Start" in "#stage" using raf {
  on enter [
    selectElement("#hub")
    addClass("is-active")
    on click "#start" navigate "Film"
  ]
  on leave [
    selectElement("#hub")
    removeClass("is-active")
    selectElement("#start")
    removeControllerFromElement("DOMEventListenerController")
  ]
}

timeline "Film" in "#player" using video from "./media/intro.mp4" {
  at 1s..4s target "#caption" [ addClass("is-visible") ] [ removeClass("is-visible") ]
}
```

Add play / pause and restart buttons in the film's `on enter`, as the `video` starter does.

**Scrollytelling:** one `scroll` timeline with an explicit `duration`; the reader's scroll position is the time, so every fact is a range that shows it while it is in view and hides it after.

see: storyboard, project-layout
