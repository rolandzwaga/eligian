# AGENTS.md

Shared guidance for any AI coding agent working in this repo. This is the canonical, tool-agnostic instruction file. Tool-specific notes live alongside it (e.g. `CLAUDE.md`, which imports this file).

> Nested `AGENTS.md` files exist under each `packages/*` dir. Agents read the **nearest** file in the directory tree, so the closest one wins; this root file applies repo-wide.

## Project

Langium-based DSL (**Eligian**, file extension **`.eligian`** — never `.eli`/`.elg`) + an Effect-ts compiler that emits [Eligius](https://github.com/rolandzwaga/eligius) JSON config, plus a VS Code extension (highlighting, validation, completion, preview, on-the-fly compile). Eligius is a story-telling engine driven by verbose JSON; the DSL exists to make that config concise and type-safe.

## ⚠️ Windows path rule (CRITICAL)

This repo lives on Windows. For every file-path tool **except a POSIX shell** (`Bash`), use Windows backslash paths and expand `~` to the full home dir.
- ✅ `C:\Users\scab\file.txt`   ❌ `/c/Users/scab/file.txt` or `~/file.txt`

## Import bans (CRITICAL)

Never import from research-only source trees. Always import from the installed npm packages.
- ❌ `../eligius/src/...`  → ✅ `import type { ... } from 'eligius'`
- ❌ `f:/projects/typir/...` → ✅ `from 'typir'` / `from 'typir-langium'`
- Never hand-edit Langium-generated code under `**/generated/`.

Research/reference (read-only, do NOT import):
- `../eligius/` — `README.md`, `jsonschema/eligius-configuration.json` (config entry point), `docs/`
- `f:/projects/typir/` — Typir API reference

## Tooling

- **Package manager: pnpm only** (v11.7, pinned in package.json). Never npm/yarn — breaks workspace resolution.
- **Type-check/build: tsgo** (`@typescript/native-preview`), NOT `tsc`. `pnpm typecheck` = `tsgo -b tsconfig.build.json`.
- **Lint/format: Biome** (v2.4.16). Bundling: esbuild. Tests: Vitest. Dead-code: knip.
- **Effect LSP**: `@effect/language-service` plugin is in the root tsconfig (editor diagnostics only; tsgo build ignores it). Run headlessly via scripts: `pnpm effect:check` (both), `pnpm effect:check:language`, `pnpm effect:check:cli`. These are `--strict` (errors + warnings exit non-zero) and **CI runs `pnpm effect:check` and fails on findings**. Goal is **0 errors / 0 warnings**. `quickfixes` previews fixes but can't apply them; some rules (e.g. `effectGenUsesAdapter`) have no autofix — fix by hand or codemod.

### Commands (from repo root)
- `pnpm build` (`-r build`) · `pnpm typecheck` · `pnpm watch`
- `pnpm test` (`-r test`, no coverage) · `pnpm test:coverage:ci` (coverage + thresholds)
- `pnpm check` (Biome format+lint, autofix — run after each task) · `pnpm lint` · `pnpm ci` (no writes)
- `pnpm langium:generate` (after editing `eligian.langium`)
- `pnpm effect:check` (Effect LSP diagnostics; also `:language` / `:cli`) — see Effect LSP above

### Task completion checklist
1. `pnpm build` (or `pnpm typecheck`) clean
2. `pnpm check` → 0 errors / 0 warnings
3. `pnpm test` passes (run `test:coverage:ci` if new code, don't regress thresholds)
4. `pnpm langium:generate` first if grammar changed
5. **If you touched Effect code** (compiler or `cli/bundler`): run `pnpm effect:check` (or the per-project variant) and fix findings to 0/0/0 — these don't show in tsgo or `pnpm check`.

### Commit / PR rules
- Do NOT offer to open a PR or push — these are user-only actions.
- Ignore CRLF/EOL diff noise.

## Conventions

- **Functional:** external immutability, internal mutation allowed for performance.
- **Biome:** 2-space indent, 100 cols, single quotes, semicolons, ES5 trailing commas. Excluded: `out/`, `dist/`, `generated/`, `*.generated.ts`, `*.d.ts`. Notable overrides OFF: `noExplicitAny` (Langium), `noNonNullAssertion`, `useYield` (Effect.gen), `noParameterAssign`, `noAccumulatingSpread`. `unusedVars`/`unusedImports`/`useConst` = warn.
- **Fixing TS errors:** never use `sed` with line numbers from compiler errors (they mark the symptom, not the fix — corrupts files). Navigate to the real site and edit by string/symbol match.
- **Effect idioms:** no thrown exceptions in the pipeline — `Effect.fail` with tagged-union errors carrying source location; services via `Context.Tag`, composed with `Layer`. Don't use the obsolete `Effect.gen(function* (_))` adapter (it's a no-op alias of pipe); use `Effect.void` over `Effect.succeed(undefined)`. Tagged errors need a `_tag` discriminant or the Effect LSP flags them as untagged global `Error`.

## Architecture

```
packages/
├── language/   @eligian/language — Langium grammar, LSP, validation, type system, AND the compiler
│   └── src/
│       ├── eligian.langium                 # grammar
│       ├── eligian-validator.ts (+ validators/)   # semantic validation
│       ├── eligian-scope-{provider,computation}.ts, eligian-{hover,completion}-provider.ts
│       ├── compiler/                        # Effect-based DSL→Eligius JSON compiler (see below)
│       ├── type-system-typir/               # type system (Typir + typir-langium)
│       ├── css/                             # CSS class/selector validation + IDE helpers (PostCSS)
│       ├── jsdoc/ asset-loading/ lsp/ completion/ html/ labels/ locales/ errors/ utils/ types/ schemas/
│       ├── generated/                       # Langium-generated (do not edit)
│       └── __tests__/                       # incl. test-helpers.ts
├── cli/        CLI compiler — main.ts, compile-file.ts, bundler/ (asset/CSS bundling, tagged errors)
├── shared-utils/  errors.ts, file-loader.ts, path-resolver.ts, tag-guard.ts
└── extension/  VS Code extension (LSP client + webview preview)

.specify/memory/constitution.md  — governs all development (read it)
```

See each package's own `AGENTS.md` for local detail.

### Compiler (`packages/language/src/compiler/`)
Effect-ts pipeline: parse → validate → type-check → transform → optimize → emit. `pipeline.ts` exports `compile`. Real modules include `ast-transformer.ts`, `type-checker.ts`, `optimizer.ts`, `constant-folder.ts`, `expression-evaluator.ts`, `emitter.ts`, `error-reporter.ts`, `name-resolver.ts`; `effects/` (`Compiler.ts`, `FileSystem.ts`, `Logger.ts`, `layers.ts`); `types/eligius-ir.ts`; tests + `__fixtures__` in `__tests__/`. (There is no top-level `packages/compiler`.)

### Type system
Typir-based, in `type-system-typir/` (the old standalone `type-system/` dir was removed). Optional/opt-in static typing: annotations (`action f(x: string)`), inference from operation usage, `unknown` = opt-out. Types: string, number, boolean, object, array, unknown. README in that dir.

## DSL features (one-liners; details in `specs/<NNN>/`)

- **Unified call syntax**: actions and built-in operations are called identically (`at 0s..5s fadeIn("#box")`); compiler resolves action-first then operation. Action names can't collide with operations. Action calls expand to `requestAction`+`startAction`. (`name-resolver.ts`, `ast-transformer.ts`)
- **break / continue**: loop-control sugar → `breakForEach`/`continueForEach`; only valid inside `for` loops (else compile error).
- **CSS loading + live reload**: `styles "./x.css"` → `config.cssFiles[]`; extension hot-reloads CSS into the preview without restarting the timeline. (extension `css-*.ts`)
- **CSS class/selector validation**: validates className/selector args against imported CSS (PostCSS), with Levenshtein "did you mean?" suggestions; hot-reloads. (`css/`, spec 013)
- **JSDoc for actions**: `/** @param */` comments → hover docs + auto-generated templates. (`jsdoc/`, spec 020)

## Testing

- **Read `specs/TESTING_GUIDE.md` before writing tests** (Constitution XXV) — has templates and common pitfalls.
- Tests in `__tests__/` as `*.spec.ts`; fixtures in `__fixtures__/`. Compiler tests in `packages/language/src/compiler/__tests__/`.
- Helpers (`packages/language/src/__tests__/test-helpers.ts`): `createTestContext()` in `beforeAll`; `setupCSSRegistry()` in `beforeEach`; `DiagnosticSeverity` enum (no magic numbers); `getErrors()`/`getWarnings()`.
- Keep CSS-validation integration tests in separate files (avoid workspace contamination).
