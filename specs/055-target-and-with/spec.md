# Feature Specification: `target`, `with` and the 'Insert selectElement' Quick Fix

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-11-01
**Status**: Implemented
**Input**: Feature idea #17 of the 2026-10-22 codebase audit.

## Problem

Every start and end block starts with empty operation data, so each block that changes an element
opens with `selectElement(...)`, repeated in start blocks, end blocks and actions; forgetting it is
the most common runtime mistake, and the dataflow error had no quick fix.

## Syntax

```
at 0s..5s target "#box" [ addClass("visible") ] [ removeClass("visible") ]
action clearSpots() [ with ".tok" { removeClass("spot") } with ".callout" { removeClass("show") } ]
```

Grammar: `TimedEvent: 'at' TimeRange ('as' name)? ('target' target=STRING)? TimelineAction`;
`WithStatement: 'with' selector=Expression '{' body+=OperationStatement* '}'` (an
OperationStatement). `target` is a contextual keyword; `with` already was one.

## Compiled form

- `target`: `selectElement({ selector })` is prepended to the event's start operations and, when
  there are any, to its end operations: inline blocks, endable action calls (the called action
  inherits the selection), `if` / `for` events.
- `with`: `selectElement({ selector })` then the body. A runtime selector (`"#" + id`) is lowered
  like an operation argument (allowed in the runtime-concatenation check). The selection is not
  restored after the block.

## Editor

- Dataflow: a target selects before each analyzed block; `with` applies selectElement then walks
  its body (the selection stays).
- CSS: the target string and a string `with` selector go through the selector validation (the
  shared reporter now highlights just the `target` property).
- Quick fix on `missing-dependency` / `missing-action-dependency` diagnostics about
  `selectedElement`:
  - *Insert selectElement(…)* before the operation, inline or on a line of its own with the same
    indentation; selector: the sibling start/end block's `selectElement`, an earlier one in the
    same block, a selector-like action parameter (`sel`, `selector`, `target`, `element`), else `""`;
  - *Add target "…"* for an action called directly as an `at` event (the error is at the call),
    with the argument passed to the action's selector-like parameter.
- Formatter: `target` spacing; a `[` opening a block after a token on the same line gets one space.

## Tour

`presentation.eligian`'s `clearSpots` uses `with`; the compiled tour is identical (ids aside).
