/**
 * Tour validation helper.
 *
 * Workaround for CLI bug B1 (see packages/cli/KNOWN_ISSUES.md): the `eligian`
 * binary is currently a no-op, so we validate/compile via the programmatic API.
 *
 * Usage (from repo root):
 *   node examples/eligian-tour/validate.mjs <file.eligian> [--json]
 *
 * Exit 0 = valid. Exit 1 = compile/validation error (prints details).
 * With --json, prints a short summary of the emitted Eligius config.
 */
import { compileFile } from '../../packages/cli/dist/index.mjs';

const args = process.argv.slice(2);
const showJson = args.includes('--json');
const input = args.find((a) => !a.startsWith('--'));

if (!input) {
  console.error('usage: node examples/eligian-tour/validate.mjs <file.eligian> [--json]');
  process.exit(2);
}

try {
  const result = await compileFile(input, { optimize: true });
  console.log(`✓ ${input} is valid (${result.json.length} bytes, ${result.assetCount} asset(s))`);
  if (showJson) {
    const c = JSON.parse(result.json);
    const t = (c.timelines || [])[0];
    console.log(`  timelines: ${(c.timelines || []).length}`);
    if (t) console.log(`  timeline[0]: uri=${t.uri} type=${t.type} actions=${(t.timelineActions || []).length}`);
    console.log(`  reusable actions: ${(c.actions || []).map((a) => a.name).join(', ') || '(none)'}`);
  }
} catch (e) {
  console.error(`✗ ${input} failed: ${e.constructor.name}`);
  if (e.formatted) {
    for (const f of e.formatted) {
      console.error(`\n${f.message}`);
      if (f.hint) console.error(`  💡 ${f.hint}`);
    }
  } else {
    console.error(e.message);
  }
  process.exit(1);
}
