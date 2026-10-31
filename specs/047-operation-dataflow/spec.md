# Feature Specification: Operation-Data Dataflow with Inferred Action Contracts

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented
**Input**: Review of the dependency check behind "addClass without a prior selectElement". The
check was generic (registry dependencies vs. outputs of earlier operations) but existed three
times with different rules, started every action from an empty state, and ignored operations
with dynamic outputs. Decision: option D (inferred contracts) with the recommended defaults.

## Problem

Eligius passes one `operationData` object through an action's operations. An operation can
declare dependencies (properties it reads, e.g. `addClass` needs `selectedElement`) and outputs
(properties it adds, e.g. `selectElement` adds `selectedElement`). Before this change:

1. **Three diverging implementations.** The compiler walked the flat IR (outputs only, no branch
   semantics, no erasure). The IDE's `OperationDataTracker` also tracked non-erased parameters,
   erased outputs and if/else intersection, in two validator copies. A third, disabled copy in
   the parameter validator checked against an always-empty set. They disagreed (e.g. a property
   produced only in the `then` branch: IDE error, compiler pass).
2. **Wrong starting state.** Every action started empty. At runtime only some entry points do:

   | Entry point | Starting operationData |
   |---|---|
   | Timeline action, init action, sequence/stagger item | empty (plus the call's arguments) |
   | Event action | `{ eventArgs }` |
   | `startAction` / `endAction` from another action | the caller's whole operationData, merged with the call's arguments |
   | DOMEventListenerController | `actionOperationData` + `eventTarget`; each listed action's result merges into the next |

   So `action highlight() [ addClass("on") ]` called right after a `selectElement` was rejected
   although it works.
3. **Dynamic outputs ignored.** `setOperationData`, `setData`, `removePropertiesFromOperationData`
   and `clearOperationData` change arbitrary properties, invisible to both checks.

After a called action finishes, the caller continues with the operationData it had before the
call plus `actionInstance` (eligius `start-action.ts`): a callee's outputs never flow back.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Starting state for called actions | Inferred contract (option D): requirements propagate to call sites |
| 2 | Unknown callers (dynamic controller action lists, host code, `requestAction` by hand) | The contract is not checked there; no diagnostic |
| 3 | Dynamic-output operations | Literal keys are modelled; non-literal arguments make the state unknown (no further missing-property diagnostics on that path) |
| 4 | Where it lives | One shared analysis module, used by the IDE validator and the compiler; the three old copies are removed |

## Behaviour

### Contract inference

Each action body (start and end blocks of endable actions separately) is analysed from a state
holding the action's own parameters (they arrive as operationData keys). A dependency that is not
available at that point and was not erased inside the action becomes a **requirement** of the
action. It is assumed available afterwards. Requirements of called actions that the caller cannot
provide at the call point become requirements of the caller, transitively. Recursive call cycles
converge by fixed-point iteration (sets only grow).

### Diagnostics

| Code | Where | When |
|---|---|---|
| `missing-dependency` | operation in an entry body | dependency never created on the path |
| `missing-action-dependency` | action call in an entry body, or a controller action-list entry | the caller cannot provide a requirement of the called action |
| `erased-property-access` | operation or action call, anywhere | the property was erased by an earlier operation on the path |

Entry bodies: event actions, inline timeline blocks (`at .. [ ] [ ]`), timed `for`/`if`, inline
stagger blocks, and timeline-level action calls (`at`, `sequence`, `stagger ... with`). Regular and
endable action bodies only report erasures; their unmet dependencies become requirements.

Library actions are checked at the consumer's call sites; a library file on its own never shows a
missing-dependency error. The requirements of an action are shown in its hover.

### State model (shared with the former tracker)

- Dependencies are checked first; non-erased parameters stay on operationData; erased parameters
  and erased outputs are removed (and recorded, for the "erased by" message); outputs are added.
- `if/else`: each branch starts from the pre-branch state; after the join only properties
  available in both branches remain. `for`: the body may run zero times, so its state is
  discarded.
- Action calls: `requestAction` adds `actionInstance`; the callee's requirements are checked;
  the callee's outputs are not added.
- `addController(...)` is checked as `getControllerInstance` + `addControllerToElement`;
  `on click ... navigate` as `selectElement` + `getControllerInstance` + `addControllerToElement`.
- `setOperationData({ k: ... })` adds `k` (with `override: true` the state becomes exactly the
  literal keys); `setData({ "$operationdata.k": ... })` adds `k`;
  `removePropertiesFromOperationData(["k"])` and `clearOperationData(["k"])` remove `k`;
  `clearOperationData()` empties the state. Non-literal arguments make the state unknown.

## Implementation

- `packages/language/src/dataflow/operation-dataflow.ts`: the shared analysis
  (`OperationDataflow`: contracts, document analysis, diagnostics).
- `packages/language/src/operation-data-tracker.ts`: the state model, extended with the unknown
  state and literal-key edits.
- IDE: `validators/dataflow-validator.ts` runs the analysis once per document; the old per-node
  checks in `action-validator.ts` and `operation-sequence-validator.ts` and the disabled
  `checkDependencies` are removed.
- Compiler: `transformAST` runs the same analysis and fails on its first diagnostic; the IR-level
  `validateOperationSequence` and `validateDependencies`/`trackOutputs` are removed.
- Hover: action hovers list the inferred requirements.
