# AGENTS.md — CLI compiler

Local context for the CLI package. Root rules in [`../../AGENTS.md`](../../AGENTS.md) still apply.

Command-line compiler: reads `.eligian`, drives the compiler in `@eligian/language`, bundles assets/CSS/HTML, and emits Eligius JSON (optionally a self-contained bundle).

## Layout (`src/`)
- `main.ts` — CLI entry point. `index.ts` — package exports. `compile-file.ts` — single-file compile orchestration.
- `bundler/` — asset & output bundling:
  - `asset-collector.ts`, `css-processor.ts`, `html-generator.ts`, `runtime-bundler.ts`, `inline-overhead.ts`, `url-utils.ts`, `types.ts`, `index.ts`.
- `__tests__/` — `*.spec.ts`.

## Gotchas
- This is Effect code (tagged errors, no thrown exceptions). After edits run `pnpm effect:check:cli` and drive findings to 0/0/0 — they don't surface in tsgo or `pnpm check`.
- Compiler internals live in `@eligian/language` (`packages/language/src/compiler/`), not here — see that package's `AGENTS.md`.
