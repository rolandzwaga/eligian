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

npm package `eligian` (CLI only, no library API): `dist/cli.mjs` bundles the workspace packages (`@eligian/language`, `@eligian/shared-utils`) from their TypeScript sources (`esbuild.mjs`); only this package's `dependencies` stay external (some must be real files: esbuild's binary, and eligius / jquery, which `--bundle` resolves by walking up from the install). `prepack` = `build:prod` (minified, `keepNames`, no source maps); `files` = `bin/cli.js` + `dist/cli.mjs` (+ README, LICENSE copied in by the build). `package-bin.spec.ts` checks the bundle imports only built-ins and declared dependencies, and what `npm pack` would publish. It runs on its own after the rest of the suite (the `cli-bin` vitest project, run by `test:bin`; `test` / `test:coverage:ci` run the `cli` and `cli-timed` projects first), so its startup timings are not measured under the load of the other test workers. `mcp-smoke.spec.ts` (the `cli-timed` project, `vitest.config.ts`) runs after the parallel files for the same reason: its timeout case needs the smoke child's first `timeline` line within 10 s.

**⚠️ Do NOT run `node packages/cli/dist/cli.mjs` directly.** `dist/cli.mjs` is the esbuild *bundle* of `src/main.ts`: it **defines and `export`s `main` as default but does not invoke it** (top-level await for the version read is fine; the run happens in `bin/cli.js`). Running the bundle directly is a **silent no-op — exit 0, no output, no file** — which looks exactly like "the CLI does nothing." It isn't broken; you're running the wrong file. (This trap cost a prior agent real time: they ran the bundle, saw silence, and wrongly concluded `main()` was never called. Don't repeat it — run `bin/cli.js`.)

> Note: `package.json` `"bin"` maps both `eligian` and `eligian-cli` to `./bin/cli.js`, which is in the `files` allowlist (with `dist/cli.mjs`), so `pnpm exec eligian` / an installed `eligian` runs the launcher.

## Layout (`src/`)
- `bin/cli.js` — the executable launcher (imports `main` from `dist/cli.mjs` and calls it; see "Running the CLI" above). `main.ts` — CLI program definition (commander setup, `export default main`; does NOT self-invoke). `compile-file.ts` — single-file compile orchestration.
- `bundler/` — asset & output bundling:
  - `asset-collector.ts`, `css-processor.ts`, `html-generator.ts`, `runtime-bundler.ts`, `inline-overhead.ts`, `url-utils.ts`, `types.ts`, `index.ts`.
  - `runtime-bundler.ts` generates the bundle entry: the operations, providers (position sources, container providers, playlists, incl. a timeline's own `positionSource` override) and controllers the config names, imported from `eligius/runtime` (not `eligius`: its fluent API and `EligiusResourceImporter` keep every operation alive) and registered with `createImporter`, plus the host module's exports. `__tests__/bundler/bundle-runs.spec.ts` plays a built bundle in jsdom.
- `__tests__/` — `*.spec.ts` (`cli`, `cli-library`, `cli-library-errors`), `bundler/` tests, `__fixtures__/`.

## MCP server (`eligian mcp`, spec 058)
- `src/mcp/`: `server.ts` (`runServer`, imported lazily by the `mcp` command; `effect/ai` loads only there), `stdio.ts`, `paths.ts` (project root = first announced root, else cwd; tool input paths must lie under it), `telemetry.ts` (`ELIGIAN_MCP_LOG`), `compiler-lock.ts`, `tools/` (the nine tools), `brief/` (the brief interview, spec 059; below), `knowledge/` (the hand-written curriculum, loading, search, rendering); `src/atomic-write.ts` (the temp-and-rename write shared by `dev/` and `mcp/`). Over stdio nothing but protocol frames may reach stdout: logs go to stderr.
- `src/mcp/brief/` (spec 059): `tree.ts`, `values.ts`, `engine.ts`, `brief-file.ts` (`BRIEF.md`), `references.ts`; `known-programs.ts` (the record of known programs, `.eligian/programs.json`: the text scan of a program without the compiler, the server's record store with its first-run scan, `writeFirstRecord`); `gate.ts` (the verdict matrix, `checkPrograms`, `briefStatusOf` for `eligian_project`, `cliBriefWarnings`, `newProgramVerdict`: the verdict on a program not yet written, shared with the hook); `hook-gate.ts` (`eligian brief gate`, the Claude Code plugin's `PreToolUse` hook: `hookDecision` / `runBriefGate` apply its four rules, `BRIEF.md`, a new program before approval, `.eligian/programs.json`, an elicitation-answering hook in a `.claude` settings file; read-only, never creates the key, no Langium or document load); `signature.ts` (the per-user key in the state directory outside the project, `ELIGIAN_STATE_DIR` overrides it; the HMAC-signed confirmation and approval lines, the sign-off tickets, `verifyBriefFile`); `adopt.ts` (the code facts of an existing program, read under the compiler lock; the only brief module that imports `@eligian/language`); `scoped.ts` (the scoped trees of an addition: a view, a language, a host module); `storyboard-check.ts` (the `approve-storyboard` checks of `STORYBOARD.md`); `facts.ts` (`exists` / `inside` per call); `wire.ts` (the round schemas and the `gate` refusal payload).
- The gate: the five generation tools (`eligian_check`, `eligian_compile`, `eligian_fmt`, `eligian_init`, `eligian_smoke`) run `checkPrograms` first and refuse with kind `gate` until the governing brief is approved and every addition (a timeline, language or host module beyond the approved set) has had its scoped interview (codes: `wire.ts` `GATE_CODES`). The CLI is not gated: `check`, `compile`, `fmt`, `smoke` and `dev` only print one warning line per such program on stderr (`main.ts` `printBriefWarnings`), stdout and exit codes unchanged. `eligian init` (the CLI command, never `eligian_init`) writes the first record, `.eligian/programs.json`, minus the `main.eligian` it wrote.
- `src/mcp/evals/` (bundled as `dist/evals/assert.mjs`, loaded by `evals/mcp/run.ts`): `assert.ts`, `harness.ts`, `transcript.ts`, `gate-steps.ts`, `promotion-evidence.ts`; `brief-fixture.ts` (spec 059: signs a case's brief fixture with the engine's own functions so arm A1 starts from a confirmed brief, and reads a project's brief state after a run); `interview.ts` (spec 059: the interview eval of `--persona`: persona sheets, the injected turn loop `runInterview`, the measures and the verdict).
- The docs (`dist/docs/`: `index.json`, `overlays.json`, `agents-block.md`, `curriculum/`, `generated/`) are written by `scripts/generate-knowledge.ts` (`pnpm generate:knowledge`), which `esbuild.mjs` runs in every build (in `--production` after the `rmSync(dist)`, so `prepack` ships them; `files` lists `dist/docs/**`).
- The generator imports the **built** `@eligian/language` (its package `exports`, incl. `@eligian/language/mcp`), so `pnpm build` from the root (topological: language before cli) is the supported path. `pnpm -C packages/cli build` alone after a `clean` of the language package fails.

## Gotchas
- This is Effect code (tagged errors, no thrown exceptions). After edits run `pnpm effect:check:cli` and drive findings to 0/0/0 — they don't surface in plain `tsc` or `pnpm check`.
- Compiler internals live in `@eligian/language` (`packages/language/src/compiler/`), not here — see that package's `AGENTS.md`.
