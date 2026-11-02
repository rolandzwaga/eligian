# Feature Specification: `at <start> for <duration>` and Optional End Blocks

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented
**Input**: Feature idea #3 of the 2026-10-22 codebase audit.

## Problem

- Inline timeline blocks required both blocks, so `at 0s..2s [ selectElement("#b") ]` was a parse
  error and `examples/eligian-tour/tour.eligian` carried 36 empty `] []` lines.
- Ranges could only be written as absolute `start..end` pairs, so every event repeated the
  arithmetic of its end time.

## Behaviour

| Syntax | Meaning |
|---|---|
| `at 2s for 3s [ ... ]` | from 2s to 5s |
| `at +0s for 3s [ ... ]` | starts where the previous event ends, lasts 3s |
| `at 500ms for 2s` | durations take any unit: ends at 2.5s |
| `at 0s..2s [ start-ops ]` | no end block: no end operations |
| `stagger 200ms items for 1s [ start-ops ]` | the inline stagger end block is optional too |

- A duration must be greater than 0 and cannot be relative (`for +2s`); both are errors in the
  editor and the compiler. A property chain as duration is reported like in every other time slot.
- `for` after a range still starts a timed `for` loop: `at 1s for 1s for (item in items) { }`.
  The forms do not conflict: a duration starts with a number, `+`, `$` or `(`, a loop with
  `(` followed by a name.
- Refactoring: on a `start..end` range whose length is statically known, the editor offers
  *Convert to '<start> for <length>'*. The length uses the unit both ends share (`2m..5m` →
  `2m for 3m`), otherwise seconds.

## Implementation

- Grammar: `TimeRange: start=TimeExpression ('..' end=TimeExpression | 'for' duration=TimeExpression)`;
  the end block of `InlineEndableAction` and of the inline `StaggerBlock` form is optional. No IR change.
- `type-system-typir/utils/time-expression.ts` `parseTimeRange` resolves `end = start + duration`;
  `containsRelativeTime` and `RELATIVE_DURATION_MESSAGE` (`utils/time-units.ts`) are shared by the
  Typir rule and the compiler.
- `compiler/transformers/timeline-transformer.ts` computes the end from the duration.
- `timeline/time-range-actions.ts` provides the conversion code action.
- The prerequisites named by the audit (unit-aware range checks, a single time-range diagnostic)
  were already fixed by the audit's high and medium fixes.
- The tour and demo examples no longer contain empty end blocks; their compiled output is
  unchanged (verified ignoring generated ids).
