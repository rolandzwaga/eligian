# Implementation Plan: MCP server, Phase 5: Hardening and reach

**Branch**: `feat/mcp-server-roadmap` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/058-mcp-server/phase-5-hardening-reach/spec.md` (reviewed; clarifications Q1–Q7 encoded), roadmap §2 ("MCP registry", "Memory and staleness", "Install story per client"), §4 `eligian_check`, §6, §7 Phase 5, §8 decisions 1–4 and 9.

Every signature below was read this session on the tree at `2068f13`. TypeScript facts come from typegraph (`ts_module_exports` on `mcp/compiler-lock.ts`, `agents.ts`, `__tests__/mcp-test-client.ts`, `check/review.ts`, `compiler/timeline-review.ts`, `lsp/format-source.ts`, `language/src/mcp.ts`; `ts_navigate_to tryCompileProgramWithMap`) and from the file at the cited line (`sed -n`/`grep -n`). Where the typegraph index gives a line number that differs from the file, the file wins: `compiler-lock.ts` is indexed with `CompilerLockOptions` at 38 and `recycleCompilerServices` at 50, and the file has them at 29 and 43. The spec's lines are the file's. The review revision also read `compiler/pipeline/services.ts:26-56`, `mcp/telemetry.ts:9-24` and `:79-98`, `mcp/diagnostics.ts:26` and `:68-90`, `scripts/measure-heap.ts`, `scripts/generate-knowledge.ts:340-360` and `:1103-1135`, `packages/language/package.json:16-33`, `esbuild.mjs:33-48` and `publish-cli.yml:77-110`, plus `pnpm pack --help`. External facts come from sources fetched this session, each with its URL or command. Probes ran in the session scratchpad and are not committed. Their results are quoted where they are used.

## Summary

Phase 5 adds no tool, no instruction text, no grammar and no curriculum chunk. It has four tracks. Three are built now. The fourth (promotion) stays blocked until Phase 3's full eval runs exist (FR-001b).

| Track | Built now? | What changes (reuse-first) |
|---|---|---|
| **B. Registry** | yes | `packages/cli/package.json` gains `mcpName`. New static `packages/cli/server.json`. `spawnServer` gains `args?`. New `mcp-registry.spec.ts`. `package-bin.spec.ts` gets two assertions. `publish-cli.yml` gets three steps and a `registry_only` input. Docs. |
| **C. Claude Code plugin** | yes | Static `.claude-plugin/marketplace.json` and `plugins/claude/eligian/{.claude-plugin/plugin.json,.mcp.json}`. New `plugins.spec.ts`, which compares against the real `serverEntry` (`agents.ts:39`). README. |
| **D. Recycling** | yes | A shared tool-mix and heap helper (D1b). `heapAfterGc` is defined twice today (`measure-heap.ts:61-65`, `mcp-soak.spec.ts:33-37`), and both switch to the helper. The `measure-recycle.ts` script drives the existing in-process server through the production `makeCompilerLock` (via `compilerLockLayer`). It runs one child process per row, so no row inherits another row's singletons (P19). `RECYCLE_AFTER` is exported and set from the data. The soak gets a mixed case. `resetFormatServices` is added only if FR-025 triggers. |
| **A0. Evidence** | yes | Pure functions in `packages/cli/src/mcp/evals/promotion-evidence.ts` (typed, linted, covered; bundled into the existing `dist/evals/assert.mjs`). They count codes and also select the runs: only full runs named by an explicit `--runs` pin count (A0-1). A thin tsx script `evals/mcp/promotion-evidence.ts` reads the files and writes `baseline/promotion-evidence.md`. |
| **A. Promotions** | **blocked** (FR-001b) | Designed below for both kinds: AST-only checks become a Langium validator over `timelineFindings`, and config-based checks are moved into the language package and served through the I-2 channel (`lintDocument`). One mini-spec per selected code is appended to spec.md when the rule selects it. |

New runtime dependencies: none. The only new external tool is `mcp-publisher` v1.8.7, downloaded in CI by a pinned URL with a literal SHA-256 (P3). `pnpm langium:generate` is not needed (FR-028).

## Technical context

| | |
|---|---|
| Language | TypeScript 7 (`tsc` = tsgo). CLI ESM bundle `dist/cli.mjs` plus the eval bundle `dist/evals/assert.mjs` (`packages/cli/esbuild.mjs:129-133`: "built with the CLI in every mode, never packed") |
| Effect | `effect@4.0.7`. Effect code touched: `compiler-lock.ts` (one `export`, a doc comment, and, if FR-025 triggers, one call in `recycleCompilerServices`). Promotions (blocked) touch no Effect code: validators and the language server are plain functions. |
| Testing | Vitest. CLI projects `cli`, `cli-timed`, `cli-bin`, `cli-soak` (`packages/cli/vitest.config.ts:22`, `:45-48`: `cli-soak` = `include: SOAK`, `execArgv: ['--expose-gc']`, `env: { ELIGIAN_SOAK: '1' }`) |
| Platforms | Windows 11 (local), `ubuntu-latest` (CI `ci.yml`, one job, `timeout-minutes: 20` at `:29`; "Soak test" step at `:63-64`) |
| Measured this session | `node packages/cli/bin/cli.js check examples/eligian-tour/tour.eligian`: 1.83 s wall, including the CLI's ~1.9 s start (roadmap §2), so the in-process check of the tour is a fraction of a second. Phase 3 soak: 8 ms per `eligian_check` on the small fixture (`phase-3-evals-provenance/baseline/gate-5-soak.txt`) |
| Constraints | MCP stdout = protocol frames only (`stdio.ts` unchanged; nothing in this phase writes to the server's stdout). Compiler lock semantics unchanged (only N changes). Effect diagnostics 0/0/0. CLI coverage ≥ 77.1 / 77.6 / 64.5 / 76.6 (`vitest.config.ts:58-63`). Language thresholds 79.8 / 80 / 69.9: no language change outside the blocked promotion track. |

## Constitution check

| Principle | Status |
|---|---|
| I Simplicity | Pass. Registry and plugin are static JSON plus drift specs. Recycling reuses the in-process test server and the production lock, and folds the two existing `heapAfterGc` copies into one helper (D1b; why `measure-heap.ts` is not extended: D2). Evidence is one pure module and one 80-line script. Promotions reuse `timelineFindings`, `controllerBalance` and the existing walks. They are moved, not rewritten (FR-004, FR-005c). |
| II / V / XX / XXV Testing, TDD | Pass. Every FR/SC has a named spec (Test plan), written red first. `specs/TESTING_GUIDE.md` is read before the first test (the soak and registry specs follow the existing `mcp-soak.spec.ts` / `package-bin.spec.ts` patterns). |
| III / XVII Effect | Pass. The only Effect file is `compiler-lock.ts`, and its change is an `export` and possibly one call. `pnpm effect:check:cli` is in the D and final gates. |
| IV Clear errors | Pass. The workflow's registry step prints an `::error::` line that names the `registry_only` re-run (FR-013). The measurement script exits non-zero with "sections ≠ calls" (FR-022). The evidence script exits 1 and names each pinned run that is missing or not full (A0-2). |
| VI / VII Immutability | Pass. The evidence functions return new arrays and the tool-mix helper is pure. |
| VIII pnpm | Pass. Scripts are `pnpm -C packages/cli run measure:recycle` and `pnpm evals:mcp:evidence`. `npx` appears only in the *user-facing* plugin launch form (Q4). |
| IX Langium | Pass. No grammar change. A promoted validator registers through `registerValidationChecks` (`eligian-validator.ts:102`). |
| XII No premature docs | Pass. Only FR-015 and FR-021 docs, plus the AGENTS.md soak line that the changed soak makes stale (`AGENTS.md:51`). |
| XIV Windows paths | Pass. Plugin and registry files hold no absolute paths. Specs use `path.join`. Promotions take `document.uri.fsPath` (E-1). |
| XV / XVI Research context | Pass. `eligius` only through the installed package. Registry and Claude Code docs were read, never vendored. |
| XXII Sed safety | Pass. Edits by string match. |

No violations, so the Complexity tracking table is empty.

## Corrections and settlements found while planning

Each was checked this session. `compliance.md` records each one as a correction (C) or a settlement of an [UNVERIFIED] claim (S).

- **P1 (C). `ServerCommand`'s npx form carries the platform.** `agents.ts:23-25`: `{ readonly form: 'node'; readonly cliPath: string } | { readonly form: 'npx'; readonly platform: NodeJS.Platform }`. So FR-019's call is `serverEntry('claude', { form: 'npx', platform: 'win32' })` and `serverEntry('claude', { form: 'npx', platform: 'linux' })`. Both return `{ command: 'npx', args: ['-y', 'eligian@^1.1', 'mcp'] }`, because the `cmd /c` branch requires `client !== 'claude'` (`agents.ts:46`). The spec's `{ form: 'npx' }` shorthand is not a valid `ServerCommand`.
- **P2 (S). The server.json schema and `repository.subfolder`.** The registry's `pkg/model/constants.go` (via `gh api repos/modelcontextprotocol/registry/contents/pkg/model/constants.go`) has `CurrentSchemaVersion = "2025-12-11"` and `CurrentSchemaURL = "https://static.modelcontextprotocol.io/schemas/" + CurrentSchemaVersion + "/server.schema.json"`. The fetched schema (HTTP 200) has `definitions.Repository.properties` = `id`, `source`, `subfolder` ("Optional relative path from repository root to the server location within a monorepo"), and `url`, with `required: ["url","source"]`. `ServerDetail.required` is `["name","description","version"]`. `description` and `title` are each `maxLength: 100`. `Package.properties` includes `registryBaseUrl`, `packageArguments` and `environmentVariables`, and `Package.required` is `["registryType","identifier","transport"]`. So FR-011's `subfolder: "packages/cli"` stays.
- **P3 (S). `mcp-publisher` pinned release and checksum.** `gh release list -R modelcontextprotocol/registry`: latest `v1.8.7` (2026-10-30). Its `registry_1.8.7_checksums.txt` lists `00b21004149a4ce66f0782508ae4a2bce67d1bea395a8da0bd8028159fb59579  mcp-publisher_linux_amd64.tar.gz`. The registry's own GitHub Actions page (`docs/modelcontextprotocol-io/github-actions.mdx`) says: "The examples pin `mcp-publisher` to a specific release and verify its Sigstore bundle before extracting it … do not switch back to the mutable `releases/latest` URL". It verifies with `cosign verify-blob`. FR-013(a) allows "`sha256sum -c` (or an equivalent comparison against a checksum written in the workflow)". The plan uses `sha256sum -c` against the literal checksum, which needs no extra action (the workflow pins every action by SHA, and cosign would need `sigstore/cosign-installer`). **The version is written literally in the URL** (`…/releases/download/v1.8.7/…`), not through an env var, because SC-006(2) is a text-level assertion and `${MCP_PUBLISHER_VERSION}` would hide the tag. Upgrading means editing the URL and the checksum together, and the spec checks that both are present.
- **P4 (S + C). `mcp-publisher validate` is a server-side validation and needs network, not login.** The Windows build of v1.8.7 (checksum `cdb42bfe…e778d4` verified with `sha256sum -c`) was run on the FR-011 draft below. It printed `Validating against https://registry.modelcontextprotocol.io...` / `✅ server.json is valid` and exited 0 in 0.39 s with no login. The same draft with a 104-character description gave `Error: validation failed: server returned status 422: … "message":"expected length <= 100","location":"body.description"` and exited 1. Consequences:
  - SC-005's local run and the workflow's `Validate server.json` both need network (R6).
  - `validate` does not check npm ownership. The draft validated while `eligian@1.1.0` is unpublished, so `mcpName` ownership is only checked at `publish` (FR-014's retry covers that).
  - `mcp-publisher validate --help`: "Usage: mcp-publisher validate [file] … (default: ./server.json)". So the step runs in `packages/cli` with no argument.
- **P5 (S). Registry API shape for SC-002.** `GET https://registry.modelcontextprotocol.io/v0/servers?search=io.github.github/github-mcp-server&limit=1` returns top-level keys `servers`, `metadata`. Each entry has `server` (`$schema`, `name`, `description`, `repository`, `version`, `packages`) and `_meta["io.modelcontextprotocol.registry/official"]` with `isLatest`. Search returns older versions too, so SC-002's jq filter on `.server.version == $v` is correct as written. `search=eligian` today: `{"servers":[],"metadata":{"count":0}}`.
- **P6 (S). Registry versions are immutable (E-6).** `docs/modelcontextprotocol-io/versioning.mdx:32`: "The version string **MUST** be unique for each publication of the server. Once published, the version string (and other metadata) cannot be changed." The step order (npm first, then the registry) ensures the registry is never ahead of npm.
- **P7 (S, decides E-9). Duplicate servers in Claude Code.** `code.claude.com/docs/en/mcp.md`, "Scope hierarchy and precedence": "When the same server is defined in more than one place, Claude Code connects to it once, using the definition from the highest-precedence source … 1. Local scope 2. Project scope 3. User scope 4. Plugin-provided servers …" and "Claude Code matches duplicates across the three scopes by name. It matches plugins and connectors by endpoint, so one that points at the same URL or command as an enabled server above counts as a duplicate." Also: "The server itself registers under the scoped name `plugin:<plugin-name>:<server-name>`". Consequences:
  - A project whose `.mcp.json` has the npx form (`detectServerCommand` found no local install) has the same command as the plugin, so Claude Code dedupes it and the project entry wins.
  - A project with the node form (`node <abs>/node_modules/eligian/bin/cli.js mcp`, the `eligian init` default after install) has a different command, so both servers load and the tools appear twice.
  - Decision: the plugin's server key stays `eligian` (FR-016). The README tells users with a project-level `eligian` server to toggle the plugin's server off in `/mcp` ("You can still toggle an installed plugin server off in `/mcp`", mcp.md "How plugin MCP servers work") or not to install the plugin. SC-009 records what `claude mcp list` shows in both cases.
- **P8 (S). Marketplace and manifest details that `--strict` enforces.** `code.claude.com/docs/en/plugins/marketplace-reference.md`:
  - top-level `name`, `owner`, `plugins` are required, and `description`: "`claude plugin validate` warns when it's missing";
  - an entry's `version`: "When `plugin.json` also sets `version`, `plugin.json` takes precedence and `claude plugin validate` warns".

  `plugins-reference.md`: `repository` is a "String", `author` is an "Object" with "`name`, which is required", and `homepage` "Must parse as a URL". Under `--strict`, warnings fail. So the marketplace carries `description`, its entry carries **no** `version`, and `plugin.json` carries `version`. `claude --version` here is `2.1.302`, above the "v2.1.281 or later" required for the MCP checks of `claude plugin validate` (`claude plugin validate --help` shows `--strict` and `--json`).
- **P9 (S). The negative control fails fast, with no timeout.** `echo '<initialize>' | node packages/cli/bin/cli.js` printed `error: missing required argument 'input'` and exited 1 before any frame. `spawnServer().request` rejects in that case (`mcp-test-client.ts:314`: ``throw new Error(`mcp exited (${code}) before answering ${method}; stderr:\n${stderr}`)``). So SC-004's control asserts `rejects.toThrow(/mcp exited \(1\) before answering initialize/)` and `stdoutLines()` is `[]`. It is deterministic and does not depend on a timeout.
- **P10 (S). The measurement script can reuse `startInMemoryServer` outside Vitest.** It calls `expect` from `vitest` on every successful tool result (`mcp-test-client.ts`, `toolCallResult`). A probe (`node` on an `.mjs` in `packages/cli` with `import { expect } from 'vitest'`) printed `expect outside runner: ok`, and a mismatch threw `AssertionError`. So `scripts/measure-recycle.ts` imports the same helper, as `scripts/measure-heap.ts:17` already does, and there is no second in-memory client.
- **P11 (C). The script needs a fresh `pnpm build`.** `@eligian/language` resolves through its package `exports` to `./dist/index.cjs`, and `/mcp` to `./dist/mcp/index.cjs` (`packages/language/package.json:16-31`), under tsx as under Vitest (the CLI's `vitest.config.ts` has no alias). The script header says so, and the D task runs `pnpm build` first.
- **P12 (C). The existing soak case hard-codes N = 100.** `mcp-soak.spec.ts:23` (`CALLS = 200`) and `:76` (`expect(recycles).toEqual([100, 200])`) assume the default lock. FR-024 says "the existing single-tool case stays". It stays as a single-tool case, but becomes N-relative: `CALLS = 2 * RECYCLE_AFTER` and `expect(recycles).toEqual([RECYCLE_AFTER, 2 * RECYCLE_AFTER])`, with the lock still built without `recycleAfter` so that it exercises the production default. Otherwise any N ≠ 100 breaks it, for example `[200]` at N = 200. This needs `RECYCLE_AFTER` exported (`compiler-lock.ts:37` is a module `const` today).
- **P13 (C). The measurement output goes through `--out`, not a stdout redirect.** The script runs the server in-process without `redirectConsoleToStderr` (that runs only in `runServer`, `server.ts:190`), so a third-party `console.log` would land in a redirected file. The script writes the table with `fs.writeFileSync(--out)` and logs progress to stderr. This refines spec "New components" ("on stdout").
- **P14 (S, expectation for FR-025).** `formatSource` creates each document with `LangiumDocumentFactory.fromString(source, URI.parse(`memory:/format-${++counter}.eligian`))` (`format-source.ts:30-33`) and never adds it to `LangiumDocuments`. So growth is expected to be small. FR-025 still measures it and decides.
- **P15 (S, FR-001a input).** `evals/mcp/results` has 16 run directories, all in the one-case harness format `<run>/<case>.json`. `find evals/mcp/results -type f` gives 19 `.json` files and 1 `.gitkeep`, with **0** `.mcp.log`. The runner writes the new format as `<run>/<case>/<arm>-<n>.json` plus `.mcp.log` (`run.ts:294`, `:354`, `:412`). Every column (a)/(b) therefore reads "no data" today.
- **P16 (C). Biome covers `packages/cli/scripts/*.ts`.** `biome.json` `files.includes` has `"packages/**/*.ts"`, while the CLI's `tsconfig.json` has `"include": ["src/**/*.ts"]`. So the new script is linted (as `generate-knowledge.ts` is) but not type-checked by `pnpm typecheck`. Its logic lives in typed modules under `src/` (the tool-mix helper, the lock). The script only orchestrates.
- **P17 (C, promotion design).** `TimelineFinding` (`timeline-review.ts:27-39`) carries a 1-based range and the timeline *name*, not the AST node. A promoted AST validator therefore reports on the `Program` node with Langium's `range` option. It does not add a node to `TimelineFinding`, which is serialized by `eligian_project`'s `assets.problems`.
- **P18 (C, promotion design).** The extension's `EligiusLintStore` shows whatever the server sends and has no setting logic (`packages/extension/src/extension/eligius-lint-diagnostics.ts`). So FR-005a(a) needs changes on the server side only: `lintDocument` stops returning early on `!Settings.eligiusLint` and filters the lint findings instead. The promoted findings travel in the same `eligian/eligiusLint` notification and collection, with `source: 'Eligian'` (decided, see A-B2).
- **P19 (C). The measurement rows cannot share one process.** The Langium services are a module singleton: `let sharedServices` (`compiler/pipeline/services.ts:26`). `resetServices()` (`:54-56`) only clears the reference. The only code that releases its documents is `recycleCompilerServices` (`compiler-lock.ts:43-48`), and the lock calls it only when `completed % recycleAfter === 0` (`:85`). `grep -rn "resetServices\|recycleCompilerServices" packages/cli/src` finds no other non-test call, so closing a server resets nothing. Run in one process, the rows would contaminate each other:
  - The `never` row's 500 calls would leave their documents in the singleton. Row 25's first recycle would then free them, so row 25's growth would be understated, possibly negative.
  - Each later row would start from what its predecessor left after its last recycle.
  - The formatter's private set (`let services`, `format-source.ts:22`) is never reset without D4, and D4 depends on this measurement.

  So D2 runs every row, and the fmt-only run, in its own child process, each on a fresh copy of the project. The parent only spawns the children, collects their numbers and renders the file. The file header records this.
- **P20 (C). Telemetry lines can be cut.** `telemetryText` (`telemetry.ts:79-98`) keeps each line within 1,000 chars. When a line is too long, it keeps the codes with the largest counts and marks the line `truncated: true` (`TelemetryLine.truncated`, `:23-24`). `TelemetryLike` (`transcript.ts:29-34`) has no `truncated` field. A code with a small count can therefore be missing from a long check line. A0-1 reads `truncated`, and the table marks columns (a) and (b) as lower bounds when a counted line was cut.
- **P21 (C; amends where FR-010 / SC-017 are proven). A spec cannot safely read the packed manifest.**
  - `packedFiles()` (`package-bin.spec.ts:47-57`) runs `npm pack --dry-run --json --ignore-scripts`, which lists paths only.
  - The workflow packs with `pnpm pack` ("Pack", `publish-cli.yml:77-82`). `pnpm pack --help` (pnpm 12.14, run this session) offers no `--ignore-scripts`, and by default it rewrites the manifest: it strips `packageManager` and the publish-lifecycle scripts unless `--skip-manifest-obfuscation` is given.
  - A `pnpm pack` inside a spec therefore runs `prepack` = `pnpm run build:prod` (`packages/cli/package.json:46`). That rewrites `dist/` while the other `cli-bin` tests spawn `bin/cli.js`.
  - A tarball from `npm pack --ignore-scripts` would be safe to build, but it does not carry pnpm's rewritten manifest, which is the one that gets published.

  So the packed manifest's `mcpName` is proven in three places instead:
  1. On every publish, B5's added line in `Try the package` reads `mcpName` from the globally installed tarball, which is the artifact that gets published. It runs before `Publish`, so a missing field stops `npm publish`.
  2. `mcp-registry.spec.ts` asserts that `Try the package` contains that line and comes before `Publish` (Test plan, SC-006 row), so removing the guard fails CI.
  3. G1 writes `baseline/packed-manifest.txt` from a real `pnpm -C packages/cli pack`.

  `package-bin.spec.ts` keeps its assertions on the source manifest and the packed file list. `compliance.md` quotes this correction against FR-010 and SC-017.
- **P22 (C, promotion design). `configReviewFindings` needs the program from the language server.**
  - `tryCompileProgramWithMap` returns `{ config; map; host? } | undefined` (`pipeline.ts:307-313`), with no `program`. `reviewConfig` reads `compiled.program` (`review.ts:86`).
  - So `lintDocument` passes `{ ...compiled, program: root }`. `root` is already narrowed to `Program` there: `clean` includes `isProgram(root)` (`eligius-lint.ts:35`), and the existing call `tryCompileProgramWithMap(root, …)` at `:42` already type-checks on that narrowing.
  - The CLI passes its compile result, which carries `program`.

## Sequencing (groups; `[P]` = parallel within the group)

| Group | Content | Gate after the group |
|---|---|---|
| **G0 baseline** | Capture `baseline/probes-before.txt` (the count of probed claims in `mcp-runtime-claims.spec.ts`, SC-013), `baseline/check-examples-before.txt`, `baseline/coverage-cli-before.txt`, and `baseline/mcp-publisher-validate.txt` after B1 exists | none |
| **G1 registry** | B1 `server.json` + `mcpName` [P]; B2 `spawnServer({ args })`; B3 `mcp-registry.spec.ts` (red first); B4 `package-bin.spec.ts` additions [P]; B5 `publish-cli.yml` | `pnpm typecheck`, `pnpm run ci`, `vitest run --project cli src/__tests__/mcp-registry.spec.ts`, `pnpm -C packages/cli run test:bin`, local `mcp-publisher validate` (SC-005) |
| **G2 plugin** [P with G1] | C1 static files; C2 `plugins.spec.ts`; `claude plugin validate … --strict` ×2 (SC-007) | `pnpm run ci`, `vitest run --project cli src/__tests__/plugins.spec.ts` |
| **G3 recycling** | D1 `RECYCLE_AFTER` export + the tool-mix / heap helper (D1b; `measure-heap.ts` and `mcp-soak.spec.ts` switch to its `heapAfterGc`, and `measure-heap.ts`'s stale header "every 100 sections" is fixed); D2 `measure-recycle.ts` (rows as child processes, P19); D3 run it (`pnpm build` first) → `baseline/recycle-measurements.txt`; D4 set N (FR-023), doc comment; D5 mixed soak + N-relative single-tool case; D6 (only if FR-025 > 1 MB/100) `resetFormatServices` + spec | `pnpm typecheck`, `pnpm run ci`, `pnpm -C packages/cli run test:soak`, `pnpm effect:check:cli`, `vitest run --project cli src/__tests__/mcp-compiler-lock.spec.ts src/__tests__/mcp-staleness.spec.ts src/__tests__/mcp-concurrency.spec.ts` |
| **G4 evidence** [P with G3] | A0-1 `promotion-evidence.ts` + spec; A0-2 `evals/mcp/promotion-evidence.ts` + root script; A0-3 write `baseline/promotion-evidence.md` | `pnpm typecheck`, `pnpm run ci`, `vitest run --project cli src/__tests__/mcp-promotion-evidence.spec.ts`, `pnpm -C packages/cli build` (the eval bundle carries the re-export) |
| **G5 docs** | README (FR-015, FR-021), root `AGENTS.md` (publishing line; soak line `:51`), `CHANGELOG.md`, compiler-lock doc comment | `pnpm run ci` |
| **G6 final** | the full set (Build integration, "Gates"), then `compliance.md`, roadmap status line (FR-029) | all |
| **GP promotions** | **blocked** (FR-001b) until `promotion-evidence.md` is regenerated from Phase 3's full runs. For each selected code, in order: (1) one mini-spec (FR-002, the sections listed under A); (2) **the before-capture task**, on the unchanged tree, before any validator, move or `codes.ts` edit: `eligian check <fixture> --format json > baseline/promotion-<c>-before.json` with the default switches (review and lint on), and for `controller-imbalance` also `eligian check <non-literal fixture> --format json > baseline/promotion-controller-imbalance-nonliteral-before.json`; (3) the A-A / A-B tasks for the code, which **depend on** the capture task. A capture taken after the move would compare the new output with itself (SC-010, SC-019). Resumed with `retry_tasks`. | adds `pnpm effect:check:language` (unchanged code, but the language package is touched), language coverage, `check:examples` / `smoke:examples` / `fmt:examples` (FR-009), the extension's vitest |

## Module design

### B. MCP registry (FR-010–FR-015)

#### B1. `packages/cli/package.json` and `packages/cli/server.json` (FR-010, FR-011)

`package.json` gains one top-level key after `"name"`: `"mcpName": "io.github.rolandzwaga/eligian"`. `files` is unchanged (`["bin/cli.js","dist/cli.mjs","dist/docs/**"]`), so `server.json` is not packed and no `files` edit is needed to keep it out.

`server.json` (new, 2-space JSON, Biome-formatted: it is under `packages/**/*.json`). This exact draft passed `mcp-publisher validate` (P4):

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.rolandzwaga/eligian",
  "title": "Eligian",
  "description": "Write Eligius presentations in Eligian: docs, operation cards, check, fmt, compile and smoke",
  "repository": {
    "url": "https://github.com/rolandzwaga/eligian",
    "source": "github",
    "subfolder": "packages/cli"
  },
  "version": "1.1.0",
  "packages": [
    {
      "registryType": "npm",
      "registryBaseUrl": "https://registry.npmjs.org",
      "identifier": "eligian",
      "version": "1.1.0",
      "transport": { "type": "stdio" },
      "packageArguments": [{ "type": "positional", "value": "mcp" }],
      "environmentVariables": [
        {
          "name": "ELIGIAN_MCP_LOG",
          "description": "Also append the per-call telemetry lines to this file",
          "isRequired": false,
          "isSecret": false
        }
      ]
    }
  ]
}
```

The description has 92 characters (`node -e` count). No `websiteUrl` and no `icons` (YAGNI).

#### B2. `spawnServer({ args })` (FR-012), `packages/cli/src/__tests__/mcp-test-client.ts:264-272`

```ts
export function spawnServer(
  options: {
    env?: NodeJS.ProcessEnv;
    preload?: string;
    cwd?: string;
    /** The arguments after the launcher (default ['mcp']): server.json's packageArguments (FR-012) */
    args?: readonly string[];
  } = {}
): SpawnedServer
```

`const args = [...preloadArgs, BIN, ...(options.args ?? ['mcp'])]`. Every existing caller passes no `args`, so the spawned command is unchanged (`ts_references spawnServer` lists them, and none is edited).

#### B3. `packages/cli/src/__tests__/mcp-registry.spec.ts` (new; FR-012, SC-004, SC-006)

The `cli` project (it spawns `bin/cli.js`, which needs the build, like `mcp-stdout.spec.ts`). It reads `../../server.json`, `../../package.json` and `../../../../.github/workflows/publish-cli.yml` with `fs.readFileSync`.

The workflow parsing is text-level. `yaml` is not a CLI dependency: it is in the store only transitively (`yaml@2.8.3`, `yaml@2.9.1`), and a test must not import an undeclared package. Two local helpers:

```ts
/** The lines of job `name` (from `  <name>:` to the next 2-space key). */
function jobBlock(workflow: string, name: string): string
/** The steps of a job block: name and the text up to the next `      - name:`. */
function steps(block: string): { readonly name: string; readonly body: string }[]
```

#### B4. `package-bin.spec.ts` additions (FR-010, FR-011, SC-017)

Inside the existing "npm packs …" test (`:218-271`), or a sibling test using `packedFiles()` (`:47-57`):
- `expect(packedFiles()).not.toContain('server.json')`;
- `expect(packedFiles().filter(f => /^(plugins|\.claude-plugin|\.cursor-plugin|\.agents)\//.test(f))).toEqual([])`;
- `expect(pkg.mcpName).toBe('io.github.rolandzwaga/eligian')` and `expect(packedFiles()).toContain('package.json')`.

`pkg` is the **source** manifest (`package-bin.spec.ts:21`). `npm pack --dry-run --json` lists paths but not contents, and a spec cannot run `pnpm pack` safely (P21). So these three places prove that the **packed** manifest keeps `mcpName` (P21):
- `baseline/packed-manifest.txt`, from G1: `pnpm -C packages/cli pack` followed by `tar -xzOf eligian-1.1.0.tgz package/package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).mcpName"`;
- on every publish, the added line in "Try the package" (B5), which runs before `Publish`;
- the `mcp-registry.spec.ts` assertion that this line exists (Test plan, SC-006 row).

#### B5. `.github/workflows/publish-cli.yml` (FR-013, FR-014)

- `on.workflow_dispatch` gains the input:
  ```yaml
  on:
    workflow_dispatch:
      inputs:
        registry_only:
          description: 'Only publish server.json to the MCP registry (npm already has this version)'
          type: boolean
          default: false
  ```
- **Plan decision (FR-013d):** under `registry_only`, the steps that build or publish the package are skipped: `Build`, `Test`, `Pack`, `Try the package`, `Publish`, `Keep the tarball`, each with `if: ${{ !inputs.registry_only }}`. Checkout, setup and install stay unconditional (cheap, and they keep the job's shape). The `release` job gets `if: ${{ !inputs.registry_only }}` and keeps `needs: publish` (`:115`). The three registry steps carry **no** `if:`.
- New steps, in this order within `publish`:
  1. after `Try the package`: **`Install mcp-publisher`**
     ```yaml
     - name: Install mcp-publisher
       # Pinned release; the checksum is registry_1.8.7_checksums.txt's line for this archive.
       # Upgrade: change the tag in the URL and the checksum together.
       working-directory: ${{ runner.temp }}
       run: |
         set -euo pipefail
         curl --fail --location --silent --show-error --output mcp-publisher_linux_amd64.tar.gz \
           https://github.com/modelcontextprotocol/registry/releases/download/v1.8.7/mcp-publisher_linux_amd64.tar.gz
         echo "00b21004149a4ce66f0782508ae4a2bce67d1bea395a8da0bd8028159fb59579  mcp-publisher_linux_amd64.tar.gz" | sha256sum -c -
         tar xzf mcp-publisher_linux_amd64.tar.gz mcp-publisher
         echo "$RUNNER_TEMP" >> "$GITHUB_PATH"
     ```
  2. **`Validate server.json`**: `working-directory: packages/cli`, `run: mcp-publisher validate`.
  3. `Publish` (existing; gains its `if:`).
  4. **`Publish to the MCP registry`**: `working-directory: packages/cli`, no `continue-on-error`:
     ```yaml
     # npm may not serve the new version for a while after `npm publish`, and the registry
     # checks mcpName against npm: retry for up to 6 × 30 s = 180 s. If it still fails, npm has
     # the version already: re-run this workflow with registry_only = true.
     run: |
       attempts=6
       for i in $(seq 1 "$attempts"); do
         mcp-publisher login github-oidc
         if mcp-publisher publish; then exit 0; fi
         if [ "$i" -lt "$attempts" ]; then sleep 30; fi
       done
       echo "::error::mcp-publisher publish failed $attempts times; npm has the version: re-run with registry_only" >&2
       exit 1
     ```
     The login is inside the loop, so each attempt has a fresh registry token. 6 × 30 = 180 ≤ 300 (FR-014).
  5. `Keep the tarball` (existing; gains its `if:`).
- `Try the package` gains one line after `eligian --version`:
  ```bash
  test "$(node -p "require('$(npm root -g)/eligian/package.json').mcpName")" = io.github.rolandzwaga/eligian
  ```
- The header comment gains two lines on the registry step and `registry_only`. `secrets.` appears nowhere, and `id-token: write` (`:40`) is reused.

### C. Claude Code plugin (FR-016–FR-021)

#### C1. Static files

`.claude-plugin/marketplace.json` (repo root):
```json
{
  "name": "eligian",
  "owner": { "name": "Roland Zwaga" },
  "description": "The Eligian MCP server for Claude Code: write Eligius presentations in the Eligian DSL",
  "plugins": [
    {
      "name": "eligian",
      "source": "./plugins/claude/eligian",
      "description": "Adds the eligian MCP server (npx -y eligian@^1.1 mcp): docs, operations, check, fmt, compile, project, init, smoke"
    }
  ]
}
```
(No `version` in the entry, P8.)

`plugins/claude/eligian/.claude-plugin/plugin.json`:
```json
{
  "name": "eligian",
  "displayName": "Eligian",
  "version": "1.1.0",
  "description": "The Eligian MCP server: write Eligius presentations in the Eligian DSL with docs, checks and smoke tests",
  "author": { "name": "Roland Zwaga" },
  "homepage": "https://github.com/rolandzwaga/eligian/tree/main/packages/cli#readme",
  "repository": "https://github.com/rolandzwaga/eligian",
  "license": "MIT",
  "keywords": ["eligian", "eligius", "dsl", "presentation", "mcp"]
}
```

`plugins/claude/eligian/.mcp.json` (the plugin-root form, `mcp.md` "In `.mcp.json` at plugin root": `{ "mcpServers": { … } }`):
```json
{ "mcpServers": { "eligian": { "command": "npx", "args": ["-y", "eligian@^1.1", "mcp"] } } }
```

These paths are outside Biome's `packages/**` scope and outside `pnpm-workspace.yaml` (`packages/*`), so nothing installs or lints them. The drift spec parses them.

#### C2. `packages/cli/src/__tests__/plugins.spec.ts` (new; FR-016a–FR-021, SC-008)

It imports `serverEntry` from `../agents.js` and reads files relative to the repo root (`path.resolve(HERE, '..', '..', '..', '..')`). Helper `listFiles(dir): string[]` (recursive, POSIX-relative, sorted).

### D. Recycling (FR-022–FR-026)

#### D1. `packages/cli/src/mcp/compiler-lock.ts`

- `:36-37` becomes `export const RECYCLE_AFTER = <N>;`. The doc comment names `specs/058-mcp-server/phase-5-hardening-reach/baseline/recycle-measurements.txt`, the rule (FR-023) and the measured row.
- `:113` comment "a recycle every 100 sections" becomes "every {@link RECYCLE_AFTER} sections".
- Only if FR-025 triggers: `recycleCompilerServices` (`:43-48`) also calls `resetFormatServices()`.
- Nothing else changes: `countSection` (`:83-88`) and `run` (`:89-110`) are untouched (FR-026: no exit, no re-exec).

#### D1b. The tool mix, shared by the script and the soak: new `packages/cli/src/__tests__/mcp-tool-mix.ts`

This is a test helper, so it is excluded from coverage by `src/**/__tests__/**` (`vitest.config.ts:55`).

```ts
import { NAME as CHECK } from '../mcp/tools/check.js';
import { NAME as COMPILE } from '../mcp/tools/compile.js';
import { NAME as FMT } from '../mcp/tools/fmt.js';
import { NAME as OPERATIONS } from '../mcp/tools/operations.js';
import { NAME as PROJECT } from '../mcp/tools/project.js';

export interface MixCall { readonly name: string; readonly args: Readonly<Record<string, unknown>> }

/** FR-022's M, for one entry file (relative to the server cwd). */
export function toolMix(entry: string): readonly MixCall[]
// [ { CHECK, { paths: [entry] } },
//   { PROJECT, { path: entry } },
//   { COMPILE, { path: entry, view: 'summary' } },
//   { FMT, { paths: [entry], write: false } },
//   { OPERATIONS, { path: entry, names: ['addClass'] } } ]

/** FR-022's rotation: call i (0-based) after r recycles uses M[(i + r) mod |M|]. */
export function mixCall(mix: readonly MixCall[], i: number, recycles: number): MixCall

/** Copies a project into a fresh temp dir (no dist/, no storyboards/), returning its path. */
export function copyProject(from: string, exclude?: readonly string[]): string

/**
 * `heapUsed` in bytes after two forced GCs. Moved here from `mcp-soak.spec.ts:33-37`;
 * `measure-heap.ts:61-65` (MB) and `measure-recycle.ts` call it too, dividing by MB themselves.
 */
export function heapAfterGc(gc: () => void): number
```

`mcp-soak.spec.ts` and `measure-heap.ts` delete their local copies. `measure-heap.ts`'s default behaviour and output stay as they are (its Phase 3 baseline `measure-heap-200.txt` stays comparable). Only its header changes: "every 100 sections" becomes "every `RECYCLE_AFTER` sections".

The argument shapes match the real schemas: `check.ts:49-55` (`paths` minLength 1), `project.ts:79-82` (`path`), `compile.ts:69-82` (`path`, `view: 'summary'|'fragment'|'full'`), `fmt.ts:41-44` (`paths`, `write`), `operations.ts:75-83` (`path`, `names`). Each is one lock section on the tour: `check.ts:127`, `compile.ts:491`, `fmt.ts:88` and `operations.ts:321` are one `lock.run` each. `project.ts:566-569` is one per non-library program, and `presentation.eligian` is the tour's library (`grep -ln "^library"`).

#### D2. `packages/cli/scripts/measure-recycle.ts` (new; FR-022, FR-025)

Run as `pnpm -C packages/cli run measure:recycle -- --out <file>`, where the script is `node --expose-gc --import tsx scripts/measure-recycle.ts`. tsx 4.23.15 (`packages/cli/node_modules/tsx/package.json`) supports `--import tsx`, and Node flags such as `--expose-gc` go to `node` directly.

```text
measure-recycle [--project <dir>] [--entry <file>] [--calls 500] [--n 25,50,100,200] [--fmt-calls 500] --out <file>
defaults: --project ../../examples/eligian-tour --entry tour.eligian
internal: --row <never|25|50|100|200|fmt> --docs-root <dir> --row-out <file>   (one child per row, P19)
```

**Why a new script and not a mode of `measure-heap.ts`.** `packages/cli/scripts/measure-heap.ts` (Phase 1/3) already has some of the needed parts: the in-process server with `compilerLockLayer({ onRecycle })` (`:69-78`), the exit when `globalThis.gc` is missing (`:54-58`), `heapAfterGc` (`:61-65`) and the `node --expose-gc --import tsx` invocation (`:10`). The parts shared with this script are reused, not copied:
- `heapAfterGc` moves into the D1b helper, and both scripts and the soak call it;
- the server and lock setup is the same two calls, `startInMemoryServer` and `compilerLockLayer`, imported from the same modules (`measure-heap.ts:17-18`);
- the gc check is the same three lines with the same exit code 1 (not a new exit 2).

The rest of D2 does not fit `measure-heap.ts`:
- **It is a parent that spawns one child per row (P19).** `measure-heap.ts` is one process, one server and one tool.
- **It needs more options.** It takes `--project`, `--entry`, `--n`, `--fmt-calls`, `--out` and the internal `--row*` options. `measure-heap.ts` takes only `--calls`, on a fixed fixture.
- **Its output is different.** It writes the FR-022 file through `--out` (P13). `measure-heap.ts` writes a seven-line report on stdout.
- **The baseline stays comparable.** A second mode would put both argument sets and both outputs in one file, and Phase 3's `measure-heap-200.txt` baseline must stay comparable with `measure-heap.ts`'s unchanged default.
- **The spec names the file.** FR-022 and the spec's "New components" table name `packages/cli/scripts/measure-recycle.ts`.

`measure-heap.ts` gets its header fixed ("every 100 sections" → "every `RECYCLE_AFTER` sections") and the D1b `heapAfterGc`. Nothing else in it changes.

Flow:
1. Exit 1 if `globalThis.gc` is missing (as `measure-heap.ts:54-58`). The check runs in the parent and again in each child.
2. The parent makes one fresh `copyProject(project)` per row and one for the fmt-only run, so no row sees a file another row wrote.
3. The parent writes one minimal docs root, as `mcp-soak.spec.ts:48-51` does: `index.json` = `[]`, `overlays.json` = `{"byCode":{},"bySource":{}}`. The docs cache is loaded once and does not grow, and the measurement is about the compiler services.
4. **Rows are isolated (P19).** For each row, in order `never, 25, 50, 100, 200`, the parent spawns one child:
   ```ts
   spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url),
     '--row', row, '--project', copy, '--entry', entry, '--docs-root', docsRoot,
     '--calls', String(calls), '--row-out', rowFile], { stdio: ['ignore', 'ignore', 'inherit'] })
   ```
   - `process.execArgv` carries `--expose-gc --import tsx`.
   - The child starts with fresh module singletons: `sharedServices` (`services.ts:26`) and the formatter's `services` (`format-source.ts:22`). No row can therefore free or inherit another row's documents.
   - A non-zero child exit stops the parent with that exit code. The child's stderr is inherited (progress, and the server's telemetry lines). Its stdout is ignored.

   The child runs one `startInMemoryServer({ cwd: copy, docsRoot, lock: compilerLockLayer({ onAcquire, onRecycle }, { recycleAfter }) })`, with `never` = `Number.MAX_SAFE_INTEGER`. Then:
   - `heapBefore = heapAfterGc(gc) / MB` (the D1b helper), taken after the server has started and before the first call;
   - for `i` in `0..calls-1`: `call = mixCall(mix, i, recycles.length)`, time it with `performance.now()` around `server.callTool`, and record `{ i, tool, ms, triggered: recycles grew during this call, afterRecycle: previous call triggered }`. An `isError` result stops the script (exit 1) with the payload;
   - `heapAfter = heapAfterGc(gc) / MB`; then `sections` (the `onAcquire` count) must equal `calls`, or the script throws `sections (${s}) ≠ calls (${c}) on ${project}` and exits 1;
   - compute `base(t)` = the median of the calls of tool `t` with `!triggered && !afterRecycle`, `post(k)` = (latency of the first call after recycle k) / `base(tool)`, `trig(k)` = (latency of the triggering call) / `base(tool)`, their medians, and the overall median and p95;
   - `server.close()`. The child then writes the row's numbers and raw per-call lines as JSON to `--row-out` and exits 0.
5. The **fmt-only run** (FR-025) runs in its own child (`--row fmt`, `--calls <fmt-calls>`): a server at `recycleAfter: 100`, 500 × `eligian_fmt` (`write: false`), and `heapAfterGc(gc)` after each 100 calls. Metric = `(h[500] − h[100]) / 4` MB per 100 calls. Because this child makes no other calls and starts with a fresh formatter set, its growth is attributable to `formatSource`, as FR-025 requires.
6. The parent reads the row files and writes `--out`:
   - a header with the date, Node version, platform, project, entry and calls, and the line `isolation: every row and the fmt-only run ran in its own node process on a fresh copy of the project (P19)`;
   - the table `| N | heap before MB | heap after MB | growth MB | sections | recycles | median post | median trig | median ms | p95 ms |`;
   - per row, the `base(t)` per tool;
   - the fmt checkpoints and the metric;
   - **the FR-023 decision line**, computed by the script: `chosen N = <n> (largest of {25,50,100,200} with growth ≤ 25 MB and median post ≤ 3 and median trig ≤ 3)`, or the fallback "lowest growth" line with the reason;
   - the FR-025 verdict ("> 1 MB per 100: reset required" / "≤ 1 MB per 100: no change");
   - then the raw per-call lines (`i tool ms flags`).

Progress goes to stderr. The script never sets `ELIGIAN_MCP_LOG`.

Runtime estimate: 5 rows × 500 + 500 fmt = 3,000 tour calls, plus six child starts of a few seconds each. At 0.1–0.5 s per call that is 5–25 min, so it runs once, in the background, in G3. It is not in CI.

The script has no logic of its own beyond orchestration and the statistics. The rule's arithmetic is small and reviewed against the table (SC-014's reviewer check). Moving it into `src/` to unit-test it would add a module whose only caller is a one-off script (I Simplicity).

#### D3. `mcp-soak.spec.ts` (FR-024, SC-015)

- Imports `RECYCLE_AFTER` from `../mcp/compiler-lock.js` and `toolMix`, `mixCall`, `copyProject` from `./mcp-tool-mix.js`.
- **Case 1 (existing, N-relative, P12):** `it('2 × N checks stay under 25 MB and recycle twice')` with `CALLS = 2 * RECYCLE_AFTER` and `expect(recycles).toEqual([RECYCLE_AFTER, 2 * RECYCLE_AFTER])`. The lock is still `compilerLockLayer({ onRecycle })` without options (production default).
- **Case 2 (new):** `it('2 × N mixed tool calls on the tour stay under 25 MB, sections = calls, recycles = ⌊sections / N⌋')`, `{ timeout: 900_000 }`:
  - `copyProject(examples/eligian-tour)`; the lock is `compilerLockLayer({ onAcquire: () => sections++, onRecycle: async c => { recycles.push(c) } })` (default N);
  - the calls: `for i < 2N: mixCall(toolMix('tour.eligian'), i, recycles.length)`;
  - asserts: `after − before ≤ CEILING`; `sections === 2N` (before the recycle assertion, FR-024); `recycles.length === Math.floor(sections / RECYCLE_AFTER)`; `recycles` equals `[N, 2N]`;
  - it logs one `console.error` line like case 1's (`mcp-soak.spec.ts:70-74`), which SC-015 quotes.

#### D4. Only if FR-025 triggers: `packages/language/src/lsp/format-source.ts`

```ts
/** Drops the formatter's private service set; the next formatSource builds a fresh one (spec 058 FR-025). */
export function resetFormatServices(): void { services = undefined; counter = 0; }
```

It is exported from `packages/language/src/index.ts` beside `formatSource` (`index.ts:79`).

SC-016 asks for a spec showing "a new set after the recycle". A call that only formats again would also pass with a no-op reset. So `format-source.ts` gets a test seam, which `index.ts` does **not** re-export:

```ts
/** Test seam (spec 058 SC-016): the current private service set, undefined before the first format and after a reset. */
export function formatServicesForTest(): EligianServices | undefined { return services; }
```

The spec is a **new** `packages/language/src/lsp/__tests__/format-source.spec.ts`, which imports `../format-source.js` directly. No `format-source.spec.ts` exists today: `grep -rln formatSource packages/language/src --include=*.spec.ts` finds only `lsp/__tests__/formatter.spec.ts` and `timeline/__tests__/target-and-with.spec.ts`, and neither is about the service set. The CLI lock spec checks that `recycleCompilerServices` calls `resetFormatServices` (Test plan, SC-016).

### A0. Promotion evidence (FR-001, FR-001a, SC-020)

#### A0-1. `packages/cli/src/mcp/evals/promotion-evidence.ts` (new; pure; re-exported from `assert.ts` with `export * from './promotion-evidence.js'` beside `:1466-1468`, so it is part of `dist/evals/assert.mjs`)

```ts
import { REVIEW_CODES, type ReviewCode } from '../../check/review.js';
import type { TelemetryLike } from './transcript.js';

export { REVIEW_CODES };

/** A telemetry line as read back, plus telemetry.ts's cut marker (`TelemetryLine.truncated`, `telemetry.ts:23-24`; P20). */
export type EvidenceLine = TelemetryLike & { readonly truncated?: unknown };

/** One new-format record `<run>/<case>/<arm>-<n>.json` and, for A1, its log (undefined: no .mcp.log). */
export interface EvidenceRecord {
  readonly runId: string;
  readonly caseId: string;
  readonly arm: string;                              // 'A0' | 'A1' | 'A-none', from the file name
  readonly n: number;
  readonly model: string;
  readonly lines: readonly EvidenceLine[] | undefined;
}

/** FR-001b's "full run": every id in `caseIds` has at least one A1 record among `records` (one run's records). */
export function isFullRun(records: readonly EvidenceRecord[], caseIds: readonly string[]): boolean

/** The `result.codes` keys of each `eligian_check` line, in call order, with the line's cut marker. */
export function checkCodesInOrder(
  lines: readonly EvidenceLine[]
): readonly { readonly codes: ReadonlySet<string>; readonly truncated: boolean }[]

/** FR-001 (b) for one record: check lines reporting `code` that are followed by a later check line. */
export function roundsWhileReported(lines: readonly EvidenceLine[], code: string): number

export type CheckNeeds = 'ast-and-files' | 'compiled-config' | 'install';
export const CHECK_NEEDS: Readonly<Record<ReviewCode, CheckNeeds>>
// TIMELINE_REVIEW_CODES → 'ast-and-files'; controller-imbalance, class-never-removed,
// host-operation-in-block-without-select → 'compiled-config'; lottie-web-not-installed → 'install'

export interface CodeEvidence {
  readonly code: ReviewCode;
  readonly runsWithCode: number | 'no data';        // column (a)
  readonly rounds: number | 'no data';              // column (b)
  readonly roundsPerRun: readonly { readonly run: string; readonly rounds: number }[];
  readonly needs: CheckNeeds;                       // column (c)
  readonly editorCost: string;                      // column (d)
  readonly promote: boolean | 'rule not applied';
}

export interface PromotionEvidence {
  /** Pinned run ids that are full: the only runs whose A1 records are counted */
  readonly counted: readonly string[];
  /** Pinned run ids that are not counted: 'no records', or 'not a full run: no A1 record for <case ids>' */
  readonly rejected: readonly { readonly run: string; readonly reason: string }[];
  /** A1 records of counted runs without a .mcp.log, each listed as "no data" (FR-001) */
  readonly noData: readonly { readonly run: string; readonly caseId: string; readonly n: number }[];
  /** Counted check lines marked `truncated`: when > 0, columns (a) and (b) are lower bounds (P20) */
  readonly truncatedLines: number;
  readonly ruleApplies: boolean;                    // counted.length > 0
  readonly rows: readonly CodeEvidence[];           // the 9 REVIEW_CODES, in REVIEW_CODES order
}

/**
 * FR-001's table. Run selection is decided here, not in the script. Only A1 records are counted,
 * and only when their `runId` is in `pinned` and `isFullRun` holds over all of that run's records.
 * Every other record (unpinned runs, partial runs, A0 / A-none) adds nothing.
 * With `pinned` undefined or empty, nothing is counted: every row reads 'no data' and
 * 'rule not applied' (FR-001a).
 */
export function promotionEvidence(input: {
  readonly records: readonly EvidenceRecord[];
  readonly caseIds: readonly string[];
  readonly pinned: readonly string[] | undefined;
}): PromotionEvidence
// promote ⇔ ruleApplies && code !== 'lottie-web-not-installed' && runsWithCode !== 'no data'
//           && (runsWithCode >= 2 || rounds >= 1)

/**
 * The markdown file, in this order: the scanned runs (each with its format and arms); the pinned
 * runs (counted, or rejected with the reason); one "no data" line per entry of `noData`; the
 * truncation note; the table; the rule.
 */
export function renderPromotionEvidence(input: {
  readonly scanned: readonly { readonly run: string; readonly note: string }[];
  readonly evidence: PromotionEvidence;
}): string
```

- **Which runs count is pinned, not inferred.** The counted runs are the Phase 3 full runs, named on the command line: `--runs <id,...>` (A0-2), using the ids `evals.md` reports.
  - A cutoff date was rejected. Run ids are ISO timestamps (`run.ts:481`), and every later run lands in the same `evals/mcp/results`: Phase 5's own SC-003 run (`pnpm evals:mcp --arm A1 --arm A0 --runs 3`) and any debug run (`pnpm evals:mcp --case 3`, `run.ts:7`). A cutoff would still have to be set by hand.
  - With a pin, an unnamed run is never counted, so a regeneration after SC-003 gives the same table.
  - A named run that is not full is never counted either. It goes to `rejected`, and the script exits 1 (A0-2).
- Column (a) counts A1 **records** of counted runs (one case × one repetition is one "A1 run" in FR-001's sense). A record counts once per code, however often it reports the code.
- A counted A1 record with `lines === undefined` adds nothing to (a) or (b). It is listed in `noData`, and the renderer writes `- <run> <case> A1-<n>: no data (no .mcp.log)` for it. This is FR-001's "Runs without a log are listed as 'no data'".
- A row's (a) and (b) read "no data" when no counted record has a log.
- A truncated check line is counted as read: its codes still count. But `telemetryText` keeps only the largest counts (`telemetry.ts:79-98`), so any code may have been cut from it. When `truncatedLines > 0`, the renderer prints `≥ <n>` in columns (a) and (b) of every row, plus the note "`<k>` counted check lines were truncated (`telemetry.ts:79-98`): columns (a) and (b) are lower bounds; a row below the rule may be under-counted". A row that meets the rule on its lower bound is promoted. A row below it keeps `promote: false`, and the note asks the user to check that row.
- `result.codes` is read as `Record<string, number>` (the shape in `phase-3-evals-provenance/baseline/measure-heap-200.txt`), and lines whose `tool !== 'eligian_check'` are ignored.
- The output is deterministic (sorted, no timestamps), so a regeneration diffs cleanly.

#### A0-2. `evals/mcp/promotion-evidence.ts` (new; tsx, outside Biome and tsconfig like `run.ts`; loads the bundle with `loadEvalBundle()` from `./gate.ts`, `gate.ts:91`) and root script `"evals:mcp:evidence": "tsx evals/mcp/promotion-evidence.ts"`

1. Walk `evals/mcp/results/*/`:
   - old-format `<run>/<case>.json` → scanned with the note "one-case harness record (Phases 1–2), no telemetry log";
   - every new-format `<run>/<case>/<arm>-<n>.json` → an `EvidenceRecord` (`runId`, `caseId`, `arm` and `n` from the path; `model` from the record, `run.ts:393-409`);
     - for A1, `lines` comes from `readMcpLog(<same base>.mcp.log)` (`transcript.ts:169`, which returns `TelemetryLike[]`; the parsed objects keep `truncated`, which `EvidenceLine` reads), or is `undefined` when the log is absent;
     - A0 and A-none records get `lines: undefined` and the scan note "no telemetry by design (A0 checks through Bash)". They are passed anyway, so that `isFullRun` sees the whole run.
2. `caseIds` = the ids of `evals/mcp/cases/*.json`, scenarios excluded (the same filter as `knownCases`, `run.ts:112-118`). `--runs <id,...>` (comma-separated, no default) becomes `pinned`. The script does **no** selection of its own: it passes all records to `promotionEvidence`. When `rejected` is non-empty, it prints each reason on stderr and exits 1 without writing.
3. Write `--out` (default `specs/058-mcp-server/phase-5-hardening-reach/baseline/promotion-evidence.md`).

G4 writes the FR-001a file **without** `--runs`: no Phase 3 full run exists yet (P15), so every row reads "no data" / "rule not applied". GP's regeneration passes the full-run ids that `evals.md` names, and `compliance.md` quotes the exact command.

It needs a fresh `pnpm -C packages/cli build` (the same requirement as `evals:mcp`, AGENTS.md).

### A. Promotions (blocked; FR-002–FR-009, SC-010–SC-013, SC-019, SC-021)

The design is done now, so a mini-spec only fills in the sections below. Each mini-spec (FR-002) is appended to spec.md under "Promotions" and is gated before its tasks run. Its sections are:
1. **Code and kind**: AST-only (A-A) or config-based (A-B).
2. **Current home**: file and line of the check today.
3. **Validator home**: file and method, or `configReviewFindings`.
4. **Trigger**: the AST node type, or the I-2 channel (`lintDocument`).
5. **Fixtures**:
   - the trigger fixture and its clean counterpart;
   - a **library-only** fixture (a `library` file opened alone, FR-009);
   - for `controller-imbalance`, also the non-literal-selector fixture (SC-019).
6. **Test names** (FR-002), including the SC-010 once-only CLI and MCP tests (Test plan, language and extension).
7. **The new-context rule** (FR-009). The mini-spec says where the validator newly runs where the review pass never did, and what it reports there. At least: a library file opened alone in the editor gives **0** `<c>`. For the timeline codes the stated reason is that libraries have no timelines, so `timelineFindings` (which walks `getTimelines`, `timeline-review.ts:14`) finds nothing. For a config code it is that `withCompiledChecks` skips libraries (`check-command.ts:185`) and the language server's path does the same. The mini-spec verifies and quotes which `lintDocument` guard does it.
8. **For a media code** (`media-file-missing`, `media-from-duplicate`, `media-timeline-first-without-start-gesture`): the E-4 decision. Either a stale squiggle after `media/intro.mp4` is created is acceptable until the next edit (the default), or a file watcher is needed. The section gives the reason, and says whether the code depends on a file's existence at all.
9. **The before-capture** (GP step 2): the fixture paths whose `check --format json` output is captured into `baseline/promotion-<c>-before.json` before the move.

#### A-A. AST-only code(s) (a subset P_T of `TIMELINE_REVIEW_CODES`)

- **`timeline-review.ts`**:
  - `TIMELINE_REVIEW_CODES` (`:16`) keeps only the non-promoted codes;
  - a new `export const TIMELINE_VALIDATOR_CODES = [...P_T] as const`;
  - `TimelineReviewCode` (`:23`) is redefined as the union of both, since `timelineFindings` still produces all five and `eligian_project`'s `assets.problems` keeps them all (FR-004);
  - `ASSET_REVIEW_CODES` (`:25`) is unchanged in content.
- **New `packages/language/src/validators/timeline-review-validator.ts`**:
  ```ts
  export class TimelineReviewValidator {
    /** P_T findings of `timelineFindings`, as warnings on the Program at the review range (FR-004). */
    checkProgram(program: Program, accept: ValidationAcceptor): void
  }
  ```
  - `file = program.$document?.uri.fsPath` (E-1, as `eligius-lint.ts:42`; none → return).
  - `timelineFindings(program, file)` (`:80`) is filtered to `TIMELINE_VALIDATOR_CODES` minus `timeline-container-not-in-layout`, which is handled in A-A2.
  - Each finding becomes `accept('warning', f.message, { node: program, range: { start: { line: f.line - 1, character: f.column - 1 }, end: { line: f.endLine - 1, character: f.endColumn - 1 } }, data: { code: f.code } })` (P17).
  - It is registered on `Program` beside `:107`, through `registerValidationChecks` (`eligian-validator.ts:102`). It never calls `getOrCreateServices()` (E-2) and holds no cache (E-7).
- **A-A2, `timeline-container-not-in-layout`** (FR-004a):
  - `withoutReported` moves from `check-command.ts:229` into new `packages/language/src/validators/container-findings.ts`, generalized:
    ```ts
    export const CONTAINER_REPORTED_CODES = ['selector_not_in_layout', 'unknown_css_id_in_selector', 'unknown_css_class_in_selector'] as const;
    export function withoutReported<D extends { readonly code?: string; readonly line: number; readonly column: number }>(
      added: readonly D[], validated: readonly D[]): D[]
    ```
  - `checkTimelineContainerSelector` (`timeline-validator.ts:275`) records `{ code, line, column }` for each diagnostic it accepts on `containerSelector` (`:340-357`, `:361`, through a wrapping acceptor). It then calls `withoutReported(containerFindings, recorded)` and accepts the survivors as warnings.
  - **Entry point.** `withoutReported` and `CONTAINER_REPORTED_CODES` are re-exported from `packages/language/src/mcp.ts`, next to `TIMELINE_REVIEW_CODES` (`mcp.ts:18-20`), so they are reachable as `@eligian/language/mcp`. That specifier is in the package `exports` (`packages/language/package.json:29-32`) and in the bundle's `WORKSPACE_SOURCES` (`esbuild.mjs:37`). Any other `@eligian/...` specifier fails the build with "No source entry for the workspace import" (`esbuild.mjs:47-48`).
  - `check-command.ts` imports both from `'@eligian/language/mcp'`. Today it imports only from `'@eligian/language'` (`:19`), and `review.ts:46` already imports from `/mcp`. The validator imports `./container-findings.js` relatively.
  - `ts_references withoutReported` must then list one definition, the `mcp.ts` re-export, the validator's import and `check-command.ts`'s import (SC-021).
- **Codes and sources:** P_T goes into `SOURCES` (`codes.ts`) as `'validator'`. `REVIEW_CODES` (`review.ts:49-55`) loses it through the spread of `TIMELINE_REVIEW_CODES`. `reviewConfig` (`:89`) maps only `timelineFindings(...).filter(f => TIMELINE_REVIEW_CODES.includes(f.code))`.

#### A-B. Config-based code(s) (a subset P_C of `controller-imbalance`, `class-never-removed`, `host-operation-in-block-without-select`)

- **New `packages/language/src/compiler/config-review.ts`** (exported from `@eligian/language` and `@eligian/language/mcp`). It receives, unchanged in behavior, `controllerImbalance`, `removalFix`, `multisetMinus`, `classesNeverRemoved`, `hostOperationsWithoutSelect` and `diagnostic` (`review.ts:95-400`):
  ```ts
  export const CONFIG_REVIEW_CHECK_CODES = ['controller-imbalance', 'class-never-removed', 'host-operation-in-block-without-select'] as const;
  export type ConfigReviewCode = (typeof CONFIG_REVIEW_CHECK_CODES)[number];
  export const CONFIG_VALIDATOR_CODES: readonly ConfigReviewCode[];   // = P_C
  export function configReviewFindings(
    compiled: { readonly config: IEngineConfiguration; readonly map: EligianMap; readonly program: Program },
    file: string,
    codes: ReadonlySet<ConfigReviewCode>
  ): CheckDiagnostic[];
  ```
  - `program` is the parsed program. The CLI passes its compile result, which carries `program` (`reviewConfig` already reads `compiled.program`, `review.ts:86`). The language server passes `{ ...compiled, program: root }` (P22), because `tryCompileProgramWithMap` returns no `program` (`pipeline.ts:307-313`).
  - `reviewConfig` calls `configReviewFindings(compiled, file, <non-promoted>)`. There is one implementation (FR-005c).
  - `review.ts` keeps `lottieNotInstalled`.
- **`codes.ts`:** `DiagnosticSource` (`:18`) gains `'config'`, and P_C goes into `SOURCES` as `'config'`. Two places in `diagnostics.ts` gain `'config'`: the `McpDiagnosticSource` type (`:26`) and the runtime list `MCP_DIAGNOSTIC_SOURCES` (`:68-78`). `McpDiagnosticSchema` reads the list as `Schema.Literals(MCP_DIAGNOSTIC_SOURCES)` (`:90`), so without the array entry `eligian_check`'s output schema rejects a `source: 'config'` diagnostic. `sourceOf` (`:124-129`) already reads the registry first.
- **Catalogue and overlay** (FR-008, config-based only):
  - `config` is added to the diagnostics chunk body's hard-coded source list in `generate-knowledge.ts` (`:1127`: "(`parser`, `validator`, `type`, `linker`, `compiler`, `eligius-lint`, `review`, `smoke`)").
  - A new overlay `packages/cli/src/mcp/knowledge/curriculum/diagnostics/source-config.md`, with frontmatter `source: config`, is read by `diagnosticOverlays` into `bySource` (`:354`). Every other source has one (`source-compiler.md`, `source-eligius-lint.md`, `source-linker.md`, `source-parser.md`, `source-review.md`, `source-type.md`, `source-validator.md`).
- **CLI wiring** (FR-005a b): `withCompiledChecks` (`check-command.ts:169-221`) returns early only when `!checks.lint && !checks.review && CONFIG_VALIDATOR_CODES.length === 0`. It merges `configReviewFindings(compiled, result.file, new Set(CONFIG_VALIDATOR_CODES))` outside the `checks.review` guard (`:190`). The error-program (`:184`) and library (`:185`) skips stay.
- **Language server** (FR-005a a, P18): `lintDocument` (`eligius-lint.ts:28-53`) returns empty only when `!clean`. When clean, it compiles once (`tryCompileProgramWithMap(root, document.uri.fsPath)`, `pipeline.ts:307-313`) and calls `configReviewFindings({ ...compiled, program: root }, document.uri.fsPath, new Set(CONFIG_VALIDATOR_CODES))` (P22). It adds `lintCompiledConfig(...)` findings only when `Settings.eligiusLint`, and always adds the P_C findings, converted by a new `configFindingsToParams` beside `lintFindingsToParams` (`eligius-lint-notifications.ts:32`) with `source: 'Eligian'`, `code: <c>`, and `data: { quickFix }` when present. Same notification, same `eligius-lint` collection.
- **Editor quick fix** (FR-005b, only for `controller-imbalance`): `EligiusLintStore` keeps the server diagnostics, including `data`. A new `vscode.languages.registerCodeActionsProvider('eligian', …)` in `packages/extension/src/extension/eligius-lint-diagnostics.ts` returns, for a context diagnostic with `code === 'controller-imbalance'`, the stored diagnostic's `data.quickFix` as a `WorkspaceEdit`. It is converted to 0-based once, and SC-019 compares it back to 1-based. This sits in the extension because diagnostics of the extension's own collection never reach the language server's code-action provider with their `data`.
- **Common to both kinds:**
  - FR-006 text goes in `eligian_check`'s description (`check.ts`) and the CHANGELOG.
  - FR-007 moves the bullet(s) in `runtime-state-pitfalls.md` from `## Caught: the review warnings` (`:42`) to a new `## Caught in the editor`, with the `(probed: …)` markers verbatim.
  - FR-008 edits the overlay text. The generator's catalogue (`diagnosticsChunk`, `generate-knowledge.ts:1103-1135`) has no source headings. It emits one `- <code> · <source> · <overlay>` line per code (`:1116`), takes the codes from `DIAGNOSTIC_CODES` and `REVIEW_CODES` (`:1106-1107`) and the source from `sourceOf`. So a promoted code's line changes from `· review ·` to `· validator ·` or `· config ·` with no generator change. A config-based promotion also needs the source-list and `source-config.md` edits (A-B).

## Data and generation design

| Artifact | Input | Generator | Output | Drift / check |
|---|---|---|---|---|
| `baseline/promotion-evidence.md` | `evals/mcp/results/**` (`.json` records, `.mcp.log`), `evals/mcp/cases/*.json` | `pnpm evals:mcp:evidence [-- --runs <id,...>]` (A0-2, over A0-1) | the FR-001 table, scanned runs, pinned runs (counted / rejected), "no data" records, truncation note, rule status | regenerated, never hand-edited (FR-001a); `mcp-promotion-evidence.spec.ts` pins the functions |
| `baseline/recycle-measurements.txt` | `examples/eligian-tour` (one fresh copy per row; one child process per row, P19) | `pnpm -C packages/cli run measure:recycle -- --out …` (D2) | FR-022 table, fmt checkpoints, FR-023/FR-025 verdicts, raw lines | `RECYCLE_AFTER`'s doc comment quotes the chosen row; reviewer check in `compliance.md` (SC-014) |
| `baseline/mcp-publisher-validate.txt` | `packages/cli/server.json` | `mcp-publisher validate` v1.8.7 (Windows build, checksum verified) | its two lines + exit code | SC-005 |
| `baseline/packed-manifest.txt` | `pnpm -C packages/cli pack` | `tar -xzOf … package/package.json` | `mcpName` of the packed manifest | SC-017 |
| `baseline/plugin-validate.txt` | `plugins/claude/eligian`, repo root | `claude plugin validate <dir> --strict` ×2 | both outputs | SC-007 |
| `baseline/probes-before.txt` | `mcp-runtime-claims.spec.ts` | `vitest run … --reporter=verbose` count of `probed` tests | the count | SC-013 (used only when a promotion runs) |
| `baseline/promotion-<c>-before.json` (GP only) | the unchanged tree, the mini-spec fixtures | `eligian check <fixture> --format json` (GP step 2, before any move) | the pre-promotion diagnostics, ranges and `data.quickFix` | SC-010, SC-019 compare against it |
| `dist/docs/**` | the curriculum, plus a new `diagnostics/source-config.md` for a config-based promotion | `generate-knowledge.ts` (unchanged for an AST promotion; one edit for a config-based one: `config` in the source list, `:1127`) | changes only when a promotion moves a code (FR-008) | `mcp-knowledge.spec.ts` |

## Test plan

Every spec is written first and seen failing (red) before the code change. Fixtures go under `__fixtures__/`.

### CLI: `packages/cli/src/__tests__/`

| FR / SC | Spec | `describe` / `it` | Assertion strategy |
|---|---|---|---|
| FR-012, SC-004 | `mcp-registry.spec.ts` | `describe('server.json (FR-011, FR-012, SC-004)')`: `it('names the server as package.json mcpName')`, `it('carries the package version three times')`, `it('points at the eligian npm package with the stdio transport')`, `it('launches with exactly the positional argument mcp')`, `it('has a description of at most 100 characters')` | JSON equality: `server.name === pkg.mcpName`; `server.version === pkg.version === server.packages[0].version`; `packages[0].identifier === pkg.name`; `packageArguments.map(a => a.value)` toEqual `['mcp']` and every `type === 'positional'`; `transport.type === 'stdio'`; `registryType === 'npm'` |
| FR-012, SC-004 | same | `it('packageArguments start the server: initialize answers with serverInfo.name eligian')` | `spawnServer({ args: server.packages[0].packageArguments.map(a => a.value) })` → `request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo })` → `result.serverInfo.name === 'eligian'`; `close()` |
| FR-012, SC-004 | same | `it('negative control: no arguments runs compile, which exits before any frame')` | `spawnServer({ args: [] }).request('initialize', …)` rejects `/mcp exited \(1\) before answering initialize/`; `stdoutLines()` is `[]`; stderr matches `/missing required argument 'input'/` (P9) |
| FR-013, FR-014, SC-006 | same | `describe('publish-cli.yml (FR-013, SC-006)')`: `it('orders the publish job steps')`, `it('pins mcp-publisher by tag and checks its sha256 before extracting')`, `it('publishes to the registry after npm with a bounded retry and no continue-on-error')`, `it('uses no secrets')`, `it('keeps the release job behind the publish job')`, `it('registry_only skips npm publish and the release, never the registry steps')`, `it('Try the package checks the installed mcpName before Publish (P21)')` | `steps(jobBlock(yml,'publish'))` names: indexOf order `Pack < Try the package < Install mcp-publisher < Validate server.json < Publish < Publish to the MCP registry < Keep the tarball`; install body matches `/releases\/download\/v\d+\.\d+\.\d+\//`, not `/latest/`, and the `sha256sum -c` index < the `tar x` index; registry body: no `continue-on-error`, `login github-oidc` index < `publish` index, `attempts=(\d+)` × `sleep (\d+)` ≤ 300, `exit 1` present; `!/secrets\./.test(yml)`; the release block has `needs: publish`; the `registry_only:` input block has `type: boolean`. Every step of B5's skipped set (`Build`, `Test`, `Pack`, `Try the package`, `Publish`, `Keep the tarball`) and the release block match `/if:.*registry_only/`. `Keep the tarball` is listed by name: without its `if:`, `actions/upload-artifact` with `if-no-files-found: error` (`publish-cli.yml:110`) fails every registry_only run after the registry publish. The three registry steps (`Install mcp-publisher`, `Validate server.json`, `Publish to the MCP registry`) and Checkout / setup / install do not match. `Try the package`'s body contains `mcpName` and `io.github.rolandzwaga/eligian`, and its index < `Publish`'s |
| FR-010, FR-011, SC-017 | `package-bin.spec.ts` (`cli-bin`) | additions inside the existing "npm packs …" test | `not.toContain('server.json')`; no path under `plugins/`, `.claude-plugin/`, `.cursor-plugin/`, `.agents/`; `pkg.mcpName` (the source manifest; the packed one is proven per P21); `package.json` packed; the existing "mcp answers initialize in under 3 s" (`:148`) unchanged |
| FR-016–FR-021, SC-008 | `plugins.spec.ts` | `describe('the Claude Code plugin (FR-016, FR-019, SC-008)')`: `it('starts the server as serverEntry(claude, npx) on Windows and POSIX')`, `it('carries the CLI version')`, `it('holds exactly plugin.json and .mcp.json')`, `it('has the marketplace keys and a ./ source that resolves')`, `it('ships no Cursor or Codex plugin')`, `it('the README names the per-project route and the plugin install')` | `.mcp.json.mcpServers.eligian` toEqual `serverEntry('claude', { form: 'npx', platform: 'win32' })` and toEqual the `'linux'` one (P1), the command is not `node`, no `${CLAUDE_PROJECT_DIR}`; `plugin.version === cliPkg.version`; `listFiles(pluginDir)` toEqual `['.claude-plugin/plugin.json', '.mcp.json']`; marketplace `name`, `owner.name`, `plugins[0].name`, `plugins[0].source.startsWith('./')`, `fs.statSync(path.resolve(repo, source)).isDirectory()`, `plugins[0].version === undefined` (P8), `plugin.json.name === 'eligian'`; `existsSync` false for `.cursor-plugin`, `.agents/plugins`, `.codex-plugin`, `plugins/cursor`, `plugins/codex` (and for `.cursor-plugin`/`.codex-plugin` under `plugins/claude/eligian`); README contains `/plugin marketplace add rolandzwaga/eligian`, `/plugin install eligian@eligian`, `npx -y eligian@^1.1 mcp`, `eligian agents setup`, `io.github.rolandzwaga/eligian` |
| FR-022–FR-024, SC-015 | `mcp-soak.spec.ts` (`cli-soak`) | case 1 `it('2 × N checks stay under 25 MB and recycle twice')`; case 2 `it('2 × N mixed tool calls on the tour stay under 25 MB, sections = calls, recycles = ⌊sections / N⌋')` | heap after a forced GC (existing helper); `sections === calls` before the recycle check; `recycles` toEqual `[N, 2N]`; `Tests 2 passed (2)` quoted |
| FR-025, SC-016 (conditional) | `mcp-compiler-lock.spec.ts` | `it('recycleCompilerServices also drops the formatter services (FR-025)')` | `vi.mock('@eligian/language', async importOriginal => ({ ...(await importOriginal()), resetFormatServices: vi.fn() }))`, then `recycleCompilerServices()` → `resetFormatServices` called once. In the new `packages/language/src/lsp/__tests__/format-source.spec.ts`, `it('resetFormatServices makes the next formatSource build a new service set (SC-016)')`: (1) `formatServicesForTest()` is `undefined` before the first format of a fresh module (`vi.resetModules()` + dynamic import); (2) after `formatSource(src)` it is defined (`first`); (3) after `resetFormatServices()` it is `undefined`; (4) after the next `formatSource(src)` it is defined and `!== first`, and that call returns the same text as the first, so formatting still works. The heap effect is the D2 re-run, whose fmt-only metric after the change is quoted. Written only if FR-025 triggers |
| FR-001, FR-001a, SC-020 | `mcp-promotion-evidence.spec.ts` (new) | `describe('promotion evidence (FR-001)')`: `it('counts a record once per code however often it is reported')`, `it('counts a round for each reporting check line followed by another check line')`, `it('ignores lines of other tools and lines without result.codes')`, `it('says no data and rule not applied when nothing is pinned')`, `it('isFullRun needs an A1 record for every case id')`, `it('counts only pinned full runs: a partial pinned run next to a full one is rejected and adds no codes')`, `it('ignores an unpinned full run (the SC-003 re-run)')`, `it('lists a counted A1 record without a log as no data')`, `it('marks (a) and (b) as lower bounds when a counted check line is truncated')`, `it('promotes on (a) >= 2 or (b) >= 1')`, `it('never promotes lottie-web-not-installed')`, `it('renders all 9 REVIEW_CODES with columns (a)-(d), the scanned and pinned runs')` | inline `EvidenceRecord[]` / `EvidenceLine[]` arrays (e.g. check{c}, check{}, check{c} → rounds 1; check{c} last → 0). The **partial-run** case: run `F` has A1 records for every case id, run `P` (also pinned) misses one; `P`'s records report `<c>` → `counted` is `['F']`, `rejected[0].run === 'P'`, and `<c>`'s (a) is `F`'s count alone. The **unpinned** case: a full run `S` not in `pinned` that reports `<c>` changes no count. The **missing log** case: a counted A1 record with `lines: undefined` → in `noData`, and the render contains `no data (no .mcp.log)` with its run, case and n. The **truncated** case: a counted line `{ tool: 'eligian_check', result: { codes: {...} }, truncated: true }` → `truncatedLines === 1`, and the render shows `≥` cells and the lower-bound note. `renderPromotionEvidence` output contains one table row per code (9) and the header columns verbatim; deterministic (two renders equal) |
| FR-027, SC-018 | gates | — | Build integration, "Gates" |
| SC-001 | gate | — | `pnpm run check:examples; echo $?` → `0`, also `smoke:examples`, `fmt:examples` (quoted) |

### Language and extension (only when a promotion is unblocked)

| FR / SC | Spec | Assertion strategy |
|---|---|---|
| FR-004, SC-010 (AST) | `packages/language/src/validators/__tests__/timeline-review-validator.spec.ts` | `createTestContext()` in `beforeAll`, `setupCSSRegistry()` in `beforeEach`; fixture program with the `<c>` trigger, from `__fixtures__/timeline-review/<c>/`; `getWarnings(…).filter(w => w.data?.code === '<c>')` length 1, range = `baseline/promotion-<c>-before.json`; clean counterpart → 0; E-1: `timelineFindings` with an injected `exists` over `F:\\x\\media\\a.mp4` and `/x/media/a.mp4` shaped paths |
| FR-004a, SC-021 | `…/__tests__/timeline-container-promotion.spec.ts` (own file: CSS validation, AGENTS "Testing") | the three fixtures (unknown id → 1 `unknown_css_id_in_selector`, 0 promoted; `selectorNotInLayout` mode → 1 `selector_not_in_layout`; neither → 1 promoted); the CLI spec runs `check --format json` and `eligian_check` on the same three |
| FR-005, FR-005a, SC-010/SC-012 (config) | `packages/extension/src/language/__tests__/eligius-lint.spec.ts` (extend) | `lintDocument` on the fixture → exactly one `<c>` diagnostic; `Settings.eligiusLint = false` → the `<c>` finding stays, no `eligius-*` finding |
| FR-005b, SC-019 | `packages/extension/src/extension/__tests__/eligius-lint-diagnostics.spec.ts` (extend) | code action for the stored `controller-imbalance` diagnostic → one edit; range (to 1-based) + `newText` toEqual `baseline/promotion-controller-imbalance-before.json` `data.quickFix`; the non-literal-selector fixture → no action |
| FR-003, SC-011 | `codes.spec.ts` (language), `mcp-check.spec.ts`, `mcp-knowledge.spec.ts` (CLI) | `isDiagnosticCode('<c>')`, `DIAGNOSTIC_CODES` entry source, `REVIEW_CODES` excludes. `eligian_check` returns `source: <S>`, and that diagnostic of the structured result decodes with `McpDiagnosticSchema` (`Result.isSuccess(Schema.decodeUnknownResult(McpDiagnosticSchema)(d))`, as `scenario.ts:162` decodes): for a config code, this fails until `'config'` is in `MCP_DIAGNOSTIC_SOURCES`. The generated catalogue contains the line `- <c> · <S> · diagnostic/<c>` (`<S>` = `validator` or `config`). For a config code, the chunk body's source list names `` `config` `` and `overlays.json` has `bySource.config` |
| SC-010 (CLI / MCP, once only) | `check-command.spec.ts`, `mcp-check.spec.ts` | `it('<c> is reported exactly once by check (SC-010)')`, for every promoted code, with the default switches (review and lint on): `eligian check <fixture> --format json` → `diagnostics.filter(d => d.code === '<c>')` has length 1, and its `line` / `column` / `endLine` / `endColumn` equal `baseline/promotion-<c>-before.json`'s. The same count of 1 for `eligian_check({ paths: [fixture] })`. This catches a leftover review path, for example a missing `TIMELINE_REVIEW_CODES` filter in `reviewConfig` (A-A), or `withCompiledChecks` merging both `configReviewFindings` and the old review output (A-B). For a config code it is repeated with `--no-lint --no-review` / `{ lint: false, review: false }` (count still 1). The clean fixture → 0. For `controller-imbalance`'s non-literal-selector fixture (SC-019), the CLI diagnostic has no `data.quickFix`, as in `baseline/promotion-controller-imbalance-nonliteral-before.json` |
| FR-009 (library alone) | `packages/language/src/validators/__tests__/timeline-review-validator.spec.ts` (AST codes); `packages/extension/src/language/__tests__/eligius-lint.spec.ts` (config codes) | `it('a library file validated alone reports no promoted code (FR-009)')`: the mini-spec's library-only fixture parsed and validated on its own (`createTestContext()`, `getWarnings()`) → 0 diagnostics with `data.code` in P_T. `lintDocument` on the same file → 0 findings with a code in P_C |
| FR-006, SC-012 | `check-command.spec.ts`, `mcp-check.spec.ts` | `--no-review` / `review:false` keep the promoted code and drop the other; `--no-lint --no-review` keep a config-based one; lottie fixture copied to `os.tmpdir()` with an assertion that no ancestor has `node_modules/lottie-web` |
| FR-007, SC-013 | `mcp-knowledge.spec.ts`, `mcp-runtime-claims.spec.ts` | section membership; probed count = `baseline/probes-before.txt` |

### Manual / user-run (`compliance.md`)

- **SC-002**: after the user's *Publish CLI* run, the SC-002 `curl | jq` (P5) with the run URL.
- **SC-003**: the user runs `pnpm evals:mcp --arm A1 --arm A0 --runs 3` (case-pinned `claude-sonnet-5-5`, budget enforced by default) and `pnpm evals:mcp --arm A1 --runs 1 --model claude-opus-5-5` (the current Opus-class id). `compliance.md` holds the (a)–(e) table, each value with the `summary.md` line it was read from (`harness.ts:319-324`). Without `evals.md`, rows (a)–(d) say "no baseline".
- **SC-009**: `claude plugin marketplace add <repo path>` → `claude plugin install eligian@eligian` → `claude mcp list` in (1) a folder without `.mcp.json` and (2) an `eligian init` project with the node form, recording whether one or two `eligian` servers appear (P7).

## Build integration

### `packages/cli/package.json`
- `"mcpName": "io.github.rolandzwaga/eligian"`.
- Script `"measure:recycle": "node --expose-gc --import tsx scripts/measure-recycle.ts"`.
- `files` unchanged.
- `exports` unchanged.
- Version stays `1.1.0` (I-4: unpublished; `server.json` and `plugin.json` carry `1.1.0`).

### `packages/cli/esbuild.mjs`
No change. The evals bundle (`:129-133`) picks up `promotion-evidence.ts` through `assert.ts`'s re-export. `server.json` and the plugin are not bundled. `package-bin.spec.ts`'s "imports only declared dependencies" check is unaffected (no new import in `src/` outside the evals bundle).

### Root
- `package.json` script `"evals:mcp:evidence": "tsx evals/mcp/promotion-evidence.ts"`.
- `.github/workflows/publish-cli.yml` (B5).
- `ci.yml` unchanged: its "Soak test" step (`:63-64`) runs the new case. R5 covers the job's 20-minute limit.
- `.claude-plugin/marketplace.json`, `plugins/claude/eligian/**`.

### Docs (G5)
- `packages/cli/README.md`, under "Use with coding agents (`eligian mcp`)" (`:437`):
  - a "From the MCP registry" paragraph (`io.github.rolandzwaga/eligian`, launched as `npx -y eligian@<version> mcp`; the first `npx` start downloads the package, E-10);
  - a "Claude Code plugin" paragraph: the two `/plugin` commands; the launch form `npx -y eligian@^1.1 mcp`, which may differ from the project's own `eligian`; P7's duplicate rule and the `/mcp` toggle; `eligian init` / `eligian agents setup` as the per-project route that pins the project's compiler (FR-021).
- Root `AGENTS.md`:
  - the CLI publishing line gains "then publishes `server.json` to the MCP registry (`mcp-publisher`, GitHub OIDC; `registry_only` re-runs that step alone)" (FR-015);
  - the soak line (`:51`) becomes "2 × N `eligian_check` calls and 2 × N mixed tool calls on the tour (N = `RECYCLE_AFTER`), heap growth at most 25 MB, two recycles each";
  - the plugin is mentioned in one line next to `eligian mcp`.
- `CHANGELOG.md` `## Unreleased` → `### Added`: the registry entry, the Claude Code plugin, recycling tuned to N = <n> (with the measurement file).

### Gates (in order; each output's tail quoted in `compliance.md`)

1. `pnpm build`
2. `pnpm typecheck`
3. `pnpm run ci` (0 errors 0 warnings)
4. `pnpm test`
5. `pnpm -C packages/cli run test:soak` (`Tests 2 passed (2)`)
6. `pnpm effect:check` (`0 errors, 0 warnings and 0 messages` for both projects)
7. `pnpm run check:examples`, `pnpm run smoke:examples`, `pnpm run fmt:examples`
8. `pnpm -C packages/cli run test:coverage:ci` and `pnpm -C packages/language run test:coverage:ci` (thresholds; the language run proves no regression even with no language change)
9. `mcp-publisher validate` (SC-005), `claude plugin validate … --strict` ×2 (SC-007)
10. When a promotion runs, also: `pnpm -C packages/extension test`; the gate list of GP.

## Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Concurrency on the Langium singleton** in the measurement and the soak, and **leftover state between measurement rows** | Calls are strictly sequential (`await` per call) through the in-process server and the production `makeCompilerLock` (via `compilerLockLayer`, which only adds hooks). `checkFiles` is never called directly (E-2). Sections are counted by `onAcquire` and asserted = calls. The rows are isolated: each row, and the fmt-only run, runs in its own child process on a fresh project copy (P19, D2 step 4). Closing a server resets neither `sharedServices` nor the formatter's set, so in one process the `never` row's documents would be freed by row 25's first recycle. The measurement file's header states the isolation. |
| R2 | **jsdom globals** | No smoke in the mix (FR-022's M has no `eligian_smoke`), so jsdom is never installed in the measuring process. The smoke tool would spawn a child anyway (§2). |
| R3 | **Stdout pollution** | Nothing new writes to the MCP server's stdout: `server.json`, the plugin and the workflow are outside the process, and the script writes its file via `--out` (P13). The registry spec reads the spawned stdout as frames only, and the negative control asserts it is empty. A promoted validator never logs (E-3). |
| R4 | **Startup time** | No new import in `main.ts` or `mcp/`. `package-bin.spec.ts:148`'s "< 3 s" stays green. The plugin and registry `npx` cold start is documented (E-10), not measured. |
| R5 | **Soak duration in CI** (`ci.yml` job `timeout-minutes: 20`) | Case 2 runs 2N tour calls. D3's run records its wall time. If it exceeds 5 min on Windows, the mixed case switches to the one-program reference solution `__fixtures__/mcp-solutions/three-chapters/main.eligian` (layout, CSS, locales; FR-024 allows "another one-program fixture named in the plan"), and `compliance.md` records the switch. |
| R6 | **`mcp-publisher validate` needs network** (P4) | CI has network. Local SC-005 is run once in G1 and quoted. An offline failure is "network", not a spec failure, and is re-run. |
| R7 | **Registry publish fails after npm publish** | Bounded retry (180 s), then the job fails, and the `release` job does not run (`needs: publish`). The `registry_only` input re-runs the registry steps alone (FR-013d). The registry never runs ahead of npm (P6). |
| R8 | **OIDC namespace** `io.github.rolandzwaga` [UNVERIFIED until the first publish] | `login github-oidc` grants `io.github.<repo owner>/*`, and the repo owner is `rolandzwaga` (`package.json` repository URL). If the first run says otherwise, `mcpName`, `server.json.name` and the specs change together (SC-004 keeps them equal). |
| R9 | **Windows paths** | Plugin, registry and marketplace files are POSIX-relative and contain no absolute paths. Specs build paths with `path.join` and compare POSIX-relative listings. Promoted validators use `uri.fsPath` with injected-`exists` tests for both shapes (E-1). |
| R10 | **Coverage thresholds** | New `src` code is `promotion-evidence.ts` (fully unit-tested), plus `compiler-lock.ts`'s export (covered by the existing lock spec). Test helpers are excluded (`vitest.config.ts:55`). Language: untouched outside GP, and in GP each validator has its own spec, with `test:coverage:ci` in GP's gate. |
| R11 | **Stale `dist` under tsx/Vitest** (P11) | `pnpm build` precedes D3 and the G4 evidence run, and the script headers say so. |
| R12 | **Plugin version drift** (Claude Code keeps users on the manifest `version`) | `plugins.spec.ts` pins `plugin.json.version === packages/cli/package.json.version`, so a CLI bump without the plugin fails CI. |
| R13 | **Duplicate eligian servers** (P7) | README rule plus SC-009 observation. The project definition wins on an npx-form match. |
| R14 | **Promotions never unblock** (no full eval runs) | FR-001b: they stay PARTIAL ("blocked: awaiting Phase 3 evals"), and the registry, plugin and recycling tracks complete independently. |

## Complexity tracking

None.

## Open questions (left to the user)

- None block the build. Two outcomes are recorded when they happen: the OIDC namespace on the first publish (R8), and what `claude mcp list` shows with the plugin plus a node-form project server (SC-009, P7).

## Review notes

No review issue was rejected. Two were resolved by choosing one of the offered alternatives, for these reasons:
- **Packed `mcpName` (FR-010, SC-017).** This is resolved by correction P21, not by a `cli-bin` test that runs `pnpm pack`. pnpm 12.14's `pack` has no `--ignore-scripts`, so a spec would run `prepack` = `build:prod`, which rewrites `dist/` under the other `cli-bin` tests. `npm pack --ignore-scripts` does not produce the manifest that gets published. The check is not weakened. It runs on the exact published artifact, before `npm publish`, and a spec now guards that the check line stays in the workflow.
- **`measure-heap.ts` reuse (D2).** This is resolved by sharing its parts (the D1b `heapAfterGc`, the same server and lock setup, the same gc check), not by adding modes to it. D2 says why: it is a multi-process parent with a different CLI and output, the Phase 3 baseline of `measure-heap.ts` must stay comparable, and FR-022 names `measure-recycle.ts`.

The two duplicate issues (`configReviewFindings` without `program`, and the `measure-heap.ts` duplication) are each resolved once, by P22 and D2.
