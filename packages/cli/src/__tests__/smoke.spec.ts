/**
 * `eligian smoke` (audit idea #21): plays every timeline on the real Eligius
 * engine in jsdom and reports runtime failures at their .eligian source.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isLibrary, runSmoke, smokeFile } from '../smoke/smoke-command.js';
import { boundaries, SMOKE_CODES } from '../smoke/smoke-runner.js';

/** The FR-033 fixture: a host operation that returns undefined, called twice after a selectElement. */
const HOST_UNDEFINED = path.join(__dirname, '__fixtures__', 'mcp', 'scenario', 'host-undefined');

/** T002's outputs of the built CLI before Phase 2 (FR-031: pretty and github stay byte-identical). */
const BASE = path.resolve(
  __dirname,
  '../../../../specs/058-mcp-server/phase-2-inspect-smoke-context/baseline'
);

/** A baseline file's sections: `### <patterns and flags> (exit N)`, then the command's stdout. */
function baselineSections(file: string): { args: string[]; exitCode: number; stdout: string }[] {
  const text = fs.readFileSync(path.join(BASE, file), 'utf-8').replace(/\r\n/g, '\n');
  return text
    .split(/^### /m)
    .filter(section => section !== '')
    .map(section => {
      const newline = section.indexOf('\n');
      const heading = /^(.*) \(exit (\d+)\)$/.exec(section.slice(0, newline));
      if (!heading) throw new Error(`not a baseline heading: ${section.slice(0, newline)}`);
      return {
        args: heading[1].split(' '),
        exitCode: Number(heading[2]),
        stdout: section.slice(newline + 1),
      };
    });
}

const LAYOUT = '<div id="stage"><div id="a"></div><div id="b"></div></div>\n';
const STYLES = '#stage {}\n#a {}\n#b {}\n#ghost {}\n.on {}\n';
const HEADER = 'layout "./layout.html"\nstyles "./styles.css"\n';

describe('eligian smoke', () => {
  let cwd: string;

  beforeAll(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-smoke-'));
    const write = (file: string, content: string) =>
      fs.writeFileSync(path.join(cwd, file), content);
    write('layout.html', LAYOUT);
    write('styles.css', STYLES);
    write(
      'clean.eligian',
      `${HEADER}timeline "Clean" in "#stage" using raf {
  on enter [ selectElement("#a") addClass("on") ]
  on leave [ selectElement("#a") removeClass("on") ]
  at 0s..1s [ selectElement("#b") addClass("on") log("logged, not reported") ] [ selectElement("#b") removeClass("on") ]
  sequence { for 1s [ selectElement("#a") ] [ selectElement("#a") ] }
}
timeline "Second" in "#stage" using raf { at 0s..2s [ selectElement("#a") ] [] }
`
    );
    write(
      'broken.eligian',
      `${HEADER}action boom() [ selectElement($globaldata.nothing) addClass("on") ]
timeline "Broken" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") addClass("on") ] [ selectElement("#ghost") removeClass("on") ]
  at 1s..2s boom()
}
`
    );
    write(
      'shared.eligian',
      `${HEADER}action boom() [ selectElement($globaldata.nothing) ]
timeline "Shared" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") boom() ]
}
`
    );
    write(
      'slow.eligian',
      `${HEADER}timeline "Slow" in "#stage" using raf { at 0s..1s [ wait(200) ] [] }\n`
    );
    write('uncompilable.eligian', `${HEADER}timeline "Bad" in "#stage" using raf {\n  at 0s..1s [`);
    write('lib.eligian', '// helpers\nlibrary helpers\naction noop() [ selectElement("#a") ]\n');
    write(
      'media.eligian',
      `${HEADER}timeline "Intro" in "#stage" using video from "./intro.mp4" { at 0s..1s [ selectElement("#a") ] [] }
`
    );
  });

  afterAll(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const smoke = (
    patterns: string[],
    format: 'pretty' | 'github' | 'json' = 'pretty',
    strict = false
  ) => runSmoke(patterns, { format, strict, cwd });

  it('plays every timeline of a clean program', async () => {
    const outcome = await smoke(['clean.eligian']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.output).toBe(
      [
        'clean.eligian',
        "  timeline 'Clean': 3 positions ok",
        "  timeline 'Second': 2 positions ok",
        '1 file, 2 timelines played, 0 errors, 0 warnings',
      ].join('\n')
    );
  });

  it('reports a runtime failure at its source, with the timeline and the time', async () => {
    const outcome = await smoke(['broken.eligian'], 'json');
    expect(outcome.exitCode).toBe(1);
    const [result] = JSON.parse(outcome.output);
    expect(result.problems).toEqual([
      {
        code: 'smoke-engine-error',
        severity: 'error',
        message:
          'start operation selectElement (in boom): selectElement: selector is either empty or not defined.',
        timeline: 'Broken',
        time: 1,
        location: expect.objectContaining({ line: 3, column: 17 }),
      },
    ]);
  });

  it('a called action that shares the operation and index: the one that failed', async () => {
    // Eligius reports selectElement at index 0: boom's (which failed) and the
    // timeline action's own both match; its operation path (4.2) names boom's
    const outcome = await smoke(['shared.eligian'], 'json');
    const [result] = JSON.parse(outcome.output);
    expect(result.problems).toEqual([
      expect.objectContaining({
        code: 'smoke-engine-error',
        message:
          'start operation selectElement (in boom): selectElement: selector is either empty or not defined.',
        location: expect.objectContaining({ line: 3, column: 17 }),
      }),
    ]);
  });

  it('--strict also reports selectors that match no element', async () => {
    const outcome = await smoke(['broken.eligian'], 'github', true);
    expect(outcome.output.split('\n')).toEqual([
      expect.stringMatching(
        /^::error file=broken\.eligian,line=5,col=\d+,title=eligian smoke::selectElement\("#ghost"\) matched no element \('Broken' at 1s\)$/
      ),
      expect.stringMatching(
        /^::error file=broken\.eligian,line=3,col=17,title=eligian smoke::start operation selectElement/
      ),
      '1 file, 1 timeline played, 2 errors, 0 warnings',
    ]);
  });

  it('skips libraries and media timelines', async () => {
    const outcome = await smoke(['lib.eligian', 'media.eligian']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.output).toContain('lib.eligian (library: nothing to play)');
    expect(outcome.output).toContain(
      "timeline './intro.mp4' skipped (media timelines need a browser)"
    );
  });

  it('every problem has a SMOKE_CODES code', async () => {
    const outcomes = [
      await smoke(['*.eligian'], 'json', true),
      await runSmoke(['main.eligian'], { format: 'json', strict: true, cwd: HOST_UNDEFINED }),
    ];
    const problems = outcomes.flatMap(outcome =>
      (JSON.parse(outcome.output) as { problems: { code?: string }[] }[]).flatMap(r => r.problems)
    );
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(SMOKE_CODES).toContain(problem.code);
    expect(problems.map(p => p.code)).toEqual(
      expect.arrayContaining(['smoke-compile-failed', 'smoke-selector-miss', 'smoke-engine-error'])
    );
  });

  it('host op returning undefined: exactly one host-operation-returned-non-object at the call site', async () => {
    const outcome = await runSmoke(['main.eligian'], {
      format: 'json',
      strict: false,
      cwd: HOST_UNDEFINED,
    });
    expect(outcome.exitCode).toBe(1);
    const [result] = JSON.parse(outcome.output);
    const nonObject = result.problems.filter(
      (p: { code: string }) => p.code === 'host-operation-returned-non-object'
    );
    expect(nonObject).toEqual([
      expect.objectContaining({
        severity: 'error',
        location: expect.objectContaining({ line: 11 }),
      }),
    ]);
  });

  it('a step timeout is smoke-step-timeout', async () => {
    // slow.eligian's event runs wait(200): the seek to 0 cannot finish within 1 ms
    const outcome = await runSmoke(['slow.eligian'], {
      format: 'json',
      strict: false,
      cwd,
      stepTimeoutMs: 1,
    });
    expect(outcome.exitCode).toBe(1);
    const [result] = JSON.parse(outcome.output);
    expect(result.problems).toEqual([
      expect.objectContaining({
        code: 'smoke-step-timeout',
        severity: 'error',
        message: expect.stringMatching(/did not finish within 1 ms$/),
      }),
    ]);
  });

  it('pretty and github outputs are byte-identical to the baseline', async () => {
    for (const format of ['pretty', 'github'] as const) {
      const sections = baselineSections(`smoke-${format}-before.txt`);
      expect(sections.length).toBeGreaterThan(0);
      for (const { args, exitCode, stdout } of sections) {
        const outcome = await smoke(
          args.filter(arg => arg !== '--strict'),
          format,
          args.includes('--strict')
        );
        // The CLI prints the output with console.log: one newline after it
        expect(`${outcome.output}\n`, `${format}: ${args.join(' ')}`).toBe(stdout);
        expect(outcome.exitCode, `${format}: ${args.join(' ')}`).toBe(exitCode);
      }
    }
  });

  it('a program that does not compile: the pre-Phase-2 message, a space after the colon', async () => {
    // FR-031: pretty and github stay byte-identical; the baseline holds no uncompilable file
    const pretty = await smoke(['uncompilable.eligian']);
    expect(pretty.exitCode).toBe(1);
    expect(pretty.output).toMatch(/^ {2}error {2}does not compile: \S/m);
    const github = await smoke(['uncompilable.eligian'], 'github');
    expect(github.output).toMatch(
      /^::error file=uncompilable\.eligian,title=eligian smoke::does not compile: \S/m
    );
    const [result] = JSON.parse((await smoke(['uncompilable.eligian'], 'json')).output);
    expect(result.problems).toEqual([
      {
        code: 'smoke-compile-failed',
        severity: 'error',
        message: expect.stringMatching(/^does not compile: \S/),
      },
    ]);
  });

  it('smokeFile is exported and returns a SmokeResult', async () => {
    const result = await smokeFile(path.join(cwd, 'clean.eligian'), {
      format: 'json',
      strict: false,
      cwd,
    });
    expect(result.timelines).toEqual([
      { name: 'Clean', boundaries: 3 },
      { name: 'Second', boundaries: 2 },
    ]);
    expect(result.problems).toEqual([]);
  });

  it('exits with 2 when nothing matches', async () => {
    expect((await smoke(['nothing/*.eligian'])).exitCode).toBe(2);
  });

  it('library detection and boundaries', () => {
    expect(isLibrary('/** doc */\n// x\nlibrary fx\n')).toBe(true);
    expect(isLibrary('timeline "library" in "#a" using raf {}')).toBe(false);
    expect(
      boundaries({
        duration: 5,
        timelineActions: [
          { duration: { start: 0 } },
          { duration: { start: 1, end: 3 } },
          { duration: { start: 3, end: 5 } },
        ],
      } as never)
    ).toEqual([0, 1, 3, 5]);
  });
});
