---
id: storyboard
title: "Storyboard from the brief"
kind: workflow
use_cases:
  - "new presentation"
see:
  - "decisions"
  - "project-layout"
  - "interview"
  - "brief-questions"
card: "Draft STORYBOARD.md from the confirmed brief, then approve it with eligian_brief (action: approve-storyboard) before writing code."
---

# Storyboard: draft STORYBOARD.md from the confirmed brief

The storyboard is the spec of the presentation. Draft it after the brief is confirmed (`interview`), as `STORYBOARD.md` beside `BRIEF.md`, have it approved, then write `layout.html` and `styles.css` from it, then one timeline per view. It is machine-readable on purpose: every beat row maps to one timed range and every interaction row to one listener, so before declaring done you can walk the rows and find each one in the code.

## From the brief

`approve-storyboard` checks the draft against the brief (question ids: `brief-questions`); a `storyboard-mismatch` refusal names each problem by code:

- `storyboard-ignored-rows`: a table row with another cell count than its header.
- `storyboard-views`: not exactly one `## view <name>` per S2 view.
- `storyboard-header`: `provider:` is not the distinct S6 providers; `languages:` not the L1 codes with `(default)` after the default; `assets:` not branch A's files and URLs; `host module:` is `none` but H1 is not, or the reverse.
- `storyboard-end-block`: a beat without an end block.
- `storyboard-interactions`: no row for an S4 navigation, I2 key, I1 control or V6 reaction.

## The template

```markdown
# Storyboard: <title>

- audience: <who watches, on what device>
- provider: <raf | video | audio | scroll> (<why this one>)
- languages: <en-US (default), nl-NL, …> or none
- assets: <media/intro.mp4, assets/logo.svg, …> or none
- host module: <host.ts and what it adds> or none

## view <Timeline name> (container #<id>)

enter: <what on enter sets up: show the view, wire the interactions>
leave: <the inverse: hide the view, remove every controller enter added>

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| <Timeline name> | <s> | <s> | #<id> | <operation argument> | <inverse operation argument> |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #<id> / key <Key> | <timeline, time, action call or -> | navigate / play / pause / toggle / stop / seek / run | <timeline whose on enter wires it> |
```

## Column rules

- `start` / `end`: seconds on that view's timeline. Every beat is a range; there are no point events in a storyboard.
- `selector`: an id that will exist in `layout.html` (`eligian_check` rejects selectors that are in neither the layout nor the CSS). Prefer ids for anything a beat changes.
- `change`: the operation and its argument as you will write them, for example `addClass is-visible`. A change the operations do not cover is a host module, named in the header.
- `end-block`: the exact inverse of `change` (`removeClass is-visible`). A seek leaves a range by running its end block, and a skipped range never runs at all, so a beat without an inverse leaves its change behind (see `runtime-scheduling`).
- `target` in the interactions table: the timeline name for `navigate`, the time for `seek`, the action call for `run`, `-` for `play`, `pause`, `toggle` and `stop`.
- `timeline` in the interactions table: the view whose `on enter` wires the listener. Its `on leave` removes it again.

## From rows to code

- A view is `timeline "<name>" in "#<container>" using <provider> { … }`. The first view in the storyboard is the first timeline in `main.eligian`: the entry view.
- `enter:` and `leave:` are the `on enter [ … ]` and `on leave [ … ]` blocks.
- A beat row is `at <start>s..<end>s target "<selector>" [ <change> ] [ <end-block> ]`.
- An interaction row is `on click "<sel>" <verb> …` or `on key "<Key>" <verb> …` inside that timeline's `on enter`, plus one `removeControllerFromElement` in its `on leave` (DOMEventListenerController on the clicked element; KeyboardController on the container).

## Worked example 1: two views on raf

```markdown
# Storyboard: Orbit teaser

- audience: visitors of the product page, desktop and phone
- provider: raf (no media; the views are timed text)
- languages: none
- assets: none
- host module: none

## view Intro (container #stage)

enter: show #intro, wire #next
leave: hide #intro, remove the #next listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Intro | 0 | 6 | #headline | addClass is-visible | removeClass is-visible |
| Intro | 2 | 6 | #tagline | addClass is-visible | removeClass is-visible |

## view Details (container #stage)

enter: show #details, wire #back and Escape
leave: hide #details, remove the #back listener and the keyboard listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Details | 0 | 8 | #point-1 | addClass is-visible | removeClass is-visible |
| Details | 3 | 8 | #point-2 | addClass is-visible | removeClass is-visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #next | Details | navigate | Intro |
| click #back | Intro | navigate | Details |
| key Escape | Intro | navigate | Details |
```

The code the rows become (it checks clean against a layout with those ids and a stylesheet with `.view`, `.is-active` and `.is-visible`):

```eligian
layout "./layout.html"
styles "./styles.css"

timeline "Intro" in "#stage" using raf {
  on enter [
    selectElement("#intro")
    addClass("is-active")
    on click "#next" navigate "Details"
  ]
  on leave [
    selectElement("#intro")
    removeClass("is-active")
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]

  at 0s..6s target "#headline" [ addClass("is-visible") ] [ removeClass("is-visible") ]
  at 2s..6s target "#tagline" [ addClass("is-visible") ] [ removeClass("is-visible") ]
}

timeline "Details" in "#stage" using raf {
  on enter [
    selectElement("#details")
    addClass("is-active")
    on click "#back" navigate "Intro"
    on key "Escape" navigate "Intro"
  ]
  on leave [
    selectElement("#details")
    removeClass("is-active")
    selectElement("#back")
    removeControllerFromElement("DOMEventListenerController")
    selectElement("#stage")
    removeControllerFromElement("KeyboardController")
  ]

  at 0s..8s target "#point-1" [ addClass("is-visible") ] [ removeClass("is-visible") ]
  at 3s..8s target "#point-2" [ addClass("is-visible") ] [ removeClass("is-visible") ]
}
```

## Worked example 2: captions on a video

```markdown
# Storyboard: Plant tour

- audience: trade-fair kiosk, one screen, mouse and keyboard
- provider: video (a recorded walk-through; its playback position drives the captions)
- languages: none
- assets: media/tour.mp4
- host module: none

## view Tour (container #player)

enter: wire #play, #restart and Space
leave: remove both click listeners and the keyboard listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Tour | 1 | 5 | #caption-1 | addClass is-visible | removeClass is-visible |
| Tour | 6 | 10 | #caption-2 | addClass is-visible | removeClass is-visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #play | - | toggle | Tour |
| click #restart | 0 | seek | Tour |
| key space | - | toggle | Tour |
```

```eligian
layout "./layout.html"
styles "./styles.css"

timeline "Tour" in "#player" using video from "./media/tour.mp4" {
  on enter [
    on click "#play" toggle
    on click "#restart" seek 0s
    on key "space" toggle
  ]
  on leave [
    selectElement("#play")
    removeControllerFromElement("DOMEventListenerController")
    selectElement("#restart")
    removeControllerFromElement("DOMEventListenerController")
    selectElement("#player")
    removeControllerFromElement("KeyboardController")
  ]

  at 1s..5s target "#caption-1" [ addClass("is-visible") ] [ removeClass("is-visible") ]
  at 6s..10s target "#caption-2" [ addClass("is-visible") ] [ removeClass("is-visible") ]
}
```

The `video` starter of `eligian_init` has this shape. The media file is the author's: name it in `assets` and tell the user when it is missing.

## Approval

Call `eligian_brief` with `action: approve-storyboard`; fix any mismatch and call again. The user approves in a dialog or, without one, by their reply verbatim as `confirmation` (and the `ticket`), as in `interview`. Then the brief is `approved` and the generation tools run. Later edits stay free, unless they add a view: that is an addition with its own short interview.

## Before declaring done

1. Every beat row has its `at` range in the right timeline, with that selector, that change and that end block.
2. Every interaction row has its `on …` line in the right `on enter` and its removal in the matching `on leave`.
3. Every selector in the tables is an id in `layout.html`, and every class in a change is in `styles.css`.
4. `eligian_check` reports 0 errors and 0 warnings, then `eligian_fmt` with `write: true`.
5. When the code and the storyboard disagree, change the storyboard first, then the code: the storyboard stays the spec.
6. `npx eligian dev main.eligian` shows it in a browser for a human look.
