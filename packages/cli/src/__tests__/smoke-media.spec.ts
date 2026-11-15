/**
 * The media clock of `eligian smoke` (spec 058 Phase 3 FR-035–FR-038): jsdom's
 * HTMLMediaElement gets the duration, seeks, events and real-time play that eligius 4.2.0's
 * VideoPositionSource needs, and the smoke runner walks media timelines with it installed
 * (`describe('media timelines')`, on the fixtures under `__fixtures__/mcp/smoke-media/`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IEngineConfiguration } from 'eligius';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { smokeWindow } from '../smoke/dom-environment.js';
import { installMediaClock, mediaDurations } from '../smoke/media-clock.js';
import {
  type ElementSnapshot,
  POSITION_TOLERANCE_S,
  type Scenario,
  type ScenarioStepResult,
} from '../smoke/scenario.js';
import { smokeFile } from '../smoke/smoke-command.js';
import type { SmokeResult } from '../smoke/smoke-runner.js';

const EVENTS = ['loadedmetadata', 'canplay', 'seeking', 'seeked', 'timeupdate', 'playing', 'ended'];

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('installMediaClock', () => {
  let window: Window & typeof globalThis;
  let restore: (() => void) | undefined;

  beforeAll(async () => {
    window = await smokeWindow();
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
    window.document.body.innerHTML = '';
  });

  /** A `<video>` with one `<source>`, in the body, the clock installed with `durations`. */
  function video(durations: Record<string, number>): {
    element: HTMLVideoElement;
    events: string[];
  } {
    restore = installMediaClock(window, src => durations[src]);
    const element = window.document.createElement('video');
    const source = window.document.createElement('source');
    source.setAttribute('src', 'media/intro.mp4');
    source.setAttribute('type', 'video/mp4');
    element.appendChild(source);
    window.document.body.appendChild(element);
    const events: string[] = [];
    for (const name of EVENTS) element.addEventListener(name, () => events.push(name));
    return { element, events };
  }

  /** Resolves on the next `name` event of `element`. */
  const next = (element: HTMLMediaElement, name: string) =>
    new Promise<void>(resolve => element.addEventListener(name, () => resolve(), { once: true }));

  it('canPlayType answers maybe', () => {
    const { element } = video({});
    expect(element.canPlayType('video/mp4')).toBe('maybe');
  });

  it('load() sets the duration from the first <source> and fires loadedmetadata then canplay', async () => {
    const { element, events } = video({ 'media/intro.mp4': 30 });
    expect(element.readyState).toBe(0);
    expect(Number.isNaN(element.duration)).toBe(true);
    expect(element.seekable.length).toBe(0);
    const canplay = next(element, 'canplay');
    element.load();
    await canplay;
    expect(element.duration).toBe(30);
    expect(element.readyState).toBe(4);
    expect(element.seekable.length).toBe(1);
    expect(element.seekable.start(0)).toBe(0);
    expect(element.seekable.end(0)).toBe(30);
    expect(element.error).toBeNull();
    expect(events).toEqual(['loadedmetadata', 'canplay']);
  });

  it('setting currentTime clamps and fires seeking, then seeked and timeupdate', async () => {
    const { element, events } = video({ 'media/intro.mp4': 30 });
    const canplay = next(element, 'canplay');
    element.load();
    await canplay;
    events.length = 0;
    const timeupdate = next(element, 'timeupdate');
    element.currentTime = 40;
    expect(element.currentTime).toBe(30);
    await timeupdate;
    expect(events).toEqual(['seeking', 'seeked', 'timeupdate']);
  });

  it('play() fires playing and advances; pause() stops', async () => {
    const { element, events } = video({ 'media/intro.mp4': 30 });
    const canplay = next(element, 'canplay');
    element.load();
    await canplay;
    expect(element.paused).toBe(true);
    const playing = next(element, 'playing');
    await element.play();
    expect(element.paused).toBe(false);
    await playing;
    await delay(300);
    element.pause();
    const position = element.currentTime;
    expect(position).toBeGreaterThan(0);
    expect(element.paused).toBe(true);
    expect(events).toContain('playing');
    expect(events).toContain('timeupdate');
    await delay(200);
    expect(element.currentTime).toBe(position);
  });

  it('ends at duration with ended', async () => {
    const { element, events } = video({ 'media/intro.mp4': 0.2 });
    const canplay = next(element, 'canplay');
    element.load();
    await canplay;
    const ended = next(element, 'ended');
    await element.play();
    await ended;
    expect(element.currentTime).toBe(0.2);
    expect(element.paused).toBe(true);
    expect(events[events.length - 1]).toBe('ended');
  });

  it('the restore puts back the original descriptors', () => {
    const prototype = window.HTMLMediaElement.prototype;
    const names = [
      'duration',
      'currentTime',
      'readyState',
      'seekable',
      'paused',
      'error',
      'canPlayType',
      'load',
      'play',
      'pause',
    ];
    const before = names.map(name => Object.getOwnPropertyDescriptor(prototype, name));
    const currentTime = Object.getOwnPropertyDescriptor(prototype, 'currentTime');
    const undo = installMediaClock(window, () => 1);
    expect(Object.getOwnPropertyDescriptor(prototype, 'currentTime')).not.toEqual(currentTime);
    undo();
    expect(Object.getOwnPropertyDescriptor(prototype, 'currentTime')).toEqual(currentTime);
    expect(names.map(name => Object.getOwnPropertyDescriptor(prototype, name))).toEqual(before);
  });
});

describe('mediaDurations', () => {
  it('maps each media timeline source src to the timeline duration', () => {
    const timeline = (uri: string, type: 'animation' | 'mediaplayer', duration: number) => ({
      id: uri,
      uri,
      type,
      duration,
      loop: false,
      selector: '#stage',
      timelineActions: [],
    });
    const config = {
      timelines: [
        {
          ...timeline('intro', 'mediaplayer', 30),
          positionSource: {
            selector: '#stage',
            sources: [{ src: 'media/intro.mp4', type: 'video/mp4' }],
          },
        },
        {
          ...timeline('voice', 'mediaplayer', 12.5),
          positionSource: {
            selector: '#stage',
            sources: [
              { src: 'media/voice.mp3', type: 'audio/mpeg' },
              { src: 'media/voice.ogg', type: 'audio/ogg' },
            ],
          },
        },
        timeline('main', 'animation', 10),
      ],
    } as unknown as IEngineConfiguration;
    expect([...mediaDurations(config)]).toEqual([
      ['media/intro.mp4', 30],
      ['media/voice.mp3', 12.5],
      ['media/voice.ogg', 12.5],
    ]);
  });
});

/** One directory per media kind: a raf hub, then a media timeline with captions as ranges. */
const MEDIA_FIXTURES = path.join(__dirname, '__fixtures__', 'mcp', 'smoke-media');
const KINDS = [
  { kind: 'video', timeline: 'film', media: 'media/intro.mp4' },
  { kind: 'audio', timeline: 'song', media: 'media/song.mp3' },
] as const;

/** Smoke one fixture in-process (json format: no streaming), with an optional scenario. */
const smokeMedia = (kind: string, scenario?: Scenario): Promise<SmokeResult> =>
  smokeFile(path.join(MEDIA_FIXTURES, kind, 'main.eligian'), {
    format: 'json',
    strict: false,
    cwd: MEDIA_FIXTURES,
    ...(scenario ? { scenario } : {}),
  });

const labelled = (result: SmokeResult, label: string): ScenarioStepResult => {
  const step = result.steps?.find(candidate => candidate.label === label);
  if (!step) throw new Error(`no step '${label}': ${JSON.stringify(result)}`);
  return step;
};

describe('media timelines', () => {
  it('video and audio timelines are walked', async () => {
    for (const { kind } of KINDS) {
      const result = await smokeMedia(kind);
      expect(result.problems).toEqual([]);
      expect(result.timelines).toHaveLength(2);
      for (const timeline of result.timelines) {
        expect(timeline.boundaries).toBeGreaterThan(0);
        expect(timeline).not.toHaveProperty('skipped');
      }
    }
  });

  it('seek 12 lands within tolerance, caption visible', async () => {
    for (const { kind, timeline } of KINDS) {
      const result = await smokeMedia(kind, {
        steps: [{ navigate: timeline }, { seek: 12 }, { snapshot: 'at-12' }],
        assertions: [
          { after: 'at-12', timeline },
          { after: 'at-12', selector: '#caption-2', visible: true },
          { after: 'at-12', selector: '#caption-1', visible: false },
        ],
      });
      expect(result.problems).toEqual([]);
      const step = labelled(result, 'at-12');
      expect(step.timeline).toBe(timeline);
      expect(Math.abs(step.position - 12)).toBeLessThanOrEqual(POSITION_TOLERANCE_S);
      expect((step.snapshot['caption-2'] as ElementSnapshot).visible).toBe(true);
    }
  });

  it('play, wait 500, pause advances', async () => {
    const result = await smokeMedia('video', {
      steps: [
        { navigate: 'film' },
        { click: '#pause' },
        { snapshot: 'before' },
        { click: '#play' },
        { wait: 500 },
        { click: '#pause' },
        { snapshot: 'after' },
      ],
      assertions: [{ after: 'after', position: { greaterThan: 'before' } }],
    });
    expect(result.problems).toEqual([]);
    expect(labelled(result, 'after').position).toBeGreaterThan(labelled(result, 'before').position);
  });

  it('walks with the media file absent', async () => {
    for (const { kind, media } of KINDS) {
      expect(fs.existsSync(path.join(MEDIA_FIXTURES, kind, media))).toBe(false);
      const result = await smokeMedia(kind);
      expect(result.problems).toEqual([]);
      const walked = result.timelines.find(t => t.name.endsWith(path.basename(media)));
      expect(walked?.boundaries).toBeGreaterThan(0);
    }
  });
});
