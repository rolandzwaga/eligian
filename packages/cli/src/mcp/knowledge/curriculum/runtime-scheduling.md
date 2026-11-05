---
id: runtime-scheduling
title: "Scheduling: ranges and seeks"
kind: runtime
use_cases:
  - "seek"
see:
  - "runtime-engine-lifecycle"
  - "map-dataflow"
card: "Tested: seeks end and start ranges, jumps skip them; DOM = f(position)."
---

# Scheduling: ranges, seeks and the DOM as a function of the position

Compiler: `at 2s..6s [ start ] [ end ]` becomes a timeline action with `duration: { start: 2, end: 6 }` (seconds on the timeline), the start block as its `startOperations` and the end block as its `endOperations`. `at 2s..6s target "#tagline" [ … ] [ … ]` puts a `selectElement("#tagline")` in front of both blocks.

## The seek model

- A seek ends the active actions that no longer cover the position and starts the inactive ones that do, the ends first. (probed: "a seek ends the active actions that no longer cover the position and starts the inactive ones that do")
- A forward jump past a whole range runs neither its start nor its end operations: with ranges at `0s..1s`, `2s..3s` and `4s..6s`, a seek from 0 to 5 ends the first and starts the third, and the second never happens. (probed: "a forward jump past a range runs neither its start nor its end operations")
- No timeline starts before the first position update: `start()` emits one at once and a seek emits one without playback, `seek(0)` included, and that update starts the first timeline. (probed: "the first timeline starts on the first position update (start or seek), not at init")

## The DOM is a function of the position

A seek only reconciles the ranges around the old and the new position, and skipped ranges never run, so what is on screen at a position must follow from the ranges that cover that position, not from the history of how the viewer got there. (probed: "a forward jump past a range runs neither its start nor its end operations") Each marker in parentheses names the test in `mcp-runtime-claims.spec.ts` that runs its sentence on the installed eligius.

- Give every range an end block that is the exact inverse of its start block (`addClass("is-visible")` / `removeClass("is-visible")`): ending the range is what undoes it when a seek leaves it, and a range with no end block has nothing to run, so its change stays behind. (probed: "a seek ends the active actions that no longer cover the position and starts the inactive ones that do")
- Select again in the end block, or use `target`: start and end blocks are independent runs, each starting from an empty operationData, so the end block has no `selectedElement` of its own. (probed: "start and end blocks are independent runs, each starting from an empty operationData")
- Cumulative state (a list that grows beat by beat, a counter, a background that changes once) cannot rely on earlier ranges having run, because a forward jump skips them: keep it in a range that covers every position where it shows, or set it up in `on enter`. (probed: "a forward jump past a range runs neither its start nor its end operations")
- An `endable action` called from a range's start block does not end with the range, because a plain action call runs the start operations only: undo its changes in the range's own end block (or call a matching action there). (probed: "a plain action call runs the start operations only")

## Switching timelines and the end of the content

- `switchTimeline` ends the leaving timeline's active actions, so its `on leave` runs, and so do the end blocks of its other active ranges. (probed: "switchTimeline ends the leaving timeline's active actions, so its on leave runs")
- `on leave` does not run when the content ends: the lifecycle action is open-ended, so a view stays set up after its last beat; its teardown belongs in `on leave`, which a switch runs. (probed: "on leave does not run when the content ends")
- A switch to the timeline that is already current is a no-op, and a following `seek(0)` runs neither `on leave` nor `on enter`: a self-`navigate` does not replay a view, so a replay has to undo the view's state itself. (probed: "a switch to the timeline that is already current is a no-op")
- A controller attached in `on enter` survives a timeline switch unless `on leave` removes it, so a keyboard shortcut wired by one view keeps firing in the next. (probed: "a controller attached in on enter survives a timeline switch unless on leave removes it")

Compiler: the interaction verbs `play`, `pause`, `toggle`, `stop` and `seek <time>` each compile to one generated listener action that broadcasts an engine request (`timeline-play-request`, `timeline-pause-request`, `timeline-play-toggle-request`, `timeline-stop-request`, `timeline-seek-request` with the position); `navigate "<timeline>"` broadcasts `request-timeline-uri` with the target timeline's uri (its name; for a `video` or `audio` timeline, its `from` path) and the position (`0` unless `at <time>` is given).

## Checklist for a timeline

1. Every beat is a range whose end block is the inverse of its start block, and both blocks select their element. (probed: "start and end blocks are independent runs, each starting from an empty operationData")
2. A seek to any position, forward or back, leaves the screen as the ranges covering that position describe it, because only those ranges are active after it. (probed: "a seek ends the active actions that no longer cover the position and starts the inactive ones that do")
3. Nothing a later beat needs depends on an earlier, possibly skipped, beat having run. (probed: "a forward jump past a range runs neither its start nor its end operations")
4. Everything `on enter` wires, `on leave` removes. (probed: "a controller attached in on enter survives a timeline switch unless on leave removes it")
