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

/**
 * Detect a PowerShell here-string in a bash command, tightly enough to avoid
 * matching prose that merely mentions the markers.
 *
 * Only flags the markers when they sit at a TOKEN boundary — i.e. the opener
 * @' begins a word (start of command or right after whitespace), and the
 * closer '@ ends a word (end of command or right before whitespace). That is
 * exactly the shape of the real mistake (`git commit -m @'...'@`) while a
 * commit message or comment that contains "@'" or "'@" mid-text no longer
 * trips it.
 */
function isPowerShellHereString(command) {
  const openerAtTokenStart = /(^|\s)@'/.test(command); // word starts with @'
  const closerAtTokenEnd = /'@(\s|$)/.test(command); // word ends with '@
  return openerAtTokenStart || closerAtTokenEnd;
}

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
  } else if (tool === 'Bash' && isPowerShellHereString(command)) {
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
