# Feature Specification: Timeline Lifecycle Blocks (`on enter` / `on leave`)

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented
**Input**: Feature idea #6 of the 2026-10-22 codebase audit.

## Problem

Eligius has no per-timeline setup hook. Multi-timeline presentations (the tour has 7 timelines)
started every timeline with `at 0s..3600s [ showView(..) + navigate wiring ] [ hideView(..) ]`:
an endable action longer than the content, so its end operations only ran when the engine left
the timeline. Every compiled timeline then reported `duration: 3600`, and relative times and
staggers after the block were anchored an hour out.

## Syntax

```
timeline "Logic" in "#stage" using raf {
  on enter [ showView("#ch3") on click "#c3-to-hub" navigate "Hub" ]
  on leave [ hideView("#ch3") ]
  at 0s for 7s [ narrate("const names a value") ]
}
```

Grammar: `Timeline: ... '{' (lifecycle += TimelineLifecycle | events += TimelineEvent)* '}'`,
`TimelineLifecycle: 'on' kind=('enter' | 'leave') '[' operations += OperationStatement* ']'`.
`enter` and `leave` are contextual keywords (in `Identifier`), like `loop` and `duration`.

## Compiled form

One timeline action, first in `timelineActions`:

```json
{ "name": "timeline-lifecycle", "duration": { "start": 0 },
  "startOperations": [ ...on enter... ], "endOperations": [ ...on leave... ] }
```

- No `end`: Eligius' configuration resolver reads a missing end as -1 and the engine as
  Infinity (`eligius-engine.ts` `actionEnd`), so the action covers every position.
- It is built after duration inference and outside the event loop, so it is not part of the
  inferred duration and does not move `previousEventEndTime`.
- The IR marks it `lifecycle: true` (IR `end: -1`); the emitter omits the end. The optimizer
  keeps it (it already keeps actions whose end is not a number).
- `on leave` operations are end operations: an endable action called there compiles to
  `endAction`.

## Engine behaviour (checked against the Eligius 3 engine)

| Moment | What the engine does | Lifecycle action |
|---|---|---|
| Timeline becomes active (first timeline, `switchTimeline`) | reconciles the actions covering the start position | started: `on enter` runs |
| Seek / scrub / loop restart | ends actions not covering the target, starts those that do | keeps running |
| Content ends (`timelineComplete`) | only emits the event | keeps running: views stay up |
| `switchTimeline` / navigate away | ends every active action of the old timeline | ended: `on leave` runs |
| `stop()` / `destroy()` | ends the active actions | ended: `on leave` runs |

`timeline-lifecycle-engine.spec.ts` runs a compiled two-timeline program on the real engine
and checks enter, leave on switch, and the view staying up past the content.

## Rules (editor and compiler)

- At most one `on enter` and one `on leave` per timeline (`duplicate_lifecycle_block`; the
  compiler fails with the same message).
- Operations are allowed in the blocks (not "operation used directly in a timeline event");
  operation dataflow, control-flow pairing and completion treat them like inline `at` blocks.
- A timeline with only lifecycle blocks is not "empty"; its duration is 0.

## IDE

- Completion in a timeline body offers `on enter [ ]` / `on leave [ ]` while the timeline has
  none; the extension's `chapter` snippet uses them.
- TextMate grammar highlights `on enter [` / `on leave [`.

## Tour

All 7 setup blocks were converted; the timelines now report their real durations (hub 0s,
chapters 42s to 48s).

## Not done

- No hover, Outline or inlay-hint label for the lifecycle action (the IR flag allows it).
- The tour's CSS progress bar was not replaced by Eligius' ProgressbarController, which the
  real durations now make possible.
