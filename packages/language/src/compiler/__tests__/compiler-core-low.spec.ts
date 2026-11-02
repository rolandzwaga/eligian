/**
 * Regression tests for the compiler-core low-severity audit findings:
 * HTML import load failures, error-reporter caret column, compileToIR parity
 * with compile(), parseSource document cleanup, and hasOperation prototype names.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Effect, Exit } from 'effect';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import { formatError } from '../error-reporter.js';
import { getOperationSignature, hasOperation } from '../operations/index.js';
import { getOrCreateServices } from '../pipeline/services.js';
import { compile, compileToIR } from '../pipeline.js';
import { mediaMimeType } from '../transformers/config-builder.js';

const MAIN_TIMELINE = `styles "./styles.css"
timeline "main" in ".test-container" using raf {
  at 0s..5s [
    selectElement("#title")
  ] [
  ]
}`;

const failureOf = async (effect: Effect.Effect<unknown, any>): Promise<any> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return undefined;
  const failure = exit.cause.reasons.find(r => r._tag === 'Fail');
  return failure && failure._tag === 'Fail' ? failure.error : undefined;
};

describe('compiler-core low findings', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'eligian-core-low-'));
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('#1 HTML import load failures fail the compile', () => {
    test('a missing HTML import is a TransformError, not a $globaldata reference', async () => {
      // No sourceUri: the asset validator skips in-memory documents, so the
      // failure must be caught by the transformer.
      const source = `styles "./styles.css"
import page from "./definitely-missing.html"
timeline "main" in ".test-container" using raf {
  at 0s..5s [
    selectElement("#title")
    setElementContent(@page)
  ] [
  ]
}`;

      const error = await failureOf(compile(source));

      expect(error).toBeDefined();
      expect(error._tag).toBe('TransformError');
      expect(error.kind).toBe('InvalidImport');
      expect(error.message).toContain("'page'");
      expect(error.message).toContain('definitely-missing.html');
      expect(error.location.line).toBe(2);
    });
  });

  describe('#2 code snippet caret column', () => {
    test('caret starts under the 1-based error column', () => {
      const source = 'timeline "main" in "#app" using raf {\n}';
      // Column 20 (1-based) is the opening quote of "#app"
      const quoteColumn = source.indexOf('"#app"') + 1;
      expect(quoteColumn).toBe(20);

      const formatted = formatError(
        {
          _tag: 'ParseError',
          message: 'boom',
          location: { line: 1, column: quoteColumn, length: 6 },
        },
        source
      );

      const lines = (formatted.codeSnippet ?? '').split('\n');
      const codeIndex = lines.findIndex(l => l.startsWith('> 1 | '));
      expect(codeIndex).toBeGreaterThanOrEqual(0);
      const codeLine = lines[codeIndex];
      const caretLine = lines[codeIndex + 1];
      expect(caretLine).toBeDefined();

      const codeStart = '> 1 | '.length;
      const caretIndex = caretLine.indexOf('^');
      // Caret sits exactly under the quote and spans the 6-char token
      expect(codeLine[caretIndex]).toBe('"');
      expect(caretIndex - codeStart).toBe(quoteColumn - 1);
      expect(caretLine.trimStart()).toBe('^'.repeat(6));
    });

    test('caret at column 1 sits under the first character', () => {
      const formatted = formatError(
        { _tag: 'ParseError', message: 'x', location: { line: 1, column: 1, length: 1 } },
        'timeline'
      );
      const [codeLine, caretLine] = (formatted.codeSnippet ?? '').split('\n');
      expect(caretLine.indexOf('^')).toBe(codeLine.indexOf('timeline'));
    });
  });

  describe('#3 compileToIR matches the compile() front end', () => {
    test('rejects library files when sourceUri is given', async () => {
      const libPath = path.join(tmpRoot, 'lib.eligian');
      const libSource = 'library utils\n\naction hello() [\n  selectElement("#x")\n]\n';
      writeFileSync(libPath, libSource);

      const compileError = await failureOf(compile(libSource, { sourceUri: libPath }));
      const irError = await failureOf(compileToIR(libSource, { sourceUri: libPath }));

      expect(compileError?.message).toContain('Cannot compile library files directly');
      expect(irError?.message).toContain('Cannot compile library files directly');
    });

    test('fails on asset errors exactly like compile() when sourceUri is given', async () => {
      const dir = path.join(tmpRoot, 'assets');
      mkdirSync(dir);
      writeFileSync(path.join(dir, 'styles.css'), '.test-container {} #title {}');
      const mainPath = path.join(dir, 'main.eligian');
      const source = `layout "./no-such-layout.html"\n${MAIN_TIMELINE}`;
      writeFileSync(mainPath, source);

      const compileError = await failureOf(compile(source, { sourceUri: mainPath }));
      const irError = await failureOf(compileToIR(source, { sourceUri: mainPath }));

      expect(compileError).toBeDefined();
      expect(irError).toBeDefined();
      expect(irError._tag).toBe(compileError._tag);
    });

    test('loads assets against sourceUri (layout reaches the IR)', async () => {
      const dir = path.join(tmpRoot, 'with-layout');
      mkdirSync(dir);
      writeFileSync(path.join(dir, 'layout.html'), '<div id="app"></div>');
      writeFileSync(path.join(dir, 'styles.css'), '.test-container {} #title {}');
      const mainPath = path.join(dir, 'main.eligian');
      const source = `layout "./layout.html"\n${MAIN_TIMELINE}`;
      writeFileSync(mainPath, source);

      const ir = await Effect.runPromise(compileToIR(source, { sourceUri: mainPath }));
      const config = await Effect.runPromise(compile(source, { sourceUri: mainPath }));

      expect(config.layoutTemplate).toContain('app');
      expect(ir.config.layoutTemplate).toBe(config.layoutTemplate);
    });
  });

  describe('#4 parseSource removes its documents from the shared workspace', () => {
    const counts = () => {
      const { LangiumDocuments, IndexManager } = getOrCreateServices().shared.workspace;
      return {
        documents: LangiumDocuments.all.toArray().length,
        indexed: IndexManager.allElements().toArray().length,
      };
    };

    test('anonymous compiles do not accumulate documents or index entries', async () => {
      await Effect.runPromise(compile(MAIN_TIMELINE));
      const before = counts();

      for (let i = 0; i < 5; i++) {
        await Effect.runPromise(compile(MAIN_TIMELINE));
      }

      expect(counts()).toEqual(before);
    });

    test('compiles with a library leave neither the main nor the library document behind', async () => {
      const dir = path.join(tmpRoot, 'libs');
      mkdirSync(dir);
      writeFileSync(
        path.join(dir, 'lib.eligian'),
        'library utils\n\naction hello() [\n  selectElement("#x")\n]\n'
      );
      writeFileSync(path.join(dir, 'styles.css'), '.test-container {} #title {}');
      const mainPath = path.join(dir, 'main.eligian');
      const source = `styles "./styles.css"
import { hello } from "./lib.eligian"
timeline "main" in ".test-container" using raf {
  at 0s..5s hello()
}`;
      writeFileSync(mainPath, source);

      const before = counts();
      const config = await Effect.runPromise(compile(source, { sourceUri: mainPath }));
      expect(config.timelines.length).toBeGreaterThan(0);

      expect(counts()).toEqual(before);
    });
  });

  describe('#44 media timelines emit VideoPositionSource selector and sources', () => {
    const mediaProgram = (provider: string, source: string) => `styles "./styles.css"
action show [
  selectElement("#title")
]
timeline "t" in ".test-container" using ${provider} from "${source}" {
  at 0s..5s show()
}`;

    test('a video timeline carries its own selector and typed source', async () => {
      const config = await Effect.runPromise(compile(mediaProgram('video', './intro.mp4')));
      const [timeline] = config.timelines;

      expect(timeline.type).toBe('mediaplayer');
      expect(timeline.positionSource).toEqual({
        selector: '.test-container',
        sources: [{ src: './intro.mp4', type: 'video/mp4' }],
      });
      expect(config.timelineProviderSettings?.mediaplayer?.positionSource?.systemName).toBe(
        'VideoPositionSource'
      );
    });

    test('an audio timeline gets an audio MIME type', async () => {
      const config = await Effect.runPromise(compile(mediaProgram('audio', './track.mp3')));
      expect(config.timelines[0].positionSource?.sources).toEqual([
        { src: './track.mp3', type: 'audio/mpeg' },
      ]);
    });

    test('animation timelines get no per-timeline position source', async () => {
      const config = await Effect.runPromise(compile(MAIN_TIMELINE));
      expect(config.timelines[0].positionSource).toBeUndefined();
    });

    test.each([
      ['./a.webm', 'video', 'video/webm'],
      ['./a.MP4', 'video', 'video/mp4'],
      ['./a.mp4?v=2', 'video', 'video/mp4'],
      ['./a.xyz', 'video', 'video/xyz'],
      ['./a.xyz', 'audio', 'audio/xyz'],
      ['./noext', 'video', 'video/mp4'],
    ])('mediaMimeType(%s, %s) is %s', (src, provider, expected) => {
      expect(mediaMimeType(src, provider)).toBe(expected);
    });
  });

  describe('#6 / #10 hasOperation ignores prototype names', () => {
    test.each([
      'toString',
      'constructor',
      'hasOwnProperty',
      'valueOf',
      'isPrototypeOf',
      '__proto__',
    ])('%s is not an operation', name => {
      expect(hasOperation(name)).toBe(false);
      expect(getOperationSignature(name)).toBeUndefined();
    });

    test('real operations are still found', () => {
      expect(hasOperation('selectElement')).toBe(true);
      expect(getOperationSignature('selectElement')?.systemName).toBe('selectElement');
    });

    test('calling toString(x) yields a normal error instead of crashing', async () => {
      const source = `action f(x: string) [ toString(x) ]\n${MAIN_TIMELINE}`;

      const error = await failureOf(compile(source));

      expect(error).toBeDefined();
      const text = JSON.stringify(error);
      expect(text).not.toContain('Cannot read properties');
      expect(text).not.toContain('is not iterable');
    });

    describe('IDE validators do not crash on prototype names', () => {
      let ctx: TestContext;

      beforeAll(() => {
        ctx = createTestContext();
      });

      test.each(['toString', 'constructor', 'valueOf', 'hasOwnProperty'])(
        '%s("x") reports one Unknown operation error and no validator crash',
        async name => {
          const code = `timeline "main" in "#app" using raf {
  at 0s..5s [
    selectElement("#title")
    ${name}("x")
  ] []
}`;
          const { diagnostics } = await ctx.parseAndValidate(code);
          const messages = diagnostics.map(d => d.message);

          expect(messages.filter(m => m.includes('An error occurred during validation'))).toEqual(
            []
          );
          expect(messages.filter(m => m.includes(`Unknown operation: "${name}"`))).toHaveLength(1);
        }
      );
    });
  });
});
