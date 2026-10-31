import { describe, expect, test } from 'vitest';
import { findTimelineHeader } from '../timeline-location.js';

describe('findTimelineHeader', () => {
  const source =
    'styles "./s.css"\r\n\r\n  timeline "a.b (x)" in "#s" using raf {}\ntimeline \'other\' in "#s" using raf {}\n';

  test('finds the header line of a timeline by name, with special characters and quote styles', () => {
    expect(findTimelineHeader(source, 'a.b (x)')).toEqual({
      line: 2,
      startCharacter: 2,
      endCharacter: 20,
    });
    expect(findTimelineHeader(source, 'other')?.line).toBe(3);
  });

  test('returns undefined for an unknown timeline', () => {
    expect(findTimelineHeader(source, 'missing')).toBeUndefined();
    expect(findTimelineHeader(source, 'a.b')).toBeUndefined();
  });
});
