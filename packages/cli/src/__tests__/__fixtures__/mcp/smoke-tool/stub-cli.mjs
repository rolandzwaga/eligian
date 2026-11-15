// A stand-in for bin/cli.js in mcp-smoke.spec.ts (FR-044): run as
// `node stub-cli.mjs smoke <file> … --format ndjson …`. It writes two known lines to stderr,
// one line that is not JSON and the ndjson `file` / `timeline` / `summary` lines to stdout,
// then exits 0. With `--timeline __exit2__` it writes a usage error to stderr and exits 2.
import * as path from 'node:path';

const args = process.argv.slice(2);
if (args.includes('__exit2__')) {
  process.stderr.write('eligian smoke: stub usage error\n');
  process.exit(2);
}
const file = path.resolve(args[1]);
process.stderr.write('stub stderr one\nstub stderr two\n');
process.stdout.write('this line is not json\n');
process.stdout.write(`${JSON.stringify({ type: 'file', file })}\n`);
process.stdout.write(`${JSON.stringify({ type: 'timeline', file, name: 'B1', boundaries: 2 })}\n`);
process.stdout.write(
  `${JSON.stringify({ type: 'summary', files: 1, timelines: 1, errors: 0, warnings: 0 })}\n`
);
