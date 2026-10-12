# AGENTS.md — `@eligian/language`

Local context for the language package. Root rules in [`../../AGENTS.md`](../../AGENTS.md) still apply.

The core package: Langium grammar + LSP (validation, scoping, hover, completion), the Typir type system, **and** the Effect-ts compiler. Most repo logic lives here.

## Layout (`src/`)
- `eligian.langium` — grammar. **After editing, run `pnpm langium:generate`** before anything else; never hand-edit `generated/`.
- `eligian-validator.ts` (+ `validators/`) — semantic validation.
- `eligian-scope-{provider,computation}.ts`, `eligian-{hover,completion,code-action}-provider.ts` — LSP services. `eligian-module.ts` — Langium DI wiring. `eligian-formatter.ts`, `eligian-document-validator.ts`, `operation-data-tracker.ts`.
- `compiler/` — Effect-based DSL→Eligius JSON pipeline: parse → validate → type-check → transform → optimize → emit. `pipeline.ts` exports `compile`. Key modules: `ast-transformer.ts`, `type-checker.ts`, `optimizer.ts`, `constant-folder.ts`, `expression-evaluator.ts`, `emitter.ts`, `error-reporter.ts`, `name-resolver.ts`; `effects/` (`Compiler.ts`, `FileSystem.ts`, `Logger.ts`, `layers.ts`); `types/eligius-ir.ts`; `constants.ts`, `html-import-utils.ts`. Subdirs: `pipeline/` (parser, services, library-loader, document-errors), `transformers/` (per-construct: action, timeline, operation, expression, time, config-builder, library-imports, scope, source-location), `operations/` (operation registry — `registry.generated.ts` is produced by `generate-registry.ts`, do not hand-edit — plus mapper/validator), `utils/`.
- `type-system-typir/` — Typir + typir-langium type system (opt-in static typing). See its `README.md`.
- `css/` — CSS class/selector validation + IDE helpers (PostCSS).
- `jsdoc/ hover/ asset-loading/ lsp/ completion/ html/ labels/ locales/ errors/ utils/ types/ schemas/`.
- `generated/` — Langium-generated, do not edit.
- `__tests__/` — `*.spec.ts` + `test-helpers.ts`; compiler tests under `compiler/__tests__/`.

## Gotchas
- Grammar change → `pnpm langium:generate` first, then build.
- Compiler is Effect code: after edits run `pnpm effect:check:language` and drive findings to 0/0/0 — they don't surface in plain `tsc` or `pnpm check`.
- Effect idioms (tagged errors with `_tag`, `Effect.fail`, no thrown exceptions, no `Effect.gen` adapter) — see root AGENTS.md.
