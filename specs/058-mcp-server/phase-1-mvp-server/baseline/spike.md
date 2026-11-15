# T008: Day-1 spike (FR-002a, SC-024)

Date: 2026-11-04 (all runs between 21:52Z and 22:00Z). Tree: `448cd8b` + the uncommitted Phase 1 work (T001–T007).
Environment: Windows 11, Node v24.7.0, `effect` 4.0.7, `@modelcontextprotocol/inspector` 2.13.0, Claude Code 2.1.302 (`claude --version`).

Server: `packages/cli/src/mcp/spike.ts` (throwaway, removed by T009), started by `eligian mcp-spike`
(`packages/cli/src/main.ts`, before the default `compile` command). It builds the server after `await import('effect/ai')`:
`McpServer.toolkit(Toolkit.make(spike_big, spike_upfront))` with `Layer.provide(handlers)`, `Layer.provide(McpServer.layerStdio({ name: 'eligian-spike', version, instructions: 'spike instructions', protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18] }))`, `Layer.provide(layerNodeStdio(redirectConsoleToStderr()))`, `Layer.provide(stderrLoggerLayer)` (T007's `stdio.ts`), run by `Layer.launch`.

- `spike_big`: `.annotate(Tool.Meta, { 'anthropic/maxResultSizeChars': 200000 })`, no parameters, returns `{ header, text }` where `text` is 600 lines of 100 chars (`000000---…\n` … `000599---…\n`) = 60,000 chars.
- `spike_upfront`: `.annotate(Tool.Meta, { 'anthropic/alwaysLoad': true }).annotate(Tool.Readonly, true)`, parameters `{ ids: Schema.Array(Schema.String).check(Schema.isMaxLength(6)) }`, declared `failure: Schema.Struct({ header, message })` (returned when `ids` holds `"fail"`). The handler reads `Effect.serviceOption(McpSchema.McpServerClient)`; when `Some`, `Effect.scoped(getClient → listRoots(…))` with a 2 s `Effect.timeoutOption`, and returns what it found.

Build: `pnpm -C packages/cli build` → `Build succeeded`. `pnpm exec tsc --noEmit -p packages/cli/tsconfig.json` clean; `pnpm effect:check:cli` → `0 errors, 0 warnings and 0 messages.`; `dist/cli.mjs`: 0 × `from "effect/ai"`, 1 × `import("effect/ai")`.

Throwaway helper scripts (scratchpad, not committed): `tee.mjs` (spawns `node packages/cli/bin/cli.js mcp-spike`, forwards stdin/stdout, logs every line with `C->S` / `S->C` to `$TEE_LOG`), `tee-fix-roots.mjs` (the same, but deletes `"params":null,` from the server's `roots/list` request), `raw-client.mjs` (NDJSON client: `initialize` with `capabilities.roots`, answers `roots/list` with one root, four `tools/call`s, then `stdin.end()` and reports the exit).

---

## 1. Inspector `tools/list` (S2, S3)

S3, the 2.13.0 CLI syntax (from `mcp-inspector --cli --help`): mode flag first, then app options, then the target command. The working command lines:

```
cd packages/cli
pnpm exec mcp-inspector --cli --method tools/list --format json node bin/cli.js mcp-spike
pnpm exec mcp-inspector --cli --method tools/call --tool-name spike_upfront --tool-args-json '{"ids":["a"]}' --format json node bin/cli.js mcp-spike
```

(From the repo root: `pnpm -C packages/cli exec mcp-inspector --cli --method tools/list --format json node bin/cli.js mcp-spike`; `pnpm -C` sets the cwd to `packages/cli`, so the target path is relative to it. Environment for the server: `-e KEY=VALUE`.) Both exit 0. `--format json` prints one JSON object on stdout, no banners; the server's stderr is passed through to stderr.

`tools/list` output (2026-11-04T21:57:16Z, exit 0), pretty-printed with `JSON.stringify(…, null, 2)`, otherwise verbatim:

```json
{
  "result": {
    "tools": [
      {
        "name": "spike_big",
        "description": "Spike: returns a 60,000-char text.",
        "inputSchema": {
          "type": "object",
          "additionalProperties": false
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "header": {
              "type": "string"
            },
            "text": {
              "type": "string"
            }
          },
          "required": [
            "header",
            "text"
          ],
          "additionalProperties": true
        },
        "annotations": {
          "readOnlyHint": false,
          "destructiveHint": true,
          "idempotentHint": false,
          "openWorldHint": true
        },
        "_meta": {
          "anthropic/maxResultSizeChars": 200000
        }
      },
      {
        "name": "spike_upfront",
        "description": "Spike: reports whether McpServerClient is present and the client roots. Pass \"fail\" in ids for a declared failure.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "ids": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 6
            }
          },
          "required": [
            "ids"
          ],
          "additionalProperties": true
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "header": {
              "type": "string"
            },
            "text": {
              "type": "string"
            }
          },
          "required": [
            "header",
            "text"
          ],
          "additionalProperties": true
        },
        "annotations": {
          "readOnlyHint": true,
          "destructiveHint": true,
          "idempotentHint": false,
          "openWorldHint": true
        },
        "_meta": {
          "anthropic/alwaysLoad": true
        }
      }
    ]
  }
}
```

stderr of that run: `spike: stdin end` / `spike: Layer.launch ended: Failure, interrupts only: true`.

- Both `_meta` objects verbatim: **yes** (`{"anthropic/maxResultSizeChars":200000}`, `{"anthropic/alwaysLoad":true}`).
- `annotations.readOnlyHint: true` on `spike_upfront`: **yes**.
- S2, `inputSchema.properties.ids.maxItems === 6`: **yes**.
- Noted for the tool tasks: `Tool.Readonly` alone leaves `destructiveHint: true` and `openWorldHint: true` (the `Tool.Destructive` / `Tool.OpenWorld` defaults, `McpServer.js` registration code); a read-only tool that should not look destructive must also `.annotate(Tool.Destructive, false)`. A `Schema.Struct` parameter schema is advertised with `additionalProperties: true` (non-strict decode, extra keys ignored); `Tool.EmptyParams` gives `additionalProperties: false`.

## 2. Claude Code connection

```
$ claude mcp add eligian-spike -- node 'F:\projects\eligius\eligian\packages\cli\bin\cli.js' mcp-spike
Added stdio MCP server eligian-spike with command: node F:\projects\eligius\eligian\packages\cli\bin\cli.js mcp-spike to local config
File modified: C:\Users\scab\.claude.json [project: F:\projects\eligius\eligian]
exit 0

$ claude mcp list            (the eligian-spike line)
eligian-spike: node F:\projects\eligius\eligian\packages\cli\bin\cli.js mcp-spike - ✔ Connected

$ claude mcp get eligian-spike
eligian-spike:
  Scope: Local config (private to you in this project)
  Status: ✔ Connected
  Type: stdio
  Command: node
  Args: F:\projects\eligius\eligian\packages\cli\bin\cli.js mcp-spike

$ claude mcp remove eligian-spike -s local
Removed MCP server eligian-spike from local config
File modified: C:\Users\scab\.claude.json [project: F:\projects\eligius\eligian]
exit 0
$ claude mcp get eligian-spike
No MCP server named "eligian-spike". …
```

Connected: **yes**. Removed afterwards: **yes**.

## 3. Claude Code `claude -p` session (upfront loading, instructions, 60,000 chars inline, output format)

`$SCRATCH/cc/mcp.json`:
```json
{ "mcpServers": { "eligian-spike": { "command": "node", "args": ["$SCRATCH/tee.mjs"], "env": { "TEE_LOG": "$SCRATCH/tee-claude.log" } } } }
```

Run (2026-11-04T21:54:18Z, cwd `$SCRATCH/cc`, exit 0, 20 events):
```
claude -p 'Call the MCP tool spike_upfront with ids ["a"], then call the MCP tool spike_big. Then reply with: the header of each result, how many lines the text of spike_big has, and its last non-empty line verbatim. Use no other tools.' --mcp-config $SCRATCH/cc/mcp.json --strict-mcp-config --allowedTools mcp__eligian-spike__spike_upfront mcp__eligian-spike__spike_big --output-format stream-json --verbose
```

**The init event** (`{"type":"system","subtype":"init",…}`; fields reduced to the relevant ones, values verbatim). The field that lists the tools is **`tools`** (fully qualified names `mcp__<server>__<tool>`), the connection is **`mcp_servers`**. No field of the init event (or of any event) carries the server instructions.
```json
{"type":"system","subtype":"init","tools":["Task","Artifact","ArtifactComments","ArtifactData","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Glob","Grep","ListAgents","Monitor","NotebookEdit","PowerShell","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskStop","ToolSearch","WebSearch","Workflow","Write","mcp__eligian-spike__spike_big","mcp__eligian-spike__spike_upfront"],"mcp_servers":[{"name":"eligian-spike","status":"connected","source":"dynamic"}],"model":"claude-opus-5-5","claude_code_version":"2.1.302"}
```
The `tools` list names both tools whether deferred or not, so it does not by itself show which were loaded upfront. The tool calls do:

```
{"type":"assistant","tool_use":{"name":"mcp__eligian-spike__spike_upfront","input":{"ids":["a"]},"caller":{"type":"direct"}},"timestamp":"2026-11-04T21:54:28.841Z"}
{"type":"assistant","tool_use":{"name":"ToolSearch","input":{"query":"select:mcp__eligian-spike__spike_big","max_results":1},"caller":{"type":"direct"}},"timestamp":"2026-11-04T21:54:29.027Z"}
{"tool_use_result":{"matches":["mcp__eligian-spike__spike_big"],"query":"select:mcp__eligian-spike__spike_big","total_deferred_tools":16}}
{"type":"assistant","tool_use":{"name":"mcp__eligian-spike__spike_big","input":{},"caller":{"type":"direct"}},"timestamp":"2026-11-04T21:54:32.805Z"}
```
- **`spike_upfront` (alwaysLoad) loaded at session start without a tool search: yes**: it is the first tool call, with no `ToolSearch` before it. `spike_big` (no alwaysLoad) was deferred: the model had to `ToolSearch` `select:mcp__eligian-spike__spike_big` before calling it. The final answer said so: "I also used ToolSearch, because `spike_big` was deferred and couldn't be called until its schema was loaded."
- **60,000 chars inline: yes.** The `spike_big` `tool_result` event: `content` is a string of 60,663 chars (the `JSON.stringify` of `{ header, text }`), starting `{"header":"spike_big: 60000 chars, last line 000599","text":"000000-------------` and ending `…\n000599---------------------------------------------------------------------------------------------\n"}`; `tool_use_result.structuredContent.text.length` = 60000. No spill-to-file note. The model's answer: "**Line count:** 600 (`000000` through `000599`) … **Last non-empty line, verbatim:** `000599---…`".

**Instructions in effect: yes.** Second run (cwd `$SCRATCH/cc`, exit 0):
```
claude -p 'First, quote verbatim the server instructions that the eligian-spike MCP server gave you (in your system context), or say NONE if there are none. Then call the MCP tool spike_upfront with ids ["b"] and give its header. Use no other tools.' --mcp-config $SCRATCH/cc/mcp.json --strict-mcp-config --allowedTools mcp__eligian-spike__spike_upfront --output-format json < /dev/null
```
Assistant text event (`message.content[0].text`), verbatim as a JSON string:
```
"Server instructions from eligian-spike, verbatim:\n\n```\nspike instructions\n```"
```
The instructions are in the model's context; the event stream itself never prints them.

**`--output-format json` and the per-tool-call transcript (FR-051 [UNVERIFIED]) → settled: it carries it.** Without `--verbose`, Claude Code 2.1.302's `--output-format json` printed a JSON **array** of 9 events: `system/init`, `rate_limit_event`, `assistant` (thinking), `assistant` (text), `assistant` (`tool_use` `mcp__eligian-spike__spike_upfront` `{"ids":["b"]}`), `user` (`tool_result`), `assistant` (thinking), `assistant` (text), `result/success` (last element; keys include `result`, `num_turns`, `usage`, `total_cost_usd`, `duration_ms`, `is_error`). The tool-call sequence is therefore available from `json` too; T012 may use either format (`stream-json --verbose` is one event per line, `json` one array).

## 4. Negotiated `protocolVersion` per client

Captured with `tee.mjs` between client and server.

- **Inspector 2.13.0**: `2025-11-25`.
  ```
  C->S {"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"roots":{"listChanged":true},"extensions":{"io.modelcontextprotocol/tasks":{},"io.modelcontextprotocol/skills":{}}},"clientInfo":{"name":"inspector-cli","version":"2.13.0"}},"jsonrpc":"2.0","id":0}
  S->C {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-11-25","capabilities":{"logging":{},"tools":{"listChanged":true},"completions":{}},"serverInfo":{"name":"eligian-spike","version":"1.0.1"},"instructions":"spike instructions"}}
  C->S {"jsonrpc":"2.0","method":"notifications/initialized"}
  C->S {"method":"logging/setLevel","params":{"level":"debug"},"jsonrpc":"2.0","id":1}
  S->C {"jsonrpc":"2.0","id":1,"result":{}}
  C->S {"method":"tools/list","jsonrpc":"2.0","id":2}
  ```
- **Claude Code 2.1.302**: `2025-11-25`. It first probes the stateless 2026-07-28 revision with `server/discover`; the server (which does not list `v2026_07_28`, SC-029) answers -32601 and Claude Code falls back to `initialize`:
  ```
  C->S {"jsonrpc":"2.0","id":"server-discover-probe-1","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.302","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"},"io.modelcontextprotocol/clientCapabilities":{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}}}}}
  S->C {"jsonrpc":"2.0","id":"server-discover-probe-1","error":{"code":-32601,"message":"Method not found: server/discover"}}
  C->S {"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}},"clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.302","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"}},"jsonrpc":"2.0","id":0}
  S->C {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-11-25","capabilities":{"logging":{},"tools":{"listChanged":true},"completions":{}},"serverInfo":{"name":"eligian-spike","version":"1.0.1"},"instructions":"spike instructions"}}
  C->S {"jsonrpc":"2.0","method":"notifications/initialized"}
  C->S {"method":"tools/list","jsonrpc":"2.0","id":1}
  ```
- Raw client (`raw-client.mjs`): `"protocolVersion":"2025-06-18"` → answered `2025-06-18`; `2025-11-25` → `2025-11-25`; an unlisted `2024-11-05` → the server answers `"protocolVersion":"2025-11-25"` (its first listed version).
- Seen once (a client that sends `initialize` immediately after spawn): `{"jsonrpc":"2.0","method":"notifications/tools/list_changed","params":{}}` right after the `initialize` result (the toolkit registered after the session started). Test clients that read "the next frame" must skip notifications.

## 5. Wire encoding (plan C2, FR-005)

From `raw-client.mjs` (protocol `2025-11-25`) and a raw no-roots client; frames verbatim (long ones cut where marked).

- **Success**: one text item holding `JSON.stringify(encoded success)`, plus `structuredContent` = the encoded success, plus `isError: false`:
  ```
  {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"header\":\"spike_upfront: McpServerClient Some\",\"text\":\"{\\\"ids\\\":[\\\"a\\\"],\\\"protocolVersion\\\":\\\"2025-11-25\\\",\\\"clientCapabilities\\\":{},\\\"clientInfo\\\":{\\\"name\\\":\\\"x\\\",\\\"version\\\":\\\"0\\\"},\\\"roots\\\":{\\\"error\\\":\\\"McpReverseOperationUnsupported\\\"}}\"}"}],"structuredContent":{"header":"spike_upfront: McpServerClient Some","text":"{\"ids\":[\"a\"],\"protocolVersion\":\"2025-11-25\",\"clientCapabilities\":{},\"clientInfo\":{\"name\":\"x\",\"version\":\"0\"},\"roots\":{\"error\":\"McpReverseOperationUnsupported\"}}"},"isError":false}}
  ```
  The text item begins with `{"header":`, so a payload whose first key is `header` starts its text with the header (FR-005).
  `spike_big`: `text item length=60663, structuredContent.text length=60000, isError=false` (one frame of 122,044 chars on the wire: the text twice).
- **Declared failure** (a `Schema.Struct` failure, not an `Error`): `isError: true`, one text item = `JSON.stringify(encoded failure)`, **no `structuredContent`**:
  ```
  {"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\"header\":\"spike_upfront: failed\",\"message\":\"declared failure\"}"}],"isError":true}}
  ```
  (An `Error` instance with a non-empty `message` as declared failure is sent as plain text `toolErrorResult(error.message)` instead: `McpServer.js` `declaredFailureResult`, plan C2; not exercised on the wire here.)
- **Invalid parameters** (`ids` with 7 entries, above `maxItems: 6`): the encoding **depends on the negotiated protocol**:
  - `2025-11-25`: a tool result, not a JSON-RPC error:
    ```
    {"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"Invalid parameters for tool 'spike_upfront': Expected a value with a length of at most 6\n  at [\"ids\"]"}],"isError":true}}
    ```
  - `2025-06-18`: a JSON-RPC error -32602:
    ```
    {"jsonrpc":"2.0","id":5,"error":{"code":-32602,"message":"Invalid parameters for tool 'spike_upfront': Expected a value with a length of at most 6\n  at [\"ids\"]"}}
    ```
  Consequence for T043 (wire cases): a "JSON-RPC -32602" assertion holds only on a `2025-06-18` session (the spawned client of `package-bin.spec.ts` sends that version); the in-process `effect/ai` `McpClient` negotiates `2025-11-25` and receives `isError: true` with the message as text.

## 6. S1: `McpServerClient` in the handler, `listRoots()`

- `Effect.serviceOption(McpSchema.McpServerClient)` inside the tool handler under `layerStdio`: **`Some`** with every client (inspector, Claude Code, raw client), carrying `protocolVersion`, `clientCapabilities`, `clientInfo`.
- Client without `capabilities.roots`: `listRoots` fails at once with `McpReverseOperationUnsupported` (frame in item 5).
- Raw client that advertises `capabilities.roots` and answers `roots/list`: **works** (protocol `2025-11-25` and `2025-06-18`):
  ```
  S->C {"jsonrpc":"2.0","method":"roots/list","params":null,"id":2}
  C->S {"jsonrpc":"2.0","id":2,"result":{"roots":[{"uri":"file:///F:/projects/eligius/eligian/examples","name":"examples"}]}}
  … "roots":{"ok":[{"uri":"file:///F:/projects/eligius/eligian/examples","name":"examples"}]}
  ```
- **Defect found: `listRoots()` with no argument sends `"params":null`, and both real clients silently drop that request** (no reply; the server times out after 2 s and sends `notifications/cancelled`). Both advertise `roots.listChanged: true`:
  ```
  S->C {"jsonrpc":"2.0","method":"roots/list","params":null,"id":2}
  S->C {"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":2}}
  … "roots":{"timeout":"2 seconds"}          (inspector 2.13.0 and Claude Code 2.1.302 alike)
  ```
  Proof that `params: null` is the cause: with `tee-fix-roots.mjs` deleting `"params":null,`, both clients answer:
  ```
  inspector:   S->C {"jsonrpc":"2.0","method":"roots/list","id":2}
               C->S {"result":{"roots":[]},"jsonrpc":"2.0","id":2}
  Claude Code: S->C {"jsonrpc":"2.0","method":"roots/list","id":2}
               C->S {"result":{"roots":[{"uri":"file:///C:/Users/scab/AppData/Local/Temp/claude/…/scratchpad/cc"},{"uri":"file:///C:/Users/scab/AppData/Local/Programs/Common/VST3/Membrum.vst3/Contents/Resources"},…]},"jsonrpc":"2.0","id":2}
  ```
  **Fix, verified without the tee rewrite: call `listRoots({})`.** It sends `"params":{}` and both clients answer:
  ```
  inspector:   S->C {"jsonrpc":"2.0","method":"roots/list","params":{},"id":2}
               C->S {"result":{"roots":[]},"jsonrpc":"2.0","id":2}
  Claude Code: S->C {"jsonrpc":"2.0","method":"roots/list","params":{},"id":2}
               C->S {"result":{"roots":[{"uri":"file:///C:/Users/scab/AppData/Local/Temp/claude/…/scratchpad/cc"},{"uri":"file:///C:/Users/scab/AppData/Local/Programs/Common/VST3/Membrum.vst3/Contents/Resources"},{"uri":"file:///C:/test/Acoustic%20kit"},{"uri":"f…
  ```
- Claude Code's first root is the session cwd; the rest are its additional working directories. The inspector CLI answers an empty list (then the cwd fallback of FR-007 applies).
- **For T030**: no deviation from FR-007 is needed (`McpServerClient` is present); `projectRoot` MUST call `listRoots({})`, never `listRoots()`, and keep the 2 s timeout + silent cwd fallback (an empty `roots` list also falls back to cwd).

## 7. Process end on stdin EOF (plan C10 `runServer`, for T041)

- **`Layer.launch` ends by itself when stdin ends** (22–27 ms after EOF in `raw-client.mjs`); no `process.stdin.once('end', …)` is needed to stop it.
- But it ends as a **failure whose cause is interrupts only**: with `await Effect.runPromise(Layer.launch(server))` the promise rejects and Node exits **1**:
  ```
  spike: stdin end
  …/effect/dist/internal/effect.js:166
    if (self.reasons.length > 0) return new globalThis.Error("All fibers interrupted without error");
  Error: All fibers interrupted without error
  server exit code=1 signal=null 22ms after EOF (total 906ms)
  ```
- Mechanism that gives exit 0 (verified): `const exit = await Effect.runPromiseExit(Layer.launch(layer))`; when `Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)` treat it as a normal end (exit 0); any other failure → print `Cause.pretty(exit.cause)` to stderr and exit 1.
  ```
  spike: stdin end
  spike: Layer.launch ended: Failure, interrupts only: true
  server exit code=0 signal=null 27ms after EOF (total 1093ms)

  $ printf '' | node packages/cli/bin/cli.js mcp-spike; echo "immediate EOF exit $?"
  spike: stdin end
  spike: Layer.launch ended: Failure, interrupts only: true
  immediate EOF exit 0
  ```

## Side effect while the spike exists

`packages/cli/src/__tests__/package-bin.spec.ts` detects the `mcp` command with `/^\s+mcp\b/m` over `--help` (`hasMcp`, `:31-33`); `\b` matches between `mcp` and `-spike`, so with `mcp-spike` listed the test "mcp answers initialize in under 3 s" runs and fails (`Error: mcp exited (3) before answering`: `eligian mcp` does not exist yet). 10 of 11 tests pass. T009 removes the command and with it this failure; until the real `mcp` command exists (T041) the test is skipped again. Not fixed here (the spec file is outside T008's files).

## Defects found

- `effect` 4.0.7 `McpReverseClient.listRoots()` without a request sends `"params":null`; Claude Code 2.1.302 and inspector 2.13.0 ignore it. Workaround `listRoots({})` (item 6). Not a no-go criterion (FR-002a: `_meta`, annotations, protocol negotiation all pass).

VERDICT: go (2026-11-04). `_meta` (both objects verbatim), annotations (`readOnlyHint: true`), `maxItems` (S2), protocol negotiation (2025-11-25 with Claude Code and the inspector, 2025-06-18 with the raw client), upfront loading, instructions and the 60,000-char inline result all pass; `effect/ai` `McpServer` stays (decision 1).
