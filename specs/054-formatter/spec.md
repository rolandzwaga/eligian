# Feature Specification: Formatter and `eligian fmt`

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-11-01
**Status**: Implemented
**Input**: Feature idea #15 of the 2026-10-22 codebase audit.

## Problem

`EligianFormatter.format()` had no rules, so Format Document did nothing, and there was no CLI
formatter.

## Rules (`packages/language/src/lsp/format-rules.ts`)

Whitespace only: Langium's formatter edits the whitespace between tokens, so comments, JSDoc and
the AST are kept.

| Construct | Result |
|---|---|
| top-level statements | one per line; at most one blank line kept; one blank line before an action, event action, timeline or languages block (unless a comment sits directly above it: then the author's spacing is kept) |
| `[ … ]` / `{ … }` written over several lines | one entry per line, 2-space indent, closing bracket on its own line, at most one blank line between entries |
| `[ … ]` / `{ … }` written on one line | stays on one line, single spaces: `[ selectElement("#a") ]` |
| start and end block | `] [` |
| keywords (`at`, `for`, `as`, `in`, `using`, `with`, …) | one space around them on a line |
| binary operators, `=` | one space around |
| `,` `:` | no space before, one after (a list written over several lines keeps its line breaks) |
| `( )` of calls, `if`, `for` | no space inside; a call written over several lines keeps its layout |
| `..`, `.`, `@`, `@@`, `$`, unary `-` / `!`, relative `+` | no space: `0s..5s`, `@beat`, `+1s` |
| time literals | `5 s` → `5s` |
| arrays / objects on one line | `["#a", "#b"]`, `{ a: 1 }`; over several lines: one element per line |
| `languages { … }` | left as written (non-default entries align under the default's code) |

A keyword that is used as a name (a parameter called `duration`) is not treated as a keyword.
Whitespace before a comment is kept as written (Langium formats comments with their own rules).

## API and CLI

- `formatSource(source, { tabSize? })` (exported from `@eligian/language`) →
  `{ text, changed, errors }`; a document with syntax errors is not formatted.
- `eligian fmt <patterns...> [--check | --write]`: `--check` (the default) lists the files that
  are not formatted with a line diff and exits 1; `--write` rewrites them. Syntax errors: reported,
  file left alone, exit 2. Patterns as for `eligian check`.
- `pnpm run fmt:examples` checks the examples.

## Tests

- Every example and fixture: text without whitespace unchanged, AST unchanged (types, properties,
  reference texts), formatting twice changes nothing; files with syntax errors are untouched.
- The examples are formatted.
- Exact output for a messy program, comments, keyword-named parameters.
- CLI: `--check` / `--write` / syntax errors / exit codes / the line diff.

## Not done

- Sorting and deduplicating named imports (a code change rather than formatting: better a code
  action).
- The optional `eligian.format.alignTimeRanges` setting.
