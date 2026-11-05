# AGENTS.md — CLI compiler

Local context for the CLI package. Root rules in [`../../AGENTS.md`](../../AGENTS.md) still apply.

Command-line compiler: reads `.eligian`, drives the compiler in `@eligian/language`, bundles assets/CSS/HTML, and emits Eligius JSON (optionally a self-contained bundle).

## Running the CLI (READ THIS — do not guess the entry point)

**The launcher is [`bin/cli.js`](bin/cli.js).** It imports `main` from the build output and calls it. From the repo root:

```bash
node packages/cli/bin/cli.js <file>.eligian            # compile → writes <file>.json
node packages/cli/bin/cli.js <file>.eligian --check    # validate only (exit 1 on error)
node packages/cli/bin/cli.js <file>.eligian -o out.json # explicit output (use "-" for stdout)
node packages/cli/bin/cli.js --help                    # full options
```

Requires a prior build (`pnpm --filter eligian build`, or `pnpm build`) since `bin/cli.js` imports `dist/cli.mjs`.

npm package `eligian` (CLI only, no library API): `dist/cli.mjs` bundles the workspace packages (`@eligian/language`, `@eligian/shared-utils`) from their TypeScript sources (`esbuild.mjs`); only this package's `dependencies` stay external (some must be real files: esbuild's binary, and eligius / jquery, which `--bundle` resolves by walking up from the install). `prepack` = `build:prod` (minified, `keepNames`, no source maps); `files` = `bin/cli.js` + `dist/cli.mjs` (+ README, LICENSE copied in by the build). `package-bin.spec.ts` checks the bundle imports only built-ins and declared dependencies, and what `npm pack` would publish. It runs on its own after the rest of the suite (`test:bin`, excluded from the parallel run by `test` / `test:coverage:ci`), so its startup timings are not measured under the load of the other test workers.

**⚠️ Do NOT run `node packages/cli/dist/cli.mjs` directly.** `dist/cli.mjs` is the esbuild *bundle* of `src/main.ts`: it **defines and `export`s `main` as default but does not invoke it** (top-level await for the version read is fine; the run happens in `bin/cli.js`). Running the bundle directly is a **silent no-op — exit 0, no output, no file** — which looks exactly like "the CLI does nothing." It isn't broken; you're running the wrong file. (This trap cost a prior agent real time: they ran the bundle, saw silence, and wrongly concluded `main()` was never called. Don't repeat it — run `bin/cli.js`.)

> Note: `package.json` `"bin"` maps both `eligian` and `eligian-cli` to `./bin/cli.js`, which is in the `files` allowlist (with `dist/cli.mjs`), so `pnpm exec eligian` / an installed `eligian` runs the launcher.

## Layout (`src/`)
- `bin/cli.js` — the executable launcher (imports `main` from `dist/cli.mjs` and calls it; see "Running the CLI" above). `main.ts` — CLI program definition (commander setup, `export default main`; does NOT self-invoke). `compile-file.ts` — single-file compile orchestration.
- `bundler/` — asset & output bundling:
  - `asset-collector.ts`, `css-processor.ts`, `html-generator.ts`, `runtime-bundler.ts`, `inline-overhead.ts`, `url-utils.ts`, `types.ts`, `index.ts`.
  - `runtime-bundler.ts` generates the bundle entry: the operations, providers (position sources, container providers, playlists, incl. a timeline's own `positionSource` override) and controllers the config names, imported from `eligius/runtime` (not `eligius`: its fluent API and `EligiusResourceImporter` keep every operation alive) and registered with `createImporter`, plus the host module's exports. `__tests__/bundler/bundle-runs.spec.ts` plays a built bundle in jsdom.
- `__tests__/` — `*.spec.ts` (`cli`, `cli-library`, `cli-library-errors`), `bundler/` tests, `__fixtures__/`.

## MCP server (`eligian mcp`, spec 058)
- `src/mcp/`: `server.ts` (`runServer`, imported lazily by the `mcp` command; `effect/ai` loads only there), `stdio.ts`, `paths.ts` (project root = first announced root, else cwd; tool input paths must lie under it), `telemetry.ts` (`ELIGIAN_MCP_LOG`), `compiler-lock.ts`, `tools/` (the five tools), `knowledge/` (the hand-written curriculum, loading, search, rendering). Over stdio nothing but protocol frames may reach stdout: logs go to stderr.
- The docs (`dist/docs/`: `index.json`, `overlays.json`, `agents-block.md`, `curriculum/`, `generated/`) are written by `scripts/generate-knowledge.ts` (`pnpm generate:knowledge`), which `esbuild.mjs` runs in every build (in `--production` after the `rmSync(dist)`, so `prepack` ships them; `files` lists `dist/docs/**`).
- The generator imports the **built** `@eligian/language` (its package `exports`, incl. `@eligian/language/mcp`), so `pnpm build` from the root (topological: language before cli) is the supported path. `pnpm -C packages/cli build` alone after a `clean` of the language package fails.

## Gotchas
- This is Effect code (tagged errors, no thrown exceptions). After edits run `pnpm effect:check:cli` and drive findings to 0/0/0 — they don't surface in plain `tsc` or `pnpm check`.
- Compiler internals live in `@eligian/language` (`packages/language/src/compiler/`), not here — see that package's `AGENTS.md`.
