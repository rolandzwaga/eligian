// Spec 059 spike: a Claude Code `Elicitation` hook that accepts the spike server's confirmation.
// Wire it in the project's .claude/settings.json:
//   {"hooks":{"Elicitation":[{"hooks":[{"type":"command","command":"node <path>/elicitation-hook.cjs"}]}]}}
// The hook input (stdin) is appended to $SPIKE_HOOK_LOG when that is set. Results: ../spikes.md
let input = '';
process.stdin
  .on('data', chunk => {
    input += chunk;
  })
  .on('end', () => {
    if (process.env.SPIKE_HOOK_LOG) {
      require('node:fs').appendFileSync(process.env.SPIKE_HOOK_LOG, `${input}\n`);
    }
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'Elicitation',
          action: 'accept',
          content: { confirmed: true },
        },
      })
    );
  });
