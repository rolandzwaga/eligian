/**
 * Runtime scroll container check in the preview (Feature 049).
 */
import { describe, expect, test } from 'vitest';
import { scrollContainerProblem, scrollSelectorOf } from '../scroll-check.js';

/** An element with fixed scroll metrics (jsdom does no layout). */
function element(scrollHeight: number, clientHeight: number): Element {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight });
  return el;
}

describe('scrollContainerProblem', () => {
  test('passes for a scrollable element whose content is taller', () => {
    expect(scrollContainerProblem(element(2000, 500), '#s', () => 'auto')).toBeUndefined();
    expect(scrollContainerProblem(element(2000, 500), '#s', () => 'scroll')).toBeUndefined();
  });

  test('reports a missing element, a non-scrolling overflow and content that fits', () => {
    expect(scrollContainerProblem(null, '#s', () => 'auto')).toBe(
      "Scroll container '#s' is not in the preview's layout, so the timeline cannot move"
    );
    expect(scrollContainerProblem(element(2000, 500), '#s', () => 'visible')).toBe(
      "Scroll container '#s' cannot scroll: its overflow-y is 'visible' (needs auto or scroll)"
    );
    expect(scrollContainerProblem(element(500, 500), '#s', () => 'auto')).toBe(
      "Scroll container '#s' has nothing to scroll: its content (500px) is not taller than the element (500px)"
    );
  });
});

describe('scrollSelectorOf', () => {
  const timelines = [
    { uri: 'intro', positionSource: undefined },
    { uri: 'story', positionSource: { systemName: 'ScrollPositionSource', selector: '#scroller' } },
    { uri: 'film', positionSource: { selector: '#video' } },
  ];

  test('returns the selector of scroll timelines only', () => {
    expect(scrollSelectorOf(timelines, 'story')).toBe('#scroller');
    expect(scrollSelectorOf(timelines, 'intro')).toBeUndefined();
    expect(scrollSelectorOf(timelines, 'film')).toBeUndefined();
    expect(scrollSelectorOf(undefined, 'story')).toBeUndefined();
  });
});
