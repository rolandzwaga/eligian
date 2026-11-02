/**
 * Regression tests for @param parsing edge cases (audit low finding #25):
 * multi-line descriptions, optional names, nested-brace types, `- ` separators,
 * and backticks inside types.
 */
import { describe, expect, it } from 'vitest';
import { formatJSDocAsMarkdown } from '../jsdoc-formatter.js';
import { parseJSDoc } from '../jsdoc-parser.js';

describe('JSDoc @param edge cases', () => {
  it('keeps continuation lines of a multi-line description', () => {
    const result = parseJSDoc(`/**
 * @param {string} selector the target
 *   continues here
 *   and here
 */`);
    expect(result?.params[0]).toEqual({
      type: 'string',
      name: 'selector',
      description: 'the target continues here and here',
    });
  });

  it('parses the optional [name] syntax', () => {
    const result = parseJSDoc(`/**
 * @param [opt] optional thing
 */`);
    expect(result?.params).toEqual([
      { type: undefined, name: 'opt', description: 'optional thing', optional: true },
    ]);
  });

  it('parses optional names with default values and a type', () => {
    const result = parseJSDoc(`/**
 * @param {number} [count=5] - how many
 */`);
    expect(result?.params).toEqual([
      { type: 'number', name: 'count', description: 'how many', optional: true },
    ]);
  });

  it('parses brace-balanced object and generic types', () => {
    const result = parseJSDoc(`/**
 * @param {{a: string}} obj nested object
 * @param {Array<{x: number}>} arr list of points
 */`);
    expect(result?.params).toEqual([
      { type: '{a: string}', name: 'obj', description: 'nested object' },
      { type: 'Array<{x: number}>', name: 'arr', description: 'list of points' },
    ]);
  });

  it('strips a leading "- " separator from the description', () => {
    const result = parseJSDoc(`/**
 * @param duration - ms
 */`);
    expect(result?.params[0].description).toBe('ms');
  });

  it('does not render a doubled dash in the hover markdown', () => {
    const jsdoc = parseJSDoc(`/**
 * @param duration - ms
 */`);
    const markdown = formatJSDocAsMarkdown(jsdoc!, 'fade');
    expect(markdown).toContain('`duration` (`unknown`) - ms');
    expect(markdown).not.toContain('- - ms');
  });

  it('marks optional params in the hover markdown', () => {
    const jsdoc = parseJSDoc(`/**
 * @param [opt] optional thing
 */`);
    const markdown = formatJSDocAsMarkdown(jsdoc!, 'fade');
    expect(markdown).toContain('`opt` (`unknown`) *(optional)* - optional thing');
  });

  it('does not let a backtick in a type break the inline code span', () => {
    const markdown = formatJSDocAsMarkdown(
      { description: '', params: [{ type: 'a`b', name: 'x' }] },
      'fade'
    );
    expect(markdown).toContain("`x` (`a'b`)");
  });

  it('drops a param whose type brace is unterminated', () => {
    const result = parseJSDoc(`/**
 * @param {string name oops
 */`);
    expect(result?.params).toEqual([]);
  });
});
