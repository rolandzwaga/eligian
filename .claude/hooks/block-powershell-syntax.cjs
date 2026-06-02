#!/usr/bin/env node
/**
 * PreToolUse guard for the Eligian project (Windows setup).
 *
 * Hard-blocks two recurring failure modes that an advisory memory file did not
 * reliably prevent:
 *   1. The PowerShell tool being used at all (project policy: Bash only).
 *   2. A Bash tool command containing PowerShell here-string markers @' or '@,
 *      which corrupt git commit subjects when run through bash.
 *
 * Reads the PreToolUse hook payload on stdin and, on a match, emits a
 * permissionDecision:"deny" with a corrective message. Otherwise stays silent
 * (no decision = default allow). Always exits 0 so a parse hiccup never wedges
 * the tool pipeline.
 *
 * Committed to the repo (.claude/hooks) on purpose: this behaviour must survive
 * a full Claude Code reinstall, which would wipe ~/.claude.
 */
'use strict';

let raw = '';
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0); // malformed payload: don't block
  }

  const tool = input.tool_name || '';
  const command = (input.tool_input && input.tool_input.command) || '';

  let reason = null;

  if (tool === 'PowerShell') {
    reason =
      'The PowerShell tool is disabled on this machine (project policy: use the Bash tool exclusively). Re-issue this as a Bash command.';
  } else if (tool === 'Bash' && (command.includes("@'") || command.includes("'@"))) {
    reason =
      "PowerShell here-string syntax (@'...'@) was detected inside a Bash command. " +
      'In bash this is NOT a here-string — it injects a literal @ and corrupts git commit subjects. ' +
      "Use a bash heredoc instead, e.g.:\n" +
      "  git commit -F - <<'EOF'\n" +
      '  subject line\n' +
      '\n' +
      '  body line\n' +
      '  EOF';
  }

  if (reason) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      })
    );
  }

  process.exit(0);
});
