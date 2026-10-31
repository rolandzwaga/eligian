# Feature Specification: Timeline Header Options (`scroll`, `loop`, `duration`)

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented
**Input**: Feature idea #9 of the 2026-10-22 codebase audit.

## Problem

The compiler always emitted `loop: false`, the duration was always inferred from the last event,
and Eligius 3's `ScrollPositionSource` (scroll-driven storytelling) could not be used.

## Syntax

```
timeline <name> in <container> using <provider> [<scrollSelector>] [from <source>] [loop] [duration <time>] { ... }
```

| Example | Result |
|---|---|
| `using raf loop duration 30s` | `loop: true`, `duration: 30` |
| `using scroll "#scroller" duration 120s` | animation timeline, `positionSource: { systemName: 'ScrollPositionSource', selector: '#scroller', duration: 120 }` |
| `using scroll duration 60s` | the scroll element is the timeline container |

## Rules (editor and compiler)

- A scroll timeline requires `duration` (the compiler fails with the same message).
- Only scroll timelines take a scroll selector.
- The duration must be positive and not relative; property chains are reported like in every
  other time slot.
- An `at` event ending after an explicit duration gets a warning.
- `loop`, `duration`, `scroll` are contextual keywords (still valid names).
- Timeline hover: provider, container, effective duration (explicit or the last event's end),
  loop.

## Engine check

Eligius applies a per-timeline `positionSource` naming another `systemName` instead of the
type's settings (eligius `configuration/types.ts`). `timeline-scroll-engine.spec.ts` initializes
the real engine with a compiled scroll timeline and checks it runs on a `ScrollPositionSource`
with the configured duration.

## Not done

- The audit's "real video selector" part was already fixed: media timelines emit their container
  selector in the per-timeline position source.
- The preview does not create a scrollable container: a scroll timeline needs a layout with a
  scrollable element (`overflow: auto` and taller content).
