# Testing the Eligian MCP server: your manual checks

Everything automated has passed on Windows. What's left is the work a build agent can't do: a real
editor, a real browser, `claude -p` eval runs, and publishing. This file lists it **in the order
it has to happen**. Later parts depend on earlier ones.

| Part | What | Your time | Wall clock |
|---|---|---|---|
| 0 | Prepare the build | 5 min | 10 min |
| 1 | Try it by hand in Claude Code (optional, recommended) | 15 min | 15 min |
| 2 | Phase 4: VS Code, browser, Cursor | 45 min | 45 min |
| 3 | Phase 3: the two full eval runs | 20 min | **1–2 days** (runs unattended) |
| 4 | Phase 5: promotions, eval re-run, publish, plugin | 30 min | half a day + the merge |

After each part, paste the outputs to Claude in the eligian session. Claude writes them into the
phase's `compliance.md` and resumes the phase workflow.

Branch: `feat/mcp-server-roadmap`. Run all commands from the repo root in Git Bash unless a step
says otherwise.

---

## Part 0: Prepare the build (5 min)

- [ ] 1. `git checkout feat/mcp-server-roadmap`
- [ ] 2. `pnpm install && pnpm build`
- [ ] 3. `pnpm -C packages/cli pack`. This writes `packages/cli/eligian-1.1.0.tgz`.
- [ ] 4. `pnpm -C packages/extension run package`. This writes the `.vsix` in `packages/extension/`.
- [ ] 5. `node packages/cli/bin/cli.js --version` should print `1.1.0`.

---

## Part 1: Try it by hand in Claude Code (15 min, optional)

This isn't a formal check. It's the fastest way to see whether the server feels right before the
long runs.

- [ ] 1. Make a scratch project: `node packages/cli/bin/cli.js init F:/tmp/mcp-try --template blank`
- [ ] 2. `cd F:/tmp/mcp-try && npm install F:/projects/eligius/eligian/packages/cli/eligian-1.1.0.tgz`
- [ ] 3. Check that `init` wrote `.mcp.json`, `AGENTS.md` and `CLAUDE.md`
- [ ] 4. Start `claude` in that folder, then run `/mcp`. `eligian` should show as connected with 8 tools.
- [ ] 5. Give it a real task, for example: *"Make a 30-second presentation with three slides that
      fade in, and a button that jumps to slide 2."*
- [ ] 6. Watch which tools it calls. It should mostly use `eligian_docs`, `eligian_check` and
      `eligian_smoke`, and finish on a clean `eligian_check`.
- [ ] 7. Run `npx eligian dev main.eligian --open` and check that it plays.

To poke the tools without an agent, open the MCP Inspector:
`npx @modelcontextprotocol/inspector node F:/projects/eligius/eligian/packages/cli/bin/cli.js mcp`.
It downloads the inspector from npm.

**Note for Claude:** anything odd you see. That's input, not a pass or fail.

---

## Part 2: Phase 4 manual checks (45 min), task T046

### 2a. VS Code registers the server: SC-001 (15 min)

- [ ] 1. `node packages/cli/bin/cli.js init F:/tmp/mcp-vscode --template blank --no-agents`
- [ ] 2. Make sure `F:/tmp/mcp-vscode/node_modules/eligian` does **not** exist.
- [ ] 3. Install the `.vsix` from Part 0: *Extensions → … → Install from VSIX*. VS Code must be 1.140 or newer.
- [ ] 4. Open `F:/tmp/mcp-vscode` in a **new window**. Trust the folder and **don't open any file**.
- [ ] 5. *Developer: Show Running Extensions*: Eligian is listed as active.
- [ ] 6. In the integrated terminal: `npm install F:/projects/eligius/eligian/packages/cli/eligian-1.1.0.tgz`
- [ ] 7. *MCP: List Servers*: `Eligian` is running, **without reloading the window**.
- [ ] 8. Open Copilot Chat in **Agent** mode, then the tool picker. Exactly 8 `eligian_*` tools
      are listed.

**Note for Claude:** the VS Code version (*Help → About*) and the 8 tool names.

### 2b. The setting turns it off: SC-002 (2 min)

- [ ] 1. Settings: `eligian.mcp.enabled` = off
- [ ] 2. *MCP: List Servers*: `Eligian` is gone
- [ ] 3. Turn the setting back on

### 2c. No duplicates with a manual config: SC-003 (5 min)

- [ ] 1. In that folder: `npx eligian agents setup --client vscode`. This writes `.vscode/mcp.json`.
- [ ] 2. Tool picker: each `eligian_*` tool is listed **once**, not twice.
- [ ] 3. Set `eligian.mcp.enabled` = off. The tools are **still** listed, now from the file.

### 2d. `eligian dev` reports runtime errors within 2 s: SC-004 (3) (10 min)

- [ ] 1. `cp -r packages/cli/src/__tests__/__fixtures__/dev-runtime-error F:/tmp/dev-err`
- [ ] 2. `node packages/cli/bin/cli.js dev F:/tmp/dev-err/main.eligian --open`
- [ ] 3. Check that the terminal prints a runtime-error line pointing into `main.eligian`.
- [ ] 4. In the browser devtools console, run `performance.timeOrigin`.
- [ ] 5. Open `F:/tmp/dev-err/.eligian/dev-errors.json` and copy its `updated` value.
- [ ] 6. In the console, run `Date.parse("<updated>") - performance.timeOrigin`. It must be ≤ 2000.

**Note for Claude:** the terminal line, the `updated` value, `timeOrigin` and the difference.

**Extra check, a fix made after the build:** with the page open, edit `styles.css` and save. The
page swaps the CSS without reloading. Refresh the page and trigger the error again. The terminal
still points into `main.eligian`, not `(no source location)`.

### 2e. Cursor: SC-007 (10 min, only if Cursor is installed)

- [ ] 1. In a project: `npx eligian agents setup --client cursor`
- [ ] 2. Open the project in Cursor. The `eligian` server is listed under MCP.
- [ ] 3. Ask the agent: *"call eligian_project with path `.`"*

**Note for Claude:** the working directory the result reports. If you don't have Cursor, say so; that row
stays PARTIAL.

**Then:** tell Claude *"Phase 4 checks done"* and paste the notes. Claude records them and
resumes the build with `retry_tasks: ["T046"]`.

---

## Part 3: Phase 3 eval runs (20 min of your time, 1–2 days unattended)

> ⚠️ These runs use **your Claude subscription quota**, the same quota the iterum session uses.
> 14 cases × 2 arms × 3 runs = 84 agent runs, and each can take up to 30 min (the timeout).
> Run them when iterum is idle, preferably overnight. If you hit the limit, re-run only the
> missing cases with `--case <id>`.

### 3a. Run 1, budgets off (T067)

- [ ] 1. `pnpm -C packages/cli build`. The harness loads `dist/evals/assert.mjs`, so a stale build breaks it.
- [ ] 2. `pnpm evals:mcp --arm A0 --arm A1 --runs 3 --call-budget off`
- [ ] 3. `pnpm evals:mcp --arm A-none --runs 1 --call-budget off`
- [ ] 4. Results land in `evals/mcp/results/<run-id>/`. Open `summary.md` for each run.

Arms: **A1** = with the MCP server, **A0** = the CLI and docs only, no MCP, **A-none** = no Eligian help at all.
The case files pin the model (Sonnet 5.5).

**Note for Claude:** the run ids.

### 3b. Claude's part: triage and budgets (T068, T069)

Tell Claude *"run 1 done, ids …"*. Claude triages every failing A1 run, fixes curriculum, tool or
compiler gaps, and writes the call budgets (`pnpm evals:mcp --write-budgets <run-id>`).
No action from you except approving the commits.

### 3c. Run 2, budgets enforced (T070)

- [ ] 1. `pnpm -C packages/cli build`
- [ ] 2. `pnpm evals:mcp --arm A0 --arm A1 --runs 3 --call-budget enforce`
- [ ] 3. `pnpm evals:mcp --arm A1 --runs 1 --model claude-opus-5-5`

**Then:** tell Claude *"run 2 done, ids …"*. Claude writes `specs/058-mcp-server/evals.md`
(T072) and updates the Phase 3 status line only if SC-001 to SC-003 hold.

The success test from the roadmap: A1 must beat A0 clearly. If A0 does as well as A1, the
MCP server isn't earning its keep. That gets recorded honestly, not fixed by loosening the cases.

---

## Part 4: Phase 5 (30 min of your time + a merge)

### 4a. Claude: the check promotions (Group 10, T032 to T043)

These need the run ids from `evals.md` (Part 3). Tell Claude *"resume Phase 5 promotions"*.
Claude runs `pnpm evals:mcp:evidence -- --runs <ids>` and promotes the review checks the data
supports. No action from you.

### 4b. Eval re-run, no regression (T045, a few hours unattended, same quota warning)

After 4a:

- [ ] 1. `pnpm -C packages/cli build`
- [ ] 2. `pnpm evals:mcp --arm A1 --arm A0 --runs 3`
- [ ] 3. `pnpm evals:mcp --arm A1 --runs 1 --model claude-opus-5-5`

**Note for Claude:** the run ids. Claude compares them with Phase 3 (5% tolerance).

### 4c. Publish to npm and the MCP registry (T044, needs `main`)

This is the one step that changes things outside your machine, so it's yours:

- [ ] 1. Merge `feat/mcp-server-roadmap` into `main` (PR or locally; your call). CI runs the Linux
      halves of the remaining checks on that PR.
- [ ] 2. GitHub → Actions → **Publish CLI** → *Run workflow* on `main`. This publishes
      `eligian@1.1.0` to npm and `server.json` to the MCP registry.
- [ ] 3. If npm succeeded but the registry step failed, run it again with **`registry_only`** ticked.
- [ ] 4. Check the registry (should print `true`):

```bash
V=1.1.0; curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.rolandzwaga/eligian" \
  | jq --arg v "$V" '[.servers[] | select(.server.name == "io.github.rolandzwaga/eligian" and .server.version == $v)]
    | length == 1 and (.[0].server.packages[0].identifier == "eligian")
    and (.[0].server.packages[0].packageArguments[0].value == "mcp")'
```

**Note for Claude:** the workflow run URL, the `jq` output, and the namespace the
`mcp-publisher` login printed in the workflow log.

### 4d. The Claude Code plugin (T046, 10 min, after 4c)

The plugin starts `npx -y eligian@^1.1 mcp`, so it only works once 1.1.0 is on npm (4c).

- [ ] 1. `claude plugin marketplace add F:/projects/eligius/eligian`
- [ ] 2. `claude plugin install eligian@eligian`
- [ ] 3. In an empty folder with **no** `.mcp.json`: `claude mcp list` shows `eligian` connected; `/mcp` shows 8 tools.
- [ ] 4. In an `eligian init` project (which has its own `.mcp.json`): `claude mcp list`. Note whether you see one `eligian` server or two.

**Note for Claude:** both outputs. If step 4 differs from the README, Claude corrects the README.

---

## When everything is in

Claude marks Phases 3, 4 and 5 ✅ in `roadmap.md` once each `compliance.md` table is fully green.
