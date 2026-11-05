/**
 * timelineFindings / timelineNames (spec 058 phase 2, FR-050, FR-024; plan A2):
 * the five AST review checks on a timeline program, one positive and one
 * negative fixture per code.
 */
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isProgram, type Program } from '../../generated/ast.js';
import { withLoadedDocuments } from '../index.js';
import {
  ASSET_REVIEW_CODES,
  TIMELINE_REVIEW_CODES,
  type TimelineFinding,
  timelineFindings,
  timelineNames,
} from '../timeline-review.js';

const FIXTURES = path.join(__dirname, '__fixtures__', 'timeline-review');
const fixture = (name: string) => path.join(FIXTURES, name, 'main.eligian');

/** Load `file` (and its libraries) and run `use` on its linked Program. */
const withProgram = <T>(file: string, use: (program: Program) => T): Promise<T> =>
  withLoadedDocuments([file], loaded => {
    const root = loaded.documentOf(file)?.parseResult.value;
    if (!isProgram(root)) throw new Error(`${file} did not load as a Program`);
    return use(root);
  });

const findingsOf = (
  name: string,
  options?: Parameters<typeof timelineFindings>[2]
): Promise<TimelineFinding[]> =>
  withProgram(fixture(name), program => timelineFindings(program, fixture(name), options));

const codesAndLines = (findings: readonly TimelineFinding[]) => findings.map(f => [f.code, f.line]);

describe('timelineFindings', () => {
  it('declares the five codes in order, the first three as asset codes', () => {
    expect(TIMELINE_REVIEW_CODES).toEqual([
      'media-file-missing',
      'media-from-duplicate',
      'timeline-container-not-in-layout',
      'media-timeline-first-without-start-gesture',
      'entry-timeline-without-enter',
    ]);
    expect(ASSET_REVIEW_CODES).toEqual([
      'media-file-missing',
      'media-from-duplicate',
      'timeline-container-not-in-layout',
    ]);
  });

  describe('media-file-missing', () => {
    it('reports a video whose from file does not exist, at the from line', async () => {
      const findings = await findingsOf('media-file-missing');

      expect(codesAndLines(findings)).toEqual([['media-file-missing', 3]]);
      expect(findings[0].path).toBe(
        path.join(FIXTURES, 'media-file-missing', 'media', 'missing.mp4')
      );
      expect(findings[0].timeline).toBe('Clip');
    });

    it('reports nothing when the file is present', async () => {
      expect(codesAndLines(await findingsOf('media-present'))).toEqual([]);
    });
  });

  describe('media-from-duplicate', () => {
    it('reports the second timeline with the same from, naming the first', async () => {
      const findings = await findingsOf('media-from-duplicate');

      expect(codesAndLines(findings)).toEqual([['media-from-duplicate', 10]]);
      expect(findings[0].timeline).toBe('Outro');
      expect(findings[0].message).toContain('"Intro"');
      expect(findings[0].path).toBe(
        path.join(FIXTURES, 'media-from-duplicate', 'media', 'clip.mp4')
      );
    });

    it('reports nothing for distinct files', async () => {
      expect(codesAndLines(await findingsOf('media-from-distinct'))).toEqual([]);
    });
  });

  describe('timeline-container-not-in-layout', () => {
    it('reports a container class missing from the layout, at the in line', async () => {
      const findings = await findingsOf('container-not-in-layout');

      expect(codesAndLines(findings)).toEqual([['timeline-container-not-in-layout', 5]]);
      expect(findings[0].message).toContain('.ghostc');
    });

    it('reports nothing when the class is in the layout', async () => {
      expect(codesAndLines(await findingsOf('container-in-layout'))).toEqual([]);
    });

    it('reports nothing without a layout import', async () => {
      expect(codesAndLines(await findingsOf('container-no-layout'))).toEqual([]);
    });
  });

  describe('media-timeline-first-without-start-gesture', () => {
    it('reports a first video timeline whose on enter starts nothing, at the name', async () => {
      const findings = await findingsOf('start-gesture-missing');

      expect(codesAndLines(findings)).toEqual([['media-timeline-first-without-start-gesture', 2]]);
      expect(findings[0].timeline).toBe('Clip');
    });

    it('reports nothing with on click "#start" play in its on enter', async () => {
      expect(codesAndLines(await findingsOf('media-present'))).toEqual([]);
    });
  });

  describe('entry-timeline-without-enter', () => {
    it('reports the first of two timelines without on enter, at the name', async () => {
      const findings = await findingsOf('entry-without-enter');

      expect(codesAndLines(findings)).toEqual([['entry-timeline-without-enter', 2]]);
      expect(findings[0].timeline).toBe('Hub');
    });

    it('reports nothing when the first timeline has on enter', async () => {
      expect(codesAndLines(await findingsOf('entry-with-enter'))).toEqual([]);
    });

    it('reports nothing for a single timeline without on enter (chain-test, Q2)', async () => {
      expect(codesAndLines(await findingsOf('single-timeline'))).toEqual([]);
    });
  });

  it('honours options.exists', async () => {
    expect(codesAndLines(await findingsOf('media-file-missing', { exists: () => true }))).toEqual(
      []
    );
  });

  it('gives 1-based ranges over the reported property', async () => {
    const [finding] = await findingsOf('media-file-missing');

    // `  from "./media/missing.mp4" {`: the string starts at column 8
    expect(finding).toMatchObject({ line: 3, column: 8, endLine: 3, endColumn: 29 });
  });
});

describe('timelineNames', () => {
  it('source names in document order', async () => {
    const names = await withProgram(fixture('entry-with-enter'), timelineNames);

    expect(names).toEqual(['Hub', 'Clip']);
  });
});
