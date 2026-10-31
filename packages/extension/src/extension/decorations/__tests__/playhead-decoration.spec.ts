/**
 * Live playhead in the editor (audit idea #14): which source lines are marked.
 */
import type { EligianMap } from '@eligian/language';
import { describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { activeEventLines } from '../playhead-decoration-provider.js';

const action = (line: number, start: number, end?: number, file?: string) => ({
  name: `a${line}`,
  kind: 'timeline' as const,
  location: { line, column: 3, length: 10, ...(file ? { file } : {}) },
  start: [],
  end: [],
  timelineUri: 'intro',
  duration: end === undefined ? { start } : { start, end },
});

const map: EligianMap = {
  version: 1,
  actions: {
    lifecycle: action(3, 0), // on enter / on leave: open-ended, never marked
    beat1: action(5, 0, 6),
    beat2: action(9, 6, 12),
    overlap: action(10, 5, 8),
    library: action(2, 0, 20, 'F:\\lib.eligian'),
  },
};

describe('activeEventLines', () => {
  test('the events of the previewed file running at the position, by line', () => {
    expect(activeEventLines(map, 'intro', 5.5)).toEqual([
      { line: 4, label: '▶ 0s..6s' },
      { line: 9, label: '▶ 5s..8s' },
    ]);
    expect(activeEventLines(map, 'intro', 6)).toEqual([
      { line: 8, label: '▶ 6s..12s' },
      { line: 9, label: '▶ 5s..8s' },
    ]);
  });

  test('nothing for another timeline, past the end, or without a map', () => {
    expect(activeEventLines(map, 'outro', 1)).toEqual([]);
    expect(activeEventLines(map, 'intro', 30)).toEqual([]);
    expect(activeEventLines(undefined, 'intro', 1)).toEqual([]);
  });
});
