# AGENTS.md — shared-utils

Local context for the shared-utils package. Root rules in [`../../AGENTS.md`](../../AGENTS.md) still apply.

Small cross-package utilities. Keep it dependency-light — it's imported by `language`, `cli`, and `extension`, so avoid pulling in heavy or platform-specific deps.

## Layout (`src/`)
- `errors.ts` — shared tagged-error definitions (`_tag` discriminants; Effect-compatible).
- `file-loader.ts` — file reading helpers.
- `path-resolver.ts` — path resolution (mind the Windows path rule in root AGENTS.md).
- `tag-guard.ts` — tagged-union type guards.
- `index.ts` — package exports.

## Gotchas
- Changes here ripple to all consumers — run a full `pnpm build` + `pnpm test`, not just this package.
- Error types feed the Effect pipeline; keep them tagged or the Effect LSP flags them as untagged global `Error`.
