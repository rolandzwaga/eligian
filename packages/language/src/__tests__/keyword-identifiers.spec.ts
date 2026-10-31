/**
 * Keyword-tolerant names (audit 2026-10-22, medium: "Many grammar keywords
 * cannot be used as identifiers, property-chain segments or object keys").
 *
 * Contextual keywords (event, from, at, in, html, string, the time units, ...)
 * are valid parameter, const, for-item and import names (`Identifier` rule).
 * Every keyword is a valid object key and property-chain segment
 * (`FeatureName` rule). Reserved keywords (if, for, const, true, ...) are still
 * rejected as names, and none of these keywords is offered as a completion
 * where a name is expected.
 */

import { Effect } from 'effect';
import { expectCompletion } from 'langium/test';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { CompletionList } from 'vscode-languageserver-protocol';
import { transformAST } from '../compiler/ast-transformer.js';
import {
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

describe('Keywords as names', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', { classes: [], ids: ['a', 'root'] });
  });

  const program = (body: string) => `
    styles "./styles.css"
    ${body}
    timeline "t" in "#root" using raf {}
  `;

  async function parseOk(code: string) {
    const result = await ctx.parseAndValidate(code);
    expect(result.document.parseResult.lexerErrors).toEqual([]);
    expect(result.document.parseResult.parserErrors.map(e => e.message)).toEqual([]);
    return result;
  }

  async function compiled(code: string) {
    const { program: ast, errors } = await parseOk(code);
    expect(errors.map(e => e.message)).toEqual([]);
    return Effect.runPromise(transformAST(ast));
  }

  function setDataProps(result: Awaited<ReturnType<typeof compiled>>, actionIndex = 0) {
    return result.config.actions[actionIndex].startOperations.find(
      op => op.systemName === 'setData'
    )?.operationData?.properties;
  }

  describe('parameter names', () => {
    test.each([
      'event',
      'object',
      'layout',
      's',
      'ms',
      'from',
      'at',
      'in',
      'html',
      'string',
      'with',
      'scope',
    ])('action f(%s) parses, resolves and compiles', async name => {
      const result = await compiled(
        program(`action f(${name}) [ selectElement("#a") setData({"v": ${name}}) ]`)
      );
      expect(setDataProps(result)).toEqual({ v: `$operationdata.${name}` });
    });

    test('event action parameter named `event`', async () => {
      const result = await compiled(
        program(
          'on event "dom-mutation" action hh(event) [ selectElement("#a") setData({"v": event}) ]\naction init [ selectElement("#a") ]'
        )
      );
      expect(JSON.stringify(result.config)).toContain('$operationData.eventArgs.0');
    });

    test('typed parameter whose name is a type keyword: f(object: object)', async () => {
      await compiled(program('action f(object: object) [ selectElement("#a") ]'));
    });
  });

  describe('const, for-loop item and import names', () => {
    test('const s = 5 folds through @s', async () => {
      const result = await compiled(
        program('const s = 5\naction f [ selectElement("#a") setData({"v": @s}) ]')
      );
      expect(setDataProps(result)).toEqual({ v: 5 });
    });

    test('for (s in items) aliases @@s', async () => {
      const result = await compiled(
        program('action f(items) [ for (s in items) { selectElement("#a") setData({"v": @@s}) } ]')
      );
      expect(JSON.stringify(result.config)).toContain('$scope.currentItem');
    });

    test('import video from a media file parses', async () => {
      const { program: ast } = await parseOk("import video from './intro.mp4'");
      expect(ast.statements[0]).toMatchObject({ $type: 'NamedImport', name: 'video' });
    });
  });

  describe('object keys and property-chain segments accept every keyword', () => {
    test('animate({ from: 1, to: 2 }, 5)', async () => {
      const result = await compiled(
        program('action f [ selectElement("#a") animate({ from: 1, to: 2 }, 5) ]')
      );
      const animate = result.config.actions[0].startOperations.find(
        op => op.systemName === 'animate'
      );
      expect(animate?.operationData?.animationProperties).toEqual({ from: 1, to: 2 });
    });

    test('reserved keywords as object keys', async () => {
      const result = await compiled(
        program(
          'action f [ selectElement("#a") setData({ if: 1, for: 2, true: 3, null: 4, on: 5, const: 6 }) ]'
        )
      );
      expect(setDataProps(result)).toEqual({ if: 1, for: 2, true: 3, null: 4, on: 5, const: 6 });
    });

    test.each([
      ['$operationdata.html', '$operationdata.html'],
      ['$scope.currentItem.string', '$scope.currentItem.string'],
      ['$scope.currentItem.at', '$scope.currentItem.at'],
      ['$globaldata.if.for.true', '$globaldata.if.for.true'],
      ['@@currentItem.from', '$scope.currentItem.from'],
      ['@@event', '$scope.event'],
    ])('%s', async (source, expected) => {
      const result = await compiled(
        program(`action f [ selectElement("#a") setData({"v": ${source}}) ]`)
      );
      expect(setDataProps(result)).toEqual({ v: expected });
    });
  });

  describe('reserved keywords stay reserved', () => {
    test.each(['if', 'for', 'const', 'true', 'null', 'action', 'on', 'timeline'])(
      'action f(%s) is a parse error',
      async name => {
        const { document } = await ctx.parseAndValidate(
          program(`action f(${name}) [ selectElement("#a") ]`)
        );
        expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
      }
    );
  });

  describe('time units keep their meaning', () => {
    test('stagger 200 ms items ... keeps ms as the delay unit', async () => {
      const { program: ast, errors } = await parseOk(`
        styles "./styles.css"
        action fadeIn(item) [ selectElement("#a") ]
        const items = ["a", "b"]
        timeline "t" in "#root" using raf {
          stagger 200 ms @items with fadeIn() for 1 s
        }
      `);
      expect(
        errors.filter(e => e.severity === DiagnosticSeverity.Error && /parse/i.test(e.message))
      ).toEqual([]);
      const timeline = ast.statements.find(s => s.$type === 'Timeline');
      expect(timeline).toMatchObject({
        events: [{ $type: 'StaggerBlock', delay: { value: 200, unit: 'ms' } }],
      });
    });

    test('a time literal followed by an operation still parses in timelines', async () => {
      await parseOk(`
        styles "./styles.css"
        action fadeIn [ selectElement("#a") ]
        timeline "t" in "#root" using raf {
          at 0 s..5 s fadeIn()
        }
      `);
    });
  });

  describe('completion does not offer keyword names', () => {
    const completion = () => expectCompletion(ctx.services.Eligian);

    test('expression position offers no name keywords', async () => {
      await completion()({
        text: `
          action f(sel) [
            setElementContent(<|>)
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          const labels = completions.items.map(i => i.label);
          for (const keyword of ['event', 'from', 'html', 'ms', 'scope', 'with']) {
            expect(labels).not.toContain(keyword);
          }
          expect(labels).toContain('sel');
        },
      });
    });

    test('object key position offers no keywords', async () => {
      await completion()({
        text: `
          action f [
            setData({ <|> })
          ]
        `,
        index: 0,
        assert: (completions: CompletionList) => {
          const labels = completions.items.map(i => i.label);
          for (const keyword of ['if', 'for', 'event', 'true', 'timeline']) {
            expect(labels).not.toContain(keyword);
          }
        },
      });
    });
  });
});
