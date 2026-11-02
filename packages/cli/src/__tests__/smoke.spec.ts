/**
 * `eligian smoke` (audit idea #21): plays every timeline on the real Eligius
 * engine in jsdom and reports runtime failures at their .eligian source.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isLibrary, runSmoke } from '../smoke/smoke-command.js';
import { boundaries } from '../smoke/smoke-runner.js';

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
        severity: 'error',
        message:
          'start operation selectElement (in boom): selectElement: selector is either empty or not defined.',
        timeline: 'Broken',
        time: 1,
        location: expect.objectContaining({ line: 3, column: 17 }),
      },
    ]);
  });

  it('names the other place when a called action shares the operation and index', async () => {
    // Eligius reports selectElement at index 0: boom's (which failed) and the
    // timeline action's own both match
    const outcome = await smoke(['shared.eligian'], 'json');
    const [result] = JSON.parse(outcome.output);
    expect(result.problems).toEqual([
      expect.objectContaining({
        message:
          'start operation selectElement: selectElement: selector is either empty or not defined. [or at shared.eligian:3:17 (in boom)]',
        location: expect.objectContaining({ line: 5 }),
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
