/**
 * Data of the timeline (Gantt) view (audit idea #20, phase 2).
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { Program } from '../../generated/ast.js';
import { pack, timelineGantt } from '../timeline-gantt.js';

describe('timeline gantt data (idea #20)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const gantt = async (source: string) =>
    timelineGantt((await ctx.parse(source)).parseResult.value as Program);

  test('a bar per event, with resolved times, labels and what it does', async () => {
    const [main] = await gantt(`timeline "Main" in "#stage" using raf {
  on enter [ selectElement("#a") ]
  at 0s..4s as intro [ log("Hello there") ] []
  at 2s..3s [ selectElement("#b") ] []
  sequence {
    selectElement("#c") for 2s as first
    for 1s [ selectElement("#d") ] []
  }
  stagger 500ms ["#e", "#f"] with selectElement(@@item) for 1s
}`);
    expect(main).toMatchObject({
      name: 'Main',
      uri: 'Main',
      provider: 'raf',
      duration: 7.5,
      lifecycle: ['enter'],
      unresolved: 0,
      lanes: 2,
    });
    expect(main.bars.map(b => [b.label, b.kind, b.start, b.end, b.lane, b.detail])).toEqual([
      ['intro', 'at', 0, 4, 0, '"Hello there" · log'],
      // Overlaps intro: the next lane
      ['at', 'at', 2, 3, 1, 'selectElement'],
      // A sequence starts after the previous event (2s..3s); intro still runs: lane 1
      ['first', 'sequence', 3, 5, 1, 'selectElement'],
      ['sequence 2/2', 'sequence', 5, 6, 0, 'selectElement'],
      ['stagger 1/2 "#e"', 'stagger', 6, 7, 0, 'selectElement'],
      ['stagger 2/2 "#f"', 'stagger', 6.5, 7.5, 1, 'selectElement'],
    ]);
    // The source of each bar, for "go to source"
    expect(main.bars[0].range.start.line).toBe(2);
  });

  test('a media timeline is previewed by its source; runtime times are counted, not drawn', async () => {
    const [video] = await gantt(`timeline "Intro" in "#p" using video from "./intro.mp4" {
  at $globaldata.start..5s [ selectElement("#a") ] []
  at 1s..2s [ selectElement("#a") ] []
}`);
    expect(video.uri).toBe('./intro.mp4');
    expect(video.unresolved).toBe(1);
    expect(video.bars).toHaveLength(1);
  });

  test('a timeline without timed events has no bars and duration 0', async () => {
    const [hub] = await gantt(
      'timeline "Hub" in "#s" using raf { on enter [ selectElement("#h") ] }'
    );
    expect(hub).toMatchObject({ duration: 0, bars: [], lanes: 0, lifecycle: ['enter'] });
  });

  test('packing: touching bars share a lane, overlapping ones do not', () => {
    const { bars, lanes } = pack([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 1, end: 3 },
      { start: 3, end: 5 },
    ]);
    expect(bars.map(b => [b.start, b.lane])).toEqual([
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
    ]);
    expect(lanes).toBe(2);
  });
});
