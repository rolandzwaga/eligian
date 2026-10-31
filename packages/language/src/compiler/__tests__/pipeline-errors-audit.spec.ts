/**
 * Regression tests for the "pipeline-errors" medium findings of the 2026-10-22
 * codebase audit:
 *
 * - #2  Parse errors at end of input got NaN line and column.
 * - #4  Errors raised for imported library actions were reported with no file
 *       and rendered against the main source.
 * - #5  compile() ignored `assets.errors`, relying on a validator that skipped
 *       asset checks for any path containing '/memory/' (or named `<digits>.eligian`).
 * - #11 A property chain in a time expression threw a raw Error (a defect) out of
 *       the Effect pipeline instead of failing with a TransformError.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Cause, Effect, Exit, Option } from 'effect';
import { type LangiumDocument, URI } from 'langium';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestContext, getErrors, type TestContext } from '../../__tests__/test-helpers.js';
import type { SourceLocation } from '../../errors/index.js';
import { formatError } from '../error-reporter.js';
import { type DocumentErrorHints, extractDocumentErrors } from '../pipeline/document-errors.js';
import { type CompileError, compile } from '../pipeline.js';
import { getSourceLocation } from '../transformers/source-location.js';

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error('expected a failure');
  const error = Cause.findErrorOption(exit.cause);
  if (Option.isNone(error)) {
    throw new Error(`expected a typed failure, got a defect: ${Cause.pretty(exit.cause)}`);
  }
  return error.value;
};

/** Every compile error except EmitError carries a source location. */
const locationOf = (error: CompileError): SourceLocation => {
  if (error._tag === 'EmitError') throw new Error('EmitError carries no source location');
  return error.location;
};

const hints: DocumentErrorHints = {
  lexerMessagePrefix: 'Lexer error: ',
  lexerHint: 'lexer',
  parserHint: 'parser',
  diagnosticHint: 'diagnostic',
};

// ---------------------------------------------------------------------------
// #2 Parse errors at end of input
// ---------------------------------------------------------------------------

describe('#2 parse errors at end of input have a finite location', () => {
  test('unexpected EOF is located just after the last token, not at NaN:NaN', async () => {
    const source = 'timeline "main" in "#app" using raf {\n  at 0s..5s f(\n';

    const error = failureOf(await Effect.runPromiseExit(compile(source)));

    expect(error._tag).toBe('ParseError');
    expect(Number.isFinite(locationOf(error).line)).toBe(true);
    expect(Number.isFinite(locationOf(error).column)).toBe(true);
    // Last token is `(` on line 2, column 14 (1-based) → the error sits right after it.
    expect(locationOf(error).line).toBe(2);
    expect(locationOf(error).column).toBe(15);
    expect(locationOf(error).length).toBe(0);

    const formatted = formatError(error, source);
    expect(formatted.message).not.toContain('NaN');
    expect(formatted.message).toContain('at 2:15');
    expect(formatted.codeSnippet).toContain('f(');
  });

  test('EOF token without a usable previous token falls back to the end of the document', async () => {
    const nan = Number.NaN;
    const doc = {
      parseResult: {
        lexerErrors: [],
        parserErrors: [
          {
            message: 'Expecting something but found ``.',
            token: { startOffset: nan, startLine: nan, startColumn: nan, endOffset: nan },
            previousToken: { startOffset: nan, endLine: nan, endColumn: nan },
          },
        ],
        value: {},
      },
      textDocument: {
        getText: () => 'line one\nline two',
        positionAt: (offset: number) =>
          offset >= 9 ? { line: 1, character: offset - 9 } : { line: 0, character: offset },
        offsetAt: () => 0,
      },
      diagnostics: [],
    } as unknown as LangiumDocument;

    const error = failureOf(await Effect.runPromiseExit(extractDocumentErrors(doc, hints)));

    expect(error.location).toEqual({ line: 2, column: 9, length: 0 });
  });

  test('a regular parser error reports the full token length (endOffset is inclusive)', async () => {
    const doc = {
      parseResult: {
        lexerErrors: [],
        parserErrors: [
          {
            message: 'unexpected',
            token: { startOffset: 10, endOffset: 14, startLine: 3, startColumn: 4, image: 'abcde' },
          },
        ],
        value: {},
      },
      diagnostics: [],
    } as unknown as LangiumDocument;

    const error = failureOf(await Effect.runPromiseExit(extractDocumentErrors(doc, hints)));

    expect(error.location).toEqual({ line: 3, column: 4, length: 5 });
  });

  test('multi-line validation diagnostics get an offset-based, non-negative length', async () => {
    const text = 'abc\ndefgh\nij';
    const offsetAt = ({ line, character }: { line: number; character: number }) =>
      [0, 4, 10][line] + character;
    const doc = {
      parseResult: { lexerErrors: [], parserErrors: [], value: {} },
      textDocument: { getText: () => text, offsetAt },
      diagnostics: [
        {
          message: 'spans lines',
          range: { start: { line: 0, character: 2 }, end: { line: 1, character: 1 } },
        },
      ],
    } as unknown as LangiumDocument;

    const error = failureOf(await Effect.runPromiseExit(extractDocumentErrors(doc, hints)));

    // offset 2 → offset 5 = 3 characters (the old single-line maths gave -1)
    expect(error.location).toEqual({ line: 1, column: 3, length: 3 });
  });
});

// ---------------------------------------------------------------------------
// Real files on disk for #4 / #5
// ---------------------------------------------------------------------------

let tmpdir: string;

const writeFile = async (relative: string, content: string): Promise<string> => {
  const full = path.join(tmpdir, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
  return full;
};

beforeEach(async () => {
  tmpdir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-pipeline-errors-')));
});

afterEach(async () => {
  try {
    await fs.rm(tmpdir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ---------------------------------------------------------------------------
// #4 Library action errors name the library file
// ---------------------------------------------------------------------------

describe('#4 errors inside imported library actions name the library file', () => {
  const MAIN_SOURCE = `styles "./test.css"
import { bad } from "./badlib.eligian"

timeline "T" in ".container" using raf {
  at 0s..2s bad("#a")
}
`;
  const LIB_SOURCE = `library badlib

action bad(selector: string) [
  selectElement(selector)
  notARealOperation(selector)
]
`;

  test('the TransformError location carries the library path and a finite length', async () => {
    await writeFile('test.css', '.container {} #a {}');
    const libPath = await writeFile('badlib.eligian', LIB_SOURCE);
    const mainPath = await writeFile('main.eligian', MAIN_SOURCE);

    const error = failureOf(
      await Effect.runPromiseExit(compile(MAIN_SOURCE, { sourceUri: mainPath }))
    );

    expect(error.message).toContain('notARealOperation');
    expect(locationOf(error).file).toBeDefined();
    expect(path.resolve(locationOf(error).file!).toLowerCase()).toBe(libPath.toLowerCase());
    expect(locationOf(error).line).toBe(5);
    expect(locationOf(error).column).toBe(3);
    expect(Number.isFinite(locationOf(error).length)).toBe(true);

    // The snippet must not be rendered against the (unrelated) main source.
    const formatted = formatError(error, MAIN_SOURCE);
    expect(formatted.message).toContain('badlib.eligian');
    expect(formatted.codeSnippet ?? '').not.toContain('bad("#a")');
  });

  test('a parse error in an imported library carries the library path, not a main-source snippet', async () => {
    const main = `styles "./test.css"
import { show } from "./lib.eligian"

timeline "T" in ".container" using raf {
  at 0s..2s show()
}
`;
    const lib = `library lib

action show() [
  selectElement("#a")
  addClass("x"
]
`;
    await writeFile('test.css', '.container {} #a {} .x {}');
    const libPath = await writeFile('lib.eligian', lib);
    const mainPath = await writeFile('main.eligian', main);

    const error = failureOf(await Effect.runPromiseExit(compile(main, { sourceUri: mainPath })));

    expect(error._tag).toBe('ParseError');
    expect(locationOf(error).file).toBeDefined();
    expect(path.resolve(locationOf(error).file!).toLowerCase()).toBe(libPath.toLowerCase());

    const formatted = formatError(error, main, mainPath);
    expect(formatted.message).toContain('lib.eligian');
    expect(formatted.codeSnippet).toBeUndefined();
  });

  test('getSourceLocation leaves `file` unset for main-program nodes and fixes the length', async () => {
    const ctx = createTestContext();
    const doc = await ctx.parse(
      'timeline "T" in ".container" using raf {\n  at 0s..2s selectElement("#a")\n}\n'
    );
    const program = doc.parseResult.value;

    const location = getSourceLocation(program.statements[0]);

    expect(location.file).toBeUndefined();
    expect(location.line).toBe(1);
    expect(location.column).toBe(1);
    expect(location.length).toBe(program.statements[0].$cstNode!.length);
  });
});

describe('formatError snippet selection by location.file', () => {
  const base = {
    _tag: 'TransformError' as const,
    kind: 'ValidationError' as const,
    message: 'boom',
  };
  const MAIN = 'line1\nline2\nline3';

  test('a location without a file is rendered against the main source', () => {
    const formatted = formatError({ ...base, location: { line: 2, column: 1, length: 1 } }, MAIN);
    expect(formatted.codeSnippet).toContain('line2');
  });

  test('a location in another file gets no main-source snippet', () => {
    const formatted = formatError(
      { ...base, location: { file: '/x/lib.eligian', line: 2, column: 1, length: 1 } },
      MAIN
    );
    expect(formatted.codeSnippet).toBeUndefined();
    expect(formatted.message).toContain('/x/lib.eligian:2:1');
  });

  test('a location in the main file (sourcePath given) keeps the snippet', () => {
    const formatted = formatError(
      { ...base, location: { file: '/x/main.eligian', line: 2, column: 1, length: 1 } },
      MAIN,
      '/x/main.eligian'
    );
    expect(formatted.codeSnippet).toContain('line2');
  });
});

// ---------------------------------------------------------------------------
// #5 compile() fails on asset errors; validator no longer skips by path heuristic
// ---------------------------------------------------------------------------

describe('#5 asset errors fail compilation regardless of the file path', () => {
  const sourceWithMissingLayout = `layout "./missing.html"
styles "./test.css"

action show() [
  selectElement("#a")
]

timeline "T" in ".container" using raf {
  at 0s..2s show()
}
`;

  test.each([
    ['a project inside a directory named "memory"', path.join('memory', 'talk', 'main.eligian')],
    ['a chapter-numbered file name', path.join('chapters', '01.eligian')],
  ])('missing layout fails compile() for %s', async (_label, relative) => {
    const mainPath = await writeFile(relative, sourceWithMissingLayout);
    await writeFile(path.join(path.dirname(relative), 'test.css'), '.container {} #a {}');

    const error = failureOf(
      await Effect.runPromiseExit(compile(sourceWithMissingLayout, { sourceUri: mainPath }))
    );

    expect(error._tag).toBe('ValidationError');
    expect(error.message).toContain('missing.html');
    expect(locationOf(error).line).toBe(1);
  });

  test('compile() fails on asset errors even when the asset validator is skipped', async () => {
    // A synthetic document URI skips the IDE asset validator, so only compile()'s
    // own check of `assets.errors` can catch the missing layout here.
    // No styles / CSS selectors: those would be resolved against the fake path too.
    const source = sourceWithMissingLayout
      .replace('styles "./test.css"\n', '')
      .replace('selectElement("#a")', 'log()')
      .replace('".container"', '"body"');
    const exit = await Effect.runPromiseExit(
      compile(source, { sourceUri: 'file:///memory/source-424242.eligian' })
    );

    const error = failureOf(exit);
    expect(error._tag).toBe('ValidationError');
    expect(error.message).toContain('missing.html');
    // Located at the `layout "./missing.html"` import statement.
    expect(locationOf(error)).toEqual({
      line: 1,
      column: 1,
      length: 'layout "./missing.html"'.length,
    });
    expect(formatError(error, source).codeSnippet).toContain('layout "./missing.html"');
  });

  test('an invalid locales file fails compile() for a project under a "memory" directory', async () => {
    const source = `locales "./locales.json"
styles "./test.css"

action show() [
  selectElement("#a")
]

timeline "T" in ".container" using raf {
  at 0s..2s show()
}
`;
    const mainPath = await writeFile(path.join('memory', 'main.eligian'), source);
    await writeFile(path.join('memory', 'test.css'), '.container {} #a {}');
    await writeFile(path.join('memory', 'locales.json'), '{ "not-a-locale": 42 }');

    const error = failureOf(await Effect.runPromiseExit(compile(source, { sourceUri: mainPath })));

    expect(error._tag).toBe('ValidationError');
    expect(locationOf(error).line).toBe(1);
  });

  describe('asset import validator', () => {
    let ctx: TestContext;

    beforeAll(() => {
      ctx = createTestContext();
    });

    const validate = async (code: string, uri: string) => {
      const doc = await ctx.parse(code, { documentUri: uri });
      await ctx.services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
      return getErrors(doc).filter(d => d.message.includes('missing.html'));
    };

    test.each([
      ['a directory named "memory"', ['memory', 'talk', 'main.eligian']],
      ['a chapter-numbered file name', ['chapters', '01.eligian']],
    ])('reports a missing layout for %s', async (_label, segments) => {
      const uri = URI.file(path.join(tmpdir, ...segments)).toString();

      const errors = await validate(sourceWithMissingLayout, uri);

      expect(errors.length).toBeGreaterThan(0);
    });

    test('still skips synthetic in-memory test documents', async () => {
      expect(await validate(sourceWithMissingLayout, 'file:///memory/source-999.eligian')).toEqual(
        []
      );
      expect(await validate(sourceWithMissingLayout, 'file:///999.eligian')).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// #11 Property chains in time expressions
// ---------------------------------------------------------------------------

describe('#11 property chain in a time expression is a located error, not a defect', () => {
  test('compile() fails with a located error', async () => {
    const source = `styles "./styles.css"
action someAction() [
  selectElement("#title")
]

timeline "T" in ".test-container" using raf {
  at $scope.x..2s someAction()
}
`;

    const exit = await Effect.runPromiseExit(compile(source));
    const error = failureOf(exit);

    // The IDE validator (TimelineValidator.checkPropertyChainInTime) now reports the chain
    // before the transformer runs, with the transformer's message and location; the
    // transformer's own TransformError is covered in validators/__tests__/timeline-validator-audit.spec.ts.
    expect(error._tag).toBe('ValidationError');
    expect(error.message).toContain('Property references are not supported in time expressions');
    expect(error.message).toContain('$scope.x');
    expect(locationOf(error).line).toBe(7);
    expect(locationOf(error).column).toBe(6);
  });
});
