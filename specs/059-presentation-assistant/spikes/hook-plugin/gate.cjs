// Spec 059 spike: a stand-in for `eligian brief gate`. Blocks (exit 2) a write to BRIEF.md and the
// creation of a .eligian file next to which no BRIEF.md says `status: approved`.
// The hook input is appended to $SPIKE_HOOK_LOG when that is set. Results: ../../spikes.md
const fs = require('node:fs');
const path = require('node:path');
let input = '';
process.stdin
  .on('data', chunk => {
    input += chunk;
  })
  .on('end', () => {
    if (process.env.SPIKE_HOOK_LOG) {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? null;
      fs.appendFileSync(process.env.SPIKE_HOOK_LOG, `${JSON.stringify({ pluginRoot, input: JSON.parse(input) })}\n`);
    }
    const file = JSON.parse(input).tool_input?.file_path ?? '';
    if (path.basename(file) === 'BRIEF.md') {
      process.stderr.write('BLOCKED (spike): only eligian_brief writes BRIEF.md.\n');
      process.exit(2);
    }
    if (file.endsWith('.eligian') && !fs.existsSync(file)) {
      const brief = path.join(path.dirname(file), 'BRIEF.md');
      const approved = fs.existsSync(brief) && /^- status: approved$/m.test(fs.readFileSync(brief, 'utf8'));
      if (!approved) {
        process.stderr.write('BLOCKED (spike): the brief for this presentation is not approved. Call eligian_brief first.\n');
        process.exit(2);
      }
    }
    process.exit(0);
  });
