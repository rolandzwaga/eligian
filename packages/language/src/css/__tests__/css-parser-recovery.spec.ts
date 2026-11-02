/**
 * parseCSS syntax-error recovery (audit finding #37).
 *
 * One mid-edit syntax error must not make every class/ID of the stylesheet "unknown":
 * the readable rules keep contributing their classes and IDs, and the error is still reported.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCSS } from '../css-parser.js';

describe('parseCSS syntax error recovery', () => {
  it('keeps classes and ids of rules before an unclosed block', () => {
    const css = '.btn { color: red; }\n#hero { margin: 0; }\n.broken { color: blue;';
    const result = parseCSS(css, 'styles.css');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.classes.has('btn')).toBe(true);
    expect(result.classes.has('broken')).toBe(true);
    expect(result.ids.has('hero')).toBe(true);
  });

  it('keeps rules that follow a stray closing brace', () => {
    const css = '.a { color: red; }\n}\n.b { color: blue; }\n.c { color: green; }';
    const result = parseCSS(css, 'styles.css');

    expect(result.errors.length).toBeGreaterThan(0);
    expect([...result.classes].sort()).toEqual(['a', 'b', 'c']);
  });

  it('recovers selectors inside @media blocks and from selector lists', () => {
    const css = '@media (min-width: 1px) { .wide, .wider > #main { color: red; } }\n.open {';
    const result = parseCSS(css, 'styles.css');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.classes.has('wide')).toBe(true);
    expect(result.classes.has('wider')).toBe(true);
    expect(result.ids.has('main')).toBe(true);
    expect(result.classes.has('open')).toBe(true);
  });

  it('ignores braces and selectors inside comments and strings', () => {
    const css = '/* .commented { } */\n.real { content: "{ .fake }"; }\n.unclosed {';
    const result = parseCSS(css, 'styles.css');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.classes.has('real')).toBe(true);
    expect(result.classes.has('unclosed')).toBe(true);
    expect(result.classes.has('commented')).toBe(false);
    expect(result.classes.has('fake')).toBe(false);
  });

  it('records locations and rule text for recovered classes', () => {
    const css = '.a { color: red; }\n\n  .b { color: blue; }\n.c {';
    const result = parseCSS(css, 'styles.css');

    expect(result.classLocations.get('b')).toMatchObject({
      filePath: 'styles.css',
      startLine: 3,
      startColumn: 3,
    });
    expect(result.classRules.get('b')).toBe('.b { color: blue; }');
  });

  it('still reports the syntax error first', () => {
    const result = parseCSS('.a { color: red; }\n.b {', 'styles.css');
    expect(result.errors[0].message).toBeTruthy();
    expect(result.errors[0].line).toBeGreaterThan(0);
  });

  it('returns nothing for content without any readable selector', () => {
    const result = parseCSS('{ { { invalid CSS { { {', 'styles.css');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.classes.size).toBe(0);
    expect(result.ids.size).toBe(0);
  });

  it('does not recover classes from an unterminated comment', () => {
    const result = parseCSS('/* open\n.button { color: blue; }', 'styles.css');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.classes.size).toBe(0);
  });
});

describe('parseCSS recovery with @import', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'eligian-css-recovery-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('still merges @imported stylesheets when the importing file has a syntax error', () => {
    writeFileSync(path.join(dir, 'base.css'), '.base { color: red; }');
    const content = '@import "./base.css";\n.local { color: blue; }\n.broken {';
    const main = path.join(dir, 'main.css');
    writeFileSync(main, content);

    const result = parseCSS(content, main);

    expect(result.errors[0].message).toBeTruthy();
    expect(result.classes.has('base')).toBe(true);
    expect(result.classes.has('local')).toBe(true);
    expect(result.importedFiles).toEqual([path.join(dir, 'base.css')]);
  });

  it('does not follow imports when followImports is false', () => {
    writeFileSync(path.join(dir, 'base.css'), '.base { color: red; }');
    const content = '@import "./base.css";\n.broken {';
    const main = path.join(dir, 'main.css');

    const result = parseCSS(content, main, { followImports: false });

    expect(result.classes.has('base')).toBe(false);
  });
});
