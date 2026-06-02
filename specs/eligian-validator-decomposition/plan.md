# EligianValidator God-Class Decomposition — Plan

**Branch:** `refactor/eligian-validator-god-class-decomposition`
**Closes:** the `EligianValidator god class (3000+ lines, 40+ methods)` anti-pattern
(CODE_ANALYSIS.md → Anti-Patterns → *Theme: God classes / god modules*).

## Goal

Split the single 3077-line `eligian-validator.ts` (one `EligianValidator` class with
~57 `check*` methods + ~15 private helpers) into focused validator classes grouped by
AST-node concern, each registered separately via `ValidationRegistry.register`. Pure,
behavior-preserving reorganization — no diagnostic, code, message, or control-flow change.

## Why now

The mechanical prerequisites already landed in prior batches (shared helpers extracted
under D5/D6/D20/D27–D30): control-flow pairing, root traversal, message formatting,
duplicate/param/label reporting, and library resolution are already single helpers. The
methods are now thin and cleanly grouped, ready to lift out. The sibling `extension/main.ts`
god module was just decomposed the same way (`commands/*`, commit 0f149d4) — proven pattern.

## Key Langium fact

`registry.register(checks, thisObj)` binds **one** `thisObj` as `this` for every check in
that map, and may be called **multiple times** (registrations accumulate). Each AST node
type in the current `checks` map belongs to exactly one concern group (verified), so we can
issue one `register` call per focused validator instance with no node-type split across
instances.

## Target file layout (`packages/language/src/validators/`)

| File | Class | Registered node types |
|---|---|---|
| `base-validator.ts` | `BaseValidator` (abstract) | — (shared state + helpers) |
| `program-validator.ts` | `ProgramValidator` | `Program` |
| `import-validator.ts` | `ImportValidator` | `Library`, `LibraryImport`, `DefaultImport`, `NamedImport` |
| `timeline-validator.ts` | `TimelineValidator` | `Timeline`, `TimelineEvent` |
| `operation-call-validator.ts` | `OperationCallValidator` | `OperationCall` |
| `action-validator.ts` | `ActionValidator` | `RegularActionDefinition`, `EndableActionDefinition`, `InlineEndableAction`, `BreakStatement`, `ContinueStatement` |
| `languages-validator.ts` | `LanguagesValidator` | `LanguagesBlock` |
| `event-action-validator.ts` | `EventActionValidator` | `EventActionDefinition` |

`eligian-validator.ts` shrinks to a **composition root**:
- re-exports `MISSING_LABELS_FILE_CODE` (consumed by `eligian-code-action-provider.ts`) and
  `isValidLanguageCode` (back-compat);
- `EligianValidator` class holds the seven sub-validator instances (constructed from
  `services`) so the existing DI entry `services.validation.EligianValidator` still resolves;
- `registerValidationChecks(services)` issues seven `registry.register(map, instance)` calls.

## Shared `BaseValidator` surface (`protected`)

Chosen because these helpers are used by **more than one** group:
- `services: EligianServices`
- `getProgram(node)` — used by program/timeline/operation/action/event checks
- `getLibrary(node)` — used by operation-call + action checks
- `reportDuplicatesByName<T>(...)` — used by program (dup actions/constants) + import (library dup actions)
- `ensureCSSImportsRegistered(program, documentUri)` — used by program + timeline + operation-call

## Group-local helpers (move with their group)

- **ProgramValidator:** `validateCSSFileErrors`, module-level `fileExistsAsync` (locales), `isValidLanguageCode` stays exported from root.
- **ImportValidator:** `resolveLibraryNode`.
- **OperationCallValidator:** `reportActionParameterCountError`, `findImportedActionByNameOrAlias`,
  `isDirectTimelineCall`, `isDescendantOf`, `reportLabelIDError`, `ensureLabelsImportsRegistered`
  (+ the `initializedLabelDocuments: Set<string>` field).
- **ActionValidator:** `validateControlFlowPairingForOps`, `validateOperationSequence`,
  `getAllOperationCalls`, `collectOperationCallsFromStatements`, `isInsideForLoop`.

## Idempotency note

`ensureCSSImportsRegistered` / `ensureLabelsImportsRegistered` write to the **shared** CSS /
labels registry services (not instance state) and already guard against re-registration, so
having three Base subclasses each able to call `ensureCSSImportsRegistered` is safe — the same
document registers once regardless of which validator instance triggers it.

## Execution order

1. `base-validator.ts` (services + 4 shared helpers).
2. Seven group files, each `extends BaseValidator`, methods moved verbatim with imports.
3. Rewrite `eligian-validator.ts` to composition root + 7-call `registerValidationChecks`.
4. Verify: `pnpm exec tsgo --noEmit` (typecheck), `pnpm run check` (biome), full language
   suite at baseline (~2001 passed / 23 skipped), language coverage CI.
5. Mark the anti-pattern section ✅ FIXED in CODE_ANALYSIS.md + re-tally the status table.

## Out of scope (left as their own follow-ups)

- `getImportedActions` memoization (needs build-cycle-aware invalidation).
- Double media file-existence check.
- Open bugs B30 (typir-langium double-invocation) and B47 (LSP bracket-detection migration).
