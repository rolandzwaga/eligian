# Feature Specification: Selectors and Class Names Through Action Parameters

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-11-01
**Status**: Implemented (the configurable 'not in layout' warning is not done)
**Input**: Feature idea #18 of the 2026-10-22 codebase audit.

## Problem

CSS validation (spec 013) only checked string literals passed directly to an operation's selector
or className parameter. Most selectors go through actions (`spotlight("#tok-timeline")`, about 150
call sites in the tour), so typos got no error, completion or suggestion. Ids were checked against
the CSS only, while most of them live in the layout HTML.

## Parameter roles (`css/parameter-roles.ts`)

`parameterRoles(action)` → `Map<parameter, 'selector' | 'className'>`:

- a parameter passed (as a bare reference) to a selector input of an operation
  (`ParameterType:selector` in the registry) or to a `with` block is a **selector**; to a
  `ParameterType:className` input a **className**;
- passed to a parameter of a called action, it takes that parameter's role (recursively, also
  into library files through the resolved references; a recursion contributes nothing);
- used for both roles, or only inside an expression (`"#" + id`): no role.

Roles are computed when needed, not cached: a library action can change without the AST of the
actions calling it changing.

## Checks and editor support

- `checkActionCallCssArguments` validates string literals passed for role-tagged parameters:
  selectors through the shared `reportSelectorIssues`, class names against the CSS classes.
- `css/selector-sources.ts`: the names a **selector** may use are the CSS classes and ids plus the
  layout HTML's (`layout` import, through the HTML registry or the file; scans cached by content).
  Used by every selector check: operations, actions, `navigate`, `target` / `with`, the timeline
  container. Class-name arguments stay CSS-only.
- Ids in selectors get *did you mean* suggestions; `css/did-you-mean-fix.ts` offers
  *Change to '…'* (preferred: the first suggestion) for any unknown class or id with suggestions.
- Completion: in a string argument of a role-tagged parameter, class / id completions as for the
  operations (selector completions include the layout's names).
- The hover of an action lists its role-tagged parameters; signature help shows "CSS selector" /
  "CSS class name" in the parameter documentation.

## Not done

- A configurable 'not in layout' warning for selectors that only match the CSS.
