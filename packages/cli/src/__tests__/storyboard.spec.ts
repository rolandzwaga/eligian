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
    expect(readStoryboard(text)).toEqual({ beats: [], interactions: 2, ignoredRows: 0 });
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
    expect(readStoryboard('')).toEqual({ beats: [], interactions: 0, ignoredRows: 0 });
    expect(() => readStoryboard('|')).not.toThrow();
    expect(() => readStoryboard('||||\n|\n| |')).not.toThrow();
    expect(() => readStoryboard(`${BEAT_HEADER}\n|\n||\n| | | | | | | |`)).not.toThrow();
  });
});
