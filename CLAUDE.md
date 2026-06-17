# CLAUDE.md

@AGENTS.md

Claude Code-specific guidance. **Shared, tool-agnostic rules live in [AGENTS.md](AGENTS.md)** (imported above) — project overview, Windows path rule, import bans, tooling, commands, task-completion checklist, conventions, architecture, DSL features, testing. This file adds only what is specific to Claude Code (Serena/MCP, memory).

> Reminder: the Windows path rule in AGENTS.md applies to Serena tools too — use Windows backslash paths, expand `~`.

## Code Navigation & Editing: Prefer Serena (MCP)

Serena MCP (LSP-backed code intelligence) is configured. For **code files**, prefer Serena over `grep`/`Read`/`Edit` — token-efficient and structure-aware. Detailed file/symbol inventories are intentionally NOT duplicated in docs; discover them with Serena.

- **Session start (once):** if `get_current_config` shows no active project, `activate_project` for `F:\projects\eligius\eligian`; then `initial_instructions`. Serena line numbers are **0-based**.
- **Discovery:** `get_symbols_overview`, `find_symbol` (`include_body` only when needed), `find_referencing_symbols`, `get_diagnostics_for_file`. Use `Grep`/`Glob` only for existence checks, counts, or non-code/plain-text files.
- **Edits:** `replace_symbol_body`, `insert_after_symbol`/`insert_before_symbol`, `rename_symbol`, `replace_content` (regex/literal) — prefer over built-in `Edit` for code.
- **Limit:** `replace_content` uses Python `re` (no balanced/recursive matching). For paren/brace-balancing transforms use an AST codemod, not regex. Markdown/docs aren't code symbols — built-in `Edit` is fine there.
- Project memories: `list_memories` / `read_memory`. Serena data is in `.serena/` (gitignored).

## MCP

- **context7** — fetch up-to-date library/API docs (use proactively for any library question, incl. Effect-ts).
- **serena** — code intelligence + project memories (see Serena section above).
