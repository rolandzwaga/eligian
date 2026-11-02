# Feature Specification: Runtime String Concatenation and Runtime Value Forwarding

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented
**Input**: Follow-up to the 2026-10-22 codebase audit. Audit fix #10 made arithmetic on runtime
values a compile error (it used to compile to an inert string). That also removed `"#" + slideId`,
which authors relied on. Restore it as a real runtime feature, and fix the related forwarding hole
(audit feature idea #1).

## Problem

Eligius does not evaluate expressions in operation data. A property chain such as
`$operationdata.slideId` is resolved only as a whole string, and only by the operations that
resolve their own inputs (`selectElement`, `setStyle`, `createElement`, `calc`, `math`, `forEach`,
`broadcastEvent`, `setData`, `setOperationData`, `when`). Two consequences:

1. `selectElement("#" + slideId)` has no JSON form. Before audit fix #10 it compiled to the inert
   string `("#" + "$operationdata.slideId")`.
2. A runtime value passed to any other operation arrives as literal text. Inside an action,
   `setElementContent(label)` inserted `$operationdata.label`; `wait(duration)` waited on a string;
   `inner(sel)` overwrote the caller's `sel` with the chain text; an event action's
   `setElementContent(name)` showed `$operationData.eventArgs.0`. Only arguments forwarded under
   the operation's own parameter name, or given to a self-resolving operation, worked.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Where does the logic live? | In the compiler only. It lowers to operations Eligius 3.0.1 already has; no engine release needed. |
| 2 | Surface syntax | `+` only. Template strings are out of scope. |
| 3 | Scope | String concatenation plus the forwarding fix. Runtime arithmetic stays an error (use `calc`). |
| 4 | Clobbering `$operationdata.result` | Private temp keys when needed; save/restore `result` when the action uses it itself. |

## Behaviour

### When `+` is a runtime concatenation

`+` concatenates when an operand is statically a string: a string literal, a parameter annotated
`: string`, a `const` with a string value, or another concatenation. Evaluation is left to right as
in JavaScript, so `a + b + "px"` with untyped `a`, `b` is an addition (compile error) followed by a
concatenation. Untyped parameters, property chains and system properties have no static type, so
`a + b` over them is never treated as a concatenation (Eligius would join `1` and `2` into `"12"`).

### Where it is allowed

Operation arguments, action call arguments (in actions, event actions, inline blocks, timeline
events, sequences and staggers) and action-level `const` values, at any depth of object and array
literals. Elsewhere (`if` conditions, `for` collections, time expressions, program-level consts) it
is a compile error, reported identically by the editor.

### Lowering

Per concatenation:

```
setOperationData({ properties: { strings: ["#", "$operationdata.slideId"] } })
concatenateStrings()                                   // → $operationdata.result
```

The consumer then reads `$operationdata.result`: directly when it is a self-resolving operation,
otherwise through the forwarding step below. With several concatenations in one operation, each
result is copied to `__eligianConcat<N>`, and those keys plus `result` are removed after the
operation. When the enclosing action or timeline reads `$operationdata.result` or calls an
operation that writes it (`concatenateStrings`, `replaceString`), `result` is saved to
`__eligianSavedResult` and restored.

### Forwarding

A top-level operation property whose value contains a property chain, on an operation that does
not resolve that property itself, is moved into a `setOperationData` emitted just before the
operation. That resolves it, recursively inside objects and arrays, against the same operation data
and scope the operation would see. Same-name forwards stay omitted, as before. For nested action
calls, an argument that forwards the caller's parameter of the same name is now omitted too, since
`startAction` already merges the caller's operation data into the callee's.

## Implementation

- `packages/language/src/compiler/runtime-concat.ts`: AST classification shared by the compiler and
  the validator (`isStringTyped`, `getConcatOperands`, `isConcatRoot`, `isInConcatContext`).
- `packages/language/src/compiler/transformers/runtime-values.ts`: placeholder collector, lowering
  (`lowerRuntimeValues`), self-resolving property table, `result` preservation.
- `expression-transformer.ts`: runtime concatenations become placeholders when a collector is in
  scope, else a located TransformError.
- `operation-transformer.ts` and `timeline-transformer.ts`: statements and timeline action calls
  are transformed with a collector and lowered.
- `validators/expression-validator.ts`: same acceptance rules and messages, reported once at the
  chain root (codes `runtime_concat_context`, `runtime_concat_operand`).

## Tests

- `compiler/__tests__/runtime-concatenation.spec.ts`: compiled operations are run through the real
  Eligius operation functions under jsdom (selector building, non-resolving targets, private keys,
  action call arguments, consts, `result` preservation, event arguments, if/for bodies, timeline
  calls) plus rejection cases.
- `validators/__tests__/runtime-concat-validator.spec.ts`: editor/compiler parity for accepted and
  rejected programs, diagnostic ranges.
- `compiler/__tests__/examples-compile.spec.ts` compiles `examples/demo.eligian`, which uses
  concatenation again.
