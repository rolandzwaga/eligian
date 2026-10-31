/**
 * Audit idea #14: `eligian <file> --eligian-map` writes the map from the
 * compiled JSON back to the .eligian source next to the output.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eligianMapPath, validateOptionCombination } from '../cli-options.js';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');

describe('--eligian-map (audit idea #14)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-map-cli-'));
    fs.writeFileSync(path.join(dir, 's.css'), '#stage, #a { color: red; }');
    fs.writeFileSync(
      path.join(dir, 'story.eligian'),
      `styles "./s.css"
timeline "t" in "#stage" using raf {
  at 0s..2s [ selectElement("#a") ]
}
`
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes <output>.eligian-map.json with the source and every action', () => {
    const output = path.join(dir, 'story.json');
    const run = spawnSync(
      'node',
      [CLI_PATH, path.join(dir, 'story.eligian'), '-o', output, '--eligian-map'],
      {
        encoding: 'utf-8',
      }
    );
    expect(run.status, run.stderr).toBe(0);

    const config = JSON.parse(fs.readFileSync(output, 'utf-8'));
    const map = JSON.parse(fs.readFileSync(path.join(dir, 'story.eligian-map.json'), 'utf-8'));
    const id = config.timelines[0].timelineActions[0].id;
    expect(map.version).toBe(1);
    expect(map.source).toBe(path.join(dir, 'story.eligian'));
    expect(map.actions[id]).toMatchObject({
      kind: 'timeline',
      timelineUri: 't',
      duration: { start: 0, end: 2 },
      location: { line: 3, column: 3 },
      start: [{ systemName: 'selectElement', location: { line: 3, column: 15 } }],
    });
  });

  it('is not written without the flag', () => {
    const run = spawnSync('node', [CLI_PATH, path.join(dir, 'story.eligian')], {
      encoding: 'utf-8',
    });
    expect(run.status, run.stderr).toBe(0);
    expect(fs.existsSync(path.join(dir, 'story.eligian-map.json'))).toBe(false);
  });

  it('needs a file output and does not apply to bundles', () => {
    expect(eligianMapPath('out/story.json')).toBe('out/story.eligian-map.json');
    expect(eligianMapPath('story.config')).toBe('story.config.eligian-map.json');
    expect(
      validateOptionCombination({ bundle: false, check: false, eligianMap: true, output: '-' })
    ).toMatch(/needs an output file/);
    expect(validateOptionCombination({ bundle: true, check: false, eligianMap: true })).toMatch(
      /not to --bundle/
    );
    expect(
      validateOptionCombination({ bundle: false, check: false, eligianMap: true })
    ).toBeUndefined();
  });
});
