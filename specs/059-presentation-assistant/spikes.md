# Spikes for the presentation assistant (spec 059)

Audience: whoever writes the Phase 1 to 3 specs from `roadmap.md`. These spikes settle the four claims the roadmap marked **[UNVERIFIED]**. Run on 2026-11-19 on Windows 11 with Claude Code 2.1.325, `effect` 4.1.4 and Node 24.7.

Sources are in `spikes\`:

- `brief-spike-server.ts`: a stdio MCP server on `effect/ai` with two tools. `spike_info` reports the server's working directory, the client's capabilities and the roots it announces. `spike_confirm` sends one elicitation (a single checkbox) and reports the outcome.
- `elicitation-hook.cjs`: a Claude Code `Elicitation` hook that accepts that elicitation.

"Measured" below means the spike server ran under the client and logged the result. "Documented" means the client's documentation says so and no test was run.

## Summary

| # | Claim | Result |
| --- | --- | --- |
| 1 | Clients support elicitation, so the server can ask the user for the sign-off directly | Yes, all four. Claude Code: capability measured, dialog documented. Cursor, VS Code and Codex: documented, with limits (§1.3) |
| 2 | The baseline can be taken before the agent's first action | Yes for the working directory, which is the project in every supported launch form. No early hook exists for a root outside it; the fallback stays |
| 3 | A Claude Code plugin can ship hooks | Yes (documented): `hooks/hooks.json` at the plugin root |
| 4 | `claude -p` can run an interview turn by turn, and elicitation is declined there | Turn by turn: yes (measured). Elicitation is cancelled, not declined, unless an `Elicitation` hook answers it (measured) |

Two results change the roadmap's design; they are in §5.

## 1. Elicitation

### 1.1 Claude Code announces it (measured)

In `claude -p`, the client's `initialize` capabilities were:

```json
{ "roots": { "listChanged": true }, "elicitation": { "form": {}, "url": {} } }
```

So `McpServer.clientCapabilities` reports form elicitation, and the server's capability check (`clientCapabilities.elicitation !== undefined`) is true for Claude Code.

### 1.2 The dialog (documented, not measured)

`code.claude.com/docs/en/mcp` ("Respond to MCP elicitation requests"): in an interactive session Claude Code shows a dialog with the form fields the server defined, and passes the response back. Which field types the dialog renders is not documented.

**Still to do by hand:** one interactive run. Add the spike server to a project (`claude mcp add spike -- node <repo>\packages\cli\node_modules\tsx\dist\cli.mjs <repo>\specs\059-presentation-assistant\spikes\brief-spike-server.ts`), ask Claude Code to call `spike_confirm`, and note what the dialog shows for a boolean field and what Decline returns.

### 1.3 Other clients

From each client's own documentation and changelog (not measured):

| Client | Form elicitation | Since | Limits |
| --- | --- | --- | --- |
| Cursor | yes | 1.5 (2025-08-21) | A form in the agent chat with Submit and Cancel. Field types are not documented. A forum thread reports the dialog not appearing on Windows (3.10.20), with no confirmed fix as of 2026-08 |
| VS Code Copilot agent mode | yes, form and URL | form: 1.102 (2025-07-09) | "Requests are canceled in Autopilot and declined when there is no active turn." Since 1.112 the form uses the Ask Questions UI |
| Codex CLI | yes, partly | custom servers: 0.119.0 (2026-04-10) | String, boolean and single-select enum fields are rendered. A form with a number or a multi-select enum falls back to a bare accept or decline (read from the source, not documented). Auto-rejected under some approval policies (`approval_policy.granular.mcp_elicitations`) |

Sources: `cursor.com/changelog/1-5` and `cursor.com/docs/context/mcp`; `code.visualstudio.com/updates/v1_102` and `code.visualstudio.com/api/extension-guides/ai/mcp`; `github.com/openai/codex` releases 0.64.0 and 0.119.0 and `codex-rs/tui/src/bottom_pane/mcp_server_elicitation.rs`. The MCP site's client feature matrix was removed on 2026-05-27; its last version listed Elicitation for all three.

Not checked: `codex exec` (non-interactive) and Cursor's CLI.

**Consequences.** The sign-off forms use only boolean and string fields. Every elicitation gets a time limit, because a dialog that never shows would otherwise hang the tool call. Cancelled and declined are different answers (§5).

## 2. The baseline

The roadmap's gate treats the `.eligian` files that exist when the server starts as existing work (roadmap §4.2). That needs the scan to happen before the agent can write anything.

Measured under Claude Code (`claude -p`, launched in `F:\tmp\spike-proj`):

- The server process starts with the session, before the agent's first step: the first tool call arrived 7.6 s after the process started.
- The server's working directory is the directory Claude Code was started in.
- The first announced root is that same directory. Further roots follow it (the user's additional working directories), so "the first root" is the project and the others must not be scanned.

From the code:

- `effect` 4.1.4 has no public hook for the client's `initialized` notification. `McpServer` exports `middleware`, but "Middleware never runs for `initialize`", and it runs for list requests only when it wraps a `visibility`. The roots can be asked only inside a request (`McpServerClient`).
- The agent files that `eligian init` writes launch the server as `node node_modules/eligian/bin/cli.js mcp`, a relative path. That form only starts when the working directory is the project root, so in every setup `eligian init` produces, the working directory is the project.

**Conclusion.** Scan the working directory at process start. When the first tool call shows an announced root outside the working directory, scan that root then. The gap that remains is a client that starts the server elsewhere (the `npx` form with another working directory) combined with an agent that writes a program before its first `eligian_*` call. Claude Code is not such a client.

## 3. Plugin hooks (documented)

`code.claude.com/docs/en/plugins/components` (Hooks):

- A plugin ships hooks in `hooks/hooks.json` at the plugin root, under a top-level `"hooks"` key, in the same shape as the `hooks` object of `settings.json`. A `hooks` key in `plugin.json` also works.
- A hook process gets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` in its environment.
- No approval step for a plugin's hooks is documented beyond trusting the plugin at install.

The documented example is a `PostToolUse` hook; a `PreToolUse` hook follows from "the same shape as `settings.json`". The hook for this spec:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "npx", "args": ["eligian", "brief", "gate"] }]
      }
    ]
  }
}
```

Not tested by installing a plugin; the first task of Phase 3 does that.

## 4. Headless runs

### 4.1 Turn by turn (measured)

```bash
claude -p "<first message>" --output-format json > run1.json   # a JSON array; the last entry has session_id
claude -p "<next message>" --resume <session_id> --output-format json
```

The second call answered from the first call's context (it repeated a value from a tool result of the first turn) and reported the same `session_id`. So the interview eval can alternate: the agent's turn, then the simulated user's reply as the next `--resume` call.

Documented alternatives: `--session-id <uuid>` to choose the id up front, and `--input-format stream-json` for one long-running process (its input line format is not documented for the CLI).

Each call starts the MCP server again: the spike server logged a new process per call. The server's in-memory state does not survive a turn in this mode.

### 4.2 Elicitation in a headless run (measured)

- With no hook: the elicitation is **cancelled** 12 ms after it was sent. In `effect`, a cancelled elicitation interrupts the calling effect; it is not an `ElicitationDeclined` failure.
- With an `Elicitation` hook in the project's `.claude\settings.json`: the hook ran in `claude -p`, received the server name, the message and the requested schema, and its answer reached the server: `accepted: {"confirmed":true}`.

The hook's input:

```json
{
  "hook_event_name": "Elicitation",
  "mcp_server_name": "spike",
  "message": "Spike: is this brief complete and correct? (12 answers, 2 delegated)",
  "mode": "form",
  "requested_schema": { "type": "object", "properties": { "confirmed": { "type": "boolean" } }, "required": ["confirmed"] }
}
```

Its answer: `{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"accept","content":{"confirmed":true}}}`.

## 5. What changes in the roadmap

1. **The baseline cannot live only in memory.** In a turn-by-turn headless run the server restarts on every turn, so a program the agent wrote in turn 3 would be "existing work" in turn 4. The same holds for any client that restarts the server, and for every new session. Decided on 2026-11-19: the server records the known programs in the project (`.eligian\programs.json`). The first run in a project records what exists; after that a program becomes known only through an approved brief or through the user accepting it (roadmap §4.2, decision 12).
2. **The evals need no test seam.** The harness plays the user at both sign-offs with an `Elicitation` hook in the eval project's settings, the documented way to answer an elicitation without a person. `ELIGIAN_BRIEF_APPROVER=harness` is dropped (roadmap §7.1, updated).
3. **A cancelled elicitation is a third outcome.** Accepted, declined and cancelled must be told apart: a cancel (no one there to ask) falls back to the agent-reported confirmation; a decline (the user said no) does not.
4. **An `Elicitation` hook can also answer for the user in a normal session.** A hook in the project's settings would approve every brief unseen. That is the user's configuration to make, but an agent could write such a hook. The Claude Code plugin hook of roadmap §6.3 therefore also refuses writes to `.claude\settings.json` that add an `Elicitation` hook (roadmap §9, risk added).
