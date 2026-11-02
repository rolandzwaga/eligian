import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractImportTarget, parseCSS } from '../css-parser.js';

/**
 * Audit finding #35: parseCSS ignored @import, so classes of imported stylesheets
 * were reported as unknown.
 */
describe('parseCSS @import handling', () => {
  let dir: string;

  const write = (name: string, content: string): string => {
    const full = path.join(dir, name);
    writeFileSync(full, content);
    return full;
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'eligian-css-import-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('merges classes and ids from an @import with a bare string', () => {
    write('buttons.css', '.btn-primary { color: red; } #hero { margin: 0; }');
    const main = write('main.css', '@import "./buttons.css";\n.local { color: blue; }');

    const result = parseCSS('@import "./buttons.css";\n.local { color: blue; }', main);

    expect(result.classes.has('btn-primary')).toBe(true);
    expect(result.classes.has('local')).toBe(true);
    expect(result.ids.has('hero')).toBe(true);
    expect(result.classLocations.get('btn-primary')?.filePath).toBe(path.join(dir, 'buttons.css'));
    expect(result.importedFiles).toEqual([path.join(dir, 'buttons.css')]);
    expect(result.errors).toHaveLength(0);
  });

  it('supports url() and single-quoted forms with trailing conditions', () => {
    write('a.css', '.a { color: red; }');
    write('b.css', '.b { color: red; }');
    const content = `@import url("./a.css") screen;\n@import 'b.css' layer(x);`;
    const main = write('main.css', content);

    const result = parseCSS(content, main);

    expect(result.classes.has('a')).toBe(true);
    expect(result.classes.has('b')).toBe(true);
  });

  it('follows nested imports transitively', () => {
    write('c.css', '.c { color: red; }');
    write('b.css', '@import "./c.css"; .b { color: red; }');
    const content = '@import "./b.css";';
    const main = write('main.css', content);

    const result = parseCSS(content, main);

    expect(result.classes.has('b')).toBe(true);
    expect(result.classes.has('c')).toBe(true);
  });

  it('survives import cycles', () => {
    write('a.css', '@import "./main.css"; .a { color: red; }');
    const content = '@import "./a.css"; .main { color: red; }';
    const main = write('main.css', content);

    const result = parseCSS(content, main);

    expect(result.classes.has('a')).toBe(true);
    expect(result.classes.has('main')).toBe(true);
  });

  it('ignores remote and missing imports without erroring', () => {
    const content =
      '@import "https://example.com/x.css"; @import "./missing.css"; .ok { color: red; }';
    const main = write('main.css', content);

    const result = parseCSS(content, main);

    expect(result.classes.has('ok')).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('does not follow imports when followImports is false', () => {
    write('buttons.css', '.btn { color: red; }');
    const content = '@import "./buttons.css";';
    const main = write('main.css', content);

    expect(parseCSS(content, main, { followImports: false }).classes.size).toBe(0);
  });

  it('reports syntax errors of imported stylesheets', () => {
    write('bad.css', '.bad { color: red;');
    const content = '@import "./bad.css";';
    const main = write('main.css', content);

    const result = parseCSS(content, main);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('bad.css');
  });

  it('extractImportTarget parses supported forms', () => {
    expect(extractImportTarget('"./x.css"')).toBe('./x.css');
    expect(extractImportTarget("'x.css' screen")).toBe('x.css');
    expect(extractImportTarget('url(x.css)')).toBe('x.css');
    expect(extractImportTarget('url("./x.css?v=1") layer(a)')).toBe('./x.css');
    expect(extractImportTarget('url(https://a/b.css)')).toBeUndefined();
    expect(extractImportTarget('"//cdn/x.css"')).toBeUndefined();
    expect(extractImportTarget('')).toBeUndefined();
  });
});

describe('CSSRegistryService.getFilesImporting (audit #35 hot reload)', () => {
  it('finds the registered stylesheets that @import a file, directly or transitively', async () => {
    const { URI } = await import('langium');
    const { CSSRegistryService } = await import('../css-registry.js');
    const dir = mkdtempSync(path.join(tmpdir(), 'eligian-css-importers-'));
    try {
      const write = (name: string, content: string): string => {
        const full = path.join(dir, name);
        writeFileSync(full, content);
        return full;
      };
      const c = write('c.css', '.c {}');
      write('b.css', '@import "./c.css"; .b {}');
      const main = write('main.css', '@import "./b.css"; .m {}');
      const other = write('other.css', '.o {}');

      const registry = new CSSRegistryService();
      const mainUri = URI.file(main).toString();
      const otherUri = URI.file(other).toString();
      registry.updateCSSFile(mainUri, parseCSS('@import "./b.css"; .m {}', main));
      registry.updateCSSFile(otherUri, parseCSS('.o {}', other));

      expect(registry.getFilesImporting(URI.file(path.join(dir, 'b.css')).toString())).toEqual([
        mainUri,
      ]);
      expect(registry.getFilesImporting(URI.file(c).toString())).toEqual([mainUri]);
      expect(registry.getFilesImporting(otherUri)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
