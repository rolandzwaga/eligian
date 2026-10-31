# Feature Specification: Sequence Items with Inline Blocks, `each` / `then` and Labels

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented
**Input**: Feature idea #11 of the 2026-10-22 codebase audit.

## Problem

A sequence item only accepted `action() for <duration>`, so the most common shape in a
click-paced presentation, a run of beats with inline bodies, had to be written as `at` events
with hand-computed ranges. Every tour beat also started with the same `clearSpots()` (30 times),
and inserting a beat meant renumbering every later range.

## Syntax

```
sequence each [ clearSpots() ] then [ log("beat done") ] {
  for 7s as explain [ narrate("An action is a named list…") ] [ hideBlock("#code") ]
  intro() for 5s
  for explain.end - explain.start [ narrate("…") ]
}
```

Grammar:

```
SequenceBlock:
    'sequence'
    ('each' '[' prelude+=OperationStatement* ']' ('then' '[' postlude+=OperationStatement* ']')?)?
    '{' items+=SequenceItem* '}';

SequenceItem:
    actionCall=OperationCall 'for' duration=TimeExpression ('as' name=Identifier)? |
    'for' duration=TimeExpression ('as' name=Identifier)?
    '[' startOps+=OperationStatement* ']' ('[' endOps+=OperationStatement* ']')?;

type LabeledEvent = TimedEvent | SequenceItem;   // targets of `label.start` / `label.end`
```

`each` and `then` are contextual keywords (still valid names).

## Compiled form

Each item is one timeline action, as before:

- start operations: the prelude, then the item's start block (or requestAction + startAction);
- end operations: the item's end block (or requestAction + endAction for an endable action), then
  the postlude. `then` operations are end operations (an endable action called there is ended);
- the prelude, the item's blocks and the postlude share one constant scope per item;
- names: `sequence-<action>-<start>-<end>` for call items, `sequence-item-<start>-<end>` for
  inline items.

Labels are registered as the items compile, so a later item of the same sequence may use an earlier
item's label; `at` events after the sequence may use any of its labels.

## Editor

- Operations are allowed in the blocks; dataflow, control-flow pairing and completion treat them
  like an inline `at` block's. The `each` / `then` blocks are analyzed for every item, but each
  finding is reported once.
- Label scope and checks (earlier events only, unique per timeline) cover sequence items.
- Inlay hints show an item's time after its duration: `for 7s ‹0s..7s› [ … ]`.

## Tour

Chapters 2 to 6 are `sequence each [ clearSpots() ] { … }`; chapter 1 stays a list of `at` events
(that is what it teaches). In chapter 4 the `editBeat` label is on a sequence item and the
anchored stagger follows the sequence. Compiled times are unchanged; each converted chapter's first
beat now also runs `clearSpots()`.

## Not done

- No snippet for the inline item form (the `sequence { }` completion still inserts a call item).
