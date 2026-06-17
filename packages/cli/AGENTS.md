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

Requires a prior build (`pnpm --filter @eligian/cli build`, or `pnpm build`) since `bin/cli.js` imports `dist/cli.mjs`.

**⚠️ Do NOT run `node packages/cli/dist/cli.mjs` directly.** `dist/cli.mjs` is the esbuild *bundle* of `src/main.ts`: it **defines and `export`s `main` as default but does not invoke it** (top-level await for the version read is fine; the run happens in `bin/cli.js`). Running the bundle directly is a **silent no-op — exit 0, no output, no file** — which looks exactly like "the CLI does nothing." It isn't broken; you're running the wrong file. (This trap cost a prior agent real time: they ran the bundle, saw silence, and wrongly concluded `main()` was never called. Don't repeat it — run `bin/cli.js`.)

> Note: `package.json` `"bin"` currently maps `eligian` → `./dist/cli.mjs` (the no-op bundle), and `bin/` is not in the `files` allowlist, so `pnpm exec eligian` / an installed `eligian` is currently a no-op. Until that's reconciled, invoke `bin/cli.js` explicitly.

## Layout (`src/`)
- `bin/cli.js` — the executable launcher (imports `main` from `dist/cli.mjs` and calls it; see "Running the CLI" above). `main.ts` — CLI program definition (commander setup, `export default main`; does NOT self-invoke). `index.ts` — package exports. `compile-file.ts` — single-file compile orchestration.
- `bundler/` — asset & output bundling:
  - `asset-collector.ts`, `css-processor.ts`, `html-generator.ts`, `runtime-bundler.ts`, `inline-overhead.ts`, `url-utils.ts`, `types.ts`, `index.ts`.
- `__tests__/` — `*.spec.ts`.

## Gotchas
- This is Effect code (tagged errors, no thrown exceptions). After edits run `pnpm effect:check:cli` and drive findings to 0/0/0 — they don't surface in tsgo or `pnpm check`.
- Compiler internals live in `@eligian/language` (`packages/language/src/compiler/`), not here — see that package's `AGENTS.md`.
