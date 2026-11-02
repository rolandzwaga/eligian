/**
 * Regression tests for the 2026-10-22 audit (medium findings #32 and #36).
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { parseCSS } from '../../css/css-parser.js';
import type { Program } from '../../generated/ast.js';
import { resolveImportPathToUri } from '../../utils/path-utils.js';
import { createAssetValidationService, loadProgramAssets } from '../compiler-integration.js';
import type { IAssetLoader } from '../interfaces.js';
import { NodeAssetLoader } from '../node-asset-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('audit #32: CssParseError matches the import path', () => {
  let ctx: TestContext;
  let dir: string;

  beforeAll(() => {
    ctx = createTestContext();
    dir = mkdtempSync(join(tmpdir(), 'eligian-css-parse-'));
    writeFileSync(join(dir, 'theme.css'), '.container {\n  color: red;\n', 'utf-8');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the relative import path as filePath and keeps the absolute path separately', () => {
    const absolute = join(dir, 'theme.css');
    const errors = createAssetValidationService().validateAsset(
      'css',
      absolute,
      join(dir, 'main.eligian'),
      './theme.css'
    );

    const parseError = errors.find(e => e._tag === 'CssParseError');
    expect(parseError).toBeDefined();
    if (parseError?._tag === 'CssParseError') {
      expect(parseError.filePath).toBe('./theme.css');
      expect(parseError.absolutePath).toBe(absolute);
    }
  });

  it('reports a CSS syntax error as a diagnostic on the import (LSP path)', async () => {
    const uri = pathToFileURL(join(dir, 'main.eligian')).toString();
    const document = await ctx.parse(`styles "./theme.css"\n`, { documentUri: uri });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const cssErrors = (document.diagnostics ?? []).filter(
      d => d.severity === DiagnosticSeverity.Error && d.message.includes('CSS validation error')
    );
    expect(cssErrors.length).toBeGreaterThan(0);
    // Anchored on the import's path string, not on the whole program
    expect(cssErrors[0].range.start).toEqual({ line: 0, character: 'styles '.length });
  });

  it('reports one CSS syntax diagnostic when the CSS registry also has the parse errors', async () => {
    // The extension (Parsed phase) and parseSource put the parse errors into the CSS registry;
    // checkCSSImports then reports them too, so checkAssetLoading must not duplicate them.
    const uri = pathToFileURL(join(dir, 'main-registry.eligian')).toString();
    const cssPath = join(dir, 'theme.css');
    const cssUri = resolveImportPathToUri(uri, './theme.css');
    const registry = ctx.services.Eligian.css.CSSRegistry;
    registry.updateCSSFile(cssUri, parseCSS(readFileSync(cssPath, 'utf-8'), cssPath));
    try {
      expect(registry.hasErrors(cssUri)).toBe(true);
      const document = await ctx.parse(`styles "./theme.css"\n`, { documentUri: uri });
      await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

      const cssSyntaxErrors = (document.diagnostics ?? []).filter(
        d =>
          d.severity === DiagnosticSeverity.Error &&
          (d.message.includes('CSS validation error') || d.message.includes('has syntax errors'))
      );
      expect(cssSyntaxErrors).toHaveLength(1);
      expect(cssSyntaxErrors[0].range.start).toEqual({ line: 0, character: 'styles '.length });
    } finally {
      registry.removeCSSFile(cssUri);
    }
  });
});

describe('audit #36: named media imports are not read as text', () => {
  const fixtures = resolve(__dirname, '../__fixtures__/assets');

  it('records the path for a named media import and never calls loadFile for it', async () => {
    const ctx = createTestContext();
    const document = await ctx.parse(`import intro from "./test-video.mp4" as media\n`);
    const program = document.parseResult.value as Program;

    const real = new NodeAssetLoader();
    const loaded: string[] = [];
    const loader: IAssetLoader = {
      fileExists: p => real.fileExists(p),
      loadFile: p => {
        loaded.push(p);
        return real.loadFile(p);
      },
      resolvePath: (base, relative) => real.resolvePath(base, relative),
    };

    const result = loadProgramAssets(
      program,
      resolve(fixtures, 'main.eligian'),
      createAssetValidationService(),
      loader
    );

    expect(result.errors).toEqual([]);
    expect(result.importMap.intro).toBe('./test-video.mp4');
    expect(loaded.filter(p => p.endsWith('test-video.mp4'))).toEqual([]);
  });

  it('still loads text content for named html imports', async () => {
    const ctx = createTestContext();
    const document = await ctx.parse(`import tip from "./valid.html"\n`);
    const result = loadProgramAssets(
      document.parseResult.value as Program,
      resolve(fixtures, 'main.eligian')
    );
    expect(result.importMap.tip).toContain('<');
  });
});
