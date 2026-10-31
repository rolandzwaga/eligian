/**
 * Preview hot reload of @import-ed stylesheets (audit 2026-10-22, medium #35).
 *
 * The preview injects only the program's CSS files; a sheet they `@import` is loaded by the
 * webview through its importer. collectCSSImporters maps each imported sheet to its importers so
 * the preview can watch it and reload the importers when it changes.
 */

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectCSSImporters } from '../css-loader.js';

describe('collectCSSImporters', () => {
  const root = path.resolve('/workspace/styles');
  const files: Record<string, string> = {
    [path.join(root, 'main.css')]: '@import "./buttons.css";\n.m {}',
    [path.join(root, 'buttons.css')]: '@import url("./icons.css");\n.btn {}',
    [path.join(root, 'icons.css')]: '.icon {}',
    [path.join(root, 'theme.css')]: '@import "./buttons.css";\n.t {}',
    [path.join(root, 'plain.css')]: '.p {}',
  };
  const readFile = (file: string): string => {
    const content = files[path.resolve(file)];
    if (content === undefined) throw new Error(`ENOENT: ${file}`);
    return content;
  };

  it('maps direct and transitive imports to every injected file importing them', () => {
    const main = path.join(root, 'main.css');
    const theme = path.join(root, 'theme.css');
    const importers = collectCSSImporters([main, theme, path.join(root, 'plain.css')], readFile);

    expect([...importers.keys()].sort()).toEqual(
      [path.join(root, 'buttons.css'), path.join(root, 'icons.css')].sort()
    );
    expect([...(importers.get(path.join(root, 'buttons.css')) ?? [])].sort()).toEqual(
      [main, theme].sort()
    );
    expect([...(importers.get(path.join(root, 'icons.css')) ?? [])].sort()).toEqual(
      [main, theme].sort()
    );
  });

  it('skips unreadable files', () => {
    expect(collectCSSImporters([path.join(root, 'missing.css')], readFile).size).toBe(0);
  });
});
