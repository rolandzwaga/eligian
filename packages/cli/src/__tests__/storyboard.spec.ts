/**
 * Spec 058 Phase 2 (FR-025; plan D3): the STORYBOARD.md table reader behind the `storyboard`
 * section of `eligian_project`.
 */
import { describe, expect, it } from 'vitest';
import { readStoryboard } from '../mcp/storyboard.js';

const BEAT_HEADER = '| timeline | start | end | selector | change | end-block |';
const BEAT_SEPARATOR = '|---|---|---|---|---|---|';
const INTERACTION_HEADER = '| trigger | target | verb | timeline |';
const INTERACTION_SEPARATOR = '|---|---|---|---|';

const twoBeatTables = [
  '# Storyboard',
  '',
  'Audience: everyone.',
  '',
  '```',
  BEAT_HEADER,
  BEAT_SEPARATOR,
  '| Intro    | 1     | 8   | #headline | addClass in | removeClass in |',
  '| Intro | 2 | 4 | #sub | fade in | fade out |',
  '|Intro|4|6|#logo|show|hide|',
  '```',
  '',
  '```',
  BEAT_HEADER,
  BEAT_SEPARATOR,
  '| Outro | 0 | 3 | #bye | addClass on | removeClass on |',
  '| Outro | 3 | 5 | #end | show | |',
  '```',
].join('\n');

describe('readStoryboard', () => {
  it('reads beat tables', () => {
    const storyboard = readStoryboard(twoBeatTables);
    expect(storyboard.beats).toHaveLength(5);
    expect(storyboard.beats[0]).toEqual({
      timeline: 'Intro',
      start: '1',
      end: '8',
      selector: '#headline',
      change: 'addClass in',
      endBlock: 'removeClass in',
    });
    expect(storyboard.beats[2]).toEqual({
      timeline: 'Intro',
      start: '4',
      end: '6',
      selector: '#logo',
      change: 'show',
      endBlock: 'hide',
    });
    expect(storyboard.beats.map(beat => beat.timeline)).toEqual([
      'Intro',
      'Intro',
      'Intro',
      'Outro',
      'Outro',
    ]);
    expect(storyboard.beats[4].endBlock).toBe('');
    expect(storyboard.interactions).toBe(0);
    expect(storyboard.ignoredRows).toBe(0);
  });

  it('counts interactions', () => {
    const text = [
      '## interactions',
      '',
      INTERACTION_HEADER,
      INTERACTION_SEPARATOR,
      '| click | #next | navigate | Outro |',
      '| key ArrowRight | | play | Intro |',
    ].join('\n');
    expect(readStoryboard(text)).toEqual({
      beats: [],
      interactions: 2,
      interactionRows: [
        { trigger: 'click', target: '#next', verb: 'navigate', timeline: 'Outro' },
        { trigger: 'key ArrowRight', target: '', verb: 'play', timeline: 'Intro' },
      ],
      ignoredRows: 0,
      header: {},
      views: [],
    });
  });

  it('returns interaction rows', () => {
    const text = [
      INTERACTION_HEADER,
      INTERACTION_SEPARATOR,
      '| click #to-problem | Problem | navigate | Hub |',
      '|  key ArrowRight | slide-2 |navigate| slide-1  |',
      '| click #answer-b | score("b") | run | Quiz |',
    ].join('\n');
    const storyboard = readStoryboard(text);
    expect(storyboard.interactionRows).toEqual([
      { trigger: 'click #to-problem', target: 'Problem', verb: 'navigate', timeline: 'Hub' },
      { trigger: 'key ArrowRight', target: 'slide-2', verb: 'navigate', timeline: 'slide-1' },
      { trigger: 'click #answer-b', target: 'score("b")', verb: 'run', timeline: 'Quiz' },
    ]);
    expect(storyboard.interactions).toBe(3);
  });

  it('accepts CRLF', () => {
    const lf = `${twoBeatTables}\n\n${INTERACTION_HEADER}\n${INTERACTION_SEPARATOR}\n| click | #a | play | Intro |\n`;
    const crlf = lf.replace(/\n/g, '\r\n');
    const fromCrlf = readStoryboard(crlf);
    expect(fromCrlf).toEqual(readStoryboard(lf));
    expect(fromCrlf.beats).toHaveLength(5);
    expect(fromCrlf.beats[0].endBlock).toBe('removeClass in');
    expect(fromCrlf.interactions).toBe(1);
  });

  it('counts rows with another cell count in ignoredRows', () => {
    const text = [
      BEAT_HEADER,
      BEAT_SEPARATOR,
      '| Intro | 1 | 8 | #headline | addClass in | removeClass in |',
      '| Intro | 8 | 9 | #oops | missing end-block |',
    ].join('\n');
    const storyboard = readStoryboard(text);
    expect(storyboard.ignoredRows).toBe(1);
    expect(storyboard.beats).toHaveLength(1);
    expect(storyboard.beats.map(beat => beat.selector)).not.toContain('#oops');
  });

  it('ignores other tables and prose', () => {
    const text = [
      '# Storyboard',
      '',
      '| name | value |',
      '|------|-------|',
      '| provider | raf |',
      '| a | b | c |',
      '',
      'Some prose | with a pipe in it.',
      '',
      '- a list item',
      '',
      BEAT_HEADER,
      BEAT_SEPARATOR,
      '| Intro | 1 | 2 | #a | x | y |',
      '',
      'More prose.',
      '| timeline | start | end | selector | change | end-block |',
    ].join('\n');
    const storyboard = readStoryboard(text);
    expect(storyboard.beats).toHaveLength(1);
    expect(storyboard.interactions).toBe(0);
    expect(storyboard.ignoredRows).toBe(0);
  });

  it('never throws', () => {
    expect(readStoryboard('')).toEqual({
      beats: [],
      interactions: 0,
      interactionRows: [],
      ignoredRows: 0,
      header: {},
      views: [],
    });
    expect(() => readStoryboard('|')).not.toThrow();
    expect(() => readStoryboard('||||\n|\n| |')).not.toThrow();
    expect(() => readStoryboard(`${BEAT_HEADER}\n|\n||\n| | | | | | | |`)).not.toThrow();
  });
});

describe('header and views (FR-030)', () => {
  const template = [
    '# Storyboard: Orbit teaser',
    '',
    '-  audience:  visitors of the product page, desktop  ',
    '- provider: raf (no media; the views are timed text)',
    '- languages: en-US (default), nl-NL',
    '- assets: media/intro.mp4, assets/logo.svg',
    '- host module: none',
    '- provider: video (a second provider line is not read)',
    '',
    '## view Intro (container #stage)',
    '',
    'enter: show #intro',
    '',
    BEAT_HEADER,
    BEAT_SEPARATOR,
    '| Intro | 0 | 6 | #headline | addClass is-visible | removeClass is-visible |',
    '',
    '## view Hub & Spokes',
    '',
    '## view Details  (container #details)',
    '',
    '## views are not a view heading',
    '### view Nested is not one either',
    '',
    '## interactions',
    '',
    INTERACTION_HEADER,
    INTERACTION_SEPARATOR,
    '| click #next | Details | navigate | Intro |',
  ].join('\n');

  it('reads - provider:, - languages:, - assets:, - host module:, - audience: outside tables, first occurrence, trimmed; undefined when absent', () => {
    expect(readStoryboard(template).header).toEqual({
      audience: 'visitors of the product page, desktop',
      provider: 'raf (no media; the views are timed text)',
      languages: 'en-US (default), nl-NL',
      assets: 'media/intro.mp4, assets/logo.svg',
      hostModule: 'none',
    });
    const partial = readStoryboard(
      [
        '- provider: scroll',
        '| - languages: en-US | inside a table |',
        '|---|---|',
        '| - assets: x.png | y |',
        'prose - audience: not a list item',
      ].join('\n')
    );
    expect(partial.header).toEqual({ provider: 'scroll' });
    expect(partial.header.languages).toBeUndefined();
    expect(partial.header.assets).toBeUndefined();
    expect(partial.header.hostModule).toBeUndefined();
    expect(partial.header.audience).toBeUndefined();
    expect(readStoryboard('- host module:\n').header).toEqual({ hostModule: '' });
    expect(readStoryboard('# Storyboard\n').header).toEqual({});
  });

  it('views are the ## view headings in order, the text before " (container"', () => {
    expect(readStoryboard(template).views).toEqual(['Intro', 'Hub & Spokes', 'Details']);
    const crlf = readStoryboard(template.replace(/\n/g, '\r\n'));
    expect(crlf.views).toEqual(['Intro', 'Hub & Spokes', 'Details']);
    expect(crlf.header).toEqual(readStoryboard(template).header);
    expect(readStoryboard('## view intro\n## view Intro\n## view intro').views).toEqual([
      'intro',
      'Intro',
      'intro',
    ]);
  });

  it('the existing fields are unchanged', () => {
    const storyboard = readStoryboard(template);
    expect(storyboard.beats).toEqual([
      {
        timeline: 'Intro',
        start: '0',
        end: '6',
        selector: '#headline',
        change: 'addClass is-visible',
        endBlock: 'removeClass is-visible',
      },
    ]);
    expect(storyboard.interactions).toBe(1);
    expect(storyboard.interactionRows).toEqual([
      { trigger: 'click #next', target: 'Details', verb: 'navigate', timeline: 'Intro' },
    ]);
    expect(storyboard.ignoredRows).toBe(0);
    const { header: _header, views: _views, ...rest } = readStoryboard(twoBeatTables);
    expect(Object.keys(rest).sort()).toEqual([
      'beats',
      'ignoredRows',
      'interactionRows',
      'interactions',
    ]);
  });

  it('never throws', () => {
    // A seeded generator (mulberry32) over the characters the reader looks at.
    let seed = 0x5eed;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pieces = ['|', '-', ' ', '\n', '\r\n', '#', '## view ', ' (container', ':', '|', 'a'];
    const words = ['- provider:', '- languages:', '- host module:', '- assets:', '- audience:'];
    for (let n = 0; n < 500; n++) {
      let text = '';
      const length = Math.floor(random() * 80);
      for (let i = 0; i < length; i++) {
        const from = random() < 0.2 ? words : pieces;
        text += from[Math.floor(random() * from.length)];
      }
      expect(() => readStoryboard(text)).not.toThrow();
    }
  });
});
