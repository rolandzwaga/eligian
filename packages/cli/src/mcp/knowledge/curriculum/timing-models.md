---
id: timing-models
title: "Timing: seconds, milliseconds, work in flight"
kind: runtime
use_cases:
  - "wait"
  - "animate duration"
  - "click handler timing"
see:
  - "runtime-scheduling"
  - "map-events-and-interactions"
  - "runtime-state-pitfalls"
card: "Tested: ranges in seconds, wait/animate in ms; waits outlive pause, seek, switch."
---

# Timing models: timeline seconds, operation milliseconds, and work in flight

An Eligius presentation runs on two clocks. The timeline's position, in seconds, decides which ranges start and end; the operations inside a block run on wall-clock time, and the timed ones count milliseconds. (probed: "wait takes milliseconds, while the times of a range are timeline seconds") Each marker in parentheses names the test in `mcp-runtime-claims.spec.ts` that runs its sentence on the installed eligius, so an eligius upgrade that changes the behaviour fails that test before this text goes stale.

## Two units

Compiler: `at 2s..6s [ … ]` and `at 2s for 4s` compile to a timeline action with `duration: { start: 2, end: 6 }`, in seconds; a time written in milliseconds (`at 100ms`) is converted (`0.1`). `wait(300)` compiles to `wait` with `milliseconds: 300` and `animate({ opacity: 0 }, 300)` to `animate` with `animationDuration: 300`: the number of an operation argument is passed through unchanged.

- A range's times are timeline seconds, while `wait` takes milliseconds: `wait(300)` holds the rest of the block for 0.3 s of wall-clock time, and `wait(3)` is 3 ms, not 3 s. (probed: "wait takes milliseconds, while the times of a range are timeline seconds")
- `animate` takes its duration in milliseconds as well, and the block goes on only when the animation has finished: `animate({ opacity: 1 }, 800)` followed by `addClass("shown")` adds the class 0.8 s later. (probed: "animate takes its duration in milliseconds")
- The position of a `raf` timeline moves in ticks of 100 ms, so no range starts or ends more precisely than a tenth of a second; a start between two ticks runs at the next one. (probed: "a raf timeline advances in 100 ms ticks, so starts less than a tick apart run in the same tick")

## Work in flight

- Nothing cancels a `wait` that has begun. A pause does not stop the clock it waits on, and a seek past its range or a switch to another timeline lets the operations after the `wait` run first, because the range's end waits for its running start. The rest of the start block therefore still runs after the viewer has moved on, and the end block runs only when it is done. (probed: "a wait in flight is not cancelled by a pause, a seek or a timeline switch")
- A listener action, the action that an `on click … run` or `on key … run` interaction starts, is not a timeline action, so nothing ends it: a switch to another timeline does not wait for it, and its operations after a `wait` run on the next view. (probed: "a listener action runs outside the timeline, so its operations after a wait run after a switch to another timeline")
- The classic case: `on click "#hint" run flash()` with `action flash() [ selectElement("#hint") addClass("lit") wait(3000) selectElement("#hint") removeClass("lit") ]`. A viewer who clicks and navigates within three seconds gets the `removeClass` three seconds later, on a view they already left, and a viewer who comes back within those three seconds finds the class still on. (probed: "a listener action runs outside the timeline, so its operations after a wait run after a switch to another timeline")

## Keep durations on the timeline

- Put every duration a viewer should see on the timeline, as a range with an end block: `at 2s..5s [ selectElement("#hint") addClass("lit") ] [ selectElement("#hint") removeClass("lit") ]` rather than `addClass`, `wait(3000)` and `removeClass` in one block. A range ends when the position leaves it, by playback or by a seek, and its end block undoes the start. (probed: "a seek ends the active actions that no longer cover the position and starts the inactive ones that do")
- A switch away ends the range too, so the state a range set up does not leak into the next view. (probed: "switchTimeline ends the leaving timeline's active actions, so its on leave runs")
- When a click should show something for a while, let the click change state only (`addClass("lit")`), and undo that state in the timeline's `on leave`, which a switch runs; or let the click `seek` to a range that does the showing. (probed: "switchTimeline ends the leaving timeline's active actions, so its on leave runs")
- Keep `wait` for short pauses inside one block where nothing else can happen in between, such as letting a CSS transition settle before the next class (a few hundred milliseconds), never to time a beat: a pause, a seek or a switch does not stop it. (probed: "a wait in flight is not cancelled by a pause, a seek or a timeline switch")
- Keep an `animate` shorter than the range that runs it: the block waits for the animation, and the range's end waits for the block. (probed: "animate takes its duration in milliseconds")

## Checklist

1. Times on the timeline are seconds (`2s`, `500ms` converts); numbers passed to `wait` and `animate` are milliseconds. (probed: "wait takes milliseconds, while the times of a range are timeline seconds")
2. No `wait` in a listener action changes the screen after it: the viewer may have navigated by then. (probed: "a listener action runs outside the timeline, so its operations after a wait run after a switch to another timeline")
3. Every visible duration is a range with an end block, not a `wait` between two operations. (probed: "a wait in flight is not cancelled by a pause, a seek or a timeline switch")
