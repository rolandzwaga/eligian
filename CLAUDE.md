# CLAUDE.md

@AGENTS.md

Claude Code-specific guidance. **Shared, tool-agnostic rules live in [AGENTS.md](AGENTS.md)** (imported above) — project overview, Windows path rule, import bans, tooling, commands, task-completion checklist, conventions, architecture, DSL features, testing. This file adds only what is specific to Claude Code (typegraph-mcp, other MCP servers).

> Reminder: the Windows path rule in AGENTS.md applies to MCP tools too — use Windows backslash paths, expand `~`.

## Code Navigation & Editing

- **Queries:** use the typegraph-mcp `ts_*` tools for TypeScript navigation (definitions, references, blast radius, type info, Effect diagnostics) before `grep`/`Read`. Rules live in AGENTS.md ("TypeScript Navigation"); skills in `.claude/skills/`. Detailed file/symbol inventories are intentionally NOT duplicated in docs; discover them with `ts_navigate_to` / `ts_document_symbols`.
- **Edits:** built-in `Edit` (string match). For cross-file renames, use `ts_references` to find every site, then `Edit` each one. For paren/brace-balancing transforms use an AST codemod, not regex.
- Use `Grep`/`Glob` for existence checks, counts, and non-TypeScript files (grammar, docs, config, fixtures).

## Hooks (`.claude/hooks/`, wired in `.claude/settings.json`)

- `guard-ci-gates.cjs` (PreToolUse, Bash | PowerShell): before `git commit`, runs the steps of `.github/workflows/ci.yml` (read from the file, not copied) on the working tree and blocks on the first failure. Skips commits that touch only `specs/`, root-level Markdown or `.claude/`. The soak test and the packed-tarball step are skipped, and the coverage step is replaced by `vitest related` on the changed files, so a code commit takes about 1.5 min. A new `ci.yml` step blocks every commit until it gets a policy in `STEP_POLICY`. Test it: `echo '{"tool_input":{"command":"git commit -m x"}}' | node .claude/hooks/guard-ci-gates.cjs`.
- `block-powershell-syntax.cjs`: Bash only, no PowerShell here-strings.

## MCP

- **context7** — fetch up-to-date library/API docs (use proactively for any library question, incl. Effect-ts).
- **typegraph-mcp** — TS7/tsgo semantic `ts_*` tools. Registered in `.mcp.json`. Verify with `pnpm exec typegraph-mcp check --project-root .`.
