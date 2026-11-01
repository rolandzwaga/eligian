/**
 * Project starters (audit idea #12). That every starter checks clean is
 * tested in the CLI (init.spec.ts); here: the files and their contents.
 */
import { describe, expect, test } from 'vitest';
import { findStarter, packageNameFor, STARTERS, starterFiles } from '../starters.js';

describe('project starters', () => {
  test.each(STARTERS.map(starter => starter.name))('%s has the project files', name => {
    const files = starterFiles(name, { title: 'Demo Talk' });
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'main.eligian',
        'layout.html',
        'styles.css',
        'locales.json',
        'package.json',
        'README.md',
      ])
    );
    // The JSON files parse, the locales cover the declared languages
    expect(Object.keys(JSON.parse(files['locales.json']))).toEqual(['en-US', 'nl-NL']);
    const pkg = JSON.parse(files['package.json']);
    expect(pkg.name).toBe('demo-talk');
    expect(pkg.scripts.check).toBe('eligian check main.eligian');
    expect(files['main.eligian']).toMatch(/^languages \{/);
  });

  test('the title is used, with a default', () => {
    expect(starterFiles('blank', { title: 'Hello' })['main.eligian']).toContain('timeline "Hello"');
    expect(starterFiles('blank')['main.eligian']).toContain('timeline "My Presentation"');
  });

  test('the library starter has a library file', () => {
    const files = starterFiles('library');
    expect(files['lib/effects.eligian']).toMatch(/^library effects/);
    expect(files['main.eligian']).toContain('from "./lib/effects.eligian"');
  });

  test('package names and lookup', () => {
    expect(packageNameFor('My Talk!')).toBe('my-talk');
    expect(packageNameFor('!!!')).toBe('presentation');
    expect(findStarter('video')?.notes).toEqual([expect.stringContaining('media/intro.mp4')]);
    expect(findStarter('slides')).toBeUndefined();
  });
});
