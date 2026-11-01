/**
 * `eligian check` runs Eligius' configuration lint (eligius/lint) over every
 * program without errors and reports each finding at its .eligian source.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CheckOptions, runCheck } from '../check/check-command.js';

const STYLES = 'styles "./s.css"\n';

describe('eligian check: Eligius lint', () => {
  let cwd: string;

  beforeAll(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-check-lint-'));
    const write = (file: string, content: string) =>
      fs.writeFileSync(path.join(cwd, file), content);
    write('s.css', '#stage {}\n#a {}\n');
    // A literal outside the operation's allowed values: Eligian accepts it, the lint does not
    write(
      'enum.eligian',
      `${STYLES}timeline "t" in "#stage" using raf {
  at 0s..1s [
    selectElement("#a")
    scrollToElement(200, "nowhere")
  ]
}
`
    );
    // An $operationdata read that nothing provides
    write(
      'read.eligian',
      `${STYLES}timeline "t" in "#stage" using raf {
  at 0s..1s [
    selectElement("#a")
    log($operationdata.nothingHere)
  ]
}
`
    );
    // The failing operation in an imported library action
    write(
      'lib.eligian',
      `library helpers
action jump() [
  selectElement("#a")
  scrollToElement(200, "nowhere")
]
`
    );
    write(
      'uses-lib.eligian',
      `${STYLES}import { jump } from "./lib.eligian"
timeline "t" in "#stage" using raf {
  at 0s..1s jump()
}
`
    );
    // Named actions get their selector from the caller: W111 is left out
    write(
      'params.eligian',
      `${STYLES}action highlight(selector) [
  selectElement(selector)
]
timeline "t" in "#stage" using raf {
  at 0s..1s highlight("#a")
}
`
    );
    // A host operation: its name is passed to the lint
    write('host.ts', 'export const operations = { track: (data: object) => data };\n');
    write(
      'host.eligian',
      `${STYLES}extensions "./host.ts" { operation track(name: string) }
timeline "t" in "#stage" using raf {
  at 0s..1s [ track("x") ]
}
`
    );
  });

  afterAll(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const options = (overrides: Partial<CheckOptions> = {}): CheckOptions => ({
    format: 'json',
    warningsAsErrors: false,
    cwd,
    version: 'test',
    lint: true,
    ...overrides,
  });

  const diagnostics = async (patterns: string[], overrides: Partial<CheckOptions> = {}) => {
    const outcome = await runCheck(patterns, options(overrides));
    const report = JSON.parse(outcome.output) as {
      files: Array<{ file: string; diagnostics: Array<Record<string, unknown>> }>;
    };
    return { outcome, files: report.files };
  };

  it('reports a lint error at the failing operation', async () => {
    const { outcome, files } = await diagnostics(['enum.eligian']);
    expect(outcome.exitCode).toBe(1);
    expect(files[0].diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'eligius-E120',
        line: 5,
        column: 5,
        message: expect.stringMatching(
          /^scrollToElement: 'block' must be one of .* got 'nowhere'\. \(Eligius lint at timelines\[0\]\.timelineActions\[0\]\.startOperations\[\d+\]\.operationData\.block\)$/
        ),
      }),
    ]);
  });

  it('reports lint warnings, which count towards --max-warnings', async () => {
    const { outcome, files } = await diagnostics(['read.eligian'], { maxWarnings: 0 });
    expect(outcome.exitCode).toBe(1);
    expect(files[0].diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'eligius-W151', line: 5 }),
    ]);
  });

  it('a finding in a library action is reported in the library', async () => {
    const { files } = await diagnostics(['uses-lib.eligian', 'lib.eligian']);
    const byName = Object.fromEntries(files.map(f => [path.basename(f.file), f.diagnostics]));
    expect(byName['uses-lib.eligian']).toEqual([]);
    expect(byName['lib.eligian']).toEqual([
      expect.objectContaining({ code: 'eligius-E120', line: 4, column: 3 }),
    ]);

    // Not checked itself: the library still gets its own entry, not the program's lines
    const alone = await diagnostics(['uses-lib.eligian']);
    expect(alone.files.map(f => [path.basename(f.file), f.diagnostics.length])).toEqual([
      ['uses-lib.eligian', 0],
      ['lib.eligian', 1],
    ]);
    expect(alone.outcome.exitCode).toBe(1);
  });

  it('leaves out W111 for action parameters, accepts host operations', async () => {
    const { outcome, files } = await diagnostics(['params.eligian', 'host.eligian']);
    expect(files.flatMap(f => f.diagnostics)).toEqual([]);
    expect(outcome.exitCode).toBe(0);
  });

  it('without lint, only Eligian diagnostics', async () => {
    const { outcome, files } = await diagnostics(['enum.eligian'], { lint: false });
    expect(outcome.exitCode).toBe(0);
    expect(files[0].diagnostics).toEqual([]);
  });
});
