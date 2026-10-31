# Feature Specification: Time Constants, Event Labels and Stagger Anchors

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented
**Input**: Feature idea #10 of the 2026-10-22 codebase audit.

## Problem

Time expressions accepted only literals, relative literals and arithmetic. Authors could not
name a recurring length (`const beat = 7s`) or refer to another event's start or end, and a
stagger took its base time from its position in the document, so reordering events changed it
(the tour had a comment explaining exactly that).

## Syntax

```
const beat = 7s
const outro = @beat * 2 + 500ms

timeline "Tools" in "#stage" using raf duration closing.end + 1s {
  at 15s for @beat as editBeat [ ... ]
  stagger 200ms ["#a", "#b"] at editBeat.end with reveal() for 1.5s
  at editBeat.start + 3s for @outro as closing [ ... ]
}
```

Grammar:

- `Literal` gains `TimeValue: value=NUMBER unit=TimeUnit` (a time with a unit as an expression).
- `PrimaryTime` gains `VariableReference` (`@beat`) and
  `EventTimeReference: event=[TimedEvent:Identifier] '.' edge=ID`.
- `TimedEvent: 'at' TimeRange ('as' name=Identifier)? TimelineAction`.
- `StaggerBlock` gains `('at' anchor=TimeExpression)?` after the items.

No new keywords: `as` and `at` already existed; `start` / `end` are plain identifiers checked by
the validator (`edge=ID`), so they stay valid names everywhere.

Constants are referenced with `@` in times too (the audit proposed a bare `beat`), consistent with
every other constant reference and reusing its scoping, hover and rename.

## Semantics

| Construct | Value |
|---|---|
| `@beat` | the constant's value in seconds: time values (any unit), numbers (like a unitless time literal), `+ - * /`, unary `-`, other constants |
| `intro.start` / `intro.end` | the compiled start / end of the labeled event |
| `stagger … at <t>` | the first item starts at `<t>` (relative times count from the previous event's end); later items `<t> + i × delay` |

- A time can only refer to labels of **earlier** events of the same timeline: references never
  form cycles. The timeline header's `duration` is evaluated after all events and may refer to any
  label (`duration closing.end + 1s`).
- Time constants exist only at compile time: they are not put into global data
  (`init-globaldata`).

## Shared evaluation

`utils/time-constants.ts` (`timeConstantValue`, `isTimeConstant`, messages) is used by:

- the compiler (`time-transformer.ts`, which also resolves labels from the times compiled so
  far, and `timeline-transformer.ts` for labels and anchors);
- the IDE's time resolver (`time-resolver.ts`: inlay hints, `▶ Preview from …` CodeLenses), which
  resolves labels in the same order;
- the Typir time utilities (`extractTimeValue` / `parseTimeRange`: range checks with constants).

## Diagnostics (editor; the compiler fails with the same messages)

| Code | When |
|---|---|
| `time_value_placement` | `7s` outside a program-level const value |
| `time_constant_misuse` | a time constant in an operation argument or other non-time position |
| `invalid_time_constant` | `@x` in a time where `x` is not a time (a string, a cycle, division by zero) |
| `event_label_not_before` | a label of the same or a later event |
| `invalid_event_edge` | `intro.middle` |
| `duplicate_event_label` | the same label twice in a timeline |
| (navigate) | a label in a `navigate … at` position |

## Tour

Chapter 4's stagger is anchored at its beat (`at editBeat.end`) instead of relying on its
position; the compiled times are unchanged.

## Not done

- Labels on sequence items and stagger blocks (idea #11 proposes `as <name>` for sequence items).
- Completion of `.start` / `.end` after a label, and a hover for event time references.
