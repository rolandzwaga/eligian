---
id: runtime-state-pitfalls
title: "Runtime state pitfalls"
kind: runtime
use_cases:
  - "before declaring done"
  - "stagger timing"
  - "selector matches nothing"
see:
  - "runtime-scheduling"
  - "timing-models"
  - "verification-ladder"
card: "Tested: what no check catches (source order, sub-100 ms staggers, custom, CSS-only selectors); the codes for the rest."
---

# Runtime state pitfalls: what no check catches, and the codes for the rest

A program can compile cleanly and still play wrongly. Some of these mistakes have no mechanical signature, so no check can find them; they are described first. The others are caught: `eligian check` (the `eligian_check` tool) runs a review pass over the compiled program, and `eligian smoke` plays it, and each mistake is named below with the code it is reported under. (probed: "during playback the starts run in position order, whatever the order of the events in the source") Each marker in parentheses names the test in `mcp-runtime-claims.spec.ts` that runs its sentence on the installed eligius.

## Not caught: source-order anchoring

Compiler: a `stagger` without `at`, a `sequence`, and a relative start (`at +2s`, `at +0s for 3s`) count from the end of the event before them in the source. Moving the block in the file, or inserting an event above it, moves it in time. `at <time>` or `at <label>.end` anchors it explicitly, and the editor's inlay hints show the resolved times.

- The engine never sees the source order: it runs the starts in position order, whatever the order of the events in the file. A beat that drifted after an edit raises no diagnostic and no engine error; it plays at another time, possibly before the beat it belongs to. Anchor every beat that belongs to another one with that beat's label (`at intro.end`), and read the resolved times after each edit. (probed: "during playback the starts run in position order, whatever the order of the events in the source")

## Not caught: staggers below 100 ms

- The position of a `raf` timeline moves in 100 ms ticks, and a start between two ticks runs at the next one: a `stagger 40ms` over three items from 100 ms starts one item at 0.1 s and the other two together at 0.2 s, so the cascade the source describes is not what plays. Keep a stagger step at 100 ms or more, or move a finer cascade into CSS (`transition-delay` per item) and start it with one class. (probed: "a raf timeline advances in 100 ms ticks, so starts less than a tick apart run in the same tick")

## Not caught: `custom`

Compiler: `using custom` is accepted without a diagnostic and compiled as an `animation` timeline, the type a `raf` timeline compiles to.

- A `custom` timeline therefore plays on the same 100 ms ticks as a `raf` one; no position source of your own runs behind it. Choose `raf` (see `provider-choice`). (probed: "a custom timeline plays on the same 100 ms ticks as a raf timeline")

## Not caught by default: selectors only in the CSS

Compiler: a selector or class name is checked against the names of the imported CSS and of the layout HTML together, so a `#id` or `.class` that only the CSS declares passes. The opt-in setting `eligian.validation.selectorNotInLayout` (`eligian check --selector-not-in-layout`) also requires it in the layout.

- At runtime such a selector matches nothing, and nothing fails: the operations on the empty selection do nothing and the block runs on, so the beat is silently missing. `eligian smoke --strict` reports it as `smoke-selector-miss`, at the `selectElement`. A class that operations add at runtime (`.is-visible`) is the usual case: select its elements by an id or a class the layout carries. (probed: "a selectElement that matches no element raises no engine error, and the operations after it change nothing")

## Caught: the review warnings

- `controller-imbalance`: an `on enter` adds controllers (every `on click …` and `on key …` interaction adds one) that its `on leave` does not remove. A controller survives a timeline switch unless `on leave` removes it, so the handlers stay live in the next view and pile up on every visit. (probed: "a controller attached in on enter survives a timeline switch unless on leave removes it")
- `class-never-removed`: an `addClass` that nothing in the timeline undoes. A seek ends only the ranges that no longer cover the position, and the end block is what undoes a range, so a class without its `removeClass` stays behind after every seek. (probed: "a seek ends the active actions that no longer cover the position and starts the inactive ones that do")
- `entry-timeline-without-enter`: with several timelines, the first one has no `on enter`. The first declared timeline is the one that starts, on the first position update, and its `on enter` is where the controls that reach the other timelines get wired. (probed: "the first timeline starts on the first position update (start or seek), not at init")
- `media-timeline-first-without-start-gesture`: the first timeline is a `video` or `audio` one with no `play` or `toggle` interaction in its `on enter`. The bundle calls `start()` on load, and the first timeline starts on that first position update, before any click, while browsers block media playback that no gesture started. (probed: "the first timeline starts on the first position update (start or seek), not at init")
- `host-operation-in-block-without-select`: a host operation runs with no selection before it in a block that starts fresh. Start and end blocks start from an empty operationData, so a selection made in the start block is gone in the end block. (probed: "start and end blocks are independent runs, each starting from an empty operationData")
- The same holds for `on enter` and `on leave`, which the warning covers too: each starts from an empty operationData. (probed: "on enter and on leave blocks start from an empty operationData")

## Caught: the smoke problems

- `host-operation-returned-non-object`: a host operation returned something other than its operationData, so the next operation started from an empty bag and lost the selection. (probed: "an operation that returns undefined hands the next operation an empty operationData")
- `smoke-selector-miss` (strict mode): a `selectElement` matched nothing, the case described above. (probed: "a selectElement that matches no element raises no engine error, and the operations after it change nothing")

## Before declaring done

1. Every beat that belongs to another is anchored to it by label, and the resolved times are the intended ones. (probed: "during playback the starts run in position order, whatever the order of the events in the source")
2. No stagger step, and no gap between two starts that must look sequential, is below 100 ms. (probed: "a raf timeline advances in 100 ms ticks, so starts less than a tick apart run in the same tick")
3. No timeline uses `custom`. (probed: "a custom timeline plays on the same 100 ms ticks as a raf timeline")
4. `eligian check` reports none of the review warnings above, and `eligian smoke --strict` reports no problem. (probed: "a selectElement that matches no element raises no engine error, and the operations after it change nothing")
