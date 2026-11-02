/**
 * Regression tests for the 2026-10-22 audit low findings #70 and #78.
 *
 * #70: a drive-root baseDir ('C:/') collapsed to the drive-relative 'C:' and resolved against cwd.
 * #78: normalizePath depended on the host OS (backslash '..' on POSIX, UNC prefixes).
 */
import { describe, expect, it } from 'vitest';
import { normalizePath, resolvePath } from '../src/path-resolver.js';

describe('audit #70: drive-root base directories', () => {
  it('keeps the slash of a drive root in normalizePath', () => {
    expect(normalizePath('C:/')).toBe('C:/');
    expect(normalizePath('C:\\')).toBe('C:/');
    expect(normalizePath('c:/')).toBe('c:/');
  });

  it.each(['C:/', 'C:\\', 'c:/'])('resolves against drive root %s without using cwd', base => {
    const result = resolvePath('./x.css', base);
    expect(result.toLowerCase()).toBe(`${base[0].toLowerCase()}:/x.css`);
  });

  it('cannot escape above a drive root', () => {
    expect(resolvePath('../../x.css', 'C:/')).toBe('C:/x.css');
    expect(normalizePath('C:/a/../..')).toBe('C:/');
  });

  it('still resolves ordinary drive paths', () => {
    expect(resolvePath('../shared/a.css', 'C:/proj/src')).toBe('C:/proj/shared/a.css');
  });
});

describe('audit #78: host independent normalization', () => {
  it('resolves backslash .. segments regardless of host OS', () => {
    expect(normalizePath('C:\\a\\..\\b')).toBe('C:/b');
    expect(normalizePath('a\\b\\..\\c')).toBe('a/c');
  });

  it('preserves the UNC prefix in normalizePath', () => {
    expect(normalizePath('\\\\server\\share\\proj')).toBe('//server/share/proj');
    expect(normalizePath('//server/share/a/../b')).toBe('//server/share/b');
    expect(normalizePath('\\\\server\\share')).toBe('//server/share/');
    expect(normalizePath('//server/share/')).toBe('//server/share/');
  });

  it('does not treat a leading triple slash as UNC', () => {
    expect(normalizePath('///a/b')).toBe('/a/b');
  });

  it('resolves against UNC bases', () => {
    expect(resolvePath('./x.css', '//server/share/dir')).toBe('//server/share/dir/x.css');
    expect(resolvePath('../x.css', '\\\\server\\share\\dir\\sub')).toBe('//server/share/dir/x.css');
    expect(resolvePath('../../../x.css', '//server/share/dir')).toBe('//server/share/x.css');
  });

  it('keeps POSIX behavior unchanged', () => {
    expect(resolvePath('./x.css', '/project/src')).toBe('/project/src/x.css');
    expect(normalizePath('/project//src/../dist/')).toBe('/project/dist');
  });
});
