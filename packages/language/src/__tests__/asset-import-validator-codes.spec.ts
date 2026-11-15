/**
 * Asset errors reported on the program (spec 058, Phase 0: FR-003, plan R8).
 *
 * `ProgramAssetImportValidator.checkAssetLoading` reports an asset error at its import node, or on
 * the program when no import node has the error's path. Every asset error `loadProgramAssets`
 * produces carries its import's path, so no fixture reaches the program branch: this spec stubs
 * `loadProgramAssets` with an error whose path matches no import and checks the code.
 */

import type { ValidationAcceptor } from 'langium';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadProgramAssets } from '../asset-loading/compiler-integration.js';
import {
  type AssetError,
  createCssImportError,
  createCssParseError,
  createHtmlImportError,
  createLocalesImportError,
  createMediaImportError,
} from '../errors/index.js';
import type { Program } from '../generated/ast.js';
import { ProgramAssetImportValidator } from '../validators/program/asset-import-validator.js';
import { createTestContext, type TestContext } from './test-helpers.js';

vi.mock('../asset-loading/compiler-integration.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../asset-loading/compiler-integration.js')>()),
  loadProgramAssets: vi.fn(),
}));

/** A path that no import node of the program below names. */
const UNMATCHED = './elsewhere.asset';
const location = { file: '/project/main.eligian', line: 1, column: 1 };
const fileError = { filePath: UNMATCHED, absolutePath: '/project/elsewhere.asset', location };

const ERRORS: readonly (readonly [AssetError['_tag'], AssetError, string])[] = [
  [
    'HtmlImportError',
    createHtmlImportError({ ...fileError, message: 'html missing' }),
    'html-import-error',
  ],
  [
    'CssImportError',
    createCssImportError({ ...fileError, message: 'css missing' }),
    'css-import-error',
  ],
  [
    'CssParseError',
    createCssParseError({ filePath: UNMATCHED, message: 'unclosed block', line: 1, column: 1 }),
    'css-parse-error',
  ],
  [
    'MediaImportError',
    createMediaImportError({ ...fileError, message: 'media missing' }),
    'media-import-error',
  ],
  [
    'LocalesImportError',
    createLocalesImportError({ ...fileError, message: 'locales missing' }),
    'locales-import-error',
  ],
];

describe('ProgramAssetImportValidator: asset error without an import node', () => {
  let ctx: TestContext;
  let program: Program;

  beforeAll(async () => {
    ctx = createTestContext();
    const document = await ctx.parse(
      `styles "./present.css"
timeline "t" in "#app" using raf {
}`,
      { documentUri: 'file:///project/asset-import-validator-codes.eligian' }
    );
    program = document.parseResult.value;
  });

  it.each(ERRORS)('%s → reported on the program with its asset code', (_tag, error, code) => {
    vi.mocked(loadProgramAssets).mockReturnValue({ cssFiles: [], importMap: {}, errors: [error] });
    const reported: { node: unknown; code: unknown }[] = [];
    const accept: ValidationAcceptor = (_severity, _message, info) => {
      reported.push({ node: info.node, code: info.code });
    };

    new ProgramAssetImportValidator(ctx.services.Eligian).checkAssetLoading(program, accept);

    expect(reported.map(r => r.code)).toEqual([code]);
    expect(reported[0].node).toBe(program);
  });
});
