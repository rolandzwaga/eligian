/**
 * The timeline (Gantt) view's webview (audit idea #20, phase 2): rendering,
 * clicks (go to source), double-clicks (preview from there), the playhead.
 */
import type { GanttTimeline } from '@eligian/language';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { playheadPercent, renderTimelines, tickStep } from '../timeline-view-render.js';

const range = (line: number) => ({
  start: { line, character: 2 },
  end: { line, character: 20 },
});

const MAIN: GanttTimeline = {
  name: 'Main <1>',
  uri: 'Main <1>',
  provider: 'raf',
  duration: 10,
  lanes: 2,
  lifecycle: ['enter', 'leave'],
  unresolved: 1,
  range: range(0),
  bars: [
    { label: 'intro', detail: 'log', kind: 'at', start: 0, end: 5, lane: 0, range: range(2) },
    {
      label: 'sequence 1/1',
      detail: '"<b>" · reveal',
      kind: 'sequence',
      start: 2.5,
      end: 10,
      lane: 1,
      range: range(4),
    },
  ],
};

const HUB: GanttTimeline = { ...MAIN, name: 'Hub', uri: 'Hub', duration: 0, lanes: 0, bars: [] };

describe('timeline view rendering', () => {
  test('bars are placed by time and lane, labels escaped', () => {
    document.body.innerHTML = renderTimelines('main.eligian', [MAIN]);
    const bars = Array.from(document.querySelectorAll<HTMLElement>('.bar'));
    expect(bars.map(b => [b.textContent, b.style.left, b.style.width, b.style.top])).toEqual([
      ['intro', '0%', '50%', '0px'],
      ['sequence 1/1', '25%', '75%', '22px'],
    ]);
    expect(bars[1].className).toBe('bar kind-sequence');
    expect(bars[1].title).toContain('"<b>" · reveal');
    expect(bars[1].title).toContain('Double-click: preview from 2.5s');
    expect(document.querySelector('.name')?.textContent).toBe('timeline "Main <1>"');
    expect(document.querySelector('.meta')?.textContent).toBe(
      'raf · 0s..10s · on enter · on leave · 1 event timed at runtime (not shown)'
    );
    expect(document.querySelector<HTMLElement>('.lanes')?.style.height).toBe('44px');
  });

  test('the axis, and a timeline without timed events', () => {
    document.body.innerHTML = renderTimelines('main.eligian', [MAIN, HUB]);
    expect(Array.from(document.querySelectorAll('.tick')).map(t => t.textContent)).toEqual([
      '0s',
      '1s',
      '2s',
      '3s',
      '4s',
      '5s',
      '6s',
      '7s',
      '8s',
      '9s',
      '10s',
    ]);
    const sections = document.querySelectorAll('.timeline');
    expect(sections[1].querySelector('.lanes')).toBeNull();
    expect(sections[1].querySelector('.meta')?.textContent).toContain('no timed events');
    expect(renderTimelines('x.eligian', [])).toContain('x.eligian has no timelines.');
  });

  test('tick steps and the playhead position', () => {
    expect(tickStep(10)).toBe(1);
    expect(tickStep(42)).toBe(5);
    expect(tickStep(3)).toBe(0.5);
    expect(
      playheadPercent({ uri: 'Main', duration: 10 }, { timelineUri: 'Main', position: 2.5 })
    ).toBe(25);
    expect(
      playheadPercent({ uri: 'Main', duration: 10 }, { timelineUri: 'Other', position: 2 })
    ).toBeUndefined();
    expect(playheadPercent({ uri: 'Main', duration: 10 }, undefined)).toBeUndefined();
  });
});

describe('timeline view webview script', () => {
  const posted: unknown[] = [];

  beforeAll(async () => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: (m: unknown) => posted.push(m) }));
    await import('../timeline-view.js');
  });

  const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));

  test('asks for data, draws it, and reports clicks and double-clicks', () => {
    expect(posted).toContainEqual({ type: 'ready' });
    send({ type: 'update', fileName: 'main.eligian', timelines: [MAIN] });
    const bar = document.querySelectorAll<HTMLElement>('.bar')[1];
    bar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'reveal', range: range(4) });
    bar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'preview', timelineUri: 'Main <1>', seconds: 2.5 });
    document.querySelector('.name')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'reveal', range: range(0) });
  });

  test('moves the playhead without redrawing, and hides it', () => {
    send({ type: 'update', fileName: 'main.eligian', timelines: [MAIN] });
    const lanes = document.querySelector('.lanes');
    send({ type: 'playhead', playhead: { timelineUri: 'Main <1>', position: 5 } });
    expect(document.querySelector<HTMLElement>('.playhead')?.style.left).toBe('50%');
    expect(document.querySelector('.lanes')).toBe(lanes);
    send({ type: 'playhead', playhead: { timelineUri: 'Main <1>', position: 7.5 } });
    expect(document.querySelectorAll('.playhead')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('.playhead')?.style.left).toBe('75%');
    send({ type: 'playhead' });
    expect(document.querySelector('.playhead')).toBeNull();
  });

  test('an empty message', () => {
    send({ type: 'empty', message: 'Open an .eligian file' });
    expect(document.getElementById('root')?.textContent).toBe('Open an .eligian file');
  });
});
