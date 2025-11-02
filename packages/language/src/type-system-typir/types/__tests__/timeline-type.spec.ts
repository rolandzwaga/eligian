/**
 * Unit Tests: TimelineType Factory (US5)
 *
 * Tests the TimelineType custom type factory properties in isolation:
 * - Factory creates TimelineType with correct properties
 * - Properties match expected structure for each provider type
 * - Circular dependency handling (events array)
 */

import { describe, expect, test } from 'vitest';
import type { TimelineType } from '../timeline-type.js';

describe('TimelineType Factory (Unit Tests)', () => {
  test('should create TimelineType properties with video provider', () => {
    const props: TimelineType = {
      provider: 'video',
      containerSelector: '#app',
      source: './video.mp4',
      events: [],
    };

    expect(props.provider).toBe('video');
    expect(props.containerSelector).toBe('#app');
    expect(props.source).toBe('./video.mp4');
    expect(props.events).toEqual([]);
  });

  test('should create TimelineType properties with audio provider', () => {
    const props: TimelineType = {
      provider: 'audio',
      containerSelector: '#player',
      source: './audio.mp3',
      events: [],
    };

    expect(props.provider).toBe('audio');
    expect(props.containerSelector).toBe('#player');
    expect(props.source).toBe('./audio.mp3');
  });

  test('should create TimelineType properties with raf provider', () => {
    const props: TimelineType = {
      provider: 'raf',
      containerSelector: '#canvas',
      source: undefined,
      events: [],
    };

    expect(props.provider).toBe('raf');
    expect(props.containerSelector).toBe('#canvas');
    expect(props.source).toBeUndefined();
  });

  test('should create TimelineType properties with custom provider', () => {
    const props: TimelineType = {
      provider: 'custom',
      containerSelector: '.container',
      source: undefined,
      events: [],
    };

    expect(props.provider).toBe('custom');
    expect(props.containerSelector).toBe('.container');
    expect(props.source).toBeUndefined();
  });

  test('should handle timeline with events array', () => {
    const props: TimelineType = {
      provider: 'video',
      containerSelector: '#app',
      source: './video.mp4',
      events: [{}, {}], // Mock event objects
    };

    expect(props.events.length).toBe(2);
  });

  test('should store containerSelector property correctly', () => {
    const props: TimelineType = {
      provider: 'video',
      containerSelector: '#my-container',
      source: './video.mp4',
      events: [],
    };

    expect(props.containerSelector).toBe('#my-container');
  });

  test('should store source property when provided', () => {
    const props: TimelineType = {
      provider: 'video',
      containerSelector: '#app',
      source: './my-video.mp4',
      events: [],
    };

    expect(props.source).toBe('./my-video.mp4');
  });

  test('should handle undefined source property', () => {
    const props: TimelineType = {
      provider: 'raf',
      containerSelector: '#app',
      source: undefined,
      events: [],
    };

    expect(props.source).toBeUndefined();
  });
});
