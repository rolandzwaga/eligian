/**
 * Spec 058 Phase 4 (FR-017 / FR-040 / SC-025 (4); plan B1): smoke's engine-error formatting lives
 * in `smoke/engine-error-format.ts`, so `eligian dev` can word a runtime report the way
 * `eligian smoke` does. The functions moved verbatim; `engineErrorText` is the message the smoke
 * report builds, `SELECTOR_MISS` the regex of Eligius' selector warning.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type EngineErrorInfo, locateEngineError } from '@eligian/language';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CompileResult, compileFile } from '../compile-file.js';
import {
  alsoAt,
  engineErrorText,
  errorMessage,
  inFile,
  SELECTOR_MISS,
  selectorLocation,
} from '../smoke/engine-error-format.js';

const LAYOUT = '<div id="stage"><div id="a"></div><div id="b"></div></div>\n';
const STYLES = '#stage {}\n#a {}\n#b {}\n';
const HEADER = 'layout "./layout.html"\nstyles "./styles.css"\n';

/** `boom` has a selectElement at index 0, as the timeline action does: the error is ambiguous. */
const SHARED = `${HEADER}action boom() [ selectElement("#a") selectElement("#b") ]
timeline "Shared" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") boom() ]
  at 1s..2s boom()
}
`;
const SELECTORS = `${HEADER}timeline "Selectors" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") ] [ selectElement("#b") ]
}
`;

describe('engine-error-format', () => {
  let cwd: string;
  let shared: CompileResult;
  let selectors: CompileResult;

  beforeAll(async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-error-format-'));
    const write = (file: string, content: string) =>
      fs.writeFileSync(path.join(cwd, file), content);
    write('layout.html', LAYOUT);
    write('styles.css', STYLES);
    write('shared.eligian', SHARED);
    write('selectors.eligian', SELECTORS);
    shared = await compileFile(path.join(cwd, 'shared.eligian'));
    selectors = await compileFile(path.join(cwd, 'selectors.eligian'));
  });

  afterAll(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('engineErrorText is errorMessage + alsoAt', () => {
    const { map, config } = shared;
    const first = config.timelines[0].timelineActions[0];
    const info: EngineErrorInfo = {
      actionId: first.id,
      phase: 'start',
      operationSystemName: 'selectElement',
      operationIndex: 0,
    };
    const located = locateEngineError(map, info);
    expect(located).toBeDefined();
    const error = { message: 'x', phase: 'start', operationSystemName: 'selectElement' };
    expect(engineErrorText(error, located, map)).toBe(
      errorMessage(error, located?.operation?.systemName, located?.via) +
        alsoAt(located?.alternatives ?? [], map)
    );
    expect(engineErrorText(error, undefined, map)).toBe(errorMessage(error, undefined, undefined));
  });

  it('selectorLocation finds the first selectElement with that literal, start ops before end ops', () => {
    const { map, config } = selectors;
    const offset = SELECTORS.indexOf('selectElement("#b")');
    const before = SELECTORS.slice(0, offset).split('\n');
    const location = selectorLocation(config, map, '#b');
    expect(location?.line).toBe(before.length);
    expect(location?.column).toBe(before[before.length - 1].length + 1);
    expect(selectorLocation(config, map, '#nope')).toBeUndefined();
  });

  it("SELECTOR_MISS matches Eligius' selector warning", () => {
    expect(SELECTOR_MISS.exec("selector '#x' wasn't found!")?.[1]).toBe('#x');
    expect(SELECTOR_MISS.test('selector #x')).toBe(false);
  });

  it('inFile is exported from here', () => {
    expect(inFile(undefined, shared.map)).toBeUndefined();
  });
});
