---
id: runtime-engine-lifecycle
title: "Engine lifecycle"
kind: runtime
use_cases:
  - "on enter / on leave"
see:
  - "runtime-scheduling"
  - "map-controllers"
card: "Tested: first start, on enter / on leave, switches, what survives them."
---

# Engine lifecycle: first timeline, on enter, on leave, switching

## When the first timeline starts

`init()` starts no timeline: the first timeline starts on the first position update, which `start()` emits at once (before any animation frame) and which a seek emits without playback, `seek(0)` included. (probed: "the first timeline starts on the first position update (start or seek), not at init") Each marker in parentheses names the test in `mcp-runtime-claims.spec.ts` that runs its sentence on the installed eligius, so an eligius upgrade that changes the behaviour fails that test before this text goes stale.

Compiler: the configuration lists the timelines in the order the program declares them, so the first `timeline` in `main.eligian` is the first timeline. Declare the entry view (a hub, a title view, the view with the Start button) first.

## on enter and on leave

Compiler: `on enter [ … ]` and `on leave [ … ]` in a timeline body become one timeline action named `timeline-lifecycle` with `duration: { start: 0 }` and no end. The enter block is its start operations, the leave block its end operations, and it does not count toward the timeline's duration.

Both blocks start from an empty operationData: nothing is selected, so each block calls `selectElement` (or uses `with`) before it adds a class, a controller or content. (probed: "on enter and on leave blocks start from an empty operationData")

`switchTimeline` ends the leaving timeline's active actions, so its `on leave` runs: this is where a view hides itself and unwires what its `on enter` wired. (probed: "switchTimeline ends the leaving timeline's active actions, so its on leave runs")

`on leave` does not run when the content ends: the lifecycle action has no end, so whatever `on enter` set up is still in place after the last beat, until something switches away. (probed: "on leave does not run when the content ends")

A switch to the timeline that is already current is a no-op: neither `on leave` nor `on enter` runs, a following `seek(0)` adds neither, and so a self-`navigate` cannot replay a view. (probed: "a switch to the timeline that is already current is a no-op")

Compiler: `on click "#next" navigate "Details"` compiles to a DOMEventListenerController on `#next` whose generated action (`__nav__details_<hash>`) is one `broadcastEvent` of `request-timeline-uri` with `["Details", 0]`, Eligian's request for a timeline switch. Each timeline therefore manages only its own view: it shows it in `on enter` and hides it in `on leave`, and no timeline hides the others.

## Controllers outlive the view

A controller attached in `on enter` survives a timeline switch unless `on leave` removes it: a click listener the hub wired still fires inside a chapter. Remove every controller `on enter` added, in `on leave`, with one `removeControllerFromElement("<Name>")` per controller on the same element. (probed: "a controller attached in on enter survives a timeline switch unless on leave removes it")

Compiler: each `on click "<sel>" <verb>` adds a DOMEventListenerController to `<sel>`, and each `on key "<keys>" <verb>` adds a KeyboardController to the timeline's container (or to the element of `in "<sel>"`). The matching `on leave` selects the same elements and removes one controller per interaction; the starters' `on leave` blocks show the pattern.

## The operationData each block starts with

- A timeline action's start block and end block are independent runs, each starting from an empty operationData: a `selectedElement` from the start block is gone in the end block. (probed: "start and end blocks are independent runs, each starting from an empty operationData")
- `on enter` and `on leave` start from an empty operationData. (probed: "on enter and on leave blocks start from an empty operationData")
- An event action (`on event "<name>" action …`) starts with only `eventArgs`. (probed: "an event action starts with only eventArgs")
- A listener action (the action an `on click … run` or `on key … run` calls) starts with the listener's actionOperationData plus `eventTarget`, and `eventKey` for keys; nothing the block that wired the listener had in its operationData reaches it. (probed: "a listener action starts with the listener's actionOperationData plus eventTarget, and eventKey for keys")
- A called action gets a copy of the caller's operationData plus its arguments, and nothing flows back: what the callee adds, changes or removes stays with the callee. (probed: "a called action gets a copy of the caller's operationData plus its arguments, and nothing flows back")
- A plain action call runs the start operations only, also when the callee is an `endable action`. (probed: "a plain action call runs the start operations only")
- Inside one block, an operation that returns `undefined` hands the next operation an empty operationData, so a host operation always returns the operationData it was given. (probed: "an operation that returns undefined hands the next operation an empty operationData")

Compiler: an action call `reveal("#title")` compiles to `requestAction` + `startAction` with the arguments, keyed by parameter name, as `actionOperationData`; `on click "<sel>" run reveal("#title")` lists `reveal` as the listener's action and passes the literal arguments as the listener's `actionOperationData`.

The working rule that follows: select in every block before you mutate, wire in `on enter`, unwire in `on leave`, and never count on data from another block. (probed: "start and end blocks are independent runs, each starting from an empty operationData")
